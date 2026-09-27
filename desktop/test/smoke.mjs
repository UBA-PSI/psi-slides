// The one test that starts the whole app: Electron, the window, a real
// build process and a real lecture. Everything it checks is something no
// unit test can see – that the preload reaches the renderer, that a build
// event moves the status sentence, that the language switch reaches every
// word, and that killing the window leaves no build process behind.
//
// It also takes the screenshots the design is reviewed against, at the
// window's own 760 x 680, into test/shots/ (gitignored) – including the two
// the light English shots cannot answer for, German (the longest words) and
// dark mode (the dot, the primary button and the error block).
//
// It exports the three PDFs through the window as a person would – the
// button, the sheet, Export – with the save dialog answered by the test: the
// stub accepts the name the main process proposes, so the files land beside
// the working copy's source.md (slides.pdf, print.pdf, print-notes.pdf), as
// they would for a person who pressed Save. PSI_SMOKE_KEEP=1 leaves that
// working copy on disk and prints where it is, for a comparison with the
// command line's exports of the same source.
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
  // The pointer out of the way, so a shot shows no hover left over from the
  // last click.
  await page.mouse.move(0, 0).catch(() => {});
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
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
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

  // The one line this app exists to show must not be somewhere the person
  // scrolls to, so the whole ready state has to stand in the window the app
  // opens at. This is that promise as a number rather than as an eye.
  const room = await page.evaluate(() => ({
    content: document.documentElement.scrollHeight, window: window.innerHeight }));
  log(`ready state is ${room.content} px in a ${room.window} px window`);
  check('the ready state needs no scrollbar at the default window size',
    room.content <= room.window);

  await page.emulateMedia({ colorScheme: 'dark' });
  await shoot(page, 'project-ready-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── the settings sheet ───────────────────────────────────────────
  await page.click('#btn-settings');
  check('the settings sheet opens', await page.isVisible('#sheet-settings'));
  check('the project screen is out of the way behind it', await page.isHidden('#content'));
  await shoot(page, 'settings');
  await page.click('#btn-settings-done');
  check('closing the sheet brings the project screen back', await page.isVisible('#content'));
  check('the focus goes back to the gear that opened it',
    await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-settings'));

  // ── the language switch ──────────────────────────────────────────
  await page.evaluate(() => window.builder.setLanguage('de'));
  await waitFor(page, '#status-text', v => /^Bereit\./.test(v.trim()), 15000);
  check('the status sentence is German', /^Bereit\./.test((await page.textContent('#status-text')).trim()));
  check('the build button is German', (await page.textContent('#btn-build')).trim() === 'Jetzt bauen');
  await shoot(page, 'project-ready-de');
  const roomDe = await page.evaluate(() => ({
    content: document.documentElement.scrollHeight, window: window.innerHeight }));
  log(`German ready state is ${roomDe.content} px in a ${roomDe.window} px window`);
  check('the German ready state needs no scrollbar either', roomDe.content <= roomDe.window);
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

  // ── the PDF exports ──────────────────────────────────────────────
  //
  // The save dialog is the main process's own and would block the run, so
  // it is replaced in the main process by an answer: the path the dialog
  // proposed (the command line's file name beside source.md), or a
  // cancellation when the test asks for one. Every other step is the
  // window's own – the button, the sheet, the Export button, the line that
  // comes back. The main window stays open throughout: an Electron with no
  // window left starts quitting when an export's hidden window closes.
  await app.evaluate(({ dialog }) => {
    globalThis.smokeDialog = { cancel: false, asked: [] };
    dialog.showSaveDialog = async (a, b) => {
      const opts = b || a;
      globalThis.smokeDialog.asked.push({ defaultPath: opts.defaultPath, title: opts.title });
      if (globalThis.smokeDialog.cancel) return { canceled: true, filePath: '' };
      return { canceled: false, filePath: opts.defaultPath };
    };
  });
  const dialogAsked = () => app.evaluate(() => globalThis.smokeDialog.asked);
  const setCancel = (on) => app.evaluate((_e, v) => { globalThis.smokeDialog.cancel = v; }, on);
  const menuItem = (label) => app.evaluate(({ Menu }, want) => {
    const file = Menu.getApplicationMenu().items.find(i => i.label === 'File' || i.label === 'Datei');
    const sub = file.submenu.items.find(i => i.submenu && i.submenu.items.some(j => j.label === want));
    const item = sub && sub.submenu.items.find(j => j.label === want);
    return item ? { enabled: sub.enabled, found: true } : { found: false };
  }, label);
  const clickMenu = (label) => app.evaluate(({ Menu }, want) => {
    const file = Menu.getApplicationMenu().items.find(i => i.label === 'File' || i.label === 'Datei');
    const sub = file.submenu.items.find(i => i.submenu && i.submenu.items.some(j => j.label === want));
    sub.submenu.items.find(j => j.label === want).click();
  }, label);
  const pdfText = () => page.textContent('#pdf-text');

  // The sheet, opened from the button under the grid.
  await page.click('#btn-pdf');
  check('the export sheet opens from the button', await page.isVisible('#sheet-pdf'));
  check('the project screen is out of the way behind it', await page.isHidden('#content'));
  check('the sheet offers the presentation first, with its one option',
    await page.isChecked('#pdf-kind-slides') && await page.isVisible('#pdf-collapse')
      && await page.isChecked('#pdf-collapse-slide'));
  check('the sheet words its choices like the grid',
    (await page.textContent('#sheet-pdf')).includes('Handout with notes'));
  await shoot(page, 'pdf-sheet');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shoot(page, 'pdf-sheet-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.check('#pdf-kind-print');
  check('the handout carries no option', await page.isHidden('#pdf-collapse'));
  await page.keyboard.press('Escape');
  check('Escape closes the sheet', await page.isHidden('#sheet-pdf') && await page.isVisible('#content'));
  check('the focus goes back to the button that opened it',
    await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-pdf'));

  // The same sheet from File > Export as PDF, with the choice made there.
  const notesItem = await menuItem('Handout with notes…');
  check('File > Export as PDF has the three items, enabled', notesItem.found && notesItem.enabled);
  await clickMenu('Handout with notes…');
  await page.waitForSelector('#sheet-pdf', { state: 'visible', timeout: 5000 });
  check('the menu opens the sheet with its choice made', await page.isChecked('#pdf-kind-print-notes'));

  // A cancelled save dialog says nothing.
  await setCancel(true);
  await page.click('#btn-pdf-export');
  await page.waitForFunction(() => document.getElementById('btn-pdf').getAttribute('aria-disabled') === 'false', null, { timeout: 15000 });
  check('a cancelled save dialog leaves no sentence behind', await page.isHidden('#pdf-status'));
  await setCancel(false);

  // The three exports, each through the sheet.
  async function exportThrough(kind, file, ms) {
    await page.click('#btn-pdf');
    await page.check('#pdf-kind-' + kind);
    await page.click('#btn-pdf-export');
    const out = path.join(fs.realpathSync(project), file);
    const escaped = file.replace('.', '\\.');
    const text = await waitFor(page, '#pdf-text', v => new RegExp('^' + escaped + ' written').test(v.trim())
      || /failed|stopped|Nothing was exported/.test(v), ms);
    log(text.trim());
    check(`${file}: the status sentence came back`, new RegExp('^' + escaped + ' written at \\d\\d:\\d\\d – \\d+ pages\\.$').test(text.trim()));
    check(`${file}: the file is beside source.md`, fs.existsSync(out) && fs.statSync(out).size > 1000
      && fs.readFileSync(out).subarray(0, 5).toString() === '%PDF-');
    check(`${file}: open and show are offered`, await page.isVisible('#btn-pdf-open') && await page.isVisible('#btn-pdf-show'));
  }

  await exportThrough('print', 'print.pdf', 120000);

  // The slides take long enough to see the busy state.
  await page.click('#btn-pdf');
  check('the sheet remembers the last choice', await page.isChecked('#pdf-kind-print'));
  await page.check('#pdf-kind-slides');
  await page.click('#btn-pdf-export');
  await waitFor(page, '#pdf-text', v => /^Exporting the presentation/.test(v.trim()), 15000);
  check('while it runs, the status says so', true);
  check('while it runs, the build sentence stays', /^Ready\./.test((await page.textContent('#status-text')).trim()));
  check('while it runs, the four buttons stay live', await page.evaluate(() =>
    ['audience', 'speaker', 'print', 'print-notes'].every(k => !document.getElementById('out-' + k).disabled)));
  check('while it runs, the export button is unavailable',
    await page.getAttribute('#btn-pdf', 'aria-disabled') === 'true');
  await page.click('#btn-pdf', { force: true });
  check('…and pressing it opens nothing', await page.isHidden('#sheet-pdf'));
  const busyItem = await menuItem('Presentation…');
  check('while it runs, the menu items are greyed out', busyItem.found && busyItem.enabled === false);
  const second = await page.evaluate(() => window.builder.exportPdf('print', {}));
  check('a second export is refused as busy', second && second.error === 'pdf.busy');
  await shoot(page, 'pdf-running');
  const slidesText = await waitFor(page, '#pdf-text', v => /^slides\.pdf written|failed|stopped|Nothing was exported/.test(v.trim()), 300000);
  log(slidesText.trim());
  check('slides.pdf: the status sentence came back', /^slides\.pdf written at \d\d:\d\d – \d+ pages\.$/.test(slidesText.trim()));
  check('slides.pdf: the file is beside source.md', fs.existsSync(path.join(project, 'slides.pdf')));
  check('after it, the export button is available again',
    await page.getAttribute('#btn-pdf', 'aria-disabled') === 'false');
  check('after it, the menu items are enabled again', (await menuItem('Presentation…')).enabled === true);
  await shoot(page, 'pdf-result');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shoot(page, 'pdf-result-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  await exportThrough('print-notes', 'print-notes.pdf', 120000);

  const asked = await dialogAsked();
  check('the save dialog proposed the command line\'s names beside source.md',
    ['print-notes.pdf', 'print.pdf', 'slides.pdf', 'print-notes.pdf']
      .every((f, i) => asked[i] && asked[i].defaultPath === path.join(fs.realpathSync(project), f)));
  if (!asked.every(a => path.dirname(a.defaultPath) === fs.realpathSync(project))) log(JSON.stringify(asked));
  check('the save dialog is titled in the window\'s language', asked.every(a => a.title === 'Export as PDF'));
  const log2 = await page.evaluate(() => window.builder.getState().then(s => s.log.join('\n')));
  check('no export page reported an error', !/the page reported an error/.test(log2));
  check('the reports reached the build details', /Wrote slides\.pdf/.test(log2) && /Wrote print-notes\.pdf/.test(log2));

  // German: the result sentence and the sheet in the longer language.
  await page.evaluate(() => window.builder.setLanguage('de'));
  await waitFor(page, '#pdf-text', v => /geschrieben/.test(v), 15000);
  check('the result sentence is German', /^print-notes\.pdf um \d\d:\d\d geschrieben – \d+ Seiten\.$/.test((await pdfText()).trim()));
  await shoot(page, 'pdf-result-de');
  await page.click('#btn-pdf');
  check('the German sheet is German', (await page.textContent('#sheet-pdf')).includes('Handout mit Notizen'));
  await page.check('#pdf-kind-slides');
  await shoot(page, 'pdf-sheet-de');
  await page.click('#btn-pdf-cancel');
  await page.evaluate(() => window.builder.setLanguage('en'));
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()), 15000);

  // The diagnostics, which the tutorial has none of: a lecture of its own
  // with a link to a fragment that is no chunk, exported as a handout. The
  // line under the sentence has to name the chunk, as the command line does.
  const diag = path.join(work, 'diagnostics');
  fs.mkdirSync(diag);
  fs.writeFileSync(path.join(diag, 'source.md'), '---\ntitle: Diagnostics\n---\n\n'
    + '# One\n\n## statement: A dead link {#dead-link}\n\nThis points [nowhere](#no-such-chunk).\n\n'
    + '## statement: A second slide {#second}\n\nSo the column is not an orphan.\n');
  await page.evaluate(p => window.builder.openProject(p), path.join(diag, 'source.md'));
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()), 30000);
  check('another lecture starts without the last one\'s export line', await page.isHidden('#pdf-status'));
  await page.click('#btn-pdf');
  await page.check('#pdf-kind-print');
  await page.click('#btn-pdf-export');
  await waitFor(page, '#pdf-text', v => /^print\.pdf written|failed|stopped|Nothing/.test(v.trim()), 120000);
  const diagText = await page.textContent('#pdf-message').catch(() => '');
  log(diagText.trim());
  check('the diagnostics are shown, naming the chunk',
    await page.isVisible('#pdf-message') && /dead-link links to #no-such-chunk/.test(diagText));
  await shoot(page, 'pdf-diagnostics');
  await page.evaluate(() => window.builder.closeProject());
  await waitFor(page, '#screen-start h1', v => v.includes('Open a lecture'), 10000);
  await page.evaluate(p => window.builder.removeRecent(p), fs.realpathSync(path.join(diag, 'source.md')));
  await page.evaluate(p => window.builder.openProject(p), source);
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()), 30000);

  await page.evaluate(() => window.builder.closeProject());
  await waitFor(page, '#screen-start h1', v => v.includes('Open a lecture'), 10000);
  check('the recent list has the lecture in it', await page.evaluate(() =>
    document.querySelectorAll('#recent li').length === 1));
  await shoot(page, 'start-recent');

  // ── a recent entry whose lecture is gone ─────────────────────────
  //
  // The row a person meets after moving a folder, which no other state in
  // this run produces: a second lecture, opened so that it enters the list,
  // and then deleted off the disk.
  const gone = path.join(work, 'moved-away');
  fs.mkdirSync(gone);
  fs.copyFileSync(source, path.join(gone, 'source.md'));
  await page.evaluate(p => window.builder.openProject(p), path.join(gone, 'source.md'));
  await waitFor(page, '#project-name', v => v.trim() === 'moved-away', 15000);
  await page.evaluate(() => window.builder.closeProject());
  await waitFor(page, '#screen-start h1', v => v.includes('Open a lecture'), 10000);
  // Its build process is killed by closeProject; the pause is so that the
  // folder is deleted after the last thing that could write into it, not
  // while it is still writing.
  await new Promise(r => setTimeout(r, 500));
  fs.rmSync(gone, { recursive: true, force: true });
  // `exists` is recomputed every time the main process sends the settings,
  // and removing a path that is not in the list is the cheapest way to ask
  // for that without inventing a channel only the test would use.
  await page.evaluate(() => window.builder.removeRecent(''));
  check('the deleted lecture keeps its row and says so', await page.evaluate(() =>
    document.querySelectorAll('#recent li.missing').length === 1));
  await shoot(page, 'start-recent-missing');

  // ── the shot the project site publishes ──────────────────────────
  //
  // docs/site/getting-started.html shows the ready state, and it is the only
  // picture on that page, so it has to be reproducible rather than taken by
  // hand. `project-ready` above cannot be it: the run's working copy is
  // called `smoke-lecture`, and a folder name out of a test harness on a page
  // that says "open your lecture" reads as somebody else's screen. So the
  // same state once more under the name the design brief's own mock-ups use.
  //
  // To publish it, from the repository root, at the size it was taken (a 2x
  // capture of the 760 px window) and the quality shoot.mjs encodes with. The
  // crop takes the empty half-screen under the last control off the foot: the
  // window is taller than this project screen needs, and on a stage that void
  // reads as a rendering fault rather than as an app that does little.
  //
  // 800 rather than 1150, since the site's rows became bands: the words beside
  // this shot name the status line, the Build now button and the four view
  // buttons, and the crop now ends one row under them. At 1150 the picture was
  // 724px tall against 241px of words - DESIGN.md's fifth rule, and the answer
  // it gives is a crop rather than an arrangement that manages the difference.
  //
  //   magick desktop/test/shots/site-builder.png -crop 1520x800+0+0 +repage /tmp/b.png
  //   cwebp -quiet -q 86 -m 6 /tmp/b.png -o docs/site/img/builder.webp
  //
  // Where a crop may cut. The capture is 1520x1496 (a 2x shot of the 760x780
  // window, whose viewport is 748), and these are its blocks in shot pixels -
  // measured rather than estimated, so a later crop need not launch the app to
  // find a seam. Cut in a gap; three of the blocks carry a hairline on top and
  // a crop that lands on one leaves a stray rule along the picture's foot.
  //
  //   top bar            0.. 68     output grid      414.. 652  (hairline)
  //   project name      96..152     editor button    688.. 730
  //   path line        160..196     editor note      736.. 774
  //   status sentence  228..278     lecture figures  806..1130  (hairline)
  //   Build now row    310..378     serve block     1162..1320  (hairline)
  //                                 build details   1352..1392
  //
  // So the seams are 790 (under the editor note, clear of the figures' rule),
  // 1146 (under the figures, clear of serve's) and 1336. Below 1392 the shot
  // is empty ground, which is what the crop exists to remove.
  //
  // The published crop of 800 still lands in a gap, six pixels above the
  // figures' hairline. 790 is the same picture with room to spare.
  const shown = path.join(work, 'netsec-04');
  fs.mkdirSync(shown);
  fs.copyFileSync(source, path.join(shown, 'source.md'));
  fs.cpSync(path.join(project, 'assets'), path.join(shown, 'assets'), { recursive: true });
  await page.evaluate(p => window.builder.openProject(p), path.join(shown, 'source.md'));
  await waitFor(page, '#status-text', v => /^Ready\./.test(v.trim()), 30000);
  await shoot(page, 'site-builder');
  await page.evaluate(() => window.builder.closeProject());
} catch (err) {
  failures++;
  console.error('  ✘', err && err.message ? err.message : err);
  await shoot(page, 'failure').catch(() => {});
} finally {
  check('the window reported no page error', pageErrors.length === 0);
  if (pageErrors.length) console.error(pageErrors.join('\n'));
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

if (process.env.PSI_SMOKE_KEEP) log(`kept the working copy: ${project}`);
else fs.rmSync(work, { recursive: true, force: true });
console.log(failures === 0 ? '\nsmoke: ok' : `\nsmoke: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
