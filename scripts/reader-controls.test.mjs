import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReadingTap,
  tapZone,
  swipeTurn,
  horizontalEdges,
} from '../app/reader/reading-controls.ts';
import { loadPreferences } from '../app/reader/place.ts';
function setup() {
  let toggles = 0,
    hides = 0,
    callback;
  const turns = [],
    doubles = [];
  const input = createReadingTap({
    toggle: () => toggles++,
    hide: () => hides++,
    turn: (d) => turns.push(d),
    doubleTap: (x, y) => doubles.push([x, y]),
    schedule: (fn) => {
      callback = fn;
      return 1;
    },
    cancel: () => (callback = undefined),
  });
  return {
    input,
    turns,
    doubles,
    flush: () => {
      const fn = callback;
      callback = undefined;
      fn?.();
    },
    get pending() {
      return callback !== undefined;
    },
    get toggles() {
      return toggles;
    },
    get hides() {
      return hides;
    },
  };
}
test('A deliberate center tap reveals controls after the double-tap window; scrolling never toggles them', () => {
  const t = setup();
  t.input.down(100, 100, 0);
  t.input.up(100, false, 'center');
  assert.equal(t.toggles, 0);
  t.flush();
  assert.equal(t.toggles, 1);
  t.input.down(100, 100, 1000);
  t.input.move(100, 150);
  t.input.up(1100, false, 'center');
  t.flush();
  assert.equal(t.toggles, 1);
  assert.equal(t.hides, 1);
});
test('Edge taps turn pages at Fit, hide the controls, and stay inert when edge turns are off', () => {
  const t = setup();
  t.input.down(20, 300, 0);
  t.input.up(80, false, 'left', true);
  t.flush();
  assert.deepEqual(t.turns, [-1]);
  assert.equal(t.hides, 1);
  t.input.down(380, 300, 1000);
  t.input.up(1080, false, 'right', true);
  t.flush();
  assert.deepEqual(t.turns, [-1, 1]);
  t.input.down(380, 300, 2000);
  t.input.up(2080, false, 'right', false);
  t.flush();
  assert.deepEqual(t.turns, [-1, 1], 'zoomed edge taps do not turn');
  assert.equal(t.toggles, 1, 'they toggle the controls instead');
});
test('A double-tap zooms and cancels the pending single tap, so a page never turns under a zoom', () => {
  const t = setup();
  t.input.down(380, 300, 0);
  t.input.up(80, false, 'right', true);
  assert.ok(t.pending);
  t.input.down(384, 302, 160);
  assert.ok(!t.pending, 'the second tap cancels the pending turn');
  t.input.up(240, false, 'right', true);
  t.flush();
  assert.deepEqual(t.turns, []);
  assert.equal(t.toggles, 0);
  assert.deepEqual(t.doubles, [[380, 300]]);
});
test('Long press, text selection and pinch cannot trigger chrome taps', () => {
  const t = setup();
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
test('Tap zones split a 390px phone into 22% edges and a center', () => {
  assert.equal(tapZone(10, 390), 'left');
  assert.equal(tapZone(85, 390), 'left');
  assert.equal(tapZone(86, 390), 'center');
  assert.equal(tapZone(195, 390), 'center');
  assert.equal(tapZone(380, 390), 'right');
  assert.equal(tapZone(50, 0), 'center');
});
test('At Fit a decisive horizontal swipe turns; diagonal and short swipes do not', () => {
  const base = { zoomed: false, atLeft: true, atRight: true };
  assert.equal(swipeTurn({ ...base, dx: -90, dy: 10 }), 1);
  assert.equal(swipeTurn({ ...base, dx: 90, dy: 10 }), -1);
  assert.equal(swipeTurn({ ...base, dx: -40, dy: 0 }), 0);
  assert.equal(swipeTurn({ ...base, dx: -90, dy: 80 }), 0);
  assert.equal(swipeTurn({ ...base, dx: -90, dy: 0, pinched: true }), 0);
});
test('When zoomed, only a swipe that starts at the boundary turns; a pan that reaches the edge never does', () => {
  const zoomed = { zoomed: true, dy: 0 };
  assert.equal(swipeTurn({ ...zoomed, dx: -90, atLeft: false, atRight: true }), 1);
  assert.equal(swipeTurn({ ...zoomed, dx: -90, atLeft: true, atRight: false }), 0);
  assert.equal(swipeTurn({ ...zoomed, dx: 90, atLeft: true, atRight: false }), -1);
  assert.equal(swipeTurn({ ...zoomed, dx: 90, atLeft: false, atRight: true }), 0);
  assert.equal(swipeTurn({ ...zoomed, dx: 90, atLeft: false, atRight: false }), 0);
});
test('Horizontal edges tolerate a few pixels of momentum settle', () => {
  assert.deepEqual(horizontalEdges(0, 390, 780), { atLeft: true, atRight: false });
  assert.deepEqual(horizontalEdges(4, 390, 780), { atLeft: true, atRight: false });
  assert.deepEqual(horizontalEdges(386, 390, 780), { atLeft: false, atRight: true });
  assert.deepEqual(horizontalEdges(200, 390, 780), { atLeft: false, atRight: false });
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
