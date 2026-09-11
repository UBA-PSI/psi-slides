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
export const KINDS = ['time', 'example', 'fact', 'delivery'];

// How loud a hint is. `high` is for something that will mislead the room if
// it stands, and is the only thing that interrupts a hint already standing.
export const SEVERITIES = ['low', 'high'];

// Twelve words, and a longer one is discarded rather than shortened. The
// requirement is the listeners': a hint that has to be read as a sentence
// throws the speaker out of their own.
export const MAX_WORDS = 12;

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
            + 'contradicts the deck. delivery: pace, filler, a question left '
            + 'hanging.',
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

export function wordCount(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
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

/**
 * The next `count` slides a cue may be laid into: after the active one, with
 * an id a cockpit can find. A divider is skipped – it is an auto-inserted
 * camera stop with no cue list of its own, and its element id is not the id
 * this payload gives it.
 */
export function cueTargets(deck, idx = -1, count = 3) {
  const chunks = deck && Array.isArray(deck.chunks) ? deck.chunks : [];
  const out = [];
  for (let i = Math.max(0, num(idx, -1) + 1); i < chunks.length && out.length < count; i++) {
    const c = chunks[i];
    if (!c || c.tag === 'section') continue;
    const id = String(c.id || '');
    if (!id || id.indexOf('col:') === 0) continue;
    out.push(id);
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
    '- kind "delivery" rarely: pace, a filler habit, a question left hanging.',
    '- severity "high" only for something that will mislead the room if it stands.',
    '- action "cue" lays a card into a slide that is still to come, for something',
    '  said now that belongs there. Only an id from cue_targets, never the slide the',
    '  speaker is on.',
    '- Write the hint in ' + lang + '.',
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

// ── the tick message ─────────────────────────────────────────────────

// Everything that changes from call to call, and nothing that does not: a
// state line, the hints already given, and a rolling window of what the room
// has heard. Stateless on purpose – the prefix stays byte-identical and
// therefore cached, and this is the only part that is paid for per tick.

function driftWord(drift, rough) {
  if (drift == null) return 'unknown';
  const d = Math.round(num(drift, 0));
  const w = d === 0 ? 'on plan'
    : d > 0 ? '+' + d + 's behind'
      : d + 's ahead';
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

  const out = [];
  out.push([
    'slide ' + (idx + 1) + '/' + (total || '?'),
    '#' + id,
    beats == null ? 'beat ' + beat : 'beat ' + beat + '/' + beats,
    'elapsed ' + clock(elapsed),
    'drift ' + driftWord(s.drift == null ? null : s.drift, s.rough),
    'time_hint_allowed=' + (s.timeHintAllowed ? 'yes' : 'no'),
    'cue_targets=[' + targets.join(', ') + ']',
  ].join(' · '));

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

  // The rolling window: back from now until either the seconds or the words
  // run out. Silence costs nothing – an old segment simply falls out.
  const windowS = num(s.windowSeconds, 90);
  const windowW = num(s.windowWords, 600);
  const segs = (Array.isArray(s.transcript) ? s.transcript : []).filter((x) => x && x.text);
  const kept = [];
  let words = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (elapsed - num(seg.t0, 0) > windowS) break;
    const w = wordCount(seg.text);
    if (kept.length && words + w > windowW) break;
    words += w;
    kept.unshift(seg);
  }
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
  const no = (reason) => ({ action: 'nothing', reason });
  const msg = response && response.choices && response.choices[0]
    ? response.choices[0].message : null;
  let args = null;
  const call = msg && Array.isArray(msg.tool_calls) ? msg.tool_calls[0] : null;
  if (call && call.function) args = safeJson(call.function.arguments);
  if (!args && msg && msg.content) args = safeJson(msg.content);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return no('garbage');

  const action = String(args.action || '').trim();
  const why = args.why == null ? undefined : String(args.why);
  if (action === 'nothing') {
    const out = { action: 'nothing', reason: null };
    if (why !== undefined) out.why = why;
    return out;
  }
  if (action !== 'hint' && action !== 'cue') return no('garbage');

  const text = String(args.text == null ? '' : args.text).replace(/\s+/g, ' ').trim();
  if (!text) return no('garbage');
  if (wordCount(text) > MAX_WORDS) return no('too-long');

  if (action === 'cue') {
    const targets = (Array.isArray(session && session.cueTargets) ? session.cueTargets : [])
      .map(String);
    const chunkId = String(args.chunk_id == null ? '' : args.chunk_id).trim();
    if (!chunkId || targets.indexOf(chunkId) < 0) return no('bad-cue');
    const out = { action: 'cue', text, chunk_id: chunkId };
    if (why !== undefined) out.why = why;
    return out;
  }

  const kind = String(args.kind || '').trim();
  if (KINDS.indexOf(kind) < 0) return no('garbage');
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
 * @returns {{drift:number, rough:boolean}|null}
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
    for (const m of list) {
      if (m.idx < at || (m.idx === at && m.beat <= on)) ref = m;
      else break;
    }
    return { drift: now - ref.at, rough: false };
  }
  const total = num(durationS, null);
  const count = Math.round(num(chunkCount, 0));
  if (total != null && total > 0 && count > 0) {
    return { drift: now - (total * at) / count, rough: true };
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
 */
export function timeHintAllowed({ drift, rough, lastTimeHint, elapsed } = {}) {
  if (drift == null || !isFinite(Number(drift))) return false;
  const d = Number(drift);
  const now = num(elapsed, 0);
  const last = lastTimeHint && typeof lastTimeHint === 'object' ? lastTimeHint : null;
  if (d >= (rough ? 180 : 90)) {
    if (!last) return true;
    const grew = d - num(last.drift, 0) >= 60;
    return grew || now - num(last.at, 0) >= 300;
  }
  if (d <= -240) {
    if (!last) return true;
    return now - num(last.at, 0) >= 600;
  }
  return false;
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
  const since = last == null ? Infinity : t - last;
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
  const cooldown = num(o.cooldown, 60);
  const startQuiet = num(o.startQuiet, 60);
  const perKind = Object.assign(
    { time: 240, delivery: 300, example: null, fact: 120 },
    o.perKind || {},
  );
  const deliveryMax = num(o.deliveryMax, 3);
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

  return {
    judge,
    shown,
    dismissed,
    forgetStanding,
    standing: (now) => standingAt(now),
    history: () => history.slice(),
  };
}
