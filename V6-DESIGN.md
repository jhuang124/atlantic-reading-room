# The Print Edition — V6 design

November 10, 2026. Branch `v6` (local only; `main` publishes to public Pages).
Builds on V5: `v5-shelf` plus the half-built `v5-reader`, merged.

## What the evaluation found

Walked every surface at 1440×900 and 375×812, then read the gesture and layout
code behind each one.

**V5 holds up.** The night stage, the single type and spacing scale, the year
shelves, the story strip and the engine underneath (curl, pinch, saved places,
routes) are sound. The unreviewed reader CSS on `v5-reader` was mostly right.
None of that gets redone.

**What doesn't hold up** is the part V5 never looked at: what it is like to
use. Ranked by how much it costs a reader.

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| 1 | Body text renders at about 6px on a phone in both views. Reading means pinching on every page, and double-tap is a blind 2× that lands between columns. | Reader, phone | Blocks reading |
| 2 | The issue page is a toll booth. It costs a tap and shows nothing the shelf didn't: one headline and a Read button. Its pager reads `1 / 71`. | Issue page | High |
| 3 | Search filters covers but never says why one matched. Search an author, get a cover, open it, land on an unrelated cover story. | Shelf | High |
| 4 | The phone's thumb zone goes to Pages/Scroll, a choice people make once. Contents, used constantly, sits in the far top corner. The web edition of a story, the comfortable way to read a long piece on a phone, is two taps deep inside Contents. | Reader, phone | High |
| 5 | Caps labels sit at 3.5:1 contrast and the focus ring on night surfaces at 3:1. The phone status bar is ivory over a charcoal masthead. The year rail hides three of seven years on a phone with no cue. | Everywhere | Medium |
| 6 | Settings ends in a run-on line of shortcuts; the shelf masthead carries a fullscreen button nobody needs there. | Reader, shelf | Low |

## Plan

1. **Smart zoom.** Double-tap (or double-click) fits the column under the
   finger to the screen width, using the word positions already in each
   issue's index. Double-tap again returns to Fit. Pages without columns fall
   back to 2×.
2. **Issue page becomes the table of contents.** Cover on the left; on the
   right the cover story, the primary action, then every story by section with
   its page number, each opening the reader at that story. The pager names the
   neighbouring issues instead of counting them.
3. **Search finds stories.** Each matching issue lists the stories that
   matched, and each is a direct link into the reader at that story.
4. **Phone bars re-planned for the thumb.** Bottom bar: Contents, previous,
   page, next, Save, Settings. Pages/Scroll moves into Settings. The top bar
   keeps Archive and the story title and gains "Read online" when the story
   has a web edition.
5. **Accessibility and finish sweep.** A brighter focus ring on night
   surfaces, label contrast to 4.5:1, status-bar colour that follows the
   surface, a fade cue on the phone year rail, the masthead fullscreen button
   removed.
6. **Settings cleanup.** Shortcuts as a readable list; gesture help that
   mentions smart zoom.
7. **Verify.** Typecheck, unit tests, end-to-end tests, Pages build, then
   desktop and phone walk-throughs of every surface.

## Not doing

- A reflowed text edition of every story. That is an editorial-data project.
- Bringing back Column view or a next-column control (removed September 10 at
  John's direction). Smart zoom is a zoom, not a view.
- Pushing `main`.

## What shipped

All seven steps, on branch `v6`. Typecheck, 73 unit tests, the Pages build
and 15 end-to-end tests (desktop and phone) pass.

- **Smart zoom** fits a column on 97% of prose pages across a 12-issue
  sample (820 of 849). The column detector had to learn two things on the
  way: gutters can be a fifth of the page wide, and a column is as wide as
  its words, not as the space between boundaries.
- **Two bugs smart zoom flushed out**, both in phone Scroll view and both
  older than this work. A real double-tap fired twice (the gesture layer,
  then the browser's own double-click), so the zoom switched on and straight
  back off. And a magnified page widened the whole document, which stretched
  the fixed bars off-screen and stopped the page landing where it was aimed.
  Sideways panning now lives inside the page area; the document only scrolls
  down. A real-touch end-to-end test covers both.
- **Issue page**: cover pinned left, contents scrolling right, the saved
  place marked `Continue`, neighbouring issues named.
- **Search**: stories first, the match underlined, one click into the reader
  at that story.
- **Phone bars**: Contents, page `n / N`, Save and Settings under the thumb;
  Pages/Scroll in Settings; a `Web` link in the top bar when the story has a
  web edition.
- **Finish**: contrast tokens, night focus ring, browser chrome colour, year
  rail fade and follow, masthead fullscreen removed, shortcuts as a list.

## Independent review

A second reviewer read the diff cold. Six of its seven findings were real and
are fixed: issue-page sections with repeated names shared a React key; paging
to another issue kept the old scroll position; one stray word could stretch a
column into its neighbour (24 of 337 pages sampled, now 0 of 780); phone
Pages over-zoomed by about 4%; the phone bar crowded below 380px; and on
desktop a double-click could miss its way back to Fit while magnified. The
seventh (browser chrome colour in light theme) was a misread: the reader desk
is night in both themes.

One thing it surfaced that is by design: on desktop, double-clicking *text*
selects the word, so smart zoom there starts from a margin or gutter. On a
phone it works anywhere on the column.

## Left for a later pass

- Dark-mode users see a 180ms fade from light on first load (the theme is
  read after first render and the surfaces animate their colour).
- Smart zoom gets you into a column; getting to the *next* column is still a
  pan. That is the gap Column view used to fill.
- The linter reported about two dozen errors before this work (hook
  dependency lists, `<img>` rules); they are untouched.
