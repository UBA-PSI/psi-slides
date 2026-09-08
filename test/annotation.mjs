/*
 * The annotation being typed is the slide.
 *
 * N used to pan the camera a third of the way right and open a 21vw column
 * beside the text - a margin note the room read at 0.56em. Now the box grows
 * to the frame and the type grows to the room, sized by one rule from the
 * text alone: the largest size at which the longest line stands in 70% of
 * the frame and every line in its height, capped at three slide sizes. The
 * last http(s) address in the text gets a QR code above the words.
 *
 * Three things the spec holds, none of them a coordinate of the lecture:
 *
 *  - the geometry: the layer is the frame, a word is on the cap and centred,
 *    a block is smaller and stands as a left-aligned block whose centre is
 *    the frame's - the width rule is what makes both true;
 *  - the code: the modules the page drew for the address are the modules
 *    the same library draws for it in Node - the viewBox and the path, since
 *    the DOM re-serialises the rest. Decoding would be the stronger check,
 *    and BarcodeDetector is not in a Linux Chromium, so the spec trusts the
 *    encoder and verifies that the page fed it the right string with the
 *    right options;
 *  - the cockpit: the frame the layer fills there is the scaled stage, not
 *    the window - a layer fixed to the window would cover the notes.
 *
 * Every size is derived in the page from the same arithmetic the runtime
 * uses, so the peer that only receives keystrokes draws the same picture;
 * that is why nothing about this feature travels in the snapshot, and why
 * the spec reads the base size off the chunk rather than pinning a pixel.
 */
import qrcode from 'qrcode-generator';
import { openDeck } from './harness.mjs';

export const name = 'annotation · the note as the slide';
export const lecture = 'tutorial';

const CHUNK = 'chunks-columns';

// What the layer looks like right now, in page pixels. The base is the
// chunk's own type times the zoom, which is what the cap is written in.
const geometry = (page) => page.evaluate(() => {
  const el = document.querySelector('.chunk.annot-visible');
  if (!el) return null;
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const ta = el.querySelector('.annot-textarea');
  const qr = el.querySelector('.annot-qr');
  const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1;
  return {
    box: r(el.querySelector('.annot-box')),
    ta: r(ta),
    fs: parseFloat(getComputedStyle(ta).fontSize),
    base: parseFloat(getComputedStyle(el).fontSize) * zoom,
    align: getComputedStyle(ta).textAlign,
    qr: qr && getComputedStyle(qr).display !== 'none' ? r(qr) : null,
    // The DOM re-serialises what it was handed, so the comparison is on the
    // two attributes that carry the encoding, not on the markup.
    qrSvg: qr && qr.querySelector('svg') ? drawing(qr.querySelector('svg').getAttribute('viewBox'), qr.querySelector('path').getAttribute('d')) : '',
  };
  function drawing(viewBox, d) { return viewBox + ' ' + d; }
});

// The same two attributes out of the encoder's own SVG string in Node, with
// the byte function both sides of the build set: the library's default masks
// each code unit to a byte, and a path with a non-Latin-1 character then
// scans to a different string.
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
function drawn(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
  return svg.match(/viewBox="([^"]+)"/)[1] + ' ' + svg.match(/<path d="([^"]+)"/)[1];
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Select-all is the platform's chord: Control+A on macOS is a line-start
// motion in a textarea, and the next keystrokes then land in front of the
// old text rather than in place of it.
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

export async function run({ page, report, press, walkTo }) {
  const { ok } = report;
  const vp = page.viewportSize();

  ok(await walkTo(CHUNK), 'reached #' + CHUNK);
  await press('n', 400);
  await page.keyboard.type('Entropie');
  await page.waitForTimeout(400);

  const word = await geometry(page);
  ok(!!word, 'N opens the annotation on the active chunk');
  ok(near(word.box.x, 0, 1) && near(word.box.y, 0, 1)
    && near(word.box.w, vp.width, 1) && near(word.box.h, vp.height, 1),
    'the box is the frame', JSON.stringify(word.box));
  ok(near(word.fs, word.base * 3, 1),
    'a word stands at the cap, three slide sizes', word.fs + ' vs ' + word.base * 3);
  ok(near(word.ta.x + word.ta.w / 2, vp.width / 2, 3),
    'and is centred', String(word.ta.x + word.ta.w / 2));
  ok(near(word.ta.y + word.ta.h / 2, vp.height / 2, 3),
    'vertically too', String(word.ta.y + word.ta.h / 2));
  ok(word.qr === null, 'no address, no code');

  // A block: several lines, the longest sets the width, the block is centred
  // and its lines are left-aligned. The width rule is the whole test - a
  // centred block of left-aligned lines is what the block's width being its
  // longest line gives, with no line count to switch on.
  await page.keyboard.press(SELECT_ALL);
  await page.keyboard.type('Merke:\n  H(X) = -sum p(x) log p(x)\n  +--------+\n  | 3 bit  |\n  +--------+');
  await page.waitForTimeout(400);
  const block = await geometry(page);
  ok(block.fs < word.fs, 'a block is smaller than a word', block.fs + ' < ' + word.fs);
  ok(block.fs > block.base, 'and still larger than the slide type', block.fs + ' > ' + block.base);
  ok(block.align === 'left', 'its lines are left-aligned', block.align);
  ok(near(block.ta.x + block.ta.w / 2, vp.width / 2, 3),
    'and the block is centred', String(block.ta.x + block.ta.w / 2));
  ok(block.ta.w <= 0.7 * (vp.width - 2 * 0.14 * vp.width) + 1,
    'inside 70% of the frame', String(block.ta.w));

  // An address: the code appears above the words, sized between a fifth and
  // half of the frame, and it is the library's own drawing of that string.
  const url = 'https://www.uni-bamberg.de/psi/teaching/';
  await page.keyboard.type('\n' + url);
  await page.waitForTimeout(500);
  const withUrl = await geometry(page);
  ok(!!withUrl.qr, 'an address puts a code up');
  ok(withUrl.qr.y + withUrl.qr.h <= withUrl.ta.y, 'above the words', JSON.stringify([withUrl.qr, withUrl.ta]));
  ok(withUrl.qr.h >= 0.2 * (vp.height - 2 * 0.049 * vp.height) - 1
    && withUrl.qr.h <= 0.5 * (vp.height - 2 * 0.049 * vp.height) + 1,
    'between a fifth and half of the frame tall', String(withUrl.qr.h));
  ok(withUrl.fs < block.fs, 'the words gave up height to it', withUrl.fs + ' < ' + block.fs);
  ok(withUrl.qrSvg === drawn(url),
    'and it is the encoder\'s own drawing of that address, level M, quiet zone 4');

  // Two addresses: the last one wins, because the choice has to come from
  // the text - a cursor position travels to nobody.
  await page.keyboard.type('\nsee also https://doi.org/10.1145/3133956.3134027.');
  await page.waitForTimeout(500);
  const two = await geometry(page);
  ok(two.qrSvg === drawn('https://doi.org/10.1145/3133956.3134027'),
    'the last address in the text is the one encoded, trailing punctuation dropped');

  // A non-ASCII path is encoded as UTF-8, so the room scans the string on
  // the slide and not a Latin-1 mangling of it.
  const cyrillic = 'https://ru.wikipedia.org/wiki/Энтропия';
  await page.keyboard.type('\n' + cyrillic);
  await page.waitForTimeout(500);
  ok((await geometry(page)).qrSvg === drawn(cyrillic), 'a non-Latin-1 address is encoded as UTF-8');

  // An address the largest symbol cannot hold is no code, not an exception:
  // the keystroke still reaches the peer and the draft still reaches storage.
  // Set rather than typed: three thousand keystrokes are two minutes of
  // spec, and the input event is what the handler answers either way.
  await page.evaluate(() => {
    const ta = document.querySelector('.chunk.annot-visible .annot-textarea');
    ta.value += '\nhttps://example.org/?q=' + 'x'.repeat(3000);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const huge = await geometry(page);
  ok(huge && huge.qr === null && huge.qrSvg === '', 'an unencodable address draws no code');
  ok(await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('psi-slides:' + LECTURE_TITLE + ':annotations') || '{}')['chunks-columns'].length > 3000; }
    catch (e) { return false; }
  }), 'and the draft with it still reached localStorage');

  // Esc: back to the slide, and the note back to its margin. Nothing of the
  // layer's arithmetic may survive into the resting box.
  await press('Escape', 500);
  const rest = await page.evaluate(() => {
    const el = document.querySelector('.chunk.active');
    const box = el.querySelector('.annot-box');
    const b = box.getBoundingClientRect();
    return {
      visible: el.classList.contains('annot-visible'),
      w: b.width,
      qrShown: getComputedStyle(el.querySelector('.annot-qr')).display !== 'none',
      fsVar: box.style.getPropertyValue('--annot-fs'),
      text: el.querySelector('.annot-textarea').value,
    };
  });
  ok(!rest.visible, 'Esc gives the slide back');
  ok(rest.w < 0.3 * vp.width, 'the note is a margin note again', String(rest.w));
  ok(!rest.qrShown, 'without the code');
  ok(rest.fsVar === '', 'and without the layer\'s sizes');
  ok(rest.text.startsWith('Merke:'), 'the text is kept');

  // A chunk taller than the frame (auto-fit off, a long exercise): the layer
  // is still the frame, pinned to the slide-high band the camera centres,
  // not a box that runs off both edges of it. The tutorial has no such
  // chunk at this viewport, so the spec makes this one tall.
  await page.evaluate(() => { document.querySelector('.chunk.active').style.minHeight = '2000px'; });
  await press('n', 500);
  await page.keyboard.press(SELECT_ALL);
  await page.keyboard.type('Kurz');
  await page.waitForTimeout(400);
  const tall = await geometry(page);
  ok(!!tall && near(tall.box.y, 0, 1) && near(tall.box.h, vp.height, 1),
    'on a chunk taller than the frame the layer is still the frame', tall && JSON.stringify(tall.box));
  ok(!!tall && near(tall.ta.y + tall.ta.h / 2, vp.height / 2, 3),
    'and the word is centred in the frame, not in the chunk', tall && String(tall.ta.y + tall.ta.h / 2));
  await press('Escape', 400);
  await page.evaluate(() => { document.querySelector('.chunk.active').style.minHeight = ''; });

  // The cockpit: the same layer fills the scaled stage, never the window.
  const port = new URL(page.url()).port;
  const cockpit = await openDeck(port, 'speaker');
  try {
    ok(await cockpit.walkTo(CHUNK), 'cockpit reached #' + CHUNK);
    await cockpit.press('n', 400);
    await cockpit.page.keyboard.type('Entropie\n' + url);
    await cockpit.page.waitForTimeout(500);
    const c = await cockpit.page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
      return {
        box: r(document.querySelector('.chunk.annot-visible .annot-box')),
        stage: r(document.getElementById('stage-viewport')),
        qr: !!document.querySelector('.chunk.annot-visible .annot-qr svg'),
      };
    });
    ok(c.box.join() === c.stage.join(), 'in the cockpit the layer is the stage', JSON.stringify(c));
    ok(c.qr, 'and the code is drawn there too');
    ok(cockpit.errors.length === 0, 'no page errors in the cockpit', cockpit.errors.join(' | '));
  } finally {
    await cockpit.close();
  }
}
