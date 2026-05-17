# Social Carousel Layouts

## Layout: Stat Slide (number-forward)
```html
<div class="slide stat-slide">
  <div class="slide-label">[REPLACE: Label]</div>
  <div class="stat-number">[REPLACE: e.g. 87%]</div>
  <div class="stat-caption">[REPLACE: What this stat means]</div>
  <div class="slide-number">0X / XX</div>
</div>
<style>
  .stat-slide { justify-content: center; gap: 12px; }
  .stat-number { font-size: clamp(4rem, 15vw, 7rem); font-weight: 800; color: var(--accent); line-height: 1; }
  .stat-caption { font-size: 1rem; color: var(--muted); max-width: 340px; text-align: center; }
</style>
```

## Layout: List Slide (3-item ordered)
```html
<div class="slide list-slide">
  <div class="slide-label">[REPLACE: Label]</div>
  <div class="slide-headline">[REPLACE: Headline]</div>
  <ol class="slide-list">
    <li>[REPLACE: Item 1]</li>
    <li>[REPLACE: Item 2]</li>
    <li>[REPLACE: Item 3]</li>
  </ol>
  <div class="slide-number">0X / XX</div>
</div>
<style>
  .slide-list { counter-reset: list-counter; display: flex; flex-direction: column; gap: 14px; padding: 0; }
  .slide-list li { list-style: none; display: flex; align-items: flex-start; gap: 14px; color: var(--muted); font-size: 0.9375rem; line-height: 1.5; }
  .slide-list li::before { counter-increment: list-counter; content: counter(list-counter); background: var(--accent); color: var(--accent-fg, var(--fg)); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
</style>
```

## Layout: Quote Slide
```html
<div class="slide quote-slide">
  <blockquote class="quote-text">"[REPLACE: Quote text]"</blockquote>
  <cite class="quote-attribution">- [REPLACE: Name, Title]</cite>
  <div class="slide-number">0X / XX</div>
</div>
<style>
  .quote-slide { justify-content: center; }
  .quote-text { font-size: clamp(1.25rem, 3.5vw, 1.875rem); font-weight: 600; color: var(--fg); line-height: 1.4; margin-bottom: 24px; }
  .quote-text::before { content: "\201C"; font-size: 4rem; color: var(--accent); line-height: 0; vertical-align: -1rem; margin-right: 4px; }
  .quote-attribution { font-size: 0.875rem; color: var(--muted); }
</style>
```
