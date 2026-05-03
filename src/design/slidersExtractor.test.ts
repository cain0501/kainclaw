import { describe, expect, it } from "vitest";

import {
  KAINCLAW_DESIGN_HTML_END,
  KAINCLAW_DESIGN_HTML_START,
  KAINCLAW_DESIGN_SLIDERS_END,
  KAINCLAW_DESIGN_SLIDERS_START,
} from "./designPrompt";
import { parseKainClawDesignOutput } from "./slidersExtractor";

function buildRawOutput(slidersJson: string) {
  return [
    KAINCLAW_DESIGN_HTML_START,
    "<!DOCTYPE html>",
    "<html>",
    "<head><style>:root{--color-primary:#111;--spacing-base:16px;--fw-display:300;}</style></head>",
    "<body><main>Hello</main></body>",
    "</html>",
    KAINCLAW_DESIGN_HTML_END,
    KAINCLAW_DESIGN_SLIDERS_START,
    slidersJson,
    KAINCLAW_DESIGN_SLIDERS_END,
  ].join("\n");
}

describe("slidersExtractor", () => {
  it("parses HTML and slider JSON from the structured output", () => {
    const result = parseKainClawDesignOutput(
      buildRawOutput(
        JSON.stringify({
          sliders: [
            { id: "primary", label: "Primary", type: "color", cssVar: "--color-primary", default: "#111111" },
            { id: "spacing", label: "Spacing", type: "range", cssVar: "--spacing-base", default: 16, min: 8, max: 32, unit: "px" },
            { id: "weight", label: "Weight", type: "select", cssVar: "--fw-display", default: "300", options: ["200", "300", "400"] },
          ],
        }),
      ),
    );

    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.sliders).toHaveLength(3);
    expect(result.sliders[1]).toMatchObject({
      id: "spacing",
      type: "range",
      cssVar: "--spacing-base",
    });
  });

  it("throws a clear error when the HTML section is missing", () => {
    expect(() =>
      parseKainClawDesignOutput(
        `${KAINCLAW_DESIGN_SLIDERS_START}{"sliders":[]}${KAINCLAW_DESIGN_SLIDERS_END}`,
      ),
    ).toThrow(/missing the HTML section/i);
  });

  it("throws a clear error when the sliders section is not valid JSON", () => {
    expect(() =>
      parseKainClawDesignOutput(buildRawOutput("not-json")),
    ).toThrow(/sliders section is not valid JSON/i);
  });

  it("rejects sliders that reference css vars missing from :root", () => {
    expect(() =>
      parseKainClawDesignOutput(
        buildRawOutput(
          JSON.stringify({
            sliders: [
              { id: "primary", label: "Primary", type: "color", cssVar: "--missing", default: "#111111" },
              { id: "spacing", label: "Spacing", type: "range", cssVar: "--spacing-base", default: 16, min: 8, max: 32, unit: "px" },
              { id: "weight", label: "Weight", type: "select", cssVar: "--fw-display", default: "300", options: ["200", "300", "400"] },
            ],
          }),
        ),
      ),
    ).toThrow(/references cssVar --missing/i);
  });

  it("accepts range sliders whose numeric fields arrive as strings", () => {
    const result = parseKainClawDesignOutput(
      buildRawOutput(
        JSON.stringify({
          sliders: [
            { id: "primary", label: "Primary", type: "color", cssVar: "--color-primary", default: "#111111" },
            { id: "heroHeight", label: "Hero Height", type: "range", cssVar: "--spacing-base", default: "16", min: "8", max: "32", unit: "px" },
            { id: "weight", label: "Weight", type: "select", cssVar: "--fw-display", default: "300", options: ["200", "300", "400"] },
          ],
        }),
      ),
    );

    expect(result.sliders[1]).toMatchObject({
      id: "heroHeight",
      type: "range",
      default: 16,
      min: 8,
      max: 32,
      unit: "px",
    });
  });

  it("accepts range sliders without a unit for ratio-like values", () => {
    const result = parseKainClawDesignOutput(
      buildRawOutput(
        JSON.stringify({
          sliders: [
            { id: "primary", label: "Primary", type: "color", cssVar: "--color-primary", default: "#111111" },
            { id: "gridOpacity", label: "Grid Opacity", type: "range", cssVar: "--spacing-base", default: "0.12", min: "0", max: "1", unit: "" },
            { id: "weight", label: "Weight", type: "select", cssVar: "--fw-display", default: "300", options: ["200", "300", "400"] },
          ],
        }),
      ),
    );

    expect(result.sliders[1]).toMatchObject({
      id: "gridOpacity",
      type: "range",
      default: 0.12,
      min: 0,
      max: 1,
      unit: "",
    });
  });

  it("rejects outputs with too few sliders", () => {
    expect(() =>
      parseKainClawDesignOutput(
        buildRawOutput(
          JSON.stringify({
            sliders: [
              { id: "primary", label: "Primary", type: "color", cssVar: "--color-primary", default: "#111111" },
            ],
          }),
        ),
      ),
    ).toThrow(/between 3 and 7 sliders/i);
  });
});
