import { describe, expect, it, vi } from "vitest";

import type { NormalizedMessage } from "./agent/providers/IProviderAdapter";
import {
  createPromptTurnAgentCallbacks,
  executePreparedPromptTurn,
  finalizePromptTurnSuccess,
  resolvePromptTurnSwarm,
  runPromptAgentTurn,
  runPromptTurnWithHost,
} from "./promptTurnHost";

describe("promptTurnHost helpers", () => {
  it("creates or reuses swarm only when the turn enables it", () => {
    const createSwarm = vi.fn(() => ({ id: "new-swarm" }));

    expect(
      resolvePromptTurnSwarm({
        swarmEnabledForTurn: false,
        createSwarm,
      }),
    ).toBeUndefined();
    expect(createSwarm).not.toHaveBeenCalled();

    const existing = { id: "existing-swarm" };
    expect(
      resolvePromptTurnSwarm({
        swarmEnabledForTurn: true,
        existingSwarm: existing,
        createSwarm,
      }),
    ).toBe(existing);
    expect(createSwarm).not.toHaveBeenCalled();

    expect(
      resolvePromptTurnSwarm({
        swarmEnabledForTurn: true,
        createSwarm,
      }),
    ).toEqual({ id: "new-swarm" });
    expect(createSwarm).toHaveBeenCalledTimes(1);
  });

  it("runs the main prompt turn and reports streaming/thinking/tool callbacks", async () => {
    const onToken = vi.fn();
    const onThinkingSummary = vi.fn();
    const onToolStart = vi.fn();
    const onToolEnd = vi.fn();

    const result = await runPromptAgentTurn({
      history: [{ role: "user", content: "hello" }],
      provider: { runStep: vi.fn() },
      tools: [{ name: "read_file" } as any],
      toolContext: { mode: "main" } as any,
      activeSwarm: { id: "swarm-1" } as any,
      onToken,
      onThinkingSummary,
      onToolStart,
      onToolEnd,
      runAgentImpl: (async (
        _history: NormalizedMessage[],
        opts: any,
      ) => {
        opts.onToken?.("hello ");
        opts.onToken?.("world");
        opts.onThinkingSummary?.("short summary");
        opts.onToolStart?.("read_file", { path: "README.md" }, "exec-1");
        opts.onToolEnd?.("exec-1", "done", false);
        expect(opts.swarm).toEqual({ id: "swarm-1" });
        return { text: "assistant reply" };
      }) as any,
    });

    expect(onToken).toHaveBeenNthCalledWith(1, "hello ", { isFirstToken: true });
    expect(onToken).toHaveBeenNthCalledWith(2, "world", { isFirstToken: false });
    expect(onThinkingSummary).toHaveBeenCalledWith("short summary");
    expect(onToolStart).toHaveBeenCalledWith("read_file", { path: "README.md" }, "exec-1");
    expect(onToolEnd).toHaveBeenCalledWith("exec-1", "done", false);
    expect(result).toEqual({
      reply: "assistant reply",
      sawStreamingToken: true,
      latestThinkingSummary: "short summary",
    });
  });

  it("returns no-stream state when the provider replies without tokens", async () => {
    const result = await runPromptAgentTurn({
      history: [{ role: "user", content: "hello" }],
      provider: { runStep: vi.fn() },
      tools: [],
      toolContext: {} as any,
      runAgentImpl: (async () => ({ text: "final reply" })) as any,
    });

    expect(result).toEqual({
      reply: "final reply",
      sawStreamingToken: false,
      latestThinkingSummary: undefined,
    });
  });

  it("creates prompt turn callbacks that wire streaming and tool lifecycle events", () => {
    const appendStreamingToken = vi.fn();
    const logFirstToken = vi.fn();
    const postToken = vi.fn();
    const setCompanionState = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const onToolError = vi.fn();

    const callbacks = createPromptTurnAgentCallbacks({
      appendStreamingToken,
      logFirstToken,
      postToken,
      setCompanionState,
      startToolExecution,
      finishToolExecution,
      onToolError,
    });

    callbacks.onToken("hello", { isFirstToken: true });
    callbacks.onToken("world", { isFirstToken: false });
    callbacks.onToolStart("read_file", { path: "README.md" }, "exec-1");
    callbacks.onToolEnd("exec-1", "ok", false);
    callbacks.onToolEnd("exec-2", "boom", true);

    expect(appendStreamingToken).toHaveBeenCalledTimes(2);
    expect(logFirstToken).toHaveBeenCalledWith("hello");
    expect(postToken).toHaveBeenCalledTimes(2);
    expect(setCompanionState).toHaveBeenCalledWith("working");
    expect(startToolExecution).toHaveBeenCalledWith(
      "exec-1",
      "正在执行 read file",
      "{\"path\":\"README.md\"}",
    );
    expect(finishToolExecution).toHaveBeenNthCalledWith(1, "exec-1", "done", "ok");
    expect(finishToolExecution).toHaveBeenNthCalledWith(2, "exec-2", "error", "boom");
    expect(onToolError).toHaveBeenCalledTimes(1);
  });

  it("finalizes successful prompt turns with reply persistence and follow-up work", async () => {
    const finishModelActivity = vi.fn();
    const logNoStreamingReply = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    await finalizePromptTurnSuccess({
      modelActivityId: "activity-1",
      reply: "assistant reply",
      sawStreamingToken: false,
      latestThinkingSummary: "short summary",
      finishModelActivity,
      logNoStreamingReply,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
      setCompanionState,
      updateMood,
    });

    expect(finishModelActivity).toHaveBeenCalledWith("activity-1", "done");
    expect(logNoStreamingReply).toHaveBeenCalledTimes(1);
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "assistant reply",
      true,
      "short summary",
    );
    expect(clearStreamingText).toHaveBeenCalledTimes(1);
    expect(queueAutoMemoryExtraction).toHaveBeenCalledTimes(1);
    expect(setCompanionState).toHaveBeenCalledWith("done");
    expect(updateMood).toHaveBeenCalledWith(5, true);
  });

  it("executes a prepared prompt turn with swarm setup, callbacks, and success finalization", async () => {
    const createSwarm = vi.fn(() => ({ id: "swarm-1" }));
    const assignSwarm = vi.fn();
    const setCompanionState = vi.fn();
    const appendStreamingToken = vi.fn();
    const logFirstToken = vi.fn();
    const postToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const onToolError = vi.fn();
    const finishModelActivity = vi.fn();
    const logNoStreamingReply = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    await executePreparedPromptTurn({
      history: [{ role: "user", content: "hello" }],
      provider: { runStep: vi.fn() },
      tools: [{ name: "read_file" } as any],
      runtime: {
        getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      },
      swarmEnabledForTurn: true,
      createSwarm,
      assignSwarm,
      setCompanionState,
      appendStreamingToken,
      logFirstToken,
      postToken,
      startToolExecution,
      finishToolExecution,
      onToolError,
      modelActivityId: "activity-1",
      finishModelActivity,
      logNoStreamingReply,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
      updateMood,
      runAgentImpl: (async (_history: NormalizedMessage[], opts: any) => {
        opts.onToken?.("hello ", { isFirstToken: true });
        opts.onToolStart?.("read_file", { path: "README.md" }, "exec-1");
        opts.onToolEnd?.("exec-1", "ok", false);
        expect(opts.swarm).toEqual({ id: "swarm-1" });
        return { text: "assistant reply" };
      }) as any,
    });

    expect(createSwarm).toHaveBeenCalledTimes(1);
    expect(assignSwarm).toHaveBeenCalledWith({ id: "swarm-1" });
    expect(setCompanionState).toHaveBeenNthCalledWith(1, "thinking");
    expect(setCompanionState).toHaveBeenCalledWith("working");
    expect(setCompanionState).toHaveBeenLastCalledWith("done");
    expect(appendStreamingToken).toHaveBeenCalled();
    expect(logFirstToken).toHaveBeenCalledWith("hello ");
    expect(postToken).toHaveBeenCalledWith("hello ");
    expect(startToolExecution).toHaveBeenCalled();
    expect(finishToolExecution).toHaveBeenCalledWith("exec-1", "done", "ok");
    expect(onToolError).not.toHaveBeenCalled();
    expect(finishModelActivity).toHaveBeenCalledWith("activity-1", "done");
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "assistant reply",
      true,
      undefined,
    );
    expect(clearStreamingText).toHaveBeenCalledTimes(1);
    expect(queueAutoMemoryExtraction).toHaveBeenCalledTimes(1);
    expect(updateMood).toHaveBeenCalledWith(5, true);
  });

  it("runs a full prompt turn host flow from dependency prep through execution", async () => {
    const createSwarm = vi.fn(() => ({ id: "swarm-2" }));
    const assignSwarm = vi.fn();
    const buildWorkspaceSystemPrompt = vi.fn(async () => "system prompt");
    const buildProviderAdapter = vi.fn(() => ({ runStep: vi.fn() }));
    const setCompanionState = vi.fn();
    const appendStreamingToken = vi.fn();
    const logFirstToken = vi.fn();
    const postToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();
    const finishModelActivity = vi.fn();
    const logNoStreamingReply = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const clearStreamingText = vi.fn();
    const queueAutoMemoryExtraction = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    await runPromptTurnWithHost({
      prompt: "use swarm now",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      runtime: {
        getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      },
      tools: [{ name: "read_file" } as any],
      createSwarm,
      assignSwarm,
      getConversationHistory: () => [{ role: "user", content: "task" }],
      buildWorkspaceSystemPrompt,
      buildProviderAdapter: buildProviderAdapter as any,
      shouldEnableSwarmForPrompt: prompt => prompt.includes("swarm"),
      setCompanionState,
      appendStreamingToken,
      logFirstToken,
      postToken,
      startToolExecution,
      finishToolExecution,
      modelActivityId: "activity-2",
      finishModelActivity,
      logNoStreamingReply,
      recordAssistantReply,
      clearStreamingText,
      queueAutoMemoryExtraction,
      updateMood,
      runAgentImpl: (async (_history: NormalizedMessage[], opts: any) => {
        opts.onToken?.("hello ", { isFirstToken: true });
        opts.onToolStart?.("read_file", { path: "README.md" }, "exec-2");
        opts.onToolEnd?.("exec-2", "ok", false);
        expect(opts.swarm).toEqual({ id: "swarm-2" });
        return { text: "assistant reply" };
      }) as any,
    });

    expect(buildWorkspaceSystemPrompt).toHaveBeenCalledWith(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );
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
    expect(createSwarm).toHaveBeenCalledTimes(1);
    expect(assignSwarm).toHaveBeenCalledWith({ id: "swarm-2" });
    expect(setCompanionState).toHaveBeenNthCalledWith(1, "thinking");
    expect(setCompanionState).toHaveBeenCalledWith("working");
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "assistant reply",
      true,
      undefined,
    );
    expect(queueAutoMemoryExtraction).toHaveBeenCalledTimes(1);
    expect(updateMood).toHaveBeenCalledWith(5, true);
  });
});
