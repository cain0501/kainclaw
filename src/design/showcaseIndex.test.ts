import { describe, expect, it } from "vitest";

import {
  getDesignDirectionSuggestions,
  isAmbiguousDesignPrompt,
} from "./showcaseIndex";

describe("showcaseIndex", () => {
  it("treats very short or underspecified prompts as ambiguous", () => {
    expect(isAmbiguousDesignPrompt("做个页面")).toBe(true);
    expect(isAmbiguousDesignPrompt("设计一下")).toBe(true);
    expect(
      isAmbiguousDesignPrompt("做一个高端 AI 产品官网首页原型，偏极简编辑感"),
    ).toBe(false);
  });

  it("returns curated direction suggestions per supported output type", () => {
    expect(getDesignDirectionSuggestions("prototype").length).toBeGreaterThanOrEqual(3);
    expect(getDesignDirectionSuggestions("slide").length).toBeGreaterThanOrEqual(3);
    expect(getDesignDirectionSuggestions("infographic").length).toBeGreaterThanOrEqual(3);
    expect(getDesignDirectionSuggestions("animation").length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to prototype directions for newly added output types", () => {
    const prototypeSuggestions = getDesignDirectionSuggestions("prototype");

    expect(getDesignDirectionSuggestions("social-carousel")).toBe(prototypeSuggestions);
    expect(getDesignDirectionSuggestions("email")).toBe(prototypeSuggestions);
    expect(getDesignDirectionSuggestions("landing-page")).toBe(prototypeSuggestions);
  });
});
