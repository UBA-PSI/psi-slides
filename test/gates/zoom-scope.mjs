/*
 * Every rule that reads var(--zoom) sits on a slide.
 *
 * The auto-fit walk (fitZoomToChunk, clampZoomToWidth, psiExport.fitMeasure)
 * writes its trial zooms on the one chunk it is measuring, not on <html>,
 * because a change on <html> restyles and relays every element of every slide
 * - about 90 ms a step on lectures/diagrams, and a walk takes up to twenty
 * steps. That is only exact while every reader of the property is inside the
 * chunk. A rule outside it - a foot band, the viewport's padding, a piece of
 * chrome sized in calc(... * var(--zoom)) - would be measured at the old zoom
 * during the walk and change only when the result is committed, and if the
 * chunk's room depends on it the fit converges on a zoom that overflows.
 * Nothing throws: the slide is cut off in the hall.
 *
 * The commit leans on the same property. showZoom puts the zoom inline on
 * the slides that can be on screen and writes <html> only at the catch-up
 * half a second later, because a write there inside the press restyled the
 * whole deck; a reader outside the chunk would show the old zoom until then.
 *
 * So the subject of every such rule must be placed inside a chunk by its own
 * selector: .chunk on the subject or on one of its ancestors, or a class the
 * renderers only ever emit inside a chunk article (.chunk-..., or the
 * reviewed list below) anywhere in the chain that leads to the subject. A
 * class anywhere else does not place it: .chunk ~ .x is a sibling of the
 * article, and :has(.chunk-title) only asks a question. A new rule outside
 * fails here and names itself; the answer is either to put it on a chunk or
 * to write a different fit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'every rule reading var(--zoom) sits on a slide';

// Subject class -> where the renderer emits it. Reviewed by hand.
const IN_CHUNK = {
  'tag-label':    'the expansion label, inside .chunk',
  'overlay-card': 'a card of ::: overlay, inside the chunk\'s .overlay-layer',
  'dock':         '::: dock, a child of the chunk',
  'margin-note':  '::: footnote, lifted into .chunk-content',
  'annot-box':    'the live annotation box, inside the chunk',
  'annot-add':    'the + note button, a child of the chunk',
  'exp-chev':     'a ::: expand chevron, inside the chunk\'s .exps',
};

// The selector of every leaf block whose declarations read var(--zoom), per
// CSS literal in build.js. Comments are dropped first; @media and @supports
// wrappers are not leaves and never carry the property themselves.
export function zoomSelectors(src) {
  const out = [];
  for (const m of src.matchAll(/^const ([A-Z_0-9]*CSS[A-Z_0-9]*)\s*=\s*`([\s\S]*?)^`;/gm)) {
    out.push(...sheetZoomSelectors(m[2], m[1]));
  }
  return out;
}

// The same for one stylesheet, named by `literal` in what is reported.
export function sheetZoomSelectors(text, literal) {
  const out = [];
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let start = 0;
  for (let k = 0; k < css.length; k++) {
    if (css[k] === '{') { stack.push(css.slice(start, k).trim()); start = k + 1; }
    else if (css[k] === '}') {
      const body = css.slice(start, k), sel = stack.pop();
      if (body.includes('var(--zoom') && !body.includes('{')) {
        for (const one of sel.split(',')) out.push({ literal, selector: one.replace(/\s+/g, ' ').trim() });
      }
      start = k + 1;
    }
  }
  return out;
}

// The stylesheets that left build.js for runtime/ (PLAN-runtime-extraction.md),
// read as files: every one of them was a *CSS* literal the pattern above
// matched, so each is scanned as it was. The first four moved before the gate
// read files and dropped out of it unnoticed; none reads var(--zoom), so
// nothing was missed, but a rule added to one later would have been.
const RUNTIME_SHEETS = [
  'runtime/speaker.css',
  'runtime/souffleuse.css',
  'runtime/pulse-print.css',
  'runtime/watch-banner.css',
  'runtime/diagram.css',
];

// The selector as compounds, subject last, each with the combinator that
// joins it to the next one. The arguments of :has(), :not(), :is() and
// :where() are dropped first: they constrain an element, they do not say
// where it is.
function chain(selector) {
  let flat = '', depth = 0;
  for (const ch of selector) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (!depth) flat += ch;
  }
  const tokens = flat.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (/^[>+~]$/.test(t)) out[out.length - 1].next = t;
    else out.push({ compound: t, next: ' ' });
  }
  return out;
}

const classesOf = (compound) => [...compound.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
const inChunkClass = (c) => /^chunk-/.test(c) || !!IN_CHUNK[c];

export function onSlide(selector) {
  const parts = chain(selector);
  // Walking from the subject outwards: once a descendant or child combinator
  // has been crossed, every compound further out is an ancestor (or an
  // ancestor's sibling) of the subject. Before that, it is the subject or a
  // sibling of it.
  let ancestor = false;
  for (let i = parts.length - 1; i >= 0; i--) {
    const cls = classesOf(parts[i].compound);
    // Inside a chunk, and so is anything that shares a parent with it.
    if (cls.some(inChunkClass)) return true;
    // The article itself: the subject, or a box the subject sits in.
    if (cls.includes('chunk') && (i === parts.length - 1 || ancestor)) return true;
    if (i > 0 && (parts[i - 1].next === ' ' || parts[i - 1].next === '>')) ancestor = true;
  }
  return false;
}

export async function run({ report }) {
  const { ok, note } = report;
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const found = zoomSelectors(src);
  for (const file of RUNTIME_SHEETS) {
    found.push(...sheetZoomSelectors(fs.readFileSync(path.join(ROOT, file), 'utf8'), file));
  }
  ok(found.length > 20, 'the CSS literals still hold the rules that read var(--zoom)', String(found.length));
  note(found.length + ' selector(s) read var(--zoom)');
  const off = found.filter(f => !onSlide(f.selector));
  ok(off.length === 0,
    'every one sits on .chunk or on a class the renderers only emit inside a chunk - the fit measures on the chunk',
    off.map(f => `${f.literal}: ${f.selector}`).join('\n           '));
  const unused = Object.keys(IN_CHUNK).filter(c => !found.some(f => new RegExp('\\.' + c + '(?![\\w-])').test(f.selector)));
  ok(unused.length === 0, 'every class on the reviewed list still has a rule reading var(--zoom)', unused.join(', '));

  // The gate must be able to fail.
  ok(!onSlide('body .foot-band') && !onSlide('#psiINT-viewport'), 'a rule outside a chunk is caught');
  ok(!onSlide('.chunk.active ~ .foot-band') && !onSlide('.chunk + .x'),
     'and so is one whose subject is a sibling of a chunk');
  ok(!onSlide('body:has(.chunk-title.active) #psiINT-stage-viewport') && !onSlide('.x:not(.chunk)'),
     'and one that names a chunk class only inside a pseudo-class argument');
  ok(onSlide('.chunk .x') && onSlide('.chunk > .x ~ .y') && onSlide('.chunk-content + .x')
     && onSlide('body .chunk') && onSlide('.dock .x'),
     'while a subject inside a chunk, or the chunk itself, passes');
}
