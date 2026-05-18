import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function renderThinkingSummaryMessage() {
  const rendererPath = path.join(__dirname, "renderer", "index.html");
  const html = await readFile(rendererPath, "utf8");
  const start = html.indexOf("function getThinkingSummaryToggleId(messageIndex) {");
  const end = html.indexOf("function renderMessageContent(text, isUser = false", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

const script = `
const expandedThinkingSummaries = new Set();
const appState = { messages: [null, null, null] };
const DEFAULT_SHELL_STRINGS = {
  thinkingSummaryTitle: "Thought summary",
};
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
function renderMessageContent(text) {
  return "<p>" + escapeHtml(text) + "</p>";
}
function renderToolUseMessage() {
  return "";
}
function renderToolResultMessage() {
  return "";
}
function shellText(key) {
  return DEFAULT_SHELL_STRINGS[key] || "";
}
${html.slice(start, end)}
collapsedResult = renderMessage(message, messageIndex);
expandedThinkingSummaries.add(getThinkingSummaryToggleId(messageIndex));
expandedResult = renderMessage(message, messageIndex);
`;

  const context = {
    message: {
      role: "assistant",
      kind: "thinking",
      content: "Both Claude and Codex reached consensus.",
    },
    messageIndex: 2,
    collapsedResult: "",
    expandedResult: "",
  };
  vm.runInNewContext(script, context);
  return context as { collapsedResult: string; expandedResult: string };
}

describe("Electron renderer thinking summary cards", () => {
  it("renders thinking summaries collapsed by default and expandable on demand", async () => {
    const { collapsedResult, expandedResult } = await renderThinkingSummaryMessage();

    expect(collapsedResult).toContain("thinking-card-collapsed");
    expect(collapsedResult).toContain('onclick="toggleThinkingSummary(2)"');
    expect(collapsedResult).toContain("Thought summary");
    expect(collapsedResult).not.toContain("Both Claude and Codex reached consensus");

    expect(expandedResult).toContain("thinking-card-expanded");
    expect(expandedResult).toContain("Both Claude and Codex reached consensus");
  });
});
