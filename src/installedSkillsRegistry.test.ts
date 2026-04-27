import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildInstalledSkillPrompt,
  getInstalledSkill,
  loadInstalledSkills,
} from "./installedSkillsRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
  delete process.env.CLAUDE_CONFIG_HOME;
  delete process.env.KAINCLAW_CONFIG_HOME;
});

describe("installedSkillsRegistry", () => {
  it("loads installed skills from KainClaw primary paths and Claude compatibility paths", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-workspace-"));
    tempDirs.push(kainclawHome, claudeHome, workspaceRoot);

    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const userSkillDir = path.join(kainclawHome, "skills", "browse");
    const projectSkillDir = path.join(workspaceRoot, ".kainclaw", "skills", "project-tool");
    const nestedSkillDir = path.join(claudeHome, "skills", "gstack", "investigate");
    const compatProjectSkillDir = path.join(
      workspaceRoot,
      ".claude",
      "skills",
      "legacy-tool",
    );

    await fs.mkdir(userSkillDir, { recursive: true });
    await fs.mkdir(projectSkillDir, { recursive: true });
    await fs.mkdir(nestedSkillDir, { recursive: true });
    await fs.mkdir(compatProjectSkillDir, { recursive: true });

    await fs.writeFile(
      path.join(userSkillDir, "SKILL.md"),
      `---
name: browse
description: |
  Open a headless browser for QA checks.
when_to_use: Use when you need to inspect a live page.
arguments: query path
disable-model-invocation: true
context: fork
shell: powershell
allowed-tools:
  - Bash
  - Read
---

# browse
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(projectSkillDir, "SKILL.md"),
      `---
name: Project Tool
description: Workspace-specific helper.
--- 
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(compatProjectSkillDir, "SKILL.md"),
      `---
name: Legacy Tool
description: Claude-compat workspace helper.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(nestedSkillDir, "SKILL.md"),
      `---
name: Investigate
description: |
  Debug issues across the codebase.
---
`,
      "utf8",
    );

    const skills = await loadInstalledSkills(workspaceRoot);

    expect(skills.map(skill => skill.id)).toEqual([
      "project-tool",
      "legacy-tool",
      "browse",
      "gstack:investigate",
    ]);
    expect(getInstalledSkill(skills, "browse")).toMatchObject({
      title: "browse",
      source: "user",
      entrypoint: "/browse",
      whenToUse: "Use when you need to inspect a live page.",
      argumentNames: ["query", "path"],
      disableModelInvocation: true,
      executionContext: "fork",
      shell: "powershell",
      allowedTools: ["Bash", "Read"],
    });
    expect(getInstalledSkill(skills, "project-tool")).toMatchObject({
      source: "project",
      entrypoint: "/project-tool",
    });
    expect(getInstalledSkill(skills, "legacy-tool")).toMatchObject({
      source: "project",
      entrypoint: "/legacy-tool",
    });
    expect(getInstalledSkill(skills, "gstack:investigate")).toMatchObject({
      title: "Investigate",
      source: "user",
    });
  });

  it("prefers KainClaw primary paths over Claude compatibility paths for duplicate skill ids", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-workspace-"));
    tempDirs.push(kainclawHome, claudeHome, workspaceRoot);

    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const primaryUserSkillDir = path.join(kainclawHome, "skills", "browse");
    const compatUserSkillDir = path.join(claudeHome, "skills", "browse");
    const primaryProjectSkillDir = path.join(
      workspaceRoot,
      ".kainclaw",
      "skills",
      "project-tool",
    );
    const compatProjectSkillDir = path.join(
      workspaceRoot,
      ".claude",
      "skills",
      "project-tool",
    );

    await fs.mkdir(primaryUserSkillDir, { recursive: true });
    await fs.mkdir(compatUserSkillDir, { recursive: true });
    await fs.mkdir(primaryProjectSkillDir, { recursive: true });
    await fs.mkdir(compatProjectSkillDir, { recursive: true });

    await fs.writeFile(
      path.join(primaryUserSkillDir, "SKILL.md"),
      `---
name: browse
description: KainClaw primary browse skill.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(compatUserSkillDir, "SKILL.md"),
      `---
name: browse
description: Claude compatibility browse skill.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(primaryProjectSkillDir, "SKILL.md"),
      `---
name: Project Tool
description: KainClaw primary project skill.
---
`,
      "utf8",
    );
    await fs.writeFile(
      path.join(compatProjectSkillDir, "SKILL.md"),
      `---
name: Project Tool
description: Claude compatibility project skill.
---
`,
      "utf8",
    );

    const skills = await loadInstalledSkills(workspaceRoot);

    expect(skills.map(skill => skill.id)).toEqual(["project-tool", "browse"]);
    expect(getInstalledSkill(skills, "browse")).toMatchObject({
      summary: "KainClaw primary browse skill.",
      skillPath: path.join(primaryUserSkillDir, "SKILL.md"),
    });
    expect(getInstalledSkill(skills, "project-tool")).toMatchObject({
      summary: "KainClaw primary project skill.",
      skillPath: path.join(primaryProjectSkillDir, "SKILL.md"),
    });
  });

  it("builds an installed skill prompt with base directory and argument substitution", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    tempDirs.push(kainclawHome);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const browseSkillDir = path.join(kainclawHome, "skills", "browse");
    await fs.mkdir(browseSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(browseSkillDir, "SKILL.md"),
      `---
name: browse
description: Fast headless browser
argument-hint: "<url>"
---

Run from \${CLAUDE_SKILL_DIR}
Target: $ARGUMENTS
`,
      "utf8",
    );

    const [skill] = await loadInstalledSkills();
    const prompt = await buildInstalledSkillPrompt({
      skill: skill!,
      args: "https://www.baidu.com",
    });

    expect(prompt).toContain("Base directory for this skill:");
    expect(prompt).toContain("Run from");
    expect(prompt).toContain("Target: https://www.baidu.com");
    expect(prompt).not.toContain("${CLAUDE_SKILL_DIR}");
    expect(prompt).not.toContain("$ARGUMENTS");
  });

  it("supports named and indexed installed-skill argument substitution", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    tempDirs.push(kainclawHome);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const skillDir = path.join(kainclawHome, "skills", "search-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: search-skill
description: Search helper
arguments: query path
---

Query: $query
Path: $path
First: $0
Second: $ARGUMENTS[1]
All: $ARGUMENTS
`,
      "utf8",
    );

    const [skill] = await loadInstalledSkills();
    const prompt = await buildInstalledSkillPrompt({
      skill: skill!,
      args: `"hello world" src/index.ts`,
    });

    expect(prompt).toContain("Query: hello world");
    expect(prompt).toContain("Path: src/index.ts");
    expect(prompt).toContain("First: hello world");
    expect(prompt).toContain("Second: src/index.ts");
    expect(prompt).toContain(`All: "hello world" src/index.ts`);
  });

  it("appends raw arguments when no placeholders are present", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    tempDirs.push(kainclawHome);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const skillDir = path.join(kainclawHome, "skills", "fallback-args");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: fallback-args
description: Fallback arg append helper
---

Run the helper.
`,
      "utf8",
    );

    const [skill] = await loadInstalledSkills();
    const prompt = await buildInstalledSkillPrompt({
      skill: skill!,
      args: "foo bar",
    });

    expect(prompt).toContain("Run the helper.");
    expect(prompt).toContain("ARGUMENTS: foo bar");
  });

  it("parses installed-skill hooks from frontmatter", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    tempDirs.push(kainclawHome);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const skillDir = path.join(kainclawHome, "skills", "hooked-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: hooked-skill
description: Hooked skill
hooks:
  UserPromptSubmit:
    - hooks:
        - type: prompt
          prompt: Be concise.
  PreToolUse:
    - matcher: read_file|search_files
      hooks:
        - type: command
          command: echo before
          timeout: 3
---

Run the helper.
`,
      "utf8",
    );

    const [skill] = await loadInstalledSkills();

    expect(skill?.hooks).toHaveLength(2);
    expect(skill?.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "prompt",
          events: ["PrePrompt"],
          prompt: "Be concise.",
        }),
        expect.objectContaining({
          type: "command",
          events: ["PreToolCall"],
          matcher: "read_file|search_files",
          command: "echo before",
          timeoutMs: 3000,
        }),
      ]),
    );
  });
});
