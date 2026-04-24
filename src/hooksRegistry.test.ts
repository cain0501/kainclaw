import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getHook,
  getHooksConfigPath,
  listSupportedHookEvents,
  listSupportedHookTypes,
  loadHooks,
} from "./hooksRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("hooksRegistry", () => {
  it("loads valid hooks from .cain/hooks.json", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-hooks-"));
    tempDirs.push(workspaceRoot);
    const configPath = getHooksConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        hooks: [
          {
            id: "post-review",
            name: "Post Review Webhook",
            type: "http",
            description: "Notify a webhook after review completes.",
            events: ["ReviewCompleted", "ToolUseFinished"],
            url: "https://hooks.example.com/review",
            timeoutMs: 5000,
          },
          {
            id: "bad",
            name: "",
            type: "http",
            description: "",
            events: [],
          },
        ],
      }),
      "utf8",
    );

    const hooks = await loadHooks(workspaceRoot);

    expect(hooks).toEqual([
      {
        id: "post-review",
        name: "Post Review Webhook",
        type: "http",
        description: "Notify a webhook after review completes.",
        events: ["ReviewCompleted", "ToolUseFinished"],
        url: "https://hooks.example.com/review",
        timeoutMs: 5000,
      },
    ]);
    expect(getHook(hooks, "post-review")?.name).toBe("Post Review Webhook");
  });

  it("returns an empty list when the config file is missing or invalid", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-hooks-"));
    tempDirs.push(workspaceRoot);

    expect(await loadHooks(workspaceRoot)).toEqual([]);

    const configPath = getHooksConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, "{not valid json", "utf8");

    expect(await loadHooks(workspaceRoot)).toEqual([]);
  });

  it("exposes supported hook types and event catalogs", () => {
    expect(listSupportedHookTypes().map(type => type.id)).toEqual([
      "command",
      "http",
      "prompt",
      "agent",
    ]);
    expect(listSupportedHookEvents().map(event => event.id)).toContain("ToolUseFinished");
    expect(listSupportedHookEvents().length).toBeGreaterThanOrEqual(20);
  });

  it("rejects hooks that omit the required payload field for their type", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-hooks-"));
    tempDirs.push(workspaceRoot);
    const configPath = getHooksConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        hooks: [
          {
            id: "missing-http-url",
            name: "Bad HTTP Hook",
            type: "http",
            description: "Should be ignored",
            events: ["ToolUseFinished"],
          },
        ],
      }),
      "utf8",
    );

    expect(await loadHooks(workspaceRoot)).toEqual([]);
  });
});
