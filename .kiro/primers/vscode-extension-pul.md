# Primer: vscode-extension-pul
# artifact 入库 + version sync（用户主动触发）

## 前置条件

依赖 A（by7）、B（jns）、C（04q）、入口（317）全部完成。

现状：
- 设计 session 里 LLM 生成 `<artifact>` HTML，host 把它作为 assistant message 存入 session（`result.rawOutput`）
- `handleDesignChatLane()` 在 artifact 结果时调用了 `saveDesignVersion()`，但这是**自动**调用的，违反了产品决策
- 产品决策：**不自动入库**，用户主动点「进入 KainClaw Design」才触发首次入库

---

## 产品决策（已确认）

### 核心原则：没有保存确认不进数据库

会话中生成的 artifact 只存在 chat 消息历史里的 HTML 快照，不自动写入 `designProjectStore`。
用户主动点「进入 KainClaw Design」才触发首次入库。

### 连续生成多版的行为

```
会话里生成 v1 → v2 → v3
三个都只是 chat 消息里的 HTML 快照
用户点 v2 的「进入 KainClaw Design」
→ 只有 v2 入库，v1/v3 继续只是快照
```

### artifact 版本同步

入库后，chat artifact 面板显示该 project 的最新 active version（不是生成时的快照）。
实现：入库时把 `projectId` 写入 chat message metadata，渲染时从 `designProjectStore` 取最新 active version。

### 删除 project 后的行为

- 入库前被删：不存在，快照还在 chat 消息历史里
- 入库后 project 被删：artifact 面板显示「此设计已删除」占位提示，不报错、不崩溃

---

## 对比参考：Open Design 的存储方式

Open Design 每个 artifact 是独立 project 目录：
```
.od/projects/{uuid}/
  {slug}.html              ← artifact HTML
  {slug}.html.artifact.json  ← 元数据
```

`artifact.json` 关键字段：
```json
{
  "version": 1,
  "kind": "html",
  "title": "职场新人第一年 — 小红书图文 9 张",
  "entry": "xhs-workplace-year-one.html",
  "status": "complete",
  "sourceSkillId": "blog-post",
  "designSystemId": "xiaohongshu",
  "metadata": {
    "identifier": "xhs-workplace-year-one",
    "artifactType": "text/html"
  }
}
```

Open Design 没有 version 概念——每次生成是新 project。
我们有 version 概念，所以需要额外处理：首次入库 = 创建 project + version 1，后续修改 = 追加 version。

---

## 现有代码关键位置

### electron/ElectronChatPanel.ts

**handleDesignChatLane() artifact 分支**（line ~2558）：
```typescript
// 现在：artifact 生成后立即调用 saveDesignVersion()
const version = await this.saveDesignVersion({ ... });
this.sendToRenderer({ type: 'design:result', ... });
```
→ **本任务改造**：去掉这里的 `saveDesignVersion()` 调用，artifact 结果只存 chat message，不入库。

**saveDesignVersion()**（line ~3598）：现有方法，创建 project + version，用于 midtai 路径。
本任务不改这个方法，新增 `saveDesignArtifactToProject()` 专门处理 chat artifact 入库。

**openActiveArtifactInKainClawDesign()**（line ~3101）：现有的「进入 KainClaw Design」触发点。
目前走的是 artifact panel 的普通 artifact（非设计 artifact）路径，调 `getProjectBySourceArtifactId()` + `createProject()`。
本任务在这里加分支：如果是设计 session 的 artifact，走新的 `saveDesignArtifactToProject()` 逻辑。

**saveDesignVersion() 完整签名**（供参考）：
```typescript
private async saveDesignVersion(options: {
  prompt?: string;
  outputType?: DesignOutputType;
  style?: string;
  html: string;
  sliders: unknown[];
  source: 'generate' | 'patch' | 'editCurrent' | 'restore';
  sourceArtifactId?: string;
  baseVersionId?: string;
}): Promise<DesignVersionRecord>
```

**DesignProjectRecord 类型**：
```typescript
export type DesignProjectRecord = {
  projectId: string;
  name: string;
  source: DesignProjectSource;   // 'artifact' | 'blank'
  sourceArtifactId?: string;
  activeVersionId: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  versionCount?: number;
};
```

### electron/renderer/index.html

**artifact 面板渲染**（搜索 `renderArtifactPanel`）：现在渲染 iframe 预览。
本任务在设计 session 的 artifact 里加「进入 KainClaw Design」按钮。

**设计 artifact 的识别**：chat message content 包含 `<artifact` 标签时，现有 `detectArtifactFromSessionMessage()` 会识别。
本任务需要在渲染时区分：这个 artifact 来自设计 session（显示「进入 KainClaw Design」）还是普通 session（现有逻辑）。

判断方式：`appState.sessionType === 'design'`（317 任务已在 postState 里带上）。

**「进入 KainClaw Design」按钮**：点击时发送：
```javascript
send({ type: 'artifact:enter-design', artifactId: artifact.id });
```

### src/storage/sessionRepository.ts

chat message 需要能存 `projectId` 引用（入库后写入）。
现有 `ChatMessage` 类型可能需要扩展：
```typescript
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  kind?: string;
  // 新增：
  designProjectId?: string;  // 入库后写入，用于 version sync
};
```

---

## 本任务需要做的事

### 1. 去掉 handleDesignChatLane() 里的自动入库

```typescript
// 改造前
const version = await this.saveDesignVersion({ ... });
await this.appendAssistantMessageToSession(requestSessionId, { ... });
this.sendToRenderer({ type: 'design:result', ... });

// 改造后：不调 saveDesignVersion，只存 chat message
await this.appendAssistantMessageToSession(requestSessionId, {
  role: 'assistant',
  content: result.rawOutput,  // 包含 <artifact> 的原始文本
  timestamp: Date.now(),
});
// 不发 design:result，让 chat 消息流自然渲染 artifact
```

### 2. ChatMessage 加 designProjectId 字段

```typescript
// src/storage/sessionRepository.ts
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  kind?: string;
  designProjectId?: string;  // 新增：入库后写入
};
```

序列化/反序列化同步更新。

### 3. 新增 saveDesignArtifactToProject()

```typescript
private async saveDesignArtifactToProject(options: {
  sessionId: string;
  messageIndex: number;  // 哪条 chat message 包含这个 artifact
  artifactId: string;
  html: string;
  title: string;
  outputType: DesignOutputType;
}): Promise<{ projectId: string; versionId: string }> {
  // 1. 创建 project（source: 'artifact'，sourceArtifactId = artifactId）
  const project = await this.designProjectStore.createProject({
    name: options.title || '设计作品',
    source: 'artifact',
    sourceArtifactId: options.artifactId,
    activeVersionId: 'pending-version',
  });

  // 2. 创建 version 1
  const version = await this.designVersionStore.saveVersion({
    projectId: project.projectId,
    prompt: '',
    title: '生成',
    outputType: options.outputType,
    style: '',
    html: options.html,
    sliders: [],
    source: 'generate',
  });

  // 3. 更新 project.activeVersionId
  await this.designProjectStore.updateProject(project.projectId, {
    activeVersionId: version.id,
    updatedAt: version.createdAt,
    lastOpenedAt: Date.now(),
  });

  // 4. 把 projectId 写入对应的 chat message
  await this.updateMessageDesignProjectId(options.sessionId, options.messageIndex, project.projectId);

  return { projectId: project.projectId, versionId: version.id };
}
```

### 4. host 处理 artifact:enter-design 消息

```typescript
if (type === 'artifact:enter-design') {
  await this.handleEnterDesignFromArtifact(message);
  return;
}
```

```typescript
private async handleEnterDesignFromArtifact(message: Record<string, unknown>): Promise<void> {
  const artifactId = String(message.artifactId ?? '');
  if (!artifactId || !this.currentSessionId) return;

  // 找到对应的 chat message 和 artifact HTML
  const { messageIndex, artifact } = this.findArtifactInSession(artifactId);
  if (!artifact) return;

  // 检查是否已经入库
  const existingProject = await this.designProjectStore.getProjectBySourceArtifactId(artifactId);
  if (existingProject) {
    // 已入库：直接打开
    await this.openMidtai({ contentType: 'design', view: 'preview', projectId: existingProject.projectId });
    return;
  }

  // 首次入库
  const { projectId } = await this.saveDesignArtifactToProject({
    sessionId: this.currentSessionId,
    messageIndex,
    artifactId,
    html: artifact.content,
    title: artifact.title || '设计作品',
    outputType: 'prototype',
  });

  await this.openMidtai({ contentType: 'design', view: 'preview', projectId });
}
```

### 5. artifact 面板：区分设计 session vs 普通 session

设计 session（`appState.sessionType === 'design'`）里的 artifact：
- 显示「进入 KainClaw Design」按钮
- 如果 `message.designProjectId` 存在：从 `designProjectStore` 取最新 active version 的 HTML 渲染
- 如果不存在：直接渲染 artifact HTML 快照

普通 session 里的 artifact：现有逻辑不变。

### 6. version sync：chat artifact 显示最新版本

渲染逻辑：
```javascript
// 在 renderMessage() 里，检测到设计 artifact 且有 designProjectId
if (message.designProjectId) {
  // 请求 host 取最新版本
  send({ type: 'design:get-active-version', projectId: message.designProjectId });
  // host 返回后更新渲染
}
```

host 侧加处理：
```typescript
if (type === 'design:get-active-version') {
  const project = await this.designProjectStore.getProject(String(message.projectId));
  if (!project) {
    this.sendToRenderer({ type: 'design:active-version', projectId: message.projectId, deleted: true });
    return;
  }
  const html = await this.designVersionStore.getVersionHtml(project.activeVersionId);
  this.sendToRenderer({ type: 'design:active-version', projectId: message.projectId, html });
}
```

### 7. tombstone 防御

renderer 收到 `design:active-version` 且 `deleted: true` 时，artifact 面板显示占位：
```html
<div style="...">此设计已删除</div>
```

---

## 数据流

```
会话生成 artifact
    ↓
只存 chat message（content = rawOutput 包含 <artifact> 标签）
不写 designProjectStore
    ↓
用户点「进入 KainClaw Design」
    ↓
host 收到 artifact:enter-design
    ↓
saveDesignArtifactToProject()
  创建 project + version 1
  把 projectId 写入 chat message.designProjectId
    ↓
openMidtai() 打开编辑器
    ↓
在 KainClaw Design 里继续修改 → 追加 version（现有逻辑）
    ↓
chat artifact 面板渲染时：
  有 designProjectId → 请求最新 active version HTML 渲染
  没有 designProjectId → 渲染原始 HTML 快照
  project 被删除 → 显示 tombstone
```

---

## 验收标准

1. 会话生成 artifact 后**不**自动写入 `designProjectStore`
2. 点「进入 KainClaw Design」触发首次入库（创建 project + version 1）
3. 同一 artifact 再次点「进入 KainClaw Design」→ 复用已有 project，不新建
4. KainClaw Design 里继续修改 → 追加 version，chat artifact 面板自动更新到最新版
5. project 被删除后，artifact 面板显示「此设计已删除」，不报错
6. 未入库的 artifact 仍显示 HTML 快照
7. midtai 路径生成的设计不受影响

---

## Out of scope

- 不删除 midtai 老入口
- 不重写 artifact panel
- 不做删除 UI（只做 tombstone 防御）
- 不改 `saveDesignVersion()`（midtai 路径继续用）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | 去掉自动入库 + 新增入库触发逻辑 |
| `electron/renderer/index.html` | 高 | artifact 面板加「进入 KainClaw Design」按钮 + tombstone |
| `src/storage/sessionRepository.ts` | 中 | ChatMessage 加 designProjectId 字段 |

---

## 实现建议

1. **先改 handleDesignChatLane()**：去掉 `saveDesignVersion()` 调用，验证 artifact 正常出现在 chat messages 里
2. **再加 ChatMessage.designProjectId**：sessionRepository.ts，序列化同步
3. **再写 saveDesignArtifactToProject()**：复用现有 `designProjectStore.createProject()` + `designVersionStore.saveVersion()`
4. **再写 handleEnterDesignFromArtifact()**：处理 `artifact:enter-design` 消息
5. **再改 renderer**：设计 session artifact 加「进入 KainClaw Design」按钮，version sync，tombstone
6. **写测试**：入库触发逻辑、重复点击复用、tombstone 判断
