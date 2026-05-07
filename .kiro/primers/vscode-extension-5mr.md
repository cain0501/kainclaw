# Task Primer: vscode-extension-5mr — Midtai 画布空白根因排查与修复

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

排查 Midtai 在生成设计后画布空白的问题，在运行时链路上确认 `design:result -> designBridgeState.html -> openCanvas -> mcFrame.srcdoc` 哪一环失效或被覆盖，然后用最小改动修复。

## Out of Scope

- Do not change design prompt logic
- Do not modify product rules or unrelated Midtai UI
- Do not touch `src/extension.ts`
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] 已确认问题主要落在 `electron/renderer/index.html` 的 Midtai / design bridge 链路
- [x] 已确认 `ElectronChatPanel.ts` 会向 renderer 发送 `design:result`
- [x] 已确认 renderer 中已存在部分临时调试日志
- [x] 已补充 `design:result` / `openCanvas` / `srcdoc` 相关运行时日志
- [x] 已跑通一次真实 Electron 设计生成，当前工作树下未复现“生成后画布空白”

## Next Step (the ONLY thing to do this session)

**Do:** 在 `electron/renderer/index.html` 的 `design:result`、`openCanvas`、`mcFrame.srcdoc` 写入/清空路径补足临时日志，跑一次生成拿到根因后立即修复。  
**Files:** `electron/renderer/index.html`, `electron/ElectronChatPanel.ts`  
**Test:** `npm run build:electron`

## Verification

```bash
npm run build:electron
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('OK');}catch(e){console.error(e.message);process.exit(1);}"
```

Manual test:
- Step 1: 启动 Electron 壳
- Step 2: 进入 Midtai，生成一个设计
- Step 3: 观察主进程/renderer 控制台里 `KC-DEBUG` 日志，确认 `msg.html` 长度、`openCanvas` 时 `designBridgeState.html` 是否存在、`srcdoc` 是否被清空或覆盖

## Risk Points

- Risk: `electron/renderer/index.html` 内联脚本改坏导致白屏  →  Guard: 改动只限设计桥接相关函数，改后立即跑 `npm run build:electron` 和 JS syntax check
- Risk: 调试日志加太散，反而掩盖真实链路  →  Guard: 日志只加在 `design:result`、`openCanvas`、`renderDesignBridgePage` / `srcdoc` 写入点与清空点

## High-Risk Files Touched

- `electron/renderer/index.html` → 仅限 `handleMessage` 中 `design:result` / `design:patchResult`、`openCanvas()`、`renderDesignBridgePage()`、与 `mcFrame.srcdoc` / `frameEl.srcdoc` 相关区域
- `electron/ElectronChatPanel.ts` → 仅在 `sendToRenderer({ type: "design:result" ... })` 相邻区域确认是否需要补日志；无必要不做结构改动

## Reference (only load if stuck)

- `.kiro/HIGH_RISK_ENTRY.md`
- `.kiro/CURRENT_STATE.md`

## Definition of Done

- [ ] 已确认空白根因，不再停留在猜测
- [ ] 修复代码已落地，且范围最小
- [ ] `npm run build:electron` 通过
- [ ] `electron/renderer/index.html` JS 语法检查通过
- [ ] 复现路径重新验证，画布不再空白
