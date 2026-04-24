type ActivityStatus = "done" | "error";

export type InspectionCommandResult<TResult> =
  | { kind: "not_applicable" }
  | { kind: "handled"; result?: TResult };

type ToolStartInput = {
  toolName: string;
  input: Record<string, unknown>;
  execId: string;
};

type ToolEndInput = {
  execId: string;
  summary: string;
  isError: boolean;
};

export async function runInspectionCommandFlow<TResult>(options: {
  commandText: string;
  commandPrefix: string;
  blockedByPlanMode: boolean;
  blockedByPlanModeMessage: string;
  phaseLabel: string;
  phaseDetail: string;
  toolActivityLabel: (toolName: string, input: Record<string, unknown>) => string;
  onToken: (token: string) => void;
  onToolStart: (input: ToolStartInput) => void;
  onToolEnd: (input: ToolEndInput) => void;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: ActivityStatus,
    detail?: string,
  ) => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
  ) => Promise<void>;
  setCompanionState: (state: "thinking" | "working" | "done" | "idle") => void;
  clearStreamingText: () => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  isAbortLikeError: (error: unknown) => boolean;
  isDuplicateRunError: (error: unknown) => boolean;
  runSession: (hooks: {
    onToken: (token: string) => void;
    onToolStart: (toolName: string, input: Record<string, unknown>, execId: string) => void;
    onToolEnd: (execId: string, summary: string, isError: boolean) => void;
  }) => Promise<TResult>;
  onSuccess: (result: TResult) => Promise<{
    activityStatus: ActivityStatus;
    activityDetail?: string;
    replies: Array<{ text: string; includeInConversation?: boolean }>;
    companionState: "done" | "idle";
    moodDelta: number;
    countConversation?: boolean;
  }>;
  onAbort: () => Promise<{
    activityStatus: ActivityStatus;
    activityDetail?: string;
    reply: string;
    companionState: "idle";
  }>;
  onDuplicate: (message: string) => Promise<{
    activityStatus: ActivityStatus;
    activityDetail?: string;
    reply: string;
    companionState: "idle";
  }>;
  onUnexpectedError?: (message: string, activityId: string) => void;
}): Promise<InspectionCommandResult<TResult>> {
  if (!options.commandText.startsWith(options.commandPrefix)) {
    return { kind: "not_applicable" };
  }

  if (options.blockedByPlanMode) {
    await options.recordAssistantReply(options.blockedByPlanModeMessage);
    return { kind: "handled" };
  }

  const phaseActivityId = options.addPhaseActivity(
    options.phaseLabel,
    options.phaseDetail,
    "running",
  );
  options.setCompanionState("thinking");

  try {
    const result = await options.runSession({
      onToken: token => options.onToken(token),
      onToolStart: (toolName, input, execId) => {
        options.setCompanionState("working");
        options.onToolStart({ toolName, input, execId });
      },
      onToolEnd: (execId, summary, isError) => {
        options.onToolEnd({ execId, summary, isError });
      },
    });

    const success = await options.onSuccess(result);
    options.finishPhaseActivity(
      phaseActivityId,
      success.activityStatus,
      success.activityDetail,
    );
    for (const reply of success.replies) {
      await options.recordAssistantReply(reply.text, reply.includeInConversation);
    }
    options.clearStreamingText();
    options.setCompanionState(success.companionState);
    await options.updateMood(success.moodDelta, success.countConversation);
    return { kind: "handled", result };
  } catch (error) {
    if (options.isAbortLikeError(error)) {
      const abortResult = await options.onAbort();
      options.finishPhaseActivity(
        phaseActivityId,
        abortResult.activityStatus,
        abortResult.activityDetail,
      );
      await options.recordAssistantReply(abortResult.reply, false);
      options.clearStreamingText();
      options.setCompanionState(abortResult.companionState);
      return { kind: "handled" };
    }

    if (options.isDuplicateRunError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      const duplicateResult = await options.onDuplicate(message);
      options.finishPhaseActivity(
        phaseActivityId,
        duplicateResult.activityStatus,
        duplicateResult.activityDetail,
      );
      await options.recordAssistantReply(duplicateResult.reply, false);
      options.clearStreamingText();
      options.setCompanionState(duplicateResult.companionState);
      return { kind: "handled" };
    }

    const message = error instanceof Error ? error.message : String(error);
    options.onUnexpectedError?.(message, phaseActivityId);
    throw error;
  }
}
