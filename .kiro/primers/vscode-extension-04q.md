# Primer: vscode-extension-04q
# renderer inline question-form 渲染

## 前置条件

依赖 A（vscode-extension-by7）和 B（vscode-extension-jns）已完成。

B 任务已实现：
- `runDesignChatTurn()` 首轮返回 `{ kind: "question-form", content: rawOutput }`
- host 把 `rawOutput`（包含 `<question-form>` 文本）作为普通 assistant message 存入 session
- renderer 目前把它当普通文本渲染，用户看到的是 XML 原文

本任务：让 renderer 识别并渲染成交互式问答卡片，用户提交答案后格式化成 `[form answers - discovery]\n- 问题: 答案` 发回 host，触发第二轮生成。

---

## 任务目标

在 `renderMessage()` 里检测 `<question-form>` 标签，渲染成内联问答卡片。用户提交后，答案追加到对话历史，host 收到后触发 B 任务的第二轮生成链路。

---

## 现有代码关键位置

### electron/renderer/index.html（高风险文件）

**消息渲染入口**（line ~7681）：
```javascript
function renderMessage(m, messageIndex) {
  const rawContent = m.content || '';
  let content = renderMessageContent(rawContent, isUser);
  // tool_use / tool_result 分支...
}
```

**内容渲染**（line ~7751）：
```javascript
function renderMessageContent(text, isUser = false) {
  if (!isUser && isVerificationReport(text)) return renderVerificationReport(text);
  if (!isUser && isMcpStatusReport(text)) return renderMcpStatusReport(text);
  return renderMarkdown(text);
}
```

**插入点**：在 `renderMessageContent()` 里加一个分支，检测到 `<question-form>` 时走新的渲染路径。

**发送入口**（line ~5576）：
```javascript
function sendPrompt() {
  send({ type: 'sendPrompt', prompt: text, ... });
}
```

question-form 提交答案也走这个通道，携带 `lane: 'design'` 和 `designFlowId`。

**design lane 状态**（line ~2203）：
```javascript
designFlowId: null,  // 已有，A 任务加的
```

### B 任务输出的 question-form 格式

LLM 输出的文本结构（来自 `buildDesignChatSystemPrompt()` 的约定）：

```
Got it — tell me a bit more before I start:

<question-form id="discovery" title="Quick brief">
{
  "questions": [
    { "id": "output", "label": "这是什么类型？", "type": "radio", "required": true,
      "options": ["落地页", "小红书图文", "移动端 App", "数据看板", "邮件模板"] },
    { "id": "audience", "label": "目标受众", "type": "text",
      "placeholder": "e.g. 早期投资人、SaaS 买家" },
    { "id": "tone", "label": "视觉风格", "type": "checkbox", "maxSelections": 2,
      "options": ["极简现代", "活泼插画", "商务专业", "编辑杂志风", "科技感"] }
  ]
}
</question-form>
```

### 参考实现

`E:\open-design\apps\web\src\artifacts\question-form.ts` — parser（`splitOnQuestionForms()`、`formatFormAnswers()`）
`E:\open-design\apps\web\src\components\QuestionForm.tsx` — 渲染逻辑（字段类型、锁定态）

---

## 本任务需要做的事

### 1. 新增 `parseQuestionForms(text)` 函数

抽成独立 JS 模块（不塞进 index.html 主体），放在 `electron/renderer/questionForm.js`：

```javascript
// 解析 <question-form> 标签，返回 segments 数组
// segment: { kind: 'text', text } | { kind: 'form', form, raw }
function splitOnQuestionForms(input) { ... }

// 解析 <question-form> 属性和 JSON body
function tryParseForm(body, attrs) { ... }

// 格式化答案为 [form answers - discovery]\n- 问题: 答案
function formatFormAnswers(form, answers) { ... }
```

支持的字段类型：`radio`、`checkbox`（含 `maxSelections`）、`text`、`textarea`、`select`。
暂不支持 `direction-cards`（Open Design 高级功能，out of scope）。

### 2. 新增 `renderQuestionForm(form, messageIndex, locked, submittedAnswers)` 函数

返回 HTML 字符串，渲染成内联卡片：

```
┌─────────────────────────────────────┐
│ ? Quick brief                        │
│ 填完这几个问题，我就开始生成          │
├─────────────────────────────────────┤
│ 这是什么类型？ *                      │
│ ○ 落地页  ○ 小红书图文  ○ 移动端 App  │
│                                     │
│ 目标受众                             │
│ [___________________________]       │
│                                     │
│ 视觉风格（最多选 2 个）               │
│ □ 极简现代  □ 活泼插画  □ 商务专业    │
├─────────────────────────────────────┤
│                      [开始生成 →]    │
└─────────────────────────────────────┘
```

**锁定态**（`locked: true`）：已提交的表单显示为只读，按钮替换为"已回答"标签。

### 3. 改造 `renderMessageContent()`

```javascript
function renderMessageContent(text, isUser = false) {
  if (!isUser && isVerificationReport(text)) return renderVerificationReport(text);
  if (!isUser && isMcpStatusReport(text)) return renderMcpStatusReport(text);

  // 新增：检测 question-form
  if (!isUser && /<question-form\b/i.test(text)) {
    return renderQuestionFormMessage(text);
  }

  return renderMarkdown(text);
}
```

`renderQuestionFormMessage(text)` 调用 `splitOnQuestionForms()`，把文本分成 prose + form segments，分别渲染。

### 4. 表单提交逻辑

```javascript
function submitQuestionForm(messageIndex, formId) {
  const form = getFormState(messageIndex, formId);
  if (!form) return;

  // 验证必填项
  const missing = form.questions.filter(q => q.required && !answers[q.id]?.trim());
  if (missing.length > 0) return;

  // 格式化答案
  const text = formatFormAnswers(form, answers);

  // 锁定表单（不可重复提交）
  lockForm(messageIndex, formId);

  // 发送到 host，携带 design lane 标记
  send({
    type: 'sendPrompt',
    prompt: text,
    lane: 'design',
    designFlowId: designBridgeState.designFlowId || undefined,
    outputType: designBridgeState.outputType || 'prototype',
  });
}
```

### 5. 表单状态管理

表单状态（当前选择、是否已提交）存在内存里，不需要持久化：

```javascript
// messageIndex → { answers: {}, locked: false }
const questionFormStates = new Map();

function getOrCreateFormState(messageIndex, form) { ... }
function lockForm(messageIndex, formId) { ... }
```

**锁定判断**：当 `messageIndex` 对应的 assistant message 后面紧跟着一条以 `[form answers - discovery]` 开头的 user message 时，表单自动渲染为锁定态（页面刷新后也能正确显示）。

---

## 验收标准

1. assistant message 包含 `<question-form>` 时，渲染成交互式卡片，不显示 XML 原文
2. 卡片支持 radio / checkbox（含 maxSelections）/ text / textarea / select 字段类型
3. 必填项未填时，提交按钮禁用
4. 提交后表单变为锁定态（只读），不可重复提交
5. 提交的答案格式为 `[form answers - discovery]\n- 问题: 答案`，通过 `lane: 'design'` 发送
6. host 收到答案后触发 B 任务的第二轮生成，最终产出 `<artifact>` HTML
7. 页面刷新后，已提交的表单仍显示锁定态（通过检测后续 user message 判断）
8. 普通 assistant message（不含 `<question-form>`）渲染不受影响

---

## Out of scope（本任务不做）

- 不实现 `direction-cards` 类型（Open Design 高级卡片，暂不需要）
- 不实现 artifact 自动入库（D 任务）
- 不删除 midtai 老入口
- 不做 index.html 全量组件化重构
- 不改造 host 侧逻辑（B 任务已完成，本任务只改 renderer）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 12k 行单文件，改 `renderMessageContent()` 影响所有消息渲染 |
| `electron/renderer/questionForm.js` | 低（新文件） | 新增独立模块，不影响现有逻辑 |

---

## 实现建议

1. **先写独立模块** `electron/renderer/questionForm.js`：parser + formatter，不依赖 index.html 的任何全局变量，可单独测试
2. **再写渲染函数** `renderQuestionForm()`：纯函数，输入 form 对象，输出 HTML 字符串
3. **再接入** `renderMessageContent()`：一行检测 + 调用，改动最小
4. **再写提交逻辑**：`submitQuestionForm()` + 状态管理
5. **最后测试端到端**：发 brief → 看到 question-form 卡片 → 填答案 → 提交 → 看到 artifact 生成

新逻辑必须抽成独立模块（`questionForm.js`），不能把 parser / state machine 继续塞进 index.html。
