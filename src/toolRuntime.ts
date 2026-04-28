import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createPatch } from "diff";
import { normalizeHttpUrl } from "./browserRuntime";
import {
  buildInstalledSkillExecutionPlan,
  getInstalledSkill,
} from "./installedSkillsRegistry";
import { loadModelInvocableInstalledSkills } from "./installedSkillModelRegistry";
import { isPlanWritablePath } from "./planMode/planMode";
import type { LspToolAdapter } from "./lsp/lspRuntime";
import { LSP_TOOL_NAME, normalizeLspOperation } from "./lsp/types";
import type { HookDefinition } from "./hooksRegistry";
import type { EffortLevel } from "./thinkingEffort/types";
import type {
  BackgroundTaskRecord,
  BackgroundTaskStatus,
  ConversationTaskRuntime,
  TaskRecord,
  TaskStatus,
} from "./tasks/types";
import {
  assertTaskDependencyMutationsAreValid,
  isBackgroundTaskLostAfterRestart,
} from "./tasks/taskRuntime";
import type {
  ConversationWorktreeRuntime,
  ExitWorktreeResult,
} from "./worktree/types";
import type { SkillStore } from "./skills/skillStore";

const execFileAsync = promisify(execFile);

const DIRECTORY_SKIP_SET = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
]);

const WALK_FILES_LIMIT = 10_000;
const SEARCH_MATCH_LIMIT = 2_000;
const SEARCH_MATCH_DISPLAY_LIMIT = 200;
const TOOL_SEARCH_RESULT_LIMIT = 20;
const MAX_WEB_TOOL_CONTENT_LENGTH = 100_000;
const WEB_TOOL_TIMEOUT_MS = 60_000;
const WEB_TOOL_REDIRECT_LIMIT = 10;
const WEB_SEARCH_RESULT_LIMIT = 8;
const WEB_TOOL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const BASE_READ_ONLY_COMMAND_PREFIXES = [
  "Get-ChildItem",
  "dir",
  "ls",
  "pwd",
  "Get-Location",
  "Get-Content",
  "type",
  "rg ",
  "rg.exe ",
  "Select-String",
  "git status",
  "git diff",
  "git log",
  "git branch",
  "git show",
  "gh pr list",
  "gh pr view",
  "gh pr diff",
  "node -v",
  "npm -v",
];

const ALLOWED_COMMAND_PREFIXES = [
  ...BASE_READ_ONLY_COMMAND_PREFIXES,
  "git add",
  "git commit -m",
  "git stash",
  "git push",
  "npm run ",
  "npm test",
  "npm install",
  "npx tsc",
  "tsc",
];

const PLAN_MODE_READ_ONLY_COMMAND_PREFIXES = [...BASE_READ_ONLY_COMMAND_PREFIXES];

const VERIFICATION_ALLOWED_COMMAND_PREFIXES = [
  ...BASE_READ_ONLY_COMMAND_PREFIXES,
  "npm run ",
  "npm test",
  "npx tsc",
  "tsc",
  "npx eslint",
  "eslint ",
  "npx vitest",
  "vitest ",
  "npx jest",
  "jest ",
  "python --version",
  "python -V",
  "python -m pytest",
  "pytest ",
  "python -m mypy",
  "mypy ",
  "python -m ruff",
  "ruff ",
  "go test",
  "cargo test",
  "cargo check",
  "dotnet test",
  "dotnet build",
  "mvn test",
  "mvn -q test",
  "gradlew test",
  ".\\gradlew test",
  "./gradlew test",
  "make test",
  "make build",
];

const SAFE_PIPE_SEGMENT_PREFIXES = [
  "Sort-Object",
  "Select-Object",
  "Format-Table",
  "Format-List",
  "Measure-Object",
  "Where-Object",
];

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\berase\b/i,
  /\brmdir\b/i,
  /\bRemove-Item\b/i,
  /\bMove-Item\b/i,
  /\bCopy-Item\b/i,
  /\bSet-Content\b/i,
  /\bAdd-Content\b/i,
  /\bOut-File\b/i,
  /\bNew-Item\b/i,
  /\bRename-Item\b/i,
  /\bgit\s+(reset|checkout|switch|merge|rebase|cherry-pick|pull)\b/i,
  />/,
];

export type ToolInput = Record<string, unknown>;

export type ToolExecutionResult = {
  summary: string;
  content: string;
  allowedToolNames?: string[];
  installedSkillHooks?: HookDefinition[];
  modelOverride?: string;
  effortOverride?: EffortLevel;
  forkedSkillRunRequest?: {
    skillId: string;
    prompt: string;
    allowedToolNames?: string[];
    installedSkillHooks?: HookDefinition[];
    modelOverride?: string;
    effortOverride?: EffortLevel;
  };
};

export function buildUtf8PowerShellEncodedCommand(command: string): string {
  const script = [
    "$utf8 = [System.Text.UTF8Encoding]::new($false)",
    "[Console]::InputEncoding = $utf8",
    "[Console]::OutputEncoding = $utf8",
    "$OutputEncoding = $utf8",
    "$ProgressPreference = 'SilentlyContinue'",
    command,
  ].join("\n");

  return Buffer.from(script, "utf16le").toString("base64");
}

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string; items?: unknown; enum?: unknown[]; properties?: unknown }>;
    required?: string[];
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  aliases?: string[];
};

export function dedupeToolDefinitionsByName<T extends { name: string }>(
  tools: readonly T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    deduped.push(tool);
  }

  return deduped;
}

export type WriteApprovalRequest = {
  kind: "write_file" | "replace_in_file";
  path: string;
  workspaceRoot?: string;
  summary: string;
  diff: string;
  originalContent: string;
  proposedContent: string;
};

export type ToolActionApprovalRequest = {
  kind: "tool_action";
  toolName: string;
  title?: string;
  summary: string;
  inputPreview: string;
};

export type ToolLifecycleEvent = {
  executionId: string;
  phase: "start" | "finish";
  toolName: string;
  input?: ToolInput;
  summary?: string;
  outcome?: "success" | "error";
  error?: string;
};

export type BrowserToolAdapter = {
  navigate(url: string): Promise<ToolExecutionResult>;
  snapshot(maxLength?: number): Promise<ToolExecutionResult>;
  click(input: { ref?: string; selector?: string; text?: string }): Promise<ToolExecutionResult>;
  type(input: {
    ref?: string;
    selector?: string;
    textTarget?: string;
    value: string;
    submit?: boolean;
  }): Promise<ToolExecutionResult>;
  waitFor(input: { text?: string; timeMs?: number }): Promise<ToolExecutionResult>;
  screenshot(input: { path?: string; fullPage?: boolean }): Promise<ToolExecutionResult>;
  close(): Promise<ToolExecutionResult>;
};

export type McpToolAdapter = {
  getToolDefinitions(): Promise<ToolDefinition[]>;
  executeTool(name: string, input: ToolInput, context: ToolContext): Promise<ToolExecutionResult>;
  listResources(serverName?: string): Promise<ToolExecutionResult>;
  readResource(serverName: string, uri: string): Promise<ToolExecutionResult>;
};

export type PlanModeToolAdapter = {
  active: boolean;
  planFilePath?: string;
  enter(): Promise<{ planFilePath: string; planContent: string }>;
  getPlanContent(): Promise<string | null>;
  exit(): Promise<{ planFilePath: string; planContent: string }>;
};

export type PlanVerificationToolAdapter = {
  pending: boolean;
  planFilePath?: string;
  verificationStarted: boolean;
  verificationCompleted: boolean;
};

export type ToolContext = {
  workspaceRoot: string;
  invokerKind?: "main" | "worker";
  abortSignal?: AbortSignal;
  extractWebContent?: (request: {
    url: string;
    prompt: string;
    content: string;
    contentType: string;
    preapproved: boolean;
    abortSignal?: AbortSignal;
  }) => Promise<string>;
  runVerification?: (request: {
    extraGuidance?: string;
    diffRef?: string;
  }) => Promise<{ taskId: string; verdict: "PASS" | "FAIL" | "PARTIAL"; report: string }>;
  runReview?: (request: {
    extraGuidance?: string;
    diffRef?: string;
  }) => Promise<{ taskId: string; report: string }>;
  runCommandInBackground?: (request: {
    command: string;
  }) => Promise<{ taskId: string; command: string; workspaceRoot: string; outputPath?: string; alreadyRunning?: boolean }>;
  findReusableBackgroundCommand?: (request: {
    command: string;
  }) => Promise<{ taskId: string; command: string; workspaceRoot: string; outputPath?: string } | null>;
  requestFileApproval?: (request: WriteApprovalRequest) => Promise<boolean>;
  requestToolApproval?: (request: ToolActionApprovalRequest) => Promise<boolean>;
  onToolLifecycle?: (event: ToolLifecycleEvent) => void;
  browser?: BrowserToolAdapter;
  mcp?: McpToolAdapter;
  lsp?: LspToolAdapter;
  tasks?: ConversationTaskRuntime;
  worktree?: ConversationWorktreeRuntime;
  stopBackgroundTask?: (
    taskId: string,
  ) => Promise<{ taskId: string; taskType: string; command: string }>;
  planMode?: PlanModeToolAdapter;
  planVerification?: PlanVerificationToolAdapter;
  verificationMode?: {
    active: boolean;
  };
  skillStore?: SkillStore;
  getSessionInstalledSkillHooks?: () => HookDefinition[];
  registerSessionInstalledSkillHooks?: (
    hooks: HookDefinition[],
  ) => HookDefinition[];
};

type ToolHandler = (input: ToolInput, context: ToolContext) => Promise<ToolExecutionResult>;

export function commandStartsWithAllowedPrefix(
  command: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(prefix => command.startsWith(prefix));
}

export function isSafeReadOnlyPipeline(
  command: string,
  leadingPrefixes: readonly string[],
): boolean {
  if (!command.includes("|")) {
    return true;
  }

  const segments = command
    .split("|")
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return false;
  }

  if (!commandStartsWithAllowedPrefix(segments[0], leadingPrefixes)) {
    return false;
  }

  return segments
    .slice(1)
    .every(segment => commandStartsWithAllowedPrefix(segment, SAFE_PIPE_SEGMENT_PREFIXES));
}

export function assertSafeShellCommand(
  command: string,
  leadingPrefixes: readonly string[],
): void {
  if (BLOCKED_COMMAND_PATTERNS.some(pattern => pattern.test(command))) {
    throw new Error(`Blocked potentially destructive command: ${command}`);
  }

  if (command.includes("|") && !isSafeReadOnlyPipeline(command, leadingPrefixes)) {
    throw new Error(`Blocked potentially destructive command: ${command}`);
  }
}

export function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        regexStr += "(.+/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regexStr += "[^/]*";
      i += 1;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i += 1;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      regexStr += `\\${ch}`;
      i += 1;
    } else {
      regexStr += ch;
      i += 1;
    }
  }

  return new RegExp(`^${regexStr}$`, "i");
}

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }

  return absolutePath;
}

async function walkFiles(
  rootPath: string,
  currentPath = rootPath,
  state: { count: number } = { count: 0 },
): Promise<string[]> {
  const entries = (await fs.readdir(currentPath, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const filePaths: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && DIRECTORY_SKIP_SET.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await walkFiles(rootPath, fullPath, state)));
      if (state.count > WALK_FILES_LIMIT) {
        throw new Error(
          `Refusing to scan more than ${WALK_FILES_LIMIT} files under ${path.relative(rootPath, currentPath) || "."}. Narrow the path before listing files.`,
        );
      }
      continue;
    }

    filePaths.push(fullPath);
    state.count += 1;
    if (state.count > WALK_FILES_LIMIT) {
      throw new Error(
        `Refusing to scan more than ${WALK_FILES_LIMIT} files under ${path.relative(rootPath, currentPath) || "."}. Narrow the path before listing files.`,
      );
    }
  }

  return filePaths;
}

export function formatRelativePaths(workspaceRoot: string, filePaths: string[]): string {
  return filePaths.map(filePath => path.relative(workspaceRoot, filePath) || ".").join("\n");
}

export function toSafeText(value: string, maxLength = 12000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[truncated ${value.length - maxLength} chars]`;
}

export function stripAnsiEscapeCodes(value: string): string {
  return value.replace(
    // Covers CSI, OSC, and a few single-character escape forms commonly emitted by CLIs.
    /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g,
    "",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseToolNameForSearch(name: string): {
  parts: string[];
  full: string;
  isMcp: boolean;
} {
  if (name.startsWith("mcp__")) {
    const withoutPrefix = name.replace(/^mcp__/, "").toLowerCase();
    const parts = withoutPrefix.split("__").flatMap(part => part.split("_"));
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, " ").replace(/_/g, " "),
      isMcp: true,
    };
  }

  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return {
    parts,
    full: parts.join(" "),
    isMcp: false,
  };
}

function compileSearchTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>();
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`));
    }
  }
  return patterns;
}

function toolMatchesSearchTerm(
  tool: ToolDefinition,
  term: string,
  pattern: RegExp,
): boolean {
  const parsedNames = [tool.name, ...(tool.aliases ?? [])].map(parseToolNameForSearch);
  const description = tool.description.toLowerCase();
  const title = tool.annotations?.title?.toLowerCase() ?? "";

  return (
    parsedNames.some(parsedName =>
      parsedName.parts.includes(term) ||
      parsedName.parts.some(part => part.includes(term)) ||
      parsedName.full.includes(term),
    ) ||
    pattern.test(description) ||
    (!!title && pattern.test(title))
  );
}

function toolNameMatches(tool: ToolDefinition, normalizedName: string): boolean {
  return [tool.name, ...(tool.aliases ?? [])].some(
    candidate => candidate.toLowerCase() === normalizedName,
  );
}

const TOOL_NAME_ALIASES = new Map<string, string>([
  ["KillShell", "TaskStop"],
  ["AgentOutputTool", "TaskOutput"],
  ["BashOutputTool", "TaskOutput"],
]);

function normalizeToolName(name: string): string {
  return TOOL_NAME_ALIASES.get(name) ?? name;
}

export function searchToolDefinitions(
  tools: ToolDefinition[],
  query: string,
  maxResults = TOOL_SEARCH_RESULT_LIMIT,
): ToolDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  const limitedResults = Math.max(1, Math.floor(maxResults));

  if (!normalizedQuery) {
    return [...tools]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limitedResults);
  }

  const selectMatch = normalizedQuery.match(/^select:(.+)$/i);
  if (selectMatch) {
    const selectedTools: ToolDefinition[] = [];
    for (const requestedName of selectMatch[1]!
      .split(",")
      .map(name => name.trim())
      .filter(Boolean)) {
      const tool = tools.find(candidate => toolNameMatches(candidate, requestedName));
      if (tool && !selectedTools.some(selected => selected.name === tool.name)) {
        selectedTools.push(tool);
      }
    }
    return selectedTools.slice(0, limitedResults);
  }

  const exactMatch = tools.find(tool => toolNameMatches(tool, normalizedQuery));
  if (exactMatch) {
    return [exactMatch];
  }

  if (normalizedQuery.startsWith("mcp__") && normalizedQuery.length > 5) {
    const prefixMatches = tools
      .filter(tool => tool.name.toLowerCase().startsWith(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limitedResults);
    if (prefixMatches.length > 0) {
      return prefixMatches;
    }
  }

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  const requiredTerms: string[] = [];
  const optionalTerms: string[] = [];
  for (const term of queryTerms) {
    if (term.startsWith("+") && term.length > 1) {
      requiredTerms.push(term.slice(1));
    } else {
      optionalTerms.push(term);
    }
  }

  const scoringTerms = requiredTerms.length > 0
    ? [...requiredTerms, ...optionalTerms]
    : queryTerms;
  const termPatterns = compileSearchTermPatterns(scoringTerms);

  const candidateTools = requiredTerms.length === 0
    ? tools
    : tools.filter(tool =>
        requiredTerms.every(term =>
          toolMatchesSearchTerm(tool, term, termPatterns.get(term)!),
        ),
      );

  const ranked = candidateTools
    .map(tool => {
      const parsedName = parseToolNameForSearch(tool.name);
      const title = tool.annotations?.title?.toLowerCase() ?? "";
      const description = tool.description.toLowerCase();
      let score = 0;

      for (const term of scoringTerms) {
        const pattern = termPatterns.get(term)!;

        if (parsedName.parts.includes(term)) {
          score += parsedName.isMcp ? 12 : 10;
        } else if (parsedName.parts.some(part => part.includes(term))) {
          score += parsedName.isMcp ? 6 : 5;
        }

        if (parsedName.full.includes(term) && score === 0) {
          score += 3;
        }

        if (title && pattern.test(title)) {
          score += 4;
        }

        if (pattern.test(description)) {
          score += 2;
        }
      }

      return { tool, score };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.tool.name.localeCompare(right.tool.name);
    });

  return ranked.slice(0, limitedResults).map(entry => entry.tool);
}

export function formatToolSearchResults(
  tools: ToolDefinition[],
  query: string,
): string {
  if (tools.length === 0) {
    return query.trim()
      ? `No tools matched "${query.trim()}".`
      : "No tools are currently available.";
  }

  const heading = query.trim()
    ? `Tools matching "${query.trim()}":`
    : "Available tools:";

  return [
    heading,
    ...tools.map(tool => {
      const flags = [
        tool.annotations?.readOnlyHint ? "read-only" : "",
        tool.annotations?.destructiveHint ? "destructive" : "",
      ].filter(Boolean);
      const suffix = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      return `- \`${tool.name}\`${suffix}: ${tool.description}`;
    }),
  ].join("\n");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeFetchedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WEB_FETCH_PREAPPROVED_HOSTS = new Set([
  "platform.claude.com",
  "code.claude.com",
  "modelcontextprotocol.io",
  "github.com/anthropics",
  "agentskills.io",
  "docs.python.org",
  "en.cppreference.com",
  "docs.oracle.com",
  "learn.microsoft.com",
  "developer.mozilla.org",
  "go.dev",
  "pkg.go.dev",
  "www.php.net",
  "docs.swift.org",
  "kotlinlang.org",
  "ruby-doc.org",
  "doc.rust-lang.org",
  "www.typescriptlang.org",
  "react.dev",
  "angular.io",
  "vuejs.org",
  "nextjs.org",
  "expressjs.com",
  "nodejs.org",
  "bun.sh",
  "jquery.com",
  "getbootstrap.com",
  "tailwindcss.com",
  "d3js.org",
  "threejs.org",
  "redux.js.org",
  "webpack.js.org",
  "jestjs.io",
  "reactrouter.com",
  "docs.djangoproject.com",
  "flask.palletsprojects.com",
  "fastapi.tiangolo.com",
  "pandas.pydata.org",
  "numpy.org",
  "www.tensorflow.org",
  "pytorch.org",
  "scikit-learn.org",
  "matplotlib.org",
  "requests.readthedocs.io",
  "jupyter.org",
  "laravel.com",
  "symfony.com",
  "wordpress.org",
  "docs.spring.io",
  "hibernate.org",
  "tomcat.apache.org",
  "gradle.org",
  "maven.apache.org",
  "asp.net",
  "dotnet.microsoft.com",
  "nuget.org",
  "blazor.net",
  "reactnative.dev",
  "docs.flutter.dev",
  "developer.apple.com",
  "developer.android.com",
  "keras.io",
  "spark.apache.org",
  "huggingface.co",
  "www.kaggle.com",
  "www.mongodb.com",
  "redis.io",
  "www.postgresql.org",
  "dev.mysql.com",
  "www.sqlite.org",
  "graphql.org",
  "prisma.io",
  "docs.aws.amazon.com",
  "cloud.google.com",
  "kubernetes.io",
  "www.docker.com",
  "www.terraform.io",
  "www.ansible.com",
  "vercel.com/docs",
  "docs.netlify.com",
  "devcenter.heroku.com",
  "cypress.io",
  "selenium.dev",
  "docs.unity.com",
  "docs.unrealengine.com",
  "git-scm.com",
  "nginx.org",
  "httpd.apache.org",
]);

const WEB_FETCH_PREAPPROVED_HOSTNAME_ONLY = new Set<string>();
const WEB_FETCH_PREAPPROVED_PATH_PREFIXES = new Map<string, string[]>();
for (const entry of WEB_FETCH_PREAPPROVED_HOSTS) {
  const slashIndex = entry.indexOf("/");
  if (slashIndex === -1) {
    WEB_FETCH_PREAPPROVED_HOSTNAME_ONLY.add(entry);
    continue;
  }

  const hostname = entry.slice(0, slashIndex);
  const pathPrefix = entry.slice(slashIndex);
  const existingPrefixes = WEB_FETCH_PREAPPROVED_PATH_PREFIXES.get(hostname) ?? [];
  existingPrefixes.push(pathPrefix);
  WEB_FETCH_PREAPPROVED_PATH_PREFIXES.set(hostname, existingPrefixes);
}

type WebRedirectInfo = {
  originalUrl: string;
  redirectUrl: string;
  statusCode: number;
};

type WebReadableContent = {
  url: string;
  contentType: string;
  text: string;
  preapproved: boolean;
};

type WebSearchHit = {
  title: string;
  url: string;
};

type WebSearchProviderResult = {
  provider: "duckduckgo" | "bing";
  hits: WebSearchHit[];
};

type DomainAnchorHit = WebSearchHit & {
  score: number;
};

function isPreapprovedWebFetchHost(hostname: string, pathname: string): boolean {
  if (WEB_FETCH_PREAPPROVED_HOSTNAME_ONLY.has(hostname)) {
    return true;
  }

  const pathPrefixes = WEB_FETCH_PREAPPROVED_PATH_PREFIXES.get(hostname);
  if (!pathPrefixes) {
    return false;
  }

  return pathPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPreapprovedWebFetchUrl(url: URL): boolean {
  return isPreapprovedWebFetchHost(url.hostname, url.pathname);
}

function isPermittedWebRedirect(originalUrl: string, redirectUrl: string): boolean {
  try {
    const original = new URL(originalUrl);
    const redirect = new URL(redirectUrl);

    if (original.protocol !== redirect.protocol) {
      return false;
    }

    if (original.port !== redirect.port) {
      return false;
    }

    if (redirect.username || redirect.password) {
      return false;
    }

    const stripWww = (hostname: string) => hostname.replace(/^www\./, "");
    return stripWww(original.hostname) === stripWww(redirect.hostname);
  } catch {
    return false;
  }
}

function getRedirectStatusText(statusCode: number): string {
  switch (statusCode) {
    case 301:
      return "Moved Permanently";
    case 302:
      return "Found";
    case 307:
      return "Temporary Redirect";
    case 308:
      return "Permanent Redirect";
    default:
      return "Redirect";
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeDomainForComparison(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

function urlMatchesAllowedDomains(url: string, domains: string[]): boolean {
  try {
    const hostname = normalizeDomainForComparison(new URL(url).hostname);
    return domains.some(domain => {
      const normalizedDomain = normalizeDomainForComparison(domain);
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });
  } catch {
    return false;
  }
}

function urlMatchesBlockedDomains(url: string, domains: string[]): boolean {
  return urlMatchesAllowedDomains(url, domains);
}

function filterWebSearchHits(
  hits: WebSearchHit[],
  options: {
    allowedDomains?: string[];
    blockedDomains?: string[];
  } = {},
): WebSearchHit[] {
  const allowedDomains = options.allowedDomains?.filter(Boolean) ?? [];
  const blockedDomains = options.blockedDomains?.filter(Boolean) ?? [];

  return hits.filter(hit => {
    if (allowedDomains.length > 0 && !urlMatchesAllowedDomains(hit.url, allowedDomains)) {
      return false;
    }

    if (blockedDomains.length > 0 && urlMatchesBlockedDomains(hit.url, blockedDomains)) {
      return false;
    }

    return true;
  });
}

function truncateStructuredText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function cleanStructuredHtmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulStructuredHtmlText(value: string): boolean {
  const cleaned = cleanStructuredHtmlText(value);
  if (!cleaned) {
    return false;
  }

  if (/^(utf-8|en|zh|javascript:;?)$/i.test(cleaned)) {
    return false;
  }

  if (/^&#x[0-9a-f]+;?$/i.test(value.trim())) {
    return false;
  }

  if (/^[\d\s.]+$/.test(cleaned)) {
    return false;
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(cleaned)) {
    return false;
  }

  return true;
}

function extractStructuredHtmlText(html: string, baseUrl: string): string {
  const sections: string[] = [];
  const title = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)]
    .map(match => cleanStructuredHtmlText(match[1] ?? ""))
    .find(Boolean);
  if (title) {
    sections.push(`Title: ${truncateStructuredText(title, 160)}`);
  }

  const description = [
    ...html.matchAll(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/gi),
    ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/gi),
  ]
    .map(match => cleanStructuredHtmlText(match[1] ?? ""))
    .find(Boolean);
  if (description) {
    sections.push(`Description: ${truncateStructuredText(description, 280)}`);
  }

  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map(match => cleanStructuredHtmlText(match[1] ?? ""))
    .filter(isMeaningfulStructuredHtmlText);
  if (headings.length > 0) {
    sections.push(
      "Headings:",
      ...[...new Set(headings)].slice(0, 8).map(item => `- ${truncateStructuredText(item, 120)}`),
    );
  }

  const visibleLinks: string[] = [];
  const seenLinks = new Set<string>();
  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim();
    const text = cleanStructuredHtmlText(match[2] ?? "");
    if (!href || !isMeaningfulStructuredHtmlText(text) || text.length > 40) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    const dedupeKey = `${text}@@${resolvedUrl}`;
    if (seenLinks.has(dedupeKey)) {
      continue;
    }
    seenLinks.add(dedupeKey);
    visibleLinks.push(text);
    if (visibleLinks.length >= 18) {
      break;
    }
  }
  if (visibleLinks.length > 0) {
    sections.push(
      "Visible links:",
      ...visibleLinks.map(item => `- ${truncateStructuredText(item, 80)}`),
    );
  }

  const actions = [...html.matchAll(/<(?:input|textarea|button)[^>]+(?:placeholder|value|aria-label)=["']([^"']+)["']/gi)]
    .map(match => cleanStructuredHtmlText(match[1] ?? ""))
    .filter(isMeaningfulStructuredHtmlText);
  if (actions.length > 0) {
    sections.push(
      "Inputs or actions:",
      ...[...new Set(actions)].slice(0, 10).map(item => `- ${truncateStructuredText(item, 80)}`),
    );
  }

  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => cleanStructuredHtmlText(match[1] ?? ""))
    .filter(item => isMeaningfulStructuredHtmlText(item) && item.length >= 20);
  if (paragraphs.length > 0) {
    sections.push(
      "Body text:",
      ...[...new Set(paragraphs)].slice(0, 4).map(item => `- ${truncateStructuredText(item, 220)}`),
    );
  }

  const normalized = normalizeFetchedHtml(html);
  const decodedNormalized = decodeHtmlEntities(normalized)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/[a-zA-Z0-9.#:_-]+\s*\{[^}]+\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (sections.length === 0 && decodedNormalized) {
    sections.push(`Visible text: ${truncateStructuredText(decodedNormalized, 1200)}`);
  }

  return sections.join("\n");
}

function normalizeWebContent(
  rawText: string,
  contentType: string,
  sourceUrl?: string,
): string {
  if (contentType.includes("text/html")) {
    return extractStructuredHtmlText(rawText, sourceUrl ?? "https://example.com/");
  }

  return rawText.trim();
}

function buildWebFetchExtractionPrompt(
  content: string,
  prompt: string,
  preapproved: boolean,
): string {
  const guidelines = preapproved
    ? "Provide a concise answer grounded in the fetched content above."
    : [
        "Provide a concise answer based only on the fetched content above.",
        "Ignore page boilerplate, CSS, scripts, analytics text, and navigation noise unless the prompt explicitly asks for them.",
        "Prefer the main visible content, headings, and primary actions or sections.",
      ].join("\n");

  return [
    "Fetched web content:",
    "---",
    content,
    "---",
    "",
    prompt,
    "",
    guidelines,
  ].join("\n");
}

function composeSearchQuery(
  query: string,
  allowedDomains?: string[],
  blockedDomains?: string[],
): string {
  const parts = [query.trim()];

  for (const domain of allowedDomains ?? []) {
    const normalizedDomain = domain.trim();
    if (normalizedDomain) {
      parts.push(`site:${normalizedDomain}`);
    }
  }

  for (const domain of blockedDomains ?? []) {
    const normalizedDomain = domain.trim();
    if (normalizedDomain) {
      parts.push(`-site:${normalizedDomain}`);
    }
  }

  return parts.join(" ").trim();
}

function parseDuckDuckGoSearchResults(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const anchorPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = match[1]?.trim();
    const rawTitle = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!rawHref || !rawTitle) {
      continue;
    }

    let resolvedUrl = rawHref;
    if (rawHref.startsWith("//")) {
      resolvedUrl = `https:${rawHref}`;
    } else if (rawHref.startsWith("/")) {
      resolvedUrl = `https://duckduckgo.com${rawHref}`;
    }

    try {
      const parsedUrl = new URL(resolvedUrl);
      const redirectTarget = parsedUrl.searchParams.get("uddg");
      if (redirectTarget) {
        resolvedUrl = decodeURIComponent(redirectTarget);
      }
    } catch {
      continue;
    }

    hits.push({
      title: decodeHtmlEntities(rawTitle),
      url: resolvedUrl,
    });

    if (hits.length >= WEB_SEARCH_RESULT_LIMIT) {
      break;
    }
  }

  return hits;
}

function parseBingSearchResults(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const resultPattern = /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;

  for (const match of html.matchAll(resultPattern)) {
    const rawHref = match[1]?.trim();
    const rawTitle = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!rawHref || !rawTitle) {
      continue;
    }

    if (!/^https?:\/\//i.test(rawHref)) {
      continue;
    }

    hits.push({
      title: decodeHtmlEntities(rawTitle),
      url: rawHref,
    });

    if (hits.length >= WEB_SEARCH_RESULT_LIMIT) {
      break;
    }
  }

  return hits;
}

function parseDomainAnchorsFromHtml(
  html: string,
  baseUrl: string,
  allowedDomain: string,
  query: string,
): WebSearchHit[] {
  const seen = new Set<string>();
  const scoredHits: DomainAnchorHit[] = [];
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3);
  const anchorPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = match[1]?.trim();
    const rawText = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!rawHref || !rawText) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }

    if (!urlMatchesAllowedDomains(resolvedUrl, [allowedDomain])) {
      continue;
    }

    if (seen.has(resolvedUrl)) {
      continue;
    }
    seen.add(resolvedUrl);

    const combinedText = `${rawText} ${resolvedUrl}`.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (combinedText.includes(term)) {
        score += 2;
      }
      if (resolvedUrl.toLowerCase().includes(term)) {
        score += 1;
      }
    }

    scoredHits.push({
      title: decodeHtmlEntities(rawText),
      url: resolvedUrl,
      score,
    });
  }

  scoredHits.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.url.localeCompare(right.url);
  });

  const positiveHits = scoredHits.filter(hit => hit.score > 0);
  const fallbackHits = positiveHits.length > 0 ? positiveHits : scoredHits.slice(0, WEB_SEARCH_RESULT_LIMIT);

  return fallbackHits.slice(0, WEB_SEARCH_RESULT_LIMIT).map(hit => ({
    title: hit.title,
    url: hit.url,
  }));
}

async function fetchAllowedDomainFallbackHits(
  query: string,
  allowedDomains: string[],
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  for (const domain of allowedDomains) {
    const normalizedDomain = domain.trim();
    if (!normalizedDomain) {
      continue;
    }

    try {
      const response = await fetchWithTimeout(
        `https://${normalizedDomain}/`,
        {
          headers: {
            Accept: "text/html, text/plain, */*",
            "User-Agent": WEB_TOOL_USER_AGENT,
          },
        },
        WEB_TOOL_TIMEOUT_MS,
        signal,
      );

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      for (const hit of parseDomainAnchorsFromHtml(
        html,
        `https://${normalizedDomain}/`,
        normalizedDomain,
        query,
      )) {
        if (seen.has(hit.url)) {
          continue;
        }
        seen.add(hit.url);
        hits.push(hit);
        if (hits.length >= WEB_SEARCH_RESULT_LIMIT) {
          return hits;
        }
      }
    } catch {
      continue;
    }
  }

  return hits;
}

async function fetchWebSearchResults(
  query: string,
  options: {
    signal?: AbortSignal;
    allowedDomains?: string[];
    blockedDomains?: string[];
  } = {},
): Promise<WebSearchProviderResult> {
  const effectiveQuery = composeSearchQuery(
    query,
    options.allowedDomains,
    options.blockedDomains,
  );

  const attemptDuckDuckGo = async (): Promise<WebSearchProviderResult> => {
    const response = await fetchWithTimeout(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(effectiveQuery)}`,
      {
        headers: {
          Accept: "text/html, text/plain, */*",
          "User-Agent": WEB_TOOL_USER_AGENT,
        },
      },
      WEB_TOOL_TIMEOUT_MS,
      options.signal,
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status ${response.status}`);
    }

    const html = await response.text();
    return {
      provider: "duckduckgo",
      hits: filterWebSearchHits(parseDuckDuckGoSearchResults(html), options),
    };
  };

  const attemptBing = async (): Promise<WebSearchProviderResult> => {
    const response = await fetchWithTimeout(
      `https://cn.bing.com/search?q=${encodeURIComponent(effectiveQuery)}`,
      {
        headers: {
          Accept: "text/html, text/plain, */*",
          "User-Agent": WEB_TOOL_USER_AGENT,
        },
      },
      WEB_TOOL_TIMEOUT_MS,
      options.signal,
    );

    if (!response.ok) {
      throw new Error(`Bing search failed with status ${response.status}`);
    }

    const html = await response.text();
    return {
      provider: "bing",
      hits: filterWebSearchHits(parseBingSearchResults(html), options),
    };
  };

  try {
    return await attemptDuckDuckGo();
  } catch (duckDuckGoError) {
    try {
      return await attemptBing();
    } catch (bingError) {
      const primaryMessage = duckDuckGoError instanceof Error
        ? duckDuckGoError.message
        : String(duckDuckGoError);
      const fallbackMessage = bingError instanceof Error
        ? bingError.message
        : String(bingError);
      throw new Error(
        `Web search failed. DuckDuckGo: ${primaryMessage}. Bing fallback: ${fallbackMessage}.`,
      );
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  const abortListener = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", abortListener, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortListener);
  }
}

async function fetchWithPermittedRedirects(
  url: string,
  options: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirectChecker: (originalUrl: string, redirectUrl: string) => boolean;
    depth?: number;
  },
): Promise<Response | WebRedirectInfo> {
  const depth = options.depth ?? 0;
  if (depth > WEB_TOOL_REDIRECT_LIMIT) {
    throw new Error(`Too many redirects (exceeded ${WEB_TOOL_REDIRECT_LIMIT})`);
  }

  const response = await fetchWithTimeout(
    url,
    {
      headers: options.headers,
      redirect: "manual",
    },
    WEB_TOOL_TIMEOUT_MS,
    options.signal,
  );

  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect missing Location header");
    }

    const redirectUrl = new URL(location, url).toString();
    if (options.redirectChecker(url, redirectUrl)) {
      return fetchWithPermittedRedirects(redirectUrl, {
        ...options,
        depth: depth + 1,
      });
    }

    return {
      originalUrl: url,
      redirectUrl,
      statusCode: response.status,
    };
  }

  return response;
}

async function fetchReadableWebContent(
  url: string,
  options: {
    signal?: AbortSignal;
    upgradeInsecureHttp?: boolean;
  } = {},
): Promise<WebReadableContent | WebRedirectInfo> {
  const normalizedUrl = normalizeHttpUrl(url, {
    upgradeInsecureHttp: options.upgradeInsecureHttp ?? false,
  });
  const response = await fetchWithPermittedRedirects(normalizedUrl.toString(), {
    signal: options.signal,
    headers: {
      Accept: "text/markdown, text/html, text/plain, */*",
      "User-Agent": WEB_TOOL_USER_AGENT,
    },
    redirectChecker: isPermittedWebRedirect,
  });

  if ("redirectUrl" in response) {
    return response;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  return {
    url: normalizedUrl.toString(),
    contentType,
    text: normalizeWebContent(rawText, contentType),
    preapproved: isPreapprovedWebFetchUrl(normalizedUrl),
  };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildDiff(filePath: string, originalContent: string, proposedContent: string): string {
  return createPatch(
    filePath,
    ensureTrailingNewline(originalContent),
    ensureTrailingNewline(proposedContent),
    "current",
    "proposed",
  );
}

async function requestWriteApproval(
  context: ToolContext,
  request: WriteApprovalRequest,
): Promise<void> {
  if (!context.requestFileApproval) {
    return;
  }

  const approved = await context.requestFileApproval(request);

  if (!approved) {
    throw new Error(`File change rejected by user: ${request.path}`);
  }
}

async function requestActionApproval(
  context: ToolContext,
  request: ToolActionApprovalRequest,
): Promise<void> {
  if (!context.requestToolApproval) {
    return;
  }

  const approved = await context.requestToolApproval(request);

  if (!approved) {
    throw new Error(`Action rejected by user: ${request.toolName}`);
  }
}

function getBrowser(context: ToolContext): BrowserToolAdapter {
  if (!context.browser) {
    throw new Error("Browser runtime is not available");
  }

  return context.browser;
}

function getLsp(context: ToolContext): LspToolAdapter {
  if (!context.lsp) {
    throw new Error("LSP runtime is not available");
  }

  return context.lsp;
}

function getTasks(context: ToolContext): ConversationTaskRuntime {
  if (!context.tasks) {
    throw new Error("Task runtime is not available");
  }

  return context.tasks;
}

function getWorktree(context: ToolContext): ConversationWorktreeRuntime {
  if (!context.worktree) {
    throw new Error("Worktree runtime is not available");
  }

  return context.worktree;
}

function formatTaskDependencySuffix(task: TaskRecord): string {
  return task.blockedBy.length > 0
    ? ` [blocked by ${task.blockedBy.map(id => `#${id}`).join(", ")}]`
    : "";
}

function formatTaskTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaskSummary(task: TaskRecord): string {
  const owner = task.owner ? ` (${task.owner})` : "";
  return `#${task.id} [${task.status}] ${task.subject}${owner}${formatTaskDependencySuffix(task)}`;
}

function formatTaskDetails(task: TaskRecord): string {
  const lines = [
    `Task #${task.id}: ${task.subject}`,
    `Status: ${task.status}`,
    `Description: ${task.description}`,
    `Created: ${new Date(task.createdAt).toISOString()}`,
    `Updated: ${new Date(task.updatedAt).toISOString()}`,
  ];

  if (task.activeForm) {
    lines.push(`Active form: ${task.activeForm}`);
  }
  if (task.owner) {
    lines.push(`Owner: ${task.owner}`);
  }
  if (task.blockedBy.length > 0) {
    lines.push(`Blocked by: ${task.blockedBy.map(id => `#${id}`).join(", ")}`);
  }
  if (task.blocks.length > 0) {
    lines.push(`Blocks: ${task.blocks.map(id => `#${id}`).join(", ")}`);
  }
  if (task.metadata) {
    lines.push(`Metadata: ${JSON.stringify(task.metadata, null, 2)}`);
  }

  return lines.join("\n");
}

type TodoWriteItem = {
  id?: string;
  content: string;
  status?: TaskStatus | "deleted";
  activeForm?: string;
};

function parseTodoWriteItems(input: ToolInput): TodoWriteItem[] {
  if (!Array.isArray(input.todos) || input.todos.length === 0) {
    throw new Error("todos must be a non-empty array");
  }

  return input.todos.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error(`todos[${index}] must be an object`);
    }

    const item = rawItem as Record<string, unknown>;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) {
      throw new Error(`todos[${index}].content is required`);
    }

    const status =
      typeof item.status === "string" && item.status.trim() !== ""
        ? item.status.trim()
        : undefined;
    if (
      status !== undefined &&
      status !== "pending" &&
      status !== "in_progress" &&
      status !== "completed" &&
      status !== "deleted"
    ) {
      throw new Error(
        `todos[${index}].status must be one of pending, in_progress, completed, deleted`,
      );
    }

    return {
      ...(typeof item.id === "string" && item.id.trim() ? { id: item.id.trim() } : {}),
      content,
      ...(status ? { status: status as TodoWriteItem["status"] } : {}),
      ...(typeof item.activeForm === "string" && item.activeForm.trim()
        ? { activeForm: item.activeForm.trim() }
        : {}),
    };
  });
}

type TaskListKind = "all" | "structured" | "background";

type ParsedTaskListFilters = {
  kind: TaskListKind;
  status?: TaskStatus | BackgroundTaskRecord["status"];
  query?: string;
  limit?: number;
};

type TaskIdentifierField = "taskId" | "task_id" | "shell_id";

function parseTaskIdentifierInput(
  input: ToolInput,
  requiredField = "taskId",
  fields: readonly TaskIdentifierField[] = ["taskId", "task_id", "shell_id"],
): string {
  let taskId = "";
  for (const field of fields) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      taskId = value.trim();
      break;
    }
  }

  if (!taskId) {
    throw new Error(`${requiredField} is required`);
  }

  return taskId;
}

function parseTaskListFilters(input: ToolInput): ParsedTaskListFilters {
  const rawKind = typeof input.kind === "string" ? input.kind.trim().toLowerCase() : "";
  let kind: TaskListKind = "all";
  if (rawKind === "structured" || rawKind === "background") {
    kind = rawKind;
  } else if (rawKind && rawKind !== "all") {
    throw new Error(`Unsupported TaskList kind: ${rawKind}`);
  }

  const rawStatus = typeof input.status === "string" ? input.status.trim().toLowerCase() : "";
  let status: ParsedTaskListFilters["status"];
  if (rawStatus) {
    if (
      rawStatus !== "pending" &&
      rawStatus !== "in_progress" &&
      rawStatus !== "completed" &&
      rawStatus !== "running" &&
      rawStatus !== "failed" &&
      rawStatus !== "lost" &&
      rawStatus !== "killed" &&
      rawStatus !== "cancelled"
    ) {
      throw new Error(`Unsupported TaskList status: ${rawStatus}`);
    }
    status = rawStatus as ParsedTaskListFilters["status"];
  }

  const query =
    typeof input.query === "string" && input.query.trim() !== ""
      ? input.query.trim().toLowerCase()
      : undefined;
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(200, Math.floor(input.limit)))
      : undefined;

  return {
    kind,
    ...(status ? { status } : {}),
    ...(query ? { query } : {}),
    ...(limit ? { limit } : {}),
  };
}

function buildTaskSearchText(parts: Array<string | undefined>): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join("\n")
    .toLowerCase();
}

function matchesStructuredTaskFilters(task: TaskRecord, filters: ParsedTaskListFilters): boolean {
  if (
    filters.status &&
    filters.status !== "pending" &&
    filters.status !== "in_progress" &&
    filters.status !== "completed"
  ) {
    return false;
  }

  if (filters.status && task.status !== filters.status) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  return buildTaskSearchText([
    task.id,
    task.subject,
    task.description,
    task.activeForm,
    task.owner,
    task.metadata ? JSON.stringify(task.metadata) : undefined,
  ]).includes(filters.query);
}

function matchesBackgroundTaskFilters(
  task: BackgroundTaskRecord,
  filters: ParsedTaskListFilters,
): boolean {
  if (
    filters.status &&
    filters.status !== "pending" &&
    filters.status !== "completed" &&
    filters.status !== "running" &&
    filters.status !== "failed" &&
    filters.status !== "lost" &&
    filters.status !== "killed" &&
    filters.status !== "cancelled"
  ) {
    return false;
  }

  if (filters.status && task.status !== filters.status) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  return buildTaskSearchText([
    task.id,
    task.agentType,
    task.agentSource,
    task.description,
    task.command,
    task.prompt,
    task.result,
    task.error,
    task.workspaceRoot,
    task.metadata ? JSON.stringify(task.metadata) : undefined,
  ]).includes(filters.query);
}

function applyTaskListLimit<T>(items: T[], limit?: number): { visible: T[]; hiddenCount: number } {
  if (!limit || items.length <= limit) {
    return {
      visible: items,
      hiddenCount: 0,
    };
  }

  return {
    visible: items.slice(0, limit),
    hiddenCount: items.length - limit,
  };
}

function formatTaskListFilterSummary(filters: ParsedTaskListFilters): string | null {
  const parts = [
    `kind=${filters.kind}`,
    ...(filters.status ? [`status=${filters.status}`] : []),
    ...(filters.query ? [`query=${filters.query}`] : []),
    ...(filters.limit ? [`limit=${filters.limit}`] : []),
  ];

  return parts.length > 1 || filters.kind !== "all"
    ? `TaskList filters: ${parts.join(", ")}`
    : null;
}

function formatStructuredTaskStatusCounts(
  tasks: TaskRecord[],
  label = "Structured task counts",
): string {
  const counts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
  };

  for (const task of tasks) {
    counts[task.status] += 1;
  }

  return `${label}: pending=${counts.pending}, in_progress=${counts.in_progress}, completed=${counts.completed}`;
}

function formatBackgroundTaskStatusCounts(
  tasks: BackgroundTaskRecord[],
  label = "Background task counts",
): string {
  const counts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    lost: 0,
    killed: 0,
    cancelled: 0,
  };

  for (const task of tasks) {
    counts[task.status] += 1;
  }

  return `${label}: pending=${counts.pending}, running=${counts.running}, completed=${counts.completed}, failed=${counts.failed}, lost=${counts.lost}, killed=${counts.killed}, cancelled=${counts.cancelled}`;
}

async function validateTaskUpdateDependencies(
  runtime: ConversationTaskRuntime,
  taskId: string,
  addBlocks?: string[],
  addBlockedBy?: string[],
): Promise<void> {
  const dependencyMutations = [
    ...(addBlocks ?? []).map(blockedTaskId => ({
      blockerTaskId: taskId,
      blockedTaskId,
    })),
    ...(addBlockedBy ?? []).map(blockerTaskId => ({
      blockerTaskId,
      blockedTaskId: taskId,
    })),
  ];

  if (dependencyMutations.length === 0) {
    return;
  }

  assertTaskDependencyMutationsAreValid(
    await runtime.listTasks(),
    dependencyMutations,
  );
}

const BACKGROUND_TASK_SUMMARY_DETAIL_LIMIT = 120;

function normalizeInlineBackgroundTaskText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateInlineBackgroundTaskText(
  value: string,
  maxLength = BACKGROUND_TASK_SUMMARY_DETAIL_LIMIT,
): string {
  const normalized = normalizeInlineBackgroundTaskText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getBackgroundTaskPrompt(task: BackgroundTaskRecord): string | undefined {
  if (typeof task.prompt === "string" && task.prompt.trim()) {
    return task.prompt;
  }

  if (
    typeof task.metadata?.originalTask === "string" &&
    task.metadata.originalTask.trim()
  ) {
    return task.metadata.originalTask;
  }

  if (
    task.taskType === "remote_agent" &&
    typeof task.command === "string" &&
    task.command.trim()
  ) {
    return task.command;
  }

  return undefined;
}

function getBackgroundTaskCommandText(task: BackgroundTaskRecord): string | undefined {
  if (
    typeof task.metadata?.commandText === "string" &&
    task.metadata.commandText.trim()
  ) {
    return task.metadata.commandText;
  }

  return undefined;
}

function formatBackgroundTaskSummaryDetails(task: BackgroundTaskRecord): string {
  const parts: string[] = [];
  const normalizedCommand =
    typeof task.command === "string" && task.command.trim()
      ? normalizeInlineBackgroundTaskText(task.command)
      : undefined;

  if (normalizedCommand) {
    parts.push(`command ${truncateInlineBackgroundTaskText(normalizedCommand)}`);
  }

  const commandText = getBackgroundTaskCommandText(task);
  if (commandText) {
    parts.push(`invocation ${truncateInlineBackgroundTaskText(commandText)}`);
  }

  const prompt = getBackgroundTaskPrompt(task);
  if (prompt && normalizeInlineBackgroundTaskText(prompt) !== normalizedCommand) {
    parts.push(`prompt ${truncateInlineBackgroundTaskText(prompt)}`);
  }

  if (typeof task.metadata?.planFilePath === "string" && task.metadata.planFilePath.trim()) {
    parts.push(`plan ${truncateInlineBackgroundTaskText(task.metadata.planFilePath, 100)}`);
  }

  if (
    typeof task.metadata?.verificationVerdict === "string" &&
    task.metadata.verificationVerdict.trim()
  ) {
    parts.push(`verdict ${truncateInlineBackgroundTaskText(task.metadata.verificationVerdict, 40)}`);
  }

  if (task.taskType === "remote_agent") {
    if (typeof task.metadata?.sessionId === "string" && task.metadata.sessionId.trim()) {
      parts.push(`session ${truncateInlineBackgroundTaskText(task.metadata.sessionId, 100)}`);
    } else if (
      typeof task.metadata?.sessionUrl === "string" &&
      task.metadata.sessionUrl.trim()
    ) {
      parts.push(`session ${truncateInlineBackgroundTaskText(task.metadata.sessionUrl, 100)}`);
    }
  }

  return parts.map(part => ` | ${part}`).join("");
}

function formatBackgroundTaskSummary(task: BackgroundTaskRecord): string {
  const label =
    task.agentType && task.agentSource === "built-in"
      ? `${task.agentType} agent`
      : task.description || task.command || task.id;
  const remoteTaskType =
    task.taskType === "remote_agent" && typeof task.metadata?.remoteTaskType === "string"
      ? ` | remote ${task.metadata.remoteTaskType}`
      : "";
  const workspaceRoot = task.workspaceRoot ? ` | root ${task.workspaceRoot}` : "";
  const createdAt = formatTaskTimestamp(task.createdAt);
  const updatedAt = formatTaskTimestamp(task.updatedAt);
  const runtimeState = isBackgroundTaskLostAfterRestart(task)
    ? " | lost after runtime restart"
    : "";
  const diffRef =
    typeof task.metadata?.diffRef === "string"
      ? ` | diffRef ${task.metadata.diffRef}`
      : "";
  const reviewPrNumber =
    typeof task.metadata?.reviewPrNumber === "string"
      ? ` | pr #${task.metadata.reviewPrNumber}`
      : "";
  const details = formatBackgroundTaskSummaryDetails(task);
  return `@${task.id} [${task.status}] ${label}${remoteTaskType}${reviewPrNumber}${diffRef}${details}${workspaceRoot}${runtimeState} | created ${createdAt} | updated ${updatedAt}`;
}

type SearchFilesResult = {
  matches: string[];
  totalMatchCount: number;
  truncated: boolean;
};

async function searchFilesWithRipgrep(
  workspaceRoot: string,
  query: string,
  targetPath: string,
): Promise<SearchFilesResult> {
  let stdout = "";
  try {
    const result = await execFileAsync(
      "rg",
      [
        "--json",
        "--line-number",
        "--color",
        "never",
        "--fixed-strings",
        query,
        targetPath,
      ],
      {
        cwd: workspaceRoot,
        timeout: 15_000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    stdout = result.stdout;
  } catch (error: any) {
    if (typeof error?.code === "number" && error.code === 1) {
      return {
        matches: [],
        totalMatchCount: 0,
        truncated: false,
      };
    }
    throw error;
  }

  const matches: string[] = [];
  let totalMatchCount = 0;
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (totalMatchCount >= SEARCH_MATCH_LIMIT) {
      break;
    }

    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type !== "match") {
      continue;
    }

    const filePath = typeof event.data?.path?.text === "string" ? event.data.path.text : "";
    const lineNumber =
      typeof event.data?.line_number === "number" ? event.data.line_number : undefined;
    const lineText =
      typeof event.data?.lines?.text === "string" ? event.data.lines.text.trimEnd() : "";

    if (!filePath || lineNumber === undefined) {
      continue;
    }

    totalMatchCount += 1;
    if (matches.length < SEARCH_MATCH_DISPLAY_LIMIT) {
      matches.push(formatSearchMatch(workspaceRoot, filePath, lineNumber, lineText));
    }
  }

  const truncated = totalMatchCount >= SEARCH_MATCH_LIMIT;
  if (truncated) {
    matches.push(`[truncated after ${SEARCH_MATCH_LIMIT} matches]`);
  }

  return {
    matches,
    totalMatchCount,
    truncated,
  };
}

function formatSearchMatch(
  workspaceRoot: string,
  filePath: string,
  lineNumber: number,
  lineText: string,
): string {
  return `${path.relative(workspaceRoot, filePath)}:${lineNumber}: ${lineText.trim()}`;
}

async function searchFilesInMemoryFallback(
  workspaceRoot: string,
  targetPath: string,
  query: string,
): Promise<SearchFilesResult> {
  const stat = await fs.stat(targetPath);
  const filePaths = stat.isDirectory() ? await walkFiles(targetPath) : [targetPath];
  const matches: string[] = [];
  let totalMatchCount = 0;

  for (const filePath of filePaths) {
    if (totalMatchCount >= SEARCH_MATCH_LIMIT) {
      break;
    }

    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (totalMatchCount >= SEARCH_MATCH_LIMIT) {
          return;
        }
        if (line.toLowerCase().includes(query.toLowerCase())) {
          totalMatchCount += 1;
          if (matches.length < SEARCH_MATCH_DISPLAY_LIMIT) {
            matches.push(formatSearchMatch(workspaceRoot, filePath, index + 1, line));
          }
        }
      });
    } catch {
      // Skip binary or unreadable files.
    }
  }

  const truncated = totalMatchCount >= SEARCH_MATCH_LIMIT;
  if (truncated) {
    matches.push(`[truncated after ${SEARCH_MATCH_LIMIT} matches]`);
  }

  return {
    matches,
    totalMatchCount,
    truncated,
  };
}

type BackgroundTaskRetrievalStatus =
  | "success"
  | "timeout"
  | "not_ready"
  | "lost"
  | "not_found";

function getBackgroundTaskRetrievalStatus(
  task: BackgroundTaskRecord,
): BackgroundTaskRetrievalStatus {
  if (task.status === "pending" || task.status === "running") {
    return "not_ready";
  }

  if (isBackgroundTaskLostAfterRestart(task)) {
    return "lost";
  }

  return "success";
}

function formatBackgroundTaskOutput(
  retrievalStatus: BackgroundTaskRetrievalStatus,
  task: BackgroundTaskRecord | null,
  taskId?: string,
): string {
  const parts: string[] = [];
  parts.push(`<retrieval_status>${retrievalStatus}</retrieval_status>`);

  if (!task && taskId) {
    parts.push(`<task_id>${taskId}</task_id>`);
  }

  if (!task) {
    return parts.join("\n\n");
  }

  parts.push(`<task_id>${task.id}</task_id>`);
  parts.push(`<task_type>${task.taskType}</task_type>`);
  if (task.agentType) {
    parts.push(`<agent_type>${task.agentType}</agent_type>`);
  }
  if (task.agentSource) {
    parts.push(`<agent_source>${task.agentSource}</agent_source>`);
  }
  if (task.agentColor) {
    parts.push(`<agent_color>${task.agentColor}</agent_color>`);
  }
  parts.push(`<description>${task.description}</description>`);
  if (task.command) {
    parts.push(`<command>${task.command}</command>`);
  }
  const commandText = getBackgroundTaskCommandText(task);
  if (commandText) {
    parts.push(`<command_text>${commandText}</command_text>`);
  }
  const prompt = getBackgroundTaskPrompt(task);
  if (prompt) {
    parts.push(`<prompt>${prompt}</prompt>`);
  }
  if (task.taskType === "remote_agent") {
    if (typeof task.metadata?.remoteTaskType === "string") {
      parts.push(`<remote_task_type>${task.metadata.remoteTaskType}</remote_task_type>`);
    }
    if (typeof task.metadata?.sessionId === "string") {
      parts.push(`<session_id>${task.metadata.sessionId}</session_id>`);
    }
    if (typeof task.metadata?.sessionUrl === "string") {
      parts.push(`<session_url>${task.metadata.sessionUrl}</session_url>`);
    }
  }
  if (typeof task.metadata?.extraGuidance === "string") {
    parts.push(`<extra_guidance>${task.metadata.extraGuidance}</extra_guidance>`);
  }
  if (typeof task.metadata?.verificationVerdict === "string") {
    parts.push(
      `<verification_verdict>${task.metadata.verificationVerdict}</verification_verdict>`,
    );
  }
  if (typeof task.metadata?.planFilePath === "string") {
    parts.push(`<plan_file_path>${task.metadata.planFilePath}</plan_file_path>`);
  }
  if (typeof task.metadata?.approvedAtUserTurnCount === "number") {
    parts.push(
      `<approved_at_user_turn_count>${task.metadata.approvedAtUserTurnCount}</approved_at_user_turn_count>`,
    );
  }
  if (typeof task.metadata?.hasPlanContent === "boolean") {
    parts.push(`<has_plan_content>${task.metadata.hasPlanContent}</has_plan_content>`);
  }
  if (task.runnerPid !== undefined) {
    parts.push(`<runner_pid>${task.runnerPid}</runner_pid>`);
  }
  if (task.childPid !== undefined) {
    parts.push(`<child_pid>${task.childPid}</child_pid>`);
  }
  if (task.exitCode !== undefined) {
    parts.push(`<exit_code>${task.exitCode}</exit_code>`);
  }
  if (task.outputPath) {
    parts.push(`<output_file>${task.outputPath}</output_file>`);
  }
  if (task.statePath) {
    parts.push(`<state_file>${task.statePath}</state_file>`);
  }
  if (task.cancelPath) {
    parts.push(`<cancel_file>${task.cancelPath}</cancel_file>`);
  }
  if (task.configPath) {
    parts.push(`<config_file>${task.configPath}</config_file>`);
  }
  parts.push(`<status>${task.status}</status>`);
  if (isBackgroundTaskLostAfterRestart(task)) {
    parts.push("<runtime_state>lost_after_restart</runtime_state>");
    parts.push(
      "<recovery_hint>Runtime restart interrupted this task before completion. Re-run it if you still need fresh output.</recovery_hint>",
    );
  }
  parts.push(`<created_at>${new Date(task.createdAt).toISOString()}</created_at>`);
  parts.push(`<updated_at>${new Date(task.updatedAt).toISOString()}</updated_at>`);
  if (task.workspaceRoot) {
    parts.push(`<workspace_root>${task.workspaceRoot}</workspace_root>`);
  }
  if (typeof task.metadata?.diffRef === "string") {
    parts.push(`<diff_ref>${task.metadata.diffRef}</diff_ref>`);
  }
  if (typeof task.metadata?.reviewPrNumber === "string") {
    parts.push(`<review_pr_number>${task.metadata.reviewPrNumber}</review_pr_number>`);
  }
  if (task.metadata) {
    parts.push(`<metadata>\n${JSON.stringify(task.metadata, null, 2)}\n</metadata>`);
  }

  const remoteFollowUpHint = getRemoteBackgroundTaskFollowUpHint(task, retrievalStatus);
  if (remoteFollowUpHint) {
    parts.push(`<follow_up_hint>${remoteFollowUpHint}</follow_up_hint>`);
  }

  if (task.output.trim()) {
    parts.push(`<output>\n${task.output.trimEnd()}\n</output>`);
  }

  if (task.error) {
    parts.push(`<error>${task.error}</error>`);
  }

  if (task.result) {
    parts.push(`<result>\n${task.result.trimEnd()}\n</result>`);
  }

  return parts.join("\n\n");
}

function getRemoteBackgroundTaskFollowUpHint(
  task: BackgroundTaskRecord,
  retrievalStatus: BackgroundTaskRetrievalStatus,
): string | null {
  if (
    task.taskType !== "remote_agent" ||
    (retrievalStatus !== "not_ready" && retrievalStatus !== "timeout")
  ) {
    return null;
  }

  if (typeof task.metadata?.sessionUrl === "string" && task.metadata.sessionUrl.trim()) {
    return `Remote task is still running. Check the remote session at ${task.metadata.sessionUrl.trim()} for live progress.`;
  }

  if (typeof task.metadata?.sessionId === "string" && task.metadata.sessionId.trim()) {
    return `Remote task is still running. Check remote session ${task.metadata.sessionId.trim()} for live progress.`;
  }

  return "Remote task is still running. Wait and poll TaskOutput again later.";
}

function getBackgroundTaskGetSummary(
  retrievalStatus: BackgroundTaskRetrievalStatus,
  task: BackgroundTaskRecord,
): string {
  if (retrievalStatus === "not_ready") {
    return `Background task ${task.id} is not ready yet`;
  }

  if (retrievalStatus === "lost") {
    return `Background task ${task.id} was lost when the task runtime restarted`;
  }

  if (task.status === "completed") {
    return `Loaded completed background task ${task.id}`;
  }

  if (task.status === "cancelled") {
    return `Loaded cancelled background task ${task.id}`;
  }

  if (task.status === "killed") {
    return `Loaded killed background task ${task.id}`;
  }

  if (task.status === "lost") {
    return `Loaded lost background task ${task.id}`;
  }

  if (task.status === "failed") {
    return `Loaded failed background task ${task.id}`;
  }

  return `Loaded background task ${task.id}`;
}

function formatTaskNotFoundResult(taskId: string): ToolExecutionResult {
  return {
    summary: `Task ${taskId} not found`,
    content: [
      `<retrieval_status>not_found</retrieval_status>`,
      `<task_id>${taskId}</task_id>`,
    ].join("\n\n"),
  };
}

function hasVerificationTask(
  tasks: TaskRecord[],
  backgroundTasks: BackgroundTaskRecord[] = [],
): boolean {
  const hasStructuredVerification = tasks.some(task => /verif/i.test(task.subject));
  if (hasStructuredVerification) {
    return true;
  }

  return backgroundTasks.some(task => {
    if (
      task.status !== "pending" &&
      task.status !== "running" &&
      task.status !== "completed"
    ) {
      return false;
    }

    if (task.agentType === "verification") {
      return true;
    }

    if (typeof task.metadata?.remoteTaskType === "string" && /verif/i.test(task.metadata.remoteTaskType)) {
      return true;
    }

    const description = `${task.description} ${task.command ?? ""} ${task.prompt ?? ""}`;
    return /verif/i.test(description);
  });
}

function buildVerificationNudge(
  toolName: "RunVerification" | "VerifyPlanExecution" = "RunVerification",
): string {
  return `\n\nNOTE: You just closed out 3+ tasks and none of them was a verification step. Before writing your final summary, call ${toolName}. You cannot self-assign PARTIAL by listing caveats in your summary; only the verifier issues a verdict.`;
}

function extractExistingTaskIdFromDuplicateRunError(message: string): string | null {
  const match = message.match(/\(([A-Za-z0-9._:-]+)\)/);
  return match?.[1] ?? null;
}

function formatAlreadyRunningTaskResult(
  label: string,
  taskId: string,
  message: string,
  extraTags: string[] = [],
): ToolExecutionResult {
  return {
    summary: `${label} already running (${taskId})`,
    content: [
      `<task_id>${taskId}</task_id>`,
      `<status>already_running</status>`,
      ...extraTags,
      `<message>${message}</message>`,
    ].join("\n"),
  };
}

function buildPlanVerificationTags(
  planVerification: ToolContext["planVerification"],
): string[] {
  return planVerification?.pending && planVerification.planFilePath
    ? [`<plan_file_path>${planVerification.planFilePath}</plan_file_path>`]
    : [];
}

function buildDiffRefTags(diffRef?: string): string[] {
  return diffRef ? [`<diff_ref>${diffRef}</diff_ref>`] : [];
}

function parseInspectionDiffRefInput(input: ToolInput): string | undefined {
  if (typeof input.diffRef !== "string") {
    return undefined;
  }

  const diffRef = input.diffRef.trim();
  if (!diffRef) {
    return undefined;
  }

  if (!/^[a-zA-Z0-9_./@{}\-~^:]+$/.test(diffRef)) {
    throw new Error("diffRef must be a single git diff ref without spaces.");
  }

  return diffRef;
}

function formatExitWorktreeSummary(result: ExitWorktreeResult): string {
  if (result.message.startsWith("No-op:")) {
    return "No active worktree session";
  }

  return result.action === "remove"
    ? "Exited and removed worktree"
    : "Exited worktree";
}

function isPlanModeWritePath(context: ToolContext, targetPath: string): boolean {
  return !!(
    context.planMode?.active &&
    context.planMode.planFilePath &&
    isPlanWritablePath(targetPath, context.planMode.planFilePath)
  );
}

function assertPlanModeWriteAccess(context: ToolContext, targetPath: string): void {
  if (!context.planMode?.active) {
    return;
  }

  if (!context.planMode.planFilePath || !isPlanWritablePath(targetPath, context.planMode.planFilePath)) {
    throw new Error(
      `Plan mode is active. You may only edit the plan file: ${context.planMode.planFilePath ?? "[missing plan file]"}`,
    );
  }
}

function assertPlanModeCommandAccess(context: ToolContext, command: string): void {
  if (!context.planMode?.active) {
    return;
  }

  if (!PLAN_MODE_READ_ONLY_COMMAND_PREFIXES.some(prefix => command.startsWith(prefix))) {
    throw new Error(
      "Plan mode is active. Only read-only commands are allowed until the plan is approved.",
    );
  }
}

function assertVerificationModeWriteAccess(context: ToolContext): void {
  if (!context.verificationMode?.active) {
    return;
  }

  throw new Error(
    "Verification mode is active. You cannot edit project files while running verification.",
  );
}

function assertVerificationModeCommandAccess(command: string): void {
  if (!commandStartsWithAllowedPrefix(command, VERIFICATION_ALLOWED_COMMAND_PREFIXES)) {
    throw new Error(
      "Verification mode only allows build/test/lint/read-only inspection commands.",
    );
  }
}

const handlers: Record<string, ToolHandler> = {
  async ListMcpResourcesTool(input, context) {
    if (!context.mcp) {
      throw new Error("MCP runtime is not available");
    }

    const serverName = typeof input.server === "string" ? input.server : undefined;
    return context.mcp.listResources(serverName);
  },

  async ReadMcpResourceTool(input, context) {
    if (!context.mcp) {
      throw new Error("MCP runtime is not available");
    }

    const serverName = typeof input.server === "string" ? input.server : "";
    const uri = typeof input.uri === "string" ? input.uri : "";

    if (!serverName.trim()) {
      throw new Error("server is required");
    }

    if (!uri.trim()) {
      throw new Error("uri is required");
    }

    return context.mcp.readResource(serverName, uri);
  },

  async EnterPlanMode(_input, context) {
    if (context.verificationMode?.active) {
      throw new Error("Verification mode is active. Plan mode tools are unavailable.");
    }

    if (!context.planMode) {
      throw new Error("Plan mode controller is not available");
    }

    if (context.planMode.active && context.planMode.planFilePath) {
      const existingPlan = await context.planMode.getPlanContent();
      return {
        summary: "Already in plan mode",
        content:
          `Plan mode is already active.\n\nPlan file: ${context.planMode.planFilePath}\n\n` +
          `Continue refining this file before calling ExitPlanMode.\n\n` +
          `Current plan:\n${toSafeText(existingPlan || "[empty plan]", 4000)}`,
      };
    }

    await requestActionApproval(context, {
      kind: "tool_action",
      toolName: "EnterPlanMode",
      title: "Enter plan mode",
      summary: "Switch into read-only planning mode before implementation",
      inputPreview: "No input",
    });

    const result = await context.planMode.enter();

    return {
      summary: "Entered plan mode",
      content:
        "Entered plan mode. Focus on exploring the codebase and designing an implementation approach.\n\n" +
        `Plan file: ${result.planFilePath}\n\n` +
        "While plan mode is active, you MUST NOT edit any files except this plan file, and you must not run non-readonly commands. " +
        "Capture your findings and implementation approach in the plan file, then call ExitPlanMode when you are ready for approval.\n\n" +
        `Initial plan template:\n${toSafeText(result.planContent, 4000)}`,
    };
  },

  async ExitPlanMode(_input, context) {
    if (context.verificationMode?.active) {
      throw new Error("Verification mode is active. Plan mode tools are unavailable.");
    }

    if (!context.planMode?.active || !context.planMode.planFilePath) {
      throw new Error("You are not currently in plan mode.");
    }

    const planContent = await context.planMode.getPlanContent();

    if (!planContent || !planContent.trim()) {
      throw new Error(
        `No plan content found in ${context.planMode.planFilePath}. Write the plan before calling ExitPlanMode.`,
      );
    }

    await requestActionApproval(context, {
      kind: "tool_action",
      toolName: "ExitPlanMode",
      title: "Approve plan and exit plan mode",
      summary: "Review the plan and allow implementation to begin",
      inputPreview: toSafeText(planContent, 4000),
    });

    const result = await context.planMode.exit();

    return {
      summary: "Exited plan mode",
      content:
        "User has approved the plan. You can now start coding.\n\n" +
        `Plan file: ${result.planFilePath}\n\n` +
        "When you believe the approved plan is fully implemented, call VerifyPlanExecution before claiming completion.\n\n" +
        `## Approved Plan:\n${toSafeText(result.planContent, 8000)}`,
    };
  },

  async EnterWorktree(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("EnterWorktree is only available to the main session.");
    }

    if (context.verificationMode?.active) {
      throw new Error("Verification mode is active. Worktree tools are unavailable.");
    }

    if (context.planMode?.active) {
      throw new Error("Plan mode is active. Exit plan mode before entering a worktree.");
    }

    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    const session = await getWorktree(context).enterWorktree(
      rawName ? { name: rawName } : {},
    );
    const branchInfo = session.worktreeBranch
      ? ` on branch ${session.worktreeBranch}`
      : "";

    return {
      summary: `Entered worktree ${session.worktreeName}`,
      content:
        `Created worktree at ${session.worktreePath}${branchInfo}. ` +
        "The session is now working inside the worktree. Use ExitWorktree to leave it later.",
    };
  },

  async ExitWorktree(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("ExitWorktree is only available to the main session.");
    }

    if (context.verificationMode?.active) {
      throw new Error("Verification mode is active. Worktree tools are unavailable.");
    }

    if (context.planMode?.active) {
      throw new Error("Plan mode is active. Exit plan mode before leaving a worktree.");
    }

    const action = input.action;
    if (action !== "keep" && action !== "remove") {
      throw new Error('action must be either "keep" or "remove"');
    }

    const result = await getWorktree(context).exitWorktree({
      action,
      discardChanges: input.discard_changes === true,
    });

    return {
      summary: formatExitWorktreeSummary(result),
      content: result.message,
    };
  },

  async list_files(input, context) {
    const rawPath = typeof input.path === "string" && input.path.trim() !== "" ? input.path : ".";
    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    const stat = await fs.stat(absolutePath);

    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${rawPath}`);
    }

    const filePaths = await walkFiles(absolutePath);
    const relativeOutput = formatRelativePaths(context.workspaceRoot, filePaths);

    return {
      summary: `Listed ${filePaths.length} files under ${rawPath}`,
      content: relativeOutput || "[no files found]",
    };
  },

  async read_file(input, context) {
    const rawPath = typeof input.path === "string" ? input.path : "";

    if (!rawPath) {
      throw new Error("path is required");
    }

    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    const fileContents = await fs.readFile(absolutePath, "utf8");
    const startLine = typeof input.startLine === "number" ? Math.max(1, Math.floor(input.startLine)) : 1;
    const endLine =
      typeof input.endLine === "number" ? Math.max(startLine, Math.floor(input.endLine)) : undefined;

    const lines = fileContents.split(/\r?\n/);
    const selectedLines = lines.slice(startLine - 1, endLine);
    const numberedLines = selectedLines
      .map((line, index) => `${startLine + index}: ${line}`)
      .join("\n");

    return {
      summary: `Read ${rawPath}`,
      content: toSafeText(numberedLines || "[empty file]"),
    };
  },

  async search_files(input, context) {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const rawPath = typeof input.path === "string" && input.path.trim() !== "" ? input.path : ".";

    if (!query) {
      throw new Error("query is required");
    }

    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    let searchResult: SearchFilesResult;
    try {
      searchResult = await searchFilesWithRipgrep(
        context.workspaceRoot,
        query,
        absolutePath,
      );
    } catch (error) {
      const message = toErrorMessage(error);
      const ripgrepMissing =
        /not recognized|enoent|spawn rg|spawn eperm|eperm|eacces/i.test(message);

      if (!ripgrepMissing) {
        throw new Error(`search_files failed: ${message}`);
      }

      searchResult = await searchFilesInMemoryFallback(
        context.workspaceRoot,
        absolutePath,
        query,
      );
    }

    return {
      summary: searchResult.truncated
        ? `Found at least ${SEARCH_MATCH_LIMIT} matches for "${query}"`
        : `Found ${searchResult.totalMatchCount} matches for "${query}"`,
      content: toSafeText(searchResult.matches.join("\n") || "[no matches found]"),
    };
  },

  async run_command(input, context) {
    const command = typeof input.command === "string" ? input.command.trim() : "";

    if (!command) {
      throw new Error("command is required");
    }

    assertSafeShellCommand(command, ALLOWED_COMMAND_PREFIXES);

    if (!commandStartsWithAllowedPrefix(command, ALLOWED_COMMAND_PREFIXES)) {
      throw new Error(
        `Command is not in the safe allowlist. Allowed prefixes: ${ALLOWED_COMMAND_PREFIXES.join(", ")}`,
      );
    }

    assertPlanModeCommandAccess(context, command);
    if (context.verificationMode?.active) {
      assertVerificationModeCommandAccess(command);
    }

    if (!context.verificationMode?.active) {
      await requestActionApproval(context, {
        kind: "tool_action",
        toolName: "run_command",
        title: "Confirm command execution",
        summary: "Run an allowlisted PowerShell command in the current workspace",
        inputPreview: command,
      });
    }

    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        buildUtf8PowerShellEncodedCommand(command),
      ],
      {
        cwd: context.workspaceRoot,
        timeout: 15_000,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );

    const mergedOutput = stripAnsiEscapeCodes(
      [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
    );

    return {
      summary: `Ran command: ${command}`,
      content: toSafeText(mergedOutput || "[no output]"),
    };
  },

  async write_file(input, context) {
    const rawPath = typeof input.path === "string" ? input.path : "";
    const content = typeof input.content === "string" ? input.content : "";

    if (!rawPath) {
      throw new Error("path is required");
    }

    assertVerificationModeWriteAccess(context);
    assertPlanModeWriteAccess(context, rawPath);

    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    let originalContent = "";

    try {
      originalContent = await fs.readFile(absolutePath, "utf8");
    } catch {
      originalContent = "";
    }

    if (!isPlanModeWritePath(context, rawPath)) {
      await requestWriteApproval(context, {
        kind: "write_file",
        path: rawPath,
        workspaceRoot: context.workspaceRoot,
        summary: originalContent === "" ? `Create ${rawPath}` : `Overwrite ${rawPath}`,
        diff: buildDiff(rawPath, originalContent, content),
        originalContent,
        proposedContent: content,
      });
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");

    return {
      summary: `Wrote ${rawPath}`,
      content: `Saved ${content.length} characters to ${rawPath}.`,
    };
  },

  async replace_in_file(input, context) {
    const rawPath = typeof input.path === "string" ? input.path : "";
    const search = typeof input.search === "string" ? input.search : "";
    const replace = typeof input.replace === "string" ? input.replace : "";
    const replaceAll = input.replaceAll === true;

    if (!rawPath) {
      throw new Error("path is required");
    }

    if (!search) {
      throw new Error("search is required");
    }

    assertVerificationModeWriteAccess(context);
    assertPlanModeWriteAccess(context, rawPath);

    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    const originalContent = await fs.readFile(absolutePath, "utf8");

    if (!originalContent.includes(search)) {
      throw new Error(`Search text not found in ${rawPath}`);
    }

    const updatedContent = replaceAll
      ? originalContent.split(search).join(replace)
      : originalContent.replace(search, replace);

    if (!isPlanModeWritePath(context, rawPath)) {
      await requestWriteApproval(context, {
        kind: "replace_in_file",
        path: rawPath,
        workspaceRoot: context.workspaceRoot,
        summary: `Apply text replacement in ${rawPath}`,
        diff: buildDiff(rawPath, originalContent, updatedContent),
        originalContent,
        proposedContent: updatedContent,
      });
    }

    await fs.writeFile(absolutePath, updatedContent, "utf8");
    const replacementCount = replaceAll ? originalContent.split(search).length - 1 : 1;

    return {
      summary: `Updated ${rawPath}`,
      content: `Replaced ${replacementCount} occurrence${replacementCount === 1 ? "" : "s"} in ${rawPath}.`,
    };
  },

  async fetch_url(input) {
    const urlValue = typeof input.url === "string" ? input.url.trim() : "";

    if (!urlValue) {
      throw new Error("url is required");
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(urlValue);
    } catch {
      throw new Error(`Invalid URL: ${urlValue}`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
    }

    const response = await fetch(parsedUrl, {
      headers: {
        "User-Agent": "Cain-Claude-VSCode/0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    const normalizedText = contentType.includes("text/html") ? normalizeFetchedHtml(rawText) : rawText.trim();

    return {
      summary: `Fetched ${parsedUrl.toString()}`,
      content: toSafeText(normalizedText || "[empty response]"),
    };
  },

  async WebFetch(input, context) {
    const urlValue = typeof input.url === "string" ? input.url.trim() : "";
    const promptValue = typeof input.prompt === "string" ? input.prompt.trim() : "";

    if (!urlValue) {
      throw new Error("url is required");
    }

    if (!promptValue) {
      throw new Error("prompt is required");
    }

    const response = await fetchReadableWebContent(urlValue, {
      signal: context.abortSignal,
      upgradeInsecureHttp: true,
    });

    if ("redirectUrl" in response) {
      const statusText = getRedirectStatusText(response.statusCode);
      const message = [
        "REDIRECT DETECTED: The URL redirects to a different host.",
        "",
        `Original URL: ${response.originalUrl}`,
        `Redirect URL: ${response.redirectUrl}`,
        `Status: ${response.statusCode} ${statusText}`,
        "",
        "To complete your request, call WebFetch again with:",
        `- url: "${response.redirectUrl}"`,
        `- prompt: "${promptValue}"`,
      ].join("\n");

      return {
        summary: `WebFetch redirect for ${response.originalUrl}`,
        content: message,
      };
    }

    const readableContent = toSafeText(
      response.text || "[empty response]",
      MAX_WEB_TOOL_CONTENT_LENGTH,
    );
    const shouldExtractWithRuntime =
      !!context.extractWebContent &&
      (
        response.contentType.includes("text/html") ||
        !response.preapproved
      );

    if (shouldExtractWithRuntime) {
      const extractedContent = await context.extractWebContent!({
        url: response.url,
        prompt: promptValue,
        content: buildWebFetchExtractionPrompt(
          readableContent,
          promptValue,
          response.preapproved,
        ),
        contentType: response.contentType,
        preapproved: response.preapproved,
        abortSignal: context.abortSignal,
      });

      return {
        summary: `Fetched ${response.url} for WebFetch`,
        content: [
          `URL: ${response.url}`,
          `Content-Type: ${response.contentType || "unknown"}`,
          "",
          extractedContent.trim() || "[empty extraction result]",
        ].join("\n"),
      };
    }

    const extractionInstruction = response.preapproved
      ? `Use the fetched content below to answer this extraction request: ${promptValue}`
      : `Use only the fetched content below to answer this extraction request: ${promptValue}`;

    return {
      summary: `Fetched ${response.url} for WebFetch`,
      content: [
        `URL: ${response.url}`,
        `Content-Type: ${response.contentType || "unknown"}`,
        "",
        extractionInstruction,
        "",
        "Fetched content:",
        readableContent,
      ].join("\n"),
    };
  },

  async WebSearch(input, context) {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const allowedDomains = Array.isArray(input.allowed_domains)
      ? input.allowed_domains.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : undefined;
    const blockedDomains = Array.isArray(input.blocked_domains)
      ? input.blocked_domains.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : undefined;

    if (!query) {
      throw new Error("Error: Missing query");
    }

    if (allowedDomains?.length && blockedDomains?.length) {
      throw new Error(
        "Error: Cannot specify both allowed_domains and blocked_domains in the same request",
      );
    }

    const { hits: providerHits, provider } = await fetchWebSearchResults(query, {
      signal: context.abortSignal,
      allowedDomains,
      blockedDomains,
    });
    const hits =
      providerHits.length === 0 && allowedDomains && allowedDomains.length > 0
        ? await fetchAllowedDomainFallbackHits(query, allowedDomains, context.abortSignal)
        : providerHits;

    const sections = [
      `Web search results for query: "${query}"`,
      "",
    ];

    if (hits.length > 0) {
      sections.push(`Links: ${JSON.stringify(hits)}`);
    } else {
      sections.push("No links found.");
    }

    sections.push("");
    sections.push(`Search provider: ${provider}`);
    sections.push("");
    sections.push("REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.");

    return {
      summary: `Searched the web for "${query}"`,
      content: sections.join("\n"),
    };
  },

  async browser_navigate(input, context) {
    const urlValue = typeof input.url === "string" ? input.url.trim() : "";

    if (!urlValue) {
      throw new Error("url is required");
    }

    return await getBrowser(context).navigate(urlValue);
  },

  async browser_snapshot(input, context) {
    const maxLength = typeof input.maxLength === "number" ? Math.max(1000, Math.floor(input.maxLength)) : undefined;
    return await getBrowser(context).snapshot(maxLength);
  },

  async browser_click(input, context) {
    const ref = typeof input.ref === "string" ? input.ref : undefined;
    const selector = typeof input.selector === "string" ? input.selector : undefined;
    const text = typeof input.text === "string" ? input.text : undefined;

    return await getBrowser(context).click({ ref, selector, text });
  },

  async browser_type(input, context) {
    const ref = typeof input.ref === "string" ? input.ref : undefined;
    const selector = typeof input.selector === "string" ? input.selector : undefined;
    const textTarget = typeof input.textTarget === "string" ? input.textTarget : undefined;
    const value = typeof input.value === "string" ? input.value : "";
    const submit = input.submit === true;

    if (!value) {
      throw new Error("value is required");
    }

    return await getBrowser(context).type({ ref, selector, textTarget, value, submit });
  },

  async browser_wait_for(input, context) {
    const text = typeof input.text === "string" ? input.text : undefined;
    const timeMs = typeof input.timeMs === "number" ? Math.max(0, Math.floor(input.timeMs)) : undefined;
    return await getBrowser(context).waitFor({ text, timeMs });
  },

  async browser_screenshot(input, context) {
    const outputPath = typeof input.path === "string" ? input.path : undefined;
    const fullPage = input.fullPage === true;
    return await getBrowser(context).screenshot({ path: outputPath, fullPage });
  },

  async browser_close(_input, context) {
    return await getBrowser(context).close();
  },

  async glob_files(input, context) {
    const rawPattern = typeof input.pattern === "string" ? input.pattern.trim() : "";
    const rawPath = typeof input.path === "string" && input.path.trim() !== "" ? input.path : ".";

    if (!rawPattern) {
      throw new Error("pattern is required");
    }

    const absolutePath = resolveWorkspacePath(context.workspaceRoot, rawPath);
    const stat = await fs.stat(absolutePath);

    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${rawPath}`);
    }

    const allFiles = await walkFiles(absolutePath);
    const regex = globToRegex(rawPattern);
    const matches = allFiles.filter(filePath => {
      const rel = path.relative(absolutePath, filePath).replace(/\\/g, "/");
      return regex.test(rel);
    });

    return {
      summary: `Found ${matches.length} files matching "${rawPattern}"`,
      content: formatRelativePaths(context.workspaceRoot, matches) || "[no matches]",
    };
  },

  async [LSP_TOOL_NAME](input, context) {
    const rawOperation = typeof input.operation === "string" ? input.operation : "";
    const operation = normalizeLspOperation(rawOperation);
    if (!operation) {
      throw new Error(`Unsupported LSP operation: ${String(input.operation ?? "")}`);
    }

    const filePath =
      typeof input.filePath === "string" && input.filePath.trim() !== ""
        ? input.filePath.trim()
        : undefined;
    const line = typeof input.line === "number" ? input.line : undefined;
    const character = typeof input.character === "number" ? input.character : undefined;
    const query =
      typeof input.query === "string"
        ? input.query.trim()
        : undefined;
    const severity =
      typeof input.severity === "string" && input.severity.trim() !== ""
        ? input.severity.trim().toLowerCase()
        : undefined;
    const maxResults =
      typeof input.maxResults === "number" ? input.maxResults : undefined;
    const itemIndex =
      typeof input.itemIndex === "number" ? input.itemIndex : undefined;

    const requiresPosition =
      operation === "goToDefinition" ||
      operation === "goToImplementation" ||
      operation === "findReferences" ||
      operation === "hover" ||
      operation === "prepareCallHierarchy" ||
      operation === "incomingCalls" ||
      operation === "outgoingCalls";

    if (
      (requiresPosition || operation === "documentSymbols" || operation === "documentDiagnostics") &&
      !filePath
    ) {
      throw new Error("filePath is required");
    }

    if (requiresPosition && (line === undefined || character === undefined)) {
      throw new Error("line and character are required for this LSP operation");
    }

    if (
      severity !== undefined &&
      severity !== "error" &&
      severity !== "warning" &&
      severity !== "info" &&
      severity !== "hint"
    ) {
      throw new Error("severity must be one of: error, warning, info, hint");
    }

    return await getLsp(context).query({
      operation,
      filePath,
      line,
      character,
      query: operation === "workspaceSymbols" ? query ?? "" : query,
      severity: severity as "error" | "warning" | "info" | "hint" | undefined,
      maxResults,
      itemIndex,
    });
  },

  async TaskCreate(input, context) {
    const subject = typeof input.subject === "string" ? input.subject.trim() : "";
    const description =
      typeof input.description === "string" ? input.description.trim() : "";
    const activeForm =
      typeof input.activeForm === "string" && input.activeForm.trim() !== ""
        ? input.activeForm.trim()
        : undefined;
    const metadata =
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : undefined;

    if (!subject) {
      throw new Error("subject is required");
    }

    if (!description) {
      throw new Error("description is required");
    }

    const task = await getTasks(context).createTask({
      subject,
      description,
      activeForm,
      metadata,
    });

    return {
      summary: `Created task #${task.id}`,
      content: `Task #${task.id} created successfully: ${task.subject}`,
    };
  },

  async TodoWriteTool(input, context) {
    const items = parseTodoWriteItems(input);
    const runtime = getTasks(context);
    const results: string[] = [];

    for (const item of items) {
      if (item.status === "deleted") {
        if (!item.id) {
          throw new Error("todos with status=deleted must include an id");
        }
        const deleted = await runtime.deleteTask(item.id);
        results.push(
          deleted
            ? `- deleted #${item.id}: ${item.content}`
            : `- missing #${item.id}: ${item.content}`,
        );
        continue;
      }

      if (item.id) {
        const existingTask = await runtime.getTask(item.id);
        if (!existingTask) {
          results.push(`- missing #${item.id}: ${item.content}`);
          continue;
        }

        const updatedTask = await runtime.updateTask(item.id, {
          subject: item.content,
          description: item.content,
          ...(item.activeForm !== undefined ? { activeForm: item.activeForm } : {}),
          ...(item.status ? { status: item.status } : {}),
          metadata: {
            ...(existingTask.metadata ?? {}),
            _todo: true,
          },
        });
        results.push(
          updatedTask
            ? `- updated #${updatedTask.id}: ${updatedTask.subject} [${updatedTask.status}]`
            : `- missing #${item.id}: ${item.content}`,
        );
        continue;
      }

      const createdTask = await runtime.createTask({
        subject: item.content,
        description: item.content,
        ...(item.activeForm ? { activeForm: item.activeForm } : {}),
        metadata: { _todo: true },
      });

      const finalizedTask =
        item.status && item.status !== "pending"
          ? await runtime.updateTask(createdTask.id, { status: item.status })
          : createdTask;
      results.push(
        `- created #${finalizedTask?.id ?? createdTask.id}: ${item.content} [${finalizedTask?.status ?? createdTask.status}]`,
      );
    }

    return {
      summary: `Applied ${items.length} todo update(s)`,
      content: results.join("\n"),
    };
  },

  async TaskGet(input, context) {
    const taskId = parseTaskIdentifierInput(input, "taskId", ["taskId"]);

    const runtime = getTasks(context);
    const task = await runtime.getTask(taskId);
    const backgroundTask = task ? null : await runtime.getBackgroundTask(taskId);

    if (task) {
      return {
        summary: `Loaded task #${task.id}`,
        content: formatTaskDetails(task),
      };
    }

    if (backgroundTask) {
      const retrievalStatus = getBackgroundTaskRetrievalStatus(backgroundTask);
      return {
        summary: getBackgroundTaskGetSummary(retrievalStatus, backgroundTask),
        content: formatBackgroundTaskOutput(retrievalStatus, backgroundTask),
      };
    }

    return formatTaskNotFoundResult(taskId);
  },

  async TaskList(input, context) {
    const filters = parseTaskListFilters(input);
    const runtime = getTasks(context);
    const tasks = (await runtime.listTasks()).filter(
      task => task.metadata?._internal !== true,
    );
    const backgroundTasks = await runtime.listBackgroundTasks();
    const resolvedTaskIds = new Set(
      tasks.filter(task => task.status === "completed").map(task => task.id),
    );

    const visibleTasks = tasks.map(task => ({
      ...task,
      blockedBy: task.blockedBy.filter(id => !resolvedTaskIds.has(id)),
    })).sort((left, right) => {
      const statusRank = (status: TaskRecord["status"]) =>
        status === "in_progress" ? 0 : status === "pending" ? 1 : 2;
      const rankDiff = statusRank(left.status) - statusRank(right.status);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const updatedDiff = right.updatedAt - left.updatedAt;
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return Number(right.id) - Number(left.id);
    });
    const filteredStructuredTasks =
      filters.kind === "background"
        ? []
        : visibleTasks.filter(task => matchesStructuredTaskFilters(task, filters));
    const filteredBackgroundTasks =
      filters.kind === "structured"
        ? []
        : backgroundTasks.filter(task => matchesBackgroundTaskFilters(task, filters));
    const limitedStructuredTasks = applyTaskListLimit(filteredStructuredTasks, filters.limit);
    const limitedBackgroundTasks = applyTaskListLimit(filteredBackgroundTasks, filters.limit);
    const filterSummary = formatTaskListFilterSummary(filters);

    return {
      summary:
        filters.kind === "structured"
          ? `Listed ${limitedStructuredTasks.visible.length} structured task${limitedStructuredTasks.visible.length === 1 ? "" : "s"}`
          : filters.kind === "background"
            ? `Listed ${limitedBackgroundTasks.visible.length} background task${limitedBackgroundTasks.visible.length === 1 ? "" : "s"}`
            : `Listed ${limitedStructuredTasks.visible.length} structured task${limitedStructuredTasks.visible.length === 1 ? "" : "s"} and ${limitedBackgroundTasks.visible.length} background task${limitedBackgroundTasks.visible.length === 1 ? "" : "s"}`,
      content: [
        filterSummary,
        filters.kind !== "background"
          ? formatStructuredTaskStatusCounts(
              filteredStructuredTasks,
              filterSummary ? "Structured task counts (filtered)" : "Structured task counts",
            )
          : "",
        filters.kind !== "background" && limitedStructuredTasks.hiddenCount > 0
          ? `Showing first ${limitedStructuredTasks.visible.length} of ${filteredStructuredTasks.length} structured tasks`
          : "",
        filters.kind !== "background"
          ? limitedStructuredTasks.visible.length > 0
            ? limitedStructuredTasks.visible.map(task => formatTaskSummary(task)).join("\n")
            : "No structured tasks found"
          : "",
        filters.kind !== "structured"
          ? formatBackgroundTaskStatusCounts(
              filteredBackgroundTasks,
              filterSummary ? "Background task counts (filtered)" : "Background task counts",
            )
          : "",
        filters.kind !== "structured" && limitedBackgroundTasks.hiddenCount > 0
          ? `Showing first ${limitedBackgroundTasks.visible.length} of ${filteredBackgroundTasks.length} background tasks`
          : "",
        filters.kind !== "structured"
          ? limitedBackgroundTasks.visible.length > 0
            ? "Background tasks:\n" +
              limitedBackgroundTasks.visible.map(task => formatBackgroundTaskSummary(task)).join("\n")
            : "No background tasks found"
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },

  async TaskUpdate(input, context) {
    const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
    if (!taskId) {
      throw new Error("taskId is required");
    }

    const runtime = getTasks(context);
    const task = await runtime.getTask(taskId);
    if (!task) {
      return {
        summary: `Task #${taskId} not found`,
        content: "Task not found",
      };
    }

    const subject =
      typeof input.subject === "string" ? input.subject : undefined;
    const description =
      typeof input.description === "string" ? input.description : undefined;
    const activeForm =
      typeof input.activeForm === "string" ? input.activeForm : undefined;
    const owner = typeof input.owner === "string" ? input.owner : undefined;
    const rawStatus = typeof input.status === "string" ? input.status : undefined;
    const addBlocks = Array.isArray(input.addBlocks)
      ? input.addBlocks.map(value => String(value))
      : undefined;
    const addBlockedBy = Array.isArray(input.addBlockedBy)
      ? input.addBlockedBy.map(value => String(value))
      : undefined;
    const metadataPatch =
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : undefined;

    const updatedFields: string[] = [];

    if (rawStatus === "deleted") {
      const deleted = await runtime.deleteTask(taskId);
      return {
        summary: deleted ? `Deleted task #${taskId}` : `Task #${taskId} not found`,
        content: deleted ? `Updated task #${taskId} deleted` : "Task not found",
      };
    }

    let status: TaskStatus | undefined;
    if (rawStatus !== undefined) {
      if (
        rawStatus !== "pending" &&
        rawStatus !== "in_progress" &&
        rawStatus !== "completed"
      ) {
        throw new Error(`Unsupported task status: ${rawStatus}`);
      }
      status = rawStatus;
    }

    const mergedMetadata =
      metadataPatch !== undefined
        ? Object.entries(metadataPatch).reduce<Record<string, unknown>>(
            (acc, [key, value]) => {
              if (value === null) {
                delete acc[key];
              } else {
                acc[key] = value;
              }
              return acc;
            },
            { ...(task.metadata ?? {}) },
          )
        : undefined;

    await validateTaskUpdateDependencies(runtime, taskId, addBlocks, addBlockedBy);

    const updatedTask = await runtime.updateTask(taskId, {
      ...(subject !== undefined && subject !== task.subject ? { subject } : {}),
      ...(description !== undefined && description !== task.description
        ? { description }
        : {}),
      ...(activeForm !== undefined && activeForm !== task.activeForm
        ? { activeForm }
        : {}),
      ...(status !== undefined && status !== task.status ? { status } : {}),
      ...(owner !== undefined && owner !== task.owner ? { owner } : {}),
      ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
    });

    if (!updatedTask) {
      return {
        summary: `Task #${taskId} not found`,
        content: "Task not found",
      };
    }

    if (subject !== undefined && subject !== task.subject) {
      updatedFields.push("subject");
    }
    if (description !== undefined && description !== task.description) {
      updatedFields.push("description");
    }
    if (activeForm !== undefined && activeForm !== task.activeForm) {
      updatedFields.push("activeForm");
    }
    if (status !== undefined && status !== task.status) {
      updatedFields.push("status");
    }
    if (owner !== undefined && owner !== task.owner) {
      updatedFields.push("owner");
    }
    if (mergedMetadata !== undefined) {
      updatedFields.push("metadata");
    }

    if (addBlocks && addBlocks.length > 0) {
      for (const blockedTaskId of addBlocks) {
        await runtime.blockTask(taskId, blockedTaskId);
      }
      updatedFields.push("blocks");
    }

    if (addBlockedBy && addBlockedBy.length > 0) {
      for (const blockerTaskId of addBlockedBy) {
        await runtime.blockTask(blockerTaskId, taskId);
      }
      updatedFields.push("blockedBy");
    }

    let verificationNudge = "";
    if (
      context.invokerKind !== "worker" &&
      status === "completed" &&
      task.status !== "completed"
    ) {
      const visibleTasks = (await runtime.listTasks()).filter(
        listedTask => listedTask.metadata?._internal !== true,
      );
      const visibleBackgroundTasks = await runtime.listBackgroundTasks();

      if (
        visibleTasks.length >= 3 &&
        visibleTasks.every(listedTask => listedTask.status === "completed") &&
        !hasVerificationTask(visibleTasks, visibleBackgroundTasks)
      ) {
        verificationNudge = buildVerificationNudge(
          context.planVerification?.pending ? "VerifyPlanExecution" : "RunVerification",
        );
      }
    }

    return {
      summary: `Updated task #${taskId}`,
      content: `Updated task #${taskId} ${updatedFields.join(", ")}`.trimEnd() + verificationNudge,
    };
  },

  async TaskStop(input, context) {
    const taskId = parseTaskIdentifierInput(input, "task_id", ["task_id", "shell_id"]);

    const task = await getTasks(context).getBackgroundTask(taskId);
    if (!task) {
      throw new Error(`No task found with ID: ${taskId}`);
    }

    if (task.status !== "running") {
      throw new Error(`Task ${taskId} is not running (status: ${task.status})`);
    }

    const stopped =
      typeof context.stopBackgroundTask === "function"
        ? await context.stopBackgroundTask(taskId)
        : undefined;

    if (!stopped) {
      throw new Error(`Unsupported task type: ${task.taskType}`);
    }

    const command = stopped.command ?? task.command ?? task.description;
    const stoppedStatus: BackgroundTaskStatus =
      task.taskType === "remote_agent" ? "killed" : "cancelled";
    await getTasks(context).updateBackgroundTask(taskId, {
      status: stoppedStatus,
      ...(stoppedStatus === "cancelled" ? { error: "Stopped by TaskStop." } : {}),
      result: "Stopped by TaskStop.",
    });

    return {
      summary: `Stopped background task ${taskId}`,
      content: JSON.stringify({
        message: `Successfully stopped task: ${taskId} (${command})`,
        task_id: taskId,
        task_type: stopped.taskType ?? task.taskType,
        command,
      }),
    };
  },

  async TaskOutput(input, context) {
    const taskId = parseTaskIdentifierInput(input, "task_id", ["task_id"]);
    const block = input.block !== false;
    const timeout =
      typeof input.timeout === "number" && Number.isFinite(input.timeout)
        ? Math.max(0, Math.min(600_000, Math.floor(input.timeout)))
        : 30_000;

    const runtime = getTasks(context);
    const task = await runtime.getBackgroundTask(taskId);
    if (!task) {
      return formatTaskNotFoundResult(taskId);
    }

    if (!block) {
      const retrievalStatus = getBackgroundTaskRetrievalStatus(task);

      return {
        summary:
          retrievalStatus === "not_ready"
            ? `Task ${taskId} is not ready yet`
            : retrievalStatus === "lost"
              ? `Background task ${taskId} was lost when the task runtime restarted`
            : `Retrieved output for task ${taskId}`,
        content: formatBackgroundTaskOutput(retrievalStatus, task),
      };
    }

    const completedTask = await runtime.waitForBackgroundTask(
      taskId,
      timeout,
      context.abortSignal,
    );

    if (!completedTask) {
      return {
        summary: `Task ${taskId} was not found while waiting for output`,
        content: formatBackgroundTaskOutput("not_found", null, taskId),
      };
    }

    if (completedTask.status === "pending" || completedTask.status === "running") {
      return {
        summary: `Timed out waiting for task ${taskId}`,
        content: formatBackgroundTaskOutput("timeout", completedTask),
      };
    }

    if (isBackgroundTaskLostAfterRestart(completedTask)) {
      return {
        summary: `Background task ${taskId} was lost when the task runtime restarted`,
        content: formatBackgroundTaskOutput("lost", completedTask),
      };
    }

    const finalSummary =
      completedTask.status === "completed"
        ? `Retrieved completed output for task ${taskId}`
        : completedTask.status === "cancelled"
          ? `Retrieved cancelled output for task ${taskId}`
          : completedTask.status === "killed"
            ? `Retrieved killed output for task ${taskId}`
          : completedTask.status === "lost"
            ? `Retrieved lost output for task ${taskId}`
          : `Retrieved failed output for task ${taskId}`;

    return {
      summary: finalSummary,
      content: formatBackgroundTaskOutput("success", completedTask),
    };
  },

  async RunVerification(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("RunVerification is only available to the main session.");
    }

    if (context.verificationMode?.active) {
      throw new Error("RunVerification is unavailable while verification is already running.");
    }

    if (typeof context.runVerification !== "function") {
      throw new Error("Verification launcher is unavailable in the current session.");
    }

    const extraGuidance =
      typeof input.guidance === "string" && input.guidance.trim() !== ""
        ? input.guidance.trim()
        : undefined;
    const diffRef = parseInspectionDiffRefInput(input);

    let result;
    try {
      result = await context.runVerification({ extraGuidance, diffRef });
    } catch (error) {
      const message = toErrorMessage(error);
      const existingTaskId = extractExistingTaskIdFromDuplicateRunError(message);
      if (existingTaskId) {
        return formatAlreadyRunningTaskResult(
          "Verification",
          existingTaskId,
          message,
          [
            ...buildPlanVerificationTags(context.planVerification),
            ...buildDiffRefTags(diffRef),
          ],
        );
      }
      throw error;
    }

    return {
      summary: `Verification ${result.verdict} (${result.taskId})`,
      content: [
        `<task_id>${result.taskId}</task_id>`,
        ...buildPlanVerificationTags(context.planVerification),
        ...buildDiffRefTags(diffRef),
        `<verdict>${result.verdict}</verdict>`,
        `<report>`,
        result.report.trimEnd(),
        `</report>`,
      ].join("\n"),
    };
  },

  async VerifyPlanExecution(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("VerifyPlanExecution is only available to the main session.");
    }

    if (context.verificationMode?.active) {
      throw new Error("VerifyPlanExecution is unavailable while verification is already running.");
    }

    if (!context.planVerification?.pending) {
      throw new Error(
        "No approved ExitPlanMode plan is currently awaiting execution verification.",
      );
    }

    if (typeof context.runVerification !== "function") {
      throw new Error("Verification launcher is unavailable in the current session.");
    }

    const extraGuidance =
      typeof input.guidance === "string" && input.guidance.trim() !== ""
        ? input.guidance.trim()
        : undefined;
    const diffRef = parseInspectionDiffRefInput(input);

    let result;
    try {
      result = await context.runVerification({ extraGuidance, diffRef });
    } catch (error) {
      const message = toErrorMessage(error);
      const existingTaskId = extractExistingTaskIdFromDuplicateRunError(message);
      if (existingTaskId) {
        return formatAlreadyRunningTaskResult(
          "Plan verification",
          existingTaskId,
          message,
          [
            ...buildPlanVerificationTags(context.planVerification),
            ...buildDiffRefTags(diffRef),
          ],
        );
      }
      throw error;
    }

    return {
      summary: `Plan verification ${result.verdict} (${result.taskId})`,
      content: [
        `<task_id>${result.taskId}</task_id>`,
        ...buildPlanVerificationTags(context.planVerification),
        ...buildDiffRefTags(diffRef),
        `<verdict>${result.verdict}</verdict>`,
        `<report>`,
        result.report.trimEnd(),
        `</report>`,
      ].join("\n"),
    };
  },

  async RunReview(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("RunReview is only available to the main session.");
    }

    if (context.verificationMode?.active) {
      throw new Error("RunReview is unavailable while a read-only inspector agent is already running.");
    }

    if (typeof context.runReview !== "function") {
      throw new Error("Review launcher is unavailable in the current session.");
    }

    const extraGuidance =
      typeof input.guidance === "string" && input.guidance.trim() !== ""
        ? input.guidance.trim()
        : undefined;
    const diffRef = parseInspectionDiffRefInput(input);

    let result;
    try {
      result = await context.runReview({ extraGuidance, diffRef });
    } catch (error) {
      const message = toErrorMessage(error);
      const existingTaskId = extractExistingTaskIdFromDuplicateRunError(message);
      if (existingTaskId) {
        return formatAlreadyRunningTaskResult(
          "Review",
          existingTaskId,
          message,
          [
            ...buildPlanVerificationTags(context.planVerification),
            ...buildDiffRefTags(diffRef),
          ],
        );
      }
      throw error;
    }

    return {
      summary: `Review completed (${result.taskId})`,
      content: [
        `<task_id>${result.taskId}</task_id>`,
        ...buildPlanVerificationTags(context.planVerification),
        ...buildDiffRefTags(diffRef),
        `<report>`,
        result.report.trimEnd(),
        `</report>`,
      ].join("\n"),
    };
  },

  async RunCommandInBackground(input, context) {
    if (context.invokerKind === "worker") {
      throw new Error("RunCommandInBackground is only available to the main session.");
    }
    if (context.verificationMode?.active) {
      throw new Error("RunCommandInBackground is unavailable while a read-only inspector agent is running.");
    }
    if (typeof context.runCommandInBackground !== "function") {
      throw new Error("Background command launcher is unavailable in the current session.");
    }

    const command = typeof input.command === "string" ? input.command.trim() : "";
    if (!command) {
      throw new Error("command is required");
    }

    assertSafeShellCommand(command, ALLOWED_COMMAND_PREFIXES);

    if (!commandStartsWithAllowedPrefix(command, ALLOWED_COMMAND_PREFIXES)) {
      throw new Error(
        `Command is not in the safe allowlist. Allowed prefixes: ${ALLOWED_COMMAND_PREFIXES.join(", ")}`,
      );
    }

    assertPlanModeCommandAccess(context, command);

    if (typeof context.findReusableBackgroundCommand === "function") {
      const existing = await context.findReusableBackgroundCommand({ command });
      if (existing) {
        return formatAlreadyRunningTaskResult(
          "Background command",
          existing.taskId,
          `Background command is already running for this workspace: ${existing.command}. You'll be notified when it completes. Use TaskOutput only if you need to inspect partial output before that.`,
          [
            `<command>${existing.command}</command>`,
            `<workspace_root>${existing.workspaceRoot}</workspace_root>`,
            ...(existing.outputPath
              ? [`<output_path>${existing.outputPath}</output_path>`]
              : []),
            `<notification_hint>You will be notified automatically when this background command completes.</notification_hint>`,
          ],
        );
      }
    }

    await requestActionApproval(context, {
      kind: "tool_action",
      toolName: "RunCommandInBackground",
      title: "Confirm background command execution",
      summary: "Run an allowlisted PowerShell command as a background task in the current workspace",
      inputPreview: command,
    });

    const result = await context.runCommandInBackground({ command });
    return {
      summary: result.alreadyRunning
        ? `Background command already running (${result.taskId})`
        : `Started background command ${result.taskId}`,
      content: [
        `<task_id>${result.taskId}</task_id>`,
        `<status>${result.alreadyRunning ? "already_running" : "started"}</status>`,
        `<command>${result.command}</command>`,
        `<workspace_root>${result.workspaceRoot}</workspace_root>`,
        ...(result.outputPath
          ? [`<output_path>${result.outputPath}</output_path>`]
          : []),
        `<notification_hint>You will be notified automatically when this background command completes.</notification_hint>`,
      ].join("\n"),
    };
  },

  async ToolSearchTool(input, context) {
    const query = typeof input.query === "string" ? input.query : "";
    const rawMaxResults =
      typeof input.max_results === "number"
        ? input.max_results
        : input.maxResults;
    const maxResults =
      typeof rawMaxResults === "number" && Number.isFinite(rawMaxResults)
        ? Math.max(1, Math.min(100, Math.floor(rawMaxResults)))
        : TOOL_SEARCH_RESULT_LIMIT;

    const availableTools = [
      ...getBuiltInToolDefinitions({
        lspAvailable: context.lsp?.isAvailable?.() ?? !!context.lsp,
      }),
      ...(context.mcp ? await context.mcp.getToolDefinitions() : []),
    ];
    const dedupedTools = dedupeToolDefinitionsByName(availableTools);
    const matches = searchToolDefinitions(dedupedTools, query, maxResults);

    return {
      summary: query.trim()
        ? `Found ${matches.length} tool match(es) for "${query.trim()}"`
        : `Listed ${matches.length} available tool(s)`,
      content: formatToolSearchResults(matches, query),
    };
  },

  async SkillTool(input, context) {
    const rawSkill = typeof input.skill === "string" ? input.skill.trim() : "";
    const args = typeof input.args === "string" ? input.args : undefined;

    if (!rawSkill) {
      throw new Error("skill is required");
    }

    const normalizedSkillId = rawSkill.replace(/^\//, "").trim().toLowerCase();
    const availableSkills = await loadModelInvocableInstalledSkills(
      context.workspaceRoot,
    );
    const skill = getInstalledSkill(availableSkills, normalizedSkillId);

    if (!skill) {
      throw new Error(
        `Installed skill "${normalizedSkillId}" is not available for model invocation in this workspace.`,
      );
    }

    const execution = await buildInstalledSkillExecutionPlan({
      skill,
      args,
      toolContext: context,
    });
    const registeredHooks = execution.hooks.length > 0
      ? context.registerSessionInstalledSkillHooks?.(execution.hooks) ??
        execution.hooks
      : undefined;

    if (execution.executionContext === "fork") {
      return {
        summary: `Loaded installed skill ${skill.id} for forked execution`,
        ...(execution.allowedTools.length > 0
          ? {
              forkedSkillRunRequest: {
                skillId: skill.id,
                prompt: execution.prompt,
                allowedToolNames: execution.allowedTools,
                ...(registeredHooks?.length
                  ? { installedSkillHooks: registeredHooks }
                  : {}),
                ...(execution.modelOverride
                  ? { modelOverride: execution.modelOverride }
                  : {}),
                ...(execution.effortOverride
                  ? { effortOverride: execution.effortOverride }
                  : {}),
              },
            }
          : {
              forkedSkillRunRequest: {
                skillId: skill.id,
                prompt: execution.prompt,
                ...(registeredHooks?.length
                  ? { installedSkillHooks: registeredHooks }
                  : {}),
                ...(execution.modelOverride
                  ? { modelOverride: execution.modelOverride }
                  : {}),
                ...(execution.effortOverride
                  ? { effortOverride: execution.effortOverride }
                  : {}),
              },
            }),
        content: [
          `Loaded installed skill "/${skill.id}" for isolated forked execution.`,
          "The skill will run in a separate agent context and return its final result here.",
          "",
          "<installed_skill>",
          execution.prompt,
          "</installed_skill>",
        ].join("\n"),
      };
    }

    return {
      summary: `Loaded installed skill ${skill.id}`,
      ...(execution.allowedTools.length > 0
        ? { allowedToolNames: execution.allowedTools }
        : {}),
      ...(registeredHooks?.length
        ? { installedSkillHooks: registeredHooks }
        : {}),
      ...(execution.modelOverride
        ? { modelOverride: execution.modelOverride }
        : {}),
      ...(execution.effortOverride
        ? { effortOverride: execution.effortOverride }
        : {}),
      content: [
        `Loaded installed skill "/${skill.id}".`,
        "Follow the skill instructions below in this conversation.",
        ...(execution.allowedTools.length > 0
          ? [
              "",
              `This skill narrows the available tool set for the rest of the current model turn to: ${execution.allowedTools.join(", ")}.`,
            ]
          : []),
        ...(execution.modelOverride || execution.effortOverride
          ? [
              "",
              `This skill overrides the current runtime for the rest of the current model turn${execution.modelOverride ? ` with model ${execution.modelOverride}` : ""}${execution.effortOverride ? `${execution.modelOverride ? " and" : " with"} effort ${execution.effortOverride}` : ""}.`,
            ]
          : []),
        "",
        "<installed_skill>",
        execution.prompt,
        "</installed_skill>",
      ].join("\n"),
    };
  },

  async SkillManagerTool(input, context) {
    if (!context.skillStore) {
      throw new Error("Skill store is not available in this context");
    }

    const action = typeof input.action === "string" ? input.action : "";

    if (action === "list") {
      const records = await context.skillStore.list();
      if (records.length === 0) {
        return { summary: "No user skills found", content: "No user skills have been saved yet." };
      }
      const lines = records.map(r => {
        const cat = r.category ? `[${r.category}] ` : "";
        return `${cat}${r.name} — ${r.description || "(no description)"}`;
      });
      return {
        summary: `Listed ${records.length} user skill(s)`,
        content: lines.join("\n"),
      };
    }

    if (action === "create") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const content = typeof input.content === "string" ? input.content : "";
      const category = typeof input.category === "string" ? input.category.trim() : undefined;

      if (!name) {
        throw new Error("name is required for action=create");
      }
      if (!content.trim()) {
        throw new Error("content is required for action=create");
      }

      const record = await context.skillStore.create({ name, category: category || undefined, content });
      return {
        summary: `Created skill: ${record.name}`,
        content: `Skill "${record.name}" created successfully.`,
      };
    }

    if (action === "edit") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const content = typeof input.content === "string" ? input.content : "";

      if (!name) {
        throw new Error("name is required for action=edit");
      }
      if (!content.trim()) {
        throw new Error("content is required for action=edit");
      }

      const record = await context.skillStore.edit(name, content);
      return {
        summary: `Edited skill: ${record.name}`,
        content: `Skill "${record.name}" updated successfully.`,
      };
    }

    if (action === "patch") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const oldString = typeof input.old_string === "string" ? input.old_string : "";
      const newString = typeof input.new_string === "string" ? input.new_string : "";

      if (!name) {
        throw new Error("name is required for action=patch");
      }
      if (!oldString) {
        throw new Error("old_string is required for action=patch");
      }

      const record = await context.skillStore.patch(name, oldString, newString);
      return {
        summary: `Patched skill: ${record.name}`,
        content: `Skill "${record.name}" patched successfully.`,
      };
    }

    if (action === "delete") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name) {
        throw new Error("name is required for action=delete");
      }

      await context.skillStore.delete(name);
      return {
        summary: `Deleted skill: ${name}`,
        content: `Skill "${name}" deleted (or did not exist).`,
      };
    }

    throw new Error(
      `Unknown action "${action}". Valid actions: list, create, edit, patch, delete`,
    );
  },

};

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "EnterPlanMode",
    description: "Switch into read-only plan mode for non-trivial implementation work before coding.",
    input_schema: {
      type: "object",
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      title: "Enter plan mode",
    },
  },
  {
    name: "ExitPlanMode",
    description: "Request approval for the written plan and leave plan mode so implementation can begin.",
    input_schema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "Exit plan mode",
    },
  },
  {
    name: "EnterWorktree",
    description:
      "Create an isolated git worktree and switch the current session into it. Use this ONLY when the user explicitly asks to work in a worktree.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Optional worktree name. Each path segment may contain only letters, digits, dots, underscores, and dashes.",
        },
      },
    },
    annotations: {
      title: "Enter worktree",
    },
  },
  {
    name: "ExitWorktree",
    description:
      "Leave the current EnterWorktree session. action=keep preserves the worktree; action=remove deletes the worktree and branch. Only use when the user explicitly asks to leave or remove the worktree.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: 'Required. Either "keep" or "remove".',
        },
        discard_changes: {
          type: "boolean",
          description:
            'Required true when action is "remove" and the worktree contains uncommitted files or extra commits.',
        },
      },
      required: ["action"],
    },
    annotations: {
      destructiveHint: true,
      title: "Exit worktree",
    },
  },
  {
    name: "list_files",
    description: "List files under a workspace path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path relative to the workspace root. Defaults to .",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      title: "List files",
    },
  },
  {
    name: "read_file",
    description: "Read a text file from the workspace.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the workspace root.",
        },
        startLine: {
          type: "number",
          description: "Optional 1-based start line.",
        },
        endLine: {
          type: "number",
          description: "Optional 1-based end line.",
        },
      },
      required: ["path"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Read file",
    },
  },
  {
    name: "search_files",
    description: "Search for text in files under the workspace.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Case-insensitive text to search for.",
        },
        path: {
          type: "string",
          description: "Optional file or directory path relative to the workspace root.",
        },
      },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Search files",
    },
  },
  {
    name: LSP_TOOL_NAME,
    description: "Interact with Language Server Protocol providers for code intelligence. Supported operations: goToDefinition, goToImplementation, findReferences, hover, documentSymbol/documentSymbols, documentDiagnostics, workspaceSymbol/workspaceSymbols, prepareCallHierarchy, incomingCalls, outgoingCalls.",
    input_schema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "One of: goToDefinition, goToImplementation, findReferences, hover, documentSymbol/documentSymbols, documentDiagnostics, workspaceSymbol/workspaceSymbols, prepareCallHierarchy, incomingCalls, outgoingCalls.",
        },
        filePath: {
          type: "string",
          description: "File path relative to the workspace root. Required for location-based operations, documentSymbol/documentSymbols, and documentDiagnostics.",
        },
        line: {
          type: "number",
          description: "1-based line number. Required for location-based operations.",
        },
        character: {
          type: "number",
          description: "1-based character offset. Required for location-based operations.",
        },
        query: {
          type: "string",
          description: "Optional workspace symbol search query. Omit or pass an empty string to request all workspace symbols.",
        },
        severity: {
          type: "string",
          description: "Optional diagnostic severity filter: error, warning, info, or hint. Used by documentDiagnostics.",
        },
        maxResults: {
          type: "number",
          description: "Optional positive limit for returned LSP results.",
        },
        itemIndex: {
          type: "number",
          description: "Optional 1-based call hierarchy item index when multiple items are available.",
        },
      },
      required: ["operation"],
    },
    annotations: {
      readOnlyHint: true,
      title: "LSP code intelligence",
    },
  },
  {
    name: "TaskCreate",
    description:
      "Create a structured task in the current coding-session task list. Use for complex multi-step work, planning, and progress tracking.",
    input_schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Brief actionable task title.",
        },
        description: {
          type: "string",
          description: "Detailed task description.",
        },
        activeForm: {
          type: "string",
          description: "Optional present-continuous label shown while the task is in progress.",
        },
        metadata: {
          type: "object",
          description: "Optional metadata to attach to the task.",
        },
      },
      required: ["subject", "description"],
    },
    annotations: {
      title: "Create task",
    },
  },
  {
    name: "TodoWriteTool",
    description:
      "Create, update, or delete structured TODO tasks in the current coding-session task list using a batch payload.",
    input_schema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description:
            "Required array of todo items. Each item supports id (for updates/deletes), content, optional status (pending, in_progress, completed, deleted), and optional activeForm.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Task ID, required for updates and deletes." },
              content: { type: "string", description: "Task content/description." },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "deleted"],
                description: "Task status.",
              },
              activeForm: { type: "string", description: "Present-continuous label shown while the task is in progress." },
            },
          },
        },
      },
      required: ["todos"],
    },
    annotations: {
      title: "Write todos",
    },
  },
  {
    name: "TaskGet",
    description:
      "Get a structured or background task by ID from the current task list, including provenance and runtime metadata for background tasks.",
    input_schema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to retrieve.",
        },
      },
      required: ["taskId"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Get task",
    },
  },
  {
    name: "TaskList",
    description:
      "List structured and background tasks in the current coding-session task list, with filters and concise provenance for background tasks.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Optional filter: all, structured, or background.",
        },
        status: {
          type: "string",
          description: "Optional status filter across structured/background tasks.",
        },
        query: {
          type: "string",
          description: "Optional case-insensitive text filter.",
        },
        limit: {
          type: "number",
          description: "Optional max number of results to show per task category.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      title: "List tasks",
    },
  },
  {
    name: "TaskUpdate",
    description:
      "Update task status, owner, description, metadata, or dependency links in the current task list.",
    input_schema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to update.",
        },
        subject: {
          type: "string",
          description: "Optional new task title.",
        },
        description: {
          type: "string",
          description: "Optional new task description.",
        },
        activeForm: {
          type: "string",
          description: "Optional new in-progress label.",
        },
        status: {
          type: "string",
          description: "One of pending, in_progress, completed, or deleted.",
        },
        owner: {
          type: "string",
          description: "Optional task owner name.",
        },
        addBlocks: {
          type: "array",
          description: "Optional list of task IDs blocked by this task.",
          items: { type: "string" },
        },
        addBlockedBy: {
          type: "array",
          description: "Optional list of task IDs that block this task.",
          items: { type: "string" },
        },
        metadata: {
          type: "object",
          description: "Optional metadata patch. Use null values to delete keys.",
        },
      },
      required: ["taskId"],
    },
    annotations: {
      destructiveHint: true,
      title: "Update task",
    },
  },
  {
    name: "TaskStop",
    description: "Stop a running background task by ID.",
    aliases: ["KillShell"],
    input_schema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Background task ID to stop.",
        },
        shell_id: {
          type: "string",
          description: "Deprecated alias for task_id.",
        },
      },
    },
    annotations: {
      destructiveHint: true,
      title: "Stop background task",
    },
  },
  {
    name: "TaskOutput",
    description:
      "Read output from a background task by ID, including provenance metadata and detached output file paths when available. Use block=true to wait for completion or block=false for a non-blocking status check.",
    aliases: ["AgentOutputTool", "BashOutputTool"],
    input_schema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Background task ID to inspect.",
        },
        block: {
          type: "boolean",
          description: "Whether to wait for task completion. Defaults to true.",
        },
        timeout: {
          type: "number",
          description: "Maximum wait time in milliseconds. Defaults to 30000.",
        },
      },
      required: ["task_id"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Read background task output",
    },
  },
  {
    name: "ToolSearchTool",
    description:
      "Search available tools by name or description. Supports Claude-style query forms: select:<tool_name>, mcp__server prefixes, and +required keyword terms.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Optional search query. Use "select:ToolA,ToolB" for direct selection, "mcp__server" for MCP prefixes, or "+required optional" for required keyword search.',
        },
        maxResults: {
          type: "number",
          description: "Optional positive limit for returned tools. Defaults to 20.",
        },
        max_results: {
          type: "number",
          description: "Claude-compatible alias for maxResults.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      title: "Search tools",
    },
  },
  {
    name: "RunVerification",
    description:
      "Launch the built-in verification agent against the current workspace state. Use this after non-trivial implementation before claiming completion.",
    input_schema: {
      type: "object",
      properties: {
        guidance: {
          type: "string",
          description:
            "Optional extra verification guidance, such as a risky area or edge case to focus on.",
        },
        diffRef: {
          type: "string",
          description:
            "Optional git diff ref/range to verify instead of the current working tree, e.g. HEAD~3..HEAD or main...HEAD.",
        },
      },
    },
    annotations: {
      title: "Run verification",
    },
  },
  {
    name: "VerifyPlanExecution",
    description:
      "Launch the built-in verification agent for the most recently approved ExitPlanMode plan before claiming the plan is fully implemented.",
    input_schema: {
      type: "object",
      properties: {
        guidance: {
          type: "string",
          description:
            "Optional extra verification guidance, such as a risky plan item or edge case to focus on.",
        },
        diffRef: {
          type: "string",
          description:
            "Optional git diff ref/range to verify for the approved plan, e.g. HEAD~3..HEAD or main...HEAD.",
        },
      },
    },
    annotations: {
      title: "Verify plan execution",
    },
  },
  {
    name: "run_command",
    description: "Run a small allowlisted read-only PowerShell command inside the workspace.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Read-only PowerShell command. Pipes and redirects are blocked.",
        },
      },
      required: ["command"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Run read-only command",
    },
  },
  {
    name: "write_file",
    description: "Write a text file inside the workspace. This can create or overwrite files.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the workspace root.",
        },
        content: {
          type: "string",
          description: "Full text content to write into the file.",
        },
      },
      required: ["path", "content"],
    },
    annotations: {
      destructiveHint: true,
      title: "Write file",
    },
  },
  {
    name: "replace_in_file",
    description: "Replace text inside a workspace file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the workspace root.",
        },
        search: {
          type: "string",
          description: "Exact text to search for.",
        },
        replace: {
          type: "string",
          description: "Replacement text.",
        },
        replaceAll: {
          type: "boolean",
          description: "Replace all matching occurrences instead of just the first one.",
        },
      },
      required: ["path", "search", "replace"],
    },
    annotations: {
      destructiveHint: true,
      title: "Replace text in file",
    },
  },
  {
    name: "WebFetch",
    description:
      "Fetch content from a URL and return readable content scoped to a specific extraction prompt. Cross-host redirects are not followed automatically.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch content from.",
        },
        prompt: {
          type: "string",
          description: "The extraction request to answer using the fetched content.",
        },
      },
      required: ["url", "prompt"],
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Web fetch",
    },
  },
  {
    name: "WebSearch",
    description:
      "Search the web for current information and return link-bearing results. Supports allow/block domain filters.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to execute.",
        },
        allowed_domains: {
          type: "array",
          description: "Optional list of domains to include in the search.",
          items: { type: "string" },
        },
        blocked_domains: {
          type: "array",
          description: "Optional list of domains to exclude from the search.",
          items: { type: "string" },
        },
      },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Web search",
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a webpage or text URL and return the readable text content.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "An http or https URL to read.",
        },
      },
      required: ["url"],
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Fetch URL",
    },
  },
  {
    name: "browser_navigate",
    description: "Open a webpage in the shared browser session.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The http or https URL to open.",
        },
      },
      required: ["url"],
    },
    annotations: {
      openWorldHint: true,
      title: "Browser navigate",
    },
  },
  {
    name: "browser_snapshot",
    description: "Capture the current page title, visible text, and interactive element refs.",
    input_schema: {
      type: "object",
      properties: {
        maxLength: {
          type: "number",
          description: "Optional maximum length for the visible text snapshot.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Browser snapshot",
    },
  },
  {
    name: "browser_click",
    description: "Click an element in the shared browser session using a snapshot ref, CSS selector, or visible text.",
    input_schema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Snapshot ref returned by browser_snapshot, for example ref-1.",
        },
        selector: {
          type: "string",
          description: "CSS selector to click.",
        },
        text: {
          type: "string",
          description: "Visible text to locate and click.",
        },
      },
    },
    annotations: {
      openWorldHint: true,
      title: "Browser click",
    },
  },
  {
    name: "browser_type",
    description: "Type into an input in the shared browser session using a ref, CSS selector, or visible text target.",
    input_schema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Snapshot ref returned by browser_snapshot.",
        },
        selector: {
          type: "string",
          description: "CSS selector for the input element.",
        },
        textTarget: {
          type: "string",
          description: "Visible text or label near the input.",
        },
        value: {
          type: "string",
          description: "Text to type into the field.",
        },
        submit: {
          type: "boolean",
          description: "Press Enter after typing.",
        },
      },
      required: ["value"],
    },
    annotations: {
      openWorldHint: true,
      title: "Browser type",
    },
  },
  {
    name: "browser_wait_for",
    description: "Wait for text to appear or simply wait for some milliseconds.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Optional text to wait for on the page.",
        },
        timeMs: {
          type: "number",
          description: "Optional milliseconds to wait.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Browser wait",
    },
  },
  {
    name: "browser_screenshot",
    description: "Save a screenshot from the shared browser session into the workspace.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional output file path relative to the workspace root.",
        },
        fullPage: {
          type: "boolean",
          description: "Capture the full scrollable page instead of only the viewport.",
        },
      },
    },
    annotations: {
      openWorldHint: true,
      title: "Browser screenshot",
    },
  },
  {
    name: "browser_close",
    description: "Close the shared browser session and clear any stored element refs.",
    input_schema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "Browser close",
    },
  },
  {
    name: "glob_files",
    description: "Find files matching a glob pattern inside the workspace. Supports * (any chars in one segment) and ** (any path depth). Example patterns: **/*.ts, src/**/*.tsx, *.json",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match against file paths relative to the search root.",
        },
        path: {
          type: "string",
          description: "Optional directory path relative to the workspace root to search within. Defaults to workspace root.",
        },
      },
      required: ["pattern"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Glob files",
    },
  },
  {
    name: "RunReview",
    description:
      "Launch the built-in review agent against the current workspace changes and return a findings-first review report.",
    input_schema: {
      type: "object",
      properties: {
        guidance: {
          type: "string",
          description:
            "Optional extra review guidance, such as areas to inspect more carefully.",
        },
        diffRef: {
          type: "string",
          description:
            "Optional git diff ref/range to review instead of the current working tree, e.g. HEAD~3..HEAD or main...HEAD.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      title: "Run built-in review agent",
    },
  },
  {
    name: "RunCommandInBackground",
    description:
      "Launch an allowlisted PowerShell command as a background task. You will be notified when it completes; use TaskOutput only if you need to inspect progress manually.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Allowlisted PowerShell command to run in the current workspace as a background task.",
        },
      },
      required: ["command"],
    },
    annotations: {
      title: "Run background command",
    },
  },
  {
    name: "SkillTool",
    description:
      "Load a model-invocable installed skill from the current KainClaw or Claude-compatible skill directories and return its expanded prompt instructions.",
    input_schema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description:
            "Installed skill id to load. Use the exact id from the Installed Skills section of the system prompt.",
        },
        args: {
          type: "string",
          description:
            "Optional raw argument string passed to the installed skill prompt expander.",
        },
      },
      required: ["skill"],
    },
    annotations: {
      readOnlyHint: true,
      title: "Load installed skill",
    },
  },
  {
    name: "SkillManagerTool",
    description:
      "Manage user skills in the local skill library. Skills are reusable SKILL.md files that encode agent experience for future tasks. Actions: list, create, edit, patch, delete.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "edit", "patch", "delete"],
          description: "The skill management action to perform.",
        },
        name: {
          type: "string",
          description:
            "Skill name in kebab-case (required for create, edit, patch, delete). Pattern: /^[a-z0-9][a-z0-9._-]*$/",
        },
        category: {
          type: "string",
          description: "Optional category name (kebab-case) for create. Groups related skills.",
        },
        content: {
          type: "string",
          description:
            "Full SKILL.md content including YAML frontmatter and markdown body (required for create, edit).",
        },
        old_string: {
          type: "string",
          description: "Exact string to find in the skill content (required for patch).",
        },
        new_string: {
          type: "string",
          description: "Replacement string for the matched old_string (required for patch).",
        },
      },
      required: ["action"],
    },
    annotations: {
      title: "Manage user skills",
    },
  },
];

export function getBuiltInToolDefinitions(options: {
  lspAvailable?: boolean;
  includeLegacyFetchUrl?: boolean;
} = {}): ToolDefinition[] {
  const lspAvailable = options.lspAvailable ?? true;
  const includeLegacyFetchUrl = options.includeLegacyFetchUrl ?? false;
  return toolDefinitions.filter(tool => {
    if (!lspAvailable && tool.name === LSP_TOOL_NAME) {
      return false;
    }

    if (!includeLegacyFetchUrl && tool.name === "fetch_url") {
      return false;
    }

    return true;
  });
}

export function getOpenAIToolsPayload(tools: ToolDefinition[] = toolDefinitions) {
  return dedupeToolDefinitionsByName(tools).map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

export async function executeTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  let effectiveName = normalizeToolName(name);
  let effectiveInput = input;
  let handler = handlers[effectiveName];

  if (!handler && Object.keys(input).length === 0) {
    const commandAlias = name.trim();
    if (commandAlias.includes(" ")) {
      const allowedPrefixes = context.verificationMode?.active
        ? VERIFICATION_ALLOWED_COMMAND_PREFIXES
        : ALLOWED_COMMAND_PREFIXES;
      if (commandStartsWithAllowedPrefix(commandAlias, allowedPrefixes)) {
        effectiveName = "run_command";
        effectiveInput = { command: commandAlias };
        handler = handlers.run_command;
      }
    }
  }

  const executionId = `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  context.onToolLifecycle?.({
    executionId,
    phase: "start",
    toolName: effectiveName,
    input: effectiveInput,
  });

  try {
    let result: ToolExecutionResult | undefined;

    if (handler) {
      result = await handler(effectiveInput, context);
    } else if (effectiveName.startsWith("mcp__") && context.mcp) {
      result = await context.mcp.executeTool(effectiveName, effectiveInput, context);
    } else {
      throw new Error(`Unknown tool: ${effectiveName}`);
    }

    context.onToolLifecycle?.({
      executionId,
      phase: "finish",
      toolName: effectiveName,
      input: effectiveInput,
      summary: result.summary,
      outcome: "success",
    });
    return result;
  } catch (error) {
    const message = toErrorMessage(error);
    context.onToolLifecycle?.({
      executionId,
      phase: "finish",
      toolName: effectiveName,
      input: effectiveInput,
      outcome: "error",
      error: message,
    });
    throw error;
  }
}
