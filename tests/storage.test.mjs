import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../script.js');

function memoryBackend(initial) {
  const data = { ...(initial || {}) };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    dump: () => ({ ...data }),
  };
}

function throwingBackend() {
  return {
    getItem() {
      throw new Error('SecurityError: storage denied');
    },
    setItem() {
      throw new Error('SecurityError: storage denied');
    },
  };
}

function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const ALLOWED = {
  game_start: ['source'],
  move: ['direction', 'score', 'maxTile', 'moves'],
  merge: ['mergedValue', 'score'],
  game_win: ['moves', 'durationMs'],
  game_over: ['score', 'maxTile', 'moves', 'durationMs'],
  restart: ['score'],
  storage_error: ['operation', 'key'],
};

test('AT-011: the best score survives a new game', () => {
  const backend = memoryBackend();
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(backend) });
  game.setBoard([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { phase: 'playing' });

  game.move('left');
  assert.equal(game.state.score, 2048);
  assert.equal(game.state.best, 2048);
  assert.equal(backend.getItem('bestScore'), '2048');

  game.newGame();
  assert.equal(game.state.score, 0);
  assert.equal(game.state.best, 2048);
});

test('AT-011: a reloaded game restores the stored best score', () => {
  const backend = memoryBackend({ bestScore: '5120' });
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(backend) });
  game.newGame();
  assert.equal(game.state.best, 5120);
});

test('AT-011: best score is written as an integer string', () => {
  const backend = memoryBackend();
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(backend) });
  game.setBoard([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.move('left');
  assert.equal(backend.getItem('bestScore'), '2048');
  assert.match(backend.getItem('bestScore'), /^\d+$/);
});

test('AT-012: a throwing storage backend leaves the game fully playable', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(throwingBackend()) });
  game.newGame();
  assert.equal(game.state.storageDegraded, true);
  assert.equal(game.state.best, 0);
  assert.equal(game.state.board.filter((v) => v !== 0).length, 2);

  game.setBoard([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { phase: 'playing' });
  const result = game.move('left');
  assert.equal(result.moved, true);
  assert.equal(game.state.score, 4);
  assert.equal(game.state.best, 4, 'memory best still tracks the best score');
});

test('AT-012: storage failures are reported through storage_error', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(throwingBackend()) });
  game.newGame();
  const errors = game.events.filter((e) => e.name === 'storage_error');
  assert.ok(errors.length >= 1, 'expected a storage_error event');
  for (const e of errors) {
    assert.deepEqual(Object.keys(e.payload).sort(), ['key', 'operation']);
    assert.equal(e.payload.key, 'bestScore');
    assert.ok(['read', 'write'].includes(e.payload.operation));
  }
});

test('garbage bestScore values fall back to 0', () => {
  for (const raw of ['abc', '-5', '12.7', 'null', '', 'NaN', 'Infinity']) {
    const backend = memoryBackend({ bestScore: raw });
    const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(backend) });
    assert.equal(game.state.best, 0, `expected 0 for ${JSON.stringify(raw)}`);
    assert.equal(game.state.storageDegraded, false);
  }
});

test('a huge but valid bestScore is accepted', () => {
  const backend = memoryBackend({ bestScore: '131072' });
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(backend) });
  assert.equal(game.state.best, 131072);
});

test('event payloads contain only whitelisted fields', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]), storage: G.createStorage(throwingBackend()) });
  game.newGame();
  game.setBoard([
    [1024, 1024, 2, 4],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
    [8, 16, 32, 64],
  ]);
  game.move('left');
  game.continueAfterWin();
  game.restart();

  assert.ok(game.events.length > 0);
  const seen = new Set();
  for (const event of game.events) {
    const allowed = ALLOWED[event.name];
    assert.ok(allowed, `unexpected event ${event.name}`);
    seen.add(event.name);
    for (const key of Object.keys(event.payload)) {
      assert.ok(allowed.includes(key), `${event.name} leaked field "${key}"`);
    }
  }
  for (const name of ['game_start', 'move', 'merge', 'game_win', 'game_over', 'restart']) {
    assert.ok(seen.has(name), `missing event ${name}`);
  }
});

test('an injected emit receives the same events and may fail safely', () => {
  const received = [];
  const game = G.createGame({
    rng: sequence([0.0, 0.5]),
    emit(name, payload) {
      received.push({ name, payload });
      throw new Error('analytics exploded');
    },
  });
  game.newGame();
  game.setBoard([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = game.move('left');
  assert.equal(result.moved, true);
  assert.ok(received.some((e) => e.name === 'game_start'));
  assert.ok(received.some((e) => e.name === 'move'));
  assert.ok(received.some((e) => e.name === 'merge'));
});

test('move events carry direction, score, maxTile and moves', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.move('left');
  const move = game.events.filter((e) => e.name === 'move').pop();
  assert.deepEqual(Object.keys(move.payload).sort(), ['direction', 'maxTile', 'moves', 'score']);
  assert.equal(move.payload.direction, 'left');
  assert.equal(move.payload.score, 4);
  assert.equal(move.payload.moves, 1);
});

test('game_over and game_win report duration as milliseconds', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.setBoard([
    [1024, 1024, 2, 4],
    [2, 4, 8, 16],
    [4, 8, 16, 32],
    [8, 16, 32, 64],
  ]);
  game.move('left');
  game.continueAfterWin();
  const win = game.events.find((e) => e.name === 'game_win');
  const over = game.events.find((e) => e.name === 'game_over');
  assert.equal(typeof win.payload.durationMs, 'number');
  assert.equal(typeof over.payload.durationMs, 'number');
  assert.ok(win.payload.durationMs >= 0);
});

test('the event log is bounded', () => {
  const game = G.createGame({ rng: sequence([0.0, 0.5]) });
  game.newGame();
  for (let i = 0; i < 1000; i++) game.newGame();
  assert.ok(game.events.length <= 500, `event log grew to ${game.events.length}`);
});
