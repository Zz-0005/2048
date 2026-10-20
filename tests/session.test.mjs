import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

const rows = G.rowsOf;

/* Deterministic rng helpers (PRD D-006 / AT-007). */
function sequence(values) {
  let i = 0;
  const rng = () => values[i++ % values.length];
  rng.calls = () => i;
  return rng;
}

function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tiles = (game) => game.state.board.filter((v) => v !== 0);

test('AT-001: a new game has exactly two tiles, each 2 or 4', () => {
  for (let n = 0; n < 200; n++) {
    const game = G.createGame({ rng: lcg(n + 1) });
    game.newGame();
    const values = tiles(game);
    assert.equal(values.length, 2, 'expected exactly two tiles');
    for (const v of values) assert.ok(v === 2 || v === 4, `unexpected tile ${v}`);
    assert.equal(game.state.score, 0);
    assert.equal(game.state.moves, 0);
    assert.equal(game.state.phase, 'playing');
  }
});

test('new game places tiles at distinct cells', () => {
  for (let n = 0; n < 50; n++) {
    const game = G.createGame({ rng: lcg(n * 7 + 3) });
    game.newGame();
    const occupied = game.state.board
      .map((v, i) => (v === 0 ? -1 : i))
      .filter((i) => i >= 0);
    assert.equal(new Set(occupied).size, occupied.length);
  }
});

test('AT-005: a valid move adds exactly one tile', () => {
  const game = G.createGame({ rng: lcg(99) });
  game.newGame();

  const before = tiles(game).length;
  let played = null;
  for (const d of ['left', 'right', 'up', 'down']) {
    const result = game.move(d);
    if (result.moved) {
      played = result;
      break;
    }
  }
  assert.ok(played, 'expected at least one direction to be valid on a fresh board');
  assert.equal(
    tiles(game).length,
    before + 1 - played.merges.length,
    'one new tile per valid move, minus the tiles that the move consumed',
  );
});

test('a merge move adds one tile and replaces the pair', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);

  const result = game.move('up');
  assert.equal(result.moved, true);
  assert.equal(result.gained, 4);
  assert.equal(result.merges.length, 1);
  assert.ok(result.newTile.value === 2 || result.newTile.value === 4);
  assert.equal(tiles(game).length, 2, 'the merged tile plus exactly one new tile');
});

test('AT-006: an invalid move changes nothing, including random state', () => {
  let calls = 0;
  const rng = () => {
    calls++;
    return 0.5;
  };
  const game = G.createGame({ rng });
  game.setBoard([
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { score: 12, moves: 7 });

  const beforeBoard = game.state.board.slice();
  const result = game.move('left');

  assert.equal(result.moved, false);
  assert.equal(calls, 0, 'an invalid move must not consume randomness');
  assert.deepEqual(game.state.board, beforeBoard);
  assert.equal(game.state.score, 12);
  assert.equal(game.state.moves, 7);
});

test('AT-007: injected rng drives placement deterministically', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5, 0.14, 0.95]) });
  game.newGame();

  // first tile: floor(0.0 * 16) = cell 0, value 2 (0.5 < 0.9)
  // second tile: floor(0.14 * 15) = 2 of the 15 empty cells -> cell 3, value 4
  assert.deepEqual(rows(game.state.board)[0], [2, 0, 0, 4]);
  assert.equal(tiles(game).length, 2);
});

test('AT-007: tiles are 2 with 90% and 4 with 10% probability', () => {
  const game = G.createGame({ rng: lcg(20261020) });
  let fours = 0;
  let total = 0;
  for (let n = 0; n < 5000; n++) {
    game.newGame();
    for (const v of game.state.board) {
      if (v === 0) continue;
      total++;
      if (v === 4) fours++;
    }
  }
  const ratio = fours / total;
  assert.ok(total > 9000, `expected many tiles, saw ${total}`);
  assert.ok(ratio > 0.08 && ratio < 0.12, `expected ~10% fours, saw ${(ratio * 100).toFixed(2)}%`);
});

test('score and moves track valid moves only', () => {
  const merge = G.createGame({ rng: sequence([0.9, 0.5]) });
  merge.setBoard([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  merge.move('left');
  assert.equal(merge.state.score, 4);
  assert.equal(merge.state.moves, 1);

  const packed = G.createGame({ rng: sequence([0.9, 0.5]) });
  packed.setBoard([
    [4, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { score: 4, moves: 1 });
  const invalid = packed.move('left');
  assert.equal(invalid.moved, false);
  assert.equal(packed.state.score, 4);
  assert.equal(packed.state.moves, 1);
});

test('maxTile reports the largest tile on the board', () => {
  const game = G.createGame({ rng: lcg(5) });
  game.setBoard([
    [2, 4, 8, 0],
    [16, 32, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.equal(game.state.maxTile, 32);
});

test('setBoard does not leak the caller array into game state', () => {
  const game = G.createGame({ rng: lcg(11) });
  const source = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  game.setBoard(source);
  source[0][0] = 999;
  assert.equal(game.state.board[0], 2);
});
