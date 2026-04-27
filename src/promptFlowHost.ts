import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
  NormalizedImageAttachment,
  NormalizedMessage,
} from "./agent/providers/IProviderAdapter";
import type { PromptExecutionResult, PromptRuntimeLike } from "./promptExecutionHost";
import type { PromptSharedBindings } from "./promptBindingsHost";
import { buildInjectedPrompt, triggerHooks } from "./hooks/hooksTrigger";
import type { AgentRunner, HookContext } from "./hooks/hooksExecutor";
import { applyPromptTurnUserContext } from "./promptSetupHost";
import {
  createPromptTurnAgentCallbacks,
  runPromptAgentTurn,
  runPromptTurnWithHost,
} from "./promptTurnHost";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { HookDefinition } from "./hooksRegistry";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";

type PromptConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: NormalizedImageAttachment[];
};

type PhaseActivityStatus = "running" | "done" | "error";

type ContinuePromptExecution<TRuntime extends PromptRuntimeLike> = Extract<
  PromptExecutionResult<TRuntime>,
  { kind: "continue" }
>;

function buildInstalledSkillAgentHookPrompt(
  hook: HookDefinition,
  context: HookContext,
): string {
  const payload = JSON.stringify({
    event: context.event,
    workspaceRoot: context.workspaceRoot,
    sessionId: context.sessionId,
    toolName: context.toolName,
    toolInput: context.toolInput,
    toolOutput: context.toolOutput,
    prompt: context.prompt,
    reply: context.reply,
  });

  const template = hook.agentPrompt ?? hook.prompt ?? "";
  if (!template.trim()) {
    return `Installed skill agent hook context:\n\n${payload}`;
  }

  const replaced = template.replaceAll("$ARGUMENTS", payload);
  return replaced === template
    ? `${template}\n\nARGUMENTS: ${payload}`
    : replaced;
}

async function runInstalledSkillAgentHook<TRuntime extends PromptRuntimeLike>(options: {
  hook: HookDefinition;
  context: HookContext;
  promptExecution: ContinuePromptExecution<TRuntime>;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
}): Promise<void> {
  const hookPrompt = buildInstalledSkillAgentHookPrompt(
    options.hook,
    options.context,
  );

  const hookConfig =
    options.hook.agentModel && "model" in options.promptExecution.config
      ? { ...options.promptExecution.config, model: options.hook.agentModel }
      : options.promptExecution.config;

  const systemPrompt = await options.buildWorkspaceSystemPrompt(
    options.promptExecution.workspaceRoot,
    hookConfig,
    options.promptExecution.effortLevel,
  );
  const provider = options.buildProviderAdapter({
    config: hookConfig,
    workspaceRoot: options.promptExecution.workspaceRoot,
    systemPrompt,
    envMap: options.promptExecution.envMap,
    runtimeOptions: options.promptExecution.runtimeOptions,
  });

  await runPromptAgentTurn({
    history: [
      {
        role: "user",
        content: hookPrompt,
      },
    ],
    provider,
    tools: options.promptExecution.tools,
    toolContext: options.promptExecution.runtime.getToolContext(),
  });
}

function createInstalledSkillAgentRunner<TRuntime extends PromptRuntimeLike>(options: {
  promptExecution: ContinuePromptExecution<TRuntime>;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
}): AgentRunner {
  return (hook, context) =>
    runInstalledSkillAgentHook({
      hook,
      context,
      promptExecution: options.promptExecution,
      buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
      buildProviderAdapter: options.buildProviderAdapter,
    });
}

async function runForkedInstalledSkillFlow<TRuntime extends PromptRuntimeLike>(options: {
  promptExecution: ContinuePromptExecution<TRuntime>;
  createModelActivity: () => string;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  appendStreamingToken: (token: string) => void;
  logFirstToken: (token: string) => void;
  postToken: (token: string) => void;
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
  onToolError?: () => void;
  finishModelActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  logNoStreamingReply: () => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  runPromptAgentTurnImpl?: typeof runPromptAgentTurn;
}): Promise<void> {
  const modelActivityId = options.createModelActivity();
  const prePromptHooks = options.promptExecution.installedSkillHooks ?? [];
  const installedSkillAgentRunner = createInstalledSkillAgentRunner({
    promptExecution: options.promptExecution,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    buildProviderAdapter: options.buildProviderAdapter,
  });
  let effectivePrompt = options.promptExecution.effectivePrompt;
  if (prePromptHooks.length > 0) {
    const prePromptResult = await triggerHooks(
      "PrePrompt",
      prePromptHooks,
      {
        workspaceRoot: options.promptExecution.workspaceRoot,
        prompt: effectivePrompt,
      },
      installedSkillAgentRunner,
    );
    if (prePromptResult.promptPrefixInjection) {
      effectivePrompt = buildInjectedPrompt(
        effectivePrompt,
        prePromptResult.promptPrefixInjection,
        "prefix",
      );
    }
    if (prePromptResult.promptSuffixInjection) {
      effectivePrompt = buildInjectedPrompt(
        effectivePrompt,
        prePromptResult.promptSuffixInjection,
        "suffix",
      );
    }
  }
  const systemPrompt = await options.buildWorkspaceSystemPrompt(
    options.promptExecution.workspaceRoot,
    options.promptExecution.config,
    options.promptExecution.effortLevel,
  );
  const provider = options.buildProviderAdapter({
    config: options.promptExecution.config,
    workspaceRoot: options.promptExecution.workspaceRoot,
    systemPrompt,
    envMap: options.promptExecution.envMap,
    runtimeOptions: options.promptExecution.runtimeOptions,
  });

  const promptTurnAgentCallbacks = createPromptTurnAgentCallbacks({
    appendStreamingToken: options.appendStreamingToken,
    logFirstToken: options.logFirstToken,
    postToken: options.postToken,
    setCompanionState: state => options.setCompanionState(state),
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
  });

  options.setCompanionState("thinking");

  const history: NormalizedMessage[] = [
    {
      role: "user",
      content: effectivePrompt,
      ...(options.promptExecution.effectivePromptAttachments?.length
        ? { attachments: options.promptExecution.effectivePromptAttachments }
        : {}),
    },
  ];

  const runPromptAgentTurnImpl =
    options.runPromptAgentTurnImpl ?? runPromptAgentTurn;
  const { reply, sawStreamingToken, latestThinkingSummary } =
    await runPromptAgentTurnImpl({
      history,
      provider,
      tools: options.promptExecution.tools,
      toolContext: options.promptExecution.runtime.getToolContext(),
      installedSkillHooks: options.promptExecution.installedSkillHooks,
      onToken: promptTurnAgentCallbacks.onToken,
      onToolStart: promptTurnAgentCallbacks.onToolStart,
      onToolEnd: promptTurnAgentCallbacks.onToolEnd,
    });

  if (prePromptHooks.length > 0) {
    await triggerHooks(
      "PostPrompt",
      prePromptHooks,
      {
        workspaceRoot: options.promptExecution.workspaceRoot,
        prompt: effectivePrompt,
        reply,
      },
      installedSkillAgentRunner,
    );
  }

  options.finishModelActivity(modelActivityId, "done");
  if (!sawStreamingToken && reply) {
    options.logNoStreamingReply();
  }
  await options.recordAssistantReply(
    reply,
    false,
    latestThinkingSummary,
  );
  options.clearStreamingText();
  options.setCompanionState("done");
  await options.updateMood(3, false);
}

export function createPromptFlowStateBindings<TSwarm>(options: {
  appendConversationMessage: (message: PromptConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  existingSwarm?: TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  getConversationHistory: () => Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
}): {
  appendConversationMessage: (message: PromptConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  existingSwarm?: TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  getConversationHistory: () => Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
} {
  return {
    appendConversationMessage: options.appendConversationMessage,
    buildPromptFileMentionContext: options.buildPromptFileMentionContext,
    persistCurrentSessionRuntimeState: options.persistCurrentSessionRuntimeState,
    existingSwarm: options.existingSwarm,
    assignSwarm: options.assignSwarm,
    getConversationHistory: options.getConversationHistory,
    buildProviderAdapter: options.buildProviderAdapter,
    shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
  };
}

export function createPromptFlowExecutionCallbacks(options: {
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: Exclude<PhaseActivityStatus, "running">,
    detail?: string,
  ) => void;
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
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
  onToolError?: () => void;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
  logFirstToken?: (token: string) => void;
  logNoStreamingReply?: () => void;
}): Pick<
  Parameters<typeof runPromptFlowWithHost<any, PromptRuntimeLike>>[0],
  | "recordAssistantReply"
  | "setCompanionState"
  | "updateMood"
  | "createModelActivity"
  | "appendStreamingToken"
  | "logFirstToken"
  | "postToken"
  | "startToolExecution"
  | "finishToolExecution"
  | "onToolError"
  | "finishModelActivity"
  | "logNoStreamingReply"
  | "clearStreamingText"
  | "queueAutoMemoryExtraction"
> {
  return {
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    updateMood: options.updateMood,
    createModelActivity: () =>
      options.addPhaseActivity(
        "正在请求模型",
        "等待模型决定是否调用工具",
        "running",
      ),
    appendStreamingToken: token => {
      options.appendStreamingText(token);
      options.scheduleStreamingStateUpdate();
    },
    logFirstToken: token => {
      if (options.logFirstToken) {
        options.logFirstToken(token);
        return;
      }
      console.log("[Cain Stream] first token", JSON.stringify(token.slice(0, 80)));
    },
    postToken: options.postChatToken,
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
    finishModelActivity: options.finishPhaseActivity,
    logNoStreamingReply: () => {
      if (options.logNoStreamingReply) {
        options.logNoStreamingReply();
        return;
      }
      console.log(
        "[Cain Stream] provider returned final reply without streaming tokens",
      );
    },
    clearStreamingText: options.clearStreamingText,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
  };
}

export function createPromptFlowBindings<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  maybeAutoCompactConversation: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<void>;
  createSwarm: (options: {
    workerToolContext: ToolContext;
    promptExecution: ContinuePromptExecution<TRuntime>;
  }) => TSwarm;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  appendConversationMessage: (message: PromptConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  existingSwarm?: TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  getConversationHistory: () => Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: Exclude<PhaseActivityStatus, "running">,
    detail?: string,
  ) => void;
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
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
  onToolError?: () => void;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
  logFirstToken?: (token: string) => void;
  logNoStreamingReply?: () => void;
}) {
  return createPromptFlowHostBindings<TSwarm, TRuntime>({
    maybeAutoCompactConversation: options.maybeAutoCompactConversation,
    createSwarm: options.createSwarm,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    stateBindings: createPromptFlowStateBindings<TSwarm>({
      appendConversationMessage: options.appendConversationMessage,
      buildPromptFileMentionContext: options.buildPromptFileMentionContext,
      persistCurrentSessionRuntimeState:
        options.persistCurrentSessionRuntimeState,
      existingSwarm: options.existingSwarm,
      assignSwarm: options.assignSwarm,
      getConversationHistory: options.getConversationHistory,
      buildProviderAdapter: options.buildProviderAdapter,
      shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
    }),
    executionCallbacks: createPromptFlowExecutionCallbacks({
      addPhaseActivity: options.addPhaseActivity,
      finishPhaseActivity: options.finishPhaseActivity,
      appendStreamingText: options.appendStreamingText,
      scheduleStreamingStateUpdate: options.scheduleStreamingStateUpdate,
      postChatToken: options.postChatToken,
      startToolExecution: options.startToolExecution,
      finishToolExecution: options.finishToolExecution,
      onToolError: options.onToolError,
      setCompanionState: options.setCompanionState,
      updateMood: options.updateMood,
      recordAssistantReply: options.recordAssistantReply,
      clearStreamingText: options.clearStreamingText,
      queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
      logFirstToken: options.logFirstToken,
      logNoStreamingReply: options.logNoStreamingReply,
    }),
  });
}

export function createPromptFlowBindingsFromShared<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  sharedBindings: PromptSharedBindings;
  maybeAutoCompactConversation: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<void>;
  createSwarm: (options: {
    workerToolContext: ToolContext;
    promptExecution: ContinuePromptExecution<TRuntime>;
  }) => TSwarm;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  appendConversationMessage: (message: PromptConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  existingSwarm?: TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
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
  onToolError?: () => void;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
  logFirstToken?: (token: string) => void;
  logNoStreamingReply?: () => void;
}) {
  return createPromptFlowBindings<TSwarm, TRuntime>({
    maybeAutoCompactConversation: options.maybeAutoCompactConversation,
    createSwarm: options.createSwarm,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    appendConversationMessage: options.appendConversationMessage,
    buildPromptFileMentionContext: options.buildPromptFileMentionContext,
    persistCurrentSessionRuntimeState: options.persistCurrentSessionRuntimeState,
    existingSwarm: options.existingSwarm,
    assignSwarm: options.assignSwarm,
    getConversationHistory: options.sharedBindings.getConversationHistory,
    buildProviderAdapter: options.sharedBindings.createProviderAdapter,
    shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
    addPhaseActivity: options.sharedBindings.addPhaseActivity,
    finishPhaseActivity: options.sharedBindings.finishPhaseActivity,
    appendStreamingText: options.appendStreamingText,
    scheduleStreamingStateUpdate: options.scheduleStreamingStateUpdate,
    postChatToken: options.postChatToken,
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
    setCompanionState: options.setCompanionState,
    updateMood: options.updateMood,
    recordAssistantReply: options.recordAssistantReply,
    clearStreamingText: options.clearStreamingText,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
    logFirstToken: options.logFirstToken,
    logNoStreamingReply: options.logNoStreamingReply,
  });
}

export function createPromptFlowHostBindings<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  maybeAutoCompactConversation: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<void>;
  createSwarm: (options: {
    workerToolContext: ToolContext;
    promptExecution: ContinuePromptExecution<TRuntime>;
  }) => TSwarm;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  stateBindings: ReturnType<typeof createPromptFlowStateBindings<TSwarm>>;
  executionCallbacks: ReturnType<typeof createPromptFlowExecutionCallbacks>;
}) {
  return {
    maybeAutoCompactConversation: options.maybeAutoCompactConversation,
    createSwarm: options.createSwarm,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    ...options.stateBindings,
    ...options.executionCallbacks,
  };
}

export async function runPromptFlowWithHost<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  prompt: string;
  promptExecution: PromptExecutionResult<TRuntime>;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  createModelActivity: () => string;
  appendConversationMessage: (message: PromptConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  maybeAutoCompactConversation: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<void>;
  existingSwarm?: TSwarm;
  createSwarm: (options: {
    workerToolContext: ToolContext;
    promptExecution: ContinuePromptExecution<TRuntime>;
  }) => TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  getConversationHistory: () => Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  appendStreamingToken: (token: string) => void;
  logFirstToken: (token: string) => void;
  postToken: (token: string) => void;
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
  onToolError?: () => void;
  finishModelActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  logNoStreamingReply: () => void;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
  runPromptTurnWithHostImpl?: typeof runPromptTurnWithHost;
  applyPromptTurnUserContextImpl?: typeof applyPromptTurnUserContext;
}): Promise<void> {
  if (options.promptExecution.kind === "reply") {
    await options.recordAssistantReply(options.promptExecution.reply, false);
    options.setCompanionState("done");
    await options.updateMood(2, true);
    return;
  }

  if (options.promptExecution.kind === "handled") {
    return;
  }

  const continuePromptExecution = options.promptExecution;
  const installedSkillAgentRunner = createInstalledSkillAgentRunner({
    promptExecution: continuePromptExecution,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    buildProviderAdapter: options.buildProviderAdapter,
  });
  if (continuePromptExecution.installedSkillExecutionContext === "fork") {
    await runForkedInstalledSkillFlow({
      promptExecution: continuePromptExecution,
      createModelActivity: options.createModelActivity,
      buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
      buildProviderAdapter: options.buildProviderAdapter,
      setCompanionState: options.setCompanionState,
      appendStreamingToken: options.appendStreamingToken,
      logFirstToken: options.logFirstToken,
      postToken: options.postToken,
      startToolExecution: options.startToolExecution,
      finishToolExecution: options.finishToolExecution,
      onToolError: options.onToolError,
      finishModelActivity: options.finishModelActivity,
      logNoStreamingReply: options.logNoStreamingReply,
      recordAssistantReply: options.recordAssistantReply,
      clearStreamingText: options.clearStreamingText,
      updateMood: options.updateMood,
      runPromptAgentTurnImpl: runPromptAgentTurn,
    });
    return;
  }

  let effectivePrompt = continuePromptExecution.effectivePrompt;
  const installedSkillHooks = continuePromptExecution.installedSkillHooks ?? [];
  if (installedSkillHooks.length > 0) {
    const prePromptResult = await triggerHooks(
      "PrePrompt",
      installedSkillHooks,
      {
        workspaceRoot: continuePromptExecution.workspaceRoot,
        prompt: effectivePrompt,
      },
      installedSkillAgentRunner,
    );
    if (prePromptResult.promptPrefixInjection) {
      effectivePrompt = buildInjectedPrompt(
        effectivePrompt,
        prePromptResult.promptPrefixInjection,
        "prefix",
      );
    }
    if (prePromptResult.promptSuffixInjection) {
      effectivePrompt = buildInjectedPrompt(
        effectivePrompt,
        prePromptResult.promptSuffixInjection,
        "suffix",
      );
    }
  }

  const modelActivityId = options.createModelActivity();
  const applyPromptTurnUserContextImpl =
    options.applyPromptTurnUserContextImpl ?? applyPromptTurnUserContext;
  await applyPromptTurnUserContextImpl({
    prompt: effectivePrompt,
    attachments: continuePromptExecution.effectivePromptAttachments,
    workspaceRoot: continuePromptExecution.workspaceRoot,
    config: continuePromptExecution.config,
    envMap: continuePromptExecution.envMap,
    appendConversationMessage: options.appendConversationMessage,
    buildPromptFileMentionContext: options.buildPromptFileMentionContext,
    persistCurrentSessionRuntimeState: options.persistCurrentSessionRuntimeState,
    maybeAutoCompactConversation: options.maybeAutoCompactConversation,
  });

  const runPromptTurnWithHostImpl =
    options.runPromptTurnWithHostImpl ?? runPromptTurnWithHost;
  await runPromptTurnWithHostImpl({
    prompt: effectivePrompt,
    workspaceRoot: continuePromptExecution.workspaceRoot,
    config: continuePromptExecution.config,
    envMap: continuePromptExecution.envMap,
    runtimeOptions: continuePromptExecution.runtimeOptions,
    effortLevel: continuePromptExecution.effortLevel,
      runtime: continuePromptExecution.runtime as {
        getToolContext(mode?: string): ToolContext;
      },
      tools: continuePromptExecution.tools as ToolDefinition[],
      installedSkillHooks,
      installedSkillAgentRunner,
      existingSwarm: options.existingSwarm,
    createSwarm: () =>
      options.createSwarm({
        workerToolContext:
          continuePromptExecution.runtime.getToolContext("worker"),
        promptExecution: continuePromptExecution,
      }),
    assignSwarm: options.assignSwarm,
    getConversationHistory: options.getConversationHistory,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    buildProviderAdapter: options.buildProviderAdapter,
    shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
    setCompanionState: options.setCompanionState,
    appendStreamingToken: options.appendStreamingToken,
    logFirstToken: options.logFirstToken,
    postToken: options.postToken,
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
    modelActivityId,
    finishModelActivity: options.finishModelActivity,
    logNoStreamingReply: options.logNoStreamingReply,
    recordAssistantReply: options.recordAssistantReply,
    clearStreamingText: options.clearStreamingText,
    queueAutoMemoryExtraction: () =>
      options.queueAutoMemoryExtraction({
        workspaceRoot: continuePromptExecution.workspaceRoot,
        config: continuePromptExecution.config,
        envMap: continuePromptExecution.envMap,
      }),
      updateMood: options.updateMood,
    });

  if (installedSkillHooks.length > 0) {
    const latestReply =
      options.getConversationHistory().at(-1)?.role === "assistant"
        ? options.getConversationHistory().at(-1)?.content
        : undefined;
    await triggerHooks(
      "PostPrompt",
      installedSkillHooks,
      {
        workspaceRoot: continuePromptExecution.workspaceRoot,
        prompt: effectivePrompt,
        reply: latestReply,
      },
      installedSkillAgentRunner,
    );
  }
}
