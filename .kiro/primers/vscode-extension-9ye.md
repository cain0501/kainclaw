# Task Primer: vscode-extension-9ye — 应用改写流式输出：patch 生成过程可见

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

当用户点「应用改写」后，目前进入黑盒等待。本任务目标很简单：**让用户知道 AI 在工作**，不需要完整流式 HTML。只需在 popover 区域显示少量有意义的中间信息（如首个 token 的元素标签、简短状态文字），消除黑盒感即可。

## Out of Scope

- 不需要把流式 HTML 实时渲染进 canvas iframe（残缺 HTML 会闪烁）
- 不改动 patchEngine 的核心逻辑，只加 streaming 调用路径
- 不改动 `src/` 以外的其他 feature

## Already Completed

- patchEngine 的 provider 调用已支持 streaming（参考 designEngine.ts 的流式实现）
- 「应用改写」按钮 + popover 已存在

## Next Step (the ONLY thing to do this session)

最简实现，**只改 renderer 和 host 两处**，不改 patchEngine 核心逻辑：

### 1. renderer：点击后立即给反馈

点「应用改写」时：
- 按钮变为「改写中...」禁用态
- popover 内 textarea 下方显示一行状态文字，例如：「✦ AI 正在分析节点...」
- 约 1～2 秒后（收到首个 token 时）更新为：「✦ 正在生成改写内容...」

### 2. host：发送首个 token 信号

在 `electron/ElectronChatPanel.ts` 处理 patch 时，收到第一个 stream token 后发一次消息：

```typescript
// 只发一次，不需要每个 token 都发
webview.postMessage({ type: 'design:patchStarted' })
```

### 3. renderer：接收信号更新状态文字

收到 `design:patchStarted` → 状态行更新为「✦ 正在生成改写内容...」  
收到 `design:patchResult` → 清除状态行，替换节点，恢复按钮

**Files:** `electron/ElectronChatPanel.ts`（加一次首 token 信号），`electron/renderer/index.html`（状态行 UI）  
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- 选中一个文字节点，输入描述，点「应用改写」
- 按钮立即变为「改写中...」，出现「✦ AI 正在分析节点...」
- 约 1～2 秒后状态更新为「✦ 正在生成改写内容...」
- 生成完成 → 节点替换，状态行消失，按钮恢复

## Risk Points

- Risk: `design:patchStarted` 在 `design:patchResult` 之后才到（极端情况）
  Guard: renderer 收到 `patchResult` 时无论如何清理状态，不依赖两者顺序
- Risk: 生成失败时状态行卡住不消失
  Guard: error 路径也清理状态行 + 恢复按钮

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` — 首 token 信号发送（改动极小）
- `electron/renderer/index.html` — popover 状态行 UI + message handler

## Reference (only load if stuck)

- 流式实现参考：`src/design/designEngine.ts`（已有 streaming 模式）
- Beads: `bd show vscode-extension-9ye`

## Definition of Done

- [ ] 点「应用改写」后按钮立即变为禁用态「改写中...」
- [ ] popover 出现「✦ AI 正在分析节点...」状态行
- [ ] 收到首 token 信号后状态行更新为「✦ 正在生成改写内容...」
- [ ] 生成完成后节点替换，状态行消失，按钮恢复
- [ ] 生成失败时状态行消失，显示错误信息
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
