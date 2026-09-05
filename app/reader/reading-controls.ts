/** Gesture recognition for the reader's chrome. A tap toggles controls only
 * after double-tap, scrolling, selection and multi-touch have been ruled out. */
export function createReadingTap({
  toggle,
  hide,
  schedule = (fn: () => void) => setTimeout(fn, 280),
  cancel = (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}: {
  toggle: () => void;
  hide: () => void;
  schedule?: (fn: () => void) => ReturnType<typeof setTimeout>;
  cancel?: (id: ReturnType<typeof setTimeout>) => void;
}) {
  let start: { x: number; y: number; time: number } | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let second = false;
  const clear = () => {
    if (pending !== undefined) cancel(pending);
    pending = undefined;
  };
  return {
    down(x: number, y: number, time: number) {
      second = pending !== undefined;
      clear();
      start = { x, y, time };
    },
    move(x: number, y: number) {
      if (start && Math.hypot(x - start.x, y - start.y) > 8) {
        start = null;
        clear();
        hide();
      }
    },
    up(time: number, selected: boolean) {
      const tap = start && time - start.time < 350 && !selected && !second;
      start = null;
      if (tap)
        pending = schedule(() => {
          pending = undefined;
          toggle();
        });
    },
    reading() {
      start = null;
      clear();
      hide();
    },
    cancel() {
      start = null;
      clear();
    },
  };
}
