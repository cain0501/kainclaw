import type * as vscode from "vscode";

import {
  createQuickActionBindings,
  type QuickActionBindings,
} from "./editorInteractionHost";

export type EditorSelectionBindings = {
  requestEditorSelection: () => void;
};

export type EditorInteractionBindings = {
  quickAction: QuickActionBindings;
  selection: EditorSelectionBindings;
};

export function createEditorSelectionBindings(options: {
  getActiveEditor: () => vscode.TextEditor | undefined;
  postSelectionPayload: (options: {
    selectedText?: string;
    language?: string;
  }) => void;
}): EditorSelectionBindings {
  return {
    requestEditorSelection: () => {
      const editor = options.getActiveEditor();
      if (!editor || editor.selection.isEmpty) {
        options.postSelectionPayload({});
        return;
      }

      options.postSelectionPayload({
        selectedText: editor.document.getText(editor.selection),
        language: editor.document.languageId,
      });
    },
  };
}

export function createEditorInteractionBindings(options: {
  getWorkspaceRoot: () => string | undefined;
  getActiveDocumentPath: () => string | undefined;
  getActiveEditor: () => vscode.TextEditor | undefined;
  ensureReadySequence: () => Promise<void>;
  handlePrompt: (prompt: string) => Promise<void>;
  postUnavailableMessage: (message: string) => void;
  postErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
  postSelectionPayload: (options: {
    selectedText?: string;
    language?: string;
  }) => void;
}): EditorInteractionBindings {
  return {
    quickAction: createQuickActionBindings({
      getWorkspaceRoot: options.getWorkspaceRoot,
      getActiveDocumentPath: options.getActiveDocumentPath,
      ensureReadySequence: options.ensureReadySequence,
      handlePrompt: options.handlePrompt,
      postUnavailableMessage: options.postUnavailableMessage,
      postErrorMessage: options.postErrorMessage,
      toErrorMessage: options.toErrorMessage,
    }),
    selection: createEditorSelectionBindings({
      getActiveEditor: options.getActiveEditor,
      postSelectionPayload: options.postSelectionPayload,
    }),
  };
}
