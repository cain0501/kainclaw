import { BrowserWindow, session } from "electron";

const CAPTURE_TIMEOUT_MS = 8000;

/**
 * Renders design HTML in a hidden offscreen window and returns a JPEG data URL
 * sized at 420×252 (16:9 thumbnail).
 *
 * Uses an isolated session with all external HTTP/HTTPS requests blocked so
 * Google Fonts and CDN assets don't consume the shared network stack or stall
 * the Electron event loop while LLM generation is in flight.
 */
export async function captureDesignThumbnail(html: string): Promise<string> {
  const partition = `persist:kc-thumb-${Date.now()}`;
  const ses = session.fromPartition(partition, { cache: false });

  ses.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );

  const win = new BrowserWindow({
    show: false,
    width: 1260,
    height: 709,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: ses,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("thumbnail capture timeout")), CAPTURE_TIMEOUT_MS),
  );

  try {
    await Promise.race([
      win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`),
      timeoutPromise,
    ]);
    await new Promise<void>(resolve => setTimeout(resolve, 250));
    const image = await win.webContents.capturePage();
    const resized = image.resize({ width: 420, height: 252 });
    return "data:image/jpeg;base64," + resized.toJPEG(82).toString("base64");
  } finally {
    win.destroy();
    // Clean up isolated session
    void ses.clearCache().catch(() => {});
  }
}
