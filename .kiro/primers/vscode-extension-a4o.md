# Primer: vscode-extension-a4o
## Design 项目删除 + 重命名

### 背景

设计项目创建后无法删除或重命名。IPC 层缺少对应 handler，designProjectStore 也没有这两个方法。

### 需要改的三层

**1. src/design/designProjectStore.ts**
增加两个方法：
```typescript
deleteProject(projectId: string): Promise<void>
renameProject(projectId: string, newName: string): Promise<DesignProject>
```

**2. electron/ElectronChatPanel.ts**
在 design IPC message 路由区（约 line 841-881）增加两个 handler：
```typescript
if (type === "design:deleteProject") → deleteDesignProject(message)
if (type === "design:renameProject") → renameDesignProject(message)
```

实现方法调用 designProjectStore 对应方法，完成后发送 `design:projectsUpdated` 或重新发送项目列表给 renderer。

**3. electron/renderer/index.html — Design Home UI**
在项目卡片上增加操作入口：
- **删除**：卡片右键菜单 或 卡片右上角 hover 时显示「⋯」菜单
- **重命名**：点击项目名称进入 inline 编辑，或菜单里的「重命名」选项
- 删除前弹确认提示（`confirm()` 即可）

### 注意

- 删除项目时，同时删除该项目下所有 design_versions（designVersionStore 里已有按 projectId 查询的能力，需要确认是否有 deleteByProjectId）
- 如果删除的是当前打开的项目，需要回到 Design Home

### 验收

```
1. Design Home 项目卡片上能触发「删除」→ 确认后项目从列表消失
2. Design Home 项目卡片上能触发「重命名」→ 修改后列表更新
3. 删除当前打开的项目 → 自动返回 Design Home
```

### 完成后

```bash
npm test
npm run build:electron
bd close vscode-extension-a4o
git add <files> && git commit -m "Design: add project delete and rename"
git push
```
