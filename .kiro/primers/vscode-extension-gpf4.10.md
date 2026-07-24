# Task Primer: vscode-extension-gpf4.10 - MCP Phase 6d.2 approved inbound text chat

## Task Goal

Expose `kainclaw_chat` as the first provider-backed inbound MCP tool. It must execute only in Electron after a matching inbound grant is consumed, preserve a per-server/per-inbound-session text-only context in memory, and return normalized text only.

## Required Shape

1. Add an Electron-owned, reusable text runtime under `src/platform/`. It accepts an injected text-turn runner, keeps `NormalizedMessage[]` by `(serverInstanceId, inboundSessionId)`, limits prompt input to 16,000 and text output to 32,000 characters, sends no tools, and never writes `SessionRepository`.
2. Extend the named-pipe bridge with an `execute_chat` request. It must consume a matching `kainclaw_chat` grant before invoking the text runtime and normalize unavailable, denied, expired, and provider errors.
3. In `electron/main.ts`, build the provider adapter only inside the execution callback using `resolveProviderConfig(settings, "")` and `buildProviderAdapter(...).runStep(messages, [], ...)`. Do not return provider metadata, tools, thinking text, or credentials through the bridge.
4. Register `kainclaw_chat` in `src/mcp/kainclawServer.ts`; it requires a process-local inbound session and requests a bridge grant using a bounded prompt summary.
5. Add one isolated user-visible revocation control to the existing MCP page. Allowed renderer areas: the `#page-mcp` controls near `#mcp-tools`, the relevant MCP page functions, and the `window.message` switch. Do not modify chat, settings, design, image, approval-overlay, or session code.

## Out Of Scope

- No filesystem, workspace, browser, design, image, memory, task, agent, or MCP tools for the inbound provider turn.
- No desktop session read, selection, import, persistence, or history rendering.
- No provider configuration, provider name, token count, thinking text, raw tool calls, or errors exposed to stdio.
- Do not claim a Windows named-pipe DACL that Node `net` cannot configure.

## Files

- Add: `src/platform/inboundMcpTextChatRuntime.ts` and focused tests
- Modify: `src/platform/inboundMcpExecutionBroker.ts`, `src/platform/inboundMcpNamedPipeBridge.ts`, and focused tests
- Modify: `electron/main.ts` only for provider callback and revocation IPC
- Modify: `electron/renderer/index.html` only in the MCP controls/functions/message switch named above
- Modify: `src/mcp/kainclawServer.ts` and its tests
- Update: `.kiro/CURRENT_STATE.md` and inbound MCP contract

## Verification

- Unit tests: prompt/output limit, isolated context, no tools, denied/expired grant, one-shot consumption, provider-safe error, session/disconnect cleanup, and revocation.
- Bridge smoke: approved request returns normalized text; denied request returns a safe structured error.
- `npm test`, `npm run check`, `npm run build`, and `npm run build:electron` pass.
- After renderer editing: verify all new `onclick` targets, duplicate function names, inline JS syntax, and shortest manual MCP revoke path.

## Already Completed

- [x] 6a stdio entrypoint and read-only metadata
- [x] 6b process-local inbound session isolation
- [x] 6c approval/execution contract
- [x] 6d.1 bridge, grant lifecycle, native approval choices, and fail-closed server registration
- [x] Text-only ephemeral runtime, bridge execution, Electron-only provider runner, `kainclaw_chat`, and MCP-page revocation control

## Next Step

**Do:** Do not expand inbound capabilities without a new contract and primer.
**Files:** No code change required.
**Test:** Manual Electron-plus-stdio smoke passed: allow-once reply, denial, session-scoped reuse, and revoke-then-reauthorize.

## Definition Of Done

- [x] `kainclaw_chat` is available only to a registered bridge client with a matching grant.
- [x] Provider execution is Electron-only, text-only, tool-free, and ephemeral.
- [x] Users can revoke active inbound MCP grants from the MCP page.
- [x] No desktop session, credential, provider metadata, or unsafe error crosses to stdio.
- [x] Tests, builds, task tracking, scoped commit, push, and configured-provider manual smoke are complete.
