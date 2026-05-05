# Task Primer: vscode-extension-996 — midtai:open route contract + renderer page 路由升级

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Introduce a unified `midtai:open` route contract so chat/artifact/design/image entry points can open the midtai with explicit target state instead of relying on page-specific `showPage('design-home'|'design'|'images')` calls. This is the P0 routing foundation for the frozen midtai UX spec.

## Out of Scope

- Do not implement `design:patchImageNode`
- Do not build the final unified midtai shell UI
- Do not add persistence for `replaceCtx`
- Do not refactor unrelated image/design flows outside routing and entry wiring
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] UX spec frozen in `.kiro/specs/midtai-ux-v1.md`
- [x] Codex review concluded `midtai:open` should be an explicit route contract and `replaceCtx` should stay renderer-memory only for P0

## Next Step (the ONLY thing to do this session)

Implement `midtai:open` on host + renderer, and migrate the existing artifact/design/image entry points to use it.

**Do:** add the message contract, renderer `openMidtai(payload)` state application, and route current artifact/image/design entry points through it
**Files:** `electron/ElectronChatPanel.ts`, `electron/renderer/index.html`, optional type/helper file under `src/` if needed (max 3 files)
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: open an HTML artifact and confirm “进入 KainClaw Design” still lands in the design canvas
- Step 2: open Image Lab / Design Home entry points and confirm they still land on the expected surfaces

## Risk Points

- Risk: page routing and design bridge rendering diverge and leave the design iframe in a broken state
  Guard: keep `openMidtai` as a thin state/router layer over the existing `showPage` / `showDesignPage` primitives
- Risk: new message contract conflicts with current message names
  Guard: introduce `midtai:open` alongside existing messages, then migrate known entry points one by one

## High-Risk Files Touched

- `electron/renderer/index.html` → only the page navigation / message router / midtai entry helper region (`handleMessage`, `showPage`, design/image entry helpers)
- `electron/ElectronChatPanel.ts` → only message dispatch around artifact/design/image entry points and any small helper that emits `midtai:open`
- Do NOT touch unrelated chat/session/settings/UI regions

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md`
- Beads: `bd show vscode-extension-996`
- Existing route surfaces: `electron/renderer/index.html` (`showPage`, `showDesignPage`, `openImageLab`, `openDesignHub`, `openKainClawDesignBridge`)

## Definition of Done

- [ ] Host can emit `midtai:open` with `contentType`, `view`, optional `projectId` / `artifactId` / `replaceCtx`
- [ ] Renderer has a single `openMidtai(payload)` entry that applies route state and lands on the correct surface
- [ ] Existing artifact image/design entry points are migrated to use the new route contract
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
- [ ] beads notes updated with what changed + next concrete step

## This Session

- Added `src/midtaiRoute.ts` with the shared `MidtaiOpenPayload` contract.
- Host now accepts and emits `midtai:open`, including artifact-driven design entry and project-aware design entry.
- Renderer now routes Image Lab / Design Home / artifact-open flows through `openMidtai(payload)` instead of only page-specific helpers.
- Verification passed: `npm test`, `npm run check`, `npm run build`, `npm run build:electron`.
