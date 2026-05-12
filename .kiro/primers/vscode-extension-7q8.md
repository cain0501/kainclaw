# Primer: vscode-extension-7q8
# 旧页面尾部依赖迁移：imglab-results/history/workflow/prompt-library

## 背景

8b5 和 axn 完成后，`runMidtaiImage` / `submitMidtaiImageEdit` / `applyImageLabState` 已不再依赖 `page-images` 内的 imglab-* 节点。
但还有四处尾部依赖让 page-images 不能删：

1. `renderImageLabResults()` (line 11815) 写入 `imglab-results`
2. `renderImageLabHistory()` (line 11755) 写入 `imglab-history`
3. `useImageHistoryPrompt()` / `rerunImageLab()` 读写 `imglab-prompt`
4. `openPromptLibraryEditor()` (line 12064) 读 `imglab-prompt.value` 作为新建 prompt 的默认文案

本 issue 把这四处全部迁移到 Midtai 侧的节点或 JS 变量，使 page-images 内不再有活跃读写。

前置：8b5 + axn 完成。

---

## 涉及文件

`electron/renderer/index.html`

---

## 四处依赖的迁移方案

### 1. `renderImageLabResults()` → 写 `midtai-img-preview-area`

当前：写 `imglab-results`（在 page-images 内，Midtai 视图看不到）。
Midtai 侧已有 `renderMidtaiImagePreview()` 负责渲染生成结果到 `midtai-img-preview-area`。

**改法**：确认 `renderImageLabResults()` 的唯一调用者是 `runImageLab()` 和 `rerunImageLab()`。
把这两处的 `renderImageLabResults()` 调用改为 `renderMidtaiImagePreview()`（已存在），不再调用 `renderImageLabResults()`。
`renderImageLabResults()` 函数本体暂时保留（留到 Issue E 清理），但不再被调用。

### 2. `renderImageLabHistory()` → 写 `midtai-img-history-list`

当前：写 `imglab-history`（page-images 内，不可见）。
Midtai 侧需确认是否有等价的历史渲染位置；如果没有则新建 `midtai-img-history-list` 节点。

**改法**：
- 在 Midtai image board 左栏适当位置新增 `<div id="midtai-img-history-list"></div>`
- `renderImageLabHistory()` 改为同时写两个节点，或改为只写 `midtai-img-history-list`
- 所有调用者保持不变，不改调用方

### 3. `useImageHistoryPrompt()` 和 `rerunImageLab()` 读写 `imglab-prompt`

当前：`useImageHistoryPrompt()` 写 `imglab-prompt.value`，`rerunImageLab()` 读写 `imglab-prompt.value`。

在 8b5 完成后，`runImageLab(overrides)` 已接受显式 prompt 参数。

**改法**：
- `useImageHistoryPrompt(encoded)` 改为写 `midtai-img-prompt.value`（Midtai 新表单）
- `rerunImageLab()` 改为从 `imageLabState.lastRequest.prompt` 读取，传入 `runImageLab({ prompt: ... })`，不再读写 `imglab-prompt`

### 4. `openPromptLibraryEditor()` 读 `imglab-prompt`

当前 (line 12072)：
```javascript
text: source?.text || options.text || document.getElementById('imglab-prompt').value.trim(),
```

**改法**：
```javascript
const currentPrompt = document.getElementById('midtai-img-prompt')?.value.trim()
  || document.getElementById('imglab-prompt')?.value.trim()
  || '';
text: source?.text || options.text || currentPrompt,
```
（先读 Midtai 新表单，fallback 到旧节点，后续 Issue D 删掉旧节点时再删 fallback）

---

## 验收

- `imglab-results`、`imglab-history` 不再有任何函数写入（验证方式：全文搜索这两个 ID）
- `imglab-prompt` 不再有任何函数读写（8b5 + 本 issue 合并后）
- Midtai 图像历史记录显示正常（写到 midtai-img-history-list）
- Prompt Library Editor 打开时默认文案来自 midtai-img-prompt
- `npm run build:electron` + renderer JS syntax check 通过

---

## 明确不做

- 不删 `page-images` DOM（Issue D）
- 不删 `renderImageLabResults()` 函数体（Issue E）
- 不改 `applyImageLabState` 的任何逻辑（Issue B = axn 已处理）

---

## Already Completed

- `runImageLab()` 与 `makeImageVariant()` 的结果刷新已改为 `renderMidtaiImagePreview()`，不再主动调用 `renderImageLabResults()`。
- `renderImageLabHistory()` 已改写到 `midtai-img-history-list`，并在 Midtai 图像左栏新增该节点。
- `useImageHistoryPrompt()` / `applyLatestImagePrompt()` 已改写 `midtai-img-prompt`，不再写 `imglab-prompt`。
- Prompt Library 相关的当前 prompt 读取/回填已迁到 Midtai：`getCurrentPromptLibrarySourceText()`、`applyPromptLibraryEntryToCurrentContext()`、`usePromptLibraryEntry()`、`usePromptLibraryInferencePrompt()`、`beginImageResultEdit()`。
- `openPromptLibraryEditor()` 现在先读 `midtai-img-prompt`，仅保留一处 `imglab-prompt` fallback。
- 额外收口：`image:promptInferred`、`image:workflowOrchestrated`、`inferMidtaiPrompt()`、`orchestrateImageWorkflow()`、`applyImageWorkflowKeyword()`、材料搜索 `imglab` sourceContext 聚合，都已切到 Midtai prompt。
- 已验证：`npm run build:electron`、renderer JS syntax check、UTF-8 decode check 通过。
- 边界说明：`renderImageLabResults()` 函数体和旧 `imglab-results` / `imglab-history` / `imglab-prompt` DOM 壳仍保留在文件中，供后续删除 `page-images` 时一并清理；本任务已去除活跃写入调用。
