import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "./IProviderAdapter";
import type { ProviderConfig } from "./IProviderAdapter";
import { getAppliedEffortLevel, modelSupportsNativeEffort } from "../../thinkingEffort/effort";
import {
  FAST_MODE_BETA_HEADER,
  getFastModeOverageDisabledMessage,
  getFastModeCooldownResetAt,
  isFastModeRejectedByApi,
  isFastModeCooldown,
  modelSupportsFastMode,
  shouldPersistFastModeOffForOverage,
  triggerFastModeCooldown,
} from "../../thinkingEffort/fastMode";
import {
  EFFORT_BETA_HEADER,
  INTERLEAVED_THINKING_BETA_HEADER,
} from "../../thinkingEffort/thinking";
import type {
  FastModeDisabledEvent,
  ProviderRequestMetrics,
  ProviderRuntimeOptions,
} from "../../thinkingEffort/types";

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type AnthropicImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicImageBlock;

type AnthropicRequestMessage = {
  role: "user" | "assistant";
  content: string | AnthropicBlock[] | Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }>;
};

type OpenAIToolPayload = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

type AnthropicTool = { name: string; description?: string; input_schema: unknown };
type AnthropicThinking =
  | { type: "adaptive" }
  | { type: "enabled"; budget_tokens: number };

type AnthropicResponseUsageEvent = {
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

const ANTHROPIC_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function toAnthropicTools(tools: unknown[]): AnthropicTool[] {
  return tools.map(t => {
    const tool = t as OpenAIToolPayload;
    return {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      input_schema: tool.function.parameters ?? { type: "object", properties: {} },
    };
  });
}

export function buildUrl(baseUrl?: string): string {
  const root = (baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  if (root.endsWith("/messages")) return root;
  if (root.endsWith("/v1")) return `${root}/messages`;
  return `${root}/v1/messages`;
}

export function parseRetryAfterMs(headerValue: string | string[] | undefined): number | null {
  const value = getSingleHeaderValue(headerValue);
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}

export function getSingleHeaderValue(
  headerValue: string | string[] | undefined,
): string | null {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function parseErrorMessage(errBody: string, statusCode: number): string {
  try {
    const data = JSON.parse(errBody) as { error?: { message?: string } };
    return data.error?.message || `Anthropic request failed: ${statusCode}`;
  } catch {
    return `Anthropic request failed: ${statusCode}`;
  }
}

export function toAnthropicThinking(
  options: ProviderRuntimeOptions,
  maxTokens: number,
): AnthropicThinking | undefined {
  const thinkingConfig = options.thinkingConfig;
  if (!thinkingConfig) {
    return undefined;
  }

  if (thinkingConfig.type === "adaptive") {
    return { type: "adaptive" };
  }

  return {
    type: "enabled",
    budget_tokens: Math.min(thinkingConfig.budgetTokens, Math.max(1, maxTokens - 1)),
  };
}

function getDecodedAttachmentSizeBytes(data: string): number {
  return Buffer.byteLength(data, "base64");
}

function buildAnthropicUserContent(
  message: Extract<NormalizedMessage, { role: "user" }>,
): AnthropicBlock[] | string {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return message.content;
  }

  const allowedMime = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const content: AnthropicBlock[] = [];
  let skippedForSize = 0;

  for (const attachment of attachments) {
    if (getDecodedAttachmentSizeBytes(attachment.data) > ANTHROPIC_MAX_IMAGE_BYTES) {
      skippedForSize += 1;
      continue;
    }

    const mediaType = allowedMime.has(attachment.mimeType)
      ? attachment.mimeType
      : "image/png";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: attachment.data },
    });
  }

  if (message.content) {
    content.push({ type: "text", text: message.content });
  }

  if (skippedForSize > 0) {
    const label =
      skippedForSize === 1
        ? "One earlier image attachment was omitted"
        : `${skippedForSize} earlier image attachments were omitted`;
    content.push({
      type: "text",
      text: `[${label} because the current Anthropic provider only accepts images up to 5 MB each.]`,
    });
  }

  if (content.length === 0) {
    return "[An earlier image attachment was omitted because the current Anthropic provider only accepts images up to 5 MB each.]";
  }

  return content;
}

export function toAnthropicMessages(messages: NormalizedMessage[]): AnthropicRequestMessage[] {
  const result: AnthropicRequestMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "tool_result") {
      const last = result[result.length - 1];
      const block = {
        type: "tool_result" as const,
        tool_use_id: msg.toolCallId,
        content: msg.content,
        is_error: msg.isError,
      };

      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as unknown[]).push(block);
      } else {
        result.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: AnthropicBlock[] = [];
        if (msg.content) content.push({ type: "text", text: msg.content });
        for (const tc of msg.toolCalls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
        result.push({ role: "assistant", content });
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
      continue;
    }

    if (msg.role === "user" && msg.attachments && msg.attachments.length > 0) {
      result.push({ role: "user", content: buildAnthropicUserContent(msg) });
      continue;
    }

    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

function emitAnthropicRequestMetrics(options: {
  runtimeOptions: ProviderRuntimeOptions;
  config: Extract<ProviderConfig, { type: "anthropic" }>;
  tools: unknown[];
  systemPrompt: string;
  body: string;
}): void {
  const metrics: ProviderRequestMetrics = {
    provider: "anthropic",
    requestKind: options.runtimeOptions.requestKind ?? "main",
    model: options.config.model,
    toolCount: options.tools.length,
    systemPromptChars: options.systemPrompt.length,
    requestBodyBytes: Buffer.byteLength(options.body),
    usedPromptCache: false,
    promptCacheStatus: "unsupported",
  };
  options.runtimeOptions.onRequestMetrics?.(metrics);
  if (process.env.KAINCLAW_DEBUG_PROMPT_COST === "1") {
    console.debug("[anthropic-request-metrics]", JSON.stringify(metrics));
  }
}

function maybeLogAnthropicUsageEvent(event: AnthropicResponseUsageEvent): void {
  if (process.env.KAINCLAW_DEBUG_PROMPT_COST !== "1") {
    return;
  }
  const usage = event.usage;
  if (!usage) {
    return;
  }
  console.debug(
    "[anthropic-response-usage]",
    JSON.stringify({
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? null,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? null,
      promptCacheStatus: "unsupported_in_adapter",
    }),
  );
}

export class AnthropicAdapter implements IProviderAdapter {
  private readonly config: Extract<ProviderConfig, { type: "anthropic" }>;
  private readonly systemPrompt: string;
  private readonly runtimeOptions: ProviderRuntimeOptions;

  constructor(
    config: Extract<ProviderConfig, { type: "anthropic" }>,
    systemPrompt = "",
    runtimeOptions: ProviderRuntimeOptions = {},
  ) {
    this.config = config;
    this.systemPrompt = systemPrompt;
    this.runtimeOptions = runtimeOptions;
  }

  async runStep(
    messages: NormalizedMessage[],
    tools: unknown[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<NormalizedStep> {
    const url = buildUrl(this.config.baseUrl);
    const notifyFastModeDisabled = async (
      event: FastModeDisabledEvent,
    ): Promise<void> => {
      try {
        await this.runtimeOptions.onFastModeDisabled?.(event);
      } catch {
        // Fast-mode downgrade should not break the main request path.
      }
    };

    const runRequest = (allowFastFallback: boolean): Promise<NormalizedStep> =>
      new Promise<NormalizedStep>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const transport = parsedUrl.protocol === "http:" ? http : https;
      const maxTokens = 8096;
      const thinking = toAnthropicThinking(this.runtimeOptions, maxTokens);
      const outputConfig: Record<string, unknown> = {};
      const betaHeaders: string[] = [];
      const fastMode =
        this.runtimeOptions.fastMode === true &&
        modelSupportsFastMode(this.config) &&
        !isFastModeCooldown();

      if (thinking) {
        betaHeaders.push(INTERLEAVED_THINKING_BETA_HEADER);
      }

      if (modelSupportsNativeEffort(this.config)) {
        betaHeaders.push(EFFORT_BETA_HEADER);
        const appliedEffort = getAppliedEffortLevel(
          this.config,
          this.runtimeOptions.effortLevel,
        );
        if (appliedEffort) {
          outputConfig.effort = appliedEffort;
        }
      }

      if (fastMode) {
        betaHeaders.push(FAST_MODE_BETA_HEADER);
      }

      const body = JSON.stringify({
        model: this.config.model,
        max_tokens: maxTokens,
        ...(this.systemPrompt ? { system: this.systemPrompt } : {}),
        messages: toAnthropicMessages(messages),
        tools: toAnthropicTools(tools),
        ...(thinking ? { thinking } : {}),
        ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
        ...(fastMode ? { speed: "fast" } : {}),
        stream: true,
      });
      emitAnthropicRequestMetrics({
        runtimeOptions: this.runtimeOptions,
        config: this.config,
        tools,
        systemPrompt: this.systemPrompt,
        body,
      });

      let buffer = "";
      const toolUseAccum: Record<number, { id: string; name: string; inputJson: string }> = {};
      const thinkingAccum: Record<number, string> = {};
      let fullText = "";

      const processSseLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) return;

        const payload = trimmed.slice(6);
        let event: {
          type?: string;
          index?: number;
          content_block?: { type?: string; id?: string; name?: string };
          delta?: { type?: string; text?: string; partial_json?: string; thinking?: string };
        };

        try {
          event = JSON.parse(payload);
        } catch {
          return;
        }

        maybeLogAnthropicUsageEvent(event as AnthropicResponseUsageEvent);

        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block?.type === "tool_use" && event.index !== undefined) {
            toolUseAccum[event.index] = { id: block.id ?? "", name: block.name ?? "", inputJson: "" };
          }
          if (block?.type === "thinking" && event.index !== undefined) {
            thinkingAccum[event.index] = "";
          }
          return;
        }

        if (event.type === "content_block_delta" && event.index !== undefined) {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            fullText += delta.text;
            onToken(delta.text);
          } else if (delta?.type === "input_json_delta" && delta.partial_json && toolUseAccum[event.index]) {
            toolUseAccum[event.index].inputJson += delta.partial_json;
          } else if (delta?.type === "thinking_delta" && delta.thinking && thinkingAccum[event.index] !== undefined) {
            thinkingAccum[event.index] += delta.thinking;
          }
        }
      };

      const req = transport.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "anthropic-version": "2023-06-01",
          ...(betaHeaders.length > 0 ? { "anthropic-beta": betaHeaders.join(",") } : {}),
          "x-api-key": this.config.apiKey,
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Length": Buffer.byteLength(body),
        },
      }, res => {
        if ((res.statusCode ?? 0) >= 400) {
          let errBody = "";
          res.on("data", chunk => {
            errBody += chunk.toString("utf8");
          });
          res.on("end", () => {
            void (async () => {
              const statusCode = res.statusCode ?? 0;
              const message = parseErrorMessage(errBody, statusCode);

              if (fastMode && allowFastFallback) {
                const overageReason = getSingleHeaderValue(
                  res.headers["anthropic-ratelimit-unified-overage-disabled-reason"],
                );
                if (statusCode === 429 && overageReason) {
                  await notifyFastModeDisabled({
                    type: "overage",
                    reason: overageReason,
                    message: getFastModeOverageDisabledMessage(overageReason),
                    persistPreferenceOff: shouldPersistFastModeOffForOverage(
                      overageReason,
                    ),
                  });
                  void runRequest(false).then(resolve, reject);
                  return;
                }

                if (isFastModeRejectedByApi(statusCode, message)) {
                  await notifyFastModeDisabled({
                    type: "rejected",
                    message:
                      "Fast mode was rejected by the API and has been switched back to the standard response path.",
                    persistPreferenceOff: true,
                  });
                  void runRequest(false).then(resolve, reject);
                  return;
                }

                if (statusCode === 429 || statusCode === 529) {
                  const retryAfterMs = parseRetryAfterMs(res.headers["retry-after"]);
                  triggerFastModeCooldown(
                    getFastModeCooldownResetAt(retryAfterMs),
                    statusCode === 529 ? "overloaded" : "rate_limit",
                  );
                  void runRequest(false).then(resolve, reject);
                  return;
                }
              }

              reject(new Error(message));
            })().catch(reject);
          });
          return;
        }

        res.on("data", chunk => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            processSseLine(line);
          }
        });

        res.on("end", () => {
          if (buffer.trim()) {
            processSseLine(buffer);
          }

          const toolCalls = Object.values(toolUseAccum).map(tu => {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(tu.inputJson || "{}") as Record<string, unknown>;
            } catch {
              // Ignore malformed partial JSON and surface whatever text we already have.
            }
            return { id: tu.id, name: tu.name, input };
          });
          const thinkingText = Object.entries(thinkingAccum)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([, thinking]) => thinking.trim())
            .filter(Boolean)
            .join("\n\n");

          resolve({
            text: fullText,
            ...(thinkingText ? { thinkingText } : {}),
            toolCalls,
            done: toolCalls.length === 0,
          });
        });

        res.on("error", reject);
      });

      req.on("error", reject);

      const abortHandler = () => {
        req.destroy(new Error("Anthropic request aborted"));
      };
      abortSignal?.addEventListener("abort", abortHandler, { once: true });

      if (this.config.timeoutMs) {
        req.setTimeout(this.config.timeoutMs, () => {
          req.destroy(new Error("Anthropic request timeout"));
        });
      }

      req.write(body);
      req.end();
    });

    return await runRequest(true);
  }
}
