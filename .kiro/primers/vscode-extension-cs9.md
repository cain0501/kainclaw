# Primer: vscode-extension-cs9
# 删除 page-images 页面壳与隐藏入口

## 背景

8b5 + axn + 7q8 完成后，page-images 内的 `imglab-*` 节点不再有任何活跃读写。
本 issue 执行实际删除，清除三代叠加留下的空壳。

前置：8b5、axn、7q8 全部完成。

---

## 涉及文件

`electron/renderer/index.html`

---

## 删除清单

### 1. 删除 `page-images` DOM section（约 line 1584）

搜索 `id="page-images"`，找到整个 section 块，删除：
```html
<!-- 从这里开始 -->
<div id="page-images" style="display:none">
  ... （imglab-prompt, imglab-size-preset, imglab-batchcount, imglab-responseformat,
        imglab-history, imglab-results, imglab-reference, imglab-run-btn, imglab-stop-btn,
        imglab-rerun-btn, imglab-infer-btn, imglab-workflow-btn, imglab-workflow-plan,
        imglab-config-summary, imglab-config-title, imglab-config-note, image-lab-badge, 等）
...
</div>
<!-- 到这里结束 -->
```

**删除前确认**：全文搜索上述所有 `imglab-*` ID，确认无任何读写（除 `_syncLegacyImageLabDOM` 外）。

### 2. 删除 `_syncLegacyImageLabDOM()` 函数（axn 创建的 legacy adapter）

page-images 删除后，这个函数访问的所有节点不存在，null guard 会使其静默无效。
删除整个函数，并删除 `applyImageLabState()` 中对它的调用。

### 3. 清理 `ensureMidtaiWorkbenchLayout()` 中的 legacyContent/leftPanel 逻辑

当前 `ensureMidtaiWorkbenchLayout()`（约 line 4172）中有把旧版容器隐藏的代码：
```javascript
const legacyContent = document.getElementById('...');
if (legacyContent) legacyContent.style.display = 'none';
const leftPanel = document.getElementById('...');
if (leftPanel) leftPanel.style.display = 'none';
```
page-images 删除后这些节点也不存在，可直接删除这些 null-safe 语句。

### 4. 清理 `setMidtaiShellTab()` / `showMidtaiTab()` 中针对 page-images 的特殊处理

搜索 `page-images`，删除所有对它的 show/hide 逻辑。

---

## 验收

- 全文搜索 `page-images`：0 处
- 全文搜索 `imglab-history`：0 处（在 renderImageLabHistory 函数体内除外，等 Issue E 删）
- 全文搜索 `imglab-results`：0 处（在 renderImageLabResults 函数体内除外，等 Issue E 删）
- 全文搜索 `imglab-prompt`：0 处（renderImageLabHistory 函数体内若有 fallback，等 Issue E 删）
- Midtai 图像生成 / 历史 / Prompt Library 功能正常
- `npm run build:electron` + renderer JS syntax check 通过
- `npx vitest run electron/ElectronChatPanel.test.ts` 通过

---

## 明确不做

- 不重命名 imglab-* 函数（Issue E）
- 不删除 `renderImageLabResults()` / `renderImageLabHistory()` 函数体（Issue E）

---

## Already Completed

- 已删除 renderer 内 `id="page-images"` 的整段页面壳及其中全部 `imglab-*` 节点定义。
- 已删除 `_syncLegacyImageLabDOM()`，并移除 `applyImageLabState()` 中对它的调用。
- 已清理 `ensureMidtaiWorkbenchLayout()` 中仅用于旧壳的 `legacyContent` / `leftPanel` 依赖与 show/hide 逻辑。
- 已删除全文所有 `page-images` 残余引用，包括 secondary-surface localization 列表中的旧入口。
- 已验证：`page-images` 搜索为 0 处，`_syncLegacyImageLabDOM` 搜索为 0 处。
- 已验证：`npm run build:electron`、renderer JS syntax check、UTF-8 decode check 通过。
- `npx vitest run electron/ElectronChatPanel.test.ts` 仍有 4 个与 design flow 持久化相关的基线失败，清理前后完全一致，未新增 renderer 删壳回归。
- 边界说明：`imglab-results` 还剩 `renderImageLabResults()` 函数体内 1 处容器读取，`imglab-prompt` 还剩 `openPromptLibraryEditor()` 内 1 处 fallback；这两处按 primer 约束保留给后续 `uru`/Issue E 清理。
