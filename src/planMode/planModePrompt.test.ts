import { describe, expect, it } from "vitest";
import { buildPlanModeSystemPrompt } from "./planModePrompt";

describe("planMode prompt", () => {
  it("describes an existing plan file when content already exists", () => {
    const prompt = buildPlanModeSystemPrompt("Base prompt", {
      planFilePath: ".cain-artifacts/plans/test.md",
      planHasContent: true,
    });

    expect(prompt).toContain("Base prompt");
    expect(prompt).toContain(".cain-artifacts/plans/test.md");
    expect(prompt).toContain("already exists");
    expect(prompt).toContain("ExitPlanMode");
  });

  it("describes a reserved plan file when the file is still empty", () => {
    const prompt = buildPlanModeSystemPrompt("Base prompt", {
      planFilePath: ".cain-artifacts/plans/test.md",
      planHasContent: false,
    });

    expect(prompt).toContain("reserved");
    expect(prompt).toContain("read-only tools");
    expect(prompt).toContain("Do not ask for plan approval in plain text");
  });
});
