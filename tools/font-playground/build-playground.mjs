// Generate font-playground.html: every candidate display face drawn into a
// cover and a section divider, self-contained so it opens from file://.
//
// Self-contained for the same reason the lecture outputs are: a page that
// links to Google's CDN is showing you a face the built HTML would not have.
// Every candidate here is embedded exactly the way the engine would embed
// it - one latin woff2, base64, in an @font-face - so what the page draws is
// what a lecture would ship, payload figure included.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, FLAVOURS, CLASHES } from './roster.mjs';
const SCALES = JSON.parse(fs.readFileSync(new URL('./scales.json', import.meta.url), 'utf8'));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kb = (n) => (n / 1024).toFixed(0);

// A face from a package in THIS folder's node_modules (the candidates) or
// from the engine's own (the deck faces the candidates are set against).
function face(pkgRoot, pkg, file) {
  const dir = path.join(pkgRoot, 'node_modules', pkg);
  const buf = fs.readFileSync(path.join(dir, 'files', file));
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')); } catch {}
  return { buf, meta, b64: buf.toString('base64') };
}

const faceCss = (family, b64, weight, style = 'normal') =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

// ── the two faces the candidates are judged against ──────────────────
// The deck's own serif and sans, so a card shows the contrast a real slide
// would have rather than a display face floating on its own.
const deckFaces = [
  { fam: 'Literata', pkg: '@fontsource-variable/literata', file: 'literata-latin-wght-normal.woff2', w: '100 900' },
  { fam: 'IBM Plex Sans', pkg: '@fontsource-variable/ibm-plex-sans', file: 'ibm-plex-sans-latin-wght-normal.woff2', w: '100 900' },
];
const deckCss = deckFaces
  .map((f) => faceCss(f.fam, face(repo, f.pkg, f.file).b64, f.w))
  .join('\n');

// ── the candidates ───────────────────────────────────────────────────
const fonts = CANDIDATES.map((c) => {
  const { buf, meta, b64 } = face(here, c.pkg, c.file);
  const family = meta.family || c.pkg.split('/').pop();
  return {
    ...c,
    family,
    scale: SCALES[c.pkg] ?? 1,
    // The pairing rule, shown rather than stated: a display serif is drawn
    // over a sans body and a display sans over a serif body, which is what
    // the linter will warn about when a deck does the opposite. A hand or a
    // mono pairs with either, so it gets the deck's default serif.
    body: c.kind === 'serif' ? 'IBM Plex Sans' : 'Literata',
    css: faceCss(family, b64, c.weight),
    bytes: buf.length,
    licence: meta.license?.type || 'unknown',
    attribution: meta.license?.attribution || '',
    subsets: meta.subsets || [],
  };
});

const unknownLicence = fonts.filter((f) => !/^OFL/i.test(f.licence));
if (unknownLicence.length) {
  console.warn('Not OFL – check before shipping: ' + unknownLicence.map((f) => `${f.family} (${f.licence})`).join(', '));
}

const totalKb = kb(fonts.reduce((a, f) => a + f.bytes, 0));
const median = kb([...fonts].sort((a, b) => a.bytes - b.bytes)[fonts.length >> 1].bytes);

const cards = fonts.map((f, i) => `
<article class="card" data-flavour="${f.flavour}" data-kind="${f.kind}" data-i="${i}"
  style="--display:'${f.family}'; --display-scale:${f.scale}; --body:'${f.body}'">
  <header class="card-head">
    <h2>${esc(f.family)}</h2>
    <div class="meta">
      <span class="chip chip-${f.flavour}">${f.flavour}</span>
      <span class="kind" title="what it pairs with: a display ${f.kind} wants a ${f.kind === 'serif' ? 'sans' : f.kind === 'sans' ? 'serif' : 'body face of either kind'}">${f.kind}</span>
      <span class="scale" title="measured against Literata: this face sets ${f.scale < 1 ? 'wider' : 'narrower'}, so the headline is sized ${f.scale}x">${f.scale.toFixed(2)}&times;</span>
      <span class="size" title="one latin woff2, the payload a deck naming this face would carry">${kb(f.bytes)} KB</span>
      <span class="lic">${esc(f.licence)}</span>
      ${f.variable ? `<span class="axis">wght ${esc(f.weight)}</span>` : ''}
      <span class="umlaut" data-family="${esc(f.family)}"></span>
    </div>
    <p class="note">${esc(f.note)}</p>
    <p class="pkg"><code>${esc(f.pkg)}</code> · <code>${esc(f.file)}</code></p>
  </header>
  <div class="stages">
    ${stage('cover')}
    ${stage('divider')}
  </div>
</article>`).join('\n');

function stage(kind) {
  return kind === 'cover' ? `
    <div class="stage" data-kind="cover" tabindex="0" title="click to enlarge">
      <div class="slide cover">
        <p class="eyebrow" data-slot="eyebrow"></p>
        <h3 class="headline" data-slot="title"></h3>
        <p class="subtitle" data-slot="subtitle"></p>
        <div class="credits">
          <p class="presenter" data-slot="presenter"></p>
          <p class="affiliation" data-slot="affiliation"></p>
          <p class="info" data-slot="info"></p>
        </div>
      </div>
    </div>` : `
    <div class="stage" data-kind="divider" tabindex="0" title="click to enlarge">
      <div class="slide divider">
        <p class="part" data-slot="part"></p>
        <h3 class="section" data-slot="section"></h3>
        <p class="section-sub" data-slot="section-sub"></p>
      </div>
    </div>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Display faces for covers and dividers – psi-slides playground</title>
<style>
${deckCss}
${fonts.map((f) => f.css).join('\n')}

:root{
  --paper:#fbfaf7; --ink:#1d1c1a; --ink-soft:#5d5a55; --rule:#d9d5cd;
  --emph:#9c2d2d; --panel:#f2efe9;
  --serif:'Literata',Georgia,serif; --sans:'IBM Plex Sans',system-ui,sans-serif;
}
body[data-ground=ink]{
  --paper:#14130f; --ink:#f3efe6; --ink-soft:#a8a297; --rule:#3a372f;
  --emph:#e0a33c; --panel:#1e1c17;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased}

/* ── the bar ── */
#bar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 92%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--rule);padding:.7rem 1.4rem;
  display:flex;flex-wrap:wrap;gap:.5rem 1.2rem;align-items:flex-end}
#bar h1{font-size:.95rem;font-weight:600;margin:0 1rem 0 0;letter-spacing:.01em;align-self:center}
#bar .sub{font-size:.72rem;color:var(--ink-soft);font-weight:400}
.field{display:flex;flex-direction:column;gap:.15rem}
.field label{font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft)}
.field input[type=text]{font:inherit;font-size:.8rem;padding:.24rem .4rem;width:15rem;
  border:1px solid var(--rule);border-radius:3px;background:var(--paper);color:var(--ink)}
.field input.short{width:6rem}
.chips{display:flex;gap:.3rem}
button{font:inherit;font-size:.74rem;padding:.3rem .62rem;border:1px solid var(--rule);
  border-radius:3px;background:transparent;color:var(--ink-soft);cursor:pointer}
button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
button:hover{border-color:var(--ink-soft)}

/* ── cards ── */
main{padding:1.4rem;display:grid;gap:1.4rem;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--card,620px)),1fr))}
.card{border:1px solid var(--rule);border-radius:5px;overflow:hidden;background:var(--paper)}
.card[hidden]{display:none}
.card-head{padding:.8rem .9rem .6rem}
.card-head h2{margin:0;font-size:1rem;font-weight:600;font-family:var(--display),var(--sans);
  letter-spacing:.005em}
.meta{display:flex;flex-wrap:wrap;gap:.35rem;margin:.4rem 0 0;font-size:.63rem;
  letter-spacing:.04em;color:var(--ink-soft);align-items:center}
.meta span{border:1px solid var(--rule);border-radius:2px;padding:.08rem .32rem}
.chip-hand{color:#3f6d4e;border-color:#3f6d4e66}
.chip-machine{color:#3a5d8f;border-color:#3a5d8f66}
.chip-graphic{color:#8f4a2e;border-color:#8f4a2e66}
body[data-ground=ink] .chip-hand{color:#8fc9a2}
body[data-ground=ink] .chip-machine{color:#8fb4e0}
body[data-ground=ink] .chip-graphic{color:#e0a07d}
.umlaut:empty{display:none}
.umlaut{color:var(--emph);border-color:currentColor !important}
.scale{font-variant-numeric:tabular-nums}
.kind{letter-spacing:.02em}
.note{margin:.5rem 0 .25rem;font-family:var(--serif);font-size:.78rem;line-height:1.45;
  color:var(--ink-soft);max-width:52ch}
.pkg{margin:0;font-size:.63rem;color:var(--ink-soft);opacity:.8}
.pkg code{font-family:ui-monospace,Menlo,monospace}

.stages{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--rule);
  border-top:1px solid var(--rule)}
body[data-view=cover] .stage[data-kind=divider],
body[data-view=divider] .stage[data-kind=cover]{display:none}
body:not([data-view=both]) .stages{grid-template-columns:1fr}
.stage{background:var(--panel);cursor:zoom-in;container-type:inline-size}
.stage:focus-visible{outline:2px solid var(--emph);outline-offset:-2px}

/* ── the mock slides ──
   One 16:9 box, and every measurement inside it in cqw, so a card at 540px
   and the blown-up stage at 1200px are the same slide at two sizes. That is
   the whole reason for container queries here: a display face judged at one
   size is not judged. */
.slide{aspect-ratio:16/9;background:var(--paper);position:relative;
  display:flex;flex-direction:column;padding:6cqw 7cqw;overflow:hidden}
.slide .headline,.slide .section{font-family:var(--display),var(--sans);
  font-weight:var(--display-weight,400);letter-spacing:var(--display-track,0);
  line-height:1.04;margin:0;color:var(--ink);text-wrap:balance;
  font-size:calc(var(--headline-size,7.6cqw) * var(--display-scale,1))}
.slide .eyebrow{font-family:var(--sans);font-size:2.1cqw;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-soft);margin:0 0 1.6cqw;font-weight:500}
.slide .subtitle{font-family:var(--body),var(--serif);font-size:3cqw;line-height:1.3;margin:2.2cqw 0 0;
  color:var(--ink-soft);max-width:34ch}
.cover .credits{margin-top:auto;padding-top:3cqw;border-top:1px solid var(--rule)}
.cover .credits p{margin:0;font-family:var(--body),var(--sans)}
.cover .presenter{font-size:2.5cqw;font-weight:600}
.cover .affiliation{font-size:2.1cqw;color:var(--ink-soft)}
.cover .info{font-size:1.9cqw;color:var(--ink-soft);margin-top:1cqw;white-space:pre-line}

.divider{justify-content:center;background:var(--panel)}
.divider .part{font-family:var(--sans);font-size:2.1cqw;letter-spacing:.16em;
  text-transform:uppercase;color:var(--emph);margin:0 0 1.8cqw;font-weight:600}
.divider .section{font-size:calc(var(--divider-size,9.5cqw) * var(--display-scale,1))}
.divider .section-sub{font-family:var(--body),var(--serif);font-size:2.7cqw;color:var(--ink-soft);
  margin:2.4cqw 0 0;max-width:40ch}

/* ── the blown-up stage ── */
#zoom{position:fixed;inset:0;z-index:40;background:color-mix(in srgb,var(--paper) 85%,transparent);
  backdrop-filter:blur(10px);display:none;place-items:center;padding:2rem;cursor:zoom-out}
#zoom[open]{display:grid}
#zoom .wrap{width:min(1280px,100%);display:grid;gap:1rem}
#zoom .slide{box-shadow:0 12px 48px rgba(0,0,0,.22);border:1px solid var(--rule)}
#zoom .zhead{display:flex;justify-content:space-between;align-items:baseline;
  font-size:.8rem;color:var(--ink-soft)}
#zoom .zhead strong{font-size:1.1rem;color:var(--ink);font-weight:600}
#tail{padding:1rem 1.4rem 3rem;font-family:var(--serif);font-size:.78rem;color:var(--ink-soft);
  max-width:74ch;line-height:1.5}
#tail code{font-family:ui-monospace,Menlo,monospace;font-size:.92em}
</style></head>
<body data-ground="paper" data-view="both">

<div id="bar">
  <h1>Display faces<br><span class="sub">${fonts.length} candidates · median ${median} KB · ${totalKb} KB for all</span></h1>
  <div class="field"><label for="t-title">Title</label>
    <input type="text" id="t-title" data-slot="title" value="Datensicherheit im digitalen Alltag"></div>
  <div class="field"><label for="t-eyebrow">Eyebrow</label>
    <input type="text" id="t-eyebrow" data-slot="eyebrow" value="Antrittsvorlesung"></div>
  <div class="field"><label for="t-section">Divider heading</label>
    <input type="text" id="t-section" data-slot="section" value="Wer hört eigentlich mit?"></div>
  <div class="field"><label for="t-part">Part mark</label>
    <input type="text" id="t-part" data-slot="part" class="short" value="Teil 2"></div>
  <div class="chips" id="flavours">
    <button data-flavour="all" aria-pressed="true">all</button>
    ${Object.keys(FLAVOURS).map((f) => `<button data-flavour="${f}" aria-pressed="false">${f}</button>`).join('')}
  </div>
  <div class="chips" id="views">
    <button data-view="both" aria-pressed="true">both</button>
    <button data-view="cover" aria-pressed="false">cover</button>
    <button data-view="divider" aria-pressed="false">divider</button>
  </div>
  <div class="chips">
    <button id="ground" aria-pressed="false" title="the divider is where a deck most often goes dark">dark ground</button>
    <button id="caps" aria-pressed="false">caps</button>
    <button id="wide" aria-pressed="false">wide cards</button>
  </div>
  <div class="field"><label for="size">Headline size</label>
    <input type="range" id="size" min="4" max="13" step=".2" value="7.6" style="width:7rem"></div>
  <div class="field"><label for="track">Tracking</label>
    <input type="range" id="track" min="-4" max="12" value="0" style="width:7rem"></div>
  <div class="field"><label for="wght">Weight (variable only)</label>
    <input type="range" id="wght" min="300" max="900" step="50" value="700" style="width:7rem"></div>
</div>

<main id="grid">${cards}</main>

<div id="zoom"><div class="wrap">
  <div class="zhead"><strong id="z-name"></strong><span id="z-meta"></span></div>
  <div id="z-slot"></div>
</div></div>

<p id="tail">
Every face is embedded here exactly as the build would embed it: one latin
<code>woff2</code>, base64, one <code>@font-face</code>. The KB figure on each card is what a
deck naming that face would carry in every view. The body type behind them is the deck's own
Literata and IBM Plex Sans, so what you are comparing is the pairing, not the face alone.
The slides are drawn with container queries, so a card and the blown-up stage are one slide
at two sizes – click any slide to enlarge it, Escape to close.
The <strong>&times; figure</strong> on each card is that face's measured advance width against
Literata, and the headline is sized by it: these faces disagree about width by a factor of
three, and without the correction Press Start 2P simply ran off the slide.
The <strong>kind</strong> badge is the pairing rule – a display serif is drawn here over a
sans body and a display sans over a serif body, which is the pairing the linter will warn
about when a deck does the opposite.
</p>

<script>
const SLOTS = {
  eyebrow: '', title: '', subtitle: 'Warum klappt das nicht so gut?',
  presenter: 'Prof. Dr. Dominik Herrmann',
  affiliation: 'Otto-Friedrich-Universität Bamberg',
  info: 'Bamberg · 12. September 2026',
  part: '', section: '', 'section-sub': 'Verkehrsdaten, Metadaten und wer sie sammelt',
};
const bar = document.getElementById('bar');
function paint() {
  for (const [slot, val] of Object.entries(SLOTS))
    for (const el of document.querySelectorAll('[data-slot=' + slot + ']'))
      if (el.tagName !== 'INPUT') el.textContent = val;
}
for (const input of bar.querySelectorAll('input[type=text]')) {
  SLOTS[input.dataset.slot] = input.value;
  input.addEventListener('input', () => { SLOTS[input.dataset.slot] = input.value; paint(); });
}
paint();

// Flavour filter.
document.getElementById('flavours').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const o of e.currentTarget.querySelectorAll('button'))
    o.setAttribute('aria-pressed', String(o === b));
  const want = b.dataset.flavour;
  for (const card of document.querySelectorAll('.card'))
    card.hidden = want !== 'all' && card.dataset.flavour !== want;
});

function toggle(id, fn) {
  const b = document.getElementById(id);
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on)); fn(on);
  });
}
document.getElementById('views').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const o of e.currentTarget.querySelectorAll('button'))
    o.setAttribute('aria-pressed', String(o === b));
  document.body.dataset.view = b.dataset.view;
});
document.getElementById('size').addEventListener('input', (e) => {
  for (const el of document.querySelectorAll('.slide')) {
    el.style.setProperty('--headline-size', e.target.value + 'cqw');
    el.style.setProperty('--divider-size', (e.target.value * 1.25) + 'cqw');
  }
});
toggle('wide', (on) => {
  document.documentElement.style.setProperty('--card', on ? '1100px' : '620px');
  document.body.style.setProperty('--card', on ? '1100px' : '620px');
});
toggle('ground', (on) => { document.body.dataset.ground = on ? 'ink' : 'paper'; });
toggle('caps', (on) => {
  document.documentElement.style.setProperty('--caps', on ? 'uppercase' : 'none');
  for (const el of document.querySelectorAll('.headline,.section'))
    el.style.textTransform = on ? 'uppercase' : 'none';
});
document.getElementById('track').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--display-track', (e.target.value / 100) + 'em');
  for (const el of document.querySelectorAll('.slide'))
    el.style.setProperty('--display-track', (e.target.value / 100) + 'em');
});
document.getElementById('wght').addEventListener('input', (e) => {
  for (const card of document.querySelectorAll('.card'))
    for (const el of card.querySelectorAll('.slide'))
      el.style.setProperty('--display-weight', e.target.value);
});

// ── the umlaut probe ──
// A display face with no ä is a face this deck cannot use, and the browser
// says nothing when it silently falls back. So: measure the string in the
// candidate with a deliberately distant fallback, then in the fallback
// alone. Same width means every glyph came from the fallback.
(async function probe() {
  // Does this face have ÄÖÜäöüß? The browser says nothing when it silently
  // falls back, so it has to be measured - and measured carefully, because
  // the two obvious ways of doing it are both wrong.
  //
  // Wrong once: measure after page load. A face the page has not finished
  // loading measures as its fallback, and the first cut reported all 26
  // candidates as having no umlauts while the page plainly drew "Wer hört".
  // Hence the explicit document.fonts.load() per family - fonts.ready alone
  // does not cover a family used only in canvas.
  //
  // Wrong twice: compare the candidate against one fallback and call equal
  // widths a miss. That flagged Pixelify Sans, whose advance happens to be
  // exactly the fallback monospace's. So instead: render the string with the
  // candidate over TWO fallbacks of different widths. A glyph the candidate
  // has is drawn by the candidate either way and the widths agree; a glyph
  // it lacks is drawn by whichever fallback is behind it, and they disagree.
  const els = [...document.querySelectorAll('.umlaut')];
  await Promise.all(els.map((el) => document.fonts.load("64px '" + el.dataset.family + "'", 'ÄÖÜäöüß')));
  await document.fonts.ready;
  const cv = document.createElement('canvas').getContext('2d');
  const width = (fam, fallback, t) => { cv.font = "64px '" + fam + "', " + fallback; return cv.measureText(t).width; };
  for (const el of els) {
    const fam = el.dataset.family;
    const missing = [...'ÄÖÜäöüß'].filter((ch) =>
      Math.abs(width(fam, 'monospace', ch) - width(fam, 'sans-serif', ch)) > 0.5);
    if (missing.length) el.textContent = 'no ' + missing.join('');
  }
})();

// ── the blown-up stage ──
const zoom = document.getElementById('zoom');
document.getElementById('grid').addEventListener('click', (e) => {
  const stage = e.target.closest('.stage'); if (!stage) return;
  const card = stage.closest('.card');
  const clone = stage.querySelector('.slide').cloneNode(true);
  const slot = document.getElementById('z-slot');
  slot.replaceChildren(clone);
  for (const prop of ['--display', '--display-scale', '--body'])
    slot.style.setProperty(prop, getComputedStyle(card).getPropertyValue(prop));
  document.getElementById('z-name').textContent = card.querySelector('h2').textContent;
  document.getElementById('z-meta').textContent =
    [...card.querySelectorAll('.meta span')].map((s) => s.textContent).filter(Boolean).join(' · ');
  zoom.setAttribute('open', '');
});
zoom.addEventListener('click', () => zoom.removeAttribute('open'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') zoom.removeAttribute('open'); });
</script>
</body></html>`;

const out = path.join(here, 'font-playground.html');
fs.writeFileSync(out, html);
console.log(`${out}  ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB  ${fonts.length} faces`);
