const { spawn } = require("node:child_process");

const electronBinary = require("electron");
const env = { ...process.env };

// Some dev environments export ELECTRON_RUN_AS_NODE globally, which makes
// require("electron") behave like a plain Node process and breaks ipcMain.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ["dist-electron/electron/main.js"], {
  stdio: "inherit",
  env,
});

child.on("error", error => {
  console.error("[KainClaw] Failed to launch Electron:", error);
  process.exit(1);
});

child.on("exit", code => {
  process.exit(code ?? 0);
});
