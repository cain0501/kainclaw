import { describe, expect, it } from "vitest";
import {
  createKainClawServerInfoHandler,
  kainClawServerInfo,
  kainClawToolDefinitions,
} from "./kainclawServer";

describe("KainClaw MCP server", () => {
  it("exposes only a harmless read-only capability tool", () => {
    expect(kainClawToolDefinitions).toEqual([
      {
        name: "kainclaw_server_info",
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
    ]);
  });

  it("returns static server capability data without user state", async () => {
    const result = await createKainClawServerInfoHandler()();
    const first = result.content[0];

    expect(first).toMatchObject({ type: "text" });
    expect(JSON.parse((first as { text: string }).text)).toEqual(kainClawServerInfo);
  });
});
