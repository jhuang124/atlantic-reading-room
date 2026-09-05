import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinchPreview } from '../app/reader/pinch-preview.ts';
const fingers = (distance) => [
  { clientX: 200 - distance / 2, clientY: 300 },
  { clientX: 200 + distance / 2, clientY: 300 },
];
test('A phone pinch previews pixels without committing layout until release', () => {
  const commits = [];
  let reads = 0;
  const surface = {
    style: { transform: '', transformOrigin: '' },
    getBoundingClientRect() {
      reads++;
      return { left: 20, top: 100 };
    },
  };
  const pinch = createPinchPreview({
    getSurface: () => surface,
    getZoom: () => 1,
    commit: (...args) => commits.push(args),
  });
  pinch.begin(fingers(100));
  for (let d = 101; d <= 200; d++) pinch.move(fingers(d));
  assert.equal(
    commits.length,
    0,
    'No PDF resize or React update during the gesture',
  );
  assert.equal(reads, 1, 'No layout reads during finger movement');
  assert.equal(surface.style.transform, 'scale(2)');
  assert.equal(surface.style.transformOrigin, '180px 200px');
  pinch.end();
  pinch.end();
  assert.deepEqual(commits, [[2, 200, 300]]);
  assert.equal(surface.style.transform, '');
});
test('Interrupted pinches restore the surface and never commit a stray zoom', () => {
  const surface = {
    style: { transform: '', transformOrigin: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const pinch = createPinchPreview({
    getSurface: () => surface,
    getZoom: () => 2,
    commit: () => assert.fail('cancelled'),
  });
  pinch.begin(fingers(100));
  pinch.move(fingers(10));
  assert.equal(surface.style.transform, 'scale(0.5)');
  pinch.cancel();
  pinch.end();
  assert.equal(surface.style.transform, '');
});

import { rasterScale } from '../app/reader/motion.ts';
test('Phone pages use native density at Fit and bound memory at high zoom', () => {
  assert.equal(rasterScale(366, 4 / 3, 3), 3);
  for (const width of [366, 732, 1464, 3600]) {
    const scale = rasterScale(width, 4 / 3, 3);
    assert.ok(width * width * (4 / 3) * scale * scale <= 4_000_001);
  }
});
