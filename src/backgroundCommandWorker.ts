import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDetachedBackgroundTaskState } from "./detachedBackgroundTask";

type BackgroundCommandWorkerConfig = {
  command: string;
  workspaceRoot: string;
  outputPath: string;
  statePath: string;
  cancelPath: string;
  timeoutMs: number;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readConfig(configPath: string): Promise<BackgroundCommandWorkerConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BackgroundCommandWorkerConfig>;

  if (
    !parsed ||
    typeof parsed.command !== "string" ||
    !parsed.command.trim() ||
    typeof parsed.workspaceRoot !== "string" ||
    !parsed.workspaceRoot.trim() ||
    typeof parsed.outputPath !== "string" ||
    !parsed.outputPath.trim() ||
    typeof parsed.statePath !== "string" ||
    !parsed.statePath.trim() ||
    typeof parsed.cancelPath !== "string" ||
    !parsed.cancelPath.trim() ||
    typeof parsed.timeoutMs !== "number" ||
    !Number.isFinite(parsed.timeoutMs)
  ) {
    throw new Error(`Invalid background command config: ${configPath}`);
  }

  return {
    command: parsed.command,
    workspaceRoot: parsed.workspaceRoot,
    outputPath: parsed.outputPath,
    statePath: parsed.statePath,
    cancelPath: parsed.cancelPath,
    timeoutMs: parsed.timeoutMs,
  };
}

async function writeState(
  statePath: string,
  state: {
    status: "running" | "completed" | "failed" | "cancelled";
    childPid?: number;
    exitCode?: number | null;
    result?: string;
    error?: string;
  },
): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        ...state,
        runnerPid: process.pid,
        updatedAt: Date.now(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function appendLifecycleMessage(
  outputPath: string,
  message: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.appendFile(outputPath, message, "utf8");
}

async function wasCancelled(cancelPath: string): Promise<boolean> {
  try {
    await fs.stat(cancelPath);
    return true;
  } catch {
    return false;
  }
}

async function killChildProcess(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("error", reject);
      killer.on("close", code => {
        if (code === 0 || code === 128 || code === 255) {
          resolve();
          return;
        }
        reject(new Error(`taskkill exited with code ${code ?? "unknown"}`));
      });
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function runBackgroundCommand(configPath: string): Promise<void> {
  const config = await readConfig(configPath);
  const outputStream = createWriteStream(config.outputPath, { flags: "a" });
  let finalized = false;
  let timedOut = false;

  const child = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-Command", config.command],
    {
      cwd: config.workspaceRoot,
      windowsHide: true,
    },
  );

  await writeState(config.statePath, {
    status: "running",
    ...(typeof child.pid === "number" ? { childPid: child.pid } : {}),
  });

  child.stdout.on("data", chunk => {
    outputStream.write(chunk);
  });
  child.stderr.on("data", chunk => {
    outputStream.write(chunk);
  });

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    void appendLifecycleMessage(
      config.outputPath,
      `\n[timeout] Background command timed out after ${config.timeoutMs}ms.\n`,
    );
    if (typeof child.pid === "number") {
      void killChildProcess(child.pid).catch(error => {
        void appendLifecycleMessage(
          config.outputPath,
          `\n[error] Failed to terminate timed out background command: ${toErrorMessage(error)}\n`,
        );
      });
      return;
    }
    child.kill();
  }, config.timeoutMs);

  const finalize = async (
    status: "completed" | "failed" | "cancelled",
    details: {
      exitCode?: number | null;
      result?: string;
      error?: string;
    },
  ) => {
    if (finalized) {
      return;
    }
    finalized = true;
    clearTimeout(timeoutHandle);
    outputStream.end();
    await writeState(config.statePath, {
      status,
      ...details,
      ...(typeof child.pid === "number" ? { childPid: child.pid } : {}),
    });
  };

  child.on("error", async error => {
    const message = toErrorMessage(error);
    await appendLifecycleMessage(config.outputPath, `\n[error] ${message}\n`);
    await finalize("failed", {
      result: `Background command failed: ${message}`,
      error: message,
    });
  });

  child.on("close", async (code, signal) => {
    const cancelled = await wasCancelled(config.cancelPath);

    if (cancelled) {
      await appendLifecycleMessage(config.outputPath, "\n[cancelled] Cancelled by TaskStop.\n");
      await finalize("cancelled", {
        exitCode: code,
        result: "Cancelled by TaskStop.",
        error: "Cancelled by TaskStop.",
      });
      return;
    }

    if (timedOut) {
      await finalize("failed", {
        exitCode: code,
        result: `Background command timed out after ${config.timeoutMs}ms.`,
        error: `Background command timed out after ${config.timeoutMs}ms.`,
      });
      return;
    }

    if (code === 0 && !signal) {
      await appendLifecycleMessage(
        config.outputPath,
        "\n[completed] Background command completed successfully.\n",
      );
      await finalize("completed", {
        exitCode: code,
        result: "Background command completed successfully.",
      });
      return;
    }

    const message =
      `Background command exited with code ${code ?? "unknown"}` +
      (signal ? ` (signal: ${signal})` : "") +
      ".";
    await appendLifecycleMessage(config.outputPath, `\n[exit] ${message}\n`);
    await finalize("failed", {
      exitCode: code,
      result: message,
      error: message,
    });
  });
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error("Missing background command config path.");
  }

  await runBackgroundCommand(configPath);
}

if (require.main === module) {
  void main().catch(async error => {
    const configPath = process.argv[2];
    const message = toErrorMessage(error);

    if (configPath) {
      try {
        const config = await readConfig(configPath);
        const existingState = parseDetachedBackgroundTaskState(
          JSON.parse(await fs.readFile(config.statePath, "utf8")),
        );
        await appendLifecycleMessage(config.outputPath, `\n[error] ${message}\n`);
        await writeState(config.statePath, {
          status: "failed",
          ...(existingState?.childPid !== undefined ? { childPid: existingState.childPid } : {}),
          result: `Background command failed: ${message}`,
          error: message,
        });
      } catch {
        // Ignore secondary failures when the worker cannot write recovery state.
      }
    }

    process.exitCode = 1;
  });
}
