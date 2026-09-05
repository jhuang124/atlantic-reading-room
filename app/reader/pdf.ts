export type PDFModule = typeof import('pdfjs-dist');
let pdfModule: Promise<PDFModule> | undefined;

export function loadPDF() {
  return (pdfModule ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
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
