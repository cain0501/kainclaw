# Color Rules

## OKLch usage
- Always define palette in OKLch in :root — never raw hex in component styles.
- Minimum 6 tokens: bg, surface, fg, muted, border, accent.
- Contrast: fg on bg ≥ 7:1 (WCAG AA+). muted on bg ≥ 4.5:1.

## Accent discipline
- One accent color per design. Used for primary CTA and key data only.
- Accent appears at most 3 times in a single view.
- Never use accent as a background fill for large areas.
- **Exception: if a Brand Design System or Direction Spec is provided above, its color palette overrides these accent rules entirely. Apply the specified colors as instructed.**

## Forbidden patterns
- No blue/purple gradients (see anti-ai-slop.md).
- No more than 12 raw hex values outside :root.
- No semi-transparent overlays stacked more than 2 levels deep.
