# The Print Edition — V7 design

November 10, 2026. Branch `v7`. Builds on V6.

## Why

John's verdict on V6: not an ambitious redesign, no fundamentally different
creative decisions. He was right. V6 was a usability pass: it kept the three
screens it was given (a wall of covers, an issue page, a reader) and made each
one easier to use. It never asked whether a wall of covers is the right front
door.

## The decision

**The archive's unit is the story, not the issue.** Seventy-one covers is a
shelf. 1,133 stories by 408 writers is a magazine. The front door now opens on
stories, shown the way the magazine itself opens them: each feature's real
first spread, rendered from the print pages. Issues are one lens among three.

## What changed

- **Lead.** The current issue's cover story as an open magazine: its own
  opening spread, lit on the night stage, with the headline beside it. The
  cover steps back to a small "From the issue" link.
- **Lenses.** `Today`, `Writers`, `Issues`, each with its own address
  (`#/`, `#/writers`, `#/issues`). Search answers over all three.
- **Today.** The other features in the current issue as spreads. *Novembers
  past*: one feature from this calendar month in each earlier year, the year
  set as a numeral; it changes daily and by month. Criticism and dispatches
  set in type. The ten most-published writers. Recent covers. A button that
  pulls a feature at random from the 342 in the archive.
- **Writers.** Everyone with two or more pieces, by surname, under the dozen
  who have written the most. A name leads to every story of theirs.
- **Issues.** The year shelves from V5, unchanged.
- **Art.** 681 opening pages for 342 features, 520px wide WebP, 18MB, made by
  `scripts/prepare-openers.mjs` from the PDFs. Criticism, dispatches and the
  front and back of the book are set in type and have no art.

The look stays Atlantic: Garamond, Atlantic Condensed, Logic Monospace,
Graphik, the night stage, red only where it points. The ambition is in what
the page is made of, not in a new palette.

## Verified

Typecheck, 79 unit tests, the Pages build and 19 end-to-end tests (desktop and
phone) pass. A unit test checks that every piece of art the front page can ask
for is on disk.

## Not done

- **Guided reading** (one tap moves column to column) and a **visual table of
  contents on the issue page** were the other two directions John picked. He
  asked for one idea finished; these are next.
- The site is 971MB with the new art; GitHub Pages' soft limit is 1GB. The
  next batch of issues will need the PDFs or thumbnails slimmed.
- Culture & Critics pieces often open on an illustrated page too. Giving them
  art would add roughly 7MB.
