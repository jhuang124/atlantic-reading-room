import type { Word } from './model';
export type Column = { x: number; width: number; y: number };
export function pageColumns(words: Word[]): Column[] {
  const candidates = words.filter(
    (w) => w.y > 0.14 && w.y < 0.89 && w.h < 0.035 && w.w < 0.2,
  );
  if (candidates.length < 60) return [{ x: 0.07, width: 0.86, y: 0 }];
  // A full-width headline or image caption must not bridge the prose gutters.
  const heights = new Map<number, number>();
  for (const word of candidates) {
    const height = Math.round(word.h * 1000);
    heights.set(height, (heights.get(height) || 0) + 1);
  }
  const dominant = [...heights].sort((a, b) => b[1] - a[1])[0][0] / 1000;
  const prose = candidates.filter((w) => Math.abs(w.h - dominant) <= 0.0015);
  const body = prose.length >= 60 ? prose : candidates;
  const counts = Array.from(
    { length: 100 },
    (_, i) => body.filter((w) => w.x < i / 100 && w.x + w.w > i / 100).length,
  );
  const boundaries: number[] = [];
  for (let i = 18; i < 83; i++) {
    if (counts[i] > 2) continue;
    const begin = i;
    while (i < 83 && counts[i] <= 2) i++;
    const middle = (begin + i - 1) / 2;
    // A gutter is at least 2% of the page. It may be far wider: a picture or
    // pull quote set between two columns leaves a gap of a fifth of the page.
    if (
      i - begin <= 30 &&
      i - begin >= 2 &&
      body.some((w) => w.x < middle / 100 - 0.08) &&
      body.some((w) => w.x > middle / 100 + 0.08)
    )
      boundaries.push(middle / 100);
  }
  const xs = [
    Math.max(0.02, Math.min(...body.map((w) => w.x)) - 0.018),
    ...boundaries,
    Math.min(0.98, Math.max(...body.map((w) => w.x + w.w)) + 0.018),
  ];
  return xs.slice(0, -1).map((x, i) => {
    const inside = body.filter((w) => w.x >= x - 0.01 && w.x < xs[i + 1]);
    // Each column is as wide as its own words, not as the space between
    // boundaries, so a wide gap never pads the column that borders it.
    const left = inside.length ? Math.min(...inside.map((w) => w.x)) : x;
    const right = inside.length
      ? Math.max(...inside.map((w) => w.x + w.w))
      : xs[i + 1];
    return {
      x: Math.max(0, left - 0.012),
      width: Math.min(1, right + 0.012) - Math.max(0, left - 0.012),
      y: Math.max(0, Math.min(...inside.map((w) => w.y), 1) - 0.025),
    };
  });
}

/** Smart zoom: the magnification that fits the prose column under a point to
 * `target` pixels, and that column's left edge as a fraction of the page.
 * `fx` is the point's x as a fraction of the page; `pageWidth` is the page's
 * rendered width at Fit. Null when the page has no column worth fitting (art,
 * ads, a single wide measure), where a plain 2× at the point serves better. */
export function columnFit(
  words: Word[] | undefined,
  fx: number,
  pageWidth: number,
  target: number,
  maxZoom = 4,
): { zoom: number; x: number; width: number } | null {
  if (!words?.length || pageWidth <= 0 || target <= 0) return null;
  const columns = pageColumns(words);
  const column =
    columns.find((c) => fx >= c.x && fx <= c.x + c.width) ??
    [...columns].sort(
      (a, b) =>
        Math.abs(a.x + a.width / 2 - fx) - Math.abs(b.x + b.width / 2 - fx),
    )[0];
  if (!column || column.width <= 0) return null;
  const zoom = Math.min(maxZoom, target / (column.width * pageWidth));
  // Under 1.5× the text barely grows; the caller's 2× is the better answer.
  if (zoom < 1.5) return null;
  return { zoom, x: column.x, width: column.width };
}
