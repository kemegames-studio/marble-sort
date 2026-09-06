import test from "node:test";
import assert from "node:assert/strict";
import { nearestTubeIndex } from "../src/game-engine.js";

// Mirrors tubeLayoutStyle in src/app.js: tube buttons are ~1.8x wider than the
// horizontal step between tubes, so adjacent buttons overlap by ~45%.
function boardRects(totalTubes, columnCount, viewport = { width: 390, height: 844 }) {
  const overlapRatio = 349 / 632;
  const widthPercent = 97 / (1 + (overlapRatio * Math.max(columnCount - 1, 0)));
  const stepPercent = widthPercent * overlapRatio;
  const rects = [];
  for (let index = 0; index < totalTubes; index++) {
    const row = Math.floor(index / columnCount);
    const rowCount = row === 0 ? Math.min(columnCount, totalTubes) : Math.max(0, totalTubes - columnCount);
    const indexInRow = row === 0 ? index : index - columnCount;
    const rowTop = totalTubes <= columnCount ? 34.6 : row === 0 ? 24.2 : 54.5;
    const rowSpan = widthPercent + (stepPercent * Math.max(rowCount - 1, 0));
    const leftStart = (100 - rowSpan) / 2;
    const leftPercent = leftStart + (stepPercent * indexInRow);
    const left = (leftPercent / 100) * viewport.width;
    const width = (widthPercent / 100) * viewport.width;
    const height = width * (612 / 408);
    const top = (rowTop / 100) * viewport.height;
    rects.push({ index, left, right: left + width, top, bottom: top + height });
  }
  return rects;
}

// The raw DOM behavior before the fix: overlapping buttons paint in DOM order,
// so the highest-index button containing the point captures the tap.
function rawHitIndex(point, rects) {
  let hit = null;
  rects.forEach(rect => {
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
      hit = rect.index;
    }
  });
  return hit;
}

test("raw button hit-testing misfires on the neighbor inside the overlap zone", () => {
  const rects = boardRects(8, 4);
  const tube0 = rects[0];
  const glassCenterY = (tube0.top + tube0.bottom) / 2;
  // Tap just right of tube 0's center — still visually over tube 0's glass.
  const tapX = ((tube0.left + tube0.right) / 2) + ((rects[1].left - tube0.left) * 0.5);
  assert.equal(rawHitIndex({ x: tapX, y: glassCenterY }, rects), 1);
});

test("nearest-center resolution picks the tube whose glass is under the tap", () => {
  const rects = boardRects(8, 4);
  const tube0 = rects[0];
  const glassCenterY = (tube0.top + tube0.bottom) / 2;
  const tapX = ((tube0.left + tube0.right) / 2) + ((rects[1].left - tube0.left) * 0.5);
  assert.equal(nearestTubeIndex({ x: tapX, y: glassCenterY }, rects), 0);
});

test("every point across each tube's glass band resolves to that tube", () => {
  const layouts = [
    [5, 5],
    [7, 4],
    [8, 4],
    [9, 5],
    [10, 5],
    [11, 6],
    [12, 6],
  ];
  layouts.forEach(([totalTubes, columnCount]) => {
    const rects = boardRects(totalTubes, columnCount);
    rects.forEach(rect => {
      const center = (rect.left + rect.right) / 2;
      const step = rect.right - rect.left;
      const y = (rect.top + rect.bottom) / 2;
      // The visible glass band is the central ~36% of the button art.
      for (let offset = -0.17; offset <= 0.17; offset += 0.017) {
        const x = center + (offset * step);
        assert.equal(
          nearestTubeIndex({ x, y }, rects),
          rect.index,
          `layout ${totalTubes}/${columnCount} tube ${rect.index} offset ${offset.toFixed(3)}`
        );
      }
    });
  });
});

test("taps in a different row never resolve to tubes from another row", () => {
  const rects = boardRects(10, 5);
  const secondRow = rects[7];
  const y = (secondRow.top + secondRow.bottom) / 2;
  const x = (secondRow.left + secondRow.right) / 2;
  const resolved = nearestTubeIndex({ x, y }, rects);
  assert.equal(resolved, 7);
});

test("returns null when the tap misses every row", () => {
  const rects = boardRects(8, 4);
  assert.equal(nearestTubeIndex({ x: 10, y: 5 }, rects), null);
});
