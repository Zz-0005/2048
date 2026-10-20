import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './serve.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.resolve('docs/screenshots');

const BOARDS = {
  mid: [
    [2, 4, 8, 16],
    [0, 32, 64, 128],
    [2, 0, 256, 512],
    [4, 8, 0, 1024],
  ],
  over: [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ],
  win: [
    [1024, 1024, 2, 0],
    [4, 8, 16, 32],
    [64, 128, 256, 512],
    [2, 4, 8, 16],
  ],
};

await mkdir(OUT, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ executablePath: EDGE, headless: true });

const sizes = [
  { name: 'mobile', width: 390, height: 800 },
  { name: 'small', width: 320, height: 680 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function settle(page) {
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => animation.playState !== 'running'),
    null,
    { timeout: 5000 },
  );
}
const geometry = {};

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: size.width < 600,
  });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.__2048);

  const layout = await page.evaluate(() => {
    const rect = document.querySelector('[data-testid="board"]').getBoundingClientRect();
    const all = [...document.querySelectorAll('[role="gridcell"]')];
    const first = all[0].getBoundingClientRect();
    const right = all[1].getBoundingClientRect();
    const below = all[4].getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      board: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      cells: {
        width: first.width,
        height: first.height,
        gapX: right.x - (first.x + first.width),
        gapY: below.y - (first.y + first.height),
      },
    };
  });
  geometry[size.name] = layout;

  await page.screenshot({ path: path.join(OUT, `${size.name}-fresh.png`) });

  await page.evaluate((rows) => window.__2048.setBoard(rows, { score: 3560 }), BOARDS.mid);
  await page.screenshot({ path: path.join(OUT, `${size.name}-mid.png`) });

  if (size.name === 'mobile') {
    await page.evaluate((rows) => window.__2048.setBoard(rows, { score: 1234 }), BOARDS.over);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, 'mobile-gameover.png') });

    await page.evaluate((rows) => window.__2048.setBoard(rows, { score: 20480 }), BOARDS.win);
    await page.keyboard.press('ArrowLeft');
    await page.locator('[data-testid="overlay"]').waitFor({ state: 'visible' });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, 'mobile-win.png') });
  }

  await context.close();
}

await writeFile(path.join(OUT, 'geometry.json'), JSON.stringify(geometry, null, 2), 'utf8');
await browser.close();
await server.close();
console.log('screenshots written to', OUT);
