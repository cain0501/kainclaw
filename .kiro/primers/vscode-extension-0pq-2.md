# Task Primer: vscode-extension-0pq-2 — Design 编辑器：Tweaks 右侧抽屉

> **Session entry point.** Read this first. 不需要读其他文档。

## 已完成（不需要再做）

- [x] Design Home UI（阶段 1 全部）
- [x] 顶部模式指示器 badge
- [x] 模式选择 UI 说明文字重构
- [x] 删除左侧面板底部「返回聊天」重复按钮

## Next Step（本次 session 只做这一件事）

**把 Sliders/Tweaks 面板从左侧移到右侧浮动抽屉。**

具体要求（来自 `kainclaw-design-ux-v2.md` §5.4）：
- Tweaks/Sliders 作为 canvas **右侧浮动抽屉**，默认收起
- 顶部栏已有「Tweaks」按钮，点击展开/收起
- 展开后浮在 canvas 右侧，不遮挡主画布
- 仅在 `editModeAvailable === true` 时 Tweaks 按钮可用（保持现有逻辑）
- 左侧面板**不再显示** Sliders 内容

**涉及文件：** `electron/renderer/index.html`（Sliders 相关 HTML/CSS/JS）

## 高危文件准入

进入 `electron/renderer/index.html` 前确认：
1. 只动 Sliders/Tweaks 相关的 HTML 区块、CSS（`design-sliders-*`、`design-tweaks-*`）和对应 JS
2. 不碰 Design Home、版本历史、导出等其他区域
3. 改动前搜：`grep -n "slider\|tweaks\|Tweaks" index.html` 确认所有相关位置
4. 改完立即：`npm run build:electron`

详见：`.kiro/HIGH_RISK_ENTRY.md`

## Verification

```bash
npm test          # 基线：169 文件，1310 测试
npm run check
npm run build
npm run build:electron
```

手测步骤（告知用户执行）：
1. 进入编辑器，确认左侧面板不再有 Sliders
2. 点顶部「Tweaks」按钮，右侧抽屉展开
3. 调整 slider 值，canvas 内容实时响应
4. 再次点「Tweaks」，抽屉收起
5. 无设计内容时，Tweaks 按钮不可点（灰色）

## Definition of Done

> **Codex 负责验证命令，用户只做手测。**

- [ ] `npm test` 通过（169 文件，1310 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] 左侧面板不再显示 Sliders
- [ ] 右侧抽屉展开/收起正常
- [ ] Tweaks 按钮在无内容时不可用
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
