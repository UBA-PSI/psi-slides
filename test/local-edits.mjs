/*
 * Local edits against a source.md that moved.
 *
 * A note edited in the cockpit and an annotation typed with N are kept in
 * localStorage and win over the file. They used to win for ever, in silence:
 * a source edited after the draft never reached the screen. Each now keeps
 * the source text it was begun from, and the cockpit puts a line over the
 * notes when the file has moved since, with keep mine and use source. The
 * palette's forget-local-edits removes every one of them from both windows,
 * and only after a question that counts what goes. Shift-E exports the note
 * overrides beside the drafts, with their bases, and the spec runs the
 * snippet through --integrate-annotations and a rebuild.
 *
 * Builds a fixture twice into one folder, served on one port so both windows
 * and both builds share one store, the way a lecturer's browser does across
 * a rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, serve } from './harness.mjs';

export const name = 'cockpit · local edits against a moved source';
export const lecture = 'tutorial';

const deck = ({ noteA, annotA, noteB }) => `---
title: Local edits
---

## free: First {#first}

A slide with a note and an annotation.

> note: ${noteA}

> annot: ${annotA}

## free: Second {#second}

A slide with a note.

> note: ${noteB}

## free: Third {#third}

A slide with a note nobody changes.

> note: Steady.
`;

const V1 = { noteA: 'Old note.', annotA: 'Old annotation.', noteB: 'B as written.' };
const V2 = { noteA: 'New note.', annotA: 'New annotation.', noteB: 'B rewritten.' };

function build(dir, v) {
  fs.writeFileSync(path.join(dir, 'source.md'), deck(v));
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--no-optimize-images'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + r.stdout + r.stderr);
}

export async function run({ page, report }) {
  const { ok } = report;
  const dir = tmpDir('psi-local-edits-');
  build(dir, V1);
  const { server, port } = await serve(dir);
  try {
    const aud = await page.context().newPage();
    const errors = [];
    aud.on('pageerror', e => errors.push('audience: ' + e));
    await aud.goto('http://127.0.0.1:' + port + '/audience.html', { waitUntil: 'load' });
    await aud.evaluate(() => localStorage.clear());
    await aud.reload({ waitUntil: 'load' });
    await aud.waitForTimeout(500);
    const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
    spk.on('pageerror', e => errors.push('cockpit: ' + e));
    await spk.setViewportSize({ width: 1440, height: 900 });
    await spk.waitForLoadState();
    await spk.waitForTimeout(900);
    await spk.bringToFront();

    const press = async (k, wait = 250) => { await spk.keyboard.press(k); await spk.waitForTimeout(wait); };
    const store = (p) => p.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const m = /:(speakernote(?:-base)?:.*|annotations|annotation-bases)$/.exec(k);
        if (m) out[m[1]] = localStorage.getItem(k);
      }
      return out;
    });
    const hint = () => spk.evaluate(() => {
      const h = document.getElementById('psiINT-notes-stale');
      return {
        hidden: h.hidden, visible: h.getBoundingClientRect().height > 0,
        rows: Array.from(h.querySelectorAll('.notes-stale-row')).map(r => r.dataset.kind + ':' + r.textContent),
        notes: document.getElementById('psiINT-notes-content').value,
      };
    });
    const annotIn = (p, id) => p.evaluate((id) => {
      const entry = flatChunks.find(c => c.id === id);
      const ta = entry && entry.el.querySelector('.annot-textarea');
      return { value: ta ? ta.value : null, draft: annotations[id] ?? null };
    }, id);
    const goTo = async (id) => {
      for (let i = 0; i < 8; i++) {
        const at = await spk.evaluate(() => flatChunks[state.activeIdx].id);
        if (at === id) return true;
        const want = await spk.evaluate((id) => flatChunks.findIndex(c => c.id === id), id);
        const here = await spk.evaluate(() => state.activeIdx);
        await press(want > here ? 'ArrowDown' : 'ArrowUp', 200);
      }
      return (await spk.evaluate(() => flatChunks[state.activeIdx].id)) === id;
    };

    // ── v1: edit the note and type an annotation on #first ───────────
    ok(await goTo('first'), 'the cockpit stands on #first');
    let h = await hint();
    ok(h.hidden && h.notes === 'Old note.', 'no line over the notes while nothing is edited', JSON.stringify(h));
    await press('Shift+N');
    await spk.evaluate(() => { const t = document.getElementById('psiINT-notes-content'); t.setSelectionRange(t.value.length, t.value.length); });
    await spk.keyboard.type(' Mine.');
    await press('Escape');
    await press('n', 300);
    await spk.keyboard.type(' Drafted.');
    await press('Escape', 400);
    let s = await store(spk);
    ok(s['speakernote:first'] === 'Old note. Mine.' && s['speakernote-base:first'] === 'Old note.',
      'the note override keeps the source it was begun from', JSON.stringify(s));
    const bases = JSON.parse(s['annotation-bases'] || '{}');
    ok(JSON.parse(s.annotations || '{}').first === 'Old annotation. Drafted.' && bases.first === 'Old annotation.',
      'the annotation draft keeps its base in a key of its own', JSON.stringify(s));
    const snap = await spk.evaluate(() => { const p = snapshot(); return { keys: Object.keys(p), annotations: p.annotations }; });
    ok(!snap.keys.some(k => /base/i.test(k)) && JSON.stringify(snap.annotations) === JSON.stringify({ first: 'Old annotation. Drafted.' }),
      'and the base does not ride the snapshot', JSON.stringify(snap));
    h = await hint();
    ok(h.hidden, 'an edit against the current source raises no line', JSON.stringify(h));

    // An override from before the base existed, on a slide with notes, and
    // one that says what the source says.
    await spk.evaluate(() => {
      localStorage.setItem(storageKey('speakernote:second'), 'My old B.');
      localStorage.setItem(storageKey('speakernote:third'), 'Steady.');
    });

    // ── v2: the source moves under both ──────────────────────────────
    build(dir, V2);
    await aud.reload({ waitUntil: 'load' });
    await aud.waitForTimeout(400);
    await spk.reload({ waitUntil: 'load' });
    await spk.waitForTimeout(1200);
    ok(await goTo('first'), 'after the rebuild the cockpit stands on #first again');
    h = await hint();
    ok(!h.hidden && h.visible && h.rows.length === 2
      && /^note:source\.md changed since you edited these notes/.test(h.rows[0])
      && /^annot:source\.md changed since your annotation draft/.test(h.rows[1]),
      'the line over the notes names both edits the file moved under', JSON.stringify(h));
    ok(h.notes === 'Old note. Mine.', 'the override still shows until it is answered', h.notes);
    ok(await aud.evaluate(() => !document.getElementById('psiINT-notes-stale')), 'the projection carries no such line');
    s = await store(spk);
    ok(!('speakernote:third' in s), 'an override equal to the source is dropped silently', JSON.stringify(Object.keys(s)));

    // keep mine on the note: rebased, the row goes, the text stays.
    await spk.locator('.notes-stale-row[data-kind=note] .notes-stale-keep').click();
    await spk.waitForTimeout(200);
    h = await hint();
    s = await store(spk);
    ok(h.rows.length === 1 && /^annot:/.test(h.rows[0]) && h.notes === 'Old note. Mine.' && s['speakernote-base:first'] === 'New note.',
      'keep mine takes the new source for the base and keeps the edit', JSON.stringify({ h, base: s['speakernote-base:first'] }));
    // use source on the annotation: the draft goes in both windows.
    await spk.locator('.notes-stale-row[data-kind=annot] .notes-stale-use').click();
    await spk.waitForTimeout(400);
    h = await hint();
    const aFirst = await annotIn(aud, 'first');
    const sFirst = await annotIn(spk, 'first');
    s = await store(spk);
    ok(h.hidden && aFirst.draft === null && sFirst.draft === null && aFirst.value === 'New annotation.' && sFirst.value === 'New annotation.',
      'use source drops the draft and both windows show the new annotation', JSON.stringify({ h, aFirst, sFirst }));
    ok(!JSON.parse(s['annotation-bases'] || '{}').first, 'and its base goes with it', JSON.stringify(s));

    // A legacy override with no base over notes that differ: unknown.
    ok(await goTo('second'), 'the cockpit goes to #second');
    h = await hint();
    ok(h.rows.length === 1 && /^note:source\.md may have changed/.test(h.rows[0]), 'an override with no base says the file may have moved', JSON.stringify(h));
    await spk.locator('.notes-stale-row[data-kind=note] .notes-stale-use').click();
    await spk.waitForTimeout(200);
    h = await hint();
    s = await store(spk);
    ok(h.hidden && h.notes === 'B rewritten.' && !('speakernote:second' in s), 'use source on a note shows the source and forgets the override', JSON.stringify({ h, s }));

    // ── forget all ───────────────────────────────────────────────────
    await press('n', 300);
    await spk.keyboard.type(' x');
    await press('Escape', 400);
    const palette = async (p) => {
      await p.keyboard.press('Meta+k'); await p.waitForTimeout(250);
      await p.keyboard.type('forget all'); await p.waitForTimeout(150);
      await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    };
    await palette(spk);
    let modal = await spk.evaluate(() => {
      const m = document.getElementById('psiINT-forget-modal');
      return m ? { text: m.textContent, focus: document.activeElement && document.activeElement.className } : null;
    });
    ok(modal && /1 edited speaker note and 1 annotation draft/.test(modal.text) && /Forget 2 local edits/.test(modal.text)
      && modal.focus === 'forget-modal-cancel',
      'the palette asks first, counts what goes, and Cancel has the focus', JSON.stringify(modal));
    await press('Escape');
    s = await store(spk);
    ok(!(await spk.evaluate(() => !!document.getElementById('psiINT-forget-modal'))) && s['speakernote:first'] && JSON.parse(s.annotations).second,
      'Esc takes the question away and forgets nothing', JSON.stringify(Object.keys(s)));
    await palette(spk);
    await spk.locator('#psiINT-forget-modal .forget-modal-danger').click();
    await spk.waitForTimeout(500);
    s = await store(spk);
    const aStore = await store(aud);
    const aSecond = await annotIn(aud, 'second');
    const left = await spk.evaluate(() => Object.keys(annotations).length);
    const aLeft = await aud.evaluate(() => Object.keys(annotations).length);
    ok(Object.keys(s).length === 0 && Object.keys(aStore).length === 0, 'nothing of the edits is left in the store', JSON.stringify({ s, aStore }));
    ok(left === 0 && aLeft === 0 && aSecond.value === '', 'neither window keeps a draft', JSON.stringify({ left, aLeft, aSecond }));
    ok(await goTo('first'), 'back on #first');
    h = await hint();
    ok(h.notes === 'New note.' && h.hidden, 'the notes are the file\'s again', JSON.stringify(h));

    // With nothing stored there is nothing to confirm.
    await palette(spk);
    ok(!(await spk.evaluate(() => !!document.getElementById('psiINT-forget-modal'))), 'with nothing stored, no question is asked');

    // The projection's palette asks the same question, in front of nobody's
    // edits being lost by one press.
    await aud.bringToFront();
    await aud.keyboard.press('n'); await aud.waitForTimeout(300);
    await aud.keyboard.type(' y'); await aud.keyboard.press('Escape'); await aud.waitForTimeout(300);
    await palette(aud);
    ok(await aud.evaluate(() => !!document.getElementById('psiINT-forget-modal')), 'the projection asks too');
    await aud.locator('#psiINT-forget-modal .forget-modal-danger').click();
    await aud.waitForTimeout(400);
    ok(await spk.evaluate(() => Object.keys(annotations).length) === 0 && Object.keys(await store(aud)).length === 0,
      'and forgetting there clears the cockpit as well');

    // ── Shift-E exports the notes too, and --integrate-annotations takes them ──
    await spk.bringToFront();
    ok(await goTo('first'), 'the cockpit is on #first for the export');
    await press('Shift+N');
    await spk.evaluate(() => { const t = document.getElementById('psiINT-notes-content'); t.setSelectionRange(t.value.length, t.value.length); });
    await spk.keyboard.type(' TODO: a second example.');
    await press('Escape');
    ok(await goTo('second'), 'and on #second');
    await press('Shift+N');
    await spk.evaluate(() => { const t = document.getElementById('psiINT-notes-content'); t.select(); });
    await press('Backspace');
    await press('Escape');
    await press('n', 300);
    await spk.keyboard.type(' Ask the room.');
    await press('Escape', 400);
    s = await store(spk);
    ok(s['speakernote:first'] === 'New note. TODO: a second example.' && s['speakernote:second'] === ''
      && s['speakernote-base:second'] === 'B rewritten.',
      'two note overrides, one of them emptied, each with its base', JSON.stringify(s));

    // The projection's Shift-E copies the draft and names where the notes go out.
    await aud.bringToFront();
    await aud.keyboard.press('Shift+E');
    await aud.waitForTimeout(300);
    const badge = await aud.evaluate(() => document.getElementById('psiINT-mode-badge').textContent);
    ok(/edited speaker notes are exported from the cockpit's Shift-E/.test(badge),
      'the projection exports the draft alone and says the notes are the cockpit\'s', badge);

    await spk.bringToFront();
    await press('Shift+E', 500);
    const exp = await spk.evaluate(() => {
      const m = document.getElementById('psiINT-export-modal');
      return m ? { head: m.querySelector('.export-modal-head').textContent, snippet: m.querySelector('.export-modal-raw textarea').value } : null;
    });
    ok(exp && (/^1 annotation and 2 speaker notes copied/.test(exp.head) || /^Clipboard blocked/.test(exp.head)),
      'the cockpit\'s modal counts both kinds', exp && exp.head);
    ok(exp && exp.snippet.includes('### first\n<!-- note-base: "New note." -->\n> note: New note. TODO: a second example.\n')
      && /### second\n<!-- annot-base: "" -->\n> annot: Ask the room\.\n\n<!-- note-base: "B rewritten\." -->\n> note:\n/.test(exp.snippet)
      && !exp.snippet.includes('### third'),
      'the snippet carries the notes with their bases, the deletion as a lone > note:, and nothing unedited', exp && JSON.stringify(exp.snippet));

    // Paste, integrate with the command line, rebuild: the views say it.
    const srcPath = path.join(dir, 'source.md');
    fs.appendFileSync(srcPath, '\n' + exp.snippet);
    const ig = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), srcPath, '--integrate-annotations'],
      { cwd: ROOT, encoding: 'utf8' });
    const merged = fs.readFileSync(srcPath, 'utf8');
    ok(ig.status === 0 && /1 replaced, 1 deleted/.test(ig.stdout) && !merged.includes('annotations:start')
      && merged.includes('> note: New note. TODO: a second example.') && !merged.includes('B rewritten.')
      && /\{#second\}\n\n> annot: Ask the room\.\n/.test(merged),
      'the integrator replaces one note, deletes the other and moves the annotation', ig.stdout + ig.stderr);

    // Clear drafts takes the exported notes and their bases as well.
    await spk.locator('#psiINT-export-modal .export-modal-clear').click();
    await spk.waitForTimeout(400);
    s = await store(spk);
    ok(Object.keys(s).every(k => k === 'annotations') && !Object.keys(JSON.parse(s.annotations || '{}')).length,
      'Clear drafts now leaves no override, base or draft behind', JSON.stringify(s));
    h = await hint();
    ok(h.notes === 'B rewritten.', 'and the notes pane shows the source again', JSON.stringify(h));
    const rb = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), srcPath, '--no-optimize-images'],
      { cwd: ROOT, encoding: 'utf8' });
    if (rb.status !== 0) throw new Error('rebuild failed:\n' + rb.stdout + rb.stderr);
    await spk.reload({ waitUntil: 'load' });
    await spk.waitForTimeout(1000);
    ok(await goTo('first'), 'after the integrated rebuild the cockpit is on #first');
    h = await hint();
    ok(h.notes === 'New note. TODO: a second example.' && h.hidden, 'the edited note is now the source\'s own', JSON.stringify(h));
    ok(await goTo('second'), 'and on #second');
    h = await hint();
    const aSec = await annotIn(spk, 'second');
    ok(h.notes === '' && aSec.value === 'Ask the room.' && aSec.draft === null,
      'its notes are gone and its annotation comes from the source', JSON.stringify({ h, aSec }));

    ok(errors.length === 0, 'no page errors', errors.join(' | '));
    await spk.close();
    await aud.close();
  } finally {
    server.close();
  }
}
