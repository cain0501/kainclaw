import path from "node:path";

import {
  getQuickActionPrompt,
  getQuickActionUnavailableMessage,
} from "./hostUi";

export function getActiveWorkspaceFilePath(options: {
  workspaceRoot: string;
  documentPath?: string;
}): string | undefined {
  if (!options.documentPath) {
    return undefined;
  }

  const relativePath = path.relative(options.workspaceRoot, options.documentPath);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return relativePath;
}

export function buildEditorSelectionPayload(options: {
  selectedText?: string;
  language?: string;
}): {
  type: "editorSelection";
  selectedText: string | null;
  language?: string;
} {
  if (!options.selectedText) {
    return {
      type: "editorSelection",
      selectedText: null,
    };
  }

  return {
    type: "editorSelection",
    selectedText: options.selectedText,
    ...(options.language ? { language: options.language } : {}),
  };
}

export function postEditorSelectionPayload(options: {
  selectedText?: string;
  language?: string;
  postMessage: (payload: {
    type: "editorSelection";
    selectedText: string | null;
    language?: string;
  }) => void;
}): void {
  options.postMessage(
    buildEditorSelectionPayload({
      selectedText: options.selectedText,
      language: options.language,
    }),
  );
}

export async function handleQuickActionRequest(options: {
  action: string;
  workspaceRoot?: string;
  activeDocumentPath?: string;
  ensureReadySequence: () => Promise<void>;
  handlePrompt: (prompt: string) => Promise<void>;
  postUnavailableMessage: (message: string) => void;
  postErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): Promise<void> {
  try {
    await options.ensureReadySequence();
  } catch (error) {
    options.postErrorMessage(options.toErrorMessage(error));
    return;
  }

  if (!options.workspaceRoot) {
    options.postUnavailableMessage(getQuickActionUnavailableMessage());
    return;
  }

  const activeFilePath = getActiveWorkspaceFilePath({
    workspaceRoot: options.workspaceRoot,
    documentPath: options.activeDocumentPath,
  });
  const prompt = getQuickActionPrompt(options.action, activeFilePath);
  if (!prompt) {
    options.postUnavailableMessage(getQuickActionUnavailableMessage());
    return;
  }

  await options.handlePrompt(prompt);
}

export type QuickActionBindings = {
  handleQuickAction: (action: string) => Promise<void>;
};

export function createQuickActionBindings(options: {
  getWorkspaceRoot: () => string | undefined;
  getActiveDocumentPath: () => string | undefined;
  ensureReadySequence: () => Promise<void>;
  handlePrompt: (prompt: string) => Promise<void>;
  postUnavailableMessage: (message: string) => void;
  postErrorMessage: (message: string) => void;
  toErrorMessage: (error: unknown) => string;
}): QuickActionBindings {
  return {
    handleQuickAction: action =>
      handleQuickActionRequest({
        action,
        workspaceRoot: options.getWorkspaceRoot(),
        activeDocumentPath: options.getActiveDocumentPath(),
        ensureReadySequence: options.ensureReadySequence,
        handlePrompt: options.handlePrompt,
        postUnavailableMessage: options.postUnavailableMessage,
        postErrorMessage: options.postErrorMessage,
        toErrorMessage: options.toErrorMessage,
      }),
  };
}
