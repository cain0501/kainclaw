import { randomUUID } from "node:crypto";

export type KainClawInboundSession = {
  sessionId: string;
  label: string;
  createdAt: number;
};

export class KainClawInboundSessionStore {
  private readonly sessions = new Map<string, KainClawInboundSession>();

  openSession(label?: string): KainClawInboundSession {
    const session: KainClawInboundSession = {
      sessionId: randomUUID(),
      label: label?.trim() || "MCP session",
      createdAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  listSessions(): KainClawInboundSession[] {
    return [...this.sessions.values()];
  }

  closeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
