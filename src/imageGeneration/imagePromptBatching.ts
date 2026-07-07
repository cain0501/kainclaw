export type ResolvedImageBatchPlan = {
  batchCount: number;
  executionPrompt: string;
  promptDerivedBatchCount: number | null;
  collageRequested: boolean;
};

const COLLAGE_PATTERNS = [
  /拼(?:成|在)?一张/i,
  /拼图|拼贴|拼版|联图|组图|九宫格|多宫格|分屏|三联画|四联画/i,
  /contact\s*sheet|collage|triptych|diptych|split[\s-]*screen|moodboard/i,
];

const CHINESE_BATCH_PATTERNS = [
  /(?:请|帮我|麻烦)?\s*(?:批量|分别|各自|一共|总共|共)?\s*(?:生成|做出|给我|帮我生成|帮我做|来|创建)?\s*([2-8])\s*张(?:独立|不同|单独)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
  /(?:请|帮我|麻烦)?\s*(?:批量|分别|各自|一共|总共|共)?\s*(?:生成|做出|给我|帮我生成|帮我做|来|创建)?\s*(两|二|三|四|五|六|七|八)\s*张(?:独立|不同|单独)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
  /(?:做成|做出|做|来)([2-8])\s*张(?:独立|不同|单独)?(?:构图|版本|方案)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
  /(?:做成|做出|做|来)(两|二|三|四|五|六|七|八)\s*张(?:独立|不同|单独)?(?:构图|版本|方案)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
  /(?:要|给我)([2-8])\s*张(?:独立|不同|单独)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
  /(?:要|给我)(两|二|三|四|五|六|七|八)\s*张(?:独立|不同|单独)?(?:的)?(?:图片|图像|照片|海报|壁纸|插画)?/i,
];

const ENGLISH_BATCH_PATTERNS = [
  /\b(?:generate|make|create|render)\s*([2-8])\s*(?:separate|independent|different)?\s*(?:images|pictures|pics|renders|variations)\b/i,
];

const BATCH_OUTPUT_GUARD = [
  "每个输出结果都必须是一张独立完整的单图。",
  "不要把多张画面拼在同一张图里，不要做拼图、分屏、联图、九宫格、contact sheet 或 collage。",
].join("");

function clampBatchCount(value: number): number {
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function parseChineseCount(token: string): number | null {
  const normalized = token.trim();
  switch (normalized) {
    case "两":
    case "二":
      return 2;
    case "三":
      return 3;
    case "四":
      return 4;
    case "五":
      return 5;
    case "六":
      return 6;
    case "七":
      return 7;
    case "八":
      return 8;
    default:
      return null;
  }
}

function trimPromptSeparators(prompt: string): string {
  return prompt
    .replace(/^[\s,，。、：；！？]+/, "")
    .replace(/[\s,，。、：；！？]+$/, "")
    .trim();
}

function normalizePromptAfterBatchStrip(prompt: string): string {
  return trimPromptSeparators(
    prompt.replace(/^(?:请|帮我|麻烦|做成|做出|做|来|生成|给我|帮我生成|帮我做|要)\s*/i, ""),
  );
}

function hasCollageIntent(prompt: string): boolean {
  return COLLAGE_PATTERNS.some(pattern => pattern.test(prompt));
}

function parsePromptDerivedBatchCount(prompt: string): {
  batchCount: number;
  matchedText: string;
} | null {
  for (const pattern of CHINESE_BATCH_PATTERNS) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const token = match[1] ?? "";
    const batchCount = /^\d+$/.test(token)
      ? Number(token)
      : parseChineseCount(token);
    if (batchCount && batchCount > 1) {
      return {
        batchCount: clampBatchCount(batchCount),
        matchedText: match[0],
      };
    }
  }

  for (const pattern of ENGLISH_BATCH_PATTERNS) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const batchCount = Number(match[1] ?? "0");
    if (batchCount > 1) {
      return {
        batchCount: clampBatchCount(batchCount),
        matchedText: match[0],
      };
    }
  }

  return null;
}

export function resolveImageBatchPlan(options: {
  prompt: string;
  defaultBatchCount?: number;
  overrideBatchCount?: number;
}): ResolvedImageBatchPlan {
  const trimmedPrompt = options.prompt.trim();
  const collageRequested = hasCollageIntent(trimmedPrompt);
  const promptDerivedBatch = collageRequested
    ? null
    : parsePromptDerivedBatchCount(trimmedPrompt);
  const batchCount = clampBatchCount(
    options.overrideBatchCount
      ?? promptDerivedBatch?.batchCount
      ?? options.defaultBatchCount
      ?? 1,
  );

  const strippedPrompt = promptDerivedBatch
    ? normalizePromptAfterBatchStrip(trimmedPrompt.replace(promptDerivedBatch.matchedText, " "))
    : trimmedPrompt;
  const basePrompt = strippedPrompt || trimmedPrompt;
  const executionPrompt = batchCount > 1 && !collageRequested
    ? `${basePrompt}\n\n${BATCH_OUTPUT_GUARD}`
    : basePrompt;

  return {
    batchCount,
    executionPrompt,
    promptDerivedBatchCount: promptDerivedBatch?.batchCount ?? null,
    collageRequested,
  };
}
