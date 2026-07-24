import { randomUUID } from "node:crypto";

export const INBOUND_MCP_GRANT_TTL_MS = 15 * 60 * 1000;

export type InboundMcpGrantScope = "once" | "session";
export type InboundMcpGrantDecision = "deny" | InboundMcpGrantScope;
export type InboundMcpGrantFailure =
  | "unknown_connection"
  | "connection_mismatch"
  | "denied"
  | "unknown_grant"
  | "expired"
  | "revoked"
  | "tool_mismatch"
  | "session_mismatch";

export type InboundMcpGrantRequest = {
  connectionId: string;
  serverInstanceId: string;
  toolName: string;
  sessionId: string;
  sessionLabel?: string;
  promptSummary: string;
};

export type InboundMcpGrant = {
  grantId: string;
  serverInstanceId: string;
  connectionId: string;
  toolName: string;
  sessionId: string;
  scope: InboundMcpGrantScope;
  expiresAt: number;
};

export type InboundMcpGrantResult =
  | { ok: true; grant: InboundMcpGrant }
  | { ok: false; reason: InboundMcpGrantFailure };

export type InboundMcpAuditRecord = {
  timestamp: number;
  serverInstanceId: string;
  sessionId: string;
  toolName: string;
  decision: "denied" | "granted" | "validated" | "revoked" | "expired" | "disconnected";
};

export type InboundMcpExecutionBrokerOptions = {
  requestApproval: (request: Omit<InboundMcpGrantRequest, "connectionId">) => Promise<InboundMcpGrantDecision>;
  now?: () => number;
  grantTtlMs?: number;
};

type InboundMcpConnection = {
  connectionId: string;
  serverInstanceId: string;
};

/**
 * Electron-owned authority for inbound MCP grants. It intentionally has no
 * dependency on providers, desktop session storage, or workspace state.
 */
export class InboundMcpExecutionBroker {
  private readonly connections = new Map<string, InboundMcpConnection>();
  private readonly grants = new Map<string, InboundMcpGrant>();
  private readonly auditRecords: InboundMcpAuditRecord[] = [];
  private readonly now: () => number;
  private readonly grantTtlMs: number;

  constructor(private readonly options: InboundMcpExecutionBrokerOptions) {
    this.now = options.now ?? Date.now;
    this.grantTtlMs = options.grantTtlMs ?? INBOUND_MCP_GRANT_TTL_MS;
  }

  register(serverInstanceId: string): InboundMcpConnection {
    const connection = { connectionId: randomUUID(), serverInstanceId };
    this.connections.set(connection.connectionId, connection);
    return connection;
  }

  async requestGrant(request: InboundMcpGrantRequest): Promise<InboundMcpGrantResult> {
    if (!this.matchesConnection(request.connectionId, request.serverInstanceId)) {
      return { ok: false, reason: this.connections.has(request.connectionId) ? "connection_mismatch" : "unknown_connection" };
    }

    const decision = await this.options.requestApproval({
      serverInstanceId: request.serverInstanceId,
      toolName: request.toolName,
      sessionId: request.sessionId,
      sessionLabel: request.sessionLabel,
      promptSummary: request.promptSummary,
    });
    if (decision === "deny") {
      this.record(request, "denied");
      return { ok: false, reason: "denied" };
    }

    const grant: InboundMcpGrant = {
      grantId: randomUUID(),
      serverInstanceId: request.serverInstanceId,
      connectionId: request.connectionId,
      toolName: request.toolName,
      sessionId: request.sessionId,
      scope: decision,
      expiresAt: this.now() + this.grantTtlMs,
    };
    this.grants.set(grant.grantId, grant);
    this.record(request, "granted");
    return { ok: true, grant };
  }

  validateGrant(request: Pick<InboundMcpGrantRequest, "connectionId" | "serverInstanceId" | "toolName" | "sessionId"> & { grantId: string }): InboundMcpGrantResult {
    const grant = this.grants.get(request.grantId);
    if (!grant) return { ok: false, reason: "unknown_grant" };
    if (grant.expiresAt <= this.now()) {
      this.grants.delete(grant.grantId);
      this.record(grant, "expired");
      return { ok: false, reason: "expired" };
    }
    if (grant.connectionId !== request.connectionId || grant.serverInstanceId !== request.serverInstanceId) {
      return { ok: false, reason: "connection_mismatch" };
    }
    if (grant.toolName !== request.toolName) return { ok: false, reason: "tool_mismatch" };
    if (grant.sessionId !== request.sessionId) return { ok: false, reason: "session_mismatch" };
    this.record(grant, "validated");
    return { ok: true, grant };
  }

  consumeGrant(request: Pick<InboundMcpGrantRequest, "connectionId" | "serverInstanceId" | "toolName" | "sessionId"> & { grantId: string }): InboundMcpGrantResult {
    const result = this.validateGrant(request);
    if (result.ok && result.grant.scope === "once") {
      this.grants.delete(result.grant.grantId);
    }
    return result;
  }

  revokeGrant(connectionId: string, grantId: string): boolean {
    const grant = this.grants.get(grantId);
    if (!grant || grant.connectionId !== connectionId) return false;
    this.grants.delete(grantId);
    this.record(grant, "revoked");
    return true;
  }

  closeInboundSession(connectionId: string, sessionId: string): void {
    for (const grant of this.grants.values()) {
      if (grant.connectionId === connectionId && grant.sessionId === sessionId) {
        this.grants.delete(grant.grantId);
        this.record(grant, "revoked");
      }
    }
  }

  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    for (const grant of this.grants.values()) {
      if (grant.connectionId === connectionId) {
        this.grants.delete(grant.grantId);
        this.record(grant, "disconnected");
      }
    }
  }

  getAuditRecords(): InboundMcpAuditRecord[] {
    return [...this.auditRecords];
  }

  private matchesConnection(connectionId: string, serverInstanceId: string): boolean {
    return this.connections.get(connectionId)?.serverInstanceId === serverInstanceId;
  }

  private record(
    request: Pick<InboundMcpGrantRequest, "serverInstanceId" | "sessionId" | "toolName">,
    decision: InboundMcpAuditRecord["decision"],
  ): void {
    this.auditRecords.push({
      timestamp: this.now(),
      serverInstanceId: request.serverInstanceId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      decision,
    });
  }
}
