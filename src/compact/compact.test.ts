import { describe, expect, it } from "vitest";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "../agent/providers/IProviderAdapter";
import { compactConversationHistory } from "./compact";

class FakeProvider implements IProviderAdapter {
  readonly calls: NormalizedMessage[][] = [];

  constructor(private readonly text: string) {}

  async runStep(
    messages: NormalizedMessage[],
    _tools: unknown[],
    _onToken: (token: string) => void,
  ): Promise<NormalizedStep> {
    this.calls.push(messages);
    return {
      text: this.text,
      toolCalls: [],
      done: true,
    };
  }
}

describe("compact conversation history", () => {
  it("compacts short conversations instead of blocking on message count", async () => {
    const provider = new FakeProvider("<summary>Short summary</summary>");
    const result = await compactConversationHistory({
      provider,
      messages: [
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
      ],
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(2);
    expect(result.messagesKept).toBe(0);
    expect(provider.calls[0]).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
    ]);
  });

  it("uses media markers when compacting short attachment-only conversations", async () => {
    const provider = new FakeProvider("<summary>Image discussed</summary>");
    const result = await compactConversationHistory({
      provider,
      messages: [
        {
          role: "user",
          content: "",
          attachments: [{ data: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" }],
        },
        { role: "assistant", content: "I can see the image." },
      ],
    });

    expect(result.wasCompacted).toBe(true);
    expect(provider.calls[0]).toEqual([
      { role: "user", content: "[image]" },
      { role: "assistant", content: "I can see the image." },
    ]);
    expect(result.compactedHistory[0]?.content).toContain("Image discussed");
    expect(result.messagesCompacted).toBe(2);
    expect(result.messagesKept).toBe(0);
  });

  it("compacts older messages into a summary and preserves recent messages", async () => {
    const messages: NormalizedMessage[] = [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
      { role: "user", content: "recent user" },
      { role: "assistant", content: "recent assistant" },
    ];

    const result = await compactConversationHistory({
      provider: new FakeProvider("<summary>Summarized work</summary>"),
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 2,
      maxRecentMessages: 2,
      suppressFollowUpQuestions: true,
      transcriptPath: "E:/sessions/full-transcript.jsonl",
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.rawSummary).toContain("<summary>Summarized work</summary>");
    expect(result.formattedSummary).toContain("Summary:");
    expect(result.messagesCompacted).toBe(8);
    expect(result.messagesKept).toBe(2);
    expect(result.compactedHistory).toHaveLength(3);
    expect(result.compactedHistory[0]?.role).toBe("user");
    expect(result.compactedHistory[0]?.content).toContain("Summarized work");
    expect(result.compactedHistory[0]?.content).toContain("full-transcript.jsonl");
    expect(result.compactedHistory[1]?.content).toBe("recent user");
    expect(result.compactedHistory[2]?.content).toBe("recent assistant");
  });

  it("preserves attachment-only recent user messages when compacting older history", async () => {
    const messages: NormalizedMessage[] = [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
      {
        role: "user",
        content: "",
        attachments: [{ data: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" }],
      },
      { role: "assistant", content: "recent assistant" },
    ];

    const result = await compactConversationHistory({
      provider: new FakeProvider("<summary>Summarized work</summary>"),
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 2,
      maxRecentMessages: 2,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(8);
    expect(result.messagesKept).toBe(2);
    expect(result.compactedHistory[1]).toEqual({
      role: "user",
      content: "",
      attachments: [{ data: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" }],
    });
    expect(result.compactedHistory[2]?.content).toBe("recent assistant");
  });

  it("strips media payloads from the summary request while preserving markers", async () => {
    const provider = new FakeProvider("<summary>Summarized work</summary>");
    const messages: NormalizedMessage[] = [
      { role: "user", content: "u1" },
      {
        role: "user",
        content: "please inspect this",
        attachments: [{ data: "a".repeat(80_000), mimeType: "image/png" }],
      },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "recent user" },
      { role: "assistant", content: "recent assistant" },
    ];

    const result = await compactConversationHistory({
      provider,
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 2,
      maxRecentMessages: 2,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(provider.calls[0]).toContainEqual({
      role: "user",
      content: "please inspect this\n[image]",
    });
    expect(
      provider.calls[0]?.some(
        message => message.role === "user" && "attachments" in message,
      ),
    ).toBe(false);
  });

  it("extends an existing compact summary instead of discarding it on later compaction", async () => {
    const existingSummary =
      "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\nEarlier work summary\n\nContinue the conversation from where it left off without asking the user any further questions. Resume directly - do not acknowledge the summary, do not recap what was happening, and do not preface with \"I'll continue\" or similar. Pick up the last task as if the break never happened.";
    const messages: NormalizedMessage[] = [
      { role: "user", content: existingSummary },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
      { role: "user", content: "recent user" },
      { role: "assistant", content: "recent assistant" },
    ];

    const result = await compactConversationHistory({
      provider: new FakeProvider("<summary>Later work summary</summary>"),
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 2,
      maxRecentMessages: 2,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(8);
    expect(result.compactedHistory[0]?.content).toContain("Earlier work summary");
    expect(result.compactedHistory[0]?.content).toContain("Additional summary from later messages");
    expect(result.compactedHistory[0]?.content).toContain("Later work summary");
    expect(result.compactedHistory[1]?.content).toBe("recent user");
    expect(result.compactedHistory[2]?.content).toBe("recent assistant");
  });

  it("supports micro-compacting a short tail after an existing summary", async () => {
    const existingSummary =
      "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\nEarlier work summary\n\nContinue the conversation from where it left off without asking the user any further questions. Resume directly - do not acknowledge the summary, do not recap what was happening, and do not preface with \"I'll continue\" or similar. Pick up the last task as if the break never happened.";
    const messages: NormalizedMessage[] = [
      { role: "user", content: existingSummary },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "recent user" },
      { role: "assistant", content: "recent assistant" },
    ];

    const result = await compactConversationHistory({
      provider: new FakeProvider("<summary>Later work summary</summary>"),
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 2,
      maxRecentMessages: 2,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(2);
    expect(result.messagesKept).toBe(2);
    expect(result.compactedHistory[0]?.content).toContain("Earlier work summary");
    expect(result.compactedHistory[0]?.content).toContain("Later work summary");
    expect(result.compactedHistory[1]?.content).toBe("recent user");
    expect(result.compactedHistory[2]?.content).toBe("recent assistant");
  });

  it("micro-compacts short large tails after an existing summary using default recent-message settings", async () => {
    const existingSummary =
      "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\nEarlier work summary\n\nContinue the conversation from where it left off without asking the user any further questions. Resume directly - do not acknowledge the summary, do not recap what was happening, and do not preface with \"I'll continue\" or similar. Pick up the last task as if the break never happened.";
    const messages: NormalizedMessage[] = [
      { role: "user", content: existingSummary },
      ...Array.from({ length: 4 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `tail-${index}-` + "x".repeat(80_000),
      })),
    ];

    const result = await compactConversationHistory({
      provider: new FakeProvider("<summary>Later work summary</summary>"),
      messages,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(2);
    expect(result.messagesKept).toBe(2);
    expect(result.compactedHistory[0]?.content).toContain("Earlier work summary");
    expect(result.compactedHistory[0]?.content).toContain("Later work summary");
  });

  it("preserves assistant tool-call messages in both the summary input and recent tail", async () => {
    const provider = new FakeProvider("<summary>Summarized work</summary>");
    const messages: NormalizedMessage[] = [
      { role: "user", content: "u1" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "a.ts" } }],
      },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tool-2", name: "read_file", input: { path: "b.ts" } }],
      },
      { role: "assistant", content: "recent answer" },
    ];

    const result = await compactConversationHistory({
      provider,
      messages,
      keepRecentTokenBudget: 1,
      minRecentMessages: 3,
      maxRecentMessages: 3,
      suppressFollowUpQuestions: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messagesCompacted).toBe(5);
    expect(result.messagesKept).toBe(3);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toContainEqual({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "a.ts" } }],
    });
    expect(result.compactedHistory.slice(1)).toEqual([
      { role: "user", content: "u3" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tool-2", name: "read_file", input: { path: "b.ts" } }],
      },
      { role: "assistant", content: "recent answer" },
    ]);
  });
});
