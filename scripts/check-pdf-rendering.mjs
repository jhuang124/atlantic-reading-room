import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
fs.mkdirSync('work/reader-qa', { recursive: true });
for (const [id, count, pageNumber] of [
  ['202609', 112, 70],
  ['202608', 104, 14],
  ['202512', 108, 22],
]) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(`public/reader-assets/${id}.pdf`)),
    standardFontDataUrl:
      process.cwd() + '/public/reader-assets/pdfjs/standard_fonts/',
    wasmUrl: process.cwd() + '/public/reader-assets/pdfjs/wasm/',
  });
  const doc = await task.promise;
  assert.equal(doc.numPages, count);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  await page.render({
    canvas,
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;
  fs.writeFileSync(`work/reader-qa/${id}.png`, canvas.toBuffer('image/png'));
  const text = await page.getTextContent();
  assert.ok(
    text.items.some((item) => item.str?.trim()),
    'Article opener must contain selectable text',
  );
  console.log(
    id,
    doc.numPages,
    'pages; rendered page',
    pageNumber,
    'with',
    text.items.length,
    'text items',
  );
  await task.destroy();
}
