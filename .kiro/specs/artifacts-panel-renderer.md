# Spec: Artifacts 面板渲染（PR3）

**状态**：草稿，待 Codex 技术评审  
**作者**：Claude（PM 角色）  
**评审**：Codex（技术可行性）  
**日期**：2026-05-01  
**版本**：v4（修订：clearChat 不删历史 registry、SVG 不转义直接注入、artifact push 移至 append 成功后、测试拆两条）  
**前置依赖**：PR2（`src/artifacts/` 数据层已实现）

---

## 一、问题背景

PR2 定义并实现了产物数据模型（`ArtifactObject`、`InMemoryArtifactRegistry`、`detectArtifact()`），但尚未接入对话流，也没有渲染 UI。

当前状态：
- LLM 产出的 HTML 原型、SVG 图表、Mermaid 架构图、代码块全部以纯文字气泡渲染
- `detectArtifact()` 存在但从未被调用
- `InMemoryArtifactRegistry` 存在但没有实例

PR3 的目标是把数据层接入对话管道，并在右侧弹出一个专用面板来渲染产物内容。

---

## 二、目标

1. 在 `sendPrompt()` 完成后自动检测产物并注册
2. 将 `artifactState` 作为结构化字段并入主 `postState()` 状态负载，使渲染器在任何重绘时都能正确恢复面板状态
3. 渲染器右侧展示 Artifacts 面板：html/svg/mermaid 用 iframe sandbox，code 用 plain code block
4. 面板提供关闭按钮；html 类产物显示"进入 Deep Design"占位按钮
5. 注册表按 sessionId 隔离（`Map<sessionId, InMemoryArtifactRegistry>`），会话切换时自动恢复对应会话的 artifact 状态

**明确不在范围内**：
- Deep Design 功能实际跳转（PR5 负责）
- markdown artifact 渲染（PR2 detector 不产出 markdown，PR3 不实现）
- 代码语法高亮（当前 renderer 无 Prism/highlight.js，降为 plain code block）
- 多产物历史导航 UI
- mermaid.js 本地 bundling（V1 使用 CDN）
- 产物跨会话持久化

---

## 三、方案设计

### 3.1 状态归属与作用域

**根本原则**：renderer 以 `state` 消息为唯一真源，每次 `postState()` 都会全量重绘 UI。artifact 面板状态必须随 `state` 一起传递，不能靠独立旁路事件维护。

**作用域**：artifact 状态是**进程内、每会话的内存态**：
- 不是全局单例 registry（会导致跨会话泄漏）
- 不写入 SessionRepository 或磁盘（不跨 app 重启持久化）
- 用 `Map<sessionId, InMemoryArtifactRegistry>` 存储——切换到任何会话，都能恢复该会话已检测到的产物；app 重启后内存清空

**postState() 新增字段**：

```typescript
// postState() payload 新增
artifactState: {
  activeArtifact: ArtifactObject | null;  // 面板当前展示的产物（完整对象）
  activeArtifactId: string | null;        // 冗余 ID，供 renderer 做 === 比较优化
  artifactCount: number;                  // 当前会话已检测到的产物总数（供未来历史导航）
}
```

移除 v2 的 `artifact:update` 独立消息——不再需要旁路通道。

Renderer 在任何时刻（初次加载、reload、会话切换）只需读取 `state.artifactState.activeArtifact` 即可正确渲染或隐藏面板。

### 3.2 整体数据流

```
sendPrompt() streaming 完成
  │
  ├─ detectArtifact(finalText) → artifact 或 null（纯函数，无副作用）
  │
  ├─ appendAssistantMessageToSession()
  │    └─ postState() ────────────────────────► { type: "state", ..., artifactState: { activeArtifact: null（此时尚未 push）} }
  │
  └─ 若检测到产物：
       ├─ registryForSession(currentSessionId).push(artifact)
       └─ postState() ────────────────────────► { type: "state", ..., artifactState: { activeArtifact: ArtifactObject, ... } }
                                                   │
                                                   └─ Renderer 读取 artifactState.activeArtifact，展开面板

用户点击关闭按钮
  Renderer ─► { type: "artifact:dismiss" } ─► Main
                                              ├─ registryForSession(currentSessionId).dismiss()
                                              └─ postState() ──────────────► { type: "state", ..., artifactState: { activeArtifact: null, ... } }

会话切换（currentSessionId 变更）
  └─ postState() ─────────────────────────────► artifactState 自动反映新会话的 registry 状态
                                                 （新会话 registry 为空 → activeArtifact: null；
                                                   历史会话有产物 → 恢复对应 activeArtifact）

clearChat()（新建对话）
  └─ postState() ─────────────────────────────► artifactState 反映新 sessionId 的 registry（空），activeArtifact: null
     旧 sessionId 的 registry 保留在 Map 中，用户切回该会话时仍可恢复
```

### 3.3 集成点：ElectronChatPanel.ts

**3.3.1 新增字段**（构造函数初始化）

```typescript
// per-session registry map；会话从不存在时视为空 registry
private readonly artifactRegistries = new Map<string, InMemoryArtifactRegistry>();

private getArtifactRegistry(sessionId: string): InMemoryArtifactRegistry {
  let registry = this.artifactRegistries.get(sessionId);
  if (!registry) {
    registry = new InMemoryArtifactRegistry();
    this.artifactRegistries.set(sessionId, registry);
  }
  return registry;
}
```

**3.3.2 postState() 扩展**

在现有 `sendToRenderer({ type: "state", ... })` 的 payload 中增加：

```typescript
artifactState: (() => {
  const registry = this.currentSessionId
    ? this.getArtifactRegistry(this.currentSessionId)
    : null;
  const active = registry?.activeArtifact ?? null;
  return {
    activeArtifact: active,
    activeArtifactId: active?.id ?? null,
    artifactCount: registry?.artifacts.length ?? 0,
  };
})(),
```

`activeArtifact` getter（`artifacts.find(a => a.id === activeArtifactId) ?? null`）若 PR2 未导出，由 PR3 在 `InMemoryArtifactRegistry` 中补充。

**3.3.3 sendPrompt() 钩子**

检测（无副作用）在 `appendAssistantMessageToSession()` 之前，push 在 **append 成功之后**，避免"面板有产物但消息未落盘"的错位：

```typescript
// Step 1：检测（纯函数，无副作用）
const detectedArtifact = detectArtifact(finalText);
// sourceMessageId 刻意不传：requestSessionId 是会话 ID 而非消息 ID，V1 留 undefined

// Step 2：正常 append（内部会调用 postState，此时 artifact 尚未 push）
await appendAssistantMessageToSession(requestSessionId, assistantMessage);

// Step 3：append 成功后再 push，然后再次 postState 让 renderer 感知到新产物
if (detectedArtifact && this.currentSessionId) {
  this.getArtifactRegistry(this.currentSessionId).push(detectedArtifact);
  await this.postState();
}
```

注：有产物的轮次会触发两次 `postState()`（append 时一次，push 后一次）。这是可以接受的，优先保证消息和产物的一致性。

**3.3.4 clearChat()（新建对话）**

clearChat() 的真实语义是"创建新会话并切过去"，旧会话仍在会话列表中。**不删除旧会话的 registry**，用户切回旧会话时可恢复该会话的产物。

无需在 clearChat() 中添加任何 artifact 相关代码。新 sessionId 对应的 registry 不存在，`getArtifactRegistry()` 首次调用时自动创建空实例，postState() 自然返回 `activeArtifact: null`。

注：Map 永不主动清除。进程重启后内存清空，产物历史天然丢失（与"不跨重启持久化"的设计一致）。

**3.3.5 artifact:dismiss IPC 处理**

在现有消息分支中新增：

```typescript
case "artifact:dismiss":
  if (this.currentSessionId) {
    this.getArtifactRegistry(this.currentSessionId).dismiss();
  }
  await this.postState();
  return;
```

### 3.4 IPC 消息契约

| 方向 | type | payload | 触发时机 |
|---|---|---|---|
| Main → Renderer | `state`（已有，扩展） | 新增 `artifactState: { activeArtifact, activeArtifactId, artifactCount }` | postState() 全量重绘（检测到产物、dismiss、clearChat、会话切换、ready 时均触发） |
| Renderer → Main | `artifact:dismiss` | — | 用户点击面板关闭按钮 |

`artifact:update` 独立消息不存在——所有状态更新通过 `state` 全量负载同步。

### 3.5 面板布局

面板在 `electron/renderer/index.html` 中新增，默认隐藏。`state.artifactState.activeArtifact` 非 null 时展开，null 时收起。

布局规则：
- 无产物：单列聊天，宽度不变
- 有产物：两列布局，聊天区左，产物面板右（约 45% 宽）
- 面板最小宽度：480px；如视口宽度 < 960px，由 Codex 实现时决定覆盖或折叠策略

面板结构（伪代码）：

```html
<div id="artifacts-panel" class="artifacts-panel hidden">
  <div class="artifacts-panel__header">
    <span class="artifacts-panel__title"><!-- artifact.title --></span>
    <span class="artifacts-panel__type-badge"><!-- artifact.type --></span>
    <button class="artifacts-panel__deep-edit hidden">进入 Deep Design</button>
    <button class="artifacts-panel__close">✕</button>
  </div>
  <div class="artifacts-panel__content">
    <!-- 根据 type 渲染 iframe 或 code block -->
  </div>
</div>
```

### 3.6 渲染规则（PR3 实际支持的类型）

PR2 detector 在 V1 只产出 html / svg / mermaid / code 四种类型。markdown 不在 PR3 渲染范围。

| type | 渲染方式 | 注入方式 |
|---|---|---|
| `html` | `<iframe sandbox="allow-scripts" srcdoc="…">` | 原始内容直接作为 srcdoc（html artifact 本就是用户信任的完整 HTML） |
| `svg` | `<iframe sandbox="allow-scripts" srcdoc="<!DOCTYPE html><html><body style='margin:0'>${content}</body></html>">` | **SVG 内容不转义**，作为 HTML body 内容直接注入；浏览器将 `<svg>` 渲染为图形而非文字 |
| `mermaid` | `<iframe sandbox="allow-scripts" srcdoc="…mermaid CDN…">` | **必须 HTML 转义后**注入 `<div class="mermaid">` 内，见 3.7 节 |
| `code` | `<pre><code>${htmlEscape(content)}</code></pre>`（plain，无语法高亮） | 代码内容 HTML 转义，渲染为文字 |

**SVG 与 Mermaid 的注入差异**：
- SVG 需要作为 **HTML 标记**注入 body，浏览器才能渲染图形；转义后变成文字显示，无法渲染
- Mermaid 需要作为 **文本内容**注入 div，由 mermaid.js 解析；不转义则 `</div><script>` 会逃逸出 div 成为可执行脚本
- html artifact 的脚本执行是有意为之（用户 HTML 原型需要 JS 运行）；svg artifact 中若有 `<script>` 同样会在 null-origin iframe 内执行，sandbox 的隔离保证了对宿主页面无害

`markdown` 和未知类型：不渲染，面板不展开（防御性处理）。

### 3.7 Mermaid srcdoc 模板与转义规则

**必须对 mermaid 内容进行 HTML 转义后再插入 srcdoc。**

直接字符串插值（如 `<div>${content}</div>`）会让含 `</div><script>` 的 mermaid 内容逃逸出 div 并在 iframe 内执行脚本。对 html artifact 这是有意为之（用户 HTML 完整运行），但 mermaid artifact 不应有此能力。

```html
<!-- srcdoc 模板，content 已经过 htmlEscape() 处理 -->
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<style>body { margin: 0; padding: 16px; }</style>
</head>
<body>
<div class="mermaid">${htmlEscape(artifact.content)}</div>
<script>mermaid.initialize({ startOnLoad: true, theme: 'default' });</script>
</body>
</html>
```

`htmlEscape()` 至少替换：`&`→`&amp;`、`<`→`&lt;`、`>`→`&gt;`、`"`→`&quot;`、`'`→`&#39;`。

注：mermaid 渲染依赖网络 CDN，离线环境下内容为空白。V2 可替换为本地 bundle。

### 3.8 Deep Edit 按钮

- 仅在 `canArtifactUseDeepEdit(artifact.type)` 返回 true（即 type === "html"）时显示
- V1 行为：点击后在面板内显示 toast "Deep Design 功能即将推出"，不跳转
- PR5 将替换此行为，连接 Design Lab

---

## 四、文件变更范围

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `electron/ElectronChatPanel.ts` | **修改** | 新增 `artifactRegistries: Map`、`getArtifactRegistry()` 方法；sendPrompt 钩子（append 后 push）；postState 扩展（加 artifactState）；artifact:dismiss IPC 处理（约 30 行，不改动 clearChat） |
| `electron/renderer/index.html` | **修改** | 新增面板 HTML、CSS（两列布局）、JS（读 state.artifactState、渲染 iframe/plain code、关闭按钮、Deep Edit 占位 toast） |
| `electron/ElectronChatPanel.test.ts` | **修改** | 新增产物检测集成测试（见第五节） |

变更文件数：3，在 AGENTS.md 的 8 文件警戒线内。

若 PR2 `InMemoryArtifactRegistry` 缺 `activeArtifact` getter，需同步修改 `src/artifacts/artifactRegistry.ts`（+1 文件，仍在警戒线内）。

**不涉及以下文件**：
- `src/artifacts/artifactDetector.ts` / `artifactObject.ts` — 保持不变
- `src/imageGeneration/` — 保持不变

---

## 五、测试要求

### 5.1 ElectronChatPanel 集成测试

```
状态同步：
- sendPrompt() 完成后，HTML 响应触发 artifactRegistry.push()，postState() 的 payload 含 activeArtifact 非 null
- sendPrompt() 完成后，纯文字响应（无 html/svg/mermaid/code 标记）不触发 push，postState() 的 activeArtifact 为 null
- 处理 artifact:dismiss 后，postState() 的 activeArtifact 为 null

会话隔离（关键）：
- clearChat() 后（currentSessionId 指向新会话），postState() 的 artifactState.activeArtifact 为 null
- 切换到**有产物**的历史会话后，postState() 的 artifactState.activeArtifact 为该会话的最后一个活跃产物（非 null）
- 切换到**无产物**的会话后，postState() 的 artifactState.activeArtifact 为 null

状态恢复：
- renderer ready 事件触发 postState() 时，若注册表有 activeArtifact，state 中包含该产物
- dismiss 后收到新的 HTML 响应，postState() 的 activeArtifact 再次非 null（面板重新展开）
```

**测试模式**：mock `sendToRenderer`，捕获 `state` 消息的 `activeArtifact` 字段，不涉及真实渲染。

### 5.2 不在 PR3 测试范围

- iframe 实际渲染正确性（需浏览器环境）
- Mermaid CDN 渲染（需网络）
- Deep Edit 按钮最终行为（PR5 负责）

---

## 六、验收标准

- [ ] `postState()` 的 payload 包含 `artifactState: { activeArtifact, activeArtifactId, artifactCount }`
- [ ] `sendPrompt()` 完成后，HTML/SVG/Mermaid/code 响应自动注册产物并体现在 state.artifactState 中
- [ ] 纯文字回复（含 `prompt_rewrite` 结果）不注册产物，state.artifactState.activeArtifact 为 null
- [ ] html 类型产物用 `sandbox="allow-scripts"` 的 iframe 渲染，不含 `allow-same-origin`
- [ ] mermaid content 经 HTML 转义后插入 srcdoc，不直接字符串插值
- [ ] code 类型产物用 plain `pre/code` 渲染（不要求语法高亮）
- [ ] markdown 和未知类型不渲染，面板不展开
- [ ] 面板关闭按钮正确工作，postState() 后 activeArtifact 为 null
- [ ] html 类型产物显示"进入 Deep Design"按钮，点击显示 toast 占位
- [ ] 非 html 类型不显示"进入 Deep Design"按钮
- [ ] clearChat() 后面板收起（新 sessionId 无 registry，activeArtifact 为 null）
- [ ] 切换到有产物的历史会话后，panel 恢复展示该会话的活跃产物
- [ ] 切换到无产物的会话后，panel 隐藏（不展示前一会话的产物）
- [ ] 5.1 全部测试通过
- [ ] `npm run build` 通过，无 TypeScript 报错

---

## 七、风险与约束

| 风险 | 缓解措施 |
|---|---|
| Map 内存持续增长（用户在同一 app 进程中切换大量历史会话） | V1 可接受；V2 可在 Map 条目超过阈值时 LRU 淘汰老会话 registry |
| mermaid CDN 离线失败 | V1 可接受，面板显示但内容空白；V2 本地 bundle 替换 |
| mermaid content 注入 XSS | 已在 3.7 节明确 htmlEscape() 规则，验收标准包含此项 |
| iframe sandbox 限制用户 HTML 功能 | allow-forms / allow-top-navigation 故意禁止；用户如需完整运行应在外部浏览器打开（未来可添加"在浏览器中打开"按钮） |
| postState() payload 扩展破坏 renderer 现有字段读取 | activeArtifact 是新增字段，renderer 新代码读它，旧代码不感知；无破坏性变更 |
| ElectronChatPanel.ts 已 3530 行 | 约 30 行改动，严格限制在 4 处：字段声明、sendPrompt 钩子、postState 扩展、clearChat/dismiss 处理 |

---

## 八、与 AGENTS.md 的对齐检查

- ✅ `ElectronChatPanel.ts` 改动 ≤ 30 行（字段声明、sendPrompt 钩子、postState 扩展、dismiss 处理），不改动 clearChat()
- ✅ 变更文件数 3（最多 4），在警戒线内
- ✅ artifact 状态以 postState() 主状态为真源，不引入第二套同步机制
- ✅ 不触碰 `src/imageGeneration/`、`extension.ts`、`licenseManager.ts`
- ✅ 复用 PR2 数据层，不重复定义类型
- ✅ 复用现有 IPC 机制（postState → state 消息）

---

## 九、下游 PR 依赖关系

```
PR3（本 spec）→ PR5（Deep Design 桥接：替换 Deep Edit 按钮占位行为）
PR4（derive_artifact：图片 → HTML 原型）并行，不依赖 PR3 UI
```

---

## 十、未来可选增强（不在本 spec 范围）

- **mermaid 本地 bundle**：消除 CDN 依赖
- **代码语法高亮**：引入 Shiki 或 highlight.js，替换 plain code block
- **markdown artifact 渲染**：当 detector 支持 markdown 输出后，补充 PR3 渲染分支
- **多产物历史导航**：面板内"←上一个/下一个→"控件
- **面板宽度拖拽**：用户可调整聊天区/产物面板比例
- **在浏览器中打开**：绕过 iframe sandbox，在外部浏览器完整运行 html artifact
- **sourceMessageId 补全**：待消息模型有稳定 UUID 后，将 push() 调用改为传入消息 ID
