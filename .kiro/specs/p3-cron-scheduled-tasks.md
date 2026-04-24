# P3 · Cron 定时任务

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

让用户和 agent 能够创建定时 / 周期性任务，在无人值守的情况下按时触发 agent 执行。对标官方 Claude Code 的 `ScheduleCronTool` 和 `/agent-triggers`。

---

## 二、核心能力

1. **Agent 可调用**：通过 `ScheduleCronTool` 创建/删除定时任务
2. **用户可管理**：通过 `/cron` 命令查看、暂停、删除定时任务
3. **跨 session 持久化**：任务定义存到 `globalStorageUri`，扩展重启后自动恢复
4. **触发执行**：到时间后在后台派生一个 agent 任务，结果写入任务历史

---

## 三、存储格式

位置：`{globalStorageUri}/cron-jobs.json`

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "cron_abc123",
      "name": "daily-code-review",
      "description": "每天下午 6 点自动做一次代码审查",
      "cron": "0 18 * * *",
      "agentPrompt": "对今天所有提交做一次代码审查，重点关注安全问题",
      "workspaceRoot": "E:/myproject",
      "enabled": true,
      "createdAt": "2026-04-15T10:00:00Z",
      "lastRunAt": null,
      "lastRunStatus": null,
      "nextRunAt": "2026-04-15T18:00:00Z"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 ID，`cron_` + 随机 8 字符 |
| `name` | string | 人类可读名称，用于 `/cron` 列表展示 |
| `description` | string | 可选，说明用途 |
| `cron` | string | 标准 5 字段 cron 表达式（分 时 日 月 周） |
| `agentPrompt` | string | 触发时发给 agent 的 prompt |
| `workspaceRoot` | string | 绑定的工作区路径 |
| `enabled` | boolean | false 时跳过调度，不删除任务 |
| `lastRunAt` | string \| null | 上次执行时间（ISO 8601） |
| `lastRunStatus` | "success" \| "failed" \| null | 上次执行结果 |
| `nextRunAt` | string \| null | 下次预计执行时间（启动时计算） |

---

## 四、调度器设计

### 4.1 实现方式

使用 `node-cron` 包（纯 JS，无原生依赖）。扩展激活时启动调度器，扩展 deactivate 时停止。

### 4.2 CronScheduler 类

新文件：`src/cron/cronScheduler.ts`

```typescript
export class CronScheduler {
  constructor(private readonly storageRoot: string) {}

  async init(): Promise<void>;        // 加载 cron-jobs.json，注册所有 enabled job
  async addJob(def: CronJobDef): Promise<CronJob>;
  async removeJob(id: string): Promise<void>;
  async enableJob(id: string): Promise<void>;
  async disableJob(id: string): Promise<void>;
  async listJobs(): Promise<CronJob[]>;
  dispose(): void;                     // 停止所有调度
}
```

### 4.3 触发执行

到时间后：

1. 调用 `backgroundTaskHost.runBuiltInAgentSession(...)` 在后台执行 `agentPrompt`
2. 记录 `lastRunAt`、`lastRunStatus`（成功/失败）
3. 更新 `nextRunAt`
4. 刷新 `cron-jobs.json`

---

## 五、ScheduleCronTool

新增工具定义，agent 可调用：

```typescript
ScheduleCronTool({
  action: "create" | "list" | "delete" | "enable" | "disable",

  // create 时必填
  name?: string,
  description?: string,
  cron?: string,               // "0 18 * * *"
  agentPrompt?: string,
  durable?: boolean,           // true = 持久化，false = 仅本次 session（默认 true）

  // delete / enable / disable 时必填
  id?: string,
})
```

返回格式：
- `list`：`{ jobs: CronJob[] }`
- `create`：`{ job: CronJob }`
- `delete` / `enable` / `disable`：`{ success: true }`

---

## 六、/cron 命令

扩展 `promptCommandHost.ts` 的命令注册表：

| 命令 | 说明 |
|---|---|
| `/cron` | 列出当前工作区所有定时任务 |
| `/cron <id>` | 查看单个任务详情（含执行历史） |
| `/cron pause <id>` | 暂停任务（`enabled = false`） |
| `/cron resume <id>` | 恢复任务（`enabled = true`） |
| `/cron delete <id>` | 删除任务 |

---

## 七、架构变更

### 新增文件

```
src/cron/
├── cronScheduler.ts       # 调度器核心
├── cronStore.ts           # cron-jobs.json CRUD
└── cronScheduler.test.ts  # 单元测试（mock node-cron）
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/toolRuntime.ts` | 新增 `ScheduleCronTool` 定义和 handler |
| `src/promptCommandHost.ts` | 新增 `/cron` 命令系列 |
| `src/extension.ts` | 构造 `CronScheduler`，传入 `globalStorageUri`，dispose 时停止 |
| `src/backgroundTaskHost.ts` | 暴露 `runAgentWithPrompt(prompt, workspaceRoot)` 供 CronScheduler 调用 |
| `package.json` | 添加 `node-cron` 依赖 |

---

## 八、安全与边界

- Cron 表达式校验：使用 `node-cron` 内置的 `validate(expr)` 拒绝非法表达式
- 最小间隔：不允许比 1 分钟更频繁的任务（拒绝 `*/30 * * * * *` 秒级 cron）
- 任务积压：若上次任务还在运行，当次触发跳过（不重复派生）
- 工作区不存在：触发时校验 `workspaceRoot` 是否仍然挂载，不存在则跳过并记日志

---

## 九、不在本 spec 范围内

- Cron 任务的 UI 配置面板（用 `/cron` 命令管理即可）
- 任务执行结果推送通知（VS Code notification）
- 跨多台机器同步 cron 任务
- 秒级精度 cron（最小 1 分钟）

---

## 十、验收标准

- [ ] `ScheduleCronTool` create 能创建定时任务，持久化到 `cron-jobs.json`
- [ ] 扩展重启后，已有 enabled 任务自动恢复调度
- [ ] 到时间后 agent 在后台执行，`lastRunAt` / `lastRunStatus` 更新
- [ ] 上次任务仍在运行时，当次触发被跳过，不产生重复任务
- [ ] `/cron` 列出所有任务，`/cron pause <id>` 能暂停
- [ ] 非法 cron 表达式被拒绝并返回清晰错误
- [ ] `cronScheduler.test.ts` 覆盖 add/remove/trigger/skip-if-running 路径（mock node-cron）
- [ ] `npm test` / `npm run check` / `npm run build` 全部通过
