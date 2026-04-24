# F09 吉祥物系统 Spec — Companion

## 一、产品定位

吉祥物 = **AI 状态可视化 + 品牌记忆点 + 成长型情感设计**。
不是装饰，是用户与 AI 协作状态的第一视觉层。

---

## 二、平台适配

| 阶段 | 环境 | 表现形式 |
|---|---|---|
| v1.x | VS Code 扩展 | 浮于 sidebar 右下角，可在 sidebar 内拖动 |
| v2.x | Electron 桌面版 | 独立透明窗口，可拖到屏幕任意角落，始终置顶 |

VS Code 阶段：`position: absolute` 覆盖在 webview 内容层上方，不遮挡输入框。

Electron 阶段：`BrowserWindow({ transparent: true, frame: false, alwaysOnTop: true })`，点击穿透背景，只响应点击吉祥物本体。

---

## 三、视觉规格

- **风格**：像素风 sprite，MVP 阶段用 emoji 占位，后续换真实像素图
- **实现**：Canvas 逐帧动画（MVP 用 CSS + emoji）
- **动作集**：

| 状态 | 触发条件 | 动画描述 |
|---|---|---|
| `idle` | 无操作 | 缓慢摇尾巴/呼吸起伏，每 3s 随机眨眼 |
| `thinking` | AI 收到消息，开始处理 | 头顶出现思考气泡 💭 |
| `working` | 工具执行中 | 闪电符号 ⚡ |
| `done` | 任务完成 | 庆祝动画 🎉，持续 1.5s 后回 idle |
| `sleeping` | 无操作超过 10 分钟 | 头顶 💤 气泡 |
| `clicked` | 用户点击 | 弹跳 + 随机情绪气泡（❤️ ⚡ ✨ 😄 🎉 👾 💫） |

---

## 四、物种 & 稀有度

### 物种列表（MVP 两种，后续扩展）

- capybara（水豚）🦫
- duck（鸭子）🦆

### 稀有度概率

| 稀有度 | 概率 | 解锁条件 |
|---|---|---|
| 普通 common | 60% | 免费 |
| 非普通 uncommon | 25% | 免费 |
| 稀有 rare | 10% | 需要 License |
| 史诗 epic | 4% | 需要 License |
| 传奇 legendary | 1% | 需要 License |
| Shiny ✨ | 1% | 需要 License |

### 生成规则

从 `vscode.env.machineId` 做简单 hash，确定性映射物种 + 稀有度。
免费用户结果如果落在 rare 及以上，降级到 uncommon，数据里加 `lockedRarity: true`，初始化后 2s 显示提示气泡"🔒 激活解锁稀有度"。

---

## 五、成长系统

| 字段 | 说明 |
|---|---|
| `totalConversations` | 累计对话轮次 |
| `moodLevel` | 0–100，影响 idle 动画表现 |
| `bondLevel` | 1–10，每 20 次对话升一级 |
| `lastActiveAt` | unix timestamp，用于睡眠判断 |

**心情规则：**
- 每完成一次任务 +5
- 每次工具报错 -2
- 超过 10 分钟无操作进入 sleeping 状态

**数据持久化：** 存入 VS Code `context.globalState`。

---

## 六、交互

- **单击**：`clicked` 动画 + 随机情绪气泡
- **悬停 tooltip**：`物种名 · 稀有度 · Bond Lv.N · 心情 N/100`

---

## 七、与 AI 状态的连接

extension.ts 在以下时机 postMessage 通知 webview：

```
agent 开始处理  → { type: "companion:state", state: "thinking" }
工具开始执行    → { type: "companion:state", state: "working" }
agent 完成      → { type: "companion:state", state: "done" }
                → { type: "companion:mood", delta: 5 }
工具报错        → { type: "companion:mood", delta: -2 }
```

---

## 八、文件结构

```
vscode-extension/src/companion/
  companionTypes.ts      — 类型定义
  companionEngine.ts     — UUID→物种映射、心情计算
```

webview 端逻辑直接内联在 `webviewHtml.ts` 中（保持现有架构一致）。

---

## 九、MVP 实现范围

1. 两个物种（水豚 / 鸭子）emoji 占位 sprite
2. 5 个状态（idle / thinking / working / done / sleeping）
3. 状态机连通 AI 执行状态（thinking → working → done）
4. 单击弹跳 + 随机气泡交互
5. moodLevel / bondLevel / totalConversations 存储到 globalState
6. 稀有度生成 + 免费降级提示
7. 悬停 tooltip 显示完整信息

**v2.x 留待后续：**
- Electron 桌面浮窗（透明置顶窗口）
- 真实像素风 sprite 图（替换 emoji）
- 多物种（龙 / 猫 / 机器人等）
- 可在 sidebar 内拖动

---

## 十、验收标准

1. `npm run build` 通过
2. 侧边栏右下角出现 🦫 或 🦆
3. 发一条消息 → 吉祥物变 💭 → 工具执行时变 ⚡ → 完成变 🎉（1.5s）→ 回 idle
4. 点击吉祥物 → 弹跳 + 随机气泡
5. 静置 10 分钟 → 出现 💤
6. 悬停显示 tooltip（物种 + 稀有度 + Bond + 心情）
7. 无 License 时稀有度最高为 uncommon，显示"🔒 激活解锁稀有度"提示
