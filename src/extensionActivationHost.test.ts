import { describe, expect, it, vi } from "vitest";

import { registerChatSidebarExtension } from "./extensionActivationHost";

describe("extensionActivationHost", () => {
  it("registers the sidebar provider and commands, then forwards callbacks", async () => {
    const callbacks = new Map<string, () => unknown>();
    const registered: string[] = [];
    const provider = {
      focus: vi.fn(async () => undefined),
      clearChat: vi.fn(() => undefined),
      showSettingsPanel: vi.fn(() => undefined),
      dispose: vi.fn(async () => undefined),
    };

    const disposables = registerChatSidebarExtension({
      viewType: "terminalAiAssistant.chatView",
      provider,
      registerWebviewViewProvider: (viewType, registeredProvider) => {
        registered.push(`view:${viewType}:${registeredProvider === provider}`);
        return { dispose: () => undefined };
      },
      registerCommand: (commandId, callback) => {
        registered.push(`command:${commandId}`);
        callbacks.set(commandId, callback);
        return { dispose: () => undefined };
      },
    });

    expect(registered).toEqual([
      "view:terminalAiAssistant.chatView:true",
      "command:terminalAiAssistant.focus",
      "command:terminalAiAssistant.clearChat",
      "command:terminalAiAssistant.openSettings",
    ]);
    expect(disposables).toHaveLength(5);

    await callbacks.get("terminalAiAssistant.focus")?.();
    callbacks.get("terminalAiAssistant.clearChat")?.();
    callbacks.get("terminalAiAssistant.openSettings")?.();
    disposables[4]?.dispose();

    expect(provider.focus).toHaveBeenCalledTimes(1);
    expect(provider.clearChat).toHaveBeenCalledTimes(1);
    expect(provider.showSettingsPanel).toHaveBeenCalledTimes(1);
    expect(provider.dispose).toHaveBeenCalledTimes(1);
  });
});
