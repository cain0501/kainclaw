import {
  GitHubMcpDiscovery,
  type GitHubMcpCandidate,
  type GitHubMcpDiscoveryResult,
} from "../mcp/githubMcpDiscovery";
import type { McpRegistryServerConfig } from "../mcpRegistry";

const GITHUB_REPOSITORY_URL = /https:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[A-Za-z0-9_.-]+(?:\/[^\s?#]+)*)?\/?/i;
const MCP_INSTALL_INTENT = /(?:\b(?:install|add|setup)\b.{0,48}\bmcp\b|\bmcp\b.{0,48}\b(?:install|add|setup)\b|(?:安装|添加|接入).{0,24}MCP|MCP.{0,24}(?:安装|添加|接入))/i;

export type ConversationalMcpInstallDependencies = {
  discovery?: GitHubMcpDiscovery;
  addServer(name: string, config: McpRegistryServerConfig): Promise<void>;
  markConfigDirty(): void;
};

export type ConversationalMcpInstallOutcome = {
  candidate: GitHubMcpCandidate;
};

export class ConversationalMcpInstallRuntime {
  private readonly discovery: GitHubMcpDiscovery;

  constructor(private readonly dependencies: ConversationalMcpInstallDependencies) {
    this.discovery = dependencies.discovery ?? new GitHubMcpDiscovery();
  }

  inspect(url: string): Promise<GitHubMcpDiscoveryResult> {
    return this.discovery.inspect(url);
  }

  async install(candidate: GitHubMcpCandidate): Promise<ConversationalMcpInstallOutcome> {
    await this.dependencies.addServer(candidate.name, candidate.config);
    this.dependencies.markConfigDirty();
    return {
      candidate,
    };
  }
}

export function getGitHubMcpInstallRequest(prompt: string): {
  repositoryUrl: string;
  explicit: boolean;
} | undefined {
  const repositoryUrl = prompt.match(GITHUB_REPOSITORY_URL)?.[0]?.replace(/\/$/, "");
  if (!repositoryUrl) {
    return undefined;
  }
  return { repositoryUrl, explicit: MCP_INSTALL_INTENT.test(prompt) };
}
