# Security Policy

English | [简体中文](#安全策略)

## Supported Versions

KainClaw is currently early-stage software. Security fixes are handled on the main branch unless a stable release branch is explicitly announced.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub's private vulnerability reporting flow if it is enabled for this repository:

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Choose **Report a vulnerability**.

If private vulnerability reporting is not available, open a minimal public issue asking for a private contact channel. Do not include exploit details, credentials, tokens, or proof-of-concept payloads in the public issue.

## What to Include

Please include:

- Affected version, commit, or release.
- A clear description of the issue.
- Steps to reproduce, if safe to share privately.
- The impact and required conditions.
- Any suggested mitigation, if known.

## Scope

Security issues may include:

- Credential, token, or secret exposure.
- Unsafe command execution.
- Unsafe file access or workspace boundary bypasses.
- Cross-site scripting or HTML injection in rendered views.
- Insecure provider, MCP, IPC, or local bridge handling.
- Vulnerabilities in release packaging or update flows.

General bugs, feature requests, and support questions should use normal GitHub issues instead.

## Expectations

We will review valid vulnerability reports as soon as practical. Because the project is early-stage and maintained by a small team, response times may vary.

Please give maintainers a reasonable opportunity to investigate and fix the issue before public disclosure.

---

# 安全策略

[English](#security-policy) | 简体中文

## 支持版本

KainClaw 目前仍处于早期阶段。除非项目明确发布稳定分支，否则安全修复会优先落到 main 分支。

## 报告漏洞

请不要通过公开 GitHub issue 报告安全漏洞。

如果本仓库启用了 GitHub 私密漏洞报告，请使用以下流程：

1. 打开 GitHub 仓库页面。
2. 进入 **Security** 标签页。
3. 选择 **Report a vulnerability**。

如果无法使用私密漏洞报告，请开一个最小化的公开 issue，请求私下联系渠道。不要在公开 issue 中包含漏洞细节、凭据、token 或可利用的 proof of concept。

## 报告内容

请尽量包含：

- 受影响的版本、提交或 release。
- 清晰的问题描述。
- 可安全私下分享的复现步骤。
- 影响范围和触发条件。
- 如果已知，也可以附上建议的缓解方式。

## 范围

安全问题可能包括：

- 凭据、token 或 secret 泄露。
- 不安全的命令执行。
- 不安全的文件访问或工作区边界绕过。
- 渲染视图中的 XSS 或 HTML 注入。
- Provider、MCP、IPC 或 Local Bridge 处理不安全。
- 发布打包或更新流程中的漏洞。

普通 bug、功能请求和使用支持请走正常 GitHub issue。

## 预期

我们会尽快审查有效的漏洞报告。由于项目仍处于早期阶段，并且维护团队规模较小，响应时间可能会有所不同。

请在公开披露之前，给维护者合理时间调查和修复问题。
