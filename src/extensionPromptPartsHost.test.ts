import { describe, expect, it, vi } from "vitest";

const {
  buildProviderAdapterMock,
  createProviderRuntimeOptionsWithHostMock,
  resolveProviderConfigMock,
} = vi.hoisted(() => ({
  buildProviderAdapterMock: vi.fn(),
  createProviderRuntimeOptionsWithHostMock: vi.fn(),
  resolveProviderConfigMock: vi.fn(),
}));

vi.mock("./providerHost", () => ({
  buildProviderAdapter: buildProviderAdapterMock,
  resolveProviderConfig: resolveProviderConfigMock,
}));

vi.mock("./providerRuntimeOptionsHost", () => ({
  createProviderRuntimeOptionsWithHost:
    createProviderRuntimeOptionsWithHostMock,
}));

import { buildPromptFileMentionContext } from "./contextMentions";
import {
  createExtensionPromptRequestParts,
  createExtensionPromptRequestPartsFactory,
} from "./extensionPromptPartsHost";

describe("extensionPromptPartsHost", () => {
  it("builds a reusable prompt-request parts factory around stable host bindings", async () => {
    const providerConfig = {
      type: "anthropic" as const,
      apiKey: "secret",
      model: "claude-sonnet",
    };

    resolveProviderConfigMock.mockResolvedValue({
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
    createProviderRuntimeOptionsWithHostMock.mockReturnValue({ fastMode: true });
    buildProviderAdapterMock.mockReturnValue({ runStep: vi.fn() });

    const factory = createExtensionPromptRequestPartsFactory({
      settings: {
        getEffortLevel: vi.fn(() => "high"),
        setEffortLevel: vi.fn(async () => undefined),
        getFastMode: vi.fn(() => false),
        setFastMode: vi.fn(async () => undefined),
        setActiveProviderModel: vi.fn(async () => undefined),
        getProviderConfigByAlias: vi.fn(async () => undefined),
        setActiveSessionId: vi.fn(async () => undefined),
      } as any,
      sessions: {
        getTranscriptFilePath: vi.fn(() => "E:\\repo\\.transcript.jsonl"),
        createSession: vi.fn(async () => undefined),
        ensureSession: vi.fn(async () => undefined),
        appendMessages: vi.fn(async () => undefined),
      } as any,
      logSession: vi.fn(),
      conversationFeatureBindings: {
        isSessionPersistenceEnabled: vi.fn(() => true),
        shouldEnableSwarmForPrompt: vi.fn(() => false),
      },
      conversationHistoryBindings: {
        getConversationHistory: vi.fn(() => []),
        replaceConversationHistory: vi.fn(),
      },
      conversationRuntimeStateBindings: {
        persistCurrentSessionRuntimeState: vi.fn(),
        getPendingPlanVerificationReminderTurnCount: vi.fn(() => null),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      },
      conversationScopeBindings: {
        getConversationTaskRuntime: vi.fn(() => ({ id: "tasks-1" } as any)),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      },
      activityTracker: {
        add: vi.fn(() => "activity-1"),
        finish: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
      } as any,
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      workspaceStatusController: {
        requestRefresh: vi.fn(),
      },
      workspaceRuntimeHost: {
        getRuntime: vi.fn(async () => ({ id: "runtime-1" })),
      } as any,
      companionBindings: {
        postCompanionState: vi.fn(),
        updateCompanionMood: vi.fn(async () => undefined),
      },
      assistantReplyBindings: {
        recordAssistantReply: vi.fn(async () => undefined),
      },
      scheduleStreamingStateUpdate: vi.fn(),
      postState: vi.fn(),
      showWarningMessage: vi.fn(),
      postWebviewMessage: vi.fn(),
      getPlanContentForWorkspace: vi.fn(async () => null),
      isAbortLikeError: vi.fn(() => false),
      toErrorMessage: vi.fn(error => String(error)),
    });

    const parts = factory({
      workspaceFolderPath: "E:\\repo",
      onToolError: vi.fn(),
      state: {
        getCurrentSessionId: () => "session-1",
        setCurrentSessionId: vi.fn(),
        sessionMessages: [],
        conversationMessages: [],
        getPendingPromptAttachments: () => undefined,
        setPendingPromptAttachments: vi.fn(),
        pendingPlanVerification: undefined,
        planModeState: { active: false },
        getSwarm: () => undefined,
        setSwarm: vi.fn(),
        queueAutoMemoryExtraction: vi.fn(),
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setWorkspaceToolCache: vi.fn(),
        appendStreamingText: vi.fn(),
        clearStreamingText: vi.fn(),
      },
    });

    await expect(parts.execution.resolveProviderConfig()).resolves.toEqual({
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
  });

  it("builds prompt request parts that keep extension-owned prompt state live", async () => {
    let currentSessionId = "session-1";
    let currentSwarm: { id: string } | undefined;
    let streamingText = "";
    let pendingPromptAttachments:
      | Array<{ data: string; mimeType: string }>
      | undefined = [
      {
        data: "QUJDRA==",
        mimeType: "image/png",
      },
    ];

    const providerConfig = {
      type: "anthropic" as const,
      apiKey: "secret",
      model: "claude-sonnet",
    };
    const runtimeOptions = { fastMode: true };
    const workspaceRuntime = { id: "runtime-1" } as any;
    const taskRuntime = { id: "tasks-1" } as any;
    const tool = {
      name: "read_file",
      description: "Read a file",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    };
    const providerAdapter = { runStep: vi.fn() };

    resolveProviderConfigMock.mockResolvedValue({
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
    createProviderRuntimeOptionsWithHostMock.mockReturnValue(runtimeOptions);
    buildProviderAdapterMock.mockReturnValue(providerAdapter);

    const settings = {
      getEffortLevel: vi.fn(() => "high"),
      setEffortLevel: vi.fn(async () => undefined),
      getFastMode: vi.fn(() => false),
      setFastMode: vi.fn(async () => undefined),
      setActiveProviderModel: vi.fn(async () => undefined),
      getProviderConfigByAlias: vi.fn(async () => undefined),
      setActiveSessionId: vi.fn(async () => undefined),
    };
    const sessions = {
      getTranscriptFilePath: vi.fn(() => "E:\\repo\\.transcript.jsonl"),
      createSession: vi.fn(async () => undefined),
      ensureSession: vi.fn(async () => undefined),
      appendMessages: vi.fn(async () => undefined),
    };
    const postWebviewMessage = vi.fn();
    const setWorkspaceToolCache = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();
    const getRuntime = vi.fn(async () => workspaceRuntime);
    const scheduleStreamingStateUpdate = vi.fn();
    const updateCompanionMood = vi.fn(async () => undefined);
    const recordAssistantReply = vi.fn(async () => undefined);

    const parts = createExtensionPromptRequestParts({
      workspaceFolderPath: "E:\\repo",
      onToolError: vi.fn(),
      state: {
        getCurrentSessionId: () => currentSessionId,
        setCurrentSessionId: sessionId => {
          currentSessionId = sessionId ?? "";
        },
        sessionMessages: [],
        conversationMessages: [],
        getPendingPromptAttachments: () => pendingPromptAttachments,
        setPendingPromptAttachments: attachments => {
          pendingPromptAttachments = attachments;
        },
        pendingPlanVerification: undefined,
        planModeState: { active: false },
        getSwarm: () => currentSwarm as any,
        setSwarm: swarm => {
          currentSwarm = swarm as { id: string } | undefined;
        },
        queueAutoMemoryExtraction,
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setWorkspaceToolCache,
        appendStreamingText: token => {
          streamingText += token;
        },
        clearStreamingText: () => {
          streamingText = "";
        },
      },
      bindings: {
        settings: settings as any,
        sessions: sessions as any,
        logSession: vi.fn(),
        conversationFeatureBindings: {
          isSessionPersistenceEnabled: vi.fn(() => true),
          shouldEnableSwarmForPrompt: vi.fn(() => true),
        },
        conversationHistoryBindings: {
          getConversationHistory: vi.fn(() => []),
          replaceConversationHistory: vi.fn(),
        },
        conversationRuntimeStateBindings: {
          persistCurrentSessionRuntimeState: vi.fn(),
          getPendingPlanVerificationReminderTurnCount: vi.fn(() => null),
          markPendingPlanVerificationStarted: vi.fn(),
          markPendingPlanVerificationCompleted: vi.fn(),
          resetPendingPlanVerificationToAwaitingStart: vi.fn(),
        },
        conversationScopeBindings: {
          getConversationTaskRuntime: vi.fn(() => taskRuntime),
          ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
          getEffectiveWorkspaceRoot: vi.fn(path => path),
          findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        },
        activityTracker: {
          add: vi.fn(() => "activity-1"),
          finish: vi.fn(),
          startToolExecution: vi.fn(),
          finishToolExecution: vi.fn(),
        } as any,
        backgroundTaskHost: {
          runBuiltInAgentSession: vi.fn(),
          buildFollowUpMessage: vi.fn(() => "follow-up"),
        } as any,
        workspaceStatusController: {
          requestRefresh: vi.fn(),
        },
        workspaceRuntimeHost: {
          getRuntime,
        },
        companionBindings: {
          postCompanionState: vi.fn(),
          updateCompanionMood,
        },
        assistantReplyBindings: {
          recordAssistantReply,
        },
        scheduleStreamingStateUpdate,
        postState: vi.fn(),
        showWarningMessage: vi.fn(),
        postWebviewMessage,
        getPlanContentForWorkspace: vi.fn(async () => null),
        isAbortLikeError: vi.fn(() => false),
        toErrorMessage: vi.fn(error => String(error)),
      },
    });

    parts.session.assignCurrentSessionId("session-2");
    expect(currentSessionId).toBe("session-2");

    parts.conversation.appendConversationMessage({
      role: "user",
      content: "inspect this",
    });
    expect(parts.conversation.buildPromptFileMentionContext).toBe(
      buildPromptFileMentionContext,
    );
    expect(parts.conversation.getConversationTaskRuntime()).toBe(taskRuntime);
    expect(parts.conversation.shouldEnableSwarmForPrompt("use swarm")).toBe(true);
    parts.conversation.assignSwarm({ id: "swarm-1" } as any);
    expect(currentSwarm).toEqual({ id: "swarm-1" });
    parts.conversation.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\repo",
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
    expect(queueAutoMemoryExtraction).toHaveBeenCalledWith({
      workspaceRoot: "E:\\repo",
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
    expect(parts.conversation.getConversationHistory()).toEqual([]);
    expect(pendingPromptAttachments).toBeUndefined();

    await expect(parts.execution.resolveProviderConfig()).resolves.toEqual({
      config: providerConfig,
      envMap: { HELLO: "world" },
    });
    expect(resolveProviderConfigMock).toHaveBeenCalledWith(
      settings,
      "E:\\repo",
    );

    expect(parts.execution.createProviderRuntimeOptions(providerConfig)).toBe(
      runtimeOptions,
    );
    expect(createProviderRuntimeOptionsWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: providerConfig,
        effortLevel: "high",
        fastMode: false,
        postState: expect.any(Function),
        refreshWorkspaceStatus: expect.any(Function),
        showWarningMessage: expect.any(Function),
      }),
    );

    await expect(
      parts.execution.getWorkspaceRuntime({ HELLO: "world" }),
    ).resolves.toBe(workspaceRuntime);
    expect(getRuntime).toHaveBeenCalledWith("E:\\repo", {
      HELLO: "world",
    });

    expect(
      parts.execution.buildProviderAdapter({
        config: providerConfig,
        workspaceRoot: "E:\\repo",
        systemPrompt: "system prompt",
        envMap: { HELLO: "world" },
        runtimeOptions,
      }),
    ).toBe(providerAdapter);
    expect(buildProviderAdapterMock).toHaveBeenCalledWith(
      providerConfig,
      "E:\\repo",
      "system prompt",
      { HELLO: "world" },
      runtimeOptions,
    );

    parts.execution.setFreshWorkspaceTools({
      tools: [tool],
      workspaceRoot: "E:\\repo",
      providerLabel: "Anthropic",
    });
    expect(setWorkspaceToolCache).toHaveBeenCalledWith({
      tools: [tool],
      workspaceRoot: "E:\\repo",
      providerLabel: "Anthropic",
    });

    parts.execution.appendStreamingText("hello");
    expect(streamingText).toBe("hello");
    parts.execution.scheduleStreamingStateUpdate();
    expect(scheduleStreamingStateUpdate).toHaveBeenCalledTimes(1);
    parts.execution.postChatToken("token");
    parts.execution.postWorkerUpdate({ id: "worker-1" } as any);
    expect(postWebviewMessage).toHaveBeenNthCalledWith(1, {
      type: "chat:token",
      token: "token",
    });
    expect(postWebviewMessage).toHaveBeenNthCalledWith(2, {
      type: "swarm:workerUpdate",
      worker: { id: "worker-1" },
    });

    await parts.execution.updateMood(2, true);
    expect(updateCompanionMood).toHaveBeenCalledWith(2, true);
    await parts.execution.recordAssistantReply("reply", true, "thinking");
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "reply",
      true,
      "thinking",
    );

    parts.execution.clearStreamingText();
    expect(streamingText).toBe("");
  });
});
