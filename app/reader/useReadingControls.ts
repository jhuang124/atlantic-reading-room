import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createReadingTap } from './reading-controls';

export default function useReadingControls(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  always: boolean,
  blocked: boolean,
) {
  const [revealed, setRevealed] = useState(true);
  const keyboard = useRef(false);
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
    });
    const withinPage = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest('.page-viewport, .article-scroll') &&
      !target.closest(
        'button, a, input, select, textarea, [contenteditable], .page-corner',
      );
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
      taps.down(e.clientX, e.clientY, e.timeStamp);
    };
    const move = (e: PointerEvent) => taps.move(e.clientX, e.clientY);
    const up = (e: PointerEvent) =>
      taps.up(e.timeStamp, !!window.getSelection()?.toString());
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
    const double = () => taps.cancel();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', double);
    el.addEventListener('dblclick', double);
    el.addEventListener('touchstart', multi, { passive: true });
    el.addEventListener('touchmove', scroll, { passive: true });
    el.addEventListener('wheel', scroll, { passive: true });
    window.addEventListener('keydown', key);
    return () => {
      taps.cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', double);
      el.removeEventListener('dblclick', double);
      el.removeEventListener('touchstart', multi);
      el.removeEventListener('touchmove', scroll);
      el.removeEventListener('wheel', scroll);
      window.removeEventListener('keydown', key);
    };
  }, [root, enabled, blocked, hide, reveal]);
  return { visible: always || blocked || revealed, reveal, hide };
}
