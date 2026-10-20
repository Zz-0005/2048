import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* --- setBoard is exposed in production (window.__2048.setBoard): it must not
       let a caller put the game into a state 4.2 forbids. ------------------ */

test('setBoard rejects scores that are not non-negative integers', () => {
  const game = G.createGame({ rng: lcg(1) });
  for (const score of [NaN, Infinity, -1, 1.5, '10', null]) {
    assert.throws(() => game.setBoard([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { score }), TypeError,
      `score ${String(score)} should be rejected`);
  }
  assert.equal(game.state.score, 0, 'a rejected board leaves the state untouched');
});

test('setBoard rejects moves that are not non-negative integers', () => {
  const game = G.createGame({ rng: lcg(2) });
  for (const moves of [NaN, -3, 2.5, '7']) {
    assert.throws(() => game.setBoard([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { moves }), TypeError);
  }
});

test('setBoard rejects tiles that are not powers of two', () => {
  const game = G.createGame({ rng: lcg(3) });
  const bad = [
    [[3, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[-2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [['8', 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[2.5, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[NaN, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  ];
  for (const rows of bad) {
    assert.throws(() => game.setBoard(rows), TypeError, `row ${JSON.stringify(rows[0])} should be rejected`);
  }
});

test('setBoard still accepts a legitimate board and leaves numbers alone', () => {
  const game = G.createGame({ rng: lcg(4) });
  game.setBoard([
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, 4096],
    [8192, 16384, 32768, 65536],
  ], { score: 123456, moves: 78, phase: 'playing_after_win', winSeen: true });
  assert.equal(game.state.score, 123456);
  assert.equal(game.state.moves, 78);
  assert.equal(game.state.maxTile, 65536);
  assert.equal(game.state.winSeen, true);
});

/* --- storage: a read that failed must not be written over ---------------- */

test('a backend whose read failed is never written to', () => {
  const writes = [];
  const backend = {
    getItem() { throw new Error('blocked'); },
    setItem(key, value) { writes.push([key, value]); },
  };
  const game = G.createGame({ storage: G.createStorage(backend), rng: lcg(5) });
  game.newGame();
  game.persist();
  assert.deepEqual(writes, [], 'no best score is written when the stored one could not be read');
  assert.equal(game.state.storageDegraded, true);
});

test('a backend whose read succeeded is written to', () => {
  const writes = [];
  const backend = {
    getItem() { return '64'; },
    setItem(key, value) { writes.push([key, value]); },
  };
  const game = G.createGame({ storage: G.createStorage(backend), rng: lcg(6) });
  assert.equal(game.state.best, 64);
  game.newGame();
  assert.deepEqual(writes, [['bestScore', '64']], 'the read value is preserved on a new game');
});

test('createGame accepts a raw backend as well as an adapter', () => {
  const raw = G.memoryBackend({ bestScore: '128' });
  const game = G.createGame({ storage: raw, rng: lcg(7) });
  assert.equal(game.state.best, 128, 'a raw backend is adapted, not trusted as an adapter');
  game.newGame();
  assert.equal(raw.getItem('bestScore'), '128');

  const memoryOnly = G.createGame({ storage: null, rng: lcg(8) });
  memoryOnly.newGame();
  assert.equal(memoryOnly.state.phase, 'playing', 'a missing backend degrades instead of throwing');
});

test('only plain digit strings are read as a best score', () => {
  const cases = [
    ['0x10', 0], ['1e3', 0], ['4.0', 0], ['1e308', 0], ['-5', 0], [' 42 ', 42], ['007', 7],
    ['9007199254740993', 0],
  ];
  for (const [stored, expected] of cases) {
    const game = G.createGame({ storage: G.createStorage(G.memoryBackend({ bestScore: stored })), rng: lcg(9) });
    assert.equal(game.state.best, expected, `stored ${JSON.stringify(stored)}`);
  }
});

/* --- duration is real elapsed time, not a constant ----------------------- */

test('win and loss durations follow the injected clock', () => {
  let clock = 1000;
  const game = G.createGame({ rng: lcg(10), now: () => clock });
  game.newGame();
  game.setBoard([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  clock += 2500;
  game.move('left');
  const win = game.events.find((event) => event.name === 'game_win');
  assert.equal(win.payload.durationMs, 2500);

  clock = 5000;
  game.setBoard([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  clock = 9000;
  game.move('up');
  const over = game.events.find((event) => event.name === 'game_over');
  assert.equal(over.payload.durationMs, 4000);
});
