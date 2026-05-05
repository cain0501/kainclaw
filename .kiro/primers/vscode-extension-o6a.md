# Task Primer: vscode-extension-o6a — 我的作品 UI 对齐原型设计

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

将「我的作品」卡片从通用的 `midtai-card` 样式升级为原型 `design-wcard` 样式，使视觉与 `.kiro/midtai-prototype-v2.html` 保持一致。包括：130px 渐变 thumb 区域、hover 浮起效果、深色版本徽章、来源色标签，以及图像/设计两种 grid 列宽分离。

## Out of Scope

- 不改 `src/` 下任何文件
- 不改 `MidtaiLibraryHost`
- 不做 thumb 截图实现（用渐变色占位即可，可后续升级）
- 不改搜索和筛选逻辑
- 不改替换模式行为

## Already Completed

- `renderMidtaiWorks()` 已实现，显示真实数据
- `来自中台` 乱码已修复（vscode-extension-o6a 前序 fix）
- `midtai-card` / `midtai-card-grid` CSS 已在 renderer 定义

## Next Step (the ONLY thing to do this session)

**Files:** `electron/renderer/index.html` only

### 1. 新增 CSS 类（在现有 midtai 卡片 CSS 之后追加）

```css
/* design-wcard — 我的作品卡片升级样式 */
.design-wcard{background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5ddd0;cursor:pointer;transition:box-shadow .15s,transform .15s}
.design-wcard:hover{box-shadow:0 6px 20px rgba(0,0,0,.1);transform:translateY(-2px)}
.design-wcard-thumb{width:100%;height:130px;overflow:hidden;position:relative}
.design-wcard-footer{padding:10px 12px}
.design-wcard-title{font-size:13px;font-weight:600;color:#1c1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
.design-wcard-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ver-badge{padding:1px 7px;background:#1c1917;color:#fff;border-radius:4px;font-size:10px;font-weight:700}
.source-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:500}
.s-chat{background:#e0f2fe;color:#075985}
.s-mid{background:#fef3c7;color:#92400e}
.s-blank{background:#f1f5f9;color:#475569}
.wcard-time{font-size:11px;color:#a8a29e;margin-left:auto}
/* thumb 渐变调色板 */
.tw-g1{background:linear-gradient(135deg,#0f0c29,#302b63)}
.tw-g2{background:linear-gradient(135deg,#1a1a2e,#e94560)}
.tw-g3{background:linear-gradient(135deg,#134e5e,#71b280)}
.tw-g4{background:linear-gradient(135deg,#c94b4b,#4b134f)}
.tw-g5{background:linear-gradient(135deg,#373b44,#4286f4)}
.tw-g6{background:linear-gradient(135deg,#f7971e,#ffd200)}
.tw-g7{background:linear-gradient(135deg,#6a11cb,#2575fc)}
.tw-g8{background:linear-gradient(135deg,#11998e,#38ef7d)}
/* 图像 grid（较窄列）与设计 grid（标准列）*/
.img-works-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px}
.design-works-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
```

### 2. 修改 `renderMidtaiWorks()` 内的卡片渲染

将当前 `grid.innerHTML = visibleItems.map(...)` 替换为：

```javascript
// 把所有 items 按 contentType 分组
const designs = visibleItems.filter(i => i.contentType === 'design' || i.type === 'design');
const images  = visibleItems.filter(i => i.contentType !== 'design' && i.type !== 'design');

// thumb 渐变按 id hash 分配
const gradients = ['tw-g1','tw-g2','tw-g3','tw-g4','tw-g5','tw-g6','tw-g7','tw-g8'];
function thumbClass(item) {
  const h = String(item.id || item.projectId || item.name || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  return gradients[h % gradients.length];
}
function sourceBadge(item) {
  if (item.source === 'chat') return '<span class="source-badge s-chat">来自对话</span>';
  if (item.source === 'midtai') return '<span class="source-badge s-mid">来自中台</span>';
  return '<span class="source-badge s-blank">空白</span>';
}
function cardHtml(item) {
  const action = isReplace
    ? `<button class="btn-red" style="width:100%;margin-top:4px" onclick="insertToDesign('${escapeHtml(String(item.thumbnail||item.name||item.id))}')">✓ 选用此图</button>`
    : `<button class="btn-secondary" style="width:100%;margin-top:4px" onclick="openCanvas('${escapeHtml(String(item.name||'Untitled Design'))}')">打开编辑</button>`;
  return `<div class="design-wcard">
    <div class="design-wcard-thumb ${thumbClass(item)}"></div>
    <div class="design-wcard-footer">
      <div class="design-wcard-title">${escapeHtml(String(item.name||'Untitled'))}</div>
      <div class="design-wcard-meta">
        ${item.version ? `<span class="ver-badge">${escapeHtml(String(item.version))}</span>` : ''}
        ${sourceBadge(item)}
      </div>
      ${action}
    </div>
  </div>`;
}

let html = '';
if (!isReplace && designs.length) {
  html += `<div class="design-works-grid" style="margin-bottom:${images.length?'20px':'0'}">${designs.map(cardHtml).join('')}</div>`;
}
if (images.length) {
  html += `<div class="img-works-grid">${images.map(cardHtml).join('')}</div>`;
}
if (!designs.length && !images.length) {
  html = `<div class="midtai-card">
    <div class="midtai-card-title">${isReplace ? '还没有可用图片' : '还没有作品'}</div>
    <div class="midtai-card-copy">${isReplace ? '先去生成预览或打开已有图片，再回来替换。' : '先去生成预览创建设计稿，再回来看这里。'}</div>
    <div class="midtai-card-meta"><span class="midtai-card-badge">${isReplace ? 'Replace' : 'Empty'}</span></div>
  </div>`;
}
grid.innerHTML = html;
```

注意：把 `grid.innerHTML = visibleItems.map(...)` 的整段替换为上面这段；保持函数开头的 `if (!visibleItems.length)` early-return 逻辑不变（改为只在 designs+images 都为空时显示空态）。

**Test:** `npm test && npm run check && npm run build && npm run build:electron`

然后运行 JS 语法检查：
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
1. 生成一个设计稿后退出画布
2. 切到「我的作品」→ 设计卡片有渐变色 thumb，hover 有浮起效果
3. 版本徽章显示为深色背景白字（如 `v1`）
4. 来源徽章：来自对话=蓝色，来自中台=黄色，空白=灰色
5. 搜索功能仍正常
6. Replace 模式下只显示图像，按钮文案为「✓ 选用此图」

## Risk Points

- Risk: `visibleItems` 里 contentType / type 字段名与 host 推送的不一致
  Guard: 打 `console.log(midtaiState.libraryItems[0])` 确认字段名，必要时同时检查 `item.type === 'design'` 和 `item.contentType === 'design'`
- Risk: grid 从 `.midtai-card-grid` 变为 `.design-works-grid`，但 `renderMidtaiWorks` 里用 `querySelector('.midtai-card-grid')` 查找 grid 容器
  Guard: grid 容器仍是 `.midtai-card-grid`（外层 div），只有 `grid.innerHTML` 里面放 `.design-works-grid` 子 grid——不要改容器 class

## High-Risk Files Touched

- `electron/renderer/index.html` — CSS 新增（安全）、renderMidtaiWorks grid 渲染逻辑替换

## Reference (only load if stuck)

- 原型参考：`.kiro/midtai-prototype-v2.html` — `design-wcard`、`img-works-grid`、`design-works-grid` 相关样式
- Beads: `bd show vscode-extension-o6a`

## Definition of Done

- [ ] 设计卡片显示 130px 渐变 thumb
- [ ] hover 有浮起 + 阴影效果
- [ ] 版本徽章深色背景
- [ ] 来源徽章按 chat/midtai/空白 显示不同颜色
- [ ] 图像/设计分开 grid 列宽
- [ ] Replace 模式只显示图像
- [ ] JS 语法检查通过
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
