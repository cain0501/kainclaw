import { describe, expect, it, vi } from "vitest";
import {
  GitHubMcpDiscovery,
  GitHubMcpDiscoveryError,
  parseGitHubMcpRepositoryUrl,
} from "./githubMcpDiscovery";

function jsonResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("GitHubMcpDiscovery", () => {
  it("normalizes public repository and tree URLs", () => {
    expect(parseGitHubMcpRepositoryUrl("https://github.com/acme/demo")).toEqual({
      owner: "acme",
      repository: "demo",
      sourcePath: "",
    });
    expect(parseGitHubMcpRepositoryUrl("https://github.com/acme/demo/tree/main/integrations/mcp")).toEqual({
      owner: "acme",
      repository: "demo",
      ref: "main",
      sourcePath: "integrations/mcp",
    });
  });

  it("rejects non-repository, credential-bearing, and non-GitHub URLs", () => {
    for (const value of [
      "https://example.com/acme/demo",
      "https://user:secret@github.com/acme/demo",
      "https://github.com/acme/demo/issues/1",
      "file:///acme/demo",
    ]) {
      expect(() => parseGitHubMcpRepositoryUrl(value)).toThrow(GitHubMcpDiscoveryError);
    }
  });

  it("discovers and sanitizes wrapped MCP declarations", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/acme/demo") {
        return jsonResponse({ default_branch: "main" });
      }
      if (url.endsWith("/.mcp.json")) {
        return jsonResponse({
          mcpServers: {
            github: {
              type: "http",
              url: "https://mcp.example.com",
              headers: {
                Authorization: "Bearer literal-secret",
                Accept: "application/json",
              },
            },
            context7: {
              command: "npx",
              args: ["-y", "@upstash/context7-mcp"],
              env: { API_KEY: "${CONTEXT7_API_KEY}" },
            },
          },
        });
      }
      return new Response(null, { status: 404 });
    });

    const result = await new GitHubMcpDiscovery(fetcher).inspect("https://github.com/acme/demo");

    expect(result.resolvedRef).toBe("main");
    expect(result.candidates.map(candidate => candidate.name)).toEqual(["github", "context7"]);
    expect(result.candidates[0]?.config.headers).toEqual({ Accept: "application/json" });
    expect(result.candidates[1]?.requiredEnvironmentVariables).toEqual(["CONTEXT7_API_KEY"]);
    expect(JSON.stringify(result)).not.toContain("literal-secret");
    expect(result.warnings).toContain("Imported github without literal credential values.");
  });

  it("supports Claude plugin-style top-level declarations", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/mcp.json")) {
        return jsonResponse({ context7: { command: "npx", args: ["-y", "@upstash/context7-mcp"] } });
      }
      return new Response(null, { status: 404 });
    });

    const result = await new GitHubMcpDiscovery(fetcher).inspect("https://github.com/acme/demo/tree/v1");

    expect(result.resolvedRef).toBe("v1");
    expect(result.candidates).toMatchObject([{ name: "context7", sourcePath: "mcp.json" }]);
    expect(fetcher).not.toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/demo",
      expect.anything(),
    );
  });

  it("resolves tree URLs whose branch names contain slashes", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/acme/demo/git/matching-refs/heads/feature") {
        return jsonResponse([{ ref: "refs/heads/feature/demo" }]);
      }
      if (url.endsWith("/feature%2Fdemo/integrations/mcp/.mcp.json")) {
        return jsonResponse({ mcpServers: { demo: { command: "node", args: ["server.js"] } } });
      }
      return new Response(null, { status: 404 });
    });

    const result = await new GitHubMcpDiscovery(fetcher).inspect(
      "https://github.com/acme/demo/tree/feature/demo/integrations/mcp",
    );

    expect(result.repository).toMatchObject({ ref: "feature/demo", sourcePath: "integrations/mcp" });
    expect(result.candidates).toMatchObject([{ name: "demo", sourcePath: "integrations/mcp/.mcp.json" }]);
  });

  it("rejects redirects and oversized declarations before parsing", async () => {
    const redirecting = new GitHubMcpDiscovery(async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.com" },
    }));
    await expect(redirecting.inspect("https://github.com/acme/demo/tree/main")).rejects.toMatchObject({
      code: "unsafe_redirect",
    });

    const oversized = new GitHubMcpDiscovery(async () => jsonResponse({}, 200, {
      "content-length": "9999",
    }), { maxManifestBytes: 10 });
    await expect(oversized.inspect("https://github.com/acme/demo/tree/main")).rejects.toMatchObject({
      code: "response_too_large",
    });
  });
});
