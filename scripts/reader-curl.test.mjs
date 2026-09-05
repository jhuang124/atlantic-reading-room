import test from 'node:test';
import assert from 'node:assert/strict';
import * as motion from '../app/reader/motion.ts';
// A tightening fold must remain a curve, rather than collapse to one triangle.
test('Tight folds keep enough samples to avoid a faceted edge near release', () => {
  for (const t of [0.05, 0.1, 0.5, 0.9, 0.97, 0.99])
    for (const y of [-0.6, 0, 0.6]) {
      let curved = 0;
      for (let i = 0; i <= 80; i++) {
        const u = motion.curlSampleU?.(i, 80, y, 4 / 3, t) ?? i / 80;
        const c = motion.cornerCurl(u, y, 4 / 3, t);
        if (c.shade < 0.99) curved++;
      }
      const samples = Array.from({ length: 2001 }, (_, i) =>
        motion.cornerCurl(i / 2000, y, 4 / 3, t),
      );
      if (samples.some((c) => c.shade < 0.99))
        assert.ok(
          curved >= 8,
          `progress ${t}, y ${y}: just ${curved} curved vertices`,
        );
    }
});
