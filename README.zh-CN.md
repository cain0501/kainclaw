# KainClaw

[English](README.md) | 简体中文

KainClaw 是一个早期阶段的 AI 编程与设计助手。当前主要以 Electron 桌面应用运行，同时保留 VS Code 扩展模式用于本地开发和验证。

项目仍在活跃开发中。核心流程已经可用，但部分集成能力和桌面端界面仍不完整。

## 个人说明

KainClaw 最初是一个个人 vibe coding 项目。我不是职业程序员，也不是产品经理，现在也不是互联网从业者；我是从 2026 年 1 月才开始正式接触 Claude、ChatGPT 和 AI 辅助开发。这款应用是在学习和尝试的过程中慢慢做出来的，最初的目标也很简单：让更多人能更容易地使用 Claude 风格的编程和设计工作流。

我把项目开源，是希望大家可以检查、学习、改进它，也一起把 AI 编程和 AI 设计工具做得更容易使用。

## 功能

**AI Agent 运行时**

- 支持 Anthropic、OpenAI、OpenAI 兼容接口和 Claude CLI Provider
- 会话持久化、导出和恢复
- MCP 服务集成
- 文件、Shell、浏览器和后台任务工具
- 内置 Review 和 Verification agent
- Thinking、Effort、Fast mode、Compact 和 Auto-compact 控制
- Hooks、自定义 agents、skills 和 auto-memory
- 早期 LSP 与 worktree 支持

**设计与图像工作流**

- 通过对话生成 HTML artifact
- 支持 prototype、slide、dashboard、report、pricing page、landing page、mobile app mockup、social carousel 等多种输出类型
- 设计方向预设、字体规范、配色规则、布局约束和 anti-slop prompt 规则
- 图像生成、图像编辑、Prompt Library、参考图搜索、变体生成和本地结果持久化

**桌面端与集成能力**

- Electron 桌面壳承载主要聊天体验
- Local Bridge 运行时基础能力
- Word Add-in 原型，用于文档上下文读取和写回流程
- 为后续桌面自动化、浏览器桥接、调度器和本地连接器预留平台边界

## 独立项目声明

KainClaw 是由贡献者开发的独立开源项目。

本项目不隶属于 Anthropic、OpenAI、Microsoft 或本仓库中提到的其他 Provider，也未获得这些主体的认可、背书或维护。相关产品名称和商标归各自权利人所有。

KainClaw 不包含任何 Provider 的专有源代码、模型权重或私有服务资产。Provider 集成通过公开 API、本地 CLI 或用户自行配置的兼容端点实现。

## 设计工作流来源与致谢

KainClaw 的设计系统工作流参考并部分改编自 [nexu-io/open-design](https://github.com/nexu-io/open-design)。

两者共享的是工作流层面的思路，不代表项目从属或产品关联：设计任务会先经过可组合 skills、种子模板、布局参考、检查清单、视觉方向预设和设计系统规则，再生成最终 HTML artifact。KainClaw 将这些思路适配到了自己的 Electron 桌面体验、Provider 运行时、项目存储、聊天流程和本地设计工作台中。

部分设计方向逻辑和设计 prompt 结构改编自 Open Design 的 Apache-2.0 许可实现。详见 `THIRD_PARTY_NOTICES.md`。

## 当前状态

KainClaw 还不是完整的正式客户端。当前推荐使用 Electron 应用进行测试；VS Code 扩展形态主要用于本地开发。

仍在推进的方向包括：

- 工具运行时完整性
- Review 和 Verification 生命周期
- Compact、transcript 和 token 生命周期
- LSP 与 worktree 深度能力
- 浏览器桥接和桌面自动化接线
- Word 原型之外的 Office 集成
- Skills、agents、hooks 和设置的桌面端 UI
- 测试覆盖和发布打包

## 环境要求

- Node.js 18+
- npm
- Windows，用于打包 Electron 桌面端
- VS Code，用于运行扩展开发宿主

## 安装

```bash
npm install
```

## 验证

```bash
npm test
npm run check
npm run build
```

修改桌面端行为时，也应运行：

```bash
npm run build:electron
```

## 运行

启动 Electron 桌面应用：

```bash
npm run start:electron
```

打包 Windows 安装包：

```bash
npm run dist:win
```

运行 VS Code 扩展开发宿主：

1. 用 VS Code 打开本仓库。
2. 按 `F5`。

## Provider 配置

应用支持通过设置界面配置 Provider。为了方便本地开发和兼容已有工作区，也支持环境变量。

常见变量：

| Provider | 变量 |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` |
| OpenAI / 兼容接口 | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` |
| 通用兜底 | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |

不要提交真实账号凭据、API key、token 或私有本地配置。

## MCP 配置

KainClaw 会在工作区中查找 MCP 配置文件，例如：

- `.mcp.json`
- `.cain-mcp.json`

支持 `mcpServers` 和 `servers` 两种顶层结构。

示例：

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

远端 HTTP 服务可以通过 `url` 和 `headers` 配置。

## 开发说明

桌面壳应保持轻量。新的产品逻辑通常应放在 `src/` 下的可复用模块中，Electron 侧主要负责桌面 UI、IPC、权限和宿主集成。

高风险文件：

- `src/extension.ts`
- `src/webviewHtml.ts`
- `electron/ElectronChatPanel.ts`
- `electron/renderer/index.html`
- `src/license/licenseManager.ts`

修改这些路径后，应运行相关构建和测试。

## 贡献

项目仍在稳定阶段，欢迎贡献。

提交 Pull Request 前：

1. 保持改动聚焦。
2. 优先复用已有 runtime 和 host 边界。
3. 除非必要，不要新增依赖。
4. 运行：

```bash
npm test
npm run check
npm run build
```

如果修改 Electron renderer，也运行：

```bash
npm run build:electron
```

更多说明见 `CONTRIBUTING.md`。

## 许可证

MIT。详见 `LICENSE`。

本仓库也包含从 Open Design 改编的 Apache-2.0 许可设计工作流材料。详见 `THIRD_PARTY_NOTICES.md`。
