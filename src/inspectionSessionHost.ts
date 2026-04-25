import type { ConversationMessage } from "./agent/built-in/agentUtils";
import {
  parseReviewPrNumber,
  parseReviewDiffRef,
  parseVerificationDiffRef,
} from "./agent/built-in/agentUtils";
import type { IProviderAdapter, ProviderConfig } from "./agent/providers/IProviderAdapter";
import { REVIEW_AGENT_TYPE, VERIFICATION_AGENT_TYPE } from "./agent/constants";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import {
  getOriginalTaskForInspection,
  runBuiltInInspectionSession,
} from "./inspectionTaskHost";
import {
  getReviewToolContext,
  getReviewTools,
  runReviewAgent,
} from "./review/runner";
import type { BackgroundTaskRecord } from "./tasks/types";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { EffortLevel } from "./thinkingEffort/types";
import {
  getVerificationToolContext,
  getVerificationTools,
  runVerificationAgent,
} from "./verification/runner";
import type { VerificationVerdict } from "./verification/prompt";

type InspectionMessage = {
  role: "user" | "assistant";
  content: string;
};

type InspectionRuntimeLike = {
  getToolContext: () => ToolContext;
};

type PendingPlanVerificationLike = {
  planFilePath: string;
  planContent: string;
  approvedAtUserTurnCount: number;
  verificationStarted: boolean;
  verificationCompleted: boolean;
};

type SharedInspectionOptions = {
  commandText: string;
  workspaceRoot: string;
  promptForTask?: string;
  config: ProviderConfig;
  effortLevel: EffortLevel | undefined;
  runtime: InspectionRuntimeLike;
  tools: ToolDefinition[];
  conversationHistory: ConversationMessage[];
  sessionMessages: InspectionMessage[];
  pendingPlanVerification?: PendingPlanVerificationLike;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProvider: (systemPrompt: string) => IProviderAdapter;
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>, execId: string) => void;
  onToolEnd?: (execId: string, summary: string, isError: boolean) => void;
};

export async function runVerificationInspectionSession(
  options: SharedInspectionOptions & {
    markPendingPlanVerificationStarted: () => void;
    markPendingPlanVerificationCompleted: () => void;
    resetPendingPlanVerificationToAwaitingStart: () => void;
  },
): Promise<{ taskId: string; report: string; verdict: VerificationVerdict }> {
  const pendingPlanVerification =
    options.pendingPlanVerification &&
    !options.pendingPlanVerification.verificationCompleted
      ? options.pendingPlanVerification
      : undefined;

  // When the command text contains a git ref (e.g. "/verify HEAD~3..HEAD"),
  // pass it through so the verification agent targets that diff range
  // rather than the current working-tree state.
  const diffRef = parseVerificationDiffRef(options.commandText);
  const verificationTaskContextMetadata = {
    ...(pendingPlanVerification
      ? {
          planFilePath: pendingPlanVerification.planFilePath,
          approvedAtUserTurnCount: pendingPlanVerification.approvedAtUserTurnCount,
          hasPlanContent: !!pendingPlanVerification.planContent?.trim(),
        }
      : {}),
    ...(diffRef ? { diffRef } : {}),
  };

  const { taskId, result } = await runBuiltInInspectionSession({
    agentType: VERIFICATION_AGENT_TYPE,
    agentLabel: "Verification agent",
    taskIdPrefix: "verify",
    commandPrefix: "/verify",
    commandText: options.commandText,
    ...(options.promptForTask ? { promptForTask: options.promptForTask } : {}),
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    effortLevel: options.effortLevel,
    tools: options.tools,
    runtimeToolContext: options.runtime.getToolContext(),
    conversationHistory: options.conversationHistory,
    sessionMessages: options.sessionMessages,
    backgroundTaskHost: options.backgroundTaskHost,
    taskContextMetadata:
      Object.keys(verificationTaskContextMetadata).length > 0
        ? verificationTaskContextMetadata
        : undefined,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: options.createProvider,
    selectTools: tools => getVerificationTools(tools),
    selectToolContext: toolContext => getVerificationToolContext(toolContext),
    runAgentSession: sessionOptions =>
      runVerificationAgent({
        provider: sessionOptions.provider,
        tools: sessionOptions.tools,
        toolContext: sessionOptions.toolContext,
        messages: sessionOptions.messages,
        workspaceRoot: sessionOptions.workspaceRoot,
        originalTask: sessionOptions.originalTask,
        extraGuidance: sessionOptions.extraGuidance,
        planFilePath: pendingPlanVerification?.planFilePath,
        planContent: pendingPlanVerification?.planContent ?? null,
        diffRef,
        onToken: sessionOptions.onToken,
        onToolStart: sessionOptions.onToolStart,
        onToolEnd: sessionOptions.onToolEnd,
        abortSignal: sessionOptions.abortSignal,
      }),
    onBeforeRun: () => {
      if (pendingPlanVerification && !pendingPlanVerification.verificationStarted) {
        options.markPendingPlanVerificationStarted();
      }
    },
    onSuccess: sessionResult => {
      if (!pendingPlanVerification) {
        return;
      }
      if (sessionResult.verdict === "PASS") {
        options.markPendingPlanVerificationCompleted();
        return;
      }
      options.resetPendingPlanVerificationToAwaitingStart();
    },
    onFailure: () => {
      if (pendingPlanVerification) {
        options.resetPendingPlanVerificationToAwaitingStart();
      }
    },
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    finalizeSuccess: sessionResult => ({
      status: sessionResult.verdict === "PASS" ? "completed" : "failed",
      result: sessionResult.report,
      output: sessionResult.report,
      metadata: {
        verificationVerdict: sessionResult.verdict,
      },
      error:
        sessionResult.verdict !== "PASS"
          ? `Verification finished with VERDICT: ${sessionResult.verdict}`
          : undefined,
    }),
  });

  return {
    taskId,
    report: result.report,
    verdict: result.verdict,
  };
}

export async function runReviewInspectionSession(
  options: SharedInspectionOptions,
): Promise<{ taskId: string; report: string }> {
  const pendingPlanVerification =
    options.pendingPlanVerification &&
    !options.pendingPlanVerification.verificationCompleted
      ? options.pendingPlanVerification
      : undefined;

  // When the command text contains a git ref (e.g. "/review HEAD~3..HEAD"),
  // pass it through so the review agent uses that diff range rather than
  // the current working-tree status.
  const prNumber = parseReviewPrNumber(options.commandText);
  const diffRef = parseReviewDiffRef(options.commandText);
  const reviewTaskContextMetadata = {
    ...(pendingPlanVerification
      ? {
          planFilePath: pendingPlanVerification.planFilePath,
          approvedAtUserTurnCount: pendingPlanVerification.approvedAtUserTurnCount,
          hasPlanContent: !!pendingPlanVerification.planContent?.trim(),
        }
      : {}),
    ...(prNumber ? { reviewPrNumber: prNumber } : {}),
    ...(diffRef ? { diffRef } : {}),
  };

  const { taskId, result } = await runBuiltInInspectionSession({
    agentType: REVIEW_AGENT_TYPE,
    agentLabel: "Review agent",
    taskIdPrefix: "review",
    commandPrefix: "/review",
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    effortLevel: options.effortLevel,
    tools: options.tools,
    runtimeToolContext: options.runtime.getToolContext(),
    conversationHistory: options.conversationHistory,
    sessionMessages: options.sessionMessages,
    promptForTask:
      options.promptForTask ?? getOriginalTaskForInspection(options.sessionMessages),
    backgroundTaskHost: options.backgroundTaskHost,
    taskContextMetadata:
      Object.keys(reviewTaskContextMetadata).length > 0
        ? reviewTaskContextMetadata
        : undefined,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: options.createProvider,
    selectTools: tools => getReviewTools(tools),
    selectToolContext: toolContext => getReviewToolContext(toolContext),
    runAgentSession: sessionOptions =>
      runReviewAgent({
        provider: sessionOptions.provider,
        tools: sessionOptions.tools,
        toolContext: sessionOptions.toolContext,
        messages: sessionOptions.messages,
        workspaceRoot: sessionOptions.workspaceRoot,
        originalTask: sessionOptions.originalTask,
        planFilePath: pendingPlanVerification?.planFilePath,
        planContent: pendingPlanVerification?.planContent ?? null,
        extraGuidance: sessionOptions.extraGuidance,
        prNumber,
        diffRef,
        onToken: sessionOptions.onToken,
        onToolStart: sessionOptions.onToolStart,
        onToolEnd: sessionOptions.onToolEnd,
        abortSignal: sessionOptions.abortSignal,
      }),
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    finalizeSuccess: sessionReport => ({
      status: "completed",
      result: sessionReport,
      output: sessionReport,
    }),
    finalizeFailure: message => ({
      status: "failed",
      error: message,
      result: `Review failed: ${message}`,
    }),
  });

  return { taskId, report: result };
}
