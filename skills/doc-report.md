## Skill: Document / Report

Long-form reading layout. One job: make a dense document scannable and comfortable to read from start to finish.

## Canvas

- Content column width: 700–760px, centered on the page
- Page background: `var(--bg)` — must be visually distinct from content background `var(--surface)` (minimum 3% lightness difference in oklch)
- No sidebar. No sticky nav. Full-page scroll.
- Print-safe: avoid fixed-position elements that would break print layout

## Document structure (required sections)

1. **Document header** — title (H1) + subtitle or abstract (1–3 sentences) + metadata row (author, date, version or status badge). All within the content column.
2. **Table of contents** — if the document has 4+ sections. Use anchor links (`href="#section-id"`). Style as a plain list, not a sidebar.
3. **Body sections** — each with an H2 heading, optional H3 subheadings. Prose, lists, tables, callouts as needed.
4. **Appendix or footnotes** (optional) — smaller font, `var(--muted)` color, separated by a horizontal rule.

## Typography hierarchy (required contrast)

| Level | Size | Weight | Color |
|-------|------|--------|-------|
| H1 (title) | 32–40px | 700 | `var(--fg)` |
| H2 (section) | 22–26px | 600 | `var(--fg)` |
| H3 (subsection) | 17–19px | 600 | `var(--fg)` |
| Body | 16–17px | 400 | `var(--fg)` |
| Caption / label | 13px | 400 | `var(--muted)` |
| Footnote | 12px | 400 | `var(--muted)` |

Line height: body text must be `1.75–1.85`. Headings: `1.2–1.3`.

Each heading level must be visually distinguishable without color — size and weight difference alone must be enough.

## Component patterns

**Callout box** (for warnings, tips, key insights):
```css
.callout {
  border-left: 3px solid var(--accent);
  background: oklch(from var(--accent) l c h / 0.06);
  padding: 14px 16px;
  border-radius: 0 6px 6px 0;
}
```
Use accent sparingly — maximum 3 callout boxes per document.

**Data table**:
- `border-collapse: collapse`
- Header row: `background: var(--surface)`, weight 600
- Body rows: alternating `background: var(--bg)` / `var(--surface)` OR plain with `border-bottom: 1px solid var(--border)`
- All columns: left-aligned text; right-aligned numbers
- Responsive: `overflow-x: auto` wrapper, never clip table content

**Code block**:
- `background: var(--surface)`, `font-family: monospace`, font-size 14px
- Padding: 16px, border-radius 6px, `border: 1px solid var(--border)`
- No syntax highlighting required — monochrome is fine

**Blockquote**:
- Left border `3px solid var(--muted)`, padding-left 16px
- Font style: italic, `var(--muted)` color

## Color tokens

```css
:root {
  --bg:      oklch(/* page background */);
  --surface: oklch(/* content column + table header + code blocks */);
  --fg:      oklch(/* all body text and headings */);
  --muted:   oklch(/* captions, footnotes, blockquotes, metadata */);
  --border:  oklch(/* table borders, horizontal rules */);
  --accent:  oklch(/* callout borders and tints — used max 3× */);
}
```

## Content rules

- Headings must be real section titles, not "Section 1" or "标题"
- Body paragraphs: minimum 2 sentences each; no single-sentence orphan paragraphs
- If a table is included, every cell must have real content
- Document metadata: real-looking date, author name, version number
- Minimum 4 body sections (H2 level) to justify the long-form format

## Self-check

- [ ] Content column width 700–760px, centered
- [ ] Page bg and content bg visually distinct
- [ ] H1 / H2 / H3 each visually distinguishable by size + weight alone
- [ ] Body line-height ≥ 1.75
- [ ] Table of contents present (if 4+ sections)
- [ ] Anchor links in TOC work (`href="#id"` matches `id` on heading)
- [ ] Callout accent used max 3 times
- [ ] All tables have `overflow-x: auto` wrapper
- [ ] No placeholder headings or body text
- [ ] oklch color tokens defined before any CSS color values
