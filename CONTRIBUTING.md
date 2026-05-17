# Contributing to KainClaw

English | [简体中文](#贡献-kainclaw)

Thank you for your interest in contributing to KainClaw.

KainClaw is still early-stage software. Contributions are welcome, but changes should stay focused, reviewable, and aligned with the project's desktop-first direction.

## Before You Start

- Open an issue first for large features, behavior changes, architecture changes, or new integrations.
- Small bug fixes, documentation fixes, and test-only improvements can be sent directly as pull requests.
- Do not include proprietary source code, private service assets, leaked prompts, credentials, tokens, or account-specific configuration.
- Do not submit code copied from projects whose license is incompatible with this repository.

## Development Setup

Requirements:

- Node.js 18 or newer
- npm
- Windows for packaged Electron desktop builds
- VS Code if you want to run the extension development host

Install dependencies:

```bash
npm install
```

Run the standard checks:

```bash
npm test
npm run check
npm run build
```

When changing Electron desktop behavior, also run:

```bash
npm run build:electron
```

## Pull Request Guidelines

- Keep pull requests focused on one problem.
- Prefer small, reversible changes over broad rewrites.
- Reuse existing runtime, service, adapter, and host boundaries where possible.
- Avoid adding dependencies unless there is a clear benefit and no reasonable existing option.
- Include or update tests for behavior changes.
- Update documentation when user-facing behavior, configuration, or setup changes.
- Clearly describe what was tested.

## Project Boundaries

KainClaw is intended to become a desktop AI coding and design assistant. The VS Code extension shape is retained for development and validation.

New product logic should generally live in reusable modules under `src/`. Electron code should mostly handle desktop UI, IPC, permissions, and host integration.

Be careful when changing high-risk areas:

- `src/extension.ts`
- `src/webviewHtml.ts`
- `electron/ElectronChatPanel.ts`
- `electron/renderer/index.html`
- `src/license/licenseManager.ts`

## Licensing

By submitting a contribution, you agree that your contribution will be licensed under the same license as this repository, currently MIT.

If your contribution includes third-party code or assets, clearly identify the source and license in the pull request.

---

# 贡献 KainClaw

[English](#contributing-to-kainclaw) | 简体中文

感谢你对 KainClaw 感兴趣。

KainClaw 仍处于早期阶段。我们欢迎贡献，但希望改动保持聚焦、易审查，并且符合项目以桌面客户端为主的发展方向。

## 开始之前

- 大功能、行为变化、架构调整或新增集成，请先开 issue 讨论。
- 小型 bug 修复、文档修正、测试改进，可以直接提交 pull request。
- 不要提交专有源码、私有服务资产、泄露的 prompt、凭据、token 或账号相关配置。
- 不要提交来自许可证不兼容项目的复制代码。

## 开发环境

要求：

- Node.js 18 或更新版本
- npm
- Windows，用于打包 Electron 桌面版本
- VS Code，用于运行扩展开发宿主

安装依赖：

```bash
npm install
```

运行标准检查：

```bash
npm test
npm run check
npm run build
```

如果修改 Electron 桌面行为，也请运行：

```bash
npm run build:electron
```

## Pull Request 要求

- 每个 PR 尽量只解决一个问题。
- 优先选择小而可回退的改动，避免大范围重写。
- 尽量复用已有 runtime、service、adapter 和 host 边界。
- 除非收益明确且没有合理替代方案，否则不要新增依赖。
- 行为变化需要补充或更新测试。
- 用户可见行为、配置或安装方式变化时，需要同步更新文档。
- PR 里请清楚说明你做过哪些验证。

## 项目边界

KainClaw 的目标是成为桌面 AI 编程与设计助手。VS Code 扩展形态主要保留用于开发和验证。

新的产品逻辑通常应该放在 `src/` 下的可复用模块中。Electron 代码主要负责桌面 UI、IPC、权限和宿主集成。

修改这些高风险区域时请特别谨慎：

- `src/extension.ts`
- `src/webviewHtml.ts`
- `electron/ElectronChatPanel.ts`
- `electron/renderer/index.html`
- `src/license/licenseManager.ts`

## 许可证

提交贡献即表示你同意：你的贡献会按照本仓库相同的许可证授权，目前为 MIT。

如果你的贡献包含第三方代码或素材，请在 PR 中清楚说明来源和许可证。
