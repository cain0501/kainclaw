import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderResolution } from "./workspaceHost";
import {
  createPromptEntryBindings,
  createPromptEntryBindingsFromShared,
  createPromptEntryHostBindings,
  createPromptEntryCommandBindings,
  createPromptEntryRuntimeBindings,
} from "./promptEntryHost";
import { createPromptSharedBindings } from "./promptBindingsHost";

const {
  persistUserPromptSessionMock,
  createPromptExecutionCommandHandlersMock,
  preparePromptExecutionStepMock,
} = vi.hoisted(() => ({
  persistUserPromptSessionMock: vi.fn(),
  createPromptExecutionCommandHandlersMock: vi.fn(),
  preparePromptExecutionStepMock: vi.fn(),
}));

vi.mock("./promptSessionHost", () => ({
  persistUserPromptSession: persistUserPromptSessionMock,
}));

vi.mock("./promptExecutionHost", () => ({
  createPromptExecutionCommandHandlers: createPromptExecutionCommandHandlersMock,
  preparePromptExecutionStep: preparePromptExecutionStepMock,
}));

import { preparePromptEntryWithHost } from "./promptEntryHost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("promptEntryHost", () => {
  it("creates prompt entry bindings from shared bindings plus command/runtime specifics", async () => {
    const sharedBindings = createPromptSharedBindings({
      getConversationHistory: () => [],
      isSessionPersistenceEnabled: () => true,
      getCurrentSessionId: () => "session-1",
      getTranscriptFilePath: () => "E:\\repo\\.transcript.jsonl",
      buildProviderAdapter: vi.fn(() => ({
        runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
      })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    });

    const bindings = createPromptEntryBindingsFromShared({
      sharedBindings,
      getCurrentEffortLevel: () => "high",
      setEffortLevel: vi.fn(async () => undefined),
      getCurrentFastMode: () => false,
      setFastMode: vi.fn(async () => undefined),
      setActiveProviderModel: vi.fn(async () => undefined),
      resolveProviderConfig: vi.fn(async () => ({
        config: {
          type: "anthropic" as const,
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
      })),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({}) as any),
      cachedTools: [],
      cachedToolsWorkspaceRoot: "E:\\repo",
      setFreshWorkspaceTools: vi.fn(),
      refreshWorkspaceStatus: vi.fn(),
      getPendingPlanVerification: () => undefined,
      sessionMessages: [],
      blockedByPlanMode: false,
      replaceConversationHistory: vi.fn(),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      onStreamingToken: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    const providerResolution = await bindings.runtimeBindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(bindings.commandBindings.getCurrentEffortLevel()).toBe("high");
    expect(bindings.commandBindings.getTranscriptPath()).toBe(
      "E:\\repo\\.transcript.jsonl",
    );
  });

  it("creates combined prompt entry bindings by splitting runtime and command concerns", async () => {
    const bindings = createPromptEntryBindings({
      resolveProviderConfig: vi.fn(async () => ({
        config: {
          type: "anthropic" as const,
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
      })),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({}) as any),
      cachedTools: [],
      cachedToolsWorkspaceRoot: "E:\\repo",
      setFreshWorkspaceTools: vi.fn(),
      startActivity: vi.fn(() => "activity-1"),
      finishActivity: vi.fn(),
      getCurrentEffortLevel: () => "high",
      setEffortLevel: vi.fn(async () => undefined),
      getCurrentFastMode: () => false,
      setFastMode: vi.fn(async () => undefined),
      setActiveProviderModel: vi.fn(async () => undefined),
      refreshWorkspaceStatus: vi.fn(),
      getConversationHistory: () => [],
      getPendingPlanVerification: () => undefined,
      sessionMessages: [],
      blockedByPlanMode: false,
      getTranscriptPath: () => undefined,
      replaceConversationHistory: vi.fn(),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({
        runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
      })),
      onStreamingToken: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
      addPhaseActivity: vi.fn(() => "activity-2"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    const providerResolution = await bindings.runtimeBindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(bindings.commandBindings.getCurrentFastMode()).toBe(false);
    expect(bindings.commandBindings.sessionMessages).toEqual([]);
  });

  it("returns prompt entry host bindings unchanged", async () => {
    const hostBindings = createPromptEntryHostBindings({
      runtimeBindings: createPromptEntryRuntimeBindings({
        resolveProviderConfig: vi.fn(async () => ({
          config: {
            type: "anthropic" as const,
            apiKey: "secret",
            model: "claude-sonnet",
          },
          envMap: { HELLO: "world" },
        })),
        getEffortLevel: () => "high",
        createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        getWorkspaceRuntime: vi.fn(async () => ({}) as any),
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setFreshWorkspaceTools: vi.fn(),
        startActivity: vi.fn(() => "activity-1"),
        finishActivity: vi.fn(),
      }),
      commandBindings: createPromptEntryCommandBindings({
        getCurrentEffortLevel: () => "high",
        setEffortLevel: vi.fn(async () => undefined),
        getCurrentFastMode: () => false,
        setFastMode: vi.fn(async () => undefined),
        setActiveProviderModel: vi.fn(async () => undefined),
        refreshWorkspaceStatus: vi.fn(),
        getConversationHistory: () => [],
        getPendingPlanVerification: () => undefined,
        sessionMessages: [],
        blockedByPlanMode: false,
        getTranscriptPath: () => undefined,
        replaceConversationHistory: vi.fn(),
        backgroundTaskHost: {
          runBuiltInAgentSession: vi.fn(),
          buildFollowUpMessage: vi.fn(() => "follow-up"),
        } as any,
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        createProviderAdapter: vi.fn(() => ({
          runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
        })),
        onStreamingToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        addPhaseActivity: vi.fn(() => "activity-1"),
        finishPhaseActivity: vi.fn(),
        recordAssistantReply: vi.fn(async () => undefined),
        setCompanionState: vi.fn(),
        clearStreamingText: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        isAbortLikeError: vi.fn(() => false),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      }),
    });

    const providerResolution = await hostBindings.runtimeBindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(hostBindings.commandBindings.getCurrentFastMode()).toBe(false);
  });

  it("returns prompt entry runtime bindings unchanged", async () => {
    const bindings = createPromptEntryRuntimeBindings({
      resolveProviderConfig: vi.fn(async () => ({
        config: {
          type: "anthropic" as const,
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
      })),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({}) as any),
      cachedTools: [],
      cachedToolsWorkspaceRoot: "E:\\repo",
      setFreshWorkspaceTools: vi.fn(),
      startActivity: vi.fn(() => "activity-1"),
      finishActivity: vi.fn(),
    });

    const providerResolution = await bindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(bindings.getEffortLevel()).toBe("high");
    expect(bindings.cachedToolsWorkspaceRoot).toBe("E:\\repo");
  });

  it("returns prompt entry command bindings unchanged", () => {
    const bindings = createPromptEntryCommandBindings({
      getCurrentEffortLevel: () => "high",
      setEffortLevel: vi.fn(async () => undefined),
      getCurrentFastMode: () => false,
      setFastMode: vi.fn(async () => undefined),
      setActiveProviderModel: vi.fn(async () => undefined),
      refreshWorkspaceStatus: vi.fn(),
      getConversationHistory: () => [],
      getPendingPlanVerification: () => undefined,
      sessionMessages: [],
      blockedByPlanMode: false,
      getTranscriptPath: () => undefined,
      replaceConversationHistory: vi.fn(),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({
        runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
      })),
      onStreamingToken: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    expect(bindings.getCurrentEffortLevel()).toBe("high");
    expect(bindings.getCurrentFastMode()).toBe(false);
    expect(bindings.blockedByPlanMode).toBe(false);
    expect(bindings.sessionMessages).toEqual([]);
  });

  it("logs prompt/session persistence events and composes prompt execution preflight", async () => {
    const logSession = vi.fn();
    const handlers = {
      tryHandleLocalCommand: vi.fn(),
      tryHandlePlanModeCommand: vi.fn(),
      handleCompactCommand: vi.fn(),
      handleReviewCommand: vi.fn(),
      handleVerificationCommand: vi.fn(),
    };

    persistUserPromptSessionMock.mockResolvedValue({
      currentSessionId: "session-1",
      createdSessionId: "session-1",
      persistedSessionId: "session-1",
      promptTitle: "Implement fix",
      promptPreview: "Implement fix",
    });
    createPromptExecutionCommandHandlersMock.mockReturnValue(handlers);
    preparePromptExecutionStepMock.mockResolvedValue({
      kind: "continue",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: {},
      effortLevel: "high",
      runtimeOptions: {},
      workspaceRoot: "E:\\repo",
      runtime: { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) },
      tools: [],
    });
    const providerResolution: ProviderResolution = {
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
    };

    const result = await preparePromptEntryWithHost({
      prompt: "Implement fix",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: undefined,
      sessionMessagesLength: 1,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: () => "hash-1",
      logSession,
      createSession: vi.fn(async () => undefined),
      setActiveSessionId: vi.fn(async () => undefined),
      ensureSession: vi.fn(async () => undefined),
      appendMessages: vi.fn(async () => undefined),
      bindings: createPromptEntryBindings({
        resolveProviderConfig: vi.fn(async () => providerResolution),
        getEffortLevel: () => "high",
        createProviderRuntimeOptions: vi.fn(() => ({})),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        getWorkspaceRuntime: vi.fn(async () => ({}) as any),
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setFreshWorkspaceTools: vi.fn(),
        startActivity: vi.fn(() => "activity-1"),
        finishActivity: vi.fn(),
        getCurrentEffortLevel: () => "high",
        setEffortLevel: vi.fn(async () => undefined),
        getCurrentFastMode: () => false,
        setFastMode: vi.fn(async () => undefined),
        setActiveProviderModel: vi.fn(async () => undefined),
        refreshWorkspaceStatus: vi.fn(),
        getConversationHistory: () => [],
        getPendingPlanVerification: () => undefined,
        sessionMessages: [],
        blockedByPlanMode: false,
        getTranscriptPath: () => undefined,
        replaceConversationHistory: vi.fn(),
        backgroundTaskHost: {
          runBuiltInAgentSession: vi.fn(),
          buildFollowUpMessage: vi.fn(() => "follow-up"),
        } as any,
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        createProviderAdapter: vi.fn(() => ({
          runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
        })),
        onStreamingToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        addPhaseActivity: vi.fn(() => "activity-2"),
        finishPhaseActivity: vi.fn(),
        recordAssistantReply: vi.fn(async () => undefined),
        setCompanionState: vi.fn(),
        clearStreamingText: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        isAbortLikeError: vi.fn(() => false),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      }),
    });

    expect(logSession).toHaveBeenNthCalledWith(1, "prompt-start", {
      promptPreview: "Implement fix",
      workspaceHash: "hash-1",
    });
    expect(logSession).toHaveBeenNthCalledWith(2, "session-created", {
      source: "prompt",
      sessionId: "session-1",
      workspaceHash: "hash-1",
    });
    expect(logSession).toHaveBeenNthCalledWith(3, "user-message-persisted", {
      sessionId: "session-1",
      promptPreview: "Implement fix",
    });
    expect(createPromptExecutionCommandHandlersMock).toHaveBeenCalledTimes(1);
    expect(preparePromptExecutionStepMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Implement fix",
        workspaceFolderPath: "E:\\repo",
        tryHandleLocalCommand: handlers.tryHandleLocalCommand,
        tryHandlePlanModeCommand: handlers.tryHandlePlanModeCommand,
        handleCompactCommand: handlers.handleCompactCommand,
      }),
    );
    expect(result.currentSessionId).toBe("session-1");
    expect(result.promptExecution).toMatchObject({ kind: "continue" });
  });
});
