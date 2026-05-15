# Task Primer: vscode-extension-3yn - sez regression - transient draft disappears after quick-start path

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Fix the sez regression where a transient draft stays visible in Recent Works when the user simply starts a new work, but disappears after the quick-start/question-form path is activated and the user switches to another project.

## Out of Scope

- Do not change formal project lifecycle rules from `vscode-extension-sez`
- Do not change renderer markdown / design-chat build-turn behavior
- Do not touch image provenance
- Do not touch these files: `src/imageGeneration/**`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-15
**Last action taken:** Fixed the host-side transient draft anchor so quick-start/question-form activity no longer drops the draft when switching to another project.
**Why it was done that way:** The regression came from clearing the transient draft anchor on generic project selection; the anchor now survives ordinary project switches and is cleared only on reset or true formalization.
**Exact next action:** Manual Electron smoke for path B: quick-start → input a few fields → switch projects → confirm Recent Works still shows the draft entry.
**Known blockers / watch out:** Full `electron/ElectronChatPanel.test.ts` still includes the existing 6 dirty-baseline failures unrelated to this bug (`__trigger_discovery__` plus design-chat artifact/build-turn cases).

## Already Completed

- [x] Beads issue exists and contains the exact repro
- [x] Regression test added for the quick-start/question-form path
- [x] Root cause narrowed to transient draft anchor clearing too early
- [x] Host draft anchor now survives project switches triggered after quick-start/question-form activity
- [x] Formalization path still clears the transient anchor on first durable save

## Next Step (the ONLY thing to do this session)

**Do:** Move transient draft anchor cleanup out of generic project selection and into actual draft formalization/reset paths.
**Files:** `electron/ElectronChatPanel.ts`, `electron/ElectronChatPanel.test.ts`
**Test:** `npm run build && npm test -- electron/ElectronChatPanel.test.ts --no-coverage`

## Verification

```bash
npm test -- electron/ElectronChatPanel.test.ts --no-coverage
npm run build
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: 新建作品 → 点「你想怎么开始」→ 输入几个字 → 切换到其他作品 → Recent Works 仍有草稿条目
- Step 2: 同一路径下继续生成第一版 → 草稿条目升级为正式作品，不再保留 transient 草稿

## Risk Points

- Risk: fixing the switch-away case leaves a stale draft after the draft has already been formalized
- Guard: clear the transient draft anchor only when the draft session is reset or the first formal project is actually created from that draft

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` -> only transient draft anchor / project selection lifecycle blocks

## Reference (only load if stuck)

- Spec: `.kiro/primers/vscode-extension-sez.md`
- Commit baseline: `3015bd9`
- Beads: `bd show vscode-extension-3yn`

## Definition of Done

- [x] Quick-start/question-form path no longer drops the transient draft from Recent Works after switching projects
- [x] Normal draft formalization still clears the transient draft anchor
- [x] Verification commands pass
