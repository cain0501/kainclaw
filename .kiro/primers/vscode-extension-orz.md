# Task Primer: vscode-extension-orz — 中台图像提示词历史列表

> **Session entry point.** Read this first.

## Task Goal

中台图像生成区加提示词历史列表，展示已提交的 prompt，支持点击复用、单条删除、清空。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

旧版 `renderImageLabHistory()`（line ~9079）从 `imageLabState.promptHistory` 读取历史：

```javascript
const history = imageLabState.promptHistory || [];
// 每条显示前28字，点击调用 useImageHistoryPrompt(encoded)
```

历史数据在 `image:state` / `image:result` 时通过 `applyImageLabState(msg)` 写入 `imageLabState.promptHistory`（后端在 `image:run` 时 `recordPromptHistory: true` 触发写入）。

`runMidtaiImage()` 调用 `runImageLab()`，后者发送 `image:run` 时带 `recordPromptHistory: true`，所以中台生成的 prompt 已经在写入历史，只缺 UI 展示。

---

## 修改详情

### Fix 1：中台图像表单加历史入口（HTML，line ~1075-1101）

在 `#midtai-form-img` 的描述 textarea 下方加历史触发按钮：

```html
<div style="display:flex;justify-content:flex-end;margin-top:4px;margin-bottom:8px">
  <button onclick="toggleMidtaiPromptHistory()" style="font-size:11px;color:#78716c;background:none;border:none;cursor:pointer;padding:0">历史提示词 ▾</button>
</div>
<div id="midtai-prompt-history" style="display:none;max-height:160px;overflow-y:auto;border:1px solid #eadfd2;border-radius:8px;background:#fff;margin-bottom:8px"></div>
```

### Fix 2：`toggleMidtaiPromptHistory` 函数

```javascript
function toggleMidtaiPromptHistory() {
  const panel = document.getElementById('midtai-prompt-history');
  if (!panel) return;
  if (panel.style.display === 'none') {
    renderMidtaiPromptHistory();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}
```

### Fix 3：`renderMidtaiPromptHistory` 函数

```javascript
function renderMidtaiPromptHistory() {
  const panel = document.getElementById('midtai-prompt-history');
  if (!panel) return;
  const history = imageLabState.promptHistory || [];
  if (!history.length) {
    panel.innerHTML = '<div style="padding:12px;font-size:12px;color:#a8a29e;text-align:center">暂无历史提示词</div>';
    return;
  }
  panel.innerHTML = [
    `<div style="display:flex;justify-content:flex-end;padding:6px 8px 0">
      <button onclick="clearMidtaiPromptHistory()" style="font-size:11px;color:#a8a29e;background:none;border:none;cursor:pointer">清空</button>
    </div>`,
    ...history.map((item, i) => {
      const text = typeof item === 'string' ? item : (item.prompt || '');
      const preview = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      return `<div style="display:flex;align-items:center;padding:6px 10px;gap:6px;border-bottom:1px solid #f5f0eb;cursor:pointer" onclick="useMidtaiPromptHistory(${i})">
        <span style="flex:1;font-size:12px;color:#2d1f14">${preview}</span>
        <button onclick="event.stopPropagation();deleteMidtaiPromptHistory(${i})" style="font-size:11px;color:#a8a29e;background:none;border:none;cursor:pointer;padding:0 4px">×</button>
      </div>`;
    }),
  ].join('');
}
```

### Fix 4：操作函数

```javascript
function useMidtaiPromptHistory(index) {
  const history = imageLabState.promptHistory || [];
  const item = history[index];
  const text = typeof item === 'string' ? item : (item?.prompt || '');
  const promptEl = document.getElementById('midtai-img-prompt');
  if (promptEl && text) { promptEl.value = text; }
  const panel = document.getElementById('midtai-prompt-history');
  if (panel) panel.style.display = 'none';
}

function deleteMidtaiPromptHistory(index) {
  send({ type: 'image:deletePromptHistory', index });
  // 乐观更新
  imageLabState.promptHistory = (imageLabState.promptHistory || []).filter((_, i) => i !== index);
  renderMidtaiPromptHistory();
}

function clearMidtaiPromptHistory() {
  send({ type: 'image:clearPromptHistory' });
  imageLabState.promptHistory = [];
  renderMidtaiPromptHistory();
}
```

**注意**：`image:deletePromptHistory` 和 `image:clearPromptHistory` 是否已有后端 handler，需确认。若无，乐观更新即可（刷新后历史会从后端重新加载）。

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 生成几张图后，点「历史提示词」展开列表
2. 点击某条 → 填入描述框，列表收起
3. 点 × 删除单条，点清空删除全部

## Definition of Done
- [ ] 中台图像表单有「历史提示词」折叠入口
- [ ] 展开后显示已提交 prompt 列表
- [ ] 点击复用、× 删除、清空均正常
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
