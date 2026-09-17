/*
 * transition · a slide change with and without the visible pan
 *
 * `transition: pan | cut | fade` is the one viewer default whose whole
 * subject is what happens *between* two states, so nothing static can
 * settle it: the claims are about frames. Each mode is walked over the same
 * three slides and sampled once per animation frame - the stage's transform,
 * the stage's opacity, and each chunk's own opacity - and the trace is what
 * the assertions read.
 *
 *   pan   the camera travels: many distinct transforms, and it is still
 *         moving after the first frame. Unchanged from before the key.
 *   cut   the camera is at its final transform on the first frame after the
 *         press, and the arriving slide is at full opacity there too.
 *   fade  no two transforms while anything is visible - the jump is taken in
 *         a frame where the stage is at zero - and never two slides painted
 *         at once. "Painted" is the stage's opacity times the chunk's,
 *         because a chunk at 1 inside a stage at 0.2 is not on the screen.
 *
 * Its own fixture deck, for the reason test/README.md gives for the others:
 * the property is about three plain consecutive slides and a press between
 * them, which every real lecture has and none of them holds still - a deck
 * edited for its own sake would move the numbers here for no reason. The
 * deck also carries a two-beat chunk and one taller than the frame, because
 * the thing most easily broken by "make the camera instant" is the motion
 * that is NOT a slide change: a reveal still has to glide, and a chunk taller
 * than the screen still has to walk down as it grows.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'transition · pan travels, cut lands in a frame, fade never paints two slides';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const DECK = (mode) => `---
title: T
collapse: none
auto-fit: false
transition: ${mode}
---

## title: Deck {#title}

## free: One {#a}

**Slide one stands here.** A second sentence, so the slide is not one line.

## free: Two {#b}

**Slide two stands here.** A second sentence, so the slide is not one line.

## free: Three {#c}

**Slide three arrives in two beats.** The first beat is this.

---

And the second beat is this, which the camera has to follow.

## free: Tall {#tall}

**A chunk taller than the frame.** It is walked rather than framed, and the
walk has to survive a mode that lands the camera instantly.

---

${Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of a chunk that does not fit the frame at all.`).join('\n\n')}
`;

// One animation-frame trace of a single press, as seen from the room.
// `to` is a chunk index to jump to, or null for one forward press on the
// slide we are already on.
const trace = (page, to, ms = 620) => page.evaluate(({ to, ms }) => new Promise((res) => {
  const stage = document.getElementById('stage');
  const chunks = [...document.querySelectorAll('.chunk')];
  const frames = [];
  const t0 = performance.now();
  const sample = () => {
    const cs = getComputedStyle(stage);
    const stageOp = +cs.opacity;
    frames.push({
      t: Math.round(performance.now() - t0),
      tf: cs.transform,
      stageOp,
      // What the room can see of each chunk. A chunk at 1 inside a stage at
      // 0.2 is not a slide anyone is reading.
      painted: chunks.map(c => ({
        id: c.dataset.chunkId,
        p: +(+getComputedStyle(c).opacity * stageOp).toFixed(3),
      })).filter(x => x.p > 0.001),
    });
    if (performance.now() - t0 < ms) requestAnimationFrame(sample); else res(frames);
  };
  requestAnimationFrame(() => {
    if (to == null) window.goForward(); else window.jumpTo(to, 'forward');
    sample();
  });
}), { to, ms });

const ty = (tf) => { const m = /matrix\(([^)]*)\)/.exec(tf); return m == null ? null : Math.round(+m[1].split(',')[5]); };

export async function run({ page, report }) {
  const { ok, note } = report;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-transition-'));

  // Three decks, one per mode, built in folders of their own and then laid
  // side by side under distinct names: the harness's server answers on the
  // basename alone, so <mode>.html is how three views share one directory.
  for (const mode of ['pan', 'cut', 'fade']) {
    const at = path.join(dir, mode);
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(path.join(at, 'source.md'), DECK(mode));
    const built = spawnSync(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(at, 'source.md'), '--audience-only'],
      { cwd: ROOT, encoding: 'utf8' });
    ok(built.status === 0, `${mode}: the fixture deck builds`, (built.stdout || '') + (built.stderr || ''));
    if (built.status !== 0) return;
    fs.copyFileSync(path.join(at, 'audience.html'), path.join(dir, `${mode}.html`));
  }

  const { server, port } = await serve(dir);
  try {
    const walk = async (mode) => {
      await page.goto(`http://127.0.0.1:${port}/${mode}.html`, { waitUntil: 'load' });
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(800);
      const out = [];
      // Three slides, walked the way a lecturer walks them.
      for (const idx of [1, 2, 3]) {
        await page.evaluate((i) => window.jumpTo(i, 'forward'), idx - 1);
        await page.waitForTimeout(700);
        out.push(await trace(page, idx));
      }
      return out;
    };

    // ── pan: the camera travels, and that is the whole of it ──
    {
      const walks = await walk('pan');
      const moved = walks.map(fr => new Set(fr.map(f => ty(f.tf))).size);
      ok(moved.every(n => n > 4),
         'pan: the camera passes through many positions on every slide change', moved.join(','));
      const late = walks.map(fr => {
        const end = ty(fr[fr.length - 1].tf);
        return fr.findIndex(f => ty(f.tf) === end);
      });
      ok(late.every(i => i > 3),
         'pan: and it is still travelling several frames in - the pan is visible, not a cut with a delay',
         late.join(','));
      note(`pan: ${moved.join('/')} distinct camera positions, settled at frame ${late.join('/')}`);
    }

    // ── cut: in place within one frame ──
    {
      const walks = await walk('cut');
      const firstIsLast = walks.map(fr => ty(fr[0].tf) === ty(fr[fr.length - 1].tf));
      ok(firstIsLast.every(Boolean),
         'cut: the camera is where it ends up on the first frame after the press',
         walks.map(fr => `${ty(fr[0].tf)}->${ty(fr[fr.length - 1].tf)}`).join(' '));
      const single = walks.every(fr => new Set(fr.map(f => ty(f.tf))).size === 1);
      ok(single, 'cut: and never anywhere else, so there is no motion to see',
         walks.map(fr => [...new Set(fr.map(f => ty(f.tf)))].join('/')).join(' '));
      // The slide is not merely in position, it is fully painted. A .chunk
      // carries an opacity transition of its own over --camera-duration,
      // which a mode that only touched the camera would leave in place.
      const upAtOnce = walks.map(fr => Math.max(...fr[0].painted.map(x => x.p)));
      ok(upAtOnce.every(p => p > 0.99),
         'cut: and the arriving slide is at full opacity on that same frame', upAtOnce.join(','));
      const solo = walks.every(fr => fr.every(f => f.painted.filter(x => x.p > 0.01).length <= 1));
      ok(solo, 'cut: with nothing else painted beside it');
    }

    // ── fade: opacity only, and one slide at a time ──
    {
      const walks = await walk('fade');
      const visibleMoves = walks.map(fr => {
        const seen = new Set(fr.filter(f => f.stageOp > 0.001).map(f => ty(f.tf)));
        return seen.size;
      });
      ok(visibleMoves.every(n => n <= 2),
         'fade: the camera occupies one position while the stage is going and one while it is coming back - it never moves in view',
         visibleMoves.join(','));
      // The frame the transform changes on has to be one nobody sees. Only
      // that frame: the one before it is the last frame of the slide being
      // left, still at the old position and still faintly visible, which is
      // the whole point - the room watches it go, it does not watch it move.
      const darkest = walks.map(fr => {
        let worst = 0;
        for (let i = 1; i < fr.length; i++) {
          if (ty(fr[i].tf) !== ty(fr[i - 1].tf)) worst = Math.max(worst, fr[i].stageOp);
        }
        return worst;
      });
      ok(darkest.every(v => v <= 0.02),
         'fade: and the one frame it does move on is a frame at zero opacity',
         darkest.map(v => v.toFixed(3)).join(','));
      const twoUp = walks.map(fr => fr.filter(f => f.painted.filter(x => x.p > 0.9).length > 1).length);
      ok(twoUp.every(n => n === 0),
         'fade: two slides are never painted at full opacity at once', twoUp.join(','));
      const dipped = walks.map(fr => Math.min(...fr.map(f => f.stageOp)));
      ok(dipped.every(v => v < 0.02), 'fade: the stage really reaches the paper', dipped.map(v => v.toFixed(3)).join(','));
      const back = walks.map(fr => fr[fr.length - 1].stageOp);
      ok(back.every(v => v > 0.99), 'fade: and comes back inside the trace, leaving no stage half-faded',
         back.map(v => v.toFixed(3)).join(','));
      const span = walks.map(fr => {
        const down = fr.findIndex(f => f.stageOp < 0.02);
        const up = fr.findIndex((f, i) => i > down && f.stageOp > 0.99);
        return fr[up].t - 0;
      });
      note(`fade: end to end ${span.join('/')} ms (FADE_MS is 260)`);
      ok(span.every(ms => ms > 180 && ms < 460), 'fade: and the whole of it is about a quarter of a second', span.join(','));
    }

    // ── what a mode with no motion must NOT have taken away ──
    // A reveal is a move on a slide that is already there. Under cut it still
    // has to glide, and on a chunk taller than the frame it has to walk down
    // with the growing chunk - the camera branch that follows the foot.
    for (const mode of ['cut', 'fade']) {
      await page.goto(`http://127.0.0.1:${port}/${mode}.html`, { waitUntil: 'load' });
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const i = [...document.querySelectorAll('.chunk')].findIndex(c => c.dataset.chunkId === 'tall');
        window.jumpTo(i, 'forward');
      });
      await page.waitForTimeout(700);
      const before = await page.evaluate(() => getComputedStyle(document.getElementById('stage')).transform);
      const fr = await trace(page, null, 520);
      const after = fr[fr.length - 1].tf;
      ok(ty(after) !== ty(before),
         `${mode}: a chunk taller than the frame still scrolls when a segment arrives`,
         `${ty(before)} -> ${ty(after)}`);
      ok(new Set(fr.map(f => ty(f.tf))).size > 3,
         `${mode}: and it glides there rather than jumping - a reveal is not a slide change`,
         [...new Set(fr.map(f => ty(f.tf)))].join('/'));
      ok(fr.every(f => f.stageOp > 0.99),
         `${mode}: with no fade, because nothing changed slide`, String(Math.min(...fr.map(f => f.stageOp))));
    }
  } finally {
    server.close();
  }
}
