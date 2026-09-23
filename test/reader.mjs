/*
 * reader · the documents' contents sidebar and the two-margin layout
 *
 * print.html and print-notes.html are read on a screen after the lecture, and
 * under `reader: on` (the default) they carry a contents sidebar: one entry
 * per slide, grouped by part, numbered with the number the document prints,
 * and marked while the reader scrolls. Wide, it stands on the left and a
 * column for the reader's notes is kept free on the right; narrower, it folds
 * to a button that opens it over the page.
 *
 * Its own fixture deck, because the claims are about a shape: an anonymous
 * column before the first part (where the entries have no group), an
 * `outline:` chunk (which is not an entry), a chunk with no heading (which
 * still needs a name), and slides long enough that a scroll-spy has
 * somewhere to go. The same deck a second time with `reader: off` is the
 * pair that says what the key takes away.
 *
 * Geometry is asserted as relations - the text clear of the sidebar, the
 * notes column inside the window - never as coordinates, because the root
 * size follows the window and every rem is a different pixel count at each
 * of the three widths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, ROOT } from './harness.mjs';

export const name = 'reader · the documents carry a contents sidebar and keep a notes margin';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const filler = (n) => Array.from({ length: n }, (_, i) =>
  `Paragraph ${i + 1} of this slide, long enough to take a few lines on a screen `
  + 'and to give the scroll-spy a slide that is taller than the window.').join('\n\n');

const deck = (extra = '') => `---
title: Reader fixture
${extra}---

## title: {#title}

## outline: What comes {#agenda}

The parts.

## free: Before any part {#intro}

${filler(3)}

## free: {#nameless}

A slide with no heading at all.

# First part {#part-one}

## definition: A term {#term}

${filler(6)}

## example: An instance {#instance}

${filler(6)}

# Second part {#part-two}

## question: Why? {#why}

${filler(6)}

## free: The last one {#last}

${filler(2)}
`;

const build = (dir, src) => {
  fs.writeFileSync(path.join(dir, 'source.md'), src);
  return spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
};

export async function run({ page, report }) {
  const { ok, note } = report;
  const browser = page.context().browser();

  const dir = tmpDir('psi-reader-');
  const built = build(dir, deck());
  ok(built.status === 0, 'the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;

  const offDir = tmpDir('psi-reader-off-');
  const offBuilt = build(offDir, deck('reader: off\n'));
  ok(offBuilt.status === 0, 'and builds under reader: off', (offBuilt.stdout || '') + (offBuilt.stderr || ''));

  // ── an unknown value is refused, by the build and by the linter ──
  const badDir = tmpDir('psi-reader-bad-');
  const bad = build(badDir, deck('reader: yes\n'));
  ok(bad.status !== 0 && /reader: yes/.test(bad.stderr + bad.stdout),
     'reader: yes fails the build and names the key', (bad.stderr || '').split('\n')[0]);
  const lint = spawnSync(process.execPath, [path.join(ROOT, 'lint.js'), path.join(badDir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  ok(/unknown-view-default/.test(lint.stdout + lint.stderr),
     'and lint.js reports it as unknown-view-default', (lint.stdout || '').trim().split('\n').slice(-2).join(' | '));

  const { server, port } = await serve(dir);
  const off = await serve(offDir);
  const open = async (viewport, file = 'print.html', opts = {}) => {
    const ctx = await browser.newContext({ viewport, ...opts });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${opts.port || port}/${file}`, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    return { p, ctx, errors };
  };
  // Two frames: one for the scroll event's batched frame, one to read after it.
  const settle = (p) => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const current = (p) => p.evaluate(() => {
    const a = document.querySelector('#reader-contents [aria-current=location]');
    return a ? a.dataset.rd : null;
  });

  try {
    // ── the entries are the slides, in the document's order, with its numbers ──
    for (const file of ['print.html', 'print-notes.html']) {
      const { p, ctx, errors } = await open({ width: 1440, height: 900 }, file);
      const got = await p.evaluate(() => {
        const entries = [...document.querySelectorAll('#reader-contents a[data-rd]')].map(a => ({
          id: a.dataset.rd,
          num: a.querySelector('.rd-num').textContent,
          text: a.querySelector('.rd-text').textContent,
          group: a.closest('.rd-group')?.querySelector('.rd-part')?.textContent || null,
        }));
        const chunks = [...document.querySelectorAll('main article.chunk[id]')]
          .filter(c => !c.classList.contains('chunk-title') && !c.classList.contains('chunk-outline'))
          .map(c => ({ id: c.id, num: c.dataset.chunkNum,
                       group: c.closest('section.column')?.querySelector('.column-heading')?.textContent || null }));
        return { entries, chunks };
      });
      ok(JSON.stringify(got.entries.map(e => e.id)) === JSON.stringify(got.chunks.map(c => c.id)),
         `${file}: one entry per slide, in document order, without the cover or the outline`,
         got.entries.map(e => e.id).join(',') + ' | ' + got.chunks.map(c => c.id).join(','));
      ok(got.entries.every((e, i) => got.chunks[i] && e.num === got.chunks[i].num),
         `${file}: each entry carries the number the document prints`,
         got.entries.map(e => e.num).join(',') + ' | ' + got.chunks.map(c => c.num).join(','));
      ok(got.entries.every((e, i) => got.chunks[i] && e.group === got.chunks[i].group),
         `${file}: grouped under the part heading the slide stands in, none before the first part`,
         JSON.stringify(got.entries.map(e => e.group)));
      const nameless = got.entries.find(e => e.id === 'nameless');
      ok(nameless && nameless.text.trim().length > 0, `${file}: a slide with no heading still has a name to click`,
         nameless && nameless.text);
      ok(errors.length === 0, `${file}: no page errors`, errors.join(' | '));
      await ctx.close();
    }

    // ── wide: the sidebar stands on the left, a notes column is kept free ──
    {
      const { p, ctx } = await open({ width: 1440, height: 900 });
      const g = await p.evaluate(() => {
        const nav = document.getElementById('reader-contents');
        const r = nav.getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect();
        const num = document.querySelector('main .chunk:not(.chunk-title) .chunk-num').getBoundingClientRect();
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return { navRight: r.right, navVisible: getComputedStyle(nav).visibility === 'visible' && r.width > 0,
                 mainLeft: m.left, mainRight: m.right, numLeft: num.left, rem, w: innerWidth,
                 toggle: getComputedStyle(document.querySelector('.rd-toggle')).display,
                 sw: document.documentElement.scrollWidth };
      });
      ok(g.navVisible && g.toggle === 'none', 'wide: the sidebar is on screen and the button is not', JSON.stringify(g));
      ok(g.numLeft >= g.navRight, 'wide: the text and its slide numbers stand clear of the sidebar', JSON.stringify(g));
      ok(g.mainRight + 17 * g.rem <= g.w, 'wide: a 17rem notes column fits right of the text', JSON.stringify(g));
      ok(g.sw <= g.w, 'wide: no sideways scroll', `${g.sw} > ${g.w}`);

      // ── scroll-spy ──
      ok(await current(p) === null, 'at the cover no entry is marked - the cover is not one');
      const scrollToChunk = (id, frac) => p.evaluate(([id, frac]) => {
        const el = document.getElementById(id);
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - innerHeight * frac);
      }, [id, frac]);
      await scrollToChunk('instance', 0.1);
      await settle(p);
      ok(await current(p) === 'instance', 'a slide whose top has crossed 30% of the window is marked', await current(p));
      await scrollToChunk('why', 0.5);
      await settle(p);
      ok(await current(p) === 'instance', 'the next slide is not marked while its top is still below that line', await current(p));
      await scrollToChunk('why', 0.2);
      await settle(p);
      ok(await current(p) === 'why', 'and is once it crosses it', await current(p));
      const count = await p.evaluate(() => document.querySelectorAll('#reader-contents [aria-current]').length);
      ok(count === 1, 'exactly one entry is marked', String(count));
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await settle(p);
      ok(await current(p) === 'last', 'at the foot of the page the last slide is marked, though its top never reaches the line',
         await current(p));

      // ── nothing of it on paper ──
      await p.emulateMedia({ media: 'print' });
      const printed = await p.evaluate(() => ({
        nav: getComputedStyle(document.getElementById('reader-contents')).display,
        toggle: getComputedStyle(document.querySelector('.rd-toggle')).display,
        pad: getComputedStyle(document.body).paddingLeft,
      }));
      ok(printed.nav === 'none' && printed.toggle === 'none' && printed.pad === '0px',
         'printed, there is no sidebar, no button and no reserved margin', JSON.stringify(printed));
      await ctx.close();
    }

    // ── medium and narrow: a button opens the sidebar over the page ──
    for (const viewport of [{ width: 1100, height: 800 }, { width: 390, height: 800 }]) {
      const tag = `${viewport.width}px`;
      const { p, ctx, errors } = await open(viewport);
      const state = () => p.evaluate(() => {
        const nav = document.getElementById('reader-contents');
        const r = nav.getBoundingClientRect();
        return { open: document.body.classList.contains('rd-open'),
                 onScreen: getComputedStyle(nav).visibility === 'visible' && r.right > 0,
                 expanded: document.querySelector('.rd-toggle').getAttribute('aria-expanded'),
                 focusIn: nav.contains(document.activeElement) };
      });
      const g = await p.evaluate(() => {
        const t = getComputedStyle(document.querySelector('.rd-toggle'));
        const m = document.querySelector('main').getBoundingClientRect();
        return { toggle: t.display, position: t.position, mainRight: m.right, w: innerWidth,
                 rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
                 sw: document.documentElement.scrollWidth };
      });
      ok(g.toggle !== 'none' && g.position === 'fixed', `${tag}: the sidebar has folded to a fixed button`, JSON.stringify(g));
      ok(g.sw <= g.w, `${tag}: no sideways scroll`, `${g.sw} > ${g.w}`);
      if (viewport.width >= 920) {
        ok(g.mainRight + 17 * g.rem <= g.w, `${tag}: the notes column still fits right of the text`, JSON.stringify(g));
      }
      const s0 = await state();
      ok(!s0.open && !s0.onScreen, `${tag}: closed, the sidebar is off the page`, JSON.stringify(s0));

      await p.click('.rd-toggle');
      await p.waitForTimeout(250);
      const s1 = await state();
      ok(s1.open && s1.onScreen && s1.expanded === 'true' && s1.focusIn,
         `${tag}: the button opens it, says so, and puts the focus in it`, JSON.stringify(s1));
      await p.keyboard.press('Escape');
      await p.waitForTimeout(250);
      const s2 = await state();
      const backOnButton = await p.evaluate(() => document.activeElement === document.querySelector('.rd-toggle'));
      ok(!s2.open && !s2.onScreen && s2.expanded === 'false' && backOnButton,
         `${tag}: Esc closes it and hands the focus back to the button`, JSON.stringify(s2));

      // A link closes it and lands the slide at the top, clear of the button:
      // below it where the button sits top left, above it where a narrow
      // window moves the button to the foot.
      await p.click('.rd-toggle');
      await p.waitForTimeout(250);
      await p.click('#reader-contents a[data-rd="why"]');
      await p.waitForTimeout(300);
      await settle(p);
      const s3 = await state();
      const landed = await p.evaluate(() => {
        const t = document.getElementById('why').getBoundingClientRect().top;
        const r = document.querySelector('.rd-toggle').getBoundingClientRect();
        return { top: t, bTop: r.top, bBottom: r.bottom, h: innerHeight };
      });
      const clear = landed.bTop > landed.h / 2 ? landed.top < landed.bTop : landed.top >= landed.bBottom - 1;
      ok(!s3.open && clear && landed.top >= 0 && landed.top < 120,
         `${tag}: a link closes it and lands its slide near the top, clear of the button`, JSON.stringify({ s3, landed }));
      ok(await current(p) === 'why', `${tag}: and the scroll-spy follows`, await current(p));

      // A click beside it closes it and is spent there - it opens nothing.
      await p.click('.rd-toggle');
      await p.waitForTimeout(250);
      await p.mouse.click(viewport.width - 10, viewport.height / 2);
      await p.waitForTimeout(250);
      const s4 = await state();
      const lb = await p.evaluate(() => document.body.classList.contains('lb-open'));
      ok(!s4.open && !lb, `${tag}: a click beside it closes it and does nothing else`, JSON.stringify({ s4, lb }));
      ok(errors.length === 0, `${tag}: no page errors`, errors.join(' | '));
      await ctx.close();
    }

    // ── without scripts the page is the page it was ──
    {
      const { p, ctx } = await open({ width: 1440, height: 900 }, 'print.html', { javaScriptEnabled: false });
      const g = await p.evaluate(() => ({
        nav: getComputedStyle(document.getElementById('reader-contents')).display,
        toggle: getComputedStyle(document.querySelector('.rd-toggle')).display,
        pad: getComputedStyle(document.body).paddingLeft,
      })).catch(() => null);
      // evaluate runs in the page's isolated world even with scripts off.
      ok(g && g.nav === 'none' && g.toggle === 'none' && g.pad === '0px',
         'without scripts, no sidebar, no button and no reserved margin', JSON.stringify(g));
      await ctx.close();
    }

    // ── reader: off ships none of it, and keeps the lightbox ──
    {
      const html = fs.readFileSync(path.join(offDir, 'print.html'), 'utf8');
      // The stylesheet is shared and ships either way; every rule in it is keyed
      // off the attribute and the class, which are what must be missing.
      ok(!html.includes('id="reader-contents"') && !html.includes("classList.add('rd-ready')")
         && !html.includes("getElementById('reader-contents')") && !html.includes('data-reader="on"'),
         'reader: off ships no sidebar, no reader script and no attribute for its CSS');
      ok(html.includes("box.id = 'lightbox'"), 'and still ships the lightbox, which is not a reader tool');
      const { p, ctx, errors } = await open({ width: 1440, height: 900 }, 'print.html', { port: off.port });
      const g = await p.evaluate(() => ({
        pad: getComputedStyle(document.body).paddingLeft + ' ' + getComputedStyle(document.body).paddingRight,
        lb: document.body.classList.contains('lb-ready'),
      }));
      ok(g.pad === '0px 0px' && g.lb, 'reader: off lays the text out as before, lightbox armed', JSON.stringify(g));
      ok(errors.length === 0, 'reader: off: no page errors', errors.join(' | '));
      await ctx.close();
    }
    note('breakpoints: wide from 1216px, notes column from 920px');
  } finally {
    server.close();
    off.server.close();
  }
}
