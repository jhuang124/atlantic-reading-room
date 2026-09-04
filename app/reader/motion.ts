export const TURN_MS = 450;
export const clampZoom = (value: number) =>
  Number.isFinite(value) ? Math.min(4, Math.max(1, value)) : 1;
export const pinchZoom = (zoom: number, delta: number) =>
  clampZoom(zoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.012));

// A diagonal rolling fold begins at the lower outer corner. The fold axis
// straightens toward the spine, so the sheet finishes in perfect registration.
export function cornerCurl(
  u: number,
  y: number,
  ratio: number,
  progress: number,
) {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return { x: u, y, z: 0, shade: 1 };
  if (t === 1) return { x: -u, y, z: 0, shade: 1 };
  const eased = t * t * (3 - 2 * t);
  const diagonal = -0.7 * Math.pow(1 - eased, 1.3);
  const nx = Math.cos(diagonal),
    ny = Math.sin(diagonal);
  const radius = 0.13 * Math.sin(Math.PI * eased);
  const fold = nx * Math.pow(1 - eased, 2) + (Math.abs(ny) * ratio) / 2;
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
    shade:
      1 -
      0.26 * Math.sin(angle) -
      0.045 * Math.sin(Math.PI * eased) * (1 - Math.cos(angle)),
  };
}
