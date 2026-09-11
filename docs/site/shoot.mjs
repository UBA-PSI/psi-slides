#!/usr/bin/env node
/**
 * Re-shoots the site's screenshots from lectures/python-intro, plus the one of
 * the diagram editor from lectures/diagrams, the five decoration.html needs
 * from lectures/decoration, and the four-frame cue-card sequence from
 * lectures/spoken-talk.
 *
 *   node docs/site/shoot.mjs                 # all twenty, into docs/site/img/
 *   node docs/site/shoot.mjs cockpit search  # just those two
 *   node docs/site/shoot.mjs --keep-png      # leave the PNGs beside the WebP
 *
 * Requires the lectures to be built first (`node build.js
 * lectures/python-intro/source.md`, and the same for lectures/diagrams and
 * lectures/decoration if their shots are in the run), `playwright-core` from
 * devDependencies, and a Chromium: $PSI_CHROME wins, then a browser in the Playwright cache,
 * then the system Google Chrome. Encoding needs cwebp or magick on PATH; with
 * neither, the PNGs are kept and the WebP step is skipped with a note.
 *
 * Why a script and not a manual pass with the screenshot key:
 *
 * - The shots have to be reproducible. They are all the same chunk of the
 *   same lecture in six different views, and hand-taken versions drifted in
 *   framing and in size (one shipped at 860 px while the rest were 1440).
 * - `chrome --headless --screenshot` cannot do it. It captures from the
 *   document origin, cannot scroll, and cannot press a key, so a live view is
 *   only ever photographed in its initial state. A driver can put the deck in
 *   the state each figure is about and wait for the camera to settle.
 * - deviceScaleFactor is where the resolution comes from. The viewport stays
 *   at the size the shots were composed at (1440x900) and only the pixel
 *   density goes up, so the layout is identical and the type is not resampled.
 *
 * The editor shot is the one that comes from another lecture, and it has to:
 * the editor ships into a live view only where the lecture has a diagram, and
 * python-intro has none. lectures/diagrams is the reference for every
 * construct, its frontmatter names no `editor:` key so it gets the default
 * `both`, and its four views are tracked, so the shot can never be taken of a
 * lecture nobody rebuilt. It is addressed by fragment rather than walked,
 * because what the shot is about is inside a modal that opens over whichever
 * chunk the camera is on, not the walk that got there.
 *
 * The cue-card sequence is four frames of one slide, and it comes from
 * lectures/spoken-talk. It has to come from somewhere written for the mode:
 * the cards are for a talk that is written out word for word, and the
 * tutorial's notes are examples of note syntax, so a frame of them shows the
 * rail and not the reason for it. spoken-talk exists for this - see the
 * comment at the top of its source.
 *
 * The audience view is walked to the target chunk with the arrow keys rather
 * than addressed by fragment. That was a workaround for the bug where the
 * browser scrolled #stage-viewport to the fragment target and left the camera
 * framing empty space; the runtime resets that scroll now (see
 * resetViewportScroll in build.js), and the walk stays because it is also
 * what a lecturer does, and because the assertion below is worth keeping
 * honest against a fragment path that has been wrong once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, serve, encoder } from './shoot-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LECTURE = path.join(ROOT, 'lectures', 'python-intro');
const IMG = path.join(HERE, 'img');
const TARGET = 'why-playwright';

// A shot may name its own lecture and its own chunk; everything without one is
// the landing page's set, which is one chunk of one lecture in six views.
const lectureOf = (s) => s.lecture ? path.join(ROOT, 'lectures', s.lecture) : LECTURE;
const targetOf = (s) => s.target || TARGET;

// The document views are trimmed to the two chunks the figure frames. Same
// job the fragment does for the live views, done with CSS because print.html
// has no runtime to ask.
const DOC_RIG = `
<style>
.chunk { display: none !important; }
#${TARGET}, #playwright-install { display: revert !important; }
.column-heading, nav.toc { display: none !important; }
main { padding-top: 0 !important; margin-top: 0 !important; }
</style>
`;

// The live view's own chrome is not part of any composition: the help button
// and the edge arrows are controls, and a picture of a slide is a picture of a
// slide. Same rig shoot-gallery.mjs uses on its tiles, and for the same
// reason - the two sets stand on one page.
const LIVE_RIG = `
<style>#help-button, #nav-hints, .annot-add { display: none !important; }</style>
`;

// ── when these shots are stale ───────────────────────────────────────────
//
// Nothing checks that. The ids above are checked, because an id is the one
// part of a shot that can be decided without drawing it; freshness cannot,
// and a gate that pretends otherwise is worse than none, because a green run
// is read as an assurance.
//
// A shot is not a function of source.md alone. It is the lecture, plus the
// stylesheets and runtime inlined by build.js, plus this rig, plus the
// Chromium that drew it. So the trigger to re-shoot is not a file:
//
//   the live views' chrome moved, a viewer default changed, or anything
//   moved a label or an extent.
//
// Both drifts that reached the published site were that and not a lecture
// edit. cockpit.webp predated the clock becoming a large button in the top
// right corner. Six python-intro shots predated the `bold:` default changing
// from accent-bold to plain. A hash over the lecture sources would have
// stayed green through both.
//
// A change that reaches the whole deck is a re-shoot only where a shot frames
// something it touches. python-intro went to style: {blocks: left} deck-wide,
// which moved the code slides in it and left collapsed, full and search
// untouched - those three frame a chunk with no code block. The same walk the other way:
// a chunk inserted between the two the document rig frames moved the margin
// number of the second and not the first, so printed changed and the two
// 470-row handout crops, which stop above the second number, did not. Read the
// number off the shot before deciding; it is four pixels of evidence against
// an afternoon of re-encoding.
//
// The threshold is whether a reader would see the difference at the size the
// page displays the shot. Both of those were visible at reading size. A prose
// edit two tiles deep in the overview thumbnail is not, and the honest answer
// there is to write the shot down as known-stale and let the next visible
// reason carry it, rather than to churn twenty shots for pixels nobody reads.
//
// One coupling that is easy to miss: docs/artifact/refresh-figures.mjs inlines
// img/editor.webp into figures-you-write.html, because that page fetches
// nothing at run time. A re-shoot therefore drifts a page under docs/artifact/,
// and pages.yml runs refresh-figures --check before it assembles the site. Run
// it after shooting, and commit the manual with the images.

const SHOTS = [
  { name: 'collapsed', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true },
  { name: 'full', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    // Long enough for the "collapse: show everything" toast to fade: it is
    // feedback for the lecturer, not part of the slide.
    act: async (p) => { await p.keyboard.press('c'); await p.waitForTimeout(3000); } },
  { name: 'overview', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    act: async (p) => { await p.keyboard.press('o'); await p.waitForTimeout(1500); } },
  { name: 'search', src: 'audience.html', w: 1440, h: 900, dsf: 1.5, live: true,
    act: async (p) => {
      await p.keyboard.press('/');
      await p.fill('#search-input', 'async');
      await p.waitForTimeout(500);
    } },
  { name: 'cockpit', src: 'speaker.html', w: 1440, h: 900, dsf: 1.5, frag: true },
  { name: 'printed', src: 'print.html', w: 1000, h: 625, dsf: 2.15, rig: DOC_RIG },
  // 470 rather than 690, and the reason is DESIGN.md's fifth rule. The frame
  // held two chunks of the document, and the second one carries nothing the
  // first does not: the claim beside it is hyphenation, a line length made
  // for reading, and the margin note as an aside, and all three are in the
  // first chunk. As two chunks the shot came out 762px tall against 240px of
  // words in the row beside it - a picture three times its own argument.
  { name: 'handout', src: 'print-notes.html', w: 860, h: 470, dsf: 2.5, rig: DOC_RIG },
  // The same frame again from print.html, so the landing page can offer the
  // two handouts as one switch rather than showing the notes version and
  // calling it what the students take away. Identical geometry to `handout`
  // on purpose: a switch that changes the crop as well as the file reads as
  // two pictures, not as one file becoming another.
  { name: 'handout-plain', src: 'print.html', w: 860, h: 470, dsf: 2.5, rig: DOC_RIG },
  // The editor, opened on a figure with beats. 1280 is the narrowest viewport
  // that still fits the whole top bar - at 1200 the Close button is cut in
  // half, and a screenshot of a clipped UI reads as a broken one.
  { name: 'editor', src: 'audience.html', w: 1280, h: 850, dsf: 1.5,
    lecture: 'diagrams', target: 'cbc', frag: true, act: openEditor },
  // A figure on the slide, for the preview section on the landing page. It is
  // a projection rather than a cut-out drawing, because what the section
  // claims is that these are lecture slides, not pictures pasted onto them.
  // network-security rather than diagrams: its chunks are slides from a real
  // course rather than a construct reference. #ns-a03 has
  // no reveal separator, so the projection opens on the finished figure -
  // #lifecycle looked empty, because its first segment is one row of three.
  { name: 'figure', src: 'print.html', w: 1200, h: 900, dsf: 2,
    lecture: 'network-security', target: 'ns-a03',
    clip: '#ns-a03 svg.psi-diagram' },
  // ── the cue-card sequence, four frames of one slide ─────────────────────
  // The cockpit's third arrangement, for the "In the room" page. One still
  // frame of it does not explain itself: what a reader has to see is the
  // cursor walking the rail while the figure on the projection walks its
  // steps, and that is a change between two pictures, not a picture.
  //
  // #second-time is the case the mode was built for: a figure with three
  // `step` blocks and four notes, three of them pinned with
  // `> note: from N`. So the rail interleaves card, click, card, click - and
  // the four frames are the cursor standing on each of the four cards, with
  // the figure at the beat that card is spoken over.
  //
  // Even presses only. The rail carries an entry for the projector click
  // itself, so the cursor lands on a card, then on a click, then on the next
  // card: 0, 2, 4, 6 are the four frames where a card is current and the
  // figure has just moved. Deriving them rather than counting them would
  // need the rail's own model, and the count is asserted below instead.
  ...[0, 2, 4, 6].map((presses, i) => ({
    name: `cue-beat-${i}`, src: 'speaker.html', w: 1440, h: 900, dsf: 1.5,
    lecture: 'spoken-talk', target: 'second-time', frag: true,
    act: (p) => cueFrame(p, presses),
  })),
  // The live annotation filling the frame, with the QR code the address gets.
  // python-intro, so it is the same lecture as the rest of the live set, and
  // typed rather than pre-seeded: the size is derived from the text, so a
  // shot of it has to go through the same keystrokes a lecturer makes.
  { name: 'annotation', src: 'audience.html', w: 1440, h: 900, dsf: 1.5,
    live: true, act: typeAnnotation },
  // ── the decoration page's five ──────────────────────────────────────────
  // Cards, rows, a backdrop, a panel and a dock, for decoration.html. They
  // belong here rather than in shoot-gallery.mjs, and the split is the one
  // that script's own header draws: the gallery writes sixteen decks because
  // a deck has exactly one `cover:` and one `section:`, so sixteen
  // compositions cannot share a source. These five are not one per deck -
  // they all live together in lectures/decoration, which is a tracked build
  // and the place every construction is shown rather than described. That is
  // this script's case exactly, and the same one the editor shot makes from
  // lectures/diagrams: one chunk of a tracked lecture, addressed by id.
  //
  // 1280x720 at 1.5, which is the gallery tile's frame and not this script's
  // usual 1440x900, because on decoration.html these five stand among the
  // sixteen gallery tiles. Every picture on that page is a picture of the
  // same slide shape or the page reads as two sets.
  ...[
    // Three outline cards under the sentence that says what a card is not.
    { name: 'deco-cards', target: 'cards-why' },
    // The same vocabulary turned ninety degrees, so the two stand as one
    // pair on the page.
    { name: 'deco-rows', target: 'rows' },
    // The backdrop after its window has walked one beat. #reveal-close rather
    // than #reveal-open, which is the same construct in the other direction:
    // there the picture retreats to a right-hand band and the words stand on
    // paper beside it, which is the composition the panel shot below already
    // has. Here the picture grows over the title instead, so the two tiles
    // are two pictures rather than one twice.
    { name: 'deco-backdrop', target: 'reveal-close',
      act: async (p) => { await p.keyboard.press(' '); await p.waitForTimeout(1400); } },
    // An overlay panel as a column the full height of the frame.
    { name: 'deco-panel', target: 'panel-column' },
    // The dock inherited by `.every`, on the slide whose own words are the
    // distinction the page is built on.
    { name: 'deco-dock', target: 'dock-why' },
  ].map((s) => ({
    src: 'audience.html', w: 1280, h: 720, dsf: 1.5,
    lecture: 'decoration', frag: true, rig: LIVE_RIG, ...s,
  })),
];

// How wide the film strip is dragged for the sequence. The mode opens at a
// strip of about 300px, which is right for a talk whose slides are words: a
// glance is enough to know which one is up. This slide is a drawing that
// changes on every press, and at 300px the change is four grey rectangles
// moving. The handle is the lecturer's own (drag the seam, double-click
// resets), so this is a setting a room would make, not a rig.
const CUE_STRIP_PX = 620;

// One frame of the sequence: cue-card mode, the strip widened, N presses.
async function cueFrame(p, presses) {
  await p.keyboard.press('k');
  await p.waitForTimeout(1200);
  if (!(await p.locator('body.cue-cards #cue-rail .cue-card').count())) {
    throw new Error('cue cards: the rail is empty');
  }

  const seam = await p.locator('#preview-resizer').boundingBox();
  if (!seam) throw new Error('cue cards: no resize handle');
  await p.mouse.move(seam.x + seam.width / 2, seam.y + seam.height / 2);
  await p.mouse.down();
  await p.mouse.move(CUE_STRIP_PX, seam.y + seam.height / 2, { steps: 12 });
  await p.mouse.up();
  // Off the handle again, or every frame carries its hover tooltip.
  await p.mouse.move(20, 20);

  for (let i = 0; i < presses; i++) {
    await p.keyboard.press(' ');
    await p.waitForTimeout(600);
  }

  // The frame is only the frame if a card is current. An entry for the
  // projector click sits between two cards, and a sequence photographed one
  // press out would show the rail moving and the figure standing still.
  const cur = await p.evaluate(() => {
    const e = document.querySelector('#cue-rail .cue-entry.cur');
    return e ? (e.querySelector('.cue-card') ? 'card' : 'click') : 'none';
  });
  if (cur !== 'card') throw new Error(`cue-cards: after ${presses} presses the cursor is on a ${cur}`);

  // Long enough for the mode's toast to fade: it stands over the header,
  // which is where the crumb, the counters, the clock and the drift are -
  // and the drift is half of what this shot is about.
  await p.waitForTimeout(3500);
}

async function typeAnnotation(p) {
  await p.keyboard.press('n');
  await p.waitForTimeout(400);
  await p.keyboard.type('Exercise 3, due Friday\nhttps://uba-psi.github.io/psi-slides/');
  await p.waitForTimeout(900);
  if (!(await p.locator('.chunk.annot-visible .annot-qr svg').count())) {
    throw new Error('annotation: no QR code for the address');
  }
}

// What the shot has to show is not that the editor exists but what it knows:
// the relations the figure was written with, drawn on the canvas beside the
// element they hold. So it opens at the last beat, fits the frame, and selects
// one box - `c1`, which is placed against its neighbour and aligned with the
// row, so the canvas carries a `gap`, a `flush` and an `align` at once.
//
// The zoom is left at what Fit answers. One step in fills the canvas better and
// pushes the frame past both edges, which takes the outermost relation label
// with it.
// Both figure lectures pin theme: dark in their frontmatter, and every other
// screenshot on the landing page is on paper - one dark plate in the set reads
// as a different product rather than as a different theme. A is the key a
// lecturer presses, so the shot cycles it exactly as the room would, and stops
// on the first light theme rather than counting presses: the cycle is built
// from THEME_NAMES and a new theme would silently move the count.
async function toLightTheme(p) {
  for (let i = 0; i < 8; i++) {
    if (await p.evaluate(() => document.body.dataset.mode === 'light')) return;
    await p.keyboard.press('a');
    await p.waitForTimeout(220);
  }
  throw new Error('figure shot: no light theme after a full cycle of A');
}

async function openEditor(p) {
  await p.click('#cbc figure.figure-diagram svg', { position: { x: 8, y: 8 } });
  await p.waitForTimeout(400);
  await p.keyboard.press('e');
  await p.waitForTimeout(900);
  if (!(await p.locator('#dge-root').count())) throw new Error('editor: did not open');
  await p.evaluate(() => {
    const beats = [...document.querySelectorAll('#dge-beats .dge-beat')];
    if (beats.length) beats[beats.length - 1].click();
  });
  await p.waitForTimeout(500);
  const fit = p.locator('#dge-root button', { hasText: /^Fit$/ }).first();
  if (!(await fit.count())) throw new Error('editor: no Fit button');
  await fit.click();
  await p.waitForTimeout(600);
  const at = await p.evaluate(() => {
    const el = document.querySelector('#dge-art-svg [id$="-c1"] rect');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) throw new Error('editor: box c1 is not on the canvas');
  await p.mouse.click(at.x, at.y);
  await p.waitForTimeout(600);
  const sel = await p.evaluate(() =>
    ((document.querySelector('#dge-side .dge-sel-head') || {}).textContent || '').trim());
  if (!/c1/.test(sel)) throw new Error(`editor: selected "${sel}", expected box c1`);
}

// ── the rig, and a server for it ─────────────────────────────────────────
function buildRig(shots) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'psi-shoot-'));
  for (const s of shots) {
    const lecture = lectureOf(s);
    const abs = path.join(lecture, s.src);
    if (!fs.existsSync(abs)) {
      const err = new Error(
        `${path.relative(ROOT, abs)} is missing.\n` +
        `Build the lecture first: node build.js ` +
        `${path.relative(ROOT, path.join(lecture, 'source.md'))}`);
      err.userFacing = true;
      throw err;
    }
    fs.writeFileSync(path.join(dir, s.name + '.html'),
                     fs.readFileSync(abs, 'utf8') + (s.rig || ''));
  }
  return dir;
}

// ── driving the deck ─────────────────────────────────────────────────────
const activeId = (p) => p.evaluate(() => {
  const a = document.querySelector('.chunk.active');
  return a ? a.id : null;
});

// Down steps within a column, Right moves to the next one, so a sweep needs
// both: Down until it stops changing anything, then Right, then Down again.
async function walkTo(p, target) {
  let last = await activeId(p);
  for (let i = 0; i < 200; i++) {
    if (last === target) return;
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(110);
    let now = await activeId(p);
    if (now === last) {
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(110);
      now = await activeId(p);
      if (now === last) throw new Error(`stuck at #${last || '(no id)'}`);
    }
    last = now;
  }
  throw new Error(`never reached #${target}`);
}

// A chunk outside the viewport means the camera did not land, and the shot
// would be of an empty stage. That has happened; it is fatal here.
async function assertOnScreen(p, name, target) {
  const r = await p.evaluate((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    const v = document.getElementById('stage-viewport').getBoundingClientRect();
    return {
      on: b.x < v.right && b.y < v.bottom && b.x + b.width > v.left && b.y + b.height > v.top,
      x: Math.round(b.x), y: Math.round(b.y),
    };
  }, target);
  if (!r.on) throw new Error(`${name}: #${target} is off screen (x=${r.x} y=${r.y})`);
}

// ── the chunk ids this file addresses ────────────────────────────────────
//
// Ten shots name a chunk by id, and DOC_RIG names two more in CSS. Those ids
// are a contract with five lecture sources that know nothing about it: the
// `{#id}` tails are frozen once authored for other reasons, and this file is
// not one of the places anybody looks when renaming one. A rename used to
// surface as `never reached #foo` after a Chromium launch and a full lecture
// build, which names the symptom and not the cause.
//
// So the ids are checked against the sources first, without a browser. It is
// the only part of a shot that can be decided that way - see the note above
// the shot table for what deliberately cannot be.
function checkTargets(list) {
  const need = new Map();
  const want = (lec, id) => {
    if (!need.has(lec)) need.set(lec, new Set());
    need.get(lec).add(id);
  };
  for (const s of list) want(lectureOf(s), targetOf(s));
  // DOC_RIG trims the document views to two chunks, and the second one is
  // named in CSS rather than in a shot row.
  want(LECTURE, TARGET);
  want(LECTURE, 'playwright-install');

  const missing = [];
  for (const [dir, ids] of need) {
    const src = path.join(dir, 'source.md');
    if (!fs.existsSync(src)) { missing.push(`${path.relative(ROOT, src)} is missing`); continue; }
    const have = new Set();
    for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
      if (!line.startsWith('## ')) continue;
      const tail = line.match(/\{([^}]*)\}\s*$/);
      if (!tail) continue;
      const id = tail[1].match(/#([A-Za-z0-9_-]+)/);
      if (id) have.add(id[1]);
    }
    for (const id of ids) {
      if (!have.has(id)) missing.push(`#${id} is not a chunk of ${path.relative(ROOT, src)}`);
    }
  }
  return missing;
}

// ── main ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const keepPng = argv.includes('--keep-png');
const wanted = argv.filter(a => !a.startsWith('--'));
const shots = wanted.length ? SHOTS.filter(s => wanted.includes(s.name)) : SHOTS;
if (!shots.length) {
  console.error(`unknown shot. known: ${SHOTS.map(s => s.name).join(', ')}`);
  process.exit(1);
}

// Before the browser, before the builds: the ids still exist.
const missing = checkTargets(shots);
if (missing.length) {
  console.error('shoot.mjs addresses chunks that are not there:');
  for (const m of missing) console.error(`  ${m}`);
  console.error('A chunk id moved. Repoint the shot row, or put the id back.');
  process.exit(2);
}
if (argv.includes('--check-ids')) {
  console.log(`ids ok: ${shots.length} shot(s) address chunks that exist`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. Run: npm install');
  process.exit(1);
}

const dir = buildRig(shots);
const { server, port } = await serve(dir);
const enc = encoder();
if (!enc) console.log('no cwebp or magick on PATH - writing PNG only');

const browser = await chromium.launch({ executablePath: findChrome() });
try {
  for (const s of shots) {
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.dsf,
    });
    const page = await ctx.newPage();
    const target = targetOf(s);
    await page.goto(`http://127.0.0.1:${port}/${s.name}.html` + (s.frag ? `#${target}` : ''),
      { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if (s.live) { await walkTo(page, target); await page.waitForTimeout(700); }
    // Checked before the state change: overview and search deliberately
    // cover or shrink the stage, so the assertion belongs to the landing.
    if (s.live || s.frag) await assertOnScreen(page, s.name, target);
    if (s.act) await s.act(page);

    const png = path.join(IMG, s.name + '.png');
    // A shot may name one element instead of the viewport. Only the figure
    // shot does: what it has to show is the drawing, and everything else on
    // that slide is the lecture's own German commentary, a page number and a
    // lot of paper. Clipping also puts the theme toast outside the frame.
    const frame = s.clip ? page.locator(s.clip) : page;
    if (s.clip && !(await page.locator(s.clip).count())) {
      throw new Error(`${s.name}: nothing matches ${s.clip}`);
    }
    await frame.screenshot({ path: png });
    let out = png;
    if (enc) {
      out = path.join(IMG, s.name + '.webp');
      const r = spawnSync(enc.bin, enc.args(png, out, 86), { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${enc.bin} failed on ${s.name}`);
      if (!keepPng) fs.rmSync(png);
    }
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ${s.name.padEnd(10)} ` +
                `${Math.round(s.w * s.dsf)}x${Math.round(s.h * s.dsf)}  ${kb} KB  ` +
                `-> ${path.relative(ROOT, out)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
