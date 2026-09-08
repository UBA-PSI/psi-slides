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
 */
import fs from 'node:fs';
import path from 'node:path';
import { notesToCards, parseTimeMark, formatClock, plainInline } from '../../cue-cards.mjs';
import { ROOT } from './harness.mjs';

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
  ok(j(exported.sort()) === j(['formatClock', 'notesToCards', 'parseTimeMark', 'plainInline']),
     'the module exports exactly the four names the cockpit reads', j(exported));
}
