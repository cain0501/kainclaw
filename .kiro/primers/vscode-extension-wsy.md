# Primer: vscode-extension-wsy
# 示例库 Showcase：设计页面预置 prompt 模板

## 目标

在设计页面 Phase A（无稿状态）加示例库入口，内置 10 个预置模板卡片，用户点击自动填入 skill + prompt，一键触发生成。

## Already Completed

- `electron/renderer/index.html`
  - 已新增 `从示例开始` 折叠入口
  - 已内置 `SHOWCASE_TEMPLATES` 10 张模板卡片
  - 已新增 `toggleShowcase()`、`renderShowcaseGrid()`、`applyShowcaseTemplate()`
  - 点击模板后会自动切换 skill、填入 prompt、清空已有方向、切到专业模式、收起面板并聚焦输入框
- 与 e3m 集成细节
  - showcase 与 guide form 已做互斥，打开 showcase 时自动关闭引导表单，反之亦然

## 验证结果

- 已通过：
  - `npx vitest run src/design/designPrompt.test.ts electron/ElectronChatPanel.test.ts electron/rendererSettings.test.ts`
  - `npm run build:electron`
  - `electron/renderer/index.html` JS syntax check
  - UTF-8 decode check
- 当前仓库仍有与本任务无关的基线问题：
  - `npm run check` / `npm run build` 被现有 `NormalizedMessage` 相关类型错误阻塞
  - `npm test` 全量存在 `src/conversationRuntimeStateHost.test.ts` 的既有失败

## 依赖

vscode-extension-lb4（Skill 扩展）需先完成，因为示例模板引用了新 skill 的 value。

## 当前状态

Phase A 表单在 `electron/renderer/index.html`，`#view-design-preview` 内，`#midtai-design-cta-wrap` 上方是输入框和 skill 选择区。

左侧面板目前有：输出类型 select、参考图上传、视觉方向选择器。

## 改动步骤

### Step 1：`electron/renderer/index.html` — 示例库数据

在 JS 区域加内置模板数据：

```javascript
const SHOWCASE_TEMPLATES = [
  {
    id: 'landing-saas',
    title: '产品落地页',
    skill: 'landing-page',
    tags: ['市场', '桌面端'],
    color: '#e8f4fd',
    accentColor: '#2563eb',
    prompt: '为一款 SaaS 工具设计产品落地页，包含 hero 区、核心功能介绍、用户评价和定价方案，风格简洁专业，突出转化。',
  },
  {
    id: 'dashboard-ops',
    title: '运营数据看板',
    skill: 'dashboard',
    tags: ['工程', '桌面端'],
    color: '#f0fdf4',
    accentColor: '#16a34a',
    prompt: '设计一个运营数据看板，展示 DAU、GMV、转化率、留存率等核心指标，支持日/周/月切换，数据用占位符。',
  },
  {
    id: 'xhs-post',
    title: '小红书图文 9 张',
    skill: 'social-carousel',
    tags: ['市场', '移动端'],
    color: '#fff1f2',
    accentColor: '#e11d48',
    prompt: '制作一组 9 张小红书图文（3:4 竖版），主题自定，封面 + 7 页内容 + 结尾 CTA，每页一句标题 + 一段正文。',
  },
  {
    id: 'pitch-deck',
    title: '融资 Pitch Deck',
    skill: 'slide',
    tags: ['市场', '幻灯片'],
    color: '#faf5ff',
    accentColor: '#7c3aed',
    prompt: '为早期创业公司设计融资 Pitch Deck，10 页，包含问题、解决方案、市场规模、产品、商业模式、团队、融资需求。',
  },
  {
    id: 'mobile-app-proto',
    title: '移动端 App 原型',
    skill: 'mobile-app',
    tags: ['产品', '移动端'],
    color: '#fff7ed',
    accentColor: '#ea580c',
    prompt: '设计一个移动端 App 的核心页面原型，包含首页、列表页、详情页和个人中心，iOS 风格，375px 宽。',
  },
  {
    id: 'pricing-compare',
    title: '定价对比页',
    skill: 'pricing-page',
    tags: ['市场', '桌面端'],
    color: '#f0f9ff',
    accentColor: '#0284c7',
    prompt: '设计一个 SaaS 产品的定价对比页，三档方案（免费/专业/企业），高亮推荐方案，列出核心功能对比，CTA 突出。',
  },
  {
    id: 'data-report',
    title: '数据分析报告',
    skill: 'doc-report',
    tags: ['财务', '文档'],
    color: '#fefce8',
    accentColor: '#ca8a04',
    prompt: '设计一份数据分析报告，A4 纵向，包含执行摘要、数据图表、关键发现和建议，适合打印，专业商务风格。',
  },
  {
    id: 'personal-site',
    title: '个人主页',
    skill: 'prototype',
    tags: ['个人', '桌面端'],
    color: '#fdf4ff',
    accentColor: '#a21caf',
    prompt: '设计一个设计师/开发者个人主页，包含 hero 自我介绍、作品集展示、技能标签和联系方式，风格有个性。',
  },
  {
    id: 'email-newsletter',
    title: '邮件通讯模板',
    skill: 'email',
    tags: ['运营', '邮件'],
    color: '#f0fdf4',
    accentColor: '#15803d',
    prompt: '设计一个产品更新邮件模板，600px 宽，包含 logo、本期亮点、功能更新列表、CTA 按钮和页脚，全内联样式。',
  },
  {
    id: 'magazine-cover',
    title: '杂志封面海报',
    skill: 'magazine-poster',
    tags: ['设计', '海报'],
    color: '#fff1f2',
    accentColor: '#be123c',
    prompt: '设计一张杂志风格封面海报，A4 比例，强排版层级，大标题 + 副标题 + 期号，印刷感，高级克制。',
  },
];
```

### Step 2：`electron/renderer/index.html` — 示例库 UI

在 Phase A 表单的 `#design-advanced-fields` 上方（或左侧面板顶部），加示例库入口按钮和展开区域：

```html
<!-- 示例库入口 -->
<div style="margin-bottom:12px">
  <button type="button" onclick="toggleShowcase()" 
    style="width:100%;text-align:left;background:#fffdfb;border:1px solid #eadfd2;border-radius:8px;padding:8px 12px;font-size:12px;color:#78716c;cursor:pointer;display:flex;justify-content:space-between;align-items:center">
    <span>📋 从示例开始</span>
    <span id="showcase-toggle-icon">▼</span>
  </button>
  <div id="midtai-showcase-panel" style="display:none;margin-top:6px;max-height:320px;overflow-y:auto">
    <div id="midtai-showcase-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:2px"></div>
  </div>
</div>
```

### Step 3：`electron/renderer/index.html` — 示例库逻辑

```javascript
function toggleShowcase() {
  const panel = document.getElementById('midtai-showcase-panel');
  const icon = document.getElementById('showcase-toggle-icon');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
  if (!isOpen) renderShowcaseGrid();
}

function renderShowcaseGrid() {
  const grid = document.getElementById('midtai-showcase-grid');
  if (!grid) return;
  grid.innerHTML = SHOWCASE_TEMPLATES.map(tpl => `
    <div onclick="applyShowcaseTemplate('${tpl.id}')"
      style="background:${tpl.color};border:1px solid ${tpl.accentColor}22;border-radius:8px;padding:10px;cursor:pointer;transition:transform .1s"
      onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform=''">
      <div style="font-size:11px;font-weight:600;color:#292524;margin-bottom:4px">${tpl.title}</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        ${tpl.tags.map(tag => `<span style="font-size:10px;background:${tpl.accentColor}18;color:${tpl.accentColor};border-radius:4px;padding:1px 5px">${tag}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function applyShowcaseTemplate(id) {
  const tpl = SHOWCASE_TEMPLATES.find(t => t.id === id);
  if (!tpl) return;
  
  // 填入 skill
  const skillSelect = document.getElementById('midtai-output-type');
  if (skillSelect) {
    skillSelect.value = tpl.skill;
    renderMidtaiDirectionPicker(); // 刷新视觉方向选择器
  }
  
  // 填入 prompt
  const promptInput = document.getElementById('midtai-prompt-input');
  if (promptInput) promptInput.value = tpl.prompt;
  
  // 收起示例库
  const panel = document.getElementById('midtai-showcase-panel');
  const icon = document.getElementById('showcase-toggle-icon');
  if (panel) panel.style.display = 'none';
  if (icon) icon.textContent = '▼';
  
  // 展开高级字段（让用户看到 skill 已被选中）
  const advancedFields = document.getElementById('design-advanced-fields');
  if (advancedFields) advancedFields.style.display = 'flex';
  
  // 滚动到 prompt 输入框
  promptInput?.focus();
}
```

## 验收标准

1. Phase A 表单顶部有"从示例开始"折叠按钮
2. 点击展开，显示 10 个模板卡片（2 列网格）
3. 点击某模板：skill select 自动切换、prompt 输入框自动填入、示例库收起
4. 填入后用户可直接点"生成设计"，也可修改 prompt 再生成
5. 示例库收起状态下，页面与之前完全一致
6. `npm run check` + `npm test` 通过

## 注意事项

- `midtai-prompt-input` 是 prompt 输入框的 id，需确认实际 id（可 grep 确认）
- 示例库数据全部前端内置，不需要任何后端改动
- 卡片颜色用各品牌/场景的代表色，视觉上有区分度
