/*
 * G: the slide number in the corner, typed back.
 *
 * Three things can only be decided in a built page, which is why this is a
 * spec and not a gate. The number the prompt accepts is the one the badge
 * paints, and the badge is written by the renderer while the prompt reads it
 * off the DOM - if either side ever stops counting the way the other does,
 * only a rendered deck can say so. The prompt is modal over the key map, and
 * "Space does not advance while the prompt is open" is a fact about one
 * keydown listener with several early returns in front of it. And Enter goes
 * through jumpTo, so what lands is the whole ordinary landing - the active
 * chunk, the camera, the stored position - not an assignment to activeIdx.
 *
 * The lecture is `diagrams`, and slide 13 there is #look. Its number is its
 * position in the deck, so a chunk inserted before it moves this spec; that
 * is the same contract every other spec that names a chunk here already has.
 */
export const name = 'navigation · go to a number';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, at, press, restart }) {
  const { ok, note } = report;

  // What the prompt is showing, read through its own root the way the
  // runtime does - never getElementById on anything inside it.
  const prompt = () => page.evaluate(() => {
    const r = document.getElementById('goto-prompt');
    return {
      open: !!r && !r.classList.contains('hidden'),
      digits: r ? r.querySelector('.goto-digits').textContent : '',
      of: r ? r.querySelector('.goto-of').textContent : '',
      refused: !!r && r.classList.contains('goto-refused'),
    };
  });
  // The number the corner badge paints for a chunk, which is the number a
  // lecturer reads and therefore the number they will type.
  const numOf = (id) => page.evaluate((c) => {
    const el = document.querySelector('[data-chunk-id="' + c + '"]');
    return el ? Number(el.dataset.chunkNum) : -1;
  }, id);

  await restart();
  const start = await at();
  ok((await prompt()).open === false, 'the prompt is closed until it is asked for');

  ok(await numOf('look') === 13, 'slide 13 of this deck is #look', String(await numOf('look')));

  // ── typing a number ──
  await press('g', 350);
  let p = await prompt();
  ok(p.open, 'G opens the prompt');
  ok(/of \d+/.test(p.of), 'and it says how many slides there are', p.of);
  note('the prompt reads: ' + p.digits + ' ' + p.of);

  await press('1', 150);
  await press('2', 150);
  ok((await prompt()).digits === '12', 'two digits type into it', (await prompt()).digits);

  // Backspace is the key that would otherwise step the deck backwards, so
  // it is the one worth asserting twice: it edits here and moves nothing.
  await press('Backspace', 150);
  ok((await prompt()).digits === '1', 'Backspace takes the last digit off', (await prompt()).digits);
  ok((await at()).id === start.id, 'and did not step the deck back', (await at()).id);

  // Space would advance and N would open an annotation. Neither reaches the
  // key map while the prompt has the keyboard.
  await press(' ', 200);
  ok((await at()).id === start.id, 'Space does not advance while the prompt is open', (await at()).id);
  ok((await prompt()).open, 'and the prompt is still standing');

  await press('3', 150);
  ok((await prompt()).digits === '13', 'typing continues after it', (await prompt()).digits);

  await press('Enter', 700);
  ok((await prompt()).open === false, 'Enter closes the prompt');
  ok((await at()).id === 'look', 'and lands on slide 13', JSON.stringify(await at()));

  // ── Escape leaves the slide alone ──
  const here = await at();
  await press('g', 350);
  await press('4', 150);
  ok((await prompt()).digits === '4', 'the prompt opens empty the second time', (await prompt()).digits);
  await press('Escape', 400);
  ok((await prompt()).open === false, 'Escape closes it');
  ok((await at()).id === here.id, 'and the slide is the one it was opened on', (await at()).id);

  // ── a number past the end stays put ──
  await press('g', 350);
  await press('9', 120);
  await press('9', 120);
  await press('9', 120);
  await press('Enter', 500);
  p = await prompt();
  ok(p.open, 'a number the deck does not have leaves the prompt open');
  ok(p.digits === '999', 'with the digits still in it, so a Backspace is the fix', p.digits);
  ok((await at()).id === here.id, 'and moves nothing', (await at()).id);
  await press('Escape', 350);

  // ── the number is the one on the badge, not the index in flatChunks ──
  // The two differ by every section divider in front of the slide, and the
  // dividers are inserted by the build rather than written by the author.
  const n = await numOf('justify');
  await press('g', 350);
  for (const d of String(n)) await press(d, 120);
  await press('Enter', 700);
  ok((await at()).id === 'justify',
    'a number from further down the deck lands on the chunk wearing it',
    JSON.stringify(await at()));
}
