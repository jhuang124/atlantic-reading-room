import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  spreadPages,
  turnPage,
  parsePrintedPage,
  pageLabel,
  searchPages,
  matchWords,
  readSaved,
  saveLocal,
} from '../app/reader/model.ts';
import { readerIssues } from '../app/reader/catalog.ts';
test('Every physical page is visited exactly once in forward spread navigation', () => {
  for (const count of [104, 108, 112]) {
    let p = 1;
    const seen = [];
    while (true) {
      seen.push(...spreadPages(p, count, true));
      const n = turnPage(p, count, true, 1);
      if (n === p) break;
      p = n;
    }
    assert.deepEqual(
      [...new Set(seen)],
      Array.from({ length: count }, (_, i) => i + 1),
    );
    assert.equal(seen.length, count);
    assert.equal(turnPage(1, count, true, -1), 1);
  }
});
test('Print numbering accounts for covers and rejects out-of-range entries', () => {
  assert.equal(parsePrintedPage('68', 112), 70);
  assert.equal(parsePrintedPage('cover', 112), 1);
  assert.equal(parsePrintedPage('back', 112), 112);
  assert.equal(parsePrintedPage('109', 112), null);
  assert.equal(parsePrintedPage('-1', 112), null);
  assert.equal(parsePrintedPage('12.5', 112), null);
  assert.equal(pageLabel(70, 112), '68');
  assert.equal(pageLabel(111, 112), 'Inside back');
});
test('Jump targets are preserved in spreads and single-page view', () => {
  assert.deepEqual(spreadPages(71, 112, true), [70, 71]);
  assert.deepEqual(spreadPages(71, 112, false), [71]);
  assert.equal(turnPage(71, 112, true, 1), 72);
  assert.equal(turnPage(71, 112, true, -1), 69);
});
test('Phrase highlighting includes only matched words', () => {
  const words = ['Before', 'What', 'if', 'Freud', 'Was', 'Right?', 'After'].map(
    (t) => ({ t, x: 0, y: 0, w: 0.1, h: 0.01 }),
  );
  assert.deepEqual(
    matchWords(words, 'Freud was').map((w) => w.t),
    ['Freud', 'Was'],
  );
  assert.deepEqual(matchWords(words, 'missing'), []);
});
test('Every contents destination and local thumbnail exists', () => {
  for (const issue of readerIssues) {
    const idx = JSON.parse(
      fs.readFileSync(`public/reader-assets/${issue.id}/index.json`),
    );
    assert.equal(idx.length, issue.pageCount);
    for (let n = 1; n <= issue.pageCount; n++)
      assert.ok(fs.existsSync(`public/reader-assets/${issue.id}/${n}.jpg`));
    for (const c of issue.contents) {
      assert.ok(c.printedPage + 2 <= issue.pageCount - 2);
      assert.ok(
        idx[c.printedPage + 1].words.length > 0,
        `${issue.id} ${c.title}`,
      );
    }
    assert.ok(
      searchPages(
        idx,
        issue.id === '202609'
          ? 'monarch'
          : issue.id === '202608'
            ? 'reading'
            : 'election',
      ).length > 0,
    );
  }
});
test('Unavailable browser storage does not prevent reading', () => {
  globalThis.localStorage = {
    getItem() {
      throw Error('disabled');
    },
    setItem() {
      throw Error('disabled');
    },
  };
  assert.deepEqual(readSaved('x', []), []);
  assert.doesNotThrow(() => saveLocal('x', { page: 7 }));
});

import { turnFaces } from '../app/reader/model.ts';
test('Every animated sheet reveals the immediately adjacent PDF page in both directions', () => {
  for (const count of [104, 108, 112])
    for (const spread of [false, true]) {
      for (let page = 1; page <= count; page++)
        for (const direction of [-1, 1]) {
          const from = spreadPages(page, count, spread);
          const to = spreadPages(
            turnPage(page, count, spread, direction),
            count,
            spread,
          );
          if (from.join() === to.join()) continue;
          const faces = turnFaces(from, direction);
          assert.equal(faces.back, faces.front + direction);
          assert.ok(
            to.includes(faces.back),
            `PDF ${count}, page ${page}, direction ${direction}`,
          );
          if (spread && direction === 1) assert.equal(faces.back, to[0]);
          if (spread && direction === -1) assert.equal(faces.back, to.at(-1));
        }
    }
});
