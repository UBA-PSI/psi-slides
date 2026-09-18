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
 * section here is about segments rather than cards: which `---` buys a beat,
 * which one the build drops, and whether `lint.js` says the same. That half
 * is decided by running `lint.js` over fixture decks - the one honest way to
 * ask a program with no exports what it thinks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { notesToCards, parseTimeMark, formatClock, plainInline, cueAdvance } from '../../cue-cards.mjs';
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
  ok(j(c.map(x => x.advance)) === j([0, 1, 1, 1, 2]),
     'every card behind a click is one advance further on, and a stage direction moves nothing',
     j(c.map(x => [x.bullets[0] || x.prose, x.advance])));
  ok(c[2].prose === '[Pause.]', 'the stage direction is a card of its own, as the author wrote it', j(c[2]));
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
  // A leading `---` under a heading means the heading alone is beat 0, so
  // the source's count of `---` is the deck's count of clicks. Every other
  // empty segment is dropped, and that is what `dropped-beat` names. The
  // build's own arithmetic is mirrored here by hand (`segmentsKept` lives in
  // both files), and these fixtures are what holds the two together: a
  // number the linter reports - "the chunk has N beats" - is the build's
  // number or the mirror has drifted.
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
    ['footnote',     ['## free: Schluss {#s}', '', 'Das Knirschen.', '', '---', '',
                      '::: footnote', 'eine Quelle', ':::']],
    ['twice',        ['## free: Zweimal {#t}', '', 'Eins.', '', '---', '', '---', '', 'Zwei.']],
    ['prose',        ['## free: Prosa {#p}', '', 'Eins.', '', '---', '', 'Zwei.']],
    ['fence',        ['## free: Code {#c}', '', 'Eins.', '', '---', '', '```', 'x = 1', '```']],
    ['figure',       ['## figure: Bild {#fig}', '', 'Eins.', '', '---', '', '::: draw', 'box b "x"', ':::']],
    ['cards',        ['## free: Karten {#cd}', '', 'Eins.', '', '---', '',
                      '::: cards 2', '### one', '### two', ':::']],
    ['marginalia',   ['## free: Rand {#mg}', '', 'Eins.', '', '---', '', '::: marginalia', 'am Rand', ':::']],
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
     'a leading --- under a heading is beat 0 and a from 1 note lands on beat 1', j(codes('lead-heading')));
  ok(beatsSaid('lead-beyond') === 1, 'and the chunk it counts one beat for, not none', j(of('lead-beyond')));

  // The same shape without a heading: nothing stands on beat 0, so the empty
  // opening segment is dropped and the --- is a click the deck never takes.
  ok(codes('lead-bare').includes('dropped-beat'),
     'with no heading to stand on it, that same leading --- is dropped and named', j(codes('lead-bare')));

  // An empty segment anywhere else, including one holding only an aside the
  // parser lifts out of the body.
  ok(codes('footnote').includes('dropped-beat'),
     'a --- whose segment holds only a ::: footnote buys no click either', j(codes('footnote')));
  ok(codes('twice').filter(c => c === 'dropped-beat').length === 1,
     'two --- in a row are one dropped segment and one report', j(codes('twice')));

  // And the shapes that must stay quiet, because a segment with anything the
  // build renders in it is a real beat.
  for (const [key, what] of [['prose', 'prose'], ['fence', 'a code fence'], ['figure', 'a figure'],
                             ['cards', 'a card row'], ['marginalia', 'a marginalia']]) {
    ok(!codes(key).includes('dropped-beat'),
       'a segment holding ' + what + ' is a beat and is not reported', j(codes(key)));
  }

  // The mirror itself. The rule is written twice - build.js decides it on
  // segment text, lint.js on a boolean per segment - so the texts cannot be
  // compared character for character. What can be held is that both still
  // spell all four clauses of it, and that neither file has quietly lost
  // one: the heading test, the "there is a later segment with words" test,
  // the length test and the index-0 test.
  const keptOf = (text) => (text.match(/function segmentsKept\([\s\S]*?\n\}/) || [''])[0];
  for (const [where, body] of [['build.js', keptOf(build)], ['lint.js', keptOf(lintSrc)]]) {
    ok(body && /opensOnHeading/.test(body) && /\.length > 1/.test(body)
         && /\.some\(\(t, i\) => i > 0/.test(body) && /i === 0 && lead/.test(body),
       'segmentsKept in ' + where + ' still carries all four clauses of the rule',
       body || 'segmentsKept not found');
  }
  ok(/segmentsKept\(/.test(build) && /chunkOpensOnHeading\(/.test(build)
       && /segmentsKept\(/.test(lintSrc) && /chunkOpensOnHeading\(/.test(lintSrc),
     'and both files ask it, rather than one of them deciding which segments ship on its own');
}
