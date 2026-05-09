# Task Primer: vscode-extension-650 — Micro-compact：长会话工具结果轻量清理

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 的 compact 体系里补充 **micro-compact** 能力：在 context 接近上限时，先把旧的工具结果内容替换为占位符，而不是立即触发代价高的全量 compact。

官方逻辑（`src/services/compact/microCompact.ts`）：
- 识别 `tool_result` 类型的消息中属于"可压缩工具"的条目（shell、file read、grep、glob、web fetch 等）
- 保留最近 N 条（默认 5），把更早的内容替换为 `[Old tool result content cleared]`
- 在每次 API 调用前执行，减少发送给模型的 token 数
- 只在 token 用量超过阈值时触发，不影响正常会话

KainClaw 目前只有全量 compact（`compactHost.ts`），没有这个轻量级策略。

## Out of Scope

- Cached microcompact（官方的 cache_editing API 路径，依赖 Anthropic 内部 feature flag）
- Time-based microcompact（基于 cache TTL 的触发，是 GrowthBook feature flag 控制的实验功能）
- 不改 compactHost.ts 的全量 compact 逻辑
- 不改 Electron 文件

## High-Risk Files

- `src/compact/microCompact.ts` — 新建文件，核心实现
- `src/compactHost.ts` — 接线：在 shouldAutoCompact 检查前先尝试 micro-compact

## Step 1：新建 src/compact/microCompact.ts

```typescript
import type { ConversationMessage } from "../agent/providers/IProviderAdapter";
import { estimateMessageTokens } from "./tokenBudget";
import { normalizeConversationMessages } from "./compact";

export const MICRO_COMPACT_CLEARED_MESSAGE = "[Old tool result content cleared]";

// 可压缩的工具名（工具结果内容可以被清除）
const COMPACTABLE_TOOL_NAMES = new Set([
  "bash",
  "computer",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "read_file",
  "write_file",
  "edit_file",
  "create_file",
  "glob",
  "grep",
  "web_fetch",
  "web_search",
  "read",
  "write",
  "edit",
  "multiedit",
]);

// micro-compact 触发阈值：距离 autoCompact 阈值还有这么多 token 时触发
// 给 micro-compact 留出空间，避免直接跳到全量 compact
export const MICRO_COMPACT_TRIGGER_BUFFER_TOKENS = 30_000;

// 保留最近 N 条可压缩工具结果
const KEEP_RECENT_TOOL_RESULTS = 5;

export type MicroCompactResult = {
  messages: ConversationMessage[];
  tokensSaved: number;
  toolsCleared: number;
};

/**
 * 收集所有可压缩工具结果的 toolCallId，按出现顺序排列。
 * 只收集内容尚未被清除的条目。
 */
function collectCompactableToolIds(messages: ConversationMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (
      message.role === "tool_result" &&
      message.content !== MICRO_COMPACT_CLEARED_MESSAGE
    ) {
      ids.push(message.toolCallId);
    }
  }
  return ids;
}

/**
 * 估算单条 tool_result 消息的 token 数（粗略：字符数 / 4）
 */
function estimateToolResultTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * 对消息列表执行 micro-compact：
 * 保留最近 KEEP_RECENT_TOOL_RESULTS 条可压缩工具结果，
 * 把更早的内容替换为占位符。
 *
 * 返回 null 表示没有可清除的内容（不需要 micro-compact）。
 */
export function microCompactMessages(
  messages: ConversationMessage[],
): MicroCompactResult | null {
  const compactableIds = collectCompactableToolIds(messages);

  if (compactableIds.length <= KEEP_RECENT_TOOL_RESULTS) {
    return null;
  }

  const keepSet = new Set(compactableIds.slice(-KEEP_RECENT_TOOL_RESULTS));
  const clearSet = new Set(
    compactableIds.filter(id => !keepSet.has(id)),
  );

  if (clearSet.size === 0) {
    return null;
  }

  let tokensSaved = 0;
  let toolsCleared = 0;

  const result: ConversationMessage[] = messages.map(message => {
    if (
      message.role === "tool_result" &&
      clearSet.has(message.toolCallId) &&
      message.content !== MICRO_COMPACT_CLEARED_MESSAGE
    ) {
      tokensSaved += estimateToolResultTokens(message.content);
      toolsCleared += 1;
      return { ...message, content: MICRO_COMPACT_CLEARED_MESSAGE };
    }
    return message;
  });

  if (toolsCleared === 0) {
    return null;
  }

  return { messages: result, tokensSaved, toolsCleared };
}

/**
 * 判断是否应该触发 micro-compact。
 * 在 autoCompact 阈值之前 MICRO_COMPACT_TRIGGER_BUFFER_TOKENS 时触发，
 * 给 micro-compact 一个机会先减少 token，避免直接全量 compact。
 */
export function shouldMicroCompact(
  messages: ConversationMessage[],
  autoCompactThresholdTokens: number,
): boolean {
  const normalized = normalizeConversationMessages(messages);
  const currentTokens = estimateMessageTokens(normalized);
  const microCompactThreshold =
    autoCompactThresholdTokens - MICRO_COMPACT_TRIGGER_BUFFER_TOKENS;
  return currentTokens >= microCompactThreshold;
}
```

## Step 2：接线到 compactHost.ts

在 `compactHost.ts` 里，找到 `maybeAutoCompact` 函数（约第 220 行），在 `shouldAutoCompact` 检查之前加 micro-compact 逻辑：

```typescript
import {
  microCompactMessages,
  shouldMicroCompact,
} from "./compact/microCompact";
import { getAutoCompactThreshold } from "./compact/autoCompact";

// 在 maybeAutoCompact 函数内，shouldAutoCompact 检查之前：
export async function maybeAutoCompact(options: {
  conversationHistory: ConversationMessage[];
  config: ProviderConfig;
  performConversationCompaction: () => Promise<CompactConversationResult>;
  onCompacted?: (result: CompactConversationResult) => void;
  querySource?: string;
}): Promise<ConversationMessage[]> {
  let { conversationHistory } = options;

  // Step 1: 先尝试 micro-compact（轻量清理旧工具结果）
  const autoCompactThreshold = getAutoCompactThreshold(options.config);
  if (shouldMicroCompact(conversationHistory, autoCompactThreshold)) {
    const microResult = microCompactMessages(conversationHistory);
    if (microResult && microResult.toolsCleared > 0) {
      conversationHistory = microResult.messages;
      // micro-compact 后重新检查是否还需要全量 compact
    }
  }

  // Step 2: 全量 compact（原有逻辑不变）
  if (!shouldAutoCompact(conversationHistory, options.config)) {
    return conversationHistory;
  }
  // ... 原有全量 compact 逻辑
}
```

**注意**：`maybeAutoCompact` 的具体位置和签名以实际代码为准，上面是示意。关键是：
1. micro-compact 在 `shouldAutoCompact` 检查之前执行
2. micro-compact 后更新 `conversationHistory`，再用更新后的版本做 `shouldAutoCompact` 判断
3. 如果 micro-compact 后 token 已经降到阈值以下，就不需要全量 compact 了

## Step 3：补测试（src/compact/microCompact.test.ts）

至少覆盖：
- `microCompactMessages`：有足够多工具结果时清除旧的，保留最近 5 条
- `microCompactMessages`：工具结果 ≤ 5 条时返回 null（不压缩）
- `microCompactMessages`：已经是占位符的条目不重复计算
- `shouldMicroCompact`：token 超过阈值时返回 true，未超过返回 false

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- `ConversationMessage` 的 `tool_result` 类型用 `toolCallId` 字段（不是 `tool_use_id`）— 以 `src/agent/providers/IProviderAdapter.ts` 的实际类型定义为准
- `normalizeConversationMessages` 在 `compact.ts` 里，确认导出
- `getAutoCompactThreshold` 在 `autoCompact.ts` 里，确认导出
- micro-compact 只清除内容，不删除消息本身，保持消息数组结构不变
- COMPACTABLE_TOOL_NAMES 里的工具名以 KainClaw 实际注册的工具名为准，先 grep 确认

## Definition of Done

- [ ] `microCompactMessages` 正确保留最近 5 条，清除更早的工具结果内容
- [ ] `shouldMicroCompact` 在 autoCompact 阈值前 30k token 时触发
- [ ] micro-compact 在 `maybeAutoCompact` 里先于全量 compact 执行
- [ ] micro-compact 后 token 降到阈值以下时，不触发全量 compact
- [ ] 测试覆盖核心逻辑
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
