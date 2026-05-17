## Skill: Pricing Page

Conversion-led pricing comparison. One job: make the right plan obvious and the purchase frictionless.

## Section order (required, top to bottom)

1. **Nav** — minimal: logo left, maybe 2–3 links, one ghost CTA right. No mega-menu.
2. **Pricing header** — short headline (what you get, not "Our Plans"). Optional 2-sentence pitch. Toggle switch if monthly/annual billing applies — annual pre-selected, show savings percentage on the label.
3. **Plan grid** — 2–4 columns, one per plan. Each column: plan name + price (large, dominant) + billing cadence + 1-sentence positioning line + feature list + CTA button. The recommended plan gets: `border: 2px solid var(--accent)`, a "Most Popular" or "Recommended" badge, and its CTA button uses accent fill. All other CTAs use outline style.
4. **Feature comparison table** — collapsible or always-visible matrix. Rows = features, columns = plans. Use ✓ / — / specific values. Group rows under category headers. This section answers "what exactly do I get."
5. **FAQ** — 4–6 accordion items. Cover: cancellation, billing cycles, team seats, what happens after trial. Real questions, not generic ones.
6. **Final CTA band** — narrow, accent background. "Start free" or equivalent + supporting line. One button.
7. **Footer** — minimal.

## Plan column anatomy (required for every plan)

```
Plan Name               ← bold, 18–20px
¥199 / 月               ← price: 36–48px, font-weight 700, var(--fg)
按年计费，节省 20%        ← billing note: 12px, var(--muted)
─────────────────
最适合: [one-line pitch]
─────────────────
✓ Feature one
✓ Feature two
— Feature not included   ← "—" in var(--muted), line visually dimmed
[CTA Button]
```

## Color tokens (define in :root before writing any CSS)

```css
:root {
  --bg:       oklch(/* page bg */);
  --surface:  oklch(/* card bg */);
  --fg:       oklch(/* primary text */);
  --muted:    oklch(/* secondary text */);
  --border:   oklch(/* default card border */);
  --accent:   oklch(/* recommended plan border + badge + filled CTA */);
  --accent-fg: oklch(/* text on accent fill */);
}
```

Accent appears in exactly 3 places: recommended plan border, badge background, and one filled CTA button. Nowhere else.

## Typography

- Price number: 36–48px, weight 700, `var(--fg)` (not accent — price is neutral, plan selection drives conversion)
- Plan name: 18–20px, weight 600
- Feature list: 14px, weight 400, line-height 1.8
- CTA button: 15–16px, weight 600, padding 12px 24px minimum

## Content rules

- Plan names must be meaningful: "Starter / Growth / Enterprise" not "Basic / Pro / Premium"
- Price must include currency and cadence: "¥199/月" not just "199"
- Features must be specific: "最多 5 个项目" not "多项目支持"; "无限存储" not "更多存储"
- FAQ answers must be complete sentences that actually answer the question
- Never use placeholder copy: no "Lorem ipsum", no "Feature A", no "Coming soon" for all items

## Self-check

- [ ] Recommended plan is unmistakable at first glance (border + badge + filled CTA)
- [ ] Every plan has price, billing cadence, positioning line, feature list, and CTA
- [ ] Feature comparison table exists with real feature names
- [ ] FAQ has at least 4 items with real answers
- [ ] Accent appears exactly 3 times total
- [ ] oklch color tokens defined before any CSS color values
- [ ] No placeholder copy anywhere
