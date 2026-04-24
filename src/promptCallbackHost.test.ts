import { describe, expect, it, vi } from "vitest";

import { createPromptCallbackBindings } from "./promptCallbackHost";

describe("promptCallbackHost", () => {
  it("creates entry and flow callback bundles from shared prompt callbacks", async () => {
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

    const bindings = createPromptCallbackBindings({
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
    });

    bindings.entry.onStreamingToken("hello");
    bindings.entry.startToolExecution("exec-1", "Read file", "src/extension.ts");
    bindings.entry.finishToolExecution("exec-1", "done", "ok");
    await bindings.entry.recordAssistantReply("entry reply");
    await bindings.entry.updateMood(2, true);
    bindings.entry.setCompanionState("idle");
    bindings.entry.clearStreamingText();

    bindings.flow.appendStreamingText("world");
    bindings.flow.scheduleStreamingStateUpdate();
    bindings.flow.postChatToken("world");
    bindings.flow.startToolExecution("exec-2", "Run tests", "npm test");
    bindings.flow.finishToolExecution("exec-2", "error", "failed");
    bindings.flow.onToolError();
    bindings.flow.setCompanionState("working");
    await bindings.flow.updateMood(-2);
    await bindings.flow.recordAssistantReply("flow reply", false, "summary");
    bindings.flow.clearStreamingText();

    expect(appendStreamingText).toHaveBeenNthCalledWith(1, "hello");
    expect(appendStreamingText).toHaveBeenNthCalledWith(2, "world");
    expect(scheduleStreamingStateUpdate).toHaveBeenCalledTimes(2);
    expect(postChatToken).toHaveBeenNthCalledWith(1, "hello");
    expect(postChatToken).toHaveBeenNthCalledWith(2, "world");
    expect(startToolExecution).toHaveBeenNthCalledWith(
      1,
      "exec-1",
      "Read file",
      "src/extension.ts",
    );
    expect(startToolExecution).toHaveBeenNthCalledWith(
      2,
      "exec-2",
      "Run tests",
      "npm test",
    );
    expect(finishToolExecution).toHaveBeenNthCalledWith(
      1,
      "exec-1",
      "done",
      "ok",
    );
    expect(finishToolExecution).toHaveBeenNthCalledWith(
      2,
      "exec-2",
      "error",
      "failed",
    );
    expect(onToolError).toHaveBeenCalledTimes(1);
    expect(setCompanionState).toHaveBeenNthCalledWith(1, "idle");
    expect(setCompanionState).toHaveBeenNthCalledWith(2, "working");
    expect(updateMood).toHaveBeenNthCalledWith(1, 2, true);
    expect(updateMood).toHaveBeenNthCalledWith(2, -2);
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      "entry reply",
      undefined,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      "flow reply",
      false,
      "summary",
    );
    expect(clearStreamingText).toHaveBeenCalledTimes(2);
  });
});
