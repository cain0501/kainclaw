import { describe, expect, it, vi } from "vitest";

import * as promptEntryHost from "./promptEntryHost";
import * as promptFlowHost from "./promptFlowHost";
import { runPromptRequestWithHost } from "./promptRequestHost";
import type { PromptHostBindings } from "./promptHost";
import type {
  PromptExecutionResult,
  PromptRuntimeLike,
} from "./promptExecutionHost";

vi.mock("./promptEntryHost", () => ({
  preparePromptEntryWithHost: vi.fn(),
}));

vi.mock("./promptFlowHost", () => ({
  runPromptFlowWithHost: vi.fn(),
}));

describe("promptRequestHost", () => {
  it("prepares the prompt entry, assigns the current session, and runs the flow", async () => {
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
      effectivePrompt: "fix tests",
    };

    vi.mocked(promptEntryHost.preparePromptEntryWithHost).mockResolvedValue({
      currentSessionId: "session-2",
      promptExecution,
    });
    vi.mocked(promptFlowHost.runPromptFlowWithHost).mockResolvedValue(undefined);

    const assignCurrentSessionId = vi.fn();
    const bindings: PromptHostBindings<any, PromptRuntimeLike> = {
      entryBindings: {} as any,
      flowBindings: {
        maybeAutoCompactConversation: vi.fn(async () => undefined),
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
        getConversationHistory: vi.fn(() => []),
        buildProviderAdapter: vi.fn(),
        recordAssistantReply: vi.fn(async () => undefined),
        setCompanionState: vi.fn(),
        updateMood: vi.fn(async () => undefined),
        createModelActivity: vi.fn(() => "activity-1"),
        appendStreamingToken: vi.fn(),
        logFirstToken: vi.fn(),
        postToken: vi.fn(),
        startToolExecution: vi.fn(),
        finishToolExecution: vi.fn(),
        onToolError: vi.fn(),
        finishModelActivity: vi.fn(),
        logNoStreamingReply: vi.fn(),
        clearStreamingText: vi.fn(),
        queueAutoMemoryExtraction: vi.fn(),
        createSwarm: vi.fn(() => ({ id: "swarm-2" })),
      },
    };

    const result = await runPromptRequestWithHost({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: "session-1",
      sessionMessagesLength: 1,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: vi.fn(() => "workspace-hash"),
      logSession: vi.fn(),
      createSession: vi.fn(async () => undefined),
      setActiveSessionId: vi.fn(async () => undefined),
      ensureSession: vi.fn(async () => undefined),
      appendMessages: vi.fn(async () => undefined),
      assignCurrentSessionId,
      bindings,
    });

    expect(result).toBe(promptExecution);
    expect(promptEntryHost.preparePromptEntryWithHost).toHaveBeenCalledWith({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: "session-1",
      sessionMessagesLength: 1,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: expect.any(Function),
      logSession: expect.any(Function),
      createSession: expect.any(Function),
      setActiveSessionId: expect.any(Function),
      ensureSession: expect.any(Function),
      appendMessages: expect.any(Function),
      bindings: bindings.entryBindings,
    });
    expect(assignCurrentSessionId).toHaveBeenCalledWith("session-2");
    expect(promptFlowHost.runPromptFlowWithHost).toHaveBeenCalledWith({
      prompt: "fix tests",
      promptExecution,
      ...bindings.flowBindings,
    });
  });
});
