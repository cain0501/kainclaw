# KainClaw Design Baseline

This document is the project-wide UI baseline for KainClaw.

It is not a full brand book. It is a practical source of truth for how KainClaw should look and feel as an Electron desktop AI coding and design product.

The goal is simple: future UI work should stop feeling pieced together feature by feature, and start reading like one product.

## What This Document Is For

- Give KainClaw one coherent visual direction across chat, design workbench, image workflows, and library surfaces
- Make UI decisions faster by reducing local style improvisation
- Keep the Electron shell thin while making the product feel intentional and desktop-native
- Provide a review baseline for future UI tasks

## What This Document Is Not

- Not a request to rewrite the renderer
- Not a license to reskin every surface immediately
- Not a replacement for product specs or task primers

## Current Product Reality

KainClaw today is an Electron desktop AI coding and design assistant.

The most important visible product surfaces are:

- Main chat and agent workflow surfaces
- Midtai design workbench
- Recent works / project navigation
- Image Lab and image material library
- Artifact preview and stage surfaces

Repository screenshots under `assets/screenshots/` are marketing or README assets, not a reliable source of truth for current UI state.

This baseline is therefore grounded in product direction, existing surface categories, and the current desktop-shell strategy, not in any single screenshot.

The main problem to solve is consistency, hierarchy, and reuse across those surfaces.

## Assumptions

These are informed assumptions based on the README, spec, and current product direction. They should be treated as reversible until explicitly confirmed by the product owner.

- Primary users are Chinese-speaking builders who want Claude-style AI workflows in a more accessible desktop product
- The product is used for long, focused sessions on Windows laptops or desktop monitors
- The tone should feel capable, calm, and product-oriented, not playful SaaS and not hacker-terminal cosplay
- The design workbench should feel like a creative studio tool, while the main chat should still feel precise and trustworthy

## Product Character

KainClaw should feel like:

- A desktop workshop for shipping things
- Warm enough to feel inviting
- Structured enough to feel reliable
- Creative enough to support design tasks
- Serious enough to support coding and review work

KainClaw should not feel like:

- A dark neon AI toy
- A generic B2B dashboard
- A VS Code skin with random rounded cards
- A mobile app stretched onto desktop

## Core Visual Direction

The design direction is:

**Warm editorial workbench**

Keywords:

- warm
- precise
- composed
- craft-oriented
- desktop

This means:

- Light theme is the default product theme
- Surfaces should use warm neutrals rather than cold grays
- Accent color should feel controlled and confident, not loud
- Layouts should privilege reading flow, panel hierarchy, and work state clarity
- Visual richness should come from spacing, typography, and panel rhythm more than decorative effects

## Theme

Default theme: `light`

Reason:

- The product is used for design review, image selection, artifact reading, and longer-form content inspection
- A warm light canvas better supports screenshots, generated images, previews, and mixed-content work surfaces
- Current product direction already points here

Dark mode may exist later, but it should be a translation of the same system, not a separate identity.

## Color System

### Intent

Color should separate product chrome, work surfaces, status, and emphasis without turning the app into a palette demo.

### Palette Shape

- Base surfaces: warm off-white and warm paper tones
- Panel borders: quiet beige-tinted neutrals
- Primary accent: restrained rust-orange / clay-orange
- Secondary accent: muted forest or olive only for positive state and active-presence signals
- Ink: deep brown-black instead of pure black

### Rules

- Avoid pure white backgrounds except where the content itself needs a neutral stage
- Avoid pure black text
- Avoid blue-purple "AI gradient" accents
- Use accent color sparsely, mostly for current selection, primary actions, and active tabs
- Success state should not compete with the primary accent
- Warning and danger should be functional, not decorative

### Recommended Token Direction

These are starter directions, not frozen values.

```css
:root {
  --kc-bg: oklch(0.97 0.01 75);
  --kc-bg-muted: oklch(0.95 0.012 75);
  --kc-panel: oklch(0.985 0.008 75);
  --kc-panel-2: oklch(0.955 0.012 72);
  --kc-border: oklch(0.88 0.018 72);
  --kc-border-strong: oklch(0.78 0.028 68);
  --kc-ink: oklch(0.27 0.02 45);
  --kc-ink-soft: oklch(0.43 0.015 52);
  --kc-accent: oklch(0.62 0.16 38);
  --kc-accent-hover: oklch(0.57 0.16 38);
  --kc-success: oklch(0.68 0.11 145);
  --kc-stage: oklch(0.91 0.01 75);
  --kc-shadow: color-mix(in oklab, var(--kc-accent) 8%, black);
}
```

## Typography

### Intent

Typography needs to do most of the hierarchy work. KainClaw shows mixed content, prompts, project names, metadata, form labels, generated artifacts, and dense library cards. Weak typography will make every screen feel messy.

### Direction

- Desktop product UI, not marketing site typography
- High readability first
- Slight editorial flavor in headings
- Neutral, workmanlike body copy

### Pairing Strategy

- Heading/display font: a humanist or editorial sans with character
- Body/UI font: a clean sans optimized for mixed Chinese and English desktop UI

Because this product is bilingual and desktop-heavy, font decisions must be tested with Chinese UI copy before standardization.

### Rules

- Use a small number of type sizes with clear separation
- Keep metadata visibly quieter than primary content
- Do not use tiny pale text for important state
- Avoid all-caps UI except short chips or system labels
- Prefer left-aligned text almost everywhere

### Suggested Type Scale

```text
Display label: 11-12px
Meta / helper: 12-13px
Body UI: 14px
Body emphasis: 15-16px
Section title: 18-20px
Surface title: 24-28px
```

## Spacing and Shape

### Intent

KainClaw should feel breathable, not crowded. The app already leans rounded and soft. Keep that, but tighten the logic so panels and controls feel related instead of arbitrary.

### Spacing Rules

- Use a 4pt base scale
- Default internal control spacing should be 8, 12, 16, 24, 32
- Use larger vertical gaps between functional groups than within them
- In dense libraries, let card gaps stay visually quiet so the content carries the surface

### Radius Rules

- Chips and small buttons: 999px pill or 10-12px rounded
- Standard controls: 12-14px
- Panels: 18-24px
- Large stage containers: 24-28px

Do not mix sharp rectangles with very rounded controls unless the contrast is clearly intentional.

## Surfaces and Depth

### Visual Model

There are four surface levels:

1. App background
2. Primary panels
3. Nested work surfaces
4. Active or focused elements

Depth should come from:

- subtle contrast shifts
- controlled borders
- very soft shadows
- inset stage framing when needed

Not from:

- heavy glow
- glassmorphism
- large blur layers
- stacked card-on-card-on-card compositions

## Interaction Model

### Buttons

- One strong primary action per local area
- Secondary actions should usually be outline or ghost
- Tertiary actions can be text buttons or compact pills
- Button sizing should be calm and desktop-like, not oversized mobile CTA blocks

### Tabs and Filters

- Tabs should clearly separate navigation from mode switching
- Active state should be obvious from fill, weight, and contrast, not color alone
- Avoid having three different tab styles on the same screen

### Forms

- Inputs should feel embedded in the workbench, not pasted from a settings page
- Labels should be short and high-signal
- Helper text should explain decisions, not restate the label
- Progressive disclosure is preferred over always-visible advanced options

### Status

- Status chips should be compact and quiet
- Use color plus wording, not color alone
- Active project / editing state should be visible without looking noisy

## Layout Guidance By Surface

### Main Chat

Desired feel:

- precise
- trustworthy
- focused on transcript readability

Rules:

- Message flow is the primary structure
- Tool state should read as supporting evidence, not decorative chrome
- Composer tools should stay subordinate to the conversation
- Side panels should not visually overpower the transcript

### Midtai Design Workbench

Desired feel:

- creative studio
- organized
- work-in-progress friendly

Rules:

- Left panel is project and workflow context
- Center or main stage is where the artifact earns attention
- Secondary controls should gather into clear bands, not float everywhere
- Version history, preview, and patch tools should read as workbench tools, not as random button clusters

### Recent Works / My Works

Desired feel:

- browsable
- calm
- asset-aware

Rules:

- Make content thumbnails do the visual work
- Reduce unnecessary chrome around cards
- Metadata hierarchy must stay stable across design and image items
- Selection state should be obvious but not heavy-handed

### Image Lab / Material Library

Desired feel:

- visual
- high-throughput
- easy to scan

Rules:

- Cards should prioritize image area first
- Actions should be predictable and repeated consistently
- Dense grids are fine, but captions need a controlled line strategy
- Avoid mixing too many button styles inside cards

## Component Rules

### Cards

- Use cards when the item is a real unit: project, asset, result, version
- Avoid nesting cards inside cards
- Prefer one outer shell with internal sections over many mini-panels

### Chips

- Good for status, mode, filters, and metadata
- Keep label length tight
- If everything becomes a chip, the UI loses hierarchy

### Empty States

- Empty states should teach the next move
- Include one clear action
- Avoid generic "暂无内容" without context

### Preview Frames

- Preview frames should feel like a stage
- Keep stage backgrounds neutral and quiet
- The preview itself should remain the most visually dominant element

## Motion

Motion should be sparse and useful.

Allowed:

- soft tab or chip state transitions
- panel reveal and collapse
- thumbnail hover lift
- artifact or stage transition when changing versions

Avoid:

- bouncing
- decorative floating
- constant shimmer outside loading states
- attention-seeking animation loops

## Writing Tone In UI

UI copy should be:

- direct
- calm
- useful

Avoid:

- fake friendliness
- marketing slogans inside the product
- overly technical system wording for normal user actions

For Chinese UI copy, prefer concise product language over transliterated English software phrasing.

## Anti-Patterns To Reject

- Purple-blue AI gradients
- Cold grayscale enterprise panels
- Card nesting for no reason
- Three or more competing accent colors on one screen
- Oversized empty paddings that waste desktop space
- Tiny helper text doing critical explanatory work
- Controls that visually outrank the main artifact or transcript
- Mobile-first spacing choices transplanted directly into desktop work surfaces

## Accessibility Baseline

- Do not rely on color alone for active, selected, or warning state
- Keep text contrast strong on warm surfaces
- Hit targets must remain usable on desktop without feeling bloated
- Keyboard focus should be visible and consistent
- Bilingual text must be tested for truncation and line rhythm

## Rollout Order

Do not try to restyle everything at once.

Apply this baseline in the following order:

1. Shared tokens: color, border, radius, spacing, text hierarchy
2. Navigation and tabs: top-level product chrome
3. Main work surfaces: chat, design workbench, image library
4. Cards and status chips
5. Edge surfaces: settings, dialogs, empty states, export flows

## Review Checklist For Future UI Tasks

Before calling a UI task done, check:

- Does this surface look like KainClaw, not a borrowed template?
- Is the primary action obvious?
- Is the main content visually more important than support controls?
- Are typography and spacing doing the hierarchy work?
- Are there too many panel styles or button styles on one screen?
- Does the screen still feel good in Chinese copy?
- Does the screen still feel like a desktop product rather than a stretched phone UI?

## Immediate Recommendations For The Current Product

Without treating README screenshots as source of truth, the next design improvements should still focus on:

- Unifying button styles across workbench and library surfaces
- Tightening type hierarchy in side panels and card metadata
- Reducing visual drift between tabs, pills, and status chips
- Standardizing stage framing and internal toolbar treatment
- Defining shared tokens before any large UI polish pass

## Decision Rule

When unsure between "more visual styling" and "clearer work hierarchy", choose clearer work hierarchy.

That is the whole product advantage. KainClaw should feel like a tool people can stay inside for hours.
