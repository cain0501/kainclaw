import { describe, expect, it } from "vitest";
import type { ToolContext, ToolDefinition } from "../../toolRuntime";
import {
  getLatestAssistantSummary,
  getReadOnlyAgentToolContext,
  getReadOnlyAgentTools,
  getRecentTranscript,
  getChangedFilesFromDiff,
  getDiffContent,
  parseReviewPrNumber,
  parseReviewDiffRef,
  parseVerificationDiffRef,
  truncate,
} from "./agentUtils";

describe("parseReviewDiffRef", () => {
  it("parses a two-dot range", () => {
    expect(parseReviewDiffRef("/review HEAD~1..HEAD")).toBe("HEAD~1..HEAD");
  });

  it("parses a three-dot range", () => {
    expect(parseReviewDiffRef("/review main...HEAD")).toBe("main...HEAD");
  });

  it("parses a plain relative ref", () => {
    expect(parseReviewDiffRef("/review HEAD~3")).toBe("HEAD~3");
  });

  it("parses a branch name", () => {
    expect(parseReviewDiffRef("/review feature/my-feature")).toBe("feature/my-feature");
  });

  it("parses a tag", () => {
    expect(parseReviewDiffRef("/review v1.0.0")).toBe("v1.0.0");
  });

  it("parses a short commit hash", () => {
    expect(parseReviewDiffRef("/review abc1234")).toBe("abc1234");
  });

  it("does not treat a numeric PR argument as a git diff ref", () => {
    expect(parseReviewDiffRef("/review 123")).toBeUndefined();
    expect(parseReviewDiffRef("/review 123 focus on regressions")).toBeUndefined();
  });

  it("returns undefined for bare /review with no argument", () => {
    expect(parseReviewDiffRef("/review")).toBeUndefined();
    expect(parseReviewDiffRef("/review  ")).toBeUndefined();
  });

  it("returns undefined for natural-language text (has spaces)", () => {
    expect(parseReviewDiffRef("/review fix the bug")).toBeUndefined();
    expect(parseReviewDiffRef("/review look at the authentication changes")).toBeUndefined();
  });

  it("parses an explicit diff ref when extra guidance follows it", () => {
    expect(parseReviewDiffRef("/review HEAD~2..HEAD focus on auth regressions")).toBe(
      "HEAD~2..HEAD",
    );
    expect(parseReviewDiffRef("/review feature/my-branch check tests")).toBe(
      "feature/my-branch",
    );
  });

  it("returns undefined when command does not start with /review", () => {
    expect(parseReviewDiffRef("/verify HEAD~1..HEAD")).toBeUndefined();
    expect(parseReviewDiffRef("HEAD~1..HEAD")).toBeUndefined();
  });

  it("handles leading and trailing whitespace", () => {
    expect(parseReviewDiffRef("  /review main...HEAD  ")).toBe("main...HEAD");
  });

  it("parses supported GitHub PR URLs", () => {
    expect(parseReviewDiffRef("/review https://github.com/openai/codex/pull/123")).toBe(
      "https://github.com/openai/codex/pull/123",
    );
  });
});

describe("parseReviewPrNumber", () => {
  it("parses numeric PR arguments from /review", () => {
    expect(parseReviewPrNumber("/review 123")).toBe("123");
    expect(parseReviewPrNumber("/review 123 focus on regressions")).toBe("123");
  });

  it("returns undefined for non-numeric review targets", () => {
    expect(parseReviewPrNumber("/review main...HEAD")).toBeUndefined();
    expect(parseReviewPrNumber("/review feature/my-branch")).toBeUndefined();
    expect(parseReviewPrNumber("/verify 123")).toBeUndefined();
  });
});

describe("parseVerificationDiffRef", () => {
  it("parses git refs from /verify commands", () => {
    expect(parseVerificationDiffRef("/verify HEAD~1..HEAD")).toBe("HEAD~1..HEAD");
    expect(parseVerificationDiffRef("/verify main...HEAD")).toBe("main...HEAD");
    expect(parseVerificationDiffRef("/verify HEAD~3")).toBe("HEAD~3");
  });

  it("returns undefined for natural-language /verify input", () => {
    expect(parseVerificationDiffRef("/verify fix the bug")).toBeUndefined();
    expect(parseVerificationDiffRef("/verify focus on build and tests")).toBeUndefined();
  });

  it("parses an explicit diff ref when extra guidance follows it", () => {
    expect(parseVerificationDiffRef("/verify HEAD~1..HEAD focus on tests")).toBe(
      "HEAD~1..HEAD",
    );
    expect(parseVerificationDiffRef("/verify abc1234 check only changed files")).toBe(
      "abc1234",
    );
  });

  it("returns undefined when command does not start with /verify", () => {
    expect(parseVerificationDiffRef("/review HEAD~1..HEAD")).toBeUndefined();
    expect(parseVerificationDiffRef("HEAD~1..HEAD")).toBeUndefined();
  });

  it("parses supported GitHub compare URLs", () => {
    expect(
      parseVerificationDiffRef(
        "/verify https://github.com/openai/codex/compare/main...feature-branch",
      ),
    ).toBe("https://github.com/openai/codex/compare/main...feature-branch");
  });
});

describe("built-in agent utils", () => {
  it("truncates long strings with a suffix", () => {
    const result = truncate("abcdefghij", 6);

    expect(result).toContain("abcdef");
    expect(result).toContain("[truncated");
  });

  it("filters excluded commands out of the recent transcript", () => {
    const transcript = getRecentTranscript(
      [
        { role: "user", content: "/review" },
        { role: "user", content: "real request" },
        { role: "assistant", content: "real answer" },
      ],
      ["/review"],
      8,
      100,
    );

    expect(transcript).toContain("USER: real request");
    expect(transcript).toContain("ASSISTANT: real answer");
    expect(transcript).not.toContain("/review");
  });

  it("uses the latest non-empty assistant message as the approach summary", () => {
    const summary = getLatestAssistantSummary(
      [
        { role: "user", content: "implement it" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "Implemented the review context flow." },
      ],
      "fallback",
    );

    expect(summary).toContain("Implemented the review context flow.");
  });

  it("keeps only read-only tools for built-in agents", () => {
    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "read",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "write_file",
        description: "write",
        input_schema: { type: "object", properties: {} },
        annotations: { destructiveHint: true },
      },
      {
        name: "mcp__demo__readonly",
        description: "mcp readonly",
        input_schema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
      },
      {
        name: "mcp__demo__write",
        description: "mcp write",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const filtered = getReadOnlyAgentTools(tools, ["read_file"]);

    expect(filtered.map(tool => tool.name)).toEqual(["mcp__demo__readonly"]);
  });

  it("removes approval hooks and forces verification mode in the tool context", () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      requestFileApproval: async () => true,
      requestToolApproval: async () => true,
    };

    const next = getReadOnlyAgentToolContext(context);

    expect(next.requestFileApproval).toBeUndefined();
    expect(next.requestToolApproval).toBeUndefined();
    expect(next.verificationMode).toEqual({ active: true });
  });

  it("fetches changed files from supported GitHub diff URLs", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: true,
        text: async () =>
          [
            "diff --git a/src/verification/runner.ts b/src/verification/runner.ts",
            "index 123..456 100644",
            "--- a/src/verification/runner.ts",
            "+++ b/src/verification/runner.ts",
            "@@ -1,1 +1,1 @@",
            "+change",
            "diff --git a/src/toolRuntime.ts b/src/toolRuntime.ts",
          ].join("\n"),
      }) as any) as typeof fetch;

    try {
      const files = await getChangedFilesFromDiff(
        "E:\\claudecodejingiang\\vscode-extension",
        "https://github.com/openai/codex/pull/123",
      );

      expect(files).toEqual([
        "src/verification/runner.ts",
        "src/toolRuntime.ts",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches and truncates diff content from supported GitHub diff URLs", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: true,
        text: async () => "diff --git a/a.ts b/a.ts\n+" + "x".repeat(200),
      }) as any) as typeof fetch;

    try {
      const diff = await getDiffContent(
        "E:\\claudecodejingiang\\vscode-extension",
        "https://github.com/openai/codex/compare/main...feature",
        80,
      );

      expect(diff).toContain("diff --git a/a.ts b/a.ts");
      expect(diff).toContain("[truncated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
