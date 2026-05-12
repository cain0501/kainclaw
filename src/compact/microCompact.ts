import type { NormalizedMessage } from "../agent/providers/IProviderAdapter";
import { estimateMessageTokens } from "./tokenBudget";

export const MICRO_COMPACT_CLEARED_MESSAGE = "[Old tool result content cleared]";
export const MICRO_COMPACT_TRIGGER_BUFFER_TOKENS = 30_000;

const KEEP_RECENT_TOOL_RESULTS = 5;
const COMPACTABLE_TOOL_NAMES = new Set([
  "run_command",
  "read_file",
  "write_file",
  "replace_in_file",
  "glob_files",
  "search_files",
  "WebFetch",
  "WebSearch",
  "fetch_url",
  "read",
  "write",
  "edit",
  "multiedit",
]);

export type MicroCompactResult = {
  messages: NormalizedMessage[];
  tokensSaved: number;
  toolsCleared: number;
};

function collectCompactableToolIds(messages: NormalizedMessage[]): string[] {
  const compactableIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      continue;
    }

    for (const toolCall of message.toolCalls) {
      if (COMPACTABLE_TOOL_NAMES.has(toolCall.name)) {
        compactableIds.add(toolCall.id);
      }
    }
  }

  const ids: string[] = [];
  for (const message of messages) {
    if (
      message.role === "tool_result" &&
      compactableIds.has(message.toolCallId) &&
      message.content !== MICRO_COMPACT_CLEARED_MESSAGE
    ) {
      ids.push(message.toolCallId);
    }
  }
  return ids;
}

function estimateToolResultTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export function microCompactMessages(
  messages: NormalizedMessage[],
): MicroCompactResult | null {
  const compactableIds = collectCompactableToolIds(messages);
  if (compactableIds.length <= KEEP_RECENT_TOOL_RESULTS) {
    return null;
  }

  const keepSet = new Set(compactableIds.slice(-KEEP_RECENT_TOOL_RESULTS));
  const clearSet = new Set(
    compactableIds.filter(toolCallId => !keepSet.has(toolCallId)),
  );
  if (clearSet.size === 0) {
    return null;
  }

  let tokensSaved = 0;
  let toolsCleared = 0;

  const result = messages.map(message => {
    if (
      message.role === "tool_result" &&
      clearSet.has(message.toolCallId) &&
      message.content !== MICRO_COMPACT_CLEARED_MESSAGE
    ) {
      tokensSaved += estimateToolResultTokens(message.content);
      toolsCleared += 1;
      return {
        ...message,
        content: MICRO_COMPACT_CLEARED_MESSAGE,
      } satisfies NormalizedMessage;
    }
    return message;
  });

  if (toolsCleared === 0) {
    return null;
  }

  return {
    messages: result,
    tokensSaved,
    toolsCleared,
  };
}

export function shouldMicroCompact(
  messages: NormalizedMessage[],
  autoCompactThresholdTokens: number,
): boolean {
  const currentTokens = estimateMessageTokens(messages);
  const microCompactThreshold =
    autoCompactThresholdTokens - MICRO_COMPACT_TRIGGER_BUFFER_TOKENS;
  return currentTokens >= microCompactThreshold;
}

export function resetMicrocompactState(): void {
  // The current KainClaw micro-compact flow has no module-level mutable state.
  // Keep this reset hook as the canonical post-compact cleanup entrypoint.
}
