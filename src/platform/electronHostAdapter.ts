import path from "node:path";
import { readFileSync, promises as fs } from "node:fs";
import { app, safeStorage } from "electron";
import type { IHostAdapter } from "./IHostAdapter";
import type { WriteApprovalRequest, ToolActionApprovalRequest } from "../toolRuntime";
import { resolveElectronStoragePath } from "./electronStoragePaths";

/**
 * Electron desktop host adapter.
 * Replaces VS Code-specific APIs with Electron equivalents so the core
 * extension logic runs unchanged outside VS Code.
 */
export class ElectronHostAdapter implements IHostAdapter {
  private pendingApproval: { resolve: (v: boolean) => void } | undefined;
  private pendingApprovalPayload:
    | {
        id: string;
        kind: "file" | "tool";
        title: string;
        summary: string;
        path?: string;
        diff?: string;
        inputPreview?: string;
      }
    | undefined;
  private readonly storagePath: string;
  private readonly stateFilePath: string;

  constructor(
    private readonly sendToRenderer: (channel: string, payload: unknown) => void,
  ) {
    this.storagePath = resolveElectronStoragePath(app.getPath("userData"));
    this.stateFilePath = path.join(this.storagePath, "state.json");
    try {
      const raw = readFileSync(this.stateFilePath, "utf8");
      this.stateCache = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // File doesn't exist yet; start with empty cache
    }
  }

  // Workspace — no workspace concept in standalone Electron; callers handle undefined
  getWorkspaceRoot(): string | undefined {
    return undefined;
  }

  // Editor selection — no active editor in Electron shell
  getEditorSelection(): { selectedText: string; language: string } | null {
    return null;
  }

  // Diff preview — not available without VS Code; no-op
  async showDiff(_workspaceRoot: string, _request: WriteApprovalRequest): Promise<void> {}

  async requestFileApproval(request: WriteApprovalRequest): Promise<boolean> {
    return this.queueApproval({
      id: crypto.randomUUID(),
      kind: "file",
      title: request.kind === "write_file" ? "Confirm file write" : "Confirm file update",
      summary: request.summary,
      path: request.path,
      diff: request.diff,
    });
  }

  async requestToolApproval(request: ToolActionApprovalRequest): Promise<boolean> {
    return this.queueApproval({
      id: crypto.randomUUID(),
      kind: "tool",
      title: request.title || "Confirm external action",
      summary: request.summary,
      inputPreview: request.inputPreview,
    });
  }

  private queueApproval(approval: {
    id: string;
    kind: "file" | "tool";
    title: string;
    summary: string;
    path?: string;
    diff?: string;
    inputPreview?: string;
  }): Promise<boolean> {
    if (this.pendingApproval) {
      throw new Error("Another confirmation is already pending.");
    }
    this.pendingApprovalPayload = approval;
    this.sendToRenderer("approval:pending", approval);
    return new Promise<boolean>(resolve => {
      this.pendingApproval = { resolve };
    });
  }

  getPendingApproval() {
    return this.pendingApprovalPayload ?? null;
  }

  /** Called from ipcMain handler when renderer resolves an approval. */
  resolveApproval(approved: boolean): void {
    const pending = this.pendingApproval;
    this.pendingApproval = undefined;
    this.pendingApprovalPayload = undefined;
    this.sendToRenderer("approval:pending", undefined);
    pending?.resolve(approved);
  }

  showError(message: string): void {
    this.sendToRenderer("host:error", { message });
  }

  // Secrets — encrypted with Electron safeStorage, stored in a JSON file
  private get secretsFilePath(): string {
    return path.join(this.storagePath, "secrets.enc.json");
  }

  private async readSecretsStore(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.secretsFilePath, "utf8");
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeSecretsStore(store: Record<string, string>): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(this.secretsFilePath, JSON.stringify(store), "utf8");
  }

  async getSecret(key: string): Promise<string | undefined> {
    const store = await this.readSecretsStore();
    const encrypted = store[key];
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return undefined;
    }
  }

  async storeSecret(key: string, value: string): Promise<void> {
    const store = await this.readSecretsStore();
    if (safeStorage.isEncryptionAvailable()) {
      store[key] = safeStorage.encryptString(value).toString("base64");
    } else {
      store[key] = Buffer.from(value).toString("base64");
    }
    await this.writeSecretsStore(store);
  }

  async deleteSecret(key: string): Promise<void> {
    const store = await this.readSecretsStore();
    delete store[key];
    await this.writeSecretsStore(store);
  }

  // Small persisted fields — backed by a simple JSON file next to storagePath
  private stateCache: Record<string, unknown> = {};

  getState<T>(key: string): T | undefined {
    return this.stateCache[key] as T | undefined;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    this.stateCache[key] = value;
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(this.stateCache), "utf8");
    this.sendToRenderer("state:set", { key, value });
  }

  // Storage root
  getStorageUri(): string {
    return this.storagePath;
  }
}
