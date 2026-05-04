# Task Primer: vscode-extension-yi9 — Design：lastOpenedDesignProjectId 跨 session 持久化

> **Session entry point.** Read this first. 不需要读其他文档。

## 前置条件

本任务在 `vscode-extension-ged`（Canvas Toolbar）完成后执行。
需要先确认 `src/design/designProjectStore.ts` 中 `DesignProject` 数据层已就绪。

## Next Step（本次 session 只做这一件事）

**实现跨 session 路由：用户重开 app 后，自动回到上次打开的 design project，不经过 Design Home。**

具体要求（来自 `kainclaw-design-ux-v2.md` §3.1 §3.2）：

### 持久化层
在 `src/design/designProjectStore.ts` 里增加：
- `getLastOpenedProjectId(): Promise<string | null>` — 读取持久化的 lastOpenedProjectId
- `setLastOpenedProjectId(id: string): Promise<void>` — 写入，每次打开 project 时调用

存储方式：用现有 SQLite 数据库新建一张 `design_meta` 单行 KV 表，或复用已有 key-value 机制（先看代码里有无现成的 KV store，有就复用）。

### IPC 层
在 `electron/ElectronChatPanel.ts` 里增加两个消息处理：
- `design:getLastProject` → 读 lastOpenedProjectId，查 designProjectStore，返回 project + activeVersion（找不到返回 null）
- `design:openProject` → 打开指定 project，同时调用 `setLastOpenedProjectId`

### Renderer 层
在 `electron/renderer/index.html` 的 Design 页面初始化逻辑里：
- 进入 Design 页面时，先发 `design:getLastProject`
- 如果返回了 project → 直接进编辑器（跳过 Design Home）
- 如果返回 null → 显示 Design Home

## 高危文件准入

进入 `electron/renderer/index.html` 前确认：
1. 只动 Design 页面的路由初始化逻辑（`showPage('page-design')` 相关）
2. 不碰 canvas、左侧面板、Tweaks 等其他区域
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
1. 打开一个 design project，记住项目名
2. 关闭 app，重新打开
3. 点击左侧导航「设计」→ 直接进入上次打开的 project 编辑器，不经过 Design Home
4. 如果是全新安装（无历史 project）→ 进入 Design Home

## Definition of Done

- [ ] `npm test` 通过（169 文件，1311 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] 重开 app 后自动回到上次 project
- [ ] 无 project 时正常进入 Design Home
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
