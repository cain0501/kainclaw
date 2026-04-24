import { describe, expect, it, vi } from "vitest";

import {
  buildEditorSelectionPayload,
  createQuickActionBindings,
  getActiveWorkspaceFilePath,
  handleQuickActionRequest,
  postEditorSelectionPayload,
} from "./editorInteractionHost";

describe("editorInteractionHost", () => {
  it("derives active workspace-relative file paths safely", () => {
    expect(
      getActiveWorkspaceFilePath({
        workspaceRoot: "E:\\repo",
        documentPath: "E:\\repo\\src\\extension.ts",
      }),
    ).toBe("src\\extension.ts");

    expect(
      getActiveWorkspaceFilePath({
        workspaceRoot: "E:\\repo",
        documentPath: "E:\\other\\file.ts",
      }),
    ).toBeUndefined();
  });

  it("builds editor selection payloads", () => {
    expect(buildEditorSelectionPayload({})).toEqual({
      type: "editorSelection",
      selectedText: null,
    });

    expect(
      buildEditorSelectionPayload({
        selectedText: "const x = 1",
        language: "typescript",
      }),
    ).toEqual({
      type: "editorSelection",
      selectedText: "const x = 1",
      language: "typescript",
    });
  });

  it("posts editor selection payloads through the provided callback", () => {
    const postMessage = vi.fn();

    postEditorSelectionPayload({
      selectedText: "const x = 1",
      language: "typescript",
      postMessage,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: "editorSelection",
      selectedText: "const x = 1",
      language: "typescript",
    });
  });

  it("handles quick actions through ready, unavailable, and prompt paths", async () => {
    const postUnavailableMessage = vi.fn();
    const postErrorMessage = vi.fn();
    const handlePrompt = vi.fn(async () => undefined);

    await handleQuickActionRequest({
      action: "readActiveFile",
      ensureReadySequence: async () => {
        throw new Error("not ready");
      },
      handlePrompt,
      postUnavailableMessage,
      postErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });
    expect(postErrorMessage).toHaveBeenCalledWith("not ready");

    vi.clearAllMocks();

    await handleQuickActionRequest({
      action: "readActiveFile",
      ensureReadySequence: async () => undefined,
      handlePrompt,
      postUnavailableMessage,
      postErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });
    expect(postUnavailableMessage).toHaveBeenCalledWith("先打开一个工作区内的文件，再使用这个快捷动作。");

    vi.clearAllMocks();

    await handleQuickActionRequest({
      action: "readActiveFile",
      workspaceRoot: "E:\\repo",
      activeDocumentPath: "E:\\repo\\src\\extension.ts",
      ensureReadySequence: async () => undefined,
      handlePrompt,
      postUnavailableMessage,
      postErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });
    expect(handlePrompt).toHaveBeenCalledWith(
      expect.stringContaining("读取"),
    );
    expect(postUnavailableMessage).not.toHaveBeenCalled();
  });

  it("creates quick-action bindings from live workspace/editor getters", async () => {
    let workspaceRoot: string | undefined = "E:\\repo";
    let activeDocumentPath: string | undefined = "E:\\repo\\src\\extension.ts";
    const handlePrompt = vi.fn(async () => undefined);
    const postUnavailableMessage = vi.fn();
    const postErrorMessage = vi.fn();

    const bindings = createQuickActionBindings({
      getWorkspaceRoot: () => workspaceRoot,
      getActiveDocumentPath: () => activeDocumentPath,
      ensureReadySequence: async () => undefined,
      handlePrompt,
      postUnavailableMessage,
      postErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });

    await bindings.handleQuickAction("readActiveFile");
    expect(handlePrompt).toHaveBeenCalled();

    handlePrompt.mockClear();
    workspaceRoot = undefined;
    activeDocumentPath = undefined;

    await bindings.handleQuickAction("readActiveFile");
    expect(postUnavailableMessage).toHaveBeenCalled();
  });
});
