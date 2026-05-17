# Pricing Page Checklist

## P0 - Must pass before emitting

- [ ] At least 3 tier cards present
- [ ] One tier is visually marked as recommended (border, badge, or background)
- [ ] Every tier has: name, price, feature list, CTA button
- [ ] CTA buttons use `.tier-cta` class (not bare `<a>` or `<button>`)
- [ ] At least 3 FAQ items present
- [ ] All palette tokens defined in `:root` using `oklch()`
- [ ] No raw hex colors in component styles
- [ ] `<!DOCTYPE html>` is the first line

## P1 - Should pass for production quality

- [ ] Recommended tier CTA is visually distinct from others
- [ ] Feature list uses check and cross marks, not vague text
- [ ] Mobile layout does not break at 375px
- [ ] No `[REPLACE: ...]` placeholders in final output
- [ ] Billing period stated on every price
