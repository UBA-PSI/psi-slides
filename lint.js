#!/usr/bin/env node
/**
 * Lecture linter – static checks for source.md files.
 *
 * Zero-dep – nothing from node_modules – so it runs as a pre-commit gate
 * without the Markdown/Shiki stack, and independent of build.js so the two
 * can evolve without sharing state. It re-states the parser's ground truth
 * rather than importing it: VALID_TAGS, VALID_WIDTHS, attribute-tail syntax,
 * fence-aware reveal splits, ::: directives.
 *
 * The one exception is the diagram vocabulary, which comes from
 * diagram-core.mjs. That module is pure JS with no dependencies of its own,
 * so importing its *tables* costs this file nothing it was protecting, and it
 * removes thirteen copies that had to change in two files in one commit. The
 * rule there: tables only. A function would pull the whole compiler in behind
 * it.
 *
 * Usage:
 *   node lint.js <source.md>
 *   node lint.js lectures/
 *   node lint.js lectures/ --strict     # warnings become exit 2
 *
 * Exit codes:
 *   0  clean (or warnings without --strict)
 *   1  one or more errors
 *   2  --strict and at least one warning
 *
 * Per-file override anywhere in the source:
 *   <!-- linter: ignore reveal-overuse, density -->
 */

import fs from 'node:fs';
import path from 'node:path';

const VALID_TAGS = new Set([
  'title', 'principle', 'definition', 'example',
  'question', 'figure', 'exercise', 'free',
]);

const VALID_WIDTHS = new Set(['narrow', 'standard', 'wide', 'full']);

// Mirrors VIEW_DEFAULT_SPEC in build.js: frontmatter keys that pin how a
// lecture opens. The build hard-fails on a bad value, but a typo here is
// otherwise invisible – the lecture still builds and still looks fine, it
// just looks like the author never set anything – so the linter says it
// first. Only top-level `key: value` lines are inspected, which is all this
// zero-dep reader can see without a YAML parser.
const VIEW_DEFAULTS = {
  'font': ['serif', 'sans', 'mono'],
  'theme': ['light-red', 'light-teal', 'light-blue', 'light-orange', 'dark', 'terminal-amber', 'terminal-green'],
  'collapse': ['topic-bold', 'none'],
  'auto-fit': ['true', 'false'],
  'slide-numbers': ['vertical', 'horizontal', 'off'],
  'editor': ['both', 'speaker', 'none'],
};

// Mirrors build.js: the per-image inline cap, and the extension search order
// used to resolve `![](fig-id)` shorthand. An asset over the cap fails the
// build (`assertInlinable`), because shipping it as an external path quietly
// breaks the single-file promise – so this warning is the earlier, cheaper
// notice, not the only one.
// Kept here as plain fs.statSync so lint.js stays zero-dep.
// Mirrors collectDiagramImageRefs in build.js: `image <name> <asset>` lines
// inside a ::: diagram block reference assets exactly like ![](fig-id) does,
// and the build hard-fails on an oversized one – so the pre-commit gate has
// to find them too.
function diagramImageRefs(src) {
  const refs = [];
  let inDiagram = false;
  let inFence = false;
  for (const line of String(src).split('\n')) {
    // Fence-aware, like the block matchers in parseLecture and lintDiagram:
    // a ::: diagram inside a code fence is a syntax example, and collecting
    // its image lines converted (and with --optimize-images deleted) files
    // the lecture never actually references.
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!inDiagram) {
      if (/^:::\s+diagram\b/.test(line)) inDiagram = true;
      continue;
    }
    if (/^:::\s*$/.test(line)) { inDiagram = false; continue; }
    // `image <name> <asset>`, and a grid of images – `grid <name> image
    // <asset> CxR` – which carries its asset one token further along.
    const m = line.trim().match(/^image\s+\S+\s+(\S+)/)
      || line.trim().match(/^grid\s+\S+\s+image\s+(\S+)/);
    if (m) refs.push(m[1]);
  }
  return refs;
}

const IMG_EXTS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
// Video shares the `![](clip-id)` shorthand and has its own, larger cap –
// mirrors VIDEO_EXTS / MAX_INLINE_VIDEO_BYTES in build.js.
const VIDEO_EXTS = ['mp4', 'webm', 'm4v', 'mov'];
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_VIDEO_BYTES = 12 * 1024 * 1024;
const inlineCapFor = (p) =>
  (VIDEO_EXTS.includes(path.extname(p).slice(1).toLowerCase())
    ? MAX_INLINE_VIDEO_BYTES : MAX_INLINE_BYTES);

// Per-tag word budget. null = no limit. Tags with deliberately large
// bodies (figure, title) are exempt; one-liner tags are strict.
const DENSITY_BUDGET = {
  title: null,
  figure: null,
  principle: 80,
  question: 80,
  definition: 200,
  example: 250,
  exercise: 350,
  free: 250,
};

// The diagram vocabulary is *imported*, not mirrored. Thirteen tables used to
// be written out again here and had to change in two files in one commit;
// diagram-core.mjs is pure JS with zero dependencies of its own, so importing
// them costs this file nothing it was protecting.
//
// The rule that still holds: **import only the tables.** A function from that
// module would pull the whole compiler in behind it, and lint.js stays
// runnable without the Markdown/Shiki stack precisely because it does not.
//
// The dg*Name helpers bend that rule, and they are still a table: what
// `bars`, `grid`, `table` and `lanes` call the elements they expand into,
// indexed rather than listed. This file has to agree with the compiler
// exactly – a `brace over f-0,f-1,f-2` names elements no line declares –
// and writing the scheme out twice is the duplication importing the tables
// was meant to end. `rejectClassOn` and its siblings ride the same bend
// for the same reason: they ARE the rule for which class may sit on which
// kind, and a second spelling of it here is how this gate came to pass
// lines the build refuses – lectures/network-security is linted by CI but
// never built, so such a line merged green and failed every later build.
// All of them are one-liners over the tables, with nothing behind them.
//
// `dgTakes` rides the same bend, and for the sharpest version of the same
// reason: it is one function over DG_KIND_OPTS plus a table of the forms
// that have no keyword to list, and its whole purpose is that the compiler
// and this gate cannot print two different accounts of what a statement
// accepts. Restating it here would be the drift it exists to prevent.
import {
  DG_KEYWORDS, DG_STEP_OPS, DG_CLASSES, DG_PROMINENCE, DG_CLASS_KIND_SET,
  DG_KIND_OPTS, DG_BRACE_SIDES, DG_SIDES, DG_ALIGN_X, DG_ALIGN_Y, DG_SCALAR_X,
  DG_SCALAR_Y, DG_DEFAULT_KINDS, DG_ANCHORS, DG_DEFINES, DG_GRID_KINDS, DG_GRID_MAX,
  DG_PLOT_MAX_TICKS, DG_POINT_DIRS, DG_POINTED, DG_SHAPE_CLASSES, DG_RESERVED_IDS,
  dgBarName, dgTickName, dgBaseName, dgCellName, dgPlotName, dgPlotTicks,
  dgRowTag, dgColTag, dgLaneName, dgLaneCapName,
  DG_SEQ_ENTRIES, DG_SEQ_ARROWS,
  dgLifeName, dgMsgName, dgMsgNumName, dgMsgSubName, dgNoteName,
  dgMsgTag, dgMsgsTag, dgNotesTag, dgActorsTag, dgLivesTag,
  DG_EDGE_ARROWS, DG_STEP_NAME,
  rejectHeadClassIn, rejectSlotPair, rejectStepClass,
  rejectClassOn, DG_WORD_OPTS, dgTakes, dgArticle,
  DG_PLACED_HEADS, DG_PLACE_INTRO, dgNoPlacement,
} from './diagram-core.mjs';

const REVEAL_PCT_WARN = 0.5;
const ORPHAN_MIN = 2;

// One sentence per statement, and then it stops. Until now this file had no
// option check at all on the seven statements a newcomer meets first, so
// `box c "C" rightof a gap 1` produced no finding here: it passed the
// pre-commit gate and failed every later build. That is the exact trap
// CLAUDE.md records for the class gate, and it bites the same way, because
// CI lints lectures/network-security and lectures/diagrams without ever
// building them.
//
// Single quotes rather than the compiler's double ones, the way every other
// message in this file is written; the *list* is the part that must not
// differ, and that comes from dgTakes.
const dgUnexpectedMsg = (head, id, tok) =>
  `unexpected '${tok}' in ${head}${id ? ` ${id}` : ''} – ${dgTakes(head)}`;

// Every token that can follow a `between` member list. Derived from
// DG_KIND_OPTS rather than written out, because the written-out copy
// predated `point`, `space`, `cell`, `step`, `x` and `y` – each of those
// written after a `between` was read here as a third member and refused as
// 'expects exactly two elements' on a line the build accepts, which is the
// one direction a gate must never be wrong in. A derived set cannot drift
// the same way again.
const DG_PLACE_STOP = new Set(['frac', 'offset', 'gap', 'flush', 'same', '--', '->', 'point',
  ...Object.values(DG_KIND_OPTS).flat()]);

function splitFrontmatter(src) {
  if (!src.startsWith('---\n')) return { body: src, fmLines: 0, header: '' };
  const end = src.indexOf('\n---\n', 4);
  if (end === -1) return { body: src, fmLines: 0, header: '' };
  const header = src.slice(4, end);
  const body = src.slice(end + 5);
  const fmLines = header.split('\n').length + 2;
  return { body, fmLines, header };
}

function parseAttributeTail(text) {
  const m = text.match(/^(.*?)\s*\{([^}]*)\}\s*$/);
  if (!m) return { text: text.trim(), classes: [], ids: [] };
  const out = { text: m[1].trim(), classes: [], ids: [] };
  for (const tok of m[2].trim().split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('.')) out.classes.push(tok.slice(1));
    else if (tok.startsWith('#')) out.ids.push(tok.slice(1));
  }
  return out;
}

// A file that *documents* this directive must not thereby *use* it. The scan
// was over the raw source, so the tutorial's own sentence explaining the syntax
// - inside backticks, as an example - silenced `density` and `reveal-overuse`
// for the tutorial, lecture-wide and permanently. A check nobody can see being
// switched off is worse than a check that is missing, because the report still
// says the file is clean. Code fences and inline code spans are blanked before
// the scan, which is the same reading a Markdown renderer gives them.
function parseIgnores(src) {
  const set = new Set();
  const prose = String(src)
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`\n]*`/g, '');
  const re = /<!--\s*linter:\s*ignore\s+([^>]+?)\s*-->/g;
  for (const m of prose.matchAll(re)) {
    for (const tok of m[1].split(/[,\s]+/).filter(Boolean)) set.add(tok);
  }
  return set;
}

function wordCountOf(lines) {
  return lines.join(' ').split(/\s+/).filter(Boolean).length;
}

// One `default …` line, checked the same way wherever it is written: inside
// a block, or in the lecture's `diagram-defaults` frontmatter key. Mirrors
// dgReadDefault in build.js – a linter stricter or laxer than the build is
// worse than none, and there are now two places to get that wrong.
function lintDefaultStatement(words, ln, add, ctx) {
  const kind = words[1];
  if (!DG_DEFAULT_KINDS.has(kind)) {
    add(ln, 'error', 'unknown-diagram-default',
        `default expects one of ${[...DG_DEFAULT_KINDS].join(', ')}, got '${kind || ''}'`);
    return;
  }
  const tag = words[2] && words[2].startsWith('@') ? words[2] : '';
  const key = kind + tag;
  if (ctx.defaulted.has(key)) {
    add(ln, 'error', 'duplicate-diagram-default',
        `a second 'default ${kind}${tag ? ' ' + tag : ''}' – there can only be one per ${ctx.scope} (the first is on line ${ctx.defaulted.get(key)})`);
  } else {
    ctx.defaulted.set(key, ctx.reportLine);
    if (tag && ctx.onTag) ctx.onTag(kind, tag);
  }
  // An option belonging to another kind parses and then does nothing.
  const opts = DG_KIND_OPTS[kind];
  let inTail = false;
  for (let k = tag ? 3 : 2; k < words.length; k++) {
    const w = words[k];
    // The {…} tail may sit anywhere on the line and may be several
    // words; skip it rather than stopping, or an option written after
    // it would go unchecked here while the build still refuses it.
    if (inTail) { if (w.endsWith('}')) inTail = false; continue; }
    if (w.startsWith('{')) { if (!w.endsWith('}')) inTail = true; continue; }
    if (kind === 'brace' && DG_BRACE_SIDES.includes(w)) {
      add(ln, 'error', 'bad-diagram-default', `default brace: which side the spine sits on `
          + `is written 'side ${w}' – a bare '${w}' is one of the four words that also place a label.`);
      break;
    }
    if (opts.includes(w)) {
      // Skipping the value was how this file came to accept `default edge side
      // bottom` while the build refused it: everything not `brace side` went to
      // dgNum there, and to nothing at all here. A closed word list is as much
      // a value shape as a number is, and DG_WORD_OPTS is where both read it.
      const allowed = DG_WORD_OPTS[w];
      if (allowed && !allowed.includes(words[k + 1])) {
        add(ln, 'error', 'bad-diagram-default', `default ${kind}: ${w} expects `
            + `${allowed.join(' / ')}, got '${words[k + 1] ?? ''}'`);
      }
      k++;
      continue;
    }
    // Only kinds a `default` can name - see the same line in diagram-core.
    const owner = [...DG_DEFAULT_KINDS].find(kk => (DG_KIND_OPTS[kk] || []).includes(w));
    if (owner) {
      add(ln, 'error', 'bad-diagram-default',
          `default ${kind} has no '${w}' – that is ${dgArticle(owner)} ${owner} option. `
          + `default ${kind} takes ${opts.length ? opts.join(', ') + ' and ' : ''}a {…} attribute tail.`);
      k++;
    } else {
      // A `default` line carries no quoted label, so every remaining
      // word is either an option, its value, or junk.
      add(ln, 'error', 'bad-diagram-default', `unexpected '${w}' in default ${kind}`);
    }
  }
}

// The `diagram-defaults:` frontmatter key, without a YAML parser: after the
// `|` (or `>`) the block is whatever is indented under it, which is fifteen
// lines of scanning and keeps this file zero-dep. Returns the statements
// with their line numbers counted from the opening `---`.
function collectDiagramDefaults(header) {
  const lines = header.split('\n');
  const out = [];
  let indent = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (indent < 0) {
      if (/^diagram-defaults:[ \t]*[|>][-+]?[ \t]*$/.test(raw)) indent = 0;
      continue;
    }
    if (!raw.trim()) { out.push({ text: '', ln: i + 2 }); continue; }
    const lead = raw.length - raw.replace(/^[ \t]+/, '').length;
    if (lead === 0) break;             // back at the top level: the block ended
    if (indent === 0) indent = lead;
    out.push({ text: raw.slice(indent), ln: i + 2 });
  }
  return out;
}

// Checks the diagram DSL without re-implementing its layout: unknown
// statements, unknown classes, duplicate names and dangling references.
// Everything geometric is the build's business – but these four are the
// mistakes that are invisible in the source and expensive on a projector.
function lintDiagram(block, addOuter, fmLines, lectureTags) {
  // Which lines this block has already said something about. One authored
  // defect yields one causal diagnostic: the build suppresses its "has no
  // placement" consequence for a statement that stopped reading part-way
  // through its own line, and a line this gate has already reported on is the
  // nearest thing to that fact a linter can see.
  const noted = new Set();
  const add = (ln, severity, rule, msg) => { noted.add(ln); addOuter(ln, severity, rule, msg); };
  const defined = new Map();     // name -> line
  const tags = new Set();        // every @tag any element carries
  const referenced = [];         // { name, ln, what }
  const setMoves = [];           // `move @tag to …`, checked once tags are known
  let inStep = false;

  // `carries` is false on a `default` or `step` line: a tag written there is
  // a *use*, and the compiler's lecture-tag rule still wants some element to
  // carry it – registering it here as carried let exactly that omission
  // through the gate.
  const attrsOf = (text, ln, carries = true) => {
    const m = text.match(/\{([^}]*)\}/);
    const out = { id: null, classes: [], removedClasses: [], tags: [] };
    if (!m) return out;
    for (const tok of m[1].trim().split(/\s+/).filter(Boolean)) {
      // `{#id}` is gone from the language: an element's name goes in front.
      if (tok.startsWith('#')) {
        add(ln, 'error', 'bad-diagram-attribute', `'${tok}' – an element's name goes in front, `
            + 'not in the tail. On a box, dot, text, image, container, brace or a chart it is the '
            + 'word after the statement; on an edge or a sequence message it is an optional word '
            + `before the arrow's first endpoint, as in 'edge ${tok.slice(1) || 'name'} a -> b'.`);
      }
      else if (tok.startsWith('@')) {
        if (tok.length > 1) { if (carries) tags.add(tok.slice(1)); out.tags.push(tok.slice(1)); }
        else add(ln, 'error', 'bad-diagram-attribute', 'an empty @tag means nothing');
      }
      // `!class` removes that exact class – from a `default` layer, or from
      // the beat before it inside a `style` step. Additive syntax, so the only
      // thing to check here is the name and the two ways one tail can
      // contradict itself.
      else if (tok.startsWith('!')) {
        if (!DG_CLASSES.has(tok.slice(1))) {
          add(ln, 'error', 'unknown-diagram-class',
              `unknown diagram class '${tok}' – valid: ${[...DG_CLASSES].map(c => '!' + c).join(', ')}`);
        } else if (out.removedClasses.includes(tok.slice(1))) {
          add(ln, 'error', 'bad-diagram-attribute', `'${tok}' is written twice – one removal says it`);
        } else out.removedClasses.push(tok.slice(1));
      }
      else if (tok.startsWith('.')) {
        if (!DG_CLASSES.has(tok.slice(1))) {
          add(ln, 'error', 'unknown-diagram-class',
              `unknown diagram class '${tok}' – valid: ${[...DG_CLASSES].map(c => '.' + c).join(', ')}`);
        } else out.classes.push(tok.slice(1));
      } else {
        add(ln, 'error', 'bad-diagram-attribute',
            `'${tok}' in {…} is not #id, .class, !class or @tag`);
      }
    }
    for (const c of out.removedClasses) {
      if (out.classes.includes(c)) {
        add(ln, 'error', 'bad-diagram-attribute', `'.${c}' and '!${c}' are both written – `
            + 'one tail cannot both add and remove a class. Keep one.');
      }
    }
    // The same-slot pair and the clash rows are both the compiler's now, and
    // for two different reasons. A pair from one slot is an **error** raised by
    // rejectSlotPair, decidable from the tail alone and mirrored there rather
    // than here, so this file cannot print a second, different account of it.
    // A clash row is a **warning**, and it has to be beat-aware – `{.tone-4
    // .accent}` with a later `style x {.clear}` is a working figure, where the
    // accent ink is inert while the fill is there and becomes the ink the
    // moment the fill is taken away – which needs the resolved state at each
    // beat and is therefore the compiler's job. A linter stricter than the
    // build is worse than none.
    return out;
  };
  // What each name draws, so a `style` step can be answered about the classes
  // it writes. The compiler knows this from the model; this file has to be
  // told at each declaration, which is why `define` takes it.
  const kindOf = new Map();
  const define = (name, ln, kind) => {
    if (!name) return;
    // A name with a dot would be indistinguishable from `elem.cx` in a
    // coordinate; one with @ or # from a tag or an id token. Mirrors claim()
    // in build.js.
    if (!/^[A-Za-z_][\w-]*$/.test(name)) {
      add(ln, 'error', 'bad-diagram-name',
          `'${name}' is not a usable name – letters, digits, _ and - only, starting with a letter`);
      return;
    }
    if (kind) kindOf.set(name, kind);
    if (DG_RESERVED_IDS.has(name)) {
      add(ln, 'error', 'bad-diagram-name',
          `'${name}' is reserved – it already names a property every JavaScript object has, `
          + 'and the step runtime keys its tables by element id');
      return;
    }
    if (defined.has(name)) {
      add(ln, 'error', 'duplicate-diagram-id',
          `diagram element '${name}' already defined at line ${defined.get(name)}`);
    } else defined.set(name, ln + fmLines);
  };
  // Anchors (mix.right) and group names both resolve against the same
  // table, so a reference is only ever its part before the dot.
  // `X,Y` where either side may be `elem.cy` or `elem.left-0.4`. Mirrors
  // dgParseCoord in build.js, including which scalars belong to which axis.
  const referPair = (tok, ln, what) => {
    const parts = String(tok).split(',');
    if (parts.length !== 2) return;
    parts.forEach((raw, i) => {
      // `roc@0.35` – a value in a plot's own units. The build turns it into an
      // ordinary `roc.left+n` once the block is read; here it is just another
      // reference to check, so the plot still has to exist.
      const p = raw.match(/^([A-Za-z_][\w-]*)@(-?[\d.]+)$/);
      if (p && Number.isFinite(Number(p[2]))) {
        referenced.push({ name: p[1], ln, what });
        return;
      }
      const m = raw.match(/^([A-Za-z_][\w-]*)\.([a-z]+)([+-][\d.]+)?$/);
      if (!m) {
        if (!Number.isFinite(Number(raw))) {
          add(ln, 'error', 'bad-diagram-coordinate',
              `${what} expects a number, an element coordinate like 'x0.cy', `
              + `or a value in a plot like 'roc@0.35' – got '${raw}'`);
        }
        return;
      }
      const axis = i === 0 ? 'x' : 'y';
      const ok = axis === 'x' ? DG_SCALAR_X : DG_SCALAR_Y;
      if (!ok.has(m[2])) {
        add(ln, 'error', 'bad-diagram-coordinate',
            `${what}: '.${m[2]}' is not ${dgArticle(axis)} ${axis} coordinate – use ${[...ok].map(p => '.' + p).join(' / ')}`);
      }
      referenced.push({ name: m[1], ln, what });
    });
  };
  const refer = (tok, ln, what) => {
    const raw = String(tok || '').replace(/,$/, '');
    // A coordinate pair is a valid edge endpoint, not a name.
    if (raw.includes(',')) { referPair(raw, ln, what); return; }
    // `.tone-1` where `@tone-1` was meant: the leading dot would otherwise
    // strip to an empty name and vanish.
    if (raw.startsWith('.')) {
      const cls = raw.slice(1);
      add(ln, 'error', 'unknown-diagram-ref',
          `${what} refers to '${raw}'`
          + (DG_CLASSES.has(cls) ? ` – that is a class; a set you can address is written '@${cls}'` : ''));
      return;
    }
    const name = raw.split(/[.:]/)[0];
    // The anchor and its fraction are pure string checks, so the linter can
    // stay in step with the build on them even though it cannot resolve the
    // element itself.
    const m = raw.match(/^[^.]*\.([a-z]+)(?::(.+))?$/);
    if (m) {
      if (!DG_ANCHORS.has(m[1])) {
        add(ln, 'error', 'unknown-diagram-anchor',
            `unknown anchor '.${m[1]}' – valid: ${[...DG_ANCHORS].map(a => '.' + a).join(', ')}`);
      } else if (m[2] !== undefined) {
        const f = Number(m[2]);
        if (!Number.isFinite(f) || f < 0 || f > 1) {
          add(ln, 'error', 'bad-diagram-anchor-fraction',
              `anchor fraction on '.${m[1]}' must be between 0 and 1, got '${m[2]}'`);
        } else if (!['left', 'right', 'top', 'bottom'].includes(m[1])) {
          add(ln, 'error', 'bad-diagram-anchor-fraction',
              `a fraction only means something on .left/.right/.top/.bottom, not on .${m[1]}`);
        }
      }
    }
    // `raw` as well as `name`: a stray `0.3` where a member was expected
    // strips to `0`, and complaining about `0` sends the author looking for
    // something that is not on the line.
    if (name) referenced.push({ name, raw, ln, what });
  };

  // Mirrors dgParsePlacement token for token, and says only what that
  // function says: the two near-misses an author produces by generalising
  // from one cardinal placement to the next. Two of the four take a
  // preposition and two refuse it, which follows English and is not itself
  // the defect – the defect was that `above of a` bound `of` as the element
  // *name*, so the author was told their reference did not exist and nothing
  // named the word that was actually in the wrong place, and the mirror slip
  // `right a` read as though `right` were not a word in the language.
  // Everything else it consumes in silence: the reference and member checks
  // further down are the ones that speak about those tokens.
  //
  // Returns { next, place, attempted }. `attempted` means a placement was
  // recognised and refused, and the statement stops there rather than adding
  // a second sentence about tokens it has already lost its grip on.
  const readPlacement = (words, k, ln) => {
    const t = (i) => (words[i] === undefined ? '' : words[i]);
    let place = null, next = k;
    if (t(k) === 'at') { place = 'abs'; next = k + 2; }
    else if (t(k) === 'between') {
      let mEnd = k + 1;
      while (mEnd < words.length && !DG_PLACE_STOP.has(words[mEnd])) mEnd++;
      const refs = words.slice(k + 1, mEnd).join(',').split(',').map(s => s.trim()).filter(Boolean);
      if (refs.length !== 2) {
        add(ln, 'error', 'diagram-bad-between',
            `between expects exactly two elements, got ${refs.length}`);
        return { next: mEnd, place: null, attempted: true };
      }
      place = 'between';
      next = mEnd;
    } else {
      let dir = null;
      // Checked *before* the direction is bound, or `above` binds happily and
      // swallows `of` as the element name – which is the misparse.
      if ((t(k) === 'above' || t(k) === 'below') && t(k + 1) === 'of') {
        add(ln, 'error', 'bad-diagram-placement', `'${t(k)}' takes the element name directly – `
            + `write '${t(k)} ${t(k + 2) || 'X'}', not '${t(k)} of ${t(k + 2) || 'X'}'`);
        return { next: k, place: null, attempted: true };
      }
      if (t(k) === 'right' && t(k + 1) === 'of') { dir = 'right'; next = k + 2; }
      else if (t(k) === 'left' && t(k + 1) === 'of') { dir = 'left'; next = k + 2; }
      else if (t(k) === 'below') { dir = 'below'; next = k + 1; }
      else if (t(k) === 'above') { dir = 'above'; next = k + 1; }
      if (!dir && (t(k) === 'right' || t(k) === 'left') && t(k + 1) && t(k + 1) !== 'of') {
        add(ln, 'error', 'bad-diagram-placement',
            `'${t(k)}' is written '${t(k)} of' – write '${t(k)} of ${t(k + 1)}'`);
        return { next: k, place: null, attempted: true };
      }
      if (!dir) return { next: k, place: null, attempted: false };
      if (!t(next)) {
        add(ln, 'error', 'bad-diagram-placement', `${dir} expects an element name`);
        return { next, place: null, attempted: true };
      }
      next++;
      place = 'rel';
    }
    // Trailing options, shared by every placement form and each legal on
    // only some of them: a `gap` after an `at` is not part of the placement,
    // and the statement meets it as an unreadable token of its own.
    while (next < words.length) {
      const key = words[next];
      if ((key === 'gap' || key === 'flush') && place === 'rel') { next += 2; continue; }
      // Named rather than reported as an unknown token: `align` is still a
      // word in the language, just not this one, and it is what an author who
      // learned the old spelling will type.
      if (key === 'align' && place === 'rel') {
        add(ln, 'error', 'diagram-unexpected-token', `'align' on a placement is written 'flush' – `
            + `write 'flush ${words[next + 1] || 'middle'}'. 'align' on a line of its own is the `
            + 'statement that gives a set of elements one shared coordinate.');
        return { next, place, attempted: true };
      }
      if (key === 'frac' && place === 'between') { next += 2; continue; }
      if (key === 'offset') { next += 2; continue; }
      break;
    }
    return { next, place, attempted: false };
  };

  // The token walk behind the sentence above, for `box`, `dot`, `text` and
  // `image`. It is a lookup in DG_KIND_OPTS rather than a second
  // readGridOpts – and gating `w`, `h`, `r` and `point` on that table is not
  // strictness this file invented: ungated they parsed on every node kind
  // and drew nothing (`w` on a dot, `r` on a box), which is the silent no-op
  // the compiler has now closed. A gate that still passed them would be the
  // laxer of the two, which is how a line merges green and fails every later
  // build.
  //
  // Returns how far the statement got. Everything past that point is a token
  // the compiler never read, so the reference scan stops there too – without
  // it `box b "B" above of a` answers the one true sentence *and* the bogus
  // 'refers to "of"' that item 8 exists to remove.
  const scanNodeOpts = (head, id, words, from, ln) => {
    const opts = DG_KIND_OPTS[head] || [];
    let k = from;
    while (k < words.length) {
      const key = words[k];
      if (key === '->' || key === '--') { k += 2; continue; }
      if (key === 'same') {
        if (words[k + 1] !== 'as' || words[k + 2] === undefined) {
          add(ln, 'error', 'diagram-unexpected-token',
              `${head} ${id}: 'same' must be written 'same as <element>'`);
        }
        k += (words[k + 1] === 'as' && words[k + 2] !== undefined) ? 3 : 2;
        continue;
      }
      if (['w', 'h', 'r', 'pad', 'point'].includes(key) && opts.includes(key)) { k += 2; continue; }
      // A leader takes the edge's own tokens and means the same by them:
      // `--` is the plain stub, `->` one that points. `<-` and `<->` are
      // refused, because a leader names one operand and the words are always
      // the other end.
      if (key === '<-' || key === '<->') {
        add(ln, 'error', 'diagram-unexpected-token', `${head} ${id}: a leader points at one thing `
            + `and the words are always the other end, so '${key}' has nothing to reverse – `
            + `write '--' for a plain stub or '->' for one that points.`);
        return k;
      }
      const pl = readPlacement(words, k, ln);
      if (pl.attempted) return k;
      if (pl.place) { k = pl.next; continue; }
      add(ln, 'error', 'diagram-unexpected-token', dgUnexpectedMsg(head, id, key));
      return k;
    }
    return words.length;
  };

  let anonEdge = 0;
  // Charts declared so far in this block, in order. `same as` on a `plot` or a
  // `bars` is answered while the line is read, so it can only copy a chart
  // above it - and that is decidable from the line order alone, which means it
  // has to be decided here too. CI lints this repo's two development lectures
  // and never builds them, so a check the build makes and the linter does not
  // is a line that merges green and fails every later build.
  const chartsAbove = new Set();
  const chartSameAs = (kind, id, words, ln) => {
    const at = words.indexOf('same');
    if (at < 1 || words[at + 1] !== 'as') return;
    const name = words[at + 2];
    if (!name || chartsAbove.has(name)) return;
    add(ln, 'error', 'diagram-bad-chart', `${kind} ${id}: "same as ${name}" names no chart `
        + 'above it. A chart is sized when its own line is read, so it can only copy one it '
        + 'has already seen.');
  };
  const defaulted = new Map();      // kind[@tag] -> line, one per diagram
  const tagDefaults = new Map();   // kind -> Map(tag -> line)
  const carries = [];              // { kind, name, tags, ln }
  // Whether a line states where its element goes, matched **positionally**:
  // `point` takes `left` and `right`, so a line-wide test reads
  // `box b "B" point left` as placed. `right` and `left` are a placement only
  // in front of their `of`, and every other intro word only in front of an
  // operand.
  const hasPlacement = (words) => words.some((w, i) => (w === 'right' || w === 'left'
    ? words[i + 1] === 'of'
    : DG_PLACE_INTRO.has(w) && !!words[i + 1]));
  // The chart a `bars` line joins, or null. The *pair*, because a chart may be
  // named `series`.
  const seriesOf = (words) => {
    const at = words.findIndex((w, i) => w === 'series' && words[i + 1] === 'of');
    return at < 0 ? null : (words[at + 2] || '');
  };
  // Which kind words the class table can answer about. A `bars` or a `plot`
  // frame is registered as the box it draws, so nothing else needs excluding.
  const DG_CLASS_KINDS_OK = DG_CLASS_KIND_SET;   // imported: one list, not two
  const styled = [];               // { classes, removed, targets, ln } per `style` op
  // Lines a `table` has already read as its own rows. It is the one statement
  // besides `step` that takes continuation lines, and they are bare quoted
  // strings – read as statements they would each report a keyword that is a
  // quotation mark. The build skips them the same way, off the same count.
  let rowsRead = 0;
  // How many statements have drawn a node so far, which is the compiler's own
  // test for "is this the first element": it asks `model.nodes.length === 0`.
  let nodesSoFar = 0;
  for (let n = 0; n < block.lines.length; n++) {
    const { text, ln } = block.lines[n];
    if (n < rowsRead) continue;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Quotes first, then the tail: a quoted label may itself contain braces
    // (`"H = {0,1}^n"` is ordinary set notation), and matching the tail on
    // the raw line read that label as an attribute tail – this gate then
    // refused source the build accepts, which is the one direction a linter
    // must never be wrong in.
    const noQuoted = trimmed.replace(/"(?:\\.|[^"\\])*"/g, ' ');
    const words = noQuoted.replace(/\{[^}]*\}/g, ' ').trim().split(/\s+/).filter(Boolean);
    const head = words[0];
    const attrs = attrsOf(noQuoted, ln, head !== 'default' && head !== 'step');

    // The kind-gated class refusals, called exactly the way the compiler
    // calls them rather than re-stated. dgErr pushes {line, msg}; relabel
    // into this file's report.
    {
      const gate = [];
      if (head === 'bars' || head === 'grid') {
        rejectClassOn(head === 'grid' ? (words[2] || 'box') : 'box', attrs.classes, ln, gate, '', attrs.removedClasses);
      } else if (head === 'edge') {
        rejectClassOn('edge', attrs.classes, ln, gate, '', attrs.removedClasses);
        rejectHeadClassIn('tail', attrs.classes, ln, gate, attrs.removedClasses);
      } else if (head === 'box') {
        rejectClassOn('box', attrs.classes, ln, gate, '', attrs.removedClasses);
      } else if (head === 'container' || head === 'brace') {
        rejectClassOn(head, attrs.classes, ln, gate, '', attrs.removedClasses);
      } else if (head === 'dot' || head === 'text' || head === 'image') {
        rejectClassOn(head, attrs.classes, ln, gate, '', attrs.removedClasses);
      } else if (head === 'table' || head === 'lanes' || head === 'sequence') {
        // The three expanding statements whose tail lands on boxes – a table's
        // cells, a lane's bands, a sequence's actor heads – and the three this
        // switch did not name, so `sequence s at 0,0 {.smooth}` was refused by
        // the build and passed here. `bars` and `grid` were gated from the
        // start; the gap was that the list of statements grew and this switch
        // did not.
        rejectClassOn('box', attrs.classes, ln, gate, '', attrs.removedClasses);
      } else if (head === 'default' && words[1]) {
        rejectClassOn(words[1], attrs.classes, ln, gate, '', attrs.removedClasses);
        if (words[1] === 'edge') rejectHeadClassIn('default', attrs.classes, ln, gate, attrs.removedClasses);
      }
      // `point` aims an outline. The direction is a closed list, and an
      // outline the line itself declares either has a point or has not –
      // both answerable here. One that could only come from a default layer
      // is left to the build, the same restraint the `.fit` check shows.
      const pi = words.indexOf('point');
      if (pi > 0 && DG_KEYWORDS.has(head)) {
        const dir = words[pi + 1] || '';
        if (!DG_POINT_DIRS.has(dir)) {
          gate.push({ line: ln, msg: `point expects ${[...DG_POINT_DIRS].join(' / ')}, got "${dir}"` });
        }
        const own = attrs.classes.find((c) => DG_SHAPE_CLASSES.has(c));
        if (own && !DG_POINTED.has(own)) {
          gate.push({ line: ln, msg: `"point" aims an outline that has a point, and .${own} has none` });
        }
      }
      for (const e of gate) add(e.line, 'error', 'diagram-class-on-kind', e.msg);
    }

    if (head === 'align' || head === 'spread') {
      const axis = words[1];
      const from = head === 'align' ? 3 : 2;
      const members = words.slice(from).join(',').split(',').map(x => x.trim()).filter(Boolean);
      if (axis !== 'x' && axis !== 'y') {
        add(ln, 'error', 'bad-diagram-align', `${head} expects an axis, x or y, got '${axis || ''}'`);
      } else if (head === 'align') {
        const ok = axis === 'x' ? DG_ALIGN_X : DG_ALIGN_Y;
        const other = axis === 'x' ? DG_ALIGN_Y : DG_ALIGN_X;
        if (!ok.has(words[2])) {
          add(ln, 'error', 'bad-diagram-align', other.has(words[2])
            ? `align x/y: '${words[2]}' is ${dgArticle(axis === 'x' ? 'y' : 'x')} ${axis === 'x' ? 'y' : 'x'} edge. On the ${axis} axis use ${[...ok].join('/')}.`
            : `align ${axis} expects ${[...ok].join('/')}, got '${words[2] || ''}'`);
        } else if (members.length < 2) {
          add(ln, 'error', 'bad-diagram-align', `align ${axis} ${words[2]} needs at least two elements`);
        }
      } else if (members.length < 3) {
        add(ln, 'error', 'bad-diagram-align', `spread ${axis} needs at least three elements`);
      }
      for (const m of members) refer(m, ln, `${head} ${axis}`);
      inStep = false;
      continue;
    }

    if (head === 'default') {
      lintDefaultStatement(words, ln, add, {
        defaulted, scope: 'diagram', reportLine: ln + fmLines,
        onTag: (kind, tag) => {
          referenced.push({ name: tag, ln, what: `default ${kind}` });
          if (!tagDefaults.has(kind)) tagDefaults.set(kind, new Map());
          tagDefaults.get(kind).set(tag.slice(1), ln + fmLines);
        },
      });
      inStep = false;
      continue;
    }
    // A `step` takes its name from the token after the keyword and used to
    // ignore everything else on the line, so `step my name` compiled, made a
    // step called `my`, and dropped `name` with no error and no warning. Both
    // halves are decidable from the line: a step name is an identifier that
    // later lines and the editor's beat navigation both address, and the rule
    // for it is imported rather than paraphrased so the two cannot disagree.
    if (head === 'step') {
      if (words[1] && !DG_STEP_NAME.test(words[1])) {
        add(ln, 'error', 'bad-diagram-step', `'${words[1]}' is not a step name – a step name `
            + 'starts with a letter or an underscore and then takes letters, digits, '
            + 'underscores or hyphens. Any script: it is a label for a beat, not a name '
            + 'anything refers to.');
      }
      if (words.length > 2) {
        add(ln, 'error', 'bad-diagram-step', `unexpected '${words[2]}' in step ${words[1]} – `
            + 'a step takes one name, and its operations go on the lines beneath it');
      }
      inStep = true;
      continue;
    }
    if (inStep && DG_STEP_OPS.has(head)) {
      // What a `style` step may change, from the compiler's own table. The
      // static SVG is the last beat and the runtime revisits only the class
      // string and the geometry vectors, so a class the emitter bakes - a
      // font-size, a text-anchor, a drawable kind, a path kind, the drawing
      // order - has one value for the whole figure. Both signs, because a
      // removal that cannot be represented is exactly as silent as an
      // addition that cannot.
      if (head === 'style') {
        const gate = [];
        rejectStepClass(attrs.classes, attrs.removedClasses, ln, gate);
        for (const g of gate) add(ln, 'error', 'diagram-step-fixed-class', g.msg);
        // The *kind* gate as well, deferred to the end of the block. A step
        // may name an element declared below it and a tag whose members are,
        // so the answer does not exist yet on this line - which is the same
        // reason `model.tags` is built after parsing. Without it a step was
        // the one position the class table did not reach: `style a
        // {.no-head}` on a box is refused by the build and was clean here,
        // in both signs and through a tag.
        styled.push({ classes: attrs.classes, removed: attrs.removedClasses, ln,
          targets: words.slice(1).join(',').split(',').map(x => x.trim()).filter(Boolean) });
      }
      // A prominence verb rides the same deferred gate, because `emph a` and
      // `style a {.emph}` are one act spelled two ways and only the spelling
      // with the class was ever asked whether the kind can draw it. In
      // practice this is `emph` on a `text` or an `image`: `dim` and `ghost`
      // resolve to an opacity, which every kind carries. Written off
      // DG_PROMINENCE rather than off `emph`, so DG_CLASS_KINDS stays the one
      // answer to which kinds a prominence reaches.
      if (DG_PROMINENCE.includes(head)) {
        styled.push({ classes: [head], removed: [], ln,
          targets: words.slice(1).join(',').split(',').map(x => x.trim()).filter(Boolean) });
      }
      if (head === 'move' && words[2] === 'to' && words[3] && words[3].includes(',')) {
        referPair(words[3], ln, 'move … to');
      }
      // `move @row to …` gives every member the same placement, stacking the
      // whole set on one point. The build refuses it; say so here too.
      if (head === 'move' && words[1] && words[1].startsWith('@') && words[2] === 'to') {
        setMoves.push({ tag: words[1], ln });
      }
      const targets = words.slice(1).join(',').split(',').map(s => s.trim()).filter(Boolean);
      const stop = new Set(['to', 'by', 'gap', 'align', 'of', 'right', 'left', 'below', 'above', 'at']);
      for (const t of targets) {
        if (stop.has(t) || /^-?[\d.]+(,-?[\d.]+)?$/.test(t)) break;
        refer(t, ln, `step ${head}`);
      }
      continue;
    }
    if (!DG_KEYWORDS.has(head)) {
      const known = [...DG_KEYWORDS, ...(inStep ? DG_STEP_OPS : [])].join(', ');
      // A line of nothing but a quoted string leaves no word to name, and it
      // is now the likeliest way to arrive here: it is a table row that lost
      // its table, which is what a blank line in the middle of a run of rows
      // makes of every row under it. Name the row rather than 'undefined',
      // the way the build names it.
      const stray = words.length === 0 && (trimmed.match(/^"([^"]*)"/) || [])[1];
      // The same trap one statement along. A sequence's entries are `actor`,
      // `note` and `a -> b`, none of which means anything on its own, and the
      // run ends at the first line that is not one of the three – so an entry
      // with a typo in it silently ends the run and every entry after it
      // arrives here. Name what it is rather than reporting a keyword nobody
      // wrote, the way the table's rows are named above.
      const orphan = DG_SEQ_ENTRIES.has(head) || words.some(w => DG_SEQ_ARROWS.has(w));
      add(ln, 'error', 'unknown-diagram-statement', trimmed.startsWith('//')
        ? 'a comment line starts with # in a diagram, not //'
        : stray
          ? `unknown diagram statement '${stray}' – a bare quoted string is a table row, and a `
            + `table's rows are the lines directly under it with nothing else on them, `
            + 'up to the first blank line'
          : orphan
            ? `'${head}' only means something inside a sequence – \`actor\`, \`note\` and `
              + '`a -> b` are a sequence\'s entries, and the run of them ends at the first line '
              + 'that is not one of the three. Check the line above this one.'
            : `unknown diagram statement '${head}' – valid: ${known}`);
      continue;
    }
    inStep = false;

    // The first element in a block anchors the drawing at the origin; every
    // one after it has to say where it goes, because silently stacking two
    // elements on 0,0 is not a default anybody means. The build has always
    // refused it and this file was silent, which is the direction that merges
    // green and fails every later build.
    //
    // Two things keep it from being stricter than the build. The rule counts
    // *nodes*, so it is the same "first" the compiler counts – a `container`
    // or an `edge` above the line changes nothing. And a `series of` line is
    // exempt: it joins the frame of the chart it names and refuses a
    // placement by name, so requiring one would refuse source the build
    // accepts.
    //
    // The words are matched **positionally**, not "anywhere on the line", and
    // that is not fussiness: `point` takes `up / down / left / right`, so a
    // line-wide test read `box b "B" point left {.chevron}` as placed and went
    // silent on a line the build refuses. Ten lines of the corpus already
    // carry that shape. `right` and `left` are a placement only in front of
    // their `of`, and every other intro word only in front of an operand –
    // which also settles an element named `above` arriving as a leader target.
    if (DG_PLACED_HEADS.has(head)) {
      const placed = hasPlacement(words);
      // The *pair*, not the word: a chart may be named `series`.
      const series = head === 'bars' && seriesOf(words) !== null;
      // A statement with no name never reached the placement check in the
      // build either - it reports the missing name and pushes nothing, so it
      // is not the block's first node and it is not asked where it goes.
      if (words[1] && nodesSoFar > 0 && !series && !placed && !noted.has(ln)) {
        add(ln, 'error', 'diagram-no-placement', dgNoPlacement(head, words[1]));
      }
      if (words[1]) nodesSoFar++;
    }

    // `bars` and `grid` are the two statements that declare more than one
    // name. Everything they expand into is an ordinary element by the time the
    // compiler is done, and a `brace over f-0,f-1,f-2` is the whole point of
    // the naming - so unless this file registers those names too, every figure
    // built from a chart reports a dozen undefined references.
    // `plot` declares a frame plus a gridline, a tick label and possibly an
    // axis title per tick. Same reason as bars and grid: without registering
    // them, `hide roc-gx-3` reads as a reference to nothing.
    if (head === 'plot') {
      const id = words[1];
      // The build reads whatever token follows the head as the name and
      // refuses the line when there is none. `table`, `lanes` and `sequence`
      // said so here already; these did not, so `box` on a line of its own
      // was refused by the build and passed by this file.
      if (!id) { add(ln, 'error', 'bad-diagram-name', 'plot needs a name'); continue; }
      define(id, ln, 'box');
      // A plot's frame, gridlines and ticks each take their look from the
      // statement, so a class in the tail reached nothing at all - parsed,
      // validated and dropped. The build refuses it now, and a gate that
      // passed it would be the laxer of the pair.
      if (attrs.classes.length || (attrs.removedClasses || []).length) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id || ''}: a class in the tail reaches `
            + "nothing – a plot's frame, gridlines and ticks each take their look from the "
            + 'statement. Put the class on what you draw inside the frame, or name the plot '
            + 'in a `style` step.');
      }
      chartSameAs('plot', id, words, ln);
      chartsAbove.add(id);
      if (attrs.tags && attrs.tags.length) carries.push({ kind: head, name: id, tags: attrs.tags, ln });
      const num = (key, fallback) => {
        const i = words.indexOf(key);
        const v = i >= 0 ? Number(words[i + 1]) : NaN;
        return Number.isFinite(v) ? v : fallback;
      };
      const range = (key, fallback) => {
        const i = words.indexOf(key);
        const parts = i >= 0 ? String(words[i + 1] ?? '').split(',').map(Number) : [];
        return parts.length === 2 && parts.every(Number.isFinite) ? parts : fallback;
      };
      const xd = range('x', [0, 1]);
      const yd = range('y', [0, 1]);
      if (words.includes('step')) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id || ''}: the tick interval is 'tick', not `
            + "'step' – 'step' opens a beat.");
      }
      const st = num('tick', (xd[1] - xd[0]) / 5);
      const xt = dgPlotTicks(xd[0], xd[1], st);
      const yt = dgPlotTicks(yd[0], yd[1], st);
      if (!xt.length || !yt.length) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id || ''}: step ${st} does not divide the `
            + `ranges ${xd.join(',')} and ${yd.join(',')} into ticks`);
      } else if (xt.length > DG_PLOT_MAX_TICKS || yt.length > DG_PLOT_MAX_TICKS) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id}: ${Math.max(xt.length, yt.length)} ticks `
            + `on one axis – at most ${DG_PLOT_MAX_TICKS}, past which the grid is a grey field`);
      } else {
        xt.forEach((_, i) => { define(dgPlotName(id, 'gx', i), ln, 'edge'); define(dgPlotName(id, 'xt', i), ln, 'text'); });
        yt.forEach((_, i) => { define(dgPlotName(id, 'gy', i), ln, 'edge'); define(dgPlotName(id, 'yt', i), ln, 'text'); });
      }
      const strings = [...trimmed.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      if (strings[0]) define(dgPlotName(id, 'xl'), ln, 'text');
      if (strings[1]) define(dgPlotName(id, 'yl'), ln, 'text');
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') refer(words[k + 1], ln, `plot ${id}`);
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) referPair(words[k + 1], ln, `plot ${id} at`);
      }
      continue;
    }

    if (head === 'bars' || head === 'grid') {
      const id = words[1];
      if (!id) { add(ln, 'error', 'bad-diagram-name', `${head} needs a name`); continue; }
      // The frame of a chart is a box, whatever it repeats inside itself.
      define(id, ln, 'box');
      if (attrs.tags && attrs.tags.length) carries.push({ kind: head, name: id, tags: attrs.tags, ln });
      const strings = [...trimmed.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      // Narrow, for the reason the `table … h` check above is narrow: the
      // expanding statements have no general option check in either file, and
      // this is the one word a migrating author types. `calm` is deleted from
      // the language – the verb for `.dim` is `dim`, in all three positions.
      if (head === 'bars' && words.includes('calm')) {
        add(ln, 'error', 'bad-diagram-bars', `bars ${id}: 'calm' is gone – the three prominence `
            + "words are the same in a class, in a step and here: 'emph', 'dim', 'ghost'.");
      }
      if (head === 'bars') {
        const cols = (strings[0] || '').split(',').map(s => s.trim()).filter(Boolean).length;
        if (!cols) {
          add(ln, 'error', 'bad-diagram-bars',
              `bars ${id || ''} needs its values as one string, e.g. "18,17,15,11"`);
        }
        for (let i = 0; i < cols; i++) define(dgBarName(id, i), ln, 'box');
        // `series of <chart>` is a run of columns inside somebody else's
        // frame, so it declares columns and nothing else – no ticks, no
        // baseline. Registering a `<id>-base` for one would let `hide g-base`
        // through a gate the build then refuses.
        const joined = seriesOf(words);
        const isSeries = joined !== null;
        // Everything a series does not own. The frame, the scale, the ticks
        // and the baseline belong to the chart it joined, so a number for any
        // of them is one the drawing ignores – which is what the build says,
        // and what this file used to pass. All of it is on the line.
        if (isSeries) {
          for (const owned of ['w', 'h', 'space']) {
            if (words.includes(owned)) {
              add(ln, 'error', 'bad-diagram-bars', `bars ${id}: "${owned}" belongs to ${joined}, `
                  + 'the chart this series joined – a series draws columns in a frame it does not own');
            }
          }
          if (hasPlacement(words)) {
            add(ln, 'error', 'bad-diagram-bars', `bars ${id}: a series is placed by the chart it `
                + `joined, so it takes no placement of its own – it is "series of ${joined}" and nothing more`);
          }
        } else if (words.includes('stacked')) {
          add(ln, 'error', 'bad-diagram-bars', `bars ${id}: "stacked" says what this series stands `
              + 'on, so it needs a series to stand on – write it on a "series of <chart>" line');
        }
        // A series draws in a frame it does not own, so it has no size to set
        // and the build refuses `same as` on it; a frame `bars` takes it the
        // way a `plot` does.
        if (!isSeries) { chartSameAs('bars', id, words, ln); chartsAbove.add(id); }
        if (strings[1] !== undefined) {
          if (isSeries) {
            add(ln, 'error', 'bad-diagram-bars', `bars ${id}: the tick strip belongs to the chart `
                + 'this series joined – one label per column, and a series shares its columns '
                + 'rather than adding any');
          } else {
            // Split on a pipe when there is one, on spaces otherwise – the
            // same two lines the compiler runs. A flat chart labels its rows
            // with phrases, and those cannot be written with a space-split at
            // all; `|` is the mark a table row and a lanes list already use.
            const piped = strings[1].includes('|');
            // Exactly the compiler's two lines, empty parts and all: filtering
            // them here would count "a | | b" as two labels where the build
            // counts three, which makes the gate stricter on one input and
            // laxer on another.
            const ticks = piped
              ? strings[1].split('|').map(s => s.trim())
              : strings[1].trim().split(/\s+/).filter(Boolean);
            // An error, because the build makes it one. A linter laxer than the
            // build is the worse of the two directions to be wrong in: the
            // pre-commit gate passes and the build then refuses.
            if (ticks.length !== cols) {
              add(ln, 'error', 'bad-diagram-bars', `bars ${id}: ${ticks.length} tick label(s) for `
                  + `${cols} column(s) – the second string is split on ${piped ? '"|"' : 'spaces'}, `
                  + 'one label per column');
            }
            for (let i = 0; i < Math.min(ticks.length, cols); i++) define(dgTickName(id, i), ln, 'text');
          }
        }
        if (!isSeries) define(dgBaseName(id), ln, 'edge');
        // `emph 1,3` and `calm 0` name columns by number, and the count is on
        // the same line, so a number past the end is answerable here. The
        // build refuses it rather than marking nothing.
        for (const word of ['emph', 'calm']) {
          const at = words.indexOf(word);
          if (at < 2) continue;
          for (const ix of String(words[at + 1] ?? '').split(',').map(s => s.trim()).filter(s => s !== '')) {
            const v = Number(ix);
            if (!Number.isFinite(v) || v < 0 || v >= cols) {
              add(ln, 'error', 'bad-diagram-bars', `bars ${id}: "${word} ${ix}" names no column – `
                  + `this chart has ${cols}, numbered 0 to ${cols - 1}`);
            }
          }
        }
      } else {
        const kindWord = words[2];
        if (!DG_GRID_KINDS.has(kindWord)) {
          add(ln, 'error', 'bad-diagram-grid', `grid ${id || ''}: expected one of `
              + `${[...DG_GRID_KINDS].join(', ')} after the name, got '${kindWord || ''}'`);
        }
        const dims = words.map(w => /^(\d+)x(\d+)$/.exec(w)).find(Boolean);
        if (!dims) {
          add(ln, 'error', 'bad-diagram-grid',
              `grid ${id || ''}: expected the shape as CxR (columns by rows)`);
        } else if (+dims[1] * +dims[2] > DG_GRID_MAX || +dims[1] < 1 || +dims[2] < 1) {
          add(ln, 'error', 'bad-diagram-grid', `grid ${id}: ${dims[1]}x${dims[2]} is `
              + `${+dims[1] * +dims[2]} cells – between 1 and ${DG_GRID_MAX}, above which a `
              + 'picture stops being countable anyway');
        } else {
          for (let r = 0; r < +dims[2]; r++) {
            for (let c = 0; c < +dims[1]; c++) define(dgCellName(id, c, r), ln, words[2] || 'box');
          }
        }
      }
      // The placement is the ordinary grammar, so the ordinary reference
      // checks apply to it.
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') refer(words[k + 1], ln, `${head} ${id}`);
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) referPair(words[k + 1], ln, `${head} ${id} at`);
      }
      continue;
    }

    // `sequence` is the third statement that reads the lines under it, and it
    // reads them for the reason the other two do: the frame's height is a
    // function of what stands in it. One thing has to be mirrored exactly or
    // this gate goes out of step with the build – a blank line does *not* end
    // the run. What ends it is the first line that is not an entry, and that
    // is decidable from the line alone: `actor`, `note`, or an arrow between
    // two names.
    //
    // Everything the statement expands into is declared here for the reason a
    // table's cells are: `brace over wa-4,wa-7` and `text … -> wa-3` are the
    // whole point of the construct, and a gate that did not know those names
    // would refuse every figure that used it.
    if (head === 'sequence') {
      const id = words[1];
      if (!id) {
        add(ln, 'error', 'bad-diagram-name', 'sequence needs a name');
        continue;
      }
      define(id, ln, 'box');
      if (words.includes('h')) {
        add(ln, 'error', 'bad-diagram-sequence', `sequence ${id}: 'header' is the height of one `
            + "actor head, and it is what 'h' used to mean here – write 'header <n>'. On every "
            + "other statement 'h' is the whole element, which is why it is not this one.");
      }
      const carry = (name, kind, extra = []) => {
        const t = [...attrs.tags, ...extra];
        if (t.length) carries.push({ kind, name, tags: t, ln });
      };
      carry(id, 'box');
      const entries = [];
      let lastAt = n;
      for (let m = n + 1; m < block.lines.length; m++) {
        const raw = block.lines[m].text.trim();
        if (!raw || raw.startsWith('#')) continue;
        const nq = raw.replace(/"(?:\\.|[^"\\])*"/g, ' ');
        const w = nq.replace(/\{[^}]*\}/g, ' ').trim().split(/\s+/).filter(Boolean);
        const aAt = w.findIndex(v => DG_SEQ_ARROWS.has(v));
        // A statement keyword ends the run before the arrow test, mirroring
        // the build exactly. An annotation carrying a leader (`text n "…"
        // right of wa-3 -- wa-3`) holds an arrow token, and without this it
        // was read as a message here too - so the linter reported that the
        // words in it are not actors, for a line that is now an ordinary
        // statement. The two files have to agree on where the run ends or
        // their `rowsRead` counts diverge and every line after it is judged
        // against the wrong grammar.
        if (DG_KEYWORDS.has(w[0])) break;
        if (!DG_SEQ_ENTRIES.has(w[0]) && aAt < 0) break;
        // The kind the entry expands into: an `actor` head and a `note` are
        // boxes, a message is an edge. Only the slot-pair check ran on these
        // tails, so `actor u "U" {.smooth}` and a message carrying `{.hex}`
        // passed the gate and failed the build - the one family of tails the
        // class table did not reach.
        {
          const ea = attrsOf(raw, block.lines[m].ln, false);
          const gate = [];
          const eKind = DG_SEQ_ENTRIES.has(w[0]) ? 'box' : 'edge';
          rejectClassOn(eKind, ea.classes, block.lines[m].ln, gate, '', ea.removedClasses);
          // The scope gate the kind implies, mirrored from the build: a
          // message is an edge, so a head class in its tail says what the
          // arrow token already said. Both signs, because both are inert.
          if (eKind === 'edge') rejectHeadClassIn('tail', ea.classes, block.lines[m].ln, gate, ea.removedClasses);
          for (const g of gate) add(block.lines[m].ln, 'error', 'diagram-class-kind', g.msg);
        }
        entries.push({ w, aAt, nq, ln: block.lines[m].ln });
        lastAt = m;
      }
      rowsRead = lastAt + 1;

      const actors = [];
      const known = new Set();
      const msgs = [];
      const notes = [];
      // `space n` on an entry line: the air above that one band. Read here for
      // the reason every other word of this grammar is – a gate that reported
      // it as an unexpected token would be stricter than the build, which is
      // the one thing worse than no gate. Stripped off the word list before
      // the stray check, exactly as the compiler strips it.
      const readSpace = (e) => {
        // Found by its word, with the same two guards the build uses: the
        // statement word and the name after it are never the keyword, and
        // neither is a token beside an arrow. Nothing forbids an actor called
        // `space`.
        const k = e.w.findIndex((v, i) => v === 'space' && i > 1
          && !DG_SEQ_ARROWS.has(e.w[i - 1] || '')
          && !DG_SEQ_ARROWS.has(e.w[i + 1] || ''));
        if (k < 0) return { w: e.w, present: false };
        const v = e.w[k + 1];
        if (v === undefined || !/^-?\d*\.?\d+$/.test(v)) {
          add(e.ln, 'error', 'bad-diagram-sequence',
            `sequence ${id} entry space expects a number, got '${v ?? ''}'`);
        } else if (Number(v) < 0) {
          add(e.ln, 'error', 'bad-diagram-sequence', `space ${v}: space is the air above an `
              + 'entry, so it cannot be negative – a band pulled into the one above it draws '
              + 'one label through another. Reorder the entries instead.');
        }
        return { w: [...e.w.slice(0, k), ...e.w.slice(k + 2)], present: true };
      };
      for (const e of entries) {
        const ea = attrsOf(e.nq, e.ln, true);
        const es = readSpace(e);
        e.w = es.w;
        e.aAt = e.w.findIndex(v => DG_SEQ_ARROWS.has(v));
        if (e.w[0] === 'actor') {
          const aid = e.w[1];
          if (!aid) {
            add(e.ln, 'error', 'bad-diagram-sequence', 'actor needs a name and a label – actor u "User"');
            continue;
          }
          if (ea.id) {
            add(e.ln, 'error', 'bad-diagram-sequence', `actor ${aid} is named by the word after `
                + `'actor', so '#${ea.id}' in the tail is a second name – drop one`);
          }
          if (e.w.length > 2) {
            add(e.ln, 'error', 'bad-diagram-sequence', `unexpected '${e.w.slice(2).join(' ')}' in `
                + `actor ${aid} – an actor is \`actor <name> "<label>"\` and an attribute tail`);
          }
          if (es.present) {
            add(e.ln, 'error', 'bad-diagram-sequence', `actor ${aid} has no 'space' – the heads `
                + 'are one row and the air above them is the sequence\'s own. `space` belongs on '
                + 'a note or a message, where it is the gap above that band.');
          }
          define(aid, e.ln, 'box');
          carry(aid, 'box', [...ea.tags, dgActorsTag(id)]);
          define(dgLifeName(aid), e.ln, 'edge');
          carry(dgLifeName(aid), 'edge', [dgLivesTag(id)]);
          actors.push(aid);
          known.add(aid);
          continue;
        }
        if (e.w[0] === 'note') {
          const on = String(e.w[1] ?? '').split(',').map(s => s.trim()).filter(Boolean);
          if (!on.length) {
            add(e.ln, 'error', 'bad-diagram-sequence', 'note needs the lifeline it stands on – '
                + '`note <actor> "…"`, or `note <actor>,<actor> "…"` to centre it between two');
            continue;
          }
          if (on.length > 2) {
            add(e.ln, 'error', 'bad-diagram-sequence', `note ${on.join(',')}: a note stands on one `
                + `lifeline or between two, got ${on.length}`);
            continue;
          }
          if (e.w.length > 2) {
            add(e.ln, 'error', 'bad-diagram-sequence', `unexpected '${e.w.slice(2).join(' ')}' in `
                + `note ${on.join(',')} – a note is \`note <actor> "<text>"\` and an attribute tail. `
                + 'A note breaks at \\n, so several lines are one string.');
          }
          notes.push({ on, ln: e.ln, own: ea.id, tags: ea.tags });
          continue;
        }
        const from = e.w[e.aAt - 1], to = e.w[e.aAt + 1];
        if (!from || !to) {
          add(e.ln, 'error', 'bad-diagram-sequence', `a message needs an actor on both sides of '${e.w[e.aAt]}'`);
          continue;
        }
        // The same one sentence an `edge` follows since item 9: the token
        // before the arrow is the from-actor, an optional token before *that*
        // is the message's own name. `{#id}` is gone from the language, so this
        // is the only way a message gets a name a brace or an `at` can address.
        // No collision rule of its own: the only way the name slot can be
        // wrong is that the name is not available, and `define` answers that
        // with the sentence every other statement gets.
        const ownName = e.aAt === 2 ? e.w[0] : null;
        const stray = [...e.w.slice(0, Math.max(0, e.aAt - (ownName ? 2 : 1))), ...e.w.slice(e.aAt + 2)];
        if (stray.length) {
          add(e.ln, 'error', 'bad-diagram-sequence', `unexpected '${stray.join(' ')}' in the message `
              + `${from} ${e.w[e.aAt]} ${to} – a message is \`<actor> -> <actor> "<label>"\`, `
              + 'optionally a second, smaller string under it, then an attribute tail');
        }
        // Two quoted strings is a label and the smaller line under it; the
        // build reads no more, so a third is a string the drawing would take
        // and never paint.
        const quoted = (block.lines.find(l => l.ln === e.ln).text.match(/"(?:\\.|[^"\\])*"/g) || []);
        if (quoted.length > 2) {
          add(e.ln, 'error', 'bad-diagram-sequence', `the message ${from} ${e.w[e.aAt]} ${to} carries `
              + `${quoted.length} strings – a message takes its label and, under it, one smaller `
              + 'second line. A second line breaks at \\n, so several lines of it are still one string.');
        }
        msgs.push({ from, to, ln: e.ln, own: ownName, tags: ea.tags, sub: quoted.length > 1 });
      }
      if (!actors.length) {
        add(ln, 'error', 'bad-diagram-sequence', `sequence ${id} declares no actors – put `
            + '`actor <name> "<label>"` lines directly under it, one per column');
      }
      const isActor = (name, eln, what) => {
        if (known.has(name)) return true;
        add(eln, 'error', 'bad-diagram-sequence', `${what}: '${name}' is not an actor of `
            + `sequence ${id} – this sequence has ${actors.join(', ')}`);
        return false;
      };
      // The generated names, and the tags that are the reason the statement
      // stays small: a message per beat, every message of one actor, every
      // note, every head, every lifeline.
      const unnumbered = words.includes('unnumbered');
      msgs.forEach((m, i) => {
        const ends = [m.from, ...(m.to === m.from ? [] : [m.to])];
        const ok = ends.every(x => isActor(x, m.ln, 'message'));
        define(m.own || dgMsgName(id, i), m.ln, 'edge');
        tags.add(dgMsgTag(id, i));
        tags.add(dgMsgsTag(id));
        if (ok) for (const x of ends) tags.add(dgMsgsTag(x));
        carry(m.own || dgMsgName(id, i), 'edge',
          [...m.tags, dgMsgTag(id, i), dgMsgsTag(id), ...(ok ? ends.map(dgMsgsTag) : [])]);
        if (!unnumbered) {
          define(dgMsgNumName(id, i), m.ln, 'text');
          carry(dgMsgNumName(id, i), 'text', [dgMsgTag(id, i)]);
        }
        if (m.sub) {
          define(dgMsgSubName(id, i), m.ln, 'text');
          carry(dgMsgSubName(id, i), 'text', [dgMsgTag(id, i)]);
        }
      });
      notes.forEach((nt, j) => {
        nt.on.forEach(x => isActor(x, nt.ln, 'note'));
        define(nt.own || dgNoteName(id, j), nt.ln, 'box');
        tags.add(dgNotesTag(id));
        carry(nt.own || dgNoteName(id, j), 'box', [...nt.tags, dgNotesTag(id)]);
      });
      if (actors.length) { tags.add(dgActorsTag(id)); tags.add(dgLivesTag(id)); }
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') refer(words[k + 1], ln, `${head} ${id}`);
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) referPair(words[k + 1], ln, `${head} ${id} at`);
      }
      continue;
    }

    // `table` and `lanes` expand at parse time the way bars, grid and plot do,
    // so they need the same treatment for the same reason: a `brace over
    // t-0-1,t-0-2` names cells no line of the source declares, and a table
    // additionally generates two tags per cell – the whole point of the
    // statement, since `show @t-row-2` is the one-line beat that twelve
    // hand-named boxes could not be.
    if (head === 'table' || head === 'lanes') {
      const id = words[1];
      // Named first, because every cell and every band is named after it: a
      // nameless statement would otherwise declare a dozen elements all
      // called 'undefined-<c>-<r>'.
      if (!id) {
        add(ln, 'error', 'bad-diagram-name', `${head} needs a name`);
        continue;
      }
      define(id, ln, 'box');
      // A row is one string split on `|`, because a row of a table is one
      // sentence with three parts. Commas already separate a value list and
      // the halves of a coordinate.
      const cellsOf = (s) => String(s).split('|').map(x => x.trim());
      // Read the way the tokenizer reads a quoted token, escapes and all, and
      // including an unterminated one – that takes the rest of the line rather
      // than being an error, and a gate stricter than the build is worse than
      // no gate.
      const quoted = (s) => {
        const m = String(s).match(/"((?:\\[\s\S]|[^"\\])*)"?/);
        return m && m[1].replace(/\\([\s\S])/g, (_, c) => (c === 'n' ? '\n' : c));
      };
      // Not `!first`: an empty string is a heading row of one nameless
      // column, which is what the build reads it as too.
      const first = quoted(trimmed);
      if (first === null) {
        add(ln, 'error', head === 'table' ? 'bad-diagram-table' : 'bad-diagram-lanes', head === 'table'
          ? `table ${id} needs its heading row as one string, e.g. "Attack | Layer | Countermeasure"`
          : `lanes ${id} needs its lane names as one string, e.g. "User | SOC | IT ops"`);
        continue;
      }
      // Two narrow checks rather than a second readGridOpts. Neither file
      // checks an unknown option name on an expanding statement – CLAUDE.md
      // records that asymmetry as deliberate, and the build names the line –
      // but these two are the exact slips a migrating author makes, and both
      // are decidable from the line alone.
      if (words.includes('h')) {
        const per = head === 'table' ? 'row' : 'band';
        add(ln, 'error', head === 'table' ? 'bad-diagram-table' : 'bad-diagram-lanes',
            `${head} ${id}: '${per}' is the height of one ${head === 'table' ? 'row' : 'band'}, `
            + `and it is what 'h' used to mean here – write '${per} <n>'. On every other `
            + "statement 'h' is the whole element, which is why it is not this one.");
      }
      if (head === 'table' && words.includes('w') && words.includes('col')) {
        add(ln, 'error', 'bad-diagram-table', `table ${id}: 'col' gives each column its own width, `
            + "so 'w' – which divides one total equally – says the same thing a second way. Drop one.");
      }
      const heads = cellsOf(first);
      // Every element either statement expands into carries the statement's
      // own tags, so one entry per generated element is what makes the
      // set-move count agree with the build's. The kind is the kind the
      // element ends up being – a cell is a box, a lane caption a text –
      // because that is what a `default <kind> @tag` is matched against.
      const carry = (name, kind, extra = []) => {
        const t = [...attrs.tags, ...extra];
        if (t.length) carries.push({ kind, name, tags: t, ln });
      };
      carry(id, 'box');
      if (head === 'lanes') {
        heads.forEach((name, i) => {
          define(dgLaneName(id, i), ln, 'box');
          carry(dgLaneName(id, i), 'box');
          // A band with no name gets no caption, so nothing declares that name.
          if (!name) return;
          define(dgLaneCapName(id, i), ln, 'text');
          carry(dgLaneCapName(id, i), 'text');
        });
      } else {
        // The rows are the run of bare quoted strings under the statement,
        // read here exactly as the build reads them: a blank line ends the
        // run, a comment inside it is passed over, and the first line that is
        // not one quoted string ends it too.
        const rows = [];
        for (let m = n + 1; m < block.lines.length; m++) {
          const rt = block.lines[m].text.trim();
          if (!rt) break;
          if (rt.startsWith('#')) continue;
          if (!/^"(?:\\[\s\S]|[^"\\])*"?$/.test(rt)) break;
          rows.push({ cells: cellsOf(quoted(rt)), ln: block.lines[m].ln });
          rowsRead = m + 1;
        }
        const colAt = words.indexOf('col');
        const widths = colAt > 1
          ? String(words[colAt + 1] ?? '').split(',').map(s => s.trim()).filter(s => s !== '')
          : null;
        if (widths && widths.length !== heads.length) {
          add(ln, 'error', 'bad-diagram-table', `table ${id}: ${widths.length} width(s) in "col" for `
              + `${heads.length} column(s) – one number per column, separated by commas`);
        }
        // Errors, both of them, because the build makes them errors: a row
        // whose parts do not line up with the heading has a cell the table has
        // no column for, and it is decidable from the two lines alone.
        for (const r of rows) {
          if (r.cells.length !== heads.length) {
            add(r.ln, 'error', 'bad-diagram-table', `table ${id}: this row has ${r.cells.length} `
                + `cell(s) and the heading has ${heads.length} – rows are split on "|", one part `
                + 'per column');
          }
        }
        [heads, ...rows.map(r => r.cells)].forEach((cells, r) => {
          cells.forEach((_, c) => {
            if (c >= heads.length) return;
            define(dgCellName(id, c, r), ln, 'box');
            tags.add(dgRowTag(id, r));
            tags.add(dgColTag(id, c));
            carry(dgCellName(id, c, r), 'box', [dgRowTag(id, r), dgColTag(id, c)]);
          });
        });
      }
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') refer(words[k + 1], ln, `${head} ${id}`);
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) referPair(words[k + 1], ln, `${head} ${id} at`);
      }
      continue;
    }

    if (DG_DEFINES.has(head)) {
      if (!words[1]) { add(ln, 'error', 'bad-diagram-name', `${head} needs a name`); continue; }
      define(words[1], ln, head);
      if (attrs.tags && attrs.tags.length) carries.push({ kind: head, name: words[1], tags: attrs.tags, ln });

      // A container and a brace hold a member list and place nothing, so they
      // share none of the node grammar below and get their own two checks.
      if (head === 'brace' || head === 'container') {
        const id = words[1] || '';
        const overAt = words.indexOf('over');
        if (overAt < 0) {
          add(ln, 'error', 'diagram-missing-members', `${head} ${id} needs "over a,b,c"`);
          continue;
        }
        // **The member run ends where the commas stop.** A member list is
        // comma-separated, so it continues only while the previous token ended
        // with a comma or the next begins with one. Scanning instead to the
        // first token in a fixed set of four words – which is what this file
        // did, mirroring the old compiler – meant any token *not* in that set
        // was swallowed as a member name, so a mistyped or wrong-statement
        // option became an element and the author was told, twice, that a
        // reference they never wrote was undefined. The `brace` case was the
        // sharpest, because `pad` on a brace was renamed *from* `gap`: the one
        // word an author is likeliest to write there was the word the
        // statement answered worst.
        let mEnd = overAt + 1;
        while (mEnd < words.length) {
          if (mEnd === overAt + 1) { mEnd++; continue; }
          if (!words[mEnd - 1].endsWith(',') && !words[mEnd].startsWith(',')) break;
          mEnd++;
        }
        const members = words.slice(overAt + 1, mEnd).join(',')
          .split(',').map(s => s.trim()).filter(Boolean);
        if (!members.length) {
          add(ln, 'error', 'diagram-missing-members', `${head} ${id} lists no members`);
          continue;
        }
        for (const m of members) refer(m, ln, `${head} ${id}`);
        for (let k = mEnd; k < words.length; k++) {
          // `side <word>` – a keyed option like `pad`, since item 22. A bare
          // side word was the last positional option in the statement grammar
          // and is now an error naming the keyword.
          if (head === 'brace' && words[k] === 'side') {
            if (!DG_BRACE_SIDES.includes(words[k + 1])) {
              add(ln, 'error', 'diagram-unexpected-token', `brace ${id}: side expects `
                  + `${DG_BRACE_SIDES.join(' / ')}, got '${words[k + 1] ?? ''}'`);
            }
            k++;
            continue;
          }
          if (head === 'brace' && DG_BRACE_SIDES.includes(words[k])) {
            add(ln, 'error', 'diagram-unexpected-token', `brace ${id}: which side the spine sits `
                + `on is written 'side ${words[k]}' – a bare '${words[k]}' is one of the four `
                + 'words that also place a label.');
            break;
          }
          if (words[k] === 'pad') { k++; continue; }
          add(ln, 'error', 'diagram-unexpected-token', dgUnexpectedMsg(head, id, words[k]));
          break;
        }
        continue;
      }

      // `image` carries its asset in the slot the others use for their first
      // placement token, so the rest of the line reads the same from one
      // token further along.
      const readTo = scanNodeOpts(head, words[1], words, head === 'image' ? 3 : 2, ln);
      for (let k = 2; k < readTo; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') {
          refer(words[k + 1], ln, `${head} ${words[1]}`);
        }
        // `at c1.cx,m0.cy` – the same coordinate grammar as a waypoint.
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) {
          referPair(words[k + 1], ln, `${head} ${words[1]} at`);
        }
        if (words[k] === 'between') {
          // Every trailing option that can follow a placement, or the scan
          // swallows one as a member. Written out, the list went stale twice –
          // `pad` when boxes and free text gained it, `point` when outlines
          // did – and each time this gate refused a line the build accepts.
          // DG_PLACE_STOP is derived from DG_KIND_OPTS for that reason.
          // Bounded by `readTo` for the same reason the loop is: past there
          // the statement stopped, and a token it never read is not a member.
          let m = k + 1;
          const names = [];
          while (m < readTo && !DG_PLACE_STOP.has(words[m])) names.push(words[m++]);
          const parts = names.join(',').split(',').map(x => x.trim()).filter(Boolean);
          if (parts.length !== 2) {
            add(ln, 'error', 'diagram-bad-between',
                `between expects exactly two elements, got ${parts.length}`);
          }
          for (const pn of parts) refer(pn, ln, `${head} ${words[1]}`);
          k = m - 1;
        }
        // `same as X` copies X's geometry, so X has to exist.
        if (words[k] === 'same' && words[k + 1] === 'as') {
          refer(words[k + 2], ln, `${head} ${words[1]} (same as)`);
          k += 2;
          continue;
        }
        // leader line: `text n "…" above c gap 1 -- leak`
        if (words[k] === '->' || words[k] === '--') {
          refer(words[k + 1], ln, `${head} ${words[1]} leader`);
          define(`${words[1]}--lead`, ln, 'edge');
        }
      }
      continue;
    }
    if (head === 'edge') {
      // The token immediately before the arrow is the from-endpoint; an
      // optional token before *that* is the element's name. `{#id}` is gone
      // from the language, so an edge names itself in front like every other
      // statement rather than after its options.
      const eArrowAt = words.findIndex(w => DG_EDGE_ARROWS.has(w));
      const eNamed = eArrowAt === 3 ? words[1] : null;
      const edgeId = eNamed || `edge-${++anonEdge}`;
      define(edgeId, ln, 'edge');
      if (attrs.tags.length) carries.push({ kind: 'edge', name: edgeId, tags: attrs.tags, ln });
      const arrowAt = eArrowAt;
      // Three answers where there used to be one. The author usually *did*
      // write the arrow and what is missing is a space on each side – `edge
      // p->q` tokenizes to two words, so the distinction is one test, and the
      // old sentence told them to add a token they had already typed. When
      // there is genuinely no arrow the shape of the statement is what to
      // say. And an `edge` with nothing before its arrow used to read the
      // keyword `edge` itself as the from-endpoint and then report that
      // 'edge' is not defined – the same misparse as `above of a`, and worse,
      // because nothing else in the output contradicted it.
      if (arrowAt < 0) {
        const glued = words.some(w => w !== 'edge' && [...DG_EDGE_ARROWS].some(a => w.includes(a)));
        const respaced = words.slice(1).map(w => [...DG_EDGE_ARROWS]
          .reduce((v, a) => v.split(a).join(` ${a} `), w)).join(' ').replace(/\s+/g, ' ').trim();
        add(ln, 'error', 'diagram-bad-edge', glued
          ? `edge: the arrow needs a space on each side – write it as 'edge ${respaced}'`
          : `an edge is 'edge <from> -> <to>' – the arrow may be ${[...DG_EDGE_ARROWS].join(', ')}`);
        continue;
      }
      if (arrowAt === 1 || !words[arrowAt - 1] || !words[arrowAt + 1] || words[arrowAt - 1] === 'edge') {
        add(ln, 'error', 'diagram-bad-edge',
            `edge needs an element on both sides of '${words[arrowAt]}'`);
        continue;
      }
      // Only the token immediately before the arrow is an endpoint, so anything
      // earlier is dropped by the build – it refuses the line, and a linter that
      // passed it would be the laxer of the two, which is how a line merges
      // green and fails every later build. `edge w1 a -> b` reads as naming the
      // edge and does not: an edge is named `{#w1}` in its tail.
      if (arrowAt > 3) {
        add(ln, 'error', 'diagram-bad-edge', `unexpected '${words.slice(1, arrowAt - 1).join(' ')}' `
            + `before the arrow in an edge – an edge is 'edge [name] <from> -> <to>', and its `
            + 'options come after the second end.');
      }
      refer(words[arrowAt - 1], ln, 'edge');
      refer(words[arrowAt + 1], ln, 'edge');
      let seenVia = false;
      let waypoints = 0;
      for (let k = arrowAt + 2; k < words.length; k++) {
        if (words[k] === 'via') {
          if (seenVia) add(ln, 'error', 'diagram-bad-edge', `edge: one 'via' carries every waypoint – 'via X,Y X,Y'`);
          seenVia = true;
          continue;
        }
        // `side <word>` – which side of the routed line the label sits on.
        // It was the four alignment classes, which on a box, dot or free text
        // place the label inside the element's own padding; one pair of words
        // meant two geometries chosen by kind.
        if (words[k] === 'side') {
          if (!DG_SIDES.includes(words[k + 1])) {
            add(ln, 'error', 'diagram-bad-edge', `edge ${edgeId}: side expects `
                + `${DG_SIDES.join(' / ')}, got '${words[k + 1] ?? ''}'`);
          }
          k++;
          continue;
        }
        // `pad` is the same sentence here it is on a box: how far the outline
        // sits from what it encloses, which on an edge is the label's ground.
        if (words[k] === 'pad') { k++; continue; }
        // A token before any `via` is not a waypoint, so it is either one
        // written without its keyword or a word this statement does not take.
        // Skipping it, which is what this loop used to do, let `edge a -> b
        // gap 0.3` through a gate the build refuses.
        if (!seenVia) {
          add(ln, 'error', 'diagram-bad-edge', words[k].includes(',')
            ? `a waypoint needs 'via' in front of it – 'via ${words[k]}'`
            : dgUnexpectedMsg('edge', edgeId, words[k]));
          break;
        }
        if (!words[k].includes(',')) continue;
        waypoints++;
        referPair(words[k], ln, 'a waypoint');
      }
      // Both halves are on this one line, so the build's refusal is decidable
      // here – and it is worth saying early, because the two constructs answer
      // the same question and one of them is silently doing nothing.
      // The class has to be written on the line for it to count: one arriving
      // from a `default edge` layer is the build's to resolve, the same
      // restraint the `.fit` check shows.
      if (attrs.classes.includes('elbow') && waypoints) {
        add(ln, 'error', 'diagram-bad-edge', `edge: .elbow draws its own two waypoints, so it `
            + `cannot also carry 'via'. Drop one – .elbow for the halfway rail, 'via' to say where.`);
      }
    }
  }
  if (inStep === false && block.lines.length === 0) {
    add(block.open, 'warn', 'empty-diagram', '::: diagram has no content');
  }
  const tagCount = new Map();
  for (const c of carries) for (const t of c.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  for (const mv of setMoves) {
    const n = tagCount.get(mv.tag.slice(1)) || 0;
    if (n > 1) {
      add(mv.ln, 'error', 'diagram-set-move',
          `move ${mv.tag} to … would place all ${n} elements carrying ${mv.tag} at the same point. `
          + `To translate a set, use 'move ${mv.tag} by dx,dy'.`);
    }
  }
  // The kind gate on a `style` step, now that every name and tag is known. A
  // tag expands to its members and **one bad member fails the statement**,
  // which is the compiler's rule: a set that cannot all take the same act is
  // the wrong set, and saying so is the point. A member whose kind this file
  // never learned is skipped rather than guessed at – silence is the safe
  // direction for a linter, a wrong refusal is not.
  const styleKinds = (t) => (t.startsWith('@')
    ? carries.filter(c => c.tags.includes(t.slice(1))).map(c => ({ name: c.name, kind: c.kind }))
    : [{ name: t, kind: kindOf.get(t) }]);
  for (const st of styled) {
    const seen = new Set();
    for (const t of st.targets) {
      for (const m of styleKinds(t)) {
        if (!m.kind || !DG_CLASS_KINDS_OK.has(m.kind) || seen.has(m.name)) continue;
        seen.add(m.name);
        const gate = [];
        rejectClassOn(m.kind, st.classes, st.ln, gate, `${m.kind} ${m.name}`, st.removed);
        for (const g of gate) add(st.ln, 'error', 'diagram-class-on-kind', g.msg);
      }
    }
  }
  for (const c of carries) {
    const table = tagDefaults.get(c.kind);
    if (!table) continue;
    const hits = c.tags.filter(t => table.has(t));
    if (hits.length > 1) {
      add(c.ln, 'error', 'ambiguous-diagram-default',
          `${c.kind} ${c.name} carries @${hits.join(' and @')}, and both have a 'default ${c.kind}' `
          + `(lines ${hits.map(t => table.get(t)).join(', ')}) – which one wins would depend on their order`);
    }
  }
  for (const r of referenced) {
    if (r.name.startsWith('@')) {
      if (!tags.has(r.name.slice(1))) {
        add(r.ln, 'error', 'unknown-diagram-tag',
            `${r.what} refers to ${r.name}, which no element in this diagram carries`);
      }
      continue;
    }
    if (!defined.has(r.name)) {
      // Reaching for a class where a tag was meant is the commonest slip.
      const hint = DG_CLASSES.has(r.name)
        ? ` – '.${r.name}' is a class; a set you can address is written '@${r.name}'` : '';
      add(r.ln, 'error', 'unknown-diagram-ref',
          `${r.what} refers to '${r.raw ?? r.name}', which is not defined in this diagram${hint}`);
    }
  }
  if (lectureTags) for (const t of tags) lectureTags.add(t);
}

function lintFile(filePath) {
  let diagram = null;   // { open, lines } while inside a ::: diagram block
  const src = fs.readFileSync(filePath, 'utf8');
  const ignores = parseIgnores(src);
  const { body, fmLines, header } = splitFrontmatter(src);
  const lines = body.split('\n');
  const findings = [];

  const add = (bodyLine, severity, rule, msg) => {
    if (ignores.has(rule)) return;
    findings.push({
      file: filePath, line: fmLines + bodyLine, severity, rule, msg,
    });
  };
  // Frontmatter findings carry their own line numbers, counted from the
  // opening `---`, so they must not go through `add`'s fmLines offset.
  const addFm = (fmLine, severity, rule, msg) => {
    if (ignores.has(rule)) return;
    findings.push({ file: filePath, line: fmLine, severity, rule, msg });
  };

  header.split('\n').forEach((raw, i) => {
    const m = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/);
    if (!m) return;
    const allowed = VIEW_DEFAULTS[m[1]];
    if (!allowed) return;
    // Strip a trailing YAML comment before comparing. Without this the
    // linter reported an error on `theme: light-red   # why` – a file the
    // build accepts, because gray-matter parses real YAML. A linter that
    // disagrees with the build is worse than no linter, since it is the
    // pre-commit gate. YAML needs whitespace before the `#` for it to start
    // a comment, so the pattern requires it too.
    const value = m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    if (!value || allowed.includes(value)) return;
    addFm(i + 2, 'error', 'unknown-view-default',
      `'${m[1]}: ${value}' is not a value this key accepts – valid: ${allowed.join(', ')}`);
  });

  // The lecture-wide diagram layer. Its `default <kind> @tag` lines cannot be
  // checked against one block – they are written once for every figure in the
  // lecture – so the tags they target are collected here and ruled on after
  // the whole file has been walked.
  const lectureTags = new Set();
  const fmTagDefaults = [];
  {
    const fmDefaulted = new Map();
    for (const { text, ln } of collectDiagramDefaults(header)) {
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      for (const m of trimmed.matchAll(/\{([^}]*)\}/g)) {
        for (const tok of m[1].trim().split(/\s+/).filter(Boolean)) {
          if (tok.startsWith('.') && !DG_CLASSES.has(tok.slice(1))) {
            addFm(ln, 'error', 'unknown-diagram-class',
                  `unknown diagram class '${tok}' – valid: ${[...DG_CLASSES].map(c => '.' + c).join(', ')}`);
          } else if (!tok.startsWith('.')) {
            addFm(ln, 'error', 'bad-diagram-attribute',
                  `'${tok}' in a diagram-defaults {…} tail is not a .class`);
          }
        }
      }
      const words = trimmed.replace(/"[^"]*"/g, ' ').trim().split(/\s+/).filter(Boolean);
      if (words[0] !== 'default') {
        addFm(ln, 'error', 'bad-diagram-defaults',
              `diagram-defaults holds 'default …' statements only, got '${trimmed}'`);
        continue;
      }
      lintDefaultStatement(words, ln, addFm, {
        defaulted: fmDefaulted, scope: 'lecture', reportLine: ln,
        onTag: (kind, tag) => fmTagDefaults.push({ kind, tag: tag.slice(1), ln }),
      });
    }
  }

  const ids = new Map();
  const columns = [];
  let col = null;
  let chunk = null;
  let chunkBody = [];
  // Explicit-slide mode splits a chunk body into three buckets so the
  // density budget can be applied to whatever actually lands on screen.
  let slideBody = [];
  let scriptBody = [];
  let chunkHasReveal = false;
  let inFence = false;
  let activeDirective = null;
  let layoutStack = [];
  // `> note:` (speaker notes) and `> annot:` (exported live annotations)
  // are peeled off by build.js into chunk.speakerNotes / chunk.annotation
  // before the body is rendered. We mirror that here so density budgets
  // reflect the on-slide prose, not the meta-text.
  let inMetaBlock = false;

  const flushChunk = () => {
    if (!chunk) return;
    const budget = DENSITY_BUDGET[chunk.tag ?? 'free'];
    if (budget !== null) {
      // What counts against the budget is the on-screen half: the ::: slide
      // block if the chunk has one, otherwise everything the author did not
      // park in ::: script. Narration is unbudgeted by design – writing it
      // freely is the whole point of the explicit mode.
      const onScreen = slideBody.length ? slideBody : chunkBody;
      const wc = wordCountOf(onScreen);
      const scope = slideBody.length ? ' in ::: slide'
        : scriptBody.length ? ' outside ::: script' : '';
      if (wc > budget) {
        add(chunk.line, 'warn', 'density',
            `chunk body is ${wc} words${scope} (budget for ${chunk.tag ?? 'free'}: ${budget})`);
      }
    }
    // Figure chunks where the image sits directly below the heading:
    // the image alt text renders as a <figcaption>, stacking a second
    // title on top of the artwork (often itself titled internally).
    // Discourage – authors should use `![](id)` to drop the caption,
    // or move prose between heading and image if the caption is load-
    // bearing.
    if (chunk.tag === 'figure') {
      let firstContent = null;
      for (const l of chunkBody) {
        const t = l.trim();
        if (!t) continue;
        if (t.startsWith(':::')) continue;
        if (t.startsWith('>')) continue;
        firstContent = t;
        break;
      }
      if (firstContent) {
        const m = firstContent.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (m && m[1].trim()) {
          const hasSubHeading = chunk.heading && chunk.heading.includes('|');
          const extra = hasSubHeading
            ? ` (heading already has a sub-heading via '|', so the caption is the third stacked label)`
            : ``;
          add(chunk.line, 'warn', 'figure-caption-redundant',
              `figure opens with an image whose alt text '${m[1]}' becomes a caption under the heading${extra} – use \`![](${m[2]})\` to drop the caption, or move prose above the image if the caption is load-bearing`);
        }
      }
    }
    // An unclosed ::: diagram swallows the rest of the file, headings and
    // all, so this only ever fires from the final flush – which is exactly
    // when the author needs to be told what ate their lecture.
    if (diagram) {
      add(diagram.open, 'error', 'unclosed-directive',
          `::: diagram not closed – everything after line ${diagram.open} was read as diagram source`);
      diagram = null;
    }
    if (activeDirective) {
      add(activeDirective.line, 'error', 'unclosed-directive',
          `::: ${activeDirective.kind} not closed before next chunk or column`);
      activeDirective = null;
    }
    while (layoutStack.length) {
      const l = layoutStack.pop();
      add(l.line, 'error', 'unclosed-directive',
          `::: ${l.kind} not closed before next chunk or column`);
    }
    chunk.hasReveal = chunkHasReveal;
    col.chunks.push(chunk);
    chunk = null;
    chunkBody = [];
    slideBody = [];
    scriptBody = [];
    chunkHasReveal = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // A ::: diagram body is captured verbatim, ahead of everything else.
    // Not an optimisation: a diagram comment starts with '#', and read as
    // markdown that is a column heading. The build takes the body verbatim
    // too, so the linter has to as well or the two disagree about where
    // the chunks are.
    if (diagram) {
      if (/^:::\s*$/.test(line)) {
        lintDiagram(diagram, add, fmLines, lectureTags);
        diagram = null;
      } else {
        diagram.lines.push({ text: line, ln });
      }
      continue;
    }
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (chunk) chunkBody.push(line);
      continue;
    }
    if (inFence) { if (chunk) chunkBody.push(line); continue; }

    // Only now, with the fence settled: a ::: diagram inside a code fence is
    // a syntax example, not a diagram. build.js guards the same way, and a
    // linter that disagrees with the build is worse than none – this one
    // failed any lecture that documented the directive.
    const diagramOpen = line.match(/^:::\s+diagram\s*(?:\{([^}]*)\})?\s*$/);
    if (diagramOpen) {
      if (!chunk) {
        add(ln, 'error', 'stray-directive', '::: diagram outside any chunk');
      }
      for (const tok of (diagramOpen[1] || '').trim().split(/\s+/).filter(Boolean)) {
        if (!tok.startsWith('#') && !/^unit=\d+x\d+$/.test(tok)) {
          add(ln, 'error', 'unknown-diagram-option',
              `unknown ::: diagram option '${tok}' – expected #id or unit=WxH`);
        }
      }
      diagram = { open: ln, lines: [] };
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);

    if (h1) {
      flushChunk();
      const attr = parseAttributeTail(h1[1]);
      if (attr.ids.length > 1) {
        add(ln, 'error', 'multiple-ids',
            `column heading has ${attr.ids.length} {#id} tokens; only the first is used`);
      }
      const id = attr.ids[0];
      if (id) {
        if (ids.has(id)) {
          add(ln, 'error', 'duplicate-id',
              `id '${id}' already defined at line ${ids.get(id)}`);
        } else {
          ids.set(id, fmLines + ln);
        }
      }
      col = { line: ln, heading: attr.text, id, chunks: [] };
      columns.push(col);
      continue;
    }

    if (h2) {
      flushChunk();
      if (!col) {
        col = { line: ln, heading: null, id: null, chunks: [] };
        columns.push(col);
      }
      const attr = parseAttributeTail(h2[1]);
      const id = attr.ids[0];
      if (attr.ids.length > 1) {
        add(ln, 'error', 'multiple-ids',
            `chunk heading has ${attr.ids.length} {#id} tokens; only the first is used`);
      }
      const tagMatch = attr.text.match(/^([a-z]+):\s*(.*)$/);
      let tag = null, heading = attr.text;
      if (tagMatch) {
        if (VALID_TAGS.has(tagMatch[1])) {
          tag = tagMatch[1];
          heading = tagMatch[2].trim();
        } else {
          add(ln, 'error', 'unknown-tag',
              `unknown tag '${tagMatch[1]}:' – valid: ${[...VALID_TAGS].join(', ')}`);
        }
      }
      for (const cls of attr.classes) {
        if (!VALID_WIDTHS.has(cls)) {
          add(ln, 'error', 'unknown-width',
              `unknown width '.${cls}' – valid: ${[...VALID_WIDTHS].map(w => '.' + w).join(', ')}`);
        }
      }
      if (!id) {
        add(ln, 'error', 'missing-id',
            `'## ${tag ? tag + ': ' : ''}${heading || ''}' has no {#id}`);
      } else if (ids.has(id)) {
        add(ln, 'error', 'duplicate-id',
            `id '${id}' already defined at line ${ids.get(id)}`);
      } else {
        ids.set(id, fmLines + ln);
      }
      chunk = { line: ln, tag, heading, id, classes: attr.classes };
      continue;
    }

    // Sidebar directives (::: expand / margin) extract into a separate
    // node; they don't nest with each other and `chunk` is required.
    const expandOpen = line.match(/^:::\s+expand\s+(.+?)\s*$/);
    const marginOpen = /^:::\s+margin\s*$/.test(line);
    if (expandOpen || marginOpen) {
      if (activeDirective) {
        add(ln, 'error', 'nested-directive',
            `::: ${expandOpen ? 'expand' : 'margin'} inside still-open ::: ${activeDirective.kind} (line ${activeDirective.line})`);
      }
      if (!chunk) {
        add(ln, 'error', 'stray-directive',
            `::: directive outside any chunk`);
      }
      activeDirective = { kind: expandOpen ? 'expand' : 'margin', line: ln };
      continue;
    }

    // Layout directives (::: cols N / side / flip / marginalia / slide /
    // script) stay inline in the body as HTML wrappers. They have their
    // own small stack so bare `:::` closes the innermost layout first,
    // and the outer sidebar directive only after.
    const colsOpen = line.match(/^:::\s+cols\s+(2|3)\s*$/);
    const sideOpen = /^:::\s+side\s*$/.test(line);
    const flipMark = /^:::\s+flip\s*$/.test(line);
    const marginaliaOpen = /^:::\s+marginalia\s*$/.test(line);
    const slideOpen = /^:::\s+slide\s*$/.test(line);
    const scriptOpen = /^:::\s+script\s*$/.test(line);
    // ::: embed <url> – a hosted player. Mirrors build.js; the value is
    // checked there (it must be an https URL), so the linter only needs to
    // know the directive exists and takes an argument.
    const embedOpen = line.match(/^:::\s+embed\s+(\S+)\s*$/);
    if (embedOpen) {
      // Mirrors parseEmbedUrl in build.js, including its leniency: a bare
      // youtu.be/ID or vimeo.com/ID is recognised without a scheme, because
      // that is what people paste. Anything else has to be a real https URL.
      // Kept deliberately in step - a linter that rejects what the build
      // accepts is worse than no linter, since it is the pre-commit gate.
      const v = embedOpen[1];
      const known = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{6,}/.test(v)
        || /vimeo\.com\/(?:video\/)?\d+/.test(v);
      if (!known && !/^https:\/\//i.test(v)) {
        add(ln, 'error', 'bad-embed-url',
            `::: embed needs a YouTube or Vimeo link, or an https URL - got '${v}'`);
      }
    }
    if (colsOpen || sideOpen || marginaliaOpen || slideOpen || scriptOpen || embedOpen) {
      if (!chunk) {
        add(ln, 'error', 'stray-directive',
            `::: layout directive outside any chunk`);
      }
      const kind = colsOpen ? `cols ${colsOpen[1]}`
        : sideOpen ? 'side'
        : marginaliaOpen ? 'marginalia'
        : embedOpen ? 'embed'
        : slideOpen ? 'slide' : 'script';
      if (slideOpen || scriptOpen) {
        // One explicit block of each kind per chunk. A second one would
        // render fine but splits the on-screen content into pieces the
        // author can no longer reason about as "the slide".
        const seen = slideOpen ? 'slide' : 'script';
        if (chunk && chunk[seen + 'Seen']) {
          add(ln, 'warn', 'duplicate-explicit-block',
              `second ::: ${seen} in one chunk (first at line ${chunk[seen + 'Seen']}) – merge them`);
        } else if (chunk) {
          chunk[seen + 'Seen'] = ln;
        }
      }
      layoutStack.push({ kind, line: ln });
      continue;
    }
    if (flipMark) {
      const top = layoutStack[layoutStack.length - 1];
      if (!top || top.kind !== 'side') {
        add(ln, 'error', 'stray-directive',
            `::: flip without an enclosing ::: side`);
      }
      continue;
    }
    if (/^:::\s*$/.test(line)) {
      if (layoutStack.length) {
        layoutStack.pop();
        continue;
      }
      if (!activeDirective) {
        add(ln, 'error', 'stray-directive-close',
            `::: without a matching open directive`);
      }
      activeDirective = null;
      continue;
    }

    if (chunk && !activeDirective && line.trim() === '---') {
      chunkHasReveal = true;
      inMetaBlock = false;
      continue;
    }

    if (chunk) {
      if (/^>\s*(note|annot):/i.test(line)) { inMetaBlock = true; continue; }
      if (inMetaBlock) {
        if (/^>/.test(line)) continue;
        inMetaBlock = false;
      }
      // Density is a budget on what the *projector* shows, so explicit
      // blocks are counted separately: ::: slide content is the slide,
      // ::: script content is narration that never reaches the screen.
      const inKind = (k) => layoutStack.some(l => l.kind === k);
      if (inKind('slide')) slideBody.push(line);
      else if (inKind('script')) scriptBody.push(line);
      else chunkBody.push(line);
    }
  }
  flushChunk();

  const allChunks = columns.flatMap(c => c.chunks);
  const titleChunks = allChunks.filter(c => c.tag === 'title');
  if (titleChunks.length === 0) {
    add(1, 'warn', 'title-count', `no 'title:' chunk found`);
  } else if (titleChunks.length > 1) {
    add(titleChunks[1].line, 'warn', 'title-count',
        `multiple 'title:' chunks (${titleChunks.length}); only the first renders`);
  }

  for (const c of columns) {
    if (c.heading === null) continue;
    if (c.chunks.length < ORPHAN_MIN) {
      add(c.line, 'warn', 'orphan-column',
          `column '${c.heading}' has ${c.chunks.length} chunk${c.chunks.length === 1 ? '' : 's'} (min ${ORPHAN_MIN})`);
    }
  }

  const nonTitle = allChunks.filter(c => c.tag !== 'title');
  const reveals = nonTitle.filter(c => c.hasReveal).length;
  if (nonTitle.length > 0) {
    const pct = reveals / nonTitle.length;
    if (pct > REVEAL_PCT_WARN) {
      add(1, 'warn', 'reveal-overuse',
          `${reveals}/${nonTitle.length} chunks use reveal segments (${Math.round(pct * 100)}% > ${REVEAL_PCT_WARN * 100}%) – split the column, or add '<!-- linter: ignore reveal-overuse -->'`);
    }
  }

  // Oversized assets. Anything past the inline cap stays an external path,
  // so the output stops being self-contained – the deck still looks fine on
  // the machine that built it and breaks wherever the HTML travels alone.
  const sourceDir = path.dirname(filePath);
  const seenAssets = new Set();
  // `image <name> <asset>` inside a ::: diagram references an asset the same
  // way; the build hard-fails on an oversized one, so this gate has to reach
  // them or it lets through exactly what the build will refuse.
  const diagramRefs = new Set(diagramImageRefs(body));
  lines.forEach((line, i) => {
    const hrefs = [...line.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map(m => m[1]);
    const dm = line.trim().match(/^image\s+\S+\s+(\S+)/);
    if (dm && diagramRefs.has(dm[1])) hrefs.push(dm[1]);
    for (const href of hrefs) {
      if (/^[a-z]+:/i.test(href)) continue;
      let abs = null;
      if (!href.includes('/') && !path.extname(href)) {
        for (const ext of [...IMG_EXTS, ...VIDEO_EXTS]) {
          const cand = path.join(sourceDir, 'assets', `${href}.${ext}`);
          if (fs.existsSync(cand)) { abs = cand; break; }
        }
      } else {
        const cand = path.resolve(sourceDir, href);
        if (fs.existsSync(cand)) abs = cand;
      }
      if (!abs || seenAssets.has(abs)) continue;
      seenAssets.add(abs);
      let size;
      try { size = fs.statSync(abs).size; } catch (e) { continue; }
      const cap = inlineCapFor(abs);
      if (size <= cap) continue;
      const mb = (size / 1024 / 1024).toFixed(2);
      if (cap === MAX_INLINE_VIDEO_BYTES) {
        // Video has a defined fallback: the build stages it into videos/
        // beside the output. Worth saying, because it is the difference
        // between a broken figure and one companion folder to carry.
        add(i + 1, 'warn', 'oversized-asset',
            `${path.relative(sourceDir, abs)} is ${mb} MB (> ${cap / 1024 / 1024} MB inline cap), so the build plays it from videos/ beside the output – keep that folder with the HTML, or re-encode the clip smaller`);
      } else {
        add(i + 1, 'warn', 'oversized-asset',
            `${path.relative(sourceDir, abs)} is ${mb} MB (> ${cap / 1024 / 1024} MB inline cap), so it stays an external path and the output is not self-contained – run \`node build.js <source.md> --optimize-images\``);
      }
    }
  });

  // Unclosed display math. A `$$` that never closes swallows the rest of the
  // chunk into one formula, and because KaTeX renders errors in red rather
  // than failing, the build stays green and the damage only shows up on the
  // projector. Cheap to catch here. Fence-aware, so `$$` inside a code block
  // is not counted; inline `$…$` is deliberately not checked, because a lone
  // dollar in prose is legitimate and the build leaves it alone.
  {
    let fence = false;
    let openLine = 0;
    let open = false;
    lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
      if (fence) return;
      const count = (line.match(/\$\$/g) || []).length;
      for (let k = 0; k < count; k++) {
        if (!open) { open = true; openLine = i + 1; }
        else open = false;
      }
    });
    if (open) {
      add(openLine, 'warn', 'unclosed-math',
          'display math opened with `$$` is never closed – everything after it renders as one formula');
    }
  }

  // The lecture-level counterpart of "no element carries @tag". A block-level
  // tag default has to be used in its block; a lecture-level one has to be
  // used somewhere in the lecture, and the whole file has now been walked.
  for (const d of fmTagDefaults) {
    if (lectureTags.has(d.tag)) continue;
    addFm(d.ln, 'error', 'unknown-diagram-tag',
      `diagram-defaults: 'default ${d.kind} @${d.tag}' – no diagram in this lecture carries @${d.tag}`
      + (lectureTags.size ? ` (tags in use: ${[...lectureTags].sort().map(t => '@' + t).join(', ')})` : ''));
  }

  return findings;
}

function collectFiles(inputs) {
  const out = new Set();
  for (const p of inputs) {
    const s = fs.statSync(p);
    if (s.isFile()) { out.add(p); continue; }
    if (s.isDirectory()) {
      const stack = [p];
      while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const full = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.isFile() && entry.name === 'source.md') out.add(full);
        }
      }
    }
  }
  return [...out].sort();
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const inputs = args.filter(a => !a.startsWith('--'));
  if (inputs.length === 0) {
    console.error('usage: node lint.js <source.md | dir> [--strict]');
    process.exit(2);
  }
  const files = collectFiles(inputs);
  if (files.length === 0) {
    console.error('no source.md files found');
    process.exit(2);
  }

  let errors = 0, warnings = 0;
  for (const f of files) {
    for (const x of lintFile(f)) {
      const sev = x.severity === 'error' ? 'error' : 'warn ';
      console.log(`${x.file}:${x.line}  ${sev}  ${x.rule.padEnd(22)}  ${x.msg}`);
      if (x.severity === 'error') errors++;
      else warnings++;
    }
  }

  const summary = `${files.length} file(s), ${errors} error(s), ${warnings} warning(s)`;
  console.log(errors || warnings ? `\n${summary}` : `ok – ${summary}`);
  if (errors) process.exit(1);
  if (strict && warnings) process.exit(2);
}

main();
