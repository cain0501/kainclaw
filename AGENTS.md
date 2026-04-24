# AGENTS

## Project

- Name: KainClaw
- Type: VS Code sidebar AI coding assistant
- Spec baseline: `.kiro/specs/v1-product-spec.md`
- Product ownership: Claude writes planning/specs, User makes final decisions, Codex implements and reviews code
- Strategic target: the current VS Code implementation is a local validation shell; the final core deliverable is a Windows program, not the VS Code extension itself

## Tech Stack

- VS Code extension API
- TypeScript
- Node.js runtime
- Webview UI rendered from `src/webviewHtml.ts`
- MCP integration via `@modelcontextprotocol/sdk`
- Browser automation via Playwright
- Validation and schema parsing via `zod`

## Codex Working Boundary

- Implement against the current spec; do not rewrite product logic on your own.
- Treat the VS Code extension as a staging and local test environment. When making architectural choices, prefer options that preserve or improve the path to a Windows desktop deliverable.
- Do not change business rules or pricing rules unless the user explicitly asks for it.
- Do not modify spec documents as part of implementation work unless explicitly requested.
- If a requirement is unclear, contradictory, or has hidden product tradeoffs, raise a blocker instead of silently redefining behavior.
- Prefer the smallest change that satisfies the approved scope.
- Scope smell: if a task is drifting beyond about 8 files, stop and re-check whether the change is still aligned with spec.

## Required Workflow

### 1. Before starting implementation

- Read `.kiro/specs/v1-product-spec.md` and confirm the current task matches the latest accepted spec.
- Read `.kiro/official-gap-analysis.md` when the work is part of official-Claude capability migration, and keep "official parity first, Cain extensions second" as the decision rule.
- Keep one more product constraint in view: "VS Code is for local testing; Windows program is the real product target."
- Review existing code paths before editing; prefer reuse over adding new parallel logic.
- Run the equivalent of `/plan-eng-review` before larger changes:
  - challenge scope
  - check reuse opportunities
  - identify affected files
  - sketch expected verification coverage
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
- Prefer copying official source modules directly over rewriting them. Only add thin Cain/VS Code adapters where environment differences make direct reuse impossible.
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

## Default Verification Rule

- Small change: `npm run build`
- Risky behavior change: `npm run build` plus the shortest manual reproduction that proves the affected user flow still works
