import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingTap } from '../app/reader/reading-controls.ts';
import { loadPreferences } from '../app/reader/place.ts';
function setup() {
  let toggles = 0,
    hides = 0,
    callback;
  const input = createReadingTap({
    toggle: () => toggles++,
    hide: () => hides++,
    schedule: (fn) => {
      callback = fn;
      return 1;
    },
    cancel: () => (callback = undefined),
  });
  return {
    input,
    flush: () => {
      const fn = callback;
      callback = undefined;
      fn?.();
    },
    get toggles() {
      return toggles;
    },
    get hides() {
      return hides;
    },
  };
}
test('A deliberate page tap reveals controls; scrolling never toggles them', () => {
  const t = setup();
  t.input.down(100, 100, 0);
  t.input.up(100, false);
  assert.equal(t.toggles, 0);
  t.flush();
  assert.equal(t.toggles, 1);
  t.input.down(100, 100, 1000);
  t.input.move(100, 150);
  t.input.up(1100, false);
  t.flush();
  assert.equal(t.toggles, 1);
  assert.equal(t.hides, 1);
});
test('Double-tap zoom, long press, text selection and pinch cannot trigger chrome taps', () => {
  const t = setup();
  t.input.down(100, 100, 0);
  t.input.up(80, false);
  t.input.down(100, 100, 160);
  t.input.up(240, false);
  t.flush();
  assert.equal(t.toggles, 0);
  t.input.down(100, 100, 1000);
  t.input.up(1800, false);
  t.flush();
  assert.equal(t.toggles, 0);
  t.input.down(100, 100, 2000);
  t.input.up(2080, true);
  t.flush();
  assert.equal(t.toggles, 0);
  t.input.down(100, 100, 3000);
  t.input.reading();
  t.input.up(3080, false);
  t.flush();
  assert.equal(t.toggles, 0);
});
test('Legacy default pinned controls do not accidentally opt everyone out of immersive mobile reading', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ pinned: true }) };
  assert.equal(loadPreferences().mobileControls, 'auto');
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ mobileControls: 'always' }),
  };
  assert.equal(loadPreferences().mobileControls, 'always');
  delete globalThis.localStorage;
});
