# Primer: vscode-extension-9pz

## Completion Update

- Installed `codebase-memory-mcp 0.6.1` to `C:\Users\Administrator\AppData\Local\Programs\codebase-memory-mcp\codebase-memory-mcp.exe`.
- Global Codex config now includes `[mcp_servers.codebase-memory-mcp]` in `C:\Users\Administrator\.codex\config.toml`.
- Enabled `auto_index=true`.
- Verified the project is indexed as `E-claudecodejingiang-vscode-extension` with `5693` nodes and `12841` edges.
- Verified MCP availability by initializing the server and calling `tools/list`, `index_repository`, `list_projects`, and `search_graph`.
- Updated repo `AGENTS.md` with the `index-first` rule.

## Verification Notes

- The primer's original smoke query `search_graph name_pattern=".*ChatPanel.*" label="Function"` returns no results because `ElectronChatPanel` indexes primarily as a `Class` with `Method` children, not as a top-level `Function`.
- Working local smoke queries:
  - `search_graph query="ElectronChatPanel" project="E-claudecodejingiang-vscode-extension"`
  - `search_graph query="generateDesignWorkbench" project="E-claudecodejingiang-vscode-extension"`
  - `search_graph name_pattern=".*activate.*" label="Function" project="E-claudecodejingiang-vscode-extension"`

## Follow-up Validation

- In a fresh Codex session, confirm the injected `codebase-memory-mcp` MCP server is exposed through the native tool list without raw stdio probing.
- Confirm watcher behavior for uncommitted working tree edits, `git commit`, and `git checkout`.

## 接入 codebase-memory-mcp：安装 + 配置 + index-first 规则

---

## 背景

为减少 Codex 每次会话重复全仓扫描的 token 消耗，接入 codebase-memory-mcp 作为持久化代码索引层。经 Claude + Codex 联合审查，方案已确定。

token 预期：参考论文均值 10x fewer tokens（31 个真实仓库），不拿 README 的 120x 最优场景做承诺。TypeScript 解析质量为 Good（75–89%），复杂调用链结果需抽样确认。

---

## 任务目标

1. 安装 codebase-memory-mcp（Windows）
2. 对本项目做首次全量索引
3. 开启 auto_index
4. 在 `AGENTS.md` 补入 index-first 规则
5. 验证 MCP 工具在 Codex 会话中可用

---

## Step 1：安装

推荐用 Winget 或 Scoop（PowerShell 可用）：

```powershell
winget install codebase-memory-mcp
# 或
scoop install codebase-memory-mcp
```

备选（手动脚本）：

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1
.\install.ps1
```

SmartScreen 可能弹警告，点"更多信息"→"仍要运行"。

安装完确认二进制可用：

```powershell
codebase-memory-mcp --version
```

---

## Step 2：首次全量索引

```powershell
codebase-memory-mcp cli index_repository '{"repo_path": "E:\\claudecodejingiang\\vscode-extension"}'
```

索引完用 `list_projects` 确认：

```powershell
codebase-memory-mcp cli list_projects
```

---

## Step 3：开启 auto_index

```powershell
codebase-memory-mcp config set auto_index true
```

---

## Step 4：更新 AGENTS.md — 补入 index-first 规则

在 `vscode-extension/AGENTS.md` 的 **Codex Working Boundary** 段落末尾追加以下内容：

```
- **Index-first rule**: Before running Grep, Glob, or Read for symbol lookup, call chain tracing, or impact analysis, query codebase-memory-mcp first. Only open specific source files after a graph hit to confirm details. Do not do full-repo scans when a graph query can answer the question.
```

注意：安装器会自动写 `.codex/AGENTS.md`（项目根），但那个文件不覆盖 `vscode-extension/AGENTS.md` 的作用域，所以必须手动补这条规则。

---

## Step 5：验证

在 Codex 会话中运行：

```
list_projects
```

确认 vscode-extension 项目出现在列表中，节点数和边数合理（不为零）。

再做一次抽样查询确认可用：

```
search_graph name_pattern=".*ChatPanel.*" label="Function"
```

预期返回函数列表，不报错。

---

## 待实测项（验证时顺手确认）

1. `git commit` 后索引是否自动增量更新
2. `git checkout` 切分支后索引刷新是否正常
3. 未提交工作区改动是否触发增量索引（预期不触发，但需确认）

---

## 验收标准

- [ ] `codebase-memory-mcp --version` 正常输出
- [ ] `list_projects` 显示 vscode-extension 项目，节点数 > 0
- [ ] `search_graph` 抽样查询返回结果
- [ ] `AGENTS.md` 已补入 index-first 规则
- [ ] `auto_index` 已开启

---

## 不需要做的事

- 不需要提交 `.codebase-memory/graph.db.zst` 到 git（当前单人开发，不需要团队共享索引）
- 不需要接入 zoekt 或 cocoindex-code（后续再评估）
- 不需要改任何业务代码
