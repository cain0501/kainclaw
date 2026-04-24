export type ImageAuthMode = "bearer" | "raw";

export type ImageGenerationProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  authMode?: ImageAuthMode;
};

export type ImageEditInput = {
  data: Buffer;
  mimeType: string;
  name: string;
};

export type GeneratedImageResult = {
  src: string;
  revisedPrompt?: string;
};

export type GeneratedImageBatchResult = {
  created?: number;
  data: GeneratedImageResult[];
};

type ImageGenerationApiResponse = {
  created?: number;
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
    mime_type?: string;
  }>;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";
const IMAGE_REQUEST_TIMEOUT_MS = 180_000;

function createImageRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS);
  if (!signal) {
    return timeoutSignal;
  }
  if (signal.aborted) {
    return signal;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error("The operation was aborted due to timeout"));
  }, IMAGE_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => {
    clearTimeout(timeoutHandle);
    controller.abort(signal.reason);
  };

  signal.addEventListener("abort", abortFromParent, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeoutHandle);
      signal.removeEventListener("abort", abortFromParent);
    },
    { once: true },
  );
  return controller.signal;
}

function toFriendlyImageRequestError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("The operation was aborted due to timeout")) {
    return new Error(
      "图片生成超时（超过 180 秒）。这通常是模型生成较慢或中转站响应较慢，请稍后重试，或缩短提示词、减小尺寸后再试。",
    );
  }

  return error instanceof Error ? error : new Error(message);
}

export function buildImageEndpointUrl(
  baseUrl: string | undefined,
  action: "generations" | "edits",
): string {
  const root = (baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  const suffix = `/images/${action}`;
  return root.endsWith(suffix) ? root : `${root}${suffix}`;
}

export function buildImageGenerationUrl(baseUrl?: string): string {
  return buildImageEndpointUrl(baseUrl, "generations");
}

function buildImageErrorMessage(status: number, bodyText: string): string {
  if (!bodyText) {
    return `Image request failed with HTTP ${status}.`;
  }

  const normalizedBody = bodyText.trim();
  try {
    const parsed = JSON.parse(normalizedBody) as {
      error?: { message?: string };
      message?: string;
    };
    const message = parsed.error?.message || parsed.message;
    if (message) {
      return message;
    }
  } catch {
    // Fall back to the raw response body when the provider returns plain text.
  }

  const looksLikeHtml = /^<!DOCTYPE html>|^<html[\s>]/i.test(normalizedBody);
  const isCloudflare524 = (
    status === 524 ||
    /error code\s*524/i.test(normalizedBody)
  ) && /cloudflare/i.test(normalizedBody);
  if (isCloudflare524) {
    return "图像服务请求超时（Cloudflare 524）。通常是上游图像服务处理过慢或暂时过载。请稍后重试，或先降低批量数量后再试。";
  }

  if (looksLikeHtml) {
    return `图像服务暂时不可用（HTTP ${status}）。上游返回了网页错误页而不是图片结果，请稍后重试。`;
  }

  return normalizedBody;
}

function buildAuthorizationHeader(config: ImageGenerationProviderConfig): string {
  return config.authMode === "raw" ? config.apiKey : `Bearer ${config.apiKey}`;
}

function normalizePayload(responseText: string): ImageGenerationApiResponse {
  try {
    return JSON.parse(responseText) as ImageGenerationApiResponse;
  } catch {
    throw new Error("Image provider returned an invalid JSON response.");
  }
}

function toGeneratedImages(payload: ImageGenerationApiResponse): GeneratedImageBatchResult {
  const images = payload.data?.map(firstImage => {
    if (firstImage.b64_json) {
      return {
        src: `data:${firstImage.mime_type || DEFAULT_IMAGE_MIME_TYPE};base64,${firstImage.b64_json}`,
        revisedPrompt: firstImage.revised_prompt,
      };
    }

    if (firstImage.url) {
      return {
        src: firstImage.url,
        revisedPrompt: firstImage.revised_prompt,
      };
    }

    return undefined;
  }).filter(Boolean) as GeneratedImageResult[] | undefined;

  if (!images || images.length === 0) {
    throw new Error("Image provider returned no image data.");
  }

  return {
    created: payload.created,
    data: images,
  };
}

async function sendImageJsonRequest(options: {
  endpoint: string;
  config: ImageGenerationProviderConfig;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<GeneratedImageBatchResult> {
  let response: Response;
  try {
    response = await fetch(options.endpoint, {
      method: "POST",
      headers: {
        Authorization: buildAuthorizationHeader(options.config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.body),
      signal: createImageRequestSignal(options.signal),
    });
  } catch (error) {
    throw toFriendlyImageRequestError(error);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(buildImageErrorMessage(response.status, responseText.trim()));
  }

  return toGeneratedImages(normalizePayload(responseText));
}

async function collectRequestedImages(options: {
  count?: number;
  execute: (count: number) => Promise<GeneratedImageBatchResult>;
}): Promise<GeneratedImageBatchResult> {
  const requestedCount = Math.max(1, Math.min(8, options.count ?? 1));
  const firstBatch = await options.execute(requestedCount);
  if (firstBatch.data.length >= requestedCount) {
    return {
      created: firstBatch.created,
      data: firstBatch.data.slice(0, requestedCount),
    };
  }

  const remainingCount = requestedCount - firstBatch.data.length;
  const supplementalBatches = await Promise.all(
    Array.from({ length: remainingCount }, () => options.execute(1)),
  );

  return {
    created: firstBatch.created ?? supplementalBatches[0]?.created,
    data: [
      ...firstBatch.data,
      ...supplementalBatches.flatMap(batch => batch.data),
    ].slice(0, requestedCount),
  };
}

export async function generateImages(options: {
  config: ImageGenerationProviderConfig;
  prompt: string;
  size?: string;
  count?: number;
  responseFormat?: "url" | "b64_json";
  signal?: AbortSignal;
}): Promise<GeneratedImageBatchResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Image prompt is required.");
  }

  const model = options.config.model.trim();
  if (!model) {
    throw new Error("Image model is required.");
  }

  return collectRequestedImages({
    count: options.count,
    execute: count => sendImageJsonRequest({
      endpoint: buildImageEndpointUrl(options.config.baseUrl, "generations"),
      config: options.config,
      body: {
        model,
        prompt,
        size: options.size ?? "1024x1024",
        ...(count > 1 ? { n: count } : {}),
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      },
      signal: options.signal,
    }),
  });
}

export async function generateImage(options: {
  config: ImageGenerationProviderConfig;
  prompt: string;
  size?: string;
}): Promise<GeneratedImageResult> {
  const result = await generateImages(options);
  return result.data[0]!;
}

export async function editImages(options: {
  config: ImageGenerationProviderConfig;
  prompt: string;
  images: ImageEditInput[];
  size?: string;
  count?: number;
  responseFormat?: "url" | "b64_json";
  signal?: AbortSignal;
}): Promise<GeneratedImageBatchResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Image prompt is required.");
  }

  const model = options.config.model.trim();
  if (!model) {
    throw new Error("Image model is required.");
  }
  if (!options.images.length) {
    throw new Error("At least one reference image is required for image edits.");
  }

  return collectRequestedImages({
    count: options.count,
    execute: async count => {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      const imageFieldName = options.images.length > 1 ? "image[]" : "image";
      for (const image of options.images) {
        form.append(
          imageFieldName,
          new File([new Uint8Array(image.data)], image.name, {
            type: image.mimeType,
          }),
        );
      }
      if (options.size) {
        form.set("size", options.size);
      }
      if (count > 1) {
        form.set("n", String(count));
      }
      if (options.responseFormat) {
        form.set("response_format", options.responseFormat);
      }

      let response: Response;
      try {
        response = await fetch(buildImageEndpointUrl(options.config.baseUrl, "edits"), {
          method: "POST",
          headers: {
            Authorization: buildAuthorizationHeader(options.config),
          },
          body: form,
          signal: createImageRequestSignal(options.signal),
        });
      } catch (error) {
        throw toFriendlyImageRequestError(error);
      }

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(buildImageErrorMessage(response.status, responseText.trim()));
      }

      return toGeneratedImages(normalizePayload(responseText));
    },
  });
}
