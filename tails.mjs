/*
 * tails.mjs – the `{…}` tail grammar and the `::: draw` opener, once.
 *
 * Every attribute tail in the source format is read here: the one on a
 * heading (`## type: Heading {.wide .bare #id}`) and the one on the five
 * slot directives (`::: cards 3 {.outline .middle}`, `::: rows`, `::: side`,
 * `::: overlay`, `::: backdrop`). One sigil rule for all of them: `.word` is
 * a setting, `#word` an id, and a token that is neither is refused rather
 * than dropped. The `::: draw` opener is the one block line that carries
 * values rather than sigils, and it therefore has no braces at all:
 *
 *   ::: draw [WxH] [autoplay N [cycle]]
 *
 * build.js and lint.js both import this file. That is the second documented
 * exception to lint.js's no-imports rule (the diagram vocabulary is the
 * first), and it is allowed for the same reason: zero dependencies, zero
 * Node APIs, tables plus small pure helpers, and nothing pulled in behind it.
 * Before it existed the grammar was implemented four times - two parsers per
 * file - and every slot table was declared twice with a "mirrors build.js"
 * comment on the lint side.
 *
 * This file must not import diagram-core.mjs, and diagram-core.mjs must not
 * import it: the compiler runs in the browser and knows nothing about
 * playback, and the two words the host owns (`autoplay`, `cycle`) live here
 * alone.
 */

// ── slot tables ───────────────────────────────────────────────────────
// A slot has a *default* and a list of *writable words*, and the two are
// separate fields: on a directive the default may be written (`::: side
// {.top}` is legal and changes nothing), while on a chunk heading a flag's
// default has no spelling - there is no `.shown` to undo `.bare`. The parser
// accepts only `words`; `default` is what the slot resolves to when nothing
// is written.

// The other family in a chunk tail: a class that answers a `style:` key for
// one chunk. Each is spelled `<key>-<value>` so an author who knows
// `style: {wrap: none}` can guess `.wrap-none`, and one who meets
// `.blocks-left` in a source can guess the key. Only two keys, deliberately:
// the two whose right answer changes from slide to slide. Both directions of
// both, because under a deck-wide `wrap: none` the only way left to ask for
// balancing is to ask for it on the chunk.
export const CHUNK_STYLE_CLASSES = {
  'wrap-balance':  ['wrap', 'balance'],
  'wrap-none':     ['wrap', 'none'],
  'blocks-center': ['blocks', 'center'],
  'blocks-left':   ['blocks', 'left'],
};

export const CHUNK_SLOTS = {
  // The default is the caller's, not the table's: a chunk's width is
  // `standard` for every type but `outline`, which is `wide`, and the
  // title/closing chunks refuse a width altogether. A table default of
  // `standard` would have reported an outline chunk as resolving to a width
  // it does not have.
  width:  { default: null, words: ['narrow', 'standard', 'wide', 'full'] },
  wrap:   { default: null, words: ['wrap-balance', 'wrap-none'] },
  blocks: { default: null, words: ['blocks-left', 'blocks-center'] },
  // `.bare` takes the heading off the slide and leaves it in the TOC, in
  // search and in the printed document; `.center` sets the prose on a centre
  // axis. Flags: a default with no spelling.
  bare:   { default: false, words: ['bare'] },
  center: { default: false, words: ['center'] },
};
export const VALID_WIDTHS = new Set(CHUNK_SLOTS.width.words);
export const VALID_CHUNK_CLASSES = new Set([
  ...CHUNK_SLOTS.bare.words, ...CHUNK_SLOTS.center.words, ...Object.keys(CHUNK_STYLE_CLASSES)]);

export const BACKDROP_SLOTS = {
  fill:  { default: 'cover',  words: ['cover', 'contain'] },
  crop:  { default: 'middle', words: ['middle', 'top', 'bottom'] },
  scrim: { default: 'veil',   words: ['veil', 'clear', 'invert'] },
  focus: { default: 'sharp',  words: ['sharp', 'blur'] },
  // Which side of the type the picture is on. `under` is what a backdrop
  // has always been. `over` exists for exactly one move: a picture that
  // opens as a band beside the title and then covers it - the title is
  // revealed *away* rather than added to, which is the one thing the reveal
  // counter cannot do by adding segments. It stays below .overlay-layer, so
  // an ::: overlay is how words go back on top of the covering picture.
  layer: { default: 'under',  words: ['under', 'over'] },
};

// A card row answers eight questions, and one of them it can answer itself.
export const CARDS_SLOTS = {
  // How big the type is. `auto` reads the longest item: a row of single
  // words wants to be read across the room, a row of sentences wants to
  // fit. It is the block's decision and not each card's, because cards at
  // three different sizes in one row read as a mistake rather than as a
  // hierarchy.
  size:   { default: 'auto',  words: ['auto', 'large', 'medium', 'small'] },
  // `auto` follows the size, because that is how one would set it by hand:
  // a word centres, a sentence ranges left. The word is shared with `size`,
  // which the collision assertion below permits because it is the default of
  // both - writing it changes nothing whichever slot takes it.
  align:  { default: 'auto',  words: ['auto', 'left', 'center'] },
  // Where the text sits when the card is taller than its content - and it
  // always is, because a grid row is as tall as its longest card. On a
  // ::: rows block it is the term against the body beside it instead, and
  // the *default* there is `middle` rather than `top`: see renderCardsBlock,
  // which reads `written` to tell a defaulted `top` from an authored one.
  anchor: { default: 'top',   words: ['top', 'middle'] },
  // What happens to the levels under the first. `fold` keeps them off the
  // projection and gives them to the document and to the reader who presses
  // C. `show` puts them on the slide too. `page` is the third answer and it
  // exists for the case the other two cannot serve: a second level that is a
  // paragraph rather than a bullet. Unfolded in place that wrecks the row,
  // so `page` never unfolds - the detail is the hand-out's and C leaves it
  // alone.
  detail: { default: 'fold',  words: ['fold', 'show', 'page'] },
  // What the card sits on. The same word does the same job on ::: overlay,
  // and three of the five values are shared with it. Six is the whole list
  // and it is meant to stay six: filled, outlined, nothing, the accent, the
  // paper, and a picture. Anyone who wants a seventh ground wants a drawing,
  // and there is a language for that.
  ground: { default: 'panel', words: ['panel', 'outline', 'clear', 'accent', 'paper', 'photo'] },
  // Rounded or not. Its own slot rather than a ground, because it is a
  // different question - a square accent card and a round accent card are
  // the same ground with two shapes.
  corner: { default: 'round', words: ['round', 'square'] },
  // What a `photo` card's picture is veiled with - the same question
  // ::: backdrop answers with the same words, except `plain` for `clear`:
  // `clear` is already a *ground* in this table, and one table may not hold
  // a word in two slots. Two tables may share a word.
  scrim:  { default: 'veil',  words: ['veil', 'invert', 'plain'] },
};

export const OVERLAY_SLOTS = {
  place:  { default: 'center',   words: ['center', 'top-left', 'top', 'top-right', 'left', 'right',
                                         'bottom-left', 'bottom', 'bottom-right'] },
  ground: { default: 'paper',    words: ['paper', 'ink', 'accent', 'clear', 'glass'] },
  width:  { default: 'standard', words: ['standard', 'narrow', 'wide', 'full'] },
};

// ::: side asks exactly one question beyond the ratio: where a pane sits
// when the other one is taller. It is the same question a card row answers
// with `anchor`, so it is spelled with the same two words. The block's
// switch and not each pane's: the tall pane is what makes the row tall, so
// centring can only ever move the short one.
export const SIDE_SLOTS = {
  anchor: { default: 'top', words: ['top', 'middle'] },
};

// No word may appear in two slots of one table: parseTail assigns a word to
// whichever slot lists it first, so a collision makes one of the two slots
// silently unreachable. Asserted at load rather than remembered - `clear`
// was a ground and very nearly also a scrim.
//
// A word that is the *default* of every slot holding it is exempt, and the
// distinction is exact rather than lenient: writing a default changes
// nothing whichever slot receives it, so `auto` may be both the size and
// the align default. A word that means something in one slot and is merely
// the default of another is not exempt - that is the case where the first
// slot listed wins and the second becomes unreachable.
export const SLOT_TABLES = { CHUNK_SLOTS, CARDS_SLOTS, OVERLAY_SLOTS, BACKDROP_SLOTS, SIDE_SLOTS };
for (const [name, table] of Object.entries(SLOT_TABLES)) {
  const where = new Map();   // word -> [{slot, isDefault}]
  for (const [slot, spec] of Object.entries(table)) {
    for (const w of spec.words) {
      if (!where.has(w)) where.set(w, []);
      where.get(w).push({ slot, isDefault: spec.default === w });
    }
  }
  for (const [w, hits] of where) {
    if (hits.length < 2 || hits.every(h => h.isDefault)) continue;
    throw new Error(
      `${name}: "${w}" is in the ${hits.map(h => h.slot).join(' and ')} slots and means ` +
      'something in at least one of them. parseTail assigns it to the first, ' +
      'leaving the other unreachable.');
  }
}

// The multi-line listing a refusal prints under its message, so the author
// can read the whole vocabulary off the error rather than off a document.
export function slotTable(slots) {
  return Object.entries(slots)
    .map(([s, spec]) => `  ${s.padEnd(6)} ${spec.words.map(w => '.' + w).join(' | ')}` +
      (typeof spec.default === 'string' ? `   (default: .${spec.default})` : ''))
    .join('\n');
}
// The one-line form for a lint message.
function slotLine(slots) {
  return Object.entries(slots)
    .map(([s, spec]) => `${s}: ${spec.words.map(w => '.' + w).join(' | ')}`).join(', ');
}

// ── the tail parser ───────────────────────────────────────────────────
// Split a heading line into its prose and the contents of a trailing `{…}`.
// `tail` is null when there are no braces, and '' when the author wrote `{}`
// - parseTail treats the two differently.
// A tail ends the line. A sigil group anywhere else - `{.narrow}{#tt}`,
// `Head {.wide #id} | Sub`, `# Part {#c1} trailing`, an unclosed `{.wide` -
// is neither prose nor a tail, and it used to ship as heading text at the
// wrong width with a green lint. `stray` names the offending group; the
// adapters turn it into a stray-attribute problem. Plain braces in prose
// (`the {x} syntax`) are left alone: only a group opening with `.` or `#`
// looks like a tail.
export function splitTail(line) {
  const m = String(line).match(/^(.*?)\s*\{([^}]*)\}\s*$/);
  const text = (m ? m[1] : String(line)).trim();
  // A code span is prose: the tutorial's own heading quotes `{.width #id}`.
  const strayM = text.replace(/`[^`]*`/g, '').match(/\{[.#][^}]*\}?/);
  return { text, tail: m ? m[2] : null, stray: strayM ? strayM[0] : null };
}
// The problem a stray group is, in the parser's own shape.
export function strayTailProblem(what, stray) {
  return { code: 'stray-attribute',
    msg: `${what}: "${stray}" is a tail that does not end the line. One {…} tail, last on the line, ` +
         'and nothing after it.' };
}

// Resolve the contents of a `{…}` tail against a slot table. Never throws:
// every failure is a `{ code, msg }` in `problems`, and the four codes are
// the whole family this grammar refuses everywhere. `classes` holds every
// `.word` in written order, recognised or not, so a caller's contextual
// check (a class on a column heading, a width on a cover chunk) sees what
// the author wrote even when the parser has already objected to it -
//
//   stray-attribute   a token without its sigil, an id where none is taken,
//                     or empty braces
//   unknown-class     a `.word` from no slot of this table
//   same-slot         two `.word`s from one slot (or one written twice)
//   multiple-ids      a second `#id` on a line that takes one
//
// The directive is named in the message (`what`), never in the code.
// `opts.id` is the id policy: 'one' for a heading, 'none' for a directive -
// a generic parser that took `#id` everywhere would let a directive carry an
// id nothing reads, the silent no-op this format refuses. `opts.classes:
// 'none'` is the column heading's policy: it takes an id and no class at
// all, and a `.word` there is `class-on-column` - said once, by the parser,
// rather than as an unknown-class listing a vocabulary the line never had.
export function parseTail(tail, slots, what, { id: idPolicy = 'none', classes: classPolicy = 'slots' } = {}) {
  const out = { classes: [], id: undefined, ids: [], slots: {}, problems: [] };
  for (const [slot, spec] of Object.entries(slots)) out.slots[slot] = { value: spec.default, written: false };
  const problem = (code, msg) => out.problems.push({ code, msg: `${what}: ${msg}` });
  if (tail == null) return out;
  const tokens = String(tail).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    problem('stray-attribute', 'empty {} - a line with nothing to put in braces has no braces. Remove them.');
    return out;
  }
  const answered = {};   // slot -> the word that answered it
  const idsTaken = idPolicy === 'one';
  for (const tok of tokens) {
    if (tok.startsWith('.') && tok.length > 1) {
      const w = tok.slice(1);
      out.classes.push(w);
      if (classPolicy === 'none') {
        problem('class-on-column', `".${w}" - a # heading takes an {#id} and nothing else; ` +
          'a width and .bare belong on the ## chunks under it.');
        continue;
      }
      const slot = Object.keys(slots).find(s => slots[s].words.includes(w));
      if (!slot) {
        problem('unknown-class', idsTaken
          ? `".${w}" is not a class this tail takes - valid: ${slotLine(slots)}`
          : `".${w}" is not a word this directive knows - ${slotLine(slots)}`);
        continue;
      }
      if (answered[slot]) {
        problem('same-slot', answered[slot] === w
          ? `".${w}" is written twice.`
          : `".${answered[slot]}" and ".${w}" both answer "${slot}", and one of them ` +
            'would be thrown away with nothing in the line to say which.');
        continue;
      }
      answered[slot] = w;
      out.slots[slot] = { value: w, written: true };
    } else if (tok.startsWith('#') && tok.length > 1) {
      if (!idsTaken) {
        problem('stray-attribute', `"${tok}" - this directive takes no id. Only a heading does.`);
        continue;
      }
      if (out.id !== undefined) problem('multiple-ids', `#${out.id} and ${tok} are two ids for one heading.`);
      else out.id = tok.slice(1);
      out.ids.push(tok.slice(1));
    } else {
      problem('stray-attribute', (idsTaken
        ? `"${tok}" is not a .class or an #id.`
        : `"${tok}" is not a .word.`) +
        ` Every setting in a {…} tail is written with its dot: {.${tok.replace(/^[.#@!]/, '')}}`);
    }
  }
  return out;
}

// ── the ::: draw opener ───────────────────────────────────────────────
// Playback bounds. Under 200 ms the room cannot read a beat, and over 60 s a
// "moving" figure is a still one that changes when nobody is looking. Both
// ends are refused rather than clamped, because a clamped number is a number
// the author did not write.
export const AUTOPLAY_MIN = 200;
export const AUTOPLAY_MAX = 60000;
export const DRAW_OPENER_EXAMPLE = '::: draw 150x56 autoplay 1200 cycle';

const UNIT_RE = /^(\d+)x(\d+)$/;

// Read the old braced spelling, `{unit=WxH #id autoplay=N cycle}`, into its
// fields. Used by the migration and by parseDrawOpener's refusal message, so
// a stale source is told exactly what to type. `unknown` collects every
// token that is none of the four; `repeated` every field written twice - the
// old build took the first `autoplay=` and the compiler skipped the rest, so
// a repeated field is ambiguous input and no caller may guess; `id` is
// reported and never carried, because a draw id was diagnostic only and the
// new opener has no place for it. `why` is the one sentence that says why
// this tail cannot be rewritten, or null when it can.
export function parseLegacyDrawTail(text) {
  const out = { unit: null, id: null, autoplay: null, cycle: false, unknown: [], repeated: [], why: null };
  const seen = new Set();
  const once = (field) => { if (seen.has(field)) out.repeated.push(field); seen.add(field); };
  for (const tok of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const u = tok.match(/^unit=(\d+x\d+)$/);
    const a = tok.match(/^autoplay=(\d+)$/);
    if (u) { once('unit'); out.unit = u[1]; }
    else if (a) { once('autoplay'); out.autoplay = Number(a[1]); }
    else if (tok === 'cycle') {
      once('cycle');
      out.cycle = true;
    }
    else if (tok.startsWith('#') && tok.length > 1) { once('id'); out.id = tok.slice(1); }
    else out.unknown.push(tok);
  }
  // The id last: when `why` says "carries #", everything else is sound, and
  // the refusal message may format the rest as the line to write.
  if (out.unknown.length) out.why = `does not understand "${out.unknown.join(' ')}"`;
  else if (out.repeated.length) out.why = `writes ${out.repeated.join(' and ')} twice - which one was meant is not for a script to guess`;
  else if (out.unit != null && !validUnit(out.unit)) out.why = `has a zero side in its grid (${out.unit})`;
  else if (out.cycle && out.autoplay == null) out.why = 'has cycle with no autoplay to repeat';
  else if (out.autoplay != null && (out.autoplay < AUTOPLAY_MIN || out.autoplay > AUTOPLAY_MAX)) out.why = `autoplay ${out.autoplay} is out of range`;
  else if (out.id) out.why = `carries #${out.id} - draw ids were diagnostic-only and are no longer supported; remove it by hand`;
  return out;
}

// A grid is WxH with both sides positive.
export function validUnit(unit) {
  const m = UNIT_RE.exec(String(unit));
  return !!m && Number(m[1]) >= 1 && Number(m[2]) >= 1;
}

// The canonical line for a valid field set. Throws on an impossible one -
// that is a defect in the caller, not something an author wrote.
export function formatDrawOpener({ unit = null, autoplay = null, cycle = false } = {}) {
  if (unit != null && !validUnit(unit)) throw new Error(`formatDrawOpener: unit "${unit}" is not WxH with two positive sides`);
  if (autoplay != null && !(Number.isInteger(autoplay) && autoplay >= AUTOPLAY_MIN && autoplay <= AUTOPLAY_MAX)) {
    throw new Error(`formatDrawOpener: autoplay ${autoplay} is not an integer between ${AUTOPLAY_MIN} and ${AUTOPLAY_MAX}`);
  }
  if (cycle && autoplay == null) throw new Error('formatDrawOpener: cycle without autoplay');
  return '::: draw' + (unit != null ? ` ${unit}` : '') +
    (autoplay != null ? ` autoplay ${autoplay}` : '') + (cycle ? ' cycle' : '');
}

// The head-attribute string the compiler still takes. The opener is the
// host's; the compiler learns exactly one thing from it, the grid.
export function drawCompilerAttrs({ unit = null } = {}) {
  return unit != null ? `unit=${unit}` : '';
}

// Parse one source line as a `::: draw` opener.
//
//   null                                   not a draw opener
//   { unit, autoplay, cycle, problems: [] } a valid one; unit is the
//                                          canonical 'WxH' string or null
//   { …, problems: [{ code, msg }] }       begins `::: draw` and must be refused
//
// `null` is the only "unrelated line" answer, so no caller keeps a pre-regex
// of its own. Codes: stray-attribute (the old braced form, `autoplay=`, an
// unknown or out-of-order token), bad-unit, bad-autoplay (not a number, out
// of range, or `cycle` with nothing to repeat). The grammar is strict about
// order - unit first, then `autoplay N`, then `cycle` - because one spelling
// per line is the whole point, and the message always spells that one.
export function parseDrawOpener(line) {
  // `draw{` is an old opener written without the space - the old regex took
  // it, so a stale source may carry one and must get the refusal rather than
  // fall through to the Markdown walker. `::: drawing` is still not ours.
  const m = String(line).match(/^:::\s+draw(?=\s|$|\{)(.*)$/);
  if (!m) return null;
  const out = { unit: null, autoplay: null, cycle: false, problems: [] };
  const problem = (code, msg) => out.problems.push({ code, msg: `::: draw: ${msg}` });
  const rest = m[1].trim();
  const braced = rest.match(/^\{([^}]*)\}\s*$/);
  if (braced) {
    const old = parseLegacyDrawTail(braced[1]);
    // Spell the exact new line when the old one was sound; when it was not,
    // say why and show the shape, because a line the parser would refuse
    // next is no help as a recommendation.
    const sound = old.why === null || old.why.startsWith('carries #');
    const spelled = sound
      ? formatDrawOpener({ unit: old.unit, autoplay: old.autoplay, cycle: old.cycle })
      : DRAW_OPENER_EXAMPLE;
    problem('stray-attribute',
      `the braced tail is gone - the grid is positional and playback is a keyword. Write  ${spelled}` +
      (old.id ? `  (a draw #id was diagnostic only; drop it)` : '') +
      (old.why && !old.why.startsWith('carries #') ? `  (the old tail ${old.why})` : ''));
    return out;
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  let stage = 0;   // 0 unit, 1 autoplay, 2 cycle, 3 done
  // Which keywords have been read, so a second `autoplay` is reported as a
  // repeat and one after `cycle` as out of order - and either way its number
  // is consumed with it rather than read again as a grid.
  let sawAutoplay = false, sawCycle = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const u = tok.match(UNIT_RE);
    if (u) {
      if (stage > 0) problem('stray-attribute', `"${tok}" - the grid comes first. Write  ${DRAW_OPENER_EXAMPLE}`);
      else if (!validUnit(tok)) { problem('bad-unit', `"${tok}" has a zero side. A grid is WxH in units, as in 150x56`); stage = 1; }
      else { out.unit = `${Number(u[1])}x${Number(u[2])}`; stage = 1; }
      continue;
    }
    if (/^\d+$/.test(tok)) {
      problem('stray-attribute', `"${tok}" is a bare number. A delay is written with its keyword:  autoplay ${tok}`);
      continue;
    }
    if (/^\d+\s*[xX×]\s*\d+$|^\d+[xX×]$|^[xX×]\d+$/.test(tok) || /^\d+[xX×]\d+[^\s]*$/.test(tok)) {
      problem('bad-unit', `"${tok}" is not a grid. Write WxH with a lowercase x and no spaces, as in 150x56`);
      continue;
    }
    if (/^unit=/.test(tok)) {
      const v = tok.slice(5);
      problem('stray-attribute', `"${tok}" - the grid is positional now. Write  ::: draw ${UNIT_RE.test(v) ? v : '150x56'}`);
      continue;
    }
    if (/^autoplay=/.test(tok)) {
      const v = tok.slice(9);
      problem('stray-attribute', `"${tok}" - playback is a keyword and a number. Write  autoplay ${/^\d+$/.test(v) ? v : '1200'}`);
      continue;
    }
    if (tok === 'autoplay') {
      const v = tokens[i + 1];
      if (sawAutoplay || sawCycle) {
        problem('stray-attribute', sawAutoplay
          ? '"autoplay" is written twice.'
          : `"autoplay" after "cycle" - write  ${DRAW_OPENER_EXAMPLE}`);
        if (v !== undefined && /^\d+$/.test(v)) i++;   // its delay goes with it
        sawAutoplay = true;
        continue;
      }
      sawAutoplay = true;
      if (v === undefined || !/^\d+$/.test(v)) {
        problem('bad-autoplay', `autoplay takes a delay in milliseconds, as in  autoplay 1200` +
          (v === undefined ? ' - none was written.' : ` - got "${v}".`));
        if (v !== undefined && !/^\d+$/.test(v) && v !== 'cycle') i++;
        stage = 2;
        continue;
      }
      const n = Number(v);
      if (n < AUTOPLAY_MIN || n > AUTOPLAY_MAX) {
        problem('bad-autoplay', `autoplay ${v} is not a delay in milliseconds between ${AUTOPLAY_MIN} and ${AUTOPLAY_MAX}. ` +
          'It is one delay for every step of the figure: autoplay 1200');
      } else out.autoplay = n;
      i++;
      stage = 2;
      continue;
    }
    if (tok === 'cycle') {
      if (sawCycle) { problem('stray-attribute', '"cycle" is written twice.'); continue; }
      sawCycle = true;
      if (out.autoplay == null && !out.problems.some(p => p.code === 'bad-autoplay')) {
        problem('bad-autoplay', 'cycle has no autoplay to repeat. cycle says what happens after the last step; ' +
          `autoplay N is what walks to it. Write  ${DRAW_OPENER_EXAMPLE}`);
      }
      out.cycle = true;
      stage = 3;
      continue;
    }
    problem('stray-attribute', `"${tok}" is not a word this opener knows. It takes a grid, then playback:  ${DRAW_OPENER_EXAMPLE}`);
  }
  return out;
}
