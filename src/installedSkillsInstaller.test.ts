import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatInstalledSkillsList,
  installSkillFromLocalPath,
  removeInstalledSkill,
  verifyInstalledSkillVisible,
} from "./installedSkillsInstaller";
import { getInstalledSkill, loadInstalledSkills } from "./installedSkillsRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
  delete process.env.CLAUDE_CONFIG_HOME;
  delete process.env.KAINCLAW_CONFIG_HOME;
});

describe("installedSkillsInstaller", () => {
  it("installs a local skill into the primary workspace root and makes it immediately discoverable", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-workspace-"));
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skill-source-"));
    tempDirs.push(kainclawHome, workspaceRoot, sourceRoot);

    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const sourceSkillDir = path.join(sourceRoot, "Browse Skill");
    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: Browse Skill
description: Workspace browser helper.
---

Use this helper.
`,
      "utf8",
    );
    await fs.writeFile(path.join(sourceSkillDir, "notes.txt"), "asset", "utf8");

    const result = await installSkillFromLocalPath({
      source: sourceSkillDir,
      workspaceRoot,
    });

    expect(result).toMatchObject({
      installedId: "browse-skill",
      scope: "project",
      targetPath: path.join(
        workspaceRoot,
        ".kainclaw",
        "skills",
        "browse-skill",
      ),
    });

    expect(await verifyInstalledSkillVisible({
      skillId: "browse-skill",
      workspaceRoot,
    })).toBe(true);

    const skills = await loadInstalledSkills(workspaceRoot);
    expect(getInstalledSkill(skills, "browse-skill")).toMatchObject({
      summary: "Workspace browser helper.",
      source: "project",
      skillPath: path.join(
        workspaceRoot,
        ".kainclaw",
        "skills",
        "browse-skill",
        "SKILL.md",
      ),
    });
    await expect(
      fs.readFile(
        path.join(
          workspaceRoot,
          ".kainclaw",
          "skills",
          "browse-skill",
          "notes.txt",
        ),
        "utf8",
      ),
    ).resolves.toBe("asset");
  });

  it("lists targets and removes an installed skill from the writable KainClaw root", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-workspace-"));
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skill-source-"));
    tempDirs.push(kainclawHome, workspaceRoot, sourceRoot);

    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;

    const sourceSkillDir = path.join(sourceRoot, "remove-me");
    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: remove-me
description: Removable helper.
---
`,
      "utf8",
    );

    await installSkillFromLocalPath({
      source: sourceSkillDir,
      scope: "user",
      workspaceRoot,
    });

    const list = await formatInstalledSkillsList(workspaceRoot);
    expect(list).toContain("Installed skill targets:");
    expect(list).toContain(`${path.join(kainclawHome, "skills")}`);
    expect(list).toContain(`${path.join(workspaceRoot, ".kainclaw", "skills")}`);
    expect(list).toContain("remove-me: Removable helper.");

    const removed = await removeInstalledSkill({
      skillId: "remove-me",
      scope: "user",
      workspaceRoot,
    });

    expect(removed).toMatchObject({
      removedId: "remove-me",
      scope: "user",
      removedPath: path.join(kainclawHome, "skills", "remove-me"),
    });

    expect(await verifyInstalledSkillVisible({
      skillId: "remove-me",
      workspaceRoot,
    })).toBe(false);
  });
});
