# Primer: vscode-extension-8ib
# 导出 ZIP：HTML + 资源打包下载

## Task Goal

为 Midtai / KainClaw Design 的导出区新增 ZIP 选项，导出一个可下载的 `.zip` 包，至少包含最终 HTML 文件和被 HTML 引用的本地资源文件。优先复用现有 `src/design/exporters.ts` 里的 ZIP helper，不引入新依赖。

## Out of Scope

- 不改 PDF / PPTX 的导出逻辑
- 不重做 design export 整体架构
- 不处理远程 URL 资源下载
- 不修复与本任务无关的全仓类型/测试基线问题
- Do not touch these files: `src/extension.ts`, `src/webviewHtml.ts`

## Already Completed

- [x] 现有导出链路已确认：
  - `electron/renderer/index.html` 有 HTML / PDF / PPTX 导出入口
  - `electron/main.ts` 已提供 `design:exportHtml` / `design:exportPdf` / `design:exportPptx` IPC
  - `src/design/exporters.ts` 已存在 ZIP helper（`createZip`）可复用
- [x] `src/design/exporters.ts`
  - 已新增 `exportDesignZip()`
  - ZIP 内会包含 `index.html` 和从 HTML 中抽取出来的本地 data URL 资源文件
- [x] Electron 链路
  - `electron/main.ts` 已新增 `design:exportZip`
  - `electron/preload.ts` 已暴露 `window.electronAPI.exportDesignZip`
  - `electron/renderer/index.html` 已新增 ZIP 导出按钮和 `exportDesignWorkbench('zip')` 分支
- [x] 测试
  - `src/design/exporters.test.ts` 已覆盖 ZIP 包结构
  - `electron/rendererSettings.test.ts` 已覆盖 ZIP 导出按钮和 API 锚点

## Next Step (the ONLY thing to do this session)

**Do:** 扩展现有 design export 链路，新增 ZIP 导出格式与最小测试覆盖。
**Files:** `.kiro/primers/vscode-extension-8ib.md`, `src/design/exporters.ts`, `src/design/exporters.test.ts`, `electron/main.ts`, `electron/preload.ts`, `electron/renderer/index.html`
**Test:** `npx vitest run src/design/exporters.test.ts electron/rendererSettings.test.ts && npm run build:electron`

## Verification

```bash
npx vitest run src/design/exporters.test.ts electron/rendererSettings.test.ts
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: 打开 Midtai 设计画布，点击导出菜单，确认出现 `导出 ZIP`
- Step 2: 导出 ZIP，解压后确认至少有 `index.html` 和资源目录/资源文件

## Risk Points

- Risk: renderer 导出菜单改坏现有 HTML/PDF/PPTX 入口
  → Guard: 只追加 ZIP 按钮，保持既有按钮和分支顺序不变
- Risk: ZIP 内没有资源或 HTML 引用路径不对
  → Guard: exporter 测试覆盖 ZIP 文件名、HTML 条目和资源条目
- Risk: `electron/renderer/index.html` 为高风险单文件
  → Guard: 只改导出菜单和 `exportDesignWorkbench()` 对应分支，改后立即跑 `build:electron` 与 JS syntax check

## High-Risk Files Touched

- `electron/renderer/index.html`
  - 只改导出菜单按钮区域（画布 toolbar 与 design export details）
  - 只改 `exportDesignWorkbench(format)` 分支
  - 不改其他 renderer 逻辑块

## Reference (only load if stuck)

- Beads: `bd show vscode-extension-8ib`
- Existing exporters: `src/design/exporters.ts`
- Existing IPC export handlers: `electron/main.ts`

## Definition of Done

- [x] `npx vitest run src/design/exporters.test.ts electron/rendererSettings.test.ts` 通过
- [x] `npm run build:electron` 通过
- [x] 如果改了 `electron/renderer/index.html`：JS 语法检查通过
- [x] Next step implemented（只做 ZIP 导出这件事）
- [ ] Beads notes 已更新：写了做了什么 + 下一步具体是什么
- [ ] `bd close` 或 `bd update` 已执行
- [ ] 如果有 UI 变动：告知用户需要手测的具体步骤
