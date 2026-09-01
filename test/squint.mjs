/*
 * --squint says what a room would see. Four things about a slide are easy to
 * get wrong from the source and are the whole reason the command exists, so
 * this pins all four against a fixture deck that has one of each:
 *
 *   - a promoted bold, which the collapse turns into its own bullet under the
 *     paragraph and which the source shows as inline emphasis;
 *   - a reveal segment, which is not on the slide when you arrive on it;
 *   - a `::: slide` block, where the rule for the whole chunk changes;
 *   - a chunk whose entire content is a backdrop and an overlay, which are
 *     not inside `.chunk-body` at all. An extractor that walks only the body
 *     calls that slide empty, and the author's own review did exactly that.
 *
 * It also pins the two traps a hand-rolled walk fell into: `<style>` inside
 * an inlined `<svg>` is CSS and not prose, and `display: contents` (a card
 * row's list, the agenda's items, a divider's lead) is a box-less element
 * that `checkVisibility` calls invisible.
 *
 * And three facts a review asked this file for and did not get, all of them
 * the same shape - a construct reported by a name that leaves out the one
 * thing it is about:
 *
 *   - a two-cell list item, whose cells build.js writes with no whitespace
 *     between them because a grid supplies the gap. Read flat they come out
 *     as one word that is on no slide, and the review that met it went
 *     looking for a typo in the lecture;
 *   - a `::: side`, reported without the ratio it splits on;
 *   - a running agenda, reported without which of its items is live - which
 *     on a deck wearing `section: outline` is the only thing separating one
 *     divider's block in this file from the next one's.
 *
 * A fixture and not a lecture, for the reason math-focus.mjs gives: no
 * lecture in the repository has all four shapes in six chunks, and a spec
 * that walks a real deck to find them breaks when that deck is edited.
 *
 * This spec drives no page of its own - the command drives its own browser -
 * so it names a lecture only because the runner builds and opens one for
 * every spec. $PSI_CHROME is handed to the child so it starts the same
 * browser the suite did.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findChrome } from './harness.mjs';

export const name = 'squint · the projection read back';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

// A picture with a stylesheet in it. The <style> is what a naive walk picks
// up: it is not display:none, it is simply not text anybody reads.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="100" height="60">
  <style>.sky { fill: #334; } .sun { fill: #eca; }</style>
  <rect class="sky" width="100" height="60"/>
  <circle class="sun" cx="70" cy="18" r="9"/>
</svg>
`;

const SOURCE = `---
title: Squint fixture
presenter: Nobody
---

## title: {#cover}

# The four shapes {#shapes}

## principle: A claim that stands alone {.standard #claim}

The topic sentence is the whole of what the room reads here. The continuation
prose is not, and it carries a **promoted fragment of its own** that the
collapse keeps as a bullet.

## example: Two segments {.wide #segments}

The first segment is on the slide when you arrive.

---

The second segment arrives on the first press of the key.

## example: The author names the screen {.wide #explicit}

::: slide

- A list item the room reads
- And a second one

:::

This paragraph is the narration around that block and never reaches the
projection at all, whatever it says.

## figure: A picture with a caption on it {.full #picture}

::: backdrop dusk {cover invert}

::: overlay {bottom-left ink standard}
**The caption is an overlay** and it lives outside the chunk body.
:::

## example: What stays whole {.wide #whole}

Code and pictures are never abridged.

\`\`\`python
x = 1
y = 2
\`\`\`

![A sky with a sun in it](dusk)

> note: Two sentences of prompt for the lecturer. Neither of them is on the
> slide, and this file should say only how many words they are.

# What a name leaves out {#leftout}

## free: Two cells, and two panes {.wide #cells}

::: rows
- **Anonymity** comes from the others doing the same thing
- **Unlinkability** means two actions cannot be tied together
:::

::: side 2:1 {middle}

The left pane is twice the width of the right one.

::: flip

The right one.

:::

## outline: Where we are {.wide #where}

The same list the dividers draw, with this part live.
`;

// One chunk's block of the report, header line included.
function chunkOf(text, id) {
  const lines = text.split('\n');
  const at = lines.findIndex(l => l.startsWith('──── #' + id + ' '));
  if (at < 0) return null;
  const out = [lines[at]];
  for (let i = at + 1; i < lines.length && !lines[i].startsWith('──── #'); i++) {
    if (lines[i].startsWith('════')) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}
// The lines of one chunk carrying a given mark, beat prefix stripped.
const marked = (block, mark) => block.split('\n')
  .map(l => l.match(/^\s*(\+\d+)?\s([hs.\-•▸|[~])\s(.*)$/))
  .filter(m => m && m[2] === mark)
  .map(m => ({ beat: m[1] ? Number(m[1].slice(1)) : 0, text: m[3].trim() }));

export async function run({ report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-squint-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'dusk.svg'), SVG);
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const out = path.join(dir, 'read-back.txt');

  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--squint', '--squint-out', out],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PSI_CHROME: findChrome() } });
  const log = (built.stdout || '') + (built.stderr || '');
  ok(built.status === 0, 'the fixture deck builds and squints', log);
  if (built.status !== 0) return;
  ok(fs.existsSync(out), 'and --squint-out writes where it was told to', log);
  if (!fs.existsSync(out)) return;
  const text = fs.readFileSync(out, 'utf8');
  note(log.trim().split('\n').pop());

  // ── the promoted bold ────────────────────────────────────────────
  const claim = chunkOf(text, 'claim');
  ok(!!claim, 'the claim chunk is in the report');
  const said = marked(claim, '.');
  const bullets = marked(claim, '-');
  const hidden = marked(claim, '~');
  ok(said.length === 1 && said[0].text.startsWith('The topic sentence'),
    'the topic sentence is reported as painted', JSON.stringify(said));
  ok(bullets.length === 1 && bullets[0].text === 'promoted fragment of its own',
    'the bold in the continuation is reported as its own bullet, not as inline emphasis',
    JSON.stringify(bullets));
  ok(hidden.length === 1 && /\(\d+ words withheld\)/.test(claim),
    'the continuation prose is reported as withheld, with a word count',
    JSON.stringify(hidden));
  ok(hidden[0] && /continuation/.test(hidden[0].text)
    && !said.some(l => /continuation/.test(l.text)),
    'and it is the withheld line that carries it, never a painted one',
    JSON.stringify(hidden));

  // ── the reveal segment ───────────────────────────────────────────
  const segs = chunkOf(text, 'segments');
  const lines = marked(segs, '.');
  const first = lines.find(l => l.text.startsWith('The first segment'));
  const second = lines.find(l => l.text.startsWith('The second segment'));
  ok(first && first.beat === 0, 'the opening segment is reported at beat 0',
    JSON.stringify(first));
  ok(second && second.beat === 1,
    'and the segment behind the key press is marked as arriving later',
    JSON.stringify(second));
  ok(/· 2 beats/.test(segs), 'the chunk header counts the beats', segs.split('\n')[0]);

  // ── the ::: slide block ──────────────────────────────────────────
  const exp = chunkOf(text, 'explicit');
  ok(/\[ ::: slide/.test(exp), 'a ::: slide block is named as the screen', exp);
  ok(marked(exp, '•').length === 2, 'its list items are painted whole',
    JSON.stringify(marked(exp, '•')));
  ok(!/^\s*(\+\d+)?\s\.\s.*narration/m.test(exp),
    'the narration around it is not reported as painted', exp);
  ok(/~ .*narration/.test(exp) && /not in the ::: slide block/.test(exp),
    'it is reported as withheld, and why', exp);

  // ── the chunk that is a picture with words on it ─────────────────
  const pic = chunkOf(text, 'picture');
  ok(/\[ backdrop · cover/.test(pic), 'a chunk whose content is a backdrop is not reported empty', pic);
  ok(/\[ overlay · bottom-left/.test(pic), 'and its overlay is reported with its place', pic);
  ok(/The caption is an overlay/.test(pic), 'and the words on the picture are in the report', pic);

  // ── what stays whole, and what is not text at all ────────────────
  const whole = chunkOf(text, 'whole');
  ok(/\[ code · 2 lines/.test(whole), 'a code block is marked, with its length', whole);
  ok(/\|\s+x = 1/.test(whole) && /\|\s+y = 2/.test(whole), 'and its lines are in the report', whole);
  ok(/\[ (image|artwork|figure)/.test(whole), 'a picture is marked rather than transcribed', whole);
  ok(/A sky with a sun in it/.test(whole), 'and its caption, which the room does read, is there', whole);
  ok(!/fill:/.test(text) && !/\.sky/.test(text),
    'the stylesheet inside the inlined svg is not mistaken for prose', whole);
  ok(/note \d+ words/.test(whole.split('\n')[0]),
    'the speaker note is counted and not quoted', whole.split('\n')[0]);
  ok(!/prompt for the lecturer/.test(text), 'the note text itself stays out of the file');

  // ── the two-cell list item, and the pane that carries a ratio ────
  const cells = chunkOf(text, 'cells');
  const rowItems = marked(cells, '•');
  ok(rowItems.length === 2 && rowItems.every(l => /\w \w/.test(l.text)
    && /^(Anonymity comes|Unlinkability means) /.test(l.text)),
    'a row keeps the space between its term and its body, as the grid does',
    JSON.stringify(rowItems));
  ok(!/Anonymitycomes|Unlinkabilitymeans/.test(text),
    'and never runs the two into a word that is on no slide');
  ok(/\[ side 2:1 · middle · first pane/.test(cells),
    'a ::: side is reported with the ratio it splits on, and with its anchor', cells);
  ok(/\[ side 2:1 · middle · second pane/.test(cells), 'on the second pane too', cells);

  // ── which item of a running agenda is live ───────────────────────
  const where = chunkOf(text, 'where');
  ok(/\[ list · 2 items · live 2 of 2/.test(where),
    'a running agenda says which of its items is live, and out of how many', where);
  ok(marked(where, '▸').length === 1 && marked(where, '•').length === 1,
    'and the live one carries a mark of its own', where);
  ok(/^ {2}•.*▸/m.test(text), 'which the legend names', text.split('\n').slice(0, 24).join('\n'));

  // ── the header, and the summary ──────────────────────────────────
  ok(/collapse "topic-bold"/.test(text), 'the report says which collapse it read the deck in');
  ok(/1600×900/.test(text), 'and at which size');
  ok(/paint a heading and nothing else|Every slide but the dividers/.test(text),
    'and ends with what the walk added up to');
  // The divider this deck generates for its one headed column paints its
  // heading and nothing else, which is what a divider is for. Counting it as
  // a bare slide would make the summary useless on every real lecture.
  ok(/Every slide but the dividers paints something/.test(text),
    'a section divider is not counted as a slide that withheld its body', text.split('\n').slice(-4).join('\n'));

  fs.rmSync(dir, { recursive: true, force: true });
}
