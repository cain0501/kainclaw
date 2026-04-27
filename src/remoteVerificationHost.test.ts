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

import { launchHostedVerificationWithHost } from "./remoteVerificationHost";

describe("remoteVerificationHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChangedFilesMock.mockResolvedValue([]);
    getChangedFilesFromDiffMock.mockResolvedValue([]);
    getDiffContentMock.mockResolvedValue("");
    getLatestAssistantSummaryMock.mockReturnValue("assistant summary");
    getRecentTranscriptMock.mockReturnValue("recent transcript");
  });

  it("builds a detached hosted verification request for diffRef targets", async () => {
    getChangedFilesFromDiffMock.mockResolvedValue(["src/extension.ts"]);
    getDiffContentMock.mockResolvedValue("diff --git a/src/extension.ts b/src/extension.ts");

    const runDetachedRemoteVerification = vi.fn(async (options: any) => ({
      taskId: "remote-verify-1",
      command: options.commandText,
      workspaceRoot: options.workspaceRoot,
      outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
      sessionId: options.sessionId,
    }));

    const result = await launchHostedVerificationWithHost({
      commandText: "/ultraverify HEAD~2..HEAD focus regression coverage",
      workspaceRoot: "E:\\repo",
      config: {
        type: "claude-cli",
        cliPath: "claude.cmd",
        model: "claude-3-7-sonnet",
      },
      effortLevel: "high",
      conversationHistory: [{ role: "assistant", content: "implemented auth patch" }],
      originalTask: "Implement auth patch",
      sessionMessages: [{ role: "user", content: "verify auth patch" }],
      planFilePath: ".omx/plans/auth.md",
      planContent: "1. inspect auth flow",
      backgroundTaskHost: {
        runDetachedRemoteVerification,
      },
    });

    expect(result).toMatchObject({
      taskId: "remote-verify-1",
      outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
    });

    expect(runDetachedRemoteVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo",
        commandText: "/ultraverify HEAD~2..HEAD focus regression coverage",
        taskDescription: "Hosted verification: HEAD~2..HEAD",
        remoteTaskType: "claude_cli_verification",
        metadata: {
          diffRef: "HEAD~2..HEAD",
          extraGuidance: "focus regression coverage",
          originalTask: "Implement auth patch",
        },
        provider: {
          cliPath: "claude.cmd",
          model: "claude-3-7-sonnet",
        },
      }),
    );

    const request = runDetachedRemoteVerification.mock.calls[0]?.[0]
      ?.verificationRequest as string;
    expect(request).toContain("## Original task\nImplement auth patch");
    expect(request).toContain("## Files changed\n- src/extension.ts");
    expect(request).toContain("## Diff");
    expect(request).toContain("focus regression coverage");
    expect(request).toContain(".omx/plans/auth.md");
  });

  it("builds a detached hosted verification request for workspace-state targets", async () => {
    const runDetachedRemoteVerification = vi.fn(async (options: any) => ({
      taskId: "remote-verify-2",
      command: options.commandText,
      workspaceRoot: options.workspaceRoot,
      outputPath: "E:\\repo\\remote-verifications\\remote-verify-2\\output.log",
      sessionId: options.sessionId,
    }));

    await launchHostedVerificationWithHost({
      commandText: "/ultraverify focus release checklist",
      workspaceRoot: "E:\\repo",
      config: {
        type: "claude-cli",
      },
      effortLevel: "medium",
      conversationHistory: [{ role: "assistant", content: "implemented release patch" }],
      originalTask: "Verify release patch",
      sessionMessages: [{ role: "user", content: "verify release patch" }],
      backgroundTaskHost: {
        runDetachedRemoteVerification,
      },
    });

    expect(getChangedFilesMock).toHaveBeenCalledWith("E:\\repo");
    expect(getChangedFilesFromDiffMock).not.toHaveBeenCalled();
    expect(getDiffContentMock).not.toHaveBeenCalled();
    expect(runDetachedRemoteVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        taskDescription: "Hosted verification: current workspace state",
        metadata: {
          extraGuidance: "focus release checklist",
          originalTask: "Verify release patch",
        },
      }),
    );
  });
});
