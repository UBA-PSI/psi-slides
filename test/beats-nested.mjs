/*
 * beats-nested · a --- below the top level is a beat, in source order
 *
 * A `---` between two top-level blocks splits the chunk body into reveal
 * segments. Inside a ::: side pane, a card row, an overlay card or a
 * divider's body the same line cannot split anything - a wrapper cannot
 * straddle two segments - so the parser emits a marker (BEAT_MARK) and the
 * runtime hides every element sibling after it, up to the next marker in the
 * same parent, until its beat. One counter over the whole slide, in document
 * order, which is source order: the left pane's second paragraph, then the
 * right pane's first, then the card row written after the block.
 *
 * Only a browser can say whether that order holds, because it is the
 * runtime's walk (chunkBeats) that turns markers into beats, and the two
 * places it has to get right are exactly the two a static check cannot see:
 * that a marker inside a segment counts *between* the segments around it,
 * and that a marker inside an ::: overlay held to `from N` counts from N,
 * not from wherever the overlay layer sits in the DOM (after the body).
 *
 * Its own fixture deck: no lecture nests beats yet, and the assertion is
 * about a sequence, so the deck is written to have one.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'beats-nested · a --- inside a pane, a card row, an overlay or a divider is a beat in source order';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const SOURCE = `---
title: T
collapse: none
---

## title: {#title}

# Part {#part}

::: overlay {.bottom-right} from 1
Corner.

---

Later.
:::

## free: Panes {.wide #panes}

Topic.

::: side
Left one.

---

Left two.

::: flip

---

Right one.

---

Right two.
:::

---

::: cards 3
- Card A
- Card B

---

- Card C
:::

## free: Overlay beats over body beats {.wide #mixed}

Topic.

---

B.

---

C.

::: overlay {.top-right} from 1
Card.

---

Card two.
:::

## free: Rows {.wide #rows}

Topic.

::: rows
- **One** first
---
- **Two** second
:::

## figure: Pinned {.wide #pinned}

::: side

::: draw 120x40
box a "A" at 0,0
box b "B" below a gap 0.5
step one
  emph a
step two
  emph b
:::

::: flip

First, from beat zero.

--- from 1

Second, with step one.

--- from 2

Third, with step two.
:::

## free: After {.wide #after}

So the walk has somewhere to go.
`;

// What the room can see of a chunk: every block that is neither hidden by a
// beat nor inside a hidden segment, by its first words. `display: contents`
// (a row's <li>) has no box of its own, so the test is the attribute and
// the ancestry, not geometry.
const visible = (page, id) => page.evaluate((id) => {
  const el = [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === id);
  return [...el.querySelectorAll('p, li, .overlay-card')]
    .filter(e => !e.closest('[data-beat-hidden], [data-hidden]'))
    .filter(e => !(e.tagName === 'LI' && e.closest('.overlay-card')))
    .map(e => e.textContent.trim().split(/\s+/).slice(0, 2).join(' '))
    .join(' | ');
}, id);

const jump = (page, id) => page.evaluate((id) => {
  const i = [...document.querySelectorAll('.chunk')].findIndex(c => c.dataset.chunkId === id);
  window.jumpTo(i);
}, id);

export async function run({ page, report }) {
  const { ok, note } = report;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-beats-'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  const { server, port } = await serve(dir);
  try {
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    // ── the pane chunk: six beats, in the order they were written ──
    await jump(page, 'panes');
    await page.waitForTimeout(300);
    const want = [
      'Topic. | Left one.',
      'Topic. | Left one. | Left two.',
      'Topic. | Left one. | Left two. | Right one.',
      'Topic. | Left one. | Left two. | Right one. | Right two.',
      'Topic. | Left one. | Left two. | Right one. | Right two. | Card A | Card B',
      'Topic. | Left one. | Left two. | Right one. | Right two. | Card A | Card B | Card C',
    ];
    const got = [await visible(page, 'panes')];
    for (let k = 1; k < want.length; k++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
      got.push(await visible(page, 'panes'));
    }
    for (let k = 0; k < want.length; k++) {
      ok(got[k] === want[k], `beat ${k} shows ${want[k].split(' | ').pop()}`, `got: ${got[k]}`);
    }
    // One more Space leaves the chunk rather than adding an empty beat.
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelector('.chunk.active')?.dataset.chunkId);
    ok(after === 'mixed', 'and the beat after the last one is the next chunk', after);
    note(`panes: ${got.length} states walked`);

    // ── the segment split did not happen: one segment holds the panes ──
    const segs = await page.evaluate(() => {
      const el = document.getElementById('panes');
      return { segs: el.querySelectorAll('.reveal-segment').length, marks: el.querySelectorAll('.beat-mark').length,
               sideInFirst: !!el.querySelector('.reveal-segment[data-seg="0"] .side-b') };
    });
    ok(segs.segs === 2 && segs.marks === 4 && segs.sideInFirst,
       'the panes sit whole in the first segment, with four markers, and the card row is the second',
       JSON.stringify(segs));

    // ── a row block, card by card ──
    await jump(page, 'rows');
    await page.waitForTimeout(300);
    const r0 = await visible(page, 'rows');
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    const r1 = await visible(page, 'rows');
    ok(r0 === 'Topic. | Onefirst' && r1 === 'Topic. | Onefirst | Twosecond',
       'a --- between two rows shows the second on the next beat', `${r0} → ${r1}`);

    // ── an overlay's own beats over a body that has beats of its own ──
    // The mark inside the card is counted by its `at` (from + 1), never by
    // its place in the list as well: counted twice, the slide gained a
    // dead Space at the end and every body beat after the mark moved.
    await jump(page, 'mixed');
    await page.waitForTimeout(300);
    const mx = [await visible(page, 'mixed')];
    for (let k = 0; k < 3; k++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
      mx.push(await visible(page, 'mixed'));
    }
    ok(mx[0] === 'Topic.', 'mixed: beat 0 is the topic alone', mx[0]);
    ok(mx[1] === 'Topic. | B. | Card. Card | Card.', 'beat 1 brings B and the card (from 1) with its first block', mx[1]);
    ok(mx[2] === 'Topic. | B. | C. | Card. Card | Card. | Card two.', 'beat 2 brings C and the card\'s second block', mx[2]);
    const mxAfter = await page.evaluate(() => document.querySelector('.chunk.active')?.dataset.chunkId);
    ok(mxAfter === 'rows', 'and the third Space leaves the chunk - no dead beat', mxAfter);

    // ── a divider's overlay: from 1, its own second block on 2 ──
    await jump(page, 'part-section');
    await page.waitForTimeout(300);
    const d = [await visible(page, 'part-section')];
    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
      d.push(await visible(page, 'part-section'));
    }
    ok(d[0] === '', 'the divider opens with the overlay still held back', d[0]);
    ok(d[1] === 'Corner. Later. | Corner.',
       'from 1 brings the card with its first block only', d[1]);
    ok(d[2] === 'Corner. Later. | Corner. | Later.',
       'and the marker inside the card counts from the card\'s own beat, not from its place in the DOM', d[2]);
  } finally {
    server.close();
  }

    // ── a pinned beat rides one the slide already has ──────────────────
    // The case the feature exists for, and the one no lecture can hold: a
    // stepped figure in one pane and the prose about it in the other. Beats
    // are document order, so unpinned the figure's two steps would come
    // first and the prose after them - four presses, with the words arriving
    // once the picture had finished. Pinned, they ride the same two.
    await jump(page, 'pinned');
    await page.waitForTimeout(450);
    const beats = await page.evaluate(() => countSegments(
      [...document.querySelectorAll('.chunk')].find(c => c.dataset.chunkId === 'pinned')));
    ok(beats === 3, 'the chunk has two beats, not the four document order would give it',
       `countSegments returned ${beats} positions`);
    ok(await visible(page, 'pinned') === 'First, from', 'beat 0 shows only the unpinned paragraph',
       await visible(page, 'pinned'));
    await page.keyboard.press(' '); await page.waitForTimeout(420);
    ok(await visible(page, 'pinned') === 'First, from | Second, with',
       'from 1 arrives on the first press, with the figure\'s first step',
       await visible(page, 'pinned'));
    await page.keyboard.press(' '); await page.waitForTimeout(420);
    ok(await visible(page, 'pinned') === 'First, from | Second, with | Third, with',
       'and from 2 on the second, with its second step', await visible(page, 'pinned'));
    await page.keyboard.press(' '); await page.waitForTimeout(420);
    const still = await page.evaluate(() => document.querySelector('.chunk.active').dataset.chunkId);
    ok(still !== 'pinned', 'and the third press leaves the chunk, so the pins added no advance of their own',
       `still on ${still}`);
}
