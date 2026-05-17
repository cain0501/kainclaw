## Skill: Social Carousel

3–6 panel social media carousel. One job: one coherent visual series where each panel works alone but the sequence is stronger.

## Before writing HTML

1. **State the narrative arc** in one sentence: "从痛点 → 方案 → 结果" or "数据背景 → 核心洞察 → 行动建议". Write this as an HTML comment.
2. **Count the panels**: minimum 3, maximum 6. The first is always the hook; the last is always the CTA.
3. **Fix the canvas**: each panel is exactly 1080×1080px. All panels share one `<style>` block.

## Panel structure (required)

| Panel | Role | Rules |
|-------|------|-------|
| Panel 1 (hook) | Make the swipe happen | Oversized headline or provocative stat. No body copy. Strong visual contrast. |
| Panels 2–N-1 (content) | Deliver the value | One idea per panel. Max 40 words per panel. |
| Panel N (CTA) | Convert | One action: follow / save / DM / link in bio. Brand name visible. |

## Layout options per panel (pick one per panel, vary across the series)

**Type-dominant** — text fills 70%+ of the panel
- Headline: 60–96px, weight 800
- Subline: 18–22px, weight 400

**Split** — left/right or top/bottom halves
- Hard color boundary between zones
- Text in one zone, visual/stat in the other

**Stat callout** — one large number is the hero
- Number: 80–120px, weight 800, `var(--accent)` or inverted background
- Label below: 16–18px

**List** — 3–5 short items
- Each item: icon/bullet + 1 line of text
- Items must be parallel in structure (all nouns, or all verb phrases)
- Max 8 words per item

## Shared visual system (required)

All panels MUST share:
- Identical color tokens — define once in `:root`
- Identical font stack — define once
- A consistent position element (brand logo OR a rule OR a corner label) that appears in the same spot on every panel
- Panel number indicator: `01 / 05` style, 12px, `var(--muted)`, same corner on all panels

## Layout implementation

```html
<!-- All panels side by side, horizontal scroll or stacked for preview -->
<div class="carousel">
  <div class="panel" data-panel="1">...</div>
  <div class="panel" data-panel="2">...</div>
  ...
</div>
```

```css
.panel {
  width: 1080px;
  height: 1080px;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}
.carousel {
  display: flex;
  gap: 16px;
  overflow-x: auto;
}
```

## Color tokens

```css
:root {
  --bg:      oklch(/* panel background — used as default */);
  --surface: oklch(/* secondary zone color */);
  --fg:      oklch(/* primary text */);
  --muted:   oklch(/* secondary text, panel numbers */);
  --accent:  oklch(/* key stat, CTA button, or one recurring highlight */);
  --accent-fg: oklch(/* text on accent */);
}
```

Individual panels may invert (swap `--bg` and `--fg`) for visual variety, but the accent color stays constant across all panels.

## Text safety margin

All text must stay inside a 64px inset from each edge (`padding: 64px` or equivalent positioning). No text bleeds to the edge.

## Content rules

- Panel 1 headline: max 8 words, must create curiosity or state a problem
- No bullet point lists in panel 1 (hook first, structure later)
- No "Item 1 / Item 2" placeholders — all copy must be real
- CTA panel must name one specific action, not "了解更多"

## Self-check

- [ ] Narrative arc stated in HTML comment
- [ ] Panel 1 is a hook (no body copy, high contrast)
- [ ] Last panel has one specific CTA
- [ ] Each content panel has max 40 words
- [ ] Consistent position element on all panels (logo / rule / corner label)
- [ ] Panel number indicator present on all panels
- [ ] All text inside 64px safety margin
- [ ] Accent used consistently across panels (not different colors per panel)
- [ ] oklch color tokens defined before any CSS color values
