import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./pages', import.meta.url)),
  base: './',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-pages', import.meta.url)),
    emptyOutDir: true,
  },
  // GitHub Pages advertises `Accept-Ranges: bytes` on every response, which is
  // what lets PDF.js paint the first page from the head of a linearized PDF.
  // sirv only sends it on 206 replies, so without this the preview (and the
  // smoke test) would download whole issues and hide transport regressions.
  preview: { headers: { 'Accept-Ranges': 'bytes' } },
});
