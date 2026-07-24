# Task Primer: vscode-extension-gpf4.9 - MCP Phase 6d.1 inbound bridge and grants

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Implement the first safe Phase 6d slice: an Electron-owned local named-pipe bridge and in-memory grants for inbound MCP requests. The bridge must register a stdio server instance, obtain user-visible approval for a requested tool, and enforce grant connection, tool, inbound-session, scope, expiry, revocation, and disconnect boundaries.

## Out Of Scope

- Do not add `kainclaw_chat` or execute a provider adapter.
- Do not read `SessionRepository`, `SettingsRepository`, provider secrets, workspace, memory, design, image, browser, or local-bridge state from the stdio MCP process.
- Do not modify `electron/renderer/index.html`, `src/extension.ts`, or `src/webviewHtml.ts`.
- Do not claim that Node's `net` named-pipe API configures a Windows pipe ACL. The implementation must keep a documented current-user-process assumption and depend on visible grants for authority.

## Implementation Shape

1. Add a reusable `src/platform/` broker with typed registration, grant issuance, validation, revocation, expiry, one-request consumption, session-scope grants, and disconnect cleanup.
2. Add a newline-delimited JSON named-pipe protocol and a small bridge client/server abstraction. The pipe host delegates decisions to the broker and returns only safe structured errors.
3. In `electron/main.ts`, instantiate the broker and start/stop its pipe host with the Electron lifecycle. Use Electron native `dialog.showMessageBox` for the visible choices `Deny`, `Allow once`, and `Allow for this inbound session`; no renderer changes are needed.
4. Keep this bridge unconnected from provider execution. A later 6d.2 task may consume a validated grant only after it establishes the text-only, ephemeral provider context.

## Files

- Add: `src/platform/inboundMcpExecutionBroker.ts`
- Add: `src/platform/inboundMcpExecutionBroker.test.ts`
- Add: `src/platform/inboundMcpNamedPipeBridge.ts`
- Add: `src/platform/inboundMcpNamedPipeBridge.test.ts`
- Modify: `electron/main.ts` only for bridge lifecycle and native approval callback
- Update: `.kiro/CURRENT_STATE.md`

## Verification

- Unit tests prove denied, expired, revoked, wrong-connection, wrong-tool, wrong-session, one-request consumption, session grant reuse, and disconnect cleanup behavior.
- Bridge test proves register, request-grant, validate, malformed input, and unavailable/closed bridge behavior with a test pipe path.
- `npm test`, `npm run check`, `npm run build`, and `npm run build:electron` pass.
- No inbound bridge path receives provider configuration, persisted desktop sessions, or provider output.

## High-Risk Files Touched

- `electron/main.ts`: lifecycle wiring only. Do not alter window creation, chat panel construction, renderer IPC, or local bridge behavior.

## Already Completed

- [x] Phase 6a: standard stdio MCP entrypoint with static server metadata.
- [x] Phase 6b: process-local, isolated inbound MCP session lifecycle.
- [x] Phase 6c: approved inbound execution and grant contract.
- [x] Added the in-memory broker, named-pipe host/client, scoped grant tests, and Electron native approval choices.
- [x] Made the stdio entrypoint register with Electron and fail closed when its bridge is unavailable.

## Remaining Boundary

- A user-initiated revocation list/action is intentionally deferred to 6d.2 and must land before `kainclaw_chat` is registered.
- Node's `net` API does not configure a Windows named-pipe DACL; the bridge grants no execution authority on its own.

## Next Step

**Do:** Create the 6d.2 primer for the ephemeral text-only provider runtime, user-initiated grant revocation, and `kainclaw_chat` registration.
**Files:** New 6d.2 primer; do not alter the 6d.1 bridge contract without retaining connection/tool/session grant checks.
**Test:** Start with the existing broker and named-pipe tests, then add Electron-plus-stdio approved/denied chat smoke coverage.

## Definition Of Done

- [x] Electron starts and stops a local inbound MCP pipe host.
- [x] User-visible approval creates only scoped, in-memory, short-lived grants.
- [x] Invalid, expired, revoked, consumed, or disconnected grants fail closed.
- [x] The implementation does not add a provider-backed tool.
- [ ] Beads, current state, primer, verification, scoped commit, and push are complete.
