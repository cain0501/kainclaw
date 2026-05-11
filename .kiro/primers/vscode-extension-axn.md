# Primer: vscode-extension-axn
# applyImageLabState legacy sync 收口：旧页面 DOM 写入隔离

## 背景

`applyImageLabState()` 是 imageLabState 变化时的同步函数，当前写入 13+ 个 `imglab-*` DOM 节点。
只要 `page-images` 还没删，这些节点虽然存在但对用户不可见；但一旦删掉 page-images，这些写入会触发 null 报错。

本 issue 目标：把 `applyImageLabState()` 中对 `imglab-*` 节点的所有 DOM 写入收束到一个独立的 legacy sync 函数，加 null guard，并确认哪些可直接移除、哪些还有实际作用。

前置：8b5 完成（request 解耦），才能确认 imglab-size-preset / imglab-batchcount 在 applyImageLabState 这里是否还有意义。

---

## 涉及文件

`electron/renderer/index.html`

---

## 关键位置

`applyImageLabState()` 约在 line 9969，相关写入节点：

| DOM ID | 行号附近 | 说明 |
|--------|----------|------|
| `imglab-size-preset` | 10010 | size 下拉同步 |
| `imglab-batchcount` | 10028 | 数量同步 |
| `imglab-responseformat` | 10029 | 格式同步 |
| `imglab-config-summary` | 10034 | 配置摘要文本 |
| `imglab-config-title` | 10035 | 配置标题 |
| `imglab-config-note` | 10036 | 配置说明 |
| `imglab-run-btn` | 10037 | 运行按钮启用/禁用 |
| `imglab-rerun-btn` | 10038 | 重生成按钮 |
| `imglab-stop-btn` | 10039 | 停止按钮 |
| `imglab-infer-btn` | 10040 | 推理按钮 |
| `imglab-workflow-btn` | 10041 | 工作流按钮 |
| `imglab-reference` | 10042 | 参考图 file input |
| `image-lab-badge` | 10045 | 状态徽章 |

---

## 改法

### Step 1：把 13 处 imglab-* 写入抽出到独立函数

```javascript
function _syncLegacyImageLabDOM() {
  // Legacy DOM sync — can be deleted once page-images is removed (Issue D)
  const cfg = imageLabState.config;
  const el = id => document.getElementById(id);

  const sizePresetEl = el('imglab-size-preset');
  if (sizePresetEl) sizePresetEl.value = cfg.sizePreset || cfg.size || '1024x1024';

  const batchEl = el('imglab-batchcount');
  if (batchEl) batchEl.value = String(cfg.batchCount || 1);

  const fmtEl = el('imglab-responseformat');
  if (fmtEl) fmtEl.value = cfg.responseFormat || 'url';

  const summaryEl = el('imglab-config-summary');
  if (summaryEl) summaryEl.textContent = /* 原有逻辑 */ '';

  // ... 其余 9 个节点，每个都加 if (el) guard
}
```

### Step 2：`applyImageLabState()` 中只留一行调用

```javascript
function applyImageLabState() {
  // 新 Midtai UI 更新（保留）
  renderMidtaiImagePreview();
  updateMidtaiImageControls();
  // ...

  // Legacy DOM sync（保留到 page-images 删除前）
  _syncLegacyImageLabDOM();
}
```

---

## 额外确认项

在 8b5 完成后，`imglab-size-preset` 和 `imglab-batchcount` 不再被 runMidtaiImage 写入。
检查 `applyImageLabState()` 在这之后是否仍有理由同步这两个值：
- 如果 imageLabState 在独立 Image Lab 页面（page-images）中还有使用路径 → 暂时保留
- 如果 page-images 在 ensureMidtaiWorkbenchLayout() 之后永久隐藏 → 标记为 TODO:remove

---

## 验收

- `applyImageLabState()` 调用链不再有任何直接 `getElementById('imglab-*')` 调用（全部在 `_syncLegacyImageLabDOM` 内）
- 所有 `_syncLegacyImageLabDOM` 内的 DOM 访问加了 null guard
- Midtai 图像功能正常（生成、编辑、重生成）
- `npm run build:electron` + renderer JS syntax check 通过

---

## 明确不做

- 不删 `page-images` DOM（Issue D）
- 不迁移 renderImageLabHistory / renderImageLabResults（Issue C）
- 不删 `_syncLegacyImageLabDOM`（等 Issue D 删 page-images 后再一起删）
