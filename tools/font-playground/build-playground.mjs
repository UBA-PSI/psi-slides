// Generate docs/site/display-faces.html, the site's typefaces page: the nine
// text faces of the bundle drawn into a slide and a page of the handout, then
// every display face drawn into a cover and a section divider.
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
import { readTextFaces, TEXT_ROLES } from './text-roster.mjs';
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

// ── the text faces ───────────────────────────────────────────────────
// The nine serif, sans and mono faces of BUNDLED_FONTS, read out of build.js
// by text-roster.mjs, so a face that joins the roster joins this page on the
// next run and --check reports the page stale until it does. Each one is
// declared the way fontStyleTag declares it: the same files, weight 100 900,
// font-display: block, and the named instance pinned in the descriptor
// (Noto Sans Mono Condensed's wdth 62.5).
//
// Three of the files are also the site's own type, byte for byte - IBM Plex
// Sans upright and italic and JetBrains Mono upright, copied into
// docs/site/fonts/ from the same packages. Those are referenced by URL rather
// than embedded a second time, and only after a byte comparison: a package
// upgrade that left the site's copies behind makes this page embed the
// package's bytes instead of showing the site's older ones.
//
// Literata doubles as the body face behind the display cards below.
const BUILD_JS = path.join(repo, 'build.js');
const SITE_FONTS = path.join(repo, 'docs/site/fonts');
const textFaces = readTextFaces(BUILD_JS);
const DEFAULTS = (() => {
  const m = fs.readFileSync(BUILD_JS, 'utf8').match(/const BUNDLED_DEFAULTS = \{([^}]*)\}/);
  if (!m) throw new Error('BUNDLED_DEFAULTS not found in build.js');
  return Object.fromEntries(TEXT_ROLES.map((r) => {
    const v = m[1].match(new RegExp(`\\b${r}:\\s*'([^']+)'`));
    return [r, v && v[1]];
  }));
})();

// One line per face, in the words of build.js's own comments. A face added to
// the roster without one gets an empty line and a warning, not a guess.
const TEXT_NOTES = {
  'Literata': 'The default serif.',
  'Source Serif 4': 'Finer hairlines than Literata, and the bold sits closest to the regular of the five.',
  'Bitter': 'A slab with the lowest stroke contrast of the five, and the smallest file.',
  'Noto Serif': 'The highest stroke contrast of the five.',
  'Roboto Serif': '8 % wider than Literata, so a finished deck re-wraps; the widest step from regular to bold.',
  'IBM Plex Sans': 'The default sans. Figure label widths are measured against it.',
  'Inter Tight': 'The sans up to 1.0.0: condensed, narrower than Plex.',
  'JetBrains Mono': 'The default mono. Its code ligatures stay off unless the deck says ligatures: all.',
  'Noto Sans Mono Condensed': '0.50 em a character where JetBrains Mono takes 0.60, so a long listing fits. Upright only.',
};

function textSrc(pkg, file) {
  const { buf, meta, b64 } = face(pkg, file);
  const site = path.join(SITE_FONTS, file);
  const shared = fs.existsSync(site) && fs.readFileSync(site).equals(buf);
  return {
    bytes: buf.length, meta,
    src: shared ? `url('fonts/${file}') format('woff2')` : `url(data:font/woff2;base64,${b64}) format('woff2')`,
  };
}
const texts = textFaces.map((t) => {
  const files = [['normal', t.normal], ['italic', t.italic]].filter(([, f]) => f);
  const parts = files.map(([style, file]) => ({ style, ...textSrc(t.pkg, file) }));
  if (!TEXT_NOTES[t.family]) console.warn(`No note for the text face ${t.family} - add one to TEXT_NOTES.`);
  return {
    ...t,
    italicFile: !!t.italic,
    isDefault: DEFAULTS[t.role] === t.family,
    bytes: parts.reduce((a, p) => a + p.bytes, 0),
    licence: parts[0].meta.license?.type || 'unknown',
    note: TEXT_NOTES[t.family] || '',
    css: parts.map((p) =>
      `@font-face{font-family:'${t.family}';font-style:${p.style};font-weight:100 900;font-display:block;`
      + (t.variations ? `font-variation-settings:${t.variations};` : '')
      + `src:${p.src};}`).join('\n'),
  };
});
for (const r of TEXT_ROLES) {
  if (!texts.some((t) => t.role === r && t.isDefault)) throw new Error(`no default ${r} face among the text faces`);
}
const textCss = texts.map((t) => t.css).join('\n');
const defaultKb = kb(texts.filter((t) => t.isDefault).reduce((a, t) => a + t.bytes, 0));
const byRole = (r) => texts.filter((t) => t.role === r);
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = (n) => NUM_WORD[n] || String(n);
const sentenceCase = (s) => s[0].toUpperCase() + s.slice(1);
// The inline-code size codeTag emits for a pairing: CODE_XHEIGHT_RATIO times
// the prose face's x-height over the mono's, to three decimals. Read off
// build.js rather than copied, for the reason the faces are.
const CODE_RATIO = Number((fs.readFileSync(BUILD_JS, 'utf8').match(/const CODE_XHEIGHT_RATIO = ([0-9.]+)/) || [])[1]);
if (!CODE_RATIO) throw new Error('CODE_XHEIGHT_RATIO not found in build.js');
const codeEm = (prose, mono) => (Math.round(CODE_RATIO * prose.xHeight / mono.xHeight * 1000) / 1000);
const dflt = Object.fromEntries(TEXT_ROLES.map((r) => [r, texts.find((t) => t.role === r && t.isDefault)]));

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

// ── the text-face section ────────────────────────────────────────────
const roleCount = (r, one, many) => { const n = byRole(r).length; return `${numWord(n)} ${n === 1 ? one : many}`; };
const textLede = `${sentenceCase(numWord(texts.length))} faces in three roles: `
  + `${roleCount('serif', 'serif', 'serifs')}, ${roleCount('sans', 'sans', 'sans faces')} and `
  + `${roleCount('mono', 'mono', 'monos')}. ${esc(dflt.serif.family)}, ${esc(dflt.sans.family)} and `
  + `${esc(dflt.mono.family)} are the default and need no line in the frontmatter. A deck embeds `
  + `one face per role, ${defaultKb}&nbsp;KB in each view for the default three. Pick one per role `
  + 'to see the pairing on a slide and on a page of the handout.';

// The figure is drawn in the sans, as a ::: draw label is. 21 units of a
// 330-unit box at 26cqw is the body size of the slide around it, near enough.
const mockFig = `<svg class="tf-fig" viewBox="0 0 330 92" role="img" aria-label="Two boxes, password and digest, joined by an arrow labelled 12 rounds">
       <rect x="1" y="34" width="118" height="50" rx="4"/><text x="60" y="66" font-size="21" text-anchor="middle">password</text>
       <path d="M119 59 H206"/><path d="M197 52 L208 59 L197 66"/>
       <text class="lbl" x="164" y="24" font-size="18" text-anchor="middle">12 rounds</text>
       <rect x="211" y="34" width="118" height="50" rx="4"/><text x="270" y="66" font-size="21" text-anchor="middle">digest</text>
      </svg>`;
// No ligature can join -> or != here, and that is the engine's rule too: code
// ligatures are off unless a deck asks for them.
const mockCode = '<span class="k">import</span> bcrypt\n'
  + 'salt = bcrypt.gensalt(rounds=12)\n'
  + 'digest = bcrypt.hashpw(pw, salt)\n'
  + '<span class="k">assert</span> digest != pw  <span class="c"># -&gt; keep only this</span>';
const mockHead = 'A fast hash is the wrong place for a password';
// The slide is what topic-bold projects: the first sentence of each paragraph.
const mockSlide = `<div class="tf-slide">
      <span class="tf-num">7</span>
      <h4>${mockHead}</h4>
      <p>A graphics card tries <strong>a billion guesses <em>per second</em></strong> against a fast hash.</p>
      <p>So the password goes through <code>bcrypt</code>, which is <em>slow</em> on purpose.</p>
      <div class="tf-row">
       <pre><code>${mockCode}</code></pre>
       ${mockFig}
      </div>
     </div>`;
const mockPage = `<div class="tf-page">
      <span class="tf-pnum">7</span>
      <p class="tf-label">example</p>
      <h4>${mockHead}</h4>
      <p>A graphics card tries <strong>a billion guesses <em>per second</em></strong> against a fast
      hash. Against a leaked list of short passwords that is an afternoon&rsquo;s work, and a
      <em>salt</em> only keeps the attacker from reusing one table for every account.</p>
      <p>So the password goes through <code>bcrypt</code>, which is slow on purpose: each step of
      its cost factor doubles the work, for the attacker on every guess as much as for the server
      once per login.</p>
      <pre><code>${mockCode}</code></pre>
      <figure>
       ${mockFig}
       <figcaption>The cost factor stands between the two.</figcaption>
      </figure>
     </div>`;

const GENERIC = { serif: 'serif', sans: 'sans-serif', mono: 'monospace' };
const textCards = texts.map((t) => {
  const stack = `'${t.family}', ${GENERIC[t.role]}`;
  return `
   <article class="tface" data-face="${esc(t.family)}"${t.isDefault ? ' data-on' : ''}>
    <h3 style="font-family:${esc(stack)}">${esc(t.family)}</h3>
    <p class="tf-spec" style="font-family:${esc(stack)}">Handgloves ${t.italicFile ? '<i>Handgloves</i> ' : ''}<b>Handgloves</b> 0O Il1 &auml;&ouml;&uuml;&szlig;</p>
    <p class="badges">
     <span>${t.role}</span>
     ${t.isDefault ? '<span>default</span>' : ''}
     <span class="num" title="${t.italicFile ? 'upright and italic woff2' : 'one upright woff2'}, embedded in each of the four views">${kb(t.bytes)} KB per view</span>
     <span>${esc(t.licence)}</span>
    </p>
    <p class="face-note">${esc(t.note)}</p>
    <p class="face-pkg"><code>fonts: {${t.role}: ${esc(t.family)}}</code></p>
   </article>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Typefaces &ndash; psi-slides</title>
<link rel="stylesheet" href="site.css">
<style>
/*
 * GENERATED by tools/font-playground/build-playground.mjs from roster.mjs,
 * scales.json and the text faces of BUNDLED_FONTS in build.js. Do not edit
 * this file - run the script.
 *
 * Everything structural comes from site.css: the frame, the bands, the text
 * scale, the palette, the chrome, the stage, .way-tabs for the control row.
 * What is left is the specimen machinery, which no other page has: the nine
 * text faces and the 32 display faces embedded, a mock slide, a mock page and
 * a mock cover and divider drawn in container units, and the controls that
 * set them.
 */

/* ── the nine text faces ──────────────────────────────────────────────
   Declared as fontStyleTag declares them. The three that are also the site's
   own type point at docs/site/fonts/, whose bytes the generator compared. */
${textCss}

/* ── the 32 display faces ─────────────────────────────────────────────
   Set over the deck's Literata above or over the site's own --sans, which is
   the same IBM Plex Sans cut build.js embeds into a lecture. */
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

/*
 * ── the text faces: a slide and a page ───────────────────────────────
 *
 * Two mocks of one chunk, the projection and the handout, drawn in cqw so the
 * proportions are the engine's at any width: on the slide the body is
 * 1rem x --zoom (1.35) of a 1600 x 900 frame, 1.975cqw, the heading 1.55 of
 * that, a listing 0.78; on the page the body is print's 10pt in a 42rem
 * column. The faces come in as four custom properties on the stage, set by
 * the controls: --m-serif, --m-sans, --m-mono, and --m-read, which is what F
 * moves in a live view (body[data-font] re-points --body-font). --m-bold is
 * the --bold-weight that goes with it, 500 under the serif and 600 under the
 * other two, and --m-code / --m-pcode the inline-code size codeTag emits for
 * the pairing. What a default deck sets in the sans on a slide is the chrome
 * and the figure labels - the slide number, a label in a drawing - and on the
 * page the type word, the number and the caption; the mocks carry those, so
 * the sans control has something to move under every reading face.
 */
.tf-controls { position: static; }
.tf-fm { margin: 0 0 1.2rem; font-size: var(--fs-note); max-width: none; }
.tf-fm code { white-space: normal; }
.tf-stage {
  --m-serif: '${dflt.serif.family}';
  --m-sans: '${dflt.sans.family}';
  --m-mono: '${dflt.mono.family}';
  --m-read: var(--m-serif);
  --m-bold: 500;
  --m-lh: 1.5;
  --m-code: ${codeEm(dflt.serif, dflt.mono)}em;
  --m-pcode: ${codeEm(dflt.serif, dflt.mono)}em;
}
.tf-stage figure.shot { margin: 0; }
.tf-stage figure.shot[hidden] { display: none; }
.tf-stage figure.shot + figure.shot { margin-top: 1.4rem; }
.tf-frame {
  container-type: inline-size;
  border: 1px solid var(--frame);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  overflow: hidden;
}
.tf-slide, .tf-page { font-variant-ligatures: common-ligatures; font-kerning: normal; }
.tf-slide pre, .tf-page pre, .tf-slide code, .tf-page code { font-variant-ligatures: none; }

.tf-slide {
  --t-paper: oklch(0.98 0 0);
  --t-ink: oklch(0.26 0.01 260);
  --t-soft: oklch(0.46 0.01 260);
  --t-emph: oklch(0.42 0.16 30);
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--t-paper);
  color: var(--t-ink);
  padding: 6cqw 14cqw 0;
  font-family: var(--m-read), serif;
  font-size: 1.975cqw;
  line-height: var(--m-lh);
}
.tf-slide .tf-num {
  position: absolute;
  top: 6cqw;
  right: 4.9cqw;
  font-family: var(--m-sans), sans-serif;
  font-size: 0.78em;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--t-soft);
  opacity: 0.32;
}
.tf-slide h4 {
  margin: 0 0 0.7em;
  font-family: var(--m-read), serif;
  font-size: 1.55em;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.012em;
  color: var(--t-ink);
  max-width: none;
  text-wrap: balance;
}
.tf-slide p { margin: 0 0 0.7em; max-width: none; font-size: 1em; line-height: inherit; color: inherit; }
/* style: {bold: plain}, the live default: the phrase keeps the text's weight
   and colour, and an em inside it is the stress mark - upright, the bold
   weight, the accent. */
.tf-slide strong { font-weight: inherit; color: inherit; }
.tf-slide strong em { font-style: normal; font-weight: var(--m-bold); color: var(--t-emph); }
.tf-slide code { font-family: var(--m-mono), monospace; font-size: var(--m-code); }
.tf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6em 2.4em; margin-top: 1em; }
.tf-slide pre {
  margin: 0;
  font-family: var(--m-mono), monospace;
  font-size: 0.78em;
  line-height: 1.4;
  white-space: pre;
  color: var(--t-ink);
  background: none;
  padding: 0;
}
.tf-slide pre code, .tf-page pre code { font-size: inherit; font-family: inherit; }
.tf-slide .c, .tf-page .c { color: var(--t-soft); }
.tf-slide .k { color: var(--t-emph); }
.tf-fig { display: block; overflow: visible; }
.tf-fig text { font-family: var(--m-sans), sans-serif; fill: var(--t-ink); }
.tf-fig .lbl { fill: var(--t-soft); }
.tf-fig rect { fill: none; stroke: var(--t-ink); stroke-width: 1.5; }
.tf-fig path { fill: none; stroke: var(--t-ink); stroke-width: 1.5; }
.tf-slide .tf-fig { width: 25cqw; }

.tf-pageframe { max-width: 50rem; margin-inline: auto; }
.tf-page {
  --t-paper: #fafaf7;
  --t-ink: #1f1f24;
  --t-soft: #5d5d66;
  --t-emph: #8b2e00;
  position: relative;
  background: var(--t-paper);
  color: var(--t-ink);
  padding: 5cqw 11cqw 6cqw 13cqw;
  font-family: var(--m-serif), serif;
  font-size: 2.05cqw;
  line-height: 1.6;
}
.tf-page .tf-pnum {
  position: absolute;
  left: 6.5cqw;
  top: 5cqw;
  font-family: var(--m-sans), sans-serif;
  font-size: 0.8em;
  line-height: 1.9;
  color: #888;
}
.tf-page .tf-label {
  margin: 0 0 0.15em;
  font-family: var(--m-sans), sans-serif;
  font-variant-caps: all-small-caps;
  font-size: 0.82em;
  letter-spacing: 0.12em;
  color: var(--t-soft);
}
.tf-page h4 {
  margin: 0 0 0.5em;
  font-family: var(--m-serif), serif;
  font-size: 1.12em;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--t-ink);
  max-width: none;
}
.tf-page p { margin: 0 0 0.8em; max-width: none; font-size: 1em; line-height: inherit; color: inherit; hyphens: auto; }
/* style: {print-bold: bold}, the document's default: weight 600 in the ink,
   and the same stress mark inside it. */
.tf-page strong { font-weight: 600; color: inherit; }
.tf-page strong em { font-style: normal; font-weight: 600; color: var(--t-emph); }
.tf-page code { font-family: var(--m-mono), monospace; font-size: var(--m-pcode); }
.tf-page pre {
  margin: 0 0 1em;
  font-family: var(--m-mono), monospace;
  font-size: 0.85em;
  line-height: 1.45;
  white-space: pre;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.04);
  color: var(--t-ink);
  padding: 0.8em 1em;
  border-radius: 0.3em;
}
.tf-page figure { margin: 0; }
.tf-page .tf-fig { width: 30cqw; margin: 0 auto; }
/* Two classes deep, because site.css styles figure.shot figcaption and this
   caption stands inside one. */
.tf-stage .tf-page figcaption {
  margin: 0;
  padding: 0.5em 0 0;
  max-width: none;
  line-height: 1.4;
  text-align: center;
  font-family: var(--m-sans), sans-serif;
  font-size: 0.8em;
  color: var(--t-soft);
}

/* The faces themselves, one card each, the name and a line set in the face. */
/* A gallery, so it runs the frame rather than the prose measure. */
.wrap > .tfaces, .wrap > .tf-fm { max-width: none; }
.tfaces {
  display: grid;
  gap: clamp(0.8rem, 1.4vw, 1.3rem);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
  margin: 1.8rem 0 0;
}
.tface {
  background: var(--shot-bg);
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0.9rem 1rem 0.9rem;
  min-width: 0;
}
.tface[data-on] { border-color: var(--ink-soft); }
.tface h3 { margin: 0; font-size: var(--fs-lead); font-weight: 600; line-height: 1.2; }
.tface .tf-spec {
  margin: 0.45rem 0 0;
  font-size: var(--fs-lead);
  line-height: 1.3;
  max-width: none;
  font-synthesis: none;
  overflow-wrap: anywhere;
}
.tface .tf-spec i { font-style: italic; }
.tface .tf-spec b { font-weight: 650; }
.tface .face-note { margin-top: 0.55rem; }
</style>
</head>
<body data-view="both" data-ground="paper" data-caps="off">
<!--topbar-->
<main class="banded">

<section class="band band-hero">
 <div class="wrap">
  <p class="mark"><b>psi-slides</b> &middot; typefaces</p>
  <h1>The typefaces that ship with psi-slides</h1>
  <p class="lede">A lecture sets its text in three typefaces &ndash; a serif, a
  sans and a mono &ndash; and may give its cover and section dividers a fourth.
  ${sentenceCase(numWord(texts.length))} text faces and ${fonts.length} display faces come with psi-slides, each
  drawn here the way a lecture draws it.</p>
  <p>The faces a lecture uses are embedded into its views, so a deck sent by
  mail keeps its type, and naming one is a line in the frontmatter.
  <a href="#text-faces">The text faces</a> come first,
  <a href="#roster">the display faces</a> after them.</p>
 </div>
</section>

<section class="band">
 <div class="wrap">
  <h2 id="text-faces">${sentenceCase(numWord(texts.length))} faces for the text</h2>
  <p class="lede">${textLede}</p>
  <p>Each one fills a role. On a slide the serif sets the heading and the
  prose, the mono sets code, and the sans sets the slide number and the labels
  in a figure; on the printed page the sans also sets the type word and the
  caption. During a talk, <kbd>F</kbd> switches the slide text between the
  deck&rsquo;s serif, its sans and its mono, and <kbd>Shift</kbd>&nbsp;<kbd>F</kbd>
  back again &ndash; the three faces the deck already carries, in the projection
  and the speaker view at once. <code>font: sans</code> in the frontmatter says
  which of the three a lecture opens in.</p>

  <div class="controls tf-controls">
${TEXT_ROLES.map((r) => `   <div class="field"><span class="label" id="l-tf-${r}">${sentenceCase(r)}</span>
    <div class="way-tabs" data-tf-role="${r}" role="group" aria-labelledby="l-tf-${r}">
${byRole(r).map((t) => `     <button type="button" data-face="${esc(t.family)}" data-xh="${t.xHeight}" data-kb="${t.bytes}" aria-pressed="${t.isDefault}">${esc(t.family)}</button>`).join('\n')}
    </div></div>`).join('\n')}
   <div class="field"><span class="label" id="l-tf-read">Slide text &middot; F</span>
    <div class="way-tabs" id="tf-read" role="group" aria-labelledby="l-tf-read">
${TEXT_ROLES.map((r) => `     <button type="button" data-read="${r}" aria-pressed="${r === 'serif'}">${r}</button>`).join('\n')}
    </div></div>
   <div class="field"><span class="label" id="l-tf-view">Show</span>
    <div class="way-tabs" id="tf-view" role="group" aria-labelledby="l-tf-view">
     <button type="button" data-view="slide" aria-pressed="true">slide</button>
     <button type="button" data-view="page" aria-pressed="false">page</button>
    </div></div>
  </div>

  <p class="tf-fm">In the frontmatter: <code id="tf-fm" hidden></code><span id="tf-fm-none">nothing,
  the default three need no line</span> &middot; <span id="tf-kb">${defaultKb}</span>&nbsp;KB of type in each view.</p>

  <div class="stage tf-stage" id="tf-stage">
   <figure class="shot" data-view="slide">
    <div class="bar"><b>audience.html</b>&nbsp;&middot; the projection</div>
    <div class="tf-frame">${mockSlide}</div>
   </figure>
   <figure class="shot" data-view="page">
    <div class="tf-pageframe">
     <div class="bar"><b>print.html</b>&nbsp;&middot; the handout</div>
     <div class="tf-frame">${mockPage}</div>
    </div>
   </figure>
  </div>

  <div class="tfaces">${textCards}
  </div>
 </div>
</section>

<section class="band">
 <div class="wrap">
  <h2 id="roster">${fonts.length} faces for a title slide</h2>
  <p class="lede">A cover, a closing slide and the section dividers are the one
  place in a lecture where a loud typeface is not a mistake. These are the faces
  that ship with the tool for that job, each one drawn into a real cover and a
  real divider, with the title you type into it.</p>
  <p><code>fonts: {display: Anton}</code> in the frontmatter is the whole of it,
  and it reaches those three slides and nothing else &ndash; an ordinary heading, a
  card lead, a figure label all keep the body type.
  <a href="decoration.html#display-face">What the role does</a> is on the
  decoration page.</p>
  <p>They come in three kinds: ${counts.hand} hand, ${counts.machine} machine and
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

  <div class="controls" id="display-controls">
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

  // ── the text faces ─────────────────────────────────────────────────
  // One face per role, the reading face F would pick, and slide or page.
  // Everything lands as custom properties on the stage; the numbers are the
  // engine's: --bold-weight is 500 under the serif and 600 under the other
  // two, a mono reading face loosens the leading to 1.55, and the inline code
  // size is codeTag's ratio of x-heights for the pairing.
  (function textFaces() {
    var stage = document.getElementById('tf-stage');
    var DEFAULT = ${JSON.stringify(Object.fromEntries(TEXT_ROLES.map((r) => [r, dflt[r].family])))};
    var RATIO = ${CODE_RATIO};
    var pick = {};
    var read = 'serif';
    function chosen(role) {
      return document.querySelector('[data-tf-role="' + role + '"] button[aria-pressed="true"]');
    }
    function codeEm(proseXh, monoXh) { return Math.round(RATIO * proseXh / monoXh * 1000) / 1000; }
    function apply() {
      var xh = {}, kb = 0;
      ['serif', 'sans', 'mono'].forEach(function (role) {
        var b = chosen(role);
        pick[role] = b.dataset.face;
        xh[role] = Number(b.dataset.xh);
        kb += Number(b.dataset.kb);
        stage.style.setProperty('--m-' + role, "'" + b.dataset.face + "'");
      });
      stage.style.setProperty('--m-read', 'var(--m-' + read + ')');
      stage.style.setProperty('--m-bold', read === 'serif' ? '500' : '600');
      stage.style.setProperty('--m-lh', read === 'mono' ? '1.55' : '1.5');
      stage.style.setProperty('--m-code', codeEm(xh[read], xh.mono) + 'em');
      stage.style.setProperty('--m-pcode', codeEm(xh.serif, xh.mono) + 'em');
      var named = ['serif', 'sans', 'mono'].filter(function (r) { return pick[r] !== DEFAULT[r]; })
        .map(function (r) { return r + ': ' + pick[r]; });
      var lines = [];
      if (named.length) lines.push('fonts: {' + named.join(', ') + '}');
      if (read !== 'serif') lines.push('font: ' + read);
      var fm = document.getElementById('tf-fm');
      fm.textContent = lines.join('  \\u00b7  ');
      fm.hidden = !lines.length;
      document.getElementById('tf-fm-none').hidden = !!lines.length;
      document.getElementById('tf-kb').textContent = Math.round(kb / 1024);
      Array.prototype.forEach.call(document.querySelectorAll('.tface'), function (card) {
        var on = ['serif', 'sans', 'mono'].some(function (r) { return pick[r] === card.dataset.face; });
        if (on) card.setAttribute('data-on', ''); else card.removeAttribute('data-on');
      });
    }
    function group(el, fn) {
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        Array.prototype.forEach.call(el.querySelectorAll('button'), function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        fn(b);
        apply();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-tf-role]'), function (el) {
      group(el, function () {});
    });
    group(document.getElementById('tf-read'), function (b) { read = b.dataset.read; });
    var shots = stage.querySelectorAll('figure[data-view]');
    function show(view) {
      Array.prototype.forEach.call(shots, function (f) { f.hidden = f.dataset.view !== view; });
    }
    group(document.getElementById('tf-view'), function (b) { show(b.dataset.view); });
    show('slide');
    apply();
  })();

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
  var controls = document.getElementById('display-controls');
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
    console.log(`${rel} is up to date (${mb} MB, ${texts.length} text faces, ${fonts.length} display faces)`);
    process.exit(0);
  }
  console.error(`\nDRIFT: ${rel} does not match a fresh build.\n`
    + (was === null ? '  It is not there at all.\n' : `  tracked ${was.length} bytes, fresh ${html.length} bytes\n`)
    + '  Run `node tools/font-playground/build-playground.mjs` and commit the result.\n');
  process.exit(1);
}

fs.writeFileSync(OUT, html);
console.log(`wrote ${rel}  ${mb} MB  ${texts.length} text faces, ${fonts.length} display faces` + (was === html ? '  - unchanged' : ''));
