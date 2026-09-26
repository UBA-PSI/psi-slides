// Generate docs/site/display-faces.html: every candidate display face drawn
// into a cover and a section divider, as a page of the project site.
//
//   node tools/font-playground/build-playground.mjs           # write the page
//   node tools/font-playground/build-playground.mjs --check   # report drift
//
// THE PAGE IS TRACKED AND GENERATED, which is the arrangement
// docs/artifact/figures-you-write.html already has: a tracked HTML file that
// nobody edits by hand, kept honest by a --check that pages.yml runs before it
// assembles the site. A staleness gate nothing runs is a comment, so the check
// is wired into that workflow beside the figure pages'.
//
// There used to be a second, local `font-playground.html` beside this file with
// the same 32 specimens in a plain shell. Two near-identical pages is a
// duplication with no reader, so there is one page now and it is the published
// one - open `docs/site/display-faces.html` straight off disk while working,
// the way the site's other hand-written pages are read.
//
// Self-contained fonts, for the reason the lecture outputs are: a page that
// linked Google's CDN would be showing a face the built HTML would not have.
// Every candidate is embedded exactly the way the engine embeds it - one latin
// woff2, base64, in an @font-face, carrying the measured `size-adjust` - so
// what the page draws is what a lecture would ship, payload figure included.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, FLAVOURS } from './roster.mjs';
const SCALES = JSON.parse(fs.readFileSync(new URL('./scales.json', import.meta.url), 'utf8'));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const OUT = path.join(repo, 'docs/site/display-faces.html');
const CHECK = process.argv.includes('--check');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kb = (n) => (n / 1024).toFixed(0);

// The faces come out of the ENGINE's node_modules first, and this matters
// rather than being a convenience: all 32 candidates are dependencies of the
// root package now, so `--check` has everything it needs after a plain
// `npm ci` - which is the only install pages.yml does. The fallback is this
// package's own tree, where the next revision of the roster is explored and a
// candidate the engine does not carry yet would live.
function face(pkg, file) {
  const tried = [repo, here].map((root) => path.join(root, 'node_modules', pkg));
  const dir = tried.find((d) => fs.existsSync(path.join(d, 'files', file)));
  if (!dir) {
    throw new Error(`no ${pkg}/files/${file} in\n  ` + tried.join('\n  ')
      + '\nRun `npm install` at the repository root.');
  }
  const buf = fs.readFileSync(path.join(dir, 'files', file));
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')); } catch {}
  return { buf, meta, b64: buf.toString('base64') };
}

// `size-adjust` is the whole point of the second argument, so it is spelled
// out here rather than passed around: the engine applies the measured width
// correction as a descriptor on the @font-face and not as a multiplier on a
// font-size, which is what makes it reach every cover composition, print, the
// zoom and auto-fit without any of them knowing about it. A page that claims
// to show what a deck would look like has to correct the same way, or it is
// showing a size nothing else draws. See fontStyleTag in build.js.
const faceCss = (family, b64, weight, sizeAdjust) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;`
  + (sizeAdjust && sizeAdjust !== 100 ? `size-adjust:${sizeAdjust}%;` : '')
  + `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

// ── the body face the candidates are set against ─────────────────────
// Literata, embedded: it is the deck's serif and the site does not carry it.
// The sans half of the pairing is the site's own IBM Plex Sans, already loaded
// from fonts/ beside site.css and the same Fontsource cut build.js embeds - so
// a card shows the contrast a real slide would have without this page paying
// 100 KB for a second copy of a face the reader has already downloaded.
const literata = face('@fontsource-variable/literata', 'literata-latin-wght-normal.woff2');
const deckCss = faceCss('Literata', literata.b64, '100 900');

// ── the candidates ───────────────────────────────────────────────────
const fonts = CANDIDATES.map((c) => {
  const { buf, meta, b64 } = face(c.pkg, c.file);
  const family = meta.family || c.pkg.split('/').pop();
  const scale = SCALES[c.pkg] ?? 1;
  // The percentage the engine's roster carries, derived from the same measured
  // multiplier rather than copied, so the two cannot drift by a rounding step.
  const pct = Math.round(scale * 100);
  return {
    ...c,
    family,
    scale,
    pct,
    // The pairing rule, shown rather than stated: a display serif is drawn
    // over a sans body and a display sans over a serif body, which is what
    // the linter warns about when a deck does the opposite. A hand or a
    // mono pairs with either, so it gets the deck's default serif.
    body: c.kind === 'serif' ? 'var(--sans)' : "'Literata'",
    // A static face is one weight and the slider must not reach it: asking a
    // 400-only face for 700 gets a browser-synthesised bold, which is not a
    // specimen of anything. So each card opens at the weight a headline is
    // really set in - the top of a variable range, the single cut otherwise -
    // and only the variable cards follow the slider.
    headWeight: Math.min(900, Number(String(c.weight).trim().split(/\s+/).pop()) || 400),
    css: faceCss(family, b64, c.weight, pct),
    bytes: buf.length,
    licence: meta.license?.type || 'unknown',
    subsets: meta.subsets || [],
  };
});

const unknownLicence = fonts.filter((f) => !/^OFL/i.test(f.licence));
if (unknownLicence.length) {
  console.warn('Not OFL – check before shipping: ' + unknownLicence.map((f) => `${f.family} (${f.licence})`).join(', '));
}

const totalKb = kb(fonts.reduce((a, f) => a + f.bytes, 0));
const median = kb([...fonts].sort((a, b) => a.bytes - b.bytes)[fonts.length >> 1].bytes);
const counts = Object.fromEntries(Object.keys(FLAVOURS)
  .map((fl) => [fl, fonts.filter((f) => f.flavour === fl).length]));

// The kind badge says the PAIRING rather than repeating the word. For a hand
// face the two fields carry the same word - flavour `hand`, kind `hand` - and
// two identical chips side by side read as a rendering fault rather than as
// two answers to two questions. What a reader needs off this badge is the one
// rule the field exists for.
const PAIR = { serif: 'over a sans', sans: 'over a serif', hand: 'over either', mono: 'over either' };
const PAIR_WHY = {
  serif: 'set it over a sans body, or a display serif over the deck\'s own serif reads as one typeface set badly',
  sans: 'set it over a serif body, or a display sans over the deck\'s own sans reads as one typeface set badly',
  hand: 'a hand pairs with either body face',
  mono: 'a monospace pairs with either body face',
};

function stage(kind) {
  return kind === 'cover' ? `
     <div class="spec" data-kind="cover" tabindex="0" role="button" aria-label="enlarge this cover">
      <div class="slide cover">
       <p class="eyebrow" data-slot="eyebrow"></p>
       <h4 class="headline" data-slot="title"></h4>
       <p class="subtitle" data-slot="subtitle"></p>
       <div class="credits">
        <p class="presenter" data-slot="presenter"></p>
        <p class="affiliation" data-slot="affiliation"></p>
        <p class="info" data-slot="info"></p>
       </div>
      </div>
     </div>` : `
     <div class="spec" data-kind="divider" tabindex="0" role="button" aria-label="enlarge this divider">
      <div class="slide divider">
       <p class="part" data-slot="part"></p>
       <h4 class="section" data-slot="section"></h4>
       <p class="section-sub" data-slot="section-sub"></p>
      </div>
     </div>`;
}

const cards = fonts.map((f) => `
   <article class="face" data-flavour="${f.flavour}" data-kind="${f.kind}"${f.variable ? ' data-variable' : ''}
     style="--display:'${f.family}'; --display-pct:${f.pct}; --display-weight:${f.headWeight}; --body:${f.body}">
    <div class="face-head">
     <h3 class="face-name">${esc(f.family)}</h3>
     <p class="badges">
      <span class="chip chip-${f.flavour}">${f.flavour}</span>
      <span title="a display ${f.kind}: ${PAIR_WHY[f.kind]}">${PAIR[f.kind]}</span>
      <span class="num" title="the measured width correction, emitted as size-adjust on the @font-face">${f.pct}&thinsp;%</span>
      <span class="num" title="one latin woff2 – the payload a deck naming this face carries in every view">${kb(f.bytes)} KB</span>
      <span>${esc(f.licence)}</span>
      ${f.variable ? `<span title="a weight axis, so the slider reaches this one">wght ${esc(f.weight)}</span>` : ''}
      <span class="missing" data-family="${esc(f.family)}"></span>
     </p>
     <p class="face-note">${esc(f.note)}</p>
     <p class="face-pkg"><code>fonts: {display: ${esc(f.family)}}</code></p>
    </div>
    <div class="stages">
     ${stage('cover')}
     ${stage('divider')}
    </div>
   </article>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Display faces &ndash; psi-slides</title>
<link rel="stylesheet" href="site.css">
<style>
/*
 * GENERATED by tools/font-playground/build-playground.mjs from roster.mjs and
 * scales.json. Do not edit this file - run the script.
 *
 * Everything structural comes from site.css: the frame, the bands, the text
 * scale, the palette, the chrome, the stage, .way-tabs for the control row.
 * What is left is the specimen machinery, which no other page has: 32 embedded
 * faces, a mock cover and a mock divider drawn in container units, and the
 * controls that set them.
 */

/* ── the deck's serif, and the 32 candidates ──────────────────────────
   The sans half of every pairing is the site's own --sans, which is the same
   IBM Plex Sans cut build.js embeds into a lecture. */
${deckCss}
${fonts.map((f) => f.css).join('\n')}

/*
 * ── the specimen's own ground ─────────────────────────────────────────
 *
 * A slide keeps the deck's colours, not the page's. The site follows the
 * reader's colour scheme; a lecture does not, and a specimen that went dark
 * because the reader's laptop is in dark mode would be showing a slide nobody
 * asked for. These are the audience view's default theme and its dark one, and
 * the dark-ground control moves between them - the divider is where a deck
 * most often goes dark, which is the question that control answers.
 */
.slide {
  --s-paper: oklch(0.98 0 0);
  --s-ink: oklch(0.26 0.01 260);
  --s-soft: oklch(0.46 0.01 260);
  --s-emph: oklch(0.42 0.16 30);
  --s-rule: oklch(0.88 0 0);
}
body[data-ground="ink"] .slide {
  --s-paper: oklch(0.17 0.005 260);
  --s-ink: oklch(0.95 0 0);
  --s-soft: oklch(0.72 0.01 260);
  --s-emph: oklch(0.76 0.15 35);
  --s-rule: oklch(0.30 0.005 260);
}

/* A row of controls is looked at rather than read, so it runs the frame like
   every other such thing on this site rather than stopping at the prose
   measure. site.css already says this for the stage the gallery stands on. */
.wrap > .controls { max-width: none; }

/*
 * ── the controls ──────────────────────────────────────────────────────
 *
 * Sticky under the university bar, because the page's whole question is
 * “does it hold MY title”, and a reader typing one is thirty cards down by
 * the time they want to change it. The offset is the bar's own height, measured
 * rather than guessed: 42px at 960, 1100, 1280, 1440, 1920 and 2560 - the strip
 * is one row of 0.78rem type round a 21px mark and does not move on a desktop
 * window. Below 60rem it can wrap, and the number stops being true, so the row
 * simply stops being sticky there: a control strip that hides half of itself
 * behind the chrome is worse than one that scrolls away.
 */
.controls {
  position: sticky;
  top: 42px;
  z-index: 20;
  /* Opaque, not a translucent blur: a dark-ground specimen scrolling under a
     92 % paper strip shows through it as a stain the width of one card, which
     reads as a panel that does not belong to anything. */
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  margin: 0 0 1.8rem;
  padding: 0.9rem 0 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem 1.6rem;
  align-items: flex-end;
}
@media (max-width: 60rem) { .controls { position: static; } }
.field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.field > label,
.field > .label {
  font-size: var(--fs-fine);
  color: var(--ink-soft);
  letter-spacing: 0.04em;
}
.field input[type="text"] {
  font: inherit;
  font-size: var(--fs-note);
  font-family: var(--sans);
  padding: 0.3rem 0.5rem;
  width: min(100%, 19rem);
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--shot-bg);
  color: var(--ink);
}
.field input[type="text"].short { width: min(100%, 8rem); }
.field input[type="range"] { width: 9rem; accent-color: var(--accent); }
.controls .way-tabs { margin: 0; }
/* site.css marks the chosen tab with .is-tied; these are pressed buttons and
   carry the state where a screen reader can find it, so the same look is tied
   to aria-pressed rather than to a second class that would have to agree with
   it. */
.controls .way-tabs button[aria-pressed="true"] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}

/*
 * ── the gallery ───────────────────────────────────────────────────────
 *
 * DESIGN.md's first rule, and this page is the sharpest case of it on the
 * site: every picture here is a picture of text, and a mock slide dropped on
 * the page reads as more page. So the whole grid stands on one stage, and each
 * specimen is a white object on that field - the same two edges a screenshot
 * gets, paid once for 32 of them rather than 32 times.
 */
.faces {
  display: grid;
  gap: clamp(0.9rem, 1.6vw, 1.6rem);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--card, 26rem)), 1fr));
}
.face {
  background: var(--shot-bg);
  border-radius: 8px;
  overflow: hidden;
  min-width: 0;
}
.face[hidden] { display: none; }
.face-head { padding: 0.9rem 1rem 0.75rem; }
.face-name {
  margin: 0;
  font-size: var(--fs-lead);
  font-weight: 600;
  line-height: 1.2;
  /* The name set in the face it names. A specimen of six words is still a
     specimen, and it is the first thing a reader scanning the column sees. */
  font-family: var(--display), var(--sans);
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.5rem 0 0;
  font-size: var(--fs-fine);
  color: var(--ink-soft);
  max-width: none;
}
.badges span {
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 0.05rem 0.36rem;
  white-space: nowrap;
}
.badges .num { font-variant-numeric: tabular-nums; }
.chip-hand { color: oklch(0.45 0.08 150); border-color: oklch(0.45 0.08 150 / 0.4); }
.chip-machine { color: oklch(0.45 0.10 255); border-color: oklch(0.45 0.10 255 / 0.4); }
.chip-graphic { color: oklch(0.48 0.11 50); border-color: oklch(0.48 0.11 50 / 0.4); }
@media (prefers-color-scheme: dark) {
  .chip-hand { color: oklch(0.80 0.10 150); }
  .chip-machine { color: oklch(0.78 0.09 255); }
  .chip-graphic { color: oklch(0.80 0.10 50); }
}
/* The one finding the probe below is for, so it is the one badge in the
   page's accent rather than in the rule grey. */
.badges .missing:empty { display: none; }
.badges .missing { color: var(--accent); border-color: currentColor; }
.face-note {
  margin: 0.6rem 0 0.3rem;
  font-size: var(--fs-note);
  line-height: 1.45;
  color: var(--ink-soft);
  max-width: none;
}
.face-pkg { margin: 0; font-size: var(--fs-fine); max-width: none; }
.face-pkg code { font-size: 1em; }

.stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rule);
  border-top: 1px solid var(--rule);
}
body[data-view="cover"] .spec[data-kind="divider"],
body[data-view="divider"] .spec[data-kind="cover"] { display: none; }
body:not([data-view="both"]) .stages { grid-template-columns: 1fr; }
/* Two 16:9 boxes side by side in a phone-width card are two thumbnails, not
   two specimens. */
@media (max-width: 48rem) { .stages { grid-template-columns: 1fr; } }
.spec { container-type: inline-size; cursor: zoom-in; background: var(--stage); }
.spec:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

/*
 * ── the mock slides ───────────────────────────────────────────────────
 *
 * One 16:9 box, and every measurement inside it in cqw, so a card at 540px and
 * the enlarged one at 1200px are the same slide at two sizes. That is the whole
 * reason for the container query: a display face judged at one size is not
 * judged.
 *
 * TWO THINGS HERE ARE THE ENGINE'S BEHAVIOUR AND NOT A CHOICE:
 *
 * The headline is NOT multiplied by the measured correction. That number rides
 * as size-adjust on the @font-face above, exactly as build.js emits it, so
 * the size written here is the size a cover composition writes.
 *
 * The tracking is normal, and the engine resets it the same way. A cover sets
 * a negative letter-spacing tuned for the body serif - -0.042em under
 * cover: display - and a condensed display face, fitted by the person who
 * drew it, came out with its letters touching. DISPLAY_TRACK in build.js is the
 * list of every rule that had to be reset; the reset is letter-spacing:
 * normal, and a specimen page that quietly put it back would be showing a
 * defect that was fixed.
 *
 * The line height IS multiplied by it, for the reason DISPLAY_LH gives:
 * size-adjust scales the glyphs and the face's own metrics, but a numeric
 * line-height resolves against the nominal font-size and does not follow, so a
 * three-line German title in a face at 120 % collides with itself.
 */
.slide {
  aspect-ratio: 16 / 9;
  background: var(--s-paper);
  color: var(--s-ink);
  display: flex;
  flex-direction: column;
  padding: 6cqw 7cqw;
  overflow: hidden;
  font-family: var(--body), var(--sans);
}
.slide .headline,
.slide .section {
  margin: 0;
  font-family: var(--display), var(--sans);
  font-weight: var(--display-weight, 400);
  font-synthesis-weight: none;
  font-size: var(--headline-size, 7.6cqw);
  line-height: calc(1.04 * var(--display-pct, 100) / 100);
  letter-spacing: var(--display-track, normal);
  color: var(--s-ink);
  text-wrap: balance;
}
.slide .eyebrow {
  margin: 0 0 1.6cqw;
  font-family: var(--sans);
  font-size: 2.1cqw;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--s-soft);
  max-width: none;
}
.slide .subtitle {
  margin: 2.2cqw 0 0;
  font-size: 3cqw;
  line-height: 1.3;
  color: var(--s-soft);
  max-width: 34ch;
}
.cover .credits { margin-top: auto; padding-top: 3cqw; border-top: 1px solid var(--s-rule); }
.cover .credits p { margin: 0; max-width: none; }
.cover .presenter { font-size: 2.5cqw; font-weight: 600; }
.cover .affiliation { font-size: 2.1cqw; color: var(--s-soft); }
.cover .info { margin-top: 1cqw; font-size: 1.9cqw; color: var(--s-soft); }
.divider { justify-content: center; }
.divider .part {
  margin: 0 0 1.8cqw;
  font-family: var(--sans);
  font-size: 2.1cqw;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--s-emph);
  max-width: none;
}
.divider .section { font-size: var(--divider-size, 9.5cqw); }
.divider .section-sub {
  margin: 2.4cqw 0 0;
  font-size: 2.7cqw;
  color: var(--s-soft);
  max-width: 40ch;
}
body[data-caps="on"] .slide .headline,
body[data-caps="on"] .slide .section { text-transform: uppercase; }

/* ── the enlarged specimen ────────────────────────────────────────────
   site.css owns .lightbox - the fixed field, the ground, the scroll lock -
   and it holds an <img> everywhere else on the site. Here it holds a clone of
   the slide, so what it needs of its own is the container the cqw units are
   read against. */
.lightbox .zoom-wrap { width: min(1280px, 100%); display: grid; gap: 0.8rem; cursor: default; }
.lightbox .spec { container-type: inline-size; border-radius: 4px; overflow: hidden; }
.lightbox .zoom-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1.2rem;
  align-items: baseline;
  font-size: var(--fs-fine);
  color: #cbc7c3;
}
.lightbox .zoom-head strong { font-size: var(--fs-lead); color: #ffffff; font-weight: 600; }
</style>
</head>
<body data-view="both" data-ground="paper" data-caps="off">
<!--topbar-->
<main class="banded">

<section class="band band-hero">
 <div class="wrap">
  <p class="mark"><b>psi-slides</b> &middot; the display role</p>
  <h1>Thirty-two faces for a title slide</h1>
  <p class="lede">A cover, a closing slide and the section dividers are the one
  place in a lecture where a loud typeface is not a mistake. These are the faces
  that ship with the tool for that job, each one drawn into a real cover and a
  real divider, with the title you type into it.</p>
  <p><code>fonts: {display: Anton}</code> in the frontmatter is the whole of it,
  and it reaches those three slides and nothing else &ndash; an ordinary heading, a
  card lead, a figure label all keep the body type.
  <a href="decoration.html#display-face">What the role does</a> is on the
  decoration page; this page is the roster.</p>
 </div>
</section>

<section class="band">
 <div class="wrap">
  <h2 id="roster">The roster</h2>
  <p class="lede">${fonts.length} faces &ndash; ${counts.hand} hand, ${counts.machine} machine,
  ${counts.graphic} graphic. Median ${median}&nbsp;KB each, ${totalKb}&nbsp;KB for the
  whole set, but a deck embeds one of them: the figure on a card is what naming
  that face costs a lecture in every view.</p>

  <p class="cue"><strong>Four numbers decide most of these, and they are on every
  card.</strong> The <b>kind</b> is the pairing rule: a display serif is drawn
  here over a sans body and a display sans over a serif body, because a display
  serif over the deck's own serif reads as one typeface set badly rather than as
  two &ndash; <code>lint.js</code> warns when a deck does the opposite. The
  <b>percentage</b> is that face's measured advance width against the body
  serif, emitted as a <code>size-adjust</code> descriptor: these faces disagree
  about width by a factor of three, and without it Press Start 2P simply ran off
  the slide. The <b>KB</b> is the payload. A <b>no&nbsp;&szlig;</b> badge means
  the face has no eszett and a German title gets a fallback glyph mid-word;
  exactly one face here does.</p>

  <div class="controls">
   <div class="field"><label for="t-title">Title</label>
    <input type="text" id="t-title" data-slot="title" value="Datensicherheit im digitalen Alltag"></div>
   <div class="field"><label for="t-eyebrow">Eyebrow</label>
    <input type="text" id="t-eyebrow" data-slot="eyebrow" value="Antrittsvorlesung"></div>
   <div class="field"><label for="t-section">Divider heading</label>
    <input type="text" id="t-section" data-slot="section" value="Wer h&ouml;rt eigentlich mit?"></div>
   <div class="field"><label for="t-part">Part mark</label>
    <input type="text" id="t-part" data-slot="part" class="short" value="Teil 2"></div>
   <div class="field"><span class="label" id="l-flavour">Flavour</span>
    <div class="way-tabs" id="flavours" role="group" aria-labelledby="l-flavour">
     <button type="button" data-flavour="all" aria-pressed="true">all</button>
     ${Object.keys(FLAVOURS).map((f) => `<button type="button" data-flavour="${f}" aria-pressed="false">${f}</button>`).join('\n     ')}
    </div></div>
   <div class="field"><span class="label" id="l-view">Slide</span>
    <div class="way-tabs" id="views" role="group" aria-labelledby="l-view">
     <button type="button" data-view="both" aria-pressed="true">both</button>
     <button type="button" data-view="cover" aria-pressed="false">cover</button>
     <button type="button" data-view="divider" aria-pressed="false">divider</button>
    </div></div>
   <div class="field"><span class="label" id="l-look">Look</span>
    <div class="way-tabs" role="group" aria-labelledby="l-look">
     <button type="button" id="ground" aria-pressed="false">dark ground</button>
     <button type="button" id="caps" aria-pressed="false">caps</button>
     <button type="button" id="wide" aria-pressed="false">wide cards</button>
    </div></div>
   <div class="field"><label for="size">Headline size</label>
    <input type="range" id="size" min="4" max="13" step="0.2" value="7.6"></div>
   <div class="field"><label for="track">Tracking</label>
    <input type="range" id="track" min="-4" max="12" step="1" value="0"></div>
   <div class="field"><label for="wght">Weight &middot; variable faces</label>
    <input type="range" id="wght" min="300" max="900" step="50" value="700"></div>
  </div>

  <div class="stage">
   <div class="faces" id="grid">${cards}
   </div>
  </div>
 </div>
</section>

<section class="band band-close">
 <div class="wrap">
  <div class="middle">
   <p>Every face here is embedded the way the build embeds it, so nothing on
   this page is fetched from anywhere else &ndash; which is also what a lecture
   naming one of them ships.
   <a href="decoration.html#display-face">The decoration page</a> shows what the
   role does to a deck, and
   <a href="getting-started.html">Getting started</a> is the two ways to have
   one. The faces are all under the SIL Open Font License, and the build emits
   that licence text beside them into every view.</p>

   <footer>
    <p>psi-slides &middot; <a href="https://psi.uni-bamberg.de/">Privacy and Security in Information Systems</a>,
    University of Bamberg &middot; <a href="https://herdom.net">Dominik Herrmann</a><br>
    Tooling MIT-licensed, lecture content CC&nbsp;BY-SA&nbsp;4.0.</p>
   </footer>
  </div>
 </div>
</section>

</main>
<script>
(function () {
  'use strict';

  // ── the words on the slides ────────────────────────────────────────
  // Four of them are the reader's, and the rest are a real lecture's: umlauts,
  // a long compound, a credit block of the length one actually has.
  var SLOTS = {
    eyebrow: '', title: '', subtitle: 'Warum klappt das nicht so gut?',
    presenter: 'Prof. Dr. Dominik Herrmann',
    affiliation: 'Otto-Friedrich-Universit\\u00e4t Bamberg',
    info: 'Bamberg \\u00b7 12. September 2026',
    part: '', section: '', 'section-sub': 'Verkehrsdaten, Metadaten und wer sie sammelt'
  };
  var controls = document.querySelector('.controls');
  function paint() {
    Object.keys(SLOTS).forEach(function (slot) {
      var els = document.querySelectorAll('[data-slot="' + slot + '"]');
      Array.prototype.forEach.call(els, function (el) {
        if (el.tagName !== 'INPUT') el.textContent = SLOTS[slot];
      });
    });
  }
  Array.prototype.forEach.call(controls.querySelectorAll('input[type="text"]'), function (input) {
    SLOTS[input.dataset.slot] = input.value;
    input.addEventListener('input', function () {
      SLOTS[input.dataset.slot] = input.value;
      paint();
    });
  });
  paint();

  // ── the three button groups ────────────────────────────────────────
  // One pressed at a time in the first two, a plain toggle in the third; all of
  // them real buttons, so the keyboard reaches every control on this page.
  function pickOne(id, apply) {
    var group = document.getElementById(id);
    group.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      Array.prototype.forEach.call(group.querySelectorAll('button'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      apply(b);
    });
  }
  pickOne('flavours', function (b) {
    var want = b.dataset.flavour;
    Array.prototype.forEach.call(document.querySelectorAll('.face'), function (card) {
      card.hidden = want !== 'all' && card.dataset.flavour !== want;
    });
  });
  pickOne('views', function (b) { document.body.dataset.view = b.dataset.view; });

  function toggle(id, apply) {
    var b = document.getElementById(id);
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      apply(on);
    });
  }
  toggle('ground', function (on) { document.body.dataset.ground = on ? 'ink' : 'paper'; });
  toggle('caps', function (on) { document.body.dataset.caps = on ? 'on' : 'off'; });
  toggle('wide', function (on) {
    document.querySelector('.faces').style.setProperty('--card', on ? '64rem' : '26rem');
  });

  // ── the three sliders ──────────────────────────────────────────────
  // Written onto each .slide rather than onto :root, because the clone the
  // enlarged view holds has to carry the settings with it.
  function eachSlide(fn) {
    Array.prototype.forEach.call(document.querySelectorAll('.slide'), fn);
  }
  document.getElementById('size').addEventListener('input', function (ev) {
    var v = Number(ev.target.value);
    eachSlide(function (el) {
      el.style.setProperty('--headline-size', v + 'cqw');
      el.style.setProperty('--divider-size', (v * 1.25) + 'cqw');
    });
  });
  // Zero is normal, not 0em: the value the engine resets a display face to is
  // the face's own fit, and 0em would be this page deciding to flatten it.
  document.getElementById('track').addEventListener('input', function (ev) {
    var v = Number(ev.target.value);
    eachSlide(function (el) {
      el.style.setProperty('--display-track', v === 0 ? 'normal' : (v / 100) + 'em');
    });
  });
  // Only the variable faces. A static cut asked for a weight it does not have
  // gets a synthesised bold, which is a specimen of the browser rather than of
  // the typeface - font-synthesis-weight: none stops the drawing, and this
  // stops the request.
  document.getElementById('wght').addEventListener('input', function (ev) {
    var v = ev.target.value;
    Array.prototype.forEach.call(document.querySelectorAll('.face[data-variable] .slide'), function (el) {
      el.style.setProperty('--display-weight', v);
    });
  });

  // ── the umlaut probe ───────────────────────────────────────────────
  // Does this face have ÄÖÜäöüß? The browser says nothing when it silently
  // falls back, so it has to be measured - and measured carefully, because the
  // two obvious ways of doing it are both wrong.
  //
  // Wrong once: measure after page load. A face the page has not finished
  // loading measures as its fallback, and the first cut reported all 26
  // then-candidates as having no umlauts while the page plainly drew "Wer
  // hört". Hence the explicit document.fonts.load() per family - fonts.ready
  // alone does not cover a family used only in canvas.
  //
  // Wrong twice: compare the candidate against one fallback and call equal
  // widths a miss. That flagged Pixelify Sans, whose advance happens to be
  // exactly the fallback monospace's. So instead: render the string with the
  // candidate over TWO fallbacks of different widths. A glyph the candidate has
  // is drawn by the candidate either way and the widths agree; a glyph it lacks
  // is drawn by whichever fallback is behind it, and they disagree.
  //
  // The method's limit, since it is not obvious: it cannot see a missing CJK
  // glyph, because both generic fallbacks resolve CJK through the same system
  // font. For the latin characters this page asks about, they differ.
  (function probe() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.missing'));
    if (!document.fonts) return;
    var CHARS = '\\u00c4\\u00d6\\u00dc\\u00e4\\u00f6\\u00fc\\u00df';
    Promise.all(els.map(function (el) {
      return document.fonts.load("64px '" + el.dataset.family + "'", CHARS).catch(function () {});
    })).then(function () {
      return document.fonts.ready;
    }).then(function () {
      var cv = document.createElement('canvas').getContext('2d');
      function width(fam, fallback, t) {
        cv.font = "64px '" + fam + "', " + fallback;
        return cv.measureText(t).width;
      }
      els.forEach(function (el) {
        var fam = el.dataset.family;
        var missing = CHARS.split('').filter(function (ch) {
          return Math.abs(width(fam, 'monospace', ch) - width(fam, 'sans-serif', ch)) > 0.5;
        });
        if (missing.length) el.textContent = 'no ' + missing.join('');
      });
    });
  })();

  // ── the enlarged specimen ──────────────────────────────────────────
  // A display face judged at card size is not judged, so any slide opens at
  // 1280px in the site's own lightbox field. The clone carries the sliders'
  // settings; the card carries the face.
  var lit = null;
  var litFrom = null;
  function build() {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.innerHTML = '<div class="zoom-wrap">'
      + '<div class="zoom-head"><strong></strong><span></span></div>'
      + '<div class="zoom-slot"></div></div>';
    box.addEventListener('click', close);
    document.body.appendChild(box);
    return box;
  }
  function open(spec) {
    var card = spec.closest('.face');
    if (!lit) lit = build();
    var slot = lit.querySelector('.zoom-slot');
    var holder = document.createElement('div');
    holder.className = 'spec';
    holder.appendChild(spec.querySelector('.slide').cloneNode(true));
    ['--display', '--display-pct', '--display-weight', '--body'].forEach(function (p) {
      holder.style.setProperty(p, card.style.getPropertyValue(p));
    });
    slot.replaceChildren(holder);
    lit.querySelector('.zoom-head strong').textContent = card.querySelector('.face-name').textContent;
    lit.querySelector('.zoom-head span').textContent = Array.prototype.map
      .call(card.querySelectorAll('.badges span'), function (s) { return s.textContent; })
      .filter(Boolean).join(' \\u00b7 ');
    lit.hidden = false;
    document.body.classList.add('lightbox-open');
    litFrom = spec;
  }
  function close() {
    if (!lit || lit.hidden) return;
    lit.hidden = true;
    lit.querySelector('.zoom-slot').replaceChildren();
    document.body.classList.remove('lightbox-open');
    if (litFrom && litFrom.isConnected) litFrom.focus();
    litFrom = null;
  }
  document.getElementById('grid').addEventListener('click', function (ev) {
    var spec = ev.target.closest('.spec');
    if (spec) open(spec);
  });
  document.getElementById('grid').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var spec = ev.target.closest('.spec');
    if (!spec) return;
    ev.preventDefault();
    open(spec);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') close();
  });
})();
</script>
<script src="site.js"></script>
</body>
</html>
`;

const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
const rel = path.relative(repo, OUT);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);

if (CHECK) {
  if (was === html) {
    console.log(`${rel} is up to date (${mb} MB, ${fonts.length} faces)`);
    process.exit(0);
  }
  console.error(`\nDRIFT: ${rel} does not match a fresh build.\n`
    + (was === null ? '  It is not there at all.\n' : `  tracked ${was.length} bytes, fresh ${html.length} bytes\n`)
    + '  Run `node tools/font-playground/build-playground.mjs` and commit the result.\n');
  process.exit(1);
}

fs.writeFileSync(OUT, html);
console.log(`wrote ${rel}  ${mb} MB  ${fonts.length} faces` + (was === html ? '  - unchanged' : ''));
