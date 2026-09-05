'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as THREE from 'three';
import { cornerCurl, curlSampleU, rasterScale, TURN_MS } from './motion';
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
  const pixels = width;
  const key = `${number}:${pixels}`;
  let result = cache.get(key);
  if (!result) {
    result = (async () => {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const dpr = rasterScale(
        width,
        base.height / base.width,
        devicePixelRatio,
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * dpr);
      canvas.height = Math.ceil(viewport.height * dpr);
      await page.render({ canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0] })
        .promise;
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
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
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
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(width * span, width * ratio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      textures.forEach((texture) => {
        texture.anisotropy = Math.min(
          8,
          renderer!.capabilities.getMaxAnisotropy(),
        );
      });
      renderer.setClearColor(0x000000, 0);
      host.current.appendChild(renderer.domElement);
      // Use the same spine shading in the raster handoff and the moving sheet.
      const shadePaper = (
        material: THREE.MeshBasicMaterial,
        side: 'left' | 'right' | 'sheet',
      ) => {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.gutterWidth = { value: 11 / width };
          shader.vertexShader =
            'attribute float spineDistance; varying float vSpineDistance;\n' +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvSpineDistance = spineDistance;',
          );
          shader.fragmentShader =
            'uniform float gutterWidth; varying float vSpineDistance;\n' +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float crease = clamp(1.0 - vSpineDistance / gutterWidth, 0.0, 1.0);
            diffuseColor.rgb *= pow(1.0 - 0.14 * crease, 2.2);`,
          );
        };
        material.customProgramCacheKey = () => 'paper-spine-' + side;
      };
      const plane = (n: number | undefined, x: number) => {
        if (!n) return;
        const geometry = new THREE.PlaneGeometry(1, ratio);
        const distances = new Float32Array(geometry.attributes.position.count);
        for (let i = 0; i < distances.length; i++)
          distances[i] = pair
            ? x < 0
              ? 1 - geometry.attributes.uv.getX(i)
              : geometry.attributes.uv.getX(i)
            : 1;
        geometry.setAttribute(
          'spineDistance',
          new THREE.BufferAttribute(distances, 1),
        );
        const material = new THREE.MeshBasicMaterial({ map: textures.get(n) });
        shadePaper(material, x < 0 ? 'left' : 'right');
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
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
      geometry.setAttribute(
        'spineDistance',
        new THREE.BufferAttribute(
          new Float32Array(geometry.attributes.position.count),
          1,
        ),
      );
      // One two-sided surface: there are no coincident front/back meshes to compete.
      const paperMaterial = new THREE.MeshBasicMaterial({
        map: textures.get(frontNumber),
        side: THREE.DoubleSide,
        vertexColors: true,
      });
      shadePaper(paperMaterial, 'sheet');
      const paperShader = paperMaterial.onBeforeCompile;
      paperMaterial.onBeforeCompile = (shader, context) => {
        paperShader.call(paperMaterial, shader, context);
        shader.uniforms.reverseMap = { value: textures.get(backNumber) };
        shader.fragmentShader =
          'uniform sampler2D reverseMap;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `
          vec4 ink = ${forward ? 'gl_FrontFacing' : '!gl_FrontFacing'}
            ? texture2D(map, vMapUv) : texture2D(reverseMap, vec2(1.0 - vMapUv.x, vMapUv.y));
          diffuseColor *= ink;`,
        );
      };
      paperMaterial.customProgramCacheKey = () => 'curl-paper-' + direction;
      const paper = new THREE.Mesh(geometry, paperMaterial);
      paper.frustumCulled = false;
      scene.add(paper);

      // Project an opaque silhouette into one mask. Overlapping parts cannot
      // multiply their opacity as they did with the flattened transparent mesh.
      const shadowGeometry = geometry.clone();
      const maskMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const maskScene = new THREE.Scene();
      const maskMesh = new THREE.Mesh(shadowGeometry, maskMaterial);
      maskMesh.frustumCulled = false;
      maskScene.add(maskMesh);
      const targetWidth = Math.min(1400, Math.ceil(width * span * 1.5));
      const targetHeight = Math.ceil((targetWidth * ratio) / span);
      const maskTarget = new THREE.WebGLRenderTarget(
        targetWidth,
        targetHeight,
        { depthBuffer: false },
      );
      const blurTarget = new THREE.WebGLRenderTarget(
        targetWidth,
        targetHeight,
        { depthBuffer: false },
      );
      const softTarget = new THREE.WebGLRenderTarget(
        targetWidth,
        targetHeight,
        { depthBuffer: false },
      );
      const blurGeometry = new THREE.PlaneGeometry(2, 2);
      const blurMaterial = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          source: { value: maskTarget.texture },
          stepSize: { value: new THREE.Vector2() },
        },
        vertexShader:
          'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: `uniform sampler2D source; uniform vec2 stepSize; varying vec2 vUv;
          void main(){float a=texture2D(source,vUv).a*0.227027;
          a+=(texture2D(source,vUv+stepSize*1.384615).a+texture2D(source,vUv-stepSize*1.384615).a)*0.316216;
          a+=(texture2D(source,vUv+stepSize*3.230769).a+texture2D(source,vUv-stepSize*3.230769).a)*0.070270;
          gl_FragColor=vec4(0.0,0.0,0.0,a);}`,
      });
      const blurScene = new THREE.Scene();
      blurScene.add(new THREE.Mesh(blurGeometry, blurMaterial));
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: softTarget.texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const receiverGeometry = new THREE.PlaneGeometry(span, ratio);
      const shadow = new THREE.Mesh(receiverGeometry, shadowMaterial);
      shadow.position.z = -0.012;
      scene.add(shadow);
      resources.push(
        geometry,
        paperMaterial,
        shadowGeometry,
        maskMaterial,
        maskTarget,
        blurTarget,
        softTarget,
        blurGeometry,
        blurMaterial,
        receiverGeometry,
        shadowMaterial,
      );
      const initial = performance.now();
      let releasedAt = 0,
        releasedFrom = 0,
        lastRelease: number | null = null,
        fastAt: number | null = null,
        fastFrom = 0;
      const tick = (now: number) => {
        if (disposed || finished || !renderer) return;
        if (control.release !== lastRelease) {
          releasedAt = now;
          releasedFrom = control.progress;
          lastRelease = control.release;
          fastAt = null;
        }
        const duration = Math.max(
          100,
          TURN_MS * Math.abs((control.release ?? 1) - releasedFrom),
        );
        if (control.fast && fastAt === null) {
          fastAt = now;
          fastFrom = control.progress;
        }
        const elapsed = Math.min(
          1,
          (now - (fastAt ?? releasedAt)) / (fastAt !== null ? 110 : duration),
        );
        const progress =
          control.release === null
            ? control.progress
            : (fastAt !== null ? fastFrom : releasedFrom) +
              (control.release - (fastAt !== null ? fastFrom : releasedFrom)) *
                (0.5 - 0.5 * Math.cos(Math.PI * elapsed));
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
        let maxHeight = 0;
        for (let row = 0; row <= 48; row++)
          for (let col = 0; col <= 80; col++) {
            const i = row * 81 + col;
            const y = ratio * (0.5 - row / 48);
            const u = curlSampleU(col, 80, y, ratio, progress);
            const c = cornerCurl(u, y, ratio, progress);
            const x = hinge + (forward ? c.x : -c.x),
              z = c.z + 0.008;
            maxHeight = Math.max(maxHeight, c.z);
            geometry.attributes.position.setXYZ(i, x, c.y, z);
            // Canvas textures are sRGB; lighting is linear, so preserve paper white.
            const shade = Math.pow(c.shade, 2.2);
            geometry.attributes.color.setXYZ(i, shade, shade, shade);
            geometry.attributes.uv.setXY(i, forward ? u : 1 - u, 1 - row / 48);
            geometry.attributes.spineDistance.setX(i, pair ? u : 1);
            shadowGeometry.attributes.position.setXYZ(
              i,
              x + c.z * 0.16,
              c.y - c.z * 0.2,
              0,
            );
          }
        for (const name of ['position', 'color', 'uv', 'spineDistance'])
          geometry.attributes[name].needsUpdate = true;
        shadowGeometry.attributes.position.needsUpdate = true;
        shadow.position.x = camera.position.x;
        shadowMaterial.opacity = 0.24 * Math.min(1, maxHeight / 0.035);
        renderer.setRenderTarget(maskTarget);
        renderer.render(maskScene, camera);
        const softness = 0.65 + maxHeight * width * 0.018;
        blurMaterial.uniforms.source.value = maskTarget.texture;
        blurMaterial.uniforms.stepSize.value.set(softness / targetWidth, 0);
        renderer.setRenderTarget(blurTarget);
        renderer.render(blurScene, camera);
        blurMaterial.uniforms.source.value = blurTarget.texture;
        blurMaterial.uniforms.stepSize.value.set(0, softness / targetHeight);
        renderer.setRenderTarget(softTarget);
        renderer.render(blurScene, camera);
        renderer.setRenderTarget(null);
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
