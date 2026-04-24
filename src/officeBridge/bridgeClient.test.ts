import { describe, expect, it, vi } from "vitest";
import {
  buildOfficeBridgeHeaders,
  consumeOfficeBridgeSseBuffer,
  createOfficeBridgeClient,
  toOfficeBridgeProxyMessages,
} from "./bridgeClient";

describe("officeBridge bridgeClient", () => {
  it("builds auth and source headers for protected routes", () => {
    expect(
      buildOfficeBridgeHeaders(
        {
          source: "word-addin",
          sessionId: "shared-session-1",
          authToken: "bridge-auth-1",
        },
        true,
      ),
    ).toEqual({
      Authorization: "Bearer bridge-auth-1",
      "Content-Type": "application/json",
      "X-KainClaw-Source": "word-addin",
    });
  });

  it("registers an add-in and returns the session/auth payload", async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ source: "word-addin" }));

      return new Response(
        JSON.stringify({
          sessionId: "shared-session-2",
          authToken: "bridge-auth-2",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const client = createOfficeBridgeClient({
      fetchFn,
    });

    await expect(client.register("word-addin")).resolves.toEqual({
      source: "word-addin",
      sessionId: "shared-session-2",
      authToken: "bridge-auth-2",
      addin: undefined,
    });
  });

  it("defaults appended message source to the session source", async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.source).toBe("word-addin");

      return new Response(
        JSON.stringify({
          ok: true,
          message: {
            id: "msg-1",
            role: "user",
            content: body.content,
            source: body.source,
            timestamp: 100,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const client = createOfficeBridgeClient({
      fetchFn,
    });

    await expect(
      client.appendMessage(
        {
          source: "word-addin",
          sessionId: "shared-session-3",
          authToken: "bridge-auth-3",
        },
        {
          role: "user",
          content: "hello from word",
        },
      ),
    ).resolves.toMatchObject({
      id: "msg-1",
      role: "user",
      source: "word-addin",
    });
  });

  it("maps stored bridge context into proxy messages", () => {
    expect(
      toOfficeBridgeProxyMessages({
        sessionId: "shared-session-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "first question",
            source: "word-addin",
            timestamp: 1,
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "first answer",
            source: "word-addin",
            timestamp: 2,
          },
        ],
      }),
    ).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
  });

  it("parses chunked SSE buffers into structured events", () => {
    const first = consumeOfficeBridgeSseBuffer(
      'event: token\ndata: {"token":"hel"}\n\n' +
      'event: token\ndata: {"token":"lo"}\n\n' +
      'event: step\ndata: {"step":{"text":"done"}}',
    );

    expect(first.events).toEqual([
      { event: "token", data: { token: "hel" } },
      { event: "token", data: { token: "lo" } },
    ]);

    const second = consumeOfficeBridgeSseBuffer(`${first.remainder}\n\n`);
    expect(second.events).toEqual([
      { event: "step", data: { step: { text: "done" } } },
    ]);
  });
});
