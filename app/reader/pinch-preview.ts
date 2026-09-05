import { clampZoom } from './motion.ts';

type Fingers = ArrayLike<{ clientX: number; clientY: number }>;
const distance = (t: Fingers) =>
  Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

/** Scale the existing pixels while fingers move. Commit layout/PDF resolution
 * once on release, so a pinch never launches a stream of React/PDF renders. */
export function createPinchPreview({
  getSurface,
  getZoom,
  commit,
}: {
  getSurface: () => HTMLElement | null;
  getZoom: () => number;
  commit: (zoom: number, x: number, y: number) => void;
}) {
  let active: {
    surface: HTMLElement;
    distance: number;
    zoom: number;
    next: number;
    x: number;
    y: number;
    transform: string;
    origin: string;
  } | null = null;
  const clear = () => {
    if (!active) return;
    active.surface.style.transform = active.transform;
    active.surface.style.transformOrigin = active.origin;
    active = null;
  };
  return {
    begin(touches: Fingers) {
      if (touches.length !== 2 || active) return;
      const surface = getSurface();
      if (!surface) return;
      const x = (touches[0].clientX + touches[1].clientX) / 2;
      const y = (touches[0].clientY + touches[1].clientY) / 2;
      const box = surface.getBoundingClientRect();
      const zoom = getZoom();
      active = {
        surface,
        distance: Math.max(1, distance(touches)),
        zoom,
        next: zoom,
        x,
        y,
        transform: surface.style.transform,
        origin: surface.style.transformOrigin,
      };
      surface.style.transformOrigin = `${x - box.left}px ${y - box.top}px`;
    },
    move(touches: Fingers) {
      if (!active || touches.length !== 2) return;
      active.next = clampZoom(
        (active.zoom * distance(touches)) / active.distance,
      );
      active.surface.style.transform = `scale(${active.next / active.zoom})`;
    },
    end() {
      if (!active) return;
      const { next, x, y } = active;
      clear();
      commit(next, x, y);
    },
    cancel: clear,
  };
}
