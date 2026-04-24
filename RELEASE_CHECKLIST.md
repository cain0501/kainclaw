# KainClaw 发布前检查清单

每次发布 `.vsix` 或 Electron `.exe` 前，至少过一遍这份清单。

## 安全

- [ ] `scripts/generateLicense.ts` 私钥已改为从 `CAIN_PRIVATE_KEY` 环境变量读取，禁止硬编码
- [ ] `scripts/` 中不存在误提交的私钥、临时 token、导出文件
- [ ] `keypair.txt` 等临时密钥文件不在工作区内
- [ ] `.env` 文件未被提交
- [ ] `context.secrets` 中的 API Key 不会出现在日志或导出内容里

## 代码清理

- [ ] `.env` fallback 是否仍然需要保留；如果 F08 已完全接管，确认移除路径
- [ ] 临时 TODO / FIXME / 调试日志已经清理
- [ ] 用户可见文案没有乱码

## 功能验收

- [ ] F01 Onboarding：新用户能从零开始完成接入
- [ ] F08 设置面板：Provider 增删改、API Key secrets 存储、baseUrl 配置正常
- [ ] P01 会话持久化：重启后能恢复最近会话
- [ ] P02 多会话：切换、重命名、删除、Markdown 导出正常
- [ ] P03 License：有效 key、无效 key、过期 key 行为正确
- [ ] P04 Swarm：基础并行链路与状态显示正常

## 打包

- [ ] `npm run build` 无错误
- [ ] `dist/extension.js` 体积可接受
- [ ] Playwright 浏览器二进制不被误打进 `.vsix`
- [ ] Windows 10 / 11 基础安装与启动验证通过
