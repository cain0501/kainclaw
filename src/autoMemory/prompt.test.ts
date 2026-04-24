import { describe, expect, it } from "vitest";
import {
  buildAutoMemoryExtractionPrompt,
  buildAutoMemoryExtractionSystemPrompt,
  buildAutoMemorySystemPrompt,
} from "./prompt";

describe("autoMemory prompt helpers", () => {
  it("builds the memory-aware system prompt with entrypoint content", () => {
    const prompt = buildAutoMemorySystemPrompt("Base prompt", {
      memoryDir: "C:\\memory",
      entrypointContent: "# Memory Index\n- [Team Style](team-style.md): use short updates",
    });

    expect(prompt).toContain("Base prompt");
    expect(prompt).toContain("C:\\memory");
    expect(prompt).toContain("Team Style");
  });

  it("builds the extraction system prompt as JSON-only instructions", () => {
    const prompt = buildAutoMemoryExtractionSystemPrompt();

    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain("background auto-memory extraction agent");
  });

  it("builds the extraction prompt with manifest and schema instructions", () => {
    const prompt = buildAutoMemoryExtractionPrompt({
      existingManifest: [
        {
          relativePath: "team-style.md",
          name: "Team Style",
          description: "How to work with this team",
          type: "feedback",
        },
      ],
      newMessageCount: 12,
      todayIsoDate: "2026-04-10",
    });

    expect(prompt).toContain("~12 messages");
    expect(prompt).toContain("2026-04-10");
    expect(prompt).toContain("team-style.md | feedback | Team Style");
    expect(prompt).toContain("\"memories\"");
  });
});
