import { describe, expect, it } from "vitest";
import { InboundMcpExecutionBroker } from "./inboundMcpExecutionBroker";

const request = (connectionId: string, serverInstanceId: string) => ({
  connectionId,
  serverInstanceId,
  toolName: "kainclaw_chat",
  sessionId: "inbound-session",
  sessionLabel: "External client",
  promptSummary: "Help with a TypeScript error",
});

describe("InboundMcpExecutionBroker", () => {
  it("fails closed when approval is denied", async () => {
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "deny" });
    const connection = broker.register("server-a");

    await expect(broker.requestGrant(request(connection.connectionId, "server-a")))
      .resolves.toEqual({ ok: false, reason: "denied" });
  });

  it("binds grants to their connection, tool, and inbound session", async () => {
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "session" });
    const connection = broker.register("server-a");
    const result = await broker.requestGrant(request(connection.connectionId, "server-a"));
    if (!result.ok) throw new Error("Expected a grant");

    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: result.grant.grantId }))
      .toEqual({ ok: true, grant: result.grant });
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), toolName: "kainclaw_image", grantId: result.grant.grantId }))
      .toEqual({ ok: false, reason: "tool_mismatch" });
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), sessionId: "other-session", grantId: result.grant.grantId }))
      .toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("consumes once grants and retains session grants", async () => {
    const decisions: Array<"once" | "session"> = ["once", "session"];
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => decisions.shift() ?? "deny" });
    const connection = broker.register("server-a");
    const once = await broker.requestGrant(request(connection.connectionId, "server-a"));
    const session = await broker.requestGrant(request(connection.connectionId, "server-a"));
    if (!once.ok || !session.ok) throw new Error("Expected grants");

    expect(broker.consumeGrant({ ...request(connection.connectionId, "server-a"), grantId: once.grant.grantId }).ok).toBe(true);
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: once.grant.grantId }))
      .toEqual({ ok: false, reason: "unknown_grant" });
    expect(broker.consumeGrant({ ...request(connection.connectionId, "server-a"), grantId: session.grant.grantId }).ok).toBe(true);
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: session.grant.grantId }).ok).toBe(true);
  });

  it("expires, revokes, and clears grants when a connection disconnects", async () => {
    let now = 1_000;
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "session", now: () => now, grantTtlMs: 100 });
    const connection = broker.register("server-a");
    const expired = await broker.requestGrant(request(connection.connectionId, "server-a"));
    if (!expired.ok) throw new Error("Expected a grant");
    now = 1_100;
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: expired.grant.grantId }))
      .toEqual({ ok: false, reason: "expired" });

    const revocable = await broker.requestGrant(request(connection.connectionId, "server-a"));
    if (!revocable.ok) throw new Error("Expected a grant");
    expect(broker.revokeGrant("another-connection", revocable.grant.grantId)).toBe(false);
    expect(broker.revokeGrant(connection.connectionId, revocable.grant.grantId)).toBe(true);
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: revocable.grant.grantId }))
      .toEqual({ ok: false, reason: "unknown_grant" });

    const disconnected = await broker.requestGrant(request(connection.connectionId, "server-a"));
    if (!disconnected.ok) throw new Error("Expected a grant");
    broker.disconnect(connection.connectionId);
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: disconnected.grant.grantId }))
      .toEqual({ ok: false, reason: "unknown_grant" });
  });

  it("revokes every active inbound grant on an explicit user action", async () => {
    const broker = new InboundMcpExecutionBroker({ requestApproval: async () => "session" });
    const connection = broker.register("server-a");
    const first = await broker.requestGrant(request(connection.connectionId, "server-a"));
    const second = await broker.requestGrant({ ...request(connection.connectionId, "server-a"), sessionId: "another-session" });
    if (!first.ok || !second.ok) throw new Error("Expected grants");

    expect(broker.revokeAllGrants()).toBe(2);
    expect(broker.validateGrant({ ...request(connection.connectionId, "server-a"), grantId: first.grant.grantId }))
      .toEqual({ ok: false, reason: "unknown_grant" });
  });
});
