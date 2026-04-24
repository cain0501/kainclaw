import { describe, expect, it, vi } from "vitest";

import {
  handleReviewPromptCommand,
  handleVerificationPromptCommand,
} from "./inspectionPromptHost";

describe("inspectionPromptHost", () => {
  it("blocks verification when there is no original task in the session", async () => {
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
      "当前对话里还没有可验证的原始任务。先给我一个真实实现任务，或者先完成一轮实现后再运行 `/verify`。",
      false,
    );
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
