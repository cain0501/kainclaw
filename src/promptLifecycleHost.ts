import type { ActivityTracker } from "./activityTracker";
import type { NormalizedImageAttachment } from "./agent/providers/IProviderAdapter";

type SessionMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "chat" | "error" | "thinking";
  attachments?: NormalizedImageAttachment[];
};

export type BeginPromptTurnResult =
  | { kind: "skip" }
  | { kind: "blocked" }
  | {
      kind: "continue";
      trimmedPrompt: string;
      workspaceFolderPath: string;
      analyzeActivityId: string;
    };

export type PromptWorkspaceFolderLike = {
  uri: {
    fsPath: string;
  };
};

export function createBeginPromptTurnBindings(options: {
  prompt: string;
  attachments?: NormalizedImageAttachment[];
  isBusy: boolean;
  hasPendingApproval: boolean;
  ensureReadySequence: () => Promise<void>;
  workspaceFolderPath?: string;
  sessionMessages: SessionMessage[];
  clearStreamingState: () => void;
  activityTracker: Pick<ActivityTracker, "reset" | "add">;
  setBusy: (busy: boolean) => void;
  postState: () => void;
  showErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): Parameters<typeof beginPromptTurn>[0] {
  return {
    prompt: options.prompt,
    attachments: options.attachments,
    isBusy: options.isBusy,
    hasPendingApproval: options.hasPendingApproval,
    ensureReadySequence: options.ensureReadySequence,
    workspaceFolderPath: options.workspaceFolderPath,
    appendSessionMessage: message => {
      options.sessionMessages.push(message);
    },
    clearStreamingState: options.clearStreamingState,
    resetActivityTracker: () => options.activityTracker.reset(),
    setBusy: options.setBusy,
    addPhaseActivity: (label, detail, status) =>
      options.activityTracker.add("phase", label, detail, status),
    postState: options.postState,
    showErrorMessage: options.showErrorMessage,
    toErrorMessage: options.toErrorMessage,
  };
}

export async function beginPromptTurn(options: {
  prompt: string;
  attachments?: NormalizedImageAttachment[];
  isBusy: boolean;
  hasPendingApproval: boolean;
  ensureReadySequence: () => Promise<void>;
  workspaceFolderPath?: string;
  appendSessionMessage: (message: SessionMessage) => void;
  clearStreamingState: () => void;
  resetActivityTracker: () => void;
  setBusy: (busy: boolean) => void;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  postState: () => void;
  showErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): Promise<BeginPromptTurnResult> {
  const trimmedPrompt = options.prompt.trim();
  if (!trimmedPrompt || options.isBusy || options.hasPendingApproval) {
    return { kind: "skip" };
  }

  try {
    await options.ensureReadySequence();
  } catch (error) {
    options.showErrorMessage(options.toErrorMessage(error));
    return { kind: "blocked" };
  }

  if (!options.workspaceFolderPath) {
    options.appendSessionMessage({
      role: "assistant",
      content: "Open a workspace folder before using the assistant.",
      kind: "error",
    });
    options.postState();
    return { kind: "blocked" };
  }

  options.appendSessionMessage({
    role: "user",
    content: trimmedPrompt,
    ...(options.attachments && options.attachments.length > 0
      ? { attachments: options.attachments }
      : {}),
  });
  options.clearStreamingState();
  options.resetActivityTracker();
  options.setBusy(true);
  const analyzeActivityId = options.addPhaseActivity(
    "正在理解你的请求",
    "准备当前工作区上下文",
    "running",
  );
  options.postState();

  return {
    kind: "continue",
    trimmedPrompt,
    workspaceFolderPath: options.workspaceFolderPath,
    analyzeActivityId,
  };
}

export function resolvePromptTurnContinuation<
  TWorkspaceFolder extends PromptWorkspaceFolderLike,
>(options: {
  begin: Extract<BeginPromptTurnResult, { kind: "continue" }>;
  workspaceFolder: TWorkspaceFolder | undefined;
  hasExplicitSwarmIntent: (prompt: string) => boolean;
  isSwarmEnabled: boolean;
  postLicenseRequired: (feature: "swarm") => void;
  setBusy: (busy: boolean) => void;
  postState: () => void;
}):
  | { kind: "stop" }
  | {
      kind: "continue";
      trimmedPrompt: string;
      workspaceFolder: TWorkspaceFolder;
    } {
  if (
    !options.workspaceFolder ||
    options.workspaceFolder.uri.fsPath !== options.begin.workspaceFolderPath
  ) {
    return { kind: "stop" };
  }

  if (
    options.hasExplicitSwarmIntent(options.begin.trimmedPrompt) &&
    !options.isSwarmEnabled
  ) {
    options.postLicenseRequired("swarm");
    options.setBusy(false);
    options.postState();
    return { kind: "stop" };
  }

  return {
    kind: "continue",
    trimmedPrompt: options.begin.trimmedPrompt,
    workspaceFolder: options.workspaceFolder,
  };
}

export async function preparePromptTurn<
  TWorkspaceFolder extends PromptWorkspaceFolderLike,
>(options: {
  beginBindings: Parameters<typeof beginPromptTurn>[0];
  workspaceFolder: TWorkspaceFolder | undefined;
  hasExplicitSwarmIntent: (prompt: string) => boolean;
  isSwarmEnabled: boolean;
  postLicenseRequired: (feature: "swarm") => void;
  setBusy: (busy: boolean) => void;
  postState: () => void;
}):
  Promise<
    | { kind: "stop" }
    | {
        kind: "continue";
        analyzeActivityId: string;
        trimmedPrompt: string;
        workspaceFolder: TWorkspaceFolder;
      }
  > {
  const begin = await beginPromptTurn(options.beginBindings);
  if (begin.kind !== "continue") {
    return { kind: "stop" };
  }

  const continuation = resolvePromptTurnContinuation({
    begin,
    workspaceFolder: options.workspaceFolder,
    hasExplicitSwarmIntent: options.hasExplicitSwarmIntent,
    isSwarmEnabled: options.isSwarmEnabled,
    postLicenseRequired: options.postLicenseRequired,
    setBusy: options.setBusy,
    postState: options.postState,
  });
  if (continuation.kind !== "continue") {
    return { kind: "stop" };
  }

  return {
    kind: "continue",
    analyzeActivityId: begin.analyzeActivityId,
    trimmedPrompt: continuation.trimmedPrompt,
    workspaceFolder: continuation.workspaceFolder,
  };
}

export async function handlePromptTurnFailure(options: {
  error: unknown;
  addFailureActivity: (message: string) => void;
  appendSessionMessage: (message: SessionMessage) => void;
  setCompanionState: (state: "idle") => void;
  updateMood: (delta: number) => Promise<void>;
  moodPenaltyApplied: boolean;
  showErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): Promise<void> {
  const message = options.toErrorMessage(options.error);
  options.addFailureActivity(message);
  options.appendSessionMessage({
    role: "assistant",
    content: message,
    kind: "error",
  });
  options.setCompanionState("idle");
  if (!options.moodPenaltyApplied) {
    await options.updateMood(-2);
  }
  options.showErrorMessage(message);
}

export function createPromptTurnFailureBindings(options: {
  error: unknown;
  sessionMessages: SessionMessage[];
  activityTracker: Pick<ActivityTracker, "add">;
  getFailureActivityLabel: () => string;
  setCompanionState: (state: "idle") => void;
  updateMood: (delta: number) => Promise<void>;
  moodPenaltyApplied: boolean;
  showErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): Parameters<typeof handlePromptTurnFailure>[0] {
  return {
    error: options.error,
    addFailureActivity: message => {
      options.activityTracker.add(
        "phase",
        options.getFailureActivityLabel(),
        message,
        "error",
      );
    },
    appendSessionMessage: message => {
      options.sessionMessages.push(message);
    },
    setCompanionState: options.setCompanionState,
    updateMood: options.updateMood,
    moodPenaltyApplied: options.moodPenaltyApplied,
    showErrorMessage: options.showErrorMessage,
    toErrorMessage: options.toErrorMessage,
  };
}

export async function finalizePromptTurn(options: {
  flushSessions: () => Promise<void>;
  archiveActivityTracker: () => void;
  clearStreamingState: () => void;
  setBusy: (busy: boolean) => void;
  postState: () => void;
}): Promise<void> {
  await options.flushSessions();
  options.archiveActivityTracker();
  options.clearStreamingState();
  options.setBusy(false);
  options.postState();
}

export function createFinalizePromptTurnBindings(options: {
  flushSessions: () => Promise<void>;
  activityTracker: Pick<ActivityTracker, "archiveCurrentRun">;
  clearStreamingState: () => void;
  setBusy: (busy: boolean) => void;
  postState: () => void;
}): Parameters<typeof finalizePromptTurn>[0] {
  return {
    flushSessions: options.flushSessions,
    archiveActivityTracker: () => options.activityTracker.archiveCurrentRun(),
    clearStreamingState: options.clearStreamingState,
    setBusy: options.setBusy,
    postState: options.postState,
  };
}

export async function runPromptTurnExecution(options: {
  analyzeActivityId: string;
  finishAnalyzeActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  runPromptRequest: () => Promise<void>;
  buildFailureBindings: (
    error: unknown,
  ) => Parameters<typeof handlePromptTurnFailure>[0];
  finalizeBindings: Parameters<typeof finalizePromptTurn>[0];
}): Promise<void> {
  try {
    options.finishAnalyzeActivity(options.analyzeActivityId, "done");
    await options.runPromptRequest();
  } catch (error) {
    await handlePromptTurnFailure(options.buildFailureBindings(error));
  } finally {
    await finalizePromptTurn(options.finalizeBindings);
  }
}
