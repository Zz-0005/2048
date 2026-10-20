import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = path.join(ROOT, '2048-standalone.html');
const fileUrl = pathToFileURL(FILE).href;

let browser;

before(async () => {
  if (!existsSync(FILE)) {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-standalone.mjs')], { stdio: 'inherit' });
  }
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
});

after(async () => {
  if (browser) await browser.close();
});

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__2048 && window.__2048.game);
  return { context, page, errors };
}

const setBoard = (page, rows, opts = {}) =>
  page.evaluate(([r, o]) => window.__2048.setBoard(r, o), [rows, opts]);

test('the single file runs from file:// with no console errors', async () => {
  const { context, page, errors } = await open();
  try {
    assert.equal(await page.locator('.cell').count(), 16);
    assert.equal(await page.locator('.tile').count() >= 2, true);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => window.__2048.state().moves) >= 1);
    assert.deepEqual(errors, [], 'no CSP or script errors may be reported');
  } finally {
    await context.close();
  }
});

test('win and loss dialogs work offline', async () => {
  const { context, page, errors } = await open();
  try {
    await setBoard(page, [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '你赢了');
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'hidden' });

    await setBoard(page, [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-testid="overlay-title"]').textContent(), '游戏结束');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('touch swipes work on the single file', async () => {
  const { context, page } = await open({ viewport: { width: 360, height: 740 } });
  try {
    await setBoard(page, [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const client = await context.newCDPSession(page);
    const rect = await page.locator('[data-testid="board"]').boundingBox();
    const x = Math.round(rect.x + rect.width / 2);
    const y = Math.round(rect.y + rect.height / 2);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + step * 16, y, id: 1 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__2048.state().moves), 1);
  } finally {
    await context.close();
  }
});

test('the best score survives a reload of the same file', async () => {
  const { context, page } = await open();
  try {
    await page.evaluate(() => window.__2048.game.setBoard([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    await page.keyboard.press('ArrowLeft');
    const best = await page.evaluate(() => window.__2048.state().best);
    assert.ok(best >= 4, 'a merge must raise the best score');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__2048);
    assert.equal(await page.evaluate(() => window.__2048.state().best), best);
  } finally {
    await context.close();
  }
});
