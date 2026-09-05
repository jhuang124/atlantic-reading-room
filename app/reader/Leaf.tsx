'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist';
import { pageLabel, matchWords, type IndexedPage } from './model';
import { loadPDF } from './pdf';
import { pageRasters } from './page-raster';
function releaseSurface(node: HTMLElement | null) {
  node?.querySelectorAll('canvas').forEach((canvas) => {
    canvas.width = canvas.height = 0;
  });
  node?.replaceChildren();
}

const asset = (id: string, path: string) => `reader-assets/${id}/${path}`;

export default function Leaf({
  pdf,
  number,
  width,
  id,
  index,
  query,
  onDoubleClick,
  onPaint,
  printOffset,
  backMatterPages,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  id: string;
  index?: IndexedPage;
  query: string;
  onDoubleClick: (x: number, y: number) => void;
  onPaint?: () => void;
  printOffset?: number;
  backMatterPages?: number;
}) {
  const painted = useRef(onPaint);
  useLayoutEffect(() => {
    painted.current = onPaint;
  }, [onPaint]);
  const surface = useRef<HTMLDivElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [renderWidth, setRenderWidth] = useState(width);
  const [paintedWidth, setPaintedWidth] = useState(width);
  useEffect(() => {
    const timer = setTimeout(() => setRenderWidth(width), 160);
    return () => clearTimeout(timer);
  }, [width]);
  useLayoutEffect(() => {
    const ready = pageRasters(pdf).peek(number);
    if (!ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = ready.width;
    canvas.height = ready.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.getContext('2d')?.drawImage(ready, 0, 0);
    releaseSurface(surface.current);
    surface.current?.replaceChildren(canvas);
  }, [pdf, number]);
  useEffect(() => {
    const node = surface.current;
    return () => releaseSurface(node);
  }, [pdf, number]);
  const ratio = index ? index.height / index.width : 4 / 3;
  const hits = useMemo(
    () => matchWords(index?.words || [], query),
    [index, query],
  );
  useEffect(() => {
    let stopped = false,
      layer: TextLayer | undefined;
    const canvas = document.createElement('canvas');
    const layerNode = document.createElement('div');
    layerNode.className = 'textLayer';
    void (async () => {
      try {
        setError(false);
        const [page, lib, raster] = await Promise.all([
          pdf.getPage(number),
          loadPDF(),
          pageRasters(pdf).get(number, renderWidth),
        ]);
        if (stopped) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderWidth / base.width });
        canvas.width = raster.width;
        canvas.height = raster.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.getContext('2d')?.drawImage(raster, 0, 0);
        releaseSurface(surface.current);
        surface.current?.replaceChildren(canvas);
        painted.current?.();
        // A text-selection failure must not obscure a successfully drawn page.
        try {
          layerNode.style.setProperty(
            '--total-scale-factor',
            String(viewport.scale),
          );
          const textContent = await page.getTextContent();
          if (stopped) return;
          layer = new lib.TextLayer({
            textContentSource: textContent,
            container: layerNode,
            viewport,
          });
          await layer.render();
          if (stopped) return;
          text.current?.replaceChildren(layerNode);
          setPaintedWidth(renderWidth);
        } catch {
          if (!stopped) text.current?.replaceChildren();
        }
      } catch (e) {
        if (!stopped && (e as Error).name !== 'RenderingCancelledException') {
          console.warn('PDF page render failed', number, e);
          setError(true);
        }
      }
    })();
    return () => {
      stopped = true;
      layer?.cancel();
    };
  }, [pdf, number, renderWidth, retry]);
  return (
    <div
      className="reader-leaf"
      style={{ width, height: width * ratio }}
      aria-label={pageLabel(number, pdf.numPages, printOffset, backMatterPages)}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('.textLayer span'))
          onDoubleClick(e.clientX, e.clientY);
      }}
    >
      <img className="leaf-preview" src={asset(id, `${number}.jpg`)} alt="" />
      <div ref={surface} className="leaf-canvas" />
      <div
        ref={text}
        className="leaf-text"
        style={{
          transform: `scale(${width / paintedWidth})`,
          transformOrigin: '0 0',
        }}
      />
      {hits.map((hit, i) => (
        <span
          key={i}
          className="word-highlight"
          style={{
            left: `${hit.x * 100}%`,
            top: `${hit.y * 100}%`,
            width: `${hit.w * 100}%`,
            height: `${hit.h * 100}%`,
          }}
        />
      ))}
      <div className="leaf-edge" aria-hidden="true" />
      {error && (
        <div className="page-render-error">
          <span>This page couldn’t load.</span>
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </div>
      )}
    </div>
  );
}
