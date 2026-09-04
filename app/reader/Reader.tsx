'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeftOpen,
  Settings2,
  Plus,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import type { ReadableIssue } from './catalog';
import {
  clampPage,
  spreadPages,
  turnPage,
  pageLabel,
  parsePrintedPage,
  matchWords,
  readSaved,
  saveLocal,
  type IndexedPage,
} from './model';
import PageTurn, {
  warmTurnPages,
  cachedPageImage,
  type TurnControl,
  type TurnRenderer,
} from './PageTurn';
import { clampZoom, pinchZoom } from './motion';
import {
  loadPlace,
  storePlace,
  loadPreferences,
  type ReadingPlace,
  type ReadingMode,
} from './place';
import { pageColumns } from './columns';
import ArticleView from './ArticleView';
import { articleEditions } from './articles';
import Navigation, { type NavigationTab } from './Navigation';
import {
  adjacentStory,
  articleForStory,
  locationTitle,
  storyIndex,
  physicalPage,
} from './story-model';
import './reader.css';
import './v2.css';

type PDFModule = typeof import('pdfjs-dist');
let pdfModule: Promise<PDFModule> | undefined;
function loadPDF() {
  return (pdfModule ??= (async () => {
    const [pdf, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    return pdf;
  })());
}
const asset = (id: string, path: string) => `reader-assets/${id}/${path}`;

function Leaf({
  pdf,
  number,
  width,
  id,
  index,
  query,
  onDoubleClick,
  onPaint,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  id: string;
  index?: IndexedPage;
  query: string;
  onDoubleClick: (x: number, y: number) => void;
  onPaint?: () => void;
}) {
  const painted = useRef(onPaint);
  painted.current = onPaint;
  const surface = useRef<HTMLDivElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [renderWidth, setRenderWidth] = useState(width);
  const [paintedWidth, setPaintedWidth] = useState(width);
  useEffect(() => {
    const timer = setTimeout(() => setRenderWidth(width), 160);
    return () => clearTimeout(timer);
  }, [width]);
  useLayoutEffect(() => {
    const ready = cachedPageImage(pdf, number);
    if (!ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = ready.width;
    canvas.height = ready.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.getContext('2d')?.drawImage(ready, 0, 0);
    surface.current?.replaceChildren(canvas);
  }, [pdf, number]);
  const ratio = index ? index.height / index.width : 4 / 3;
  const hits = useMemo(
    () => matchWords(index?.words || [], query),
    [index, query],
  );
  useEffect(() => {
    let stopped = false,
      task: RenderTask | undefined,
      layer: TextLayer | undefined;
    const canvas = document.createElement('canvas');
    const layerNode = document.createElement('div');
    layerNode.className = 'textLayer';
    (async () => {
      try {
        setError(false);
        const [page, lib] = await Promise.all([pdf.getPage(number), loadPDF()]);
        if (stopped) return;
        const base = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({ scale: renderWidth / base.width });
        const dpr = Math.min(
          devicePixelRatio,
          1.8,
          3000 / Math.max(viewport.width, viewport.height),
        );
        canvas.width = Math.ceil(viewport.width * dpr);
        canvas.height = Math.ceil(viewport.height * dpr);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        task = page.render({
          canvas,
          viewport,
          transform: [dpr, 0, 0, dpr, 0, 0],
        });
        await task.promise;
        if (stopped) return;
        surface.current?.replaceChildren(canvas);
        painted.current?.();
        layerNode.style.setProperty(
          '--total-scale-factor',
          String(viewport.scale),
        );
        layer = new lib.TextLayer({
          textContentSource: await page.getTextContent(),
          container: layerNode,
          viewport,
        });
        await layer.render();
        if (stopped) return;
        text.current?.replaceChildren(layerNode);
        setPaintedWidth(renderWidth);
      } catch (e) {
        if (!stopped && (e as Error).name !== 'RenderingCancelledException')
          setError(true);
      }
    })();
    return () => {
      stopped = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [pdf, number, renderWidth]);
  return (
    <div
      className="reader-leaf"
      style={{ width, height: width * ratio }}
      aria-label={pageLabel(number, pdf.numPages)}
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
          This page couldn’t render at full resolution. Turn the page and return
          to retry.
        </div>
      )}
    </div>
  );
}

export default function Reader({
  issue,
  onClose,
  arriving = false,
  onReady,
  initialPanel = false,
  initialPage,
}: {
  issue: ReadableIssue;
  onClose: () => void;
  initialPanel?: boolean;
  initialPage?: number;
  arriving?: boolean;
  onReady?: () => void;
}) {
  const [pdf, setPDF] = useState<PDFDocumentProxy | null>(null),
    [index, setIndex] = useState<IndexedPage[]>([]),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(0),
    [indexError, setIndexError] = useState(false);
  const [page, setPage] = useState(1),
    [mode, setMode] = useState<ReadingMode>('spread'),
    [mobile, setMobile] = useState(false),
    [zoom, setZoom] = useState(1),
    [panel, setPanel] = useState<NavigationTab | null>(
      initialPanel ? 'contents' : null,
    ),
    [query, setQuery] = useState(''),
    [quiet, setQuiet] = useState(false),
    [chooser, setChooser] = useState(false),
    [bookmarkPages, setBookmarkPages] = useState<number[]>([]),
    [toast, setToast] = useState(''),
    [jump, setJump] = useState<string | null>(null),
    [area, setArea] = useState({ width: 0, height: 0 }),
    [turning, setTurning] = useState<{
      from: number[];
      to: number[];
      target: number;
      direction: number;
      control: TurnControl;
    } | null>(null);
  const dialog = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null),
    savedReady = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const [articleId, setArticleId] = useState<string | null>(null);
  const articleTop = useRef(0),
    articlePrint = useRef<ReadingPlace | null>(null);
  const [appearance, setAppearance] = useState(false),
    [motion, setMotion] = useState<'curl' | 'simple'>('curl'),
    [pinned, setPinned] = useState(true),
    [column, setColumn] = useState(0),
    [preview, setPreview] = useState<number | null>(null),
    [revealed, setRevealed] = useState(false),
    [fontSize, setFontSize] = useState(20);
  const readySent = useRef(false),
    restored = useRef(false),
    pendingPlace = useRef<ReadingPlace | null>(null);
  const rendererPool = useRef<TurnRenderer | null>(null),
    queuedTurn = useRef(0),
    cornerDrag = useRef<{
      x: number;
      lastX: number;
      lastAt: number;
      velocity: number;
      dir: number;
      control: TurnControl;
    } | null>(null);
  const historySnapshot = useRef<ReadingPlace | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [historyPage, setHistoryPage] = useState<number | null>(null);
  const historyView = useRef({ left: 0, top: 0, zoom: 1 });
  const restoreView = useRef<{ left: number; top: number } | null>(null);
  const wheelState = useRef({ sum: 0, last: 0, latched: false, pinchAt: 0 });
  const turningRef = useRef(false);
  const zoomRef = useRef(zoom);
  const zoomAnchor = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const actualSpread = mode === 'spread' && !mobile;
  const visible = spreadPages(page, issue.pageCount, actualSpread);
  const start = visible[0],
    end = visible[visible.length - 1];
  const currentArticle = issue.contents[storyIndex(issue, page)];
  const currentEdition = currentArticle
    ? articleForStory(issue, currentArticle.printedPage)
    : undefined;
  const previousStory = adjacentStory(issue, page, -1);
  const nextStory = adjacentStory(issue, page, 1);
  const baseRatio = index[0] ? index[0].height / index[0].width : 4 / 3;
  const columns = useMemo(
    () => pageColumns(index[page - 1]?.words || []),
    [index, page],
  );
  const activeColumn = columns[Math.min(column, columns.length - 1)];
  const horizontalSpace = quiet ? 24 : mobile ? 24 : 64;
  const verticalSpace = 24;
  const fitWidth = Math.max(
    120,
    Math.min(
      (area.width - horizontalSpace) / (actualSpread ? 2 : 1),
      (area.height - verticalSpace) / baseRatio,
    ),
  );
  const leafWidth =
    (mode === 'page'
      ? Math.max(120, area.width - horizontalSpace)
      : mode === 'column'
        ? Math.max(120, area.width - horizontalSpace) / activeColumn.width
        : fitWidth) * zoom;
  const capturePlace = useCallback(
    (): ReadingPlace => ({
      page,
      zoom: zoomRef.current,
      mode,
      column,
      left: viewport.current?.scrollLeft || 0,
      top: viewport.current?.scrollTop || 0,
      updated: Date.now(),
      article: articleId || undefined,
      articleTop: articleTop.current,
    }),
    [page, mode, column, articleId],
  );
  const latestPlace = useRef(capturePlace);
  latestPlace.current = capturePlace;
  const persist = useCallback(() => {
    if (restored.current && !pendingPlace.current && !turningRef.current)
      storePlace(issue.id, latestPlace.current());
  }, [issue.id]);
  const paintedPage = useCallback(() => {
    if (!readySent.current) {
      readySent.current = true;
      onReady?.();
    }
  }, [onReady]);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 250);
    return () => clearTimeout(saveTimer.current);
  }, [page, zoom, mode, column, articleId, persist]);
  useEffect(() => {
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(saveTimer.current);
      window.removeEventListener('pagehide', persist);
      rendererPool.current?.dispose();
      rendererPool.current?.forceContextLoss();
    };
  }, [persist]);
  // Capture scroll offsets before React detaches the viewport ref on unmount.
  useLayoutEffect(() => () => persist(), [persist]);
  useEffect(() => {
    if (restored.current)
      saveLocal('atlantic:reader-preferences', {
        motion,
        pinned,
        fontSize,
      });
  }, [motion, pinned, fontSize]);
  useLayoutEffect(() => {
    const place = pendingPlace.current;
    if (!place || !pdf || (!index.length && !indexError) || !area.width) return;
    viewport.current?.scrollTo({ left: place.left, top: place.top });
    pendingPlace.current = null;
    restored.current = true;
  }, [
    pdf,
    index.length,
    indexError,
    area.width,
    area.height,
    mode,
    zoom,
    articleId,
  ]);
  useLayoutEffect(() => {
    if (mode !== 'column' || pendingPlace.current) return;
    viewport.current?.scrollTo({ left: activeColumn.x * leafWidth, top: 0 });
  }, [mode, column, page]);
  function chooseMode(next: ReadingMode) {
    setMode(next);
    setColumn(0);
    zoomRef.current = 1;
    setZoom(1);
    setTurning(null);
    turningRef.current = false;
  }
  const setFocus = useCallback((next: boolean) => {
    setQuiet(next);
    setPanel(null);
    setAppearance(false);
    setRevealed(false);
  }, []);
  const announce = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);
  const navigate = useCallback(
    (n: number, remember = true) => {
      if (
        remember &&
        page > 2 &&
        (n !== page || articleId) &&
        !historySnapshot.current
      ) {
        setHistoryPage(page);
        historySnapshot.current = capturePlace();
        historyView.current = {
          left: viewport.current?.scrollLeft || 0,
          top: viewport.current?.scrollTop || 0,
          zoom: zoomRef.current,
        };
      }
      const value = clampPage(n, issue.pageCount);
      turningRef.current = false;
      setTurning(null);
      setPage(value);
      setJump(null);
      viewport.current?.scrollTo({ left: 0, top: 0 });
      setPanel(null);
      setArticleId(null);
      if (remember) {
        zoomRef.current = 1;
        setZoom(1);
        setColumn(0);
      }
      queuedTurn.current = 0;
    },
    [issue.pageCount, page, articleId, capturePlace],
  );
  const turn = useCallback(
    (dir: number) => {
      if (turningRef.current) {
        queuedTurn.current = dir;
        if (turning) turning.control.fast = true;
        return;
      }
      const target = turnPage(page, issue.pageCount, actualSpread, dir);
      const next = spreadPages(target, issue.pageCount, actualSpread);
      if (next.join() === visible.join()) return;
      if (
        !pdf ||
        motion === 'simple' ||
        matchMedia('(prefers-reduced-motion:reduce)').matches
      ) {
        navigate(target, false);
        return;
      }
      turningRef.current = true;
      setTurning({
        from: visible,
        to: next,
        target,
        direction: dir,
        control: { progress: 0, release: 1 },
      });
    },
    [
      pdf,
      page,
      issue.pageCount,
      actualSpread,
      navigate,
      visible.join(),
      turning,
      motion,
    ],
  );
  useEffect(() => {
    if (!turning && queuedTurn.current) {
      const dir = queuedTurn.current;
      queuedTurn.current = 0;
      turn(dir);
    }
  }, [turning, page, turn]);
  function finishTurn(commit: boolean) {
    const next = turning?.target;
    turningRef.current = false;
    setTurning(null);
    if (commit && next) navigate(next, false);
  }
  function beginCorner(e: React.PointerEvent<HTMLButtonElement>, dir: number) {
    e.preventDefault();
    e.stopPropagation();
    if (turning || !pdf) return;
    if (
      motion === 'simple' ||
      matchMedia('(prefers-reduced-motion:reduce)').matches
    ) {
      turn(dir);
      return;
    }
    const target = turnPage(page, issue.pageCount, actualSpread, dir),
      next = spreadPages(target, issue.pageCount, actualSpread);
    if (next.join() === visible.join()) return;
    const control: TurnControl = { progress: 0, release: null };
    cornerDrag.current = {
      x: e.clientX,
      lastX: e.clientX,
      lastAt: performance.now(),
      velocity: 0,
      dir,
      control,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    turningRef.current = true;
    setTurning({ from: visible, to: next, target, direction: dir, control });
  }
  function moveCorner(e: React.PointerEvent<HTMLButtonElement>) {
    const d = cornerDrag.current;
    if (!d) return;
    const now = performance.now();
    d.velocity = ((d.lastX - e.clientX) * d.dir) / Math.max(1, now - d.lastAt);
    d.lastX = e.clientX;
    d.lastAt = now;
    d.control.progress = Math.max(
      0,
      Math.min(0.99, ((d.x - e.clientX) * d.dir) / (leafWidth * 1.5)),
    );
  }
  function releaseCorner(cancel = false) {
    const d = cornerDrag.current;
    if (!d) return;
    d.control.release = cancel
      ? 0
      : d.control.progress > 0.25 ||
          d.velocity > 0.35 ||
          d.control.progress < 0.015
        ? 1
        : 0;
    cornerDrag.current = null;
  }
  const changeZoom = useCallback(
    (value: number, clientX?: number, clientY?: number) => {
      if (turningRef.current) {
        turningRef.current = false;
        setTurning(null);
        queuedTurn.current = 0;
      }
      const el = viewport.current,
        paper = el?.querySelector<HTMLElement>('.open-magazine');
      const next = clampZoom(value);
      if (el && paper) {
        const box = el.getBoundingClientRect(),
          book = paper.getBoundingClientRect();
        const cx = clientX ?? box.left + box.width / 2,
          cy = clientY ?? box.top + box.height / 2;
        zoomAnchor.current = {
          x: (cx - book.left) / book.width,
          y: (cy - book.top) / book.height,
          clientX: cx,
          clientY: cy,
        };
      }
      zoomRef.current = next;
      setZoom(next);
    },
    [],
  );
  useLayoutEffect(() => {
    const el = viewport.current,
      anchor = zoomAnchor.current;
    const book = el
      ?.querySelector<HTMLElement>('.open-magazine')
      ?.getBoundingClientRect();
    if (el && anchor && book) {
      el.scrollLeft += book.left + anchor.x * book.width - anchor.clientX;
      el.scrollTop += book.top + anchor.y * book.height - anchor.clientY;
      zoomAnchor.current = null;
    }
  }, [zoom]);
  useLayoutEffect(() => {
    if (!restoreView.current || !viewport.current) return;
    viewport.current.scrollTo(restoreView.current);
    restoreView.current = null;
  }, [page, zoom]);
  useEffect(() => {
    if (!pdf || turning) return;
    const timer = setTimeout(
      () =>
        warmTurnPages(
          pdf,
          [start - 2, start - 1, start, end, end + 1, end + 2],
          leafWidth,
        ),
      220,
    );
    return () => clearTimeout(timer);
  }, [pdf, start, end, leafWidth, turning]);
  useEffect(() => {
    if (error) onReady?.();
  }, [error, onReady]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const gesture = wheelState.current;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        gesture.pinchAt = performance.now();
        changeZoom(
          pinchZoom(zoomRef.current, e.deltaY * (e.deltaMode === 1 ? 16 : 1)),
          e.clientX,
          e.clientY,
        );
        return;
      }
      const now = performance.now();
      if (turningRef.current || now - gesture.pinchAt < 240) {
        e.preventDefault();
        gesture.last = now;
        return;
      }
      // At reading magnification, leave two-finger scrolling to the browser.
      // At Fit, deliberate horizontal swipes turn one page per gesture.
      if (zoomRef.current > 1.01 || mode !== 'spread') return;
      if (now - gesture.last > 180) {
        gesture.sum = 0;
        gesture.latched = false;
      }
      gesture.last = now;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3) return;
      e.preventDefault();
      if (gesture.latched) return;
      gesture.sum += e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      if (Math.abs(gesture.sum) > 85) {
        gesture.latched = true;
        turn(Math.sign(gesture.sum));
      }
    };
    let gestureZoom = 1;
    const gestureStart = (event: Event) => {
      event.preventDefault();
      gestureZoom = zoomRef.current;
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const e = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      gesture.pinchAt = performance.now();
      changeZoom(
        gestureZoom * e.scale,
        e.clientX || undefined,
        e.clientY || undefined,
      );
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', gestureStart, { passive: false });
    el.addEventListener('gesturechange', gestureChange, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', gestureStart);
      el.removeEventListener('gesturechange', gestureChange);
    };
  }, [turn, changeZoom, mode]);
  const bookmark = useCallback(() => {
    setBookmarkPages((old) => {
      const exists = old.includes(page),
        next = exists
          ? old.filter((n) => n !== page)
          : [...old, page].sort((a, b) => a - b);
      saveLocal(`atlantic:bookmarks:${issue.id}`, next);
      announce(exists ? 'Bookmark removed' : 'Page saved');
      return next;
    });
  }, [page, issue.id, announce]);
  useEffect(() => {
    const saved =
      initialPage === undefined ? loadPlace(issue.id, issue.pageCount) : null;
    if (initialPage !== undefined)
      setPage(clampPage(initialPage, issue.pageCount));
    if (saved) {
      setPage(saved.page);
      setMode(saved.mode);
      setColumn(saved.column);
      setZoom(saved.zoom);
      zoomRef.current = saved.zoom;
      pendingPlace.current = saved;
      if (
        saved.article &&
        articleEditions.some((a) => a.id === saved.article)
      ) {
        articlePrint.current = { ...saved, article: undefined };
        setArticleId(saved.article);
        articleTop.current = saved.articleTop || 0;
      }
    } else restored.current = true;
    const prefs = loadPreferences();
    setMotion(prefs.motion);
    setPinned(prefs.pinned);
    setFontSize(prefs.fontSize);
    const marks = readSaved(`atlantic:bookmarks:${issue.id}`, []) as unknown;
    setBookmarkPages(
      Array.isArray(marks)
        ? marks.filter(
            (n) => Number.isInteger(n) && n >= 1 && n <= issue.pageCount,
          )
        : [],
    );
    savedReady.current = true;
    const mq = matchMedia('(max-width:960px)');
    setMobile(mq.matches);
    const change = () => {
      setMobile(mq.matches);
    };
    mq.addEventListener('change', change);
    close.current?.focus();
    return () => {
      mq.removeEventListener('change', change);
      clearTimeout(toastTimer.current);
    };
  }, [issue.id, issue.pageCount, announce]);

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<PDFModule['getDocument']> | undefined;
    const abort = new AbortController();
    setPDF(null);
    setError('');
    setLoading(0);
    setIndex([]);
    setIndexError(false);
    loadPDF()
      .then((lib) => {
        if (disposed) return;
        task = lib.getDocument({
          url: `reader-assets/${issue.id}.pdf`,
          cMapUrl: 'reader-assets/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'reader-assets/pdfjs/standard_fonts/',
          wasmUrl: 'reader-assets/pdfjs/wasm/',
        });
        task.onProgress = ({
          loaded,
          total,
        }: {
          loaded: number;
          total: number;
        }) => {
          if (!disposed)
            setLoading(
              total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
            );
        };
        return task.promise;
      })
      .then((doc) => {
        if (!doc || disposed) return;
        if (doc.numPages !== issue.pageCount)
          throw new Error('The issue’s page count does not match the catalog.');
        setPDF(doc);
        setLoading(100);
      })
      .catch(() => {
        if (!disposed)
          setError('This issue couldn’t be opened. Please try again.');
      });
    fetch(asset(issue.id, 'index.json'), { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error('Missing index');
        return r.json();
      })
      .then((x) => {
        if (!disposed && Array.isArray(x)) setIndex(x as IndexedPage[]);
      })
      .catch(() => {
        if (!disposed) setIndexError(true);
      });
    return () => {
      disposed = true;
      abort.abort();
      void task?.destroy();
    };
  }, [issue.id, issue.pageCount, retry]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setArea({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdf, panel, quiet]);
  useEffect(() => {
    if (quiet) dialog.current?.focus({ preventScroll: true });
    else close.current?.focus();
  }, [quiet]);
  const contentsTrigger = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => {
    setPanel(null);
    requestAnimationFrame(() => contentsTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (panel)
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>('.reader-navigation button')
          ?.focus(),
      );
    if (appearance)
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>('.appearance-popover button')
          ?.focus(),
      );
    if (preview !== null)
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>('.skim-overlay button')
          ?.focus(),
      );
  }, [panel, appearance, preview]);
  const returnToPrint = useCallback(() => {
    if (!articleId) return;
    setArticleId(null);
    if (articlePrint.current) {
      const place = articlePrint.current;
      setPage(place.page);
      setMode(place.mode);
      setColumn(place.column);
      zoomRef.current = place.zoom;
      setZoom(place.zoom);
      pendingPlace.current = place;
    }
  }, [articleId]);
  function openArticle() {
    if (!currentEdition || articleId) return;
    articlePrint.current = capturePlace();
    articleTop.current = 0;
    setArticleId(currentEdition.id);
  }
  function goToStory(n: number) {
    const entry = issue.contents.find((c) => physicalPage(c.printedPage) === n);
    const edition = entry && articleForStory(issue, entry.printedPage);
    const stayInArticle = !!articleId && !!edition;
    navigate(n);
    if (stayInArticle && edition) {
      articlePrint.current = {
        ...capturePlace(),
        page: n,
        zoom: 1,
        left: 0,
        top: 0,
        article: undefined,
      };
      articleTop.current = 0;
      setArticleId(edition.id);
    } else if (articleId) announce('This story is available in print view.');
  }
  function restoreHistory() {
    const place = historySnapshot.current;
    if (!place) return;
    navigate(place.page, false);
    setMode(place.mode);
    setColumn(place.column);
    zoomRef.current = place.zoom;
    setZoom(place.zoom);
    articleTop.current = place.articleTop || 0;
    setArticleId(place.article || null);
    pendingPlace.current = place;
    historySnapshot.current = null;
    setHistoryPage(null);
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const scope =
          dialog.current?.querySelector(
            preview !== null
              ? '.skim-overlay'
              : appearance
                ? '.appearance-popover'
                : panel
                  ? '.reader-navigation'
                  : '.reader',
          ) || dialog.current;
        const nodes = Array.from(
          scope?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,a[href]',
          ) || [],
        ).filter(
          (el) =>
            el.offsetParent !== null &&
            el.tabIndex >= 0 &&
            !el.closest('[inert]'),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (scope && !scope.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(
        (e.target as HTMLElement).tagName,
      );
      if (e.key === 'Escape') {
        e.preventDefault();
        if (turning) {
          turning.control.release = 0;
          turning.control.fast = true;
          queuedTurn.current = 0;
          return;
        }
        if (preview !== null) {
          setPreview(null);
          return;
        }
        if (appearance) {
          setAppearance(false);
          return;
        }
        if (chooser) setChooser(false);
        else if (panel) closeNavigation();
        else if (quiet) setFocus(false);
        else if (articleId) returnToPrint();
        else onClose();
        return;
      }
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c') {
        e.preventDefault();
        setPanel(panel ? null : 'contents');
        return;
      }
      if (e.key === 'f') {
        setFocus(!quiet);
        return;
      }
      if (articleId || panel || preview !== null || appearance) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        turn(1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turn(-1);
      }
      if (e.key === 'Home') {
        e.preventDefault();
        navigate(1);
      }
      if (e.key === 'End') {
        e.preventDefault();
        navigate(issue.pageCount);
      }
      if (e.key === 'b') bookmark();
      if (e.key === 'f') setFocus(!quiet);
      if (e.key === '/') {
        e.preventDefault();
        setQuiet(false);
        setPanel('search');
      }
      if (e.key === '+' || e.key === '=') changeZoom(zoomRef.current + 0.25);
      if (e.key === '-') changeZoom(zoomRef.current - 0.25);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    turn,
    navigate,
    bookmark,
    onClose,
    quiet,
    chooser,
    mobile,
    panel,
    issue.pageCount,
    turning,
    preview,
    appearance,
    articleId,
    setFocus,
    changeZoom,
    closeNavigation,
    returnToPrint,
  ]);
  function submitJump() {
    const n = parsePrintedPage(jump ?? '', issue.pageCount);
    if (n !== null) navigate(n);
    else {
      announce(
        `Enter a printed page from 1 to ${issue.pageCount - 4}, or “cover”.`,
      );
      setJump(null);
    }
  }
  const label = (n: number) => pageLabel(n, issue.pageCount);
  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className={`reader reader-v2 ${quiet ? 'quiet' : ''} ${arriving ? 'arriving' : ''} ${!pinned ? 'auto-controls' : ''} ${revealed || panel || appearance ? 'controls-revealed' : ''}`}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        setRevealed(e.clientY < box.top + 75 || e.clientY > box.bottom - 80);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${issue.issue} full issue reader`}
    >
      <header
        className="reader-header"
        inert={!!panel || appearance || preview !== null}
      >
        <div className="reader-header-left">
          <button
            ref={close}
            onClick={onClose}
            aria-label="Return to cover index"
            className="back-to-library"
          >
            <ArrowLeft size={18} />
            <span>Archive</span>
          </button>
          <span className="reader-issue-date">{issue.issue}</span>
        </div>
        <img
          className="reader-brand"
          src="brand/atlantic-logo.svg"
          alt="The Atlantic"
        />
        <div className="reader-header-tools">
          <button
            ref={contentsTrigger}
            aria-label="Contents"
            aria-expanded={!!panel}
            onClick={() => {
              setPanel(panel ? null : 'contents');
              setAppearance(false);
            }}
          >
            <PanelLeftOpen size={18} />
            <span>Contents</span>
          </button>
          <button
            className="reader-icon"
            aria-label={quiet ? 'Leave focus mode' : 'Enter focus mode'}
            title="Focus · F"
            onClick={() => setFocus(!quiet)}
          >
            {quiet ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </header>
      {quiet && (
        <button
          className="focus-access"
          onClick={() => setRevealed((v) => !v)}
          aria-label="Show reading controls"
        >
          •••
        </button>
      )}
      <div
        className="reader-workspace"
        inert={!!panel || appearance || preview !== null}
      >
        <section className="reading-desk" aria-label="Magazine">
          {!pdf && (
            <div className="reader-loading" role="status">
              <img src={asset(issue.id, '1.jpg')} alt="" />
              <p>{error || `Opening ${issue.issue}…`}</p>
              {error ? (
                <button onClick={() => setRetry((n) => n + 1)}>
                  Try again
                </button>
              ) : (
                <div className="reader-load-line">
                  <span style={{ width: `${Math.max(8, loading)}%` }} />
                </div>
              )}
            </div>
          )}
          <div
            ref={viewport}
            onScroll={() => {
              clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(persist, 250);
            }}
            className={`page-viewport ${zoom > 1 ? 'zoomed' : ''}`}
            style={
              articleId
                ? { visibility: 'hidden', pointerEvents: 'none' }
                : undefined
            }
            aria-hidden={!!articleId}
            inert={!!articleId}
            onPointerDown={(e) => {
              if (
                zoom <= 1 ||
                e.button !== 0 ||
                (e.target as HTMLElement).closest('.textLayer span')
              )
                return;
              const el = viewport.current!;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                left: el.scrollLeft,
                top: el.scrollTop,
              };
              el.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const d = drag.current;
              viewport.current!.scrollLeft = d.left - (e.clientX - d.x);
              viewport.current!.scrollTop = d.top - (e.clientY - d.y);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {pdf && (
              <div
                className={`page-surface ${visible.length === 2 ? 'spread' : 'single'} ${turning ? 'is-turning' : ''}`}
              >
                <div className="open-magazine">
                  {visible.map((n) => (
                    <div className="leaf-wrap" key={n}>
                      <Leaf
                        pdf={pdf}
                        onPaint={paintedPage}
                        number={n}
                        width={leafWidth}
                        id={issue.id}
                        index={index[n - 1]}
                        query={query}
                        onDoubleClick={(x, y) =>
                          changeZoom(zoomRef.current === 1 ? 2 : 1, x, y)
                        }
                      />
                      <span className="leaf-number">{label(n)}</span>
                    </div>
                  ))}
                  {turning && pdf && (
                    <PageTurn
                      pdf={pdf}
                      from={turning.from}
                      to={turning.to}
                      direction={turning.direction}
                      width={leafWidth}
                      ratio={baseRatio}
                      spread={actualSpread}
                      onComplete={finishTurn}
                      control={turning.control}
                      rendererPool={rendererPool}
                    />
                  )}
                  {visible.length === 2 && (
                    <span className="book-gutter" aria-hidden="true" />
                  )}
                  {start > 1 && (
                    <button
                      className="page-corner left"
                      aria-label="Turn previous page from corner"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          turn(-1);
                        }
                      }}
                      onPointerDown={(e) => beginCorner(e, -1)}
                      onPointerMove={moveCorner}
                      onPointerUp={() => releaseCorner()}
                      onPointerCancel={() => releaseCorner(true)}
                    />
                  )}
                  {end < issue.pageCount && (
                    <button
                      className="page-corner right"
                      aria-label="Turn next page from corner"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          turn(1);
                        }
                      }}
                      onPointerDown={(e) => beginCorner(e, 1)}
                      onPointerMove={moveCorner}
                      onPointerUp={() => releaseCorner()}
                      onPointerCancel={() => releaseCorner(true)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {articleId && (
            <ArticleView
              key={articleId}
              id={articleId}
              fontSize={fontSize}
              initialTop={articleTop.current}
              onPrint={returnToPrint}
              onReady={paintedPage}
              onScroll={(top) => {
                articleTop.current = top;
                clearTimeout(saveTimer.current);
                saveTimer.current = setTimeout(persist, 250);
              }}
            />
          )}
          {historyPage !== null && (
            <div className="reading-return">
              <button onClick={restoreHistory}>
                <ArrowLeft size={15} />
                <span>
                  Return to {locationTitle(issue, historyPage)} ·{' '}
                  {label(historyPage)}
                </span>
              </button>
              <button
                aria-label="Dismiss return location"
                onClick={() => {
                  historySnapshot.current = null;
                  setHistoryPage(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </section>
      </div>
      <footer
        className="reader-toolbar"
        inert={!!panel || appearance || preview !== null}
      >
        <div className="story-controls">
          <button
            aria-label="Previous story"
            title={previousStory?.title || 'No previous story'}
            disabled={!previousStory}
            onClick={() =>
              previousStory &&
              goToStory(physicalPage(previousStory.printedPage))
            }
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="current-story"
            onClick={() => setPanel('contents')}
            aria-label={`Current story: ${locationTitle(issue, page)}. Open contents`}
          >
            <span>{currentArticle?.section || issue.issue}</span>
            <strong>{locationTitle(issue, page)}</strong>
          </button>
          <button
            aria-label="Next story"
            title={nextStory?.title || 'No next story'}
            disabled={!nextStory}
            onClick={() =>
              nextStory && goToStory(physicalPage(nextStory.printedPage))
            }
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <div
          className="presentation-control"
          role="group"
          aria-label="Reading presentation"
        >
          <button aria-pressed={!articleId} onClick={returnToPrint}>
            Print
          </button>
          <button
            aria-pressed={!!articleId}
            disabled={!currentEdition}
            title={
              currentEdition
                ? 'Read with adjustable text'
                : 'Article view is not available for this story'
            }
            onClick={openArticle}
          >
            Article
          </button>
        </div>
        <div className="reader-utilities">
          {!articleId && (
            <>
              <div className="page-controls">
                <button
                  aria-label="Previous page"
                  disabled={start === 1}
                  onClick={() => turn(-1)}
                >
                  <ArrowLeft size={16} />
                </button>
                <label className="page-jump">
                  <input
                    aria-label="Go to printed page number, or type cover"
                    value={jump ?? label(page)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setJump(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        submitJump();
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      if (jump !== null) submitJump();
                    }}
                  />
                </label>
                <button
                  aria-label="Next page"
                  disabled={end === issue.pageCount}
                  onClick={() => turn(1)}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
              <button
                className="fit-button"
                aria-label="Fit page to screen"
                onClick={() => chooseMode('spread')}
              >
                {zoom === 1 && mode === 'spread'
                  ? 'Fit'
                  : `${Math.round(zoom * 100)}%`}
              </button>
            </>
          )}
          <button
            aria-label={
              bookmarkPages.includes(page) ? 'Remove bookmark' : 'Save page'
            }
            aria-pressed={bookmarkPages.includes(page)}
            title="Save page · B"
            onClick={bookmark}
          >
            <Bookmark
              size={18}
              fill={bookmarkPages.includes(page) ? 'currentColor' : 'none'}
            />
          </button>
          <button
            aria-label="Reading settings"
            aria-expanded={appearance}
            onClick={() => {
              setAppearance((v) => !v);
              setPanel(null);
            }}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </footer>
      {panel && (
        <Navigation
          issue={issue}
          tab={panel}
          onTab={setPanel}
          page={page}
          index={index}
          indexError={indexError}
          query={query}
          onQuery={setQuery}
          marks={bookmarkPages}
          onRemoveMark={(n) => {
            const next = bookmarkPages.filter((p) => p !== n);
            setBookmarkPages(next);
            saveLocal(`atlantic:bookmarks:${issue.id}`, next);
          }}
          onNavigate={navigate}
          onStory={goToStory}
          suspended={preview !== null}
          onPreview={setPreview}
          onClose={closeNavigation}
        />
      )}
      {appearance && (
        <div className="settings-layer">
          <button
            className="settings-scrim"
            aria-label="Close reading settings"
            onClick={() => setAppearance(false)}
          />
          <div
            className="appearance-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Reading settings"
          >
            <div className="popover-title">
              <strong>Reading settings</strong>
              <button
                aria-label="Close reading settings"
                onClick={() => setAppearance(false)}
              >
                <X size={18} />
              </button>
            </div>
            {articleId ? (
              <fieldset>
                <legend>Text size</legend>
                <button
                  disabled={fontSize <= 18}
                  aria-label="Smaller article text"
                  onClick={() => setFontSize((n) => Math.max(18, n - 2))}
                >
                  <Minus size={16} />
                </button>
                <span>{fontSize}</span>
                <button
                  disabled={fontSize >= 28}
                  aria-label="Larger article text"
                  onClick={() => setFontSize((n) => Math.min(28, n + 2))}
                >
                  <Plus size={16} />
                </button>
              </fieldset>
            ) : (
              <>
                <fieldset>
                  <legend>Page view</legend>
                  {(['spread', 'page', 'column'] as const).map((v) => (
                    <button
                      key={v}
                      aria-pressed={mode === v}
                      onClick={() => chooseMode(v)}
                    >
                      {v === 'spread'
                        ? 'Fit'
                        : v === 'page'
                          ? 'Page width'
                          : 'Column'}
                    </button>
                  ))}
                </fieldset>
                {mode === 'column' && (
                  <fieldset>
                    <legend>Column</legend>
                    {columns.map((_, i) => (
                      <button
                        key={i}
                        aria-pressed={column === i}
                        onClick={() => setColumn(i)}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </fieldset>
                )}
                <fieldset>
                  <legend>Zoom</legend>
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= 1}
                    onClick={() => changeZoom(zoomRef.current - 0.25)}
                  >
                    <Minus size={16} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 4}
                    onClick={() => changeZoom(zoomRef.current + 0.25)}
                  >
                    <Plus size={16} />
                  </button>
                </fieldset>
                <fieldset>
                  <legend>Page turn</legend>
                  <button
                    aria-pressed={motion === 'curl'}
                    onClick={() => setMotion('curl')}
                  >
                    Classic curl
                  </button>
                  <button
                    aria-pressed={motion === 'simple'}
                    onClick={() => setMotion('simple')}
                  >
                    Instant
                  </button>
                </fieldset>
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Keep controls visible
            </label>
            <p className="settings-help">
              C · Contents &nbsp; F · Focus
              <br />
              Arrow keys · Turn pages
              <br />
              Pinch · Zoom &nbsp; Two fingers · Pan
            </p>
          </div>
        </div>
      )}
      {preview !== null && (
        <div
          className="skim-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Page preview"
        >
          <div className="skim-card">
            <div className="popover-title">
              <strong>Page {label(preview)}</strong>
              <button
                aria-label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X size={20} />
              </button>
            </div>
            {pdf ? (
              <div className="preview-page">
                <Leaf
                  pdf={pdf}
                  number={preview}
                  width={Math.max(
                    120,
                    Math.min(
                      mobile ? area.width - 92 : 420,
                      (area.height - 130) / baseRatio,
                    ),
                  )}
                  id={issue.id}
                  index={index[preview - 1]}
                  query=""
                  onDoubleClick={() => {}}
                />
              </div>
            ) : (
              <img
                src={asset(issue.id, `${preview}.jpg`)}
                alt={`Preview of page ${label(preview)}`}
              />
            )}
            <div className="skim-actions">
              <button
                aria-label="Preview previous page"
                disabled={preview === 1}
                onClick={() => setPreview((n) => Math.max(1, n! - 1))}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onClick={() => {
                  navigate(preview);
                  setPreview(null);
                }}
              >
                Read from here
              </button>
              <button
                aria-label="Preview next page"
                disabled={preview === issue.pageCount}
                onClick={() =>
                  setPreview((n) => Math.min(issue.pageCount, n! + 1))
                }
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <button className="skim-return" onClick={() => setPreview(null)}>
              Keep browsing · Your reading place is unchanged
            </button>
          </div>
        </div>
      )}
      <div className="reader-status" role="status" aria-live="polite">
        {toast && (
          <span>
            <Check size={14} />
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
