import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getChangedFilesMock,
  getChangedFilesFromDiffMock,
  getDiffContentMock,
  getLatestAssistantSummaryMock,
  getRecentTranscriptMock,
} = vi.hoisted(() => ({
  getChangedFilesMock: vi.fn(),
  getChangedFilesFromDiffMock: vi.fn(),
  getDiffContentMock: vi.fn(),
  getLatestAssistantSummaryMock: vi.fn(),
  getRecentTranscriptMock: vi.fn(),
}));

vi.mock("./agent/built-in/agentUtils", async importOriginal => {
  const original = await importOriginal<typeof import("./agent/built-in/agentUtils")>();
  return {
    ...original,
    getChangedFiles: getChangedFilesMock,
    getChangedFilesFromDiff: getChangedFilesFromDiffMock,
    getDiffContent: getDiffContentMock,
    getLatestAssistantSummary: getLatestAssistantSummaryMock,
    getRecentTranscript: getRecentTranscriptMock,
  };
});

import { launchHostedReviewWithHost } from "./remoteReviewHost";

describe("remoteReviewHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChangedFilesMock.mockResolvedValue([]);
    getChangedFilesFromDiffMock.mockResolvedValue([]);
    getDiffContentMock.mockResolvedValue("");
    getLatestAssistantSummaryMock.mockReturnValue("assistant summary");
    getRecentTranscriptMock.mockReturnValue("recent transcript");
  });

  it("builds a detached hosted review request for diffRef targets", async () => {
    getChangedFilesFromDiffMock.mockResolvedValue(["src/extension.ts"]);
    getDiffContentMock.mockResolvedValue("diff --git a/src/extension.ts b/src/extension.ts");

    const runDetachedRemoteReview = vi.fn(async (options: any) => ({
      taskId: "remote-review-1",
      command: options.commandText,
      workspaceRoot: options.workspaceRoot,
      outputPath: "E:\\repo\\remote-reviews\\remote-review-1\\output.log",
      sessionId: options.sessionId,
    }));

    const result = await launchHostedReviewWithHost({
      commandText: "/ultrareview HEAD~2..HEAD focus auth regressions",
      workspaceRoot: "E:\\repo",
      config: {
        type: "claude-cli",
        cliPath: "claude.cmd",
        model: "claude-3-7-sonnet",
      },
      effortLevel: "high",
      conversationHistory: [{ role: "assistant", content: "implemented auth patch" }],
      originalTask: "Implement auth patch",
      sessionMessages: [{ role: "user", content: "review auth patch" }],
      planFilePath: ".omx/plans/auth.md",
      planContent: "1. inspect auth flow",
      backgroundTaskHost: {
        runDetachedRemoteReview,
      },
    });

    expect(result).toMatchObject({
      taskId: "remote-review-1",
      outputPath: "E:\\repo\\remote-reviews\\remote-review-1\\output.log",
    });

    expect(runDetachedRemoteReview).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo",
        commandText: "/ultrareview HEAD~2..HEAD focus auth regressions",
        taskDescription: "Hosted review: HEAD~2..HEAD",
        remoteTaskType: "claude_cli_review",
        metadata: {
          diffRef: "HEAD~2..HEAD",
          extraGuidance: "focus auth regressions",
          originalTask: "Implement auth patch",
        },
        provider: {
          cliPath: "claude.cmd",
          model: "claude-3-7-sonnet",
        },
      }),
    );

    const request = runDetachedRemoteReview.mock.calls[0]?.[0]?.reviewRequest as string;
    expect(request).toContain("## Original task\nImplement auth patch");
    expect(request).toContain("## Files changed\n- src/extension.ts");
    expect(request).toContain("## Diff");
    expect(request).toContain("focus auth regressions");
    expect(request).toContain(".omx/plans/auth.md");
  });

  it("builds a detached hosted review request for PR targets", async () => {
    const runDetachedRemoteReview = vi.fn(async (options: any) => ({
      taskId: "remote-review-pr",
      command: options.commandText,
      workspaceRoot: options.workspaceRoot,
      outputPath: "E:\\repo\\remote-reviews\\remote-review-pr\\output.log",
      sessionId: options.sessionId,
    }));

    await launchHostedReviewWithHost({
      commandText: "/ultrareview 42 focus perf",
      workspaceRoot: "E:\\repo",
      config: {
        type: "claude-cli",
      },
      effortLevel: "medium",
      conversationHistory: [{ role: "assistant", content: "implemented perf patch" }],
      originalTask: "Review PR 42",
      sessionMessages: [{ role: "user", content: "review PR 42" }],
      backgroundTaskHost: {
        runDetachedRemoteReview,
      },
    });

    expect(getChangedFilesFromDiffMock).not.toHaveBeenCalled();
    expect(getDiffContentMock).not.toHaveBeenCalled();
    expect(runDetachedRemoteReview).toHaveBeenCalledWith(
      expect.objectContaining({
        taskDescription: "Hosted review: PR #42",
        metadata: {
          reviewPrNumber: "42",
          extraGuidance: "focus perf",
          originalTask: "Review PR 42",
        },
      }),
    );

    const request = runDetachedRemoteReview.mock.calls[0]?.[0]?.reviewRequest as string;
    expect(request).toContain("Review pull request #42.");
    expect(request).toContain("gh pr view 42");
    expect(request).toContain("gh pr diff 42");
  });
});
