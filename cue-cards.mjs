/*
 * cue-cards.mjs – a speaker note read as cue cards.
 *
 * One pure function, `notesToCards(text)`, and the two helpers around a time
 * mark. build.js imports it and splices it as text into SPEAKER_JS, the way
 * diagram-core.mjs and the QR encoder travel: one text, two runtimes, so the
 * cards the cockpit derives from a rehearsal override in the textarea are
 * the cards the source would have given – and so the grammar's regexes live
 * here, outside every template literal, where a backslash means what it
 * says. Zero imports, zero Node APIs; test/gates/cue-cards.mjs holds it to
 * this contract without a build.
 *
 * The grammar is small on purpose – it is the subset of Markdown a person
 * writes into a `> note:` block to be read from the corner of an eye:
 *
 *   blank line            ends a card
 *   **bold** / __bold__   one bullet per phrase; the rest of the paragraph is
 *                         dropped, because the bold IS the cue
 *   no bold at all        the whole paragraph, as prose – nothing is lost,
 *                         it is just not a cue yet
 *   - item / 1. item      bullets as written
 *   #### Title            the next card's title (any heading level)
 *   @12:30 / @1:02:30     when this card should be reached, counted from the
 *                         start of the talk; alone on a line it applies to
 *                         the next card, at a paragraph's start to that one
 *   [Klick: …] / [Click:  a press. The card ends here and everything after it
 *   …] / [> …]           is one advance later on the slide's own counter,
 *                         which is what `> note: from N` says by number. The
 *                         words behind the colon title the card that follows,
 *                         unless a heading stands nearer to it.
 *
 * Any other bracketed line - `[Pause.]`, `[Lachen abwarten.]` - is a stage
 * direction, not a press, and stays in the card as the author wrote it.
 *
 * Inline code, links and emphasis are reduced to their text. Everything
 * returned is plain text; whoever renders it escapes it.
 */

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const TIME_MARK = /^@?(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TIME_AT_START = /^@(\d{1,2}:\d{2}(?::\d{2})?)\s+/;
const BOLD = /\*\*(.+?)\*\*|__(.+?)__/g;
const BRACKET_LINE = /^\[(.+)\]$/;
const BRACKET_HEAD = /^(>|[^\s,.;:!?]+)/;
// The stage directions that are a press. A fixed set, deliberately not a
// `STRINGS` entry: `notesToCards` runs in the browser too, over a rehearsal
// override typed into the textarea, where no lecture's wording table is in
// reach - and `lint.js` has no such table at all, so routing the word list
// through `lang:` would mean a third hand-kept copy of it. A word the author
// types is source, not the furniture the build invents, and `labels:` may
// not redefine it. `>` is the spelling for every language this list has no
// word for.
const CUE_ADVANCE_WORDS = ['klick', 'click'];

// '@12:30' → 750, '1:02:30' → 3750 (the @ is optional), anything else → null.
export function parseTimeMark(s) {
  const m = TIME_MARK.exec(String(s || '').trim());
  if (!m) return null;
  const [a, b, c] = [m[1], m[2], m[3]].map(x => (x == null ? null : Number(x)));
  return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
}

// 750 → '12:30', 3750 → '1:02:30'; negative values keep their sign.
export function formatClock(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const t = Math.abs(Math.round(seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return sign + (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

// Markdown inline syntax to the words a person would read out.
export function plainInline(s) {
  // An escaped punctuation character is text, not syntax: park it behind a
  // control character until the syntax has been reduced.
  return String(s)
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (m, ch) => '\u0001' + ch.charCodeAt(0) + ';')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/g, '$1$2')
    .replace(/(^|[^_\w])_([^_\n]+?)_(?=[^_\w]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\u0001(\d+);/g, (m, code) => String.fromCharCode(Number(code)))
    .trim();
}

// Is this line a press? `[Klick: Zeile 1 wird hell.]` is, `[Pause.]` is not.
// Returns null, or { title } – the words the direction leaves once the
// keyword is off it, which is what the click *does* and therefore the best
// title the card after it can have. `title` is '' when the direction says
// only that there is a click.
//
// Two readers, and that is why it is exported rather than inlined into
// notesToCards: the cockpit splits the cards by it, and lint.js counts the
// presses one note asks for against the beats the slide has. A second
// spelling of this regex is how the two would come to disagree about what a
// press is.
export function cueAdvance(line) {
  const m = BRACKET_LINE.exec(String(line || '').trim());
  if (!m) return null;
  const body = m[1].trim();
  const head = BRACKET_HEAD.exec(body);
  if (!head) return null;
  const word = head[1].toLowerCase();
  if (word !== '>' && !CUE_ADVANCE_WORDS.includes(word)) return null;
  // Everything behind the first colon names the effect – `Klick auf dem
  // Bauplan: Zeile 1 wird hell.` is about the line, not about the Bauplan.
  // With no colon, whatever follows the keyword has to do.
  const rest = body.slice(head[1].length);
  const colon = rest.indexOf(':');
  const said = plainInline(colon >= 0 ? rest.slice(colon + 1) : rest);
  return { title: said.replace(/^[,;:.–-]+\s*/, '').replace(/\.$/, '').trim() };
}

// The cards of one note. Each is { title, at, bullets, prose, advance } –
// title and at may be null, exactly one of bullets (non-empty) or prose (a
// string) carries the card's words, and advance is how many presses into
// the note's own beat the card is said: 0 for the first, one more after
// every `[Klick …]` line.
export function notesToCards(text) {
  const cards = [];
  let title = null;
  let at = null;
  let advance = 0;
  const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  for (const para of paragraphs) {
    const lines = para.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lines.length) continue;
    // A heading, a bare time mark or a click applies to the card that
    // follows; each may share a paragraph with it or stand in one of their
    // own. Where a heading and a click both stand above one card the nearer
    // one titles it, which is the one the eye reaches last: a block headed
    // `#### Bauplan` whose second card follows a click is about what the
    // click did, and the figure's name is on the card before it already.
    while (lines.length) {
      const h = HEADING.exec(lines[0]);
      if (h) { title = plainInline(h[1]); lines.shift(); continue; }
      const t = lines[0].trim().startsWith('@') ? parseTimeMark(lines[0]) : null;
      if (t != null) { at = t; lines.shift(); continue; }
      const adv = cueAdvance(lines[0]);
      if (adv) {
        advance += 1;
        if (adv.title) title = adv.title;
        lines.shift();
        continue;
      }
      break;
    }
    if (!lines.length) continue;
    const lead = TIME_AT_START.exec(lines[0]);
    if (lead) { at = parseTimeMark(lead[1]); lines[0] = lines[0].slice(lead[0].length); }

    const card = { title, at, bullets: [], prose: null, advance };
    title = null; at = null;
    const items = lines.map(l => LIST_ITEM.exec(l));
    if (items.every(Boolean)) {
      card.bullets = items.map(m => plainInline(m[1])).filter(Boolean);
    } else {
      const joined = lines.join(' ');
      const bolds = [...joined.matchAll(BOLD)].map(m => plainInline(m[1] ?? m[2])).filter(Boolean);
      if (bolds.length) card.bullets = bolds;
      else card.prose = plainInline(joined);
    }
    if (card.bullets.length || card.prose) cards.push(card);
  }
  return cards;
}
