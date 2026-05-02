# Spec: LLM-based Intent Router（图片 vs 对话路由重构）

**状态**：已冻结（Claude + Codex 联合评审通过）  
**作者**：Claude（PM 角色）  
**评审**：Codex（技术可行性）  
**日期**：2026-04-30 → 2026-05-01 更新  
**版本**：v3（新增 prompt_rewrite 第四意图）

---

## 一、问题背景

### 当前做法（正则匹配）

`src/imageGeneration/chatPromptIntent.ts` 中的 `determineChatPromptIntent()` 使用硬编码正则来判断用户意图：

```
"生成一张海报"                              → image_generate  ✅
"出一个蓝色壁纸"                            → image_generate  ✅（命中正则）
"来一张数据图表"                            → chat            ❌ 漏判
"帮我可视化这份数据"                        → chat            ❌ 漏判
"这张图太假了"                              → image_edit      ❌ 误判
"这个提示词不满意，你帮我优化一下"（含图片词）→ image_generate  ❌ 误判为生图
"根据以上提示词，把你说的归茶这一理念重写一份"→ image_generate  ❌ 误判为生图
```

**最后两条是当前真实发生的 bug**：用户要求优化/重写提示词，但消息正文里含有"海报、品牌、主视觉"等词，系统误判直接出图。

### 根本缺陷

| 问题 | 原因 |
|------|------|
| 表达方式覆盖不全 | 正则只识别有限关键词 |
| 无法理解上下文 | 不感知对话历史 |
| 维护负担持续增加 | 每次新表达都要改代码 |
| 多语言支持弱 | 中英混用、俚语、缩写容易漏 |
| **缺少元任务类型** | 没有"重写/优化提示词"这一类，元任务被误判为执行任务 |

### 现有可复用模式

项目已有成熟先例：`imageWorkflowOrchestrator.ts`（L19-40、L113-148）——专用 system prompt + `buildProviderAdapter()` + 一次 `runStep(messages, [], ...)` + 严格 JSON 解析。本 spec 的实现直接复用这个模式，不引入新架构。

---

## 二、目标

用 **A-JSON 方案**替换正则意图分类：独立一次 LLM 路由调用，返回 `{"intent": "chat" | "prompt_rewrite" | "image_generate" | "image_edit"}`，LLM 失败时降级回现有正则。

**明确不在范围内**：
- 不合并 chat 和 image 两条执行管道
- 不重构 `orchestrateImageWorkflow` 或 `runChatImageJob`
- 不改变 UI 层触发方式（显式按钮仍直接走 `explicitIntent`）
- 不修改任何 provider adapter（`tool_choice` 控制留作未来可选增强）

---

## 三、方案设计（A-JSON）

### 3.1 整体流程

```
用户输入
  ↓
[explicitIntent 存在？] ──YES──→ 直接路由（不变，外层短路）
  ↓ NO
[构造专用 adapter + 路由 LLM 调用, ~200-600ms]
  ├─ 专用 system prompt（意图分类器角色）
  ├─ 返回 {"intent": "chat" | "prompt_rewrite" | "image_generate" | "image_edit"}
  ├─ 硬超时：800ms
  └─ 失败时降级回 determineChatPromptIntent()（正则 fallback）
  ↓
chat          → sendPrompt()（不变）
prompt_rewrite → sendPrompt()（同 chat 管道，输出文字）
image_generate → runChatImageJob()（不变）
image_edit    → runChatImageJob()（不变）
```

**说明**：显式意图（用户点击图片按钮）仍在 `ElectronChatPanel.ts` 外层短路，LLM router 只处理非显式路径。

### 3.2 新模块：`src/imageGeneration/llmIntentRouter.ts`

```typescript
export type ChatPromptIntent = "chat" | "prompt_rewrite" | "image_generate" | "image_edit";

export async function routeIntentWithLLM(options: {
  prompt: string;
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
  provider: IProviderAdapter;
  signal?: AbortSignal;
}): Promise<ChatPromptIntent>
```

注意：此函数**不接 `explicitIntent`**，该字段由调用方在外层已处理完毕。

`prompt_rewrite` 走 `sendPrompt()` 管道（和 `chat` 相同），不走图片管道。调用方不需要为它添加新分支，只需确保 `prompt_rewrite` 不被路由进 `runChatImageJob()`。

### 3.3 System Prompt（A-JSON 版，v3 更新）

```
你是一个对话意图分类器。
根据用户消息和上下文信号，从以下四个意图中选择一个，返回严格 JSON：
{"intent": "chat" | "prompt_rewrite" | "image_generate" | "image_edit"}

意图定义：

【强规则：元任务优先于执行任务】
如果用户本轮的核心动作是"写/改/优化/重写/润色文字"（包括提示词、brief、文案、方案），
无论消息正文里包含多少图片、设计、海报相关词汇，都必须优先选 prompt_rewrite。
只有当用户明确说"帮我生成图片"、"出图"、"按这个生成"时，才进入 image_generate。

prompt_rewrite（优化或重写提示词 / 设计 brief / 文案）
  适用：用户要求重写、优化、润色、改写、整理一份文字内容
  示例：
    - "这个提示词不满意，帮我优化一下"
    - "根据以上内容，帮我重写一版归茶品牌的生图提示词"
    - "帮我整理成一份完整的设计 brief"
    - "润色一下这段文案"
  强规则：即使消息里充满"海报、主视觉、品牌、Logo、配料、价格区"等词，
           只要动作词是"重写/优化/改写/整理/润色"，就选 prompt_rewrite，不出图
  输出：文字，走普通对话管道

chat（普通对话）
  适用：提问、解释、分析、闲聊、代码、不涉及图片操作的写作任务
  示例："这张图为什么看起来假？"、"解释一下配色原理"、"写一段产品介绍文案"

image_generate（生成新图片）
  适用：用户明确要求产出一张图像
  示例："帮我生成一张海报"、"出图"、"按这个提示词生成图片"、"来一张极简黑白封面"
  规则：用户有上传图片附件但无任何文字时，选 image_generate
  规则：附件 + "按这个直接生成" → image_generate
  规则：附件 + "帮我写一版提示词" → prompt_rewrite（附件是上下文，不是生成命令）

image_edit（修改已有图片）
  适用：用户想对现有图片进行修改、调整、局部替换
  前置条件：有参考图附件 OR 有最近生成图片的上下文
  示例："把背景换成白色"、"眼睛再大一点"、"去掉右边的人"

不要返回 JSON 以外的任何内容。不要加 markdown 代码块。
```

### 3.4 上下文信号注入

```
用户消息：{prompt}

上下文：
- 用户是否上传了图片附件：{hasAttachments ? '是' : '否'}
- 是否有刚生成的图片可供编辑：{hasRecentGeneratedImageContext ? '是' : '否'}
```

### 3.5 Provider 构造（复用现有模式）

参考 `ElectronChatPanel.ts` L1624：

```typescript
// 在 handleQuickInputMessage 调用 router 前，新增本地 adapter 构造
const routerAdapter = buildProviderAdapter(
  config,
  workspaceRoot,
  INTENT_ROUTER_SYSTEM_PROMPT,
  envMap,
);
const intent = await routeIntentWithLLM({
  prompt: trimmedPrompt,
  hasAttachments,
  hasRecentGeneratedImageContext: !!latestGeneratedImage,
  provider: routerAdapter,
  signal: abortSignal,
});
```

这不是新架构，是项目内已有的标准 one-shot provider 构造模板。

### 3.6 Fallback 策略

```typescript
// llmIntentRouter.ts 内部
try {
  const result = await withTimeout(
    routeIntentCore(options),
    800,  // ms
  );
  return result;
} catch {
  // LLM 超时、解析失败、provider 报错，全部降级
  return determineChatPromptIntent({
    prompt: options.prompt,
    hasAttachments: options.hasAttachments,
    hasRecentGeneratedImageContext: options.hasRecentGeneratedImageContext,
  });
}
```

### 3.7 保留的现有行为契约

以下行为必须保留或明确更新：

| 情况 | 行为 | 变化 |
|------|------|------|
| 有附件但无文字 | `image_generate` | 不变 |
| `explicitIntent === "image_generate"` | 外层短路，不进 router | 不变 |
| `explicitIntent === "chat"` | 外层短路，不进 router | 不变 |
| 致谢类短语（"好的"、"谢谢"）且有最近图上下文 | `chat` | 不变 |
| **有附件 + "帮我写一版提示词"** | `prompt_rewrite` | **新增：附件是上下文，不是生成命令** |
| **消息含图片词 + 动作词是"重写/优化"** | `prompt_rewrite` | **新增：元任务优先于执行任务** |

### 3.8 Tool Use 的位置

Tool Use（`tool_choice = "required"`）**不在本 spec 范围内**。原因：当前 `openAIAdapter` 的 `tool_choice` 硬编码为 `"auto"`，Anthropic 无控制接口，Claude CLI 忽略 tools 参数。待 adapter 层能力补齐后，可作为独立增强项叠加在本路由器之上，不影响本次实现。

---

## 四、文件变更范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/imageGeneration/llmIntentRouter.ts` | **新建** | LLM 路由核心逻辑（~60 行） |
| `src/imageGeneration/llmIntentRouter.test.ts` | **新建** | 单元 + 调用链测试（见第五节） |
| `electron/ElectronChatPanel.ts` L1940-1950 | **修改** | 新增 adapter 构造 + 替换调用，~10 行 |
| `src/imageGeneration/chatPromptIntent.ts` | **保留不动** | fallback 兜底，不删除 |

变更文件数：4，在 AGENTS.md 的 8 文件警戒线内。

---

## 五、测试要求

### 5.1 单元测试（mock provider）

原有 6 个 case（保留）：
```
- "来一张数据可视化图" → image_generate
- "帮我把这组数字变成图表" → image_generate
- "这张图太假了，修一下"（有最近图上下文）→ image_edit
- "解释一下为什么这张图看起来不真实" → chat
- 有附件无文字 → image_generate
- 致谢短语 + 有最近图上下文 → chat
```

**新增 prompt_rewrite 回归测试（v3 必须通过）**：
```
case A：长篇海报 prompt + "帮我重写一版"
  输入：prompt = "平台图标应小尺寸...最终输出一张具有强商业感海报。帮我重写一版"
        hasAttachments = false
  期望：prompt_rewrite
  说明：消息正文充满图片词汇，但动作词是"重写"，元任务优先

case B：带附件 + "先帮我写一版提示词"
  输入：prompt = "我上传了一张参考图，先帮我写一版适合这个风格的海报提示词"
        hasAttachments = true
  期望：prompt_rewrite
  说明：附件是上下文，动作词是"写提示词"，不出图

case C：带附件 + "按这版直接生成"
  输入：prompt = "按这版直接生成一张图"
        hasAttachments = true
  期望：image_generate
  说明：有明确生成指令，走生成管道

case D：含大量设计词 + "优化一下这段 brief"
  输入：prompt = "品牌色是深棕，主视觉要有高级感，帮我优化一下这段设计 brief"
        hasAttachments = false
  期望：prompt_rewrite

case E：纯重写指令，无图片词
  输入：prompt = "这个提示词不满意，帮我优化一下"
        hasAttachments = false
  期望：prompt_rewrite
```

### 5.2 调用链 Fallback 测试（重要）

必须覆盖以下三种降级场景，验证 `routeIntentWithLLM()` 真正降级回正则，不是只测正则 helper：

```
- provider.runStep() 超时（超过 800ms）→ 正则 fallback 被调用
- provider.runStep() 抛异常 → 正则 fallback 被调用
- JSON 解析失败（模型返回非 JSON）→ 正则 fallback 被调用
```

### 5.3 现有测试

`chatPromptIntent.test.ts` 全部通过（证明 fallback 路径本身工作正常）。

---

## 六、验收标准

- [ ] 5.1 原有 6 个路由 case 全部通过
- [ ] 5.1 新增 5 个 prompt_rewrite 回归 case（A/B/C/D/E）全部通过
- [ ] 5.2 的 3 个 fallback 调用链测试通过
- [ ] `chatPromptIntent.test.ts` 全部通过（fallback 路径验证）
- [ ] `npm run build` 通过，无 TypeScript 报错
- [ ] `ElectronChatPanel.ts` 改动仅限 L1940 附近约 10 行，不触碰其他逻辑
- [ ] 附件无文字时路由结果为 `image_generate`
- [ ] `prompt_rewrite` 意图走 `sendPrompt()` 管道，不进入 `runChatImageJob()`
- [ ] `ChatPromptIntent` 类型定义更新为四值枚举

---

## 七、风险与约束

| 风险 | 缓解措施 |
|------|----------|
| LLM 路由增加延迟 | 800ms 硬超时 + 正则降级，保证最差情况不退化 |
| 模型返回非 JSON | parseIntent() 严格解析，捕获后走 fallback |
| ElectronChatPanel 改动引入回归 | 改动范围明确（~10 行），构造模式与 L1624 完全一致 |
| 路由结果不稳定 | System prompt 包含具体示例和边界规则 |

---

## 八、与 AGENTS.md 的对齐检查

- ✅ 新能力落到 `src/` 模块（`llmIntentRouter.ts`），不堆进 `ElectronChatPanel.ts`
- ✅ 变更文件数 ≤ 8
- ✅ 保留原有正则作为 fallback，改动可回退
- ✅ 遵循"最小改动满足目标"原则
- ✅ 复用 `buildProviderAdapter` 现有模式，不引入新架构
- ✅ 不触碰高风险区域（`webviewHtml.ts`、`extension.ts`、`licenseManager.ts`）

---

## 九、未来可选增强（不在本 spec 范围）

- **Tool Use 路由**：待 adapter 层暴露 `tool_choice` 控制后，可替换 JSON prompt 方案，提升选择可靠性
- **路由模型独立配置**：允许用户指定比主模型更快/更便宜的路由专用模型
- **方案 B（工具嵌入主对话）**：把 `generate_image` 定义为 chat LLM 的工具，实现零额外延迟，但需要重构 agent runner，当前收益不匹配改动成本
