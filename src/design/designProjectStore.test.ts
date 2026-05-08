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

describe("DesignProjectStore", () => {
  it("creates and lists projects sorted by updatedAt desc", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-projects-"));
    tempDirs.push(storageRoot);
    const store = new DesignProjectStore(storageRoot);

    const first = await store.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "version-a1",
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await store.createProject({
      name: "Project B",
      source: "artifact",
      sourceArtifactId: "artifact-1",
      activeVersionId: "version-b1",
    });

    const projects = await store.listProjects();
    expect(projects.map(project => project.projectId)).toEqual([second.projectId, first.projectId]);
    expect(projects[0]).toMatchObject({
      name: "Project B",
      source: "artifact",
      sourceArtifactId: "artifact-1",
    });
  });

  it("finds an existing project by sourceArtifactId", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-projects-"));
    tempDirs.push(storageRoot);
    const store = new DesignProjectStore(storageRoot);

    const created = await store.createProject({
      name: "Artifact Project",
      source: "artifact",
      sourceArtifactId: "artifact-123",
      activeVersionId: "version-1",
    });

    await expect(store.getProjectBySourceArtifactId("artifact-123")).resolves.toMatchObject({
      projectId: created.projectId,
      name: "Artifact Project",
    });
  });

  it("updates activeVersionId and lastOpenedAt", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-projects-"));
    tempDirs.push(storageRoot);
    const store = new DesignProjectStore(storageRoot);

    const created = await store.createProject({
      name: "Editable Project",
      source: "blank",
      activeVersionId: "version-1",
    });

    const updated = await store.updateProject(created.projectId, {
      activeVersionId: "version-2",
      lastOpenedAt: created.lastOpenedAt + 100,
      updatedAt: created.updatedAt + 100,
    });

    expect(updated).toMatchObject({
      activeVersionId: "version-2",
      lastOpenedAt: created.lastOpenedAt + 100,
      updatedAt: created.updatedAt + 100,
    });
  });

  it("runs schema migrations and exposes non-deleted version counts", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-projects-"));
    tempDirs.push(storageRoot);
    const store = new DesignProjectStore(storageRoot);
    const versionStore = new DesignVersionStore(storageRoot);

    const project = await store.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });

    for (let index = 0; index < 25; index += 1) {
      await versionStore.saveVersion({
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
    }

    const listed = await store.listProjects();
    const currentProject = listed.find(entry => entry.projectId === project.projectId);
    expect(currentProject?.versionCount).toBe(20);

    const sqlite = await import("node:sqlite");
    const database = new sqlite.DatabaseSync(path.join(storageRoot, "design-lab", "versions.db"));
    const migrationVersions = database.prepare(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    ).all() as Array<{ version: number }>;
    const projectColumns = database.prepare("PRAGMA table_info(design_projects)").all() as Array<{ name: string }>;
    database.close();

    expect(migrationVersions.map(row => row.version)).toEqual([1, 2, 3]);
    expect(projectColumns.map(column => column.name)).toContain("thumbnail");
  });

  it("cascades version deletion when a project is deleted", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-projects-"));
    tempDirs.push(storageRoot);
    const store = new DesignProjectStore(storageRoot);
    const versionStore = new DesignVersionStore(storageRoot);

    const project = await store.createProject({
      name: "Project A",
      source: "blank",
      activeVersionId: "pending-version",
    });
    const version = await versionStore.saveVersion({
      projectId: project.projectId,
      prompt: "prompt",
      title: "generated",
      outputType: "prototype",
      style: "",
      html: "<!DOCTYPE html><html><body>A</body></html>",
      sliders: [],
      source: "generate",
      sliderValues: {},
    });

    await store.deleteProject(project.projectId);

    await expect(store.getProject(project.projectId)).resolves.toBeNull();
    await expect(versionStore.getVersion(version.id)).resolves.toBeNull();
  });
});
