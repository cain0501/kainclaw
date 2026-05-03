import { contextBridge, ipcRenderer } from "electron";

// Expose window control actions and workspace picker to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  exportDesignPdf: (html: string, projectLabel: string) =>
    ipcRenderer.invoke("design:exportPdf", { html, projectLabel }),
  exportDesignPptx: (html: string, projectLabel: string) =>
    ipcRenderer.invoke("design:exportPptx", { html, projectLabel }),
});

/**
 * acquireVsCodeApi() shim for Electron BrowserWindow.
 *
 * contextBridge.exposeInMainWorld("acquireVsCodeApi", fn) makes fn available
 * as window.acquireVsCodeApi in the renderer, so the sidebar script's
 *   const vscode = acquireVsCodeApi();
 * resolves correctly without any HTML patching.
 *
 * Renderer → Main : ipcRenderer.send("webview:message", payload)
 * Main → Renderer : ipcRenderer.on("webview:receive", ...) →
 *                   window.dispatchEvent(MessageEvent { data: payload })
 */

let _state: unknown = undefined;

// Forward main-process messages to the renderer as DOM "message" events
// (the sidebar script listens via window.addEventListener("message", ...))
ipcRenderer.on("webview:receive", (_event, payload: unknown) => {
  window.dispatchEvent(new MessageEvent("message", { data: payload }));
});

contextBridge.exposeInMainWorld("acquireVsCodeApi", () => ({
  postMessage(payload: unknown): void {
    ipcRenderer.send("webview:message", payload);
  },
  getState(): unknown {
    return _state;
  },
  setState(newState: unknown): unknown {
    _state = newState;
    return newState;
  },
}));
