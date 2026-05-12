# Task Primer: ad-hoc-library-tab-jank-fix - defer heavy library image rendering and avoid base64 innerHTML stalls

> Session entry point for this scoped performance fix in the renderer. No extra docs needed unless the targeted verification fails.

## Task Goal

Fix Midtai library tab jank caused by synchronously injecting large base64 image data into `panel.innerHTML` during tab switches. Keep tab highlight animation smooth, then let thumbnails appear progressively through the existing rAF chunk loader.

## Out of Scope

- Do not change non-library shell tabs
- Do not redesign the library image card layout or actions
- Do not touch design thumbnail scheduling or unrelated image panel code
- Do not touch these files: `src/extension.ts`, `src/webviewHtml.ts`, `src/license/licenseManager.ts`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-12
**Last action taken:** Deferred library view rendering with rAF, forced library image cards onto the shimmer + chunk loader path, added a decoded-thumb fast path, and passed build plus renderer script syntax verification.
**Why it was done that way:** The tab jank came from synchronously parsing large base64 image payloads in `innerHTML`, so the fix had to move heavy work off the immediate tab switch and keep decoded thumbs out of the HTML string path.
**Exact next action:** Manually smoke-test library tab switching and repeat entry to confirm the animation stays smooth and decoded thumbs appear quickly on re-entry.
**Known blockers / watch out:** No browser/Electron interaction smoke test was run in this session; only static verification passed.

## Already Completed

- [x] Identified the blocking path: `setMidtaiShellTab('library') -> renderMidtaiLibraryView() -> renderMidtaiLibraryImagePanel()`
- [x] Confirmed `observeMidtaiImageThumbs` already chunk-loads only `data-imgid` cards
- [x] Confirmed current library image render path embeds base64 `src` directly into `innerHTML` for decoded items
- [x] Deferred `renderMidtaiLibraryView()` behind `requestAnimationFrame`
- [x] Removed decoded-base64 thumbnail injection from library image `innerHTML`
- [x] Added a direct decoded-thumb fast path in `observeMidtaiImageThumbs`
- [x] Passed `npm run build`
- [x] Passed `electron/renderer/index.html` script syntax check

## Next Step (the ONLY thing to do this session)

**Do:** Manual smoke-test the library tab switch and repeat-entry thumbnail behavior in Electron.
**Files:** `electron/renderer/index.html`
**Test:** `npm run build` plus the required `electron/renderer/index.html` script syntax check

## Verification

```bash
npm run build
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
```

Manual test:
- Switch to the library tab and confirm the tab highlight animation is smooth.
- Confirm image cards first show shimmer, then progressively reveal thumbnails.
- Re-enter the library tab and confirm previously decoded thumbnails appear faster without redoing canvas compression.

## Risk Points

- Risk: thumbnail cache semantics become inconsistent between source images and compressed thumbs. Guard: keep `thumbnailCache` as the compressed-thumb store and use `imageThumbCache` only as the current fetch source for library image loads.
- Risk: deferred library rendering introduces stale rAF work after tab switches. Guard: rely on `midtaiThumbsToken` cancellation and keep render scheduling limited to a single `requestAnimationFrame`.

## High-Risk Files Touched

- `electron/renderer/index.html` -> only `setMidtaiShellTab(tab)`, `renderMidtaiLibraryImagePanel()`, and `observeMidtaiImageThumbs(container)`

## Definition of Done

- [x] Library tab rendering is deferred with `requestAnimationFrame`
- [x] Library image cards no longer inline decoded base64 thumbs into `innerHTML`
- [x] `observeMidtaiImageThumbs` has a fast path for already decoded thumbnails
- [x] `npm run build` passes
- [x] `electron/renderer/index.html` script syntax check passes
