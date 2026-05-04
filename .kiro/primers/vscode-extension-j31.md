# Primer: vscode-extension-j31
## LLM 意图路由器超时从 800ms 改为 5000ms

### 背景

`src/imageGeneration/llmIntentRouter.ts` 第 7 行：

```typescript
export const INTENT_ROUTER_TIMEOUT_MS = 800;
```

当前超时 800ms，用户配置的 provider（Sonnet / GPT-4.1 / DeepSeek）实际响应时间经常超过这个值，导致几乎所有请求都 fallback 到 regex 路由（`determineChatPromptIntent`），LLM 路由器实际没在工作。

### 改动

**只改一个常量值：**

```typescript
// src/imageGeneration/llmIntentRouter.ts line 7
export const INTENT_ROUTER_TIMEOUT_MS = 5000;  // 原来是 800
```

### 注意事项

1. 检查 `src/imageGeneration/llmIntentRouter.test.ts` 中是否有依赖 `INTENT_ROUTER_TIMEOUT_MS` 具体值的 fake timer 测试。如果 mock 了超时行为（vi.useFakeTimers + advanceTimersByTime），确认 advance 的毫秒数仍然 > 5000，否则要同步更新测试。

2. 不需要改任何其他文件。

### 验收

```bash
npm test           # 全部通过
npm run check      # 无类型错误
```

改完后 `bd close vscode-extension-j31`，git commit + push。
