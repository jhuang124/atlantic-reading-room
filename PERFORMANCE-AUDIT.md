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
