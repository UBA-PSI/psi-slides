/*
 * A document (kind: document) in a browser: where its margin notes stand,
 * and the numbers a reader sees.
 *
 * test/settings.mjs holds what the build writes - one view, the numbers in
 * the markup, the attributes, the linter's silence. What only a laid-out page
 * can answer is here, and all of it is geometry measured against the page's
 * own boxes rather than against a coordinate:
 *
 *  - on a wide screen every ::: marginalia stands right of the text column
 *    and inside the window, level with the block written after it unless the
 *    note above pushed it down, and no two notes overlap - several in one
 *    chunk, a picture in one, two written back to back;
 *  - just above the wide breakpoint, where a zoomed-in browser lands, the
 *    text column starts right of the fixed contents sidebar;
 *  - between the reader's breakpoint and the wide layout the same holds in
 *    the narrower column the layout keeps;
 *  - on a phone there is no margin, and the note is the aside in the column
 *    it always was;
 *  - a reader's note card in the same column steps out of a margin note's
 *    way rather than covering the author's words;
 *  - the section numbers the build writes are the ones a reader sees, in
 *    the headings and in the contents sidebar, where a lecture would show
 *    none under slide-numbers: off;
 *  - a ::: footnote stands in the margin level with the block written
 *    before its opener, ends before the next part, and under the breakpoint
 *    is the labelled block under the chunk again;
 *  - a dark system gets a dark page with legible notes and pictures on a
 *    light panel; the sidebar's Page and Text switches change and store the
 *    scheme and the face, a reload keeps them, Auto forgets the scheme,
 *    paper stays light in the authored face, and without storage the
 *    switches still work.
 *
 * Chromium only, like the rest of the suite; the same layout was checked by
 * eye in WebKit when it landed, and the construction is Tufte's float, which
 * both engines have drawn the same way for a decade.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, serve } from './harness.mjs';

export const name = 'document · margin notes beside their paragraph, section numbers';
export const lecture = 'tutorial';   // built for other specs already; unused here
export const view = 'audience';

const words = (n, seed) => Array.from({ length: n }, (_, i) => ['the', 'booklet', 'page', 'exam', 'note',
  'lecture', 'reading', 'script', 'tutorial', 'week'][(i * 7 + seed) % 10]).join(' ');
const para = (n, seed) => words(n, seed).replace(/^./, c => c.toUpperCase()) + '.';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SOURCE = `---
title: A syllabus
presenter: Somebody
kind: document
---

## title: {#title}

## About {#about}

${para(80, 1)}

# Course Format {#format}

## Materials {#materials}

::: marginalia
A short note beside the first paragraph.
:::

${para(90, 2)}

::: marginalia
![](pic)

A picture and a line under it.
:::

${para(30, 3)}

::: marginalia
A long note written right before a short paragraph, so that it reaches past the paragraph it belongs to. ${words(60, 4)}.
:::

${para(20, 5)}

::: marginalia
The note after the long one, which has to stand under it.
:::

${para(60, 6)}

### A subsection {#sub}

${para(70, 7)}

## Tutorials {#tutorials}

${para(120, 8)}

${para(12, 11)}

::: footnote
A source for the tutorials, long enough to run past the short paragraph it stands beside: ${words(40, 12)}.
:::

# Booklet {#booklet}

## Requirements {#requirements}

${para(60, 9)}

::: marginalia
Beside the paragraph a reader will mark.
:::

Highlight these exact words for the reader test. ${para(60, 10)}
`;

const selectText = (p, needle) => p.evaluate((needle) => {
  const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const i = n.data.indexOf(needle);
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + needle.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  }
  return false;
}, needle);

// Every note, its box, the box of the block written after it, and the text
// column - all in page coordinates.
const geometry = (p) => p.evaluate(() => {
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }; };
  const body = document.querySelector('#materials > p');
  const col = body.getBoundingClientRect();
  return {
    vw: innerWidth,
    scrollW: document.documentElement.scrollWidth,
    col: { l: col.left, r: col.right },
    notes: [...document.querySelectorAll('main .marginalia')].map(n => ({
      ...R(n),
      float: getComputedStyle(n).float,
      next: n.nextElementSibling ? R(n.nextElementSibling) : null,
      img: n.querySelector('img') ? R(n.querySelector('img')) : null,
    })),
  };
});

function checkMargin(g, ok, where) {
  ok(g.notes.length === 5 && g.notes.every(n => n.float === 'right'),
     `${where}: every note is floated into the margin`, g.notes.map(n => n.float).join(','));
  ok(g.notes.every(n => n.l >= g.col.r + 8), `${where}: each note stands right of the text column, with a gap`,
     JSON.stringify(g.notes.map(n => Math.round(n.l - g.col.r))));
  ok(g.notes.every(n => n.r <= g.vw) && g.scrollW <= g.vw,
     `${where}: and inside the window - nothing scrolls sideways`, `${g.scrollW} / ${g.vw}`);
  const overlaps = [];
  for (let i = 1; i < g.notes.length; i++) if (g.notes[i].t < g.notes[i - 1].b - 0.5) overlaps.push(i);
  ok(!overlaps.length, `${where}: no note overlaps the one above it`, overlaps.join(','));
  // Level with the block that follows it, or - pushed by the note above -
  // directly under that note.
  const off = g.notes.map((n, i) => {
    const level = Math.abs(n.t - n.next.t) <= 8;
    const pushed = i > 0 && g.notes[i - 1].b > n.next.t && n.t - g.notes[i - 1].b < 24;
    return level || pushed ? null : `${i}: ${Math.round(n.t - n.next.t)}px from its paragraph`;
  }).filter(Boolean);
  ok(!off.length, `${where}: each note is level with the paragraph after it, or right under the note that pushed it`,
     off.join('; '));
  const pic = g.notes[1].img;
  ok(!!pic && pic.l >= g.notes[1].l - 0.5 && pic.r <= g.notes[1].r + 0.5 && pic.t - g.notes[1].t < 12,
     `${where}: a picture in a note is the note's width and stands at its head`, JSON.stringify([pic, g.notes[1]]));
}

export async function run({ page, report }) {
  const { ok } = report;
  const browser = page.context().browser();
  const dir = tmpDir('psi-document-');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'pic.png'), Buffer.from(PNG, 'base64'));
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const built = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  ok(built.status === 0, 'the fixture document builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;
  const { server, port } = await serve(dir);
  const errors = [];
  const open = async (viewport) => {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${port}/print.html`, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    return { p, ctx };
  };
  try {
    // ── wide: the contents sidebar on the left, the notes on the right ──
    {
      const { p, ctx } = await open({ width: 1440, height: 900 });
      checkMargin(await geometry(p), ok, '1440px');

      const nums = await p.evaluate(() => ({
        parts: [...document.querySelectorAll('.column-heading .sec-num')].map(e => e.textContent),
        chunks: [...document.querySelectorAll('.chunk-heading .sec-num')].map(e => e.textContent),
        sidebar: [...document.querySelectorAll('#psiINT-reader-contents .rd-num')]
          .filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent),
        slideNum: [...document.querySelectorAll('.chunk-num')].some(e => getComputedStyle(e).display !== 'none'),
        label: !!document.querySelector('.chunk-label'),
        sub: !!document.querySelector('h3#sub'),
      }));
      ok(nums.parts.join() === '1,2' && nums.chunks.join() === '1.1,1.2,2.1',
         'the headings carry the parts\' and the sections\' numbers', JSON.stringify(nums));
      ok(nums.sidebar.join() === ',1.1,1.2,2.1',
         'and the sidebar shows the same numbers under slide-numbers: off, the front matter unnumbered',
         JSON.stringify(nums.sidebar));
      ok(!nums.slideNum && !nums.label, 'no slide number in the margin and no type word over a chunk');
      ok(nums.sub, 'a ### heading with {#id} carries the id');

      // A footnote: in the margin, level with the block it was written
      // after, and ended with its chunk - never beside the next heading.
      const fn = await p.evaluate(() => {
        const slot = document.querySelector('#tutorials > .fn-slot');
        if (!slot) return null;
        const R = (e) => e.getBoundingClientRect();
        const col = R(document.querySelector('#tutorials > p'));
        const next = R(document.querySelector('#booklet .column-heading'));
        return { float: getComputedStyle(slot).float, l: R(slot).left, colR: col.right, t: R(slot).top, b: R(slot).bottom,
                 anchor: R(slot.nextElementSibling).top, next: next.top,
                 label: getComputedStyle(slot.querySelector('aside'), '::before').content };
      });
      ok(!!fn && fn.float === 'right' && fn.l >= fn.colR + 8 && Math.abs(fn.t - fn.anchor) <= 8,
         'a footnote stands in the margin, level with the block it was written after', JSON.stringify(fn));
      ok(!!fn && fn.b <= fn.next, 'and ends before the next part begins, however long it runs', JSON.stringify(fn));
      ok(!!fn && (fn.label === 'none' || fn.label === 'normal'), 'without the NOTE label it wears under a chunk', JSON.stringify(fn));

      // A reader's note card in the column the notes stand in.
      await p.evaluate(() => document.getElementById('requirements').scrollIntoView());
      await p.waitForTimeout(150);
      ok(await selectText(p, 'Highlight these exact words'), 'the reader test finds its words');
      await p.waitForTimeout(200);
      const shown = await p.evaluate(() => { const b = document.querySelector('.rd-mark-btn'); return !!b && !b.hidden; });
      ok(shown, 'and the mark button comes up');
      if (shown) {
        await p.click('.rd-mark-btn');
        await p.waitForTimeout(150);
        await p.keyboard.type('A reader\'s own note, long enough to need a second line in its card.');
        await p.mouse.click(200, 850);
        await p.waitForTimeout(300);
        const clash = await p.evaluate(() => {
          const card = document.querySelector('.rd-notes > .rd-card');
          const note = [...document.querySelectorAll('#requirements .marginalia')][0];
          if (!card || !note) return { missing: true };
          const a = card.getBoundingClientRect(), b = note.getBoundingClientRect();
          const m = document.querySelector('mark.rd-hl').getBoundingClientRect();
          return { overlap: a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right,
                   // the card's own place, level with its highlight, is inside the note:
                   // without the step aside the two would cover each other
                   wanted: m.top >= b.top - 8 && m.top < b.bottom,
                   card: [Math.round(a.top), Math.round(a.bottom)], note: [Math.round(b.top), Math.round(b.bottom)] };
        });
        ok(!clash.missing && clash.wanted, 'the highlight stands level with a margin note, so its card would cover it',
           JSON.stringify(clash));
        ok(!clash.missing && !clash.overlap, 'a reader\'s note card steps out of a margin note\'s way', JSON.stringify(clash));
      }
      await ctx.close();
    }

    // ── just above the wide breakpoint, where a zoomed-in browser lands: the
    // text column clears the fixed sidebar. The margin-note rule's :has()
    // once outweighed the reader's padding, and its 1.5rem on the left put
    // the text under the contents – at 1440 the centred column hid it. ──
    {
      const { p, ctx } = await open({ width: 1240, height: 800 });
      checkMargin(await geometry(p), ok, '1240px');
      const clear = await p.evaluate(() => ({
        side: document.getElementById('psiINT-reader-contents').getBoundingClientRect().right,
        text: document.querySelector('main').getBoundingClientRect().left,
      }));
      ok(clear.text >= clear.side, '1240px: the text column starts right of the contents sidebar', JSON.stringify(clear));
      await ctx.close();
    }

    // ── medium: the layout keeps the notes column, the contents fold away ──
    {
      const { p, ctx } = await open({ width: 1024, height: 800 });
      checkMargin(await geometry(p), ok, '1024px');
      await ctx.close();
    }

    // ── dark on screen, the reader's two switches, and paper ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const p = await ctx.newPage();
      p.on('pageerror', e => errors.push(String(e)));
      const url = `http://127.0.0.1:${port}/print.html`;
      await p.goto(url, { waitUntil: 'load' });
      await p.waitForTimeout(200);
      const look = () => p.evaluate(() => {
        const cs = (e) => getComputedStyle(e);
        const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return c.startsWith('oklch') ? m[0] : (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
        const pic = document.querySelector('figure.figure-img');
        return {
          scheme: document.documentElement.getAttribute('data-scheme'),
          face: document.documentElement.getAttribute('data-face'),
          ink: lum(cs(document.body).color),
          paper: lum(cs(document.documentElement).backgroundColor),
          note: lum(cs(document.querySelector('.marginalia')).color),
          pic: pic ? lum(cs(pic).backgroundColor) : null,
          font: cs(document.body).fontFamily,
          pressed: [...document.querySelectorAll('.rd-view [aria-pressed=true]')].map(b => b.textContent).join(','),
          stored: (() => { try { return [localStorage.getItem('psi-reader:scheme'), localStorage.getItem('psi-reader:face')]; } catch (e) { return ['x', 'x']; } })(),
        };
      });
      let l = await look();
      ok(l.ink > 0.8 && l.paper < 0.3 && l.note > 0.5 && l.scheme === null && l.pressed === 'Auto,Serif',
         'a dark system gets a dark page: light ink, a dark ground, a legible margin note, and Auto pressed', JSON.stringify(l));
      ok(l.pic !== null && l.pic > 0.8, 'and a picture stands on a panel of the light paper', JSON.stringify(l));
      await p.click('.rd-view [data-set-scheme=light]');
      await p.click('.rd-view [data-set-face=sans]');
      l = await look();
      ok(l.scheme === 'light' && l.ink < 0.3 && l.paper > 0.8 && /IBM Plex Sans/.test(l.font) && l.pressed === 'Light,Sans'
         && l.stored.join() === 'light,sans',
         'Light and Sans take the page light and the text into the sans, and are stored', JSON.stringify(l));
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(200);
      l = await look();
      ok(l.scheme === 'light' && /IBM Plex Sans/.test(l.font) && l.pressed === 'Light,Sans',
         'a reload keeps both choices', JSON.stringify(l));
      // Dark system, dark chosen, sans chosen - and printed.
      await p.emulateMedia({ media: 'print', colorScheme: 'dark' });
      await p.evaluate(() => document.documentElement.setAttribute('data-scheme', 'dark'));
      l = await look();
      ok(l.ink < 0.3 && !/IBM Plex Sans/.test(l.font), 'on paper the page is the author\'s: light, in the authored face, whatever the reader chose', JSON.stringify(l));
      await p.emulateMedia({ media: 'screen', colorScheme: 'dark' });
      await p.click('.rd-view [data-set-scheme=auto]');
      l = await look();
      ok(l.scheme === null && l.ink > 0.8 && l.stored[0] === null, 'Auto hands the page back to the system and forgets the choice', JSON.stringify(l));
      await ctx.close();
      // A browser that refuses storage: the switches still switch.
      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
      const q = await ctx2.newPage();
      const qErr = [];
      q.on('pageerror', e => qErr.push(String(e)));
      await q.goto(url, { waitUntil: 'load' });
      await q.waitForTimeout(200);
      await q.click('.rd-view [data-set-scheme=dark]');
      const dk = await q.evaluate(() => [document.documentElement.getAttribute('data-scheme'), getComputedStyle(document.body).color]);
      ok(dk[0] === 'dark' && /oklch\(0\.95/.test(dk[1]) && !qErr.length,
         'without storage the switch still works, for as long as the page is open', JSON.stringify([dk, qErr]));
      await ctx2.close();
    }

    // ── a phone: no margin, so the note is the aside in the column ──
    {
      const { p, ctx } = await open({ width: 390, height: 844 });
      const g = await geometry(p);
      ok(g.notes.every(n => n.float === 'none' && n.l >= g.col.l - 1 && n.r <= g.col.r + 1),
         '390px: every note falls back to the aside inside the text column',
         JSON.stringify(g.notes.map(n => [n.float, Math.round(n.l), Math.round(n.r)])));
      ok(g.scrollW <= g.vw, '390px: nothing scrolls sideways', `${g.scrollW} / ${g.vw}`);
      const fnNarrow = await p.evaluate(() => {
        const slot = document.querySelector('#tutorials > .fn-slot');
        const paras = [...document.querySelectorAll('#tutorials > p')];
        const last = paras[paras.length - 1].getBoundingClientRect();
        const r = slot.getBoundingClientRect();
        return { top: r.top, lastBottom: last.bottom, left: r.left, colL: last.left, right: r.right, colR: last.right,
                 label: getComputedStyle(slot.querySelector('aside'), '::before').content };
      });
      ok(fnNarrow.top >= fnNarrow.lastBottom && fnNarrow.left >= fnNarrow.colL - 1 && fnNarrow.right <= fnNarrow.colR + 1
         && /note/i.test(fnNarrow.label),
         '390px: the footnote is the labelled block under its chunk it always was', JSON.stringify(fnNarrow));
      const pic = g.notes[1].img;
      ok(!!pic && pic.r - pic.l <= 11 * 16, '390px: a note\'s picture keeps a margin note\'s size in the column',
         JSON.stringify(pic));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  ok(!errors.length, 'the document raised no page errors', errors.join(' | '));
}
