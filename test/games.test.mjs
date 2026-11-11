import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slide2048,
  movePlan,
  studioState,
  studioPrice,
  studioClick,
  studioRate,
  buyEquipment,
  earn,
  offlineIncome,
  newSnake,
  stepSnake,
  validSnake,
  valid2048,
  shuffle,
  guessLibrary,
} from '../public/game-models.js';
test('guessing excludes duplicate sources, identical labels and clips of the same recording', () => {
  const base = { status: 'done', artist: 'Artist', service: 'youtube' };
  const jobs = [
    { ...base, id: 'a', title: 'Song', sourceId: 'source-a' },
    { ...base, id: 'b', title: 'Song copy', sourceId: 'source-a' },
    { ...base, id: 'clip', title: 'Song clip', parentId: 'a' },
    { ...base, id: 'c', title: 'Song', sourceId: 'other-upload' },
    { ...base, id: 'd', title: 'Another song', sourceId: 'source-d' },
  ];
  assert.deepEqual(
    guessLibrary(jobs).map((j) => j.id),
    ['a', 'd'],
  );
  assert.equal(jobs.length, 5);
});
test('2048 merges each tile once, scores all directions, and ignores no-op moves', () => {
  const board = [2, 2, 2, 2, ...Array(12).fill(0)];
  assert.deepEqual(slide2048(board, 'left').board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(slide2048(board, 'left').score, 8);
  assert.deepEqual(slide2048(board, 'right').board.slice(0, 4), [0, 0, 4, 4]);
  assert.equal(slide2048([2, 0, 0, 0, ...Array(12).fill(0)], 'left').moved, false);
  const vertical = [2, 0, 0, 0, 2, 0, 0, 0, ...Array(8).fill(0)];
  assert.equal(slide2048(vertical, 'down').board[12], 4);
  const plan = movePlan(board, 'left');
  assert.deepEqual(
    plan.map((m) => m.to),
    [0, 0, 1, 1],
  );
  assert.equal(board[0], 2);
});
test('saved boards reject invalid dimensions, values, score and malformed snakes', () => {
  assert.equal(valid2048({ board: [2, 4], score: 1 }), false);
  assert.equal(valid2048({ board: Array(16).fill(3), score: 1 }), false);
  assert.equal(valid2048({ board: Array(16).fill(2), score: Infinity }), false);
  const s = newSnake();
  assert.ok(validSnake(s));
  s.body.push(s.body[0]);
  assert.equal(validSnake(s), false);
});
test('snake may enter the vacated tail but never a wall or occupied body', () => {
  const s = {
    body: [
      [1, 1],
      [1, 2],
      [0, 2],
      [0, 1],
    ],
    dir: [-1, 0],
    food: [8, 8],
    score: 0,
  };
  assert.equal(stepSnake(s, [-1, 0]).dead, undefined);
  assert.deepEqual(s.body[0], [0, 1]);
  assert.equal(stepSnake(s, [-1, 0]).dead, true);
  const other = newSnake();
  assert.equal(stepSnake(other, [-1, 0]).dead, true);
});
test('snake spawning never overlaps its body and full-board victory terminates', () => {
  const s = newSnake();
  s.food = [8, 7];
  assert.equal(stepSnake(s, [1, 0], () => 0).eating, true);
  assert.equal(s.score, 1);
  assert.ok(!s.body.some((p) => p[0] === s.food[0] && p[1] === s.food[1]));
  const path = [];
  for (let y = 0; y < 16; y++) for (let n = 0; n < 16; n++) path.push([y % 2 ? 15 - n : n, y]);
  const full = { body: path.slice(1), dir: [-1, 0], food: [0, 0], score: 252 };
  assert.equal(stepSnake(full, [-1, 0]).won, true);
  assert.equal(full.body.length, 256);
});
test('studio purchases charge the displayed price and cannot overspend', () => {
  const s = studioState();
  assert.equal(buyEquipment(s, 0), false);
  earn(s, 20);
  assert.equal(studioPrice(s, 0), 20);
  assert.equal(buyEquipment(s, 0), true);
  assert.equal(s.coins, 0);
  assert.equal(studioClick(s), 2);
  assert.equal(buyEquipment(s, 100), false);
  earn(s, 80);
  buyEquipment(s, 1);
  assert.equal(studioRate(s), 1);
  assert.equal(studioPrice(s, 0), 24);
});
test('offline studio income is capped, cannot be claimed twice, and ignores a reversed clock', () => {
  const s = studioState({ gear: [0, 1, 0, 0, 0, 0], updated: 1000 }, 1000);
  assert.equal(offlineIncome(s, 1000 + 86400000), 1800);
  assert.equal(offlineIncome(s, 1000 + 86400000), 0);
  assert.equal(offlineIncome(s, 500), 0);
  assert.ok(Number.isFinite(studioState({ coins: Infinity, gear: [-1, Infinity] }).coins));
});
test('studio economy remains finite through an extended simulated session', () => {
  const s = studioState();
  for (let second = 0; second < 7200; second++) {
    earn(s, studioRate(s) + studioClick(s) * 3);
    for (let i = 5; i >= 0; i--) buyEquipment(s, i);
  }
  assert.ok(s.earned > 100000);
  assert.ok(s.gear.some((v) => v > 0));
  assert.ok(Number.isFinite(s.coins) && s.coins >= 0);
  assert.ok(s.gear.every((v) => v <= 100));
});
test('guess shuffle preserves each identity without mutating its input', () => {
  const source = [1, 2, 3, 4, 5];
  const out = shuffle(source, () => 0.25);
  assert.deepEqual(source, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), source);
  assert.notDeepEqual(out, source);
});
