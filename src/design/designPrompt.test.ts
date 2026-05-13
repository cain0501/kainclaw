import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDesignChatSystemPrompt,
  buildDesignChatUserPrompt,
  buildKainClawDesignSystemPrompt,
  buildKainClawDesignUserPrompt,
  DESIGN_OUTPUT_TYPES,
  getDesignChatSkillRelativePath,
  getSkillWorkflow,
  normalizeDesignOutputType,
} from "./designPrompt";

describe("designPrompt", () => {
  it("normalizes unknown output types back to prototype", () => {
    expect(normalizeDesignOutputType("dashboard")).toBe("dashboard");
    expect(normalizeDesignOutputType("not-real")).toBe("prototype");
    expect(normalizeDesignOutputType(undefined)).toBe("prototype");
  });

  it("lists all supported output types", () => {
    expect(DESIGN_OUTPUT_TYPES).toHaveLength(12);
    expect(DESIGN_OUTPUT_TYPES).toContain("social-carousel");
    expect(DESIGN_OUTPUT_TYPES).toContain("landing-page");
  });

  it("adds social carousel skill constraints to the prompt", () => {
    const prompt = buildKainClawDesignUserPrompt({
      prompt: "做一组小红书图文",
      outputType: "social-carousel",
    });

    expect(prompt).toContain("Canvas width: 375px.");
    expect(prompt).toContain("9:16 portrait composition");
    expect(prompt).toContain("Do not include navigation bars");
  });

  it("adds email skill constraints to the prompt", () => {
    const prompt = buildKainClawDesignUserPrompt({
      prompt: "设计一封产品发布邮件",
      outputType: "email",
    });

    expect(prompt).toContain("Max layout width: 600px");
    expect(prompt).toContain("Do not emit <style> tags");
    expect(prompt).toContain("No JavaScript of any kind.");
  });

  it("creates disk-backed design chat skill files for every output type", () => {
    for (const outputType of DESIGN_OUTPUT_TYPES) {
      const relativePath = getDesignChatSkillRelativePath(outputType);
      expect(existsSync(path.join(process.cwd(), relativePath))).toBe(true);
    }
  });

  it("points design chat prompts at the skill workflow file instead of inlining the workflow", () => {
    const prompt = buildDesignChatUserPrompt({
      prompt: "做一组小红书图文",
      outputType: "social-carousel",
    });

    expect(prompt).toContain("## Skill Workflow File");
    expect(prompt).toContain("read the workflow file with the read_file tool");
    expect(prompt).toContain("Path: skills/social-carousel.md");
    expect(prompt).not.toContain("Produce a 3-panel social carousel as one coherent series.");
  });

  it("keeps skill file instructions on form-answer turns", () => {
    const prompt = buildDesignChatUserPrompt({
      prompt: "[form answers - discovery]\n- Tone: Editorial",
      outputType: "landing-page",
      isFormAnswerTurn: true,
    });

    expect(prompt).toContain("[form answers - discovery]");
    expect(prompt).toContain("Path: skills/landing-page.md");
    expect(prompt).toContain("glob_files with pattern \"skills/landing-page.md\" or \"skills/*.md\"");
  });

  describe("buildDesignChatUserPrompt direction picker", () => {
    it("includes direction picker guidance and all five ids on turn 1", () => {
      const prompt = buildDesignChatUserPrompt({
        prompt: "做一个产品落地页",
        outputType: "landing-page",
      });

      expect(prompt).toContain("视觉风格方向");
      expect(prompt).toContain("lifestyle-redbook");
      expect(prompt).toContain("streetwear-dark");
      expect(prompt).toContain("tech-flagship");
      expect(prompt).toContain("ecommerce-convert");
      expect(prompt).toContain("short-video");
    });

    it("injects the selected direction palette into turn 2 prompts", () => {
      const formAnswer = [
        "[form answers - discovery]",
        "- 产品名称: TestApp",
        "- 视觉风格方向: lifestyle-redbook",
      ].join("\n");
      const prompt = buildDesignChatUserPrompt({
        prompt: formAnswer,
        outputType: "landing-page",
        isFormAnswerTurn: true,
      });

      expect(prompt).toContain("oklch(97% 0.012 58)");
      expect(prompt).toContain("oklch(55% 0.20 20)");
      expect(prompt).toContain("Noto Serif SC");
    });

    it("does not inject a direction spec block when turn 2 is skipped", () => {
      const formAnswer = [
        "[form answers - discovery]",
        "- 产品名称: TestApp",
        "- 视觉风格方向: skip",
      ].join("\n");
      const prompt = buildDesignChatUserPrompt({
        prompt: formAnswer,
        outputType: "landing-page",
        isFormAnswerTurn: true,
      });

      expect(prompt).not.toContain("## Visual direction:");
    });
  });

  it("keeps fallback workflow text available in code", () => {
    const workflow = getSkillWorkflow("dashboard");

    expect(workflow).toContain("## Skill Workflow: Dashboard");
    expect(workflow).toContain("The most important number is findable in under two seconds.");
  });

  it("buildDesignChatSystemPrompt includes discovery customization guidance", () => {
    const prompt = buildDesignChatSystemPrompt();

    expect(prompt).toContain("Tailor the questions to the actual brief");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("checklist");
    expect(prompt).toContain("Embody the specialist");
  });

  it("includes structured user context when provided", () => {
    const prompt = buildKainClawDesignUserPrompt({
      prompt: "做一个 SaaS 落地页",
      outputType: "landing-page",
      userContext: "product: SaaS工具；cta: 免费试用",
    });

    expect(prompt).toContain("User context (use as content inspiration");
    expect(prompt).toContain("product: SaaS工具；cta: 免费试用");
  });

  it("injects brand context into the system prompt", () => {
    const prompt = buildKainClawDesignSystemPrompt({
      brandContext: "Brand: Linear. Design language: engineering precision.",
    });

    expect(prompt).toContain("## Brand Design System");
    expect(prompt).toContain("Brand: Linear. Design language: engineering precision.");
    expect(prompt).toContain("MANDATORY");
  });
});
