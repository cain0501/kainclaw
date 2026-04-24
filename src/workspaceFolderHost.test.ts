import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => ({
  workspace: {
    workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  },
}));

vi.mock("vscode", () => vscodeMock);

import {
  getPrimaryWorkspaceFolder,
  getPrimaryWorkspaceFolderPath,
  requirePrimaryWorkspaceFolderPath,
} from "./workspaceFolderHost";

describe("workspaceFolderHost", () => {
  beforeEach(() => {
    vscodeMock.workspace.workspaceFolders = undefined;
  });

  it("returns the first workspace folder when available", () => {
    const primaryFolder = { uri: { fsPath: "E:\\repo-a" } };
    const secondaryFolder = { uri: { fsPath: "E:\\repo-b" } };

    vscodeMock.workspace.workspaceFolders = [primaryFolder, secondaryFolder];

    expect(getPrimaryWorkspaceFolder()).toBe(primaryFolder);
    expect(getPrimaryWorkspaceFolderPath()).toBe("E:\\repo-a");
  });

  it("returns undefined when no workspace folder exists", () => {
    expect(getPrimaryWorkspaceFolder()).toBeUndefined();
    expect(getPrimaryWorkspaceFolderPath()).toBeUndefined();
  });

  it("throws when a workspace folder path is required but missing", () => {
    expect(() => requirePrimaryWorkspaceFolderPath()).toThrow(
      "No workspace folder is available.",
    );
  });
});
