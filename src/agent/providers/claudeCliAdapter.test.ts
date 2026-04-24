import { describe, expect, it } from "vitest";
import { buildClaudeCliPrompt, getClaudeCliCommand } from "./claudeCliAdapter";
import type { NormalizedMessage } from "./IProviderAdapter";

describe("Claude CLI adapter helpers", () => {
  it("selects the correct CLI command for each platform", () => {
    expect(getClaudeCliCommand(undefined, "win32")).toBe("claude.cmd");
    expect(getClaudeCliCommand(undefined, "linux")).toBe("claude");
    expect(getClaudeCliCommand("custom-claude", "win32")).toBe("custom-claude");
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
});
