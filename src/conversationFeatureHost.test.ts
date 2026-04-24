import { describe, expect, it } from "vitest";
import { createConversationFeatureBindings } from "./conversationFeatureHost";
import type { LicenseFlags } from "./license/licenseManager";

describe("conversationFeatureHost", () => {
  it("derives the conversation key from session or transient identity", () => {
    let currentSessionId: string | undefined = undefined;
    let transientConversationId = "transient-1";

    const bindings = createConversationFeatureBindings({
      getCurrentSessionId: () => currentSessionId,
      getTransientConversationId: () => transientConversationId,
      getLicenseFlags: () => undefined,
      getPlanModeActive: () => false,
      getSwarmWorkers: () => undefined,
    });

    expect(bindings.getConversationKey()).toBe("transient-1");

    currentSessionId = "session-1";
    transientConversationId = "transient-2";

    expect(bindings.getConversationKey()).toBe("session-1");
  });

  it("computes live feature gates from license flags", () => {
    let licenseFlags: LicenseFlags | undefined = undefined;

    const bindings = createConversationFeatureBindings({
      getCurrentSessionId: () => undefined,
      getTransientConversationId: () => "transient",
      getLicenseFlags: () => licenseFlags,
      getPlanModeActive: () => false,
      getSwarmWorkers: () => undefined,
    });

    expect(bindings.isSessionPersistenceEnabled()).toBe(false);
    expect(bindings.isMultiSessionEnabled()).toBe(false);
    expect(bindings.isSwarmEnabled()).toBe(false);

    licenseFlags = {
      sessionPersistence: false,
      multiSession: true,
      swarm: true,
    };

    expect(bindings.isSessionPersistenceEnabled()).toBe(true);
    expect(bindings.isMultiSessionEnabled()).toBe(true);
    expect(bindings.isSwarmEnabled()).toBe(true);
  });

  it("enables swarm only when licensing, plan mode, and prompt intent/runtime state allow it", () => {
    let planModeActive = false;
    let workers: Array<{ status: string }> | undefined = undefined;
    let licenseFlags: LicenseFlags = {
      sessionPersistence: false,
      multiSession: false,
      swarm: true,
    };

    const bindings = createConversationFeatureBindings({
      getCurrentSessionId: () => undefined,
      getTransientConversationId: () => "transient",
      getLicenseFlags: () => licenseFlags,
      getPlanModeActive: () => planModeActive,
      getSwarmWorkers: () => workers,
    });

    expect(bindings.shouldEnableSwarmForPrompt("just answer normally")).toBe(false);
    expect(bindings.shouldEnableSwarmForPrompt("use swarm for this task")).toBe(true);

    workers = [{ status: "running" }];
    expect(bindings.shouldEnableSwarmForPrompt("just answer normally")).toBe(true);

    planModeActive = true;
    expect(bindings.shouldEnableSwarmForPrompt("use swarm for this task")).toBe(false);

    planModeActive = false;
    workers = undefined;
    licenseFlags = {
      sessionPersistence: false,
      multiSession: false,
      swarm: false,
    };
    expect(bindings.shouldEnableSwarmForPrompt("use swarm for this task")).toBe(false);
  });
});
