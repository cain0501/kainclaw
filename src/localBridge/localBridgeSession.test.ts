import { describe, expect, it, vi } from "vitest";
import { createPersistentLocalBridgeSessionResolver } from "./localBridgeSession";

describe("createPersistentLocalBridgeSessionResolver", () => {
  it("reuses a stored session id without writing a new one", async () => {
    const saveSessionId = vi.fn();
    const resolveSessionId = createPersistentLocalBridgeSessionResolver({
      loadSessionId: () => "session-stored-123",
      saveSessionId,
    });

    await expect(resolveSessionId()).resolves.toBe("session-stored-123");
    await expect(resolveSessionId()).resolves.toBe("session-stored-123");
    expect(saveSessionId).not.toHaveBeenCalled();
  });

  it("generates and persists a session id when none is stored", async () => {
    const saveSessionId = vi.fn();
    const resolveSessionId = createPersistentLocalBridgeSessionResolver({
      loadSessionId: () => undefined,
      saveSessionId,
    });

    const first = await resolveSessionId();
    const second = await resolveSessionId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second).toBe(first);
    expect(saveSessionId).toHaveBeenCalledTimes(1);
    expect(saveSessionId).toHaveBeenCalledWith(first);
  });
});
