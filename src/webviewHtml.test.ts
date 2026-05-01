import { describe, expect, it } from "vitest";

import { getSidebarHtml } from "./webviewHtml";

describe("webviewHtml sessions and thinking UI", () => {
  it("contains collapsed thinking summary card wiring", () => {
    const html = getSidebarHtml("nonce", "duck.png", "vscode-resource:");

    expect(html).toContain("const expandedThinkingSummaries = new Set()");
    expect(html).toContain('data-thinking-toggle="');
    expect(html).toContain("思考摘要");
    expect(html).toContain("thinking-card-collapsed");
  });

  it("contains multi-session preload wiring and a visible rename action in the sessions overlay", () => {
    const html = getSidebarHtml("nonce", "duck.png", "vscode-resource:");

    expect(html).toContain("multiSessionEnabled: false");
    expect(html).toContain("requested: false");
    expect(html).toContain("function requestSessionsPreload()");
    expect(html).toContain('type: "sessions:load"');
    expect(html).toContain('id="sessions-rename-current"');
    expect(html).toContain("重命名当前会话");
    expect(html).toContain("重命名会话");
    expect(html).toContain("API 提供商");
    expect(html).toContain("显示思考摘要");
  });
});
