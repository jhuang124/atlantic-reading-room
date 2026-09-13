# The Print Edition — V4 plan

V4 is a user-first revamp of the reader's interaction design, chrome, and
information architecture, plus the structural changes that make the product
about *issues and stories* rather than PDF pages. It keeps the V3 engine
(PDF.js rasters, shared cache, curl mesh, hash routes, saved places, tokens)
and the V3 visual language. September 2026.

## Why

John's verdict after using V3 for real: too many features that don't matter,
a HUD that doesn't look or feel intentional, controls that block the thing
you're reaching for, and breakage in ordinary use (buttons that don't click,
animations that fail). The agents built everything and everything "sort of
works"; nobody asked why a person would want each control or how the controls
interact.

What the product is for, settled in discovery (September 11–13, 2026):

- **The print edition as an object, online.** Today the Atlantic's print
  edition online is a PDF download button and Chrome's viewer. This replaces
  that. It is *not* a replacement for reading on theatlantic.com; it is for
  people who want the magazine.
- **The decider is editorial, and the bar is feel.** The demo is on John's
  laptop; the link then gets opened anywhere. There is no demand data; the
  case is brand and taste, so every surface has to look considered.
- **Scroll view matters.** It is the PDF-viewer replacement — the familiar
  way people already read these files — and it stays first-class.
- **Tablet is not a target.** Desktop and phone only.
- **The artifact is disposable; the idea shipping is the win.**

## Principles

1. **Name views by what they're for, and have two.** *Spread* (desktop) /
   *Pages* (phone) is the magazine as an object: fitted pages, turns. *Scroll*
   is reading: continuous, page-width, pinch. Nothing else. The toggle is in
   the bar, not in Settings.
2. **The story is the unit; the page is the medium.** Where you are is a
   story, how far you are is a page within it, and the coarse motion is
   *next story*. Resume, captions, and the front door speak in stories.
3. **Chrome never blocks reading.** Controls live in margins and bars, never
   over the page you're reading. Revealing hidden chrome takes intent (an
   edge dwell, a deliberate tap). Anything that appears near the pointer's
   destination is a bug.
4. **One control per job, and every control earns its sentence.** If a
   control can't be defended to an editor in one sentence, it goes.
5. **Instant first page.** The cover is on screen in under a second on any
   connection that can load the site. The PDFs are linearized and the host
   serves byte ranges; use them.
6. **Remove before adding.** V4 removes more than it adds.

## Removals

- **Article view** (`ArticleView.tsx`, `articles.ts`, article assets, the
  `Read as article` / `Article` controls, text-size setting). Three reflowed
  stories out of ~1,100 make the product ambiguous about what it is. In its
  place: a per-story **Read on theatlantic.com ↗** link where the URL is
  known (cover stories today; a data job later), in the Contents panel and
  the story strip.
- **Page width** as a paged view mode. Scroll is page-width reading; in
  Spread/Pages, width is zoom. Saved places with `mode: 'page'` migrate to
  `'scroll'`.
- **Zoom, View, and Full screen inside Settings.** View and Zoom move to the
  bar. Full screen stays in Settings as one button.
- **"Always show controls"** on phones (replaced by scroll-direction reveal
  in Scroll and tap-toggle in Pages).
- **Install-to-home-screen instructions** in the reader (`BrowserReadingOptions`
  loses everything except the Full screen button).
- **The desktop folio in the top bar** (date + page input + "of N"). The page
  input moves into the story strip; the date lives in the Contents header and
  the document title.
- **The bottom-edge reveal zone** in Focus. Top edge only.
- **The visible `focus-access` button.** Keep a visually hidden
  "Show reading controls" for keyboard and screen-reader users.
- Column remnants (`column` constant, saved-place field handling stays for
  shape only).

## The view model

| | Desktop | Phone |
| --- | --- | --- |
| Object view | **Spread** — two fitted pages, curl, corner drag, edge arrows, arrow keys | **Pages** — one fitted page, swipe / edge-tap turns, slide |
| Reading view | **Scroll** — continuous, centered, page width `min(900px, viewport − margins)`, 24px gaps | **Scroll** — continuous, page-width, 12px gaps |
| Default | Spread | **Scroll** (the PDF replacement; John reads this way) |
| Zoom | ⌘/Ctrl-scroll, trackpad pinch, double-click 2×, bar `− / Fit / +` | pinch, double-tap 2×; a `Fit` chip appears while zoomed |
| Turn / advance | arrows, corner drag, edge arrows, horizontal trackpad swipe at Fit | swipe, edge tap (Fit only), bar arrows; Scroll: scrolling |
| Keyboard ← → | previous / next spread | Scroll: scroll to previous / next page top |

The chosen view is a **preference**, stored per device class
(`preferences.viewDesktop`, `preferences.viewPhone`), not per issue. The
saved place per issue keeps page, zoom, offsets, and `pageOffset` for Scroll.
On restore, the view comes from the preference; the place supplies position.

Switching views keeps the current page: Spread → Scroll lands with that page
at the top; Scroll → Spread opens the spread containing the page the reader
was looking at (the page whose top is nearest the viewport top).

## Desktop chrome

### Top bar — 52px, `nav[aria-label="Reader"]`

```
[← Archive] [☰ Contents]        The Atlantic        [Spread|Scroll] [−][Fit][+] [🔖] [⚙] [⤢]
```

- Left group: **Archive** (icon + label), **Contents** (icon + label,
  `aria-expanded`). Labels stay to 900px, then icons with `title`s.
- Center: wordmark, 128px.
- Right group, in this order:
  - **View** — `div[role=group][aria-label="View"]` with two
    `button[aria-pressed]`: `Spread`, `Scroll`. Segmented style (`.segmented`).
  - **Zoom** — `div[role=group][aria-label="Zoom"]`: `button[aria-label="Zoom out"]`
    (−), `button.zoom-fit` whose text is `Fit` at fit and `125%` when zoomed
    (click → fit), `button[aria-label="Zoom in"]` (+). Zoom out is disabled at
    fit. Zoom steps: 1 → 1.25 → 1.5 → 2 → 3 → 4.
  - **Save page** (bookmark icon, `aria-pressed` when saved).
  - **Reading settings** (gear, `aria-expanded`).
  - **Focus** (`aria-label="Focus"`, `title="Focus · F"`).
- All icon buttons: 36×36, `--radius-1`, hover `--surface-2`.

### Story strip — 44px, bottom of the desk, `div.story-strip[aria-label="Now reading"]`

```
[‹ Previous story]     Kevin Dowdell’s Boys  Sally Jenkins      24 / 108     [Next story ›]
```

- Grid `auto minmax(0,1fr) auto auto`. Sits in the desk margin; the desk
  budgets 44px for it (Focus gives it back).
- **Previous / Next story** — text buttons with chevrons,
  `aria-label="Previous story"` / `"Next story"`, `title` = the neighbor's
  title. Disabled at the ends. When the current location is not a story
  (cover, front matter, back matter), the Next button takes the accent color
  and reads `Next story: {title} ›` (title truncated at ~28ch) — the
  invitation to skip.
- **Title** — `button.strip-story` with the story title (Garamond 17/1.1)
  and author (Graphik 12, `--ink-2`), one line, ellipsis. Click → Contents
  panel scrolled to the story. For non-story locations the title reads
  `Cover`, `Front matter`, `Contents`, or `Back cover` in Graphik 13 `--ink-2`.
- **Folio** — `label.page-folio`: an `input[aria-label="Go to page"]` (the
  printed page label, `size` fits its value, tabular numerals, underline on
  hover, selects on focus, Enter or blur commits, Escape reverts) followed by
  `/ 108` in `--ink-2`. In Scroll it follows the page nearest the viewport
  top.
- When a story has a known URL, a small `Read online ↗` text link follows
  the author (Graphik 12, underline on hover, `target=_blank`).

### Desk

- `.page-viewport` padding: `20px 72px 44px` (edge arrows live in the 72px
  margins; the strip in the 44px).
- **Edge arrows** as in V3: 44px circles at the vertical center of the
  margins, revealed on desk hover, always visible when zoomed, hidden in
  Scroll. `aria-label="Previous page"` / `"Next page"`.
- **Corner drag** as in V3 with the hover fold hint.
- **Progress hairline** 2px at the very top, `--accent`.
- **Focus (F)** hides the top bar and the strip; the desk padding becomes
  `16px 32px`. Reveal: pointer dwell in the top 16px for 200ms, `F`, `Tab`,
  or `Escape` (which leaves Focus). No bottom zone. Edge arrows still appear
  on desk hover.

### Scroll view (desktop)

- Pages centered, width `min(900, viewport − 144)`, `--shadow-page`, 24px
  gaps, 20px top padding, 44px bottom (strip).
- Story strip folio and title follow the page nearest the top of the
  viewport. Previous / Next story scroll to the story's first page top.
- `←`/`→` scroll to the previous / next page top; `Home` / `End` to first /
  last page. Trackpad and wheel scroll natively.
- Zoom scales page width; above viewport width the port scrolls
  horizontally. ⌘-scroll anchors at the pointer (existing `changeZoom`).
- Edge arrows and corner hotspots are not rendered in Scroll.

### Settings popover — under the gear

Appearance (Light / Dark segmented) · Page turn (Curl / Instant segmented;
Spread only) · Full screen (one button) · one muted help line:
`← → turn · C contents · F focus · B save · / search · ⌘-scroll to zoom`.
Nothing else.

### Contents panel

As V3 (search; Stories / Pages / Saved; prev / next story footer), with:
- The **Stories** tab marks the current story with a 2px accent bar and shows
  `Cover story` as a kicker on that entry.
- Story rows show `Read online ↗` on hover when a URL is known.
- The **Pages** tab loads thumbnails around the current page first.

## Phone chrome

### Top bar — 48px + safe-area top, `nav[aria-label="Issue"]`

```
[← Archive]        Kevin Dowdell’s Boys        [☰]
```

- Left: back arrow + `Archive`. Center: the story title (`button.strip-story`,
  Garamond 16, one line, ellipsis; tap → Contents sheet at the story; for
  non-story locations `Cover` / `Front matter` / `Contents` / `Back cover`
  in Graphik 13 `--ink-2`). Right: Contents icon, `aria-label="Contents"`;
  the label appears at ≥ 420px.

### Bottom bar — 56px + safe-area bottom, `nav[aria-label="Reading controls"]`

```
[‹] [24] [›]        [Pages|Scroll]        [🔖] [⚙]
```

- Page group: `Previous page`, `input[aria-label="Go to page"]`, `Next page`.
  In Scroll the arrows scroll to the previous / next page top.
- View: `div[role=group][aria-label="View"]`, buttons `Pages`, `Scroll`.
- Save page, Reading settings (sheet).
- A `button.zoom-fit` chip (`Fit`) floats above the bar at the right while
  zoomed in Pages; tap resets. Not shown in Scroll (double-tap toggles there).

### Behavior

- **Pages:** bars start visible on entry and hide on the first reading
  gesture. Tap center toggles both bars; edge taps turn at Fit; swipe turns;
  when zoomed, a swipe that begins at the edge turns (V3.1 rules); double-tap
  zooms 2× / back; pinch zooms with live preview. Bar-driven turns keep the
  bars.
- **Scroll:** bars hide after 24px of downward scroll and return on any
  upward scroll or a tap. No edge-tap turning. Double-tap and pinch zoom.
  The continuous surface has top padding equal to the top bar and bottom
  padding equal to the bottom bar so nothing ends beneath a bar.
- Bars are opaque (`--surface`, 1px `--rule-soft`), overlay the desk, and
  are `inert` + `aria-hidden` exactly when not visible — never visible and
  unclickable.
- The visually hidden `Show reading controls` button remains for keyboard
  and screen-reader users.

### Sheets

Contents and Settings open as bottom sheets (V3). Settings on phone:
Appearance · Page turn (Pages only) · Full screen · help line
(`Tap the edges to turn, the center for controls. Pinch or double-tap to zoom.`).

## Story layer (API contract)

`app/reader/story-model.ts` gains:

```ts
export type Location = {
  kind: 'cover' | 'front' | 'contents' | 'story' | 'back';
  label: string;                 // "Kevin Dowdell’s Boys" | "Cover" | "Front matter" | "Contents" | "Back cover"
  index: number;                 // index into issue.contents, or -1
  story?: ContentsEntry;
  start: number;                 // first physical page of this location
  end: number;                   // last physical page of this location
  pageInLocation: number;        // 1-based
  pages: number;                 // end - start + 1
  previous?: ContentsEntry;      // neighbor stories by reading order
  next?: ContentsEntry;
};
export function locate(issue: ReadableIssue, page: number): Location;
export function storyUrl(issue: ReadableIssue, entry: ContentsEntry, issueData?: { coverStories: { title: string; url: string }[] }): string | undefined;
export function resumeLabel(issue: ReadableIssue, page: number): { title: string; author?: string; pageLabel: string };
```

- A story runs from its start page to the page before the next story's start
  (or to the last page before back matter). Ads inside that range belong to
  the story; we do not try to detect ads.
- `front` covers pages after the cover and before the first story, except the
  printed contents page(s) which are `contents`.
- `storyUrl` matches by normalized title against the issue's `coverStories`;
  a later data job may add `url` to catalog entries, and `storyUrl` prefers
  that field when present.

`app/reader/place.ts`: `ReaderPreferences` gains `viewDesktop` and
`viewPhone` (`'spread' | 'scroll'`, defaults `'spread'` and `'scroll'`);
`normalizePlace` maps `mode: 'page'` and `'column'` to `'scroll'` / `'spread'`
respectively. `ReadingMode` narrows to `'spread' | 'scroll'`.

## Front door and shelf

The archive becomes a **shelf** whose first impression is the current issue.

- **Masthead** as V3 (wordmark, theme toggle, 1px rule).
- **Hero** — the latest readable issue: cover left (large, `--shadow-page`,
  no tilt), copy right: kicker `CURRENT ISSUE · September 2026`, cover-story
  title (Garamond display), byline, dek, actions `Read the issue` (primary
  red) / `Contents` / `On TheAtlantic.com ↗`. If the reader has a place in
  this issue, the primary reads `Continue · {story title}`. Phone: cover on
  top, copy below, actions in a row.
- **Resume band** — kept and story-titled (`Continue reading · Kevin
  Dowdell’s Boys · September 2026`). Hidden when the last-read issue is the
  hero, since the hero already says Continue.
- **Filter row** — search, year, sort, as V3.
- **Grid** — as V3. Card CTA reads `Continue · {story title}` when a place
  exists.
- **Splash** (cover click) — as V3.
- **End of issue** — `app/reader/EndOfIssue.tsx`: a centered card shown when
  the reader reaches the back cover (Spread) or scrolls to the end (Scroll):
  `End of the September issue` · next issue cover · `Next: August 2026 →` ·
  `Back to the shelf`. Props: `{ issue, next?: { id, issue, cover }, onNext,
  onShelf }`. The Reader mounts it; the archive supplies `onNext` by opening
  the next issue at page 1.
- **About** — route `#/about`, a quiet page reachable from the archive footer
  (`About this edition`) and the Settings help line (`About`): the thesis in
  one paragraph, the four principles, what was removed and why, provenance
  and rights note, keyboard reference. Garamond body, Graphik UI, 640px
  measure.

## Engine

- **First page fast.** `getDocument` uses range transport against the
  linearized PDFs (`rangeChunkSize: 262144`, keep `disableAutoFetch: false`
  so later pages arrive in the background). Confirm in the network panel
  that the first paint needs only the first chunks. Keep the cover JPEG on
  screen until the first canvas paints. Target: first page painted < 1s on
  a 50 Mbps connection for a 16 MB issue; measure before and after and
  record both in `PERFORMANCE-AUDIT.md`.
- **Warm the next issue's cover** when the End-of-issue card appears.
- **Smoke test.** Playwright (`@playwright/test`, Chromium only), run with
  `npm run test:e2e` against `vite preview` of `dist-pages`, and in CI after
  the build. It exercises the loop on desktop 1440×900 and phone 393×852:
  open archive → hero present → open reader by hash → first canvas painted
  within 8s → `ArrowRight` changes the hash → `c` opens Contents → click a
  story → hash changes → `Escape` closes to archive; phone: bars visible on
  entry, tap center hides them, tap again shows them, `Scroll` toggle mounts
  `.continuous-pages`. Selectors use the aria contract in this document.

## Test contract (selectors the smoke test relies on)

Desktop: `nav[aria-label="Reader"]`, `[role=group][aria-label="View"] button`
with text `Spread` / `Scroll`, `[role=group][aria-label="Zoom"]`,
`input[aria-label="Go to page"]`, `button[aria-label="Previous story"]`,
`button[aria-label="Next story"]`, `button[aria-label="Previous page"]`,
`button[aria-label="Next page"]`, `button[aria-label="Contents"]`,
`button[aria-label="Reading settings"]`, `button[aria-label="Focus"]`,
`button[aria-label="Save page"]`, `.story-strip`, `.reader-navigation`,
`.continuous-pages`, `.leaf-canvas canvas`.

Phone: `nav[aria-label="Issue"]`, `nav[aria-label="Reading controls"]`,
`[role=group][aria-label="View"] button` with text `Pages` / `Scroll`,
`input[aria-label="Go to page"]`.

Routes are unchanged: `#/`, `#/{id}`, `#/{id}/read`, `#/{id}/read/p{n}`,
plus `#/about`.

## Build plan

Four branches built in parallel from `main`, merged in this order by the
session owner with a visual review at 1440, 1100, 900 and 393 wide:

1. **`v4/story`** — story layer API, preferences/view migration, Contents
   panel changes, tests. Files: `story-model.ts`, `place.ts`, `model.ts` (if
   needed), `Navigation.tsx`, the Contents block of `reader-v3.css`,
   `scripts/reader-story.test.mjs`. Does not touch `Reader.tsx` or `page.tsx`.
2. **`v4/reader`** — the reader chrome and interaction revamp above, the
   removals, `EndOfIssue` mounting. Files: `Reader.tsx`,
   `useReadingControls.ts`, `reading-controls.ts`, `reader-v3.css` (all
   blocks except Contents), removal of Article files. Codes against the
   story-layer API in this document.
3. **`v4/shelf`** — hero, resume band, grid CTA, `EndOfIssue.tsx`, About
   route and page. Files: `page.tsx`, `globals.css`, `routes.ts`,
   `EndOfIssue.tsx`, `About.tsx`.
4. **`v4/engine`** — range loading, first-paint measurement, Playwright
   smoke test and CI job. Files: `pdf.ts`, `Reader.tsx` loading options only
   (a two-line change, applied last), `scripts/e2e/*`, `playwright.config.ts`,
   `package.json`, `.github/workflows/pages.yml`, `PERFORMANCE-AUDIT.md`.

Then a friction week: read one issue a day on both surfaces, log, fix only
what the log says, and delete what it never touched.

## Not in V4

Tablet layouts. Ad detection. Cross-archive full-text search. Offline.
Annotations, stats, sharing UI beyond the URL. Reflowed article text.
