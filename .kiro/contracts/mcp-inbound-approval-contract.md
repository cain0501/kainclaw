# MCP Inbound Approval And Execution Contract

## Status

Phase 6c decision record. This contract is required before adding a provider-backed inbound MCP tool such as `kainclaw_chat`.

## Security Boundary

The stdio MCP server is an external-client adapter. It owns only its process-local inbound sessions. It must never:

- read or write `SessionRepository` data
- read provider API keys, OAuth tokens, or desktop settings
- execute a provider adapter directly
- access workspace, memory, design, image, or browser runtimes directly

The running Electron desktop process is the only authority that may execute a provider-backed request.

## Local Bridge

Phase 6d introduces an `IInboundMcpExecutionBroker` in `src/platform/`. The Electron host implements it through a Windows named pipe restricted to the current Windows user.

The stdio server is launched by an external MCP client, not by Electron, so Electron cannot safely inject a launch secret. The bridge therefore relies on the current-user pipe ACL and a registration handshake. The bridge assigns a fresh connection ID after the server supplies a random `serverInstanceId`; reconnecting receives a new connection ID and invalidates prior grants.

The stdio server must fail closed when Electron is not running, the named pipe is unavailable, or bridge authentication fails.

## Grant Lifecycle

No provider-backed tool has a standing allow-by-default permission.

For a requested tool call, the server asks the bridge to resolve a grant containing:

- `grantId`
- `serverInstanceId`
- bridge connection ID
- allowed tool name
- inbound `sessionId`
- expiration timestamp
- user-selected scope: one request or current inbound session

Electron shows the approval request in a dedicated MCP permission surface. It identifies the calling client, requested tool, prompt summary, and session label. The user can deny, allow once, or allow for the current inbound session. Grants expire after 15 minutes and are kept only in Electron memory.

Electron revocation immediately invalidates matching grants. The server must ask again after denial, expiry, revocation, server restart, or inbound-session close.

## Inbound Session Scope

The existing `KainClawInboundSessionStore` remains the source of truth for MCP session IDs. Desktop sessions are never selectable from MCP.

For the first provider-backed tool, the broker maintains a separate ephemeral model context keyed by `(serverInstanceId, inboundSessionId)`. It is not written to desktop session files and is destroyed when the inbound session closes, the server disconnects, or Electron restarts.

## Provider Execution

`kainclaw_chat` is the first permitted Phase 6d stateful tool. It accepts only `sessionId` and `prompt`.

After grant validation, the broker resolves the currently selected desktop provider inside Electron and runs a text-only chat turn against the ephemeral inbound context. It does not expose KainClaw tools, MCP clients, filesystem access, browser access, design actions, image actions, or provider configuration to the inbound request.

The stdio server receives only the normalized text response and a session-local turn identifier. It must not receive token counts, provider names, raw tool calls, credentials, or desktop error internals.

## Output And Audit Rules

- Limit prompt input to 16,000 characters and returned text to 32,000 characters.
- Return structured, user-safe errors for unavailable bridge, denied grant, expired grant, and provider failure.
- Electron stores an in-memory audit record for grant decisions and execution outcome: timestamp, server instance, session ID, tool, decision, and duration. Never store prompt body or provider secrets in the audit record.
- Server stderr may contain operational errors; stdout remains reserved for MCP JSON-RPC.

## Phase 6d Scope

Phase 6d implements only the local bridge and `kainclaw_chat` text path:

1. `IInboundMcpExecutionBroker` plus Electron named-pipe host.
2. Server bridge client with challenge-response and fail-closed behavior.
3. User-visible Electron approval surface and revocation action.
4. `kainclaw_chat` with per-inbound-session ephemeral model context.
5. Unit tests for grant scope, expiry, denial, revocation, and bridge failure.
6. Electron-plus-stdio smoke test proving one approved text turn and one denied turn.

Design, image, memory, workspace, filesystem, browser, and task tools remain separate future phases.
