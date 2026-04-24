# P05 Worker 全功能权限 Spec

## 一、问题定位

### 当前状态
Worker 工具权限被限制为只读（`WORKER_ALLOWED_TOOLS`）：
```typescript
export const WORKER_ALLOWED_TOOLS = new Set([
  "read_file",
  "glob_files", 
  "search_files",
  "list_directory",  // ⚠️ 此工具名不存在，应为 list_files
  "list_files",
]);
```

### 当前项目实际可用工具
根据 `toolRuntime.ts` 的实现，当前项目已实现的工具包括：
- **文件操作**：`read_file`, `write_file`, `replace_in_file`, `list_files`, `glob_files`, `search_files`
- **命令执行**：`run_command`（白名单命令执行，包含少量有副作用命令如 `git add`, `git commit`, `npm install`，会走审批流程）
- **网络请求**：`fetch_url`
- **浏览器自动化**：`browser_*` 系列工具

### 差距分析
- **当前**：Worker 只能读文件和搜索，无法写文件或执行命令
- **目标**：Worker 获得当前项目已实现的、安全边界清晰的工具权限
- **非目标**：完全对齐官方 Claude Code（需要修改工具运行时本身，超出本 spec 范围）

---

## 二、设计目标

1. **权限开放**：Worker 获得当前项目已实现的文件写入和白名单命令执行能力
2. **边界清晰**：明确 `run_command` 为白名单命令执行（包含少量有副作用命令，受审批保护），MCP 工具需单独设计权限分层
3. **风险可控**：Phase 1 明确限制为"不同 Worker 负责不同文件且审批时机不重叠"，不保证同文件并发安全
4. **渐进实现**：先开放本地工具，后续再优化 MCP 权限和冲突检测

---

## 三、Worker 工具白名单（基于真实工具名）

### 文件操作
```typescript
"read_file",      // 读取文件内容
"write_file",     // 写入新文件或覆盖现有文件
"replace_in_file", // 在文件中替换文本
"list_files",     // 列出目录文件
"glob_files",     // 文件模式匹配搜索
"search_files",   // 文件内容搜索
```

### 命令执行
```typescript
"run_command",    // 白名单命令执行，包含少量有副作用命令（git add/commit/push, npm install 等），会走审批流程
```

### 网络请求
```typescript
"fetch_url",      // HTTP 请求
```

### 浏览器自动化（可选）
```typescript
// browser_* 系列工具（如需要可添加）
```

### Swarm 通信
```typescript
"send_message",   // Worker 与 Coordinator 通信（已有，保留）
```

### MCP 工具
**本次 spec 不包含 MCP 工具开放**。原因：
- MCP 工具包含跨 workspace 边界的破坏性操作（GitHub 创建 issue、Supabase 执行 SQL 等）
- 需要单独设计 Worker 获取 MCP 的路径和权限分层机制
- 建议作为独立 spec（P06）处理

---

## 四、并发冲突处理策略

### Phase 1（本次实现）：有限信任模型
- Worker 拥有文件写入权限
- **明确限制**：
  - 仅建议将不同文件分配给不同 Worker
  - 当前只有单一审批槽位，多个 Worker 同时触发审批时第二个请求会失败
- **不保证**：
  - 同文件并发安全（多个 Worker 同时修改同一文件可能导致覆盖）
  - 并发审批处理（审批时机重叠会导致后续请求失败）
- **协调方式**：Coordinator 在 system prompt 中说明文件分配规则，依赖 AI 遵守
- **用户介入**：发现冲突时手动介入

**Phase 1 适用场景**：
- ✅ Worker A 处理 `src/moduleA.ts`，Worker B 处理 `src/moduleB.ts`（且审批时机不重叠）
- ❌ Worker A 和 Worker B 同时修改 `src/shared.ts`（可能冲突）
- ❌ Worker A 和 Worker B 同时触发文件写入审批（第二个会失败）

### Phase 2（后续优化）：文件锁
- Coordinator 维护文件写入队列
- Worker 写文件前向 Coordinator 申请锁
- 实现类似 `acquireFileLock(path)` / `releaseFileLock(path)` 机制

### Phase 3（长期方案）：进程隔离
- 参考官方 `AsyncLocalStorage` 实现
- 每个 Worker 独立工作目录副本
- 完成后 merge 回主分支

**本次 Spec 范围：Phase 1**

---

## 五、实现步骤

### 5.1 更新 types.ts
修改 `src/agent/swarm/types.ts` 中的 `WORKER_ALLOWED_TOOLS`：

```typescript
export const WORKER_ALLOWED_TOOLS = new Set([
  // 文件操作
  "read_file",
  "write_file",
  "replace_in_file",
  "glob_files",
  "search_files",
  "list_files",
  
  // 命令执行（白名单命令，部分命令有副作用，需审批）
  "run_command",
  
  // 网络请求
  "fetch_url",
  
  // Swarm 通信
  "send_message",
]);
```

### 5.2 更新 Worker System Prompt
修改 `SwarmCoordinator.ts` line 213-217 的 Worker system prompt：

```typescript
const workerSystemPrompt =
  `You are a focused Worker Agent named ${input.name}.\n` +
  "Available tools: file operations (read/write/replace), allowlisted commands (run_command), network requests (fetch_url), and send_message.\n" +
  "IMPORTANT: run_command uses an allowlist that includes some commands with side effects (git add/commit/push, npm install). These will require approval.\n" +
  "Coordinate with other Workers: avoid modifying the same files simultaneously to prevent conflicts.\n" +
  "When you finish, you must call send_message with to=\"coordinator\" to report the complete result.\n" +
  SYSTEM_PROMPT;
```

### 5.3 更新 Coordinator System Prompt
在 `src/agent/agentRunner.ts` 的 `SYSTEM_PROMPT` 或 `SwarmCoordinator.getSwarmToolDefinitions()` 的 `spawn_agent` description 中添加：

```
When using Workers (spawn_agent):
- Workers can write files and run allowlisted commands
- Assign different files to different Workers to avoid conflicts
- Do NOT assign the same file to multiple Workers simultaneously
- Workers will report completion via send_message
```

### 5.4 修正 spawn_agent 工具描述
修改 `SwarmCoordinator.ts` line 47-49：

```typescript
description:
  "Spawn a Worker Agent to handle a subtask in parallel. " +
  "Workers can read/write files and run allowlisted commands (includes some commands with side effects like git commit, npm install). " +
  "Assign different files to different Workers to avoid conflicts. " +
  "At most 5 workers can run at the same time, and workers cannot spawn more workers. " +
  "Returns a worker_id that can be used with send_message and wait_for_agents.",
```

---

## 六、MCP 工具处理（不在本次范围）

### 当前问题
Worker 现在只能访问静态 `toolDefinitions`，而 MCP 工具是在 `extension.ts` 中通过 `runtime.getToolDefinitions()` 动态加载的：

```typescript
// extension.ts line 240
const tools = await runtime.getToolDefinitions();  // 包含静态工具 + MCP 工具

// SwarmCoordinator.ts line 226
const workerTools = [
  ...toolDefinitions.filter(tool => WORKER_ALLOWED_TOOLS.has(tool.name)),  // ❌ 只有静态工具
  sendMessageDef,
];
```

### 为什么不在本次 spec 处理

1. **权限边界问题**：MCP 工具包含跨 workspace 边界的破坏性操作
   - GitHub：创建 issue、PR、评论
   - Supabase：执行 SQL、修改数据库
   - 浏览器：open-world 操作

2. **需要权限分层**：MCP 工具的 metadata 包含 `readOnlyHint` / `destructiveHint` / `openWorldHint`，需要单独设计过滤策略

3. **技术实现复杂**：需要修改 Worker 的工具来源，从静态 `toolDefinitions` 改为动态获取

### 建议后续处理
作为独立 spec（P06）处理 Worker MCP 权限，包括：
- Worker 如何获取动态 MCP 工具列表
- 基于 hint 的权限过滤策略
- MCP 工具审批流程设计

---

## 七、测试验证

### 7.1 基础功能测试
1. 启动扩展，发送消息触发 Worker spawn
2. Worker 调用 `write_file` 创建新文件 → 验证文件成功创建
3. Worker 调用 `replace_in_file` 修改现有文件 → 验证修改生效
4. Worker 调用 `run_command` 运行白名单命令（如 `ls`, `git status`, `git add`） → 验证命令执行和审批流程
5. Worker 调用 `fetch_url` 发起 HTTP 请求 → 验证请求成功

### 7.2 权限边界测试
1. Worker 尝试调用不在白名单的工具 → 验证被拒绝
2. Worker 调用 `run_command` 执行不在 allowlist 的命令（如 `rm -rf`） → 验证被 allowlist 拦截
3. Worker 尝试调用 MCP 工具 → 验证工具不可用（符合预期）

### 7.3 并发测试
1. Coordinator spawn 两个 Worker 同时工作
2. 分配不同文件给不同 Worker → 验证无冲突，两个文件都成功修改
3. 分配相同文件给不同 Worker → **预期可能冲突**，观察是否产生覆盖或错误

### 7.4 审批流程测试
1. Worker 写文件时触发审批 → 验证审批弹窗正常显示
2. 用户拒绝审批 → 验证 Worker 收到拒绝响应，能继续执行其他任务
3. **已知限制**：多个 Worker 同时触发审批时，第二个请求会失败（`Another confirmation is already pending`），这是 Phase 1 已知限制

### 7.5 错误处理测试
1. Worker 调用工具失败（如写入只读文件） → 验证错误信息正确返回
2. Worker 超时或崩溃 → 验证 Coordinator 能正确处理
3. Worker 调用不存在的工具名 → 验证返回 "Unknown tool" 错误
4. Worker 在另一个 Worker 审批期间尝试触发审批 → 验证返回审批冲突错误

---

## 八、验收标准

1. `npm run build` 通过，无 TypeScript 错误
2. Worker 可以成功调用 `write_file` 创建新文件
3. Worker 可以成功调用 `replace_in_file` 修改现有文件
4. Worker 可以成功调用 `run_command` 执行白名单命令（`ls`, `cat`, `git status`, `git add` 等），触发审批流程
5. Worker 可以成功调用 `fetch_url` 发起 HTTP 请求
6. Worker 调用不在白名单的工具时被正确拒绝
7. Worker 调用 MCP 工具时返回工具不可用（符合本次 spec 范围）
8. Worker system prompt 中包含工具说明和并发协调规则
9. `spawn_agent` 工具描述中说明 Worker 权限和文件分配建议
10. `WORKER_ALLOWED_TOOLS` 包含所有本次开放的工具名（使用真实工具名）
11. 多个 Worker 并发工作在不同文件且审批时机不重叠时，不会因权限限制而失败
12. 文档中明确说明 Phase 1 不保证同文件并发安全和并发审批处理

---

## 九、风险评估

### 高风险
- **并发写入冲突**：多个 Worker 同时修改同一文件可能导致数据覆盖
  - 缓解：Phase 1 明确限制为"不同 Worker 负责不同文件"，在 prompt 中说明
  - 接受：Phase 1 不保证同文件并发安全，作为已知限制

- **并发审批冲突**：当前只有单一 `pendingApproval` 槽位，多个 Worker 同时触发审批时第二个请求会失败
  - 影响：即使"不同 Worker 改不同文件"也可能因审批时机重叠而失败
  - 缓解：在文档和测试中明确列为 Phase 1 已知限制
  - 接受：Phase 1 不实现审批队列，后续单独优化
  
### 中风险
- **命令执行边界**：`run_command` 的 allowlist 包含部分有副作用命令（git commit, npm install 等）
  - 缓解：保持现有审批机制（`requestToolApproval`）
  - 验证：测试不在 allowlist 的命令被正确拦截

### 低风险
- **性能影响**：多个 Worker 同时执行可能消耗资源
  - 缓解：已有 `MAX_WORKERS = 5` 限制

---

## 十、参考资料

### 当前项目文件
- `e:\claudecodejingiang\vscode-extension\src\toolRuntime.ts`
  - 真实工具定义和实现（line 613 开始）
  - `run_command` 的 allowlist 配置（line 18, line 370）
  
- `e:\claudecodejingiang\vscode-extension\src\agent\swarm\types.ts`
  - `WORKER_ALLOWED_TOOLS` 定义（需修改）
  
- `e:\claudecodejingiang\vscode-extension\src\agent\swarm\SwarmCoordinator.ts`
  - Worker system prompt（lines 213-217，需修改）
  - Worker 工具过滤逻辑（lines 226-229）
  - `spawn_agent` 工具描述（lines 47-51，需修改）

- `e:\claudecodejingiang\vscode-extension\src\extension.ts`
  - 主流程工具加载（line 240）：`runtime.getToolDefinitions()` 包含静态工具 + MCP 工具
  
- `e:\claudecodejingiang\vscode-extension\src\mcpRuntime.ts`
  - MCP 工具动态生成（line 144）
  - MCP 工具 metadata（line 165）：包含 `readOnlyHint` / `destructiveHint` / `openWorldHint`

### 官方源码参考（仅供参考，不作为实现依据）
- `e:\claudecodejingiang\src\constants\tools.ts` lines 55-71
  - 官方 `ASYNC_AGENT_ALLOWED_TOOLS` 定义
  
- `e:\claudecodejingiang\src\coordinator\coordinatorMode.ts` lines 88-95
  - 官方 Worker 工具配置实现

---

## 十一、实现优先级

**P0（本次必须）**：
- 更新 `WORKER_ALLOWED_TOOLS` 白名单（使用真实工具名）
- 更新 Worker system prompt（说明工具能力和并发限制）
- 更新 `spawn_agent` 工具描述（说明文件分配建议）

**P1（建议同步）**：
- 更新 Coordinator system prompt 添加协调规则
- 补充测试用例（包括反例测试）

**P2（后续独立 spec）**：
- 实现 Worker MCP 工具访问（P06）
- 实现文件锁机制（Phase 2）
- 添加冲突检测和告警

---

## 十二、与原 spec 的主要变更

1. **目标调整**：从"对齐官方 full access"改为"开放当前已实现的安全工具"
2. **工具名修正**：使用 `toolRuntime.ts` 中的真实工具名，删除不存在的工具
3. **MCP 范围调整**：MCP 工具不在本次 spec 范围，建议作为 P06 独立处理
4. **并发模型明确**：Phase 1 明确限制为"不同 Worker 负责不同文件"，不保证同文件安全
5. **实现范围补充**：不只是 types.ts + SwarmCoordinator.ts，还包括 prompt 更新和工具描述修改
6. **测试补充**：增加权限边界、审批流程、错误处理等反例测试
