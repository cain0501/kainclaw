import { describe, expect, it, vi } from "vitest";

import { loadLocalSessionList, publishLocalSessionList } from "./sessionListHost";

describe("sessionListHost", () => {
  it("hydrates messageCount for sessions whose index count is missing", async () => {
    const result = await loadLocalSessionList({
      readIndex: async () => ({
        sessions: [
          {
            id: "session-1",
            title: "First",
            createdAt: 1,
            updatedAt: 10,
            workspaceHash: "hash-1",
            preview: "preview-1",
            messageCount: 0,
          },
          {
            id: "session-2",
            title: "Second",
            createdAt: 1,
            updatedAt: 20,
            workspaceHash: "hash-2",
            preview: "preview-2",
            messageCount: 3,
          },
        ],
      }),
      loadMessages: async sessionId =>
        sessionId === "session-1"
          ? [{ role: "user", content: "one" }, { role: "assistant", content: "two" }]
          : [],
      activeId: "session-2",
      previousSignature: "",
    });

    expect(result.changed).toBe(true);
    expect(result.sessions).toEqual([
      {
        id: "session-1",
        title: "First",
        createdAt: 1,
        updatedAt: 10,
        workspaceHash: "hash-1",
        preview: "preview-1",
        messageCount: 2,
      },
      {
        id: "session-2",
        title: "Second",
        createdAt: 1,
        updatedAt: 20,
        workspaceHash: "hash-2",
        preview: "preview-2",
        messageCount: 3,
      },
    ]);
  });

  it("marks the payload unchanged when the computed signature matches", async () => {
    const base = await loadLocalSessionList({
      readIndex: async () => ({ sessions: [] }),
      loadMessages: async () => [],
      activeId: undefined,
      previousSignature: "",
    });

    const repeated = await loadLocalSessionList({
      readIndex: async () => ({ sessions: [] }),
      loadMessages: async () => [],
      activeId: undefined,
      previousSignature: base.signature,
    });

    expect(base.changed).toBe(true);
    expect(repeated.changed).toBe(false);
  });

  it("publishes updated session data only when the signature changes", async () => {
    const setSignature = vi.fn();
    const publish = vi.fn();
    const onLoaded = vi.fn();

    const changed = await publishLocalSessionList({
      readIndex: async () => ({
        sessions: [
          {
            id: "session-1",
            title: "First",
            createdAt: 1,
            updatedAt: 10,
            workspaceHash: "hash-1",
            preview: "preview-1",
            messageCount: 1,
          },
        ],
      }),
      loadMessages: async () => [{ role: "user", content: "one" }],
      activeId: "session-1",
      previousSignature: "",
      onLoaded,
      setSignature,
      publish,
    });

    expect(changed).toBe(true);
    expect(onLoaded).toHaveBeenCalledWith(1);
    expect(setSignature).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      sessions: [
        expect.objectContaining({
          id: "session-1",
        }),
      ],
      activeId: "session-1",
    });
  });
});
