import { describe, expect, it, vi } from "vitest";
import {
  createProviderRuntimeOptionsFactoryWithHost,
  createProviderRuntimeOptionsWithHost,
} from "./providerRuntimeOptionsHost";

describe("providerRuntimeOptionsHost", () => {
  it("builds runtime options and handles fast-mode fallback side effects", async () => {
    let fastModeEnabled = true;
    const setFastModeEnabled = vi.fn(async (enabled: boolean) => {
      fastModeEnabled = enabled;
    });
    const addPhaseActivity = vi.fn(() => "activity-1");
    const postState = vi.fn();
    const refreshWorkspaceStatus = vi.fn();
    const showWarningMessage = vi.fn();

    const runtimeOptions = createProviderRuntimeOptionsWithHost({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet-4-6",
      },
      effortLevel: "high",
      fastMode: true,
      getFastModeEnabled: () => fastModeEnabled,
      setFastModeEnabled,
      addPhaseActivity,
      postState,
      refreshWorkspaceStatus,
      showWarningMessage,
    });

    expect(runtimeOptions.effortLevel).toBe("high");
    expect(typeof runtimeOptions.fastMode).toBe("boolean");
    expect(runtimeOptions.onFastModeDisabled).toBeTypeOf("function");

    await runtimeOptions.onFastModeDisabled?.({
      type: "rejected",
      message: "Provider rejected fast mode.",
      persistPreferenceOff: true,
    });

    expect(setFastModeEnabled).toHaveBeenCalledWith(false);
    expect(addPhaseActivity).toHaveBeenCalledWith(
      "phase",
      "Fast mode fallback",
      "Provider rejected fast mode. Fast mode has been turned off.",
      "error",
    );
    expect(postState).toHaveBeenCalledTimes(1);
    expect(refreshWorkspaceStatus).toHaveBeenCalledTimes(1);
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Cain Claude: Provider rejected fast mode. Fast mode has been turned off.",
    );
  });

  it("does not persist fast-mode preference off unless requested", async () => {
    const setFastModeEnabled = vi.fn(async () => undefined);

    const runtimeOptions = createProviderRuntimeOptionsWithHost({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet-4-6",
      },
      effortLevel: "medium",
      fastMode: true,
      getFastModeEnabled: () => true,
      setFastModeEnabled,
      addPhaseActivity: vi.fn(),
      postState: vi.fn(),
      refreshWorkspaceStatus: vi.fn(),
      showWarningMessage: vi.fn(),
    });

    await runtimeOptions.onFastModeDisabled?.({
      type: "overage",
      message: "Fast mode token budget exceeded.",
      persistPreferenceOff: false,
    });

    expect(setFastModeEnabled).not.toHaveBeenCalled();
  });

  it("builds reusable runtime-options factories from live host state", () => {
    let effortLevel: "low" | "high" | undefined = "low";
    let fastMode: boolean | undefined = true;

    const createRuntimeOptions =
      createProviderRuntimeOptionsFactoryWithHost({
        getEffortLevel: () => effortLevel,
        getFastMode: () => fastMode,
        getFastModeEnabled: () => true,
        setFastModeEnabled: vi.fn(async () => undefined),
        addPhaseActivity: vi.fn(),
        postState: vi.fn(),
        refreshWorkspaceStatus: vi.fn(),
        showWarningMessage: vi.fn(),
      });

    const first = createRuntimeOptions({
      type: "anthropic",
      apiKey: "secret",
      model: "claude-sonnet-4-6",
    });

    effortLevel = "high";
    fastMode = false;

    const second = createRuntimeOptions({
      type: "openai",
      apiKey: "secret",
      model: "gpt-4.1",
    });

    expect(first.effortLevel).toBe("low");
    expect(second.effortLevel).toBe("high");
    expect(second.fastMode).toBe(first.fastMode);
  });
});
