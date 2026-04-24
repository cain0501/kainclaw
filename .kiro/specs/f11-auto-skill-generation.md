# F11 · Auto Skill Generation（任务完成后自动沉淀技能）

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待 Codex 实现  
**负责人**：Claude（PM + Spec）/ Codex（实现）

---

## 一、目标

当 agent 完成一个足够复杂的任务后，系统自动将整个过程抽象为结构化的 SKILL.md 文件，持久化到本地技能库。下次遇到相似任务时，agent 优先调用已有经验，而不是重新推理一遍。随着使用次数增加，技能可以被持续修正和优化。

灵感来源：Hermes Agent 的 `skill_manager_tool.py`，但从 Python CLI 适配到 TypeScript VS Code 扩展架构。

---

## 二、架构总览

```
src/skills/
├── skillStore.ts          # 磁盘 I/O：SKILL.md CRUD
├── skillDistiller.ts      # 复杂度判断 + 调 AI 生成 SKILL.md 内容
└── skillStore.test.ts     # skillStore 单元测试

src/toolRuntime.ts         # 新增 SkillManagerTool（create/edit/patch/delete/list）
src/skillsRegistry.ts      # 扩展：listUserSkills() 读取磁盘上的用户技能
src/backgroundTaskHost.ts  # 新增 post-task hook：任务完成后触发蒸馏检查
src/extension.ts           # 新增：把 globalStorageUri 传给 skillStore 初始化
```

---

## 三、存储格式

### 目录结构

```
{globalStorageUri}/user-skills/
├── fix-ts-import-paths/
│   └── SKILL.md
├── software-development/
│   └── debug-vitest-timeout/
│       └── SKILL.md
└── ...
```

- 路径由 VS Code 的 `context.globalStorageUri.fsPath` + `/user-skills/` 拼接
- category 是可选的单层目录前缀
- 每个 skill 是一个独立目录，内部必须有 `SKILL.md`

### SKILL.md 格式（YAML frontmatter + Markdown body）

```markdown
---
name: fix-ts-import-paths
description: 当 TypeScript 构建因路径解析错误失败时使用。4 步修复流程。
version: 1.0.0
author: KainClaw Auto
tags: [typescript, build, imports]
created_at: "2026-04-15T08:00:00Z"
source: auto
task_type: verification
---

# Fix TypeScript Import Path Errors

## 何时使用
- Build 报 TS2307 / Cannot find module
- 路径别名（@/）失效

## 步骤
1. 检查 tsconfig.json 的 paths 配置
2. 确认 baseUrl 与实际目录结构一致
3. 运行 `npm run check` 验证

## 陷阱
- node_modules 类型路径不受 paths 影响，不要混淆

## 验证方式
- `npm run build` 无错误通过
```

**frontmatter 必填字段**：`name`、`description`  
**frontmatter 可选字段**：`version`、`author`、`tags`、`created_at`、`source`（`"auto"` | `"user"`）、`task_type`

---

## 四、复杂度阈值（何时触发自动蒸馏）

满足以下任一条件即视为"足够复杂"：

| 条件 | 判断方式 |
|------|---------|
| tool 调用次数 ≥ 5 | 统计 `task.output` 中 `[tool:start]` 出现次数 |
| 输出长度 ≥ 3000 字符 | `task.output.length >= 3000` |
| verification 经历了 FAIL→PASS 循环 | task 的 `metadata.verificationVerdict` 在同一对话内有过 FAIL 记录（可选，V1 暂不实现，预留接口） |

仅对 `taskType === "built_in_agent"` 且 `status === "completed"` 的任务触发。

---

## 五、详细实现

### 5.1 `src/skills/skillStore.ts`

```typescript
// 职责：SKILL.md 的磁盘读写，不含 AI 逻辑

export type SkillRecord = {
  name: string;
  category?: string;
  description: string;
  tags: string[];
  source: "auto" | "user";
  createdAt: string;
  content: string; // 完整 SKILL.md 文本（含 frontmatter）
  skillDir: string; // 绝对磁盘路径
};

export class SkillStore {
  constructor(private readonly userSkillsRoot: string) {}

  // 初始化：确保 userSkillsRoot 目录存在
  async init(): Promise<void>

  // 创建新 skill。name 必须符合 /^[a-z0-9][a-z0-9._-]*$/ 且不超过 64 字符
  // category 是可选的单层目录名，同样受名称规则约束
  // 若 skill 已存在，抛出 Error('Skill already exists: {name}')
  async create(options: {
    name: string;
    category?: string;
    content: string; // 包含 frontmatter 的完整 SKILL.md
  }): Promise<SkillRecord>

  // 覆盖写 SKILL.md（全量替换）
  async edit(name: string, content: string): Promise<SkillRecord>

  // 目标字符串替换（find-and-replace），失败时抛出 Error
  async patch(name: string, oldString: string, newString: string): Promise<SkillRecord>

  // 删除整个 skill 目录。不存在时静默成功（幂等）
  async delete(name: string): Promise<void>

  // 列出所有用户 skill（递归扫描 userSkillsRoot）
  async list(): Promise<SkillRecord[]>

  // 按 name 查找。未找到返回 undefined
  async find(name: string): Promise<SkillRecord | undefined>
}

// 工具函数：从 SKILL.md 文本中解析 frontmatter 字段
// 返回 { name, description, tags, source, createdAt }
export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
  tags?: string[];
  source?: string;
  createdAt?: string;
}
```

**实现注意**：
- 用 `fs/promises` 原生读写，不引入新依赖
- frontmatter 解析用正则（`/^---\n([\s\S]*?)\n---/`）+ 手写 key-value 解析，不引入 `js-yaml`
- `list()` 递归遍历最多 2 层（`userSkillsRoot/{name}/` 和 `userSkillsRoot/{category}/{name}/`）

---

### 5.2 `src/skills/skillDistiller.ts`

```typescript
// 职责：判断复杂度 + 调 AI 生成 SKILL.md 内容

export function meetsDistillationThreshold(task: BackgroundTaskRecord): boolean {
  // 统计 [tool:start] 出现次数
  const toolCallCount = (task.output.match(/\[tool:start\]/g) ?? []).length;
  return toolCallCount >= 5 || task.output.length >= 3000;
}

export function buildDistillationPrompt(task: BackgroundTaskRecord): string {
  // 返回发给 AI 的 prompt，要求 AI 输出一个完整的 SKILL.md（含 frontmatter）
  // prompt 内容：
  // 1. 说明角色：你是一个经验提炼专家
  // 2. 提供任务上下文：agentType、originalTask（来自 metadata）、task output 截断到 4000 字符
  // 3. 要求输出格式：严格按 SKILL.md frontmatter 格式，name 用 kebab-case，description 简洁一句话
  // 4. 明确禁止：不要输出代码块之外的内容，只输出 SKILL.md 文本
}

export type DistillationResult =
  | { ok: true; content: string; name: string }
  | { ok: false; reason: string };

// 调用 provider 蒸馏，返回解析后的 SKILL.md 文本和从 frontmatter 提取的 name
// provider 是已有的 IProviderAdapter 实例
export async function distillSkillFromTask(
  task: BackgroundTaskRecord,
  provider: IProviderAdapter,
): Promise<DistillationResult>
```

**实现注意**：
- `buildDistillationPrompt` 将 `task.output` 截断到 4000 字符（取尾部，因为结论在末尾）
- `distillSkillFromTask` 发单轮请求（无 tool），解析响应文本
- 若响应不包含 `---` frontmatter 边界，返回 `{ ok: false, reason: "invalid format" }`
- 整个蒸馏流程非阻塞，调用方 fire-and-forget，错误只 log 不上抛

---

### 5.3 `src/toolRuntime.ts` — 新增 `SkillManagerTool`

在现有工具定义区域新增：

```typescript
SkillManagerTool: {
  description: "Create, edit, patch, delete, or list user skills in the local skill library.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "edit", "patch", "delete", "list"],
      },
      name: { type: "string" },        // required for create/edit/patch/delete
      category: { type: "string" },   // optional, for create only
      content: { type: "string" },    // required for create/edit
      old_string: { type: "string" }, // required for patch
      new_string: { type: "string" }, // required for patch
    },
    required: ["action"],
  },
}
```

handler 逻辑：
- `list`：调 `skillStore.list()`，返回 name + description 列表
- `create`：验证 name（同 skillStore 规则），调 `skillStore.create()`，返回 `<created>{name}</created>`
- `edit`：调 `skillStore.edit()`
- `patch`：调 `skillStore.patch()`，old_string 不存在时返回错误而不是抛出
- `delete`：调 `skillStore.delete()`

`ToolContext` 需要新增：
```typescript
skillStore?: SkillStore;
```

---

### 5.4 `src/skillsRegistry.ts` — 扩展 user skills 展示

新增函数：

```typescript
// 读取磁盘上的用户技能列表（用于 /skills 命令展示）
// skillStore 为可选，不传则只返回内置技能
export async function listAllSkills(skillStore?: SkillStore): Promise<{
  builtIn: BuiltInSkillDefinition[];
  user: SkillRecord[];
}>
```

`/skills` 命令的格式化输出中，在内置技能之后追加用户技能区块：
```
--- User Skills (3) ---
@fix-ts-import-paths  当 TypeScript 构建因路径解析错误失败时使用
@debug-vitest-timeout  Vitest 测试超时的排查流程
```

---

### 5.5 `src/backgroundTaskHost.ts` — post-task 蒸馏 hook

在 `finalizeSuccess` 调用完成、任务状态写入磁盘**之后**，添加：

```typescript
// fire-and-forget，不阻塞主流程
if (
  options.skillStore &&
  options.skillDistillProvider &&
  task.taskType === "built_in_agent" &&
  task.status === "completed" &&
  meetsDistillationThreshold(task)
) {
  void distillAndSaveSkill(task, options.skillStore, options.skillDistillProvider);
}
```

`distillAndSaveSkill` 是一个 async 函数（在 `skillDistiller.ts` 中或 `backgroundTaskHost.ts` 内部），负责：
1. 调 `distillSkillFromTask`
2. 若返回 ok，调 `skillStore.create()`（name 冲突时自动追加时间戳后缀）
3. 所有错误 log 到 `console.warn`，不上抛

`BuiltInAgentSessionOptions` 新增可选字段：
```typescript
skillStore?: SkillStore;
skillDistillProvider?: IProviderAdapter;
```

---

### 5.6 `src/extension.ts` — 初始化 SkillStore

在 `ChatSidebarProvider` 构造函数中：

```typescript
private readonly skillStore: SkillStore;

// 构造函数中：
this.skillStore = new SkillStore(
  path.join(this.host.getStorageUri().fsPath, "user-skills"),
);
// 异步初始化（不阻塞激活流程）
void this.skillStore.init();
```

将 `skillStore` 传入需要它的地方：
- `runBuiltInAgentSession` 调用时传入 `skillStore`
- `ToolContext` 构建时传入 `skillStore`（供 `SkillManagerTool` 使用）

---

## 六、测试要求

### `src/skills/skillStore.test.ts`（新建）

必须覆盖：
- `create` 成功写入 SKILL.md
- `create` 重复名称抛出错误
- `edit` 覆盖写入
- `patch` 成功替换 / old_string 不存在时抛出
- `delete` 幂等（删除不存在的 skill 不报错）
- `list` 返回正确数量，包含嵌套 category 的 skill
- `parseSkillFrontmatter` 正确解析 name / description / tags

### `src/skills/skillDistiller.test.ts`（新建）

必须覆盖：
- `meetsDistillationThreshold` 在工具调用 ≥ 5 时返回 true
- `meetsDistillationThreshold` 在输出长度 ≥ 3000 时返回 true
- `meetsDistillationThreshold` 在两个条件都不满足时返回 false
- `buildDistillationPrompt` 输出包含 agentType 和截断后的 task output

### `src/toolRuntime.test.ts`（追加）

必须覆盖：
- `SkillManagerTool { action: "list" }` 返回 skill 列表
- `SkillManagerTool { action: "create" }` 调用 skillStore.create
- `SkillManagerTool { action: "delete" }` 调用 skillStore.delete
- `SkillManagerTool { action: "patch" }` old_string 不存在时返回错误而不是 throw

---

## 七、验收标准

1. `npm test` 全部通过（含新增测试）
2. `npm run check` 无 TypeScript 错误
3. `npm run build` 成功
4. 手工验证：在一个足够长的 verification 任务完成后，`{globalStorageUri}/user-skills/` 目录下出现新的 SKILL.md 文件
5. `SkillManagerTool { action: "list" }` 能返回该文件的条目
6. `/skills` 命令输出中出现 "User Skills" 区块

---

## 八、不在本 Spec 范围内

- Skill 的自动注入到 system prompt（V2 功能）
- Skill Hub / 社区共享（V3 功能）
- Skill 版本历史 / diff 查看
- 安全扫描（agent-created skill 的恶意代码检测）
- Skill 使用频次统计 / 热度排序
