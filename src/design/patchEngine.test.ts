import { describe, expect, it, vi } from "vitest";

import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  applyDesignPatch,
  buildKainClawDesignPatchPrompt,
  extractDirectTextReplacement,
  extractPatchNode,
  patchDesignImageNode,
  patchDesignTextNode,
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
      targetOuterHtml: "<h1>Hello</h1>",
    });

    expect(prompt).toContain("Target selector: .hero > h1");
    expect(prompt).toContain("Current target node outer HTML: <h1>Hello</h1>");
    expect(prompt).toContain("User comment: Make the title warmer.");
    expect(prompt).toContain("Return only one replacement HTML node.");
    expect(prompt).toContain("Do not return the original node unchanged.");
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

  it("extracts a deterministic text replacement target from simple rewrite comments", () => {
    expect(extractDirectTextReplacement("改成120+")).toBe("120+");
    expect(extractDirectTextReplacement("把这个数字改为 95%")).toBe("95%");
    expect(extractDirectTextReplacement("replace with Premium")).toBeNull();
    expect(extractDirectTextReplacement("换个颜色")).toBeNull();
    expect(extractDirectTextReplacement("Make the title warmer.")).toBeNull();
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

  it("respects nth-of-type selectors so repeated metric values do not patch the first sibling", () => {
    const html = `<html><body><section class="stats"><div class="card"><strong>88</strong><span>客户复购与推荐率</span></div><div class="card"><strong>320+</strong><span>项目交付</span></div><div class="card"><strong>96%</strong><span>满意度</span></div></section></body></html>`;
    const result = applyDesignPatch({
      html,
      targetOuterHtml: "<strong>320+</strong>",
      replacementNode: "<strong>100</strong>",
      selector: "BODY > SECTION.STATS > DIV.CARD:nth-of-type(2) > STRONG:nth-of-type(1)",
    });

    expect(result).toContain("<strong>88</strong>");
    expect(result).toContain("<strong>100</strong>");
    expect(result).toContain("<strong>96%</strong>");
    expect(result).not.toContain("<strong>320+</strong>");
  });

  it("patches plain text nodes deterministically without going through model rewrite output", () => {
    const html = `<html><body><section class="stats"><div class="card"><strong>88</strong></div><div class="card"><strong>110+</strong></div></section></body></html>`;
    const result = patchDesignTextNode({
      html,
      selector: "BODY > SECTION.STATS > DIV.CARD:nth-of-type(2) > STRONG:nth-of-type(1)",
      targetOuterHtml: "<strong>110+</strong>",
      nextText: "120+",
    });

    expect(result).toContain("<strong>88</strong>");
    expect(result).toContain("<strong>120+</strong>");
    expect(result).not.toContain("<strong>110+</strong>");
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

  it("patches background-image styles for non-img design nodes", () => {
    const html = `<html><body><section class="hero"><div class="hero-media" style="background-image:url('old.png');background-size:cover"></div></section></body></html>`;
    const result = patchDesignImageNode({
      html,
      selector: "BODY > SECTION.HERO > DIV.HERO-MEDIA",
      targetOuterHtml: `<div class="hero-media" style="background-image:url('old.png');background-size:cover"></div>`,
      imageUrl: "new.png",
    });

    expect(result).toContain("background-image:url('new.png')");
    expect(result).not.toContain("background-image:url('old.png')");
  });

  it("adds a background-image style when replacing a non-img node without an existing style attribute", () => {
    const html = `<html><body><section class="hero"><div class="hero-media"></div></section></body></html>`;
    const result = patchDesignImageNode({
      html,
      selector: "BODY > SECTION.HERO > DIV.HERO-MEDIA",
      targetOuterHtml: `<div class="hero-media"></div>`,
      imageUrl: "new.png",
    });

    expect(result).toContain(`style="background-image:url('new.png')"`);
  });

  it("keeps nth-of-type sibling counting scoped to the current parent when replacing nested background-image blocks", () => {
    const html = `<html><body><section id="about"><div class="container"><div class="about-grid"><div class="card portrait-card"><div class="portrait-image" style="background-image:url('wrong.png')"></div></div></div><div class="about-grid"><div class="card portrait-card"><div class="portrait-image" style="background-image:url('target.png')"></div></div></div></div></section></body></html>`;
    const result = patchDesignImageNode({
      html,
      selector: "SECTION#ABOUT > DIV.CONTAINER > DIV.ABOUT-GRID:nth-of-type(2) > DIV.CARD.PORTRAIT-CARD:nth-of-type(1) > DIV.PORTRAIT-IMAGE",
      targetOuterHtml: `<div class="portrait-image" style="background-image:url('target.png')"></div>`,
      imageUrl: "new.png",
    });

    expect(result).toContain("background-image:url('wrong.png')");
    expect(result).toContain("background-image:url('new.png')");
    expect(result).not.toContain("background-image:url('target.png')");
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

  it("rejects provider patch output when the replacement node is unchanged", async () => {
    const provider = createProviderReturning(
      [
        "<!-- PATCH_NODE_START -->",
        "<a class=\"btn btn-primary\" href=\"#contact\">立即预约拍摄</a>",
        "<!-- PATCH_NODE_END -->",
      ].join("\n"),
    );

    await expect(
      patchKainClawDesignNode({
        provider,
        html: "<html><body><div class=\"hero-actions\"><a class=\"btn btn-primary\" href=\"#contact\">立即预约拍摄</a><a class=\"btn btn-secondary\" href=\"#portfolio\">查看作品集</a></div></body></html>",
        selector: "BODY > DIV.HERO-ACTIONS > A.BTN.BTN-PRIMARY:nth-of-type(1)",
        comment: "换个颜色",
        targetOuterHtml: "<a class=\"btn btn-primary\" href=\"#contact\">立即预约拍摄</a>",
      }),
    ).rejects.toThrow(/original node unchanged/i);
  });

  it("rejects replacement node that differs only in class order or whitespace", async () => {
    const provider = createProviderReturning(
      [
        "<!-- PATCH_NODE_START -->",
        "<a  class=\"btn-primary  btn\"  href=\"#contact\">立即预约拍摄</a>",
        "<!-- PATCH_NODE_END -->",
      ].join("\n"),
    );

    await expect(
      patchKainClawDesignNode({
        provider,
        html: "<html><body><div class=\"hero-actions\"><a class=\"btn btn-primary\" href=\"#contact\">立即预约拍摄</a></div></body></html>",
        selector: "BODY > DIV.HERO-ACTIONS > A.BTN.BTN-PRIMARY:nth-of-type(1)",
        comment: "换个颜色",
        targetOuterHtml: "<a class=\"btn btn-primary\" href=\"#contact\">立即预约拍摄</a>",
      }),
    ).rejects.toThrow(/original node unchanged/i);
  });
});
