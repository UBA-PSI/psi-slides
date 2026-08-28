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
    ['marginalia', '::: marginalia\n' + CARDS + ':::\n'],
    ['expand',     '::: expand detail\n' + CARDS + ':::\n'],
    ['margin',     '::: margin\n' + CARDS + ':::\n'],
    ['overlay',    '::: overlay\n' + CARDS + ':::\n'],
  ]) {
    const r = refuses(body);
    ok(r.failed && /needs the whole measure/.test(r.out),
       `a card row inside ::: ${name} is refused, not squeezed`, r.out.split('\n')[0]);
  }
  // `side` was in that list and came out of it, and the distinction is the
  // one worth keeping: a pane is a *container* with a width the row can
  // fill, while `cols` is a text flow the row breaks. Measured both ways.
  {
    const r = refuses('::: side 2:1\nleft\n::: flip\n' + CARDS + ':::\n');
    ok(!r.failed, 'a card row inside a ::: side pane builds, because a pane is a container',
       r.out.split('\n')[0]);
  }
  // slide and script divide nothing - they say which half of the chunk is
  // on screen - so a row inside one is legitimate and must still build.
  for (const name of ['slide', 'script']) {
    const r = refuses(`::: ${name}\n` + CARDS + ':::\n');
    ok(!r.failed, `and one inside ::: ${name} still builds, because that divides nothing`,
       r.out.split('\n').find(l => l.includes('cards')) || '');
  }
  // The refusal was applied in the `cards` branch alone, so `::: rows`
  // inside `::: cols` *built* while the linter reported an error on it -
  // and reported it as `::: cards`, naming a construct the line does not
  // contain. A linter stricter than the build is what CLAUDE.md calls
  // worse than no linter.
  {
    const r = refuses('::: cols 2\n::: rows\n- **A** one\n- **B** two\n:::\n:::\n');
    ok(r.failed && /::: rows inside ::: cols/.test(r.out),
       'a row block inside ::: cols is refused too, and named as rows', r.out.split('\n')[0]);
  }
  // A figure in a column flow is the same defect the card row was.
  {
    const r = refuses('::: cols 2\nsome prose\n\n::: draw {unit=140x52}\nbox a "A"\n:::\n\nmore prose\n:::\n');
    ok(r.failed && /breaks the flow/.test(r.out),
       'and a ::: draw inside ::: cols is refused for the same reason', r.out.split('\n')[0]);
  }
}

// ── the card row's own vocabulary ─────────────────────────────────────
{
  const mk = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cardv-'));
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };
  const one = mk('::: cards 1 {.accent .square}\n- **Key insight**\n:::\n');
  ok(/cards cards-1 [^"]*cg-accent ck-square/.test(one),
     'one card is a legal row, and the accent and square words reach it');
  // A count with no --card-n rule leaves repeat() invalid and the whole
  // grid-template-columns declaration is dropped. It shipped that way for
  // one build: the row parsed, carried its classes, and drew nothing.
  ok(/\.cards-1 \{ --card-n: 1; \}/.test(one),
     'and the count has a rule behind it, or the grid silently has no columns');
  // The accent ground reads var(--emph) for its fill, so redefining --emph
  // in the same block resolved the fill against the *new* value: a
  // paper-coloured card on paper, text and all. currentColor is what the
  // bold fragments use instead.
  const accentBlock = (one.match(/\.cards\.cg-accent > ul > li,[\s\S]{0,400}?\}/) || [''])[0];
  ok(accentBlock && !/--emph:/.test(accentBlock),
     'and the accent ground does not redefine the token its own fill reads');
  const overlayAccent = (one.match(/\.overlay-card\.ov-accent \{[\s\S]{0,400}?\}/) || [''])[0];
  ok(overlayAccent && !/--emph:/.test(overlayAccent),
     'nor does the overlay card, which had the identical defect');
}

// ── what the card feedback pass changed, and why each one is a guard ──
{
  const css = build('').html;
  // A hairline is a print value. On a projector one CSS pixel is at or
  // below what the room can resolve, and the outline read as a rendering
  // fault rather than as a border.
  ok(/\.cards\.cg-outline \{ --card-border: 2px solid/.test(css),
     'the outline ground is 2px, not a hairline');
  // Balance equalises line lengths, so a three-line card came out as three
  // short ragged lines with the column half empty. pretty fills the measure.
  ok(/\.cards li,\s*\n?[^\n]*\.cards > :not\(ul\):not\(ol\) \{ text-wrap: pretty; \}/.test(css)
     || /\.cards li[\s\S]{0,120}?text-wrap: pretty/.test(css),
     'a card item wraps pretty rather than balanced');
  // A card that opens with a bold run has a heading and needs air under it,
  // and the <br> an author may also have written must not double it.
  // Two selectors per rule, and the second is the card that opens with a
  // bleeding picture: there the bold run is the *second* element, so a
  // :first-child rule reached none of it and the <br> drew a visible empty
  // line under every heading.
  ok(/\.cards li > :is\(strong, b\):first-child,\s*\n?\.cards li > :is\(p, figure, img\):first-child \+ :is\(strong, b\) \{ display: block; \}/.test(css),
     'a leading bold run becomes the card heading, after a picture too');
  // The margin is keyed on the break the author typed, not on whether a
  // text node happens to follow - :last-child counts elements, so the old
  // rule gave a card that opened with a nested list a margin with nothing
  // after it to separate from.
  ok(/:is\(strong, b\):first-child:has\(\+ br\)/.test(css),
     'and the air under it needs the hard break, not a following element');
  ok(/:is\(strong, b\):first-child \+ br,[\s\S]{0,140}?display: none/.test(css),
     'and that break is suppressed, or the separation doubles');
  // Measured: a 231px card carried 39.8px of padding a side and left 151px
  // for a word 153.7px wide, so the word overflowed and centred text that
  // overflows shifts - which read as "not centred".
  ok(/\.cards\.cs-large\s+\{ --card-fs: 1\.4;\s+--card-py: 0\.62em;\s+--card-px: 0\.7em; \}/.test(css),
     'large cards carry less padding than small ones, not more');
  // A figure rule elsewhere caps every picture at max-width 100%, which
  // clamped the bleeding image straight back inside its padded box.
  ok(/\.cards li > figure\.figure-img:first-child img[\s\S]{0,400}?max-width: none/.test(css),
     'a bleeding card image lifts the max-width cap that clamped it');
}

// ── the auto size counts an item, not its first line ──────────────────
{
  const mk = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-size-'));
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };
  // A hard break puts the rest of the item on the next line. Counting the
  // marker line alone read this as a row of single words.
  const broken = mk('::: cards 3\n- **Measure**\\\n  what the page does when a crawler asks for it\n- **Probe**\\\n  the detector until it names itself\n:::\n');
  ok(/cs-medium/.test(broken),
     'a continuation line after a hard break counts toward the size');
  // With no box the type is the only thing carrying the structure, so the
  // auto size steps down - and only where the author left it to the tool.
  const clear = mk('::: cards 3 {.clear}\n- The gutter widens to carry the separation\n- Closest to plain prose in columns\n- No box at all\n:::\n');
  ok(/cs-small/.test(clear), 'the clear ground takes the auto size one step down');
  const forced = mk('::: cards 3 {.clear .large}\n- The gutter widens to carry the separation\n:::\n');
  ok(/cs-large/.test(forced), 'but a written size is the author\'s and is left alone');
}

// ── ::: rows is the card row turned ninety degrees ────────────────────
{
  const mk = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-rows-'));
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };
  const rows = mk('::: rows\n- **Separatism** Engineers do the technical work.\n- **Technocracy** Engineers decide.\n:::\n');
  ok(/class="cards rows cards-1/.test(rows), 'a row block is the card container with one column');
  // The body has to be an element or it cannot be placed in column 2: CSS
  // can place a grid item, and an anonymous text run is not one.
  ok(/<strong>Separatism<\/strong><span class="row-body">/.test(rows),
     'and its body is wrapped, or it cannot be put in the second column');
  // With a body attribute this selector outranks .cards.rows, so without
  // the :not() the collapse rule handed a row block the column grid and
  // the term track resolved to 0px with a 78px item in it.
  ok(/body\[data-collapse=topic-bold\] \.cards:not\(\.rows\)/.test(rows),
     'and the collapse rule exempts it, or its term track collapses to nothing');
  // A row's term is a label in a column, not a headline across the slide.
  ok(/cards rows cards-1 cs-medium/.test(rows),
     'a row term is capped at medium however short it is');
  // Every slot has to *do* something on a row or be refused - `anchor` did
  // neither: align-items was `center` unconditionally, so `top` and
  // `middle` rendered identically. The default differs by construct, which
  // is why the written tail decides rather than parseSlotClasses.
  ok(/cards rows [^"]*cv-middle/.test(rows),
     'a row anchors its term to the middle by default');
  const rowsTop = mk('::: rows {.top}\n- **A** one line\n:::\n');
  ok(/cards rows [^"]*cv-top/.test(rowsTop), 'and honours a written top');
  ok(/\.cards\.rows \{[\s\S]{0,600}?align-items: var\(--row-anchor, center\)/.test(rows),
     'and the stylesheet reads it, or the word moves nothing');
  ok(/\.cards\.cv-top\s+\{ --card-anchor: flex-start; --row-anchor: start; \}/.test(rows),
     'through one declaration that serves both constructs');
  // The body is prose beside a card, so it ranges left whatever the row
  // says - `align` keeps meaning one thing rather than two.
  ok(/\.cards\.rows li > \.row-body \{[\s\S]{0,200}?text-align: left/.test(rows),
     'and a centred row centres its term, never its body');
  // A card row is untouched by any of it.
  const plainCards = mk('::: cards 3\n- Alpha\n- Beta\n- Gamma\n:::\n');
  ok(/cards cards-3 [^"]*cv-top/.test(plainCards),
     'while a card row still anchors to the top, which is its own shape');
}

// ── ::: side takes a ratio, and nothing else ──────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-side-'));
  const build2 = (body) => {
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '' };
  };
  const r = build2('::: side 2:1\nleft\n::: flip\nright\n:::\n');
  ok(!r.failed && /--side-a:2fr;--side-b:1fr/.test(r.html),
     'a ratio on ::: side reaches the emitted markup', r.out.split('\n')[0]);
  ok(/grid-template-columns: var\(--side-a, 1fr\) var\(--side-b, 1fr\)/.test(r.html),
     'and the stylesheet reads it, with equal panes as the fallback');
  const plain = build2('::: side\nleft\n::: flip\nright\n:::\n');
  // The *markup*, not the file: the stylesheet names --side-a in its own
  // fallback, so testing the whole document finds it either way.
  ok(!plain.failed && /<div class="side"><div class="side-a">/.test(plain.html),
     'a bare ::: side emits no ratio at all, so it is unchanged');
  const bad = build2('::: side wide\nleft\n::: flip\nright\n:::\n');
  ok(bad.failed && /takes an optional ratio/.test(bad.out),
     'and anything else after the word is refused rather than dropped');
}

// ── covers and the closing slide ──────────────────────────────────────
// The cover family had no test at all until this block, which is how an
// accent rail nobody could defend survived every revision of the docs that
// described it. These do not judge a composition - a stylesheet is not the
// kind of thing an assertion can like - they hold the three things a
// redesign can silently break: the vocabulary gate, which composition
// reached the markup, and the two colour rules that have each already
// shipped an element nobody could see.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cover-'));
  const cover = (fm, body) => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\nsubtitle: S\npresenter: P\ninfo: |\n  L\n' + fm + '---\n\n' +
      '## title: {#title}\n\n## free: F {#f}\n\nBody.\n' + (body || ''));
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  };

  // Every name in the vocabulary builds, and reaches the markup as the
  // attribute the stylesheet keys on. A variant whose rules were deleted
  // but whose name stayed in the list would build clean and draw nothing.
  for (const v of ['classic', 'masthead', 'stack', 'display', 'panel']) {
    const r = cover('cover: ' + v + '\n');
    ok(!r.failed && r.html.includes('data-cover="' + v + '"'),
       'cover: ' + v + ' builds and reaches the markup', r.out.split('\n')[0]);
    ok(v === 'classic' || new RegExp('\\[data-cover=' + v + '\\]').test(r.html),
       'and the stylesheet carries rules for it');
  }

  const cls = cover('cover: classic\n');
  // The removed variant is refused rather than quietly falling back, and
  // the refusal names what to write instead of it.
  const gone = cover('cover: editorial\n');
  ok(gone.failed && /is not a cover this tool draws/.test(gone.out),
     'the deleted editorial cover is refused, not silently ignored');
  ok(/masthead/.test(gone.out) && /panel/.test(gone.out),
     'and the refusal lists the covers that took its place');
  // The rail itself, in case anyone reaches for it again by hand.
  ok(!/border-left: 4px solid var\(--emph\)/.test(cls.html),
     'no cover draws an accent rail beside the type');

  // panel is the one cover that paints a field, and both halves of it have
  // a history. A single mix towards the ink made a full-bleed acid plate in
  // the two terminal themes, where the ink is the bright end; and
  // redefining --emph inside a block whose own fill reads --emph is what
  // made an accent card invisible twice before this file existed.
  const pan = cover('cover: panel\n');
  ok(/body\[data-mode=dark\] \.chunk\[data-cover=panel\]/.test(pan.html),
     'panel derives its field per mode, so a dark deck is not handed a light plate');
  ok(/--panel-field: color-mix\(in oklab/.test(pan.html),
     'and mixes in oklab, so a warm accent over a blue paper does not travel through magenta');
  const panBlock = (pan.html.match(/\.chunk\[data-cover=panel\] \{[^}]*\}/) || [''])[0];
  ok(panBlock && !/--emph:/.test(panBlock) && !/--ink:/.test(panBlock),
     'and redefines neither --emph nor --ink in the block whose field reads them', panBlock);

  // above is the one composition whose height has to be definite: with only
  // a min-height the percentage row fell back to auto, the art took its
  // intrinsic size, and the title ran off the bottom of the slide.
  ok(/\.chunk\[data-cover=above\] \{[^}]*height: var\(--slide-h\)/.test(cls.html),
     'the above cover pins a definite height, or its percentage row resolves to auto');

  // ── the closing slide ──
  const clo = cover('cover: panel\n',
    '\n## closing: Questions? | see you Thursday {#end}\n\nOffice hours 14 to 16.\n');
  ok(!clo.failed && /data-tag="closing"[^>]*data-cover="panel"[^>]*data-closing/.test(clo.html),
     'a closing chunk draws the deck own cover composition', clo.out.split('\n')[0]);
  ok(/<h1 class="title-main">Questions\?<\/h1>/.test(clo.html),
     'and renders its own heading, where a title chunk ignores one');
  ok(/<p class="title-subtitle">see you Thursday<\/p>/.test(clo.html),
     'and its sub-heading as the second line');
  ok(/<div class="closing-body"><p>Office hours 14 to 16\./.test(clo.html),
     'and its body, which on a cover would have replaced the info block');
  // The whole reason the tag exists: the same shape, not the same slide.
  const article = (clo.html.match(/<article[^>]*data-closing[\s\S]*?<\/article>/) || [''])[0];
  ok(article && !/title-presenter/.test(article) && !/title-info/.test(article),
     'and carries neither the presenter line nor the info block');
  ok(/\.chunk\[data-cover=panel\]\[data-closing\] \.closing-body/.test(clo.html) &&
     /\.chunk-title\[data-cover=panel\]\[data-closing\] \.closing-body/.test(clo.print),
     'the reversed closing body wins by specificity in both stylesheets, not by source order');
  // The picture is the cover's, and re-running it is the repeat this slide
  // exists not to be.
  const cloPic = cover('cover: hero\ncover-image: https://example.invalid/p.jpg\n',
    '\n## closing: Fin {#end}\n');
  ok(!cloPic.failed && !/data-closing[^>]*data-has-backdrop/.test(cloPic.html),
     'and takes no picture from cover-image', cloPic.out.split('\n')[0]);

  // ── masthead's field and folio rule ──
  // The composition is two bands with the slide's height between them, and
  // with a short title nothing on it spanned the measure - which is what
  // read as empty. The rule is the fix and it is load-bearing, so it is
  // asserted on the element that carries it rather than as "some border
  // exists somewhere".
  ok(/\.chunk\[data-cover=masthead\] \.title-presenter \{[^}]*border-top: 2px solid var\(--rule\)/
       .test(cls.html),
     'masthead bounds its credits band with a folio rule across the measure');
  ok(/\.chunk\[data-cover=masthead\] \.title-info \{[^}]*justify-content: space-between/
       .test(cls.html),
     'and lays the credits out as a row that reaches both edges');
  // The lede. Its whole point is that info: survives it, which is the rule
  // every other cover breaks - a chunk body normally replaces the meta.
  const mastLede = cover('cover: masthead\n', '');
  ok(!mastLede.failed && !/class="title-field"/.test(mastLede.html),
     'a masthead with no body draws no field');
  ok(/:not\(:has\(\.title-field\)\) \.title-main/.test(mastLede.html),
     'and sets a larger nameplate when the field is empty');
  const mastBody = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\nsubtitle: S\npresenter: P\ninfo: |\n  Lline\ncover: masthead\n---\n\n' +
      '## title: {#title}\n\nThe lede.\n\n## free: F {#f}\n\nBody.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '' };
  })();
  ok(!mastBody.failed && /class="title-field"><p>The lede\.<\/p>/.test(mastBody.html),
     'a masthead body becomes the lede in the field', mastBody.out.split('\n')[0]);
  ok(/class="title-info"><p>Lline<\/p>/.test(mastBody.html),
     'and info: still supplies the meta, which a body elsewhere would have replaced');

  // ── cover-align ──
  // The mechanism is align-self on the content plus justify-content, and
  // NOT align-items on the chunk: half these covers put a picture in a
  // second grid track, and align-items is per-item, so moving the type that
  // way collapses the picture to nothing. That is the guard worth holding.
  const alBottom = cover('cover: stack\ncover-align: bottom\n');
  ok(!alBottom.failed && /data-cover-align="bottom"/.test(alBottom.html),
     'cover-align reaches the markup', alBottom.out.split('\n')[0]);
  ok(/\.chunk\[data-cover-align\] \.chunk-content \{ align-self: stretch/.test(alBottom.html),
     'and stretches the content, or justify-content has no slack to distribute');
  ok(!/\.chunk\[data-cover-align[^{]*\{[^}]*align-items:/.test(alBottom.html),
     'and never sets align-items on the chunk, which would collapse a picture track');
  const alBad = cover('cover: stack\ncover-align: sideways\n');
  ok(alBad.failed && /is not a place on the vertical/.test(alBad.out),
     'an unknown place is refused rather than ignored');
  const alWrong = cover('cover: display\ncover-align: bottom\n');
  ok(alWrong.failed && /places its type itself/.test(alWrong.out),
     'and a cover that places its own type refuses the key, like cover-ratio');
  // The closing slide takes it, unlike the ratio: the placement is what the
  // bookend has to match, and a cover in the lower third closed by a centred
  // last slide has not closed the arc it opened.
  const alClo = cover('cover: stack\ncover-align: bottom\n', '\n## closing: Fin {#end}\n');
  ok(/data-tag="closing"[^>]*data-cover-align="bottom"/.test(alClo.html),
     'and the closing slide inherits the placement');

  // ── section: outline ──
  // The one divider that needs the *other* columns. Everything else on a
  // divider is a function of its own heading.
  const outl = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\nsection: outline\n---\n\n## title: {#title}\n\n' +
      '# One {#o}\n\n## free: A {#a}\n\nX.\n\n' +
      '# Two {#t}\n\n## free: B {#b}\n\nX.\n\n' +
      '# Three {#h}\n\n## free: C {#c}\n\nX.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  })();
  ok(!outl.failed, 'section: outline builds', outl.out.split('\n')[0]);
  const divs = outl.html.match(/<article class="chunk chunk-section"[\s\S]*?<\/article>/g) || [];
  ok(divs.length === 3, 'one divider per headed column, ' + divs.length);
  // Every divider lists every part - that is what makes it a running agenda
  // rather than three unrelated slides - and each names a different one live.
  ok(divs.every(d => (d.match(/<li data-state=/g) || []).length === 3),
     'and every one of them lists all three parts');
  ok(divs.map(d => (d.match(/data-state="now"[^>]*><span class="so-num">(\d)/) || [])[1])
       .join('') === '123',
     'with the live item walking down the list');
  ok(/data-state="done"/.test(divs[2]) && /data-state="next"/.test(divs[0]),
     'and parts behind and ahead marked as such');
  // The heading is the live item, not a second copy of it beside the list.
  ok(!/section-heading/.test(divs[1]),
     'the outline replaces the heading rather than repeating it');
  // Print ignores every divider variant - that is what makes the family
  // cheap, and an outline leaking into the document would be a table of
  // contents printed three times.
  // The markup, not the string: PRINT_CSS carries .section-outline rules for
  // the `outline:` chunk, which does print - a divider is what does not.
  ok(!/<ol class="section-outline">/.test(outl.print),
     'and print carries no divider outline, like every other divider variant');

  // ── backdrop reveal, the over layer, and an overlay held to a beat ──
  const mask = (body) => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\n---\n\n## title: {#title}\n\n## figure: {.full #m}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  };
  const PIC = 'https://example.invalid/p.jpg';
  const rev = mask('::: backdrop ' + PIC + ' {cover clear} reveal full, right 52%\n');
  ok(!rev.failed, 'a backdrop reveal builds', rev.out.split('\n')[0]);
  // The frames are places, and the second one has to be the *window* the
  // author asked for: right 52% is a left inset of 48, not a width of 52.
  ok(/data-bd-frames="\[&quot;inset\(0\)&quot;,&quot;inset\(0 0 0 48%\)&quot;\]"/.test(rev.html),
     'and each place becomes the inset that leaves exactly that band showing');
  // The inline clip is frame 0, not the last: the first paint has to be the
  // opening beat or the slide flashes its ending before the runtime boots.
  ok(/clip-path:inset\(0\)"/.test(rev.html),
     'and the inline clip is the opening beat');
  // clip-path and not width/inset: cover is resolved against the whole
  // slide, so the picture must not move while its window opens.
  ok(/\.chunk-backdrop\[data-bd-frames\] \{\s*transition: clip-path/.test(rev.html),
     'the reveal animates the window, never the picture');
  ok(/prefers-reduced-motion[^}]*\}[\s\S]{0,120}\.chunk-backdrop\[data-bd-frames\] \{ transition: none/
       .test(rev.html) || /@media \(prefers-reduced-motion: reduce\) \{\s*\.chunk-backdrop\[data-bd-frames\]/
       .test(rev.html),
     'and it stands still for a reader who asked for no motion');
  // One place is a static crop written the long way round.
  const revOne = mask('::: backdrop ' + PIC + ' reveal full\n');
  ok(revOne.failed && /needs at least two places/.test(revOne.out),
     'one place is refused – there is nothing to reveal');
  const revBad = mask('::: backdrop ' + PIC + ' reveal full, sideways 40%\n');
  ok(revBad.failed && /is not a place on the slide/.test(revBad.out),
     'and an unknown place names the words that work');
  const revPct = mask('::: backdrop ' + PIC + ' reveal full, right 3%\n');
  ok(revPct.failed && /between 5 and 95/.test(revPct.out),
     'and a percentage outside the band is refused rather than clamped');
  // The ladder: backdrop 0, content 1, an over-layer picture 2, overlays 3.
  // Read all four or none - a picture that covers the type must still leave
  // an ::: overlay standing on top of it.
  const over = mask('::: backdrop ' + PIC + ' {cover clear over} reveal right 45%, full\n');
  ok(/class="chunk-backdrop[^"]*bd-over/.test(over.html),
     'the over layer reaches the markup');
  ok(/\.chunk-backdrop\.bd-over \{ z-index: 2; \}/.test(over.html)
     && /\.overlay-layer \{[^}]*z-index: 3/.test(over.html),
     'and sits above the type but below the overlay layer');
  // An overlay held to a beat.
  const ovf = mask('::: overlay {left clear} from 1\n# Later\n:::\n');
  ok(!ovf.failed && /class="overlay-card[^"]*" data-from="1"/.test(ovf.html),
     'an overlay can be held to a beat', ovf.out.split('\n')[0]);
  // A heading inside a captured block is content. Left unguarded this opened
  // a *column*, the overlay came out empty, and nothing said so.
  ok(/data-from="1"><h1>Later<\/h1>/.test(ovf.html),
     'and a heading written inside it stays inside it');
  ok(!/section-heading">Later/.test(ovf.html),
     'rather than opening a column of its own');
  // It fades, where a reveal segment vanishes: nothing moves when an overlay
  // arrives, so display:none would be an instant appearance over a picture.
  ok(/\.overlay-card\[data-hidden\] \{[^}]*visibility: hidden/.test(ovf.html),
     'a held overlay keeps its cell and fades');
  // Print has no runtime and no beats, so it shows the finished slide.
  ok(/data-from="1"/.test(ovf.print) && !/\[data-hidden\]/.test(ovf.print.split('.overlay-card')[0] || ''),
     'and print shows it, having no beats to hold it back');

  // ── the outline chunk ──
  const oc = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\n---\n\n## title: {#title}\n\n## outline: Plan {#ag}\n\n' +
      '# One {#o}\n\n## free: A {#a}\n\nX.\n\n## outline: Here {#mid}\n\n' +
      '# Two {#t}\n\n## free: B {#b}\n\nX.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  })();
  ok(!oc.failed, 'an outline: chunk builds', oc.out.split('\n')[0]);
  // Before the first part nothing is live, and that is not "everything
  // recedes" - a list nobody has started is a plan, read at full strength.
  const agenda = (oc.html.match(/id="ag"[\s\S]*?<\/article>/) || [''])[0];
  ok((agenda.match(/data-state="all"/g) || []).length === 2,
     'an agenda before the first part marks every item as a plan');
  const mid = (oc.html.match(/id="mid"[\s\S]*?<\/article>/) || [''])[0];
  ok(/data-state="now"[^>]*><span class="so-num">1</.test(mid),
     'and one inside a part marks that part live');
  // Unlike a divider it prints: it is a slide the author wrote.
  ok(/<ol class="section-outline">/.test(oc.print),
     'an outline chunk prints, unlike the divider that draws the same list');

  // ── a divider's own content ──
  const dv = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\n---\n\n## title: {#title}\n\n' +
      '# One {#o}\n\n> A claim worth opening on.\n\n## free: A {#a}\n\nX.\n\n' +
      '# Two {#t}\n\n::: backdrop ' + PIC + ' {cover invert}\n\n## free: B {#b}\n\nX.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  })();
  ok(!dv.failed, 'a divider carries its own content', dv.out.split('\n')[0]);
  // The lines under a column heading used to be dropped without a word.
  ok(/class="section-body"><blockquote>/.test(dv.html),
     'the words under a column heading reach the divider slide');
  ok(/chunk-section[^>]*data-has-backdrop[^>]*data-backdrop="invert"/.test(dv.html),
     'and a ::: backdrop there is the picture the part opens on');
  // They are the author's words, so they print - the divider itself never has.
  ok(/class="column-lede"><blockquote>/.test(dv.print),
     'and both reach the document, where the divider slide does not');
  ok(!/chunk-section/.test(dv.print),
     'because print renders the column heading, not the camera stop');

  // ── cover: quote ──
  const qt = cover('cover: quote\n', '');
  ok(qt.failed && /has no body/.test(qt.out),
     'a quote cover with no quotation is refused');
  const qt2 = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\npresenter: P\ncover: quote\n---\n\n' +
      '## title: {#title}\n\nThe claim.\n\n## free: F {#f}\n\nBody.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '' };
  })();
  ok(!qt2.failed && /data-cover="quote"/.test(qt2.html), 'and one with a quotation builds',
     qt2.out.split('\n')[0]);
  // Source order, not CSS order: the claim is the slide and the title is the
  // attribution under it.
  ok(qt2.html.indexOf('class="title-field"') < qt2.html.indexOf('class="title-main"'),
     'the claim comes before the title, in the document and not only on screen');
  // No quotation mark, in any of the three ways one gets added.
  const qBlock = (qt2.html.match(/\.chunk\[data-cover=quote\][\s\S]*?\/\* split/) || [''])[0];
  ok(!/content: *['"\\]/.test(qBlock) && !/\\201C|&ldquo;|&#8220;/.test(qBlock),
     'and the composition adds no quotation mark, glyph or rule');

  // ── a heading that is the document's and not the slide's ──
  // Leaving the heading text out gives up the TOC entry, the search text and
  // the printed heading too. `.bare` gives up only the slide.
  const bare = (() => {
    fs.writeFileSync(path.join(dir, 'source.md'),
      '---\ntitle: T\n---\n\n## title: {#title}\n\n' +
      '## figure: How a crawl is scored {.full #loop .bare}\n\nBody.\n');
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return { failed: r.status !== 0, out: (r.stdout || '') + (r.stderr || ''),
             html: r.status === 0 ? fs.readFileSync(path.join(dir, 'audience.html'), 'utf8') : '',
             print: r.status === 0 ? fs.readFileSync(path.join(dir, 'print.html'), 'utf8') : '' };
  })();
  ok(!bare.failed && /data-bare=""/.test(bare.html), '.bare reaches the markup',
     bare.out.split('\n')[0]);
  // The heading stays in the DOM, hidden. Dropping the element instead would
  // take it out of search and out of the speaker's own lists, which read it
  // from there.
  ok(/<h2 class="chunk-heading">How a crawl is scored<\/h2>/.test(bare.html),
     'and the heading text is still in the live DOM, for search to find');
  ok(/\.chunk\[data-bare\] > \.chunk-content > \.chunk-heading[^{]*\{ display: none/.test(bare.html),
     'hidden by a rule rather than by being left out');
  // Print is a document: it has no slide to take the heading off.
  ok(/<h2 class="chunk-heading">How a crawl is scored<\/h2>/.test(bare.print)
     && !/data-bare/.test(bare.print),
     'and the printed document is untouched');
  // The deck-wide switch lives in the same key as the alignment, because the
  // two are one question: what the projection does with a heading.
  const hOff = cover('style:\n  headings: off\n');
  ok(!hOff.failed && /data-headings="off"/.test(hOff.html),
     'style.headings: off reaches the body attribute', hOff.out.split('\n')[0]);
  ok(/body\[data-headings=off\] \.chunk-heading \{ display: none/.test(hOff.html)
     && !/data-headings=off/.test(hOff.print),
     'and hides headings on the projection only');
  const hBad = cover('style:\n  headings: gone\n');
  ok(hBad.failed, 'an unknown value for the key is still refused');

  // ── things that were painting over each other ──
  // A backdrop belongs to its own slide. Neighbours are dimmed to 4%, which
  // is invisible for a paragraph and a visible grey band for a photograph.
  ok(/\.chunk:not\(\.active\) \.chunk-backdrop \{ opacity: 0; \}/.test(cls.html),
     'a backdrop is not painted on any slide but its own');
  // The annotation affordance sits in the slide's gutter, as a sibling of the
  // content box - as a child it was positioned against the measure and had
  // nowhere to go but on top of the words.
  ok(/<\/div>\s*<button class="annot-add"/.test(cls.html),
     'the + note affordance is outside the content box');
  ok(!/\.annot-add \{[^}]*right: calc\(100%/.test(cls.html),
     'and is no longer positioned against the measure');
  // The outline's measure is capped per row, not on the list: an em on the
  // <ol> is the small rows' em and 1.6x too tight for the live one.
  ok(/\.so-text \{ max-width: 26em; \}/.test(cls.html)
     && !/\.section-outline \{[^}]*max-width/.test(cls.html),
     'the outline caps each row in its own type size');
  // A divider whose body is nothing but a figure lays it beside the heading.
  ok(/\.chunk-section \.chunk-content:has\(> \.section-body > figure:only-child\)/.test(cls.html),
     'a divider with a lone figure lays it beside the heading, not under it');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map(f => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
