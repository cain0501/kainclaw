import { afterEach, describe, expect, it } from "vitest";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  clearFastModeCooldown,
  executeFastModeCommand,
  getFastModeIndicatorState,
  getFastModeOverageDisabledMessage,
  triggerFastModeCooldown,
} from "./fastMode";

const anthropicConfig: ProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-opus-4-6",
};

afterEach(() => {
  clearFastModeCooldown();
});

describe("fastMode", () => {
  it("reports overage messages in Chinese", () => {
    expect(getFastModeOverageDisabledMessage("out_of_credits")).toContain("额度已耗尽");
    expect(getFastModeOverageDisabledMessage("org_level_disabled")).toContain("组织层已关闭");
  });

  it("returns a Chinese usage hint for invalid commands", () => {
    const result = executeFastModeCommand("weird", false, anthropicConfig);

    expect(result.changed).toBe(false);
    expect(result.message).toContain("用法");
    expect(result.message).toContain("/fast");
  });

  it("reports cooldown state through the indicator", () => {
    triggerFastModeCooldown(Date.now() + 60_000, "rate_limit");

    const indicator = getFastModeIndicatorState(anthropicConfig, true);

    expect(indicator).toEqual({
      label: "cooldown",
      connected: false,
    });
  });

  it("enables fast mode with a Chinese success message", () => {
    const result = executeFastModeCommand("on", false, anthropicConfig);

    expect(result.changed).toBe(true);
    expect(result.nextValue).toBe(true);
    expect(result.message).toContain("Fast mode 已开启");
  });
});
