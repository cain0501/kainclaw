import { describe, expect, it, vi } from "vitest";

import { createSessionPanelActions } from "./sessionPanelHost";

class FakeSessionStore {
  index = {
    sessions: [
      {
        id: "session-1",
        title: "Build Notes",
        preview: "hello",
        messageCount: 0,
        workspaceHash: "workspace-hash",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  messages = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>([
    ["session-1", [{ role: "user", content: "hello" }]],
  ]);
  runtimeStates = new Map<string, any>([
    [
      "session-1",
      {
        modelConversation: [{ role: "assistant", content: "stored" }],
        pendingPlanVerification: undefined,
      },
    ],
  ]);
  deleted: string[] = [];
  updated: Array<{ id: string; patch: { title: string } }> = [];

  async readIndex() {
    return this.index;
  }

  async loadMessages(sessionId: string) {
    return this.messages.get(sessionId) ?? [];
  }

  async loadRuntimeState(sessionId: string) {
    return this.runtimeStates.get(sessionId) ?? {
      modelConversation: [],
      pendingPlanVerification: undefined,
    };
  }

  async createSession(id: string, workspaceHash: string, title: string) {
    this.index.sessions.push({
      id,
      title,
      preview: "",
      messageCount: 0,
      workspaceHash,
      createdAt: 1,
      updatedAt: 1,
    });
  }

  async ensureSession() {
    return undefined;
  }

  async deleteSession(id: string) {
    this.deleted.push(id);
    this.index.sessions = this.index.sessions.filter(session => session.id !== id);
  }

  async updateMeta(id: string, patch: { title: string }) {
    this.updated.push({ id, patch });
    const session = this.index.sessions.find(entry => entry.id === id);
    if (session) {
      session.title = patch.title;
    }
  }

  async exportMarkdown(_id: string, title: string) {
    return `# ${title}`;
  }
}

describe("sessionPanelHost", () => {
  it("loads, renames, and exports sessions through panel actions", async () => {
    const sessions = new FakeSessionStore();
    let currentSessionId: string | undefined = "session-1";
    let signature = "";
    const publishSessions = vi.fn();
    const logSession = vi.fn();
    const writeFile = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn();

    const actions = createSessionPanelActions({
      settings: {
        setActiveSessionId: async () => undefined,
      },
      sessions,
      workspaceRoot: "E:\\repo",
      getPersistenceEnabled: () => true,
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: id => {
        currentSessionId = id;
      },
      getPreviousSignature: () => signature,
      setSignature: next => {
        signature = next;
      },
      disposeSwarm: () => undefined,
      resetActiveRuntimeControllers: () => undefined,
      resetPlanMode: () => undefined,
      clearCachedTools: () => undefined,
      clearConversationBuffers: () => undefined,
      replaceSessionMessages: () => undefined,
      restoreModelConversation: () => undefined,
      restorePendingPlanVerification: () => undefined,
      clearPendingPlanVerification: () => undefined,
      setTransientConversationId: () => undefined,
      markConversationBaseline: () => undefined,
      resetAutoMemoryConversation: () => undefined,
      ensureConversationWorktreeHydrated: async () => undefined,
      shouldRefreshSessionsList: () => true,
      postState: () => undefined,
      refreshWorkspaceStatus: () => undefined,
      publishSessions,
      logSession,
      showSaveDialog: async () => "E:\\repo\\Build_Notes.md",
      writeFile,
      showInformationMessage,
    });

    await actions.loadSessions();
    expect(publishSessions).toHaveBeenCalledWith({
      sessions: [
        expect.objectContaining({
          id: "session-1",
          title: "Build Notes",
          messageCount: 1,
        }),
      ],
      activeId: "session-1",
    });
    expect(logSession).toHaveBeenCalledWith("sessions-load", { sessionCount: 1 });

    await actions.renameSession("session-1", "Renamed");
    expect(sessions.updated).toEqual([
      { id: "session-1", patch: { title: "Renamed" } },
    ]);

    await actions.exportSession("session-1");
    expect(writeFile).toHaveBeenCalledWith("E:\\repo\\Build_Notes.md", "# Renamed");
    expect(showInformationMessage).toHaveBeenCalledWith(
      "对话已导出到 E:\\repo\\Build_Notes.md",
    );
  });

  it("switches and creates sessions through panel actions", async () => {
    const sessions = new FakeSessionStore();
    let currentSessionId: string | undefined = "session-0";
    const calls: string[] = [];
    let persistenceEnabled = true;

    const actions = createSessionPanelActions({
      settings: {
        setActiveSessionId: async id => {
          calls.push(`active:${id}`);
        },
      },
      sessions,
      workspaceRoot: "E:\\repo",
      getPersistenceEnabled: () => persistenceEnabled,
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: id => {
        currentSessionId = id;
        calls.push(`current:${id ?? "undefined"}`);
      },
      getPreviousSignature: () => "",
      setSignature: () => undefined,
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
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: messages => {
        calls.push(`model:${messages?.length ?? 0}`);
      },
      restorePendingPlanVerification: state => {
        calls.push(`pending:${state ? "yes" : "no"}`);
      },
      clearPendingPlanVerification: persist => {
        calls.push(`clearPending:${persist === false ? "no-persist" : "persist"}`);
      },
      setTransientConversationId: id => {
        calls.push(`transient:${id ?? "undefined"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      resetAutoMemoryConversation: () => undefined,
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      shouldRefreshSessionsList: () => false,
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      publishSessions: () => undefined,
      logSession: (event, details) => {
        calls.push(`${event}:${"sessionId" in details ? String(details.sessionId) : ""}`);
      },
      showSaveDialog: async () => undefined,
      writeFile: async () => undefined,
      showInformationMessage: () => undefined,
    });

    await actions.switchSession("session-1");
    expect(currentSessionId).toBe("session-1");
    expect(calls).toContain("disposeSwarm");
    expect(calls).toContain("messages:1");
    expect(calls).toContain("model:1");
    expect(calls).toContain("baseline:1");

    vi.clearAllMocks();
    calls.length = 0;

    await actions.createNewSession();
    expect(calls).toContain("disposeSwarm");
    expect(calls).toContain("clearPending:no-persist");
    expect(calls.some(call => call.startsWith("session-created:"))).toBe(true);

    calls.length = 0;
    persistenceEnabled = false;

    await actions.createNewSession();
    expect(currentSessionId).toBeUndefined();
    expect(calls.some(call => call.startsWith("transient:"))).toBe(true);
    expect(calls).not.toContain("transient:undefined");
    expect(calls.some(call => call.startsWith("session-created:"))).toBe(false);
  });

  it("deletes the active session and clears host state", async () => {
    const sessions = new FakeSessionStore();
    let currentSessionId: string | undefined = "session-1";
    const calls: string[] = [];

    const actions = createSessionPanelActions({
      settings: {
        setActiveSessionId: async () => undefined,
      },
      sessions,
      workspaceRoot: "E:\\repo",
      getPersistenceEnabled: () => true,
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: id => {
        currentSessionId = id;
        calls.push(`current:${id ?? "undefined"}`);
      },
      getPreviousSignature: () => "",
      setSignature: () => undefined,
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
      replaceSessionMessages: () => undefined,
      restoreModelConversation: () => undefined,
      restorePendingPlanVerification: () => undefined,
      clearPendingPlanVerification: persist => {
        calls.push(`clearPending:${persist === false ? "no-persist" : "persist"}`);
      },
      setTransientConversationId: id => {
        calls.push(`transient:${id ?? "undefined"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      resetAutoMemoryConversation: sessionId => {
        calls.push(`autoMemory:${sessionId}`);
      },
      ensureConversationWorktreeHydrated: async () => undefined,
      shouldRefreshSessionsList: () => false,
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => undefined,
      publishSessions: () => undefined,
      logSession: () => undefined,
      showSaveDialog: async () => undefined,
      writeFile: async () => undefined,
      showInformationMessage: () => undefined,
    });

    await actions.deleteSession("session-1");

    expect(sessions.deleted).toEqual(["session-1"]);
    expect(calls).toContain("autoMemory:session-1");
    expect(calls).toContain("disposeSwarm");
    expect(calls).toContain("current:undefined");
    expect(calls.some(call => call.startsWith("transient:"))).toBe(true);
    expect(calls).toContain("clearPending:persist");
    expect(calls).toContain("baseline:0");
    expect(calls).toContain("postState");
  });
});
