import { randomUUID } from "node:crypto";

export function createPersistentLocalBridgeSessionResolver(options: {
  loadSessionId: () => string | undefined;
  saveSessionId: (sessionId: string) => Promise<unknown> | unknown;
}): () => Promise<string> {
  let cachedSessionId: string | undefined;

  return async () => {
    if (cachedSessionId) {
      return cachedSessionId;
    }

    const storedSessionId = options.loadSessionId()?.trim();
    if (storedSessionId) {
      cachedSessionId = storedSessionId;
      return storedSessionId;
    }

    const sessionId = randomUUID();
    await options.saveSessionId(sessionId);
    cachedSessionId = sessionId;
    return sessionId;
  };
}
