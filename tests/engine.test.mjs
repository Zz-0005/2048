import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

const rows = G.rowsOf;
const board = G.boardFromRows;

test('boardFromRows / rowsOf round-trip a 4x4 board', () => {
  const r = [
    [2, 0, 0, 0],
    [0, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 8],
  ];
  const b = board(r);
  assert.equal(b.length, 16);
  assert.deepEqual(rows(b), r);
});

test('AT-002: [2,0,2,0] left merges to [4,0,0,0] and scores 4', () => {
  const result = G.moveBoard(board([[2, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [4, 0, 0, 0]);
  assert.equal(result.gained, 4);
  assert.equal(result.moved, true);
});

test('AT-003: [2,2,2,0] left merges to [4,2,0,0] and scores 4', () => {
  const result = G.moveBoard(board([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [4, 2, 0, 0]);
  assert.equal(result.gained, 4);
});

test('AT-003b: [2,2,2,0] right merges from the right to [0,0,2,4] and scores 4', () => {
  const result = G.moveBoard(board([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'right');
  assert.deepEqual(rows(result.board)[0], [0, 0, 2, 4]);
  assert.equal(result.gained, 4);
});

test('AT-004: [2,2,2,2] left merges to [4,4,0,0] and scores 8', () => {
  const result = G.moveBoard(board([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [4, 4, 0, 0]);
  assert.equal(result.gained, 8);
});

test('a tile merges at most once per move', () => {
  const result = G.moveBoard(board([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [4, 4, 0, 0]);
  assert.equal(result.gained, 4);
});

test('gaps are compacted before merging', () => {
  const result = G.moveBoard(board([[4, 0, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [8, 4, 0, 0]);
  assert.equal(result.gained, 8);
});

test('up and down move whole columns', () => {
  const start = board([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [2, 0, 0, 0],
    [4, 0, 0, 0],
  ]);
  const up = G.moveBoard(start, 'up');
  assert.deepEqual(rows(up.board).map((r) => r[0]), [4, 4, 0, 0]);
  assert.equal(up.gained, 4);

  // read from the bottom: [4,2,0,2] -> compact [4,2,2] -> merge the 2s
  const down = G.moveBoard(start, 'down');
  assert.deepEqual(rows(down.board).map((r) => r[0]), [0, 0, 4, 4]);
  assert.equal(down.gained, 4);
});

test('a move that changes nothing reports moved: false', () => {
  const start = board([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const result = G.moveBoard(start, 'left');
  assert.equal(result.moved, false);
  assert.equal(result.gained, 0);
  assert.deepEqual(rows(result.board)[0], [2, 4, 0, 0]);
});

test('moveBoard does not mutate its input board', () => {
  const start = board([[2, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const frozen = board([[2, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  G.moveBoard(start, 'left');
  assert.deepEqual(start, frozen);
});

test('merge report lists the resulting values', () => {
  const result = G.moveBoard(board([[2, 2, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(rows(result.board)[0], [4, 8, 0, 0]);
  assert.deepEqual(result.merges.sort((a, b) => a - b), [4, 8]);
});

test('canMove: full board without adjacent equals cannot move', () => {
  const full = board([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  assert.equal(G.canMove(full), false);
});

test('canMove: full board with a horizontal or vertical pair can move', () => {
  const horizontal = board([
    [2, 2, 4, 8],
    [4, 8, 16, 32],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
  ]);
  assert.equal(G.canMove(horizontal), true);

  const vertical = board([
    [2, 4, 8, 16],
    [2, 8, 16, 32],
    [4, 16, 32, 64],
    [8, 32, 64, 128],
  ]);
  assert.equal(G.canMove(vertical), true);
});

test('canMove: a board with an empty cell can always move', () => {
  const almost = board([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 0],
  ]);
  assert.equal(G.canMove(almost), true);
});

test('merge vectors with tiles larger than 2', () => {
  assert.deepEqual(G.slideLine([4, 4, 4]).line, [8, 4, 0, 0]);
  assert.equal(G.slideLine([4, 4, 4]).gained, 8);
  assert.deepEqual(G.slideLine([4, 4, 4, 4]).line, [8, 8, 0, 0]);
  assert.equal(G.slideLine([4, 4, 4, 4]).gained, 16);
  assert.deepEqual(G.slideLine([2, 2, 4]).line, [4, 4, 0, 0]);
  assert.equal(G.slideLine([2, 2, 4]).gained, 4);
  assert.deepEqual(G.slideLine([8, 8, 16, 16]).line, [16, 32, 0, 0]);
  assert.deepEqual(G.slideLine([2, 2, 2, 2, 2]).line.length, 4, 'a line is always four cells');
});

test('merge vectors hold in every direction', () => {
  const row = [[4, 4, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  assert.deepEqual(rows(G.moveBoard(board(row), 'left').board)[0], [8, 4, 0, 0]);
  assert.deepEqual(rows(G.moveBoard(board(row), 'right').board)[0], [0, 0, 4, 8]);

  const column = [[4, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]];
  assert.deepEqual(rows(G.moveBoard(board(column), 'up').board).map((r) => r[0]), [8, 4, 0, 0]);
  assert.deepEqual(rows(G.moveBoard(board(column), 'down').board).map((r) => r[0]), [0, 0, 4, 8]);

  const paired = [[4, 4, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  assert.deepEqual(rows(G.moveBoard(board(paired), 'left').board)[0], [8, 8, 0, 0]);
  assert.equal(G.moveBoard(board(paired), 'left').gained, 16);
});

test('moveBoard reports the cells where a merge happened', () => {
  const mergeLeft = G.moveBoard(board([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(mergeLeft.mergedIndices, [0]);

  const mergeRight = G.moveBoard(board([[0, 0, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'right');
  assert.deepEqual(mergeRight.mergedIndices, [3]);

  const mergeUp = G.moveBoard(board([[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'up');
  assert.deepEqual(mergeUp.mergedIndices, [0]);

  const mergeDown = G.moveBoard(board([[0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]), 'down');
  assert.deepEqual(mergeDown.mergedIndices, [12]);

  const twoMerges = G.moveBoard(board([[2, 2, 8, 8], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(twoMerges.mergedIndices, [0, 1]);

  const slideOnly = G.moveBoard(board([[0, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.deepEqual(slideOnly.mergedIndices, []);

  const invalid = G.moveBoard(board([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left');
  assert.equal(invalid.moved, false);
  assert.deepEqual(invalid.mergedIndices, []);
});
