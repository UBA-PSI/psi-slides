/*
 * The cockpit's notes field and the presenter remote.
 *
 * One click into the notes field used to take the remote: the key map stands
 * back for a text field, so PageDown and PageUp did nothing, and B and . were
 * typed into the note and kept in localStorage as an override of the source
 * ("room" became "roob.m"). The field is now read-only until an edit is asked
 * for, and PageDown / PageUp leave an edit and turn the page. The room has to
 * move, so this needs the projection and the cockpit side by side, which is
 * why it builds a fixture and opens the cockpit from the projection with S.
 *
 * The second half is the long note: cut at three lines with nothing to say
 * that more follows, and not scrollable without a click. Read-only, it is now
 * set outside the field: paragraphs part by a third of a line rather than a
 * blank one, it scrolls with the wheel, and a mark under its last line says
 * where it ends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, serve } from './harness.mjs';

export const name = 'cockpit · notes field and the remote';
export const lecture = 'tutorial';

const LONG = 'If the room is quiet, ask the question again. ' +
  'Then wait for an answer and count to five before you say anything. ' +
  'The example on the next slide is the one they will remember, so slow down. ' +
  'Mention the exercise sheet and where the solutions will be. ' +
  'Point at the figure, not at the screen. ' +
  'If time is short, skip the second example and go straight to the summary. ' +
  'Then the summary: three sentences, one per idea, and a pause after each. ' +
  'Ask who has used the tool before, and let one of them say what went wrong the first time.\n\n' +
  'The last line of this note is here to be scrolled to.';

const SOURCE = `---
title: Notes and the remote
---

## free: Long note {#long}

A slide with a long note.

> note: ${LONG.replace(/\n\n/, '\n>\n> ')}

## free: Short note {#short}

A slide with a short note.

> note: One **line** and *one* aside.

## free: Third {#third}

The end.
`;

function buildFixture() {
  const dir = tmpDir('psi-notes-');
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--no-optimize-images'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + r.stdout + r.stderr);
  return dir;
}

export async function run({ page, report }) {
  const { ok } = report;
  const dir = buildFixture();
  const { server, port } = await serve(dir);
  try {
    const aud = await page.context().newPage();
    const errors = [];
    aud.on('pageerror', e => errors.push('audience: ' + e));
    await aud.goto('http://127.0.0.1:' + port + '/audience.html', { waitUntil: 'load' });
    await aud.waitForTimeout(600);
    const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
    spk.on('pageerror', e => errors.push('cockpit: ' + e));
    await spk.setViewportSize({ width: 1440, height: 900 });
    await spk.waitForLoadState();
    await spk.waitForTimeout(900);
    await spk.bringToFront();

    const where = async () => {
      const read = (p) => p.evaluate(() => flatChunks[state.activeIdx].id);
      return { a: await read(aud), s: await read(spk) };
    };
    const field = () => spk.evaluate(() => {
      const t = document.getElementById('psiINT-notes-content');
      const r = document.getElementById('psiINT-notes-read');
      const cs = getComputedStyle(r);
      const lh = parseFloat(cs.lineHeight);
      const ps = [...r.querySelectorAll('p')];
      const box = r.getBoundingClientRect();
      const mark = getComputedStyle(r, '::after');
      return {
        value: t.value, readOnly: t.readOnly, focused: document.activeElement === t,
        fieldShown: getComputedStyle(t).display !== 'none', readShown: cs.display !== 'none',
        paragraphs: ps.length,
        gap: ps.length > 1 ? ps[1].getBoundingClientRect().top - ps[0].getBoundingClientRect().bottom : 0,
        scrollTop: r.scrollTop, scrollHeight: r.scrollHeight, clientHeight: r.clientHeight, lh,
        mark: mark.content,
        // The mark sits under the last paragraph, in sight once the bottom
        // of the scroll is.
        markInSight: r.scrollTop + r.clientHeight >= r.scrollHeight - 1,
        mask: cs.maskImage || cs.webkitMaskImage || 'none',
        fits: r.scrollHeight <= r.clientHeight + 1,
        height: box.height,
        overrides: Object.keys(localStorage).filter(k => /speakernote:/.test(k)),
      };
    });
    const press = async (k, wait = 280) => { await spk.keyboard.press(k); await spk.waitForTimeout(wait); };

    // ── to the long note ─────────────────────────────────────────────
    for (let i = 0; i < 6 && (await where()).s !== 'long'; i++) await press('ArrowDown', 150);
    let w = await where();
    ok(w.s === 'long' && w.a === 'long', 'both windows stand on the slide with the long note', JSON.stringify(w));
    let f = await field();
    ok(f.value === LONG && f.readOnly, 'the cockpit shows the note, read-only until an edit is asked for', JSON.stringify({ readOnly: f.readOnly }));

    // ── B2: a long note says so and scrolls without a click ──────────
    ok(!f.fieldShown && f.readShown, 'read-only, the note is set outside the field', JSON.stringify({ field: f.fieldShown, read: f.readShown }));
    ok(f.paragraphs === 2 && f.gap > 0 && f.gap < f.lh / 2, 'paragraphs part by less than half a line', JSON.stringify({ n: f.paragraphs, gap: f.gap, lh: f.lh }));
    ok(f.scrollHeight > f.clientHeight + f.lh, 'the long note runs past the foot of the pane', JSON.stringify(f));
    ok(f.mask === 'none', 'no line fades out', f.mask);
    ok(/end/.test(f.mark) && !f.markInSight, 'the end mark is below, out of sight', JSON.stringify({ mark: f.mark, inSight: f.markInSight }));
    const box = await spk.locator('#psiINT-notes-read').boundingBox();
    await spk.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await spk.mouse.wheel(0, 2000);
    // A wheel scroll can be animated; wait for it to land at the end.
    await spk.waitForFunction(() => {
      const r = document.getElementById('psiINT-notes-read');
      return r.scrollTop + r.clientHeight >= r.scrollHeight - 1;
    }, null, { timeout: 3000 }).catch(() => {});
    await spk.waitForTimeout(100);
    f = await field();
    ok(f.scrollTop > 0 && !f.focused, 'the wheel scrolls it, and the field is not focused for that', JSON.stringify({ scrollTop: f.scrollTop, focused: f.focused }));
    ok(f.markInSight, 'scrolled to the end, the end mark is in sight');

    // ── B1: a stray click does not take the remote ───────────────────
    await spk.mouse.click(box.x + 60, box.y + box.height / 2);
    await spk.waitForTimeout(200);
    f = await field();
    ok(!f.focused && f.readOnly, 'one click into the field does not focus it', JSON.stringify({ focused: f.focused, readOnly: f.readOnly }));
    await press('b');
    ok(await aud.evaluate(() => document.body.classList.contains('blanked')), 'B blanks the projection rather than typing into the note');
    await press('.');
    ok(!(await aud.evaluate(() => document.body.classList.contains('blanked'))), 'and . brings it back');
    await press('PageDown');
    w = await where();
    ok(w.s === 'short' && w.a === 'short', 'PageDown turns the page in both windows', JSON.stringify(w));
    await press('PageUp');
    w = await where();
    ok(w.s === 'long' && w.a === 'long', 'and PageUp turns it back', JSON.stringify(w));
    f = await field();
    ok(f.value === LONG && f.overrides.length === 0, 'the note is the source text and nothing was stored', JSON.stringify(f.overrides));

    // ── a deliberate edit still works ────────────────────────────────
    await spk.locator('#psiINT-notes-read').dblclick({ position: { x: 60, y: 30 } });
    await spk.waitForTimeout(200);
    f = await field();
    ok(f.focused && !f.readOnly && f.fieldShown && !f.readShown, 'a double-click opens the note for editing', JSON.stringify({ focused: f.focused, readOnly: f.readOnly }));
    const caret = await spk.evaluate(() => document.getElementById('psiINT-notes-content').selectionStart);
    ok(caret > 0 && caret < 20, 'with the caret where it was clicked', String(caret));
    await spk.evaluate(() => { const t = document.getElementById('psiINT-notes-content'); t.setSelectionRange(t.value.length, t.value.length); });
    await spk.keyboard.type(' b.');
    f = await field();
    ok(f.value.endsWith(' b.') && f.overrides.length === 1, 'while editing, B and . are text and the edit is kept', JSON.stringify({ tail: f.value.slice(-12), overrides: f.overrides }));
    ok((await where()).a === 'long' && !(await aud.evaluate(() => document.body.classList.contains('blanked'))),
       'and the projection did not move or blank');
    await press('PageDown');
    f = await field();
    w = await where();
    ok(w.s === 'short' && w.a === 'short' && !f.focused && f.readOnly,
       'PageDown mid-edit leaves the field and turns the page', JSON.stringify({ w, focused: f.focused, readOnly: f.readOnly }));
    f = await field();
    ok(f.value === 'One **line** and *one* aside.' && f.fits && f.markInSight && f.height < 3.2 * f.lh,
       'a one-line note stands short, its end mark in sight', JSON.stringify({ v: f.value, height: f.height, lh: f.lh }));
    const read = await spk.evaluate(() => {
      const r = document.getElementById('psiINT-notes-read');
      return { text: r.textContent, strong: [...r.querySelectorAll('strong')].map(e => e.textContent), em: [...r.querySelectorAll('em')].map(e => e.textContent) };
    });
    ok(read.text === 'One line and one aside.' && read.strong.join() === 'line' && read.em.join() === 'one',
       'read, a bold is bold and an emphasis emphasised, without their markers', JSON.stringify(read));
    // A double-click on the bold word puts the caret inside it in the field.
    await spk.locator('#psiINT-notes-read strong').dblclick();
    await spk.waitForTimeout(200);
    const boldCaret = await spk.evaluate(() => document.getElementById('psiINT-notes-content').selectionStart);
    ok(boldCaret >= 6 && boldCaret <= 10, 'a double-click on it opens the field with the caret in the word', String(boldCaret));
    await press('Escape');

    // Shift-N, then Esc: the edit ends and the press is spent on that alone.
    await press('Shift+N');
    f = await field();
    ok(f.focused && !f.readOnly, 'Shift-N opens the note for editing', JSON.stringify({ focused: f.focused, readOnly: f.readOnly }));
    await press('Escape');
    f = await field();
    w = await where();
    ok(!f.focused && f.readOnly && w.s === 'short', 'Esc leaves the edit and nothing else', JSON.stringify({ w, focused: f.focused }));
    await press('ArrowDown');
    ok((await where()).a === 'third', 'and the arrows turn pages again');

    ok(errors.length === 0, 'no page errors', errors.join(' | '));
    await spk.close();
    await aud.close();
  } finally {
    server.close();
  }
}
