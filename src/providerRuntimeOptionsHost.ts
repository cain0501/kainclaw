import type { ProviderConfig } from "./agent/providers/IProviderAdapter";
import { buildProviderRuntimeOptions } from "./thinkingEffort/thinking";
import type {
  EffortLevel,
  FastModeDisabledEvent,
  ProviderRuntimeOptions,
} from "./thinkingEffort/types";

export type ProviderRuntimeOptionsHostBindings = {
  getEffortLevel: () => EffortLevel | undefined;
  getFastMode: () => boolean | undefined;
  getFastModeEnabled: () => boolean;
  setFastModeEnabled: (enabled: boolean) => Promise<void>;
  addPhaseActivity: (
    kind: "tool" | "phase" | "approval",
    label: string,
    detail: string,
    status: "error",
  ) => string | undefined;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  showWarningMessage: (message: string) => void;
};

export function createProviderRuntimeOptionsWithHost(options: {
  config: ProviderConfig;
  effortLevel: EffortLevel | undefined;
  fastMode: boolean | undefined;
  getFastModeEnabled: () => boolean;
  setFastModeEnabled: (enabled: boolean) => Promise<void>;
  addPhaseActivity: (
    kind: "tool" | "phase" | "approval",
    label: string,
    detail: string,
    status: "error",
  ) => string | undefined;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  showWarningMessage: (message: string) => void;
}): ProviderRuntimeOptions {
  const runtimeOptions = buildProviderRuntimeOptions(
    options.config,
    options.effortLevel,
    options.fastMode,
  );

  runtimeOptions.onFastModeDisabled = async (event: FastModeDisabledEvent) => {
    const detail = event.persistPreferenceOff
      ? `${event.message} Fast mode has been turned off.`
      : `${event.message} Requests will continue on the standard response path.`;

    if (event.persistPreferenceOff && options.getFastModeEnabled()) {
      await options.setFastModeEnabled(false);
    }

    options.addPhaseActivity("phase", "Fast mode fallback", detail, "error");
    options.postState();
    options.refreshWorkspaceStatus();
    options.showWarningMessage(`Cain Claude: ${detail}`);
  };

  return runtimeOptions;
}

export function createProviderRuntimeOptionsFactoryWithHost(
  options: ProviderRuntimeOptionsHostBindings,
): (config: ProviderConfig) => ProviderRuntimeOptions {
  return config =>
    createProviderRuntimeOptionsWithHost({
      config,
      effortLevel: options.getEffortLevel(),
      fastMode: options.getFastMode(),
      getFastModeEnabled: options.getFastModeEnabled,
      setFastModeEnabled: options.setFastModeEnabled,
      addPhaseActivity: options.addPhaseActivity,
      postState: options.postState,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      showWarningMessage: options.showWarningMessage,
    });
}
