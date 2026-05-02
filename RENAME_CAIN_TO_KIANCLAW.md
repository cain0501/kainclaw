# 改名方案：cain → kianclaw

**目标**：将项目中所有 "cain" 相关的命名统一改为 "kianclaw"，实现品牌和代码的一致性。

**执行者**：Codex  
**方案版本**：1.0  
**创建日期**：2026-04-28

---

## 📋 目录

1. [改名范围](#改名范围)
2. [替换规则](#替换规则)
3. [详细改动清单](#详细改动清单)
4. [数据迁移方案](#数据迁移方案)
5. [测试验证](#测试验证)
6. [回滚方案](#回滚方案)

---

## 改名范围

### 需要替换的内容

| 类型 | 旧名称 | 新名称 | 影响范围 |
|------|--------|--------|---------|
| **目录名** | `.cain/` | `.kianclaw/` | 配置文件目录 |
| **目录名** | `.cain-artifacts/` | `.kianclaw-artifacts/` | Artifacts 存储 |
| **配置文件** | `.cain-mcp.json` | `.kianclaw-mcp.json` | MCP 配置 |
| **环境变量** | `CAIN_PRIVATE_KEY` | `KIANCLAW_PRIVATE_KEY` | License 私钥 |
| **License 前缀** | `CAIN-` | `KIANCLAW-` | License key 格式 |
| **存储键** | `cain.*` | `kianclaw.*` | Electron 状态存储 |
| **项目名称** | `Cain Claude` | `KianClaw` | UI 和文档 |
| **临时目录前缀** | `cain-*` | `kianclaw-*` | 测试临时目录 |

---

## 替换规则

### 规则 1：路径字符串替换

```typescript
// 旧代码
".cain"              → ".kianclaw"
".cain-artifacts"    → ".kianclaw-artifacts"
".cain-mcp.json"     → ".kianclaw-mcp.json"
"cain-context-"      → "kianclaw-context-"
"cain-memory-"       → "kianclaw-memory-"
"cain-automemory-"   → "kianclaw-automemory-"
"cain-background-host-" → "kianclaw-background-host-"
"cain-mentions-"     → "kianclaw-mentions-"
```

### 规则 2：存储键替换

```typescript
// 旧代码
"cain.licenseKey"              → "kianclaw.licenseKey"
"cain.localBridgeSessionId"    → "kianclaw.localBridgeSessionId"
"cain.localBridgeAuthToken"    → "kianclaw.localBridgeAuthToken"
```

### 规则 3：环境变量替换

```bash
# 旧代码
CAIN_PRIVATE_KEY               → KIANCLAW_PRIVATE_KEY
process.env["CAIN_PRIVATE_KEY"] → process.env["KIANCLAW_PRIVATE_KEY"]
```

### 规则 4：License 格式替换

```typescript
// 旧代码
return "CAIN-" + base32Encode(combined)
// 新代码
return "KIANCLAW-" + base32Encode(combined)

// 注释中的说明
"CAIN-xxx" → "KIANCLAW-xxx"
```

### 规则 5：UI 和文档替换

```
Cain Claude          → KianClaw
CAIN                 → KIANCLAW (全大写场景)
cain                 → kianclaw (全小写场景)
Cain                 → KianClaw (首字母大写场景)
```

### ⚠️ 不要替换的内容

```
❌ 不要改 node_modules/ 下的任何内容
❌ 不要改 .omx/logs/ 历史日志文件
❌ 不要改 Git 历史记录
❌ 不要改 pencil-new.pen 设计文件中的历史内容（可选）
```

---

## 详细改动清单

### 第一阶段：核心源码（9 个文件）⭐ 必须改

#### 1. `vscode-extension/src/autoMemory/paths.ts`

**改动位置：**
```typescript
// 第 8 行
- const MEMORY_ROOT_SEGMENTS = [".cain", "projects"] as const;
+ const MEMORY_ROOT_SEGMENTS = [".kianclaw", "projects"] as const;
```

**影响**：自动记忆存储路径，从 `.cain/projects/` 改为 `.kianclaw/projects/`

---

#### 2. `vscode-extension/src/browserRuntime.ts`

**改动位置：**
```typescript
// 约第 285 行
-       : `.cain-artifacts/browser/screenshot-${Date.now()}.png`;
+       : `.kianclaw-artifacts/browser/screenshot-${Date.now()}.png`;
```

**影响**：浏览器截图存储路径

---

#### 3. `vscode-extension/src/contextRegistry.ts`

**改动位置：**
```typescript
// 约第 16 行
- ".cain",
+ ".kianclaw",

// 约第 22 行
- return path.join(workspaceRoot, ".cain", "context.json");
+ return path.join(workspaceRoot, ".kianclaw", "context.json");
```

**影响**：Context 配置文件路径

---

#### 4. `vscode-extension/src/customAgentsRegistry.ts`

**改动位置：**
```typescript
// getCustomAgentsConfigPath 函数内
- return path.join(workspaceRoot, ".cain", "agents.json");
+ return path.join(workspaceRoot, ".kianclaw", "agents.json");
```

**影响**：Custom Agents 配置文件路径

---

#### 5. `vscode-extension/src/customSkillsRegistry.ts`

**改动位置：**
```typescript
// getCustomSkillsConfigPath 函数内
- return path.join(workspaceRoot, ".cain", "skills.json");
+ return path.join(workspaceRoot, ".kianclaw", "skills.json");
```

**影响**：Custom Skills 配置文件路径

---

#### 6. `vscode-extension/src/hooksRegistry.ts`

**改动位置：**
```typescript
// getHooksConfigPath 函数内
- return path.join(workspaceRoot, ".cain", "hooks.json");
+ return path.join(workspaceRoot, ".kianclaw", "hooks.json");
```

**影响**：Hooks 配置文件路径

---

#### 7. `vscode-extension/src/extension.ts`

**改动位置：**
```typescript
// MCP 配置文件候选列表
- for (const candidate of [".mcp.json", ".cain-mcp.json"]) {
+ for (const candidate of [".mcp.json", ".kianclaw-mcp.json"]) {
```

**影响**：MCP 配置文件查找

**建议**：可以保留兼容性：
```typescript
for (const candidate of [".mcp.json", ".kianclaw-mcp.json", ".cain-mcp.json"]) {
  // 同时支持新旧两个文件名，优先使用新文件名
}
```

---

#### 8. `vscode-extension/src/mcpRuntime.ts`

**改动位置：**
```typescript
// 配置文件候选列表常量
- const CONFIG_CANDIDATES = [".mcp.json", ".cain-mcp.json"];
+ const CONFIG_CANDIDATES = [".mcp.json", ".kianclaw-mcp.json"];
```

**建议**：同样可以保留兼容性：
```typescript
const CONFIG_CANDIDATES = [".mcp.json", ".kianclaw-mcp.json", ".cain-mcp.json"];
```

---

#### 9. `vscode-extension/src/planMode/planMode.ts`

**改动位置：**
```typescript
// Plans 目录路径
- const PLAN_ROOT_SEGMENTS = [".cain-artifacts", "plans"] as const;
+ const PLAN_ROOT_SEGMENTS = [".kianclaw-artifacts", "plans"] as const;
```

**影响**：计划文件存储路径

---

### 第二阶段：License 和密钥（4 个文件）⭐ 建议改

#### 10. `vscode-extension/scripts/generateLicense.ts`

**改动位置：**
```typescript
// 约第 25-30 行 - 环境变量名和错误提示
- // ⚠️  CAIN_PRIVATE_KEY 环境变量未设置时直接报错，不提供任何默认值。
+ // ⚠️  KIANCLAW_PRIVATE_KEY 环境变量未设置时直接报错，不提供任何默认值。

- const rawPrivateKeyHex = process.env["CAIN_PRIVATE_KEY"];
+ const rawPrivateKeyHex = process.env["KIANCLAW_PRIVATE_KEY"];

- console.error("错误：必须设置 CAIN_PRIVATE_KEY 环境变量。");
- console.error("示例：CAIN_PRIVATE_KEY=<hex> npx ts-node scripts/generateLicense.ts");
+ console.error("错误：必须设置 KIANCLAW_PRIVATE_KEY 环境变量。");
+ console.error("示例：KIANCLAW_PRIVATE_KEY=<hex> npx ts-node scripts/generateLicense.ts");

// 约第 67-69 行 - License 前缀
- // Key = signature(64 bytes) + payload(7 bytes) → Base32 → 前缀 CAIN-
+ // Key = signature(64 bytes) + payload(7 bytes) → Base32 → 前缀 KIANCLAW-

- return "CAIN-" + base32Encode(combined);
+ return "KIANCLAW-" + base32Encode(combined);
```

---

#### 11. `vscode-extension/src/license/licenseManager.ts`

**改动位置：**
```typescript
// License 格式验证相关
// 搜索所有 "CAIN-" 字符串并替换为 "KIANCLAW-"
// 搜索所有 "CAIN_PRIVATE_KEY" 并替换为 "KIANCLAW_PRIVATE_KEY"

// 具体位置需要查看代码，可能在：
// - License 格式校验正则
// - 错误消息
// - 注释说明
```

---

#### 12. `vscode-extension/electron/main.ts`

**改动位置：**
```typescript
// 约第 133-138 行 - 本地桥接存储键
- loadSessionId: () => host.getState<string>("cain.localBridgeSessionId"),
- saveSessionId: sessionId => host.setState("cain.localBridgeSessionId", sessionId),
+ loadSessionId: () => host.getState<string>("kianclaw.localBridgeSessionId"),
+ saveSessionId: sessionId => host.setState("kianclaw.localBridgeSessionId", sessionId),

- loadAuthToken: () => host.getState<string>("cain.localBridgeAuthToken"),
- saveAuthToken: authToken => host.setState("cain.localBridgeAuthToken", authToken),
+ loadAuthToken: () => host.getState<string>("kianclaw.localBridgeAuthToken"),
+ saveAuthToken: authToken => host.setState("kianclaw.localBridgeAuthToken", authToken),
```

**⚠️ 重要**：这会导致现有用户的会话和认证状态丢失，需要添加迁移逻辑：

```typescript
// 迁移旧的存储键
loadSessionId: () => {
  const newKey = host.getState<string>("kianclaw.localBridgeSessionId");
  if (newKey) return newKey;
  
  // 尝试从旧键迁移
  const oldKey = host.getState<string>("cain.localBridgeSessionId");
  if (oldKey) {
    host.setState("kianclaw.localBridgeSessionId", oldKey);
    host.deleteState("cain.localBridgeSessionId");
    return oldKey;
  }
  return undefined;
},
```

---

#### 13. `vscode-extension/electron/ElectronChatPanel.ts`

**改动位置：**
```typescript
// 约第 962 行 - License 存储
- await this.host.storeSecret("cain.licenseKey", rawKey);
+ await this.host.storeSecret("kianclaw.licenseKey", rawKey);

// 约第 1764 行 - License 删除
- await this.host.deleteSecret("cain.licenseKey");
+ await this.host.deleteSecret("kianclaw.licenseKey");

// 搜索所有 "cain.licenseKey" 并替换为 "kianclaw.licenseKey"
```

**⚠️ 重要**：同样需要添加迁移逻辑：

```typescript
// 读取 License 时先尝试新键，再尝试旧键
const license = await this.host.getSecret("kianclaw.licenseKey") 
             || await this.host.getSecret("cain.licenseKey");

// 如果从旧键读取到，迁移到新键
if (license && !(await this.host.getSecret("kianclaw.licenseKey"))) {
  await this.host.storeSecret("kianclaw.licenseKey", license);
}
```

---

### 第三阶段：配置和文档（5 个文件）⭐ 建议改

#### 14. `.env`

**改动位置：**
```bash
# 第 9 行
- CAIN_PRIVATE_KEY=302e020100300506032b65700422042000d1925214d2ae235b75ca606aa0bfe56c85717811277f258e25d97f90846f73 npx ts-node scripts/generateLicense.ts 1 7 0
+ KIANCLAW_PRIVATE_KEY=302e020100300506032b65700422042000d1925214d2ae235b75ca606aa0bfe56c85717811277f258e25d97f90846f73 npx ts-node scripts/generateLicense.ts 1 7 0
```

---

#### 15. `.gitignore`

**改动位置：**
```gitignore
# 第 5-6 行
- .cain-mcp.json
- .cain-artifacts
+ .kianclaw-mcp.json
+ .kianclaw-artifacts
```

**建议**：可以保留兼容性：
```gitignore
.cain-mcp.json
.kianclaw-mcp.json
.cain-artifacts
.kianclaw-artifacts
```

---

#### 16. `vscode-extension/.gitignore`

**改动位置：**
```gitignore
# 第 14 行
- .cain-mcp.json
+ .kianclaw-mcp.json

# 第 20 行
- .cain-artifacts/
+ .kianclaw-artifacts/
```

同样建议保留兼容性。

---

#### 17. `vscode-extension/README.md`

**改动位置：**
```markdown
# 约第 99 行
- `.cain-mcp.json`
+ `.kianclaw-mcp.json`

# 搜索所有 "cain" 相关的说明并更新
```

---

#### 18. `vscode-extension/RELEASE_CHECKLIST.md`

**改动位置：**
```markdown
# 第 7 行
- `scripts/generateLicense.ts` 私钥已改为从 `CAIN_PRIVATE_KEY` 环境变量读取，禁止硬编码
+ `scripts/generateLicense.ts` 私钥已改为从 `KIANCLAW_PRIVATE_KEY` 环境变量读取，禁止硬编码
```

---

### 第四阶段：测试文件（14 个文件）⚠️ 可选但建议改

**统一替换规则**：

所有 `*.test.ts` 文件中：
```typescript
"cain-context-"          → "kianclaw-context-"
"cain-memory-"           → "kianclaw-memory-"
"cain-automemory-"       → "kianclaw-automemory-"
"cain-background-host-"  → "kianclaw-background-host-"
"cain-mentions-"         → "kianclaw-mentions-"
".cain"                  → ".kianclaw"
".cain-artifacts"        → ".kianclaw-artifacts"
```

**文件列表**：
1. `vscode-extension/src/autoMemory/paths.test.ts`
2. `vscode-extension/src/autoMemory/extractor.test.ts`
3. `vscode-extension/src/backgroundTaskHost.test.ts`
4. `vscode-extension/src/browserRuntime.test.ts`
5. `vscode-extension/src/compact/prompt.test.ts`
6. `vscode-extension/src/contextMentions.test.ts`
7. `vscode-extension/src/contextRegistry.test.ts`
8. `vscode-extension/src/customAgentsRegistry.test.ts`
9. `vscode-extension/src/customSkillsRegistry.test.ts`
10. `vscode-extension/src/hooksRegistry.test.ts`
11. `vscode-extension/src/inspectionHost.test.ts`
12. `vscode-extension/src/license/licenseManager.test.ts`
13. `vscode-extension/src/planMode/planMode.test.ts`
14. `vscode-extension/src/storage/sessionRepository.test.ts`

**建议**：使用批量替换命令：
```bash
# 在 vscode-extension/src/ 目录下
find . -name "*.test.ts" -type f -exec sed -i 's/cain-context-/kianclaw-context-/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/cain-memory-/kianclaw-memory-/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/cain-automemory-/kianclaw-automemory-/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/cain-background-host-/kianclaw-background-host-/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/cain-mentions-/kianclaw-mentions-/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/"\.cain"/"\.kianclaw"/g' {} +
find . -name "*.test.ts" -type f -exec sed -i 's/\.cain-artifacts/\.kianclaw-artifacts/g' {} +
```

---

### 第五阶段：UI 和文档（可选）

#### 19. `archive-md/project-root-notes/README.md`

**改动位置：**
```markdown
# 第 1 行
- # Cain Claude
+ # KianClaw

# 第 95 行
- `.cain-mcp.json`
+ `.kianclaw-mcp.json`
```

---

#### 20. `.cain-artifacts/webview-test.html`

**改动位置：**
```html
<!-- 第 10 行 -->
- <title>Cain Claude</title>
+ <title>KianClaw</title>

<!-- 第 748 行 -->
- <div class="badge">CAIN</div>
+ <div class="badge">KIANCLAW</div>
```

---

#### 21. `vscode-extension/src/autoMemory/prompt.ts`

**改动位置：**
```typescript
// 约第 36 行
- "You are the background auto-memory extraction agent for Cain Claude.",
+ "You are the background auto-memory extraction agent for KianClaw.",
```

---

#### 22. 其他文档文件

```
archive-md/agent-history/LEARNINGS.md
archive-md/knowledge-base/00-overview/project-overview.md
vscode-extension/.kiro/specs/*.md
```

**替换规则**：
```
"Cain Claude" → "KianClaw"
"Cain" → "KianClaw"（在指代项目名称时）
```

---

## 数据迁移方案

### 迁移脚本：自动迁移用户数据

创建文件：`vscode-extension/src/migration/migrateCainToKianclaw.ts`

```typescript
/**
 * 数据迁移脚本：cain → kianclaw
 * 
 * 迁移内容：
 * 1. 配置目录：.cain/ → .kianclaw/
 * 2. Artifacts 目录：.cain-artifacts/ → .kianclaw-artifacts/
 * 3. MCP 配置文件：.cain-mcp.json → .kianclaw-mcp.json
 * 4. 存储键：cain.* → kianclaw.*
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface MigrationContext {
  workspaceRoot: string;
  globalStorageRoot: string;
  getState: <T>(key: string) => T | undefined;
  setState: <T>(key: string, value: T) => Promise<void>;
  deleteState: (key: string) => Promise<void>;
  getSecret: (key: string) => Promise<string | undefined>;
  storeSecret: (key: string, value: string) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;
}

export interface MigrationResult {
  success: boolean;
  migratedItems: string[];
  errors: string[];
}

export async function migrateCainToKianclaw(
  context: MigrationContext
): Promise<MigrationResult> {
  const migratedItems: string[] = [];
  const errors: string[] = [];

  // 1. 迁移配置目录：.cain/ → .kianclaw/
  try {
    const oldConfigDir = path.join(context.workspaceRoot, ".cain");
    const newConfigDir = path.join(context.workspaceRoot, ".kianclaw");

    if (await exists(oldConfigDir) && !(await exists(newConfigDir))) {
      await fs.rename(oldConfigDir, newConfigDir);
      migratedItems.push(`.cain/ → .kianclaw/`);
    }
  } catch (error) {
    errors.push(`Failed to migrate .cain/ directory: ${error}`);
  }

  // 2. 迁移 Artifacts 目录：.cain-artifacts/ → .kianclaw-artifacts/
  try {
    const oldArtifactsDir = path.join(context.workspaceRoot, ".cain-artifacts");
    const newArtifactsDir = path.join(context.workspaceRoot, ".kianclaw-artifacts");

    if (await exists(oldArtifactsDir) && !(await exists(newArtifactsDir))) {
      await fs.rename(oldArtifactsDir, newArtifactsDir);
      migratedItems.push(`.cain-artifacts/ → .kianclaw-artifacts/`);
    }
  } catch (error) {
    errors.push(`Failed to migrate .cain-artifacts/ directory: ${error}`);
  }

  // 3. 迁移 MCP 配置文件：.cain-mcp.json → .kianclaw-mcp.json
  try {
    const oldMcpConfig = path.join(context.workspaceRoot, ".cain-mcp.json");
    const newMcpConfig = path.join(context.workspaceRoot, ".kianclaw-mcp.json");

    if (await exists(oldMcpConfig) && !(await exists(newMcpConfig))) {
      await fs.rename(oldMcpConfig, newMcpConfig);
      migratedItems.push(`.cain-mcp.json → .kianclaw-mcp.json`);
    }
  } catch (error) {
    errors.push(`Failed to migrate .cain-mcp.json file: ${error}`);
  }

  // 4. 迁移全局存储：.cain/projects/ → .kianclaw/projects/
  try {
    const oldGlobalMemory = path.join(context.globalStorageRoot, ".cain");
    const newGlobalMemory = path.join(context.globalStorageRoot, ".kianclaw");

    if (await exists(oldGlobalMemory) && !(await exists(newGlobalMemory))) {
      await fs.rename(oldGlobalMemory, newGlobalMemory);
      migratedItems.push(`Global .cain/ → .kianclaw/`);
    }
  } catch (error) {
    errors.push(`Failed to migrate global .cain/ directory: ${error}`);
  }

  // 5. 迁移 License 密钥：cain.licenseKey → kianclaw.licenseKey
  try {
    const oldLicense = await context.getSecret("cain.licenseKey");
    const newLicense = await context.getSecret("kianclaw.licenseKey");

    if (oldLicense && !newLicense) {
      await context.storeSecret("kianclaw.licenseKey", oldLicense);
      await context.deleteSecret("cain.licenseKey");
      migratedItems.push(`Secret: cain.licenseKey → kianclaw.licenseKey`);
    }
  } catch (error) {
    errors.push(`Failed to migrate license key: ${error}`);
  }

  // 6. 迁移本地桥接 Session ID
  try {
    const oldSessionId = context.getState<string>("cain.localBridgeSessionId");
    const newSessionId = context.getState<string>("kianclaw.localBridgeSessionId");

    if (oldSessionId && !newSessionId) {
      await context.setState("kianclaw.localBridgeSessionId", oldSessionId);
      await context.deleteState("cain.localBridgeSessionId");
      migratedItems.push(`State: cain.localBridgeSessionId → kianclaw.localBridgeSessionId`);
    }
  } catch (error) {
    errors.push(`Failed to migrate session ID: ${error}`);
  }

  // 7. 迁移本地桥接 Auth Token
  try {
    const oldAuthToken = context.getState<string>("cain.localBridgeAuthToken");
    const newAuthToken = context.getState<string>("kianclaw.localBridgeAuthToken");

    if (oldAuthToken && !newAuthToken) {
      await context.setState("kianclaw.localBridgeAuthToken", oldAuthToken);
      await context.deleteState("cain.localBridgeAuthToken");
      migratedItems.push(`State: cain.localBridgeAuthToken → kianclaw.localBridgeAuthToken`);
    }
  } catch (error) {
    errors.push(`Failed to migrate auth token: ${error}`);
  }

  return {
    success: errors.length === 0,
    migratedItems,
    errors,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
```

### 在扩展启动时调用迁移

修改 `vscode-extension/src/extension.ts`，在扩展激活时执行迁移：

```typescript
import { migrateCainToKianclaw } from "./migration/migrateCainToKianclaw";

export async function activate(context: vscode.ExtensionContext) {
  // 在扩展启动时执行一次性迁移
  const migrationResult = await migrateCainToKianclaw({
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
    globalStorageRoot: context.globalStorageUri.fsPath,
    getState: (key) => context.globalState.get(key),
    setState: (key, value) => context.globalState.update(key, value),
    deleteState: (key) => context.globalState.update(key, undefined),
    getSecret: (key) => context.secrets.get(key),
    storeSecret: (key, value) => context.secrets.store(key, value),
    deleteSecret: (key) => context.secrets.delete(key),
  });

  if (migrationResult.migratedItems.length > 0) {
    console.log("✅ Migrated from cain to kianclaw:", migrationResult.migratedItems);
  }

  if (migrationResult.errors.length > 0) {
    console.error("❌ Migration errors:", migrationResult.errors);
  }

  // ... 其余的激活逻辑
}
```

---

## 测试验证

### 测试清单

#### 1. 单元测试
```bash
cd vscode-extension
npm test
```

**预期**：所有测试通过，包括：
- ✅ `autoMemory/paths.test.ts` - 内存路径正确
- ✅ `browserRuntime.test.ts` - 截图路径正确
- ✅ `contextRegistry.test.ts` - Context 配置正确
- ✅ `customAgentsRegistry.test.ts` - Agents 配置正确
- ✅ `customSkillsRegistry.test.ts` - Skills 配置正确
- ✅ `hooksRegistry.test.ts` - Hooks 配置正确
- ✅ `license/licenseManager.test.ts` - License 格式正确

#### 2. 功能测试

**测试 1：配置文件读取**
1. 在项目根目录创建 `.kianclaw/` 目录
2. 添加测试配置文件：
   - `.kianclaw/context.json`
   - `.kianclaw/agents.json`
   - `.kianclaw/hooks.json`
   - `.kianclaw/skills.json`
3. 启动扩展，验证配置能正常加载

**测试 2：MCP 配置**
1. 创建 `.kianclaw-mcp.json`
2. 添加测试 MCP 服务器配置
3. 验证 MCP 服务器能正常启动

**测试 3：浏览器截图**
1. 使用浏览器工具截图
2. 验证截图保存在 `.kianclaw-artifacts/browser/`

**测试 4：计划文件**
1. 进入 Plan Mode
2. 创建计划
3. 验证计划文件保存在 `.kianclaw-artifacts/plans/`

**测试 5：License 管理**
1. 生成新 License（使用 `KIANCLAW_PRIVATE_KEY`）
2. 验证格式为 `KIANCLAW-xxx`
3. 导入 License 并验证能正常激活

**测试 6：数据迁移**
1. 手动创建旧目录：`.cain/`, `.cain-artifacts/`
2. 添加测试数据
3. 重启扩展
4. 验证数据自动迁移到新目录
5. 验证旧目录已被删除或重命名

#### 3. 回归测试

**完整功能验证**：
- ✅ 自动记忆功能正常
- ✅ Context 提及功能正常
- ✅ Custom Agents 能正常激活
- ✅ Custom Skills 能正常执行
- ✅ Hooks 能正常触发
- ✅ MCP 服务器能正常连接
- ✅ 浏览器工具能正常使用
- ✅ Plan Mode 能正常进入
- ✅ License 管理功能正常

---

## 回滚方案

如果改名后出现问题，需要回滚到 cain：

### 快速回滚步骤

1. **还原代码**
```bash
git checkout HEAD -- vscode-extension/src/
git checkout HEAD -- .env
git checkout HEAD -- .gitignore
```

2. **还原配置目录**
```bash
# 如果新目录已创建但有问题
mv .kianclaw .cain
mv .kianclaw-artifacts .cain-artifacts
mv .kianclaw-mcp.json .cain-mcp.json
```

3. **还原环境变量**
```bash
# 在 .env 中
KIANCLAW_PRIVATE_KEY → CAIN_PRIVATE_KEY
```

4. **清理测试数据**
```bash
rm -rf .kianclaw*
```

5. **重新安装依赖**
```bash
cd vscode-extension
npm install
npm test
```

---

## 执行步骤建议

### 推荐执行顺序

**第 1 步：准备工作**
1. 创建新分支：`git checkout -b refactor/rename-cain-to-kianclaw`
2. 确保所有测试通过：`npm test`
3. 提交当前进度：`git commit -am "Checkpoint before rename"`

**第 2 步：核心源码改名（第一阶段）**
1. 修改 9 个核心源码文件（按清单修改）
2. 运行测试：`npm test`
3. 修复测试错误（如果有）
4. 提交：`git commit -am "refactor: rename cain to kianclaw in core files"`

**第 3 步：License 和密钥（第二阶段）**
1. 修改 4 个 License 相关文件
2. 更新 `.env` 中的环境变量
3. 生成测试 License 验证格式正确
4. 提交：`git commit -am "refactor: rename cain to kianclaw in license system"`

**第 4 步：配置和文档（第三阶段）**
1. 修改配置文件（`.gitignore`, `README.md` 等）
2. 提交：`git commit -am "docs: update config and docs for kianclaw"`

**第 5 步：测试文件（第四阶段）**
1. 使用批量替换命令更新所有测试文件
2. 运行完整测试套件：`npm test`
3. 提交：`git commit -am "test: update tests for kianclaw"`

**第 6 步：添加迁移脚本**
1. 创建 `migrateCainToKianclaw.ts`
2. 在 `extension.ts` 中集成迁移逻辑
3. 测试迁移功能
4. 提交：`git commit -am "feat: add migration script from cain to kianclaw"`

**第 7 步：完整测试**
1. 运行所有单元测试
2. 手动功能测试（按测试清单）
3. 验证迁移脚本工作正常

**第 8 步：UI 和文档更新（可选）**
1. 更新所有文档中的项目名称
2. 提交：`git commit -am "docs: rebrand to KianClaw"`

**第 9 步：合并和发布**
1. 创建 PR
2. Code Review
3. 合并到主分支
4. 发布新版本

---

## 注意事项

### ⚠️ 破坏性变更

1. **License Key 格式变更**
   - 旧 License：`CAIN-xxx`
   - 新 License：`KIANCLAW-xxx`
   - **影响**：现有用户的 License 需要重新生成

2. **配置文件路径变更**
   - 旧路径：`.cain/`, `.cain-artifacts/`
   - 新路径：`.kianclaw/`, `.kianclaw-artifacts/`
   - **缓解**：迁移脚本自动处理

3. **环境变量变更**
   - 旧变量：`CAIN_PRIVATE_KEY`
   - 新变量：`KIANCLAW_PRIVATE_KEY`
   - **影响**：CI/CD 流程需要更新

### 💡 建议

1. **保留兼容期**
   - 在 MCP 配置文件查找中同时支持新旧文件名
   - 在迁移脚本中保留旧目录的软链接（可选）

2. **用户通知**
   - 在 CHANGELOG.md 中明确说明改名
   - 在扩展启动时显示迁移通知

3. **文档更新**
   - 更新所有用户文档
   - 更新 GitHub README
   - 更新 VS Code Marketplace 描述

---

## 检查清单

执行改名前，Codex 请确认：

- [ ] 已阅读完整改名方案
- [ ] 已理解所有替换规则
- [ ] 已创建新分支用于改名
- [ ] 已备份当前代码（git commit）
- [ ] 已准备好测试环境

执行改名后，请验证：

- [ ] 所有单元测试通过
- [ ] 配置文件能正常读取
- [ ] MCP 服务器能正常启动
- [ ] License 生成和验证功能正常
- [ ] 迁移脚本能正常工作
- [ ] 文档已更新

---

## 总结

### 改动统计

| 类型 | 文件数 | 影响程度 |
|------|--------|---------|
| 核心源码 | 9 | 🔴 高 |
| License 系统 | 4 | 🔴 高 |
| 配置文件 | 5 | 🟡 中 |
| 测试文件 | 14 | 🟢 低 |
| 文档 | 多个 | 🟢 低 |
| **总计** | **~35** | - |

### 预计工作量

- **代码修改**：2-3 小时
- **测试验证**：1-2 小时
- **文档更新**：1 小时
- **总计**：4-6 小时

### 风险评估

- **技术风险**：低（有迁移脚本和测试保障）
- **用户影响**：中（需要迁移数据，但自动处理）
- **回滚难度**：低（有明确回滚步骤）

---

**准备好了吗？开始执行吧！** 🚀
