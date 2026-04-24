import { describe, expect, it, vi } from "vitest";
import { handleSettingsWebviewMessage } from "./settingsCommandHost";

describe("settingsCommandHost", () => {
  it("routes onboarding validation and completion messages", async () => {
    const calls: string[] = [];

    const handledValidate = await handleSettingsWebviewMessage({
      message: {
        type: "onboarding:validateKey",
        provider: "openai",
        apiKey: "secret",
        baseUrl: "https://example.com",
        model: "gpt-4.1",
      },
      validateOnboardingKey: async (providerType, apiKey, baseUrl, model) => {
        calls.push(`validate:${providerType}:${apiKey}:${baseUrl}:${model}`);
      },
      completeOnboarding: async (_meta, apiKey) => {
        calls.push(`complete:${apiKey}`);
      },
      loadSettings: async () => {
        calls.push("load");
      },
      saveSettingsProvider: async () => {
        calls.push("save");
      },
      deleteSettingsProvider: async id => {
        calls.push(`delete:${id}`);
      },
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    const handledComplete = await handleSettingsWebviewMessage({
      message: {
        type: "onboarding:complete",
        providerMeta: { id: "provider-1" },
        apiKey: "secret-2",
      },
      validateOnboardingKey: async () => {
        calls.push("validate");
      },
      completeOnboarding: async (_meta, apiKey) => {
        calls.push(`complete:${apiKey}`);
      },
      loadSettings: async () => {
        calls.push("load");
      },
      saveSettingsProvider: async () => {
        calls.push("save");
      },
      deleteSettingsProvider: async id => {
        calls.push(`delete:${id}`);
      },
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    expect(handledValidate).toBe(true);
    expect(handledComplete).toBe(true);
    expect(calls).toEqual([
      "validate:openai:secret:https://example.com:gpt-4.1",
      "complete:secret-2",
    ]);
  });

  it("routes settings and license messages", async () => {
    const calls: string[] = [];

    await handleSettingsWebviewMessage({
      message: { type: "settings:load" },
      validateOnboardingKey: async () => {
        calls.push("validate");
      },
      completeOnboarding: async () => {
        calls.push("complete");
      },
      loadSettings: async () => {
        calls.push("load");
      },
      saveSettingsProvider: async (_meta, apiKey) => {
        calls.push(`save:${apiKey ?? ""}`);
      },
      deleteSettingsProvider: async id => {
        calls.push(`delete:${id}`);
      },
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "settings:saveProvider", meta: { id: "p1" }, apiKey: "secret" },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async (_meta, apiKey) => {
        calls.push(`save:${apiKey ?? ""}`);
      },
      deleteSettingsProvider: async id => {
        calls.push(`delete:${id}`);
      },
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "settings:deleteProvider", id: "p1" },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async () => undefined,
      deleteSettingsProvider: async id => {
        calls.push(`delete:${id}`);
      },
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "settings:setShowThinkingSummaries", enabled: false },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async () => undefined,
      deleteSettingsProvider: async () => undefined,
      setShowThinkingSummaries: async enabled => {
        calls.push(`thinking:${enabled}`);
      },
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "settings:setActive", id: "p2" },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async () => undefined,
      deleteSettingsProvider: async () => undefined,
      setShowThinkingSummaries: async () => undefined,
      setActiveProvider: async id => {
        calls.push(`active:${id}`);
      },
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "settings:close" },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async () => undefined,
      deleteSettingsProvider: async () => undefined,
      setShowThinkingSummaries: async () => undefined,
      setActiveProvider: async () => undefined,
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    await handleSettingsWebviewMessage({
      message: { type: "license:activate", key: "ABC" },
      validateOnboardingKey: async () => undefined,
      completeOnboarding: async () => undefined,
      loadSettings: async () => undefined,
      saveSettingsProvider: async () => undefined,
      deleteSettingsProvider: async () => undefined,
      setShowThinkingSummaries: async () => undefined,
      setActiveProvider: async () => undefined,
      closeSettings: () => {
        calls.push("close");
      },
      activateLicense: async key => {
        calls.push(`license:${key}`);
      },
    });

    expect(calls).toEqual([
      "load",
      "save:secret",
      "delete:p1",
      "thinking:false",
      "active:p2",
      "close",
      "license:ABC",
    ]);
  });

  it("returns false for unrelated messages", async () => {
    const handled = await handleSettingsWebviewMessage({
      message: { type: "unknown" },
      validateOnboardingKey: vi.fn(),
      completeOnboarding: vi.fn(),
      loadSettings: vi.fn(),
      saveSettingsProvider: vi.fn(),
      deleteSettingsProvider: vi.fn(),
      setShowThinkingSummaries: vi.fn(),
      setActiveProvider: vi.fn(),
      closeSettings: vi.fn(),
      activateLicense: vi.fn(),
    });

    expect(handled).toBe(false);
  });
});
