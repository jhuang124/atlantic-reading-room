# Performance and code-quality pass

Scope: preserve the existing design, copy, controls, navigation, page geometry, PDF quality, and saved-reading behavior. Baseline: `7bf52fe`. Measured locally on September 5, 2026.

## Changes and evidence

| Area | Before | After |
| --- | --- | --- |
| Main CSS, minified | 153,853 bytes | 32,498 bytes (79% smaller) |
| Main CSS, gzip via Node | 26,207 bytes | 7,431 bytes (72% smaller) |
| Repeated full-issue search | 6.406 ms/query | 0.177 ms/query |
| CPU computation of one 80 × 48 curl mesh | 0.455 ms/frame | 0.256 ms/frame |
| Locked dependency graph | 720 package entries | 370 package entries |
| PDF raster ownership | Independent Leaf rendering plus two animation caches | One shared cache for visible pages, prefetch, and turns |

CPU numbers are medians of seven batches after warmup, using the same issue and query sequence. They measure these functions, not network latency, browser frame rate, GPU performance, or physical trackpad feel. Cold search still normalizes the index once. Checksums match before and after.

- Restrict Tailwind source discovery to application sources. The starter component library and unrelated files were generating unused utilities. No authored visual declarations changed; the production reader stylesheet has the same content hash as the baseline.
- Remove 60 unreachable starter UI components, their unused mobile hook and class-name helper, their generator config, and 14 direct dependencies (350 packages including transitive dependencies). Keep the existing Vite, Vinext, and hosting configurations intact.
- Extract `Leaf.tsx`, `pdf.ts`, and `page-raster.ts` from the large reader/animation modules. The cache deduplicates in-flight and completed work, includes width and display density in the key, evicts least recently used rasters at 12 pages or 64 MiB, and cancels active rendering when an issue closes. The memory limit covers retained cached raster pixels, not active canvases, PDF.js internals, or GPU textures.
- Warm neighboring pages sequentially, forward pages first; stop remaining speculative work when the spread or zoom changes. Visible consumers share any render already underway.
- Compute fold invariants once per frame and sampling bounds once per row instead of per vertex. Preserve all geometry, UVs, lighting, shadows, timing, and interaction behavior.
- Cache normalized issue text with a WeakMap and memoize navigation search results. Closing an issue allows its search data to be collected. Existing result order and snippets are unchanged.
- Remove the unreachable issue-chooser state. Allow the lazy PDF module loader to retry after a transient import failure, and prevent an unmounted page from starting a late text-layer render.
- Add `npm test`, `npm run typecheck`, and `npm run benchmark`. GitHub Pages now runs the first two before building and deploying.

## Verification

32 automated checks pass. New checks cover concurrent raster consumers, density and width changes, LRU/byte eviction, failed-render retry, cancellation on close, and cancellation of speculative warmup without interrupting a visible consumer. A real PDF page produces byte-identical PNGs through direct rendering and the shared cache at 360px and 720px. A recorded baseline digest verifies Float32 material coordinates, positions, and shading across 150,822 vertices, including nearly flat turns. Search results and snippets are compared against the original algorithm using a full issue.

Production build and TypeScript checks pass. Desktop browser checks cover issue entry, contents, search, story jumps, forward/backward turns, and dark focus mode. Narrow-screen checks cover fitted reading and column enlargement. Safari remains excluded at the user's request.

The repository-wide linter still reports inherited framework-specific and imperative-renderer rules; this pass does not claim a clean lint gate. The approximately 1 GB archive, font hosting, lazy PDF/Three.js bundles, and original PDFs remain unchanged. This pass does not claim the entire reader is fully optimized.

## Reproduce

```sh
npm run typecheck
npm test
npm run build:pages
npm run benchmark
```

For a baseline CPU comparison, export `app/reader/model.ts` and `app/reader/motion.ts` from `7bf52fe` into an ignored working directory and pass that directory to `node scripts/reader-performance.mjs`. The benchmark prints a checksum to detect output drift. Benchmark timings are informational rather than noisy CI thresholds; semantic and pixel-equivalence tests are the deployment gates.

# First page fast — September 13, 2026 (`v4/engine`)

Scope: V4 principle 5, "the cover is on screen in under a second". Only the
PDF transport (`app/reader/pdf.ts`, the `getDocument` options in
`Reader.tsx`) and the preview server's headers changed. Page geometry, the
raster cache, and the chrome are untouched.

## Method

`node scripts/e2e/first-paint.mjs <base-url> [--runs=3] [--throttle=Mbps,rtt] [--verbose]`

Headless Chromium (Playwright 1.63), a fresh browser context per run (cold
cache), 1440 × 900, navigating straight to `#/202609/read` (September 2026,
112 pages, 16.0 MB). An observer installed before the page loads records
`performance.now()` when the first `.leaf-canvas canvas` appears; the script
also lists every PDF request with its `Range` header and byte count. Throttled
runs use Chrome's network emulation (`Network.emulateNetworkConditions`), so
they shape bandwidth and latency at the browser but do not reproduce the CDN,
TLS, or HTTP/2 prioritization of the real host. Medians of three runs; the
spread within a configuration was under 60 ms unless noted.

The live site was measured the same way, unthrottled, from a fast home
connection. The 300 Mbps / 20 ms emulation of the local preview reproduces the
live "before" to within about 80 ms, which is what makes the local "after"
numbers worth reading.

## What was actually happening

- **PDF.js was already using range requests on the live host.** Before any
  change, opening an issue issued the full 16 MB streaming GET plus five to
  six range requests: the 45 KB tail (xref), then three or four 64 KB chunks
  around 14.5–14.9 MB, one after another. The first canvas waited on that
  serial chain, not on the download.
- **The local preview was not range-capable.** `vite preview` (sirv) answers
  `206` to a `Range` request but omits `Accept-Ranges: bytes` from a plain
  `200`, and PDF.js only switches to ranges when that header is present. So
  locally the whole file downloaded before the first paint, and any transport
  regression was invisible. `vite.pages.config.ts` now adds the header to
  preview responses, matching GitHub Pages; the smoke test runs against that.
- **The PDFs are not linearized.** 69 of 71 issues carry no linearization
  dictionary. The two that do (202512, 202609) were modified after
  linearization — an incremental update appending link annotations — so the
  dictionary's `/L` no longer equals the file size (`16027139` vs
  `16036012`), which both PDF.js and qpdf treat as "not linearized". The
  premise that PDF.js can paint page 1 from the first few hundred KB does not
  hold for the files as shipped.
- **Linearization would not fix first paint on its own.** A copy of 202609
  re-linearized with qpdf (via pikepdf, 0.8 s) opened in 2,153 ms at
  50 Mbps / 40 ms against 2,141 ms for the original. PDF.js still walks the
  page tree to the *last* page before it resolves the document
  (`checkLastPage`), and that lives at the tail of a linearized file too, so
  the serial chain is the same length: head, tail xref, page tree, last page.
- **At 50 Mbps most of the wait is not the PDF.** Under throttling the PDF
  request does not start until ~1.3 s: the archive shell downloads every cover
  thumbnail (three of them are ~1.1 MB PNGs: `202609.png`, `202602.png`,
  `202511.png`), the reader fetches the 920 KB `index.json.gz` alongside the
  PDF, and `pdf.mjs` and its worker load in series. Those keep competing with
  the PDF chunks after they start. All of that is outside this branch's files;
  see "Left for other branches".

## Results

First canvas, ms, median of three. "Chain" is the range-request sequence PDF.js
needed before it could render page 1.

| Configuration | localhost | 300 Mbps / 20 ms | 50 Mbps / 40 ms | Chain before first paint |
| --- | --- | --- | --- | --- |
| PDF.js defaults: 64 KiB chunks, stream on (before) | 758 | 1,168 | 2,141 | full GET + 5 serial range requests (0.29 MiB) |
| 256 KiB chunks, stream on | — | — | 2,161 | full GET + 4 range requests (0.79 MiB) |
| 512 KiB chunks, stream on | — | — | 2,490 | full GET + 4 range requests (1.79 MiB) |
| 256 KiB chunks, stream off | 740 | 970 | 1,933 | 6 range requests (1.30 MiB), no full GET |
| 512 KiB chunks, stream off | — | — | 2,170 | 6 range requests (2.80 MiB) |
| 1 MiB chunks, stream off | — | — | 2,506 | 6 range requests (5.30 MiB) |
| **256 KiB, stream off, worker prefetched (shipped)** | **691** | **958** | **1,924** | 6 range requests (1.30 MiB) |

Live site (`jhuang124.github.io/atlantic-reading-room`), unthrottled, before:
**1,243 ms** median (1,218–1,491 across two sessions of three runs). The live
"after" cannot be measured until this branch deploys; re-run
`node scripts/e2e/first-paint.mjs https://jhuang124.github.io/atlantic-reading-room --verbose`
afterward. From the emulation, expect roughly 0.95–1.05 s.

## What changed and why

`getDocument` now receives `rangeTransport` from `pdf.ts`:

- `disableStream: true`. With streaming on, PDF.js keeps the full-file GET
  running beside its range requests and the two halve each other's bandwidth
  on the critical path; the range requests for head bytes also duplicate what
  the stream is about to deliver. Turning the stream off saved ~200 ms at both
  300 Mbps and 50 Mbps and cost nothing on localhost. The rest of the issue
  still arrives in the background because
- `disableAutoFetch: false` (explicit; PDF.js had been forcing it on whenever
  a stream was live). Chunks are pulled one at a time once the visible pages
  are satisfied, and a page turn's own requests jump the queue. The trade: a
  whole issue now fills in ~61 requests over a few seconds instead of one
  0.5 s download on a fast link. Far page turns in the first seconds after
  opening can wait one or two round trips.
- `rangeChunkSize: 262144`. The first page needs about half a megabyte of the
  head; 256 KiB reaches it in two requests. Larger chunks overshoot on the
  tail-side requests (`checkLastPage`) and were slower at every speed.
- The worker script is fetched as soon as its URL is known (`loadPDF`), so it
  downloads while `pdf.mjs` is still arriving instead of after it. PDF.js's
  own worker request is then served from the HTTP cache. Worth ~50 ms on a
  fast link, less under contention; best effort, and a failed prefetch falls
  back to the normal load.

The cover JPEG placeholder behaviour was verified rather than changed:
`.leaf-preview` sits under `.leaf-canvas` at the same inset, so the cover stays
on screen until the canvas is drawn over it. The `reader-loading` card leaves
earlier, when the document proxy resolves, but the leaf preview covers that
gap; the smoke test asserts the card is gone once the first canvas exists.

## Against the target

- Fast connection: **met, narrowly** — 958 ms in the 300 Mbps / 20 ms
  emulation, 691 ms on localhost, against 1,168 and 758 before.
- 50 Mbps: **not met** — 1,924 ms, from 2,141. Transport options cannot close
  the gap: ~1.2 s is the shell before the PDF request starts and ~0.5 s is
  PDF.js's serial discovery chain, which linearization does not shorten.

## Left for other branches

- Stop downloading every cover thumbnail before the reader can start, and
  convert the three PNG covers to JPEG (`v4/shelf`, `page.tsx`).
- Fetch `index.json.gz` after the first canvas, not alongside the PDF
  (`Reader.tsx` loading effect, `v4/reader`).
- Re-linearize the issues as the *last* step of `prepare-reader-assets.py`
  (qpdf or pikepdf, under a second per issue). It does not move first paint
  today, but it is the precondition for any future gain from range transport
  and it is currently advertised but false.
- Preload `pdf.mjs` and the worker from the archive on hover or on the issue
  splash, so they are cached before the reader mounts.

## Reproduce

```sh
npm run build:pages
npx vite preview --config vite.pages.config.ts --port 5204 --strictPort &
node scripts/e2e/first-paint.mjs http://localhost:5204 --runs=3
node scripts/e2e/first-paint.mjs http://localhost:5204 --runs=3 --throttle=300,20
node scripts/e2e/first-paint.mjs http://localhost:5204 --runs=3 --throttle=50,40 --verbose
node scripts/e2e/first-paint.mjs https://jhuang124.github.io/atlantic-reading-room --runs=3
```
