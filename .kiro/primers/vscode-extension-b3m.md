# Task Primer: vscode-extension-b3m — image-as-tool 重构：模糊图片请求先澄清

> **Session entry point.** Read this first.

## Task Goal

用户在主 chat 说"帮我画一张科技风蓝色背景卡片，上面有我们公司 logo，文字要显眼"，AI 直接生图，结果往往不对。  
目标：模糊/复合图片请求先走一轮 chat 澄清，用户确认后再生图。

**只改两处，不动 ImageLab / 中台 pipeline：**
1. `src/imageGeneration/llmIntentRouter.ts` — router system prompt 加规则
2. `electron/ElectronChatPanel.ts` — `runChatImageJob` 带入对话历史构建 prompt

---

## 现有架构

### 路由流程（`routePrompt` → `routeIntentWithLLM`）

`electron/ElectronChatPanel.ts` line ~2204：
```
用户发消息
  → routePrompt()
    → routeIntentWithLLM({ prompt, hasAttachments, hasRecentGeneratedImageContext })
      → INTENT_ROUTER_SYSTEM_PROMPT + buildRouterPrompt()
      → 返回 intent: "chat" | "image_generate" | ...
    → intent === "image_generate" → runChatImageJob({ prompt })
    → intent === "chat" → sendPrompt()
```

**关键**：`buildRouterPrompt`（`src/imageGeneration/llmIntentRouter.ts` line 66）目前只传当前 prompt + 两个 boolean，**没有对话历史**。

### `runChatImageJob`（line ~4615）

直接用 `message.prompt` 调 `runImageLabRequest`，不看历史。  
第二轮用户说"好，生成吧"时，prompt 就是这四个字，生出来的图完全随机。

---

## 修改详情

### Fix 1：`src/imageGeneration/llmIntentRouter.ts` — router system prompt 加澄清规则

在 `INTENT_ROUTER_SYSTEM_PROMPT` 的 `image_generate` 定义里，**在现有规则后追加**：

```
- If the image request is complex or ambiguous — for example it references external assets
  (logos, brand materials, specific fonts), contains multiple conflicting requirements,
  or lacks enough detail to generate a meaningful image — choose chat instead, so the
  assistant can ask one focused clarifying question before generating.
- A request is NOT complex if it is self-contained and specific enough to generate directly,
  e.g. "a minimalist black cat on white background", "turn these numbers into a bar chart".
```

同时在 `buildRouterPrompt` 里加最近对话历史（最多 3 轮），让 router 能判断"好，生成吧"是否是对前面澄清的确认：

```typescript
// buildRouterPrompt 新增参数
function buildRouterPrompt(options: {
  prompt: string;
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
  recentHistory?: Array<{ role: string; content: string }>;  // ← 新增
}): string {
  const lines = [
    `用户消息：${options.prompt || "[无文字输入]"}`,
    "",
    "上下文：",
    `- 用户是否上传了图片附件：${options.hasAttachments ? "是" : "否"}`,
    `- 是否有刚生成的图片可供编辑：${options.hasRecentGeneratedImageContext ? "是" : "否"}`,
  ];
  if (options.recentHistory && options.recentHistory.length > 0) {
    lines.push("", "最近对话（最多 3 轮，供判断上下文）：");
    for (const msg of options.recentHistory) {
      lines.push(`${msg.role === "user" ? "用户" : "AI"}：${msg.content.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}
```

`routeIntentWithLLM` 和 `routeIntentCore` 同步加 `recentHistory` 参数透传。

### Fix 2：`electron/ElectronChatPanel.ts` — routePrompt 传历史给 router

在 `routePrompt` 调用 `routeIntentWithLLM` 时，传最近 6 条消息（3 轮）：

```typescript
const recentHistory = this.sessionMessages
  .slice(-6)
  .filter(m => m.role === "user" || m.role === "assistant")
  .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 200) }));

intent = await routeIntentWithLLM({
  prompt: trimmedPrompt,
  hasAttachments,
  hasRecentGeneratedImageContext: !!latestGeneratedImage,
  provider: routerAdapter,
  recentHistory,   // ← 新增
});
```

### Fix 3：`electron/ElectronChatPanel.ts` — runChatImageJob 带入历史构建 prompt

在 `runChatImageJob` 里，当 prompt 过短（≤ 10 字）且有近期对话历史时，从历史中提取图片描述拼入 prompt：

```typescript
private buildEffectiveImagePrompt(rawPrompt: string): string {
  const SHORT_THRESHOLD = 10;
  if (rawPrompt.length > SHORT_THRESHOLD) return rawPrompt;

  // 从最近对话里找最后一条包含图片描述的 assistant 消息
  const recentMessages = this.sessionMessages.slice(-8);
  const descriptionMsg = [...recentMessages].reverse().find(
    m => m.role === "assistant" && m.content && String(m.content).length > 20,
  );
  if (!descriptionMsg) return rawPrompt;

  return `${String(descriptionMsg.content).slice(0, 500)}\n\n用户确认：${rawPrompt}`;
}
```

在 `runChatImageJob` 里替换 prompt：

```typescript
const effectivePrompt = this.buildEffectiveImagePrompt(prompt);
// 后续所有用 prompt 的地方改为 effectivePrompt（runImageLabRequest、chat:imagePending、userMessage.content 保持原始 prompt）
await runImageLabRequest({
  prompt: effectivePrompt,   // ← 用拼接后的
  ...
});
```

注意：`userMessage.content` 和 `chat:imagePending.prompt` 仍用原始 `prompt`，不影响对话展示。

---

## 实现顺序

1. `src/imageGeneration/llmIntentRouter.ts`：
   - `buildRouterPrompt` 加 `recentHistory` 参数
   - `routeIntentCore` / `routeIntentWithLLM` 透传参数
   - `INTENT_ROUTER_SYSTEM_PROMPT` 加复杂请求走 chat 的规则
2. `electron/ElectronChatPanel.ts`：
   - `routePrompt` 传 `recentHistory` 给 router
   - 新增 `buildEffectiveImagePrompt` 私有方法
   - `runChatImageJob` 用 `effectivePrompt` 调 `runImageLabRequest`

---

## 不需要做的事

- **不改 ImageLab / 中台 pipeline**：中台用户已明确要生图，不走这套路由
- **不改 `runImageLabRequest` 签名**：只在调用侧替换 prompt 字符串
- **不做"image 完成后强行接 chat"的 hack**：issue 明确禁止

---

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

手动验证：
1. 发"帮我画一张科技风蓝色背景卡片，上面有我们公司 logo，文字要显眼" → AI 应回复澄清问题，不直接生图
2. 发"生成一只黑猫，白色背景，极简风格" → 应直接生图（明确请求不受影响）
3. 第一轮澄清后，用户回复"好，就按这个生成" → 应生图，且图片内容符合前面讨论的描述

---

## Definition of Done

- [ ] 复杂/模糊图片请求路由到 `chat` 先澄清
- [ ] 明确图片请求仍直接 `image_generate`（不误伤）
- [ ] 第二轮"好，生成吧"能带入历史描述生图
- [ ] `buildRouterPrompt` 接受并传递 `recentHistory`
- [ ] `buildEffectiveImagePrompt` 存在且逻辑正确
- [ ] `npm test` + `npm run check` + `npm run build` + `npm run build:electron` 全部通过
