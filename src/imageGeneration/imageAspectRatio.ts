export type ImageAspectRatio = `${number}:${number}`;

export type ImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ASPECT_RATIO_PATTERN = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/;

export function normalizeImageAspectRatio(value: unknown): ImageAspectRatio | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.trim().match(ASPECT_RATIO_PATTERN);
  if (!match) {
    return undefined;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  return `${width}:${height}`;
}

export function getImageAspectRatio(value: ImageAspectRatio): number {
  const [width, height] = value.split(":").map(Number);
  return width / height;
}

export function getCenterCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: ImageAspectRatio,
): ImageCropRect | undefined {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return undefined;
  }

  const targetRatio = getImageAspectRatio(targetAspectRatio);
  const sourceRatio = sourceWidth / sourceHeight;
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    return undefined;
  }

  if (Math.abs(sourceRatio - targetRatio) < 0.0001) {
    return undefined;
  }

  if (sourceRatio > targetRatio) {
    const width = Math.max(1, Math.floor(sourceHeight * targetRatio));
    return {
      x: Math.floor((sourceWidth - width) / 2),
      y: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = Math.max(1, Math.floor(sourceWidth / targetRatio));
  return {
    x: 0,
    y: Math.floor((sourceHeight - height) / 2),
    width: sourceWidth,
    height,
  };
}

export function buildImageAspectRatioInstruction(
  prompt: string,
  aspectRatio: ImageAspectRatio | undefined,
): string {
  const trimmedPrompt = prompt.trim();
  if (!aspectRatio) {
    return trimmedPrompt;
  }

  return `${trimmedPrompt}\n\nUse the full canvas at exactly ${aspectRatio}. Do not preserve a conflicting source-image aspect ratio, add white bars, or leave large blank margins.`;
}
