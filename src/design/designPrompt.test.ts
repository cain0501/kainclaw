import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDesignChatSystemPrompt,
  buildDesignChatUserPrompt,
  buildKainClawDesignSystemPrompt,
  buildKainClawDesignUserPrompt,
  DESIGN_OUTPUT_TYPES,
  getDesignChatSkillEntryRelativePath,
  getDesignChatSkillRelativePath,
  getSkillWorkflow,
  normalizeDesignOutputType,
} from "./designPrompt";
import { DESIGN_DIRECTIONS, renderDirectionFormBody } from "./directions";

describe("designPrompt", () => {
  it("exposes the approved Chinese direction ids", () => {
    expect(DESIGN_DIRECTIONS.map(direction => direction.id)).toEqual([
      "lifestyle-redbook",
      "streetwear-dark",
      "tech-flagship",
      "ecommerce-convert",
      "short-video",
    ]);
  });

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
    expect(prompt).toContain(`Path: ${getDesignChatSkillEntryRelativePath("social-carousel")}`);
    expect(prompt).not.toContain("Produce a 3-panel social carousel as one coherent series.");
  });

  it("keeps skill file instructions on form-answer turns", () => {
    const prompt = buildDesignChatUserPrompt({
      prompt: "[form answers - discovery]\n- Tone: Editorial",
      outputType: "landing-page",
      isFormAnswerTurn: true,
    });

    expect(prompt).toContain("[form answers - discovery]");
    expect(prompt).toContain(`Path: ${getDesignChatSkillEntryRelativePath("landing-page")}`);
    expect(prompt).toContain("skills/landing-page/*");
  });

  it("keeps skill file instructions on non-discovery follow-up form turns", () => {
    const prompt = buildDesignChatUserPrompt({
      prompt: "[form answers - direction]\n- Direction: lifestyle-redbook",
      outputType: "landing-page",
      isFormAnswerTurn: true,
    });

    expect(prompt).toContain("[form answers - direction]");
    expect(prompt).toContain(`Path: ${getDesignChatSkillEntryRelativePath("landing-page")}`);
    expect(prompt).toContain("skills/landing-page/*");
  });

  describe("buildDesignChatUserPrompt direction picker", () => {
    it("includes direction picker guidance and all five ids on turn 1", () => {
      const prompt = buildDesignChatUserPrompt({
        prompt: "做一个产品落地页",
        outputType: "landing-page",
      });

      expect(prompt).toContain("direction-cards");
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
        "- direction: lifestyle-redbook",
      ].join("\n");
      const prompt = buildDesignChatUserPrompt({
        prompt: formAnswer,
        outputType: "landing-page",
        isFormAnswerTurn: true,
      });

      expect(prompt).toContain("oklch(63% 0.18 29)");
      expect(prompt).toContain("oklch(98% 0.012 48)");
      expect(prompt).toContain("Noto Serif SC");
    });

    it("injects the streetwear dark palette into turn 2 prompts", () => {
      const formAnswer = [
        "[form answers - discovery]",
        "- 产品名称: DropLab",
        "- direction: streetwear-dark",
      ].join("\n");
      const prompt = buildDesignChatUserPrompt({
        prompt: formAnswer,
        outputType: "landing-page",
        isFormAnswerTurn: true,
      });

      expect(prompt).toContain("oklch(13% 0.018 145)");
      expect(prompt).toContain("oklch(83% 0.26 145)");
      expect(prompt).toContain("Streetwear Dark");
    });

    it("does not inject a direction spec block when turn 2 is skipped", () => {
      const formAnswer = [
        "[form answers - discovery]",
        "- 产品名称: TestApp",
        "- direction: skip",
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

    expect(prompt).toContain("Always respond in the same language as the user's latest input.");
    expect(prompt).toContain("Tailor the questions to the actual brief");
    expect(prompt).toContain("If a critical gap still blocks a good result, ask one narrower follow-up question-form");
    expect(prompt).toContain("first tool call is TodoWrite");
    expect(prompt).toContain("Read the skill entry file");
    expect(prompt).toContain("strict order");
    expect(prompt).toContain("Step 10. Output the finished HTML.");
    expect(prompt).toContain("output/index.html");
    expect(prompt).toContain("checklist");
    expect(prompt).toContain("Embody the specialist");
  });

  it("includes localized direction form fields for renderer fallback", () => {
    const body = renderDirectionFormBody();

    expect(body).toContain('"zhDescription"');
    expect(body).toContain('"zhLabel": "设计风格方向"');
    expect(body).toContain('"zhLabel": "强调色覆盖（可选）"');
    expect(body).toContain('"zhPlaceholder": "例如：用苔藓绿替代珊瑚红，或者这个品牌不要荧光色"');
    expect(body).toContain('"zhSummary": "珊瑚红 · 生活方式 · 精致亲和"');
    expect(body).toContain('"zhSummary": "黑底 · 荧光绿 · 街头张力"');
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
