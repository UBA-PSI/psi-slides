/*
 * The old `::: draw {unit=WxH autoplay=N cycle}` spelling stays out of every
 * authored source, and every other place it survives is on a reviewed list.
 *
 * Two layers, because "the repository contains none of the old form" cannot
 * be true - this gate's own patterns, the migration script that recognises
 * the form, the negative tests that refuse it and the history that explains
 * it all carry it on purpose:
 *
 *   1. Any old opener on an *active authoring surface* - a `source.md`, a
 *      skill, a root document, a site page, and the hand-written prose of the
 *      two spliced figure pages - is a hard failure. The tool's
 *      `isActiveSurface` says which files those are, and the same function
 *      is what the cross-repository `--check` uses, so the two cannot drift.
 *   2. Everywhere else the old tokens are *inventoried* - `unit=WxH`, `unit=` with
 *      digits, `autoplay=N`, `autoplay=` with digits, and a brace tail carrying a
 *      bare `cycle` - and the inventory has to equal the checked-in allowlist,
 *      `legacy-draw-syntax.txt`, one `path<TAB>match<TAB>count` row per
 *      intentional survivor. A new match fails; a match that went away fails
 *      too, so the list cannot rot.
 *
 * The allowlist may hold negative tests, the migration script's recognition,
 * CHANGELOG history and planning documents. It may not hold a lecture
 * source, current authoring documentation or an executable template - that
 * is asserted here, not left to the reviewer.
 *
 * Single checkout only: a gate has to work from a bare clone, so the sibling
 * content repository is not this gate's business. That check is
 * `node tools/migrate-draw-opener.mjs <root> --check`, run by hand per repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import {
  LEGACY_TOKENS, OPENER_RE, isActiveSurface, isGenerated, listFiles, proseOf, GENERATED_PROSE_PAGES,
} from '../../tools/migrate-draw-opener.mjs';

export const name = 'legacy draw syntax stays out of authored sources';

const SELF = ['test/gates/legacy-draw-syntax.mjs', 'test/gates/legacy-draw-syntax.txt'];

// The old tokens, the old opener, the file list and the notion of an active
// surface are all the migration tool's, imported: the cross-repository
// `--check` and this gate must agree on what "stale" means or one of them
// lies. Tracked files plus untracked ones git would not ignore, so a new
// file carrying the old form fails the gate before it is committed.
const TOKENS = LEGACY_TOKENS;
const OLD_OPENER = new RegExp(OPENER_RE.source);
function tracked() {
  return listFiles(ROOT).filter(f => !isGenerated(f) && !SELF.includes(f));
}

// A path the allowlist may never name: an active authoring surface.
export const unallowlistable = isActiveSurface;

// The scan. `openers` are hard failures, `rows` the inventory in allowlist form.
export function inventory() {
  const openers = [];
  const counts = new Map();   // "path\tmatch" -> count
  let files = 0;
  for (const rel of tracked()) {
    let src;
    try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    files++;
    if (isActiveSurface(rel)) {
      src.split('\n').forEach((line, i) => { if (OLD_OPENER.test(line)) openers.push(`${rel}:${i + 1}  ${line.trim()}`); });
    }
    for (const re of TOKENS) {
      for (const m of src.matchAll(re)) {
        const key = `${rel}\t${m[0]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  // The spliced pages are generated as a whole and hand-written in their
  // prose: that prose is an active surface, checked for openers and tokens
  // alike, with the figure regions blanked first.
  for (const rel of GENERATED_PROSE_PAGES) {
    let html;
    try { html = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    const prose = proseOf(html);
    prose.split('\n').forEach((line, i) => {
      if (OLD_OPENER.test(line)) openers.push(`${rel}:${i + 1} (prose)  ${line.trim().slice(0, 120)}`);
      for (const re of TOKENS) for (const m of line.matchAll(re)) openers.push(`${rel}:${i + 1} (prose)  ${m[0]}`);
    });
  }
  return { files, openers, rows: [...counts].map(([k, n]) => `${k}\t${n}`).sort() };
}

const HEADER = `# Reviewed survivors of the old \`::: draw {unit=WxH autoplay=N cycle}\` spelling.
# One row per intentional match: path<TAB>matched text<TAB>count. Regenerate with
#   node test/gates/legacy-draw-syntax.mjs --write
# and review the diff: a new row is a claim that this file may keep the old form.
`;

export async function run({ report }) {
  const { ok, note } = report;
  const { files, openers, rows: found } = inventory();
  note(`${files} tracked text file(s) scanned`);
  ok(openers.length === 0, 'no active authoring surface carries the old ::: draw opener (nor the spliced pages\' prose an old token)', openers.join('\n      '));

  const listed = fs.readFileSync(path.join(ROOT, SELF[1]), 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#')).sort();
  const extra = found.filter(r => !listed.includes(r));
  const gone = listed.filter(r => !found.includes(r));
  ok(extra.length === 0, 'every surviving old token is on the reviewed allowlist',
     'new:\n      ' + extra.join('\n      '));
  ok(gone.length === 0, 'and every allowlisted token still exists (the list does not rot)',
     'stale:\n      ' + gone.join('\n      '));
  const forbidden = listed.filter(r => unallowlistable(r.split('\t')[0]));
  ok(forbidden.length === 0, 'the allowlist names no lecture source, authoring doc or executable template',
     forbidden.join('\n      '));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--write')) {
  const { openers, rows } = inventory();
  const forbidden = rows.filter(r => unallowlistable(r.split('\t')[0]));
  if (openers.length || forbidden.length) {
    console.error('refusing to write: ' + [...openers, ...forbidden].join('\n  '));
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, SELF[1]), HEADER + rows.join('\n') + '\n');
  console.log(`wrote ${rows.length} row(s) to ${SELF[1]}`);
}
