import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
// Model a WebView that predates this ES API. The modern PDF build fails in its
// message handler, while the shipped compatibility build supplies the fallback.
Promise.try = undefined;
const loader = fs.readFileSync('app/reader/pdf.ts', 'utf8');
const build = loader.match(/import\('(pdfjs-dist[^']+\.mjs)'\)/)[1];
const lib = await import(build);
test('The shipped PDF build renders the reported photo page without Promise.try', async () => {
  assert.match(loader, /legacy\/build\/pdf\.worker\.min\.mjs/);
  const task = lib.getDocument({
    data: new Uint8Array(fs.readFileSync('public/reader-assets/202609.pdf')),
    standardFontDataUrl:
      process.cwd() + '/public/reader-assets/pdfjs/standard_fonts/',
    wasmUrl: process.cwd() + '/public/reader-assets/pdfjs/wasm/',
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(4);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvas, viewport }).promise;
    assert.ok(canvas.width > 1000);
    assert.ok(canvas.toBuffer('image/png').length > 100_000);
  } finally {
    await task.destroy();
  }
});
