import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent/agentRunner";
import {
  buildProviderAdapter,
  resolveProviderConfig,
} from "../src/providerHost";
import { handleElectronPromptCommand } from "../src/electronPromptCommandHost";
import {
  handleReviewCommandWithHost,
  handleVerificationCommandWithHost,
} from "../src/inspectionHost";
import {
  createImageVariant,
  runImageLabRequest,
} from "../src/imageGeneration/imageLabRuntime";
import { searchPublicReferenceImages } from "../src/imageGeneration/imageMaterialSearch";
import type { IHostAdapter } from "../src/platform/IHostAdapter";
import type { DesktopRuntimeServices } from "../src/platform/desktopRuntimeServices";
import type { LocalBridgeRuntimeStatus } from "../src/platform/localBridgeRuntime";
import { SettingsRepository } from "../src/storage/settingsRepository";
import { SessionRepository } from "../src/storage/sessionRepository";
import { ElectronChatPanel } from "./ElectronChatPanel";

const execFileAsync = promisify(execFile);
const { mockedBuiltinToolDefinitions } = vi.hoisted(() => ({
  mockedBuiltinToolDefinitions: [] as Array<{
    name: string;
    description?: string;
    input_schema?: unknown;
  }>,
}));

vi.mock("../src/platform/electronHostAdapter", () => ({
  ElectronHostAdapter: class {},
}));

vi.mock("../src/mcpRuntime", () => ({
  McpRuntime: class {
    markConfigDirty(): void {}

    async getStatusSummary(): Promise<unknown[]> {
      return [];
    }
  },
}));

vi.mock("../src/providerHost", () => ({
  buildProviderAdapter: vi.fn(),
  resolveProviderConfig: vi.fn(),
  runProviderExtractionStep: vi.fn(async () => "extracted"),
}));

vi.mock("../src/license/licenseManager", () => ({
  verifyLicense: vi.fn(),
}));

vi.mock("../src/settingsHost", () => ({
  validateOnboardingProviderKey: vi.fn(),
  completeOnboardingProvider: vi.fn(),
  saveSettingsProvider: vi.fn(),
  deleteSettingsProvider: vi.fn(),
  loadSettingsPanelData: vi.fn(async () => ({
    providers: [],
    activeId: undefined,
    licenseActivated: false,
  })),
}));

vi.mock("../src/attachmentHandler", () => ({
  normalizeWebviewAttachments: vi.fn(() => []),
}));

vi.mock("../src/agent/agentRunner", () => ({
  runAgent: vi.fn(),
  SYSTEM_PROMPT: "",
}));

vi.mock("../src/toolRuntime", () => ({
  dedupeToolDefinitionsByName: <T extends { name: string }>(tools: readonly T[]) => {
    const seen = new Set<string>();
    const deduped: T[] = [];
    for (const tool of tools) {
      if (seen.has(tool.name)) {
        continue;
      }
      seen.add(tool.name);
      deduped.push(tool);
    }
    return deduped;
  },
  getBuiltInToolDefinitions: () => mockedBuiltinToolDefinitions,
  toolDefinitions: mockedBuiltinToolDefinitions,
}));

vi.mock("../src/electronPromptCommandHost", () => ({
  handleElectronPromptCommand: vi.fn(),
}));

vi.mock("../src/inspectionHost", () => ({
  handleReviewCommandWithHost: vi.fn(),
  handleVerificationCommandWithHost: vi.fn(),
}));

vi.mock("../src/imageGeneration/imageLabRuntime", () => ({
  runImageLabRequest: vi.fn(),
  createImageVariant: vi.fn(),
}));

vi.mock("../src/imageGeneration/imageMaterialSearch", () => ({
  searchPublicReferenceImages: vi.fn(),
}));

class FakeHostAdapter implements IHostAdapter {
  private readonly state = new Map<string, unknown>();
  private readonly secrets = new Map<string, string>();
  private pendingApproval: Record<string, unknown> | null = null;

  constructor(private readonly storagePath: string) {}

  getWorkspaceRoot(): string | undefined {
    return undefined;
  }

  getEditorSelection(): { selectedText: string; language: string } | null {
    return null;
  }

  async showDiff(): Promise<void> {}

  async requestFileApproval(): Promise<boolean> {
    return true;
  }

  async requestToolApproval(): Promise<boolean> {
    return true;
  }

  showError(): void {}

  async openExternal(): Promise<boolean> {
    return true;
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async storeSecret(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    this.state.set(key, value);
  }

  getStorageUri(): string {
    return this.storagePath;
  }

  getPendingApproval(): Record<string, unknown> | null {
    return this.pendingApproval;
  }

  setPendingApproval(payload: Record<string, unknown> | null): void {
    this.pendingApproval = payload;
  }
}

async function createHarness(options?: {
  desktopRuntimeServices?: DesktopRuntimeServices;
}) {
  const storagePath = await mkdtemp(path.join(os.tmpdir(), "electron-chat-panel-"));
  const host = new FakeHostAdapter(storagePath);
  const settings = new SettingsRepository(host);
  const sessions = new SessionRepository(storagePath);
  const rendererPayloads: unknown[] = [];
  const panel = new ElectronChatPanel(
    sessions,
    settings,
    host as unknown as ConstructorParameters<typeof ElectronChatPanel>[2],
    payload => {
      rendererPayloads.push(payload);
    },
    options?.desktopRuntimeServices,
  );

  return {
    storagePath,
    host,
    settings,
    sessions,
    panel,
    rendererPayloads,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("ElectronChatPanel session lifecycle", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type" ? "image/png" : null,
      },
    }));
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    );
    delete process.env.CLAUDE_CONFIG_HOME;
    delete process.env.CLAUDE_PLUGIN_DATA;
    mockedBuiltinToolDefinitions.length = 0;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps an in-flight reply attached to the session that started it", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const chineseSession = await harness.sessions.createSession(
      "session-cn",
      "electron",
      "中文会话",
    );
    await harness.sessions.appendMessages(chineseSession.id, [
      { role: "assistant", content: "你好！有什么我可以帮你的吗？" },
    ]);

    const abbSession = await harness.sessions.createSession("session-abb", "electron", "ABB");
    await harness.sessions.appendMessages(abbSession.id, [
      { role: "assistant", content: "EDFG" },
    ]);

    await harness.settings.setActiveSessionId(chineseSession.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({ kind: "continue" });

    const agentReply = createDeferred<string>();
    vi.mocked(runAgent).mockImplementation(async (_history, options) => {
      options.onToken?.("处理中");
      return agentReply.promise;
    });

    const sendPromise = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "你好",
    });

    await vi.waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(1);
    });

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: abbSession.id,
    });

    const switchedStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        isBusy: boolean;
        messages: Array<{ content: string }>;
      };
    expect(switchedStatePayload.isBusy).toBe(false);
    expect(switchedStatePayload.messages.map(message => message.content)).toEqual([
      "EDFG",
    ]);

    agentReply.resolve("这条回复应该留在中文会话");
    await sendPromise;

    expect(harness.settings.getActiveSessionId()).toBe(abbSession.id);

    const chineseMessages = await harness.sessions.loadMessages(chineseSession.id);
    expect(chineseMessages.map(message => message.content)).toEqual([
      "你好！有什么我可以帮你的吗？",
      "你好",
      "这条回复应该留在中文会话",
    ]);

    const abbMessages = await harness.sessions.loadMessages(abbSession.id);
    expect(abbMessages.map(message => message.content)).toEqual(["EDFG"]);

    const lastStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        messages: Array<{ content: string }>;
      };
    expect(lastStatePayload.messages.map(message => message.content)).toEqual(["EDFG"]);
  });

  it("records tool use and tool result messages in the visible session transcript", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({ kind: "continue" });
    vi.mocked(runAgent).mockImplementation(async (_history, options) => {
      options.onToolStart?.(
        "mcp__notion__notion-get-users",
        { page_size: 5 },
        "exec-1",
      );
      options.onToolEnd?.(
        "exec-1",
        "Fetched users",
        false,
        "{\"results\":[{\"name\":\"ii cai n\"}]}",
      );
      return "我已经读取到 1 个用户。";
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "列出 Notion 用户",
    });

    const sessionId = harness.settings.getActiveSessionId();
    expect(sessionId).toBeTruthy();

    const messages = await harness.sessions.loadMessages(sessionId!);
    expect(
      messages.some(message =>
        message.kind === "tool_use" &&
        message.toolName === "mcp__notion__notion-get-users" &&
        message.toolInputPreview === "{\"page_size\":5}" &&
        message.excludeFromConversation === true,
      ),
    ).toBe(true);
    expect(
      messages.some(message =>
        message.kind === "tool_result" &&
        message.toolSummary === "Fetched users" &&
        message.content.includes("\"ii cai n\"") &&
        message.excludeFromConversation === true,
      ),
    ).toBe(true);
    expect(messages[messages.length - 1]?.content).toBe("我已经读取到 1 个用户。");
  });

  it("allows different sessions to run requests concurrently", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const sessionA = await harness.sessions.createSession("session-a", "electron", "A");
    await harness.sessions.appendMessages(sessionA.id, [
      { role: "assistant", content: "hello from A" },
    ]);

    const sessionB = await harness.sessions.createSession("session-b", "electron", "B");
    await harness.sessions.appendMessages(sessionB.id, [
      { role: "assistant", content: "hello from B" },
    ]);

    await harness.settings.setActiveSessionId(sessionA.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({ kind: "continue" });

    const replyA = createDeferred<string>();
    const replyB = createDeferred<string>();
    let invocationCount = 0;
    vi.mocked(runAgent).mockImplementation(async (_history, options) => {
      invocationCount += 1;
      options.onToken?.(`chunk-${invocationCount}`);
      return invocationCount === 1 ? replyA.promise : replyB.promise;
    });

    const sendPromiseA = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "message for A",
    });

    await vi.waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(1);
    });

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: sessionB.id,
    });

    const stateAfterSwitch = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        isBusy: boolean;
        messages: Array<{ content: string }>;
      };
    expect(stateAfterSwitch.isBusy).toBe(false);
    expect(stateAfterSwitch.messages.map(message => message.content)).toEqual([
      "hello from B",
    ]);

    const sendPromiseB = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "message for B",
    });

    await vi.waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(2);
    });

    replyB.resolve("reply for B");
    await sendPromiseB;

    replyA.resolve("reply for A");
    await sendPromiseA;

    const sessionAMessages = await harness.sessions.loadMessages(sessionA.id);
    expect(sessionAMessages.map(message => message.content)).toEqual([
      "hello from A",
      "message for A",
      "reply for A",
    ]);

    const sessionBMessages = await harness.sessions.loadMessages(sessionB.id);
    expect(sessionBMessages.map(message => message.content)).toEqual([
      "hello from B",
      "message for B",
      "reply for B",
    ]);
  });

  it("does not flash old-session messages into the newly selected session while the switch is still loading", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const sessionA = await harness.sessions.createSession("session-a", "electron", "A");
    await harness.sessions.appendMessages(sessionA.id, [
      { role: "assistant", content: "old session message" },
    ]);

    const sessionB = await harness.sessions.createSession("session-b", "electron", "B");
    await harness.sessions.appendMessages(sessionB.id, [
      { role: "assistant", content: "new session message" },
    ]);

    await harness.settings.setActiveSessionId(sessionA.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({ kind: "continue" });

    const agentReply = createDeferred<string>();
    vi.mocked(runAgent).mockImplementation(async (_history, options) => {
      options.onToken?.("working");
      return agentReply.promise;
    });

    const originalLoadMessages = harness.sessions.loadMessages.bind(harness.sessions);
    const delayedLoad = createDeferred<void>();
    const loadMessagesSpy = vi
      .spyOn(harness.sessions, "loadMessages")
      .mockImplementation(async sessionId => {
        if (sessionId === sessionB.id) {
          await delayedLoad.promise;
        }
        return originalLoadMessages(sessionId);
      });

    const sendPromise = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "verify this later",
    });

    await vi.waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(1);
    });

    const switchPromise = harness.panel.handleMessage({
      type: "sessions:switch",
      id: sessionB.id,
    });

    await vi.waitFor(() => {
      const activeId = harness.settings.getActiveSessionId();
      expect(activeId).toBe(sessionB.id);
    });

    agentReply.resolve("reply stays in session A");
    await sendPromise;

    const interimStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        messages: Array<{ content: string }>;
      };
    expect(interimStatePayload.messages.map(message => message.content)).toEqual([]);

    delayedLoad.resolve();
    await switchPromise;

    const finalStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        messages: Array<{ content: string }>;
      };
    expect(finalStatePayload.messages.map(message => message.content)).toEqual([
      "new session message",
    ]);

    loadMessagesSpy.mockRestore();
  });

  it("falls back to another existing session after deleting the active session", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const first = await harness.sessions.createSession("session-a", "electron", "A");
    await harness.sessions.appendMessages(first.id, [
      { role: "assistant", content: "first session" },
    ]);

    const second = await harness.sessions.createSession("session-b", "electron", "B");
    await harness.sessions.appendMessages(second.id, [
      { role: "assistant", content: "second session" },
    ]);

    await harness.settings.setActiveSessionId(second.id);
    await harness.panel.handleMessage({ type: "ready" });

    harness.rendererPayloads.length = 0;
    await harness.panel.handleMessage({ type: "sessions:delete", id: second.id });

    expect(harness.settings.getActiveSessionId()).toBe(first.id);

    const statePayload = harness.rendererPayloads.find(
      payload => (payload as { type?: string }).type === "state",
    ) as { messages: Array<{ content: string }> };
    expect(statePayload.messages.map(message => message.content)).toEqual([
      "first session",
    ]);

    const sessionListPayloads = harness.rendererPayloads.filter(
      payload => (payload as { type?: string }).type === "sessions:data",
    ) as Array<{ activeId: string; sessions: Array<{ id: string }> }>;
    const lastSessionList = sessionListPayloads.at(-1);
    expect(lastSessionList).toBeDefined();
    expect(lastSessionList?.activeId).toBe(first.id);
    expect(lastSessionList?.sessions.map(session => session.id)).toEqual([first.id]);
  });

  it("keeps pending approval in state while switching sessions", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const sessionA = await harness.sessions.createSession("session-a", "electron", "A");
    const sessionB = await harness.sessions.createSession("session-b", "electron", "B");

    await harness.settings.setActiveSessionId(sessionA.id);
    await harness.panel.handleMessage({ type: "ready" });

    harness.host.setPendingApproval({
      id: "approval-1",
      title: "Confirm file write",
      summary: "Create test-approval.txt",
      diff: "+hello approval",
    });

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: sessionB.id,
    });

    const switchedStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        pendingApproval: { id: string; title: string };
      };
    expect(switchedStatePayload.pendingApproval).toMatchObject({
      id: "approval-1",
      title: "Confirm file write",
    });
  });

  it("heals a stale activeSessionId to an existing session on ready", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const existing = await harness.sessions.createSession(
      "session-existing",
      "electron",
      "Recovered",
    );
    await harness.sessions.appendMessages(existing.id, [
      { role: "assistant", content: "recovered session" },
    ]);

    await harness.settings.setActiveSessionId("deleted-session");

    await harness.panel.handleMessage({ type: "ready" });

    expect(harness.settings.getActiveSessionId()).toBe(existing.id);

    const statePayload = harness.rendererPayloads.find(
      payload => (payload as { type?: string }).type === "state",
    ) as { messages: Array<{ content: string }> };
    expect(statePayload.messages.map(message => message.content)).toEqual([
      "recovered session",
    ]);
  });

  it("publishes local bridge runtime state and reacts to status updates", async () => {
    let currentLocalBridgeStatus: LocalBridgeRuntimeStatus = {
      running: false,
      port: 52358,
      version: "1.0",
      addins: [],
      error: undefined,
    };
    let emitStatusChange:
      | ((status: LocalBridgeRuntimeStatus) => void)
      | undefined;

    const localBridgeRuntime: NonNullable<
      DesktopRuntimeServices["localBridgeRuntime"]
    > = {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn(() => currentLocalBridgeStatus.running),
      getPort: vi.fn(() => currentLocalBridgeStatus.port),
      getStatus: vi.fn(() => currentLocalBridgeStatus),
      getAddinStatus: vi.fn(),
      onAddinRegistered: vi.fn(() => () => {}),
      onStatusChanged: vi.fn(handler => {
        emitStatusChange = handler;
        return () => {
          emitStatusChange = undefined;
        };
      }),
    };

    const harness = await createHarness({
      desktopRuntimeServices: {
        localBridgeRuntime,
      },
    });
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.panel.handleMessage({ type: "ready" });

    const initialState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        desktopRuntime?: {
          localBridge?: typeof currentLocalBridgeStatus;
        };
      };
    expect(initialState.desktopRuntime?.localBridge).toEqual(
      currentLocalBridgeStatus,
    );
    expect(localBridgeRuntime.onStatusChanged).toHaveBeenCalledTimes(1);

    currentLocalBridgeStatus = {
      running: true,
      port: 52358,
      version: "1.0",
      addins: [
        {
          addin: {
            id: "word-addin",
            name: "Word Add-in",
            version: "0.1.0",
            capabilities: ["document.read"],
            connectedAt: 1,
          },
          connectionStatus: "connected",
          lastPingAt: 2,
        },
      ],
      error: undefined,
    };

    emitStatusChange?.(currentLocalBridgeStatus);

    await vi.waitFor(() => {
      const latestState = [...harness.rendererPayloads]
        .reverse()
        .find(payload => (payload as { type?: string }).type === "state") as {
          desktopRuntime?: {
            localBridge?: typeof currentLocalBridgeStatus;
          };
        };

      expect(latestState.desktopRuntime?.localBridge).toEqual(
        currentLocalBridgeStatus,
      );
    });
  });

  it("publishes image lab state from saved config", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 3,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    await harness.settings.pushImagePromptHistory("draw a cat");

    await harness.panel.handleMessage({ type: "image:loadState" });

    expect(harness.rendererPayloads).toContainEqual({
      type: "image:state",
      busy: false,
      promptInferenceBusy: false,
      materialSearchBusy: false,
      workflowBusy: false,
      workflowPlan: undefined,
      activeImageModelId: "image-model-1",
      imageModels: [
        {
          id: "image-model-1",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-2",
          authMode: "raw",
          responseFormat: "url",
          hasKey: true,
        },
      ],
      config: {
        id: "image-model-1",
        model: "gpt-image-2",
        size: "1024x1024",
        batchCount: 3,
        responseFormat: "url",
        hasApiKey: true,
        isConfigured: true,
      },
      promptHistory: [
        {
          prompt: "draw a cat",
          createdAt: expect.any(Number),
        },
      ],
      promptLibrary: expect.objectContaining({
        favoriteIds: [],
        entries: expect.any(Array),
      }),
      resultBatches: [],
    });
  });

  it("keeps image lab batches grouped and preserves originals when generating variants", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-1",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-1.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
      {
        id: "img-2",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-2.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);
    vi.mocked(createImageVariant).mockResolvedValue([
      {
        id: "img-variant-1",
        batchId: "batch-variant-1",
        src: "https://example.com/variant-1.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "variant",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 2,
      responseFormat: "url",
      recordPromptHistory: true,
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "draw a cat",
      config: {
        apiKey: "image-secret",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-2",
        authMode: "raw",
        size: "1024x1024",
        batchCount: 2,
        responseFormat: "url",
      },
      signal: expect.any(Object),
    }));
    const runPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:result") as {
        latestBatchCount: number;
        latestBatchSource: string;
        resultBatches: Array<{ id: string; itemCount: number; items: Array<{ id: string }> }>;
      };
    expect(runPayload.latestBatchCount).toBe(2);
    expect(runPayload.latestBatchSource).toBe("generate");
    expect(runPayload.resultBatches).toEqual([
      {
        id: "batch-generate-1",
        prompt: "draw a cat",
        createdAt: expect.any(Number),
        source: "generate",
        itemCount: 2,
        items: [
          expect.objectContaining({ id: "img-1" }),
          expect.objectContaining({ id: "img-2" }),
        ],
      },
    ]);

    await harness.panel.handleMessage({ type: "image:variant", id: "img-1" });
    expect(vi.mocked(createImageVariant)).toHaveBeenCalledTimes(1);
    const variantPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:result") as {
        latestBatchCount: number;
        latestBatchSource: string;
        resultBatches: Array<{ id: string; itemCount: number; items: Array<{ id: string }> }>;
      };
    expect(variantPayload.latestBatchCount).toBe(1);
    expect(variantPayload.latestBatchSource).toBe("variant");
    expect(variantPayload.resultBatches).toEqual([
      {
        id: "batch-variant-1",
        prompt: "draw a cat",
        createdAt: expect.any(Number),
        source: "variant",
        itemCount: 1,
        items: [
          expect.objectContaining({ id: "img-variant-1" }),
        ],
      },
      {
        id: "batch-generate-1",
        prompt: "draw a cat",
        createdAt: expect.any(Number),
        source: "generate",
        itemCount: 2,
        items: [
          expect.objectContaining({ id: "img-1" }),
          expect.objectContaining({ id: "img-2" }),
        ],
      },
    ]);
  });

  it("records prompt history only for explicit generate or edit submissions", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");

    vi.mocked(runImageLabRequest)
      .mockResolvedValueOnce([
        {
          id: "img-1",
          batchId: "batch-generate-1",
          src: "https://example.com/generated-1.png",
          prompt: "draw a cat",
          createdAt: Date.now(),
          source: "generate",
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "img-2",
          batchId: "batch-generate-2",
          src: "https://example.com/generated-2.png",
          prompt: "draw a cat",
          createdAt: Date.now(),
          source: "generate",
        },
      ] as never);
    vi.mocked(createImageVariant).mockResolvedValue([
      {
        id: "img-variant-1",
        batchId: "batch-variant-1",
        src: "https://example.com/variant-1.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "variant",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
      recordPromptHistory: true,
    });
    expect(harness.settings.getImagePromptHistory().map(entry => entry.prompt)).toEqual([
      "draw a cat",
    ]);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
      recordPromptHistory: false,
    });
    expect(harness.settings.getImagePromptHistory().map(entry => entry.prompt)).toEqual([
      "draw a cat",
    ]);

    await harness.panel.handleMessage({ type: "image:variant", id: "img-1" });
    expect(harness.settings.getImagePromptHistory().map(entry => entry.prompt)).toEqual([
      "draw a cat",
    ]);
  });

  it("passes multiple reference images through image edit runs", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-1",
        batchId: "batch-edit-1",
        src: "https://example.com/edited-1.png",
        prompt: "add floral accents",
        createdAt: Date.now(),
        source: "edit",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "add floral accents",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
      recordPromptHistory: true,
      referenceImages: [
        {
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
          name: "base.png",
        },
        {
          dataUrl: "data:image/png;base64,d29ybGQ=",
          mimeType: "image/png",
          name: "flowers.png",
        },
      ],
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "add floral accents",
      referenceImages: [
        {
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
          name: "base.png",
        },
        {
          dataUrl: "data:image/png;base64,d29ybGQ=",
          mimeType: "image/png",
          name: "flowers.png",
        },
      ],
    }));
  });

  it("uses the active chat provider to infer a prompt from reference images", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "openai",
        apiKey: "chat-secret",
        model: "gpt-4o",
      },
      envMap: {},
    });
    const providerRunStep = vi.fn().mockResolvedValue({
      text: "cinematic portrait with layered floral accents, soft rim light, editorial photography",
      toolCalls: [],
      done: true,
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({
      runStep: providerRunStep,
    } as never);

    await harness.panel.handleMessage({
      type: "image:inferPrompt",
      referenceImages: [
        {
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
          name: "base.png",
        },
        {
          dataUrl: "data:image/png;base64,d29ybGQ=",
          mimeType: "image/png",
          name: "flowers.png",
        },
      ],
    });

    expect(providerRunStep).toHaveBeenCalledTimes(1);
    const inferencePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:promptInferred") as {
        prompt: string;
      };
    expect(inferencePayload.prompt).toContain("floral accents");

    const imageStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        promptInferenceBusy: boolean;
      };
    expect(imageStatePayload.promptInferenceBusy).toBe(false);
  });

  it("returns bilingual prompt inference for prompt library image uploads", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "openai",
        apiKey: "chat-secret",
        model: "gpt-4o",
      },
      envMap: {},
    });
    const providerRunStep = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        zhPrompt: "浪漫湖畔婚礼肖像，白色花艺更密，背景更真实自然。",
        enPrompt: "Romantic lakeside bridal portrait, denser white floral styling, more realistic natural background.",
      }),
      toolCalls: [],
      done: true,
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({
      runStep: providerRunStep,
    } as never);

    await harness.panel.handleMessage({
      type: "promptLibrary:inferFromImage",
      referenceImages: [{
        dataUrl: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        name: "sample.png",
      }],
    });

    const inferencePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "promptLibrary:inferredPrompt") as {
        promptPair: { zhPrompt: string; enPrompt: string };
      };
    expect(inferencePayload.promptPair).toEqual({
      zhPrompt: "浪漫湖畔婚礼肖像，白色花艺更密，背景更真实自然。",
      enPrompt: "Romantic lakeside bridal portrait, denser white floral styling, more realistic natural background.",
    });
  });

  it("uses the active chat provider to orchestrate an image workflow plan", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "chat-secret",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    const providerRunStep = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        mode: "edit",
        intentSummary: "Keep the bridal pose and strengthen the floral styling.",
        finalPrompt: "Elegant bridal portrait by the lake, preserve pose, enrich white floral ground detail, cleaner realistic lighting, editorial wedding photography",
        materialKeywords: ["white wedding flowers", "lakefront ceremony decor"],
        nextStepNote: "Add one more close floral detail reference if you want denser petals.",
      }),
      toolCalls: [],
      done: true,
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({
      runStep: providerRunStep,
    } as never);

    await harness.panel.handleMessage({
      type: "image:orchestrateWorkflow",
      prompt: "把花艺增强一些，背景更真实",
      referenceImages: [{
        dataUrl: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        name: "base.png",
      }],
    });

    expect(providerRunStep).toHaveBeenCalledTimes(1);
    const planPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:workflowOrchestrated") as {
        workflowPlan: {
          mode: string;
          intentSummary: string;
          finalPrompt: string;
          materialKeywords: string[];
        };
      };
    expect(planPayload.workflowPlan).toMatchObject({
      mode: "edit",
      intentSummary: "Keep the bridal pose and strengthen the floral styling.",
      finalPrompt: expect.stringContaining("bridal portrait"),
      materialKeywords: ["white wedding flowers", "lakefront ceremony decor"],
    });

    const imageStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        workflowBusy: boolean;
        workflowPlan: { mode: string; finalPrompt: string };
      };
    expect(imageStatePayload.workflowBusy).toBe(false);
    expect(imageStatePayload.workflowPlan).toMatchObject({
      mode: "edit",
      finalPrompt: expect.stringContaining("bridal portrait"),
    });
  });

  it("prepares material-search keywords before querying public references", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "chat-secret",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    const providerRunStep = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        mode: "edit",
        intentSummary: "Strengthen the floral styling around the bottle.",
        finalPrompt: "Luxury skincare bottle on marble, keep bottle fixed, add one more soft white flower beside it, soft daylight, realistic product photography",
        materialKeywords: ["white gardenia flower", "marble surface product photography"],
        nextStepNote: "Look for close-up floral references before the next edit.",
      }),
      toolCalls: [],
      done: true,
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({
      runStep: providerRunStep,
    } as never);

    await harness.panel.handleMessage({
      type: "image:prepareMaterialSearch",
      prompt: "在瓶子边加朵花",
      referenceImages: [],
      requestId: "material-prepare-1",
    });

    expect(providerRunStep).toHaveBeenCalledTimes(1);

    const preparedPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:materialSearchPrepared") as {
        requestId?: string;
        searchQueries: string[];
        workflowPlan: { mode: string; finalPrompt: string };
      };
    expect(preparedPayload.requestId).toBe("material-prepare-1");
    expect(preparedPayload.searchQueries).toEqual([
      "white gardenia flower",
      "marble surface product photography",
    ]);
    expect(preparedPayload.workflowPlan).toMatchObject({
      mode: "edit",
      finalPrompt: expect.stringContaining("Luxury skincare bottle"),
    });
  });

  it("searches public material references from prepared keywords without reopening orchestration", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    vi.mocked(searchPublicReferenceImages).mockResolvedValue([
      {
        id: "material-1",
        query: "white gardenia flower",
        title: "White gardenia flower",
        thumbnailUrl: "https://thumb.example.com/gardenia.jpg",
        fullUrl: "https://full.example.com/gardenia.jpg",
        pageUrl: "https://example.com/gardenia",
        sourceLabel: "flickr",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:searchMaterials",
      prompt: "在瓶子边加朵花",
      referenceImages: [],
      queries: ["white gardenia flower", "marble surface product photography"],
      requestId: "material-search-1",
    });

    expect(vi.mocked(searchPublicReferenceImages)).toHaveBeenCalledWith({
      queries: ["white gardenia flower", "marble surface product photography"],
      maxResultsPerQuery: 3,
    });
    expect(vi.mocked(buildProviderAdapter)).not.toHaveBeenCalled();

    const searchPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:materialSearchResults") as {
        requestId?: string;
        searchQueries: string[];
        results: Array<{ id: string; query: string }>;
      };
    expect(searchPayload.requestId).toBe("material-search-1");
    expect(searchPayload.searchQueries).toEqual([
      "white gardenia flower",
      "marble surface product photography",
    ]);
    expect(searchPayload.results).toEqual([
      {
        id: "material-1",
        query: "white gardenia flower",
        title: "White gardenia flower",
        thumbnailUrl: "https://thumb.example.com/gardenia.jpg",
        fullUrl: "https://full.example.com/gardenia.jpg",
        pageUrl: "https://example.com/gardenia",
        sourceLabel: "flickr",
      },
    ]);
  });

  it("appends generated images back into the chat session when image mode runs from chat", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-chat-1",
        batchId: "batch-chat-1",
        src: "https://example.com/generated-chat-1.png",
        prompt: "draw a bridal portrait",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type" ? "image/png" : null,
      },
    }));

    await harness.panel.handleMessage({
      type: "chat:imageRun",
      prompt: "draw a bridal portrait",
      referenceImages: [],
    });

    const chatStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        messages: Array<{
          role: string;
          content: string;
          generatedImages?: Array<{ id: string; src: string }>;
        }>;
      };
    expect(chatStatePayload.messages).toHaveLength(2);
    expect(chatStatePayload.messages[0]).toMatchObject({
      role: "user",
      content: "draw a bridal portrait",
    });
    expect(chatStatePayload.messages[1]).toMatchObject({
      role: "assistant",
      content: "已生成 1 张图片。",
      generatedImages: [
        {
          id: "img-chat-1",
          src: "data:image/png;base64,AQIDBA==",
        },
      ],
    });
  });

  it("auto-routes strong generate prompts to image generation without requiring the image button", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-auto-1",
        batchId: "batch-auto-1",
        src: "https://example.com/generated-auto-1.png",
        prompt: "生成一张湖畔婚礼肖像",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "生成一张湖畔婚礼肖像",
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "生成一张湖畔婚礼肖像",
      config: expect.objectContaining({
        model: "gpt-image-2",
      }),
    }));
  });

  it("derives image size from the user's requested ratio or dimensions", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest)
      .mockResolvedValueOnce([
        {
          id: "img-ratio-1",
          batchId: "batch-ratio-1",
          src: "https://example.com/generated-ratio-1.png",
          prompt: "生成一个 16:9 的法斗头像",
          createdAt: Date.now(),
          source: "generate",
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "img-dim-1",
          batchId: "batch-dim-1",
          src: "https://example.com/generated-dim-1.png",
          prompt: "做一张 1920x1080 的产品主图",
          createdAt: Date.now(),
          source: "generate",
        },
      ] as never);

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "生成一个 16:9 的法斗头像",
    });
    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "做一张 1920x1080 的产品主图",
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenNthCalledWith(1, expect.objectContaining({
      prompt: "生成一个 16:9 的法斗头像",
      config: expect.objectContaining({
        size: "1536x896",
      }),
    }));
    expect(vi.mocked(runImageLabRequest)).toHaveBeenNthCalledWith(2, expect.objectContaining({
      prompt: "做一张 1920x1080 的产品主图",
      config: expect.objectContaining({
        size: "1920x1080",
      }),
    }));
  });

  it("treats prompt-declared batch requests as separate image outputs instead of a collage hint", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");
    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-batch-1",
        batchId: "batch-batch-1",
        src: "https://example.com/generated-batch-1.png",
        prompt: "批量生成三张图片，美少女遛狗",
        createdAt: Date.now(),
        source: "generate",
      },
      {
        id: "img-batch-2",
        batchId: "batch-batch-1",
        src: "https://example.com/generated-batch-2.png",
        prompt: "批量生成三张图片，美少女遛狗",
        createdAt: Date.now(),
        source: "generate",
      },
      {
        id: "img-batch-3",
        batchId: "batch-batch-1",
        src: "https://example.com/generated-batch-3.png",
        prompt: "批量生成三张图片，美少女遛狗",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "批量生成三张图片，美少女遛狗",
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "批量生成三张图片，美少女遛狗",
      executionPrompt: expect.stringContaining("每个输出结果都必须是一张独立完整的单图"),
      config: expect.objectContaining({
        model: "gpt-image-2",
        batchCount: 3,
      }),
    }));

    expect(harness.rendererPayloads).toContainEqual(expect.objectContaining({
      type: "chat:imagePending",
      prompt: "批量生成三张图片，美少女遛狗",
      batchCount: 3,
      modelLabel: "gpt-image-2",
    }));
  });

  it("auto-routes short follow-up modifiers to image edit when recent image context exists", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");

    const session = await harness.sessions.createSession("session-image", "electron", "Image");
    await harness.sessions.appendMessages(session.id, [
      {
        role: "assistant",
        content: "已生成 1 张图片。",
        generatedImages: [{
          id: "img-existing-1",
          src: "data:image/png;base64,aGVsbG8=",
          source: "generate",
          prompt: "draw a bridal portrait",
        }],
      },
    ]);
    await harness.settings.setActiveSessionId(session.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-edit-1",
        batchId: "batch-edit-1",
        src: "https://example.com/edited-1.png",
        prompt: "胸部大一点",
        createdAt: Date.now(),
        source: "edit",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "胸部大一点",
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "胸部大一点",
      referenceImages: [
        expect.objectContaining({
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
        }),
      ],
    }));
  });

  it("routes slash commands through the command chain even when recent image context exists", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const session = await harness.sessions.createSession("session-image-command", "electron", "Image");
    await harness.sessions.appendMessages(session.id, [
      {
        role: "assistant",
        content: "existing generated image",
        generatedImages: [
          {
            id: "img-existing-1",
            src: "data:image/png;base64,aGVsbG8=",
            source: "generate",
            prompt: "draw a bridal portrait",
          },
        ],
      },
    ]);
    await harness.settings.setActiveSessionId(session.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({
      kind: "reply",
      reply: "Context compacted.",
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/compact",
    });

    expect(handleElectronPromptCommand).toHaveBeenCalledTimes(1);
    expect(runImageLabRequest).not.toHaveBeenCalled();

    const messages = await harness.sessions.loadMessages(session.id);
    expect(messages.map(message => message.content)).toContain("/compact");
    expect(messages.map(message => message.content)).toContain("Context compacted.");
  });

  it("handles /freeze through the Electron installed-skill compatibility path and writes the official freeze state file", async () => {
    const harness = await createHarness();
    const claudeHome = await mkdtemp(path.join(os.tmpdir(), "claude-freeze-home-"));
    const pluginDataDir = await mkdtemp(path.join(os.tmpdir(), "claude-freeze-state-"));
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "freeze-compat-workspace-"));
    tempDirs.push(harness.storagePath, claudeHome, pluginDataDir, workspaceRoot);
    process.env.CLAUDE_CONFIG_HOME = claudeHome;
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;

    const freezeSkillDir = path.join(claudeHome, "skills", "freeze");
    await mkdir(freezeSkillDir, { recursive: true });
    await writeFile(
      path.join(freezeSkillDir, "SKILL.md"),
      `---
name: freeze
description: Restrict edits to one directory.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash \${CLAUDE_SKILL_DIR}/bin/check-freeze.sh"
---

Freeze skill body.
`,
      "utf8",
    );

    const allowedDir = path.join(workspaceRoot, ".tmp", "freeze-allowed");
    await mkdir(allowedDir, { recursive: true });

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);
    await harness.panel.handleMessage({ type: "ready" });

    const freezeRequest = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/freeze",
    });

    await vi.waitFor(() => {
      const latestState = harness.rendererPayloads
        .filter(payload => (payload as { type?: string }).type === "state")
        .at(-1) as { pendingApproval?: { kind: string; questions?: Array<{ question: string }> } };
      expect(latestState.pendingApproval).toMatchObject({
        kind: "question",
      });
    });
    const afterFreezePrompt = harness.rendererPayloads
      .filter(payload => (payload as { type?: string }).type === "state")
      .at(-1) as { pendingApproval?: { kind: string; questions?: Array<{ question: string }> } };
    expect(afterFreezePrompt.pendingApproval).toMatchObject({
      kind: "question",
    });
    expect(afterFreezePrompt.pendingApproval?.questions?.[0]?.question).toContain(
      "要将编辑限制在哪个目录内？",
    );

    await harness.panel.handleMessage({
      type: "submitPendingQuestion",
      answers: {
        "要将编辑限制在哪个目录内？该路径之外的文件将被禁止编辑。": allowedDir,
      },
    });
    await freezeRequest;

    const freezeFileContent = await readFile(
      path.join(pluginDataDir, "freeze-dir.txt"),
      "utf8",
    );
    expect(freezeFileContent.toLowerCase()).toContain(
      allowedDir.toLowerCase(),
    );

    const finalStatePayload = harness.rendererPayloads
      .filter(payload => (payload as { type?: string }).type === "state")
      .at(-1) as { messages: Array<{ content: string }> };
    expect(finalStatePayload.messages.at(-1)?.content).toContain(
      "Freeze boundary set:",
    );
  });

  it("keeps the visible Electron transcript intact when /compact rewrites model history", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    const session = await harness.sessions.createSession(
      "session-compact-sidecar",
      "electron",
      "Compact",
    );
    await harness.sessions.appendMessages(
      session.id,
      Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `visible-message-${index}-` + "x".repeat(8000),
      })),
    );
    await harness.settings.setActiveSessionId(session.id);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({
      runStep: vi.fn(async () => ({
        text: "<summary>Compacted sidecar summary</summary>",
        toolCalls: [],
        done: true,
      })),
    } as never);
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleCompactCommand(
        "/compact",
        options.workspaceRoot,
        options.config,
        options.envMap,
      );
      return { kind: "handled" };
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/compact",
    });

    const persistedTranscript = await harness.sessions.loadMessages(session.id);
    expect(persistedTranscript.map(message => message.content)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("visible-message-0"),
        "/compact",
        expect.stringContaining("Context compacted."),
      ]),
    );

    const latestState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        messages: Array<{ content: string }>;
      };
    expect(latestState.messages.map(message => message.content)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("visible-message-0"),
        "/compact",
        expect.stringContaining("Context compacted."),
      ]),
    );

    const runtimeState = await harness.sessions.loadRuntimeState(session.id);
    expect(runtimeState.compactBoundary).toMatchObject({
      trigger: "manual",
      messagesSummarized: 2,
      messagesKept: 6,
      preservedRecentMessages: true,
      transcriptPath: harness.sessions.getTranscriptFilePath(session.id),
    });
    expect(runtimeState.modelConversation?.[0]?.content).toContain(
      "Compacted sidecar summary",
    );
    expect(runtimeState.modelConversation?.some(message =>
      message.content === "/compact"
    )).toBe(false);
  });

  it("auto-descends to a unique nested git repo when the selected Electron workspace is a parent folder", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "electron-parent-workspace-"));
    const repoRoot = path.join(workspaceRoot, "vscode-extension");
    tempDirs.push(workspaceRoot);

    await mkdir(repoRoot, { recursive: true });
    await execFileAsync("git", ["init"], {
      cwd: repoRoot,
      windowsHide: true,
    });

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({
      kind: "reply",
      reply: "Workspace resolved.",
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/todo",
    });

    expect(harness.settings.getWorkspaceRoot()).toBe(workspaceRoot);
    expect(resolveProviderConfig).toHaveBeenCalledWith(harness.settings, workspaceRoot);
    expect(handleElectronPromptCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: workspaceRoot,
      }),
    );

    const statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
        workspaceInfo: {
          selectedRoot: string;
          effectiveRoot: string;
          gitRoot: string | null;
          kind: string;
        };
      };
    expect(statePayload.workspaceRoot).toBe(workspaceRoot);
    expect(statePayload.workspaceInfo).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: repoRoot,
      gitRoot: repoRoot,
      kind: "nested_git_root",
    });
  });

  it("includes WebFetch and WebSearch in the Electron shell tool list for /tools", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    mockedBuiltinToolDefinitions.push(
      {
        name: "WebFetch",
        description: "Fetch content from a URL for an extraction prompt.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "WebSearch",
        description: "Search the web for current information.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "fetch_url",
        description: "Legacy URL fetch tool.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "browser_navigate",
        description: "Open a webpage in the shared browser session.",
        input_schema: { type: "object", properties: {} },
      },
    );

    await harness.settings.setOnboardingDone(true);
    await harness.panel.handleMessage({ type: "ready" });

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleElectronPromptCommand).mockResolvedValue({
      kind: "reply",
      reply: "Tools matching WebFetch.",
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/tools WebFetch",
    });

    expect(handleElectronPromptCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "WebFetch" }),
          expect.objectContaining({ name: "WebSearch" }),
          expect.objectContaining({ name: "browser_navigate" }),
        ]),
      }),
    );
    expect(handleElectronPromptCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.arrayContaining([
          expect.objectContaining({ name: "fetch_url" }),
        ]),
      }),
    );
  });

  it("uses the resolved repo root for /review without rewriting the selected workspace", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "electron-parent-workspace-review-"));
    const repoRoot = path.join(workspaceRoot, "vscode-extension");
    tempDirs.push(workspaceRoot);

    await mkdir(repoRoot, { recursive: true });
    await execFileAsync("git", ["init"], {
      cwd: repoRoot,
      windowsHide: true,
    });

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleReviewCommandWithHost).mockResolvedValue(true);
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleReviewCommand(
        "/review",
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.currentEffortLevel,
      );
      return { kind: "handled" };
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/review",
    });

    expect(harness.settings.getWorkspaceRoot()).toBe(workspaceRoot);
    expect(resolveProviderConfig).toHaveBeenCalledWith(harness.settings, repoRoot);
    expect(handleReviewCommandWithHost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: repoRoot,
      }),
    );
  });

  it("keeps workspace roots bound to each Electron session instead of sharing one global root", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    const workspaceA = "E:\\workspace-a";
    const workspaceB = "E:\\workspace-b";

    await harness.panel.handleMessage({ type: "ready" });
    const firstSessionId = harness.settings.getActiveSessionId();
    expect(firstSessionId).toBeTruthy();

    await harness.panel.handleMessage({
      type: "workspace:set",
      root: workspaceA,
    });

    await harness.panel.handleMessage({ type: "sessions:new" });
    const secondSessionId = harness.settings.getActiveSessionId();
    expect(secondSessionId).toBeTruthy();
    expect(secondSessionId).not.toBe(firstSessionId);

    await harness.panel.handleMessage({
      type: "workspace:set",
      root: workspaceB,
    });

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: firstSessionId!,
    });

    let statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
      };
    expect(statePayload.workspaceRoot).toBe(workspaceA);

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: secondSessionId!,
    });

    statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
      };
    expect(statePayload.workspaceRoot).toBe(workspaceB);

    await expect(harness.sessions.loadRuntimeState(firstSessionId!)).resolves.toMatchObject({
      workspaceRoot: workspaceA,
    });
    await expect(harness.sessions.loadRuntimeState(secondSessionId!)).resolves.toMatchObject({
      workspaceRoot: workspaceB,
    });
  });

  it("uses the legacy global workspace only to migrate the initially active session", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot("E:\\legacy-root");

    const sessionA = await harness.sessions.createSession("session-a", "electron", "A");
    const sessionB = await harness.sessions.createSession("session-b", "electron", "B");
    await harness.settings.setActiveSessionId(sessionA.id);

    await harness.panel.handleMessage({ type: "ready" });

    let statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
      };
    expect(statePayload.workspaceRoot).toBe("E:\\legacy-root");

    await harness.panel.handleMessage({
      type: "sessions:switch",
      id: sessionB.id,
    });

    statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
      };
    expect(statePayload.workspaceRoot).toBe("");
  });

  it("uses the resolved repo root for /verify without rewriting the selected workspace", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "electron-parent-workspace-verify-"));
    const repoRoot = path.join(workspaceRoot, "vscode-extension");
    tempDirs.push(workspaceRoot);

    await mkdir(repoRoot, { recursive: true });
    await execFileAsync("git", ["init"], {
      cwd: repoRoot,
      windowsHide: true,
    });

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleVerificationCommandWithHost).mockResolvedValue(true);
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleVerificationCommand(
        "/verify",
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.currentEffortLevel,
      );
      return { kind: "handled" };
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/verify",
    });

    expect(harness.settings.getWorkspaceRoot()).toBe(workspaceRoot);
    expect(resolveProviderConfig).toHaveBeenCalledWith(harness.settings, repoRoot);
    expect(handleVerificationCommandWithHost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: repoRoot,
      }),
    );
  });

  it("allows clearing the Electron workspace back to unset", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot("E:\\claudecodejingiang");

    await harness.panel.handleMessage({
      type: "workspace:set",
      root: "",
    });

    const statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
        workspaceInfo: {
          selectedRoot: string;
          effectiveRoot: string;
          gitRoot: string | null;
          kind: string;
        };
      };
    expect(statePayload.workspaceRoot).toBe("");
    expect(statePayload.workspaceInfo).toMatchObject({
      selectedRoot: "",
      effectiveRoot: "",
      gitRoot: null,
      kind: "unset",
    });
  });

  it("warns before degraded review when the selected Electron workspace is not a git repo", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "electron-non-git-workspace-"));
    tempDirs.push(workspaceRoot);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleReviewCommandWithHost).mockResolvedValue(true);
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleReviewCommand(
        "/review",
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.currentEffortLevel,
      );
      return { kind: "handled" };
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/review",
    });

    const sessionId = harness.settings.getActiveSessionId();
    expect(sessionId).toBeTruthy();

    const messages = await harness.sessions.loadMessages(sessionId!);
    expect(messages.some(message =>
      message.role === "assistant" &&
      message.content.includes("当前工作区不是 Git 仓库"),
    )).toBe(true);

    const statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
        workspaceInfo: {
          selectedRoot: string;
          effectiveRoot: string;
          gitRoot: string | null;
          kind: string;
        };
      };
    expect(statePayload.workspaceRoot).toBe(workspaceRoot);
    expect(statePayload.workspaceInfo).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: workspaceRoot,
      gitRoot: null,
      kind: "non_git_workspace",
    });
    expect(handleReviewCommandWithHost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot,
      }),
    );
  });

  it("warns before degraded verification when the selected Electron workspace is not a git repo", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "electron-non-git-workspace-verify-"));
    tempDirs.push(workspaceRoot);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.setWorkspaceRoot(workspaceRoot);

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);
    vi.mocked(handleVerificationCommandWithHost).mockResolvedValue(true);
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleVerificationCommand(
        "/verify",
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.currentEffortLevel,
      );
      return { kind: "handled" };
    });

    await harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/verify",
    });

    const sessionId = harness.settings.getActiveSessionId();
    expect(sessionId).toBeTruthy();

    const messages = await harness.sessions.loadMessages(sessionId!);
    expect(messages.some(message =>
      message.role === "assistant" &&
      message.content.includes("当前工作区不是 Git 仓库"),
    )).toBe(true);

    const statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        workspaceRoot: string;
        workspaceInfo: {
          selectedRoot: string;
          effectiveRoot: string;
          gitRoot: string | null;
          kind: string;
        };
      };
    expect(statePayload.workspaceRoot).toBe(workspaceRoot);
    expect(statePayload.workspaceInfo).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: workspaceRoot,
      gitRoot: null,
      kind: "non_git_workspace",
    });
    expect(handleVerificationCommandWithHost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot,
      }),
    );
  });

  it("forwards abort to an in-flight /verify request so the desktop shell can cancel it", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);

    vi.mocked(resolveProviderConfig).mockResolvedValue({
      config: {
        type: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-6",
      },
      envMap: {},
    });
    vi.mocked(buildProviderAdapter).mockReturnValue({} as never);

    let capturedSignal: AbortSignal | undefined;
    vi.mocked(handleVerificationCommandWithHost).mockImplementation(async options => {
      capturedSignal = options.runtime.getToolContext().abortSignal;
      return await new Promise<boolean>((_resolve, reject) => {
        capturedSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.mocked(handleElectronPromptCommand).mockImplementation(async options => {
      await options.handleVerificationCommand(
        "/verify",
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.currentEffortLevel,
      );
      return { kind: "handled" };
    });

    const runPromise = harness.panel.handleMessage({
      type: "sendPrompt",
      prompt: "/verify",
    });

    await vi.waitFor(() => {
      expect(vi.mocked(handleVerificationCommandWithHost)).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
    });

    await harness.panel.handleMessage({ type: "abort" });
    await runPromise;

    expect(capturedSignal?.aborted).toBe(true);

    const statePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        isBusy: boolean;
      };
    expect(statePayload.isBusy).toBe(false);
  });

  it("supports stopping an in-flight image generation request", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");

    let capturedSignal: AbortSignal | undefined;
    vi.mocked(runImageLabRequest).mockImplementation(async request => {
      capturedSignal = request.signal;
      return await new Promise<never>((_resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const runPromise = harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
      recordPromptHistory: true,
    });

    await vi.waitFor(() => {
      expect(vi.mocked(runImageLabRequest)).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
    });

    await harness.panel.handleMessage({ type: "image:abort" });
    await runPromise;

    expect(capturedSignal?.aborted).toBe(true);

    const abortedPayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:aborted") as {
        message: string;
      };
    expect(abortedPayload.message).toContain("已停止");

    const latestImageState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        busy: boolean;
        resultBatches: unknown[];
      };
    expect(latestImageState.busy).toBe(false);
    expect(latestImageState.resultBatches).toEqual([]);
  });

  it("rehydrates persisted image lab result batches after recreating the panel", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 2,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");

    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-1",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-1.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
      {
        id: "img-2",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-2.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 2,
      responseFormat: "url",
      recordPromptHistory: true,
    });

    const rehydratedPayloads: unknown[] = [];
    const rehydratedPanel = new ElectronChatPanel(
      harness.sessions,
      harness.settings,
      harness.host as unknown as ConstructorParameters<typeof ElectronChatPanel>[2],
      payload => {
        rehydratedPayloads.push(payload);
      },
    );

    await rehydratedPanel.handleMessage({ type: "image:loadState" });

    expect(rehydratedPayloads).toContainEqual({
      type: "image:state",
      busy: false,
      promptInferenceBusy: false,
      materialSearchBusy: false,
      workflowBusy: false,
      workflowPlan: undefined,
      activeImageModelId: "image-model-1",
      imageModels: [
        {
          id: "image-model-1",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-2",
          authMode: "raw",
          responseFormat: "url",
          hasKey: true,
        },
      ],
      config: {
        id: "image-model-1",
        model: "gpt-image-2",
        size: "1024x1024",
        batchCount: 2,
        responseFormat: "url",
        hasApiKey: true,
        isConfigured: true,
      },
      promptHistory: [
        {
          prompt: "draw a cat",
          createdAt: expect.any(Number),
        },
      ],
      promptLibrary: expect.objectContaining({
        favoriteIds: [],
        entries: expect.any(Array),
      }),
      resultBatches: [
        {
          id: "batch-generate-1",
          prompt: "draw a cat",
          createdAt: expect.any(Number),
          source: "generate",
          itemCount: 2,
          items: [
            expect.objectContaining({ id: "img-1" }),
            expect.objectContaining({ id: "img-2" }),
          ],
        },
      ],
    });

    await rehydratedPanel.handleMessage({ type: "image:clearResults" });

    const thirdPanelPayloads: unknown[] = [];
    const thirdPanel = new ElectronChatPanel(
      harness.sessions,
      harness.settings,
      harness.host as unknown as ConstructorParameters<typeof ElectronChatPanel>[2],
      payload => {
        thirdPanelPayloads.push(payload);
      },
    );

    await thirdPanel.handleMessage({ type: "image:loadState" });

    expect(thirdPanelPayloads).toContainEqual({
      type: "image:state",
      busy: false,
      promptInferenceBusy: false,
      materialSearchBusy: false,
      workflowBusy: false,
      workflowPlan: undefined,
      activeImageModelId: "image-model-1",
      imageModels: [
        {
          id: "image-model-1",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-2",
          authMode: "raw",
          responseFormat: "url",
          hasKey: true,
        },
      ],
      config: {
        id: "image-model-1",
        model: "gpt-image-2",
        size: "1024x1024",
        batchCount: 2,
        responseFormat: "url",
        hasApiKey: true,
        isConfigured: true,
      },
      promptHistory: [
        {
          prompt: "draw a cat",
          createdAt: expect.any(Number),
        },
      ],
      promptLibrary: expect.objectContaining({
        favoriteIds: [],
        entries: expect.any(Array),
      }),
      resultBatches: [],
    });
  });

  it("deletes a single persisted image result without clearing the whole gallery", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 2,
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret");

    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-1",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-1.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
      {
        id: "img-2",
        batchId: "batch-generate-1",
        src: "https://example.com/generated-2.png",
        prompt: "draw a cat",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a cat",
      size: "1024x1024",
      batchCount: 2,
      responseFormat: "url",
      recordPromptHistory: true,
    });

    await harness.panel.handleMessage({ type: "image:deleteResult", id: "img-1" });

    const payload = [...harness.rendererPayloads]
      .reverse()
      .find(entry => (entry as { type?: string }).type === "image:state") as {
        resultBatches: Array<{
          id: string;
          itemCount: number;
          items: Array<{ id: string }>;
        }>;
      };
    expect(payload.resultBatches).toEqual([
      {
        id: "batch-generate-1",
        prompt: "draw a cat",
        createdAt: expect.any(Number),
        source: "generate",
        itemCount: 1,
        items: [
          expect.objectContaining({ id: "img-2" }),
        ],
      },
    ]);

    const rehydratedPayloads: unknown[] = [];
    const rehydratedPanel = new ElectronChatPanel(
      harness.sessions,
      harness.settings,
      harness.host as unknown as ConstructorParameters<typeof ElectronChatPanel>[2],
      payload => {
        rehydratedPayloads.push(payload);
      },
    );

    await rehydratedPanel.handleMessage({ type: "image:loadState" });

    expect(rehydratedPayloads).toContainEqual({
      type: "image:state",
      busy: false,
      promptInferenceBusy: false,
      materialSearchBusy: false,
      workflowBusy: false,
      workflowPlan: undefined,
      activeImageModelId: "image-model-1",
      imageModels: [
        {
          id: "image-model-1",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-2",
          authMode: "raw",
          responseFormat: "url",
          hasKey: true,
        },
      ],
      config: {
        id: "image-model-1",
        model: "gpt-image-2",
        size: "1024x1024",
        batchCount: 2,
        responseFormat: "url",
        hasApiKey: true,
        isConfigured: true,
      },
      promptHistory: [
        {
          prompt: "draw a cat",
          createdAt: expect.any(Number),
        },
      ],
      promptLibrary: expect.objectContaining({
        favoriteIds: [],
        entries: expect.any(Array),
      }),
      resultBatches: [
        {
          id: "batch-generate-1",
          prompt: "draw a cat",
          createdAt: expect.any(Number),
          source: "generate",
          itemCount: 1,
          items: [
            expect.objectContaining({ id: "img-2" }),
          ],
        },
      ],
    });
  });

  it("persists prompt library state through the Electron image state payload", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.panel.handleMessage({
      type: "promptLibrary:savePrompt",
      title: "直播间写真",
      category: "自定义",
      text: "draw a live-stream portrait",
      tags: "直播, 写真",
      preview: {
        kind: "image",
        src: "https://example.com/sample.png",
      },
    });

    const afterSaveState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        promptLibrary: {
          entries: Array<{
            id: string;
            origin: string;
            title: string;
            category: string;
            text: string;
            tags: string[];
            preview: { kind: string; src?: string; value?: string };
            isFavorite: boolean;
          }>;
          favoriteIds: string[];
        };
      };
    const savedEntry = afterSaveState.promptLibrary.entries.find(entry => entry.origin === "user");
    expect(savedEntry).toMatchObject({
      title: "直播间写真",
      category: "自定义",
      text: "draw a live-stream portrait",
      tags: ["直播", "写真"],
      preview: { kind: "image", src: "https://example.com/sample.png" },
      isFavorite: false,
    });

    await harness.panel.handleMessage({
      type: "promptLibrary:toggleFavorite",
      id: savedEntry!.id,
    });

    const afterFavoriteState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        promptLibrary: {
          entries: Array<{ id: string; isFavorite: boolean }>;
          favoriteIds: string[];
        };
      };
    expect(afterFavoriteState.promptLibrary.favoriteIds).toContain(savedEntry!.id);
    expect(afterFavoriteState.promptLibrary.entries.find(entry => entry.id === savedEntry!.id)?.isFavorite).toBe(true);

    await harness.panel.handleMessage({
      type: "promptLibrary:deletePrompt",
      id: savedEntry!.id,
    });

    const afterDeleteState = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "image:state") as {
        promptLibrary: {
          entries: Array<{ id: string }>;
          favoriteIds: string[];
        };
      };
    expect(afterDeleteState.promptLibrary.entries.find(entry => entry.id === savedEntry!.id)).toBeUndefined();
    expect(afterDeleteState.promptLibrary.favoriteIds).not.toContain(savedEntry!.id);
  });

  it("always resolves image lab runs against the active image model", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.settings.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      responseFormat: "url",
    });
    await harness.settings.storeImageModelApiKey("image-model-1", "image-secret-1");
    await harness.settings.saveImageConfig({
      id: "image-model-2",
      baseUrl: "https://images.example.com/v1",
      model: "gpt-image-2.1",
      authMode: "bearer",
      responseFormat: "b64_json",
    });
    await harness.settings.storeImageModelApiKey("image-model-2", "image-secret-2");
    await harness.settings.setActiveImageModelId("image-model-2");

    vi.mocked(runImageLabRequest).mockResolvedValue([
      {
        id: "img-2",
        batchId: "batch-generate-2",
        src: "https://example.com/generated-2.png",
        prompt: "draw a fox",
        createdAt: Date.now(),
        source: "generate",
      },
    ] as never);

    await harness.panel.handleMessage({
      type: "image:run",
      prompt: "draw a fox",
      baseUrl: "https://stale.example.com/v1",
      model: "stale-model",
      authMode: "raw",
      size: "1536x1024",
      batchCount: 2,
      responseFormat: "url",
      apiKey: "stale-secret",
    });

    expect(vi.mocked(runImageLabRequest)).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: "draw a fox",
      config: {
        apiKey: "image-secret-2",
        baseUrl: "https://images.example.com/v1",
        model: "gpt-image-2.1",
        authMode: "bearer",
        size: "1536x1024",
        batchCount: 2,
        responseFormat: "url",
      },
      signal: expect.any(Object),
    }));
    await expect(harness.settings.getImageModelApiKey("image-model-2")).resolves.toBe(
      "image-secret-2",
    );
    expect(harness.settings.getImageConfig()).toEqual({
      id: "image-model-2",
      baseUrl: "https://images.example.com/v1",
      model: "gpt-image-2.1",
      authMode: "bearer",
      size: "1536x1024",
      batchCount: 2,
      responseFormat: "url",
    });
  });

  it("keeps Electron in a background waiting state while a hosted task is still running", async () => {
    const harness = await createHarness();
    tempDirs.push(harness.storagePath);

    await harness.settings.setOnboardingDone(true);
    await harness.panel.handleMessage({ type: "ready" });

    (harness.panel as any).currentSessionWorkspaceRoot = "E:\\repo";
    const runtime = (harness.panel as any).getConversationTaskRuntime("E:\\repo");
    await runtime.registerBackgroundTask({
      id: "remote-verify-1",
      taskType: "remote_agent",
      status: "running",
      description: "Hosted verification: HEAD~1..HEAD",
      workspaceRoot: "E:\\repo",
      command: "/ultraverify HEAD~1..HEAD",
      metadata: {
        remoteTaskType: "claude_cli_verification",
      },
      output: "Started remote verification",
    });

    await (harness.panel as any).postState();

    const lastStatePayload = [...harness.rendererPayloads]
      .reverse()
      .find(payload => (payload as { type?: string }).type === "state") as {
        isBusy: boolean;
        activeRequestKind: string | null;
      };

    expect(lastStatePayload.isBusy).toBe(true);
    expect(lastStatePayload.activeRequestKind).toBe("background");
  });
});
