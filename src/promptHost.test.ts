import { describe, expect, it, vi } from "vitest";

import { createPromptSharedBindings } from "./promptBindingsHost";
import { createPromptHostBindings } from "./promptHost";
import type { PromptRuntimeLike } from "./promptExecutionHost";

describe("promptHost", () => {
  it("creates entry and flow bindings from shared bindings in one step", async () => {
    const sharedBindings = createPromptSharedBindings({
      getConversationHistory: () => [],
      isSessionPersistenceEnabled: () => true,
      getCurrentSessionId: () => "session-1",
      getTranscriptFilePath: () => "E:\\repo\\.transcript.jsonl",
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    });
    const getWorkspaceRuntime = vi.fn(async () => ({}) as PromptRuntimeLike);

    const bindings = createPromptHostBindings({
      sharedBindings,
      entry: {
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
        getWorkspaceRuntime,
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
      },
      flow: {
        maybeAutoCompactConversation: vi.fn(async () => undefined),
        createSwarm: vi.fn(() => ({ id: "swarm-2" })),
        buildWorkspaceSystemPrompt: vi.fn(async () => "system prompt"),
        appendConversationMessage: vi.fn(),
        replaceConversationHistory: vi.fn(async () => undefined),
        buildPromptFileMentionContext: vi.fn(async () => ({
          supplementalPrompt: "context payload",
        })),
        persistCurrentSessionRuntimeState: vi.fn(),
        existingSwarm: { id: "swarm-1" },
        assignSwarm: vi.fn(),
        shouldEnableSwarmForPrompt: vi.fn(() => true),
        appendStreamingText: vi.fn(),
        scheduleStreamingStateUpdate: vi.fn(),
        postChatToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        onToolError: vi.fn(),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        recordAssistantReply: vi.fn(async () => undefined),
        clearStreamingText: vi.fn(),
        queueAutoMemoryExtraction: vi.fn(),
      },
    });

    const providerResolution =
      await bindings.entryBindings.runtimeBindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(bindings.entryBindings.commandBindings.getTranscriptPath()).toBe(
      "E:\\repo\\.transcript.jsonl",
    );
    expect(bindings.flowBindings.existingSwarm).toEqual({ id: "swarm-1" });
    expect(getWorkspaceRuntime).not.toHaveBeenCalled();
  });
});
