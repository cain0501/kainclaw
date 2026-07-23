import { describe, expect, it } from "vitest";
import { KainClawInboundSessionStore } from "./kainclawInboundSessionStore";

describe("KainClawInboundSessionStore", () => {
  it("keeps sessions in the owning store instance only", () => {
    const firstStore = new KainClawInboundSessionStore();
    const session = firstStore.openSession("Client one");
    const secondStore = new KainClawInboundSessionStore();

    expect(firstStore.listSessions()).toEqual([session]);
    expect(secondStore.listSessions()).toEqual([]);
  });

  it("closes only known local sessions", () => {
    const store = new KainClawInboundSessionStore();
    const session = store.openSession();

    expect(store.closeSession("missing")).toBe(false);
    expect(store.closeSession(session.sessionId)).toBe(true);
    expect(store.listSessions()).toEqual([]);
  });
});
