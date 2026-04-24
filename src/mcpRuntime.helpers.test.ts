import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatToolResultContent,
  getBinaryFileExtension,
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

  it("infers binary file extensions from mime types", () => {
    expect(getBinaryFileExtension("application/pdf")).toBe("pdf");
    expect(getBinaryFileExtension("image/svg+xml")).toBe("svg");
    expect(getBinaryFileExtension("application/x-custom+json")).toBe("x-custom");
    expect(getBinaryFileExtension(undefined)).toBe("bin");
  });
});
