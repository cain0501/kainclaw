import { describe, expect, it, vi } from "vitest";
import { createPersistentLocalBridgeAuthTokenResolver } from "./localBridgeAuth";

describe("createPersistentLocalBridgeAuthTokenResolver", () => {
  it("reuses a stored auth token without writing a new one", async () => {
    const saveAuthToken = vi.fn();
    const resolveAuthToken = createPersistentLocalBridgeAuthTokenResolver({
      loadAuthToken: () => "bridge-auth-stored",
      saveAuthToken,
    });

    await expect(resolveAuthToken()).resolves.toBe("bridge-auth-stored");
    await expect(resolveAuthToken()).resolves.toBe("bridge-auth-stored");
    expect(saveAuthToken).not.toHaveBeenCalled();
  });

  it("generates and persists an auth token when none is stored", async () => {
    const saveAuthToken = vi.fn();
    const resolveAuthToken = createPersistentLocalBridgeAuthTokenResolver({
      loadAuthToken: () => undefined,
      saveAuthToken,
    });

    const first = await resolveAuthToken();
    const second = await resolveAuthToken();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second).toBe(first);
    expect(saveAuthToken).toHaveBeenCalledTimes(1);
    expect(saveAuthToken).toHaveBeenCalledWith(first);
  });
});
