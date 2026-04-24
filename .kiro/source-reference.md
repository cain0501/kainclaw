# 官方 Claude Code 源码功能索引

> 用途：KainClaw 开发时，需要参考或移植某个功能，直接查这里找源文件。
> 源码位置：`E:\claudecodejingiang\src\`
> 探索时间：2026-04-01

---

## 1. 多 Agent / Swarm 并行协作

### 1.1 Swarm 核心系统
| 文件 | 内容 |
|------|------|
| `src/utils/swarm/` | Swarm 整体目录 |
| `src/utils/swarm/backends/TmuxBackend.ts` | tmux 多窗格后端（CLI 用，我们改成卡片 UI） |
| `src/utils/swarm/backends/ITermBackend.ts` | iTerm2 后端（Mac，不用） |
| `src/utils/swarm/backends/InProcessBackend.ts` | **进程内后端（直接参考，最适合 VS Code）** |
| `src/utils/swarm/registry.ts` | 后端注册表 |
| `src/utils/swarm/teamHelpers.ts` | Team 配置文件读写工具 |

### 1.2 Team 工具（AI 调用的工具）
| 文件 | 内容 |
|------|------|
| `src/tools/TeamCreateTool/TeamCreateTool.ts` | `spawn_agent` 参考实现 |
| `src/tools/TeamDeleteTool/TeamDeleteTool.ts` | 结束/清理 Agent |

### 1.3 Agent 间通信（SendMessage）
| 文件 | 内容 |
|------|------|
| `src/tools/SendMessageTool/SendMessageTool.ts` | **`send_message` 工具完整实现，直接参考** |

> 注意：官方用 UDS（Unix Domain Socket）做跨进程通信，我们简化为进程内 EventEmitter。

### 1.4 Coordinator 模式
| 文件 | 内容 |
|------|------|
| `src/coordinator/coordinatorMode.ts` | Coordinator 系统提示词 + 工具限制（350行，完整参考） |

### 1.5 子 Agent / Worktree 隔离
| 文件 | 内容 |
|------|------|
| `src/tools/AgentTool/forkSubagent.ts` | `isolation: "worktree"` 实现，git worktree 隔离 |
| `src/tools/AgentTool/AgentTool.tsx` | Agent 工具主入口，含自动后台逻辑 |

### 1.6 Team 共享记忆
| 文件 | 内容 |
|------|------|
| `src/memdir/teamMemPaths.ts` | Team Memory 路径管理 |
| `src/memdir/teamMemPrompts.ts` | Team Memory 提示词 |

---

## 2. 计划模式（Plan Mode）

| 文件 | 内容 |
|------|------|
| `src/tools/EnterPlanModeTool/EnterPlanModeTool.ts` | 进入计划模式工具 |
| `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` | 退出并等待用户确认 |
| `src/tools/AgentTool/built-in/planAgent.ts` | 内置 Plan 子 Agent（只读，产出计划文件） |
| `src/commands/plan/plan.tsx` | `/plan` 命令实现 |
| `src/commands/ultraplan.tsx` | `/ultraplan` 命令（远程 Opus，30 分钟深度规划） |
| `src/utils/ultraplan/` | Ultraplan 工具目录 |

---

## 3. 自动记忆系统（Auto-Memory）

| 文件 | 内容 |
|------|------|
| `src/memdir/memdir.ts` | **核心：对话结束后提取记忆写入本地文件** |
| `src/memdir/memoryScan.ts` | 扫描已有记忆文件 |
| `src/services/extractMemories/extractMemories.ts` | 记忆提取 LLM 调用逻辑 |
| `src/services/autoDream/autoDream.ts` | **AutoDream：定期后台整理记忆** |
| `src/services/autoDream/consolidationPrompt.ts` | 整理用的提示词 |
| `src/services/SessionMemory/sessionMemory.ts` | 会话内记忆层（非持久化） |
| `src/services/SessionMemory/prompts.ts` | 会话记忆提示词 |

> 记忆存储路径：`~/.claude/projects/<项目路径>/memory/`
> 每条记忆是一个 md 文件，含 frontmatter（name / description / type）
> MEMORY.md 是索引，限制 200 行 / 25KB

---

## 4. 思考模式（Thinking / Reasoning）

| 文件 | 内容 |
|------|------|
| `src/utils/thinking.ts` | **ultrathink 关键词触发深度思考 + 彩虹 UI** |
| `src/commands/effort/effort.tsx` | `/effort [low\|medium\|high\|max\|auto]` 命令 |
| `src/commands/fast/` | `/fast` 快速模式命令 |
| `src/constants/betas.ts` | 所有 beta header 常量（含 interleaved-thinking / redact-thinking） |

> 关键 beta headers：
> - `interleaved-thinking-2025-05-14`：交错思考
> - `redact-thinking-2026-02-12`：服务端隐藏思考块
> - `effort-2025-11-24`：努力程度控制
> - `fast-mode-2026-02-01`：快速模式

---

## 5. 高级工具

### 5.1 LSP 代码智能（跳转定义 / 查引用 / 悬停类型）
| 文件 | 内容 |
|------|------|
| `src/tools/LSPTool/LSPTool.ts` | **LSP 工具主实现：go_to_definition / find_references / hover / call_hierarchy** |
| `src/services/lsp/` | LSP 服务管理目录 |

### 5.2 定时任务（Cron）
| 文件 | 内容 |
|------|------|
| `src/tools/ScheduleCronTool/` | CronCreate / CronDelete / CronList 三个工具 |

> 配置文件：`.claude/scheduled_tasks.json`（durable=true 时写入）

### 5.3 后台通知工具（BriefTool）
| 文件 | 内容 |
|------|------|
| `src/tools/BriefTool/BriefTool.ts` | 主动推送通知给用户，支持文件附件，含 AFK 模式 |

### 5.4 任务管理（Task 系列工具）
| 文件 | 内容 |
|------|------|
| `src/tools/TaskCreateTool/` | 创建异步任务 |
| `src/tools/TaskGetTool/` | 获取任务状态 |
| `src/tools/TaskListTool/` | 列出所有任务 |
| `src/tools/TaskUpdateTool/` | 更新任务进度 |
| `src/tools/TaskStopTool/` | 停止任务 |
| `src/tools/TaskOutputTool/` | 获取任务输出 |

### 5.5 Worktree 工具
| 文件 | 内容 |
|------|------|
| `src/tools/EnterWorktreeTool/` | 创建并切换到 git worktree |
| `src/tools/ExitWorktreeTool/` | 退出 worktree（保留或删除） |

### 5.6 工具搜索（按需加载工具）
| 文件 | 内容 |
|------|------|
| `src/tools/ToolSearchTool/ToolSearchTool.ts` | 搜索并激活延迟加载的工具 |

### 5.7 Jupyter Notebook 编辑
| 文件 | 内容 |
|------|------|
| `src/tools/NotebookEditTool/` | 编辑 .ipynb 文件 |

### 5.8 MCP 资源工具
| 文件 | 内容 |
|------|------|
| `src/tools/ListMcpResourcesTool/` | 列举 MCP 资源 |
| `src/tools/ReadMcpResourceTool/` | 读取 MCP 资源 |
| `src/tools/McpAuthTool/McpAuthTool.ts` | MCP OAuth 认证流程 |

---

## 6. 验证 Agent（代码质量自检）

| 文件 | 内容 |
|------|------|
| `src/tools/AgentTool/built-in/verificationAgent.ts` | **对抗性验证 Agent：跑测试/lint/类型检查，输出 VERDICT: PASS/FAIL/PARTIAL** |

> 参数：原始任务 + 改动的文件列表 + 采用的方案
> 只读，不能修改项目文件

---

## 7. 代码审查模式（Ultrareview）

| 文件 | 内容 |
|------|------|
| `src/commands/review/ultrareviewCommand.tsx` | `/review` 命令主入口 |
| `src/commands/review/reviewRemote.ts` | 远程审查会话启动 |
| `src/services/api/ultrareviewQuota.ts` | 用量配额管理 |

---

## 8. 上下文管理

| 文件 | 内容 |
|------|------|
| `src/services/compact/` | 整体目录 |
| `src/services/compact/microCompact.ts` | 微压缩（生成最小摘要注入新上下文） |
| `src/services/compact/autoCompact.ts` | 自动压缩（token 超阈值时触发） |
| `src/services/compact/timeBasedMCConfig.ts` | 基于时间的压缩配置 |
| `src/utils/tokenBudget.ts` | Token 预算跟踪（含 task-budgets beta） |

> 关键 beta headers：
> - `context-1m-2025-08-07`：1M 上下文窗口
> - `context-management-2025-06-27`：服务端上下文管理
> - `token-efficient-tools-2026-03-28`：紧凑工具调用格式

---

## 9. 下一步提示（Prompt Suggestion）

| 文件 | 内容 |
|------|------|
| `src/services/PromptSuggestion/promptSuggestion.ts` | AI 回答后自动生成建议的下一步问题 |
| `src/services/PromptSuggestion/speculation.ts` | 推测式生成逻辑 |

---

## 10. Magic Docs（自我更新文档）

| 文件 | 内容 |
|------|------|
| `src/services/MagicDocs/magicDocs.ts` | **含 `# MAGIC DOC:` 标题的 md 文件，AI 对话后自动补充** |

> 触发：文件被读取时 → 注册 post-sampling hook → 对话结束后更新文件

---

## 11. 远程执行（CCR）

| 文件 | 内容 |
|------|------|
| `src/utils/teleport.tsx` | Teleport 主入口（打包 git bundle 发到远程） |
| `src/utils/teleport/gitBundle.ts` | git bundle 生成（含大小限制回退逻辑） |
| `src/utils/teleport/environments.ts` | 远程环境管理（BYOC 配置） |
| `src/commands/remote-setup/` | 远程执行向导命令 |
| `src/utils/concurrentSessions.ts` | 后台会话（`--bg` 模式） |
| `src/tasks/RemoteAgentTask/RemoteAgentTask.ts` | 远程 Agent 任务生命周期 |
| `src/tasks/LocalAgentTask/LocalAgentTask.ts` | 本地 Agent 任务生命周期 |

---

## 12. 远程控制 / Bridge

| 文件 | 内容 |
|------|------|
| `src/bridge/replBridge.ts` | 跨机器 Bridge 主实现（SSE + WebSocket） |
| `src/bridge/bridgeMain.ts` | Bridge 主进程入口 |
| `src/bridge/bridgeMessaging.ts` | Bridge 消息协议 |
| `src/bridge/bridgePointer.ts` | 远程会话保活 |
| `src/bridge/capacityWake.ts` | 容量唤醒机制 |

---

## 13. Advisor 双模型模式

| 文件 | 内容 |
|------|------|
| `src/utils/advisor.ts` | 第二个"顾问"模型并行运行，结果加密回传 |
| `src/commands/advisor.ts` | `/advisor <model>` 命令 |

> beta header：`advisor-tool-2026-03-01`

---

## 14. AFK 模式

| 文件 | 内容 |
|------|------|
| `src/constants/betas.ts` | `afk-mode-2026-01-31` beta header |

> 配合 BriefTool 使用：用户不在时 AI 继续工作并主动推送通知

---

## 15. 洞察分析（/insights）

| 文件 | 内容 |
|------|------|
| `src/commands/insights.ts` | 分析历史对话 transcript，生成使用习惯洞察（用 Opus） |

---

## 16. Plugins / 插件市场

| 文件 | 内容 |
|------|------|
| `src/commands/plugin/` | 插件管理命令目录 |
| `src/utils/plugins/` | 插件工具目录（含市场浏览、安装、信任验证） |

> 官方市场：`anthropics/claude-plugins-official`

---

## 17. Skills 系统（自定义斜杠命令）

| 文件 | 内容 |
|------|------|
| `src/tools/SkillTool/` | AI 可以调用 Skill 工具 |
| `src/commands/skills/` | 管理 Skill 的命令 |
| `src/utils/skillUsageTracking.ts` | Skill 使用统计 |

---

## 18. Hooks 系统

| 文件 | 内容 |
|------|------|
| `src/commands/hooks/hooks.tsx` | Hooks 管理命令 |
| `src/utils/hooks/` | Hook 工具目录 |
| `src/utils/sessionFileAccessHooks.ts` | 文件访问 Hook |

> Hook 类型：post-sampling、session、frontmatter、stop、file-access

---

## 19. 结构化输出 / Token 效率

| 文件 | 内容 |
|------|------|
| `src/constants/betas.ts` | 所有 beta headers |

> 关键：
> - `structured-outputs-2025-12-15`：JSON schema 约束输出
> - `token-efficient-tools-2026-03-28`：紧凑工具调用格式（降低 token 消耗）
> - `prompt-caching-scope-2026-01-05`：分域 Prompt 缓存

---

## 20. 吉祥物系统（Companion）

| 文件 | 内容 |
|------|------|
| `src/buddy/companion.ts` | 从 UUID 确定性生成物种、稀有度、属性 |
| `src/buddy/types.ts` | 物种列表（鸭/龙/水豚/机器人等）、稀有度定义 |
| `src/buddy/CompanionSprite.tsx` | 终端动画渲染 |

> 稀有度：普通 60% / 非普通 25% / 稀有 10% / 史诗 4% / 传奇 1% / Shiny 1%

---

## 21. Vim 模式

| 文件 | 内容 |
|------|------|
| `src/vim/` | Vim 模式完整实现 |
| `src/commands/vim/vim.ts` | `/vim` 命令 |
| `src/hooks/useVimInput.ts` | Vim 输入 Hook |

---

## 22. 语音模式

| 文件 | 内容 |
|------|------|
| `src/voice/voiceModeEnabled.ts` | Voice 模式开关逻辑 |

> 需要 claude.ai OAuth，不支持 API Key 模式，V3 考虑

---

## 23. 集成（GitHub / Slack / Chrome / Mobile）

| 文件 | 内容 |
|------|------|
| `src/commands/install-github-app/` | GitHub App 安装向导（10 个 React 组件） |
| `src/commands/install-slack-app/install-slack-app.ts` | Slack 集成 |
| `src/commands/chrome/` | Chrome 扩展集成 |
| `src/utils/claudeInChrome/` | Chrome 扩展工具 |
| `src/commands/mobile/mobile.tsx` | 生成 App Store / Play Store 二维码 |
| `src/commands/desktop/desktop.tsx` | 桌面 App 切换 |

---

## 24. 输出样式 / Passes

| 文件 | 内容 |
|------|------|
| `src/commands/output-style/` | 输出格式风格配置 |
| `src/constants/outputStyles.ts` | 样式常量 |
| `src/commands/passes/passes.tsx` | 多轮 Pass 处理系统 |

---

## 25. 企业 MDM 策略

| 文件 | 内容 |
|------|------|
| `src/utils/settings/mdm/` | MDM 策略读取 |
| `src/utils/settings/mdm/rawRead.ts` | 平台原生 MDM 配置读取 |
| `src/utils/plugins/pluginOnlyPolicy.ts` | 插件限制策略 |

---

## 26. 诊断 / 调试工具

| 文件 | 内容 |
|------|------|
| `src/commands/ctx_viz/index.js` | `/ctx_viz` 可视化当前上下文窗口内容 |
| `src/utils/telemetry/perfettoTracing.ts` | Perfetto 性能追踪（多 Agent 会话剖析） |
| `src/commands/btw/btw.tsx` | `/btw` 插入侧问（不中断主对话） |

---

## 开发优先级建议

| 阶段 | 功能 | 参考文件 |
|------|------|---------|
| **V1（现在）** | Swarm 并行 + SendMessage | §1.1–1.4 |
| **V2** | 自动记忆 + AutoDream | §3 |
| **V2** | 计划模式 | §2 |
| **V2** | 验证 Agent | §6 |
| **V2** | 努力程度控制 | §4 |
| **V3** | LSP 代码智能 | §5.1 |
| **V3** | Magic Docs | §10 |
| **V3** | 下一步提示 | §9 |
| **V3** | 定时任务 | §5.2 |
| **V4+** | 吉祥物系统 | §20 |
| **V4+** | 插件市场 | §16 |
| **不做** | 远程执行 CCR | §11（需要 Anthropic 服务器） |
| **不做** | 语音模式 | §22（需要 claude.ai OAuth） |
