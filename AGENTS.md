# AGENTS

## 中文说明（阅读版）

这份 `AGENTS.md` 是当前 `vscode-extension/` 项目的核心执行规则。

如果只看一份最重要的约束文件，就是它。

### 角色分工（重要）

这个项目有明确的三方分工：

- **用户**：提出需求、做最终决策
- **Claude**：PM 角色。拆解任务、建 beads issue、写 primer、验收 Codex 结果、更新 CURRENT_STATE.md。**不写代码，不执行 primer 里的任务。**
- **Codex**：执行与交付角色。拿到 primer 写代码，跑验证，更新 beads，并在用户要求、阶段 checkpoint 或每 5 个用户可感知事项完成时，负责 scoped commit + push。

### 如果你是 Claude，读到这里就要确认

**你的工作是协调，不是执行。**

- 看到 primer 里有任务 → 不要动手做，把 primer 发给 Codex 执行
- 用户说"做这个" → **必须同时建 beads issue 和 primer**，缺一不可，然后告诉用户"发给 Codex 执行"
  - issue：用 `bd create` 登记任务，记录标题、描述、优先级
  - primer：在 `.kiro/primers/<beads-id>.md` 写实施说明，包含目标、改哪些文件、怎么验收
  - **只建 issue 不建 primer = Codex 没有实施说明，无法动手**
- 用户说"检查结果" → 验收 Codex 的工作，不是自己重做
- 任何时候都不要修改 `src/`、`electron/` 下的代码文件

**对 Codex 的具体含义：**
- 每次 session，primer 已经由 Claude 写好，你直接按 primer 的 Next Step 执行
- 如果 primer 不存在，不要自己开始写代码——先告知用户让 Claude 来建 primer
- 不要自己判断”这个需求大不大、要不要建 issue”——这是 Claude 的职责
- 你的上下文预算应该全部用在读代码和写代码上，不是用在拆任务上

### 项目总规则

你可以把它理解成”当前开发总规则”：

- `vscode-extension/` 仍然只是本地验证壳
- 最终产品目标是 Windows 程序，不是 VS Code 扩展本身
- Electron 现在只是桌面壳，不是长期业务逻辑归宿
- 新能力优先落到 `src/` 的 runtime / service / adapter
- 不要继续把核心业务逻辑堆进：
  - `electron/ElectronChatPanel.ts`
  - `electron/renderer/index.html`

它还约束我怎么工作：

- 做功能前先看规格和现状，不要凭记忆乱改
- 官方 Claude Code 对齐优先，kainclaw 扩展第二
- 能复用官方源码，就优先复用，不要平行重写
- 改动尽量小、可审查、可回退
- 高风险区域要谨慎：
  - `src/webviewHtml.ts`
  - `src/extension.ts`
  - `src/license/licenseManager.ts`

它还规定了桌面壳边界：

- Electron 只负责桌面 UI、权限、IPC、壳层交互
- 如果要做这些能力，应该先建 runtime 边界，再接桌面：
  - `IDesktopAutomationRuntime`
  - `IBrowserBridgeRuntime`
  - `ISchedulerRuntime`
  - `ILocalBridgeRuntime`

多项连续开发时，每完成 5 个用户可感知事项，就把当前稳定状态 push 到 GitHub。

所以以后如果你想检查”我到底该按什么规则做事”，优先看这份文件的中文说明，再看下面英文原文。

## Project

- Name: KainClaw
- Type: Electron 桌面 AI 编程助手（代码目录名为 `vscode-extension/`，历史原因保留，**不代表产品形态**）
- Spec baseline: `.kiro/specs/v1-product-spec.md`
- Product ownership: Claude writes planning/specs, User makes final decisions, Codex implements and reviews code
- Strategic target: kainclaw 现在运行在 **Electron 桌面壳**里；`vscode-extension/` 是代码仓库目录结构，不是最终产品；目标是完整 Windows 正式客户端

## Tech Stack

- VS Code extension API
- TypeScript
- Node.js runtime
- Webview UI rendered from `src/webviewHtml.ts`
- MCP integration via `@modelcontextprotocol/sdk`
- Browser automation via Playwright
- Validation and schema parsing via `zod`

## Encoding Hygiene

- All user-visible text files must use `UTF-8 without BOM`.
- Do not use terminal mojibake alone to judge file corruption. Verify suspect files by decoding their raw bytes as UTF-8.
- If a text file has already been corrupted by bad transcoding, do not continue incremental edits on the mojibake content. Rewrite the affected section or file from clean UTF-8 text.
- Treat these as encoding high-risk files:
  - `CLAUDE_HANDOFF.md`
  - `.kiro/official-gap-analysis.md`
  - `.kiro/implementation-memory.md`
  - `electron/renderer/index.html`
  - any `.ts` / `.md` / `.html` file containing Chinese user-visible copy
- After editing a high-risk text file, run a script-level UTF-8 decode check before handoff or commit.
- **`electron/renderer/index.html` 改动后必须额外验证 JS 语法**，提交前跑：
  ```bash
  node -e "
  const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');
  const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];
  let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});
  try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}
  "
  ```
  语法错误时 exit code 非零，CI 或手工检查均可拦截。

## Codex Working Boundary

- Implement against the current spec; do not rewrite product logic on your own.
- Treat the `vscode-extension/` codebase as a staging and local test environment. When making architectural choices, prefer options that preserve or improve the path to a Windows desktop deliverable.
- Do not change business rules or pricing rules unless the user explicitly asks for it.
- Do not modify spec documents as part of implementation work unless explicitly requested.
- If a requirement is unclear, contradictory, or has hidden product tradeoffs, raise a blocker instead of silently redefining behavior.
- Prefer the smallest change that satisfies the approved scope.
- Scope smell: if a task is drifting beyond about 8 files, stop and re-check whether the change is still aligned with spec.
- **File operation preference**: For file reading, symbol search, and code navigation, always prefer the direct file tools (Read, Grep, Glob) over shell commands (`cat`, `grep`, `find`) — they are faster with no process spawn overhead. Use PowerShell only for operations that require a shell: build commands, script execution, system calls, or piped output.
- **Index-first rule**: Before running Grep, Glob, or Read for symbol lookup, call chain tracing, or impact analysis, query `codebase-memory-mcp` first. Only open specific source files after a graph hit to confirm details. Do not do full-repo scans when a graph query can answer the question.
- **Index vs grep judgment**: Use the index (`trace_path`, `search_graph`) for call chains, dependency trees, and module structure. Use Grep for exact string/property name lookups — the index may miss connections when a property name differs from its class name (e.g. `imageGalleryStore` property vs `ImageLabGalleryStore` class). When index results seem incomplete, always verify with Grep before concluding something is unused.

## Claude Source Parity Rule

- Strong rule: if a feature, behavior, workflow, prompt contract, renderer behavior, tool/runtime path, or session lifecycle exists in the local Claude Code source, inspect the Claude source first and replicate its logic as the baseline.
- Only add thin KainClaw adapters for host differences such as VS Code, Electron, storage paths, IPC, or product-specific UI wiring.
- Do not replace Claude-covered behavior with prompt-only constraints, regex guesses, or parallel homegrown implementations when source logic is available.
- KainClaw-specific engineering standards apply only to capabilities that do not exist in the Claude source, or to clearly isolated kainclaw extensions layered after the Claude-compatible baseline.
- When fixing repeated regressions in a Claude-covered area, treat the upstream source behavior as the acceptance oracle before writing or changing tests.

## Required Workflow

### 0. Session Start Protocol (read in this order, stop when you have enough context)

**Step 1 — Always read:**
- This file (`AGENTS.md`) — rules and constraints

**Step 2 — Read current state:**
- `.kiro/CURRENT_STATE.md` — default to reading only:
  - `Test Baseline`
  - `Known Non-Blocking Tail Items`
  - `Current Focus`
- Only expand to the rest of the file if the primer explicitly depends on it or you need the active-task fallback

**Step 3 — Read the task primer:**
- `.kiro/primers/<beads-id>.md` — the only session entry point for the active task
- If no primer exists: create one from `.kiro/primers/PRIMER_TEMPLATE.md` before writing code

**Step 4 — Load additional context ONLY if the primer explicitly requests it:**
- Spec file (if primer links to one)
- `official-gap-analysis.md` (only for Claude parity work)
- `implementation-memory.md` (only when stuck on a known-tricky area)
- `CLAUDE_HANDOFF.md` (only for full project orientation, not routine tasks)

**Rule:** Do not load `CLAUDE_HANDOFF.md` or `implementation-memory.md` by default. The primer is the contract. Everything else is reference-on-demand.

### 0.5 Requirement Translation Gate

Before writing code, translate the task into implementation work in the correct order.

Default rule:

- Follow the primer's implementation shape.
- Do not invent a broader rewrite rule unless the primer or a task-specific contract explicitly requires it.

Only for `pmv8.3` and tasks that explicitly point to `.kiro/contracts/pmv8.3-anti-drift.md`, the translation must be:

1. First retire the old left-panel form skeleton.
2. Then establish transcript-first state as the left-panel truth source.
3. Then make preview/stage a dependent result surface of the message/thread state.

Only for `pmv8.3`, the following translation is forbidden:

- Keep the old left panel and add chat-like wrappers
- Keep the old result preview as the primary surface and mirror it into messages
- Start from UI cosmetics before defining the replacement state model

Only for `pmv8.3`, if the task translation still starts from the old skeleton, stop before coding and rewrite the translation.

### 1. Before starting implementation

- Confirm the task primer exists and is current. If not, write it before touching code.
- Review existing code paths before editing; prefer reuse over adding new parallel logic.
- Default implementation strategy:
  - prefer the smallest change
  - prefer reuse
  - prefer not to split or rebuild existing structure
  - prefer not to touch large skeletons
- Only override that default when:
  - the user explicitly asks for a larger skeleton change, or
  - the primer explicitly says the old skeleton must be retired or replaced
- For high-risk files (`extension.ts`, `webviewHtml.ts`, `renderer/index.html`): read `.kiro/HIGH_RISK_ENTRY.md` and confirm all entry conditions are met before editing.
- Run the equivalent of `/plan-eng-review` before larger changes:
  - challenge scope
  - check reuse opportunities
  - identify affected files
  - sketch expected verification coverage
- Define success in the correct order:
  - first: is the interaction model correct
  - second: is the state/source-of-truth model correct
  - third: is the UI reading correctly at a glance
  - last: do syntax, tests, and builds pass
- Do not treat engineering pass conditions as the primary acceptance signal for interaction-model work.
- For tasks like `pmv8.3`, the following are not sufficient success criteria on their own:
  - renderer does not crash
  - syntax passes
  - tests pass
  - build passes
  - there are message cards
  - there is a pending bubble
  - there are result cards
- For tasks like `pmv8.3`, primary success criteria must instead be:
  - the left side reads as a transcript first, not a form
  - message flow is the primary structure
  - composer tools are subordinate, not dominant
  - the right side reads as a stage, not a preview variant
  - the old skeleton has been replaced, not wrapped
- Use skills deliberately before coding:
  - `coding-standards` for readability, simplicity, and maintainability
  - `avoid-feature-creep` to keep migration work scoped to the official capability being restored
  - `code-refactoring-refactor-clean` when touching tangled or high-risk code paths
  - `find-skills` if the installed skill set is not sufficient for the task
- If a suitable existing skill is available, use it instead of improvising a custom workflow.

Note:
- The canonical skill set currently lives under `C:\Users\Administrator\.claude\skills\`.
- Codex CLI in this environment reads skills from `C:\Users\Administrator\.agents\skills\`.
- If `/plan-eng-review`, `/codex review`, `/guard`, or related skills are not visible to the current Codex runtime, follow the same checklist manually and call that out in status updates.

### 2. During implementation

- Keep changes tightly scoped to the approved task.
- Prefer copying official source modules directly over rewriting them. Only add thin kainclaw/VS Code adapters where environment differences make direct reuse impossible.
- Do not create parallel homegrown implementations of an official capability when the upstream source can be copied or lightly adapted.
- Favor boring, reviewable code over clever abstractions. If a refactor increases indirection without reducing risk, do not do it.
- Avoid VS Code-only coupling when it would make later Windows packaging harder. Prefer host abstractions and reusable runtime modules over extension-specific entanglement.
- Do not change unrelated UI copy, architecture, or persistence behavior unless required by the task.
- Treat approvals, license checks, session persistence, and swarm gating as product-sensitive behavior.
- Use extra caution in large template-string files and extension activation paths.
- If a task touches a risky area, prefer incremental edits and compile after each logical step.
- For ongoing multi-item work, after every completed group of 5 user-facing items, push the current stable state to GitHub so recovery does not depend on local-only history.

### 2.1 Windows Desktop Guardrails

- Treat Electron as a desktop shell, not as the long-term home for core product logic.
- New capabilities must land in reusable `src/` runtime, service, or adapter modules first; Electron should only wire them into desktop UX.
- Do not add new business logic, agent orchestration, or feature-specific state machines directly into `electron/ElectronChatPanel.ts` unless the logic is truly shell-only.
- Do not put OS automation, browser automation orchestration, scheduling, or bridge protocol logic into `electron/renderer/index.html`.
- Keep renderer responsibilities limited to view state, interaction wiring, and IPC requests. If a feature needs substantial product logic, move it behind a host/runtime boundary.
- Before implementing any of these feature families, define or extend a dedicated runtime boundary under `src/platform/` or another `src/` runtime module:
  - `IDesktopAutomationRuntime` for Computer Use / desktop control
  - `IBrowserBridgeRuntime` for Browser Bridge
  - `ISchedulerRuntime` for Cron / routines
  - `ILocalBridgeRuntime` for Office / localhost bridge / external connectors
- Prefer the same-core multi-host model: VS Code, Electron, and future clients should reuse the same runtime modules whenever possible.
- Do not treat the current single-file Electron renderer as the final frontend architecture. It is acceptable as a validation shell, but future large UI surfaces should not force more core logic into it.

### 3. Before handoff

- Run the equivalent of `/codex review`:
  - look for regressions
  - check missing guards
  - check edge cases
  - verify affected flows
- Build at minimum with `npm run build` unless the user explicitly says not to.
- Summarize any residual risk honestly.
- If a change affects frontend-visible behavior, desktop shell behavior, or any user-triggered integration that cannot be fully proven by automated checks alone, explicitly give the user a short manual test checklist in the handoff. Do not assume silent delivery is sufficient.

## Dangerous Areas

### `src/webviewHtml.ts`

- High risk.
- Entire UI is assembled inside a very large template string.
- Escaping, quoting, and inline HTML/JS changes are brittle.
- Small edits can break rendering or introduce XSS if `escapeHtml()` usage is bypassed.
- Prefer minimal, localized edits and immediate build verification.

### `src/extension.ts`

- High risk.
- This is the extension activation and orchestration entrypoint.
- Mistakes here can break activation, session restore, provider resolution, approvals, or swarm initialization for the whole plugin.
- Be especially careful around:
  - activation and ready flow
  - message dispatch switch
  - session lifecycle
  - license restore and gating
  - swarm initialization

### `src/license/licenseManager.ts`

- High risk.
- Contains offline Ed25519 verification logic and feature flag decoding.
- Do not casually change payload structure, public key handling, version parsing, or flag decoding.
- Any change here must be justified and verified end-to-end.

## Known High-Risk Files

- `src/webviewHtml.ts`: large template-string UI, fragile escaping, weak debugging ergonomics
- `src/extension.ts`: activation/orchestration hub, mistakes impact the whole extension
- `src/license/licenseManager.ts`: license verification and flag decoding, security-sensitive

## Release Markers

- Search for `SWARM_GATE` before release.
- Any line marked with `SWARM_GATE` is a temporary development unlock that must be reviewed before shipping paid gating.

## Deferred Architectural Decisions

这些决策已分析完毕，方向已定，但暂不实施。待产品功能稳定后再推进。

### image-as-tool 重构（vscode-extension-b3m）

**现状：** image_generate 是独立 pipeline，AI 在图片模式里没有机会开口。用户发复合 prompt（如"生图 + PS 分层建议"）时，非图片部分被静默丢弃。

**目标行为（GPT 实际模式，两轮）：**
- 第 1 轮：用户发复合/模糊图片请求 → 路由到 chat → AI 分析、提问、出方案（纯文字）
- 第 2 轮：用户确认 → 路由到 image_generate → 生图

图片生成仍走独立 pipeline，不需要改渲染和流式。

**实际需要改的只有两件事：**
1. LLM router system prompt 加规则：复合/模糊图片请求先走 chat 澄清（小）
2. image_generate 构建 prompt 时带入 conversation history，让第二轮"好，生成吧"能知道生什么（中）

**为什么暂缓：** 功能不紧急，当前 regex fallback 对明确图片请求已够用。等产品其他部分稳定后再推进。

**不要提前 hack：** 不要用"image 完成后强行接 chat"来模拟，会制造迁移成本。

## Default Verification Rule

- Small change: `npm run build`
- Risky behavior change: `npm run build` plus the shortest manual reproduction that proves the affected user flow still works

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for task tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work (use when no task is specified)
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Task Tracking Rules

- Use `bd` for task state, claiming, dependencies, and completion.
- Do NOT use TodoWrite, TaskCreate, or markdown TODO lists for task tracking.
- Use Claude memory system for user preferences and cross-session context — do NOT replace it with `bd remember`.
- Use `.kiro/implementation-memory.md` for long-term implementation conclusions.
- Use `.kiro/official-gap-analysis.md` for parity boundaries and capability matrix.

### Session Start

- If the user specifies a task: load `.kiro/CURRENT_STATE.md` → load task primer → do it.
- If no task is specified: load `.kiro/CURRENT_STATE.md` → run `bd ready` → load primer for claimed issue → do it.
- If bd is unavailable: load `.kiro/CURRENT_STATE.md` → use active task from that file.
- If no primer exists for the active task: create it from `.kiro/primers/PRIMER_TEMPLATE.md` before writing code.

### Session End

1. Run quality gates: `npm test && npm run check && npm run build`.
2. Update beads notes with: what was done + **the specific next step** (not just "continue"). A missing next step means the next agent session cannot start without re-reading the whole codebase.
3. Update `.kiro/CURRENT_STATE.md` if: test baseline changed, active task changed, or a new stable capability landed.
4. Update task primer's "Already Completed" section.
5. Update issue status (`bd close <id>` or `bd update <id>`).
6. Push to remote: when user requests, at phase checkpoint, or every 5 user-facing items.

### Task Size Rule

- A beads task should be completable in 1–3 focused sessions.
- If a task has been in_progress for more than 3 days: split it into explicit sub-tasks with `bd create`, close the parent or leave it as the epic.
- Each sub-task must have a single next step in its primer or beads notes.

### Primer 粒度规则

- 多步骤、跨文件、需要跨 session 的任务 → 建 primer
- 单文件单方法的小 fix → 直接在消息里说清楚（文件路径 + 行号 + 改什么），不建 primer

### Claude PM 的批量工作模式

Claude 出 primer 时应一次批量出 3–5 个，覆盖一条任务线的完整序列。

- Codex 做完一个，直接读下一个 primer，不需要每次都回来问 Claude
- 只有以下情况需要找 Claude：遇到高风险文件、结果验收不通过、需求发生变化
- 每批 primer 出完后，Claude 更新 CURRENT_STATE.md 标注整条队列

### Git Push 规则

- **git commit / push 由 Codex 负责。**
- Codex 在推送前必须完成验证、更新 beads / CURRENT_STATE.md，并写清楚本次提交范围。
- Codex 只能 stage 本次任务相关文件；工作区已有的无关 dirty / untracked 文件不得被顺手提交。
- commit message 必须遵守上方 Lore Commit Protocol。
- push 节点：用户明确要求、每完成 5 个用户可感知事项，或阶段性功能收口时。
<!-- END BEADS INTEGRATION -->
