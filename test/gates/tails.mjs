/*
 * The shared tail grammar, decided without a build.
 *
 * `tails.mjs` is the one parser build.js and lint.js both read a `{…}` tail
 * and a `::: draw` opener through, so a defect here is a defect in both at
 * once - and both of them only ever see it through their adapters, which
 * throw on the first problem or report each under its code. This gate holds
 * the parser to its contract directly: every code it can emit, on the input
 * that earns it; the written-default rule that lets `::: side {.top}` mean
 * nothing; which slot a word shared between two defaults marks as written;
 * and the formatter round trip that the editor's payload and the migration
 * both rely on. The adapter half - that build.js refuses what the parser
 * refuses and lint.js names the same code - is `test/settings.mjs`.
 */
import {
  CHUNK_SLOTS, CARDS_SLOTS, SIDE_SLOTS, OVERLAY_SLOTS, BACKDROP_SLOTS, SLOT_TABLES,
  splitTail, parseTail, parseDrawOpener, formatDrawOpener, drawCompilerAttrs, parseLegacyDrawTail,
  AUTOPLAY_MIN, AUTOPLAY_MAX, DRAW_OPENER_EXAMPLE,
} from '../../tails.mjs';
import { render } from './harness.mjs';
import { migrateText, isActiveSurface, LEGACY_TOKENS } from '../../tools/migrate-draw-opener.mjs';

export const name = 'tails: one {…} parser and one ::: draw opener';

const codes = (t) => t.problems.map(p => p.code).join(',');

export async function run({ report }) {
  const { ok } = report;

  // ── splitTail ────────────────────────────────────────────────────
  ok(JSON.stringify(splitTail('Heading {.wide #id}')) === JSON.stringify({ text: 'Heading', tail: '.wide #id' }),
     'splitTail separates prose from the brace contents');
  ok(splitTail('Heading').tail === null, 'and answers null when there are no braces');
  ok(splitTail('Heading {}').tail === '', 'and the empty string when the author wrote {}');
  ok(splitTail('type: A | B {.wide #id}').text === 'type: A | B', 'a sub-heading bar is prose, not a tail');

  // ── parseTail: the four codes ────────────────────────────────────
  const heading = (tail) => parseTail(tail, CHUNK_SLOTS, 'chunk heading', { id: 'one' });
  const side = (tail) => parseTail(tail, SIDE_SLOTS, '::: side');
  const cards = (tail) => parseTail(tail, CARDS_SLOTS, '::: cards');
  const rows = [
    // [caller, tail, expected codes]
    ['heading', 'wide #a',          'stray-attribute'],
    ['heading', '.foo #a',          'unknown-class'],
    ['heading', '.wide .full #a',   'same-slot'],
    ['heading', '.wide .wide #a',   'same-slot'],
    ['heading', '.wrap-none .wrap-balance #a', 'same-slot'],
    ['heading', '#a #b',            'multiple-ids'],
    ['heading', '',                 'stray-attribute'],
    ['heading', '   ',              'stray-attribute'],
    ['side',    'middle',           'stray-attribute'],
    ['side',    '.sideways',        'unknown-class'],
    ['side',    '.top .middle',     'same-slot'],
    ['side',    '#x',               'stray-attribute'],
    ['side',    '',                 'stray-attribute'],
    ['cards',   '.auto .large',     'same-slot'],
    ['cards',   '.auto .left',      ''],
    ['cards',   '.veil',            ''],
    ['heading', '.wide .bare .wrap-none #a', ''],
    ['heading', null,               ''],
    ['side',    undefined,          ''],
  ];
  for (const [who, tail, want] of rows) {
    const t = ({ heading, side, cards })[who](tail);
    ok(codes(t) === want, `${who} {${tail}} → ${want || 'no problem'}`, `got ${codes(t) || 'none'}: ${t.problems.map(p => p.msg).join(' | ')}`);
  }
  // No slot may invent a spelling for a flag's default.
  for (const w of ['.shown', '.left', '.top']) {
    ok(codes(heading(`${w} #a`)) === 'unknown-class', `${w} on a chunk heading is unknown-class`);
  }
  // The message names the tail and, for a word from no slot, the vocabulary.
  ok(/^::: side: "\.sideways" is not a word this directive knows - anchor: \.top \| \.middle$/.test(side('.sideways').problems[0].msg),
     'the unknown-class message names the directive and lists its slots');
  ok(/^chunk heading: "wide" is not a \.class or an #id\. .*\{\.wide\}$/.test(heading('wide #a').problems[0].msg),
     'the stray-attribute message spells the token with its dot');
  ok(/both answer "anchor"/.test(side('.top .middle').problems[0].msg), 'the same-slot message names the slot');
  ok(/takes no id/.test(side('#x').problems[0].msg), 'an id on a directive says the directive takes none');
  ok(/Remove them/.test(side('').problems[0].msg), 'empty braces are told to go');

  // ── the result shape ─────────────────────────────────────────────
  const t = heading('.bare .wide #a');
  ok(JSON.stringify(t.classes) === '["bare","wide"]', 'classes come back in written order, dots stripped');
  ok(t.id === 'a' && JSON.stringify(t.ids) === '["a"]', 'the first #id is the id');
  ok(t.slots.width.value === 'wide' && t.slots.width.written === true, 'a written slot carries its word and written: true');
  ok(t.slots.wrap.value === null && t.slots.wrap.written === false, 'an unwritten slot carries its default and written: false');
  ok(t.slots.bare.value === 'bare' && t.slots.center.value === false, 'a flag resolves to its word when written and to false when not');
  ok(heading('#a #b').id === 'a' && heading('#a #b').ids.length === 2, 'multiple-ids keeps the first id and records both');
  ok(heading('.foo #a').id === 'a', 'a problem does not stop the rest of the tail from being read');
  // The contract: every written .word, known or not, so a caller's own
  // contextual check (class on a column heading, width on a cover chunk)
  // sees what the author wrote.
  ok(JSON.stringify(heading('.foo #a').classes) === '["foo"]', 'an unknown class is still recorded in classes');
  ok(JSON.stringify(heading('.wide .full #a').classes) === '["wide","full"]', 'and so is the second answer to one slot');
  ok(JSON.stringify(heading('.wide .wide #a').classes) === '["wide","wide"]', 'and a repeated word, twice');

  // ── the written-default rule ─────────────────────────────────────
  const top = side('.top');
  ok(!top.problems.length && top.slots.anchor.value === 'top' && top.slots.anchor.written === true,
     '::: side {.top} is legal: the default, written');
  ok(side(null).slots.anchor.written === false, 'and a bare ::: side has it unwritten');
  const auto = cards('.auto .left');
  ok(auto.slots.size.written === true && auto.slots.align.written === true && auto.slots.align.value === 'left',
     '.auto marks the first slot that lists it (size), so .left can still answer align');
  ok(cards('.auto').slots.align.written === false, 'and .auto alone leaves align unwritten');

  // ── the tables ───────────────────────────────────────────────────
  for (const [name, table] of Object.entries(SLOT_TABLES)) {
    for (const [slot, spec] of Object.entries(table)) {
      ok(Array.isArray(spec.words) && spec.words.length > 0 && 'default' in spec, `${name}.${slot} has words and a default`);
      if (typeof spec.default === 'string') ok(spec.words.includes(spec.default), `${name}.${slot}: a string default is one of its words`);
    }
  }
  ok(OVERLAY_SLOTS.ground.words.includes('glass') && BACKDROP_SLOTS.layer.words.includes('over'), 'the overlay and backdrop tables are the ones the renderers read');

  // ── parseDrawOpener ──────────────────────────────────────────────
  ok(parseDrawOpener('prose') === null && parseDrawOpener('::: drawing') === null && parseDrawOpener(':::draw') === null,
     'null for a line that is not a draw opener');
  ok(parseDrawOpener('::: draw{unit=150x56}') !== null, 'but the old opener written without a space is an opener, refused rather than dropped');
  const valid = [
    ['::: draw',                               { unit: null, autoplay: null, cycle: false }],
    ['::: draw 150x56',                        { unit: '150x56', autoplay: null, cycle: false }],
    ['::: draw autoplay 900',                  { unit: null, autoplay: 900, cycle: false }],
    ['::: draw 150x56 autoplay 1200 cycle',    { unit: '150x56', autoplay: 1200, cycle: true }],
    ['::: draw autoplay 200 cycle',            { unit: null, autoplay: 200, cycle: true }],
    ['::: draw   150x56   autoplay  60000  ',  { unit: '150x56', autoplay: 60000, cycle: false }],
  ];
  for (const [line, want] of valid) {
    const o = parseDrawOpener(line);
    const got = o && { unit: o.unit, autoplay: o.autoplay, cycle: o.cycle };
    ok(o && !o.problems.length && JSON.stringify(got) === JSON.stringify(want), `${line.trim()} parses`, JSON.stringify(o));
    ok(formatDrawOpener(want) === line.trim().replace(/\s+/g, ' '), `and formats back to itself`);
  }
  const refused = [
    ['::: draw {unit=150x56}',              'stray-attribute', /Write  ::: draw 150x56$/],
    ['::: draw {unit=150x56 autoplay=1400 cycle}', 'stray-attribute', /::: draw 150x56 autoplay 1400 cycle/],
    ['::: draw {unit=150x56 #x}',           'stray-attribute', /#id was diagnostic only/],
    ['::: draw {}',                         'stray-attribute', null],
    ['::: draw unit=150x56',                'stray-attribute', /::: draw 150x56/],
    ['::: draw autoplay=900',               'stray-attribute', /autoplay 900/],
    ['::: draw 150x56 foo',                 'stray-attribute', null],
    ['::: draw autoplay 900 150x56',        'stray-attribute', /grid comes first/],
    ['::: draw 150X56',                     'bad-unit', null],
    ['::: draw 150×56',                     'bad-unit', null],
    ['::: draw 0x56',                       'bad-unit', null],
    ['::: draw 150x56 autoplay x',          'bad-autoplay', null],
    ['::: draw 150x56 autoplay',            'bad-autoplay', null],
    ['::: draw 150x56 autoplay 199',        'bad-autoplay', null],
    ['::: draw 150x56 autoplay 60001',      'bad-autoplay', null],
    ['::: draw 150x56 cycle',               'bad-autoplay', /no autoplay to repeat/],
    ['::: draw{unit=150x56}',               'stray-attribute', /Write  ::: draw 150x56$/],
    ['::: draw {unit=0x56}',                'stray-attribute', /zero side/],
    ['::: draw {autoplay=900 autoplay=1200}', 'stray-attribute', /writes autoplay twice/],
    ['::: draw autoplay 900 autoplay 1200', 'stray-attribute', /"autoplay" is written twice/],
    ['::: draw 150x56 cycle cycle',         'bad-autoplay', null],
  ];
  for (const [line, code, re] of refused) {
    const o = parseDrawOpener(line);
    ok(o && o.problems.length && o.problems[0].code === code, `${line} → ${code}`, JSON.stringify(o));
    if (re) ok(o && re.test(o.problems[0].msg), `  and the message says what to write`, o && o.problems[0].msg);
  }
  // One authored mistake, one problem: a repeated or misplaced keyword takes
  // its number with it rather than leaving it to be read as a grid.
  const dupAuto = parseDrawOpener('::: draw autoplay 900 autoplay 1200');
  ok(dupAuto.problems.length === 1 && dupAuto.autoplay === 900, 'a repeated autoplay is one problem and keeps the first delay', JSON.stringify(dupAuto));
  const cycleFirst = parseDrawOpener('::: draw cycle autoplay 900');
  ok(!cycleFirst.problems.some(p => p.code === 'bad-unit') && cycleFirst.problems.some(p => /after "cycle"/.test(p.msg)),
     'autoplay after cycle is out of order, and its delay is not mistaken for a grid', JSON.stringify(cycleFirst));
  ok(parseDrawOpener('::: draw 150x56 cycle cycle').problems.some(p => /"cycle" is written twice/.test(p.msg)), 'a repeated cycle says so');
  const zeroBraced = parseDrawOpener('::: draw {unit=0x56}');
  ok(!/Write  ::: draw 0x56/.test(zeroBraced.problems[0].msg), 'the old-opener refusal never recommends a line the parser would refuse next');
  ok(AUTOPLAY_MIN === 200 && AUTOPLAY_MAX === 60000, 'the playback bounds are 200 ms and 60 s');
  ok(parseDrawOpener(DRAW_OPENER_EXAMPLE).problems.length === 0, 'the example the messages quote parses');

  // ── formatDrawOpener refuses an impossible field set ─────────────
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  ok(throws(() => formatDrawOpener({ cycle: true })), 'cycle without autoplay is a caller defect, thrown');
  ok(throws(() => formatDrawOpener({ unit: '150X56' })), 'a unit that is not WxH is thrown');
  ok(throws(() => formatDrawOpener({ unit: '0x56' })) && throws(() => formatDrawOpener({ unit: '150x0' })), 'and so is a zero side');
  ok(throws(() => formatDrawOpener({ autoplay: 100 })), 'an out-of-range autoplay is thrown');
  ok(throws(() => formatDrawOpener({ unit: [150, 56] })), 'an array unit is thrown - one representation crosses parser, formatter and payload');

  // ── the compiler adapter and the legacy reader ───────────────────
  ok(drawCompilerAttrs({ unit: '150x56', autoplay: 900, cycle: true }) === 'unit=150x56', 'the compiler sees the grid and nothing else');
  ok(drawCompilerAttrs({ unit: null }) === '', 'and an empty string when no grid was written');
  // The compiler owns none of the host words any more: handed one, it
  // refuses rather than skips, so no embedder can pass one through.
  const hostWord = render('box a "A"', 'autoplay=900');
  ok(!hostWord.ok && /unknown ::: draw option "autoplay=900"/.test(hostWord.msg), 'the compiler refuses autoplay= as an unknown option');
  ok(!render('box a "A"', '#x').ok, 'and a #id, which it used to store and never draw');
  ok(render('box a "A"', 'unit=150x56').ok, 'while unit=WxH is still its adapter string');
  const old = parseLegacyDrawTail('unit=150x56 #x autoplay=1400 cycle bogus');
  ok(old.unit === '150x56' && old.id === 'x' && old.autoplay === 1400 && old.cycle === true && old.unknown[0] === 'bogus',
     'the legacy reader takes the old tail apart for the migration');
  ok(parseLegacyDrawTail('unit=150x56 unit=140x50').repeated.includes('unit') && /writes unit twice/.test(parseLegacyDrawTail('unit=150x56 unit=140x50').why),
     'and names a repeated field as the reason it cannot be rewritten');

  // ── the migration transform, end to end ──────────────────────────
  const mig = (src) => migrateText(src);
  ok(mig('x\n::: draw {unit=150x56 autoplay=1400 cycle}\ny').text === 'x\n::: draw 150x56 autoplay 1400 cycle\ny', 'a sound old opener is rewritten to the canonical line');
  ok(mig('::: draw{unit=150x56}').text === '::: draw 150x56', 'including one written without the space');
  ok(mig('::: draw {unit=150x56}\n::: draw {}').changes.length === 2 && mig('::: draw {}').text === '::: draw', 'and an empty old tail becomes a bare opener');
  const refusedMig = [
    ['::: draw {unit=0x56}',                 /zero side/],
    ['::: draw {autoplay=900 autoplay=1200}', /writes autoplay twice/],
    ['::: draw {unit=150x56 unit=140x50}',   /writes unit twice/],
    ['::: draw {cycle cycle}',               /writes cycle twice/],
    ['::: draw {unit=150x56 #x}',            /carries #x/],
    ['::: draw {unit=150x56 cycle}',         /no autoplay to repeat/],
    ['::: draw {autoplay=100}',              /out of range/],
    ['::: draw {unit=WxH}',                  /does not understand/],
  ];
  for (const [src, re] of refusedMig) {
    const r = mig(src);
    ok(r.text === src && r.changes.length === 0 && r.problems.length === 1 && re.test(r.problems[0].why),
       `${src} is left alone and named: ${re}`, JSON.stringify(r.problems));
  }
  ok(mig('::: draw {unit=0x56}\n::: draw {unit=150x56}').text.includes('::: draw {unit=0x56}'), 'a problem elsewhere in the text does not stop the sound ones from being reported as changes');
  // The active-surface notion the gate and the --check share.
  ok(isActiveSurface('lectures/x/source.md') && isActiveSurface('.claude/skills/x/SKILL.md') && isActiveSurface('CLAUDE.md') && isActiveSurface('docs/site/index.html'),
     'a lecture source, a skill, a root document and a site page are active surfaces');
  ok(!isActiveSurface('editor.md') && !isActiveSurface('CHANGELOG.md') && !isActiveSurface('test/settings.mjs') && !isActiveSurface('lectures/x/audience.html'),
     'a build log, history, a test and a built view are not');
  ok(LEGACY_TOKENS.length === 5, 'five old-form token patterns');
}
