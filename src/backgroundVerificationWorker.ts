import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import { type NormalizedMessage } from "./agent/providers/IProviderAdapter";
import { ClaudeCliAdapter } from "./agent/providers/claudeCliAdapter";
import { formatBuiltInAgentToolEvent } from "./agent/built-in/backgroundTask";
import { parseDetachedBackgroundTaskState } from "./detachedBackgroundTask";
import { getBuiltInToolDefinitions } from "./toolRuntime";
import {
  getVerificationToolContext,
  getVerificationTools,
  normalizeVerificationReportFences,
} from "./verification/runner";
import {
  extractVerificationVerdict,
  type VerificationVerdict,
} from "./verification/prompt";
import { runAgent } from "./agent/agentRunner";

type BackgroundVerificationWorkerConfig = {
  workspaceRoot: string;
  commandText: string;
  verificationRequest: string;
  outputPath: string;
  statePath: string;
  cancelPath: string;
  timeoutMs: number;
  sessionId: string;
  provider: {
    cliPath?: string;
    model?: string;
  };
  systemPrompt: string;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readConfig(
  configPath: string,
): Promise<BackgroundVerificationWorkerConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BackgroundVerificationWorkerConfig>;

  if (
    !parsed ||
    typeof parsed.workspaceRoot !== "string" ||
    !parsed.workspaceRoot.trim() ||
    typeof parsed.commandText !== "string" ||
    !parsed.commandText.trim() ||
    typeof parsed.verificationRequest !== "string" ||
    !parsed.verificationRequest.trim() ||
    typeof parsed.outputPath !== "string" ||
    !parsed.outputPath.trim() ||
    typeof parsed.statePath !== "string" ||
    !parsed.statePath.trim() ||
    typeof parsed.cancelPath !== "string" ||
    !parsed.cancelPath.trim() ||
    typeof parsed.timeoutMs !== "number" ||
    !Number.isFinite(parsed.timeoutMs) ||
    typeof parsed.sessionId !== "string" ||
    !parsed.sessionId.trim() ||
    !parsed.provider ||
    typeof parsed.provider !== "object" ||
    Array.isArray(parsed.provider) ||
    typeof parsed.systemPrompt !== "string"
  ) {
    throw new Error(`Invalid remote verification config: ${configPath}`);
  }

  return {
    workspaceRoot: parsed.workspaceRoot,
    commandText: parsed.commandText,
    verificationRequest: parsed.verificationRequest,
    outputPath: parsed.outputPath,
    statePath: parsed.statePath,
    cancelPath: parsed.cancelPath,
    timeoutMs: parsed.timeoutMs,
    sessionId: parsed.sessionId,
    provider: {
      ...(typeof parsed.provider.cliPath === "string"
        ? { cliPath: parsed.provider.cliPath }
        : {}),
      ...(typeof parsed.provider.model === "string"
        ? { model: parsed.provider.model }
        : {}),
    },
    systemPrompt: parsed.systemPrompt,
  };
}

async function writeState(
  statePath: string,
  state: {
    status: "running" | "completed" | "failed" | "cancelled" | "killed";
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

function finalizeVerificationReport(report: string): {
  report: string;
  verdict: VerificationVerdict;
} {
  const normalized = normalizeVerificationReportFences(report);
  const verdict = extractVerificationVerdict(normalized) ?? "PARTIAL";
  const finalReport = extractVerificationVerdict(normalized)
    ? normalized
    : `${normalized.trim()}\n\nVERDICT: ${verdict}`;

  return {
    report: finalReport,
    verdict,
  };
}

async function runDetachedVerification(configPath: string): Promise<void> {
  const config = await readConfig(configPath);
  const outputStream = createWriteStream(config.outputPath, { flags: "a" });
  const abortController = new AbortController();
  let finalized = false;

  const cancelPoll = setInterval(() => {
    void wasCancelled(config.cancelPath).then(cancelled => {
      if (cancelled) {
        abortController.abort();
      }
    });
  }, 250);
  cancelPoll.unref?.();

  await writeState(config.statePath, { status: "running" });

  const finalize = async (
    status: "completed" | "failed" | "cancelled" | "killed",
    details: {
      result?: string;
      error?: string;
    },
  ) => {
    if (finalized) {
      return;
    }
    finalized = true;
    clearInterval(cancelPoll);
    outputStream.end();
    await writeState(config.statePath, {
      status,
      ...details,
    });
  };

  try {
    const provider = new ClaudeCliAdapter(
      {
        type: "claude-cli",
        ...config.provider,
      },
      config.workspaceRoot,
      {},
      config.systemPrompt,
    );
    const toolContext = getVerificationToolContext({
      workspaceRoot: config.workspaceRoot,
      abortSignal: abortController.signal,
    } as any);
    const tools = getVerificationTools(
      getBuiltInToolDefinitions({ lspAvailable: false }),
    );
    const history: NormalizedMessage[] = [
      {
        role: "user",
        content: config.verificationRequest,
      },
    ];

    const rawReport = await runAgent(history, {
      provider,
      tools,
      toolContext,
      abortSignal: abortController.signal,
      maxTurns: 24,
      onToken: token => {
        outputStream.write(token);
      },
      onToolStart: (toolName, input) => {
        outputStream.write(
          `\n${formatBuiltInAgentToolEvent(
            "start",
            toolName,
            JSON.stringify(input),
          )}\n`,
        );
      },
      onToolEnd: (_execId, summary, isError) => {
        outputStream.write(
          `\n${formatBuiltInAgentToolEvent(
            "end",
            "tool",
            isError ? `ERROR: ${summary}` : summary,
          )}\n`,
        );
      },
    });
    const finalReport = finalizeVerificationReport(rawReport);

    if (await wasCancelled(config.cancelPath)) {
      await appendLifecycleMessage(
        config.outputPath,
        "\n[killed] Stopped by TaskStop.\n",
      );
      await finalize("killed", {
        result: "Stopped by TaskStop.",
      });
      return;
    }

    await appendLifecycleMessage(
      config.outputPath,
      finalReport.verdict === "PASS"
        ? "\n[completed] Remote verification completed successfully.\n"
        : `\n[failed] Remote verification finished with VERDICT: ${finalReport.verdict}.\n`,
    );
    await finalize(
      finalReport.verdict === "PASS" ? "completed" : "failed",
      {
        result: finalReport.report,
        ...(finalReport.verdict !== "PASS"
          ? {
              error: `Remote verification finished with VERDICT: ${finalReport.verdict}.`,
            }
          : {}),
      },
    );
  } catch (error) {
    const cancelled = await wasCancelled(config.cancelPath);
    if (cancelled || abortController.signal.aborted) {
      await appendLifecycleMessage(
        config.outputPath,
        "\n[killed] Stopped by TaskStop.\n",
      );
      await finalize("killed", {
        result: "Stopped by TaskStop.",
      });
      return;
    }

    const message = toErrorMessage(error);
    await appendLifecycleMessage(config.outputPath, `\n[error] ${message}\n`);
    await finalize("failed", {
      result: `Remote verification failed: ${message}`,
      error: message,
    });
  }
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error("Missing remote verification config path.");
  }

  await runDetachedVerification(configPath);
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
          result: `Remote verification failed: ${message}`,
          error:
            existingState?.error && existingState.error.trim()
              ? existingState.error
              : message,
        });
      } catch {
        // Ignore secondary failures while trying to write recovery state.
      }
    }

    process.exitCode = 1;
  });
}
