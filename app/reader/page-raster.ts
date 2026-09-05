import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { rasterScale } from './motion.ts';

type Raster = {
  page: number;
  promise: Promise<HTMLCanvasElement>;
  canvas?: HTMLCanvasElement;
  task?: RenderTask;
};

/** One working set shared by print pages, prefetch, and the animated sheet.
 * Cached canvases are immutable; DOM consumers copy them instead of moving them.
 * Pending requests stay indexed so simultaneous consumers cannot render twice. */
export class PageRasterCache {
  private entries = new Map<string, Raster>();
  private disposed = false;
  private pdf: PDFDocumentProxy;
  private maxBytes: number;
  private maxPages: number;
  constructor(
    pdf: PDFDocumentProxy,
    maxBytes = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
      ? 24
      : 64) *
      1024 *
      1024,
    maxPages = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
      ? 4
      : 12,
  ) {
    this.pdf = pdf;
    this.maxBytes = maxBytes;
    this.maxPages = maxPages;
  }

  peek(page: number) {
    return [...this.entries.values()]
      .reverse()
      .find((e) => e.page === page && e.canvas)?.canvas;
  }

  get(
    page: number,
    width: number,
    dpr = devicePixelRatio,
  ): Promise<HTMLCanvasElement> {
    if (this.disposed) return Promise.reject(new Error('PDF closed'));
    const key = `${page}:${width}:${dpr}`;
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.promise;
    }
    const entry: Raster = {
      page,
      promise: Promise.resolve()
        .then(async () => {
          const pdfPage = await this.pdf.getPage(page);
          if (this.disposed) throw new Error('PDF closed');
          const base = pdfPage.getViewport({ scale: 1 });
          const viewport = pdfPage.getViewport({ scale: width / base.width });
          const scale = rasterScale(width, base.height / base.width, dpr);
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width * scale);
          canvas.height = Math.ceil(viewport.height * scale);
          entry.task = pdfPage.render({
            canvas,
            viewport,
            transform: [scale, 0, 0, scale, 0, 0],
          });
          await entry.task.promise;
          if (this.disposed) throw new Error('PDF closed');
          entry.task = undefined;
          entry.canvas = canvas;
          this.trim();
          return canvas;
        })
        .catch((error) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw error;
        }),
    };
    this.entries.set(key, entry);
    return entry.promise;
  }

  private trim() {
    const ready = [...this.entries].filter(([, e]) => e.canvas);
    let bytes = ready.reduce(
      (total, [, e]) => total + e.canvas!.width * e.canvas!.height * 4,
      0,
    );
    let count = ready.length;
    for (const [key, entry] of ready) {
      if (count <= this.maxPages && bytes <= this.maxBytes) break;
      bytes -= entry.canvas!.width * entry.canvas!.height * 4;
      count--;
      this.entries.delete(key);
    }
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.task?.cancel();
    this.entries.clear();
  }
}

const caches = new WeakMap<PDFDocumentProxy, PageRasterCache>();
export function pageRasters(pdf: PDFDocumentProxy) {
  let cache = caches.get(pdf);
  if (!cache) {
    cache = new PageRasterCache(pdf);
    caches.set(pdf, cache);
  }
  return cache;
}

/** Warm one page at a time, yielding between pages. A new spread/zoom cancels
 * the remaining speculative work without cancelling a shared visible raster. */
export async function warmTurnPages(
  pdf: PDFDocumentProxy,
  pages: number[],
  width: number,
  signal: AbortSignal,
) {
  for (const page of new Set(pages)) {
    if (signal.aborted) return;
    if (page < 1 || page > pdf.numPages) continue;
    try {
      await pageRasters(pdf).get(page, width);
    } catch {
      return;
    }
  }
}
