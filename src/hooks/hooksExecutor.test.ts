import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HookDefinition } from "../hooksRegistry";
import { type AgentRunner, type HookContext, executeHook } from "./hooksExecutor";
import { buildInjectedPrompt, triggerHooks } from "./hooksTrigger";
import { writeFreezeBoundary } from "../installedSkillCompat";

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
    expect(result).toEqual(
      process.platform === "win32"
        ? { blocked: false }
        : { blocked: true },
    );
  });

  it("returns blocked:false for non-blocking command that exits non-zero", async () => {
    const failCmd = process.platform === "win32" ? "exit 1" : "false";
    const hook = makeHook({ command: failCmd, blocking: false });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false when command times out (non-blocking)", async () => {
    const sleepCmd = process.platform === "win32" ? "Start-Sleep -Seconds 10" : "sleep 10";
    const hook = makeHook({ command: sleepCmd, timeoutMs: 50, blocking: false });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked:false when command field is empty", async () => {
    const hook = makeHook({ command: "" });
    const result = await executeHook(hook, makeContext());
    expect(result).toEqual({ blocked: false });
  });

  it("uses native freeze compatibility to block edits outside the configured boundary", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-hook-state-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-hook-workspace-"));
    process.env.CLAUDE_PLUGIN_DATA = stateDir;
    try {
      const boundaryDir = path.join(workspaceRoot, "allowed");
      const blockedFile = path.join(workspaceRoot, "blocked", "file.txt");
      await fs.mkdir(boundaryDir, { recursive: true });
      await fs.mkdir(path.dirname(blockedFile), { recursive: true });
      await writeFreezeBoundary(boundaryDir);

      const hook = makeHook({
        name: "freeze:PreToolUse:1",
        command: "bash ${CLAUDE_SKILL_DIR}/bin/check-freeze.sh",
        blocking: true,
      });
      const result = await executeHook(hook, makeContext({
        workspaceRoot,
        toolInput: { path: blockedFile },
      }));

      expect(result.blocked).toBe(true);
      expect(result.blockedMessage).toContain("outside the freeze boundary");
    } finally {
      delete process.env.CLAUDE_PLUGIN_DATA;
      await fs.rm(stateDir, { recursive: true, force: true });
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("uses native careful compatibility to request confirmation for destructive bash commands", async () => {
    const hook = makeHook({
      name: "careful:PreToolUse:1",
      command: "bash ${CLAUDE_SKILL_DIR}/bin/check-careful.sh",
      blocking: true,
    });
    const result = await executeHook(hook, makeContext({
      toolInput: { command: "rm -rf ./__careful_skill_fake_dir__" },
    }));

    expect(result.blocked).toBe(false);
    expect(result.askMessage).toContain("Destructive: recursive delete");
  });

  it("uses native careful compatibility to request confirmation for destructive PowerShell delete commands", async () => {
    const hook = makeHook({
      name: "careful:PreToolUse:1",
      command: "bash ${CLAUDE_SKILL_DIR}/bin/check-careful.sh",
      blocking: true,
    });
    const result = await executeHook(hook, makeContext({
      toolInput: {
        command: "Remove-Item -Recurse -Force .\\__careful_skill_fake_dir__",
      },
    }));

    expect(result.blocked).toBe(false);
    expect(result.askMessage).toContain(
      "Destructive: recursive delete (Remove-Item -Recurse -Force)",
    );
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
    expect(result).toEqual({
      blocked: false,
      injected: "Please be concise.",
      position: "suffix",
    });
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
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "code-reviewer", type: "agent" }),
      ctx,
    );
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
    expect(result.promptSuffixInjection).toBe("Part one.\n\nPart two.");
  });

  it("stops processing hooks after a blocking hook returns blocked:true", async () => {
    const runner: AgentRunner = vi.fn().mockResolvedValue(undefined);
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-trigger-state-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-trigger-workspace-"));
    process.env.CLAUDE_PLUGIN_DATA = stateDir;
    try {
      const boundaryDir = path.join(workspaceRoot, "allowed");
      const blockedFile = path.join(workspaceRoot, "blocked", "file.txt");
      await fs.mkdir(boundaryDir, { recursive: true });
      await fs.mkdir(path.dirname(blockedFile), { recursive: true });
      await writeFreezeBoundary(boundaryDir);

      const hooks: HookDefinition[] = [
        makeHook({
          id: "blocker",
          name: "freeze:PreToolUse:1",
          type: "command",
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-freeze.sh",
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
      await triggerHooks("PreToolCall", hooks, {
        workspaceRoot,
        toolInput: { path: blockedFile },
      }, runner);
      expect(runner).not.toHaveBeenCalled();
    } finally {
      delete process.env.CLAUDE_PLUGIN_DATA;
      await fs.rm(stateDir, { recursive: true, force: true });
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("returns empty object when hooks list is empty", async () => {
    const result = await triggerHooks("PreToolCall", [], { workspaceRoot: "/tmp" });
    expect(result).toEqual({});
  });

  it("reports blocked=true when a blocking hook stops execution", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-trigger-state-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeze-trigger-workspace-"));
    process.env.CLAUDE_PLUGIN_DATA = stateDir;
    try {
      const boundaryDir = path.join(workspaceRoot, "allowed");
      const blockedFile = path.join(workspaceRoot, "blocked", "file.txt");
      await fs.mkdir(boundaryDir, { recursive: true });
      await fs.mkdir(path.dirname(blockedFile), { recursive: true });
      await writeFreezeBoundary(boundaryDir);

      const hooks: HookDefinition[] = [
        makeHook({
          id: "blocker",
          name: "freeze:PreToolUse:1",
          type: "command",
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-freeze.sh",
          blocking: true,
          events: ["PreToolCall"],
        }),
      ];

      const result = await triggerHooks("PreToolCall", hooks, {
        workspaceRoot,
        toolInput: { path: blockedFile },
      });
      expect(result.blocked).toBe(true);
    } finally {
      delete process.env.CLAUDE_PLUGIN_DATA;
      await fs.rm(stateDir, { recursive: true, force: true });
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("filters matching hooks by matcher against toolName", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const hooks: HookDefinition[] = [
      makeHook({
        id: "match-read",
        type: "http",
        url: "https://match.example.com",
        events: ["PreToolCall"],
        matcher: "read_file|search_files",
      }),
      makeHook({
        id: "miss-write",
        type: "http",
        url: "https://miss.example.com",
        events: ["PreToolCall"],
        matcher: "write_file",
      }),
    ];

    await triggerHooks("PreToolCall", hooks, {
      workspaceRoot: "/tmp",
      toolName: "read_file",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe(
      "https://match.example.com",
    );
    vi.unstubAllGlobals();
  });

  it("matches official Claude-style tool aliases against KainClaw tool names", async () => {
    const result = await triggerHooks(
      "PreToolCall",
      [
        makeHook({
          name: "careful:PreToolUse:1",
          type: "command",
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-careful.sh",
          events: ["PreToolCall"],
          matcher: "Bash",
          blocking: true,
        }),
      ],
      {
        workspaceRoot: "/tmp",
        toolName: "run_command",
        toolInput: { command: "rm -rf ./__careful_skill_fake_dir__" },
      },
    );

    expect(result.askMessage).toContain("Destructive: recursive delete");
  });

  it("supports regex matchers for toolName filtering", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const hooks: HookDefinition[] = [
      makeHook({
        id: "regex-match",
        type: "http",
        url: "https://regex.example.com",
        events: ["PreToolCall"],
        matcher: "^read_.*",
      }),
    ];

    await triggerHooks("PreToolCall", hooks, {
      workspaceRoot: "/tmp",
      toolName: "read_file",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe(
      "https://regex.example.com",
    );
    vi.unstubAllGlobals();
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
