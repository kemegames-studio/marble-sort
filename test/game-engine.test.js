import test from "node:test";
import assert from "node:assert/strict";
import { canMove, move, isSolved } from "../src/game-engine.js";

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
