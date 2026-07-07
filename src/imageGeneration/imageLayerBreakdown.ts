export type ImageLayerBreakdownPrompt = {
  displayPrompt: string;
  executionPrompt: string;
};

const DEFAULT_USER_INTENT = "analyze this image for Midtai design editing";

function normalizeUserIntent(userIntent?: string): string {
  const trimmed = userIntent?.trim();
  return trimmed || DEFAULT_USER_INTENT;
}

export function buildImageLayerBreakdownPrompt(
  userIntent?: string,
): ImageLayerBreakdownPrompt {
  const intent = normalizeUserIntent(userIntent);
  const displayPrompt = [
    "Smart layer breakdown for Midtai.",
    `User intent: ${intent}`,
    "Create a clean visual breakdown of the reference image into editable regions: subject, background, text, product/object details, lighting/shadow, and decorative accents.",
    "Show numbered callouts and concise labels directly in the image so the next edit can target a specific region.",
  ].join("\n");

  const executionPrompt = [
    displayPrompt,
    "Return one polished analysis board as an image, not a PSD and not separate transparent layers.",
    "Preserve the source image content clearly, add subtle overlays/callouts, and avoid changing the underlying design more than needed for explanation.",
    "Include practical local-edit notes such as remove, replace, recolor, relight, extend, or regenerate where appropriate.",
  ].join("\n");

  return {
    displayPrompt,
    executionPrompt,
  };
}
