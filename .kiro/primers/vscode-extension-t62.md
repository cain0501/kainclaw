# Task Primer: vscode-extension-t62 — Design DB 规范化

> **Session entry point.** Read this first.

## Task Goal

设计模块的数据库设计不符合行业标准，存在 5 个问题需要修复：

1. **无外键约束** — SQLite 外键默认关闭，孤儿数据静默积累
2. **Schema 用 ALTER TABLE 打补丁** — 没有迁移管理，字段演化靠运气
3. **`listVersions` 把完整 HTML 全拉出来** — 列表展示不需要 html，浪费带宽
4. **版本没有独立 title 字段** — 前端用 prompt 截断充数，用户看到"版本 1 / 版本 2"
5. **硬删除超限版本** — 超过 20 条永久丢失，无法恢复

**涉及文件：**
- `src/design/versionStore.ts`
- `src/design/designProjectStore.ts`
- `electron/ElectronChatPanel.ts`（saveDesignVersion 传 title）
- `electron/renderer/index.html`（版本历史显示 title）

---

## Out of Scope

- 不改 `src/extension.ts`
- 不改其他非设计模块的存储
- 不改 UI 之外的 renderer 逻辑
- 不做内容与元数据的完全分离（html 留在 versions 表，只优化 listVersions 查询）
- 不改 `pending-version` 创建流程（风险高，单独处理）

---

## 修复详情

### Fix 1：外键约束

在 `versionStore.ts` 和 `designProjectStore.ts` 的 `withDatabase` 方法里，`initializeSchema` 调用**之前**加：

```typescript
database.exec("PRAGMA foreign_keys = ON;");
```

然后在 `design_versions` 表的 `CREATE TABLE` 里加外键声明：

```sql
CREATE TABLE IF NOT EXISTS design_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES design_projects(project_id) ON DELETE CASCADE,
  base_version_id TEXT REFERENCES design_versions(id) ON DELETE SET NULL,
  -- ... 其余字段不变
);
```

**注意**：
- `ON DELETE CASCADE` 意味着删除项目时，该项目的版本自动清除
- `base_version_id` 用 `ON DELETE SET NULL`，不能用 CASCADE（否则删一个版本会级联删所有以它为 base 的版本）
- `PRAGMA foreign_keys = ON` 必须在每次打开数据库连接时执行（SQLite 是会话级设置，不持久化）
- 两个 Store 共用同一个 `.db` 文件（`versions.db`），但各自独立开关连接，**两个 `withDatabase` 都要加**

---

### Fix 2：迁移管理（替换 ALTER TABLE 打补丁方式）

#### 2a. 在 `versions.db` 里加 `schema_migrations` 表

在 `designProjectStore.ts` 的 `initializeSchema` 里（它负责共享库的初始化）加：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

#### 2b. 写一个 `runMigrations` 方法

```typescript
private runMigrations(database: InstanceType<SqliteModule["DatabaseSync"]>): void {
  const applied = new Set(
    (database.prepare("SELECT version FROM schema_migrations").all() as { version: number }[])
      .map(row => row.version)
  );

  const migrations: Array<{ version: number; up: string }> = [
    {
      version: 1,
      up: `ALTER TABLE design_projects ADD COLUMN thumbnail TEXT`,
    },
    {
      version: 2,
      up: `ALTER TABLE design_versions ADD COLUMN title TEXT NOT NULL DEFAULT ''`,
    },
    {
      version: 3,
      up: `ALTER TABLE design_versions ADD COLUMN deleted_at INTEGER`,
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    try {
      database.exec(migration.up);
    } catch {
      // 字段已存在（旧库手动加过）时 ALTER TABLE 会报错，忽略即可
    }
    database.prepare(
      "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
    ).run(migration.version, Date.now());
  }
}
```

#### 2c. 替换现有的 ALTER TABLE 补丁

`designProjectStore.ts` 里有这段代码（手动打补丁）：

```typescript
try {
  database.exec(`ALTER TABLE design_projects ADD COLUMN thumbnail TEXT`);
} catch {
  // already exists
}
```

**删掉**，改由 `runMigrations` 统一处理（migration version 1 就是这条）。

`versionStore.ts` 里的 `requiredColumns` 循环也是同类补丁，**删掉**，迁移逻辑统一放到 `designProjectStore` 的 `runMigrations` 里。

#### 2d. 在 `withDatabase` 里调用 `runMigrations`

在 `initializeSchema` 之后调用：

```typescript
this.initializeSchema(database);
this.runMigrations(database);   // ← 新增
await this.migrateLegacyJson(database);
```

**只在 `designProjectStore` 里放 `runMigrations`**，因为两个 Store 共用同一个 db 文件，避免重复执行。`versionStore` 的 `withDatabase` 里不需要加。

---

### Fix 3：`listVersions` 不 select html

当前查询（`versionStore.ts` ~line 350）：

```sql
SELECT id, project_id, base_version_id, created_at, prompt, output_type, style, html,
       sliders_json, slider_values_json, source
FROM design_versions
WHERE project_id = ?
ORDER BY created_at DESC
```

**改为**（去掉 html，加 title，加 deleted_at 过滤）：

```sql
SELECT id, project_id, base_version_id, created_at, prompt, title, output_type, style,
       sliders_json, slider_values_json, source
FROM design_versions
WHERE project_id = ? AND deleted_at IS NULL
ORDER BY created_at DESC
```

对应的 `rowToVersionRecord` 不再需要映射 `html` 字段（列表不返回 html）。

**`DesignVersionRecord` 类型**里的 `html` 字段改为可选：

```typescript
export type DesignVersionRecord = {
  id: string;
  projectId: string;
  baseVersionId?: string;
  createdAt: number;
  prompt: string;
  title: string;        // ← 新增
  outputType: DesignOutputType;
  style: string;
  html?: string;        // ← 改为可选，listVersions 不填，getVersion 填
  sliders: DesignSlider[];
  sliderValues: Record<string, unknown>;
  source: DesignVersionSource;
  deletedAt?: number;   // ← 新增，软删除时间戳
};
```

`getVersion` 保持不变，继续 select html（恢复版本时需要完整内容）。

---

### Fix 4：版本 title 字段

#### 4a. `saveVersion` 接收 title

```typescript
async saveVersion(options: {
  projectId: string;
  baseVersionId?: string;
  prompt: string;
  title?: string;       // ← 新增，可选
  outputType: DesignOutputType;
  style: string;
  html: string;
  sliders: DesignSlider[];
  sliderValues?: Record<string, unknown>;
  source: DesignVersionSource;
}): Promise<DesignVersionRecord>
```

INSERT 语句加 `title` 列：

```sql
INSERT INTO design_versions (
  id, project_id, base_version_id, created_at, prompt, title,
  output_type, style, html, sliders_json, slider_values_json, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

`title` 的值：`options.title?.trim() ?? ""`

#### 4b. `ElectronChatPanel.ts` 传 title

在 `saveDesignVersion` 调用 `this.designVersionStore.saveVersion(...)` 时，根据 `source` 自动生成 title：

```typescript
const titleMap: Record<DesignVersionSource, string> = {
  generate: "生成",
  patch:    "改写元素",
  editCurrent: "编辑",
  restore:  "恢复版本",
};
const title = titleMap[options.source] ?? "";
```

传给 `saveVersion({ ..., title })`。

#### 4c. renderer 版本历史显示 title

在 `renderMidtaiVersionsPanel`（`electron/renderer/index.html`）里，label 改为优先显示 title：

```javascript
const label = version.title && version.title.trim()
  ? version.title
  : version.prompt
    ? String(version.prompt).slice(0, 28)
    : `版本 ${index + 1}`;
```

旧版 `renderDesignSlidersPanel`（design workbench 版本历史 section）也做同样改动。

---

### Fix 5：软删除（替换硬删超限逻辑）

**当前**（`versionStore.ts` saveVersion 里）：

```sql
DELETE FROM design_versions
WHERE project_id = ?
  AND id NOT IN (
    SELECT id FROM design_versions
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  )
```

**改为**：超过 20 条时打软删除标记而不是硬删：

```sql
UPDATE design_versions
SET deleted_at = ?
WHERE project_id = ?
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT id FROM design_versions
    WHERE project_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  )
```

`run(Date.now(), projectId, projectId, MAX_STORED_VERSIONS)`

软删除记录仍然可以通过 `getVersion(id)` 恢复（`getVersion` 不加 `deleted_at IS NULL` 过滤）。

---

## 实现顺序

1. `designProjectStore.ts`：加 `schema_migrations` 表 + `runMigrations` + 迁移文件（v1=thumbnail, v2=title, v3=deleted_at）+ 删除旧 ALTER TABLE 补丁 + 加外键 PRAGMA
2. `versionStore.ts`：删除 `requiredColumns` 循环 + 加外键 PRAGMA + 改 `listVersions` SQL + 改 `saveVersion` 接收 title + 软删除逻辑 + 更新 `DesignVersionRecord` 类型 + 更新 `rowToVersionRecord`
3. `ElectronChatPanel.ts`：`saveDesignVersion` 传 title
4. `electron/renderer/index.html`：版本历史显示 title

---

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

重点测试：
- `versionStore.test.ts` — saveVersion / listVersions / getVersion 全部过
- `designProjectStore.test.ts` — createProject / updateProject / listProjects 全部过
- 手动：生成 2 个设计，进版本历史，确认 title 正常显示（"生成" / "改写元素" / "恢复版本"）
- 手动：外键约束生效——删除一个项目后，对应版本不再出现

## High-Risk Files Touched

- `src/design/versionStore.ts`
- `src/design/designProjectStore.ts`
- `electron/ElectronChatPanel.ts`（只改 saveDesignVersion title 传参）
- `electron/renderer/index.html`（只改版本 label 显示逻辑）

## Definition of Done

- [ ] `PRAGMA foreign_keys = ON` 在两个 Store 的 withDatabase 里都有
- [ ] `schema_migrations` 表存在，v1/v2/v3 迁移跑通
- [ ] 旧 `ALTER TABLE` 补丁代码已删除
- [ ] `listVersions` 不再 select html
- [ ] `design_versions` 表有 `title` 和 `deleted_at` 列
- [ ] saveVersion 接收并存储 title
- [ ] 超限版本走软删除，不硬删
- [ ] `npm test` 全部通过
- [ ] `npm run check` 通过
- [ ] `npm run build` + `npm run build:electron` 通过
