export async function validateProviderKey(
  providerType: string,
  apiKey: string,
  baseUrl?: string,
  model?: string,
): Promise<void> {
  if (providerType === "claude-cli") {
    return;
  }

  if (providerType === "openai-compatible" && !baseUrl?.trim()) {
    throw new Error("openai-compatible 类型必须填写 Base URL，例如 https://api.deepseek.com/v1");
  }

  const signal = AbortSignal.timeout(10_000);

  if (providerType === "anthropic") {
    const root = (baseUrl?.replace(/\/+$/, "") || "https://api.anthropic.com");
    const url =
      root.endsWith("/messages")
        ? root
        : root.endsWith("/v1")
          ? `${root}/messages`
          : `${root}/v1/messages`;
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    };
    const body = JSON.stringify({
      model: model || "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await fetch(url, { method: "POST", headers, body, signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error("API Key 无效，请检查后重试。");
    }
    return;
  }

  const root = (baseUrl?.replace(/\/+$/, "") || "https://api.openai.com/v1");
  const modelsUrl = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  try {
    const modelsRes = await fetch(modelsUrl, { method: "GET", headers: authHeaders, signal });
    if (modelsRes.status === 401 || modelsRes.status === 403) {
      throw new Error("API Key 无效，请检查后重试。");
    }
    if (modelsRes.ok) {
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("API Key 无效")) {
      throw err;
    }
  }

  const completionsUrl = root.endsWith("/chat/completions") ? root : `${root}/chat/completions`;
  const fallbackModel = model?.trim() || "gpt-4o-mini";
  const body = JSON.stringify({
    model: fallbackModel,
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
  });
  const res = await fetch(completionsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body,
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("API Key 无效，请检查后重试。");
  }
}
