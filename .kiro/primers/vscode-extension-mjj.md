# Task Primer: vscode-extension-mjj — 中台设计表单：输出类型 + 视觉方向选择器

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

`midtai-form-design` 目前只有 textarea + 生成按钮。`generateDesignWorkbench()` 读取 `design-style-input` 和 `design-output-type`，但这两个 DOM 在老 `page-design` 表单里，中台里不存在，导致方向和输出类型始终是默认值。

本任务在中台左侧设计表单加入：
1. 输出类型选择（网页原型 / 幻灯片 / 信息图 / 动效）
2. 视觉方向选择器（渐变色预览卡片，可不选）

## Out of Scope

- 不改 `src/` 下任何文件
- 不改老的 `page-design` 表单（保持不动）
- 不改方向的内容本身（showcaseIndex 已有）
- 不做参考图上传（已有独立入口）

## Already Completed

- `showcaseIndex.ts` 已有 12 套方向数据，含 4 套带精确 spec
- `generateDesignWorkbench()` 已读取 `design-output-type` 和 `design-style-input` 的值
- 老 `page-design` 表单里有方向卡片 UI（可参考样式）

## Next Step (the ONLY thing to do this session)

**Files:** `electron/renderer/index.html` only

### 1. 在 `midtai-form-design` 加输出类型 select

找到 `<div id="midtai-form-design"` 内的 textarea 前面，加：

```html
<div class="midtai-form-group">
  <label class="midtai-form-label">输出类型</label>
  <select id="midtai-output-type" class="midtai-form-select">
    <option value="prototype">网页原型</option>
    <option value="slide">幻灯片</option>
    <option value="infographic">信息图</option>
    <option value="animation">动效页</option>
  </select>
</div>
```

CSS（加到 midtai 样式区）：
```css
.midtai-form-select{padding:7px 10px;border:1.5px solid #e5ddd0;border-radius:8px;font-size:12px;background:#fff;font-family:inherit;color:#1c1917;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2378716c' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;cursor:pointer}
.midtai-form-select:focus{outline:none;border-color:#c94c2e}
```

### 2. 在输出类型下方加视觉方向选择器

```html
<div class="midtai-form-group" id="midtai-direction-group">
  <label class="midtai-form-label">视觉方向 <span style="color:#a8a29e;font-weight:400">（可不选）</span></label>
  <div id="midtai-direction-picker" class="midtai-direction-picker"></div>
</div>
```

CSS：
```css
.midtai-direction-picker{display:flex;flex-direction:column;gap:5px}
.midtai-dir-card{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1.5px solid #e5ddd0;border-radius:8px;cursor:pointer;background:#fff;transition:border-color .12s}
.midtai-dir-card:hover{border-color:#c94c2e}
.midtai-dir-card.selected{border-color:#c94c2e;background:#fef2f0}
.midtai-dir-swatch{width:28px;height:28px;border-radius:5px;flex-shrink:0}
.midtai-dir-info{flex:1;min-width:0}
.midtai-dir-name{font-size:12px;font-weight:600;color:#1c1917}
.midtai-dir-summary{font-size:10px;color:#78716c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

### 3. 初始化方向选择器

在页面初始化区（找 `initMidtai` 或页面 load 处），或在 `designSwitchView('preview')` 显示时调用：

```javascript
function initMidtaiDirectionPicker() {
  const picker = document.getElementById('midtai-direction-picker');
  if (!picker || picker.dataset.initialized) return;
  picker.dataset.initialized = '1';

  // 在输出类型变化时重新渲染（方向按输出类型过滤）
  document.getElementById('midtai-output-type')?.addEventListener('change', renderMidtaiDirectionPicker);
  renderMidtaiDirectionPicker();
}

function renderMidtaiDirectionPicker() {
  const picker = document.getElementById('midtai-direction-picker');
  if (!picker) return;
  const outputType = document.getElementById('midtai-output-type')?.value || 'prototype';

  // directions 数据从 IPC 拿，或直接内联（见下）
  const dirs = MIDTAI_DIRECTIONS[outputType] || MIDTAI_DIRECTIONS.prototype || [];
  const selected = midtaiState.designDirection || '';

  picker.innerHTML = [
    // 「不选」选项
    `<div class="midtai-dir-card${!selected ? ' selected' : ''}" onclick="selectMidtaiDirection('')">
      <div class="midtai-dir-swatch" style="background:#f5f0e8;border:1px solid #e5ddd0"></div>
      <div class="midtai-dir-info">
        <div class="midtai-dir-name">自动</div>
        <div class="midtai-dir-summary">由 AI 决定视觉风格</div>
      </div>
    </div>`,
    ...dirs.map(d => `<div class="midtai-dir-card${selected === d.stylePrompt ? ' selected' : ''}" onclick="selectMidtaiDirection('${d.stylePrompt.replace(/'/g, "\\'")}')">
      <div class="midtai-dir-swatch" style="background:${d.preview.value}"></div>
      <div class="midtai-dir-info">
        <div class="midtai-dir-name">${escapeHtml(d.label)}</div>
        <div class="midtai-dir-summary">${escapeHtml(d.summary)}</div>
      </div>
    </div>`)
  ].join('');
}

function selectMidtaiDirection(stylePrompt) {
  midtaiState.designDirection = stylePrompt;
  renderMidtaiDirectionPicker();
}
```

### 4. 内联方向数据 `MIDTAI_DIRECTIONS`

在 `midtaiState` 附近定义（或在 `initMidtaiDirectionPicker` 前），从 main process 拿数据不现实，直接内联 JS 对象：

通过 IPC 消息 `midtai:directions-data` 来接收，或者在 `window.addEventListener('message', ...)` 里新增 case。

**更简单方案**：在 `openMidtai()` 时 send `{ type: 'midtai:request-directions' }`，host 返回 `midtai:directions-data` 消息带方向数组。

**最简方案（推荐，不改 host）**：在 renderer 里内联一个精简版方向数组（只含 label/summary/stylePrompt/preview，不含 spec）。从 `showcaseIndex` 编译时已知，直接硬编码到 renderer。

先 grep 一下 renderer 里有没有现成的方向数据引用：
```bash
grep -n "stylePrompt\|DIRECTIONS\|信息建筑\|极简奢侈\|direction" electron/renderer/index.html | head -20
```

如果已有，复用；如果没有，内联如下精简版（只 prototype + slide）：

```javascript
const MIDTAI_DIRECTIONS = {
  prototype: [
    { label:'信息建筑', summary:'高对比网格，适合产品首页和 B2B 原型', stylePrompt:'information architecture, swiss grid, strong editorial hierarchy, black white with restrained red accent, premium product prototype', preview:{value:'linear-gradient(135deg,#111111 0%,#f5f1eb 55%,#e63946 100%)'} },
    { label:'极简奢侈', summary:'大留白衬线，适合高端品牌和创始人产品', stylePrompt:'minimal luxury editorial, warm ivory background, delicate serif display, subtle gold accent, quiet premium spacing', preview:{value:'linear-gradient(135deg,#f7f1e8 0%,#ffffff 58%,#d4a574 100%)'} },
    { label:'东方极简', summary:'米灰软科技，适合文化感与未来感混合产品', stylePrompt:'eastern minimal soft-tech, beige and stone palette, calm whitespace, organic geometry, subtle futuristic interface', preview:{value:'linear-gradient(135deg,#ece4d8 0%,#c9d1c8 52%,#6f7d72 100%)'} },
  ],
  slide: [
    { label:'编辑式提案', summary:'强封面感，适合 pitch deck 与产品发布', stylePrompt:'editorial pitch deck, strong cover page, serif display headlines, cinematic whitespace, premium keynote layout', preview:{value:'linear-gradient(135deg,#18181b 0%,#f4efe8 60%,#b86f52 100%)'} },
    { label:'现代数据派', summary:'网格感强，适合指标路演季度汇报', stylePrompt:'modernist data presentation, swiss grid, sharp chart framing, restrained blue-gray accents, presentation not webpage', preview:{value:'linear-gradient(135deg,#1f2937 0%,#dbe6f0 55%,#4f83cc 100%)'} },
  ],
  infographic: [
    { label:'信号板', summary:'信息密度高，适合流程对比结构化信息图', stylePrompt:'signal-board infographic, structured modules, high information density with clean grouping, editorial diagram style', preview:{value:'linear-gradient(135deg,#131313 0%,#efefef 60%,#ef4444 100%)'} },
    { label:'宁静系统感', summary:'米灰青绿，适合解释型信息图和年度总结', stylePrompt:'calm systems infographic, muted sand and sage palette, neat data storytelling, elegant labels and spacing', preview:{value:'linear-gradient(135deg,#ede7db 0%,#d6dfd8 58%,#7ca08a 100%)'} },
  ],
  animation: [
    { label:'运动诗学', summary:'流体节奏，适合动态叙事和开场动画感页面', stylePrompt:'motion poetry animated prototype, fluid rhythm, layered gradients, kinetic composition, motion-first atmosphere', preview:{value:'linear-gradient(135deg,#30204d 0%,#7c5cff 42%,#ff8ba7 100%)'} },
  ],
};
```

### 5. 更新 `generateDesignWorkbench()` 读取中台表单值

把函数里读取 outputType 和 style 的逻辑改为优先读中台表单元素：

```javascript
function generateDesignWorkbench() {
  const promptInput = document.getElementById('midtai-design-prompt') || document.getElementById('design-prompt-input');
  // 优先读中台表单的 outputType 和 style
  const outputTypeSelect = document.getElementById('midtai-output-type') || document.getElementById('design-output-type');
  const style = midtaiState.designDirection !== undefined
    ? midtaiState.designDirection
    : (document.getElementById('design-style-input')?.value?.trim() || '');
  // ... 其余不变
```

同时在 `midtaiState` 初始化里加 `designDirection: ''`。

### 6. 在适当时机调用 `initMidtaiDirectionPicker()`

在 `openMidtai()` 或 `designSwitchView('preview')` 时调用一次即可（有 `dataset.initialized` 保护，重复调用安全）。

**Test:** `npm test && npm run check && npm run build && npm run build:electron`

JS 语法检查：
```bash
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
```

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test（告知用户手测）:
1. 进入中台 → 设计 tab → 左侧面板显示：输出类型下拉 + 方向卡片列表
2. 选「信息建筑」→ 卡片高亮
3. 填 prompt → 点生成设计 → 生成的设计明显偏冷灰蓝系而非暖色
4. 切到「幻灯片」输出类型 → 方向卡片列表变为 slide 方向
5. 选「自动」→ 无方向约束，AI 自由发挥（但 Slop 规则仍生效）

## Risk Points

- Risk: `midtaiState.designDirection` 未定义导致 generateDesignWorkbench 读取出错
  Guard: 初始化时加 `designDirection: ''`，读取时用 `?? ''` 兜底
- Risk: 内联 MIDTAI_DIRECTIONS 与 showcaseIndex 数据不同步
  Guard: 这是已知取舍（不引入 IPC），方向内容变化时手动同步这份数据

## High-Risk Files Touched

- `electron/renderer/index.html` — 新增 CSS、新增 DOM（midtai-form-design 内）、新增 JS 函数、修改 generateDesignWorkbench 读值逻辑

## Reference (only load if stuck)

- 现有方向数据：`src/design/showcaseIndex.ts`（复制 label/summary/stylePrompt/preview 到内联数组）
- 老 page-design 方向卡片样式：grep `design-direction-card` in `electron/renderer/index.html`
- Beads: `bd show vscode-extension-mjj`

## Definition of Done

- [ ] 输出类型下拉在中台设计表单可见
- [ ] 方向选择卡片按输出类型动态显示
- [ ] 切换输出类型后方向列表更新
- [ ] 选了方向后 generateDesignWorkbench 能正确读到 stylePrompt
- [ ] 「自动」选项（不选方向）正常工作
- [ ] JS 语法检查通过
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
