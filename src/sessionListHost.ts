import type { ChatMessage, SessionIndex, SessionMeta } from "./storage/sessionRepository";

export type SessionListPayload = {
  sessions: SessionMeta[];
  signature: string;
  changed: boolean;
};

export async function loadLocalSessionList(options: {
  readIndex: () => Promise<SessionIndex>;
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  activeId?: string;
  previousSignature: string;
}): Promise<SessionListPayload> {
  const index = await options.readIndex();
  const sessions = await Promise.all(
    index.sessions.map(async session => {
      if (session.messageCount > 0) {
        return session;
      }

      const messages = await options.loadMessages(session.id);
      return {
        ...session,
        messageCount: messages.length,
      };
    }),
  );

  const signature = JSON.stringify({
    activeId: options.activeId ?? null,
    sessions,
  });

  return {
    sessions,
    signature,
    changed: signature !== options.previousSignature,
  };
}

export async function publishLocalSessionList(options: {
  readIndex: () => Promise<SessionIndex>;
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  activeId?: string;
  previousSignature: string;
  onLoaded?: (sessionCount: number) => void;
  setSignature: (signature: string) => void;
  publish: (payload: { sessions: SessionMeta[]; activeId: string | null }) => void;
}): Promise<boolean> {
  const result = await loadLocalSessionList({
    readIndex: options.readIndex,
    loadMessages: options.loadMessages,
    activeId: options.activeId,
    previousSignature: options.previousSignature,
  });

  options.onLoaded?.(result.sessions.length);

  if (!result.changed) {
    return false;
  }

  options.setSignature(result.signature);
  options.publish({
    sessions: result.sessions,
    activeId: options.activeId ?? null,
  });
  return true;
}
