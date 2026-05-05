# Task Primer: vscode-extension-aw5 — Design Prompt 质量升级

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

提升 KainClaw 设计生成的输出质量：
1. 在系统 prompt 里加入「反 AI Slop」规则，让每次生成都规避最常见的 AI 审美通病
2. 给 `showcaseIndex.ts` 里的方向加入精确的 OKLch 色板 + 字体栈 + 布局姿态，选了方向就注入完整 spec；没选则只靠 Slop 规则兜底

**重要原则：方向内容要面向中文市场和 KainClaw 用户语境适配，不照抄 open-design。open-design 的 5 套方向只作为参考质量锚。**

## Out of Scope

- 不改 `electron/` 下任何文件
- 不改渲染器、不改 IPC
- 不改方向选择 UI（picker 已存在）
- 不增加方向数量（现有方向升级即可，不新建）
- 不改 Slider schema 和 patch engine

## Already Completed

- `designPrompt.ts` 现有系统 prompt 3 条泛规则
- `showcaseIndex.ts` 现有 12 套方向（各带 `stylePrompt` 字符串，无精确 CSS spec）
- `buildKainClawDesignUserPrompt()` 已接收 `style` 参数并拼入用户 prompt

## Next Step (the ONLY thing to do this session)

**Files:** `src/design/designPrompt.ts`, `src/design/showcaseIndex.ts`

### 1. 扩展 `DesignDirectionSuggestion` 类型（showcaseIndex.ts）

在现有类型里加入可选字段：

```typescript
export type DesignDirectionSuggestion = {
  id: string;
  label: string;
  summary: string;
  stylePrompt: string;           // 保留，用于 user prompt 的简短描述
  preview: DesignDirectionPreview;
  // 新增（可选，升级后的方向才有）:
  spec?: {
    palette: {
      bg: string;      // oklch 值
      surface: string;
      fg: string;
      muted: string;
      border: string;
      accent: string;
    };
    displayFont: string;
    bodyFont: string;
    monoFont?: string;
    posture: string[]; // 布局行为规则，具体不泛泛
  };
};
```

### 2. 给现有方向补充 spec（showcaseIndex.ts）

选取当前 12 套方向中**最有代表性的 4 套**补充精确 spec（其余保留原样），参考 open-design 的 OKLch 结构但内容面向中文产品语境：

**建议升级的 4 套（按现有 id 找到并修改）：**

**prototype — information-architecture（信息建筑）**
```
palette: bg oklch(98% 0.005 240), surface oklch(100% 0 0), fg oklch(18% 0.012 250),
         muted oklch(54% 0.012 250), border oklch(92% 0.005 250), accent oklch(56% 0.18 255)
displayFont: system-ui, -apple-system, 'PingFang SC', sans-serif
bodyFont: system-ui, -apple-system, 'PingFang SC', sans-serif
posture:
  - 严格网格，间距 8px 倍数
  - hairline 边框（1px），无阴影，无圆角在功能区
  - 标题字重 700+，正文 400，层级落差明显
  - 强调色只用于主 CTA 和关键数据，其余全灰
  - 禁止装饰性插图，用真实截图或抽象几何占位
```

**prototype — minimal-luxury（极简奢侈）**
```
palette: bg oklch(97% 0.018 70), surface oklch(99% 0.008 70), fg oklch(22% 0.02 50),
         muted oklch(50% 0.018 50), border oklch(90% 0.014 70), accent oklch(62% 0.12 30)
displayFont: 'Noto Serif SC', 'Source Han Serif CN', Georgia, serif
bodyFont: system-ui, -apple-system, 'PingFang SC', sans-serif
posture:
  - 衬线大标题，无衬线正文，字重对比强
  - 大量负空间，内容区不超过 760px，水平居中
  - 强调色克制，只在一处装饰性使用（如引号、下划线）
  - 无圆角卡片，边框或底色做分区
  - 图片只用一张，全宽或全出血，不用多图堆叠
```

**prototype — eastern-minimal（东方极简）**
```
palette: bg oklch(96% 0.014 85), surface oklch(98% 0.008 85), fg oklch(25% 0.02 60),
         muted oklch(52% 0.016 65), border oklch(88% 0.014 80), accent oklch(55% 0.14 145)
displayFont: 'Noto Sans SC', system-ui, -apple-system, sans-serif
bodyFont: 'Noto Sans SC', system-ui, -apple-system, sans-serif
posture:
  - 自然米灰主色，绿色调强调（苔藓绿/竹绿）
  - 留白大于内容，每个模块间距 64px+
  - 几何形状替代插图，圆形/方形，不用圆角矩形
  - 禁止阴影，用色块对比做层级
  - 文案精简，不用超过 15 字的标题
```

**slide — tech-showcase（科技展示，如果现有 slide 方向里有）或 prototype 第四套**

找 showcaseIndex.ts 里 `slide` 或 `infographic` 类型下的任意一个方向补充类似的 spec，参考 tech-utility 风格：
```
palette: bg oklch(14% 0.018 255), surface oklch(20% 0.015 255), fg oklch(95% 0.008 240),
         muted oklch(62% 0.015 250), border oklch(30% 0.018 255), accent oklch(68% 0.18 145)
displayFont: system-ui, -apple-system, 'PingFang SC', sans-serif
monoFont: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace
posture:
  - 深色背景，数据密集
  - 等宽数字（tabular-nums），所有数据用 mono 字体
  - 状态 pill（成功/警告/危险）用克制的背景色，不用纯色块
  - 无圆角卡片，细边框做分区
  - 强调色只用于图表高亮和主 CTA
```

### 3. 新增 `renderDirectionSpec()` 辅助函数（showcaseIndex.ts）

```typescript
export function renderDirectionSpec(direction: DesignDirectionSuggestion): string {
  if (!direction.spec) return '';
  const { palette, displayFont, bodyFont, monoFont, posture } = direction.spec;
  return [
    `## Visual direction: ${direction.label}`,
    '',
    'Bind these values into the HTML :root block verbatim. Do not improvise palette or fonts.',
    '',
    '```css',
    ':root {',
    `  --bg:      ${palette.bg};`,
    `  --surface: ${palette.surface};`,
    `  --fg:      ${palette.fg};`,
    `  --muted:   ${palette.muted};`,
    `  --border:  ${palette.border};`,
    `  --accent:  ${palette.accent};`,
    '',
    `  --font-display: ${displayFont};`,
    `  --font-body:    ${bodyFont};`,
    ...(monoFont ? [`  --font-mono:    ${monoFont};`] : []),
    '}',
    '```',
    '',
    'Layout posture (honour these in every structural decision):',
    ...posture.map(p => `- ${p}`),
  ].join('\n');
}
```

### 4. 升级 `buildKainClawDesignSystemPrompt()`（designPrompt.ts）

增加两个可选参数并扩充 prompt 内容：

```typescript
export function buildKainClawDesignSystemPrompt(options?: {
  customInstructions?: string;
  selectedDirection?: DesignDirectionSuggestion;  // 新增
}): string {
  const antiSlop = [
    "",
    "Anti-slop rules (always apply, no exceptions):",
    "- No blue/purple gradient backgrounds — they are the universal AI mediocrity signal.",
    "- No decorative emoji in headings or body text (✅ ❌ 🚀 💡 and similar).",
    "- No left-border accent cards as the primary layout pattern — use whitespace or full borders.",
    "- No fabricated statistics or fake data — use '—' or grey placeholder blocks.",
    "- Do not use Inter as a display/headline font — it reads as generic.",
    "- No excessive glassmorphism blur backgrounds.",
    "- No AI-illustrated human faces.",
    "- Every design decision must have a reason. If you can't explain why, don't do it.",
  ];

  const directionBlock = options?.selectedDirection
    ? ["", renderDirectionSpec(options.selectedDirection)]
    : [];

  return [
    "You are KainClaw Design, a design-focused HTML generator.",
    "You are a designer who uses HTML/CSS/JS as the output medium, not a generic programmer.",
    "",
    "Hard rules:",
    // ... 保留现有 hard rules 不变 ...
    ...antiSlop,
    ...directionBlock,
    ...(options?.customInstructions?.trim()
      ? ["", "Additional instructions:", options.customInstructions.trim()]
      : []),
  ].join("\n");
}
```

注意：需要在 `designPrompt.ts` 里 import `DesignDirectionSuggestion` 和 `renderDirectionSpec` from `./showcaseIndex`。

### 5. 更新 `buildKainClawDesignUserPrompt()` 调用处（ElectronChatPanel.ts）

找到调用 `buildKainClawDesignSystemPrompt()` 的地方（`generateDesignWorkbench()`），把选中的方向对象传进去：

```typescript
// 在 ElectronChatPanel.ts 里，找到 buildKainClawDesignSystemPrompt() 调用
// 把 style 字符串查到对应的 DesignDirectionSuggestion 对象，传入 selectedDirection
import { getDirectionById } from './src/design/showcaseIndex'; // 需要新增这个导出函数

const systemPrompt = buildKainClawDesignSystemPrompt({
  customInstructions: ...,
  selectedDirection: style ? getDirectionById(style) : undefined,
});
```

需要在 `showcaseIndex.ts` 里新增：
```typescript
export function getDirectionById(id: string): DesignDirectionSuggestion | undefined {
  for (const dirs of Object.values(DIRECTIONS)) {
    const found = dirs.find(d => d.id === id || d.stylePrompt === id);
    if (found) return found;
  }
  return undefined;
}
```

**Test:** `npm test && npm run check && npm run build`

## Verification

```bash
npm test
npm run check
npm run build
```

Manual test（告知用户手测）:
1. 生成一个设计稿，不选方向 → 检查输出：无紫渐变、无 emoji 标题、无假数据
2. 选「信息建筑」方向再生成 → 检查：颜色接近冷灰蓝系、字体系统字、无装饰
3. 选「极简奢侈」方向再生成 → 检查：米白背景、衬线标题、大留白
4. 两次选同方向生成两次 → 检查：整体语言相似但内容不同（方向给骨架，内容仍变化）

## Risk Points

- Risk: `designPrompt.ts` import `showcaseIndex` 产生循环依赖
  Guard: `showcaseIndex.ts` 不 import `designPrompt.ts`，方向是单向依赖，安全
- Risk: 现有 `style` 参数是字符串（stylePrompt 内容），不是 id，`getDirectionById` 匹配不上
  Guard: 同时匹配 `d.id` 和 `d.stylePrompt`；如果还匹配不上，检查 `ElectronChatPanel.ts` 里 style 参数的实际传值
- Risk: spec 里的 oklch 色值浏览器不支持（旧 Electron）
  Guard: Electron 22+ 支持 oklch；如担心，可加 hex fallback 注释，但不改值

## High-Risk Files Touched

- `src/design/designPrompt.ts` — 系统 prompt 扩展（低风险，纯文本改动）
- `src/design/showcaseIndex.ts` — 类型扩展 + 方向 spec 补充（低风险）
- `electron/ElectronChatPanel.ts` — 找到 `buildKainClawDesignSystemPrompt` 调用处传入 direction 对象（中风险，改前先 grep 确认调用位置）

## Reference (only load if stuck)

- open-design 方向参考：`E:/open-design/apps/daemon/src/prompts/directions.ts`（结构参考，不照抄内容）
- 当前 showcaseIndex：`src/design/showcaseIndex.ts`（读完再改，不要删现有方向）
- Beads: `bd show vscode-extension-aw5`

## Definition of Done

- [ ] `DesignDirectionSuggestion` 加入可选 `spec` 字段
- [ ] 4 套方向补充了精确 OKLch 色板 + 字体栈 + posture 规则
- [ ] `renderDirectionSpec()` 函数已实现并导出
- [ ] `getDirectionById()` 函数已实现并导出
- [ ] 系统 prompt 加入反 Slop 规则（无条件）
- [ ] 选了方向时系统 prompt 注入完整 spec
- [ ] ElectronChatPanel.ts 调用处传入 selectedDirection
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
