# Task Primer: vscode-extension-o77 — 视觉方向库升级：5套方向绑定完整 spec

> **Session entry point.** Read this first.

## Task Goal

把中台设计的视觉方向从现有 3-4 套升级为 5 套，每套绑定完整 OKLch 色板 + 字体栈 + 布局规则，对齐 open-design 的 DESIGN_DIRECTIONS 模式。

**涉及文件**：
- `src/design/showcaseIndex.ts`
- `electron/renderer/index.html`（`MIDTAI_DIRECTIONS` 常量）

---

## 现有架构

`src/design/showcaseIndex.ts` 里已有 `DesignDirectionSuggestion` 类型，包含 `spec.palette`（OKLch 6色）+ `spec.displayFont/bodyFont` + `spec.posture[]`，`renderDirectionSpec()` 把这些值拼入系统提示词。

`electron/renderer/index.html` 里的 `MIDTAI_DIRECTIONS`（line ~1749）是**独立的前端常量**，只有 `label/summary/stylePrompt/preview`，没有 spec。`renderMidtaiDirectionPicker()` 读这个常量渲染方向卡片。

`generateDesignWorkbench()`（line ~6005）发送 `design:generate` 时带 `style: midtaiState.designDirection`（即 stylePrompt 字符串），后端 `buildKainClawDesignSystemPrompt()` 通过 `getDirectionByStylePrompt()` 查找对应 spec 注入提示词。

**关键链路**：前端选方向 → 存 `stylePrompt` → 后端用 `stylePrompt` 查 `showcaseIndex.ts` 里的 spec → 注入提示词。

---

## 修改详情

### Fix 1：`showcaseIndex.ts` — 补齐 5 套方向（每种 outputType）

现有 prototype 有 3 套，slide 有 3 套，infographic 有 3 套，animation 有 2 套。

在 `prototype` 类型里补充到 5 套，新增以下两套（参考 open-design 的 editorial-monocle 和 brutalist）：

```typescript
{
  id: "editorial-monocle",
  label: "编辑杂志",
  summary: "印刷杂志感，大衬线标题，适合内容型产品和媒体品牌。",
  stylePrompt: "editorial magazine, generous whitespace, large serif headlines, off-white paper, warm rust accent, print-inspired layout",
  preview: { kind: "gradient", value: "linear-gradient(135deg,#f5f0e8 0%,#ffffff 55%,#c0392b 100%)" },
  spec: {
    palette: {
      bg:      "oklch(97% 0.012 80)",
      surface: "oklch(99% 0.005 80)",
      fg:      "oklch(20% 0.02 60)",
      muted:   "oklch(48% 0.015 60)",
      border:  "oklch(89% 0.012 80)",
      accent:  "oklch(58% 0.16 35)",
    },
    displayFont: "'Noto Serif SC', 'Source Han Serif CN', Georgia, serif",
    bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
    posture: [
      "衬线大标题，无衬线正文，字重对比强",
      "大量负空间，内容区不超过 760px 水平居中",
      "强调色只在一处装饰性使用",
      "无圆角卡片，用边框线做分区",
      "禁止渐变背景，用纸张质感米白做底",
    ],
  },
},
{
  id: "brutalist-experimental",
  label: "实验前锋",
  summary: "高对比强 accent，适合主题海报和创意工作室展示。",
  stylePrompt: "brutalist experimental, high contrast, bold asymmetric layout, strong accent color, raw typographic energy, poster attitude",
  preview: { kind: "gradient", value: "linear-gradient(135deg,#0a0a0a 0%,#f5f5f5 50%,#ff3b00 100%)" },
  spec: {
    palette: {
      bg:      "oklch(10% 0.005 0)",
      surface: "oklch(15% 0.005 0)",
      fg:      "oklch(96% 0.005 0)",
      muted:   "oklch(60% 0.005 0)",
      border:  "oklch(25% 0.005 0)",
      accent:  "oklch(62% 0.22 25)",
    },
    displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
    bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
    posture: [
      "超大字号标题（≥72px），字重 900",
      "非对称布局，打破网格",
      "强调色大面积使用，不克制",
      "极少圆角，硬边框",
      "负空间和正空间强烈对比",
    ],
  },
},
```

其他 outputType（slide/infographic/animation）各补到 4-5 套，参考现有风格自行扩充，保持 spec 完整。

### Fix 2：`MIDTAI_DIRECTIONS`（index.html line ~1749）同步更新

`MIDTAI_DIRECTIONS` 里的每个方向条目，`stylePrompt` 必须和 `showcaseIndex.ts` 里的 `stylePrompt` **完全一致**（后端靠这个字符串查 spec）。

新增的两套方向加进 `prototype` 数组：

```javascript
{ label:'编辑杂志', summary:'印刷杂志感，适合内容型产品和媒体品牌', stylePrompt:'editorial magazine, generous whitespace, large serif headlines, off-white paper, warm rust accent, print-inspired layout', preview:'linear-gradient(135deg,#f5f0e8 0%,#ffffff 55%,#c0392b 100%)' },
{ label:'实验前锋', summary:'高对比强 accent，适合主题海报和创意工作室', stylePrompt:'brutalist experimental, high contrast, bold asymmetric layout, strong accent color, raw typographic energy, poster attitude', preview:'linear-gradient(135deg,#0a0a0a 0%,#f5f5f5 50%,#ff3b00 100%)' },
```

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 中台设计 Phase A，视觉方向选择器出现新增的「编辑杂志」和「实验前锋」卡片
2. 选中后生成，设计稿的色板和字体符合对应方向 spec
3. 其他已有方向不受影响

## Definition of Done
- [ ] `showcaseIndex.ts` prototype 有 5 套方向，每套 spec 完整
- [ ] `MIDTAI_DIRECTIONS.prototype` 同步更新，stylePrompt 与 showcaseIndex 一致
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
