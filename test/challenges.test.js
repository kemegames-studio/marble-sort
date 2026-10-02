import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { EXTRA_LEVELS } from '../src/extra-levels.js';
import { move, isSolved } from '../src/game-engine.js';
import { ChallengeClock, timeLimitFor, difficultyFor, formatRemaining } from '../src/challenges.js';

test('300 sequential levels with unchanged first 100 and 200 unique, certified new boards', () => {
  assert.equal(LEVELS.length,300);
  assert.deepEqual(LEVELS[0].tubes,[['orange'],['orange','orange','orange']]);
  const boards = new Set();
  for (const level of EXTRA_LEVELS) {
    assert.equal(level.id, LEVELS.indexOf(level)+1);
    assert.equal(level.difficulty,difficultyFor(level.id));
    assert.equal(level.tubes.filter(t=>!t.length).length,2);
    assert.ok(level.tubes.length<=11);
    const counts = {};
    level.tubes.flat().forEach(color=>{counts[color]=(counts[color]||0)+1;});
    assert.ok(Object.values(counts).every(count=>count===4));
    const canonical = level.tubes.map(t=>JSON.stringify(t)).sort().join('|');
    assert.ok(!boards.has(canonical),`Duplicate ${level.id}`); boards.add(canonical);
    let board = level.tubes;
    assert.ok(!isSolved(board));
    for (const [from,to] of level.solution) {
      const result=move(board,from,to);
      assert.ok(result.moved,`Illegal solution step in ${level.id}`);
      board=result.tubes;
    }
    assert.ok(isSolved(board),`No solution for ${level.id}`);
    assert.equal(level.timeLimitSeconds,timeLimitFor(level));
  }
});
test('every fifth level is timed, with time for the certified route', () => {
  assert.equal(LEVELS.filter(l=>timeLimitFor(l)>0).length,60);
  for(const level of LEVELS) {
    assert.equal(timeLimitFor(level)>0,level.id%5===0);
    if(level.solution && level.id%5===0) assert.ok(timeLimitFor(level)>=level.solution.length*3+30);
  }
});
test('timer pauses, resumes, expires once, and resets for retries', () => {
  const clock=new ChallengeClock();
  clock.reset(90,0); clock.update(0,true);
  assert.equal(clock.update(10000,false),80000);
  assert.equal(clock.update(70000,false),80000);
  clock.update(70000,true);
  assert.equal(clock.update(90000,true),60000);
  assert.equal(clock.update(150000,true),0);
  assert.ok(clock.expired);
  clock.update(160000,false); assert.equal(clock.remaining,0);
  clock.reset(120,160000); assert.equal(clock.expired,false);
  assert.equal(clock.remaining,120000);
  assert.equal(formatRemaining(1),'0:01');
  assert.equal(formatRemaining(90000),'1:30');
});
