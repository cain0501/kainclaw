# Primer: vscode-extension-pmh
## Design Home UI 升级 — 卡片预览缩略图 + 全网格布局

### 背景

当前 Design Home 卡片预览区只有几条横线（"就一个框框"），视觉区分度低。
已确认方向：每张卡片用 CSS 绘制迷你页面缩略图（导航栏 + 主视觉区），
"所有设计"改为网格（与最近浏览统一），并在卡片上增加悬浮删除按钮。

参考原型：`E:\claudecodejingiang\design-home-prototype.html`（v2，直接在浏览器打开对照）

---

### 改动范围

全部改动在 `electron/renderer/index.html`，三处：

1. **CSS 区**（当前 `line ~152-248`）  
2. **`renderDesignHome()` 函数**（当前 `line 2583-2744`）  
3. **HTML DOM 区 `#design-home-all` 容器**（当前 `line 1066`）

---

### 具体要做的事

#### A. 替换 `miniLines()` → `miniPageThumb()`

删掉现有 `miniLines(project)` 函数，换成 `miniPageThumb(project)`，生成如下结构：

```html
<!-- 整体高度固定 108px，overflow:hidden -->
<div class="design-home-thumb" aria-hidden="true">
  <!-- 迷你导航栏（高度 14px） -->
  <div class="dht-nav">
    <div class="dht-logo"></div>
    <div class="dht-nav-links">
      <div class="dht-bar w20"></div>
      <div class="dht-bar w16"></div>
      <div class="dht-bar w18"></div>
    </div>
    <div class="dht-btn"></div>
  </div>
  <!-- 主视觉区 -->
  <div class="dht-hero">
    <div class="dht-bar heading w70"></div>
    <div class="dht-bar w50"></div>
    <div class="dht-bar w40"></div>
    <div class="dht-btns">
      <div class="dht-pill"></div>
      <div class="dht-pill ghost"></div>
    </div>
  </div>
  <!-- 底部特性格 -->
  <div class="dht-features">
    <div class="dht-feat-card"></div>
    <div class="dht-feat-card"></div>
    <div class="dht-feat-card"></div>
  </div>
</div>
```

颜色用现有 `previewTone(project)` 产生的渐变背景，条块颜色复用 `previewLineColor(project).strong/.soft`。

**CSS 类定义（加在现有 `.design-home-card-line` 相关 CSS 旁边）：**

```css
.design-home-thumb{position:absolute;inset:0;overflow:hidden}
.dht-nav{height:14px;padding:0 8px;display:flex;align-items:center;gap:4px;background:rgba(0,0,0,.08)}
.dht-logo{width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.45);flex-shrink:0}
.dht-nav-links{flex:1;display:flex;gap:4px;margin-left:6px}
.dht-btn{width:22px;height:8px;border-radius:3px;background:rgba(255,255,255,.35);flex-shrink:0}
.dht-hero{padding:10px 10px 6px;display:flex;flex-direction:column;gap:4px}
.dht-features{padding:0 8px;display:flex;gap:5px}
.dht-feat-card{flex:1;height:16px;border-radius:4px;background:rgba(255,255,255,.15)}
.dht-bar{height:5px;border-radius:999px}
.dht-bar.heading{height:8px}
.dht-bar.w70{width:70%}
.dht-bar.w50{width:50%}
.dht-bar.w40{width:40%}
.dht-bar.w20{width:20%}
.dht-bar.w16{width:16%}
.dht-bar.w18{width:18%}
.dht-btns{display:flex;gap:5px;margin-top:4px}
.dht-pill{width:28px;height:8px;border-radius:3px;background:rgba(255,255,255,.38)}
.dht-pill.ghost{background:transparent;border:1px solid rgba(255,255,255,.3)}
```

`miniPageThumb(project)` 实现：

```js
const miniPageThumb = project => {
  const colors = previewLineColor(project);
  return `
    <div class="design-home-thumb" aria-hidden="true">
      <div class="dht-nav">
        <div class="dht-logo" style="background:${colors.strong}"></div>
        <div class="dht-nav-links">
          <div class="dht-bar w20" style="background:${colors.soft}"></div>
          <div class="dht-bar w16" style="background:${colors.soft}"></div>
          <div class="dht-bar w18" style="background:${colors.soft}"></div>
        </div>
        <div class="dht-btn" style="background:${colors.strong}"></div>
      </div>
      <div class="dht-hero">
        <div class="dht-bar heading w70" style="background:${colors.strong}"></div>
        <div class="dht-bar w50" style="background:${colors.soft}"></div>
        <div class="dht-bar w40" style="background:${colors.soft}"></div>
        <div class="dht-btns">
          <div class="dht-pill" style="background:${colors.strong}"></div>
          <div class="dht-pill ghost" style="border-color:${colors.soft}"></div>
        </div>
      </div>
      <div class="dht-features">
        <div class="dht-feat-card" style="background:${colors.soft}"></div>
        <div class="dht-feat-card" style="background:${colors.soft}"></div>
        <div class="dht-feat-card" style="background:${colors.soft}"></div>
      </div>
    </div>
  `;
};
```

然后在 `recentCard()` 里，把 `${miniLines(project)}` 换成 `${miniPageThumb(project)}`。
删掉旧的 `miniLines` 函数和相关 CSS（`.design-home-card-lines`, `.design-home-card-line` 等）。

---

#### B. "所有设计"改为网格 + 卡片样式

1. 修改 DOM（line 1066）：

```html
<!-- 旧 -->
<div id="design-home-all" class="design-home-list"></div>
<!-- 新 -->
<div id="design-home-all" class="design-home-all-grid"></div>
```

2. 新增 CSS：

```css
.design-home-all-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
```

3. 在 `renderDesignHome()` 里，把 `allRow(project)` 模板改为卡片样式（与 `recentCard` 基本相同），
   并在卡片操作按钮区同时包含重命名和删除（两个都要）。

4. 在 `allEl.innerHTML` 前面插入一个"新建设计"卡片：

```js
const newCard = `
  <button class="design-home-card design-home-new-card"
    onclick="createNewDesignProject()"
    title="${isEnglishUi() ? 'New design' : '新建设计'}">
    <div class="design-home-card-preview design-home-new-preview">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
    <div class="design-home-card-body">
      <div class="design-home-card-name">${isEnglishUi() ? 'New Design' : '新建设计'}</div>
    </div>
  </button>
`;
allEl.innerHTML = newCard + sortedProjects.map(allCard).join('');
```

新增 CSS：

```css
.design-home-new-card{border-style:dashed;border-color:#d8cfc4}
.design-home-new-card:hover{border-color:#b8a898}
.design-home-new-preview{display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.025);color:#b0a090}
```

5. 把现有 `allRow` 函数改名为 `allCard`，内容改成与 `recentCard` 同款卡片（复用同一模板即可），
   同时带重命名+删除两个按钮。

---

#### C. 卡片悬浮操作按钮（hover 时可见）

现有 recentCard 已有重命名按钮，但 hover 显示靠 `btn-ghost` 样式控制。
确认 recentCard 也有删除按钮（如果没有，加上）：

```html
<!-- recentCard body 右上角操作区 -->
<div style="display:flex;gap:3px">
  <button class="btn-ghost" onclick="event.stopPropagation(); renameDesignProjectFromHome(...)">✎</button>
  <button class="btn-ghost" onclick="event.stopPropagation(); deleteDesignProjectFromHome(...)">✕</button>
</div>
```

---

### 不改的部分

- 搜索框、topbar、empty state、pill 徽章、`formatRelativeTime`/`formatListTime`、IPC 逻辑 — 不动
- `createNewDesignProject` 函数应该已存在（由 primer vscode-extension-a4o 相关逻辑覆盖），如不存在则新建，逻辑就是调用现有"新建设计"按钮的 onclick
- 删除和重命名函数 `deleteDesignProjectFromHome` / `renameDesignProjectFromHome` 由 vscode-extension-a4o 已实现，不重复实现

---

### 验收

```
1. Design Home 打开后，每张卡片预览区有迷你导航栏 + 主视觉区（不再是单纯横线）
2. "所有设计"区是网格卡片，不再是列表行
3. "所有设计"首格是「新建设计」虚线卡片，点击可新建
4. 卡片上悬浮可见 ✎（重命名）和 ✕（删除）两个操作按钮
5. 现有 ✓ 的功能（打开项目 / 删除 / 重命名 / 版本徽章）均不受影响
```

### 完成后

```bash
npm run build:electron
bd close vscode-extension-pmh
git add electron/renderer/index.html
git commit -m "Design Home: mini-page thumbnails + all-grid layout"
git push
```
