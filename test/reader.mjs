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
 *
 * The second half is the reader's highlights, on a second deck of its own:
 * a chunk that holds every kind of thing a selection must not reach (a
 * formula, a code block, a speaker note, a figure), a divider lede, and two
 * chunks the deck is rebuilt with different words in - one where the quote
 * moves and breaks across a line, which must re-anchor, and one where it is
 * gone, which must be listed and kept. Selections are made with a DOM range,
 * and the button that marks one is pressed with the pointer, which is the
 * half that has to survive a real click.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, ROOT } from './harness.mjs';

export const name = 'reader · the documents carry a contents sidebar and the reader\'s highlights';
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

const hlDeck = (v2 = false) => `---
title: Highlight fixture
---

## title: {#title}

# First part {#part-one}

Divider lede a reader can mark as well.

## definition: A term {#term}

The initialisation vector is XORed into the first block before encryption. The rest of **this paragraph** explains why it matters at all.

- one item in a list
- second item in a list

$$a^2 + b^2 = c^2$$

\`\`\`js
const secret = 1;
\`\`\`

> note: Speaker words that are not the reader's.

## figure: A figure {#fig}

Words before the figure.

::: draw 8x3
box a "Alpha" at 1,1
box b "Beta" at 5,1
edge a -> b
:::

# Second part {#part-two}

## free: Moving words {#moving}

${v2
  ? 'A new first sentence was added above. Some opening words, edited. The quoted sentence that\nwill move lives here. Closing words.'
  : 'Some opening words. The quoted sentence that will move lives here. Closing words.'}

## free: Doomed words {#doomed}

${v2 ? 'Rewritten from the first word to the last.' : 'This sentence carries the unlucky quote that will vanish.'}
`;

// Selects the first occurrence of `needle` in the text under `scope`, across
// node boundaries - a highlight splits the text it covers into several nodes.
const selectText = (p, needle, scope = 'main') => p.evaluate(([needle, scope]) => {
  const root = document.querySelector(scope);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
  const text = nodes.map(n => n.data).join('');
  const i = text.indexOf(needle);
  if (i < 0) return false;
  const at = (pos, end) => {
    let acc = 0;
    for (const n of nodes) {
      if (end ? pos <= acc + n.data.length : pos < acc + n.data.length) return [n, pos - acc];
      acc += n.data.length;
    }
  };
  const r = document.createRange();
  r.setStart(...at(i, false));
  r.setEnd(...at(i + needle.length, true));
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}, [needle, scope]);
const buttonShown = (p) => p.evaluate(() => {
  const b = document.querySelector('.rd-mark-btn');
  return !!b && !b.hidden && b.getBoundingClientRect().width > 0;
});
const marks = (p) => p.evaluate(() => {
  const by = {};
  for (const m of document.querySelectorAll('mark.rd-hl')) (by[m.dataset.hl] ||= []).push(m.textContent);
  return Object.values(by).map(a => a.join(''));
});
const stored = (p) => p.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('psi-reader:v1:'));
  return k ? { key: k, items: JSON.parse(localStorage.getItem(k)) } : { key: null, items: [] };
});
const squash = (t) => t.replace(/\s+/g, ' ').trim();
// Where the way through the highlights stands: the pill, the open highlight,
// what has the focus, and each contents entry's count.
const navState = (p) => p.evaluate(() => {
  const pill = document.querySelector('.rd-nav');
  const f = document.querySelector('mark.rd-hl.is-focus');
  const fr = f && f.getBoundingClientRect();
  const counts = {};
  for (const c of document.querySelectorAll('#reader-contents .rd-count')) {
    const a = c.closest('a');
    counts[a.dataset.rd || a.getAttribute('href').slice(1)] = c.textContent;
  }
  return {
    shown: !!pill && !pill.hidden && getComputedStyle(pill).display !== 'none',
    pos: pill ? pill.querySelector('.rd-pos').textContent : null,
    prev: pill ? pill.querySelector('.rd-prev').disabled : null,
    next: pill ? pill.querySelector('.rd-next').disabled : null,
    focus: f ? [...document.querySelectorAll('mark.rd-hl[data-hl="' + f.dataset.hl + '"]')].map(m => m.textContent).join('') : null,
    inView: !!fr && fr.top >= 0 && fr.bottom <= innerHeight,
    cardFocused: !!document.activeElement && document.activeElement.classList.contains('rd-card'),
    counts,
  };
});

async function highlights({ browser, ok, note }) {
  const dir = tmpDir('psi-reader-hl-');
  const built = build(dir, hlDeck());
  ok(built.status === 0, 'highlights: the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;
  const { server, port } = await serve(dir);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = async (file = 'print.html', c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', e => errors.push(file + ': ' + String(e)));
    await p.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'load' });
    await p.waitForTimeout(250);
    return p;
  };
  const make = async (p, needle, scope) => {
    await selectText(p, needle, scope);
    await p.waitForTimeout(150);
    if (!(await buttonShown(p))) return false;
    await p.click('.rd-mark-btn');
    await p.waitForTimeout(100);
    return true;
  };
  try {
    const p = await page();

    // ── making one ──
    ok(await selectText(p, 'initialisation vector is XORed'), 'highlights: the fixture sentence is there to select');
    await p.waitForTimeout(150);
    ok(await buttonShown(p), 'a selection in running text brings up the button that marks it');
    await p.click('.rd-mark-btn');
    await p.waitForTimeout(100);
    const made = await p.evaluate(() => ({
      marks: [...document.querySelectorAll('mark.rd-hl')].map(m => m.textContent).join(''),
      active: document.activeElement && document.activeElement.className,
      card: !!document.querySelector('.rd-notes > .rd-card.is-focus'),
      sel: String(getSelection()),
      button: !!document.querySelector('.rd-mark-btn:not([hidden])'),
    }));
    ok(made.marks === 'initialisation vector is XORed' && made.card && made.active === 'rd-note'
       && !made.sel && !made.button,
       'pressing it marks the words, clears the selection and opens a card with the cursor in its note',
       JSON.stringify(made));
    await p.keyboard.type('Why the IV?');
    let st = await stored(p);
    const first = st.items[0] || {};
    ok(st.items.length === 1 && first.chunk === 'term' && first.quote === 'initialisation vector is XORed'
       && first.note === 'Why the IV?' && first.kind === 'mark' && first.v === 1
       && typeof first.start === 'number' && first.prefix.endsWith('The ') && first.suffix.startsWith(' into'),
       'the store holds one entry: chunk, offsets, quote, context, note', JSON.stringify(st));
    ok(/^psi-reader:v1:psi-reader-hl-/.test(st.key || ''), 'filed under the source folder\'s name', st.key);

    // ── the card stands in the notes column, level with its highlight ──
    const geo = await p.evaluate(() => {
      const m = document.querySelector('mark.rd-hl').getBoundingClientRect();
      const c = document.querySelector('.rd-notes > .rd-card').getBoundingClientRect();
      const t = document.querySelector('#term p').getBoundingClientRect();
      return { mTop: m.top, cTop: c.top, cLeft: c.left, cRight: c.right, tRight: t.right, w: innerWidth,
               sw: document.documentElement.scrollWidth };
    });
    ok(geo.cLeft >= geo.tRight && geo.cRight <= geo.w && Math.abs(geo.cTop - geo.mTop) < 24 && geo.sw <= geo.w,
       '1440px: the card is right of the text, inside the window, level with its highlight', JSON.stringify(geo));

    // ── a selection that overlaps it grows it ──
    ok(await make(p, 'XORed into the first block'), 'an overlapping selection is offered the button too');
    st = await stored(p);
    const m1 = await marks(p);
    ok(st.items.length === 1 && m1.length === 1 && m1[0] === 'initialisation vector is XORed into the first block'
       && st.items[0].note === 'Why the IV?',
       'and marking it merges the two into one highlight that keeps the note', JSON.stringify({ m1, st }));

    // ── what cannot be marked ──
    for (const [needle, what] of [['const secret', 'a code block'], ['Alpha', 'a figure']]) {
      await selectText(p, needle);
      await p.waitForTimeout(150);
      ok(!(await buttonShown(p)), `a selection inside ${what} is refused`);
    }
    {
      // KaTeX text is split into one node per glyph; select the whole formula.
      await p.evaluate(() => {
        const k = document.querySelector('#term .math-display .katex-html');
        const r = document.createRange();
        r.selectNodeContents(k);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      await p.waitForTimeout(150);
      ok(!(await buttonShown(p)), 'a selection inside a formula is refused');
    }
    // A selection that runs from one chunk into the next is clipped to the
    // one it started in.
    await p.evaluate(() => {
      const a = document.querySelector('#term li:last-child').firstChild;
      const b = document.querySelector('#fig p').firstChild;
      const r = document.createRange();
      r.setStart(a, 0);
      r.setEnd(b, 5);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await p.waitForTimeout(150);
    await p.click('.rd-mark-btn');
    await p.waitForTimeout(100);
    st = await stored(p);
    const clipped = st.items.find(h => h.quote.startsWith('second item'));
    ok(clipped && clipped.chunk === 'term' && !clipped.quote.includes('Words'),
       'a selection across a chunk boundary is clipped to the chunk it started in', JSON.stringify(clipped));
    // A divider's lede is anchored to its column.
    ok(await make(p, 'Divider lede'), 'a divider lede can be marked');
    st = await stored(p);
    ok(st.items.some(h => h.chunk === 'part-one' && h.quote === 'Divider lede'),
       'and its highlight is filed under the column', JSON.stringify(st.items.map(h => h.chunk)));

    // ── two notes on one line do not stand on each other ──
    ok(await make(p, 'explains why'), 'a second highlight on the same paragraph');
    await p.keyboard.type('A second note, long enough to wrap onto a second line in the margin card.');
    await p.mouse.click(700, 20);
    await p.waitForTimeout(150);
    const packed = await p.evaluate(() => [...document.querySelectorAll('.rd-notes > .rd-card')]
      .map(c => c.getBoundingClientRect()).map(r => [r.top, r.bottom]).sort((a, b) => a[0] - b[0]));
    ok(packed.length === 2 && packed[1][0] >= packed[0][1],
       'the cards of two highlights on nearby lines are packed, not overlapped', JSON.stringify(packed));
    const plain = await p.evaluate(() => document.querySelectorAll('.rd-notes > .rd-card').length);
    ok(plain === 2, 'a highlight with no note has no card until it is opened', String(plain));

    // ── the way through them: the pill, n and p, the counts ──
    // Four highlights now, in page order: the lede, two in #term's paragraph
    // (both with a note), one in its list.
    let nv = await navState(p);
    ok(nv.shown && nv.pos === '– / 4', 'with highlights on the page the pill is shown, none of them open', JSON.stringify(nv));
    ok(nv.counts.term === '3' && nv.counts['part-one'] === '1' && Object.keys(nv.counts).length === 2,
       'the contents count them per slide, and a lede\'s on its part', JSON.stringify(nv.counts));
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.keyboard.press('n');
    await p.waitForTimeout(100);
    nv = await navState(p);
    ok(nv.focus === 'Divider lede' && nv.pos === '1 / 4' && nv.cardFocused && nv.inView && nv.prev,
       'n from the top of the page opens the first highlight, in view, with its card focused', JSON.stringify(nv));
    const order = [nv.focus];
    for (let i = 0; i < 3; i++) { await p.keyboard.press('n'); await p.waitForTimeout(60); order.push((await navState(p)).focus); }
    ok(JSON.stringify(order.map(t => t.slice(0, 12))) === JSON.stringify(['Divider lede', 'initialisati', 'explains why', 'second item ']),
       'n walks them in the page\'s order', JSON.stringify(order));
    nv = await navState(p);
    ok(nv.pos === '4 / 4' && nv.next && !nv.prev, 'on the last one the next arrow is off', JSON.stringify(nv));
    await p.keyboard.press('n');
    await p.waitForTimeout(60);
    ok((await navState(p)).pos === '4 / 4', 'and n there stays put: the way stops at the ends rather than wrapping');
    await p.keyboard.press('p');
    await p.waitForTimeout(60);
    nv = await navState(p);
    ok(nv.pos === '3 / 4' && nv.focus.startsWith('explains why'), 'p goes back one', JSON.stringify(nv));
    await p.click('.rd-nav .rd-f-notes');
    await p.waitForTimeout(60);
    nv = await navState(p);
    ok(nv.pos === '2 / 2', 'with note: the count is of the highlights that have one', JSON.stringify(nv));
    await p.click('.rd-nav .rd-prev');
    await p.waitForTimeout(60);
    nv = await navState(p);
    ok(nv.pos === '1 / 2' && nv.focus.startsWith('initialisation') && nv.prev,
       'and the arrow goes to the previous one with a note', JSON.stringify(nv));
    await p.keyboard.press('n');
    await p.waitForTimeout(60);
    await p.keyboard.press('n');
    await p.waitForTimeout(60);
    nv = await navState(p);
    ok(nv.pos === '2 / 2' && nv.focus.startsWith('explains why'), 'n under the filter skips the one without a note', JSON.stringify(nv));
    await p.click('.rd-nav .rd-f-all');
    await p.waitForTimeout(60);
    ok((await navState(p)).pos === '3 / 4', 'all: back to every highlight, from where the reader is');
    // Keys are the text field's while one has the focus.
    await p.click('.rd-card.is-focus .rd-note');
    await p.evaluate(() => { const t = document.activeElement; t.selectionStart = t.selectionEnd = t.value.length; });
    await p.keyboard.press('n');
    await p.waitForTimeout(60);
    nv = await navState(p);
    const typed = await p.evaluate(() => document.querySelector('.rd-card.is-focus .rd-note').value);
    ok(nv.pos === '3 / 4' && typed.endsWith('card.n'), 'n typed in a note is a letter in the note', JSON.stringify({ nv, typed }));
    await p.keyboard.press('Backspace');
    await p.evaluate(() => document.activeElement.blur());
    for (const combo of ['Alt+n', 'Control+p', 'Shift+N']) {
      await p.keyboard.press(combo);
      await p.waitForTimeout(40);
    }
    ok((await navState(p)).pos === '3 / 4', 'n and p with a modifier are not the way through');
    // A click on a figure puts the open highlight away, as any click beside
    // it does, and opens the lightbox.
    await p.click('#fig .psi-diagram');
    await p.waitForTimeout(150);
    const lbOpen = await p.evaluate(() => document.body.classList.contains('lb-open'));
    await p.keyboard.press('n');
    await p.waitForTimeout(60);
    nv = await navState(p);
    ok(lbOpen && nv.pos === '– / 4' && !nv.focus && !nv.shown,
       'with the lightbox open, n does nothing and the pill is under it', JSON.stringify({ lbOpen, nv }));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.mouse.click(700, 20);
    await p.waitForTimeout(100);

    // ── persisted, and the same in the other document ──
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(250);
    const after = await marks(p);
    ok(after.includes('initialisation vector is XORed into the first block') && after.length === 4,
       'after a reload every highlight is painted again', JSON.stringify(after));
    const noteBack = await p.evaluate(() => [...document.querySelectorAll('.rd-note')].map(t => t.value));
    ok(noteBack.includes('Why the IV?'), 'and its note is on its card', JSON.stringify(noteBack));
    const before = (await stored(p)).items;
    const pn = await page('print-notes.html');
    const inNotes = await marks(pn);
    const afterNotes = (await stored(pn)).items;
    ok(JSON.stringify(inNotes.sort()) === JSON.stringify(after.sort())
       && JSON.stringify(before) === JSON.stringify(afterNotes),
       'print-notes.html paints the same highlights at the same offsets, speaker notes and all',
       JSON.stringify({ inNotes, after }));
    await selectText(pn, 'Speaker words', '.speaker-note');
    await pn.waitForTimeout(150);
    ok(!(await buttonShown(pn)), 'a selection inside a speaker note is refused');
    await pn.close();

    // ── remove, and undo it ──
    await p.click('mark.rd-hl >> text=initialisation');
    await p.waitForTimeout(100);
    const opened = await p.evaluate(() => {
      const c = document.querySelector('.rd-card.is-focus');
      return c && { note: c.querySelector('.rd-note').value, actions: getComputedStyle(c.querySelector('.rd-actions')).display };
    });
    ok(opened && opened.note === 'Why the IV?' && opened.actions !== 'none',
       'a click on a highlight opens its card, with its actions', JSON.stringify(opened));
    await p.click('.rd-card.is-focus .rd-remove');
    await p.waitForTimeout(100);
    const gone = await p.evaluate(() => ({
      marks: [...document.querySelectorAll('mark.rd-hl')].some(m => m.textContent.includes('initialisation')),
      toast: !!document.querySelector('.rd-toast:not([hidden])'),
      text: document.querySelector('#term p').textContent,
    }));
    st = await stored(p);
    ok(!gone.marks && gone.toast && st.items.length === 3 && gone.text.startsWith('The initialisation vector'),
       'remove unwraps the words at once, drops the entry, and offers an undo', JSON.stringify({ gone, n: st.items.length }));
    nv = await navState(p);
    ok(nv.counts.term === '2' && nv.pos === '– / 3', 'the slide\'s count and the pill follow the remove', JSON.stringify(nv));
    await p.click('.rd-toast .rd-undo');
    await p.waitForTimeout(100);
    st = await stored(p);
    const back = await marks(p);
    ok(st.items.length === 4 && back.includes('initialisation vector is XORed into the first block')
       && st.items.some(h => h.note === 'Why the IV?'),
       'undo puts it back, note and all', JSON.stringify(back));
    ok((await navState(p)).counts.term === '3', 'and the count with it');

    // ── delete the note, and undo that ──
    await p.click('mark.rd-hl >> text=initialisation');
    await p.waitForTimeout(100);
    await p.click('.rd-card.is-focus .rd-clear');
    await p.waitForTimeout(100);
    st = await stored(p);
    const cleared = st.items.find(h => h.quote.startsWith('initialisation'));
    ok(cleared && cleared.note === '' && (await marks(p)).includes('initialisation vector is XORed into the first block'),
       'delete note empties the note and keeps the highlight', JSON.stringify(cleared));
    await p.click('.rd-toast .rd-undo');
    await p.waitForTimeout(100);
    st = await stored(p);
    ok(st.items.find(h => h.quote.startsWith('initialisation')).note === 'Why the IV?', 'and undo brings the note back');

    // ── a rebuild moves the words ──
    ok(await make(p, 'quoted sentence that will move'), 'a highlight in the chunk that is about to change');
    ok(await make(p, 'unlucky quote'), 'and one whose words are about to disappear');
    await p.keyboard.type('Lost note');
    const rebuilt = build(dir, hlDeck(true));
    ok(rebuilt.status === 0, 'the fixture rebuilds with other words', rebuilt.stderr);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(250);
    const moved = await marks(p);
    st = await stored(p);
    const mv = st.items.find(h => h.chunk === 'moving');
    ok(moved.some(t => squash(t) === 'quoted sentence that will move') && mv && mv.start > 60,
       'an edit in the same chunk moves the highlight with its words, across a line break', JSON.stringify({ moved, mv }));
    const lost = await p.evaluate(() => [...document.querySelectorAll('[data-reader-slot=tools] .rd-orphans li')]
      .map(li => li.textContent));
    ok(lost.length === 1 && lost[0].includes('unlucky quote') && lost[0].includes('Lost note')
       && st.items.some(h => h.chunk === 'doomed'),
       'a quote that is gone is listed in the sidebar foot with its note, and kept in the store', JSON.stringify(lost));
    ok(!(await p.evaluate(() => [...document.querySelectorAll('mark.rd-hl')].some(m => m.closest('#doomed')))),
       'and nothing is painted in its chunk');
    await p.click('[data-reader-slot=tools] .rd-orphan-remove');
    await p.waitForTimeout(100);
    st = await stored(p);
    ok(!st.items.some(h => h.chunk === 'doomed')
       && !(await p.evaluate(() => !!document.querySelector('[data-reader-slot=tools] .rd-orphans'))),
       'its remove button drops it from the store and the list');

    // ── paper: none of it prints ──
    await p.emulateMedia({ media: 'print' });
    const paper = await p.evaluate(() => ({
      card: [...document.querySelectorAll('.rd-card')].every(c => getComputedStyle(c).display === 'none'),
      mark: getComputedStyle(document.querySelector('mark.rd-hl')).backgroundColor,
    }));
    ok(paper.card && /rgba\(0, 0, 0, 0\)|transparent/.test(paper.mark),
       'printed, no card and no yellow yet', JSON.stringify(paper));
    await p.emulateMedia({ media: 'screen' });
    await p.close();

    // ── medium: the notes column still holds the card ──
    {
      const c2 = await browser.newContext({ viewport: { width: 1100, height: 800 } });
      await c2.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
        [st.key, JSON.stringify(st.items)]);
      const q = await page('print.html', c2);
      const g = await q.evaluate(() => {
        const cs = [...document.querySelectorAll('.rd-notes > .rd-card')].map(c => c.getBoundingClientRect());
        const t = document.querySelector('#term p').getBoundingClientRect();
        return { n: cs.length, ok: cs.every(r => r.left >= t.right && r.right <= innerWidth),
                 sw: document.documentElement.scrollWidth, w: innerWidth };
      });
      ok(g.n >= 1 && g.ok && g.sw <= g.w, '1100px: the cards stand right of the text, inside the window', JSON.stringify(g));
      await c2.close();
    }

    // ── narrow: the card opens under its paragraph, only while opened ──
    {
      const c3 = await browser.newContext({ viewport: { width: 390, height: 800 } });
      await c3.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
        [st.key, JSON.stringify(st.items)]);
      const q = await page('print.html', c3);
      const shut = await q.evaluate(() => document.querySelectorAll('.rd-card').length
        && [...document.querySelectorAll('.rd-card')].filter(c => c.isConnected).length);
      ok(!shut, '390px: no card is shown until a highlight is opened', String(shut));
      await q.click('mark.rd-hl >> text=initialisation');
      await q.waitForTimeout(150);
      const g = await q.evaluate(() => {
        const c = document.querySelector('.rd-card.is-focus');
        const para = document.querySelector('#term p');
        return { inline: !!c && c.previousElementSibling === para && !c.closest('.rd-notes'),
                 within: !!c && c.getBoundingClientRect().right <= innerWidth,
                 sw: document.documentElement.scrollWidth, w: innerWidth };
      });
      ok(g.inline && g.within && g.sw <= g.w, '390px: opened, the card stands under the paragraph that holds it',
         JSON.stringify(g));
      await q.mouse.click(200, 30);
      await q.waitForTimeout(150);
      const closed = await q.evaluate(() => !!document.querySelector('.rd-card.is-focus')
        || [...document.querySelectorAll('main .rd-card')].length);
      ok(!closed, '390px: a click elsewhere puts it away', String(closed));
      await c3.close();
    }

    // ── a browser that refuses storage ──
    {
      const c4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await c4.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { configurable: true,
          get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
      });
      const q = await page('print.html', c4);
      const none = await navState(q);
      ok(!none.shown && !Object.keys(none.counts).length, 'no highlight, no pill and no counts', JSON.stringify(none));
      ok(await make(q, 'initialisation vector'), 'storage refused: the button still marks a selection');
      const g = await q.evaluate(() => ({
        marks: document.querySelectorAll('mark.rd-hl').length,
        notice: (document.querySelector('[data-reader-slot=tools] .rd-notice') || {}).textContent || '',
      }));
      ok(g.marks === 1 && /not let the page save/.test(g.notice),
         'and the highlight holds for the session, with a notice in the sidebar foot', JSON.stringify(g));
      const one = await navState(q);
      ok(one.shown && one.pos === '1 / 1' && one.counts.term === '1', 'the first highlight brings up the pill and a count', JSON.stringify(one));
      await q.click('.rd-card.is-focus .rd-remove');
      await q.waitForTimeout(100);
      const zero = await navState(q);
      ok(!zero.shown && !Object.keys(zero.counts).length, 'and removing the last one takes both away again', JSON.stringify(zero));
      await c4.close();
    }
    ok(errors.length === 0, 'highlights: no page errors', errors.join(' | '));
    note('highlights: made, merged, refused, persisted, shared by both documents, re-anchored and orphaned');
  } finally {
    await ctx.close();
    server.close();
  }
}

// Export, import and delete all (plan §5), on a store of their own: a round
// trip through the file, the merge rules one entry at a time, an import into
// a rebuilt document where one quote moved and one is gone, input that is
// not an export, and the undo of delete all.
async function transfer({ browser, ok, note }) {
  const dir = tmpDir('psi-reader-io-');
  const built = build(dir, hlDeck());
  ok(built.status === 0, 'export: the fixture deck builds', (built.stdout || '') + (built.stderr || ''));
  if (built.status !== 0) return;
  const deDir = tmpDir('psi-reader-io-de-');
  build(deDir, hlDeck().replace('title: Highlight fixture\n', 'title: Highlight fixture\nlang: de\n'));
  const { server, port } = await serve(dir);
  const de = await serve(deDir);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const open = async (c = ctx, at = port) => {
    const p = await c.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${at}/print.html`, { waitUntil: 'load' });
    await p.waitForTimeout(250);
    return p;
  };
  const make = async (p, needle, text) => {
    await selectText(p, needle);
    await p.waitForTimeout(150);
    await p.click('.rd-mark-btn');
    await p.waitForTimeout(100);
    if (text) await p.keyboard.type(text);
    await p.mouse.click(700, 20);
    await p.waitForTimeout(60);
  };
  const exportNow = async (p) => {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.rd-menu .rd-export')]);
    const file = path.join(dir, 'export-' + Date.now() + '.md');
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), file, md: fs.readFileSync(file, 'utf8') };
  };
  const importFile = async (p, file) => {
    // Through the button, as a reader does: it clears the file field first,
    // so the same file chosen twice is read twice.
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.rd-menu .rd-import')]);
    await chooser.setFiles(file);
    await p.waitForTimeout(200);
    return p.evaluate(() => {
      const r = document.querySelector('.rd-report');
      return r && !r.hidden ? r.textContent : '';
    });
  };
  const menu = (p) => p.evaluate(() => {
    const vis = (sel) => { const b = document.querySelector(sel); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; };
    return { export: vis('.rd-menu .rd-export'), import: vis('.rd-menu .rd-import'), all: vis('.rd-menu .rd-delete-all'),
             help: (document.querySelector('.rd-menu .rd-help') || {}).textContent || '' };
  });
  const dataOf = (md) => [...md.matchAll(/<!-- psi-reader (.*?) -->/g)].map(m => JSON.parse(m[1]));
  try {
    const p = await open();
    let m = await menu(p);
    ok(m.import && !m.export && !m.all && /another browser/.test(m.help),
       'export: with no highlights the foot offers import and says what an export is for, not export or delete all',
       JSON.stringify(m));

    await make(p, 'initialisation vector is XORed', 'Why the IV?\nAnd not the key?');
    await make(p, 'Divider lede');
    await make(p, 'quoted sentence that will move');
    await make(p, 'unlucky quote', 'Lost -- note -->');
    m = await menu(p);
    ok(m.export && m.all, 'with highlights, export and delete all are offered', JSON.stringify(m));
    const before = (await stored(p)).items;

    // ── the file ──
    const ex = await exportNow(p);
    ok(ex.name === path.basename(dir) + '-highlights.md', 'the download is named <lecture folder>-highlights.md', ex.name);
    const md = ex.md;
    const termNum = await p.evaluate(() => document.getElementById('term').dataset.chunkNum);
    ok(md.startsWith('# Highlights – Highlight fixture\n') && /\nExported on .+\. Highlights: 4, with a note: 2\.\n/.test(md),
       'it opens with the lecture\'s title and one line of counts', md.split('\n').slice(0, 3).join(' | '));
    ok(md.includes(`\n## ${termNum} · A term {#term}\n\n> initialisation vector is XORed\n\nWhy the IV?\nAnd not the key?\n\n<!-- psi-reader `),
       'a slide heading carries the number the page prints, its name and its id; the quote is a blockquote with the note under it',
       md);
    ok(/\n## First part \{#part-one\}\n\n> Divider lede\n/.test(md), 'a divider lede stands under its part');
    const order = [...md.matchAll(/^## (.*)$/gm)].map(x => x[1].replace(/^\d+ · /, ''));
    ok(JSON.stringify(order) === JSON.stringify(['First part {#part-one}', 'A term {#term}', 'Moving words {#moving}', 'Doomed words {#doomed}']),
       'the slides in the page\'s order', JSON.stringify(order));
    const data = dataOf(md);
    ok(data.length === 4 && JSON.stringify(data.map(h => h.id).sort()) === JSON.stringify(before.map(h => h.id).sort())
       && data.every(h => before.some(b => JSON.stringify(b) === JSON.stringify(h))),
       'one data comment per entry, each the stored entry exactly', JSON.stringify(data));
    ok(!/-->[^\n]/.test(md.split('\n').filter(l => l.startsWith('<!--')).join('\n')) && md.includes('Lost -- note -->'),
       'a note with two hyphens and an arrow in it cannot end its comment early',
       md.split('\n').filter(l => l.includes('Lost')).join(' | '));

    // ── delete all, and undo ──
    await p.click('.rd-menu .rd-delete-all');
    await p.waitForTimeout(100);
    let g = await p.evaluate(() => ({ marks: document.querySelectorAll('mark.rd-hl').length,
      toast: !!document.querySelector('.rd-toast:not([hidden])'),
      pill: !document.querySelector('.rd-nav').hidden }));
    ok(g.marks === 0 && g.toast && !g.pill && (await stored(p)).items.length === 0,
       'delete all unwraps every highlight at once, empties the store and offers an undo', JSON.stringify(g));
    await p.click('.rd-toast .rd-undo');
    await p.waitForTimeout(100);
    let st = await stored(p);
    ok(st.items.length === 4 && (await marks(p)).length === 4 && st.items.some(h => h.note.startsWith('Why the IV?')),
       'and undo puts every one back, notes and all', JSON.stringify(await marks(p)));

    // ── round trip ──
    await p.click('.rd-menu .rd-delete-all');
    await p.waitForTimeout(100);
    let rep = await importFile(p, ex.file);
    st = await stored(p);
    ok(rep === 'Imported: 4 new, 0 updated, 0 not found in this version.', 'import reports what it did in one line', rep);
    ok(st.items.length === 4 && JSON.stringify([...st.items].sort((a, b) => a.id < b.id ? -1 : 1))
         === JSON.stringify([...before].sort((a, b) => a.id < b.id ? -1 : 1))
       && (await marks(p)).length === 4,
       'export, delete all, import: the same highlights and notes, painted again', JSON.stringify(await marks(p)));
    rep = await importFile(p, ex.file);
    ok(rep === 'Imported: 0 new, 0 updated, 0 not found in this version.' && (await stored(p)).items.length === 4,
       'the same file twice changes nothing', rep);

    // ── merge rules ──
    const iv = before.find(h => h.quote.startsWith('initialisation'));
    const lede = before.find(h => h.quote === 'Divider lede');
    const merge = [
      '# Hand-edited',
      '<!-- psi-reader ' + JSON.stringify({ ...iv, note: 'Older', edited: iv.edited - 1000 }) + ' -->',
      '<!-- psi-reader ' + JSON.stringify({ ...lede, note: 'Newer note', edited: Date.now() + 1000 }) + ' -->',
      '<!-- psi-reader ' + JSON.stringify({ v: 1, id: 'h-fig', type: 'figure', chunk: 'fig',
        fig: { index: 0, kind: 'diagram', key: 'A figure' }, at: null, note: 'The arrow?', kind: 'mark',
        created: 1, edited: 1 }) + ' -->',
      '<!-- psi-reader {not json} -->',
      '<!-- psi-reader {"v":1,"id":7} -->',
    ].join('\n\n');
    const mergeFile = path.join(dir, 'merge.md');
    fs.writeFileSync(mergeFile, merge);
    rep = await importFile(p, mergeFile);
    st = await stored(p);
    ok(rep === 'Imported: 1 new, 1 updated, 1 not found in this version. Entries that could not be read: 2.',
       'merge: an older copy is ignored, a newer one wins, a new id is added, and two unreadable comments are counted', rep);
    ok(st.items.find(h => h.id === iv.id).note === iv.note && st.items.find(h => h.id === lede.id).note === 'Newer note'
       && st.items.some(h => h.id === 'h-fig' && h.type === 'figure'),
       'the store says the same', JSON.stringify(st.items.map(h => [h.id, h.note])));
    const lostList = await p.evaluate(() => [...document.querySelectorAll('[data-reader-slot=tools] .rd-orphans li')].map(li => li.textContent));
    ok(lostList.some(t => t.includes('The arrow?')), 'an entry of a type this build cannot paint is kept and listed, not refused',
       JSON.stringify(lostList));
    const ex2 = await exportNow(p);
    ok(/\n## No longer found in this version\n\n### \d+ · A figure \{#fig\}\n\n> A figure\n\nThe arrow\?\n\n<!-- psi-reader \{"v":1,"id":"h-fig","type":"figure"/.test(ex2.md),
       'and exported under the not-found heading, with its slide and its data', ex2.md.split('## No longer')[1]);

    // ── not an export ──
    const junk = path.join(dir, 'junk.md');
    fs.writeFileSync(junk, '# Just notes\n\nNothing of the reader in here. <!-- a comment -->\n');
    rep = await importFile(p, junk);
    ok(rep === 'This file holds no highlights.' && (await stored(p)).items.length === 5,
       'a file with no data in it is reported and changes nothing', rep);
    fs.writeFileSync(junk, '<!-- psi-reader {"v":1,"id":"x", -->');
    rep = await importFile(p, junk);
    ok(rep === 'This file holds no highlights. Entries that could not be read: 1.', 'nor does one whose only entry is broken', rep);

    // ── into a rebuilt document ──
    await p.click('.rd-menu .rd-delete-all');
    await p.waitForTimeout(100);
    const rebuilt = build(dir, hlDeck(true));
    ok(rebuilt.status === 0, 'export: the fixture rebuilds with other words', rebuilt.stderr);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(250);
    rep = await importFile(p, ex.file);
    st = await stored(p);
    const mv = st.items.find(h => h.chunk === 'moving');
    const painted = await marks(p);
    ok(rep === 'Imported: 4 new, 0 updated, 1 not found in this version.', 'an import after a rebuild counts the one it could not place', rep);
    ok(painted.some(t => squash(t) === 'quoted sentence that will move') && mv.start > 60
       && st.items.some(h => h.chunk === 'doomed'),
       'the quote that moved is found and re-anchored, the one that vanished is kept', JSON.stringify({ painted, mv }));
    const lost2 = await p.evaluate(() => [...document.querySelectorAll('[data-reader-slot=tools] .rd-orphans li')].map(li => li.textContent));
    ok(lost2.length === 1 && lost2[0].includes('unlucky quote'), 'and listed in the foot', JSON.stringify(lost2));
    await p.close();

    // ── the words follow lang: ──
    {
      const q = await open(ctx, de.port);
      await make(q, 'initialisation vector');
      const [dl] = await Promise.all([q.waitForEvent('download'), q.click('.rd-menu .rd-export')]);
      const f = path.join(dir, 'de.md');
      await dl.saveAs(f);
      const txt = fs.readFileSync(f, 'utf8');
      ok(dl.suggestedFilename() === path.basename(deDir) + '-markierungen.md'
         && txt.startsWith('# Markierungen – Highlight fixture\n') && /\nExportiert am .+\. Markierungen: 1, mit Notiz: 0\.\n/.test(txt),
         'lang: de names the file and heads it in German', dl.suggestedFilename() + ' | ' + txt.split('\n').slice(0, 3).join(' | '));
      await q.close();
    }

    // ── narrow: the menu is in the sidebar the button opens ──
    {
      const c2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
      await c2.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
        [st.key, JSON.stringify(st.items)]);
      const q = await open(c2);
      await q.click('.rd-toggle');
      await q.waitForTimeout(250);
      const g2 = await q.evaluate(() => {
        const r = document.querySelector('.rd-menu').getBoundingClientRect();
        const b = [...document.querySelectorAll('.rd-menu button')].map(x => x.getBoundingClientRect());
        return { inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0,
                 buttons: b.length === 3 && b.every(x => x.width > 0 && x.right <= innerWidth),
                 sw: document.documentElement.scrollWidth, w: innerWidth };
      });
      ok(g2.inside && g2.buttons && g2.sw <= g2.w, '390px: the menu stands in the opened sidebar, inside the window', JSON.stringify(g2));
      await c2.close();
    }
    ok(errors.length === 0, 'export: no page errors', errors.join(' | '));
    note('export: file named and shaped, round trip, merge, rebuild, junk, delete all and its undo');
  } finally {
    await ctx.close();
    server.close();
    de.server.close();
  }
}

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
         && !html.includes("getElementById('reader-contents')") && !html.includes('data-reader="on"')
         && !html.includes('id="reader-data"') && !html.includes("'psi-reader:v1:'"),
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
  await highlights({ browser, ok, note });
  await transfer({ browser, ok, note });
}
