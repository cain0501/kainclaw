import { describe, expect, it, vi } from "vitest";
import { distillUserProfile, type ConversationMessage } from "./profileDistiller";
import type { ProfileStore } from "./profileStore";
import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";

function makeHistory(turns: number): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (let i = 0; i < turns; i++) {
    messages.push({ role: i % 2 === 0 ? "user" : "assistant", content: `message ${i}` });
  }
  return messages;
}

function makeProvider(reasoning: string, delta: string = "NO_CHANGES"): IProviderAdapter {
  return {
    runStep: vi.fn()
      .mockResolvedValueOnce({ text: reasoning })
      .mockResolvedValueOnce({ text: delta }),
  } as unknown as IProviderAdapter;
}

function makeProfileStore(existingContent: string | null = null): ProfileStore {
  return {
    load: vi.fn().mockResolvedValue(existingContent),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    applyDelta: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProfileStore;
}

describe("distillUserProfile", () => {
  it("returns early when history has fewer than 20 messages", async () => {
    const store = makeProfileStore();
    const provider = makeProvider("some reasoning");

    await distillUserProfile(makeHistory(19), store, provider);

    expect(provider.runStep).not.toHaveBeenCalled();
    expect(store.load).not.toHaveBeenCalled();
  });

  it("calls provider twice (reasoning then delta) when history has at least 20 messages", async () => {
    const store = makeProfileStore();
    const provider = makeProvider("user is experienced with TypeScript", "NO_CHANGES");

    await distillUserProfile(makeHistory(20), store, provider);

    expect(provider.runStep).toHaveBeenCalledTimes(2);
  });

  it("does not call delta step when reasoning returns empty string", async () => {
    const store = makeProfileStore();
    const provider = {
      runStep: vi.fn().mockResolvedValueOnce({ text: "" }),
    } as unknown as IProviderAdapter;

    await distillUserProfile(makeHistory(20), store, provider);

    expect(provider.runStep).toHaveBeenCalledOnce();
    expect(store.applyDelta).not.toHaveBeenCalled();
  });

  it("does not update profile when delta response is NO_CHANGES", async () => {
    const store = makeProfileStore("existing profile content");
    const provider = makeProvider("user likes concise answers", "NO_CHANGES");

    await distillUserProfile(makeHistory(20), store, provider);

    expect(store.applyDelta).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("calls applyDelta when delta response contains delta directives", async () => {
    const store = makeProfileStore("existing profile");
    const deltaResponse = "ADD: 技术栈与熟悉程度 | TypeScript：熟练";
    const provider = makeProvider("user is a TypeScript developer", deltaResponse);

    await distillUserProfile(makeHistory(20), store, provider);

    expect(store.applyDelta).toHaveBeenCalledWith(deltaResponse);
  });

  it("calls applyDelta with full profile when no existing profile", async () => {
    const store = makeProfileStore(null);
    const fullProfileResponse = "# 用户画像\n\n## 技术栈\n\n- TypeScript：熟练";
    const provider = makeProvider("user is new to this codebase", fullProfileResponse);

    await distillUserProfile(makeHistory(20), store, provider);

    expect(store.applyDelta).toHaveBeenCalledWith(fullProfileResponse);
  });

  it("does not throw when reasoning step fails", async () => {
    const store = makeProfileStore();
    const provider = {
      runStep: vi.fn().mockRejectedValue(new Error("network error")),
    } as unknown as IProviderAdapter;

    await expect(distillUserProfile(makeHistory(20), store, provider)).resolves.toBeUndefined();
    expect(store.applyDelta).not.toHaveBeenCalled();
  });

  it("does not throw when delta step fails", async () => {
    const store = makeProfileStore();
    const provider = {
      runStep: vi.fn()
        .mockResolvedValueOnce({ text: "some reasoning" })
        .mockRejectedValueOnce(new Error("delta error")),
    } as unknown as IProviderAdapter;

    await expect(distillUserProfile(makeHistory(20), store, provider)).resolves.toBeUndefined();
    expect(store.applyDelta).not.toHaveBeenCalled();
  });

  it("does not throw when profileStore.applyDelta fails", async () => {
    const store = makeProfileStore(null);
    (store.applyDelta as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("write error"));
    const provider = makeProvider("some reasoning", "ADD: 技术栈 | Go：不熟悉");

    await expect(distillUserProfile(makeHistory(20), store, provider)).resolves.toBeUndefined();
  });

  it("passes reasoning output into the delta step prompt", async () => {
    const store = makeProfileStore(null);
    const reasoningOutput = "user-prefers-rust-over-python-unique-marker";
    const provider = makeProvider(reasoningOutput, "NO_CHANGES");

    await distillUserProfile(makeHistory(20), store, provider);

    const secondCall = (provider.runStep as ReturnType<typeof vi.fn>).mock.calls[1] as [ConversationMessage[], ...unknown[]];
    const deltaPromptContent = (secondCall[0] as ConversationMessage[])[0].content;
    expect(deltaPromptContent).toContain(reasoningOutput);
  });

  it("includes conversation content in the reasoning prompt", async () => {
    const store = makeProfileStore(null);
    const provider = makeProvider("some reasoning", "NO_CHANGES");
    const history = makeHistory(20);
    history[0] = { role: "user", content: "unique-user-prompt-xyz" };

    await distillUserProfile(history, store, provider);

    const firstCall = (provider.runStep as ReturnType<typeof vi.fn>).mock.calls[0] as [ConversationMessage[], ...unknown[]];
    const reasoningPromptContent = (firstCall[0] as ConversationMessage[])[0].content;
    expect(reasoningPromptContent).toContain("unique-user-prompt-xyz");
  });

  it("reasoning prompt covers all eight analysis dimensions", async () => {
    const store = makeProfileStore(null);
    const provider = makeProvider("some reasoning", "NO_CHANGES");

    await distillUserProfile(makeHistory(20), store, provider);

    const firstCall = (provider.runStep as ReturnType<typeof vi.fn>).mock.calls[0] as [ConversationMessage[], ...unknown[]];
    const prompt = (firstCall[0] as ConversationMessage[])[0].content;
    expect(prompt).toContain("目标与动机");
    expect(prompt).toContain("技术背景");
    expect(prompt).toContain("工作节奏");
    expect(prompt).toContain("沟通风格");
    expect(prompt).toContain("决策风格");
    expect(prompt).toContain("反复出现的模式");
    expect(prompt).toContain("当前项目上下文");
    expect(prompt).toContain("协作价值点");
  });

  it("uses step.text when accumulated tokens are empty for both steps", async () => {
    const store = makeProfileStore();
    const provider = {
      runStep: vi.fn()
        .mockImplementationOnce(async (_h: unknown, _t: unknown, _onToken: unknown) => {
          return { text: "silent reasoning output" };
        })
        .mockImplementationOnce(async (_h: unknown, _t: unknown, _onToken: unknown) => {
          return { text: "ADD: 项目上下文 | KainClaw 扩展" };
        }),
    } as unknown as IProviderAdapter;

    await distillUserProfile(makeHistory(20), store, provider);

    expect(store.applyDelta).toHaveBeenCalledWith("ADD: 项目上下文 | KainClaw 扩展");
  });

  it("loads existing profile after reasoning step, before delta step", async () => {
    const store = makeProfileStore("existing profile");
    const provider = makeProvider("some reasoning", "NO_CHANGES");

    await distillUserProfile(makeHistory(20), store, provider);

    const runStepOrder = (provider.runStep as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    const loadOrder = (store.load as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    expect(loadOrder[0]).toBeGreaterThan(runStepOrder[0]);
    expect(loadOrder[0]).toBeLessThan(runStepOrder[1]);
  });
});
