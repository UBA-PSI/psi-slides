/*
 * Every way a source.md names a picture, held against the two readers that
 * have to see all of them.
 *
 * The build inlines an image referenced five ways: `![](path)`, `![](fig-id)`,
 * a ::: draw `image` statement, a `::: backdrop`, and the `cover-image:` /
 * `closing-image:` frontmatter keys. Two pieces of build.js read that set for
 * different purposes - `scanReferencedImages`, which weighs it against the
 * per-image inline cap and refuses the build, and `collectImageRefs`, which is
 * what `--optimize-images` works from - and until this gate they were two
 * regex sets in one file. Only one of them had the last three forms. So a real
 * keynote whose only oversized assets were a backdrop and a cover-image was
 * refused by `assertInlinable`, with a message recommending
 * `--optimize-images`, and that verb answered "Nothing to do: no referenced
 * PNG/JPEG asset is 512 KB or larger" about the very files the build had just
 * refused. A dead end the author cannot get out of by reading either message.
 *
 * Three things are asserted, and the first is the one that drifts:
 *
 *   1. both readers go through `collectDecorationImageRefs` - a text check,
 *      because a second regex set added beside one of them is exactly how this
 *      happened the first time;
 *   2. that collector finds all three forms, skips a fenced example (it feeds
 *      a verb that DELETES the original after converting it, and the rewrite
 *      below skips fences, so a collector that did not would delete a file and
 *      leave the only line naming it unedited), and skips nothing else;
 *   3. `rewriteAssetRef` rewrites all four spellings of a converted path,
 *      quoted or not, and leaves a fenced one alone.
 *
 * build.js cannot be imported - it calls `main()` at module scope - so the
 * three functions are lifted out of it as text and evaluated, the way
 * `test/settings.mjs` lifts the collapse helpers out of a built page. All
 * three are pure string work over one argument, which is what makes that
 * honest here: nothing is stubbed, the gate runs the shipped code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import { parseDrawOpener } from '../../tails.mjs';

export const name = 'image-refs: every way a source names a picture, one collector';

// Lift a top-level function out of build.js by name. They are written at
// column zero, so the closing `}` at column zero ends the body - the same
// assumption `grep -n '^function'` makes, and it fails loudly (no match)
// rather than quietly.
function lift(src, fnName) {
  const start = src.indexOf(`\nfunction ${fnName}(`);
  if (start < 0) throw new Error(`build.js has no top-level function ${fnName}`);
  const end = src.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`could not find the end of ${fnName} in build.js`);
  return src.slice(start + 1, end + 3);
}

const FIXTURE = `---
title: Fixture
cover: hero
cover-image: assets/cover-photo.jpg
closing-image: "assets/last-slide.png"
---

# A part with a divider backdrop

::: backdrop assets/divider.jpg {.blur}

## figure: A chunk backdrop {#bd}

::: backdrop assets/room.jpg {.cover .invert} reveal left 45%

![a chart](assets/chart.png)

![](shorthand-id)

![remote](https://example.com/not-ours.png)

::: draw 12x6
image photo assets/wall.jpg at 6,3 w 6
grid tiles image assets/tile.png 2x2 at 3,3
:::

Documented examples, and not one of them is a reference:

\`\`\`
::: backdrop assets/never.jpg
cover-image: assets/never2.jpg
image photo assets/never3.jpg at 1,1
\`\`\`
`;

export async function run({ report }) {
  const { ok } = report;
  // The harness has ok() only; this is the two-string form of it, so a
  // failure prints what it got rather than just which line disagreed.
  const eq = (got, want, what) => ok(got === want, what, got === want ? undefined : JSON.stringify(got));
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

  const mod = new Function('parseDrawOpener',
    lift(src, 'collectDiagramImageRefs')
    + lift(src, 'collectDecorationImageRefs')
    + lift(src, 'rewriteAssetRef')
    + 'return { collectDiagramImageRefs, collectDecorationImageRefs, rewriteAssetRef };',
  )(parseDrawOpener);

  // ── 1. one collector, both readers ────────────────────────────────
  // The failure this gate was written for is not a wrong regex, it is a
  // second regex set added beside one of the two readers.
  for (const reader of ['scanReferencedImages', 'collectImageRefs']) {
    const body = lift(src, reader);
    // Comments off first: both readers name the three forms in prose, and it
    // is a regex of their own that would be the defect.
    const code = body.replace(/\/\/[^\n]*/g, '');
    ok(body.includes('collectDecorationImageRefs(src)'),
       `${reader} collects the backdrop and frontmatter refs through collectDecorationImageRefs`);
    ok(!/backdrop|cover-image|closing-image/.test(code),
       `${reader} matches none of the three forms with a regex of its own`);
  }

  // ── 2. the collector itself ───────────────────────────────────────
  const deco = mod.collectDecorationImageRefs(FIXTURE);
  eq(deco.join(' | '),
     ['assets/cover-photo.jpg', 'assets/last-slide.png', 'assets/divider.jpg', 'assets/room.jpg'].join(' | '),
     'the backdrop of a divider and of a chunk, and both frontmatter keys, in source order');
  ok(!deco.some(r => /never/.test(r)),
     'and nothing from inside a code fence, which is documentation, not a reference');

  // `closing-image: cover` names no file of its own - it is the cover-image
  // line again - and the token resolves to nothing in both readers. It is
  // collected all the same, because the alternative is a word in this file
  // that means "not a path" and has to be kept in step with the renderer.
  eq(mod.collectDecorationImageRefs('closing-image: cover\n').join(),
     'cover', 'closing-image: cover collects its token and resolves to nothing downstream');

  const dg = mod.collectDiagramImageRefs(FIXTURE);
  eq(dg.join(' | '), 'assets/wall.jpg | assets/tile.png',
     'an image statement and a grid of images, and nothing from the fence');

  // ── 3. the rewrite, in all four spellings ─────────────────────────
  const rewritten = mod.rewriteAssetRef(FIXTURE, 'assets/room.jpg', 'assets/room.webp');
  ok(rewritten.includes('::: backdrop assets/room.webp {.cover .invert} reveal left 45%'),
     'a backdrop token is rewritten, and its tail and reveal survive');

  const cover = mod.rewriteAssetRef(FIXTURE, 'assets/cover-photo.jpg', 'assets/cover-photo.webp');
  ok(cover.includes('cover-image: assets/cover-photo.webp'),
     'a frontmatter value is rewritten');

  const quoted = mod.rewriteAssetRef(FIXTURE, 'assets/last-slide.png', 'assets/last-slide.webp');
  ok(quoted.includes('closing-image: "assets/last-slide.webp"'),
     'and so is a quoted one, quotes and all');

  const md = mod.rewriteAssetRef(FIXTURE, 'assets/chart.png', 'assets/chart.webp');
  ok(md.includes('![a chart](assets/chart.webp)'), 'the markdown form is rewritten');

  const draw = mod.rewriteAssetRef(FIXTURE, 'assets/wall.jpg', 'assets/wall.webp');
  ok(draw.includes('image photo assets/wall.webp at 6,3 w 6'),
     'and the bare token a ::: draw image statement carries');

  const fenced = mod.rewriteAssetRef(FIXTURE, 'assets/never.jpg', 'assets/never.webp');
  eq(fenced, FIXTURE, 'a path inside a code fence is left exactly as it is');

  // The one that has to hold whatever the paths look like: a rewrite is a
  // whole-token match, so a shorter path is not rewritten inside a longer one.
  const near = 'cover-image: assets/room-wide.jpg\n::: backdrop assets/room.jpg\n';
  eq(mod.rewriteAssetRef(near, 'assets/room.jpg', 'assets/room.webp'),
     'cover-image: assets/room-wide.jpg\n::: backdrop assets/room.webp\n',
     'and a path that is the prefix of another is not rewritten inside it');
}
