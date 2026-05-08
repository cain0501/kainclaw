# Task Primer: vscode-extension-fy6 — 媒体模板库：图像/设计分 surface，补充模板

> **Session entry point.** Read this first.

## Task Goal

提示词库按 `surface` 字段区分图像模板和设计模板，图像侧补充高质量模板（参考 open-design），设计侧新建设计模板分类并渲染。

**涉及文件**：
- `electron/renderer/index.html`（`MIDTAI_PLIB_IMG` 常量 + `renderMidtaiPromptLibrary()`）

---

## 现有架构

`MIDTAI_PLIB_IMG`（line ~1791）：图像提示词数据，按 `cat` 分组，每组有 `prompts[]`。

`renderMidtaiPromptLibrary()`（line ~4431）：
- `midtaiState.type === 'img'` → 渲染 `view-img-plib`，读 `MIDTAI_PLIB_IMG`
- `midtaiState.type === 'design'` → 渲染 `view-design-plib`，目前只显示占位文字

`useMidtaiPromptLibraryPrompt(text)`：点「使用」后填入对应输入框（图像填 `midtai-img-prompt`，设计填 `midtai-design-prompt`）。

---

## 修改详情

### Fix 1：扩充 `MIDTAI_PLIB_IMG` 图像模板

把现有 4 个分类扩充，每类至少 4 条，参考 open-design 的高质量模板风格：

```javascript
const MIDTAI_PLIB_IMG = [
  {
    cat: '人像',
    prompts: [
      { title: '电影感人像', text: 'cinematic portrait, soft rim light, shallow depth of field, film grain, premium editorial mood' },
      { title: '极简白底', text: 'minimal portrait, pure white background, high key lighting, clean commercial styling' },
      { title: '赛博朋克头像', text: 'cyberpunk anime portrait, neon face text overlay, dark background, glitch aesthetic, vivid color contrast' },
      { title: '古风仕女', text: 'traditional Chinese beauty portrait, hanfu costume, ink wash background, delicate brushwork aesthetic, soft natural light' },
    ],
  },
  {
    cat: '产品',
    prompts: [
      { title: '电商主图', text: 'premium product hero shot, centered composition, soft shadow, clean gradient backdrop, glossy detail' },
      { title: '科技器件', text: 'futuristic device render, brushed metal texture, dramatic rim light, dark studio background' },
      { title: '产品白底展示', text: 'product on pure white background, professional studio lighting, sharp detail, e-commerce ready' },
      { title: '生活方式场景', text: 'lifestyle product photography, natural light, warm home environment, authentic usage context' },
    ],
  },
  {
    cat: '场景',
    prompts: [
      { title: '品牌空间', text: 'editorial interior scene, warm ambient lighting, premium material palette, clean architectural framing' },
      { title: '城市街景', text: 'cinematic urban street scene, neon reflections, moody atmosphere, realistic depth and motion' },
      { title: '自然风光', text: 'dramatic landscape photography, golden hour light, vast scale, cinematic composition, high dynamic range' },
      { title: '科技感空间', text: 'futuristic interior, blue ambient lighting, clean lines, tech aesthetic, architectural visualization' },
    ],
  },
  {
    cat: '插画',
    prompts: [
      { title: '扁平信息插画', text: 'flat vector illustration, clean geometry, brand-friendly palette, modern infographic composition' },
      { title: '杂志拼贴', text: 'editorial collage illustration, layered paper texture, bold typography accents, experimental composition' },
      { title: '3D 等距插画', text: '3D isometric illustration, clean render, pastel palette, product UI mockup style' },
      { title: '水彩手绘', text: 'watercolor illustration, soft edges, organic texture, warm palette, artisanal handmade feel' },
    ],
  },
  {
    cat: '游戏',
    prompts: [
      { title: '三国武将', text: 'Three Kingdoms warrior character, epic battle scene, Chinese historical armor, dramatic lighting, game art style' },
      { title: '赛博朋克城市', text: 'cyberpunk city aerial view, neon signs, rain-slicked streets, dystopian atmosphere, game screenshot style' },
      { title: '奇幻角色', text: 'fantasy character concept art, detailed armor design, magical effects, epic pose, game illustration quality' },
    ],
  },
];
```

### Fix 2：新建 `MIDTAI_PLIB_DESIGN` 设计模板数据

在 `MIDTAI_PLIB_IMG` 定义之后加：

```javascript
const MIDTAI_PLIB_DESIGN = [
  {
    cat: '网页',
    prompts: [
      { title: 'SaaS 产品首页', text: '为一款 B2B SaaS 产品设计落地页，包含 Hero 区、功能特性、定价表和 CTA，现代极简风格' },
      { title: '创始人个人品牌', text: '为创始人/独立开发者设计个人品牌页，包含简介、项目展示和联系方式，高端简约风格' },
      { title: '电商品牌官网', text: '为消费品牌设计官网首页，包含品牌故事、产品展示和购买入口，温暖有质感的视觉风格' },
    ],
  },
  {
    cat: 'PPT',
    prompts: [
      { title: '融资路演 Deck', text: '为早期创业公司设计融资路演 PPT，包含问题/解决方案/市场/团队/财务页，专业投资人风格' },
      { title: '产品发布会', text: '为新产品发布设计演示 PPT，大图冲击力，简洁文字，适合舞台演讲' },
      { title: '季度汇报', text: '为企业季度业务汇报设计 PPT，数据可视化为主，清晰的信息层级，专业商务风格' },
    ],
  },
  {
    cat: '信息图',
    prompts: [
      { title: '流程说明图', text: '设计一张步骤流程信息图，清晰展示 5-7 个步骤，图标 + 文字结合，适合产品说明' },
      { title: '数据对比图', text: '设计一张数据对比信息图，展示两个方案或时间段的关键指标对比，清晰易读' },
      { title: '年度总结', text: '设计一张年度数据总结信息图，包含关键数字、趋势图和亮点，温暖有设计感' },
    ],
  },
  {
    cat: '移动端',
    prompts: [
      { title: 'App 首页', text: '为移动端 App 设计首页界面，包含导航、内容卡片和底部 Tab，现代 iOS 风格' },
      { title: '登录/注册页', text: '为 App 设计登录注册页面，简洁表单，品牌感强，支持社交登录' },
      { title: '个人中心页', text: '为 App 设计用户个人中心页，包含头像、数据统计和功能入口列表' },
    ],
  },
];
```

### Fix 3：更新 `renderMidtaiPromptLibrary()` — 设计侧渲染

把设计侧的占位文字替换为真实渲染逻辑：

```javascript
function renderMidtaiPromptLibrary() {
  const container = document.getElementById(midtaiState.type === 'img' ? 'view-img-plib' : 'view-design-plib');
  if (!container) return;
  const isImageMode = midtaiState.type === 'img';

  const plibData = isImageMode ? MIDTAI_PLIB_IMG : MIDTAI_PLIB_DESIGN;
  const categories = ['all', ...plibData.map(group => group.cat)];
  if (!categories.includes(midtaiPromptLibraryCategory)) {
    midtaiPromptLibraryCategory = 'all';
  }
  const cards = plibData
    .filter(group => midtaiPromptLibraryCategory === 'all' || group.cat === midtaiPromptLibraryCategory)
    .flatMap(group => group.prompts.map(prompt => ({ ...prompt, cat: group.cat })));

  container.innerHTML = `
    <div class="midtai-plib-shell">
      <div class="midtai-works-toolbar">
        <span class="midtai-works-title">提示词库</span>
      </div>
      <div class="midtai-plib-scroll">
        <div class="midtai-plib-cats">
          ${categories.map(cat => `
            <button class="midtai-filter-chip${cat === midtaiPromptLibraryCategory ? ' active' : ''}"
              onclick="setMidtaiPromptLibraryCategory('${escapeHtml(cat)}')"
            >${cat === 'all' ? '全部' : escapeHtml(cat)}</button>
          `).join('')}
        </div>
        <div class="midtai-plib-grid">
          ${cards.map(card => `
            <div class="midtai-plib-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <div class="midtai-plib-title">${escapeHtml(card.title)}</div>
                <span class="midtai-card-badge">${escapeHtml(card.cat)}</span>
              </div>
              <div class="midtai-plib-copy">${escapeHtml(card.text)}</div>
              <div class="midtai-plib-actions">
                <button class="btn-secondary" onclick="useMidtaiPromptLibraryPrompt('${escapeHtml(card.text)}')">使用</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
```

### Fix 4：确认 `useMidtaiPromptLibraryPrompt` 按 type 填入正确输入框

检查现有 `useMidtaiPromptLibraryPrompt()` 函数，确认：
- `midtaiState.type === 'img'` → 填入 `#midtai-img-prompt`
- `midtaiState.type === 'design'` → 填入 `#midtai-design-prompt`

若现有逻辑只填图像框，补加设计侧的分支。

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 图像 Tab → 提示词库：分类 Tab 正常，卡片数量增加，点「使用」填入图像描述框
2. 设计 Tab → 提示词库：出现网页/PPT/信息图/移动端分类，点「使用」填入设计需求框
3. 切换分类过滤正常

## Definition of Done
- [ ] 图像提示词库每类至少 4 条
- [ ] 设计提示词库有 4 个分类，每类至少 3 条
- [ ] 两侧「使用」按钮填入正确输入框
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
