import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollPort } from '../app/reader/scroll-port.ts';
import {
  scrollLayout,
  scrollDestination,
  pageAtOffset,
} from '../app/reader/scroll-layout.ts';
import fs from 'node:fs';

function documentFixture() {
  const view = {
    scrollX: 80,
    scrollY: 700,
    innerHeight: 800,
    visualViewport: { height: 640 },
    document: { documentElement: { clientWidth: 390 } },
    scrollTo({ left, top }) {
      this.scrollX = left;
      this.scrollY = top;
    },
  };
  const element = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({
      left: 12 - view.scrollX,
      top: 24 - view.scrollY,
    }),
  };
  return { view, element, port: scrollPort(element, true) };
}
test('Document scrolling reports page-relative coordinates and the visible browser height', () => {
  const { port, view } = documentFixture();
  assert.deepEqual(port.read(), {
    left: 68,
    top: 676,
    width: 390,
    height: 640,
  });
  assert.equal(port.target, view);
  view.visualViewport.height = 760;
  assert.equal(port.read().height, 760);
  assert.equal(
    port.read().top,
    676,
    'Toolbar collapse must not move the reading position',
  );
});
test('Story jumps and pinch correction include document origin and preserve the untouched axis', () => {
  const { port, view } = documentFixture();
  const { pages } = scrollLayout(112, 390, [], 12);
  for (const page of [1, 2, 18, 77, 112]) {
    const top = scrollDestination(pages, page, 0.25);
    port.to({ top });
    assert.equal(view.scrollY, top + 24);
    assert.equal(port.read().top, top);
    assert.equal(pageAtOffset(pages, port.read().top), page - 1);
    assert.equal(view.scrollX, 80);
  }
  const before = port.read();
  port.to({ left: before.left + 45, top: before.top + 90 });
  assert.equal(port.read().left, before.left + 45);
  assert.equal(port.read().top, before.top + 90);
});
test('Desktop and Expo keep native element scrolling without changing coordinates', () => {
  let last;
  const element = {
    ownerDocument: { defaultView: {} },
    scrollLeft: 12,
    scrollTop: 900,
    clientWidth: 1200,
    clientHeight: 700,
    scrollTo: (options) => (last = options),
  };
  const port = scrollPort(element);
  assert.equal(port.target, element);
  assert.deepEqual(port.read(), {
    left: 12,
    top: 900,
    width: 1200,
    height: 700,
  });
  port.to({ top: 200 });
  assert.deepEqual(last, { top: 200 });
});
test('Home Screen manifest remains scoped to the GitHub Pages project and ships its icons', () => {
  const path = new URL('../public/manifest.webmanifest', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(path));
  const hosted = new URL(
    'https://jhuang124.github.io/atlantic-reading-room/manifest.webmanifest',
  );
  assert.equal(
    new URL(manifest.start_url, hosted).pathname,
    '/atlantic-reading-room/',
  );
  assert.equal(
    new URL(manifest.scope, hosted).pathname,
    '/atlantic-reading-room/',
  );
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(
    manifest.icons.map((i) => i.sizes),
    ['192x192', '512x512'],
  );
  for (const icon of manifest.icons)
    assert.ok(fs.existsSync(new URL(icon.src, path)));
});

test('Zoom anchors preserve safe-area offsets even above the first page', () => {
  const { port, view } = documentFixture();
  view.scrollY = 0;
  const before = port.read();
  assert.equal(before.top, -24);
  port.to({ top: before.top + 90 });
  assert.equal(view.scrollY, 90);
});
