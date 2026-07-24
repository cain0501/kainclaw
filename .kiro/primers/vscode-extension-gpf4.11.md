# Task Primer: vscode-extension-gpf4.11 - Fix unresponsive imported MCP controls

## Task Goal

Restore the Electron MCP page controls for Codex-imported servers: approve, reject, enable/disable, and remove must dispatch the correct action and refresh the visible state.

## Out Of Scope

- Do not change MCP import parsing, OAuth, tool permission rules, inbound MCP bridge, or provider behavior.
- Do not modify chat, session, design, image, or settings rendering.
- Do not alter existing saved MCP configurations as part of diagnosis.

## Resume Context

**Last session date:** 2026-07-24
**Last action taken:** Fixed the malformed inline `onclick` attributes rendered for MCP server controls and normalized approval identity to ignore only `disabled`.
**Why it was done that way:** `JSON.stringify(name)` was embedded inside an already double-quoted HTML attribute, producing invalid markup such as `onclick="approveMcpServer("fetch")"`. Toggling `disabled` also changed the approval configuration fingerprint even though it does not change the connection target.
**Exact next action:** No implementation work remains. The user can reopen the MCP page and test an imported server.
**Known blockers / watch out:** `electron/renderer/index.html` remains high risk; this task changed only `renderMcpServers`.

## Next Step

**Do:** No next code action. Hand off the manual smoke path.
**Files:** `electron/renderer/index.html`, `src/mcpProjectApprovalStore.ts`, and their focused tests.
**Test:** Click approve, disable, enable, and remove on an imported Codex server; confirmation is expected only for remove.

## Verification

- Approve, reject, enable/disable, and remove each change the visible MCP state after Codex import.
- `npm test`, `npm run check`, `npm run build`, and `npm run build:electron` pass.
- If renderer changes: verify onclick targets, duplicate definitions, and inline JS syntax.

## High-Risk Files Touched

- `electron/renderer/index.html`: only `renderMcpServers` and direct MCP action helpers if needed. Do not touch other regions.

## Definition Of Done

- [x] Imported MCP controls dispatch and visibly update state.
- [x] Focused regression coverage exists.
- [x] Full verification, Beads update, scoped commit, and push are complete.
