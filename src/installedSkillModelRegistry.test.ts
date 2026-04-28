import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildInstalledSkillsSystemPrompt,
  isModelInvocableInstalledSkill,
  loadModelInvocableInstalledSkills,
} from "./installedSkillModelRegistry";
import type { InstalledSkillDefinition } from "./installedSkillsRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
  delete process.env.CLAUDE_CONFIG_HOME;
  delete process.env.KAINCLAW_CONFIG_HOME;
});

describe("installedSkillModelRegistry", () => {
  it("filters out installed skills that require advanced execution metadata", () => {
    const baseSkill: InstalledSkillDefinition = {
      id: "simple-skill",
      title: "Simple Skill",
      summary: "Simple model-invocable skill.",
      whenToUse: "When a simple helper fits the task.",
      argumentNames: [],
      disableModelInvocation: false,
      hooks: [],
      entrypoint: "/simple-skill",
      source: "user",
      skillPath: "E:/skills/simple/SKILL.md",
      allowedTools: [],
    };

    expect(isModelInvocableInstalledSkill(baseSkill)).toBe(true);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        disableModelInvocation: true,
      }),
    ).toBe(false);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        executionContext: "fork",
      }),
    ).toBe(true);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        modelOverride: "claude-opus-4-6",
      }),
    ).toBe(true);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        effort: "high",
      }),
    ).toBe(true);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        hooks: [
          {
            id: "hook-1",
            name: "hook-1",
            type: "prompt",
            description: "hook",
            events: ["PrePrompt"],
            prompt: "Be concise.",
          },
        ],
      }),
    ).toBe(true);
    expect(
      isModelInvocableInstalledSkill({
        ...baseSkill,
        hooks: [
          {
            id: "hook-2",
            name: "hook-2",
            type: "agent",
            description: "agent hook",
            events: ["PostToolCall"],
            agentPrompt: "Validate the tool result",
            agentModel: "claude-opus-4-6",
          },
        ],
      }),
    ).toBe(false);
  });

  it("loads only model-invocable installed skills from the configured roots", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-workspace-"));
    tempDirs.push(kainclawHome, claudeHome, workspaceRoot);

    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const simpleSkillDir = path.join(kainclawHome, "skills", "simple-skill");
    const blockedSkillDir = path.join(kainclawHome, "skills", "blocked-skill");
    const hookedSkillDir = path.join(kainclawHome, "skills", "hooked-skill");
    const overrideSkillDir = path.join(kainclawHome, "skills", "override-skill");
    const forkedSkillDir = path.join(workspaceRoot, ".kainclaw", "skills", "forked-skill");

    await fs.mkdir(simpleSkillDir, { recursive: true });
    await fs.mkdir(blockedSkillDir, { recursive: true });
    await fs.mkdir(hookedSkillDir, { recursive: true });
    await fs.mkdir(overrideSkillDir, { recursive: true });
    await fs.mkdir(forkedSkillDir, { recursive: true });

    await fs.writeFile(
      path.join(simpleSkillDir, "SKILL.md"),
      `---
name: simple-skill
description: Simple helper
when_to_use: Use for lightweight helper tasks.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(blockedSkillDir, "SKILL.md"),
      `---
name: blocked-skill
description: Blocked helper
disable-model-invocation: true
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(hookedSkillDir, "SKILL.md"),
      `---
name: hooked-skill
description: Hooked helper
hooks:
  UserPromptSubmit:
    - hooks:
        - type: prompt
          prompt: Be concise.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(overrideSkillDir, "SKILL.md"),
      `---
name: override-skill
description: Override helper
model: claude-opus-4-6
effort: high
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(forkedSkillDir, "SKILL.md"),
      `---
name: forked-skill
description: Forked helper
context: fork
---
`,
      "utf8",
    );

    const skills = await loadModelInvocableInstalledSkills(workspaceRoot);

    expect(skills.map(skill => skill.id)).toEqual([
      "forked-skill",
      "hooked-skill",
      "override-skill",
      "simple-skill",
    ]);
  });

  it("builds an installed-skills system prompt section for model-visible skills", () => {
    const prompt = buildInstalledSkillsSystemPrompt("base prompt", [
      {
        id: "simple-skill",
        title: "Simple Skill",
        summary: "Simple model-invocable skill.",
        whenToUse: "When a simple helper fits the task.",
        argumentNames: [],
        disableModelInvocation: false,
        hooks: [],
        entrypoint: "/simple-skill",
        source: "user",
        skillPath: "E:/skills/simple/SKILL.md",
        allowedTools: [],
      },
    ]);

    expect(prompt).toContain("base prompt");
    expect(prompt).toContain("# Installed Skills");
    expect(prompt).toContain("SkillTool");
    expect(prompt).toContain("isolated forked agent context");
    expect(prompt).toContain("- simple-skill: Simple model-invocable skill. | When to use: When a simple helper fits the task.");
  });
});
