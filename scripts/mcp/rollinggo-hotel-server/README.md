# RollingGo Hotel MCP Server

`src/mcp/rollinggoHotelServer.ts` builds into a local stdio MCP server. It adapts the installed `rgh` CLI from `@rollinggo/hotel`; it does not contain hotel credentials or independently implement hotel booking logic.

## Prerequisites

1. Install and authenticate the underlying CLI:

   ```powershell
   npm install -g @rollinggo/hotel@latest
   rgh login
   ```

2. Build KainClaw:

   ```powershell
   npm run build
   ```

## KainClaw Configuration

Add a stdio server through the existing MCP settings UI, or place the equivalent in `.cain-mcp.json`:

```json
{
  "mcpServers": {
    "rollinggo-hotel": {
      "command": "node",
      "args": ["E:\\claudecodejingiang\\vscode-extension\\dist\\mcp\\rollinggoHotelServer.js"]
    }
  }
}
```

After configuration, approve the workspace server in KainClaw's MCP page and refresh it. `hotel_book` is marked destructive, so KainClaw will always request a per-call approval before the CLI runs.

Set `ROLLINGGO_HOTEL_COMMAND` only when `rgh` has a nonstandard executable path. The server writes MCP protocol messages to stdout; diagnostics must stay on stderr.
