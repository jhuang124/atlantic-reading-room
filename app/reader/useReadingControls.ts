import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  createReadingTap,
  createScrollReveal,
  tapZone,
} from './reading-controls';

export type ReadingGestureActions = {
  /** Turn a page from an edge tap. */
  turn: (direction: number) => void;
  /** Zoom from a double-tap at a point. */
  doubleTap: (x: number, y: number) => void;
  /** Whether edge taps may turn pages right now (Pages view at Fit). */
  edgeTurns: () => boolean;
  /** The reading surface's vertical scroll offset (Scroll view). */
  scrollTop: () => number;
};

/** Phone chrome visibility plus the shared tap decision layer.
 *
 * Pages: controls start visible on entry and hide on the first reading
 * gesture; a center tap toggles them; control-driven turns keep them.
 * Scroll: they hide after 24px of downward scrolling and return on any upward
 * scroll or a tap. */
export default function useReadingControls(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  blocked: boolean,
  scrolling: boolean,
  actions: ReadingGestureActions,
) {
  const [revealed, setRevealed] = useState(true);
  const keyboard = useRef(false);
  const latest = useRef(actions);
  latest.current = actions;
  const holdRef = useRef<() => void>(() => {});
  const reveal = useCallback(() => setRevealed(true), []);
  const hide = useCallback(() => {
    if (!blocked && !keyboard.current) setRevealed(false);
  }, [blocked]);
  const hold = useCallback(() => holdRef.current(), []);
  useEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const taps = createReadingTap({
      toggle: () => setRevealed((v) => !v),
      hide,
      turn: (d) => latest.current.turn(d),
      doubleTap: (x, y) => latest.current.doubleTap(x, y),
    });
    const scrollReveal = createScrollReveal({ hide, reveal });
    holdRef.current = () => scrollReveal.hold();
    const withinPage = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest('.page-viewport') &&
      !target.closest(
        'button, a, input, select, textarea, [contenteditable], .page-corner',
      );
    let start = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      keyboard.current = false;
      if (!withinPage(e.target) || blocked) {
        taps.cancel();
        return;
      }
      if (!e.isPrimary) {
        taps.reading();
        return;
      }
      start = { x: e.clientX, y: e.clientY };
      taps.down(e.clientX, e.clientY, e.timeStamp);
    };
    const move = (e: PointerEvent) => {
      // In Scroll a drag is reading, and its direction decides the chrome;
      // it must not hide the bars the way a pan does in Pages.
      if (scrolling) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8)
          taps.cancel();
      } else taps.move(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      taps.up(
        e.timeStamp,
        !!window.getSelection()?.toString(),
        tapZone(start.x - box.left, box.width),
        !scrolling && latest.current.edgeTurns(),
      );
    };
    const reading = (e: Event) => {
      if (!scrolling && withinPage(e.target)) taps.reading();
    };
    const scroll = () => {
      if (scrolling) scrollReveal.scroll(latest.current.scrollTop());
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        keyboard.current = true;
        reveal();
      }
    };
    const multi = (e: TouchEvent) => {
      if (withinPage(e.target) && e.touches.length > 1) taps.reading();
    };
    const cancel = () => taps.cancel();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('touchstart', multi, { passive: true });
    el.addEventListener('touchmove', reading, { passive: true });
    el.addEventListener('wheel', reading, { passive: true });
    // Capture on window sees element scrolls and document scrolls alike.
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    window.addEventListener('keydown', key);
    return () => {
      taps.cancel();
      holdRef.current = () => {};
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('touchstart', multi);
      el.removeEventListener('touchmove', reading);
      el.removeEventListener('wheel', reading);
      window.removeEventListener('scroll', scroll, { capture: true });
      window.removeEventListener('keydown', key);
    };
  }, [root, enabled, blocked, scrolling, hide, reveal]);
  return { visible: blocked || revealed, reveal, hide, hold };
}
