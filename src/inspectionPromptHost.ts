import { type ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import { describeToolName as formatToolDisplayName } from "./hostRuntimeHelpers";
import { runInspectionCommandFlow } from "./inspectionCommandHost";
import {
  findOriginalTaskForInspection,
  isDuplicateBuiltInAgentRunError,
} from "./inspectionTaskHost";
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
    buildFollowUpMessage: (label: string, taskId: string) => string;
    onUnexpectedError: (message: string, activityId: string) => void;
  },
): Promise<boolean> {
  const inspectionPrompt = findOriginalTaskForInspection(options.sessionMessages);
  if (options.commandText.startsWith("/verify") && !inspectionPrompt) {
    await options.recordAssistantReply(
      "当前对话里还没有可验证的原始任务。先给我一个真实实现任务，或先完成一轮实现后再运行 `/verify`。",
      false,
    );
    return true;
  }

  const commandResult = await runInspectionCommandFlow({
    commandText: options.commandText,
    commandPrefix: "/verify",
    blockedByPlanMode: options.blockedByPlanMode,
    blockedByPlanModeMessage: "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/verify`。",
    phaseLabel: "正在进行验证",
    phaseDetail: "验证 agent 正在运行构建、测试与对抗性检查",
    toolActivityLabel: toolName => `验证中：${formatToolDisplayName(toolName)}`,
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
        replies: [
          { text: result.report },
          {
            text: options.buildFollowUpMessage("Verification", result.taskId),
            includeInConversation: false,
          },
        ],
        companionState: verificationPassed ? ("done" as const) : ("idle" as const),
        moodDelta: verificationPassed ? 2 : -1,
        countConversation: verificationPassed,
      };
    },
    onAbort: async () => ({
      activityStatus: "done" as const,
      activityDetail: "Verification cancelled",
      reply: "Verification was cancelled before completion.",
      companionState: "idle" as const,
    }),
    onDuplicate: async message => ({
      activityStatus: "done" as const,
      activityDetail: "Verification already running",
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
    buildFollowUpMessage: (label: string, taskId: string) => string;
  },
): Promise<boolean> {
  const commandResult = await runInspectionCommandFlow({
    commandText: options.commandText,
    commandPrefix: "/review",
    blockedByPlanMode: options.blockedByPlanMode,
    blockedByPlanModeMessage: "Plan Mode 仍在开启中，先退出 Plan Mode 再运行 `/review`。",
    phaseLabel: "正在进行审查",
    phaseDetail: "Review agent 正在检查当前改动与潜在风险",
    toolActivityLabel: toolName => `审查中：${formatToolDisplayName(toolName)}`,
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
    onSuccess: async result => ({
      activityStatus: "done" as const,
      replies: [
        { text: result.report },
        {
          text: options.buildFollowUpMessage("Review", result.taskId),
          includeInConversation: false,
        },
      ],
      companionState: "done" as const,
      moodDelta: 2,
      countConversation: true,
    }),
    onAbort: async () => ({
      activityStatus: "done" as const,
      activityDetail: "Review cancelled",
      reply: "Review was cancelled before completion.",
      companionState: "idle" as const,
    }),
    onDuplicate: async message => ({
      activityStatus: "done" as const,
      activityDetail: "Review already running",
      reply: message,
      companionState: "idle" as const,
    }),
  });

  return commandResult.kind === "handled";
}
