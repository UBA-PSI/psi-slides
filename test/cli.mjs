#!/usr/bin/env node
/*
 * node test/cli.mjs
 *
 * The command line as an author meets it: a typo'd flag, a value in the wrong
 * form, an option without the flag that reads it, -h, a folder for a file,
 * a port that is taken. Before the flag table every one of these either built
 * an ordinary deck and exited 0 (`--wacth`, `--check-fit=true`, `--port 8080`
 * without --serve) or died in a Node stack trace (`EISDIR`, `EADDRINUSE`,
 * `RangeError` on --port 99999), and `-h` was taken for a file name.
 *
 * What is asserted for a refusal: exit 1, the sentence, no stack trace, and no
 * view written – a refusal that builds first is the silent no-op with a
 * message on top. The --help text is checked against the table it is made
 * from (read out of build.js as text, as the `cli` gate reads it), which is
 * the half the gate cannot run.
 *
 * It runs build.js as a subprocess, so it needs `npm install` and is not a
 * gate (see test/README.md); it needs no browser.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build.js');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; return; }
  failures.push(detail ? `${what}\n      ${String(detail).split('\n').slice(0, 4).join(' / ')}` : what);
}

function run(args, { cwd = ROOT, timeout = 60000, build = BUILD } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [build, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const STACK = /\bat .*\(.*:\d+:\d+\)|\n\s+at /;
const dir = tmpDir('psi-cli-');
const deck = path.join(dir, 'talk');
fs.mkdirSync(deck);
const src = path.join(deck, 'source.md');
fs.writeFileSync(src, '---\ntitle: CLI\n---\n\n## statement: One {#one}\n\nA sentence.\n');
const views = () => ['audience', 'print', 'print-notes', 'speaker']
  .filter(v => fs.existsSync(path.join(deck, v + '.html')));
const clean = () => { for (const v of views()) fs.rmSync(path.join(deck, v + '.html')); };

// Every refusal: exit 1, the words, no stack, nothing written. Run one at a
// time, because "nothing written" is read off the one deck folder.
async function refused(args, re, what, runOpts = {}) {
  clean();
  const r = await run(args, runOpts);
  ok(r.code === 1, `${what}: exit 1`, `exit ${r.code}\n${r.err}${r.out}`);
  ok(re.test(r.err), `${what}: says so`, r.err || r.out);
  ok(!STACK.test(r.err), `${what}: without a stack trace`, r.err);
  ok(!views().length, `${what}: writes no view`, views().join(', '));
  return r;
}

// ── unknown flags, with the nearest name ─────────────────────────────
const near = [
  ['--wacth', '--watch'], ['--serv', '--serve'], ['--check-fitt', '--check-fit'],
  ['--audience-onyl', '--audience-only'], ['--no-inline-image', '--no-inline-images'],
  ['--integrate', '--integrate-annotations'], ['--pdf-zom=1.2', '--pdf-zoom=1.2'],
  ['-watch', '--watch'],
];
for (const [typed, meant] of near) {
  await refused([src, typed],
    new RegExp(`^Error: ${typed.replace(/[.]/g, '\\.')} is not a flag of build\\.js\\. Did you mean ${meant.replace(/[.]/g, '\\.')}\\?`),
    `${typed} -> ${meant}`);
}
await refused([src, '-w'], /^Error: -w is not a flag of build\.js\.\n {2}node build\.js --help/,
  '-w: too little to guess from, so no guess');
await refused([src, '--souffleuse'], /--souffleuse is now --prompter\./,
  'the pre-rename name keeps its own refusal');

// ── values in the wrong form ─────────────────────────────────────────
await refused([src, '--check-fit=true'], /^Error: --check-fit takes no value/, '--check-fit=true');
await refused([src, '--serve', '--port=8080'], /^Error: --port takes its value as the next word: --port 8080/,
  '--port=8080');
await refused([src, '--slides-pdf', '--pdf-zoom', '1.2'], /^Error: --pdf-zoom needs a value, as --pdf-zoom=<value>\./,
  '--pdf-zoom 1.2');
await refused([src, '--watch', '--prompter', '--prompter-model', '--watch'],
  /^Error: --prompter-model takes an OpenRouter model id.*\n {2}--watch is a flag, not its value\./,
  'a flag is not taken for a value');
await refused([src, '--squint', '--squint-out'], /^Error: --squint-out takes a path, or "-" for stdout\./,
  'a value missing at the end of the line');
await refused([src, '--check-fit', '--viewport', 'big'], /--viewport takes WIDTHxHEIGHT/,
  'a viewport is checked before the build it would measure');

// ── an option without the flag that reads it ─────────────────────────
await refused([src, '--port', '8080'], /^Error: --port without --serve or --present\.\n.*\n {2}node build\.js <source\.md> --serve --port 8080/,
  '--port without --serve');
await refused([src, '--viewport', '1600x900'], /^Error: --viewport without --check-fit, --squint or --frames\./,
  '--viewport alone');
await refused([src, '--squint-out', 'x.txt'], /^Error: --squint-out without --squint\./, '--squint-out alone');
await refused([src, '--dry-run'], /^Error: --dry-run without --optimize-images\./, '--dry-run alone');
await refused([src, '--all'], /^Error: --all without --optimize-images\./, '--all alone');
await refused([src, '--max-width', '900'], /^Error: --max-width without --optimize-images\./, '--max-width alone');
await refused([src, '--into', dir], /^Error: --into without --new\./, '--into alone');

// ── commands that build nothing, and flags that cannot run together ──
await refused(['--new', 'slug', '--watch'], /^Error: --watch does nothing with --new\.\n {2}--new writes a new lecture folder/,
  '--new with --watch');
await refused(['--new', 'slug', '--optimize-images'], /are separate commands; run one at a time/,
  'two commands at once');
await refused([src, '--integrate-annotations', '--audience-only'],
  /^Error: --audience-only does nothing with --integrate-annotations\./, '--integrate-annotations with a build flag');
await refused([src, '--watch', '--check-fit'],
  /^Error: --check-fit and --watch are mutually exclusive\.\n {2}--check-fit looks at one finished build/,
  '--check-fit with --watch');
await refused([src, '--watch', '--squint', '--frames'],
  /^Error: --squint, --frames and --watch are mutually exclusive\./, '--squint --frames with --watch');
await refused([src, src], /^Error: build\.js takes one source\.md, and was given 2/, 'two sources');
await refused(['--new', 'a', 'b'], /^Error: --new takes one slug, and was given 2: a, b\./, '--new with two slugs');
{
  const r = await refused([src, '--wacth', '--events'], /Did you mean --watch\?/, 'a refusal under --events');
  const line = r.out.split('\n').find(l => l.startsWith('{"type":'));
  let ev = null;
  try { ev = JSON.parse(line); } catch { /* reported below */ }
  ok(ev && ev.type === 'build-error' && ev.userFacing === true && ev.stack === null,
    'under --events a refusal is the build-error line a driver already reads', line);
}

// ── help ─────────────────────────────────────────────────────────────
const buildSrc = fs.readFileSync(BUILD, 'utf8');
const a = buildSrc.indexOf('// cli-flags:start');
const b = buildSrc.indexOf('// cli-flags:end');
// The file under test, read as text: the same literal the gate evaluates.
// eslint-disable-next-line no-new-func
const { CLI_FLAGS } = a >= 0 && b > a
  ? new Function(buildSrc.slice(a, b) + '\nreturn { CLI_FLAGS };')()
  : { CLI_FLAGS: [] };
ok(CLI_FLAGS.length > 0, 'build.js carries the flag table');
for (const asked of [['-h'], ['--help'], [src, '--wacth', '-h']]) {
  const r = await run(asked);
  const what = asked.join(' ');
  ok(r.code === 0, `${what}: exit 0`, `exit ${r.code}\n${r.err}`);
  ok(/^Usage:\n/.test(r.out), `${what}: the help on stdout`, r.out.slice(0, 200));
  ok(r.err === '', `${what}: nothing on stderr`, r.err);
}
{
  const r = await run(['--help']);
  const rows = r.out.split('\n').filter(l => /^ {2}--/.test(l)).map(l => l.trim().split(/[\s,=]/)[0]);
  const missing = CLI_FLAGS.filter(f => !f.hidden && !rows.includes(f.name)).map(f => f.name);
  ok(!missing.length, 'the help has a row for every flag that is not hidden', missing.join(', '));
  const shown = CLI_FLAGS.filter(f => f.hidden && r.out.includes(f.name)).map(f => f.name);
  ok(!shown.length, 'and none for a hidden one', shown.join(', '));
  ok(/Shift-S/.test(r.out), 'the prompter group says how it is switched on');
}
{
  const r = await run([]);
  ok(r.code === 1 && r.out === '' && /^Usage:\n/.test(r.err),
    'a bare node build.js: the help on stderr, exit 1', `exit ${r.code}`);
}
{
  const r = await run(['--watch']);
  ok(r.code === 1 && /^No source\.md given: node build\.js <source\.md> --watch/.test(r.err),
    'flags without a source: one sentence, not the whole help', r.err);
}

// ── a folder for a file ──────────────────────────────────────────────
{
  clean();
  const r = await run([deck, '--audience-only']);
  ok(r.code === 0 && /^Using .*talk\/source\.md\.\n/.test(r.out),
    'a folder with a source.md builds it and says so in one line', r.out.split('\n')[0] + r.err);
  ok(views().join() === 'audience', 'and writes what was asked', views().join(', '));
  clean();
}
await refused([dir], /is a folder with no source\.md in it\. It holds 1 lecture folder \(talk\); name one, e\.g\.\n {2}node build\.js .*talk/,
  'a folder of lectures names one');
{
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  await refused([empty], /empty is a folder with no source\.md in it\.\n {2}build\.js takes one lecture's source\.md, or the folder that holds it\./,
    'an empty folder');
  await refused(['--frames', deck], /--frames took .*talk as the folder its pictures go to; put the source first/,
    'a source folder written after --frames');
}

// ── ports ────────────────────────────────────────────────────────────
await refused([src, '--serve', '--port', 'abc'], /^Error: --port takes a port number from 1 to 65535, and abc is not one\./,
  '--port abc');
await refused([src, '--serve', '--port', '99999'], /^Error: --port takes a port number from 1 to 65535, and 99999 is not one\./,
  '--port 99999');
{
  const blocker = net.createServer();
  await new Promise(res => blocker.listen(0, '127.0.0.1', res));
  const port = blocker.address().port;
  await refused([src, '--watch', '--serve', '--port', String(port)],
    new RegExp(`^Error: port ${port} is in use – by another build\\.js --serve, or by another program\\.\\n {2}Pick another`),
    'a busy port under --watch --serve, before the watcher builds');
  await refused([src, '--serve', '--port', String(port)], new RegExp(`^Error: port ${port} is in use`),
    'a busy port on a one-shot build, before it builds');
  blocker.close();
}

// ── reading a run's log back (--prompter-debrief, --prompter-replay) ──
// A synthetic run: written here, never a real log, whose spoken words are a
// room's. Three logs beside the deck – the talk, a newer dry run named as
// one, and an older dry run from before the name said so – and the default
// has to find the talk.
{
  const talk = path.join(dir, 'debrief');
  fs.mkdirSync(talk);
  const tsrc = path.join(talk, 'source.md');
  fs.writeFileSync(tsrc, '---\ntitle: Debrief\n---\n\n## statement: One {#one}\n\nA sentence.\n\n'
    + '> note: @0:30 Start **here**\n\n## statement: Two {#two}\n\nAnother.\n\n'
    + '> note: Then **this**, at @12:30 in the prose, which is no mark\n\n'
    + '## statement: Three {#three}\n\nThe last.\n\n> note: @1:02:30 An hour **in**\n');
  const at = (s) => new Date(Date.UTC(2026, 9, 16, 8, 0, s)).toISOString();
  const lines = (ls) => ls.map(l => JSON.stringify(l)).join('\n') + '\n';
  const talkLog = 'prompter-20261016-100005.jsonl';
  fs.writeFileSync(path.join(talk, talkLog), lines([
    { t: at(0), type: 'session', via: 'build', model: 'fake/model', dryRun: false },
    { t: at(1), type: 'move', chunkId: 'one', idx: 0, beat: 0, elapsed: 2 },
    { t: at(2), type: 'say', text: 'testing one two', t0: 1, t1: 2, chunkId: 'one' },
    { t: at(5), type: 'clock', why: 'the cockpit clock started', delta: 0, was: 5, now: 0 },
    { t: at(6), type: 'move', chunkId: 'one', idx: 0, beat: 0, elapsed: 0 },
    { t: at(9), type: 'say', text: 'Good morning \u001b[31meveryone', t0: 1, t1: 4, chunkId: 'one' },
    { t: at(50), type: 'move', chunkId: 'two', idx: 1, beat: 0, elapsed: 45 },
    { t: at(52), type: 'say', text: 'the second slide', t0: 46, t1: 48, chunkId: 'two' },
    { t: at(55), type: 'tick', chunkId: 'two', idx: 1, beat: 0, elapsed: 50, cueTargets: [], timeHintAllowed: false },
    { t: at(56), type: 'answer', durationMs: 1200, usage: { cost: 0.01 },
      body: { choices: [{ message: { tool_calls: [{ function: { name: 'advise',
        arguments: JSON.stringify({ action: 'hint', kind: 'example', text: 'Name the bank case', why: 'abstract' }) } }] } }] } },
    { t: at(57), type: 'suppressed', reason: 'start-quiet', action: 'hint', kind: 'example', text: 'Name the bank case', why: 'abstract' },
    { t: at(58), type: 'end', how: 'SIGINT', elapsed: 53 },
  ]));
  fs.writeFileSync(path.join(talk, 'prompter-20261016-110000-dry.jsonl'), lines([
    { t: at(0), type: 'session', via: 'build', dryRun: true },
  ]));
  fs.writeFileSync(path.join(talk, 'prompter-20261016-1030.jsonl'), lines([
    { t: at(0), type: 'session', via: 'build' }, { t: at(1), type: 'answer', dryRun: true },
  ]));
  fs.writeFileSync(path.join(talk, 'prompter-0a1b2c3d.prompt.txt'), 'the prefix\n');

  const r1 = await run([talk, '--prompter-debrief']);
  ok(r1.code === 0, '--prompter-debrief on a lecture folder: exit 0', r1.err + r1.out);
  ok(new RegExp(`log +\\S*${talkLog} \\(passed over 2 newer dry runs\\)`).test(r1.out),
    'the default log is the newest that is not a dry run, by name or by content', r1.out);
  ok(/^ {2}#one +0:30 +0:00 +-0:30 /m.test(r1.out),
    'a slide is reached after the clock started, not on the walk before it', r1.out);
  ok(/^ {2}#three +1:02:30 +\(not reached\)/m.test(r1.out) && !/#two +\d/.test(r1.out),
    '@1:02:30 is an hour in, and a mark in the prose is none', r1.out);
  ok(/first words after that: "Good morning {2}\[31meveryone"/.test(r1.out) && !/\u001b/.test(r1.out),
    'the first words after the clock, with an escape sequence printed as a space', JSON.stringify(r1.out.slice(0, 600)));
  ok(/stopped with SIGINT/.test(r1.out), 'a run stopped with Ctrl-C says so', r1.out);
  ok(/== held back \(1\)\n {2}0:50 +example · "Name the bank case" · held back: start-quiet/.test(r1.out),
    'what the policy held back', r1.out);
  ok(/== 1 call to the model · 1200 ms each · \$0\.01/.test(r1.out), 'the calls and their cost', r1.out);
  ok(/== the replay through today's policy\n\[replay\] /.test(r1.out), 'and the replay at the end', r1.out);

  const r2 = await run([tsrc, '--prompter-debrief', '--no-replay']);
  ok(r2.code === 0 && !/\[replay\]/.test(r2.out), '--no-replay leaves it out', r2.out);

  const r3 = await run(['--prompter-debrief', 'prompter-20261016-1030.jsonl', tsrc, '--transcript']);
  ok(r3.code === 0 && /^transcript of \S*prompter-20261016-1030\.jsonl, the whole log/m.test(r3.out),
    'a log named by its bare name is read beside source.md, even a dry run', r3.err + r3.out);
  const r4 = await run([tsrc, '--prompter-debrief', '--transcript']);
  ok(r4.code === 0 && /^## #one {2}\[0:00\]\nGood morning {2}\[31meveryone\n\n## #two {2}\[0:45\]\nthe second slide\n/m.test(r4.out)
    && !/testing one two/.test(r4.out),
  '--transcript: the words per slide with the talk clock, from the clock\'s start on', r4.out);
  ok(/^6 words in 0:50 · 7 words per minute$/m.test(r4.out), 'and words per minute', r4.out);

  const r5 = await run([tsrc, '--prompter-replay', talkLog]);
  ok(r5.code === 0 && /\[replay\] prompter-20261016-100005\.jsonl · cooldown \d+s · 1 answer\(s\)/.test(r5.out),
    '--prompter-replay finds a bare log name beside source.md too', r5.err + r5.out);

  await refused([tsrc, '--transcript'], /^Error: --transcript without --prompter-debrief\./, '--transcript alone');
  await refused([tsrc, '--no-replay'], /^Error: --no-replay without --prompter-debrief\./, '--no-replay alone');
  await refused([tsrc, '--prompter-debrief', '--transcript', '--no-replay'],
    /^Error: --no-replay does nothing with --transcript/, '--transcript with --no-replay');
  await refused([tsrc, '--prompter-debrief', '--watch'], /^Error: --watch does nothing with --prompter-debrief\./,
    '--prompter-debrief beside --watch');
  await refused([tsrc, '--prompter-debrief', 'prompter-19990101-0000.jsonl'],
    /^--prompter-debrief: no log prompter-19990101-0000\.jsonl here, beside .* or in its old\/ folder\./, 'a log that is not there');
  await refused(['--prompter-debrief'], /^--prompter-debrief needs the source\.md/, '--prompter-debrief without a source');
  await refused([src, '--prompter-debrief'], /^No prompter log beside .*\. A run with --prompter writes one there\./,
    'a lecture with no log');
  fs.rmSync(path.join(talk, talkLog));
  await refused([tsrc, '--prompter-debrief'], /^No prompter log beside .* but 2 dry runs; name one to read it:/,
    'a lecture with dry runs only');
}

// ── an engine with a file missing ────────────────────────────────────
// A copy of the engine – build.js, every file it imports or reads beside
// itself (found with the two patterns desktop/test/stage-engine.test.mjs
// reads), package.json, and node_modules linked – builds the deck; take a
// file of runtime/ away and every build refuses in one sentence that names
// it, without a stack, before any view is written. Before the pre-flight
// (assertEngineComplete, held in place by the engine-files gate) the same
// copy died in a renderer with an ENOENT stack. Each case puts back what it
// took.
{
  const eng = path.join(dir, 'engine');
  const engineBuild = { build: path.join(eng, 'build.js') };
  const own = new Set(['build.js', 'package.json',
    ...[...buildSrc.matchAll(/new URL\(\s*'\.\/([^']+)'\s*,\s*import\.meta\.url\s*\)/g)].map(m => m[1]),
    ...[...buildSrc.matchAll(/^\s*import\s[\s\S]*?from\s+'\.\/([^']+)'/gm)].map(m => m[1])]);
  for (const name of own) {
    fs.mkdirSync(path.dirname(path.join(eng, name)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, name), path.join(eng, name));
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(eng, 'node_modules'), 'dir');
  const without = async (files, fn) => {
    for (const f of files) fs.rmSync(path.join(eng, f));
    try { await fn(); } finally {
      for (const f of files) fs.copyFileSync(path.join(ROOT, f), path.join(eng, f));
    }
  };
  const sentence = (names) => new RegExp('^The psi-slides installation in \\S*engine\\S* is incomplete: '
    + names.map(n => n.replace(/[./]/g, '\\$&')).join(', ') + ` ${names.length === 1 ? 'is' : 'are'} missing or unreadable `
    + `– reinstall psi-slides, or restore the ${names.length === 1 ? 'file' : 'files'} from the release it came from\\.\\n$`);

  clean();
  const whole = await run([src, '--audience-only', '--no-optimize-images'], engineBuild);
  ok(whole.code === 0 && views().join() === 'audience', 'the copied engine builds the deck', whole.err);
  clean();

  // A partial build reaches the check: runtime/print.js is read only by the
  // document renderer, which is where the ENOENT used to come from.
  await without(['runtime/print.js'], () => refused([src, '--print-only', '--no-optimize-images'],
    sentence(['runtime/print.js']), 'a runtime file missing, under --print-only', engineBuild));
  // Two at once are named together, in the order build.js lists them; the
  // prompter's script is checked although this build has no --prompter.
  await without(['runtime/print.js', 'runtime/souffleuse.js'], () => refused([src, '--no-optimize-images'],
    sentence(['runtime/print.js', 'runtime/souffleuse.js']), 'two files missing, the prompter\'s among them', engineBuild));
  // Unreadable is missing too. Not as root, whom no mode refuses.
  if (!(process.getuid && process.getuid() === 0)) {
    const sheet = path.join(eng, 'runtime/speaker.css');
    fs.chmodSync(sheet, 0o000);
    try {
      await refused([src, '--speaker-only', '--no-optimize-images'], sentence(['runtime/speaker.css']),
        'a runtime file that cannot be read', engineBuild);
    } finally { fs.chmodSync(sheet, 0o644); }
  }
  // A driver hears it as the build-error line it already reads.
  await without(['runtime/audience.js'], async () => {
    const r = await refused([src, '--events', '--no-optimize-images'], /runtime\/audience\.js is missing/,
      'a runtime file missing, under --events', engineBuild);
    const line = r.out.split('\n').find(l => l.startsWith('{"type":"build-error"'));
    let ev = null;
    try { ev = JSON.parse(line); } catch { /* reported below */ }
    ok(ev && ev.userFacing === true && ev.stack === null && /runtime\/audience\.js/.test(ev.message),
      'under --events a missing file is a build-error with no stack', line);
  });
}

// ── and what still works ─────────────────────────────────────────────
{
  clean();
  const r = await run([src, '--audience-only', '--no-optimize-images']);
  ok(r.code === 0 && views().join() === 'audience', 'an ordinary build', r.err);
  clean();
}

if (failures.length) {
  console.log(`cli: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(1);
}
console.log(`cli: ${passed} passed`);
