export type Word = { t: string; x: number; y: number; w: number; h: number };
export type IndexedPage = {
  page: number;
  width: number;
  height: number;
  text: string;
  words: Word[];
};
export const clampPage = (page: number, count: number) =>
  Math.max(1, Math.min(count, Number.isFinite(page) ? Math.round(page) : 1));
export function spreadPages(
  page: number,
  count: number,
  spread: boolean,
): number[] {
  const p = clampPage(page, count);
  if (!spread || p === 1) return [p];
  const start = p % 2 === 0 ? p : p - 1;
  return start < count ? [start, start + 1] : [start];
}
export function turnPage(
  page: number,
  count: number,
  spread: boolean,
  direction: number,
) {
  const visible = spreadPages(page, count, spread);
  return clampPage(
    direction > 0 ? visible[visible.length - 1] + 1 : visible[0] - 1,
    count,
  );
}
export function pageLabel(
  page: number,
  count: number,
  offset = 2,
  backMatterPages = 2,
) {
  if (page === 1) return 'Cover';
  if (page === 2) return 'Inside cover';
  if (backMatterPages > 0 && page === count) return 'Back cover';
  if (backMatterPages > 1 && page === count - 1) return 'Inside back';
  return page <= offset ? 'Front matter' : String(page - offset);
}
export function parsePrintedPage(
  value: string,
  count: number,
  offset = 2,
  backMatterPages = 2,
): number | null {
  const v = value.trim().toLowerCase();
  if (v === 'cover') return 1;
  if (v === 'back') return count;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= count - backMatterPages - offset ? n + offset : null;
}
export function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
// Issue indexes are immutable after loading; release their normalized text with
// the document instead of rebuilding it on each keystroke or navigation render.
const searchablePages = new WeakMap<IndexedPage[], string[]>();
export function searchPages(index: IndexedPage[], query: string) {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  let texts = searchablePages.get(index);
  if (!texts) {
    texts = index.map((p) => normalize(p.text));
    searchablePages.set(index, texts);
  }
  return index.flatMap((p, i) => {
    const pos = texts[i].indexOf(q);
    if (pos < 0) return [];
    return [
      {
        page: p.page,
        snippet:
          (pos > 60 ? '…' : '') +
          p.text.slice(Math.max(0, pos - 60), pos + q.length + 110) +
          '…',
      },
    ];
  });
}
export function matchWords(words: Word[], query: string) {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  let joined = '';
  const spans = words.map((word) => {
    const start = joined.length;
    joined += normalize(word.t) + ' ';
    return { word, start, end: joined.length - 1 };
  });
  const hits = new Set<Word>();
  let pos = joined.indexOf(q);
  while (pos >= 0) {
    for (const s of spans)
      if (s.start < pos + q.length && s.end > pos) hits.add(s.word);
    pos = joined.indexOf(q, pos + Math.max(1, q.length));
  }
  return [...hits];
}
export function readSaved(key: string, fallback: unknown) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Reading remains available when browser storage is unavailable. */
  }
}

/** Front and reverse of one physical sheet, independent of print page labels. */
export function turnFaces(from: number[], direction: number) {
  const front = direction > 0 ? from[from.length - 1] : from[0];
  return { front, back: front + (direction > 0 ? 1 : -1) };
}
