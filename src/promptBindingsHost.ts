import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
  NormalizedMessage,
} from "./agent/providers/IProviderAdapter";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";

export type PromptSharedBindings = {
  getConversationHistory: () => NormalizedMessage[];
  getTranscriptPath: () => string | undefined;
  createProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions?: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  addPhaseActivity: (
    label: string,
    detail: string | undefined,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: "done" | "error",
    detail?: string,
  ) => void;
};

export function createPromptSharedBindings(options: {
  getConversationHistory: () => NormalizedMessage[];
  isSessionPersistenceEnabled: () => boolean;
  getCurrentSessionId: () => string | undefined;
  getTranscriptFilePath: (sessionId: string) => string;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions?: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  addPhaseActivity: (
    label: string,
    detail: string | undefined,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: "done" | "error",
    detail?: string,
  ) => void;
}): PromptSharedBindings {
  return {
    getConversationHistory: options.getConversationHistory,
    getTranscriptPath: () => {
      if (!options.isSessionPersistenceEnabled()) {
        return undefined;
      }
      const sessionId = options.getCurrentSessionId();
      return sessionId
        ? options.getTranscriptFilePath(sessionId)
        : undefined;
    },
    createProviderAdapter: options.buildProviderAdapter,
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
  };
}
