/*
 * Prominence, measured where it actually happens: in the browser's computed
 * style.
 *
 * `.emph`, `.dim` and `.ghost` are one slot with one kind list, and two of the
 * three things that makes true are invisible to every other check in this
 * repository. `.dim` and `.ghost` resolve to a number the emitter writes as an
 * inline style, so a gate can read them out of the SVG. `.emph` on a free text
 * does not: its whole meaning is one stylesheet rule, `.psi-diagram .emph
 * text { fill: var(--emph) }`, and the compiler emits the same class either
 * way. Deleting that rule leaves all 389 fast gates green - measured, not
 * assumed - because a class landing on an element is exactly what those gates
 * check, and a class that paints nothing lands just as convincingly.
 *
 * That is the hole this spec exists for, and it is the same shape as the one
 * the language keeps closing in its own grammar: a word that resolves, emits
 * its CSS and moves nothing. `test/gates/semantics.mjs` holds the other half -
 * that the class reaches every member of a set the compiler itself mixed.
 *
 * `.tone-4` is here for the second half of the rule. It inverts its own label
 * so the words can be read on a solid fill, and that inversion has to keep
 * winning over emphasis ink, or an emphasised tone-4 element loses its label
 * to a colour chosen to sit on the page rather than on the fill. Source order
 * decided that until a `.tone-4.emph` selector was written for it.
 */
export const name = 'figure prominence';
export const lecture = 'diagrams';
export const view = 'audience';

export async function run({ page, report, walkTo }) {
  const { ok, note } = report;

  await walkTo('look');
  await page.waitForTimeout(600);

  const seen = await page.evaluate(() => {
    const svg = document.querySelector('#look svg.psi-diagram');
    if (!svg) return { missing: true };
    const fillOf = (id) => {
      const g = [...svg.querySelectorAll('g.dg-el')].find(x => (x.id || '').endsWith(id));
      const t = g && g.querySelector('text');
      return t ? getComputedStyle(t).fill : null;
    };
    const opacityOf = (id) => {
      const g = [...svg.querySelectorAll('g.dg-el')].find(x => (x.id || '').endsWith(id));
      return g ? Number(getComputedStyle(g).opacity) : null;
    };
    const root = getComputedStyle(document.documentElement);
    return {
      normal: fillOf('pr0'), emph: fillOf('pr1'), dim: fillOf('pr2'),
      dimOpacity: opacityOf('pr2'), ghostOpacity: opacityOf('pr3'),
      normalOpacity: opacityOf('pr0'),
      emphToken: root.getPropertyValue('--emph').trim(),
    };
  });

  ok(!seen.missing, 'the class-vocabulary figure is on the page',
    'no svg.psi-diagram inside #look');
  if (seen.missing) return;

  // The claim is a difference, not a hue: the page has seven themes and the
  // token moves with them. A test asserting a literal colour would pass in one
  // theme and be a lie in the other six.
  ok(seen.emph && seen.normal && seen.emph !== seen.normal,
    'emph paints a free text differently from an unemphasised one',
    `emph ${seen.emph} vs normal ${seen.normal}`);
  ok(seen.dim === seen.normal,
    'dim leaves the ink alone and works on opacity instead',
    `dim ${seen.dim} vs normal ${seen.normal}`);
  ok(seen.dimOpacity !== null && seen.dimOpacity < seen.normalOpacity,
    'dim is drawn fainter than normal',
    `dim ${seen.dimOpacity} vs normal ${seen.normalOpacity}`);
  ok(seen.ghostOpacity !== null && seen.ghostOpacity < seen.normalOpacity,
    'ghost is drawn fainter than normal',
    `ghost ${seen.ghostOpacity} vs normal ${seen.normalOpacity}`);

  // The inversion has to beat the emphasis ink. Compiled in the page rather
  // than taken from a lecture, so the pair can be drawn without a figure
  // having to carry a combination no real drawing wants.
  const tone4 = await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-4000px;top:0';
    document.body.appendChild(host);
    const c = window.PSI_DG.createDiagramCompiler({
      resolveImage: () => null, imageAspect: () => 1, warn: () => {},
      escapeHtml: (s) => String(s), assetMarkup: () => '',
    });
    host.innerHTML = c.renderDiagram(
      'box a "solid" at 0,0 {.tone-4}\nbox b "solid" right of a gap 0.5 {.tone-4 .emph}', '', {});
    const text = (n) => {
      const g = [...host.querySelectorAll('g.dg-el')].find(x => (x.id || '').endsWith(n));
      const t = g && g.querySelector('text');
      return t ? getComputedStyle(t).fill : null;
    };
    const out = { plain: text('a'), emphd: text('b') };
    host.remove();
    return out;
  });

  ok(tone4.plain && tone4.emphd && tone4.plain === tone4.emphd,
    'a .tone-4 label keeps its inverted colour when the element is emphasised',
    `plain ${tone4.plain} vs emphasised ${tone4.emphd}`);

  note('the one effect no gate can see: emph on a text is a stylesheet rule, and '
    + 'the class lands whether or not the rule exists');
}
