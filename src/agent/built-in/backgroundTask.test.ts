import { describe, expect, it } from "vitest";
import {
  BUILT_IN_AGENT_BACKGROUND_TASK_TYPE,
  buildBuiltInAgentTaskDescription,
  buildBuiltInAgentTaskStartOutput,
  formatBuiltInAgentToolEvent,
  getBuiltInAgentBackgroundTaskMetadata,
} from "./backgroundTask";
import type { BuiltInAgentDefinition } from "./types";

const fakeAgent: BuiltInAgentDefinition = {
  agentType: "review",
  whenToUse: "Use for code review",
  color: "blue",
  background: true,
  source: "built-in",
  getSystemPrompt: () => "prompt",
};

describe("built-in background task helpers", () => {
  it("returns task metadata for built-in agents", () => {
    expect(
      getBuiltInAgentBackgroundTaskMetadata(fakeAgent, {
        originalTask: "Review the stop flow",
      }),
    ).toEqual({
      taskType: BUILT_IN_AGENT_BACKGROUND_TASK_TYPE,
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      metadata: {
        originalTask: "Review the stop flow",
      },
    });
  });

  it("builds compact task descriptions", () => {
    expect(buildBuiltInAgentTaskDescription("Review agent")).toBe("Review agent");

    const longDescription = buildBuiltInAgentTaskDescription(
      "Review agent",
      "This is a very long extra guidance block that should be compacted down so it stays small and readable in task lists.",
    );

    expect(longDescription).toContain("Review agent:");
    expect(longDescription.endsWith("...")).toBe(true);
  });

  it("formats start output and tool events", () => {
    expect(buildBuiltInAgentTaskStartOutput("Review Agent", "/review current diff")).toContain(
      "Started review agent for:",
    );
    expect(formatBuiltInAgentToolEvent("start", "read_file", "src/extension.ts")).toBe(
      "[tool:start] read_file src/extension.ts",
    );
    expect(formatBuiltInAgentToolEvent("end", "read_file")).toBe("[tool:end] read_file");
  });
});
