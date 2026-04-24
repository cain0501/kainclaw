import { randomUUID } from "node:crypto";

export function createPersistentLocalBridgeAuthTokenResolver(options: {
  loadAuthToken: () => string | undefined;
  saveAuthToken: (authToken: string) => Promise<unknown> | unknown;
}): () => Promise<string> {
  let cachedAuthToken: string | undefined;

  return async () => {
    if (cachedAuthToken) {
      return cachedAuthToken;
    }

    const storedAuthToken = options.loadAuthToken()?.trim();
    if (storedAuthToken) {
      cachedAuthToken = storedAuthToken;
      return storedAuthToken;
    }

    const authToken = randomUUID();
    await options.saveAuthToken(authToken);
    cachedAuthToken = authToken;
    return authToken;
  };
}
