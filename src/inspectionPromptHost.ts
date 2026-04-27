import { type ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import { describeToolName as formatToolDisplayName } from "./hostRuntimeHelpers";
import { runInspectionCommandFlow } from "./inspectionCommandHost";
import {
  findOriginalTaskForInspection,
  isGreetingOnlyInspectionTask,
  isDuplicateBuiltInAgentRunError,
} from "./inspectionTaskHost";
import {
  inferInspectionLocale,
  type InspectionLocale,
} from "./inspectionLocale";
import { hasWorkspaceProjectEvidence } from "./inspectionWorkspace";
import type { VerificationVerdict } from "./verification/prompt";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { ToolDefinition } from "./toolRuntime";

type InspectionRuntimeLike = {
  getToolContext(mode?: string): unknown;
};

type SessionMessage = {
  role: "user" | "assistant";
  content: string;
};

type SharedOptions = {
  commandText: string;
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  runtime: InspectionRuntimeLike;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  sessionMessages: SessionMessage[];
  onToken: (token: string) => void;
  onToolStart: (toolName: string, input: Record<string, unknown>, execId: string) => void;
  onToolEnd: (execId: string, summary: string, isError: boolean) => void;
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
};

type InspectionUiText = {
  verificationNoOriginalTask: string;
  verificationWorkspaceFallbackTask: string;
  verificationGreetingOnlyTask: (originalTask: string) => string;
  verificationBlockedByPlanMode: string;
  verificationPhaseLabel: string;
  verificationPhaseDetail: string;
  verificationToolActivityLabel: (toolName: string) => string;
  verificationAbortActivityDetail: string;
  verificationAbortReply: string;
  verificationDuplicateActivityDetail: string;
  reviewNoOriginalTask: string;
  reviewWorkspaceFallbackTask: string;
  reviewGreetingOnlyTask: (originalTask: string) => string;
  reviewBlockedByPlanMode: string;
  reviewPhaseLabel: string;
  reviewPhaseDetail: string;
  reviewToolActivityLabel: (toolName: string) => string;
  reviewAbortActivityDetail: string;
  reviewAbortReply: string;
  reviewDuplicateActivityDetail: string;
};

function getInspectionUiText(locale: InspectionLocale): InspectionUiText {
  if (locale === "zh-CN") {
    return {
      verificationNoOriginalTask:
        "当前对话里还没有可验证的原始任务。先给我一个真实实现任务，或者先完成一轮实现后再运行 `/verify`。",
      verificationWorkspaceFallbackTask: "验证当前工作区项目状态",
      verificationGreetingOnlyTask: originalTask =>
        `当前原始任务 \`${originalTask}\` 只是问候/泛聊天，不是可验证的实现请求。本次不进入实现验证流程。请先给出真实实现任务后再运行 \`/verify\`。\n\nVERDICT: PARTIAL`,
      verificationBlockedByPlanMode:
        "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/verify`。",
      verificationPhaseLabel: "正在进行验证",
      verificationPhaseDetail:
        "Verification agent 正在运行构建、测试与对抗性检查",
      verificationToolActivityLabel: toolName => `验证中：${toolName}`,
      verificationAbortActivityDetail: "验证已取消",
      verificationAbortReply: "验证已在完成前取消。",
      verificationDuplicateActivityDetail: "验证已在运行",
      reviewNoOriginalTask:
        "当前对话里还没有可审查的原始任务或改动目标。先给我一个真实实现任务、PR/diff 范围，或者在当前项目里完成改动后再运行 `/review`。",
      reviewWorkspaceFallbackTask: "审查当前工作区项目改动",
      reviewGreetingOnlyTask: originalTask =>
        `当前原始任务 \`${originalTask}\` 只是问候/泛聊天，不是可审查的实现请求或 PR/diff 目标。本次不进入代码审查流程。请先给出真实实现任务、PR 或 diff 范围后再运行 \`/review\`。`,
      reviewBlockedByPlanMode:
        "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/review`。",
      reviewPhaseLabel: "正在进行审查",
      reviewPhaseDetail: "Review agent 正在检查当前改动与潜在风险",
      reviewToolActivityLabel: toolName => `审查中：${toolName}`,
      reviewAbortActivityDetail: "审查已取消",
      reviewAbortReply: "审查已在完成前取消。",
      reviewDuplicateActivityDetail: "审查已在运行",
    };
  }

  return {
    verificationNoOriginalTask:
      "There is no original task in this conversation yet. Give me a real implementation task first, or finish a round of implementation before running `/verify`.",
    verificationWorkspaceFallbackTask: "Verify the current workspace/project state.",
    verificationGreetingOnlyTask: originalTask =>
      `The original task \`${originalTask}\` is only a greeting / generic chat request, not a verifiable implementation request. Verification will not run yet. Give me a real implementation task before running \`/verify\`.\n\nVERDICT: PARTIAL`,
    verificationBlockedByPlanMode:
      "Plan Mode is still active. Exit Plan Mode before running `/verify`.",
    verificationPhaseLabel: "Running verification",
    verificationPhaseDetail:
      "The verification agent is running builds, tests, and adversarial checks.",
    verificationToolActivityLabel: toolName => `Verifying: ${toolName}`,
    verificationAbortActivityDetail: "Verification cancelled",
    verificationAbortReply: "Verification was cancelled before completion.",
    verificationDuplicateActivityDetail: "Verification already running",
    reviewNoOriginalTask:
      "There is no reviewable original task or change target in this conversation yet. Give me a real implementation task, PR/diff range, or finish workspace changes before running `/review`.",
    reviewWorkspaceFallbackTask: "Review the current workspace/project changes.",
    reviewGreetingOnlyTask: originalTask =>
      `The original task \`${originalTask}\` is only a greeting / generic chat request, not a reviewable implementation request or PR/diff target. Review will not run yet. Give me a real implementation task, PR, or diff range before running \`/review\`.`,
    reviewBlockedByPlanMode:
      "Plan Mode is still active. Exit Plan Mode before running `/review`.",
    reviewPhaseLabel: "Running review",
    reviewPhaseDetail:
      "The review agent is checking the current changes and potential risks.",
    reviewToolActivityLabel: toolName => `Reviewing: ${toolName}`,
    reviewAbortActivityDetail: "Review cancelled",
    reviewAbortReply: "Review was cancelled before completion.",
    reviewDuplicateActivityDetail: "Review already running",
  };
}

export async function handleVerificationPromptCommand(
  options: SharedOptions & {
    blockedByPlanMode: boolean;
    runVerificationSession: (options: {
      commandText: string;
      workspaceRoot: string;
      config: AdapterProviderConfig;
      envMap: Record<string, string>;
      runtime: InspectionRuntimeLike;
      tools: ToolDefinition[];
      runtimeOptions: ProviderRuntimeOptions;
      effortLevel: EffortLevel | undefined;
      promptForTask?: string;
      onToken?: (token: string) => void;
      onToolStart?: (
        toolName: string,
        input: Record<string, unknown>,
        execId: string,
      ) => void;
      onToolEnd?: (
        execId: string,
        summary: string,
        isError: boolean,
      ) => void;
    }) => Promise<{ taskId: string; report: string; verdict: VerificationVerdict }>;
    buildFollowUpMessage: (label: string, taskId: string) => string | undefined;
    onUnexpectedError: (message: string, activityId: string) => void;
  },
): Promise<boolean> {
  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  const uiText = getInspectionUiText(locale);
  const inspectionPrompt = findOriginalTaskForInspection(options.sessionMessages);
  const promptForTask = inspectionPrompt
    ?? (await hasWorkspaceProjectEvidence(options.workspaceRoot)
      ? uiText.verificationWorkspaceFallbackTask
      : null);
  if (options.commandText.startsWith("/verify") && !promptForTask) {
    await options.recordAssistantReply(uiText.verificationNoOriginalTask, false);
    return true;
  }

  if (inspectionPrompt && isGreetingOnlyInspectionTask(inspectionPrompt)) {
    await options.recordAssistantReply(
      uiText.verificationGreetingOnlyTask(inspectionPrompt),
      false,
    );
    return true;
  }

  const commandResult = await runInspectionCommandFlow({
    commandText: options.commandText,
    commandPrefix: "/verify",
    blockedByPlanMode: options.blockedByPlanMode,
    blockedByPlanModeMessage: uiText.verificationBlockedByPlanMode,
    phaseLabel: uiText.verificationPhaseLabel,
    phaseDetail: uiText.verificationPhaseDetail,
    toolActivityLabel: toolName =>
      uiText.verificationToolActivityLabel(formatToolDisplayName(toolName)),
    onToken: options.onToken,
    onToolStart: ({ toolName, input, execId }) =>
      options.onToolStart(toolName, input, execId),
    onToolEnd: ({ execId, summary, isError }) =>
      options.onToolEnd(execId, summary, isError),
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    isDuplicateRunError: error => isDuplicateBuiltInAgentRunError(error),
    runSession: hooks =>
      options.runVerificationSession({
        commandText: options.commandText,
        ...(promptForTask ? { promptForTask } : {}),
        workspaceRoot: options.workspaceRoot,
        config: options.config,
        envMap: options.envMap,
        runtime: options.runtime,
        tools: options.tools,
        runtimeOptions: options.runtimeOptions,
        effortLevel: options.effortLevel,
        onToken: hooks.onToken,
        onToolStart: hooks.onToolStart,
        onToolEnd: hooks.onToolEnd,
      }),
    onSuccess: async result => {
      const verificationPassed = result.verdict === "PASS";
      return {
        activityStatus: verificationPassed ? ("done" as const) : ("error" as const),
        activityDetail: `VERDICT: ${result.verdict}`,
        replies: [{ text: result.report }],
        companionState: verificationPassed ? ("done" as const) : ("idle" as const),
        moodDelta: verificationPassed ? 2 : -1,
        countConversation: verificationPassed,
      };
    },
    onAbort: async () => ({
      activityStatus: "done" as const,
      activityDetail: uiText.verificationAbortActivityDetail,
      reply: uiText.verificationAbortReply,
      companionState: "idle" as const,
    }),
    onDuplicate: async message => ({
      activityStatus: "done" as const,
      activityDetail: uiText.verificationDuplicateActivityDetail,
      reply: message,
      companionState: "idle" as const,
    }),
    onUnexpectedError: options.onUnexpectedError,
  });

  return commandResult.kind === "handled";
}

export async function handleReviewPromptCommand(
  options: SharedOptions & {
    blockedByPlanMode: boolean;
    runReviewSession: (options: {
      commandText: string;
      workspaceRoot: string;
      config: AdapterProviderConfig;
      envMap: Record<string, string>;
      runtime: InspectionRuntimeLike;
      tools: ToolDefinition[];
      runtimeOptions: ProviderRuntimeOptions;
      effortLevel: EffortLevel | undefined;
      promptForTask?: string;
      onToken?: (token: string) => void;
      onToolStart?: (
        toolName: string,
        input: Record<string, unknown>,
        execId: string,
      ) => void;
      onToolEnd?: (
        execId: string,
        summary: string,
        isError: boolean,
      ) => void;
    }) => Promise<{ taskId: string; report: string }>;
    buildFollowUpMessage: (label: string, taskId: string) => string | undefined;
  },
): Promise<boolean> {
  const locale = inferInspectionLocale(options.commandText, options.sessionMessages);
  const uiText = getInspectionUiText(locale);
  const inspectionPrompt = findOriginalTaskForInspection(options.sessionMessages);
  const promptForTask = inspectionPrompt
    ?? (await hasWorkspaceProjectEvidence(options.workspaceRoot)
      ? uiText.reviewWorkspaceFallbackTask
      : null);
  if (options.commandText.startsWith("/review") && !promptForTask) {
    await options.recordAssistantReply(uiText.reviewNoOriginalTask, false);
    return true;
  }

  if (inspectionPrompt && isGreetingOnlyInspectionTask(inspectionPrompt)) {
    await options.recordAssistantReply(
      uiText.reviewGreetingOnlyTask(inspectionPrompt),
      false,
    );
    return true;
  }

  const commandResult = await runInspectionCommandFlow({
    commandText: options.commandText,
    commandPrefix: "/review",
    blockedByPlanMode: options.blockedByPlanMode,
    blockedByPlanModeMessage: uiText.reviewBlockedByPlanMode,
    phaseLabel: uiText.reviewPhaseLabel,
    phaseDetail: uiText.reviewPhaseDetail,
    toolActivityLabel: toolName =>
      uiText.reviewToolActivityLabel(formatToolDisplayName(toolName)),
    onToken: options.onToken,
    onToolStart: ({ toolName, input, execId }) =>
      options.onToolStart(toolName, input, execId),
    onToolEnd: ({ execId, summary, isError }) =>
      options.onToolEnd(execId, summary, isError),
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    isDuplicateRunError: error => isDuplicateBuiltInAgentRunError(error),
    runSession: hooks =>
      options.runReviewSession({
        commandText: options.commandText,
        ...(promptForTask ? { promptForTask } : {}),
        workspaceRoot: options.workspaceRoot,
        config: options.config,
        envMap: options.envMap,
        runtime: options.runtime,
        tools: options.tools,
        runtimeOptions: options.runtimeOptions,
        effortLevel: options.effortLevel,
        onToken: hooks.onToken,
        onToolStart: hooks.onToolStart,
        onToolEnd: hooks.onToolEnd,
      }),
    onSuccess: async result => {
      return {
        activityStatus: "done" as const,
        replies: [{ text: result.report }],
        companionState: "done" as const,
        moodDelta: 2,
        countConversation: true,
      };
    },
    onAbort: async () => ({
      activityStatus: "done" as const,
      activityDetail: uiText.reviewAbortActivityDetail,
      reply: uiText.reviewAbortReply,
      companionState: "idle" as const,
    }),
    onDuplicate: async message => ({
      activityStatus: "done" as const,
      activityDetail: uiText.reviewDuplicateActivityDetail,
      reply: message,
      companionState: "idle" as const,
    }),
  });

  return commandResult.kind === "handled";
}
