import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { DesignProjectStore } from "./designProjectStore";
import { DesignVersionStore } from "./versionStore";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("DesignVersionStore", () => {
  it("saves and lists versions newest-first per project without html payloads", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const projectA = await projectStore.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });
    const projectB = await projectStore.createProject({
      name: "Project B",
      source: "blank",
      activeVersionId: "pending-version",
    });

    const first = await store.saveVersion({
      projectId: projectA.projectId,
      prompt: "first prompt",
      title: "generated",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>A</body></html>",
      sliders: [],
      source: "generate",
      sliderValues: {},
    });
    const second = await store.saveVersion({
      projectId: projectA.projectId,
      prompt: "second prompt",
      title: "patched",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>B</body></html>",
      sliders: [],
      source: "patch",
      sliderValues: {},
    });
    await store.saveVersion({
      projectId: projectB.projectId,
      prompt: "other project",
      title: "generated",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>C</body></html>",
      sliders: [],
      source: "generate",
      sliderValues: {},
    });

    const versions = await store.listVersions(projectA.projectId);
    expect(versions.map(version => version.id)).toEqual([second.id, first.id]);
    expect(versions[0]?.source).toBe("patch");
    expect(versions[0]?.title).toBe("patched");
    expect(versions[0]?.html).toBeUndefined();
  });

  it("stores title, sliderValues, baseVersionId, and extended sources", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const project = await projectStore.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });

    const base = await store.saveVersion({
      projectId: project.projectId,
      prompt: "base version",
      title: "generated",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>Base</body></html>",
      sliders: [],
      sliderValues: {},
      source: "generate",
    });
    const saved = await store.saveVersion({
      projectId: project.projectId,
      baseVersionId: base.id,
      prompt: "edit current",
      title: "edited",
      outputType: "prototype",
      style: "editorial",
      html: "<!DOCTYPE html><html><body>Saved</body></html>",
      sliders: [],
      sliderValues: { gridOpacity: 0.12 },
      source: "editCurrent",
    });

    await expect(store.getVersion(saved.id)).resolves.toMatchObject({
      id: saved.id,
      baseVersionId: base.id,
      title: "edited",
      source: "editCurrent",
      sliderValues: { gridOpacity: 0.12 },
    });
  });

  it("restores a saved version by id with full html content", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const project = await projectStore.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });

    const saved = await store.saveVersion({
      projectId: project.projectId,
      prompt: "landing page",
      title: "generated",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>Saved</body></html>",
      sliders: [
        {
          id: "primary",
          label: "Primary",
          type: "color",
          cssVar: "--color-primary",
          default: "#111111",
        },
      ],
      source: "generate",
      sliderValues: {},
    });

    await expect(store.getVersion(saved.id)).resolves.toMatchObject({
      id: saved.id,
      prompt: "landing page",
      title: "generated",
      html: expect.stringContaining("Saved"),
      sliders: [
        expect.objectContaining({
          id: "primary",
          cssVar: "--color-primary",
        }),
      ],
    });
  });

  it("soft-deletes versions beyond the newest 20 while keeping them restorable by id", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const project = await projectStore.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });

    const savedIds: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      const saved = await store.saveVersion({
        projectId: project.projectId,
        prompt: `prompt-${index}`,
        title: "generated",
        outputType: "prototype",
        style: "",
        html: `<!DOCTYPE html><html><body>${index}</body></html>`,
        sliders: [],
        source: "generate",
        sliderValues: {},
      });
      savedIds.push(saved.id);
    }

    const versions = await store.listVersions(project.projectId);
    expect(versions).toHaveLength(20);
    expect(versions[0]?.prompt).toBe("prompt-24");
    expect(versions[19]?.prompt).toBe("prompt-5");
    expect(versions.every(version => version.deletedAt === undefined)).toBe(true);

    const softDeleted = await store.getVersion(savedIds[0]!);
    expect(softDeleted).toMatchObject({
      id: savedIds[0],
      prompt: "prompt-0",
      deletedAt: expect.any(Number),
      html: expect.stringContaining(">0<"),
    });
  });

  it("migrates legacy json versions into sqlite on first access", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const designLabDir = path.join(storageRoot, "design-lab");
    await fs.mkdir(designLabDir, { recursive: true });
    await fs.writeFile(
      path.join(designLabDir, "projects.json"),
      JSON.stringify({
        projects: [
          {
            projectId: "design-project-a",
            name: "Legacy Project",
            source: "blank",
            activeVersionId: "pending-version",
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
            lastOpenedAt: 1700000000000,
          },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(designLabDir, "versions.json"),
      JSON.stringify({
        versions: [
          {
            id: "legacy-version-1",
            projectId: "design-project-a",
            createdAt: 1700000000000,
            prompt: "legacy prompt",
            title: "generated",
            outputType: "prototype",
            style: "legacy style",
            html: "<!DOCTYPE html><html><body>Legacy</body></html>",
            sliders: [],
            source: "generate",
            sliderValues: {},
          },
        ],
      }),
      "utf8",
    );

    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);
    await projectStore.listProjects();

    const versions = await store.listVersions("design-project-a");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: "legacy-version-1",
      prompt: "legacy prompt",
      title: "generated",
    });

    const restored = await store.getVersion("legacy-version-1");
    expect(restored?.html).toContain("Legacy");

    const sqliteBytes = await fs.readFile(path.join(designLabDir, "versions.db"));
    expect(sqliteBytes.byteLength).toBeGreaterThan(0);
  });

  it("uses migrations for title and deleted_at columns", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const designLabDir = path.join(storageRoot, "design-lab");
    await fs.mkdir(designLabDir, { recursive: true });

    const sqlite = await import("node:sqlite");
    const sqlitePath = path.join(designLabDir, "versions.db");
    const seedDatabase = new sqlite.DatabaseSync(sqlitePath);
    seedDatabase.exec(`
      CREATE TABLE design_projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        source_artifact_id TEXT,
        active_version_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );
      CREATE TABLE design_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        output_type TEXT NOT NULL,
        style TEXT NOT NULL,
        html TEXT NOT NULL,
        sliders_json TEXT NOT NULL,
        slider_values_json TEXT NOT NULL,
        source TEXT NOT NULL
      );
      INSERT INTO design_projects (
        project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
      ) VALUES ('design-project-a', 'Legacy Project', 'blank', NULL, 'legacy-sqlite-version', 1700000000000, 1700000000000, 1700000000000);
    `);
    seedDatabase.prepare(`
      INSERT INTO design_versions (
        id, project_id, created_at, prompt, output_type, style, html, sliders_json, slider_values_json, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "legacy-sqlite-version",
      "design-project-a",
      1700000000000,
      "legacy sqlite prompt",
      "prototype",
      "legacy style",
      "<!DOCTYPE html><html><body>Legacy SQLite</body></html>",
      "[]",
      "{}",
      "generate",
    );
    seedDatabase.close();

    const projectStore = new DesignProjectStore(storageRoot);
    const store = new DesignVersionStore(storageRoot);
    await projectStore.listProjects();

    const versions = await store.listVersions("design-project-a");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: "legacy-sqlite-version",
      prompt: "legacy sqlite prompt",
      title: "",
      sliderValues: {},
    });

    const verifyDatabase = new sqlite.DatabaseSync(sqlitePath);
    const cols = verifyDatabase.prepare("PRAGMA table_info(design_versions)").all() as { name: string }[];
    const migrationVersions = verifyDatabase.prepare(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    ).all() as Array<{ version: number }>;
    const migratedRow = verifyDatabase.prepare(`
      SELECT title, deleted_at
      FROM design_versions
      WHERE id = ?
    `).get("legacy-sqlite-version") as {
      title: string;
      deleted_at: number | null;
    };
    verifyDatabase.close();

    expect(cols.map(column => column.name)).toEqual(expect.arrayContaining([
      "title",
      "deleted_at",
    ]));
    expect(migrationVersions.map(row => row.version)).toEqual([1, 2, 3, 4, 5]);
    expect(migratedRow).toEqual({
      title: "",
      deleted_at: null,
    });
  });
});
