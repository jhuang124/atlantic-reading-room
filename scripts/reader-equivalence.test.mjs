import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  curlFrame,
  curlRow,
  sampleCurlRow,
  curlPoint,
} from '../app/reader/motion.ts';
import { normalize, searchPages } from '../app/reader/model.ts';

test('Optimized curl matches the previous GPU vertex values throughout a full turn', () => {
  const expected = JSON.parse(
    fs.readFileSync('scripts/fixtures/curl-7bf52fe.json'),
  );
  const hash = createHash('sha256');
  const vertex = new Float32Array(5);
  for (const ratio of expected.ratios)
    for (const progress of expected.progress) {
      const frame = curlFrame(ratio, progress);
      for (let row = 0; row <= 48; row++) {
        const y = ratio * (0.5 - row / 48),
          samples = curlRow(y, frame);
        for (let col = 0; col <= 80; col++) {
          const u = sampleCurlRow(col, 80, samples),
            c = curlPoint(u, y, frame);
          vertex.set([u, c.x, c.y, c.z, c.shade]);
          hash.update(new Uint8Array(vertex.buffer));
        }
      }
    }
  assert.equal(hash.digest('hex'), expected.sha256);
});
test('Cached search retains result order and exact snippets for a complete issue', () => {
  const index = JSON.parse(
    gunzipSync(fs.readFileSync('public/reader-assets/202601/index.json.gz')),
  );
  for (const query of [
    'the',
    'Kennedy',
    'SCIENCE',
    '  public health  ',
    'café',
    '’',
    '',
    'nonexistent987',
  ]) {
    const q = normalize(query.trim());
    const expected =
      q.length < 2
        ? []
        : index.flatMap((p) => {
            const pos = normalize(p.text).indexOf(q);
            return pos < 0
              ? []
              : [
                  {
                    page: p.page,
                    snippet:
                      (pos > 60 ? '…' : '') +
                      p.text.slice(
                        Math.max(0, pos - 60),
                        pos + q.length + 110,
                      ) +
                      '…',
                  },
                ];
          });
    assert.deepEqual(searchPages(index, query), expected);
    assert.deepEqual(searchPages(index, query), expected);
  }
});
