#!/usr/bin/env node
/**
 * Photographs the live prompter saying something, for the #prompter section
 * of in-the-room.html and in-the-room.de.html.
 *
 *   node --env-file=.env docs/site/shoot-prompter.mjs en
 *   node --env-file=.env docs/site/shoot-prompter.mjs de --source <german deck>/source.md
 *
 * **It needs OPENROUTER_API_KEY and it costs model calls** – one per try, at
 * most --max-calls (default 8) per language – because the rule for these two
 * pictures is that the hint on the strip is the model's own answer. Nothing
 * here writes a hint. What the script supplies is the other half, the words
 * the speaker says, and it supplies them through the one door a real ear
 * uses: a stand-in for `webkitSpeechRecognition` that hands the cockpit final
 * results, so the segment goes cockpit -> watch socket -> sidecar -> model ->
 * policy -> strip like any sentence said into a microphone.
 *
 * Why this is not a row in shoot.mjs's table: that script photographs static
 * files over its own little server, and this one needs a running
 * `build.js --watch --serve --prompter` with its sidecar, a key, and a model
 * that may say nothing. A row that fails whenever a model is restrained is a
 * row nobody can re-run with confidence. The cockpit is set up as shoot.mjs
 * sets up its cockpit shots – 1440x900 at 1.5, the lecture's own theme – and
 * taken whole, so the page's cockpit pictures are one set.
 *
 * The deck is lectures/spoken-talk, the slide #two-numbers ("1.4 seconds.
 * Then 90 milliseconds."). The English words come from a real rehearsal of
 * that talk on 2026-09-12, in which the speaker said "I think it was 250
 * milliseconds" and the prompter answered "It's ninety milliseconds, not
 * 250." – quoted verbatim from its log, recogniser slips included. The German
 * deck is a translation that is not kept in the repository (the prompter
 * answers in the lecture's language, so a German shot needs a German deck);
 * pass its path with --source. Its words are the same slip in German.
 *
 * Both decks are copied into a temporary directory before the build, so the
 * watcher's views, the prompter's log and its prompt file land there and not
 * beside a tracked lecture – where a cockpit carrying the prompter would
 * otherwise sit waiting for shoot.mjs's cue-card frames to pick it up.
 *
 * PSI_PROMPTER_FREE_CLOCK=1 is set for the child, as test/souffleuse.mjs
 * does: the stand-in ear moves the cockpit's clock rather than waiting a real
 * minute out, and without it the sidecar would hold each segment to the wall
 * seconds since the last one. It changes when the model is asked, not what
 * it answers.
 *
 * Cue cards are switched off in the cockpit (the checkbox's own stored
 * preference) so that a try ends in a hint on the strip or in nothing, not in
 * a card for a later slide, which is a different picture.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, encoder } from './shoot-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const IMG = path.join(HERE, 'img');
const TARGET = 'two-numbers';

// What the speaker says, in the order it is said, as [text, pause, spoken]
// – seconds of quiet before the sentence and seconds it takes. A try is one
// list; enough speech in it to pass the cadence (25 s) once, so a try is one
// call. The later tries repeat the slip in other words, the way a speaker who
// was not corrected goes on repeating it.
const SCRIPTS = {
  en: {
    name: 'prompter-hint',
    tries: [
      [
        ['this talk ist about one number', 2, 6.4],
        ["It's 15 times quicker than", 1, 3.3],
        ["With 1.4 seconds so that's nice", 1, 3.9],
        ['I teach it that way too remember that the number the important one I think it was 250 milliseconds', 1, 10.2],
        ["That's the number that needs to be remembered", 1, 4.7],
      ],
      [
        ['so the second visit 250 milliseconds', 2, 4.5],
        ['and the first one 1.4 seconds', 1, 3.8],
        ['250 milliseconds is what the browser needed the second time', 1, 5.5],
        ['that is the number I want you to remember', 1, 4.2],
        ['quarter of a second instead of 1.4 seconds', 1, 4.6],
        ["that's the whole difference", 1, 3.0],
      ],
    ],
  },
  de: {
    name: 'prompter-hint-de',
    tries: [
      [
        ['das ist ein Vortrag über eine einzige Zahl', 2, 5.8],
        ['fünfzehnmal schneller als', 1, 3.1],
        ['mit 1,4 Sekunden das ist schön', 1, 3.8],
        ['ich lehre es auch so merken Sie sich die Zahl die wichtige ich glaube es waren 250 Millisekunden', 1, 10.4],
        ['das ist die Zahl die man sich merken muss', 1, 4.6],
      ],
      [
        ['also der zweite Besuch 250 Millisekunden', 2, 4.5],
        ['und der erste 1,4 Sekunden', 1, 3.6],
        ['250 Millisekunden hat der Browser beim zweiten Mal gebraucht', 1, 5.6],
        ['das ist die Zahl die Sie sich merken sollen', 1, 4.2],
        ['eine Viertelsekunde statt 1,4 Sekunden', 1, 4.4],
        ['das ist der ganze Unterschied', 1, 3.0],
      ],
    ],
  },
};

// ── the stand-in ear ─────────────────────────────────────────────────────
// The same surface test/souffleuse.mjs installs, cut to what this script
// uses: a recogniser that is "available" on the device, and `utterance`,
// which is quiet, then the start of speech, then the final result.
function installEar() {
  class Ear extends EventTarget {
    constructor() { super(); this.continuous = false; this.interimResults = false; this.lang = 'en'; window.__stt.rec = this; }
    start() {}
    stop() { this.dispatchEvent(new Event('end')); }
    abort() { window.__stt.rec = null; }
  }
  Ear.available = async () => 'available';
  Ear.install = async () => true;
  window.SpeechRecognition = Ear;
  window.webkitSpeechRecognition = Ear;
  const fire = (text, isFinal) => {
    const rec = window.__stt.rec;
    if (!rec) return false;
    const ev = new Event('result');
    ev.resultIndex = 0;
    ev.results = { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } };
    rec.dispatchEvent(ev);
    return true;
  };
  window.__stt = {
    rec: null,
    // tStart is the cockpit's clock origin (SPEAKER_JS); moving it back is a
    // talk that has been running that much longer.
    advance(s) { tStart -= s * 1000; },
    utterance(text, pause, spoken) {
      if (pause) window.__stt.advance(pause);
      const rec = window.__stt.rec;
      if (!rec) return false;
      rec.dispatchEvent(new Event('speechstart'));
      fire(text, false);
      if (spoken) window.__stt.advance(spoken);
      return fire(text, true);
    },
  };
  try { localStorage.setItem('psi-slides:souffleuse-cues', 'off'); } catch (e) {}
}

const until = async (fn, ms, step = 150) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, step));
  }
};

const logOf = (dir) => {
  const f = fs.readdirSync(dir).find((n) => /^prompter-\d{8}-\d{4}\.jsonl$/.test(n));
  if (!f) return [];
  return fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return {}; } });
};

// ── main ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const lang = argv.find((a) => !a.startsWith('--') && SCRIPTS[a]);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
if (!lang) { console.error('usage: shoot-prompter.mjs en|de [--source deck/source.md] [--max-calls N]'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is not set. Run with node --env-file=.env; this shot costs a model call.');
  process.exit(1);
}
const source = path.resolve(opt('--source') || (lang === 'en'
  ? path.join(ROOT, 'lectures', 'spoken-talk', 'source.md') : ''));
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
  console.error(lang === 'de'
    ? 'the German deck is not in the repository: pass --source <a German translation of spoken-talk>/source.md'
    : `no deck at ${source}`);
  process.exit(1);
}
const maxCalls = Number(opt('--max-calls') || 8);
const spec = SCRIPTS[lang];

const { chromium } = await import('playwright-core');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-prompter-shot-'));
fs.copyFileSync(source, path.join(dir, 'source.md'));

const child = spawn(process.execPath,
  [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--watch', '--serve', '--prompter', '--events'],
  { cwd: ROOT, env: { ...process.env, PSI_PROMPTER_FREE_CLOCK: '1' } });
const events = [];
child.stdout.on('data', (b) => {
  for (const line of String(b).split('\n')) {
    if (line.startsWith('{"type":')) { try { events.push(JSON.parse(line)); } catch { /* not ours */ } }
  }
});
child.stderr.on('data', () => {});

let browser;
let result = null;
try {
  const serving = await until(() => events.find((e) => e.type === 'serving'), 60000);
  if (!serving) throw new Error('the watcher never served the deck');
  const ready = await until(() => events.find((e) => e.type === 'prompter'), 20000);
  if (!ready || ready.state !== 'ready') throw new Error('the prompter is not ready: ' + JSON.stringify(ready));

  browser = await chromium.launch({ executablePath: findChrome() });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await ctx.route('**/favicon.ico', (r) => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(installEar);
  const page = await ctx.newPage();
  await page.goto(`${serving.url}/speaker.html#${TARGET}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  if (!(await until(() => page.evaluate(() => !!(window.psiWatch && window.psiWatch.ready())), 8000))) {
    throw new Error('the cockpit has no watch socket');
  }
  const active = await page.evaluate(() => (document.querySelector('.chunk.active') || {}).id);
  if (active !== TARGET) throw new Error(`the cockpit stands on #${active}, not #${TARGET}`);

  await page.click('#souffleuse-btn');
  if (!(await until(() => page.evaluate(() =>
    document.getElementById('souffleuse-btn').dataset.state === 'listening'), 8000))) {
    throw new Error('the prompter did not start listening');
  }
  const answers = () => logOf(dir).filter((l) => l.type === 'answer').length;
  // Switching on may itself be a slide occasion; let that call land before
  // the first try counts its own.
  await page.waitForTimeout(1500);
  await until(() => {
    const l = logOf(dir);
    return l.filter((x) => x.type === 'tick').length
      <= l.filter((x) => x.type === 'answer' || x.type === 'error').length;
  }, 15000);
  // The opening minute, in which the policy lets nothing through, passed
  // without a word: silence is never an occasion for a call.
  await page.evaluate(() => window.__stt.advance(62));

  for (let t = 0; !result && answers() < maxCalls; t++) {
    const lines = spec.tries[t % spec.tries.length];
    const before = answers();
    for (const [text, pause, spoken] of lines) {
      await page.evaluate(([a, b, c]) => window.__stt.utterance(a, b, c), [text, pause, spoken]);
      await page.waitForTimeout(250);
    }
    // One call is out; wait for it to land in the log, then see what it did.
    await until(() => answers() > before, 20000);
    await page.waitForTimeout(400);
    const hint = logOf(dir).filter((l) => l.type === 'hint').pop();
    const shown = await page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      return el && !el.hidden && el.classList.contains('visible')
        ? { text: el.querySelector('.souffleuse-text').textContent, sev: el.dataset.severity } : null;
    });
    const last = logOf(dir).filter((l) => l.type === 'suppressed' || l.type === 'hint').pop();
    console.log(`  try ${t + 1}: ${last ? (last.type === 'hint'
      ? `hint (${last.kind}) "${last.text}"`
      : `suppressed (${last.reason})${last.text ? ` "${last.text}"` : ''}`) : 'no answer'}`);
    if (hint && shown && hint.kind !== 'time' && shown.text === hint.text) result = hint;
  }
  if (!result) throw new Error(`no content hint in ${answers()} call(s); log kept in ${dir}`);

  // The hint went up in 150 ms; give the heartbeat line a moment to say
  // "asked … ago" rather than "asking the model…", then take it.
  await page.waitForTimeout(1200);
  const png = path.join(IMG, spec.name + '.png');
  // The whole cockpit, as shoot.mjs takes its cockpit and cue-card frames:
  // the 1440x900 viewport at 1.5, uncropped. It was cropped to the mirror of
  // the slide once, which made the twelve words on the strip large and the
  // picture unrecognisable as the cockpit; framed like the page's other
  // cockpit shots it reads as the same window with one strip more. The
  // strip's type is the cockpit's own and survives the page's scaling.
  await page.screenshot({ path: png });
  const enc = encoder();
  let out = png;
  if (enc) {
    out = path.join(IMG, spec.name + '.webp');
    const r = spawnSync(enc.bin, enc.args(png, out, 86), { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${enc.bin} failed`);
    fs.rmSync(png);
  }
  console.log(`  ${spec.name}: ${result.kind}, "${result.text}" (${answers()} call(s))`);
  console.log(`  -> ${path.relative(ROOT, out)}`);
} finally {
  if (browser) await browser.close();
  child.kill();
  if (result) fs.rmSync(dir, { recursive: true, force: true });
}
