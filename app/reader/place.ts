import { clampPage, readSaved, saveLocal } from './model.ts';
/** V4 has two views. Spread (desktop) / Pages (phone) is the magazine as an
 * object; Scroll is continuous reading. */
export type ReadingMode = 'spread' | 'scroll';
export type ReadingPlace = {
  page: number;
  zoom: number;
  mode: ReadingMode;
  left: number;
  top: number;
  column: number;
  updated: number;
  pageOffset?: number;
};
export type ReaderPreferences = {
  warm: boolean;
  motion: 'curl' | 'simple';
  pinned: boolean;
  /** The chosen view is a preference per device class, not per issue. */
  viewDesktop: ReadingMode;
  viewPhone: ReadingMode;
};
export const defaultPreferences: ReaderPreferences = {
  warm: true,
  motion: 'curl',
  pinned: true,
  viewDesktop: 'spread',
  viewPhone: 'scroll',
};
/** Retired modes map onto the two that remain: Page width was page-width
 * reading, so it becomes Scroll; Column was a paged view, so it becomes
 * Spread at Fit with a clean frame. */
export function normalizeMode(value: unknown): ReadingMode {
  return value === 'scroll' || value === 'page' ? 'scroll' : 'spread';
}
export function normalizePlace(
  value: unknown,
  count: number,
): ReadingPlace | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Omit<Partial<ReadingPlace>, 'mode'> & { mode?: unknown };
  if (!Number.isInteger(p.page)) return null;
  const retired = p.mode === 'column';
  const mode = normalizeMode(p.mode);
  return {
    page: clampPage(p.page!, count),
    zoom:
      !retired && Number.isFinite(p.zoom)
        ? Math.max(1, Math.min(4, p.zoom!))
        : 1,
    mode,
    left: !retired && Number.isFinite(p.left) ? Math.max(0, p.left!) : 0,
    top: !retired && Number.isFinite(p.top) ? Math.max(0, p.top!) : 0,
    column: Number.isInteger(p.column)
      ? Math.max(0, Math.min(3, p.column!))
      : 0,
    updated: p.updated || 0,
    ...(mode === 'scroll'
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
  const view = (value: unknown, fallback: ReadingMode) =>
    value === 'spread' || value === 'scroll' ? value : fallback;
  return {
    warm: typeof p.warm === 'boolean' ? p.warm : true,
    motion: p.motion === 'simple' ? 'simple' : 'curl',
    pinned: p.pinned !== false,
    viewDesktop: view(p.viewDesktop, defaultPreferences.viewDesktop),
    viewPhone: view(p.viewPhone, defaultPreferences.viewPhone),
  };
}
export const storePreferences = (patch: Partial<ReaderPreferences>) =>
  saveLocal('atlantic:reader-preferences', { ...loadPreferences(), ...patch });
