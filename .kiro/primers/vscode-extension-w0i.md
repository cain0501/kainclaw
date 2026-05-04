# Task Primer: vscode-extension-w0i — design_versions 缺 base_version_id 列的迁移补丁

> **Session entry point.** Read this first. 不需要读其他文档。

## 问题

用户本地数据库是旧版本建的，`design_versions` 表没有 `base_version_id` 列。
`initializeSchema` 用 `CREATE TABLE IF NOT EXISTS`，遇到已有表直接跳过，新列不会自动补上。
点「生成设计」时报错：`table design_versions has no column named base_version_id`

## Next Step（本次 session 只做这一件事）

在 `src/design/versionStore.ts` 的 `initializeSchema` 方法末尾，加一个列存在性检查，不存在则补列：

```ts
const cols = database.prepare("PRAGMA table_info(design_versions)").all() as { name: string }[];
if (!cols.some(c => c.name === 'base_version_id')) {
  database.exec("ALTER TABLE design_versions ADD COLUMN base_version_id TEXT");
}
```

**只改这一处，不动其他逻辑。**

## 涉及文件

`src/design/versionStore.ts`，`initializeSchema` 方法（约第 128 行）

## Verification

```bash
npm test          # 基线：169 文件，1310 测试
npm run check
npm run build
npm run build:electron
```

手测步骤（告知用户执行）：
1. 重启 Electron
2. 进入 KainClaw Design，选「新建设计」，输入需求，点「生成设计」
3. 不再报 base_version_id 错误，设计正常生成

## Definition of Done

> **Codex 负责验证命令，用户只做手测。**

- [ ] `npm test` 通过（169 文件，1310 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] 新建设计不再报 base_version_id 错误
- [ ] beads notes 已更新（做了什么 + 下一步）
- [ ] 告知用户手测步骤
