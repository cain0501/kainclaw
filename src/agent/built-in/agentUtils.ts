import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolDefinition } from "../../toolRuntime";

const execFileAsync = promisify(execFile);

const DIFF_CONTENT_MAX_LENGTH = 8000;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const remoteDiffContentCache = new Map<string, Promise<string>>();

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`;
}

export function getLatestAssistantSummary(
  messages: ConversationMessage[],
  fallback: string,
  maxLength = 2500,
): string {
  const latestAssistant = [...messages]
    .reverse()
    .find(message => message.role === "assistant" && message.content.trim() !== "");

  if (!latestAssistant) {
    return fallback;
  }

  return truncate(latestAssistant.content.trim(), maxLength);
}

export async function getChangedFiles(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      {
        cwd: workspaceRoot,
        timeout: 10_000,
        windowsHide: true,
      },
    );

    return Array.from(
      new Set(
        stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => line.slice(3).trim()),
      ),
    );
  } catch {
    return [];
  }
}

export function getRecentTranscript(
  messages: ConversationMessage[],
  excludedCommands: string[],
  maxMessages = 8,
  maxLength = 1200,
): string {
  const excerpt = messages
    .filter(
      message =>
        !excludedCommands.some(command => message.content.trim().startsWith(command)),
    )
    .slice(-maxMessages)
    .map(message => `${message.role.toUpperCase()}: ${truncate(message.content.trim(), maxLength)}`)
    .join("\n\n");

  return excerpt || "[no recent transcript available]";
}

function parseDiffRefForCommand(
  commandText: string,
  commandPrefix: string,
): string | undefined {
  const trimmed = commandText.trim();
  if (!trimmed.startsWith(commandPrefix)) {
    return undefined;
  }

  const rest = trimmed.slice(commandPrefix.length).trim();
  if (!rest) {
    return undefined;
  }

  const [candidate, ...remainingTokens] = rest.split(/\s+/);
  if (!candidate) {
    return undefined;
  }

  if (looksLikeRemoteDiffUrl(candidate)) {
    if (!getRemoteDiffFetchUrl(candidate)) {
      return undefined;
    }
    return candidate;
  }

  // Git refs may contain: word chars, dots, slashes, dashes, tildes, carets,
  // colons, @, and curly braces, but never spaces.
  if (!/^[a-zA-Z0-9_./@{}\-~^:]+$/.test(candidate)) {
    return undefined;
  }

  if (remainingTokens.length === 0) {
    return candidate;
  }

  if (looksLikeExplicitDiffRef(candidate)) {
    return candidate;
  }

  return undefined;
}

function looksLikeExplicitDiffRef(candidate: string): boolean {
  return (
    candidate.includes("..") ||
    candidate.includes("~") ||
    candidate.includes("^") ||
    candidate.includes("/") ||
    candidate.includes(":") ||
    candidate.includes("@{") ||
    /^[0-9a-f]{7,40}$/i.test(candidate) ||
    /^v?\d+(?:\.\d+){1,}$/.test(candidate)
  );
}

export function parseReviewDiffRef(commandText: string): string | undefined {
  if (parseReviewPrNumber(commandText)) {
    return undefined;
  }

  return parseDiffRefForCommand(commandText, "/review");
}

export function parseVerificationDiffRef(commandText: string): string | undefined {
  return parseDiffRefForCommand(commandText, "/verify");
}

export function parseReviewPrNumber(commandText: string): string | undefined {
  const trimmed = commandText.trim();
  if (!trimmed.startsWith("/review")) {
    return undefined;
  }

  const rest = trimmed.slice("/review".length).trim();
  if (!rest) {
    return undefined;
  }

  const [candidate] = rest.split(/\s+/);
  return /^\d+$/.test(candidate ?? "") ? candidate : undefined;
}

function looksLikeRemoteDiffUrl(candidate: string): boolean {
  return candidate.startsWith("https://") || candidate.startsWith("http://");
}

function getRemoteDiffFetchUrl(diffRef: string): string | undefined {
  let url: URL;
  try {
    url = new URL(diffRef);
  } catch {
    return undefined;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    return undefined;
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith(".diff")) {
    return `${url.origin}${pathname}`;
  }

  const pullMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/files)?$/);
  if (pullMatch) {
    return `${url.origin}/${pullMatch[1]}/${pullMatch[2]}/pull/${pullMatch[3]}.diff`;
  }

  const compareMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/compare\/(.+)$/);
  if (compareMatch) {
    return `${url.origin}/${compareMatch[1]}/${compareMatch[2]}/compare/${compareMatch[3]}.diff`;
  }

  return undefined;
}

async function fetchRemoteDiffContent(diffRef: string): Promise<string> {
  const fetchUrl = getRemoteDiffFetchUrl(diffRef);
  if (!fetchUrl) {
    return "";
  }

  let pending = remoteDiffContentCache.get(fetchUrl);
  if (!pending) {
    pending = fetch(fetchUrl, {
      headers: {
        Accept: "text/x-diff, text/plain;q=0.9, */*;q=0.1",
      },
    })
      .then(async response => {
        if (!response.ok) {
          return "";
        }
        return (await response.text()).trim();
      })
      .catch(() => "");
    remoteDiffContentCache.set(fetchUrl, pending);
  }

  return pending;
}

function parseChangedFilesFromUnifiedDiff(diffContent: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const line of diffContent.split(/\r?\n/)) {
    if (!line.startsWith("diff --git a/")) {
      continue;
    }

    const remainder = line.slice("diff --git a/".length);
    const separatorIndex = remainder.indexOf(" b/");
    if (separatorIndex === -1) {
      continue;
    }

    const nextPath = remainder.slice(separatorIndex + 3).trim().replace(/^"|"$/g, "");
    if (!nextPath || seen.has(nextPath)) {
      continue;
    }

    seen.add(nextPath);
    files.push(nextPath);
  }

  return files;
}

export async function getChangedFilesFromDiff(
  workspaceRoot: string,
  diffRef: string,
): Promise<string[]> {
  if (looksLikeRemoteDiffUrl(diffRef)) {
    return parseChangedFilesFromUnifiedDiff(await fetchRemoteDiffContent(diffRef));
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", diffRef],
      {
        cwd: workspaceRoot,
        timeout: 10_000,
        windowsHide: true,
      },
    );

    return Array.from(
      new Set(
        stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

export async function getDiffContent(
  workspaceRoot: string,
  diffRef: string,
  maxLength = DIFF_CONTENT_MAX_LENGTH,
): Promise<string> {
  if (looksLikeRemoteDiffUrl(diffRef)) {
    return truncate(await fetchRemoteDiffContent(diffRef), maxLength);
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-color", "--stat", "-p", diffRef],
      {
        cwd: workspaceRoot,
        timeout: 15_000,
        windowsHide: true,
      },
    );

    const content = stdout.trim();
    return truncate(content, maxLength);
  } catch {
    return "";
  }
}

export function getReadOnlyAgentTools(
  tools: ToolDefinition[],
  disallowedTools: string[] | undefined,
): ToolDefinition[] {
  const blockedToolNames = new Set(disallowedTools ?? []);

  return tools.filter(tool => {
    if (blockedToolNames.has(tool.name)) {
      return false;
    }
    if (tool.annotations?.destructiveHint) {
      return false;
    }
    if (tool.name.startsWith("mcp__") && tool.annotations?.readOnlyHint !== true) {
      return false;
    }
    return true;
  });
}

export function getReadOnlyAgentToolContext(context: ToolContext): ToolContext {
  return {
    ...context,
    requestFileApproval: undefined,
    requestToolApproval: undefined,
    verificationMode: { active: true },
  };
}
