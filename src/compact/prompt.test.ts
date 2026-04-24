import { describe, expect, it } from "vitest";
import {
  COMPACT_CONTINUATION_PREFIX,
  formatCompactSummary,
  getCompactPrompt,
  getCompactUserSummaryMessage,
  getPartialCompactPrompt,
  isCompactUserSummaryMessage,
  mergeCompactUserSummaryMessage,
} from "./prompt";

describe("compact prompt helpers", () => {
  it("builds the full compact prompt with no-tools guardrails", () => {
    const prompt = getCompactPrompt("Focus on code changes");

    expect(prompt).toContain("CRITICAL: Respond with TEXT ONLY");
    expect(prompt).toContain("Additional Instructions");
    expect(prompt).toContain("Focus on code changes");
    expect(prompt).toContain("Tool calls will be rejected");
  });

  it("builds the partial compact prompt for both directions", () => {
    const fromPrompt = getPartialCompactPrompt(undefined, "from");
    const upToPrompt = getPartialCompactPrompt(undefined, "up_to");

    expect(fromPrompt).toContain("RECENT portion of the conversation");
    expect(upToPrompt).toContain("newer messages that build on this context will follow");
  });

  it("formats summaries by removing analysis blocks and rewriting summary tags", () => {
    const formatted = formatCompactSummary(`
<analysis>
internal notes
</analysis>

<summary>
Primary Request and Intent
</summary>
`);

    expect(formatted).not.toContain("<analysis>");
    expect(formatted).toContain("Summary:");
    expect(formatted).toContain("Primary Request and Intent");
  });

  it("removes repeated analysis blocks before keeping the summary", () => {
    const formatted = formatCompactSummary(`
<analysis>
first chain of thought
</analysis>

<analysis>
second chain of thought
</analysis>

<summary>
Only the summary should remain
</summary>
`);

    expect(formatted).not.toContain("first chain of thought");
    expect(formatted).not.toContain("second chain of thought");
    expect(formatted).toBe("Summary:\nOnly the summary should remain");
  });

  it("builds a user summary message with transcript path and preserved-message note", () => {
    const message = getCompactUserSummaryMessage(
      "<summary>Done</summary>",
      true,
      ".cain-artifacts/full-transcript.md",
      true,
    );

    expect(message).toContain("full-transcript.md");
    expect(message).toContain("Recent messages are preserved verbatim.");
    expect(message).toContain("Resume directly");
  });

  it("detects and merges existing compact summary messages", () => {
    const existing = getCompactUserSummaryMessage(
      "<summary>Earlier summary</summary>",
      true,
      "E:/sessions/demo.jsonl",
      true,
    );

    expect(isCompactUserSummaryMessage(existing)).toBe(true);
    expect(existing).toContain(COMPACT_CONTINUATION_PREFIX);

    const merged = mergeCompactUserSummaryMessage({
      existingSummaryMessage: existing,
      additionalSummary: "<summary>Later summary</summary>",
      transcriptPath: "E:/sessions/demo.jsonl",
      recentMessagesPreserved: true,
    });

    expect(merged).toContain("Earlier summary");
    expect(merged).toContain("Additional summary from later messages");
    expect(merged).toContain("Later summary");
    expect(merged).toContain("Resume directly");
  });

  it("replaces stale transcript paths when merging compact summaries", () => {
    const existing = getCompactUserSummaryMessage(
      "<summary>Earlier summary</summary>",
      true,
      "E:/sessions/old.jsonl",
      true,
    );

    const merged = mergeCompactUserSummaryMessage({
      existingSummaryMessage: existing,
      additionalSummary: "<summary>Later summary</summary>",
      transcriptPath: "E:/sessions/new.jsonl",
      recentMessagesPreserved: true,
    });

    expect(merged).toContain("E:/sessions/new.jsonl");
    expect(merged).not.toContain("E:/sessions/old.jsonl");
    expect(
      merged.match(/If you need specific details from before compaction, read the full transcript at:/g),
    ).toHaveLength(1);
  });

  it("removes stale recent-message-preserved notes when later compaction keeps no verbatim tail", () => {
    const existing = getCompactUserSummaryMessage(
      "<summary>Earlier summary</summary>",
      true,
      "E:/sessions/demo.jsonl",
      true,
    );

    const merged = mergeCompactUserSummaryMessage({
      existingSummaryMessage: existing,
      additionalSummary: "<summary>Later summary</summary>",
      transcriptPath: "E:/sessions/demo.jsonl",
      recentMessagesPreserved: false,
    });

    expect(merged).not.toContain("Recent messages are preserved verbatim.");
  });

  it("adds the continuation trailer when merging into an older summary format without it", () => {
    const existing =
      `${COMPACT_CONTINUATION_PREFIX} The summary below covers the earlier portion of the conversation.\n\nSummary:\nEarlier summary`;

    const merged = mergeCompactUserSummaryMessage({
      existingSummaryMessage: existing,
      additionalSummary: "<summary>Later summary</summary>",
      suppressFollowUpQuestions: true,
      recentMessagesPreserved: false,
    });

    expect(merged).toContain("Earlier summary");
    expect(merged).toContain("Later summary");
    expect(merged).toContain(
      'Continue the conversation from where it left off without asking the user any further questions.',
    );
  });
});
