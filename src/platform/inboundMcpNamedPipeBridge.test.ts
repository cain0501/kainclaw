import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InboundMcpExecutionBroker } from "./inboundMcpExecutionBroker";
import {
  InboundMcpBridgeUnavailableError,
  InboundMcpNamedPipeClient,
  InboundMcpNamedPipeHost,
} from "./inboundMcpNamedPipeBridge";

function testPipePath(): string {
  return `\\\\.\\pipe\\kainclaw-inbound-mcp-test-${randomUUID()}`;
}

describe("InboundMcpNamedPipeBridge", () => {
  it("registers, grants, validates, and fails closed after disconnect", async () => {
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "once" });
    const pipePath = testPipePath();
    const host = new InboundMcpNamedPipeHost(broker, pipePath, {
      executeChat: async request => ({ turnId: "turn-1", text: `reply:${request.prompt}` }),
    });
    await host.start();
    const client = new InboundMcpNamedPipeClient(pipePath);
    try {
      const registration = await client.connect("server-a");
      expect(registration.serverInstanceId).toBe("server-a");
      const grant = await client.requestGrant({
        toolName: "kainclaw_chat",
        sessionId: "session-a",
        promptSummary: "Summarize a test failure",
      });
      if (!grant.ok) throw new Error("Expected a grant");
      expect((await client.validateGrant(grant.grant.grantId, "kainclaw_chat", "session-a")).ok).toBe(true);
      const otherClient = new InboundMcpNamedPipeClient(pipePath);
      await otherClient.connect("server-b");
      await expect(otherClient.validateGrant(grant.grant.grantId, "kainclaw_chat", "session-a"))
        .resolves.toEqual({ ok: false, reason: "connection_mismatch" });
      otherClient.close();
      expect((await client.consumeGrant(grant.grant.grantId, "kainclaw_chat", "session-a")).ok).toBe(true);
      expect(await client.validateGrant(grant.grant.grantId, "kainclaw_chat", "session-a"))
        .toEqual({ ok: false, reason: "unknown_grant" });
      client.close();
      await expect(client.requestGrant({ toolName: "kainclaw_chat", sessionId: "session-a", promptSummary: "again" }))
        .rejects.toBeInstanceOf(InboundMcpBridgeUnavailableError);
    } finally {
      client.close();
      await host.stop();
    }
  });

  it("consumes a matching chat grant before running the Electron callback", async () => {
    const pipePath = testPipePath();
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "once" });
    const host = new InboundMcpNamedPipeHost(broker, pipePath, {
      executeChat: async request => ({ turnId: "turn-1", text: `reply:${request.prompt}` }),
    });
    await host.start();
    const client = new InboundMcpNamedPipeClient(pipePath);
    try {
      await client.connect("server-a");
      const grant = await client.requestGrant({ toolName: "kainclaw_chat", sessionId: "session-a", promptSummary: "hello" });
      if (!grant.ok) throw new Error("Expected a grant");
      await expect(client.executeChat(grant.grant.grantId, "session-a", "hello"))
        .resolves.toEqual({ ok: true, turnId: "turn-1", text: "reply:hello" });
      await expect(client.executeChat(grant.grant.grantId, "session-a", "again"))
        .resolves.toEqual({ ok: false, error: "unavailable" });
    } finally {
      client.close();
      await host.stop();
    }
  });

  it("returns a safe unavailable error when no Electron bridge is listening", async () => {
    const client = new InboundMcpNamedPipeClient(testPipePath());
    await expect(client.connect("server-a")).rejects.toBeInstanceOf(InboundMcpBridgeUnavailableError);
  });
});
