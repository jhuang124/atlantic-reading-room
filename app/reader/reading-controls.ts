/** Gesture recognition for the reader's chrome and phone page turning.
 *
 * One decision layer resolves every page tap:
 * - a tap in the center toggles the controls;
 * - a tap in the left or right edge zone turns the page, but only when the
 *   caller says edge turns are allowed (Fit, not zoomed, not an article);
 * - a second tap inside the double-tap window is a double-tap (zoom) and
 *   cancels the pending single tap so a page never turns under a zoom;
 * - drags, scrolls, pinches, long presses and text selection hide the
 *   controls and never toggle them.
 *
 * Single taps resolve after the double-tap window closes. That short delay is
 * deliberate: a second tap cannot undo a reveal that has already started. */
export type TapZone = 'left' | 'center' | 'right';

/** Split the width into a left edge, a center, and a right edge. */
export function tapZone(x: number, width: number, edge = 0.22): TapZone {
  if (width <= 0) return 'center';
  const ratio = x / width;
  if (ratio < edge) return 'left';
  if (ratio > 1 - edge) return 'right';
  return 'center';
}

export const DOUBLE_TAP_MS = 230;

export function createReadingTap({
  toggle,
  hide,
  turn = () => {},
  doubleTap = () => {},
  schedule = (fn: () => void) => setTimeout(fn, DOUBLE_TAP_MS),
  cancel = (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}: {
  toggle: () => void;
  hide: () => void;
  turn?: (direction: number) => void;
  doubleTap?: (x: number, y: number) => void;
  schedule?: (fn: () => void) => ReturnType<typeof setTimeout>;
  cancel?: (id: ReturnType<typeof setTimeout>) => void;
}) {
  let start: { x: number; y: number; time: number } | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let pendingAt: { x: number; y: number } | null = null;
  let firstTap: { x: number; y: number } | null = null;
  let second = false;
  const clear = () => {
    if (pending !== undefined) cancel(pending);
    pending = undefined;
    pendingAt = null;
  };
  return {
    down(x: number, y: number, time: number) {
      second =
        pending !== undefined &&
        !!pendingAt &&
        Math.hypot(x - pendingAt.x, y - pendingAt.y) < 40;
      firstTap = second ? pendingAt : null;
      clear();
      start = { x, y, time };
    },
    move(x: number, y: number) {
      if (start && Math.hypot(x - start.x, y - start.y) > 8) {
        start = null;
        second = false;
        clear();
        hide();
      }
    },
    /** `zone` is where the tap landed; `edgeTurns` says whether edge zones
     * turn pages right now. */
    up(
      time: number,
      selected: boolean,
      zone: TapZone = 'center',
      edgeTurns = false,
    ) {
      const point = start;
      const tap = !!point && time - point.time < 350 && !selected;
      start = null;
      if (!tap || !point) {
        second = false;
        return;
      }
      if (second) {
        second = false;
        // Zoom where the finger first landed; the second tap wobbles.
        doubleTap(firstTap?.x ?? point.x, firstTap?.y ?? point.y);
        firstTap = null;
        return;
      }
      pendingAt = { x: point.x, y: point.y };
      pending = schedule(() => {
        pending = undefined;
        pendingAt = null;
        if (edgeTurns && zone !== 'center') {
          hide();
          turn(zone === 'left' ? -1 : 1);
        } else toggle();
      });
    },
    reading() {
      start = null;
      second = false;
      clear();
      hide();
    },
    cancel() {
      start = null;
      second = false;
      clear();
    },
  };
}

/** Decide whether a finished horizontal swipe turns a page.
 *
 * At Fit any decisive horizontal swipe turns. When zoomed, the gesture must
 * have started with the page already resting against the edge in the swipe
 * direction: a pan that merely reaches the edge never turns. */
export function swipeTurn({
  dx,
  dy,
  zoomed,
  atLeft,
  atRight,
  pinched = false,
  distance = 70,
}: {
  dx: number;
  dy: number;
  zoomed: boolean;
  atLeft: boolean;
  atRight: boolean;
  pinched?: boolean;
  distance?: number;
}): -1 | 0 | 1 {
  if (pinched) return 0;
  if (Math.abs(dx) < distance || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  const direction = dx < 0 ? 1 : -1;
  if (!zoomed) return direction;
  if (direction > 0 && atRight) return 1;
  if (direction < 0 && atLeft) return -1;
  return 0;
}

/** Where a scroll port rests horizontally, with tolerance for momentum. */
export function horizontalEdges(
  left: number,
  width: number,
  scrollWidth: number,
  tolerance = 6,
) {
  return {
    atLeft: left <= tolerance,
    atRight: left + width >= scrollWidth - tolerance,
  };
}
