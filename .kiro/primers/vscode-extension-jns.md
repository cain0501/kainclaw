# Primer: vscode-extension-jns
# 设计专用 prompt / workflow（Open Design 风格）

## 前置条件

依赖 vscode-extension-by7（design chat lane + designFlowId 协议）已完成。
A 任务已实现：`handleDesignChatLane()` 存在，目前 fallback 到 `generateDesignWorkbench()`。
本任务替换这个 fallback，实现真正的设计对话 workflow。

---

## 任务目标

专业模式下，design lane 请求不再直接生成 HTML，而是走 Open Design 风格的两轮对话：

- **第一轮**：LLM 读 brief，返回 `<question-form>` 问用户几个关键问题
- **第二轮**：LLM 带用户答案生成 `<artifact>` HTML

去掉 `designPrompt.ts` 里的 hardcoded skill patches（约束列表），改成工作流描述风格，给 LLM 更大的创作空间。

小白模式（midtai 老路径）不受影响。

---

## 背景：为什么 skill patches 是问题

现有 `getSkillPatch()` 是约束列表：

```
## Skill: Social Carousel
- Canvas width: 375px.
- Each slide must follow a 9:16 portrait composition.
- One slide = one focal point.
...
```

LLM 按约束填空，每次输出大同小异，模板化。

Open Design 的 SKILL.md 是工作流描述：

```
## Workflow
1. Read the active DESIGN.md. Pick the loudest serif token for headlines.
2. Pick the theme + 3 captions from the brief.
3. Stage — full-bleed dark page. Top header strip: ...
4. Cards — 3 squares in a horizontal row...
5. Write a single HTML document...
6. Self-check: ...
```

区别：约束列表告诉 LLM"不能做什么"，工作流描述告诉 LLM"怎么做"。后者保留创作空间，前者压死它。

---

## 现有代码关键位置

### ElectronChatPanel.ts

- `handleDesignChatLane()` (line ~2327)
  - A 任务实现，目前 fallback 到 `generateDesignWorkbench()`
  - **本任务在这里插入新的两轮对话逻辑**

- `generateDesignWorkbench()` (line ~3421)
  - 老路径，小白模式和 midtai 继续用
  - 本任务不改这个方法

- `buildKainClawDesignSystemPrompt()` 调用 (line ~3462)
  - 老路径用的 system prompt 构建
  - 本任务新增一个设计对话专用的 system prompt 构建函数

### src/design/designPrompt.ts（高风险文件）

- `buildKainClawDesignSystemPrompt()` (line ~231)
  - 当前包含 craft rules（color.md / typography.md / anti-ai-slop.md / layout.md）
  - 本任务新增 `buildDesignChatSystemPrompt()`，在此基础上加入 Open Design 风格的 discovery 规则

- `buildKainClawDesignUserPrompt()` (line ~289)
  - 当前包含 skill patches
  - 本任务新增 `buildDesignChatUserPrompt()`，去掉 skill patches，改成工作流描述

- `getSkillPatch()` (line ~166)
  - 硬编码约束列表
  - 本任务新增 `getSkillWorkflow()`，替换为工作流描述风格
  - 老的 `getSkillPatch()` 保留，小白模式继续用

### 参考：Open Design discovery.ts

`E:\open-design\packages\contracts\src\prompts\discovery.ts`

核心规则（简化版，适配我们的场景）：

```
RULE 1 — 第一轮必须输出 <question-form id="discovery">
  - 一句话 + 表单，然后停止
  - 不写代码，不调工具
  - 跳过条件：用户说"直接生成"，或消息以 [form answers — ...] 开头

RULE 2 — 收到答案后生成 <artifact>
  - 消息以 [form answers — discovery] 开头时，直接生成 HTML
  - 不再问第二轮问题（我们简化 Open Design 的三轮为两轮）
```

---

## 本任务需要做的事

### 1. 新增 `buildDesignChatSystemPrompt()`

在 `src/design/designPrompt.ts` 中新增，不改现有函数：

```typescript
export function buildDesignChatSystemPrompt(options?: {
  brandContext?: string;
}): string {
  // 基础：craft rules（复用现有 CRAFT_ANTI_SLOP / CRAFT_TYPOGRAPHY / CRAFT_COLOR / CRAFT_LAYOUT）
  // 新增：discovery 规则（两轮对话协议）
  // 新增：<artifact> 输出格式（替代现有的 KAINCLAW_DESIGN_HTML_START/END 标记）
}
```

discovery 规则核心（适配我们的场景，比 Open Design 简化）：

```
## Design Chat Protocol

Turn 1 — emit <question-form id="discovery"> then STOP.
When the user sends a fresh design brief, your first output is:
one short line + a <question-form> block. Nothing else.

Skip the form only when:
- The user says "直接生成" / "skip questions" / "just build"
- The message starts with [form answers — ...]

Turn 2 — generate <artifact> HTML.
When you receive [form answers — discovery], generate the design immediately.
Do not ask more questions.

<artifact> output format:
<artifact identifier="slug" type="text/html" title="Design Title">
<!doctype html>
<html>...</html>
</artifact>
```

### 2. 新增 `getSkillWorkflow()` 替换 `getSkillPatch()`

工作流描述风格，以 social-carousel 为例：

```typescript
// 旧：约束列表
case "social-carousel":
  return `## Skill: Social Carousel
- Canvas width: 375px.
- Each slide must follow a 9:16 portrait composition.
...`

// 新：工作流描述
case "social-carousel":
  return `## Skill: Social Carousel

Produce 3 portrait panels (375×667px each) as a single scrollable HTML page.

Workflow:
1. Pick a theme and 3 connected captions from the brief — they should read as one sentence when stacked.
2. Each panel: full-bleed background (gradient or solid), one oversized headline, one short caption, brand mark.
3. Panels scroll horizontally on mobile, display as a row on desktop.
4. Self-check: each panel readable standalone; no navigation bars or desktop chrome.`
```

保留 `getSkillPatch()` 不删，小白模式继续用。

### 3. 新增 `buildDesignChatUserPrompt()`

```typescript
export function buildDesignChatUserPrompt(options: {
  prompt: string;
  outputType: DesignOutputType;
  brandContext?: string;
}): string {
  const workflow = getSkillWorkflow(options.outputType);
  return [
    `Output type: ${options.outputType}`,
    ...(workflow ? ['', workflow] : []),
    `User request: ${options.prompt.trim()}`,
    ...(options.brandContext?.trim() ? [
      '',
      '## Brand context',
      options.brandContext.trim(),
    ] : []),
  ].join('\n');
}
```

### 4. 改造 `handleDesignChatLane()`

替换当前的 fallback 逻辑：

```typescript
private async handleDesignChatLane(message: Record<string, unknown>): Promise<void> {
  const prompt = String(message.prompt ?? '').trim();
  if (!prompt) return;

  await this.ensureSession();
  if (!this.currentSessionId) return;

  const context = await this.resolveDesignLaneRequestContext(...);

  // 新：走设计对话 workflow，不直接调 generateDesignWorkbench
  await this.runDesignChatTurn({
    prompt,
    outputType: normalizeDesignOutputType(message.outputType),
    brandContext: typeof message.brandContext === 'string' ? message.brandContext : '',
    flowId: context.flow.flowId,
    projectId: context.flow.projectId,
    conversationHistory: context.conversationHistory ?? [],
    signal: this.getAbortSignal(),
  });
}
```

`runDesignChatTurn()` 是新方法：
- 用 `buildDesignChatSystemPrompt()` 构建 system prompt
- 用 `buildDesignChatUserPrompt()` 构建 user prompt
- 调 LLM，流式输出
- 输出包含 `<question-form>` → 发送给 renderer 渲染（C 任务处理）
- 输出包含 `<artifact>` → 解析 HTML，走现有 `parseKainClawDesignOutput()` 逻辑存版本

### 5. 对话历史管理

design lane 需要维护自己的对话历史（question-form 问答是多轮的）：

- 历史存在 `DesignFlowState` 里（A 任务已有结构，本任务扩展 `conversationHistory` 字段）
- 每轮追加：`{ role: 'user', content: prompt }` 和 `{ role: 'assistant', content: llmOutput }`
- 用户提交 question-form 答案时，答案作为新的 user message 追加

---

## 验收标准

1. 专业模式发送设计 brief → LLM 第一轮返回包含 `<question-form>` 的文本（不直接生成 HTML）
2. 用户发送 `[form answers — discovery]\n- ...` → LLM 第二轮生成 `<artifact>` HTML
3. 用户说"直接生成" → 跳过 question-form，直接生成
4. 生成的 HTML 质量：不同 outputType 有不同的视觉风格，不再千篇一律
5. 小白模式（midtai 路径）不受影响，`getSkillPatch()` 仍被使用
6. `buildKainClawDesignSystemPrompt()` / `buildKainClawDesignUserPrompt()` 不被修改（老路径继续用）

---

## Out of scope（本任务不做）

- 不实现 renderer 侧 `<question-form>` 渲染（C 任务）
  - 本任务 LLM 返回的 `<question-form>` 文本先以普通文本形式显示在 chat 里即可
- 不实现 artifact 自动入库（D 任务）
- 不删除 midtai 老入口
- 不做 index.html 全量组件化重构
- 不实现 direction-cards 类型的 question-form（Open Design 高级功能，暂不需要）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `src/design/designPrompt.ts` | 高 | 新增函数，不改现有函数，但要小心不破坏老路径 |
| `electron/ElectronChatPanel.ts` | 高 | 改造 `handleDesignChatLane()`，新增 `runDesignChatTurn()` |
| `electron/renderer/index.html` | 低（本任务） | C 任务才改 renderer 渲染逻辑 |

---

## 实现建议

1. **先写新函数，不改旧函数**：`buildDesignChatSystemPrompt()`、`buildDesignChatUserPrompt()`、`getSkillWorkflow()` 全部新增，老函数一行不动
2. **先写 `runDesignChatTurn()` 骨架**：能调 LLM、能流式输出、能识别 `<artifact>` 标签
3. **再接入 `handleDesignChatLane()`**：替换 fallback
4. **写测试**：验证两轮对话协议（第一轮返回 question-form，第二轮返回 artifact）
5. **参考文件**：`E:\open-design\packages\contracts\src\prompts\discovery.ts`（两轮协议参考）、`E:\open-design\skills\social-carousel\SKILL.md`（工作流描述风格参考）
