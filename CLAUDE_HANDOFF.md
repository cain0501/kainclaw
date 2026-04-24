# Claude Handoff

## Current Override - 2026-04-25

- This round validated:
  - `npm test`
  - `npm run check`
  - `npm run build`
- Current verified baseline after this round:
  - `144` test files
  - `940` tests passed
- `npm run build:electron` was not rerun in this round by the agent. Electron shell launch/runtime verification remains user-run.
- Electron desktop shell now wires these slash commands back into the real `src/` host/runtime path:
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
- Electron workspace and git inspection semantics are now separated:
  - the selected workspace remains the user-selected directory
  - `/review` and `/verify` resolve git context separately as inspection-only repo context
  - inspection repo resolution now happens before provider/runtime/MCP tool setup
  - `workspace:set` now supports clearing back to `unset`
- Electron user-facing review/verify copy was tightened:
  - internal follow-up text such as `Review task saved as ...`, `TaskOutput`, and `task_id` is hidden from end users
  - workspace badges show the directory label directly instead of technical tags such as `需确认`
  - non-git folders no longer show a persistent “not a git repo” warning in the workspace area

更新时间：2026-04-25

## 当前状态总览

- 主工作目录：
  - `E:\claudecodejingiang\vscode-extension`
- `vscode-extension/` 仍然是本地验证壳，不是最终产品形态。
- 当前能打包、能验证的是 Electron 内测壳，不是完整 Windows 正式客户端。
- 核心能力仍然必须优先落在 `src/` 的 runtime / service / adapter 层。
- Electron 只做桌面壳、权限、IPC、UI，不应继续承接新的核心业务逻辑。
- 项目主线仍然是与官方 Claude Code 能力持续对齐；图片、Office、Local Bridge、User Modeling、Auto Skill Generation 都属于扩展能力。

## 当前验证边界

- 由 agent 默认执行：
  - `npm test`
  - `npm run check`
  - `npm run build`
- 不默认执行：
  - `npm run build:electron`
- Electron 启动与手测由用户执行：
  - `npm run start:electron`

## 当前产品形态

### Electron 桌面壳

- Electron 当前主入口是聊天页，不再是旧的 `Image Lab` 独立首页。
- 当前桌面壳主要可见面包括：
  - 聊天页
  - 会话列表
  - 设置页
  - Prompt Library 抽屉
  - 找参考图抽屉
  - 图片编辑相关弹层
- Electron 现在应被准确描述为“真实可用的桌面验证壳”，不能对外表述成完整 Windows 客户端。

### Slash commands

- 当前桌面壳已接回这些已验证命令：
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
- slash command 识别顺序已先于图片意图判断。
- `/compact` 不会再因为最近图片上下文而误走图片链路。
- `/review`、`/verify` 默认按用户语言输出。
- `/verify` 仍保留必要英文结构标签：
  - `### Check:`
  - `Command run:`
  - `Output observed:`
  - `Result: PASS/FAIL`
  - `VERDICT: PASS/FAIL/PARTIAL`

### Workspace / git inspection

- `workspace` 现在始终代表用户选中的目录。
- 普通聊天、MCP 工作区显示、Local Bridge 上下文都继续使用这个选中的目录。
- `/review`、`/verify` 会单独解析 inspection repo root：
  - 如果当前目录本身是 git 仓库，就直接使用它
  - 如果当前目录是父目录且能唯一识别出嵌套 repo，则只在 inspection 流程里使用那个 repo root
  - 如果无法识别唯一 repo，则在聊天消息里明确提示 degraded mode
- 普通非 Git 目录不会再在 workspace 区域常驻显示“当前目录不是 Git 仓库”。
- workspace badge 现在只显示目录名，不再显示 `需确认` 之类的技术态标签。

### 图片主链

- 图片生成和图片编辑当前都走聊天主链，而不是旧 `Image Lab` 参数页。
- 发送消息时会根据意图自动分流：
  - 普通聊天
  - 新图生成
  - 基于最近图片上下文的编辑
- 图片结果会回写聊天消息流，并保留桌面侧继续编辑/下载入口。
- 图片结果已支持本地持久化恢复。
- 图片批量生成会保留批次，不会覆盖原图。
- Prompt history 只记录明确的生成/编辑提交，不记录无关普通聊天输入。

## Prompt Library 当前状态

- Prompt Library 现在是聊天/编辑链路可打开的辅助抽屉，不是独立主页。
- 当前已稳定存在的能力：
  - 内置与用户条目共存
  - 新增 / 编辑 / 删除
  - 收藏 / 取消收藏
  - 收藏视图
  - 样本图
  - 一键使用
  - 设为参考图
  - 从图片反推双语提示词
- 数据层已落在：
  - `src/imageGeneration/promptLibraryRepository.ts`
  - `src/imageGeneration/promptLibraryBuiltins.ts`

## 找参考图当前状态

- 用户侧统一入口是“找参考图”，不再用旧的其它命名。
- 当前链路是显式两段式：
  - 先根据当前图像任务整理建议检索词
  - 再由用户确认或修改后主动开始搜索
- 当前搜索源仍是过渡方案：
  - `playwright -> 百度图片搜索页 -> 结果页抽取真实图地址与来源页`
- 长期目标仍然是：
  - 先做网页资料搜索
  - 再从资料页抽取视觉线索 / 可用图片

## 当前已经比较稳定的核心能力面

### 核心 AI/runtime

- Provider：
  - Anthropic
  - OpenAI
  - OpenAI-compatible
  - Claude CLI
- 已稳定存在的主能力：
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
  - Skills registry
  - User modeling

### 当前已接入的核心命令面

- 当前核心命令注册表中已存在：
  - `/commands`
  - `/agents`
  - `/skills`
  - `/hooks`
  - `/add-dir`
  - `/files`
  - `/plan`
  - `/compact`
  - `/mcp`
  - `/memory`
  - `/todo`
  - `/tools`
  - `/review`
  - `/verify`
- 桌面壳当前只应诚实暴露真实可用子集，不能把未接好的命令伪装成可用。

## Local Bridge / Office 当前状态

### Desktop runtime 边界

- `DesktopRuntimeServices` 注入层已经落地。
- 当前 Electron 真正接上的 runtime 只有：
  - `localBridgeRuntime`
- 当前仍停留在接口边界层的 runtime：
  - `desktopAutomationRuntime`
  - `browserBridgeRuntime`
  - `schedulerRuntime`

### Local Bridge

- `LocalBridgeRuntime` 已在 Electron 启动时真实拉起。
- 当前最小闭环已存在：
  - register
  - config
  - proxy
  - session context / message
- Local Bridge 当前会把状态发布回 Electron 聊天状态。

### Office / Word

- Word Add-in skeleton 已落地：
  - `office-addin/word/manifest.xml`
  - taskpane html / css / ts
  - `documentReader.ts`
  - `documentSelection.ts`
- `src/officeBridge/` 当前已有最小只读问答与 citation 上下文链路：
  - `bridgeClient.ts`
  - `wordDocumentContext.ts`
  - `wordQuestionAnswer.ts`
  - `wordSelectionContext.ts`
  - `wordSelectedContextView.ts`
- 当前阶段仍然是：
  - 只读问答
  - 选区上下文
  - citation 命中
- 还不是完整 Office 编辑产品流。

## 当前明确未完成

- Browser Bridge 本体
- Desktop automation / Computer Use 本体
- Scheduler / Cron 本体
- 完整 desktop Skills / Agents / Hooks UI
- 完整 Office 业务链
- 完整 Windows 正式客户端形态
- Voice mode
- Prompt suggestion
- Plugin / Skills 市场

## 已知非阻塞尾项

- 删除最后一个 provider 时，聊天区仍可能提示“未找到 Provider 配置”。
- `supabase` MCP 当前仍可能出现 `Connection closed`。

## 当前关键风险

- `src/extension.ts` 仍是高风险宿主入口，虽然已经抽出大量 host/helper，但总控逻辑依旧偏厚。
- `electron/renderer/index.html` 当前仍是单文件验证壳，不应继续堆新的核心产品逻辑。
- `electron/ElectronChatPanel.ts` 仍是桌面壳总控，不应继续承载新的 runtime 级业务逻辑。
- 当前“找参考图”虽然已切到更符合中国大陆用户环境的搜索链，但仍是过渡态，不是最终资料搜索编排层。
- `DesktopRuntimeServices` 里真正接上的 runtime 仍然太少，桌面真闭环还没建完。

## 下一优先级

1. 继续把 `extension.ts` 的宿主总控往 host / runtime / adapter 下沉
2. 继续收桌面壳真实可用子集，不虚报未接好的能力
3. 继续收 `/review`、`/verify`、task/tool 链路的 parity 边界
4. 继续维持三份主文档写成“当前状态”，不回到流水账

## 相关规格与参考路径

### 主规格与参考

- 主产品规格：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\v1-product-spec.md`
- 官方源码能力索引：
  - `E:\claudecodejingiang\vscode-extension\.kiro\source-reference.md`
- 当前实现对账：
  - `E:\claudecodejingiang\vscode-extension\.kiro\official-gap-analysis.md`
- 当前实现记忆：
  - `E:\claudecodejingiang\vscode-extension\.kiro\implementation-memory.md`

### 未来能力规格入口

- Computer Use / Browser Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\computer-use-browser-bridge.md`
- Office Add-in / Local Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\office-addin-ecosystem.md`
- Hooks：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-hooks-execution-chain.md`
- Custom Agents：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-custom-agents-wizard.md`
- Cron / Scheduler：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-cron-scheduled-tasks.md`
- 跨会话搜索：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x01-cross-session-search.md`
- User Modeling：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x02-user-modeling.md`
- Message Gateway：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x03-message-gateway.md`
- Companion：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f09-companion.md`
- Auto Skill Generation：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f11-auto-skill-generation.md`
- KainClaw Design：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\kainclaw-design.md`
- Worker 权限边界：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p05-worker-permissions.md`
