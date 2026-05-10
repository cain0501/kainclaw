# Primer: vscode-extension-pul
# artifact 入库 + version sync（用户主动触发）

## 前置条件

依赖 A（by7）、B（jns）、C（04q）、入口（317/c68）全部完成。

---

## 产品全局规则（必须在开始前理解）

设计 artifact 可以来自两个来源，入库逻辑统一：

| 来源 | 用户入口 | 入口位置 |
|------|---------|---------|
| midtai design chat 生成的 artifact | [进入画布] 按钮 | midtai 专业页 design chat 面板内 |
| 主 chat 生成的 design artifact | [进入 KainClaw Design] 按钮 | 主 chat artifact panel |

**两个入口都走同一套 host 行为：**
- 未入库 → 首次入库（create project + version 1）
- 已入库 → 复用已有 project，直接打开
- 最终都进入 midtai 画布精修

**不要把入口限制在只有一处。不要把 enter-design 入口强行只绑定到 design chat。**

---

## 产品决策（已确认）

### 核心原则：没有保存确认不进数据库

会话中生成的 artifact 只存在 chat 消息历史里的 HTML 快照，不自动写入 `designProjectStore`。
用户主动点「进入画布」/「进入 KainClaw Design」才触发首次入库。

### 连续生成多版的行为

```
会话里生成 v1 → v2 → v3
三个都只是 chat 消息里的 HTML 快照
用户点 v2 的按钮
→ 只有 v2 入库，v1/v3 继续只是快照
```

### artifact 版本同步

入库后，artifact 面板/卡片显示该 project 的最新 active version（不是生成时的快照）。
实现：入库时把 `projectId` 写入 chat message metadata，渲染时从 `designProjectStore` 取最新 active version。

### 删除 project 后的行为

- 入库前被删：不存在，快照还在消息历史里
- 入库后 project 被删：显示「此设计已删除」占位，不报错不崩溃

---

## 现有代码关键位置

### electron/ElectronChatPanel.ts

**`handleDesignChatLane()` artifact 分支**（line ~2558）：
```typescript
// 现在：artifact 生成后立即调用 saveDesignVersion()  ← 要去掉自动入库
const version = await this.saveDesignVersion({ ... });
```
→ **本任务改造**：去掉 `saveDesignVersion()` 调用，artifact 结果只存 chat message，不自动入库。

**`saveDesignVersion()`**（line ~3598）：现有方法，midtai 老路径（小白表单）继续用，不改。

**`openActiveArtifactInKainClawDesign()`**（line ~3101）：现有的主 chat artifact panel「进入 KainClaw Design」触发点。
本任务在这里加逻辑：如果是 design session 的 artifact，走新的 `saveDesignArtifactToProject()` 逻辑。

### src/storage/sessionRepository.ts

`ChatMessage` 类型需要扩展：
```typescript
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  kind?: string;
  designProjectId?: string;  // 新增：入库后写入，用于 version sync
};
```

---

## 本任务需要做的事

### 1. 去掉 handleDesignChatLane() 里的自动入库

```typescript
// 改造后：不调 saveDesignVersion，只存 chat message
await this.appendAssistantMessageToSession(requestSessionId, {
  role: 'assistant',
  content: result.rawOutput,  // 包含 <artifact> 的原始文本
  timestamp: Date.now(),
});
// 通过 design:chat:append 推送给 design chat 面板（带 kind:'artifact'）
this.sendToRenderer({
  type: 'design:chat:append',
  msg: { role: 'assistant', kind: 'artifact', content: result.rawOutput, timestamp: Date.now() }
});
```

### 2. ChatMessage 加 designProjectId 字段

```typescript
// src/storage/sessionRepository.ts
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  kind?: string;
  designProjectId?: string;  // 新增
};
```
序列化/反序列化同步更新。

### 3. 新增 saveDesignArtifactToProject()

```typescript
private async saveDesignArtifactToProject(options: {
  sessionId: string;
  messageIndex: number;
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

### 4. host 统一处理 artifact:enter-design 消息

两个来源（主 chat artifact panel 和 midtai design chat 卡片）都发这个消息：

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

  const { messageIndex, artifact } = this.findArtifactInSession(artifactId);
  if (!artifact) return;

  // 检查是否已入库
  const existingProject = await this.designProjectStore.getProjectBySourceArtifactId(artifactId);
  if (existingProject) {
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

### 5. renderer 侧：两个入口都发同一消息

**主 chat artifact panel**（现有「进入 KainClaw Design」按钮，不动逻辑，只确认发的是）：
```javascript
send({ type: 'artifact:enter-design', artifactId: artifact.id });
```

**midtai design chat artifact 卡片**（c68 里加的「进入画布」按钮）：
```javascript
// 把原来的 onclick="openDesignHub()" 改为：
send({ type: 'artifact:enter-design', artifactId: artifact.id });
```

两个入口发同一个 IPC，host 侧统一处理，不区分来源。

### 6. version sync：渲染最新 active version

**适用范围：以下两个展示面都要实现同一套同步逻辑，缺一不可：**
- 主 chat artifact panel（message.designProjectId 存在时）
- midtai design chat 里的 artifact 卡片（message.designProjectId 存在时）

渲染 artifact 卡片/面板时，如果 `message.designProjectId` 存在：
```javascript
send({ type: 'design:get-active-version', projectId: message.designProjectId });
// host 返回 design:active-version 后：
//   有 html → 用最新版本 HTML 更新渲染（替换快照）
//   deleted: true → 显示 tombstone（见下）
// 两个展示面的处理器代码相同，不能只写其中一个
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

### 7. tombstone 防御 + renderer 处理器

**适用范围：同样覆盖两个展示面。**

renderer 收到 `design:active-version` 时的统一处理逻辑（**两个展示面共用同一个处理器**）：

```javascript
if (type === 'design:active-version') {
  const { projectId, html, deleted } = message;

  // 1. 主 chat artifact panel（找到对应的 artifact 面板元素）
  const mainPanelEl = document.querySelector(`[data-design-project-id="${projectId}"]`);
  if (mainPanelEl) {
    if (deleted) {
      mainPanelEl.innerHTML = '<div style="padding:12px;color:#a8a29e;font-size:12px;text-align:center">此设计已删除</div>';
    } else if (html) {
      // 更新 iframe src 或 srcdoc（根据现有 artifact panel 实现方式）
      const iframe = mainPanelEl.querySelector('iframe');
      if (iframe) iframe.srcdoc = html;
    }
  }

  // 2. midtai design chat artifact 卡片（在 #design-chat-messages 里找）
  const chatCardEl = document.querySelector(
    `#design-chat-messages [data-design-project-id="${projectId}"]`
  );
  if (chatCardEl) {
    if (deleted) {
      chatCardEl.innerHTML = '<div style="padding:12px;color:#a8a29e;font-size:12px;text-align:center">此设计已删除</div>';
    }
    // design chat 卡片不嵌 iframe，只显示「已生成」+ 进入按钮，无需更新 html
  }

  return;
}
```

**关键**：两个展示面必须都用 `data-design-project-id` 属性标记容器，这样一个处理器就能统一路由，不会遗漏任何一面。

design chat 的 `appendDesignChatMessageToUI` 在渲染 artifact 卡片时，需要在 bubble 上设置该属性：
```javascript
if (msg.designProjectId) bubble.dataset.designProjectId = msg.designProjectId;
```

**tombstone 规则**：不允许一面 tombstone、另一面仍显示旧快照——两面必须同步处理。

---

## 数据流

```
会话生成 artifact
    ↓
只存 chat message（不写 designProjectStore）
    ↓
用户点「进入画布」（design chat）或「进入 KainClaw Design」（主 chat）
    ↓
host 收到 artifact:enter-design
    ↓
saveDesignArtifactToProject()
  创建 project + version 1
  把 projectId 写入 chat message.designProjectId
    ↓
openMidtai() 打开画布
    ↓
在 KainClaw Design 里继续修改 → 追加 version
    ↓
artifact 面板/卡片渲染时：
  有 designProjectId → 请求最新 active version HTML 渲染
  没有 designProjectId → 渲染原始 HTML 快照
  project 被删除 → 显示 tombstone
```

---

## 验收标准

1. 会话生成 artifact 后**不**自动写入 `designProjectStore`
2. 主 chat artifact panel 点「进入 KainClaw Design」→ 触发入库 → 打开画布
3. midtai design chat 卡片点「进入画布」→ 触发入库 → 打开画布（同一 host 逻辑）
4. 同一 artifact 再次点按钮 → 复用已有 project，不新建
5. KainClaw Design 里继续修改 → chat 卡片自动更新到最新版
6. project 被删除后，显示「此设计已删除」，不报错
7. 未入库的 artifact 仍显示 HTML 快照
8. midtai 小白模式（表单）路径不受影响

---

## Out of scope

- 不删除 midtai 老入口（小白模式）
- 不重写 artifact panel
- 不做删除 UI（只做 tombstone 防御）
- 不改 `saveDesignVersion()`（小白模式路径继续用）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | 去掉自动入库 + 新增入库触发逻辑 |
| `electron/renderer/index.html` | 高 | 两个入口都发 artifact:enter-design + tombstone |
| `src/storage/sessionRepository.ts` | 中 | ChatMessage 加 designProjectId 字段 |

---

## 实现建议

1. **先改 handleDesignChatLane()**：去掉 `saveDesignVersion()` 调用
2. **加 ChatMessage.designProjectId**：sessionRepository.ts，序列化同步
3. **写 saveDesignArtifactToProject()**：复用现有 store 方法
4. **写 handleEnterDesignFromArtifact()**：统一处理两个来源
5. **改 renderer**：midtai design chat 卡片的「进入画布」改发 `artifact:enter-design`
6. **接通 version sync + tombstone**
7. **写测试**：入库触发、重复点击复用、tombstone
