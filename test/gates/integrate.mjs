/*
 * --integrate-annotations, rule by rule, without a build.
 *
 * The cockpit's Shift-E writes a marker block of annotation drafts and edited
 * speaker notes; integrate.mjs moves each part under its chunk. The marker
 * format and the flag are source-format interface, so the first cases are
 * snippets of the old shape – annotation lines alone – with the exact text
 * they have always produced. Then the notes: each rule of the integrator
 * (base moved, none, one, several that split cleanly, several that do not,
 * the delete, an unknown id) and the same rows for an annotation drafted
 * over one the source already has, the places a `> note:` or a heading is not
 * structure (a fence, a multi-line comment, a figure's `#` comments), a
 * divider's `x-section` id, CRLF, and the base line itself.
 *
 * The last block lifts the snippet builder out of runtime/audience.js as
 * text, the way test/settings.mjs lifts the sentence helpers, and sends
 * what it writes through the integrator: the two halves of the format live
 * in two files that cannot import one another, and this is where they meet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { integrateAnnotations, encodeBase, REASONS } from '../../integrate.mjs';

export const name = 'integrate: the Shift-E snippet moved into source.md, notes and annotations';

const FM = '---\ntitle: T\n---\n\n';
const block = (inner) => '\n<!-- annotations:start -->\n\n' + inner + '\n\n<!-- annotations:end -->\n';
const integ = (src) => integrateAnnotations(src);

export async function run({ report }) {
  const ok = report.ok.bind(report);

  // ── the old shape, exactly as before ──
  {
    const src = FM + '## free: One {#one}\n\nText.\n\n## free: Two {#two}\n\nMore.\n'
      + block('### one\n> annot: hello\n> annot: world\n\n### ghost\n> annot: lost');
    const r = integ(src);
    ok(r.src === FM + '## free: One {#one}\n\n> annot: hello\n\n> annot: world\n\nText.\n\n## free: Two {#two}\n\nMore.\n'
      + '\n<!-- annotations:start -->\n\n### ghost\n> annot: lost\n\n<!-- annotations:end -->\n',
      'an annotation-only snippet moves under its heading and an unknown id is parked, byte for byte as before', JSON.stringify(r.src));
    ok(r.moved === 1 && r.unresolved.length === 1 && r.unresolved[0].reason === REASONS.notFound,
      'and the counts say one moved, one parked as chunk id not found');
    const none = FM + '## free: One {#one}\n\nText.\n';
    ok(integ(none).hadMarker === false && integ(none).src === none, 'no marker block: nothing to do, source untouched');
    const noEnd = FM + '## free: One {#one}\n\n<!-- annotations:start -->\n### one\n> annot: x\n';
    const ne = integ(noEnd);
    ok(ne.noEnd && ne.src === noEnd, 'a start marker with no end marker is refused and the source is untouched');
    const inline = integ(FM + '## free: One {#one}\n\nText.\n\n<!-- annotations:start -->\n### one\n> annot: x <!-- annotations:end -->\n');
    ok(inline.moved === 1 && !inline.src.includes('annotations:'),
      'an end marker that shares its line is still found, as before', JSON.stringify(inline.src));
  }

  // ── notes: one block ──
  const deck = (notesOne, extra = '') => FM + '## free: One {#one}\n\n' + notesOne + 'Text.\n\n## free: Two {#two}\n\nMore.\n' + extra;
  {
    const src = deck('> note: from 2\n> Old line.\n> Second.\n\n',
      block('### one\n<!-- note-base: ' + encodeBase('Old line.\nSecond.') + ' -->\n> note: New line.\n>\n> TODO: x'));
    const r = integ(src);
    ok(r.src === deck('> note: from 2\n> New line.\n>\n> TODO: x\n\n'),
      'one block, base matching: replaced in place, its from-pin kept', JSON.stringify(r.src));
    ok(r.notes.replaced === 1 && !r.unresolved.length, 'and counted as replaced');
  }
  {
    const src = deck('> note: Old line.\n\n', block('### one\n> note: New line.'));
    ok(integ(src).src === deck('> note: New line.\n\n'), 'one block, no base: replaced in place');
  }
  {
    const src = deck('> note: Somebody changed this.\n\n',
      block('### one\n<!-- note-base: ' + encodeBase('Old line.') + ' -->\n> note: Mine.'));
    const r = integ(src);
    ok(r.src.startsWith(deck('> note: Somebody changed this.\n\n'))
       && r.src.includes('### one\n<!-- note-base: "Old line." -->\n> note: Mine.\n\n<!-- annotations:end -->'),
      'base not what the chunk says: the notes are untouched and the edit is parked with its base', JSON.stringify(r.src));
    ok(r.unresolved[0]?.kind === 'note' && r.unresolved[0]?.reason === REASONS.notesMoved,
      'parked as “source notes changed since the edit”');
  }

  // ── notes: none, delete, several ──
  {
    const src = deck('', block('### one\n> note: Brand new.'));
    const r = integ(src);
    ok(r.src === FM + '## free: One {#one}\n\n> note: Brand new.\n\nText.\n\n## free: Two {#two}\n\nMore.\n',
      'no block: a new one directly under the heading', JSON.stringify(r.src));
    ok(r.notes.inserted === 1, 'counted as added');
    const both = integ(deck('', block('### one\n<!-- annot-base: "" -->\n> annot: Public.\n\n> note: Private.')));
    ok(both.src === FM + '## free: One {#one}\n\n> annot: Public.\n\n> note: Private.\n\nText.\n\n## free: Two {#two}\n\nMore.\n',
      'an annotation and a new note in one section: the annotation under the heading, the note under it', JSON.stringify(both.src));
  }
  {
    const src = deck('> note: First.\n\nText before.\n\n---\n\n> note: from 3\n> Second.\n\n',
      block('### one\n<!-- note-base: "First.\\n\\nSecond." -->\n> note:'));
    const r = integ(src);
    ok(r.src === deck('Text before.\n\n---\n\n'), 'a lone > note: deletes every block of the chunk and the blank line it leaves', JSON.stringify(r.src));
    ok(r.notes.deleted === 1, 'counted as deleted');
  }
  {
    const two = '> note: First.\n\nText before.\n\n---\n\n> note: from 3\n> Second.\n\n';
    const r = integ(deck(two, block('### one\n> note: First, better.\n>\n> Second, better.')));
    ok(r.src === deck('> note: First, better.\n\nText before.\n\n---\n\n> note: from 3\n> Second, better.\n\n'),
      'two blocks and an override in two paragraphs: block by block, pins kept', JSON.stringify(r.src));
    const three = integ(deck(two, block('### one\n> note: A.\n>\n> B.\n>\n> C.')));
    ok(three.src.startsWith(deck(two)) && three.unresolved[0]?.reason === REASONS.notesSpread,
      'two blocks and three paragraphs: parked, “merge by hand”');
    const inner = integ(deck('> note: First.\n>\n> still first.\n\n---\n\n> note: Second.\n\n',
      block('### one\n> note: A.\n>\n> B.')));
    ok(inner.unresolved[0]?.reason === REASONS.notesSpread,
      'two blocks, one with a blank line of its own: parked, the split cannot be trusted');
  }

  // ── what is not structure ──
  {
    const fenced = FM + '## free: One {#one}\n\n```md\n## free: Fake {#two}\n> note: inside a fence\n```\n\n> note: Real.\n\n'
      + '## free: Two {#two}\n\nMore.\n';
    const r = integ(fenced + block('### one\n<!-- note-base: "Real." -->\n> note: Better.\n\n### two\n> note: Two.'));
    ok(r.src === FM + '## free: One {#one}\n\n```md\n## free: Fake {#two}\n> note: inside a fence\n```\n\n> note: Better.\n\n'
      + '## free: Two {#two}\n\n> note: Two.\n\nMore.\n',
      'a note and a heading inside a fence are neither counted nor touched', JSON.stringify(r.src));
    const commented = FM + '## free: One {#one}\n\n<!--\n## free: Draft {#two}\n> note: draft note\n-->\n\n> note: Real.\n\n'
      + '## free: Two {#two}\n\nMore.\n';
    const c = integ(commented + block('### one\n<!-- note-base: "Real." -->\n> note: Better.'));
    ok(c.src === commented.replace('> note: Real.', '> note: Better.') && !c.unresolved.length,
      'nor inside a multi-line comment', JSON.stringify(c.src));
    const drawn = FM + '## free: One {#one}\n\n::: draw\n# a figure comment, not a part\nbox a "A"\n:::\n\n> note: After the figure.\n\n'
      + '## free: Two {#two}\n\nMore.\n';
    const d = integ(drawn + block('### one\n<!-- note-base: "After the figure." -->\n> note: Better.'));
    ok(d.src === drawn.replace('> note: After the figure.', '> note: Better.'),
      'a figure’s # comment does not end the chunk', JSON.stringify(d.src));
    const backdrop = FM + '## free: One {#one}\n\n::: backdrop assets/x.jpg {.cover}\n\n> note: Old.\n\n## free: Two {#two}\n\nMore.\n';
    ok(integ(backdrop + block('### one\n> note: New.')).src === backdrop.replace('Old.', 'New.'),
      'a backdrop is one line with no closer');
  }

  // ── a divider ──
  {
    const src = FM + '# Part one {#p1}\n\n> note: Divider says.\n\n## free: One {#one}\n\nText.\n';
    const r = integ(src + block('### p1-section\n<!-- note-base: "Divider says." -->\n> note: Divider says more.'));
    ok(r.src === src.replace('Divider says.', 'Divider says more.'),
      'x-section finds the divider # … {#x} and replaces its notes', JSON.stringify(r.src));
    const ins = integ(FM + '# Part one {#p1}\n\n## free: One {#one}\n\nText.\n' + block('### p1-section\n> note: Fresh.'));
    ok(ins.src === FM + '# Part one {#p1}\n\n> note: Fresh.\n\n## free: One {#one}\n\nText.\n',
      'and a divider with no notes gets them under its heading, before the first chunk', JSON.stringify(ins.src));
  }

  // ── annotations honour their base ──
  {
    const src = FM + '## free: One {#one}\n\n> annot: Edited in source.\n\nText.\n';
    const r = integ(src + block('### one\n<!-- annot-base: "Old." -->\n> annot: Mine.'));
    ok(r.src.startsWith(src) && r.unresolved[0]?.reason === REASONS.annotMoved && r.moved === 0,
      'an annotation whose base is not the source annotation is parked');
    const fresh = integ(FM + '## free: One {#one}\n\nText.\n' + block('### one\n<!-- annot-base: "" -->\n> annot: Mine.'));
    ok(fresh.moved === 1 && fresh.src === FM + '## free: One {#one}\n\n> annot: Mine.\n\nText.\n',
      'one whose base is the (empty) source annotation moves as always');
    const half = integ(src + block('### one\n<!-- annot-base: "Old." -->\n> annot: Mine.\n\n> note: Notes go in.'));
    ok(half.src.includes('> annot: Edited in source.\n\n') && half.src.includes('{#one}\n\n> note: Notes go in.')
       && half.src.includes('### one\n<!-- annot-base: "Old." -->\n> annot: Mine.\n\n<!-- annotations:end -->'),
      'one part of a section parked, the other integrated', JSON.stringify(half.src));
  }

  // ── an annotation over an annotation: never two ──
  {
    const one = FM + '## free: One {#one}\n\n> annot: Was.\n\nText.\n';
    const r = integ(one + block('### one\n> annot: Now.\n> annot: and a second line'));
    ok(r.src === FM + '## free: One {#one}\n\n> annot: Now.\n> and a second line\n\nText.\n' && r.annots.replaced === 1,
      'no base, one > annot: block: replaced in place by the draft, as one block, never beside it', JSON.stringify(r.src));
    const based = integ(one + block('### one\n<!-- annot-base: "Was." -->\n> annot: Now.'));
    ok(based.src === FM + '## free: One {#one}\n\n> annot: Now.\n\nText.\n', 'base matching, one block: replaced', JSON.stringify(based.src));
    const two = FM + '## free: One {#one}\n\n> annot: A.\n\nText.\n\n> annot: B.\n';
    const nb = integ(two + block('### one\n> annot: A2.\n\n> annot: B2.'));
    ok(nb.src.startsWith(two) && nb.unresolved[0]?.reason === REASONS.annotSpread,
      'no base over two blocks: parked, “merge by hand”', JSON.stringify(nb.src));
    const kb = integ(two + block('### one\n<!-- annot-base: "A.\\n\\nB." -->\n> annot: A2.\n\n> annot: B2.'));
    ok(kb.src === FM + '## free: One {#one}\n\n> annot: A2.\n\nText.\n\n> annot: B2.\n',
      'base matching two blocks, the draft in two paragraphs: block by block', JSON.stringify(kb.src));
    const three = integ(two + block('### one\n<!-- annot-base: "A.\\n\\nB." -->\n> annot: only one now'));
    ok(three.unresolved[0]?.reason === REASONS.annotSpread, 'base matching two blocks, one paragraph: parked');
    const del = integ(two + block('### one\n<!-- annot-base: "A.\\n\\nB." -->\n> annot:'));
    ok(del.src === FM + '## free: One {#one}\n\nText.\n' && del.annots.deleted === 1,
      'an empty draft removes every > annot: block of the chunk', JSON.stringify(del.src));
  }

  // ── CRLF, the base line, a pin-shaped first line ──
  {
    const src = deck('> note: Old.\n\n', block('### one\n<!-- note-base: "Old." -->\n> note: New.\n>\n> More.')).replace(/\n/g, '\r\n');
    const r = integ(src);
    ok(r.src === deck('> note: New.\n>\n> More.\n\n').replace(/\n/g, '\r\n'), 'a CRLF source comes back CRLF throughout', JSON.stringify(r.src));
    const nasty = 'a --> b <!-- annotations:end --> c\n\n"quoted" \\ back';
    ok(!/[<>]/.test(encodeBase(nasty)) && JSON.parse(encodeBase(nasty)) === nasty,
      'a base line holds no < or > and reads back as the same text');
    const pin = integ(deck('', block('### one\n> note: from 3')));
    ok(pin.src.includes('{#one}\n\n> note:\n> from 3\n\nText.'),
      'a note whose first line reads like a pin is written so the parser does not take it for one', JSON.stringify(pin.src));
    const bad = integ(deck('> note: Old.\n\n', block('### one\n<!-- note-base: not json -->\n> note: New.')));
    ok(bad.warnings.length === 1 && bad.src.includes('> note: New.'), 'an unreadable base is a warning, and the edit goes in as one without a base');
    const empty = integ(deck('', block('### one\nprose only')));
    ok(empty.unresolved[0]?.reason === REASONS.noLines && empty.src.includes('### one\nprose only'),
      'a section with neither kind of line is parked as it was');
  }

  // ── the runtime's snippet, through the integrator ──
  {
    const rt = fs.readFileSync(path.join(ROOT, 'runtime/audience.js'), 'utf8');
    const a = rt.indexOf('function snippetBaseLine(');
    const b = rt.indexOf('// "2 annotations and 1 speaker note"');
    if (!ok(a > 0 && b > a, 'runtime/audience.js carries snippetBaseLine and buildAnnotationSnippet')) return;
    // eslint-disable-next-line no-new-func
    const { buildAnnotationSnippet } = new Function(rt.slice(a, b) + '\nreturn { buildAnnotationSnippet };')();
    const legacy = buildAnnotationSnippet([{ id: 'one', at: 0, text: 'hello' }]);
    ok(legacy === '<!-- annotations:start -->\n\n### one\n> annot: hello\n\n<!-- annotations:end -->\n',
      'drafts with no base and no notes: the snippet Shift-E always wrote', JSON.stringify(legacy));
    const src = FM + '# Part {#p}\n\n> note: Divider.\n\n## free: One {#one}\n\n> note: Old one.\n\nText.\n\n'
      + '## free: Two {#two}\n\n> note: from 1\n> Two old --> stays?\n\nMore.\n';
    const snippet = buildAnnotationSnippet(
      [{ id: 'one', at: 1, text: 'Public line.', base: '' }],
      [{ id: 'two', at: 2, text: 'Two new.\n\n<!-- annotations:end --> in a note', base: 'Two old --> stays?' },
       { id: 'p-section', at: 0, text: '', base: 'Divider.' },
       { id: 'one', at: 1, text: 'One new.\nTODO: check', base: 'Old one.' }]);
    ok(snippet.indexOf('### p-section') < snippet.indexOf('### one') && snippet.indexOf('### one') < snippet.indexOf('### two'),
      'sections in deck order, one per chunk');
    const r = integ(src + '\n' + snippet);
    ok(r.src === FM + '# Part {#p}\n\n## free: One {#one}\n\n> annot: Public line.\n\n> note: One new.\n> TODO: check\n\nText.\n\n'
      + '## free: Two {#two}\n\n> note: from 1\n> Two new.\n>\n> <!-- annotations:end --> in a note\n\nMore.\n',
      'a cockpit snippet integrates: a delete, a replace beside an annotation, a pinned replace whose text and base hold markers',
      JSON.stringify(r.src));
  }
}
