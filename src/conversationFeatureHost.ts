import type { LicenseFlags } from "./license/licenseManager";
import {
  getConversationKey,
  hasLiveSwarmWorkers,
  isMultiSessionEnabled,
  isSessionPersistenceEnabled,
  isSwarmEnabled,
  shouldEnableSwarmForPrompt,
} from "./hostRuntimeHelpers";
import { hasExplicitSwarmIntent } from "./agent/swarm/swarmIntent";

type WorkerLike = {
  status: string;
};

export type ConversationFeatureBindings = {
  getConversationKey: () => string;
  isSessionPersistenceEnabled: () => boolean;
  isMultiSessionEnabled: () => boolean;
  isSwarmEnabled: () => boolean;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
};

export function createConversationFeatureBindings(options: {
  getCurrentSessionId: () => string | undefined;
  getTransientConversationId: () => string;
  getLicenseFlags: () => LicenseFlags | undefined;
  getPlanModeActive: () => boolean;
  getSwarmWorkers: () => WorkerLike[] | undefined;
}): ConversationFeatureBindings {
  return {
    getConversationKey: () =>
      getConversationKey(
        options.getCurrentSessionId(),
        options.getTransientConversationId(),
      ),
    isSessionPersistenceEnabled: () =>
      isSessionPersistenceEnabled(options.getLicenseFlags()),
    isMultiSessionEnabled: () =>
      isMultiSessionEnabled(options.getLicenseFlags()),
    isSwarmEnabled: () => isSwarmEnabled(options.getLicenseFlags()),
    shouldEnableSwarmForPrompt: prompt =>
      shouldEnableSwarmForPrompt({
        planModeActive: options.getPlanModeActive(),
        swarmEnabled: isSwarmEnabled(options.getLicenseFlags()),
        explicitIntent: hasExplicitSwarmIntent(prompt),
        hasLiveWorkers: hasLiveSwarmWorkers(options.getSwarmWorkers()),
      }),
  };
}
