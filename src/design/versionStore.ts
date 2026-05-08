import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { DesignOutputType } from "./designPrompt";
import type { DesignSlider } from "./slidersExtractor";

export type DesignVersionSource =
  | "generate"
  | "patch"
  | "editCurrent"
  | "restore";

export type DesignVersionRecord = {
  id: string;
  projectId: string;
  baseVersionId?: string;
  createdAt: number;
  prompt: string;
  title: string;
  outputType: DesignOutputType;
  style: string;
  html?: string;
  sliders: DesignSlider[];
  sliderValues: Record<string, unknown>;
  source: DesignVersionSource;
  deletedAt?: number;
};

type StoredDesignVersions = {
  versions: DesignVersionRecord[];
};

type SqliteModule = typeof import("node:sqlite");

const MAX_STORED_VERSIONS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSliderValues(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeVersionRecord(record: DesignVersionRecord): DesignVersionRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    ...(record.baseVersionId?.trim() ? { baseVersionId: record.baseVersionId.trim() } : {}),
    createdAt: Number(record.createdAt) || Date.now(),
    prompt: typeof record.prompt === "string" ? record.prompt.trim() : "",
    title: typeof record.title === "string" ? record.title.trim() : "",
    outputType: record.outputType ?? "prototype",
    style: typeof record.style === "string" ? record.style.trim() : "",
    ...(typeof record.html === "string" ? { html: record.html } : {}),
    sliders: Array.isArray(record.sliders) ? record.sliders : [],
    sliderValues: normalizeSliderValues(record.sliderValues),
    source: (() => {
      switch (record.source) {
        case "patch":
        case "editCurrent":
        case "restore":
          return record.source;
        default:
          return "generate";
      }
    })(),
    ...(Number.isFinite(record.deletedAt) ? { deletedAt: Number(record.deletedAt) } : {}),
  };
}

export class DesignVersionStore {
  private readonly storeDir: string;
  private readonly legacyStorePath: string;
  private readonly sqlitePath: string;
  private sqliteModulePromise: Promise<SqliteModule | null> | null = null;

  constructor(storageRoot: string) {
    this.storeDir = path.join(storageRoot, "design-lab");
    this.legacyStorePath = path.join(this.storeDir, "versions.json");
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

  private async readLegacyStore(): Promise<StoredDesignVersions> {
    try {
      const raw = await fs.readFile(this.legacyStorePath, "utf8");
      const parsed = JSON.parse(raw) as StoredDesignVersions;
      return {
        versions: Array.isArray(parsed.versions)
          ? parsed.versions.map(version =>
            normalizeVersionRecord(version as DesignVersionRecord))
          : [],
      };
    } catch {
      return { versions: [] };
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
      database.exec("PRAGMA foreign_keys = ON;");
      this.initializeSchema(database);
      await this.migrateLegacyJson(database);
      return await action(database);
    } finally {
      database.close();
    }
  }

  private initializeSchema(database: InstanceType<SqliteModule["DatabaseSync"]>): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS design_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES design_projects(project_id) ON DELETE CASCADE,
        base_version_id TEXT REFERENCES design_versions(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        output_type TEXT NOT NULL,
        style TEXT NOT NULL,
        html TEXT NOT NULL,
        sliders_json TEXT NOT NULL,
        slider_values_json TEXT NOT NULL,
        source TEXT NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_design_versions_project_created
        ON design_versions(project_id, created_at DESC);
    `);
  }

  private async migrateLegacyJson(
    database: InstanceType<SqliteModule["DatabaseSync"]>,
  ): Promise<void> {
    try {
      await fs.access(this.legacyStorePath);
    } catch {
      return;
    }

    const countRow = database
      .prepare("SELECT COUNT(*) AS count FROM design_versions")
      .get() as { count?: number } | undefined;
    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const legacyStore = await this.readLegacyStore();
    if (legacyStore.versions.length === 0) {
      return;
    }

    const insert = database.prepare(`
      INSERT OR REPLACE INTO design_versions (
        id, project_id, base_version_id, created_at, prompt, title, output_type, style, html, sliders_json, slider_values_json, source, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seenProjectCounts = new Map<string, number>();
    for (const version of legacyStore.versions) {
      const count = seenProjectCounts.get(version.projectId) ?? 0;
      if (count >= MAX_STORED_VERSIONS) {
        continue;
      }
      seenProjectCounts.set(version.projectId, count + 1);
      insert.run(
        version.id,
        version.projectId,
        version.baseVersionId ?? null,
        version.createdAt,
        version.prompt,
        version.title || "",
        version.outputType,
        version.style,
        version.html ?? "",
        JSON.stringify(version.sliders ?? []),
        JSON.stringify(version.sliderValues ?? {}),
        version.source,
        version.deletedAt ?? null,
      );
    }
  }

  private parseVersionRow(row: {
    id: string;
    project_id: string;
    base_version_id: string | null;
    created_at: number;
    prompt: string;
    title: string;
    output_type: DesignOutputType;
    style: string;
    html?: string;
    sliders_json: string;
    slider_values_json: string;
    source: DesignVersionSource;
    deleted_at?: number | null;
  }): DesignVersionRecord {
    let sliders: DesignSlider[] = [];
    let sliderValues: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.sliders_json) as DesignSlider[];
      sliders = Array.isArray(parsed) ? parsed : [];
    } catch {
      sliders = [];
    }
    try {
      sliderValues = normalizeSliderValues(JSON.parse(row.slider_values_json));
    } catch {
      sliderValues = {};
    }

    return normalizeVersionRecord({
      id: row.id,
      projectId: row.project_id,
      ...(row.base_version_id ? { baseVersionId: row.base_version_id } : {}),
      createdAt: row.created_at,
      prompt: row.prompt,
      title: row.title,
      outputType: row.output_type,
      style: row.style,
      ...(typeof row.html === "string" ? { html: row.html } : {}),
      sliders,
      sliderValues,
      source: row.source,
      ...(row.deleted_at != null ? { deletedAt: row.deleted_at } : {}),
    });
  }

  private async readLegacyVersionsForProject(projectId: string): Promise<DesignVersionRecord[]> {
    const store = await this.readLegacyStore();
    return store.versions.filter(version => version.projectId === projectId);
  }

  private async readLegacyVersionById(versionId: string): Promise<DesignVersionRecord | null> {
    const store = await this.readLegacyStore();
    return store.versions.find(version => version.id === versionId) ?? null;
  }

  async saveVersion(options: {
    projectId: string;
    baseVersionId?: string;
    prompt: string;
    title?: string;
    outputType: DesignOutputType;
    style: string;
    html: string;
    sliders: DesignSlider[];
    sliderValues?: Record<string, unknown>;
    source: DesignVersionSource;
  }): Promise<DesignVersionRecord> {
    const nextVersion = normalizeVersionRecord({
      id: randomUUID(),
      projectId: options.projectId,
      ...(options.baseVersionId?.trim() ? { baseVersionId: options.baseVersionId.trim() } : {}),
      createdAt: Date.now(),
      prompt: options.prompt,
      title: options.title?.trim() ?? "",
      outputType: options.outputType,
      style: options.style,
      html: options.html,
      sliders: options.sliders,
      sliderValues: options.sliderValues ?? {},
      source: options.source,
    });

    const saved = await this.withDatabase(database => {
      database.prepare(`
        INSERT INTO design_versions (
          id, project_id, base_version_id, created_at, prompt, title, output_type, style, html, sliders_json, slider_values_json, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextVersion.id,
        nextVersion.projectId,
        nextVersion.baseVersionId ?? null,
        nextVersion.createdAt,
        nextVersion.prompt,
        nextVersion.title,
        nextVersion.outputType,
        nextVersion.style,
        nextVersion.html ?? "",
        JSON.stringify(nextVersion.sliders),
        JSON.stringify(nextVersion.sliderValues),
        nextVersion.source,
      );

      database.prepare(`
        UPDATE design_versions
        SET deleted_at = ?
        WHERE project_id = ?
          AND deleted_at IS NULL
          AND id NOT IN (
            SELECT id
            FROM design_versions
            WHERE project_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ?
          )
      `).run(nextVersion.createdAt, nextVersion.projectId, nextVersion.projectId, MAX_STORED_VERSIONS);

      return nextVersion;
    });

    if (saved) {
      return saved;
    }

    await this.ensureDir();
    const store = await this.readLegacyStore();
    const versions = [
      nextVersion,
      ...store.versions.filter(version => version.projectId !== options.projectId || version.id !== nextVersion.id),
    ].slice(0, MAX_STORED_VERSIONS);
    await fs.writeFile(
      this.legacyStorePath,
      JSON.stringify({ versions }, null, 2),
      "utf8",
    );
    return nextVersion;
  }

  async listVersions(projectId: string): Promise<DesignVersionRecord[]> {
    const versions = await this.withDatabase(database => {
      const rows = database.prepare(`
        SELECT id, project_id, base_version_id, created_at, prompt, title, output_type, style,
               sliders_json, slider_values_json, source
        FROM design_versions
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
      `).all(projectId) as Array<{
        id: string;
        project_id: string;
        base_version_id: string | null;
        created_at: number;
        prompt: string;
        title: string;
        output_type: DesignOutputType;
        style: string;
        sliders_json: string;
        slider_values_json: string;
        source: DesignVersionSource;
      }>;

      return rows.map(row => this.parseVersionRow(row));
    });

    return versions ?? this.readLegacyVersionsForProject(projectId);
  }

  async getVersion(versionId: string): Promise<DesignVersionRecord | null> {
    const version = await this.withDatabase(database => {
      const row = database.prepare(`
        SELECT id, project_id, base_version_id, created_at, prompt, title, output_type, style, html, sliders_json, slider_values_json, source, deleted_at
        FROM design_versions
        WHERE id = ?
      `).get(versionId) as {
        id: string;
        project_id: string;
        base_version_id: string | null;
        created_at: number;
        prompt: string;
        title: string;
        output_type: DesignOutputType;
        style: string;
        html: string;
        sliders_json: string;
        slider_values_json: string;
        source: DesignVersionSource;
        deleted_at: number | null;
      } | undefined;

      return row ? this.parseVersionRow(row) : null;
    });

    if (version?.html) {
      return version;
    }

    const legacy = await this.readLegacyVersionById(versionId);
    if (legacy?.html) {
      return legacy;
    }
    return version ?? null;
  }

  async getVersionHtml(versionId: string): Promise<string | null> {
    const trimmed = versionId?.trim();
    if (!trimmed || trimmed === "pending-version") return null;
    const row = await this.withDatabase(database =>
      database.prepare(`SELECT html FROM design_versions WHERE id = ?`).get(trimmed) as { html: string } | undefined
    );
    if (row?.html) return row.html;
    const legacy = await this.readLegacyVersionById(trimmed);
    return legacy?.html ?? null;
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const trimmed = projectId.trim();
    if (!trimmed) {
      return;
    }

    const deleted = await this.withDatabase(database => {
      database.prepare(`
        DELETE FROM design_versions
        WHERE project_id = ?
      `).run(trimmed);
      return true;
    });

    if (deleted) {
      return;
    }

    const store = await this.readLegacyStore();
    const nextVersions = store.versions.filter(version => version.projectId !== trimmed);
    await fs.writeFile(
      this.legacyStorePath,
      JSON.stringify({ versions: nextVersions }, null, 2),
      "utf8",
    );
  }
}
