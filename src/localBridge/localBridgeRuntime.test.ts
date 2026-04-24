import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalBridgeRuntime } from "./localBridgeRuntime";

describe("LocalBridgeRuntime", () => {
  let bridge: LocalBridgeRuntime;

  beforeEach(() => {
    bridge = new LocalBridgeRuntime();
  });

  afterEach(async () => {
    if (bridge.isRunning()) {
      await bridge.stop();
    }
  });

  it("default port is 52358 before starting", () => {
    expect(bridge.getPort()).toBe(52358);
  });

  it("isRunning() is false before start()", () => {
    expect(bridge.isRunning()).toBe(false);
  });

  it("isRunning() is true after start()", async () => {
    await bridge.start({ port: 0 });
    expect(bridge.isRunning()).toBe(true);
  });

  it("isRunning() is false after stop()", async () => {
    await bridge.start({ port: 0 });
    await bridge.stop();
    expect(bridge.isRunning()).toBe(false);
  });

  it("getPort() returns assigned port after start()", async () => {
    await bridge.start({ port: 0 });
    const port = bridge.getPort();
    expect(port).toBeGreaterThan(0);
  });

  it("repeated start() is idempotent", async () => {
    await bridge.start({ port: 0 });
    const port = bridge.getPort();
    await bridge.start({ port: 0 });
    expect(bridge.getPort()).toBe(port);
    expect(bridge.isRunning()).toBe(true);
  });

  it("stop() on stopped bridge is idempotent", async () => {
    await bridge.start({ port: 0 });
    await bridge.stop();
    await expect(bridge.stop()).resolves.toBeUndefined();
    expect(bridge.isRunning()).toBe(false);
  });

  it("can start again after stop()", async () => {
    await bridge.start({ port: 0 });
    await bridge.stop();
    await bridge.start({ port: 0 });
    expect(bridge.isRunning()).toBe(true);
  });

  it("onAddinRegistered returns unsubscribe function", () => {
    const handler = vi.fn();
    const unsubscribe = bridge.onAddinRegistered(handler);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("getAddinStatus returns undefined for unknown addin", () => {
    expect(bridge.getAddinStatus("unknown")).toBeUndefined();
  });

  it("serves health details after starting", async () => {
    await bridge.start({ port: 0 });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      version: "1.0",
      port: bridge.getPort(),
    });
  });

  it("returns provider config from the runtime callback", async () => {
    await bridge.start({
      port: 0,
      getProviderConfig: () => ({
        providerType: "openai-compatible",
        model: "qwen-max",
        baseUrl: "https://example.invalid/v1",
        licenseActive: true,
        proxyMode: true,
      }),
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/config`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      providerType: "openai-compatible",
      model: "qwen-max",
      baseUrl: "https://example.invalid/v1",
      licenseActive: true,
      proxyMode: true,
    });
  });

  it("registers add-ins through HTTP and emits runtime updates", async () => {
    const onRegistered = vi.fn();
    const onStatusChanged = vi.fn();
    bridge.onAddinRegistered(onRegistered);
    bridge.onStatusChanged(onStatusChanged);

    await bridge.start({
      port: 0,
      resolveSessionId: () => "shared-session-1",
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://word.officeapps.live.com",
      },
      body: JSON.stringify({
        source: "word-addin",
        name: "Word Add-in",
        version: "0.1.0",
        capabilities: ["document.read", "document.write"],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      sessionId: "shared-session-1",
      addin: {
        id: "word-addin",
        name: "Word Add-in",
        version: "0.1.0",
        capabilities: ["document.read", "document.write"],
      },
    });
    expect(bridge.getAddinStatus("word-addin")).toMatchObject({
      connectionStatus: "connected",
      addin: {
        id: "word-addin",
        name: "Word Add-in",
      },
    });
    expect(bridge.getStatus().addins).toHaveLength(1);
    expect(bridge.getStatus().sessionId).toBe("shared-session-1");
    expect(onRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ id: "word-addin", name: "Word Add-in" }),
    );
    expect(onStatusChanged).toHaveBeenCalled();
  });

  it("rejects requests from disallowed origins", async () => {
    await bridge.start({ port: 0 });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/config`, {
      headers: {
        Origin: "https://malicious.example.com",
      },
    });

    expect(response.status).toBe(403);
  });

  it("returns a non-streaming proxy step as JSON", async () => {
    const handleProxyRequest = vi.fn(async (request, options) => {
      expect(request).toEqual({
        messages: [{ role: "user", content: "hello bridge" }],
        tools: [{ type: "function", function: { name: "echo" } }],
        stream: false,
      });
      options.onToken("ignored");
      return {
        text: "proxy reply",
        toolCalls: [],
        done: true,
      };
    });

    await bridge.start({
      port: 0,
      handleProxyRequest,
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello bridge" }],
        tools: [{ type: "function", function: { name: "echo" } }],
        stream: false,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      step: {
        text: "proxy reply",
        toolCalls: [],
        done: true,
      },
    });
    expect(handleProxyRequest).toHaveBeenCalledTimes(1);
  });

  it("streams proxy tokens and the final step over SSE", async () => {
    await bridge.start({
      port: 0,
      handleProxyRequest: async (_request, options) => {
        options.onToken("chunk-a");
        options.onToken("chunk-b");
        return {
          text: "final reply",
          toolCalls: [],
          done: true,
        };
      },
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "stream please" }],
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('event: ready');
    expect(body).toContain('event: token');
    expect(body).toContain('"token":"chunk-a"');
    expect(body).toContain('"token":"chunk-b"');
    expect(body).toContain('event: step');
    expect(body).toContain('"text":"final reply"');
    expect(body).toContain('event: done');
  });

  it("returns 503 for proxy requests when no proxy handler is configured", async () => {
    await bridge.start({ port: 0 });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello bridge" }],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Local bridge proxy is not configured",
    });
  });

  it("reuses the same session id across multiple registrations", async () => {
    const resolveSessionId = vi.fn(async () => "shared-session-2");
    await bridge.start({
      port: 0,
      resolveSessionId,
    });

    const firstResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "word-addin",
      }),
    });
    const firstBody = await firstResponse.json() as { sessionId: string };

    const secondResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "excel-addin",
      }),
    });
    const secondBody = await secondResponse.json() as { sessionId: string };

    expect(firstBody.sessionId).toBe("shared-session-2");
    expect(secondBody.sessionId).toBe("shared-session-2");
    expect(resolveSessionId).toHaveBeenCalledTimes(1);
    expect(bridge.getStatus().sessionId).toBe("shared-session-2");
  });

  it("returns the auth token from register when bridge auth is enabled", async () => {
    await bridge.start({
      port: 0,
      authToken: "bridge-auth-token",
      resolveSessionId: () => "shared-session-auth",
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "word-addin",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      sessionId: "shared-session-auth",
      authToken: "bridge-auth-token",
    });
  });

  it("returns persisted session context over HTTP", async () => {
    await bridge.start({
      port: 0,
      getSessionContext: async sessionId => ({
        sessionId,
        updatedAt: 123,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "hello from excel",
            source: "excel",
            timestamp: 123,
          },
        ],
      }),
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-3/context`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      sessionId: "shared-session-3",
      updatedAt: 123,
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "hello from excel",
          source: "excel",
          timestamp: 123,
        },
      ],
    });
  });

  it("rejects protected routes without auth when bridge auth is enabled", async () => {
    await bridge.start({
      port: 0,
      authToken: "bridge-auth-required",
      getSessionContext: async sessionId => ({
        sessionId,
        messages: [],
      }),
      handleProxyRequest: async () => ({
        text: "ok",
        toolCalls: [],
        done: true,
      }),
    });

    const configResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/config`);
    const configBody = await configResponse.json();
    const contextResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-6/context`);
    const contextBody = await contextResponse.json();
    const proxyResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    });
    const proxyBody = await proxyResponse.json();

    expect(configResponse.status).toBe(401);
    expect(configBody).toEqual({
      error: "Missing or invalid Local Bridge auth token",
    });
    expect(contextResponse.status).toBe(401);
    expect(contextBody).toEqual({
      error: "Missing or invalid Local Bridge auth token",
    });
    expect(proxyResponse.status).toBe(401);
    expect(proxyBody).toEqual({
      error: "Missing or invalid Local Bridge auth token",
    });
  });

  it("accepts protected routes after register when auth token and source match", async () => {
    const getSessionContext = vi.fn(async sessionId => ({
      sessionId,
      messages: [],
    }));
    const handleProxyRequest = vi.fn(async () => ({
      text: "proxy ok",
      toolCalls: [],
      done: true,
    }));

    await bridge.start({
      port: 0,
      authToken: "bridge-auth-ok",
      resolveSessionId: () => "shared-session-7",
      getSessionContext,
      handleProxyRequest,
    });

    await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "word-addin",
      }),
    });

    const headers = {
      Authorization: "Bearer bridge-auth-ok",
      "X-KainClaw-Source": "word-addin",
    };
    const configResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/config`, {
      headers,
    });
    const contextResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-7/context`, {
      headers,
    });
    const proxyResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    });

    expect(configResponse.status).toBe(200);
    expect(contextResponse.status).toBe(200);
    expect(proxyResponse.status).toBe(200);
    expect(getSessionContext).toHaveBeenCalledWith("shared-session-7");
    expect(handleProxyRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects session message writes when body source mismatches the authenticated source", async () => {
    const appendSessionMessage = vi.fn();

    await bridge.start({
      port: 0,
      authToken: "bridge-auth-mismatch",
      appendSessionMessage,
    });

    await fetch(`http://127.0.0.1:${bridge.getPort()}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "word-addin",
      }),
    });

    const response = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-8/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer bridge-auth-mismatch",
        "X-KainClaw-Source": "word-addin",
      },
      body: JSON.stringify({
        role: "user",
        content: "hello",
        source: "excel-addin",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Session message source does not match authenticated source",
    });
    expect(appendSessionMessage).not.toHaveBeenCalled();
  });

  it("appends a session message over HTTP", async () => {
    const appendSessionMessage = vi.fn(async request => ({
      id: "msg-2",
      role: request.message.role,
      content: request.message.content,
      source: request.message.source,
      timestamp: request.message.timestamp ?? 456,
    }));

    await bridge.start({
      port: 0,
      appendSessionMessage,
    });
    const port = bridge.getPort();
    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/session/shared-session-4/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "user",
        content: "hello from ppt",
        source: "ppt",
        timestamp: 456,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      message: {
        id: "msg-2",
        role: "user",
        content: "hello from ppt",
        source: "ppt",
        timestamp: 456,
      },
    });
    expect(appendSessionMessage).toHaveBeenCalledWith({
      sessionId: "shared-session-4",
      message: {
        role: "user",
        content: "hello from ppt",
        source: "ppt",
        timestamp: 456,
      },
    });
  });

  it("returns 503 for session routes when no session handlers are configured", async () => {
    await bridge.start({ port: 0 });

    const contextResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-5/context`);
    const contextBody = await contextResponse.json();

    const messageResponse = await fetch(`http://127.0.0.1:${bridge.getPort()}/session/shared-session-5/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "user",
        content: "hello",
        source: "word",
      }),
    });
    const messageBody = await messageResponse.json();

    expect(contextResponse.status).toBe(503);
    expect(contextBody).toEqual({
      error: "Local bridge session context is not configured",
    });
    expect(messageResponse.status).toBe(503);
    expect(messageBody).toEqual({
      error: "Local bridge session append is not configured",
    });
  });
});
