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
 * The same failure has since moved from the name into the shape, and this
 * paragraph is the standing note about it. The file writes "put a source in
 * a temp dir, spawn build.js, read what came out" about a dozen times over:
 * four identical mk()s, refuses(), build2(), cover(), mask(), a row of
 * anonymous IIFEs, and then raw(), which is the general one and could have
 * written every one of the others. Consolidating gains no assertion and
 * loses none, which is why it has not been done - but a file with a dozen
 * ways to do one thing is a file people add a thirteenth to, which is
 * exactly what the rename was trying to prevent.
 *
 * So: write anything new with raw() and lintOf(), never a new helper. And if
 * you are here to extend this file substantially rather than to add one
 * assertion, consolidate downwards onto those two first - that is the moment
 * it is worth paying for, and no earlier.
 *
 * The settings that reproduce the 1.0.0 layout, and the reason they exist.
 *
 * From 1.0.0 the source format is the interface, and a lecture that laid out
 * a certain way should be able to lay out that way again. Exactly four
 * things have moved since 1.0.0 that a finished deck would notice, found by
 * diffing AUDIENCE_CSS and PRINT_CSS between the v1.0.0 tag and HEAD rather
 * than by reading commit titles:
 *
 *   1. the bundled sans           -> `fonts: {sans: Inter Tight}`
 *   2. text-wrap balance/pretty   -> `style: {wrap: none}`
 *   3. code ligatures             -> `ligatures: all`
 *   4. the look of a bold phrase  -> `style: {bold: accent-bold,
 *                                            print-bold: accent-bold}`
 *
 * There was a `layout: 1.0` umbrella over those three and it was removed.
 * One key naming a version reads as a promise that the engine can rebuild
 * any past release, and that promise is unbounded: every later change to a
 * shared stylesheet would have to be gated on a generation, the gates would
 * compose, and the set of untested combinations would grow with every
 * release. It also put the burden in the wrong place - an author would have
 * had to know which version their deck was authored against, and the project
 * would have had to publish a layout-version history beside the software
 * version. The settings give the same reachability and each is a
 * preference an author might want on its own merits, so the 1.0.0 look is a
 * short recipe rather than a mechanism.
 *
 * The recipe was verified once against the real thing, when it had three
 * lines: the same source built through `git show v1.0.0:build.js` and
 * through HEAD with all three set came out **pixel-identical**, 0 differing
 * pixels by `magick compare -metric AE` at 1440x810 deviceScaleFactor 2.
 * The fourth setting came later and was not re-measured; its one known
 * departure is that a promoted bullet under `accent-bold` now weighs the
 * deck's bold weight, which in a sans deck is 600 where 1.0.0 had a fixed
 * 500. That comparison cannot be a standing
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

// ── the four together are the 1.0.0 recipe ───────────────────────────
{
  const { html, print, log } = build('ligatures: all\nfonts:\n  sans: Inter Tight\nstyle:\n  wrap: none\n  bold: accent-bold\n  print-bold: accent-bold');
  const body = bodyTag(html);
  ok(/data-wrap="none"/.test(body), 'the recipe turns the text-wrap balancing off', body);
  ok(/data-bold="accent-bold"/.test(body), 'and gives a bold phrase its old accent and weight on the slide', body);
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
  ok(/data-print-bold="accent-bold"/.test(printBody),
     'bold phrases on paper included', printBody);
}

// ── the four are independently reachable ────────────────────────────
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

// ── PNG and JPEG go into the output as WebP, and the file is untouched ─
// The win is larger than the base64 overhead it pays for: a data: URI is a
// third bigger than the bytes it carries, and WebP q92 is a fraction of a
// PNG. What makes it safe as a default is the second assertion: the asset on
// disk is byte-identical afterwards, so nothing an author wrote is rewritten.
// Skipped where no encoder is on PATH, which is also how the build behaves.
{
  const hasEncoder = ['cwebp', 'magick'].some((bin) => {
    const r = spawnSync(bin, ['-version'], { stdio: 'ignore' });
    return !r.error;
  });
  if (!hasEncoder) {
    console.log('  · no cwebp or magick on PATH, so the WebP inlining case is skipped');
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-webp-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    // Photographic rather than flat: a small flat PNG can come out larger as
    // WebP, and the build then keeps the original on purpose. Noise is what
    // PNG is worst at and is the case the default exists for.
    const png = path.join(dir, 'assets', 'photo.png');
    const gen = spawnSync('magick', ['-size', '600x400', 'gradient:navy-orange',
      '-attenuate', '2', '+noise', 'Gaussian', png], { encoding: 'utf8' });
    if (gen.error || !fs.existsSync(png)) {
      console.log('  · could not generate a fixture image, so the WebP case is skipped');
    } else {
      const before = fs.readFileSync(png);
      fs.writeFileSync(path.join(dir, 'source.md'),
        '---\ntitle: T\n---\n\n## figure: F {#f}\n\n![A photograph](photo)\n');
      const run = (extra) => spawnSync(process.execPath,
        [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only',
         '--inline-images', ...extra], { cwd: ROOT, encoding: 'utf8' });

      const r = run([]);
      ok(r.status === 0, 'a deck with a PNG builds', (r.stdout || '') + (r.stderr || ''));
      if (r.status === 0) {
        const out = fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
        ok(/data:image\/webp;base64,/.test(out),
           'the PNG reaches the output as a WebP data URI');
        ok(!/data:image\/png;base64,/.test(out),
           'and not as a PNG one as well');
        ok(Buffer.compare(before, fs.readFileSync(png)) === 0,
           'and the file on disk is byte-identical - this never rewrites an asset');

        const off = run(['--no-optimize-images']);
        const outOff = fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
        ok(off.status === 0 && /data:image\/png;base64,/.test(outOff),
           '--no-optimize-images puts the original bytes in instead');
        ok(out.length < outOff.length,
           'and the transcoded output is the smaller of the two',
           `${out.length} vs ${outOff.length}`);
      }
    }
  }
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
    ['footnote',   '::: footnote\n' + CARDS + ':::\n'],
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
  // A card opened with a hard break has a heading, and it needs air under
  // it. The stylesheet no longer decides which of the two forms it is
  // looking at - markCardLeads does, and puts the answer on the run - so
  // the rule is one selector and reaches the bold wherever it sits,
  // including the card that bleeds a picture and has it second.
  ok(/\.cards li \.card-lead \{ display: block; margin-bottom: 0\.45em; \}/.test(css),
     'a marked lead-in is the card heading, and carries the air under it');
  ok(/\.cards li \.card-lead \+ br \{ display: none; \}/.test(css),
     'and the break the author typed is suppressed, or the separation doubles');
  ok(!/:is\(strong, b\):first-child:has\(\+ br\)/.test(css),
     'and no rule guesses the form from a <br> any more');
  // The card itself is a block box, not a flex column. A flex container
  // blockifies every child, so the bold at the head of a run-in card was a
  // flex item and the sentence after it an anonymous one - the run-in form
  // could not exist while this said flex, whatever the rule above said.
  ok(/\.cards > ul > li,[\s\S]{0,2400}?\n  display: block;\n  align-content: var\(--card-anchor, flex-start\);/.test(css),
     'a card anchors its content with align-content, so a run-in stays inline');
  // Measured: a 231px card carried 39.8px of padding a side and left 151px
  // for a word 153.7px wide, so the word overflowed and centred text that
  // overflows shifts - which read as "not centred".
  ok(/\.cards\.cs-large\s+\{ --card-fs: 1\.4;\s+--card-py: 0\.62em;\s+--card-px: 0\.7em; \}/.test(css),
     'large cards carry less padding than small ones, not more');
  // A figure rule elsewhere caps every picture at max-width 100%, which
  // clamped the bleeding image straight back inside its padded box.
  ok(/\.cards li > figure\.figure-img:first-child img[\s\S]{0,400}?max-width: none/.test(css),
     'a bleeding card image lifts the max-width cap that clamped it');
  // The accent ground reverses the ink, and the reversal has to land on
  // whatever the fill is painted on. A row's li is display: contents and
  // spans both columns while only the term carries the fill, so ink
  // declared on the li inherited into the body beside the card and painted
  // it in the page colour on the page - laid out correctly and invisible.
  const inkBlock = (css.match(/\.cards:not\(\.rows\)\.cg-accent > ul > li,[\s\S]{0,500}?\}/) || [''])[0];
  ok(/\.cards\.rows\.cg-accent li > :is\(strong, b\):first-child/.test(inkBlock)
     && /color: var\(--paper\)/.test(inkBlock),
     'the accent ground reverses the ink on the card, and on a row only on its term');
  ok(/\.cards\.cg-accent > ul > li,[\s\S]{0,200}?--card-bg: var\(--emph\);\n\}/.test(css),
     'while the fill itself still rides on the item, where the term inherits it');
}

// ── the two ways to open a card, decided in the renderer ──────────────
// The stylesheet cannot answer this one. It used to try, and got it wrong
// in both directions: every leading bold was forced to a block, so the
// run-in form the tutorial documents did not exist, and the air under a
// heading was keyed on :has(+ br), which is what the author typed rather
// than what the author meant. markCardLeads reads the hard break out of the
// source and marks the run, so the markup carries the answer.
{
  const mk = (body, extra) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-lead-'));
    if (extra) for (const [name, buf] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), buf);
    fs.writeFileSync(path.join(dir, 'source.md'), '---\ntitle: T\n---\n\n## free: F {#f}\n\n' + body);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };
  const WORDS = 'the same words in both of these cards, so only the opening differs';

  const runIn = mk(`::: cards 2\n- **Alpha** ${WORDS}\n- **Beta** ${WORDS}\n:::\n`);
  ok(/<li><strong>Alpha<\/strong> the same words/.test(runIn),
     'a bold on the same line as its text stays an ordinary bold run');
  ok(!/card-lead">Alpha/.test(runIn), 'and is not marked as a heading');

  const broken = mk(`::: cards 2\n- **Alpha**\\\n  ${WORDS}\n- **Beta**\\\n  ${WORDS}\n:::\n`);
  ok(/<li><strong class="card-lead">Alpha<\/strong><br>/.test(broken),
     'a bold before a backslash break is marked, and keeps the break');
  // Two trailing spaces are the other hard break, and mean the same thing.
  const spaced = mk(`::: cards 2\n- **Alpha**  \n  ${WORDS}\n- **Beta**  \n  ${WORDS}\n:::\n`);
  ok(/<strong class="card-lead">Alpha<\/strong><br>/.test(spaced),
     'and so is a bold before two trailing spaces, which is the same break');

  // A bold that is the whole card is the callout, and a bold over a nested
  // list is a headline over its own detail. Neither is a lead-in with text
  // under it, and neither carries a break, so neither is marked.
  const callout = mk('::: cards 2\n- **Alpha**\n- **Beta**\n:::\n');
  ok(!/class="card-lead"/.test(callout),
     'a bold that is the whole card is a callout, not a heading');
  const nested = mk('::: cards 2\n- **Alpha**\n  - one\n  - two\n- **Beta**\n  - three\n:::\n');
  ok(!/class="card-lead"/.test(nested),
     'nor is a bold standing over its own nested level');

  // The card that bleeds a picture has its lead-in on the line *under* the
  // image, which is exactly the case the two position-dependent selectors
  // this replaces existed to reach. A class reaches it with no second rule.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64');
  const bleeding = mk(`::: cards 2\n- ![](pic.png)\n  **Alpha**\\\n  ${WORDS}\n- ![](pic.png)\n  **Beta**\\\n  ${WORDS}\n:::\n`,
    { 'pic.png': PNG });
  ok(/<strong class="card-lead">Alpha<\/strong>/.test(bleeding),
     'a card that opens with a picture still has its lead-in marked, one line down');

  // A row's term is already an element in its own column, so the question
  // does not arise there and the markup must not answer it.
  const rows = mk(`::: rows\n- **Alpha** ${WORDS}\n- **Beta**\\\n  ${WORDS}\n:::\n`);
  ok(!/class="card-lead"/.test(rows),
     'a row term is not a lead-in, and is left alone');
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
  // What reduced motion does here is asserted where it was decided – in the
  // review block below, against the exact rule (`transition: opacity 260ms
  // ease`). The version that stood here looked for `transition: none`, which
  // is the rule that was *removed* for taking the slide crossfade away with
  // the picture's opening, and passed only through a fallback alternative
  // that asked whether any rule at all was in the block.
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
  ok(!/class="[^"]*chunk-section/.test(dv.print),
     'because print renders the column heading, not the camera stop');

  // ── cover: quote ──
  // That a quote cover with no quotation is refused is asserted in the review
  // block below, on the same source under `noClaim`, and more strictly: there
  // it is refused by `--print-only` as well, and the failed build is checked
  // to have left no half-written file. This is the same build.
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

  // ── the ten a review found, each phrased as the failure that was there ──
  // A helper that writes a whole source and reports what was left on disk,
  // because two of these are about artefacts a failed build must not leave.
  const raw = (src, args = []) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-rv-'));
    fs.mkdirSync(path.join(d, 'assets'));
    // A one-pixel PNG: these checks are about where a picture lands, not
    // what it is, so the asset is written rather than copied from a lecture
    // whose files are free to move.
    fs.writeFileSync(path.join(d, 'assets/pic.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'));
    fs.writeFileSync(path.join(d, 'source.md'), src);
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(d, 'source.md'), ...args],
      { cwd: ROOT, encoding: 'utf8' });
    const read = (n) => { try { return fs.readFileSync(path.join(d, n), 'utf8'); } catch { return null; } };
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), dir: d,
             files: fs.readdirSync(d).filter(f => f.endsWith('.html')),
             html: read('audience.html'), print: read('print.html'), notes: read('print-notes.html') };
  };
  const lintOf = (src) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-rl-'));
    fs.writeFileSync(path.join(d, 'source.md'), src);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lint.js'), path.join(d, 'source.md')],
      { cwd: ROOT, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  };
  const FM = '---\ntitle: T\n---\n\n## title: {#title}\n\n';

  // 1 · colsDepth outlived the chunk that opened it, so one unclosed
  // `::: cols` made every later ::: draw in the lecture a hard failure
  // naming a chunk that contained no columns.
  const leak = raw(FM + '## free: A {#a}\n\n::: cols 2\n\nProse.\n\n'
    + '## figure: Later {#b}\n\n::: draw\nbox one "One"\nbox two "Two" right of one gap 1\n:::\n',
    ['--audience-only']);
  ok(leak.code === 0 && !/draw inside/.test(leak.out),
     'an unclosed ::: cols does not poison a later ::: draw', leak.out.split('\n')[0]);
  ok(/unclosed-directive/.test(lintOf(FM + '## free: A {#a}\n\n::: cols 2\n\nProse.\n')),
     'and the linter still names the directive that was left open');

  // 2 · the quote cover's refusal lived in a renderer, so --print-only
  // accepted an invalid deck and a full build wrote two files before throwing.
  const noClaim = '---\ntitle: T\ncover: quote\n---\n\n## title: {#title}\n\n## free: F {#f}\n\nBody.\n';
  const po = raw(noClaim, ['--print-only']);
  ok(po.code !== 0 && /has no body/.test(po.out),
     'a quote cover with no quotation is refused by --print-only too');
  const full = raw(noClaim);
  ok(full.code !== 0 && full.files.length === 0,
     'and the failed build leaves no half-written artefact, ' + full.files.join(','));

  // 3 · the divider's backdrop was emitted inside a <section class="column">
  // while every print rule was scoped .chunk, so it painted nothing.
  const divBd = raw(FM + '# One {#o}\n\n::: backdrop pic\n\n## free: A {#a}\n\nX.\n');
  ok(divBd.code === 0 && /:is\(\.chunk, \.column\) > \.chunk-backdrop \{/.test(divBd.print),
     'a divider backdrop is styled in print, not only a chunk one', divBd.out.split('\n')[0]);

  // 4 · an outline chunk went through a shell of its own and dropped five
  // things the ordinary path reads.
  const rvOc = raw(FM + '## outline: Plan {#ag}\n\n> note: Reaches the notes.\n\n'
    + '::: backdrop pic\n\n# One {#o}\n\n## free: A {#a}\n\nX.\n');
  const rvOcArt = (rvOc.html.match(/<article class="chunk chunk-outline[\s\S]*?<\/article>/) || [''])[0];
  ok(/Reaches the notes/.test(rvOc.notes), 'an outline chunk keeps its speaker notes');
  ok(/chunk-backdrop/.test(rvOcArt), 'and its backdrop');
  ok(/annot-box/.test(rvOcArt), 'and its annotation box');
  ok(/<ol class="section-outline">/.test(rvOcArt), 'and still draws the list');

  // 7 · the renderer's `wide` fallback could never fire, because the parser
  // always supplied a width.
  ok(/<article class="chunk chunk-outline[^>]*data-width="wide"/.test(rvOc.html),
     'and is wide, which the unreachable fallback only claimed');

  // 5 · the reveal is live-only, but its clip and payload rode into print and
  // cropped the banner band with a slide-sized geometry.
  const rvRev = raw(FM + '## figure: F {.full #c}\n\n'
    + '::: backdrop pic {cover clear} reveal right 45%, full\n\nText.\n');
  ok(!/clip-path/.test(rvRev.print) && !/data-bd-frames/.test(rvRev.print),
     'the backdrop reveal does not reach print', rvRev.out.split('\n')[0]);
  ok(/data-bd-frames/.test(rvRev.html) && /clip-path:inset\(0 0 0 55%\)/.test(rvRev.html),
     'and the live view still opens on the first place');

  // 8 · the [data-bd-frames] shorthand replaced the plain rule's opacity
  // transition, so a revealed backdrop snapped instead of fading.
  ok(/\.chunk-backdrop\[data-bd-frames\] \{[^}]*clip-path[^}]*opacity 260ms/.test(rvRev.html),
     'and it still fades with its slide, which the shorthand had dropped');

  // 6 · marked wraps a lone image in a <p> and passes a raw <figure> through,
  // so the same divider written two ways produced two different trees.
  const rvImg = raw(FM + '# One {#o}\n\n![A picture](pic)\n\n## free: A {#a}\n\nX.\n', ['--audience-only']);
  ok(/<div class="section-body"><figure/.test(rvImg.html),
     'a lone image divider is a figure child, like a ::: draw one', rvImg.out.split('\n')[0]);

  // 9 · a class on a column heading parsed, was dropped, and neither file
  // said anything.
  const clsCol = raw(FM + '# A part {#p .bare}\n\n## free: A {#a}\n\nX.\n', ['--audience-only']);
  ok(clsCol.code !== 0 && /column heading carries \.bare/.test(clsCol.out),
     'a class on a column heading is refused rather than dropped');
  ok(/class-on-column/.test(lintOf(FM + '# A part {#p .bare}\n\n## free: A {#a}\n\nX.\n')),
     'and the linter says the same');

  // 10 · `from 0` is what writing no `from` already says.
  const from0 = raw(FM + '## free: A {#a}\n\n::: overlay {left} from 0\nWords.\n:::\n\nX.\n', ['--audience-only']);
  ok(from0.code !== 0 && /from 0/.test(from0.out), 'an overlay held to beat 0 is refused');
  ok(/bad-overlay-from/.test(lintOf(FM + '## free: A {#a}\n\n::: overlay {left} from 0\nWords.\n:::\n\nX.\n')),
     'and the linter says the same');
  const from1 = raw(FM + '## free: A {#a}\n\n::: overlay {left} from 1\nWords.\n:::\n\nX.\n', ['--audience-only']);
  ok(from1.code === 0 && /data-from="1"/.test(from1.html),
     'while from 1 still works', from1.out.split('\n')[0]);

  // ── and five the independent verification of those ten turned up ──
  // A heading inside an open ::: expand is that block's content, which is
  // right for a sub-heading in an aside and catastrophic for a directive the
  // author forgot to close: every slide below it was folded into the aside
  // and the build exited 0. The linter reported it; the build did not.
  const swallow = raw(FM + '## free: A {#c}\n\n::: expand Details\n\nInside.\n\n'
    + '## free: must not vanish {#d}\n\nProse.\n', ['--print-only']);
  ok(swallow.code !== 0 && /::: expand Details was never closed/.test(swallow.out),
     'an unclosed ::: expand is a hard error, not a silently shorter deck');
  const swMargin = raw(FM + '## free: A {#c}\n\n::: footnote\n\nInside.\n\n'
    + '## free: B {#d}\n\nProse.\n', ['--print-only']);
  ok(swMargin.code !== 0 && /::: footnote was never closed/.test(swMargin.out),
     'and so is an unclosed ::: footnote');
  const swOv = raw(FM + '## free: A {#c}\n\n::: overlay {left}\n\nInside.\n\n'
    + '## free: B {#d}\n\nProse.\n', ['--print-only']);
  ok(swOv.code !== 0 && /::: overlay was never closed/.test(swOv.out),
     'and an unclosed ::: overlay');
  // A closed one still works, and a markdown sub-heading inside it is still
  // that block's content rather than a new chunk - which is the capability
  // the guard exists for.
  const swOk = raw(FM + '## free: A {#c}\n\n::: expand Details\n\n## A sub-heading\n\nInside.\n:::\n\n'
    + '## free: B {#d}\n\nProse.\n', ['--print-only']);
  ok(swOk.code === 0 && /id="d"/.test(swOk.print) && /<h2[^>]*>A sub-heading/.test(swOk.print),
     'while a closed one keeps its own sub-heading and the chunk after it',
     swOk.out.split('\n')[0]);

  // `::: footnote` is the documented spelling; `::: margin` is the one every
  // source.md written before the rename uses, and it stays valid because from
  // 1.0.0 the source format is the interface. An alias nothing asserts is an
  // alias somebody deletes as dead code, so assert that both build, that they
  // render the *same* aside down to the label, and that lint.js takes both -
  // the last one because a spelling the build accepts and the linter refuses
  // fails a file that builds clean, which is the direction CLAUDE.md warns
  // about.
  {
    const fnSrc = (kw) => FM + `## free: A {#c}\n\n**Topic.** Rest of it.\n\n::: ${kw}\nQuiet note.\n:::\n`;
    const fnB = raw(fnSrc('footnote'));
    const mgB = raw(fnSrc('margin'));
    // The two renderers name the same block differently - .margin-note in the
    // live views, .chunk-expansion-margin on paper - so both are read here.
    // Asserting only one would have passed while the other lost the alias.
    const live = (h) => (h && h.match(/<aside class="margin-note"[\s\S]*?<\/aside>/) || [''])[0];
    const onPaper = (h) => (h && h.match(/<aside class="chunk-expansion chunk-expansion-margin"[\s\S]*?<\/aside>/) || [''])[0];
    ok(fnB.code === 0 && mgB.code === 0 && live(fnB.html) && onPaper(fnB.print),
       '::: footnote builds, and so does the older ::: margin',
       `codes ${fnB.code}/${mgB.code}`);
    ok(live(fnB.html) === live(mgB.html) && onPaper(fnB.print) === onPaper(mgB.print),
       'the two spellings render the same aside in both views, NOTE label included',
       live(fnB.html) + '  vs  ' + live(mgB.html));
    // "0 error(s)" contains the word, so count the summary rather than grep it.
    const clean = (src) => / 0 error\(s\)/.test(lintOf(src));
    ok(clean(fnSrc('footnote')) && clean(fnSrc('margin')),
       'and lint.js mirrors both spellings rather than refusing one that builds',
       lintOf(fnSrc('margin')).trim());
  }

  // A comment survives a trim, so `<!-- nothing -->` produced exactly the
  // composition the quote-cover check exists to prevent.
  const cmt = raw('---\ntitle: T\ncover: quote\n---\n\n## title: {#title}\n\n'
    + '<!-- nothing to say -->\n\n## free: F {#f}\n\nBody.\n');
  ok(cmt.code !== 0 && cmt.files.length === 0,
     'a comment-only body is not a quotation');
  ok(/cover-needs-body/.test(lintOf('---\ntitle: T\ncover: quote\n---\n\n## title: {#title}\n\n\n## free: F {#f}\n\nB.\n')),
     'and the linter mirrors the rule, so the pre-commit gate cannot pass what the build refuses');

  // On a quote cover the lecture title is the attribution under the claim and
  // is meta-sized on purpose. A closing slide has no claim above it and its
  // heading IS its content - it came out at 29.9px.
  ok(/\.chunk\[data-cover=quote\]\[data-closing\] \.title-main/.test(cls.html),
     'a quote closing slide takes its heading back to heading size');

  // The same shorthand clobber, one media query down: reduced motion took the
  // opacity crossfade away too, so a revealed backdrop snapped between slides
  // while every other one faded.
  ok(/prefers-reduced-motion: reduce\) \{\s*\.chunk-backdrop\[data-bd-frames\] \{ transition: opacity 260ms ease; \}/
       .test(rvRev.html),
     'and reduced motion suppresses the picture opening, not the fade');

  // Print emits data-has-backdrop and data-backdrop on a chunk's article;
  // nothing keyed on either yet, which is why a divider had neither - and why
  // a scrim rule added later would have reached chunks and skipped dividers.
  const divAttr = raw(FM + '# One {#o}\n\n::: backdrop pic {invert}\n\n## free: A {#a}\n\nX.\n');
  ok(/<section class="column" id="o" data-has-backdrop="" data-backdrop="invert">/.test(divAttr.print),
     'and a divider carries the same backdrop attributes a chunk does',
     divAttr.out.split('\n')[0]);

  // ── and four the verification of the fixes turned up in the fixes ──
  // An unrecognised class was dropped by the build and reported by lint.js as
  // an unknown *width* - a linter stricter than the build, in both directions
  // wrong: the build said nothing and the linter named the wrong thing.
  for (const [where, src] of [
    ['column', FM + '# A part {#p .zzz}\n\n## free: A {#a}\n\nX.\n'],
    ['chunk',  FM + '## free: A {#a .zzz}\n\nX.\n'],
  ]) {
    const r = raw(src, ['--audience-only']);
    ok(r.code !== 0 && /\.zzz/.test(r.out),
       `an unrecognised class on a ${where} heading is refused, and named as written`);
  }
  // …and the message names the class the author typed, not the key it parsed
  // into: a width came back as `.width`, which is not a class that exists.
  const wCol = raw(FM + '# A part {#p .narrow}\n\n## free: A {#a}\n\nX.\n', ['--audience-only']);
  ok(wCol.code !== 0 && /\.narrow/.test(wCol.out) && !/\.width/.test(wCol.out),
     'and a width on a column heading is named as .narrow, not as .width');
  // `.bare` and the four widths must still work where they belong.
  const okCls = raw(FM + '## figure: H {.wide #a .bare}\n\nX.\n', ['--audience-only']);
  ok(okCls.code === 0 && /data-width="wide"/.test(okCls.html) && /data-bare=""/.test(okCls.html),
     'while a width and .bare on a chunk heading still work', okCls.out.split('\n')[0]);

  // unwrapLoneFigure's capture is greedy and anchored only at the ends, so two
  // pictures on separate lines matched across the </p><p> between them - the
  // function named "lone figure" fired on two and emitted an orphan closer.
  const twoPix = raw(FM + '# One {#o}\n\n![A](pic)\n\n![B](pic)\n\n## free: A {#a}\n\nX.\n',
    ['--audience-only']);
  const sb = (twoPix.html.match(/<div class="section-body">[\s\S]*?<\/div>/) || [''])[0];
  ok(twoPix.code === 0 && (sb.match(/<p>/g) || []).length === (sb.match(/<\/p>/g) || []).length,
     'two pictures in a divider stay balanced markup', twoPix.out.split('\n')[0]);

  // `from` was matched as digits, so anything it could not swallow made the
  // whole line fail to match: `from later` was not an overlay at all, printed
  // `::: overlay …` as literal text on the projection, and the linter blamed
  // the closing `:::` two lines down.
  const badFrom = raw(FM + '## free: A {#a}\n\n::: overlay {left} from later\nWords.\n:::\n\nX.\n',
    ['--audience-only']);
  ok(badFrom.code !== 0 && /from later/.test(badFrom.out),
     'an unreadable `from` is named rather than printed on the slide');
  ok(/bad-overlay-from/.test(lintOf(FM + '## free: A {#a}\n\n::: overlay {left} from later\nWords.\n:::\n\nX.\n')),
     'and the linter names it too, on the line that carries it');

  // The divider's mark and heading were separate grid rows, so the spanning
  // figure's height was shared out among them and pushed them apart -
  // measured, the list's centre sat 132px below the figure's. The guard is
  // the wrapper: everywhere else it dissolves, and in the beside layout it is
  // the left cell of a one-row grid.
  ok(/\.section-lead \{ display: contents; \}/.test(cls.html),
     'the divider lead dissolves everywhere it is not the beside layout');
  ok(/:has\(> \.section-body > figure:only-child\) > \.section-lead \{[^}]*grid-row: 1/.test(cls.html)
     && /:has\(> \.section-body > figure:only-child\) > \.section-body \{[^}]*grid-row: 1/.test(cls.html),
     'and there both cells are in one row, which is what stops the offset');

  // The commonest heading of all: no attribute tail at all. parseAttributeTail
  // returns early there, and the early return did not carry `classes` - so the
  // two checks above crashed every lecture whose first column heading has no
  // id. Caught by the browser suite, not by this file, because the fixture
  // decks here all happened to write one.
  const noTail = raw('---\ntitle: T\n---\n\n## title: {#t}\n\n# A part\n\n## free: A\n\nX.\n',
    ['--audience-only']);
  ok(noTail.code === 0, 'a heading with no attribute tail at all still builds',
     noTail.out.split('\n').slice(-2)[0]);

  // `split` was in COVER_RATIO_VARIANTS, so the key was accepted, validated
  // against the 15-75 band and emitted as a custom property that its own grid
  // never read - measured, beside moved 152px at 62% and split did not move at
  // all. All three dividing covers read it now.
  ok(/\.chunk\[data-cover=split\] \{[^}]*var\(--cover-ratio, 42%\)/.test(cls.html),
     'split reads cover-ratio, like the other two covers that divide the slide');
  ok(/\.chunk\[data-cover=beside\] \{[^}]*var\(--cover-ratio/.test(cls.html)
     && /\.chunk\[data-cover=above\] \{[^}]*var\(--cover-ratio/.test(cls.html),
     'and beside and above still do');

  // ── the link code mark ──
  // Up to 1.0.0 the address and its QR code were reachable only by
  // Shift-clicking the link: a modifier nobody is told about, so for most
  // readers the feature did not exist. The mark is the way in that can be
  // seen; Shift-click is unchanged.
  const lk = raw(FM + '## free: A {#a}\n\nSee [the site](https://example.invalid/p).\n',
    ['--audience-only']);
  ok(lk.code === 0 && /<button type="button" class="link-code" data-link-code="https:\/\/example\.invalid\/p"/
       .test(lk.html),
     'an external link carries a mark that opens its address', lk.out.split('\n')[0]);
  ok(/aria-label="Show this address large, with a code to scan"/.test(lk.html),
     'and the mark is a labelled control, not a second anchor to the same place');
  ok(/button\[data-link-code\][\s\S]{0,500}showLinkOverlay\(href, label\)/.test(lk.html),
     'clicking it takes the same path Shift-click takes');
  ok(/if \(!e\.shiftKey\) return;/.test(lk.html), 'and Shift-click still works');
  const lkArt = (lk.html.match(/<article class="chunk chunk-free[\s\S]*?<\/article>/) || [''])[0];
  ok(/link-code/.test(lkArt), 'the mark is in the chunk, beside its link');
  const lkIn = raw(FM + '## free: A {#a}\n\nSee [the other one](#t).\n', ['--audience-only']);
  const lkInArt = (lkIn.html.match(/<article class="chunk chunk-free[\s\S]*?<\/article>/) || [''])[0];
  ok(!/link-code/.test(lkInArt), 'and an internal cross-reference carries none');
  const lkOff = raw('---\ntitle: T\nstyle:\n  link-codes: off\n---\n\n## title: {#t}\n\n'
    + '## free: A {#a}\n\nSee [the site](https://example.invalid/p).\n', ['--audience-only']);
  ok(/data-link-codes="off"/.test(lkOff.html)
     && /body\[data-link-codes=off\] \.link-code \{ display: none; \}/.test(lkOff.html),
     'style.link-codes: off hides them');
  // The body tag, not the file: the stylesheet carries the word too, and a
  // check that reads the whole document passes on its own CSS.
  const lkBody = (lk.html.match(/<body[^>]*>/) || [''])[0];
  ok(!/data-link-codes/.test(lkBody),
     'and a deck that says nothing emits no attribute, so its markup is unchanged');
  // Built in full, because the print check below needs print.html.
  const lkFull = raw(FM + '## free: A {#a}\n\nSee [the site](https://example.invalid/p).\n');
  const lkBad = raw('---\ntitle: T\nstyle:\n  link-codes: sometimes\n---\n\n## title: {#t}\n\n'
    + '## free: A {#a}\n\nX.\n', ['--audience-only']);
  ok(lkBad.code !== 0, 'an unknown value is refused by the build');
  ok(/unknown-view-default|link-codes/.test(lintOf(
       '---\ntitle: T\nstyle:\n  link-codes: sometimes\n---\n\n## title: {#t}\n\n'
       + '## free: A {#a}\n\nX.\n')), 'and by the linter');
  ok(/\.link-code \{ display: none; \}/.test(lkFull.print), 'and print hides it');
  // A button does not inherit font-size, so every em in that rule resolved
  // against the UA's 13.33px however large the slide was set: measured,
  // link text 28.4px and mark 10.4px, pinned there. Without this line the
  // sizes below are numbers that describe nothing.
  const lcRule = (lk.html.match(/\n\.link-code \{[\s\S]*?\n\}/) || [''])[0];
  ok(/font: inherit;/.test(lcRule),
     'the link mark inherits its font, or its em is the browser default');
  ok(/color: var\(--emph\);/.test(lcRule),
     'and it takes the link colour, not soft ink');
  // The guard, not the outcome. Browser-verified once: with the mark
  // focused, Space used to advance the deck instead of opening the address,
  // so the mark was reachable by mouse alone - which is what it exists to
  // stop being. An edit that drops this leaves the button focusable,
  // labelled, and unusable by the keyboard that reached it, and every
  // outcome-shaped check on the markup still passes.
  ok(/closest\('button\[data-link-code\]'\)\s*\n?\s*&& \(e\.key === 'Enter' \|\| e\.key === ' '\)\) return;/
       .test(lk.html),
     'the key map stands back so the focused mark can answer its own key');
  ok(/if \(e\.detail > 0\) mark\.blur\(\);/.test(lk.html),
     'and a pointer activation gives the deck its keys back');

  // A card row is a block of surfaces, so it needs air on both edges. The
  // bottom was a flat 0.4em against a top that scales with the card size:
  // measured, 35.8px above and 11.4px below, so the paragraph after the
  // last card sat against it. Asserted as the shape of the rule, because
  // the rendered gap is only visible in a browser.
  const cardsRule = (lk.html.match(/\n\.cards \{[\s\S]*?\n\}/g) || [])
    .find(r => /grid-template-columns/.test(r) && /--card-fs/.test(r)) || '';
  ok(/margin: calc\(1\.5em \* var\(--card-fs, 1\)\) 0;/.test(cardsRule),
     'a card row keeps the same air below it as above it');
  ok(!/margin: calc\(1\.5em \* var\(--card-fs, 1\)\) 0 0\.4em;/.test(lk.html),
     'and the asymmetric margin that put a paragraph against the last card is gone');

  // ── and nine an independent GPT-5.6 review found ──
  // Every frontmatter key that can refuse a deck resolves in the pre-flight.
  // `section:` was read only while rendering a live divider, so an unknown
  // value wrote print.html and print-notes.html and then threw.
  const badSec = raw('---\ntitle: T\nsection: bogus\n---\n\n## title: {#t}\n\n'
    + '# P {#p}\n\n## free: S {#s}\n\nB.\n');
  ok(badSec.code !== 0 && badSec.files.length === 0,
     'an unknown section: is refused before anything is written');
  const badSecPO = raw('---\ntitle: T\nsection: bogus\n---\n\n## title: {#t}\n\n'
    + '# P {#p}\n\n## free: S {#s}\n\nB.\n', ['--print-only']);
  ok(badSecPO.code !== 0, 'and --print-only refuses it too');

  // A second ::: overlay replaced the first and its words were gone from every
  // output with the build exiting 0, while lint.js reported nested-directive.
  const twoOv = raw(FM + '## free: S {#s}\n\n::: overlay {left}\nFirst.\n'
    + '::: overlay {right}\nSecond.\n:::\n', ['--audience-only']);
  ok(twoOv.code !== 0 && /still open/.test(twoOv.out),
     'a second ::: overlay while one is open is refused, not silently dropped');

  // An unreadable cards/rows line fell through every branch and printed as
  // literal text on the projection. ::: side already had this refusal.
  for (const [kw, src] of [['cards', '::: cards 7\n- A\n:::\n'], ['rows', '::: rows 2\n- A\n:::\n']]) {
    const r = raw(FM + '## free: S {#s}\n\n' + src, ['--audience-only']);
    ok(r.code !== 0 && new RegExp('::: ' + kw + ' could not be read').test(r.out),
       `an unreadable ::: ${kw} line is named, not printed on the slide`);
  }

  // A closing slide's heading is its content - it has no frontmatter to fall
  // back on. lint.js had said so since the tag was added; the build had not.
  const emptyClo = raw(FM + '## closing: {#end}\n', ['--print-only']);
  ok(emptyClo.code !== 0 && /heading is its content/.test(emptyClo.out),
     'a closing chunk with no heading is refused by the build too');

  // A title or closing chunk is placed by its composition: both renderers
  // hardcode full width and the heading is the composition's, so a width
  // class and .bare were read and thrown away - byte-identical output.
  const cloCls = raw(FM + '## closing: Done {.bare .narrow #end}\n', ['--audience-only']);
  ok(cloCls.code !== 0 && /cover composition decides/.test(cloCls.out),
     'a width or .bare on a title or closing chunk is refused');
  ok(/class-on-cover-chunk/.test(lintOf(FM + '## closing: Done {.bare #end}\n')),
     'and the linter says the same');

  // cover-image on a cover that draws no picture of its own: read, stored and
  // never looked at again.
  const imgNo = raw('---\ntitle: T\ncover: classic\ncover-image: https://example.invalid/p.jpg\n---\n\n'
    + '## title: {#t}\n\n## free: X {#x}\n\nX.\n', ['--audience-only']);
  ok(imgNo.code !== 0 && /draws no picture of its own/.test(imgNo.out),
     'cover-image on a type-only cover is refused');
  ok(/bad-cover-image/.test(lintOf('---\ntitle: T\ncover: classic\ncover-image: p\n---\n\n'
    + '## title: {#t}\n\n## free: X {#x}\n\nX.\n')),
     'and the linter says the same');

  // Two gaps where the linter read the frontmatter more narrowly than the
  // build: a quoted cover value, and which covers cover-ratio applies to.
  ok(/cover-needs-body/.test(lintOf('---\ntitle: T\ncover: "quote"\n---\n\n'
    + '## title: {#t}\n\n## free: X {#x}\n\nX.\n')),
     'a quoted cover value is read like the build reads it');
  ok(/bad-cover-ratio/.test(lintOf('---\ntitle: T\ncover: classic\ncover-ratio: 42\n---\n\n'
    + '## title: {#t}\n\n## free: X {#x}\n\nX.\n')),
     'and cover-ratio is checked against the composition, not only the number');

  // The card alignment checks matched `ca-center` in the markup and would have
  // passed with the rule that makes it mean anything deleted. Assert the
  // mechanism, which is what the rest of this file does.
  ok(/\.cards\.ca-center \{ --card-align: center; \}/.test(cls.html)
     && /\.cards\.ca-left   \{ --card-align: left; \}/.test(cls.html),
     'the card alignment classes set the property their name promises');
  ok(/text-align: var\(--card-align, left\)/.test(cls.html),
     'and something reads it, or the classes would resolve and move nothing');

  // ── the collapsed view's bold audit, and the mirror under it ─────────────
  //
  // `single-word-bold` warns on a bold of two words or fewer landing after a
  // paragraph's first sentence, because the collapse hides the prose around
  // it and leaves the <strong> standing. Two assertions, and the second is
  // the load-bearing one.
  //
  // What makes this rule different from the rest of lint.js is what it
  // mirrors. A word budget or a directive check re-implements a *contract*,
  // and a contract drifts when somebody changes a number – visibly, in a
  // diff. This one mirrors an *algorithm*: splitSentencesIn's three sentence
  // helpers, which live inside the AUDIENCE_JS template literal and so cannot
  // be imported by anything. That drifts when somebody fixes an edge case in
  // the renderer, invisibly, and the warning then describes a collapse that
  // no longer happens. So the test that matters is not "lint warns" – lint
  // agreeing with itself proves nothing – it is "lint's copy and the copy
  // that ships to the browser still answer the same way".
  //
  // Both copies are lifted out as text and run side by side. Not imported:
  // lint.js calls main() at module scope, and the build's copy only exists as
  // characters inside a string until a page runs it. Extraction is also the
  // point rather than a workaround – if either file renames or restructures
  // these helpers this slice stops matching and the test fails loudly, which
  // is exactly when a person should be looking at the pair.
  const sentenceHelpers = (text, from, to, where) => {
    const a = text.indexOf(from), b = text.indexOf(to, a + 1);
    ok(a !== -1 && b > a, `the sentence helpers are still findable in ${where}`);
    if (a === -1 || b <= a) return null;
    // Findable is not the same as inside. Reorder either file so a helper
    // lands past the end marker and the slice still matches, while the
    // return line throws a ReferenceError on the call - killing the run with
    // a trace where this file's convention is a named finding.
    try {
      return new Function(text.slice(a, b)
        + ';return { sentenceEndIn, tailEndsSentence };')();
    } catch (e) {
      ok(false, `both sentence helpers are inside that slice in ${where}`,
         String(e && e.message || e));
      return null;
    }
  };
  // The build's copy is taken from a real built page rather than from
  // build.js, so what is measured is what a browser is actually handed.
  const built = raw(FM + '## free: A {#a}\n\nProse.\n', ['--audience-only']);
  const shipped = sentenceHelpers(built.html || '', 'const SENTENCE_ABBREVS',
    'function splitSentencesIn', 'the built audience page');
  const mirrored = sentenceHelpers(fs.readFileSync(path.join(ROOT, 'lint.js'), 'utf8'),
    'const SENTENCE_ABBREVS', 'function proseNodes', 'lint.js');

  if (shipped && mirrored) {
    // Every branch the two share: a plain break, "!" and "?" which are never
    // abbreviation marks, the single-character guard (an ordinal or an
    // initial), the abbreviation list, and the lowercase continuation.
    const cases = ['A sentence. Another one', 'Ende! Neu', 'Frage? Ja',
      'Vgl. Meier 2017', 'z. B. so', 'et al. 2017 folgt', 'Kap. 4 dazu',
      'um Faktor 3. Dann', 'Wort. dann klein', 'no end here at all'];
    const tails = ['ends.', 'ends!', 'ends?', 'z.', 'et al.', 'Faktor 3.', 'no end'];
    const drift = [
      ...cases.filter(s => shipped.sentenceEndIn(s) !== mirrored.sentenceEndIn(s))
        .map(s => `sentenceEndIn(${JSON.stringify(s)})`),
      ...tails.filter(s => shipped.tailEndsSentence(s) !== mirrored.tailEndsSentence(s))
        .map(s => `tailEndsSentence(${JSON.stringify(s)})`),
    ];
    ok(drift.length === 0,
       "lint.js's sentence helpers still answer as the ones the build ships",
       drift.join(', '));
    // Two anchors, so a pair edited congruently but wrongly is still caught
    // on the behaviour the rule is built on: a break the collapse acts on,
    // and an abbreviation it must not act on.
    ok(shipped.sentenceEndIn('A sentence. Another one') === 10
       && shipped.sentenceEndIn('et al. 2017 folgt') === -1,
       'and they still break on a sentence end and not on an abbreviation');
  }

  // The rule itself, in both directions. A bold in the opening sentence is
  // shown whole and costs nothing; the same bold one sentence later is the
  // finding. The pair is what makes this more than a smoke test - a check
  // that fired on everything would pass a one-sided assertion.
  const bold = (body) => lintOf(FM + `## free: A {#a}\n\n${body}\n`);
  ok(/single-word-bold/.test(bold('One **chunk** is a heading. And more prose.')) === false,
     'a short bold inside the opening sentence is not a finding');
  ok(/single-word-bold/.test(bold('An opening sentence. One **chunk** fills the slide.')),
     'the same bold after that sentence is');
  ok(/single-word-bold/.test(bold('An opening sentence. **A phrase that stands on its own** follows.')) === false,
     'and widening it into a phrase that reads alone clears it');
  // Scope. splitSentencesIn walks p and never li, and skips explicit blocks
  // outright, so none of these can be orphaned by the collapse.
  ok(/single-word-bold/.test(bold('Lead-in.\n\n- An item. With **this** in it.')) === false,
     'a list item is shown whole, so it is exempt');
  ok(/single-word-bold/.test(bold('Lead-in.\n\n::: slide\n\nA sentence. Then **this**.\n\n:::')) === false,
     'and so is an explicit ::: slide block');

  // ── the two settings a chunk can answer for itself ──────────────────
  // `wrap` and `blocks` are the two style: keys whose right answer changes
  // from slide to slide, so each has a chunk class spelled key-value. What
  // is asserted here is the contract, not the geometry: which attribute is
  // emitted where, that both directions exist, that the linter and the build
  // agree, and that an unknown value still fails the build. Where the blocks
  // actually land is measured in the browser suite.
  const chunkCls = (cls, body = 'Prose.') =>
    raw(FM + `## free: A {#a${cls ? ' ' + cls : ''}}\n\n${body}\n`);

  for (const [cls, attr] of [
    ['.wrap-none', 'data-wrap="none"'],
    ['.wrap-balance', 'data-wrap="balance"'],
    ['.blocks-left', 'data-blocks="left"'],
    ['.blocks-center', 'data-blocks="center"'],
  ]) {
    const r = chunkCls(cls);
    ok(r.code === 0 && r.html.includes(attr) && r.print.includes(attr),
       `${cls} reaches the chunk as ${attr}, in the live view and on paper`,
       r.out.split('\n')[0]);
  }
  // The direction that matters: unlike .bare and .center, these reach print,
  // because the key they mirror always has. A chunk class that stopped at
  // the projection would contradict style.wrap.
  ok(/<article[^>]*data-wrap="none"/.test(chunkCls('.wrap-none').print),
     'and it is on the print article, not only on the live one');
  // Absent unless asked for, which is the whole of the additive promise.
  // Matched on the article tags rather than on the file: the stylesheet
  // names both attributes in its own selectors, and a document-wide grep
  // would report the rules as if they were markup.
  {
    const plain = chunkCls('');
    const articles = (h) => (h.match(/<article [^>]*>/g) || []).join('\n');
    ok(!/data-wrap=|data-blocks=/.test(articles(plain.html))
       && !/data-wrap=|data-blocks=/.test(articles(plain.print)),
       'a chunk that writes neither class emits neither attribute',
       articles(plain.html).split('\n')[0]);
  }
  // Two classes naming the same key resolve to one value rather than both.
  {
    const both = chunkCls('.wrap-none .wrap-balance');
    ok(both.code === 0 && /data-wrap="balance"/.test(both.html)
       && !/data-wrap="none"/.test(both.html),
       'the last of two classes naming one key wins, rather than both landing');
  }
  // A cover is the one place .bare, .center and a width are refused. These
  // are not: a cover title is a heading and balances like one, and the build
  // and the linter have to agree about that or the pre-commit gate refuses
  // what the build renders.
  {
    const coverSrc = '---\ntitle: T\n---\n\n## title: {#title .wrap-none}\n\n'
      + '## free: A {#a}\n\nProse.\n';
    const r = raw(coverSrc, ['--audience-only']);
    ok(r.code === 0 && /<article class="chunk chunk-title"[^>]*data-wrap="none"/.test(r.html),
       'a style class on a title chunk builds, unlike a width or .bare',
       r.out.split('\n')[0]);
    ok(/ 0 error\(s\)/.test(lintOf(coverSrc)),
       'and the linter lets it past too, or it is stricter than the build');
    const bad = raw('---\ntitle: T\n---\n\n## title: {#title .narrow}\n\n## free: A {#a}\n\nP.\n',
      ['--audience-only']);
    ok(bad.code !== 0, 'while a width on a title chunk is still refused');
  }
  // The unknown-class message lists what a tail takes, so it has to have
  // grown with the vocabulary rather than naming four widths and two words.
  {
    const r = chunkCls('.wrap-of');
    ok(r.code !== 0 && /\.wrap-of/.test(r.out) && /\.wrap-none/.test(r.out)
       && /\.blocks-left/.test(r.out),
       'a near miss is refused and the message names the classes that exist',
       r.out.split('\n')[0]);
    ok(/unknown class '\.wrap-of'/.test(lintOf(FM + '## free: A {#a .wrap-of}\n\nP.\n'))
       || /\.wrap-of/.test(lintOf(FM + '## free: A {#a .wrap-of}\n\nP.\n')),
       'and the linter refuses the same spelling');
  }
  // The deck-wide half of the same pair, and the refusal every viewer
  // default carries: a typo in a look is otherwise invisible.
  {
    const left = raw('---\ntitle: T\nstyle:\n  blocks: left\n---\n\n## title: {#title}\n\n'
      + '## free: A {#a}\n\nProse.\n');
    ok(left.code === 0 && /<body [^>]*data-blocks="left"/.test(left.html)
       && /<body [^>]*data-blocks="left"/.test(left.print),
       'style.blocks: left reaches both bodies', left.out.split('\n')[0]);
    const centre = raw('---\ntitle: T\nstyle:\n  blocks: center\n---\n\n## title: {#title}\n\n'
      + '## free: A {#a}\n\nProse.\n');
    ok(centre.code === 0 && !/data-blocks=/.test(bodyTag(centre.html)),
       'and writing the default emits nothing, so it is a true no-op',
       bodyTag(centre.html));
    const bad = raw('---\ntitle: T\nstyle:\n  blocks: middle\n---\n\n## title: {#title}\n\n'
      + '## free: A {#a}\n\nP.\n', ['--print-only']);
    ok(bad.code !== 0 && /blocks/.test(bad.out),
       'an unknown value fails the build, and --print-only reaches the refusal too',
       bad.out.split('\n')[0]);
    ok(/unknown-style-value|blocks/.test(lintOf('---\ntitle: T\nstyle:\n  blocks: middle\n---\n\n'
       + '## title: {#title}\n\n## free: A {#a}\n\nP.\n')),
       'and lint.js mirrors the enum');
  }
  // The rules themselves have to be in both stylesheets, guarded, and inert
  // in a deck that says nothing - the same shape the wrap guards are checked
  // in at the top of this file. A rule that lost its attribute still moves a
  // formula, and nothing else here would notice.
  {
    const plain = chunkCls('');
    ok(/#stage \.chunk\[data-wrap=none\][\s\S]{0,260}?text-wrap: wrap/.test(plain.html),
       'the per-chunk wrap override ships in AUDIENCE_CSS, keyed on the attribute');
    ok(/\.chunk\[data-wrap=none\][\s\S]{0,220}?text-wrap: wrap/.test(plain.print),
       'and in PRINT_CSS, which is a separate copy');
    ok(/body\[data-blocks=left\] #stage \.reveal-segment > pre/.test(plain.html)
       && /#stage \.chunk\[data-blocks=center\][\s\S]{0,300}?translateX\(-50%\)/.test(plain.html),
       'and the blocks rules ship in both directions, deck-wide and per chunk');
    ok(/body\[data-blocks=left\] figure\.figure-img/.test(plain.print),
       'with print carrying the two families it has - figure and formula');
    ok(!/data-blocks=/.test(bodyTag(plain.html)),
       'while a deck that names none of it emits no attribute to match them',
       bodyTag(plain.html));
  }
  // ── what a lecture may say about how it opens ────────────────────────────
  // Four settings in one family, and each is asserted where it can go wrong
  // rather than where it is easy to look at.
  const DECK = (fm, body = '## free: A {#a}\n\nProse, and a second sentence.\n') =>
    `---\ntitle: T\n${fm}---\n\n## title: {#title}\n\n${body}`;
  const bodyOf = (html) => (html.match(/<body [^>]*>/) || [''])[0];

  // ── slide numbers: the default moved, and print can differ from the room ──
  // horizontal, not vertical. The stacked form sets each digit on its own
  // line, so slide 10 reads as a 1 above a 0 - and the content repo's
  // house-style file had carried "set slide-numbers: horizontal" as standing
  // advice, which is a default admitting it is the wrong way round. This
  // moves the rendering of every deck that does not set the key, which is
  // the trade, taken deliberately.
  const numsDflt = raw(DECK(''), []);
  ok(/data-slide-nums="horizontal"/.test(bodyOf(numsDflt.html)),
     'a deck that says nothing opens with slide numbers in a row, not stacked',
     bodyOf(numsDflt.html));
  ok(/data-slide-nums="horizontal"/.test(bodyOf(numsDflt.print)),
     'and prints them the same way');
  const numsPinned = raw(DECK('slide-numbers: vertical\n'), []);
  ok(/data-slide-nums="vertical"/.test(bodyOf(numsPinned.html)),
     'and the old rendering is one frontmatter line away, in both directions');

  // print-slide-numbers, in all four of its states against all four of the
  // live key's. The default is not a value but a deferral - an absent key
  // means "whatever the live views are set to" - and a deferral is exactly
  // the kind of default that resolves right in the case someone tried and
  // wrong in the fifteen they did not.
  {
    const VALUES = [null, 'vertical', 'horizontal', 'off'];
    const bad = [];
    for (const live of VALUES) {
      for (const print of VALUES) {
        const fm = (live ? `slide-numbers: ${live}\n` : '')
                 + (print ? `print-slide-numbers: ${print}\n` : '');
        const r = raw(DECK(fm), []);
        const got = { live: (bodyOf(r.html).match(/data-slide-nums="(\w+)"/) || [])[1],
                      print: (bodyOf(r.print).match(/data-slide-nums="(\w+)"/) || [])[1] };
        // The live views take the live key or the built-in default; print
        // takes its own key, else the live key, else the built-in default.
        const wantLive = live || 'horizontal';
        const wantPrint = print || wantLive;
        if (got.live !== wantLive || got.print !== wantPrint) {
          bad.push(`live=${live} print=${print} -> ${got.live}/${got.print}, wanted ${wantLive}/${wantPrint}`);
        }
      }
    }
    ok(bad.length === 0,
       'print-slide-numbers follows the live key when unset and overrides it when set, in all sixteen combinations',
       bad.join('; '));
    // The two halves of that, said separately, so a failure above names
    // which way round it went wrong.
    const follow = raw(DECK('slide-numbers: off\n'), []);
    ok(/data-slide-nums="off"/.test(bodyOf(follow.print)),
       'a deck that turns the numbers off turns them off on paper too, without saying so twice');
    const differ = raw(DECK('slide-numbers: off\nprint-slide-numbers: vertical\n'), []);
    ok(/data-slide-nums="off"/.test(bodyOf(differ.html))
       && /data-slide-nums="vertical"/.test(bodyOf(differ.print)),
       'and a deck that wants numbers on paper and not in the room says so and gets both');
  }
  ok(/print-slide-numbers/.test(raw(DECK('print-slide-numbers: sideways\n'), ['--audience-only']).out),
     'an unknown value is refused by a build that renders no printed view at all');
  ok(/unknown-view-default/.test(lintOf(DECK('print-slide-numbers: sideways\n'))),
     'and the linter refuses the same word, which is what keeps CI honest');

  // ── auto-fit grew a third mode ───────────────────────────────────────────
  // true and false are what the key has always taken and still mean what
  // they meant. shrink is the fit ceilinged at the lecturer's own zoom, so
  // it can only ever take size away. What that costs in geometry is in
  // test/auto-fit.mjs, which measures it; this is the vocabulary.
  const modeOf = (fm) => {
    const r = raw(DECK(fm), ['--audience-only']);
    return { out: r.out, mode: (r.html || '').match(/"autoFit":"(\w+)"/)?.[1] };
  };
  ok(modeOf('auto-fit: true\n').mode === 'full', 'auto-fit: true still means fit every slide');
  ok(modeOf('auto-fit: false\n').mode === 'off', 'auto-fit: false still means leave the zoom alone');
  ok(modeOf('auto-fit: shrink\n').mode === 'shrink', 'and shrink is the third mode, additive to both');
  ok(/Valid values for auto-fit: true, false, shrink/.test(modeOf('auto-fit: smaller\n').out),
     'an unknown mode is refused and the message names all three');
  ok(/unknown-view-default/.test(lintOf(DECK('auto-fit: smaller\n'))),
     'and the linter refuses it too');

  // The compatibility claim, run rather than read. audience.html and
  // speaker.html are separate files and --audience-only rebuilds one of
  // them, so a peer window can be a build that predates the third mode and
  // sends the boolean this field used to be. normAutoFit is what has to
  // take either, and asserting the regex that mentions it would only be
  // this file agreeing with itself.
  {
    const page = raw(DECK(''), ['--audience-only']).html || '';
    const cycle = page.match(/const AUTO_FIT_CYCLE = \[[^\]]*\];/)?.[0];
    const norm = page.match(/function normAutoFit\(v\) \{[\s\S]*?\n\}/)?.[0];
    ok(!!cycle && !!norm, 'the built page carries AUTO_FIT_CYCLE and normAutoFit');
    if (cycle && norm) {
      // Same idiom as the sentence helpers above and for the same reason:
      // the build's copy is characters inside a string until a page runs it,
      // so there is nothing to import. Wrapped, so a restructure that breaks
      // the slice is a named finding here rather than a stack trace that
      // kills the run.
      let f = null;
      try { f = new Function(`${cycle}\n${norm}\nreturn normAutoFit;`)(); }
      catch (e) { ok(false, 'normAutoFit lifts out of the page and runs', String(e && e.message || e)); }
      const got = f && [f(true), f(false), f(undefined), f('shrink'), f('off'), f('full'), f('nonsense')];
      ok(!!got && got.join(',') === 'full,off,off,shrink,off,full,off',
         'and it reads a legacy boolean back as a mode, and anything it does not know as off',
         got ? got.join(',') : '');
    }
    // The two fields one setting travels as. The boolean is what an older
    // peer coerces with !!, so dropping it would switch that peer ON when
    // this one is off - the failure that reaches a projector.
    ok(/autoFit: autoFitOn\(\),\s*\n\s*autoFitMode: state\.autoFitMode,/.test(page),
       'a snapshot carries both the mode and the boolean an older peer reads');
    ok(/payload\.autoFitMode === undefined \? payload\.autoFit : payload\.autoFitMode/.test(page),
       'and a snapshot without the mode falls back to that boolean rather than to off');
    // The rename is the guard. state.autoFitMode holds three truthy strings,
    // so any surviving `if (state.autoFit)` would read as permanently on.
    ok(!/state\.autoFit\b/.test(page),
       'and nothing in the page still reads the boolean field the mode replaced');
  }

  // ── hyphenation is a choice, and its default is what the tool already did ──
  const hyph = (fm) => raw(DECK(fm), []);
  const dflt = hyph('lang: de\n');
  ok(!/data-hyphenate/.test(bodyOf(dflt.html)) && !/data-hyphenate/.test(bodyOf(dflt.print)),
     'a deck that says nothing carries no hyphenation attribute at all, so nothing moves');
  // The guard, and it is the load-bearing assertion of this pair: without
  // the wrapper the print rule still hyphenates and style.hyphenate: none
  // silently does nothing, while every outcome-shaped check passes.
  ok(/body:not\(\[data-hyphenate=none\]\) :is\(p, li, blockquote, figcaption, \.speaker-note\)/
       .test(dflt.print),
     'the print rule is guarded, or none would be a key that does nothing');
  ok(/body\[data-hyphenate=all\] #stage :is\(p, li, blockquote, figcaption\)/.test(dflt.html),
     'and the live rule is both gated on all and scoped to the stage, so the chrome never breaks a word');
  ok(/body\[data-hyphenate=all\] #stage :is\(h1[\s\S]{0,200}hyphens: manual/.test(dflt.html),
     'with the same manual reset print carries, since hyphens inherits into code and URLs');
  const hAll = hyph('lang: de\nstyle:\n  hyphenate: all\n');
  ok(/data-hyphenate="all"/.test(bodyOf(hAll.html)),
     'style.hyphenate: all reaches the projection');
  ok(/lang="de"/.test(hAll.html),
     'and lang: de is still what supplies the dictionary, which is why it stays a key of its own');
  const hNone = hyph('lang: de\nstyle:\n  hyphenate: none\n');
  ok(/data-hyphenate="none"/.test(bodyOf(hNone.print)),
     'and none reaches the printed document, which is the only view that hyphenated before');
  ok(/'style\.hyphenate: yes' is not a value/.test(lintOf(DECK('style:\n  hyphenate: yes\n'))),
     'an unknown value is a linter error, as every other style key is');
  ok(/style\.hyphenate: yes/.test(hyph('style:\n  hyphenate: yes\n').out),
     'and fails the build');
  // ── the look of a bold phrase: style.bold and style.print-bold ──────
  // Bold is a selection mark before it is a weight, so its look is a
  // setting per view. The load-bearing checks are the guards again: the
  // default rule unguarded, every other look behind its attribute, the
  // stress rule guarded against accent-bold – and the promoted-bullet rule
  // saying nothing about colour or weight any more, or the switch would be
  // silently overruled on exactly the strongs it was written for.
  const SCOPE = '\\.chunk:not\\(\\.chunk-title, \\.chunk-section\\) p:not\\([^{\\n]*strong:not\\(\\.card-lead\\)';
  const speakerOf = (r) => fs.readFileSync(path.join(r.dir, 'speaker.html'), 'utf8');
  const bDflt = raw(DECK(''), []);
  ok(!/data-bold=|data-print-bold=/.test(bodyOf(bDflt.html) + bodyOf(bDflt.print) + bodyOf(speakerOf(bDflt))),
     'a deck that says nothing about bold carries no bold attribute on any body');
  ok(new RegExp('\\n' + SCOPE + ' \\{ font-weight: inherit; color: inherit; font-style: inherit; \\}').test(bDflt.html),
     'the live default is plain and its rule is unguarded');
  ok(new RegExp('\\n' + SCOPE + ' \\{ font-weight: 600; color: inherit; font-style: inherit; \\}').test(bDflt.print),
     'the print default is bold in the ink and its rule is unguarded');
  ok(new RegExp('body\\[data-bold=accent-bold\\] ' + SCOPE + ' \\{ font-weight: var\\(--bold-weight\\); color: var\\(--emph\\)').test(bDflt.html)
     && new RegExp('body\\[data-print-bold=accent-italic\\] ' + SCOPE + ' \\{ [^}]*font-style: italic').test(bDflt.print),
     'every other look is behind its own body attribute, in each stylesheet under its own key');
  ok(new RegExp('body:not\\(\\[data-bold=accent-bold\\]\\) ' + SCOPE + ' em \\{ font-style: normal; font-weight: var\\(--bold-weight\\); color: var\\(--emph\\)').test(bDflt.html)
     && new RegExp('body:not\\(\\[data-print-bold=accent-bold\\]\\) ' + SCOPE + ' em \\{ font-style: normal; font-weight: 600').test(bDflt.print),
     'an em inside such a phrase is the stress mark in every look but accent-bold, where it stays italic');
  const promoted = (bDflt.html.match(/\[data-collapse=topic-bold\] \.reveal-segment \.sentence-rest strong \{[^}]*\}/) || [''])[0];
  ok(promoted && !/color:|font-weight:/.test(promoted),
     'the promoted-bullet rule no longer sets colour or weight, so the switch is what decides them', promoted);
  const bSet = raw(DECK('style:\n  bold: accent-italic\n  print-bold: plain\n'), []);
  ok(/data-bold="accent-italic"/.test(bodyOf(bSet.html)) && /data-bold="accent-italic"/.test(bodyOf(speakerOf(bSet))),
     'style.bold reaches the audience and the speaker body alike, so the lectern shows what the room sees');
  ok(/data-print-bold="plain"/.test(bodyOf(bSet.print)) && !/data-print-bold=/.test(bDflt.print.match(/<body [^>]*>/)[0]),
     'and style.print-bold reaches the document, whose stylesheet reads only its own key');
  const bOld = raw(DECK('style:\n  bold: plain\n  print-bold: bold\n'), []);
  ok(!/data-bold=|data-print-bold=/.test(bodyOf(bOld.html) + bodyOf(bOld.print)),
     'writing the defaults out emits nothing, like every other style key');
  ok(/style\.bold: shiny/.test(raw(DECK('style:\n  bold: shiny\n'), []).out)
     && /Valid values for print-bold: plain, bold, italic, accent, accent-bold, accent-italic/.test(raw(DECK('style:\n  print-bold: shiny\n'), []).out),
     'an unknown value fails the build, naming the six');
  ok(/'style\.bold: shiny' is not a value/.test(lintOf(DECK('style:\n  bold: shiny\n')))
     && /'style\.print-bold: 700' is not a value/.test(lintOf(DECK('style:\n  print-bold: 700\n'))),
     'and the linter refuses it too, in the block form it reads');
  // The two tables are kept by hand. Read both out of the source and compare
  // them, so a value added on one side is a failure here and not a deck that
  // lints clean and refuses to build.
  {
    const buildSrc = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
    const lintSrc = fs.readFileSync(path.join(ROOT, 'lint.js'), 'utf8');
    const looks = [...(buildSrc.match(/const BOLD_LOOKS = \{[\s\S]*?\n\};/) || [''])[0].matchAll(/^\s*'([a-z-]+)':/gm)].map(m => m[1]);
    const spec = {};
    for (const m of (buildSrc.match(/const STYLE_SPEC = \{[\s\S]*?\n\};/) || [''])[0]
           .matchAll(/^\s*'?([a-z-]+)'?:\s*\{ kind: 'enum', values: (\[[^\]]*\]|Object\.keys\(BOLD_LOOKS\))/gm)) {
      spec[m[1]] = m[2].startsWith('[') ? [...m[2].matchAll(/'([a-z-]+)'/g)].map(x => x[1]) : looks;
    }
    const mirror = {};
    for (const m of (lintSrc.match(/const STYLE_ENUMS = \{[\s\S]*?\n\};/) || [''])[0]
           .matchAll(/^\s*'([a-z-]+)':\s*\[([^\]]*)\]/gm)) {
      mirror[m[1]] = [...m[2].matchAll(/'([a-z-]+)'/g)].map(x => x[1]);
    }
    const specKeys = Object.keys(spec).sort().join(','), mirrorKeys = Object.keys(mirror).sort().join(',');
    ok(looks.length === 6 && specKeys === mirrorKeys && 'bold' in spec && 'print-bold' in spec,
       'STYLE_SPEC and STYLE_ENUMS name the same enum keys', specKeys + ' | ' + mirrorKeys);
    ok(Object.keys(spec).every(k => spec[k].join(',') === (mirror[k] || []).join(',')),
       'and the same values for each, in the same order',
       Object.keys(spec).filter(k => spec[k].join(',') !== (mirror[k] || []).join(',')).join(','));
  }
  // ── ::: side {middle} ────────────────────────────────────────────────
  // The word is a brace tail against a closed slot table, which is what the
  // rest of the language does with words; the ratio stays positional,
  // because a number is read by its position. Both may be written, in that
  // order.
  const sideOf = (open) => raw(FM + `## free: A {#a}\n\n${open}\nProse.\n::: flip\nMore.\n:::\n`,
    ['--audience-only']);
  const sideMid = sideOf('::: side {middle}');
  ok(sideMid.code === 0 && /<div class="side sv-middle"><div class="side-a">/.test(sideMid.html),
     'the anchor word on ::: side reaches the markup as a class', sideMid.out.split('\n')[0]);
  ok(/\.side\.sv-middle \{ align-items: center; \}/.test(sideMid.html),
     'and the stylesheet centres the panes on the block, never per pane');
  const sideBoth = sideOf('::: side 2:1 {middle}');
  ok(sideBoth.code === 0
     && /<div class="side sv-middle" style="--side-a:2fr;--side-b:1fr">/.test(sideBoth.html),
     'a ratio and an anchor are read from one line, ratio first',
     sideBoth.out.split('\n')[0]);
  // The default is not emitted, and that is the additive half: every
  // ::: side written before this existed produces the markup it always did.
  const sidePlain = sideOf('::: side');
  ok(sidePlain.code === 0 && /<div class="side"><div class="side-a">/.test(sidePlain.html),
     'a bare ::: side still emits the class it always did, and no anchor');
  const sideTop = sideOf('::: side {top}');
  ok(sideTop.code === 0 && /<div class="side"><div class="side-a">/.test(sideTop.html),
     'and writing the default explicitly changes nothing, because it is the default');
  // The two failures this grammar refuses everywhere, in both files.
  const sideBad = sideOf('::: side {sideways}');
  ok(sideBad.code !== 0 && /is not a word this directive knows/.test(sideBad.out),
     'a word from no slot is refused rather than dropped');
  ok(/bad-side-class/.test(lintOf(FM + '## free: A {#a}\n\n::: side {sideways}\nP.\n::: flip\nQ.\n:::\n')),
     'and the linter refuses it too, or the build accepts what the gate does not');
  const sideTwo = sideOf('::: side {top middle}');
  ok(sideTwo.code !== 0 && /both answer "anchor"/.test(sideTwo.out),
     'two words from one slot are refused, because one of them would be thrown away');
  ok(/bad-side-class/.test(lintOf(FM + '## free: A {#a}\n\n::: side {top middle}\nP.\n::: flip\nQ.\n:::\n')),
     'and the linter says the same');
  // The old refusal grew rather than moved: an unreadable line is still a
  // hard error and its message now names the tail as well as the ratio.
  const sideJunk = sideOf('::: side 2:1 wide');
  ok(sideJunk.code !== 0 && /takes an optional ratio, an optional \{class\} tail/.test(sideJunk.out),
     'and anything the line is not is still refused, with the tail named');
  ok(/bad-side\b/.test(lintOf(FM + '## free: A {#a}\n\n::: side 2:1 wide\nP.\n::: flip\nQ.\n:::\n')),
     'in both files');
  // Print never reads it, which is why it cost nothing: .side is display
  // block on paper and the two panes stack.
  const sidePrint = raw(FM + '## free: A {#a}\n\n::: side {middle}\nP.\n::: flip\nQ.\n:::\n',
    ['--print-only']);
  ok(sidePrint.code === 0 && !/\.side\.sv-middle/.test(sidePrint.print),
     'and PRINT_CSS carries no rule for it - on paper the panes stack');

  // ── closing-image ────────────────────────────────────────────────────
  // The counterpart of cover-image, and it draws through the same function
  // into the same slot of the same composition.
  const SPLIT = '---\ntitle: T\ncover: split\ncover-image: pic\n';
  const cimg = (fm, args = ['--audience-only']) =>
    raw(fm + '---\n\n## title: {#title}\n\n## free: F {#f}\n\nB.\n\n## closing: Fin {#end}\n', args);
  const cloNone = cimg(SPLIT);
  ok(cloNone.code === 0 && !/data-tag="closing"[^>]*data-closing-art/.test(cloNone.html),
     'a closing slide still draws no picture unless one is asked for',
     cloNone.out.split('\n')[0]);
  const cloSame = cimg(SPLIT + 'closing-image: cover\n');
  ok(cloSame.code === 0 && /data-tag="closing"[^>]*data-closing-art/.test(cloSame.html),
     'closing-image: cover ends the deck on the picture it opened with',
     cloSame.out.split('\n')[0]);
  // The same file, not a second one: the whole point of the reserved word is
  // that a deck ending on its own opening image does not repeat the name.
  const artOf = (html, tag) => {
    const m = html.match(new RegExp(`<article[^>]*data-tag="${tag}"[\\s\\S]*?</article>`));
    return m ? m[0] : '';
  };
  const uriIn = (s) => (s.match(/background-image:url\(&quot;([^&]*)&quot;\)/) || [])[1] || null;
  ok(uriIn(artOf(cloSame.html, 'closing'))
     && uriIn(artOf(cloSame.html, 'closing')) === uriIn(artOf(cloSame.html, 'title')),
     'and it is the cover-image itself, so the filename is written once');
  const cloOther = cimg(SPLIT + 'closing-image: assets/pic.png\n');
  ok(cloOther.code === 0 && uriIn(artOf(cloOther.html, 'closing')),
     'and a path names a different picture for the last slide',
     cloOther.out.split('\n')[0]);
  // The collapse and the ratio both follow the picture. Without one the
  // track is closed up; with one the composition is the cover's again.
  ok(/\.chunk\[data-cover=split\]\[data-closing\]:not\(\[data-closing-art\]\)/.test(cloNone.html),
     'the empty-track collapse stands down for a closing slide that has a picture');
  const cloRatio = cimg('---\ntitle: T\ncover: split\ncover-image: pic\ncover-ratio: 40%\n'
    + 'closing-image: cover\n');
  ok(/data-tag="closing"[\s\S]{0,400}?--cover-ratio:40%/.test(cloRatio.html),
     'and the ratio follows it, because a ratio divides a slide for a picture');
  const cloNoRatio = cimg('---\ntitle: T\ncover: split\ncover-image: pic\ncover-ratio: 40%\n');
  ok(!/data-tag="closing"[^>]*--cover-ratio/.test(cloNoRatio.html),
     'while a closing slide with no picture still takes none, as it always did');
  // ::: backdrop is not made obsolete and is not the same thing: it is a
  // ground behind the type on any of the ten compositions, and the picture
  // track it would have filled is still empty.
  const cloBd = raw(SPLIT + '---\n\n## title: {#title}\n\n## free: F {#f}\n\nB.\n\n'
    + '## closing: Fin {#end}\n\n::: backdrop pic\n', ['--audience-only']);
  ok(cloBd.code === 0 && /data-tag="closing"[^>]*data-has-backdrop/.test(cloBd.html)
     && !/data-tag="closing"[^>]*data-closing-art/.test(cloBd.html),
     'a ::: backdrop on the closing chunk is still a backdrop and not the composition slot',
     cloBd.out.split('\n')[0]);
  // Three refusals, each in the pre-flight so --print-only reaches it, and
  // each mirrored in lint.js.
  const cloBadCover = cimg('---\ntitle: T\ncover: classic\nclosing-image: pic\n', ['--print-only']);
  ok(cloBadCover.code !== 0 && /draws no picture of its own/.test(cloBadCover.out)
     && cloBadCover.files.length === 0,
     'closing-image on a cover that draws no picture is refused before anything is written');
  ok(/bad-closing-image/.test(lintOf('---\ntitle: T\ncover: classic\nclosing-image: pic\n---\n\n'
     + '## title: {#title}\n\n## free: F {#f}\n\nB.\n\n## closing: Fin {#end}\n')),
     'and the linter names it too');
  const cloNoCover = cimg('---\ntitle: T\ncover: beside\nclosing-image: cover\n', ['--print-only']);
  ok(cloNoCover.code !== 0 && /no cover-image is set/.test(cloNoCover.out),
     'closing-image: cover with nothing to reuse is refused rather than drawn empty');
  ok(/bad-closing-image/.test(lintOf('---\ntitle: T\ncover: beside\nclosing-image: cover\n---\n\n'
     + '## title: {#title}\n\n::: draw\nbox a "A"\n:::\n\n## closing: Fin {#end}\n')),
     'in both files');
  const cloNoChunk = raw(SPLIT + 'closing-image: cover\n---\n\n## title: {#title}\n\n'
    + '## free: F {#f}\n\nB.\n', ['--print-only']);
  ok(cloNoChunk.code !== 0 && /no .## closing:. chunk/.test(cloNoChunk.out),
     'and a picture for a slide the deck does not have is a silent no-op, so it is refused');
  ok(/bad-closing-image/.test(lintOf(SPLIT + 'closing-image: cover\n---\n\n## title: {#title}\n\n'
     + '## free: F {#f}\n\nB.\n')),
     'which the linter can see too, from the other end');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map(f => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
