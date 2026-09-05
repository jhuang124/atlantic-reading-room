import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ReadableIssue } from './catalog';
import type { IndexedPage } from './model';
import {
  scrollLayout,
  pageAtOffset,
  scrollWindow,
  scrollDestination,
} from './scroll-layout';
import Leaf from './Leaf';
import { scrollPort } from './scroll-port';

export type ScrollTarget = { page: number; offset?: number };
export default function ContinuousPages({
  pdf,
  issue,
  index,
  width,
  viewport,
  target,
  initialPage,
  mobile = false,
  documentScroll = false,
  query,
  onPosition,
  onPaint,
  onZoom,
}: {
  pdf: PDFDocumentProxy;
  issue: ReadableIssue;
  index: IndexedPage[];
  width: number;
  viewport: RefObject<HTMLDivElement | null>;
  target: ScrollTarget | null;
  initialPage: number;
  mobile?: boolean;
  documentScroll?: boolean;
  query: string;
  onPosition: (page: number, offset: number) => void;
  onPaint: () => void;
  onZoom: (x: number, y: number) => void;
}) {
  const layout = useMemo(
    () =>
      scrollLayout(
        pdf.numPages,
        width,
        index.map((p) => p.height / p.width),
        mobile ? 12 : undefined,
      ),
    [pdf.numPages, width, index, mobile],
  );
  const position = useRef({ page: initialPage, offset: 0 });
  const lastTarget = useRef<ScrollTarget | null>(null);
  const [range, setRange] = useState({
    first: initialPage - 1,
    last: initialPage - 1,
  });
  const measure = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const view = scrollPort(el, documentScroll).read();
    const row = layout.pages[pageAtOffset(layout.pages, view.top + 12)];
    position.current = {
      page: row.page,
      offset: Math.max(0, Math.min(1, (view.top - row.top) / row.height)),
    };
    onPosition(position.current.page, position.current.offset);
    const next = scrollWindow(layout.pages, view.top, view.height);
    setRange((old) =>
      old.first === next.first && old.last === next.last ? old : next,
    );
  }, [layout, viewport, onPosition, documentScroll]);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const destination =
      target && target !== lastTarget.current ? target : position.current;
    lastTarget.current = target;
    scrollPort(el, documentScroll).to({
      top: scrollDestination(
        layout.pages,
        destination.page,
        destination.offset,
      ),
    });
    measure();
  }, [layout, target, viewport, measure, documentScroll]);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    const target = scrollPort(el, documentScroll).target;
    target.addEventListener('scroll', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update);
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      target.removeEventListener('scroll', update);
      window.visualViewport?.removeEventListener('resize', update);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [viewport, measure, documentScroll]);
  return (
    <div
      className="continuous-pages"
      style={{ width, height: layout.height + (mobile ? 76 : 0) }}
    >
      {layout.pages.slice(range.first, range.last + 1).map((row) => (
        <div
          className="continuous-page"
          key={row.page}
          style={{ top: row.top }}
          data-page={row.page}
        >
          <Leaf
            pdf={pdf}
            id={issue.id}
            number={row.page}
            width={width}
            index={index[row.page - 1]}
            query={query}
            printOffset={issue.printOffset}
            backMatterPages={issue.backMatterPages}
            onPaint={onPaint}
            onDoubleClick={onZoom}
          />
        </div>
      ))}
    </div>
  );
}
