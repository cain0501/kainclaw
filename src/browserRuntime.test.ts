import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  escapeAttributeValue,
  resolveWorkspacePath,
  truncate,
} from "./browserRuntime";

describe("browserRuntime helpers", () => {
  it("resolves workspace-relative paths and rejects escaping paths", () => {
    const workspaceRoot = path.join("E:\\", "claudecodejingiang", "vscode-extension");

    expect(resolveWorkspacePath(workspaceRoot, ".cain-artifacts/browser/test.png")).toContain(
      path.join(".cain-artifacts", "browser", "test.png"),
    );

    expect(() => resolveWorkspacePath(workspaceRoot, "..\\outside.txt")).toThrow(
      /Path escapes the workspace/,
    );
  });

  it("truncates long browser snapshot text", () => {
    const result = truncate("abcdefghij", 6);

    expect(result).toContain("abcdef");
    expect(result).toContain("[truncated 4 chars]");
  });

  it("escapes quotes and backslashes for attribute selectors", () => {
    expect(escapeAttributeValue('say "hi" \\ now')).toBe('say \\"hi\\" \\\\ now');
  });
});
