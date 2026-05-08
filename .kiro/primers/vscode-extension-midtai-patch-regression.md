# Task Primer: vscode-extension-midtai-patch-regression — Midtai 模型 patch no-op 回归

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

排查并修复 Midtai 画布里“换个颜色 / 换设计样式”这类模型 patch 请求生成了新版本、但目标元素实际没变的回归。重点是确认模型输出与 patch 应用链的真实行为，并阻止 no-op patch 被当成成功版本保存。

## Out of Scope

- Do not rebuild pure text rewrite flow
- Do not rebuild image replacement flow
- Do not change product rules or Midtai 其他 UI
- Do not touch `src/extension.ts`
- Do not touch `src/webviewHtml.ts`
- Do not make broad renderer refactors

## Already Completed

- [x] 已确认纯文本改写 `110+ -> 120+` 已成功写入 active version
- [x] 已确认图片替换链至少有一次成功写入 active version
- [x] 已确认当前主问题是模型 patch 生成新版本但按钮 HTML 未变化
- [x] 已沿 `patchDesignWorkbench -> patchKainClawDesignNode -> applyDesignPatchRequest` 读完当前链路
- [x] 已确认 `applyDesignPatch()` 失败时会抛错，不会静默保存版本

## Next Step (the ONLY thing to do this session)

**Do:** 收紧模型 patch 合同，并在 host / patchEngine 上拦截 no-op patch，确保“返回原样 node”不会再被保存成成功版本。
**Files:** `src/design/patchEngine.ts`, `src/design/patchEngine.test.ts`, `electron/ElectronChatPanel.ts`, `electron/ElectronChatPanel.test.ts`
**Test:** `npm test -- src/design/patchEngine.test.ts electron/ElectronChatPanel.test.ts && npm run check && npm run build:electron`

## Verification

```bash
npm test -- src/design/patchEngine.test.ts electron/ElectronChatPanel.test.ts
npm run check
npm run build:electron
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('OK');}catch(e){console.error(e.message);process.exit(1);}"
```

Manual test:
- Step 1: 在 Midtai 画布选中按钮，输入“换个颜色”或“换设计样式”
- Step 2: 若模型仍返回原样 node，应看到明确错误而不是生成一个无变化版本
- Step 3: 若模型返回真实改动，最新 active version 里的目标按钮 HTML 应变化

## Risk Points

- Risk: 误伤纯文本 deterministic fast path  →  Guard: 只改模型 patch 分支，不改 text fast path
- Risk: 高风险文件 `electron/ElectronChatPanel.ts` 改坏 patch 成功回传  →  Guard: 只改 `patchDesignWorkbench()` 的模型结果校验与日志
- Risk: 提示词收紧后影响现有 patch 测试  →  Guard: 补回归测试覆盖 unchanged replacement 与 hero-action selector 场景

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` → only `patchDesignWorkbench()` block (~3485–3588)
- Do NOT touch any other region of this file

## Reference (only load if stuck)

- `.kiro/HIGH_RISK_ENTRY.md`
- `.kiro/CURRENT_STATE.md`
- Existing patch flow tests in `src/design/patchEngine.test.ts` and `electron/ElectronChatPanel.test.ts`

## Definition of Done

- [ ] 模型 patch prompt 明确包含当前目标 node，并禁止返回 unchanged node
- [ ] no-op patch 不再保存为新版本
- [ ] 针对按钮 selector / unchanged patch 的回归测试已补齐
- [ ] `npm test -- src/design/patchEngine.test.ts electron/ElectronChatPanel.test.ts` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] 本次只做 primer 定义的这一件事
