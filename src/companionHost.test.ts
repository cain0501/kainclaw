import { describe, expect, it, vi } from "vitest";

import {
  createCompanionControllerFactory,
  createCompanionHostBindings,
  createCompanionHostBindingsFactory,
  initializeCompanionData,
  persistCompanionData,
  updateCompanionMoodData,
} from "./companionHost";

describe("companionHost", () => {
  it("initializes companion data from generated and stored state", () => {
    const result = initializeCompanionData({
      machineId: "machine-1",
      hasLicense: true,
      storedCompanion: {
        species: "duck",
        rarity: "common",
        moodLevel: 42,
        bondLevel: 3,
        totalConversations: 7,
        lastActiveAt: Date.now(),
      },
    });

    expect(result.moodLevel).toBe(42);
    expect(result.bondLevel).toBe(3);
    expect(result.totalConversations).toBe(7);
  });

  it("applies idle decay and mood updates deterministically", () => {
    const initialized = initializeCompanionData({
      machineId: "machine-2",
      hasLicense: true,
      storedCompanion: {
        species: "duck",
        rarity: "common",
        moodLevel: 60,
        bondLevel: 1,
        totalConversations: 0,
        lastActiveAt: new Date("2026-04-10T00:00:00Z").getTime(),
      },
      now: new Date("2026-04-10T00:30:00Z").getTime(),
    });

    expect(initialized.moodLevel).toBeLessThan(60);
    expect(initialized.lastActiveAt).toBe(new Date("2026-04-10T00:30:00Z").getTime());

    const updated = updateCompanionMoodData({
      companionData: initialized,
      delta: 5,
      countConversation: true,
      now: new Date("2026-04-10T00:31:00Z").getTime(),
    });

    expect(updated).toMatchObject({
      totalConversations: 1,
      lastActiveAt: new Date("2026-04-10T00:31:00Z").getTime(),
    });
    expect(updated!.moodLevel).toBeGreaterThan(initialized.moodLevel);
  });

  it("persists companion data only when present", async () => {
    const setState = vi.fn(async () => undefined);

    expect(
      await persistCompanionData({
        setState,
        key: "companion",
      }),
    ).toBe(false);

    const companionData = {
      species: "duck" as const,
      rarity: "common" as const,
      moodLevel: 50,
      bondLevel: 1,
      totalConversations: 0,
      lastActiveAt: 1,
    };

    expect(
      await persistCompanionData({
        companionData,
        setState,
        key: "companion",
      }),
    ).toBe(true);
    expect(setState).toHaveBeenCalledWith("companion", companionData);
  });

  it("creates companion bindings that initialize and update companion state", async () => {
    let companionData:
      | {
          species: "duck";
          rarity: "common";
          moodLevel: number;
          bondLevel: number;
          totalConversations: number;
          lastActiveAt: number;
        }
      | undefined;
    const persist = vi.fn(async (_value?: unknown) => undefined);
    const postInit = vi.fn();
    const postState = vi.fn();
    const postMood = vi.fn();

    const bindings = createCompanionHostBindings({
      getMachineId: () => "machine-1",
      hasLicense: () => true,
      getStoredCompanion: () => undefined,
      getCompanionData: () => companionData,
      setCompanionData: next => {
        companionData = next as typeof companionData;
      },
      persistCompanionData: async next => {
        await persist(next);
      },
      postCompanionInit: postInit,
      postCompanionState: postState,
      postCompanionMood: postMood,
    });

    await bindings.initializeCompanion();
    expect(companionData).toBeDefined();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(postInit).toHaveBeenCalledWith(companionData);

    bindings.postCompanionState("thinking");
    expect(postState).toHaveBeenCalledWith("thinking");

    await bindings.updateCompanionMood(3, true);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(postMood).toHaveBeenCalledWith(3, companionData);
    expect(companionData?.totalConversations).toBe(1);
  });

  it("builds a companion bindings factory around stable host bindings", async () => {
    let companionData:
      | {
          species: "duck";
          rarity: "common";
          moodLevel: number;
          bondLevel: number;
          totalConversations: number;
          lastActiveAt: number;
        }
      | undefined;
    const persist = vi.fn(async (_value?: unknown) => undefined);
    const postInit = vi.fn();
    const postState = vi.fn();
    const postMood = vi.fn();

    const factory = createCompanionHostBindingsFactory({
      getMachineId: () => "machine-2",
      hasLicense: () => true,
      getStoredCompanion: () => undefined,
      persistCompanionData: async next => {
        await persist(next);
      },
      postCompanionInit: postInit,
      postCompanionState: postState,
      postCompanionMood: postMood,
    });

    const bindings = factory({
      getCompanionData: () => companionData,
      setCompanionData: next => {
        companionData = next as typeof companionData;
      },
    });

    await bindings.initializeCompanion();
    const initializedCompanion = companionData;
    bindings.postCompanionState("thinking");
    await bindings.updateCompanionMood(2, true);

    expect(companionData).toBeDefined();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(postInit).toHaveBeenCalledWith(initializedCompanion);
    expect(postState).toHaveBeenCalledWith("thinking");
    expect(postMood).toHaveBeenCalledWith(2, companionData);
  });

  it("builds a companion controller factory around stable host bindings", async () => {
    let companionData:
      | {
          species: "duck";
          rarity: "common";
          moodLevel: number;
          bondLevel: number;
          totalConversations: number;
          lastActiveAt: number;
        }
      | undefined;
    const persist = vi.fn(async (_value?: unknown) => undefined);
    const postInit = vi.fn();
    const postState = vi.fn();
    const postMood = vi.fn();

    const factory = createCompanionControllerFactory({
      getMachineId: () => "machine-3",
      hasLicense: () => true,
      getStoredCompanion: () => undefined,
      persistCompanionData: async next => {
        await persist(next);
      },
      postCompanionInit: postInit,
      postCompanionState: postState,
      postCompanionMood: postMood,
    });

    const bindings = factory({
      getCompanionData: () => companionData,
      setCompanionData: next => {
        companionData = next as typeof companionData;
      },
    });

    await bindings.initializeCompanion();
    const initializedCompanion = companionData;
    bindings.postCompanionState("thinking");
    await bindings.updateCompanionMood(4, true);

    expect(companionData).toBeDefined();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(postInit).toHaveBeenCalledWith(initializedCompanion);
    expect(postState).toHaveBeenCalledWith("thinking");
    expect(postMood).toHaveBeenCalledWith(4, companionData);
  });
});
