# Task Primer: vscode-extension-ged — Design 编辑器：Canvas Toolbar

> **Session entry point.** Read this first. 不需要读其他文档。

## 前置条件

本任务在 `vscode-extension-0pq-4`（Patch Popover 贴近元素）完成后执行。

## Next Step（本次 session 只做这一件事）

**在 iframe canvas 上方加一条轻量 toolbar，包含 View / Select / Tweaks 三个模式按钮。**

具体要求（来自 `kainclaw-design-ux-v2.md` §5.2）：

- **View**：默认模式，正常浏览 canvas，不触发 patch 流程
- **Select**：点击后进入选元素模式，点击 iframe 内元素触发 patch popover
- **Tweaks**：展开/收起右侧 Tweaks 抽屉（与顶部导航栏 Tweaks 按钮联动，两处同步状态）

三个按钮互斥高亮，当前激活模式高亮显示。

toolbar 放在 canvas 区域（右侧列）顶部，iframe 上方，不占用 iframe 空间（绝对定位或静态布局均可，以不破坏 iframe 填满右列为准）。

顶部导航栏原有 Tweaks 按钮保留不动，两处均可触发同一个抽屉。

**涉及文件：** `electron/renderer/index.html`（canvas 区域 HTML/CSS/JS）

## 高危文件准入

进入 `electron/renderer/index.html` 前确认：
1. 只动 canvas 区域（右侧列，`design-bridge-frame` 所在容器）的 HTML/CSS/JS
2. 不碰左侧面板、Design Home、Tweaks 抽屉内部等区域
3. 改完立即：`npm run build:electron`

详见：`.kiro/HIGH_RISK_ENTRY.md`

## Verification

```bash
npm test          # 基线：169 文件，1311 测试
npm run check
npm run build
npm run build:electron
```

手测步骤（告知用户执行）：
1. 进入有设计内容的编辑器，canvas 上方可见 View / Select / Tweaks 三个按钮
2. 默认 View 高亮
3. 点 Select，高亮切换，点击 canvas 内元素触发 patch popover
4. 点 Tweaks，右侧抽屉展开，同时顶部导航栏 Tweaks 按钮文字同步变为「关闭 Tweaks」
5. 再点 Tweaks（或顶部导航栏），抽屉收起，两处按钮状态同步

## Definition of Done

- [ ] `npm test` 通过（169 文件，1311 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] Canvas toolbar 三按钮可见，互斥高亮
- [ ] Tweaks 按钮与顶部导航栏状态联动
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
