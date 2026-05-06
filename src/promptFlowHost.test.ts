import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptExecutionResult, PromptRuntimeLike } from "./promptExecutionHost";
import {
  createPromptFlowBindings,
  createPromptFlowBindingsFromShared,
  createPromptFlowExecutionCallbacks,
  createPromptFlowHostBindings,
  createPromptFlowStateBindings,
  runPromptFlowWithHost,
} from "./promptFlowHost";
import { createPromptSharedBindings } from "./promptBindingsHost";

type ContinuePromptExecution = Extract<
  PromptExecutionResult<PromptRuntimeLike>,
  { kind: "continue" }
>;

const {
  applyPromptTurnUserContextMock,
  runPromptTurnWithHostMock,
  runPromptAgentTurnMock,
} = vi.hoisted(() => ({
  applyPromptTurnUserContextMock: vi.fn(),
  runPromptTurnWithHostMock: vi.fn(),
  runPromptAgentTurnMock: vi.fn(),
}));

vi.mock("./promptSetupHost", () => ({
  applyPromptTurnUserContext: applyPromptTurnUserContextMock,
}));

vi.mock("./promptTurnHost", async importOriginal => {
  const original = await importOriginal<typeof import("./promptTurnHost")>();
  return {
    ...original,
    runPromptTurnWithHost: runPromptTurnWithHostMock,
    runPromptAgentTurn: runPromptAgentTurnMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createBaseOptions() {
  return {
    prompt: "fix @src/extension.ts",
    recordAssistantReply: vi.fn(async () => undefined),
    setCompanionState: vi.fn(),
    updateMood: vi.fn(async () => undefined),
    createModelActivity: vi.fn(() => "activity-1"),
    appendConversationMessage: vi.fn(),
    buildPromptFileMentionContext: vi.fn(async () => ({
      supplementalPrompt: "context payload",
    })),
    persistCurrentSessionRuntimeState: vi.fn(),
    maybeAutoCompactConversation: vi.fn(async () => undefined),
    existingSwarm: { id: "swarm-1" },
    createSwarm: vi.fn(() => ({ id: "swarm-2" })),
    assignSwarm: vi.fn(),
    getConversationHistory: vi.fn(() => [
      { role: "user" as const, content: "existing" },
    ]),
    buildWorkspaceSystemPrompt: vi.fn(async () => "system prompt"),
    buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
    shouldEnableSwarmForPrompt: vi.fn(() => true),
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
  };
}

describe("promptFlowHost", () => {
  it("creates prompt flow bindings from shared bindings plus flow-specific handlers", async () => {
    const sharedBindings = createPromptSharedBindings({
      getConversationHistory: () => [
        { role: "user" as const, content: "existing" },
      ],
      isSessionPersistenceEnabled: () => true,
      getCurrentSessionId: () => "session-1",
      getTranscriptFilePath: () => "E:\\repo\\.transcript.jsonl",
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    });
    const maybeAutoCompactConversation = vi.fn(async () => undefined);
    const createSwarm = vi.fn(() => ({ id: "swarm-2" }));
    const buildWorkspaceSystemPrompt = vi.fn(async () => "system prompt");
    const appendConversationMessage = vi.fn();
    const buildPromptFileMentionContext = vi.fn(async () => ({
      supplementalPrompt: "context payload",
    }));
    const persistCurrentSessionRuntimeState = vi.fn();
    const assignSwarm = vi.fn();
    const shouldEnableSwarmForPrompt = vi.fn(() => true);
    const appendStreamingText = vi.fn();
    const scheduleStreamingStateUpdate = vi.fn();
    const postChatToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const onToolError = vi.fn();
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();

    const bindings = createPromptFlowBindingsFromShared({
      sharedBindings,
      maybeAutoCompactConversation,
      createSwarm,
      buildWorkspaceSystemPrompt,
      appendConversationMessage,
      buildPromptFileMentionContext,
      persistCurrentSessionRuntimeState,
      existingSwarm: { id: "swarm-1" },
      assignSwarm,
      shouldEnableSwarmForPrompt,
      appendStreamingText,
      scheduleStreamingStateUpdate,
      postChatToken,
      startToolExecution,
      finishToolExecution,
      onToolError,
      setCompanionState,
      updateMood,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
    });

    await bindings.maybeAutoCompactConversation(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      { HELLO: "world" },
    );
    bindings.appendConversationMessage({ role: "user", content: "hello" });
    bindings.createModelActivity();

    expect(maybeAutoCompactConversation).toHaveBeenCalledTimes(1);
    expect(appendConversationMessage).toHaveBeenCalledWith({
      role: "user",
      content: "hello",
    });
    expect(bindings.existingSwarm).toEqual({ id: "swarm-1" });
  });

  it("creates prompt flow bindings from raw handlers", async () => {
    const maybeAutoCompactConversation = vi.fn(async () => undefined);
    const createSwarm = vi.fn(() => ({ id: "swarm-2" }));
    const buildWorkspaceSystemPrompt = vi.fn(async () => "system prompt");
    const appendConversationMessage = vi.fn();
    const buildPromptFileMentionContext = vi.fn(async () => ({
      supplementalPrompt: "context payload",
    }));
    const persistCurrentSessionRuntimeState = vi.fn();
    const assignSwarm = vi.fn();
    const getConversationHistory = vi.fn(() => [
      { role: "user" as const, content: "existing" },
    ]);
    const buildProviderAdapter = vi.fn(() => ({ runStep: vi.fn() }));
    const shouldEnableSwarmForPrompt = vi.fn(() => true);
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();
    const appendStreamingText = vi.fn();
    const scheduleStreamingStateUpdate = vi.fn();
    const postChatToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const onToolError = vi.fn();
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();

    const bindings = createPromptFlowBindings({
      maybeAutoCompactConversation,
      createSwarm,
      buildWorkspaceSystemPrompt,
      appendConversationMessage,
      buildPromptFileMentionContext,
      persistCurrentSessionRuntimeState,
      existingSwarm: { id: "swarm-1" },
      assignSwarm,
      getConversationHistory,
      buildProviderAdapter,
      shouldEnableSwarmForPrompt,
      addPhaseActivity,
      finishPhaseActivity,
      appendStreamingText,
      scheduleStreamingStateUpdate,
      postChatToken,
      startToolExecution,
      finishToolExecution,
      onToolError,
      setCompanionState,
      updateMood,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
    });

    await bindings.maybeAutoCompactConversation(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      { HELLO: "world" },
    );
    bindings.appendConversationMessage({ role: "user", content: "hello" });
    bindings.createModelActivity();

    expect(maybeAutoCompactConversation).toHaveBeenCalledWith(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      { HELLO: "world" },
    );
    expect(appendConversationMessage).toHaveBeenCalledWith({
      role: "user",
      content: "hello",
    });
    expect(addPhaseActivity).toHaveBeenCalledTimes(1);
    expect(bindings.existingSwarm).toEqual({ id: "swarm-1" });
  });

  it("creates prompt flow host bindings that merge state, execution, and setup helpers", async () => {
    const maybeAutoCompactConversation = vi.fn(async () => undefined);
    const createSwarm = vi.fn(() => ({ id: "swarm-2" }));
    const buildWorkspaceSystemPrompt = vi.fn(async () => "system prompt");
    const stateBindings = createPromptFlowStateBindings({
      appendConversationMessage: vi.fn(),
      buildPromptFileMentionContext: vi.fn(async () => ({
        supplementalPrompt: "context payload",
      })),
      persistCurrentSessionRuntimeState: vi.fn(),
      existingSwarm: { id: "swarm-1" },
      assignSwarm: vi.fn(),
      getConversationHistory: vi.fn(() => [
        { role: "user" as const, content: "existing" },
      ]),
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      shouldEnableSwarmForPrompt: vi.fn(() => true),
    });
    const executionCallbacks = createPromptFlowExecutionCallbacks({
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
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
    });

    const bindings = createPromptFlowHostBindings({
      maybeAutoCompactConversation,
      createSwarm,
      buildWorkspaceSystemPrompt,
      stateBindings,
      executionCallbacks,
    });

    await bindings.maybeAutoCompactConversation(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      { HELLO: "world" },
    );
    await bindings.buildWorkspaceSystemPrompt(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );
    bindings.appendConversationMessage({ role: "user", content: "hello" });
    bindings.createModelActivity();

    expect(maybeAutoCompactConversation).toHaveBeenCalledWith(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      { HELLO: "world" },
    );
    expect(buildWorkspaceSystemPrompt).toHaveBeenCalledWith(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );
    expect(bindings.existingSwarm).toEqual({ id: "swarm-1" });
  });

  it("creates prompt flow state bindings that pass conversation and swarm state through unchanged", async () => {
    const appendConversationMessage = vi.fn();
    const buildPromptFileMentionContext = vi.fn(async () => ({
      supplementalPrompt: "context payload",
    }));
    const persistCurrentSessionRuntimeState = vi.fn();
    const assignSwarm = vi.fn();
    const getConversationHistory = vi.fn(() => [
      { role: "user" as const, content: "existing" },
    ]);
    const buildProviderAdapter = vi.fn(() => ({ runStep: vi.fn() }));
    const shouldEnableSwarmForPrompt = vi.fn(() => true);
    const existingSwarm = { id: "swarm-1" };

    const bindings = createPromptFlowStateBindings({
      appendConversationMessage,
      buildPromptFileMentionContext,
      persistCurrentSessionRuntimeState,
      existingSwarm,
      assignSwarm,
      getConversationHistory,
      buildProviderAdapter,
      shouldEnableSwarmForPrompt,
    });

    bindings.appendConversationMessage({ role: "user", content: "hello" });
    await bindings.buildPromptFileMentionContext({
      prompt: "fix it",
      workspaceRoot: "E:\\repo",
    });
    bindings.persistCurrentSessionRuntimeState();
    bindings.assignSwarm({ id: "swarm-2" });
    bindings.getConversationHistory();
    bindings.buildProviderAdapter({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
    });
    bindings.shouldEnableSwarmForPrompt("use swarm");

    expect(bindings.existingSwarm).toBe(existingSwarm);
    expect(appendConversationMessage).toHaveBeenCalledWith({
      role: "user",
      content: "hello",
    });
    expect(buildPromptFileMentionContext).toHaveBeenCalledWith({
      prompt: "fix it",
      workspaceRoot: "E:\\repo",
    });
    expect(persistCurrentSessionRuntimeState).toHaveBeenCalledTimes(1);
    expect(assignSwarm).toHaveBeenCalledWith({ id: "swarm-2" });
    expect(getConversationHistory).toHaveBeenCalledTimes(1);
    expect(buildProviderAdapter).toHaveBeenCalledWith({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
    });
    expect(shouldEnableSwarmForPrompt).toHaveBeenCalledWith("use swarm");
  });

  it("creates prompt flow execution callbacks that wire model activity, streaming, and lifecycle events", async () => {
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();
    const appendStreamingText = vi.fn();
    const scheduleStreamingStateUpdate = vi.fn();
    const postChatToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const onToolError = vi.fn();
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();
    const logFirstToken = vi.fn();
    const logNoStreamingReply = vi.fn();

    const callbacks = createPromptFlowExecutionCallbacks({
      addPhaseActivity,
      finishPhaseActivity,
      appendStreamingText,
      scheduleStreamingStateUpdate,
      postChatToken,
      startToolExecution,
      finishToolExecution,
      onToolError,
      setCompanionState,
      updateMood,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
      logFirstToken,
      logNoStreamingReply,
    });

    callbacks.createModelActivity();
    callbacks.appendStreamingToken("hello");
    callbacks.logFirstToken("hello");
    callbacks.postToken("hello");
    callbacks.startToolExecution("exec-1", "Run tool", "detail");
    callbacks.finishToolExecution("exec-1", "done", "ok");
    callbacks.onToolError?.();
    callbacks.finishModelActivity("activity-1", "done", "ok");
    callbacks.logNoStreamingReply();
    callbacks.clearStreamingText();
    callbacks.setCompanionState("done");
    await callbacks.updateMood(5, true);
    await callbacks.recordAssistantReply("reply", true, "summary");
    callbacks.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
    });

    expect(addPhaseActivity).toHaveBeenCalledWith(
      "正在请求模型",
      "等待模型决定是否调用工具",
      "running",
    );
    expect(appendStreamingText).toHaveBeenCalledWith("hello");
    expect(scheduleStreamingStateUpdate).toHaveBeenCalledTimes(1);
    expect(postChatToken).toHaveBeenCalledWith("hello");
    expect(startToolExecution).toHaveBeenCalledWith("exec-1", "Run tool", "detail");
    expect(finishToolExecution).toHaveBeenCalledWith("exec-1", "done", "ok");
    expect(onToolError).toHaveBeenCalledTimes(1);
    expect(finishPhaseActivity).toHaveBeenCalledWith("activity-1", "done", "ok");
    expect(logFirstToken).toHaveBeenCalledWith("hello");
    expect(logNoStreamingReply).toHaveBeenCalledTimes(1);
    expect(clearStreamingText).toHaveBeenCalledTimes(1);
    expect(setCompanionState).toHaveBeenCalledWith("done");
    expect(updateMood).toHaveBeenCalledWith(5, true);
    expect(recordAssistantReply).toHaveBeenCalledWith("reply", true, "summary");
    expect(queueAutoMemoryExtraction).toHaveBeenCalledWith({
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
    });
  });

  it("handles reply executions without entering prompt turn setup", async () => {
    const options = createBaseOptions();

    await runPromptFlowWithHost({
      ...options,
      promptExecution: {
        kind: "reply",
        reply: "handled locally",
      },
    });

    expect(options.recordAssistantReply).toHaveBeenCalledWith(
      "handled locally",
      false,
    );
    expect(options.setCompanionState).toHaveBeenCalledWith("done");
    expect(options.updateMood).toHaveBeenCalledWith(2, true);
    expect(options.createModelActivity).not.toHaveBeenCalled();
    expect(applyPromptTurnUserContextMock).not.toHaveBeenCalled();
    expect(runPromptTurnWithHostMock).not.toHaveBeenCalled();
  });

  it("returns immediately for handled executions", async () => {
    const options = createBaseOptions();

    await runPromptFlowWithHost({
      ...options,
      promptExecution: {
        kind: "handled",
      },
    });

    expect(options.recordAssistantReply).not.toHaveBeenCalled();
    expect(options.setCompanionState).not.toHaveBeenCalled();
    expect(options.updateMood).not.toHaveBeenCalled();
    expect(options.createModelActivity).not.toHaveBeenCalled();
    expect(applyPromptTurnUserContextMock).not.toHaveBeenCalled();
    expect(runPromptTurnWithHostMock).not.toHaveBeenCalled();
  });

  it("runs installed-skill fork executions without mutating the main conversation", async () => {
    const options = createBaseOptions();
    runPromptAgentTurnMock.mockResolvedValue({
      reply: "forked skill reply",
      sawStreamingToken: false,
      latestThinkingSummary: "fork summary",
    });

    await runPromptFlowWithHost({
      ...options,
      promptExecution: {
        kind: "continue",
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
        effortLevel: "high",
        runtimeOptions: { effortLevel: "high" },
        workspaceRoot: "E:\\repo",
        runtime: {
          getToolContext: () =>
            ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        } as PromptRuntimeLike,
        tools: [{ name: "read_file" }] as any,
        effectivePrompt: "Run the forked installed skill",
        installedSkillExecution: {
          skill: {
            id: "browse",
            title: "browse",
            summary: "Browser automation helper",
            argumentNames: [],
            disableModelInvocation: false,
            hooks: [],
            entrypoint: "/browse",
            source: "user",
            skillPath: "E:/skills/browse/SKILL.md",
            allowedTools: [],
          },
          prompt: "Run the forked installed skill",
          allowedTools: [],
          disableModelInvocation: false,
          executionContext: "fork",
          hooks: [],
        },
      },
    });

    expect(options.createModelActivity).toHaveBeenCalledTimes(1);
    expect(options.buildWorkspaceSystemPrompt).toHaveBeenCalledWith(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );
    expect(options.buildProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo",
        envMap: { HELLO: "world" },
        runtimeOptions: { effortLevel: "high" },
      }),
    );
    expect(runPromptAgentTurnMock).toHaveBeenCalledTimes(1);
    expect(options.recordAssistantReply).toHaveBeenCalledWith(
      "forked skill reply",
      false,
      "fork summary",
    );
    expect(options.updateMood).toHaveBeenCalledWith(3, false);
    expect(applyPromptTurnUserContextMock).not.toHaveBeenCalled();
    expect(runPromptTurnWithHostMock).not.toHaveBeenCalled();
  });

  it("runs user-context setup and main prompt turn for continue executions", async () => {
    const options = createBaseOptions();
    const runtime: PromptRuntimeLike = {
      getToolDefinitions: vi.fn(async () => []),
      getMcpStatusSummary: vi.fn(async () => []),
      getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
    };
    const promptExecution: ContinuePromptExecution = {
      kind: "continue" as const,
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      effortLevel: "high" as const,
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo",
      runtime,
      tools: [{
        name: "read_file",
        description: "Read a file",
        input_schema: {
          type: "object",
          properties: {},
        },
      }],
      effectivePrompt: "Expanded MCP prompt",
      effectivePromptAttachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
    };

    await runPromptFlowWithHost({
      ...options,
      promptExecution,
    });

    const runPromptTurnOptions = runPromptTurnWithHostMock.mock.calls[0]?.[0];
    expect(runPromptTurnOptions).toBeDefined();
    runPromptTurnOptions.createSwarm();
    runPromptTurnOptions.queueAutoMemoryExtraction();

    expect(options.createModelActivity).toHaveBeenCalledTimes(1);
    expect(applyPromptTurnUserContextMock).toHaveBeenCalledWith({
      prompt: "Expanded MCP prompt",
      attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      workspaceRoot: "E:\\repo",
      config: promptExecution.config,
      envMap: { HELLO: "world" },
      appendConversationMessage: options.appendConversationMessage,
      buildPromptFileMentionContext: options.buildPromptFileMentionContext,
      persistCurrentSessionRuntimeState: options.persistCurrentSessionRuntimeState,
      maybeAutoCompactConversation: options.maybeAutoCompactConversation,
    });
    expect(runPromptTurnWithHostMock).toHaveBeenCalledWith({
      prompt: "Expanded MCP prompt",
      workspaceRoot: "E:\\repo",
      config: promptExecution.config,
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      runtime: promptExecution.runtime,
      tools: promptExecution.tools,
      installedSkillHooks: [],
      userHooks: [],
      installedSkillAgentRunner: expect.any(Function),
      existingSwarm: options.existingSwarm,
      createSwarm: expect.any(Function),
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
      modelActivityId: "activity-1",
      finishModelActivity: options.finishModelActivity,
      logNoStreamingReply: options.logNoStreamingReply,
      recordAssistantReply: options.recordAssistantReply,
      clearStreamingText: options.clearStreamingText,
      queueAutoMemoryExtraction: expect.any(Function),
      updateMood: options.updateMood,
    });
    expect(options.createSwarm).toHaveBeenCalledWith({
      workerToolContext: {
        workspaceRoot: "E:\\repo",
        invokerKind: "main",
      },
      promptExecution,
    });
    expect(options.queueAutoMemoryExtraction).toHaveBeenCalledWith({
      workspaceRoot: "E:\\repo",
      config: promptExecution.config,
      envMap: { HELLO: "world" },
    });
  });
});
