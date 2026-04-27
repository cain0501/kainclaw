import { describe, expect, it } from "vitest";

import {
  buildConversationHistoryFromSession,
  cloneConversationHistory,
  createConversationHistoryBindings,
  createConversationHistoryBindingsFactory,
  getHistoryCommandBehavior,
  getVisibleSessionMessages,
  replaceConversationHistory,
} from "./conversationHistoryHost";

describe("conversationHistoryHost", () => {
  it("classifies history-affecting slash commands", () => {
    expect(getHistoryCommandBehavior("/compact now")).toBe("excludeWithReply");
    expect(getHistoryCommandBehavior("/review auth")).toBe("exclude");
    expect(getHistoryCommandBehavior("implement auth")).toBeNull();
  });

  it("builds conversation history while excluding helper commands and thinking rows", () => {
    expect(
      buildConversationHistoryFromSession([
        { role: "user", content: "/compact" },
        { role: "assistant", content: "compacted" },
        { role: "user", content: "/review" },
        { role: "assistant", content: "review started" },
        { role: "assistant", content: "thinking", kind: "thinking" },
        { role: "user", content: "real question" },
        { role: "assistant", content: "real answer" },
      ]),
    ).toEqual([
      { role: "assistant", content: "review started" },
      { role: "user", content: "real question" },
      { role: "assistant", content: "real answer" },
    ]);
  });

  it("preserves attachments when building, cloning, and replacing conversation history", () => {
    const built = buildConversationHistoryFromSession([
      {
        role: "user",
        content: "look at this",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
      { role: "assistant", content: "noted" },
    ]);

    expect(built).toEqual([
      {
        role: "user",
        content: "look at this",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
      { role: "assistant", content: "noted" },
    ]);

    const cloned = cloneConversationHistory(built);
    const target = [{ role: "assistant" as const, content: "old" }];
    replaceConversationHistory(target, cloned);

    expect(cloned).toEqual(built);
    expect(target).toEqual(built);
  });

  it("clones and replaces mutable conversation buffers without sharing references", () => {
    const source = [{ role: "user" as const, content: "hello" }];
    const cloned = cloneConversationHistory(source);
    const target = [{ role: "assistant" as const, content: "old" }];

    replaceConversationHistory(target, cloned);
    source[0]!.content = "changed";

    expect(cloned).toEqual([{ role: "user", content: "hello" }]);
    expect(target).toEqual([{ role: "user", content: "hello" }]);
  });

  it("filters thinking summaries from visible session rows when disabled", () => {
    const sessionMessages = [
      { role: "assistant" as const, content: "thinking", kind: "thinking" as const },
      { role: "assistant" as const, content: "final" },
    ];

    expect(getVisibleSessionMessages(sessionMessages, false)).toEqual([
      { role: "assistant", content: "final" },
    ]);
    expect(getVisibleSessionMessages(sessionMessages, true)).toBe(sessionMessages);
  });

  it("creates live conversation-history bindings for rebuild, read, replace, and visibility", () => {
    const sessionMessages = [
      { role: "user" as const, content: "/compact" },
      { role: "assistant" as const, content: "summary" },
      { role: "user" as const, content: "real question" },
      { role: "assistant" as const, content: "real answer" },
      { role: "assistant" as const, content: "thinking", kind: "thinking" as const },
    ];
    const conversationMessages = [{ role: "assistant" as const, content: "old" }];
    let showThinkingSummaries = false;
    let persisted = 0;

    const bindings = createConversationHistoryBindings({
      sessionMessages,
      conversationMessages,
      getShowThinkingSummaries: () => showThinkingSummaries,
      persistCurrentSessionRuntimeState: () => {
        persisted += 1;
      },
    });

    bindings.rebuildConversationMessagesFromSession();
    expect(conversationMessages).toEqual([
      { role: "user", content: "real question" },
      { role: "assistant", content: "real answer" },
    ]);

    expect(bindings.getConversationHistory()).toEqual([
      { role: "user", content: "real question" },
      { role: "assistant", content: "real answer" },
    ]);

    expect(bindings.getVisibleSessionMessages()).toEqual([
      { role: "user", content: "/compact" },
      { role: "assistant", content: "summary" },
      { role: "user", content: "real question" },
      { role: "assistant", content: "real answer" },
    ]);

    showThinkingSummaries = true;
    expect(bindings.getVisibleSessionMessages()).toBe(sessionMessages);

    bindings.replaceConversationHistory([
      { role: "assistant", content: "new answer" },
    ]);
    expect(conversationMessages).toEqual([
      { role: "assistant", content: "new answer" },
    ]);
    expect(persisted).toBe(1);
  });

  it("builds conversation-history bindings from a stable factory", () => {
    const sessionMessages = [
      { role: "user" as const, content: "real question" },
      { role: "assistant" as const, content: "real answer" },
    ];
    const conversationMessages = [{ role: "assistant" as const, content: "old" }];
    let showThinkingSummaries = false;
    let persisted = 0;

    const factory = createConversationHistoryBindingsFactory({
      getShowThinkingSummaries: () => showThinkingSummaries,
      persistCurrentSessionRuntimeState: () => {
        persisted += 1;
      },
    });
    const bindings = factory({
      sessionMessages,
      conversationMessages,
    });

    expect(bindings.getVisibleSessionMessages()).toEqual(sessionMessages);
    bindings.replaceConversationHistory([
      { role: "assistant", content: "new answer" },
    ]);
    expect(conversationMessages).toEqual([
      { role: "assistant", content: "new answer" },
    ]);
    expect(persisted).toBe(1);

    showThinkingSummaries = true;
    expect(bindings.getVisibleSessionMessages()).toBe(sessionMessages);
  });
});
