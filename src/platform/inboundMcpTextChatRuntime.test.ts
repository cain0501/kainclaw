import { describe, expect, it } from "vitest";
import {
  InboundMcpTextChatError,
  InboundMcpTextChatRuntime,
  INBOUND_MCP_MAX_PROMPT_CHARS,
  INBOUND_MCP_MAX_RESPONSE_CHARS,
} from "./inboundMcpTextChatRuntime";

describe("InboundMcpTextChatRuntime", () => {
  it("keeps text context isolated by server instance and inbound session", async () => {
    const calls: string[][] = [];
    const runtime = new InboundMcpTextChatRuntime(async messages => {
      calls.push(messages.map(message => message.content));
      return { text: "safe reply", toolCalls: [], done: true };
    });

    await runtime.execute({ serverInstanceId: "server-a", sessionId: "one", prompt: "first" });
    await runtime.execute({ serverInstanceId: "server-a", sessionId: "one", prompt: "second" });
    await runtime.execute({ serverInstanceId: "server-b", sessionId: "one", prompt: "separate" });

    expect(calls).toEqual([["first"], ["first", "safe reply", "second"], ["separate"]]);
  });

  it("limits input and output while returning no provider internals", async () => {
    const runtime = new InboundMcpTextChatRuntime(async () => ({
      text: "x".repeat(INBOUND_MCP_MAX_RESPONSE_CHARS + 1),
      toolCalls: [{ id: "hidden", name: "run_command", input: {} }],
      thinkingText: "hidden",
      done: true,
    }));
    const result = await runtime.execute({ serverInstanceId: "server-a", sessionId: "one", prompt: "hello" });

    expect(result).toEqual({ turnId: "inbound-turn-1", text: "x".repeat(INBOUND_MCP_MAX_RESPONSE_CHARS) });
    await expect(runtime.execute({ serverInstanceId: "server-a", sessionId: "one", prompt: "x".repeat(INBOUND_MCP_MAX_PROMPT_CHARS + 1) }))
      .rejects.toMatchObject({ code: "prompt_too_large" } satisfies Partial<InboundMcpTextChatError>);
  });

  it("cleans up context and normalizes provider failures", async () => {
    const runtime = new InboundMcpTextChatRuntime(async () => { throw new Error("provider secret"); });
    await expect(runtime.execute({ serverInstanceId: "server-a", sessionId: "one", prompt: "hello" }))
      .rejects.toEqual(new InboundMcpTextChatError("provider_failed", "KainClaw could not complete the requested chat turn."));
  });
});
