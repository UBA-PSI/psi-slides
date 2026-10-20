/*
 * The live demo (D): a window or a screen captured in the cockpit and shown
 * on the projection. Two transports, chosen by origin - served over http the
 * projection plays the cockpit's MediaStream directly; from file:// the
 * stream crosses an RTCPeerConnection on loopback with the handshake carried
 * over postMessage - and both are walked here, with a canvas stream standing
 * in for getDisplayMedia, which headless Chromium has no screen to answer.
 * What the stub cannot cover is the picker itself; everything after it is
 * the same code.
 *
 * The cases are the ones a review found: D pressed twice while the picker
 * is open, D from the cockpit with no projection window, D in overview, the
 * projection reloading under a running demo, and the stop reaching the
 * cockpit from the projection side - and since D pauses rather than ends:
 * the pause from either window, showing it again without a second capture,
 * a projection reloaded under a paused demo, Shift-D for another window on
 * both transports, the shared window closing, and the palette's end.
 */
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'live demo · both transports';
export const lecture = 'diagrams';
export const view = 'audience';
// Run alone, after the parallel batch (test/run.mjs): a capture handed between two windows over WebRTC on loopback, waited for with fixed sleeps.
export const serial = true;

// A canvas stream instead of a capture, resolving after `delay` ms so a
// spec can press D again while the "picker" is still open. Each capture is
// wider than the one before (640, 800, 960 ...), so the projection's
// videoWidth says which window it is showing.
const stubCapture = (page, delay = 0) => page.evaluate((delay) => {
  window.__captures = 0;
  navigator.mediaDevices.getDisplayMedia = () => new Promise((resolve) => setTimeout(() => {
    window.__captures++;
    const w = 480 + 160 * window.__captures;
    const c = document.createElement('canvas'); c.width = w; c.height = 360;
    const ctx = c.getContext('2d'); let t = 0;
    setInterval(() => { ctx.fillStyle = 'hsl(' + (t++ % 360) + ' 80% 50%)'; ctx.fillRect(0, 0, w, 360); }, 33);
    resolve(c.captureStream(30));
  }, delay));
}, delay);

const showing = (page) => page.evaluate(() => {
  const v = document.getElementById('psiINT-demo-video');
  return {
    overlay: !document.getElementById('psiINT-demo-overlay').classList.contains('hidden'),
    stageOff: document.body.classList.contains('demo-live'),
    width: v.videoWidth,
    playing: !v.paused,
  };
});
const cockpit = (page) => page.evaluate(() => ({
  badge: !document.getElementById('psiINT-demo-badge').classList.contains('hidden'),
  badgeText: document.getElementById('psiINT-demo-badge').textContent,
  paused: demoPaused,
  stream: !!demoStream,
  live: demoStream ? demoStream.getVideoTracks()[0].readyState : null,
  pc: demoPc ? demoPc.connectionState : null,
  captures: window.__captures,
  toast: document.getElementById('psiINT-mode-badge').textContent,
}));

async function openCockpit(aud) {
  const [spk] = await Promise.all([aud.context().waitForEvent('page'), aud.keyboard.press('s')]);
  await spk.waitForLoadState();
  await spk.waitForTimeout(900);
  return spk;
}

export async function run({ page, report, press }) {
  const { ok } = report;
  const aud = page;

  // ── same origin: the direct hand-over ──
  let spk = await openCockpit(aud);
  await stubCapture(spk);
  await spk.bringToFront();
  await spk.keyboard.press('d');
  await aud.waitForTimeout(1200);
  let a = await showing(aud), s = await cockpit(spk);
  ok(a.overlay && a.width === 640 && a.playing, 'served over http, the projection plays the cockpit stream', JSON.stringify(a));
  ok(a.stageOff, 'and the stage under it stops painting');
  ok(s.pc === null, 'with no peer connection - the direct path', JSON.stringify(s));
  ok(s.badge && s.stream, 'the cockpit shows the DEMO badge', JSON.stringify(s));

  // ── the projection reloads: the cockpit hands the demo over again ──
  // Without a press: the cockpit hears the goodbye, asks the window with a
  // ping, and the reloaded projection's hello is answered with the demo.
  await aud.bringToFront();
  await aud.reload({ waitUntil: 'load' });
  await aud.waitForTimeout(1500);
  a = await showing(aud);
  ok(a.overlay && a.width === 640, 'a reloaded projection gets the demo back without a press', JSON.stringify(a));
  await spk.bringToFront();
  await spk.keyboard.press('ArrowDown');
  await aud.waitForTimeout(900);
  a = await showing(aud);
  ok(a.overlay && a.width === 640, 'and keeps it on the next cockpit push', JSON.stringify(a));

  // ── D in overview pauses it; D again shows the same capture, no picker ──
  await spk.keyboard.press('o');
  await spk.waitForTimeout(400);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(600);
  a = await showing(aud); s = await cockpit(spk);
  ok(!a.overlay && !a.stageOff, 'D in the cockpit overview takes the demo off the projection', JSON.stringify(a));
  ok(s.stream && s.live === 'live' && s.paused, 'and the capture keeps running, paused', JSON.stringify(s));
  ok(s.badge && /PAUSED/.test(s.badgeText), 'the badge says it is paused', s.badgeText);
  await spk.keyboard.press('Escape');
  await spk.waitForTimeout(300);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(600);
  a = await showing(aud); s = await cockpit(spk);
  ok(a.overlay && a.stageOff && a.width === 640, 'D again shows the same window on the projection', JSON.stringify(a));
  ok(s.captures === 1 && !s.paused && !/PAUSED/.test(s.badgeText), 'without a second capture', JSON.stringify(s));

  // ── the pause from the projection side reaches the cockpit, both ways ──
  await aud.bringToFront();
  await aud.keyboard.press('d');
  await spk.waitForTimeout(600);
  s = await cockpit(spk); a = await showing(aud);
  ok(!a.overlay && s.stream && s.paused, 'D on the projection pauses a demo the cockpit holds', JSON.stringify(s));
  await aud.keyboard.press('d');
  await spk.waitForTimeout(600);
  s = await cockpit(spk); a = await showing(aud);
  ok(a.overlay && !s.paused && s.captures === 1, 'and D there again shows it', JSON.stringify(s));

  // ── reloaded under a paused demo: handed over, still paused ──
  await spk.bringToFront();
  await spk.keyboard.press('d');
  await aud.waitForTimeout(400);
  await aud.bringToFront();
  await aud.reload({ waitUntil: 'load' });
  await aud.waitForTimeout(700);
  await spk.bringToFront();
  await spk.keyboard.press('ArrowDown');
  await aud.waitForTimeout(900);
  a = await showing(aud);
  const handed = await aud.evaluate(() => ({ src: !!document.getElementById('psiINT-demo-video').srcObject, paused: demoPaused }));
  ok(!a.overlay && handed.src && handed.paused, 'a projection reloaded under a paused demo gets the stream and keeps it hidden', JSON.stringify(handed));
  await spk.keyboard.press('d');
  await aud.waitForTimeout(600);
  a = await showing(aud);
  ok(a.overlay && a.width === 640, 'and D shows it at once', JSON.stringify(a));

  // ── Shift-D: another window in place of the one shared ──
  const first = await spk.evaluate(() => { window.__first = demoStream.getVideoTracks()[0]; return true; });
  await spk.keyboard.press('Shift+D');
  await aud.waitForTimeout(900);
  a = await showing(aud); s = await cockpit(spk);
  const oldTrack = await spk.evaluate(() => window.__first.readyState);
  ok(first && a.overlay && a.width === 800 && s.captures === 2, 'Shift-D shows the window picked in the second picker', JSON.stringify(a));
  ok(oldTrack === 'ended', 'and stops the capture it replaced', oldTrack);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(400);
  await spk.keyboard.press('Shift+D');
  await aud.waitForTimeout(900);
  a = await showing(aud); s = await cockpit(spk);
  ok(a.overlay && a.width === 960 && !s.paused, 'Shift-D on a paused demo shows the new window', JSON.stringify(a));
  await spk.click('#psiINT-demo-badge .demo-btn[data-demo=switch]');
  await aud.waitForTimeout(900);
  a = await showing(aud); s = await cockpit(spk);
  const focusAfter = await spk.evaluate(() => document.activeElement && document.activeElement.className);
  ok(a.overlay && a.width === 1120 && s.captures === 4, 'the badge\'s "other window" button does what Shift-D does', JSON.stringify(a));
  ok(focusAfter !== 'demo-btn', 'and leaves no focus on itself for the next Space', String(focusAfter));
  await spk.evaluate(() => { navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new DOMException('cancelled', 'NotAllowedError')); });
  await spk.keyboard.press('Shift+D');
  await aud.waitForTimeout(500);
  a = await showing(aud); s = await cockpit(spk);
  ok(a.overlay && a.width === 1120 && s.stream && /kept/.test(s.toast), 'a cancelled picker keeps the window already shared', JSON.stringify(s));

  // ── the shared window closes: the demo ends, and D asks again ──
  await stubCapture(spk);
  await spk.evaluate(() => demoStream.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await aud.waitForTimeout(600);
  a = await showing(aud); s = await cockpit(spk);
  ok(!a.overlay && !a.stageOff && a.width === 0 && !s.stream && !s.badge, 'a capture that ends ends the demo on both screens', JSON.stringify({ a, s }));
  await spk.keyboard.press('d');
  await aud.waitForTimeout(900);
  a = await showing(aud); s = await cockpit(spk);
  ok(a.overlay && s.captures === 1, 'and the next D opens the picker again', JSON.stringify(s));

  // ── the palette ends it, from the projection too ──
  await aud.evaluate(() => runCommand('demo-end'));
  await spk.waitForTimeout(600);
  s = await cockpit(spk); a = await showing(aud);
  ok(!a.overlay && !s.stream && !s.badge && s.live === null, '"End the live demo" on the projection stops the cockpit capture', JSON.stringify(s));

  // ── D twice while the picker is open: one capture, and the second press is not a stop ──
  await stubCapture(spk, 500);
  await spk.bringToFront();
  await spk.keyboard.press('d');
  await spk.waitForTimeout(120);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(1300);
  s = await cockpit(spk); a = await showing(aud);
  ok(s.captures === 1 && s.stream && a.overlay, 'D while the picker is open is ignored, not a second capture', JSON.stringify(s));
  await spk.click('#psiINT-demo-badge .demo-btn[data-demo=end]');
  await aud.waitForTimeout(500);
  s = await cockpit(spk); a = await showing(aud);
  ok(!a.overlay && !s.stream && !s.badge, 'the badge\'s "end" button ends the demo on both screens', JSON.stringify(s));
  await aud.waitForTimeout(400);
  await spk.close();

  // ── a cockpit with no projection refuses before the picker ──
  const lone = await aud.context().newPage();
  await lone.goto(aud.url().replace('audience.html', 'speaker.html'), { waitUntil: 'load' });
  await lone.waitForTimeout(700);
  await stubCapture(lone);
  await lone.keyboard.press('d');
  await lone.waitForTimeout(400);
  s = await cockpit(lone);
  ok(s.captures === 0 && !s.stream && /no projection/.test(s.toast), 'a cockpit without a projection says so instead of capturing', JSON.stringify(s));
  await lone.close();

  // ── file://, two opaque origins: the loopback connection ──
  const fileAud = await aud.context().newPage();
  const fileErrors = [];
  fileAud.on('pageerror', e => fileErrors.push(String(e)));
  await fileAud.goto('file://' + path.join(ROOT, 'lectures', lecture, 'audience.html'), { waitUntil: 'load' });
  await fileAud.waitForTimeout(700);
  spk = await openCockpit(fileAud);
  await stubCapture(spk);
  await spk.bringToFront();
  await spk.keyboard.press('d');
  await fileAud.waitForTimeout(2500);
  a = await showing(fileAud); s = await cockpit(spk);
  ok(a.overlay && a.width === 640 && a.playing, 'from file://, the projection plays the stream over loopback', JSON.stringify(a));
  ok(s.pc === 'connected', 'through a connected peer connection', JSON.stringify(s));
  const params = await spk.evaluate(() => demoPc.getSenders()[0].getParameters());
  ok(params.encodings[0].maxBitrate === 40e6 && params.degradationPreference === 'maintain-resolution',
    'and the raised bitrate survived negotiation', JSON.stringify(params.encodings[0]));
  await spk.keyboard.press('d');
  await fileAud.waitForTimeout(600);
  a = await showing(fileAud); s = await cockpit(spk);
  ok(!a.overlay && s.pc === 'connected' && s.paused, 'D pauses it and the connection stays up', JSON.stringify({ a, s }));
  await spk.keyboard.press('d');
  await fileAud.waitForTimeout(600);
  a = await showing(fileAud);
  ok(a.overlay && a.width === 640, 'D again shows it over the same connection', JSON.stringify(a));
  await spk.evaluate(() => { window.__pc = demoPc; });
  await spk.keyboard.press('Shift+D');
  await fileAud.waitForTimeout(1500);
  a = await showing(fileAud); s = await cockpit(spk);
  const samePc = await spk.evaluate(() => window.__pc === demoPc);
  ok(a.overlay && a.width === 800 && samePc && s.pc === 'connected', 'Shift-D puts the new window into the running connection', JSON.stringify({ a, samePc }));
  await spk.evaluate(() => runCommand('demo-end'));
  await fileAud.waitForTimeout(600);
  a = await showing(fileAud); s = await cockpit(spk);
  ok(!a.overlay && s.pc === null && !s.stream, 'ending it closes the connection at both ends', JSON.stringify({ a, s }));
  ok(fileErrors.length === 0, 'no page errors on the file:// projection', fileErrors.join(' | '));
  await spk.close();
  await fileAud.close();
}
