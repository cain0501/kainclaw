import { randomUUID } from "node:crypto";

import {
  editImages as openAIEditImages,
  generateImages as openAIGenerateImages,
  type GeneratedImageBatchResult,
  type ImageAuthMode,
} from "./openAIImageClient";
import {
  editImages as geminiEditImages,
  generateImages as geminiGenerateImages,
} from "./geminiImageClient";

export type ImageLabProvider = "openai" | "gemini";

export type ImageLabConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  authMode: ImageAuthMode;
  size: string;
  batchCount: number;
  responseFormat?: "url" | "b64_json";
  provider?: ImageLabProvider;
  quality?: "auto" | "high" | "medium" | "low";
};

export type ImageLabReferenceImage = {
  dataUrl: string;
  mimeType: string;
  name: string;
};

export type ImageLabRunRequest = {
  prompt: string;
  executionPrompt?: string;
  config: ImageLabConfig;
  referenceImages?: ImageLabReferenceImage[];
  signal?: AbortSignal;
};

export type ImageLabResultItem = {
  id: string;
  batchId: string;
  src: string;
  prompt: string;
  revisedPrompt?: string;
  createdAt: number;
  source: "generate" | "edit" | "variant";
  thumbnail?: string;
  lastUsedByProjectId?: string;
  originSurface?: "main-chat" | "design-chat" | "image-chat";
  originSessionId?: string;
  originThreadId?: string;
  originProjectId?: string;
  usedByProjectIds?: string[];
};

function parseDataUrlAttachment(referenceImage: ImageLabReferenceImage): {
  data: Buffer;
  mimeType: string;
  name: string;
} {
  const commaIndex = referenceImage.dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Reference image is not a valid data URL.");
  }

  const base64 = referenceImage.dataUrl.slice(commaIndex + 1);
  return {
    data: Buffer.from(base64, "base64"),
    mimeType: referenceImage.mimeType,
    name: referenceImage.name || "reference.png",
  };
}

export async function runImageLabRequest(
  request: ImageLabRunRequest,
  source: ImageLabResultItem["source"] = request.referenceImages?.length ? "edit" : "generate",
): Promise<ImageLabResultItem[]> {
  const prompt = request.prompt.trim();
  const executionPrompt = request.executionPrompt?.trim() || prompt;
  if (!prompt) {
    throw new Error("Image prompt is required.");
  }
  if (!executionPrompt) {
    throw new Error("Image execution prompt is required.");
  }

  const config = {
    apiKey: request.config.apiKey,
    baseUrl: request.config.baseUrl,
    model: request.config.model,
    authMode: request.config.authMode,
  } as const;

  const isGemini = request.config.provider === "gemini";
  const doEdit = isGemini ? geminiEditImages : openAIEditImages;
  const doGenerate = isGemini ? geminiGenerateImages : openAIGenerateImages;

  const referenceImages = request.referenceImages ?? [];
  const batchResult: GeneratedImageBatchResult = referenceImages.length > 0
    ? await doEdit({
        config,
        prompt: executionPrompt,
        images: referenceImages.map(parseDataUrlAttachment),
        size: request.config.size,
        count: request.config.batchCount,
        responseFormat: request.config.responseFormat,
        quality: request.config.quality,
        signal: request.signal,
      })
    : await doGenerate({
        config,
        prompt: executionPrompt,
        size: request.config.size,
        count: request.config.batchCount,
        responseFormat: request.config.responseFormat,
        quality: request.config.quality,
        signal: request.signal,
      });

  const createdAt = Date.now();
  const batchId = randomUUID();
  return batchResult.data.map((item, index) => ({
    id: `${createdAt}-${index}`,
    batchId,
    src: item.src,
    prompt,
    revisedPrompt: item.revisedPrompt,
    createdAt,
    source,
  }));
}

export async function createImageVariant(options: {
  prompt: string;
  config: ImageLabConfig;
  seedImageUrl: string;
  signal?: AbortSignal;
}): Promise<ImageLabResultItem[]> {
  const response = await fetch(options.seedImageUrl, {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch source image for variant (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") || "image/png";
  const referenceImage: ImageLabReferenceImage = {
    dataUrl: `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
    mimeType,
    name: "variant-source.png",
  };

  return runImageLabRequest(
    {
      prompt: options.prompt,
      config: options.config,
      referenceImages: [referenceImage],
      signal: options.signal,
    },
    "variant",
  );
}
