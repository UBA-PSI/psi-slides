/*
 * pitchblack: every dark theme on a true black ground, and the first command
 * that has no key.
 *
 * A spec and not a gate, because all of it is a computed colour or a focus:
 * the palette finds the command by its words and Enter runs it; the slide's
 * background is rgb(0, 0, 0) under each of the three dark themes with the
 * switch on, and is what it was under each of the four light ones; a figure's
 * .tone-2 box is the colour it was without the switch, to the digit, and so
 * stands further off the ground than before; a panel card stands off it too;
 * the choice survives a reload and is on the body before the runtime boots;
 * the cockpit and the projection agree in both directions; and a deck that
 * says `pitchblack: on` opens black with nothing stored.
 *
 * What needs no browser is elsewhere: the key's values, its refusal and the
 * body attribute are rows in test/settings.mjs; that the command has no key
 * in either key map, a run function in both views and a row with no kbd is
 * the commands gate; that every dark theme carries a --paper-own and every
 * figure mix goes over --dg-ground is the semantics gate.
 *
 * It builds a deck of its own, for the reason test/README.md gives: it needs
 * a card row, a toned figure and nothing else on three slides, and a clean
 * frontmatter - the tracked lectures pin neither a theme nor the switch, but
 * the colours are read off elements this spec has to be able to name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { serve, ROOT } from './harness.mjs';

export const name = 'themes · pitchblack, and a command with no key';
export const lecture = 'tutorial';
export const view = 'audience';

const BODY = `
# Part

## free: Cards {#cards}

A card row on the slide.

::: cards 3 {.panel}
- **one**\\
  the first card
- **two**\\
  the second card
- **three**\\
  the third card
:::

## free: Figure {#figure}

A figure with a quiet fill.

::: draw 60x20
box a "quiet" at 0,0 {.tone-2}
box b "strong" right of a gap 2 {.tone-3}
box c "accent" right of b gap 2 {.tone-1}
:::
`;
const DECK = (fm) => `---\ntitle: Pitch black\n${fm}---\n${BODY}`;

const LIGHT = ['light-red', 'light-teal', 'light-blue', 'light-orange'];
const DARK = ['dark', 'terminal-amber', 'terminal-green'];

function build(dir, ...flags) {
  return spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
    { cwd: ROOT, encoding: 'utf8' });
}

// What the page paints, as sRGB bytes. Read through a canvas rather than
// parsed out of the computed string, because that string is oklch(…) for a
// token, color(srgb …) for a color-mix and rgba(…) for an alpha, and the
// question is the pixel. `over` is the ground a translucent fill lies on.
const PROBE = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const px = (color, over) => {
    cx.globalCompositeOperation = 'copy';
    cx.fillStyle = over || 'rgba(0,0,0,0)';
    cx.fillRect(0, 0, 1, 1);
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    return [...cx.getImageData(0, 0, 1, 1).data];
  };
  const stage = getComputedStyle(document.getElementById('psiINT-stage-viewport')).backgroundColor;
  const body = getComputedStyle(document.body).backgroundColor;
  const chunk = document.querySelector('.chunk.active');
  const tone = document.querySelector('#figure .psi-diagram .tone-2 > :is(rect, circle, .dg-shape)');
  const card = document.querySelector('#cards .cards.cg-panel li');
  const cardBg = card ? getComputedStyle(card).backgroundColor : '';
  return {
    theme: document.body.dataset.theme,
    mode: document.body.dataset.mode,
    attr: document.body.dataset.pitchblack || null,
    state: state.pitchblack,
    stage: px(stage).slice(0, 3),
    body: px(body).slice(0, 3),
    chunk: chunk ? px(getComputedStyle(chunk).backgroundColor) : null,
    tone: tone ? px(getComputedStyle(tone).fill).slice(0, 3) : null,
    card: card ? px(cardBg, stage).slice(0, 3) : null,
    cardRaw: cardBg,
  };
};
const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const rgb = (a) => `rgb(${a.join(', ')})`;

export async function run({ page, report, errors: pageErrors }) {
  const { ok } = report;
  const dir = tmpDir('psi-pitchblack-');
  fs.writeFileSync(path.join(dir, 'source.md'), DECK(''));
  const b = build(dir);
  ok(b.status === 0, 'the fixture builds', (b.stdout || '') + (b.stderr || ''));
  if (b.status !== 0) return;
  const pinned = tmpDir('psi-pitchblack-pinned-');
  fs.writeFileSync(path.join(pinned, 'source.md'), DECK('theme: terminal-green\npitchblack: on\n'));
  const bp = build(pinned, '--audience-only');
  ok(bp.status === 0, 'and so does one that pins the switch', (bp.stdout || '') + (bp.stderr || ''));
  if (bp.status !== 0) return;

  const srv = await serve(dir);
  const srvPinned = await serve(pinned);
  const url = (v) => `http://127.0.0.1:${srv.port}/${v}.html`;
  const before = pageErrors.length;
  const press = async (k, wait = 150, p = page) => { await p.keyboard.press(k); await p.waitForTimeout(wait); };
  const type = async (s, p = page) => { await p.keyboard.type(s, { delay: 20 }); await p.waitForTimeout(150); };
  const probe = (p = page) => p.evaluate(PROBE);
  const stored = (p = page) => p.evaluate(() => { try { return localStorage.getItem('psi-slides:pitchblack'); } catch (e) { return 'n/a'; } });
  const fresh = async (v = 'audience') => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(url(v), { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
  };
  // The command, the way a lecturer reaches it: Cmd-K, its name, Enter.
  const toggle = async (p = page) => {
    await press('Meta+k', 250, p);
    await type('pitch', p);
    const sel = await p.evaluate(() => {
      const dt = document.querySelector('#psiINT-help-overlay dt.help-sel');
      return dt ? { cmd: dt.dataset.cmd, kbd: dt.querySelectorAll('kbd').length, text: dt.textContent.trim() } : null;
    });
    await press('Enter', 300, p);
    return sel;
  };
  // Every theme once, in the cycle's order, by the key that cycles them.
  const walk = async (p = page) => {
    const seen = {};
    for (let i = 0; i < 7; i++) {
      const s = await probe(p);
      seen[s.theme] = s;
      await press('a', 200, p);
    }
    return seen;
  };

  try {
    // ── the panel lists it, and lists no key for it ──
    await fresh();
    const boot = await probe();
    ok(boot.theme === 'light-red' && boot.attr === 'off' && boot.state === 'off',
      'a deck that says nothing opens with the switch off', JSON.stringify(boot));
    ok(await stored() === null, 'and nothing stored');
    await press('?', 250);
    const row = await page.evaluate(() => {
      const dt = document.querySelector('#psiINT-help-overlay .help-grid section dt[data-row="pitchblack"]');
      if (!dt) return null;
      const sec = dt.closest('section');
      return {
        cmd: dt.dataset.cmd, run: dt.classList.contains('help-run'), ref: sec.classList.contains('help-ref'),
        kbd: dt.querySelectorAll('kbd').length, text: dt.textContent.trim(), section: sec.querySelector('h3').textContent,
        shown: dt.getBoundingClientRect().height > 0,
      };
    });
    ok(row && row.cmd === 'pitchblack' && row.run && !row.ref && row.shown,
      'the ? panel lists pitchblack among the rows it can run', JSON.stringify(row));
    ok(row && row.kbd === 0 && row.text === 'no key',
      'and its key column names no key', JSON.stringify(row));
    await press('Escape', 200);
    // No press reaches it: every key of the keyboard's letter rows, plain
    // and shifted, leaves the switch where it was. (S and P open windows and
    // D asks for a screen; the table says what those do, and the commands
    // gate holds that no binding names this command.)
    const bound = await page.evaluate(() => Object.values(PSI_COMMANDS.keyMap('audience')).includes('pitchblack'));
    ok(!bound, 'no key in the audience key map reaches it');

    // ── off: what every theme's ground is ──
    await press('ArrowDown', 400);
    const off = await walk();
    ok(Object.keys(off).length === 7 && [...LIGHT, ...DARK].every((t) => off[t]),
      'A walks all seven themes', Object.keys(off).join(', '));
    for (const t of DARK) {
      ok(dist(off[t].stage, [0, 0, 0]) > 0 && off[t].attr === 'off',
        `without the switch, ${t} stands on its own dark paper`, rgb(off[t].stage));
    }

    // ── the palette toggles it ──
    const cur = await probe();
    ok(cur.theme === 'light-red', 'seven presses of A are back on the first theme', cur.theme);
    const sel = await toggle();
    ok(sel && sel.cmd === 'pitchblack' && sel.kbd === 0,
      'typing "pitch" in the palette selects the command, a line with no key on it', JSON.stringify(sel));
    const on0 = await probe();
    ok(on0.attr === 'on' && on0.state === 'on', 'Enter switches it on: the body carries data-pitchblack="on"', JSON.stringify(on0));
    ok(await stored() === 'on', 'and the choice is stored');
    const badge = await page.evaluate(() => document.getElementById('psiINT-mode-badge').textContent);
    ok(/pitch black · on/.test(badge) && /dark theme/.test(badge),
      'under a light theme the toast says where it will show', badge);

    // ── on: black under the dark themes, unchanged under the light ones ──
    const on = await walk();
    for (const t of LIGHT) {
      ok(on[t].attr === 'on' && rgb(on[t].stage) === rgb(off[t].stage) && rgb(on[t].body) === rgb(off[t].body)
        && rgb(on[t].tone) === rgb(off[t].tone),
        `${t}: the switch stays set and nothing on the slide moves`,
        `${rgb(off[t].stage)} -> ${rgb(on[t].stage)}, tone ${rgb(off[t].tone)} -> ${rgb(on[t].tone)}`);
    }
    for (const t of DARK) {
      ok(rgb(on[t].stage) === 'rgb(0, 0, 0)' && rgb(on[t].body) === 'rgb(0, 0, 0)',
        `${t}: the slide's ground is rgb(0, 0, 0)`, `stage ${rgb(on[t].stage)}, body ${rgb(on[t].body)}`);
      ok(on[t].chunk && on[t].chunk[3] === 0, `${t}: and the slide itself paints nothing over it`, JSON.stringify(on[t].chunk));
      // The tone is mixed over the theme's own paper (--dg-ground), so it is
      // the colour it was - and the ground under it fell, so it stands
      // further off than it did.
      ok(rgb(on[t].tone) === rgb(off[t].tone),
        `${t}: a .tone-2 box is the colour it is without the switch`, `${rgb(off[t].tone)} -> ${rgb(on[t].tone)}`);
      ok(dist(on[t].tone, on[t].stage) >= 12 && dist(on[t].tone, on[t].stage) > dist(off[t].tone, off[t].stage),
        `${t}: and stands further off the ground than before`,
        `${dist(off[t].tone, off[t].stage)} -> ${dist(on[t].tone, on[t].stage)} of 255 (${rgb(on[t].tone)})`);
    }

    // ── the panel card, on its own slide ──
    await press('ArrowUp', 400);
    const cardsOn = await walk();
    for (const t of DARK) {
      ok(/\/0\.2\)$/.test(cardsOn[t].cardRaw.replace(/\s+/g, '')),
        `${t}: a panel card is 20% of the ink under the switch`, cardsOn[t].cardRaw);
      ok(dist(cardsOn[t].card, cardsOn[t].stage) >= 30,
        `${t}: and stands visibly off the black`, `${rgb(cardsOn[t].card)} on ${rgb(cardsOn[t].stage)}`);
    }
    ok(/\/0\.05\)$/.test(cardsOn['light-red'].cardRaw.replace(/\s+/g, '')),
      'a light theme keeps the card at 5%', cardsOn['light-red'].cardRaw);
    if (process.env.PSI_PITCHBLACK_NOTE) {
      for (const t of DARK) {
        report.note(`${t}: paper ${rgb(off[t].stage)}, tone-2 ${rgb(on[t].tone)}, card ${rgb(cardsOn[t].card)} (${cardsOn[t].cardRaw})`);
      }
    }

    // ── a reload keeps it, from before the runtime boots ──
    await press('a', 200); await press('a', 200); await press('a', 200); await press('a', 200);
    ok((await probe()).theme === 'dark', 'four presses of A are the dark theme');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    const again = await probe();
    ok(again.theme === 'dark' && again.attr === 'on' && again.state === 'on' && rgb(again.stage) === 'rgb(0, 0, 0)',
      'a reload opens on the dark theme, still black', JSON.stringify(again));
    const early = await page.evaluate(() => {
      const first = document.body.firstElementChild;
      return { firstIsScript: !!first && first.tagName === 'SCRIPT' && /psi-slides:pitchblack/.test(first.textContent) };
    });
    ok(early.firstIsScript, 'because the script at the head of the body reads the stored choice before the first paint');

    // ── the cockpit and the projection agree, both ways ──
    const [spk] = await Promise.all([
      page.context().waitForEvent('page'),
      press('s', 300),
    ]);
    await spk.waitForLoadState();
    await spk.waitForTimeout(900);
    const s0 = await probe(spk);
    ok(/speaker\.html/.test(spk.url()) && s0.attr === 'on' && rgb(s0.stage) === 'rgb(0, 0, 0)',
      'the cockpit opens with the switch on, its mirror of the slide black', JSON.stringify(s0));
    const spkRow = await spk.evaluate(() => {
      const dt = document.querySelector('#psiINT-help-overlay .help-grid section dt[data-row="pitchblack"]');
      return dt ? { cmd: dt.dataset.cmd, kbd: dt.querySelectorAll('kbd').length } : null;
    });
    ok(spkRow && spkRow.cmd === 'pitchblack' && spkRow.kbd === 0, 'the cockpit\'s panel lists it too, with no key', JSON.stringify(spkRow));
    const selS = await toggle(spk);
    await page.waitForTimeout(300);
    const a1 = await probe(), s1 = await probe(spk);
    ok(selS && selS.cmd === 'pitchblack' && s1.attr === 'off' && a1.attr === 'off' && dist(a1.stage, [0, 0, 0]) > 0,
      'switched off from the cockpit\'s palette, the projection is back on the dark paper', `${JSON.stringify(a1.stage)} ${a1.attr}`);
    await toggle();
    await spk.waitForTimeout(300);
    const s2 = await probe(spk);
    ok(s2.attr === 'on' && rgb(s2.stage) === 'rgb(0, 0, 0)', 'and switched on from the projection, the cockpit follows', JSON.stringify(s2));
    await spk.close();

    // ── pinned in the frontmatter ──
    await page.goto(`http://127.0.0.1:${srvPinned.port}/audience.html`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    const pin = await probe();
    ok(pin.theme === 'terminal-green' && pin.attr === 'on' && rgb(pin.stage) === 'rgb(0, 0, 0)',
      'pitchblack: on beside theme: terminal-green opens black with nothing stored', JSON.stringify(pin));
    ok(await page.evaluate(() => !/psi-slides:pitchblack/.test(document.body.firstElementChild.textContent || '')
      || document.body.firstElementChild.tagName !== 'SCRIPT'),
      'and with both keys pinned there is no boot script to ask the store');
    await toggle();
    const unpin = await probe();
    ok(unpin.attr === 'off' && dist(unpin.stage, [0, 0, 0]) > 0, 'the command still switches a pinned deck, for this page load', JSON.stringify(unpin));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    ok((await probe()).attr === 'on', 'and a reload is the author\'s word again');

    ok(pageErrors.length === before, 'no page error along the way', pageErrors.slice(before).join(' | '));
  } finally {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* private window */ } }).catch(() => {});
    srv.server.close();
    srvPinned.server.close();
  }
}
