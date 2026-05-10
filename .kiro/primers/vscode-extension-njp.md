# Task Primer: vscode-extension-njp — MCP OAuth refresh 质量升级

> **Session entry point.** Read this first.

## Task Goal

对齐官方 `src/services/mcp/auth.ts` 的四项 OAuth refresh 能力，全部改动集中在 `src/mcpOAuth.ts`：

1. **normalizeOAuthErrorBody** — 处理 Slack 等 200 返回 error body 的非标准服务器
2. **proactive token refresh** — `tokens()` 里 expiresIn ≤ 300s 时主动 refresh，不等 401
3. **refresh 重试逻辑** — InvalidGrant 处理 + transient error 最多 3 次重试（1s/2s/4s backoff）
4. **token revocation** — `revokeServerTokens()`，在 `/mcp` 断开时调用

XAA 企业流程不在本 issue 范围，`performMcpOAuthFlow` 里的 `xaa` throw 保持不变。

## Out of Scope

- XAA / xaaIdpLogin / step-up auth / CIMD / lockfile
- mcpRuntime.ts 的调用方（除非 revoke 需要接线）
- Electron 文件

## High-Risk Files

- `src/mcpOAuth.ts` — 唯一改动文件

## Step 1：normalizeOAuthErrorBody

在文件顶部（import 之后）添加：

```typescript
const NONSTANDARD_INVALID_GRANT_ALIASES = new Set([
  "invalid_refresh_token",
  "expired_refresh_token",
  "token_expired",
]);

async function normalizeOAuthErrorBody(response: Response): Promise<Response> {
  if (!response.ok) return response;
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(text, response);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("error" in parsed) ||
    typeof (parsed as Record<string, unknown>).error !== "string"
  ) {
    return new Response(text, response);
  }
  const errorCode = (parsed as Record<string, unknown>).error as string;
  const normalized = NONSTANDARD_INVALID_GRANT_ALIASES.has(errorCode)
    ? { ...parsed, error: "invalid_grant" }
    : parsed;
  return new Response(JSON.stringify(normalized), {
    status: 400,
    statusText: "Bad Request",
    headers: response.headers,
  });
}
```

在 `createAuthFetchForServer` 里，POST 请求的 response 包一层：

```typescript
// 在 return await fetch(...) 之后：
const res = await fetch(input, { ...init, headers, signal: controller.signal });
return init?.method?.toUpperCase() === "POST"
  ? normalizeOAuthErrorBody(res)
  : res;
```

## Step 2：proactive token refresh

在 `HostBackedMcpOAuthClientProvider` 类里加私有字段：

```typescript
private _refreshInProgress?: Promise<OAuthTokens | undefined>;
```

修改 `tokens()` 方法，在返回 tokens 之前加 proactive refresh 逻辑：

```typescript
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

  // Proactive refresh: if expiring within 5 minutes and we have a refresh token
  if (expiresIn <= 300 && stored.refreshToken) {
    if (!this._refreshInProgress) {
      this._refreshInProgress = this.refreshAuthorization(stored.refreshToken)
        .finally(() => { this._refreshInProgress = undefined; });
    }
    try {
      const refreshed = await this._refreshInProgress;
      if (refreshed) return refreshed;
    } catch {
      // fall through to return current tokens
    }
  }

  return {
    access_token: stored.accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    ...(stored.refreshToken ? { refresh_token: stored.refreshToken } : {}),
    ...(stored.scope ? { scope: stored.scope } : {}),
  };
}
```

## Step 3：refreshAuthorization 方法

在 `HostBackedMcpOAuthClientProvider` 类里新增 `refreshAuthorization` 方法（在 `saveTokens` 之后）：

```typescript
async refreshAuthorization(
  refreshToken: string,
): Promise<OAuthTokens | undefined> {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const fetchFn = createAuthFetchForServer(this.config);
      const metadata = await discoverAuthorizationServerMetadata(
        this.config.url,
        { fetchFn },
      );
      if (!metadata) return undefined;

      const clientInfo = await this.clientInformation();
      if (!clientInfo) return undefined;

      const newTokens = await sdkRefreshAuthorization(
        new URL(this.config.url),
        {
          metadata,
          clientInformation: clientInfo,
          refreshToken,
          resource: new URL(this.config.url),
          fetchFn,
        },
      );

      if (newTokens) {
        await this.saveTokens(newTokens);
        return newTokens;
      }
      return undefined;
    } catch (error) {
      // InvalidGrant: refresh token is revoked/expired — clear tokens, don't retry
      if (
        error instanceof Error &&
        (error.message.includes("invalid_grant") ||
          error.message.includes("Invalid grant"))
      ) {
        await this.invalidateCredentials("tokens");
        return undefined;
      }

      // Transient errors: retry with backoff
      const isTransient =
        error instanceof Error &&
        /timeout|timed out|etimedout|econnreset|503|429|temporarily/i.test(
          error.message,
        );

      if (!isTransient || attempt >= MAX_ATTEMPTS) {
        return undefined;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)),
      );
    }
  }

  return undefined;
}
```

**注意**：需要在文件顶部补充导入：
```typescript
import {
  auth as sdkAuth,
  discoverAuthorizationServerMetadata,
  refreshAuthorization as sdkRefreshAuthorization,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
```

## Step 4：revokeServerTokens

在文件末尾（`waitForOAuthCallback` 之前）新增：

```typescript
export async function revokeServerTokens(options: {
  host: McpOAuthHost;
  serverName: string;
  config: McpOAuthRemoteServerConfig;
}): Promise<void> {
  const serverKey = getMcpOAuthServerKey(options.serverName, options.config);
  const credentialMap = await readCredentialMap(options.host);
  const tokenData = credentialMap[serverKey];

  if (!tokenData?.accessToken && !tokenData?.refreshToken) {
    return;
  }

  try {
    const fetchFn = createAuthFetchForServer(options.config);
    const metadata = await discoverAuthorizationServerMetadata(
      options.config.url,
      { fetchFn },
    );

    const revocationEndpoint =
      metadata &&
      "revocation_endpoint" in metadata &&
      typeof metadata.revocation_endpoint === "string"
        ? metadata.revocation_endpoint
        : null;

    if (revocationEndpoint) {
      const revokeOne = async (token: string, hint: string) => {
        const params = new URLSearchParams({ token, token_type_hint: hint });
        if (tokenData.clientId) params.set("client_id", tokenData.clientId);
        try {
          await fetchFn(revocationEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
          });
        } catch {
          // best-effort, ignore errors
        }
      };

      if (tokenData.refreshToken) {
        await revokeOne(tokenData.refreshToken, "refresh_token");
      }
      if (tokenData.accessToken) {
        await revokeOne(tokenData.accessToken, "access_token");
      }
    }
  } catch {
    // best-effort, don't throw
  }

  // Always clear local tokens regardless of server-side revocation result
  delete credentialMap[serverKey];
  await writeCredentialMap(options.host, credentialMap);
}
```

## Step 5：接线 revokeServerTokens（mcpRuntime.ts）

搜索 `mcpRuntime.ts` 里 `/mcp` 断开连接的处理路径（关键词：`disconnect`、`removeServer`、`clearAuth`）。如果有明确的"用户主动断开"路径，在清除 credentials 之前调用 `revokeServerTokens`。

如果找不到明确的断开路径，**跳过这步**，revokeServerTokens 作为 exported API 留给后续接线。

## Already Completed

- Added `normalizeOAuthErrorBody()` plus non-standard invalid-grant aliases in `src/mcpOAuth.ts`, and wrapped POST auth fetches so Slack-style `200` error bodies are normalized into OAuth-compatible `400 invalid_grant` responses.
- Added proactive refresh dedupe in `HostBackedMcpOAuthClientProvider.tokens()` so tokens expiring within 300 seconds attempt refresh before returning cached credentials.
- Added `refreshAuthorization()` with SDK-backed token refresh, `invalid_grant` credential invalidation, and transient retry backoff (`1s`, `2s`, `4s`).
- Exported `revokeServerTokens()` as a best-effort server revoke plus guaranteed local credential cleanup path.
- Added focused `src/mcpOAuth.test.ts` coverage for proactive refresh dedupe, Slack-style invalid-grant normalization, transient retry, and token revocation cleanup.
- Searched `src/` for a dedicated `/mcp` disconnect / remove-server / clear-auth entrypoint and did not find a clear single wiring point, so runtime hookup was intentionally skipped per primer fallback.
- Verified the patch with `npm test -- src/mcpOAuth.test.ts`, `npm run check`, and `npm run build`.

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- `sdkRefreshAuthorization` 是否已在 `@modelcontextprotocol/sdk/client/auth.js` 导出 — 先 grep 确认，如果没有则用 `sdkAuth` 的 refresh 路径替代
- `normalizeOAuthErrorBody` 里的 `new Response(text, response)` 在 Node.js 18+ 可用，确认项目 Node 版本
- `_refreshInProgress` 去重只在单进程内有效，跨进程并发 refresh 不处理（XAA lockfile 是 P1，不在本 issue）

## Definition of Done

Status: completed on `2026-05-09`.

- [ ] Slack 等 200 返回 error body 的服务器能正确触发 invalid_grant 处理
- [ ] token 快过期时 proactive refresh 触发，不等 401
- [ ] refresh 失败时 transient error 重试，InvalidGrant 直接清 tokens
- [ ] `revokeServerTokens` 导出可用
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
