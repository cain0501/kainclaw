# Task Primer: vscode-extension-gpf4.5 - MCP Phase 5: imports and safe templates

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Complete the MCP setup path for ordinary users: preview and import Codex/Claude MCP configuration, install reviewed built-in templates, and export the current workspace configuration. Parsing, secret filtering, and file writes remain in `src/mcpRegistry.ts`; Electron only exposes IPC and renders the controls.

## Out of Scope

- Do not modify `E:\claudecodejingiang\hotel-core`.
- Do not implement plugin/MCPB marketplace installation.
- Do not change `McpRuntime`, OAuth behavior, project approval, or permission matching.
- Do not modify `src/extension.ts` or `src/webviewHtml.ts`.
- Do not change unrelated existing work in `electron/renderer/index.html`, `output/`, or `tools/`.

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-07-23
**Last action taken:** Implemented and verified Phase 5 imports, templates, export, and MCP settings IPC/UI controls.
**Why it was done that way:** The registry is already the configuration boundary, so Phase 5 can extend it without duplicating parsing in the renderer.
**Exact next action:** Start Phase 6 only after reviewing inbound permissions and session isolation requirements; Phase 6 remains intentionally deferred.
**Known blockers / watch out:** `electron/renderer/index.html` already has unrelated dirty edits. Only touch the MCP page markup, MCP localization, MCP message cases, and MCP helper functions listed below.

## Already Completed

- [x] Codex TOML import exists in `McpRegistry` and preserves environment placeholders.
- [x] Phase 5 Beads issue created: `vscode-extension-gpf4.5`.
- [x] Read `HIGH_RISK_ENTRY.md` before touching the renderer.
- [x] Added Codex/Claude preview and import with static credential filtering.
- [x] Added four templates and redacted workspace config export.
- [x] Wired Electron MCP IPC/settings controls and regression tests.

## Next Step (the ONLY thing to do this session)

**Do:** No further implementation in this primer; Phase 5 is complete.
**Files:** `src/mcpRegistry.ts`, `src/mcpRegistry.test.ts`, `electron/ElectronChatPanel.ts`, `electron/ElectronChatPanel.test.ts`, `electron/renderer/index.html` (MCP page/localization/message cases/helpers only)
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Renderer syntax check:

```bash
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\\s\\S]*?)<\\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\\/?script>/g,'')+'\\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
```

Manual test:
- Open MCP settings and preview/import Codex or Claude config.
- Install the hotel template and verify it appears in the server list without secrets.
- Export configuration and confirm credential headers are redacted or environment placeholders are preserved.

## Risk Points

- Risk: importing static secrets from external configs. Guard: preserve `${ENV_VAR}` references, drop sensitive literal env/header values, and redact export output.
- Risk: template path or capability is misleading. Guard: mark the read-only filesystem template disabled until its root is supplied and keep booking safety in the hotel server annotations.
- Risk: renderer inline JS regression. Guard: modify only the named MCP regions and run Electron build plus syntax check immediately.

## High-Risk Files Touched

- `electron/renderer/index.html`: MCP page markup around `#page-mcp`, `getMcpStrings`/`localizeMcpSurface`, `handleMessage` MCP cases, and MCP helper functions around `refreshMcp`/`renderMcpServers`. Do not touch image chat or other renderer regions.

## Definition of Done

- [x] Codex and Claude MCP configs can be previewed and imported without copying static secrets.
- [x] Fetch, browser, read-only filesystem, and hotel templates can be installed; filesystem template is disabled until configured.
- [x] Workspace config can be exported with secrets redacted and placeholders preserved.
- [x] Electron IPC/UI exposes the flows and existing MCP actions still pass.
- [x] `npm test`, `npm run check`, `npm run build`, `npm run build:electron`, and inline renderer JS syntax check pass.
- [x] Beads, current state, and this primer are updated before commit/push.
