import { describe, expect, it, vi } from "vitest";

const {
  createPromptSharedBindingsMock,
  createPromptCallbackBindingsMock,
  createPromptHostBindingsMock,
  createAutoCompactConversationRunnerMock,
  createPromptTurnSwarmFactoryMock,
  createWorkspaceSystemPromptBuilderMock,
} = vi.hoisted(() => ({
  createPromptSharedBindingsMock: vi.fn(),
  createPromptCallbackBindingsMock: vi.fn(),
  createPromptHostBindingsMock: vi.fn(),
  createAutoCompactConversationRunnerMock: vi.fn(),
  createPromptTurnSwarmFactoryMock: vi.fn(),
  createWorkspaceSystemPromptBuilderMock: vi.fn(),
}));

vi.mock("./promptBindingsHost", () => ({
  createPromptSharedBindings: createPromptSharedBindingsMock,
}));

vi.mock("./promptCallbackHost", () => ({
  createPromptCallbackBindings: createPromptCallbackBindingsMock,
}));

vi.mock("./promptHost", () => ({
  createPromptHostBindings: createPromptHostBindingsMock,
}));

vi.mock("./compactHost", () => ({
  createAutoCompactConversationRunner: createAutoCompactConversationRunnerMock,
}));

vi.mock("./promptSwarmHost", () => ({
  createPromptTurnSwarmFactory: createPromptTurnSwarmFactoryMock,
}));

vi.mock("./promptSetupHost", () => ({
  createWorkspaceSystemPromptBuilder: createWorkspaceSystemPromptBuilderMock,
}));

import { assemblePromptHostBindings } from "./promptHostFactory";

describe("promptHostFactory", () => {
  it("assembles shared, callback, and flow factories into prompt host bindings", () => {
    const sharedBindings = {
      getConversationHistory: vi.fn(() => []),
      getTranscriptPath: vi.fn(() => "E:\\repo\\.transcript.jsonl"),
      createProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    };
    const callbackBindings = {
      entry: {
        onStreamingToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        recordAssistantReply: vi.fn(),
        setCompanionState: vi.fn(),
        clearStreamingText: vi.fn(),
        updateMood: vi.fn(),
      },
      flow: {
        appendStreamingText: vi.fn(),
        scheduleStreamingStateUpdate: vi.fn(),
        postChatToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        onToolError: vi.fn(),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(),
        recordAssistantReply: vi.fn(),
        clearStreamingText: vi.fn(),
      },
    };
    const autoCompactRunner = vi.fn(async () => undefined);
    const createSwarm = vi.fn();
    const buildWorkspaceSystemPrompt = vi.fn(async () => "system prompt");
    const promptHostBindings = {
      entryBindings: { runtimeBindings: {}, commandBindings: {} },
      flowBindings: {},
    };

    createPromptSharedBindingsMock.mockReturnValue(sharedBindings);
    createPromptCallbackBindingsMock.mockReturnValue(callbackBindings);
    createAutoCompactConversationRunnerMock.mockReturnValue(autoCompactRunner);
    createPromptTurnSwarmFactoryMock.mockReturnValue(createSwarm);
    createWorkspaceSystemPromptBuilderMock.mockReturnValue(
      buildWorkspaceSystemPrompt,
    );
    createPromptHostBindingsMock.mockReturnValue(promptHostBindings);

    const sharedOptions = {
      getConversationHistory: vi.fn(() => []),
      isSessionPersistenceEnabled: vi.fn(() => true),
      getCurrentSessionId: vi.fn(() => "session-1"),
      getTranscriptFilePath: vi.fn(() => "E:\\repo\\.transcript.jsonl"),
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-2"),
      finishPhaseActivity: vi.fn(),
    };
    const callbackOptions = {
      appendStreamingText: vi.fn(),
      scheduleStreamingStateUpdate: vi.fn(),
      postChatToken: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
      onToolError: vi.fn(),
      setCompanionState: vi.fn(),
      updateMood: vi.fn(),
      recordAssistantReply: vi.fn(),
      clearStreamingText: vi.fn(),
    };
    const entryOptions = {
      getCurrentEffortLevel: vi.fn(),
      setEffortLevel: vi.fn(),
      getCurrentFastMode: vi.fn(),
      setFastMode: vi.fn(),
      setActiveProviderModel: vi.fn(),
      resolveProviderConfig: vi.fn(),
      getEffortLevel: vi.fn(),
      createProviderRuntimeOptions: vi.fn(),
      ensureConversationWorktreeHydrated: vi.fn(),
      getEffectiveWorkspaceRoot: vi.fn(),
      getWorkspaceRuntime: vi.fn(),
      cachedTools: [],
      cachedToolsWorkspaceRoot: "E:\\repo",
      setFreshWorkspaceTools: vi.fn(),
      refreshWorkspaceStatus: vi.fn(),
      getPendingPlanVerification: vi.fn(),
      sessionMessages: [],
      blockedByPlanMode: false,
      replaceConversationHistory: vi.fn(),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(),
        runDetachedRemoteReview: vi.fn(),
        runDetachedRemoteVerification: vi.fn(),
      },
      findActiveBuiltInAgentTask: vi.fn(),
      isAbortLikeError: vi.fn(),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    };
    const flowOptions = {
      autoCompact: {
        replaceConversationHistory: vi.fn(),
        toErrorMessage: vi.fn(),
      },
      swarmFactory: {
        workspaceFolderPath: "E:\\repo",
        backgroundTasks: {} as any,
        resolveWorkerProviderConfig: vi.fn(),
        createProviderRuntimeOptions: vi.fn(),
        getEffectiveWorkspaceRoot: vi.fn(),
        postWorkerUpdate: vi.fn(),
      },
      systemPrompt: {
        planModeState: { active: false },
        getPendingPlanVerification: vi.fn(),
        getPendingPlanVerificationReminderTurns: vi.fn(),
        getPlanContent: vi.fn(),
      },
      appendConversationMessage: vi.fn(),
      buildPromptFileMentionContext: vi.fn(),
      persistCurrentSessionRuntimeState: vi.fn(),
      existingSwarm: { id: "swarm-1" } as any,
      assignSwarm: vi.fn(),
      shouldEnableSwarmForPrompt: vi.fn(),
      queueAutoMemoryExtraction: vi.fn(),
    };

    const result = assemblePromptHostBindings({
      shared: sharedOptions,
      callbacks: callbackOptions,
      entry: entryOptions,
      flow: flowOptions,
    });

    expect(result).toBe(promptHostBindings);
    expect(createPromptSharedBindingsMock).toHaveBeenCalledWith(sharedOptions);
    expect(createPromptCallbackBindingsMock).toHaveBeenCalledWith(
      callbackOptions,
    );
    expect(createAutoCompactConversationRunnerMock).toHaveBeenCalledWith({
      ...flowOptions.autoCompact,
      getConversationHistory: sharedBindings.getConversationHistory,
      getTranscriptPath: sharedBindings.getTranscriptPath,
      createProviderAdapter: expect.any(Function),
      addPhaseActivity: sharedBindings.addPhaseActivity,
      finishPhaseActivity: sharedBindings.finishPhaseActivity,
    });

    const autoCompactArgs =
      createAutoCompactConversationRunnerMock.mock.calls[0][0];
    autoCompactArgs.createProviderAdapter({
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
    });
    expect(sharedBindings.createProviderAdapter).toHaveBeenCalledWith({
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
    });

    expect(createPromptTurnSwarmFactoryMock).toHaveBeenCalledWith({
      ...flowOptions.swarmFactory,
      buildProviderAdapter: sharedBindings.createProviderAdapter,
    });
    expect(createWorkspaceSystemPromptBuilderMock).toHaveBeenCalledWith(
      flowOptions.systemPrompt,
    );
    expect(createPromptHostBindingsMock).toHaveBeenCalledWith({
      sharedBindings,
      entry: {
        ...entryOptions,
        ...callbackBindings.entry,
      },
      flow: {
        appendConversationMessage: flowOptions.appendConversationMessage,
        buildPromptFileMentionContext: flowOptions.buildPromptFileMentionContext,
        persistCurrentSessionRuntimeState:
          flowOptions.persistCurrentSessionRuntimeState,
        existingSwarm: flowOptions.existingSwarm,
        assignSwarm: flowOptions.assignSwarm,
        shouldEnableSwarmForPrompt: flowOptions.shouldEnableSwarmForPrompt,
        queueAutoMemoryExtraction: flowOptions.queueAutoMemoryExtraction,
        maybeAutoCompactConversation: autoCompactRunner,
        createSwarm,
        buildWorkspaceSystemPrompt,
        ...callbackBindings.flow,
      },
    });
  });
});
