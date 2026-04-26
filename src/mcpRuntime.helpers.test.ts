import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMcpToolResult,
  formatToolResultContent,
  getBinaryFileExtension,
  normalizeNameForMCP,
  resolveWorkspacePath,
  substituteEnv,
} from "./mcpRuntime";

describe("mcpRuntime helpers", () => {
  it("resolves workspace-relative paths and rejects escaping paths", () => {
    const workspaceRoot = path.join("E:\\", "claudecodejingiang", "vscode-extension");

    expect(resolveWorkspacePath(workspaceRoot, ".cain-mcp.json")).toContain(".cain-mcp.json");
    expect(() => resolveWorkspacePath(workspaceRoot, "..\\outside.json")).toThrow(
      /Path escapes the workspace/,
    );
  });

  it("substitutes env placeholders from the provided env map first", () => {
    expect(
      substituteEnv("https://${HOST}/v1/${NAME}", { HOST: "api.example.com", NAME: "demo" }),
    ).toBe("https://api.example.com/v1/demo");
  });

  it("formats MCP content blocks into readable text", () => {
    const content = formatToolResultContent([
      { type: "text", text: "hello" },
      { type: "image", mimeType: "image/png" },
      { type: "resource_link", uri: "memory://demo" },
    ]);

    expect(content).toContain("hello");
    expect(content).toContain("[image image/png omitted from text output]");
    expect(content).toContain("memory://demo");
  });

  it("formats Claude MCP result shapes by result priority", () => {
    expect(formatMcpToolResult({ toolResult: "legacy result" })).toBe("legacy result");
    expect(formatMcpToolResult({ structuredContent: { ok: true, count: 2 } })).toContain(
      '"count": 2',
    );
    expect(formatMcpToolResult({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
  });

  it("throws MCP tool errors instead of formatting them as successful output", () => {
    expect(() =>
      formatMcpToolResult({
        isError: true,
        content: [{ type: "text", text: "permission denied" }],
        _meta: { requestId: "abc" },
      }),
    ).toThrow("permission denied");
  });

  it("infers binary file extensions from mime types", () => {
    expect(getBinaryFileExtension("application/pdf")).toBe("pdf");
    expect(getBinaryFileExtension("image/svg+xml")).toBe("svg");
    expect(getBinaryFileExtension("application/x-custom+json")).toBe("x-custom");
    expect(getBinaryFileExtension(undefined)).toBe("bin");
  });

  it("normalizes MCP names using the Claude-compatible API-safe form", () => {
    expect(normalizeNameForMCP("github.com")).toBe("github_com");
    expect(normalizeNameForMCP("my server")).toBe("my_server");
    expect(normalizeNameForMCP("claude.ai My Server")).toBe("claude_ai_My_Server");
  });
});
