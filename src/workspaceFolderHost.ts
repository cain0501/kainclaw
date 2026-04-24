import * as vscode from "vscode";

const NO_WORKSPACE_FOLDER_ERROR = "No workspace folder is available.";

export function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getPrimaryWorkspaceFolderPath(): string | undefined {
  return getPrimaryWorkspaceFolder()?.uri.fsPath;
}

export function requirePrimaryWorkspaceFolderPath(): string {
  const workspaceFolderPath = getPrimaryWorkspaceFolderPath();
  if (!workspaceFolderPath) {
    throw new Error(NO_WORKSPACE_FOLDER_ERROR);
  }
  return workspaceFolderPath;
}
