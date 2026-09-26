/*
 * The top-level frontmatter key set, held across two files.
 *
 * `lint.js` carries KNOWN_FRONTMATTER_KEYS, the closed list of keys some
 * renderer reads, and warns `unknown-frontmatter-key` on anything else. It
 * is a good check - `author:` sat in four lectures reading like metadata and
 * rendering nothing - but it is a hand-mirror of build.js, and until this
 * gate nothing held the two together.
 *
 * The direction that matters is one: a key build.js reads that lint.js does
 * not know is a FALSE WARNING ON A VALID DECK, and exit 2 under --strict.
 * That happened. Two keys added on a branch and the warning added on main
 * never touch as text, so git merged both cleanly and produced a linter that
 * warned about keys the build reads and validates in its own pre-flight. It
 * was found by building a deck, not by a test. The other direction - lint.js
 * knowing a key build.js has dropped - is milder (the warning fails to fire
 * on a key that really is a no-op) and is reported rather than asserted.
 *
 * Read as text, like the STYLE_SPEC check in tails.mjs: build.js cannot be
 * imported here, and lint.js calls main() at module scope.
 *
 * The scan has three sources, and it needs all three, because build.js reads
 * a key three structurally different ways:
 *
 *   frontmatter.cover              a literal property
 *   frontmatter['cover-image']     a literal string (a hyphen cannot be a
 *                                  property name, so this form is not
 *                                  optional and not redundant)
 *   frontmatter[fmKey]             a COMPUTED read, in viewDefaults()'s loop
 *                                  over VIEW_DEFAULT_SPEC - no grep at the
 *                                  read site can ever see those eleven names
 *
 * and a fourth path that is not a read at all: the cover passes the whole
 * block through a spread into a destructured parameter list, so `subtitle`
 * is named only in renderTitleBlock's signature. The cheap check lint.js's
 * own comment suggests - the first two forms - finds 23 keys and misses it,
 * which would report a perfectly correct build.js as carrying a dead key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'frontmatter: one key set, two files';

// Names handed to a spread callee at the call site rather than by the
// spread. They are arguments, not frontmatter keys, and counting them would
// demand lint.js know about `bodyHtml` - which is what this gate reported on
// its first run, because the call site writes that one in shorthand and an
// earlier version of this function only matched the `name: value` form.
// Both forms, therefore, and an identifier only: anything else in a piece
// means the split was wrong and the safe answer is to skip nothing.
function explicitArgs(callText) {
  const out = new Set();
  for (const piece of callText.split(',').slice(1)) {
    const m = piece.match(/^\s*([A-Za-z_$][\w$]*)\s*(:|$)/);
    if (m) out.add(m[1]);
  }
  return out;
}

export async function run({ report }) {
  const { ok } = report;
  const bsrc = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const lsrc = fs.readFileSync(path.join(ROOT, 'lint.js'), 'utf8');

  // ── what build.js reads ──────────────────────────────────────────
  const read = new Set();
  const source = new Map(); // key -> how it was found, for the failure message
  const add = (k, how) => { read.add(k); if (!source.has(k)) source.set(k, how); };

  for (const m of bsrc.matchAll(/\bfrontmatter\.([A-Za-z][\w-]*)/g)) add(m[1], 'frontmatter.x');
  for (const m of bsrc.matchAll(/\bfrontmatter\[\s*'([^']+)'\s*\]/g)) add(m[1], "frontmatter['x']");

  // The spread sites. Every callee of `f({ ...frontmatter, … })` receives
  // the whole block, so every name it destructures is a key it may read.
  const spreadCallees = new Set();
  for (const m of bsrc.matchAll(/(\w+)\(\{\s*\.\.\.frontmatter([^)]*)\)/g)) {
    spreadCallees.add(m[1]);
    const skip = explicitArgs(m[2]);
    const sig = bsrc.match(new RegExp(`function ${m[1]}\\(\\{([^)]*)\\}\\)`));
    if (!sig) { ok(false, `the signature of ${m[1]} is findable`); continue; }
    for (const p of sig[1].split(',')) {
      const nameOnly = p.split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nameOnly) && !skip.has(nameOnly)) add(nameOnly, `spread into ${m[1]}`);
    }
  }
  ok(spreadCallees.size >= 1, `a { ...frontmatter } spread is findable (${spreadCallees.size})`,
     [...spreadCallees].join(','));

  // The computed reads. viewDefaults() loops over VIEW_DEFAULT_SPEC, so the
  // eleven keys exist nowhere near a `frontmatter[`.
  const specBody = bsrc.slice(bsrc.indexOf('const VIEW_DEFAULT_SPEC = ['));
  const viewKeys = [...specBody.slice(0, specBody.indexOf('\n];'))
    .matchAll(/^\s{2}\[\s*'([a-z-]+)'/gm)].map(m => m[1]);
  ok(viewKeys.length === 11, `VIEW_DEFAULT_SPEC's keys are findable (${viewKeys.length})`, viewKeys.join(','));
  for (const k of viewKeys) add(k, 'VIEW_DEFAULT_SPEC');

  // A scan that silently finds nothing passes every comparison and guards
  // nothing, so the size is asserted before the comparison - and named, so a
  // change in the count is visible in a green run rather than only in a red one.
  ok(read.size >= 30, `build.js reads ${read.size} top-level frontmatter keys`, [...read].sort().join(' '));
  ok(read.has('subtitle'), 'including subtitle, which only the spread reaches');
  ok(read.has('print-slide-numbers'), 'and print-slide-numbers, which only the spec reaches');

  // ── what lint.js knows ───────────────────────────────────────────
  const knownBody = lsrc.slice(lsrc.indexOf('const KNOWN_FRONTMATTER_KEYS = new Set(['));
  const known = new Set([...knownBody.slice(0, knownBody.indexOf('\n]);'))
    .matchAll(/'([a-z-]+)'/g)].map(m => m[1]));
  ok(known.size >= 30, `lint.js knows ${known.size} of them`, [...known].sort().join(' '));

  // ── the assertion ────────────────────────────────────────────────
  const missing = [...read].filter(k => !known.has(k)).sort();
  ok(!missing.length,
     'every key build.js reads is one lint.js knows, or a valid deck earns a false warning',
     missing.map(k => `${k} (${source.get(k)})`).join(', '));

  // The milder direction, asserted rather than noted. A key lint.js knows
  // that build.js never reads only means the warning fails to fire on a
  // genuine no-op, so it is not the defect above - but it is the place the
  // list's own definition drifts. KNOWN_FRONTMATTER_KEYS says "every
  // top-level key some RENDERER reads"; a key read by a tool and no renderer
  // (the prompter's `duration:` was one, until the cockpit's clock read it
  // too) widens that to "anything build.js reads". Widening it is allowed and
  // may well be right - but as an entry here, with a reason, and with the
  // doc comment on the list changed in the same commit. An empty allowlist
  // is the honest state today.
  const TOOL_ONLY = new Set([]);
  const extra = [...known].filter(k => !read.has(k) && !TOOL_ONLY.has(k)).sort();
  ok(!extra.length,
     'and lint.js knows no key build.js never reads - or names it in TOOL_ONLY with a reason',
     extra.join(', '));
}
