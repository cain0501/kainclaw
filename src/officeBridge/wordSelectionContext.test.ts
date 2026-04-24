import { describe, expect, it } from "vitest";
import {
  buildWordSelectionContext,
  buildWordSelectionState,
  formatWordSelectionSummary,
  truncateWordSelectionPreview,
} from "./wordSelectionContext";

describe("wordSelectionContext", () => {
  it("builds an empty selection state when text is blank", () => {
    expect(buildWordSelectionState("   ")).toEqual({
      hasSelection: false,
      text: "",
      charCount: 0,
      estimatedTokens: 0,
    });
  });

  it("builds a normalized selection state for non-empty text", () => {
    expect(buildWordSelectionState(" Alpha roadmap ")).toEqual({
      hasSelection: true,
      text: "Alpha roadmap",
      charCount: 13,
      estimatedTokens: 4,
    });
  });

  it("formats a selection-only context block", () => {
    expect(buildWordSelectionContext("Alpha roadmap")).toBe(
      "[selection] Alpha roadmap",
    );
  });

  it("formats selection summary stats", () => {
    expect(
      formatWordSelectionSummary({
        hasSelection: true,
        text: "Alpha roadmap",
        charCount: 13,
        estimatedTokens: 4,
      }),
    ).toBe("13 chars · ~4 tokens");
  });

  it("truncates selection preview cleanly", () => {
    expect(
      truncateWordSelectionPreview(
        "Alpha roadmap update with a much longer explanation",
        20,
      ),
    ).toBe("Alpha roadmap updat…");
  });
});
