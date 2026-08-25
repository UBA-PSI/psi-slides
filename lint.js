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
// was meant to end. `rejectShapeOn` and `rejectAlignOn` ride the same bend
// for the same reason: they ARE the rule for which class may sit on which
// kind, and a second spelling of it here is how this gate came to pass
// lines the build refuses – lectures/network-security is linted by CI but
// never built, so such a line merged green and failed every later build.
// All of them are one-liners over the tables, with nothing behind them.
import {
  DG_KEYWORDS, DG_STEP_OPS, DG_CLASSES, DG_CLASS_GROUPS, DG_CLASS_CLASHES,
  DG_KIND_OPTS, DG_BRACE_SIDES, DG_ALIGN_X, DG_ALIGN_Y, DG_SCALAR_X,
  DG_SCALAR_Y, DG_DEFAULT_KINDS, DG_ANCHORS, DG_DEFINES, DG_GRID_KINDS, DG_GRID_MAX,
  DG_PLOT_MAX_TICKS, DG_POINT_DIRS, DG_POINTED, DG_SHAPE_CLASSES, DG_RESERVED_IDS,
  dgBarName, dgTickName, dgBaseName, dgCellName, dgPlotName, dgPlotTicks,
  dgRowTag, dgColTag, dgLaneName, dgLaneCapName,
  rejectShapeOn, rejectAlignOn,
} from './diagram-core.mjs';

const REVEAL_PCT_WARN = 0.5;
const ORPHAN_MIN = 2;

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
    if (kind === 'brace' && DG_BRACE_SIDES.includes(w)) continue;
    if (opts.includes(w)) { k++; continue; }
    // Only kinds a `default` can name - see the same line in diagram-core.
    const owner = [...DG_DEFAULT_KINDS].find(kk => (DG_KIND_OPTS[kk] || []).includes(w));
    if (owner) {
      add(ln, 'error', 'bad-diagram-default',
          `default ${kind} has no '${w}' – that is a ${owner} option. `
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
function lintDiagram(block, add, fmLines, lectureTags) {
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
    const out = { id: null, classes: [], tags: [] };
    if (!m) return out;
    for (const tok of m[1].trim().split(/\s+/).filter(Boolean)) {
      if (tok.startsWith('#')) out.id = tok.slice(1);
      else if (tok.startsWith('@')) {
        if (tok.length > 1) { if (carries) tags.add(tok.slice(1)); out.tags.push(tok.slice(1)); }
        else add(ln, 'error', 'bad-diagram-attribute', 'an empty @tag means nothing');
      }
      else if (tok.startsWith('.')) {
        if (!DG_CLASSES.has(tok.slice(1))) {
          add(ln, 'error', 'unknown-diagram-class',
              `unknown diagram class '${tok}' – valid: ${[...DG_CLASSES].map(c => '.' + c).join(', ')}`);
        } else out.classes.push(tok.slice(1));
      } else {
        add(ln, 'error', 'bad-diagram-attribute',
            `'${tok}' in {…} is not #id, .class or @tag`);
      }
    }
    for (const group of DG_CLASS_GROUPS) {
      const hit = group.filter(c => out.classes.includes(c));
      if (hit.length > 1) {
        add(ln, 'warn', 'conflicting-diagram-classes',
            `.${hit.join(' and .')} are the same kind of thing – which one wins is decided by stylesheet order, not by this line`);
      }
    }
    for (const [a, b] of DG_CLASS_CLASHES) {
      if (out.classes.includes(a) && out.classes.includes(b)) {
        add(ln, 'warn', 'conflicting-diagram-classes',
            `.${a} fills with the accent and inverts its own label, so .${b} ink on it is invisible – `
            + `the inversion wins, and one of the two is doing nothing`);
      }
    }
    return out;
  };
  const define = (name, ln) => {
    if (!name) return;
    // A name with a dot would be indistinguishable from `elem.cx` in a
    // coordinate; one with @ or # from a tag or an id token. Mirrors claim()
    // in build.js.
    if (!/^[A-Za-z_][\w-]*$/.test(name)) {
      add(ln, 'error', 'bad-diagram-name',
          `'${name}' is not a usable name – letters, digits, _ and - only, starting with a letter`);
      return;
    }
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
            `${what}: '.${m[2]}' is not a ${axis} coordinate – use ${[...ok].map(p => '.' + p).join(' / ')}`);
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
  // Lines a `table` has already read as its own rows. It is the one statement
  // besides `step` that takes continuation lines, and they are bare quoted
  // strings – read as statements they would each report a keyword that is a
  // quotation mark. The build skips them the same way, off the same count.
  let rowsRead = 0;
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
        rejectShapeOn(head === 'grid' ? (words[2] || 'box') : 'box', attrs.classes, ln, gate);
      } else if (head === 'edge') {
        rejectAlignOn('edge', attrs.classes, ln, gate);
      } else if (head === 'container' || head === 'brace') {
        rejectShapeOn(head, attrs.classes, ln, gate);
        rejectAlignOn(head, attrs.classes, ln, gate);
      } else if (head === 'dot' || head === 'text' || head === 'image') {
        rejectShapeOn(head, attrs.classes, ln, gate);
      } else if (head === 'default' && words[1]) {
        rejectShapeOn(words[1], attrs.classes, ln, gate);
        rejectAlignOn(words[1], attrs.classes, ln, gate);
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
            ? `align x/y: '${words[2]}' is a ${axis === 'x' ? 'y' : 'x'} edge. On the ${axis} axis use ${[...ok].join('/')}.`
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
    if (head === 'step') { inStep = true; continue; }
    if (inStep && DG_STEP_OPS.has(head)) {
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
      add(ln, 'error', 'unknown-diagram-statement', trimmed.startsWith('//')
        ? 'a comment line starts with # in a diagram, not //'
        : stray
          ? `unknown diagram statement '${stray}' – a bare quoted string is a table row, and a `
            + `table's rows are the lines directly under it with nothing else on them, `
            + 'up to the first blank line'
          : `unknown diagram statement '${head}' – valid: ${known}`);
      continue;
    }
    inStep = false;

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
      define(id, ln);
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
      const st = num('step', (xd[1] - xd[0]) / 5);
      const xt = dgPlotTicks(xd[0], xd[1], st);
      const yt = dgPlotTicks(yd[0], yd[1], st);
      if (!xt.length || !yt.length) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id || ''}: step ${st} does not divide the `
            + `ranges ${xd.join(',')} and ${yd.join(',')} into ticks`);
      } else if (xt.length > DG_PLOT_MAX_TICKS || yt.length > DG_PLOT_MAX_TICKS) {
        add(ln, 'error', 'bad-diagram-plot', `plot ${id}: ${Math.max(xt.length, yt.length)} ticks `
            + `on one axis – at most ${DG_PLOT_MAX_TICKS}, past which the grid is a grey field`);
      } else {
        xt.forEach((_, i) => { define(dgPlotName(id, 'gx', i), ln); define(dgPlotName(id, 'xt', i), ln); });
        yt.forEach((_, i) => { define(dgPlotName(id, 'gy', i), ln); define(dgPlotName(id, 'yt', i), ln); });
      }
      const strings = [...trimmed.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      if (strings[0]) define(dgPlotName(id, 'xl'), ln);
      if (strings[1]) define(dgPlotName(id, 'yl'), ln);
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') refer(words[k + 1], ln, `plot ${id}`);
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) referPair(words[k + 1], ln, `plot ${id} at`);
      }
      continue;
    }

    if (head === 'bars' || head === 'grid') {
      const id = words[1];
      define(id, ln);
      if (attrs.tags && attrs.tags.length) carries.push({ kind: head, name: id, tags: attrs.tags, ln });
      const strings = [...trimmed.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      if (head === 'bars') {
        const cols = (strings[0] || '').split(',').map(s => s.trim()).filter(Boolean).length;
        if (!cols) {
          add(ln, 'error', 'bad-diagram-bars',
              `bars ${id || ''} needs its values as one string, e.g. "18,17,15,11"`);
        }
        for (let i = 0; i < cols; i++) define(dgBarName(id, i), ln);
        // `series of <chart>` is a run of columns inside somebody else's
        // frame, so it declares columns and nothing else – no ticks, no
        // baseline. Registering a `<id>-base` for one would let `hide g-base`
        // through a gate the build then refuses.
        const isSeries = words.some((w, i) => w === 'series' && words[i + 1] === 'of');
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
            for (let i = 0; i < Math.min(ticks.length, cols); i++) define(dgTickName(id, i), ln);
          }
        }
        if (!isSeries) define(dgBaseName(id), ln);
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
            for (let c = 0; c < +dims[1]; c++) define(dgCellName(id, c, r), ln);
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
      define(id, ln);
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
          define(dgLaneName(id, i), ln);
          carry(dgLaneName(id, i), 'box');
          // A band with no name gets no caption, so nothing declares that name.
          if (!name) return;
          define(dgLaneCapName(id, i), ln);
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
            define(dgCellName(id, c, r), ln);
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
      define(words[1], ln);
      if (attrs.tags && attrs.tags.length) carries.push({ kind: head, name: words[1], tags: attrs.tags, ln });
      const overAt = words.indexOf('over');
      if (overAt >= 0) {
        for (const m of words.slice(overAt + 1).join(',').split(',').map(s => s.trim()).filter(Boolean)) {
          if (m === 'pad' || DG_BRACE_SIDES.includes(m)) break;
          refer(m, ln, `${head} ${words[1]}`);
        }
      } else if (head === 'brace' || head === 'container' || head === 'group') {
        add(ln, 'error', 'diagram-missing-members', `${head} ${words[1] || ''} needs "over a,b,c"`);
      }
      for (let k = 2; k < words.length; k++) {
        if (words[k] === 'of' || words[k] === 'below' || words[k] === 'above') {
          refer(words[k + 1], ln, `${head} ${words[1]}`);
        }
        // `at c1.cx,m0.cy` – the same coordinate grammar as a waypoint.
        if (words[k] === 'at' && words[k + 1] && words[k + 1].includes(',')) {
          referPair(words[k + 1], ln, `${head} ${words[1]} at`);
        }
        if (words[k] === 'between') {
          // Every trailing option that can follow a placement, or the scan
          // swallows one as a member. `pad` joined the list when boxes and
          // free text gained it, and the linter went stricter than the build.
          const STOP = new Set(['frac', 'offset', 'gap', 'align', 'w', 'h', 'r', 'pad', 'same', '->']);
          let m = k + 1;
          const names = [];
          while (m < words.length && !STOP.has(words[m])) names.push(words[m++]);
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
        // leader line: `text n "…" above c gap 1 -> leak`
        if (words[k] === '->') {
          refer(words[k + 1], ln, `${head} ${words[1]} leader`);
          define(`${words[1]}--lead`, ln);
        }
      }
      continue;
    }
    if (head === 'edge') {
      define(attrs.id || `edge-${++anonEdge}`, ln);
      if (attrs.tags.length) carries.push({ kind: 'edge', name: attrs.id || `edge-${anonEdge}`, tags: attrs.tags, ln });
      const arrowAt = words.findIndex(w => w === '->' || w === '<-' || w === '--');
      if (arrowAt < 1 || !words[arrowAt + 1]) {
        add(ln, 'error', 'diagram-bad-edge', 'edge needs an element on both sides of "->"');
        continue;
      }
      // Only the token immediately before the arrow is an endpoint, so anything
      // earlier is dropped by the build – it refuses the line, and a linter that
      // passed it would be the laxer of the two, which is how a line merges
      // green and fails every later build. `edge w1 a -> b` reads as naming the
      // edge and does not: an edge is named `{#w1}` in its tail.
      if (arrowAt > 2) {
        add(ln, 'error', 'diagram-bad-edge', `unexpected '${words.slice(1, arrowAt - 1).join(' ')}' `
            + `before the arrow in an edge – an edge is 'edge <from> -> <to>', and its options `
            + `come after the second end. To name it, write {#name} in the tail.`);
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
        if (!words[k].includes(',')) continue;
        if (!seenVia) {
          add(ln, 'error', 'diagram-bad-edge', `a waypoint needs 'via' in front of it – 'via ${words[k]}'`);
          continue;
        }
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
