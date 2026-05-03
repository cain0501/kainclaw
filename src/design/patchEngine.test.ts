import { describe, expect, it, vi } from "vitest";

import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  applyDesignPatch,
  buildKainClawDesignPatchPrompt,
  extractPatchNode,
  patchKainClawDesignNode,
} from "./patchEngine";

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

describe("patchEngine", () => {
  it("builds a focused patch prompt for one selector", () => {
    const prompt = buildKainClawDesignPatchPrompt({
      html: "<html><body><h1>Hello</h1></body></html>",
      selector: ".hero > h1",
      comment: "Make the title warmer.",
    });

    expect(prompt).toContain("Target selector: .hero > h1");
    expect(prompt).toContain("User comment: Make the title warmer.");
    expect(prompt).toContain("Return only one replacement HTML node.");
  });

  it("extracts the replacement node from a marked patch response", () => {
    const node = extractPatchNode(
      [
        "noise",
        "<!-- PATCH_NODE_START -->",
        '<h1 class=\"hero-title\">Hello</h1>',
        "<!-- PATCH_NODE_END -->",
      ].join("\n"),
    );

    expect(node).toBe('<h1 class=\"hero-title\">Hello</h1>');
  });

  it("throws when the patch node markers are missing", () => {
    expect(() => extractPatchNode("<h1>Hello</h1>")).toThrow(/PATCH_NODE section/i);
  });

  it("replaces the targeted outer HTML once", () => {
    const nextHtml = applyDesignPatch({
      html: "<html><body><section><h1>Hello</h1></section></body></html>",
      targetOuterHtml: "<h1>Hello</h1>",
      replacementNode: '<h1 class=\"hero-title\">Hello</h1>',
    });

    expect(nextHtml).toContain('<h1 class=\"hero-title\">Hello</h1>');
    expect(nextHtml).not.toContain("<h1>Hello</h1>");
  });

  it("throws when the target element is no longer present", () => {
    expect(() =>
      applyDesignPatch({
        html: "<html><body><section><p>Hello</p></section></body></html>",
        targetOuterHtml: "<h1>Hello</h1>",
        replacementNode: '<h1 class=\"hero-title\">Hello</h1>',
      }),
    ).toThrow(/could not be located/i);
  });

  it("runs the provider patch flow and returns updated HTML", async () => {
    const provider = createProviderReturning(
      [
        "<!-- PATCH_NODE_START -->",
        '<h1 class=\"hero-title\">Hello</h1>',
        "<!-- PATCH_NODE_END -->",
      ].join("\n"),
    );

    const result = await patchKainClawDesignNode({
      provider,
      html: "<html><body><section><h1>Hello</h1></section></body></html>",
      selector: ".hero > h1",
      comment: "Make it stronger.",
      targetOuterHtml: "<h1>Hello</h1>",
    });

    expect(result.replacementNode).toContain("hero-title");
    expect(result.html).toContain("hero-title");
  });
});
