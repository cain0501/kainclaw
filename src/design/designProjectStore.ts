import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type DesignProjectSource = "artifact" | "blank";

export type DesignProjectRecord = {
  projectId: string;
  name: string;
  source: DesignProjectSource;
  sourceArtifactId?: string;
  activeVersionId: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  versionCount?: number;
};

type StoredDesignProjects = {
  projects: DesignProjectRecord[];
};

type SqliteModule = typeof import("node:sqlite");

function normalizeProjectRecord(record: DesignProjectRecord): DesignProjectRecord {
  return {
    projectId: record.projectId,
    name: record.name?.trim() || "Untitled Design",
    source: record.source === "artifact" ? "artifact" : "blank",
    ...(record.sourceArtifactId?.trim() ? { sourceArtifactId: record.sourceArtifactId.trim() } : {}),
    activeVersionId: record.activeVersionId,
    createdAt: Number(record.createdAt) || Date.now(),
    updatedAt: Number(record.updatedAt) || Date.now(),
    lastOpenedAt: Number(record.lastOpenedAt) || Date.now(),
  };
}

export class DesignProjectStore {
  private readonly storeDir: string;
  private readonly legacyStorePath: string;
  private readonly sqlitePath: string;
  private sqliteModulePromise: Promise<SqliteModule | null> | null = null;

  constructor(storageRoot: string) {
    this.storeDir = path.join(storageRoot, "design-lab");
    this.legacyStorePath = path.join(this.storeDir, "projects.json");
    this.sqlitePath = path.join(this.storeDir, "versions.db");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true });
  }

  private loadSqliteModule(): Promise<SqliteModule | null> {
    if (!this.sqliteModulePromise) {
      this.sqliteModulePromise = import("node:sqlite")
        .then(module => module)
        .catch(() => null);
    }
    return this.sqliteModulePromise;
  }

  private async readLegacyStore(): Promise<StoredDesignProjects> {
    try {
      const raw = await fs.readFile(this.legacyStorePath, "utf8");
      const parsed = JSON.parse(raw) as StoredDesignProjects;
      return {
        projects: Array.isArray(parsed.projects)
          ? parsed.projects.map(project => normalizeProjectRecord(project))
          : [],
      };
    } catch {
      return { projects: [] };
    }
  }

  private async withDatabase<T>(
    action: (database: InstanceType<SqliteModule["DatabaseSync"]>) => T | Promise<T>,
  ): Promise<T | null> {
    const sqlite = await this.loadSqliteModule();
    if (!sqlite) {
      return null;
    }

    await this.ensureDir();
    const database = new sqlite.DatabaseSync(this.sqlitePath);
    try {
      this.initializeSchema(database);
      await this.migrateLegacyJson(database);
      return await action(database);
    } finally {
      database.close();
    }
  }

  private initializeSchema(database: InstanceType<SqliteModule["DatabaseSync"]>): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS design_projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('artifact','blank')),
        source_artifact_id TEXT,
        active_version_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_artifact
        ON design_projects(source_artifact_id)
        WHERE source_artifact_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_projects_last_opened
        ON design_projects(last_opened_at DESC);
      CREATE TABLE IF NOT EXISTS design_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    try {
      database.exec(`ALTER TABLE design_projects ADD COLUMN thumbnail TEXT`);
    } catch {
      // column already exists — safe to ignore
    }
  }

  private async migrateLegacyJson(
    database: InstanceType<SqliteModule["DatabaseSync"]>,
  ): Promise<void> {
    const countRow = database
      .prepare("SELECT COUNT(*) AS count FROM design_projects")
      .get() as { count?: number } | undefined;
    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const insert = database.prepare(`
      INSERT OR REPLACE INTO design_projects (
        project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const legacyStore = await this.readLegacyStore();
    for (const project of legacyStore.projects) {
      insert.run(
        project.projectId,
        project.name,
        project.source,
        project.sourceArtifactId ?? null,
        project.activeVersionId,
        project.createdAt,
        project.updatedAt,
        project.lastOpenedAt,
      );
    }

    const versionTableExists = (
      database.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'design_versions'
      `).get() as { name?: string } | undefined
    )?.name === "design_versions";

    const legacyVersionRows = versionTableExists
      ? database.prepare(`
          SELECT project_id, prompt, created_at
          FROM design_versions
          ORDER BY created_at DESC
        `).all() as Array<{
          project_id: string;
          prompt: string;
          created_at: number;
        }>
      : [];

    const existingProjectIds = new Set(
      (database.prepare("SELECT project_id FROM design_projects").all() as Array<{ project_id: string }>)
        .map(row => row.project_id),
    );

    for (const row of legacyVersionRows) {
      if (!row.project_id || existingProjectIds.has(row.project_id)) {
        continue;
      }
      const createdAt = Number(row.created_at) || Date.now();
      insert.run(
        row.project_id,
        (row.prompt?.trim() || "Untitled Design").slice(0, 80),
        "blank",
        null,
        "pending-version",
        createdAt,
        createdAt,
        createdAt,
      );
      existingProjectIds.add(row.project_id);
    }
  }

  private rowToProjectRecord(row: {
    project_id: string;
    name: string;
    source: DesignProjectSource;
    source_artifact_id: string | null;
    active_version_id: string;
    created_at: number;
    updated_at: number;
    last_opened_at: number;
  }): DesignProjectRecord {
    return normalizeProjectRecord({
      projectId: row.project_id,
      name: row.name,
      source: row.source,
      ...(row.source_artifact_id ? { sourceArtifactId: row.source_artifact_id } : {}),
      activeVersionId: row.active_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at,
    });
  }

  async createProject(options: {
    name: string;
    source: DesignProjectSource;
    sourceArtifactId?: string;
    activeVersionId: string;
  }): Promise<DesignProjectRecord> {
    const now = Date.now();
    const project = normalizeProjectRecord({
      projectId: randomUUID(),
      name: options.name,
      source: options.source,
      ...(options.sourceArtifactId?.trim() ? { sourceArtifactId: options.sourceArtifactId.trim() } : {}),
      activeVersionId: options.activeVersionId,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });

    const saved = await this.withDatabase(database => {
      database.prepare(`
        INSERT INTO design_projects (
          project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.projectId,
        project.name,
        project.source,
        project.sourceArtifactId ?? null,
        project.activeVersionId,
        project.createdAt,
        project.updatedAt,
        project.lastOpenedAt,
      );

      return project;
    });

    if (saved) {
      return saved;
    }

    await this.ensureDir();
    const store = await this.readLegacyStore();
    await fs.writeFile(
      this.legacyStorePath,
      JSON.stringify({ projects: [project, ...store.projects] }, null, 2),
      "utf8",
    );
    return project;
  }

  async listProjects(): Promise<DesignProjectRecord[]> {
    const projects = await this.withDatabase(database => {
      const versionCounts = new Map<string, number>();
      try {
        const vcRows = database.prepare(
          "SELECT project_id, COUNT(*) AS cnt FROM design_versions GROUP BY project_id",
        ).all() as Array<{ project_id: string; cnt: number }>;
        for (const row of vcRows) {
          versionCounts.set(row.project_id, Number(row.cnt) || 0);
        }
      } catch {
        // design_versions table may not exist yet — version counts default to 0
      }

      const rows = database.prepare(`
        SELECT project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
        FROM design_projects
        ORDER BY updated_at DESC
      `).all() as Array<{
        project_id: string;
        name: string;
        source: DesignProjectSource;
        source_artifact_id: string | null;
        active_version_id: string;
        created_at: number;
        updated_at: number;
        last_opened_at: number;
      }>;

      return rows.map(row => ({
        ...this.rowToProjectRecord(row),
        versionCount: versionCounts.get(row.project_id) ?? 0,
      }));
    });

    if (projects) {
      return projects;
    }

    const store = await this.readLegacyStore();
    return [...store.projects].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getProject(projectId: string): Promise<DesignProjectRecord | null> {
    const project = await this.withDatabase(database => {
      const row = database.prepare(`
        SELECT project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
        FROM design_projects
        WHERE project_id = ?
      `).get(projectId) as {
        project_id: string;
        name: string;
        source: DesignProjectSource;
        source_artifact_id: string | null;
        active_version_id: string;
        created_at: number;
        updated_at: number;
        last_opened_at: number;
      } | undefined;

      return row ? this.rowToProjectRecord(row) : null;
    });

    if (project !== null) {
      return project;
    }

    const store = await this.readLegacyStore();
    return store.projects.find(entry => entry.projectId === projectId) ?? null;
  }

  async getProjectBySourceArtifactId(sourceArtifactId: string): Promise<DesignProjectRecord | null> {
    const trimmed = sourceArtifactId.trim();
    if (!trimmed) {
      return null;
    }

    const project = await this.withDatabase(database => {
      const row = database.prepare(`
        SELECT project_id, name, source, source_artifact_id, active_version_id, created_at, updated_at, last_opened_at
        FROM design_projects
        WHERE source_artifact_id = ?
      `).get(trimmed) as {
        project_id: string;
        name: string;
        source: DesignProjectSource;
        source_artifact_id: string | null;
        active_version_id: string;
        created_at: number;
        updated_at: number;
        last_opened_at: number;
      } | undefined;

      return row ? this.rowToProjectRecord(row) : null;
    });

    if (project !== null) {
      return project;
    }

    const store = await this.readLegacyStore();
    return store.projects.find(entry => entry.sourceArtifactId === trimmed) ?? null;
  }

  async updateProject(
    projectId: string,
    patch: Partial<Pick<DesignProjectRecord, "name" | "activeVersionId" | "updatedAt" | "lastOpenedAt">>,
  ): Promise<DesignProjectRecord | null> {
    const current = await this.getProject(projectId);
    if (!current) {
      return null;
    }

    const next = normalizeProjectRecord({
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? current.updatedAt,
      lastOpenedAt: patch.lastOpenedAt ?? current.lastOpenedAt,
    });

    const saved = await this.withDatabase(database => {
      database.prepare(`
        UPDATE design_projects
        SET name = ?, active_version_id = ?, updated_at = ?, last_opened_at = ?
        WHERE project_id = ?
      `).run(
        next.name,
        next.activeVersionId,
        next.updatedAt,
        next.lastOpenedAt,
        next.projectId,
      );

      return next;
    });

    if (saved) {
      return saved;
    }

    const store = await this.readLegacyStore();
    const projects = store.projects.map(project =>
      project.projectId === projectId ? next : project);
    await fs.writeFile(
      this.legacyStorePath,
      JSON.stringify({ projects }, null, 2),
      "utf8",
    );
    return next;
  }

  async getLastOpenedProjectId(): Promise<string | null> {
    const lastOpenedProjectId = await this.withDatabase(database => {
      const row = database.prepare(`
        SELECT value
        FROM design_meta
        WHERE key = 'lastOpenedProjectId'
      `).get() as { value?: string | null } | undefined;
      return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
    });
    return lastOpenedProjectId ?? null;
  }

  async setLastOpenedProjectId(projectId: string): Promise<void> {
    const trimmed = projectId.trim();
    if (!trimmed) {
      return;
    }
    const saved = await this.withDatabase(database => {
      database.prepare(`
        INSERT INTO design_meta (key, value)
        VALUES ('lastOpenedProjectId', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(trimmed);
      return true;
    });
    if (saved) {
      return;
    }
  }

  async renameProject(projectId: string, newName: string): Promise<DesignProjectRecord | null> {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      return null;
    }
    return this.updateProject(projectId, {
      name: trimmedName,
      updatedAt: Date.now(),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const trimmed = projectId.trim();
    if (!trimmed) {
      return;
    }

    const deleted = await this.withDatabase(database => {
      database.prepare(`
        DELETE FROM design_projects
        WHERE project_id = ?
      `).run(trimmed);
      database.prepare(`
        DELETE FROM design_meta
        WHERE key = 'lastOpenedProjectId' AND value = ?
      `).run(trimmed);
      return true;
    });

    if (deleted) {
      return;
    }

    const store = await this.readLegacyStore();
    const nextProjects = store.projects.filter(project => project.projectId !== trimmed);
    await fs.writeFile(
      this.legacyStorePath,
      JSON.stringify({ projects: nextProjects }, null, 2),
      "utf8",
    );
  }

  async getThumbnail(projectId: string): Promise<string | undefined> {
    const result = await this.withDatabase(database => {
      const row = database.prepare(
        "SELECT thumbnail FROM design_projects WHERE project_id = ?",
      ).get(projectId) as { thumbnail?: string | null } | undefined;
      return row?.thumbnail ?? null;
    });
    return result ?? undefined;
  }

  async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
    await this.withDatabase(database => {
      database.prepare(
        "UPDATE design_projects SET thumbnail = ? WHERE project_id = ?",
      ).run(thumbnail, projectId);
      return true;
    });
  }

  dispose(): void {
    this.sqliteModulePromise = null;
  }
}
