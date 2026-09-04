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
import { fileURLToPath } from 'node:url';
import { parseLegacyDrawTail, formatDrawOpener } from '../tails.mjs';

// Three kinds of file the rewrite never touches, kept apart because the
// syntax gate needs two of them and not the third: *generated* files are
// rebuilt by the build, by refresh-figures.mjs or by build-site.js; *history*
// explains the old form on purpose and is inventoried, not rewritten; and the
// *self* group carries the old spelling as pattern text or as negative tests.
export const GENERATED_BASENAMES = new Set([
  'audience.html', 'speaker.html', 'print.html', 'print-notes.html', 'squint.txt',
]);
// The two spliced figure pages: their figure regions are generated, their
// prose shell is hand-written - so they are excluded from the rewrite and
// their prose is scanned separately (`proseOf`).
export const GENERATED_PROSE_PAGES = ['docs/artifact/figures-you-write.html', 'docs/site/figures.html'];
export const GENERATED_PREFIXES = [...GENERATED_PROSE_PAGES, '_site/', 'node_modules/'];
export const HISTORY_BASENAMES = new Set(['CHANGELOG.md', 'TODO-inconsistencies.md', 'revision-proposal.md']);
export const SELF_PREFIXES = [
  'test/gates/legacy-draw-syntax.mjs', 'test/gates/legacy-draw-syntax.txt',
  'tools/migrate-draw-opener.mjs',
  // Negative tests that refuse the old form keep it on purpose; the
  // legacy-draw-syntax allowlist is where they are reviewed.
  'test/settings.mjs', 'test/gates/tails.mjs',
];
export const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.html', '.yml', '.yaml', '.txt', '.json', '.css']);

const startsAny = (rel, list) => list.some(p => rel === p || rel.startsWith(p));
export const isGenerated = (rel) => GENERATED_BASENAMES.has(path.basename(rel)) || startsAny(rel, GENERATED_PREFIXES);
export const isHistory = (rel) => HISTORY_BASENAMES.has(path.basename(rel)) || /^todo-[^/]*\.md$/i.test(rel);
export const isSelf = (rel) => startsAny(rel, SELF_PREFIXES);

// What is left of a spliced page once its generated regions are blanked:
// the hand-written prose, which is an active surface like any other page.
export function proseOf(html) {
  return String(html)
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
}

// Every text file git knows or would not ignore under `root`, relative,
// sorted. `root` has to be a repository's top level, because every rule
// here is written against root-relative paths.
export function listFiles(root) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').filter(Boolean);
  const top = path.resolve(git('rev-parse', '--show-toplevel')[0]);
  if (top !== path.resolve(root)) {
    throw new Error(`${root} is not a repository root (that is ${top}); every exclusion here is root-relative`);
  }
  const files = new Set([...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')]);
  return [...files].filter(f => TEXT_EXT.has(path.extname(f))).sort();
}

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
  return isGenerated(rel) || isHistory(rel) || isSelf(rel);
}

// The old opener, wherever it sits in a line - mid-line too, because a
// template literal or a prose example carries it there. Never across a line:
// `\s*` used to, and a bare `::: draw` followed by a `{…}` line, or an
// opener missing its `}`, was matched over the line break and rewritten.
// `:::` then any blank run then `draw`, as the old build regex read it.
export const OPENER_RE = /:::[ \t]+draw[ \t]*\{([^}\n]*)\}/g;

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

function runRoot(root, { write, check }) {
  let files;
  try { files = listFiles(root); } catch (e) {
    console.log(`  ✗ ${root}: ${String(e.message).split('\n')[0]}`);
    return 1;
  }
  let changed = 0, problemCount = 0, stale = 0;
  const pending = [];
  const staleIn = (rel, text) => {
    for (const t of legacyTokens(text)) {
      stale++;
      console.log(`  ✗ ${rel}:${t.line}  old-form token "${t.match}" on an active authoring surface`);
    }
    for (const m of text.matchAll(OPENER_RE)) {
      stale++;
      console.log(`  ✗ ${rel}:${text.slice(0, m.index).split('\n').length}  old opener "${m[0]}" on an active authoring surface`);
    }
  };
  for (const rel of files) {
    const abs = path.join(root, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    // The spliced pages: the rewrite leaves them alone (refresh-figures.mjs
    // owns their figures), the check reads their prose.
    if (check && GENERATED_PROSE_PAGES.includes(rel)) { staleIn(rel, proseOf(src)); continue; }
    if (excluded(rel)) continue;
    if (check && isActiveSurface(rel)) staleIn(rel, src);
    if (!/:::[ \t]+draw/.test(src)) continue;
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
    console.log(`\n${problemCount} opener(s) this script cannot rewrite under ${root} - fix them by hand, then run again. Nothing written.`);
    return 1;
  }
  if (check) {
    console.log(changed || stale
      ? `\n${changed} file(s) still carry the old opener and ${stale} old-form token(s) sit on active surfaces under ${root}`
      : `clean: no old ::: draw opener, no old-form token on an active surface under ${root}`);
    return changed || stale ? 1 : 0;
  }
  if (write) {
    for (const { abs, text } of pending) fs.writeFileSync(abs, text);
    console.log(`\nrewrote ${changed} file(s) under ${root}`);
  } else {
    console.log(`\n${changed} file(s) would change under ${root}; run with --write to apply`);
  }
  return 0;
}

// Run as a script, not when imported by the gate. Compared as paths, not as
// a URL against a path: a checkout under a directory with a space in its
// name percent-encodes in the URL and the old comparison silently ran
// nothing and exited 0.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const check = args.includes('--check');
  const roots = args.filter(a => !a.startsWith('-'));
  if (!roots.length) roots.push('.');
  let exit = 0;
  for (const r of roots) {
    if (roots.length > 1) console.log(`── ${r}`);
    exit = Math.max(exit, runRoot(path.resolve(r), { write, check }));
  }
  process.exit(exit);
}
