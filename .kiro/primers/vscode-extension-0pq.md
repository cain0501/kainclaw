# Task Primer: vscode-extension-0pq — KainClaw Design UX v2

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

按 `kainclaw-design-ux-v2.md` 规格，重构 Design Home 页面 UI 和编辑器布局。
原型参考：`design-home-prototype.html`（已存在，是目标视觉效果）。

## 已完成的部分（不需要再做）

- [x] `src/design/designProjectStore.ts` — 数据层 ✓
- [x] `src/design/versionStore.ts` — projectId 迁移 ✓
- [x] IPC 消息：`design:listProjects` / `design:createProject` / `design:openProject` ✓
- [x] `lastOpenedDesignProjectId` 持久化与入口路由 ✓
- [x] `renderDesignHome()` 函数骨架已存在 ✓

## 剩余工作（分两阶段）

### 阶段 1 — Design Home UI 重做（先做这个）

当前 `renderDesignHome()` 的 HTML/CSS 与 v2 原型不符。
目标：让 Design Home 视觉和交互与 `design-home-prototype.html` 一致。

具体包括：
- 顶部「新建设计」主 CTA（醒目）
- Recent Continue 区块（按 `lastOpenedAt` 降序，最多 8 个，含名称 + 时间 + 来源 badge）
- All Designs 区块（全列表）
- 空状态（无项目时只显示 CTA）

### 阶段 2 — 编辑器布局重构（阶段 1 完成后再做）

- 左侧面板按阶段 A/B 切换（无内容 vs 有内容时展示不同内容）
- Sliders 移至右侧浮动抽屉（顶部栏 Tweaks 按钮控制）
- 顶部模式指示器 badge（`新建中` / `编辑中 vN` / `生成中...`）
- 模式选择 UI 重构（明确说明文字）
- Patch popover 贴近元素浮现（通过 postMessage 坐标定位）
- 删除左侧面板底部「返回聊天」重复按钮

## Next Step（本次 session 只做这一件事）

**做阶段 1：重写 `renderDesignHome()` 的 HTML/CSS，对齐 design-home-prototype.html 的视觉效果。**

参考文件：`design-home-prototype.html`（直接作为视觉规格）
修改文件：`electron/renderer/index.html` 中的 `renderDesignHome()` 函数及相关 CSS

## 高危文件准入

`electron/renderer/index.html` 是高危文件。进入前确认：
1. 只动 `renderDesignHome()` 函数和对应 CSS（`design-home-*` 样式）
2. 不碰其他函数，不改其他区域
3. 改完前搜一遍：本次改动的函数名有无重复定义
4. 改完立即运行：`npm run build:electron`
5. 改完手测：点击导航进入 Design（有项目/无项目两种状态）

详见：`.kiro/HIGH_RISK_ENTRY.md`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

手动测试（必须做）：
1. 启动 Electron：`npm run start:electron`
2. 进入 KainClaw Design — 无项目时：只显示「新建设计」CTA
3. 新建一个项目后返回 Home：Recent Continue 和 All Designs 显示正确
4. 点击已有项目：正确进入编辑器

## Reference

- 视觉原型：`design-home-prototype.html`
- 完整规格：`.kiro/specs/kainclaw-design-ux-v2.md`（重点看第四节 Design Home）
- 高危文件规则：`.kiro/HIGH_RISK_ENTRY.md`

## Definition of Done（阶段 1）

- [ ] `renderDesignHome()` 视觉对齐 prototype.html
- [ ] 空状态、Recent、All Designs 三种状态正确渲染
- [ ] `npm test` 通过（168 文件，1299 测试）
- [ ] `npm run build:electron` 通过
- [ ] 用户手测确认（3 个场景）
- [ ] beads notes 更新：完成了什么 + 下一步是阶段 2 的哪一项
