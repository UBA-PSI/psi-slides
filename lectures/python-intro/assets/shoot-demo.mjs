// Renders rendered-demo.html in Chromium and writes rendered-demo.png beside
// it, which #shell-vs-rendered shows against the same file's source. The
// point of the slide is that the two differ, so the picture has to come from
// the file rather than be drawn to match it.
//
//   node lectures/python-intro/assets/shoot-demo.mjs
//
// Needs playwright-core (npm install in the engine repo) and a Chromium;
// $PSI_CHROME first, else the Playwright cache, else system Chrome.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChrome } from '../../../docs/site/shoot-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 620, height: 246 }, deviceScaleFactor: 2 });
await page.goto('file://' + path.join(HERE, 'rendered-demo.html'), { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(HERE, 'rendered-demo.png') });
await browser.close();
console.log('wrote rendered-demo.png');
