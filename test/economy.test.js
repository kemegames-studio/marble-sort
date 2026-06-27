import test from "node:test";
import assert from "node:assert/strict";
import { LIFE_REGEN_MS, addCoins, refreshLives, spendLife } from "../src/economy.js";

test("spending a life starts its regeneration timer", () => {
  const result = spendLife({ lives: 5, lastLifeAt: null }, 1000);
  assert.equal(result.spent, true);
  assert.equal(result.profile.lives, 4);
  assert.equal(result.profile.lastLifeAt, 1000);
});

test("lives regenerate without exceeding the cap", () => {
  const result = refreshLives({ lives: 3, lastLifeAt: 1000 }, 1000 + LIFE_REGEN_MS * 3);
  assert.equal(result.lives, 5);
  assert.equal(result.lastLifeAt, null);
});

test("coins never become negative", () => {
  assert.equal(addCoins({ coins: 100 }, 250).coins, 350);
  assert.equal(addCoins({ coins: 100 }, -500).coins, 0);
});
