# KainClaw

KainClaw 当前已经落地了 `Electron` 内测壳，同时保留 `VS Code` 形态作为本地验证环境。

需要明确的项目定位是：

- 当前可打包、可运行的是 `Electron` 内测壳
- `vscode-extension/` 仍然承担核心 runtime / service / adapter 的本地验证职责
- 最终目标仍然是更完整的 Windows 客户端，而不是只停留在 VS Code 扩展形态

当前已经稳定存在的核心能力包括：

- Provider 主链：Anthropic、OpenAI、OpenAI-compatible、Claude CLI
- 会话持久化 / 导出 / 恢复
- MCP runtime
- 文件工具 / 命令工具 / 浏览器工具
- Tasks / background command
- built-in Review / Verification
- Thinking / Effort / Fast mode
- Compact / Auto-compact
- Auto-Memory
- LSP phase 1 + 部分 phase 2
- Worktree phase 1
- Hooks 执行链
- Custom Agents registry
- Skills registry + Auto skill generation
- User modeling

当前已落地的扩展能力包括：

- Electron 聊天主链
- 图像生成 / 图像编辑聊天工作流
- Prompt Library 抽屉
- 参考图搜索抽屉
- Local Bridge 最小可运行实现
- Word Add-in 只读 MVP 主链

## 启动

### 1. 安装依赖

```powershell
npm install
```

### 2. 运行基础校验

```powershell
npm test
npm run check
npm run build
npm run build:electron
```

### 3. 启动 Electron 内测壳

```powershell
npm run start:electron
```

### 4. 打包 Windows 内测安装包

```powershell
npm run dist:win
```

### 5. 启动 VS Code 本地验证环境

1. 用 VS Code 打开 `vscode-extension` 目录
2. 按 `F5` 启动 Extension Development Host

## Provider 配置

当前推荐优先通过应用内设置页配置 Provider。为了兼容旧工作区，仍保留 `.env` fallback。

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

不要把真实账号、API Key、token 或本地私有配置提交到 Git 仓库。

## MCP 配置

项目会向上查找：

- `.mcp.json`
- `.cain-mcp.json`

支持两种顶层写法：

- `mcpServers`
- `servers`

支持两种传输方式：

- 本地 stdio：`command + args`
- 远端 HTTP：`url + headers`

最简单的接入方式：

1. 复制示例配置为 `.mcp.json`
2. 补齐 token / headers / project ref
3. 重开侧边栏或重新发送一条消息

## 当前桌面壳说明

Electron 当前已经是可运行的内测壳，但它还不是完整正式客户端。当前真实可见面主要是：

- 聊天页
- 会话列表
- 设置页
- Prompt Library 抽屉
- 参考图搜索抽屉
- 图片编辑弹层

当前桌面壳已经可以作为内部验证与内测分发载体，但后续新能力仍然应该先落到 `src/`，而不是继续堆进：

- `electron/ElectronChatPanel.ts`
- `electron/renderer/index.html`

## 图像链路说明

当前图像能力已经迁到聊天主链，不再把旧 `Image Lab` 页面当作产品主入口。

当前已支持：

- 图像模型多配置 + 当前使用
- Prompt Library
- 批量生成结果批次展示
- 变体追加为新批次
- 结果本地持久化恢复
- 单张删除
- 参考图搜索
- 双语可见的图片反推提示词

## 当前仍在推进的方向

- `tasks / toolRuntime` 更深 parity
- Verification / Review 更完整生命周期
- Compact / transcript / token 管理更深收口
- LSP / Worktree 更深 parity
- `src/extension.ts` 宿主减债继续下沉
- Browser Bridge / Computer Use / Scheduler runtime 真正接线
- 完整 Office 业务链
- 完整 desktop Skills / Agents / Hooks UI

## 仓库边界

这个仓库当前只同步 `E:\claudecodejingiang\vscode-extension` 目录，不同步根目录的参考源码、构建产物、本地运行状态和账号配置。
