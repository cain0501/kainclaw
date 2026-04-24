import { describe, expect, it, vi } from "vitest";
import {
  buildDistillationPrompt,
  distillSkillFromTask,
  meetsDistillationThreshold,
} from "./skillDistiller";
import type { BackgroundTaskRecord } from "../tasks/types";

function makeTask(overrides: Partial<BackgroundTaskRecord> = {}): BackgroundTaskRecord {
  return {
    taskId: "test-task-1",
    taskType: "built_in_agent",
    agentType: "explore",
    status: "completed",
    prompt: "Test task prompt",
    output: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as BackgroundTaskRecord;
}

describe("meetsDistillationThreshold", () => {
  it("returns true when tool call count >= 5", () => {
    const output = "[tool:start][tool:start][tool:start][tool:start][tool:start]";
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(true);
  });

  it("returns true when output length >= 3000", () => {
    const output = "x".repeat(3000);
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(true);
  });

  it("returns false when both conditions are not met", () => {
    const output = "[tool:start][tool:start]short output";
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(false);
  });

  it("returns true with exactly 5 tool calls", () => {
    const output = Array(5).fill("[tool:start]").join(" ");
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(true);
  });

  it("returns true with exactly 3000 chars", () => {
    const output = "a".repeat(3000);
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(true);
  });

  it("returns false with 4 tool calls and short output", () => {
    const output = "[tool:start][tool:start][tool:start][tool:start] done";
    const task = makeTask({ output });
    expect(meetsDistillationThreshold(task)).toBe(false);
  });
});

describe("buildDistillationPrompt", () => {
  it("includes agentType in the prompt", () => {
    const task = makeTask({ agentType: "plan", output: "task result" });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("Agent type: plan");
  });

  it("includes task output in the prompt", () => {
    const task = makeTask({ output: "unique-output-marker-xyz" });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("unique-output-marker-xyz");
  });

  it("truncates output tail to 4000 chars", () => {
    const longOutput = "A".repeat(5000) + "TAIL_MARKER";
    const task = makeTask({ output: longOutput });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("TAIL_MARKER");
    expect(prompt).not.toContain("A".repeat(5000));
  });

  it("uses full output when shorter than 4000 chars", () => {
    const output = "short output content";
    const task = makeTask({ output });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("short output content");
  });

  it("uses originalTask from metadata when available", () => {
    const task = makeTask({
      metadata: { originalTask: "My original task description" },
      prompt: "fallback prompt",
    });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("My original task description");
  });

  it("falls back to task.prompt when no metadata.originalTask", () => {
    const task = makeTask({
      metadata: {},
      prompt: "fallback prompt text",
    });
    const prompt = buildDistillationPrompt(task);
    expect(prompt).toContain("fallback prompt text");
  });
});

describe("distillSkillFromTask", () => {
  const VALID_SKILL_MD = `---
name: test-skill
description: A test skill description.
version: 1.0.0
author: KainClaw Auto
tags: [test]
created_at: "2026-04-15T00:00:00Z"
source: auto
---

# Test Skill

## When to use
- When testing
`;

  function makeProvider(responseText: string) {
    return {
      runStep: vi.fn(async (_messages, _tools, onToken) => {
        onToken?.(responseText);
        return { text: responseText, toolCalls: [] };
      }),
    } as any;
  }

  it("returns ok=true with name and content on valid response", async () => {
    const task = makeTask({ output: "some output" });
    const provider = makeProvider(VALID_SKILL_MD);

    const result = await distillSkillFromTask(task, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("test-skill");
      expect(result.content).toContain("name: test-skill");
    }
  });

  it("returns ok=false when response has no frontmatter boundary", async () => {
    const task = makeTask({ output: "some output" });
    const provider = makeProvider("This is just plain text with no YAML frontmatter.");

    const result = await distillSkillFromTask(task, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("no frontmatter boundary");
    }
  });

  it("returns ok=false when frontmatter missing name field", async () => {
    const noName = `---
description: A skill without name.
version: 1.0.0
---

# Body`;
    const task = makeTask({ output: "some output" });
    const provider = makeProvider(noName);

    const result = await distillSkillFromTask(task, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("name");
    }
  });

  it("returns ok=false when provider throws", async () => {
    const task = makeTask({ output: "some output" });
    const provider = {
      runStep: vi.fn().mockRejectedValue(new Error("network failure")),
    } as any;

    const result = await distillSkillFromTask(task, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("network failure");
    }
  });

  it("prefers step.text over streamed tokens", async () => {
    const task = makeTask({ output: "some output" });
    const provider = {
      runStep: vi.fn(async (_messages, _tools, onToken) => {
        onToken?.("streamed chunk");
        return { text: VALID_SKILL_MD, toolCalls: [] };
      }),
    } as any;

    const result = await distillSkillFromTask(task, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("test-skill");
    }
  });
});
