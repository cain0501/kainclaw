import type { HookDefinition } from "./hooksRegistry";

type ParsedHookCommand = {
  type?: "command" | "http" | "prompt" | "agent";
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  prompt?: string;
  model?: string;
  timeout?: number;
  async?: boolean;
};

type ParsedHookMatcher = {
  matcher?: string;
  hooks: ParsedHookCommand[];
};

type ParsedHookSettings = Record<string, ParsedHookMatcher[]>;

function countIndent(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (
    (trimmed.startsWith(`"`) && trimmed.endsWith(`"`)) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  return trimmed;
}

function parseBlockScalar(
  lines: string[],
  startIndex: number,
  parentIndent: number,
): { value: string; nextIndex: number } {
  const parts: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      parts.push("");
      index += 1;
      continue;
    }
    const indent = countIndent(line);
    if (indent <= parentIndent) {
      break;
    }
    parts.push(line.slice(parentIndent + 2));
    index += 1;
  }
  return {
    value: parts.join("\n").trimEnd(),
    nextIndex: index,
  };
}

function normalizeHooksBlockIndent(block: string): string[] {
  const rawLines = block.split(/\r?\n/);
  const nonEmpty = rawLines.filter(line => line.trim());
  if (nonEmpty.length === 0) {
    return [];
  }
  const minIndent = Math.min(...nonEmpty.map(countIndent));
  return rawLines.map(line => line.slice(Math.min(line.length, minIndent)));
}

function parseMatcher(
  lines: string[],
  startIndex: number,
): { matcher: ParsedHookMatcher | null; nextIndex: number } {
  const line = lines[startIndex]!;
  const indent = countIndent(line);
  const trimmed = line.trim();
  if (indent !== 2 || !trimmed.startsWith("-")) {
    return { matcher: null, nextIndex: startIndex + 1 };
  }

  const matcher: ParsedHookMatcher = { hooks: [] };
  let index = startIndex;
  const inline = trimmed.slice(1).trim();

  function parseHookList(fromIndex: number): number {
    let hookIndex = fromIndex;
    while (hookIndex < lines.length) {
      const hookLine = lines[hookIndex]!;
      const hookTrimmed = hookLine.trim();
      if (!hookTrimmed) {
        hookIndex += 1;
        continue;
      }
      const hookIndent = countIndent(hookLine);
      if (hookIndent <= 4) {
        break;
      }
      if (hookIndent !== 6 || !hookTrimmed.startsWith("-")) {
        hookIndex += 1;
        continue;
      }

      const hook: ParsedHookCommand = {};
      const inlineHook = hookTrimmed.slice(1).trim();
      hookIndex += 1;

      if (inlineHook) {
        const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(inlineHook);
          if (pair) {
            const key = pair[1]!;
            const value = pair[2]!;
            if (value === "|" || value === ">") {
              const parsed = parseBlockScalar(lines, hookIndex, 6);
              (hook as Record<string, unknown>)[key] = parsed.value;
              hookIndex = parsed.nextIndex;
            } else {
              const parsedValue = parseScalar(value);
              if (key === "type" && typeof parsedValue === "string") {
                hook.type = parsedValue as ParsedHookCommand["type"];
              } else {
                (hook as Record<string, unknown>)[key] = parsedValue;
              }
            }
          }
        }

      while (hookIndex < lines.length) {
        const fieldLine = lines[hookIndex]!;
        const fieldTrimmed = fieldLine.trim();
        if (!fieldTrimmed) {
          hookIndex += 1;
          continue;
        }
        const fieldIndent = countIndent(fieldLine);
        if (fieldIndent <= 6) {
          break;
        }
        if (fieldIndent !== 8) {
          hookIndex += 1;
          continue;
        }
        const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(fieldTrimmed);
        if (!pair) {
          hookIndex += 1;
          continue;
        }
        const key = pair[1]!;
        const value = pair[2]!;
        if (value === "|" || value === ">") {
          const parsed = parseBlockScalar(lines, hookIndex + 1, 8);
          (hook as Record<string, unknown>)[key] = parsed.value;
          hookIndex = parsed.nextIndex;
          continue;
        }
        if (!value) {
          const map: Record<string, string> = {};
          let nestedIndex = hookIndex + 1;
          while (nestedIndex < lines.length) {
            const nestedLine = lines[nestedIndex]!;
            const nestedTrimmed = nestedLine.trim();
            if (!nestedTrimmed) {
              nestedIndex += 1;
              continue;
            }
            const nestedIndent = countIndent(nestedLine);
            if (nestedIndent <= 8) {
              break;
            }
            if (nestedIndent === 10) {
              const nestedPair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(
                nestedTrimmed,
              );
              if (nestedPair) {
                map[nestedPair[1]!] = String(parseScalar(nestedPair[2]!));
              }
            }
            nestedIndex += 1;
          }
          (hook as Record<string, unknown>)[key] = map;
          hookIndex = nestedIndex;
          continue;
        }
        const parsedValue = parseScalar(value);
        if (key === "type" && typeof parsedValue === "string") {
          hook.type = parsedValue as ParsedHookCommand["type"];
        } else {
          (hook as Record<string, unknown>)[key] = parsedValue;
        }
        hookIndex += 1;
      }

      matcher.hooks.push(hook);
    }
    return hookIndex;
  }

  if (inline.startsWith("matcher:")) {
    matcher.matcher = String(parseScalar(inline.slice("matcher:".length)));
    index += 1;
  } else if (inline.startsWith("hooks:")) {
    index = parseHookList(startIndex + 1);
    return { matcher, nextIndex: index };
  } else if (!inline) {
    index += 1;
  } else {
    index += 1;
  }

  while (index < lines.length) {
    const current = lines[index]!;
    const currentTrimmed = current.trim();
    if (!currentTrimmed) {
      index += 1;
      continue;
    }
    const currentIndent = countIndent(current);
    if (currentIndent <= 2) {
      break;
    }
    if (currentIndent === 4 && currentTrimmed.startsWith("matcher:")) {
      matcher.matcher = String(
        parseScalar(currentTrimmed.slice("matcher:".length)),
      );
      index += 1;
      continue;
    }
    if (currentIndent === 4 && currentTrimmed.startsWith("hooks:")) {
      index = parseHookList(index + 1);
      continue;
    }
    index += 1;
  }

  return { matcher, nextIndex: index };
}

export function parseInstalledSkillHooksBlock(block: string): ParsedHookSettings {
  const lines = normalizeHooksBlockIndent(block);
  const settings: ParsedHookSettings = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    if (countIndent(line) !== 0) {
      index += 1;
      continue;
    }
    const eventMatch = /^([A-Za-z0-9_-]+):\s*$/.exec(trimmed);
    if (!eventMatch) {
      index += 1;
      continue;
    }
    const eventName = eventMatch[1]!;
    index += 1;
    const matchers: ParsedHookMatcher[] = [];

    while (index < lines.length) {
      const nextLine = lines[index]!;
      const nextTrimmed = nextLine.trim();
      if (!nextTrimmed) {
        index += 1;
        continue;
      }
      if (countIndent(nextLine) === 0) {
        break;
      }
      const parsed = parseMatcher(lines, index);
      if (parsed.matcher && parsed.matcher.hooks.length > 0) {
        matchers.push(parsed.matcher);
      }
      index = parsed.nextIndex;
    }

    if (matchers.length > 0) {
      settings[eventName] = matchers;
    }
  }

  return settings;
}

const EVENT_MAP = new Map<string, string>([
  ["UserPromptSubmit", "PrePrompt"],
  ["PreToolUse", "PreToolCall"],
  ["PostToolUse", "PostToolCall"],
  ["PostToolUseFailure", "PostToolCall"],
  ["Stop", "PostPrompt"],
  ["SubagentStop", "PostPrompt"],
]);

export function mapInstalledSkillHooksToDefinitions(options: {
  skillId: string;
  hooks: ParsedHookSettings;
}): HookDefinition[] {
  const definitions: HookDefinition[] = [];
  let hookIndex = 0;

  for (const [eventName, matchers] of Object.entries(options.hooks)) {
    const mappedEvent = EVENT_MAP.get(eventName);
    if (!mappedEvent) {
      continue;
    }

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        if (
          hook.type !== "command" &&
          hook.type !== "http" &&
          hook.type !== "prompt" &&
          hook.type !== "agent"
        ) {
          continue;
        }

        hookIndex += 1;
        const base: HookDefinition = {
          id: `${options.skillId}-${eventName}-${hookIndex}`.toLowerCase(),
          name: `${options.skillId}:${eventName}:${hookIndex}`,
          type: hook.type,
          description: `Installed skill hook from ${options.skillId} (${eventName})`,
          events: [mappedEvent],
          ...(matcher.matcher ? { matcher: matcher.matcher } : {}),
        };

        if (hook.type === "command" && hook.command) {
          definitions.push({
            ...base,
            command: hook.command,
            ...(typeof hook.timeout === "number"
              ? { timeoutMs: Math.max(0, hook.timeout * 1000) }
              : {}),
            blocking: hook.async !== true,
          });
          continue;
        }

        if (hook.type === "http" && hook.url) {
          definitions.push({
            ...base,
            url: hook.url,
            ...(typeof hook.method === "string"
              ? { method: hook.method.toUpperCase() }
              : {}),
            ...(hook.headers ? { headers: hook.headers } : {}),
            ...(typeof hook.timeout === "number"
              ? { timeoutMs: Math.max(0, hook.timeout * 1000) }
              : {}),
            blocking: false,
          });
          continue;
        }

        if (hook.type === "prompt" && hook.prompt) {
          definitions.push({
            ...base,
            prompt: hook.prompt,
            position: mappedEvent === "PrePrompt" ? "prefix" : "suffix",
          });
          continue;
        }

        if (hook.type === "agent" && hook.prompt) {
          definitions.push({
            ...base,
            agentPrompt: hook.prompt,
            ...(typeof hook.model === "string"
              ? { agentModel: hook.model }
              : {}),
            ...(typeof hook.timeout === "number"
              ? { timeoutMs: Math.max(0, hook.timeout * 1000) }
              : {}),
            blocking: true,
          });
        }
      }
    }
  }

  return definitions;
}
