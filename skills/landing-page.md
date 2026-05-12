## Skill: Landing Page

Convert-led marketing page. One job: move visitor from attention to action.

## Section order (required, top to bottom)

1. **Nav** — sticky, transparent-to-solid on scroll. Logo left, 3–5 links center or right, one ghost CTA button right. No mega-menu.
2. **Hero** — full-viewport (min-height 100svh). Decisive headline ≤10 words (not a tagline, a promise). 1–2 sentence subhead. One primary CTA button (action verb). Optional supporting visual right or behind.
3. **Features / benefits** — 3–6 items. Grid: icon (SVG or Unicode symbol, not emoji art) + bold title (concrete benefit, not category label) + 2–3 sentence body. Title examples: "Ships in 48 hours" not "Shipping"; "Cuts invoice time by 80%" not "Efficiency".
4. **Social proof** — logos row (5–8 company silhouettes as CSS shapes or text-based wordmarks) OR 2–3 testimonials with name + role + company. No real company names; invent plausible ones.
5. **One persuasion section** — pick ONE: how-it-works (3–4 numbered steps) OR comparison table (you vs. generic "Others" column) OR stat block (3–4 large numbers with captions). Do not stack multiples.
6. **Final CTA band** — accent color floods the background here ONLY. Headline + 1–2 sentence reinforcement + primary CTA button. This is the one place accent is dominant.
7. **Footer** — links grid 3–4 columns, copyright, social icons (text-based or SVG, no icon fonts).

## Color

Before writing any CSS, decide the palette from the brief's mood. Write it as a comment block at the top of `<style>`. Then define every token in `:root` using `oklch()`.

Required tokens:
```css
:root {
  --bg:      oklch(/* page background */);
  --surface: oklch(/* card / elevated surface */);
  --fg:      oklch(/* primary text */);
  --muted:   oklch(/* secondary text, captions */);
  --border:  oklch(/* dividers, card borders */);
  --accent:  oklch(/* brand color */);
  --accent-fg: oklch(/* text on accent */);
}
```

Accent rules: use `--accent` in CTA button, CTA band background, and max 1 other decorative use (e.g., an underline, icon fill). Never 4+ uses outside the CTA band. No blue/purple gradient default — derive from brief.

## Typography

- Display (hero headline): 56–80px, letter-spacing −0.02em to −0.04em, font-weight 700–900
- Section headline: 32–44px, weight 600–700
- Body: 16–18px, line-height 1.6, weight 400
- Caption / label: 12–14px, weight 500, letter-spacing 0.06em, uppercase optional

Pick one Google Font that matches the brief's mood. Load via `<link>`. Use it for display + headlines. Pair with system-ui for body. Never use Inter as the sole display font unless the brief explicitly calls for neutral tech.

## Content rules

- Pull all copy from the brief. No lorem ipsum anywhere.
- Hero headline: specific claim, not a vague slogan. Bad: "The future of work." Good: "Run payroll for 50 people in 8 minutes."
- Feature titles must state outcomes, not nouns. Bad: "Analytics". Good: "See what's working in real time."
- CTA button text must be an action verb + object. Bad: "Get Started". Good: "Start free trial", "Book a demo", "Download the app".
- Testimonials: write realistic first-person quotes, 1–3 sentences, with a specific result mentioned.

## Technical

- Single HTML file. All CSS in `<style>` block in `<head>`. No external CSS files.
- CSS custom properties for all colors (oklch tokens). Never hardcode hex/rgb in rules.
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`.
- Responsive at 1440px (design base), 768px (tablet, stack features grid), 375px (mobile, stack hero, full-width CTA).
- Use CSS Grid for section layouts. Flexbox inside components.
- No JavaScript unless the brief requires a specific interaction (e.g., toggle, modal). If JS used, keep it minimal and inline.
- No external images. Use CSS gradients, SVG, or Unicode for visual elements.

## Anti-slop rules

Reject these automatically:
- Blue/purple gradient hero background (unless brand explicitly requires it)
- Decorative emoji scattered in copy
- Glassmorphism panels with `backdrop-filter: blur`
- Fake statistics not grounded in the brief
- "Trusted by 10,000+ teams" without brief support
- Generic stock-photo-description alt text

## Self-check (all must pass before output)

- [ ] Accent used ≤3 times outside the CTA band
- [ ] Every color value traces back to an oklch token in `:root`
- [ ] Zero lorem ipsum or placeholder text anywhere
- [ ] Responsive: hero stacks correctly at 375px, features grid collapses at 768px
- [ ] CTA button text is an action verb, not "Get Started" or "Learn More"
- [ ] Top-to-bottom narrative: promise → proof → mechanism → action
- [ ] Hero headline is ≤10 words and makes a specific promise
- [ ] No decorative emoji, no glassmorphism, no fake stats

## Output contract

Output a single `<artifact type="text/html">`. One sentence before it, nothing after.
