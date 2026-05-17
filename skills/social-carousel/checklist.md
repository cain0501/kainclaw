# Social Carousel Checklist

## P0 - Must pass before emitting

- [ ] At least 5 slides present
- [ ] First slide is a cover with headline plus brand and no body copy
- [ ] Last slide has a CTA
- [ ] Every slide has a slide number indicator
- [ ] All slides use the same font, palette, and margin grid
- [ ] All palette tokens defined in `:root` using `oklch()`
- [ ] No raw hex in component styles
- [ ] Slide aspect ratio is 1:1
- [ ] `<!DOCTYPE html>` is the first line

## P1 - Should pass for production quality

- [ ] Cover slide has brand or account name
- [ ] No `[REPLACE: ...]` placeholders in final output
- [ ] Dots count matches slide count
- [ ] Body copy is at most 3 sentences per slide
