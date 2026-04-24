import type {
  IProviderAdapter,
  NormalizedImageAttachment,
  ProviderConfig,
} from "../agent/providers/IProviderAdapter";
import { supportsImageUrlInputs } from "../agent/providers/openAIAdapter";
import type { ImageLabReferenceImage } from "./imageLabRuntime";

const IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT = `You analyze reference images and produce one high-quality image-generation prompt.

Rules:
- Return only the final prompt text.
- Do not include headings, bullet lists, labels, markdown fences, or explanation.
- Synthesize the shared subject, style, composition, lighting, materials, mood, color, and camera cues from the images.
- If multiple images are provided, merge them into one coherent prompt that preserves the important elements from each image.
- Make the prompt directly usable for modern image models.`;

const IMAGE_PROMPT_INFERENCE_USER_PROMPT = `Reverse engineer these reference images into one polished image-generation prompt. Keep it concise but detailed enough to reuse directly.`;

function normalizeReferenceImages(
  referenceImages: ImageLabReferenceImage[],
): NormalizedImageAttachment[] {
  return referenceImages.map(referenceImage => {
    const commaIndex = referenceImage.dataUrl.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Reference image is not a valid data URL.");
    }

    return {
      data: referenceImage.dataUrl.slice(commaIndex + 1),
      mimeType: referenceImage.mimeType,
    };
  });
}

function cleanInferredPrompt(text: string): string {
  return text
    .trim()
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/, "")
    .replace(/^prompt\s*:\s*/i, "")
    .trim();
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

export function providerSupportsImagePromptInference(
  config: ProviderConfig,
): boolean {
  if (config.type === "claude-cli") {
    return false;
  }

  if (config.type === "anthropic") {
    return true;
  }

  return supportsImageUrlInputs(config);
}

export async function inferPromptFromReferenceImages(options: {
  provider: IProviderAdapter;
  referenceImages: ImageLabReferenceImage[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<string> {
  if (!options.referenceImages.length) {
    throw new Error("请至少提供一张参考图。");
  }

  let streamedText = "";
  const step = await options.provider.runStep(
    [{
      role: "user",
      content: IMAGE_PROMPT_INFERENCE_USER_PROMPT,
      attachments: normalizeReferenceImages(options.referenceImages),
    }],
    [],
    token => {
      streamedText += token;
      options.onToken?.(token);
    },
    options.signal,
  );

  const prompt = cleanInferredPrompt(step.text || streamedText);
  if (!prompt) {
    throw new Error("当前聊天模型没有返回可用的反推提示词。");
  }

  return prompt;
}

export { IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT };

export type VisibleImagePromptPair = {
  zhPrompt: string;
  enPrompt: string;
};

export const VISIBLE_IMAGE_PROMPT_PAIR_SYSTEM_PROMPT = `You analyze reference images and produce two user-visible prompt drafts.

Return JSON only with this exact shape:
{
  "zhPrompt": string,
  "enPrompt": string
}

Rules:
- Return valid JSON only. No markdown fences. No prose before or after JSON.
- "zhPrompt" must be simplified Chinese and should be the customer-facing version.
- "enPrompt" must be the English counterpart of the same visual intent.
- Keep the Chinese version first-class, natural, and directly understandable for non-expert users.
- Keep both prompts aligned in meaning and level of detail.`;

function parseVisiblePromptPair(rawText: string): VisibleImagePromptPair {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJsonPayload(rawText)) as Record<string, unknown>;
  } catch {
    throw new Error("当前聊天模型没有返回有效的双语提示词 JSON。");
  }

  const zhPrompt = typeof parsed.zhPrompt === "string" ? parsed.zhPrompt.trim() : "";
  const enPrompt = typeof parsed.enPrompt === "string" ? parsed.enPrompt.trim() : "";
  if (!zhPrompt || !enPrompt) {
    throw new Error("当前聊天模型返回的双语提示词字段不完整。");
  }

  return { zhPrompt, enPrompt };
}

export async function inferVisiblePromptPairFromReferenceImages(options: {
  provider: IProviderAdapter;
  referenceImages: ImageLabReferenceImage[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<VisibleImagePromptPair> {
  if (!options.referenceImages.length) {
    throw new Error("请至少提供一张参考图。");
  }

  let streamedText = "";
  const step = await options.provider.runStep(
    [{
      role: "user",
      content: "Reverse engineer these reference images into one Chinese prompt and one English prompt for end users.",
      attachments: normalizeReferenceImages(options.referenceImages),
    }],
    [],
    token => {
      streamedText += token;
      options.onToken?.(token);
    },
    options.signal,
  );

  return parseVisiblePromptPair(step.text || streamedText);
}
