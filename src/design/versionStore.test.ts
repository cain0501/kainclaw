import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { DesignVersionStore } from "./versionStore";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("DesignVersionStore", () => {
  it("saves and lists versions newest-first per project", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const first = await store.saveVersion({
      projectId: "design-project-a",
      prompt: "first prompt",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>A</body></html>",
      sliders: [],
      source: "generate",
      sliderValues: {},
    });
    const second = await store.saveVersion({
      projectId: "design-project-a",
      prompt: "second prompt",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>B</body></html>",
      sliders: [],
      source: "patch",
      sliderValues: {},
    });
    await store.saveVersion({
      projectId: "design-project-b",
      prompt: "other project",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>C</body></html>",
      sliders: [],
      source: "generate",
      sliderValues: {},
    });

    const versions = await store.listVersions("design-project-a");
    expect(versions.map(version => version.id)).toEqual([second.id, first.id]);
    expect(versions[0]?.source).toBe("patch");
  });

  it("stores sliderValues, baseVersionId, and extended sources", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const saved = await store.saveVersion({
      projectId: "design-project-a",
      baseVersionId: "version-1",
      prompt: "edit current",
      outputType: "prototype",
      style: "editorial",
      html: "<!DOCTYPE html><html><body>Saved</body></html>",
      sliders: [],
      sliderValues: { gridOpacity: 0.12 },
      source: "editCurrent",
    });

    await expect(store.getVersion(saved.id)).resolves.toMatchObject({
      id: saved.id,
      baseVersionId: "version-1",
      source: "editCurrent",
      sliderValues: { gridOpacity: 0.12 },
    });
  });

  it("restores a saved version by id", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    const saved = await store.saveVersion({
      projectId: "design-project-a",
      prompt: "landing page",
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
      html: expect.stringContaining("Saved"),
      sliders: [
        expect.objectContaining({
          id: "primary",
          cssVar: "--color-primary",
        }),
      ],
    });
  });

  it("keeps only the newest 20 versions per project", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const store = new DesignVersionStore(storageRoot);

    for (let index = 0; index < 25; index += 1) {
      await store.saveVersion({
        projectId: "design-project-a",
        prompt: `prompt-${index}`,
        outputType: "prototype",
        style: "",
        html: `<!DOCTYPE html><html><body>${index}</body></html>`,
        sliders: [],
        source: "generate",
      sliderValues: {},
      });
    }

    const versions = await store.listVersions("design-project-a");
    expect(versions).toHaveLength(20);
    expect(versions[0]?.prompt).toBe("prompt-24");
    expect(versions[19]?.prompt).toBe("prompt-5");
  });

  it("migrates legacy json versions into sqlite on first access", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const designLabDir = path.join(storageRoot, "design-lab");
    await fs.mkdir(designLabDir, { recursive: true });
    await fs.writeFile(
      path.join(designLabDir, "versions.json"),
      JSON.stringify({
        versions: [
          {
            id: "legacy-version-1",
            projectId: "design-project-a",
            createdAt: 1700000000000,
            prompt: "legacy prompt",
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

    const store = new DesignVersionStore(storageRoot);
    const versions = await store.listVersions("design-project-a");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: "legacy-version-1",
      prompt: "legacy prompt",
      html: expect.stringContaining("Legacy"),
    });

    const sqliteBytes = await fs.readFile(path.join(designLabDir, "versions.db"));
    expect(sqliteBytes.byteLength).toBeGreaterThan(0);
  });

  it("fills missing sqlite columns during schema initialization", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-versions-"));
    tempDirs.push(storageRoot);
    const designLabDir = path.join(storageRoot, "design-lab");
    await fs.mkdir(designLabDir, { recursive: true });

    const sqlite = await import("node:sqlite");
    const sqlitePath = path.join(designLabDir, "versions.db");
    const seedDatabase = new sqlite.DatabaseSync(sqlitePath);
    seedDatabase.exec(`
      CREATE TABLE design_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        output_type TEXT NOT NULL,
        style TEXT NOT NULL,
        html TEXT NOT NULL,
        sliders_json TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_design_versions_project_created
        ON design_versions(project_id, created_at DESC);
    `);
    seedDatabase.prepare(`
      INSERT INTO design_versions (
        id, project_id, created_at, prompt, output_type, style, html, sliders_json, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "legacy-sqlite-version",
      "design-project-a",
      1700000000000,
      "legacy sqlite prompt",
      "prototype",
      "legacy style",
      "<!DOCTYPE html><html><body>Legacy SQLite</body></html>",
      "[]",
      "generate",
    );
    seedDatabase.close();

    const store = new DesignVersionStore(storageRoot);
    const versions = await store.listVersions("design-project-a");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: "legacy-sqlite-version",
      prompt: "legacy sqlite prompt",
      sliderValues: {},
    });

    const verifyDatabase = new sqlite.DatabaseSync(sqlitePath);
    const cols = verifyDatabase.prepare("PRAGMA table_info(design_versions)").all() as { name: string }[];
    const migratedRow = verifyDatabase.prepare(`
      SELECT base_version_id, slider_values_json
      FROM design_versions
      WHERE id = ?
    `).get("legacy-sqlite-version") as {
      base_version_id: string | null;
      slider_values_json: string;
    };
    verifyDatabase.close();

    expect(cols.map(column => column.name)).toEqual(expect.arrayContaining([
      "base_version_id",
      "slider_values_json",
    ]));
    expect(migratedRow).toEqual({
      base_version_id: null,
      slider_values_json: "{}",
    });
  });
});
