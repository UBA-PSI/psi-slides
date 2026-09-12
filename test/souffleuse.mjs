/*
 * souffleuse · the live prompter, end to end
 *
 * The gate `test/gates/souffleuse.mjs` decides the restraint: twelve words,
 * one hint at a time, the cool-downs. What it cannot decide is whether the
 * three halves of the feature are wired to each other, because two of them
 * are not in the same process: an ear in the cockpit, a sidecar in Node
 * holding the key, and one socket between them. So this spec starts a real
 * `--watch --serve --souffleuse` build against a fake OpenRouter, opens the
 * served cockpit with a fake recogniser in it, and follows one whisper the
 * whole way – said in the room, sent over the socket, asked of the model,
 * judged by the policy, and painted on the strip.
 *
 * Its own fixture deck, for the third of the reasons test/README.md gives: a
 * cue is laid into a slide that is *still to come*, so the assertion needs a
 * deck whose slide order is known, and no lecture here would keep one.
 *
 * Two fakes, both in this file:
 *
 *  - **A fake OpenRouter**, an http server on loopback answering one route
 *    with scripted answers in order and keeping every request body. The
 *    sidecar reaches it through `OPENROUTER_BASE_URL`, which exists for this.
 *  - **A fake `webkitSpeechRecognition`**, installed with addInitScript. It
 *    reports `available() → 'available'`, so the on-device path is taken and
 *    the badge stays down, and `window.__stt.final(text, seconds)` fires one
 *    final result at the adapter.
 *
 * **The clock is moved, not waited out.** The adapter stamps a segment with
 * the cockpit's own clock (`tStart`), the sidecar counts the cadence in those
 * seconds, and the policy keeps the first minute quiet. Waiting that out in
 * real time would make this spec two minutes of sleeping; `__stt.final(text,
 * 70)` pushes `tStart` back seventy seconds and the same arithmetic happens
 * at once. Everything else is polled, never slept on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './harness.mjs';

export const name = 'souffleuse · the live prompter, cockpit to sidecar to strip';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

// Four slides, ids that say what they are for, one note whose first line
// opens with a mark so the drift has a real reference - `@0:00` on a second
// line applies to the card after it, which is no card, so this fixture used to
// claim a mark it did not have and the drift was the linear estimate all along
// - and a cadence at the floor of SOUFFLEUSE_SPEC (10 s) so a tick is cheap to
// provoke.
const SOURCE = `---
title: A talk with a prompter in the box
duration: 10
souffleuse:
  model: fake/prompter-under-test
  cadence: 10
  cooldown: 20
---

## title: A talk with a prompter in the box {#opening}

## free: What the room hears {#heard}

The ear sends what it heard, and the box answers or, almost always, stays quiet.

> note: @0:00 Open here, and keep one eye on the clock.

## free: The slide the card is for {#board}

A slide that is still to come, which is the only kind a cue may be laid into.

## free: The last word {#closing-words}

Nothing more to say, which is the prompter's usual answer too.
`;

// ── the fake OpenRouter ─────────────────────────────────────────────
//
// One route, a queue the spec fills, and every request body kept. An empty
// queue answers HTTP 500, which is also the last thing the script asks for,
// so "the server fell over" needs no separate mode.
function fakeOpenRouter() {
  const requests = [];
  const queue = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(raw); } catch (e) { body = { unparsable: raw.slice(0, 400) }; }
      requests.push({ url: req.url, headers: req.headers, body });
      const step = queue.shift()
        || { status: 500, body: { error: { message: 'the fake has nothing left' } } };
      res.writeHead(step.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(step.body));
    });
  });
  return {
    requests,
    // The answer contract, written out once: an OpenAI-format completion
    // carrying one forced tool call named `advise`, whose arguments are the
    // JSON parseAnswer reads.
    say(args) {
      queue.push({
        status: 200,
        body: {
          id: 'gen-fake',
          model: 'fake/model',
          choices: [{
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'advise', arguments: JSON.stringify(args) },
              }],
            },
          }],
          usage: {
            prompt_tokens: 4211, completion_tokens: 24, total_tokens: 4235,
            prompt_tokens_details: { cached_tokens: 4096 },
          },
        },
      });
    },
    fail(status = 500) {
      queue.push({ status, body: { error: { message: 'fake outage' } } });
    },
    // A 200 that is a refusal. OpenRouter answers some upstream failures this
    // way - `{error: {message, code}}` and no `choices` at all - and the
    // sidecar used to hand that to parseAnswer, which found neither a tool
    // call nor content and logged `garbage`: the one sentence saying what was
    // wrong was thrown away, and a model out of credits read in the debrief
    // like a model talking nonsense.
    refuse(message, code) {
      queue.push({ status: 200, body: { error: { message, code } } });
    },
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1',
      () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ── the fake ear ────────────────────────────────────────────────────
//
// Enough of the Web Speech surface for webSpeechAdapter: a constructor that
// takes listeners, an `available` that says the on-device recogniser is here,
// and one way to hand it a result. `advance` is the clock: see the header.
function installFakeStt() {
  class FakeSpeechRecognition extends EventTarget {
    constructor() {
      super();
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'en';
      window.__stt.rec = this;
      window.__stt.all.push(this);
    }
    start() { window.__stt.starts += 1; }
    stop() { this.dispatchEvent(new Event('end')); }
    abort() { window.__stt.rec = null; }
  }
  FakeSpeechRecognition.available = async () => 'available';
  FakeSpeechRecognition.install = async () => true;
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;

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
    all: [],
    starts: 0,
    available: () => FakeSpeechRecognition.available(),
    // The cockpit's clock, moved rather than waited out. `tStart` is the
    // origin souffClock() measures from, so pushing it back is exactly a
    // talk that has been running that much longer.
    advance(seconds) { tStart -= seconds * 1000; return elapsedSeconds(); },
    final(text, seconds) {
      if (seconds) window.__stt.advance(seconds);
      return fire(text, true);
    },
    interim(text) { return fire(text, false); },
    // Chrome delivers end asynchronously, so a recogniser that was aborted a
    // moment ago still has one event to give. Firing it on an instance the
    // adapter has already replaced is the shape of a real defect, not a
    // contrivance: it is what happens on every restart.
    endOn(i) {
      const r = window.__stt.all[i];
      if (!r) return false;
      r.dispatchEvent(new Event('end'));
      return true;
    },
    // The ear reporting a condition it will recover from by itself.
    fault(kind) {
      const rec = window.__stt.rec;
      if (!rec) return false;
      const ev = new Event('error');
      ev.error = kind;
      rec.dispatchEvent(ev);
      return true;
    },
  };
}

// ── the harness this spec needs and no other does ───────────────────

const until = async (fn, ms = 5000, step = 100) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= end) return null;
    await new Promise((r) => setTimeout(r, step));
  }
};

// The sidecar's debrief, beside source.md. Polled rather than waited on: it
// is written from a socket handler, and the spec has no other way to see a
// dismissal, which is deliberately not sent back to the page.
function logLines(dir) {
  const name = fs.readdirSync(dir).filter((f) => /^souffleuse-.*\.jsonl$/.test(f)).sort().pop();
  if (!name) return [];
  const out = [];
  for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) { /* a half-written line */ }
  }
  return out;
}

export async function run({ page, report }) {
  const { ok, note } = report;
  const t0 = Date.now();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-souff-'));
  const fake = fakeOpenRouter();
  let child = null;
  const extra = [];

  try {
    fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
    const fakePort = await fake.listen();

    // In order: a hint, a card for a later slide, a second hint that is still
    // standing when the switch is thrown, a low one that may only come if the
    // policy let the standing slot go on the reload, a silence, then a server
    // that falls over. Anything past the queue is a 500 too.
    fake.say({
      action: 'hint', kind: 'example', text: 'name the bank example',
      severity: 'high', why: 'the point just made is abstract',
    });
    fake.say({
      action: 'cue', chunk_id: 'board', text: 'pick up the front-row question',
      why: 'said now, belongs there',
    });
    fake.say({
      action: 'hint', kind: 'fact', text: 'the figure was three, not four',
      severity: 'high', why: 'the slide says three',
    });
    fake.say({
      action: 'hint', kind: 'delivery', text: 'slower, and look up',
      severity: 'low', why: 'the last two sentences ran together',
    });
    fake.say({ action: 'nothing', why: 'nothing worth a word' });
    // The one outage this spec can provoke, and why it is this one: the first
    // failure sets a thirty-second backoff and `maybeTick` returns early until
    // it passes, so a second cannot be reached inside a test - which is the
    // backoff working. The 200-with-an-error is the case that used to be
    // unreadable in the log; anything past the queue is an HTTP 500.
    fake.refuse('upstream is out of credits', 402);
    fake.fail(500); fake.fail(500);

    // ── the engine, as a person would start it ──────────────────────
    child = spawn(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'),
        '--watch', '--serve', '--souffleuse', '--events'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          OPENROUTER_API_KEY: 'test-key-never-in-the-html',
          OPENROUTER_BASE_URL: 'http://127.0.0.1:' + fakePort,
        },
      });
    let out = '';
    const events = [];
    const eat = (b) => {
      out += String(b);
      for (const line of String(b).split('\n')) {
        if (!line.startsWith('{"type":')) continue;
        try { events.push(JSON.parse(line)); } catch (e) { /* not ours */ }
      }
    };
    child.stdout.on('data', eat);
    child.stderr.on('data', eat);

    const serving = await until(() => events.find((e) => e.type === 'serving'), 40000);
    ok(!!serving, 'the watcher serves the fixture', out.slice(-500));
    if (!serving) return;
    const ready = await until(() => events.find((e) => e.type === 'souffleuse'), 20000);
    ok(ready && ready.state === 'ready',
       'and the prompter reports itself ready, with a session and a slide count',
       JSON.stringify(ready));
    ok(!!(ready && ready.session && ready.chunks === 4),
       'the ready event names the prefix hash and the four slides', JSON.stringify(ready));

    // ── the key is in Node and nowhere else ─────────────────────────
    const html = fs.readFileSync(path.join(dir, 'speaker.html'), 'utf8');
    ok(!/OPENROUTER/.test(html), 'speaker.html never says OPENROUTER');
    ok(!html.includes('test-key-never-in-the-html'), 'and does not carry the key');

    // ── and a cockpit built without the flag carries no prompter ────
    // Not this cockpit: an ordinary one, built from the same source in a
    // directory of its own so the watcher's files are not overwritten under
    // the open page. SOUFFLEUSE_CSS and SOUFFLEUSE_JS are spliced only when
    // the flag is set, the way editorPayload is - the runtime and its
    // stylesheet used to ride in every speaker.html ever built.
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-souff-plain-'));
    fs.writeFileSync(path.join(plainDir, 'source.md'), SOURCE);
    const plainBuild = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(plainDir, 'source.md'), '--speaker-only'],
      { cwd: ROOT, encoding: 'utf8' });
    ok(plainBuild.status === 0, 'the same deck builds without the flag',
       String(plainBuild.stderr || '').slice(-300));
    const plain = fs.readFileSync(path.join(plainDir, 'speaker.html'), 'utf8');
    ok(!plain.includes('souffleuse-strip') && !plain.includes('souffleuse-btn')
       && !plain.includes('souffleuse-log'),
       'an ordinary cockpit has none of the prompter\'s chrome');
    ok(!plain.includes('souffStart') && !plain.includes('webSpeechAdapter')
       && !plain.includes('#souffleuse-badge'),
       'and neither its runtime nor its stylesheet');
    ok(plain.includes('const SOUFFLEUSE = null;'),
       'the one line that survives says there is no prompter');
    const saved = html.length - plain.length;
    ok(saved > 30000,
       'so the flag, not the build, is what costs the 36 KB', saved + ' bytes');
    fs.rmSync(plainDir, { recursive: true, force: true });

    // ── --souffleuse-model on its own is a usage error ──────────────
    // It is only ever read by the prompter, so without --souffleuse it built
    // an ordinary deck and said nothing - the silent no-op this CLI refuses
    // everywhere else. Checked without --watch, which would not return.
    const lonely = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'),
        '--souffleuse-model', 'anthropic/claude-sonnet-5'],
      { cwd: ROOT, encoding: 'utf8' });
    ok(lonely.status !== 0 && /--souffleuse-model without --souffleuse/.test(String(lonely.stderr)),
       '--souffleuse-model without --souffleuse is refused, with instructions',
       String(lonely.stderr || lonely.stdout).slice(0, 200));
    ok(!/at .*build\.js/.test(String(lonely.stderr)),
       'and refused as advice, not as a stack trace');

    // ── the cockpit, with a fake ear in it ──────────────────────────
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    // The engine's own server 404s a favicon, and a 404 is a console error,
    // which the runner counts against this spec. The suite's loopback server
    // answers 204 for the same reason; here the browser does it instead, so
    // "no page errors" stays an assertion about the lecture.
    await page.context().route('**/favicon.ico', (r) => r.fulfill({ status: 204, body: '' }));
    // On the context, not on the page: the second cockpit further down is
    // opened by the projection and needs an ear of its own.
    await page.context().addInitScript(installFakeStt);
    await page.goto(serving.url + '/speaker.html', { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);
    ok(await until(() => page.evaluate(() => !!(window.psiWatch && window.psiWatch.ready())), 8000),
       'the served cockpit has a watch socket');
    ok(await page.evaluate(() => window.__stt.available()) === 'available',
       'and the fake recogniser answers available');

    // ── a hello is a registration, not a switch ─────────────────────
    // It used to be both, and the cockpit then had to undo it with a
    // separate, un-awaited toggle whenever the answer said `enabled: false` -
    // so a lost reply or a recogniser that would not start left the sidecar
    // listening and calling a model for a cockpit whose switch was off.
    // Observable in the log: switching on is what says `listening`, and
    // switching off what was never on says nothing at all.
    const statusesBefore = logLines(dir).filter((l) => l.type === 'status').length;
    const bareHello = await page.evaluate(() => window.psiWatch.ask('souffleuse-hello',
      { lang: 'en', stt: { engine: 'test', local: true } }));
    await page.waitForTimeout(300);
    ok(!!(bareHello && bareHello.ok && bareHello.enabled === true),
       'a bare hello is answered, and the answer says the sidecar can work',
       JSON.stringify(bareHello));
    ok(logLines(dir).filter((l) => l.type === 'status').length === statusesBefore,
       'and it switched nothing on: no status came of it',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'status')));
    await page.evaluate(() => window.psiWatch.ask('souffleuse-toggle', { on: false }));
    await page.waitForTimeout(300);
    ok(!logLines(dir).some((l) => l.type === 'status' && l.state === 'idle'),
       'so switching off what was never on is not a switch-off either');
    ok(fake.requests.length === 0, 'and nothing was asked of the model',
       String(fake.requests.length));

    // ── the switch ──────────────────────────────────────────────────
    // Pressed twice in one task, which is the race the flag exists for: the
    // start is two awaits long and souffOn is only true at the end of it, so
    // a second press - or the sessionStorage restore arriving beside a click
    // - walked straight past the guard and opened a second recogniser, whose
    // finals all arrived twice.
    await page.evaluate(() => {
      const b = document.getElementById('souffleuse-btn');
      b.click();
      b.click();
    });
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => ({
      pressed: document.getElementById('souffleuse-btn').getAttribute('aria-pressed'),
      state: document.getElementById('souffleuse-btn').dataset.state,
      stored: sessionStorage.getItem('psi-slides:souffleuse'),
      badge: document.getElementById('souffleuse-badge').hidden,
      starts: window.__stt.starts,
      title: document.getElementById('souffleuse-btn').title,
    }));
    ok(sw.pressed === 'true' && sw.state === 'listening',
       'the switch reads pressed and listening', JSON.stringify(sw));
    ok(sw.stored === 'on', 'the consent is remembered for this tab only – sessionStorage', sw.stored);
    ok(sw.starts === 1, 'and the recogniser was started once, for two presses in one task',
       String(sw.starts));
    ok(sw.badge === true,
       'on-device recognition puts no badge up: the badge is for degraded states', JSON.stringify(sw));
    // The language it assumed, named and not tagged. A German talk heard as
    // English produces a transcript of plausible nonsense, and the model then
    // sets about correcting the nonsense - so the one thing a speaker can be
    // wrong about without noticing is said out loud at the moment of consent,
    // and the switch carries it for the rest of the talk.
    ok(/English/i.test(sw.title) && /machine|Google/.test(sw.title),
       'the switch says which language it is listening in, and where', sw.title);
    ok((await until(() => logLines(dir).some((l) => l.type === 'session' && l.via === 'hello'), 5000)) !== null,
       'the sidecar logged a session opened by the hello');

    // ── the opening minute shows what it hears, unasked ─────────────
    // For the first minute the prompter cannot say anything at all, and that
    // is exactly the minute in which a speaker wonders whether the ear works.
    // So the words go up without the checkbox being touched, and come down
    // again when the quiet ends - the checkbox is for somebody who wants them
    // for the whole talk.
    await page.evaluate(() => window.__stt.interim('checking whether this ear hears anything at all'));
    const opening = await until(() => page.evaluate(() => {
      const e = document.getElementById('souffleuse-heard');
      return e && !e.hidden ? { beat: e.classList.contains('beat'), text: e.textContent } : null;
    }), 3000);
    ok(opening && !opening.beat && /ear hears/.test(opening.text),
       'in the opening quiet the line carries what it heard, with no box ticked',
       JSON.stringify(opening));
    ok(await page.evaluate(() => document.getElementById('souffleuse-heard-toggle').checked === false),
       'and the box that would keep them up for the whole talk is still off');

    // ── one whisper, the whole way ──────────────────────────────────
    // Seventy seconds of talk in one segment: past the opening quiet (60 s)
    // and past the cadence (10 s), with the eight words a tick also wants.
    await page.evaluate(() => window.__stt.final(
      'the thing about a shared cache is that it remembers what somebody else asked for', 70));
    const strip = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      if (!el || el.hidden) return null;
      return {
        text: el.querySelector('.souffleuse-text').textContent,
        glyph: el.querySelector('.souffleuse-glyph').textContent,
        severity: el.dataset.severity,
        visible: el.classList.contains('visible'),
      };
    }), 5000);
    ok(!!strip && strip.text === 'name the bank example',
       'the hint arrives on the strip, in the words the model sent', JSON.stringify(strip));
    ok(!!strip && strip.glyph === '◇',
       'with the diamond that means example', strip && JSON.stringify(strip.glyph));
    ok(!!strip && strip.severity === 'high', 'and the severity it was given', strip && strip.severity);

    // ── past the quiet, the same line becomes the heartbeat ─────────
    // Correct behaviour here is silence, which is indistinguishable from a
    // broken prompter. So the line stops carrying speech and starts carrying
    // the one fact that says the chain is alive: when it last asked.
    const beat = await until(() => page.evaluate(() => {
      const e = document.getElementById('souffleuse-heard');
      return e && !e.hidden && e.classList.contains('beat') ? e.textContent : null;
    }), 6000);
    ok(beat && /asked|asking/.test(beat),
       'past the opening quiet the line says when it last asked the model', String(beat));

    // ── what the sidecar actually sent ──────────────────────────────
    ok(fake.requests.length >= 1, 'the sidecar called the model', String(fake.requests.length));
    const first = fake.requests[0] || { body: {}, headers: {}, url: '' };
    const b = first.body || {};
    ok(first.url === '/chat/completions', 'on the one route', first.url);
    ok(String(first.headers.authorization || '') === 'Bearer test-key-never-in-the-html',
       'with the key from the environment');
    ok(!!(b.messages && b.messages[0] && Array.isArray(b.messages[0].content)
          && b.messages[0].content[0].cache_control
          && b.messages[0].content[0].cache_control.type === 'ephemeral'),
       'the deck rides as a system content block with an ephemeral cache breakpoint',
       JSON.stringify(b.messages && b.messages[0] && b.messages[0].content
         && b.messages[0].content[0] && b.messages[0].content[0].cache_control));
    ok(!!(b.tool_choice && b.tool_choice.function && b.tool_choice.function.name === 'advise'),
       'the tool call is forced and named advise', JSON.stringify(b.tool_choice));
    ok(b.parallel_tool_calls === false, 'and there is exactly one of it', String(b.parallel_tool_calls));
    ok(!!(b.reasoning && b.reasoning.effort === 'low'),
       'reasoning effort is low, because latency is the scarce resource', JSON.stringify(b.reasoning));
    ok(typeof b.session_id === 'string' && b.session_id.length > 0,
       'a session_id keeps the warm cache on one provider', String(b.session_id));
    ok(!!(b.usage && b.usage.include === true), 'and usage comes back', JSON.stringify(b.usage));
    ok(b.model === 'fake/prompter-under-test',
       'the model is the one the deck named in its souffleuse: block', String(b.model));
    ok(!!(Array.isArray(b.tools) && b.tools.length === 1
          && b.tools[0].function && b.tools[0].function.name === 'advise'),
       'one tool goes out, and it is the answer vocabulary', JSON.stringify(b.tools && b.tools.length));
    const userMsg = String((b.messages && b.messages[1] && b.messages[1].content) || '');
    ok(/^slide 1\/4 · #opening/.test(userMsg),
       'the user turn opens with the state line', userMsg.split('\n')[0]);
    ok(userMsg.includes('cue_targets=[heard, board, closing-words]'),
       'which names the slides a card may be laid into', userMsg.split('\n')[0]);
    ok(!userMsg.includes('planned duration'),
       'and carries none of the deck – that is the cached half');
    // The mark is real now, so the drift is measured against it rather than
    // against `duration:` divided by the slide count – which is what `(rough)`
    // means, and what this fixture silently had before.
    ok(/·\s*drift[^·]*·/.test(userMsg) && !/\(rough\)/.test(userMsg),
       'the drift is measured against a mark, not against a straight line',
       userMsg.split('\n')[0]);
    const prefixText = String((b.messages && b.messages[0] && b.messages[0].content
      && b.messages[0].content[0] && b.messages[0].content[0].text) || '');
    ok(prefixText.includes('planned: 0:00 (beat 0)'),
       'and the prefix carries the planned marks the drift is read off',
       prefixText.split('\n').filter((l) => l.startsWith('planned')).join(' / '));

    // ── Esc takes it away, and the sidecar hears about it ───────────
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      return el.hidden || !el.classList.contains('visible');
    }), 'Escape takes the strip away');
    const dismissed = await until(() => logLines(dir)
      .find((l) => l.type === 'dismiss' && l.how === 'esc'), 5000);
    ok(!!dismissed, 'and the sidecar logs the dismissal, so the hint cannot come back in other words',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'dismiss')));

    // ── a slide tick, and the card it brings ────────────────────────
    // Four words over fifteen seconds: enough speech for the cadence, not
    // enough words for a speech tick, so the next occasion is the slide –
    // and the last of them is new since the tick above, which is what puts
    // a NEW line in the message.
    await page.evaluate(() => window.__stt.final('right, next slide', 15));
    await page.evaluate(() => window.__stt.final('the cache again', 0));
    await page.waitForTimeout(300);
    ok(fake.requests.length === 1, 'four words are not an occasion', String(fake.requests.length));
    await page.keyboard.press('ArrowDown');
    // Waited for in the page, not in the log: the sidecar writes the `cue`
    // line before it puts the message on the socket, so a spec that polls
    // the file can walk on to the slide a few milliseconds before the
    // cockpit has the card – and then `souffCueOnArrival` has nothing to
    // show and has already spent this slide's one chance to show it.
    const cued = await until(() => page.evaluate(() => souffleuseCues.has('board')), 8000);
    ok(!!cued, 'a new slide is an occasion, and this one brings a card for a later slide',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'tick').map((l) => l.reason)));
    ok(!!logLines(dir).find((l) => l.type === 'cue' && l.chunkId === 'board'),
       'and the sidecar filed it under the slide it is for',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'cue')));
    // One beat of acknowledgement, naming the slide. Without it the only sign
    // that anything happened was a card in a slide the speaker has not reached
    // - and the rehearsal checklist told them to look for it here.
    const laid = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      return el && !el.hidden ? el.querySelector('.souffleuse-text').textContent : null;
    }), 5000);
    ok(!!laid && /^card for /.test(laid) && /card is for|board/.test(laid),
       'the strip says a card was laid, and which slide it went into', JSON.stringify(laid));
    const logged = await page.evaluate(() => {
      const b = document.getElementById('souffleuse-btn');
      b.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      const rows = [...document.querySelectorAll('#souffleuse-log-list li')]
        .map((li) => li.textContent);
      document.querySelector('#souffleuse-log header .souffleuse-x').click();
      return rows;
    });
    ok(logged.some((r) => /pick up the front-row question/.test(r) && /for /.test(r)),
       'and the history has it too, as a card rather than as a whisper', JSON.stringify(logged));
    const second = String((fake.requests[1] && fake.requests[1].body.messages[1].content) || '');
    ok(/\bNEW:/.test(second) && second.includes('the cache again'),
       'and the tick marks what is new since the last call', second.split('\n').slice(-3).join(' / '));

    // ── the card, in both arrangements ──────────────────────────────
    // Classic first: there is no rail to lay a card in, so the card arrives
    // as a strip hint of its own kind when the slide comes up.
    ok(!(await page.evaluate(() => document.body.classList.contains('cue-cards'))),
       'the cockpit is still in the classic layout');
    await page.keyboard.press('ArrowDown');
    const onBoard = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      if (!el || el.hidden) return null;
      return {
        id: flatChunks[state.activeIdx].id,
        text: el.querySelector('.souffleuse-text').textContent,
        glyph: el.querySelector('.souffleuse-glyph').textContent,
      };
    }), 5000);
    ok(!!onBoard && onBoard.id === 'board' && onBoard.text === 'pick up the front-row question',
       'landing on the slide shows the card as a hint', JSON.stringify(onBoard));
    ok(!!onBoard && onBoard.glyph === '▤',
       'under the glyph that means a card, not a whisper', onBoard && JSON.stringify(onBoard.glyph));

    await page.keyboard.press('k');
    await page.waitForTimeout(600);
    const card = await page.evaluate(() => {
      const c = document.querySelector('#cue-rail .cue-card.souffleuse');
      if (!c) return null;
      return {
        text: c.textContent.replace(/\s+/g, ' ').trim(),
        label: (c.querySelector('.cue-added') || {}).textContent || null,
        italic: getComputedStyle(c).fontStyle,
        dashed: (() => {
          const t = document.querySelector('#cue-rail .cue-tick.souffleuse');
          return t ? getComputedStyle(t, '::before').borderLeftStyle : null;
        })(),
      };
    });
    // The dashed track and the italics say "not yours" to a reader who already
    // knows. The label is for the first time it happens, mid-talk, when nobody
    // is in the mood to infer anything from a line style.
    ok(!!card && /added while you spoke/i.test(card.label || ''),
       'a card the prompter laid says so in words, above the card',
       card && JSON.stringify(card.label));
    ok(!!card && card.text.includes('pick up the front-row question'),
       'and with the cards on, the same card is in the rail', JSON.stringify(card));
    ok(!!card && card.italic === 'italic',
       'drawn as the prompter\'s and not the author\'s', card && card.italic);
    await page.keyboard.press('k');
    await page.waitForTimeout(400);
    // The card is still standing on the strip – it fades after fifteen
    // seconds, and this spec is faster than that. Send it away, so the next
    // assertion is about what the "nothing" did and not about it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ── a second whisper, and then the switch thrown under it ───────
    // The one thing a switch-off must not do is leave the hint's timers
    // running: a standing hint faded fifteen seconds later and sent a
    // dismissal to a sidecar nobody was listening to, and the speaker watched
    // a whisper leave a prompter that was already off.
    await page.evaluate(() => window.__stt.final(
      'and the figure on the slide there is three, said out loud as four', 15));
    const factHint = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      if (!el || el.hidden) return null;
      return { text: el.querySelector('.souffleuse-text').textContent };
    }), 6000);
    ok(!!factHint && factHint.text === 'the figure was three, not four',
       'a second hint arrives, and this one has a hintId the sidecar knows',
       JSON.stringify(factHint));
    const dismissalsBefore = logLines(dir).filter((l) => l.type === 'dismiss').length;

    // ── the driver's switch, on the engine's stdin ──────────────────
    // `idle` used to set the button's state and nothing else: souffOn stayed
    // true, the microphone stayed open, undoing it in the cockpit took two
    // presses, and a reload in between said hello and switched the sidecar
    // back on behind the speaker.
    child.stdin.write('{"type":"souffleuse","enabled":false}\n');
    const idled = await until(() => page.evaluate(() => {
      const b = document.getElementById('souffleuse-btn');
      return b.getAttribute('aria-pressed') === 'false' ? {
        state: b.dataset.state,
        rec: window.__stt.rec,
        stored: sessionStorage.getItem('psi-slides:souffleuse'),
        strip: document.getElementById('souffleuse-strip').hidden,
      } : null;
    }), 6000);
    ok(!!idled, 'a driver switching the prompter off on stdin switches the cockpit off too',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'status').slice(-2)));
    ok(!!idled && idled.rec === null, 'and stops the ear rather than only the light');
    ok(!!idled && idled.stored === null,
       'the consent goes with it, so a reload does not start listening again', String(idled && idled.stored));
    ok(!!idled && idled.strip === true, 'the strip goes too, timers and all');
    await page.waitForTimeout(600);
    ok(logLines(dir).filter((l) => l.type === 'dismiss').length === dismissalsBefore,
       'and no dismissal was sent for a hint the switch took away',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'dismiss')));

    await page.click('#souffleuse-btn');
    ok(await until(() => page.evaluate(() => document.getElementById('souffleuse-btn')
       .getAttribute('aria-pressed') === 'true'), 6000),
       'one press brings it back – not two');

    // ── a reload in the middle of a hint ────────────────────────────
    // Which --watch does on every save. The hint that was standing is gone
    // with the page, and no dismissal was ever sent for it, so the sidecar's
    // policy was left holding a standing slot for a hint no screen had -
    // and dropped every `low` hint for the rest of the talk under the reason
    // `standing`, which in the log reads exactly like the policy working.
    // A hello clears the slot, because a fresh page holds no hint.
    const clockBefore = await page.evaluate(() => elapsedSeconds());
    await page.reload({ waitUntil: 'load' });
    ok(await until(() => page.evaluate(() => document.getElementById('souffleuse-btn')
       .getAttribute('aria-pressed') === 'true'), 12000),
       'the reloaded cockpit picks the microphone back up by itself');
    ok(await until(() => page.evaluate(() => souffleuseCues.has('board')), 5000),
       'and the cards already laid come back with the hello – they live in this window alone');
    // And it comes back to the same clock. tStart is the page load, so without
    // the origin kept beside the consent the talk went back to 0:00 on every
    // save: the drift went wildly negative, the sidecar saw a tick stamped in
    // its own future and stopped firing slide ticks, and the opening quiet
    // minute was stamped again each time.
    const clockAfter = await page.evaluate(() => elapsedSeconds());
    ok(clockAfter >= clockBefore && clockAfter - clockBefore < 10,
       'and to the clock the talk was already on, not to 0:00',
       clockBefore + 's before, ' + clockAfter + 's after');
    ok(await page.evaluate(() => !!sessionStorage.getItem('psi-slides:souffleuse-clock')),
       'which is one key beside the consent, for this tab and this talk');
    await page.evaluate(() => window.__stt.final(
       'so that is the whole of the first half, and there is the second one to come', 200));
    const third = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-strip');
      if (!el || el.hidden) return null;
      return { text: el.querySelector('.souffleuse-text').textContent, sev: el.dataset.severity };
    }), 8000);
    ok(!!third && third.text === 'slower, and look up' && third.sev === 'low',
       'a low hint still comes after the reload: the standing slot was not locked',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'suppressed').slice(-2)));
    // Sent away, so the assertions further down are about what the silence
    // and the outage did and not about what is still standing from here.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ── the cards switched off, in the cockpit ──────────────────────
    // The box is the speaker's answer under the deck's ceiling, and the
    // sidecar has to hear it: with the cards off there are no cue_targets, so
    // nothing is judged, no slide is locked against a second card and nothing
    // enters the duplicate rule.
    await page.evaluate(() => {
      const box = document.getElementById('souffleuse-cues-toggle');
      box.checked = false;
      box.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => souffleuseCues.size === 0),
       'unticking the box takes the cards out of the rail');
    const ticksBefore = logLines(dir).filter((l) => l.type === 'tick').length;
    await page.evaluate(() => window.__stt.final(
      'which is where the second half of this talk would ordinarily begin', 15));
    const noTargets = await until(() => {
      const ticks = logLines(dir).filter((l) => l.type === 'tick');
      return ticks.length > ticksBefore ? ticks[ticks.length - 1] : null;
    }, 6000);
    ok(!!noTargets && Array.isArray(noTargets.cueTargets) && noTargets.cueTargets.length === 0,
       'and the model is offered no slide to lay one into',
       JSON.stringify(noTargets && noTargets.cueTargets));

    // ── the ear stumbles and picks itself up ────────────────────────
    // A network hiccup and a restart are conditions the recogniser passes
    // through by itself, so the badge they raise has to come down by itself
    // too. It did not: the sentence stood over a working prompter until the
    // switch was thrown twice.
    await page.evaluate(() => window.__stt.fault('network'));
    const stumbled = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-badge');
      return el && !el.hidden ? el.textContent : null;
    }), 3000);
    ok(!!stumbled && /network/i.test(stumbled),
       'a recogniser that loses the network says so on the badge', String(stumbled));
    await page.evaluate(() => window.__stt.final('and we are back in the room', 2));
    const recovered = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-badge');
      return el && el.hidden ? true : null;
    }), 3000);
    ok(recovered === true,
       'and the next sentence it hears is the proof that takes it down again');

    // A recogniser the adapter has already replaced still has one end event
    // to deliver. Handling it used to clear the slot holding the *live*
    // recogniser and start a third one, so two ears ran and every sentence
    // was sent twice.
    // One legitimate end first, so that there is a stale instance to speak
    // out of turn: the adapter answers an end by opening the next recogniser.
    const stale = await page.evaluate(() => window.__stt.all.length - 1);
    await page.evaluate((i) => window.__stt.endOn(i), stale);
    const restarted = await until(() => page.evaluate(
      (i) => (window.__stt.all.length > i + 1 ? window.__stt.starts : null), stale), 3000);
    ok(typeof restarted === 'number',
       'an end in the ordinary course of a talk opens the next recogniser');
    const before = await page.evaluate(() => ({ starts: window.__stt.starts, n: window.__stt.all.length }));
    await page.evaluate((i) => window.__stt.endOn(i), stale);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ starts: window.__stt.starts, live: !!window.__stt.rec }));
    ok(after.starts === before.starts && after.live,
       'but a second end from that same, now replaced recogniser opens nothing',
       JSON.stringify({ stale, before, after }));
    const stillHeard = await page.evaluate(() => window.__stt.final('and it is still the same ear listening', 2));
    ok(stillHeard === true, 'and the live one is still the one being heard');

    // ── a silence, and then a server that falls over ────────────────
    await page.evaluate(() => window.__stt.final(
      'so the second request finds the answer already sitting in the cache', 15));
    const quiet = await until(() => logLines(dir)
      .find((l) => l.type === 'suppressed' && l.reason === 'nothing'), 6000);
    ok(!!quiet, 'a "nothing" is logged as what it is and reaches no screen',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'suppressed')));
    ok(await page.evaluate(() => document.getElementById('souffleuse-strip').hidden
       || !document.getElementById('souffleuse-strip').classList.contains('visible')),
       'and the strip stays empty');

    await page.evaluate(() => window.__stt.final(
      'and that is the whole of it, said once more for the people at the back', 15));
    const badge = await until(() => page.evaluate(() => {
      const el = document.getElementById('souffleuse-badge');
      return el && !el.hidden ? el.textContent : null;
    }), 6000);
    ok(!!badge && /upstream is out of credits/.test(badge),
       'a 200 carrying an error puts the endpoint\'s own sentence on the badge',
       JSON.stringify(badge));
    ok(!!badge && /402/.test(badge) && /again/.test(badge),
       'with the code beside it and the promise to try again', JSON.stringify(badge));
    const errStatus = await until(() => logLines(dir)
      .find((l) => l.type === 'status' && l.state === 'error'
        && /upstream is out of credits/.test(String(l.why || ''))), 5000);
    ok(!!errStatus, 'and the same sentence in the log, as a status rather than as garbage',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'status').slice(-2)));
    ok(!logLines(dir).some((l) => l.type === 'suppressed' && l.reason === 'garbage'),
       'the answer never reached the policy, so nothing counted it as nonsense');
    ok(dialogs.length === 0, 'and never a dialog', dialogs.join(' | '));
    ok(await page.evaluate(() => document.getElementById('souffleuse-btn').getAttribute('aria-pressed')) === 'true',
       'the switch is still on: one failed call is not a reason to stop listening');

    // ── the prefix was the same text every time ─────────────────────
    // The whole cost case rests on it: a system block that differed per call
    // would be paid for in full every cadence, and nothing in a single request
    // can show that it does not.
    const prefixes = fake.requests.map((r) => String((r.body && r.body.messages
      && r.body.messages[0] && r.body.messages[0].content
      && r.body.messages[0].content[0] && r.body.messages[0].content[0].text) || ''));
    ok(prefixes.length > 2 && prefixes.every((t) => t && t === prefixes[0]),
       'every call of the session carried byte-identical deck text, which is what the cache assumes',
       prefixes.length + ' calls, ' + new Set(prefixes).size + ' distinct prefix(es)');

    // ── the projection learns none of it ────────────────────────────
    const aud = await page.context().newPage();
    extra.push(aud);
    const errs = [];
    aud.on('pageerror', (e) => errs.push('audience: ' + e));
    await aud.goto(serving.url + '/audience.html', { waitUntil: 'load' });
    await aud.waitForTimeout(500);
    const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
    extra.push(spk);
    spk.on('pageerror', (e) => errs.push('cockpit: ' + e));
    await spk.waitForLoadState();
    await spk.waitForTimeout(900);

    ok(await aud.evaluate(() => document.getElementById('souffleuse-strip') === null),
       'the projection has no strip');
    ok(await aud.evaluate(() => document.getElementById('souffleuse-btn') === null
       && document.getElementById('souffleuse-badge') === null),
       'nor a switch, nor a badge');
    ok(await spk.evaluate(() => document.getElementById('souffleuse-strip') !== null),
       'the cockpit does – it is chrome of one window');
    const snapKeys = await aud.evaluate(() => Object.keys(snapshot()));
    ok(!snapKeys.some((k) => /souffleuse|prompter|hint|cue/i.test(k)),
       'and no field of the shared snapshot is the prompter\'s', snapKeys.join(', '));
    ok(!/souffleuse/i.test(await spk.evaluate(() => JSON.stringify(snapshot()))),
       'neither on the cockpit\'s side of it');

    await spk.bringToFront();
    await spk.keyboard.press('ArrowDown');
    await spk.waitForTimeout(400);
    const both = await Promise.all([aud, spk].map((p) => p.evaluate(() => ({
      idx: state.activeIdx, rev: revealed[flatChunks[state.activeIdx].id] ?? null,
    }))));
    ok(both[0].idx === both[1].idx && both[0].rev === both[1].rev,
       'the two windows still agree about where the talk is', JSON.stringify(both));

    // ── and a second cockpit takes the prompter, out loud ───────────
    // The sidecar whispers to the socket of the last hello, so opening a
    // second cockpit - which is one stray `S` in the projection away - takes
    // the hints over. It used to do that in silence: the first window kept its
    // switch pressed and its microphone open for the rest of the talk, sending
    // a transcript nothing would answer. It is told, with the reason.
    await spk.evaluate(() => document.getElementById('souffleuse-btn').click());
    ok(await until(() => spk.evaluate(() => document.getElementById('souffleuse-btn')
       .getAttribute('aria-pressed') === 'true'), 8000),
       'the second cockpit switches its own prompter on');
    ok(await until(() => page.evaluate(() => document.getElementById('souffleuse-btn')
       .getAttribute('aria-pressed') === 'false'), 8000),
       'and the first one is switched off rather than left listening into nothing',
       JSON.stringify(logLines(dir).filter((l) => l.type === 'status').slice(-2)));
    ok(await page.evaluate(() => window.__stt.rec === null),
       'its ear stops with it');

    ok(errs.length === 0, 'no page errors in either of the two windows', errs.join(' | '));

    note(`${fake.requests.length} calls to the model, ${logLines(dir).length} lines of log, `
      + `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    // Order matters. The pages go to about:blank first: a cockpit whose
    // watch socket dies reconnects, and a refused WebSocket is a console
    // error, which the runner counts against this spec after it returns.
    for (const p of extra) { try { await p.close(); } catch (e) { /* already gone */ } }
    try { await page.goto('about:blank'); } catch (e) { /* nothing open */ }
    if (child) {
      const ended = new Promise((r) => child.once('exit', r));
      try { child.kill('SIGTERM'); } catch (e) { /* already gone */ }
      const hard = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 4000);
      await ended;
      clearTimeout(hard);
    }
    await fake.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* leave it */ }
  }
}
