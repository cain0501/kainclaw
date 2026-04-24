import { describe, expect, it } from "vitest";
import { buildVerificationRequest, getApproachSummary } from "./runner";

describe("verification runner helpers", () => {
  it("uses the latest non-empty assistant message as the approach summary", () => {
    const summary = getApproachSummary([
      { role: "user", content: "implement it" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "Implemented the background task stop flow." },
    ]);

    expect(summary).toContain("Implemented the background task stop flow.");
  });

  it("falls back when no assistant summary exists", () => {
    const summary = getApproachSummary([
      { role: "user", content: "implement it" },
    ]);

    expect(summary).toContain("No assistant implementation summary was found");
  });

  it("builds a verification request with plan and transcript context", () => {
    const request = buildVerificationRequest({
      originalTask: "Implement plan execution verification",
      changedFiles: ["src/verification/runner.ts"],
      approachSummary: "Added verification helpers.",
      transcript: "USER: verify this\n\nASSISTANT: running verifier",
      extraGuidance: "Pay attention to plan reminders",
      planFilePath: ".omx/plans/test.md",
      planContent: "1. Do work\n2. Verify",
    });

    expect(request).toContain("Verify the current workspace state");
    expect(request).toContain("Implement plan execution verification");
    expect(request).toContain("- src/verification/runner.ts");
    expect(request).toContain("Added verification helpers.");
    expect(request).toContain(".omx/plans/test.md");
    expect(request).toContain("Pay attention to plan reminders");
    expect(request).toContain("Do not trust transcript claims");
  });

  it("uses diffRef in the intro line when provided", () => {
    const request = buildVerificationRequest({
      originalTask: "Refactor auth middleware",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Extracted middleware.",
      transcript: "USER: /verify HEAD~2..HEAD\n\nASSISTANT: running",
      diffRef: "HEAD~2..HEAD",
    });

    expect(request).toContain("Verify the changes in `HEAD~2..HEAD`");
    expect(request).not.toContain("Verify the current workspace state");
  });

  it("injects diff content into the request when provided", () => {
    const diffContent =
      "diff --git a/src/auth.ts b/src/auth.ts\n+export function newMiddleware() {}";
    const request = buildVerificationRequest({
      originalTask: "Add middleware",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Added middleware export.",
      transcript: "",
      diffRef: "HEAD~1..HEAD",
      diffContent,
    });

    expect(request).toContain("## Diff");
    expect(request).toContain("```diff");
    expect(request).toContain("newMiddleware");
  });

  it("omits the diff section when diffContent is empty", () => {
    const request = buildVerificationRequest({
      originalTask: "Add middleware",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Added middleware.",
      transcript: "",
      diffRef: "HEAD~1..HEAD",
      diffContent: "",
    });

    expect(request).not.toContain("## Diff");
  });

  it("preserves the old workspace-state intro when no diffRef is given", () => {
    const request = buildVerificationRequest({
      originalTask: "Fix bug",
      changedFiles: ["src/foo.ts"],
      approachSummary: "Fixed it.",
      transcript: "",
    });

    expect(request).toContain("Verify the current workspace state");
    expect(request).not.toContain("## Diff");
  });
});
