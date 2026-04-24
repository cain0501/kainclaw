import type {
  IProviderAdapter,
  NormalizedImageAttachment,
  ProviderConfig,
} from "../agent/providers/IProviderAdapter";
import type { ImageLabReferenceImage } from "./imageLabRuntime";
import { providerSupportsImagePromptInference } from "./imagePromptInference";

export type ImageWorkflowMode = "generate" | "edit";

export type ImageWorkflowPlan = {
  mode: ImageWorkflowMode;
  intentSummary: string;
  finalPrompt: string;
  materialKeywords: string[];
  nextStepNote: string;
};

export const IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT = `You are an image workflow director.

You do not generate the final image yourself. Your job is to turn the user's goal and any reference images into one structured execution plan for a downstream image model.

Return JSON only with this exact shape:
{
  "mode": "generate" | "edit",
  "intentSummary": string,
  "finalPrompt": string,
  "materialKeywords": string[],
  "nextStepNote": string
}

Rules:
- Return valid JSON only. No markdown fences. No prose before or after JSON.
- "mode" should be "edit" when reference images are present, otherwise "generate".
- "intentSummary" should be one short sentence.
- "finalPrompt" should be directly usable for a modern image model.
- "materialKeywords" should be 0-5 short keyword phrases for extra visual material worth searching or collecting.
- When the user's request is in Chinese, prefer concise Chinese search phrases in "materialKeywords" first. English can be secondary, not primary.
- "nextStepNote" should be one short action-oriented sentence for the operator.
- Preserve the user's core intent. If multiple reference images exist, merge them into one coherent direction rather than describing them separately.`;

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

function cleanJsonPayload(text: string): string {
  const trimmed = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseWorkflowPlan(rawText: string): ImageWorkflowPlan {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJsonPayload(rawText)) as Record<string, unknown>;
  } catch {
    throw new Error("当前聊天模型没有返回有效的图像工作流 JSON。");
  }

  const mode = parsed.mode === "edit" ? "edit" : "generate";
  const intentSummary = typeof parsed.intentSummary === "string" ? parsed.intentSummary.trim() : "";
  const finalPrompt = typeof parsed.finalPrompt === "string" ? parsed.finalPrompt.trim() : "";
  const nextStepNote = typeof parsed.nextStepNote === "string" ? parsed.nextStepNote.trim() : "";
  const materialKeywords = Array.isArray(parsed.materialKeywords)
    ? parsed.materialKeywords
      .filter((keyword): keyword is string => typeof keyword === "string")
      .map(keyword => keyword.trim())
      .filter(Boolean)
      .slice(0, 5)
    : [];

  if (!intentSummary || !finalPrompt || !nextStepNote) {
    throw new Error("当前聊天模型返回的图像工作流字段不完整。");
  }

  return {
    mode,
    intentSummary,
    finalPrompt,
    materialKeywords,
    nextStepNote,
  };
}

export function providerSupportsImageWorkflowOrchestration(
  config: ProviderConfig,
  hasReferenceImages: boolean,
): boolean {
  if (!hasReferenceImages) {
    return true;
  }

  return providerSupportsImagePromptInference(config);
}

export async function orchestrateImageWorkflow(options: {
  provider: IProviderAdapter;
  prompt: string;
  referenceImages?: ImageLabReferenceImage[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<ImageWorkflowPlan> {
  const trimmedPrompt = options.prompt.trim();
  const referenceImages = options.referenceImages ?? [];
  if (!trimmedPrompt && referenceImages.length === 0) {
    throw new Error("请输入图像需求，或至少提供一张参考图。");
  }

  let streamedText = "";
  const step = await options.provider.runStep(
    [{
      role: "user",
      content: [
        "Create one structured image workflow plan.",
        "",
        `User goal: ${trimmedPrompt || "[No explicit prompt provided. Infer the goal from the reference images.]"}`,
        `Reference image count: ${referenceImages.length}`,
      ].join("\n"),
      ...(referenceImages.length > 0
        ? { attachments: normalizeReferenceImages(referenceImages) }
        : {}),
    }],
    [],
    token => {
      streamedText += token;
      options.onToken?.(token);
    },
    options.signal,
  );

  return parseWorkflowPlan(step.text || streamedText);
}
