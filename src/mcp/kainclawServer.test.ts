import { describe, expect, it } from "vitest";
import {
  createKainClawInboundSessionHandlers,
  createKainClawServerInfoHandler,
  kainClawServerInfo,
  kainClawToolDefinitions,
} from "./kainclawServer";
import { KainClawInboundSessionStore } from "./kainclawInboundSessionStore";

describe("KainClaw MCP server", () => {
  it("keeps user-data tools unavailable while declaring isolated session lifecycle annotations", () => {
    expect(kainClawToolDefinitions.map(tool => tool.name)).toEqual([
      "kainclaw_server_info",
      "kainclaw_open_session",
      "kainclaw_list_sessions",
      "kainclaw_close_session",
    ]);
    expect(kainClawToolDefinitions.filter(tool => tool.annotations.readOnlyHint)
      .map(tool => tool.name)).toEqual(["kainclaw_server_info", "kainclaw_list_sessions"]);
    expect(kainClawToolDefinitions.find(tool => tool.name === "kainclaw_close_session")?.annotations)
      .toMatchObject({ destructiveHint: true });
  });

  it("returns static server capability data without user state", async () => {
    const result = await createKainClawServerInfoHandler()();
    const first = result.content[0];

    expect(first).toMatchObject({ type: "text" });
    expect(JSON.parse((first as { text: string }).text)).toEqual(kainClawServerInfo);
  });

  it("creates and closes sessions through a process-local store only", async () => {
    const handlers = createKainClawInboundSessionHandlers(new KainClawInboundSessionStore());
    const opened = await handlers.openSession({ label: "External client" });
    const sessionId = JSON.parse((opened.content[0] as { text: string }).text).session.sessionId;

    const listed = await handlers.listSessions();
    expect(JSON.parse((listed.content[0] as { text: string }).text)).toMatchObject({
      sessions: [{ sessionId, label: "External client" }],
    });

    await expect(handlers.closeSession({ sessionId })).resolves.toMatchObject({
      content: [{ type: "text" }],
    });
    const afterClose = await handlers.listSessions();
    expect(JSON.parse((afterClose.content[0] as { text: string }).text)).toEqual({ sessions: [] });
  });
});
