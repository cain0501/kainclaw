import { describe, expect, it } from "vitest";
import {
  buildWordParagraphIndex,
  buildSelectedWordDocumentContextResult,
  buildSelectedWordDocumentContext,
  buildWordDocumentContext,
  buildWordDocumentSnapshot,
  extractWordParagraphCitationRefs,
  getWordParagraphRelevanceScore,
  estimateWordParagraphContextTokens,
  extractWordParagraphCitations,
  normalizeWordReplyParagraphCitations,
  selectRelevantWordParagraphs,
  splitWordReplyIntoSegments,
} from "./wordDocumentContext";

describe("wordDocumentContext", () => {
  it("builds a normalized document snapshot with paragraph ids", () => {
    expect(
      buildWordDocumentSnapshot([
        { text: "Heading", style: "Heading 1" },
        { text: "  " },
        { text: "Body paragraph", style: "Normal" },
      ]),
    ).toEqual({
      paragraphs: [
        {
          id: "p0",
          text: "Heading",
          style: "Heading 1",
          isEmpty: false,
        },
        {
          id: "p1",
          text: "  ",
          style: undefined,
          isEmpty: true,
        },
        {
          id: "p2",
          text: "Body paragraph",
          style: "Normal",
          isEmpty: false,
        },
      ],
      fullText: "Heading\n  \nBody paragraph",
      charCount: 23,
    });
  });

  it("builds document context with paragraph citations and skips empty paragraphs", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Heading" },
      { text: "" },
      { text: "Body paragraph" },
    ]);

    expect(buildWordDocumentContext(snapshot)).toBe(
      "[p0] Heading\n[p2] Body paragraph",
    );
  });

  it("extracts unique cited paragraph ids from an assistant reply", () => {
    expect(
      extractWordParagraphCitations(
        "Summary from [p0] and [p2], then [p2] again.",
      ),
    ).toEqual(["p0", "p2"]);
  });

  it("normalizes common citation formatting variants to canonical paragraph ids", () => {
    expect(
      normalizeWordReplyParagraphCitations(
        "Use [P02], [ p2 ], and [ P 000 ] as references.",
      ),
    ).toBe("Use [p2], [p2], and [p0] as references.");
  });

  it("extracts citation refs with raw and canonical forms", () => {
    expect(
      extractWordParagraphCitationRefs("See [ P02 ] and [p1]."),
    ).toEqual([
      {
        raw: "[ P02 ]",
        paragraphId: "p2",
        canonical: "[p2]",
        index: 4,
        wasNormalized: true,
      },
      {
        raw: "[p1]",
        paragraphId: "p1",
        canonical: "[p1]",
        index: 16,
        wasNormalized: false,
      },
    ]);
  });

  it("splits a reply into text and citation segments", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes" },
      { text: "Budget forecast for Q4" },
      { text: "Alpha roadmap and milestones" },
    ]);

    expect(
      splitWordReplyIntoSegments(
        "See [p0], compare with [p2], then [p9].",
        buildWordParagraphIndex(snapshot),
      ),
    ).toEqual([
      { type: "text", text: "See " },
      {
        type: "citation",
        paragraphId: "p0",
        raw: "[p0]",
        isKnown: true,
        previewText: "Alpha release notes",
      },
      { type: "text", text: ", compare with " },
      {
        type: "citation",
        paragraphId: "p2",
        raw: "[p2]",
        isKnown: true,
        previewText: "Alpha roadmap and milestones",
      },
      { type: "text", text: ", then " },
      {
        type: "citation",
        paragraphId: "p9",
        raw: "[p9]",
        isKnown: false,
        previewText: undefined,
      },
      { type: "text", text: "." },
    ]);
  });

  it("recognizes citation variants with uppercase letters and padding in reply segments", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes" },
      { text: "Budget forecast for Q4" },
      { text: "Alpha roadmap and milestones" },
    ]);

    expect(
      splitWordReplyIntoSegments(
        "See [ P02 ] and [p1].",
        buildWordParagraphIndex(snapshot),
      ),
    ).toEqual([
      { type: "text", text: "See " },
      {
        type: "citation",
        paragraphId: "p2",
        raw: "[ P02 ]",
        isKnown: true,
        previewText: "Alpha roadmap and milestones",
      },
      { type: "text", text: " and " },
      {
        type: "citation",
        paragraphId: "p1",
        raw: "[p1]",
        isKnown: true,
        previewText: "Budget forecast for Q4",
      },
      { type: "text", text: "." },
    ]);
  });

  it("selects the most relevant paragraphs for a query and preserves document order", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes", style: "Heading 1" },
      { text: "Budget forecast for Q4" },
      { text: "Alpha roadmap and milestones" },
      { text: "Team lunch menu" },
    ]);

    expect(
      selectRelevantWordParagraphs(snapshot, "alpha roadmap", 2),
    ).toEqual([
      snapshot.paragraphs[0],
      snapshot.paragraphs[2],
    ]);
  });

  it("boosts heading-style paragraphs when relevance is otherwise similar", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap summary", style: "Heading 1" },
      { text: "Roadmap summary", style: "Normal" },
    ]);

    expect(
      getWordParagraphRelevanceScore(snapshot.paragraphs[0]!, "roadmap summary"),
    ).toBeGreaterThan(
      getWordParagraphRelevanceScore(snapshot.paragraphs[1]!, "roadmap summary"),
    );
  });

  it("builds a selected document context from the most relevant paragraphs", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes" },
      { text: "Budget forecast for Q4" },
      { text: "Alpha roadmap and milestones" },
    ]);

    expect(
      buildSelectedWordDocumentContext(snapshot, "budget", 2),
    ).toBe("[p0] Alpha release notes\n[p1] Budget forecast for Q4");
  });

  it("estimates paragraph context tokens from the cited text form", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes" },
    ]);

    expect(estimateWordParagraphContextTokens(snapshot.paragraphs[0]!)).toBe(6);
  });

  it("caps selected context by token budget while preserving selected order", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Alpha release notes and launch checklist" },
      { text: "Budget forecast for Q4 and staffing plans" },
      { text: "Alpha roadmap and milestones for the next release" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "alpha", {
      maxParagraphs: 3,
      maxTokens: 20,
    });

    expect(result).toEqual({
      paragraphs: [snapshot.paragraphs[0]!],
      contextText: "[p0] Alpha release notes and launch checklist",
      estimatedTokens: estimateWordParagraphContextTokens(snapshot.paragraphs[0]!),
      truncated: true,
    });
  });

  it("can carry neighboring paragraphs into the selected context", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Budget forecast for Q4 and staffing plans" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "roadmap", {
      maxParagraphs: 3,
      maxTokens: 100,
      includeNeighbors: true,
      neighborWindow: 1,
    });

    expect(result.paragraphs).toEqual([
      snapshot.paragraphs[0],
      snapshot.paragraphs[1],
      snapshot.paragraphs[2],
    ]);
    expect(result.contextText).toBe(
      "[p0] Roadmap overview\n[p1] Alpha release notes and launch checklist\n[p2] Budget forecast for Q4 and staffing plans",
    );
  });

  it("enables neighbor carry-in automatically for summary questions", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Budget forecast for Q4 and staffing plans" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "summarize roadmap", {
      maxParagraphs: 3,
      maxTokens: 100,
      questionMode: "summary",
    });

    expect(result.paragraphs).toEqual([
      snapshot.paragraphs[0],
      snapshot.paragraphs[1],
      snapshot.paragraphs[2],
    ]);
  });

  it("pulls same-section body paragraphs after a heading hit for summary questions", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Delivery milestones and owners" },
      { text: "Budget details", style: "Heading 1" },
      { text: "Q4 staffing plans" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "summarize roadmap", {
      maxParagraphs: 4,
      maxTokens: 200,
      questionMode: "summary",
    });

    expect(result.paragraphs).toEqual([
      snapshot.paragraphs[0],
      snapshot.paragraphs[1],
      snapshot.paragraphs[2],
      snapshot.paragraphs[3],
    ]);
  });

  it("keeps fact questions more focused by default", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Budget forecast for Q4 and staffing plans" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "what changed in roadmap", {
      maxParagraphs: 1,
      maxTokens: 100,
      questionMode: "fact",
    });

    expect(result.paragraphs).toEqual([
      snapshot.paragraphs[0],
    ]);
  });

  it("does not pull same-section body paragraphs for fact questions by default", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Delivery milestones and owners" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "what is in the roadmap overview", {
      maxParagraphs: 1,
      maxTokens: 200,
      questionMode: "fact",
    });

    expect(result.paragraphs).toEqual([
      snapshot.paragraphs[0],
    ]);
  });

  it("respects token budget even when neighbor carry-in is enabled", () => {
    const snapshot = buildWordDocumentSnapshot([
      { text: "Roadmap overview", style: "Heading 1" },
      { text: "Alpha release notes and launch checklist" },
      { text: "Budget forecast for Q4 and staffing plans" },
    ]);

    const result = buildSelectedWordDocumentContextResult(snapshot, "roadmap", {
      maxParagraphs: 3,
      maxTokens: estimateWordParagraphContextTokens(snapshot.paragraphs[0]!),
      includeNeighbors: true,
      neighborWindow: 1,
    });

    expect(result.paragraphs).toEqual([snapshot.paragraphs[0]]);
    expect(result.truncated).toBe(true);
  });
});
