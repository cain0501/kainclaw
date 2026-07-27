import { describe, expect, it, vi } from "vitest";
import type { GitHubMcpDiscovery } from "../mcp/githubMcpDiscovery";
import {
  ConversationalMcpInstallRuntime,
  getGitHubMcpInstallRequest,
} from "./conversationalMcpInstallRuntime";

describe("ConversationalMcpInstallRuntime", () => {
  it("recognizes explicit MCP installation and leaves ordinary repository prompts non-explicit", () => {
    expect(getGitHubMcpInstallRequest("帮我安装这个 MCP：https://github.com/acme/demo")).toEqual({
      repositoryUrl: "https://github.com/acme/demo",
      explicit: true,
    });
    expect(getGitHubMcpInstallRequest("review https://github.com/acme/demo")).toEqual({
      repositoryUrl: "https://github.com/acme/demo",
      explicit: false,
    });
    expect(getGitHubMcpInstallRequest("https://example.com/acme/demo")).toBeUndefined();
  });

  it("writes only the selected candidate and marks runtime configuration dirty", async () => {
    const candidate = {
      name: "context7",
      sourcePath: ".mcp.json",
      config: { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
      requiredEnvironmentVariables: [],
    };
    const addServer = vi.fn(async () => undefined);
    const markConfigDirty = vi.fn();
    const runtime = new ConversationalMcpInstallRuntime({
      discovery: { inspect: vi.fn() } as unknown as GitHubMcpDiscovery,
      addServer,
      markConfigDirty,
    });

    await expect(runtime.install(candidate)).resolves.toMatchObject({
      candidate,
    });
    expect(addServer).toHaveBeenCalledWith(candidate.name, candidate.config);
    expect(markConfigDirty).toHaveBeenCalledOnce();
  });
});
