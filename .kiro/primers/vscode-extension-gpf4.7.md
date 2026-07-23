# Task Primer: vscode-extension-gpf4.7 - MCP Phase 6b isolated inbound sessions

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Give the KainClaw stdio MCP server its own ephemeral session namespace. An external MCP client can create, list, and close only sessions owned by its current server process; no tool may read, write, enumerate, or restore desktop `SessionRepository` data.

## Out of Scope

- Do not import or call `SessionRepository`, `SettingsRepository`, `McpRuntime`, or Electron code.
- Do not expose chat, design, image, memory, workspace, filesystem, or provider configuration.
- Do not add HTTP/SSE transport, remote OAuth, token input fields, or Electron approval UX.
- Do not persist inbound sessions across server restarts.

## Resume Context

**Last session date:** 2026-07-23
**Last action taken:** Added process-local inbound sessions and lifecycle tools, then verified a new server process starts with no prior sessions.
**Why it was done that way:** The server must first prove protocol compatibility without data access before any stateful contract is added.
**Exact next action:** Define a user-visible approval authority and a session-scoped provider contract before implementing `kainclaw_chat`.
**Known blockers / watch out:** Do not reuse the desktop session repository. Cross-process or user-bound auth is a separate future phase because stdio has no request-header authentication channel.

## Already Completed

- [x] Phase 6a exposes `kainclaw_server_info` through a real stdio MCP server.
- [x] Real MCP SDK client smoke covers `listTools` and `callTool`.
- [x] Added process-local open/list/close session tools without any persistent storage dependency.
- [x] Proved a separate server process sees an empty inbound session namespace.

## Next Step

**Do:** Design user-visible approval and session-scoped provider execution for a future `kainclaw_chat` tool.
**Files:** New Phase 6c primer only
**Test:** Contract review only

## Verification

```bash
npm test -- src/mcp/kainclawInboundSessionStore.test.ts src/mcp/kainclawServer.test.ts
npm test
npm run check
npm run build
```

Manual test:
- Start the compiled server in an MCP client and call `kainclaw_open_session`.
- Confirm `kainclaw_list_sessions` returns that session only.
- Restart the server and confirm `kainclaw_list_sessions` is empty.

## Risk Points

- Risk: A session tool accidentally exposes desktop session data. Guard: store is in-memory, owns its `Map`, and has no storage imports.
- Risk: Session IDs can cross process boundaries. Guard: each server creates its own store instance and never accepts imported records.
- Risk: Close is treated as a harmless read. Guard: annotate it as non-read-only and require a known session ID.

## High-Risk Files Touched

- None.

## Definition of Done

- [x] Inbound session IDs are process-local and non-persistent.
- [x] MCP tools can create, list, and close only local inbound sessions.
- [x] A fresh server instance exposes no prior sessions.
- [x] Focused/full tests, typecheck, main build, and an SDK client smoke pass.
- [x] Beads, current state, and this primer include the next authorization-gated MCP step.
