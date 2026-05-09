import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

const {
  sdkAuthMock,
  discoverAuthorizationServerMetadataMock,
  sdkRefreshAuthorizationMock,
} = vi.hoisted(() => ({
  sdkAuthMock: vi.fn(),
  discoverAuthorizationServerMetadataMock: vi.fn(),
  sdkRefreshAuthorizationMock: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/auth.js", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@modelcontextprotocol/sdk/client/auth.js")>();
  return {
    ...actual,
    auth: sdkAuthMock,
    discoverAuthorizationServerMetadata:
      discoverAuthorizationServerMetadataMock,
    refreshAuthorization: sdkRefreshAuthorizationMock,
  };
});

import {
  createMcpOAuthClientProvider,
  hasMcpDiscoveryButNoToken,
  performMcpOAuthFlow,
  revokeServerTokens,
  type McpOAuthHost,
} from "./mcpOAuth";

class FakeMcpOAuthHost implements McpOAuthHost {
  readonly secrets = new Map<string, string>();
  readonly state = new Map<string, unknown>();
  readonly openedUrls: string[] = [];
  openExternalImpl: (url: string) => Promise<boolean> = async url => {
    this.openedUrls.push(url);
    return true;
  };

  async openExternal(url: string): Promise<boolean> {
    return this.openExternalImpl(url);
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async storeSecret(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    this.state.set(key, value);
  }
}

describe("mcpOAuth", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function createMetadata(
    overrides: Partial<AuthorizationServerMetadata> = {},
  ): AuthorizationServerMetadata {
    return {
      issuer: "https://auth.example.com",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      ...overrides,
    };
  }

  it("persists client information, tokens, and discovery state through the host", async () => {
    const host = new FakeMcpOAuthHost();
    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    expect(await provider.clientInformation()).toBeUndefined();

    await provider.saveClientInformation({
      client_id: "client-id",
      client_secret: "client-secret",
    });
    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "read write",
    });
    await provider.saveDiscoveryState({
      authorizationServerUrl: "https://auth.example.com",
      resourceMetadataUrl: "https://api.example.com/.well-known/oauth-protected-resource",
    });

    await expect(provider.clientInformation()).resolves.toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
    });
    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("access-token");
    expect(tokens?.refresh_token).toBe("refresh-token");
    expect(tokens?.scope).toBe("read write");
    expect(tokens?.expires_in).toBeGreaterThan(3500);
    await expect(provider.discoveryState()).resolves.toEqual({
      authorizationServerUrl: "https://auth.example.com",
      resourceMetadataUrl:
        "https://api.example.com/.well-known/oauth-protected-resource",
    });

    await provider.invalidateCredentials("tokens");
    await expect(provider.tokens()).resolves.toBeUndefined();
  });

  it("reports when OAuth discovery exists but no access or refresh token remains", async () => {
    const host = new FakeMcpOAuthHost();
    const config = {
      kind: "streamable-http" as const,
      url: "https://api.example.com/mcp",
    };
    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config,
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    await provider.saveDiscoveryState({
      authorizationServerUrl: "https://auth.example.com",
    });

    await expect(
      hasMcpDiscoveryButNoToken({
        host,
        serverName: "github",
        config,
      }),
    ).resolves.toBe(true);

    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    await expect(
      hasMcpDiscoveryButNoToken({
        host,
        serverName: "github",
        config,
      }),
    ).resolves.toBe(false);

    await provider.invalidateCredentials("tokens");

    await expect(
      hasMcpDiscoveryButNoToken({
        host,
        serverName: "github",
        config,
      }),
    ).resolves.toBe(true);
  });

  it("completes the browser-based MCP OAuth flow and stores tokens", async () => {
    const host = new FakeMcpOAuthHost();
    let authCallCount = 0;

    host.openExternalImpl = async url => {
      host.openedUrls.push(url);
      const authUrl = new URL(url);
      const redirectUrl = authUrl.searchParams.get("redirect_uri");
      const state = authUrl.searchParams.get("state");
      queueMicrotask(() => {
        void fetch(`${redirectUrl}?code=code-123&state=${state}`);
      });
      return true;
    };

    sdkAuthMock.mockImplementation(async (provider, options) => {
      authCallCount += 1;
      if (authCallCount === 1) {
        const state = await provider.state?.();
        await provider.redirectToAuthorization(
          new URL(
            `https://auth.example.com/authorize?state=${state}&redirect_uri=${encodeURIComponent(String(provider.redirectUrl))}`,
          ),
        );
        return "REDIRECT";
      }

      expect(options.authorizationCode).toBe("code-123");
      await provider.saveTokens({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
      });
      return "AUTHORIZED";
    });

    await performMcpOAuthFlow({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
      },
      host,
      onAuthorizationUrl: () => undefined,
    });

    expect(host.openedUrls).toHaveLength(1);

    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });
    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("access-token");
    expect(tokens?.refresh_token).toBe("refresh-token");
  });

  it("rejects XAA-backed MCP OAuth flows in this host", async () => {
    const host = new FakeMcpOAuthHost();

    await expect(
      performMcpOAuthFlow({
        serverName: "github",
        config: {
          kind: "streamable-http",
          url: "https://api.example.com/mcp",
          oauth: {
            xaa: true,
          },
        },
        host,
        onAuthorizationUrl: () => undefined,
      }),
    ).rejects.toThrow("XAA OAuth");
  });

  it("proactively refreshes near-expiry tokens and dedupes concurrent refreshes", async () => {
    const host = new FakeMcpOAuthHost();
    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
        oauth: { clientId: "client-id" },
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    await provider.saveTokens({
      access_token: "old-access-token",
      refresh_token: "refresh-token",
      expires_in: 60,
      token_type: "Bearer",
    });

    discoverAuthorizationServerMetadataMock.mockResolvedValue(createMetadata());
    let resolveRefresh: ((value: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    }) => void) | undefined;
    sdkRefreshAuthorizationMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        }),
    );

    const first = provider.tokens();
    const second = provider.tokens();
    await vi.waitFor(() => {
      expect(resolveRefresh).toBeTypeOf("function");
    });
    resolveRefresh?.({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const [firstTokens, secondTokens] = await Promise.all([first, second]);
    expect(firstTokens?.access_token).toBe("new-access-token");
    expect(secondTokens?.access_token).toBe("new-access-token");
    expect(sdkRefreshAuthorizationMock).toHaveBeenCalledTimes(1);
  });

  it("clears stored tokens when refresh hits a Slack-style invalid grant response", async () => {
    const host = new FakeMcpOAuthHost();
    const provider = createMcpOAuthClientProvider({
      serverName: "slack",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
        oauth: { clientId: "client-id" },
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    discoverAuthorizationServerMetadataMock.mockResolvedValue(createMetadata());
    sdkRefreshAuthorizationMock.mockImplementation(async (...args: Parameters<
      typeof import("@modelcontextprotocol/sdk/client/auth.js").refreshAuthorization
    >) => {
      const actual =
        await vi.importActual<typeof import("@modelcontextprotocol/sdk/client/auth.js")>(
          "@modelcontextprotocol/sdk/client/auth.js",
        );
      return actual.refreshAuthorization(args[0], args[1]);
    });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "invalid_refresh_token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ) as typeof fetch;

    await expect(
      provider.refreshAuthorization("refresh-token"),
    ).resolves.toBeUndefined();
    await expect(provider.tokens()).resolves.toBeUndefined();
  });

  it("retries transient refresh failures up to success", async () => {
    const host = new FakeMcpOAuthHost();
    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
        oauth: { clientId: "client-id" },
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    discoverAuthorizationServerMetadataMock.mockResolvedValue(createMetadata());
    sdkRefreshAuthorizationMock
      .mockRejectedValueOnce(new Error("503 temporarily unavailable"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({
        access_token: "recovered-access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

    const refreshed = await provider.refreshAuthorization("refresh-token");
    expect(refreshed?.access_token).toBe("recovered-access-token");
    expect(sdkRefreshAuthorizationMock).toHaveBeenCalledTimes(3);
  });

  it("revokes server tokens best-effort and always clears local credentials", async () => {
    const host = new FakeMcpOAuthHost();
    const provider = createMcpOAuthClientProvider({
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
        oauth: { clientId: "client-id" },
      },
      host,
      redirectUrl: "http://localhost:3118/callback",
    });

    await provider.saveClientInformation({
      client_id: "client-id",
    });
    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    discoverAuthorizationServerMetadataMock.mockResolvedValue(
      createMetadata({
        revocation_endpoint: "https://auth.example.com/revoke",
      }),
    );
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;

    await revokeServerTokens({
      host,
      serverName: "github",
      config: {
        kind: "streamable-http",
        url: "https://api.example.com/mcp",
        oauth: { clientId: "client-id" },
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    await expect(provider.tokens()).resolves.toBeUndefined();
  });
});
