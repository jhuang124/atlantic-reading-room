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
    if (
      i - begin <= 10 &&
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
  return xs.slice(0, -1).map((x, i) => ({
    x: Math.max(0, x - 0.008),
    width: xs[i + 1] - x + 0.016,
    y: Math.max(
      0,
      Math.min(
        ...body
          .filter((w) => w.x >= x - 0.01 && w.x < xs[i + 1])
          .map((w) => w.y),
        1,
      ) - 0.025,
    ),
  }));
}
