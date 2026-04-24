import { describe, expect, it, vi } from "vitest";
import type { HookDefinition } from "../hooksRegistry";
import { type AgentRunner, type HookContext, executeHook } from "./hooksExecutor";
import { buildInjectedPrompt, triggerHooks } from "./hooksTrigger";

function makeContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    event: "PreToolCall",
    workspaceRoot: "/tmp/workspace",
    sessionId: "sess-123",
    ...overrides,
  };
}

function makeHook(overrides: Partial<HookDefinition> = {}): HookDefinition {
  return {
    id: "test-hook",
    name: "Test Hook",
    type: "command",
    description: "A test hook",
    events: ["PreToolCall"],
    command: process.platform === "win32" ? "exit 0" : "true",
    ...overrides,
  };
}

// ─── Command Hook ────────────────────────────────────────────────────────────

describe("executeHook – command", () => {
  it("returns blocked:false for non-blocking successful command", async () => {
    const hook = makeHook({ blocking: false });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false for blocking successful command", async () => {
    const hook = makeHook({ blocking: true });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:true for blocking command that exits non-zero", async () => {
    const failCmd = process.platform === "win32" ? "exit 1" : "false";
    const hook = makeHook({ command: failCmd, blocking: true });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: true });
  });

  it("returns blocked:false for non-blocking command that exits non-zero", async () => {
    const failCmd = process.platform === "win32" ? "exit 1" : "false";
    const hook = makeHook({ command: failCmd, blocking: false });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false when command times out (non-blocking)", async () => {
    const sleepCmd = process.platform === "win32" ? "timeout /t 10 /nobreak" : "sleep 10";
    const hook = makeHook({ command: sleepCmd, timeoutMs: 50, blocking: false });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false when command field is empty", async () => {
    const hook = makeHook({ command: "" });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });
});

// ─── HTTP Hook ───────────────────────────────────────────────────────────────

describe("executeHook – http", () => {
  it("returns blocked:false for non-blocking HTTP 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const hook = makeHook({ type: "http", url: "https://example.com/hook", blocking: false });
    const result = await executeHook(hook, makeContext());

    expect(result).toEqual({ blocked: false });
    vi.unstubAllGlobals();
  });

  it("returns blocked:false for non-blocking HTTP 500 (logs only)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    const hook = makeHook({ type: "http", url: "https://example.com/hook", blocking: false });
    const result = await executeHook(hook, makeContext());

    expect(result).toEqual({ blocked: false });
    vi.unstubAllGlobals();
  });

  it("returns blocked:false for blocking HTTP 2xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", mockFetch);

    const hook = makeHook({ type: "http", url: "https://example.com/hook", blocking: true });
    const result = await executeHook(hook, makeContext());

    expect(result).toEqual({ blocked: false });
    vi.unstubAllGlobals();
  });

  it("returns blocked:true for blocking HTTP non-2xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal("fetch", mockFetch);

    const hook = makeHook({ type: "http", url: "https://example.com/hook", blocking: true });
    const result = await executeHook(hook, makeContext());

    expect(result).toEqual({ blocked: true });
    vi.unstubAllGlobals();
  });

  it("includes custom headers in the fetch call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const hook = makeHook({
      type: "http",
      url: "https://example.com/hook",
      method: "PUT",
      headers: { Authorization: "Bearer token123" },
    });
    await executeHook(hook, makeContext());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer token123" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("sends event payload in the request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const ctx = makeContext({ event: "PostToolCall", toolName: "read_file" });
    const hook = makeHook({ type: "http", url: "https://example.com/hook" });
    await executeHook(hook, ctx);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      event: string;
      context: { toolName: string };
    };
    expect(body.event).toBe("PostToolCall");
    expect(body.context.toolName).toBe("read_file");
    vi.unstubAllGlobals();
  });

  it("returns blocked:false when url field is empty", async () => {
    const hook = makeHook({ type: "http", url: "" });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });
});

// ─── Prompt Hook ─────────────────────────────────────────────────────────────

describe("executeHook – prompt", () => {
  it("returns injected text from hook.prompt", async () => {
    const hook = makeHook({ type: "prompt", prompt: "Please be concise." });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false, injected: "Please be concise." });
  });

  it("returns blocked:false with no injected text when prompt is empty", async () => {
    const hook = makeHook({ type: "prompt", prompt: "" });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });
});

// ─── Agent Hook ──────────────────────────────────────────────────────────────

describe("executeHook – agent", () => {
  it("calls agentRunner with agentId for non-blocking agent hook", async () => {
    const runner: AgentRunner = vi.fn().mockResolvedValue(undefined);
    const hook = makeHook({ type: "agent", agentId: "code-reviewer", blocking: false });
    const ctx = makeContext();
    await executeHook(hook, ctx, runner);
    expect(runner).toHaveBeenCalledWith("code-reviewer", ctx);
  });

  it("returns blocked:false for non-blocking agent hook", async () => {
    const runner: AgentRunner = vi.fn().mockResolvedValue(undefined);
    const hook = makeHook({ type: "agent", agentId: "code-reviewer", blocking: false });
    const result = await executeHook(hook, makeContext(), runner);
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:true when blocking agent hook runner throws", async () => {
    const runner: AgentRunner = vi.fn().mockRejectedValue(new Error("runner failed"));
    const hook = makeHook({ type: "agent", agentId: "code-reviewer", blocking: true });
    const result = await executeHook(hook, makeContext(), runner);
    expect(result).toEqual({ blocked: true });
  });

  it("returns blocked:false when no agentRunner is provided", async () => {
    const hook = makeHook({ type: "agent", agentId: "code-reviewer" });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false when agentId is empty", async () => {
    const runner: AgentRunner = vi.fn().mockResolvedValue(undefined);
    const hook = makeHook({ type: "agent", agentId: "" });
    const result = await executeHook(hook, makeContext(), runner);
    expect(result).toEqual({ blocked: false });
    expect(runner).not.toHaveBeenCalled();
  });
});

// ─── triggerHooks ─────────────────────────────────────────────────────────────

describe("triggerHooks", () => {
  it("filters hooks by event and only executes matching ones", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const hooks: HookDefinition[] = [
      makeHook({ id: "http-pre", type: "http", url: "https://a.com", events: ["PreToolCall"] }),
      makeHook({ id: "http-post", type: "http", url: "https://b.com", events: ["PostPrompt"] }),
    ];

    await triggerHooks("PreToolCall", hooks, { workspaceRoot: "/tmp" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe("https://a.com");
    vi.unstubAllGlobals();
  });

  it("returns empty object when no hooks match the event", async () => {
    const hooks: HookDefinition[] = [
      makeHook({ type: "http", url: "https://a.com", events: ["PostPrompt"] }),
    ];
    const result = await triggerHooks("PreToolCall", hooks, { workspaceRoot: "/tmp" });
    expect(result).toEqual({});
  });

  it("aggregates prompt injections from multiple prompt hooks", async () => {
    const hooks: HookDefinition[] = [
      makeHook({ id: "p1", type: "prompt", prompt: "Part one.", events: ["PrePrompt"] }),
      makeHook({ id: "p2", type: "prompt", prompt: "Part two.", events: ["PrePrompt"] }),
    ];
    const result = await triggerHooks("PrePrompt", hooks, { workspaceRoot: "/tmp" });
    expect(result.promptInjection).toBe("Part one.\n\nPart two.");
  });

  it("stops processing hooks after a blocking hook returns blocked:true", async () => {
    const failCmd = process.platform === "win32" ? "exit 1" : "false";
    const runner: AgentRunner = vi.fn().mockResolvedValue(undefined);
    const hooks: HookDefinition[] = [
      makeHook({
        id: "blocker",
        type: "command",
        command: failCmd,
        blocking: true,
        events: ["PreToolCall"],
      }),
      makeHook({
        id: "never-runs",
        type: "agent",
        agentId: "code-reviewer",
        events: ["PreToolCall"],
      }),
    ];
    await triggerHooks("PreToolCall", hooks, { workspaceRoot: "/tmp" }, runner);
    expect(runner).not.toHaveBeenCalled();
  });

  it("returns empty object when hooks list is empty", async () => {
    const result = await triggerHooks("PreToolCall", [], { workspaceRoot: "/tmp" });
    expect(result).toEqual({});
  });
});

// ─── buildInjectedPrompt ─────────────────────────────────────────────────────

describe("buildInjectedPrompt", () => {
  it("appends injection as suffix by default", () => {
    const result = buildInjectedPrompt("Hello", "Note: be concise.");
    expect(result).toBe("Hello\n\nNote: be concise.");
  });

  it("prepends injection as prefix when position is prefix", () => {
    const result = buildInjectedPrompt("Hello", "Note: be concise.", "prefix");
    expect(result).toBe("Note: be concise.\n\nHello");
  });

  it("returns original prompt when injection is undefined", () => {
    const result = buildInjectedPrompt("Hello", undefined);
    expect(result).toBe("Hello");
  });

  it("returns original prompt when injection is empty string", () => {
    const result = buildInjectedPrompt("Hello", "");
    expect(result).toBe("Hello");
  });
});
