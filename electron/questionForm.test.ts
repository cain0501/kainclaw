import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

async function loadQuestionFormModule() {
  const filePath = path.join(__dirname, "renderer", "questionForm.js");
  const source = await readFile(filePath, "utf8");
  const sandbox: { globalThis?: unknown; window?: unknown; KainClawQuestionForm?: unknown } = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.KainClawQuestionForm as {
    splitOnQuestionForms: (input: string) => Array<Record<string, unknown>>;
    formatFormAnswers: (
      form: Record<string, unknown>,
      answers: Record<string, unknown>,
    ) => string;
    parseFormattedFormAnswers: (
      input: string,
      formId: string,
    ) => Record<string, string> | null;
  };
}

describe("renderer question form module", () => {
  it("parses question-form blocks into text and form segments", async () => {
    const module = await loadQuestionFormModule();
    const segments = module.splitOnQuestionForms([
      "Got it — tell me a bit more first.",
      '<question-form id="discovery" title="Quick brief">',
      '{"questions":[{"id":"tone","label":"Tone","type":"radio","required":true,"options":["Editorial","Minimal"]}]}',
      "</question-form>",
    ].join("\n"));

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      kind: "text",
    });
    expect(segments[1]).toMatchObject({
      kind: "form",
      form: {
        id: "discovery",
        title: "Quick brief",
      },
    });
  });

  it("formats form answers into the design-lane follow-up contract", async () => {
    const module = await loadQuestionFormModule();
    const payload = module.formatFormAnswers(
      {
        id: "discovery",
        questions: [
          { id: "tone", label: "Tone" },
          { id: "audience", label: "Audience" },
        ],
      },
      {
        tone: "Editorial",
        audience: "Investors",
      },
    );

    expect(payload).toBe([
      "[form answers - discovery]",
      "- Tone: Editorial",
      "- Audience: Investors",
    ].join("\n"));
  });

  it("parses submitted answer text back into label-value pairs", async () => {
    const module = await loadQuestionFormModule();
    const parsed = module.parseFormattedFormAnswers(
      [
        "[form answers - discovery]",
        "- Tone: Editorial",
        "- Audience: Investors",
      ].join("\n"),
      "discovery",
    );

    expect(parsed).toEqual({
      Tone: "Editorial",
      Audience: "Investors",
    });
  });
});
