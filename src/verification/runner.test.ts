import { describe, expect, it } from "vitest";
import {
  buildVerificationRequest,
  getApproachSummary,
  normalizeVerificationReportFences,
} from "./runner";

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

  it("includes the verification language policy while preserving English structure labels", () => {
    const request = buildVerificationRequest({
      originalTask: "请用中文验证这次实现",
      changedFiles: ["src/auth.ts"],
      approachSummary: "Added middleware export.",
      transcript: "USER: 请用中文 verify\n\nASSISTANT: 好的",
    });

    expect(request).toContain("## Language policy");
    expect(request).toContain("Simplified Chinese");
    expect(request).toContain("### Check:");
    expect(request).toContain("VERDICT:");
  });

  it("requires fenced blocks and raw-only output in verification reports", () => {
    const request = buildVerificationRequest({
      originalTask: "Verify the current workspace/project state.",
      changedFiles: ["src/toolRuntime.ts"],
      approachSummary: "Tightened verification formatting rules.",
      transcript: "USER: /verify\n\nASSISTANT: running verifier",
    });

    expect(request).toContain("## Report formatting rules");
    expect(request).toContain("triple-tilde fenced code blocks");
    expect(request).toContain("Do not use triple-backtick fences");
    expect(request).toContain("must contain only raw command output");
    expect(request).toContain("keep all reasoning in the `Result:` line");
  });

  it("requires concise Result lines in verification reports", () => {
    const request = buildVerificationRequest({
      originalTask: "Verify the current workspace/project state.",
      changedFiles: ["src/toolRuntime.ts"],
      approachSummary: "Tightened verification formatting rules.",
      transcript: "USER: /verify\n\nASSISTANT: running verifier",
    });

    expect(request).toContain("## Result line rule");
    expect(request).toContain("one short sentence");
    expect(request).toContain("Do not append a paragraph");
  });

  it("requires tilde outer fences so raw Markdown output stays literal", () => {
    const request = buildVerificationRequest({
      originalTask: "Verify Markdown rendering.",
      changedFiles: ["README.md"],
      approachSummary: "Tightened verification report fence rules.",
      transcript: "USER: /verify\n\nASSISTANT: running verifier",
    });

    expect(request).toContain("## Fence rule");
    expect(request).toContain("Always use `~~~powershell`");
    expect(request).toContain("`~~~text`");
    expect(request).toContain("backtick fences can break the rendered report");
  });

  it("normalizes verification report command and output blocks to tilde fences", () => {
    const report = [
      "### Check: Read README",
      "Command run:",
      "```powershell",
      "Get-Content README.md",
      "```",
      "Output observed:",
      "```text",
      "# Title",
      "```powershell",
      "npm install",
      "```",
      "### 2. Run tests",
      "npm test",
      "```",
      "Result: PASS README rendered.",
      "",
      "VERDICT: PASS",
    ].join("\n");

    const normalized = normalizeVerificationReportFences(report);

    expect(normalized).toContain("Command run:\n~~~powershell\nGet-Content README.md\n~~~");
    expect(normalized).toContain(
      "Output observed:\n~~~text\n# Title\n```powershell\nnpm install\n```\n### 2. Run tests\nnpm test\n~~~",
    );
  });

  it("includes the verification scope gate for non-implementation conversations", () => {
    const request = buildVerificationRequest({
      originalTask: "你好",
      changedFiles: [],
      approachSummary:
        "No assistant implementation summary was found in the current conversation. Use the transcript excerpt and workspace state.",
      transcript: "USER: 你好\n\nASSISTANT: 你好，有什么可以帮你？",
    });

    expect(request).toContain("## Verification scope gate");
    expect(request).toContain("greeting / generic chat request");
    expect(request).toContain("do not award PASS");
    expect(request).toContain("VERDICT: PARTIAL");
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
