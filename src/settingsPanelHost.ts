import type { LicenseFlags, LicenseResult } from "./license/licenseManager";
import type {
  ImageConfig,
  ImageModelMeta,
  ImagePromptHistoryEntry,
  ProviderMeta,
} from "./storage/settingsRepository";
import type { AppLanguage } from "./electronUiLanguage";
import {
  completeOnboardingProvider,
  deleteSettingsProvider,
  loadSettingsPanelData,
  saveSettingsProvider,
  validateOnboardingProviderKey,
} from "./settingsHost";

type SettingsStore = {
  getProviders(): ProviderMeta[];
  saveProviders(providers: ProviderMeta[]): Promise<void>;
  getActiveProviderId(): string | undefined;
  setActiveProviderId(id: string): Promise<void>;
  getApiKey(providerId: string): Promise<string | undefined>;
  storeApiKey(providerId: string, apiKey: string): Promise<void>;
  deleteApiKey(providerId: string): Promise<void>;
  getImageConfig(): ImageConfig | undefined;
  saveImageConfig(config: ImageConfig): Promise<void>;
  getImageModels(): ImageModelMeta[];
  saveImageModels(models: ImageModelMeta[]): Promise<void>;
  getActiveImageModelId(): string | undefined;
  setActiveImageModelId(id: string): Promise<void>;
  getImageApiKey(): Promise<string | undefined>;
  storeImageApiKey(apiKey: string): Promise<void>;
  deleteImageApiKey(): Promise<void>;
  getImageModelApiKey(imageModelId: string): Promise<string | undefined>;
  storeImageModelApiKey(imageModelId: string, apiKey: string): Promise<void>;
  deleteImageModelApiKey(imageModelId: string): Promise<void>;
  deleteImageModel(imageModelId: string): Promise<void>;
  getImagePromptHistory(): ImagePromptHistoryEntry[];
  saveImagePromptHistory(entries: ImagePromptHistoryEntry[]): Promise<void>;
  isLicenseActivated(): boolean;
  setOnboardingDone(done: boolean): Promise<void>;
  getShowThinkingSummaries(): boolean;
  getLanguage(): AppLanguage;
  setShowThinkingSummaries(enabled: boolean): Promise<void>;
  setLanguage(language: string): Promise<void>;
  setLicenseActivated(activated: boolean): Promise<void>;
};

export type SettingsPanelActions = {
  validateOnboardingKey: (
    providerType: string,
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) => Promise<void>;
  completeOnboarding: (meta: ProviderMeta, apiKey: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettingsProvider: (meta: ProviderMeta, apiKey?: string) => Promise<void>;
  deleteSettingsProvider: (id: string) => Promise<void>;
  setShowThinkingSummaries: (enabled: unknown) => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  setActiveProvider: (id: string) => Promise<void>;
  closeSettings: () => void;
  activateLicense: (rawKey: string) => Promise<void>;
};

export type SettingsPanelActionFactory = (options: {
  postWebviewMessage: (message: Record<string, unknown>) => void;
  postState: () => void;
  logSession: (event: string, details: Record<string, unknown>) => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}) => SettingsPanelActions;

export function createSettingsPanelActions(options: {
  settings: SettingsStore;
  postWebviewMessage: (message: Record<string, unknown>) => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  initializeCompanion: () => Promise<void>;
  storeLicenseKey: (rawKey: string) => Promise<void>;
  setLicenseFlags: (flags: LicenseFlags | undefined) => void;
  logSession: (event: string, details: Record<string, unknown>) => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
  verifyLicense: (rawKey: string) => LicenseResult;
}): SettingsPanelActions {
  const loadSettings = async () => {
    const settingsPanelData = await loadSettingsPanelData(options.settings);
    options.postWebviewMessage({
      type: "settings:data",
      ...settingsPanelData,
    });
  };

  return {
    validateOnboardingKey: async (providerType, apiKey, baseUrl, model) => {
      const result = await validateOnboardingProviderKey({
        providerType,
        apiKey,
        baseUrl,
        model,
      });
      if (result.ok) {
        options.postWebviewMessage({ type: "onboarding:keyValid" });
        return;
      }

      options.postWebviewMessage({
        type: "onboarding:keyInvalid",
        error: result.error,
      });
    },
    completeOnboarding: async (meta, apiKey) => {
      await completeOnboardingProvider({
        settings: options.settings,
        meta,
        apiKey,
      });
      options.postWebviewMessage({ type: "onboarding:done" });
      options.postState();
      options.refreshWorkspaceStatus();
    },
    loadSettings,
    saveSettingsProvider: async (meta, apiKey) => {
      await saveSettingsProvider({
        settings: options.settings,
        meta,
        apiKey,
      });
      await loadSettings();
      options.refreshWorkspaceStatus();
    },
    deleteSettingsProvider: async id => {
      await deleteSettingsProvider({
        settings: options.settings,
        id,
      });
      await loadSettings();
      options.refreshWorkspaceStatus();
    },
    setShowThinkingSummaries: async enabled => {
      await options.settings.setShowThinkingSummaries(enabled !== false);
      await loadSettings();
      options.postState();
    },
    setLanguage: async language => {
      await options.settings.setLanguage(language);
      await loadSettings();
      options.postState();
    },
    setActiveProvider: async id => {
      await options.settings.setActiveProviderId(id);
      await loadSettings();
      options.refreshWorkspaceStatus();
    },
    closeSettings: () => {
      options.postState();
    },
    activateLicense: async rawKey => {
      const result = options.verifyLicense(rawKey);
      if (!result.valid) {
        options.postWebviewMessage({
          type: "license:result",
          success: false,
          error: result.reason,
        });
        return;
      }

      await options.settings.setLicenseActivated(true);
      options.setLicenseFlags(result.flags);
      await options.storeLicenseKey(rawKey);
      options.postWebviewMessage({
        type: "license:result",
        success: true,
        flags: result.flags,
        expiresAt: result.expiresAt?.toISOString() ?? null,
      });
      await loadSettings();
      await options.initializeCompanion();
      options.logSession("license-activated", {
        flags: result.flags ?? {},
      });
      if (options.shouldRefreshSessionsList()) {
        await options.handleSessionsLoad();
      }
    },
  };
}

export function createSettingsPanelActionsFactory(options: {
  settings: SettingsStore;
  refreshWorkspaceStatus: () => void;
  initializeCompanion: () => Promise<void>;
  storeLicenseKey: (rawKey: string) => Promise<void>;
  setLicenseFlags: (flags: LicenseFlags | undefined) => void;
  verifyLicense: (rawKey: string) => LicenseResult;
}): SettingsPanelActionFactory {
  return state =>
    createSettingsPanelActions({
      settings: options.settings,
      postWebviewMessage: state.postWebviewMessage,
      postState: state.postState,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      initializeCompanion: options.initializeCompanion,
      storeLicenseKey: options.storeLicenseKey,
      setLicenseFlags: options.setLicenseFlags,
      logSession: state.logSession,
      shouldRefreshSessionsList: state.shouldRefreshSessionsList,
      handleSessionsLoad: state.handleSessionsLoad,
      verifyLicense: options.verifyLicense,
    });
}
