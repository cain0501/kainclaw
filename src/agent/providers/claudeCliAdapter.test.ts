import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedMessage } from "./IProviderAdapter";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import {
  buildClaudeCliPrompt,
  ClaudeCliAdapter,
  getClaudeCliCommand,
} from "./claudeCliAdapter";

describe("Claude CLI adapter helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the correct CLI command for each platform", () => {
    expect(getClaudeCliCommand(undefined, "win32")).toBe("claude.cmd");
    expect(getClaudeCliCommand(undefined, "linux")).toBe("claude");
    expect(getClaudeCliCommand("custom-claude", "win32")).toBe("custom-claude");
  });

  it("does not pass provider-qualified model IDs to Claude CLI", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = new PassThrough();
    child.kill = vi.fn();
    spawnMock.mockReturnValue(child);
    const adapter = new ClaudeCliAdapter({ type: "claude-cli", model: "anthropic/claude-sonnet-4.6" }, "E:\\repo", {});
    const stepPromise = adapter.runStep([{ role: "user", content: "Hello" }], [], () => {});

    const [, args] = spawnMock.mock.calls[0] ?? [];
    expect(args).not.toContain("--model");
    stdout.end("OK.");
    stderr.end();
    child.emit("close", 0);
    await expect(stepPromise).resolves.toMatchObject({ text: "OK." });
  });

  it("builds a prompt from system instructions and conversation history", () => {
    const messages: NormalizedMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "tool_result", toolCallId: "tool-1", content: "ignored" },
    ];

    const prompt = buildClaudeCliPrompt(messages, "Be concise.");

    expect(prompt).toContain("System instructions:\nBe concise.");
    expect(prompt).toContain("Conversation:\nUser: Hello");
    expect(prompt).toContain("Assistant: Hi there");
    expect(prompt).not.toContain("tool_result");
  });

  it("sends the prompt through explicit UTF-8 text input mode", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    const receivedPrompt: string[] = [];
    stdin.on("data", chunk => receivedPrompt.push(String(chunk)));

    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = stdin;
    child.kill = vi.fn();

    stdin.on("end", () => {
      stdout.end("OK.");
      stderr.end();
      child.emit("close", 0);
    });

    spawnMock.mockReturnValue(child);

    const adapter = new ClaudeCliAdapter(
      {
        type: "claude-cli",
        model: "claude-3-7-sonnet",
      },
      "E:\\repo",
      {},
      "Be concise.",
    );

    const messages: NormalizedMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const tokens: string[] = [];

    const stepPromise = adapter.runStep(
      messages,
      [],
      token => tokens.push(token),
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnMock.mock.calls[0] ?? [];
    expect(args).toContain("--print");
    expect(args).toContain("--output-format");
    expect(args).toContain("text");
    expect(args).toContain("--input-format");
    expect(args).toContain("--strict-mcp-config");
    const step = await stepPromise;

    const prompt = receivedPrompt.join("");
    expect(prompt).toContain("System instructions:\nBe concise.");
    expect(prompt).toContain("Conversation:\nUser: Hello");
    expect(prompt).toContain("Assistant: Hi there");

    expect(tokens).toEqual(["OK."]);
    expect(step).toEqual({
      text: "OK.",
      toolCalls: [],
      done: true,
    });
  });
});
