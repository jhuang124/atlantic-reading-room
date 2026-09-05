export const TURN_MS = 560;
export const clampZoom = (value: number) =>
  Number.isFinite(value) ? Math.min(4, Math.max(1, value)) : 1;
export const pinchZoom = (zoom: number, delta: number) =>
  clampZoom(zoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.012));

// A diagonal rolling fold begins at the lower outer corner. The fold axis
// straightens toward the spine, so the sheet finishes in perfect registration.
/** Invariants for one animation frame, shared by all 3,969 vertices. */
export function curlFrame(ratio: number, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const diagonal = -0.7 * Math.pow(1 - eased, 1.3);
  const nx = Math.cos(diagonal),
    ny = Math.sin(diagonal);
  const radius = 0.18 * Math.sin(Math.PI * eased);
  const fold = nx * Math.pow(1 - eased, 2) + (Math.abs(ny) * ratio) / 2;
  return { t, nx, ny, radius, fold };
}
export type CurlFrame = ReturnType<typeof curlFrame>;

export function curlPoint(u: number, y: number, frame: CurlFrame) {
  const { t, nx, ny, radius, fold } = frame;
  if (t === 0) return { x: u, y, z: 0, shade: 1 };
  if (t === 1) return { x: -u, y, z: 0, shade: 1 };
  const distance = nx * u + ny * y - fold;
  if (distance <= 0) return { x: u, y, z: 0, shade: 1 };
  const angle = Math.min(Math.PI, distance / radius);
  const arc =
    distance < Math.PI * radius
      ? radius * Math.sin(angle)
      : -(distance - Math.PI * radius);
  const displacement = arc - distance;
  return {
    x: u + displacement * nx,
    y: y + displacement * ny,
    z: radius * (1 - Math.cos(angle)),
    shade: 1 - 0.17 * Math.sin(angle) ** 2,
  };
}
export function cornerCurl(
  u: number,
  y: number,
  ratio: number,
  progress: number,
) {
  return curlPoint(u, y, curlFrame(ratio, progress));
}

/** The arc boundaries vary by row, not by vertex. UVs retain the same material
 * coordinates so the printed page cannot stretch as its radius approaches zero. */
export function curlRow(y: number, frame: CurlFrame) {
  const { t, nx, ny, radius, fold } = frame;
  const a = Math.max(0, Math.min(1, (fold - ny * y) / nx));
  const b = Math.max(a, Math.min(1, (fold + Math.PI * radius - ny * y) / nx));
  return { t, a, b };
}
export function sampleCurlRow(
  column: number,
  columns: number,
  row: ReturnType<typeof curlRow>,
) {
  const { t, a, b } = row;
  const f = column / columns;
  if (t === 0 || t === 1) return f;
  if (f < 0.2) return (a * f) / 0.2;
  if (f <= 0.8) return a + ((b - a) * (f - 0.2)) / 0.6;
  return b + ((1 - b) * (f - 0.8)) / 0.2;
}
export function curlSampleU(
  column: number,
  columns: number,
  y: number,
  ratio: number,
  progress: number,
) {
  return sampleCurlRow(column, columns, curlRow(y, curlFrame(ratio, progress)));
}

export function rasterScale(width: number, ratio: number, dpr: number) {
  // Native phone density at Fit; cap enlarged pages at four million pixels.
  return Math.min(
    dpr,
    3,
    3000 / Math.max(width, width * ratio),
    Math.sqrt(4_000_000 / (width * width * ratio)),
  );
}
