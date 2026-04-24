import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import type { ProfileStore } from "./profileStore";

const MIN_TURNS_FOR_DISTILLATION = 20;

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildReasoningPrompt(conversationHistory: ConversationMessage[]): string {
  const historyText = conversationHistory
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return [
    "你是一位专注于用户理解的分析师。仔细观察以下对话，从以下八个维度深度推理这位用户：",
    "",
    "1. **目标与动机**：他们在解决什么问题？短期目标和长期目标分别是什么？",
    "2. **技术背景**：语言/框架/工具的熟悉程度，擅长哪些领域，哪些领域仍在学习中？",
    "3. **工作节奏**：何时倾向深入探讨，何时希望快速解决？是否偏好先规划再动手，还是边做边调整？",
    "4. **沟通风格**：偏好详细解释还是直接给结论？偏好中文还是英文？是否接受推送式建议？",
    "5. **决策风格**：面对多个方案时如何取舍？是否倾向于先分析风险，还是先快速验证？",
    "6. **反复出现的模式**：有哪些高频痛点、习惯性做法、偏好或思维定式值得记录？",
    "7. **当前项目上下文**：正在做什么项目，当前关注的核心问题是什么？",
    "8. **协作价值点**：哪些信息如果在下次对话一开始就知道，能显著提升协作效率？",
    "",
    "自由输出你的分析推理——这是内部思考过程，不是最终存储的画像。",
    "",
    "<conversation>",
    historyText,
    "</conversation>",
  ].join("\n");
}

function buildDeltaPrompt(
  reasoning: string,
  existingProfile: string | null,
): string {
  return [
    "根据以下用户分析，更新用户画像。",
    "",
    "如果用户画像已有内容，只输出需要新增或修改的部分（delta），格式为：",
    "ADD: <section> | <item>",
    "MODIFY: <section> | <old> → <new>",
    "REMOVE: <section> | <item>",
    "",
    "如果没有现有画像，输出完整的用户画像 Markdown 文档（包含标题和各 section）。",
    "如果分析中没有新增信息，输出 \"NO_CHANGES\"。",
    "不要输出没有实质新信息的 section。",
    "",
    "<analysis>",
    reasoning,
    "</analysis>",
    "",
    "<existing_profile>",
    existingProfile ?? "(no existing profile)",
    "</existing_profile>",
  ].join("\n");
}

export async function distillUserProfile(
  conversationHistory: ConversationMessage[],
  profileStore: ProfileStore,
  provider: IProviderAdapter,
): Promise<void> {
  try {
    if (conversationHistory.length < MIN_TURNS_FOR_DISTILLATION) {
      return;
    }

    // Step 1: Dialectic reasoning — build a theory of mind about the user
    let reasoningText = "";
    const reasoningStep = await provider.runStep(
      [{ role: "user", content: buildReasoningPrompt(conversationHistory) }],
      [],
      token => {
        reasoningText += token;
      },
    );
    if (reasoningStep.text) {
      reasoningText = reasoningStep.text;
    }

    if (!reasoningText.trim()) {
      return;
    }

    // Step 2: Delta generation — convert reasoning into profile updates
    const existingProfile = await profileStore.load();
    let deltaText = "";
    const deltaStep = await provider.runStep(
      [{ role: "user", content: buildDeltaPrompt(reasoningText.trim(), existingProfile) }],
      [],
      token => {
        deltaText += token;
      },
    );
    if (deltaStep.text) {
      deltaText = deltaStep.text;
    }

    const trimmed = deltaText.trim();
    if (!trimmed || trimmed === "NO_CHANGES") {
      return;
    }

    await profileStore.applyDelta(trimmed);
    console.info("[user-modeling] User profile updated (dialectic).");
  } catch (err) {
    console.warn(
      `[user-modeling] Failed to distill user profile: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
