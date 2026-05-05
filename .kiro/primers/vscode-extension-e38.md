# Task Primer: vscode-extension-e38 — midtai 我的作品数据接入

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

midtai My Works（我的作品）目前只显示占位内容。`MidtaiLibraryHost` 已在 electron 层实现，能推送 `midtai:library-update` 消息，但 renderer 没有处理这条消息。本任务让 My Works 显示真实的设计项目列表。

## Out of Scope

- 不改 `src/` 下任何文件
- 不改 `MidtaiLibraryHost` 本身
- 不做图像作品接入（只做设计项目）
- 不做替换模式的卡片变体（replaceCtx 逻辑已存在，不动）

## Already Completed

- `MidtaiLibraryHost` 已实现，推送 `midtai:library-update`（`electron/ElectronChatPanel.ts` 约第 2085 行）
- `#view-works` + `updateWorksForContext()` 已存在
- `openCanvas(projectName)` 已存在

## Next Step (the ONLY thing to do this session)

**Files:** `electron/renderer/index.html` only

### 1. 监听 `midtai:library-update`

在 message handler（`case` 分支里）新增：

```javascript
case 'midtai:library-update':
  midtaiState.libraryItems = Array.isArray(msg.items) ? msg.items : [];
  renderMidtaiWorks();
  break;
```

在 `midtaiState` 对象里加 `libraryItems: []`。

### 2. 触发拉取：切到 My Works 时请求数据

在 `designSwitchView('works')` 和 `imgSwitchView('works')` 执行时，调用：

```javascript
send({ type: 'midtai:request-library' });
```

### 3. 渲染函数 `renderMidtaiWorks()`

替换 `updateWorksForContext()` 里的占位内容，改为根据 `midtaiState.libraryItems` 渲染。

每个设计项目卡片：
- 显示项目名（`item.title`）
- 显示类型 badge（`item.type === 'design'` → 「设计」）
- hover 显示「打开编辑」按钮 → `onclick="openCanvas('${item.title}')"`

正常模式下显示全部；replace 模式下只显示图像类型（`item.type === 'image'`），卡片 hover 按钮改为「✓ 选用此图」。

数据为空时显示：「还没有作品，先去生成预览创建设计稿」

**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test（告知用户手测）:
1. 生成一个设计稿进入画布，退出画布
2. 切到「我的作品」→ 看到刚才生成的项目卡片，不是占位文字
3. 点「打开编辑」→ 重新进入画布

## Risk Points

- Risk: `midtai:request-library` 消息类型 host 不认识
  Guard: 先 grep `ElectronChatPanel.ts` 确认 host 已处理 `midtai:request-library`，如果没有需要同步在 host 里加处理
- Risk: `item` 结构与预期不符
  Guard: console.log msg.items 第一条，对照 `MidtaiLibraryHost` 的 DTO 类型

## High-Risk Files Touched

- `electron/renderer/index.html` — midtaiState、message handler、renderMidtaiWorks、designSwitchView/imgSwitchView

## Reference (only load if stuck)

- `electron/ElectronChatPanel.ts` 约第 2085 行（midtaiLibraryHost.getLibraryItems）
- `src/midtaiLibraryHost.ts`（DTO 类型定义）
- Beads: `bd show vscode-extension-e38`

## Definition of Done

- [ ] 切到「我的作品」时触发数据拉取
- [ ] 收到 `midtai:library-update` 后 My Works 显示真实卡片
- [ ] 数据为空时显示引导文字
- [ ] replace 模式下只显示图像，按钮文案正确
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
