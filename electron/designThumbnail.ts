import { BrowserWindow } from "electron";

/**
 * Renders design HTML in a hidden offscreen window and returns a JPEG data URL
 * sized at 420×252 (16:9 thumbnail).
 */
export async function captureDesignThumbnail(html: string): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    width: 1680,
    height: 945,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
    // Brief pause so CSS layout and fonts settle before capture
    await new Promise<void>(resolve => setTimeout(resolve, 400));
    const image = await win.webContents.capturePage();
    const resized = image.resize({ width: 420, height: 252 });
    return "data:image/jpeg;base64," + resized.toJPEG(82).toString("base64");
  } finally {
    win.destroy();
  }
}
