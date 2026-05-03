import { describe, expect, it } from "vitest";
import {
  augmentArtifactPrompt,
  detectArtifactPromptTarget,
  shouldDisableToolsForArtifactPrompt,
  shouldRequireInteractivePrototype,
} from "./artifactPromptAugmenter";

describe("artifactPromptAugmenter", () => {
  it("detects html artifact requests", () => {
    expect(
      detectArtifactPromptTarget("请只输出一个完整的 HTML 单文件页面原型，不要解释"),
    ).toBe("html");
  });

  it("detects natural-language html artifact creation requests", () => {
    expect(
      detectArtifactPromptTarget("做一个摄影师个人作品集首页原型，暗色背景，大图瀑布流，顶部极简导航"),
    ).toBe("html");
  });

  it("detects official-site hero requests as html artifact creation", () => {
    expect(
      detectArtifactPromptTarget("做一个高端 AI 产品官网首屏，黑白主色，带少量红色点缀，偏信息建筑风格"),
    ).toBe("html");
  });

  it("detects product intro dual-column requests as html artifact creation", () => {
    expect(
      detectArtifactPromptTarget("做一个双栏产品介绍页，左侧大标题，右侧特性卡片，极简编辑感"),
    ).toBe("html");
  });

  it("does not treat html analysis requests as artifact generation", () => {
    expect(
      detectArtifactPromptTarget("帮我分析这个首页原型的布局设计"),
    ).toBeNull();
  });

  it("detects svg artifact requests", () => {
    expect(
      detectArtifactPromptTarget("请直接输出一个完整 SVG 饼图，不要解释"),
    ).toBe("svg");
  });

  it("detects natural-language svg artifact creation requests", () => {
    expect(
      detectArtifactPromptTarget("帮我做一个销售数据柱状图"),
    ).toBe("svg");
  });

  it("does not treat svg analysis requests as artifact generation", () => {
    expect(
      detectArtifactPromptTarget("帮我分析这个饼图的配色是否合理"),
    ).toBeNull();
  });

  it("detects mermaid artifact requests", () => {
    expect(
      detectArtifactPromptTarget("请直接输出 mermaid 流程图代码块，不要解释"),
    ).toBe("mermaid");
  });

  it("detects natural-language mermaid artifact creation requests", () => {
    expect(
      detectArtifactPromptTarget("做一个用户注册流程的流程图"),
    ).toBe("mermaid");
  });

  it("does not treat mermaid analysis requests as artifact generation", () => {
    expect(
      detectArtifactPromptTarget("这个流程图的结构怎么样"),
    ).toBeNull();
  });

  it("leaves unrelated prompts untouched", () => {
    const prompt = "帮我总结一下这个页面的优点";
    expect(detectArtifactPromptTarget(prompt)).toBeNull();
    expect(augmentArtifactPrompt(prompt)).toBe(prompt);
  });

  it("augments html artifact prompts with static-visibility constraints", () => {
    const augmented = augmentArtifactPrompt(
      "请只输出一个完整的 HTML 单文件页面原型，不要解释",
    );

    expect(augmented).toContain("<!DOCTYPE html>");
    expect(augmented).toContain("Do not add markdown fences.");
    expect(augmented).toContain("Do not use reveal animations.");
    expect(augmented).toContain("Do not use IntersectionObserver.");
  });

  it("adds interactive constraints for clickable prototype requests", () => {
    const prompt = "请输出一个完整的 HTML 单文件可点击交互原型";
    expect(shouldRequireInteractivePrototype(prompt)).toBe(true);

    const augmented = augmentArtifactPrompt(prompt);
    expect(augmented).toContain("clickable prototype");
    expect(augmented).toContain("vanilla JavaScript");
    expect(augmented).toContain("tabs, modal dialogs, accordions, step switches, or filters");
  });

  it("augments svg requests with svg-only constraints", () => {
    const augmented = augmentArtifactPrompt("请直接输出一个完整 SVG 饼图，不要解释");

    expect(augmented).toContain("Return only one complete SVG document.");
    expect(augmented).toContain("Include a valid viewBox");
  });

  it("augments mermaid requests with mermaid-only constraints", () => {
    const augmented = augmentArtifactPrompt("请直接输出 mermaid 流程图代码块，不要解释");

    expect(augmented).toContain("Return only Mermaid diagram source.");
    expect(augmented).toContain("Do not wrap the diagram in HTML.");
  });

  it("disables tools for html artifact prompts only", () => {
    expect(
      shouldDisableToolsForArtifactPrompt("做一个双栏产品介绍页，左侧大标题，右侧特性卡片，极简编辑感"),
    ).toBe(true);
    expect(
      shouldDisableToolsForArtifactPrompt("帮我分析这个首页原型的布局设计"),
    ).toBe(false);
  });
  it("detects english html prompts that request a KainClaw Tweaks bridge", () => {
    const prompt = [
      "Please generate a single-file HTML page and embed a KainClaw Tweaks bridge.",
      "On load, call window.parent.postMessage({ type: '__edit_mode_available' }, '*').",
      "Listen for __activate_edit_mode and __deactivate_edit_mode.",
      "Keep the result as a complete previewable landing page.",
    ].join(" ");

    expect(detectArtifactPromptTarget(prompt)).toBe("html");
    expect(shouldDisableToolsForArtifactPrompt(prompt)).toBe(true);
    expect(augmentArtifactPrompt(prompt)).toContain("[Internal artifact output contract]");
  });

});
