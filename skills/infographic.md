## Skill: Infographic

Data-driven visual story. One job: make one non-obvious insight impossible to miss.

## Before writing HTML

1. **Identify the one insight** — write it as a sentence: "销售额在 Q3 增长 230%，主要来自华东区". Everything else is supporting evidence.
2. **Choose a format** from the four options below based on the brief.
3. **Fix the canvas size** — infographics have fixed dimensions, not fluid layouts.

## Four formats (pick one)

**Timeline** — events or milestones in chronological order
- Canvas: 800px wide × auto height (minimum 600px)
- Spine: vertical or horizontal line, `2px solid var(--border)`
- Each node: icon/year label + headline + 1–2 sentence detail
- Maximum 8 nodes

**Comparison** — side-by-side contrast between 2–4 entities
- Canvas: 900px wide × auto height
- Equal-width columns, one per entity
- Rows = attributes. Use visual encoding (bar, color fill %, icon count) not just text
- Header row: entity name + defining characteristic

**Process / Flow** — steps, stages, or a system diagram
- Canvas: 1000px wide × auto height
- Left-to-right or top-to-bottom flow
- Each step: numbered circle + label + optional sub-detail
- Connector: SVG `<line>` or CSS border, `var(--muted)` color
- Maximum 7 steps

**Proportion / Stats** — key numbers, ratios, or rankings
- Canvas: 800px wide × auto height
- Hero stat: 72–96px, weight 800, centered, `var(--accent)` only for the ONE most important number
- Supporting stats: 36–48px
- Each stat must have a label and a source line (even if invented)

## Visualization rules

- All charts and diagrams: inline SVG only. No Canvas API, no Chart.js, no D3.
- Bar chart: `<rect>` elements, height proportional to value
- Line/area chart: `<polyline>` with `fill="none"` (line) or `<polygon>` with low opacity (area)
- Donut/pie: `<circle>` with `stroke-dasharray` technique
- All SVG charts must have axis labels or value labels directly on the shapes
- Minimum bar width: 32px. Minimum label font-size: 11px inside SVG.

## Color tokens

```css
:root {
  --bg:      oklch(/* page background */);
  --surface: oklch(/* card / section background */);
  --fg:      oklch(/* primary text */);
  --muted:   oklch(/* secondary text, labels, source lines */);
  --border:  oklch(/* dividers, axis lines */);
  --accent:  oklch(/* one key data point or the main insight number */);
  /* chart series colors if needed: */
  --data-1:  oklch(/* primary series */);
  --data-2:  oklch(/* secondary series */);
}
```

Accent appears on at most ONE data point — the central insight. All other data uses `--data-1` / `--data-2` or `--muted`.

## Typography

- Main headline (the insight): 24–32px, weight 700
- Section labels: 13–14px, weight 600, letter-spacing 0.06em, `var(--muted)`, uppercase optional
- Data labels / callouts: 12–14px
- Source / footnote: 11px, `var(--muted)`

## Content rules

- Every number must be specific: "47%" not "nearly half"; "¥2.3亿" not "很多钱"
- Invent plausible data if none is provided — but make it internally consistent (percentages must sum correctly, timelines must be chronologically valid)
- Every chart must have a title
- Source line required on every chart: "来源：[机构名] [年份]" — invent a plausible source

## Self-check

- [ ] One central insight is dominant and stated as text
- [ ] Format chosen matches the story type (timeline / comparison / process / proportion)
- [ ] Canvas width fixed (800–1000px)
- [ ] All charts are inline SVG with axis/value labels
- [ ] Accent used on at most one data element
- [ ] Every number is specific, not vague
- [ ] Source lines present on all charts
- [ ] oklch color tokens defined before any CSS color values
