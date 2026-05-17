# Pricing Page Layouts

## Layout: Billing Toggle (Annual / Monthly)
```html
<div class="billing-toggle">
  <button class="toggle-btn active" data-period="monthly">Monthly</button>
  <button class="toggle-btn" data-period="annual">Annual <span class="save-badge">Save 20%</span></button>
</div>
<style>
  .billing-toggle { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 4px; width: fit-content; margin: 0 auto 40px; }
  .toggle-btn { padding: 8px 20px; border-radius: 999px; border: none; background: none; cursor: pointer; font-size: 0.875rem; color: var(--muted); }
  .toggle-btn.active { background: var(--accent); color: var(--surface); }
  .save-badge { background: oklch(75% 0.15 140); color: var(--surface); font-size: 0.7rem; padding: 2px 6px; border-radius: 999px; margin-left: 6px; }
</style>
```

## Layout: Feature Comparison Table
```html
<div class="compare-table-wrap">
  <table class="compare-table">
    <thead>
      <tr><th>Feature</th><th>Starter</th><th>Pro</th><th>Enterprise</th></tr>
    </thead>
    <tbody>
      <tr><td>[REPLACE: Feature]</td><td>✓</td><td>✓</td><td>✓</td></tr>
      <tr><td>[REPLACE: Feature]</td><td>✕</td><td>✓</td><td>✓</td></tr>
    </tbody>
  </table>
</div>
<style>
  .compare-table-wrap { overflow-x: auto; margin: 0 24px 60px; }
  .compare-table { width: 100%; border-collapse: collapse; }
  .compare-table th, .compare-table td { padding: 14px 20px; text-align: center; border-bottom: 1px solid var(--border); }
  .compare-table th:first-child, .compare-table td:first-child { text-align: left; }
  .compare-table th { font-weight: 600; color: var(--muted); font-size: 0.875rem; }
</style>
```

## Layout: Social Proof Strip
```html
<div class="proof-strip">
  <p>[REPLACE: Trusted by X+ teams at...]</p>
  <div class="logo-row">
    <span class="logo-placeholder">[REPLACE: Company]</span>
    <span class="logo-placeholder">[REPLACE: Company]</span>
    <span class="logo-placeholder">[REPLACE: Company]</span>
  </div>
</div>
<style>
  .proof-strip { text-align: center; padding: 40px 24px; border-top: 1px solid var(--border); }
  .proof-strip p { color: var(--muted); margin-bottom: 24px; }
  .logo-row { display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
  .logo-placeholder { font-weight: 700; color: var(--muted); opacity: 0.5; font-size: 1.125rem; letter-spacing: 0.05em; }
</style>
```
