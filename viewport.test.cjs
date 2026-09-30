const {test} = require('node:test');
const assert = require('node:assert/strict');
const Viewport = require('./viewport.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('zoom preserves the world point beneath the cursor, even at both limits', () => {
  const view = new Viewport();
  view.x = -170; view.y = 90;
  const cursor = {x: 437, y: 120};
  const anchor = view.unproject(cursor);
  for (const factor of [1.25, 3, .4, 1000, .00001, 2]) {
    view.zoomAt(factor, cursor);
    const point = view.project(anchor);
    close(point.x, cursor.x); close(point.y, cursor.y);
    assert.ok(view.scale >= .1 && view.scale <= 8);
  }
});

test('drag coordinates map back to the correct target after pan and zoom', () => {
  const view = new Viewport();
  const source = {x: 90, y: 210}, target = {x: 340, y: 170};
  view.zoomAt(2.5, {x: 230, y: 130});
  view.x += 63; view.y -= 40;
  // A drag grabbed away from the center must still land exactly on the target.
  const offset = {x: 9, y: -7};
  const start = view.project(source), destination = view.project(target);
  const pointerStart = {x: start.x - offset.x, y: start.y - offset.y};
  const pointerEnd = {x: destination.x - offset.x, y: destination.y - offset.y};
  const dragged = view.unproject({x: pointerEnd.x + start.x - pointerStart.x, y: pointerEnd.y + start.y - pointerStart.y});
  close(dragged.x, target.x); close(dragged.y, target.y);
});

test('fit makes every vertex visible, including a large drawing and a single bag', () => {
  for (const [width,height] of [[390,460],[1100,700]]) {
    for (const points of [[{x:100,y:90}], [{x:-800,y:450},{x:2500,y:-900},{x:300,y:1400}]]) {
      const view = new Viewport();
      view.zoomAt(8, {x:20,y:50});
      view.fit(points, width, height, 22);
      for (const point of points) {
        const screen = view.project(point), r = 22 * view.scale;
        assert.ok(screen.x - r >= 0 && screen.x + r <= width);
        assert.ok(screen.y - r >= 0 && screen.y + r <= height - 60);
      }
    }
  }
});
