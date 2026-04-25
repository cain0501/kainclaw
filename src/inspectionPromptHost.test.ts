import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  handleReviewPromptCommand,
  handleVerificationPromptCommand,
} from "./inspectionPromptHost";

describe("inspectionPromptHost", () => {
  it("blocks verification in English when there is no original task in the session", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: undefined,
      sessionMessages: [{ role: "user", content: "/verify" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-1",
        report: "report",
        verdict: "PASS",
      }),
      buildFollowUpMessage: () => "followup",
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "There is no original task in this conversation yet. Give me a real implementation task first, or finish a round of implementation before running `/verify`.",
      false,
    );
  });

  it("blocks verification in Chinese when the command itself asks in Chinese", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify 请用中文检查",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: undefined,
      sessionMessages: [{ role: "user", content: "/verify 请用中文检查" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-zh-no-task",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-zh-no-task",
        report: "report",
        verdict: "PASS",
      }),
      buildFollowUpMessage: () => "followup",
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "当前对话里还没有可验证的原始任务。先给我一个真实实现任务，或者先完成一轮实现后再运行 `/verify`。",
      false,
    );
  });

  it("short-circuits greeting-only verification requests to PARTIAL", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: undefined,
      sessionMessages: [{ role: "user", content: "你好" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-greeting-partial",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-should-not-run",
        report: "report",
        verdict: "PASS",
      }),
      buildFollowUpMessage: () => "",
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "当前原始任务 `你好` 只是问候/泛聊天，不是可验证的实现请求。本次不进入实现验证流程。请先给出真实实现任务后再运行 `/verify`。\n\nVERDICT: PARTIAL",
      false,
    );
  });

  it("allows /verify to proceed without a prior task when the workspace itself has project evidence", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "verify-project-evidence-"));
    try {
      await fs.writeFile(path.join(workspaceRoot, "README.md"), "# test\n", "utf8");
      const recordAssistantReply = vi.fn(async () => undefined);
      const runVerificationSession = vi.fn(async () => ({
        taskId: "verify-workspace-only",
        report: "verification report",
        verdict: "PASS" as const,
      }));

      const handled = await handleVerificationPromptCommand({
        commandText: "/verify",
        workspaceRoot,
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
        runtime: { getToolContext: () => ({}) as any },
        tools: [],
        runtimeOptions: {},
        effortLevel: undefined,
        sessionMessages: [{ role: "user", content: "/verify" }],
        blockedByPlanMode: false,
        onToken: () => undefined,
        onToolStart: () => undefined,
        onToolEnd: () => undefined,
        addPhaseActivity: () => "activity-workspace-fallback",
        finishPhaseActivity: () => undefined,
        recordAssistantReply,
        setCompanionState: () => undefined,
        clearStreamingText: () => undefined,
        updateMood: async () => undefined,
        isAbortLikeError: () => false,
        runVerificationSession,
        buildFollowUpMessage: () => "",
        onUnexpectedError: () => undefined,
      });

      expect(handled).toBe(true);
      expect(runVerificationSession).toHaveBeenCalledTimes(1);
      expect(recordAssistantReply).not.toHaveBeenCalledWith(
        "There is no original task in this conversation yet. Give me a real implementation task first, or finish a round of implementation before running `/verify`.",
        false,
      );
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("runs verification flow with verification-specific success handling", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify focus",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "Implement task" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      clearStreamingText: () => undefined,
      updateMood,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-1",
        report: "verification report",
        verdict: "PASS",
      }),
      buildFollowUpMessage: (label, taskId) => `${label}:${taskId}`,
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "VERDICT: PASS",
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      "verification report",
      undefined,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      "Verification:verify-1",
      false,
    );
    expect(setCompanionState).toHaveBeenCalledWith("thinking");
    expect(setCompanionState).toHaveBeenLastCalledWith("done");
    expect(updateMood).toHaveBeenCalledWith(2, true);
  });

  it("skips verification follow-up replies when the host returns no follow-up message", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify focus",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "Implement task" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-followup-verify",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-no-followup",
        report: "verification report",
        verdict: "PASS",
      }),
      buildFollowUpMessage: () => "",
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(recordAssistantReply).toHaveBeenCalledTimes(1);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "verification report",
      undefined,
    );
  });

  it("treats verification PARTIAL results as non-passing in prompt handling", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify focus",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "Implement task" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-2",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      clearStreamingText: () => undefined,
      updateMood,
      isAbortLikeError: () => false,
      runVerificationSession: async () => ({
        taskId: "verify-2",
        report: "verification partial report",
        verdict: "PARTIAL",
      }),
      buildFollowUpMessage: (label, taskId) => `${label}:${taskId}`,
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-2",
      "error",
      "VERDICT: PARTIAL",
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      "verification partial report",
      undefined,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      "Verification:verify-2",
      false,
    );
    expect(setCompanionState).toHaveBeenCalledWith("thinking");
    expect(setCompanionState).toHaveBeenLastCalledWith("idle");
    expect(updateMood).toHaveBeenCalledWith(-1, false);
  });

  it("localizes verification abort copy for Chinese conversations", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();

    const handled = await handleVerificationPromptCommand({
      commandText: "/verify",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "请验证刚才的实现" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-verify-abort-zh",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: error => error instanceof Error && error.message === "abort",
      runVerificationSession: async () => {
        throw new Error("abort");
      },
      buildFollowUpMessage: () => "",
      onUnexpectedError: () => undefined,
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-verify-abort-zh",
      "done",
      "验证已取消",
    );
    expect(recordAssistantReply).toHaveBeenCalledWith("验证已在完成前取消。", false);
  });

  it("runs review flow with review-specific success handling", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    const handled = await handleReviewPromptCommand({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "Implement task" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-2",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood,
      isAbortLikeError: () => false,
      runReviewSession: async () => ({
        taskId: "review-1",
        report: "review report",
      }),
      buildFollowUpMessage: (label, taskId) => `${label}:${taskId}`,
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith("activity-2", "done", undefined);
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      "review report",
      undefined,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      "Review:review-1",
      false,
    );
    expect(updateMood).toHaveBeenCalledWith(2, true);
  });

  it("blocks review when there is no original task or workspace project evidence", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "review-empty-workspace-"));
    try {
      const recordAssistantReply = vi.fn(async () => undefined);
      const runReviewSession = vi.fn(async () => ({
        taskId: "review-should-not-run",
        report: "review report",
      }));

      const handled = await handleReviewPromptCommand({
        commandText: "/review",
        workspaceRoot,
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
        runtime: { getToolContext: () => ({}) as any },
        tools: [],
        runtimeOptions: {},
        effortLevel: "medium",
        sessionMessages: [{ role: "user", content: "/review" }],
        blockedByPlanMode: false,
        onToken: () => undefined,
        onToolStart: () => undefined,
        onToolEnd: () => undefined,
        addPhaseActivity: () => "activity-review-no-target",
        finishPhaseActivity: () => undefined,
        recordAssistantReply,
        setCompanionState: () => undefined,
        clearStreamingText: () => undefined,
        updateMood: async () => undefined,
        isAbortLikeError: () => false,
        runReviewSession,
        buildFollowUpMessage: () => "",
      });

      expect(handled).toBe(true);
      expect(runReviewSession).not.toHaveBeenCalled();
      expect(recordAssistantReply).toHaveBeenCalledWith(
        "There is no reviewable original task or change target in this conversation yet. Give me a real implementation task, PR/diff range, or finish workspace changes before running `/review`.",
        false,
      );
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("short-circuits greeting-only review requests", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const runReviewSession = vi.fn(async () => ({
      taskId: "review-should-not-run",
      report: "review report",
    }));

    const handled = await handleReviewPromptCommand({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "你好" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-review-greeting",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runReviewSession,
      buildFollowUpMessage: () => "",
    });

    expect(handled).toBe(true);
    expect(runReviewSession).not.toHaveBeenCalled();
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "当前原始任务 `你好` 只是问候/泛聊天，不是可审查的实现请求或 PR/diff 目标。本次不进入代码审查流程。请先给出真实实现任务、PR 或 diff 范围后再运行 `/review`。",
      false,
    );
  });

  it("allows review to proceed without a prior task when the workspace itself has project evidence", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "review-project-evidence-"));
    try {
      await fs.writeFile(path.join(workspaceRoot, "package.json"), "{\"scripts\":{}}\n", "utf8");
      const recordAssistantReply = vi.fn(async () => undefined);
      const runReviewSession = vi.fn(async () => ({
        taskId: "review-workspace-only",
        report: "review report",
      }));

      const handled = await handleReviewPromptCommand({
        commandText: "/review",
        workspaceRoot,
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
        runtime: { getToolContext: () => ({}) as any },
        tools: [],
        runtimeOptions: {},
        effortLevel: "medium",
        sessionMessages: [{ role: "user", content: "/review" }],
        blockedByPlanMode: false,
        onToken: () => undefined,
        onToolStart: () => undefined,
        onToolEnd: () => undefined,
        addPhaseActivity: () => "activity-review-workspace-fallback",
        finishPhaseActivity: () => undefined,
        recordAssistantReply,
        setCompanionState: () => undefined,
        clearStreamingText: () => undefined,
        updateMood: async () => undefined,
        isAbortLikeError: () => false,
        runReviewSession,
        buildFollowUpMessage: () => "",
      });

      expect(handled).toBe(true);
      expect(runReviewSession).toHaveBeenCalledWith(
        expect.objectContaining({
          promptForTask: "Review the current workspace/project changes.",
        }),
      );
      expect(recordAssistantReply).toHaveBeenCalledWith("review report", undefined);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("localizes review duplicate status for Chinese conversations", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();

    const handled = await handleReviewPromptCommand({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "请审查这个改动" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-review-duplicate-zh",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runReviewSession: async () => {
        throw new Error("A review agent is already running for this conversation.");
      },
      buildFollowUpMessage: () => "",
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-review-duplicate-zh",
      "done",
      "审查已在运行",
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "A review agent is already running for this conversation.",
      false,
    );
  });

  it("skips review follow-up replies when the host returns no follow-up message", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleReviewPromptCommand({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime: { getToolContext: () => ({}) as any },
      tools: [],
      runtimeOptions: {},
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "Implement task" }],
      blockedByPlanMode: false,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-review-no-followup",
      finishPhaseActivity: () => undefined,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      runReviewSession: async () => ({
        taskId: "review-no-followup",
        report: "review report",
      }),
      buildFollowUpMessage: () => "",
    });

    expect(handled).toBe(true);
    expect(recordAssistantReply).toHaveBeenCalledTimes(1);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "review report",
      undefined,
    );
  });
});
