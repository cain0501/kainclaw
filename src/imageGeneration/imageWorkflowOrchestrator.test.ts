import { describe, expect, it, vi } from "vitest";
import type { IProviderAdapter, ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT,
  orchestrateImageWorkflow,
  providerSupportsImageWorkflowOrchestration,
} from "./imageWorkflowOrchestrator";

describe("imageWorkflowOrchestrator", () => {
  it("allows text-only orchestration for any current chat provider", () => {
    expect(providerSupportsImageWorkflowOrchestration({
      type: "claude-cli",
      model: "sonnet",
    } satisfies ProviderConfig, false)).toBe(true);
  });

  it("requires image-understanding support when reference images are present", () => {
    expect(providerSupportsImageWorkflowOrchestration({
      type: "openai-compatible",
      apiKey: "secret",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
    } satisfies ProviderConfig, true)).toBe(false);
    expect(providerSupportsImageWorkflowOrchestration({
      type: "anthropic",
      apiKey: "secret",
      model: "claude-sonnet-4-6",
    } satisfies ProviderConfig, true)).toBe(true);
  });

  it("parses a structured workflow plan from the provider response", async () => {
    const provider: IProviderAdapter = {
      runStep: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          mode: "edit",
          intentSummary: "Refine the bridal portrait with stronger floral styling.",
          finalPrompt: "Elegant bridal portrait by the lake, preserve pose, add dense white floral accents, softer window-like light, cleaner realistic background, editorial wedding photography, 85mm lens",
          materialKeywords: ["white floral arch", "bridal bouquet detail", "lakefront wedding"],
          nextStepNote: "Add one more floral reference image if you want stronger petal detail before editing.",
        }),
        toolCalls: [],
        done: true,
      }),
    };

    await expect(orchestrateImageWorkflow({
      provider,
      prompt: "把花艺增强一些，背景更真实",
      referenceImages: [{
        dataUrl: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        name: "base.png",
      }],
    })).resolves.toEqual({
      mode: "edit",
      intentSummary: "Refine the bridal portrait with stronger floral styling.",
      finalPrompt: "Elegant bridal portrait by the lake, preserve pose, add dense white floral accents, softer window-like light, cleaner realistic background, editorial wedding photography, 85mm lens",
      materialKeywords: ["white floral arch", "bridal bouquet detail", "lakefront wedding"],
      nextStepNote: "Add one more floral reference image if you want stronger petal detail before editing.",
    });

    expect(provider.runStep).toHaveBeenCalledWith(
      [{
        role: "user",
        content: expect.stringContaining("User goal: 把花艺增强一些，背景更真实"),
        attachments: [{ data: "aGVsbG8=", mimeType: "image/png" }],
      }],
      [],
      expect.any(Function),
      undefined,
    );
    expect(IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT).toContain("Return JSON only");
  });
});
