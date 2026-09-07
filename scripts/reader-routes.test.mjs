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

test('Route formatting round-trips through parsing', () => {
  const routes = [
    { surface: 'archive' },
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
