export function getSidebarHtml(webviewNonce: string, duckSpriteUri: string, webviewCspSource: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webviewCspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${webviewNonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cain Claude</title>
    <style>
      :root {
        color-scheme: light dark;
        --brand: #d97757;
        --brand-strong: #c95e3b;
        --brand-soft: rgba(217, 119, 87, 0.12);
        --surface: color-mix(in srgb, var(--vscode-editorWidget-background) 92%, transparent);
        --surface-border: color-mix(in srgb, var(--vscode-panel-border) 78%, var(--brand) 22%);
      }

      html,
      body {
        height: 100%;
        overflow: hidden;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        background:
          radial-gradient(circle at top, color-mix(in srgb, var(--brand) 9%, transparent) 0%, transparent 24%),
          var(--vscode-editor-background);
        min-height: 100%;
      }

      button,
      textarea,
      input {
        font: inherit;
      }

      .layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
        min-height: 100vh;
        position: relative;
        overflow: hidden;
      }

      .header {
        flex-shrink: 0;
        padding: 14px 14px 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-sideBar-background) 94%, var(--brand) 6%);
      }

      .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--brand) 36%, var(--vscode-panel-border) 64%);
        background: color-mix(in srgb, var(--brand) 18%, transparent);
        color: color-mix(in srgb, var(--brand) 80%, var(--vscode-editor-foreground) 20%);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .subtitle {
        min-width: 0;
        font-size: 11px;
        opacity: 0.82;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .title {
        margin-top: 10px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .title span {
        color: var(--brand);
      }

      .status-strip {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .session-tabs {
        display: none;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .session-tabs.visible {
        display: flex;
      }

      .session-tab {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 200px;
        padding: 8px 12px;
        border-radius: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, transparent);
        color: var(--vscode-editor-foreground);
      }

      .session-tab:hover {
        filter: brightness(1.04);
      }

      .session-tab.active {
        border-color: color-mix(in srgb, var(--brand) 52%, var(--vscode-panel-border) 48%);
        background: color-mix(in srgb, var(--brand) 16%, var(--surface) 84%);
        color: color-mix(in srgb, var(--brand) 74%, var(--vscode-editor-foreground) 26%);
      }

      .session-tab-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
      }

      .session-tab-add,
      .session-tab-more {
        font-weight: 700;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 11px;
        line-height: 1;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-sideBar-background) 90%, transparent);
      }

      .status-pill.connected {
        border-color: color-mix(in srgb, #4caf50 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #4caf50 14%, transparent);
        color: color-mix(in srgb, #8ddf90 75%, var(--vscode-editor-foreground) 25%);
      }

      .status-pill.error {
        border-color: color-mix(in srgb, #ef5350 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #ef5350 14%, transparent);
        color: color-mix(in srgb, #ff867c 76%, var(--vscode-editor-foreground) 24%);
      }

      .status-pill.needs-auth {
        border-color: color-mix(in srgb, #e6a23c 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #e6a23c 14%, transparent);
        color: color-mix(in srgb, #f1c16a 76%, var(--vscode-editor-foreground) 24%);
      }

      .status-pill.waiting {
        border-color: color-mix(in srgb, #e6a23c 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #e6a23c 14%, transparent);
        color: color-mix(in srgb, #f1c16a 76%, var(--vscode-editor-foreground) 24%);
      }

      .messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overscroll-behavior: contain;
        scroll-padding-bottom: 24px;
      }

      .messages.empty-mode {
        justify-content: center;
      }

      .message {
        padding: 10px 12px;
        border-radius: 12px;
        line-height: 1.55;
        word-break: break-word;
      }

      .message.user {
        align-self: flex-end;
        max-width: 92%;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .message.assistant {
        align-self: stretch;
        background: var(--surface);
        border: 1px solid var(--vscode-panel-border);
      }

      .message.thinking-summary {
        align-self: stretch;
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--brand) 10%, var(--surface) 90%) 0%,
            color-mix(in srgb, var(--surface) 98%, transparent) 100%
          );
        border: 1px solid color-mix(in srgb, var(--brand) 34%, var(--vscode-panel-border) 66%);
      }

      .thinking-summary-kicker {
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--brand);
      }

      .message.error {
        align-self: stretch;
        background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground) 88%, transparent);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
      }

      .thinking-card {
        align-self: stretch;
        padding: 12px 13px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--brand) 34%, var(--vscode-panel-border) 66%);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--brand) 10%, var(--surface) 90%) 0%,
            color-mix(in srgb, var(--surface) 98%, transparent) 100%
          );
      }

      .thinking-card-collapsed {
        cursor: pointer;
        padding: 8px 13px;
        user-select: none;
      }

      .thinking-card-collapsed:hover {
        border-color: color-mix(in srgb, var(--brand) 60%, var(--vscode-panel-border) 40%);
      }

      .thinking-card-collapsed .thinking-head {
        margin: 0;
      }

      .thinking-chevron {
        font-size: 10px;
        opacity: 0.6;
        flex-shrink: 0;
        transition: transform 0.15s;
      }

      .thinking-card-collapsed .thinking-chevron {
        transform: rotate(0deg);
      }

      .thinking-card-expanded .thinking-chevron {
        transform: rotate(90deg);
      }

      .thinking-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .thinking-summary-toggle {
        width: 100%;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .thinking-summary-toggle:focus-visible {
        outline: 1px solid color-mix(in srgb, var(--brand) 48%, transparent);
        outline-offset: 3px;
        border-radius: 8px;
      }

      .thinking-summary-body {
        margin-top: 10px;
      }

      .thinking-title {
        font-size: 12px;
        font-weight: 700;
        color: var(--brand);
      }

      .thinking-subtitle {
        font-size: 11px;
        opacity: 0.76;
      }

      .thinking-list {
        margin-top: 10px;
        display: grid;
        gap: 8px;
      }

      .thinking-step {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 8px;
        align-items: start;
      }

      .thinking-dot {
        width: 10px;
        height: 10px;
        margin-top: 4px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--vscode-descriptionForeground) 70%, transparent);
      }

      .thinking-step.running .thinking-dot {
        background: var(--brand);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 18%, transparent);
      }

      .thinking-step.done .thinking-dot {
        background: #4caf50;
      }

      .thinking-step.error .thinking-dot {
        background: #ef5350;
      }

      .thinking-step.waiting .thinking-dot {
        background: #e6a23c;
      }

      @keyframes swarmPulse {
        0% {
          box-shadow: 0 0 0 0 color-mix(in srgb, #4a90ff 34%, transparent);
        }

        70% {
          box-shadow: 0 0 0 8px color-mix(in srgb, #4a90ff 0%, transparent);
        }

        100% {
          box-shadow: 0 0 0 0 color-mix(in srgb, #4a90ff 0%, transparent);
        }
      }

      .swarm-message {
        display: grid;
        gap: 10px;
      }

      .swarm-message-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .swarm-message-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--brand);
      }

      .swarm-message-meta {
        font-size: 11px;
        opacity: 0.72;
      }

      .swarm-worker-card {
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--vscode-panel-border) 82%);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--surface) 98%, transparent) 0%,
            color-mix(in srgb, var(--vscode-sideBar-background) 94%, transparent) 100%
          );
      }

      .swarm-worker-card.expanded {
        border-color: color-mix(in srgb, var(--brand) 30%, var(--vscode-panel-border) 70%);
      }

      .swarm-worker-toggle {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 0;
        text-align: left;
        background: transparent;
        color: inherit;
      }

      .swarm-worker-toggle:hover,
      .swarm-worker-toggle:focus-visible {
        transform: none;
        filter: none;
        background: color-mix(in srgb, var(--brand-soft) 24%, transparent);
      }

      .swarm-worker-summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .swarm-worker-main {
        min-width: 0;
        flex: 1;
      }

      .swarm-worker-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .swarm-worker-name {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .swarm-worker-alias {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--vscode-panel-border) 82%);
        background: color-mix(in srgb, var(--brand-soft) 40%, transparent);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .swarm-worker-model {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.72;
        word-break: break-word;
      }

      .swarm-worker-preview {
        margin-top: 7px;
        font-size: 12px;
        line-height: 1.5;
        opacity: 0.86;
        word-break: break-word;
      }

      .swarm-worker-side {
        display: grid;
        justify-items: end;
        gap: 8px;
        flex-shrink: 0;
      }

      .swarm-worker-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 9px;
        border-radius: 999px;
        border: 1px solid var(--vscode-panel-border);
        font-size: 11px;
        line-height: 1;
        white-space: nowrap;
      }

      .swarm-worker-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }

      .swarm-worker-status.pending {
        border-color: color-mix(in srgb, var(--vscode-descriptionForeground) 32%, var(--vscode-panel-border) 68%);
        background: color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent);
        color: color-mix(in srgb, var(--vscode-editor-foreground) 66%, var(--vscode-descriptionForeground) 34%);
      }

      .swarm-worker-status.running {
        border-color: color-mix(in srgb, #4a90ff 44%, var(--vscode-panel-border) 56%);
        background: color-mix(in srgb, #4a90ff 14%, transparent);
        color: color-mix(in srgb, #85b5ff 76%, var(--vscode-editor-foreground) 24%);
      }

      .swarm-worker-status.running .swarm-worker-status-dot {
        animation: swarmPulse 1.6s ease-out infinite;
      }

      .swarm-worker-status.done {
        border-color: color-mix(in srgb, #4caf50 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #4caf50 14%, transparent);
        color: color-mix(in srgb, #8ddf90 75%, var(--vscode-editor-foreground) 25%);
      }

      .swarm-worker-status.error {
        border-color: color-mix(in srgb, #ef5350 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #ef5350 14%, transparent);
        color: color-mix(in srgb, #ff867c 76%, var(--vscode-editor-foreground) 24%);
      }

      .swarm-worker-status.timeout {
        border-color: color-mix(in srgb, #e6a23c 50%, var(--vscode-panel-border) 50%);
        background: color-mix(in srgb, #e6a23c 14%, transparent);
        color: color-mix(in srgb, #f1c16a 76%, var(--vscode-editor-foreground) 24%);
      }

      .swarm-worker-chevron {
        font-size: 11px;
        opacity: 0.7;
      }

      .swarm-worker-error {
        margin: 0 12px 12px;
        padding: 10px 11px;
        border-radius: 12px;
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground) 84%, transparent);
        font-size: 11px;
        line-height: 1.5;
        word-break: break-word;
      }

      .swarm-worker-transcript {
        display: grid;
        gap: 8px;
        padding: 0 12px 12px;
      }

      .swarm-worker-empty {
        padding: 10px 11px;
        border-radius: 12px;
        border: 1px dashed color-mix(in srgb, var(--brand) 18%, var(--vscode-panel-border) 82%);
        font-size: 11px;
        opacity: 0.74;
      }

      .swarm-transcript-item {
        padding: 10px 11px;
        border-radius: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--surface) 94%, transparent);
      }

      .swarm-transcript-item.user {
        border-color: color-mix(in srgb, var(--vscode-button-background) 34%, var(--vscode-panel-border) 66%);
      }

      .swarm-transcript-item.assistant {
        border-color: color-mix(in srgb, var(--brand) 20%, var(--vscode-panel-border) 80%);
      }

      .swarm-transcript-item.tool {
        border-color: color-mix(in srgb, var(--vscode-textCodeBlock-background) 32%, var(--vscode-panel-border) 68%);
        background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 78%, transparent);
      }

      .swarm-transcript-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .swarm-transcript-role {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--brand);
      }

      .swarm-transcript-body > :first-child {
        margin-top: 0;
      }

      .swarm-transcript-body > :last-child {
        margin-bottom: 0;
      }

      .thinking-label {
        font-size: 12px;
        line-height: 1.45;
      }

      .thinking-detail {
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.45;
        opacity: 0.8;
        word-break: break-word;
      }

      .message-body > :first-child {
        margin-top: 0;
      }

      .message-body > :last-child {
        margin-bottom: 0;
      }

      .md-paragraph {
        margin: 0 0 10px;
      }

      .md-heading {
        margin: 0 0 10px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .md-heading.level-1 {
        font-size: 18px;
      }

      .md-heading.level-2 {
        font-size: 16px;
      }

      .md-heading.level-3 {
        font-size: 14px;
      }

      .md-list,
      .md-ordered-list {
        margin: 0 0 10px 18px;
        padding: 0;
      }

      .md-list li,
      .md-ordered-list li {
        margin: 4px 0;
      }

      .inline-code {
        padding: 1px 6px;
        border-radius: 7px;
        background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 92%, transparent);
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 90%, transparent);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.95em;
      }

      .code-block {
        margin: 0 0 10px;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 94%, black 6%);
      }

      .code-block-header {
        padding: 7px 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.78;
      }

      .code-block pre {
        margin: 0;
        padding: 12px;
        overflow: auto;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        line-height: 1.55;
      }

      .md-table-wrap {
        margin: 0 0 10px;
        overflow-x: auto;
      }

      .md-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .md-table th,
      .md-table td {
        padding: 8px 10px;
        border: 1px solid var(--vscode-panel-border);
        text-align: left;
        vertical-align: top;
      }

      .md-table th {
        background: color-mix(in srgb, var(--brand) 10%, transparent);
        font-weight: 700;
      }

      .welcome {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
      }

      .welcome-card {
        position: relative;
        overflow: hidden;
        border-radius: 20px;
        border: 1px solid var(--surface-border);
        background:
          radial-gradient(circle at top, color-mix(in srgb, var(--brand) 20%, transparent) 0%, transparent 48%),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--vscode-sideBar-background) 92%, white 8%) 0%,
            color-mix(in srgb, var(--surface) 96%, transparent) 100%
          );
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
      }

      .welcome-inner {
        position: relative;
        padding: 18px;
      }

      .welcome-kicker {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
      }

      .welcome-kicker strong {
        color: var(--brand);
        letter-spacing: 0.08em;
      }

      .welcome-title {
        margin-top: 14px;
        font-size: 22px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .welcome-title span {
        color: var(--brand);
      }

      .welcome-note {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.6;
        color: color-mix(in srgb, var(--vscode-editor-foreground) 84%, transparent);
      }

      .rule {
        margin: 16px 0 18px;
        color: color-mix(in srgb, var(--brand) 52%, var(--vscode-descriptionForeground) 48%);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        letter-spacing: 0.12em;
        white-space: nowrap;
        overflow: hidden;
      }

      .stage {
        display: grid;
        grid-template-columns: 96px 1fr;
        gap: 16px;
        align-items: center;
      }

      .clawd-shell {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 96px;
        height: 96px;
        border-radius: 24px;
        background:
          radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.26) 0, transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--brand) 24%, transparent), transparent 78%),
          color-mix(in srgb, var(--surface) 96%, transparent);
        border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--vscode-panel-border) 70%);
      }

      .clawd {
        position: relative;
        width: 52px;
        height: 52px;
      }

      .clawd-ear {
        position: absolute;
        top: 2px;
        width: 14px;
        height: 16px;
        border-radius: 7px 7px 3px 3px;
        background: var(--brand);
      }

      .clawd-ear.left {
        left: 3px;
        transform: rotate(-24deg);
      }

      .clawd-ear.right {
        right: 3px;
        transform: rotate(24deg);
      }

      .clawd-face {
        position: absolute;
        inset: 8px 6px 10px;
        border-radius: 16px 16px 18px 18px;
        background: linear-gradient(180deg, #f2ceb6 0%, #eab998 100%);
        box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.08);
      }

      .clawd-eye {
        position: absolute;
        top: 16px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #5f2f24;
      }

      .clawd-eye.left {
        left: 14px;
      }

      .clawd-eye.right {
        right: 14px;
      }

      .clawd-mouth {
        position: absolute;
        left: 50%;
        bottom: 12px;
        width: 14px;
        height: 8px;
        transform: translateX(-50%);
        border-bottom: 2px solid #7d4538;
        border-radius: 0 0 10px 10px;
      }

      .clawd-paws {
        position: absolute;
        left: 50%;
        bottom: 0;
        display: flex;
        gap: 8px;
        transform: translateX(-50%);
      }

      .clawd-paws span {
        display: block;
        width: 10px;
        height: 8px;
        border-radius: 8px;
        background: var(--brand-strong);
      }

      .meta {
        display: grid;
        gap: 8px;
      }

      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        line-height: 1.5;
      }

      .meta-label {
        color: var(--brand);
        font-weight: 600;
      }

      .meta-value {
        color: color-mix(in srgb, var(--vscode-editor-foreground) 88%, transparent);
      }

      .suggestions {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .suggestion {
        border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--vscode-panel-border) 80%);
        background: color-mix(in srgb, var(--brand) 12%, var(--vscode-button-secondaryBackground) 88%);
        color: var(--vscode-editor-foreground);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.3;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .suggestion:hover,
      .suggestion:focus-visible,
      button:hover,
      button:focus-visible {
        transform: translateY(-1px);
        outline: none;
      }

      .suggestion:hover,
      .suggestion:focus-visible {
        background: color-mix(in srgb, var(--brand) 18%, var(--vscode-button-secondaryBackground) 82%);
        border-color: color-mix(in srgb, var(--brand) 44%, var(--vscode-panel-border) 56%);
      }

      .composer {
        flex-shrink: 0;
        border-top: 1px solid var(--vscode-panel-border);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: color-mix(in srgb, var(--vscode-sideBar-background) 95%, transparent);
      }

      .composer-input-shell {
        position: relative;
      }

      .slash-menu {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + 8px);
        border-radius: 16px;
        border: 1px solid color-mix(in srgb, var(--brand) 36%, var(--vscode-panel-border) 64%);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--brand) 10%, var(--surface) 90%) 0%,
            color-mix(in srgb, var(--surface) 98%, transparent) 100%
          );
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.16);
        overflow: hidden;
        z-index: 20;
      }

      .slash-menu.visible {
        display: block;
      }

      .slash-menu-header,
      .slash-menu-footer {
        padding: 9px 12px;
        font-size: 11px;
        line-height: 1.4;
      }

      .slash-menu-header {
        border-bottom: 1px solid color-mix(in srgb, var(--brand) 18%, var(--vscode-panel-border) 82%);
        color: color-mix(in srgb, var(--brand) 72%, var(--vscode-editor-foreground) 28%);
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .slash-menu-footer {
        border-top: 1px solid color-mix(in srgb, var(--brand) 18%, var(--vscode-panel-border) 82%);
        color: var(--vscode-descriptionForeground);
      }

      .slash-menu-list {
        display: flex;
        flex-direction: column;
        max-height: 260px;
        overflow-y: auto;
      }

      .slash-menu-item {
        width: 100%;
        border: none;
        border-radius: 0;
        padding: 10px 12px;
        display: grid;
        gap: 4px;
        justify-items: start;
        text-align: left;
        background: transparent;
        color: var(--vscode-editor-foreground);
        cursor: pointer;
        transition: background 140ms ease;
      }

      .slash-menu-item + .slash-menu-item {
        border-top: 1px solid color-mix(in srgb, var(--brand) 10%, var(--vscode-panel-border) 90%);
      }

      .slash-menu-item:hover,
      .slash-menu-item.selected {
        background: color-mix(in srgb, var(--brand) 14%, var(--vscode-list-hoverBackground) 86%);
      }

      .slash-menu-command {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        font-weight: 700;
        color: var(--brand);
      }

      .slash-menu-description {
        font-size: 11px;
        line-height: 1.5;
        color: var(--vscode-editor-foreground);
        opacity: 0.86;
      }

      .slash-menu-empty {
        padding: 14px 12px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }

      .composer-approval {
        display: none;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--brand) 44%, var(--vscode-panel-border) 56%);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--brand) 12%, var(--surface) 88%) 0%,
            color-mix(in srgb, var(--surface) 98%, transparent) 100%
          );
      }

      .composer-approval.visible {
        display: block;
      }

      .composer-approval-title {
        font-size: 12px;
        font-weight: 700;
        color: var(--brand);
      }

      .composer-approval-note {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.5;
        opacity: 0.92;
      }

      .composer-approval-path {
        margin-top: 8px;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        opacity: 0.82;
        word-break: break-all;
      }

      .composer-approval-tip {
        margin-top: 8px;
        font-size: 11px;
        opacity: 0.75;
      }

      .composer-approval-preview {
        margin-top: 8px;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 92%, black 8%);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .composer-approval-actions {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .quick-action {
        border: 1px solid color-mix(in srgb, var(--brand) 24%, var(--vscode-panel-border) 76%);
        background: color-mix(in srgb, var(--brand-soft) 36%, var(--vscode-button-secondaryBackground) 64%);
        color: var(--vscode-editor-foreground);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        line-height: 1.3;
      }

      #companion-container {
        position: absolute;
        bottom: 80px;
        right: 12px;
        z-index: 100;
        cursor: pointer;
        user-select: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      #companion-canvas {
        width: 64px;
        height: 64px;
        display: block;
        image-rendering: pixelated;
      }

      #companion-bubble {
        font-size: 11px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 2px 6px;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.2s;
      }

      #companion-bubble.visible {
        opacity: 1;
      }

      #companion-bond {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
      }

      @keyframes companion-shake {
        0%,100% { transform: translateX(0); }
        25%     { transform: translateX(-3px); }
        75%     { transform: translateX(3px); }
      }

      textarea {
        width: 100%;
        min-height: 92px;
        resize: vertical;
        border: 1px solid var(--vscode-input-border);
        border-radius: 12px;
        padding: 12px 13px;
        line-height: 1.55;
        color: var(--vscode-input-foreground);
        background: color-mix(in srgb, var(--vscode-input-background) 92%, var(--brand-soft) 8%);
      }

      textarea:focus {
        outline: 1px solid color-mix(in srgb, var(--brand) 55%, transparent);
        border-color: color-mix(in srgb, var(--brand) 42%, var(--vscode-focusBorder) 58%);
      }

      #attachment-preview-area {
        display: none;
        flex-wrap: wrap;
        gap: 8px;
        padding: 6px 0 2px;
      }

      #attachment-preview-area.has-items {
        display: flex;
      }

      .attachment-thumb {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--vscode-panel-border);
        flex-shrink: 0;
      }

      .attachment-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .attachment-thumb-remove {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(0,0,0,0.65);
        color: #fff;
        font-size: 11px;
        line-height: 16px;
        text-align: center;
        cursor: pointer;
        border: none;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
      }

      .attachment-btn {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        border-radius: 8px;
        padding: 6px 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
      }

      .attachment-btn:hover {
        filter: brightness(1.1);
      }

      .attachment-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .hint {
        font-size: 11px;
        opacity: 0.82;
      }

      .buttons {
        display: flex;
        gap: 8px;
      }

      button {
        border: none;
        border-radius: 10px;
        padding: 8px 14px;
        cursor: pointer;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        transition: transform 160ms ease, opacity 160ms ease, filter 160ms ease;
      }

      button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }

      button:disabled {
        opacity: 0.6;
        cursor: default;
        transform: none;
        filter: none;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      }

      @media (max-width: 420px) {
        .stage {
          grid-template-columns: 1fr;
        }

        .clawd-shell {
          width: 84px;
          height: 84px;
        }

        .actions {
          flex-direction: column;
          align-items: flex-start;
        }

        .quick-actions {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <!-- F01 Onboarding overlay -->
    <div id="onboardingOverlay" style="display:none;position:fixed;inset:0;z-index:100;overflow-y:auto;background:var(--vscode-editor-background);padding:20px 16px;"></div>
    <!-- F08 Settings overlay -->
    <div id="settingsOverlay" style="display:none;position:fixed;inset:0;z-index:100;overflow-y:auto;background:var(--vscode-editor-background);padding:20px 16px;"></div>
    <!-- P02 Sessions overlay -->
    <div id="sessionsOverlay" style="display:none;position:fixed;inset:0;z-index:100;overflow-y:auto;background:var(--vscode-editor-background);padding:20px 16px;"></div>
    <div class="layout">
      <div class="header">
        <div class="header-row">
          <div class="badge">CAIN</div>
          <div class="subtitle" id="subtitle">Provider: Not connected</div>
          <div style="display:flex;gap:4px;">
            <button class="secondary" id="sessionsBtn" type="button" title="历史会话" style="padding:4px 8px;font-size:13px;border-radius:8px;min-width:0;">☰</button>
            <button class="secondary" id="settingsBtn" type="button" title="设置" style="padding:4px 8px;font-size:13px;border-radius:8px;min-width:0;">⚙</button>
          </div>
        </div>
        <div class="title">KainClaw</div>
        <div class="status-strip" id="statusStrip"></div>
        <div class="session-tabs" id="sessionTabs"></div>
      </div>
      <div class="messages empty-mode" id="messages"></div>
      <div id="companion-container" title="">
        <div id="companion-bubble"></div>
        <canvas id="companion-canvas" width="64" height="64"></canvas>
        <div id="companion-bond">Lv.1</div>
      </div>
      <div class="composer">
        <div id="composerApprovalMount"></div>
        <div class="quick-actions">
          <button class="quick-action secondary" type="button" data-inject-action="selection">注入选区</button>
          <button class="quick-action secondary" type="button" data-quick-action="readActiveFile">读当前文件</button>
          <button class="quick-action secondary" type="button" data-quick-action="explainActiveFile">解释当前文件</button>
          <button class="quick-action secondary" type="button" data-quick-action="browserSmoke">浏览器测试</button>
          <button class="quick-action secondary" type="button" data-quick-action="githubStatus">GitHub</button>
          <button class="quick-action secondary" type="button" data-quick-action="supabaseStatus">Supabase</button>
        </div>
        <div class="composer-input-shell">
          <div id="slashMenu" class="slash-menu" aria-hidden="true"></div>
          <div id="attachment-preview-area"></div>
          <textarea id="prompt" placeholder="问我当前工作区里的代码、命令、文件、网页或 MCP 工具..."></textarea>
        </div>
        <div class="actions">
          <div class="hint" id="status">输入 / 打开快捷指令，回车发送，Shift+回车换行。</div>
          <div class="buttons">
            <input type="file" id="attachment-file-input" accept="image/*" multiple style="display:none" />
            <button class="attachment-btn secondary" id="attachmentButton" type="button" title="附加图片">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <button class="secondary" id="clearButton" type="button">清空</button>
            <button id="sendButton" type="button">发送</button>
          </div>
        </div>
      </div>
    </div>
    <script nonce="${webviewNonce}">
      const vscode = acquireVsCodeApi();
      const messagesEl = document.getElementById("messages");
      const composerApprovalMountEl = document.getElementById("composerApprovalMount");
      const slashMenuEl = document.getElementById("slashMenu");
      const statusStripEl = document.getElementById("statusStrip");
      const sessionTabsEl = document.getElementById("sessionTabs");
      const promptEl = document.getElementById("prompt");
      const sendButtonEl = document.getElementById("sendButton");
      const clearButtonEl = document.getElementById("clearButton");
      const statusEl = document.getElementById("status");
      const subtitleEl = document.getElementById("subtitle");
      const attachmentButtonEl = document.getElementById("attachmentButton");
      const attachmentFileInputEl = document.getElementById("attachment-file-input");
      const attachmentPreviewAreaEl = document.getElementById("attachment-preview-area");

      let pendingAttachments = [];

      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve({ dataUrl: e.target.result, mimeType: file.type || "image/png", name: file.name || "image.png" });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      function renderAttachmentPreviews() {
        if (!attachmentPreviewAreaEl) return;
        if (pendingAttachments.length === 0) {
          attachmentPreviewAreaEl.innerHTML = "";
          attachmentPreviewAreaEl.classList.remove("has-items");
          return;
        }
        attachmentPreviewAreaEl.classList.add("has-items");
        attachmentPreviewAreaEl.innerHTML = pendingAttachments.map((att, idx) => \`
          <div class="attachment-thumb">
            <img src="\${att.dataUrl}" alt="\${att.name}" />
            <button class="attachment-thumb-remove" data-idx="\${idx}" title="移除">×</button>
          </div>
        \`).join("");
        attachmentPreviewAreaEl.querySelectorAll(".attachment-thumb-remove").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-idx"));
            pendingAttachments.splice(idx, 1);
            renderAttachmentPreviews();
          });
        });
      }

      async function addAttachmentsFromFiles(files) {
        const results = await Promise.all(Array.from(files).filter(f => f.type.startsWith("image/")).map(f => readFileAsDataUrl(f)));
        pendingAttachments = pendingAttachments.concat(results);
        renderAttachmentPreviews();
      }

      if (attachmentButtonEl) {
        attachmentButtonEl.addEventListener("click", () => {
          if (attachmentFileInputEl) attachmentFileInputEl.click();
        });
      }

      if (attachmentFileInputEl) {
        attachmentFileInputEl.addEventListener("change", async e => {
          if (e.target.files && e.target.files.length > 0) {
            await addAttachmentsFromFiles(e.target.files);
            e.target.value = "";
          }
        });
      }

      document.addEventListener("paste", async e => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const imageItems = Array.from(items).filter(item => item.type.startsWith("image/"));
        if (imageItems.length === 0) return;
        e.preventDefault();
        const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
        await addAttachmentsFromFiles(files);
      });
      const canvas = document.getElementById("companion-canvas");
      const ctx = canvas ? canvas.getContext("2d") : null;
      const bubbleEl = document.getElementById("companion-bubble");
      const bondEl = document.getElementById("companion-bond");
      const containerEl = document.getElementById("companion-container");
      const DUCK_SPRITE_URI = ${JSON.stringify(duckSpriteUri)};

      const state = {
        messages: [],
        ready: false,
        isBusy: false,
        providerLabel: "Not connected",
        effortLevel: null,
        fastMode: false,
        fastModeLabel: "off",
        fastModeConnected: false,
        mcpServers: [],
        liveActivities: [],
        lastRunActivities: [],
        pendingApproval: null,
        streamingText: "",
        showThinkingSummaries: true,
        multiSessionEnabled: false,
        planMode: {
          active: false,
          planFilePath: null
        }
      };
      const sessionsState = {
        sessions: [],
        activeId: null,
        loaded: false,
        requested: false
      };
      const workerGroups = [];
      const workerGroupByWorkerId = new Map();
      const expandedWorkers = new Set();
      const expandedThinkingSummaries = new Set();
      let activeWorkerGroupId = null;
      let nextWorkerGroupSequence = 1;
      const RARITY_LABEL = { common:"普通", uncommon:"非普通", rare:"稀有", epic:"史诗", legendary:"传奇", shiny:"✨Shiny" };
      const BUBBLES = ["❤️","⚡","✨","😄","🎉","👾","💫"];
      const FRAME_W = 32;
      const FRAME_H = 32;
      const DISPLAY = 64;
      const img = new Image();
      img.src = DUCK_SPRITE_URI;
      const SLASH_COMMANDS = [
        {
          command: "/plan",
          insertText: "/plan ",
          description: "进入 Plan Mode，先只读分析并把执行计划写进计划文件。",
          executeOnSelect: true,
          keywords: ["plan", "规划", "计划", "mode"]
        },
        {
          command: "/exitplan",
          insertText: "/exitplan ",
          description: "提交当前计划审批并退出 Plan Mode，进入正式实现阶段。",
          executeOnSelect: true,
          keywords: ["exitplan", "approve", "退出", "审批"]
        },
        {
          command: "/verify",
          insertText: "/verify ",
          description: "启动官方风格验证代理，检查计划或实现是否真的完成。",
          executeOnSelect: true,
          keywords: ["verify", "验证", "检查", "agent"]
        },
        {
          command: "/review",
          insertText: "/review ",
          description: "对当前改动做 findings-first 审查，优先找 bug 和风险。",
          executeOnSelect: true,
          keywords: ["review", "审查", "代码审查", "risk"]
        },
        {
          command: "/compact",
          insertText: "/compact ",
          description: "压缩当前会话历史，减少上下文噪音并保留有效信息。",
          executeOnSelect: true,
          keywords: ["compact", "压缩", "history", "上下文"]
        },
        {
          command: "/fast",
          insertText: "/fast ",
          description: "切换 Fast Mode；无参数时按当前状态自动开关。",
          executeOnSelect: true,
          keywords: ["fast", "mode", "opus", "快速"]
        },
        {
          command: "/effort",
          insertText: "/effort ",
          description: "设置思考强度，例如 low、medium、high、max、auto。",
          executeOnSelect: false,
          keywords: ["effort", "thinking", "推理", "强度"]
        }
      ];
      const slashMenuState = {
        items: [],
        selectedIndex: 0
      };

      const ANIM = {
        idle:     { row: 0,  frames: 4,  fps: 4,  loop: true,  onDone: null },
        thinking: { row: 4,  frames: 4,  fps: 3,  loop: true,  onDone: null },
        working:  { row: 14, frames: 14, fps: 12, loop: true,  onDone: null },
        done:     { row: 6,  frames: 4,  fps: 10, loop: false, onDone: "idle" },
        sleeping: { row: 16, frames: 4,  fps: 2,  loop: true,  onDone: null },
        clicked:  { row: 2,  frames: 6,  fps: 10, loop: false, onDone: "idle" },
      };

      let companionState = "";
      let companionData = null;
      let companionSleepTimer = null;
      let currentAnim = null;
      let currentFrame = 0;
      let lastFrameTime = 0;

      function clearStreamingText() {
        state.streamingText = "";
      }

      function getSlashCommandQuery(value) {
        if (typeof value !== "string" || !value.startsWith("/")) {
          return null;
        }

        const firstSpaceIndex = value.indexOf(" ");
        if (firstSpaceIndex !== -1) {
          return null;
        }

        return value.slice(1).trim().toLowerCase();
      }

      function filterSlashCommands(query) {
        const normalizedQuery = (query || "").trim().toLowerCase();
        const items = SLASH_COMMANDS.filter(item => {
          if (!normalizedQuery) {
            return true;
          }

          const commandName = item.command.slice(1).toLowerCase();
          if (commandName.startsWith(normalizedQuery)) {
            return true;
          }

          const haystacks = [item.description].concat(item.keywords || []);
          return haystacks.some(value => String(value).toLowerCase().includes(normalizedQuery));
        });

        return items.sort((left, right) => {
          if (!normalizedQuery) {
            return 0;
          }

          const leftPrefix = left.command.slice(1).toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
          const rightPrefix = right.command.slice(1).toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
          return leftPrefix - rightPrefix;
        });
      }

      function hideSlashMenu() {
        slashMenuState.items = [];
        slashMenuState.selectedIndex = 0;
        slashMenuEl.classList.remove("visible");
        slashMenuEl.setAttribute("aria-hidden", "true");
        slashMenuEl.innerHTML = "";
      }

      function renderSlashMenu() {
        if (!slashMenuState.items.length) {
          hideSlashMenu();
          return;
        }

        const normalizedIndex = Math.max(
          0,
          Math.min(slashMenuState.selectedIndex, slashMenuState.items.length - 1)
        );
        slashMenuState.selectedIndex = normalizedIndex;
        slashMenuEl.classList.add("visible");
        slashMenuEl.setAttribute("aria-hidden", "false");
        slashMenuEl.innerHTML =
          '<div class="slash-menu-header">Quick Commands</div>' +
          '<div class="slash-menu-list">' +
          slashMenuState.items.map((item, index) =>
            '<button class="slash-menu-item' + (index === normalizedIndex ? " selected" : "") + '" type="button" data-slash-index="' + index + '">' +
            '  <span class="slash-menu-command">' + escapeHtml(item.command) + "</span>" +
            '  <span class="slash-menu-description">' + escapeHtml(item.description) + "</span>" +
            "</button>"
          ).join("") +
          "</div>" +
          '<div class="slash-menu-footer">Enter 直接执行，无参数命令可一步触发；Tab 只写入输入框。</div>';
      }

      function updateSlashMenu() {
        if (state.isBusy || state.pendingApproval) {
          hideSlashMenu();
          return;
        }

        const query = getSlashCommandQuery(promptEl.value);
        if (query === null) {
          hideSlashMenu();
          return;
        }

        slashMenuState.items = filterSlashCommands(query);
        slashMenuState.selectedIndex = 0;
        renderSlashMenu();
      }

      function moveSlashMenuSelection(offset) {
        if (!slashMenuState.items.length) {
          return;
        }

        const total = slashMenuState.items.length;
        slashMenuState.selectedIndex =
          (slashMenuState.selectedIndex + offset + total) % total;
        renderSlashMenu();
      }

      function applySlashCommandSelection(index, shouldExecute) {
        const item = slashMenuState.items[index];
        if (!item) {
          return;
        }

        promptEl.value = item.insertText;
        promptEl.focus();
        const cursor = promptEl.value.length;
        promptEl.setSelectionRange(cursor, cursor);

        if (shouldExecute && item.executeOnSelect) {
          sendPrompt();
          return;
        }

        updateSlashMenu();
      }

      function drawCompanionFrame() {
        if (!ctx || !currentAnim || !img.complete || !img.naturalWidth) return;
        ctx.clearRect(0, 0, DISPLAY, DISPLAY);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          img,
          currentFrame * FRAME_W,
          currentAnim.row * FRAME_H,
          FRAME_W,
          FRAME_H,
          0,
          0,
          DISPLAY,
          DISPLAY
        );
      }

      function updateCompanionSprite() {
        if (!companionData) return;
        if (bondEl) {
          bondEl.textContent = "Lv." + companionData.bondLevel;
        }
        if (containerEl) {
          const mood = companionData.moodLevel;
          const rarity = companionData.rarity;
          containerEl.title = (RARITY_LABEL[rarity] || "") + " " + companionData.species + " · Bond Lv." + companionData.bondLevel + " · 心情 " + mood + "/100";
        }
      }

      function renderCompanion(timestamp) {
        requestAnimationFrame(renderCompanion);
        if (!ctx || !currentAnim || !img.complete || !img.naturalWidth) return;

        if (!lastFrameTime) {
          lastFrameTime = timestamp;
          drawCompanionFrame();
          return;
        }

        const interval = 1000 / currentAnim.fps;
        if (timestamp - lastFrameTime < interval) return;
        lastFrameTime = timestamp;

        drawCompanionFrame();
        currentFrame += 1;

        if (currentFrame >= currentAnim.frames) {
          if (currentAnim.loop) {
            currentFrame = 0;
          } else if (currentAnim.onDone) {
            setCompanionState(currentAnim.onDone);
          } else {
            currentFrame = currentAnim.frames - 1;
          }
        }
      }

      img.addEventListener("load", () => {
        drawCompanionFrame();
      });
      requestAnimationFrame(renderCompanion);

      function setCompanionState(stateName) {
        const nextAnim = ANIM[stateName] || ANIM.idle;
        if (currentAnim === nextAnim) return;

        companionState = stateName in ANIM ? stateName : "idle";
        currentAnim = nextAnim;
        currentFrame = 0;
        lastFrameTime = 0;
        drawCompanionFrame();

        clearTimeout(companionSleepTimer);
        if (companionState === "idle") {
          companionSleepTimer = setTimeout(() => {
            setCompanionState("sleeping");
          }, 10 * 60 * 1000);
        }
      }

      function showBubble(text) {
        if (!bubbleEl) return;
        bubbleEl.textContent = text;
        bubbleEl.classList.add("visible");
        setTimeout(() => bubbleEl.classList.remove("visible"), 1500);
      }

      containerEl?.addEventListener("click", () => {
        setCompanionState("clicked");
        showBubble(BUBBLES[Math.floor(Math.random() * BUBBLES.length)]);
      });

      function initCompanion(data) {
        if (!data) return;
        companionData = data;
        updateCompanionSprite();
        setCompanionState("idle");
        if (data.lockedRarity) {
          setTimeout(() => showBubble("🔒 激活解锁稀有度"), 2000);
        }
      }

      function scrollMessagesToBottom() {
        requestAnimationFrame(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      }

      function updateStreamingBubble(text = state.streamingText, shouldScroll = true) {
        const streamingBodyEl = messagesEl.querySelector("#streamingMessage .message-body");

        if (streamingBodyEl) {
          try {
            streamingBodyEl.innerHTML = renderMessageContent(text);
          } catch (_error) {
            streamingBodyEl.innerHTML = '<p class="md-paragraph">' + escapeHtml(text) + "</p>";
          }
        } else {
          renderMessages({ scroll: shouldScroll });
          return;
        }

        if (shouldScroll) {
          scrollMessagesToBottom();
        }
      }

      const starterPrompts = [
        "读取 assistant-src/index.ts，然后告诉我这个终端助手的启动流程",
        "搜索 workspaceRoot 在哪些文件里出现过",
        "browser_navigate 到 https://example.com 之后用 browser_snapshot 看页面",
        "告诉我如何用 .mcp.json 接入 GitHub 和 Supabase"
      ];

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function renderInlineMarkdown(value) {
        return escapeHtml(value)
          .replace(/\x60([^\x60]+)\x60/g, '<code class="inline-code">$1</code>')
          .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
          .replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
      }

      function isTableSeparator(line) {
        return /^\\s*\\|?(?:\\s*:?-{3,}:?\\s*\\|)+\\s*:?-{3,}:?\\s*\\|?\\s*$/.test(line);
      }

      function splitTableRow(line) {
        return line
          .trim()
          .replace(/^\\|/, "")
          .replace(/\\|$/, "")
          .split("|")
          .map(cell => cell.trim());
      }

      function lineStartsBlock(line, nextLine) {
        const trimmed = line.trim();

        if (!trimmed) {
          return false;
        }

        return /^(#{1,3})\\s+/.test(trimmed) ||
          /^[-*]\\s+/.test(trimmed) ||
          /^\\d+\\.\\s+/.test(trimmed) ||
          trimmed.startsWith("> ") ||
          (trimmed.includes("|") && !!nextLine && isTableSeparator(nextLine));
      }

      function renderTable(lines) {
        const headerCells = splitTableRow(lines[0]);
        const rowHtml = lines
          .slice(2)
          .map(row => {
            const cells = splitTableRow(row);
            return "<tr>" + cells.map(cell => "<td>" + renderInlineMarkdown(cell) + "</td>").join("") + "</tr>";
          })
          .join("");

        return '<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
          headerCells.map(cell => "<th>" + renderInlineMarkdown(cell) + "</th>").join("") +
          "</tr></thead><tbody>" + rowHtml + "</tbody></table></div>";
      }

      function renderMarkdownSegment(segment) {
        const lines = segment.split("\\n");
        const html = [];
        let index = 0;

        while (index < lines.length) {
          const rawLine = lines[index];
          const line = rawLine.trim();

          if (!line) {
            index += 1;
            continue;
          }

          const headingMatch = line.match(/^(#{1,3})\\s+(.+)$/);
          if (headingMatch) {
            const level = String(headingMatch[1].length);
            html.push('<div class="md-heading level-' + level + '">' + renderInlineMarkdown(headingMatch[2]) + "</div>");
            index += 1;
            continue;
          }

          if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
            const tableLines = [lines[index], lines[index + 1]];
            index += 2;

            while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
              tableLines.push(lines[index]);
              index += 1;
            }

            html.push(renderTable(tableLines));
            continue;
          }

          if (/^[-*]\\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^[-*]\\s+/.test(lines[index].trim())) {
              items.push(lines[index].trim().replace(/^[-*]\\s+/, ""));
              index += 1;
            }

            html.push('<ul class="md-list">' + items.map(item => "<li>" + renderInlineMarkdown(item) + "</li>").join("") + "</ul>");
            continue;
          }

          if (/^\\d+\\.\\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^\\d+\\.\\s+/.test(lines[index].trim())) {
              items.push(lines[index].trim().replace(/^\\d+\\.\\s+/, ""));
              index += 1;
            }

            html.push('<ol class="md-ordered-list">' + items.map(item => "<li>" + renderInlineMarkdown(item) + "</li>").join("") + "</ol>");
            continue;
          }

          if (line.startsWith("> ")) {
            const quoteLines = [];
            while (index < lines.length && lines[index].trim().startsWith("> ")) {
              quoteLines.push(lines[index].trim().replace(/^>\\s?/, ""));
              index += 1;
            }

            html.push('<div class="md-paragraph"><em>' + quoteLines.map(item => renderInlineMarkdown(item)).join("<br />") + "</em></div>");
            continue;
          }

          const paragraphLines = [rawLine.trim()];
          index += 1;

          while (
            index < lines.length &&
            lines[index].trim() &&
            !lineStartsBlock(lines[index], lines[index + 1])
          ) {
            paragraphLines.push(lines[index].trim());
            index += 1;
          }

          html.push('<p class="md-paragraph">' + paragraphLines.map(item => renderInlineMarkdown(item)).join("<br />") + "</p>");
        }

        return html.join("");
      }

      function renderCodeBlock(language, code) {
        const safeLanguage = escapeHtml(language || "text");
        const safeCode = escapeHtml(code.replace(/\\n$/, ""));
        return '<div class="code-block"><div class="code-block-header">' + safeLanguage + "</div><pre><code>" + safeCode + "</code></pre></div>";
      }

      function renderMessageContent(content) {
        const normalized = String(content || "").replace(/\\r\\n/g, "\\n");
        const blockPattern = /\\x60\\x60\\x60([a-zA-Z0-9_-]+)?\\n([\\s\\S]*?)\\x60\\x60\\x60/g;
        const html = [];
        let lastIndex = 0;
        let match;

        while ((match = blockPattern.exec(normalized)) !== null) {
          const textBefore = normalized.slice(lastIndex, match.index);
          if (textBefore.trim()) {
            html.push(renderMarkdownSegment(textBefore));
          }

          html.push(renderCodeBlock(match[1], match[2]));
          lastIndex = match.index + match[0].length;
        }

        const trailing = normalized.slice(lastIndex);
        if (trailing.trim()) {
          html.push(renderMarkdownSegment(trailing));
        }

        if (html.length === 0) {
          html.push('<p class="md-paragraph">' + escapeHtml(normalized) + "</p>");
        }

        return html.join("");
      }

      function renderStatusStrip() {
        const items = [
          '<span class="status-pill">Provider: ' + escapeHtml(state.providerLabel) + "</span>"
        ];

        items.push('<span class="status-pill">Effort: ' + escapeHtml(state.effortLevel || "auto") + "</span>");
        items.push(
          '<span class="status-pill' + (state.fastModeConnected ? ' connected' : '') + '">Fast: ' +
          escapeHtml(state.fastModeLabel || "off") +
          "</span>"
        );
        items.push(
          '<span class="status-pill">Thinking: ' +
          escapeHtml(state.showThinkingSummaries === false ? "hidden" : "visible") +
          "</span>"
        );

        if (state.planMode && state.planMode.active) {
          const planPath = state.planMode.planFilePath || "(unknown)";
          items.push('<span class="status-pill">Plan Mode · ' + escapeHtml(planPath) + "</span>");
        }

        if (state.mcpServers.length === 0) {
          items.push('<span class="status-pill">MCP: 未探测</span>');
        } else {
          state.mcpServers.forEach(server => {
            const statusClass =
              server.state === "connected"
                ? "connected"
                : server.state === "needs-auth"
                  ? "needs-auth"
                  : "error";
            const statusText =
              server.state === "connected"
                ? server.name + " · " + server.toolCount + " tools"
                : server.state === "needs-auth"
                  ? server.name + " · needs auth"
                  : server.name + " · unavailable";
            items.push('<span class="status-pill ' + statusClass + '">' + escapeHtml(statusText) + "</span>");
          });
        }

        statusStripEl.innerHTML = items.join("");
      }

      function renderSessionTabs() {
        if (!sessionsState.loaded) {
          sessionTabsEl.classList.remove("visible");
          sessionTabsEl.innerHTML = "";
          return;
        }

        const visibleSessions = sessionsState.sessions.slice(0, 6);
        const overflowCount = Math.max(0, sessionsState.sessions.length - visibleSessions.length);

        sessionTabsEl.classList.add("visible");
        sessionTabsEl.innerHTML =
          visibleSessions
            .map(session => {
              const isActive = session.id === sessionsState.activeId;
              return '<button class="session-tab' + (isActive ? " active" : "") + '" type="button" data-session-switch="' + escapeHtml(session.id) + '" title="' + escapeHtml(session.title || "新对话") + '">' +
                '<span class="session-tab-title">' + escapeHtml(session.title || "新对话") + "</span>" +
                "</button>";
            })
            .join("") +
          '<button class="session-tab session-tab-add" id="sessionTabNew" type="button" title="新建对话">+</button>' +
          (overflowCount > 0
            ? '<button class="session-tab session-tab-more" id="sessionTabMore" type="button" title="更多会话">+' + overflowCount + "</button>"
            : "");

        sessionTabsEl.querySelectorAll("[data-session-switch]").forEach(button => {
          button.addEventListener("click", () => {
            const id = button.getAttribute("data-session-switch");
            if (!id || id === sessionsState.activeId) {
              return;
            }
            vscode.postMessage({ type: "sessions:switch", id });
          });
        });

        document.getElementById("sessionTabNew")?.addEventListener("click", () => {
          vscode.postMessage({ type: "sessions:new" });
        });

        document.getElementById("sessionTabMore")?.addEventListener("click", showSessions);
      }

      function requestSessionsPreload() {
        if (
          !state.ready ||
          !state.onboardingDone ||
          !state.multiSessionEnabled ||
          sessionsState.loaded ||
          sessionsState.requested
        ) {
          return;
        }

        sessionsState.requested = true;
        vscode.postMessage({ type: "sessions:load" });
      }

      function renderActivityCard(entries, title, subtitle) {
        if (!entries || entries.length === 0) {
          return "";
        }

        const steps = entries
          .map(entry => {
            const detail = entry.detail
              ? '<div class="thinking-detail">' + escapeHtml(entry.detail) + "</div>"
              : "";
            return '<div class="thinking-step ' + escapeHtml(entry.status) + '">' +
              '  <div class="thinking-dot" aria-hidden="true"></div>' +
              '  <div>' +
              '    <div class="thinking-label">' + escapeHtml(entry.label) + "</div>" +
              detail +
              "  </div>" +
              "</div>";
          })
          .join("");

        return '<div class="thinking-card">' +
          '  <div class="thinking-head">' +
          '    <div class="thinking-title">' + escapeHtml(title) + "</div>" +
          '    <div class="thinking-subtitle">' + escapeHtml(subtitle) + "</div>" +
          "  </div>" +
          '  <div class="thinking-list">' + steps + "</div>" +
          "</div>";
      }

      function getMessageIdentity(message) {
        return [
          message?.role || "",
          message?.kind || "",
          String(message?.content || "")
        ].join("::");
      }

      function getLastAssistantMessageIndex(messages) {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === "assistant") {
            return index;
          }
        }

        return -1;
      }

      function didConversationReset(previousMessages, nextMessages) {
        if (!Array.isArray(previousMessages) || previousMessages.length === 0) {
          return false;
        }

        if (!Array.isArray(nextMessages) || nextMessages.length === 0) {
          return true;
        }

        if (nextMessages.length < previousMessages.length) {
          return true;
        }

        const compareCount = Math.min(2, previousMessages.length, nextMessages.length);

        for (let index = 0; index < compareCount; index += 1) {
          if (getMessageIdentity(previousMessages[index]) !== getMessageIdentity(nextMessages[index])) {
            return true;
          }
        }

        return false;
      }

      function hasNewUserMessage(previousMessages, nextMessages) {
        if (!Array.isArray(nextMessages) || nextMessages.length <= previousMessages.length) {
          return false;
        }

        return nextMessages.slice(previousMessages.length).some(message => message?.role === "user");
      }

      function getWorkerGroupById(groupId) {
        return workerGroups.find(group => group.id === groupId) || null;
      }

      function releaseActiveWorkerGroup() {
        activeWorkerGroupId = null;
      }

      function resetWorkerGroups() {
        workerGroups.length = 0;
        workerGroupByWorkerId.clear();
        expandedWorkers.clear();
        activeWorkerGroupId = null;
        nextWorkerGroupSequence = 1;
      }

      function createWorkerGroup() {
        const group = {
          id: "swarm-group-" + nextWorkerGroupSequence++,
          anchorMessageIndex: -1, // always tail during execution; pinned inline on completion
          createdAt: Date.now(),
          workers: new Map(),
          pinnedActivities: null,  // filled when turn completes
          activityCollapsed: true, // collapsed by default after pinning
        };

        workerGroups.push(group);
        activeWorkerGroupId = group.id;
        return group;
      }

      function resolveWorkerGroup(workerId) {
        const existingGroupId = workerGroupByWorkerId.get(workerId);

        if (existingGroupId) {
          return getWorkerGroupById(existingGroupId);
        }

        const activeGroup = activeWorkerGroupId ? getWorkerGroupById(activeWorkerGroupId) : null;
        const targetGroup = activeGroup || createWorkerGroup();
        workerGroupByWorkerId.set(workerId, targetGroup.id);
        return targetGroup;
      }

      function getSortedWorkers(source) {
        return Array.from(source.values())
          .filter(worker => worker && worker.id)
          .sort((left, right) => (left.startedAt || 0) - (right.startedAt || 0));
      }

      function truncateWorkerPreview(value, maxLength = 80) {
        const normalized = String(value || "").replace(/\s+/g, " ").trim();

        if (!normalized) {
          return "";
        }

        if (normalized.length <= maxLength) {
          return normalized;
        }

        return normalized.slice(0, Math.max(0, maxLength - 1)) + "…";
      }

      function getWorkerStatusLabel(status) {
        switch (status) {
          case "running":
            return "运行中";
          case "done":
            return "已完成";
          case "error":
            return "出错";
          case "timeout":
            return "超时";
          default:
            return "排队中";
        }
      }

      function renderWorkerTranscriptMessage(message) {
        const role = message?.role || "assistant";
        let body = "";

        try {
          body = renderMessageContent(message?.content || "");
        } catch (_error) {
          body = '<p class="md-paragraph">' + escapeHtml(message?.content || "") + "</p>";
        }

        return '<div class="swarm-transcript-item ' + escapeHtml(role) + '">' +
          '  <div class="swarm-transcript-head">' +
          '    <div class="swarm-transcript-role">' + escapeHtml(role) + "</div>" +
          "  </div>" +
          '  <div class="swarm-transcript-body">' + body + "</div>" +
          "</div>";
      }

      function renderPinnedActivityCard(group) {
        const activities = group.pinnedActivities;
        if (!activities || activities.length === 0) return "";
        const collapsed = group.activityCollapsed;
        const collapseClass = collapsed ? "thinking-card-collapsed" : "thinking-card-expanded";

        const stepsHtml = collapsed ? "" :
          '<div class="thinking-list">' +
          activities.map(entry => {
            const detail = entry.detail
              ? '<div class="thinking-detail">' + escapeHtml(entry.detail) + "</div>"
              : "";
            return '<div class="thinking-step ' + escapeHtml(entry.status) + '">' +
              '<div class="thinking-dot" aria-hidden="true"></div>' +
              '<div><div class="thinking-label">' + escapeHtml(entry.label) + "</div>" + detail + "</div>" +
              "</div>";
          }).join("") +
          "</div>";

        return '<div class="thinking-card ' + collapseClass + '" data-activity-toggle="' + escapeHtml(group.id) + '">' +
          '<div class="thinking-head">' +
          '<div class="thinking-title">本轮过程</div>' +
          '<div class="thinking-subtitle">' + activities.length + ' 步 · 已完成</div>' +
          '<div class="thinking-chevron">▶</div>' +
          '</div>' +
          stepsHtml +
          '</div>';
      }

      function renderWorkerGroupInline(group) {
        const workerList = getSortedWorkers(group.workers);

        if (workerList.length === 0) {
          return "";
        }

        const cards = workerList
          .map(worker => {
            const isExpanded = expandedWorkers.has(worker.id);
            const preview = truncateWorkerPreview(
              worker.latestMessage || (worker.status === "error" || worker.status === "timeout" ? worker.error || "" : ""),
              80,
            ) || "Waiting for Agent response...";
            const transcript = Array.isArray(worker.transcript) ? worker.transcript : [];
            const transcriptHtml = isExpanded
              ? (
                  transcript.length > 0
                    ? transcript.map(renderWorkerTranscriptMessage).join("")
                    : '<div class="swarm-worker-empty">No transcript yet for this worker.</div>'
                )
              : "";
            const errorHtml =
              (worker.status === "error" || worker.status === "timeout") && worker.error
                ? '<div class="swarm-worker-error">' + escapeHtml(worker.error) + "</div>"
                : "";
            const modelHtml = worker.model
              ? '<div class="swarm-worker-model">' + escapeHtml(worker.model) + "</div>"
              : "";

            return '<div class="swarm-worker-card' + (isExpanded ? " expanded" : "") + '">' +
              '  <button class="swarm-worker-toggle" type="button" data-worker-toggle="' + escapeHtml(worker.id) + '">' +
              '    <div class="swarm-worker-summary">' +
              '      <div class="swarm-worker-main">' +
              '        <div class="swarm-worker-topline">' +
              '          <span class="swarm-worker-name">' + escapeHtml(worker.name || worker.id) + "</span>" +
              '          <span class="swarm-worker-alias">' + escapeHtml(worker.providerAlias || "worker") + "</span>" +
              "        </div>" +
              modelHtml +
              '        <div class="swarm-worker-preview">' + escapeHtml(preview) + "</div>" +
              "      </div>" +
              '      <div class="swarm-worker-side">' +
              '        <span class="swarm-worker-status ' + escapeHtml(worker.status || "pending") + '">' +
              '          <span class="swarm-worker-status-dot" aria-hidden="true"></span>' +
              "          " + escapeHtml(getWorkerStatusLabel(worker.status || "pending")) +
              "        </span>" +
              '        <span class="swarm-worker-chevron">' + (isExpanded ? "Collapse" : "Expand") + "</span>" +
              "      </div>" +
              "    </div>" +
              "  </button>" +
              errorHtml +
              (isExpanded ? '<div class="swarm-worker-transcript">' + transcriptHtml + "</div>" : "") +
              "</div>";
          })
          .join("");

        // 活动日志（折叠态）在 Worker 卡片上方
        const activityHtml = renderPinnedActivityCard(group);

        return activityHtml +
          '<div class="message assistant swarm-message">' +
          '<div class="swarm-message-head">' +
          '  <div class="swarm-message-title">SWARM WORKERS · 智能体Agent协作</div>' +
          '  <div class="swarm-message-meta">' + workerList.length + " 个 Agent</div>" +
          "</div>" +
          cards +
          "</div>";
      }

      function getWorkerGroupsByAnchor() {
        const groupsByAnchor = new Map();

        workerGroups.forEach(group => {
          const html = renderWorkerGroupInline(group);

          if (!html) {
            return;
          }

          const anchorKey = group.anchorMessageIndex >= 0 ? String(group.anchorMessageIndex) : "__tail__";
          const groupHtml = groupsByAnchor.get(anchorKey) || [];
          groupHtml.push(html);
          groupsByAnchor.set(anchorKey, groupHtml);
        });

        return groupsByAnchor;
      }

      function clearExpandedThinkingSummaries() {
        expandedThinkingSummaries.clear();
      }

      function getThinkingSummaryToggleId(messageIndex) {
        return "thinking-summary-" + String(messageIndex);
      }

      function renderThinkingSummaryCard(message, messageIndex) {
        const toggleId = getThinkingSummaryToggleId(messageIndex);
        const expanded = expandedThinkingSummaries.has(toggleId);
        const collapseClass = expanded
          ? "thinking-card-expanded"
          : "thinking-card-collapsed";
        let body = "";

        try {
          body = renderMessageContent(message.content);
        } catch (_error) {
          body = '<p class="md-paragraph">' + escapeHtml(message.content) + "</p>";
        }

        return '<div class="message assistant thinking-summary thinking-card ' + collapseClass + '">' +
          '<button class="thinking-head thinking-summary-toggle" type="button" data-thinking-toggle="' +
          escapeHtml(toggleId) + '">' +
          '<div class="thinking-title">思考摘要</div>' +
          '<div class="thinking-chevron">▶</div>' +
          "</button>" +
          (expanded
            ? '<div class="message-body thinking-summary-body">' + body + "</div>"
            : "") +
          "</div>";
      }

      function pinWorkerGroupsToLastUserMessage(messages, activities) {
        if (workerGroups.length === 0) return;
        let lastUserIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role === "user") { lastUserIndex = i; break; }
        }
        if (lastUserIndex >= 0) {
          for (const group of workerGroups) {
            group.anchorMessageIndex = lastUserIndex;
            // 把本轮活动日志存进 group，inline 渲染（折叠态）
            if (activities && activities.length > 0 && group.pinnedActivities === null) {
              group.pinnedActivities = [...activities];
              group.activityCollapsed = true;
            }
          }
        }
      }

      function applyStateMessage(message) {
        if (message.type === "state") {
          state.ready = true;
        }

        const nextMessages = Array.isArray(message.messages) ? message.messages : state.messages;
        const previousMessages = Array.isArray(state.messages) ? state.messages : [];

        const conversationReset = didConversationReset(previousMessages, nextMessages);

        if (conversationReset || hasNewUserMessage(previousMessages, nextMessages)) {
          resetWorkerGroups();
          if (conversationReset) {
            clearExpandedThinkingSummaries();
          }
          clearStreamingText();
        }

        const previousIsBusy = state.isBusy;
        state.messages = nextMessages;
        state.isBusy = "isBusy" in message ? message.isBusy === true : state.isBusy;
        if ("streamingText" in message) {
          const incomingStreamingText = String(message.streamingText || "");
          if (incomingStreamingText) {
            state.streamingText = incomingStreamingText;
          } else if (!state.isBusy) {
            state.streamingText = "";
          }
        }

        state.providerLabel = message.providerLabel || state.providerLabel || "Not connected";
        if ("effortLevel" in message) {
          state.effortLevel = message.effortLevel || null;
        }
        if ("fastMode" in message) {
          state.fastMode = message.fastMode === true;
        }
        if ("fastModeLabel" in message) {
          state.fastModeLabel = message.fastModeLabel || "off";
        }
        if ("fastModeConnected" in message) {
          state.fastModeConnected = message.fastModeConnected === true;
        }
        state.mcpServers = Array.isArray(message.mcpServers) ? message.mcpServers : state.mcpServers;
        state.liveActivities = Array.isArray(message.liveActivities) ? message.liveActivities : state.liveActivities;
        state.lastRunActivities = Array.isArray(message.lastRunActivities) ? message.lastRunActivities : state.lastRunActivities;
        if ("planMode" in message && message.planMode) {
          state.planMode = {
            active: message.planMode.active === true,
            planFilePath: message.planMode.planFilePath || null
          };
        }
        if ("multiSessionEnabled" in message) {
          state.multiSessionEnabled = message.multiSessionEnabled === true;
          if (!state.multiSessionEnabled) {
            sessionsState.sessions = [];
            sessionsState.activeId = null;
            sessionsState.loaded = false;
            sessionsState.requested = false;
          }
        }

        // 执行完成时：把 Worker 卡片从 tail 钉到对应的 user 消息之后，持久留在对话流
        // 注意：必须在 lastRunActivities 更新之后调用，否则 pin 时拿到的是旧值
        if (previousIsBusy && !state.isBusy) {
          pinWorkerGroupsToLastUserMessage(state.messages, state.lastRunActivities);
        }
        if (!state.isBusy) {
          clearStreamingText();
        }

        state.pendingApproval = "pendingApproval" in message ? message.pendingApproval || null : state.pendingApproval;
        requestSessionsPreload();
        render();
      }

      function renderApproval() {
        const approval = state.pendingApproval;

        if (!approval) {
          composerApprovalMountEl.innerHTML = "";
          return;
        }

        composerApprovalMountEl.innerHTML =
          '<div class="composer-approval visible">' +
          '  <div class="composer-approval-title">' + escapeHtml(approval.title) + "</div>" +
          '  <div class="composer-approval-note">' + escapeHtml(approval.summary) + "</div>" +
          (
            approval.kind === "file"
              ? '  <div class="composer-approval-path">' + escapeHtml(approval.path) + "</div>"
              : '  <div class="composer-approval-preview">' + escapeHtml(approval.inputPreview) + "</div>"
          ) +
          (
            approval.kind === "file"
              ? '  <div class="composer-approval-tip">Diff 预览已经在编辑器里打开，确认后才会真正执行。</div>'
              : '  <div class="composer-approval-tip">确认后才会真正执行这个动作。</div>'
          ) +
          '  <div class="composer-approval-actions">' +
          '    <button class="secondary" id="rejectApprovalButtonInline" type="button">拒绝</button>' +
          '    <button id="approveApprovalButtonInline" type="button">批准</button>' +
          "  </div>" +
          "</div>";

        function approve() {
          vscode.postMessage({ type: "approvePendingAction" });
        }

        function reject() {
          vscode.postMessage({ type: "rejectPendingAction" });
        }

        document.getElementById("approveApprovalButtonInline")?.addEventListener("click", approve);
        document.getElementById("rejectApprovalButtonInline")?.addEventListener("click", reject);
      }

      function renderWelcome() {
        const starterButtons = starterPrompts
          .map(prompt => '<button class="suggestion" type="button" data-prompt="' + escapeHtml(prompt) + '">' + escapeHtml(prompt) + "</button>")
          .join("");
        const mcpSummary = state.mcpServers.length === 0
          ? "MCP 未探测"
          : state.mcpServers
              .map(server =>
                server.name +
                ": " +
                (server.state === "connected"
                  ? server.toolCount + " tools"
                  : server.state === "needs-auth"
                    ? "needs auth"
                    : "unavailable"))
              .join(" / ");

        messagesEl.classList.add("empty-mode");
        messagesEl.innerHTML =
          '<div class="welcome">' +
          '  <div class="welcome-card">' +
          '    <div class="welcome-inner">' +
          '      <div class="welcome-kicker">' +
          '        <strong>WELCOME</strong>' +
          '        <span>像 Claude Code 一样开聊，但权限和配置都在你手里</span>' +
          "      </div>" +
          '      <div class="welcome-title">Welcome to <span>KainClaw</span></div>' +
          '      <div class="welcome-note">这里已经支持读写工作区、差异确认、浏览器会话、网页抓取和 MCP 工具接入。</div>' +
          '      <div class="rule">............................................................</div>' +
          '      <div class="stage">' +
          '        <div class="clawd-shell" aria-hidden="true">' +
          '          <div class="clawd">' +
          '            <span class="clawd-ear left"></span>' +
          '            <span class="clawd-ear right"></span>' +
          '            <span class="clawd-face">' +
          '              <span class="clawd-eye left"></span>' +
          '              <span class="clawd-eye right"></span>' +
          '              <span class="clawd-mouth"></span>' +
          "            </span>" +
          '            <span class="clawd-paws"><span></span><span></span></span>' +
          "          </div>" +
          "        </div>" +
          '        <div class="meta">' +
          '          <div class="meta-row"><span class="meta-label">Provider</span><span class="meta-value">' + escapeHtml(state.providerLabel) + "</span></div>" +
          '          <div class="meta-row"><span class="meta-label">Mode</span><span class="meta-value">本地工作区 / 浏览器 / MCP / OpenAI-compatible</span></div>' +
          '          <div class="meta-row"><span class="meta-label">MCP</span><span class="meta-value">' + escapeHtml(mcpSummary) + "</span></div>" +
          '          <div class="meta-row"><span class="meta-label">Hint</span><span class="meta-value">写文件前会停下来等你确认，外部动作也可以继续加审批</span></div>' +
          "        </div>" +
          "      </div>" +
          '      <div class="suggestions">' + starterButtons + "</div>" +
          "    </div>" +
          "  </div>" +
          "</div>";

        messagesEl.querySelectorAll("[data-prompt]").forEach(button => {
          button.addEventListener("click", () => {
            promptEl.value = button.getAttribute("data-prompt") || "";
            promptEl.focus();
          });
        });
      }

      function getMessageClassName(message) {
        if (message.kind === "error") {
          return "message error";
        }

        if (message.kind === "thinking") {
          return "message assistant thinking-summary";
        }

        return "message " + message.role;
      }

      function renderMessageCard(message, messageIndex) {
        if (message.kind === "thinking") {
          return renderThinkingSummaryCard(message, messageIndex);
        }

        const className = getMessageClassName(message);
        let body = "";

        try {
          body = renderMessageContent(message.content);
        } catch (_error) {
          body = '<p class="md-paragraph">' + escapeHtml(message.content) + "</p>";
        }

        return '<div class="' + className + '"><div class="message-body">' + body + "</div></div>";
      }

      function renderMessagesLegacy(options = {}) {
        const shouldScroll = options.scroll !== false;
        const workerGroupsByAnchor = getWorkerGroupsByAnchor();

        messagesEl.classList.remove("empty-mode");
        messagesEl.innerHTML = state.messages
          .map((message, index) => {
            const workerHtml = (workerGroupsByAnchor.get(String(index)) || []).join("");
            return renderMessageCard(message, index) + workerHtml;
          })
          .join("");

        const hasStreaming = state.isBusy && !!state.streamingText;
        const streamingHtml = hasStreaming
          ? '<div class="message assistant" id="streamingMessage"><div class="message-body">' + renderMessageContent(state.streamingText) + "</div></div>"
          : "";

        // 活动日志已 inline（pin 到 user 消息）时不再在 tail 重复渲染
        const hasPinnedActivities = workerGroups.some(g => g.pinnedActivities !== null);

        // 活动卡片：仅在 tail（执行中或无 Swarm 时）
        const activityHtml = !hasStreaming && !hasPinnedActivities && state.liveActivities.length > 0
          ? renderActivityCard(state.liveActivities, "思考中", "这里展示执行步骤和工具过程")
          : !hasStreaming && !hasPinnedActivities && state.lastRunActivities.length > 0
            ? renderActivityCard(state.lastRunActivities, "本轮过程", "刚刚完成")
            : "";

        if (activityHtml) {
          messagesEl.innerHTML += activityHtml;
        }

        // Worker 卡片（tail：执行中；inline：完成后已由 anchor 渲染）
        const trailingWorkerHtml = (workerGroupsByAnchor.get("__tail__") || []).join("");

        if (trailingWorkerHtml) {
          messagesEl.innerHTML += trailingWorkerHtml;
        }

        if (streamingHtml) {
          messagesEl.innerHTML += streamingHtml;
        }

        if (shouldScroll) {
          scrollMessagesToBottom();
        }
      }

      function renderMessages(options = {}) {
        const shouldScroll = options.scroll !== false;
        const workerGroupsByAnchor = getWorkerGroupsByAnchor();
        const hasStreaming = state.isBusy && !!state.streamingText;
        const streamingHtml = hasStreaming
          ? '<div class="message assistant" id="streamingMessage"><div class="message-body">' + renderMessageContent(state.streamingText) + "</div></div>"
          : "";
        const hasPinnedActivities = workerGroups.some(g => g.pinnedActivities !== null);
        const liveActivityHtml = !hasStreaming && !hasPinnedActivities && state.liveActivities.length > 0
          ? renderActivityCard(state.liveActivities, "思考中", "这里展示执行步骤和工具过程")
          : "";
        const completedActivityHtml = !hasStreaming && !hasPinnedActivities && !liveActivityHtml && state.lastRunActivities.length > 0
          ? renderActivityCard(state.lastRunActivities, "本轮过程", "刚刚完成")
          : "";
        let lastAssistantIndex = -1;

        if (completedActivityHtml) {
          for (let i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i]?.role === "assistant") {
              lastAssistantIndex = i;
              break;
            }
          }
        }

        messagesEl.classList.remove("empty-mode");
        messagesEl.innerHTML = state.messages
          .map((message, index) => {
            const workerHtml = (workerGroupsByAnchor.get(String(index)) || []).join("");
            const completedActivityBeforeMessage = completedActivityHtml && index === lastAssistantIndex
              ? completedActivityHtml
              : "";
            return completedActivityBeforeMessage + renderMessageCard(message, index) + workerHtml;
          })
          .join("");

        if (completedActivityHtml && lastAssistantIndex === -1) {
          messagesEl.innerHTML += completedActivityHtml;
        }

        if (liveActivityHtml) {
          messagesEl.innerHTML += liveActivityHtml;
        }

        const trailingWorkerHtml = (workerGroupsByAnchor.get("__tail__") || []).join("");

        if (trailingWorkerHtml) {
          messagesEl.innerHTML += trailingWorkerHtml;
        }

        if (streamingHtml) {
          messagesEl.innerHTML += streamingHtml;
        }

        if (shouldScroll) {
          scrollMessagesToBottom();
        }
      }

      function appendMessage(role, content, kind = "chat") {
        state.messages.push({
          role,
          content,
          ...(kind !== "chat" ? { kind } : {})
        });
        renderMessages({ scroll: true });
      }

      function sendPrompt() {
        const prompt = promptEl.value.trim();
        if (!state.ready || !prompt || state.isBusy || state.pendingApproval) {
          return;
        }

        clearStreamingText();
        hideSlashMenu();
        const attachmentsToSend = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
        vscode.postMessage({
          type: "sendPrompt",
          prompt,
          ...(attachmentsToSend ? { attachments: attachmentsToSend } : {})
        });
        promptEl.value = "";
        pendingAttachments = [];
        renderAttachmentPreviews();
      }

      function render() {
        subtitleEl.textContent = "Provider: " + state.providerLabel;
        renderStatusStrip();
        renderSessionTabs();
        statusEl.textContent = state.pendingApproval
          ? "等待你的确认..."
          : !state.ready
            ? "正在恢复会话与工作区状态..."
          : state.isBusy
            ? "思考中..."
            : state.planMode && state.planMode.active
              ? "Plan Mode 已开启，只允许编辑计划文件。"
            : "输入 / 打开快捷指令，回车发送，Shift+回车换行。";

        sendButtonEl.disabled = !state.ready || state.isBusy || !!state.pendingApproval;
        clearButtonEl.disabled = state.isBusy;
        promptEl.disabled = !state.ready || state.isBusy || !!state.pendingApproval;
        if (attachmentButtonEl) attachmentButtonEl.disabled = !state.ready || state.isBusy || !!state.pendingApproval;
        document.querySelectorAll("[data-quick-action]").forEach(button => {
          button.disabled = !state.ready || state.isBusy || !!state.pendingApproval;
        });
        document.querySelectorAll("[data-inject-action]").forEach(button => {
          button.disabled = !state.ready || state.isBusy || !!state.pendingApproval;
        });

        renderApproval();
        if (state.isBusy || state.pendingApproval) {
          hideSlashMenu();
        } else {
          updateSlashMenu();
        }

        if (state.pendingApproval) {
          composerApprovalMountEl.scrollIntoView({ block: "nearest" });
        }

        if (state.messages.length === 0) {
          renderWelcome();
          return;
        }

        renderMessages();
      }

      sendButtonEl.addEventListener("click", sendPrompt);
      clearButtonEl.addEventListener("click", () => {
        resetWorkerGroups();
        clearStreamingText();
        if (state.messages.length === 0) {
          render();
        } else {
          renderMessages({ scroll: false });
        }
        vscode.postMessage({ type: "clearChat" });
      });
      document.querySelectorAll("[data-quick-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-quick-action");
          if (!action || state.isBusy || state.pendingApproval) {
            return;
          }

          vscode.postMessage({
            type: "runQuickAction",
            action
          });
        });
      });

      document.querySelectorAll("[data-inject-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-inject-action");
          if (!action || state.isBusy || state.pendingApproval) {
            return;
          }

          if (action === "selection") {
            vscode.postMessage({ type: "requestEditorSelection" });
          }
        });
      });

      promptEl.addEventListener("input", updateSlashMenu);
      promptEl.addEventListener("focus", updateSlashMenu);
      promptEl.addEventListener("keydown", event => {
        if (slashMenuState.items.length) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSlashMenuSelection(1);
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSlashMenuSelection(-1);
            return;
          }

          if (event.key === "Tab") {
            event.preventDefault();
            applySlashCommandSelection(slashMenuState.selectedIndex, false);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            hideSlashMenu();
            return;
          }
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          if (slashMenuState.items.length) {
            applySlashCommandSelection(slashMenuState.selectedIndex, true);
            return;
          }
          sendPrompt();
        }
      });

      slashMenuEl.addEventListener("mousedown", event => {
        event.preventDefault();
      });
      slashMenuEl.addEventListener("click", event => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const item = target.closest("[data-slash-index]");
        if (!item) {
          return;
        }

        const index = Number(item.getAttribute("data-slash-index"));
        if (Number.isNaN(index)) {
          return;
        }

        applySlashCommandSelection(index, true);
      });
      document.addEventListener("mousedown", event => {
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }

        if (target === promptEl || promptEl.contains(target) || slashMenuEl.contains(target)) {
          return;
        }

        hideSlashMenu();
      });

      messagesEl.addEventListener("click", event => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        const activityToggle = target.closest("[data-activity-toggle]");
        if (activityToggle) {
          const groupId = activityToggle.getAttribute("data-activity-toggle");
          const group = workerGroups.find(g => g.id === groupId);
          if (group && group.pinnedActivities) {
            group.activityCollapsed = !group.activityCollapsed;
            renderMessages({ scroll: false });
          }
          return;
        }

        const thinkingToggle = target.closest("[data-thinking-toggle]");
        if (thinkingToggle) {
          const toggleId = thinkingToggle.getAttribute("data-thinking-toggle");
          if (!toggleId) {
            return;
          }

          if (expandedThinkingSummaries.has(toggleId)) {
            expandedThinkingSummaries.delete(toggleId);
          } else {
            expandedThinkingSummaries.add(toggleId);
          }

          renderMessages({ scroll: false });
          return;
        }

        const toggleButton = target.closest("[data-worker-toggle]");

        if (!toggleButton) {
          return;
        }

        const workerId = toggleButton.getAttribute("data-worker-toggle");

        if (!workerId) {
          return;
        }

        if (expandedWorkers.has(workerId)) {
          expandedWorkers.delete(workerId);
        } else {
          expandedWorkers.add(workerId);
        }

        renderMessages({ scroll: false });
      });

      window.addEventListener("message", event => {
        const message = event.data;

        if (message.type === "companion:init") {
          initCompanion(message.companion);
        } else if (message.type === "companion:state") {
          setCompanionState(message.state);
        } else if (message.type === "companion:mood") {
          if (message.companion) {
            companionData = message.companion;
            updateCompanionSprite();
          } else if (companionData) {
            companionData.moodLevel = Math.max(0, Math.min(100, companionData.moodLevel + message.delta));
            updateCompanionSprite();
          }
        } else if (message.type === "state" || message.type === "stateUpdate") {
          applyStateMessage(message);
        } else if (message.type === "chat:token") {
          const token = String(message.token || "");
          if (!token) {
            return;
          }
          state.streamingText = (state.streamingText || "") + token;
          updateStreamingBubble(state.streamingText, true);
        } else if (message.type === "clear") {
          resetWorkerGroups();
          clearExpandedThinkingSummaries();
          clearStreamingText();
          render();
        } else if (message.type === "swarm:workerUpdate") {
          const worker = message.worker;

          if (worker && worker.id) {
            const group = resolveWorkerGroup(worker.id);

            if (group) {
              group.workers.set(worker.id, { ...(group.workers.get(worker.id) || {}), ...worker });
              renderMessages();
            }
          }
        } else if (message.type === "showOnboarding") {
          showOnboarding();
        } else if (message.type === "onboarding:keyValid") {
          // 验证通过，进入完成步骤，先保存数据
          const apiKey = document.getElementById("ob-apikey")?.value.trim() || "";
          const model = document.getElementById("ob-model")?.value.trim() || "";
          const baseUrl = onboardingBaseUrl;
          const meta = { id: "", alias: onboardingProvider, type: onboardingProvider, model, baseUrl };
          vscode.postMessage({ type: "onboarding:complete", providerMeta: meta, apiKey });
        } else if (message.type === "onboarding:keyInvalid") {
          showObError(message.error || "Key 验证失败，请检查后重试。");
        } else if (message.type === "onboarding:done") {
          onboardingStep = 2;
          renderOnboarding();
        } else if (message.type === "showSettings") {
          showSettings();
        } else if (message.type === "settings:data") {
          settingsData = {
            providers: message.providers || [],
            activeId: message.activeId || "",
            licenseActivated: message.licenseActivated || false,
            showThinkingSummaries: message.showThinkingSummaries !== false
          };
          renderSettings();
        } else if (message.type === "license:result") {
          if (message.success) {
            settingsData.licenseActivated = true;
            renderSettings();
          } else {
            const errEl = document.getElementById("license-error");
            if (errEl) { errEl.style.display = "block"; errEl.textContent = message.error || "激活失败"; }
            const btn = document.getElementById("license-activate-btn");
            if (btn) { btn.disabled = false; btn.textContent = "激活"; }
          }
        } else if (message.type === "license:required") {
          hideSessions();
          appendMessage("assistant", "此功能需要激活 License，请前往 ⚙ 设置面板输入激活码。");
        } else if (message.type === "sessions:data") {
          sessionsState.sessions = message.sessions || [];
          sessionsState.activeId = message.activeId || null;
          sessionsState.loaded = true;
          renderSessionTabs();
          renderSessionsList(message.sessions || [], message.activeId);
        } else if (message.type === "editorSelection") {
          if (message.selectedText) {
            const lang = message.language || "";
            const block = "\x60\x60\x60" + lang + "\\n" + message.selectedText + "\\n\x60\x60\x60\\n\\n";
            const current = promptEl.value;
            promptEl.value = current ? block + current : block;
            promptEl.focus();
            promptEl.setSelectionRange(promptEl.value.length, promptEl.value.length);
          } else {
            const prev = statusEl.textContent;
            statusEl.textContent = "先在编辑器里选中代码再注入。";
            setTimeout(() => { statusEl.textContent = prev; }, 2500);
          }
        }
      });

      // ── F01 Onboarding ──────────────────────────────────
      const onboardingEl = document.getElementById("onboardingOverlay");
      let onboardingStep = 0; // 0=选Provider 1=填Key 2=完成
      let onboardingProvider = "anthropic";
      let onboardingBaseUrl = "";

      function showOnboarding() {
        onboardingStep = 0;
        onboardingEl.style.display = "block";
        renderOnboarding();
      }

      function hideOnboarding() {
        onboardingEl.style.display = "none";
      }

      function renderOnboarding() {
        const providerOptions = [
          { value: "anthropic",         label: "Anthropic Claude",    hint: "官方 Claude API，需要 Anthropic API Key" },
          { value: "openai",            label: "OpenAI",              hint: "官方 OpenAI API，需要 OpenAI API Key" },
          { value: "openai-compatible", label: "OpenAI 兼容接口",     hint: "DeepSeek / 通义 / 中转站 / Ollama 等，需要 Base URL + Key" },
          { value: "claude-cli",        label: "本机 Claude CLI",     hint: "已安装 claude CLI，无需 API Key" },
        ];

        if (onboardingStep === 0) {
          onboardingEl.innerHTML =
            '<div style="max-width:480px;margin:0 auto;">' +
            '<div style="font-size:22px;font-weight:700;margin-bottom:6px;">欢迎使用 <span style="color:var(--brand)">KainClaw</span></div>' +
            '<div style="font-size:13px;opacity:0.8;margin-bottom:24px;">先选择你的 AI Provider，然后填入 API Key，3 步完成配置。</div>' +
            '<div style="font-size:12px;font-weight:600;margin-bottom:10px;opacity:0.7;letter-spacing:0.06em;">选择 Provider</div>' +
            providerOptions.map(opt =>
              '<div data-provider="' + opt.value + '" style="cursor:pointer;padding:12px 14px;border-radius:12px;border:1px solid ' +
              (onboardingProvider === opt.value ? 'var(--brand)' : 'var(--vscode-panel-border)') +
              ';background:' + (onboardingProvider === opt.value ? 'color-mix(in srgb,var(--brand) 12%,transparent)' : 'transparent') +
              ';margin-bottom:8px;">' +
              '<div style="font-size:13px;font-weight:600;">' + escapeHtml(opt.label) + '</div>' +
              '<div style="font-size:11px;opacity:0.75;margin-top:3px;">' + escapeHtml(opt.hint) + '</div>' +
              '</div>'
            ).join("") +
            '<div style="margin-top:20px;display:flex;justify-content:flex-end;">' +
            '<button id="ob-next-0" type="button">下一步 →</button>' +
            '</div></div>';

          onboardingEl.querySelectorAll("[data-provider]").forEach(el => {
            el.addEventListener("click", () => {
              onboardingProvider = el.getAttribute("data-provider");
              renderOnboarding();
            });
          });
          document.getElementById("ob-next-0")?.addEventListener("click", () => {
            if (onboardingProvider === "claude-cli") { onboardingStep = 2; renderOnboarding(); return; }
            onboardingStep = 1; renderOnboarding();
          });

        } else if (onboardingStep === 1) {
          const needsBaseUrl = onboardingProvider === "openai-compatible";
          onboardingEl.innerHTML =
            '<div style="max-width:480px;margin:0 auto;">' +
            '<div style="font-size:18px;font-weight:700;margin-bottom:6px;">填入 API Key</div>' +
            '<div style="font-size:12px;opacity:0.75;margin-bottom:20px;">Key 会加密存储在 VS Code SecretStorage，不会写入任何文件。</div>' +
            (needsBaseUrl ?
              '<div style="margin-bottom:12px;">' +
              '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Base URL <span style="color:#ef5350">*</span></label>' +
              '<input id="ob-baseurl" type="text" placeholder="https://api.deepseek.com/v1" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
              '</div>' : '') +
            '<div style="margin-bottom:12px;">' +
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">API Key <span style="color:#ef5350">*</span></label>' +
            '<input id="ob-apikey" type="password" placeholder="sk-..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">模型名称</label>' +
            '<input id="ob-model" type="text" placeholder="' + (onboardingProvider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o") + '" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
            '</div>' +
            '<div id="ob-error" style="display:none;color:#ef5350;font-size:12px;margin-bottom:10px;padding:8px 12px;border-radius:8px;background:color-mix(in srgb,#ef5350 12%,transparent);border:1px solid color-mix(in srgb,#ef5350 30%,transparent);"></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;">' +
            '<button class="secondary" id="ob-back-1" type="button">← 返回</button>' +
            '<button id="ob-validate" type="button">验证 Key →</button>' +
            '</div></div>';

          document.getElementById("ob-back-1")?.addEventListener("click", () => { onboardingStep = 0; renderOnboarding(); });
          document.getElementById("ob-validate")?.addEventListener("click", () => {
            const apiKey = document.getElementById("ob-apikey").value.trim();
            const baseUrl = document.getElementById("ob-baseurl")?.value.trim() || "";
            if (!apiKey) { showObError("请填写 API Key"); return; }
            if (onboardingProvider === "openai-compatible" && !baseUrl) { showObError("openai-compatible 类型必须填写 Base URL"); return; }
            onboardingBaseUrl = baseUrl;
            document.getElementById("ob-validate").disabled = true;
            document.getElementById("ob-validate").textContent = "验证中...";
            vscode.postMessage({ type: "onboarding:validateKey", provider: onboardingProvider, apiKey, baseUrl, model: document.getElementById("ob-model")?.value.trim() || "" });
          });

        } else {
          // step 2: 完成
          onboardingEl.innerHTML =
            '<div style="max-width:480px;margin:0 auto;text-align:center;padding-top:40px;">' +
            '<div style="font-size:40px;margin-bottom:16px;">✅</div>' +
            '<div style="font-size:20px;font-weight:700;margin-bottom:8px;">配置完成！</div>' +
            '<div style="font-size:13px;opacity:0.8;margin-bottom:28px;">现在可以开始和 AI 对话了。</div>' +
            '<button id="ob-start" type="button" style="padding:12px 28px;font-size:14px;">开始使用 →</button>' +
            '</div>';
          document.getElementById("ob-start")?.addEventListener("click", () => {
            hideOnboarding();
            render();
          });
        }
      }

      function showObError(msg) {
        const el = document.getElementById("ob-error");
        if (el) { el.style.display = "block"; el.textContent = msg; }
        const btn = document.getElementById("ob-validate");
        if (btn) { btn.disabled = false; btn.textContent = "验证 Key →"; }
      }

      // ── P02 Sessions ──────────────────────────────────────
      const sessionsEl = document.getElementById("sessionsOverlay");

      function showSessions() {
        sessionsEl.style.display = "block";
        if (state.multiSessionEnabled) {
          sessionsState.requested = true;
        }
        vscode.postMessage({ type: "sessions:load" });
      }

      function hideSessions() {
        sessionsEl.style.display = "none";
        vscode.postMessage({ type: "sessions:close" });
      }

      function promptRenameSession(sessionId, currentTitle) {
        const nextTitle = window.prompt("重命名会话", currentTitle || "");
        if (typeof nextTitle !== "string") {
          return;
        }

        const trimmedTitle = nextTitle.trim();
        if (!trimmedTitle || trimmedTitle === currentTitle) {
          return;
        }

        vscode.postMessage({
          type: "sessions:rename",
          id: sessionId,
          title: trimmedTitle,
        });
      }

      function renderSessionsList(sessions, activeId) {
        if (!sessions || sessions.length === 0) {
          sessionsEl.innerHTML =
            '<div style="max-width:480px;margin:0 auto;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
            '<div style="font-size:18px;font-weight:700;">☰ 历史会话</div>' +
            '<button class="secondary" id="sessions-close" type="button">✕ 关闭</button>' +
            '</div>' +
            '<div style="font-size:12px;opacity:0.7;line-height:1.6;margin-bottom:14px;">这里按会话分组，不会把每一轮消息单独列成一条。</div>' +
            '<div style="font-size:13px;opacity:0.6;text-align:center;padding:40px 0;">暂无历史会话</div>' +
            '<button id="sessions-new" type="button" style="width:100%;margin-top:12px;">+ 新建对话</button>' +
            '</div>';
          document.getElementById("sessions-close")?.addEventListener("click", hideSessions);
          document.getElementById("sessions-new")?.addEventListener("click", () => { vscode.postMessage({ type: "sessions:new" }); hideSessions(); });
          return;
        }

        sessionsEl.innerHTML =
          '<div style="max-width:480px;margin:0 auto;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
          '<div style="font-size:18px;font-weight:700;">☰ 历史会话</div>' +
          '<button class="secondary" id="sessions-close" type="button">✕ 关闭</button>' +
          '</div>' +
          '<div style="font-size:12px;opacity:0.7;line-height:1.6;margin-bottom:14px;">这里按会话分组显示。继续在同一会话里聊天时，会更新这条记录的时间、预览和消息条数；点 <code>+ 新建对话</code> 才会新增一条历史项。</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
          '<button id="sessions-new" type="button" class="secondary" style="border-radius:10px;padding:10px;">+ 新建对话</button>' +
          '<button id="sessions-rename-current" type="button" class="secondary" style="border-radius:10px;padding:10px;">重命名当前会话</button>' +
          '</div>' +
          sessions.map(s => {
            const isActive = s.id === activeId;
            const date = new Date(s.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
            const messageCount = typeof s.messageCount === "number" ? s.messageCount : 0;
            return '<div style="padding:12px 14px;border-radius:12px;border:1px solid ' +
              (isActive ? 'var(--brand)' : 'var(--vscode-panel-border)') +
              ';background:' + (isActive ? 'color-mix(in srgb,var(--brand) 8%,transparent)' : 'transparent') +
              ';margin-bottom:8px;">' +
              '<div style="display:flex;align-items:flex-start;gap:8px;">' +
              '<div style="flex:1;min-width:0;cursor:pointer;" data-switch-session="' + escapeHtml(s.id) + '">' +
              '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(s.title) + '</div>' +
              '<div style="font-size:11px;opacity:0.65;margin-top:2px;">' +
                escapeHtml(date) + ' · ' + escapeHtml(String(messageCount)) + ' 条消息' +
                (s.preview ? ' · ' + escapeHtml(s.preview.slice(0, 30)) : '') +
              '</div>' +
              '</div>' +
              '<button class="secondary" data-export-session="' + escapeHtml(s.id) + '" type="button" style="font-size:11px;padding:3px 7px;" title="导出 Markdown">↓</button>' +
              '<button class="secondary" data-delete-session="' + escapeHtml(s.id) + '" type="button" style="font-size:11px;padding:3px 7px;color:#ef5350;" title="删除">✕</button>' +
              '</div>' +
              '</div>';
          }).join("") +
          '</div>';

        document.getElementById("sessions-close")?.addEventListener("click", hideSessions);
        document.getElementById("sessions-new")?.addEventListener("click", () => { vscode.postMessage({ type: "sessions:new" }); hideSessions(); });
        document.getElementById("sessions-rename-current")?.addEventListener("click", () => {
          const currentSession = sessions.find(session => session.id === activeId);
          if (!currentSession) {
            return;
          }
          promptRenameSession(currentSession.id, currentSession.title || "");
        });

        sessionsEl.querySelectorAll("[data-switch-session]").forEach(el => {
          el.addEventListener("click", () => {
            vscode.postMessage({ type: "sessions:switch", id: el.getAttribute("data-switch-session") });
            hideSessions();
          });
        });
        sessionsEl.querySelectorAll("[data-export-session]").forEach(el => {
          el.addEventListener("click", () => vscode.postMessage({ type: "sessions:export", id: el.getAttribute("data-export-session") }));
        });
        sessionsEl.querySelectorAll("[data-delete-session]").forEach(el => {
          el.addEventListener("click", () => {
            vscode.postMessage({ type: "sessions:delete", id: el.getAttribute("data-delete-session") });
          });
        });
      }

      document.getElementById("sessionsBtn")?.addEventListener("click", showSessions);

      // ── F08 Settings ─────────────────────────────────────
      const settingsEl = document.getElementById("settingsOverlay");
      let settingsData = {
        providers: [],
        activeId: "",
        licenseActivated: false,
        showThinkingSummaries: true
      };

      function showSettings() {
        settingsEl.style.display = "block";
        vscode.postMessage({ type: "settings:load" });
        renderSettings();
      }

      function hideSettings() {
        settingsEl.style.display = "none";
        vscode.postMessage({ type: "settings:close" });
      }

      function renderSettings() {
        const { providers, activeId, showThinkingSummaries } = settingsData;
        const providerTypeLabels = { anthropic: "Anthropic", openai: "OpenAI", "openai-compatible": "兼容接口", "claude-cli": "Claude CLI" };

        settingsEl.innerHTML =
          '<div style="max-width:520px;margin:0 auto;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
          '<div style="font-size:18px;font-weight:700;">⚙ 设置</div>' +
          '<button class="secondary" id="settings-close" type="button">✕ 关闭</button>' +
          '</div>' +

          // Provider 列表
          '<div style="font-size:12px;font-weight:600;opacity:0.7;letter-spacing:0.06em;margin-bottom:10px;">API 提供商</div>' +
          (providers.length === 0 ? '<div style="font-size:12px;opacity:0.6;margin-bottom:12px;">暂无配置，点击下方添加。</div>' : '') +
          providers.map(p =>
            '<div style="padding:12px 14px;border-radius:12px;border:1px solid ' +
            (p.id === activeId ? 'var(--brand)' : 'var(--vscode-panel-border)') +
            ';background:' + (p.id === activeId ? 'color-mix(in srgb,var(--brand) 8%,transparent)' : 'transparent') +
            ';margin-bottom:8px;display:flex;align-items:center;gap:10px;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:13px;font-weight:600;">' + escapeHtml(p.alias || p.id) + '</div>' +
            '<div style="font-size:11px;opacity:0.7;margin-top:2px;">' + escapeHtml(providerTypeLabels[p.type] || p.type) +
            (p.model ? ' · ' + escapeHtml(p.model) : '') +
            (p.baseUrl ? ' · ' + escapeHtml(p.baseUrl) : '') +
            (p.hasKey ? ' · Key ✓' : ' · Key 未配置') + '</div>' +
            '</div>' +
            (p.id !== activeId ? '<button class="secondary" data-set-active="' + escapeHtml(p.id) + '" type="button" style="font-size:11px;padding:4px 8px;">设为默认</button>' : '<span style="font-size:11px;color:var(--brand);font-weight:600;">默认</span>') +
            '<button class="secondary" data-edit-provider="' + escapeHtml(p.id) + '" type="button" style="font-size:11px;padding:4px 8px;">编辑</button>' +
            '<button class="secondary" data-delete-provider="' + escapeHtml(p.id) + '" type="button" style="font-size:11px;padding:4px 8px;color:#ef5350;">删除</button>' +
            '</div>'
          ).join("") +

          '<button id="settings-add-provider" type="button" class="secondary" style="margin-top:4px;width:100%;border-radius:10px;padding:10px;">+ 添加 Provider</button>' +

          '<div style="font-size:12px;font-weight:600;opacity:0.7;letter-spacing:0.06em;margin-top:24px;margin-bottom:10px;">思考摘要</div>' +
          '<div style="padding:12px 14px;border-radius:12px;border:1px solid var(--vscode-panel-border);font-size:12px;">' +
          '<label style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;cursor:pointer;">' +
          '<div>' +
          '<div style="font-size:13px;font-weight:600;">显示思考摘要</div>' +
          '<div style="opacity:0.7;margin-top:4px;line-height:1.5;">控制是否显示并持久化模型返回的思考摘要，用于当前会话回放。它们仍然不会进入模型可见历史。</div>' +
          '</div>' +
          '<input id="settings-thinking-toggle" type="checkbox"' + (showThinkingSummaries ? " checked" : "") + ' style="margin-top:2px;" />' +
          '</label>' +
          '</div>' +

          // License
          '<div style="font-size:12px;font-weight:600;opacity:0.7;letter-spacing:0.06em;margin-top:24px;margin-bottom:10px;">LICENSE</div>' +
          '<div style="padding:12px 14px;border-radius:12px;border:1px solid var(--vscode-panel-border);font-size:12px;">' +
          (settingsData.licenseActivated
            ? '<span style="color:#4caf50;font-weight:600;">✓ 已激活付费版</span>'
            : '<div style="opacity:0.7;margin-bottom:10px;">免费版 · 会话持久化、多会话等功能需要激活 License</div>' +
              '<div style="display:flex;gap:8px;">' +
              '<input id="license-key-input" type="text" placeholder="CAIN-XXXX-XXXX-..." style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-size:12px;" />' +
              '<button id="license-activate-btn" type="button" style="padding:8px 12px;font-size:12px;">激活</button>' +
              '</div>' +
              '<div id="license-error" style="display:none;color:#ef5350;font-size:11px;margin-top:6px;"></div>') +
          '</div>' +

          '</div>';

        document.getElementById("settings-close")?.addEventListener("click", hideSettings);
        document.getElementById("settings-add-provider")?.addEventListener("click", () => renderProviderForm(null));
        document.getElementById("settings-thinking-toggle")?.addEventListener("change", event => {
          vscode.postMessage({
            type: "settings:setShowThinkingSummaries",
            enabled: event.target.checked
          });
        });

        document.getElementById("license-activate-btn")?.addEventListener("click", () => {
          const key = document.getElementById("license-key-input")?.value.trim() || "";
          if (!key) return;
          document.getElementById("license-activate-btn").disabled = true;
          document.getElementById("license-activate-btn").textContent = "验证中...";
          vscode.postMessage({ type: "license:activate", key });
        });

        settingsEl.querySelectorAll("[data-set-active]").forEach(btn => {
          btn.addEventListener("click", () => {
            vscode.postMessage({ type: "settings:setActive", id: btn.getAttribute("data-set-active") });
          });
        });
        settingsEl.querySelectorAll("[data-edit-provider]").forEach(btn => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-edit-provider");
            const p = settingsData.providers.find(x => x.id === id);
            if (p) renderProviderForm(p);
          });
        });
        settingsEl.querySelectorAll("[data-delete-provider]").forEach(btn => {
          btn.addEventListener("click", () => {
            vscode.postMessage({ type: "settings:deleteProvider", id: btn.getAttribute("data-delete-provider") });
          });
        });
      }

      function renderProviderForm(existing) {
        const isEdit = !!existing;
        settingsEl.innerHTML =
          '<div style="max-width:520px;margin:0 auto;">' +
          '<div style="font-size:16px;font-weight:700;margin-bottom:20px;">' + (isEdit ? "编辑 Provider" : "添加 Provider") + '</div>' +

          '<div style="margin-bottom:12px;">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">别名（显示名称）</label>' +
          '<input id="pf-alias" type="text" value="' + escapeHtml(existing?.alias || "") + '" placeholder="如：快速写代码" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
          '</div>' +

          '<div style="margin-bottom:12px;">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Provider 类型</label>' +
          '<select id="pf-type" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);">' +
          ['anthropic','openai','openai-compatible','claude-cli'].map(t =>
            '<option value="' + t + '"' + (existing?.type === t ? ' selected' : '') + '>' + t + '</option>'
          ).join("") +
          '</select>' +
          '</div>' +

          '<div id="pf-baseurl-row" style="margin-bottom:12px;">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Base URL <span id="pf-baseurl-required" style="color:#ef5350">*</span></label>' +
          '<input id="pf-baseurl" type="text" value="' + escapeHtml(existing?.baseUrl || "") + '" placeholder="https://api.deepseek.com/v1" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
          '</div>' +

          '<div style="margin-bottom:12px;">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">模型名称</label>' +
          '<input id="pf-model" type="text" value="' + escapeHtml(existing?.model || "") + '" placeholder="claude-sonnet-4-5 / gpt-4o / deepseek-chat" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
          '</div>' +

          '<div id="pf-key-row" style="margin-bottom:12px;">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">API Key' + (isEdit ? '（留空则不修改）' : '') + '</label>' +
          '<input id="pf-apikey" type="password" placeholder="sk-..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);" />' +
          '</div>' +

          '<div id="pf-error" style="display:none;color:#ef5350;font-size:12px;margin-bottom:10px;padding:8px 12px;border-radius:8px;background:color-mix(in srgb,#ef5350 12%,transparent);"></div>' +

          '<div style="display:flex;justify-content:space-between;margin-top:20px;">' +
          '<button class="secondary" id="pf-cancel" type="button">取消</button>' +
          '<button id="pf-save" type="button">保存</button>' +
          '</div></div>';

        // 动态显示/隐藏 baseUrl 和 apiKey 行
        function updateFormVisibility() {
          const type = document.getElementById("pf-type").value;
          const baseUrlRow = document.getElementById("pf-baseurl-row");
          const keyRow = document.getElementById("pf-key-row");
          const required = document.getElementById("pf-baseurl-required");
          baseUrlRow.style.display = (type === "claude-cli") ? "none" : "block";
          keyRow.style.display = (type === "claude-cli") ? "none" : "block";
          if (required) required.style.display = (type === "openai-compatible") ? "inline" : "none";
        }
        updateFormVisibility();
        document.getElementById("pf-type")?.addEventListener("change", updateFormVisibility);

        document.getElementById("pf-cancel")?.addEventListener("click", () => {
          vscode.postMessage({ type: "settings:load" });
          renderSettings();
        });

        document.getElementById("pf-save")?.addEventListener("click", () => {
          const type = document.getElementById("pf-type").value;
          const alias = document.getElementById("pf-alias").value.trim();
          const model = document.getElementById("pf-model").value.trim();
          const baseUrl = document.getElementById("pf-baseurl")?.value.trim() || "";
          const apiKey = document.getElementById("pf-apikey")?.value.trim() || "";

          if (type === "openai-compatible" && !baseUrl) {
            const errEl = document.getElementById("pf-error");
            errEl.style.display = "block"; errEl.textContent = "openai-compatible 类型必须填写 Base URL";
            return;
          }

          const meta = { id: existing?.id || "", alias: alias || type, type, model, baseUrl };
          vscode.postMessage({ type: "settings:saveProvider", meta, apiKey: apiKey || undefined });
        });
      }

      document.getElementById("settingsBtn")?.addEventListener("click", showSettings);

      // ── 消息处理（扩展原有 window.addEventListener）────
      const _origMessageHandler = null; // 下方统一处理

      vscode.postMessage({ type: "ready" });
      render();
    </script>
  </body>
</html>`;
}
