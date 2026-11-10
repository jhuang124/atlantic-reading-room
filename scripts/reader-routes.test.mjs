import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHash } from '../app/routes.ts';

test('Route parsing maps every surface and rejects malformed fragments', () => {
  assert.deepEqual(parseRoute(''), { surface: 'archive' });
  assert.deepEqual(parseRoute('#/'), { surface: 'archive' });
  assert.deepEqual(parseRoute('#/202609'), { surface: 'issue', id: '202609' });
  assert.deepEqual(parseRoute('#/202609/read'), {
    surface: 'reader',
    id: '202609',
  });
  assert.deepEqual(parseRoute('#/202609/read/p28'), {
    surface: 'reader',
    id: '202609',
    page: 28,
  });
  assert.deepEqual(parseRoute('#/2026'), { surface: 'archive' });
  assert.deepEqual(parseRoute('#/abcdef/read'), { surface: 'archive' });
  assert.deepEqual(parseRoute('#/202609/read/p0'), {
    surface: 'reader',
    id: '202609',
  });
  assert.deepEqual(parseRoute('#/202609/read/px'), {
    surface: 'reader',
    id: '202609',
  });
  assert.deepEqual(parseRoute('#/202609/other'), {
    surface: 'issue',
    id: '202609',
  });
});

test('The About page has its own route and tolerates trailing segments', () => {
  assert.deepEqual(parseRoute('#/about'), { surface: 'about' });
  assert.deepEqual(parseRoute('#about'), { surface: 'about' });
  assert.deepEqual(parseRoute('#/about/'), { surface: 'about' });
  assert.deepEqual(parseRoute('#/about/anything'), { surface: 'about' });
  // Case matters: a shouted URL is not a surface we own.
  assert.deepEqual(parseRoute('#/About'), { surface: 'archive' });
  assert.equal(routeHash({ surface: 'about' }), '#/about');
});

test('Route formatting round-trips through parsing', () => {
  const routes = [
    { surface: 'archive' },
    { surface: 'about' },
    { surface: 'issue', id: '202112' },
    { surface: 'reader', id: '202112' },
    { surface: 'reader', id: '202112', page: 47 },
  ];
  for (const route of routes)
    assert.deepEqual(parseRoute(routeHash(route)), route);
  // Page 1 is the issue's natural opening; the hash stays clean.
  assert.equal(
    routeHash({ surface: 'reader', id: '202609', page: 1 }),
    '#/202609/read',
  );
});

test('The archive lenses have their own fragments and the front page owns #/', () => {
  assert.deepEqual(parseRoute('#/issues'), { surface: 'archive', lens: 'issues' });
  assert.deepEqual(parseRoute('#/writers'), {
    surface: 'archive',
    lens: 'writers',
  });
  assert.equal(routeHash({ surface: 'archive' }), '#/');
  assert.equal(routeHash({ surface: 'archive', lens: 'issues' }), '#/issues');
  assert.equal(routeHash({ surface: 'archive', lens: 'writers' }), '#/writers');
  // An unknown word is still the front page, not a lens.
  assert.deepEqual(parseRoute('#/stories'), { surface: 'archive' });
});
