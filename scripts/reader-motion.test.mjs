import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchZoom, clampZoom } from '../app/reader/motion.ts';

test('Pinch deltas are reversible, proportional and bounded', () => {
  const zoom = pinchZoom(2, -10);
  assert.ok(zoom > 2);
  assert.ok(Math.abs(pinchZoom(zoom, 10) - 2) < 1e-10);
  assert.equal(pinchZoom(1, 100), 1);
  assert.equal(pinchZoom(4, -100), 4);
  assert.equal(clampZoom(NaN), 1);
});

import { cornerCurl } from '../app/reader/motion.ts';
test('Classic curl lifts the outside bottom corner before the top corner', () => {
  const bottom = cornerCurl(1, -2 / 3, 4 / 3, 0.22),
    top = cornerCurl(1, 2 / 3, 4 / 3, 0.22);
  assert.ok(bottom.z > 0);
  assert.equal(top.z, 0);
});
test('Diagonal curl keeps the spine fixed and settles exactly onto the reverse side', () => {
  for (let t = 0; t <= 1; t += 0.02)
    for (const y of [-2 / 3, 0, 2 / 3]) {
      const point = cornerCurl(0, y, 4 / 3, t);
      assert.ok(
        Math.abs(point.x) < 1e-9 &&
          Math.abs(point.y - y) < 1e-9 &&
          Math.abs(point.z) < 1e-9,
      );
    }
  for (const u of [0, 0.2, 0.5, 1])
    for (const y of [-2 / 3, 0, 2 / 3]) {
      assert.deepEqual(cornerCurl(u, y, 4 / 3, 0), { x: u, y, z: 0, shade: 1 });
      assert.deepEqual(cornerCurl(u, y, 4 / 3, 1), {
        x: -u,
        y,
        z: 0,
        shade: 1,
      });
    }
});
