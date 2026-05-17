import { describe, expect, it, vi } from "vitest";

import { runPostCompactCleanup } from "./postCompactCleanup";
import { executeTool, type ToolContext } from "../toolRuntime";

describe("postCompactCleanup", () => {
  it("clears SessionMemory notes after compaction cleanup", async () => {
    const context = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    } satisfies ToolContext;

    await executeTool(
      "SessionMemory",
      { operation: "write", key: "checkpoint", value: "ready" },
      context,
    );

    const beforeCleanup = await executeTool(
      "SessionMemory",
      { operation: "list" },
      context,
    );
    expect(beforeCleanup.content).toBe("checkpoint");

    runPostCompactCleanup();

    const afterCleanup = await executeTool(
      "SessionMemory",
      { operation: "list" },
      context,
    );
    expect(afterCleanup.content).toBe("(no notes)");
  });

  it("clears TeamCreate registry after compaction cleanup", async () => {
    const spawnSubAgent = vi.fn(async () => ({ text: "done" }));
    const context = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      spawnSubAgent,
    } satisfies ToolContext;

    await executeTool(
      "TeamCreate",
      { name: "reviewer", subagent_type: "Explore" },
      context,
    );

    await executeTool(
      "SendMessage",
      { to: "reviewer", message: "inspect compact files" },
      context,
    );

    runPostCompactCleanup();

    await expect(
      executeTool(
        "SendMessage",
        { to: "reviewer", message: "inspect compact files" },
        context,
      ),
    ).rejects.toThrow('Unknown teammate "reviewer". Available: (none)');
  });
});
