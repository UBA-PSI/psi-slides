/*
 * Who the two live views listen to, and what they let in.
 *
 * A security review put a sandboxed frame inside audience.html - the shape a
 * frame inside an embedded player has - and had it post to the projection.
 * Opened from disk, the projection's origin is "null", and so is every
 * sandboxed frame's, so the sync handler's origin check let it through: the
 * frame was adopted as the peer, put an address of its choosing on the
 * projector, and sent a diagram-edit whose markup carried a <foreignObject>
 * with an <iframe srcdoc> in it, which ran its script in the projection. The
 * scrub on the swap removed on* attributes and javascript: URLs and nothing
 * else.
 *
 * Three fixes, one section each here:
 *
 *   - the handler accepts a message by who sent it, never by the origin it
 *     reports: the peer, the window that opened this one, or a window this
 *     one opened. Walked with a frame posting from inside, then with the real
 *     cockpit through both windows' reloads, which is the case a rule that
 *     strict could break;
 *   - the swap keeps an allow-list of SVG elements and attributes, and parses
 *     the markup where nothing in it can load or run;
 *   - a --watch projection that carries no editor carries no nonce.
 *
 * It builds decks of its own, for the reason test/README.md gives: the
 * lectures have no `editor: speaker` deck, and the nonce check needs a
 * --watch build of one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT } from './harness.mjs';

export const name = 'live views · who may talk to them';
export const lecture = 'diagrams';
export const view = 'audience';

const fixture = (editor) => `---
title: Trust
editor: ${editor}
---

## title: Trust

## figure: One | a figure {#one}

::: draw
box a "Alpha" at 1,1
:::

## free: Two | text {#two}

Some text.

## free: Three | more {#three}

More text.
`;

function buildFixture(editor, flags = []) {
  const dir = tmpDir('psi-trust-');
  fs.writeFileSync(path.join(dir, 'source.md'), fixture(editor));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
    { cwd: ROOT, encoding: 'utf8' });
  return { dir, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// A --watch build runs until killed; it has written every view once it says
// it is watching.
function watchBuild(editor) {
  const dir = tmpDir('psi-trust-watch-');
  fs.writeFileSync(path.join(dir, 'source.md'), fixture(editor));
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), '--watch', '--events'], { cwd: ROOT });
    let out = '';
    const done = (ok) => {
      clearTimeout(timer);
      try { child.kill('SIGTERM'); } catch (e) { /* gone */ }
      resolve({ dir, ok, out });
    };
    const timer = setTimeout(() => done(false), 30000);
    child.stdout.on('data', (b) => { out += b; if (/\{"type":"watching"/.test(out)) done(true); });
    child.stderr.on('data', (b) => { out += b; });
    child.on('exit', () => done(/\{"type":"watching"/.test(out)));
  });
}

// A sandboxed frame inside the page posting to the page's top - the sender
// the review used. `sandbox` without allow-same-origin makes its origin
// "null" whatever the page's is.
const postFromFrame = (page, msgs, sandbox = true) => page.evaluate(async ({ msgs, sandbox }) => {
  const f = document.createElement('iframe');
  if (sandbox) f.setAttribute('sandbox', 'allow-scripts');
  f.srcdoc = '<script>for (const m of ' + JSON.stringify(msgs) + ') top.postMessage(m, "*");<\/script>';
  document.body.appendChild(f);
  await new Promise((r) => setTimeout(r, 700));
  f.remove();
}, { msgs, sandbox });

const EVIL_SVG = '<svg class="psi-diagram" id="ID" xmlns="http://www.w3.org/2000/svg">'
  + '<foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" '
  + 'srcdoc="&lt;script&gt;parent.window.__pwn=1&lt;/script&gt;"></iframe></foreignObject>'
  + '<rect width="5" height="5" onmouseover="window.__pwn=2" onload="window.__pwn=2"/>'
  + '<set attributeName="href" to="javascript:window.__pwn=3"/>'
  + '<use href="http://example.invalid/x.svg#a"/>'
  + '<style>body { visibility: hidden }</style>'
  + '<text x="1" y="1">kept</text></svg>'
  + '<img src="x" onerror="window.__pwn=4">';

const projection = (page) => page.evaluate(() => {
  const o = document.getElementById('link-overlay');
  return {
    idx: state.activeIdx,
    blanked: document.body.classList.contains('blanked'),
    link: !!o && !o.classList.contains('hidden'),
    peer: hasLivePeer(),
    pwn: window.__pwn || 0,
    figure: (document.querySelector('svg.psi-diagram') || {}).outerHTML || '',
  };
});

export async function run({ page, report }) {
  const { ok } = report;
  const ctx = page.context();

  // ── served: a frame of the page's own origin is not the cockpit either ──
  // Over --serve the origin check is real, and an un-sandboxed srcdoc frame
  // passes it: it inherits the page's origin. The deck's own raw HTML can
  // make one, and so could anything that gets markup onto the page.
  await postFromFrame(page, [{ type: 'blank', source: 'speaker', blanked: true }], false);
  let p = await projection(page);
  ok(!p.blanked && !p.peer, 'served, a same-origin frame inside the page is not taken for the cockpit',
    JSON.stringify(p));

  // ── from disk: a "null" frame posts to the projection ──
  const fix = buildFixture('speaker');
  ok(fix.status === 0, 'the editor: speaker fixture builds', fix.out);
  if (fix.status !== 0) return;
  const aud = await ctx.newPage();
  const errs = [];
  aud.on('pageerror', (e) => errs.push(String(e)));
  await aud.goto('file://' + path.join(fix.dir, 'audience.html'), { waitUntil: 'load' });
  await aud.waitForTimeout(600);
  const figId = await aud.evaluate(() => document.querySelector('svg.psi-diagram').id);
  const before = await projection(aud);
  await postFromFrame(aud, [
    { type: 'hello', source: 'speaker' },
    { type: 'blank', source: 'speaker', blanked: true },
    { type: 'link-show', source: 'speaker', href: 'https://phish.example/login', label: 'Sign in' },
    { type: 'diagram-edit', source: 'speaker', id: figId, html: EVIL_SVG.replace('ID', figId) },
  ]);
  p = await projection(aud);
  ok(!p.peer, 'a sandboxed frame posting from inside is not adopted as the peer', JSON.stringify(p.peer));
  ok(!p.blanked && !p.link, 'and cannot blank the projection or put an address on it',
    JSON.stringify({ blanked: p.blanked, link: p.link }));
  ok(p.figure === before.figure && p.pwn === 0, 'and its diagram-edit is not applied');

  // ── the swap itself: an allow-list, parsed where nothing runs ──
  // Called directly, as the receiver would call it if a sender ever got past
  // the check above - the second layer on its own.
  const swapped = await aud.evaluate(async ({ id, html }) => {
    const next = dgSwapFigure(document.getElementById(id), html);
    await new Promise((r) => setTimeout(r, 800));
    return { out: next ? next.outerHTML : '', pwn: window.__pwn || 0,
      vis: getComputedStyle(document.body).visibility };
  }, { id: figId, html: EVIL_SVG.replace('ID', figId) });
  ok(swapped.pwn === 0, 'nothing in a hostile figure runs: no foreignObject frame, handler, set or stray img',
    String(swapped.pwn));
  ok(!/foreignObject|iframe|<set|onload|onmouseover|example\.invalid/i.test(swapped.out)
     && /<text x="1" y="1">kept<\/text>/.test(swapped.out),
     'the swap keeps the drawing and drops what is not one', swapped.out);
  ok(swapped.vis === 'visible', 'a <style> that is not scoped to the figure is dropped', swapped.vis);
  await aud.reload({ waitUntil: 'load' });
  await aud.waitForTimeout(500);

  // ── the real cockpit, through both windows' reloads ──
  const [spk] = await Promise.all([ctx.waitForEvent('page'), aud.keyboard.press('s')]);
  spk.on('pageerror', (e) => errs.push('cockpit: ' + e));
  await spk.waitForLoadState('load');
  await spk.waitForTimeout(900);
  const where = () => Promise.all([aud, spk].map((w) => w.evaluate(() => state.activeIdx)));
  const step = async (w) => { await w.bringToFront(); await w.keyboard.press('ArrowDown'); await aud.waitForTimeout(600); };

  await step(spk);
  let [a, s] = await where();
  ok(a === s && a > 0, 'the cockpit it opened still drives the projection', `${a} / ${s}`);
  await aud.reload({ waitUntil: 'load' });
  await aud.waitForTimeout(600);
  await step(spk);
  [a, s] = await where();
  ok(a === s, 'a reloaded projection takes the cockpit\'s next push (it is still the cockpit\'s opener)',
    `${a} / ${s}`);
  await step(aud);
  [a, s] = await where();
  ok(a === s, 'and drives the cockpit again', `${a} / ${s}`);
  await spk.reload({ waitUntil: 'load' });
  await spk.waitForTimeout(900);
  await step(aud);
  [a, s] = await where();
  ok(a === s, 'a reloaded cockpit finds its projection through its opener', `${a} / ${s}`);

  // With a peer in place a frame is still not it.
  await postFromFrame(aud, [{ type: 'blank', source: 'speaker', blanked: true }]);
  ok(!(await projection(aud)).blanked, 'a frame cannot blank the projection while the cockpit is connected');

  // editor: speaker sends an edit as compiled markup, so the allow-list is in
  // the path of every real edit on this kind of deck.
  await spk.evaluate(() => {
    const fig = dgeCollectFigures()[0];
    sendToPeer(dgeEditMessage(fig, fig.body.replace('Alpha', 'Omega')));
  });
  await aud.waitForTimeout(600);
  p = await projection(aud);
  ok(/Omega/.test(p.figure) && !/Alpha/.test(p.figure), 'an edit from the cockpit still reaches the projection');
  ok(errs.length === 0, 'no page errors in either window', errs.join(' | '));
  await spk.close();
  await aud.close();

  // ── --watch: the nonce only where a view writes ──
  const quiet = await watchBuild('speaker');
  ok(quiet.ok, 'a --watch build of the editor: speaker fixture comes up', quiet.out.slice(-400));
  if (!quiet.ok) return;
  const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
  const nonceOf = (html) => (html.match(/nonce: "([0-9a-f]+)"/) || [])[1];
  const qs = read(quiet.dir, 'speaker.html'), qa = read(quiet.dir, 'audience.html');
  const nonce = nonceOf(qs);
  ok(!!nonce, 'the cockpit, which ships the editor, carries the nonce');
  ok(!qa.includes(nonce) && !qa.includes('psiWatch') && /ws:\/\/127\.0\.0\.1:\d+/.test(qa),
    'the projection without an editor reloads over the socket and carries no nonce and nothing that sends');
  const both = await watchBuild('both');
  ok(both.ok && !!nonceOf(read(both.dir, 'audience.html')),
    'a projection that ships the editor still carries it - it writes to source.md');
  const none = await watchBuild('none');
  const ns = none.ok ? read(none.dir, 'speaker.html') : '';
  ok(none.ok && !nonceOf(ns) && !ns.includes('psiWatch') && /ws:\/\/127\.0\.0\.1:\d+/.test(ns),
    'with editor: none and no prompter the cockpit has nothing to send, and carries no nonce either');
}
