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
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeftOpen,
  Settings2,
  Plus,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ReadableIssue } from './catalog';
import {
  clampPage,
  spreadPages,
  turnPage,
  pageLabel,
  parsePrintedPage,
  readSaved,
  saveLocal,
  type IndexedPage,
} from './model';
import PageTurn, { type TurnControl, type TurnRenderer } from './PageTurn';
import { clampZoom, pinchZoom } from './motion';
import { createPinchPreview } from './pinch-preview';
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
  articleForStory,
  locationTitle,
  storyIndex,
  physicalPage,
} from './story-model';
import Leaf from './Leaf';
import ContinuousPages, { type ScrollTarget } from './ContinuousPages';
import { loadPDF, type PDFModule } from './pdf';
import { pageRasters, warmTurnPages } from './page-raster';
import './reader-v3.css';
import useReadingControls, {
  type ReadingGestureActions,
} from './useReadingControls';
import useReaderViewport from './useReaderViewport';
import { scrollPort } from './scroll-port';
import { swipeTurn, horizontalEdges } from './reading-controls';
import BrowserReadingOptions from './BrowserReadingOptions';

const asset = (id: string, path: string) => `reader-assets/${id}/${path}`;

// The touch layout is for touch devices, not for any narrow window: a
// half-screen desktop browser keeps mouse-scaled chrome. Truly phone-narrow
// windows fall back to the touch layout, where desktop chrome cannot fit.
const MOBILE_QUERY =
  '(max-width: 960px) and (pointer: coarse), (max-width: 640px)';

export default function Reader({
  issue,
  onClose,
  arriving = false,
  onReady,
  initialPanel = false,
  initialPage,
  theme,
  onTheme,
  onPage,
}: {
  issue: ReadableIssue;
  theme: 'light' | 'dark';
  onTheme: (theme: 'light' | 'dark') => void;
  onClose: () => void;
  initialPanel?: boolean;
  initialPage?: number;
  arriving?: boolean;
  onReady?: () => void;
  onPage?: (page: number) => void;
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
    revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    revealArmed = useRef(false),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const scrollOffset = useRef(0);
  const scrollPosition = useCallback((next: number, offset: number) => {
    scrollOffset.current = offset;
    setPage(next);
  }, []);
  const [articleId, setArticleId] = useState<string | null>(null);
  const settingsReturn = useRef<HTMLElement | null>(null);
  const articleTop = useRef(0),
    articlePrint = useRef<ReadingPlace | null>(null);
  const [appearance, setAppearance] = useState(false),
    [motion, setMotion] = useState<'curl' | 'simple'>('curl'),
    [mobileControls, setMobileControls] = useState<'auto' | 'always'>('auto'),
    [column, setColumn] = useState(0),
    [revealed, setRevealed] = useState(false),
    [fontSize, setFontSize] = useState(20);
  // Phone gestures resolve through one decision layer; the callbacks are
  // filled in below once turn and changeZoom exist.
  const gestureActions = useRef<ReadingGestureActions>({
    turn: () => {},
    doubleTap: () => {},
    edgeTurns: () => false,
  });
  const controls = useReadingControls(
    dialog,
    mobile,
    mobileControls === 'always',
    !!panel || appearance,
    gestureActions.current,
  );
  const browserReader =
    mobile &&
    typeof document !== 'undefined' &&
    document.documentElement.dataset.nativeReader !== 'true';
  const documentReading = browserReader && (mode === 'scroll' || !!articleId);
  useReaderViewport(dialog, mobile);
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
    selector: string;
  } | null>(null);
  const actualSpread = mode === 'spread' && !mobile;
  const visible = spreadPages(page, issue.pageCount, actualSpread);
  const start = visible[0],
    end = visible[visible.length - 1];
  const currentArticle = issue.contents[storyIndex(issue, page)];
  const currentEdition = currentArticle
    ? articleForStory(issue, currentArticle.printedPage)
    : undefined;
  const baseRatio = index[0] ? index[0].height / index[0].width : 4 / 3;
  const columns = useMemo(
    () => pageColumns(index[page - 1]?.words || []),
    [index, page],
  );
  const activeColumn = columns[Math.min(column, columns.length - 1)];
  // Desk padding must match reader-v3.css: phones keep 8px around a fitted
  // page; desktops reserve room for the edge arrows and the caption row, and
  // Focus gives almost all of it back to the page.
  const horizontalSpace = mobile
    ? mode === 'spread' && zoom === 1
      ? 16
      : 0
    : quiet
      ? 32
      : 144;
  const verticalSpace = mobile
    ? mobileControls === 'always'
      ? 120
      : 16
    : quiet
      ? 32
      : 68;
  const fitWidth = Math.max(
    120,
    Math.min(
      (area.width - horizontalSpace) / (actualSpread ? 2 : 1),
      (area.height - verticalSpace) / baseRatio,
    ),
  );
  const leafWidth =
    (mode === 'scroll'
      ? Math.max(120, Math.min(900, area.width - horizontalSpace))
      : mode === 'page'
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
      left: viewport.current
        ? scrollPort(viewport.current, documentReading).read().left
        : 0,
      top: viewport.current
        ? scrollPort(viewport.current, documentReading).read().top
        : 0,
      updated: Date.now(),
      article: articleId || undefined,
      articleTop: articleTop.current,
      ...(mode === 'scroll' ? { pageOffset: scrollOffset.current } : {}),
    }),
    [page, mode, column, articleId, documentReading],
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
    onPage?.(page);
  }, [page, onPage]);
  useEffect(() => {
    if (!documentReading) return;
    const save = () => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 250);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [documentReading, persist]);
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
        mobileControls,
        fontSize,
      });
  }, [motion, mobileControls, fontSize]);
  useLayoutEffect(() => {
    const place = pendingPlace.current;
    if (!place || !pdf || (!index.length && !indexError) || !area.width) return;
    if (place.mode === 'scroll')
      setScrollTarget({ page: place.page, offset: place.pageOffset });
    else viewport.current?.scrollTo({ left: place.left, top: place.top });
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
    viewport.current?.scrollTo({
      left: activeColumn.x * leafWidth,
      top: activeColumn.y * leafWidth * baseRatio,
    });
  }, [mode, column, page, area.width, index.length]);
  function chooseMode(next: ReadingMode) {
    if (next === 'scroll') setScrollTarget({ page, offset: 0 });
    else viewport.current?.scrollTo({ left: 0, top: 0 });
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
      if (n !== page) setColumn(0);
      turningRef.current = false;
      setTurning(null);
      setPage(value);
      setJump(null);
      if (mode === 'scroll') setScrollTarget({ page: value, offset: 0 });
      else viewport.current?.scrollTo({ left: 0, top: 0 });
      setPanel(null);
      setArticleId(null);
      if (remember) {
        zoomRef.current = 1;
        setZoom(1);
        setColumn(0);
      }
      queuedTurn.current = 0;
    },
    [issue.pageCount, page, articleId, capturePlace, mode],
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
      // Zoomed turns are instant: the curl would rasterize enlarged pages and
      // the reader lands the next page at its edge anyway.
      if (
        !pdf ||
        motion === 'simple' ||
        mode === 'scroll' ||
        zoomRef.current > 1.01 ||
        matchMedia('(prefers-reduced-motion:reduce)').matches
      ) {
        if (zoomRef.current > 1.01)
          restoreView.current = { left: dir > 0 ? 0 : 1e7, top: 0 };
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
      mode,
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
    const queued = queuedTurn.current;
    turningRef.current = false;
    setTurning(null);
    if (commit && next) navigate(next, false);
    // navigate clears abandoned input; a completed curl must retain its next turn.
    queuedTurn.current = commit ? queued : 0;
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
    revealArmed.current = false;
    clearTimeout(revealTimer.current);
    setRevealed(false);
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
        paper =
          (clientY === undefined
            ? null
            : [
                ...(el?.querySelectorAll<HTMLElement>('.continuous-page') ||
                  []),
              ].find((node) => {
                const box = node.getBoundingClientRect();
                return clientY >= box.top && clientY <= box.bottom;
              })) ||
          el?.querySelector<HTMLElement>('.open-magazine, .continuous-page');
      const next = clampZoom(value);
      if (el && paper) {
        const box = el.closest('.document-reader')
            ? {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.visualViewport?.height || window.innerHeight,
              }
            : el.getBoundingClientRect(),
          book = paper.getBoundingClientRect();
        const cx = clientX ?? box.left + box.width / 2,
          cy = clientY ?? box.top + box.height / 2;
        zoomAnchor.current = {
          x: (cx - book.left) / book.width,
          y: (cy - book.top) / book.height,
          clientX: cx,
          clientY: cy,
          selector: paper.dataset.page
            ? `.continuous-page[data-page="${paper.dataset.page}"]`
            : '.open-magazine',
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
      ?.querySelector<HTMLElement>(anchor?.selector || '.open-magazine')
      ?.getBoundingClientRect();
    if (el && anchor && book) {
      const port = scrollPort(el, documentReading);
      const current = port.read();
      port.to({
        left: current.left + book.left + anchor.x * book.width - anchor.clientX,
        top: current.top + book.top + anchor.y * book.height - anchor.clientY,
      });
      zoomAnchor.current = null;
    }
  }, [zoom]);
  useLayoutEffect(() => {
    if (!restoreView.current || !viewport.current) return;
    scrollPort(viewport.current, documentReading).to(restoreView.current);
    restoreView.current = null;
  }, [page, zoom]);
  useEffect(() => {
    if (!pdf || turning || mode === 'scroll' || zoom > 1) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () =>
        warmTurnPages(
          pdf,
          mobile
            ? [end + 1]
            : [start, end, end + 1, end + 2, start - 2, start - 1],
          leafWidth,
          abort.signal,
        ),
      220,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [pdf, start, end, leafWidth, turning, mode, zoom, mobile]);
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
    // Touchscreens use the pinch preview below; Safari's gesture events are
    // only for trackpads, otherwise each pinch is processed twice.
    const touchDevice = navigator.maxTouchPoints > 0;
    let gestureZoom = 1;
    const gestureStart = (event: Event) => {
      if (touchDevice) return;
      event.preventDefault();
      gestureZoom = zoomRef.current;
    };
    const gestureChange = (event: Event) => {
      if (touchDevice) return;
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
    const pinch = createPinchPreview({
      getSurface: () =>
        el.querySelector<HTMLElement>('.open-magazine, .continuous-pages'),
      getZoom: () => zoomRef.current,
      commit: (value, x, y) => changeZoom(value, x, y),
    });
    let touchStart: {
      x: number;
      y: number;
      pinched: boolean;
      atLeft: boolean;
      atRight: boolean;
    } | null = null;
    const touchBegin = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const two = e.touches.length === 2;
      if (two) pinch.begin(e.touches);
      // Boundary state is read when the finger lands: a pan that reaches the
      // edge during this gesture must not become a turn.
      const edges = horizontalEdges(
        el.scrollLeft,
        el.clientWidth,
        el.scrollWidth,
      );
      touchStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        pinched: two,
        ...edges,
      };
    };
    const touchMove = (e: TouchEvent) => {
      if (!touchStart || e.touches.length !== 2) return;
      e.preventDefault();
      touchStart.pinched = true;
      pinch.move(e.touches);
    };
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.end();
      if (!touchStart || e.touches.length) return;
      const t = touchStart;
      touchStart = null;
      if (mode === 'scroll') return;
      const direction = swipeTurn({
        dx: e.changedTouches[0].clientX - t.x,
        dy: e.changedTouches[0].clientY - t.y,
        zoomed: zoomRef.current > 1.01,
        atLeft: t.atLeft,
        atRight: t.atRight,
        pinched: t.pinched,
      });
      if (direction) turn(direction);
    };
    const touchCancel = () => {
      pinch.cancel();
      touchStart = null;
    };
    el.addEventListener('touchstart', touchBegin, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('touchend', touchEnd, { passive: true });
    el.addEventListener('touchcancel', touchCancel, { passive: true });
    el.addEventListener('gesturestart', gestureStart, { passive: false });
    el.addEventListener('gesturechange', gestureChange, { passive: false });
    return () => {
      pinch.cancel();
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', touchBegin);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd);
      el.removeEventListener('touchcancel', touchCancel);
      el.removeEventListener('gesturestart', gestureStart);
      el.removeEventListener('gesturechange', gestureChange);
    };
  }, [turn, changeZoom, mode]);
  // Wire the phone gesture layer now that turn and changeZoom exist.
  gestureActions.current.turn = turn;
  gestureActions.current.doubleTap = (x, y) =>
    changeZoom(zoomRef.current > 1.01 ? 1 : 2, x, y);
  gestureActions.current.edgeTurns = () =>
    mode === 'spread' && zoomRef.current <= 1.01 && !articleId && !!pdf;
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
    } else {
      // Phones open paged at Fit, like a magazine; Scroll stays an option.
      restored.current = true;
    }
    const prefs = loadPreferences();
    setMotion(prefs.motion);
    setMobileControls(prefs.mobileControls);
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
    const mq = matchMedia(MOBILE_QUERY);
    setMobile(mq.matches);
    const change = () => {
      setMobile(mq.matches);
    };
    mq.addEventListener('change', change);
    close.current?.focus();
    return () => {
      mq.removeEventListener('change', change);
      clearTimeout(toastTimer.current);
      clearTimeout(revealTimer.current);
    };
  }, [issue.id, issue.pageCount, announce]);

  useEffect(() => {
    let disposed = false;
    let document: PDFDocumentProxy | undefined;
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
          cMapUrl: new URL(
            'reader-assets/pdfjs/cmaps/',
            window.document.baseURI,
          ).href,
          cMapPacked: true,
          standardFontDataUrl: new URL(
            'reader-assets/pdfjs/standard_fonts/',
            window.document.baseURI,
          ).href,
          wasmUrl: new URL('reader-assets/pdfjs/wasm/', window.document.baseURI)
            .href,
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
        document = doc;
        setPDF(doc);
        setLoading(100);
      })
      .catch(() => {
        if (!disposed)
          setError('This issue couldn’t be opened. Please try again.');
      });
    fetch(
      asset(
        issue.id,
        issue.indexEncoding === 'gzip' ? 'index.json.gz' : 'index.json',
      ),
      { signal: abort.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error('Missing index');
        if (issue.indexEncoding === 'gzip') {
          const bytes = new Uint8Array(await r.arrayBuffer());
          // Hosts may transparently decode Content-Encoding before fetch.
          if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
            return JSON.parse(new TextDecoder().decode(bytes));
          const compressed = new Response(bytes).body!;
          return new Response(
            compressed.pipeThrough(new DecompressionStream('gzip')),
          ).json();
        }
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
      if (document) pageRasters(document).dispose();
      void task?.destroy();
    };
  }, [issue.id, issue.pageCount, retry]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const update = () => {
      const view = scrollPort(el, documentReading).read();
      const width = el.clientWidth || dialog.current?.clientWidth || 0;
      setArea((old) =>
        old.width === width && old.height === view.height
          ? old
          : { width, height: view.height },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.visualViewport?.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [pdf, panel, quiet, documentReading, articleId]);
  useEffect(() => {
    if (quiet) dialog.current?.focus({ preventScroll: true });
    else close.current?.focus();
  }, [quiet]);
  const contentsTrigger = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => {
    setPanel(null);
    controls.reveal();
    requestAnimationFrame(() =>
      contentsTrigger.current?.focus({ preventScroll: true }),
    );
  }, []);
  useEffect(() => {
    if (panel)
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>(
            panel === 'search'
              ? '.navigation-search input'
              : '.reader-navigation button',
          )
          ?.focus(),
      );
    if (appearance)
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>('.appearance-popover button')
          ?.focus(),
      );
  }, [panel, appearance]);
  useEffect(() => {
    if (appearance) {
      settingsReturn.current = document.activeElement as HTMLElement | null;
      return;
    }
    const trigger = settingsReturn.current;
    settingsReturn.current = null;
    if (!trigger) return;
    controls.reveal();
    const frame = requestAnimationFrame(() => {
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [appearance, controls.reveal]);
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
    const entry = issue.contents.find(
      (c) => physicalPage(c.printedPage, issue) === n,
    );
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
            appearance
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
        if (appearance) {
          setAppearance(false);
          return;
        }
        if (panel) closeNavigation();
        else if (quiet) setFocus(false);
        else if (articleId) returnToPrint();
        else onClose();
        return;
      }
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c') {
        e.preventDefault();
        if (!panel) setQuery('');
        setPanel(panel ? null : 'contents');
        return;
      }
      if (e.key === 'f') {
        if (mobile) {
          controls.visible ? controls.hide() : controls.reveal();
          return;
        }
        setFocus(!quiet);
        return;
      }
      if (articleId || panel || appearance) return;
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
    mobile,
    panel,
    issue.pageCount,
    turning,
    appearance,
    articleId,
    setFocus,
    changeZoom,
    closeNavigation,
    controls.visible,
    controls.hide,
    controls.reveal,
    returnToPrint,
  ]);
  function submitJump() {
    const n = parsePrintedPage(
      jump ?? '',
      issue.pageCount,
      issue.printOffset,
      issue.backMatterPages,
    );
    if (n !== null) navigate(n);
    else {
      announce(
        `Enter a printed page from 1 to ${issue.pageCount - 4}, or “cover”.`,
      );
      setJump(null);
    }
  }
  const label = (n: number) =>
    pageLabel(n, issue.pageCount, issue.printOffset, issue.backMatterPages);
  return (
    <div
      ref={dialog}
      tabIndex={-1}
      data-mobile-controls={mobileControls}
      data-modal-open={!!panel || appearance}
      className={`reader reader-v3 ${mobile ? `mobile-reader ${documentReading ? 'document-reader' : ''} ${controls.visible ? 'mobile-controls-visible' : ''} ${mode !== 'spread' || zoom > 1 ? 'mobile-enlarged' : ''}` : 'desktop-reader'} ${quiet ? 'quiet' : ''} ${arriving ? 'arriving' : ''} ${revealed || panel || appearance ? 'controls-revealed' : ''} ${articleId ? 'reading-article' : ''}`}
      onPointerMove={(e) => {
        if (mobile || e.pointerType !== 'mouse') return;
        // Revealing hidden chrome takes intent: a thin edge band plus a short
        // dwell, and never while the pointer is working the page — otherwise
        // reaching for a page corner summons the toolbar over it.
        const box = e.currentTarget.getBoundingClientRect();
        const working =
          turningRef.current ||
          !!cornerDrag.current ||
          e.buttons !== 0 ||
          !!(e.target as HTMLElement).closest?.('.page-corner');
        const inZone =
          !working &&
          (e.clientY < box.top + 56 || e.clientY > box.bottom - 44);
        if (!inZone) {
          revealArmed.current = false;
          clearTimeout(revealTimer.current);
          setRevealed(false);
          return;
        }
        if (revealed || revealArmed.current) return;
        revealArmed.current = true;
        revealTimer.current = setTimeout(() => setRevealed(true), 200);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${issue.issue} full issue reader`}
    >
      {!mobile && (
        <header className="reader-header" inert={!!panel || appearance}>
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
            <button
              ref={contentsTrigger}
              className="contents-trigger"
              aria-label="Contents"
              aria-expanded={!!panel}
              title="Contents · C"
              onClick={() => {
                if (!panel) setQuery('');
                setPanel(panel ? null : 'contents');
                setAppearance(false);
              }}
            >
              <PanelLeftOpen size={18} />
              <span>Contents</span>
            </button>
          </div>
          <img
            className="reader-brand"
            src="brand/atlantic-logo.svg"
            alt="The Atlantic"
          />
          <div className="reader-header-tools">
            <div className="reader-folio">
              <span className="folio-date">{issue.issue}</span>
              {!articleId && (
                <label className="page-jump">
                  <span className="folio-page">Page</span>
                  <input
                    aria-label="Go to printed page number, or type cover"
                    size={Math.max(2, (jump ?? label(page)).length)}
                    value={jump ?? label(page)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setJump(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        submitJump();
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setJump(null);
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      if (jump !== null) submitJump();
                    }}
                  />
                  <span className="folio-of">
                    of{' '}
                    {issue.pageCount -
                      (issue.printOffset ?? 2) -
                      (issue.backMatterPages ?? 2)}
                  </span>
                </label>
              )}
            </div>
            {!articleId && (zoom !== 1 || mode !== 'spread') && (
              <button
                className="fit-chip"
                aria-label="Fit the page to the screen"
                onClick={() => chooseMode('spread')}
              >
                <span>
                  {zoom !== 1
                    ? `${Math.round(zoom * 100)}%`
                    : mode === 'page'
                      ? 'Page width'
                      : mode === 'column'
                        ? 'Column'
                        : 'Scroll'}
                </span>
                <strong>Fit</strong>
              </button>
            )}
            <button
              className="reader-icon"
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
              className="reader-icon"
              aria-label="Reading settings"
              aria-expanded={appearance}
              title="Reading settings"
              onClick={() => {
                setAppearance((v) => !v);
                setPanel(null);
              }}
            >
              <Settings2 size={18} />
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
      )}
      {!mobile && quiet && (
        <button
          className="focus-access"
          onClick={() => setRevealed((v) => !v)}
          aria-label="Show reading controls"
        >
          Show reading controls
        </button>
      )}
      <div className="reader-workspace" inert={!!panel || appearance}>
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
            className={`page-viewport ${zoom > 1 ? 'zoomed' : ''} ${mode === 'scroll' ? 'continuous-viewport' : ''}`}
            style={
              articleId
                ? {
                    visibility: 'hidden',
                    pointerEvents: 'none',
                    ...(documentReading ? { display: 'none' } : {}),
                  }
                : undefined
            }
            aria-hidden={!!articleId}
            inert={!!articleId}
            onPointerDown={(e) => {
              if (
                e.pointerType !== 'mouse' ||
                zoom <= 1 ||
                e.button !== 0 ||
                (e.target as HTMLElement).closest('.textLayer span')
              )
                return;
              const el = viewport.current!;
              const position = scrollPort(el, documentReading).read();
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                left: position.left,
                top: position.top,
              };
              el.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const d = drag.current;
              scrollPort(viewport.current!, documentReading).to({
                left: d.left - (e.clientX - d.x),
                top: d.top - (e.clientY - d.y),
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {pdf && mode === 'scroll' && !articleId && (
              <ContinuousPages
                pdf={pdf}
                issue={issue}
                index={index}
                width={leafWidth}
                viewport={viewport}
                target={scrollTarget}
                initialPage={page}
                mobile={mobile}
                documentScroll={documentReading && !articleId}
                query={query}
                onPosition={scrollPosition}
                onPaint={paintedPage}
                onZoom={(x, y) =>
                  changeZoom(zoomRef.current === 1 ? 2 : 1, x, y)
                }
              />
            )}
            {pdf && mode !== 'scroll' && (
              <div
                className={`page-surface ${visible.length === 2 ? 'spread' : 'single'} ${turning ? 'is-turning' : ''}`}
              >
                <div className="open-magazine">
                  {visible.map((n) => (
                    <div className="leaf-wrap" key={n}>
                      <Leaf
                        pdf={pdf}
                        printOffset={issue.printOffset}
                        backMatterPages={issue.backMatterPages}
                        onPaint={paintedPage}
                        number={n}
                        width={leafWidth}
                        id={issue.id}
                        index={index[n - 1]}
                        query={query}
                        onDoubleClick={(x, y) => {
                          // Phones resolve double-taps in the gesture layer.
                          if (!mobile)
                            changeZoom(zoomRef.current === 1 ? 2 : 1, x, y);
                        }}
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
          {!mobile && pdf && !articleId && (
            <>
              <button
                className="edge-arrow left"
                aria-label="Previous page"
                disabled={start === 1}
                onClick={() => turn(-1)}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                className="edge-arrow right"
                aria-label="Next page"
                disabled={end === issue.pageCount}
                onClick={() => turn(1)}
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
          {!mobile && pdf && (
            <div className="desk-caption">
              <button
                className="caption-story"
                onClick={() => {
                  setQuery('');
                  setPanel('contents');
                }}
                aria-label={`Current story: ${locationTitle(issue, page)}. Open contents`}
              >
                <span>{articleId ? 'Reading as article' : 'Now reading'}</span>
                <strong>{locationTitle(issue, page)}</strong>
              </button>
              {(currentEdition || articleId) && (
                <button
                  className="caption-article"
                  aria-pressed={!!articleId}
                  onClick={articleId ? returnToPrint : openArticle}
                >
                  {articleId ? 'Back to print' : 'Read as article'}
                </button>
              )}
            </div>
          )}

          {articleId && (
            <ArticleView
              key={articleId}
              id={articleId}
              fontSize={fontSize}
              documentScroll={documentReading}
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
          {!articleId && mode === 'column' && columns.length > 1 && (
            <div
              className="column-navigation"
              role="group"
              aria-label="Read print columns"
            >
              <button
                aria-label="Previous column"
                disabled={column === 0}
                onClick={() => setColumn((n) => Math.max(0, n - 1))}
              >
                <ArrowLeft size={16} />
              </button>
              <span>
                Column {Math.min(column + 1, columns.length)} of{' '}
                {columns.length}
              </span>
              <button
                aria-label="Next column"
                disabled={column >= columns.length - 1}
                onClick={() =>
                  setColumn((n) => Math.min(columns.length - 1, n + 1))
                }
              >
                <ArrowRight size={16} />
              </button>
            </div>
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
      {!articleId && pdf && (
        <div className="reader-progress" aria-hidden="true">
          <span
            style={{ width: `${Math.min(100, (end / issue.pageCount) * 100)}%` }}
          />
        </div>
      )}
      {mobile && (
        <>
          <button
            className="mobile-controls-access"
            inert={!!panel || appearance}
            aria-hidden={!!panel || appearance}
            onClick={controls.reveal}
            aria-label="Show reading controls"
          >
            Show reading controls
          </button>
          <nav
            className="mobile-top-bar"
            aria-label="Issue"
            inert={!controls.visible || !!panel || appearance}
            aria-hidden={!controls.visible}
          >
            <button
              ref={close}
              className="back-to-library"
              onClick={onClose}
              aria-label="Return to cover index"
            >
              <ArrowLeft size={20} />
              <span>Archive</span>
            </button>
            <span className="mobile-issue">{issue.issue}</span>
            <button
              ref={contentsTrigger}
              className="mobile-contents"
              onClick={() => {
                setQuery('');
                setPanel('contents');
              }}
              aria-expanded={!!panel}
            >
              <PanelLeftOpen size={19} />
              <span>Contents</span>
            </button>
          </nav>
          <nav
            className="mobile-reader-bar"
            aria-label="Reading controls"
            inert={!controls.visible || !!panel || appearance}
            aria-hidden={!controls.visible}
          >
            <button
              aria-label="Previous page"
              disabled={start === 1 || !!articleId}
              onClick={() => turn(-1)}
            >
              <ChevronLeft size={22} />
            </button>
            <label className="mobile-page-jump">
              <input
                aria-label="Go to printed page number, or type cover"
                size={Math.max(3, (jump ?? label(page)).length)}
                value={jump ?? label(page)}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setJump(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submitJump();
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setJump(null);
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
              disabled={end === issue.pageCount || !!articleId}
              onClick={() => turn(1)}
            >
              <ChevronRight size={22} />
            </button>
            <span className="bar-spacer" aria-hidden="true" />
            {(currentEdition || articleId) && (
              <button
                className="bar-article"
                aria-pressed={!!articleId}
                title={articleId ? 'Back to print' : 'Read with adjustable text'}
                onClick={articleId ? returnToPrint : openArticle}
              >
                {articleId ? 'Print' : 'Article'}
              </button>
            )}
            <button
              aria-label={
                bookmarkPages.includes(page) ? 'Remove bookmark' : 'Save page'
              }
              aria-pressed={bookmarkPages.includes(page)}
              onClick={bookmark}
            >
              <Bookmark
                size={20}
                fill={bookmarkPages.includes(page) ? 'currentColor' : 'none'}
              />
            </button>
            <button
              aria-label="Reading settings"
              aria-expanded={appearance}
              onClick={() => setAppearance(true)}
            >
              <Settings2 size={20} />
            </button>
          </nav>
        </>
      )}
      {panel && (
        <div className="reader-navigation-layer">
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
            onClose={closeNavigation}
          />
        </div>
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
            <div className="sheet-handle" aria-hidden="true" />
            <div className="popover-title">
              <strong>Reading settings</strong>
              <button
                aria-label="Close reading settings"
                onClick={() => setAppearance(false)}
              >
                <X size={18} />
              </button>
            </div>
            <fieldset className="reader-theme-options segmented">
              <legend>Appearance</legend>
              <button
                aria-pressed={theme === 'light'}
                onClick={() => onTheme('light')}
              >
                Light
              </button>
              <button
                aria-pressed={theme === 'dark'}
                onClick={() => onTheme('dark')}
              >
                Dark
              </button>
            </fieldset>
            {articleId ? (
              <fieldset className="stepper">
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
                <fieldset className="segmented">
                  <legend>View</legend>
                  {(['spread', 'page', 'column', 'scroll'] as const).map(
                    (v) => (
                      <button
                        key={v}
                        aria-pressed={mode === v}
                        onClick={() => chooseMode(v)}
                      >
                        {v === 'spread'
                          ? 'Fit'
                          : v === 'page'
                            ? 'Page width'
                            : v === 'column'
                              ? 'Column'
                              : 'Scroll'}
                      </button>
                    ),
                  )}
                </fieldset>
                {mode === 'column' && (
                  <fieldset className="segmented">
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
                <fieldset className="stepper">
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
                {mode !== 'scroll' && (
                  <fieldset className="segmented">
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
                )}
              </>
            )}
            {typeof document !== 'undefined' &&
              document.documentElement.dataset.nativeReader !== 'true' && (
                <BrowserReadingOptions
                  installHelp={mobile}
                  onEnter={() => setAppearance(false)}
                />
              )}
            {mobile && (
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={mobileControls === 'always'}
                  onChange={(e) =>
                    setMobileControls(e.target.checked ? 'always' : 'auto')
                  }
                />
                Always show controls
              </label>
            )}
            <p className="settings-help">
              {mobile
                ? 'Tap the edges to turn, the center for controls. Double-tap or pinch to zoom. When zoomed, swipe from the edge of the page to turn.'
                : 'Arrows turn pages · C Contents · F Focus · B Save · / Search · Pinch or ⌘-scroll to zoom'}
            </p>
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
