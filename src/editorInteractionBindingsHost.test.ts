import { describe, expect, it, vi } from "vitest";

import {
  createEditorInteractionBindings,
  createEditorSelectionBindings,
} from "./editorInteractionBindingsHost";

describe("editorInteractionBindingsHost", () => {
  it("posts an empty selection payload when there is no active editor selection", () => {
    const postSelectionPayload = vi.fn();
    const bindings = createEditorSelectionBindings({
      getActiveEditor: () => undefined,
      postSelectionPayload,
    });

    bindings.requestEditorSelection();

    expect(postSelectionPayload).toHaveBeenCalledWith({});
  });

  it("posts the current editor selection text and language", () => {
    const postSelectionPayload = vi.fn();
    const bindings = createEditorSelectionBindings({
      getActiveEditor: () =>
        ({
          selection: { isEmpty: false },
          document: {
            languageId: "typescript",
            getText: () => "const answer = 42;",
          },
        }) as never,
      postSelectionPayload,
    });

    bindings.requestEditorSelection();

    expect(postSelectionPayload).toHaveBeenCalledWith({
      selectedText: "const answer = 42;",
      language: "typescript",
    });
  });

  it("keeps quick action wiring on the existing ready and prompt path", async () => {
    const ensureReadySequence = vi.fn(async () => {});
    const handlePrompt = vi.fn(async () => {});
    const postUnavailableMessage = vi.fn();
    const postErrorMessage = vi.fn();

    const bindings = createEditorInteractionBindings({
      getWorkspaceRoot: () => "E:\\workspace",
      getActiveDocumentPath: () => "E:\\workspace\\src\\index.ts",
      getActiveEditor: () => undefined,
      ensureReadySequence,
      handlePrompt,
      postUnavailableMessage,
      postErrorMessage,
      toErrorMessage: error => String(error),
      postSelectionPayload: vi.fn(),
    });

    await bindings.quickAction.handleQuickAction("readActiveFile");

    expect(ensureReadySequence).toHaveBeenCalledTimes(1);
    expect(handlePrompt).toHaveBeenCalledTimes(1);
    expect(handlePrompt).toHaveBeenCalledWith(expect.stringContaining("src\\index.ts"));
    expect(postUnavailableMessage).not.toHaveBeenCalled();
    expect(postErrorMessage).not.toHaveBeenCalled();
  });
});
