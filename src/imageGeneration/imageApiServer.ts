import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type ImageApiEnv = {
  port: number;
  host: string;
  defaultBaseUrl?: string;
  defaultModel: string;
  defaultApiKey?: string;
  defaultAuthMode: "bearer" | "raw";
};

type ImageRequestBody = {
  prompt?: unknown;
  size?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  authMode?: unknown;
  response_format?: unknown;
};

function readEnv(): ImageApiEnv {
  const port = Number.parseInt(process.env.IMAGE_API_PORT ?? "4123", 10);
  return {
    port: Number.isFinite(port) ? port : 4123,
    host: process.env.IMAGE_API_HOST?.trim() || "127.0.0.1",
    defaultBaseUrl: process.env.IMAGE_API_BASE_URL?.trim() || undefined,
    defaultModel: process.env.IMAGE_API_MODEL?.trim() || "openai/gpt-image-2",
    defaultApiKey: process.env.IMAGE_API_KEY?.trim() || undefined,
    defaultAuthMode:
      process.env.IMAGE_API_AUTH_MODE?.trim().toLowerCase() === "raw"
        ? "raw"
        : "bearer",
  };
}

function buildUpstreamUrl(baseUrl?: string): string {
  const root = (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  return root.endsWith("/images/generations") ? root : `${root}/images/generations`;
}

async function readJsonBody(request: IncomingMessage): Promise<ImageRequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as ImageRequestBody;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function writeText(response: ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function renderHomePage(env: ImageApiEnv): string {
  const initialConfig = JSON.stringify({
    baseUrl: env.defaultBaseUrl ?? "",
    model: env.defaultModel,
    authMode: env.defaultAuthMode,
  });

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Local Image API</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f3ee;
        --panel: rgba(255, 255, 255, 0.92);
        --panel-border: rgba(127, 91, 68, 0.18);
        --text: #1f1a16;
        --muted: #6f6258;
        --brand: #a8542f;
        --brand-strong: #8b4323;
        --brand-soft: #f3e1d7;
        --error: #a12626;
        --shadow: 0 24px 60px rgba(49, 33, 18, 0.12);
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(168, 84, 47, 0.16), transparent 28%),
          radial-gradient(circle at bottom right, rgba(139, 67, 35, 0.14), transparent 30%),
          linear-gradient(180deg, #fbf8f4 0%, var(--bg) 100%);
      }

      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 32px auto;
        display: grid;
        grid-template-columns: minmax(320px, 420px) minmax(320px, 1fr);
        gap: 20px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
      }

      .form-panel {
        padding: 24px;
      }

      .preview-panel {
        padding: 18px;
        display: flex;
        flex-direction: column;
        min-height: 720px;
      }

      h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: -0.02em;
      }

      .subhead {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.6;
        font-size: 14px;
      }

      .field {
        margin-top: 16px;
      }

      label {
        display: block;
        margin-bottom: 7px;
        font-size: 13px;
        font-weight: 600;
      }

      input,
      textarea,
      select,
      button {
        font: inherit;
      }

      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid rgba(127, 91, 68, 0.18);
        border-radius: 14px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.95);
        color: var(--text);
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      textarea {
        min-height: 200px;
        resize: vertical;
        line-height: 1.55;
      }

      input:focus,
      textarea:focus,
      select:focus {
        border-color: rgba(168, 84, 47, 0.7);
        box-shadow: 0 0 0 4px rgba(168, 84, 47, 0.14);
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 140px;
        gap: 12px;
      }

      button {
        border: none;
        border-radius: 14px;
        padding: 13px 18px;
        cursor: pointer;
      }

      .primary {
        width: 100%;
        margin-top: 18px;
        background: linear-gradient(135deg, var(--brand) 0%, var(--brand-strong) 100%);
        color: white;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .primary:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      .status {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--brand-soft);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
        min-height: 48px;
      }

      .status.error {
        background: #fdeaea;
        color: var(--error);
      }

      .preview-shell {
        flex: 1;
        border-radius: 18px;
        border: 1px dashed rgba(127, 91, 68, 0.22);
        background:
          linear-gradient(135deg, rgba(168, 84, 47, 0.05), transparent),
          rgba(255, 255, 255, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        min-height: 520px;
      }

      .placeholder {
        max-width: 320px;
        text-align: center;
        color: var(--muted);
        line-height: 1.7;
        font-size: 14px;
      }

      img {
        max-width: 100%;
        max-height: 100%;
        display: none;
        object-fit: contain;
      }

      .result-meta {
        display: none;
        margin-top: 14px;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      .download {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        padding: 10px 14px;
        border-radius: 12px;
        background: rgba(168, 84, 47, 0.12);
        color: var(--brand-strong);
        font-weight: 600;
      }

      .revised {
        margin-top: 12px;
        display: none;
        font-size: 13px;
        color: var(--muted);
        line-height: 1.6;
        white-space: pre-wrap;
      }

      code {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(31, 26, 22, 0.08);
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12px;
      }

      @media (max-width: 900px) {
        main {
          grid-template-columns: 1fr;
        }

        .preview-panel {
          min-height: 480px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel form-panel">
        <h1>本地图片生成</h1>
        <p class="subhead">
          这个页面会调用本地代理 <code>POST /v1/images/generations</code>，再转发到你的图片模型。
        </p>

        <div class="field">
          <label for="baseUrl">Base URL</label>
          <input id="baseUrl" placeholder="https://provider.example.com/v1" />
        </div>

        <div class="field">
          <label for="apiKey">API Key</label>
          <input id="apiKey" type="password" placeholder="填你的中转站 key" />
        </div>

        <div class="field">
          <label for="model">模型</label>
          <input id="model" placeholder="gpt-image-2" />
        </div>

        <div class="field">
          <label for="authMode">鉴权模式</label>
          <select id="authMode">
            <option value="bearer">Bearer</option>
            <option value="raw">Raw</option>
          </select>
        </div>

        <div class="field row">
          <div>
            <label for="size">尺寸</label>
            <select id="size">
              <option value="1024x1024">1024x1024</option>
              <option value="1536x1024">1536x1024</option>
              <option value="1024x1536">1024x1536</option>
            </select>
          </div>
          <div>
            <label for="format">返回格式</label>
            <select id="format">
              <option value="">Provider default</option>
              <option value="url">url</option>
              <option value="b64_json">b64_json</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="prompt">Prompt</label>
          <textarea id="prompt" placeholder="描述你要生成的画面，例如：一只赛博朋克黑猫，霓虹雨夜街头，高细节"></textarea>
        </div>

        <button id="submit" class="primary">生成图片</button>
        <div id="status" class="status">先填好参数，然后点“生成图片”。</div>
      </section>

      <section class="panel preview-panel">
        <div class="preview-shell">
          <div id="placeholder" class="placeholder">
            结果会显示在这里。<br />
            如果你使用的是 OpenClaudeCode，推荐：<br />
            <code>baseUrl = https://www.openclaudecode.cn/v1</code><br />
            <code>model = gpt-image-2</code><br />
            <code>authMode = raw</code>
          </div>
          <img id="preview" alt="Generated image preview" />
        </div>
        <div id="resultMeta" class="result-meta">
          <a id="download" class="download" href="#" download="generated-image.png">下载图片</a>
        </div>
        <div id="revised" class="revised"></div>
      </section>
    </main>

    <script>
      const initialConfig = ${initialConfig};
      const els = {
        baseUrl: document.getElementById("baseUrl"),
        apiKey: document.getElementById("apiKey"),
        model: document.getElementById("model"),
        authMode: document.getElementById("authMode"),
        size: document.getElementById("size"),
        format: document.getElementById("format"),
        prompt: document.getElementById("prompt"),
        submit: document.getElementById("submit"),
        status: document.getElementById("status"),
        placeholder: document.getElementById("placeholder"),
        preview: document.getElementById("preview"),
        revised: document.getElementById("revised"),
        resultMeta: document.getElementById("resultMeta"),
        download: document.getElementById("download"),
      };

      const storageKey = "local-image-api-form";
      const saved = (() => {
        try {
          return JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {
          return {};
        }
      })();

      els.baseUrl.value = saved.baseUrl || initialConfig.baseUrl || "";
      els.model.value = saved.model || initialConfig.model || "";
      els.authMode.value = saved.authMode || initialConfig.authMode || "bearer";
      els.size.value = saved.size || "1024x1024";
      els.format.value = saved.format || "";
      els.prompt.value = saved.prompt || "";

      function persist() {
        localStorage.setItem(storageKey, JSON.stringify({
          baseUrl: els.baseUrl.value.trim(),
          model: els.model.value.trim(),
          authMode: els.authMode.value,
          size: els.size.value,
          format: els.format.value,
          prompt: els.prompt.value,
        }));
      }

      function setStatus(message, isError = false) {
        els.status.textContent = message;
        els.status.classList.toggle("error", isError);
      }

      function clearResult() {
        els.preview.style.display = "none";
        els.preview.removeAttribute("src");
        els.placeholder.style.display = "block";
        els.resultMeta.style.display = "none";
        els.download.removeAttribute("href");
        els.revised.style.display = "none";
        els.revised.textContent = "";
      }

      function renderResult(payload) {
        const image = payload?.data?.[0];
        if (!image) {
          throw new Error("Provider returned no image data.");
        }

        const src = image.url
          || (image.b64_json ? "data:image/png;base64," + image.b64_json : "");

        if (!src) {
          throw new Error("Provider returned neither image url nor b64_json.");
        }

        els.preview.src = src;
        els.preview.style.display = "block";
        els.placeholder.style.display = "none";
        els.resultMeta.style.display = "flex";
        els.download.href = src;

        const revisedPrompt = image.revised_prompt || payload.revised_prompt;
        if (revisedPrompt) {
          els.revised.textContent = "模型修订后的 prompt:\\n" + revisedPrompt;
          els.revised.style.display = "block";
        } else {
          els.revised.style.display = "none";
          els.revised.textContent = "";
        }
      }

      async function submit() {
        const prompt = els.prompt.value.trim();
        if (!prompt) {
          setStatus("请输入 prompt。", true);
          return;
        }

        persist();
        clearResult();
        els.submit.disabled = true;
        setStatus("生成中，请稍候...");

        try {
          const body = {
            baseUrl: els.baseUrl.value.trim(),
            apiKey: els.apiKey.value.trim(),
            model: els.model.value.trim(),
            authMode: els.authMode.value,
            prompt,
            size: els.size.value,
            ...(els.format.value ? { response_format: els.format.value } : {}),
          };

          const response = await fetch("/v1/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          const text = await response.text();
          let payload;
          try {
            payload = JSON.parse(text);
          } catch {
            throw new Error(text || "Provider returned a non-JSON response.");
          }

          if (!response.ok) {
            const errorMessage =
              payload?.error?.message
              || payload?.error
              || payload?.message
              || "Image generation failed.";
            throw new Error(String(errorMessage));
          }

          renderResult(payload);
          setStatus("生成完成。");
          els.apiKey.value = "";
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error), true);
        } finally {
          els.submit.disabled = false;
        }
      }

      els.submit.addEventListener("click", submit);
      els.prompt.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      });
    </script>
  </body>
</html>`;
}

export function resolveImageRequestConfig(
  body: ImageRequestBody,
  env: ImageApiEnv,
): {
  prompt: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
  size?: string;
  responseFormat?: string;
  authMode: "bearer" | "raw";
} {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    throw new Error("`prompt` is required.");
  }

  const apiKey =
    (typeof body.apiKey === "string" ? body.apiKey.trim() : "")
    || env.defaultApiKey
    || "";
  if (!apiKey) {
    throw new Error("Missing API key. Set `apiKey` in the request or `IMAGE_API_KEY` in the environment.");
  }

  const model =
    (typeof body.model === "string" ? body.model.trim() : "")
    || env.defaultModel;

  return {
    prompt,
    model,
    apiKey,
    ...(typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? { baseUrl: body.baseUrl.trim() }
      : env.defaultBaseUrl
        ? { baseUrl: env.defaultBaseUrl }
        : {}),
    ...(typeof body.size === "string" && body.size.trim()
      ? { size: body.size.trim() }
      : {}),
    ...(typeof body.response_format === "string" && body.response_format.trim()
      ? { responseFormat: body.response_format.trim() }
      : {}),
    authMode:
      typeof body.authMode === "string" && body.authMode.trim().toLowerCase() === "raw"
        ? "raw"
        : env.defaultAuthMode,
  };
}

async function forwardImageGeneration(
  body: ImageRequestBody,
  env: ImageApiEnv,
): Promise<{
  status: number;
  contentType: string;
  body: string;
}> {
  const config = resolveImageRequestConfig(body, env);
  const authorizationValue =
    config.authMode === "raw" ? config.apiKey : `Bearer ${config.apiKey}`;
  const response = await fetch(buildUpstreamUrl(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: authorizationValue,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt: config.prompt,
      ...(config.size ? { size: config.size } : {}),
      ...(config.responseFormat ? { response_format: config.responseFormat } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text(),
  };
}

export function createImageApiHandler(env = readEnv()) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method === "GET" && request.url === "/") {
      const body = renderHomePage(env);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      response.end(body);
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, { ok: true, model: env.defaultModel });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/images/generations") {
      try {
        const requestBody = await readJsonBody(request);
        const upstream = await forwardImageGeneration(requestBody, env);
        response.writeHead(upstream.status, {
          "Content-Type": upstream.contentType,
          "Content-Length": Buffer.byteLength(upstream.body),
        });
        response.end(upstream.body);
      } catch (error) {
        if (error instanceof SyntaxError) {
          writeJson(response, 400, { error: "Invalid JSON body." });
          return;
        }

        writeJson(response, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    writeText(
      response,
      404,
      "Use POST /v1/images/generations or GET /health.",
    );
  };
}

export function startImageApiServer(env = readEnv()) {
  const server = createServer((request, response) => {
    void createImageApiHandler(env)(request, response);
  });

  server.listen(env.port, env.host, () => {
    console.log(
      `[image-api] listening on http://${env.host}:${env.port} (default model: ${env.defaultModel})`,
    );
  });

  return server;
}

if (require.main === module) {
  startImageApiServer();
}
