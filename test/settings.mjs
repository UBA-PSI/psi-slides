#!/usr/bin/env node
/*
 * node test/settings.mjs
 *
 * The frontmatter and directive settings that decide how a lecture looks,
 * and the reasons they exist.
 *
 * It was called layout-compat.mjs when all it checked was the three
 * settings that reproduce the 1.0.0 layout. It has since grown to cover
 * autoplay, the label switches and the card-row vocabulary, and the name
 * had stopped describing it - which on a test file is worse than on most
 * things, because a name that undersells a file is a name that stops
 * people adding to it.
 *
 * Three settings, and the reason they exist.
 *
 * From 1.0.0 the source format is the interface, and a lecture that laid out
 * a certain way should be able to lay out that way again. Exactly three
 * things have moved since 1.0.0 that a finished deck would notice, found by
 * diffing AUDIENCE_CSS and PRINT_CSS between the v1.0.0 tag and HEAD rather
 * than by reading commit titles:
 *
 *   1. the bundled sans           -> `fonts: {sans: Inter Tight}`
 *   2. text-wrap balance/pretty   -> `style: {wrap: none}`
 *   3. code ligatures             -> `ligatures: all`
 *
 * There was a `layout: 1.0` umbrella over those three and it was removed.
 * One key naming a version reads as a promise that the engine can rebuild
 * any past release, and that promise is unbounded: every later change to a
 * shared stylesheet would have to be gated on a generation, the gates would
 * compose, and the set of untested combinations would grow with every
 * release. It also put the burden in the wrong place - an author would have
 * had to know which version their deck was authored against, and the project
 * would have had to publish a layout-version history beside the software
 * version. The three settings give the same reachability and each is a
 * preference an author might want on its own merits, so the 1.0.0 look is a
 * three-line recipe rather than a mechanism.
 *
 * The recipe was verified once against the real thing: the same source built
 * through `git show v1.0.0:build.js` and through HEAD with all three set came
 * out **pixel-identical**, 0 differing pixels by `magick compare -metric AE`
 * at 1440x810 deviceScaleFactor 2. That comparison cannot be a standing
 * test, because it needs a checkout of the old build; this file stands in for
 * it and guards the mechanism the comparison proved.
 *
 * Why here and not in test/gates/: a gate is zero-dependency by design and
 * runs on a bare checkout with no `npm install`, and this has to actually
 * build a lecture. Why not in test/run.mjs: that suite drives a browser and
 * builds lectures by slug out of lectures/, and none of what is asserted here
 * needs a browser or belongs in a tracked lecture.
 *
 * The load-bearing assertions are the *guards*. A future edit that drops the
 * `body:not([data-wrap=none])` wrapper from the text-wrap rules would leave
 * `style.wrap` silently doing nothing, and every outcome-shaped check here
 * would still pass.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; console.log('  ✓ ' + what); return; }
  failures.push(what + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + what + (detail ? ' — ' + detail : ''));
}

const SOURCE = `---
title: A finished deck
presenter: Dominik Herrmann
info: |
  Bamberg, winter term
FRONTMATTER---

## principle: Efficient office workflows find the difficult flaw {.standard #p}

**A crawler that looks like a browser gets measured back.** The detector's
affiliation is inferred from the fingerprint it collects.

## example: The arrow in a listing {.wide #e}

\`\`\`python
async def main() -> None:
    if a != b: pass
\`\`\`
`;

function build(extraFrontmatter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-compat-'));
  fs.writeFileSync(path.join(dir, 'source.md'),
    SOURCE.replace('FRONTMATTER', extraFrontmatter ? extraFrontmatter + '\n' : ''));
  // Both live and print, because the two stylesheets do not carry the same
  // rules: `text-wrap: pretty` on prose is PRINT_CSS only, and checking it
  // against audience.html is checking for something that was never there.
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`build failed for ${JSON.stringify(extraFrontmatter)}:\n${r.stdout}${r.stderr}`);
  }
  return {
    html: fs.readFileSync(path.join(dir, 'audience.html'), 'utf8'),
    print: fs.readFileSync(path.join(dir, 'print.html'), 'utf8'),
    log: (r.stdout || '') + (r.stderr || ''),
    dir,
  };
}
// The emitted file contains the literal string "<body>" inside two runtime
// comments, so the first match is not the document's. Anchor on the
// attribute every live view's body carries.
const bodyTag = (html) => (html.match(/<body [^>]*data-collapse[^>]*>/) || [''])[0];

console.log('\nlayout generations');

// ── the guards themselves ────────────────────────────────────────────
// Asserted on the default build, because that is where they have to be
// present *and* inert. A rule that lost its guard still balances text, so
// nothing else in this file would notice.
{
  const { html, print } = build('');
  ok(/body:not\(\[data-wrap=none\]\)[\s\S]{0,220}?text-wrap: balance/.test(html),
     'the live text-wrap balancing is guarded by data-wrap, so layout:1.0 can lift it');
  ok(/body:not\(\[data-wrap=none\]\)[\s\S]{0,220}?text-wrap: balance/.test(print),
     'and so is print\'s, which is a separate stylesheet with its own copy');
  ok(/body:not\(\[data-wrap=none\]\)[\s\S]{0,220}?text-wrap: pretty/.test(print),
     'and the prose rule, which only PRINT_CSS carries');
  ok(/body:not\(\[data-liga=all\]\)[\s\S]{0,220}?font-variant-ligatures: none/.test(html),
     'the code-ligature rule is guarded by data-liga');
  ok(!/data-wrap=/.test(bodyTag(html)) && !/data-liga=/.test(bodyTag(html)),
     'a lecture that names no layout emits neither attribute', bodyTag(html));
  ok(/font-family:'IBM Plex Sans'/.test(html),
     'and is set in the current default sans');
  ok(!/font-family:'Inter Tight'/.test(html),
     'with no Inter Tight face riding along unasked');
}

// ── the three together are the 1.0.0 recipe ──────────────────────────
{
  const { html, print, log } = build('ligatures: all\nfonts:\n  sans: Inter Tight\nstyle:\n  wrap: none');
  const body = bodyTag(html);
  ok(/data-wrap="none"/.test(body), 'the recipe turns the text-wrap balancing off', body);
  ok(/data-liga="all"/.test(body), 'and puts the code ligatures back', body);
  ok(/font-family:'Inter Tight'/.test(html), 'and embeds Inter Tight');
  ok(!/font-family:'IBM Plex Sans'/.test(html),
     'without also embedding the face it replaced');
  // The @font-face landing is not enough: the stack still names IBM Plex
  // Sans first, so without the override nothing asks for the embedded face.
  ok(/--sans-stack: 'Inter Tight',/.test(html) && /--sans: 'Inter Tight',/.test(html),
     'and names it at the head of the sans stack, or nothing asks for it');
  ok(/Inter Tight/.test(log),
     'the build says which families it embedded', log.split('\n').find(l => l.includes('[fonts]')) || '');
  // Print is a second stylesheet and a separate <body>; a deck held to the
  // old look has to print the way it printed too.
  const printBody = (print.match(/<body [^>]*data-slide-nums[^>]*>/) || [''])[0];
  ok(/data-wrap="none"/.test(printBody) && /data-liga="all"/.test(printBody),
     'and the document view is held with it', printBody);
}

// ── the three are independently reachable ────────────────────────────
{
  const { html } = build('ligatures: all');
  const body = bodyTag(html);
  ok(/data-liga="all"/.test(body), 'ligatures:all reaches the code ligatures on its own', body);
  ok(!/data-wrap=/.test(body), 'without dragging the text-wrap setting with it', body);
}
{
  const { html } = build('ligatures: none');
  ok(/body\[data-liga=none\]\s*{\s*font-variant-ligatures: none/.test(html),
     'ligatures:none reaches prose as well as code');
}
{
  const { html } = build('fonts:\n  sans: Inter Tight');
  ok(/font-family:'Inter Tight'/.test(html) && /--sans-stack: 'Inter Tight',/.test(html),
     'a bundled family is selectable by name with no file in fonts/');
  ok(!/data-wrap=/.test(bodyTag(html)) && !/data-liga=/.test(bodyTag(html)),
     'and choosing it drags nothing else along with it');
}
{
  const { html } = build('style:\n  wrap: none');
  ok(/data-wrap="none"/.test(bodyTag(html)),
     'style.wrap reaches the balancing on its own');
  ok(!/data-liga=/.test(bodyTag(html)) && !/font-family:'Inter Tight'/.test(html),
     'and drags neither the ligatures nor the old sans with it', bodyTag(html));
}

// ── the roster is per-lecture, which is what makes an alternate cheap ──
{
  const { html, log } = build('fonts:\n  mono: Noto Sans Mono Condensed');
  ok(/Noto Sans Mono Condensed/.test(log), 'the condensed mono is embeddable without a file');
  ok(!/JetBrains Mono';font-style/.test(html),
     'while the face it replaced is not also carried');
  // The whole point of that family is the pinned width axis, and it is
  // pinned in the @font-face descriptor rather than by a font-stretch rule
  // on every element the mono role reaches. Verified: with the descriptor
  // the same file measures 0.50 em per character, without it 0.60.
  ok(/font-variation-settings:'wdth' 62\.5;/.test(html),
     'and it carries the width axis as a face descriptor, or it is not condensed');
  ok(!/MB per view/.test(log),
     'and it costs kilobytes, not megabytes', log.split('\n').find(l => l.includes('[fonts]')) || '');
}

// ── autoplay is stripped before the compiler sees it ──────────────────
// Playback is not part of the drawing, and diagram-core.mjs also runs in
// the browser editor, where there is no deck to play.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-auto-'));
  fs.writeFileSync(path.join(dir, 'source.md'),
    '---\ntitle: T\n---\n\n## figure: F {#f}\n\n::: draw {unit=150x56 autoplay=900}\nbox a "A"\nbox b "B" right of a gap 1\n\nstep one\n  dim a\n:::\n');
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(r.status === 0, 'a draw fence takes autoplay=N without the compiler refusing it',
     (r.stdout || '') + (r.stderr || ''));
  if (r.status === 0) {
    const out = fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
    ok(/data-autoplay="900"/.test(out), 'and it lands on the figure as data-autoplay');
    ok(!/unit=150x56 autoplay/.test(out), 'with the option no longer in the block source');
  }
  const bad = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env } });
  ok(bad.status === 0, 'and the block still compiles on a rebuild');
}

// ── cycle, and the two switches that were only checked by hand ────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cycle-'));
  fs.writeFileSync(path.join(dir, 'source.md'),
    '---\ntitle: T\n---\n\n## figure: F {#f}\n\n::: draw {unit=150x56 autoplay=900 cycle}\nbox a "A"\nbox b "B" right of a gap 1\n\nstep one\n  dim a\n:::\n');
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(r.status === 0, 'a draw fence takes autoplay=N with cycle', (r.stdout || '') + (r.stderr || ''));
  if (r.status === 0) {
    const out = fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
    ok(/data-autoplay="900" data-autoplay-cycle=""/.test(out),
       'and both land on the figure');
    // The runtime has to read it, not just carry it. A carried attribute
    // nothing reads is the silent no-op this format refuses everywhere.
    ok(/data-autoplay-cycle/.test(out.slice(out.indexOf('restartAutoplay'))) ||
       /hasAttribute\('data-autoplay-cycle'\)/.test(out),
       'and the runtime reads the cycle flag');
  }
  // cycle alone is meaningless and is refused rather than ignored.
  fs.writeFileSync(path.join(dir, 'source.md'),
    '---\ntitle: T\n---\n\n## figure: F {#f}\n\n::: draw {cycle}\nbox a "A"\n:::\n');
  const bad = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(bad.status !== 0 && /no autoplay to repeat/.test((bad.stdout || '') + (bad.stderr || '')),
     'cycle with no autoplay is refused, not ignored');
}

// ── style.labels reaches both views, which is the whole point of it ───
{
  const plain = build('');
  ok(/class="chunk-label"/.test(plain.print),
     'the document view labels a tagged chunk by default');
  const off = build('style:\n  labels: off');
  ok(/data-labels="off"/.test(bodyTag(off.html)), 'labels:off reaches the projection', bodyTag(off.html));
  ok(/data-labels="off"/.test((off.print.match(/<body [^>]*>/g) || []).join(' ')),
     'and the document, where most of those labels actually are');
  ok(/body\[data-labels=off\] \.chunk-label/.test(off.print),
     'and the document rule exists to act on it');
  ok(/body\[data-labels=off\][^{]*\.chunk\[data-tag=exercise\]/.test(off.html),
     'and the projection rule covers the one eyebrow it still generates');
}

// ── cards decide their own size, and say so in the markup ─────────────
{
  const mk = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cards-'));
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };
  const words = mk('::: cards 3\n- Measure\n- Probe\n- Report\n:::\n');
  ok(/cs-large ca-center/.test(words), 'a row of single words comes out large and centred');
  const prose = mk('::: cards 2\n- Measure what a page does when a crawler asks for it politely and twice\n- Probe the detector until it names itself, which it will\n:::\n');
  ok(/cs-small ca-left/.test(prose), 'a row of sentences comes out small and ranged left');
  const nested = mk('::: cards 2\n- Surfaces\n  - Canvas\n- Answers\n  - Randomise\n:::\n');
  ok(/cs-large ca-left/.test(nested),
     'a row with a second level stays left even when its heads are two words');
  ok(/\[data-collapse=topic-bold\] \.cards\.cd-fold li ul/.test(nested),
     'and the second level is folded away on the projection, not in the markup');
  const forced = mk('::: cards 2 {.small .center .middle .show .outline}\n- Measure\n- Probe\n:::\n');
  ok(/cs-small ca-center cv-middle cd-show cg-outline/.test(forced),
     'and every one of the five is overridable by name');
}

// ── a card row needs the whole measure, so it is refused where it has
//    already been divided. In `cols` the old behaviour was the worst of
//    the three: the row spanned the full width and the column flow was
//    simply defeated, so the author wrote `cols 2` and got one column.
{
  const refuses = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-nest-'));
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || '') };
  };
  const CARDS = '::: cards 2\n- Alpha\n- Beta\n:::\n';
  for (const [name, body] of [
    ['cols',       '::: cols 2\n' + CARDS + ':::\n'],
    ['side',       '::: side\nleft\n' + CARDS + '::: flip\nright\n:::\n'],
    ['marginalia', '::: marginalia\n' + CARDS + ':::\n'],
    ['expand',     '::: expand detail\n' + CARDS + ':::\n'],
    ['margin',     '::: margin\n' + CARDS + ':::\n'],
    ['overlay',    '::: overlay\n' + CARDS + ':::\n'],
  ]) {
    const r = refuses(body);
    ok(r.failed && /needs the whole measure/.test(r.out),
       `a card row inside ::: ${name} is refused, not squeezed`, r.out.split('\n')[0]);
  }
  // slide and script divide nothing - they say which half of the chunk is
  // on screen - so a row inside one is legitimate and must still build.
  for (const name of ['slide', 'script']) {
    const r = refuses(`::: ${name}\n` + CARDS + ':::\n');
    ok(!r.failed, `and one inside ::: ${name} still builds, because that divides nothing`,
       r.out.split('\n').find(l => l.includes('cards')) || '');
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map(f => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
