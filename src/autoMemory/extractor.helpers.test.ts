import { describe, expect, it } from "vitest";
import { extractJsonPayload, normalizeSuggestion } from "./extractor";

describe("autoMemory extractor helpers", () => {
  it("extracts JSON payloads from raw text or fenced json blocks", () => {
    expect(extractJsonPayload('{"memories":[]}')).toEqual({ memories: [] });

    expect(
      extractJsonPayload('```json\n{"memories":[{"slug":"a.md"}]}\n```'),
    ).toEqual({
      memories: [{ slug: "a.md" }],
    });

    expect(extractJsonPayload("not json")).toBeNull();
  });

  it("normalizes valid suggestions and rejects invalid ones", () => {
    expect(
      normalizeSuggestion({
        slug: "team-style.md",
        name: "Team Style",
        description: "How to work with this team",
        type: "feedback",
        hook: "Use short updates",
        body: "Why: Keep updates short.",
      }),
    ).toEqual({
      slug: "team-style.md",
      name: "Team Style",
      description: "How to work with this team",
      type: "feedback",
      hook: "Use short updates",
      body: "Why: Keep updates short.",
    });

    expect(
      normalizeSuggestion({
        slug: "",
        name: "Bad",
        description: "Desc",
        type: "feedback",
        hook: "Hook",
        body: "Body",
      }),
    ).toBeNull();

    expect(
      normalizeSuggestion({
        slug: "bad.md",
        name: "Bad",
        description: "Desc",
        type: "invalid" as any,
        hook: "Hook",
        body: "Body",
      }),
    ).toBeNull();
  });
});
