## Skill: Email Template

HTML email. One job: land one message, drive one action, survive inbox rendering.

## Column and page structure

- Email column: **600–680px** centered. `max-width: 640px; margin: 0 auto`.
- Page (body) background: a clearly different color from the email column background. The email must read as "an email sitting on a page" — not a white rectangle on a white page.
- Email wrapper: a `<table>` OR a centered `<div>` at 640px. Both are acceptable; use `<div>` for cleaner code since this is an HTML preview, not a sent email.
- No multi-column layout in the main body. Single column only. Exception: a 2×2 feature callout grid (two columns, two rows) is acceptable as one section.

## Section order (required)

1. **Header / masthead** — wordmark (text-based or inline SVG) left or centered. 2–3 nav-style links right or below. Background may match `--accent` or `--surface`. Height 60–80px.
2. **Hero block** — full-width within the column. Either: a styled headline lockup (large type, colored background) OR a product image placeholder as an inline SVG shape or CSS gradient rectangle (no external `<img src>`). Hero headline 36–52px.
3. **Body copy** — 2–3 short paragraphs. Max 3 sentences each. Line-height 1.65. This is the email's persuasion layer — write real copy from the brief.
4. **Primary CTA** — ONE button only. Full-width or centered. `--accent` background, `--accent-fg` text. Button text is an action: "Shop the collection", "Start your trial", "Download the report" — never "Click here" or "Learn more".
5. **Feature grid (optional)** — 2×2 grid of callout blocks. Each block: small icon (inline SVG or Unicode) + bold label + 1-sentence description.
6. **Footer** — mailing address, legal text (tiny), unsubscribe link (required), social links (text or SVG). Font-size 11–12px, `--muted` color.

## Color (oklch tokens)

```css
:root {
  --page-bg:    oklch(/* body background — must contrast with email bg */);
  --email-bg:   oklch(/* email column background */);
  --surface:    oklch(/* card / callout section background */);
  --fg:         oklch(/* body text */);
  --muted:      oklch(/* footer text, captions */);
  --border:     oklch(/* dividers */);
  --accent:     oklch(/* CTA button + one headline word */);
  --accent-fg:  oklch(/* text on accent */);
}
```

`--page-bg` and `--email-bg` must have visible contrast. A typical pair: `--page-bg: oklch(92% 0.01 260)` (light gray-blue) and `--email-bg: oklch(99% 0 0)` (near-white). Or reverse for dark emails.

Accent uses: CTA button background + optionally one emphasized word in the hero headline. Max 2 accent uses total.

## Typography

- Hero headline: 36–52px, weight 700–800, tight tracking. Pick a Google Font OR web-safe serif/sans that matches the brand. Always include a web-safe fallback stack: `"Playfair Display", Georgia, serif` or `"DM Sans", Arial, sans-serif`.
- Body copy: 16–18px, `system-ui, Arial, sans-serif`, line-height 1.65.
- Footer: 11–12px, `--muted`.
- CTA button: 16–18px, font-weight 600, letter-spacing 0.02em.

If using a Google Font, load it with `<link>` AND include a web-safe fallback. Example: `font-family: 'DM Sans', Arial, sans-serif`.

## Content rules

- Write a **real subject line** at the very top of the email as a small preheader text div (12px, muted): `Preview text: [one-sentence hook]`.
- Hero headline: specific benefit or news, not a vague brand line.
- Body copy: write from the brief. No lorem ipsum. Max 3 paragraphs, each ≤3 sentences.
- CTA text: action verb + object. "Shop the summer collection", "Claim your 30% discount", "Read the full report".
- Footer address: invent a plausible company address. Include "Unsubscribe" as a link.
- Feature grid labels: concrete benefits or features, not generic icons with "Feature 1".

## Technical

- Single HTML file. All CSS in `<style>`. No external CSS files.
- No external images. Hero visual: inline SVG shape, CSS gradient rectangle (`background: linear-gradient(...)` on a `<div>`), or large styled text. No `<img src="https://...">`.
- No JavaScript. None.
- Inline `style=""` attributes on critical elements for email client compatibility (CTA button, basic layout). The `<style>` block handles the rest for preview purposes.
- `<meta charset="utf-8">` and `<meta name="viewport" content="width=device-width">` in `<head>`.
- Box model: `box-sizing: border-box` globally.

## Anti-slop rules

- Page background must not be the same color as the email column
- No external image URLs
- No JavaScript
- No multi-column body sections (except 2×2 feature grid)
- No generic "Click here" CTA text
- No missing font fallback stack

## Self-check (all must pass before output)

- [ ] Email column is 600–680px (max-width: 640px)
- [ ] Page background visually contrasts with email column background
- [ ] Exactly one CTA button in the entire email
- [ ] No external images (no `<img src="http...">` — SVG/gradient only)
- [ ] All copy is real and specific (no lorem ipsum, no "Feature 1")
- [ ] Google Font has a web-safe fallback stack

## Output contract

Output a single `<artifact type="text/html">`. One sentence before it, nothing after.
