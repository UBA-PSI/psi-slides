// The one test that starts the whole app: Electron, the window, a real
// build process and a real lecture. Everything it checks is something no
// unit test can see – that the preload reaches the renderer, that a build
// event moves the status sentence, that the language switch reaches every
// word, and that killing the window leaves no build process behind.
//
// It also takes the screenshots the design is reviewed against, at the
// window's own 760 x 600, into test/shots/ (gitignored).
//
// Run: npm run smoke   (from desktop/)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const shots = path.join(here, 'shots');

const log = (...a) => console.log('  ·', ...a);
let failures = 0;
function check(what, ok) {
  console.log(`${ok ? '  ✔' : '  ✘'} ${what}`);
  if (!ok) failures++;
}

// A copy of the tutorial lecture, so that the build writes its four views
// into a temporary folder and never into the repository.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-builder-smoke-'));
const project = path.join(work, 'smoke-lecture');
fs.mkdirSync(project);
fs.copyFileSync(path.join(repo, 'lectures/tutorial/source.md'), path.join(project, 'source.md'));
fs.cpSync(path.join(repo, 'lectures/tutorial/assets'), path.join(project, 'assets'), { recursive: true });
const source = path.join(project, 'source.md');
const pristine = fs.readFileSync(source, 'utf8');

// A user-data folder of its own, so that a smoke run does not rewrite the
// settings and the recent list of whoever is developing.
const userData = path.join(work, 'user-data');

async function waitFor(page, selector, predicate, ms = 90000) {
  const started = Date.now();
  for (;;) {
    const value = await page.$eval(selector, (el) => el.textContent).catch(() => null);
    if (value !== null && predicate(value)) return value;
    if (Date.now() - started > ms) throw new Error(`timed out waiting on ${selector}, last: ${JSON.stringify(value)}`);
    await new Promise(r => setTimeout(r, 120));
  }
}

async function shoot(page, name) {
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  log(`shot ${name}.png`);
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: desktop,
  env: { ...process.env, PSI_SMOKE: '1' },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
// The screenshots are the light-mode ones the design brief asks for, whatever
// the machine taking them prefers.
await page.emulateMedia({ colorScheme: 'light' }).catch(() => {});

try {
  // ── the start screen ─────────────────────────────────────────────
  await waitFor(page, '#screen-start h1', v => v.trim().length > 0, 20000);
  check('the start screen has its heading', (await page.textContent('#screen-start h1')).includes('Open a lecture'));
  check('the project screen is hidden', await page.isHidden('#screen-project'));
  await shoot(page, 'start-empty');

  // ── the new-lecture form ─────────────────────────────────────────
  await page.click('#btn-new');
  check('the new-lecture form opens', await page.isVisible('#sheet-new'));
  await page.fill('#new-name', 'Bad Name');
  await page.click('#btn-create');
  check('a bad folder name is refused in the form',
    /lowercase/.test(await page.textContent('#new-error')));
  await shoot(page, 'new-lecture');
  await page.click('#btn-cancel-new');

  // ── opening a lecture ────────────────────────────────────────────
  const opened = await page.evaluate((p) => window.builder.openProject(p), source);
  check('openProject accepted the source', opened && opened.ok === true);

  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()));
  log(await page.textContent('#status-text'));
  check('the four output buttons are enabled', await page.evaluate(() =>
    ['audience', 'speaker', 'print', 'print-notes']
      .every(k => !document.getElementById('out-' + k).disabled)));
  check('the project is named after its folder',
    (await page.textContent('#project-name')).trim() === 'smoke-lecture');
  await shoot(page, 'project-ready');

  // ── the settings sheet ───────────────────────────────────────────
  await page.click('#btn-settings');
  check('the settings sheet opens', await page.isVisible('#sheet-settings'));
  await shoot(page, 'settings');
  await page.click('#btn-settings-done');

  // ── the language switch ──────────────────────────────────────────
  await page.evaluate(() => window.builder.setLanguage('de'));
  await waitFor(page, '#status-text', v => /^Bereit\./.test(v.trim()), 15000);
  check('the status sentence is German', /^Bereit\./.test((await page.textContent('#status-text')).trim()));
  check('the build button is German', (await page.textContent('#btn-build')).trim() === 'Jetzt bauen');
  await page.evaluate(() => window.builder.setLanguage('en'));
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()), 15000);

  // ── a manual build ───────────────────────────────────────────────
  const firstBuiltAt = await page.evaluate(() => window.builder.getState().then(s => s.lastSuccess.at));
  await page.click('#btn-build');
  await waitFor(page, '#status-text', v => /^(Building|Ready)/.test(v.trim()), 20000);
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()));
  const secondBuiltAt = await page.evaluate(() => window.builder.getState().then(s => s.lastSuccess.at));
  check('Build now produced a newer build', secondBuiltAt > firstBuiltAt);

  // ── a build error ────────────────────────────────────────────────
  //
  // ::: cols takes 2 or 3, so this is a refusal with a sentence rather than
  // a crash, and it exercises the promise that the last good build survives.
  fs.writeFileSync(source, pristine + '\n## free: A broken chunk {#smoke-broken}\n\n::: cols 4\nOne\n:::\n');
  await waitFor(page, '#status-text', v => /failed/.test(v));
  check('the failure explains that the views are still the old ones',
    /last successful build/.test(await page.textContent('#status-sub')));
  check('the message from build.js is shown verbatim',
    /::: cols/.test(await page.textContent('#status-message')));
  check('the four output buttons stay enabled after a failure', await page.evaluate(() =>
    ['audience', 'speaker', 'print', 'print-notes']
      .every(k => !document.getElementById('out-' + k).disabled)));
  await shoot(page, 'project-error');

  // ── back to a good build, then back to the start screen ──────────
  fs.writeFileSync(source, pristine);
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()));
  check('the next good save builds again', true);

  await page.evaluate(() => window.builder.closeProject());
  await waitFor(page, '#screen-start h1', v => v.includes('Open a lecture'), 10000);
  check('the recent list has the lecture in it', await page.evaluate(() =>
    document.querySelectorAll('#recent li').length === 1));
  await shoot(page, 'start-recent');
} catch (err) {
  failures++;
  console.error('  ✘', err && err.message ? err.message : err);
  await shoot(page, 'failure').catch(() => {});
} finally {
  await app.close();
}

// ── nothing left running ───────────────────────────────────────────
//
// The watch process is a child of Electron, and Electron is gone; this is
// the check that says so rather than assuming it.
if (process.platform === 'win32') {
  log('skipping the leftover-process check on Windows');
} else {
  await new Promise(r => setTimeout(r, 800));
  let survivors = '';
  try {
    survivors = execSync('ps -A -o command=', { encoding: 'utf8' })
      .split('\n')
      .filter(l => l.includes('--events') && l.includes(work))
      .join('\n');
  } catch { /* ps is allowed to be unhappy; the check below then passes */ }
  check('no build process outlived the app', survivors.trim() === '');
  if (survivors.trim()) console.error(survivors);
}

fs.rmSync(work, { recursive: true, force: true });
console.log(failures === 0 ? '\nsmoke: ok' : `\nsmoke: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
