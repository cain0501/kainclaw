import { describe, expect, it } from "vitest";

import {
  buildKainClawDesignSystemPrompt,
  buildKainClawDesignUserPrompt,
  DESIGN_OUTPUT_TYPES,
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
