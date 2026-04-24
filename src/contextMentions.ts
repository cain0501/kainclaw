import { promises as fs } from "node:fs";
import path from "node:path";

const FILE_MENTION_LIMIT = 3;
const FILE_MENTION_CONTENT_LIMIT = 4000;

function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }

  return absolutePath;
}

function normalizeMentionToken(token: string): string {
  return token.replace(/[),.;:!?]+$/g, "").trim();
}

function toSafeMentionPath(workspaceRoot: string, targetPath: string): string | null {
  try {
    const absolutePath = resolveWorkspacePath(workspaceRoot, targetPath);
    return path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

export function extractPromptFileMentions(prompt: string): string[] {
  const matches = prompt.match(/(^|\s)@([^\s]+)/g) ?? [];
  const mentions = matches
    .map(match => normalizeMentionToken(match.trim().slice(1)))
    .filter(Boolean);

  return Array.from(new Set(mentions));
}

function truncateContent(content: string): string {
  if (content.length <= FILE_MENTION_CONTENT_LIMIT) {
    return content;
  }

  return `${content.slice(0, FILE_MENTION_CONTENT_LIMIT)}\n\n[truncated ${content.length - FILE_MENTION_CONTENT_LIMIT} chars]`;
}

export async function buildPromptFileMentionContext(options: {
  prompt: string;
  workspaceRoot: string;
}): Promise<{
  resolvedFiles: string[];
  supplementalPrompt?: string;
}> {
  const mentionPaths = extractPromptFileMentions(options.prompt)
    .map(mention => toSafeMentionPath(options.workspaceRoot, mention))
    .filter((mention): mention is string => !!mention)
    .slice(0, FILE_MENTION_LIMIT);

  const resolvedFiles: string[] = [];
  const sections: string[] = [];

  for (const relativePath of mentionPaths) {
    const absolutePath = path.join(options.workspaceRoot, relativePath);
    const stat = await fs.stat(absolutePath).catch(() => undefined);
    if (!stat?.isFile()) {
      continue;
    }

    const content = await fs.readFile(absolutePath, "utf8").catch(() => undefined);
    if (typeof content !== "string") {
      continue;
    }

    resolvedFiles.push(relativePath);
    sections.push(
      `## ${relativePath}\n\`\`\`text\n${truncateContent(content).trimEnd()}\n\`\`\``,
    );
  }

  if (sections.length === 0) {
    return { resolvedFiles: [] };
  }

  return {
    resolvedFiles,
    supplementalPrompt: [
      "The user explicitly referenced these workspace files in the current message. Treat them as high-priority context for this turn.",
      ...sections,
    ].join("\n\n"),
  };
}
