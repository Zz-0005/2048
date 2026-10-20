import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const AXE_PATH = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');

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

async function openPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__2048 && window.__2048.game);
  return { context, page, errors };
}

test('AT-017: release package carries licence, version and attribution', () => {
  const required = ['index.html', 'styles.css', 'script.js', 'LICENSE', 'NOTICE.md', 'README.md', 'VERSION'];
  for (const file of required) {
    assert.ok(existsSync(path.join(ROOT, file)), `missing ${file}`);
  }

  const license = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /WITHOUT WARRANTY OF ANY KIND/);

  const notice = readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
  assert.match(notice, /Gabriele Cirulli/);
  assert.match(notice, /github\.com\/gabrielecirulli\/2048/);
  assert.match(notice, /MIT/);

  const version = readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(version, pkg.version);

  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, new RegExp('版本 ' + version.replace(/\./g, '\\.')));
  assert.match(html, /Content-Security-Policy/);
});

test('NFR-006: page, styles and logic are separate files', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
  assert.match(html, /<script src="script\.js"><\/script>/);
  assert.equal(/<style[\s>]/.test(html), false, 'no inline style blocks');
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html), false, 'no inline script blocks');

  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  for (const id of ['AT-001', 'AT-007', 'AT-012', 'AT-014', 'AT-018', 'NFR-001']) {
    assert.ok(readme.includes(id), `README traceability table misses ${id}`);
  }
});

test('AT-015: a full keyboard session runs without console errors', async () => {
  const { context, page, errors } = await openPage();
  try {
    // a fresh round
    await page.locator('[data-testid="new-game"]').click();
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
    }

    // win, continue, keep playing
    await page.evaluate(() => window.__2048.setBoard([
      [1024, 1024, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay-primary"]').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');

    // game over and restart
    await page.evaluate(() => window.__2048.setBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]));
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay-primary"]').click();

    assert.equal(await page.evaluate(() => window.__2048.state().phase), 'playing');
    assert.deepEqual(errors, [], 'no console errors across the whole session');
  } finally {
    await context.close();
  }
});

test('NFR-001: p75 move handling stays under 100ms', async () => {
  const { context, page } = await openPage();
  try {
    const stats = await page.evaluate(() => {
      const api = window.__2048;
      const dirs = ['left', 'right', 'up', 'down'];
      const times = [];
      for (let i = 0; i < 200; i++) {
        if (i % 20 === 0) {
          api.setBoard([
            [2, 4, 8, 16],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]);
        }
        const started = performance.now();
        api.press(dirs[i % dirs.length]);
        times.push(performance.now() - started);
      }
      times.sort((a, b) => a - b);
      const pick = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
      return {
        p50: pick(0.5),
        p75: pick(0.75),
        max: times[times.length - 1],
        avg: times.reduce((sum, t) => sum + t, 0) / times.length,
      };
    });

    console.log('move handling ms:', JSON.stringify(stats));
    assert.ok(stats.p75 <= 100, `p75 ${stats.p75.toFixed(1)}ms exceeds 100ms`);
    assert.ok(stats.max <= 200, `worst move ${stats.max.toFixed(1)}ms is too slow`);
  } finally {
    await context.close();
  }
});

async function injectAxe(page) {
  const source = readFileSync(AXE_PATH, 'utf8');
  await page.addInitScript({ content: source });
  await page.reload();
  await page.waitForFunction(() => window.__2048);
  await page.waitForFunction(() => typeof window.axe !== 'undefined', null, { timeout: 20000 });
}

/* Colour contrast is only meaningful once the 100–200ms entry animations
   (PRD F9) have finished; a mid-fade scan would grade a translucent frame. */
async function settle(page) {
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => animation.playState !== 'running'),
    null,
    { timeout: 5000 },
  );
}

async function axeViolations(page) {
  await settle(page);
  const results = await page.evaluate(async () => {
    const report = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return report.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
  });
  return results;
}

test('AT-016: axe finds no serious or critical violations', async () => {
  const { context, page } = await openPage();
  try {
    await injectAxe(page);

    const initial = await axeViolations(page);
    const initialBad = initial.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    assert.deepEqual(initialBad, [], 'axe violations on the initial page');

    await page.evaluate(() => window.__2048.setBoard([
      [1024, 1024, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    const win = (await axeViolations(page)).filter((v) => v.impact === 'serious' || v.impact === 'critical');
    assert.deepEqual(win, [], 'axe violations with the win dialog open');

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__2048.setBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]));
    await page.keyboard.press('ArrowUp');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    const over = (await axeViolations(page)).filter((v) => v.impact === 'serious' || v.impact === 'critical');
    assert.deepEqual(over, [], 'axe violations with the game-over dialog open');
  } finally {
    await context.close();
  }
});

test('NFR-005: no inline event handlers and no remote resources', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'no inline event handlers');
  const remote = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const url of remote) {
    assert.ok(url.startsWith('https://github.com/gabrielecirulli/2048'), `unexpected remote resource ${url}`);
  }
});

async function axTree(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Accessibility.enable');
  const { nodes } = await client.send('Accessibility.getFullAXTree');
  await client.detach();
  return nodes
    .filter((node) => !node.ignored)
    .map((node) => ({
      role: node.role && node.role.value,
      name: (node.name && node.name.value) || '',
      description: (node.description && node.description.value) || '',
      properties: (node.properties || []).reduce((acc, property) => {
        acc[property.name] = property.value && property.value.value;
        return acc;
      }, {}),
    }));
}

test('AT-016: the accessibility tree exposes the board, cells and live region', async () => {
  const { context, page } = await openPage();
  try {
    const tree = await axTree(page);

    const grid = tree.find((node) => node.role === 'grid');
    assert.ok(grid, 'a grid node exists');
    assert.match(grid.name, /2048 棋盘/);

    const cells = tree.filter((node) => node.role === 'gridcell');
    assert.equal(cells.length, 16, 'all 16 cells are exposed');
    assert.ok(cells.every((cell) => /第 \d 行第 \d 列/.test(cell.name)), 'every cell has a position label');

    const status = tree.find((node) => node.role === 'status');
    assert.ok(status, 'the live region is exposed as a status node');
    assert.equal(status.properties.live, 'polite');

    const buttons = tree.filter((node) => node.role === 'button').map((node) => node.name);
    assert.ok(buttons.includes('新局'), 'the new-game button has an accessible name');
    assert.equal(buttons.includes('继续游戏'), false, 'the resume control stays out of the tree until it is needed');

    // the win dialog must arrive as a named modal dialog
    await page.evaluate(() => window.__2048.setBoard([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    const dialogTree = await axTree(page);
    const dialog = dialogTree.find((node) => node.role === 'dialog');
    assert.ok(dialog, 'the win overlay is a dialog');
    assert.equal(dialog.name, '你赢了');
    assert.match(dialog.description, /当前分数/);
    assert.equal(dialog.properties.modal, true);

    // with the dialog modal, the board must leave the accessibility tree
    assert.equal(dialogTree.some((node) => node.role === 'grid'), false, 'the board is inert behind the modal');

    // Esc hides the dialog and leaves a keyboard route back into the round
    await page.keyboard.press('Escape');
    const dismissed = await axTree(page);
    const afterEsc = dismissed.filter((node) => node.role === 'button').map((node) => node.name);
    assert.ok(afterEsc.includes('继续游戏'), 'the resume control is reachable after Esc');
    assert.ok(dismissed.some((node) => node.role === 'grid'), 'the board comes back into the tree');
  } finally {
    await context.close();
  }
});

test('AT-015: the page also runs when opened straight from disk', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));

  try {
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
    await page.waitForFunction(() => window.__2048 && window.__2048.state().phase === 'playing');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.tile').length), 2);

    await page.evaluate(() => window.__2048.setBoard([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.__2048.state().score), 4);
    assert.deepEqual(errors, [], 'a file:// load must not log console errors');
  } finally {
    await context.close();
  }
});
