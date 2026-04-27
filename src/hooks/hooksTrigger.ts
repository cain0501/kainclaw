import type { HookDefinition } from "../hooksRegistry";
import { type AgentRunner, type HookContext, type HookEvent, type HookResult, executeHook } from "./hooksExecutor";

export interface TriggerResult {
  promptPrefixInjection?: string;
  promptSuffixInjection?: string;
  blocked?: boolean;
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

function resolveMatchQuery(
  event: HookEvent,
  context: Omit<HookContext, "event">,
): string | undefined {
  switch (event) {
    case "PreToolCall":
    case "PostToolCall":
      return context.toolName;
    default:
      return undefined;
  }
}

export async function triggerHooks(
  event: HookEvent,
  hooks: HookDefinition[],
  context: Omit<HookContext, "event">,
  agentRunner?: AgentRunner,
): Promise<TriggerResult> {
  const matchQuery = resolveMatchQuery(event, context);
  const matching = hooks.filter(h => {
    if (!h.events.includes(event)) {
      return false;
    }
    if (!matchQuery || !h.matcher?.trim()) {
      return true;
    }
    return matchesPattern(matchQuery, h.matcher.trim());
  });
  if (matching.length === 0) {
    return {};
  }

  const fullContext: HookContext = { event, ...context };
  const prefixParts: string[] = [];
  const suffixParts: string[] = [];
  let blocked = false;

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
