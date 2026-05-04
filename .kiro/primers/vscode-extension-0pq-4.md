# Task Primer: vscode-extension-0pq-4 — Design 编辑器：Patch Popover 贴近元素

> **Session entry point.** Read this first. 不需要读其他文档。

## 前置条件

本任务在 `vscode-extension-0pq-3`（左侧面板 A/B）完成后执行。

## Next Step（本次 session 只做这一件事）

**让 patch 输入框浮现在用户点击的元素附近，而不是固定在左侧面板底部。**

具体要求（来自 `kainclaw-design-ux-v2.md` §5.5）：

1. 用户点击 iframe 里的元素时，iframe 通过 `postMessage` 把该元素的边界坐标传回宿主：
   ```js
   // iframe 内部（已有点击监听）
   parent.postMessage({
     type: 'element-click',
     rect: element.getBoundingClientRect()  // { top, left, width, height }
   }, '*')
   ```

2. 宿主收到坐标后，把 patch 输入框定位到元素附近：
   - 优先放在元素**正下方**
   - 空间不足时放在元素**正上方**
   - 水平方向对齐元素左边缘，超出边界时向左收

3. patch 输入框**不再出现在左侧面板**

**涉及文件：**
- `electron/renderer/index.html`（postMessage 接收 + popover 定位逻辑）
- iframe 内嵌的设计页面 HTML（postMessage 发送）

## 高危文件准入

进入 `electron/renderer/index.html` 前确认：
1. 只动 patch popover 定位相关的 JS 和 CSS
2. 不碰左侧面板、Design Home、Tweaks 抽屉等其他区域
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
1. 进入有设计内容的编辑器
2. 点击 canvas 里的某个元素（文字、图片、按钮）
3. patch 输入框应浮现在该元素附近（下方优先）
4. 点击靠近底部的元素，确认 popover 自动切换到元素上方
5. 左侧面板不再显示 patch 输入框

## Definition of Done

> **Codex 负责验证命令，用户只做手测。**

- [ ] `npm test` 通过（169 文件，1310 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] Patch popover 贴近被点击元素出现
- [ ] 上下方向自动判断
- [ ] 左侧面板不再有 patch 输入框
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
