/*
 * The search field at the head of the ? panel, in both live views.
 *
 * A spec and not a gate, because the three things it asserts are about one
 * keydown listener and a focused element in a running page: that the field
 * has the keyboard when the panel opens, that a letter typed there types a
 * letter instead of blanking the projection or cycling the font, and that
 * Esc empties the field before it closes the panel. That every key has a row
 * to find is the commands gate's job, without a browser.
 *
 * It builds two decks of its own, for the reason test/README.md gives for
 * the others that do: it needs a `lang: de` deck, and no lecture here is one
 * whose placeholder a spec could read. The decks are two slides each; the
 * panel's rows do not depend on the lecture.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, ROOT } from './harness.mjs';

export const name = 'help · the search field in the ? panel';
export const lecture = 'tutorial';
export const view = 'audience';

const deck = (lang) => `---
title: Help search
${lang ? 'lang: ' + lang + '\n' : ''}---

# Part

## statement: One {#one}

The first slide.

## statement: Two {#two}

The second slide.
`;

function buildFixture(lang) {
  const dir = tmpDir('psi-help-');
  fs.writeFileSync(path.join(dir, 'source.md'), deck(lang));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

export async function run({ page, report }) {
  const { ok } = report;

  const panel = () => page.evaluate(() => {
    const o = document.getElementById('psiINT-help-overlay');
    const f = o.querySelector('#psiINT-help-search');
    // The reference's rows while the field is empty, the palette's lines
    // while it has text - whichever the panel is showing.
    const dts = [...o.querySelectorAll('.help-grid section dt')];
    const shown = f.value.trim()
      ? [...o.querySelectorAll('.help-results dt')].filter((d) => !d.hidden)
      : dts.filter((d) => !d.hidden && !d.closest('section').hidden);
    return {
      open: !o.classList.contains('hidden'),
      focused: document.activeElement === f,
      value: f.value,
      placeholder: f.placeholder,
      total: dts.length,
      shown: shown.length,
      rows: shown.map((d) => d.textContent + ' | ' + d.nextElementSibling.textContent),
      none: !o.querySelector('.help-none').hidden,
      noneText: o.querySelector('.help-none').textContent,
    };
  });
  const knobs = () => page.evaluate(() => ({
    blanked: !!state.blanked,
    font: document.body.dataset.font || '',
    collapse: state.collapse,
  }));
  const press = async (k, wait = 120) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
  const type = async (s) => { await page.keyboard.type(s, { delay: 20 }); await page.waitForTimeout(120); };

  const en = buildFixture('');
  ok(en.status === 0, 'the English fixture builds', en.out);
  const de = buildFixture('de');
  ok(de.status === 0, 'the German fixture builds', de.out);
  if (en.status !== 0 || de.status !== 0) return;
  const enSrv = await serve(en.dir);
  const deSrv = await serve(de.dir);

  try {
    for (const v of ['audience', 'speaker']) {
      await page.goto(`http://127.0.0.1:${enSrv.port}/${v}.html`, { waitUntil: 'load' });
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(600);
      const before = await knobs();

      await press('?', 250);
      let p = await panel();
      ok(p.open && p.focused, `${v}: ? opens the panel with the search field focused`, JSON.stringify(p));
      ok(p.placeholder === 'find a key or an action', `${v}: the placeholder is the English one`, p.placeholder);
      ok(p.shown === p.total && !p.none, `${v}: every row stands while the field is empty`, p.shown + '/' + p.total);

      // A letter typed into the field is a letter: B does not blank, F does
      // not change the font, C does not change the collapse.
      await type('bfc');
      const after = await knobs();
      ok(JSON.stringify(after) === JSON.stringify(before),
        `${v}: b, f and c typed into the field reach no key binding`, JSON.stringify(after));
      ok((await panel()).value === 'bfc', `${v}: they are in the field`, (await panel()).value);

      await press('Escape');
      p = await panel();
      ok(p.open && p.value === '' && p.focused, `${v}: the first Esc empties the field and leaves the panel open`, JSON.stringify({ open: p.open, value: p.value }));

      // A word filters by the description; diacritics are folded.
      await type('blänk');
      p = await panel();
      ok(p.shown > 0 && p.shown < p.total && p.rows.every((r) => /blank/i.test(r)),
        `${v}: a word keeps only the rows that carry it, diacritics folded`, p.rows.join(' || '));

      // One character is a key, not a letter in the prose.
      await press('Escape');
      await type('b');
      p = await panel();
      ok(p.shown >= 1 && p.rows.every((r) => /^B\b|\bB\b/.test(r.split(' | ')[0])),
        `${v}: a single character matches the key column only`, p.rows.join(' || '));

      // Two words must both be there.
      await press('Escape');
      await type('shift e');
      p = await panel();
      ok(p.shown >= 1 && p.rows.every((r) => /Shift/.test(r) && /\bE\b/.test(r.split(' | ')[0])),
        `${v}: two words both have to match`, p.rows.join(' || '));

      await press('Escape');
      await type('qqqzz');
      p = await panel();
      ok(p.shown === 0 && p.none && p.noneText === 'no key or action matches',
        `${v}: nothing matching shows the one quiet line`, JSON.stringify({ shown: p.shown, none: p.none, text: p.noneText }));

      await press('Escape');
      await press('Escape', 200);
      p = await panel();
      ok(!p.open && !p.focused, `${v}: the second Esc closes the panel and gives the keyboard back`, JSON.stringify({ open: p.open, focused: p.focused }));

      await press('b', 200);
      ok((await knobs()).blanked === !before.blanked, `${v}: B blanks again once the panel is closed`);
      await press('b', 200);

      await press('?', 250);
      await press('?', 250);
      ok(!(await panel()).open, `${v}: ? in the empty field closes the panel`);

      // Opened again, the panel is whole: no filter survives a visit.
      await press('?', 250);
      await type('zoom');
      await press('?', 150);
      ok((await panel()).open && (await panel()).value === 'zoom?', `${v}: ? in a field with text in it is typed`);
      await press('Escape');
      await press('Escape', 200);
      await press('?', 250);
      p = await panel();
      ok(p.value === '' && p.shown === p.total, `${v}: the panel opens unfiltered the next time`, p.value + ' ' + p.shown + '/' + p.total);
      await press('Escape', 200);
    }

    await page.goto(`http://127.0.0.1:${deSrv.port}/audience.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await press('?', 250);
    await type('qqqzz');
    const p = await panel();
    ok(p.placeholder === 'Taste oder Aktion suchen', 'lang: de: the placeholder is German', p.placeholder);
    ok(p.none && p.noneText === 'Keine Taste und keine Aktion passt', 'lang: de: so is the empty line', p.noneText);
  } finally {
    enSrv.server.close();
    deSrv.server.close();
  }
}
