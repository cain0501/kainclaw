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

  it("returns three direction suggestions per supported output type", () => {
    expect(getDesignDirectionSuggestions("prototype")).toHaveLength(3);
    expect(getDesignDirectionSuggestions("slide")).toHaveLength(3);
    expect(getDesignDirectionSuggestions("infographic")).toHaveLength(3);
    expect(getDesignDirectionSuggestions("animation")).toHaveLength(3);
  });
});
