# Primer: vscode-extension-bdi
## Design 导出全部失效（HTML / PDF / PPTX）

### 背景

用户点击 Design 模块左侧面板的"导出 HTML"、"导出 PDF"、"导出 PPTX" 按钮均无效果。

### 排查路径

导出调用链：

```
renderer: exportDesignWorkbench(format)
  → send({ type: "design:export", format, html, sliders })
  → ElectronChatPanel: exportDesignWorkbench(message)   ← 从这里开始查
  → src/design/exporters.ts: exportDesignHtml() / exportDesignPptx()
```

**Step 1 — 读 ElectronChatPanel.ts 里的 `exportDesignWorkbench` 方法**（大约在 line 3349 附近），确认：
- 接收到的 `format` 值是否正确（`"html"` / `"pdf"` / `"pptx"`）
- `html` 和 `sliders` 是否有值
- 是否有 try/catch 吞掉了错误但没回传给 renderer

**Step 2 — 读 renderer 的 `exportDesignWorkbench` 函数**（index.html，约 line 3752），确认：
- `send()` 调用时传的 `html` 字段是否取的是当前版本的 HTML（`designBridgeState.html`）
- `sliders` 字段是否传了

**Step 3 — 读 src/design/exporters.ts**，确认：
- `exportDesignHtml()` 和 `exportDesignPptx()` 的参数签名
- `storageRoot` 路径是否正确
- PPTX 导出依赖 `renderSlideImage` 回调——这个回调在 ElectronChatPanel 里是怎么传进去的

### PDF 处理

`DesignExportFormat = "html" | "pdf" | "pptx"` 里有 `pdf`，但 exporters.ts 没有实现。

**处理方案（选一）：**
- A：用 Electron 的 `webContents.printToPDF()` 实现 PDF 导出（需要把 HTML 加载到 BrowserWindow 再导出）
- B：暂时在 UI 上禁用"导出 PDF"按钮，改为灰色 + tooltip "即将推出"

优先选 B（更快，避免引入新依赖），除非用户明确要求 A。

### 验收

```
1. 点"导出 HTML" → 系统文件保存对话框弹出 → 保存后能用浏览器打开
2. 点"导出 PPTX" → 系统文件保存对话框弹出 → 保存后能用 PowerPoint 打开
3. 点"导出 PDF" → 要么能保存 PDF，要么按钮禁用并有说明
```

### 完成后

```bash
npm run build
npm run build:electron
bd close vscode-extension-bdi
git add <files> && git commit -m "Fix Design export (HTML/PPTX); disable PDF button"
git push
```
