# Task Primer: vscode-extension-zf2 — Craft 规则系统：设计提示词拆成独立 Markdown 文件

> **Session entry point.** Read this first.

## Task Goal

把 `designPrompt.ts` 里硬编码的 `ANTI_SLOP_RULES` 和视觉质量规则拆成独立 Markdown 文件，`buildKainClawDesignSystemPrompt()` 按需读取拼入，规则和代码解耦。

**涉及文件**：
- `src/design/designPrompt.ts`
- `src/design/craft/`（新建目录 + 4个 md 文件）

---

## 现有架构

`src/design/designPrompt.ts` 里：
- `ANTI_SLOP_RULES`（line ~19）：9条反 AI 烂模式规则，硬编码为字符串数组
- `buildKainClawDesignSystemPrompt()`：把规则拼入系统提示词

规则目前只能通过改 TypeScript 代码来更新，不够灵活。

---

## 修改详情

### Fix 1：新建 `src/design/craft/` 目录，创建 4 个规则文件

**`src/design/craft/anti-ai-slop.md`**（把现有 ANTI_SLOP_RULES 迁移过来，可扩充）：

```markdown
# Anti-AI-Slop Rules

Always apply. No exceptions.

- No blue/purple gradient backgrounds — they are the universal AI mediocrity signal.
- No decorative emoji in headings, labels, or body text (✅ ❌ 🚀 💡 and similar).
- No left-border accent cards as the primary layout pattern — use whitespace or full borders.
- No fabricated statistics or fake numerical data — use '—' or grey placeholder blocks instead.
- Do not use Inter or generic sans-serif as a display/headline font when a more characterful choice is available.
- No excessive glassmorphism blur backgrounds.
- No AI-illustrated human faces or generic stock-photo descriptions.
- Every design decision must have a reason. If it can't be justified, remove it.
- Chinese product copy: headings ≤ 16 characters, no buzzword stacking (智能/赋能/生态).
- No blue→cyan two-stop trust gradients (linear-gradient with blue and cyan stops).
- No purple/indigo solid fills as primary button or badge color.
```

**`src/design/craft/typography.md`**：

```markdown
# Typography Rules

## Type scale
Use a multiplicative scale (1.2 or 1.25). Cap at 6–8 sizes per artifact.

| Role | Range |
|---|---|
| Display | 48–72px |
| H1 | 32–48px |
| H2 | 24–32px |
| Body | 15–18px |
| Small | 13–14px |
| Caption | 11–12px |

## Line height
- Display/H1 (≥32px): 1.0–1.2 (tight)
- Body (15–18px): 1.5–1.6
- Small (≤14px): 1.5

## Letter-spacing
- Body text (14–18px): 0 (default)
- Small text (11–13px): 0.01em to 0.02em
- Display/H1 ALL CAPS: 0.04em to 0.08em
- Never negative letter-spacing on body text.

## Font pairing
- Serif display + sans body = editorial, premium
- Sans display + sans body = modern, product
- Never two serifs together.
- Chinese: PingFang SC / Noto Sans SC for body; Noto Serif SC for editorial display.
```

**`src/design/craft/color.md`**：

```markdown
# Color Rules

## OKLch usage
- Always define palette in OKLch in :root — never raw hex in component styles.
- Minimum 6 tokens: bg, surface, fg, muted, border, accent.
- Contrast: fg on bg ≥ 7:1 (WCAG AA+). muted on bg ≥ 4.5:1.

## Accent discipline
- One accent color per design. Used for primary CTA and key data only.
- Accent appears at most 3 times in a single view.
- Never use accent as a background fill for large areas.

## Forbidden patterns
- No blue/purple gradients (see anti-ai-slop.md).
- No more than 12 raw hex values outside :root.
- No semi-transparent overlays stacked more than 2 levels deep.
```

**`src/design/craft/layout.md`**：

```markdown
# Layout Rules

## Spacing
- Use 8px base unit. All spacing values must be multiples of 4px (4, 8, 12, 16, 24, 32, 48, 64).
- Section padding: minimum 48px vertical, 24px horizontal.
- Card internal padding: 16–24px.

## Grid
- Content max-width: 1200px for desktop, 760px for editorial/reading.
- Always center content horizontally with auto margins.
- Prefer CSS Grid for 2D layouts, Flexbox for 1D.

## Hierarchy
- Maximum 3 levels of visual hierarchy per section.
- Each section has one dominant element (hero image, headline, or data point).
- Never compete: if two elements fight for attention, remove one.

## Forbidden patterns
- No more than 4 columns on mobile.
- No horizontal scroll on the main content area.
- No fixed pixel heights on text containers (use min-height or auto).
```

### Fix 2：`designPrompt.ts` 改为读取 craft 文件

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCraftRule(filename: string): string {
  try {
    const filePath = path.join(__dirname, "craft", filename);
    return readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

// 替换原来的 ANTI_SLOP_RULES 数组
const CRAFT_ANTI_SLOP = loadCraftRule("anti-ai-slop.md");
const CRAFT_TYPOGRAPHY = loadCraftRule("typography.md");
const CRAFT_COLOR = loadCraftRule("color.md");
const CRAFT_LAYOUT = loadCraftRule("layout.md");
```

在 `buildKainClawDesignSystemPrompt()` 里，把原来的 `...ANTI_SLOP_RULES` 替换为：

```typescript
...(CRAFT_ANTI_SLOP ? ["", CRAFT_ANTI_SLOP] : []),
...(CRAFT_TYPOGRAPHY ? ["", CRAFT_TYPOGRAPHY] : []),
...(CRAFT_COLOR ? ["", CRAFT_COLOR] : []),
...(CRAFT_LAYOUT ? ["", CRAFT_LAYOUT] : []),
```

**注意**：`readFileSync` 在 Electron 主进程里可用。如果构建时 craft 文件需要打包，确认 `electron-builder` 配置里 `src/design/craft/` 目录被包含在 extraResources 或 files 里。若打包有问题，fallback 方案是把 craft 文件内容在构建时 inline 成 TypeScript 常量（用 build script 生成）。

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

验证：
1. `npm run check` 通过（TypeScript 无报错）
2. 生成一个设计，系统提示词里包含 craft 规则内容（可在 ElectronChatPanel.ts 加临时 console.log 验证）
3. 删除一个 craft 文件，确认 fallback 不崩溃（graceful degradation）

## Definition of Done
- [ ] `src/design/craft/` 目录有 4 个 md 文件
- [ ] `designPrompt.ts` 从文件读取规则，原 `ANTI_SLOP_RULES` 数组删除
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
