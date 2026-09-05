export type ScrollPage = { page: number; top: number; height: number };
export const SCROLL_GAP = 24;
export const SCROLL_PADDING = 12;
export function scrollLayout(
  count: number,
  width: number,
  ratios: number[],
  gap = SCROLL_GAP,
) {
  let top = SCROLL_PADDING;
  const pages: ScrollPage[] = Array.from({ length: count }, (_, i) => {
    const height = width * (ratios[i] || 4 / 3);
    const page = { page: i + 1, top, height };
    top += height + gap;
    return page;
  });
  return { pages, height: top - gap + SCROLL_PADDING };
}
export function pageAtOffset(pages: ScrollPage[], top: number) {
  let low = 0,
    high = pages.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (pages[mid].top <= top) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function scrollWindow(pages: ScrollPage[], top: number, height: number) {
  return {
    first: Math.max(0, pageAtOffset(pages, top) - 1),
    last: Math.min(pages.length - 1, pageAtOffset(pages, top + height) + 1),
  };
}
export function scrollDestination(
  pages: ScrollPage[],
  page: number,
  offset = 0,
) {
  const target = pages[Math.max(0, Math.min(pages.length - 1, page - 1))];
  return target.top + Math.max(0, Math.min(1, offset)) * target.height;
}
