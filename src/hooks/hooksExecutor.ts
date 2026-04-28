import { spawn } from "node:child_process";
import type { HookDefinition } from "../hooksRegistry";
import {
  getInstalledSkillCompatStateDir,
  isPathWithinFreezeBoundary,
  readFreezeBoundary,
} from "../installedSkillCompat";

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
  blockedMessage?: string;
  askMessage?: string;
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

  const nativeCompatResult = await maybeExecuteNativeInstalledSkillCommandHook(
    hook,
    context,
  );
  if (nativeCompatResult) {
    return nativeCompatResult;
  }

  const timeoutMs = hook.timeoutMs ?? 5000;
  const blocking = hook.blocking ?? false;
  const isWin = process.platform === "win32";
  const windowsPowerShell =
    process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const shell = isWin
    ? windowsPowerShell
    : "sh";
  const shellArgs = isWin
    ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]
    : ["-c", command];

  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    HOOK_EVENT: context.event,
    HOOK_WORKSPACE: context.workspaceRoot,
    HOOK_SESSION: context.sessionId ?? "",
    CLAUDE_PLUGIN_DATA: getInstalledSkillCompatStateDir(),
    ...(hook.skillRoot
      ? {
          CLAUDE_SKILL_DIR:
            process.platform === "win32"
              ? hook.skillRoot.replace(/\\/g, "/")
              : hook.skillRoot,
        }
      : {}),
  };

  const payload = JSON.stringify({
    event: context.event,
    workspace_root: context.workspaceRoot,
    session_id: context.sessionId,
    tool_name: context.toolName,
    tool_input: context.toolInput,
    tool_output: context.toolOutput,
    prompt: context.prompt,
    reply: context.reply,
  });

  let timedOut = false;
  let stdout = "";
  const execPromise = new Promise<void>((resolve, reject) => {
    const child = spawn(shell, shellArgs, {
      cwd: context.workspaceRoot,
      env,
      stdio: "pipe",
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", () => {
      // Ignore stderr for compatibility hooks; stdout carries protocol output.
    });
    child.stdin.write(payload);
    child.stdin.end();

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

  function parseProtocolResult(): HookResult | null {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }

    const candidateLine = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .at(-1);
    if (!candidateLine) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidateLine);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message.trim() : undefined;
    const permissionDecision =
      typeof record.permissionDecision === "string"
        ? record.permissionDecision.trim().toLowerCase()
        : "";

    if (permissionDecision === "deny") {
      return {
        blocked: true,
        ...(message ? { blockedMessage: message } : {}),
      };
    }

    if (permissionDecision === "ask") {
      return {
        blocked: false,
        askMessage:
          message ?? `Installed skill hook "${hook.name}" requested confirmation.`,
      };
    }

    return null;
  }

  if (blocking) {
    try {
      await execPromise;
      return parseProtocolResult() ?? { blocked: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ENOENT/i.test(message)) {
        console.warn(`[hooks] Command hook '${hook.id}' error: ${message}`);
        return { blocked: false };
      }
      return { blocked: true };
    }
  } else {
    execPromise.catch(err =>
      console.warn(`[hooks] Command hook '${hook.id}' error: ${err instanceof Error ? err.message : String(err)}`),
    );
    return parseProtocolResult() ?? { blocked: false };
  }
}

async function maybeExecuteNativeInstalledSkillCommandHook(
  hook: HookDefinition,
  context: HookContext,
): Promise<HookResult | null> {
  const command = hook.command ?? "";

  if (/check-freeze\.sh/i.test(command)) {
    const rawPath =
      (context.toolInput &&
        typeof context.toolInput === "object" &&
        !Array.isArray(context.toolInput) &&
        typeof (context.toolInput as Record<string, unknown>).path === "string"
        ? String((context.toolInput as Record<string, unknown>).path)
        : "") ||
      (context.toolInput &&
        typeof context.toolInput === "object" &&
        !Array.isArray(context.toolInput) &&
        typeof (context.toolInput as Record<string, unknown>).file_path === "string"
        ? String((context.toolInput as Record<string, unknown>).file_path)
        : "");

    if (!rawPath) {
      return { blocked: false };
    }

    const freezeBoundary = await readFreezeBoundary();
    if (!freezeBoundary) {
      return { blocked: false };
    }

    const absoluteTarget = rawPath.match(/^[a-zA-Z]:[\\/]/) || rawPath.startsWith("/")
      ? rawPath
      : `${context.workspaceRoot}${process.platform === "win32" ? "\\" : "/"}${rawPath}`;

    if (isPathWithinFreezeBoundary(absoluteTarget, freezeBoundary)) {
      return { blocked: false };
    }

    return {
      blocked: true,
      blockedMessage: `[freeze] Blocked: ${absoluteTarget} is outside the freeze boundary (${freezeBoundary}). Only edits within the frozen directory are allowed.`,
    };
  }

  if (/check-careful\.sh/i.test(command)) {
    const rawCommand =
      context.toolInput &&
      typeof context.toolInput === "object" &&
      !Array.isArray(context.toolInput) &&
      typeof (context.toolInput as Record<string, unknown>).command === "string"
        ? String((context.toolInput as Record<string, unknown>).command)
        : "";

    if (!rawCommand) {
      return { blocked: false };
    }

    const normalized = rawCommand.toLowerCase();
    const isRecursiveRm = /\brm\s+(-[a-z]*r|--recursive)/i.test(rawCommand);
    if (isRecursiveRm) {
      const safeTargets = new Set([
        "node_modules",
        ".next",
        "dist",
        "__pycache__",
        ".cache",
        "build",
        ".turbo",
        "coverage",
      ]);
      const rawTargets = rawCommand
        .replace(/\brm\s+/i, "")
        .split(/\s+/)
        .filter(part => part && !part.startsWith("-") && part !== "--recursive");
      const allSafe = rawTargets.length > 0 &&
        rawTargets.every(target => {
          const normalizedTarget = target.replace(/[\\/]+$/g, "");
          const lastSegment = normalizedTarget.split(/[\\/]/).at(-1) ?? normalizedTarget;
          return safeTargets.has(lastSegment);
        });
      if (!allSafe) {
        return {
          blocked: false,
          askMessage:
            "[careful] Destructive: recursive delete (rm -r). This permanently removes files.",
        };
      }
    }

    const isPowerShellRecursiveDelete =
      /\bremove-item\b/i.test(rawCommand) &&
      /\s-(recurse|r)\b/i.test(rawCommand) &&
      /\s-(force|f)\b/i.test(rawCommand);
    if (isPowerShellRecursiveDelete) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: recursive delete (Remove-Item -Recurse -Force). This permanently removes files.",
      };
    }

    if (/\b(del|erase|rmdir)\b/i.test(normalized)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: delete command detected. This may permanently remove files or directories.",
      };
    }

    if (/\bdrop\s+(table|database)\b/i.test(normalized)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: SQL DROP detected. This permanently deletes database objects.",
      };
    }

    if (/\btruncate\b/i.test(normalized)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: SQL TRUNCATE detected. This deletes all rows from a table.",
      };
    }

    if (/git\s+push\s+.*(-f\b|--force)/i.test(rawCommand)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: git force-push rewrites remote history. Other contributors may lose work.",
      };
    }

    if (/git\s+reset\s+--hard/i.test(rawCommand)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: git reset --hard discards all uncommitted changes.",
      };
    }

    if (/git\s+(checkout|restore)\s+\./i.test(rawCommand)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: discards all uncommitted changes in the working tree.",
      };
    }

    if (/kubectl\s+delete/i.test(rawCommand)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: kubectl delete removes Kubernetes resources. May impact production.",
      };
    }

    if (/docker\s+(rm\s+-f|system\s+prune)/i.test(rawCommand)) {
      return {
        blocked: false,
        askMessage:
          "[careful] Destructive: Docker force-remove or prune. May delete running containers or cached images.",
      };
    }

    return { blocked: false };
  }

  return null;
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
