# Task Primer: vscode-extension-gpf4.4 - MCP Phase 4: RollingGo hotel stdio server

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Wrap the existing `@rollinggo/hotel` CLI in a small standard stdio MCP server. The server must expose the agreed hotel-query and booking tools, preserve the CLI as the business-system owner, redact credentials from all responses, and declare booking as destructive so KainClaw's existing confirmation path can enforce approval.

## Out of Scope

- Do not modify `E:\claudecodejingiang\hotel-core`.
- Do not change the Electron MCP settings UI or `McpRuntime`.
- Do not package an MCPB/plugin or implement marketplace templates.
- Do not change `electron/renderer/index.html`, `output/`, or `tools/`.

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-07-23
**Last action taken:** Implemented and verified the RollingGo hotel stdio MCP server.
**Why it was done that way:** The CLI is the existing source of truth; the MCP layer should be a narrow protocol adapter rather than a second hotel implementation.
**Exact next action:** Start Phase 5 MCP import/templates work after reviewing the productization plan.
**Known blockers / watch out:** The CLI's exact JSON output may evolve, so pass its structured output through after redaction rather than reconstructing hotel records. Existing unrelated dirty files must remain unstaged.

## Already Completed

- [x] Phase 4 Beads issue created: `vscode-extension-gpf4.4`.
- [x] Confirmed CLI commands and required arguments from `E:\claudecodejingiang\hotel-core\SKILL.md` and `references/cli-params.md`.
- [x] Added `src/mcp/rollinggoHotelServer.ts` with seven hotel tools and stdio entry point.
- [x] Added focused mapping, annotations, and credential-redaction tests.
- [x] Added setup/configuration guide at `scripts/mcp/rollinggo-hotel-server/README.md`.

## Next Step (the ONLY thing to do this session)

**Do:** No further implementation in this primer; move to the Phase 5 primer.
**Files:** `src/mcp/rollinggoHotelServer.ts`, `src/mcp/rollinggoHotelServer.test.ts`, `scripts/mcp/rollinggo-hotel-server/README.md`
**Test:** `npm test && npm run check && npm run build`

## Verification

```bash
npm test
npm run check
npm run build
```

Manual test:
- Add the compiled server as a stdio MCP configuration.
- Call `hotel_search_hotels` and confirm structured, credential-free output.
- Attempt `hotel_book` and confirm KainClaw requests approval before calling it.

## Risk Points

- Risk: CLI errors or payloads leak token/cookie values. Guard: recursively redact sensitive object keys and credential-like strings before every MCP response.
- Risk: a booking bypasses the host confirmation flow. Guard: set `destructiveHint: true` on `hotel_book` and keep booking as a separate tool.
- Risk: CLI parameter drift. Guard: explicit unit tests lock every supported command's argument mapping.

## High-Risk Files Touched

None.

## Reference (only load if stuck)

- Product plan: `docs/kainclaw-mcp-productization-plan.md`
- CLI contract: `E:\claudecodejingiang\hotel-core\references\cli-params.md`
- Beads: `bd show vscode-extension-gpf4.4`

## Definition of Done

- [x] Standard stdio MCP server exposes `hotel_whoami`, `hotel_login_status`, `hotel_search_hotels`, `hotel_detail`, `hotel_price_confirm`, `hotel_book`, and `hotel_orders`.
- [x] CLI argument mapping and credential redaction are covered by tests.
- [x] `hotel_book` has `destructiveHint: true`; read-only tools have `readOnlyHint: true`.
- [x] `npm test`, `npm run check`, and `npm run build` pass.
- [x] Beads, current state, and this primer record the completed checkpoint and next step.
