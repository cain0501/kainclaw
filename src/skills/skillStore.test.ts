import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSkillFrontmatter, SkillStore } from "./skillStore";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempSkillStore(): Promise<{ store: SkillStore; root: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skills-"));
  tempDirs.push(root);
  const store = new SkillStore(root);
  await store.init();
  return { store, root };
}

const SAMPLE_CONTENT = `---
name: fix-ts-imports
description: Fix TypeScript path import errors.
version: 1.0.0
author: KainClaw Auto
tags: [typescript, build]
created_at: "2026-04-15T08:00:00Z"
source: auto
---

# Fix TypeScript Import Paths

## When to use
- Build fails with TS2307

## Steps
1. Check tsconfig paths
`;

describe("parseSkillFrontmatter", () => {
  it("parses name, description, tags from frontmatter", () => {
    const fm = parseSkillFrontmatter(SAMPLE_CONTENT);
    expect(fm.name).toBe("fix-ts-imports");
    expect(fm.description).toBe("Fix TypeScript path import errors.");
    expect(fm.tags).toEqual(["typescript", "build"]);
  });

  it("parses source and createdAt", () => {
    const fm = parseSkillFrontmatter(SAMPLE_CONTENT);
    expect(fm.source).toBe("auto");
    expect(fm.createdAt).toBe("2026-04-15T08:00:00Z");
  });

  it("returns empty object when no frontmatter", () => {
    const fm = parseSkillFrontmatter("# Just markdown");
    expect(fm.name).toBeUndefined();
    expect(fm.description).toBeUndefined();
    expect(fm.tags).toBeUndefined();
  });

  it("handles empty tags array", () => {
    const content = "---\nname: test\ntags: []\n---\n# body";
    const fm = parseSkillFrontmatter(content);
    expect(fm.tags).toEqual([]);
  });
});

describe("SkillStore.create", () => {
  it("creates a SKILL.md file in a new directory", async () => {
    const { store, root } = await makeTempSkillStore();
    const record = await store.create({ name: "fix-ts-imports", content: SAMPLE_CONTENT });

    expect(record.name).toBe("fix-ts-imports");
    expect(record.description).toBe("Fix TypeScript path import errors.");

    const skillMd = path.join(root, "fix-ts-imports", "SKILL.md");
    const written = await fs.readFile(skillMd, "utf8");
    expect(written).toBe(SAMPLE_CONTENT);
  });

  it("creates a SKILL.md inside a category subdirectory", async () => {
    const { store, root } = await makeTempSkillStore();
    const record = await store.create({
      name: "debug-vitest",
      category: "testing",
      content: SAMPLE_CONTENT,
    });

    expect(record.category).toBe("testing");

    const skillMd = path.join(root, "testing", "debug-vitest", "SKILL.md");
    const exists = await fs.access(skillMd).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("throws when skill with the same name already exists", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "fix-ts-imports", content: SAMPLE_CONTENT });

    await expect(
      store.create({ name: "fix-ts-imports", content: SAMPLE_CONTENT }),
    ).rejects.toThrow("Skill already exists: fix-ts-imports");
  });

  it("throws for invalid skill name", async () => {
    const { store } = await makeTempSkillStore();
    await expect(
      store.create({ name: "Invalid Name!", content: SAMPLE_CONTENT }),
    ).rejects.toThrow("Invalid skill name");
  });
});

describe("SkillStore.edit", () => {
  it("overwrites the SKILL.md content", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "my-skill", content: SAMPLE_CONTENT });

    const newContent = SAMPLE_CONTENT.replace(
      "Fix TypeScript path import errors.",
      "Updated description.",
    );
    const record = await store.edit("my-skill", newContent);

    expect(record.description).toBe("Updated description.");
  });

  it("throws when skill does not exist", async () => {
    const { store } = await makeTempSkillStore();
    await expect(store.edit("nonexistent", SAMPLE_CONTENT)).rejects.toThrow(
      "Skill not found: nonexistent",
    );
  });
});

describe("SkillStore.patch", () => {
  it("replaces old_string in the content", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "my-skill", content: SAMPLE_CONTENT });

    const record = await store.patch(
      "my-skill",
      "Check tsconfig paths",
      "Check tsconfig.json paths and baseUrl",
    );

    expect(record.content).toContain("Check tsconfig.json paths and baseUrl");
    expect(record.content).not.toContain("Check tsconfig paths");
  });

  it("throws when old_string is not found", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "my-skill", content: SAMPLE_CONTENT });

    await expect(
      store.patch("my-skill", "string that does not exist", "replacement"),
    ).rejects.toThrow("old_string not found");
  });
});

describe("SkillStore.delete", () => {
  it("deletes the skill directory", async () => {
    const { store, root } = await makeTempSkillStore();
    await store.create({ name: "my-skill", content: SAMPLE_CONTENT });

    await store.delete("my-skill");

    const skillDir = path.join(root, "my-skill");
    const exists = await fs.access(skillDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it("is idempotent when skill does not exist", async () => {
    const { store } = await makeTempSkillStore();
    await expect(store.delete("nonexistent")).resolves.toBeUndefined();
  });
});

describe("SkillStore.list", () => {
  it("returns all skills at root level", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "skill-a", content: SAMPLE_CONTENT });
    await store.create({ name: "skill-b", content: SAMPLE_CONTENT });

    const records = await store.list();
    expect(records).toHaveLength(2);
    expect(records.map(r => r.name).sort()).toEqual(["skill-a", "skill-b"]);
  });

  it("returns skills from nested category directories", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "skill-a", content: SAMPLE_CONTENT });
    await store.create({
      name: "nested-skill",
      category: "testing",
      content: SAMPLE_CONTENT,
    });

    const records = await store.list();
    expect(records).toHaveLength(2);

    const nested = records.find(r => r.category === "testing");
    expect(nested).toBeDefined();
    expect(nested?.name).toBe("nested-skill");
  });

  it("returns empty array when no skills exist", async () => {
    const { store } = await makeTempSkillStore();
    const records = await store.list();
    expect(records).toHaveLength(0);
  });

  it("returns correct skill count including categorized skills", async () => {
    const { store } = await makeTempSkillStore();
    await store.create({ name: "root-skill", content: SAMPLE_CONTENT });
    await store.create({ name: "cat-skill-1", category: "cat", content: SAMPLE_CONTENT });
    await store.create({ name: "cat-skill-2", category: "cat", content: SAMPLE_CONTENT });

    const records = await store.list();
    expect(records).toHaveLength(3);
  });
});

describe("SkillStore.find", () => {
  it("finds a skill by name", async () => {
    const { store } = await makeTempSkillStore();
    const created = await store.create({ name: "fix-ts-imports", content: SAMPLE_CONTENT });
    const found = await store.find("fix-ts-imports");

    expect(found).toBeDefined();
    expect(found?.skillDir).toBe(created.skillDir);
  });

  it("returns undefined for unknown name", async () => {
    const { store } = await makeTempSkillStore();
    const found = await store.find("nope");
    expect(found).toBeUndefined();
  });
});
