# Primer: vscode-extension-b8n
## Chat Artifact 面板持久化：关闭可恢复 + 多版本导航

### 背景

当前关闭 Artifact 面板会调用 `artifact:dismiss`，彻底清除 activeArtifactId。
关闭后无法恢复，同一对话多次生成的 artifact 也无法切换。

---

### 改动范围

**electron/ElectronChatPanel.ts**（3 处）
**electron/renderer/index.html**（CSS + DOM + JS）

---

### 第一部分：后端改动（ElectronChatPanel.ts）

#### 1. postState 增加 `artifacts` 列表和 `artifactPanelCollapsed` 字段

找到 `artifactState:` 对象（约 line 4435），改为：

```ts
artifactState: {
  activeArtifact,
  activeArtifactId: activeArtifact?.id ?? null,
  artifactCount: currentArtifactRegistry?.artifacts.length ?? 0,
  artifacts: currentArtifactRegistry?.artifacts.map(a => ({
    id: a.id,
    title: a.title || 'Artifact',
    type: a.type,
  })) ?? [],
  artifactPanelCollapsed: currentRuntimeState?.artifactPanelCollapsed ?? false,
},
```

`currentRuntimeState` 是当前 session 的 runtimeState（参考附近的 `designState` 写法，用 `this.sessions.getRuntimeState(sessionId)` 或已有变量）。

#### 2. 新增 `artifact:collapse` IPC handler

在 `artifact:dismiss` handler（约 line 829）后面加：

```ts
if (type === "artifact:collapse") {
  if (this.currentSessionId) {
    const rt = await this.sessions.getRuntimeState(this.currentSessionId) || {};
    rt.artifactPanelCollapsed = true;
    await this.sessions.saveRuntimeState(this.currentSessionId, rt);
  }
  await this.postState();
  return;
}
```

#### 3. 新增 `artifact:setActive` IPC handler

```ts
if (type === "artifact:setActive") {
  const id = typeof message.id === "string" ? message.id.trim() : "";
  if (id && this.currentSessionId) {
    const registry = this.getArtifactRegistry(this.currentSessionId);
    registry.setActive(id);
    const rt = await this.sessions.getRuntimeState(this.currentSessionId) || {};
    rt.artifactPanelCollapsed = false;
    await this.sessions.saveRuntimeState(this.currentSessionId, rt);
  }
  await this.postState();
  return;
}
```

#### 4. 当有新 artifact push 时清除 collapsed 状态

找到调用 `registry.push(artifact)` 的地方，push 之后加：

```ts
const rt = await this.sessions.getRuntimeState(this.currentSessionId) || {};
rt.artifactPanelCollapsed = false;
await this.sessions.saveRuntimeState(this.currentSessionId, rt);
```

（注意：`sessions.getRuntimeState` / `saveRuntimeState` 的具体调用方式参照文件里已有的调用，保持一致）

---

### 第二部分：Renderer 改动（electron/renderer/index.html）

#### 5. 新增 CSS

在 `.artifacts-panel` 相关 CSS 块（约 line 19）后面加：

```css
.artifact-peek-strip{width:20px;flex-shrink:0;background:rgba(255,255,255,.72);border-left:1px solid #e4e4e7;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:6px;transition:background .12s}
.artifact-peek-strip:hover{background:#f4f4f5}
.artifact-peek-strip.visible{display:flex}
.artifact-peek-strip-label{writing-mode:vertical-rl;text-orientation:mixed;font-size:10px;font-weight:600;color:#71717a;letter-spacing:.06em;user-select:none}
.artifacts-panel-footer{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-top:1px solid #e4e4e7;background:#fafafa}
.artifact-nav-btn{border:none;background:transparent;color:#71717a;cursor:pointer;padding:3px 6px;border-radius:5px;font-size:13px;line-height:1}
.artifact-nav-btn:hover{background:#f0f0f0;color:#18181b}
.artifact-nav-btn:disabled{opacity:.3;cursor:default}
.artifact-nav-label{font-size:11px;color:#71717a;font-weight:600}
```

#### 6. 新增 peek strip DOM

找到 `<aside id="artifacts-panel"` 的前面（约 line 604），在其之前插入：

```html
<div id="artifact-peek-strip" class="artifact-peek-strip" onclick="restoreArtifactPanel()" title="查看预览">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
  <span class="artifact-peek-strip-label">查看预览</span>
</div>
```

#### 7. 在 artifact 面板底部加版本导航

找到 `</aside>` 结束标签（紧跟 `artifacts-panel` 的 aside），在 `<div id="artifacts-panel-content">` 后面加：

```html
<div id="artifacts-panel-footer" class="artifacts-panel-footer" style="display:none">
  <button class="artifact-nav-btn" id="artifact-nav-prev" onclick="navigateArtifact(-1)">‹</button>
  <span class="artifact-nav-label" id="artifact-nav-label">v1 / 1</span>
  <button class="artifact-nav-btn" id="artifact-nav-next" onclick="navigateArtifact(1)">›</button>
</div>
```

#### 8. 修改 `dismissArtifactPanel` 函数

找到 `function dismissArtifactPanel()` （约 line 3226），改为：

```js
function dismissArtifactPanel() {
  send({ type: 'artifact:collapse' });
}
```

#### 9. 新增 `restoreArtifactPanel` 和 `navigateArtifact` 函数

在 `dismissArtifactPanel` 函数后面加：

```js
function restoreArtifactPanel() {
  send({ type: 'artifact:setActive', id: appState.artifactState?.activeArtifactId || '' });
}

function navigateArtifact(dir) {
  const artifacts = appState.artifactState?.artifacts || [];
  const currentId = appState.artifactState?.activeArtifactId;
  const idx = artifacts.findIndex(a => a.id === currentId);
  const next = artifacts[idx + dir];
  if (next) {
    send({ type: 'artifact:setActive', id: next.id });
  }
}
```

#### 10. 更新 `renderArtifactPanel` 函数

找到 `function renderArtifactPanel()` （约 line 4230），在函数里修改：

**a. 读取新字段：**
```js
const collapsed = !!appState.artifactState?.artifactPanelCollapsed;
const artifacts = Array.isArray(appState.artifactState?.artifacts) ? appState.artifactState.artifacts : [];
const peekStrip = document.getElementById('artifact-peek-strip');
const footer = document.getElementById('artifacts-panel-footer');
```

**b. 没有 artifact 时：** 保持不变（隐藏面板和 strip）。

```js
if (!artifact) {
  panel.classList.add('hidden');
  resizer.classList.add('hidden');
  if (peekStrip) peekStrip.classList.remove('visible');
  if (footer) footer.style.display = 'none';
  // ... 其他现有清空逻辑不变
  return;
}
```

**c. 有 artifact 但 collapsed：** 显示 strip，隐藏面板。

在 `panel.classList.remove('hidden')` 之前加判断：

```js
if (collapsed) {
  panel.classList.add('hidden');
  resizer.classList.add('hidden');
  if (peekStrip) peekStrip.classList.add('visible');
  if (footer) footer.style.display = 'none';
  return;
}
if (peekStrip) peekStrip.classList.remove('visible');
```

**d. 版本导航 footer：**

在函数末尾（所有 content 渲染后），加：

```js
if (footer) {
  const prevBtn = document.getElementById('artifact-nav-prev');
  const nextBtn = document.getElementById('artifact-nav-next');
  const navLabel = document.getElementById('artifact-nav-label');
  if (artifacts.length > 1) {
    footer.style.display = 'flex';
    const idx = artifacts.findIndex(a => a.id === artifact.id);
    if (navLabel) navLabel.textContent = `v${idx + 1} / ${artifacts.length}`;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= artifacts.length - 1;
  } else {
    footer.style.display = 'none';
  }
}
```

---

### 注意

- `sessions.getRuntimeState` / `sessions.saveRuntimeState` 如果不存在，参考文件里 `saveCurrentSessionRuntimeState` 的实现方式；如果 runtimeState 只通过 `saveCurrentSessionRuntimeState` 维护，把 collapsed 字段加进那个方法的持久化路径里
- artifact:setActive 里的 `postState()` 会把最新 `activeArtifact`（来自 `registry.activeArtifact`）发回 renderer，所以 renderer 不需要额外处理
- 版本导航只显示 `id/title/type`（不含 content），切换时后端通过 `registry.setActive` 找到完整内容再 postState

---

### 验收

```
1. 点面板 ✕ → 面板隐藏，左侧出现竖向「查看预览」细条
2. 点细条 → 面板恢复，内容不丢失
3. 同一对话生成两次 HTML → 面板底部出现 ‹ v1/2 › 箭头，可来回切换
4. 新 artifact 生成时 → 面板自动展开（不保持折叠状态）
```

### 完成后

```bash
npm test
npm run build:electron
bd close vscode-extension-b8n
git add <files> && git commit -m "Artifact panel: collapse/restore strip + version navigation"
git push
```
