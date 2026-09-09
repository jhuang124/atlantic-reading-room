import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createReadingTap, tapZone } from './reading-controls';

export type ReadingGestureActions = {
  /** Turn a page from an edge tap. */
  turn: (direction: number) => void;
  /** Zoom from a double-tap at a point. */
  doubleTap: (x: number, y: number) => void;
  /** Whether edge taps may turn pages right now (Fit, not zoomed, print). */
  edgeTurns: () => boolean;
};

/** Phone chrome visibility plus the shared tap decision layer. Controls start
 * visible on entry and hide on the first reading gesture; explicit button use
 * never hides them. */
export default function useReadingControls(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  always: boolean,
  blocked: boolean,
  actions: ReadingGestureActions,
) {
  const [revealed, setRevealed] = useState(true);
  const keyboard = useRef(false);
  const latest = useRef(actions);
  latest.current = actions;
  const reveal = useCallback(() => setRevealed(true), []);
  const hide = useCallback(() => {
    if (!always && !blocked && !keyboard.current) setRevealed(false);
  }, [always, blocked]);
  useEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const taps = createReadingTap({
      toggle: () => setRevealed((v) => !v),
      hide,
      turn: (d) => latest.current.turn(d),
      doubleTap: (x, y) => latest.current.doubleTap(x, y),
    });
    const withinPage = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest('.page-viewport, .article-scroll') &&
      !target.closest(
        'button, a, input, select, textarea, [contenteditable], .page-corner',
      );
    let lastX = 0;
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
      lastX = e.clientX;
      taps.down(e.clientX, e.clientY, e.timeStamp);
    };
    const move = (e: PointerEvent) => taps.move(e.clientX, e.clientY);
    const up = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const inArticle =
        e.target instanceof Element && !!e.target.closest('.article-scroll');
      taps.up(
        e.timeStamp,
        !!window.getSelection()?.toString(),
        tapZone(lastX - box.left, box.width),
        !inArticle && latest.current.edgeTurns(),
      );
    };
    const scroll = (e: Event) => {
      if (withinPage(e.target)) taps.reading();
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
    el.addEventListener('touchmove', scroll, { passive: true });
    el.addEventListener('wheel', scroll, { passive: true });
    window.addEventListener('keydown', key);
    return () => {
      taps.cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('touchstart', multi);
      el.removeEventListener('touchmove', scroll);
      el.removeEventListener('wheel', scroll);
      window.removeEventListener('keydown', key);
    };
  }, [root, enabled, blocked, hide, reveal]);
  return { visible: always || blocked || revealed, reveal, hide };
}
