#!/usr/bin/env node
/*
 * Rewrite the old `::: draw {unit=WxH autoplay=N cycle}` opener to the
 * braceless form `::: draw WxH autoplay N cycle`, everywhere in a repository
 * that is neither generated nor history.
 *
 *   node tools/migrate-draw-opener.mjs <repo-root>            dry run: list what would change
 *   node tools/migrate-draw-opener.mjs <repo-root> --write    rewrite in place
 *   node tools/migrate-draw-opener.mjs <repo-root> --check    exit 1 if anything would change
 *
 * The transform replaces the whole matched opener rather than substituting
 * tokens in place: the old tail is parsed into its fields (`parseLegacyDrawTail`)
 * and the new line is produced by the one formatter build.js also uses
 * (`formatDrawOpener`), so the migration and the build cannot disagree about
 * the canonical spelling. A tail the parser does not fully understand - an
 * unknown token, a `#id` (draw ids were diagnostic only and are no longer
 * supported), a `cycle` with no autoplay, a delay out of range - stops the
 * run before anything is written, and names every such line.
 *
 * The match is anywhere in a file, not only at a line start: that is what
 * catches the executable template in docs/site/shoot-gallery.mjs, the sources
 * built inside tests, and prose in the skills. Which is also why the
 * exclusions matter - the built views and the two spliced figure pages are
 * rebuilt by the build and by refresh-figures.mjs, and the history files
 * explain the old form on purpose. Write and check share one exclusion set.
 *
 * `--check` is the cross-repository acceptance check, run once per
 * repository by hand. It reports every file the write mode would change, and
 * every old-form token (`LEGACY_TOKENS`) left on an *active authoring
 * surface* (`isActiveSurface`) - a lecture source, a skill, a site page, the
 * root documents an author reads - where a symbolic `unit=WxH` in prose is
 * as stale as a real opener. The committed gate
 * (test/gates/legacy-draw-syntax.mjs) imports both definitions and covers
 * this checkout alone, because a gate has to work from a bare clone; this
 * mode is what covers the sibling content repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseLegacyDrawTail, formatDrawOpener } from '../tails.mjs';

const args = process.argv.slice(2);
const root = path.resolve(args.find(a => !a.startsWith('-')) || '.');
const write = args.includes('--write');
const check = args.includes('--check');

// Basenames excluded at any depth, and path prefixes excluded from the root.
export const EXCLUDED_BASENAMES = new Set([
  'audience.html', 'speaker.html', 'print.html', 'print-notes.html', 'squint.txt',
  'CHANGELOG.md', 'TODO-inconsistencies.md', 'revision-proposal.md',
]);
export const EXCLUDED_PREFIXES = [
  'docs/artifact/figures-you-write.html', 'docs/site/figures.html', 'docs/site/example/',
  '_site/', 'node_modules/',
  // The gate that inventories the old form, its allowlist, and this script:
  // all three carry the old spelling as pattern text.
  'test/gates/legacy-draw-syntax.mjs', 'test/gates/legacy-draw-syntax.txt',
  'tools/migrate-draw-opener.mjs',
  // Negative tests that refuse the old form keep it on purpose; the
  // legacy-draw-syntax allowlist is where they are reviewed.
  'test/settings.mjs', 'test/gates/tails.mjs',
];
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.html', '.yml', '.yaml', '.txt', '.json', '.css']);

// The old-form tokens, as the syntax gate inventories them. `cycle` only
// inside a one-line brace tail holding no `:`, `,` or `$` - a JS object
// literal or a template placeholder has one, a draw tail never did.
export const LEGACY_TOKENS = [
  /unit=\d+x\d+/g, /unit=WxH/g, /autoplay=\d+/g, /autoplay=N/g,
  /(?<!\$)\{[^}\n:,$]*\bcycle\b[^}\n:,$]*\}/g,
];

// An active authoring surface: where a reader learns the current syntax, so
// no old-form token may survive there, not even in prose. Lecture sources,
// anything under .claude/ (the skills), the site's hand-written pages, and
// the root documents an author opens. Not: history (excluded above), specs
// and build logs (editor.md, HANDOFF.md), the contributor guide, code and
// tests - those go on the gate's reviewed allowlist instead.
export function isActiveSurface(rel) {
  if (excluded(rel)) return false;
  const base = path.basename(rel);
  if (base === 'source.md') return true;
  if (rel.startsWith('.claude/') || rel.startsWith('docs/site/')) return true;
  if (!rel.includes('/') && base.endsWith('.md')) {
    return !['editor.md', 'HANDOFF.md', 'CONTRIBUTING.md', 'revision-implementation.md'].includes(base);
  }
  return false;
}

export function excluded(rel) {
  if (EXCLUDED_BASENAMES.has(path.basename(rel))) return true;
  if (/^todo-[^/]*\.md$/i.test(rel)) return true;   // root planning notes
  return EXCLUDED_PREFIXES.some(p => rel === p || rel.startsWith(p));
}

function listFiles() {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const files = new Set([...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')]);
  return [...files].filter(f => TEXT_EXT.has(path.extname(f)) && !excluded(f)).sort();
}

const OPENER_RE = /::: draw\s*\{([^}]*)\}/g;

// Old-form tokens in a text, as `{ line, match }` rows.
export function legacyTokens(src) {
  const out = [];
  for (const re of LEGACY_TOKENS) {
    for (const m of src.matchAll(re)) out.push({ line: src.slice(0, m.index).split('\n').length, match: m[0] });
  }
  return out.sort((a, b) => a.line - b.line);
}

// Returns { text, changes: [{line, from, to}], problems: [{line, from, why}] }.
export function migrateText(src) {
  const changes = [], problems = [];
  const text = src.replace(OPENER_RE, (whole, tail, at) => {
    const line = src.slice(0, at).split('\n').length;
    const old = parseLegacyDrawTail(tail);
    if (old.why) { problems.push({ line, from: whole, why: old.why }); return whole; }
    const to = formatDrawOpener({ unit: old.unit, autoplay: old.autoplay, cycle: old.cycle });
    changes.push({ line, from: whole, to });
    return to;
  });
  return { text, changes, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = listFiles();
  let changed = 0, problemCount = 0, stale = 0;
  const pending = [];
  for (const rel of files) {
    const abs = path.join(root, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (check && isActiveSurface(rel)) {
      for (const t of legacyTokens(src)) {
        stale++;
        console.log(`  ✗ ${rel}:${t.line}  old-form token "${t.match}" on an active authoring surface`);
      }
    }
    if (!src.includes('::: draw')) continue;
    const { text, changes, problems } = migrateText(src);
    for (const p of problems) {
      problemCount++;
      console.log(`  ✗ ${rel}:${p.line}  ${p.from}  - ${p.why}`);
    }
    if (!changes.length) continue;
    changed++;
    console.log(`${check ? '  ✗ would change ' : ''}${rel}  (${changes.length} opener${changes.length === 1 ? '' : 's'})`);
    if (!check) for (const c of changes) console.log(`    ${c.line}: ${c.from}  →  ${c.to}`);
    pending.push({ abs, text });
  }
  if (problemCount) {
    console.log(`\n${problemCount} opener(s) this script cannot rewrite - fix them by hand, then run again. Nothing written.`);
    process.exit(1);
  }
  if (check) {
    console.log(changed || stale
      ? `\n${changed} file(s) still carry the old opener and ${stale} old-form token(s) sit on active surfaces under ${root}`
      : `clean: no old ::: draw opener, no old-form token on an active surface under ${root}`);
    process.exit(changed || stale ? 1 : 0);
  }
  if (write) {
    for (const { abs, text } of pending) fs.writeFileSync(abs, text);
    console.log(`\nrewrote ${changed} file(s)`);
  } else {
    console.log(`\n${changed} file(s) would change; run with --write to apply`);
  }
}
