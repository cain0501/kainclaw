## Skill: Magazine / Poster

Editorial print-first composition. One job: one dominant visual idea that rewards both distant viewing and close reading.

## Before writing HTML

1. **Identify the emotional center** — it is exactly one of: a headline, a statistic, or an image treatment. Everything else is subordinate.
2. **Choose a format** — pick ONE canvas size.
3. **Choose a layout archetype** — pick ONE from below.

## Canvas sizes (fix in CSS, not responsive)

| Format | Width × Height | Use for |
|--------|---------------|---------|
| A4 portrait | 794px × 1123px | reports, editorial covers, print |
| 16:9 landscape | 1280px × 720px | presentation cover, digital banner |
| Square social | 1080px × 1080px | Instagram, WeChat moments |
| 4:5 social | 1080px × 1350px | Instagram portrait, Red |

Fix size: `width: Xpx; height: Ypx; overflow: hidden;` on the root container. No `min-height`, no fluid sizing.

## Layout archetypes (pick one)

**Full-bleed type** — typography IS the design. Oversized headline fills 60–80% of the canvas. Minimal or no imagery.
- Headline: 80–140px, weight 800–900
- Supporting line: 16–20px, weight 400
- Color: maximum 2 colors from palette

**Split** — canvas divided into exactly 2 zones: one image/color block, one text block.
- Ratio options: 50/50, 60/40, or 40/60
- Hard edge between zones (no feathering, no gradient blend)
- Text zone: left-aligned or right-aligned, not centered

**Poster grid** — structured column grid with editorial furniture (rules, labels, folios).
- 4–6 columns, explicit column gutters
- Horizontal rules as section dividers
- Small labels ("Vol. 3", "特辑", page numbers) as typographic furniture

**Full-bleed image** — entire canvas is a background image (use `background: var(--surface)` as placeholder) with text overlaid.
- Text must be legible: use a dark overlay `oklch(0% 0 0 / 55%)` or place text on a solid strip
- Avoid white text on light areas — pick text position deliberately

## Typography rules

- Maximum 3 type sizes in total
- Headline: dominant — at least 2× the size of the next level
- Body / supporting copy: maximum 40 words total (this is a poster, not an article)
- No centered body copy longer than 2 lines
- Letter-spacing for short uppercase labels: 0.08–0.15em

## Color tokens

```css
:root {
  --bg:      oklch(/* canvas background */);
  --surface: oklch(/* secondary zone or image placeholder */);
  --fg:      oklch(/* primary text */);
  --muted:   oklch(/* secondary text, rules, labels */);
  --accent:  oklch(/* ONE emphasis color — a word, a rule, a background zone */);
}
```

Accent appears in exactly ONE location. If two colors feel necessary, make one a tint of the other (`var(--accent)` at 20% opacity), not a second hue.

## Typographic furniture (required for magazine/editorial formats)

Include at least one of:
- Publication name or edition label (top-left or top-right, 11–12px)
- Horizontal rule (`1–2px solid var(--muted)`)
- Pull quote set apart from body with size or weight contrast
- Folio / page number

## Content rules

- Headline must be a real statement: "设计的边界" not "标题文字"; "2024 年中国新消费报告" not "报告标题"
- Every text element must carry real copy — no placeholder strings
- Total word count: keep under 80 words for poster; under 150 for magazine cover

## Self-check

- [ ] Canvas size fixed in CSS (one of the four formats)
- [ ] One dominant element is unmistakable at thumbnail size
- [ ] Layout archetype chosen and applied consistently
- [ ] Maximum 3 type sizes used
- [ ] Accent appears exactly once
- [ ] Total body copy under 80 words (poster) or 150 words (magazine)
- [ ] At least one piece of typographic furniture present
- [ ] No placeholder text anywhere
- [ ] oklch color tokens defined before any CSS color values
