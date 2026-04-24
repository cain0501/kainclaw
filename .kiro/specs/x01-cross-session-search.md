# X01 · 跨会话搜索（超越官方）

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现（Phase 3 完成后）  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

官方 Claude Code 没有跨会话搜索能力。KainClaw 允许用户和 agent 跨历史会话搜索内容，找到三个月前某次调试的具体对话、某个曾经解决过的问题的解法。

**核心价值**：让对话历史从"存档"变成"知识库"。

---

## 二、路径选择

### 路径 A：内存倒排索引（推荐首选）

优点：零新依赖，实现简单，足够快（< 1 万条会话）  
缺点：无法全文模糊匹配，关键词精确搜索

实现：`sessionRepository.ts` 在加载会话列表时，对 message content 建 token → sessionId 倒排索引，存内存。

### 路径 B：SQLite FTS5（可选升级）

优点：全文搜索 + 相关度排序，支持中文分词（配 jieba）  
缺点：需要引入 `better-sqlite3` 原生依赖，打包体积增大  
时机：路径 A 生产验证后，如果用户有模糊搜索需求再升级

**本 spec 以路径 A 为实现基准，路径 B 作为可选升级预留接口。**

---

## 三、核心设计

### 3.1 SessionSearchIndex

新文件：`src/search/sessionSearchIndex.ts`

```typescript
export class SessionSearchIndex {
  // 建索引：对所有已加载会话的 message content 分词后建倒排
  async build(sessions: SessionSummary[]): Promise<void>;

  // 增量更新：新增/更新单条会话时调用
  async updateSession(session: SessionSummary): Promise<void>;

  // 搜索：返回匹配的会话 ID 列表，按相关度排序
  search(query: string, options?: {
    limit?: number;            // 默认 10
    workspaceRoot?: string;    // 限定工作区
    dateRange?: { from?: string; to?: string };
  }): SearchResult[];
}

export type SearchResult = {
  sessionId: string;
  title: string;
  matchCount: number;
  snippets: string[];          // 最多 3 条上下文片段
  workspaceRoot?: string;
  updatedAt: number;
};
```

### 3.2 分词策略

路径 A 采用简单分词，足够日常使用：

1. 按空格、标点、驼峰、下划线切词
2. 过滤停用词（中英文各一份小词表）
3. 小写归一化
4. 最小词长 2 字符

中文分词：按字符切 2-gram（"用户体验" → "用户"、"户体"、"体验"），准确率有限但无需外部依赖。

### 3.3 索引存储

- 内存态：`Map<string, Set<string>>`（token → Set<sessionId>）
- 不持久化到磁盘（每次扩展启动重建，全量会话 < 1 万时建索引 < 500ms）
- 增量更新：新消息追加时，调用 `updateSession` 增量写入

---

## 四、SearchTool（Agent 可调用）

新增工具，agent 在主对话中可直接搜索历史会话：

```typescript
SearchTool({
  query: string,               // 搜索关键词（支持多词 AND 语义）
  limit?: number,              // 默认 10，最大 50
  workspaceRoot?: string,      // 限定工作区，不填则搜全部
  dateFrom?: string,           // ISO 8601，限定起始日期
  dateTo?: string,             // ISO 8601，限定截止日期
})
```

返回格式：

```json
{
  "total": 3,
  "results": [
    {
      "sessionId": "sess_abc",
      "title": "Fix TypeScript import errors",
      "matchCount": 5,
      "snippets": [
        "...检查 tsconfig.json 的 paths 配置...",
        "...TS2307 Cannot find module '@/utils'..."
      ],
      "updatedAt": "2026-04-10T14:30:00Z"
    }
  ]
}
```

---

## 五、/search 命令

用户侧：

```
/search <query>
/search typescript import error
/search --workspace E:/myproject 认证失败
/search --from 2026-01-01 --to 2026-03-31 性能优化
```

输出格式：

```
找到 3 个相关会话：

1. Fix TypeScript import errors（2026-04-10）
   "...检查 tsconfig.json 的 paths 配置..."

2. Debug authentication flow（2026-03-15）
   "...JWT token 过期导致的 401..."

使用 /history <sessionId> 查看完整会话。
```

---

## 六、架构变更

### 新增文件

```
src/search/
├── sessionSearchIndex.ts      # 倒排索引核心
├── tokenizer.ts               # 分词逻辑
└── sessionSearchIndex.test.ts # 单元测试
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/storage/sessionRepository.ts` | 加载会话列表后触发 `searchIndex.build()`，`appendMessages` 后触发 `searchIndex.updateSession()` |
| `src/toolRuntime.ts` | 新增 `SearchTool` 定义和 handler |
| `src/promptCommandHost.ts` | 新增 `/search` 命令 |
| `src/extension.ts` | 构造 `SessionSearchIndex`，传给 toolContext 和 commandHost |

---

## 七、不在本 spec 范围内

- 全文模糊匹配（路径 B 升级时再做）
- 搜索结果 UI 面板
- 跨设备会话同步搜索
- 会话内容加密索引

---

## 八、验收标准

- [ ] `SessionSearchIndex.build()` 能对 1000 条会话建索引，时间 < 2 秒
- [ ] 多词 AND 搜索：`typescript error` 只返回同时含这两个词的会话
- [ ] `SearchTool` 调用返回正确的 snippet 和 matchCount
- [ ] `/search typescript import` 命令输出格式正确
- [ ] 增量更新：`appendMessages` 后新内容能被立即搜到
- [ ] `sessionSearchIndex.test.ts` 覆盖 build / search / update / multi-word / date-range 路径
- [ ] `npm test` / `npm run check` / `npm run build` 全部通过
