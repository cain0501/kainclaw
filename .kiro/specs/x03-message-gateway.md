# X03 · 消息平台 Gateway（超越官方）

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现（Windows 客户端完成后）  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

官方 Claude Code 没有消息平台集成。KainClaw 通过 Gateway 模块，让用户能在微信、钉钉等平台直接与 KainClaw agent 对话，不需要打开 VS Code。

**使用场景**：
- 在手机微信里问 "上次那个 tsconfig 问题怎么解决的"
- 在钉钉里触发 "帮我检查一下 main 分支今天的提交"
- 离开电脑时随时发起简单的代码咨询

**核心价值**：把 KainClaw 从桌面工具变成随时可用的 AI 助手。

---

## 二、实现路径

### 优先级 1：钉钉 Outgoing Webhook（最快验证）

**为什么先做钉钉**：钉钉有官方 Outgoing Webhook 机制，配置简单，10 分钟可跑通，不需要个人账号协议。适合快速验证整体架构。

**工作流程**：
```
用户在钉钉群发消息 @KainClaw <prompt>
    → 钉钉推送 POST 到 KainClaw 本地 Gateway（localhost:52359）
    → Gateway 调用 KainClaw agent 处理
    → 返回响应，通过钉钉 Outgoing Webhook 回写
```

### 优先级 2：微信（iLink Bot 协议）

**技术方案**：基于 `Tencent/openclaw-weixin`（腾讯 iLink Bot 协议）
- 二维码扫码登录个人微信
- 本地 HTTP 长轮询 `getUpdates` 接收消息
- `sendMessage` 回写给发送者

**这不是逆向方案**：iLink Bot 是腾讯官方开放的机器人协议，用于企业内部机器人场景，非灰色方案。

### 优先级 3：企业微信（商业化升级）

使用企业微信官方 REST API，适合商业化后的团队订阅场景。

---

## 三、架构设计

### 3.1 Gateway 进程模型

Gateway 作为 Windows 客户端的内置子模块运行（不是 VS Code 扩展的一部分）：

```
KainClaw Windows 客户端
├── 主窗口（对话 UI）
├── Local Bridge localhost:52358（Office Add-in 接入）
└── Message Gateway localhost:52359（消息平台接入）
        │
        ├── 钉钉 Outgoing Webhook Handler
        ├── 微信 iLink Bot Polling Loop
        └── Agent Request Router
                │
                └── KainClaw Agent Runtime（复用现有 provider + tool 层）
```

### 3.2 Gateway 核心接口

新文件（Windows 客户端项目）：`src/gateway/messageGateway.ts`

```typescript
export class MessageGateway {
  constructor(private readonly port: number, private readonly agentRunner: AgentRuntime) {}

  async start(): Promise<void>;
  async stop(): Promise<void>;

  registerHandler(platform: "dingtalk" | "weixin" | "wxwork", handler: PlatformHandler): void;
}

export interface PlatformHandler {
  name: string;
  // 验证平台签名
  verifySignature(req: IncomingMessage): boolean;
  // 解析平台消息为统一格式
  parseMessage(body: unknown): GatewayMessage;
  // 发送回复到平台
  sendReply(message: GatewayMessage, reply: string): Promise<void>;
}

export type GatewayMessage = {
  platform: string;
  senderId: string;         // 发送者 ID（平台相关）
  senderName: string;
  conversationId: string;   // 群/单聊 ID
  prompt: string;           // 提取出的 prompt 内容（去掉 @KainClaw 前缀）
  attachments?: string[];   // 图片 URL 等
  timestamp: number;
};
```

### 3.3 钉钉 Handler 设计

文件：`src/gateway/handlers/dingtalkHandler.ts`

验签：HMAC-SHA256 + timestamp，与钉钉官方文档一致。

消息格式支持：
- `text`（纯文字，最常见）
- `markdown`（回复支持 markdown 格式）

@过滤：钉钉 Outgoing Webhook 会把 `@机器人名` 包含在消息里，解析时去掉前缀。

回复格式：
```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "KainClaw",
    "text": "{reply 内容}"
  }
}
```

### 3.4 微信 Handler 设计

文件：`src/gateway/handlers/weixinHandler.ts`

登录流程：
1. 调用 iLink Bot API 获取二维码
2. 展示在 KainClaw 设置面板（Windows 客户端）
3. 用户扫码授权，获得 session token
4. 持久化 session token 到 `globalStorageUri`

轮询循环：
```typescript
while (this.running) {
  const updates = await this.client.getUpdates({ timeout: 30 });
  for (const update of updates) {
    if (this.shouldHandle(update)) {
      const reply = await this.agentRunner.run(update.message.text);
      await this.client.sendMessage(update.chat.id, reply);
    }
  }
}
```

@过滤：只响应被 @KainClaw 的消息，或私信消息。

### 3.5 Agent Runtime 适配

Gateway 调用 agent 时，使用独立的 session context（不混入 VS Code 主对话）：
- 每个 platform + conversationId 组合对应一个独立 session
- session 持久化到 `{globalStorageUri}/gateway-sessions/{platform}/{conversationId}.json`
- agent 能访问所有正常工具（read_file、run_command 等）
- 工具执行结果回写到平台消息

---

## 四、安全设计

- 钉钉 Handler 强制验签，拒绝无签名请求
- 微信 session token 加密存储
- 工具白名单：默认只允许 `read_file / glob_files / search_files / SearchTool`；执行 `run_command` 需要在设置里手动开启
- 速率限制：单用户每分钟最多 5 次请求，防止滥用
- 工作区绑定：Gateway 只能操作用户手动配置的 `allowedWorkspaces` 列表里的目录

---

## 五、配置

Gateway 配置写入 KainClaw 主设置文件：

```json
{
  "gateway": {
    "enabled": true,
    "port": 52359,
    "allowedWorkspaces": ["E:/myproject"],
    "platforms": {
      "dingtalk": {
        "enabled": true,
        "secret": "your-dingtalk-webhook-secret"
      },
      "weixin": {
        "enabled": false
      }
    },
    "toolWhitelist": ["read_file", "glob_files", "search_files"],
    "rateLimit": { "perMinute": 5 }
  }
}
```

---

## 六、不在本 spec 范围内

- 企业微信（商业化后再做）
- Slack / Teams 集成
- Gateway 的 Web 管理面板
- 多用户权限控制（当前只支持单用户个人使用）
- 消息历史同步到 VS Code 主对话

---

## 七、实现前提

- Windows 客户端主进程已建成
- Local Bridge（localhost:52358）已作为基础设施建成
- KainClaw Agent Runtime 已能在 VS Code 之外独立运行

---

## 八、验收标准

- [ ] 钉钉 @KainClaw 消息能正确触发 agent 并回复
- [ ] 钉钉签名验证：非法签名的请求返回 401
- [ ] 微信扫码登录流程完整可用，session token 持久化
- [ ] 每个 conversationId 的会话历史独立不混淆
- [ ] 速率限制：超过 5 次/分钟的请求返回友好提示
- [ ] `allowedWorkspaces` 外的工具调用被拒绝
- [ ] Gateway 停止时，所有轮询循环干净退出
