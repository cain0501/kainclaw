# Task Primer: vscode-extension-4qz — 中台图像工作流编排入口

> **Session entry point.** Read this first.
> **优先级 P4**：等其他缺口补完后再推进。

## Task Goal

中台图像生成表单加「编排工作流」入口，调用旧版 `orchestrateImageWorkflow()` 函数，让聊天模型先整理需求再生图。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

旧版工作流编排（已完整实现）：

- `orchestrateImageWorkflow()`（line ~8938）：读取 `imglab-prompt` 和 `imageLabState.referenceImages`，发送 `image:orchestrateWorkflow` IPC
- `image:workflowOrchestrated` handler（line ~2914）：收到后填入 `imglab-prompt`，调用 `renderImageWorkflowPlan()`
- `renderImageWorkflowPlan()`（line ~8956）：渲染工作流计划到 `imglab-workflow-plan` 容器
- 旧版入口按钮（line ~1259）：`<button id="imglab-workflow-btn" onclick="orchestrateImageWorkflow()">编排工作流</button>`

中台图像表单（`#midtai-form-img`）目前无工作流入口。

`runMidtaiImage()`（line ~4026）在调用 `runImageLab()` 前，把中台表单的值填入旧版 imglab 字段（`imglab-prompt`、`imglab-size-preset`、`imglab-batchcount`）。

---

## 修改详情

### Fix 1：中台图像表单加「编排工作流」按钮

在 `#midtai-form-img` 的生成按钮（`runMidtaiImage()`）旁边加工作流按钮：

```html
<div style="display:flex;gap:6px;margin-top:10px">
  <button class="btn-red" style="flex:1" onclick="runMidtaiImage()">生成图像</button>
  <button onclick="runMidtaiWorkflowOrchestrate()" 
    style="font-size:11px;color:#78716c;border:1px solid #eadfd2;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;white-space:nowrap">
    ✦ 编排工作流
  </button>
</div>
```

注意：原来的生成按钮是单独一行，改为 flex 行，生成按钮 `flex:1` 占主要空间。

### Fix 2：`runMidtaiWorkflowOrchestrate` 函数

```javascript
function runMidtaiWorkflowOrchestrate() {
  // 先把中台表单的 prompt 同步到旧版 imglab-prompt
  const prompt = document.getElementById('midtai-img-prompt')?.value.trim() || '';
  const promptEl = document.getElementById('imglab-prompt');
  if (promptEl) promptEl.value = prompt;
  // 复用旧版函数
  orchestrateImageWorkflow();
}
```

### Fix 3：`image:workflowOrchestrated` handler 同步回中台

找到 `image:workflowOrchestrated` case（line ~2914），在填入 `imglab-prompt` 的同时，也填入中台的 `midtai-img-prompt`：

```javascript
case 'image:workflowOrchestrated': {
  // 旧版已有的逻辑...
  const midtaiPromptEl = document.getElementById('midtai-img-prompt');
  if (midtaiPromptEl && msg.workflowPlan?.finalPrompt) {
    midtaiPromptEl.value = String(msg.workflowPlan.finalPrompt);
  }
  break;
}
```

### Fix 4：工作流结果展示（可选）

工作流编排完成后，旧版会在 `imglab-workflow-plan` 容器里渲染计划详情。中台侧可以在描述框下方加一个折叠区展示编排结果（P4 可选，先不做，只做 prompt 回填即可）。

---

## 实现顺序

1. 加 `runMidtaiWorkflowOrchestrate()` 函数
2. 修改 `image:workflowOrchestrated` handler — 同步回 `midtai-img-prompt`
3. HTML：修改生成按钮区为 flex 行，加「编排工作流」按钮

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 中台图像表单出现「编排工作流」按钮（在生成按钮旁边）
2. 输入需求后点「编排工作流」，聊天模型分析后自动填入优化后的 prompt
3. 再点「生成图像」，以优化后的 prompt 生成

## Definition of Done
- [ ] 中台图像表单有「编排工作流」按钮
- [ ] 点击后调用 orchestrateImageWorkflow()（通过 runMidtaiWorkflowOrchestrate 桥接）
- [ ] 编排结果自动填入中台描述框
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
