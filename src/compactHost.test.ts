import { describe, expect, it, vi } from "vitest";

import {
  buildCompactBoundarySessionState,
  createAutoCompactConversationRunner,
  formatCompactTokenCount,
  handleCompactCommand,
  handleCompactCommandWithHost,
  maybeAutoCompactConversation,
  maybeAutoCompactConversationWithHost,
  performConversationCompaction,
} from "./compactHost";

describe("compactHost", () => {
  it("formats token counts with separators", () => {
    expect(formatCompactTokenCount(1234567)).toBe("1,234,567");
  });

  it("builds compact boundary metadata from compaction results", () => {
    expect(
      buildCompactBoundarySessionState({
        trigger: "manual",
        compactedAt: 1700000000000,
        transcriptPath: "E:\\repo\\.transcript.jsonl",
        result: {
          wasCompacted: true,
          compactedHistory: [],
          messagesCompacted: 10,
          messagesKept: 4,
          estimatedTokensBefore: 32000,
          estimatedTokensAfter: 7000,
        },
      }),
    ).toEqual({
      trigger: "manual",
      compactedAt: 1700000000000,
      preTokens: 32000,
      postTokens: 7000,
      messagesSummarized: 10,
      messagesKept: 4,
      preservedRecentMessages: true,
      transcriptPath: "E:\\repo\\.transcript.jsonl",
    });
  });

  it("performs conversation compaction and replaces history when compaction happens", async () => {
    const replaceConversationHistory = vi.fn();
    const createProvider = vi.fn(() => ({
      runStep: vi.fn(async () => ({
        text: "<analysis>ignored</analysis><summary>Condensed summary</summary>",
        toolCalls: [],
        done: true,
      })),
    }));

    const result = await performConversationCompaction({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      customInstructions: "Keep implementation details",
      getConversationHistory: () => [
        { role: "user", content: "message 1 " + "x".repeat(8000) },
        { role: "assistant", content: "message 2 " + "x".repeat(8000) },
        { role: "user", content: "message 3 " + "x".repeat(8000) },
        { role: "assistant", content: "message 4 " + "x".repeat(8000) },
        { role: "user", content: "message 5 " + "x".repeat(8000) },
        { role: "assistant", content: "message 6 " + "x".repeat(8000) },
        { role: "user", content: "message 7 " + "x".repeat(8000) },
        { role: "assistant", content: "message 8 " + "x".repeat(8000) },
      ],
      getTranscriptPath: () => "E:\\claudecodejingiang\\vscode-extension\\.transcript.jsonl",
      replaceConversationHistory,
      createProvider,
    });

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        envMap: {},
      }),
    );
    expect(result.wasCompacted).toBe(true);
    expect(replaceConversationHistory).toHaveBeenCalledWith(
      result.compactedHistory,
      expect.objectContaining({
        trigger: "manual",
        preTokens: result.estimatedTokensBefore,
        postTokens: result.estimatedTokensAfter,
        messagesSummarized: result.messagesCompacted,
        messagesKept: result.messagesKept,
        transcriptPath: "E:\\claudecodejingiang\\vscode-extension\\.transcript.jsonl",
      }),
    );
  });

  it("handles /compact command success and non-compaction paths", async () => {
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    const notNeeded = await handleCompactCommand({
      commandText: "/compact",
      performConversationCompaction: async () => ({
        wasCompacted: false,
        reason: "No compaction needed.",
        compactedHistory: [],
        messagesCompacted: 0,
        messagesKept: 0,
        estimatedTokensBefore: 100,
        estimatedTokensAfter: 100,
      }),
      addPhaseActivity,
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      updateMood,
      toErrorMessage: error => String(error),
    });

    expect(notNeeded).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "No compaction needed.",
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "No compaction needed.",
      false,
    );
    expect(updateMood).not.toHaveBeenCalled();

    vi.clearAllMocks();

    const compacted = await handleCompactCommand({
      commandText: "/compact keep code decisions",
      performConversationCompaction: async extraInstructions => {
        expect(extraInstructions).toBe("keep code decisions");
        return {
          wasCompacted: true,
          compactedHistory: [],
          messagesCompacted: 12,
          messagesKept: 6,
          estimatedTokensBefore: 20000,
          estimatedTokensAfter: 8000,
        };
      },
      addPhaseActivity,
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      updateMood,
      toErrorMessage: error => String(error),
    });

    expect(compacted).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "Estimated tokens 20,000 -> 8,000",
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "Context compacted. Summarized 12 earlier messages and preserved 6 recent messages. Estimated tokens 20,000 -> 8,000.",
      false,
    );
    expect(setCompanionState).toHaveBeenCalledWith("done");
    expect(updateMood).toHaveBeenCalledWith(1, false);
  });

  it("handles /compact command failures and auto-compact flow", async () => {
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    const handled = await handleCompactCommand({
      commandText: "/compact",
      performConversationCompaction: async () => {
        throw new Error("provider unavailable");
      },
      addPhaseActivity,
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      updateMood,
      toErrorMessage: error => (error instanceof Error ? error.message : String(error)),
    });

    expect(handled).toBe(true);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "error",
      "provider unavailable",
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      "Context compaction failed: provider unavailable",
      false,
    );
    expect(setCompanionState).toHaveBeenCalledWith("idle");
    expect(updateMood).toHaveBeenCalledWith(-1, false);

    vi.clearAllMocks();

    await maybeAutoCompactConversation({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      getConversationHistory: () => [
        { role: "user", content: "short" },
        { role: "assistant", content: "short" },
      ],
      performConversationCompaction: async () => {
        throw new Error("should not run");
      },
      addPhaseActivity,
      finishPhaseActivity,
      toErrorMessage: error => String(error),
    });

    expect(addPhaseActivity).not.toHaveBeenCalled();

    await maybeAutoCompactConversation({
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      getConversationHistory: () =>
        Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: "x".repeat(60000),
        })),
      performConversationCompaction: async () => ({
        wasCompacted: true,
        compactedHistory: [],
        messagesCompacted: 10,
        messagesKept: 6,
        estimatedTokensBefore: 150000,
        estimatedTokensAfter: 60000,
      }),
      addPhaseActivity,
      finishPhaseActivity,
      toErrorMessage: error => String(error),
    });

    expect(addPhaseActivity).toHaveBeenCalledWith(
      "正在压缩上下文",
      expect.stringContaining("Estimated context"),
      "running",
    );
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "Estimated tokens 150,000 -> 60,000",
    );

    vi.clearAllMocks();

    await maybeAutoCompactConversation({
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      getConversationHistory: () =>
        Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: "x".repeat(60000),
        })),
      performConversationCompaction: async () => ({
        wasCompacted: false,
        reason: "Context is already small enough to keep verbatim.",
        compactedHistory: [],
        messagesCompacted: 0,
        messagesKept: 10,
        estimatedTokensBefore: 150000,
        estimatedTokensAfter: 150000,
      }),
      addPhaseActivity,
      finishPhaseActivity,
      toErrorMessage: error => String(error),
    });

    expect(addPhaseActivity).toHaveBeenCalledTimes(1);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "Context is already small enough to keep verbatim.",
    );
  });

  it("stops retrying auto-compact after repeated failures", async () => {
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();
    const performConversationCompaction = vi.fn(async () => {
      throw new Error("prompt too long");
    });
    let consecutiveFailures = 0;
    const run = () =>
      maybeAutoCompactConversation({
        config: {
          type: "openai",
          apiKey: "secret",
          model: "gpt-4.1",
        },
        getConversationHistory: () =>
          Array.from({ length: 10 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: "x".repeat(60000),
          })),
        performConversationCompaction,
        addPhaseActivity,
        finishPhaseActivity,
        toErrorMessage: error =>
          error instanceof Error ? error.message : String(error),
        getAutoCompactConsecutiveFailures: () => consecutiveFailures,
        setAutoCompactConsecutiveFailures: failureCount => {
          consecutiveFailures = failureCount;
        },
      });

    await run();
    await run();
    await run();
    await run();

    expect(performConversationCompaction).toHaveBeenCalledTimes(3);
    expect(addPhaseActivity).toHaveBeenCalledTimes(3);
    expect(finishPhaseActivity).toHaveBeenCalledTimes(3);
    expect(consecutiveFailures).toBe(3);
  });

  it("routes host-backed compact command wiring through provider creation and transcript access", async () => {
    const createProviderAdapter = vi.fn(() => ({
      runStep: vi.fn(async () => ({
        text: "<summary>Condensed summary</summary>",
        toolCalls: [],
        done: true,
      })),
    }));
    const replaceConversationHistory = vi.fn();
    const recordAssistantReply = vi.fn(async () => undefined);
    const updateMood = vi.fn(async () => undefined);

    const handled = await handleCompactCommandWithHost({
      commandText: "/compact keep recent intent",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      getConversationHistory: () =>
        Array.from({ length: 8 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `message-${index}-` + "x".repeat(7000),
        })),
      getTranscriptPath: () => "E:\\repo\\.transcript.jsonl",
      replaceConversationHistory,
      createProviderAdapter,
      addPhaseActivity: () => "activity-1",
      finishPhaseActivity: vi.fn(),
      recordAssistantReply,
      setCompanionState: vi.fn(),
      updateMood,
      toErrorMessage: error => String(error),
    });

    expect(handled).toBe(true);
    expect(createProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo",
        envMap: { HELLO: "world" },
      }),
    );
    expect(replaceConversationHistory).toHaveBeenCalledTimes(1);
    expect(recordAssistantReply).toHaveBeenCalled();
    expect(updateMood).toHaveBeenCalledWith(1, false);
  });

  it("routes host-backed auto compact wiring through provider creation and replacement", async () => {
    const createProviderAdapter = vi.fn(() => ({
      runStep: vi.fn(async () => ({
        text: "<summary>Condensed summary</summary>",
        toolCalls: [],
        done: true,
      })),
    }));
    const replaceConversationHistory = vi.fn();
    const addPhaseActivity = vi.fn(() => "activity-2");
    const finishPhaseActivity = vi.fn();

    await maybeAutoCompactConversationWithHost({
      workspaceRoot: "E:\\repo",
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      envMap: { HELLO: "world" },
      getConversationHistory: () =>
        Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `message-${index}-` + "x".repeat(60000),
        })),
      getTranscriptPath: () => "E:\\repo\\.transcript.jsonl",
      replaceConversationHistory,
      createProviderAdapter,
      addPhaseActivity,
      finishPhaseActivity,
      toErrorMessage: error => String(error),
    });

    expect(addPhaseActivity).toHaveBeenCalledTimes(1);
    expect(createProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo",
        envMap: { HELLO: "world" },
      }),
    );
    expect(replaceConversationHistory).toHaveBeenCalledTimes(1);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-2",
      "done",
      expect.stringContaining("Estimated tokens"),
    );
  });

  it("creates an auto compact runner that reuses shared host wiring", async () => {
    const createProviderAdapter = vi.fn(() => ({
      runStep: vi.fn(async () => ({
        text: "<summary>Condensed summary</summary>",
        toolCalls: [],
        done: true,
      })),
    }));
    const replaceConversationHistory = vi.fn();
    const addPhaseActivity = vi.fn(() => "activity-3");
    const finishPhaseActivity = vi.fn();
    const runner = createAutoCompactConversationRunner({
      getConversationHistory: () =>
        Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `message-${index}-` + "x".repeat(60000),
        })),
      getTranscriptPath: () => "E:\\repo\\.transcript.jsonl",
      replaceConversationHistory,
      createProviderAdapter,
      addPhaseActivity,
      finishPhaseActivity,
      toErrorMessage: error => String(error),
    });

    await runner(
      "E:\\repo-2",
      {
        type: "openai",
        apiKey: "secret-2",
        model: "gpt-4.1",
      },
      { HELLO: "world" },
    );

    expect(addPhaseActivity).toHaveBeenCalledTimes(1);
    expect(createProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo-2",
        envMap: { HELLO: "world" },
      }),
    );
    expect(replaceConversationHistory).toHaveBeenCalledTimes(1);
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-3",
      "done",
      expect.stringContaining("Estimated tokens"),
    );
  });
});
