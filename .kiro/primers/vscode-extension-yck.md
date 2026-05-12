# Task Primer: vscode-extension-yck — PowerShellTool: Windows PowerShell 专用工具

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里新增完整的 `PowerShell` 工具，让模型可以在工作区执行任意 PowerShell 命令（非只读限制）。

KainClaw 已有 `run_command`，但它是受 allowlist 限制的只读工具，主要供子 Agent 和验证模式使用。`PowerShell` 是面向主 session 的全功能工具，对标官方 `PowerShellTool`。

**本次交付范围（MVP）：**
- 新增 `PowerShell` 工具，接受 `command`（必填）、`timeout`（可选 ms）、`description`（可选）
- 不受 allowlist 限制，但不安全命令需要用户审批
- 版本检测：优先尝试 `pwsh.exe`（PowerShell 7+），失败则回退 `powershell.exe`（5.1）
- 不实现：`run_in_background`、危险命令自动拦截（用审批代替）

## Out of Scope

- 官方的 PowerShell edition 版本检测缓存（每次调用检测即可）
- 官方的 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` 环境变量分支
- `backgroundNote`、`sleepGuidance` 等功能提示（MVP 不需要）
- 与 `run_command` 合并：`run_command` 保持不变，`PowerShell` 是新工具

## High-Risk Files

- `src/toolRuntime.ts` — 新增 `PowerShell` handler + 工具定义
- 不需要修改其他文件

## 官方参考

- `E:\claudecodejingiang\src\tools\PowerShellTool\prompt.ts` — 完整工具描述
- `E:\claudecodejingiang\src\tools\PowerShellTool\PowerShellTool.tsx` — 官方实现

## 现有代码复用

`toolRuntime.ts` 里已有的 `run_command` 实现（第 2910 行）可以直接参考：
- `buildUtf8PowerShellEncodedCommand(command)` — 已导出，直接复用
- `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand <b64>` — 调用方式
- `requestActionApproval(context, ...)` — 审批流

版本检测（新增）：
```typescript
async function detectPowerShellExe(): Promise<string> {
  try {
    await execFileAsync("pwsh.exe", ["--version"], { timeout: 3000 });
    return "pwsh.exe";
  } catch {
    return "powershell.exe";
  }
}
```

## 实现步骤

### Step 1：PowerShell handler

在 toolRuntime.ts 的 handlers 对象里新增（紧跟 `run_command` 之后）：

```typescript
async PowerShell(input, context) {
  const command = typeof input.command === "string" ? input.command.trim() : "";
  if (!command) {
    throw new Error("command is required");
  }
  if (context.invokerKind === "worker") {
    throw new Error("PowerShell is only available to the main session.");
  }

  const timeoutMs = typeof input.timeout === "number"
    ? Math.min(input.timeout, 600_000)
    : 120_000;

  const description = typeof input.description === "string"
    ? input.description.trim()
    : `Run: ${command.slice(0, 80)}`;

  await requestActionApproval(context, {
    kind: "tool_action",
    toolName: "PowerShell",
    title: "Confirm PowerShell execution",
    summary: description,
    inputPreview: command,
  });

  const psExe = await detectPowerShellExe();

  const { stdout, stderr } = await execFileAsync(
    psExe,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      buildUtf8PowerShellEncodedCommand(command),
    ],
    {
      cwd: context.workspaceRoot,
      timeout: timeoutMs,
      ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  const mergedOutput = stripAnsiEscapeCodes(
    [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
  );

  return {
    summary: `PowerShell: ${command.slice(0, 80)}`,
    content: toSafeText(mergedOutput || "[no output]"),
  };
},
```

### Step 2：工具定义

在工具定义数组里新增（紧跟 `run_command` 定义之后）：

```typescript
{
  name: "PowerShell",
  description: `Executes a given PowerShell command in the workspace. Working directory is the workspace root.

IMPORTANT: Use dedicated tools for file operations (Glob, Grep, Read, Edit, Write). Use PowerShell for git, npm, docker, process management, and Windows-specific cmdlets.

PowerShell Syntax Notes:
- Variables use $ prefix: $myVar = "value"
- Escape character is backtick (\`), not backslash
- Common aliases: ls (Get-ChildItem), cd (Set-Location), cat (Get-Content)
- Never use Read-Host, Get-Credential, or other interactive cmdlets (runs with -NonInteractive)
- Destructive cmdlets (Remove-Item, etc.) may need -Confirm:$false or -Force

Git commands:
- Prefer new commits over amending
- Never skip hooks (--no-verify) unless user explicitly requests it`,
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The PowerShell command to execute.",
      },
      timeout: {
        type: "number",
        description: "Optional timeout in milliseconds (max 600000). Default: 120000.",
      },
      description: {
        type: "string",
        description: "Short description of what this command does (shown to user for approval).",
      },
    },
    required: ["command"],
  },
},
```

### Step 3：detectPowerShellExe 模块级缓存（可选优化）

为了避免每次都检测，可以在模块顶部加一个 lazy cache：

```typescript
let psExeCache: string | undefined;
async function detectPowerShellExe(): Promise<string> {
  if (psExeCache) return psExeCache;
  try {
    await execFileAsync("pwsh.exe", ["--version"], { timeout: 3000 });
    psExeCache = "pwsh.exe";
  } catch {
    psExeCache = "powershell.exe";
  }
  return psExeCache;
}
```

## 关键实现细节

1. **invokerKind 检查**：PowerShell 只能在主 session 调用，`"worker"` 时抛错（同 Agent 工具的做法）
2. **审批必须**：与 `run_command` 不同，PowerShell 没有 allowlist，任何命令都走审批流
3. **maxBuffer 4MB**：比 `run_command` 的 1MB 大，适合输出较多的命令
4. **不修改 run_command**：Explore agent 等只读工具集依然使用 `run_command`

## Already Completed

- 在 `src/toolRuntime.ts` 实现了 `PowerShell` handler，支持主 session 限制、审批流、超时 clamp、`pwsh.exe`/`powershell.exe` 检测缓存。
- 在 `src/toolRuntime.ts` 注册了 `PowerShell` 工具定义。
- 在 `src/toolRuntime.test.ts` 增加了 worker 阻止和审批执行的 focused 测试。

## Verification

```bash
npx vitest run src/toolRuntime.test.ts src/workspaceRuntimeShell.test.ts src/workspaceRuntimeHost.test.ts src/compact/postCompactCleanup.test.ts src/compactHost.test.ts
npm run check
npm run build
```

结果：
- Focused vitest 通过（132 tests）。
- `npm run check` 通过。
- `npm run build` 通过。
- 全量 `npm test` 仍被仓库内既有无关失败阻塞：`electron/rendererMarkdown.test.ts`、`electron/rendererThinkingSummary.test.ts`、`src/design/versionStore.test.ts`、`electron/ElectronChatPanel.test.ts` 的 `__trigger_discovery__` 用例。

手动测试待 Claude/用户在桌面壳里验证：让模型调用 `PowerShell(command="Get-Date", description="Get current date")`，确认审批弹出且返回日期字符串。

## Definition of Done

- [x] `PowerShell` handler 在 `toolRuntime.ts` 注册
- [x] `detectPowerShellExe()` 实现（带缓存）
- [x] 工具定义在工具数组里
- [x] `invokerKind === "worker"` 时抛错
- [x] 所有命令都走审批流
- [ ] 全量 `npm test` / `npm run check` / `npm run build` 全绿
