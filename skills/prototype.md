## Skill: Prototype

Clickable HTML/CSS/JS prototype. One job: demonstrate one product scenario end-to-end with real-feeling UI.

## Before writing HTML

1. **Identify the scenario** — one specific user action: "user searches for a product and views its detail page", "user completes onboarding step 2 of 3", "user reviews and approves a document". Write this in an HTML comment at the top.
2. **Map the screens** — list every distinct state the prototype needs: screen names + what triggers transition between them. Maximum 4 screens per prototype.
3. **Choose the frame** — pick ONE: desktop (1280px wide), tablet (768px), or mobile (375px). Fix the viewport in CSS. Do not make it responsive.

## Layout rules

**Desktop (1280px):**
- App shell: fixed top nav (56–64px) + optional left sidebar (220–260px) + main content area
- Use CSS Grid for the shell: `grid-template-areas`

**Mobile (375px):**
- Status bar placeholder: 44px, background matches nav
- Nav bar or tab bar: fixed, 56–64px
- Scrollable content between nav and tab bar
- All tap targets: minimum 44×44px, no exceptions

**Tablet (768px):**
- Top nav or side drawer nav
- Content max-width 680px, centered

## Interaction (JS rules)

- Navigation between screens: use `data-screen` attribute + JS `show/hide` pattern. No `href` page loads.
- Example pattern:
  ```js
  document.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('[data-screen]').forEach(s => s.hidden = true);
      document.querySelector(`[data-screen="${el.dataset.go}"]`).hidden = false;
    });
  });
  ```
- Hover states: use `:hover` for desktop, `:active` for mobile (add `ontouchstart=""` to body to enable `:active` on iOS)
- No external JS libraries. No `alert()`. No `console.log()` left in output.
- Forms: prevent default submit, show a success state instead

## State coverage (required)

Every prototype must demonstrate at least 2 of these:
- Empty state (no data yet)
- Filled/active state (data present)
- Loading state (skeleton or spinner, CSS only)
- Error state (inline validation message)
- Success state (confirmation after action)

## Color tokens

```css
:root {
  --bg:      oklch(/* app background */);
  --surface: oklch(/* card / panel */);
  --fg:      oklch(/* primary text */);
  --muted:   oklch(/* secondary text */);
  --border:  oklch(/* dividers */);
  --accent:  oklch(/* interactive elements: buttons, links, active states */);
  --accent-fg: oklch(/* text on accent */);
}
```

## Content rules

- Every text element must carry real-seeming content: real product names, plausible user names, realistic numbers
- No "Item 1 / Item 2", no "User Name", no "Lorem ipsum"
- If the prototype shows a list, show at least 3 rows with varied content
- Buttons must have action verbs: "提交申请" not "按钮"; "查看详情" not "点击"

## Self-check

- [ ] Scenario written in an HTML comment at the top
- [ ] Frame size locked in CSS (desktop/tablet/mobile — not responsive)
- [ ] At least 2 distinct screens with JS navigation between them
- [ ] At least 2 states demonstrated (empty / filled / loading / error / success)
- [ ] All tap targets ≥ 44×44px (mobile) or click targets ≥ 32×32px (desktop)
- [ ] No placeholder text anywhere in the prototype
- [ ] No external libraries, no leftover console.log
- [ ] oklch color tokens defined before any CSS color values
