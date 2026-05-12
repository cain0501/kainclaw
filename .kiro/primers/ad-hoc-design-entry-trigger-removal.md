# Task Primer: ad-hoc-design-entry-trigger-removal - detailed design entry stops auto-sending discovery trigger

> Session entry point for this targeted fix. No extra docs needed unless the scoped verification fails.

## Task Goal

Remove the automatic `__trigger_discovery__` send from the detailed design entry path so opening detailed mode only reveals the design chat and focuses the input. Remove the corresponding dead special-case handling in the Electron host.

## Out of Scope

- Do not change design chat prompt wording beyond the existing placeholder text
- Do not change quick-form behavior
- Do not modify unrelated design session routing or diversion flows
- Do not touch these files: `src/extension.ts`, `src/webviewHtml.ts`, `src/license/licenseManager.ts`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-12
**Last action taken:** Removed the detailed-entry auto-send trigger, replaced it with input focus, removed dead host-side trigger handling, and passed build plus renderer script syntax verification.
**Why it was done that way:** The only sender of `__trigger_discovery__` was the detailed entry path, so both sender and dead branch were removed together with a minimal scoped diff.
**Exact next action:** Manual smoke-test the detailed design entry path in Electron to confirm the chat opens idle with focus in the input.
**Known blockers / watch out:** No automated UI smoke test was run; the remaining check is interactive behavior in the Electron shell.

## Already Completed

- [x] Located `chooseDesignEntryPath` and `handleDesignChatSend`
- [x] Confirmed the only sender of `__trigger_discovery__` is the detailed entry path
- [x] Replaced detailed-entry auto-send with `#design-chat-input.focus()`
- [x] Removed host-side `__trigger_discovery__` / `triggerDiscovery` special handling
- [x] Passed `npm run build`
- [x] Passed `electron/renderer/index.html` script syntax check

## Next Step (the ONLY thing to do this session)

**Do:** Manual smoke-test the detailed design entry path in Electron.
**Files:** `electron/renderer/index.html`, `electron/ElectronChatPanel.ts`
**Test:** `npm run build` plus the required `electron/renderer/index.html` script syntax check

## Verification

```bash
npm run build
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
```

Manual test:
- Open the detailed design entry path and confirm the chat opens without sending a message.
- Confirm the input receives focus and accepts user typing immediately.

## Risk Points

- Risk: leaving a stale `triggerDiscovery` path in the host can preserve dead branching. Guard: remove the sender and host-side branch together.
- Risk: inline script syntax regression in `index.html`. Guard: run the dedicated script syntax check after patching.

## High-Risk Files Touched

- `electron/renderer/index.html` -> only `chooseDesignEntryPath(path)` and its direct detailed-branch logic
- `electron/ElectronChatPanel.ts` -> only `handleDesignChatSend(...)` and the matching empty-prompt guard in `handleDesignChatLane(...)`

## Definition of Done

- [x] Detailed entry path no longer sends `__trigger_discovery__`
- [x] Detailed entry path focuses `#design-chat-input`
- [x] Host no longer special-cases `__trigger_discovery__`
- [x] `npm run build` passes
- [x] `electron/renderer/index.html` script syntax check passes
