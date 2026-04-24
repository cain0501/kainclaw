import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCustomSkill,
  getCustomSkillsConfigPath,
  loadCustomSkills,
} from "./customSkillsRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("customSkillsRegistry", () => {
  it("loads valid custom skills from .cain/skills.json", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-custom-skills-"));
    tempDirs.push(workspaceRoot);
    const configPath = getCustomSkillsConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        skills: [
          {
            id: "frontend-review",
            title: "Frontend Review",
            summary: "Review frontend polish and accessibility.",
            whenToUse: "When UI work needs a second pass.",
            entrypoint: "/review frontend",
          },
          {
            id: "bad",
            title: "",
          },
        ],
      }),
      "utf8",
    );

    const skills = await loadCustomSkills(workspaceRoot);

    expect(skills).toEqual([
      {
        id: "frontend-review",
        title: "Frontend Review",
        summary: "Review frontend polish and accessibility.",
        whenToUse: "When UI work needs a second pass.",
        entrypoint: "/review frontend",
      },
    ]);
    expect(getCustomSkill(skills, "frontend-review")?.title).toBe("Frontend Review");
  });

  it("returns an empty list when the config file is missing or invalid", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-custom-skills-"));
    tempDirs.push(workspaceRoot);

    expect(await loadCustomSkills(workspaceRoot)).toEqual([]);

    const configPath = getCustomSkillsConfigPath(workspaceRoot);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, "{not valid json", "utf8");

    expect(await loadCustomSkills(workspaceRoot)).toEqual([]);
  });
});
