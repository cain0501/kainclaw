# Primer: vscode-extension-40p
# 品牌设计系统库：左侧面板品牌参考 tab

## 目标

在左侧面板"视觉方向"区加"品牌参考"tab，内置 15 个品牌卡片，用户选中后品牌 stylePrompt 注入 system prompt，生成的设计自动套用该品牌视觉语言。

## 当前状态

`electron/renderer/index.html` 第 1152 行附近：
```html
<div class="midtai-form-group">
  <label class="midtai-form-label">视觉方向 <span style="color:#a8a29e;font-weight:400;text-transform:none">（可不选）</span></label>
  <div id="midtai-direction-picker" class="midtai-direction-picker"></div>
</div>
```

`src/design/designPrompt.ts` 的 `buildDesignSystemPrompt()` 接收 `options` 对象，目前没有 `brandContext` 字段。

`generateDesignWorkbench()` 约第 6291 行，发送 `design:generate` IPC。

## 改动步骤

### Step 1：`electron/renderer/index.html` — 品牌数据

在 JS 区域加品牌数据常量：

```javascript
const BRAND_SYSTEMS = [
  {
    id: 'linear',
    name: 'Linear',
    palette: ['#5E6AD2', '#1A1A1A', '#F7F7F7'],
    stylePrompt: `Brand: Linear. Design language: dark/light neutral backgrounds, purple accent #5E6AD2, Inter font throughout, tight 4px-base spacing, minimal borders (1px #E5E5E5), subtle depth via shadow not color. Components: pill badges, clean tables, monospace code blocks. Tone: engineering precision, no decoration.`,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    palette: ['#635BFF', '#0A2540', '#FFFFFF'],
    stylePrompt: `Brand: Stripe. Design language: deep navy #0A2540 for hero sections, indigo #635BFF accent, white surface cards with strong shadow (0 4px 24px rgba(0,0,0,.12)), Sohne/Inter font. Gradients: subtle blue-to-white on hero only. Components: rounded-lg cards, clean data tables, prominent CTA buttons. Tone: trusted, enterprise-grade.`,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    palette: ['#000000', '#FFFFFF', '#888888'],
    stylePrompt: `Brand: Vercel. Design language: pure black/white, zero color except for syntax highlighting, Geist font, generous whitespace, 1px borders on #E5E5E5. No gradients, no shadows on cards. Components: monospace terminal blocks, minimal nav, large display headlines. Tone: developer-first, brutally minimal.`,
  },
  {
    id: 'notion',
    name: 'Notion',
    palette: ['#2EAADC', '#37352F', '#F7F6F3'],
    stylePrompt: `Brand: Notion. Design language: warm off-white #F7F6F3 background, dark brown #37352F text, blue #2EAADC accent used sparingly. Inter font, comfortable 1.6 line-height, generous padding. Components: block-style layout, subtle hover states, emoji used contextually (not decoratively). Tone: calm, productive, human.`,
  },
  {
    id: 'apple',
    name: 'Apple',
    palette: ['#0071E3', '#1D1D1F', '#F5F5F7'],
    stylePrompt: `Brand: Apple. Design language: light gray #F5F5F7 background, near-black #1D1D1F text, blue #0071E3 for links/CTA only. SF Pro / system-ui font. Large hero imagery, minimal text, extreme whitespace. Components: full-bleed sections, product-centered layout, no visible borders. Tone: premium, aspirational, effortless.`,
  },
  {
    id: 'figma',
    name: 'Figma',
    palette: ['#F24E1E', '#FF7262', '#1E1E1E'],
    stylePrompt: `Brand: Figma. Design language: dark #1E1E1E base, orange-red #F24E1E + coral #FF7262 accents, Inter font. Colorful but controlled: accent appears in icons and CTAs only. Components: feature grid with icon+text, dark hero with gradient text, community-feel cards. Tone: creative, collaborative, energetic.`,
  },
  {
    id: 'github',
    name: 'GitHub',
    palette: ['#238636', '#0D1117', '#F0F6FC'],
    stylePrompt: `Brand: GitHub. Design language: near-black #0D1117 dark mode base, green #238636 for success/CTA, light #F0F6FC text. Mona Sans font. Components: code blocks with syntax highlight, contribution graph style data viz, pill badges for status. Tone: developer community, open source, technical.`,
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    palette: ['#FF5A5F', '#484848', '#FFFFFF'],
    stylePrompt: `Brand: Airbnb. Design language: coral red #FF5A5F accent, warm dark #484848 text, white background. Cereal/circular font. Components: card grid with rounded corners (12px), photo-forward layout, star ratings, map integration hints. Tone: warm, welcoming, travel-inspired.`,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    palette: ['#FF2442', '#1A1A1A', '#FFFFFF'],
    stylePrompt: `Brand: 小红书 (RED/Xiaohongshu). Design language: red #FF2442 accent, clean white background, dark text. PingFang SC font. Components: 3:4 card grid, heart/save interactions, tag chips, user avatar + name attribution. Tone: lifestyle, discovery, authentic UGC.`,
  },
  {
    id: 'douyin',
    name: '抖音',
    palette: ['#FE2C55', '#25F4EE', '#000000'],
    stylePrompt: `Brand: 抖音 (TikTok). Design language: black background, red #FE2C55 + cyan #25F4EE dual accent (used together for logo effect), white text. Components: full-screen vertical video cards, floating action buttons, bottom tab bar. Tone: energetic, youth-oriented, entertainment-first.`,
  },
  {
    id: 'feishu',
    name: '飞书',
    palette: ['#1456F0', '#1F2329', '#F5F6F7'],
    stylePrompt: `Brand: 飞书 (Lark). Design language: blue #1456F0 accent, near-black #1F2329 text, light gray #F5F6F7 background. PingFang SC / Inter font. Components: sidebar navigation, document-style layout, collaboration indicators, clean data tables. Tone: professional, efficient, enterprise collaboration.`,
  },
  {
    id: 'framer',
    name: 'Framer',
    palette: ['#0099FF', '#0A0A0A', '#FFFFFF'],
    stylePrompt: `Brand: Framer. Design language: electric blue #0099FF on black #0A0A0A, white for content areas. Inter font. Components: interactive preview cards, gradient mesh backgrounds (used sparingly), bold display type, motion-hint UI. Tone: creative tools, designer-focused, cutting-edge.`,
  },
  {
    id: 'raycast',
    name: 'Raycast',
    palette: ['#FF6363', '#1C1C1E', '#2C2C2E'],
    stylePrompt: `Brand: Raycast. Design language: dark #1C1C1E base, coral #FF6363 accent, dark surface #2C2C2E for cards. SF Pro / Inter font. Components: command palette style list, keyboard shortcut badges, extension cards with icon. Tone: power user, macOS-native, productivity.`,
  },
  {
    id: 'loom',
    name: 'Loom',
    palette: ['#625DF5', '#1A1A2E', '#FFFFFF'],
    stylePrompt: `Brand: Loom. Design language: purple #625DF5 accent, dark navy #1A1A2E for hero, white for content. Inter font. Components: video thumbnail cards with play overlay, timeline UI, reaction bubbles. Tone: async communication, friendly, modern remote work.`,
  },
  {
    id: 'linear-dark',
    name: 'Monocle / Editorial',
    palette: ['#C9A96E', '#1A1A1A', '#F5F0E8'],
    stylePrompt: `Brand: Editorial / Monocle style. Design language: warm off-white #F5F0E8 background, dark #1A1A1A text, gold #C9A96E accent. Serif display font (Playfair Display or similar) + sans body. Components: editorial grid, pull quotes, large imagery with caption, issue/volume numbering. Tone: premium print, intellectual, timeless.`,
  },
];
```

### Step 2：`electron/renderer/index.html` — 品牌参考 tab UI

把现有"视觉方向"区改为两个 tab（视觉方向 / 品牌参考）：

```html
<div class="midtai-form-group">
  <label class="midtai-form-label">视觉方向 / 品牌参考 <span style="color:#a8a29e;font-weight:400;text-transform:none">（可不选）</span></label>
  <!-- Tab 切换 -->
  <div style="display:flex;gap:0;margin-bottom:8px;border:1px solid #eadfd2;border-radius:6px;overflow:hidden">
    <button type="button" id="tab-direction" onclick="switchDirectionTab('direction')"
      style="flex:1;padding:5px;font-size:11px;border:none;cursor:pointer;background:#c9502e;color:#fff">视觉方向</button>
    <button type="button" id="tab-brand" onclick="switchDirectionTab('brand')"
      style="flex:1;padding:5px;font-size:11px;border:none;cursor:pointer;background:#fff;color:#78716c">品牌参考</button>
  </div>
  <!-- 视觉方向选择器（原有） -->
  <div id="midtai-direction-picker" class="midtai-direction-picker"></div>
  <!-- 品牌参考选择器（新增） -->
  <div id="midtai-brand-picker" style="display:none"></div>
</div>
```

### Step 3：`electron/renderer/index.html` — 品牌选择逻辑

```javascript
let selectedBrandId = null;

function switchDirectionTab(tab) {
  const dirPicker = document.getElementById('midtai-direction-picker');
  const brandPicker = document.getElementById('midtai-brand-picker');
  const tabDir = document.getElementById('tab-direction');
  const tabBrand = document.getElementById('tab-brand');
  
  if (tab === 'direction') {
    dirPicker.style.display = '';
    brandPicker.style.display = 'none';
    tabDir.style.background = '#c9502e'; tabDir.style.color = '#fff';
    tabBrand.style.background = '#fff'; tabBrand.style.color = '#78716c';
    selectedBrandId = null; // 切回视觉方向时清除品牌选择
  } else {
    dirPicker.style.display = 'none';
    brandPicker.style.display = '';
    tabDir.style.background = '#fff'; tabDir.style.color = '#78716c';
    tabBrand.style.background = '#c9502e'; tabBrand.style.color = '#fff';
    renderBrandPicker();
  }
}

function renderBrandPicker() {
  const picker = document.getElementById('midtai-brand-picker');
  if (!picker) return;
  picker.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      ${BRAND_SYSTEMS.map(brand => `
        <div id="brand-card-${brand.id}" onclick="selectBrand('${brand.id}')"
          style="border:2px solid ${selectedBrandId === brand.id ? '#c9502e' : '#eadfd2'};border-radius:8px;padding:8px;cursor:pointer;background:${selectedBrandId === brand.id ? '#fff5f0' : '#fff'}">
          <div style="font-size:11px;font-weight:600;color:#292524;margin-bottom:5px">${brand.name}</div>
          <div style="display:flex;gap:3px">
            ${brand.palette.map(c => `<div style="width:14px;height:14px;border-radius:3px;background:${c};border:1px solid #eadfd2"></div>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function selectBrand(id) {
  selectedBrandId = selectedBrandId === id ? null : id; // 再次点击取消选择
  renderBrandPicker();
}
```

### Step 4：`generateDesignWorkbench()` — 透传 brandContext

在发送 `design:generate` IPC 时加入 `brandContext`：

```javascript
const brand = selectedBrandId ? BRAND_SYSTEMS.find(b => b.id === selectedBrandId) : null;
send({
  type: 'design:generate',
  // ... 其他字段
  brandContext: brand ? brand.stylePrompt : '',
});
```

### Step 5：`electron/ElectronChatPanel.ts` — 透传

在 `design:generate` handler 里读取 `brandContext` 并传给 `generateDesignWorkbench()`：

```typescript
const brandContext = String(message.brandContext ?? "");
```

### Step 6：`src/design/designPrompt.ts` — 注入 brandContext

在 `buildDesignSystemPrompt()` 的 options 类型里加 `brandContext?: string`，在 system prompt 里注入（优先级高于默认 craft 规则，放在 craft rules 之后、user prompt 之前）：

```typescript
if (options.brandContext) {
  parts.push(`\n## Brand Design System\n${options.brandContext}\n\nApply this brand's visual language strictly. It overrides generic craft defaults where they conflict.`);
}
```

## 验收标准

1. 视觉方向区有两个 tab：视觉方向 / 品牌参考
2. 切到"品牌参考"显示 15 个品牌卡片（2 列网格，带色板色块）
3. 点击品牌卡片高亮选中（红色边框），再点取消
4. 选中品牌后点"生成设计"，生成的 HTML 视觉风格明显符合该品牌特征
5. 切回"视觉方向"tab，品牌选择自动清除
6. 不选品牌时行为与之前完全一致
7. `npm run check` + `npm test` 通过

## 注意事项

- `selectedBrandId` 是模块级变量，切换 tab 时清空，避免用户忘记自己选了品牌
- 品牌 stylePrompt 是英文，LLM 理解更准确，不需要翻译
- 15 个品牌第一批，后续可继续扩充，数据结构已定好
