# The Print Edition — V5 design

V5 is a visual and wayfinding pass on the V4 product. No engine, route, or
feature changes beyond what is listed here. October 2026.

## Why

John's verdict on V4: it looks outdated. Diagnosed (October 8, 2026):

- **The reader reads as a PDF viewer.** A gray-beige desk under a white bar of
  small text buttons is Acrobat, not a magazine on a table.
- **The archive is a wall of cards.** 71 identical tiles, each with the same
  `Read issue →` link, no years, no rhythm.
- **Flat and plain.** Beige everywhere; nothing feels rich.
- **Type and spacing are inconsistent.** Four generations of stylesheet
  overrides (huge search text on phones, 11px chrome labels on desktop).
- **Browsing old issues is a slog; reader controls feel clunky; it is hard to
  tell where you are.**

Reference: **the Atlantic iOS app** — charcoal chrome around ivory and white
content, condensed numerals used as wayfinding, caps labels for sections, red
only for the active or primary thing.

## Principles

1. **The night stage.** The reader desk, the reader chrome, the shelf hero and
   the issue splash sit on charcoal (`--night*` tokens) in *both* themes. The
   magazine is the lit object; everything around it recedes. Theme still
   governs the archive surface, panels and sheets.
2. **One scale.** Every size comes from `--t-*`, every gap from `--s-*`
   (themes.css). No new raw pixel sizes for type or spacing.
3. **Four faces, four jobs.** Graphik for UI. Logic Monospace caps
   (`--t-label`, `--tracking-label`) for labels and kickers. Garamond for
   titles. Atlantic Condensed for display and numerals (years, page numbers in
   wayfinding).
4. **Red points.** Accent is the primary action, the active state, and the
   progress line. Nothing decorative.
5. **Always say where you are.** Archive: the year rail shows the year in view.
   Reader: the strip names the section and story and shows issue progress.

## Shelf (archive)

- Hero becomes a full-bleed night band: large cover with `--shadow-object`,
  `CURRENT ISSUE` label, Garamond display title in night ink, byline, dek, a
  red pill primary and ghost secondaries, and an `In this issue` list of the
  first features from the contents.
- A sticky browse bar under the masthead: compact search, a **year rail**
  (`All`, `2026` … `2020`) that jumps to the year and highlights the year in
  view, and a newest/oldest toggle. The year `<select>` filter goes.
- The grid is **grouped by year**: Atlantic Condensed numeral, hairline, issue
  count, then a denser grid (`minmax(160px, 1fr)`). Cards are the cover plus
  the month; `Continue · {story}` appears only when there is a place. The
  per-card `Read issue →` goes; the cover opens the splash as before.
- Covers reserve their aspect ratio and fade in; no large gray boxes.

## Splash

Night stage, same composition. The `Esc` keycap hides on touch; the issue pager
uses tabular Graphik, not monospace.

## Reader

- Desk is `--night`; pages carry `--shadow-object`.
- Top bar on the night stage: night-ink icons in 40px targets, Spread/Scroll as
  a pill segmented control, zoom as one compact pill (`− Fit +`), wordmark in
  night ink.
- Story strip on the night stage, two lines: a label line
  (`FEATURES · STORY 4 OF 18`) and the Garamond title with author; folio in
  condensed numerals; a 2px red issue-progress line along its top edge.
- Edge arrows: frosted night circles.
- Phone bars on the night stage, same rules.
- Contents panel and settings keep the theme surface (light cards on the dark
  stage in light mode).

## Unchanged

Routes, hash contract, the V4 test contract selectors and aria labels, saved
places, engine, gestures, keyboard map.
