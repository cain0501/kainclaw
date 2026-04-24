import { describe, expect, it } from "vitest";
import { handleChatWebviewMessage } from "./chatCommandHost";

describe("chatCommandHost", () => {
  it("routes ready, prompt, quick action, approval, and editor selection messages", async () => {
    const calls: string[] = [];

    const handledReady = await handleChatWebviewMessage({
      message: { type: "ready" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledPrompt = await handleChatWebviewMessage({
      message: { type: "sendPrompt", prompt: "hello" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledQuickAction = await handleChatWebviewMessage({
      message: { type: "runQuickAction", action: "review" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledApprove = await handleChatWebviewMessage({
      message: { type: "approvePendingAction" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledReject = await handleChatWebviewMessage({
      message: { type: "rejectPendingAction" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledSelection = await handleChatWebviewMessage({
      message: { type: "requestEditorSelection" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    expect(handledReady).toBe(true);
    expect(handledPrompt).toBe(true);
    expect(handledQuickAction).toBe(true);
    expect(handledApprove).toBe(true);
    expect(handledReject).toBe(true);
    expect(handledSelection).toBe(true);
    expect(calls).toEqual([
      "ready",
      "prompt:hello",
      "quick:review",
      "approval:true",
      "approval:false",
      "selection",
    ]);
  });

  it("routes clearChat and returns false for unrelated messages", async () => {
    const calls: string[] = [];

    const handledClear = await handleChatWebviewMessage({
      message: { type: "clearChat" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    const handledUnknown = await handleChatWebviewMessage({
      message: { type: "unknown" },
      ensureReadySequence: async () => {
        calls.push("ready");
      },
      clearChat: () => {
        calls.push("clear");
      },
      sendPrompt: async prompt => {
        calls.push(`prompt:${prompt}`);
      },
      runQuickAction: async action => {
        calls.push(`quick:${action}`);
      },
      resolvePendingApproval: approved => {
        calls.push(`approval:${approved}`);
      },
      requestEditorSelection: () => {
        calls.push("selection");
      },
    });

    expect(handledClear).toBe(true);
    expect(handledUnknown).toBe(false);
    expect(calls).toEqual(["clear"]);
  });
});
