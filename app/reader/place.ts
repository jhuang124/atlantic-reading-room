import { clampPage, readSaved, saveLocal } from './model.ts';
export type ReadingMode = 'spread' | 'page' | 'column' | 'scroll';
export type ReadingPlace = {
  page: number;
  zoom: number;
  mode: ReadingMode;
  left: number;
  top: number;
  column: number;
  updated: number;
  article?: string;
  articleTop?: number;
  pageOffset?: number;
};
export type ReaderPreferences = {
  warm: boolean;
  motion: 'curl' | 'simple';
  pinned: boolean;
  mobileControls: 'auto' | 'always';
  fontSize: number;
};
export const defaultPreferences: ReaderPreferences = {
  warm: true,
  motion: 'curl',
  pinned: true,
  mobileControls: 'auto',
  fontSize: 20,
};
export function normalizePlace(
  value: unknown,
  count: number,
): ReadingPlace | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<ReadingPlace>;
  if (!Number.isInteger(p.page)) return null;
  return {
    page: clampPage(p.page!, count),
    zoom: Number.isFinite(p.zoom) ? Math.max(1, Math.min(4, p.zoom!)) : 1,
    mode:
      p.mode === 'column' || p.mode === 'page' || p.mode === 'scroll'
        ? p.mode
        : 'spread',
    left: Number.isFinite(p.left) ? Math.max(0, p.left!) : 0,
    top: Number.isFinite(p.top) ? Math.max(0, p.top!) : 0,
    column: Number.isInteger(p.column)
      ? Math.max(0, Math.min(3, p.column!))
      : 0,
    updated: p.updated || 0,
    article: typeof p.article === 'string' ? p.article : undefined,
    articleTop: Number.isFinite(p.articleTop) ? p.articleTop : 0,
    ...(p.mode === 'scroll'
      ? {
          pageOffset: Number.isFinite(p.pageOffset)
            ? Math.max(0, Math.min(1, p.pageOffset!))
            : 0,
        }
      : {}),
  };
}
export const loadPlace = (id: string, count: number) =>
  normalizePlace(readSaved(`atlantic:place:${id}`, null), count);
export const storePlace = (id: string, place: ReadingPlace) => {
  saveLocal(`atlantic:place:${id}`, place);
  saveLocal('atlantic:last-issue', id);
};
export function loadPreferences(): ReaderPreferences {
  const p = readSaved(
    'atlantic:reader-preferences',
    {},
  ) as Partial<ReaderPreferences>;
  return {
    warm: typeof p.warm === 'boolean' ? p.warm : true,
    motion: p.motion === 'simple' ? 'simple' : 'curl',
    pinned: p.pinned !== false,
    mobileControls: p.mobileControls === 'always' ? 'always' : 'auto',
    fontSize: [18, 20, 22, 24, 26, 28].includes(p.fontSize || 0)
      ? p.fontSize!
      : 20,
  };
}
