import path from "node:path";
import { promises as fs } from "node:fs";
import { app, BrowserWindow, ipcMain, globalShortcut, dialog, type MessageBoxOptions } from "electron";
import { ElectronHostAdapter } from "../src/platform/electronHostAdapter";
import {
  ELECTRON_APP_NAME,
  migrateLegacyElectronStorage,
  resolveElectronStoragePath,
  resolveElectronUserDataPath,
} from "../src/platform/electronStoragePaths";
import { SettingsRepository } from "../src/storage/settingsRepository";
import { SessionRepository } from "../src/storage/sessionRepository";
import type { DesignSlider } from "../src/design/slidersExtractor";
import { resolveProviderConfig } from "../src/providerHost";
import { ElectronChatPanel } from "./ElectronChatPanel";
import { createPersistentLocalBridgeAuthTokenResolver } from "../src/localBridge/localBridgeAuth";
import { LocalBridgeContextStore } from "../src/localBridge/localBridgeContextStore";
import { createLocalBridgeProxyHandler } from "../src/localBridge/localBridgeProxy";
import { createPersistentLocalBridgeSessionResolver } from "../src/localBridge/localBridgeSession";
import { LocalBridgeRuntime } from "../src/localBridge/localBridgeRuntime";
import type { DesktopRuntimeServices } from "../src/platform/desktopRuntimeServices";
import type { BridgeProviderConfig } from "../src/platform/localBridgeRuntime";
import {
  InboundMcpExecutionBroker,
  type InboundMcpGrantDecision,
} from "../src/platform/inboundMcpExecutionBroker";
import { InboundMcpNamedPipeHost } from "../src/platform/inboundMcpNamedPipeBridge";

// ─── App state ────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let chatPanel: ElectronChatPanel | null = null;

function buildTimestampedExportPath(projectLabel: string, format: "pdf" | "pptx" | "zip"): string {
  return path.join(
    resolveElectronStoragePath(app.getPath("userData")),
    "exports",
    `${projectLabel.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48) || "design"}-${new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "")}.${format}`,
  );
}

async function renderDesignSlidePng(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 1600,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
    const image = await win.webContents.capturePage();
    return image.toPNG();
  } finally {
    win.destroy();
  }
}

function buildLocalBridgeProviderConfig(
  settings: SettingsRepository,
): BridgeProviderConfig {
  const activeProvider = settings.getActiveProviderMeta();

  if (!activeProvider) {
    return {
      providerType: "unconfigured",
      model: "",
      licenseActive: settings.isLicenseActivated(),
      proxyMode: true,
    };
  }

  return {
    providerType: activeProvider.type,
    model: activeProvider.model ?? "",
    baseUrl: activeProvider.baseUrl,
    licenseActive: settings.isLicenseActivated(),
    proxyMode: true,
  };
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: "hidden",
    backgroundColor: "#09090B",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let rendererLoaded = false;
  mainWindow.webContents.once("did-finish-load", () => {
    rendererLoaded = true;
    if (chatPanel) {
      void chatPanel.handleMessage({ type: "ready" }).catch(error => {
        console.error("[KainClaw] Failed to deliver initial ready message:", error);
      });
    }
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error("[KainClaw] Renderer failed to load:", {
        errorCode,
        errorDescription,
        validatedURL,
      });
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[KainClaw] Renderer process exited:", details);
  });
  void mainWindow.loadFile(path.join(__dirname, "renderer", "index.html")).catch(error => {
    console.error("[KainClaw] Failed to load renderer HTML:", error);
  });

  let localBridgeRuntime: LocalBridgeRuntime | undefined;
  let inboundMcpPipeHost: InboundMcpNamedPipeHost | undefined;
  try {
    const storagePath = resolveElectronStoragePath(app.getPath("userData"));

    // Route host-adapter messages through webview:receive so the renderer JS
    // (which only listens on that channel via the preload) can receive them.
    const host = new ElectronHostAdapter(
      (channel, payload) => {
        if (channel === "approval:pending") {
          mainWindow?.webContents.send("webview:receive", {
            type: "approval:pending",
            ...(payload && typeof payload === "object" ? payload : {}),
          });
        } else {
          mainWindow?.webContents.send("webview:receive", { type: channel, ...(payload && typeof payload === "object" ? payload : {}) });
        }
      },
    );

    const settings = new SettingsRepository(host);
    const sessions = new SessionRepository(storagePath);
    const localBridgeContextStore = new LocalBridgeContextStore(storagePath);

    localBridgeRuntime = new LocalBridgeRuntime();
    const localBridgeProxyHandler = createLocalBridgeProxyHandler({
      resolveRuntimeContext: async () => {
        const workspaceRoot = settings.getWorkspaceRoot() ?? "";
        const { config, envMap } = await resolveProviderConfig(settings, workspaceRoot);
        return {
          config,
          workspaceRoot,
          envMap,
        };
      },
    });
    const desktopRuntimeServices: DesktopRuntimeServices = {
      localBridgeRuntime,
    };
    const localBridgeSessionResolver = createPersistentLocalBridgeSessionResolver({
      loadSessionId: () => host.getState<string>("cain.localBridgeSessionId"),
      saveSessionId: sessionId => host.setState("cain.localBridgeSessionId", sessionId),
    });
    const localBridgeAuthTokenResolver = createPersistentLocalBridgeAuthTokenResolver({
      loadAuthToken: () => host.getState<string>("cain.localBridgeAuthToken"),
      saveAuthToken: authToken => host.setState("cain.localBridgeAuthToken", authToken),
    });
    const inboundMcpBroker = new InboundMcpExecutionBroker({
      requestApproval: async request => {
        const options: MessageBoxOptions = {
          type: "question",
          title: "KainClaw MCP permission",
          message: `Allow external MCP tool ${request.toolName}?`,
          detail: [
            `Client: ${request.serverInstanceId}`,
            `Inbound session: ${request.sessionLabel || request.sessionId}`,
            `Request: ${request.promptSummary.slice(0, 1_000)}`,
          ].join("\n"),
          buttons: ["Deny", "Allow once", "Allow for this inbound session"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        };
        const result = mainWindow
          ? await dialog.showMessageBox(mainWindow, options)
          : await dialog.showMessageBox(options);
        const decisions: InboundMcpGrantDecision[] = ["deny", "once", "session"];
        return decisions[result.response] ?? "deny";
      },
    });
    inboundMcpPipeHost = new InboundMcpNamedPipeHost(inboundMcpBroker);
    void inboundMcpPipeHost.start().catch(error => {
      console.error("[KainClaw] Failed to start inbound MCP bridge:", error);
    });

    chatPanel = new ElectronChatPanel(
      sessions,
      settings,
      host,
      payload => mainWindow?.webContents.send("webview:receive", payload),
      desktopRuntimeServices,
    );

    if (rendererLoaded) {
      void chatPanel.handleMessage({ type: "ready" }).catch(error => {
        console.error("[KainClaw] Failed to deliver deferred ready message:", error);
      });
    }
    void (async () => {
      const authToken = await localBridgeAuthTokenResolver();
      await localBridgeRuntime.start({
        authToken,
        getProviderConfig: () => buildLocalBridgeProviderConfig(settings),
        getSessionContext: sessionId => localBridgeContextStore.getContext(sessionId),
        appendSessionMessage: request =>
          localBridgeContextStore.appendMessage(request),
        handleProxyRequest: localBridgeProxyHandler,
        resolveSessionId: localBridgeSessionResolver,
      });
    })().catch(error => {
      console.error("[KainClaw] Failed to start local bridge runtime:", error);
    });
  } catch (error) {
    const detail = error instanceof Error
      ? error.stack || error.message
      : String(error);
    console.error("[KainClaw] Failed to initialize desktop host services:", detail);
    dialog.showErrorBox("KainClaw startup error", detail);
  }

  mainWindow.on("closed", () => {
    chatPanel?.dispose();
    if (localBridgeRuntime) {
      void localBridgeRuntime.stop().catch(error => {
        console.error("[KainClaw] Failed to stop local bridge runtime:", error);
      });
    }
    if (inboundMcpPipeHost) {
      void inboundMcpPipeHost.stop().catch(error => {
        console.error("[KainClaw] Failed to stop inbound MCP bridge:", error);
      });
    }
    mainWindow = null;
    chatPanel = null;
  });
}

// ─── IPC: renderer → main ────────────────────────────────────────────────────

// ─── IPC: window controls ────────────────────────────────────────────────────

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

// ─── IPC: workspace folder picker ────────────────────────────────────────────

ipcMain.handle("workspace:pick", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "选择工作区文件夹",
    buttonLabel: "选择文件夹",
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("design:exportHtml", async (_event, payload: Record<string, unknown>) => {
  if (!mainWindow) {
    throw new Error("Main window is not available.");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  const sliders = Array.isArray(payload.sliders) ? payload.sliders : [];
  const projectLabel =
    typeof payload.projectLabel === "string" && payload.projectLabel.trim()
      ? payload.projectLabel.trim()
      : "kainclaw-design";
  if (!html.trim()) {
    throw new Error("Design HTML export requires html.");
  }

  const defaultPath = buildTimestampedExportPath(projectLabel, "pdf").replace(/\.pdf$/i, ".html");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出 HTML",
    defaultPath,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (result.canceled || !result.filePath) {
    throw new Error("用户取消了 HTML 导出。");
  }

  const { exportDesignHtml } = await import("../src/design/exporters.js");
  const tempPath = await exportDesignHtml({
    storageRoot: resolveElectronStoragePath(app.getPath("userData")),
    html,
    sliders: sliders as DesignSlider[],
    projectLabel,
  });
  const buffer = await fs.readFile(tempPath);
  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, buffer);
  return result.filePath;
});

ipcMain.handle("design:exportPdf", async (_event, payload: Record<string, unknown>) => {
  if (!mainWindow) {
    throw new Error("Main window is not available.");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  const projectLabel =
    typeof payload.projectLabel === "string" && payload.projectLabel.trim()
      ? payload.projectLabel.trim()
      : "kainclaw-design";
  if (!html.trim()) {
    throw new Error("Design PDF export requires html.");
  }

  const defaultPath = buildTimestampedExportPath(projectLabel, "pdf");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出 PDF",
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) {
    throw new Error("用户取消了 PDF 导出。");
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
    const pdf = await win.webContents.printToPDF({ printBackground: true });
    await fs.mkdir(path.dirname(result.filePath), { recursive: true });
    await fs.writeFile(result.filePath, pdf);
    return result.filePath;
  } finally {
    win.destroy();
  }
});

ipcMain.handle("design:exportPptx", async (_event, payload: Record<string, unknown>) => {
  if (!mainWindow) {
    throw new Error("Main window is not available.");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  const projectLabel =
    typeof payload.projectLabel === "string" && payload.projectLabel.trim()
      ? payload.projectLabel.trim()
      : "kainclaw-design";
  if (!html.trim()) {
    throw new Error("Design PPTX export requires html.");
  }

  const defaultPath = buildTimestampedExportPath(projectLabel, "pptx");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出 PPTX",
    defaultPath,
    filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
  });
  if (result.canceled || !result.filePath) {
    throw new Error("用户取消了 PPTX 导出。");
  }

  const png = await renderDesignSlidePng(html);
  const { exportDesignPptx } = await import("../src/design/exporters.js");
  const tempPath = await exportDesignPptx({
    storageRoot: resolveElectronStoragePath(app.getPath("userData")),
    html,
    sliders: [],
    projectLabel,
    renderSlideImage: async () => png,
  });
  const buffer = await fs.readFile(tempPath);
  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, buffer);
  return result.filePath;
});

ipcMain.handle("design:exportZip", async (_event, payload: Record<string, unknown>) => {
  if (!mainWindow) {
    throw new Error("Main window is not available.");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  const sliders = Array.isArray(payload.sliders) ? payload.sliders : [];
  const projectLabel =
    typeof payload.projectLabel === "string" && payload.projectLabel.trim()
      ? payload.projectLabel.trim()
      : "kainclaw-design";
  if (!html.trim()) {
    throw new Error("Design ZIP export requires html.");
  }

  const defaultPath = buildTimestampedExportPath(projectLabel, "zip");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出 ZIP",
    defaultPath,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) {
    throw new Error("用户取消了 ZIP 导出。");
  }

  const { exportDesignZip } = await import("../src/design/exporters.js");
  const tempPath = await exportDesignZip({
    storageRoot: resolveElectronStoragePath(app.getPath("userData")),
    html,
    sliders: sliders as DesignSlider[],
    projectLabel,
  });
  const buffer = await fs.readFile(tempPath);
  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, buffer);
  return result.filePath;
});

// ─── IPC: renderer → main ────────────────────────────────────────────────────

ipcMain.on("webview:message", (_event, message: Record<string, unknown>) => {
  if (!chatPanel) return;
  void chatPanel.handleMessage(message).catch(err => {
    console.error("[KainClaw] IPC handler error:", err);
  });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  void (async () => {
    const appDataPath = app.getPath("appData");
    app.setName(ELECTRON_APP_NAME);
    app.setPath("userData", resolveElectronUserDataPath(appDataPath));
    await migrateLegacyElectronStorage(appDataPath);
    createWindow();

    globalShortcut.register("Ctrl+Shift+I", () => {
      mainWindow?.webContents.toggleDevTools();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })().catch(error => {
    console.error("[KainClaw] Failed to initialize Electron shell:", error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
