import path from "node:path";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { IHostAdapter } from "./IHostAdapter";
import type { WriteApprovalRequest, ToolActionApprovalRequest } from "../toolRuntime";

function inferLanguageId(targetPath: string): string | undefined {
  const ext = path.extname(targetPath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".css": "css",
    ".html": "html",
  };
  return map[ext];
}

export class VsCodeHostAdapter implements IHostAdapter {
  private pendingApproval: { resolve: (v: boolean) => void } | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    /** Callback used to push pending approval state back into the webview. */
    private readonly onApprovalChange: (
      approval:
        | {
            id: string;
            kind: "file" | "tool";
            title: string;
            summary: string;
            path?: string;
            diff?: string;
            inputPreview?: string;
          }
        | undefined,
    ) => void,
  ) {}

  // Workspace
  getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  // Editor
  getEditorSelection(): { selectedText: string; language: string } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return null;
    }
    return {
      selectedText: editor.document.getText(editor.selection),
      language: editor.document.languageId,
    };
  }

  // Diff preview
  async showDiff(workspaceRoot: string, request: WriteApprovalRequest): Promise<void> {
    const targetFileUri = vscode.Uri.file(path.join(workspaceRoot, request.path));
    const language = inferLanguageId(request.path);
    let originalUri: vscode.Uri;

    try {
      await vscode.workspace.fs.stat(targetFileUri);
      originalUri = targetFileUri;
    } catch {
      const emptyDoc = await vscode.workspace.openTextDocument({ content: "", language });
      originalUri = emptyDoc.uri;
    }

    const proposedDoc = await vscode.workspace.openTextDocument({
      content: request.proposedContent,
      language,
    });

    await vscode.commands.executeCommand(
      "vscode.diff",
      originalUri,
      proposedDoc.uri,
      `Cain Preview | ${request.path}`,
      { preview: true },
    );
  }

  // Approval queue
  async requestFileApproval(request: WriteApprovalRequest): Promise<boolean> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (workspaceRoot) {
      await this.showDiff(workspaceRoot, request);
    }
    return this.queueApproval({
      id: randomUUID(),
      kind: "file",
      title: request.kind === "write_file" ? "Confirm file write" : "Confirm file update",
      summary: request.summary,
      path: request.path,
      diff: request.diff,
    });
  }

  async requestToolApproval(request: ToolActionApprovalRequest): Promise<boolean> {
    return this.queueApproval({
      id: randomUUID(),
      kind: "tool",
      title: request.title || "Confirm external action",
      summary: request.summary,
      inputPreview: request.inputPreview,
    });
  }

  private queueApproval(
    approval: Parameters<typeof this.onApprovalChange>[0] & { id: string },
  ): Promise<boolean> {
    if (this.pendingApproval) {
      throw new Error("Another confirmation is already pending.");
    }
    this.onApprovalChange(approval);
    return new Promise<boolean>(resolve => {
      this.pendingApproval = { resolve };
    });
  }

  /** Called by ChatSidebarProvider after the webview resolves an approval. */
  resolveApproval(approved: boolean): void {
    const pending = this.pendingApproval;
    this.pendingApproval = undefined;
    this.onApprovalChange(undefined);
    pending?.resolve(approved);
  }

  // Notifications
  showError(message: string): void {
    void vscode.window.showErrorMessage(`Cain Claude: ${message}`);
  }

  // Secrets
  async getSecret(key: string): Promise<string | undefined> {
    return this.context.secrets.get(key);
  }

  async storeSecret(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }

  // Small persisted fields
  getState<T>(key: string): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  async setState<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  // File storage root
  getStorageUri(): string {
    return this.context.globalStorageUri.fsPath;
  }
}
