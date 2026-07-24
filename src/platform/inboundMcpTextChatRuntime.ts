import type { NormalizedMessage, NormalizedStep } from "../agent/providers/IProviderAdapter";

export const INBOUND_MCP_MAX_PROMPT_CHARS = 16_000;
export const INBOUND_MCP_MAX_RESPONSE_CHARS = 32_000;

export type InboundMcpTextChatRequest = {
  serverInstanceId: string;
  sessionId: string;
  prompt: string;
};

export type InboundMcpTextChatResult = {
  turnId: string;
  text: string;
};

export type InboundMcpTextTurnRunner = (messages: NormalizedMessage[]) => Promise<NormalizedStep>;

/** Text-only, process-local inbound context. It is intentionally separate from desktop sessions. */
export class InboundMcpTextChatRuntime {
  private readonly contexts = new Map<string, NormalizedMessage[]>();
  private nextTurn = 1;

  constructor(private readonly runTextTurn: InboundMcpTextTurnRunner) {}

  async execute(request: InboundMcpTextChatRequest): Promise<InboundMcpTextChatResult> {
    const prompt = request.prompt.trim();
    if (!prompt) throw new InboundMcpTextChatError("invalid_prompt", "The prompt must not be empty.");
    if (prompt.length > INBOUND_MCP_MAX_PROMPT_CHARS) {
      throw new InboundMcpTextChatError("prompt_too_large", "The prompt exceeds the inbound MCP limit.");
    }
    const key = this.contextKey(request.serverInstanceId, request.sessionId);
    const previous = this.contexts.get(key) ?? [];
    const messages: NormalizedMessage[] = [...previous, { role: "user", content: prompt }];
    let step: NormalizedStep;
    try {
      step = await this.runTextTurn(messages);
    } catch {
      throw new InboundMcpTextChatError("provider_failed", "KainClaw could not complete the requested chat turn.");
    }
    const text = step.text.trim().slice(0, INBOUND_MCP_MAX_RESPONSE_CHARS);
    if (!text) throw new InboundMcpTextChatError("provider_failed", "KainClaw returned no text response.");
    this.contexts.set(key, [...messages, { role: "assistant", content: text }]);
    return { turnId: `inbound-turn-${this.nextTurn++}`, text };
  }

  closeSession(serverInstanceId: string, sessionId: string): void {
    this.contexts.delete(this.contextKey(serverInstanceId, sessionId));
  }

  disconnect(serverInstanceId: string): void {
    for (const key of this.contexts.keys()) {
      if (key.startsWith(`${serverInstanceId}:`)) this.contexts.delete(key);
    }
  }

  clearAll(): void {
    this.contexts.clear();
  }

  private contextKey(serverInstanceId: string, sessionId: string): string {
    return `${serverInstanceId}:${sessionId}`;
  }
}

export class InboundMcpTextChatError extends Error {
  constructor(
    readonly code: "invalid_prompt" | "prompt_too_large" | "provider_failed",
    message: string,
  ) {
    super(message);
    this.name = "InboundMcpTextChatError";
  }
}
