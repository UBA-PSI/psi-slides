/*
 * W: the projection without the browser round it.
 *
 * This one is a spec rather than a gate for a reason no other navigation
 * spec has: the feature is shaped by a *browser policy*, and the only way to
 * know what the policy is, is to ask a browser. requestFullscreen is granted
 * to a press in the window that makes the call and refused to a request that
 * arrived by postMessage - measured here rather than assumed, because the
 * design (a hint on the projection, a click to spend) is only right for as
 * long as the refusal is real. If Chromium ever relaxes it, the first two
 * assertions below change and the arming path stops being needed; that is
 * exactly the news this spec exists to carry.
 *
 * Headless Chromium honours the API fully: document.fullscreenElement is set
 * and fullscreenchange fires. What it does **not** do is resize the viewport,
 * which Playwright pins - so the re-measure that a real frame change triggers
 * (auto-fit, --slide-h, slide-ref) cannot be observed here and is asserted in
 * test/auto-fit.mjs against a resize instead. Said out loud rather than left
 * as a gap somebody re-discovers.
 *
 * The lecture is `tutorial` because nothing here depends on a figure.
 */
export const name = 'navigation · fullscreen';
export const lecture = 'tutorial';
export const view = 'audience';

const fsState = (p) => p.evaluate(() => ({
  on: !!document.fullscreenElement,
  hint: !document.getElementById('fullscreen-hint').classList.contains('hidden'),
}));

async function openCockpit(aud) {
  const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
  await spk.waitForLoadState();
  await spk.waitForTimeout(900);
  return spk;
}

export async function run({ page, report, at, press, restart }) {
  const { ok, note } = report;
  const aud = page;

  await restart();

  // Note for anyone extending this: the policy cannot be measured with
  // page.evaluate. Playwright evaluates with the user-activation flag set, so
  // a bare requestFullscreen there is *granted* and says nothing about what a
  // message handler may do. The only honest probe is the real path - a
  // postMessage from the cockpit, below.

  const start = await at();
  await press('w', 600);
  let s = await fsState(aud);
  ok(s.on, 'W in the projection window puts it into fullscreen', JSON.stringify(s));
  ok(!s.hint, 'and asks for no click, because the press was the gesture');
  ok((await at()).id === start.id, 'and moves no slide', (await at()).id);

  await press('w', 600);
  ok(!(await fsState(aud)).on, 'W again leaves it');
  // Escape is deliberately not asserted here. Leaving on Escape is the
  // *browser's* behaviour, above the page - the key map never sees it - and
  // headless Chromium has no browser chrome to implement it, so a press here
  // measures nothing. What the page owes Escape is to not swallow it, and it
  // does not: the Escape branch of the key map calls preventDefault only on
  // the targets it actually unwinds.

  // ── the cockpit's W: a command the projection cannot obey on its own ──
  const spk = await openCockpit(aud);
  await spk.bringToFront();
  await spk.keyboard.press('w');
  await aud.waitForTimeout(700);

  s = await fsState(aud);
  ok(!s.on, 'the cockpit W does not put the projection into fullscreen by itself', JSON.stringify(s));
  ok(s.hint, 'it arms it instead, and the projection says so in one line');
  ok(!(await spk.evaluate(() => !!document.fullscreenElement)),
    'and the cockpit stays in its window');
  note('cockpit toast: ' + await spk.evaluate(() => document.getElementById('mode-badge').textContent));

  // One click on the projection spends the arming - and only that. The click
  // lands on a figure-bearing slide in the middle of the frame, so a press
  // that also reached the page would show up as a focused figure.
  await aud.bringToFront();
  await aud.mouse.click(720, 450);
  await aud.waitForTimeout(700);
  s = await fsState(aud);
  ok(s.on, 'one click anywhere on the projection enters fullscreen', JSON.stringify(s));
  ok(!s.hint, 'and the line comes down with it');
  ok(await aud.evaluate(() => !document.body.classList.contains('figure-focused')),
    'the click is spent on the frame and not also on what it landed on');

  // The projection tells the cockpit where it is, so the cockpit's next W is
  // an exit rather than a second request.
  ok(await spk.evaluate(() => peerFullscreen) === true,
    'the cockpit learns that the projection is fullscreen', String(await spk.evaluate(() => peerFullscreen)));

  // ── leaving costs no gesture ──
  await spk.bringToFront();
  await spk.keyboard.press('w');
  await aud.waitForTimeout(700);
  s = await fsState(aud);
  ok(!s.on, 'the cockpit W takes the projection back out with no click at all', JSON.stringify(s));
  ok(!s.hint, 'and puts no hint up for an exit');
  ok(await spk.evaluate(() => peerFullscreen) === false,
    'and the cockpit knows it is out again');

  // ── the arming does not live on the wall for ever ──
  // The timer is 20 s, which no spec should sit through; what is checked is
  // that the path it walks puts the line down.
  await aud.evaluate(() => { armFullscreen(); });
  ok((await fsState(aud)).hint, 'armFullscreen puts the line up');
  await aud.evaluate(() => { disarmFullscreen(); });
  ok(!(await fsState(aud)).hint,
    'and disarmFullscreen takes it down again - the path the 20 s timer walks');

  // ── the touch palette calls the same function the key calls ──
  const wired = await aud.evaluate(() =>
    !!document.querySelector('#touch-palette [data-action=fullscreen]'));
  ok(wired, 'the coarse-pointer palette carries a fullscreen button');

  await spk.close();
}
