import {
  parseReviewDiffRef,
  parseReviewPrNumber,
  parseVerificationDiffRef,
} from "./agent/built-in/agentUtils";
import type { IProviderAdapter, ProviderConfig } from "./agent/providers/IProviderAdapter";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import type { HookDefinition } from "./hooksRegistry";
import {
  describeToolInput as formatToolInputPreview,
  describeToolName as formatToolDisplayName,
} from "./hostRuntimeHelpers";
import { inferInspectionLocale } from "./inspectionLocale";
import {
  handleReviewPromptCommand,
  handleVerificationPromptCommand,
} from "./inspectionPromptHost";
import {
  findOriginalTaskForInspection,
  isGreetingOnlyInspectionTask,
} from "./inspectionTaskHost";
import { hasWorkspaceProjectEvidence } from "./inspectionWorkspace";
import {
  launchHostedReviewWithHost,
} from "./remoteReviewHost";
import {
  launchHostedVerificationWithHost,
} from "./remoteVerificationHost";
import {
  runReviewInspectionSession,
  runVerificationInspectionSession,
} from "./inspectionSessionHost";
import type { ChatMessage } from "./storage/sessionRepository";
import type { BackgroundTaskRecord } from "./tasks/types";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import {
  runReviewFromTool as launchReviewFromTool,
  runVerificationFromTool as launchVerificationFromTool,
} from "./toolLaunchHost";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { VerificationVerdict } from "./verification/prompt";
import type {
  ProviderResolution,
  WorkspaceRuntimeLike,
} from "./workspaceHost";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type InspectionRuntimeLike = {
  getToolContext: () => ToolContext;
};

function getInspectionToolRunningLabel(
  kind: "review" | "verification",
  toolName: string,
  locale: "zh-CN" | "en",
): string {
  if (locale === "zh-CN") {
    return kind === "review" ? `审查中：${toolName}` : `验证中：${toolName}`;
  }

  return kind === "review" ? `Reviewing: ${toolName}` : `Verifying: ${toolName}`;
}

type HostedReviewUiText = {
  noOriginalTask: string;
  workspaceFallbackTask: string;
  currentWorkspaceTarget: string;
  greetingOnlyTask: (originalTask: string) => string;
  blockedByPlanMode: string;
  providerUnsupported: string;
  phaseLabel: string;
  phaseDetail: string;
  phaseDoneDetail: (taskId: string) => string;
  launchFailed: (message: string) => string;
  launchReply: (options: {
    taskId: string;
    targetLabel: string;
    outputPath: string;
  }) => string;
};

type HostedVerificationUiText = {
  noOriginalTask: string;
  workspaceFallbackTask: string;
  currentWorkspaceTarget: string;
  greetingOnlyTask: (originalTask: string) => string;
  blockedByPlanMode: string;
  providerUnsupported: string;
  phaseLabel: string;
  phaseDetail: string;
  phaseDoneDetail: (taskId: string) => string;
  launchFailed: (message: string) => string;
  launchReply: (options: {
    taskId: string;
    targetLabel: string;
    outputPath: string;
  }) => string;
};

function getHostedReviewUiText(
  locale: "zh-CN" | "en",
): HostedReviewUiText {
  if (locale === "zh-CN") {
    return {
      noOriginalTask:
        "当前对话里还没有可审查的原始任务或改动目标。先给我一个真实实现任务、PR/diff 范围，或先在当前项目里完成改动后再运行 `/ultrareview`。",
      workspaceFallbackTask: "审查当前工作区项目改动。",
      currentWorkspaceTarget: "当前工作区改动",
      greetingOnlyTask: originalTask =>
        `当前原始任务 \`${originalTask}\` 只是问候/泛聊天，不是可审查的实现请求或 PR/diff 目标。本次不进入 hosted review 流程。请先给出真实实现任务、PR 或 diff 范围后再运行 \`/ultrareview\`。`,
      blockedByPlanMode:
        "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/ultrareview`。",
      providerUnsupported:
        "当前 hosted `/ultrareview` 仅支持 Claude CLI provider。请先在设置中切到 Claude CLI，再重试。",
      phaseLabel: "正在启动 hosted review",
      phaseDetail: "后台 Claude CLI review 任务正在启动，完成后会通过通知回流结果。",
      phaseDoneDetail: taskId => `后台任务 ${taskId} 已启动`,
      launchFailed: message => `Hosted review 启动失败：${message}`,
      launchReply: ({ taskId, targetLabel, outputPath }) =>
        [
          "已启动 hosted review（后台 Claude CLI）：",
          `- Task ID: \`${taskId}\``,
          `- 目标: ${targetLabel}`,
          `- Output file: \`${outputPath}\``,
          "",
          "完成后会自动通知你；如果要提前查看中间输出，可直接读取输出文件，或使用 `TaskOutput` 查询该 task。",
        ].join("\n"),
    };
  }

  return {
    noOriginalTask:
      "There is no reviewable original task or change target in this conversation yet. Give me a real implementation task, PR/diff range, or finish workspace changes before running `/ultrareview`.",
    workspaceFallbackTask: "Review the current workspace/project changes.",
    currentWorkspaceTarget: "current workspace changes",
    greetingOnlyTask: originalTask =>
      `The original task \`${originalTask}\` is only a greeting / generic chat request, not a reviewable implementation request or PR/diff target. Hosted review will not run yet. Give me a real implementation task, PR, or diff range before running \`/ultrareview\`.`,
    blockedByPlanMode:
      "Plan Mode is still active. Exit Plan Mode before running `/ultrareview`.",
    providerUnsupported:
      "Hosted `/ultrareview` currently requires the Claude CLI provider in KainClaw. Switch to Claude CLI in settings and try again.",
    phaseLabel: "Launching hosted review",
    phaseDetail:
      "Starting a detached Claude CLI review task. Findings will arrive through task notification.",
    phaseDoneDetail: taskId => `Background task ${taskId} launched`,
    launchFailed: message => `Hosted review failed to launch: ${message}`,
    launchReply: ({ taskId, targetLabel, outputPath }) =>
      [
        "Hosted review launched in the background via Claude CLI:",
        `- Task ID: \`${taskId}\``,
        `- Target: ${targetLabel}`,
        `- Output file: \`${outputPath}\``,
        "",
        "You'll be notified when it completes. Read the output file or use `TaskOutput` only if you need partial output before then.",
      ].join("\n"),
  };
}

function getHostedVerificationUiText(
  locale: "zh-CN" | "en",
): HostedVerificationUiText {
  if (locale === "zh-CN") {
    return {
      noOriginalTask:
        "当前对话里还没有可验证的原始任务或改动目标。先给我一个真实实现任务、diff 范围，或先在当前项目里完成改动后再运行 `/ultraverify`。",
      workspaceFallbackTask: "验证当前工作区项目状态。",
      currentWorkspaceTarget: "当前工作区状态",
      greetingOnlyTask: originalTask =>
        `当前原始任务 \`${originalTask}\` 只是问候/泛聊天，不是可验证的实现请求或 diff 目标。本次不进入 hosted verification 流程。请先给出真实实现任务或 diff 范围后再运行 \`/ultraverify\`。`,
      blockedByPlanMode:
        "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/ultraverify`。",
      providerUnsupported:
        "当前 hosted `/ultraverify` 仅支持 Claude CLI provider。请先在设置中切到 Claude CLI，再重试。",
      phaseLabel: "正在启动 hosted verification",
      phaseDetail: "后台 Claude CLI verification 任务正在启动，完成后会通过通知回流结果。",
      phaseDoneDetail: taskId => `后台任务 ${taskId} 已启动`,
      launchFailed: message => `Hosted verification 启动失败：${message}`,
      launchReply: ({ taskId, targetLabel, outputPath }) =>
        [
          "已启动 hosted verification（后台 Claude CLI）：",
          `- Task ID: \`${taskId}\``,
          `- 目标: ${targetLabel}`,
          `- Output file: \`${outputPath}\``,
          "",
          "完成后会自动通知你；如果要提前查看中间输出，可直接读取输出文件，或使用 `TaskOutput` 查询该 task。",
        ].join("\n"),
    };
  }

  return {
    noOriginalTask:
      "There is no verifiable original task or change target in this conversation yet. Give me a real implementation task, diff range, or finish workspace changes before running `/ultraverify`.",
    workspaceFallbackTask: "Verify the current workspace/project state.",
    currentWorkspaceTarget: "current workspace state",
    greetingOnlyTask: originalTask =>
      `The original task \`${originalTask}\` is only a greeting / generic chat request, not a verifiable implementation request or diff target. Hosted verification will not run yet. Give me a real implementation task or diff range before running \`/ultraverify\`.`,
    blockedByPlanMode:
      "Plan Mode is still active. Exit Plan Mode before running `/ultraverify`.",
    providerUnsupported:
      "Hosted `/ultraverify` currently requires the Claude CLI provider in KainClaw. Switch to Claude CLI in settings and try again.",
    phaseLabel: "Launching hosted verification",
    phaseDetail:
      "Starting a detached Claude CLI verification task. The verification report will arrive through task notification.",
    phaseDoneDetail: taskId => `Background task ${taskId} launched`,
    launchFailed: message => `Hosted verification failed to launch: ${message}`,
    launchReply: ({ taskId, targetLabel, outputPath }) =>
      [
        "Hosted verification launched in the background via Claude CLI:",
        `- Task ID: \`${taskId}\``,
        `- Target: ${targetLabel}`,
        `- Output file: \`${outputPath}\``,
        "",
        "You'll be notified when it completes. Read the output file or use `TaskOutput` only if you need partial output before then.",
      ].join("\n"),
  };
}

function describeHostedReviewTarget(
  commandText: string,
  currentWorkspaceTarget: string,
): string {
  const reviewCommandText = commandText.replace(/^\/ultrareview/i, "/review");
  const prNumber = parseReviewPrNumber(reviewCommandText);
  if (prNumber) {
    return `PR #${prNumber}`;
  }

  const diffRef = parseReviewDiffRef(reviewCommandText);
  if (diffRef) {
    return `\`${diffRef}\``;
  }

  return currentWorkspaceTarget;
}

function describeHostedVerificationTarget(
  commandText: string,
  currentWorkspaceTarget: string,
): string {
  const verificationCommandText = commandText.replace(
    /^\/ultraverify/i,
    "/verify",
  );
  const diffRef = parseVerificationDiffRef(verificationCommandText);
  if (diffRef) {
    return `\`${diffRef}\``;
  }

  return currentWorkspaceTarget;
}

type SharedInspectionSessionHostOptions<TRuntime extends InspectionRuntimeLike> = {
  commandText: string;
  workspaceRoot: string;
  promptForTask?: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  runtime: TRuntime;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  getConversationHistory: () => ConversationMessage[];
  sessionMessages: ChatMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>, execId: string) => void;
  onToolEnd?: (execId: string, summary: string, isError: boolean) => void;
  hooks?: HookDefinition[];
  sessionId?: string;
};

type SharedInspectionCommandHostOptions<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
> = {
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  runtime: TRuntime;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  sessionMessages: ChatMessage[];
  blockedByPlanMode: boolean;
  getConversationHistory: () => ConversationMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    | "runBuiltInAgentSession"
    | "buildFollowUpMessage"
    | "runDetachedRemoteReview"
    | "runDetachedRemoteVerification"
  >;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  onStreamingToken: (token: string) => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: "done" | "error",
    summary?: string,
  ) => void;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: "done" | "error",
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
  hooks?: HookDefinition[];
  sessionId?: string;
};

export async function runVerificationSessionWithHost<TRuntime extends InspectionRuntimeLike>(options: SharedInspectionSessionHostOptions<TRuntime> & {
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
}): Promise<{ taskId: string; report: string; verdict: VerificationVerdict }> {
  return runVerificationInspectionSession({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    ...(options.promptForTask ? { promptForTask: options.promptForTask } : {}),
    config: options.config,
    effortLevel: options.effortLevel,
    runtime: options.runtime,
    tools: options.tools,
    conversationHistory: options.getConversationHistory(),
    sessionMessages: options.sessionMessages,
    pendingPlanVerification: options.getPendingPlanVerification(),
    backgroundTaskHost: options.backgroundTaskHost,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: systemPrompt =>
      options.createProviderAdapter({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        systemPrompt,
        envMap: options.envMap,
        runtimeOptions: options.runtimeOptions,
      }),
    markPendingPlanVerificationStarted: options.markPendingPlanVerificationStarted,
    markPendingPlanVerificationCompleted: options.markPendingPlanVerificationCompleted,
    resetPendingPlanVerificationToAwaitingStart:
      options.resetPendingPlanVerificationToAwaitingStart,
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    hooks: options.hooks,
    sessionId: options.sessionId,
  });
}

export async function runReviewSessionWithHost<TRuntime extends InspectionRuntimeLike>(
  options: SharedInspectionSessionHostOptions<TRuntime>,
): Promise<{ taskId: string; report: string }> {
  return runReviewInspectionSession({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    effortLevel: options.effortLevel,
    runtime: options.runtime,
    tools: options.tools,
    conversationHistory: options.getConversationHistory(),
    sessionMessages: options.sessionMessages,
    pendingPlanVerification: options.getPendingPlanVerification(),
    backgroundTaskHost: options.backgroundTaskHost,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: systemPrompt =>
      options.createProviderAdapter({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        systemPrompt,
        envMap: options.envMap,
        runtimeOptions: options.runtimeOptions,
      }),
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    hooks: options.hooks,
    sessionId: options.sessionId,
  });
}

type SharedInspectionToolHostOptions<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
> = {
  workspaceFolderPath: string;
  resolveProviderConfig: () => Promise<ProviderResolution>;
  getEffortLevel: () => EffortLevel | undefined;
  createProviderRuntimeOptions: (
    config: ProviderConfig,
  ) => ProviderRuntimeOptions;
  ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  getWorkspaceRuntime: (envMap: Record<string, string>) => Promise<TRuntime>;
  getConversationHistory: () => ConversationMessage[];
  sessionMessages: ChatMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  hooks?: HookDefinition[];
  sessionId?: string;
};

export async function runVerificationFromToolWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionToolHostOptions<TRuntime> & {
    extraGuidance?: string;
    diffRef?: string;
    markPendingPlanVerificationStarted: () => void;
    markPendingPlanVerificationCompleted: () => void;
    resetPendingPlanVerificationToAwaitingStart: () => void;
  },
): Promise<{ taskId: string; report: string; verdict: VerificationVerdict }> {
  return launchVerificationFromTool({
    workspaceFolderPath: options.workspaceFolderPath,
    extraGuidance: options.extraGuidance,
    diffRef: options.diffRef,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
    runVerificationSession: sessionOptions =>
      runVerificationSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        hooks: options.hooks,
        sessionId: options.sessionId,
        markPendingPlanVerificationStarted:
          options.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          options.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          options.resetPendingPlanVerificationToAwaitingStart,
      }),
  });
}

export async function runReviewFromToolWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionToolHostOptions<TRuntime> & {
    extraGuidance?: string;
    diffRef?: string;
  },
): Promise<{ taskId: string; report: string }> {
  return launchReviewFromTool({
    workspaceFolderPath: options.workspaceFolderPath,
    extraGuidance: options.extraGuidance,
    diffRef: options.diffRef,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
    runReviewSession: sessionOptions =>
      runReviewSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        hooks: options.hooks,
        sessionId: options.sessionId,
      }),
  });
}

export async function handleVerificationCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionCommandHostOptions<TRuntime> & {
    promptForTask?: string;
    markPendingPlanVerificationStarted: () => void;
    markPendingPlanVerificationCompleted: () => void;
    resetPendingPlanVerificationToAwaitingStart: () => void;
    onUnexpectedError: (message: string, activityId: string) => void;
  },
): Promise<boolean> {
  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  return handleVerificationPromptCommand({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    ...(options.promptForTask ? { promptForTask: options.promptForTask } : {}),
    config: options.config,
    envMap: options.envMap,
    runtime: options.runtime,
    tools: options.tools,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.effortLevel,
    sessionMessages: options.sessionMessages,
    blockedByPlanMode: options.blockedByPlanMode,
    onToken: options.onStreamingToken,
    onToolStart: (toolName, input, execId) => {
      options.startToolExecution(
        execId,
        getInspectionToolRunningLabel(
          "verification",
          formatToolDisplayName(toolName),
          locale,
        ),
        formatToolInputPreview(input),
      );
    },
    onToolEnd: (execId, summary, isError) => {
      options.finishToolExecution(
        execId,
        isError ? "error" : "done",
        summary,
      );
    },
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    runVerificationSession: sessionOptions =>
      runVerificationSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        hooks: options.hooks,
        sessionId: options.sessionId,
        markPendingPlanVerificationStarted:
          options.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          options.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          options.resetPendingPlanVerificationToAwaitingStart,
      }),
    buildFollowUpMessage: (label, taskId) =>
      options.backgroundTaskHost.buildFollowUpMessage(label, taskId),
    onUnexpectedError: options.onUnexpectedError,
  });
}

export async function handleReviewCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionCommandHostOptions<TRuntime>,
): Promise<boolean> {
  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  return handleReviewPromptCommand({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    envMap: options.envMap,
    runtime: options.runtime,
    tools: options.tools,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.effortLevel,
    sessionMessages: options.sessionMessages,
    blockedByPlanMode: options.blockedByPlanMode,
    onToken: options.onStreamingToken,
    onToolStart: (toolName, input, execId) => {
      options.startToolExecution(
        execId,
        getInspectionToolRunningLabel("review", formatToolDisplayName(toolName), locale),
        formatToolInputPreview(input),
      );
    },
    onToolEnd: (execId, summary, isError) => {
      options.finishToolExecution(
        execId,
        isError ? "error" : "done",
        summary,
      );
    },
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    runReviewSession: sessionOptions =>
      runReviewSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        hooks: options.hooks,
        sessionId: options.sessionId,
      }),
    buildFollowUpMessage: (label, taskId) =>
      options.backgroundTaskHost.buildFollowUpMessage(label, taskId),
  });
}

export async function handleUltrareviewCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: Pick<
    SharedInspectionCommandHostOptions<TRuntime>,
    | "commandText"
    | "workspaceRoot"
    | "config"
    | "runtimeOptions"
    | "effortLevel"
    | "sessionMessages"
    | "blockedByPlanMode"
    | "getConversationHistory"
    | "getPendingPlanVerification"
    | "backgroundTaskHost"
    | "recordAssistantReply"
    | "setCompanionState"
    | "clearStreamingText"
    | "updateMood"
    | "isAbortLikeError"
    | "addPhaseActivity"
    | "finishPhaseActivity"
  > & {
    envMap: Record<string, string>;
    runtime: TRuntime;
    tools: ToolDefinition[];
    hooks?: HookDefinition[];
    sessionId?: string;
  },
): Promise<boolean> {
  if (!/^\/ultrareview(?:\s|$)/i.test(options.commandText.trim())) {
    return false;
  }

  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  const uiText = getHostedReviewUiText(locale);

  if (options.blockedByPlanMode) {
    await options.recordAssistantReply(uiText.blockedByPlanMode, false);
    return true;
  }

  const originalPrompt = findOriginalTaskForInspection(options.sessionMessages);
  const promptForTask = originalPrompt
    ?? (await hasWorkspaceProjectEvidence(options.workspaceRoot)
      ? uiText.workspaceFallbackTask
      : null);

  if (!promptForTask) {
    await options.recordAssistantReply(uiText.noOriginalTask, false);
    return true;
  }

  if (originalPrompt && isGreetingOnlyInspectionTask(originalPrompt)) {
    await options.recordAssistantReply(
      uiText.greetingOnlyTask(originalPrompt),
      false,
    );
    return true;
  }

  if (options.config.type !== "claude-cli") {
    await options.recordAssistantReply(uiText.providerUnsupported, false);
    return true;
  }

  const phaseActivityId = options.addPhaseActivity(
    uiText.phaseLabel,
    uiText.phaseDetail,
    "running",
  );
  options.setCompanionState("thinking");

  try {
    const pendingPlanVerification = options.getPendingPlanVerification();
    const launched = await launchHostedReviewWithHost({
      commandText: options.commandText,
      workspaceRoot: options.workspaceRoot,
      config: options.config,
      effortLevel: options.effortLevel,
      conversationHistory: options.getConversationHistory(),
      originalTask: promptForTask,
      sessionMessages: options.sessionMessages,
      planFilePath: pendingPlanVerification?.planFilePath,
      planContent: pendingPlanVerification?.planContent ?? null,
      backgroundTaskHost: options.backgroundTaskHost,
    });

    options.finishPhaseActivity(
      phaseActivityId,
      "done",
      uiText.phaseDoneDetail(launched.taskId),
    );
    await options.recordAssistantReply(
      uiText.launchReply({
        taskId: launched.taskId,
        targetLabel: describeHostedReviewTarget(
          options.commandText,
          uiText.currentWorkspaceTarget,
        ),
        outputPath: launched.outputPath,
      }),
      false,
    );
    options.clearStreamingText();
    options.setCompanionState("done");
    await options.updateMood(1, false);
    return true;
  } catch (error) {
    if (options.isAbortLikeError(error)) {
      options.finishPhaseActivity(phaseActivityId, "done", "cancelled");
      await options.recordAssistantReply("Hosted review was cancelled before launch.", false);
      options.clearStreamingText();
      options.setCompanionState("idle");
      return true;
    }

    const message = error instanceof Error ? error.message : String(error);
    options.finishPhaseActivity(
      phaseActivityId,
      "error",
      message,
    );
    await options.recordAssistantReply(uiText.launchFailed(message), false);
    options.clearStreamingText();
    options.setCompanionState("idle");
    return true;
  }
}

export async function handleUltraverifyCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: Pick<
    SharedInspectionCommandHostOptions<TRuntime>,
    | "commandText"
    | "workspaceRoot"
    | "config"
    | "runtimeOptions"
    | "effortLevel"
    | "sessionMessages"
    | "blockedByPlanMode"
    | "getConversationHistory"
    | "getPendingPlanVerification"
    | "backgroundTaskHost"
    | "recordAssistantReply"
    | "setCompanionState"
    | "clearStreamingText"
    | "updateMood"
    | "isAbortLikeError"
    | "addPhaseActivity"
    | "finishPhaseActivity"
  > & {
    envMap: Record<string, string>;
    runtime: TRuntime;
    tools: ToolDefinition[];
    hooks?: HookDefinition[];
    sessionId?: string;
  },
): Promise<boolean> {
  if (!/^\/ultraverify(?:\s|$)/i.test(options.commandText.trim())) {
    return false;
  }

  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  const uiText = getHostedVerificationUiText(locale);

  if (options.blockedByPlanMode) {
    await options.recordAssistantReply(uiText.blockedByPlanMode, false);
    return true;
  }

  const originalPrompt = findOriginalTaskForInspection(options.sessionMessages);
  const promptForTask = originalPrompt
    ?? (await hasWorkspaceProjectEvidence(options.workspaceRoot)
      ? uiText.workspaceFallbackTask
      : null);

  if (!promptForTask) {
    await options.recordAssistantReply(uiText.noOriginalTask, false);
    return true;
  }

  if (originalPrompt && isGreetingOnlyInspectionTask(originalPrompt)) {
    await options.recordAssistantReply(
      uiText.greetingOnlyTask(originalPrompt),
      false,
    );
    return true;
  }

  if (options.config.type !== "claude-cli") {
    await options.recordAssistantReply(uiText.providerUnsupported, false);
    return true;
  }

  const phaseActivityId = options.addPhaseActivity(
    uiText.phaseLabel,
    uiText.phaseDetail,
    "running",
  );
  options.setCompanionState("thinking");

  try {
    const pendingPlanVerification = options.getPendingPlanVerification();
    const launched = await launchHostedVerificationWithHost({
      commandText: options.commandText,
      workspaceRoot: options.workspaceRoot,
      config: options.config,
      effortLevel: options.effortLevel,
      conversationHistory: options.getConversationHistory(),
      originalTask: promptForTask,
      sessionMessages: options.sessionMessages,
      planFilePath: pendingPlanVerification?.planFilePath,
      planContent: pendingPlanVerification?.planContent ?? null,
      backgroundTaskHost: options.backgroundTaskHost,
    });

    options.finishPhaseActivity(
      phaseActivityId,
      "done",
      uiText.phaseDoneDetail(launched.taskId),
    );
    await options.recordAssistantReply(
      uiText.launchReply({
        taskId: launched.taskId,
        targetLabel: describeHostedVerificationTarget(
          options.commandText,
          uiText.currentWorkspaceTarget,
        ),
        outputPath: launched.outputPath,
      }),
      false,
    );
    options.clearStreamingText();
    options.setCompanionState("done");
    await options.updateMood(1, false);
    return true;
  } catch (error) {
    if (options.isAbortLikeError(error)) {
      options.finishPhaseActivity(phaseActivityId, "done", "cancelled");
      await options.recordAssistantReply("Hosted verification was cancelled before launch.", false);
      options.clearStreamingText();
      options.setCompanionState("idle");
      return true;
    }

    const message = error instanceof Error ? error.message : String(error);
    options.finishPhaseActivity(
      phaseActivityId,
      "error",
      message,
    );
    await options.recordAssistantReply(uiText.launchFailed(message), false);
    options.clearStreamingText();
    options.setCompanionState("idle");
    return true;
  }
}
