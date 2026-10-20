import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const FULL_NO_MERGE = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];

test('AT-008: reaching 2048 opens the win overlay once', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);

  const result = game.move('left');
  assert.equal(result.won, true);
  assert.equal(game.state.phase, 'win_pending');
  assert.equal(game.state.overlay, 'win');
  assert.equal(game.state.winSeen, true);
  assert.ok(game.state.board.includes(2048));

  assert.equal(game.continueAfterWin(), true);
  assert.equal(game.state.phase, 'playing_after_win');
  assert.equal(game.state.overlay, 'none');
});

test('AT-008: a second 2048 does not open the overlay again', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { phase: 'playing_after_win', winSeen: true });

  const result = game.move('left');
  assert.equal(result.won, false);
  assert.equal(game.state.phase, 'playing_after_win');
  assert.equal(game.state.overlay, 'none');
  assert.ok(game.state.board.includes(2048));
});

test('AT-009: a full board without merges ends the game', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard(FULL_NO_MERGE, { score: 1234 });

  const result = game.move('left');
  assert.equal(result.gameOver, true);
  assert.equal(game.state.phase, 'game_over');
  assert.equal(game.state.overlay, 'game_over');
  assert.equal(game.state.score, 1234);
});

test('AT-010: a full board with a merge keeps playing', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [2, 2, 4, 8],
    [4, 8, 16, 32],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
  ]);

  const result = game.move('left');
  assert.equal(result.moved, true);
  assert.equal(result.gameOver, false);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.overlay, 'none');
});

test('AT-018: win and loss in one move shows win first, then loss on continue', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 2, 4],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
    [8, 16, 32, 64],
  ]);

  const result = game.move('left');
  assert.equal(result.gained, 2048);
  assert.equal(result.won, true);
  assert.equal(result.gameOver, false, 'win takes precedence in the same move');
  assert.equal(game.state.phase, 'win_pending');
  assert.equal(game.state.board.filter((v) => v !== 0).length, 16, 'board is full');
  assert.equal(G.canMove(game.state.board), false, 'and cannot move');

  assert.equal(game.continueAfterWin(), true);
  assert.equal(game.state.phase, 'game_over');
  assert.equal(game.state.overlay, 'game_over');
});

test('input is locked while the win overlay is pending', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.move('left');
  const frozen = game.state.board.slice();
  const moves = game.state.moves;

  const blocked = game.move('down');
  assert.equal(blocked.moved, false);
  assert.equal(blocked.locked, true);
  assert.deepEqual(game.state.board, frozen);
  assert.equal(game.state.moves, moves);
});

test('input is locked after game over', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard(FULL_NO_MERGE);
  game.move('left');
  assert.equal(game.state.phase, 'game_over');

  const frozen = game.state.board.slice();
  const blocked = game.move('up');
  assert.equal(blocked.moved, false);
  assert.equal(blocked.locked, true);
  assert.deepEqual(game.state.board, frozen);
});

test('Esc-style dismiss keeps win_pending and the board unchanged', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.move('left');
  const frozen = game.state.board.slice();

  assert.equal(game.dismissWin(), true);
  assert.equal(game.state.overlay, 'none');
  assert.equal(game.state.phase, 'win_pending');
  assert.deepEqual(game.state.board, frozen);

  // the player can reopen and continue; dismissing never continues by itself
  assert.equal(game.move('left').locked, true);
  assert.equal(game.continueAfterWin(), true);
  assert.equal(game.state.phase, 'playing_after_win');
});

test('dismissWin only applies to an open win overlay', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.newGame();
  assert.equal(game.dismissWin(), false);
  assert.equal(game.state.phase, 'playing');
});

test('continueAfterWin does nothing outside win_pending', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.newGame();
  assert.equal(game.continueAfterWin(), false);
  assert.equal(game.state.phase, 'playing');
});

test('restart starts a fresh board and keeps the phase playing', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard(FULL_NO_MERGE, { score: 900, moves: 40 });
  game.move('left');
  assert.equal(game.state.phase, 'game_over');

  game.restart();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.overlay, 'none');
  assert.equal(game.state.score, 0);
  assert.equal(game.state.moves, 0);
  assert.equal(game.state.board.filter((v) => v !== 0).length, 2);
  assert.equal(game.state.winSeen, false);
});

test('new game resets an in-progress round', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [64, 32, 16, 8],
    [4, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { score: 600, moves: 30 });
  game.newGame();
  assert.equal(game.state.score, 0);
  assert.equal(game.state.moves, 0);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.board.filter((v) => v !== 0).length, 2);
});
