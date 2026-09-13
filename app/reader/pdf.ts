export type PDFModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfModule: Promise<PDFModule> | undefined;

export function loadPDF() {
  return (pdfModule ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url').then((worker) => {
      // PDF.js only starts loading its worker inside `getDocument`, after the
      // main module has arrived, and it does not request the PDF until the
      // worker is up. Fetching the script now puts it in the HTTP cache while
      // the main module is still downloading, so the two overlap instead of
      // queueing. Best effort: a failure here just falls back to the normal
      // worker load.
      if (typeof fetch === 'function')
        fetch(worker.default, { priority: 'high' } as RequestInit).catch(
          () => {},
        );
      return worker;
    }),
  ])
    .then(([pdf, worker]) => {
      pdf.GlobalWorkerOptions.workerSrc = worker.default;
      return pdf;
    })
    .catch((error) => {
      pdfModule = undefined;
      throw error;
    }));
}

/** Transport options for `getDocument`, chosen by measurement (see
 * PERFORMANCE-AUDIT.md, September 2026). The host answers byte-range requests,
 * so PDF.js can start on the first page before the issue has downloaded.
 *
 * PDF.js discovers the bytes it needs one round trip at a time: the head, the
 * xref at the tail, then the page tree down to the last page (it validates the
 * page count before resolving the document). That chain, not bandwidth, sets
 * the floor for first paint.
 *
 * - `disableStream: true`: with streaming on, PDF.js keeps a full-file GET
 *   running beside the range requests, and the two halve each other's
 *   bandwidth on the critical path. Turning it off cost nothing on localhost
 *   and saved ~200 ms at both 50 and 300 Mbps. Later pages still arrive in
 *   the background, chunk by chunk, because
 * - `disableAutoFetch: false` keeps pulling the rest of the file once the
 *   visible pages are satisfied; a page turn's own requests take priority.
 * - `rangeChunkSize: 262144`: the first page needs about half a megabyte of
 *   the head; 256 KiB reaches it in two requests where 64 KiB needs eight,
 *   and 512 KiB or 1 MiB overshoot on the tail-side chunks. */
export const rangeTransport = {
  rangeChunkSize: 262144,
  disableAutoFetch: false,
  disableStream: true,
} as const;
