/*
 * The camera's fit test, and the box it is allowed to judge.
 *
 * One invariant, and it is the one `--check-fit` exists to police: **a chunk
 * whose content fits the frame has to be inside the frame.** A chunk taller
 * than the frame is walked instead, which is fine and deliberate; a chunk that
 * fits and is nonetheless clipped is a defect the room sees as a missing
 * sentence.
 *
 * It shipped broken. `focusCamera` measured the chunk *box* to decide whether
 * to centre or to walk, while the chunk box carries about 78 px of breathing
 * space above the heading - a deliberate part of the design. So a chunk whose
 * content was 793 px in an 800 px frame had a box of 871 px, failed the test,
 * had its head pinned at 5% and hung off the bottom of a frame it fitted
 * inside comfortably. Six of the tutorial's chunks were in that state at
 * 1280x800 and `--check-fit` had been reporting all six; nothing in the suite
 * asserted it, and `--check-fit` does not run in CI.
 *
 * The deck is a fixture with chunks of graded length so that some fit and some
 * do not at the viewport below, which is the arrangement the invariant needs
 * and which no lecture owes it at a stable size.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'camera · a chunk that fits is inside the frame';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const para = (n) => Array.from({ length: n }, (_, i) =>
  `**Sentence ${i} opens the paragraph.** It then runs on for a while so the ` +
  'chunk grows by a predictable amount with every one of these that is added.'
).join('\n\n');

// Four lengths, chosen to straddle the frame at 1280x800: the short ones fit
// with room to spare, the long one cannot fit at all and must be walked.
const DECK = `---
title: T
collapse: none
---

## title: {#title}

## free: Short {.wide #c1}

${para(2)}

## free: Middling {.wide #c2}

${para(5)}

## free: Near the edge {.wide #c3}

${para(7)}

## free: Far over {.wide #c4}

${para(18)}
`;

function buildDeck() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-camfit-'));
  fs.writeFileSync(path.join(dir, 'source.md'), DECK);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--audience-only'],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

export async function run({ page, report }) {
  const { ok, note } = report;

  const built = buildDeck();
  ok(built.status === 0, 'the fixture deck builds', built.out);
  if (built.status !== 0) return;

  const { server, port } = await serve(built.dir);
  const prev = page.viewportSize();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.goto(`http://127.0.0.1:${port}/audience.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    // The same two boxes --check-fit compares, read after the camera has settled
    // on each chunk in turn.
    const measure = (id) => page.evaluate((cid) => {
      const i = flatChunks.findIndex((c) => c.id === cid);
      if (i < 0) return null;
      jumpTo(i);
      return new Promise((res) => setTimeout(() => {
        const el = flatChunks[i].el;
        const content = el.querySelector('.chunk-content') || el;
        const r = content.getBoundingClientRect();
        const vp = document.getElementById('stage-viewport').getBoundingClientRect();
        res({
          box: Math.round(el.getBoundingClientRect().height),
          h: Math.round(r.height), vpH: Math.round(vp.height),
          top: Math.round(r.top - vp.top), bottom: Math.round(r.bottom - vp.top),
        });
      }, 520));
    }, id);

    let straddled = false;
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      const m = await measure(id);
      if (!m) { ok(false, `#${id} is in the deck`); continue; }
      const fits = m.h <= m.vpH;
      note(`#${id}: content ${m.h}, box ${m.box}, frame ${m.vpH}, ` +
        `top ${m.top}, bottom ${m.bottom}${fits ? '' : '  (taller than the frame - walked)'}`);
      // The box being taller than the frame while the content is not is the
      // exact state that used to mis-route the camera. Note it where it occurs,
      // so a reader can see the spec is testing the case it claims to.
      if (fits && m.box > m.vpH) {
        straddled = true;
        note(`  ^ box overflows the frame and the content does not - the case that broke`);
      }
      if (!fits) continue;
      ok(m.top >= -1 && m.bottom <= m.vpH + 1,
        `#${id} fits the frame and is inside it`,
        `content ${m.h} in ${m.vpH}, top ${m.top}, bottom ${m.bottom}`);
    }
    ok(straddled,
      'and at least one chunk had a box taller than the frame while its content fit',
      'no chunk straddled the two boxes, so the regression case was not exercised');
  } finally {
    if (prev) await page.setViewportSize(prev);
    server.close();
  }
}
