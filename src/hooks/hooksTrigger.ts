import type { HookDefinition } from "../hooksRegistry";
import { type AgentRunner, type HookContext, type HookEvent, type HookResult, executeHook } from "./hooksExecutor";

export interface TriggerResult {
  promptPrefixInjection?: string;
  promptSuffixInjection?: string;
  blocked?: boolean;
  blockedMessage?: string;
  askMessage?: string;
}

function matchesPattern(matchQuery: string, matcher: string): boolean {
  if (!matcher || matcher === "*") {
    return true;
  }

  if (/^[a-zA-Z0-9_|-]+$/.test(matcher)) {
    if (matcher.includes("|")) {
      return matcher
        .split("|")
        .map(part => part.trim())
        .filter(Boolean)
        .includes(matchQuery);
    }
    return matchQuery === matcher.trim();
  }

  try {
    return new RegExp(matcher).test(matchQuery);
  } catch {
    return false;
  }
}

function getToolMatcherCandidates(toolName: string | undefined): string[] {
  if (!toolName) {
    return [];
  }

  const candidates = [toolName];
  const compatAliasMap = new Map<string, string>([
    ["run_command", "Bash"],
    ["write_file", "Write"],
    ["replace_in_file", "Edit"],
    ["read_file", "Read"],
    ["glob_files", "Glob"],
    ["search_files", "Grep"],
  ]);
  const alias = compatAliasMap.get(toolName);
  if (alias) {
    candidates.push(alias);
  }

  return candidates;
}

function resolveMatchQuery(
  event: HookEvent,
  context: Omit<HookContext, "event">,
): string[] {
  switch (event) {
    case "PreToolCall":
    case "PostToolCall":
    case "PreToolUse":
    case "PostToolUse":
      return getToolMatcherCandidates(context.toolName);
    case "Notification":
      return context.reply ? [context.reply] : [];
    case "SessionStart":
      return context.workspaceRoot ? [context.workspaceRoot] : [];
    default:
      return [];
  }
}

export async function triggerHooks(
  event: HookEvent,
  hooks: HookDefinition[],
  context: Omit<HookContext, "event">,
  agentRunner?: AgentRunner,
): Promise<TriggerResult> {
  const eventAliases: Record<HookEvent, HookEvent[]> = {
    PreToolCall: ["PreToolCall", "PreToolUse"],
    PostToolCall: ["PostToolCall", "PostToolUse"],
    PreToolUse: ["PreToolUse", "PreToolCall"],
    PostToolUse: ["PostToolUse", "PostToolCall"],
    PrePrompt: ["PrePrompt"],
    PostPrompt: ["PostPrompt"],
    Notification: ["Notification"],
    SessionStart: ["SessionStart"],
    UserPromptSubmit: ["UserPromptSubmit"],
    Stop: ["Stop"],
    SessionEnd: ["SessionEnd"],
    PostToolUseFailure: ["PostToolUseFailure"],
    PreCompact: ["PreCompact"],
    PostCompact: ["PostCompact"],
    SubagentStart: ["SubagentStart"],
    SubagentStop: ["SubagentStop"],
    TaskCreated: ["TaskCreated"],
    TaskCompleted: ["TaskCompleted"],
    WorktreeCreate: ["WorktreeCreate"],
    WorktreeRemove: ["WorktreeRemove"],
  };
  const matchQueries = resolveMatchQuery(event, context);
  const matching = hooks.filter(h => {
    const acceptedEvents = eventAliases[event] ?? [event];
    if (!h.events.some(hookEvent => acceptedEvents.includes(hookEvent as HookEvent))) {
      return false;
    }
    if (matchQueries.length === 0 || !h.matcher?.trim()) {
      return true;
    }
    return matchQueries.some(matchQuery =>
      matchesPattern(matchQuery, h.matcher!.trim()),
    );
  });
  if (matching.length === 0) {
    return {};
  }

  const fullContext: HookContext = { event, ...context };
  const prefixParts: string[] = [];
  const suffixParts: string[] = [];
  let blocked = false;
  let blockedMessage: string | undefined;
  let askMessage: string | undefined;

  for (const hook of matching) {
    let result: HookResult;
    try {
      result = await executeHook(hook, fullContext, agentRunner);
    } catch {
      result = { blocked: false };
    }

    if (result.injected) {
      if (result.position === "prefix") {
        prefixParts.push(result.injected);
      } else {
        suffixParts.push(result.injected);
      }
    }

    if (result.blocked) {
      blocked = true;
      blockedMessage = result.blockedMessage;
      break;
    }

    if (result.askMessage) {
      askMessage = result.askMessage;
      break;
    }
  }

  return {
    ...(prefixParts.length > 0
      ? { promptPrefixInjection: prefixParts.join("\n\n") }
      : {}),
    ...(suffixParts.length > 0
      ? { promptSuffixInjection: suffixParts.join("\n\n") }
      : {}),
    ...(blocked ? { blocked: true } : {}),
    ...(blockedMessage ? { blockedMessage } : {}),
    ...(askMessage ? { askMessage } : {}),
  };
}

export function buildInjectedPrompt(
  original: string,
  injection: string | undefined,
  position: "prefix" | "suffix" = "suffix",
): string {
  if (!injection) {
    return original;
  }
  return position === "prefix"
    ? `${injection}\n\n${original}`
    : `${original}\n\n${injection}`;
}
