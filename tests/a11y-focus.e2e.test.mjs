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
    hasTouch: true,
    ...options,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__2048 && window.__2048.game);
  return { context, page };
}

const activeId = (page) => page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
const announcement = (page) => page.evaluate(() => document.getElementById('announcer').textContent);

async function setBoard(page, rows, opts = {}) {
  await page.evaluate(([r, o]) => window.__2048.setBoard(r, o), [rows, opts]);
}

const WINNING_BOARD = [
  [1024, 1024, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

const DEAD_BOARD = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];

test('Esc returns focus to the board even when the round did not start from it', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, WINNING_BOARD);
    // clicking plain text blurs to <body>, which must never become the restore target
    await page.locator('.brand__rule').click();
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true);

    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.equal(await activeId(page), 'overlay-primary');

    await page.keyboard.press('Escape');
    assert.equal(await activeId(page), 'board', 'focus must land on the board, not <body>');
  } finally {
    await context.close();
  }
});

test('the board keeps focus after continuing and after restarting', async () => {
  const { context, page } = await openPage();
  try {
    // continuing from the win dialog
    await setBoard(page, WINNING_BOARD);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="overlay-primary"]').click();
    assert.equal(await activeId(page), 'board', 'continuing returns focus to the board');
    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), false);

    // and restarting from the end dialog, which opens while the win dialog is up
    await setBoard(page, DEAD_BOARD);
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="overlay-primary"]').click();
    assert.equal(await activeId(page), 'board', 'restarting returns focus to the board');
    assert.equal(await page.evaluate(() => document.getElementById('game-surface').inert), false);
  } finally {
    await context.close();
  }
});

test('clicking the backdrop never drops focus out of the modal', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, WINNING_BOARD);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    // the dimmed area, well away from the dialog card
    await page.mouse.click(6, 6);
    assert.equal(await activeId(page), 'overlay-primary', 'focus stays in the dialog');
    assert.equal(await page.locator('[data-testid="overlay"]').isVisible(), true, 'the dialog stays open');

    await page.keyboard.press('Shift+Tab');
    assert.equal(await activeId(page), 'overlay-secondary', 'the trap still works after a backdrop click');
    await page.keyboard.press('Tab');
    assert.equal(await activeId(page), 'overlay-primary');
  } finally {
    await context.close();
  }
});

test('a move that changes nothing is announced', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    assert.match(await announcement(page), /无法向左移动/);
    assert.equal(await page.evaluate(() => window.__2048.state().moves), 0);
  } finally {
    await context.close();
  }
});

test('win and loss reach the live region even though a dialog opens', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, WINNING_BOARD);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.match(await announcement(page), /你赢了/);

    await page.keyboard.press('Escape');
    await setBoard(page, DEAD_BOARD);
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.match(await announcement(page), /游戏结束/);
  } finally {
    await context.close();
  }
});

test('the storage warning is written once, not on every move', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 } });
  await context.addInitScript(() => {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    Object.defineProperty(window, 'localStorage', { get() { return broken; } });
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__2048);
    assert.equal(await page.evaluate(() => window.__2048.state().storageDegraded), true);
    assert.equal(await page.locator('[data-testid="storage-status"]').isVisible(), true);

    const mutations = await page.evaluate(() => {
      const status = document.getElementById('storage-status');
      window.__2048Mutations = 0;
      const observer = new MutationObserver((records) => {
        window.__2048Mutations += records.length;
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
      window.__2048Observer = observer;
      return 0;
    });
    assert.equal(mutations, 0);

    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      await page.keyboard.press(key);
    }
    assert.equal(await page.evaluate(() => window.__2048Mutations), 0,
      'the warning must not be rewritten while play continues');
  } finally {
    await context.close();
  }
});

test('a pure slide is not animated as a merge', async () => {
  const { context, page } = await openPage();
  try {
    await setBoard(page, [
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    const slid = await page.evaluate(() => document.querySelector('[data-index="0"] .tile').className);
    assert.equal(slid.includes('is-merged'), false, 'a tile that only slid must not pop');
    assert.equal(slid.includes('is-new'), false);

    await setBoard(page, [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    await page.keyboard.press('ArrowLeft');
    const merged = await page.evaluate(() => document.querySelector('[data-index="0"] .tile').className);
    assert.equal(merged.includes('is-merged'), true, 'a merged tile pops');
  } finally {
    await context.close();
  }
});

test('Space on the focused board does not scroll the page', async () => {
  const { context, page } = await openPage({ viewport: { width: 320, height: 420 } });
  try {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
      true,
      'this viewport is meant to overflow',
    );
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById('board').focus();
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'space must not scroll the board away');
  } finally {
    await context.close();
  }
});

test('arrow keys do not scroll the page behind a dialog', async () => {
  const { context, page } = await openPage({ viewport: { width: 320, height: 420 } });
  try {
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    assert.equal(scrollable, true, 'this viewport is meant to overflow');

    await setBoard(page, DEAD_BOARD);
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('PageDown');
    const after = await page.evaluate(() => window.scrollY);
    assert.equal(after, before, 'the page behind the modal must not scroll');
  } finally {
    await context.close();
  }
});

test('a short landscape screen shows the whole board without scrolling on load', async () => {
  const { context, page } = await openPage({ viewport: { width: 667, height: 375 }, isMobile: true });
  try {
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => {
      const boardRect = document.getElementById('board').getBoundingClientRect();
      const topbarRect = document.querySelector('.topbar').getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        boardTop: boardRect.top,
        boardBottom: boardRect.bottom,
        topbarTop: topbarRect.top,
        viewport: window.innerHeight,
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        footerVisible: document.querySelector('.footer').getClientRects().length > 0,
        footerText: document.querySelector('.footer').textContent.replace(/\s+/g, ' ').trim(),
        describedVisible: (() => {
          const id = document.getElementById('board').getAttribute('aria-describedby');
          const el = id ? document.getElementById(id) : null;
          if (!el) return false;
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })(),
      };
    });
    assert.equal(metrics.scrollY, 0, 'the page must not jump on load');
    assert.ok(metrics.topbarTop >= 0, 'the title and scores stay on screen');
    assert.ok(metrics.boardBottom <= metrics.viewport + 1, 'the board fits the viewport height');
    assert.equal(metrics.horizontalScroll, false);
    assert.equal(metrics.footerVisible, true, 'the version and licence stay on the page in landscape');
    assert.match(metrics.footerText, /MIT/);
    assert.match(metrics.footerText, /gabrielecirulli\/2048/);
    assert.equal(metrics.describedVisible, true, "the board's aria-describedby target stays in the accessibility tree");
  } finally {
    await context.close();
  }
});

test('a real touch swipe moves the board and does not scroll the page', async () => {
  const { context, page } = await openPage({ viewport: { width: 320, height: 420 } });
  try {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
      true,
      'the page must be scrollable for this test to mean anything',
    );
    await setBoard(page, [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);

    const client = await context.newCDPSession(page);
    const rect = await page.locator('[data-testid="board"]').boundingBox();
    const centreX = rect.x + rect.width / 2;
    const centreY = rect.y + rect.height / 2;

    const swipe = async (startX, startY, dx, dy) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY, id: 1 }] });
      for (let step = 1; step <= 6; step++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX + (dx * step) / 6, y: startY + (dy * step) / 6, id: 1 }],
        });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
    };

    await swipe(centreX, centreY, 90, 0);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'a board swipe must not scroll the page');
    assert.equal(await page.evaluate(() => window.__2048.state().moves), 1, 'the swipe is a real move');
    assert.equal(
      await page.evaluate(() => window.__2048.state().board.filter((value) => value === 2).length >= 1),
      true,
    );

    // a gesture that starts on ordinary page text still scrolls
    const before = await page.evaluate(() => window.scrollY);
    await swipe(8, 200, 0, -140);
    const after = await page.evaluate(() => window.scrollY);
    assert.ok(after > before, 'the page must still scroll outside the board');
  } finally {
    await context.close();
  }
});
