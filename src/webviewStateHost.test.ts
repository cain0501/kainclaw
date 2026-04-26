import { describe, expect, it, vi } from "vitest";

import {
  buildWebviewStatePayload,
  createStreamingStateBindings,
  createStreamingStateBindingsFactory,
  createWebviewStateBindings,
  createWebviewStateBindingsFactory,
  WebviewStateHost,
} from "./webviewStateHost";

describe("webviewStateHost", () => {
  it("builds sidebar state payloads", () => {
    expect(
      buildWebviewStatePayload({
        isBusy: true,
        providerLabel: "anthropic",
        mcpServers: [],
        liveActivities: [],
        lastRunActivities: [],
        messages: [],
        effortLevel: "high",
        fastMode: false,
        fastModeLabel: "off",
        fastModeConnected: false,
        showThinkingSummaries: true,
        planMode: {
          active: false,
          planFilePath: null,
        },
        pendingApproval: null,
        onboardingDone: true,
      }),
    ).toEqual({
      type: "state",
      isBusy: true,
      providerLabel: "anthropic",
      mcpServers: [],
      liveActivities: [],
      lastRunActivities: [],
      messages: [],
      effortLevel: "high",
      fastMode: false,
      fastModeLabel: "off",
      fastModeConnected: false,
      showThinkingSummaries: true,
      planMode: {
        active: false,
        planFilePath: null,
      },
      pendingApproval: null,
      onboardingDone: true,
    });
  });

  it("coalesces state posts into one microtask flush", async () => {
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);

    host.requestStatePost(() =>
      buildWebviewStatePayload({
        isBusy: false,
        providerLabel: "one",
        mcpServers: [],
        liveActivities: [],
        lastRunActivities: [],
        messages: [],
        effortLevel: null,
        fastMode: false,
        fastModeLabel: "off",
        fastModeConnected: false,
        showThinkingSummaries: true,
        planMode: { active: false, planFilePath: null },
        pendingApproval: null,
        onboardingDone: true,
      }),
    );
    host.requestStatePost(() =>
      buildWebviewStatePayload({
        isBusy: true,
        providerLabel: "two",
        mcpServers: [],
        liveActivities: [],
        lastRunActivities: [],
        messages: [],
        effortLevel: null,
        fastMode: false,
        fastModeLabel: "off",
        fastModeConnected: false,
        showThinkingSummaries: true,
        planMode: { active: false, planFilePath: null },
        pendingApproval: null,
        onboardingDone: true,
      }),
    );

    expect(postMessage).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "state",
        providerLabel: "one",
      }),
    );
  });

  it("schedules streaming updates and posts companion/license events", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);

    host.scheduleStreamingStateUpdate(() => ({
      type: "stateUpdate",
      isBusy: true,
      streamingText: "hello",
    }));
    host.scheduleStreamingStateUpdate(() => ({
      type: "stateUpdate",
      isBusy: true,
      streamingText: "ignored",
    }));

    expect(postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(33);
    expect(postMessage).toHaveBeenCalledWith({
      type: "stateUpdate",
      isBusy: true,
      streamingText: "hello",
    });

    host.postLicenseRequired("multiSession");
    host.postCompanionInit({
      id: "duck",
      name: "Duck",
      description: "helper",
      sprite: "duck.png",
      moodLevel: 0,
      bondLevel: 0,
      totalConversations: 0,
      lastActiveAt: 0,
    } as any);
    host.postCompanionState("thinking");
    host.postCompanionMood(2, {
      id: "duck",
      name: "Duck",
      description: "helper",
      sprite: "duck.png",
      moodLevel: 2,
      bondLevel: 0,
      totalConversations: 1,
      lastActiveAt: 1,
    } as any);

    expect(postMessage).toHaveBeenCalledWith({
      type: "license:required",
      feature: "multiSession",
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "companion:init" }),
    );
    expect(postMessage).toHaveBeenCalledWith({
      type: "companion:state",
      state: "thinking",
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "companion:mood", delta: 2 }),
    );

    vi.useRealTimers();
  });

  it("creates streaming bindings that proxy clear/schedule through the host", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);
    let isBusy = true;
    let streamingText = "hello";

    const bindings = createStreamingStateBindings({
      host,
      getIsBusy: () => isBusy,
      getStreamingText: () => streamingText,
    });

    bindings.scheduleStreamingStateUpdate();
    await vi.advanceTimersByTimeAsync(33);
    expect(postMessage).toHaveBeenCalledWith({
      type: "stateUpdate",
      isBusy: true,
      streamingText: "hello",
    });

    bindings.scheduleStreamingStateUpdate();
    bindings.clearStreamingUpdateTimer();
    streamingText = "ignored";
    await vi.advanceTimersByTimeAsync(33);
    expect(postMessage).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("builds a streaming bindings factory around a stable host", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);
    let isBusy = true;
    let streamingText = "hello";

    const factory = createStreamingStateBindingsFactory({ host });
    const bindings = factory({
      getIsBusy: () => isBusy,
      getStreamingText: () => streamingText,
    });

    bindings.scheduleStreamingStateUpdate();
    await vi.advanceTimersByTimeAsync(33);
    expect(postMessage).toHaveBeenCalledWith({
      type: "stateUpdate",
      isBusy: true,
      streamingText: "hello",
    });

    vi.useRealTimers();
  });

  it("creates state bindings that build and post sidebar state payloads", async () => {
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);
    const bindings = createWebviewStateBindings({
      host,
      getIsBusy: () => true,
      getProviderLabel: () => "anthropic",
      getMcpServers: () => [{ name: "github" }],
      getLiveActivities: () => [{ id: "live-1" }],
      getLastRunActivities: () => [{ id: "done-1" }],
      getMessages: () => [{ role: "assistant", content: "hello" }],
      getEffortLevel: () => "high",
      getFastMode: () => true,
      getFastModeIndicator: () => ({ label: "enabled", connected: true }),
      getShowThinkingSummaries: () => false,
      getPlanMode: () => ({ active: true, planFilePath: "plan.md" }),
      getPendingApproval: () => ({ kind: "tool" }),
      getOnboardingDone: () => true,
    });

    bindings.postState();

    expect(postMessage).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledWith({
      type: "state",
      isBusy: true,
      providerLabel: "anthropic",
      mcpServers: [{ name: "github" }],
      liveActivities: [{ id: "live-1" }],
      lastRunActivities: [{ id: "done-1" }],
      messages: [{ role: "assistant", content: "hello" }],
      effortLevel: "high",
      fastMode: true,
      fastModeLabel: "enabled",
      fastModeConnected: true,
      showThinkingSummaries: false,
      planMode: {
        active: true,
        planFilePath: "plan.md",
      },
      pendingApproval: { kind: "tool" },
      onboardingDone: true,
    });
  });

  it("builds a state bindings factory around a stable host", async () => {
    const postMessage = vi.fn();
    const host = new WebviewStateHost(postMessage);
    const factory = createWebviewStateBindingsFactory({ host });
    const bindings = factory({
      getIsBusy: () => true,
      getProviderLabel: () => "anthropic",
      getMcpServers: () => [{ name: "github" }],
      getLiveActivities: () => [{ id: "live-1" }],
      getLastRunActivities: () => [{ id: "done-1" }],
      getMessages: () => [{ role: "assistant", content: "hello" }],
      getEffortLevel: () => "high",
      getFastMode: () => true,
      getFastModeIndicator: () => ({ label: "enabled", connected: true }),
      getShowThinkingSummaries: () => false,
      getPlanMode: () => ({ active: true, planFilePath: "plan.md" }),
      getPendingApproval: () => ({ kind: "tool" }),
      getOnboardingDone: () => true,
    });

    bindings.postState();

    expect(postMessage).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledWith({
      type: "state",
      isBusy: true,
      providerLabel: "anthropic",
      mcpServers: [{ name: "github" }],
      liveActivities: [{ id: "live-1" }],
      lastRunActivities: [{ id: "done-1" }],
      messages: [{ role: "assistant", content: "hello" }],
      effortLevel: "high",
      fastMode: true,
      fastModeLabel: "enabled",
      fastModeConnected: true,
      showThinkingSummaries: false,
      planMode: {
        active: true,
        planFilePath: "plan.md",
      },
      pendingApproval: { kind: "tool" },
      onboardingDone: true,
    });
  });
});
