'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as THREE from 'three';
import { cornerCurl, TURN_MS } from './motion';
import { turnFaces } from './model';

const resolvedPages = new WeakMap<
  PDFDocumentProxy,
  Map<number, HTMLCanvasElement>
>();
export const cachedPageImage = (pdf: PDFDocumentProxy, page: number) =>
  resolvedPages.get(pdf)?.get(page);

const pageCache = new WeakMap<
  PDFDocumentProxy,
  Map<string, Promise<HTMLCanvasElement>>
>();
function pageImage(pdf: PDFDocumentProxy, number: number, width: number) {
  let cache = pageCache.get(pdf);
  if (!cache) {
    cache = new Map();
    pageCache.set(pdf, cache);
  }
  const pixels = Math.min(1500, Math.ceil((width * 1.5) / 100) * 100);
  const key = `${number}:${pixels}`;
  let result = cache.get(key);
  if (!result) {
    result = (async () => {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pixels / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      let ready = resolvedPages.get(pdf);
      if (!ready) {
        ready = new Map();
        resolvedPages.set(pdf, ready);
      }
      ready.set(number, canvas);
      if (ready.size > 12) ready.delete(ready.keys().next().value!);
      return canvas;
    })();
    cache.set(key, result);
    result.catch(() => cache!.delete(key));
    // Keep a small working set; a long session must not retain every rasterized page.
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return result;
}
export function warmTurnPages(
  pdf: PDFDocumentProxy,
  pages: number[],
  width: number,
) {
  pages
    .filter((n) => n > 0 && n <= pdf.numPages)
    .forEach((n) => {
      void pageImage(pdf, n, width).catch(() => {});
    });
}

export type TurnControl = {
  progress: number;
  release: number | null;
  fast?: boolean;
};
export type TurnRenderer = THREE.WebGLRenderer;
export default function PageTurn({
  pdf,
  from,
  to,
  direction,
  width,
  ratio,
  spread,
  onComplete,
  control,
  rendererPool,
}: {
  pdf: PDFDocumentProxy;
  from: number[];
  to: number[];
  direction: number;
  width: number;
  ratio: number;
  spread: boolean;
  onComplete: (commit: boolean) => void;
  control: TurnControl;
  rendererPool: MutableRefObject<TurnRenderer | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  useEffect(() => {
    let disposed = false,
      frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    const resources: { dispose: () => void }[] = [];
    const forward = direction > 0,
      pair = spread;
    const slots = (values: number[]) =>
      values.length === 2
        ? values
        : values[0] % 2
          ? [undefined, values[0]]
          : [values[0], undefined];
    const oldSlots = slots(from),
      nextSlots = slots(to);
    const pages = [...new Set([...from, ...to])];
    let finished = false;
    const done = (commit = true) => {
      if (!disposed && !finished) {
        finished = true;
        finish.current(commit);
      }
    };
    // A failed raster/graphics context should never leave navigation locked.
    const timeout = setTimeout(done, 5000);
    (async () => {
      const [images, THREE] = await Promise.all([
        Promise.all(pages.map((n) => pageImage(pdf, n, width))),
        import('three'),
      ]);
      if (disposed || finished || !host.current) return;
      clearTimeout(timeout);
      const textures = new Map<number, THREE.CanvasTexture>();
      pages.forEach((n, i) => {
        const texture = new THREE.CanvasTexture(images[i]);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        textures.set(n, texture);
        resources.push(texture);
      });
      const scene = new THREE.Scene();
      const span = pair ? 2 : 1;
      // Orthographic framing keeps the spine exactly registered with the PDF.
      const camera = new THREE.OrthographicCamera(
        -span / 2,
        span / 2,
        ratio / 2,
        -ratio / 2,
        0.01,
        20,
      );
      camera.position.set(0, 0, 8);
      renderer =
        rendererPool.current ||
        new THREE.WebGLRenderer({ alpha: true, antialias: true });
      rendererPool.current = renderer;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      renderer.setSize(width * span, width * ratio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      host.current.appendChild(renderer.domElement);
      const plane = (n: number | undefined, x: number) => {
        if (!n) return;
        const geometry = new THREE.PlaneGeometry(1, ratio);
        const material = new THREE.MeshBasicMaterial({ map: textures.get(n) });
        resources.push(geometry, material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, 0, -0.025);
        scene.add(mesh);
      };
      if (pair) {
        plane(forward ? oldSlots[0] : nextSlots[0], -0.5);
        plane(forward ? nextSlots[1] : oldSlots[1], 0.5);
      } else plane(forward ? to.at(-1)! : to[0], 0);
      const { front: frontNumber, back: backNumber } = turnFaces(
        from,
        direction,
      );
      if (!to.includes(backNumber))
        throw new Error(
          'The reverse page must be present in the destination spread.',
        );
      const geometry = new THREE.PlaneGeometry(1, ratio, 80, 48);
      const backGeometry = geometry.clone();
      const color = new Float32Array(
        geometry.attributes.position.count * 3,
      ).fill(1);
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      backGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(color.slice(), 3),
      );
      const frontUV = geometry.attributes.uv,
        backUV = backGeometry.attributes.uv;
      for (let i = 0; i < frontUV.count; i++) {
        const u = frontUV.getX(i);
        frontUV.setX(i, forward ? u : 1 - u);
        backUV.setX(i, forward ? 1 - u : u);
      }
      const frontMat = new THREE.MeshBasicMaterial({
        map: textures.get(frontNumber),
        side: forward ? THREE.FrontSide : THREE.BackSide,
        vertexColors: true,
      });
      const backMat = new THREE.MeshBasicMaterial({
        map: textures.get(backNumber),
        side: forward ? THREE.BackSide : THREE.FrontSide,
        vertexColors: true,
      });
      const front = new THREE.Mesh(geometry, frontMat),
        back = new THREE.Mesh(backGeometry, backMat);
      scene.add(front, back);
      const shadowGeometry = geometry.clone();
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const brush = shadowCanvas.getContext('2d')!;
      brush.shadowColor = 'black';
      brush.shadowBlur = 14;
      brush.fillStyle = 'black';
      brush.fillRect(18, 18, 92, 92);
      const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      resources.push(shadowTexture);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        color: 0x302419,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      scene.add(shadow);
      resources.push(
        geometry,
        backGeometry,
        frontMat,
        backMat,
        shadowGeometry,
        shadowMaterial,
      );
      const initial = performance.now();
      let releasedAt = 0,
        releasedFrom = 0,
        lastRelease: number | null = null;
      const tick = (now: number) => {
        if (disposed || finished || !renderer) return;
        if (control.release !== lastRelease) {
          releasedAt = now;
          releasedFrom = control.progress;
          lastRelease = control.release;
        }
        const duration = Math.max(
          100,
          TURN_MS * Math.abs((control.release ?? 1) - releasedFrom),
        );
        const elapsed = control.fast
          ? 1
          : Math.min(1, (now - releasedAt) / duration);
        const progress =
          control.release === null
            ? control.progress
            : releasedFrom +
              (control.release - releasedFrom) * (1 - Math.pow(1 - elapsed, 3));
        control.progress = progress;

        if (pair) {
          const center = (values: number[]) =>
            values.length === 2 ? 0 : values[0] % 2 ? 0.5 : -0.5;
          const eased = progress * progress * (3 - 2 * progress);
          camera.position.x = THREE.MathUtils.lerp(
            center(from),
            center(to),
            eased,
          );
        }
        const hinge = pair ? 0 : forward ? -0.5 : 0.5;
        for (let row = 0; row <= 48; row++)
          for (let col = 0; col <= 80; col++) {
            const i = row * 81 + col;
            const c = cornerCurl(
              col / 80,
              ratio * (0.5 - row / 48),
              ratio,
              progress,
            );
            const x = hinge + (forward ? c.x : -c.x),
              z = c.z + 0.008;
            for (const g of [geometry, backGeometry]) {
              g.attributes.position.setXYZ(i, x, c.y, z);
              g.attributes.color.setXYZ(i, c.shade, c.shade, c.shade);
            }
            shadowGeometry.attributes.position.setXYZ(
              i,
              x + z * 0.16,
              c.y - z * 0.2,
              -0.01,
            );
          }
        for (const g of [geometry, backGeometry, shadowGeometry]) {
          g.attributes.position.needsUpdate = true;
          if (g.attributes.color) g.attributes.color.needsUpdate = true;
          g.computeBoundingSphere();
        }
        shadowMaterial.opacity = Math.sin(Math.PI * progress) * 0.3;
        renderer.render(scene, camera);
        host.current?.classList.add('ready');
        if (control.release === null || elapsed < 1)
          frame = requestAnimationFrame(tick);
        else done(control.release === 1);
      };
      tick(initial);
    })().catch(() => done());
    return () => {
      disposed = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);

      renderer?.domElement.remove();
      resources.forEach((r) => r.dispose());
    };
  }, [pdf, from, to, direction, width, ratio, spread, control, rendererPool]);
  return (
    <div
      ref={host}
      className="physical-page-turn"
      style={{
        width: width * (spread ? 2 : 1),
        left: spread && from.length === 1 ? -width / 2 : 0,
      }}
      aria-hidden="true"
    />
  );
}
