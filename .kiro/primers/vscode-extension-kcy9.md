# Task Primer: vscode-extension-kcy9 - Image Chat Touch Edit with brush mask and inpainting

> Session entry point. Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Implement the first Touch Edit slice for Image Chat.

After the user selects an image result, they should be able to enter a Touch Edit mode, brush over the region they want to change, describe the change, and get back a new image where the selected region is edited while the rest of the image stays as intact as the model allows.

This must plug into the existing Image Chat thread/result/stage lifecycle. It is not a separate tool surface.

## Product Boundaries

Keep the current Image Chat interaction model:

- Left side remains transcript + composer
- Right side remains image stage/current result area
- Touch Edit is an action on a selected/current image, not a new top-level tab

Reuse current image result/thread behavior:

- edited output must append into the active image-chat thread
- edited output must appear as a new assistant result turn
- right-side stage should move to the new edited result

## Out of Scope

- Do not build object-aware editing
- Do not build multi-layer editing
- Do not redesign the whole image editor modal
- Do not add new providers or dependencies
- Do not move core logic into `src/extension.ts` or `src/webviewHtml.ts`
- Do not touch `src/license/licenseManager.ts`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-07-23
**Last action taken:** Ran a live Electron renderer smoke test, found that brush masks exported as fully transparent, and fixed the mask compositor to preserve an opaque black background with opaque white painted pixels. The unified editor now accepts both chat-history images and a selected Midtai image target.
**Why it was done that way:** The host and OpenAI client already passed mask-upload/thread-append tests; the remaining failure was isolated to renderer canvas export, so the fix stays in the existing editor path instead of adding another image flow.
**Exact next action:** No implementation remains. Keep the issue closed unless a configured `gpt-image-*` provider reveals a live API-specific regression.
**Known blockers / watch out:** A live image-provider request was not made because this smoke test intentionally uses an in-memory image and no API key. The Electron smoke verified the real renderer IPC payload and the black/white PNG mask contract.

## Already Completed

- [x] `pmv8.3` transcript/thread/stage base is in place
- [x] Existing chat image editor overlay already exists in `electron/renderer/index.html`
- [x] Existing OpenAI image edits client already exists in `src/imageGeneration/openAIImageClient.ts`
- [x] Existing Image Chat result/thread lifecycle already appends new image runs to the active thread
- [x] Unified overall/local editor accepts both chat-history and selected Midtai image targets.
- [x] Electron smoke verified brush size, visible mask state, black/white mask pixels, and the actual `image:touchEdit` IPC payload.

## Current Code Anchors

Use these existing entry points instead of inventing parallel structure:

- Renderer image editor modal:
  - `openChatImageEditor(...)`
  - `renderChatImageEditor()`
  - `submitChatImageEditor()`
- Image Chat request path:
  - `submitIchat()`
  - `image:chatRoute`
  - `runImageJob(...)`
- OpenAI image edit client:
  - `editImages(...)`

## Next Step (the ONLY thing to do this session)

**Do:** No immediate implementation work. Re-open only for a live `gpt-image-*` provider regression.
**Files:** none
**Test:** rerun the Electron smoke plus the image-edit host/client tests if a regression is reported

## Implementation Notes

Mandatory pre-read:

- `.kiro/HIGH_RISK_ENTRY.md`

Implementation shape:

1. Renderer
   - Add a transparent canvas overlay on top of the existing `chat-image-editor-preview`
   - Support brush drawing with visible orange-tinted mask feedback
   - Support brush size adjustment
   - Convert the painted overlay into a black/white mask image for submission
   - Add a dedicated submit path for Touch Edit that sends:
     - target image
     - mask data URL
     - prompt
     - active thread id

2. Host
   - Add a dedicated IPC path, for example `image:touchEdit`
   - Decode `maskDataUrl`
   - Call OpenAI edits with both the target image and the mask
   - Append the edited result into the same `image-chat` thread
   - Preserve result/stage behavior the same way normal Image Chat image runs do

3. Image client
   - Extend `ImageEditInput` / `editImages(...)` to support an optional mask upload
   - Keep compatibility for existing multi-reference edit flow

Provider behavior:

- OpenAI / `gpt-image-2`: use native mask edits
- Other providers without native mask support:
  - fail clearly, or
  - explicitly fall back only if current product behavior already expects degraded edit mode
- Do not silently pretend mask editing is supported when it is not

## Acceptance Criteria

- User can open Touch Edit from a selected/generated image
- User can paint a visible mask region on top of the image
- User can adjust brush size
- User can submit a prompt describing what to change
- The request sends target image + mask + prompt to the backend
- The backend returns a new edited image result
- The new edited image is appended into the active Image Chat thread as a new assistant result turn
- The right-side stage moves to the new edited image
- Existing non-mask image edit / continue-edit behavior is not regressed

## Verification

```bash
npm run build
npm run build:electron
```

If `electron/renderer/index.html` is touched:

```bash
node -e "
const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];
let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});
try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}
"
```

Manual smoke:

1. Open Image Chat and generate or select an image result.
2. Open Touch Edit.
3. Brush over a small area with a visible mask.
4. Enter a simple local change, for example "把这个区域改成蓝色".
5. Submit and confirm:
   - the edited image returns
   - the edited image is appended as a new assistant result message
   - the right-side stage switches to that edited image

## Risk Points

- Risk: mask editing can be visually correct in renderer but malformed on upload. Guard: verify the generated mask image is black background + white painted region before wiring backend blame.
- Risk: existing chat image editor modal already supports extra reference images; Touch Edit must not break that path. Guard: keep mask submission as an additive path, not a replacement of current editor state.
- Risk: providers without native mask edits may look “supported” by accident. Guard: explicitly gate non-OpenAI paths.

## High-Risk Files Touched

- `electron/renderer/index.html` -> only existing chat image editor modal, mask overlay, and Image Chat touch-edit submission path
- `electron/ElectronChatPanel.ts` -> only new touch-edit IPC handling and result append plumbing

## Definition of Done

- [x] Brush mask overlay works visually
- [x] Brush size can be changed
- [x] Target image + mask + prompt are sent to backend
- [x] OpenAI edits path returns a new edited image in host/client coverage
- [x] Edited image is appended as a new assistant result turn in the active thread
- [x] Right-side stage switches to the edited result in host coverage
- [x] `npm run build` passes
- [x] `npm run build:electron` passes
- [x] Renderer JS syntax check passes
