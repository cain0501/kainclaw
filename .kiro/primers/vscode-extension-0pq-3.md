# Task Primer: vscode-extension-0pq-3 — Design 编辑器：左侧面板阶段 A/B

> **Session entry point.** Read this first. 不需要读其他文档。

## 前置条件

本任务在 `vscode-extension-0pq-2`（Tweaks 右侧抽屉）完成后执行。

## Next Step（本次 session 只做这一件事）

**让左侧面板根据是否有设计内容，显示不同的内容（阶段 A / 阶段 B）。**

具体要求（来自 `kainclaw-design-ux-v2.md` §5.2）：

**阶段 A — 无设计内容（刚进入/新建）：**
- 设计需求输入框（主操作）
- 输出类型选择（prototype / slide / infographic / animation）
- 风格提示（可选，折叠）
- 参考图上传（可选，折叠）
- 「生成设计」按钮

**阶段 B — 有设计内容（生成后）：**
- 项目名 + 当前版本信息
- 对话式输入框（「继续修改 / 提新需求」）
- 模式选择（编辑当前 / 新建设计）
- 版本历史（折叠，展开显示最近 5 条）
- 导出按钮组（折叠）

**始终不在左侧显示：** Sliders（已移至右侧抽屉）

**涉及文件：** `electron/renderer/index.html`（左侧面板相关 HTML/CSS/JS）

## 高危文件准入

进入 `electron/renderer/index.html` 前确认：
1. 只动左侧面板（`design-left-panel` 或等价区块）的 HTML/CSS/JS
2. 不碰 Design Home、Tweaks 抽屉、顶部栏等其他区域
3. 改完立即：`npm run build:electron`

详见：`.kiro/HIGH_RISK_ENTRY.md`

## Verification

```bash
npm test          # 基线：169 文件，1310 测试
npm run check
npm run build
npm run build:electron
```

手测步骤（告知用户执行）：
1. 新建设计进入编辑器 → 左侧显示阶段 A（输入框 + 输出类型 + 生成按钮）
2. 生成设计后 → 左侧自动切换为阶段 B（对话框 + 版本历史）
3. 点击「版本历史」折叠块，展开/收起正常
4. 点击「导出」折叠块，展开/收起正常

## Definition of Done

> **Codex 负责验证命令，用户只做手测。**

- [ ] `npm test` 通过（169 文件，1310 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] 无内容时显示阶段 A，有内容时显示阶段 B
- [ ] 版本历史和导出按钮组折叠/展开正常
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
