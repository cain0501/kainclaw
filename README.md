# KainClaw

English | [简体中文](README.zh-CN.md)

KainClaw is an early-stage AI coding and design assistant that runs as an Electron desktop app, with a VS Code extension mode kept for local development and validation.

The project is still in active development. Core workflows are usable, but some integrations and desktop surfaces are incomplete.

## Features

**AI agent runtime**

- Anthropic, OpenAI, OpenAI-compatible, and Claude CLI provider support
- Persistent chat sessions with export and restore
- MCP server integration
- File, shell, browser, and background task tools
- Built-in review and verification agents
- Thinking, effort, fast mode, compact, and auto-compact controls
- Hooks, custom agents, skills, and auto-memory
- Early LSP and worktree support

**Design and image workflows**

- Chat-driven HTML artifact generation
- Multiple design output types, including prototypes, slides, dashboards, reports, pricing pages, landing pages, mobile app mockups, and social carousels
- Design direction presets, typography guidance, color rules, layout constraints, and anti-slop prompt rules
- Image generation, editing, prompt library, reference image search, variants, and local result persistence

**Desktop and integration work**

- Electron desktop shell for the main chat experience
- Local Bridge runtime foundation
- Word Add-in prototype for document context and write-back flows
- Platform boundaries for future desktop automation, browser bridge, scheduler, and local connector work

## Status

KainClaw is not a polished production client yet. The Electron app is the recommended runtime for testing; the VS Code extension shape remains useful for local development.

Areas still under active development include:

- Tool runtime completeness
- Review and verification lifecycle
- Compact, transcript, and token lifecycle
- LSP and worktree depth
- Browser bridge and desktop automation wiring
- Office integration beyond the current Word prototype
- Desktop UI for skills, agents, hooks, and settings
- Test coverage and release packaging

## Requirements

- Node.js 18+
- npm
- Windows for the packaged Electron desktop build
- VS Code if you want to run the extension development host

## Install

```bash
npm install
```

## Validate

```bash
npm test
npm run check
npm run build
```

Run the Electron build when desktop behavior changes:

```bash
npm run build:electron
```

## Run

Start the Electron desktop app:

```bash
npm run start:electron
```

Build a Windows installer:

```bash
npm run dist:win
```

Run the VS Code extension development host:

1. Open this repository in VS Code.
2. Press `F5`.

## Provider Configuration

The app supports provider configuration through the settings UI. Environment variables are also supported for local development and compatibility with existing workspaces.

Common variables:

| Provider | Variables |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` |
| OpenAI / compatible | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` |
| Generic fallback | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |

Do not commit real account credentials, API keys, tokens, or private local configuration.

## MCP Configuration

KainClaw looks for MCP configuration in workspace files such as:

- `.mcp.json`
- `.cain-mcp.json`

Both `mcpServers` and `servers` top-level shapes are supported.

Example:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-package"]
    }
  }
}
```

Remote HTTP servers can be configured with `url` and `headers`.

## Development Notes

The desktop shell should stay thin. New product logic should usually live in reusable modules under `src/`, with Electron wiring used for desktop UI, IPC, permissions, and host integration.

High-risk areas to edit carefully:

- `src/extension.ts`
- `src/webviewHtml.ts`
- `electron/ElectronChatPanel.ts`
- `electron/renderer/index.html`
- `src/license/licenseManager.ts`

Run the relevant build and tests after changing these paths.

## Contributing

Contributions are welcome while the project is stabilizing.

Before opening a pull request:

1. Keep the change focused.
2. Reuse existing runtime and host boundaries where possible.
3. Avoid adding new dependencies unless the need is clear.
4. Run:

```bash
npm test
npm run check
npm run build
```

For Electron renderer changes, also run:

```bash
npm run build:electron
```

## License

MIT. See `LICENSE` once the repository license file is added.
