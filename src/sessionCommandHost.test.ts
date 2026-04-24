import { describe, expect, it, vi } from "vitest";
import {
  createNewSessionCommand,
  deleteSessionCommand,
  exportSessionCommand,
  handleSessionWebviewMessage,
  renameSessionCommand,
  switchSessionCommand,
} from "./sessionCommandHost";

describe("sessionCommandHost", () => {
  it("renames a session and refreshes the list only when needed", async () => {
    const updateMeta = vi.fn(async () => undefined);
    const handleSessionsLoad = vi.fn(async () => undefined);

    await renameSessionCommand({
      sessionId: "session-1",
      title: "Renamed",
      updateMeta,
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad,
    });

    expect(updateMeta).toHaveBeenCalledWith("session-1", { title: "Renamed" });
    expect(handleSessionsLoad).toHaveBeenCalledTimes(1);
  });

  it("deletes a session and clears active state only when deleting the current session", async () => {
    const resetAutoMemoryConversation = vi.fn();
    const deleteSession = vi.fn(async () => undefined);
    const clearDeletedActiveSession = vi.fn(async () => undefined);

    await deleteSessionCommand({
      sessionId: "session-2",
      currentSessionId: "session-2",
      resetAutoMemoryConversation,
      deleteSession,
      clearDeletedActiveSession,
    });

    expect(resetAutoMemoryConversation).toHaveBeenCalledWith("session-2");
    expect(deleteSession).toHaveBeenCalledWith("session-2");
    expect(clearDeletedActiveSession).toHaveBeenCalledTimes(1);
  });

  it("exports a session to markdown through host callbacks", async () => {
    const writeFile = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn();

    await exportSessionCommand({
      sessionId: "session-3",
      readIndex: async () => ({
        sessions: [{ id: "session-3", title: "Build Notes" }],
      }),
      exportMarkdown: async (_id, title) => `# ${title}`,
      workspaceRoot: "E:\\repo",
      showSaveDialog: async input => {
        expect(input.defaultPath).toBe("E:\\repo/Build_Notes.md");
        expect(input.title).toBe("导出对话为 Markdown");
        return "E:\\repo\\Build_Notes.md";
      },
      writeFile,
      showInformationMessage,
    });

    expect(writeFile).toHaveBeenCalledWith("E:\\repo\\Build_Notes.md", "# Build Notes");
    expect(showInformationMessage).toHaveBeenCalledWith("对话已导出到 E:\\repo\\Build_Notes.md");
  });

  it("switches to a saved session and runs finalize mutation hooks", async () => {
    const calls: string[] = [];

    await switchSessionCommand({
      sessionId: "session-1",
      loadSavedSessionPayload: async () => ({
        messages: [{ role: "user", content: "hello" }],
        runtimeState: {
          modelConversation: [{ role: "assistant", content: "stored" }],
          pendingPlanVerification: undefined,
        },
        hasVisibleContent: true,
        restoredSession: {
          currentSessionId: "session-1",
          sessionMessages: [{ role: "user", content: "hello" }],
          baselineCount: 1,
        },
      } as any),
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetRuntime");
      },
      resetPlanMode: () => {
        calls.push("resetPlan");
      },
      clearCachedTools: () => {
        calls.push("clearCache");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      applySavedSessionActivation: options => {
        calls.push("applySaved");
        options.setCurrentSessionId("session-1");
        options.replaceSessionMessages([{ role: "user", content: "hello" }] as any);
        options.restoreModelConversation([{ role: "assistant", content: "stored" }]);
        options.restorePendingPlanVerification(undefined);
        options.markConversationBaseline(1);
        return {} as any;
      },
      setCurrentSessionId: id => {
        calls.push(`setId:${id}`);
      },
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: messages => {
        calls.push(`model:${messages?.length ?? 0}`);
      },
      restorePendingPlanVerification: state => {
        calls.push(`pending:${state ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      setActiveSessionId: async id => {
        calls.push(`active:${id}`);
      },
      workspaceRoot: "E:\\repo",
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(calls).toContain("disposeSwarm");
    expect(calls).toContain("applySaved");
    expect(calls).toContain("hydrate:E:\\repo");
    expect(calls).toContain("postState");
    expect(calls).toContain("refresh");
    expect(calls).toContain("sessionsLoad");
  });

  it("starts a new session and runs finalize mutation hooks", async () => {
    const calls: string[] = [];

    const result = await createNewSessionCommand({
      persistenceEnabled: true,
      workspaceHash: "hash-1",
      defaultTitle: "New Chat",
      createSession: async (id, workspaceHash, title) => {
        calls.push(`create:${id}:${workspaceHash}:${title}`);
      },
      setActiveSessionId: async id => {
        calls.push(`active:${id}`);
      },
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetRuntime");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      resetPlanMode: () => {
        calls.push("resetPlan");
      },
      clearPendingPlanVerification: () => {
        calls.push("clearPending");
      },
      clearCachedTools: () => {
        calls.push("clearCache");
      },
      setCurrentSessionId: id => {
        calls.push(`setId:${id}`);
      },
      setTransientConversationId: id => {
        calls.push(`transient:${id ?? "undefined"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      workspaceRoot: "E:\\repo",
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(result.transient).toBe(false);
    expect(calls).toContain("disposeSwarm");
    expect(calls).toContain("hydrate:E:\\repo");
    expect(calls).toContain("postState");
    expect(calls).toContain("refresh");
    expect(calls).toContain("sessionsLoad");
  });

  it("routes session webview messages with multi-session gating", async () => {
    const calls: string[] = [];

    const handledLoad = await handleSessionWebviewMessage({
      message: { type: "sessions:load" },
      isMultiSessionEnabled: () => false,
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      setSessionsPanelOpen: open => {
        calls.push(`panel:${open}`);
      },
      loadSessions: async () => {
        calls.push("load");
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
        calls.push("new");
      },
    });

    const handledRename = await handleSessionWebviewMessage({
      message: { type: "sessions:rename", id: "session-1", title: "Renamed" },
      isMultiSessionEnabled: () => true,
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      setSessionsPanelOpen: open => {
        calls.push(`panel:${open}`);
      },
      loadSessions: async () => {
        calls.push("load");
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
        calls.push("new");
      },
    });

    const handledUnknown = await handleSessionWebviewMessage({
      message: { type: "unknown" },
      isMultiSessionEnabled: () => true,
      postLicenseRequired: () => {
        calls.push("license");
      },
      setSessionsPanelOpen: open => {
        calls.push(`panel:${open}`);
      },
      loadSessions: async () => {
        calls.push("load");
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
        calls.push("new");
      },
    });

    expect(handledLoad).toBe(true);
    expect(handledRename).toBe(true);
    expect(handledUnknown).toBe(false);
    expect(calls).toEqual([
      "license:multiSession",
      "rename:session-1:Renamed",
    ]);
  });
});
