import type {
  GeneratedImageBatchResult,
  ImageEditInput,
  ImageGenerationProviderConfig,
} from "./openAIImageClient";

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  error?: { message?: string; code?: number };
};

function buildGeminiEndpoint(config: ImageGenerationProviderConfig): string {
  const base = config.baseUrl?.trim() || "https://generativelanguage.googleapis.com";
  return `${base.replace(/\/$/, "")}/v1beta/models/${config.model.trim()}:generateContent`;
}

async function callGemini(
  config: ImageGenerationProviderConfig,
  parts: GeminiPart[],
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  const url = buildGeminiEndpoint(config);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
    signal,
  });

  const json = await res.json() as GeminiResponse;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${msg}`);
  }
  return json;
}

function extractImages(response: GeminiResponse): GeneratedImageBatchResult {
  const data: GeneratedImageBatchResult["data"] = [];
  let revisedPrompt: string | undefined;

  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text?.trim()) revisedPrompt = part.text.trim();
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        data.push({
          src: `data:${mime};base64,${part.inlineData.data}`,
          revisedPrompt,
        });
      }
    }
  }

  if (data.length === 0) {
    throw new Error("Gemini API returned no images. Check the model name and API key.");
  }
  return { data };
}

// Gemini generates one image per request — run count requests sequentially.
async function runBatch(
  config: ImageGenerationProviderConfig,
  parts: GeminiPart[],
  count: number,
  signal?: AbortSignal,
): Promise<GeneratedImageBatchResult> {
  const all: GeneratedImageBatchResult["data"] = [];
  const n = Math.max(1, Math.min(4, count));
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = extractImages(await callGemini(config, parts, signal));
    all.push(...result.data);
  }
  return { data: all };
}

export async function generateImages(options: {
  config: ImageGenerationProviderConfig;
  prompt: string;
  count?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImageBatchResult> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required.");
  return runBatch(options.config, [{ text: prompt }], options.count ?? 1, options.signal);
}

export async function editImages(options: {
  config: ImageGenerationProviderConfig;
  prompt: string;
  images: ImageEditInput[];
  count?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImageBatchResult> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required.");

  const parts: GeminiPart[] = [
    { text: prompt },
    ...options.images.map(img => ({
      inlineData: { mimeType: img.mimeType, data: img.data.toString("base64") },
    })),
  ];
  return runBatch(options.config, parts, options.count ?? 1, options.signal);
}
