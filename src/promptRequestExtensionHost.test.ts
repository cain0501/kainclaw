import { describe, expect, it, vi } from "vitest";

const { runPromptRequestWithAssemblyMock } = vi.hoisted(() => ({
  runPromptRequestWithAssemblyMock: vi.fn(),
}));

vi.mock("./promptRequestFactory", () => ({
  runPromptRequestWithAssembly: runPromptRequestWithAssemblyMock,
}));

import type {
  PromptExecutionResult,
  PromptRuntimeLike,
} from "./promptExecutionHost";
import {
  createPromptRequestConversationPart,
  createPromptRequestExtensionBindings,
  createPromptRequestExecutionPart,
  createPromptRequestSessionPart,
  runPromptRequestWithExtensionParts,
  runPromptRequestWithExtensionHost,
} from "./promptRequestExtensionHost";

describe("promptRequestExtensionHost", () => {
  it("creates a conversation part that merges and clears pending user attachments", async () => {
    const conversationMessages: Array<{
      role: "user" | "assistant";
      content: string;
      attachments?: Array<{ data: string; mimeType: string }>;
    }> = [];
    let pendingPromptAttachments:
      | Array<{ data: string; mimeType: string }>
      | undefined = [
      {
        data: "QUJDRA==",
        mimeType: "image/png",
      },
    ];

    const part = createPromptRequestConversationPart({
      getConversationHistory: vi.fn(() => []),
      replaceConversationHistory: vi.fn(),
      conversationMessages,
      getPendingPromptAttachments: () => pendingPromptAttachments,
      setPendingPromptAttachments: attachments => {
        pendingPromptAttachments = attachments;
      },
      persistCurrentSessionRuntimeState: vi.fn(),
      pendingPlanVerification: undefined,
      planModeState: { active: false },
      getPendingPlanVerificationReminderTurns: vi.fn(() => null),
      getPlanContent: vi.fn(async () => null),
      getConversationTaskRuntime: vi.fn(() => ({} as any)),
      buildPromptFileMentionContext: vi.fn(async () => ({})),
      existingSwarm: undefined,
      assignSwarm: vi.fn(),
      shouldEnableSwarmForPrompt: vi.fn(() => false),
      queueAutoMemoryExtraction: vi.fn(),
    });

    part.appendConversationMessage({
      role: "user",
      content: "look at this",
    });

    expect(conversationMessages).toEqual([
      {
        role: "user",
        content: "look at this",
        attachments: [
          {
            data: "QUJDRA==",
            mimeType: "image/png",
          },
        ],
      },
    ]);
    expect(pendingPromptAttachments).toBeUndefined();
  });

  it("creates extension bindings with a live session getter for shared prompt state", () => {
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
    const activityTracker = {
      add: vi.fn(() => "activity-1"),
      finish: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
    };
    const backgroundTaskHost = {
      runBuiltInAgentSession: vi.fn(),
      buildFollowUpMessage: vi.fn(() => "follow-up"),
    };
    const workspaceStatusController = {
      requestRefresh: vi.fn(),
    };
    let currentSessionId = "session-1";

    const bindings = createPromptRequestExtensionBindings({
      session: createPromptRequestSessionPart({
        getCurrentSessionId: () => currentSessionId,
        sessionMessages: [],
        isSessionPersistenceEnabled: true,
        settings: settings as any,
        sessions: sessions as any,
        getWorkspaceHash: vi.fn(() => "workspace-hash"),
        logSession: vi.fn(),
        assignCurrentSessionId: sessionId => {
          currentSessionId = sessionId ?? "";
        },
      }),
      conversation: createPromptRequestConversationPart({
        getConversationHistory: vi.fn(() => []),
        replaceConversationHistory: vi.fn(),
        conversationMessages: [],
        getPendingPromptAttachments: () => undefined,
        setPendingPromptAttachments: vi.fn(),
        persistCurrentSessionRuntimeState: vi.fn(),
        pendingPlanVerification: undefined,
        planModeState: { active: false },
        getPendingPlanVerificationReminderTurns: vi.fn(() => null),
        getPlanContent: vi.fn(async () => null),
        getConversationTaskRuntime: vi.fn(() => ({} as any)),
        buildPromptFileMentionContext: vi.fn(async () => ({})),
        existingSwarm: undefined,
        assignSwarm: vi.fn(),
        shouldEnableSwarmForPrompt: vi.fn(() => false),
        queueAutoMemoryExtraction: vi.fn(),
      }),
      execution: createPromptRequestExecutionPart({
        workspaceFolderPath: "E:\\repo",
        activityTracker: activityTracker as any,
        backgroundTaskHost: backgroundTaskHost as any,
        workspaceStatusController,
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setFreshWorkspaceTools: vi.fn(),
        resolveProviderConfig: vi.fn(async () => ({
          config: {
            type: "anthropic" as const,
            apiKey: "secret",
            model: "claude-sonnet",
          },
          envMap: { HELLO: "world" },
        })),
        createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        getWorkspaceRuntime: vi.fn(async () => ({} as PromptRuntimeLike)),
        buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        isAbortLikeError: vi.fn(() => false),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
        appendStreamingText: vi.fn(),
        scheduleStreamingStateUpdate: vi.fn(),
        postChatToken: vi.fn(),
        onToolError: vi.fn(),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        recordAssistantReply: vi.fn(async () => undefined),
        clearStreamingText: vi.fn(),
        toErrorMessage: vi.fn(() => "error"),
        postWorkerUpdate: vi.fn(),
      }),
    });

    expect(bindings.request.currentSessionId).toBe("session-1");
    bindings.request.assignCurrentSessionId("session-2");
    expect(currentSessionId).toBe("session-2");
    expect(bindings.hostAssembly.shared.getCurrentSessionId()).toBe("session-2");
    expect(
      bindings.hostAssembly.shared.getTranscriptFilePath("session-2"),
    ).toBe("E:\\repo\\.transcript.jsonl");
  });

  it("maps extension-facing dependencies into a prompt request assembly call", async () => {
    const promptExecution: PromptExecutionResult<PromptRuntimeLike> = {
      kind: "continue",
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo",
      runtime: {} as PromptRuntimeLike,
      tools: [],
    };
    runPromptRequestWithAssemblyMock.mockResolvedValue(promptExecution);

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
    const activityTracker = {
      add: vi.fn(() => "activity-1"),
      finish: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
    };
    const backgroundTaskHost = {
      runBuiltInAgentSession: vi.fn(),
      buildFollowUpMessage: vi.fn(() => "follow-up"),
    };
    const workspaceStatusController = {
      requestRefresh: vi.fn(),
    };
    const assignCurrentSessionId = vi.fn();

    const bindings = createPromptRequestExtensionBindings({
      session: createPromptRequestSessionPart({
        getCurrentSessionId: () => "session-1",
        sessionMessages: [],
        isSessionPersistenceEnabled: true,
        settings: settings as any,
        sessions: sessions as any,
        getWorkspaceHash: vi.fn(() => "workspace-hash"),
        logSession: vi.fn(),
        assignCurrentSessionId,
      }),
      conversation: createPromptRequestConversationPart({
        getConversationHistory: vi.fn(() => []),
        replaceConversationHistory: vi.fn(),
        conversationMessages: [],
        getPendingPromptAttachments: () => undefined,
        setPendingPromptAttachments: vi.fn(),
        persistCurrentSessionRuntimeState: vi.fn(),
        pendingPlanVerification: undefined,
        planModeState: { active: false },
        getPendingPlanVerificationReminderTurns: vi.fn(() => null),
        getPlanContent: vi.fn(async () => null),
        getConversationTaskRuntime: vi.fn(() => ({} as any)),
        buildPromptFileMentionContext: vi.fn(async () => ({})),
        existingSwarm: undefined,
        assignSwarm: vi.fn(),
        shouldEnableSwarmForPrompt: vi.fn(() => false),
        queueAutoMemoryExtraction: vi.fn(),
      }),
      execution: createPromptRequestExecutionPart({
        workspaceFolderPath: "E:\\repo",
        activityTracker: activityTracker as any,
        backgroundTaskHost: backgroundTaskHost as any,
        workspaceStatusController,
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setFreshWorkspaceTools: vi.fn(),
        resolveProviderConfig: vi.fn(async () => ({
          config: {
            type: "anthropic" as const,
            apiKey: "secret",
            model: "claude-sonnet",
          },
          envMap: { HELLO: "world" },
        })),
        createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        getWorkspaceRuntime: vi.fn(async () => ({} as PromptRuntimeLike)),
        buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        isAbortLikeError: vi.fn(() => false),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
        appendStreamingText: vi.fn(),
        scheduleStreamingStateUpdate: vi.fn(),
        postChatToken: vi.fn(),
        onToolError: vi.fn(),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        recordAssistantReply: vi.fn(async () => undefined),
        clearStreamingText: vi.fn(),
        toErrorMessage: vi.fn(() => "error"),
        postWorkerUpdate: vi.fn(),
      }),
    });

    const result = await runPromptRequestWithExtensionHost({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      bindings,
    });

    expect(result).toBe(promptExecution);
    expect(runPromptRequestWithAssemblyMock).toHaveBeenCalledWith({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: "session-1",
      sessionMessagesLength: 0,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: expect.any(Function),
      logSession: expect.any(Function),
      createSession: expect.any(Function),
      setActiveSessionId: expect.any(Function),
      ensureSession: expect.any(Function),
      appendMessages: expect.any(Function),
      assignCurrentSessionId,
      hostAssembly: {
        shared: expect.objectContaining({
          isSessionPersistenceEnabled: expect.any(Function),
          getCurrentSessionId: expect.any(Function),
          getTranscriptFilePath: expect.any(Function),
        }),
        callbacks: expect.objectContaining({
          appendStreamingText: expect.any(Function),
          recordAssistantReply: expect.any(Function),
        }),
        entry: expect.objectContaining({
          sessionMessages: [],
          backgroundTaskHost,
          refreshWorkspaceStatus: workspaceStatusController.requestRefresh,
        }),
        flow: expect.objectContaining({
          existingSwarm: undefined,
          buildPromptFileMentionContext: expect.any(Function),
          queueAutoMemoryExtraction: expect.any(Function),
        }),
      },
    });
  });

  it("runs a prompt request directly from extension parts", async () => {
    const promptExecution: PromptExecutionResult<PromptRuntimeLike> = {
      kind: "continue",
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo",
      runtime: {} as PromptRuntimeLike,
      tools: [],
    };
    runPromptRequestWithAssemblyMock.mockResolvedValue(promptExecution);

    const parts = {
      session: createPromptRequestSessionPart({
        getCurrentSessionId: () => "session-1",
        sessionMessages: [],
        isSessionPersistenceEnabled: true,
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
        getWorkspaceHash: vi.fn(() => "workspace-hash"),
        logSession: vi.fn(),
        assignCurrentSessionId: vi.fn(),
      }),
      conversation: createPromptRequestConversationPart({
        getConversationHistory: vi.fn(() => []),
        replaceConversationHistory: vi.fn(),
        conversationMessages: [],
        getPendingPromptAttachments: () => undefined,
        setPendingPromptAttachments: vi.fn(),
        persistCurrentSessionRuntimeState: vi.fn(),
        pendingPlanVerification: undefined,
        planModeState: { active: false },
        getPendingPlanVerificationReminderTurns: vi.fn(() => null),
        getPlanContent: vi.fn(async () => null),
        getConversationTaskRuntime: vi.fn(() => ({} as any)),
        buildPromptFileMentionContext: vi.fn(async () => ({})),
        existingSwarm: undefined,
        assignSwarm: vi.fn(),
        shouldEnableSwarmForPrompt: vi.fn(() => false),
        queueAutoMemoryExtraction: vi.fn(),
      }),
      execution: createPromptRequestExecutionPart({
        workspaceFolderPath: "E:\\repo",
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
        cachedTools: [],
        cachedToolsWorkspaceRoot: "E:\\repo",
        setFreshWorkspaceTools: vi.fn(),
        resolveProviderConfig: vi.fn(async () => ({
          config: {
            type: "anthropic" as const,
            apiKey: "secret",
            model: "claude-sonnet",
          },
          envMap: { HELLO: "world" },
        })),
        createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
        ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
        getEffectiveWorkspaceRoot: vi.fn(path => path),
        getWorkspaceRuntime: vi.fn(async () => ({} as PromptRuntimeLike)),
        buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
        findActiveBuiltInAgentTask: vi.fn(async () => undefined),
        isAbortLikeError: vi.fn(() => false),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: vi.fn(),
        appendStreamingText: vi.fn(),
        scheduleStreamingStateUpdate: vi.fn(),
        postChatToken: vi.fn(),
        onToolError: vi.fn(),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        recordAssistantReply: vi.fn(async () => undefined),
        clearStreamingText: vi.fn(),
        toErrorMessage: vi.fn(() => "error"),
        postWorkerUpdate: vi.fn(),
      }),
    };

    const result = await runPromptRequestWithExtensionParts({
      prompt: "fix tests",
      parts,
    });

    expect(result).toBe(promptExecution);
    expect(runPromptRequestWithAssemblyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "fix tests",
        workspaceFolderPath: "E:\\repo",
      }),
    );
  });
});
