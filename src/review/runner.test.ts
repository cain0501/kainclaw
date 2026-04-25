import { describe, expect, it } from "vitest";
import { buildReviewRequest } from "./runner";

describe("review runner helpers", () => {
  it("builds a findings-first review request with changed files, approach summary, and plan context", () => {
    const request = buildReviewRequest({
      originalTask: "Fix background task cancellation",
      changedFiles: ["src/extension.ts", "src/tasks/taskRuntime.ts"],
      approachSummary: "Implemented stronger background task cancellation flow.",
      transcript: "USER: please review\n\nASSISTANT: ready",
      planFilePath: ".omx/plans/review.md",
      planContent: "1. Improve cancellation\n2. Verify follow-up output",
      extraGuidance: "Focus on regressions",
    });

    expect(request).toContain("Review the current workspace changes.");
    expect(request).toContain("Fix background task cancellation");
    expect(request).toContain("- src/extension.ts");
    expect(request).toContain("- src/tasks/taskRuntime.ts");
    expect(request).toContain("Implemented stronger background task cancellation flow.");
    expect(request).toContain(".omx/plans/review.md");
    expect(request).toContain("Improve cancellation");
    expect(request).toContain("Focus on regressions");
    expect(request).toContain("findings-first review");
  });

  it("falls back cleanly when changed files are unavailable", () => {
    const request = buildReviewRequest({
      originalTask: "",
      changedFiles: [],
      approachSummary: "No approach summary available.",
      transcript: "[no recent transcript available]",
    });

    expect(request).toContain("[missing original task]");
    expect(request).toContain("[git status unavailable or no changed files detected]");
  });

  it("uses diffRef in the intro line when provided", () => {
    const request = buildReviewRequest({
      originalTask: "Refactor auth middleware",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Extracted middleware into its own module.",
      transcript: "USER: /review HEAD~2..HEAD\n\nASSISTANT: ready",
      diffRef: "HEAD~2..HEAD",
    });

    expect(request).toContain("Review the changes in `HEAD~2..HEAD`.");
    expect(request).not.toContain("Review the current workspace changes.");
  });

  it("uses Claude PR review workflow when a PR number is provided", () => {
    const request = buildReviewRequest({
      originalTask: "Review PR",
      changedFiles: [],
      approachSummary: "No implementation summary available.",
      transcript: "USER: /review 123",
      prNumber: "123",
    });

    expect(request).toContain("Review pull request #123.");
    expect(request).toContain("Run `gh pr view 123` to get PR details.");
    expect(request).toContain("Run `gh pr diff 123` to get the PR diff.");
    expect(request).not.toContain("Review the current workspace changes.");
  });

  it("injects diff content into the request when provided", () => {
    const diffContent =
      "diff --git a/src/auth.ts b/src/auth.ts\n+export function newMiddleware() {}";
    const request = buildReviewRequest({
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

  it("includes the review language policy for user-language-aware output", () => {
    const request = buildReviewRequest({
      originalTask: "用中文审查这次改动",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Added middleware export.",
      transcript: "USER: 请用中文 review\n\nASSISTANT: 好的",
    });

    expect(request).toContain("## Language policy");
    expect(request).toContain("Simplified Chinese");
    expect(request).toContain("未发现问题。");
  });

  it("omits the diff section when diffContent is empty", () => {
    const request = buildReviewRequest({
      originalTask: "Add middleware",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Added middleware export.",
      transcript: "",
      diffRef: "HEAD~1..HEAD",
      diffContent: "",
    });

    expect(request).not.toContain("## Diff");
  });

  it("omits diffRef intro and diff section when neither is provided", () => {
    const request = buildReviewRequest({
      originalTask: "Fix bug",
      changedFiles: ["src/foo.ts"],
      approachSummary: "Fixed it.",
      transcript: "",
    });

    expect(request).toContain("Review the current workspace changes.");
    expect(request).not.toContain("## Diff");
  });
});
