import { describe, expect, it, vi } from "vitest";

import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  KAINCLAW_DESIGN_HTML_END,
  KAINCLAW_DESIGN_HTML_START,
  KAINCLAW_DESIGN_SLIDERS_END,
  KAINCLAW_DESIGN_SLIDERS_START,
} from "./designPrompt";
import { generateKainClawDesign } from "./designEngine";

function createProviderReturning(text: string): IProviderAdapter {
  return {
    runStep: vi.fn(async (_messages, _tools, onToken) => {
      onToken(text);
      return {
        text,
        toolCalls: [],
        done: true,
      };
    }),
  };
}

const validOutput = [
  KAINCLAW_DESIGN_HTML_START,
  "<!DOCTYPE html>",
  "<html><head><style>:root{--color-primary:#111;--spacing-base:16px;--fw-display:300;}</style></head><body><main>Design</main></body></html>",
  KAINCLAW_DESIGN_HTML_END,
  KAINCLAW_DESIGN_SLIDERS_START,
  JSON.stringify({
    sliders: [
      { id: "primary", label: "Primary", type: "color", cssVar: "--color-primary", default: "#111111" },
      { id: "spacing", label: "Spacing", type: "range", cssVar: "--spacing-base", default: 16, min: 8, max: 32, unit: "px" },
      { id: "weight", label: "Weight", type: "select", cssVar: "--fw-display", default: "300", options: ["200", "300", "400"] },
    ],
  }),
  KAINCLAW_DESIGN_SLIDERS_END,
].join("\n");

describe("designEngine", () => {
  it("builds prompts and parses a valid KainClaw Design response", async () => {
    const provider = createProviderReturning(validOutput);

    const result = await generateKainClawDesign(provider, {
      prompt: "Make a premium landing page for a robotics studio",
      outputType: "prototype",
      style: "minimal editorial",
    });

    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.sliders).toHaveLength(3);
    expect(result.systemPrompt).toContain("Output exactly two sections");
    expect(result.userPrompt).toContain("Output type: prototype");
    expect(result.userPrompt).toContain("Requested style: minimal editorial");
  });

  it("passes a reference image through as a normalized attachment", async () => {
    const provider = createProviderReturning(validOutput);
    const runStep = vi.mocked(provider.runStep);

    await generateKainClawDesign(provider, {
      prompt: "Turn this into a polished app prototype",
      outputType: "prototype",
      referenceImageDataUrl: "data:image/png;base64,QUJDRA==",
      referenceImageMimeType: "image/png",
    });

    expect(runStep).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: "user",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        }),
      ],
      [],
      expect.any(Function),
      undefined,
    );
  });

  it("throws a clear error when the provider returns an empty response", async () => {
    const provider = createProviderReturning("   ");

    await expect(
      generateKainClawDesign(provider, {
        prompt: "Design something",
        outputType: "prototype",
      }),
    ).rejects.toThrow(/empty response/i);
  });

  it("surfaces parser errors from malformed structured output", async () => {
    const provider = createProviderReturning(
      `${KAINCLAW_DESIGN_HTML_START}\n<!DOCTYPE html>\n<html></html>\n${KAINCLAW_DESIGN_HTML_END}\n${KAINCLAW_DESIGN_SLIDERS_START}\nnot-json\n${KAINCLAW_DESIGN_SLIDERS_END}`,
    );

    await expect(
      generateKainClawDesign(provider, {
        prompt: "Design something",
        outputType: "prototype",
      }),
    ).rejects.toThrow(/sliders section is not valid JSON/i);
  });
});
