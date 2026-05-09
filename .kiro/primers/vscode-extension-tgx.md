# Task Primer: vscode-extension-tgx — CronCreate / CronDelete / CronList 工具

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里实现 CronCreate / CronDelete / CronList 三个工具，对齐官方 `src/tools/ScheduleCronTool/`。

官方逻辑：
- **CronCreate**：注册一个定时任务（5-field cron 表达式），`durable=true` 写入 `.cain/scheduled_tasks.json`，`durable=false` 只存内存（session-only）
- **CronDelete**：按 id 删除任务
- **CronList**：列出当前所有任务
- **Scheduler**：后台 1s 轮询，到时间就把 `prompt` 注入对话（调 `handlePrompt`）

KainClaw 目前只有 `src/platform/schedulerRuntime.ts`（接口层，无实现）。

## Out of Scope

- 调度器锁（官方 `cronTasksLock.ts`，多 session 防重复触发）— KainClaw 单进程，不需要
- Jitter（官方 `jitteredNextCronRunMs`）— 简化实现，不加
- GrowthBook feature flag（`isKairosCronEnabled`）— 始终启用
- Teammate context（`agentId` 路由）— KainClaw 无 teammate
- `permanent` 任务（assistant mode 内置任务）— 不需要
- 不改 `src/platform/schedulerRuntime.ts`（接口层保留）
- 不改 Electron 文件

## High-Risk Files

- `src/cron/cronUtils.ts` — 新建，cron 解析与计算
- `src/cron/cronTasks.ts` — 新建，任务存储（文件 + 内存）
- `src/cron/cronScheduler.ts` — 新建，调度器
- `src/toolRuntime.ts` — 加三个工具定义 + handler
- `src/extension.ts` — 接线 scheduler start/stop

## 官方参考文件

- `E:\claudecodejingiang\src\utils\cron.ts` — parseCronExpression / computeNextCronRun / cronToHuman
- `E:\claudecodejingiang\src\utils\cronTasks.ts` — 任务存储
- `E:\claudecodejingiang\src\utils\cronScheduler.ts` — 调度器
- `E:\claudecodejingiang\src\tools\ScheduleCronTool\CronCreateTool.ts`
- `E:\claudecodejingiang\src\tools\ScheduleCronTool\CronDeleteTool.ts`
- `E:\claudecodejingiang\src\tools\ScheduleCronTool\CronListTool.ts`

## Step 1：新建 src/cron/cronUtils.ts

直接从官方 `src/utils/cron.ts` 移植，**不做任何修改**。该文件是纯函数，无外部依赖：

```typescript
// src/cron/cronUtils.ts
// 从官方 src/utils/cron.ts 完整移植
// 包含：CronFields, parseCronExpression, computeNextCronRun, cronToHuman, nextCronRunMs
```

移植时注意：
- 保留所有 JSDoc 注释
- `nextCronRunMs` 在官方 `cronTasks.ts` 里，但逻辑简单，可以直接在 `cronUtils.ts` 里加：
  ```typescript
  export function nextCronRunMs(cron: string, fromMs: number): number | null {
    const fields = parseCronExpression(cron);
    if (!fields) return null;
    const next = computeNextCronRun(fields, new Date(fromMs));
    return next ? next.getTime() : null;
  }
  ```

## Step 2：新建 src/cron/cronTasks.ts

KainClaw 用 `.cain/` 目录（不是 `.claude/`）。

```typescript
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCronExpression } from "./cronUtils";

export type CronTask = {
  id: string;
  cron: string;
  prompt: string;
  createdAt: number;
  lastFiredAt?: number;
  recurring?: boolean;
  durable?: boolean; // runtime-only, not written to disk
};

type CronFile = { tasks: CronTask[] };

const CRON_FILE_REL = path.join(".cain", "scheduled_tasks.json");

// Session-only tasks (durable: false) — in-memory, die with process
const sessionTasks = new Map<string, CronTask>();

export function getCronFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CRON_FILE_REL);
}

export async function readCronTasks(workspaceRoot: string): Promise<CronTask[]> {
  let raw: string;
  try {
    raw = await readFile(getCronFilePath(workspaceRoot), "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const file = parsed as Partial<CronFile>;
  if (!Array.isArray(file.tasks)) return [];

  const out: CronTask[] = [];
  for (const t of file.tasks) {
    if (
      !t ||
      typeof t.id !== "string" ||
      typeof t.cron !== "string" ||
      typeof t.prompt !== "string" ||
      typeof t.createdAt !== "number"
    ) continue;
    if (!parseCronExpression(t.cron)) continue;
    out.push({
      id: t.id,
      cron: t.cron,
      prompt: t.prompt,
      createdAt: t.createdAt,
      ...(typeof t.lastFiredAt === "number" ? { lastFiredAt: t.lastFiredAt } : {}),
      ...(t.recurring ? { recurring: true } : {}),
    });
  }
  return out;
}

export async function writeCronTasks(
  tasks: CronTask[],
  workspaceRoot: string,
): Promise<void> {
  await mkdir(path.join(workspaceRoot, ".cain"), { recursive: true });
  const body: CronFile = {
    tasks: tasks.map(({ durable: _d, ...rest }) => rest),
  };
  await writeFile(
    getCronFilePath(workspaceRoot),
    JSON.stringify(body, null, 2) + "\n",
    "utf-8",
  );
}

export async function addCronTask(
  cron: string,
  prompt: string,
  recurring: boolean,
  durable: boolean,
  workspaceRoot: string,
): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const task: CronTask = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...(recurring ? { recurring: true } : {}),
  };
  if (!durable) {
    sessionTasks.set(id, { ...task, durable: false });
    return id;
  }
  const tasks = await readCronTasks(workspaceRoot);
  tasks.push(task);
  await writeCronTasks(tasks, workspaceRoot);
  return id;
}

export async function removeCronTasks(
  ids: string[],
  workspaceRoot: string,
): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  // Remove from session store
  for (const id of ids) sessionTasks.delete(id);
  // Remove from file
  const tasks = await readCronTasks(workspaceRoot);
  const remaining = tasks.filter(t => !idSet.has(t.id));
  if (remaining.length < tasks.length) {
    await writeCronTasks(remaining, workspaceRoot);
  }
}

export async function listAllCronTasks(workspaceRoot: string): Promise<CronTask[]> {
  const fileTasks = await readCronTasks(workspaceRoot);
  const memTasks = Array.from(sessionTasks.values());
  return [...fileTasks, ...memTasks];
}

export async function markCronTaskFired(
  id: string,
  firedAt: number,
  workspaceRoot: string,
): Promise<void> {
  const tasks = await readCronTasks(workspaceRoot);
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.lastFiredAt = firedAt;
  await writeCronTasks(tasks, workspaceRoot);
}
```

## Step 3：新建 src/cron/cronScheduler.ts

简化版调度器，无锁、无 jitter：

```typescript
import { nextCronRunMs } from "./cronUtils";
import {
  type CronTask,
  listAllCronTasks,
  markCronTaskFired,
  removeCronTasks,
} from "./cronTasks";

const CHECK_INTERVAL_MS = 1000;
const RECURRING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CronScheduler = {
  start(workspaceRoot: string, onFire: (prompt: string) => void): void;
  stop(): void;
};

export function createCronScheduler(): CronScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let root = "";
  let fire: ((prompt: string) => void) | null = null;

  // Per-task next-fire times (epoch ms)
  const nextFireAt = new Map<string, number>();
  const inFlight = new Set<string>();

  function seedNextFire(t: CronTask): void {
    if (nextFireAt.has(t.id)) return;
    const anchor = t.recurring ? (t.lastFiredAt ?? t.createdAt) : t.createdAt;
    const next = nextCronRunMs(t.cron, anchor) ?? Infinity;
    nextFireAt.set(t.id, next);
  }

  async function check(): Promise<void> {
    if (stopped || !fire) return;
    const now = Date.now();
    let tasks: CronTask[];
    try {
      tasks = await listAllCronTasks(root);
    } catch {
      return;
    }

    const seen = new Set<string>();
    for (const t of tasks) {
      seen.add(t.id);
      if (inFlight.has(t.id)) continue;
      seedNextFire(t);
      const next = nextFireAt.get(t.id)!;
      if (now < next) continue;

      fire(t.prompt);

      const aged =
        t.recurring &&
        RECURRING_MAX_AGE_MS > 0 &&
        now - t.createdAt >= RECURRING_MAX_AGE_MS;

      if (t.recurring && !aged) {
        // Reschedule from now
        const newNext = nextCronRunMs(t.cron, now) ?? Infinity;
        nextFireAt.set(t.id, newNext);
        if (t.durable !== false) {
          inFlight.add(t.id);
          void markCronTaskFired(t.id, now, root)
            .catch(() => {})
            .finally(() => inFlight.delete(t.id));
        }
      } else {
        // One-shot or aged recurring: delete
        nextFireAt.delete(t.id);
        inFlight.add(t.id);
        void removeCronTasks([t.id], root)
          .catch(() => {})
          .finally(() => inFlight.delete(t.id));
      }
    }

    // Evict stale entries
    for (const id of nextFireAt.keys()) {
      if (!seen.has(id)) nextFireAt.delete(id);
    }
  }

  return {
    start(workspaceRoot, onFire) {
      stopped = false;
      root = workspaceRoot;
      fire = onFire;
      timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
      timer.unref?.();
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
```

## Step 4：toolRuntime.ts — 加工具定义

在 `toolDefinitions` 数组末尾（`AskUserQuestion` 之后）加三个工具：

```typescript
{
  name: "CronCreate",
  description:
    "Schedule a recurring or one-shot prompt to be enqueued at a future time. Uses standard 5-field cron in the user's local timezone.",
  input_schema: {
    type: "object",
    properties: {
      cron: {
        type: "string",
        description:
          'Standard 5-field cron expression in local time: "M H DoM Mon DoW" (e.g. "*/5 * * * *" = every 5 minutes, "30 14 28 2 *" = Feb 28 at 2:30pm local once).',
      },
      prompt: {
        type: "string",
        description: "The prompt to enqueue at each fire time.",
      },
      recurring: {
        type: "boolean",
        description:
          "true (default) = fire on every cron match until deleted or auto-expired after 7 days. false = fire once at the next match, then auto-delete.",
      },
      durable: {
        type: "boolean",
        description:
          "true = persist to .cain/scheduled_tasks.json and survive restarts. false (default) = in-memory only, dies when this session ends.",
      },
    },
    required: ["cron", "prompt"],
  },
  annotations: { title: "Schedule cron job" },
},
{
  name: "CronDelete",
  description: "Cancel a scheduled cron job by its ID.",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Job ID returned by CronCreate.",
      },
    },
    required: ["id"],
  },
  annotations: { title: "Cancel cron job" },
},
{
  name: "CronList",
  description: "List all active scheduled cron jobs.",
  input_schema: {
    type: "object",
    properties: {},
  },
  annotations: { title: "List cron jobs", readOnlyHint: true },
},
```

## Step 5：toolRuntime.ts — 加 handler

在 `handlers` 对象里加三个 handler（在 `AskUserQuestion` handler 附近）：

```typescript
async CronCreate(input, context) {
  const { parseCronExpression, nextCronRunMs, cronToHuman } = await import("./cron/cronUtils");
  const { addCronTask } = await import("./cron/cronTasks");

  const cron = typeof input.cron === "string" ? input.cron.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const recurring = input.recurring !== false; // default true
  const durable = input.durable === true; // default false

  if (!cron) throw new Error("cron is required");
  if (!prompt) throw new Error("prompt is required");
  if (!parseCronExpression(cron)) {
    throw new Error(`Invalid cron expression '${cron}'. Expected 5 fields: M H DoM Mon DoW.`);
  }
  if (nextCronRunMs(cron, Date.now()) === null) {
    throw new Error(`Cron expression '${cron}' does not match any calendar date in the next year.`);
  }

  const id = await addCronTask(cron, prompt, recurring, durable, context.workspaceRoot);
  context.scheduler?.enable();

  const humanSchedule = cronToHuman(cron);
  const where = durable
    ? "Persisted to .cain/scheduled_tasks.json"
    : "Session-only (not written to disk, dies when session ends)";
  return {
    output: recurring
      ? `Scheduled recurring job ${id} (${humanSchedule}). ${where}. Auto-expires after 7 days. Use CronDelete to cancel sooner.`
      : `Scheduled one-shot task ${id} (${humanSchedule}). ${where}. It will fire once then auto-delete.`,
  };
},

async CronDelete(input, context) {
  const { listAllCronTasks, removeCronTasks } = await import("./cron/cronTasks");

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) throw new Error("id is required");

  const tasks = await listAllCronTasks(context.workspaceRoot);
  const task = tasks.find(t => t.id === id);
  if (!task) throw new Error(`No scheduled job with id '${id}'`);

  await removeCronTasks([id], context.workspaceRoot);
  return { output: `Cancelled job ${id}.` };
},

async CronList(input, context) {
  const { listAllCronTasks } = await import("./cron/cronTasks");
  const { cronToHuman } = await import("./cron/cronUtils");

  const tasks = await listAllCronTasks(context.workspaceRoot);
  if (tasks.length === 0) return { output: "No scheduled jobs." };

  const lines = tasks.map(t => {
    const human = cronToHuman(t.cron);
    const kind = t.recurring ? "(recurring)" : "(one-shot)";
    const store = t.durable === false ? "[session-only]" : "";
    const preview = t.prompt.length > 80 ? t.prompt.slice(0, 77) + "..." : t.prompt;
    return `${t.id} — ${human} ${kind}${store ? " " + store : ""}: ${preview}`;
  });
  return { output: lines.join("\n") };
},
```

**注意**：`context.scheduler` 需要在 `ToolContext` 类型里加字段（见 Step 6）。

## Step 6：toolRuntime.ts — ToolContext 加 scheduler 字段

在 `ToolContext` 类型定义里加：

```typescript
scheduler?: {
  enable(): void;
};
```

## Step 7：extension.ts — 接线 scheduler

在 extension 类里：

1. 导入并创建 scheduler：
```typescript
import { createCronScheduler } from "./cron/cronScheduler";

// 在 class 字段里：
private readonly cronScheduler = createCronScheduler();
private cronSchedulerEnabled = false;
```

2. 在 `activate()` 或构造函数里启动 scheduler（在 `handlePrompt` 可用之后）：
```typescript
// 在 handlePrompt 定义之后，或在 activate() 里：
this.cronScheduler.start(
  getPrimaryWorkspaceFolderPath() ?? "",
  (prompt) => void this.handlePrompt(prompt),
);
```

3. 在 dispose / deactivate 里停止：
```typescript
this.cronScheduler.stop();
```

4. 在构建 `ToolContext` 的地方（搜索 `tasks:` 或 `worktree:` 字段附近）加：
```typescript
scheduler: {
  enable: () => {
    // scheduler 已经在 start() 时启动，enable() 是 no-op
    // 保留接口兼容性
  },
},
```

**注意**：`getPrimaryWorkspaceFolderPath()` 在 extension.ts 里已有，直接用。如果 workspaceRoot 可能在 session 中变化，scheduler 需要在 workspaceRoot 确定后再 start。以实际代码为准。

## Step 8：补测试（src/cron/cronUtils.test.ts + src/cron/cronTasks.test.ts）

至少覆盖：
- `parseCronExpression`：有效表达式返回 CronFields，无效返回 null
- `nextCronRunMs`：返回严格大于 fromMs 的时间戳
- `cronToHuman`：常见模式（每分钟、每小时、每天、每周）
- `addCronTask` + `listAllCronTasks`：durable=false 只在内存，durable=true 写文件
- `removeCronTasks`：从内存和文件都能删

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- `ToolContext` 里加 `scheduler` 字段后，所有构建 `ToolContext` 的地方都要传（或不传，因为是可选字段）— 搜索 `ToolContext` 的构造点确认
- `handlers` 里用 dynamic import（`await import("./cron/cronUtils")`）避免循环依赖，也可以改成顶部 static import，以实际是否有循环依赖为准
- `cronScheduler.start()` 的 `workspaceRoot` 在 extension 初始化时可能还没有 workspace — 需要在 workspace 确定后再调用，或在第一次 `handlePrompt` 时懒启动
- `sessionTasks` 是模块级 Map，多个 ToolContext 实例共享 — 这是预期行为（session 级别的任务）
- 官方 `cronToHuman` 里有 `utc` 参数，KainClaw 不需要，可以省略

## Definition of Done

- [ ] `CronCreate` 能注册任务，durable=true 写入 `.cain/scheduled_tasks.json`
- [ ] `CronDelete` 能按 id 删除任务
- [ ] `CronList` 能列出所有任务
- [ ] Scheduler 在任务到期时调用 `handlePrompt` 注入对话
- [ ] 测试覆盖 cron 解析、任务存储
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
