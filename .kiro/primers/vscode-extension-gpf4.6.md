# Task Primer: vscode-extension-gpf4.6 - MCP Phase 6a safe KainClaw stdio server

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Expose KainClaw through a standard stdio MCP server with one harmless read-only capability tool. This establishes a real inbound MCP transport without exposing persisted user data or allowing any mutation before authentication and session isolation are designed.

## Out of Scope

- Do not modify `McpRuntime`; it remains an outbound MCP client.
- Do not expose chat, sessions, memory, design, image, workspace, or filesystem tools.
- Do not add HTTP/SSE transport, OAuth, Electron UI, or new dependencies.
- Do not modify `electron/`, `src/extension.ts`, `src/webviewHtml.ts`, `output/`, or `tools/`.

## Resume Context

**Last session date:** 2026-07-23
**Last action taken:** Added and smoke-tested the KainClaw stdio MCP server with only the read-only `kainclaw_server_info` capability tool.
**Why it was done that way:** A capability-only server has no session or data boundary to breach, so it is the smallest safe Phase 6 slice and a concrete client-compatibility proof.
**Exact next action:** Design Phase 6b session tokens, isolated inbound sessions, and approval scopes before exposing any stateful KainClaw capability.
**Known blockers / watch out:** Do not broaden the initial tool surface. Any tool that accesses persisted KainClaw state needs a separate Phase 6b session-token and isolated-session contract.

## Already Completed

- [x] MCP Phase 1 through 5 are complete.
- [x] Identified `src/mcp/rollinggoHotelServer.ts` as the KainClaw stdio MCP server pattern.
- [x] Confirmed the Phase 6 plan defers stateful tools until inbound permissions and session isolation are designed.
- [x] Added `kainclaw_server_info` with static capability output and read-only annotations.
- [x] Verified the compiled server through a real MCP stdio client using `listTools` and `callTool`.

## Next Step

**Do:** Create the Phase 6b authorization and isolated-session design before any stateful inbound tool is implemented.
**Files:** New Phase 6b primer only
**Test:** Contract review only

## Verification

```bash
npm test -- src/mcp/kainclawServer.test.ts
npm test
npm run check
npm run build
node dist/mcp/kainclawServer.js
```

Manual test:
- Add `node <repo>/dist/mcp/kainclawServer.js` as a stdio server to a local MCP client.
- Invoke `kainclaw_server_info`; it should return capability metadata only, with no user/session content.

## Risk Points

- Risk: Adding a stateful tool bypasses desktop approvals and session ownership. Guard: initial export is fixed to one static capability tool.
- Risk: Console output corrupts stdio JSON-RPC. Guard: server code writes no normal output to stdout outside the MCP transport.
- Risk: The tool contract silently becomes mutable. Guard: declare `readOnlyHint: true` and test its exact annotations.

## High-Risk Files Touched

- None.

## Definition of Done

- [x] A compiled stdio MCP server exposes `kainclaw_server_info` through the MCP SDK.
- [x] The only tool is explicitly read-only, non-destructive, and returns no persisted user data.
- [x] Focused/full tests, typecheck, and main build pass.
- [x] Beads, current state, and this primer include a concrete Phase 6b next step.
