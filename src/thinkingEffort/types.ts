export type EffortLevel = "low" | "medium" | "high" | "max";

export const EFFORT_LEVELS = ["low", "medium", "high", "max"] as const satisfies readonly EffortLevel[];

export type ThinkingConfig =
  | { type: "adaptive" }
  | { type: "enabled"; budgetTokens: number };

export type FastModeDisabledEvent = {
  type: "rejected" | "overage";
  message: string;
  reason?: string | null;
  persistPreferenceOff: boolean;
};

export type ProviderRequestMetrics = {
  provider: "anthropic";
  requestKind: "main" | "built-in-agent" | "swarm-worker";
  model: string;
  toolCount: number;
  systemPromptChars: number;
  requestBodyBytes: number;
  usedPromptCache: false;
  promptCacheStatus: "unsupported";
};

export type ProviderRuntimeOptions = {
  effortLevel?: EffortLevel;
  thinkingConfig?: ThinkingConfig;
  fastMode?: boolean;
  onFastModeDisabled?: (event: FastModeDisabledEvent) => void | Promise<void>;
  requestKind?: "main" | "built-in-agent" | "swarm-worker";
  onRequestMetrics?: (metrics: ProviderRequestMetrics) => void;
};
