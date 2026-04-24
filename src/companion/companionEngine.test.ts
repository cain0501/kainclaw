import { describe, expect, it, vi } from "vitest";
import { applyMoodDelta, generateCompanion, getIdleDecay } from "./companionEngine";

describe("companion engine", () => {
  it("generates deterministic companions and downgrades premium rarities without a license", () => {
    const premiumUuid = "id-0";

    const licensed = generateCompanion(premiumUuid, true);
    const unlicensed = generateCompanion(premiumUuid, false);

    expect(licensed.species).toBe(generateCompanion(premiumUuid, true).species);
    expect(["rare", "epic", "legendary", "shiny"]).toContain(licensed.rarity);
    expect(unlicensed.rarity).toBe("uncommon");
    expect(unlicensed.lockedRarity).toBe(true);
  });

  it("applies mood deltas with clamping and bond progression", () => {
    const result = applyMoodDelta(
      {
        species: "duck",
        rarity: "common",
        moodLevel: 95,
        bondLevel: 1,
        totalConversations: 45,
        lastActiveAt: Date.now(),
      },
      20,
    );

    expect(result.moodLevel).toBe(100);
    expect(result.bondLevel).toBe(3);
  });

  it("computes idle decay only after the first 10 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T00:20:00Z"));

    const recentDecay = getIdleDecay({
      species: "capybara",
      rarity: "common",
      moodLevel: 60,
      bondLevel: 1,
      totalConversations: 0,
      lastActiveAt: new Date("2026-04-10T00:15:00Z").getTime(),
    });

    const staleDecay = getIdleDecay({
      species: "capybara",
      rarity: "common",
      moodLevel: 60,
      bondLevel: 1,
      totalConversations: 0,
      lastActiveAt: new Date("2026-04-10T00:00:00Z").getTime(),
    });

    expect(recentDecay).toBe(0);
    expect(staleDecay).toBe(10);

    vi.useRealTimers();
  });
});
