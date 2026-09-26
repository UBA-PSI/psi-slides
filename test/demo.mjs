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
 * cockpit from the projection side.
 */
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'live demo · both transports';
export const lecture = 'diagrams';
export const view = 'audience';

// A canvas stream instead of a capture, resolving after `delay` ms so a
// spec can press D again while the "picker" is still open.
const stubCapture = (page, delay = 0) => page.evaluate((delay) => {
  window.__captures = 0;
  navigator.mediaDevices.getDisplayMedia = () => new Promise((resolve) => setTimeout(() => {
    window.__captures++;
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const ctx = c.getContext('2d'); let t = 0;
    setInterval(() => { ctx.fillStyle = 'hsl(' + (t++ % 360) + ' 80% 50%)'; ctx.fillRect(0, 0, 640, 360); }, 33);
    resolve(c.captureStream(30));
  }, delay));
}, delay);

const showing = (page) => page.evaluate(() => {
  const v = document.getElementById('demo-video');
  return {
    overlay: !document.getElementById('demo-overlay').classList.contains('hidden'),
    stageOff: document.body.classList.contains('demo-live'),
    width: v.videoWidth,
    playing: !v.paused,
  };
});
const cockpit = (page) => page.evaluate(() => ({
  badge: !document.getElementById('demo-badge').classList.contains('hidden'),
  stream: !!demoStream,
  pc: demoPc ? demoPc.connectionState : null,
  captures: window.__captures,
  toast: document.getElementById('mode-badge').textContent,
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
  await aud.bringToFront();
  await aud.reload({ waitUntil: 'load' });
  await aud.waitForTimeout(700);
  a = await showing(aud);
  ok(!a.overlay, 'a reloaded projection starts without the picture');
  await spk.bringToFront();
  await spk.keyboard.press('ArrowDown');
  await aud.waitForTimeout(900);
  a = await showing(aud);
  ok(a.overlay && a.width === 640, 'the next cockpit push brings the demo back', JSON.stringify(a));

  // ── D in overview still ends it; the stop from the projection reaches the cockpit ──
  await spk.keyboard.press('o');
  await spk.waitForTimeout(400);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(600);
  a = await showing(aud); s = await cockpit(spk);
  ok(!a.overlay && !a.stageOff && a.width === 0, 'D in the cockpit overview ends the demo on the projection', JSON.stringify(a));
  ok(!s.badge && !s.stream, 'and the badge goes with it', JSON.stringify(s));
  await spk.keyboard.press('Escape');
  await spk.waitForTimeout(300);

  await spk.keyboard.press('d');
  await aud.waitForTimeout(900);
  await aud.bringToFront();
  await aud.keyboard.press('d');
  await spk.waitForTimeout(600);
  s = await cockpit(spk); a = await showing(aud);
  ok(!a.overlay && !s.stream && !s.badge, 'D on the projection ends a demo the cockpit started', JSON.stringify(s));

  // ── D twice while the picker is open: one capture, and the second press is not a stop ──
  await stubCapture(spk, 500);
  await spk.bringToFront();
  await spk.keyboard.press('d');
  await spk.waitForTimeout(120);
  await spk.keyboard.press('d');
  await aud.waitForTimeout(1300);
  s = await cockpit(spk); a = await showing(aud);
  ok(s.captures === 1 && s.stream && a.overlay, 'D while the picker is open is ignored, not a second capture', JSON.stringify(s));
  await spk.keyboard.press('d');
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
  ok(!a.overlay && s.pc === null && !s.stream, 'D ends it and closes the connection at both ends', JSON.stringify({ a, s }));
  ok(fileErrors.length === 0, 'no page errors on the file:// projection', fileErrors.join(' | '));
  await spk.close();
  await fileAud.close();
}
