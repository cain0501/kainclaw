import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeShellCommand,
  commandStartsWithAllowedPrefix,
  formatToolSearchResults,
  formatRelativePaths,
  getBuiltInToolDefinitions,
  globToRegex,
  isSafeReadOnlyPipeline,
  normalizeFetchedHtml,
  resolveWorkspacePath,
  searchToolDefinitions,
  stripAnsiEscapeCodes,
  toSafeText,
} from "./toolRuntime";

describe("toolRuntime helpers", () => {
  it("matches commands against allowed prefixes", () => {
    expect(commandStartsWithAllowedPrefix("git status --short", ["git status"])).toBe(true);
    expect(commandStartsWithAllowedPrefix("npm run build", ["git status"])).toBe(false);
  });

  it("allows safe read-only pipelines and rejects unsafe ones", () => {
    expect(
      isSafeReadOnlyPipeline(
        "Get-ChildItem | Sort-Object Name | Select-Object Name",
        ["Get-ChildItem"],
      ),
    ).toBe(true);

    expect(
      isSafeReadOnlyPipeline(
        "Get-ChildItem | Remove-Item",
        ["Get-ChildItem"],
      ),
    ).toBe(false);
  });

  it("resolves workspace-relative paths and formats them back relatively", () => {
    const workspaceRoot = path.join("E:\\", "claudecodejingiang", "vscode-extension");
    const filePath = resolveWorkspacePath(workspaceRoot, "src\\toolRuntime.ts");

    expect(filePath).toContain(path.join("src", "toolRuntime.ts"));
    expect(formatRelativePaths(workspaceRoot, [filePath])).toBe(path.join("src", "toolRuntime.ts"));
    expect(() => resolveWorkspacePath(workspaceRoot, "..\\outside.ts")).toThrow(
      /Path escapes the workspace/,
    );
  });

  it("truncates long text safely", () => {
    const result = toSafeText("abcdefghij", 6);

    expect(result).toContain("abcdef");
    expect(result).toContain("[truncated 4 chars]");
  });

  it("strips ANSI escape sequences from terminal output", () => {
    const raw = "\u001b[1mPASS\u001b[22m \u001b[32msrc/foo.test.ts\u001b[39m";

    expect(stripAnsiEscapeCodes(raw)).toBe("PASS src/foo.test.ts");
  });

  it("converts glob patterns into regexes", () => {
    const tsGlob = globToRegex("src/**/*.ts");
    const shallowGlob = globToRegex("src/*/file?.ts");

    expect(tsGlob.test("src/toolRuntime.ts")).toBe(true);
    expect(tsGlob.test("src/agent/providers/openAIAdapter.ts")).toBe(true);
    expect(tsGlob.test("README.md")).toBe(false);

    expect(shallowGlob.test("src/foo/file1.ts")).toBe(true);
    expect(shallowGlob.test("src/foo/bar/file1.ts")).toBe(false);
    expect(shallowGlob.test("src/foo/file10.ts")).toBe(false);
  });

  it("normalizes fetched html into visible text", () => {
    const text = normalizeFetchedHtml(`
      <html>
        <head><style>.x{display:none}</style><script>bad()</script></head>
        <body><h1>Hello</h1><p>world</p></body>
      </html>
    `);

    expect(text).toBe("Hello world");
  });

  it("searches and formats tool definitions by query relevance", () => {
    const tools = [
      {
        name: "RunReview",
        description: "Run the built-in review agent",
        input_schema: { type: "object" as const, properties: {} },
      },
      {
        name: "RunVerification",
        description: "Run the built-in verification agent",
        input_schema: { type: "object" as const, properties: {} },
      },
      {
        name: "read_file",
        description: "Read a text file from the workspace",
        input_schema: { type: "object" as const, properties: {} },
      },
    ];

    const matches = searchToolDefinitions(tools, "review", 10);

    expect(matches.map(tool => tool.name)).toEqual(["RunReview"]);
    expect(formatToolSearchResults(matches, "review")).toContain('Tools matching "review":');
    expect(formatToolSearchResults(matches, "review")).toContain("RunReview");
  });

  it("hides legacy fetch_url from the default built-in tool list", () => {
    const defaultTools = getBuiltInToolDefinitions();
    const legacyTools = getBuiltInToolDefinitions({ includeLegacyFetchUrl: true });

    expect(defaultTools.some(tool => tool.name === "fetch_url")).toBe(false);
    expect(legacyTools.some(tool => tool.name === "fetch_url")).toBe(true);
    expect(defaultTools.some(tool => tool.name === "WebFetch")).toBe(true);
    expect(defaultTools.some(tool => tool.name === "WebSearch")).toBe(true);
  });

  it("blocks destructive shell commands and unsafe pipelines", () => {
    expect(() => assertSafeShellCommand("Remove-Item demo.txt", ["Get-ChildItem"])).toThrow(
      /Blocked potentially destructive command/,
    );
    expect(() =>
      assertSafeShellCommand("Get-ChildItem | Remove-Item", ["Get-ChildItem"]),
    ).toThrow(/Blocked potentially destructive command/);

    expect(() =>
      assertSafeShellCommand(
        "Get-ChildItem | Sort-Object Name | Select-Object Name",
        ["Get-ChildItem"],
      ),
    ).not.toThrow();
  });
});
