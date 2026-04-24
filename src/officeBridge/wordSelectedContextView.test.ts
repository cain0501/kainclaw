import { describe, expect, it } from "vitest";
import {
  formatWordSelectedContextSummary,
  formatWordCandidateParagraphSummary,
  mapWordSelectedContextPreviews,
  truncateWordParagraphPreview,
} from "./wordSelectedContextView";

describe("wordSelectedContextView", () => {
  it("truncates long paragraph previews cleanly", () => {
    expect(
      truncateWordParagraphPreview(
        "Alpha roadmap update with a much longer explanation that should be shortened",
        20,
      ),
    ).toBe("Alpha roadmap updat…");
  });

  it("formats an empty selected context summary", () => {
    expect(formatWordSelectedContextSummary(null)).toBe(
      "No scoped context selected yet",
    );
  });

  it("formats selected context stats including truncation", () => {
    expect(
      formatWordSelectedContextSummary({
        paragraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
          { id: "p2", text: "Release timing", isEmpty: false },
        ],
        contextText: "[p0] Alpha roadmap\n[p2] Release timing",
        estimatedTokens: 42,
        truncated: true,
      }),
    ).toBe("2 paragraphs · ~42 tokens · truncated");
  });

  it("maps selected paragraphs into id + preview pairs", () => {
    expect(
      mapWordSelectedContextPreviews([
        { id: "p0", text: "Alpha roadmap update", isEmpty: false },
        { id: "p2", text: "Release timing", isEmpty: false },
      ]),
    ).toEqual([
      { id: "p0", preview: "Alpha roadmap update" },
      { id: "p2", preview: "Release timing" },
    ]);
  });

  it("formats candidate paragraph summaries for fallback messaging", () => {
    expect(
      formatWordCandidateParagraphSummary([
        { id: "p0", text: "Alpha roadmap update", isEmpty: false },
        { id: "p2", text: "Release timing", isEmpty: false },
      ]),
    ).toBe("[p0] Alpha roadmap update; [p2] Release timing");
  });
});
