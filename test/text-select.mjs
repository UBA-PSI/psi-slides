/*
 * Holding Alt makes the live views selectable, and the click path has to
 * stand aside for it.
 *
 * Turning the stage selectable is only half the feature. A drag across a
 * code block still ends in a `click` on that block, and every handler that
 * answers a click by navigating, focusing, closing or panning answered that
 * one too - so the one element a lecturer most wants a line out of, a
 * listing, was the one element that could not be highlighted: the drag
 * opened the focus card over it, and inside the card the same drag closed
 * the card. The guard existed on the camera's pointerdown and nowhere else.
 *
 * This spec is why the family exists. Every screenshot of the gesture is
 * fine: the card that opens is the card that is supposed to open when you
 * click, and the selection you did not get leaves nothing behind to
 * photograph. So it asserts the property in both directions - with the
 * modifier down a drag selects and does not focus, without it a click still
 * focuses - and never a coordinate.
 *
 * One harness note, learned by chasing it for an hour: aim at the vertical
 * middle of a *rendered line*, never at the middle of the block. The couple
 * of pixels between two line boxes is not a place Chrome will start a
 * selection drag from, and a spec that starts there measures nothing while
 * looking exactly like a product defect.
 */
export const name = 'text selection · Alt over a listing';
export const lecture = 'tutorial';
export const view = 'audience';

// The chunk that documents the gesture, and the only one that has a listing
// and the prose about Alt on the same slide.
const CHUNK = 'figure-focus';

// A box plus the y of a line inside it that a selection can actually start
// on. Used for the listing on the slide and for the card it opens into, so
// both are measured the same way.
const boxWithLine = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  const right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
  const box = { x, y, w: right - x, h: bottom - y };
  const line = [...el.querySelectorAll('.line')]
    .map(l => l.getBoundingClientRect())
    .find(b => b.top > y + 4 && b.bottom < bottom - 4 && b.height > 4 && b.width > 60);
  box.cy = line ? line.top + line.height / 2 : y + box.h / 2;
  return box;
}, sel);

const look = (page) => page.evaluate(() => ({
  focused: document.body.classList.contains('figure-focused'),
  selecting: document.body.classList.contains('text-selecting'),
  selection: String(window.getSelection() || '').trim(),
  active: (document.querySelector('.chunk.active') || {}).id || '',
  pan: (document.querySelector('#stage') || { style: {} }).style.transform || '',
}));

// A drag along one line. `alt` holds the modifier for the whole gesture,
// `dropKey` lets it go before the button comes up - the case where the
// keyboard at click time and the keyboard at pointerdown disagree.
async function dragAlong(page, box, { alt = false, dropKey = false } = {}) {
  if (alt) { await page.keyboard.down('Alt'); await page.waitForTimeout(140); }
  await page.mouse.move(box.x + 8, box.cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.4, box.cy, { steps: 8 });
  await page.mouse.move(box.x + box.w * 0.7, box.cy, { steps: 8 });
  if (alt && dropKey) { await page.keyboard.up('Alt'); await page.waitForTimeout(80); }
  await page.mouse.up();
  if (alt && !dropKey) await page.keyboard.up('Alt');
  await page.waitForTimeout(280);
}

async function clearSelection(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
}

// The two properties the defect was about, asserted the same way in both
// live views - the cockpit layers this same script over its own DOM, and it
// is the window a lecturer actually copies a line from.
async function headline(page, report, where) {
  const { ok } = report;
  const pre = await boxWithLine(page, '.chunk.active .chunk-body pre');
  if (!ok(!!pre && pre.w > 40 && pre.h > 20, `the listing is on screen (${where})`, JSON.stringify(pre))) return;

  await dragAlong(page, pre, { alt: true });
  let s = await look(page);
  ok(s.selection.length > 0, `Alt-dragging the listing selects text (${where})`, JSON.stringify(s.selection));
  ok(!s.focused, `and does not open the focus card (${where})`, JSON.stringify(s));
  // The tutorial promises this in as many words: let go of Alt and the
  // highlight is still there to reach Cmd-C with.
  ok(s.selecting, `the highlight survives the key release (${where})`, JSON.stringify(s));

  await clearSelection(page);
  ok(!(await look(page)).selection, `Esc clears it (${where})`);

  // The affordance the guard must not have cost: a plain click still zooms.
  await page.mouse.click(pre.x + pre.w / 2, pre.cy);
  await page.waitForTimeout(420);
  ok((await look(page)).focused, `a plain click still opens the card (${where})`);

  const card = await boxWithLine(page, '#figure-overlay .figure-focus-target');
  if (ok(!!card && card.w > 40, `the card is measurable (${where})`, JSON.stringify(card))) {
    await dragAlong(page, card, { alt: true });
    s = await look(page);
    ok(s.selection.length > 0, `Alt-dragging inside the card selects text (${where})`, JSON.stringify(s.selection));
    ok(s.focused, `and leaves the card open (${where})`, JSON.stringify(s));

    // Esc unwinds the most recent thing first: the highlight, then the card.
    await clearSelection(page);
    ok((await look(page)).focused, `Esc takes the highlight back before the card (${where})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
    ok(!(await look(page)).focused, `and the next Esc still closes the card (${where})`);
  }
}

export async function run({ page, report, walkTo, at, press }) {
  const { ok, note } = report;

  ok(await walkTo(CHUNK), 'reached the chunk that documents the gesture');
  await page.waitForTimeout(900);   // the camera is still flying at walk end

  await headline(page, report, 'audience');

  // ── the edges, which is where a modifier-key interaction rots ──────
  const pre = await boxWithLine(page, '.chunk.active .chunk-body pre');

  // Let go of the key mid-drag. The gesture is still the selection it
  // started as, and the click that ends it is not a request to zoom.
  await clearSelection(page);
  await dragAlong(page, pre, { alt: true, dropKey: true });
  let s = await look(page);
  ok(s.selection.length > 0, 'a drag that outlives the key still selects', JSON.stringify(s.selection));
  ok(!s.focused, 'and still does not open the card');

  // A standing highlight leaves the stage selectable, which is the whole
  // point - but the very next ordinary click must not be eaten by it.
  await page.mouse.click(pre.x + pre.w / 2, pre.cy);
  await page.waitForTimeout(420);
  ok((await look(page)).focused, 'a click straight after a selection is not swallowed');
  await clearSelection(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(260);

  // Alt held, no movement at all. Holding the key is a statement about what
  // pointer gestures mean, so this places a caret and nothing else.
  await page.keyboard.down('Alt');
  await page.waitForTimeout(140);
  await page.mouse.click(pre.x + pre.w / 2, pre.cy);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(420);
  ok(!(await look(page)).focused, 'an Alt-click with no drag does not open the card');

  // The camera still works. A guard applied to the whole click path is one
  // edit away from turning the ordinary gestures off with it.
  await clearSelection(page);
  const before = (await look(page)).pan;
  await page.mouse.move(pre.x + 8, pre.cy);
  await page.mouse.down();
  await page.mouse.move(pre.x + 128, pre.cy + 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(320);
  s = await look(page);
  ok(s.pan !== before, 'a plain drag still pans the slide', s.pan);
  ok(!s.focused, 'and does not open the card either');
  await press('Escape');

  // Pressing the key half way through a pan does not retro-fit the gesture:
  // what you started is what you finish, and nothing focuses.
  const panned = (await look(page)).pan;
  await page.mouse.move(pre.x + 8, pre.cy);
  await page.mouse.down();
  await page.mouse.move(pre.x + 60, pre.cy, { steps: 5 });
  await page.keyboard.down('Alt');
  await page.mouse.move(pre.x + 170, pre.cy + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(320);
  s = await look(page);
  ok(!s.focused, 'Alt pressed mid-pan does not open the card', JSON.stringify(s));
  ok(s.pan !== panned, 'and the pan it interrupted still finishes');
  await press('Escape');

  // ── the other thing a click does: go to that slide ─────────────────
  // A neighbouring chunk has to be wholly on screen for a drag across it to
  // mean anything, so zoom out until one is.
  const startedOn = (await at()).id;
  for (let i = 0; i < 5; i++) await press('-', 140);
  await page.waitForTimeout(400);
  const other = await page.evaluate(() => {
    for (const c of document.querySelectorAll('.chunk:not(.active)')) {
      for (const p of c.querySelectorAll('p')) {
        const r = p.getBoundingClientRect();
        if (r.top > 6 && r.bottom < innerHeight - 6 && r.left > 6 && r.right < innerWidth - 6
            && r.height > 10 && p.textContent.trim().length > 25) {
          return { id: c.dataset.chunkId || c.id, x: r.x, y: r.y, w: r.width, h: r.height, cy: r.y + r.height / 2 };
        }
      }
    }
    return null;
  });
  if (ok(!!other, 'a neighbouring chunk is wholly on screen to drag across', String(other))) {
    note('neighbour: ' + other.id);
    await dragAlong(page, other, { alt: true });
    s = await look(page);
    ok(s.selection.length > 0, 'Alt-dragging a neighbouring chunk selects its text', JSON.stringify(s.selection));
    ok(s.active === startedOn, 'and does not navigate to it', s.active + ' vs ' + startedOn);
    await clearSelection(page);
    // The control: the same place, clicked. Without this the assertion above
    // would pass just as well if clicking a chunk had stopped working.
    await page.mouse.click(other.x + other.w / 2, other.cy);
    await page.waitForTimeout(500);
    ok((await at()).id === other.id, 'a plain click on it still goes there', (await at()).id);
  }

  // ── the cockpit ───────────────────────────────────────────────────
  // Same script, its own DOM, and the screen the lecturer is actually at.
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await ctx.newPage();
  const errors = [];
  sp.on('pageerror', e => errors.push(String(e)));
  sp.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await sp.goto(page.url().replace('audience.html', 'speaker.html'), { waitUntil: 'load' });
  await sp.waitForTimeout(800);
  for (let i = 0; i < 200; i++) {
    const id = await sp.evaluate(() => (document.querySelector('.chunk.active') || {}).id || '');
    if (id === CHUNK) break;
    await sp.keyboard.press('ArrowDown');
    await sp.waitForTimeout(90);
  }
  await sp.waitForTimeout(900);
  await headline(sp, report, 'cockpit');
  ok(errors.length === 0, 'no page errors in the cockpit context this spec opened', errors.join(' | '));
  await ctx.close();
}
