import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let server;
let browser;
let baseUrl;

before(async () => {
  server = await startServer();
  baseUrl = server.url;
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

async function openPage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__2048 && window.__2048.game);
  return { context, page, errors };
}

const board = (page) => page.evaluate(() => window.__2048.state().board);
const tileValues = (page) => page.evaluate(() => window.__2048.state().board.filter((v) => v !== 0));
const cellText = (page, index) => page.evaluate((i) => {
  const cell = document.querySelector('[data-index="' + i + '"]');
  return cell.textContent.trim();
}, index);

async function setBoard(page, rows, opts = {}) {
  await page.evaluate(([r, o]) => window.__2048.setBoard(r, o), [rows, opts]);
}

/* Dispatch a synthetic swipe; returns whether touchmove could still scroll. */
async function swipe(page, dx, dy, { fingers = 1 } = {}) {
  const rect = await page.locator('[data-testid="board"]').boundingBox();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  return page.evaluate(([cx, cy, ddx, ddy, count]) => {
    const el = document.getElementById('board');
    const point = (px, py, id) => new Touch({
      identifier: id, target: el, clientX: px, clientY: py, pageX: px, pageY: py,
    });
    const list = (pts) => pts.map(([px, py], i) => point(px, py, i + 1));
    const start = Array.from({ length: count }, (_, i) => [cx + i, cy + i]);
    const end = start.map(([px, py]) => [px + ddx, py + ddy]);
    const fire = (type, touching, changed) => {
      const event = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: list(touching),
        targetTouches: list(touching),
        changedTouches: list(changed),
      });
      return el.dispatchEvent(event);
    };
    fire('touchstart', start, start);
    const scrollAllowed = fire('touchmove', end, end);
    fire('touchend', [], end);
    return { scrollAllowed };
  }, [x, y, dx, dy, fingers]);
}

test('first paint: 4x4 grid, two starting tiles, zero score, no console errors', async () => {
  const { context, page, errors } = await openPage();
  try {
    assert.equal(await page.locator('[role="gridcell"]').count(), 16);
    assert.equal(await page.locator('.tile').count(), 2);

    const values = await tileValues(page);
    for (const value of values) assert.ok(value === 2 || value === 4, `unexpected ${value}`);

    assert.equal(await page.locator('[data-testid="score"]').textContent(), '0');
    assert.match(await page.locator('[data-testid="best"]').textContent(), /^\d+$/);
    assert.equal(await page.locator('[data-testid="overlay"]').isHidden(), true);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert.ok(layout.scrollWidth <= layout.clientWidth, 'page must not scroll horizontally');

    assert.deepEqual(errors, [], 'no console errors on load');
  } finally {
    await context.close();
  }
});

test('AT-014: arrow keys move and merge', async () => {
  const { context, page, errors } = await openPage();
  try {
    await setBoard(page, [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await cellText(page, 0), '4');
    assert.equal(await page.locator('[data-testid="score"]').textContent(), '4');

    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowRight');
    assert.equal(await cellText(page, 3), '2');

    await setBoard(page, [
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowUp');
    assert.equal(await cellText(page, 0), '2');

    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowDown');
    assert.equal(await cellText(page, 12), '2');

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('AT-014: swipes move the board and block page scroll', async () => {
  const { context, page, errors } = await openPage();
  try {
    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const right = await swipe(page, 120, 4);
    assert.equal(right.scrollAllowed, false, 'touchmove must be prevented on the board');
    assert.equal(await cellText(page, 3), '2');

    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await swipe(page, 0, 140);
    assert.equal(await cellText(page, 12), '2');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('AT-014: diagonal, short and multi-finger swipes are ignored', async () => {
  const { context, page } = await openPage();
  try {
    const setup = [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    await setBoard(page, setup);
    const before = await board(page);

    await swipe(page, 120, 100);            // 1.2 ratio: diagonal
    assert.deepEqual(await board(page), before, 'diagonal swipe must not move');

    await swipe(page, 14, 2);               // below the 24px threshold
    assert.deepEqual(await board(page), before, 'short touch must not move');

    await swipe(page, 120, 0, { fingers: 2 });
    assert.deepEqual(await board(page), before, 'multi-touch must not move');
  } finally {
    await context.close();
  }
});

test('AT-008: the win dialog shows once, Esc only hides it, continue resumes play', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [1024, 1024, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');

    const overlay = page.locator('[data-testid="overlay"]');
    await assert.doesNotReject(() => overlay.waitFor({ state: 'visible', timeout: 2000 }));
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '你赢了');
    assert.match(await page.locator('[data-testid="overlay-detail"]').textContent(), /2048/);

    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(focused, 'overlay-primary', 'focus moves to the primary action');

    const boardBefore = await board(page);
    await page.keyboard.press('Escape');
    await assert.doesNotReject(() => overlay.waitFor({ state: 'hidden', timeout: 2000 }));
    assert.deepEqual(await board(page), boardBefore, 'Esc must not change the board');
    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'win_pending');
    assert.equal(await page.locator('[data-testid="resume-win"]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'board');

    // input stays locked after dismissing the dialog
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await board(page), boardBefore, 'moves stay locked while win_pending');

    await page.locator('[data-testid="resume-win"]').click();
    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'playing_after_win');
    assert.equal(await overlay.isHidden(), true);

    // a second 2048 no longer opens the dialog
    await setBoard(page, [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { phase: 'playing_after_win', winSeen: true });
    await page.keyboard.press('ArrowLeft');
    assert.equal(await overlay.isHidden(), true, 'the win dialog is once per game');
  } finally {
    await context.close();
  }
});

test('AT-009: game over shows the final score and restarts', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ], { score: 1234 });
    await page.keyboard.press('ArrowLeft');

    const overlay = page.locator('[data-testid="overlay"]');
    await assert.doesNotReject(() => overlay.waitFor({ state: 'visible', timeout: 2000 }));
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '游戏结束');
    const detail = await page.locator('[data-testid="overlay-detail"]').textContent();
    assert.match(detail, /1234/);
    assert.equal(await page.locator('[data-testid="overlay-primary"]').textContent(), '重新开始');
    assert.equal(await page.locator('[data-testid="overlay-secondary"]').isHidden(), true);

    await page.locator('[data-testid="overlay-primary"]').click();
    assert.equal(await overlay.isHidden(), true);
    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'playing');
    assert.equal((await tileValues(page)).length, 2);
  } finally {
    await context.close();
  }
});

test('AT-018: a winning move that also fills the board ends the game after continue', async () => {
  const { context, page } = await openPage();
  try {
    // After the merge the row is [2048, 8, 16, x] where x is a random 2 or 4;
    // neither can merge with 16 or with the 32 below, so the board is always
    // full and dead whatever the RNG produces.
    await setBoard(page, [
      [1024, 1024, 8, 16],
      [2, 4, 8, 32],
      [4, 8, 16, 64],
      [8, 16, 32, 128],
    ]);
    await page.keyboard.press('ArrowLeft');

    await page.locator('[data-testid="overlay-title"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '你赢了');
    assert.equal(await page.locator('[data-testid="overlay-primary"]').textContent(), '继续游戏');
    assert.equal(
      await page.evaluate(() => window.__2048.state().board.filter((v) => v !== 0).length),
      16,
      'the board is full after the winning move',
    );

    await page.locator('[data-testid="overlay-primary"]').click();
    await page.waitForFunction(
      () => document.getElementById('overlay-title').textContent === '游戏结束',
      null,
      { timeout: 3000 },
    );
    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'game_over');
  } finally {
    await context.close();
  }
});

test('AT-011: the best score is written and survives a reload', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-testid="score"]').textContent(), '2048');
    assert.equal(await page.locator('[data-testid="best"]').textContent(), '2048');
    assert.equal(await page.evaluate(() => localStorage.getItem('bestScore')), '2048');

    await page.reload();
    await page.waitForFunction(() => window.__2048 && window.__2048.game);
    assert.equal(await page.locator('[data-testid="best"]').textContent(), '2048');
    assert.equal(await page.locator('[data-testid="score"]').textContent(), '0');

    await page.locator('[data-testid="new-game"]').click();
    assert.equal(await page.locator('[data-testid="best"]').textContent(), '2048', 'new game keeps the best score');
  } finally {
    await context.close();
  }
});

test('AT-012: a page whose localStorage throws stays playable', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    hasTouch: true,
  });
  await context.addInitScript(() => {
    const denied = () => {
      throw new DOMException('storage is denied', 'SecurityError');
    };
    Object.defineProperty(Storage.prototype, 'getItem', { value: denied, configurable: true });
    Object.defineProperty(Storage.prototype, 'setItem', { value: denied, configurable: true });
    Object.defineProperty(Storage.prototype, 'removeItem', { value: denied, configurable: true });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__2048 && window.__2048.game);

    assert.equal(await page.locator('[data-testid="storage-status"]').isVisible(), true);
    assert.equal(await page.locator('.tile').count(), 2, 'new game still deals two tiles');

    await setBoard(page, [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-testid="score"]').textContent(), '4');

    await setBoard(page, [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '游戏结束');

    assert.deepEqual(errors, [], 'storage failures must not surface as console errors');
  } finally {
    await context.close();
  }
});

test('AT-001: the new game button deals a fresh two-tile board', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [64, 32, 16, 8],
      [4, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { score: 500, moves: 40 });
    await page.locator('[data-testid="new-game"]').click();
    assert.equal((await tileValues(page)).length, 2);
    assert.equal(await page.locator('[data-testid="score"]').textContent(), '0');
    assert.equal(await page.evaluate(() => window.__2048.state().moves), 0);
  } finally {
    await context.close();
  }
});

test('AT-016: grid semantics, live region, dialog focus trap and focus return', async () => {
  const { context, page } = await openPage();
  try {
    assert.equal(await page.locator('[data-testid="board"]').getAttribute('role'), 'grid');
    assert.equal(await page.locator('.board__row[role="row"]').count(), 4);
    assert.equal(await page.locator('[role="gridcell"]').count(), 16);
    assert.equal(await page.locator('#announcer').getAttribute('aria-live'), 'polite');

    await setBoard(page, [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    const announcement = await page.locator('#announcer').textContent();
    assert.match(announcement, /合并 4/);
    assert.equal(await page.locator('[data-index="0"]').getAttribute('aria-label'), '第 1 行第 1 列，4');

    await setBoard(page, [
      [1024, 1024, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    const dialog = page.locator('.overlay__dialog');
    assert.equal(await dialog.getAttribute('role'), 'dialog');
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    assert.equal(await dialog.getAttribute('aria-labelledby'), 'overlay-title');

    // Tab cycles inside the dialog
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'overlay-secondary');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'overlay-primary');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'overlay-secondary');

    // Esc closes and returns focus to the board
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board');

    // keyboard alone can restart from the game-over dialog
    await setBoard(page, [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'overlay-primary');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-testid="overlay"]').isHidden(), true);
  } finally {
    await context.close();
  }
});

test('F9: new and merged tiles get their animation hooks; reduced motion is honoured', async () => {
  const { context, page } = await openPage({ reducedMotion: 'reduce' });
  try {
    await setBoard(page, [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.tile.is-merged').count(), 1);
    const newTileCount = await page.locator('.tile.is-new').count();
    assert.equal(newTileCount, 1);

    const duration = await page.evaluate(() => {
      const tile = document.querySelector('.tile');
      return getComputedStyle(tile).animationDuration;
    });
    const ms = duration.endsWith('ms') ? parseFloat(duration) : parseFloat(duration) * 1000;
    assert.ok(ms <= 1, `reduced motion should disable animation, got ${duration}`);
  } finally {
    await context.close();
  }
});

test('input spam while a dialog is open cannot touch the board', async () => {
  const { context, page, errors } = await openPage();
  try {
    await setBoard(page, [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ], { score: 777 });
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    const before = await board(page);
    const scoreBefore = await page.locator('[data-testid="score"]').textContent();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');

    assert.deepEqual(await board(page), before);
    assert.equal(await page.locator('[data-testid="score"]').textContent(), scoreBefore);
    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'game_over');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('a gesture that starts off the board never moves tiles or locks scrolling', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const before = await board(page);

    const outcome = await page.evaluate(() => {
      const pageEl = document.body;
      const boardEl = document.getElementById('board');
      const point = (x, y, target) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
      const fire = (type, target, touching, changed) => target.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: touching,
        targetTouches: touching,
        changedTouches: changed,
      }));

      const start = [point(10, 300, pageEl)];
      const move = [point(10, 120, pageEl)];
      fire('touchstart', pageEl, start, start);
      const scrollAllowed = fire('touchmove', pageEl, move, move);
      // the finger lifts over the board: the board must not treat it as its own gesture
      fire('touchend', boardEl, [], move);
      return { scrollAllowed };
    });

    assert.equal(outcome.scrollAllowed, true, 'page scrolling stays available off the board');
    assert.deepEqual(await board(page), before, 'the board ignores a foreign gesture');
  } finally {
    await context.close();
  }
});

test('repeated valid moves keep the board consistent', async () => {
  const { context, page, errors } = await openPage();
  try {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'][i % 4]);
      const state = await page.evaluate(() => window.__2048.state());
      assert.equal(state.board.length, 16);
      for (const value of state.board) {
        assert.ok(value === 0 || (value >= 2 && (value & (value - 1)) === 0), 'unexpected tile ' + value);
      }
      assert.equal(state.maxTile, Math.max(...state.board));
      if (state.phase === 'win_pending') await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('AT-016: the page behind a dialog is inert and comes back afterwards', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), true);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'overlay-primary',
      'focus moves into the dialog',
    );
    assert.equal(
      await page.evaluate(() => document.getElementById('new-game').closest('[inert]') !== null),
      true,
      'toolbar buttons cannot be reached while the dialog is up',
    );

    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board', 'focus returns to the board');

    // and again for the end-of-game dialog, which is dismissed by restarting
    await page.evaluate(() => window.__2048.setBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]));
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), true);

    await page.locator('[data-testid="overlay-primary"]').click();
    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
  } finally {
    await context.close();
  }
});
