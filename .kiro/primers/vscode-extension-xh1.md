# Task Primer: vscode-extension-xh1 — 五维质量评审 chip：生成后 AI 自评 + 改进建议

> **Session entry point.** Read this first.

## Task Goal

设计生成完成后，AI 自动对结果做五维质量评审，结果折叠进一个 chip 展示。低分维度给出改进建议并提供一键重试按钮。

**涉及文件**：
- `electron/ElectronChatPanel.ts`（`generateDesignWorkbench` 后触发评审）
- `electron/renderer/index.html`（chip UI + `design:critiqueResult` handler）

---

## 现有架构

`generateDesignWorkbench()`（`ElectronChatPanel.ts` line ~3280）生成完成后发送 `design:result`，renderer 收到后渲染画布。

`design:result` handler 在 renderer 里切换到 Phase B（有稿状态）。

评审需要在 `design:result` 之后异步触发，不阻塞画布渲染。

---

## 修改详情

### Fix 1：后端 — `generateDesignWorkbench` 生成完成后异步触发评审

在发送 `design:result` 之后，异步调用评审（不 await，不阻塞）：

```typescript
// 发送 design:result 之后
this.sendToRenderer({ type: "design:result", ... });

// 异步触发五维评审（不阻塞）
this.runDesignCritique(result.html, prompt, outputType).catch(() => {});
```

新增 `runDesignCritique` 私有方法：

```typescript
private async runDesignCritique(html: string, prompt: string, outputType: string): Promise<void> {
  this.sendToRenderer({ type: "design:critiqueStarted" });
  
  const workspaceRoot = this.getSelectedWorkspaceRoot();
  const { config, envMap } = await resolveProviderConfig(this.settings, workspaceRoot);
  const provider = this.createProviderForSystemPrompt(
    config,
    workspaceRoot,
    envMap,
    DESIGN_CRITIQUE_SYSTEM_PROMPT,
  );

  try {
    const userPrompt = `
设计需求：${prompt}
输出类型：${outputType}

以下是生成的 HTML 设计稿（截取前 8000 字符）：
\`\`\`html
${html.slice(0, 8000)}
\`\`\`

请按五个维度评审，返回 JSON。
`.trim();

    const response = await provider.complete(userPrompt);
    const json = extractJsonFromText(response);
    if (json) {
      this.sendToRenderer({ type: "design:critiqueResult", critique: json });
    }
  } catch {
    this.sendToRenderer({ type: "design:critiqueError" });
  }
}
```

### Fix 2：评审系统提示词

在 `src/design/designPrompt.ts` 里新增：

```typescript
export const DESIGN_CRITIQUE_SYSTEM_PROMPT = `
You are a senior UI/UX design critic. Evaluate the given HTML design on exactly 5 dimensions.

Return ONLY valid JSON in this exact shape, no other text:
{
  "dimensions": [
    { "name": "视觉层次", "score": 1-5, "comment": "一句话评价" },
    { "name": "排版质量", "score": 1-5, "comment": "一句话评价" },
    { "name": "色彩运用", "score": 1-5, "comment": "一句话评价" },
    { "name": "内容密度", "score": 1-5, "comment": "一句话评价" },
    { "name": "风格一致性", "score": 1-5, "comment": "一句话评价" }
  ],
  "lowestDimension": "得分最低的维度名",
  "suggestion": "针对最低分维度的一条具体改进建议（中文，≤40字）",
  "suggestedStyle": "如果建议换视觉方向，填入 stylePrompt 字符串；否则填 null"
}

Scoring: 5=excellent, 4=good, 3=acceptable, 2=needs improvement, 1=poor.
Be honest and specific. Chinese comments preferred.
`.trim();
```

### Fix 3：`extractJsonFromText` 工具函数

在 `ElectronChatPanel.ts` 或 `src/design/` 里加：

```typescript
function extractJsonFromText(text: string): object | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
```

### Fix 4：renderer — `design:critiqueStarted` / `design:critiqueResult` handler

在 `handleMessage` 的 switch 里加：

```javascript
case 'design:critiqueStarted': {
  renderDesignCritiqueChip({ loading: true });
  break;
}
case 'design:critiqueResult': {
  renderDesignCritiqueChip({ loading: false, critique: msg.critique });
  break;
}
case 'design:critiqueError': {
  // 静默失败，不显示 chip
  break;
}
```

### Fix 5：renderer — `renderDesignCritiqueChip` 函数

chip 放在设计 Phase B 左侧面板的底部（`#design-side-panel` 或类似容器）：

```javascript
function renderDesignCritiqueChip(state) {
  let container = document.getElementById('design-critique-chip');
  if (!container) {
    // 动态插入到 Phase B 左侧面板底部
    const panel = document.querySelector('.design-side-panel') || document.getElementById('design-side-panel');
    if (!panel) return;
    container = document.createElement('div');
    container.id = 'design-critique-chip';
    container.style.cssText = 'margin:12px 16px;border:1px solid #e5ddd0;border-radius:10px;overflow:hidden;font-size:12px';
    panel.appendChild(container);
  }

  if (state.loading) {
    container.innerHTML = `
      <div style="padding:10px 12px;display:flex;align-items:center;gap:8px;color:#a8a29e;cursor:pointer" onclick="toggleCritiqueChip()">
        <span style="font-size:11px">✦ AI 质量评审中…</span>
      </div>`;
    return;
  }

  const { dimensions, lowestDimension, suggestion, suggestedStyle } = state.critique;
  const avgScore = (dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length).toFixed(1);
  const scoreColor = avgScore >= 4 ? '#16a34a' : avgScore >= 3 ? '#d97706' : '#dc2626';

  container.innerHTML = `
    <div style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;background:#fdfcfb" onclick="toggleCritiqueChip()">
      <span style="font-size:11px;color:#78716c">✦ AI 质量评审</span>
      <span style="font-size:12px;font-weight:600;color:${scoreColor}">${avgScore}/5</span>
    </div>
    <div id="design-critique-detail" style="display:none;padding:0 12px 12px;border-top:1px solid #f0ebe4">
      ${dimensions.map(d => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f0eb">
          <span style="color:#57534e">${d.name}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:${d.score >= 4 ? '#16a34a' : d.score >= 3 ? '#d97706' : '#dc2626'};font-weight:600">${d.score}/5</span>
            <span style="color:#a8a29e;font-size:11px">${d.comment}</span>
          </div>
        </div>`).join('')}
      ${suggestion ? `
        <div style="margin-top:10px;padding:8px 10px;background:#fff8f5;border-radius:7px;border:1px solid #fde8d8">
          <div style="font-size:11px;color:#a8a29e;margin-bottom:4px">改进建议 · ${lowestDimension}</div>
          <div style="color:#2d1f14;line-height:1.5">${escapeHtml(suggestion)}</div>
          ${suggestedStyle ? `<button onclick="applyDesignCritiqueSuggestion('${escapeHtml(suggestedStyle)}')" style="margin-top:8px;font-size:11px;color:#c9502e;border:1px solid #c9502e;background:#fff;border-radius:6px;padding:3px 10px;cursor:pointer">试试这个方向</button>` : ''}
        </div>` : ''}
    </div>`;
}

function toggleCritiqueChip() {
  const detail = document.getElementById('design-critique-detail');
  if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
}

function applyDesignCritiqueSuggestion(stylePrompt) {
  midtaiState.designDirection = stylePrompt;
  // 重新生成：用当前 prompt + 新方向
  generateDesignWorkbench();
}
```

---

## 实现顺序

1. `designPrompt.ts`：加 `DESIGN_CRITIQUE_SYSTEM_PROMPT`
2. `ElectronChatPanel.ts`：加 `runDesignCritique` + `extractJsonFromText`，在 `generateDesignWorkbench` 发完 `design:result` 后异步调用
3. `index.html`：加 `design:critiqueStarted/Result/Error` handler + `renderDesignCritiqueChip` + `toggleCritiqueChip` + `applyDesignCritiqueSuggestion`

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 生成一个设计，画布出现后约 3-5 秒，左侧面板底部出现「✦ AI 质量评审中…」chip
2. 评审完成后 chip 显示平均分（如 3.8/5）
3. 点击 chip 展开，看到 5 个维度分数和评语
4. 有改进建议时显示建议文字，有「试试这个方向」按钮
5. 点「试试这个方向」触发重新生成

## Definition of Done
- [ ] 生成完成后异步触发评审，不阻塞画布渲染
- [ ] chip 显示加载中 → 评审结果（平均分）
- [ ] 展开显示 5 维度分数 + 改进建议
- [ ] 「试试这个方向」按钮触发重新生成
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
