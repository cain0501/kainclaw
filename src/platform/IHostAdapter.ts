import type { WriteApprovalRequest, ToolActionApprovalRequest } from "../toolRuntime";

/**
 * Platform-agnostic host capability surface.
 * Current implementation: VsCodeHostAdapter
 * Future implementation target: ElectronHostAdapter
 */
export interface IHostAdapter {
  // Workspace
  getWorkspaceRoot(): string | undefined;

  // Editor
  getEditorSelection(): { selectedText: string; language: string } | null;

  // Approval UI
  showDiff(
    workspaceRoot: string,
    request: WriteApprovalRequest,
  ): Promise<void>;

  requestFileApproval(request: WriteApprovalRequest): Promise<boolean>;
  requestToolApproval(request: ToolActionApprovalRequest): Promise<boolean>;

  // Notifications
  showError(message: string): void;
  openExternal(url: string): Promise<boolean>;

  // Secrets, such as API keys
  getSecret(key: string): Promise<string | undefined>;
  storeSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;

  // Small persisted fields backed by globalState semantics
  getState<T>(key: string): T | undefined;
  setState<T>(key: string, value: T): Promise<void>;

  // Storage root backed by globalStorageUri semantics
  getStorageUri(): string;
}
