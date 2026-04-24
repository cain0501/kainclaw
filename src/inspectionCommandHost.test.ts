import { describe, expect, it, vi } from "vitest";

import { runInspectionCommandFlow } from "./inspectionCommandHost";

describe("inspectionCommandHost", () => {
  it("returns not_applicable when the prompt does not match the command prefix", async () => {
    const result = await runInspectionCommandFlow({
      commandText: "hello",
      commandPrefix: "/verify",
      blockedByPlanMode: false,
      blockedByPlanModeMessage: "",
      phaseLabel: "phase",
      phaseDetail: "detail",
      toolActivityLabel: () => "",
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity: () => undefined,
      recordAssistantReply: async () => undefined,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      isDuplicateRunError: () => false,
      runSession: async () => "result",
      onSuccess: async () => ({
        activityStatus: "done" as const,
        replies: [],
        companionState: "done" as const,
        moodDelta: 1,
      }),
      onAbort: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
      onDuplicate: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
    });

    expect(result).toEqual({ kind: "not_applicable" });
  });

  it("runs the happy path and records replies", async () => {
    const replies: Array<{ text: string; includeInConversation?: boolean }> = [];
    const finishPhaseActivity = vi.fn();

    const result = await runInspectionCommandFlow({
      commandText: "/review",
      commandPrefix: "/review",
      blockedByPlanMode: false,
      blockedByPlanModeMessage: "",
      phaseLabel: "review",
      phaseDetail: "detail",
      toolActivityLabel: toolName => toolName,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity,
      recordAssistantReply: async (text, includeInConversation) => {
        replies.push({ text, includeInConversation });
      },
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      isDuplicateRunError: () => false,
      runSession: async () => "report",
      onSuccess: async result => ({
        activityStatus: "done" as const,
        activityDetail: String(result),
        replies: [
          { text: "report" },
          { text: "followup", includeInConversation: false },
        ],
        companionState: "done" as const,
        moodDelta: 2,
        countConversation: true,
      }),
      onAbort: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
      onDuplicate: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
    });

    expect(result).toEqual({ kind: "handled", result: "report" });
    expect(finishPhaseActivity).toHaveBeenCalledWith("activity-1", "done", "report");
    expect(replies).toEqual([
      { text: "report", includeInConversation: undefined },
      { text: "followup", includeInConversation: false },
    ]);
  });

  it("handles abort and duplicate flows without throwing", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const finishPhaseActivity = vi.fn();

    const abortResult = await runInspectionCommandFlow({
      commandText: "/verify",
      commandPrefix: "/verify",
      blockedByPlanMode: false,
      blockedByPlanModeMessage: "",
      phaseLabel: "verify",
      phaseDetail: "detail",
      toolActivityLabel: toolName => toolName,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: error => error === "abort",
      isDuplicateRunError: () => false,
      runSession: async () => {
        throw "abort";
      },
      onSuccess: async () => ({
        activityStatus: "done" as const,
        replies: [],
        companionState: "done" as const,
        moodDelta: 1,
      }),
      onAbort: async () => ({
        activityStatus: "done" as const,
        activityDetail: "cancelled",
        reply: "cancelled",
        companionState: "idle" as const,
      }),
      onDuplicate: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
    });

    expect(abortResult).toEqual({ kind: "handled" });

    const duplicateResult = await runInspectionCommandFlow({
      commandText: "/verify",
      commandPrefix: "/verify",
      blockedByPlanMode: false,
      blockedByPlanModeMessage: "",
      phaseLabel: "verify",
      phaseDetail: "detail",
      toolActivityLabel: toolName => toolName,
      onToken: () => undefined,
      onToolStart: () => undefined,
      onToolEnd: () => undefined,
      addPhaseActivity: () => "activity-2",
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState: () => undefined,
      clearStreamingText: () => undefined,
      updateMood: async () => undefined,
      isAbortLikeError: () => false,
      isDuplicateRunError: error => error instanceof Error && error.message === "duplicate",
      runSession: async () => {
        throw new Error("duplicate");
      },
      onSuccess: async () => ({
        activityStatus: "done" as const,
        replies: [],
        companionState: "done" as const,
        moodDelta: 1,
      }),
      onAbort: async () => ({
        activityStatus: "done" as const,
        reply: "",
        companionState: "idle" as const,
      }),
      onDuplicate: async message => ({
        activityStatus: "done" as const,
        activityDetail: "already running",
        reply: message,
        companionState: "idle" as const,
      }),
    });

    expect(duplicateResult).toEqual({ kind: "handled" });
    expect(recordAssistantReply).toHaveBeenCalled();
  });
});
