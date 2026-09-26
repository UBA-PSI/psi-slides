/*
 * The cue-card grammar, decided without a build.
 *
 * `cue-cards.mjs` is the one text that turns a `> note:` block into the cards
 * the cockpit shows, at build time and again in the browser when a rehearsal
 * override is typed into the textarea. This gate holds `notesToCards` and
 * the time-mark helpers to their contract on fixtures – each rule of the
 * grammar on the input that earns it – and then checks the splice: the
 * module's text reaches build.js's speaker page wrapped as
 * `window.PSI_CARDS` with every export on the returned object, and nothing
 * in it would end the template literal it is emitted next to.
 *
 * A card is filed by the reveal segment its block stood in, so the last
 * section here is about segments rather than cards: every `---` buys a beat,
 * and the question left is which one buys a beat with nothing on it and
 * whether `lint.js` says the same. That half is decided by running `lint.js`
 * over fixture decks - the one honest way to ask a program with no exports
 * what it thinks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { notesToCards, parseTimeMark, formatClock, plainInline, cueAdvance } from '../../cue-cards.mjs';
import { parseRevealMark } from '../../tails.mjs';
import { ROOT, lintSource } from './harness.mjs';

export const name = 'cue-cards: a note read as cards';

const j = (v) => JSON.stringify(v);

export async function run({ report }) {
  const { ok } = report;

  // ── one paragraph, one card ──────────────────────────────────────
  let c = notesToCards('Es ist **nicht das System**. Der Vorgesetzte **kommt nicht rein**, sagt __Frau K.__');
  ok(c.length === 1 && j(c[0].bullets) === j(['nicht das System', 'kommt nicht rein', 'Frau K.']),
     'every bold phrase is a bullet, in order, and the rest of the paragraph is dropped', j(c));
  ok(c[0].prose === null && c[0].title === null && c[0].at === null, 'a plain paragraph carries neither title nor time');

  c = notesToCards('Vermutlich. Ich habe ihn nie gesehen.');
  ok(c.length === 1 && c[0].bullets.length === 0 && c[0].prose === 'Vermutlich. Ich habe ihn nie gesehen.',
     'a paragraph without a bold is kept whole as prose', j(c));

  c = notesToCards('Erster Absatz **eins**.\n\nZweiter **zwei**.\n\n\n\nDritter **drei**.');
  ok(c.length === 3 && c.map(x => x.bullets[0]).join('|') === 'eins|zwei|drei',
     'a blank line ends a card, several blank lines still end one', j(c));

  c = notesToCards('Zeile eins **a**\nZeile zwei **b**');
  ok(c.length === 1 && j(c[0].bullets) === j(['a', 'b']), 'a soft line break stays inside the card', j(c));

  // ── lists ─────────────────────────────────────────────────────────
  c = notesToCards('- kein Kabel, **kein Server**\n* ein Mensch\n1. ein Postfach\n2) ein Vermerk');
  ok(c.length === 1 && j(c[0].bullets) === j(['kein Kabel, kein Server', 'ein Mensch', 'ein Postfach', 'ein Vermerk']),
     'a list is bullets as written, bold inside an item reduced to text', j(c));
  c = notesToCards('Einleitung ohne Bold\n- ein Punkt **fett**');
  ok(c.length === 1 && j(c[0].bullets) === j(['fett']),
     'a paragraph that is only partly a list is a paragraph: bolds win', j(c));

  // ── titles and time marks ────────────────────────────────────────
  c = notesToCards('#### Zweiter Klick\nSekretärin **Frau K.**');
  ok(c.length === 1 && c[0].title === 'Zweiter Klick' && j(c[0].bullets) === j(['Frau K.']),
     'a heading line titles the card it opens', j(c));
  c = notesToCards('## Titel allein\n\nDann **Text**');
  ok(c.length === 1 && c[0].title === 'Titel allein', 'a heading in a paragraph of its own titles the next card', j(c));
  c = notesToCards('#### Nur ein Titel');
  ok(c.length === 0, 'a title with no card after it is not a card', j(c));

  c = notesToCards('@14:30 Sekretärin **Frau K.**');
  ok(c.length === 1 && c[0].at === 870 && j(c[0].bullets) === j(['Frau K.']),
     'a time mark at the paragraph start belongs to that card and leaves the words', j(c));
  c = notesToCards('@15:00\n\n**kein Server**\n\n**Vermerk**');
  ok(c.length === 2 && c[0].at === 900 && c[1].at === null,
     'a time mark alone applies to the next card only', j(c));
  c = notesToCards('@1:02:30\n**spät**');
  ok(c[0].at === 3750, 'h:mm:ss is read', j(c));
  c = notesToCards('12:30 Uhr ist **spät**');
  ok(c[0].at === null && j(c[0].bullets) === j(['spät']), 'a clock time without @ is words, not a mark', j(c));
  c = notesToCards('#### Titel\n@3:00\n**Text**');
  ok(c[0].title === 'Titel' && c[0].at === 180, 'title and mark may stack above one card', j(c));

  // ── a click is a beat ─────────────────────────────────────────────
  // The keynote case: nine stage directions of the shape [Klick: ...] and
  // not one `from N`, so before this the whole block was one card set on
  // the opening beat and the lecturer counted presses by hand.
  ok(j(cueAdvance('[Klick auf dem Bauplan: Zeile 1 wird hell.]')) === j({ title: 'Zeile 1 wird hell' }),
     'a click names what it does: everything behind the first colon, the full stop off',
     j(cueAdvance('[Klick auf dem Bauplan: Zeile 1 wird hell.]')));
  ok(j(cueAdvance('[Klick: der Diagrammsatz erscheint.]')) === j({ title: 'der Diagrammsatz erscheint' }),
     'with the colon straight after the word too');
  ok(j(cueAdvance('[Klick.]')) === j({ title: '' }) && j(cueAdvance('[Klick]')) === j({ title: '' }),
     'a click that says only that there is one has no words to give', j(cueAdvance('[Klick.]')));
  ok(cueAdvance('[Pause.]') === null && cueAdvance('[Pause. Lachen abwarten.]') === null
     && cueAdvance('[Den Satz stehen lassen.]') === null,
     'any other bracketed line is a stage direction, not a press');
  ok(cueAdvance('[Klicken Sie auf den Link]') === null,
     'and the first word has to BE the word - a longer one that starts with it is prose');
  ok(cueAdvance('Klick: ohne Klammern') === null && cueAdvance('Dann [Klick: mitten im Satz] weiter') === null,
     'a click stands alone on its line, inside brackets, or it is words');

  // localisation: a fixed set, not a STRINGS entry - notesToCards runs in
  // the browser over a rehearsal override, where no wording table is in
  // reach, and lint.js has none at all.
  ok(j(cueAdvance('[Click: the grid fills.]')) === j({ title: 'the grid fills' }), 'Click is the English spelling');
  ok(j(cueAdvance('[CLICK: shouting]')) === j({ title: 'shouting' }) && j(cueAdvance('[klick: leise]')) === j({ title: 'leise' }),
     'and the case of the word does not matter');
  ok(j(cueAdvance('[> la colonne de droite s\'allume]')) === j({ title: "la colonne de droite s'allume" }),
     'a bare > is the spelling for every language the list has no word for',
     j(cueAdvance('[> la colonne de droite s\'allume]')));

  // the arithmetic: each click moves every card behind it one advance on
  c = notesToCards('**null**\n\n[Klick: Zeile 1 wird hell.]\n\n**eins**\n\n[Pause.]\n\n**auch eins**\n\n[Klick: Zeile 2.]\n\n**zwei**');
  ok(j(c.map(x => x.advance)) === j([0, 1, 1, 2]),
     'every card behind a click is one advance further on, and a stage direction moves nothing',
     j(c.map(x => [x.bullets[0] || x.prose, x.advance])));
  ok(j(c[1].tail) === j(['[Pause.]']) && c.every(x => !x.stage),
     'the stage direction rides the card before it, as the author wrote it, and costs no card', j(c[1]));
  ok(c[1].title === 'Zeile 1 wird hell' && c[2].title === null,
     'the click titles the card after it, and only that one', j(c.map(x => x.title)));

  c = notesToCards('[Klick: die Antwort ist gefallen.]\n\n**eins**');
  ok(c.length === 1 && c[0].advance === 1, 'a block that opens with a click starts on the next advance', j(c));
  c = notesToCards('**eins**\n\n[Klick: nichts mehr danach.]');
  ok(c.length === 1 && c[0].advance === 0, 'a click with nothing behind it makes no card', j(c));

  c = notesToCards('#### Bauplan\n**eins**\n\n[Klick: Zeile 2 wird hell.]\n\n**zwei**');
  ok(c[0].title === 'Bauplan' && c[1].title === 'Zeile 2 wird hell',
     'a heading titles its own card and the click the one after it', j(c.map(x => x.title)));
  c = notesToCards('#### Bauplan\n\n[Klick: Zelle oben links.]\n\n**eins**');
  ok(c.length === 1 && c[0].advance === 1 && c[0].title === 'Zelle oben links',
     'where both stand above one card the nearer wins, which is the one read last', j(c));
  c = notesToCards('[Klick: Zelle oben links.]\n\n#### Bauplan\n**eins**');
  ok(c[0].title === 'Bauplan', 'and the other way round it is the heading', j(c));
  c = notesToCards('[Klick: weiter.]\n@2:30\n**eins**');
  ok(c[0].advance === 1 && c[0].at === 150 && c[0].title === 'weiter',
     'a click, a mark and the words may stack above one card', j(c));
  c = notesToCards('[Klick: eins.]\n[Klick: zwei.]\n\n**drei**');
  ok(c.length === 1 && c[0].advance === 2 && c[0].title === 'zwei',
     'two clicks in one paragraph are two advances', j(c));

  // ── a stage direction is not a card ──────────────────────────────
  // A keynote written out word for word carries nineteen [Pause ...] lines,
  // and each was a card: a press on which the speaker says nothing and the
  // room sees nothing. A direction is read, not said, so it rides a card.
  const words = (x) => x.bullets.length ? x.bullets.join('|') : x.prose;
  c = notesToCards('**Fifteen times faster.**\n\n**[Pause. Let the number sit.]**\n\nThe talk is about **where it went**.');
  ok(c.length === 2 && j(c[0].tail) === j(['[Pause. Let the number sit.]']) && j(c[1].lead) === j([]),
     'a paragraph that is only a direction rides the card before it - a pause after words - bold or not', j(c));
  c = notesToCards('[Lachen abwarten.]\n\n**eins**\n\n**zwei**');
  ok(c.length === 2 && j(c[0].lead) === j(['[Lachen abwarten.]']) && c[0].advance === 0,
     'a note that opens with one: it leads the first card', j(c));
  c = notesToCards('**eins**\n\n[Klick: Zeile 2.]\n\n[Pause.]\n\n**zwei**');
  ok(c.length === 2 && j(c[0].tail) === j([]) && j(c[1].lead) === j(['[Pause.]']) && c[1].advance === 1,
     'one written after a click leads the card after it, on the click\'s advance, not the card before it', j(c));
  c = notesToCards('**eins**\n\n[Pause.]\n[Klick: Zeile 2.]\n**zwei**');
  ok(c.length === 2 && j(c[0].tail) === j(['[Pause.]']) && c[1].advance === 1 && c[1].title === 'Zeile 2',
     'a direction above a click in one paragraph is settled on the advance it stood on, and the click still counts', j(c));
  c = notesToCards('[Pause.]\nDer Satz, **fett**.\n[Den Satz stehen lassen.]');
  ok(c.length === 1 && j(c[0].bullets) === j(['fett']) && j(c[0].lead) === j(['[Pause.]'])
     && j(c[0].tail) === j(['[Den Satz stehen lassen.]']),
     'a direction at the head or foot of a paragraph is that card\'s, and a bold beside it no longer drops it', j(c));
  c = notesToCards('**a**\n\n[Pause.]\n\n[Lachen abwarten.]');
  ok(c.length === 1 && j(c[0].tail) === j(['[Pause.]', '[Lachen abwarten.]']), 'two in a row ride one card, in order', j(c));
  c = notesToCards('[Pause.]');
  ok(c.length === 1 && c[0].stage === true && c[0].prose === '[Pause.]',
     'a note that is a direction and nothing else is still a card, marked as a direction - nothing disappears', j(c));
  c = notesToCards('**eins**\n\n[Klick: weiter.]\n\n[Pause.]');
  ok(c.length === 2 && c[1].stage && c[1].advance === 1 && j(c[0].tail) === j([]),
     'and so is one behind a click with nothing after it: it stays on its own advance', j(c));
  c = notesToCards('Ein [Wort] in Klammern **mitten** im Satz');
  ok(c.length === 1 && j(c[0].bullets) === j(['mitten']) && j(c[0].lead) === j([]),
     'a bracket inside a sentence is words, not a direction', j(c));
  ok(notesToCards('[Klick: eins.]\n\n**x**')[0].lead.length === 0, 'and a click is never taken for one');
  // Nothing an author wrote leaves the card: every word of the note, less
  // the syntax and the clicks, is on some card, in order.
  {
    const note = '[Vorweg.]\n\nSatz **eins**.\n\n[Pause.]\n\n[Klick: zwei.]\n\n[Luft holen.]\n\nSatz **zwei**.\n[Lachen abwarten.]';
    const flat = notesToCards(note).flatMap(x => [...x.lead, words(x), ...x.tail]);
    ok(j(flat) === j(['[Vorweg.]', 'eins', '[Pause.]', '[Luft holen.]', 'zwei', '[Lachen abwarten.]']),
       'every direction is on a card, in the order it was written', j(flat));
  }

  // ── inline reduction ─────────────────────────────────────────────
  ok(plainInline('siehe [Quelle](http://x) und `code` und *em* und __b__ und a_b_c') === 'siehe Quelle und code und em und b und a_b_c',
     'links, code, emphasis reduce to their text; an underscore inside a word stays', plainInline('siehe [Quelle](http://x) und `code` und *em* und __b__ und a_b_c'));
  ok(plainInline('a\\*b\\*  c') === 'a*b* c', 'a backslash escape is unescaped and runs of space collapse');
  c = notesToCards('**Frau *K.* genehmigt**');
  ok(j(c[0].bullets) === j(['Frau K. genehmigt']), 'emphasis inside a bold is reduced too', j(c));

  // ── edges ─────────────────────────────────────────────────────────
  ok(notesToCards('').length === 0 && notesToCards(null).length === 0 && notesToCards('\n\n \n').length === 0,
     'empty, null and whitespace give no cards');
  ok(notesToCards('a\r\n\r\nb **c**').length === 2, 'CRLF is a line ending');

  // ── the helpers ──────────────────────────────────────────────────
  ok(parseTimeMark('@12:30') === 750 && parseTimeMark('12:30') === 750 && parseTimeMark('1:02:30') === 3750,
     'parseTimeMark reads mm:ss and h:mm:ss with or without @');
  ok(parseTimeMark('') === null && parseTimeMark('12') === null && parseTimeMark('12:3') === null,
     'and refuses what is not a mark');
  ok(formatClock(750) === '12:30' && formatClock(3750) === '1:02:30' && formatClock(-95) === '-1:35' && formatClock(5) === '0:05',
     'formatClock is mm:ss, h:mm:ss above an hour, signed');

  // ── the splice ───────────────────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'cue-cards.mjs'), 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/\b(require|process|fs)\b\s*[.(]/.test(src.replace(/^\s*\*.*$/gm, '')),
     'cue-cards.mjs imports nothing and touches no Node API');
  const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  ok(/window\.PSI_CARDS = \(function \(\)/.test(build) && /\$\{cueCardsJs\(\)\}/.test(build),
     'build.js wraps the module as window.PSI_CARDS and emits it into the speaker page');
  const exported = [...src.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  ok(j(exported.sort()) === j(['cueAdvance', 'formatClock', 'notesToCards', 'parseTimeMark', 'plainInline']),
     'the module exports exactly the five names the cockpit reads', j(exported));
  // lint.js imports the click test rather than spelling the regex a second
  // time - the bend tails.mjs already rides, and for the same reason: two
  // spellings are how the linter comes to count something the cards do not.
  const lintSrc = fs.readFileSync(path.join(ROOT, 'lint.js'), 'utf8');
  ok(/import \{ cueAdvance \} from '\.\/cue-cards\.mjs'/.test(lintSrc) && /cueAdvance\(/.test(lintSrc),
     'lint.js reads a click through cueAdvance rather than spelling the test a second time');

  // ── which --- buys a beat ────────────────────────────────────────
  // Every one of them does: the source's count of separators is the deck's
  // count of clicks, empty segment or not. What an empty one is for is the
  // point of most of these fixtures - a footnote arriving with the click it
  // belongs to, a note the speaker says while the slide stands, a backdrop
  // moving to its next place, a card held by `from`. What is left to report
  // is a click on which nothing at all happens, and that is `empty-beat`.
  // The build's own arithmetic is mirrored here by hand (`segmentsKept`
  // lives in both files), and these fixtures are what holds the two
  // together: a number the linter reports - "the chunk has N beats" - is the
  // build's number or the mirror has drifted.
  // Every fixture in one deck and one `lint.js` run, bucketed back by line
  // span - the arrangement `lintAll` uses for the figure gates, for the same
  // reason: a gate that spawns a process per case stops being a gate.
  // Deck-wide findings (title-count on a deck with no title chunk,
  // reveal-overuse on a deck that is all reveals) land outside every span
  // and are ignored, which is what makes a fixture deck this small readable.
  const FIX = [
    ['lead-heading', ['## question: Wie viele? {#q}', '', '---', '', 'Eine. Vielleicht zwei.', '',
                      '> note: from 1', '> die Antwort.']],
    ['lead-beyond',  ['## question: Wie viele denn? {#q2}', '', '---', '', 'Eine.', '',
                      '> note: from 4', '> zu weit.']],
    ['lead-bare',    ['## free: {#f}', '', '---', '', 'Eine.']],
    ['count',        ['## free: Zweimal gezaehlt {#n}', '', 'Eins.', '', '---', '',
                      '::: footnote', 'eine Quelle', ':::', '', '---', '', 'Zwei.', '',
                      '> note: from 9', '> zu weit.']],
    ['footnote',     ['## free: Schluss {#s}', '', 'Das Knirschen.', '', '---', '',
                      '::: footnote', 'eine Quelle', ':::']],
    ['note',         ['## free: Weitersprechen {#w}', '', 'Das Knirschen.', '', '---', '',
                      '> note: und jetzt der Befund.']],
    ['overlay',      ['## free: Karte {#ov}', '', 'Eins.', '', '---', '',
                      '::: overlay {.bottom-left} from 1', 'die Karte', ':::']],
    ['dock',         ['## free: Leiste {#dk}', '', 'Eins.', '', '---', '',
                      '::: dock {.bottom} from 1', 'die Leiste', ':::']],
    ['backdrop',     ['## free: Bild {#bd}', '', 'Eins.', '', '---', '',
                      '::: backdrop photo {.cover} reveal none, full']],
    ['twice',        ['## free: Zweimal {#t}', '', 'Eins.', '', '---', '', '---', '', 'Zwei.']],
    ['trailing',     ['## free: Ende {#e}', '', 'Eins.', '', '---']],
    ['prose',        ['## free: Prosa {#p}', '', 'Eins.', '', '---', '', 'Zwei.']],
    ['fence',        ['## free: Code {#c}', '', 'Eins.', '', '---', '', '```', 'x = 1', '```']],
    ['figure',       ['## figure: Bild {#fig}', '', 'Eins.', '', '---', '', '::: draw', 'box b "x"', ':::']],
    ['cards',        ['## free: Karten {#cd}', '', 'Eins.', '', '---', '',
                      '::: cards 2', '### one', '### two', ':::']],
    ['marginalia',   ['## free: Rand {#mg}', '', 'Eins.', '', '---', '', '::: marginalia', 'am Rand', ':::']],
    // The one chunk whose separators buy nothing: renderTitleChunk draws a
    // cover from `body`, which is the segments joined, so a `---` there
    // leaves no <hr>, no .reveal-segment and no click.
    ['cover',        ['## title: {#tt}', '', 'Eins.', '', '---', '', 'Zwei.', '',
                      '> note: from 1', '> zu weit.']],
  ];
  const deck = ['---', 'title: Beat fixtures', '---', ''];
  const span = new Map();
  for (const [key, lines] of FIX) {
    const start = deck.length + 1;
    deck.push(...lines, '');
    span.set(key, [start, deck.length]);
  }
  const found = lintSource(deck.join('\n'));
  const of = (key) => { const [s, e] = span.get(key); return found.filter(f => f.line >= s && f.line <= e); };
  const codes = (key) => of(key).map(f => f.rule);
  // `> note: from N` past the last beat is the probe: the linter refuses it
  // by name and its message says how many beats it counted.
  const beatsSaid = (key) => {
    const m = /has (no beats|one beat|(\d+) beats)/.exec(of(key).map(f => f.msg).join(' '));
    return m ? (m[2] ? +m[2] : m[1] === 'one beat' ? 1 : 0) : null;
  };

  ok(!codes('lead-heading').length,
     'a leading --- is beat 0 and a from 1 note lands on beat 1', j(codes('lead-heading')));
  ok(beatsSaid('lead-beyond') === 1, 'and the chunk it counts one beat for, not none', j(of('lead-beyond')));
  // The same shape with no heading: the slide opens blank and paints its
  // body on the first press, which is a composition rather than a mistake.
  ok(!codes('lead-bare').length,
     'a leading --- without a heading opens the slide blank and is quiet too', j(codes('lead-bare')));
  // The count itself: two separators, the first of them holding only a
  // footnote, and the linter says two beats rather than one.
  ok(beatsSaid('count') === 2,
     'a --- whose segment holds only an aside is still counted as a beat', j(of('count')));
  // And the chunk where the count is zero however many separators are
  // written: a cover renders none of them, so a `from 1` note there is filed
  // on an advance the slide never reaches. The linter counted the positions
  // and said "one beat", which is the build's number for every chunk but
  // this one.
  ok(beatsSaid('cover') === 0,
     'a --- in a title: chunk buys no beat, because the cover renders no segments',
     j(of('cover')));

  // The four things that ride a beat without painting a word on it. Each of
  // these is a shape the corpus writes on purpose.
  for (const [key, what] of [['footnote', 'a ::: footnote written under it'],
                             ['note', 'a > note: filed on it'],
                             ['overlay', 'an overlay held to it by from'],
                             ['dock', 'a dock held to it by from'],
                             ['backdrop', 'a backdrop reveal place for it']]) {
    ok(!codes(key).includes('empty-beat'),
       'a --- with ' + what + ' buys a click and is not reported', j(codes(key)));
  }

  // And the shape that is left: a click on which nothing whatever happens.
  ok(codes('twice').filter(c => c === 'empty-beat').length === 1,
     'two --- in a row are one beat with nothing on it and one report', j(codes('twice')));
  ok(codes('trailing').includes('empty-beat'),
     'and a --- with nothing after it at all is the same report', j(codes('trailing')));

  // The shapes that must stay quiet, because a segment with anything the
  // build renders in it is a beat that paints.
  for (const [key, what] of [['prose', 'prose'], ['fence', 'a code fence'], ['figure', 'a figure'],
                             ['cards', 'a card row'], ['marginalia', 'a marginalia']]) {
    ok(!codes(key).includes('empty-beat'),
       'a segment holding ' + what + ' is a beat and is not reported', j(codes(key)));
  }

  // The mirror itself. The rule is written twice - build.js decides it on
  // segment text, lint.js on a boolean per segment - so the texts cannot be
  // compared character for character. What can be held is that both still
  // spell both clauses of it, and that neither file has quietly lost one:
  // the "there is a separator at all" test and the cover-slide test.
  const keptOf = (text) => (text.match(/function segmentsKept\([\s\S]*?\n\}/) || [''])[0];
  for (const [where, body] of [['build.js', keptOf(build)], ['lint.js', keptOf(lintSrc)]]) {
    ok(body && /rendersSegments/.test(body) && /\.length < 2/.test(body) && /=> true/.test(body),
       'segmentsKept in ' + where + ' still carries both clauses of the rule',
       body || 'segmentsKept not found');
  }
  ok(/segmentsKept\(/.test(build) && /chunkRendersSegments\(/.test(build)
       && /segmentsKept\(/.test(lintSrc) && /chunkRendersSegments\(/.test(lintSrc),
     'and both files ask it, rather than one of them deciding which segments ship on its own');

  // ── which beat a note is filed on ────────────────────────────────
  // `noteSegments` is inside build.js, which imports `marked` and Shiki and
  // is therefore not importable from a gate whose selling point is that it
  // needs neither. So it is lifted out as text with the three functions it
  // stands on and run here - the move `test/settings.mjs` makes for
  // `splitSentencesIn`, and for the same reason: a contract drifts visibly,
  // an arithmetic silently.
  const lift = (name) => (build.match(new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm')) || [''])[0];
  const lifted = ['segmentsKept', 'chunkRendersSegments', 'segmentIndexer', 'noteSegments'].map(lift);
  ok(lifted.every(Boolean), 'the four functions the filing rule is made of are where the gate looks for them',
     j(lifted.map((t, i) => t ? 'ok' : i)));
  const noteSegments = new Function('parseRevealMark',
    lifted.join('\n\n') + '\nreturn noteSegments;')(parseRevealMark);
  const segmentsKeptOf = new Function(lifted[0] + '\nreturn segmentsKept;')();

  // The parser's own split, in the few lines this gate needs of it: a chunk
  // body with its `> note:` blocks peeled off (they never reach `bodyLines`,
  // which is why a note's position is an index rather than a line), the raw
  // segments, and what `segmentsKept` - the lifted one - answers for them.
  // Fence-aware splitting is `segmentIndexer`'s business and it reads the
  // body itself, so there is none here.
  const fileNotes = (lines, rendersSegments = true) => {
    const bodyLines = [];
    const noteAt = [];
    for (const l of lines) {
      if (/^>\s*note:/.test(l)) { noteAt.push(bodyLines.length); continue; }
      bodyLines.push(l);
    }
    const segments = [];
    let cur = [];
    for (const l of bodyLines) {
      if (parseRevealMark(l)) { segments.push(cur.join('\n').trim()); cur = []; continue; }
      cur.push(l);
    }
    if (cur.length) segments.push(cur.join('\n').trim());
    return noteSegments(bodyLines, segments, noteAt, segmentsKeptOf(segments, rendersSegments));
  };

  // The legacy shape, and the one the rule was written for: notes behind the
  // last segment's text, no separator after them.
  ok(j(fileNotes(['Eins.', '', '---', '', 'Zwei.', '', '> note: der Befund.'])) === j([0]),
     'a note behind the last segment is a chunk note and is said on beat 1',
     j(fileNotes(['Eins.', '', '---', '', 'Zwei.', '', '> note: der Befund.'])));

  // The same chunk with a trailing `---` - the slide standing while the
  // speaker says the next thing. Every `---` ships since "every --- is a
  // beat", so the last segment that SHIPS is the empty one; measured against
  // that, this note was filed on beat 2 and the lecturer lost her support
  // until after the last click. Nothing warned. The rule reads the last
  // segment with WORDS in it instead.
  const trailing = ['Eins.', '', '---', '', 'Zwei.', '', '> note: der Befund.', '', '---', ''];
  ok(j(fileNotes(trailing)) === j([0]),
     'and a trailing --- behind it does not move it - the rule counts words, not segments',
     j(fileNotes(trailing)));
  const trailingThree = ['Eins.', '', '---', '', 'Zwei.', '', '---', '', 'Drei.', '', '> note: alles.', '', '---', ''];
  ok(j(fileNotes(trailingThree)) === j([0]), 'three segments and a trailing --- likewise', j(fileNotes(trailingThree)));

  // What reading it off the words costs, and it is the answer the shape asks
  // for: a note standing alone behind a `---` is no longer in the last
  // segment, so it keeps its position and is said on the beat the separator
  // opens - which is what the author wrote the separator for.
  const alone = ['Eins.', '', '---', '', '> note: und jetzt der Befund.', ''];
  ok(j(fileNotes(alone)) === j([1]),
     'a note alone behind a --- is said on the beat that --- opens, not on beat 1', j(fileNotes(alone)));

  // The moment one note stands earlier, the author is using positions and
  // the fallback is off for the whole chunk - including for the note in the
  // last segment.
  const positional = ['Eins.', '', '> note: zuerst.', '', '---', '', 'Zwei.', '', '> note: dann.', ''];
  ok(j(fileNotes(positional)) === j([0, 1]),
     'one note in an earlier segment turns the fallback off for the chunk', j(fileNotes(positional)));

  // A chunk with no separator has one segment, where both readings fall
  // together, and a cover renders no segments at all.
  ok(j(fileNotes(['Eins.', '', '> note: eine.'])) === j([0]), 'a chunk without a --- files its note on beat 1');
  ok(j(fileNotes(['Eins.', '', '---', '', 'Zwei.', '', '> note: eine.'], false)) === j([0]),
     'and a cover chunk, whose separators buy no beat, does the same');
}
