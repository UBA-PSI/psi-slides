// usage: node shoot.mjs <audience.html> <outdir> <id:beats> [<id:beats> ...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

function findChrome() {
  if (process.env.PSI_CHROME) return process.env.PSI_CHROME;
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    const builds = fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      const mac = path.join(cache, b, 'chrome-mac-arm64');
      if (!fs.existsSync(mac)) continue;
      for (const app of fs.readdirSync(mac).filter(f => f.endsWith('.app'))) {
        const exe = path.join(mac, app, 'Contents/MacOS', app.replace(/\.app$/, ''));
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  const system = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(system)) return system;
  throw new Error('no Chromium found');
}

const [src, outdir, ...targets] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const html = fs.readFileSync(src, 'utf8');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1.5 });
for (const t of targets) {
  const [id, beatsRaw] = t.split(':');
  const beats = Number(beatsRaw || 0);
  await page.goto(`http://127.0.0.1:${port}/a.html#${id}`);
  await page.waitForTimeout(900);
  const active = await page.evaluate(() => (document.querySelector('.chunk.active') || {}).id);
  if (active !== id) console.error(`!! wanted ${id}, got ${active}`);
  for (let k = 0; k <= beats; k++) {
    if (k > 0) { await page.keyboard.press('Space'); await page.waitForTimeout(1100); }
    const now = await page.evaluate(() => (document.querySelector('.chunk.active') || {}).id);
    await page.screenshot({ path: path.join(outdir, `${id}-${k}.png`) });
    console.log(`${id}-${k}.png  active=${now}`);
  }
}
await browser.close();
server.close();
