import { describe, expect, it, vi } from "vitest";

import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  applyDesignPatch,
  buildKainClawDesignPatchPrompt,
  extractPatchNode,
  patchDesignImageNode,
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

  it("tolerates runtime-vs-stored outerHTML casing differences for the same target node", () => {
    const nextHtml = applyDesignPatch({
      html: '<html><body><main class="page"><section class="hero"><h1 class="headline">Hello</h1></section></main></body></html>',
      targetOuterHtml: '<H1 class="headline">Hello</H1>',
      replacementNode: '<h1 class="headline accent">Hello</h1>',
    });

    expect(nextHtml).toContain('<h1 class="headline accent">Hello</h1>');
    expect(nextHtml).not.toContain('<h1 class="headline">Hello</h1>');
  });

  // ── selector-based replacement ─────────────────────────────────────────

  it("replaces target element via CSS selector path (ignores outerHTML)", () => {
    const html = `<html><body><main class="page"><section class="hero"><div class="hero-copy"><p>Old text</p></div></section></main></body></html>`;
    const result = applyDesignPatch({
      html,
      targetOuterHtml: "irrelevant-will-not-match",
      replacementNode: '<div class="hero-copy"><p>New text</p></div>',
      selector: "BODY > MAIN.PAGE > SECTION.HERO > DIV.HERO-COPY",
    });
    expect(result).toContain("New text");
    expect(result).not.toContain("Old text");
  });

  it("selector match works with multi-class segments", () => {
    const html = `<html><body><div class="hero left"><span class="title accent">Hello</span></div></body></html>`;
    const result = applyDesignPatch({
      html,
      targetOuterHtml: "",
      replacementNode: '<span class="title accent">World</span>',
      selector: "BODY > DIV.HERO.LEFT > SPAN.TITLE.ACCENT",
    });
    expect(result).toContain("World");
    expect(result).not.toContain("Hello");
  });

  it("falls back to outerHTML matching when selector yields no match", () => {
    const html = `<html><body><h1>Hello</h1></body></html>`;
    const result = applyDesignPatch({
      html,
      targetOuterHtml: "<h1>Hello</h1>",
      replacementNode: "<h1>World</h1>",
      selector: "BODY > DIV.NONEXISTENT > H1",
    });
    expect(result).toContain("World");
  });

  it("selector handles nested same-tag elements correctly", () => {
    const html = `<html><body><div class="outer"><div class="inner"><p>Target</p></div></div></body></html>`;
    const result = applyDesignPatch({
      html,
      targetOuterHtml: "",
      replacementNode: "<p>Replaced</p>",
      selector: "BODY > DIV.OUTER > DIV.INNER > P",
    });
    expect(result).toContain("Replaced");
    expect(result).not.toContain("Target");
  });

  it("selector match supports id segments from the design bridge payload", () => {
    const html = `<html><body><section id="workflow"><div class="container"><div><img src="old.png" alt="workflow"></div></div></section></body></html>`;
    const result = patchDesignImageNode({
      html,
      selector: "SECTION#WORKFLOW > DIV.CONTAINER > DIV > IMG",
      targetOuterHtml: '<img src="old.png" alt="workflow">',
      imageUrl: "new.png",
    });
    expect(result).toContain('src="new.png"');
    expect(result).not.toContain('src="old.png"');
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
