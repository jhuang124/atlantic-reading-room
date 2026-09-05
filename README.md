# The Print Edition — V2

An Atlantic magazine archive and reader: 71 complete issues from January/February 2020 through September 2026.

[Open the demo](https://jhuang124.github.io/atlantic-reading-room/)

## Experience

- A cover index with dates, story/author search, and year/sort controls. Every issue is readable; Continue restores the last reading place.
- Charcoal, white, and Atlantic-red issue splashes with an animated cover transition. Read and Contents remain within reach on phones. Returning preserves archive filters and scroll.
- One reader for Print and selected Article views, with previous/next story navigation and a compact left-hand Contents panel for Stories, Pages, and Saved, with unified story/page search.
- Page thumbnails and search results jump directly to the requested print page. Multiple detours retain the original return destination.
- Responsive fitted spreads and single pages, page-width and column reading, pointer-anchored pinch zoom, panning, and a classic page curl with the correct reverse face.
- Focus fills the viewport without cropping a fitted page. Controls overlay the reading surface without changing its geometry.
- Saved page, zoom, print offsets, article scroll, and text preferences. Reduced motion and Instant mode skip the curl.

Article view is available for three prepared pieces: **The Blue Book Is Back**, **Look Closer: September 2026**, and **Look Closer: August 2026**. Other stories remain available in their original print layouts. The 3D room has been removed; Three.js is used only for the reader's page curl.

Keyboard: arrows turn pages; C opens Contents; / opens Search; B saves; F toggles Focus; +/- zoom; Home/End jump; Escape closes the active overlay first.

## Design and sources

The visual system adapts the Atlantic WWW kit's wordmark, Atlantic Condensed headings, Adobe Garamond, Graphik, warm white, thin black rules, and restrained red. The local kit derives from `theatlantic/frontend` at `6bff7379`; this independent prototype is not a claim of current production parity. Fonts load from official Atlantic URLs. See [COVER-SOURCES.md](COVER-SOURCES.md) for cover provenance.

The 71 full PDFs were obtained from the Atlantic subscriber library, at `cdn.theatlantic.com/media/magazine/pdfs/YYYYMM.pdf`. Their thumbnails, indexes, selected article text, and PDF.js support assets are included for the user-authorized public demo.

## Run and verify

```sh
npm ci
npm run dev:pages
npx tsc --noEmit
node --test scripts/reader-*.test.mjs
npm run build:pages
```

The 35 targeted tests cover physical-page sequence, printed folios, curl reverse faces, geometry, and tight-fold resolution, pinch bounds, saved-place migration, columns, article extraction, every curated story destination, and completeness of published assets, plus shared-raster lifecycle, PDF pixel equivalence, cached search equivalence, and preservation of the original curl mesh. Desktop and narrow layouts are checked in Chromium/in-app browsing. Safari verification is omitted at the user's request. Synthetic input does not establish subjective physical trackpad feel.

The repository-wide linter still flags inherited prototype/template patterns, including Next image rules and imperative renderer hook rules; it is not a passing gate.

## Publishing

Pushing `main` triggers `.github/workflows/pages.yml`, which runs TypeScript and reader regression checks, builds the static Vite application to `dist-pages/` and publishes with GitHub Pages. All paths are relative so the reader works under `/atlantic-reading-room/`. No server or account is needed; reading state is saved in that browser's local storage.

`python3 scripts/prepare-reader-assets.py` rebuilds thumbnails, word positions, and PDF.js assets (requires Poppler). `python3 scripts/prepare-articles.py` rebuilds selected article text. `node scripts/check-pdf-rendering.mjs` checks sample PDF rendering.

## Archive preparation

Original subscriber-library downloads remain untouched in ignored `work/archive-originals/`. Run `scripts/import-archive.py` with PyMuPDF and Poppler to extract covers, verified contents destinations, folio offsets, thumbnails, and gzip word indexes. `--catalog-only` refreshes metadata without touching PDFs. `scripts/compact-archive.py` compacts web PDFs with sampled pixel comparisons; `scripts/optimize-reader-data.py` compresses navigation thumbnails and search indexes. These steps keep the static publication below 1 GB. Only web image streams are reduced; vector print text remains sharp. Manual TOC exceptions are recorded in `app/reader/archive-overrides.json`.

The mobile refinement and research rationale are recorded in [UX-AUDIT.md](UX-AUDIT.md). Phone reading includes directly accessible column enlargement, a bottom settings sheet, and safe-area-aware controls. Article presentation appears only where prepared text exists.

Light mode is the default; the archive/splash theme button and reader Appearance settings share a persisted light/dark preference. Both themes preserve the original PDF artwork.

Performance measurements, implementation boundaries, and reproduction steps are in [PERFORMANCE-AUDIT.md](PERFORMANCE-AUDIT.md).

## Expo Go and continuous scrolling

The [mobile package](mobile/README.md) runs the reader in Expo Go on iOS and Android. Run `npm --prefix mobile ci` once, then `npm run mobile` and scan the QR code on the same Wi-Fi. In the reader, select **Reading settings → Page view → Scroll** for continuous vertical reading on mobile or desktop. Nearby pages render on demand; story jumps and saved reading positions work in this mode.
