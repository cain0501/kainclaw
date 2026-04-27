import { spawn } from "node:child_process";
import type { HookDefinition } from "../hooksRegistry";

export type HookEvent = "PreToolCall" | "PostToolCall" | "PrePrompt" | "PostPrompt";

export interface HookContext {
  event: HookEvent;
  workspaceRoot: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  prompt?: string;
  reply?: string;
}

export type AgentRunner = (hook: HookDefinition, context: HookContext) => Promise<void>;

export interface HookResult {
  blocked: boolean;
  injected?: string;
  position?: "prefix" | "suffix";
}

export async function executeHook(
  hook: HookDefinition,
  context: HookContext,
  agentRunner?: AgentRunner,
): Promise<HookResult> {
  try {
    switch (hook.type) {
      case "command":
        return await _executeCommandHook(hook, context);
      case "http":
        return await _executeHttpHook(hook, context);
      case "prompt":
        return _executePromptHook(hook);
      case "agent":
        return await _executeAgentHook(hook, context, agentRunner);
      default:
        console.warn(`[hooks] Unknown hook type for hook ${hook.id}`);
        return { blocked: false };
    }
  } catch (err) {
    console.warn(
      `[hooks] executeHook failed for ${hook.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { blocked: false };
  }
}

async function _executeCommandHook(
  hook: HookDefinition,
  context: HookContext,
): Promise<HookResult> {
  const command = hook.command ?? "";
  if (!command) {
    return { blocked: false };
  }

  const timeoutMs = hook.timeoutMs ?? 5000;
  const blocking = hook.blocking ?? false;
  const isWin = process.platform === "win32";
  const shell = isWin ? "cmd" : "sh";
  const shellArgs = isWin ? ["/c", command] : ["-c", command];

  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    HOOK_EVENT: context.event,
    HOOK_WORKSPACE: context.workspaceRoot,
    HOOK_SESSION: context.sessionId ?? "",
  };

  let timedOut = false;
  const execPromise = new Promise<void>((resolve, reject) => {
    const child = spawn(shell, shellArgs, { env, stdio: "ignore" });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);

    child.on("close", code => {
      clearTimeout(timer);
      if (!timedOut && code !== 0 && blocking) {
        reject(new Error(`Command hook '${hook.id}' exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on("error", err => {
      clearTimeout(timer);
      reject(err);
    });
  });

  if (blocking) {
    try {
      await execPromise;
      return { blocked: false };
    } catch {
      return { blocked: true };
    }
  } else {
    execPromise.catch(err =>
      console.warn(`[hooks] Command hook '${hook.id}' error: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { blocked: false };
  }
}

async function _executeHttpHook(
  hook: HookDefinition,
  context: HookContext,
): Promise<HookResult> {
  const url = hook.url ?? "";
  if (!url) {
    return { blocked: false };
  }

  const timeoutMs = hook.timeoutMs ?? 3000;
  const blocking = hook.blocking ?? false;
  const method = hook.method ?? "POST";

  const payload = {
    event: context.event,
    workspaceRoot: context.workspaceRoot,
    sessionId: context.sessionId,
    timestamp: new Date().toISOString(),
    context: {
      toolName: context.toolName,
      toolInput: context.toolInput,
      toolOutput: context.toolOutput,
      prompt: context.prompt,
      reply: context.reply,
    },
  };

  const fetchPromise = fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(hook.headers ?? {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (blocking) {
    const resp = await fetchPromise;
    if (!resp.ok) {
      return { blocked: true };
    }
    return { blocked: false };
  } else {
    fetchPromise.catch(err =>
      console.warn(`[hooks] HTTP hook '${hook.id}' error: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { blocked: false };
  }
}

function _executePromptHook(hook: HookDefinition): HookResult {
  const text = hook.prompt ?? "";
  if (!text) {
    return { blocked: false };
  }
  return {
    blocked: false,
    injected: text,
    position: hook.position ?? "suffix",
  };
}

async function _executeAgentHook(
  hook: HookDefinition,
  context: HookContext,
  agentRunner?: AgentRunner,
): Promise<HookResult> {
  if (!hook.agentId && !hook.agentPrompt) {
    console.warn(`[hooks] Agent hook '${hook.id}' missing agentId/agentPrompt, skipping`);
    return { blocked: false };
  }

  if (!agentRunner) {
    console.warn(`[hooks] Agent hook '${hook.id}' no runner available, skipping`);
    return { blocked: false };
  }

  const blocking = hook.blocking ?? false;

  if (blocking) {
    try {
      await agentRunner(hook, context);
      return { blocked: false };
    } catch {
      return { blocked: true };
    }
  } else {
    agentRunner(hook, context).catch(err =>
      console.warn(`[hooks] Agent hook '${hook.id}' error: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { blocked: false };
  }
}
