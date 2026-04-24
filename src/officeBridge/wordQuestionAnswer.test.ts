import { describe, expect, it } from "vitest";
import {
  buildWordQuestionPrompt,
  detectWordQuestionMode,
  finalizeWordAssistantReply,
  getWordCitationCandidateIds,
} from "./wordQuestionAnswer";

describe("wordQuestionAnswer", () => {
  it("detects summary-style questions", () => {
    expect(detectWordQuestionMode("Summarize the document")).toBe("summary");
    expect(detectWordQuestionMode("请总结这份文档")).toBe("summary");
  });

  it("detects comparison-style questions", () => {
    expect(detectWordQuestionMode("Compare section A and section B")).toBe("comparison");
    expect(detectWordQuestionMode("比较两段的差异")).toBe("comparison");
  });

  it("detects fact lookup questions", () => {
    expect(detectWordQuestionMode("What changed in the roadmap?")).toBe("fact");
    expect(detectWordQuestionMode("这个文档说了什么时间？")).toBe("fact");
  });

  it("builds a Word QA prompt with explicit citation rules", () => {
    expect(
      buildWordQuestionPrompt({
        question: "What changed in the roadmap?",
        documentContext: "[p0] Alpha roadmap update\n[p2] Release timeline moved",
      }),
    ).toContain("Cite the supporting paragraph ids inline using the exact form [pN].");
  });

  it("adds stronger comparison guidance for comparison questions", () => {
    const prompt = buildWordQuestionPrompt({
      question: "Compare section A and section B",
      documentContext: "[p0] Section A\n[p1] Section B",
    });

    expect(prompt).toContain("cite both sides of the comparison");
  });

  it("adds stronger summary guidance for summary questions", () => {
    const prompt = buildWordQuestionPrompt({
      question: "Summarize the document",
      documentContext: "[p0] Intro\n[p1] Body",
    });

    expect(prompt).toContain("summary-style questions");
  });

  it("includes selection focus without dropping paragraph-backed document context", () => {
    const prompt = buildWordQuestionPrompt({
      question: "Rewrite this selected paragraph more clearly",
      selectionContext: "[selection] Alpha roadmap update",
      documentContext: "[p4] Alpha roadmap update for Q4\n[p5] Delivery risk details",
    });

    expect(prompt).toContain("Selection Focus:");
    expect(prompt).toContain("[selection] Alpha roadmap update");
    expect(prompt).toContain("Relevant Document Context:");
    expect(prompt).toContain("[p4] Alpha roadmap update for Q4");
    expect(prompt).toContain("Treat the selection as the primary focus");
  });

  it("builds a selection-only prompt when document context is unavailable", () => {
    const prompt = buildWordQuestionPrompt({
      question: "Polish this sentence",
      selectionContext: "[selection] The launch is maybe delayed",
      documentContext: "",
    });

    expect(prompt).toContain("Selection Focus:");
    expect(prompt).not.toContain("Document Context:");
    expect(prompt).toContain("Base the answer only on the selection focus and document context above.");
  });

  it("returns the plain question when no document context is available", () => {
    expect(
      buildWordQuestionPrompt({
        question: "Summarize the document",
        documentContext: "",
      }),
    ).toBe("Summarize the document");
  });

  it("preserves replies that already contain paragraph citations", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "The roadmap changed in [p0] and [p2].",
        availableParagraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
          { id: "p2", text: "Release timing", isEmpty: false },
        ],
      }),
    ).toBe("The roadmap changed in [p0] and [p2].");
  });

  it("normalizes citation formatting variants before storing the assistant reply", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "The roadmap changed in [ P02 ] and [p0].",
        availableParagraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
          { id: "p2", text: "Release timing", isEmpty: false },
        ],
      }),
    ).toBe("The roadmap changed in [p2] and [p0].");
  });

  it("adds an unresolved-citation warning when cited ids are missing from the current snapshot", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "The roadmap changed in [p0] and [ P09 ].",
        availableParagraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
          { id: "p2", text: "Release timing", isEmpty: false },
        ],
      }),
    ).toBe(
      "The roadmap changed in [p0] and [p9].\n\n[Some paragraph citations could not be resolved in the current document snapshot: [ P09 ] -> [p9].]",
    );
  });

  it("deduplicates unresolved citations by canonical paragraph id while preserving normalization detail", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "See [ P09 ] and [p9].",
        availableParagraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
        ],
      }),
    ).toBe(
      "See [p9] and [p9].\n\n[Some paragraph citations could not be resolved in the current document snapshot: [ P09 ] -> [p9].]",
    );
  });

  it("adds a citation warning when the reply has no paragraph references", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "The roadmap changed substantially.",
      }),
    ).toBe(
      "The roadmap changed substantially.\n\n[No paragraph citations were provided in this reply.]",
    );
  });

  it("adds likely paragraph candidates when no citations were provided", () => {
    expect(
      finalizeWordAssistantReply({
        reply: "The roadmap changed substantially.",
        candidateParagraphs: [
          { id: "p0", text: "Alpha roadmap", isEmpty: false },
          { id: "p2", text: "Release timing", isEmpty: false },
          { id: "p4", text: "Budget", isEmpty: false },
          { id: "p6", text: "Ignored", isEmpty: false },
        ],
      }),
    ).toBe(
      "The roadmap changed substantially.\n\n[No paragraph citations were provided in this reply. Possible relevant paragraphs: [p0] Alpha roadmap; [p2] Release timing; [p4] Budget.]",
    );
  });

  it("extracts candidate ids from the top selected paragraphs", () => {
    expect(
      getWordCitationCandidateIds([
        { id: "p0", text: "Alpha roadmap", isEmpty: false },
        { id: "p2", text: "Release timing", isEmpty: false },
        { id: "p4", text: "Budget", isEmpty: false },
      ], 2),
    ).toEqual(["p0", "p2"]);
  });
});
