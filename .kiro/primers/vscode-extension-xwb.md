# Task Primer: vscode-extension-xwb — 路径 B：Skill 文件化，getSkillWorkflow 迁成磁盘文件

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

`src/design/designPrompt.ts` 的 `getSkillWorkflow()` 是一个 switch-case，把 12 种 outputType 的工作流字符串硬编码在 TypeScript 里，再被 `buildDesignChatUserPrompt()`（line 418）内联拼进 user prompt 发给模型。

前置任务 vscode-extension-mpf 已开放 `read_file` + `glob_files`，模型现在有能力主动读文件。本任务把这些 workflow 字符串迁出到磁盘 skill 文件，让模型在 Turn 2 生成前**主动读取** skill 文件，而不是被动接受内联字符串。

**不是把 KainClaw 改造成 OpenDesign**。产品边界不变：最终输出仍然是 `<artifact type="text/html">`，由宿主解析入库，canvas 二次精修链路不变。

## Out of Scope

- 不改 `buildDesignChatSystemPrompt`（系统提示词，line 369，不动）
- 不改 artifact 解析、`saveDesignVersion`、sliders、critique 链路
- 不修改路径 A（快速生成）
- 不改主聊天 lane
- 不触碰 `electron/renderer/index.html`
- 不引入 OpenDesign 的 SKILL.md frontmatter 格式（先迁内容，格式升级是后续）

## Resume Context (MANDATORY — update after every session)

**Last session date:** —
**Last action taken:** 任务刚创建，未开始
**Why it was done that way:** —
**Exact next action:** 按"Next Step"实施
**Known blockers / watch out:** 见下文路径解析风险点

## Already Completed

- [x] 前置：vscode-extension-mpf 完成，路径 B 已有 `read_file` 工具

## Next Step (the ONLY thing to do this session)

**Step 1：创建 skills/ 目录和 12 个 .md 文件**

在 `vscode-extension/skills/` 下创建（文件名 = outputType）：

```
skills/
  landing-page.md
  mobile-app.md
  dashboard.md
  slide.md
  email.md
  social-carousel.md
  magazine-poster.md
  doc-report.md
  pricing-page.md
  infographic.md
  animation.md
  prototype.md
```

内容直接从 `getSkillWorkflow()` switch-case 迁移，格式保持原样（markdown 标题 + Workflow 步骤）。例如 `skills/landing-page.md`：

```markdown
## Skill Workflow: Landing Page

Produce a conversion-led landing page.

Workflow:
1. Lock the top-fold promise before thinking about secondary sections.
2. Decide the sequence: promise, proof, explanation, action.
3. Give each section one visual job and one content job.
4. Keep ornament subordinate to message clarity.
5. Self-check: the page has momentum from top to CTA, not just a stack of nice blocks.
```

**Step 2：在 ElectronChatPanel.ts 添加 `getSkillsDirectory()` helper**

在 class 内（或模块级）添加一个方法，返回 skills/ 的绝对路径：

```typescript
private getSkillsDirectory(): string {
  // __dirname in dist-electron/electron/ → ../../skills = vscode-extension/skills/
  return path.join(__dirname, '../../skills');
}
```

> **路径说明：** `tsconfig.electron.json` 的 outDir 是 `dist-electron`，rootDir 是 `.`，所以 `electron/ElectronChatPanel.ts` 编译后是 `dist-electron/electron/ElectronChatPanel.js`，`__dirname` = `dist-electron/electron/`。`../../skills` 指向 `vscode-extension/skills/`，在开发和生产（electron-builder 打包后 skills/ 与 dist-electron/ 同级）都正确。

**Step 3：修改 `buildDesignChatUserPrompt()` 签名**

在 `src/design/designPrompt.ts` 增加可选参数 `skillFilePath`：

```typescript
export function buildDesignChatUserPrompt(options: {
  prompt: string;
  outputType: DesignOutputType;
  brandContext?: string;
  skillFilePath?: string;   // ← 新增
}): string {
  // 如果有 skillFilePath，用读文件指令替代内联 workflow；否则 fallback
  const workflowBlock = options.skillFilePath
    ? [
        "",
        "## Skill reference",
        `Read the skill workflow file before generating: ${options.skillFilePath}`,
        "Apply its workflow steps when producing the artifact.",
      ].join("\n")
    : (() => {
        const w = getSkillWorkflow(options.outputType);
        return w ? `\n${w}` : "";
      })();

  return [
    `Output type: ${options.outputType}`,
    workflowBlock,
    "",
    `User request: ${options.prompt.trim() || "Create a design direction."}`,
    ...(options.brandContext?.trim()
      ? ["", "Brand context:", options.brandContext.trim()]
      : []),
  ].join("\n");
}
```

`getSkillWorkflow()` 本身**保持不变**，作为 fallback。

**Step 4：在 ElectronChatPanel.ts 调用侧传入 skillFilePath**

找到 line 2618 附近的 `buildDesignChatUserPrompt(...)` 调用，增加 `skillFilePath`：

```typescript
const skillsDir = this.getSkillsDirectory();
const skillFile = path.join(skillsDir, `${options.outputType}.md`);
// 文件存在才传路径，不存在静默 fallback（不要 throw）
const skillFilePath = fs.existsSync(skillFile) ? skillFile : undefined;

buildDesignChatUserPrompt({
  prompt: options.prompt,
  outputType: options.outputType,
  ...(options.brandContext?.trim() ? { brandContext: options.brandContext.trim() } : {}),
  skillFilePath,   // ← 新增
})
```

> `fs` 在 ElectronChatPanel.ts 已经 import（存储路径相关代码用到了），直接用 `fs.existsSync`。

---

## Verification

**命令验证（Codex 自行跑）：**

```bash
npm run build          # 必须通过，0 TypeScript error
npm run check          # 必须通过
npm run build:electron # 必须通过
npm test               # 无新增失败（预存失败见下）
```

> **npm test 预存失败（与本任务无关）：**
> - `electron/rendererMarkdown.test.ts`
> - `electron/rendererThinkingSummary.test.ts`
> - `src/design/versionStore.test.ts`
> - `electron/ElectronChatPanel.test.ts`（`__trigger_discovery__` case）
>
> 要求：**无新增失败**。若出现新增失败必须修复。

**单元测试要补：**

在 `src/design/designPrompt.test.ts`（或已有测试文件）补：

1. `buildDesignChatUserPrompt` 传 `skillFilePath` 时，输出包含文件路径而不是内联 workflow 字符串
2. `buildDesignChatUserPrompt` 不传 `skillFilePath` 时，输出仍然内联 workflow（fallback 正常）

**运行时验证（手测时顺便确认）：**

Turn 2 生成日志里应该出现 `read_file` 调用，路径指向对应的 skill .md 文件。可临时加日志：

```typescript
console.log('[design-chat] skill file:', skillFilePath ?? 'fallback (inline)');
```

确认后删除。

**手测（需要用户配合）：**
1. 进入路径 B，选"先聊需求"
2. Turn 1：确认 AI 仍然返回 `<question-form>`（不应该有变化）
3. Turn 2：回答表单后，AI 生成 `<artifact>` HTML，画布正常打开
4. 对比：相同 prompt 下，生成质量不低于之前（允许有细微差异）
5. 主聊天 lane 行为无变化

## Risk Points

- **风险 1：`fs.existsSync` 在主进程 vs 渲染进程**
  → ElectronChatPanel.ts 运行在主进程（Node 环境），`fs` 可直接用。确认 import 路径用 `import * as fs from "fs"` 或 `import { existsSync } from "fs"`。

- **风险 2：打包后 skills/ 目录不被 electron-builder 包含**
  → 检查 `package.json` 或 `electron-builder.yml` 的 `files` 配置，确认 `skills/` 被包含。如果缺失，添加 `"skills/**"`。没有 electron-builder 配置的话，纯开发阶段不影响，可留作后续加固。

- **风险 3：prototype 是 default case，文件名也应该是 `prototype.md`**
  → `getSkillWorkflow` 的 `default` 对应 prototype，`outputType` 枚举里要确认 "prototype" 是有效值，skills/prototype.md 要建好。

- **风险 4：Turn 1 也会走 buildDesignChatUserPrompt，skill 读取指令放在 Turn 1**
  → 不影响 Turn 1 的 question-form 输出，因为系统提示词里 Turn 1 协议优先于 user prompt 的 workflow 内容。但如果想更干净，可以只在 Turn 2 传 skillFilePath（通过检测 prompt 是否以 `[form answers` 开头决定）。不必须，看实现时是否觉得有必要。

## High-Risk Files Touched

- `src/design/designPrompt.ts` → 只改 `buildDesignChatUserPrompt()` 签名和函数体，`getSkillWorkflow()` 不动
- `electron/ElectronChatPanel.ts` → 只在 `runDesignChatTurn` 调用侧增加 skillFilePath 传参 + `getSkillsDirectory()` helper
- `skills/*.md` → 12 个新文件，从现有 switch-case 迁移内容

## Reference (only load if stuck)

- `src/design/designPrompt.ts` line 231 — `getSkillWorkflow()` switch-case（内容来源）
- `src/design/designPrompt.ts` line 418 — `buildDesignChatUserPrompt()`（改动位置）
- `electron/ElectronChatPanel.ts` line 2618 — `buildDesignChatUserPrompt` 调用侧（改动位置）
- `tsconfig.electron.json` — 确认 outDir/rootDir，验证 `__dirname` 路径推断
- `bd show vscode-extension-xwb`

## Definition of Done

> **Codex 负责验证命令，用户只做手测。提交前必须自己跑完以下命令。**

- [ ] `skills/` 目录存在，12 个 .md 文件各自有对应内容
- [ ] `npm run build` 通过（0 TypeScript error）
- [ ] `npm run check` 通过
- [ ] `npm run build:electron` 通过
- [ ] `npm test`：无新增失败
- [ ] `buildDesignChatUserPrompt` 单元测试补齐（skillFilePath 分支 + fallback 分支）
- [ ] 路径 B Turn 1 仍返回 question-form，Turn 2 仍输出 artifact（手测）
- [ ] Turn 2 日志/调试确认模型调用了 `read_file`（或控制台打印了 skill file 路径）
- [ ] 主聊天 lane 行为无变化（手测）
- [ ] Beads notes 已更新
- [ ] `bd close vscode-extension-xwb` 已执行
