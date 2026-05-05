# Task Primer: <BEADS_ID> — <TITLE>

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

<!-- One paragraph. What this task accomplishes and why it matters. -->

## Out of Scope

<!-- Explicitly list what NOT to do, especially adjacent temptations. -->
- Do not change business logic
- Do not fix unrelated issues encountered along the way
- Do not touch these files: <!-- list -->

## Already Completed

<!-- Bullet list of sub-steps already done with brief note on what changed. -->
- [ ] step one — extracted into `src/fooHost.ts`
- [ ] step two — …

## Next Step (the ONLY thing to do this session)

<!-- One sentence. No ambiguity. -->

**Do:** `<concrete action>`
**Files:** `src/a.ts`, `src/b.ts` (max 5 files)
**Test:** `npm run build && npm test`

## Verification

```bash
npm test
npm run check
npm run build
# If Electron behavior changed:
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: …
- Step 2: …

## Risk Points

<!-- What can go wrong? How to detect it early? -->
- Risk: …  →  Guard: …

## High-Risk Files Touched

<!-- List any high-risk files (extension.ts, webviewHtml.ts, renderer/index.html) -->
<!-- For each: what exact region/function is in scope -->
- `src/extension.ts` → only the `<FunctionName>` block (lines ~xxx–yyy)
- Do NOT touch any other region of this file

## Reference (only load if stuck)

- Spec: `.kiro/specs/…`
- Upstream behavior: `E:\claudecodejingiang\src\…`
- Beads: `bd show <BEADS_ID>`

## Definition of Done

> **Codex 负责验证命令，用户只做手测。提交前必须自己跑完以下命令。**

- [ ] `npm test` 通过（baseline: 168 files, 1299 tests）
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
- [ ] 如果改了 Electron 相关：`npm run build:electron` 通过
- [ ] 如果改了 `electron/renderer/index.html`：JS 语法检查通过（`node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('OK');}catch(e){console.error(e.message);process.exit(1);}"` ）
- [ ] Next step implemented（只做 primer 定义的那一件事）
- [ ] Beads notes 已更新：写了做了什么 + 下一步具体是什么
- [ ] `bd close` 或 `bd update` 已执行
- [ ] 如果有 UI 变动：告知用户需要手测的具体步骤（Codex 不负责手测）
