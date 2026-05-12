## Skill: Mobile App Screen

Single mobile screen or tight 2–3 screen set. One job: show a realistic, touch-ready UI at phone dimensions.

## Viewport and framing

- CSS width: **375px** (iPhone SE / base iPhone size). Height: 812px or natural scroll.
- Center the screen in the browser with a neutral body background if showing device context. The 375px frame IS the design deliverable — not a decorative mockup wrapper.
- `overflow: hidden` on the screen container. Content that scrolls must use `overflow-y: auto` on the scroll region only.
- Viewport meta: `<meta name="viewport" content="width=375, initial-scale=1">`.

## Screen anatomy (required regions)

1. **Status bar** — 20px tall. Show signal bars (3–4 vertical rects), WiFi symbol, battery icon — all as inline SVG or Unicode approximations. Text: carrier name left, time center, battery % right. Background matches nav bar.
2. **Navigation bar** (top) OR **Tab bar** (bottom) — pick one per screen type:
   - Nav bar: 44–56px. Back chevron + title (centered) + right action. iOS-style.
   - Tab bar: 48–56px fixed bottom. 4–5 tabs, icon + label, active tab in `--accent`. Safe-area-inset-bottom aware (add 16–20px extra bottom padding).
3. **Safe area padding**: 16px horizontal on all content regions.
4. **Main content**: fills remaining height. If scrollable, scroll only this region.

## Touch targets

Every tappable element: minimum **44×44px**. This is non-negotiable.
- Buttons: min-height 44px, full-width primary actions preferred.
- List rows: min-height 56px (label + secondary text).
- Icon buttons: wrap in a 44×44px tap area even if the icon is 24px.
- Thumb zone: primary actions (primary CTA, FAB, tab bar) in the bottom 40% of the screen.

## UI patterns

- No hover states. Use `:active` for tap feedback (scale or opacity).
- Lists: horizontal padding 16px, vertical padding 12–14px per row, 1px separator line at muted opacity. Show chevron (›) for drill-down rows.
- Cards: 16px horizontal margin, 12px border-radius, subtle shadow or border.
- Forms: full-width inputs, 44px height, 16px padding, floating or stacked labels. No tiny inline labels.
- FAB (Floating Action Button): 56px circle, `--accent` fill, fixed bottom-right, 16px from edge.

## Typography

- Use `system-ui, -apple-system` as base OR a Google Font that matches the app brand. Never decorative display fonts in UI chrome.
- Title / nav bar title: 17px, weight 600
- Body / list primary: 15–17px, weight 400, line-height 1.4
- Secondary / caption: 13–14px, `--muted` color
- Label / badge: 11–12px, weight 600, all-caps optional

## Color (oklch tokens)

```css
:root {
  --bg:        oklch(/* screen background */);
  --surface:   oklch(/* card / input background */);
  --fg:        oklch(/* primary text */);
  --muted:     oklch(/* secondary text, icons */);
  --border:    oklch(/* separators */);
  --accent:    oklch(/* active tab, primary button, FAB */);
  --accent-fg: oklch(/* text/icon on accent */);
  --danger:    oklch(/* destructive actions */);
}
```

## Content rules

- Show **realistic app content** from the brief. No "Item 1", "User Name", "Description here".
- List screens: 4–6 items with real-looking names, metadata, and secondary values.
- Detail screens: fill all fields with domain-appropriate data.
- If it's a social app: real-looking usernames, post snippets, like counts.
- If it's a commerce app: product names, prices, ratings.
- Empty states must have a real message and a real CTA, not "No items".

## Technical

- Single HTML file, all CSS in `<style>`. No external CSS.
- 375px fixed width, centered on page. Body background a neutral contrast color.
- Inline SVG for status bar icons and nav icons. Unicode fallback acceptable for simple symbols.
- Minimal CSS transitions for feel (`transition: opacity 0.15s`) — optional. No JS animations.
- No JS unless the brief requires screen switching. If needed: minimal inline JS with CSS class toggling only.
- `box-sizing: border-box` globally.

## Anti-slop rules

- No desktop-only hover-dependent interactions
- No cards that look like blog post cards on a website
- No fake "iPhone frame" PNG wrapper — the content IS the design
- No decorative gradient mesh backgrounds
- No emoji used as navigation icons

## Self-check (all must pass before output)

- [ ] Screen container is exactly 375px wide
- [ ] All interactive elements are ≥44×44px tap targets
- [ ] Content is realistic and domain-specific (no placeholders)
- [ ] Tab bar OR explicit nav pattern is present — not "three random links in a div"
- [ ] No hover-only interactions (`:active` used instead)
- [ ] Status bar (signal/wifi/battery) is present at the top

## Output contract

Output a single `<artifact type="text/html">`. One sentence before it, nothing after.
