import { describe, expect, it } from "vitest";
import {
  describeToolInput,
  describeToolName,
  getConversationKey,
  hasLiveSwarmWorkers,
  isMultiSessionEnabled,
  isSessionPersistenceEnabled,
  isSwarmEnabled,
  shouldEnableSwarmForPrompt,
} from "./hostRuntimeHelpers";

describe("host runtime helpers", () => {
  it("derives conversation and license gating state", () => {
    expect(getConversationKey("session-1", "temp-1")).toBe("session-1");
    expect(getConversationKey(undefined, "temp-1")).toBe("temp-1");

    expect(isSessionPersistenceEnabled(undefined)).toBe(false);
    expect(isSessionPersistenceEnabled({ sessionPersistence: true, multiSession: false, swarm: false })).toBe(true);
    expect(isMultiSessionEnabled({ sessionPersistence: false, multiSession: true, swarm: false })).toBe(true);
    expect(isSwarmEnabled({ sessionPersistence: false, multiSession: false, swarm: true })).toBe(true);
  });

  it("detects whether live swarm workers exist", () => {
    expect(hasLiveSwarmWorkers(undefined)).toBe(false);
    expect(hasLiveSwarmWorkers([{ status: "done" }])).toBe(false);
    expect(hasLiveSwarmWorkers([{ status: "running" }])).toBe(true);
  });

  it("enables swarm only when gating allows it", () => {
    expect(
      shouldEnableSwarmForPrompt({
        planModeActive: true,
        swarmEnabled: true,
        explicitIntent: true,
        hasLiveWorkers: true,
      }),
    ).toBe(false);

    expect(
      shouldEnableSwarmForPrompt({
        planModeActive: false,
        swarmEnabled: true,
        explicitIntent: false,
        hasLiveWorkers: true,
      }),
    ).toBe(true);
  });

  it("formats tool names and input previews", () => {
    expect(describeToolName("read_file")).toBe("read file");
    expect(describeToolName("mcp__github__issues_list")).toBe("github / issues_list");
    expect(describeToolInput(undefined)).toBeUndefined();
    expect(describeToolInput({ path: "README.md" })).toContain("README.md");
  });
});
