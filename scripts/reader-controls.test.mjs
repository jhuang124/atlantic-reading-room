import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReadingTap,
  createScrollReveal,
  tapZone,
  swipeTurn,
  horizontalEdges,
  stepZoom,
  ZOOM_STEPS,
} from '../app/reader/reading-controls.ts';
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
test('Bar zoom walks 1 → 1.25 → 1.5 → 2 → 3 → 4 and snaps values a pinch left between steps', () => {
  assert.deepEqual(ZOOM_STEPS, [1, 1.25, 1.5, 2, 3, 4]);
  let zoom = 1;
  const walk = [];
  for (let i = 0; i < 6; i++) walk.push((zoom = stepZoom(zoom, 1)));
  assert.deepEqual(walk, [1.25, 1.5, 2, 3, 4, 4]);
  assert.equal(stepZoom(4, -1), 3);
  assert.equal(stepZoom(1, -1), 1);
  assert.equal(stepZoom(1.7, 1), 2);
  assert.equal(stepZoom(1.7, -1), 1.5);
  assert.equal(stepZoom(1.2500001, 1), 1.5, 'float noise does not stall a step');
});
test('In Scroll the bars hide after 24px downward, return on any upward scroll, and ignore a control-driven jump', () => {
  let hides = 0,
    reveals = 0,
    clock = 0;
  const reveal = createScrollReveal({
    hide: () => hides++,
    reveal: () => reveals++,
    now: () => clock,
  });
  reveal.scroll(0);
  reveal.scroll(10);
  reveal.scroll(20);
  assert.equal(hides, 0, 'a nudge does not hide');
  reveal.scroll(30);
  assert.equal(hides, 1, 'accumulated downward travel past 24px hides');
  reveal.scroll(40);
  assert.equal(hides, 1, 'and hides once');
  reveal.scroll(37);
  assert.equal(reveals, 1, 'any upward scroll brings the bars back');
  reveal.hold(600);
  reveal.scroll(400);
  assert.equal(hides, 1, 'a story jump from the bar is not a reading gesture');
  clock = 700;
  reveal.scroll(401);
  reveal.scroll(430);
  assert.equal(hides, 2);
});
