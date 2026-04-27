import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  auth as sdkAuth,
  discoverAuthorizationServerMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export type McpOAuthHost = {
  openExternal(url: string): Promise<boolean>;
  getSecret(key: string): Promise<string | undefined>;
  storeSecret(key: string, value: string): Promise<void>;
  getState<T>(key: string): T | undefined;
  setState<T>(key: string, value: T): Promise<void>;
};

export type McpOAuthConfig = {
  clientId?: string;
  callbackPort?: number;
  authServerMetadataUrl?: string;
  xaa?: boolean;
};

export type McpOAuthRemoteServerConfig = {
  kind: "streamable-http" | "sse";
  url: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
};

type StoredOAuthCredential = {
  serverName: string;
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

type StoredOAuthDiscoveryState = {
  authorizationServerUrl: string;
  resourceMetadataUrl?: string;
};

const MCP_OAUTH_CREDENTIALS_SECRET_KEY = "cain.mcp.oauth.credentials.v1";
const MCP_OAUTH_DISCOVERY_STATE_KEY = "cain.mcp.oauth.discovery.v1";
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_REDIRECT_PORT_FALLBACK = 3118;

export function getMcpOAuthServerKey(
  serverName: string,
  config: McpOAuthRemoteServerConfig,
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        serverName,
        kind: config.kind,
        url: config.url,
        headers: config.headers ?? {},
        oauth: {
          clientId: config.oauth?.clientId ?? "",
          authServerMetadataUrl: config.oauth?.authServerMetadataUrl ?? "",
          xaa: config.oauth?.xaa ?? false,
        },
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return `${serverName}|${hash}`;
}

function getRedirectPortRange(): { min: number; max: number } {
  return process.platform === "win32"
    ? { min: 39152, max: 49151 }
    : { min: 49152, max: 65535 };
}

export function buildRedirectUri(port = OAUTH_REDIRECT_PORT_FALLBACK): string {
  return `http://localhost:${port}/callback`;
}

export async function findAvailablePort(): Promise<number> {
  const configured = parseInt(process.env.MCP_OAUTH_CALLBACK_PORT ?? "", 10);
  if (configured > 0) {
    return configured;
  }

  const { min, max } = getRedirectPortRange();
  const range = max - min + 1;

  for (let attempt = 0; attempt < Math.min(range, 100); attempt += 1) {
    const port = min + Math.floor(Math.random() * range);
    const available = await canListenOnPort(port);
    if (available) {
      return port;
    }
  }

  if (await canListenOnPort(OAUTH_REDIRECT_PORT_FALLBACK)) {
    return OAUTH_REDIRECT_PORT_FALLBACK;
  }

  throw new Error("No available ports for MCP OAuth redirect");
}

async function canListenOnPort(port: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

function safeParseJsonMap<T>(raw: string | undefined): Record<string, T> {
  if (!raw?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, T>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readCredentialMap(
  host: McpOAuthHost,
): Promise<Record<string, StoredOAuthCredential>> {
  return safeParseJsonMap<StoredOAuthCredential>(
    await host.getSecret(MCP_OAUTH_CREDENTIALS_SECRET_KEY),
  );
}

async function writeCredentialMap(
  host: McpOAuthHost,
  map: Record<string, StoredOAuthCredential>,
): Promise<void> {
  await host.storeSecret(
    MCP_OAUTH_CREDENTIALS_SECRET_KEY,
    JSON.stringify(map),
  );
}

function readDiscoveryMap(
  host: McpOAuthHost,
): Record<string, StoredOAuthDiscoveryState> {
  const value =
    host.getState<Record<string, StoredOAuthDiscoveryState>>(
      MCP_OAUTH_DISCOVERY_STATE_KEY,
    );
  return value && typeof value === "object" ? value : {};
}

export async function hasMcpDiscoveryButNoToken(options: {
  host: McpOAuthHost;
  serverName: string;
  config: McpOAuthRemoteServerConfig;
}): Promise<boolean> {
  const serverKey = getMcpOAuthServerKey(options.serverName, options.config);
  const credentialMap = await readCredentialMap(options.host);
  const discoveryMap = readDiscoveryMap(options.host);
  const storedCredential = credentialMap[serverKey];
  const storedDiscovery = discoveryMap[serverKey];

  return !!(
    storedDiscovery &&
    (
      !storedCredential ||
      (!storedCredential.accessToken && !storedCredential.refreshToken)
    )
  );
}

async function writeDiscoveryMap(
  host: McpOAuthHost,
  map: Record<string, StoredOAuthDiscoveryState>,
): Promise<void> {
  await host.setState(MCP_OAUTH_DISCOVERY_STATE_KEY, map);
}

async function fetchConfiguredAuthorizationServerMetadata(
  metadataUrl: string,
): Promise<AuthorizationServerMetadata> {
  const response = await fetch(metadataUrl, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch MCP auth server metadata (${response.status})`,
    );
  }
  return await response.json() as AuthorizationServerMetadata;
}

function createAuthFetchForServer(
  config: McpOAuthRemoteServerConfig,
): typeof fetch {
  const serverUrl = new URL(config.url);
  const metadataUrl = config.oauth?.authServerMetadataUrl;

  return async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    const headers = new Headers(init?.headers);

    const shouldAttachHeaders =
      requestUrl.origin === serverUrl.origin ||
      (typeof metadataUrl === "string" && requestUrl.toString() === metadataUrl);

    if (shouldAttachHeaders) {
      for (const [key, value] of Object.entries(config.headers ?? {})) {
        if (!headers.has(key)) {
          headers.set(key, value);
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error("MCP OAuth request timed out")),
      30_000,
    );

    const abortHandler = () => controller.abort();
    init?.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      return await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      init?.signal?.removeEventListener("abort", abortHandler);
    }
  };
}

export class HostBackedMcpOAuthClientProvider implements OAuthClientProvider {
  private readonly serverKey: string;
  private codeVerifierValue: string | undefined;
  private stateValue: string | undefined;

  constructor(
    private readonly serverName: string,
    private readonly config: McpOAuthRemoteServerConfig,
    private readonly host: McpOAuthHost,
    private readonly redirectUrlValue: string,
    private readonly onAuthorizationUrl: (url: string) => void,
    private readonly skipBrowserOpen = false,
  ) {
    this.serverKey = getMcpOAuthServerKey(serverName, config);
  }

  get redirectUrl(): string {
    return this.redirectUrlValue;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "KainClaw MCP Client",
      redirect_uris: [this.redirectUrlValue],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    if (!this.stateValue) {
      this.stateValue = randomBytes(32).toString("base64url");
    }
    return this.stateValue;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const map = await readCredentialMap(this.host);
    const stored = map[this.serverKey];
    if (stored?.clientId) {
      return {
        client_id: stored.clientId,
        ...(stored.clientSecret ? { client_secret: stored.clientSecret } : {}),
      };
    }

    if (this.config.oauth?.clientId) {
      return {
        client_id: this.config.oauth.clientId,
      };
    }

    return undefined;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    const map = await readCredentialMap(this.host);
    const existing = map[this.serverKey];
    map[this.serverKey] = {
      serverName: this.serverName,
      serverUrl: this.config.url,
      accessToken: existing?.accessToken ?? "",
      expiresAt: existing?.expiresAt ?? 0,
      refreshToken: existing?.refreshToken,
      scope: existing?.scope,
      clientId: clientInformation.client_id,
      ...(clientInformation.client_secret
        ? { clientSecret: clientInformation.client_secret }
        : {}),
    };
    await writeCredentialMap(this.host, map);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const map = await readCredentialMap(this.host);
    const stored = map[this.serverKey];
    if (!stored?.accessToken) {
      return undefined;
    }

    const expiresIn = Math.floor((stored.expiresAt - Date.now()) / 1000);
    if (expiresIn <= 0 && !stored.refreshToken) {
      return undefined;
    }

    return {
      access_token: stored.accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      ...(stored.refreshToken ? { refresh_token: stored.refreshToken } : {}),
      ...(stored.scope ? { scope: stored.scope } : {}),
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const map = await readCredentialMap(this.host);
    const existing = map[this.serverKey];
    map[this.serverKey] = {
      serverName: this.serverName,
      serverUrl: this.config.url,
      clientId: existing?.clientId ?? this.config.oauth?.clientId,
      clientSecret: existing?.clientSecret,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      scope: tokens.scope,
    };
    await writeCredentialMap(this.host, map);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const url = authorizationUrl.toString();
    this.onAuthorizationUrl(url);
    if (!this.skipBrowserOpen) {
      await this.host.openExternal(url);
    }
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.codeVerifierValue = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this.codeVerifierValue) {
      throw new Error("No code verifier saved");
    }
    return this.codeVerifierValue;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "verifier") {
      this.codeVerifierValue = undefined;
      return;
    }

    const credentialMap = await readCredentialMap(this.host);
    const discoveryMap = readDiscoveryMap(this.host);
    const stored = credentialMap[this.serverKey];

    switch (scope) {
      case "all":
        delete credentialMap[this.serverKey];
        delete discoveryMap[this.serverKey];
        break;
      case "client":
        if (stored) {
          stored.clientId = undefined;
          stored.clientSecret = undefined;
        }
        break;
      case "tokens":
        if (stored) {
          stored.accessToken = "";
          stored.refreshToken = undefined;
          stored.expiresAt = 0;
          stored.scope = undefined;
        }
        break;
      case "discovery":
        delete discoveryMap[this.serverKey];
        break;
    }

    await writeCredentialMap(this.host, credentialMap);
    await writeDiscoveryMap(this.host, discoveryMap);
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const map = readDiscoveryMap(this.host);
    map[this.serverKey] = {
      authorizationServerUrl: state.authorizationServerUrl,
      ...(state.resourceMetadataUrl
        ? { resourceMetadataUrl: state.resourceMetadataUrl }
        : {}),
    };
    await writeDiscoveryMap(this.host, map);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const stored = readDiscoveryMap(this.host)[this.serverKey];
    if (stored?.authorizationServerUrl) {
      return {
        authorizationServerUrl: stored.authorizationServerUrl,
        ...(stored.resourceMetadataUrl
          ? { resourceMetadataUrl: stored.resourceMetadataUrl }
          : {}),
      };
    }

    if (this.config.oauth?.authServerMetadataUrl) {
      const metadata = await fetchConfiguredAuthorizationServerMetadata(
        this.config.oauth.authServerMetadataUrl,
      );
      return {
        authorizationServerUrl: metadata.issuer,
        authorizationServerMetadata: metadata,
      };
    }

    return undefined;
  }
}

export function createMcpOAuthClientProvider(options: {
  serverName: string;
  config: McpOAuthRemoteServerConfig;
  host: McpOAuthHost;
  onAuthorizationUrl?: (url: string) => void;
  skipBrowserOpen?: boolean;
  redirectUrl?: string;
}): HostBackedMcpOAuthClientProvider {
  const redirectUrl =
    options.redirectUrl ??
    buildRedirectUri(
      options.config.oauth?.callbackPort ?? OAUTH_REDIRECT_PORT_FALLBACK,
    );
  return new HostBackedMcpOAuthClientProvider(
    options.serverName,
    options.config,
    options.host,
    redirectUrl,
    options.onAuthorizationUrl ?? (() => undefined),
    options.skipBrowserOpen ?? false,
  );
}

export async function performMcpOAuthFlow(options: {
  serverName: string;
  config: McpOAuthRemoteServerConfig;
  host: McpOAuthHost;
  onAuthorizationUrl: (url: string) => void;
  abortSignal?: AbortSignal;
}): Promise<void> {
  if (options.config.oauth?.xaa) {
    throw new Error(
      `Server "${options.serverName}" uses XAA OAuth which is not wired in this host yet.`,
    );
  }

  const port =
    options.config.oauth?.callbackPort ?? (await findAvailablePort());
  const redirectUrl = buildRedirectUri(port);
  const provider = createMcpOAuthClientProvider({
    serverName: options.serverName,
    config: options.config,
    host: options.host,
    onAuthorizationUrl: options.onAuthorizationUrl,
    redirectUrl,
  });

  await provider.invalidateCredentials("tokens");
  await provider.invalidateCredentials("client");
  await provider.invalidateCredentials("verifier");

  const expectedState = await provider.state();
  const callbackWaiter = waitForOAuthCallback({
    serverName: options.serverName,
    redirectUrl,
    expectedState,
    abortSignal: options.abortSignal,
  });
  const fetchFn = createAuthFetchForServer(options.config);

  try {
    const firstResult = await sdkAuth(provider, {
      serverUrl: options.config.url,
      fetchFn,
    });

    if (firstResult === "AUTHORIZED") {
      callbackWaiter.cleanup();
      return;
    }

    const authorizationCode = await callbackWaiter.promise;
    const finalResult = await sdkAuth(provider, {
      serverUrl: options.config.url,
      authorizationCode,
      fetchFn,
    });

    if (finalResult !== "AUTHORIZED") {
      throw new Error(
        `MCP OAuth flow for "${options.serverName}" did not complete successfully.`,
      );
    }
  } finally {
    callbackWaiter.cleanup();
  }
}

function waitForOAuthCallback(options: {
  serverName: string;
  redirectUrl: string;
  expectedState: string;
  abortSignal?: AbortSignal;
}): {
  promise: Promise<string>;
  cleanup: () => void;
} {
  const redirectUrl = new URL(options.redirectUrl);
  let serverClosed = false;
  let server = createServer();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  const cleanup = () => {
    if (serverClosed) {
      return;
    }
    serverClosed = true;
    timeoutId && clearTimeout(timeoutId);
    timeoutId = undefined;
    abortHandler &&
      options.abortSignal?.removeEventListener("abort", abortHandler);
    abortHandler = undefined;
    server.close();
  };

  const promise = new Promise<string>((resolve, reject) => {
    const resolveOnce = (code: string) => {
      cleanup();
      resolve(code);
    };
    const rejectOnce = (error: Error) => {
      cleanup();
      reject(error);
    };

    abortHandler = () => rejectOnce(new Error("MCP OAuth flow cancelled"));
    if (options.abortSignal?.aborted) {
      abortHandler();
      return;
    }
    options.abortSignal?.addEventListener("abort", abortHandler, {
      once: true,
    });

    timeoutId = setTimeout(() => {
      rejectOnce(
        new Error(
          `MCP OAuth flow for "${options.serverName}" timed out waiting for the browser callback.`,
        ),
      );
    }, OAUTH_CALLBACK_TIMEOUT_MS);

    server.on("request", (request, response) => {
      const requestUrl = new URL(
        request.url || "/",
        `${redirectUrl.protocol}//${redirectUrl.host}`,
      );

      if (requestUrl.pathname !== redirectUrl.pathname) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const errorDescription =
        requestUrl.searchParams.get("error_description") || "";
      if (error) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<h1>Authentication failed</h1><p>You can close this window.</p>",
        );
        rejectOnce(
          new Error(
            `MCP OAuth error: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`,
          ),
        );
        return;
      }

      const state = requestUrl.searchParams.get("state");
      if (state !== options.expectedState) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<h1>Authentication failed</h1><p>State validation failed. You can close this window.</p>",
        );
        rejectOnce(new Error("MCP OAuth state mismatch"));
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<h1>Authentication failed</h1><p>No authorization code was provided.</p>",
        );
        rejectOnce(new Error("MCP OAuth callback did not include a code"));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        "<h1>Authentication complete</h1><p>You can close this window and return to KainClaw.</p>",
      );
      resolveOnce(code);
    });

    server.on("error", error => {
      rejectOnce(
        error instanceof Error ? error : new Error(String(error)),
      );
    });

    server.listen(redirectUrl.port ? parseInt(redirectUrl.port, 10) : 80);
  });

  return { promise, cleanup };
}
