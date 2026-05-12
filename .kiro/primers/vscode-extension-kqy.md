# Task Primer: vscode-extension-kqy — ConfigTool: 设置读写工具

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里新增 `Config` 工具，让模型可以读取和修改部分 KainClaw 运行时设置。

对标官方 `ConfigTool`。模型通过这个工具可以自主调节自己的行为（如切换 effort level、开关 fast mode），而不必用户每次手动操作。

**本次交付范围（MVP）：**
- 新增 `Config` 工具，接受 `setting`（必填）和 `value`（可选，省略=读取）
- 支持读写 5 个设置：`effortLevel`、`fastMode`、`showThinkingSummaries`、`verbose`、`uiLanguage`
- `model` 只读（不允许通过工具切换 provider）
- 读取不需要审批，写入需要审批

## Out of Scope

- provider 管理（切换 API key、切换 provider）
- image model 设置
- `permissions.defaultMode` / `autoCompactEnabled` 等官方独有设置
- 官方的 AppState 同步（`setAppState`）——KainClaw 目前无此机制，跳过

## High-Risk Files

- `src/toolRuntime.ts` — 新增 `Config` handler + 工具定义 + `ToolContext` 字段
- `src/workspaceRuntimeShell.ts` — 新增 `readConfig`/`writeConfig` 注入
- 调用方（`workspaceRuntimeHost.ts` 或 `extension.ts`）— 实现回调

## 架构设计

```
Config handler (toolRuntime.ts)
  → context.readConfig(key)       → SettingsRepository.get*(...)
  → context.writeConfig(key, val) → SettingsRepository.set*(...)
```

`ToolContext` 新增两个可选回调：

```typescript
readConfig?: (key: string) => unknown;
writeConfig?: (key: string, value: unknown) => Promise<void>;
```

## 支持的设置

| key | 类型 | 说明 |
|-----|------|------|
| `effortLevel` | `"low"\|"medium"\|"high"\|"auto"` | 思维努力程度 |
| `fastMode` | `boolean` | Fast mode 开关 |
| `showThinkingSummaries` | `boolean` | 是否显示思维摘要 |
| `verbose` | `boolean` | 详细输出开关（复用 showThinkingSummaries 字段） |
| `uiLanguage` | `string` | UI 语言，如 `"zh-CN"` / `"en"` |
| `model` | `string` | **只读**，返回当前 active provider 的 model 名 |

## 实现步骤

### Step 1：ToolContext 新增 readConfig / writeConfig

在 `src/toolRuntime.ts` 的 `ToolContext` 类型里（第 383 行附近，`skillStore` 之前）新增：

```typescript
readConfig?: (key: string) => unknown;
writeConfig?: (key: string, value: unknown) => Promise<void>;
```

### Step 2：toolRuntime.ts Config handler

```typescript
const CONFIG_SUPPORTED_SETTINGS = {
  effortLevel: {
    type: "string" as const,
    options: ["low", "medium", "high", "auto"],
    description: "Thinking effort level",
  },
  fastMode: {
    type: "boolean" as const,
    description: "Enable Fast mode (faster response, uses Opus model)",
  },
  showThinkingSummaries: {
    type: "boolean" as const,
    description: "Show thinking summaries in chat",
  },
  verbose: {
    type: "boolean" as const,
    description: "Show verbose debug output",
  },
  uiLanguage: {
    type: "string" as const,
    description: "UI language (e.g. zh-CN, en)",
  },
  model: {
    type: "string" as const,
    readonly: true,
    description: "Current active model (read-only)",
  },
} as const;

// In handlers:
async Config(input, context) {
  const setting = typeof input.setting === "string" ? input.setting.trim() : "";
  if (!setting) {
    throw new Error("setting is required");
  }
  if (!(setting in CONFIG_SUPPORTED_SETTINGS)) {
    const available = Object.keys(CONFIG_SUPPORTED_SETTINGS).join(", ");
    throw new Error(`Unknown setting: "${setting}". Available: ${available}`);
  }

  const config = CONFIG_SUPPORTED_SETTINGS[setting as keyof typeof CONFIG_SUPPORTED_SETTINGS];

  // GET
  if (input.value === undefined) {
    if (!context.readConfig) {
      throw new Error("Config read is not available in the current session.");
    }
    const value = context.readConfig(setting);
    return {
      summary: `Config: ${setting} = ${JSON.stringify(value)}`,
      content: `${setting} = ${JSON.stringify(value)}`,
    };
  }

  // SET — check readonly
  if ("readonly" in config && config.readonly) {
    throw new Error(`${setting} is read-only.`);
  }

  if (!context.writeConfig) {
    throw new Error("Config write is not available in the current session.");
  }

  // Type validation
  let finalValue: unknown = input.value;
  if (config.type === "boolean") {
    if (typeof input.value === "string") {
      finalValue = input.value.toLowerCase() === "true";
    } else if (typeof input.value !== "boolean") {
      throw new Error(`${setting} requires true or false.`);
    }
  }
  if ("options" in config && config.options) {
    if (!config.options.includes(String(finalValue))) {
      throw new Error(`Invalid value "${input.value}". Options: ${config.options.join(", ")}`);
    }
  }

  await requestActionApproval(context, {
    kind: "tool_action",
    toolName: "Config",
    title: "Confirm setting change",
    summary: `Set ${setting} to ${JSON.stringify(finalValue)}`,
    inputPreview: `${setting} = ${JSON.stringify(finalValue)}`,
  });

  await context.writeConfig(setting, finalValue);

  return {
    summary: `Config: set ${setting} = ${JSON.stringify(finalValue)}`,
    content: `Set ${setting} to ${JSON.stringify(finalValue)}`,
  };
},
```

### Step 3：工具定义

```typescript
{
  name: "Config",
  description: `Get or set KainClaw configuration settings.

## Usage
- Get current value: Omit the "value" parameter
- Set new value: Include the "value" parameter

## Available settings

- effortLevel: "low", "medium", "high", "auto" - Thinking effort level
- fastMode: true/false - Enable Fast mode
- showThinkingSummaries: true/false - Show thinking summaries in chat
- verbose: true/false - Show verbose debug output
- uiLanguage: string - UI language (e.g. "zh-CN", "en")
- model: (read-only) Current active model

## Examples
- Get effort level: { "setting": "effortLevel" }
- Set high effort: { "setting": "effortLevel", "value": "high" }
- Enable fast mode: { "setting": "fastMode", "value": true }`,
  input_schema: {
    type: "object",
    properties: {
      setting: {
        type: "string",
        description: "The setting key",
      },
      value: {
        type: "string",
        description: "The new value. Omit to get current value. Booleans accepted as string 'true'/'false'.",
      },
    },
    required: ["setting"],
  },
},
```

### Step 4：workspaceRuntimeShell.ts 注入 readConfig / writeConfig

在 `WorkspaceRuntimeShell` 构造函数参数里（同 `runVerification`、`runReview`、`spawnSubAgent` 的模式）新增：

```typescript
private readonly readConfig: (key: string) => unknown,
private readonly writeConfig: (key: string, value: unknown) => Promise<void>,
```

在 `buildToolContext()` 里：

```typescript
readConfig: this.readConfig,
writeConfig: this.writeConfig,
```

### Step 5：调用方实现 readConfig / writeConfig

在创建 `WorkspaceRuntimeShell` 的地方（`workspaceRuntimeHost.ts` 或 `extension.ts`）传入实现：

```typescript
readConfig: (key: string) => {
  switch (key) {
    case "effortLevel":   return settingsRepo.getEffortLevel() ?? "auto";
    case "fastMode":      return settingsRepo.getFastMode();
    case "showThinkingSummaries":
    case "verbose":       return settingsRepo.getShowThinkingSummaries();
    case "uiLanguage":    return settingsRepo.getLanguage();
    case "model": {
      const meta = settingsRepo.getActiveProviderMeta();
      return meta?.model ?? "unknown";
    }
    default:              return undefined;
  }
},
writeConfig: async (key: string, value: unknown) => {
  switch (key) {
    case "effortLevel":
      await settingsRepo.setEffortLevel(value as EffortLevel | undefined);
      break;
    case "fastMode":
      await settingsRepo.setFastMode(value as boolean);
      break;
    case "showThinkingSummaries":
    case "verbose":
      await settingsRepo.setShowThinkingSummaries(value as boolean);
      break;
    case "uiLanguage":
      await settingsRepo.setLanguage(String(value));
      break;
  }
},
```

## 关键实现细节

1. **`model` 只读**：通过 `readonly: true` 字段在 handler 里拦截 SET 请求
2. **布尔值宽容**：接受字符串 `"true"/"false"`，因为 LLM 有时会以字符串传布尔值
3. **写入审批**：任何 SET 操作都走 `requestActionApproval`，用户可以看到要改什么
4. **verbose = showThinkingSummaries**：KainClaw 没有单独的 verbose 字段，两者 alias 到同一个存储

## Already Completed

- 在 `src/toolRuntime.ts` 实现了 `Config` handler、受支持设置常量，以及 `ToolContext.readConfig` / `writeConfig` 字段。
- 在 `src/workspaceRuntimeShell.ts` 和 `src/workspaceRuntimeHost.ts` 打通了配置读写回调注入。
- 在 `src/extension.ts` 把 `effortLevel`、`fastMode`、`showThinkingSummaries`、`verbose`、`uiLanguage` 和只读 `model` 映射到 `SettingsRepository`。
- 在 `src/toolRuntime.test.ts`、`src/workspaceRuntimeShell.test.ts`、`src/workspaceRuntimeHost.test.ts` 增加了 focused 回归测试。

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

手动测试待 Claude/用户在桌面壳里验证：让模型调用 `Config(setting="effortLevel")` 读取，再调用 `Config(setting="effortLevel", value="high")` 写入，确认审批弹出且值持久化。

## Definition of Done

- [x] `Config` handler 在 `toolRuntime.ts` 注册
- [x] `ToolContext` 新增 `readConfig` / `writeConfig`
- [x] `workspaceRuntimeShell.ts` 注入两个回调
- [x] 调用方实现 5 个可读/写 setting + `model` 只读
- [x] 读取不审批，写入审批
- [ ] 全量 `npm test` / `npm run check` / `npm run build` 全绿
