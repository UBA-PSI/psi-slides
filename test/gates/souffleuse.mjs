/*
 * The prompter's judgement, decided without a network.
 *
 * `souffleuse.mjs` holds everything pure about the live prompter: the deck
 * the model reads, the prompt it reads it in, the answer it sends back, the
 * arithmetic of the clock, and the policy that decides whether a hint may be
 * whispered at all. None of that needs a key, a socket or a browser, which
 * is the whole reason it is one zero-dependency module: the restraint is the
 * requirement, and a requirement nothing can test is a hope.
 *
 * So this gate walks the policy table of PLAN-souffleuse.md row by row, the
 * drift rule at each of its four references, and the deck payload against a
 * hand-built `lecture` object of the shape `parseLecture` returns – built
 * here rather than read from `lectures/`, so a lecture that is re-worded
 * cannot fail a compiler gate. `notesToCards` is injected the way build.js
 * will inject it, which is the one thing about the module's shape worth
 * asserting twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { notesToCards } from '../../cue-cards.mjs';
import {
  KINDS, MAX_WORDS, SEVERITIES, TOOL_SCHEMA,
  deckPayload, systemPrefix, prefixHash, tickMessage, parseAnswer,
  driftSeconds, timeHintAllowed, shouldTick, createPolicy, wordCount,
  cueTargets, flattenMarks,
} from '../../souffleuse.mjs';
import { ROOT } from './harness.mjs';

export const name = 'souffleuse: the prompter, decided without a network';

const j = (v) => JSON.stringify(v);

// A chunk of the shape the parser hands back: the fields deckPayload reads
// and nothing else, so the fixture says what the contract is.
const chunk = (tag, id, heading, segments, notes = [], from = [], segs = []) => ({
  tag, id, heading, headingSub: '', segments,
  speakerNotes: notes, speakerNoteFrom: from, speakerNoteSegs: segs,
});

const FIGURE = '<figure class="figure-diagram"><svg id="psi-fig-1" class="psi-diagram" '
  + 'data-steps="3" viewBox="0 0 10 10">Die Kette</svg>'
  + '<script type="application/json" class="psi-diagram-frames">[{"a":1}]</script></figure>';

function fixture(note0 = '@12:30 Sekretärin **Frau K.**') {
  return {
    frontmatter: { title: 'Der zweite Klick', subtitle: 'ein Vortrag', lang: 'de' },
    columns: [
      // The anonymous opening column: no heading, so no divider slide.
      { heading: null, id: null, body: '', chunks: [chunk('title', null, '', [])] },
      {
        heading: 'Warum', id: 'warum', body: 'Eine Frage zum Anfang.',
        chunks: [
          chunk('principle', 'vorgesetzter', 'Der Vorgesetzte',
            ['Erster Absatz mit **fett**.', 'Zweiter Absatz.'],
            [note0, 'Das **Postfach**'], [null, 1], [0, null]),
          chunk('example', 'beispiel', 'Ein Fall', ['Ein Beispiel.'],
            ['@15:00 Der **Vermerk**'], [null], [0]),
        ],
      },
      {
        heading: 'Ohne id', id: null, body: '',
        chunks: [
          chunk('figure', 'kette', 'Die Kette', [FIGURE]),
          chunk('free', 'schluss', 'Schluss', ['Ende.']),
          chunk('free', 'zugabe', 'Zugabe', ['Noch etwas.']),
        ],
      },
    ],
  };
}

const deckOf = (lec = fixture(), opts = {}) =>
  deckPayload(lec, Object.assign({ notesToCards, durationS: 2400, lang: 'de' }, opts));

export async function run({ report }) {
  const { ok } = report;

  // ── the deck payload ─────────────────────────────────────────────
  const deck = deckOf();
  ok(deck.title === 'Der zweite Klick' && deck.lang === 'de' && deck.durationS === 2400,
     'the deck carries title, language and the planned duration', j({ t: deck.title, l: deck.lang, d: deck.durationS }));

  const ids = deck.chunks.map(c => c.id);
  ok(j(ids) === j(['title', 'warum', 'vorgesetzter', 'beispiel', 'col:3', 'kette', 'schluss', 'zugabe']),
     'the flat order is the cockpit\'s: columns in order, a divider before each headed column', j(ids));
  ok(deck.chunks.every((c, i) => c.n === i + 1),
     'n is 1-based over that order, so n - 1 is the idx the socket carries');
  ok(deck.chunks[1].tag === 'section' && deck.chunks[4].tag === 'section',
     'a divider is a chunk of tag section');
  ok(deck.chunks[1].id === 'warum', 'a divider with an id keeps it');
  ok(deck.chunks[4].id === 'col:3', 'a divider without an id is col:N, counted over all columns');
  ok(deck.chunks[1].beats.length === 1 && deck.chunks[1].beats[0] === 'Eine Frage zum Anfang.',
     'what the author wrote under the heading is the divider\'s screen text', j(deck.chunks[1].beats));
  ok(deck.chunks[0].title === 'Der zweite Klick' && deck.chunks[0].sub === 'ein Vortrag',
     'a cover slide takes its words from the frontmatter it renders from', j(deck.chunks[0]));
  ok(deck.chunks[2].col === 'Warum' && deck.chunks[0].col === null,
     'a chunk names the part it is in, and the anonymous column is not a part');

  const vor = deck.chunks[2];
  ok(j(vor.beats) === j(['Erster Absatz mit **fett**.', 'Zweiter Absatz.']),
     'one beat per reveal segment, in source order, with the bolds kept', j(vor.beats));
  ok(deck.chunks[5].beats.length === 1 && deck.chunks[5].beats[0] === '[figure, steps: 3]',
     'a compiled ::: draw is replaced by the one fact about it the prompter can use', j(deck.chunks[5].beats));

  ok(j(vor.notes) === j([{ at: 0, cards: ['Frau K.'], prose: null }, { at: 1, cards: ['Postfach'], prose: null }]),
     'notes arrive as cue cards, each on the beat it is said on', j(vor.notes));
  ok(j(vor.marks) === j([{ at: 750, beat: 0 }]),
     'an @mm:ss mark rides on the chunk with the beat it sits in', j(vor.marks));
  const pinned = deck.chunks[2].notes[1];
  ok(pinned.at === 1, '`> note: from 1` pins the note to that advance, not to its position');

  const prose = deckPayload(fixture(), { durationS: 2400 });
  ok(prose.chunks[2].notes[0].cards === null && /Frau K\./.test(prose.chunks[2].notes[0].prose || ''),
     'without notesToCards injected a note still travels, as prose', j(prose.chunks[2].notes[0]));
  ok(prose.chunks[2].marks.length === 0,
     'and then it carries no marks, because nothing parsed the @mm:ss');

  const tiny = deckOf(fixture(), { maxScreenChars: 18, maxNoteChars: 6 });
  ok(tiny.chunks[2].beats.length === 1 && tiny.chunks[2].beats[0].length <= 18
     && /…$/.test(tiny.chunks[2].beats[0]),
     'the screen budget cuts the beat it runs out on and drops the rest', j(tiny.chunks[2].beats));
  ok((tiny.chunks[2].notes[0].cards || []).join(' ').length <= 6,
     'the note budget does the same for the cards', j(tiny.chunks[2].notes));

  ok(j(deckPayload(null, {})) === j({ title: null, lang: 'en', durationS: null, chunks: [] }),
     'a missing lecture is an empty deck, not a throw');

  const marks = flattenMarks(deck);
  ok(j(marks) === j([{ idx: 2, beat: 0, at: 750 }, { idx: 3, beat: 0, at: 900 }]),
     'flattenMarks puts every mark on the slide it belongs to, in talk order', j(marks));

  // ── cue targets ──────────────────────────────────────────────────
  ok(j(cueTargets(deck, 2)) === j(['beispiel', 'kette', 'schluss']),
     'cue targets are the next three slides with an id, and a divider is skipped', j(cueTargets(deck, 2)));
  ok(j(cueTargets(deck, 6)) === j(['zugabe']), 'near the end there are fewer than three');
  ok(j(cueTargets(deck, 7)) === j([]), 'and on the last slide there are none');

  // ── the system prefix ────────────────────────────────────────────
  const p1 = systemPrefix(deck, { lang: 'de' });
  const p2 = systemPrefix(deckOf(), { lang: 'de' });
  ok(p1 === p2, 'the prefix is byte-stable for an equal deck – it is what carries cache_control');
  ok(prefixHash(p1) === prefixHash(p2) && /^[0-9a-f]{8}$/.test(prefixHash(p1)),
     'and so is its hash, which rides out as session_id', prefixHash(p1));
  const p3 = systemPrefix(deckOf(fixture('@12:30 Sekretärin **Frau M.**')), { lang: 'de' });
  ok(prefixHash(p3) !== prefixHash(p1), 'one changed word in one note is a different prefix');
  ok(prefixHash('') !== prefixHash('a') && prefixHash('ab') !== prefixHash('ba'),
     'the hash separates the empty string, one character and a transposition');
  ok(/Write the hint in de\./.test(p1), 'the output language is named in the rules', p1.slice(0, 80));
  ok(p1.includes('planned duration: 40:00') && p1.includes('slides: 8'),
     'the deck header states the plan and the slide count');
  ok(p1.includes('– 3 · #vorgesetzter · principle · part: Warum'),
     'every slide is listed with its number, id, type and part');
  ok(p1.includes('note (beat 1): • Postfach') && p1.includes('planned: 12:30 (beat 0)'),
     'the notes and the marks are in the prefix, which is what the room does not hear');

  // ── the tick message ─────────────────────────────────────────────
  const session = {
    deck,
    idx: 2, chunkId: 'vorgesetzter', beat: 1, beats: 2, chunkCount: 8,
    elapsed: 900, drift: 95, rough: false, timeHintAllowed: true,
    cueTargets: cueTargets(deck, 2),
    lastTickAt: 880,
    hints: [
      { at: 300, kind: 'example', text: 'Nenne den Fall', dismissed: false },
      { at: 500, kind: 'fact', text: 'Es waren zwei', dismissed: true },
      { at: 600, kind: 'delivery', text: 'Langsamer', dismissed: false },
      { at: 700, kind: 'time', text: 'Zehn Minuten', dismissed: false },
      { at: 800, kind: 'fact', text: 'Dritter Klick', dismissed: false },
      { at: 860, kind: 'example', text: 'Das Postfach', dismissed: false },
    ],
    transcript: [
      { text: 'ganz alt und weit weg', t0: 700, t1: 705 },
      { text: 'das ist noch im Fenster', t0: 850, t1: 856 },
      { text: 'und das ist neu', t0: 885, t1: 890 },
    ],
  };
  const tick = tickMessage(session);
  ok(tick.split('\n')[0] === 'slide 3/8 · #vorgesetzter · beat 1/2 · elapsed 15:00 · '
     + 'drift +95s behind · time_hint_allowed=yes · cue_targets=[beispiel, kette, schluss]',
     'the state line names where the talk is, how late it is and what a cue may reach', tick.split('\n')[0]);
  ok(!tick.includes('Nenne den Fall') && tick.includes('Das Postfach'),
     'only the last five hints are listed', tick);
  ok(/✕ 8:20 fact: Es waren zwei/.test(tick), 'a dismissed hint is marked ✕, so it cannot come back', tick);
  ok(tick.includes('NEW: und das ist neu') && tick.includes('das ist noch im Fenster')
     && !/NEW: das ist noch/.test(tick),
     'NEW marks exactly what was said since the last call', tick);
  ok(!tick.includes('ganz alt'), 'and the window drops what is older than 90 seconds', tick);
  const wide = tickMessage(Object.assign({}, session, { windowWords: 4 }));
  ok(!wide.includes('das ist noch im Fenster') && wide.includes('und das ist neu'),
     'the word cap trims the window from the far end, keeping the newest', wide);
  const first = tickMessage(Object.assign({}, session, { lastTickAt: null }));
  ok(!first.includes('NEW:'), 'on the first call nothing is new, because there was no last call');
  const bare = tickMessage({});
  ok(typeof bare === 'string' && bare.includes('drift unknown') && bare.includes('(nothing yet)'),
     'an empty session still yields a message rather than a throw', bare);

  // ── the answer ───────────────────────────────────────────────────
  const answer = (args) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'advise', arguments: JSON.stringify(args) } }] } }] });
  const content = (s) => ({ choices: [{ message: { content: s } }] });
  const sess = { cueTargets: ['beispiel', 'kette', 'schluss'] };

  let a = parseAnswer(answer({ action: 'hint', kind: 'fact', text: 'Es waren zwei Klicks', severity: 'high', why: 'Folie sagt zwei' }), sess);
  ok(a.action === 'hint' && a.kind === 'fact' && a.severity === 'high' && a.why === 'Folie sagt zwei',
     'a forced tool call is read out of tool_calls[0]', j(a));
  a = parseAnswer(answer({ action: 'hint', kind: 'time', text: 'Zehn Minuten' }), sess);
  ok(a.severity === 'low', 'an unstated severity is low');
  a = parseAnswer(content('{"action":"nothing"}'), sess);
  ok(a.action === 'nothing' && a.reason === null, 'a model that answers in the content is still read', j(a));
  a = parseAnswer(content('```json\n{"action":"hint","kind":"delivery","text":"Langsamer sprechen"}\n```'), sess);
  ok(a.action === 'hint' && a.text === 'Langsamer sprechen', 'a fenced JSON body is unwrapped', j(a));
  ok(parseAnswer(content('Ich denke, alles gut!'), sess).reason === 'garbage',
     'prose where an object belongs is garbage');
  ok(parseAnswer(null, sess).reason === 'garbage' && parseAnswer({}, sess).reason === 'garbage',
     'so is nothing at all');
  ok(parseAnswer(answer({ action: 'hint', kind: 'fett', text: 'Ein Wort' }), sess).reason === 'garbage',
     'a kind from outside the four is garbage, not a hint');
  ok(parseAnswer(answer({ action: 'schrei', text: 'Ein Wort' }), sess).reason === 'garbage',
     'and so is an action from outside the three');
  const long = 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn';
  ok(wordCount(long) === 13 && parseAnswer(answer({ action: 'hint', kind: 'fact', text: long }), sess).reason === 'too-long',
     'thirteen words is discarded, not shortened');
  a = parseAnswer(answer({ action: 'cue', text: 'Postfach hier nennen', chunk_id: 'kette' }), sess);
  ok(a.action === 'cue' && a.chunk_id === 'kette' && a.kind === undefined,
     'a cue names an upcoming slide and carries no kind', j(a));
  ok(parseAnswer(answer({ action: 'cue', text: 'Jetzt sagen', chunk_id: 'vorgesetzter' }), sess).reason === 'bad-cue',
     'a cue for the slide the speaker is on is refused');
  ok(parseAnswer(answer({ action: 'cue', text: 'Jetzt sagen' }), sess).reason === 'bad-cue',
     'and so is one with no slide at all');

  // ── the clock ────────────────────────────────────────────────────
  ok(j(driftSeconds({ elapsed: 600, marks, idx: 0, beat: 0 })) === j({ drift: -150, rough: false }),
     'before the first mark the talk is measured against reaching it', j(driftSeconds({ elapsed: 600, marks, idx: 0, beat: 0 })));
  ok(j(driftSeconds({ elapsed: 900, marks, idx: 2, beat: 1 })) === j({ drift: 150, rough: false }),
     'after a mark the reference is that mark, and behind is positive');
  ok(driftSeconds({ elapsed: 900, marks, idx: 3, beat: 0 }).drift === 0,
     'a mark on the active slide counts once its beat is reached');
  ok(driftSeconds({ elapsed: 900, marks, idx: 3, beat: 0 }).drift === 0
     && driftSeconds({ elapsed: 900, marks: marks.slice(), idx: 2, beat: 0 }).drift === 150,
     'and not before it');
  const lin = driftSeconds({ elapsed: 600, marks: [], idx: 2, beat: 0, durationS: 2400, chunkCount: 8 });
  ok(lin.drift === 0 && lin.rough === true,
     'with no marks but a duration the plan is a straight line, and says it is rough', j(lin));
  ok(driftSeconds({ elapsed: 600, marks: [], idx: 2, beat: 0 }) === null,
     'with neither there is no plan and no answer');
  ok(driftSeconds({}) === null && driftSeconds() === null, 'and an empty call is null, not a throw');

  ok(timeHintAllowed({ drift: 100, rough: false, lastTimeHint: null, elapsed: 900 }) === true,
     '90 seconds behind is worth a word');
  ok(timeHintAllowed({ drift: 100, rough: true, lastTimeHint: null, elapsed: 900 }) === false
     && timeHintAllowed({ drift: 200, rough: true, lastTimeHint: null, elapsed: 900 }) === true,
     'the rough estimate needs twice the slack before it may speak');
  ok(timeHintAllowed({ drift: 100, rough: false, lastTimeHint: { at: 800, drift: 95 }, elapsed: 900 }) === false,
     'a second time hint needs the drift to have grown or five minutes to have passed');
  ok(timeHintAllowed({ drift: 160, rough: false, lastTimeHint: { at: 800, drift: 95 }, elapsed: 900 }) === true,
     'sixty seconds more drift is enough');
  ok(timeHintAllowed({ drift: 100, rough: false, lastTimeHint: { at: 500, drift: 95 }, elapsed: 900 }) === true,
     'and so is five minutes');
  ok(timeHintAllowed({ drift: -300, rough: false, lastTimeHint: null, elapsed: 900 }) === true
     && timeHintAllowed({ drift: -200, rough: false, lastTimeHint: null, elapsed: 900 }) === false,
     'four minutes ahead is worth a word, three are not');
  ok(timeHintAllowed({ drift: -300, rough: false, lastTimeHint: { at: 800, drift: -290 }, elapsed: 900 }) === false
     && timeHintAllowed({ drift: -300, rough: false, lastTimeHint: { at: 200, drift: -290 }, elapsed: 900 }) === true,
     'and ahead is said at most once every ten minutes');
  ok(timeHintAllowed({ drift: null }) === false && timeHintAllowed() === false,
     'no drift, no time hint');

  // ── the tick decision ────────────────────────────────────────────
  let t = shouldTick({ now: 100, lastTickAt: 90, lastTickReason: 'speech', slideChanged: true, cadence: 25 });
  ok(t.tick === true && t.reason === 'slide', 'a new slide is an occasion', j(t));
  t = shouldTick({ now: 95, lastTickAt: 90, slideChanged: true, cadence: 25 });
  ok(t.tick === false, 'but not within eight seconds of the last call – paging is not three occasions', j(t));
  t = shouldTick({ now: 200, lastTickAt: 100, speechSecondsSince: 25, newWordsSince: 8, cadence: 25 });
  ok(t.tick === true && t.reason === 'speech', 'a cadence of new speech is an occasion', j(t));
  ok(shouldTick({ now: 200, lastTickAt: 100, speechSecondsSince: 24, newWordsSince: 40, cadence: 25 }).tick === false,
     'below the cadence it is not');
  ok(shouldTick({ now: 200, lastTickAt: 100, speechSecondsSince: 60, newWordsSince: 7, cadence: 25 }).tick === false,
     'and neither is a cadence of near-silence: eight words at least');
  ok(shouldTick({ now: 200, lastTickAt: 100, speechSecondsSince: 0, newWordsSince: 0, cadence: 25 }).tick === false,
     'silence is never an occasion');
  t = shouldTick({ now: 200, lastTickAt: 100, slideChanged: true, inflight: true, cadence: 25 });
  ok(t.tick === false && t.coalesce === true && t.reason === 'slide',
     'a second occasion while one is in flight is coalesced, not sent', j(t));
  t = shouldTick({ now: 200, lastTickAt: 100, lastTickReason: 'slide', speechSecondsSince: 25, newWordsSince: 20, inflight: true, cadence: 25 });
  ok(t.reason === 'slide', 'and a coalesced slide outranks a speech occasion behind it', j(t));
  ok(shouldTick({ now: 200, lastTickAt: null, speechSecondsSince: 25, newWordsSince: 8, cadence: 25 }).tick === true,
     'the first call has no last call to wait for');

  // ── the policy, row by row ───────────────────────────────────────
  const hint = (kind, text, severity = 'low') => ({ action: 'hint', kind, text, severity });
  const ctx = (extra) => Object.assign({ now: 900, elapsedSinceOn: 900, chunkId: 'vorgesetzter', cueTargets: ['kette'], timeHintAllowed: true }, extra);

  let pol = createPolicy();
  ok(pol.judge(hint('fact', long), ctx()).reason === 'too-long',
     'policy: more than twelve words is discarded');
  ok(pol.judge(hint('fact', 'Es waren zwei'), ctx({ elapsedSinceOn: 59 })).reason === 'start-quiet',
     'policy: the first minute after switching on is silent');
  ok(pol.judge(hint('fact', 'Es waren zwei'), ctx({ elapsedSinceOn: 61 })).show === true,
     'policy: and after it the same hint passes');
  ok(pol.judge({ action: 'nothing', reason: 'garbage' }, ctx()).show === false,
     'policy: a nothing is not shown, whatever else is true');

  // `at` is twenty seconds behind ctx()'s clock: a hint holds the slot while
  // the strip could still be showing it, and the row below this block says
  // what happens once it could not.
  pol = createPolicy({ cooldown: 0 });
  pol.shown({ id: 'h1', kind: 'delivery', text: 'Langsamer sprechen', at: 880 });
  ok(pol.standing() && pol.standing().id === 'h1', 'policy: a shown hint stands until it is dismissed');
  ok(pol.judge(hint('fact', 'Andere Zahl'), ctx()).reason === 'standing',
     'policy: while one stands, a low one is discarded');
  ok(pol.judge(hint('fact', 'Andere Zahl', 'high'), ctx()).show === true,
     'policy: a high one replaces it');
  pol.dismissed('h1');
  ok(pol.standing() === null, 'policy: a dismissal clears the slot');

  // The standing slot, when nobody ever answers for what is in it. Every way
  // a hint leaves the strip sends a dismissal, so in the ordinary course this
  // arithmetic is never reached; it is here for the case where the dismissal
  // cannot arrive - the socket closed under the hint, or the page reloaded,
  // which a --watch rebuild does on every save. One lost dismissal used to
  // drop every low hint for the rest of the talk, under the reason
  // `standing`, which in the log reads exactly like the policy working.
  pol = createPolicy({ cooldown: 0 });
  pol.shown({ id: 'h1', kind: 'delivery', text: 'Langsamer sprechen', at: 100 });
  ok(pol.standing(120) && pol.standing(120).id === 'h1',
     'policy: a hint holds the slot while the strip could still be showing it');
  ok(pol.judge(hint('example', 'Nenne den Fall'), ctx({ now: 120 })).reason === 'standing',
     'policy: and a low hint waits behind it');
  ok(pol.standing(141) === null,
     'policy: past standingMax it is treated as gone – the strip fades at 25 s');
  ok(pol.judge(hint('example', 'Nenne den Fall'), ctx({ now: 141 })).show === true,
     'policy: so a lost dismissal cannot lock the slot for the rest of the talk');
  ok(pol.history().length === 1 && pol.history()[0].id === 'h1',
     'policy: the aged hint keeps its place in the history – it was said');
  ok(pol.judge(hint('example', 'Langsamer sprechen bitte'), ctx({ now: 141 })).reason === 'duplicate',
     'policy: and in the duplicate rule with it');
  pol = createPolicy({ cooldown: 0, standingMax: 5 });
  pol.shown({ id: 'h1', kind: 'delivery', text: 'Langsamer sprechen', at: 100 });
  ok(pol.standing(104) && pol.standing(110) === null,
     'policy: standingMax is an option, because the fade it matches is the cockpit\'s');
  ok(pol.standing() && pol.standing().id === 'h1',
     'policy: and standing() without a clock still answers what is in the slot');

  pol = createPolicy();
  pol.shown({ id: 'h1', kind: 'delivery', text: 'Langsamer sprechen', at: 100 });
  pol.dismissed('h1');
  ok(pol.judge(hint('example', 'Nenne den Fall'), ctx({ now: 130 })).reason === 'cooldown',
     'policy: sixty seconds of quiet after every hint');
  ok(pol.judge(hint('example', 'Nenne den Fall'), ctx({ now: 170 })).show === true,
     'policy: and then the next may come');
  ok(pol.judge(hint('fact', 'Es waren zwei', 'high'), ctx({ now: 110 })).show === true,
     'policy: except a factual slip at high severity, which cannot wait');
  ok(pol.judge(hint('fact', 'Es waren zwei'), ctx({ now: 110 })).reason === 'cooldown',
     'policy: the exception is the severity, not the kind');

  pol = createPolicy();
  pol.shown({ id: 'h1', kind: 'fact', text: 'Es waren zwei', at: 100 });
  pol.dismissed('h1');
  ok(pol.judge(hint('fact', 'Drei Klicks, nicht vier'), ctx({ now: 200 })).reason === 'kind-cooldown',
     'policy: a second fact waits two minutes, past the overall cool-down');
  ok(pol.judge(hint('fact', 'Drei Klicks, nicht vier'), ctx({ now: 230 })).show === true,
     'policy: and then it may come');

  pol = createPolicy();
  pol.shown({ id: 'h1', kind: 'example', text: 'Nenne den Fall', at: 100, chunkId: 'vorgesetzter' });
  pol.dismissed('h1');
  ok(pol.judge(hint('example', 'Das Postfach zeigen'), ctx({ now: 400 })).reason === 'example-per-chunk',
     'policy: one example hint per slide, however long ago it was');
  ok(pol.judge(hint('example', 'Das Postfach zeigen'), ctx({ now: 400, chunkId: 'beispiel' })).show === true,
     'policy: the next slide gets its own');

  pol = createPolicy();
  ['Langsamer sprechen', 'Weniger Füllwörter bitte', 'Die Frage steht noch offen'].forEach((text, i) => {
    pol.shown({ id: 'd' + i, kind: 'delivery', text, at: 100 + i * 400 });
    pol.dismissed('d' + i);
  });
  ok(pol.judge(hint('delivery', 'Ins Publikum schauen'), ctx({ now: 2000 })).reason === 'delivery-max',
     'policy: three delivery hints in a talk, and no fourth');

  pol = createPolicy();
  pol.shown({ id: 'h1', kind: 'example', text: 'Nenne das Beispiel jetzt', at: 100, chunkId: 'x' });
  pol.dismissed('h1');
  ok(pol.judge(hint('fact', 'Nenne jetzt das Beispiel'), ctx({ now: 900 })).reason === 'duplicate',
     'policy: the same words in another order are the same hint');
  ok(pol.judge(hint('fact', 'Der Vermerk lag im Postfach'), ctx({ now: 900 })).show === true,
     'policy: different words are a different hint');

  pol = createPolicy();
  ok(pol.judge(hint('time', 'Zehn Minuten über'), ctx({ timeHintAllowed: false })).reason === 'time-not-allowed',
     'policy: the clock is mentioned only when the arithmetic allows it');
  ok(pol.judge(hint('time', 'Zehn Minuten über'), ctx({ timeHintAllowed: true })).show === true,
     'policy: and then it may be');

  pol = createPolicy();
  ok(pol.judge({ action: 'cue', text: 'Postfach hier nennen', chunk_id: 'nirgends' }, ctx()).reason === 'bad-cue',
     'policy: a cue reaches only a slide in cue_targets');
  ok(pol.judge({ action: 'cue', text: 'Postfach hier nennen', chunk_id: 'kette' }, ctx()).show === true,
     'policy: one that does is laid');
  pol.shown({ id: 'c1', action: 'cue', text: 'Postfach hier nennen', chunk_id: 'kette', at: 900 });
  ok(pol.judge({ action: 'cue', text: 'Den Vermerk erwähnen', chunk_id: 'kette' }, ctx()).show === false,
     'policy: and the slide takes no second one');
  ok(pol.standing() === null,
     'policy: a cue is not a hint – it takes neither the standing slot nor the cool-down');
  ok(pol.judge(hint('fact', 'Es waren zwei'), ctx()).show === true,
     'policy: so a hint may still follow it at once');

  // ── the module's shape ───────────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'souffleuse.mjs'), 'utf8');
  const code = src.replace(/^\s*\*.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(code),
     'souffleuse.mjs imports nothing – notesToCards is injected, the way the compiler takes its leaves');
  ok(!/\b(process|fs|Buffer|crypto|setTimeout|setInterval|fetch)\b\s*[.(]/.test(code),
     'and touches no Node API, no clock and no network: the sidecar owns all three');
  const exported = [...src.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  ok(j(exported.slice().sort()) === j([
    'KINDS', 'MAX_WORDS', 'SEVERITIES', 'TOOL_SCHEMA', 'createPolicy', 'cueTargets',
    'deckPayload', 'driftSeconds', 'flattenMarks', 'parseAnswer', 'prefixHash',
    'shouldTick', 'systemPrefix', 'tickMessage', 'timeHintAllowed', 'wordCount',
  ]), 'the module exports exactly the names the sidecar reads', j(exported));
  ok(!/—/.test(src), 'en-dashes only, as in every other file here');
  ok(TOOL_SCHEMA.type === 'function' && TOOL_SCHEMA.function.name === 'advise'
     && j(TOOL_SCHEMA.function.parameters.properties.action.enum) === j(['nothing', 'hint', 'cue'])
     && j(TOOL_SCHEMA.function.parameters.properties.kind.enum) === j(KINDS)
     && j(TOOL_SCHEMA.function.parameters.properties.severity.enum) === j(SEVERITIES)
     && j(TOOL_SCHEMA.function.parameters.required) === j(['action']),
     'the tool schema is the answer vocabulary, and it is generated from the same tables');
  ok(MAX_WORDS === 12 && KINDS.length === 4, 'twelve words, four kinds');
}
