import type { CompanionData, CompanionState } from "./companion/companionTypes";
import type { LicenseFlags } from "./license/licenseManager";

type StatePayload = {
  type: "state";
  isBusy: boolean;
  providerLabel: string;
  mcpServers: unknown[];
  liveActivities: unknown[];
  lastRunActivities: unknown[];
  messages: unknown[];
  effortLevel: string | null;
  fastMode: boolean;
  fastModeLabel: string;
  fastModeConnected: boolean;
  showThinkingSummaries: boolean;
  planMode: {
    active: boolean;
    planFilePath: string | null;
  };
  pendingApproval: unknown;
  onboardingDone: boolean;
  multiSessionEnabled: boolean;
};

export function buildWebviewStatePayload(options: Omit<StatePayload, "type">): StatePayload {
  return {
    type: "state",
    ...options,
  };
}

export class WebviewStateHost {
  private postStatePending = false;
  private streamingUpdateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly postMessage: (payload: Record<string, unknown>) => void,
  ) {}

  requestStatePost(buildPayload: () => StatePayload): void {
    if (this.postStatePending) {
      return;
    }

    this.postStatePending = true;
    queueMicrotask(() => {
      this.postStatePending = false;
      this.postMessage(buildPayload());
    });
  }

  clearStreamingStateUpdate(): void {
    if (!this.streamingUpdateTimer) {
      return;
    }
    clearTimeout(this.streamingUpdateTimer);
    this.streamingUpdateTimer = undefined;
  }

  scheduleStreamingStateUpdate(buildPayload: () => {
    type: "stateUpdate";
    isBusy: boolean;
    streamingText: string;
  }): void {
    if (this.streamingUpdateTimer) {
      return;
    }

    this.streamingUpdateTimer = setTimeout(() => {
      this.streamingUpdateTimer = undefined;
      this.postMessage(buildPayload());
    }, 33);
  }

  postLicenseRequired(feature: keyof LicenseFlags): void {
    this.postMessage({ type: "license:required", feature });
  }

  postCompanionInit(companion: CompanionData | undefined): void {
    if (!companion) {
      return;
    }
    this.postMessage({ type: "companion:init", companion });
  }

  postCompanionState(state: CompanionState): void {
    this.postMessage({ type: "companion:state", state });
  }

  postCompanionMood(delta: number, companion: CompanionData | undefined): void {
    if (!companion) {
      return;
    }
    this.postMessage({
      type: "companion:mood",
      delta,
      companion,
    });
  }
}

export type StreamingStateBindings = {
  clearStreamingUpdateTimer: () => void;
  scheduleStreamingStateUpdate: () => void;
};

export type WebviewStateBindings = {
  postState: () => void;
};

export type StreamingStateBindingFactory = (options: {
  getIsBusy: () => boolean;
  getStreamingText: () => string;
}) => StreamingStateBindings;

export type WebviewStateBindingFactory = (options: {
  getIsBusy: () => boolean;
  getProviderLabel: () => string;
  getMcpServers: () => unknown[];
  getLiveActivities: () => unknown[];
  getLastRunActivities: () => unknown[];
  getMessages: () => unknown[];
  getEffortLevel: () => string | null;
  getFastMode: () => boolean;
  getFastModeIndicator: () => {
    label: string;
    connected: boolean;
  };
  getShowThinkingSummaries: () => boolean;
  getPlanMode: () => {
    active: boolean;
    planFilePath?: string | null;
  };
  getPendingApproval: () => unknown;
  getOnboardingDone: () => boolean;
  getMultiSessionEnabled: () => boolean;
}) => WebviewStateBindings;

export function createStreamingStateBindings(options: {
  host: WebviewStateHost;
  getIsBusy: () => boolean;
  getStreamingText: () => string;
}): StreamingStateBindings {
  return {
    clearStreamingUpdateTimer: () => {
      options.host.clearStreamingStateUpdate();
    },
    scheduleStreamingStateUpdate: () => {
      options.host.scheduleStreamingStateUpdate(() => ({
        type: "stateUpdate",
        isBusy: options.getIsBusy(),
        streamingText: options.getStreamingText(),
      }));
    },
  };
}

export function createStreamingStateBindingsFactory(options: {
  host: WebviewStateHost;
}): StreamingStateBindingFactory {
  return state =>
    createStreamingStateBindings({
      host: options.host,
      getIsBusy: state.getIsBusy,
      getStreamingText: state.getStreamingText,
    });
}

export function createWebviewStateBindings(options: {
  host: WebviewStateHost;
  getIsBusy: () => boolean;
  getProviderLabel: () => string;
  getMcpServers: () => unknown[];
  getLiveActivities: () => unknown[];
  getLastRunActivities: () => unknown[];
  getMessages: () => unknown[];
  getEffortLevel: () => string | null;
  getFastMode: () => boolean;
  getFastModeIndicator: () => {
    label: string;
    connected: boolean;
  };
  getShowThinkingSummaries: () => boolean;
  getPlanMode: () => {
    active: boolean;
    planFilePath?: string | null;
  };
  getPendingApproval: () => unknown;
  getOnboardingDone: () => boolean;
  getMultiSessionEnabled: () => boolean;
}): WebviewStateBindings {
  return {
    postState: () => {
      options.host.requestStatePost(() => {
        const fastModeIndicator = options.getFastModeIndicator();
        const planMode = options.getPlanMode();

        return buildWebviewStatePayload({
          isBusy: options.getIsBusy(),
          providerLabel: options.getProviderLabel(),
          mcpServers: options.getMcpServers(),
          liveActivities: options.getLiveActivities(),
          lastRunActivities: options.getLastRunActivities(),
          messages: options.getMessages(),
          effortLevel: options.getEffortLevel(),
          fastMode: options.getFastMode(),
          fastModeLabel: fastModeIndicator.label,
          fastModeConnected: fastModeIndicator.connected,
          showThinkingSummaries: options.getShowThinkingSummaries(),
          planMode: {
            active: planMode.active,
            planFilePath: planMode.active ? planMode.planFilePath ?? null : null,
          },
          pendingApproval: options.getPendingApproval(),
          onboardingDone: options.getOnboardingDone(),
          multiSessionEnabled: options.getMultiSessionEnabled(),
        });
      });
    },
  };
}

export function createWebviewStateBindingsFactory(options: {
  host: WebviewStateHost;
}): WebviewStateBindingFactory {
  return state =>
    createWebviewStateBindings({
      host: options.host,
      getIsBusy: state.getIsBusy,
      getProviderLabel: state.getProviderLabel,
      getMcpServers: state.getMcpServers,
      getLiveActivities: state.getLiveActivities,
      getLastRunActivities: state.getLastRunActivities,
      getMessages: state.getMessages,
      getEffortLevel: state.getEffortLevel,
      getFastMode: state.getFastMode,
      getFastModeIndicator: state.getFastModeIndicator,
      getShowThinkingSummaries: state.getShowThinkingSummaries,
      getPlanMode: state.getPlanMode,
      getPendingApproval: state.getPendingApproval,
      getOnboardingDone: state.getOnboardingDone,
      getMultiSessionEnabled: state.getMultiSessionEnabled,
    });
}
