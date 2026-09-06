import test from "node:test";
import assert from "node:assert/strict";
import { canMove, move, isSolved, isSolvable, shuffleTubes } from "../src/game-engine.js";

function counts(tubes) {
  const map = {};
  tubes.flat().forEach(c => { map[c] = (map[c] || 0) + 1; });
  return map;
}

test("isSolvable detects a solvable and an unsolvable board", () => {
  // 4 red + 4 blue with two empty tubes — sortable.
  assert.equal(isSolvable([["red", "blue", "blue", "red"], ["blue", "red", "red", "blue"], [], []]), true);
  // Two full mixed tubes, no space to move — cannot ever be sorted.
  assert.equal(isSolvable([["red", "blue", "red", "blue"], ["blue", "red", "blue", "red"]]), false);
});

test("shuffle preserves every marble and each tube's fill count", () => {
  const board = [["red", "blue", "green", "red"], ["blue", "green", "red", "blue"], ["green", "red", "blue", "green"], [], []];
  const rng = mulberry(12345);
  const out = shuffleTubes(board, rng);
  assert.ok(out, "should find a solvable shuffle");
  assert.deepEqual(counts(out), counts(board));                 // no marble added/removed
  assert.deepEqual(out.map(t => t.length), board.map(t => t.length)); // same per-tube counts
});

test("shuffle result is always solvable and not already solved", () => {
  const board = [["red", "blue", "green", "orange"], ["blue", "green", "orange", "red"], ["green", "orange", "red", "blue"], ["orange", "red", "blue", "green"], [], []];
  const rng = mulberry(999);
  for (let i = 0; i < 8; i++) {
    const out = shuffleTubes(board, rng);
    assert.ok(out);
    assert.equal(isSolved(out), false);
    assert.equal(isSolvable(out), true);
  }
});

// tiny deterministic RNG for reproducible tests
function mulberry(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("moves a contiguous top-color group", () => {
  const state = [["red", "blue", "blue"], ["blue"], []];
  const result = move(state, 0, 1);
  assert.deepEqual(result.tubes, [["red"], ["blue", "blue", "blue"], []]);
  assert.equal(result.moved, 2);
});

test("rejects mismatched destination colors", () => {
  assert.equal(canMove([["red"], ["blue"]], 0, 1), false);
});

test("recognizes completed and empty tubes", () => {
  assert.equal(isSolved([["red", "red", "red", "red"], []]), true);
  assert.equal(isSolved([["red", "red"], []]), false);
});
