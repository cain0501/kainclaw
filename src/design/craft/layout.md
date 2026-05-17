# Layout Rules

## Spacing

- Use 8px base unit. All spacing values must be multiples of 4px (4, 8, 12, 16, 24, 32, 48, 64).
- Section padding: minimum 48px vertical, 24px horizontal.
- Card internal padding: 16-24px.

## Grid

- Content max-width: 1200px for desktop, 760px for editorial/reading.
- Always center content horizontally with auto margins.
- Prefer CSS Grid for 2D layouts, Flexbox for 1D.

## Hierarchy

- Maximum 3 levels of visual hierarchy per section.
- Each section has one dominant element (hero image, headline, or data point).
- Never compete: if two elements fight for attention, remove one.

## Forbidden Patterns

- No more than 4 columns on mobile.
- No horizontal scroll on the main content area.
- No fixed pixel heights on text containers (use min-height or auto).
