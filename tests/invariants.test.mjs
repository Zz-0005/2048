import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

const DIRECTIONS = ['left', 'right', 'up', 'down'];
const PHASES = ['ready', 'playing', 'win_pending', 'playing_after_win', 'game_over'];

function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function isPowerOfTwo(value) {
  return value >= 2 && (value & (value - 1)) === 0;
}

/* Characterisation test: the PRD invariants (4.2) must survive real play. */
test('invariants hold across 40 seeded games of up to 400 moves', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = lcg(seed * 2654435761);
    const game = G.createGame({ rng });
    game.newGame();

    let expectedScore = 0;
    let expectedMoves = 0;
    let tileCount = game.state.board.filter((v) => v !== 0).length;
    let winSeen = false;

    for (let step = 0; step < 400; step++) {
      const state = game.state;

      // --- invariants before the move
      assert.equal(state.board.length, 16, `seed ${seed}: board is 16 cells`);
      for (const value of state.board) {
        assert.ok(value === 0 || isPowerOfTwo(value), `seed ${seed}: tile ${value} is a power of two`);
      }
      assert.equal(state.score, expectedScore, `seed ${seed}: score matches merged values`);
      assert.equal(state.moves, expectedMoves, `seed ${seed}: move count`);
      assert.equal(state.maxTile, Math.max(...state.board), `seed ${seed}: maxTile`);
      assert.ok(PHASES.includes(state.phase), `seed ${seed}: phase ${state.phase}`);
      assert.equal(state.board.filter((v) => v !== 0).length, tileCount, `seed ${seed}: tile count`);
      if (state.phase === 'game_over') {
        assert.equal(G.canMove(state.board), false, `seed ${seed}: game over only without moves`);
      }
      if (state.phase === 'playing' || state.phase === 'playing_after_win') {
        assert.equal(G.canMove(state.board), true, `seed ${seed}: live game can move`);
      }
      if (state.phase === 'win_pending') {
        assert.ok(state.board.includes(2048) || state.maxTile >= 2048, `seed ${seed}: win needs 2048`);
        assert.equal(winSeen, false, `seed ${seed}: win_pending must be the first win`);
      }

      // --- the move
      const direction = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
      const before = state.board.slice();
      const result = game.move(direction);

      if (state.phase === 'win_pending' && rng() < 0.5) {
        game.continueAfterWin();
        continue;
      }

      if (result.moved) {
        expectedScore += result.gained;
        expectedMoves += 1;
        tileCount = tileCount - result.merges.length + 1;
        assert.ok(tileCount <= 16, `seed ${seed}: board never exceeds 16 tiles`);
        if (result.won) winSeen = true;
      } else {
        assert.deepEqual(state.board, before, `seed ${seed}: an invalid move changes nothing`);
      }
    }
  }
});

test('a long game reaches game over and stops accepting input', () => {
  const rng = lcg(7);
  const game = G.createGame({ rng });
  game.newGame();
  let guard = 0;
  while (game.state.phase !== 'game_over' && guard < 20000) {
    const direction = DIRECTIONS[Math.floor(rng() * 4)];
    game.move(direction);
    if (game.state.phase === 'win_pending') game.continueAfterWin();
    guard++;
  }
  assert.equal(game.state.phase, 'game_over', 'the game must be able to end');
  assert.equal(G.canMove(game.state.board), false);
  const frozen = game.state.board.slice();
  const moves = game.state.moves;
  const result = game.move('left');
  assert.equal(result.locked, true);
  assert.deepEqual(game.state.board, frozen);
  assert.equal(game.state.moves, moves);
});

test('repeated continueAfterWin never unlocks a finished game', () => {
  const game = G.createGame({ rng: lcg(3) });
  game.setBoard([
    [1024, 1024, 2, 4],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
    [8, 16, 32, 64],
  ]);
  game.move('left');
  assert.equal(game.state.phase, 'win_pending');
  game.continueAfterWin();
  assert.equal(game.state.phase, 'game_over');
  assert.equal(game.continueAfterWin(), false);
  assert.equal(game.state.phase, 'game_over');
});

test('high tiles keep exact arithmetic', () => {
  const game = G.createGame({ rng: lcg(11) });
  game.setBoard([
    [65536, 65536, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { phase: 'playing_after_win', winSeen: true });
  const result = game.move('left');
  assert.equal(result.gained, 131072);
  assert.equal(game.state.score, 131072);
  assert.equal(game.state.best, 131072);
  assert.equal(game.state.maxTile, 131072);
  assert.equal(game.state.phase, 'playing_after_win');
});
