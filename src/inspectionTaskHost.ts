import { getBuiltInAgent } from "./agent/builtInAgents";
import {
  type ConversationMessage,
} from "./agent/built-in/agentUtils";
import {
  buildBuiltInAgentTaskDescription,
  buildBuiltInAgentTaskStartOutput,
  createBuiltInAgentTaskId,
  formatBuiltInAgentToolEvent,
  getBuiltInAgentBackgroundTaskMetadata,
} from "./agent/built-in/backgroundTask";
import type { IProviderAdapter, ProviderConfig } from "./agent/providers/IProviderAdapter";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import { parsePromptSlashCommand } from "./promptCommandHost";
import type { BackgroundTaskRecord } from "./tasks/types";
import { buildThinkingEffortSystemPrompt } from "./thinkingEffort/prompt";
import type { EffortLevel } from "./thinkingEffort/types";
import type { ToolContext, ToolDefinition } from "./toolRuntime";

type InspectionMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolLifecycleCallback = (
  toolName: string,
  input: Record<string, unknown>,
  execId: string,
) => void;

type ToolEndCallback = (
  execId: string,
  summary: string,
  isError: boolean,
) => void;

export type RunBuiltInInspectionSessionOptions<TResult> = {
  agentType: string;
  agentLabel: string;
  taskIdPrefix: string;
  commandPrefix: string;
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  effortLevel: EffortLevel | undefined;
  tools: ToolDefinition[];
  runtimeToolContext: ToolContext;
  conversationHistory: ConversationMessage[];
  sessionMessages: InspectionMessage[];
  promptForTask?: string;
  taskContextMetadata?: Record<string, unknown>;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProvider: (systemPrompt: string) => IProviderAdapter;
  selectTools: (tools: ToolDefinition[]) => ToolDefinition[];
  selectToolContext: (toolContext: ToolContext) => ToolContext;
  runAgentSession: (options: {
    provider: IProviderAdapter;
    tools: ToolDefinition[];
    toolContext: ToolContext;
    messages: ConversationMessage[];
    workspaceRoot: string;
    originalTask: string;
    extraGuidance?: string;
    onToken?: (token: string) => void;
    onToolStart?: ToolLifecycleCallback;
    onToolEnd?: ToolEndCallback;
    abortSignal?: AbortSignal;
  }) => Promise<TResult>;
  onToken?: (token: string) => void;
  onToolStart?: ToolLifecycleCallback;
  onToolEnd?: ToolEndCallback;
  onBeforeRun?: () => void;
  onSuccess?: (result: TResult) => void;
  onFailure?: (message: string) => void;
  finalizeSuccess: (
    result: TResult,
  ) => Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>;
  finalizeFailure?: (
    message: string,
  ) => Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>;
};

function getInspectionExtraGuidance(
  commandText: string,
  commandPrefix: string,
  diffRef?: string,
): string {
  const rest = commandText.slice(commandPrefix.length).trim();
  if (!rest) {
    return "";
  }

  const guidance = !diffRef
    ? rest
    : rest.startsWith(diffRef)
      ? rest.slice(diffRef.length).trim()
      : rest;

  return guidance.replace(/^--\s*/, "").trim();
}

function isSlashCommandMessage(content: string): boolean {
  return parsePromptSlashCommand(content) !== null;
}

export function findOriginalTaskForInspection(
  messages: InspectionMessage[],
): string | null {
  const firstRealUserMessage = messages.find(
    message =>
      message.role === "user" &&
      !isSlashCommandMessage(message.content),
  );

  const originalTask = firstRealUserMessage?.content.trim();
  return originalTask ? originalTask : null;
}

export function getOriginalTaskForInspection(
  messages: InspectionMessage[],
): string {
  return findOriginalTaskForInspection(messages)
    ?? "No original task found in the current conversation.";
}

export function isDuplicateBuiltInAgentRunError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return /already running for this conversation/i.test(message);
}

export async function runBuiltInInspectionSession<TResult>(
  options: RunBuiltInInspectionSessionOptions<TResult>,
): Promise<{ taskId: string; result: TResult; originalTask: string; extraGuidance: string }> {
  const builtInAgent = getBuiltInAgent(options.agentType);
  if (!builtInAgent) {
    throw new Error(`Built-in ${options.agentLabel.toLowerCase()} is not registered.`);
  }

  const diffRef =
    typeof options.taskContextMetadata?.diffRef === "string"
      ? options.taskContextMetadata.diffRef
      : undefined;
  const extraGuidance = getInspectionExtraGuidance(
    options.commandText,
    options.commandPrefix,
    diffRef,
  );
  const originalTask =
    options.promptForTask ?? findOriginalTaskForInspection(options.sessionMessages);
  if (!originalTask) {
    throw new Error("No original task found in the current conversation.");
  }

  const existingTask = await options.findActiveBuiltInAgentTask(
    options.workspaceRoot,
    options.agentType,
    diffRef,
  );
  if (existingTask) {
    throw new Error(buildDuplicateBuiltInAgentRunMessage(options.agentLabel, existingTask.id));
  }

  const systemPrompt = buildThinkingEffortSystemPrompt(
    builtInAgent.getSystemPrompt(),
    options.config,
    options.effortLevel,
  );
  const provider = options.createProvider(systemPrompt);
  const inspectionTools = options.selectTools(options.tools);
  const inspectionToolContext = options.selectToolContext(options.runtimeToolContext);
  const normalizedCommand = options.commandText.trim() || options.commandPrefix;
  const taskId = createBuiltInAgentTaskId(options.taskIdPrefix);
  const taskMetadata = getBuiltInAgentBackgroundTaskMetadata(builtInAgent, {
    originalTask,
    ...(extraGuidance ? { extraGuidance } : {}),
    commandText: normalizedCommand,
    ...(options.taskContextMetadata ?? {}),
  });

  const result = await options.backgroundTaskHost.runBuiltInAgentSession({
    workspaceRoot: options.workspaceRoot,
    commandText: normalizedCommand,
    agentType: options.agentType,
    taskId,
    taskDescription: buildBuiltInAgentTaskDescription(
      options.agentLabel,
      extraGuidance,
    ),
    taskMetadata,
    promptForTask: originalTask,
    taskStartOutput: buildBuiltInAgentTaskStartOutput(
      options.agentLabel,
      normalizedCommand,
    ),
    formatToolEvent: formatBuiltInAgentToolEvent,
    onBeforeRun: options.onBeforeRun,
    onSuccess: options.onSuccess,
    onFailure: options.onFailure,
    run: (hooks, abortSignal) =>
      options.runAgentSession({
        provider,
        tools: inspectionTools,
        toolContext: inspectionToolContext,
        messages: options.conversationHistory,
        workspaceRoot: options.workspaceRoot,
        originalTask,
        extraGuidance: extraGuidance || undefined,
        onToken: options.onToken,
        onToolStart: hooks.onToolStart,
        onToolEnd: hooks.onToolEnd,
        abortSignal,
      }),
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    finalizeSuccess: options.finalizeSuccess,
    finalizeFailure: options.finalizeFailure,
  });

  return {
    taskId,
    result,
    originalTask,
    extraGuidance,
  };
}

function buildDuplicateBuiltInAgentRunMessage(
  agentLabel: string,
  taskId: string,
): string {
  return `A ${agentLabel.toLowerCase()} is already running for this conversation (${taskId}). Use TaskOutput with task_id "${taskId}" to inspect it instead of launching another one.`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
