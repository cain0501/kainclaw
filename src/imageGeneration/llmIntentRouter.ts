import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  determineChatPromptIntent,
  type ChatPromptIntent,
} from "./chatPromptIntent";

export const INTENT_ROUTER_TIMEOUT_MS = 5000;

export const INTENT_ROUTER_SYSTEM_PROMPT = `You are an intent classifier for a chat-plus-image workflow.

Return JSON only with this exact shape:
{
  "intent": "chat" | "prompt_rewrite" | "derive_artifact" | "image_generate" | "image_edit"
}

Intent definitions:

Strong rule:
- Meta tasks take priority over execution tasks.
- If the user wants to write, rewrite, optimize, polish, or reorganize text content such as a prompt, brief, copy, or plan, choose prompt_rewrite even if the message is full of image-design vocabulary.
- If the user wants to turn an existing or recent image into a clickable prototype, HTML page, or webpage artifact, choose derive_artifact.
- Only choose image_generate when the user explicitly wants an image to be produced now.
- If the user explicitly asks for HTML, SVG, Mermaid, code blocks, a single-file webpage, or a clickable prototype as text/code output, choose chat. Those requests should stay on the normal chat pipeline and may later be detected as artifacts.

prompt_rewrite
- The user wants to rewrite, optimize, polish, draft, or reorganize a prompt, brief, copy block, or design plan.
- Examples: "This prompt is not good enough, help me improve it", "Rewrite the Guicha concept into a stronger image prompt", "Help me turn this into a complete design brief"
- If the user uploaded an image but is asking for a prompt/spec rewrite, still choose prompt_rewrite. The attachment is context, not a generation command.

derive_artifact
- The user wants to convert an existing image or recent generated design into a clickable prototype, HTML page, or webpage artifact.
- This requires image context from either uploaded attachments or a recent generated image.
- Examples: "Turn this design image into a clickable prototype", "把这张图做成可以点击的产品原型", "根据刚才那张图生成一个 HTML 页面原型"
- Choose this instead of chat when the request is clearly about deriving an artifact from an image, not authoring a fresh HTML page from scratch.

chat
- Normal conversation, questions, explanation, writing, coding, or analysis in text form.
- Examples: "Why does this image look fake?", "Help me write copy", "Explain this dataset"
- Also choose chat when the requested deliverable is HTML/SVG/Mermaid/code text, for example: "Output a full HTML single-file landing page prototype", "Give me a Mermaid flowchart", "Return a complete SVG chart"
- Chinese natural-language examples that must still be chat:
  - "做一个摄影师作品集首页原型，暗色背景，大图瀑布流" -> chat
  - "帮我做一个销售数据柱状图" -> chat
  - "做一个用户注册流程的流程图" -> chat
  - "帮我做一个 dashboard，显示月度销售数据" -> chat
  - "请直接输出一个完整 SVG 饼图，显示 Q1-Q4 销售占比，不要解释" -> chat
  - "请直接输出 mermaid 流程图代码块，描述用户注册到激活的完整流程" -> chat

image_generate
- The user wants to create a new image, poster, cover, illustration, avatar, or chart/visualization.
- Examples: "Make a minimalist black-and-white cover", "Turn these numbers into a chart", "Visualize this dataset"
- Even when the wording is vague, choose this if the core intent is to produce a new image.
- If the user uploaded image attachments but provided no text, choose image_generate.
- If the image request is complex or ambiguous - for example it references external assets
  (logos, brand materials, specific fonts), contains multiple conflicting requirements,
  or lacks enough detail to generate a meaningful image - choose chat instead, so the
  assistant can ask one focused clarifying question before generating.
- A request is NOT complex if it is self-contained and specific enough to generate directly,
  e.g. "a minimalist black cat on white background", "turn these numbers into a bar chart".
- Do not choose image_generate when the user is asking for a prototype, page, HTML, SVG, Mermaid diagram, flowchart, architecture diagram, or other code/text artifact, even if the topic is visual.

image_edit
- The user wants to modify an existing image.
- Only choose this when there is an uploaded image attachment or recent generated-image context.
- Examples: "Change the background to white", "Make the eyes bigger", "Remove the person on the right"

Do not return markdown fences, explanation, or any text outside the JSON object.`;

type IntentRouterPayload = {
  intent: ChatPromptIntent;
};

type IntentRouterHistoryMessage = {
  role: string;
  content: string;
};

function buildRouterPrompt(options: {
  prompt: string;
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
  recentHistory?: IntentRouterHistoryMessage[];
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
    for (const message of options.recentHistory) {
      lines.push(
        `${message.role === "user" ? "用户" : "AI"}：${message.content.slice(0, 200)}`,
      );
    }
  }
  return lines.join("\n");
}

function cleanJsonPayload(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseIntent(rawText: string): ChatPromptIntent {
  let parsed: Partial<IntentRouterPayload>;
  try {
    parsed = JSON.parse(cleanJsonPayload(rawText)) as Partial<IntentRouterPayload>;
  } catch {
    throw new Error("Intent router returned invalid JSON.");
  }

  if (
    parsed.intent !== "chat" &&
    parsed.intent !== "prompt_rewrite" &&
    parsed.intent !== "derive_artifact" &&
    parsed.intent !== "image_generate" &&
    parsed.intent !== "image_edit"
  ) {
    throw new Error("Intent router returned an unsupported intent.");
  }

  return parsed.intent;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Intent router timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function routeIntentCore(options: {
  prompt: string;
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
  recentHistory?: IntentRouterHistoryMessage[];
  provider: IProviderAdapter;
  signal?: AbortSignal;
}): Promise<ChatPromptIntent> {
  let streamedText = "";
  const step = await options.provider.runStep(
    [
      {
        role: "user",
        content: buildRouterPrompt(options),
      },
    ],
    [],
    token => {
      streamedText += token;
    },
    options.signal,
  );

  return parseIntent(step.text || streamedText);
}

export async function routeIntentWithLLM(options: {
  prompt: string;
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
  recentHistory?: IntentRouterHistoryMessage[];
  provider: IProviderAdapter;
  signal?: AbortSignal;
}): Promise<ChatPromptIntent> {
  try {
    return await withTimeout(
      routeIntentCore(options),
      INTENT_ROUTER_TIMEOUT_MS,
    );
  } catch {
    return determineChatPromptIntent({
      prompt: options.prompt,
      hasAttachments: options.hasAttachments,
      hasRecentGeneratedImageContext: options.hasRecentGeneratedImageContext,
    });
  }
}
