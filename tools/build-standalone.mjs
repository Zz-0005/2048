import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Bundles the three source files into one double-clickable HTML file.
   Why: a phone or a second computer cannot reach a local server on the LAN
   (hotspot isolation, guest Wi-Fi), but they can open a single file. */
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const [html, css, js] = await Promise.all([
  fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
  fs.readFile(path.join(ROOT, 'styles.css'), 'utf8'),
  fs.readFile(path.join(ROOT, 'script.js'), 'utf8'),
]);

/* A single file has to carry its own script and styles, so the shipped CSP
   (script-src 'self') is relaxed to inline-only for this build. */
const standaloneCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

const scriptSafe = js.replace(/<\/script/gi, '<\\/script');

let out = html
  .replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
    `<meta http-equiv="Content-Security-Policy" content="${standaloneCsp}">`,
  )
  .replace(
    /<link rel="stylesheet" href="styles\.css">/,
    `<style>\n${css}\n</style>`,
  )
  .replace(
    /<script src="script\.js"><\/script>/,
    `<script>\n${scriptSafe}\n</script>`,
  );

if (out.includes('href="styles.css"') || out.includes('src="script.js"')) {
  throw new Error('inlining failed: an external reference is still present');
}
if (!out.includes('window.__2048') && !out.includes('Game2048')) {
  throw new Error('inlining failed: the game script is not embedded');
}

const target = path.join(ROOT, '2048-standalone.html');
await fs.writeFile(path.join(ROOT, '2048-standalone.html'), out, 'utf8');
console.log(`wrote ${target} (${(Buffer.byteLength(out) / 1024).toFixed(1)} kB)`);
