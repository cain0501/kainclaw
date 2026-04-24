import type { HookDefinition } from "../hooksRegistry";
import { type AgentRunner, type HookContext, type HookEvent, type HookResult, executeHook } from "./hooksExecutor";

export interface TriggerResult {
  promptInjection?: string;
}

export async function triggerHooks(
  event: HookEvent,
  hooks: HookDefinition[],
  context: Omit<HookContext, "event">,
  agentRunner?: AgentRunner,
): Promise<TriggerResult> {
  const matching = hooks.filter(h => h.events.includes(event));
  if (matching.length === 0) {
    return {};
  }

  const fullContext: HookContext = { event, ...context };
  const injectedParts: string[] = [];

  for (const hook of matching) {
    let result: HookResult;
    try {
      result = await executeHook(hook, fullContext, agentRunner);
    } catch {
      result = { blocked: false };
    }

    if (result.injected) {
      injectedParts.push(result.injected);
    }

    if (result.blocked) {
      break;
    }
  }

  if (injectedParts.length === 0) {
    return {};
  }

  return { promptInjection: injectedParts.join("\n\n") };
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
