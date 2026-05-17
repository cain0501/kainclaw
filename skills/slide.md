## Skill: Slide Deck

Presentation slides. One job per slide. Audience must understand each slide from a distance in under 5 seconds.

## Dimensions and framing

- Each slide: **1280×720px** (16:9). Fixed, never fluid.
- Body centers the slides and scales to fit the browser viewport using:
  ```css
  body { display: flex; flex-direction: column; align-items: center; gap: 16px; background: #222; padding: 24px; }
  .slide { width: 1280px; height: 720px; flex-shrink: 0; position: relative; overflow: hidden; }
  ```
  No scale-to-fit CSS transform required unless the brief asks for a viewer. For a viewer, wrap in a container with `transform: scale(calc(100vw / 1280))`.
- Navigation: a minimal prev/next JS function OR CSS `:target` anchors. Show one slide at a time OR a scrollable stack (pick based on brief).

## Narrative arc (plan before styling)

Before writing any HTML, plan the slide sequence as a list:
- 4–8 slides total
- Each slide title completes: "After this slide, the audience knows that..."
- Arc structure: Title → Problem/Context → Solution → Evidence/Proof → How it works → Call to action / Next step
- Adapt arc to the brief, but keep one idea per slide. No slide that tries to say two things.

## Layout variants (pick per slide based on content type)

| Variant | Use when |
|---|---|
| **Title slide** | Opening. Large centered headline + subtitle + optional logo/date. |
| **Content slide** | Text-heavy point. Headline top, body bullet or paragraph, optional visual right. |
| **Two-column** | Contrast or comparison. Text left, visual or data right. Equal columns. |
| **Full-bleed image** | Emotional beat. CSS gradient or SVG fills entire slide. Short text overlay. |
| **Stat / quote slide** | Single large number or pull quote. Centered, large, nothing else. |

## Typography

- Slide title: 48–64px, weight 700–800, tight tracking (−0.02em). Max 8 words.
- Body text: 20–24px, weight 400, line-height 1.5. Max 3–4 bullet points OR 1 short paragraph.
- Caption / source: 13–15px, `--muted`, bottom of slide.
- **Hard limit: max 40 words per slide (title + body combined).** Ruthlessly cut.
- Load one Google Font for titles. Body uses `system-ui` or the same font at lighter weight.

## Color (oklch tokens)

```css
:root {
  --slide-bg:   oklch(/* base slide background — can be dark or light */);
  --surface:    oklch(/* card or callout panel background */);
  --fg:         oklch(/* primary text */);
  --muted:      oklch(/* secondary text, captions */);
  --accent:     oklch(/* highlight color */);
  --accent-fg:  oklch(/* text on accent background */);
}
```

Accent uses per slide: max 2 (e.g., one highlighted word in title + one key data value). CTA or closing slide may use `--accent` as the full slide background — that is allowed as a special case.

Background: commit to one overall palette. Dark decks feel confident and bold. Light decks feel clean and corporate. Do not mix mid-session.

## Content rules

- Write the **actual slide content** from the brief. If the brief is thin, generate a plausible 5-slide structure with real-sounding content for the domain.
- No "Title Here", "Content goes here", "Slide 3" placeholders.
- Numbers on stat slides must be specific: "4.7× faster", "$2.4M saved", "92% retention" — not round numbers like "5× faster" or "80%".
- Bullet points: parallel grammatical structure. All start with a verb OR all start with a noun. Never mix.
- Logos or client names: invent plausible ones; no real company names.

## Technical

- Single HTML file. All CSS in `<style>`. All layout, no external CSS.
- `.slide` elements: `position: relative; overflow: hidden; width: 1280px; height: 720px`.
- All visual elements inside each slide: positioned or laid out within the 1280×720 box.
- Inline SVG for charts, diagrams, decorative shapes. No external images.
- Minimal inline JS for navigation only (prev/next). If using CSS `:target`, no JS needed.
- `<section class="slide">` for each slide. `<h1>` or `<h2>` for slide title.
- No JS charting libraries. Simple SVG diagrams if data visualization is needed.

## Anti-slop rules

- No blue/purple gradient default backgrounds
- No decorative emoji on slides
- No "Lorem ipsum" or placeholder text
- No slides that are just a wall of bullet points (max 4 bullets, 8–10 words each)

## Self-check (all must pass before output)

- [ ] Each `.slide` container is exactly 1280×720px
- [ ] No slide exceeds 40 words (title + body combined)
- [ ] Each slide carries exactly one idea (title completes "the audience now knows that...")
- [ ] Zero placeholder content anywhere
- [ ] Scale-to-fit or viewer works without overflow at any browser width
- [ ] Accent used ≤2 times per slide (except CTA slide which may flood accent)

## Output contract

Output a single `<artifact type="text/html">`. One sentence before it, nothing after.

## Seed Template & Reference Assets

Before writing any HTML, use `read_file` to read these files in order:
1. `skills/slide/template.html` - copy this as your starting point, replace `[REPLACE]` markers with real content. Do NOT rewrite the CSS framework.
2. `skills/slide/layouts.md` - paste-ready section/screen/slide skeletons
3. `skills/slide/checklist.md` - run every P0 item before emitting the artifact
