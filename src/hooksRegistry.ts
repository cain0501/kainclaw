import { promises as fs } from "node:fs";
import path from "node:path";

export type HookType = "command" | "http" | "prompt" | "agent";

export type HookTypeDefinition = {
  id: HookType;
  title: string;
  summary: string;
  requiredField: "command" | "url" | "prompt" | "agentId";
};

export type HookEventDefinition = {
  id: string;
  summary: string;
};

export type HookDefinition = {
  id: string;
  name: string;
  type: HookType;
  description: string;
  events: string[];
  matcher?: string;
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  prompt?: string;
  position?: "prefix" | "suffix";
  agentId?: string;
  agentPrompt?: string;
  agentModel?: string;
  skillRoot?: string;
  timeoutMs?: number;
  blocking?: boolean;
};

type HooksFile = {
  hooks?: unknown;
};

const SUPPORTED_HOOK_TYPES: HookTypeDefinition[] = [
  {
    id: "command",
    title: "Command Hook",
    summary: "Run a local shell command when matching events fire.",
    requiredField: "command",
  },
  {
    id: "http",
    title: "HTTP Hook",
    summary: "Send an HTTP request to a remote webhook when matching events fire.",
    requiredField: "url",
  },
  {
    id: "prompt",
    title: "Prompt Hook",
    summary: "Run an LLM evaluation prompt against captured event context.",
    requiredField: "prompt",
  },
  {
    id: "agent",
    title: "Agent Hook",
    summary: "Delegate follow-up validation or analysis work to another agent.",
    requiredField: "agentId",
  },
];

const SUPPORTED_HOOK_EVENTS: HookEventDefinition[] = [
  { id: "SessionStart", summary: "A session entered its ready state." },
  { id: "UserPromptSubmit", summary: "When the user submits a prompt, before any processing." },
  { id: "Stop", summary: "When Claude finishes a complete response turn." },
  { id: "SessionEnd", summary: "When the session is closed or reset." },
  { id: "SessionReady", summary: "Webview session finished its ready sequence." },
  { id: "Notification", summary: "Claude produced a completed reply notification." },
  { id: "PromptSubmitted", summary: "A user prompt was accepted for execution." },
  { id: "PromptCompleted", summary: "The main prompt turn completed successfully." },
  { id: "PromptFailed", summary: "The main prompt turn failed." },
  { id: "PreToolUse", summary: "Alias for PreToolCall, compatible with official Claude Code hook configs." },
  { id: "PostToolUse", summary: "Alias for PostToolCall, compatible with official Claude Code hook configs." },
  { id: "PostToolUseFailure", summary: "After a tool execution fails." },
  { id: "PreCompact", summary: "Before context compaction begins." },
  { id: "PostCompact", summary: "After context compaction completes." },
  { id: "SubagentStart", summary: "When a built-in agent session begins." },
  { id: "SubagentStop", summary: "When a built-in agent session ends (success or failure)." },
  { id: "QuickActionStarted", summary: "A quick action prompt was dispatched." },
  { id: "QuickActionCompleted", summary: "A quick action prompt completed." },
  { id: "ToolUseStarted", summary: "A tool invocation started." },
  { id: "ToolUseFinished", summary: "A tool invocation finished." },
  { id: "PlanModeEntered", summary: "Plan mode was entered." },
  { id: "PlanModeExited", summary: "Plan mode was exited." },
  { id: "ReviewStarted", summary: "The review agent started." },
  { id: "ReviewCompleted", summary: "The review agent completed." },
  { id: "VerificationStarted", summary: "The verification agent started." },
  { id: "VerificationCompleted", summary: "The verification agent completed." },
  { id: "TaskCreated", summary: "When a background task is registered." },
  { id: "TaskUpdated", summary: "A structured task was updated." },
  { id: "TaskCompleted", summary: "When a background task completes successfully." },
  { id: "WorktreeCreate", summary: "When a worktree is created via EnterWorktree." },
  { id: "WorktreeRemove", summary: "When a worktree is removed via ExitWorktree." },
  { id: "BackgroundTaskStarted", summary: "A background task started." },
  { id: "BackgroundTaskCompleted", summary: "A background task reached a terminal state." },
  { id: "SessionSwitched", summary: "The active session switched to another saved session." },
  { id: "SessionDeleted", summary: "A saved session was deleted." },
  { id: "SessionExported", summary: "A saved session was exported to markdown." },
];

export function getHooksConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cain", "hooks.json");
}

export function listSupportedHookTypes(): HookTypeDefinition[] {
  return [...SUPPORTED_HOOK_TYPES];
}

export function listSupportedHookEvents(): HookEventDefinition[] {
  return [...SUPPORTED_HOOK_EVENTS];
}

function normalizeHookDefinition(value: unknown): HookDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";

  if (
    !id ||
    !name ||
    !description ||
    (type !== "command" &&
      type !== "http" &&
      type !== "prompt" &&
      type !== "agent")
  ) {
    return null;
  }

  const events = Array.isArray(record.events)
    ? record.events
        .filter((event): event is string => typeof event === "string" && event.trim() !== "")
        .map(event => {
          const trimmed = event.trim();
          if (trimmed === "PreToolUse") {
            return "PreToolCall";
          }
          if (trimmed === "PostToolUse") {
            return "PostToolCall";
          }
          if (trimmed === "SessionReady") {
            return "SessionStart";
          }
          return trimmed;
        })
    : [];

  if (events.length === 0) {
    return null;
  }

  const requiredField = SUPPORTED_HOOK_TYPES.find(
    supportedType => supportedType.id === type,
  )?.requiredField;

  if (
    requiredField &&
    !(typeof record[requiredField] === "string" && String(record[requiredField]).trim())
  ) {
    return null;
  }

  const rawHeaders = record.headers;
  const headers: Record<string, string> | undefined =
    rawHeaders &&
    typeof rawHeaders === "object" &&
    !Array.isArray(rawHeaders) &&
    Object.values(rawHeaders as Record<string, unknown>).every(v => typeof v === "string")
      ? (rawHeaders as Record<string, string>)
      : undefined;

  return {
    id,
    name,
    type: type as HookType,
    description,
    events,
    ...(typeof record.command === "string" && record.command.trim()
      ? { command: record.command.trim() }
      : {}),
    ...(typeof record.url === "string" && record.url.trim()
      ? { url: record.url.trim() }
      : {}),
    ...(typeof record.method === "string" && record.method.trim()
      ? { method: record.method.trim().toUpperCase() }
      : {}),
    ...(headers ? { headers } : {}),
    ...(typeof record.prompt === "string" && record.prompt.trim()
      ? { prompt: record.prompt.trim() }
      : {}),
    ...(record.position === "prefix" || record.position === "suffix"
      ? { position: record.position as "prefix" | "suffix" }
      : {}),
    ...(typeof record.agentId === "string" && record.agentId.trim()
      ? { agentId: record.agentId.trim() }
      : {}),
    ...(typeof record.timeoutMs === "number" && Number.isFinite(record.timeoutMs)
      ? { timeoutMs: Math.max(0, Math.floor(record.timeoutMs)) }
      : {}),
    ...(typeof record.blocking === "boolean" ? { blocking: record.blocking } : {}),
  };
}

export async function loadHooks(workspaceRoot: string): Promise<HookDefinition[]> {
  const configPath = getHooksConfigPath(workspaceRoot);
  let rawContent = "";

  try {
    rawContent = await fs.readFile(configPath, "utf8");
  } catch {
    return [];
  }

  let parsed: HooksFile;
  try {
    parsed = JSON.parse(rawContent) as HooksFile;
  } catch {
    return [];
  }

  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  return hooks
    .map(normalizeHookDefinition)
    .filter((hook): hook is HookDefinition => !!hook)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getHook(
  hooks: HookDefinition[],
  id: string,
): HookDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return hooks.find(hook => hook.id === normalized);
}
