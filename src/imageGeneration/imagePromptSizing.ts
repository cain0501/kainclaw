export type RequestedImageSize = {
  size: string;
  source: "dimensions" | "ratio";
};

const DIMENSION_PATTERN = /\b(\d{3,4})\s*[x×*]\s*(\d{3,4})\b/i;
const RATIO_PATTERN = /\b(\d{1,2})\s*[:：/]\s*(\d{1,2})\b/;

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function sizeFromRatio(widthRatio: number, heightRatio: number): string {
  const ratio = widthRatio / heightRatio;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "1024x1024";
  }

  if (Math.abs(ratio - 1) < 0.08) {
    return "1024x1024";
  }

  if (ratio > 1) {
    const width = 1536;
    const height = roundToMultiple(width / ratio, 64);
    return `${width}x${height}`;
  }

  const height = 1536;
  const width = roundToMultiple(height * ratio, 64);
  return `${width}x${height}`;
}

export function resolveRequestedImageSize(prompt: string): RequestedImageSize | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return null;
  }

  const dimensionMatch = trimmedPrompt.match(DIMENSION_PATTERN);
  if (dimensionMatch) {
    const width = Number(dimensionMatch[1]);
    const height = Number(dimensionMatch[2]);
    if (width > 0 && height > 0) {
      return {
        size: `${width}x${height}`,
        source: "dimensions",
      };
    }
  }

  const ratioMatch = trimmedPrompt.match(RATIO_PATTERN);
  if (ratioMatch) {
    const widthRatio = Number(ratioMatch[1]);
    const heightRatio = Number(ratioMatch[2]);
    if (widthRatio > 0 && heightRatio > 0) {
      return {
        size: sizeFromRatio(widthRatio, heightRatio),
        source: "ratio",
      };
    }
  }

  return null;
}
