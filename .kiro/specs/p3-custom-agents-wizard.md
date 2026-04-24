# P3 · 自定义 Agents 执行通道

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

当前 Custom Agents 只能读取 `.cain/agents.json` 配置，展示列表和详情，但完全没有执行通道。本 spec 冻结 Custom Agent 的执行通道设计：如何激活、如何注入 system prompt、如何约束工具集、如何与现有 WorkspaceRuntime 协作。

---

## 二、当前状态

已完成：
- `src/customAgentsRegistry.ts`：读取 `.cain/agents.json`，提供 `listCustomAgents / getCustomAgent` 能力
- `/agents` 命令：列出内置 agents + custom agents，支持查看单个 agent 详情

未完成：
- 没有 custom agent 激活入口（slash 命令或工具调用）
- 没有执行通道（system prompt 注入、工具约束、模型选择）
- 没有 wizard 创建流程

---

## 三、Custom Agent 定义格式

`.cain/agents.json` 格式冻结如下：

```json
{
  "agents": [
    {
      "name": "code-reviewer",
      "description": "专门做代码审查，给出改进建议和安全问题提示",
      "systemPrompt": "你是一个严格的代码审查员。每次审查必须：1. 找出潜在的安全漏洞；2. 指出性能问题；3. 检查错误处理完整性。不要给出笼统的评价，每条意见必须附上具体代码行。",
      "tools": ["read_file", "glob_files", "search_files", "run_command"],
      "model": "claude-sonnet-4-6",
      "color": "#E84040",
      "tags": ["review", "security"]
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 唯一标识符，用于激活（`/agent code-reviewer`） |
| `description` | string | 是 | 展示给用户和模型的角色描述 |
| `systemPrompt` | string | 是 | 完整 system prompt，追加在全局 system prompt 之后 |
| `tools` | string[] | 否 | 工具白名单；为空时继承全部工具；支持 glob 通配（`lsp_*`） |
| `model` | string | 否 | 模型 ID；为空时使用当前活跃 provider 模型 |
| `color` | string | 否 | UI 展示颜色（hex），用于区分不同 agent |
| `tags` | string[] | 否 | 用于 `/agents` 过滤 |

---

## 四、激活方式

### 4.1 斜杠命令激活

```
/agent code-reviewer
```

激活后，当前对话切换为 custom agent 模式。激活效果：
- 状态栏显示 agent 名称 + 颜色标识
- 下一次 prompt 使用该 agent 的 system prompt + 工具约束
- 再次输入 `/agent` 或 `/agent off` 退出 custom agent 模式，恢复默认

### 4.2 工具调用激活（RunCustomAgent）

新增 `RunCustomAgent` 工具：

```typescript
RunCustomAgent({
  agentName: "code-reviewer",
  prompt: "Review the changes in src/toolRuntime.ts",
  background: false  // true 时作为后台任务运行
})
```

- `background: false`：在当前对话上下文内同步执行，结果直接回到主对话
- `background: true`：通过 `backgroundTaskHost` 创建后台任务，返回 taskId

---

## 五、执行通道设计

### 5.1 System Prompt 注入

Custom agent 的 `systemPrompt` 追加到全局 system prompt 之后：

```
[全局 system prompt]

---

[custom agent systemPrompt]
```

注入位置：`promptSetupHost.ts` 的 workspace system prompt 组合阶段，检查当前是否有活跃 custom agent。

### 5.2 工具约束

当 `tools` 字段非空时，`WorkspaceRuntime` 的 `getToolContext()` 返回过滤后的工具列表：

```typescript
// workspaceRuntimeShell.ts
const filteredTools = activeCustomAgent?.tools
  ? allTools.filter(t => matchesToolWhitelist(t.name, activeCustomAgent.tools))
  : allTools;
```

`matchesToolWhitelist` 支持精确匹配和 glob 通配（`lsp_*` 匹配所有 LSP 工具）。

### 5.3 模型选择

当 custom agent 指定 `model` 时，`resolveProviderConfig` 优先使用该模型，fallback 到当前活跃 provider 模型。

### 5.4 状态管理

新增 `CustomAgentState`，与 Plan Mode 类似，作为会话级状态：

```typescript
type CustomAgentState = {
  active: boolean;
  agentName?: string;
  agentDef?: CustomAgentDefinition;
};
```

存储位置：`conversationRuntimeStateHost.ts` 里的会话运行时状态，与 `planModeState` 并列。

---

## 六、架构变更

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/customAgentsRegistry.ts` | 新增 `CustomAgentDefinition` 类型导出 |
| `src/conversationRuntimeStateHost.ts` | 新增 `customAgentState` 字段和 activate/deactivate bindings |
| `src/promptSetupHost.ts` | 检查 `customAgentState.active`，追加 agent system prompt |
| `src/workspaceRuntimeShell.ts` | 检查 `customAgentState.active`，过滤工具白名单 |
| `src/promptCommandHost.ts` | 新增 `/agent <name>` 和 `/agent off` 命令处理 |
| `src/toolRuntime.ts` | 新增 `RunCustomAgent` 工具定义和执行逻辑 |
| `src/webviewStateHost.ts` | 在 sidebar state 中携带 `activeCustomAgent` 字段，供 UI 展示 |

---

## 七、Wizard 创建流程（最小可行）

本 spec 阶段不实现完整 GUI wizard，改用 `/agent create` 命令引导：

```
用户：/agent create
助手：请提供以下信息：
1. Agent 名称（英文小写，无空格）：
2. 描述（一句话说明用途）：
3. System prompt（角色指令）：
4. 工具白名单（逗号分隔，留空表示继承全部）：
助手：[收到输入后] 已写入 .cain/agents.json，使用 /agent <name> 激活。
```

实现方式：`/agent create` 走多轮 prompt 引导，最终由 AI 写入 `.cain/agents.json`，不需要 GUI。

---

## 八、不在本 spec 范围内

- 远程 agent 市场（下载他人分享的 agent 定义）
- Agent 级别的 License 门控（暂不区分付费/免费 agent）
- Agent 的执行历史面板
- 用户级 agent 配置（跨 workspace 共享），只做 workspace 级

---

## 九、验收标准

- [ ] `/agent code-reviewer` 能激活 custom agent，状态栏出现 agent 标识
- [ ] 激活后下一次 prompt 使用 agent 的 system prompt 和工具白名单
- [ ] `/agent off` 或 `/agent` 不带参数能退出 custom agent 模式
- [ ] `RunCustomAgent` 工具能同步执行并返回结果
- [ ] `RunCustomAgent` 带 `background: true` 能创建后台任务并返回 taskId
- [ ] 工具白名单过滤：glob 通配 `lsp_*` 能匹配所有 LSP 工具
- [ ] `/agent create` 引导流程能生成合法的 `.cain/agents.json` 条目
- [ ] `npm test` / `npm run check` / `npm run build` 全部通过
