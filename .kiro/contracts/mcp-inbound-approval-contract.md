# MCP Inbound Approval And Execution Contract

## Status

Phase 6c decision record. Phase 6d.1 implemented the broker, named-pipe bridge, and approval choices; this contract remains required before adding a provider-backed inbound MCP tool such as `kainclaw_chat`.

## Security Boundary

The stdio MCP server is an external-client adapter. It owns only its process-local inbound sessions. It must never:

- read or write `SessionRepository` data
- read provider API keys, OAuth tokens, or desktop settings
- execute a provider adapter directly
- access workspace, memory, design, image, or browser runtimes directly

The running Electron desktop process is the only authority that may execute a provider-backed request.

## Local Bridge

Phase 6d introduces an `IInboundMcpExecutionBroker` in `src/platform/`. The Electron host implements it through a Windows named pipe.

The stdio server is launched by an external MCP client, not by Electron, so Electron cannot safely inject a launch secret. The bridge assigns a fresh connection ID after the server supplies a random `serverInstanceId`; reconnecting receives a new connection ID and invalidates prior grants. The wire protocol binds every request to the registered pipe socket instead of trusting a caller-supplied connection ID.

Node's `net` named-pipe API does not expose a Windows pipe-DACL option. Phase 6d.1 therefore does not claim OS-level current-user ACL enforcement. A local pipe connection is not execution authority: it receives no credentials or desktop data, and every stateful request still requires a visible, short-lived Electron grant. A future native host boundary may add an explicit Windows DACL if the product threat model requires process-level local isolation.

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

Electron revocation immediately invalidates matching grants. The server must ask again after denial, expiry, revocation, server restart, or inbound-session close. Phase 6d.1 implements connection-bound bridge revocation plus automatic cleanup on session close, disconnect, and Electron restart. A user-initiated revocation list/action must be delivered before `kainclaw_chat` is registered in Phase 6d.2.

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

1. `IInboundMcpExecutionBroker` plus Electron named-pipe host. **Implemented in 6d.1.**
2. Server bridge client with registration and fail-closed behavior. **Implemented in 6d.1.**
3. User-visible Electron approval surface and revocation action. **Approval implemented in 6d.1; user-initiated revocation remains a 6d.2 gate.**
4. `kainclaw_chat` with per-inbound-session ephemeral model context.
5. Unit tests for grant scope, expiry, denial, revocation, and bridge failure.
6. Electron-plus-stdio smoke test proving one approved text turn and one denied turn.

Design, image, memory, workspace, filesystem, browser, and task tools remain separate future phases.
