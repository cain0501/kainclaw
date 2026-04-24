import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "./IProviderAdapter";
import type { ProviderConfig } from "./IProviderAdapter";
import type { ProviderRuntimeOptions } from "../../thinkingEffort/types";

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIImageUrlPart = { type: "image_url"; image_url: { url: string } };
type OpenAITextPart = { type: "text"; text: string };
type OpenAIContentPart = OpenAITextPart | OpenAIImageUrlPart;

type OpenAIChatMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | OpenAIContentPart[] | null;
      tool_calls?: OpenAIToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function buildUrl(
  config: Extract<ProviderConfig, { type: "openai" | "openai-compatible" }>,
): string {
  if (config.type === "openai-compatible" && (!config.baseUrl || config.baseUrl.trim() === "")) {
    throw new Error(
      'openai-compatible Provider 缺少 baseUrl。请在设置面板填写 API 端点地址，例如 https://api.deepseek.com/v1。',
    );
  }

  const root = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return root.endsWith("/chat/completions") ? root : `${root}/chat/completions`;
}

export function supportsImageUrlInputs(
  config: Extract<ProviderConfig, { type: "openai" | "openai-compatible" }>,
): boolean {
  if (config.type === "openai") {
    return true;
  }

  const baseUrl = config.baseUrl.toLowerCase();
  const model = config.model.toLowerCase();

  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return true;
  }

  if (
    model.startsWith("gpt-") ||
    model.startsWith("chatgpt-") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    return true;
  }

  return false;
}

export function toOpenAIMessages(
  messages: NormalizedMessage[],
  systemPrompt: string,
  config: Extract<ProviderConfig, { type: "openai" | "openai-compatible" }>,
): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [{ role: "system", content: systemPrompt }];
  const allowImageUrlInputs = supportsImageUrlInputs(config);

  for (const msg of messages) {
    if (msg.role === "tool_result") {
      result.push({ role: "tool", tool_call_id: msg.toolCallId, content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
      result.push({
        role: "assistant",
        content: hasToolCalls && !msg.content ? null : msg.content,
        ...(hasToolCalls
          ? {
              tool_calls: msg.toolCalls!.map(tc => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      });
      continue;
    }

    if (msg.role === "user" && msg.attachments && msg.attachments.length > 0) {
      if (!allowImageUrlInputs) {
        result.push({
          role: "user",
          content:
            msg.content ||
            "[Image attachments omitted because the current provider only accepts text inputs.]",
        });
        continue;
      }

      const parts: OpenAIContentPart[] = msg.attachments.map(att => ({
        type: "image_url" as const,
        image_url: { url: `data:${att.mimeType};base64,${att.data}` },
      }));
      if (msg.content) {
        parts.push({ type: "text" as const, text: msg.content });
      }
      result.push({ role: "user", content: parts });
      continue;
    }

    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map(part => {
      if (typeof part === "string") {
        return part;
      }

      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as { text?: unknown };
      if (typeof candidate.text === "string") {
        return candidate.text;
      }

      if (candidate.text && typeof candidate.text === "object" && "value" in candidate.text) {
        const value = (candidate.text as { value?: unknown }).value;
        return typeof value === "string" ? value : "";
      }

      return "";
    })
    .join("");
}

export function finalizeOpenAIStep(
  fullText: string,
  toolCallAccum: Record<number, { id: string; name: string; arguments: string }>,
): NormalizedStep {
  const toolCalls = Object.values(toolCallAccum)
    .filter(tc => tc.id && tc.name)
    .map(tc => ({
      id: tc.id,
      name: tc.name,
      input: tc.arguments ? JSON.parse(tc.arguments) as Record<string, unknown> : {},
    }));

  return {
    text: fullText.trim(),
    toolCalls,
    done: toolCalls.length === 0,
  };
}

export class OpenAIAdapter implements IProviderAdapter {
  private readonly config: Extract<ProviderConfig, { type: "openai" | "openai-compatible" }>;
  private readonly systemPrompt: string;

  constructor(
    config: Extract<ProviderConfig, { type: "openai" | "openai-compatible" }>,
    systemPrompt: string,
    _runtimeOptions: ProviderRuntimeOptions = {},
  ) {
    this.config = config;
    this.systemPrompt = systemPrompt;
  }

  async runStep(
    messages: NormalizedMessage[],
    tools: unknown[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<NormalizedStep> {
    const url = buildUrl(this.config);

    return await new Promise<NormalizedStep>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const transport = parsedUrl.protocol === "http:" ? http : https;
      const body = JSON.stringify({
        model: this.config.model,
        messages: toOpenAIMessages(messages, this.systemPrompt, this.config),
        tools,
        tool_choice: "auto",
        stream: true,
      });

      let buffer = "";
      let fullText = "";
      let loggedFirstChunkShape = false;
      const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};

      const processSseLine = (line: string): boolean => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) {
          return false;
        }

        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          return true;
        }

        let chunk: {
          choices?: Array<{
            delta?: {
              content?: unknown;
              reasoning?: string;
              reasoning_content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            message?: {
              content?: unknown;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };

        try {
          chunk = JSON.parse(payload);
        } catch {
          return false;
        }

        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (!loggedFirstChunkShape && choice) {
          loggedFirstChunkShape = true;
          console.log(
            "[Cain Stream] first chunk shape",
            JSON.stringify({
              hasDelta: !!choice.delta,
              deltaKeys: choice.delta ? Object.keys(choice.delta) : [],
              hasMessage: !!choice.message,
              messageKeys: choice.message ? Object.keys(choice.message) : [],
            }),
          );
        }

        const reasoningDelta =
          (typeof delta?.reasoning_content === "string" && delta.reasoning_content) ||
          (typeof delta?.reasoning === "string" && delta.reasoning) ||
          "";
        const textDelta =
          extractTextFromContent(delta?.content) ||
          extractTextFromContent(choice?.message?.content);

        if (textDelta) {
          fullText += textDelta;
          onToken(textDelta);
        } else if (reasoningDelta) {
          onToken(reasoningDelta);
        }

        const toolCalls = delta?.tool_calls ?? choice?.message?.tool_calls;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            if (!toolCallAccum[idx]) {
              toolCallAccum[idx] = { id: "", name: "", arguments: "" };
            }
            if (tc.id) toolCallAccum[idx].id = tc.id;
            if (tc.function?.name) toolCallAccum[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCallAccum[idx].arguments += tc.function.arguments;
          }
        }

        return false;
      };

      const req = transport.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || undefined,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        res => {
          if ((res.statusCode || 500) >= 400) {
            const chunks: Buffer[] = [];
            res.on("data", chunk => chunks.push(Buffer.from(chunk)));
            res.on("end", () => {
              const errorText = Buffer.concat(chunks).toString("utf8").trim();
              reject(
                new Error(
                  errorText || `OpenAI-compatible request failed: ${res.statusCode ?? 500}`,
                ),
              );
            });
            return;
          }

          res.setEncoding("utf8");
          res.on("data", chunk => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              processSseLine(line);
            }
          });
          res.on("end", () => {
            if (buffer) {
              processSseLine(buffer);
            }
            resolve(finalizeOpenAIStep(fullText, toolCallAccum));
          });
        },
      );

      req.on("error", reject);

      if (abortSignal) {
        if (abortSignal.aborted) {
          req.destroy(new Error("Request aborted"));
          return;
        }
        abortSignal.addEventListener(
          "abort",
          () => req.destroy(new Error("Request aborted")),
          { once: true },
        );
      }

      req.write(body);
      req.end();
    });
  }
}
