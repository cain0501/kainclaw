## Skill: Dashboard

Operational desktop dashboard. One job: let the user understand system state in under 5 seconds.

## Layout structure (required)

Overall: CSS Grid, 3 named areas — `sidebar`, `topbar`, `main`.

```
[sidebar] [topbar  ]
[sidebar] [main    ]
```

- **Sidebar** — fixed left, 220–260px wide, full viewport height, `position: sticky; top: 0; height: 100vh`. Top: brand mark (wordmark or icon + text). Middle: 6–8 nav links, each with a 20×20px inline SVG icon + label. Active link: `--accent` left border (3px) + tinted background. Bottom: user avatar + name + role (or logout link).
- **Top bar** — `position: sticky; top: 0`. Page title (h1, 20–22px) left. Search input + notification icon + user avatar right. Height 56–64px. Subtle bottom border.
- **Main area** — `overflow-y: auto`. Padding 24–32px. Three rows:
  - Row 1: 3–4 KPI cards side by side (CSS Grid, equal columns). Each card: label (12–14px, muted), big number (36–48px, bold), delta badge (±% or ±abs, green/red).
  - Row 2: primary chart. Full-width OR 2/3 + 1/3 secondary panel. Chart is inline SVG, described below.
  - Row 3: secondary chart (smaller) OR data table (striped rows, sortable-looking headers).

## Charts (inline SVG only — no JS libraries)

All charts are `<svg>` elements embedded directly in HTML.

- **Line chart**: `<polyline>` for data line + `<path>` for area fill with opacity 0.15. Label x-axis with `<text>` in muted color. Label y-axis with `<text>`. Add a `<circle>` at the last data point as a highlight dot in `--accent`.
- **Bar chart**: `<rect>` elements, fill `--accent` for the highlighted bar, fill `--muted`/40% for others. Labels below each bar.
- **Donut / pie**: `<circle>` with `stroke-dasharray` trick. Simple, no animation.
- **Axes**: draw as `<line>` elements with muted stroke. Keep tick marks light.
- Grid lines: dashed, opacity 0.3, never distracting.

Generate plausible data arrays in the SVG coordinates. No "Label A / Value 1" placeholders.

## Color

Define oklch tokens in `:root` before any rule:

```css
:root {
  --bg:         oklch(/* page background, usually dark or very light */);
  --surface:    oklch(/* sidebar + card background */);
  --surface-2:  oklch(/* slightly elevated, topbar */);
  --fg:         oklch(/* primary text */);
  --muted:      oklch(/* labels, axis text */);
  --border:     oklch(/* dividers, card borders */);
  --accent:     oklch(/* brand / highlight color */);
  --accent-fg:  oklch(/* text on accent */);
  --positive:   oklch(/* green delta, upward trend */);
  --negative:   oklch(/* red delta, downward trend */);
}
```

Accent rule: appears in exactly 2 places — sidebar active state + one chart highlight element. Never scatter accent across every card border or heading.

Dense dashboards: tighten spacing (card padding 16px, gap 12px). Airy ones: card padding 24px, gap 20px. Match the brief's tone.

## Content rules

- Generate domain-appropriate metric names and realistic values. For a SaaS dashboard: MRR, Churn Rate, Active Users, NPS. For crypto: portfolio value, 24h P&L, top holdings. For logistics: shipments today, on-time rate, pending orders.
- KPI numbers must look real: "$142,830", "94.2%", "1,847 users" — not "1000" or "99%".
- Delta badges must make directional sense: if MRR is up, show "+$8,420 (6.3%)".
- Table rows: show 5–8 realistic rows. Column headers named after actual domain concepts.
- Nav link labels match the domain — never "Page 1", "Section A".

## Technical

- CSS Grid for top-level layout (`grid-template-columns: 240px 1fr`, `grid-template-rows: 64px 1fr`).
- Flexbox inside cards, nav links, top bar.
- `<aside>` for sidebar, `<header>` for top bar, `<main>` for content, `<section>` for each row.
- Sidebar and top bar sticky; main area scrolls.
- Single HTML file, all CSS in `<style>`, no external files, no JS libraries.
- Inline SVG for all charts. Charts must render without any script execution.
- Viewport meta tag. No mobile breakpoint required (dashboards are desktop-first).

## Anti-slop rules

- No fake placeholder metric names
- No JS charting libraries (Chart.js, D3, etc.) — inline SVG only
- No glassmorphism
- No decorative gradient overlays on cards

## Self-check (all must pass before output)

- [ ] Every color value traces back to an oklch token in `:root`
- [ ] Accent used in exactly 2 places (sidebar active + one chart element)
- [ ] Sidebar and top bar are sticky (not scrolling with content)
- [ ] Most important metric (Row 1 first card) is visually dominant and findable in ≤2 seconds
- [ ] No placeholder metric names or "Value 1" data anywhere
- [ ] All charts are inline SVG with no external JS dependencies

## Output contract

Output a single `<artifact type="text/html">`. One sentence before it, nothing after.

## Seed Template & Reference Assets

Before writing any HTML, use `read_file` to read these files in order:
1. `skills/dashboard/template.html` - copy this as your starting point, replace `[REPLACE]` markers with real content. Do NOT rewrite the CSS framework.
2. `skills/dashboard/layouts.md` - paste-ready section/screen/slide skeletons
3. `skills/dashboard/checklist.md` - run every P0 item before emitting the artifact
