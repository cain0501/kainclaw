import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function renderRendererContent(input: string, isUser = false): Promise<string> {
  const { marked } = await import("marked");
  const rendererPath = path.join(__dirname, "renderer", "index.html");
  const html = await readFile(rendererPath, "utf8");
  const start = html.indexOf("function renderMessageContent(text, isUser = false) {");
  const end = html.indexOf("\n// Sessions", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const script = `${html.slice(start, end)}\nresult = renderMessageContent(input, isUser);`;
  const context = { input, isUser, marked, result: "" };
  vm.runInNewContext(script, context);
  return context.result;
}

describe("Electron renderer markdown", () => {
  it("keeps inline four-backtick text inside an output code block", async () => {
    const rendered = await renderRendererContent(
      [
        "Output observed:",
        "````text",
        'expect(VERIFICATION_AGENT.getSystemPrompt()).toContain("Use four-backtick (````) or triple-tilde (~~~) outer fences");',
        "````",
        "Result: PASS",
      ].join("\n"),
    );

    expect(rendered.match(/<pre><code>/g)).toHaveLength(1);
    expect(rendered.match(/<\/code><\/pre>/g)).toHaveLength(1);
    expect(rendered).toContain(
      "Use four-backtick (````) or triple-tilde (~~~) outer fences",
    );
    expect(rendered).not.toContain("&lt;/code&gt;&lt;/pre&gt;");
  });

  it("keeps nested backtick fences literal inside tilde code blocks", async () => {
    const rendered = await renderRendererContent(
      [
        "Output observed:",
        "~~~text",
        "```powershell",
        "npm test",
        "```",
        "~~~",
      ].join("\n"),
    );

    expect(rendered.match(/<pre><code>/g)).toHaveLength(1);
    expect(rendered).toContain("```powershell");
    expect(rendered).toContain("npm test");
  });

  it("escapes normal message text while preserving simple inline markdown", async () => {
    const rendered = await renderRendererContent(
      "**Result:** use `a < b` and ignore <img src=x onerror=alert(1)>",
    );

    expect(rendered).toContain("<strong>Result:</strong>");
    expect(rendered).toContain("<code>a &lt; b</code>");
    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered).not.toContain("<img src=x");
  });

  it("renders verification output as literal text when README output contains nested backtick fences", async () => {
    const rendered = await renderRendererContent(
      [
        "### Check: read README",
        "Command run:",
        "```powershell",
        "Get-Content README.md",
        "```",
        "Output observed:",
        "```text",
        "# KainClaw",
        "",
        "### 1. Install dependencies",
        "```powershell",
        "npm install",
        "```",
        "### 2. Run baseline checks",
        "```powershell",
        "npm test",
        "```",
        "```",
        "Result: PASS README output stayed inside one code block.",
        "",
        "VERDICT: PASS",
      ].join("\n"),
    );

    expect(rendered).toContain('class="verify-report"');
    expect(rendered.match(/<pre><code>/g)).toHaveLength(2);
    expect(rendered.match(/<\/code><\/pre>/g)).toHaveLength(2);
    expect(rendered).toContain("```powershell");
    expect(rendered).toContain("### 2. Run baseline checks");
    expect(rendered).toContain("VERDICT: PASS");
  });

  it("escapes html inside verification command and output blocks", async () => {
    const rendered = await renderRendererContent(
      [
        "### Check: escape verification",
        "Command run:",
        "~~~powershell",
        "Write-Output '<script>alert(1)</script>'",
        "~~~",
        "Output observed:",
        "~~~text",
        "<img src=x onerror=alert(1)>",
        "~~~",
        "Result: PASS HTML was treated as text.",
        "VERDICT: PASS",
      ].join("\n"),
    );

    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered).not.toContain("<script>alert(1)</script>");
    expect(rendered).not.toContain("<img src=x");
  });

  it("does not apply the verification renderer to user messages", async () => {
    const rendered = await renderRendererContent(
      [
        "### Check: pasted report",
        "Command run:",
        "~~~powershell",
        "npm test",
        "~~~",
        "Output observed:",
        "~~~text",
        "ok",
        "~~~",
        "Result: PASS",
        "VERDICT: PASS",
      ].join("\n"),
      true,
    );

    expect(rendered).not.toContain('class="verify-report"');
    expect(rendered).toContain("<h3>Check: pasted report</h3>");
  });

  it("uses marked-style block tokenization for normal markdown", async () => {
    const rendered = await renderRendererContent(
      [
        "# Title",
        "",
        "- first",
        "- second",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | `two` |",
      ].join("\n"),
    );

    expect(rendered).toContain("<h1>Title</h1>");
    expect(rendered).toContain("<ul>");
    expect(rendered).toContain("<li>first</li>");
    expect(rendered).toContain("<table>");
    expect(rendered).toContain("<code>two</code>");
  });

  it("keeps unclosed fences as one code block like marked lexer", async () => {
    const rendered = await renderRendererContent(
      ["```text", "line 1", "### not a heading"].join("\n"),
    );

    expect(rendered.match(/<pre><code>/g)).toHaveLength(1);
    expect(rendered).toContain("line 1");
    expect(rendered).toContain("### not a heading");
    expect(rendered).not.toContain("<h3>not a heading</h3>");
  });

  it("escapes raw html tokens from normal markdown", async () => {
    const rendered = await renderRendererContent(
      "<script>alert(1)</script>\n\n<strong>not raw html</strong>",
    );

    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered).toContain("&lt;strong&gt;not raw html&lt;/strong&gt;");
    expect(rendered).not.toContain("<script>alert(1)</script>");
    expect(rendered).not.toContain("<strong>not raw html</strong>");
  });
});
