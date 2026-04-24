# KainClaw · V1 产品规格书（Spec）

**版本**：v1.2  
**日期**：2026-04-02  
**状态**：基于实际代码审查更新，反映真实实现状态  
**负责人**：Claude（PM） / Codex（技术实现）

> **v1.2 变更摘要**（代码全量审查后更新）：
> 1. 标注所有已完成功能的实际状态（P01/P02/P03/P04 核心均已实现）
> 2. 确认 F08 设置面板和 F01 Onboarding 是当前最高优先级的未完成项
> 3. 将 webviewHtml.ts 重构列为独立高风险项（2949 行模板字符串）
> 4. 更新里程碑计划，反映当前实际进度
> 5. 更新 SYSTEM_PROMPT 质量差距为明确待办项

---

## 一、产品定位

### 一句话描述
一个面向中国开发者的 Windows 桌面 AI 编程助手——比官方 Claude Code CLI 更易用、接任意 LLM、可离线部署、打包即用。

### 核心差异点（对比官方 CLI）
| 维度 | 官方 Claude Code CLI | KainClaw V1 |
|------|---------------------|----------------|
| 界面 | 终端黑框 | 图形侧边栏 + 独立桌面窗口 |
| 模型 | 只能用 Anthropic | 任意 API Key（Anthropic / OpenAI / 中转站 / 兼容接口） |
| 多 Agent | 不支持 | **任意 AI 指挥 + 多个不同 AI 并行干活（Swarm）** |
| Agent 通信 | 无 | **Agent 之间可互发消息（SendMessage）** |
| 安装 | 需要 Node.js + npm | 双击 .exe 安装，开箱即用 |
| 系统 | Mac/Linux 友好，Windows 有坑 | Windows 原生支持 |
| 定价 | 按 Anthropic 订阅收费 | 软件免费，用户自带 Key，高级功能付费 |

---

## 二、目标用户（V1）

**主要用户**：中国开发者
- 会写代码，但不想折腾命令行
- 有自己的 Anthropic / OpenAI API Key
- 在 Windows 上开发
- 愿意为好用的工具付费

**不在 V1 范围内的用户**：
- 非技术用户（产品经理、设计师）→ V2
- 需要团队协作功能的用户 → V3
- Mac/Linux 用户 → V1 之后

---

## 三、V1 功能范围

> **图例**：✅ 已完成并集成 · ⚠️ 部分完成 · ❌ 未开始

### 3.1 核心功能

#### F01 · 首次启动引导（Onboarding） ✅ 已完成
- 启动后展示欢迎界面 ✅
- 引导用户选择 Provider（Anthropic / OpenAI / OpenAI 兼容接口 / 本机 Claude CLI）✅
- 引导用户填入 API Key，实时验证是否有效 ✅
- 引导用户选择默认模型 ✅
- 完成后进入主界面 ✅

**验收标准**：新用户从双击 .exe 到发出第一条消息，步骤不超过 3 步。

---

#### F02 · 聊天主界面 ✅ 已完成
- 侧边栏聊天窗口 ✅
- 消息渲染：Markdown、代码块、工具调用过程展示 ✅
- 输入框：多行、Enter 发送、Shift+Enter 换行 ✅
- 实时流式输出 ✅
- 停止按钮 ✅
- 清空对话按钮 ✅

---

#### F03 · 多 Provider / 模型支持 ✅ 已完成

**已实现的 Provider 类型：**
| 类型 | 实现文件 | 状态 |
|------|---------|------|
| `anthropic` | `anthropicAdapter.ts` | ✅ 完整，含流式 |
| `openai` | `openAIAdapter.ts` | ✅ 完整，含 reasoning 字段支持 |
| `openai-compatible` | `openAIAdapter.ts`（baseUrl 参数） | ✅ 完整，baseUrl 必填强制 |
| `claude-cli` | `claudeCliAdapter.ts` | ✅ 完整，跨平台 |

> **注意**：`settingsRepository.ts` 已实现多 Provider 存储，但 **F08 设置面板 UI 未上线**，当前通过 `.env` 文件 fallback 读取配置（`extension.ts` 里标有 `// TODO: remove after F08 ships`）。

**ProviderAdapter 接口**（`IProviderAdapter.ts`）：
```typescript
interface IProviderAdapter {
  runStep(messages, tools, onToken): Promise<NormalizedStep>
}
```

---

#### F04 · 文件操作工具 ✅ 已完成
| 工具名 | 状态 |
|--------|------|
| `read_file` | ✅ |
| `write_file` | ✅ 写入前 diff 预览 + 审批 |
| `replace_in_file` | ✅ 写入前审批 |
| `list_directory` / `list_files` | ✅ |
| `glob_files` | ✅ 自定义 globToRegex，无额外依赖 |
| `search_files` | ✅ 正则搜索 |

---

#### F05 · 命令执行工具 ✅ 已完成
- `run_command`（PowerShell） ✅
- 执行前审批卡片 ✅
- 白名单：`git add/commit/stash/push`、`npm run/test/install`、`npx tsc` ✅
- 黑名单：`git reset/checkout/merge/rebase`、`rm`、`del`、`DROP` 等 ✅

---

#### F06 · 浏览器控制工具 ✅ 已完成
- `browser_navigate` / `browser_screenshot` / `browser_snapshot` ✅
- `browser_click` / `browser_type` / `browser_wait_for` / `browser_close` ✅
- Playwright 后端，artifacts 写入 `.cain-artifacts/browser/` ✅

---

#### F07 · MCP 工具接入 ✅ 已完成
- 自动读取 `.mcp.json` / `.cain-mcp.json` ✅
- stdio 本地进程 + streamable HTTP 远程 ✅
- 工具动态发现，命名空间 `mcp__<server>__<tool>` ✅
- 侧边栏 MCP 状态 Badge ✅
- 已验证：GitHub MCP、Supabase MCP ✅

---

#### F08 · 设置面板 ✅ 已完成
- Provider 配置 UI（添加、编辑、删除、切换默认）✅
- API Key 输入 + 安全存储（`context.secrets`）✅
- 模型选择 ✅
- 中转站 baseUrl 配置 ✅
- License Key 激活入口 ✅

---

### 3.2 付费功能

#### P01 · 会话持久化 ✅ 已完成
- `sessionRepository.ts` 实现完整 ✅
- JSONL 追加写，存 `globalStorageUri/sessions/` ✅
- 索引 `index.json` + 每会话 `<id>.jsonl` ✅
- `exportMarkdown()` 导出功能 ✅

---

#### P02 · 多会话管理 ✅ 已完成
- 多会话切换 ✅
- 会话重命名、删除 ✅
- `activeSessionId` 持久化 ✅

---

#### P03 · License Key 激活系统 ✅ 已完成
- Ed25519 离线签名验证 ✅
- payload 含 version + expiry + flags（sessionPersistence / multiSession / swarm）✅
- 公钥打包进客户端，私钥不入代码库 ✅
- `scripts/generateLicense.ts` 批量生成脚本 ✅
- 格式：`CAIN-{BASE32(signature[0:40])}` ✅

---

#### P04 · 多 Agent 协作 — Swarm 并行模式 ✅ 核心已完成

**已完成：**
- `SwarmCoordinator.ts`：spawn / send / wait 三工具完整实现 ✅
- `SwarmBus.ts`：进程内 EventEmitter 消息总线 ✅
- `agentRunner.ts`：Swarm 工具自动注入 + Worker 消息自动注入对话历史 ✅
- Worker 工具白名单强制（完整工具权限）✅
- 超时机制（无进展 2 分钟 / 绝对上限 15 分钟，AbortController）✅
- Worker 完整 transcript 记录 ✅
- `settingsRepository`：命名 Provider alias 支持（Worker 独立 Provider 配置）✅
- **License 付费门控**：`handlePrompt()` 中检测显式 Swarm 意图（`hasExplicitSwarmIntent`），未激活时主动提示付费，不降级静默跳过 ✅

**未完成：**
- **Swarm UI 卡片面板**：Worker 状态卡片、实时更新、点击展开 transcript ❌
  - `webviewHtml.ts` 里有 UI 结构但未与 `SwarmCoordinator` 实际接通
- **端到端集成测试**：多 Provider Worker 并行跑通验证 ❌

**V1 硬限制**（确认保留）：
- 最多 5 个并行 Worker
- depth = 1，Worker 不能再 spawn
- Worker 工具：读写文件、运行白名单命令、fetch_url、Task 工具、send_message（完整工具权限）
- 并发冲突由 SYSTEM_PROMPT 协调约束：Worker 不得同时修改同一文件，不得同时触发审批

---

#### P05 · Auto Skill Generation（任务后自动沉淀技能）❌ 未开始

完整 Spec 见 `.kiro/specs/f11-auto-skill-generation.md`。

**目标**：agent 完成足够复杂的任务后，自动将经验抽象为本地 SKILL.md 文件，下次遇到相似任务优先复用。

**核心交付物**：
- `src/skills/skillStore.ts`：SKILL.md 磁盘 CRUD
- `src/skills/skillDistiller.ts`：复杂度判断 + AI 生成 SKILL.md
- `SkillManagerTool`（新增到 `src/toolRuntime.ts`）：agent 可调用的 skill 读写工具
- `src/backgroundTaskHost.ts` post-task hook：任务完成后 fire-and-forget 触发蒸馏
- `/skills` 命令展示用户技能区块

**复杂度触发阈值**：tool 调用 ≥ 5 次，或输出长度 ≥ 3000 字符。

**不在本 Spec 范围**：自动注入 system prompt、Skill Hub、版本历史。

---

#### P06 · 跨会话搜索（Cross-Session Search）❌ 未开始
> **优先级**：Windows 打包成功后再考虑要不要做

**目标**：用户能用自然语言检索历史对话——"上次我是怎么解决 TypeScript 路径报错的"——直接找到答案，而不是翻会话列表。

**技术分析**：
- **实现路径 A（推荐，零新依赖）**：在 `sessionRepository.ts` 上加文本搜索层，启动时把所有 JSONL transcript 扫描入内存倒排索引，支持关键词匹配 + 按 session 分组返回 snippet。
- **实现路径 B（更完整）**：引入 `better-sqlite3` + FTS5 虚拟表，把 user/assistant 消息批量写入 SQLite，支持 full-text search、phrase query 和相关度排序。
- **触发方式**：`/search <query>` 斜杠命令；或在主对话中检测"上次/之前/历史"等关键词，自动调用 SearchTool。
- **返回格式**：session 名称 + 日期 + 匹配行的前后 2 行上下文 snippet，按相关度排序，最多 10 条。
- **存储开销**：JSONL 文件已有，路径 A 不增加磁盘占用；路径 B 增加一个 `search-index.db`（估算 < 50MB / 10 万条消息）。
- **主要交付物**：`src/search/sessionSearchIndex.ts`（索引构建 + 查询）、`SearchTool`（agent 可调用）、`/search` 命令。

---

#### P07 · 用户建模（User Modeling）❌ 未开始
> **优先级**：Windows 打包成功后再考虑要不要做

**目标**：agent 随着使用次数增加，逐步积累对用户的了解——技术栈偏好、编码风格、高频错误模式、项目上下文——并在下次对话时把这些知识注入 system prompt，提供更精准的回复。

**技术分析**：
- **存储**：`{globalStorageUri}/user-profile.md`，YAML frontmatter + Markdown body，字段包括 `preferredStack`、`codingStyle`、`commonMistakes`、`projectContext`、`lastUpdated`。
- **更新时机**：每次会话结束（`finalizeSuccess` 后），若对话轮次 ≥ 3 且有工具调用，fire-and-forget 发起 profile-delta 提取请求。
- **提取 prompt**：给 AI 提供当前 profile + 本次会话摘要，让 AI 判断是否有新信息值得追加，返回结构化 patch。
- **注入时机**：`promptSetupHost.ts` 组装 system prompt 时，若 profile 存在则在尾部追加 `<user_profile>` 块。
- **隐私说明**：profile 只存本地，不上传，用户可通过 `/memory` 命令查看和删除。
- **主要交付物**：`src/userModel/profileStore.ts`（读写）、`src/userModel/profileDistiller.ts`（AI 提取 delta）、`promptSetupHost.ts` 注入点。

---

#### P08 · 消息平台 Gateway（微信 / 钉钉）❌ 未开始
> **优先级**：Windows 打包成功后再考虑要不要做（V2 功能，高监管复杂度）

**目标**：中国用户直接在微信或钉钉里给 KainClaw 发消息、触发 agent、接收结果——无需打开 VS Code。

**技术分析**：
- **方案 A：个人微信 iLink 协议（参考 openclaw-weixin，推荐先做）** — 腾讯官方为 OpenClaw（腾讯自己的 AI CLI）开源的 WeChat channel 插件（`Tencent/openclaw-weixin`）已验证此路径可行：二维码扫码登录个人微信 → 本地 HTTP gateway 持久在线 → 长轮询 `getUpdates` 拉取新消息 → KainClaw agent 处理 → `sendMessage` 回写。API 用 `ilink_bot_token` 鉴权，支持多账号并发、会话隔离。不是逆向灰色方案，是腾讯官方支持的 iLink Bot 协议。
- **方案 B：企业微信（WeChat Work）** — 官方 REST API，需注册企业，稳定合规，适合商业化后升级。
- **方案 C：钉钉机器人** — Outgoing Webhook 最简单，个人开发者无需注册，适合快速验证消息平台 gateway 架构可行性。
- **共同架构**：独立 gateway 进程（Node.js HTTP server），通过 IPC 或本地 HTTP 调用 KainClaw agent runtime；长任务先回"处理中"再异步推送结果；消息格式双向转换（平台消息 → KainClaw prompt，KainClaw reply → 平台消息）。
- **核心挑战**：方案 A 依赖 iLink Bot Protocol，需确认腾讯是否允许第三方使用（OpenClaw 是腾讯亲生产品）；方案 B/C 需要公网 IP 或内网穿透接收 webhook。
- **主要交付物**：`src/gateway/weixinGateway.ts`（方案 A，iLink 协议）、`src/gateway/dingTalkGateway.ts`（方案 C，快速验证）。

---

### 3.3 不在 V1 范围
（同 v1.1，略）

---

## 四、已知风险（更新）

| 风险 | 严重程度 | 当前状态 | 应对 |
|------|---------|---------|------|
| **webviewHtml.ts 2949 行模板字符串** | 🔴 高 | 所有 UI 都在一个字符串里，regex 转义脆弱，无工具链调试支持 | 拆成独立 HTML/JS 文件，或迁移到 bundled frontend |
| F08 / F01 未完成导致无法正常上手 | ~~🔴 高~~ | ✅ 两者均已完成 | — |
| Swarm UI 未接通 | 🟡 中 | 后端逻辑完整，前端卡片未连接 SwarmCoordinator 状态 | Swarm UI 是 P04 最后一块 |
| SYSTEM_PROMPT 质量低 | ~~🟡 中~~ | ✅ 已修复（Claude 2026-04-15）：从 19 行扩充为 7 个结构化 section，参考官方 `prompts.ts` 架构；Worker prompt 同步升级 | — |
| Electron 打包体积 | 🟡 中 | 阶段二问题 | Playwright 按需下载 |
| License Key 可分享 | 🟢 低 | V1 接受，Ed25519 防伪造 | V2 加设备绑定 |
| Playwright 安装失败 | 🟢 低 | 浏览器功能可选 | 首次使用时引导安装 |

---

## 五、里程碑计划（更新后）

### 当前实际进度（截至 2026-04-12）

| 任务 | 状态 |
|------|------|
| 架构拆分（7 个职责模块） | ✅ 完成 |
| 四个 Provider Adapter | ✅ 完成 |
| 全套工具（12 个内置工具）| ✅ 完成 |
| MCP 集成 | ✅ 完成 |
| 浏览器自动化 | ✅ 完成 |
| 会话持久化（P01）| ✅ 完成 |
| 多会话管理（P02）| ✅ 完成 |
| License 系统（P03）| ✅ 完成 |
| Swarm 后端（P04 核心）| ✅ 完成 |
| Swarm License 付费门控 | ✅ 完成 |
| F08 设置面板 UI | ✅ 完成 |
| F01 Onboarding | ✅ 完成 |
| Swarm UI 卡片接通 | ❌ 未完成 |
| webviewHtml.ts 重构 | ❌ 未完成 |
| SYSTEM_PROMPT 质量提升 | ✅ 完成（Claude 2026-04-15） |

---

### 剩余工作（重新排期）

#### 阶段 A：让新用户能用起来 ✅ 已完成

F01 Onboarding 和 F08 设置面板均已完整实现。`.env` fallback 代码（`// TODO: remove after F08 ships`）可以在确认设置面板稳定后删除。

---

#### 阶段 B：P04 Swarm UI 接通

**B1 · Agent 工作区面板**
- Worker 状态卡片（进行中 / 完成 / 出错）
- 实时状态通过 `SwarmCoordinator.onWorkerUpdate` 回调推送到 webview
- 点击展开完整 transcript

**B2 · 端到端验证**
- 两个不同 Provider 的 Worker 并行跑通
- Worker 通过 `send_message` 向 Coordinator 汇报
- UI 卡片实时更新

---

#### 阶段 C：稳定性与质量

**C1 · SYSTEM_PROMPT 质量提升** ✅ 已完成（Claude 2026-04-15）
- `src/agent/agentRunner.ts` — 从 19 行扩充为 7 个结构化 section（System / Doing tasks / Executing actions with care / Using your tools / Tone and style / Output efficiency / Session-specific guidance），对标官方 `prompts.ts` 架构
- `src/agent/swarm/SwarmCoordinator.ts` — Worker systemPrompt 大幅扩充，参考官方 `TEAMMATE_SYSTEM_PROMPT_ADDENDUM`，补充角色定位、通信规则（必须用 send_message）、协调约束（不并发写同一文件）、工具白名单
- 测试：无需修改（promptSetupHost.test.ts 用 vi.mock 隔离，agentRunner.test.ts 只测执行逻辑）

**C2 · webviewHtml.ts 重构**（可与 C1 并行）
- 将 2949 行模板字符串拆出，改为独立静态文件 + bundler 或安全的 HTML 生成策略
- 这是所有后续 UI 迭代的前提

---

#### 阶段 D：发布准备

- 完整功能回归测试
- 写产品介绍（GitHub README / 爱发电页面）
- License Key 批量生成脚本验证
- 发布 VS Code 插件版（手动安装 .vsix）

---

#### 阶段 E：Electron 桌面客户端（阶段 A-D 完成后）

前提：`IHostAdapter` 拆分已完成（✅），只需新增 `ElectronHostAdapter`。
- 新增 `ElectronHostAdapter` 实现 `IHostAdapter`
- 解耦 `webviewHtml.ts` 里的 `acquireVsCodeApi()` 调用
- 搭建 Electron 主进程
- 打包 Windows .exe + NSIS 安装程序
- 自动更新（electron-updater）

---

## 六、技术架构（当前实际结构）

```
vscode-extension/src/
├── extension.ts                    ✅ 只做激活和装配（1186 行，含 ChatSidebarProvider）
├── platform/
│   ├── IHostAdapter.ts             ✅ 平台抽象接口
│   └── vsCodeHostAdapter.ts        ✅ VS Code 实现
├── agent/
│   ├── agentRunner.ts              ✅ 统一执行循环，含 Swarm 工具注入（115 行）
│   ├── providers/
│   │   ├── IProviderAdapter.ts     ✅ runStep 接口
│   │   ├── anthropicAdapter.ts     ✅ SSE 流式（210 行）
│   │   ├── openAIAdapter.ts        ✅ OpenAI 兼容（290 行）
│   │   └── claudeCliAdapter.ts     ✅ 子进程（76 行）
│   └── swarm/
│       ├── SwarmCoordinator.ts     ✅ spawn/send/wait 三工具（332 行）
│       └── SwarmBus.ts             ✅ EventEmitter 总线（70 行）
├── storage/
│   ├── sessionRepository.ts        ✅ JSONL 追加写（126 行）
│   └── settingsRepository.ts       ✅ globalState + secrets 分离（130 行）
├── license/
│   └── licenseManager.ts           ✅ Ed25519 离线验证（109 行）
├── companion/
│   ├── companionEngine.ts          ✅ 精灵生成 + 心情系统（67 行）
│   └── companionTypes.ts           ✅ 类型定义（15 行）
├── toolRuntime.ts                  ✅ 12 个内置工具（999 行）
├── mcpRuntime.ts                   ✅ MCP 动态工具发现（439 行）
├── browserRuntime.ts               ✅ Playwright 集成（378 行）
└── webviewHtml.ts                  ⚠️ 全部 UI（2949 行，模板字符串，高风险）
```

---

## 七、商业模式（V1，同 v1.1）

| | 免费版 | 付费版 |
|-|--------|--------|
| 核心聊天功能 | ✅ | ✅ |
| 文件操作 | ✅ | ✅ |
| 命令执行 | ✅ | ✅ |
| 浏览器控制 | ✅ | ✅ |
| MCP 工具 | ✅ | ✅ |
| 多 Provider | ✅ | ✅ |
| **会话持久化** | ❌ | ✅ |
| **多会话管理** | ❌ | ✅ |
| **对话导出** | ❌ | ✅ |
| **多 Agent 协作（跨 LLM 派发子 Agent）** | ❌ | ✅ |
| 定价 | 永久免费 | ¥99 买断 / ¥29/月 |

---

## 八、成功标准（V1）

- [ ] 新用户从安装到发出第一条消息 ≤ 3 分钟（**当前不满足，F01/F08 未完成**）
- [ ] 核心工具（读写文件、命令执行、浏览器）可以完整工作（✅ 已满足）
- [ ] 付费 License Key 激活后，会话持久化正常工作（✅ 后端已满足，待 UI 验证）
- [ ] Windows 10 / 11 上安装、运行、卸载无错误
- [ ] 打包后 .exe 安装包大小 ≤ 200MB
- [ ] 第一个月获得 10 个以上付费用户

---

*本 Spec 一经确认，即为实现基准。功能变更需重新过 Challenge 流程。*
