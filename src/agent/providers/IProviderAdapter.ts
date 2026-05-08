/**
 * Shared provider adapter contract.
 * Anthropic, OpenAI, and Claude CLI implementations all conform to this surface,
 * and AgentRunner depends only on this interface.
 */

export type NormalizedImageAttachment = {
  /** base64-encoded image data (without data URL prefix) */
  data: string;
  mimeType: string;
};

export type NormalizedMessage =
  | { role: "user"; content: string; attachments?: NormalizedImageAttachment[] }
  | {
      role: "assistant";
      content: string;
      /** DeepSeek thinking mode: chain-of-thought text, must be passed back to the API. */
      reasoningContent?: string;
      toolCalls?: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
    }
  | { role: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface NormalizedStep {
  /** Assistant text reply for the current step. May be empty. */
  text: string;
  /** Optional provider-supplied thinking summary for UI display only. */
  thinkingText?: string;
  /** DeepSeek thinking mode: raw reasoning_content to be stored and passed back on next turn. */
  reasoningContent?: string;
  /** Tool calls requested during the current step. */
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  /** True when the provider has completed the step without more tool calls. */
  done: boolean;
}

export interface IProviderAdapter {
  /**
   * Execute a single reasoning step.
   * @param messages Full conversation history excluding the system prompt wrapper.
   * @param tools Tool definitions exposed by toolRuntime.
   * @param onToken Streaming token callback.
   */
  runStep(
    messages: NormalizedMessage[],
    tools: unknown[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<NormalizedStep>;
}

/**
 * Provider configuration types (Spec §6.2.2).
 * openai-compatible requires an explicit baseUrl and must not rely on a hidden default.
 */
export type ProviderConfig =
  | { type: "anthropic"; apiKey: string; model: string; baseUrl?: string; timeoutMs?: number }
  | { type: "openai"; apiKey: string; model: string; baseUrl?: string; timeoutMs?: number }
  | { type: "openai-compatible"; apiKey: string; model: string; baseUrl: string; timeoutMs?: number }
  | { type: "claude-cli"; model?: string; cliPath?: string; timeoutMs?: number };
