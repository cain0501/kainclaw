# Task Primer: vscode-extension-zw5 — 设计 Tab 小白/专业模式 toggle

> **Session entry point.** Read this first.
> **依赖**：vscode-extension-o77（视觉方向库升级）建议先完成，但不强制。

## Task Goal

设计 Tab Phase A（无稿表单）加小白/专业模式切换。小白模式保持现状（一句话输入），专业模式展示完整结构化表单。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

`#midtai-form-design`（line ~1118）是设计 Phase A 表单，包含：
- 输出类型 select（`#midtai-output-type`）
- 设计需求 textarea（`#midtai-design-prompt`）
- 参考图上传区
- 视觉方向选择器（`#midtai-direction-picker`）
- 生成按钮

`generateDesignWorkbench()`（line ~6002）读取这些字段发送 `design:generate`。

---

## 修改详情

### Fix 1：在表单顶部加模式 toggle

在 `#midtai-form-design` 的 `.midtai-form` 最顶部加 toggle 行：

```html
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
  <span style="font-size:11px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:.05em">设计模式</span>
  <div style="display:flex;gap:0;border:1.5px solid #e5ddd0;border-radius:7px;overflow:hidden">
    <button id="design-mode-simple-btn" onclick="setDesignMode('simple')"
      style="font-size:11px;padding:4px 10px;border:none;cursor:pointer;background:#c9502e;color:#fff">小白</button>
    <button id="design-mode-pro-btn" onclick="setDesignMode('pro')"
      style="font-size:11px;padding:4px 10px;border:none;cursor:pointer;background:none;color:#78716c">专业</button>
  </div>
</div>
```

### Fix 2：小白模式 — 隐藏高级字段

小白模式下，只显示「设计需求」textarea 和生成按钮，隐藏输出类型/参考图/视觉方向：

```javascript
function setDesignMode(mode) {
  midtaiState.designMode = mode;
  localStorage.setItem('kc_design_mode', mode);
  applyDesignMode();
}

function applyDesignMode() {
  const mode = midtaiState.designMode || 'simple';
  const isSimple = mode === 'simple';

  // toggle 按钮样式
  const simpleBtn = document.getElementById('design-mode-simple-btn');
  const proBtn = document.getElementById('design-mode-pro-btn');
  if (simpleBtn) { simpleBtn.style.background = isSimple ? '#c9502e' : 'none'; simpleBtn.style.color = isSimple ? '#fff' : '#78716c'; }
  if (proBtn) { proBtn.style.background = isSimple ? 'none' : '#c9502e'; proBtn.style.color = isSimple ? '#78716c' : '#fff'; }

  // 高级字段显隐
  const advancedFields = document.getElementById('design-advanced-fields');
  if (advancedFields) advancedFields.style.display = isSimple ? 'none' : 'flex';
}
```

### Fix 3：HTML 结构调整 — 高级字段包裹在 `#design-advanced-fields`

把输出类型、参考图、视觉方向三个 `.midtai-form-group` 包裹进一个容器：

```html
<div id="design-advanced-fields" style="display:none;flex-direction:column;gap:0">
  <!-- 输出类型 select -->
  <!-- 参考图上传区 -->
  <!-- 视觉方向选择器 -->
</div>
```

设计需求 textarea 和生成按钮**不包裹**，始终显示。

### Fix 4：初始化时读取 localStorage

在 `switchMidtaiType('design')` 或页面初始化时：

```javascript
midtaiState.designMode = localStorage.getItem('kc_design_mode') || 'simple';
applyDesignMode();
```

### Fix 5：专业模式下 placeholder 文字调整

小白模式 placeholder：`在这里描述你想要的设计，AI 会自动决定风格和布局…`

专业模式 placeholder：`补充说明（可选）…`

在 `applyDesignMode()` 里同步更新 textarea placeholder。

---

## 实现顺序

1. 加 `setDesignMode` / `applyDesignMode` 函数
2. HTML：加 toggle 按钮行 + `#design-advanced-fields` 包裹容器
3. 初始化时调用 `applyDesignMode()`

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 进入设计 Tab，默认小白模式：只显示 textarea + 生成按钮，输出类型/参考图/视觉方向隐藏
2. 点「专业」：高级字段展开，视觉方向卡片可选
3. 刷新后模式保持（localStorage）
4. 两种模式下点「生成设计」均正常工作

## Definition of Done
- [ ] 小白/专业模式 toggle 就位，状态存 localStorage
- [ ] 小白模式只显示 textarea + 生成按钮
- [ ] 专业模式显示完整表单（输出类型/参考图/视觉方向/补充说明）
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
