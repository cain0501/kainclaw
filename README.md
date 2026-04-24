# Cain Claude VS Code Sidebar

这是当前项目的 VS Code 本地验证壳。它不是最终产品形态，最终目标仍然是 Windows 程序；但这里已经承载了大部分核心能力的验证与迁移工作。

当前已具备的基础能力包括：

- 文件读取、搜索、替换、写入审批
- 白名单命令执行与后台任务运行
- Playwright 浏览器控制
- MCP tools 与 MCP resources 接入
- 会话持久化、多会话、导出
- Plan Mode、Verification、Review
- Thinking / Effort、Fast Mode、Compact
- 基础 Swarm / task runtime / worktree runtime

## 启动

1. 安装依赖

```powershell
npm install
```

2. 构建扩展

```powershell
npm run build
```

3. 如需浏览器能力，安装 Chromium

```powershell
npm run playwright:install
```

4. 用 VS Code 打开 `vscode-extension` 目录
5. 按 `F5` 启动 Extension Development Host

## Provider 配置

当前优先路径是扩展内的设置面板。兼容旧工作区时，仍保留 `.env` fallback。

常见环境变量：

- OpenAI / OpenAI-compatible
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_BASE_URL`
- Anthropic
  - `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_BASE_URL` 或 `CLAUDE_BASE_URL`
- 通用兜底
  - `LLM_PROVIDER`
  - `LLM_API_KEY`
  - `LLM_MODEL`
  - `LLM_BASE_URL`

## MCP 配置

扩展会自动向上查找：

- `.mcp.json`
- `.cain-mcp.json`

支持两种顶层写法：

- `mcpServers`
- `servers`

支持两种传输方式：

- 本地 stdio：`command + args`
- 远程 HTTP：`url + headers`

最简单的方式：

1. 复制上层示例配置为 `.mcp.json`
2. 补齐 token / headers / project ref
3. 重新打开侧边栏或重新发送一条消息

## 你可以怎么测

1. 读代码

```text
读取 src/extension.ts，然后告诉我启动流程
```

2. 搜代码

```text
搜索 workspaceRoot 在哪些文件里出现过
```

3. 测试写文件审批

```text
新建 demo-cain.txt，写入 hello from cain
```

4. 测试浏览器能力

```text
打开 https://example.com，截图并总结页面
```

5. 测试 MCP

```text
列出你当前能调用的 MCP 工具
```

## 当前行为规则

- `write_file` 和 `replace_in_file` 默认先审批
- `run_command` 默认先审批
- destructive MCP tools 默认先审批
- 浏览器会话是共享的，新的 `browser_snapshot` 会刷新元素 `ref`
- 命令执行仍受 allowlist 限制

## 当前仍在推进的方向

- 更完整的 Verification / Review / task lifecycle parity
- 更完整的 remote / detached background tasks
- 更深一层的 Compact / transcript / token 管理
- 更完整的 LSP parity
- 更多宿主层和文案层乱码清理
