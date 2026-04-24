# X02 · 用户建模（超越官方）

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现（Phase 3 完成后）  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

官方 Claude Code 没有用户建模能力。KainClaw 在会话结束后 fire-and-forget 提炼用户画像，下次对话时注入 `<user_profile>` 上下文，让 agent 的响应从第一句话就能体现对这个人的了解：

- 知道他擅长 TypeScript 不擅长 CSS，不需要每次解释基础概念
- 知道他偏好简洁代码、讨厌过度注释
- 知道他最近在做的项目是什么
- 知道他经常犯哪些错误，可以主动提醒

**核心价值**：消除每次对话的"冷启动"。

---

## 二、用户画像格式

存储位置：`{globalStorageUri}/user-profile.md`

格式：Markdown，AI 可直接读取和更新。

```markdown
# 用户画像

更新时间：2026-04-15T18:00:00Z

## 技术栈与熟悉程度

- TypeScript：熟练，无需解释基础语法
- React：中级，需要提醒 hooks 依赖数组陷阱
- CSS / 布局：薄弱，建议给出完整代码而非描述
- Go：不熟悉，需要解释基本概念
- Node.js / 后端：中级

## 编码风格偏好

- 偏好简洁函数，讨厌过度封装
- 不喜欢大量注释，更倾向于自文档化代码
- 倾向于函数式风格，避免 class
- 强烈偏好 TypeScript strict mode

## 高频错误模式

- 忘记处理 async/await 的错误边界
- tsconfig 路径别名配置经常出错
- 倾向于在 useEffect 里写过多逻辑

## 当前项目上下文

- 主项目：KainClaw VS Code 扩展（`E:/claudecodejingiang/vscode-extension`）
- 近期重心：Phase 2 收尾 + Phase 3 spec 写作
- 当前技术挑战：extension.ts 宿主层减债

## 沟通风格

- 偏好直接给代码，少说废话
- 接受技术深度较高的解释
- 对中文响应的接受度高
```

---

## 三、提炼流程

### 3.1 触发时机

会话结束时（用户关闭 panel 或开启新会话）+ 达到 20 轮对话阈值时，触发 fire-and-forget 提炼。

与 auto-memory 的区别：
- auto-memory 提炼项目相关记忆（工作区上下文）
- user-modeling 提炼跨工作区的人物画像（用户维度）

### 3.2 提炼 Prompt

```
分析以下对话，提炼用户的技术画像。
重点关注：1) 技术栈和熟悉程度；2) 编码风格偏好；3) 高频错误模式；4) 当前项目上下文。

如果用户画像已有内容，只输出需要新增或修改的部分（delta），格式为：
ADD: <section> | <item>
MODIFY: <section> | <old> → <new>
REMOVE: <section> | <item>

不要输出没有新信息的 section。如果本次对话没有新信息，输出 "NO_CHANGES"。

<conversation>
{conversationHistory}
</conversation>

<existing_profile>
{existingProfile}
</existing_profile>
```

### 3.3 ProfileStore

新文件：`src/userModel/profileStore.ts`

```typescript
export class ProfileStore {
  constructor(private readonly storageRoot: string) {}

  async load(): Promise<string | null>;              // 读取 user-profile.md
  async save(content: string): Promise<void>;        // 覆盖写
  async applyDelta(delta: string): Promise<void>;    // 解析 delta 指令并更新
}
```

### 3.4 ProfileDistiller

新文件：`src/userModel/profileDistiller.ts`

```typescript
export async function distillUserProfile(
  conversationHistory: ConversationMessage[],
  profileStore: ProfileStore,
  provider: IProviderAdapter,
): Promise<void>;  // fire-and-forget，错误只记日志
```

---

## 四、注入方式

在 `promptSetupHost.ts` 的 workspace system prompt 组合阶段，检查 `user-profile.md` 是否存在：

```
[全局 system prompt]

<user_profile>
{user-profile.md 内容}
</user_profile>

[其余上下文]
```

注入条件：
- `user-profile.md` 存在且非空
- 当前 prompt 不是系统命令（`/compact` 等）

注入位置：紧接在全局 system prompt 之后，在 workspace context 之前。

---

## 五、隐私设计

- 用户画像只存本地（`globalStorageUri`），不上传任何数据
- `/memory profile` 命令可查看当前画像内容
- `/memory profile clear` 命令可清空画像，阻止提炼
- `settings.json` 支持 `"userModeling.enabled": false` 开关，关闭后既不提炼也不注入

---

## 六、架构变更

### 新增文件

```
src/userModel/
├── profileStore.ts           # 画像 CRUD
├── profileDistiller.ts       # 提炼逻辑
└── profileDistiller.test.ts  # 单元测试（mock provider）
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/autoMemoryHost.ts` | 会话结束时触发 `distillUserProfile` fire-and-forget |
| `src/promptSetupHost.ts` | 注入 `<user_profile>` 块 |
| `src/promptCommandHost.ts` | `/memory profile` 和 `/memory profile clear` 命令 |
| `src/extension.ts` | 构造 `ProfileStore`，传给 autoMemoryHost 和 promptSetupHost |

---

## 七、不在本 spec 范围内

- 画像 GUI 编辑界面
- 团队画像共享
- 基于画像的主动建议推送
- 画像加密存储

---

## 八、验收标准

- [ ] 会话结束后触发提炼，`user-profile.md` 更新
- [ ] 连续多次提炼时，delta 指令能正确合并而不是整段覆盖
- [ ] `promptSetupHost` 注入 `<user_profile>` 后，agent 响应能体现对用户的了解
- [ ] `settings.json` 关闭 `userModeling.enabled` 后，不再提炼也不注入
- [ ] `/memory profile clear` 清空画像文件
- [ ] `profileDistiller.test.ts` 覆盖：有变更 / 无变更 / delta 合并 / provider 错误 路径
- [ ] `npm test` / `npm run check` / `npm run build` 全部通过
