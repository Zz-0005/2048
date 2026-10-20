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

/* WCAG relative luminance contrast, evaluated in the page. */
const CONTRAST_FN = `
function parseRgb(value) {
  const match = value.match(/rgba?\\(([^)]+)\\)/);
  if (!match) return null;
  const parts = match[1].split(',').map((n) => parseFloat(n));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(rgb) {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}
function blend(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function ratioOf(fgColor, bgColor) {
  const fg = parseRgb(fgColor);
  const bg = parseRgb(bgColor);
  if (!fg || !bg) return null;
  const solid = blend(fg, bg);
  const l1 = luminance(solid);
  const l2 = luminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
`;

const VIEWPORTS = [
  { name: '320x640', width: 320, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x900', width: 1280, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test(`layout @ ${viewport.name}: no horizontal scroll, square board, even cells`, async () => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(() => window.__2048);

      const metrics = await page.evaluate(() => {
        const board = document.querySelector('[data-testid="board"]');
        const cells = [...document.querySelectorAll('[role="gridcell"]')];
        const rect = board.getBoundingClientRect();
        const sizes = cells.map((c) => {
          const r = c.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          board: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
          sizes,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `horizontal scroll at ${viewport.name}: ${metrics.scrollWidth} > ${metrics.clientWidth}`,
      );
      assert.ok(Math.abs(metrics.board.width - metrics.board.height) <= 2, 'board must be square');
      assert.ok(metrics.board.left >= 0, 'board starts inside the viewport');
      assert.ok(metrics.board.right <= viewport.width + 1, 'board ends inside the viewport');

      const widths = metrics.sizes.map((s) => s.w);
      const heights = metrics.sizes.map((s) => s.h);
      assert.ok(Math.max(...widths) - Math.min(...widths) <= 2, 'cells share one width');
      assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, 'cells share one height');
      assert.ok(Math.min(...widths) >= 60, `cells too small: ${Math.min(...widths)}px`);
    } finally {
      await context.close();
    }
  });
}

test('tiles never overflow their cell, including 131072', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__2048);
    await page.evaluate(() => window.__2048.setBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [8192, 16384, 32768, 131072],
    ]));

    const overflow = await page.evaluate(() => {
      const out = [];
      for (const cell of document.querySelectorAll('[role="gridcell"]')) {
        const tile = cell.firstElementChild;
        if (!tile) continue;
        if (tile.scrollWidth > cell.clientWidth + 1 || tile.scrollHeight > cell.clientHeight + 1) {
          out.push({ value: tile.textContent, scroll: [tile.scrollWidth, tile.scrollHeight], cell: [cell.clientWidth, cell.clientHeight] });
        }
      }
      return out;
    });
    assert.deepEqual(overflow, []);
  } finally {
    await context.close();
  }
});

test('text and tiles meet WCAG AA contrast (4.5:1)', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__2048);

    const results = await page.evaluate((fn) => {
      function parseRgb(value) {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(',').map((n) => parseFloat(n));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
      function channel(c) {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      }
      function luminance(rgb) {
        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
      }
      function blend(fg, bg) {
        const a = fg.a;
        return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
      }
      function ratioOf(fgColor, bgColor) {
        const fg = parseRgb(fgColor);
        const bg = parseRgb(bgColor);
        const solid = blend(fg, bg);
        const l1 = luminance(solid);
        const l2 = luminance(bg);
        const hi = Math.max(l1, l2);
        const lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      }
      function measure(node) {
        let bgNode = node;
        let bg = getComputedStyle(bgNode).backgroundColor;
        while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && bgNode.parentElement) {
          bgNode = bgNode.parentElement;
          bg = getComputedStyle(bgNode).backgroundColor;
        }
        return ratioOf(getComputedStyle(node).color, bg);
      }
      const targets = {
        body: document.body,
        'brand-rule': document.querySelector('.brand__rule'),
        hint: document.querySelector('.hint'),
        footer: document.querySelector('.footer p'),
        'score-value': document.querySelector('[data-testid="score"]'),
        'score-label': document.querySelector('.score__label'),
        'best-label': document.querySelector('.score--best .score__label'),
        'new-game': document.querySelector('[data-testid="new-game"]'),
        'footer-link': document.querySelector('.footer a'),
      };
      const out = {};
      for (const [name, node] of Object.entries(targets)) {
        if (node) out[name] = Math.round(measure(node) * 100) / 100;
      }
      return out;
    }, CONTRAST_FN);

    for (const [name, ratio] of Object.entries(results)) {
      assert.ok(ratio >= 4.5, `${name} contrast ${ratio} is below 4.5`);
    }

    await page.evaluate(() => window.__2048.setBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [8192, 16384, 32768, 65536],
    ]));

    const tiles = await page.evaluate(() => {
      function parseRgb(value) {
        const match = value.match(/rgba?\(([^)]+)\)/);
        const parts = match[1].split(',').map((n) => parseFloat(n));
        return { r: parts[0], g: parts[1], b: parts[2] };
      }
      function channel(c) {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      }
      function luminance(rgb) {
        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
      }
      const rows = [];
      for (const tile of document.querySelectorAll('.tile')) {
        const style = getComputedStyle(tile);
        const fg = luminance(parseRgb(style.color));
        const bg = luminance(parseRgb(style.backgroundColor));
        const hi = Math.max(fg, bg);
        const lo = Math.min(fg, bg);
        rows.push({ value: tile.textContent, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 });
      }
      return rows;
    });

    for (const tile of tiles) {
      assert.ok(tile.ratio >= 4.5, `tile ${tile.value} contrast ${tile.ratio} is below 4.5`);
    }
  } finally {
    await context.close();
  }
});

test('board blocks page scroll and keeps a visible focus ring', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__2048);

    const styles = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="board"]');
      const style = getComputedStyle(board);
      const button = document.querySelector('[data-testid="new-game"]');
      const rect = button.getBoundingClientRect();
      board.focus();
      const focused = getComputedStyle(board);
      return {
        touchAction: style.touchAction,
        overscroll: style.overscrollBehavior,
        outlineWidth: focused.outlineWidth,
        outlineStyle: focused.outlineStyle,
        buttonHeight: rect.height,
      };
    });

    assert.equal(styles.touchAction, 'none');
    assert.equal(styles.overscroll, 'contain');
    assert.ok(parseFloat(styles.outlineWidth) >= 2, `focus ring too thin: ${styles.outlineWidth}`);
    assert.notEqual(styles.outlineStyle, 'none');
    assert.ok(styles.buttonHeight >= 44, `tap target too small: ${styles.buttonHeight}`);
  } finally {
    await context.close();
  }
});

test('the win dialog fits a 320px screen', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__2048);
    await page.evaluate(() => window.__2048.setBoard([
      [1024, 1024, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });

    const fit = await page.evaluate(() => {
      const dialog = document.querySelector('.overlay__dialog').getBoundingClientRect();
      return {
        left: dialog.left,
        right: dialog.right,
        width: dialog.width,
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    assert.ok(fit.left >= 0 && fit.right <= fit.viewport + 1, 'dialog inside the viewport');
    assert.ok(fit.scrollWidth <= fit.clientWidth + 1, 'dialog does not cause horizontal scroll');
  } finally {
    await context.close();
  }
});

test('footer shows the version, licence and upstream attribution', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    const text = await page.locator('.footer').textContent();
    assert.match(text, /1\.0\.0/);
    assert.match(text, /MIT/);
    assert.match(text, /gabrielecirulli\/2048/);
    assert.match(text, /Gabriele Cirulli/);
    const href = await page.locator('.footer a').getAttribute('href');
    assert.equal(href, 'https://github.com/gabrielecirulli/2048');
  } finally {
    await context.close();
  }
});
