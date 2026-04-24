import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCustomAgent,
  getCustomAgentsConfigPath,
  loadCustomAgents,
} from "./customAgentsRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("customAgentsRegistry", () => {
  it("loads valid custom agents from .cain/agents.json", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-custom-agents-"));
    tempDirs.push(workspaceRoot);
    const configPath = getCustomAgentsConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: [
          {
            id: "ui-reviewer",
            name: "UI Reviewer",
            description: "Review frontend UI changes.",
            tools: ["read_file", "search_files"],
            model: "inherit",
            color: "teal",
            memory: ["ui-guidelines.md"],
          },
          {
            id: "broken",
            name: "",
            description: "",
          },
        ],
      }),
      "utf8",
    );

    const agents = await loadCustomAgents(workspaceRoot);

    expect(agents).toEqual([
      {
        id: "ui-reviewer",
        name: "UI Reviewer",
        description: "Review frontend UI changes.",
        tools: ["read_file", "search_files"],
        model: "inherit",
        color: "teal",
        memory: ["ui-guidelines.md"],
      },
    ]);
    expect(getCustomAgent(agents, "ui-reviewer")?.name).toBe("UI Reviewer");
  });

  it("returns an empty list when the config file is missing or invalid", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-custom-agents-"));
    tempDirs.push(workspaceRoot);

    expect(await loadCustomAgents(workspaceRoot)).toEqual([]);

    const configPath = getCustomAgentsConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, "{not valid json", "utf8");

    expect(await loadCustomAgents(workspaceRoot)).toEqual([]);
  });
});
