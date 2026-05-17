## Skill: Animation / Motion Concept

CSS-animated HTML demo. One job: demonstrate one motion idea with production-ready timing that a developer can hand off directly.

## Before writing HTML

1. **Name the motion** — one sentence: "card slides up and fades in on scroll trigger", "button pulses on hover then morphs to a checkmark on click". Write in an HTML comment.
2. **Choose a category** — determines which technique to use (see below).
3. **Fix the viewport** — `width: 100%; min-height: 100vh` for the demo canvas. Not responsive by breakpoint — the animation itself may respond to viewport, but do not add mobile/desktop layout breakpoints.

## Animation categories (pick one)

**Entrance / reveal** — elements appear as user scrolls or page loads
- Technique: `@keyframes` + `animation-fill-mode: backwards` + staggered `animation-delay`
- Trigger: `IntersectionObserver` with `threshold: 0.15` — add class `is-visible` on entry
- Do NOT use scroll-linked animations (`animation-timeline: scroll()`) — browser support too narrow

**Micro-interaction** — hover, focus, or click state on a UI element
- Technique: CSS `:hover`, `:focus-visible`, `:active` transitions only
- `transition` property: specify individual properties, never `transition: all`
- Duration guide: hover feedback 120–180ms ease-out; state change 200–300ms ease-in-out; complex morphing 400–500ms

**Looping ambient** — background motion that runs forever (loading, idle state, brand animation)
- Technique: `@keyframes` with `animation-iteration-count: infinite`
- Must use `animation-play-state: paused` when element is not visible (`IntersectionObserver`)
- `prefers-reduced-motion` media query REQUIRED — pause all animations when set

**Sequence / timeline** — multiple elements animate in a defined order
- Technique: staggered `animation-delay` values, calculated from a base delay variable
- Define delays as CSS custom properties: `--delay-1: 0ms; --delay-2: 150ms; --delay-3: 300ms`
- Maximum 6 animated elements in one sequence

## Technical rules

- No GSAP, Anime.js, Framer Motion, or any external animation library
- No Canvas API, no WebGL
- `will-change: transform, opacity` on elements that animate position or opacity (add only to those elements, not globally)
- Never animate `width`, `height`, `top`, `left`, `margin`, or `padding` — these cause layout recalculation. Use `transform` and `opacity` only
- For color transitions: use `filter: hue-rotate()` or transition between `opacity` layers, not direct color property transitions on complex elements
- `prefers-reduced-motion` block required if any animation runs more than once:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

## Easing vocabulary

| Feel | Value |
|------|-------|
| Snappy UI response | `cubic-bezier(0.25, 0, 0, 1)` |
| Natural entrance | `cubic-bezier(0, 0, 0.3, 1)` |
| Elastic overshoot | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Mechanical | `linear` |

Do not use bare `ease`, `ease-in`, or `ease-out` — use explicit cubic-bezier values.

## Color tokens

```css
:root {
  --bg:      oklch(/* demo canvas background */);
  --surface: oklch(/* animated element default state */);
  --fg:      oklch(/* text */);
  --accent:  oklch(/* animated element active / highlight state */);
}
```

## Demo structure

The HTML must show the animation in context — not an isolated spinning box. Provide:
- A realistic UI shell (a card, a button, a list, a hero section — whatever fits the motion concept)
- A clear affordance showing the user what to do: scroll, hover, or click
- A label (`<p>` or `<caption>`) naming the motion technique used

## Content rules

- The demo must show real UI content, not "Box 1 / Box 2"
- If demonstrating a card entrance, cards must have real titles and real body text
- If demonstrating a button state, the button must have a real action label

## Self-check

- [ ] Motion concept named in HTML comment
- [ ] Category chosen and correct technique used
- [ ] Only `transform` and `opacity` animated (no layout properties)
- [ ] `will-change` set only on animating elements
- [ ] `prefers-reduced-motion` block present (if any looping or repeating animation)
- [ ] No external animation libraries
- [ ] Explicit `cubic-bezier()` easing used (not bare `ease`)
- [ ] Demo shows real UI content, not placeholders
- [ ] oklch color tokens defined before any CSS color values
