# Primer: vscode-extension-79t
# Midtai Unified Workbench 视觉 QA 与交互收口

## 阶段标记

Phase 4 收口 / 纯 renderer / 无 IPC 协议变更
涉及：`electron/renderer/index.html` 视觉细节修正

参考原型：`.kiro/midtai-unified-workbench-mock.html`（在浏览器里打开对照）

---

## 背景

jzu 完成后，Midtai 的 Unified Workbench 新架构已落地：
- `midtai-app / midtai-shell / midtai-workspace / midtai-board-shell-*` 三 board 结构就位
- Shell sidebar、topbar、三 tab board 切换、showMidtaiTab() 均接入

本 issue 是 Phase 4 的视觉收口：**不改架构，不改协议，只修视觉和交互细节**。

---

## 验收清单

### A. 逐项对照 mock 做视觉验收

打开 `.kiro/midtai-unified-workbench-mock.html` 与当前 renderer 并排检查：

| 区域 | 对照点 |
|------|--------|
| Shell sidebar | logo 区：K 图标大小/圆角/颜色，标题/副标题 typography |
| Shell sidebar | 快速操作区：按钮宽度、gap、样式（primary/secondary 区分） |
| Shell sidebar | 当前上下文区：option 行的字号、颜色、行高 |
| Shell sidebar | 快捷跳转区：按钮样式统一 |
| Topbar | tab pill 形状：border-radius 999px，active 橙红渐变，inactive 透明 |
| Topbar | headline typography：font-size、font-family（serif） |
| Topbar | goal chip：pill 圆角、dot 颜色、字号 |
| Topbar | 右侧按钮：+ 新建作品，primary 样式 |
| Pane | border-radius 24px，box-shadow，背景渐变 |
| Pane scroll | padding 20px |
| Section head | flex 对齐，margin-bottom 14px |
| Section title | font-size 15px, font-weight 700 |
| Section sub | font-size 12px, color muted |
| Design tab 左栏 | 最近作品列表项高亮样式（当前选中 vs 未选中） |
| Design tab 右栏 | chat sub-tabs 样式（设计对话/画布预览/版本记录） |
| Image tab 左栏 | 工具表单各行 spacing |
| Image tab 右栏 | 生成中 skeleton、已生成卡片 |
| Library tab | 设计作品库/图片素材库 sub-tab 样式，卡片 grid |

### B. Spacing / Hierarchy 全局检查

- 所有 gap/padding 与 mock CSS token 对齐（gap: 16px / padding: 20px / 22px 等）
- 字体层级：heading 用 `--font-display`（serif），body 用 `--font-body`
- 颜色层级：`--text` / `--ink-soft` / `--muted` 三档灰度正确使用

### C. Responsive / 小窗口验收

mock 里的 `@media (max-width: 1240px)` 规则：
- `< 1240px` 时 shell sidebar 隐藏，board 改为单栏
- goal chip 隐藏
- 验证在 Electron 窗口缩小时不出现横向滚动条或内容溢出

### D. 三 Board 一致性

- 三个 board 的 pane 样式一致（同一套 `.midtai-pane` 类）
- board 间切换无闪烁、无白屏
- 切回 design tab 时最近作品列表高亮正确（当前 project）

### E. 关键交互验收

| 场景 | 预期 |
|------|------|
| 点左侧最近作品 A | 右侧 design chat 加载 A 的历史，goal chip 更新 |
| 点左侧最近作品 B | 右侧切换到 B 的历史 |
| 切到图像 tab | 左侧工具表单正常，右侧历史网格正常 |
| 切到作品库 tab | 设计作品库 / 图片素材库 sub-tab 切换正常 |
| 点 shell 「+ 新建作品」 | 进入临时工作态，左侧出现临时条目 |
| 分流弹框 | 在新布局下弹出位置正确（不被 board 遮挡） |
| Shell 快捷跳转按钮 | 「当前作品画布」打开正确，「回到设计对话」切换正确 |

---

## 明确不做

- 不改 IPC 协议（design:switch-project、design:flow-context 等）
- 不改 p3 的 project/session 绑定逻辑
- 不把 design 工作流入口重新拉回主 chat 侧栏
- 不做结构性重组（jzu 已完成，不再动架构）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 中 | 单文件 renderer，每次改完跑 renderer JS syntax check |

---

## 验收命令

```bash
npm run build:electron    # renderer 打包
npm run check             # TS type check
npm run build             # 全量 build
# renderer inline JS syntax check（手工或 node -e 脚本）
```

功能回归用例（最小集）：
```bash
npx vitest run electron/rendererSettings.test.ts
npx vitest run electron/ElectronChatPanel.test.ts --testNamePattern "switches design chat history and flow context by project|omits design sessions from the main sessions:data sidebar payload"
```
