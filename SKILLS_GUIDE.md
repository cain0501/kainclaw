# Skills 系统完整指南

本文档说明 Claude Code 中 Skills 的工作原理、安装逻辑和运行机制，用于 Codex 理解如何在系统中应用 Skills。

---

## 📚 目录

1. [什么是 Skills](#什么是-skills)
2. [Skills vs 工具的区别](#skills-vs-工具的区别)
3. [Skills 目录结构](#skills-目录结构)
4. [Skills 安装逻辑](#skills-安装逻辑)
5. [find-skills 运行机制](#find-skills-运行机制)
6. [实际应用场景](#实际应用场景)

---

## 什么是 Skills

**Skills（技能）** 是 Claude Code 的扩展功能包，用于增强 AI 的专业能力。

### 核心特征

- **模块化**：每个 skill 是独立的功能包
- **可安装**：通过 Git 克隆或 Skills CLI 安装
- **可调用**：使用 `/skill-name` 命令调用
- **有指令**：包含 `SKILL.md` 文件定义行为

### 与工具的区别

```
┌─────────────────────────────────────────────────────────┐
│                   Claude Code 能力层次                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. 原生工具（Built-in Tools）                            │
│     • Read, Write, Edit, Bash, Grep, Glob              │
│     • WebFetch, WebSearch                               │
│     • Agent, TodoWrite                                  │
│     ├─ 特点：内置，无需安装，基础能力                       │
│     └─ 位置：Claude Code 核心代码                          │
│                                                          │
│  2. MCP 工具（MCP Tools）                                 │
│     • mcp__fetch__fetch                                 │
│     • mcp__github__* (GitHub 操作)                      │
│     • mcp__supabase__* (数据库操作)                     │
│     • mcp__pencil__* (设计工具)                         │
│     ├─ 特点：需配置 MCP 服务器，扩展能力                   │
│     └─ 位置：settings.json 配置                           │
│                                                          │
│  3. Skills（技能）                                        │
│     • /browse, /qa, /ship (gstack 套件)                │
│     • /ceo, /cto, /codex (角色专家)                     │
│     • /miniapp-design, /frontend-design (自定义)       │
│     ├─ 特点：用户安装，专业领域，工作流程                   │
│     └─ 位置：~/.claude/skills/                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 能力对比表

| 特性 | 原生工具 | MCP 工具 | Skills |
|------|---------|----------|--------|
| **安装** | ✅ 内置 | 需配置 settings.json | 需手动安装 |
| **调用方式** | 直接工具调用 | `mcp__server__tool` | `/skill-name` |
| **专业性** | 通用 | 中等 | 高度专业化 |
| **可扩展** | ❌ | ✅ | ✅ |
| **包含指令** | ❌ | ❌ | ✅ SKILL.md |
| **工作流** | 单一操作 | 单一操作 | 多步骤流程 |

---

## Skills vs 工具的区别

### 1. 原生工具（Built-in Tools）

**定义**：Claude Code 内置的基础能力

**示例**：
```javascript
// 原生工具调用
Read("/path/to/file")
Write("/path/to/file", content)
Bash("npm install")
WebFetch("https://example.com", "extract content")
```

**特点**：
- ✅ 无需安装，开箱即用
- ✅ 基础通用能力
- ❌ 不包含专业领域知识
- ❌ 无法扩展

### 2. MCP 工具（Model Context Protocol Tools）

**定义**：通过 MCP 服务器提供的外部工具

**配置方式**：
```json
// settings.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

**调用示例**：
```javascript
mcp__github__create_pull_request({
  owner: "user",
  repo: "project",
  title: "Feature X",
  head: "feature-branch",
  base: "main"
})
```

**特点**：
- ✅ 扩展外部服务能力（GitHub, Supabase 等）
- ✅ 标准化接口
- ⚠️ 需要配置和认证
- ❌ 单一操作，无工作流

### 3. Skills（技能）

**定义**：专业领域的工作流程包，包含指令、脚本和工具

**目录结构**：
```
~/.claude/skills/<skill-name>/
├── SKILL.md              # 核心指令文件（必须）
├── README.md             # 使用说明
├── setup                 # 安装脚本
├── package.json          # 依赖配置
├── src/                  # 源代码
├── dist/                 # 编译后的可执行文件
│   └── <tool>
└── bin/                  # 辅助工具
```

**调用方式**：
```bash
/browse https://example.com   # 调用 browse skill
/qa                           # 调用 qa skill
/ship                         # 调用 ship skill
```

**特点**：
- ✅ 高度专业化（测试、部署、设计等）
- ✅ 包含完整工作流程
- ✅ 可自定义和扩展
- ✅ 包含领域知识和最佳实践
- ⚠️ 需要手动安装

---

## Skills 目录结构

### 全局 Skills 目录

```
~/.claude/
└── skills/                    # 全局技能目录
    ├── browse/                # 浏览器技能
    ├── gstack/                # gstack 技能套件
    │   ├── browse/
    │   ├── qa/
    │   ├── ship/
    │   └── ...
    ├── ceo/                   # CEO 角色专家
    ├── codex/                 # Codex 代码审查
    ├── miniapp-design/        # 小程序设计
    └── find-skills/           # 技能搜索工具
```

### 项目本地 Skills 目录（可选）

```
<项目根目录>/
└── .claude/
    └── skills/                # 项目级技能
        └── custom-skill/      # 项目特定技能
```

### Skills 查找顺序

当调用 `/skill-name` 时，系统按以下顺序查找：

```
1. <项目根>/.claude/skills/<skill-name>/
   ↓ 未找到
2. ~/.claude/skills/<skill-name>/
   ↓ 未找到
3. ~/.claude/skills/gstack/<skill-name>/
   ↓ 未找到
4. 返回错误：Skill not found
```

### 典型 Skill 结构

以 `browse` skill 为例：

```
~/.claude/skills/gstack/browse/
├── SKILL.md                   # 指令定义（必须）
├── README.md                  # 文档
├── package.json               # Node.js 依赖
├── bun.lock                   # 依赖锁文件
├── setup                      # 安装脚本
├── src/                       # 源代码
│   ├── index.ts
│   ├── commands/
│   └── utils/
├── dist/                      # 编译输出
│   └── browse                 # 可执行文件
└── node_modules/              # 依赖包
```

---

## Skills 安装逻辑

### 安装方式对比

| 方式 | 命令 | 适用场景 |
|------|------|---------|
| **Git Clone** | `git clone <url> ~/.claude/skills/<name>` | 直接从 GitHub 安装 |
| **Skills CLI** | `npx skills add <owner/repo@skill>` | 从 skills.sh 生态安装 |
| **符号链接** | `ln -s /path/to/skill ~/.claude/skills/` | 共享或测试 skill |

### 完整安装流程

#### 方式 1：Git Clone 安装

**场景**：用户提供 GitHub 链接

```bash
# 步骤 1：用户请求
# "帮我安装这个 skill：https://github.com/garrylachman/gstack"

# 步骤 2：克隆仓库
cd ~/.claude/skills/
git clone https://github.com/garrylachman/gstack.git gstack

# 步骤 3：检查依赖和安装脚本
cd gstack
ls -la
# 查找：setup, install.sh, package.json, requirements.txt

# 步骤 4：安装依赖
# 如果有 setup 脚本
./setup

# 或手动安装依赖
bun install  # Node.js 项目
# 或
pip install -r requirements.txt  # Python 项目

# 步骤 5：验证安装
cat SKILL.md | head -20
ls -la dist/
./dist/<tool> --version  # 测试可执行文件

# 步骤 6：告知用户
echo "✅ gstack skill 安装完成！"
echo "包含子技能：/browse, /qa, /ship 等"
```

#### 方式 2：Skills CLI 安装

**场景**：从 skills.sh 生态安装

```bash
# 步骤 1：搜索 skill
npx skills find <query>

# 步骤 2：安装 skill
npx skills add <owner/repo@skill> -g -y
# -g: 全局安装到 ~/.claude/skills/
# -y: 自动确认，跳过提示

# 步骤 3：验证
ls -la ~/.claude/skills/
```

### 依赖处理

#### Node.js/Bun 项目

```bash
# 检查依赖
cat package.json

# 安装依赖
bun install
# 或
npm install

# 构建（如果需要）
bun run build
# 或
npm run build
```

#### Python 项目

```bash
# 检查依赖
cat requirements.txt

# 安装依赖
pip install -r requirements.txt
# 或
python -m pip install -r requirements.txt
```

#### 纯脚本项目

```bash
# 只需要确保脚本有执行权限
chmod +x ~/.claude/skills/<skill-name>/*.sh
chmod +x ~/.claude/skills/<skill-name>/bin/*
```

### 常见安装问题

#### 问题 1：缺少 Git

```bash
# Windows
winget install Git.Git

# Mac
brew install git

# Linux
sudo apt install git
```

#### 问题 2：缺少 Bun

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 或指定版本
curl -fsSL https://bun.sh/install | BUN_VERSION=1.3.10 bash
```

#### 问题 3：权限错误

```bash
# 赋予执行权限
chmod +x ~/.claude/skills/<skill-name>/setup
chmod +x ~/.claude/skills/<skill-name>/dist/*
chmod +x ~/.claude/skills/<skill-name>/bin/*
```

#### 问题 4：端口冲突（浏览器类 skill）

```bash
# 检查端口占用
lsof -i :9222  # macOS/Linux
netstat -ano | findstr :9222  # Windows

# 停止占用进程
kill -9 <PID>  # macOS/Linux
taskkill /F /PID <PID>  # Windows
```

---

## find-skills 运行机制

### 概述

**find-skills** 是一个特殊的 skill，用于帮助用户发现和安装其他 skills。

**位置**：`~/.claude/skills/find-skills/SKILL.md`

**特点**：
- 纯指令型 skill（只有 SKILL.md，无代码）
- 依赖外部工具：`npx skills` CLI
- 连接 skills.sh 开放生态

### 触发条件

用户说以下任何一种话，我都会调用 find-skills：

1. **明确提到**：
   - "用 find-skills 帮我找..."
   - "find-skills 搜索..."

2. **隐式需求**：
   - "如何做 X？"（X 可能有现成 skill）
   - "有没有 X 的技能？"
   - "能帮我找 X 相关的工具吗？"
   - "我需要 X 方面的帮助"

3. **领域询问**：
   - "怎么测试我的应用？" → 触发搜索 testing
   - "如何部署到 Vercel？" → 触发搜索 vercel deploy
   - "怎么优化 React 性能？" → 触发搜索 react performance

### 完整执行流程

#### 步骤 1：调用 Skill

```javascript
// 我会调用 Skill 工具
Skill({
  skill: "find-skills",
  args: ""
})
```

这会将 `~/.claude/skills/find-skills/SKILL.md` 的内容加载到我的上下文中。

#### 步骤 2：理解需求并提取关键词

**用户输入**：
```
"用 find-skills 帮我找一些 React 性能优化的技能"
```

**我的分析**：
- 领域：Web Development
- 具体任务：性能优化
- 技术栈：React
- **提取关键词**：`react performance` 或 `react optimization`

#### 步骤 3：执行搜索命令

```bash
# 使用 Bash 工具执行
npx skills find react performance
```

**命令分解**：
- `npx` - 运行 npm 包，无需全局安装
- `skills` - Skills CLI 包
- `find` - 搜索子命令
- `react performance` - 搜索关键词

#### 步骤 4：解析搜索结果

**典型输出**：
```
Install with npx skills add <owner/repo@skill>

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices

ComposioHQ/awesome-claude-skills@react-optimization
└ https://skills.sh/ComposioHQ/awesome-claude-skills/react-optimization
```

**我的解析**：
```javascript
results = [
  {
    package: "vercel-labs/agent-skills@vercel-react-best-practices",
    url: "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices",
    install: "npx skills add vercel-labs/agent-skills@vercel-react-best-practices"
  },
  {
    package: "ComposioHQ/awesome-claude-skills@react-optimization",
    url: "https://skills.sh/ComposioHQ/awesome-claude-skills/react-optimization",
    install: "npx skills add ComposioHQ/awesome-claude-skills@react-optimization"
  }
]
```

#### 步骤 5：格式化并呈现

**我的回复**：
```markdown
我找到了 2 个 React 性能优化相关的技能：

## 1. vercel-react-best-practices
来自 Vercel Engineering 的 React 和 Next.js 性能优化指南

**安装命令：**
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -g -y

**了解更多：**
https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices

---

## 2. react-optimization
React 应用性能优化技能包

**安装命令：**
npx skills add ComposioHQ/awesome-claude-skills@react-optimization -g -y

**了解更多：**
https://skills.sh/ComposioHQ/awesome-claude-skills/react-optimization

---

要我帮你安装哪一个吗？
```

#### 步骤 6：等待用户决策

**用户响应 A："安装第一个"**

```bash
# 执行安装
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -g -y

# 验证安装
ls -la ~/.claude/skills/ | grep react

# 读取 SKILL.md
cat ~/.claude/skills/vercel-react-best-practices/SKILL.md

# 告知用户
"✅ 安装成功！使用 /vercel-react-best-practices 调用"
```

**用户响应 B："告诉我更多"**

```bash
# 获取详细信息
npx skills info vercel-labs/agent-skills@vercel-react-best-practices

# 或打开网页
open https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

**用户响应 C："算了"**

```
好的，如果以后需要，随时告诉我！

你也可以浏览完整的技能库：https://skills.sh/
```

### 搜索策略

#### 关键词提取规则

| 用户问题 | 提取关键词 | 原因 |
|---------|-----------|------|
| "如何优化 React 性能？" | `react performance` | 领域 + 任务 |
| "怎么做 PR 审查？" | `pr review` | 直接任务 |
| "部署到 Vercel" | `vercel deploy` | 平台 + 操作 |
| "测试 Next.js 应用" | `nextjs testing` | 框架 + 任务 |
| "生成 changelog" | `changelog` | 单一任务 |

#### 搜索技巧

**✅ 好的搜索**：
```bash
npx skills find react testing          # 具体：领域 + 任务
npx skills find vercel deploy          # 明确：平台 + 操作
npx skills find pr review              # 清晰：缩写 + 任务
npx skills find nextjs performance     # 组合：框架 + 目标
```

**❌ 不好的搜索**：
```bash
npx skills find help                   # 太宽泛
npx skills find testing                # 太通用
npx skills find how to                 # 非技术词
npx skills find good code              # 抽象概念
```

#### 常见领域的搜索关键词

| 领域 | 推荐关键词 |
|------|-----------|
| **Web 开发** | react, nextjs, typescript, css, tailwind, vue |
| **测试** | testing, jest, playwright, e2e, unit-test |
| **部署运维** | deploy, docker, kubernetes, ci-cd, vercel |
| **文档** | docs, readme, changelog, api-docs |
| **代码质量** | review, lint, refactor, best-practices |
| **设计** | ui, ux, design-system, accessibility, figma |
| **生产力** | workflow, automation, git, task-management |

### 无结果处理

**当搜索无结果时**：

```markdown
我搜索了 "xyz" 相关的技能，但没有找到匹配结果。

不过我可以直接帮你处理这个任务！要我继续吗？

如果这是你经常做的事情，可以考虑创建自定义技能：
npx skills init my-xyz-skill
```

### Skills CLI 完整命令

```bash
# 搜索 skills
npx skills find <query>

# 安装 skill
npx skills add <owner/repo@skill> [options]
  -g, --global        # 全局安装到 ~/.claude/skills/
  -y, --yes           # 跳过确认提示
  -p, --path <path>   # 安装到指定路径

# 查看 skill 详情
npx skills info <owner/repo@skill>

# 检查更新
npx skills check

# 更新所有 skills
npx skills update

# 创建新 skill
npx skills init <skill-name>

# 列出已安装的 skills
npx skills list

# 卸载 skill
npx skills remove <skill-name>
```

---

## 实际应用场景

### 场景 1：用户想要浏览器测试

**对话流程**：

```
用户: "怎么测试我的网页？"

我: [识别到测试需求，但先用 find-skills 搜索]

执行: npx skills find browser testing

结果: 找到 /browse skill（来自 gstack）

我: "我找到了 browse skill，可以用无头浏览器测试网页。
    要安装吗？"

用户: "好的"

执行: npx skills add garrylachman/gstack -g -y

我: "✅ 安装完成！试试：/browse https://your-site.com"

用户: "/browse https://example.com"

我: [调用 browse skill，展示页面内容和截图]
```

### 场景 2：用户需要 PR 审查

```
用户: "帮我审查这个 PR"

我: [识别到 PR 审查需求]

执行: npx skills find pr review

结果: 找到 /review skill 和 /codex skill

我: "我找到了两个审查技能：
    1. /review - 自动 PR 审查
    2. /codex - 深度代码审查
    
    要安装哪个？"

用户: "两个都装"

执行:
  npx skills add gstack@review -g -y
  npx skills add gstack@codex -g -y

我: "✅ 都安装好了！
    • /review - 快速检查 SQL 注入、测试覆盖等
    • /codex - 独立技术评审，给出改进建议"
```

### 场景 3：用户想要部署流程

```
用户: "有没有一键部署的工具？"

我: [识别到部署需求]

执行: npx skills find deploy workflow

结果: 找到 /ship 和 /land-and-deploy

我: "找到两个部署工作流：
    
    1. /ship - 完整发布流程
       • 合并 base 分支
       • 运行测试
       • 审查 diff
       • 构建项目
       • 推送并创建 PR
    
    2. /land-and-deploy - 部署监控流程
       • 合并 PR
       • 等待 CI
       • 监控部署
       • 验证上线
    
    要安装哪个？"

用户: "都要"

执行:
  npx skills add gstack@ship -g -y
  npx skills add gstack@land-and-deploy -g -y

我: "✅ 安装完成！
    • /ship - 发布前使用
    • /land-and-deploy - 合并后使用"
```

### 场景 4：自定义 skill 创建

```
用户: "我想创建一个自动生成文档的 skill"

我: [识别到创建需求]

执行: npx skills find docs generator

结果: 找到一些相关的，但不完全匹配

我: "我找到了一些文档相关的 skills，但不完全符合你的需求。
    
    你可以创建自定义 skill：
    
    1. 初始化新 skill：
       npx skills init auto-docs
    
    2. 编辑 SKILL.md 定义行为
    
    3. 添加脚本和工具
    
    4. 测试并使用 /auto-docs 调用
    
    要我帮你开始吗？"

用户: "好的"

执行:
  cd ~/.claude/skills/
  npx skills init auto-docs

我: "✅ 已创建 ~/.claude/skills/auto-docs/
    
    下一步：
    1. 编辑 SKILL.md - 定义文档生成流程
    2. 添加脚本到 bin/ - 实现具体功能
    3. 测试 /auto-docs - 验证效果"
```

---

## 总结

### Skills 系统的核心价值

1. **扩展性**：无限扩展 AI 的专业能力
2. **模块化**：每个 skill 独立，互不干扰
3. **可定制**：用户可创建自己的 skill
4. **生态化**：skills.sh 提供开放的技能市场

### Skills 在 Claude Code 中的位置

```
用户请求
    ↓
Claude 识别需求
    ↓
    ├─→ 基础操作 → 使用原生工具（Read, Write, Bash 等）
    ├─→ 外部服务 → 使用 MCP 工具（GitHub, Supabase 等）
    └─→ 专业流程 → 调用 Skills（/browse, /qa, /ship 等）
    ↓
执行并返回结果
```

### 关键要点

1. **Skills 不是内置的**，需要手动安装
2. **find-skills 是桥梁**，连接用户需求和技能生态
3. **SKILL.md 是核心**，定义了 skill 的行为和指令
4. **Skills CLI 是工具**，简化了搜索、安装、管理流程
5. **用户可创建 skill**，满足定制化需求

---

## 参考资源

- **Skills 生态**：https://skills.sh/
- **gstack 仓库**：https://github.com/garrylachman/gstack
- **Skills CLI 文档**：`npx skills --help`
- **本机 skills 目录**：`~/.claude/skills/`

---

**文档版本**：1.0  
**更新日期**：2026-04-27  
**作者**：Claude & User  
**目标读者**：Codex，用于理解 Skills 在系统中的应用
