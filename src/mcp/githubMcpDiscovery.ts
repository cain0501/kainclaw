import {
  parseMcpServerDocument,
  type McpRegistryServerConfig,
} from "../mcpRegistry";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_CONTENT_ORIGIN = "https://raw.githubusercontent.com";
const MANIFEST_FILENAMES = [".mcp.json", "mcp.json"] as const;

export const GITHUB_MCP_MAX_MANIFEST_BYTES = 128 * 1024;
export const GITHUB_MCP_MAX_CANDIDATES = 5;

export type GitHubMcpRepository = {
  owner: string;
  repository: string;
  ref?: string;
  sourcePath: string;
};

export type GitHubMcpCandidate = {
  name: string;
  config: McpRegistryServerConfig;
  sourcePath: string;
  requiredEnvironmentVariables: string[];
};

export type GitHubMcpDiscoveryResult = {
  repository: GitHubMcpRepository;
  resolvedRef: string;
  candidates: GitHubMcpCandidate[];
  warnings: string[];
};

export type GitHubMcpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class GitHubMcpDiscoveryError extends Error {
  constructor(
    readonly code:
      | "invalid_url"
      | "repository_unavailable"
      | "unsafe_redirect"
      | "response_too_large"
      | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "GitHubMcpDiscoveryError";
  }
}

export class GitHubMcpDiscovery {
  constructor(
    private readonly fetcher: GitHubMcpFetch = globalThis.fetch,
    private readonly options: {
      timeoutMs?: number;
      maxManifestBytes?: number;
      maxCandidates?: number;
    } = {},
  ) {}

  async inspect(repositoryUrl: string): Promise<GitHubMcpDiscoveryResult> {
    const repository = await this.resolveTreeReference(parseGitHubMcpRepositoryUrl(repositoryUrl));
    const resolvedRef = repository.ref ?? await this.getDefaultBranch(repository);
    const warnings: string[] = [];
    const candidates: GitHubMcpCandidate[] = [];

    for (const filename of MANIFEST_FILENAMES) {
      const sourcePath = joinGitHubPath(repository.sourcePath, filename);
      const manifest = await this.readOptionalManifest(repository, resolvedRef, sourcePath, warnings);
      if (!manifest) {
        continue;
      }

      const parsed = parseManifestCandidates(manifest, sourcePath, warnings);
      for (const candidate of parsed) {
        if (candidates.length >= (this.options.maxCandidates ?? GITHUB_MCP_MAX_CANDIDATES)) {
          warnings.push("Only the first supported MCP server candidates were inspected.");
          break;
        }
        candidates.push(candidate);
      }
      if (candidates.length >= (this.options.maxCandidates ?? GITHUB_MCP_MAX_CANDIDATES)) {
        break;
      }
    }

    return { repository, resolvedRef, candidates, warnings };
  }

  private async getDefaultBranch(repository: GitHubMcpRepository): Promise<string> {
    const url = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;
    const metadata = await this.fetchJson(url);
    const branch = metadata.default_branch;
    if (typeof branch !== "string" || !branch.trim()) {
      throw new GitHubMcpDiscoveryError("invalid_response", "GitHub repository metadata did not include a default branch.");
    }
    return branch;
  }

  private async resolveTreeReference(repository: GitHubMcpRepository): Promise<GitHubMcpRepository> {
    if (!repository.ref || !repository.sourcePath) {
      return repository;
    }

    const combinedPath = `${repository.ref}/${repository.sourcePath}`;
    const refs = await this.getMatchingRefs(repository, repository.ref);
    const matchingRef = refs
      .filter(ref => combinedPath === ref || combinedPath.startsWith(`${ref}/`))
      .sort((left, right) => right.length - left.length)[0];
    if (!matchingRef) {
      return repository;
    }

    return {
      ...repository,
      ref: matchingRef,
      sourcePath: combinedPath.slice(matchingRef.length).replace(/^\//, ""),
    };
  }

  private async getMatchingRefs(repository: GitHubMcpRepository, prefix: string): Promise<string[]> {
    const encodedPrefix = prefix.split("/").map(encodeURIComponent).join("/");
    const baseUrl = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/git/matching-refs`;
    const branchRefs = await this.fetchJsonArray(`${baseUrl}/heads/${encodedPrefix}`);
    const refs = branchRefs.length > 0
      ? branchRefs
      : await this.fetchJsonArray(`${baseUrl}/tags/${encodedPrefix}`);
    return refs
      .map(entry => typeof entry.ref === "string" ? entry.ref : "")
      .map(ref => ref.replace(/^refs\/(?:heads|tags)\//, ""))
      .filter(ref => ref && isGitHubRef(ref));
  }

  private async readOptionalManifest(
    repository: GitHubMcpRepository,
    ref: string,
    sourcePath: string,
    warnings: string[],
  ): Promise<Record<string, unknown> | undefined> {
    const pathSegments = sourcePath.split("/").map(encodeURIComponent).join("/");
    const url = `${GITHUB_CONTENT_ORIGIN}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/${encodeURIComponent(ref)}/${pathSegments}`;
    const response = await this.fetchResponse(url);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new GitHubMcpDiscoveryError(
        "repository_unavailable",
        `GitHub could not read the MCP declaration (${response.status}).`,
      );
    }

    const text = await readBoundedResponseText(response, this.options.maxManifestBytes ?? GITHUB_MCP_MAX_MANIFEST_BYTES);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("expected a JSON object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      warnings.push(`Ignored ${sourcePath}: it is not a valid MCP JSON declaration.`);
      return undefined;
    }
  }

  private async fetchJson(url: string): Promise<Record<string, unknown>> {
    const response = await this.fetchResponse(url);
    if (!response.ok) {
      throw new GitHubMcpDiscoveryError(
        "repository_unavailable",
        `GitHub could not read repository metadata (${response.status}).`,
      );
    }
    const text = await readBoundedResponseText(response, this.options.maxManifestBytes ?? GITHUB_MCP_MAX_MANIFEST_BYTES);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("expected object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new GitHubMcpDiscoveryError("invalid_response", "GitHub returned invalid repository metadata.");
    }
  }

  private async fetchJsonArray(url: string): Promise<Record<string, unknown>[]> {
    const response = await this.fetchResponse(url);
    if (!response.ok) {
      throw new GitHubMcpDiscoveryError(
        "repository_unavailable",
        `GitHub could not resolve the repository branch (${response.status}).`,
      );
    }
    const text = await readBoundedResponseText(response, this.options.maxManifestBytes ?? GITHUB_MCP_MAX_MANIFEST_BYTES);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed) || parsed.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))) {
        throw new Error("expected array");
      }
      return parsed as Record<string, unknown>[];
    } catch {
      throw new GitHubMcpDiscoveryError("invalid_response", "GitHub returned invalid branch metadata.");
    }
  }

  private async fetchResponse(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: "application/vnd.github+json" },
        redirect: "manual",
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new GitHubMcpDiscoveryError("repository_unavailable", "GitHub repository inspection is unavailable.");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new GitHubMcpDiscoveryError("unsafe_redirect", "GitHub repository inspection rejected a redirect.");
    }
    return response;
  }
}

export function parseGitHubMcpRepositoryUrl(value: string): GitHubMcpRepository {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new GitHubMcpDiscoveryError("invalid_url", "Provide a public GitHub repository URL.");
  }
  if (
    url.protocol !== "https:" ||
    !GITHUB_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new GitHubMcpDiscoveryError("invalid_url", "Provide a public GitHub repository URL.");
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [owner, repository, marker, ref, ...sourcePath] = parts;
  if (!isGitHubSegment(owner) || !isGitHubSegment(repository)) {
    throw new GitHubMcpDiscoveryError("invalid_url", "Provide a public GitHub repository URL.");
  }
  if (marker === undefined) {
    return { owner, repository, sourcePath: "" };
  }
  if (marker !== "tree" || !isGitHubSegment(ref) || sourcePath.some(segment => !isGitHubPathSegment(segment))) {
    throw new GitHubMcpDiscoveryError("invalid_url", "Provide a GitHub repository URL or a repository tree URL.");
  }
  return { owner, repository, ref, sourcePath: sourcePath.join("/") };
}

function parseManifestCandidates(
  manifest: Record<string, unknown>,
  sourcePath: string,
  warnings: string[],
): GitHubMcpCandidate[] {
  const configs = parseMcpServerDocument(manifest, { allowTopLevelServers: true });
  const rawConfigs = getRawServerConfigs(manifest);
  const candidates: GitHubMcpCandidate[] = [];
  for (const [name, config] of Object.entries(configs)) {
    if (hasStaticSensitiveValue(rawConfigs[name])) {
      warnings.push(`Imported ${name} without literal credential values.`);
    }
    candidates.push({
      name,
      config,
      sourcePath,
      requiredEnvironmentVariables: collectEnvironmentPlaceholders(config),
    });
  }
  return candidates;
}

function getRawServerConfigs(manifest: Record<string, unknown>): Record<string, unknown> {
  const wrapped = manifest.mcpServers ?? manifest.servers;
  return wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)
    ? wrapped as Record<string, unknown>
    : manifest;
}

function hasStaticSensitiveValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const config = value as Record<string, unknown>;
  return [config.env, config.headers].some(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return false;
    }
    return Object.entries(record).some(([key, entry]) =>
      /authorization|cookie|token|secret|api[-_]?key/i.test(key) &&
      typeof entry === "string" &&
      !/\$\{[A-Z_][A-Z0-9_]*\}/i.test(entry),
    );
  });
}

function collectEnvironmentPlaceholders(config: McpRegistryServerConfig): string[] {
  const values = [
    config.command,
    config.url,
    ...(config.args ?? []),
    ...Object.values(config.env ?? {}),
    ...Object.values(config.headers ?? {}),
  ];
  const variables = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    for (const match of value.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/gi)) {
      variables.add(match[1]!);
    }
  }
  return [...variables].sort();
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new GitHubMcpDiscoveryError("response_too_large", "GitHub MCP declaration is too large to inspect safely.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new GitHubMcpDiscoveryError("response_too_large", "GitHub MCP declaration is too large to inspect safely.");
  }
  return text;
}

function joinGitHubPath(prefix: string, filename: string): string {
  return prefix ? `${prefix}/${filename}` : filename;
}

function isGitHubSegment(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value);
}

function isGitHubPathSegment(value: string): boolean {
  return value !== "." && value !== ".." && value.length > 0 && !value.includes("\\");
}

function isGitHubRef(value: string): boolean {
  return value.split("/").every(isGitHubSegment);
}
