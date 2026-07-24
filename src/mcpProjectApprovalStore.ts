import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type McpProjectApprovalDecision = "approved" | "rejected" | "unapproved";

export type McpProjectApprovalTarget = {
  workspaceRoot: string;
  configPath: string;
  serverName: string;
  config: Record<string, unknown>;
};

type StoredApproval = {
  workspaceRoot: string;
  configPath: string;
  serverName: string;
  configFingerprint: string;
  decision: Exclude<McpProjectApprovalDecision, "unapproved">;
  updatedAt: number;
};

type ApprovalDocument = {
  version: 1;
  approvals: Record<string, StoredApproval>;
};

const APPROVAL_FILENAME = "mcp-project-approvals.json";

export class McpProjectApprovalStore {
  private readonly filePath: string;

  constructor(storageRoot: string) {
    this.filePath = path.join(storageRoot, APPROVAL_FILENAME);
  }

  async getDecision(target: McpProjectApprovalTarget): Promise<McpProjectApprovalDecision> {
    const identity = buildApprovalIdentity(target);
    const document = await this.load();
    return document.approvals[identity.key]?.decision ?? "unapproved";
  }

  async approve(target: McpProjectApprovalTarget): Promise<void> {
    await this.setDecision(target, "approved");
  }

  async reject(target: McpProjectApprovalTarget): Promise<void> {
    await this.setDecision(target, "rejected");
  }

  async reset(target: McpProjectApprovalTarget): Promise<void> {
    const identity = buildApprovalIdentity(target);
    const document = await this.load();
    if (!(identity.key in document.approvals)) {
      return;
    }

    delete document.approvals[identity.key];
    await this.save(document);
  }

  private async setDecision(
    target: McpProjectApprovalTarget,
    decision: Exclude<McpProjectApprovalDecision, "unapproved">,
  ): Promise<void> {
    const identity = buildApprovalIdentity(target);
    const document = await this.load();
    document.approvals[identity.key] = {
      ...identity,
      decision,
      updatedAt: Date.now(),
    };
    await this.save(document);
  }

  private async load(): Promise<ApprovalDocument> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ApprovalDocument>;
      if (parsed.version === 1 && parsed.approvals && typeof parsed.approvals === "object") {
        return { version: 1, approvals: parsed.approvals };
      }
    } catch {
      // Missing or invalid local approval data must not grant trust.
    }
    return { version: 1, approvals: {} };
  }

  private async save(document: ApprovalDocument): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
}

export function buildApprovalIdentity(target: McpProjectApprovalTarget): {
  key: string;
  workspaceRoot: string;
  configPath: string;
  serverName: string;
  configFingerprint: string;
} {
  const workspaceRoot = canonicalizePath(target.workspaceRoot);
  const configPath = canonicalizePath(target.configPath);
  const serverName = target.serverName.trim();
  const configFingerprint = createHash("sha256")
    .update(stableStringify(withoutEnabledState(target.config)))
    .digest("hex");
  const key = createHash("sha256")
    .update(JSON.stringify({ workspaceRoot, configPath, serverName, configFingerprint }))
    .digest("hex");

  return { key, workspaceRoot, configPath, serverName, configFingerprint };
}

function withoutEnabledState(config: Record<string, unknown>): Record<string, unknown> {
  const { disabled: _disabled, ...connectionConfig } = config;
  return connectionConfig;
}

function canonicalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
