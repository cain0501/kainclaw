import { describe, expect, it, vi, beforeEach } from "vitest";

const { sdkAuthMock, discoverAuthorizationServerMetadataMock } = vi.hoisted(
  () => ({
    sdkAuthMock: vi.fn(),
    discoverAuthorizationServerMetadataMock: vi.fn(),
  }),
);

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  auth: sdkAuthMock,
  discoverAuthorizationServerMetadata: discoverAuthorizationServerMetadataMock,
}));

import {
  createMcpOAuthClientProvider,
  performMcpOAuthFlow,
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
