import { describe, expect, it, vi } from "vitest";

import {
  configureSidebarWebviewView,
  routeSidebarWebviewMessage,
  type SidebarWebviewMessage,
} from "./sidebarWebviewHost";

describe("sidebarWebviewHost", () => {
  it("configures the webview shell and forwards incoming messages", async () => {
    let onMessage:
      | ((message: SidebarWebviewMessage) => Promise<void>)
      | undefined;
    const handleMessage = vi.fn(async () => undefined);
    const webviewView = {
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: (
          listener: (message: SidebarWebviewMessage) => Promise<void>,
        ) => {
          onMessage = listener;
        },
      },
    };

    configureSidebarWebviewView({
      webviewView,
      html: "<html>sidebar</html>",
      localResourceRoots: ["root-a", "root-b"],
      handleMessage,
    });

    expect(webviewView.webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: ["root-a", "root-b"],
    });
    expect(webviewView.webview.html).toBe("<html>sidebar</html>");

    await onMessage?.({ type: "ready" });

    expect(handleMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("routes session messages before settings and chat handlers", async () => {
    const calls: string[] = [];

    await routeSidebarWebviewMessage({
      message: { type: "sessions:close" },
      session: {
        isMultiSessionEnabled: () => true,
        postLicenseRequired: feature => {
          calls.push(`license:${feature}`);
        },
        setSessionsPanelOpen: open => {
          calls.push(`sessions:${open}`);
        },
        loadSessions: async () => {
          calls.push("loadSessions");
        },
        switchSession: async id => {
          calls.push(`switch:${id}`);
        },
        renameSession: async (id, title) => {
          calls.push(`rename:${id}:${title}`);
        },
        deleteSession: async id => {
          calls.push(`delete:${id}`);
        },
        exportSession: async id => {
          calls.push(`export:${id}`);
        },
        createNewSession: async () => {
          calls.push("newSession");
        },
      },
      settings: {
        validateOnboardingKey: async () => {
          calls.push("validate");
        },
        completeOnboarding: async () => {
          calls.push("complete");
        },
        loadSettings: async () => {
          calls.push("loadSettings");
        },
        saveSettingsProvider: async () => {
          calls.push("saveSettings");
        },
        deleteSettingsProvider: async id => {
          calls.push(`deleteSettings:${id}`);
        },
        setShowThinkingSummaries: async enabled => {
          calls.push(`thinking:${enabled}`);
        },
        setActiveProvider: async id => {
          calls.push(`active:${id}`);
        },
        closeSettings: () => {
          calls.push("closeSettings");
        },
        activateLicense: async key => {
          calls.push(`activate:${key}`);
        },
      },
      chat: {
        ensureReadySequence: async () => {
          calls.push("ready");
        },
        clearChat: () => {
          calls.push("clearChat");
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
      },
    });

    expect(calls).toEqual(["sessions:false"]);
  });

  it("routes settings messages before falling through to chat handlers", async () => {
    const calls: string[] = [];

    await routeSidebarWebviewMessage({
      message: { type: "settings:close" },
      session: {
        isMultiSessionEnabled: () => true,
        postLicenseRequired: feature => {
          calls.push(`license:${feature}`);
        },
        setSessionsPanelOpen: open => {
          calls.push(`sessions:${open}`);
        },
        loadSessions: async () => {
          calls.push("loadSessions");
        },
        switchSession: async id => {
          calls.push(`switch:${id}`);
        },
        renameSession: async (id, title) => {
          calls.push(`rename:${id}:${title}`);
        },
        deleteSession: async id => {
          calls.push(`delete:${id}`);
        },
        exportSession: async id => {
          calls.push(`export:${id}`);
        },
        createNewSession: async () => {
          calls.push("newSession");
        },
      },
      settings: {
        validateOnboardingKey: async () => {
          calls.push("validate");
        },
        completeOnboarding: async () => {
          calls.push("complete");
        },
        loadSettings: async () => {
          calls.push("loadSettings");
        },
        saveSettingsProvider: async () => {
          calls.push("saveSettings");
        },
        deleteSettingsProvider: async id => {
          calls.push(`deleteSettings:${id}`);
        },
        setShowThinkingSummaries: async enabled => {
          calls.push(`thinking:${enabled}`);
        },
        setActiveProvider: async id => {
          calls.push(`active:${id}`);
        },
        closeSettings: () => {
          calls.push("closeSettings");
        },
        activateLicense: async key => {
          calls.push(`activate:${key}`);
        },
      },
      chat: {
        ensureReadySequence: async () => {
          calls.push("ready");
        },
        clearChat: () => {
          calls.push("clearChat");
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
      },
    });

    expect(calls).toEqual(["closeSettings"]);
  });

  it("falls through to chat routing and preserves attachment parsing", async () => {
    const sendPrompt = vi.fn(async () => undefined);

    await routeSidebarWebviewMessage({
      message: {
        type: "sendPrompt",
        prompt: "hello",
        attachments: [
          {
            dataUrl: "data:image/png;base64,abc",
            mimeType: "image/png",
            name: "clip.png",
          },
        ],
      },
      session: {
        isMultiSessionEnabled: () => true,
        postLicenseRequired: () => undefined,
        setSessionsPanelOpen: () => undefined,
        loadSessions: async () => undefined,
        switchSession: async () => undefined,
        renameSession: async () => undefined,
        deleteSession: async () => undefined,
        exportSession: async () => undefined,
        createNewSession: async () => undefined,
      },
      settings: {
        validateOnboardingKey: async () => undefined,
        completeOnboarding: async () => undefined,
        loadSettings: async () => undefined,
        saveSettingsProvider: async () => undefined,
        deleteSettingsProvider: async () => undefined,
        setShowThinkingSummaries: async () => undefined,
        setActiveProvider: async () => undefined,
        closeSettings: () => undefined,
        activateLicense: async () => undefined,
      },
      chat: {
        ensureReadySequence: async () => undefined,
        clearChat: () => undefined,
        sendPrompt,
        runQuickAction: async () => undefined,
        resolvePendingApproval: () => undefined,
        requestEditorSelection: () => undefined,
      },
    });

    expect(sendPrompt).toHaveBeenCalledWith("hello", [
      {
        dataUrl: "data:image/png;base64,abc",
        mimeType: "image/png",
        name: "clip.png",
      },
    ]);
  });
});
