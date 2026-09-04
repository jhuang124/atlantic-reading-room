# The Atlantic — The Reading Room

An interactive Three.js cover library, September 2021–September 2026. All 55 covers are served locally; each issue links to its official Atlantic archive page.

## Experience

- Six curved walnut display bays with modeled magazines, paper blocks, spines, and animated selection.
- Parquet floor, reading table, leather chairs, banker lamp, and warm architectural lighting.
- Afternoon/evening light, drag navigation, scroll zoom, fullscreen, and a slow guided tour.
- Searchable cover index, issue details, arrow-key navigation, and mobile detail layouts.
- Reduced-motion support and a cover-index fallback if WebGL cannot initialize.

## Run

```sh
npm install
npm run dev
```

## Validation

Production build and TypeScript checks pass. All 55 unique issue records have local image files and official Atlantic source URLs. The local route returned HTTP 200.

Browser visual and interaction testing was not run. The optional WebMCP tool is feature-detected; no supported WebMCP validation context was available, so its runtime contract is unverified.

See COVER-SOURCES.md for provenance. This is an independent interactive concept, not an official Atlantic product.

## GitHub Pages

Live site: https://jhuang124.github.io/atlantic-reading-room/

```sh
npm run dev:pages
npm run build:pages
npm run preview:pages
```

The static build uses the same reading-room components as the Sites version. Its output is `dist-pages/`, with relative asset paths that support GitHub project URLs. No server, database, or API keys are needed.

Pushing to `main` runs `.github/workflows/pages.yml`, builds the static site, and deploys it to GitHub Pages. The existing Sites build remains available through `npm run build`.
