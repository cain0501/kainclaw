import { describe, expect, it, vi } from "vitest";

import {
  createSettingsPanelActions,
  createSettingsPanelActionsFactory,
  createSettingsPanelControllerFactory,
} from "./settingsPanelHost";
import type { AppLanguage } from "./electronUiLanguage";

class FakeSettingsStore {
  providers: any[] = [];
  activeProviderId: string | undefined;
  apiKeys = new Map<string, string>();
  imageModels: any[] = [];
  activeImageModelId: string | undefined;
  imageModelApiKeys = new Map<string, string>();
  imageConfig: any;
  imageApiKey: string | undefined;
  imagePromptHistory: any[] = [];
  onboardingDone = false;
  licenseActivated = false;
  showThinkingSummaries = true;
  language: AppLanguage = "zh-CN";

  getProviders() {
    return [...this.providers];
  }

  async saveProviders(providers: any[]) {
    this.providers = [...providers];
  }

  getActiveProviderId() {
    return this.activeProviderId;
  }

  async setActiveProviderId(id: string) {
    this.activeProviderId = id || undefined;
  }

  async getApiKey(providerId: string) {
    return this.apiKeys.get(providerId);
  }

  async storeApiKey(providerId: string, apiKey: string) {
    this.apiKeys.set(providerId, apiKey);
  }

  async deleteApiKey(providerId: string) {
    this.apiKeys.delete(providerId);
  }

  getImageConfig() {
    return this.imageConfig;
  }

  async saveImageConfig(config: any) {
    this.imageConfig = config;
  }

  getImageModels() {
    return [...this.imageModels];
  }

  async saveImageModels(models: any[]) {
    this.imageModels = [...models];
  }

  getActiveImageModelId() {
    return this.activeImageModelId;
  }

  async setActiveImageModelId(id: string) {
    this.activeImageModelId = id || undefined;
  }

  async getImageApiKey() {
    return this.imageApiKey;
  }

  async storeImageApiKey(apiKey: string) {
    this.imageApiKey = apiKey;
  }

  async deleteImageApiKey() {
    this.imageApiKey = undefined;
  }

  async getImageModelApiKey(imageModelId: string) {
    return this.imageModelApiKeys.get(imageModelId);
  }

  async storeImageModelApiKey(imageModelId: string, apiKey: string) {
    this.imageModelApiKeys.set(imageModelId, apiKey);
  }

  async deleteImageModelApiKey(imageModelId: string) {
    this.imageModelApiKeys.delete(imageModelId);
  }

  async deleteImageModel(imageModelId: string) {
    this.imageModels = this.imageModels.filter(model => model.id !== imageModelId);
    this.imageModelApiKeys.delete(imageModelId);
    if (this.activeImageModelId === imageModelId) {
      this.activeImageModelId = this.imageModels[0]?.id;
    }
  }

  getImagePromptHistory() {
    return [...this.imagePromptHistory];
  }

  async saveImagePromptHistory(entries: any[]) {
    this.imagePromptHistory = [...entries];
  }

  isLicenseActivated() {
    return this.licenseActivated;
  }

  async setOnboardingDone(done: boolean) {
    this.onboardingDone = done;
  }

  getShowThinkingSummaries() {
    return this.showThinkingSummaries;
  }

  async setShowThinkingSummaries(enabled: boolean) {
    this.showThinkingSummaries = enabled;
  }

  getLanguage(): AppLanguage {
    return this.language;
  }

  async setLanguage(language: AppLanguage) {
    this.language = language;
  }

  async setLicenseActivated(activated: boolean) {
    this.licenseActivated = activated;
  }
}

describe("settingsPanelHost", () => {
  it("builds a reusable settings panel actions factory around stable host bindings", async () => {
    const settings = new FakeSettingsStore();
    const initializeCompanion = vi.fn(async () => undefined);
    const storeLicenseKey = vi.fn(async () => undefined);
    const setLicenseFlags = vi.fn();
    const postWebviewMessage = vi.fn();
    const logSession = vi.fn();
    const handleSessionsLoad = vi.fn(async () => undefined);

    const factory = createSettingsPanelActionsFactory({
      settings,
      refreshWorkspaceStatus: () => undefined,
      initializeCompanion,
      storeLicenseKey,
      setLicenseFlags,
      verifyLicense: rawKey =>
        rawKey === "good"
          ? {
              valid: true,
              flags: {
                sessionPersistence: true,
                multiSession: true,
                swarm: false,
              },
              expiresAt: new Date("2026-12-31T00:00:00.000Z"),
            }
          : { valid: false, reason: "bad" },
    });

    const actions = factory({
      postWebviewMessage,
      postState: () => undefined,
      logSession,
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad,
    });

    await actions.activateLicense("good");

    expect(settings.isLicenseActivated()).toBe(true);
    expect(storeLicenseKey).toHaveBeenCalledWith("good");
    expect(setLicenseFlags).toHaveBeenCalledWith({
      sessionPersistence: true,
      multiSession: true,
      swarm: false,
    });
    expect(initializeCompanion).toHaveBeenCalled();
    expect(logSession).toHaveBeenCalledWith("license-activated", {
      flags: {
        sessionPersistence: true,
        multiSession: true,
        swarm: false,
      },
    });
    expect(handleSessionsLoad).toHaveBeenCalled();
  });

  it("builds a settings panel controller factory that wires host state at the edge", async () => {
    const settings = new FakeSettingsStore();
    const initializeCompanion = vi.fn(async () => undefined);
    const storeLicenseKey = vi.fn(async () => undefined);
    const setLicenseFlags = vi.fn();
    const postWebviewMessage = vi.fn();
    const logSession = vi.fn();
    const handleSessionsLoad = vi.fn(async () => undefined);

    const factory = createSettingsPanelControllerFactory({
      settings,
      refreshWorkspaceStatus: () => undefined,
      initializeCompanion,
      storeLicenseKey,
      verifyLicense: rawKey =>
        rawKey === "good"
          ? {
              valid: true,
              flags: {
                sessionPersistence: true,
                multiSession: true,
                swarm: false,
              },
              expiresAt: new Date("2026-12-31T00:00:00.000Z"),
            }
          : { valid: false, reason: "bad" },
    });

    const actions = factory({
      postWebviewMessage,
      postState: () => undefined,
      logSession,
      setLicenseFlags,
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad,
    });

    await actions.activateLicense("good");

    expect(settings.isLicenseActivated()).toBe(true);
    expect(storeLicenseKey).toHaveBeenCalledWith("good");
    expect(setLicenseFlags).toHaveBeenCalledWith({
      sessionPersistence: true,
      multiSession: true,
      swarm: false,
    });
    expect(initializeCompanion).toHaveBeenCalled();
    expect(logSession).toHaveBeenCalledWith("license-activated", {
      flags: {
        sessionPersistence: true,
        multiSession: true,
        swarm: false,
      },
    });
    expect(handleSessionsLoad).toHaveBeenCalled();
  });

  it("validates onboarding keys and completes onboarding with UI updates", async () => {
    const settings = new FakeSettingsStore();
    const postWebviewMessage = vi.fn();
    const refreshWorkspaceStatus = vi.fn();
    const postState = vi.fn();

    const actions = createSettingsPanelActions({
      settings,
      postWebviewMessage,
      postState,
      refreshWorkspaceStatus,
      initializeCompanion: async () => undefined,
      storeLicenseKey: async () => undefined,
      setLicenseFlags: () => undefined,
      logSession: () => undefined,
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => undefined,
      verifyLicense: () => ({ valid: false, reason: "bad" }),
    });

    await actions.validateOnboardingKey(
      "claude-cli",
      "",
      undefined,
      "claude-sonnet",
    );
    expect(postWebviewMessage).toHaveBeenCalledWith({
      type: "onboarding:keyValid",
    });

    await actions.completeOnboarding(
      {
        id: "",
        alias: "Claude",
        type: "anthropic",
        model: "claude-sonnet",
      },
      "secret",
    );

    expect(postWebviewMessage).toHaveBeenCalledWith({
      type: "onboarding:done",
    });
    expect(settings.getProviders()).toHaveLength(1);
    expect(settings.getActiveProviderId()).toBeTruthy();
    expect(postState).toHaveBeenCalled();
    expect(refreshWorkspaceStatus).toHaveBeenCalled();
  });

  it("loads, saves, deletes, toggles, and activates providers through panel actions", async () => {
    const settings = new FakeSettingsStore();
    settings.providers = [
      { id: "p1", alias: "Claude", type: "anthropic", model: "claude-sonnet" },
    ];
    const postWebviewMessage = vi.fn();
    const refreshWorkspaceStatus = vi.fn();
    const postState = vi.fn();

    const actions = createSettingsPanelActions({
      settings,
      postWebviewMessage,
      postState,
      refreshWorkspaceStatus,
      initializeCompanion: async () => undefined,
      storeLicenseKey: async () => undefined,
      setLicenseFlags: () => undefined,
      logSession: () => undefined,
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => undefined,
      verifyLicense: () => ({ valid: false, reason: "bad" }),
    });

    await actions.loadSettings();
    expect(postWebviewMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "settings:data",
        providers: [
          expect.objectContaining({ id: "p1", hasKey: false }),
        ],
      }),
    );

    await actions.saveSettingsProvider(
      { id: "p1", alias: "Claude 2", type: "anthropic", model: "claude-3-7-sonnet" },
      "new-secret",
    );
    expect(settings.providers[0]).toMatchObject({
      id: "p1",
      alias: "Claude 2",
      model: "claude-3-7-sonnet",
    });
    expect(settings.apiKeys.get("p1")).toBe("new-secret");

    await actions.setShowThinkingSummaries(false);
    expect(settings.getShowThinkingSummaries()).toBe(false);
    expect(postState).toHaveBeenCalled();

    await actions.setLanguage("en-US");
    expect(settings.getLanguage()).toBe("en-US");

    await actions.setActiveProvider("p1");
    expect(settings.getActiveProviderId()).toBe("p1");

    await actions.deleteSettingsProvider("p1");
    expect(settings.providers).toEqual([]);
    expect(refreshWorkspaceStatus).toHaveBeenCalled();
  });

  it("handles invalid and valid license activation flows", async () => {
    const settings = new FakeSettingsStore();
    const postWebviewMessage = vi.fn();
    const initializeCompanion = vi.fn(async () => undefined);
    const storeLicenseKey = vi.fn(async () => undefined);
    const setLicenseFlags = vi.fn();
    const logSession = vi.fn();
    const handleSessionsLoad = vi.fn(async () => undefined);

    const actions = createSettingsPanelActions({
      settings,
      postWebviewMessage,
      postState: () => undefined,
      refreshWorkspaceStatus: () => undefined,
      initializeCompanion,
      storeLicenseKey,
      setLicenseFlags,
      logSession,
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad,
      verifyLicense: rawKey =>
        rawKey === "bad"
          ? { valid: false, reason: "invalid key" }
          : {
              valid: true,
              flags: {
                sessionPersistence: true,
                multiSession: true,
                swarm: false,
              },
              expiresAt: new Date("2026-12-31T00:00:00.000Z"),
            },
    });

    await actions.activateLicense("bad");
    expect(postWebviewMessage).toHaveBeenCalledWith({
      type: "license:result",
      success: false,
      error: "invalid key",
    });

    await actions.activateLicense("good");
    expect(settings.isLicenseActivated()).toBe(true);
    expect(storeLicenseKey).toHaveBeenCalledWith("good");
    expect(setLicenseFlags).toHaveBeenCalledWith({
      sessionPersistence: true,
      multiSession: true,
      swarm: false,
    });
    expect(postWebviewMessage).toHaveBeenCalledWith({
      type: "license:result",
      success: true,
      flags: {
        sessionPersistence: true,
        multiSession: true,
        swarm: false,
      },
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    expect(initializeCompanion).toHaveBeenCalled();
    expect(logSession).toHaveBeenCalledWith("license-activated", {
      flags: {
        sessionPersistence: true,
        multiSession: true,
        swarm: false,
      },
    });
    expect(handleSessionsLoad).toHaveBeenCalled();
  });
});
