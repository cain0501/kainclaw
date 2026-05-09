# Primer: vscode-extension-lb4
# Design Skill 扩展：输出类型从5个扩展到12个

## 目标

把 `#midtai-output-type` select 从 4 个选项扩展到 12 个，并在 `designPrompt.ts` 里为每个新 skill 加专属 system prompt 补丁。

## Already Completed

- `src/design/designPrompt.ts`
  - `DesignOutputType` 已扩展到 12 个值
  - 新增 `DESIGN_OUTPUT_TYPES` / `normalizeDesignOutputType()` 供宿主复用
  - 为 8 个新 skill 加入专属 prompt 约束补丁
- `src/design/showcaseIndex.ts`
  - 新 skill 已接到 prototype directions fallback，避免方向选择器空白
- `electron/ElectronChatPanel.ts`
  - 旧的 4 值白名单已替换为共享 output type 归一化逻辑
- `electron/renderer/index.html`
  - `#midtai-output-type` 与 `#design-output-type` 两个 select 都已扩展到 12 个选项
- 测试与验证
  - 已新增 `src/design/designPrompt.test.ts`
  - 已通过 `npm test`、`npm run check`、`npm run build`、`npm run build:electron`
  - 已通过 `electron/renderer/index.html` 内联脚本语法校验与 UTF-8 解码校验

## 当前状态

`electron/renderer/index.html` 第 1134 行：
```html
<select id="midtai-output-type" class="midtai-form-select" onchange="renderMidtaiDirectionPicker()">
  <option value="prototype">网页原型</option>
  <option value="slide">幻灯片</option>
  <option value="infographic">信息图</option>
  <option value="animation">动效页</option>
</select>
```

`src/design/designPrompt.ts` 第 14 行：
```typescript
export type DesignOutputType =
  | "prototype"
  | "slide"
  | "infographic"
  | "animation";
```

system prompt 里目前只有 `Output type: ${options.outputType}` 一行，没有 skill 专属补丁。

## 需要新增的 Skill

| value | 中文标签 | 专属约束 |
|-------|---------|---------|
| `social-carousel` | 小红书图文 | 9:16 竖版，375px 宽，每屏单一焦点，大字标题，无导航栏 |
| `email` | 邮件模板 | 600px 宽，全内联样式（无外部 CSS），无 JS，兼容 Outlook |
| `mobile-app` | 移动端 App | 375×812px，iOS 规范，底部 tab bar，状态栏占位 |
| `magazine-poster` | 杂志海报 | 800×1130px（A4 比例），强排版层级，印刷感 |
| `dashboard` | 数据看板 | 1440px 宽，信息密度高，网格布局，数据占位用 — |
| `doc-report` | 文档报告 | 794px 宽（A4），适合打印，无动效，清晰层级 |
| `pricing-page` | 定价对比页 | 桌面端，3 列对比，高亮推荐方案，CTA 突出 |
| `landing-page` | 产品落地页 | 桌面端，hero + features + CTA 结构，转化导向 |

## 改动步骤

### Step 1：`src/design/designPrompt.ts`

1. 扩展 `DesignOutputType` 类型，加入 8 个新值
2. 在 `buildDesignSystemPrompt()` 函数里（当前只有 `Output type: ${options.outputType}` 一行），改为 switch-case，每个 skill 追加专属约束段落

示例结构：
```typescript
export type DesignOutputType =
  | "prototype"
  | "slide"
  | "infographic"
  | "animation"
  | "social-carousel"
  | "email"
  | "mobile-app"
  | "magazine-poster"
  | "dashboard"
  | "doc-report"
  | "pricing-page"
  | "landing-page";

// 在 buildDesignSystemPrompt 里：
const skillPatch = getSkillPatch(options.outputType);
// skillPatch 追加到 system prompt

function getSkillPatch(outputType: DesignOutputType): string {
  switch (outputType) {
    case "social-carousel":
      return `## Skill: Social Carousel (小红书/Instagram)
- Canvas: 375px wide, 9:16 aspect ratio per slide
- Each slide: single focal point, large display headline (≥32px)
- No navigation bars, no sidebars
- Bold color blocks or full-bleed imagery
- Text must be legible at mobile size`;
    case "email":
      return `## Skill: Email Template
- Max width: 600px, centered
- ALL styles must be inline (no <style> tags, no external CSS)
- No JavaScript of any kind
- Use table-based layout for Outlook compatibility
- Images must have alt text`;
    // ... 其他 skill
    default:
      return "";
  }
}
```

### Step 2：`electron/renderer/index.html`

在第 1134 行的 select 里追加 8 个 option：
```html
<option value="social-carousel">小红书图文</option>
<option value="email">邮件模板</option>
<option value="mobile-app">移动端 App</option>
<option value="magazine-poster">杂志海报</option>
<option value="dashboard">数据看板</option>
<option value="doc-report">文档报告</option>
<option value="pricing-page">定价对比页</option>
<option value="landing-page">产品落地页</option>
```

### Step 3：`src/design/showcaseIndex.ts`

`MIDTAI_DIRECTIONS` 对象目前只有 `prototype / slide / infographic / animation` 四个 key。
为新 skill 各加一个 directions 数组（可以先复用 prototype 的方向，后续再细化）：

```typescript
"social-carousel": MIDTAI_DIRECTIONS.prototype,
"email": MIDTAI_DIRECTIONS.prototype,
// ... 其他新 skill 先 fallback 到 prototype
```

这样 `renderMidtaiDirectionPicker()` 不会因为找不到 key 而报错。

## 验收标准

1. select 下拉显示 12 个选项，中文标签正确
2. 选择 `social-carousel` 生成的 HTML 宽度为 375px，有 9:16 比例约束
3. 选择 `email` 生成的 HTML 全内联样式，无 `<style>` 标签
4. `npm run check` 通过（TypeScript 类型无报错）
5. `npm test` 通过

## 注意事项

- `DesignOutputType` 类型在多处被引用，改完后运行 `npm run check` 确认无类型错误
- `renderMidtaiDirectionPicker()` 依赖 `MIDTAI_DIRECTIONS[outputType]`，新 skill 必须有 fallback，否则方向选择器会空白
- 不要修改现有 4 个 skill 的逻辑，只追加
