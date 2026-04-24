import { describe, expect, it } from "vitest";
import {
  buildSessionExportPath,
  buildSessionExportSuccessMessage,
  DEFAULT_NEW_SESSION_TITLE,
  getWorkspaceHash,
} from "./sessionUi";

describe("sessionUi helpers", () => {
  it("exposes the default new-session title", () => {
    expect(DEFAULT_NEW_SESSION_TITLE).toBe("新对话");
  });

  it("builds a stable workspace hash", () => {
    expect(getWorkspaceHash("E:\\claudecodejingiang\\vscode-extension")).toHaveLength(12);
    expect(getWorkspaceHash(undefined)).toBe("bm8td29ya3Nw");
  });

  it("builds export paths and sanitizes the title", () => {
    expect(buildSessionExportPath(undefined, "My Session")).toBeUndefined();
    expect(buildSessionExportPath("E:\\repo", "My Session/测试")).toBe("E:\\repo/My_Session_测试.md");
  });

  it("builds the export success message", () => {
    expect(buildSessionExportSuccessMessage("E:\\repo\\note.md")).toBe("对话已导出到 E:\\repo\\note.md");
  });
});
