/*
 * souffleuse.mjs – everything pure about the live prompter.
 *
 * The prompter whispers from the box: at most twelve words, only when the
 * speaker could act on it mid-sentence, and the room notices nothing. The
 * judgement – is that a factual slip? – is the model's. The *restraint* –
 * may a hint come now at all? – is this file, in code, so it is testable
 * without a network and without a browser: test/gates/souffleuse.mjs decides
 * every rule of the policy table in milliseconds.
 *
 * Zero imports and zero Node APIs, like cue-cards.mjs, tails.mjs and
 * diagram-core.mjs. Unlike those three it is not spliced into any page –
 * build.js imports it dynamically under --souffleuse only, so nothing here
 * has to survive a template literal and nothing here reaches the HTML. It is
 * kept zero-dep anyway, because a gate that needs no `npm install` is the
 * whole reason the fast suite is fast.
 *
 * `notesToCards` is injected rather than imported, the way
 * `createDiagramCompiler({…})` takes its Node leaves: deckPayload reads a
 * `> note:` block as cue cards, and there is exactly one text in this
 * repository that knows that grammar. Importing it would be a second import
 * line in a file whose contract is that it has none; re-implementing it
 * would be a second grammar. So the caller hands it in:
 *
 *   deckPayload(lecture, { notesToCards })
 *
 * Without it the notes still travel, as prose, and carry no `@mm:ss` marks –
 * which is a degradation, not a failure, and the drift arithmetic falls back
 * to the linear estimate `duration:` allows.
 *
 * Everything here is pure and total. Nothing throws on odd input; a function
 * that cannot answer returns the `nothing` shape or null, because the one
 * place this code runs is a live talk and a stack trace helps nobody at the
 * lectern.
 */

// ── the vocabulary ───────────────────────────────────────────────────

// What a hint can be about. `cue` is deliberately not one of them: it is an
// action, not a kind – a card laid into a slide that is still to come.
//
// `pace` is separate from `delivery` because the two are not the same job and
// must not share a cool-down. `delivery` is manner – talking to the slide, a
// question left hanging, an argument that has gone abstract – and it is rare
// by design, three in a talk. Tempo is a condition rather than a moment: it
// lasts minutes, it comes back, and it is the one thing here the code
// measures rather than the model judges (see `speechStats`). One cool-down
// doing both jobs is what crippled the author's first rehearsal.
//
// `skipped` is the speaker's own notes: something this slide planned that has
// not been said and is about to go past.
export const KINDS = ['time', 'example', 'fact', 'delivery', 'pace', 'skipped'];

// How loud a hint is. `high` is for something that will mislead the room if
// it stands, and is the only thing that interrupts a hint already standing.
export const SEVERITIES = ['low', 'high'];

// Twelve words, and a longer one is discarded rather than shortened. The
// requirement is the listeners': a hint that has to be read as a sentence
// throws the speaker out of their own.
export const MAX_WORDS = 12;

// The quiet the prompter owes a speaker who has just switched it on, in
// seconds of the cockpit's clock. Exported because two things need the same
// number: `createPolicy`, which refuses everything inside it, and the clock
// rebase below, which has to know whether a talk is already past it.
export const START_QUIET_S = 60;

// The one forced tool call. The answer's vocabulary IS the tool schema –
// there is no read tool, because the whole deck is already in the cached
// system prefix and a round trip would spend the one scarce resource,
// latency.
export const TOOL_SCHEMA = {
  type: 'function',
  function: {
    name: 'advise',
    description:
      'Say what the speaker should hear right now. Almost always nothing.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['nothing', 'hint', 'cue'],
          description:
            'nothing: stay silent, which is the normal answer. hint: whisper one '
            + 'phrase now. cue: lay a card into a slide that is still to come.',
        },
        kind: {
          type: 'string',
          enum: KINDS,
          description:
            'What the hint is about. time: behind or far ahead of the plan, and '
            + 'only when time_hint_allowed is yes. example: the point just made '
            + 'is abstract, or the example did not land. fact: what was just said '
            + 'contradicts the deck. delivery: manner – talking to the slide, a '
            + 'question left hanging, a term used before it was defined. pace: '
            + 'speaking too fast, filler sounds piling up, a silence that has run '
            + 'on – only from the measured numbers in the delivery line. skipped: '
            + 'the notes for this slide planned something that has not been said.',
        },
        text: {
          type: 'string',
          description:
            'The whisper itself, in the deck language. At most twelve words, '
            + 'eight is better. No reasoning, no praise, no summary.',
        },
        severity: {
          type: 'string',
          enum: SEVERITIES,
          description:
            'high only for something that will mislead the room if it stands.',
        },
        chunk_id: {
          type: 'string',
          description:
            'For a cue: which upcoming slide the card belongs to. Only an id '
            + 'from cue_targets, never the current slide.',
        },
        why: {
          type: 'string',
          description: 'One clause, for the log only. Never shown to anybody.',
        },
      },
    },
  },
};

// ── small pure helpers ───────────────────────────────────────────────

// Scripts that do not put a space between two words: CJK ideographs and the
// two extension blocks a talk is likely to use, kana, Hangul, Thai. One
// character is one word there, which is the only counting rule that makes the
// twelve-word gate mean anything in those languages – `wordCount` on a
// Chinese sentence used to answer 1, so a hint of forty characters was inside
// the budget and a whole paragraph could be whispered. The same number is the
// cadence's `newWordsSince`, where the error ran the other way: eight words
// were never reached and a speech tick could not fire at all.
const DENSE_SCRIPT_RE = new RegExp('['
  + '\\u0e00-\\u0e7f'      // Thai
  + '\\u1100-\\u11ff'      // Hangul Jamo
  + '\\u3040-\\u30ff'      // Hiragana and Katakana
  + '\\u3130-\\u318f'      // Hangul compatibility Jamo
  + '\\u3400-\\u4dbf'      // CJK Unified Ideographs Extension A
  + '\\u4e00-\\u9fff'      // CJK Unified Ideographs
  + '\\uac00-\\ud7af'      // Hangul syllables
  + '\\uf900-\\ufaff'      // CJK Compatibility Ideographs
  + ']', 'g');

export function wordCount(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return 0;
  const dense = (s.match(DENSE_SCRIPT_RE) || []).length;
  const spaced = s.replace(DENSE_SCRIPT_RE, ' ').split(/\s+/).filter(Boolean).length;
  return dense + spaced;
}

/**
 * FNV-1a over the UTF-16 code units, as eight hex digits. It names a prefix
 * in the log and rides out as `session_id`, which is what keeps the provider
 * holding the warm prompt cache – so it has to be stable for equal text and
 * different for changed text, and nothing more. No crypto: this module has
 * no Node APIs, and a collision costs a cache miss, not a wrong answer.
 */
export function prefixHash(text) {
  const s = String(text == null ? '' : text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const num = (v, dflt) => (typeof v === 'number' && isFinite(v) ? v : dflt);

// mm:ss, h:mm:ss above an hour, signed. A copy of `formatClock` in
// cue-cards.mjs rather than an import of it, for the zero-import rule; six
// lines, and the two are held together by nothing but this sentence, which
// is affordable because neither will change.
function clock(seconds) {
  const sec = num(seconds, 0);
  const sign = sec < 0 ? '-' : '';
  const t = Math.abs(Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return sign + (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

// Cut to a budget on a word boundary where one is near, with an ellipsis so
// the model can see that something was withheld rather than read a sentence
// that stops.
function capText(s, max) {
  const t = String(s == null ? '' : s);
  if (max <= 1) return '';
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

// ── the deck payload ─────────────────────────────────────────────────

// A compiled figure, as it stands in a chunk's body by the time the parser
// is done with it: `::: draw` is rendered at parse time, so a segment holds
// an inline <svg> of a few thousand characters. None of it is words the room
// hears, and all of it would eat the character budget, so it goes back to
// the one fact the prompter can use – that there is a figure here, and how
// many beats it takes.
const FIGURE_RE = /<figure\b[^>]*class="figure-diagram"[^>]*>[\s\S]*?<\/figure>/g;
const STEPS_RE = /\bdata-steps="(\d+)"/;
const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&ndash;': '–', '&hellip;': '…',
};

/**
 * One reveal segment as the words that stand on the screen. The parser hands
 * back a mix of Markdown and the raw HTML its layout directives emit, plus
 * whatever a figure compiled to; what the prompter needs is the prose, the
 * bolds (which are what the collapse actually shows) and a placeholder where
 * a picture is.
 */
function screenText(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(FIGURE_RE, (block) => {
    const m = STEPS_RE.exec(block);
    const steps = m ? Number(m[1]) : 1;
    return steps > 1 ? `[figure, steps: ${steps}]` : '[figure]';
  });
  // A spliced asset: an SVG file inlined into the body is a picture too.
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/g, '[figure]');
  s = s.replace(/<script\b[\s\S]*?<\/script>/g, ' ');
  s = s.replace(/<style\b[\s\S]*?<\/style>/g, ' ');
  // Fences trimmed: the markers are markup, the code inside them is on the
  // screen and the speaker can misstate it, so the lines themselves stay.
  s = s.replace(/^[ \t]*```.*$/gm, '');
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
  s = s.replace(/&(?:nbsp|amp|lt|gt|quot|#39|ndash|hellip);/g, (e) => ENTITIES[e] || e);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The beats of one chunk, against one shared character budget: when the
// budget runs out the beat is cut and the ones after it are dropped, so a
// slide with a wall of text cannot crowd the next chunk out of the prefix.
function beatsOf(segments, budget) {
  const out = [];
  let left = budget;
  for (const seg of segments || []) {
    // A handful of characters is a stub, not a beat: once the budget is
    // nearly spent the remaining beats are dropped whole rather than shown
    // as three words and an ellipsis.
    if (left <= 1 || (out.length && left < 16)) break;
    const t = screenText(seg);
    if (!t) continue;
    const kept = t.length > left ? capText(t, left) : t;
    if (!kept) break;
    out.push(kept);
    left -= kept.length;
  }
  return out;
}

// One note as the cards the cockpit would show, against a running budget.
// Titles count as cues – the author wrote them to be read from the corner of
// an eye, which is the same job as a bullet.
function noteOf(raw, cards, left) {
  const bullets = [];
  const proses = [];
  const marks = [];
  if (cards) {
    for (const card of cards) {
      if (!card) continue;
      if (card.at != null && isFinite(Number(card.at))) marks.push(Number(card.at));
      if (card.title) bullets.push(String(card.title));
      if (Array.isArray(card.bullets) && card.bullets.length) {
        for (const b of card.bullets) if (b) bullets.push(String(b));
      } else if (card.prose) proses.push(String(card.prose));
    }
  } else {
    // No `notesToCards` injected: the block travels as the prose it is.
    const t = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (t) proses.push(t);
  }
  const keptBullets = [];
  let room = left;
  for (const b of bullets) {
    if (room <= 1) break;
    const t = b.length > room ? capText(b, room) : b;
    if (!t) break;
    keptBullets.push(t);
    room -= t.length + 1;
  }
  let prose = null;
  if (proses.length && room > 1) {
    const joined = proses.join(' ');
    prose = joined.length > room ? capText(joined, room) : joined;
    room -= prose.length;
  }
  return { cards: keptBullets.length ? keptBullets : null, prose, marks, used: left - room };
}

/**
 * The whole deck as the prompter reads it: one flat list of slides in the
 * order the cockpit walks them.
 *
 * The numbering is the cockpit's. `flatChunks` in SPEAKER_JS collects every
 * `.chunk` element of every `.column` in document order, and a column with a
 * heading emits a divider slide before its first chunk – so a divider is an
 * entry there, and it is an entry here, and `n - 1` is the `idx` the socket
 * carries. A divider with an id keeps it; one without is `col:N`, counted
 * over all columns.
 *
 * @param {object} lecture  what `parseLecture` returned: {frontmatter, columns}
 * @param {object} opts     `notesToCards` injected, the two character caps,
 *                          the planned duration in seconds, the deck language
 */
export function deckPayload(lecture, opts = {}) {
  const o = opts || {};
  const notesToCards = typeof o.notesToCards === 'function' ? o.notesToCards : null;
  const maxScreenChars = num(o.maxScreenChars, 1500);
  const maxNoteChars = num(o.maxNoteChars, 2500);
  const durationS = o.durationS == null ? null : num(o.durationS, null);
  const lang = String(o.lang || 'en');

  const fm = (lecture && lecture.frontmatter) || {};
  const columns = lecture && Array.isArray(lecture.columns) ? lecture.columns : [];
  const chunks = [];

  const pushNotes = (target, rawNotes, from, segs) => {
    let left = maxNoteChars;
    (rawNotes || []).forEach((raw, k) => {
      if (left <= 1) return;
      const pinned = (from || [])[k];
      const seg = (segs || [])[k];
      // Which advance the note is said on. A pinned `> note: from N` names
      // it; otherwise it is the reveal segment the note stood in, which is
      // the same position rule the cue cards file by. A nested beat can push
      // the real advance later than the segment number – the cockpit knows
      // that from the DOM and this file cannot, and the difference is
      // context for the model rather than a control, so it is left.
      const at = pinned != null ? Math.max(0, Number(pinned) || 0)
        : Math.max(0, Number(seg) || 0);
      let cards = null;
      if (notesToCards) {
        try { cards = notesToCards(raw) || []; } catch (e) { cards = []; }
      }
      const note = noteOf(raw, cards, left);
      left -= note.used;
      for (const m of note.marks) target.marks.push({ at: m, beat: at });
      if (note.cards || note.prose) {
        target.notes.push({ at, cards: note.cards, prose: note.prose });
      }
    });
    target.marks.sort((a, b) => a.at - b.at || a.beat - b.beat);
  };

  columns.forEach((col, ci) => {
    const part = col && col.heading ? String(col.heading) : null;
    if (part) {
      // The divider slide. It carries no notes of its own – what the author
      // wrote under the heading is its body, and that is on the screen.
      const divider = {
        n: chunks.length + 1,
        id: (col.id && String(col.id)) || `col:${ci + 1}`,
        col: part,
        tag: 'section',
        title: part,
        sub: null,
        beats: beatsOf(col.body ? [col.body] : [], maxScreenChars),
        notes: [],
        marks: [],
      };
      chunks.push(divider);
    }
    const own = (col && Array.isArray(col.chunks)) ? col.chunks : [];
    own.forEach((c, xi) => {
      const tag = String((c && c.tag) || 'free');
      // The three id rules of the renderers, mirrored so the id here is the
      // `data-chunk-id` the cockpit sends back over the socket.
      const id = (c && c.id && String(c.id))
        || (tag === 'title' ? 'title' : tag === 'closing' ? 'closing' : `c${ci}-${xi}`);
      const heading = String((c && c.heading) || '').trim();
      const sub = String((c && c.headingSub) || '').trim();
      const entry = {
        n: chunks.length + 1,
        id,
        col: part,
        tag,
        // A cover slide takes its words from the frontmatter, not from a
        // heading it does not have.
        title: heading || (tag === 'title' ? String(fm.title || '').trim() : '') || null,
        sub: sub || (tag === 'title' ? String(fm.subtitle || '').trim() : '') || null,
        beats: beatsOf((c && c.segments) || [], maxScreenChars),
        notes: [],
        marks: [],
      };
      pushNotes(entry, c && c.speakerNotes, c && c.speakerNoteFrom, c && c.speakerNoteSegs);
      chunks.push(entry);
    });
  });

  return {
    title: String(fm.title || '').trim() || null,
    lang,
    durationS,
    chunks,
  };
}

/**
 * Every `@mm:ss` in the deck, flattened onto the slide it sits on, in the
 * order the talk reaches them. This is what `driftSeconds` measures against;
 * the per-chunk `marks` carry the beat because a mark means nothing without
 * the point in the talk it names.
 */
export function flattenMarks(deck) {
  const chunks = deck && Array.isArray(deck.chunks) ? deck.chunks : [];
  const out = [];
  chunks.forEach((c, i) => {
    for (const m of (c && c.marks) || []) {
      if (m && isFinite(Number(m.at))) {
        out.push({ idx: i, beat: Math.max(0, Number(m.beat) || 0), at: Number(m.at) });
      }
    }
  });
  out.sort((a, b) => a.idx - b.idx || a.beat - b.beat || a.at - b.at);
  return out;
}

// A slide a cue can name: not a divider, and with an id the cockpit can
// find. A divider is an auto-inserted camera stop with no cue list of its
// own, and its element id is not the id this payload gives it.
function addressable(c) {
  if (!c || c.tag === 'section') return false;
  const id = String(c.id || '');
  return !!id && id.indexOf('col:') !== 0;
}

/**
 * The end of the deck, as the two slides worth offering from anywhere in the
 * talk: the last addressable slide, and the `closing:` chunk if there is one.
 *
 * A sentence worth keeping is usually said long before the place it belongs,
 * and that place is usually the conclusion – which a window of the next three
 * slides reaches only in the last minute of the talk, by which time the
 * sentence has been forgotten. So the conclusion is always a target.
 *
 * `from` is the first slide a card may go into, which is the one after the
 * active slide. **A conclusion the speaker is already standing on is
 * therefore not offered**, and that is the right answer rather than an
 * oversight: a card for the slide on the screen is something to say now, and
 * the thing that says something now is a hint on the strip. The model is
 * offered the strip for it either way.
 */
function endTargets(deck, from) {
  const chunks = deck && Array.isArray(deck.chunks) ? deck.chunks : [];
  let last = null;
  let closing = null;
  for (let i = chunks.length - 1; i >= Math.max(0, num(from, 0)); i--) {
    const c = chunks[i];
    if (!addressable(c)) continue;
    if (last === null) last = String(c.id);
    if (closing === null && c.tag === 'closing') closing = String(c.id);
  }
  return { last, closing };
}

/**
 * The slides a cue may be laid into: the next `count` after the active one,
 * plus the deck's end – see `endTargets`.
 */
export function cueTargets(deck, idx = -1, count = 3) {
  const chunks = deck && Array.isArray(deck.chunks) ? deck.chunks : [];
  const from = Math.max(0, num(idx, -1) + 1);
  const out = [];
  for (let i = from; i < chunks.length && out.length < count; i++) {
    if (addressable(chunks[i])) out.push(String(chunks[i].id));
  }
  const end = endTargets(deck, from);
  for (const id of [end.last, end.closing]) {
    if (id && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

// ── the system prefix ────────────────────────────────────────────────

// The role, the rules and the deck, in that order, as one text. It is byte
// stable for equal input, which is the whole point: the prefix is what
// carries `cache_control`, and a prefix that differed per call would pay for
// the deck again every twenty-five seconds. A rebuild renews it by itself,
// because a changed source.md is a changed deck.
function rules(lang) {
  return [
    'You are the prompter for a live talk. You sit in the box: you whisper, you',
    'whisper briefly, and the room never notices you.',
    '',
    'Your normal answer is action "nothing". Almost every call is a "nothing".',
    'Whisper only when the speaker can act on it from the lectern, in the middle',
    'of a sentence, without losing the thread.',
    '',
    'Rules:',
    '- At most ' + MAX_WORDS + ' words in a hint, and eight is better. A longer one is',
    '  discarded unread, not shortened.',
    '- No reasoning, no praise, no summary of what was just said. One phrase that',
    '  can be acted on.',
    '- One hint per call, and never one that is already in the list of hints given.',
    '  A hint the speaker dismissed is marked and must not come back in other words.',
    '- kind "time" only when time_hint_allowed is yes. Whether the clock is worth a',
    '  word is decided in code, not by you.',
    '- kind "fact" only when you are fairly sure. The transcript comes from speech',
    '  recognition and mishears names, numbers and technical words; a hint about a',
    '  mishearing is worse than silence.',
    '- kind "example" when the point just made is abstract and the deck has the',
    '  concrete case for it, or when the example given did not land.',
    '- kind "delivery" rarely, and about manner rather than tempo: talking to the',
    '  slide, a question left hanging, a term used before it was defined. An',
    '  argument that has gone abstract or lost its thread gets a handhold, never a',
    '  diagnosis: "name the bank example", not "you are being abstract".',
    '- kind "pace" only from the delivery line, and only when it is there: the pace',
    '  word is "fast" or "very-fast", or the fillers are piling up, or the longest',
    '  silence has run on. No delivery line means the sample was too short to mean',
    '  anything, and then there is nothing to say about tempo.',
    '- Speech recognition often drops filler sounds before you ever see them, so a',
    '  count of zero is no evidence that none were said. Never tell the speaker they',
    '  are not hesitating, and never count fillers out of the transcript yourself.',
    '- kind "skipped" when the notes for the slide on the screen planned something',
    '  the speaker has not said and is walking past. Name the thing that was planned,',
    '  not the omission.',
    '- severity "high" only for something that will mislead the room if it stands.',
    '- action "cue" lays a card into a slide that is still to come, for something',
    '  said now that belongs there. Only an id from cue_targets, never the slide the',
    '  speaker is on. The slide named as conclusion= is always in that list: a',
    '  sentence worth keeping that the deck does not have belongs there.',
    '- Write the hint in ' + lang + '.',
    // The strip is part of this tool's typography, and this tool sets
    // en-dashes. A model left to itself writes em-dashes, and the first real
    // rehearsal painted one on the projection-side screen.
    '- Punctuation: no dashes at all if the phrase can carry a comma instead,',
    '  and an en-dash (\u2013) never an em-dash (\u2014) if it cannot.',
  ];
}

export function systemPrefix(deck, opts = {}) {
  const d = deck || {};
  const lang = String((opts && opts.lang) || d.lang || 'en');
  const chunks = Array.isArray(d.chunks) ? d.chunks : [];
  const out = rules(lang);
  out.push('', '=== the deck ===');
  out.push('title: ' + (d.title || '(untitled)'));
  out.push('language: ' + (d.lang || lang));
  out.push('planned duration: ' + (d.durationS ? clock(d.durationS) : '(not stated)'));
  out.push('slides: ' + chunks.length);
  for (const c of chunks) {
    out.push('');
    let head = '– ' + c.n + ' · #' + c.id + ' · ' + c.tag;
    if (c.col) head += ' · part: ' + c.col;
    out.push(head);
    if (c.title) out.push('heading: ' + c.title + (c.sub ? ' | ' + c.sub : ''));
    (c.beats || []).forEach((b, i) => {
      out.push('screen ' + (i + 1) + ': ' + b);
    });
    for (const n of c.notes || []) {
      const body = n.cards && n.cards.length
        ? n.cards.map((b) => '• ' + b).join(' ')
        : (n.prose || '');
      if (body) out.push('note (beat ' + n.at + '): ' + body);
    }
    if ((c.marks || []).length) {
      out.push('planned: ' + c.marks.map((m) => clock(m.at) + ' (beat ' + m.beat + ')').join(', '));
    }
  }
  return out.join('\n');
}

// ── what the code measures: the delivery ─────────────────────────────
//
// The model has no tempo information at all. It receives text, and speaking
// rate, hesitation, filler density and long silences are simply absent from
// a transcript – so "notice that I am speaking too fast" is not a prompting
// problem, it is missing input. Everything the code can count, the code
// counts; the model is asked only whether a number is worth a whisper.
//
// The one honest caution to carry with it: Chrome's recogniser frequently
// **strips filler sounds** before a final result is ever delivered, so a
// filler count of zero is not evidence that none were said. The rules say so
// and no hint may read a zero as fluency.

// The rolling window, and there is one of it. Back from now until either the
// seconds or the words run out; silence costs nothing, an old segment simply
// falls out. `tickMessage` prints the words of this window and the figures
// drawn from it, and a second walk written by hand is how the two would come
// to describe different stretches of the same talk.
const WINDOW_S = 90;
const WINDOW_WORDS = 600;

function windowOf(transcript, elapsed, windowS, windowW) {
  const segs = (Array.isArray(transcript) ? transcript : []).filter((x) => x && x.text);
  const kept = [];
  let words = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (num(elapsed, 0) - num(seg.t0, 0) > windowS) break;
    const w = wordCount(seg.text);
    if (kept.length && words + w > windowW) break;
    words += w;
    kept.unshift(seg);
  }
  return { kept, words };
}

// Filler sounds, and only sounds. `also`, `halt`, `eigentlich`, `like` and
// `you know` are ordinary words of German and English, and a false positive
// here tells a lecturer to stop doing something they were not doing – which
// is worse than saying nothing, because it is unanswerable. The repetitions
// are in the pattern because a recogniser writes what it heard: "ähhh",
// "ummm", "hmmm". `er` is left out although it is an English filler: in
// German it is the word "he".
const FILLER_RE = /^(?:[äö]h+m*|ehm+|uh+m*|h+m+|erm+)$/;
// "um" is a filler in English and an everyday preposition in German ("um die
// Ecke", "um zu"), so it counts only where it cannot be the word. This is the
// one place the filler count needs to know the language.
const FILLER_UM_RE = /^um+$/;
const TOKEN_RE = /[^\p{L}]+/u;

function fillerCount(text, lang) {
  const de = /^de\b/i.test(String(lang == null ? '' : lang));
  let n = 0;
  for (const w of String(text == null ? '' : text).toLowerCase().split(TOKEN_RE)) {
    if (!w) continue;
    if (FILLER_RE.test(w) || (!de && FILLER_UM_RE.test(w))) n += 1;
  }
  return n;
}

/**
 * Published guidance for presenting sits at roughly 100 to 150 words a
 * minute: slower and a room drifts, faster and it stops following. These are
 * the lower bounds of the four bands above "slow", and they are one named
 * constant because the prompt prints the word, the state line prints the
 * number and the gate asserts the boundary – a threshold spelled three times
 * is a threshold that drifts. Generous at the top on purpose: a lecturer at
 * 160 is brisk and usually knows it, one at 190 has stopped leaving room for
 * a thought to land.
 */
export const PACE_WPM = { easy: 110, brisk: 150, fast: 170, veryFast: 190 };

/** One of `slow | easy | brisk | fast | very-fast`, or null with no number. */
export function paceVerdict(wpm) {
  if (typeof wpm !== 'number' || !isFinite(wpm)) return null;
  if (wpm < PACE_WPM.easy) return 'slow';
  if (wpm < PACE_WPM.brisk) return 'easy';
  if (wpm < PACE_WPM.fast) return 'brisk';
  if (wpm < PACE_WPM.veryFast) return 'fast';
  return 'very-fast';
}

/**
 * The seconds of speech a delivery figure has to rest on before it is worth
 * printing. Four words in a two-second segment is 120 wpm and means nothing;
 * twenty seconds is about four sentences, which is a tempo. Below it the
 * state line carries no delivery line at all, and the rules make that the
 * condition for a `pace` hint – so the model cannot invent the numbers it was
 * not given.
 */
export const DELIVERY_MIN_SAMPLE_S = 20;

function statsOf(kept, words, lang) {
  let seconds = 0;
  let fillers = 0;
  let longestGap = 0;
  let prevEnd = null;
  for (const seg of kept) {
    const t0 = num(seg.t0, 0);
    const t1 = num(seg.t1, t0);
    seconds += Math.max(0, t1 - t0);
    if (prevEnd != null) longestGap = Math.max(longestGap, t0 - prevEnd);
    prevEnd = t1;
    fillers += fillerCount(seg.text, lang);
  }
  // Per minute of *speech*, not of wall time: a speaker who said forty words
  // in twenty seconds of talking and then thought for a minute spoke at 120
  // wpm, not at 30. The silence is its own figure, `longestGap`.
  const perMin = seconds > 0 ? 60 / seconds : null;
  return {
    words,
    seconds,
    // The same figure rounded: what the state line prints and what the floor
    // is compared against, so one number is read everywhere.
    sampled: Math.round(seconds),
    wpm: perMin == null ? null : Math.round(words * perMin),
    fillers,
    fillersPerMin: perMin == null ? null : Math.round(fillers * perMin * 10) / 10,
    longestGap: Math.max(0, longestGap),
    segments: kept.length,
  };
}

/**
 * The delivery, measured over the same rolling window the transcript rides
 * in. Pure and total: no clock, no throw, and null rather than Infinity where
 * there is nothing to divide by.
 *
 * @param {object} arg  `{transcript, now, window: {seconds, words}, lang}`
 * @returns {{words, seconds, sampled, wpm, fillers, fillersPerMin,
 *            longestGap, segments}}
 */
export function speechStats({ transcript, now, window: win, lang } = {}) {
  const w = win && typeof win === 'object' ? win : {};
  const { kept, words } = windowOf(
    transcript, num(now, 0), num(w.seconds, WINDOW_S), num(w.words, WINDOW_WORDS),
  );
  return statsOf(kept, words, lang);
}

// The delivery line, or nothing when the sample is too small to mean
// anything. One line, because the state line above it is one line and this is
// the same kind of fact: where the talk is, and how it is being said.
function deliveryLine(stats) {
  if (!stats || stats.sampled < DELIVERY_MIN_SAMPLE_S || stats.wpm == null) return null;
  const verdict = paceVerdict(stats.wpm);
  const spoken = stats.sampled + 's spoken';
  // A zero is not fluency. The recogniser drops these sounds more often than
  // it keeps them, and the line says so where the number is, not only in the
  // rules – whoever reads the log meets it here first.
  const filler = stats.fillers
    ? stats.fillers + ' filler' + (stats.fillers === 1 ? '' : 's') + ' in the last ' + spoken
    : 'no fillers counted in the last ' + spoken + ' (a recogniser often drops them)';
  return 'delivery: ' + stats.wpm + ' wpm' + (verdict ? ' (' + verdict + ')' : '')
    + ' · ' + filler
    + ' · longest silence ' + Math.round(stats.longestGap) + 's';
}

// ── the tick message ─────────────────────────────────────────────────

// Everything that changes from call to call, and nothing that does not: a
// state line, the hints already given, and a rolling window of what the room
// has heard. Stateless on purpose – the prefix stays byte-identical and
// therefore cached, and this is the only part that is paid for per tick.

function driftWord(drift, rough, beforeFirst) {
  if (drift == null) return 'unknown';
  const d = Math.round(num(drift, 0));
  const w = d === 0 ? 'on plan'
    : d > 0 ? '+' + d + 's behind'
      : d + 's ahead';
  // Said out loud, because otherwise the number reads as a fact about the
  // talk: before the first mark it is the distance to a clock the talk has
  // not arrived at, and being 685 seconds "ahead" of one is not news. The
  // cockpit's own drift makes the same choice and labels it.
  if (beforeFirst) return w + ' (of the first mark, not reached yet)';
  return rough ? w + ' (rough)' : w;
}

export function tickMessage(session = {}) {
  const s = session || {};
  const deck = s.deck || null;
  const chunks = deck && Array.isArray(deck.chunks) ? deck.chunks : [];
  const idx = Math.max(0, Math.round(num(s.idx, 0)));
  const total = Math.round(num(s.chunkCount, chunks.length));
  const active = chunks[idx] || null;
  const id = s.chunkId || (active ? active.id : '?');
  const beat = Math.max(0, Math.round(num(s.beat, 0)));
  const beats = s.beats == null ? null : Math.max(0, Math.round(num(s.beats, 0)));
  const elapsed = num(s.elapsed, 0);
  const targets = Array.isArray(s.cueTargets) ? s.cueTargets.map(String) : cueTargets(deck, idx);
  const lang = String(s.lang || (deck && deck.lang) || '');

  const out = [];
  const state = [
    'slide ' + (idx + 1) + '/' + (total || '?'),
    '#' + id,
    beats == null ? 'beat ' + beat : 'beat ' + beat + '/' + beats,
    'elapsed ' + clock(elapsed),
    'drift ' + driftWord(s.drift == null ? null : s.drift, s.rough, s.beforeFirst),
    'time_hint_allowed=' + (s.timeHintAllowed ? 'yes' : 'no'),
    'cue_targets=[' + targets.join(', ') + ']',
  ];
  // Which of those targets is the conclusion, named as a field of its own
  // rather than as a mark inside the list: the ids in `cue_targets` are
  // copied verbatim into the answer, and an id carrying a decoration is an
  // id the model gets wrong. Absent when the cards are switched off, because
  // then there are no targets at all.
  const end = endTargets(deck, Math.max(0, idx + 1));
  const conclusion = end.closing || end.last;
  if (conclusion && targets.indexOf(conclusion) >= 0) state.push('conclusion=' + conclusion);
  out.push(state.join(' · '));

  // What no transcript can say, counted here and judged there.
  const windowS = num(s.windowSeconds, WINDOW_S);
  const windowW = num(s.windowWords, WINDOW_WORDS);
  const win = windowOf(s.transcript, elapsed, windowS, windowW);
  const delivery = deliveryLine(statsOf(win.kept, win.words, lang));
  if (delivery) out.push(delivery);

  // The last five, newest last, with ✕ on the ones the speaker sent away.
  // The dismissed ones are in the list precisely because they are the ones
  // that must not come back.
  const hints = (Array.isArray(s.hints) ? s.hints : []).filter(Boolean).slice(-5);
  if (hints.length) {
    out.push('', 'hints given (✕ = the speaker dismissed it):');
    for (const h of hints) {
      out.push('  ' + (h.dismissed ? '✕' : '·') + ' ' + clock(num(h.at, 0))
        + ' ' + String(h.kind || 'hint') + ': ' + String(h.text || ''));
    }
  }

  // The words of the same window the figures above were drawn from.
  const kept = win.kept;
  const lastTickAt = s.lastTickAt == null ? null : num(s.lastTickAt, 0);
  const isNew = (seg) => lastTickAt != null && num(seg.t0, 0) >= lastTickAt;
  const older = kept.filter((seg) => !isNew(seg));
  const fresh = kept.filter(isNew);
  out.push('', 'what the room has heard (last ' + Math.round(windowS) + 's):');
  if (!kept.length) out.push('  (nothing yet)');
  if (older.length) out.push('  ' + older.map((x) => String(x.text).trim()).join(' '));
  if (fresh.length) out.push('  NEW: ' + fresh.map((x) => String(x.text).trim()).join(' '));
  return out.join('\n');
}

// ── the answer ───────────────────────────────────────────────────────

function safeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  let s = String(raw).trim();
  // A model that ignores the forced tool call and writes the object into the
  // content sometimes fences it. Cheaper to unwrap than to lose the answer.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (fence) s = fence[1];
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* give up */ }
  }
  return null;
}

/**
 * An OpenAI-format chat completion to the one decision the sidecar acts on.
 * Never throws, and answers `nothing` with a `reason` for everything it
 * cannot use – the reason is what the JSONL log is read for afterwards, so
 * it distinguishes a model that stayed silent from one that talked nonsense.
 */
export function parseAnswer(response, session = {}) {
  // A refusal carries whatever of the answer was already legible. The log
  // line the sidecar writes for a suppressed answer is the whole of the
  // debrief on this call, and `bad-cue` used to reach it with `text: null` –
  // so "the model is ignoring cue_targets" was a reason with nothing under
  // it, and nobody could see which card it had wanted to lay where.
  const no = (reason, extra) => Object.assign({ action: 'nothing', reason }, extra || {});
  const choice = response && response.choices && response.choices[0]
    ? response.choices[0] : null;
  const msg = choice ? choice.message : null;
  let args = null;
  const call = msg && Array.isArray(msg.tool_calls) ? msg.tool_calls[0] : null;
  if (call && call.function) args = safeJson(call.function.arguments);
  if (!args && msg && msg.content) args = safeJson(msg.content);
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    // A tool call cut off mid-JSON is not nonsense, it is our own ceiling.
    // The first real rehearsal filed a correct hint as `garbage` because the
    // model had written a long `why` and run into max_tokens: the arguments
    // string ended after the text and never closed. The two need separate
    // names, because one of them is answered by raising a number here and
    // the other by changing the model or the prompt.
    if (choice && String(choice.finish_reason || '') === 'length') return no('truncated');
    return no('garbage');
  }

  const action = String(args.action || '').trim();
  const why = args.why == null ? undefined : String(args.why);
  if (action === 'nothing') {
    const out = { action: 'nothing', reason: null };
    if (why !== undefined) out.why = why;
    return out;
  }
  if (action !== 'hint' && action !== 'cue') return no('garbage');

  // What was named, for a refusal to carry through. `kind` and `chunk_id` are
  // still the model's raw words here: the point of putting them in a
  // `suppressed` line is to show what it asked for, not what it should have.
  const said = {};
  if (why !== undefined) said.why = why;
  if (args.kind != null) said.kind = String(args.kind).trim();
  if (args.chunk_id != null) said.chunk_id = String(args.chunk_id).trim();

  const text = String(args.text == null ? '' : args.text).replace(/\s+/g, ' ').trim();
  if (!text) return no('garbage', said);
  said.text = text;
  if (wordCount(text) > MAX_WORDS) return no('too-long', said);

  if (action === 'cue') {
    const targets = (Array.isArray(session && session.cueTargets) ? session.cueTargets : [])
      .map(String);
    const chunkId = String(args.chunk_id == null ? '' : args.chunk_id).trim();
    if (!chunkId || targets.indexOf(chunkId) < 0) return no('bad-cue', said);
    const out = { action: 'cue', text, chunk_id: chunkId };
    if (why !== undefined) out.why = why;
    return out;
  }

  const kind = String(args.kind || '').trim();
  if (KINDS.indexOf(kind) < 0) return no('garbage', said);
  const severity = SEVERITIES.indexOf(String(args.severity || '').trim()) >= 0
    ? String(args.severity).trim() : 'low';
  const out = { action: 'hint', kind, text, severity };
  if (why !== undefined) out.why = why;
  return out;
}

// ── the clock ────────────────────────────────────────────────────────

/**
 * How far the talk is from its plan, in seconds: positive is behind.
 *
 * The reference is the same one the cue list uses – the last `@mm:ss` mark
 * the talk has passed, and before the first mark the first one, because a
 * talk that has not reached its first mark is measured against reaching it.
 * With no marks but a `duration:` the plan is a straight line through the
 * slides, which is rough and says so: it assumes every slide takes the same
 * time, which no talk does. With neither there is no plan, and a prompter
 * with no plan has nothing to say about the clock.
 *
 * `beforeFirst` says the reference is a mark the talk has not reached, which
 * makes the number a fact about the future rather than about the talk: with
 * the first mark at 12:30 on slide 3, a speaker on slide 1 at 1:05 is 685
 * seconds "ahead" of a clock nobody has arrived at. The number is kept,
 * because being past that first mark while still on slide 1 is genuinely
 * behind; what the flag buys is `timeHintAllowed` refusing the *ahead* branch
 * on it.
 *
 * @returns {{drift:number, rough:boolean, beforeFirst?:boolean}|null}
 */
export function driftSeconds({ elapsed, marks, idx, beat, durationS, chunkCount } = {}) {
  const now = num(elapsed, 0);
  const at = Math.max(0, Math.round(num(idx, 0)));
  const on = Math.max(0, Math.round(num(beat, 0)));
  const list = (Array.isArray(marks) ? marks : [])
    .filter((m) => m && isFinite(Number(m.at)))
    .map((m) => ({ idx: Math.round(num(m.idx, 0)), beat: Math.round(num(m.beat, 0)), at: Number(m.at) }))
    .sort((a, b) => a.idx - b.idx || a.beat - b.beat || a.at - b.at);

  if (list.length) {
    let ref = list[0];
    let reached = false;
    for (const m of list) {
      if (m.idx < at || (m.idx === at && m.beat <= on)) { ref = m; reached = true; }
      else break;
    }
    return { drift: now - ref.at, rough: false, beforeFirst: !reached };
  }
  const total = num(durationS, null);
  const count = Math.round(num(chunkCount, 0));
  if (total != null && total > 0 && count > 0) {
    // The straight line has no first mark to be short of: its reference is
    // wherever the talk stands, from the first slide on.
    return { drift: now - (total * at) / count, rough: true, beforeFirst: false };
  }
  return null;
}

/**
 * May the clock be mentioned at all? Behind is worth more than ahead: a talk
 * running long has to lose something, and that is a decision the speaker can
 * only take while there is still something to lose. Running early is worth a
 * word at most once every ten minutes.
 *
 * The linear estimate needs twice the slack before it is allowed to speak,
 * because it is wrong by construction on any deck whose slides differ.
 *
 * `beforeFirst` closes the one branch that would otherwise be a whisper about
 * nothing. A deck whose first `@mm:ss` sits on slide 3 – which is the natural
 * way to write them – makes a speaker on slide 1 in the opening minute 685
 * seconds "ahead", and the prompter was then invited to mention a clock
 * nobody had reached. Behind still counts: past the first mark's time
 * and still on the first slide is genuinely late.
 */
export function timeHintAllowed({ drift, rough, beforeFirst, lastTimeHint, elapsed } = {}) {
  if (drift == null || !isFinite(Number(drift))) return false;
  const d = Number(drift);
  const now = num(elapsed, 0);
  const last = lastTimeHint && typeof lastTimeHint === 'object' ? lastTimeHint : null;
  if (d >= (rough ? 180 : 90)) {
    if (!last) return true;
    const grew = d - num(last.drift, 0) >= 60;
    return grew || now - num(last.at, 0) >= 300;
  }
  if (beforeFirst) return false;
  if (d <= -240) {
    if (!last) return true;
    return now - num(last.at, 0) >= 600;
  }
  return false;
}

// ── the clock going backwards ────────────────────────────────────────

// How far the cockpit's clock may drop before it is read as a new clock
// rather than as two messages arriving out of order. A second or two of
// disorder is ordinary; five is not.
export const CLOCK_JUMP_S = 5;

/**
 * The cockpit's clock restarted, and everything the sidecar remembers is
 * stamped on the old one.
 *
 * `tStart` in the cockpit is the page load, and a `--watch` rebuild reloads
 * the page on every save – so in the middle of a rehearsal the clock can go
 * back to zero while the talk carries on. The cockpit persists its own origin
 * now (`psi-slides:souffleuse-clock`), which is the real fix; this is the
 * sidecar refusing to be fooled by a clock it did not set, whatever page it is
 * talking to. Without it: the drift went wildly negative, `shouldTick`'s
 * `since` went negative so no slide tick could fire, and the opening quiet
 * minute was stamped again on every save.
 *
 * Everything is moved by the same delta, so the *relative* ages the rolling
 * window and the cool-downs are made of survive; anything that would land
 * before the new zero is dropped, because it is older than the clock is.
 *
 * **The policy is stamped on the same clock and is not in here**: it has
 * `rebase(delta)` of its own, and the sidecar calls the two together. Moving
 * one without the other left every cool-down answering to a clock nobody was
 * on – see `createPolicy`'s `rebase`.
 *
 * @returns {null|{delta, onAt, lastTickAt, transcript, dropped}} null when the
 *          clock did not jump, which is every ordinary message.
 */
export function rebaseClock({
  prev, next, onAt, lastTickAt, transcript, startQuiet, tolerance,
} = {}) {
  const was = num(prev, 0);
  const now = num(next, 0);
  const tol = num(tolerance, CLOCK_JUMP_S);
  if (!(was - now > tol)) return null;
  const delta = now - was;              // negative, by more than the tolerance
  const quiet = num(startQuiet, START_QUIET_S);

  const before = was - num(onAt, 0);
  // A talk already past its quiet minute stays past it: the clock moved, the
  // talk did not, and re-quieting a running talk is the failure this rule
  // exists to prevent. Inside the quiet the stamp simply follows the clock,
  // which at worst buys the speaker the rest of the minute again.
  const nextOnAt = before >= quiet ? now - before : now;

  const tick = lastTickAt == null ? null : num(lastTickAt, 0) + delta;
  const segs = (Array.isArray(transcript) ? transcript : [])
    .map((s) => Object.assign({}, s, {
      t0: num(s && s.t0, 0) + delta,
      t1: num(s && s.t1, 0) + delta,
    }))
    .filter((s) => s.t1 >= 0);

  return {
    delta,
    onAt: nextOnAt,
    lastTickAt: tick != null && tick >= 0 ? tick : null,
    transcript: segs,
    dropped: (Array.isArray(transcript) ? transcript.length : 0) - segs.length,
  };
}

// ── the tick decision ────────────────────────────────────────────────

/**
 * Whether to call the model now, and what for.
 *
 * A new slide is an occasion, but not more often than every eight seconds –
 * paging through three slides to reach one is not three occasions. New
 * speech is an occasion once it reaches the cadence AND is actually speech:
 * eight words, so a cough and a "so, äh" do not buy a call. Silence is never
 * an occasion.
 *
 * Never two calls in flight. A second occasion while one is out is
 * coalesced – remembered as `reason` and fired the moment the answer lands –
 * and a slide occasion outranks a speech one, because the slide is the newer
 * fact about where the talk is.
 */
export function shouldTick({
  now, lastTickAt, lastTickReason, speechSecondsSince, newWordsSince,
  cadence, slideChanged, inflight,
} = {}) {
  const t = num(now, 0);
  const last = lastTickAt == null ? null : num(lastTickAt, 0);
  // A clock that has gone backwards is a *new* clock, not a tick in the
  // future. The cockpit's timer restarts with the page, and a --watch rebuild
  // reloads the page on every save, so `now - last` goes negative there – and
  // a negative `since` is never >= 8, which stopped every slide tick for the
  // rest of the talk. The sidecar re-anchors on such a jump (`rebaseClock`);
  // this is the same rule seen from inside, so that neither half depends on
  // the other having noticed.
  const raw = last == null ? Infinity : t - last;
  const since = raw < 0 ? Infinity : raw;
  const cad = num(cadence, 25);
  let reason = null;
  if (slideChanged && since >= 8) reason = 'slide';
  else if (num(speechSecondsSince, 0) >= cad && num(newWordsSince, 0) >= 8) reason = 'speech';

  if (inflight) {
    const pending = String(lastTickReason || '') === 'slide' && reason !== 'slide'
      ? lastTickReason : (reason || lastTickReason || null);
    return { tick: false, reason: pending || null, coalesce: !!reason };
  }
  if (!reason) return { tick: false, reason: null, coalesce: false };
  return { tick: true, reason, coalesce: false };
}

// ── the policy ───────────────────────────────────────────────────────

// Restraint is the requirement, not polish. Every rule below was a sentence
// somebody said when they heard the idea: a hint that is too long, a second
// hint on top of the first, the same hint twice, a prompter that starts
// talking before the speaker has found the room.

const WORD_RE = /[^\p{L}\p{N}]+/u;

function wordSet(text) {
  const s = String(text == null ? '' : text).toLowerCase();
  const out = new Set();
  for (const w of s.split(WORD_RE)) if (w) out.add(w);
  return out;
}

function jaccardOf(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / (a.size + b.size - hit);
}

/**
 * The policy, as a small object with memory.
 *
 *   judge(answer, ctx) -> {show: true} | {show: false, reason}
 *   shown(hint)        -> record a hint that went to the strip
 *   dismissed(hintId)  -> the speaker sent it away, by any of the three ways
 *   standing(now)      -> the hint currently up, or null
 *   forgetStanding()   -> it left the screen without anybody sending it away
 *   rebase(delta)      -> the cockpit's clock restarted; move every timestamp
 *                         in here onto the new one, beside `rebaseClock`
 *
 * `ctx` carries what the policy cannot know: `{now, elapsedSinceOn, chunkId,
 * cueTargets, timeHintAllowed}`. `now` and a hint's `at` are one clock – the
 * cockpit's – and `elapsedSinceOn` is the separate one the opening silence
 * is measured on, because switching the prompter on mid-talk should still
 * buy the speaker a minute of quiet.
 *
 * A cue is not a hint: it goes into a slide that is still to come, nobody
 * reads it now, and so it takes no part in the standing slot, the overall
 * cool-down or the per-kind cool-downs. Its two rules are its own.
 */
export function createPolicy(opts = {}) {
  const o = opts || {};
  // The cooldown across every kind, and it is the one that actually fired.
  // It was 60 s, shorter than every per-kind figure below, so it was the only
  // gate most answers ever met: the first rehearsal showed a fact correction
  // at 1:22 swallowing both time hints behind it, at 1:55 and 2:10, although a
  // clock warning and a wrong number are different jobs and neither repeats
  // the other. Its job is to stop two whispers arriving on top of each other,
  // which is a matter of seconds, not of a minute; the per-kind figures are
  // what keep the same *kind* from becoming a drumbeat.
  const cooldown = num(o.cooldown, 20);
  const startQuiet = num(o.startQuiet, START_QUIET_S);
  // Per kind. `fact` was 120 s and that is far too long for the failure it
  // guards: a speaker who has the numbers muddled says four wrong things in
  // four minutes, and the room is misled by each of them. Repeating the same
  // correction in the same words is what the duplicate rule is for, and it
  // catches that whether or not this number is generous.
  //
  // `pace` is 150 s, and it has a figure of its own precisely so that it does
  // not share one with anything else: tempo is a condition that lasts
  // minutes, and a speaker who has just been told to slow down needs long
  // enough to have actually changed something before being told again. Two
  // and a half minutes is about that; shorter and the prompter is a
  // metronome. `skipped` is 90 s, the shortest figure after `fact`, because
  // two omissions on two slides are two different facts – but not shorter,
  // because a speaker who has left a slide cannot go back to it and a second
  // reminder about the same one is noise.
  const perKind = Object.assign(
    { time: 240, delivery: 300, example: null, fact: 45, pace: 150, skipped: 90 },
    o.perKind || {},
  );
  const deliveryMax = num(o.deliveryMax, 3);
  // Four in a talk, one more than `delivery`, because the condition genuinely
  // recurs – fast in the opening, fast again after a question from the room –
  // and because this is the kind the speaker asked for. At 150 s apart four of
  // them cannot happen inside ten minutes, so the ceiling is what keeps a
  // long talk from becoming a drumbeat rather than what rations a short one.
  const paceMax = num(o.paceMax, 4);
  const jaccard = num(o.jaccard, 0.6);
  // How long a hint may hold the standing slot without anybody answering for
  // it. The strip takes a hint away by itself after 15 s, 25 s for a high
  // one, and every one of those three ways sends a `dismiss` – so in the
  // ordinary course this number is never reached. It is here for the case
  // where the dismissal cannot arrive: the socket closed under the hint, or
  // the page reloaded (a --watch rebuild does that on every save) and the new
  // one holds no hint at all. Without it one lost dismissal dropped every low
  // hint for the rest of the talk, under the reason `standing`, which reads
  // in the log exactly like the policy working. 25 s plus a margin.
  const standingMax = num(o.standingMax, 40);

  const history = [];          // every hint shown, dismissed or not
  const seen = [];             // their word sets, for the duplicate rule
  const lastByKind = Object.create(null);
  const exampleChunks = new Set();
  const cueChunks = new Set();
  let standingHint = null;
  let lastShownAt = null;
  let deliveryCount = 0;
  let paceCount = 0;

  const clockOf = (ctx) => num(ctx && ctx.now, num(ctx && ctx.elapsedSinceOn, 0));

  // The hint that holds the slot, as of `now`. One that is older than
  // `standingMax` is treated as gone rather than deleted: it keeps its place
  // in the history and in the duplicate rule, because it was said.
  function standingAt(now) {
    if (!standingHint) return null;
    const at = num(standingHint.at, 0);
    if (standingMax > 0 && num(now, at) - at > standingMax) return null;
    return standingHint;
  }

  function judge(answer, ctx = {}) {
    const a = answer || {};
    const c = ctx || {};
    if (a.action !== 'hint' && a.action !== 'cue') {
      return { show: false, reason: a.reason || 'nothing' };
    }
    const text = String(a.text == null ? '' : a.text).trim();
    if (!text) return { show: false, reason: 'garbage' };
    if (wordCount(text) > MAX_WORDS) return { show: false, reason: 'too-long' };
    if (num(c.elapsedSinceOn, 0) < startQuiet) return { show: false, reason: 'start-quiet' };

    // The same thing twice, in other words, is still the same thing – and
    // the dismissed ones count, because a dismissal is an answer.
    const words = wordSet(text);
    for (const prev of seen) {
      if (jaccardOf(words, prev) >= jaccard) return { show: false, reason: 'duplicate' };
    }

    const now = clockOf(c);
    const chunkId = c.chunkId == null ? null : String(c.chunkId);

    if (a.action === 'cue') {
      const targets = (Array.isArray(c.cueTargets) ? c.cueTargets : []).map(String);
      const target = String(a.chunk_id == null ? '' : a.chunk_id);
      if (!target || targets.indexOf(target) < 0) return { show: false, reason: 'bad-cue' };
      if (cueChunks.has(target)) return { show: false, reason: 'cue-per-chunk' };
      return { show: true };
    }

    const kind = String(a.kind || '');
    if (KINDS.indexOf(kind) < 0) return { show: false, reason: 'garbage' };
    if (kind === 'time' && !c.timeHintAllowed) return { show: false, reason: 'time-not-allowed' };
    if (kind === 'example' && chunkId != null && exampleChunks.has(chunkId)) {
      return { show: false, reason: 'example-per-chunk' };
    }
    if (kind === 'delivery' && deliveryCount >= deliveryMax) {
      return { show: false, reason: 'delivery-max' };
    }
    if (kind === 'pace' && paceCount >= paceMax) {
      return { show: false, reason: 'pace-max' };
    }

    const high = String(a.severity || 'low') === 'high';
    // One at a time. A low hint waits its turn, which in practice means it
    // never comes – and that is the intended answer: what stands is already
    // more important than what is being proposed.
    if (standingAt(now) && !high) return { show: false, reason: 'standing' };

    // The overall cool-down, with the one exception that earns it: a
    // high-severity factual slip is the thing the room is about to believe.
    if (lastShownAt != null && now - lastShownAt < cooldown
        && !(kind === 'fact' && high)) {
      return { show: false, reason: 'cooldown' };
    }
    const per = perKind[kind];
    if (per != null && lastByKind[kind] != null && now - lastByKind[kind] < per) {
      return { show: false, reason: 'kind-cooldown' };
    }
    return { show: true };
  }

  function shown(hint) {
    const h = hint || {};
    const at = num(h.at, 0);
    const entry = {
      id: h.id == null ? null : String(h.id),
      kind: h.kind == null ? null : String(h.kind),
      action: h.action === 'cue' ? 'cue' : 'hint',
      text: String(h.text == null ? '' : h.text),
      chunkId: h.chunkId == null ? null : String(h.chunkId),
      at,
      dismissed: false,
    };
    history.push(entry);
    seen.push(wordSet(entry.text));
    if (entry.action === 'cue') {
      const target = h.chunk_id == null ? entry.chunkId : String(h.chunk_id);
      if (target) cueChunks.add(target);
      return entry;
    }
    standingHint = entry;
    lastShownAt = at;
    if (entry.kind) lastByKind[entry.kind] = at;
    if (entry.kind === 'delivery') deliveryCount += 1;
    if (entry.kind === 'pace') paceCount += 1;
    if (entry.kind === 'example' && entry.chunkId) exampleChunks.add(entry.chunkId);
    return entry;
  }

  function dismissed(hintId) {
    const id = hintId == null ? null : String(hintId);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].id === id) { history[i].dismissed = true; break; }
    }
    if (standingHint && standingHint.id === id) standingHint = null;
  }

  // The hint is off the screen and nobody sent it away: a fresh page holds no
  // hint, and neither does a cockpit the sidecar has lost the socket to. The
  // sidecar calls this from every `hello`.
  function forgetStanding() { standingHint = null; }

  /**
   * The cockpit's clock restarted and everything in here is stamped on the
   * dead one. `rebaseClock` moves the switch-on stamp, the last tick and the
   * transcript; this moves the policy's four memories by the same delta, and
   * the sidecar calls the two together.
   *
   * Without it the whole policy went on answering to a clock nobody was on.
   * A second cockpit tab taking the prompter twenty-five minutes in – a
   * supported flow – starts near 0:00 in its own `sessionStorage`, so a hint
   * shown at 25:00 refused every `low` hint for the next twenty-five minutes
   * under the reason `cooldown`, which in the log reads exactly like the
   * policy working. The relative ages are what every rule here is made of,
   * so they survive; a stamp that lands before the new zero is left negative
   * rather than clamped, which is the same thing as "long ago".
   */
  function rebase(delta) {
    const d = num(delta, 0);
    if (!d) return;
    if (lastShownAt != null) lastShownAt += d;
    for (const kind of Object.keys(lastByKind)) {
      if (lastByKind[kind] != null) lastByKind[kind] += d;
    }
    // The history rows carry the times the tick message prints, and the
    // standing hint is one of those rows – `shown` pushes the entry and keeps
    // a reference to it – so it must not be moved twice.
    for (const h of history) h.at = num(h.at, 0) + d;
    if (standingHint && history.indexOf(standingHint) < 0) {
      standingHint.at = num(standingHint.at, 0) + d;
    }
  }

  return {
    judge,
    shown,
    dismissed,
    forgetStanding,
    rebase,
    standing: (now) => standingAt(now),
    history: () => history.slice(),
  };
}

// ── the log, read back ───────────────────────────────────────────────

/**
 * A run's JSONL, replayed through today's parser and today's policy.
 *
 * The debrief holds the model's raw answer on every `answer` line, so a
 * finished talk can be asked the question the talk itself could not: what
 * would the prompter do with these answers now? That is how a threshold is
 * changed with evidence rather than by feel – `--souffleuse-replay`.
 *
 * The switch being thrown is a `status` line carrying the clock it was thrown
 * on, and that is where the opening quiet is measured from; an `idle` or an
 * `off` un-throws it. A log too old to carry that falls back to the first
 * `tick`. Each answer is judged in the state line of the tick before it.
 *
 * @param {Array} lines   parsed JSONL objects, or the raw lines
 * @param {object} opts   passed straight to `createPolicy`
 * @returns {Array} one row per answer: what was proposed, and what the policy
 *                  would do with it now
 */
export function replayAnswers(lines, opts = {}) {
  const policy = createPolicy(opts || {});
  const rows = [];
  let at = 0, chunkId = null, allowed = false, targets = [], onAt = null, n = 0;
  for (const raw of (Array.isArray(lines) ? lines : [])) {
    const line = typeof raw === 'string' ? safeJson(raw) : raw;
    if (!line || typeof line !== 'object') continue;
    if (line.type === 'status') {
      const st = String(line.state || '');
      if (st === 'idle' || st === 'off') onAt = null;
      else if (onAt == null && line.elapsed != null) onAt = num(line.elapsed, 0);
      continue;
    }
    if (line.type === 'tick') {
      at = num(line.elapsed, at);
      chunkId = line.chunkId == null ? chunkId : String(line.chunkId);
      allowed = !!line.timeHintAllowed;
      targets = Array.isArray(line.cueTargets) ? line.cueTargets.map(String) : [];
      if (onAt == null) onAt = at;
      continue;
    }
    if (line.type !== 'answer' || line.dryRun) continue;
    n += 1;
    const answer = parseAnswer(line.body, { cueTargets: targets });
    const verdict = policy.judge(answer, {
      now: at,
      elapsedSinceOn: at - (onAt == null ? at : onAt),
      chunkId, cueTargets: targets, timeHintAllowed: allowed,
    });
    if (verdict.show) {
      policy.shown({
        id: 'replay' + n, action: answer.action, kind: answer.kind,
        text: answer.text, chunk_id: answer.chunk_id, chunkId, at,
      });
    }
    rows.push({
      n, at, chunkId,
      action: answer.action,
      kind: answer.kind || null,
      text: answer.text || null,
      target: answer.chunk_id || null,
      why: answer.why == null ? null : answer.why,
      show: !!verdict.show,
      reason: verdict.show ? null : (verdict.reason || 'nothing'),
    });
  }
  return rows;
}
