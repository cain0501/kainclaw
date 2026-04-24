export async function handleSettingsWebviewMessage(options: {
  message: {
    type?: unknown;
    provider?: unknown;
    apiKey?: unknown;
    baseUrl?: unknown;
    model?: unknown;
    providerMeta?: unknown;
    meta?: unknown;
    id?: unknown;
    enabled?: unknown;
    key?: unknown;
  };
  validateOnboardingKey: (
    providerType: string,
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) => Promise<void>;
  completeOnboarding: (meta: unknown, apiKey: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettingsProvider: (meta: unknown, apiKey?: string) => Promise<void>;
  deleteSettingsProvider: (id: string) => Promise<void>;
  setShowThinkingSummaries: (enabled: unknown) => Promise<void>;
  setActiveProvider: (id: string) => Promise<void>;
  closeSettings: () => void;
  activateLicense: (rawKey: string) => Promise<void>;
}): Promise<boolean> {
  const type =
    typeof options.message.type === "string" ? options.message.type : "";

  switch (type) {
    case "onboarding:validateKey":
      await options.validateOnboardingKey(
        String(options.message.provider || ""),
        String(options.message.apiKey || ""),
        typeof options.message.baseUrl === "string"
          ? options.message.baseUrl
          : undefined,
        typeof options.message.model === "string"
          ? options.message.model
          : undefined,
      );
      return true;
    case "onboarding:complete":
      await options.completeOnboarding(
        options.message.providerMeta,
        String(options.message.apiKey || ""),
      );
      return true;
    case "settings:load":
      await options.loadSettings();
      return true;
    case "settings:saveProvider":
      await options.saveSettingsProvider(
        options.message.meta,
        typeof options.message.apiKey === "string"
          ? options.message.apiKey
          : undefined,
      );
      return true;
    case "settings:deleteProvider":
      await options.deleteSettingsProvider(String(options.message.id || ""));
      return true;
    case "settings:setShowThinkingSummaries":
      await options.setShowThinkingSummaries(options.message.enabled);
      return true;
    case "settings:setActive":
      await options.setActiveProvider(String(options.message.id || ""));
      return true;
    case "settings:close":
      options.closeSettings();
      return true;
    case "license:activate":
      await options.activateLicense(String(options.message.key || ""));
      return true;
    default:
      return false;
  }
}
