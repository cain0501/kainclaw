import type { LicenseFlags } from "./license/licenseManager";

type WorkerLike = {
  status: string;
};

export function getConversationKey(
  currentSessionId: string | undefined,
  transientConversationId: string,
): string {
  return currentSessionId ?? transientConversationId;
}

export function isSessionPersistenceEnabled(flags: LicenseFlags | undefined): boolean {
  return !!(flags?.sessionPersistence || flags?.multiSession);
}

export function isMultiSessionEnabled(flags: LicenseFlags | undefined): boolean {
  return !!flags?.multiSession && isSessionPersistenceEnabled(flags);
}

export function isSwarmEnabled(flags: LicenseFlags | undefined): boolean {
  return flags?.swarm === true;
}

export function hasLiveSwarmWorkers(workers: WorkerLike[] | undefined): boolean {
  return workers?.some(worker => worker.status === "pending" || worker.status === "running") === true;
}

export function shouldEnableSwarmForPrompt(options: {
  planModeActive: boolean;
  swarmEnabled: boolean;
  explicitIntent: boolean;
  hasLiveWorkers: boolean;
}): boolean {
  if (options.planModeActive || !options.swarmEnabled) {
    return false;
  }

  return options.explicitIntent || options.hasLiveWorkers;
}

export function describeToolName(toolName: string): string {
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    if (parts.length >= 3) {
      return `${parts[1]} / ${parts.slice(2).join("__")}`;
    }
  }
  return toolName.replace(/_/g, " ");
}

export function describeToolInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input || Object.keys(input).length === 0) {
    return undefined;
  }
  const preview = JSON.stringify(input);
  return preview.length > 140 ? `${preview.slice(0, 140)}...` : preview;
}
