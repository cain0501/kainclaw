# Task Primer: vscode-extension-ea5 — 中台图像收藏功能：我的喜欢 Tab

> **Session entry point.** Read this first.

## Task Goal

中台图像结果卡片加收藏按钮，「我的作品」区加「我的喜欢」Tab 展示收藏列表。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

`renderMidtaiImageWorks()`（line ~3420）渲染图像结果卡片，每张卡片有下载/插入/二次编辑/变体按钮，但无收藏按钮。

`imageLabState.resultBatches[]` 存储所有生成结果，每条 item 有 `id`、`src`、`prompt`、`revisedPrompt`。

旧版 `imglab-fav-btn` CSS 类（line ~136）已有样式，`.liked` 状态为红色。

收藏状态存在 renderer 内存中（`imageLabState.likedImageIds = new Set()`），不需要后端持久化（P4 功能，简单实现即可）。

---

## 修改详情

### Fix 1：初始化 likedImageIds

在 `imageLabState` 初始化对象（搜索 `imgSize: '1024x1024'`，line ~1755）里加：

```javascript
likedImageIds: new Set(),
```

### Fix 2：`renderMidtaiImageWorks` 加收藏按钮

在每张图片卡片的 `midtai-img-thumb-wrap` 里，加收藏按钮（叠加在缩略图右上角）：

```javascript
const isLiked = imageLabState.likedImageIds.has(result.id);
// 在 midtai-img-thumb-wrap 的 img 后面加：
`<button class="imglab-fav-btn${isLiked ? ' liked' : ''}" 
  onclick="event.stopPropagation();toggleMidtaiImageLike('${result.id}')" 
  title="${isLiked ? '取消收藏' : '收藏'}">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
</button>`
```

### Fix 3：`toggleMidtaiImageLike` 函数

```javascript
function toggleMidtaiImageLike(id) {
  if (imageLabState.likedImageIds.has(id)) {
    imageLabState.likedImageIds.delete(id);
  } else {
    imageLabState.likedImageIds.add(id);
  }
  renderMidtaiImageWorks();
  // 如果当前在「我的喜欢」tab，也刷新
  if (midtaiState.imgWorksTab === 'liked') renderMidtaiLikedImages();
}
```

### Fix 4：「我的作品」区加 Tab 切换

在 `renderMidtaiImageWorks()` 的 `midtai-works-toolbar` 里，加 Tab 切换（仅在非 replaceCtx 模式下显示）：

```javascript
// 在 toolbar 里，title 后面加：
if (!isReplace) {
  `<div style="display:flex;gap:4px;margin-left:auto">
    <button onclick="switchMidtaiWorksTab('all')" 
      style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid ${midtaiState.imgWorksTab !== 'liked' ? '#c9502e' : '#e5ddd0'};background:${midtaiState.imgWorksTab !== 'liked' ? '#fff5f5' : '#fff'};color:${midtaiState.imgWorksTab !== 'liked' ? '#c9502e' : '#78716c'};cursor:pointer">
      全部
    </button>
    <button onclick="switchMidtaiWorksTab('liked')" 
      style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid ${midtaiState.imgWorksTab === 'liked' ? '#c9502e' : '#e5ddd0'};background:${midtaiState.imgWorksTab === 'liked' ? '#fff5f5' : '#fff'};color:${midtaiState.imgWorksTab === 'liked' ? '#c9502e' : '#78716c'};cursor:pointer">
      我的喜欢 ${imageLabState.likedImageIds.size > 0 ? imageLabState.likedImageIds.size : ''}
    </button>
  </div>`
}
```

### Fix 5：`switchMidtaiWorksTab` 函数

```javascript
function switchMidtaiWorksTab(tab) {
  midtaiState.imgWorksTab = tab;
  renderMidtaiImageWorks();
}
```

### Fix 6：`renderMidtaiLikedImages` — 在 `renderMidtaiImageWorks` 里分叉

在 `renderMidtaiImageWorks()` 里，当 `midtaiState.imgWorksTab === 'liked'` 时，只渲染收藏的图片：

```javascript
const results = [...(imageLabState.resultBatches || [])]
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  .flatMap(batch => batch.items || [])
  .filter(r => midtaiState.imgWorksTab === 'liked' 
    ? imageLabState.likedImageIds.has(r.id) 
    : true);
```

当 `imgWorksTab === 'liked'` 且无收藏时，显示空状态：

```javascript
if (!results.length && midtaiState.imgWorksTab === 'liked') {
  container.innerHTML = `<div class="midtai-empty-view"><div class="midtai-empty-title">还没有收藏的图像</div><div class="midtai-empty-sub">点击图片右上角的心形按钮收藏</div></div>`;
  return;
}
```

### Fix 7：初始化 midtaiState.imgWorksTab

在 `midtaiState` 初始化对象里加：

```javascript
imgWorksTab: 'all',
```

---

## 实现顺序

1. `imageLabState` 加 `likedImageIds: new Set()`
2. `midtaiState` 加 `imgWorksTab: 'all'`
3. 加 `toggleMidtaiImageLike()` 函数
4. 加 `switchMidtaiWorksTab()` 函数
5. 修改 `renderMidtaiImageWorks()` — 加 Tab 切换 + 收藏按钮 + 过滤逻辑

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 图像结果卡片右上角出现心形按钮
2. 点击后变红，再点取消
3. 「我的作品」区出现「全部」/「我的喜欢」Tab
4. 切换到「我的喜欢」只显示已收藏图片

## Definition of Done
- [ ] 图像结果卡片有收藏按钮（心形，右上角叠加）
- [ ] 点击切换收藏状态，已收藏显示红色
- [ ] 「我的作品」有「全部」/「我的喜欢」Tab
- [ ] 「我的喜欢」Tab 只显示已收藏图片
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
