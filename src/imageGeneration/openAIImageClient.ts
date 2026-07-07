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

export type ImageMaskInput = {
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
    error?: {
      message?: string;
      code?: string;
    };
    message?: string;
    refusal?: string;
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    code?: string;
  };
  message?: string;
  refusal?: string;
};

type JsonObject = Record<string, unknown>;

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

function buildFallbackImageEndpoint(
  endpoint: string,
  action: "generations" | "edits",
): string | undefined {
  try {
    const url = new URL(endpoint);
    const suffix = `/images/${action}`;
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (normalizedPath !== suffix) {
      return undefined;
    }

    return `${url.origin}/v1${suffix}`;
  } catch {
    return undefined;
  }
}

function shouldRetryFallbackForErrorResponse(options: {
  endpoint: string;
  fallbackEndpoint: string | undefined;
  status: number;
  responseText: string;
}): boolean {
  return options.endpoint !== options.fallbackEndpoint && (
    options.status === 404 ||
    options.status === 405 ||
    /invalid url/i.test(options.responseText)
  );
}

function shouldRetryFallbackForHtmlSuccess(options: {
  endpoint: string;
  fallbackEndpoint: string | undefined;
  contentType: string;
  responseText: string;
}): boolean {
  const isHtmlSuccess =
    /^text\/html\b/i.test(options.contentType) ||
    /^<!doctype html|^<html[\s>]/i.test(options.responseText.trim());

  return isHtmlSuccess && options.endpoint !== options.fallbackEndpoint;
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
      return normalizeImageRefusalMessage(message);
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

function normalizeImageRefusalMessage(rawMessage: string): string {
  const normalized = rawMessage.trim();
  if (!normalized) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes("content_filter") ||
    lower.includes("content policy") ||
    lower.includes("safety system") ||
    lower.includes("safety policy") ||
    lower.includes("violat") ||
    lower.includes("moderation") ||
    lower.includes("not expected") ||
    lower.includes("cannot generate") ||
    lower.includes("cannot comply") ||
    lower.includes("request was rejected") ||
    lower.includes("request is not allowed") ||
    normalized.includes("没有按照预期生成图片") ||
    normalized.includes("重新调整提示词后重试") ||
    normalized.includes("违反平台政策") ||
    normalized.includes("立即停止或调整") ||
    normalized.includes("停止或调整你的提交内容") ||
    normalized.includes("内容安全") ||
    normalized.includes("安全策略") ||
    normalized.includes("违规") ||
    normalized.includes("敏感内容") ||
    normalized.includes("不适合生成")
  ) {
    return "图片生成被安全策略拦截。当前提示词或参考图可能涉及敏感、违规或不适合生成的内容，请调整描述后再试。";
  }

  return normalized
    .replace(/\s*\(traceid:[^)]+\)/ig, "")
    .replace(/\s*\(request id:[^)]+\)/ig, "")
    .trim();
}

function buildAuthorizationHeader(config: ImageGenerationProviderConfig): string {
  return config.authMode === "raw" ? config.apiKey : `Bearer ${config.apiKey}`;
}

function supportsLegacyResponseFormat(model: string): boolean {
  return !/^gpt-image-/i.test(model.trim());
}

function getResponseContentType(response: Response): string {
  const headerGetter = response.headers?.get;
  if (typeof headerGetter !== "function") {
    return "";
  }

  const value = headerGetter.call(response.headers, "content-type");
  return typeof value === "string" ? value.toLowerCase() : "";
}

function toDataUrlImageResult(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
): GeneratedImageBatchResult {
  return {
    data: [{
      src: `data:${mimeType || DEFAULT_IMAGE_MIME_TYPE};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
    }],
  };
}

function tryParseDirectImageTextResponse(responseText: string): GeneratedImageBatchResult | undefined {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return {
      data: [{ src: trimmed }],
    };
  }

  return undefined;
}

function tryParseJsonObject(candidate: string): JsonObject | undefined {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" ? parsed as JsonObject : undefined;
  } catch {
    return undefined;
  }
}

function unwrapImagePayload(candidate: JsonObject): ImageGenerationApiResponse | undefined {
  const directData = candidate.data;
  if (Array.isArray(directData)) {
    return candidate as ImageGenerationApiResponse;
  }

  const nestedKeys = ["result", "response", "output", "payload"];
  for (const key of nestedKeys) {
    const nested = candidate[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const unwrapped = unwrapImagePayload(nested as JsonObject);
      if (unwrapped) {
        return {
          created: typeof candidate.created === "number" ? candidate.created : unwrapped.created,
          data: unwrapped.data,
        };
      }
    }
  }

  return undefined;
}

function collectJsonCandidates(responseText: string): string[] {
  const normalized = responseText.trim().replace(/^\uFEFF/, "");
  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
  }

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]?.trim()) {
    candidates.add(fencedMatch[1].trim());
  }

  const sseCandidates = normalized
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trim())
    .filter(line => line && line !== "[DONE]");
  for (const candidate of sseCandidates) {
    candidates.add(candidate);
  }

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.add(normalized.slice(firstBrace, lastBrace + 1));
  }

  return [...candidates];
}

function normalizePayload(responseText: string): ImageGenerationApiResponse {
  for (const candidate of collectJsonCandidates(responseText)) {
    const parsed = tryParseJsonObject(candidate);
    if (!parsed) {
      continue;
    }

    const unwrapped = unwrapImagePayload(parsed);
    if (unwrapped) {
      return unwrapped;
    }
  }

  throw new Error("Image provider returned an invalid JSON response.");
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
    const refusalMessage =
      payload.error?.message ||
      payload.message ||
      payload.refusal ||
      payload.data?.find(item =>
        !!(
          item?.error?.message ||
          item?.message ||
          item?.refusal ||
          item?.finish_reason === "content_filter"
        ),
      )?.error?.message ||
      payload.data?.find(item =>
        !!(
          item?.error?.message ||
          item?.message ||
          item?.refusal ||
          item?.finish_reason === "content_filter"
        ),
      )?.message ||
      payload.data?.find(item =>
        !!(
          item?.error?.message ||
          item?.message ||
          item?.refusal ||
          item?.finish_reason === "content_filter"
        ),
      )?.refusal;
    if (refusalMessage) {
      throw new Error(normalizeImageRefusalMessage(refusalMessage));
    }
    const contentFiltered = payload.data?.some(item => item?.finish_reason === "content_filter");
    if (contentFiltered) {
      throw new Error("图片生成被安全策略拦截。请调整描述，避免涉及违规、敏感或不安全内容后再试。");
    }
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
  const fallbackEndpoint = buildFallbackImageEndpoint(options.endpoint, "generations");
  const endpoints = fallbackEndpoint
    ? [options.endpoint, fallbackEndpoint]
    : [options.endpoint];
  let lastError: Error | undefined;

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
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

    if (!response.ok) {
      const responseText = await response.text();
      lastError = new Error(buildImageErrorMessage(response.status, responseText.trim()));
      const canRetryFallback = shouldRetryFallbackForErrorResponse({
        endpoint,
        fallbackEndpoint,
        status: response.status,
        responseText,
      });
      if (canRetryFallback) {
        continue;
      }
      throw lastError;
    }

    const contentType = getResponseContentType(response);
    if (
      contentType.startsWith("image/") ||
      contentType.startsWith("application/octet-stream")
    ) {
      return toDataUrlImageResult(
        await response.arrayBuffer(),
        contentType.startsWith("image/") ? contentType : DEFAULT_IMAGE_MIME_TYPE,
      );
    }

    const responseText = await response.text();
    const directImage = tryParseDirectImageTextResponse(responseText);
    if (directImage) {
      return directImage;
    }

    if (shouldRetryFallbackForHtmlSuccess({
      endpoint,
      fallbackEndpoint,
      contentType,
      responseText,
    })) {
      lastError = new Error("Image provider returned an HTML page instead of an API payload.");
      continue;
    }

    try {
      return toGeneratedImages(normalizePayload(responseText));
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Image request failed.");
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
  quality?: "auto" | "high" | "medium" | "low";
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
        ...(options.responseFormat && supportsLegacyResponseFormat(model)
          ? { response_format: options.responseFormat }
          : {}),
        ...(options.quality && options.quality !== "auto" ? { quality: options.quality } : {}),
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
  mask?: ImageMaskInput;
  size?: string;
  count?: number;
  responseFormat?: "url" | "b64_json";
  quality?: "auto" | "high" | "medium" | "low";
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
      if (options.mask) {
        form.set(
          "mask",
          new File([new Uint8Array(options.mask.data)], options.mask.name, {
            type: options.mask.mimeType,
          }),
        );
      }
      if (options.size) {
        form.set("size", options.size);
      }
      if (count > 1) {
        form.set("n", String(count));
      }
      if (options.responseFormat && supportsLegacyResponseFormat(model)) {
        form.set("response_format", options.responseFormat);
      }
      if (options.quality && options.quality !== "auto") {
        form.set("quality", options.quality);
      }

      const primaryEndpoint = buildImageEndpointUrl(options.config.baseUrl, "edits");
      const fallbackEndpoint = buildFallbackImageEndpoint(primaryEndpoint, "edits");
      const endpoints = fallbackEndpoint
        ? [primaryEndpoint, fallbackEndpoint]
        : [primaryEndpoint];
      let lastError: Error | undefined;

      for (const endpoint of endpoints) {
        let response: Response;
        try {
          response = await fetch(endpoint, {
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

        if (!response.ok) {
          const responseText = await response.text();
          lastError = new Error(buildImageErrorMessage(response.status, responseText.trim()));
          const canRetryFallback = shouldRetryFallbackForErrorResponse({
            endpoint,
            fallbackEndpoint,
            status: response.status,
            responseText,
          });
          if (canRetryFallback) {
            continue;
          }
          throw lastError;
        }

        const contentType = getResponseContentType(response);
        if (
          contentType.startsWith("image/") ||
          contentType.startsWith("application/octet-stream")
        ) {
          return toDataUrlImageResult(
            await response.arrayBuffer(),
            contentType.startsWith("image/") ? contentType : DEFAULT_IMAGE_MIME_TYPE,
          );
        }

        const responseText = await response.text();
        const directImage = tryParseDirectImageTextResponse(responseText);
        if (directImage) {
          return directImage;
        }

        if (shouldRetryFallbackForHtmlSuccess({
          endpoint,
          fallbackEndpoint,
          contentType,
          responseText,
        })) {
          lastError = new Error("Image provider returned an HTML page instead of an API payload.");
          continue;
        }

        try {
          return toGeneratedImages(normalizePayload(responseText));
        } catch (error) {
          throw error instanceof Error ? error : new Error(String(error));
        }
      }

      throw lastError ?? new Error("Image request failed.");
    },
  });
}
