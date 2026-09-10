# The Print Edition — V3 design

V3 is an interaction and visual redesign of the existing reader. It keeps the
engine (PDF.js rasters, shared raster cache, page-curl mesh, hash routes,
saved places, archive catalog) and replaces the chrome, the mobile
interaction model, and the visual language. September 2026.

## Why

V2 accreted through ~20 agent iterations. The result works but feels
undesigned:

- **Two palettes fight.** `reader.css` is the V1 reader (khaki desk
  `#e9e8e1`, green ink `#243128`, brown focus ring `#9a663c`, gold progress
  `#a98a51`), and `v2.css` + `themes.css` override it with the Atlantic
  warm-white / near-black / red system. 44 V1 selectors are unreachable.
  Radii are 0 in the toolbar, 5 on mobile buttons, 10 on the mobile bar, 16
  on sheets. UI type wanders between 11, 12 and 13px.
- **Chrome competes with the page.** Desktop always spends 128px on a header
  plus a footer. "Contents" appears in both. The footer holds seven controls
  of different importance at the same weight. Between 640 and 1100px the
  footer reflows twice; below 760 it becomes a 108px two-row grid.
- **Turning is fragile.** Desktop: footer arrows on the far right, 40×48
  corner hotspots, keys. Phone: swipe only works at Fit and zoom ≤ 1; once
  zoomed there is no turn control at all except Settings → "Next page".
  The mobile bar has no arrows.
- **Taps feel slow.** Every page tap waits 280ms to rule out a double-tap
  before chrome toggles.
- **The phone default is a 57,000px document.** Mobile opens in continuous
  Scroll with browser-owned scrolling. Pinch commits zoom on release and
  widens the document, so panning is a two-axis scroll of a very tall page.
- **Settings is a kitchen sink.** Appearance, Read as, This page (with
  Prev/Next), Page view (4 modes), Column, Zoom, Page turn, Screen space,
  Add to Home Screen instructions, Always show controls, help text.

## Principles

1. **The page is the product.** Chrome is quiet, single-layer, and never
   blocks a turn. Whatever the zoom or mode, the next page is one obvious
   gesture away.
2. **One mental model per device.** Desktop is a book on a desk: spreads,
   arrow keys, big edge arrows, corner drag. Phone is a paged reader in the
   Apple Books / Kindle tradition: one page per screen, swipe to turn, tap
   edges to turn, tap center for chrome, pinch to zoom, pan when zoomed.
3. **Instant.** No timers between a tap and its response. Double-tap zoom is
   detected without delaying single taps.
4. **One system.** One token set, one radius scale, one type scale, one
   shadow recipe, one icon size, one hit-target rule. Atlantic-derived:
   warm white, near-black ink, 1px black rules, restrained red, Atlantic
   Condensed for display, Garamond for editorial text, Graphik for UI.
5. **Remove before adding.** Every V2 control must justify its place in the
   loop: open → read → turn → find your place → leave.

## Tokens

```
--ink            #1a1a1a   light  |  #f0ede8  dark
--ink-2          #5c5955   muted text
--rule           #1a1a1a   hairlines on surfaces (Atlantic uses black rules)
--rule-soft      #d9d5ce   dividers inside panels
--surface        #faf9f6   chrome
--surface-2      #f1efea   hover / pressed / wells
--desk           #e2dfd8   behind pages (light); #141416 (dark)
--accent         #c91420   one red; used for primary action, kicker, focus
--radius-1       3px       controls, chips, inputs
--radius-2       10px      floating pills (edge arrows, toasts)
--radius-3       14px      sheets and popovers
--shadow-page    0 1px 2px #0003, 0 14px 32px #00000026
--shadow-float   0 2px 6px #0002, 0 12px 28px #0000001f
--ui-12 / --ui-13 / --ui-15     Graphik UI sizes
--kicker         11px, letter-spacing .14em, uppercase, Graphik
--display        Atlantic Condensed (splash and section titles)
--serif          AGaramondPro (story titles, editorial copy)
--hit            44px on touch, 36px on pointer
```

Dark theme keeps the same structure with inverted ink and a deeper desk.
Page artwork is never tinted.

## Desktop

**Layout.** One 52px top bar. No footer. The desk owns the rest.

```
[← Archive]   [Contents]          The Atlantic          Sept 2026 · 26–27 / 132   [🔖] [⚙] [⤢]
```

- Left group: Archive, Contents (opens the left panel).
- Center: wordmark.
- Right group: issue date + page indicator as one clickable "folio" (click →
  inline page-jump input, Enter to go), Save, Settings, Focus.
- Fit / zoom % lives inside the folio as a small chip that appears only when
  zoom ≠ 1 ("120% · Fit").
- The current story title moves to a **caption** under the spread: one
  Garamond line, centered, muted, clickable to open Contents at that story.
  It lives in the desk margin, not in a bar.
- **Edge arrows.** Two 44px circular buttons vertically centered at the
  left and right desk margins. Visible on hover of the desk; always visible
  when zoomed (they are the guaranteed turn control when the corner
  hotspots are off-screen). Disabled state at cover / last page.
- **Turn inputs kept:** arrow keys, corner drag, horizontal trackpad swipe
  at Fit, click on desk margin outside the page (left half = back, right
  half = forward).
- **Progress** is a 2px hairline at the very top of the bar, red on rule.
- **Focus (F)** hides the bar and caption. Moving the pointer to the top
  16px of the window or pressing F brings them back. The floating "•••"
  button goes away; the top-edge reveal replaces it.
- **Breakpoints.** 1100: drop the "Archive"/"Contents" labels to icons.
  760 with a pointer: same bar, folio drops the date. The two-row footer
  and the 108px grid are deleted.

**Contents panel.** Same information architecture (search, Stories, Pages,
Saved, prev/next story). Restyle: 360px, surface, 1px rule on the right,
section heads in kicker style, current story marked with a 2px red bar on
the left instead of a background tint. Pages grid gets a 3-column thumbnail
layout with the current page outlined in ink.

**Settings.** Popover under the gear. Sections: Appearance (Light/Dark
segmented), View (Fit / Page width / Scroll segmented), Page turn (Curl /
Instant segmented), Zoom (− 100% +). Keyboard help as a single muted line.
"Always show controls" and Column move out (see Removals).

## Phone

**Default: paged, one page, Fit.** Opening an issue on a phone shows the
cover fitted to the screen with no chrome. The reader owns scrolling (fixed
element with a scroll container), not the browser document.

**Gestures.**

| Gesture | Result |
| --- | --- |
| Swipe left / right | Turn page (any zoom, any mode except Scroll). When zoomed, a horizontal pan that is already at the page edge in the swipe direction turns instead of panning. |
| Tap left / right 22% of the screen | Turn page. Works at any zoom. |
| Tap center | Toggle chrome, immediately. |
| Double-tap | Zoom to 2× at the point, or back to Fit. Detected by a second tap within 280ms; the chrome toggle from the first tap is cancelled before its 90ms transition delay elapses, so nothing flashes. |
| Pinch | Zoom, live preview, committed on release (kept from V2). |
| Drag when zoomed | Pan. Swipe-through at edges turns. |
| Hardware Back (Expo) | Escape → close overlay, else close reader (kept). |

**Chrome.** Two thin layers, both overlaying the page, both hidden by
default:

- Top: 44px translucent bar with `← Archive`, issue date, `Contents`.
- Bottom: 56px translucent bar with `‹ prev`, page scrubber, `next ›`,
  Save, Settings. The scrubber is a slim range slider with the page label
  above the thumb; it is the mobile equivalent of the folio input.

Chrome hides on any turn, pan, or pinch. There is no auto-hide timer and no
"Always show controls" toggle; taps are the only reveal path (plus the
existing screen-reader access button).

**Zoom.** Kept: pinch preview + commit. Fixed: zoom is preserved across a
turn, and the new page opens at the leading edge in the direction of travel
(reading a zoomed column across a spread continues naturally). Double-tap
toggles 1 ↔ 2. Fit resets everything.

**Scroll view** remains available from Settings for people who want a
vertical stream. It is no longer the default. Page width view is folded
into Fit on phones (they are the same width in single-page mode).

**Article view** (three prepared stories) is reached from the caption
("Read as article") on desktop and from the bottom bar's overflow on
phones; it keeps the text-size control.

**Sheets.** Contents and Settings open as bottom sheets with a grab handle,
`--radius-3` top corners, `--shadow-float`. Sheet enters in 220ms with a
standard ease-out; scrim fades. Escape / Back / scrim tap closes.

## Archive and splash

- Masthead: keep the wordmark-centered bar, tighten to 60px, black 1px
  rule below (Atlantic signature), theme toggle only. Fullscreen moves
  into the reader.
- Filter row: search on the left with 1px ink border and 3px radius; year
  and sort as plain text menus. Single row at all widths ≥ 640; stacked
  below.
- Continue-reading band: keep; restyle as a card with a 2px red progress
  hairline and the story title, not "Page 26".
- Grid: covers with `--shadow-page` at rest, lift on hover; card meta is
  Garamond date + kicker "Read issue →" only. Remove the second CTA row.
- Splash: keep the composition (cover left, copy right). Cover gets a
  uniform tilt-free presentation with `--shadow-page`. Primary red button,
  secondary text button. Phone splash: full-bleed cover, copy and buttons
  pinned bottom over a gradient.
- Fix: the autofocused Back button shows a focus ring on load. Use
  `focus-visible` semantics with a pointer heuristic so programmatic focus
  on entry does not draw a ring.

## Motion

- Chrome fades 140ms; sheets 220ms ease-out; page curl unchanged; instant
  mode unchanged; reduced-motion disables everything (kept).
- Cover → splash view transition kept.
- Toasts: bottom-center pill, 1.8s.

## Removals

- V1 `reader.css` dead rules (44 selectors) and the V1 palette.
- Desktop footer and its 640/760/1100 reflows.
- Floating "•••" focus-access button (replaced by top-edge reveal).
- "Always show controls" preference (desktop and phone).
- "Screen space" fieldset (fullscreen moves to the top bar; Add to Home
  Screen instructions are removed from the reader).
- Column view UI. The column detector stays in the codebase for search
  and double-tap targeting, but the mode, its floating navigator and its
  settings buttons are removed. Rationale: heuristic column detection is
  the wrong way to read a magazine page on a phone; pinch and double-tap
  do it better and predictably.
- "This page" fieldset (Prev/Next inside Settings).
- Duplicate Contents entry point in the footer.

## Kept as-is

Routes, saved places, bookmarks, search, story model, PDF and raster
pipeline, page-curl mesh, Expo wrapper contract (Escape from hardware
Back), 50 tests, GitHub Pages workflow.

## Build order

1. Tokens and CSS consolidation. New `reader-v3.css` replaces `reader.css`,
   `v2.css`, `mobile-reader.css`; `themes.css` shrinks to token swaps.
   Archive `globals.css` re-pointed at the same tokens.
2. Desktop chrome: top bar, folio, caption, edge arrows, top-edge reveal.
3. Phone interaction model: paged default, tap zones, immediate chrome
   toggle, zoomed swipe-through, top/bottom bars, scrubber.
4. Contents panel, sheets, settings popover restyle and simplification.
5. Archive and splash polish; focus-ring fix.
6. Verify: `tsc`, tests, desktop at 1440/1100/900/700, phone at 393×852
   light and dark, Expo Escape path. Push to `main`.

## Review revisions (Codex, gpt-6, September 9 2026)

The plan above was reviewed read-only by Codex before implementation. The
review approved the visual direction and the desktop simplification and
rejected parts of the phone gesture contract. These revisions supersede the
matching sections above.

- **Taps use one gesture layer with a short double-tap window.** A single
  tap resolves after ~230ms; the "instant toggle cancelled at 90ms" idea is
  impossible because a second tap at 200ms cannot undo a reveal that has
  already started. Center tap toggles chrome. Edge taps turn the page only
  at Fit (zoom 1); while zoomed, turning uses the bar arrows and deliberate
  boundary swipes, never edge zones.
- **Boundary swipe must start at the boundary.** A pan that reaches the
  edge never becomes a turn. The gesture must begin with the page already
  at the edge in the swipe direction, lock horizontal (|dx| > 1.5·|dy|),
  travel 70px, not be a pinch, and latch to one turn per gesture. Forward
  lands the next page at top-left; backward lands at top-right. Zoom is
  preserved. Turns while zoomed are instant (no curl).
- **Chrome stays visible after control-driven turns**, and hides on the
  next reading gesture. First entry shows controls; the first gesture hides
  them.
- **No scrubber.** The exact page input stays in the bottom bar between
  the arrows; a 132-page track on a phone is not precise enough.
- **Column view stays.** It exists because dense print columns are hard to
  read on a phone; pinch and double-tap do not yet prove better. It is
  restyled, not removed.
- **"Always show controls" stays on phones.** Desktop drops it because the
  bar is always visible outside Focus.
- **Install help stays** (collapsed under Settings → Screen) since the
  paged default no longer relies on browser toolbar collapse.
- **Desktop caption is budgeted** in the fit calculation, arrows live
  outside the scroll surface, there is no desk-margin click turning, and
  Fit is a sibling control shown whenever the view is not fitted, not part
  of the folio.
- **Focus and full screen are different actions.** Focus (F) hides chrome;
  full screen is a Settings action.
- **Phone splash keeps its composition** (cover, then copy, then a
  separate safe-area-aware action strip). No text-over-gradient.
- **Font token points at the registered family** `'Atlantic Serif'`.
- **Dark theme uses a lighter accent** for small red text.
- **Legacy CSS is replaced, then deleted**, after migrating page geometry,
  text-layer transforms, selection, Article layout, safe areas and
  document-scroll rules.
- **Tests change on purpose**: delayed-tap tests are rewritten for the new
  gesture layer; Column persistence tests stay.

## Post-ship revisions (John, September 10 2026)

- **Column view is removed** after all. John's call after using V3: the
  heuristic column reader was part of what felt janky on a phone. The
  detector (`columns.ts`) stays for search and tests; saved Column places
  migrate to Fit with zoom and offsets reset.
- **Zoomed turns keep their framing and their animation.** The first V3
  build made every zoomed turn instant and landed it at a hard-coded
  corner, which read as a jump. Now desktops curl at any zoom and keep the
  same scroll offsets across the turn, so the reader sees the same region
  of the next spread. Phones slide the visible region out and the next page
  in (a View Transition on the scroll port, 280ms), landing top-left going
  forward and bottom-right going back.
- **Phone bars are opaque.** The blurred glass bars sat over a canvas-heavy
  scroll and cost frames in Scroll view.

## Risks

- Reader.tsx is 1,850 lines with mode logic threaded through. Column
  removal touches `chooseMode`, `leafWidth`, restore and persistence; saved
  places with `mode: 'column'` must degrade to `spread`.
- Tap-zone turning conflicts with text selection on the text layer; edge
  zones ignore taps that land on a `.textLayer span` with a selection.
- Swipe-through at zoom relies on scroll position at touchstart; iOS
  momentum scrolling can leave `scrollLeft` a few px from the edge. Use a
  6px tolerance.
