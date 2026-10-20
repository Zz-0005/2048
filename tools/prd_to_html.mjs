/**
 * Render docs/PRD-2048-v2.0.md into a standalone HTML page so the spec can be read
 * on the published site, next to the game. Dependency-free on purpose: the repo has
 * no build step and should keep it that way.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'docs', 'PRD-2048-v2.0.md');
const TARGET = join(ROOT, 'docs', 'prd.html');

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*-{3}/.test(line))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  const [head, ...body] = rows;
  const thead = '<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
  const tbody =
    '<tbody>' +
    body
      .map((cells) => '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
      .join('') +
    '</tbody>';
  return `<table>${thead}${tbody}</table>`;
}

function render(markdown) {
  const lines = markdown.split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const id = `h-${html.length}`;
      html.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const block = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        block.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(block));
      continue;
    }

    if (line.startsWith('> ')) {
      const block = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        block.push(lines[index].slice(2));
        index += 1;
      }
      html.push(`<blockquote><p>${inline(block.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ''));
        index += 1;
      }
      html.push('<ul>' + items.map((i) => `<li>${inline(i)}</li>`).join('') + '</ul>');
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^#{1,6}\s/.test(lines[index]) &&
      !lines[index].startsWith('|') &&
      !lines[index].startsWith('> ') &&
      !/^-\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}

const markdown = readFileSync(SOURCE, 'utf8');
const body = render(markdown);

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2048 PRD v2.0</title>
<style>
  :root { color-scheme: light dark; --ink: #2b2621; --muted: #6b6259; --line: #d9d1c6; --bg: #faf7f2; --link: #8a5a2b; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ece6dd; --muted: #a89c8f; --line: #40382f; --bg: #1b1815; --link: #e0a86a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
  main { max-width: 78ch; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 .6em; }
  h2 { font-size: 1.35rem; margin: 2.2em 0 .6em; padding-bottom: .3em; border-bottom: 1px solid var(--line); }
  h3 { font-size: 1.1rem; margin: 1.8em 0 .5em; }
  h4, h5, h6 { font-size: 1rem; margin: 1.4em 0 .4em; }
  p { margin: .75em 0; }
  a { color: var(--link); }
  code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: .92em; background: color-mix(in srgb, var(--line) 40%, transparent); padding: .12em .35em; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0 1.4em; font-size: .94rem; display: block; overflow-x: auto; }
  th, td { border: 1px solid var(--line); padding: .45em .6em; text-align: left; vertical-align: top; }
  th { background: color-mix(in srgb, var(--line) 30%, transparent); white-space: nowrap; }
  blockquote { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid var(--line); color: var(--muted); }
  ul { margin: .6em 0; padding-left: 1.4em; }
  li { margin: .25em 0; }
  .top { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; margin-bottom: 8px; font-size: .9rem; color: var(--muted); }
  .top a { text-decoration: none; }
</style>
</head>
<body>
<main>
<div class="top"><span>PRD-2048 v2.0 · 批准稿</span><a href="./">← 返回游戏</a></div>
${body}
</main>
</body>
</html>
`;

writeFileSync(TARGET, page, 'utf8');
console.log(`wrote ${TARGET} (${page.length} bytes, ${(page.match(/<table>/g) || []).length} tables)`);
