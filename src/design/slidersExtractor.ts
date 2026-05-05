import {
  KAINCLAW_DESIGN_HTML_END,
  KAINCLAW_DESIGN_HTML_START,
  KAINCLAW_DESIGN_SLIDERS_END,
  KAINCLAW_DESIGN_SLIDERS_START,
} from "./designPrompt";

export type DesignSlider =
  | {
      id: string;
      label: string;
      type: "color";
      cssVar: string;
      default: string;
    }
  | {
      id: string;
      label: string;
      type: "range";
      cssVar: string;
      default: number;
      min: number;
      max: number;
      unit: string;
    }
  | {
      id: string;
      label: string;
      type: "select";
      cssVar: string;
      default: string;
      options: string[];
    };

export type ParsedDesignOutput = {
  html: string;
  sliders: DesignSlider[];
};

function getDelimitedSection(
  raw: string,
  startMarker: string,
  endMarker: string,
  label: string,
): string {
  const startIndex = raw.indexOf(startMarker);
  const endIndex = raw.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`KainClaw Design output is missing the ${label} section.`);
  }

  return raw.slice(startIndex + startMarker.length, endIndex).trim();
}

function cleanJsonPayload(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function extractDefinedCssVars(html: string): Set<string> {
  const defined = new Set<string>();
  const rootMatch = html.match(/:root\s*\{([\s\S]*?)\}/i);
  const source = rootMatch?.[1] ?? html;

  for (const match of source.matchAll(/(--[a-zA-Z0-9-_]+)\s*:/g)) {
    defined.add(match[1]!);
  }

  return defined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseSlider(
  value: unknown,
  index: number,
  definedCssVars: Set<string>,
): DesignSlider {
  if (!isRecord(value)) {
    throw new Error(`Slider ${index + 1} is not an object.`);
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const type = value.type;
  const cssVar = typeof value.cssVar === "string" ? value.cssVar.trim() : "";

  if (!id || !label || !cssVar) {
    throw new Error(`Slider ${index + 1} is missing id, label, or cssVar.`);
  }

  if (!definedCssVars.has(cssVar)) {
    throw new Error(`Slider ${id} references cssVar ${cssVar}, but it is not defined in :root.`);
  }

  if (type === "color") {
    const defaultValue =
      typeof value.default === "string" ? value.default.trim() : "";
    if (!defaultValue) {
      throw new Error(`Color slider ${id} is missing a default value.`);
    }
    return {
      id,
      label,
      type: "color",
      cssVar,
      default: defaultValue,
    };
  }

  if (type === "range") {
    const parsedDefaultValue = typeof value.default === "number"
      ? value.default
      : typeof value.default === "string" && value.default.trim() && !Number.isNaN(Number(value.default))
        ? Number(value.default)
        : null;
    const parsedMinValue = typeof value.min === "number"
      ? value.min
      : typeof value.min === "string" && value.min.trim() && !Number.isNaN(Number(value.min))
        ? Number(value.min)
        : null;
    const parsedMaxValue = typeof value.max === "number"
      ? value.max
      : typeof value.max === "string" && value.max.trim() && !Number.isNaN(Number(value.max))
        ? Number(value.max)
        : null;
    const minValue = parsedMinValue ?? 0;
    const maxValue = parsedMaxValue ?? 100;
    const unitValue = typeof value.unit === "string" ? value.unit.trim() : "";
    const defaultValue = parsedDefaultValue ?? minValue;
    const normalizedMin = Math.min(minValue, maxValue);
    const normalizedMax = Math.max(minValue, maxValue);
    const normalizedDefault = Math.min(normalizedMax, Math.max(normalizedMin, defaultValue));

    return {
      id,
      label,
      type: "range",
      cssVar,
      default: normalizedDefault,
      min: normalizedMin,
      max: normalizedMax,
      unit: unitValue,
    };
  }

  if (type === "select") {
    const defaultValue =
      typeof value.default === "string" ? value.default.trim() : "";
    const options =
      Array.isArray(value.options)
        ? value.options
            .filter((entry): entry is string => typeof entry === "string")
            .map(entry => entry.trim())
            .filter(Boolean)
        : [];
    if (!defaultValue || options.length === 0) {
      throw new Error(`Select slider ${id} is missing default or options.`);
    }
    return {
      id,
      label,
      type: "select",
      cssVar,
      default: defaultValue,
      options,
    };
  }

  throw new Error(`Slider ${id || index + 1} has unsupported type: ${String(type)}.`);
}

export function parseKainClawDesignOutput(rawText: string): ParsedDesignOutput {
  const html = getDelimitedSection(
    rawText,
    KAINCLAW_DESIGN_HTML_START,
    KAINCLAW_DESIGN_HTML_END,
    "HTML",
  );
  if (!html.startsWith("<!DOCTYPE html>")) {
    throw new Error("KainClaw Design HTML section must start with <!DOCTYPE html>.");
  }

  const slidersSection = getDelimitedSection(
    rawText,
    KAINCLAW_DESIGN_SLIDERS_START,
    KAINCLAW_DESIGN_SLIDERS_END,
    "sliders",
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJsonPayload(slidersSection)) as Record<string, unknown>;
  } catch {
    throw new Error("KainClaw Design sliders section is not valid JSON.");
  }

  if (!Array.isArray(parsed.sliders)) {
    throw new Error('KainClaw Design sliders JSON must contain a "sliders" array.');
  }

  if (parsed.sliders.length < 3 || parsed.sliders.length > 7) {
    throw new Error("KainClaw Design must return between 3 and 7 sliders.");
  }

  const definedCssVars = extractDefinedCssVars(html);
  const sliders = parsed.sliders.map((slider, index) =>
    parseSlider(slider, index, definedCssVars),
  );

  return {
    html,
    sliders,
  };
}
