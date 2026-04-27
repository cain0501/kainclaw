import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { REVIEW_AGENT_SYSTEM_PROMPT } from "./agent/built-in/reviewAgent";
import { type NormalizedMessage } from "./agent/providers/IProviderAdapter";
import { ClaudeCliAdapter } from "./agent/providers/claudeCliAdapter";
import { getReviewTools, getReviewToolContext } from "./review/runner";
import { runAgent } from "./agent/agentRunner";
import { formatBuiltInAgentToolEvent } from "./agent/built-in/backgroundTask";
import { parseDetachedBackgroundTaskState } from "./detachedBackgroundTask";
import { buildThinkingEffortSystemPrompt } from "./thinkingEffort/prompt";
import { getBuiltInToolDefinitions } from "./toolRuntime";

type BackgroundReviewWorkerConfig = {
  workspaceRoot: string;
  commandText: string;
  reviewRequest: string;
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

async function readConfig(configPath: string): Promise<BackgroundReviewWorkerConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BackgroundReviewWorkerConfig>;

  if (
    !parsed ||
    typeof parsed.workspaceRoot !== "string" ||
    !parsed.workspaceRoot.trim() ||
    typeof parsed.commandText !== "string" ||
    !parsed.commandText.trim() ||
    typeof parsed.reviewRequest !== "string" ||
    !parsed.reviewRequest.trim() ||
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
    throw new Error(`Invalid remote review config: ${configPath}`);
  }

  return {
    workspaceRoot: parsed.workspaceRoot,
    commandText: parsed.commandText,
    reviewRequest: parsed.reviewRequest,
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
    status: "running" | "completed" | "failed" | "cancelled";
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

async function runDetachedReview(configPath: string): Promise<void> {
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
    status: "completed" | "failed" | "cancelled",
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
    const toolContext = getReviewToolContext({
      workspaceRoot: config.workspaceRoot,
      abortSignal: abortController.signal,
    } as any);
    const tools = getReviewTools(getBuiltInToolDefinitions({ lspAvailable: false }));
    const history: NormalizedMessage[] = [
      {
        role: "user",
        content: config.reviewRequest,
      },
    ];

    const report = await runAgent(history, {
      provider,
      tools,
      toolContext,
      abortSignal: abortController.signal,
      maxTurns: 20,
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

    if (await wasCancelled(config.cancelPath)) {
      await appendLifecycleMessage(
        config.outputPath,
        "\n[cancelled] Cancelled by TaskStop.\n",
      );
      await finalize("cancelled", {
        result: "Cancelled by TaskStop.",
        error: "Cancelled by TaskStop.",
      });
      return;
    }

    await appendLifecycleMessage(
      config.outputPath,
      "\n[completed] Remote review completed successfully.\n",
    );
    await finalize("completed", {
      result: report,
    });
  } catch (error) {
    const cancelled = await wasCancelled(config.cancelPath);
    if (cancelled || abortController.signal.aborted) {
      await appendLifecycleMessage(
        config.outputPath,
        "\n[cancelled] Cancelled by TaskStop.\n",
      );
      await finalize("cancelled", {
        result: "Cancelled by TaskStop.",
        error: "Cancelled by TaskStop.",
      });
      return;
    }

    const message = toErrorMessage(error);
    await appendLifecycleMessage(config.outputPath, `\n[error] ${message}\n`);
    await finalize("failed", {
      result: `Remote review failed: ${message}`,
      error: message,
    });
  }
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error("Missing remote review config path.");
  }

  await runDetachedReview(configPath);
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
          result: `Remote review failed: ${message}`,
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
