#!/usr/bin/env node
/**
 * Phase-1 build script – minimal viable print renderer.
 *
 * Input:  a Markdown source file (see PRD.md §3).
 * Output: <input-dir>/print.html (or path passed as 2nd arg).
 *
 * Scope: frontmatter + columns + chunks + attribute tails + reveal-
 * separator stripping + marked body rendering + single-file print
 * HTML with a flat column-level TOC.
 *
 * Deferred (later Phase 1 milestones): audience view, speaker view,
 * ::: directives (margin/expand/sketch), image resolution,
 * geometry pass, linter, --watch, --assign-ids, --new.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { marked } from 'marked';
import { createHighlighter } from 'shiki';
import katex from 'katex';
// The diagram compiler. The one part of the rendering stack that is not in
// this file, because it is the one part that has to run in two places: here,
// and in the browser when the editor re-lays-out a figure after a drag.
// Imported for the build; its *text* is also read and inlined into the live
// views, the same way bundledFaces() reads woff2 out of node_modules.
import { createDiagramCompiler, parseDiagramDefaults } from './diagram-core.mjs';

// KaTeX ships its stylesheet and fonts as plain files next to the module.
// They are not importable as ESM, so resolve them the CommonJS way.
const nodeRequire = createRequire(import.meta.url);

const VALID_TAGS = new Set([
  'title', 'principle', 'definition', 'example',
  'question', 'figure', 'exercise', 'free',
]);

const VALID_WIDTHS = new Set(['narrow', 'standard', 'wide', 'full']);

// ── syntax highlighting ──────────────────────────────────────────────
// Shiki is loaded once per process and reused across rebuilds. Output
// is static HTML with inline styles – no runtime theme CSS needed.

const SHIKI_LANGS = [
  'python', 'bash', 'shell', 'javascript', 'typescript',
  'html', 'css', 'c', 'json', 'yaml', 'markdown', 'sql', 'toml', 'diff', 'text',
];
const SHIKI_THEME = 'github-light';
const LANG_ALIAS = {
  py: 'python', sh: 'bash', zsh: 'bash',
  js: 'javascript', ts: 'typescript', md: 'markdown', cc: 'c', h: 'c',
  plaintext: 'text', '': 'text',
};
let highlighter = null;
let loadedLangs = null; // Set of languages Shiki has tokenizers for
// Keyed on `${useLang}::${code}`; Shiki output is deterministic per input,
// so the same code block rendered into print/audience/speaker pays the
// tokenization cost once per build (and once per --watch rebuild).
const highlightCache = new Map();
async function initHighlighter() {
  if (highlighter) return;
  highlighter = await createHighlighter({ themes: [SHIKI_THEME], langs: SHIKI_LANGS });
  loadedLangs = new Set(highlighter.getLoadedLanguages());
}
function highlightCode(code, lang) {
  if (!highlighter) return null;
  const alias = LANG_ALIAS[lang] ?? lang;
  const useLang = loadedLangs.has(alias) ? alias : 'text';
  const key = useLang + '::' + code;
  if (highlightCache.has(key)) return highlightCache.get(key);
  let html;
  try { html = highlighter.codeToHtml(code, { lang: useLang, theme: SHIKI_THEME }); }
  catch (e) { html = null; }
  highlightCache.set(key, html);
  return html;
}

// ── image shorthand resolution ───────────────────────────────────────
// ![](fig-id) with no extension and no slash resolves to assets/<fig-id>.<ext>
// where <ext> is the first found among svg, png, jpg, jpeg, gif, webp.
// Set once per build from buildOnce so the marked renderer can close over it.

const IMG_EXTS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
// Video shares the `![](clip-id)` shorthand: a clip is a figure that moves,
// and giving it its own directive would have bought new grammar for nothing.
// Searched after the image extensions, so an id with both a poster and a
// clip still resolves to the still.
const VIDEO_EXTS = ['mp4', 'webm', 'm4v', 'mov'];
const VIDEO_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
const isVideoExt = (p) => VIDEO_EXTS.includes(path.extname(p).slice(1).toLowerCase());
const MIME_BY_EXT = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
// Video gets its own, larger cap. A clip is inherently an order of magnitude
// heavier than a diagram, and holding it to the image cap would reject every
// real one. It is still a cap: base64 adds a third again, and the bytes land
// in all four outputs, so 12 MB of source is already ~64 MB written to disk.
const MAX_INLINE_VIDEO_BYTES = 12 * 1024 * 1024;
const inlineCapFor = (p) => (isVideoExt(p) ? MAX_INLINE_VIDEO_BYTES : MAX_INLINE_BYTES);
const AUTO_INLINE_BUDGET = 10 * 1024 * 1024;
let currentSourceDir = null;
let inlineAssetsEnabled = false;
const imgResolveCache = new Map();
const dataUriCache = new Map();
// Per-build counter for unique SVG ID prefixes. Reset in buildOnce so the
// first inlined SVG of a build is always psi-fig-1-.
let inlineSvgCounter = 0;
function resolveFigId(figId) {
  if (!currentSourceDir) return null;
  const cacheKey = currentSourceDir + '::' + figId;
  if (imgResolveCache.has(cacheKey)) return imgResolveCache.get(cacheKey);
  for (const ext of [...IMG_EXTS, ...VIDEO_EXTS]) {
    const rel = path.join('assets', `${figId}.${ext}`);
    if (fs.existsSync(path.join(currentSourceDir, rel))) {
      imgResolveCache.set(cacheKey, rel);
      return rel;
    }
  }
  imgResolveCache.set(cacheKey, null);
  return null;
}

// Inline an asset as a data: URI for --inline-images builds. SVG goes
// through encodeURIComponent (smaller than base64 and human-readable in
// view-source); raster formats use base64. Files over MAX_INLINE_BYTES
// are skipped with a warning so authors notice when a deck is too heavy
// for the single-file shape, and the renderer falls back to the path.
//
// The old wording ("skipping X (3.03 MB > 2 MB limit)") stated the fact and
// left the consequence implicit, so it scrolled past unnoticed and a deck
// shipped with a broken figure whenever the HTML travelled without its
// assets folder. Say what it costs and how to fix it, once per file per
// build. Collected so the summary can repeat it after the Wrote… line,
// where a single warning is less likely to be missed.
const oversizedWarned = new Set();
function warnOversizedAsset(absPath, size) {
  const rel = path.relative(process.cwd(), absPath);
  if (oversizedWarned.has(rel)) return;
  oversizedWarned.add(rel);
  const mb = (size / 1024 / 1024).toFixed(2);
  console.warn(
    `[inline-images] NOT inlined: ${rel} (${mb} MB > ${inlineCapFor(absPath) / 1024 / 1024} MB cap).\n` +
    `                This output is no longer self-contained – the asset breaks if the\n` +
    `                HTML is moved without its folder. Fix with:\n` +
    (isVideoExt(absPath)
      // --optimize-images only handles PNG and JPEG; telling a video author
      // to run it is advice that cannot work.
      ? `                  ffmpeg -i ${rel} -vf scale=1280:-2 -c:v libx264 -crf 28 out.mp4`
      : `                  node build.js <source.md> --optimize-images`)
  );
}

function toDataUri(absPath) {
  if (!absPath) return null;
  if (dataUriCache.has(absPath)) return dataUriCache.get(absPath);
  let stat;
  try { stat = fs.statSync(absPath); }
  catch { dataUriCache.set(absPath, null); return null; }
  if (stat.size > inlineCapFor(absPath)) {
    warnOversizedAsset(absPath, stat.size);
    dataUriCache.set(absPath, null);
    return null;
  }
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) { dataUriCache.set(absPath, null); return null; }
  let uri;
  if (ext === 'svg') {
    const text = fs.readFileSync(absPath, 'utf8');
    uri = `data:${mime};utf8,${encodeURIComponent(text)}`;
  } else {
    const buf = fs.readFileSync(absPath);
    uri = `data:${mime};base64,${buf.toString('base64')}`;
  }
  dataUriCache.set(absPath, uri);
  return uri;
}

// Splice an SVG file directly into the page as an inline <svg> element so
// it inherits CSS custom properties (--ink, --paper, …) from the embedding
// document and re-colors when the user cycles themes (`A` hotkey). Used
// instead of toDataUri for SVG assets when inlining is enabled, because
// SVGs loaded via <img src="data:…"> live in an isolated document context
// and cannot inherit page-level vars.
//
// To avoid cross-contamination when the same (or another) SVG is spliced
// multiple times we (1) generate a per-instance prefix and rewrite all
// internal `id`s and `url(#…)` / `href="#…"` refs to use it, and (2) wrap
// every inline <style> block in `@scope (svg#${prefix}root) { … }` so
// generic selectors like `text { … }` or `svg { … }` only apply within
// this SVG. `@import` and `@font-face` are hoisted out of the @scope
// block (they must remain at top level to work).
//
// Returns the inline `<svg …>…</svg>` string, or null if the file is
// missing, oversized (caller falls back to external path), or empty.
function inlineSvg(absPath, { alt = '', title = '', extraClass = '' } = {}) {
  if (!absPath) return null;
  let stat;
  try { stat = fs.statSync(absPath); }
  catch { return null; }
  if (stat.size > MAX_INLINE_BYTES) {
    warnOversizedAsset(absPath, stat.size);
    return null;
  }
  let text = fs.readFileSync(absPath, 'utf8');
  // Strip XML prolog and DOCTYPE – both break when spliced into HTML.
  text = text.replace(/^\s*<\?xml\b[^?]*\?>\s*/i, '');
  text = text.replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '');
  // Find the root <svg …> open tag.
  const rootOpen = text.match(/<svg\b([^>]*)>/i);
  if (!rootOpen) return null;
  const rootAttrs = rootOpen[1] || '';
  const rootStart = rootOpen.index;
  const rootBodyStart = rootStart + rootOpen[0].length;
  const rootEnd = text.lastIndexOf('</svg>');
  if (rootEnd < 0) return null;
  let body = text.slice(rootBodyStart, rootEnd);

  inlineSvgCounter += 1;
  const prefix = `psi-fig-${inlineSvgCounter}-`;
  const rootId = `${prefix}root`;

  // Collect all internal IDs from id="X" attributes anywhere in the SVG
  // body (defs, masks, markers, gradients, etc.). Then rewrite those IDs
  // *and* the references to them. Whitelisting refs to known IDs avoids
  // touching arbitrary `url(#…)` strings that might appear in textContent
  // or `data-*` attributes.
  const idMap = new Map(); // oldId -> newId
  for (const m of body.matchAll(/\bid\s*=\s*"([^"]+)"/g)) idMap.set(m[1], prefix + m[1]);
  for (const m of body.matchAll(/\bid\s*=\s*'([^']+)'/g)) idMap.set(m[1], prefix + m[1]);

  // Rewrite id="X" attributes (only attribute position, via the regex shape).
  body = body.replace(/(\bid\s*=\s*")([^"]+)(")/g, (_, a, id, c) =>
    a + (idMap.get(id) || (prefix + id)) + c);
  body = body.replace(/(\bid\s*=\s*')([^']+)(')/g, (_, a, id, c) =>
    a + (idMap.get(id) || (prefix + id)) + c);

  if (idMap.size > 0) {
    // Build an alternation regex of escaped old IDs so we only rewrite
    // refs that point to IDs we actually own.
    const escIds = Array.from(idMap.keys())
      .sort((a, b) => b.length - a.length)
      .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const refAlt = escIds.join('|');
    // url(#X) and url("#X") and url('#X')
    const urlRe = new RegExp(`url\\(\\s*(['"]?)#(${refAlt})\\1\\s*\\)`, 'g');
    body = body.replace(urlRe, (_, q, id) => `url(${q}#${idMap.get(id)}${q})`);
    // href="#X" and xlink:href="#X" (single or double quotes)
    const hrefRe = new RegExp(`((?:xlink:)?href\\s*=\\s*)"#(${refAlt})"`, 'g');
    body = body.replace(hrefRe, (_, a, id) => `${a}"#${idMap.get(id)}"`);
    const hrefReSingle = new RegExp(`((?:xlink:)?href\\s*=\\s*)'#(${refAlt})'`, 'g');
    body = body.replace(hrefReSingle, (_, a, id) => `${a}'#${idMap.get(id)}'`);
  }

  // Wrap inline <style> contents with @scope(svg#${rootId}). We hoist
  // @import and @font-face rules out of the @scope block (they must
  // appear at the top level of the stylesheet to work).
  body = body.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => {
    const hoisted = [];
    // @import may contain `;` inside quoted URLs (e.g. Google Fonts
    // family=Inter:wght@400;500;600;700), so match the statement
    // string-aware: accept "…", '…', or unquoted runs between the
    // @import and the terminating semicolon.
    let scoped = css.replace(/@import\s+(?:"[^"]*"|'[^']*'|[^;'"]+)+;/g, (m) => { hoisted.push(m); return ''; });
    scoped = scoped.replace(/@font-face\s*\{[^}]*\}/g, (m) => { hoisted.push(m); return ''; });
    // Inside @scope (svg#…) { … }, a bare `svg` selector matches descendant
    // <svg> elements, NOT the scope root. The root is reachable only via
    // `:scope`. Rewrite top-level `svg { … }` rules (e.g. mermaid's root
    // custom-property block) so their declarations actually land on the
    // root SVG. We only touch bare `svg` selectors at the start of a rule
    // block (start of file, or after a closing brace) – chained selectors
    // like `svg text { … }` stay as-is (they were already descendant
    // selectors and remain correct under @scope).
    scoped = scoped.replace(/(^|\})(\s*)svg(\s*)\{/g, '$1$2:scope$3{');
    const trimmed = scoped.trim();
    const wrapped = trimmed
      ? `@scope (svg#${rootId}) {\n${trimmed}\n}`
      : '';
    const out = (hoisted.length ? hoisted.join('\n') + '\n' : '') + wrapped;
    return `<style${attrs}>${out}</style>`;
  });

  // Reassemble the root <svg> tag with the engine-assigned id, sizing
  // attrs forwarded, and accessibility hooks. Strip any pre-existing id
  // on the root (preserve as a class so authoring intent isn't lost) and
  // any pre-existing role/aria-label so ours wins.
  let attrs = rootAttrs;
  let preservedRootId = null;
  attrs = attrs.replace(/\sid\s*=\s*"([^"]*)"/i, (_, v) => { preservedRootId = v; return ''; });
  attrs = attrs.replace(/\sid\s*=\s*'([^']*)'/i, (_, v) => { preservedRootId = preservedRootId ?? v; return ''; });
  attrs = attrs.replace(/\srole\s*=\s*"[^"]*"/i, '');
  attrs = attrs.replace(/\srole\s*=\s*'[^']*'/i, '');
  attrs = attrs.replace(/\saria-label\s*=\s*"[^"]*"/i, '');
  attrs = attrs.replace(/\saria-label\s*=\s*'[^']*'/i, '');
  // Pull existing class to merge with extraClass.
  let existingClass = '';
  attrs = attrs.replace(/\sclass\s*=\s*"([^"]*)"/i, (_, v) => { existingClass = v; return ''; });
  attrs = attrs.replace(/\sclass\s*=\s*'([^']*)'/i, (_, v) => { existingClass = existingClass || v; return ''; });
  const classParts = [];
  if (existingClass) classParts.push(existingClass);
  if (preservedRootId) classParts.push(preservedRootId);
  if (extraClass) classParts.push(extraClass);
  const classAttr = classParts.length ? ` class="${escapeHtml(classParts.join(' '))}"` : '';
  const idAttr = ` id="${rootId}"`;
  const a11yAttrs = alt
    ? ` role="img" aria-label="${escapeHtml(alt)}"`
    : ' role="img"';
  const titleEl = title ? `<title>${escapeHtml(title)}</title>` : '';
  return `<svg${attrs}${idAttr}${classAttr}${a11yAttrs}>${titleEl}${body}</svg>`;
}

// Pre-scan a source file's image references to estimate inline cost.
// Used by the auto-inline decision in buildOnce: if total bytes fit
// AUTO_INLINE_BUDGET, the build inlines without an explicit flag. The
// regex catches false positives in code blocks, but for a budget
// heuristic that's fine – fence-aware scanning would be over-engineered.
// Every asset the source refers to, whichever way it refers to it. The
// diagram DSL is the second way and it is not markdown, so it needs its own
// pass here: without it a diagram's images were invisible to the
// auto-inline budget and to assertInlinable, which meant they silently
// shipped as external paths and an oversized one never failed the build.
function collectDiagramImageRefs(src) {
  const refs = [];
  let inDiagram = false;
  for (const line of String(src).split('\n')) {
    if (!inDiagram) {
      if (/^:::\s+diagram\b/.test(line)) inDiagram = true;
      continue;
    }
    if (/^:::\s*$/.test(line)) { inDiagram = false; continue; }
    const m = line.trim().match(/^image\s+\S+\s+(\S+)/);
    if (m) refs.push(m[1]);
  }
  return refs;
}

function scanReferencedImages(src, sourceDir) {
  const refs = new Set();
  for (const match of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    refs.add(match[1]);
  }
  for (const ref of collectDiagramImageRefs(src)) refs.add(ref);

  let total = 0;
  let count = 0;
  // Assets past the per-image cap are collected rather than merely counted:
  // buildOnce refuses to emit a half-inlined output (see assertInlinable).
  const oversized = [];
  for (const href of refs) {
    let abs = null;
    const isShorthand = !/[\\/]/.test(href) && !/\.[a-z0-9]+$/i.test(href);
    if (isShorthand) {
      const rel = resolveFigId(href);
      if (rel) abs = path.join(sourceDir, rel);
    } else if (!/^(?:https?:|data:|\/\/|\/)/i.test(href)) {
      abs = path.resolve(sourceDir, href);
    }
    if (!abs) continue;
    try {
      const stat = fs.statSync(abs);
      // Video is deliberately kept out of the auto-inline total. That budget
      // decides "inline the images or none of them"; a clip has its own,
      // larger per-file cap and its own fallback (staging into videos/), so
      // letting one push the sum past 10 MB turned inlining off for every
      // diagram in the lecture and reported the clip as an "image".
      if (!isVideoExt(abs)) {
        total += stat.size;
        count += 1;
      }
      if (stat.size > inlineCapFor(abs)) oversized.push({ abs, size: stat.size });
    } catch { /* missing assets surface elsewhere as figure-missing */ }
  }
  return { total, count, oversized };
}

// Refuse to emit an output that claims to be single-file and is not.
//
// The old behaviour was a warning: an asset past the per-image cap was left
// as an external path and the build succeeded. That fails in the worst
// possible way – the deck is correct on the machine that built it, and the
// figure is missing wherever the HTML travels alone, which is exactly when
// nobody is around to notice. Two lectures in the content repo shipped in
// that state.
//
// The message differs by what the author can actually do about it: rasters
// are fixable with --optimize-images, an oversized SVG is not (that verb only
// handles PNG/JPEG), and a missing encoder has to be installed first.
function assertInlinable(oversized, sourceDir) {
  if (!oversized.length) return;
  const lines = [
    `${oversized.length} asset(s) exceed the per-file inline cap (${MAX_INLINE_BYTES / 1024 / 1024} MB for images,`,
    `${MAX_INLINE_VIDEO_BYTES / 1024 / 1024} MB for video), so they would be left as`,
    `external paths and this output would not be self-contained:`,
    '',
  ];
  for (const o of oversized) {
    lines.push(`  ${path.relative(sourceDir, o.abs)}  ${(o.size / 1024 / 1024).toFixed(2)} MB`);
  }
  lines.push('');
  const rasters = oversized.filter(o => OPTIMIZABLE_EXTS.has(path.extname(o.abs).slice(1).toLowerCase()));
  if (rasters.length) {
    if (detectWebpEncoder()) {
      lines.push('Fix:  node build.js <source.md> --optimize-images');
    } else {
      lines.push('No WebP encoder is installed, so the build cannot tell you to convert and');
      lines.push('expect it to work. Install one, then convert:');
      lines.push('  brew install webp             # provides cwebp (preferred)');
      lines.push('  brew install imagemagick      # provides magick');
      lines.push('  node build.js <source.md> --optimize-images');
    }
  }
  // No video branch here on purpose: buildOnce filters clips out before
  // calling this, because an oversized clip is staged into videos/ rather
  // than refused. Reaching this function with one would be a bug upstream.
  const others = oversized.filter(o => !rasters.includes(o));
  if (others.length) {
    if (rasters.length) lines.push('');
    lines.push(`--optimize-images only handles PNG and JPEG, so it cannot help with`);
    lines.push(`${others.map(o => path.basename(o.abs)).join(', ')} – simplify or split ${others.length === 1 ? 'that asset' : 'those assets'} by hand.`);
  }
  lines.push('');
  lines.push('Or pass --no-inline-images to deliberately ship external asset paths.');
  const err = new Error(lines.join('\n'));
  // Something the author has to act on, not a bug in the build – print the
  // message alone. A stack trace here only buries the instructions.
  err.userFacing = true;
  throw err;
}

// ── math (KaTeX, rendered at build time) ─────────────────────────────
// PRD §2 specifies `$inline$` and `$$display$$`. Rendering happens here,
// in the build, for the same reason highlighting does: the outputs must
// open from file:// with no runtime, so there is no client-side KaTeX
// pass and no reflow flash when the camera pans onto a formula.
//
// The cost of that promise is fonts. KaTeX needs its own woff2 faces, and
// a self-contained file cannot link them – they have to be base64'd into
// the stylesheet. All twenty faces are 254 KB, which is not something to
// impose on the many lectures that contain no math at all. So the whole
// stylesheet is emitted only when the rendered HTML actually contains a
// formula, and even then only the font families that formula uses.
//
// Which families those are is derived from katex.min.css rather than
// hard-coded: the stylesheet itself records that `.amsrm` means KaTeX_AMS
// and `.delimsizing.size2` means KaTeX_Size2. Reading the mapping out of
// the CSS keeps it correct across KaTeX upgrades, where a table in this
// file would silently rot. Same instinct as imageSize(): parse the thing
// that knows, do not restate what it says.

const MATH_ERRORS = [];
const mathCache = new Map();

function renderMath(tex, displayMode) {
  const key = (displayMode ? 'd::' : 'i::') + tex;
  if (mathCache.has(key)) return mathCache.get(key);
  let html;
  try {
    html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,   // render the bad source in red instead of failing the build
      errorColor: '#b3261e',
      strict: false,
      trust: false,
    });
  } catch (e) {
    // renderToString with throwOnError:false still throws on a few
    // malformed inputs. Keep the source visible so the author can see it.
    MATH_ERRORS.push({ tex, message: e.message });
    html = `<code class="math-error">${escapeHtml(tex)}</code>`;
  }
  // The soft-failure path is the common one: KaTeX marks a bad formula with
  // .katex-error and returns normally, which is right on a projector and
  // wrong on a terminal, where the author would never hear about it.
  if (/katex-error/.test(html)) {
    MATH_ERRORS.push({ tex, message: 'rendered as an error (shown in red)' });
  }
  mathCache.set(key, html);
  return html;
}

// Lazily read and parsed once per process; both are pure functions of the
// installed KaTeX version.
let katexCssRaw = null;
let katexFaces = null;      // [{ whole, fam, urls }]
let katexFamClasses = null; // Map<family, Set<class>>

function loadKatexCss() {
  if (katexCssRaw !== null) return;
  const cssPath = nodeRequire.resolve('katex/dist/katex.min.css');
  const cssDir = path.dirname(cssPath);
  katexCssRaw = fs.readFileSync(cssPath, 'utf8');

  katexFaces = [...katexCssRaw.matchAll(/@font-face\{([^}]*)\}/g)].map(m => {
    const body = m[1];
    const fam = (body.match(/font-family:\s*([^;]+)/) || [])[1]
      ?.trim().replace(/^["']|["']$/g, '');
    const urls = [...body.matchAll(/url\(([^)]+)\)\s*format\(["']?([^"')]+)["']?\)/g)]
      .map(u => ({ abs: path.resolve(cssDir, u[1]), fmt: u[2] }));
    return { whole: m[0], body, fam, urls };
  });

  // `.katex` is the root container of every rendered formula, so it cannot
  // tell families apart; drop it and keep the discriminating classes.
  const stripped = katexCssRaw.replace(/@font-face\{[^}]*\}/g, '');
  katexFamClasses = new Map();
  for (const m of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/font-family:\s*KaTeX_/.test(m[2])) continue;
    const fams = [...m[2].matchAll(/KaTeX_[A-Za-z0-9]+/g)].map(x => x[0]);
    const classes = [...m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)]
      .map(x => x[1]).filter(c => c !== 'katex');
    for (const f of fams) {
      if (!katexFamClasses.has(f)) katexFamClasses.set(f, new Set());
      classes.forEach(c => katexFamClasses.get(f).add(c));
    }
  }
}

// The live views let the reader switch the body font at run time (F), and
// the maths follows – see the katex-follows-the-font block in AUDIENCE_CSS.
// Which font that will be is not knowable at build time, so a live view with
// any formula carries the sans and typewriter faces as well. Measured: +46 KB
// on top of a typical 119 KB. Print has no toggle and pays nothing extra.
const KATEX_TOGGLE_FAMS = ['KaTeX_SansSerif', 'KaTeX_Typewriter'];

function katexFamiliesUsedBy(html, opts = {}) {
  loadKatexCss();
  // KaTeX_Main carries the base `.katex` rule, so it is always needed.
  const need = new Set(['KaTeX_Main']);
  if (opts.fontToggle) for (const f of KATEX_TOGGLE_FAMS) need.add(f);
  for (const [fam, classes] of katexFamClasses) {
    if (!classes.size) { need.add(fam); continue; }
    for (const c of classes) {
      if (new RegExp(`class="[^"]*(?:^|[\\s"])${c}(?:[\\s"]|$)`).test(html)) {
        need.add(fam);
        break;
      }
    }
  }
  return need;
}

const katexSheetCache = new Map();
// Set on every emit so buildOnce can report the payload once per build
// without re-deriving it or reading an output file back off disk.
let lastKatexSheet = null;

// Returns '' when the HTML contains no rendered math, so lectures without
// formulas pay nothing at all.
function katexStylesheetFor(html, opts = {}) {
  if (!/class="katex/.test(html)) return '';
  const need = katexFamiliesUsedBy(html, opts);
  const key = [...need].sort().join(',');
  if (katexSheetCache.has(key)) return (lastKatexSheet = katexSheetCache.get(key));

  let css = katexCssRaw;
  let bytes = 0;
  for (const face of katexFaces) {
    if (!need.has(face.fam)) {
      css = css.replace(face.whole, '');
      continue;
    }
    // Keep woff2 only: every browser above the floor in README supports it,
    // and the woff/ttf fallbacks would triple the inlined payload.
    const woff2 = face.urls.find(u => u.fmt === 'woff2');
    if (!woff2 || !fs.existsSync(woff2.abs)) continue;
    const buf = fs.readFileSync(woff2.abs);
    bytes += buf.length;
    const src = `src:url(data:font/woff2;base64,${buf.toString('base64')}) format("woff2")`;
    css = css.replace(face.whole, face.whole.replace(/src:[^;}]+/, src));
  }
  const out = { css, families: need.size, bytes };
  katexSheetCache.set(key, out);
  return (lastKatexSheet = out);
}

// The renderers want a ready-made <style> block; keep the size reporting
// in one place so every view logs the same number.
function katexStyleTag(html, opts = {}) {
  const sheet = katexStylesheetFor(html, opts);
  if (!sheet) return '';
  return `<style>\n${sheet.css}\n</style>`;
}

// ── hosted embeds (::: embed) ───────────────────────────────────────
//
// The one construct in the format that makes an output fetch from a third
// party while the lecture is running. It is therefore its own directive and
// never the meaning of a bare link or asset: an author who wants this says
// so, and the build says what it costs.
//
// Two things make it more usable than a raw iframe, both measured:
//
//   1. Both providers speak a postMessage control protocol, so play, pause
//      and seek sync between the projection and the cockpit exactly as a
//      local <video> does – with no SDK bundled and no licence question.
//      YouTube needs enablejsapi=1 for that; Vimeo needs nothing.
//   2. YouTube refuses to play from a file:// page (origin `null`, no
//      Referer → Error 153). Vimeo does not care. So the runtime swaps a
//      YouTube embed for an instruction card when the deck was opened from
//      disk, instead of leaving the room staring at a player error.
const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;

function parseEmbedUrl(raw) {
  const url = String(raw).trim();
  const yt = YT_ID.exec(url);
  if (yt) {
    // youtube-nocookie by default. It behaves identically and does not set
    // profiling cookies until playback, which is the right default anywhere
    // and not really optional in a privacy group's own teaching tool.
    return {
      provider: 'youtube',
      id: yt[1],
      src: `https://www.youtube-nocookie.com/embed/${yt[1]}?enablejsapi=1&rel=0&modestbranding=1`,
      host: 'youtube-nocookie.com',
      playsFromFile: false,
    };
  }
  const vm = VIMEO_ID.exec(url);
  if (vm) {
    return {
      provider: 'vimeo',
      id: vm[1],
      src: `https://player.vimeo.com/video/${vm[1]}?dnt=1`,
      host: 'player.vimeo.com',
      playsFromFile: true,
    };
  }
  if (/^https:\/\//i.test(url)) {
    // Any other https URL is framed as-is. No control protocol is assumed,
    // so it gets no sync – it is an escape hatch, not a supported provider.
    let host = url;
    try { host = new URL(url).host; } catch { /* keep the raw string */ }
    return { provider: 'generic', id: null, src: url, host, playsFromFile: true };
  }
  const err = new Error(
    `::: embed needs an https URL, got "${url}".\n` +
    `  Recognised: a YouTube or Vimeo link, or any other https:// address.`
  );
  err.userFacing = true;
  throw err;
}

// Collected per build so the terminal can state the run-time dependency
// once, with the hosts, rather than per occurrence.
let embedsThisBuild = [];

function renderEmbedOpen(rawUrl) {
  const e = parseEmbedUrl(rawUrl);
  embedsThisBuild.push(e);
  const u = escapeHtml(rawUrl);
  // The original address is emitted as a real link under the frame. It is
  // the fallback when the frame cannot play, it gives the print views
  // something that survives on paper, and it earns the URL a QR code from
  // the existing link machinery for free.
  return `<figure class="figure-embed" data-embed-provider="${e.provider}" data-embed-src="${escapeHtml(e.src)}" data-embed-url="${u}">` +
    `<div class="embed-frame">` +
    // data-src, not src: nothing is fetched until the chunk is actually
    // reached (see updateEmbedLoading). That keeps a lecture from opening
    // connections to a third party for slides nobody ever showed.
    `<iframe data-src="${escapeHtml(e.src)}" allowfullscreen ` +
    `allow="autoplay; fullscreen; encrypted-media; picture-in-picture" ` +
    `referrerpolicy="strict-origin-when-cross-origin" title="Embedded video"></iframe>` +
    `</div>` +
    `<div class="embed-source"><a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a></div>` +
    `<figcaption>`;
}

// ── staging clips that are too large to inline ──────────────────────
//
// A clip over the inline cap used to leave the same relative path it was
// written with, which works on the machine that built it and breaks the
// moment the HTML travels. There is no way to make a 200 MB lecture
// recording self-contained, so instead of pretending, the build names a
// companion folder and says so: oversized clips are copied to `videos/`
// next to the output and played from there. One folder to carry alongside,
// stated on the terminal rather than left for the author to discover in
// front of a room.
//
// Copied, never moved: the source stays where the author put it.
const VIDEO_STAGE_DIR = 'videos';
const stagedVideos = new Map();   // abs source path -> relative emitted path

function stageVideo(absPath) {
  if (stagedVideos.has(absPath)) return stagedVideos.get(absPath);
  const name = path.basename(absPath);
  const destDir = path.join(currentSourceDir, VIDEO_STAGE_DIR);
  const dest = path.join(destDir, name);
  const rel = `${VIDEO_STAGE_DIR}/${name}`;
  // Already living in videos/ – nothing to copy, just address it there.
  if (path.resolve(absPath) === path.resolve(dest)) {
    stagedVideos.set(absPath, { rel, copied: false, bytes: safeSize(absPath) });
    return stagedVideos.get(absPath);
  }
  try {
    fs.mkdirSync(destDir, { recursive: true });
    const src = fs.statSync(absPath);
    let need = true;
    try {
      const cur = fs.statSync(dest);
      // Same size and no older than the source: treat as already staged.
      // Keeps --watch from re-copying a large file on every keystroke.
      need = !(cur.size === src.size && cur.mtimeMs >= src.mtimeMs);
    } catch { /* not there yet */ }
    if (need) fs.copyFileSync(absPath, dest);
    stagedVideos.set(absPath, { rel, copied: need, bytes: src.size });
  } catch (e) {
    // Staging is a convenience; if it fails, fall back to the original
    // relative path rather than failing the build over a copy.
    stagedVideos.set(absPath, { rel: null, copied: false, bytes: 0, error: e.message });
  }
  return stagedVideos.get(absPath);
}
function safeSize(p) { try { return fs.statSync(p).size; } catch { return 0; } }

// ── QR codes for link addresses ─────────────────────────────────────
//
// A URL shown on a projector is only useful if the room can capture it, and
// a 90-character DOI is not something anyone writes down correctly. The QR
// puts the capture on the listener's own phone, which is also where the
// network request belongs: the projection machine still contacts nobody.
//
// Generated at build time, not at runtime. The encoder is a dependency
// rather than 300 hand-rolled lines of Reed-Solomon, because a mistake in
// that maths yields codes that scan to the wrong string and look perfectly
// fine to the eye. Running it in Node also keeps it out of the inlined
// template literals, where an escape mistake is silent.
//
// Error correction level M (~15%), which survives a projector's contrast
// and a photograph taken at an angle from the back of a room.
const qrCodeGen = nodeRequire('qrcode-generator');
const qrCache = new Map();

function qrSvg(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  const qr = qrCodeGen(0, 'M');   // 0 = pick the smallest type that fits
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;                // the spec's mandatory quiet zone, in modules
  const size = n + quiet * 2;
  // One path, with horizontal runs merged, rather than a <rect> per module:
  // a rect-per-module SVG for a 40-module code is several times the size for
  // an identical image.
  let d = '';
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!qr.isDark(row, col)) { col++; continue; }
      let run = 1;
      while (col + run < n && qr.isDark(row, col + run)) run++;
      d += `M${col + quiet} ${row + quiet}h${run}v1h-${run}z`;
      col += run;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code for this address">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`;
  qrCache.set(url, svg);
  return svg;
}

// Collect every external address a view can put on screen, so the overlay
// can look its QR up instead of encoding one in the browser.
let lastQrStats = { count: 0, bytes: 0 };
function linkQrMap(html) {
  const out = {};
  let bytes = 0;
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    // The href in rendered HTML is entity-escaped; the DOM hands the runtime
    // the decoded form, and that is what the map is keyed by.
    // Key it the way the runtime will ask. The DOM normalises an href
    // (https://example.com becomes https://example.com/), so keying by the
    // raw attribute text meant a bare-domain link looked up a key that did
    // not exist and showed an empty QR box with no diagnostic anywhere.
    const raw = m[1].replace(/&amp;/g, '&');
    let url = raw;
    try { url = new URL(raw).href; } catch { /* keep the raw form */ }
    if (out[url]) continue;
    out[url] = qrSvg(url);
    bytes += out[url].length;
  }
  const n = Object.keys(out).length;
  if (n > lastQrStats.count) lastQrStats = { count: n, bytes };
  return out;
}

// ── bundled default fonts ───────────────────────────────────────────
//
// The stylesheets used to *name* their typefaces and hope the machine had
// them. That never held: Safari does not expose locally installed fonts to
// a page at all, as an anti-fingerprinting measure, so a lecture there fell
// through to Georgia and system-ui no matter what the lecturer had
// installed. The design was a suggestion rather than a guarantee.
//
// So the three default families ship with the tool and are embedded in
// every output. All three are SIL OFL 1.1, which permits redistribution
// and embedding; their licence text travels in the emitted stylesheet, as
// the licence requires.
//
// Variable `wght` subsets, latin, upright plus italic: 282 KB for all three
// together. The `opsz` cuts of the same families are nearly twice that and
// buy an optical-size axis this design does not vary.
//
// An author who names their own families in `fonts:` overrides the bundle
// for those roles; `fonts: none` turns the bundle off entirely.
const BUNDLED_FONTS = [
  { role: 'serif', family: 'Literata', pkg: '@fontsource-variable/literata',
    files: { normal: 'literata-latin-wght-normal.woff2', italic: 'literata-latin-wght-italic.woff2' } },
  // Inter Tight, not Inter: it is what the stacks already ask for first, and
  // it happens to be the smaller of the two.
  { role: 'sans', family: 'Inter Tight', pkg: '@fontsource-variable/inter-tight',
    files: { normal: 'inter-tight-latin-wght-normal.woff2', italic: 'inter-tight-latin-wght-italic.woff2' } },
  { role: 'mono', family: 'JetBrains Mono', pkg: '@fontsource-variable/jetbrains-mono',
    files: { normal: 'jetbrains-mono-latin-wght-normal.woff2', italic: 'jetbrains-mono-latin-wght-italic.woff2' } },
];

let bundledFacesCache = null;
function bundledFaces() {
  if (bundledFacesCache) return bundledFacesCache;
  const out = [];
  for (const f of BUNDLED_FONTS) {
    let dir;
    try {
      dir = path.dirname(nodeRequire.resolve(`${f.pkg}/package.json`));
    } catch (e) {
      const err = new Error(
        `The bundled font package ${f.pkg} is missing. Run: npm install`
      );
      err.userFacing = true;
      throw err;
    }
    for (const [style, file] of Object.entries(f.files)) {
      const abs = path.join(dir, 'files', file);
      const buf = fs.readFileSync(abs);
      out.push({
        role: f.role, family: f.family, style,
        // Variable across the whole weight range, so bold needs no second file.
        weight: '100 900',
        bytes: buf.length,
        src: `url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')`,
      });
    }
  }
  return (bundledFacesCache = out);
}

// ── embedded webfonts ───────────────────────────────────────────────
//
// Everything else in an output file is self-contained; type was not. The
// CSS shipped bare family stacks – Literata, Inter Tight, JetBrains Mono –
// which resolve only on a machine where those are *installed*, and quietly
// fall through to Georgia / system-ui / Menlo everywhere else. A lecture
// mailed to a colleague kept its layout and its figures and lost its face.
//
// An author opts in by dropping font files next to source.md and naming the
// families in the frontmatter:
//
//   fonts:
//     serif: Literata
//     sans: Inter Tight
//     mono: JetBrains Mono
//
// Licensing is the author's call and cannot be checked here, so the build
// says nothing about it beyond the note in the docs: embedding redistributes
// the font file, which most open licences (SIL OFL, Apache-2.0 – between
// them nearly all of Google Fonts) permit and most commercial desktop
// licences do not.
const FONT_DIR = 'fonts';
const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf'];
const FONT_FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const FONT_WEIGHT_NAMES = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
  regular: 400, normal: 400, book: 400, medium: 500, semibold: 600,
  demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900,
  heavy: 900,
};
// The tail of each default stack, kept here rather than inline in the two
// stylesheets so an embedded family can be prepended to the *same* list the
// build would otherwise have emitted. One source of truth, two consumers.
const FONT_STACK_TAILS = {
  serif: `'Literata', 'Source Serif 4', Georgia, serif`,
  sans: `'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, Menlo, monospace`,
};
// Which CSS custom properties each role feeds. Audience and print use
// different names for the same idea; setting a property a given view never
// reads costs nothing, so one override block serves all four outputs.
const FONT_ROLE_VARS = {
  serif: ['--serif-stack', '--serif'],
  sans: ['--sans-stack', '--sans'],
  mono: ['--mono-font', '--read-mono-stack', '--mono'],
};

const normFontName = (s) => String(s).toLowerCase().replace(/[\s_-]/g, '');

// A filename is `<family><sep><descriptor>` or just `<family>`. The
// descriptor half is a closed vocabulary, which is what lets the family half
// be recognised exactly rather than by prefix – see splitFontFileName.
const FACE_DESCRIPTOR_RE = new RegExp(
  '^(.*?)[-_ ]?(' +
    '(?:' + Object.keys(FONT_WEIGHT_NAMES).join('|') + ')(?:italic|oblique)?' +
    '|\\d{3}(?:italic|oblique)?' +
    '|italic|oblique' +
    '|variable|vf' +
  ')$', 'i');

// Split a font filename into the family it declares and its face descriptor.
//
// Matching the family by prefix was wrong and wrong silently: with both
// Inter-Regular and "Inter Tight-Regular" in the folder, asking for `Inter`
// matched both, because normalising away the space makes "intertightregular"
// start with "inter". The leftover "tightregular" then hit the weight-name
// lookup, missed, and fell back to 400 – so two different typefaces were
// declared as the same family at the same weight and style, and the browser
// simply took the last one. The author asked for Inter and got Inter Tight
// with nothing said.
//
// So the family is compared for equality, and the whole basename is tried
// first: a family whose own name ends in a weight word ("Archivo Black")
// still resolves when the file carries no separate descriptor.
function splitFontFileName(base) {
  // Google's variable naming carries the axes in brackets. A variable file
  // spans the range, so pinning one weight would make the browser
  // synthesise faces it could have interpolated properly.
  const axis = /\[[^\]]*\]/.test(base);
  const bare = base.replace(/\[[^\]]*\]/g, '').trim();
  const whole = { family: bare, weight: axis ? '100 900' : 400, style: 'normal' };
  if (axis) return [whole];

  const m = FACE_DESCRIPTOR_RE.exec(bare);
  if (!m || !m[1]) return [whole];

  let d = m[2].toLowerCase();
  let style = 'normal';
  if (/(italic|oblique)$/.test(d)) { style = 'italic'; d = d.replace(/(italic|oblique)$/, ''); }
  let weight;
  if (!d) weight = 400;
  else if (/^\d{3}$/.test(d)) weight = parseInt(d, 10);
  else if (d === 'variable' || d === 'vf') weight = '100 900';
  else weight = FONT_WEIGHT_NAMES[d] || 400;
  // Both readings are offered; the caller keeps whichever names the family
  // it was actually asked for.
  return [whole, { family: m[1], weight, style }];
}

// Read `fonts:` out of the frontmatter and turn it into @font-face blocks.
// Returns null when the lecture embeds nothing, so callers can stay terse.
function collectEmbeddedFonts(frontmatter = {}, srcDir) {
  const spec = frontmatter.fonts;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;

  const dir = path.join(srcDir, FONT_DIR);
  let entries = [];
  try {
    entries = fs.readdirSync(dir).filter(f => FONT_EXTS.includes(path.extname(f).slice(1).toLowerCase()));
  } catch (e) { /* handled below as "no files" */ }

  const faces = [];
  const overrides = [];
  const notes = [];
  let bytes = 0;

  for (const role of ['serif', 'sans', 'mono']) {
    if (!(role in spec)) continue;
    const family = String(spec[role]).trim();
    if (!family) continue;
    const wanted = normFontName(family);

    // Keep only files whose family half *equals* the requested family, and
    // remember which reading matched so the descriptor is the right one.
    const matches = [];
    for (const f of entries) {
      const base = path.basename(f, path.extname(f));
      const hit = splitFontFileName(base).find(r => normFontName(r.family) === wanted);
      if (hit) matches.push({ file: f, face: hit });
    }
    if (!matches.length) {
      // Falling back silently is exactly the failure this feature exists to
      // remove: the build would succeed and the output would look like the
      // author never asked for the font.
      const err = new Error(
        `Frontmatter names "fonts.${role}: ${family}" but no matching file is in ${path.join(FONT_DIR, '')}/.\n` +
        `  Looked in: ${dir}\n` +
        `  Expected something like ${family.replace(/\s+/g, '')}-Regular.woff2 (also .woff, .ttf, .otf).\n` +
        `  Found there: ${entries.length ? entries.join(', ') : '(nothing)'}`
      );
      err.userFacing = true;
      throw err;
    }

    // One (weight, style) slot can only hold one face. An author who drops
    // both Inter-Regular.woff2 and Inter-Regular.ttf means one face in two
    // formats, not two faces – take the better-compressing one and say so,
    // rather than emitting a duplicate the browser resolves by source order.
    const bySlot = new Map();
    for (const { file, face } of matches) {
      const ext = path.extname(file).slice(1).toLowerCase();
      const slot = `${face.weight}/${face.style}`;
      const prev = bySlot.get(slot);
      if (prev) {
        const better = FONT_EXTS.indexOf(ext) < FONT_EXTS.indexOf(prev.ext) ? { file, ext } : prev;
        const dropped = better.file === file ? prev.file : file;
        notes.push(`${family} ${slot}: using ${better.file}, skipping ${dropped} (same weight and style)`);
        bySlot.set(slot, { ...better, face });
        continue;
      }
      bySlot.set(slot, { file, ext, face });
    }

    for (const { file, ext, face } of bySlot.values()) {
      const buf = fs.readFileSync(path.join(dir, file));
      bytes += buf.length;
      if (ext !== 'woff2') {
        notes.push(`${file} is ${ext} (${(buf.length / 1024).toFixed(0)} KB) – woff2 is typically 30-50% smaller`);
      }
      faces.push({
        family, weight: face.weight, style: face.style, file,
        src: `url(data:${FONT_MIME[ext]};base64,${buf.toString('base64')}) format('${FONT_FORMAT[ext]}')`,
      });
    }
    overrides.push({ role, family });
  }

  if (!faces.length) return null;
  return { faces, overrides, bytes, notes };
}

const OFL_NOTICE =
  '/* Bundled typefaces: Literata, Inter Tight and JetBrains Mono, each under\n' +
  '   SIL Open Font License 1.1 (https://openfontlicense.org). The licence\n' +
  '   permits this embedding and requires the notice to travel with it.\n' +
  '   Full text: node_modules/@fontsource-variable/<family>/LICENSE */';

// Emits the @font-face blocks and the stack overrides for one view. Takes
// the bundled defaults and whatever the author supplied; a role the author
// named uses their family, every other role uses the bundle.
function fontStyleTag(embed) {
  if (!embed) return '';
  const { faces = [], overrides = [], bundled = [] } = embed;
  const face = (f) =>
    `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;src:${f.src};}`;
  // font-display:block, not swap: a lecture must not flash a fallback face
  // on the projector and then reflow the slide under the room's eyes.
  const faceCss = [...bundled, ...faces].map(face).join('\n');
  const varCss = overrides.map(({ role, family }) =>
    FONT_ROLE_VARS[role].map(v => `  ${v}: '${family}', ${FONT_STACK_TAILS[role]};`).join('\n')
  ).join('\n');
  const rootBlock = varCss ? `\n:root {\n${varCss}\n}` : '';
  const notice = bundled.length ? OFL_NOTICE + '\n' : '';
  return `<style>\n${notice}${faceCss}${rootBlock}\n</style>`;
}

// ── marked renderer overrides (code highlighting + image shorthand) ──

marked.use({
  renderer: {
    code(code, infostring) {
      const lang = (infostring || '').trim().split(/\s+/)[0].toLowerCase();
      if (lang) {
        const html = highlightCode(code, lang);
        if (html) return html + '\n';
      }
      return `<pre><code>${escapeHtml(code)}</code></pre>\n`;
    },
    image(href, title, text) {
      // Shorthand: bare id (no slash, no extension) → assets/<id>.<ext>
      const isShorthand = href && !/[\\/]/.test(href) && !/\.[a-z0-9]+$/i.test(href);
      if (isShorthand) {
        const resolved = resolveFigId(href);
        if (resolved) {
          const absResolved = path.join(currentSourceDir, resolved);
          const isSvg = path.extname(absResolved).toLowerCase() === '.svg';
          // SVGs are spliced inline (not data-URI'd in <img>) so they
          // inherit page CSS custom properties and react to theme cycle.
          if (inlineAssetsEnabled && isSvg) {
            const svg = inlineSvg(absResolved, { alt: text || '', title: title || '' });
            if (svg) {
              const alt = escapeHtml(text || '');
              const cap = text ? `<figcaption>${alt}</figcaption>` : '';
              return `<figure class="figure-img" data-fig-id="${escapeHtml(href)}">${svg}${cap}</figure>`;
            }
          }
          let src = resolved;
          if (inlineAssetsEnabled) {
            const inlined = toDataUri(absResolved);
            if (inlined) src = inlined;
          }
          const alt = escapeHtml(text || '');
          const cap = text ? `<figcaption>${alt}</figcaption>` : '';
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          if (isVideoExt(absResolved)) {
            // Not inlined (over the cap, or inlining off): stage it into
            // videos/ so the output has one named companion folder rather
            // than a path that only resolves where it was built.
            if (!src.startsWith('data:')) {
              const staged = stageVideo(absResolved);
              if (staged.rel) src = staged.rel;
            }
            // Native controls, deliberately: they carry play, seek, volume
            // and – the reason this needs no directive of its own – a
            // fullscreen button. How large the clip sits on the slide is the
            // chunk's width class, exactly like a still figure.
            // preload="metadata" so a deck with several clips does not
            // decode all of them on load; an inlined clip is already in the
            // document either way.
            return `<figure class="figure-video" data-fig-id="${escapeHtml(href)}">` +
              `<video src="${escapeHtml(src)}"${titleAttr} controls preload="metadata" playsinline></video>${cap}</figure>`;
          }
          return `<figure class="figure-img" data-fig-id="${escapeHtml(href)}"><img src="${escapeHtml(src)}" alt="${alt}"${titleAttr} loading="lazy">${cap}</figure>`;
        }
        // Unresolved: emit a visible placeholder so authors notice immediately.
        return `<figure class="figure-img figure-missing" data-fig-id="${escapeHtml(href)}"><div class="figure-missing-placeholder">missing: assets/${escapeHtml(href)}.(${[...IMG_EXTS, ...VIDEO_EXTS].join('|')})</div>${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}</figure>`;
      }
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      // Direct relative path: also splice SVGs inline for theme inheritance.
      const isRelative = href && currentSourceDir && !/^(?:https?:|data:|\/\/|\/)/i.test(href);
      const isSvgPath = href && /\.svg(?:[?#]|$)/i.test(href);
      if (inlineAssetsEnabled && isRelative && isSvgPath) {
        const abs = path.resolve(currentSourceDir, href);
        const svg = inlineSvg(abs, { alt: text || '', title: title || '' });
        if (svg) return svg;
      }
      let src = href;
      // Inline only true relative paths from disk; leave external URLs,
      // existing data URIs, and root-absolute paths untouched.
      if (inlineAssetsEnabled && isRelative) {
        const inlined = toDataUri(path.resolve(currentSourceDir, href));
        if (inlined) src = inlined;
      }
      // A written-out path or URL ending in a video extension is a clip, not
      // an image. Worth stating because the obvious reading of `![](x.mp4)`
      // is "this is an image tag" and the result is a broken img with no
      // error anywhere – which is exactly what it used to do.
      //
      // A remote clip is worth more than it looks: it is still a local
      // <video> element, so the play/pause/seek sync between the two windows
      // works unchanged, with no iframe and no provider SDK. That is the one
      // thing a YouTube or Vimeo embed cannot give back.
      if (/\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(href)) {
        const alt = escapeHtml(text || '');
        const cap = text ? `<figcaption>${alt}</figcaption>` : '';
        return `<figure class="figure-video" data-fig-id="${escapeHtml(href)}">` +
          `<video src="${escapeHtml(src)}"${titleAttr} controls preload="metadata" playsinline></video>${cap}</figure>`;
      }
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text || '')}"${titleAttr}>`;
    },
    link(href, title, text) {
      // External http(s) links open in a new tab so a click during a live
      // talk never navigates away from the deck. Internal cross-references
      // (`#id`) and other schemes keep default in-page behavior.
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const isExternal = /^https?:\/\//i.test(href || '');
      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(href || '')}"${titleAttr}${target}>${text}</a>`;
    },
  },
});

// Math delimiters as marked extensions rather than a pre-pass over the
// source string, so fenced blocks are consumed whole by the code tokenizer
// before a block-level dollar pair is ever considered.
//
// Inline is the subtle one. marked runs custom inline extensions BEFORE its
// own tokenizers, codespan included, so a naive rule happily matches from a
// stray dollar in prose to a dollar inside a following code span and eats
// the backtick that delimits it. Measured, not theorised: it turned
// "a price of $5 and $10, `$PATH` in code" into a formula reading "10, `".
// Excluding backticks from the content class is what makes the claim true –
// math can no longer cross an inline-code boundary in either direction, and
// a dollar pair fully inside backticks is never exposed, because codespan
// consumes the span before the walker reaches its interior.
//
// The rest of the rule is deliberately strict – no space after the opening
// delimiter, none before the closing one, no digit straight after it – so
// that a sentence mentioning $5 and $10 does not silently become math.
// A literal dollar is `\$`, handled by marked's own escape tokenizer,
// which wins because it matches at the backslash rather than the dollar.
marked.use({
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src) { return src.indexOf('$$'); },
      tokenizer(src) {
        const m = /^ {0,3}\$\$([\s\S]+?)\$\$ *(?:\n+|$)/.exec(src);
        if (!m) return;
        return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
      },
      renderer(token) {
        return `<div class="math-display">${renderMath(token.text, true)}</div>\n`;
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src) { return src.indexOf('$'); },
      tokenizer(src) {
        const m = /^\$(?![\s$])((?:\\.|[^\\$\n`])+?)(?<![\s\\])\$(?!\d)/.exec(src);
        if (!m) return;
        return { type: 'mathInline', raw: m[0], text: m[1] };
      },
      renderer(token) {
        return `<span class="math-inline">${renderMath(token.text, false)}</span>`;
      },
    },
  ],
});

// ── diagrams (::: diagram) ──────────────────────────────────────────
// The compiler itself lives in `diagram-core.mjs`, and that is the one
// documented exception to "build.js is one file". The reason is narrow: the
// graphical editor answers a drag by rewriting the source and re-running the
// compiler *in the browser*, so exactly one text has to compile a diagram in
// Node and in the page. See the header of that file, and editor.md §8.1.
//
// What stays here is the half that reads the disk: resolving an asset,
// measuring one, splicing a vector file inline, and the warning sink. Those
// are injected into the compiler as its four leaves. The diagram CSS and the
// step runtime stay here too – they are inlined into the output like every
// other stylesheet and runtime in this file.

function dgAspect(absPath) {
  if (!absPath) return null;
  if (path.extname(absPath).toLowerCase() === '.svg') {
    let text;
    try { text = fs.readFileSync(absPath, 'utf8'); } catch { return null; }
    const vb = text.match(/\bviewBox\s*=\s*["']\s*[-\d.eE]+\s+[-\d.eE]+\s+([-\d.eE]+)\s+([-\d.eE]+)/i);
    if (vb) {
      const w = Number(vb[1]), h = Number(vb[2]);
      if (w > 0 && h > 0) return h / w;
    }
    const wa = text.match(/<svg\b[^>]*\bwidth\s*=\s*["']([\d.]+)/i);
    const ha = text.match(/<svg\b[^>]*\bheight\s*=\s*["']([\d.]+)/i);
    if (wa && ha && Number(wa[1]) > 0) return Number(ha[1]) / Number(wa[1]);
    return null;
  }
  const size = imageSize(absPath);
  return size && size.width > 0 ? size.height / size.width : null;
}

// Resolve a diagram image reference the same way the ![](fig-id) shorthand
// does, so the two never disagree about where assets live.
function dgResolveImage(ref) {
  if (!currentSourceDir) return null;
  if (/^(https?:)?\/\//i.test(ref)) return { abs: null, href: ref, remote: true };
  const direct = ref.includes('/') || path.extname(ref)
    ? path.join(currentSourceDir, ref) : null;
  let rel = null;
  if (direct && fs.existsSync(direct)) rel = ref;
  else rel = resolveFigId(ref);
  if (!rel) return null;
  return { abs: path.join(currentSourceDir, rel), href: rel, remote: false };
}

// One place decides how see-through an element is; the emitter and the
// runtime both go through it.

// The `assetMarkup` leaf injected into diagram-core: the <svg> or <image>
// element for an asset that has been resolved on disk. Everything in here
// reads a file, which is exactly why it is on this side of the seam.
function dgAssetMarkup(node, id, geo) {
  const asset = node.asset;

  if (asset.abs && path.extname(asset.abs).toLowerCase() === '.svg') {
    let spliced = inlineSvg(asset.abs, { alt: node.alt });
    if (spliced) {
      // The root id inlineSvg assigned cannot simply be replaced with ours:
      // it is also the anchor of the `@scope (svg#…)` wrapper around every
      // <style> block in the file. Overwriting the attribute alone left the
      // scope pointing at an id that no longer existed, which silently
      // killed the whole stylesheet – a line drawing arrived with no lines.
      // Rename the token everywhere instead.
      const rootId = (spliced.match(/\bid="(psi-fig-\d+-root)"/) || [])[1];
      if (rootId) spliced = spliced.split(rootId).join(id);
      const tag = spliced.match(/^<svg\b([^>]*)>/i);
      let attrs = tag ? tag[1] : '';
      const vb = attrs.match(/\bviewBox\s*=\s*["'][^"']*["']/i);
      const wAttr = attrs.match(/\bwidth\s*=\s*["']([\d.]+)[a-z%]*["']/i);
      const hAttr = attrs.match(/\bheight\s*=\s*["']([\d.]+)[a-z%]*["']/i);
      // The file's own width/height must go or they would fight the box the
      // layout just computed for it.
      attrs = attrs.replace(/\s(?:width|height|x|y)\s*=\s*["'][^"']*["']/gi, '');
      // A file with no viewBox does not scale; synthesise one from its
      // width/height so the nested viewport still fits the box.
      const vbAttr = vb ? '' : (wAttr && hAttr ? ` viewBox="0 0 ${wAttr[1]} ${hAttr[1]}"` : '');
      const body = spliced.slice(tag ? tag[0].length : 0);
      return `<svg${attrs}${vbAttr}${geo} preserveAspectRatio="xMidYMid meet">${body}`;
    }
  }

  let href = asset.remote ? asset.href : asset.href;
  if (asset.abs && inlineAssetsEnabled) {
    const uri = toDataUri(asset.abs);
    if (uri) href = uri;
    else dgWarn(`image ${node.id}: ${path.relative(process.cwd(), asset.abs)} is over the inline cap, so this output is no longer self-contained.`);
  }
  const alt = node.alt ? `<title>${escapeHtml(node.alt)}</title>` : '';
  return `<image id="${id}"${geo} href="${escapeHtml(href)}" preserveAspectRatio="xMidYMid meet">${alt}</image>`;
}


// ── the compiler, inlined into the live views ───────────────────────
// The editor re-runs this compiler in the browser, so the module's *text*
// ships with the lecture. Read from disk rather than embedded in a template
// literal, and that is not incidental: a raw backtick anywhere in an inlined
// literal ends it, even inside a comment, and this file is 2,000 lines of
// code full of them. Read as text, that whole class of trap disappears –
// the same reason bundledFaces() reads woff2 out of node_modules.
//
// Two things the wrapping has to get right:
//
// - **`</script` has to be escaped.** The compiler emits a
//   `<script type="application/json">` payload, so the sequence appears in a
//   string literal – and inside an HTML <script> element it closes the
//   element regardless of what JavaScript thinks it is inside of.
// - **The exports become one object**, collected by scanning for the
//   `export` keyword rather than listed by hand. A hand-written list is a
//   second copy of the module's interface, and it would go stale the first
//   time someone exports something new.
const DIAGRAM_CORE_PATH = new URL('./diagram-core.mjs', import.meta.url);
function diagramCoreScript() {
  const text = fs.readFileSync(DIAGRAM_CORE_PATH, 'utf8');
  const names = [...text.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]);
  const plain = text
    .replace(/^export\s+(function|const|let)\s/gm, '$1 ')
    .replace(/<\/(script)/gi, '<\\/$1');
  return `window.PSI_DG = (function () {\n${plain}\nreturn { ${names.join(', ')} };\n})();`;
}
let diagramCoreCache = null;
const diagramCoreJs = () => (diagramCoreCache ??= diagramCoreScript());

// The editor UI and its chrome, same treatment and for the same reason: read
// as text, so a backtick or a regex backslash in it means what it says.
const EDITOR_JS_PATH = new URL('./editor.mjs', import.meta.url);
const EDITOR_CSS_PATH = new URL('./editor.css', import.meta.url);
let editorJsCache = null;
const editorJs = () => (editorJsCache ??= fs.readFileSync(EDITOR_JS_PATH, 'utf8')
  .replace(/<\/(script)/gi, '<\\/$1'));
let editorCssCache = null;
const editorCss = () => (editorCssCache ??= fs.readFileSync(EDITOR_CSS_PATH, 'utf8'));

const dgCore = createDiagramCompiler({
  resolveImage: dgResolveImage,
  imageAspect: dgAspect,
  warn: dgWarn,
  escapeHtml: (s) => escapeHtml(s),
  assetMarkup: dgAssetMarkup,
});
const { parseDiagramSource, layoutDiagram, dgFrameDrawables, renderDiagram } = dgCore;

// Every `::: diagram` block the last build emitted: its byte range in
// source.md and the body it compiled from. The watch server checks a patch
// against this before touching the file – see runWatch.
const dgEmittedBlocks = [];

// Every tag any diagram in the current lecture carries. Collected while the
// blocks compile, ruled on once at the end of parseLecture – see the
// lecture-level tag-default rule there.
const dgLectureTags = new Set();

// Layout runs once per step, so the same complaint would otherwise be
// printed once per frame. Reset per build alongside the compiler's counter.
const dgWarned = new Set();
function dgWarn(msg) {
  if (dgWarned.has(msg)) return;
  dgWarned.add(msg);
  console.warn(`[diagram] ${msg}`);
}

// ── diagram CSS (shared by all four views) ──────────────────────────
// Everything colours through the page's custom properties, so a diagram
// re-inks with the A theme cycle exactly like an inlined SVG asset does.
// The tones are color-mix over --emph and --ink rather than fixed hues:
// four distinguishable fills that stay inside whichever theme is active,
// instead of a palette imported from a slide deck that only worked on one
// background.
const DIAGRAM_CSS = `
.figure-diagram { margin: 0.7em 0; }
.psi-diagram {
  --dg-sans: var(--sans-font, var(--sans));
  --dg-mono: var(--mono-font, var(--mono));
  --dg-serif: var(--body-font, var(--serif));
  display: block; overflow: visible;
  /* Deliberately the same numbers as figure.figure-img svg. A diagram is a
     figure, and figures in this project are sized in viewport space, not
     em space: the drawing has a natural size (its viewBox in px, so the
     unit option is also the nominal on-slide scale), max-width shrinks it
     when it is wider, and the vh cap keeps a tall one from overflowing the
     slide. Diverging here would have made diagrams the one figure kind that
     responds to the zoom key, which reads as a bug rather than a feature. */
  max-width: 100%;
  /* A little taller than figure.figure-img's 50vh. A photo shares the slide
     with a caption and often arrives in portrait; a diagram is landscape and
     is usually the whole point of the chunk, and at 50vh a wide one was
     height-capped hard enough to leave a third of the measure empty beside
     it. */
  max-height: 62vh;
  height: auto;
}
@media print {
  .psi-diagram { max-height: none; }
  /* A diagram is one picture; splitting it across a page break makes it
     two useless halves. */
  .figure-diagram { break-inside: avoid; page-break-inside: avoid; }
}
.psi-diagram .dg-el { transition: opacity 200ms ease; }
.psi-diagram rect, .psi-diagram circle {
  fill: var(--paper); stroke: var(--ink); stroke-width: 1.4; rx: 4px;
}
.psi-diagram .dg-stroke { stroke: var(--ink); stroke-width: 1.4; fill: none; stroke-linejoin: round; }
.psi-diagram .dg-head { fill: var(--ink); stroke: none; }
.psi-diagram text { fill: var(--ink); font-family: var(--dg-sans); font-weight: 400; }
.psi-diagram .dg-mono { font-family: var(--dg-mono); }
/* inline *accent* / ~muted~ inside a label */
.psi-diagram tspan.dg-em { fill: var(--emph); }
.psi-diagram tspan.dg-mu { fill: var(--ink-soft); }
.psi-diagram .dg-off { display: none; }

/* containers are a frame around their members, never a filled panel */
.psi-diagram .dg-container > rect { fill: none; stroke: var(--rule); stroke-width: 1.2; }
.psi-diagram .dg-caption text { fill: var(--ink-soft); }

/* braces have no fill and no head */
.psi-diagram .dg-brace .dg-stroke { stroke: var(--rule); }

/* ── tones ── four theme-safe fills, mixed from the page's own inks ── */
.psi-diagram .tone-1 > rect, .psi-diagram .tone-1 > circle {
  fill: color-mix(in oklab, var(--emph) 13%, var(--paper));
  stroke: color-mix(in oklab, var(--emph) 60%, var(--ink));
}
.psi-diagram .tone-2 > rect, .psi-diagram .tone-2 > circle {
  fill: color-mix(in oklab, var(--ink) 8%, var(--paper)); stroke: var(--ink);
}
.psi-diagram .tone-3 > rect, .psi-diagram .tone-3 > circle {
  fill: color-mix(in oklab, var(--ink) 20%, var(--paper)); stroke: var(--ink);
}
.psi-diagram .tone-4 > rect, .psi-diagram .tone-4 > circle {
  fill: var(--emph); stroke: var(--emph);
}
/* .clear is a see-through interior. .bare removes the *stroke*, so without
   this there was no way to draw a frame you can read through – which is
   what an outline over an image or another element wants. */
.psi-diagram .clear > rect, .psi-diagram .clear > circle { fill: none; }
/* The canvas colour, named. A box already defaults to it, but a box under a
   tinted default block had no way back, and a free text could not have one at
   all. A label with a ground is how it knocks out a line running behind it. */
.psi-diagram .paper > rect, .psi-diagram .paper > circle { fill: var(--paper); }

.psi-diagram .accent > rect, .psi-diagram .accent > circle { stroke: var(--emph); }
.psi-diagram .accent .dg-stroke { stroke: var(--emph); }
.psi-diagram .accent .dg-head { fill: var(--emph); }
.psi-diagram .accent text { fill: var(--emph); }
.psi-diagram .muted > rect, .psi-diagram .muted > circle { stroke: var(--ink-soft); }
.psi-diagram .muted .dg-stroke { stroke: var(--ink-soft); }
.psi-diagram .muted .dg-head { fill: var(--ink-soft); }
.psi-diagram .muted text { fill: var(--ink-soft); }

/* .tone-4 inverts its own label, and that has to win over .accent text:
   accent ink on an accent fill is invisible, legal, and would otherwise be
   decided by which rule was written later. lint.js warns on the pair. */
.psi-diagram .tone-4 text, .psi-diagram .tone-4 tspan { fill: var(--paper); }

/* A free text element draws a ground only where the author gave it a tone.
   The rect is always the same drawable; these two rules are what make "a
   box defaults to paper, a text defaults to see-through" one mechanism rather
   than two. No stroke either way – a bordered label is a box, and there is
   a statement for that. */
.psi-diagram .dg-text > rect { stroke: none; }
.psi-diagram .dg-text:not(.tone-1):not(.tone-2):not(.tone-3):not(.tone-4):not(.paper) > rect { fill: none; }

.psi-diagram .dashed > rect, .psi-diagram .dashed > circle, .psi-diagram .dashed .dg-stroke { stroke-dasharray: 6 4; }
.psi-diagram .dotted > rect, .psi-diagram .dotted > circle, .psi-diagram .dotted .dg-stroke { stroke-dasharray: 1.5 3.5; stroke-linecap: round; }
.psi-diagram .thick > rect, .psi-diagram .thick > circle, .psi-diagram .thick .dg-stroke { stroke-width: 2.6; }
.psi-diagram .bare > rect, .psi-diagram .bare > circle { stroke: none; }
.psi-diagram .round > rect { rx: 13px; }
.psi-diagram .sharp > rect { rx: 0; }
.psi-diagram .bold text { font-weight: 600; }
/* the upright serif, for a label that wants the reading voice rather than
   the diagram's. .hand is the same family forced italic and accented, which
   is the annotation voice and a different thing – until .serif existed the
   family was reachable only through it. */
.psi-diagram .serif text { font-family: var(--dg-serif); }
/* no handwriting face is bundled, so the annotation voice is the serif in
   italic – close enough to read as "written in beside the diagram", and it
   costs no extra font payload. */
.psi-diagram .hand text { font-family: var(--dg-serif); font-style: italic; fill: var(--emph); }

/* .ghost and .dim deliberately do NOT set opacity here. Visibility and the
   two softening classes share one channel, and author CSS beats a
   presentation attribute – so an element pinned at 0.45 by this stylesheet
   could never be hidden, and its show step did nothing at all. Both the
   emitter and the runtime resolve the channel once, in dgOpacity(). */
/* emph / dim are what a step reaches for; both stay inside the palette */
.psi-diagram .emph > rect, .psi-diagram .emph > circle { stroke: var(--emph); stroke-width: 2.6; }
.psi-diagram .emph .dg-stroke { stroke: var(--emph); stroke-width: 2.6; }
.psi-diagram .emph .dg-head { fill: var(--emph); }

.dg-hint { display: none; }
@media (prefers-reduced-motion: reduce) {
  .psi-diagram .dg-el { transition: none; }
}
`;

// ── diagram runtime (inlined into the live views) ───────────────────
// Interpolates the precomputed per-step vectors. There is no layout here
// on purpose: the browser is handed numbers, not a model.
const DIAGRAM_JS = `
const DG_LIST = [];
const DG_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DG_DUR = 380;

function dgApplyVec(el, kind, v) {
  if (kind === 'rect') {
    el.setAttribute('x', v[0]); el.setAttribute('y', v[1]);
    el.setAttribute('width', Math.max(0, v[2])); el.setAttribute('height', Math.max(0, v[3]));
  } else if (kind === 'circle') {
    el.setAttribute('cx', v[0]); el.setAttribute('cy', v[1]); el.setAttribute('r', Math.max(0, v[2]));
  } else if (kind === 'path') {
    let d = '';
    for (let i = 0; i < v.length; i += 2) d += (i ? 'L' : 'M') + v[i] + ' ' + v[i + 1];
    el.setAttribute('d', d + (el.classList.contains('dg-head') ? 'Z' : ''));
  } else {
    el.setAttribute('transform', 'translate(' + v[0] + ',' + v[1] + ')');
  }
}

function dgTargets(d, key) {
  if (d.cache[key]) return d.cache[key];
  // Label wrappers are addressed by data-lab, not by id, because one
  // element can carry several pre-rendered label variants. The attribute
  // holds the full geometry key.
  const list = key.endsWith('--l')
    ? [...d.svg.querySelectorAll('[data-lab="' + key + '"]')]
    : [document.getElementById(d.data.p + key)].filter(Boolean);
  d.cache[key] = list;
  return list;
}

// Discrete state – visibility, classes, which label variant is on – lands
// at once. Only geometry is worth interpolating; a class that fades is a
// class that is wrong for half the transition.
function dgApplyDiscrete(d, frame) {
  for (const id in frame.vis) {
    const g = document.getElementById(d.data.p + id);
    if (!g) continue;
    g.style.opacity = frame.vis[id];
    const base = g.dataset.base || '';
    const extra = frame.cls[id] || '';
    g.setAttribute('class', extra ? base + ' ' + extra : base);
    if (id in frame.lab) {
      d.svg.querySelectorAll('[data-lab="' + id + '--l"]').forEach((w, i) => {
        w.classList.toggle('dg-off', i !== frame.lab[id]);
      });
    }
  }
}

function dgApplyGeom(d, from, to, f) {
  const now = {};
  for (const key in to) {
    const b = to[key];
    const a = from[key] || b;
    const v = new Array(b.length);
    for (let i = 0; i < b.length; i++) {
      const av = a[i] === undefined ? b[i] : a[i];
      v[i] = Math.round((av + (b[i] - av) * f) * 100) / 100;
    }
    now[key] = v;
    const kind = d.data.kinds[key];
    for (const el of dgTargets(d, key)) dgApplyVec(el, kind, v);
  }
  return now;
}

// Paint a frame into a copy of the diagram that is not the live one - the
// speaker's preview thumbnails. Resolves ids inside the given root rather
// than through getElementById, because a clone carries duplicate ids and
// the document would hand back the original every time.
function dgRenderInto(root, d, step) {
  const frame = d.data.frames[Math.max(0, Math.min(d.data.n - 1, step))];
  if (!frame) return;
  for (const id in frame.vis) {
    const g = root.querySelector('[id="' + d.data.p + id + '"]');
    if (!g) continue;
    g.style.opacity = frame.vis[id];
    const base = g.dataset.base || '';
    const extra = frame.cls[id] || '';
    g.setAttribute('class', extra ? base + ' ' + extra : base);
    if (id in frame.lab) {
      root.querySelectorAll('[data-lab="' + id + '--l"]').forEach((w, i) => {
        w.classList.toggle('dg-off', i !== frame.lab[id]);
      });
    }
  }
  for (const key in frame.geom) {
    const els = key.endsWith('--l')
      ? [...root.querySelectorAll('[data-lab="' + key + '"]')]
      : [root.querySelector('[id="' + d.data.p + key + '"]')].filter(Boolean);
    for (const el of els) dgApplyVec(el, d.data.kinds[key], frame.geom[key]);
  }
}

function dgStep(d, step, instant) {
  step = Math.max(0, Math.min(d.data.n - 1, step | 0));
  const frame = d.data.frames[step];
  const same = d.step === step && d.cur;
  d.step = step;
  dgApplyDiscrete(d, frame);
  // The focus card is a *clone* of the figure, ids and all, so every
  // getElementById above reaches the hidden original and the card - the only
  // thing the room can see - never moves. Paint it the same way the
  // speaker's preview thumbnails are painted, by resolving inside that root.
  dgMirrorIntoFocus(d, step);
  if (d.hint) {
    const next = d.data.names[step];
    d.hint.textContent = next ? 'next: ' + next : '';
  }
  if (same) return;
  const from = d.cur || frame.geom;
  cancelAnimationFrame(d.raf);
  if (instant || DG_REDUCED) { d.cur = dgApplyGeom(d, frame.geom, frame.geom, 1); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const f = Math.min(1, (now - t0) / DG_DUR);
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    d.cur = dgApplyGeom(d, from, frame.geom, e);
    if (f < 1) d.raf = requestAnimationFrame(tick);
  };
  d.raf = requestAnimationFrame(tick);
}

// Repaint whatever diagram is currently zoomed into the focus card. Cheap and
// unconditional: one querySelector when nothing is focused.
function dgMirrorIntoFocus(d, step) {
  const card = document.querySelector('#figure-overlay .figure-focus-target');
  if (!card) return;
  const svg = card.querySelector('svg.psi-diagram');
  if (!svg || svg.id !== d.svg.id) return;
  dgRenderInto(svg, d, step);
}

function initDiagrams() {
  document.querySelectorAll('script.psi-diagram-frames').forEach(sc => {
    const svg = document.getElementById(sc.dataset.for);
    if (!svg) return;
    let data;
    try { data = JSON.parse(sc.textContent); } catch (e) { return; }
    // The static viewBox is the print one – tight around the finished
    // picture. A live view has to hold every frame instead, or an element
    // that walks in from outside is clipped for the whole of its journey.
    // Swapped here rather than emitted, so a view with no JavaScript keeps
    // the still it is going to show.
    if (svg.dataset.liveViewbox) {
      svg.setAttribute('viewBox', svg.dataset.liveViewbox);
      const w = Number(svg.getAttribute('width'));
      const r = Number(svg.dataset.liveRatio);
      if (w && r) svg.setAttribute('height', String(Math.round(w * r)));
    }
    const fig = svg.closest('.figure-diagram');
    const d = {
      svg, data, step: -1, raf: 0, cur: null, cache: {},
      hint: fig ? fig.querySelector('.dg-hint') : null,
    };
    svg.psiDiagram = d;
    DG_LIST.push(d);
    dgStep(d, 0, true);
  });
}
`;

// ── parsing ──────────────────────────────────────────────────────────

function parseAttributeTail(text) {
  const m = text.match(/^(.*?)\s*\{([^}]*)\}\s*$/);
  if (!m) return { text: text.trim() };
  const out = { text: m[1].trim() };
  for (const token of m[2].trim().split(/\s+/)) {
    if (token.startsWith('.')) {
      const cls = token.slice(1);
      if (VALID_WIDTHS.has(cls)) out.width = cls;
    } else if (token.startsWith('#')) {
      out.id = token.slice(1);
    }
  }
  return out;
}

function parseTagPrefix(text) {
  const m = text.match(/^([a-z]+):\s*(.*)$/);
  if (m && VALID_TAGS.has(m[1])) {
    return { tag: m[1], ...splitHeading(m[2].trim()) };
  }
  return { ...splitHeading(text.trim()) };
}

// A heading may use `|` to split into two lines: the first line is the
// action/claim ("Make it concurrent"), the second is the qualifier
// ("by swapping the loop for asyncio.gather"). Both render as block
// lines in the chunk heading; the second is typographically quieter.
function splitHeading(text) {
  if (!text.includes('|')) return { heading: text };
  const parts = text.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return { heading: parts[0] || '' };
  return { heading: parts[0], headingSub: parts.slice(1).join(' ') };
}

function parseLecture(src) {
  const { data: frontmatter, content } = matter(src);
  // The lecture-wide diagram layer, parsed once and handed to every block.
  // Validated here rather than at the first diagram, because a lecture whose
  // frontmatter is wrong should say so even when it has no diagram yet.
  dgLectureTags.clear();
  dgEmittedBlocks.length = 0;
  let diagramBase = null;
  if (frontmatter['diagram-defaults'] != null) {
    const { layer, errors } = parseDiagramDefaults(frontmatter['diagram-defaults']);
    if (errors.length) {
      const err = new Error(
        `Frontmatter: diagram-defaults has ${errors.length} problem(s):\n`
        + errors.map(e => `  line ${e.line} of the block: ${e.msg}`).join('\n'));
      err.userFacing = true;
      throw err;
    }
    diagramBase = layer;
  }
  const columns = [];
  let currentColumn = null;
  let currentChunk = null;
  let bodyLines = [];
  let inFence = false;
  let currentExpansion = null; // { label, lines } while inside a ::: expand block
  let noteBlock = null;        // { lines: string[] } – current `> note:` block
  let pendingNotes = [];       // notes that appeared before a chunk, attach to the next one
  let annotBlock = null;       // { lines: string[] } – current `> annot:` block
  let diagramBlock = null;     // { attrs, lines } while inside a ::: diagram block
  let pendingAnnotation = '';  // annotation that appeared before a chunk, attach to the next one
  let layoutStack = [];        // closing HTML tokens for open layout directives

  const flushExpansion = () => {
    if (!currentExpansion || !currentChunk) return;
    currentChunk.expansions.push({
      label: currentExpansion.label,
      kind: currentExpansion.kind,
      body: currentExpansion.lines.join('\n').trim(),
    });
    currentExpansion = null;
  };

  const flushNoteBlock = () => {
    if (!noteBlock) return;
    const text = noteBlock.lines.join('\n').trim();
    if (text) {
      if (currentChunk) currentChunk.speakerNotes.push(text);
      else pendingNotes.push(text);  // orphan – attach to the next chunk
    }
    noteBlock = null;
  };

  const flushAnnotBlock = () => {
    if (!annotBlock) return;
    const text = annotBlock.lines.join('\n').trim();
    if (text) {
      if (currentChunk) {
        currentChunk.annotation = currentChunk.annotation
          ? currentChunk.annotation + '\n\n' + text
          : text;
      } else {
        pendingAnnotation = pendingAnnotation
          ? pendingAnnotation + '\n\n' + text
          : text;
      }
    }
    annotBlock = null;
  };

  const flushChunk = () => {
    if (!currentChunk) return;
    flushNoteBlock();
    flushAnnotBlock();
    flushExpansion();
    // Close any still-open layout directives defensively so the emitted
    // body HTML stays balanced. The linter will flag these separately.
    while (layoutStack.length) bodyLines.push('', layoutStack.pop(), '');
    // Split body at standalone `---` lines into reveal segments (§4.6).
    // A `---` inside a fenced code block stays part of the segment — the
    // `inFence` flag below tracks that.
    const segments = [];
    let cur = [];
    let fence = false;
    for (const line of bodyLines) {
      if (/^```/.test(line)) { fence = !fence; cur.push(line); continue; }
      if (!fence && line.trim() === '---') {
        segments.push(cur.join('\n').trim());
        cur = [];
        continue;
      }
      cur.push(line);
    }
    if (cur.length) segments.push(cur.join('\n').trim());
    const nonEmpty = segments.filter(s => s.length);
    currentChunk.segments = nonEmpty;
    // Print collapses reveals: `body` is every segment joined, so the
    // print renderer can stay oblivious to the reveal split.
    currentChunk.body = nonEmpty.join('\n\n');
    currentColumn.chunks.push(currentChunk);
    currentChunk = null;
    bodyLines = [];
  };

  // Where each line starts in source.md, frontmatter included. A diagram
  // block carries the byte range of its body into the output (§11.4 of
  // editor.md), which is what the editor patches through the watch socket –
  // and getting it wrong does not throw, it writes into the wrong part of
  // the file. matter() hands back `content` with the frontmatter already
  // stripped, so an offset into it is not an offset into the file; fmOffset
  // is the difference, measured rather than assumed.
  let fmOffset = src.length - content.length;
  if (src.slice(fmOffset) !== content) {
    const at = src.indexOf(content);
    fmOffset = at >= 0 ? at : 0;
  }
  let lineAt = 0;
  for (const line of content.split('\n')) {
    const lineStart = lineAt;
    lineAt += line.length + 1;
    // A diagram body is its own little language, so it is captured
    // verbatim – ahead of the fence tracker, the note matcher and the
    // directive table. Nothing inside it is markdown.
    if (diagramBlock) {
      if (/^:::\s*$/.test(line)) {
        const target = currentExpansion ? currentExpansion.lines : bodyLines;
        const dgBody = diagramBlock.lines.join('\n');
        dgEmittedBlocks.push({
          range: [diagramBlock.bodyAt, diagramBlock.bodyAt + dgBody.length],
          body: dgBody,
          chunk: currentChunk ? currentChunk.id : null,
        });
        target.push('', renderDiagram(dgBody, diagramBlock.attrs, {
          // The block body's byte range in source.md. Emitted with the
          // diagram so the editor can patch exactly those bytes back.
          range: [diagramBlock.bodyAt, diagramBlock.bodyAt + dgBody.length],
          chunk: currentChunk ? currentChunk.id : null,
          width: currentChunk ? currentChunk.width : null,
          where: currentChunk && currentChunk.id ? `chunk #${currentChunk.id}` : 'a chunk with no id',
          alt: currentChunk ? currentChunk.heading : '',
          base: diagramBase,
          onCompile: (model) => { for (const tag of model.tags.keys()) dgLectureTags.add(tag); },
        }), '');
        diagramBlock = null;
      } else {
        diagramBlock.lines.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) inFence = !inFence;

    if (!inFence) {
      const h1 = line.match(/^#\s+(.*)$/);
      const h2 = line.match(/^##\s+(.*)$/);

      if (h1) {
        flushChunk();
        const { text, id } = parseAttributeTail(h1[1]);
        currentColumn = { heading: text, id, chunks: [] };
        columns.push(currentColumn);
        continue;
      }

      if (h2) {
        flushChunk();
        if (!currentColumn) {
          // A chunk before any `# Column` (e.g. the title chunk).
          currentColumn = { heading: null, id: null, chunks: [] };
          columns.push(currentColumn);
        }
        const { text, width, id } = parseAttributeTail(h2[1]);
        const { tag, heading, headingSub } = parseTagPrefix(text);
        currentChunk = {
          tag,
          heading,
          headingSub,
          width: width || 'standard',
          id,
          expansions: [],
          speakerNotes: pendingNotes,
          annotation: pendingAnnotation,
        };
        pendingNotes = [];
        pendingAnnotation = '';
        continue;
      }

      // Speaker-note blockquotes. `> note: ...` opens a note block; any
      // following `> ...` continuation lines extend the same block until
      // a non-blockquote line ends it. Notes appearing before any chunk
      // are buffered in pendingNotes and attached to the next chunk (so
      // e.g. a `> note:` placed right under a column header still lands
      // on the first chunk of that column). Stripped from audience + print.
      //
      // `> annot: ...` is the parallel mechanism for *public* per-chunk
      // annotations — text the lecturer typed live in the audience
      // annotation-box and then exported back into source. It prefills
      // the audience textarea and renders as a "Presentation Note" block
      // in print.
      const noteOpen = line.match(/^>\s*note:\s*(.*)$/i);
      const annotOpen = line.match(/^>\s*annot:\s*(.*)$/i);
      if (noteOpen) {
        flushNoteBlock();
        flushAnnotBlock();
        noteBlock = { lines: [noteOpen[1]] };
        continue;
      }
      if (annotOpen) {
        flushNoteBlock();
        flushAnnotBlock();
        annotBlock = { lines: [annotOpen[1]] };
        continue;
      }
      if (noteBlock) {
        const noteCont = line.match(/^>\s?(.*)$/);
        if (noteCont) { noteBlock.lines.push(noteCont[1]); continue; }
        flushNoteBlock();
        // fall through: this non-> line still needs normal handling
      }
      if (annotBlock) {
        const annotCont = line.match(/^>\s?(.*)$/);
        if (annotCont) { annotBlock.lines.push(annotCont[1]); continue; }
        flushAnnotBlock();
        // fall through: this non-> line still needs normal handling
      }

      if (currentChunk) {

        // ::: expand <label>  or  ::: margin  –  open an aside block.
        // Both are modeled as expansions for the print renderer; the
        // audience view will distinguish them later (expansions get a
        // chevron, margins sit in the left lane).
        const expandOpen = line.match(/^:::\s+expand\s+(.+?)\s*$/);
        const marginOpen = /^:::\s+margin\s*$/.test(line);
        if (expandOpen || marginOpen) {
          flushExpansion();
          currentExpansion = {
            label: expandOpen ? expandOpen[1].trim() : 'note',
            kind: marginOpen ? 'margin' : 'expand',
            lines: [],
          };
          continue;
        }

        // Layout directives – inserted as literal HTML blocks into the
        // body (or expansion body) so marked's html_block passthrough
        // renders them as wrappers around the authored markdown.
        //   ::: cols 2 / cols 3  – CSS column-count multi-column flow
        //   ::: side             – 2-pane grid; switch panes with ::: flip
        //   ::: flip             – mid-marker of a ::: side pair
        //   ::: marginalia       – aside that extends into the right margin
        //   ::: slide            – explicit on-screen content (§4.5)
        //   ::: script          – explicit narration, hidden on screen (§4.5)
        //   :::                  – closes the innermost layout (or expansion)
        const target = currentExpansion ? currentExpansion.lines : bodyLines;
        const colsOpen = line.match(/^:::\s+cols\s+(2|3)\s*$/);
        if (colsOpen) {
          target.push('', `<div class="cols cols-${colsOpen[1]}">`, '');
          layoutStack.push('</div>');
          continue;
        }
        if (/^:::\s+side\s*$/.test(line)) {
          target.push('', `<div class="side"><div class="side-a">`, '');
          layoutStack.push('</div></div>');
          continue;
        }
        if (/^:::\s+flip\s*$/.test(line)) {
          target.push('', `</div><div class="side-b">`, '');
          continue;
        }
        if (/^:::\s+marginalia\s*$/.test(line)) {
          target.push('', `<aside class="marginalia">`, '');
          layoutStack.push('</aside>');
          continue;
        }
        // ::: embed <url> – a hosted player (YouTube, Vimeo). Deliberately
        // its own directive and never the meaning of a bare link or asset:
        // it is the one construct in the format that makes an output fetch
        // from a third party at run time, so the author has to say it.
        // Body lines become the caption.
        const embedOpen = line.match(/^:::\s+embed\s+(\S+)\s*$/);
        if (embedOpen) {
          target.push('', renderEmbedOpen(embedOpen[1]), '');
          layoutStack.push('</figcaption></figure>');
          continue;
        }
        // ::: diagram – a boxes-and-arrows figure written in the diagram
        // DSL and compiled to inline SVG at build time. Like ::: embed it
        // earns its own directive rather than overloading a fence, because
        // the body is not markdown and must not be parsed as any.
        const diagramOpen = line.match(/^:::\s+diagram\s*(?:\{([^}]*)\})?\s*$/);
        if (diagramOpen) {
          diagramBlock = { attrs: diagramOpen[1] || '', lines: [], bodyAt: fmOffset + lineAt };
          continue;
        }
        // Explicit-slide mode (§4.5). These two are the escape hatch from
        // topic-sentence extraction: instead of deriving what the projector
        // shows from the shape of the prose, the author states it outright.
        //   ::: slide   – this, and only this, is on screen when collapsed
        //   ::: script  – everything *but* this is on screen when collapsed
        // Both are plain wrappers; the whole mode lives in CSS (see the
        // [data-collapse=topic-bold] rules), so there is no new runtime
        // state, no new sync field, and no third entry in the C cycle.
        if (/^:::\s+slide\s*$/.test(line)) {
          target.push('', `<div class="slide-explicit">`, '');
          layoutStack.push('</div>');
          continue;
        }
        if (/^:::\s+script\s*$/.test(line)) {
          target.push('', `<div class="script-only">`, '');
          layoutStack.push('</div>');
          continue;
        }
        // :::  –  closes the innermost open layout, or the expansion.
        if (/^:::\s*$/.test(line)) {
          if (layoutStack.length) {
            target.push('', layoutStack.pop(), '');
            continue;
          }
          if (currentExpansion) {
            flushExpansion();
            continue;
          }
        }
      }
    }

    if (currentChunk) {
      if (currentExpansion) currentExpansion.lines.push(line);
      else bodyLines.push(line);
    }
  }
  if (diagramBlock) {
    // Everything after the opener was read as diagram source, so the chunks
    // below it simply vanished from all four outputs. Exiting 0 on that is
    // the worst possible answer.
    const err = new Error(
      '::: diagram was never closed. Everything after it was read as diagram\n'
      + 'source, so any chunk below it is missing from the output. Add a\n'
      + 'closing ::: line.');
    err.userFacing = true;
    throw err;
  }
  flushChunk();

  // The lecture-level counterpart of the block's "no element carries @tag".
  // The build has now seen every diagram, so it can say exactly this: a
  // frontmatter default that targets a tag nothing in the lecture carries is
  // a typo, and a typo that only costs you the styling is invisible.
  if (diagramBase) {
    const orphan = diagramBase.tagDefaults.filter(d => !dgLectureTags.has(d.tag));
    if (orphan.length) {
      const err = new Error(
        'Frontmatter: diagram-defaults targets tags no diagram in this lecture carries:\n'
        + orphan.map(d => `  line ${d.line}: default ${d.kind} @${d.tag}`).join('\n')
        + (dgLectureTags.size
          ? `\n  Tags this lecture does use: ${[...dgLectureTags].sort().map(t => '@' + t).join(', ')}`
          : '\n  No diagram in this lecture carries any tag.'));
      err.userFacing = true;
      throw err;
    }
  }

  return { frontmatter, columns };
}

// ── rendering ────────────────────────────────────────────────────────

// Live-reload snippet for --watch mode. The build threads opts.watchPort
// into each renderer; a non-null port emits this <script> just before
// </head>. Production builds receive opts.watchPort = null and the
// renderers emit nothing, keeping the output a static file.
function reloadScript(port, nonce) {
  if (!port) return '';
  // Two-way now. The reload half is unchanged; the other half is what the
  // diagram editor writes back through, and it is deliberately the *same*
  // socket: source.md stays the single source of truth, the normal rebuild
  // runs on the write, and every open tab reloads.
  return `<script>
window.psiWatch = (() => {
  let sock = null;
  let seq = 0;
  const waiting = new Map();
  const connect = () => {
    const ws = new WebSocket('ws://127.0.0.1:${port}');
    sock = ws;
    ws.addEventListener('message', e => {
      if (e.data === 'reload') { location.reload(); return; }
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      // Any *-result carrying an id we are waiting on. The patch protocol
      // was the first; the asset ones ride the same pairing rather than
      // growing a second mechanism beside it.
      if (m && typeof m.type === 'string' && m.type.endsWith('-result') && waiting.has(m.id)) {
        waiting.get(m.id)(m);
        waiting.delete(m.id);
      }
    });
    ws.addEventListener('close', () => { sock = null; setTimeout(connect, 500); });
  };
  connect();
  const ask = (type, body, ms) => new Promise((resolve) => {
    if (!sock || sock.readyState !== 1) return resolve({ ok: false, why: 'the watch socket is not connected' });
    const id = ++seq;
    waiting.set(id, resolve);
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); resolve({ ok: false, why: 'no answer from the watch server' }); } }, ms || 4000);
    sock.send(JSON.stringify({ type, id, nonce: window.psiWatch.nonce, ...body }));
  });
  return {
    nonce: ${JSON.stringify(nonce || '')},
    ready: () => !!(sock && sock.readyState === 1),
    patch: (range, text, was) => ask('patch', { range, text, was }),
    // Everything in assets/ beside source.md, so the picker can offer files
    // no diagram references yet. Costs no payload: the socket is already here.
    assets: () => ask('assets', {}),
    // Bytes in, a file in assets/ out. Base64 because the socket is JSON.
    // Larger timeout: this one writes.
    putAsset: (name, dataB64, replace) => ask('asset', { name, data: dataB64, replace }, 15000),
  };
})();
</script>`;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Slide-number badge. Each digit gets its own <i> so the CSS can stack
// them with flex-direction: column without relying on writing-mode +
// text-orientation, which renders inconsistently across sans fonts
// (some glyphs end up rotated when text-orientation: upright is set).
function renderChunkNumBadge(num, tag = 'div') {
  if (!num) return '';
  const digits = String(num).split('').map(d => `<i>${d}</i>`).join('');
  return `<${tag} class="chunk-num" aria-hidden="true">${digits}</${tag}>`;
}

// Serialize a value for inline <script> injection. Plain JSON would let
// a title containing `</script>` close the tag and inject arbitrary HTML;
// escaping `<` as a unicode escape blocks that path and stays valid JSON.
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003C');
}

function lectureTitle(frontmatter) {
  return frontmatter.title || 'Untitled lecture';
}

// The document language. It is not decoration: the browser's hyphenation
// dictionary is chosen by it, so `lang: de` is what makes the print view
// break German words correctly instead of not at all. Screen readers and
// spell-checkers key off the same attribute.
function lectureLang(frontmatter = {}) {
  const raw = String(frontmatter.lang || 'en').trim();
  // BCP-47 shape, loosely: a primary subtag plus optional refinements.
  // Loose on purpose – this is a gate against typos like `lang: german`,
  // not an attempt to own the registry.
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw)) {
    const err = new Error(
      `Frontmatter: "lang: ${raw}" is not a language tag.\n` +
      `  Expected something like: en, de, de-DE, en-GB, fr.`
    );
    err.userFacing = true;
    throw err;
  }
  return raw;
}

// ── viewer defaults from frontmatter ─────────────────────────────────
// An author can pin how a lecture opens: font, theme, collapse mode,
// auto-fit, slide numbers. Precedence is deliberate and one sentence long:
// a key that is present wins over the reader's stored preference, and a key
// that is absent leaves that preference alone. So the default behaviour is
// unchanged for the lectures that say nothing (font and theme keep
// following the reader across lectures), and an author who has designed a
// particular look gets it without having to ask the reader to press keys.
// Theme names in cycle order (hotkey A). One source of truth: the runtime's
// THEME_CYCLE, the frontmatter validator and the pre-paint boot script are
// all interpolated from here, so adding a theme is a one-line change.
const THEME_NAMES = [
  'light-red', 'light-teal', 'light-blue', 'light-orange',
  'dark', 'terminal-amber', 'terminal-green',
];
// Which of them want dark chrome. Drives body[data-mode], which the surface
// overrides key off – see the dark-surfaces block in AUDIENCE_CSS.
const DARK_THEME_NAMES = ['dark', 'terminal-amber', 'terminal-green'];

const VIEW_DEFAULT_SPEC = [
  ['font',          'font',      ['serif', 'sans', 'mono']],
  ['theme',         'theme',     THEME_NAMES],
  ['collapse',      'collapse',  ['topic-bold', 'none']],
  ['auto-fit',      'autoFit',   ['true', 'false']],
  ['slide-numbers', 'slideNums', ['vertical', 'horizontal', 'off']],
  // Where the diagram editor ships. Not a look but a payload, so it follows
  // `fonts: none` in spirit and the viewer-default machinery in mechanism –
  // an unknown value fails the build rather than quietly costing the lecture
  // its editor. `both` is the default; `speaker` keeps it out of the
  // projection; `none` ships neither the compiler nor the UI.
  ['editor',        'editor',    ['both', 'speaker', 'none']],
];
function viewDefaults(frontmatter = {}) {
  const out = {};
  for (const [fmKey, stateKey, allowed] of VIEW_DEFAULT_SPEC) {
    if (!(fmKey in frontmatter)) continue;
    const raw = String(frontmatter[fmKey]).trim();
    if (!allowed.includes(raw)) {
      // Hard-fail rather than ignore. A typo in a viewer default is silent
      // by nature – the lecture still builds and still looks fine, it just
      // looks like the author never set anything.
      const err = new Error(
        `Frontmatter: "${fmKey}: ${raw}" is not a value this key accepts.\n` +
        `  Valid values for ${fmKey}: ${allowed.join(', ')}`
      );
      err.userFacing = true;
      throw err;
    }
    out[stateKey] = stateKey === 'autoFit' ? raw === 'true' : raw;
  }
  return out;
}
// Body attributes for a live view, so the first paint already has the
// author's font and theme. applyFontTheme() would correct them at boot, but
// only after a visible flash of the built-in defaults.
function viewBodyAttrs(defaults, extra = '') {
  const theme = defaults.theme || 'light-red';
  const parts = [
    `data-collapse="${defaults.collapse || 'topic-bold'}"`,
    extra,
    `data-font="${defaults.font || 'serif'}"`,
    `data-theme="${theme}"`,
    `data-mode="${DARK_THEME_NAMES.includes(theme) ? 'dark' : 'light'}"`,
    `data-slide-nums="${defaults.slideNums || 'vertical'}"`,
  ].filter(Boolean);
  return parts.join(' ');
}

// Resolve the theme before the first paint. Without this, a reader whose
// system is set to dark, or who last chose a dark theme, gets a white flash
// while the module-level runtime boots and only then corrects the attribute.
// Emitted as the first child of <body>: a synchronous script blocks
// rendering, and document.body already exists by then.
//
// Precedence, and it is the same sentence as everywhere else in this file:
// a frontmatter key wins over the reader's stored preference, which wins
// over the operating system's. When the author pinned the theme there is
// nothing to resolve, so no script is emitted at all.
function themeBootScript(defaults) {
  if (defaults.theme) return '';
  return `<script>
(function () {
  var names = ${JSON.stringify(THEME_NAMES)};
  var dark = ${JSON.stringify(DARK_THEME_NAMES)};
  var d = document.body.dataset;
  var set = function (t) { d.theme = t; d.mode = dark.indexOf(t) >= 0 ? 'dark' : 'light'; };
  try {
    var stored = localStorage.getItem('psi-slides:theme');
    if (stored && names.indexOf(stored) >= 0) { set(stored); return; }
  } catch (e) {}
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) set('dark');
})();
</script>`;
}

function splitInfo(info = '') {
  return String(info).split('\n').map(l => l.trim()).filter(Boolean);
}

function renderTitleBlock({ title, presenter, info, bodyHtml }) {
  const infoLines = bodyHtml
    ? null // chunk body overrides `info` (PRD §3 rules)
    : splitInfo(info);
  return `
    <h1 class="title-main">${escapeHtml(title || '')}</h1>
    ${presenter ? `<p class="title-presenter">${escapeHtml(presenter)}</p>` : ''}
    ${infoLines
      ? `<div class="title-info">${infoLines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
      : (bodyHtml || '')}
  `.trim();
}

// Chunk headings carry inline Markdown, most usefully code spans: a heading
// like "Loops | for, while, and `enumerate`" is common, and escaping it
// wholesale rendered the backticks literally in all four views. parseInline
// gives code spans, emphasis, and links without wrapping the result in <p>;
// it escapes text itself, so no double-escaping. Falls back to plain
// escaping if marked ever chokes on a heading.
function renderInlineMd(text) {
  const raw = text || '';
  try {
    return marked.parseInline(raw);
  } catch (e) {
    return escapeHtml(raw);
  }
}

function renderHeadingHtml(chunk, cls = 'chunk-heading') {
  if (!chunk.heading && !chunk.headingSub) return '';
  const main = renderInlineMd(chunk.heading);
  if (!chunk.headingSub) return `<h2 class="${cls}">${main}</h2>`;
  const sub = renderInlineMd(chunk.headingSub);
  // Space between spans so the print renderer (which uses display:inline
  // for the subline) keeps a readable gap; audience uses flex-column and
  // the space collapses under `gap: 0.1em`.
  return `<h2 class="${cls} has-sub"><span class="hd-main">${main}</span> <span class="hd-sub">${sub}</span></h2>`;
}

function renderChunk(chunk, frontmatter, num, opts = {}) {
  const { tag, body = '', id, width, expansions = [], annotation = '', speakerNotes = [] } = chunk;
  const bodyHtml = body ? marked.parse(body) : '';

  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
  const numAttr = num ? ` data-chunk-num="${num}"` : '';
  const numHtml = renderChunkNumBadge(num, 'span');

  if (tag === 'title') {
    // Title chunk's heading text and sub-heading are intentionally ignored:
    // the cover renders from frontmatter (`title`, `presenter`, `info`) so
    // there's a single source of truth. Authors write `## title: {#title}`
    // with an empty heading by convention; the body, if non-empty, overrides
    // the `info` lines (PRD §3, §4.4).
    return `<article class="chunk chunk-title"${numAttr}${idAttr}>
  ${numHtml}
  ${renderTitleBlock({ ...frontmatter, bodyHtml })}
</article>`;
  }

  // `figure:` is self-evident from the artwork; eyebrow would just stack a
  // third label above the heading + sub-heading.
  const labelTag = tag && tag !== 'free' && tag !== 'figure' ? tag : null;
  const label = labelTag
    ? `<span class="chunk-label">${escapeHtml(labelTag)}</span>`
    : '';

  const classes = [
    'chunk',
    `chunk-${tag || 'free'}`,
    `width-${width}`,
  ].join(' ');

  const expansionsHtml = expansions.map(e => {
    const inner = marked.parse(e.body || '');
    const kind = e.kind || 'expand';
    return `<aside class="chunk-expansion chunk-expansion-${kind}" data-label="${escapeHtml(e.label)}">
${inner}
</aside>`;
  }).join('\n');

  const annotationHtml = annotation.trim()
    ? `<aside class="presentation-note">
<span class="presentation-note-label">Presentation Note</span>
<div class="presentation-note-body">${marked.parse(annotation)}</div>
</aside>`
    : '';

  const notesHtml = (opts.withNotes && speakerNotes.length)
    ? `<aside class="speaker-note">
<span class="speaker-note-label">Speaker Note</span>
<div class="speaker-note-body">${speakerNotes.map(n => marked.parse(n)).join('\n')}</div>
</aside>`
    : '';

  return `<article class="${classes}"${idAttr}${numAttr}>
  ${numHtml}
  ${label}
  ${renderHeadingHtml(chunk)}
  ${bodyHtml}
  ${expansionsHtml}
  ${annotationHtml}
  ${notesHtml}
</article>`;
}

function renderColumn(col, frontmatter, nextNum, chunkOpts = {}) {
  const chunksHtml = col.chunks.map(c => renderChunk(c, frontmatter, nextNum ? nextNum() : undefined, chunkOpts)).join('\n');
  if (!col.heading) {
    return `<section class="column column-anon">\n${chunksHtml}\n</section>`;
  }
  const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
  return `<section class="column"${idAttr}>
  <h1 class="column-heading">${escapeHtml(col.heading)}</h1>
${chunksHtml}
</section>`;
}

function renderToc(columns) {
  const items = columns
    .filter(c => c.heading)
    .map(c => `<li><a href="#${escapeHtml(c.id || '')}">${escapeHtml(c.heading)}</a></li>`)
    .join('\n    ');
  if (!items) return '';
  return `<nav class="toc" aria-label="Contents">
  <h2>Contents</h2>
  <ol>
    ${items}
  </ol>
</nav>`;
}

// The per-figure asset table is the only heavy part of the diagram payload
// and the only part that is no use without the editor: it is the markup for
// every image the figure holds, which for an inlined raster is the whole
// data: URI a second time. Print never has an editor, and neither does a
// live view of a lecture that declined one, so both drop it.
//
// A regex on a well-known element rather than surgery inside the JSON: the
// class name is the contract, and the script has no nested markup to trip on
// because the emitter escapes every `<` in it.
function stripDiagramAssets(html) {
  return html.replace(
    /<script type="application\/json" class="psi-diagram-assets"[^>]*>[^<]*<\/script>/g, '');
}

function renderDocument(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  const toc = renderToc(columns);
  // Single monotonic counter shared across anon + named columns so
  // the print numbers match the audience's chunk-num badges 1:1.
  let chunkCounter = 0;
  const nextNum = () => ++chunkCounter;
  // Title / anon columns render above the TOC (cover page first),
  // named columns render after (body of the document).
  const chunkOpts = { withNotes: !!opts.withNotes };
  const anonHtml = stripDiagramAssets(columns.filter(c => !c.heading)
    .map(c => renderColumn(c, frontmatter, nextNum, chunkOpts)).join('\n'));
  const namedHtml = stripDiagramAssets(columns.filter(c => c.heading)
    .map(c => renderColumn(c, frontmatter, nextNum, chunkOpts)).join('\n'));

  const titleSuffix = opts.withNotes ? 'print + notes' : 'print';
  // Print has no keyboard, so the frontmatter is its only say over the
  // slide-number markers. The other viewer defaults are live-view concepts
  // (collapse, auto-fit) or already fixed here (print has its own type).
  const printNums = viewDefaults(frontmatter).slideNums || 'vertical';
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – ${titleSuffix}</title>
<style>
${PRINT_CSS}
${DIAGRAM_CSS}
</style>
${fontStyleTag(opts.fontEmbed)}
${katexStyleTag(anonHtml + namedHtml)}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body data-slide-nums="${printNums}">
<main>
${anonHtml}
${toc}
${namedHtml}
</main>
</body>
</html>
`;
}

// ── print CSS ────────────────────────────────────────────────────────

const PRINT_CSS = `
:root {
  --ink: #1f1f24;
  --ink-soft: #6b6b72;
  --paper: #fafaf7;
  --rule: #c8c8c0;
  --emph: #8b2e00;
  /* Same three families as the live views, and the same order, so all four
     outputs are one typographic set. The first entry of each is bundled and
     embedded, so these resolve even where the machine has nothing installed
     and even in Safari, which does not expose installed fonts to a page. */
  --serif: 'Literata', 'Source Serif 4', Georgia, serif;
  --sans: 'Inter Tight', 'Inter', system-ui, sans-serif;
  --mono: 'JetBrains Mono', Menlo, monospace;
}

@page {
  size: A4;
  margin: 2.2cm 2.5cm 2.8cm;
  @bottom-center {
    content: counter(page);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 8pt;
    color: #888;
  }
}

* { box-sizing: border-box; }
html { font-family: var(--serif); font-size: 10pt; color: var(--ink); line-height: 1.6; background: var(--paper); text-rendering: optimizeLegibility; }
body { margin: 0; }

main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; }

h1, h2, h3 { font-weight: 500; letter-spacing: -0.01em; break-after: avoid; page-break-after: avoid; }
p { margin: 0.4em 0 0.9em; orphans: 3; widows: 3; }

/* Hyphenation. Only in the document views: a hyphenated word on a
   projection reads badly, and the live views reflow constantly anyway.
   The browser picks its dictionary from the lang attribute on html, which
   comes from the frontmatter lang key – so this does nothing useful for a
   German lecture until the author sets lang: de, and German is exactly the
   case where a 42rem measure needs it most.
   Limited to prose: hyphenating an identifier in code, a heading, or a URL
   would be actively wrong, and the hyphens property is inherited.
   (No backticks in this comment: one would end the template literal.) */
p, li, blockquote, figcaption, .speaker-note {
  hyphens: auto;
  -webkit-hyphens: auto;
  /* Keep a two-letter stub off the next line where the browser supports it. */
  hyphenate-limit-chars: 6 3 3;
}
h1, h2, h3, h4, code, pre, pre *, .chunk-num, a[href^="http"] {
  hyphens: manual;
  -webkit-hyphens: manual;
}
strong { color: var(--emph); font-weight: 600; }
em { font-style: italic; }

ul, ol { margin: 0.4em 0 0.9em 1.4em; }
li { margin: 0.2em 0; orphans: 2; widows: 2; }
li > p:first-child { margin-top: 0; }
li > p:last-child { margin-bottom: 0.3em; }

code { font-family: var(--mono); font-size: 0.92em; }
pre {
  font-family: var(--mono);
  font-size: 0.85em;
  background: rgba(0,0,0,0.04);
  padding: 0.8em 1em;
  overflow-x: auto;
  border-radius: 2px;
  line-height: 1.45;
}
pre code { font-size: inherit; }

table {
  border-collapse: collapse;
  margin: 0.6em 0 1.1em;
  font-size: 0.92em;
  line-height: 1.4;
  break-inside: avoid;
  page-break-inside: avoid;
}
th, td {
  padding: 0.35em 0.7em;
  border: 0.5pt solid var(--rule);
  text-align: left;
  vertical-align: top;
}
th { font-weight: 600; color: var(--emph); border-bottom-width: 1pt; }

a { color: inherit; text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 0.15em; }
a:hover { text-decoration-color: var(--ink); }

.toc {
  margin: 0 0 4rem;
  padding: 1.2rem 0 1.8rem;
  border-bottom: 0.5pt solid var(--rule);
  page-break-after: always;
}
.toc h2 {
  font-family: var(--sans);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
  font-weight: 500;
  margin: 0 0 0.8rem;
}
.toc ol { list-style: decimal; padding-left: 2em; }
.toc li { margin: 0.4em 0; font-size: 1rem; }
.toc a { text-decoration: none; }

.column { margin: 0 0 2rem; }
.column-anon { margin-top: 0; }
.column-heading {
  font-size: 1.9rem;
  margin: 3.5rem 0 1.8rem;
  padding-top: 1.2rem;
  padding-bottom: 0.4rem;
  border-top: 1.5pt solid var(--ink);
  border-bottom: 0.5pt solid var(--rule);
  break-after: avoid;
  page-break-after: avoid;
}

.chunk {
  margin: 1.6rem 0 2.2rem;
  page-break-inside: avoid;
  break-inside: avoid;
  position: relative;
}
.chunk-heading {
  font-size: 1.12rem;
  margin: 0 0 0.5rem;
  break-after: avoid;
  page-break-after: avoid;
}
.chunk-label {
  display: block;
  font-family: var(--sans);
  font-variant-caps: all-small-caps;
  font-size: 0.82rem;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  margin: 0 0 0.15rem;
}
/* Unobtrusive slide number in the outer margin, aligned with the chunk
   heading. Sits to the left of the text column so it never disturbs
   line wrap; vertical writing mode keeps the marker thin against tall
   chunks and matches the audience badge orientation. */
.chunk-num {
  position: absolute;
  top: 0;
  left: -2.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--sans);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  color: var(--ink-soft);
  opacity: 0.55;
}
.chunk-num i { font-style: normal; }
.chunk-title .chunk-num { display: none; }
/* Mirrors the live views: the frontmatter key travels into print too, so a
   lecture that turns the markers off does not get them back in the handout. */
body[data-slide-nums=horizontal] .chunk-num { flex-direction: row; gap: 0.08em; }
body[data-slide-nums=off] .chunk-num { display: none; }

.chunk-principle {
  border-top: 2.5pt solid var(--ink);
  padding-top: 1rem;
  margin-top: 2.8rem;
}
.chunk-principle .chunk-heading { font-size: 1.25rem; }
.chunk-principle p { font-size: 1.05rem; }

.chunk-definition {
  border-top: 0.5pt solid var(--rule);
  padding-top: 0.7rem;
}

.chunk-question {
  margin: 2.5rem 0;
  padding: 0.8rem 0;
}
.chunk-question .chunk-heading {
  font-size: 1.5rem;
  font-style: italic;
}

.chunk-exercise .chunk-heading { font-style: italic; }
.chunk-exercise .chunk-label { color: var(--emph); }

/* Math (PRD §2). Print has no collapse, so both inline and display formulas
   simply render. Display math stays centred and is allowed to scroll rather
   than widen the text column, which would break the page for PDF export. */
.katex { font-size: 1.05em; color: inherit; }
.math-display { margin-block: 0.9em; overflow-x: auto; overflow-y: hidden; }
.math-display .katex-display { margin: 0; }
.math-display .katex { font-size: 1.15em; }
.math-error { color: var(--emph); font-family: var(--mono, ui-monospace, monospace); }

.chunk-figure .chunk-heading {
  font-family: var(--sans);
  font-size: 0.82rem;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
  margin-top: 0.8rem;
  order: 2;
}
.chunk-figure pre { background: transparent; padding: 0; margin: 0 0 0.4rem; }

/* Expansions (::: expand <label>) inlined into the print stream. */
.chunk-expansion {
  margin: 1.1rem 0 0.6rem;
  padding: 0.1rem 0 0.1rem 1.1rem;
  border-left: 1.5pt solid var(--rule);
  color: var(--ink-soft);
  font-size: 0.96em;
}
.chunk-expansion::before {
  content: attr(data-label);
  display: block;
  font-family: var(--sans);
  font-variant-caps: all-small-caps;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  margin: 0 0 0.25rem;
}
.chunk-expansion > :first-child { margin-top: 0; }
.chunk-expansion > :last-child { margin-bottom: 0; }
.chunk-expansion strong { color: var(--ink); }

/* Chunk-attached asides. Two flavors share layout and differ only in color:
   .presentation-note (warm) – live annotation typed during the lecture
     and committed back via "> annot:" integration.
   .speaker-note (cool) – author-written "> note:" text, emitted only by
     the print-with-notes target. */
.presentation-note,
.speaker-note {
  margin: 0.9rem 0 0.4rem;
  padding: 0.45rem 0.8rem;
  border-left: 2pt solid var(--note-border);
  background: var(--note-bg);
  color: var(--ink);
  font-size: 0.92em;
}
.presentation-note-label,
.speaker-note-label {
  display: inline-block;
  font-family: var(--sans);
  font-variant-caps: all-small-caps;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  color: var(--note-label);
  margin-right: 0.4em;
}
.presentation-note-body,
.speaker-note-body { display: inline; }
.presentation-note-body > :first-child,
.speaker-note-body > :first-child { display: inline; margin: 0; }
.presentation-note-body > :first-child + *,
.speaker-note-body > :first-child + * { margin-top: 0.35em; }
.presentation-note-body > :last-child,
.speaker-note-body > :last-child { margin-bottom: 0; }
.presentation-note {
  --note-border: oklch(0.72 0.12 80);
  --note-bg:     oklch(0.985 0.014 80);
  --note-label:  oklch(0.48 0.1 80);
}
.speaker-note {
  --note-border: oklch(0.66 0.1 240);
  --note-bg:     oklch(0.97 0.018 240);
  --note-label:  oklch(0.46 0.09 240);
}

/* Title slide: lower-left-third per PRD §4.4 */
/* The document opens with its title, not with a screen of paper. This block
   used to be a full-height cover with the title pinned to the bottom edge –
   right for a printed title page, wrong for the thing people actually look
   at, which is print.html in a browser: you opened a document and saw
   nothing. The cover treatment now lives in @media print, where it belongs,
   and the screen gets an ordinary masthead. */
.chunk-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0 0 1.8rem;
  margin: 0 0 2.6rem;
  border-bottom: 1px solid var(--rule);
  page-break-after: always;
  page-break-inside: avoid;
}
.chunk-title .title-main {
  font-size: 2.6rem;
  margin: 0 0 0.8rem;
  line-height: 1.15;
}
.chunk-title .title-presenter {
  font-size: 1.1rem;
  margin: 0 0 1.2rem;
  color: var(--ink);
}
.chunk-title .title-info p {
  margin: 0.12em 0;
  font-family: var(--sans);
  font-size: 0.88rem;
  color: var(--ink-soft);
}

/* Two-line action heading – the sub-line reads like a subtitle in
   print, italicized and quieter. The space between the spans (see
   renderHeadingHtml) keeps the two lines separated visually when
   they collapse inline. */
.chunk-heading.has-sub .hd-main { display: block; }
.chunk-heading.has-sub .hd-sub {
  display: block;
  font-weight: 400;
  font-size: 0.82em;
  font-style: italic;
  color: var(--ink-soft);
  font-family: var(--sans);
  margin-top: 0.05em;
  letter-spacing: -0.005em;
}
/* Code spans inside a heading (renderInlineMd) – keep them upright and a
   touch smaller so an identifier does not outweigh the heading itself. */
.chunk-heading code {
  font-family: var(--mono);
  font-size: 0.86em;
  font-style: normal;
  font-weight: inherit;
  margin: 0 0.09em;
}

/* Layout primitives reflow to linear prose in print. The goal is a
   readable document: columns collapse, side panes stack, marginalia
   sits inline as a quiet aside. */
.cols, .cols-2, .cols-3 { column-count: auto; }
.cols { margin: 0.8em 0 1.05em; }
.cols > p, .side-a > p, .side-b > p { margin: 0.4em 0 0.9em; }
.side { display: block; margin: 0.8em 0 1.05em; }
.side-a, .side-b { display: block; }
.side-a { margin-bottom: 0.2em; }
.marginalia {
  display: block;
  margin: 0.8em 0;
  padding: 0.1rem 0 0.1rem 1.1rem;
  border-left: 1.5pt solid var(--rule);
  color: var(--ink-soft);
  font-size: 0.95em;
}
.marginalia > :first-child { margin-top: 0; }
.marginalia > :last-child { margin-bottom: 0; }

/* Explicit-slide blocks (§4.5). Print shows both halves in source order –
   it is the reading copy, and losing either would defeat the point. The
   slide block keeps a hairline marker so a reader can tell what the room
   actually saw; the script block is the narration around it. */
.slide-explicit {
  margin: 0.5em 0;
  padding-left: 0.9rem;
  border-left: 1.5pt solid var(--rule);
}
.slide-explicit > :first-child { margin-top: 0; }
.slide-explicit > :last-child { margin-bottom: 0; }
.script-only { margin: 0.4em 0; }

/* Baseline: any raw <img> (e.g. direct-path Markdown images that bypass
   the figure.figure-img wrapper) is constrained to the page measure so
   high-resolution screenshots cannot overflow A4. */
img { max-width: 100%; height: auto; }

/* figure-img: single-column figure with caption below. Both <img> and
   inlined <svg> need an explicit max-width — SVGs spliced via
   inlineSvg() preserve their intrinsic width="…" attribute and would
   otherwise overflow the page measure. */
figure.figure-img { margin: 1rem 0; text-align: center; }
/* A clip renders as a real player in the reading copy too – print.html is
   an HTML document people read in a browser, and only an actual paper print
   loses the video, which nothing can help. */
figure.figure-video { margin: 1rem 0; text-align: center; }
figure.figure-video video { max-width: 100%; height: auto; }
/* An embed in the reading copy: the frame still works in a browser, and the
   address underneath is what survives on paper. */
figure.figure-embed { margin: 1rem 0; text-align: center; }
figure.figure-embed .embed-frame { aspect-ratio: 16 / 9; width: 100%; background: #eee; }
figure.figure-embed .embed-frame iframe { width: 100%; height: 100%; border: 0; }
figure.figure-embed .embed-source { font-family: var(--sans); font-size: 0.72rem; color: var(--ink-soft); margin-top: 0.3rem; overflow-wrap: anywhere; }
@media print {
  /* A frame prints as an empty rectangle; the address is the useful part. */
  figure.figure-embed .embed-frame { display: none; }
  figure.figure-embed .embed-source { font-size: 0.8rem; }
}
figure.figure-img img,
figure.figure-img svg { max-width: 100%; height: auto; }
figure.figure-img figcaption {
  font-family: var(--sans);
  font-size: 0.78rem;
  color: var(--ink-soft);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
  margin-top: 0.3em;
}
figure.figure-missing {
  border: 1px dashed #c88a7e;
  color: #8b2e00;
  font-family: var(--mono);
  padding: 0.8em 1em;
}

/* Shiki code blocks in print: transparent background, inline color */
pre.shiki { background: transparent !important; padding: 0; margin: 0.4em 0 0.9em; }
pre.shiki code { font-size: inherit; }
/* Force inline on .line: white-space:pre already breaks lines via the
   \n text nodes shiki leaves between spans. Block would double the gap. */
pre.shiki .line { display: inline; }

/* Width classes are a live-view concern; in print the column runs
   at a single reading measure. We still expose them on the DOM for
   future CSS. */

@media print {
  body { background: white; }
  main { padding: 0; max-width: none; }
  a { text-decoration: none; color: inherit; }
  /* On paper it is a cover page again: fills the sheet, title sitting in
     the lower third (PRD §4.4), no rule under it. */
  .chunk-title {
    min-height: 24cm;
    justify-content: flex-end;
    padding: 0 0 12vh;
    margin: 0;
    border-bottom: 0;
  }
  pre { background: rgba(0,0,0,0.03); }
}

@media screen {
  body { padding: 0; }
  main { padding-top: 4rem; }
}
`;

// ── audience rendering ───────────────────────────────────────────────

// Expansion labels resolve to a fixed vocabulary of chevron
// abbreviations. The label string in source is free-form and
// descriptive (e.g. "format-spec", "None-vs-False"); the chevron
// only shows one of the canonical categories from PRD §2, which
// keeps the UI readable and honest about what kind of aside the
// student is about to open. Unknown labels fall back to "Exp" –
// "this is an explanation" – never to a truncated slug.
function abbrevForLabel(label) {
  const l = String(label || '').toLowerCase();
  if (!l) return 'Exp';
  if (l.startsWith('exa')) return 'Ex';
  if (l.startsWith('exp') || l.startsWith('det') || l.startsWith('deep')) return 'Exp';
  if (l.startsWith('ref') || l.startsWith('cit') || l.startsWith('bib')) return 'Ref';
  if (l.startsWith('ans') || l.startsWith('sol')) return '?';
  if (l.startsWith('pro')) return 'Pf';
  if (l.startsWith('fig') || l.startsWith('dia')) return 'Fig';
  if (l.startsWith('cod')) return '{}';
  if (l.startsWith('set')) return 'Set';
  if (l.startsWith('note') || l.startsWith('n.b') || l.startsWith('nb')) return 'N.B.';
  if (l.startsWith('asi') || l.startsWith('asd')) return 'ASD';
  if (l.startsWith('war') || l.startsWith('cav') || l.startsWith('pit')) return '!';
  return 'Exp';
}

function renderTitleChunk(chunk, frontmatter, num) {
  const idAttr = chunk.id ? ` id="${escapeHtml(chunk.id)}"` : '';
  const chunkId = chunk.id || 'title';
  const bodyHtml = (chunk.body || '').trim() ? marked.parse(chunk.body) : '';
  const numAttr = num ? ` data-chunk-num="${num}"` : '';
  const numHtml = renderChunkNumBadge(num, 'div');
  return `<article class="chunk chunk-title" data-tag="title" data-width="full" data-chunk-id="${escapeHtml(chunkId)}"${numAttr}${idAttr}>
  <div class="chunk-content">
    ${renderTitleBlock({ ...frontmatter, bodyHtml })}
  </div>
  ${numHtml}
</article>`;
}

function renderAudienceChunk(chunk, frontmatter, colIdx, chunkIdx, num) {
  if (chunk.tag === 'title') return renderTitleChunk(chunk, frontmatter, num);

  const { tag, heading, segments = [], id, width, expansions = [], annotation = '' } = chunk;
  const chunkId = id || `c${colIdx}-${chunkIdx}`;
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

  // No tag eyebrow on the projection. The word announced a taxonomy that is
  // right only as often as the author's tag choice was, and a slide labelled
  // PRINCIPLE that is not one reads as a mistake to the room. The tag still
  // does its work – rule above, type scale, spacing, lint budget – it just
  // stops naming itself. The document renderer keeps the label, where a
  // reader scanning a long text does benefit from the taxonomy.
  const tagLabel = '';

  // Each reveal segment becomes its own block; first one is visible by
  // default, the rest carry data-hidden so the JS can reveal them one
  // by one with Space (§4.6). If a chunk has zero segments (empty body),
  // nothing renders for the body.
  const segmentsHtml = segments.map((seg, i) => {
    const inner = marked.parse(seg || '');
    const hidden = i === 0 ? '' : ' data-hidden';
    return `<div class="reveal-segment" data-seg="${i}"${hidden}>${inner}</div>`;
  }).join('\n');

  const headingHtml = renderHeadingHtml(chunk);

  // Margin expansions render as a quiet, always-visible side note; expand
  // expansions get chevrons that the JS wires up to the expanded grid.
  const expandList = expansions.filter(e => (e.kind || 'expand') === 'expand');
  const marginList = expansions.filter(e => e.kind === 'margin');

  const marginsHtml = marginList.map(e => {
    const inner = marked.parse(e.body || '');
    return `<aside class="margin-note" data-label="${escapeHtml(e.label)}">${inner}</aside>`;
  }).join('\n');

  const chevsHtml = expandList.length
    ? `<div class="exps">${expandList.map((e, i) =>
      `<button class="exp-chev" type="button" data-exp="${i}">
         <span>${escapeHtml(abbrevForLabel(e.label))}</span>
         <span class="caret">›</span>
       </button>`).join('')}</div>`
    : '';

  const expBodiesHtml = expandList.map((e, i) => {
    const inner = marked.parse(e.body || '');
    return `<aside class="exp-body" data-exp-body="${i}">
      <div class="tag-label">${escapeHtml(e.label)}</div>
      ${inner}
    </aside>`;
  }).join('\n');

  const classes = [
    'chunk',
    `chunk-${tag || 'free'}`,
  ].join(' ');

  const widthAttr = ` data-width="${escapeHtml(width || 'standard')}"`;
  const tagAttr = tag ? ` data-tag="${escapeHtml(tag)}"` : '';
  const numAttr = num ? ` data-chunk-num="${num}"` : '';
  const numHtml = renderChunkNumBadge(num, 'div');

  return `<article class="${classes}"${idAttr} data-chunk-id="${escapeHtml(chunkId)}"${tagAttr}${widthAttr}${numAttr}>
  <div class="chunk-content">
    ${tagLabel}
    ${headingHtml}
    <div class="chunk-body">${segmentsHtml}</div>
    ${marginsHtml}
    <aside class="annot-box" data-annot-for="${escapeHtml(chunkId)}">
      <div class="annot-box-label">annotation · ${escapeHtml(chunkId)}</div>
      <textarea class="annot-textarea" placeholder="Note… (Enter for newline, Esc to exit)" rows="1">${escapeHtml(annotation)}</textarea>
    </aside>
    <button class="annot-add" type="button" data-annot-add>+ note</button>
  </div>
  ${chevsHtml}
  ${expBodiesHtml}
  ${numHtml}
</article>`;
}

// A column with `# Heading {#id}` opens with a section-divider slide so
// the audience/speaker camera lands on the heading before the first
// chunk. Print already renders col.heading as a static `<h1>`; here we
// need it as its own `.chunk` so flatChunks (the navigator) sees it.
function renderColumnSectionChunk(col, ci) {
  const chunkId = col.id ? `${col.id}-section` : `__section-c${ci}`;
  return `<article class="chunk chunk-section" data-tag="section" data-width="full" data-chunk-id="${escapeHtml(chunkId)}">
  <div class="chunk-content">
    <h1 class="section-heading">${escapeHtml(col.heading)}</h1>
  </div>
</article>`;
}

// Shared audience/speaker column shell. Both stage the same flat-chunk
// markup; only the per-view head/chrome differs.
//
// A monotonic chunk counter is threaded across every authored chunk so
// each slide can render a corner badge with its global number. Section
// dividers are auto-inserted, not authored, and stay unnumbered – this
// keeps audience numbering aligned with print.
function renderColumnsHtml(columns, frontmatter) {
  let num = 0;
  return columns.map((col, ci) => {
    const sectionHtml = col.heading ? renderColumnSectionChunk(col, ci) : '';
    const chunks = col.chunks
      .map((c, xi) => {
        num += 1;
        return renderAudienceChunk(c, frontmatter, ci, xi, num);
      })
      .join('\n');
    const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
    return `<section class="column" data-col="${ci}"${idAttr}>
${sectionHtml}
${chunks}
</section>`;
  }).join('\n');
}

// The overview badge + search input is identical in both live views;
// keeping it a single constant means label/hotkey changes land once.
const OVERVIEW_BADGE_HTML = `<div id="overview-badge">
  <span class="hint">overview · drag pans · wheel zooms · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> selects · click or <kbd>O</kbd>/<kbd>Enter</kbd> lands · <kbd>/</kbd> search · <kbd>Esc</kbd> leaves</span>
</div>`;

// Search moved out of the overview badge into its own panel so it can be
// opened from anywhere, and so a hit can be shown as a readable line
// (heading plus the sentence it matched) instead of only as a highlight on
// a board the reader may not be looking at. Same markup in both live views.
// Shown while the projection is blanked. In the speaker window it is the
// only sign that the room sees black, so it has to say how to undo that.
const BLANK_BADGE_HTML = `<div id="blank-badge" class="hidden" role="status">BLANK<span> &middot; hit B to toggle</span></div>`;

// Shift-clicking a link puts its address on both screens, large enough to
// copy down. See the runtime section for why the room gets the URL to read
// rather than a browser tab to watch.
const LINK_OVERLAY_HTML = `<div id="link-overlay" class="hidden" role="dialog" aria-label="Link address">
  <div id="link-overlay-inner">
    <div id="link-overlay-label"></div>
    <a id="link-overlay-url" target="_blank" rel="noopener noreferrer"></a>
    <div id="link-overlay-qr" aria-hidden="true"></div>
    <div id="link-overlay-hint">scan it, or click the address to open it &middot; Esc closes</div>
  </div>
</div>`;

const SEARCH_PANEL_HTML = `<div id="search-panel" class="hidden" role="dialog" aria-label="Search slides">
  <input id="search-input" type="text" placeholder="search the lecture..." autocomplete="off" spellcheck="false" aria-controls="search-results">
  <ul id="search-results" role="listbox"></ul>
  <div id="search-foot"><kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> go · <kbd>Esc</kbd> close</div>
</div>`;

// Keyboard + mouse reference, opened with ? (or the corner button) in both
// live views. Grouped by task rather than by key, because the thing a
// lecturer forgets mid-talk is "how do I make the notes bigger", not "what
// does V do". Mouse gestures are listed alongside the keys – several of the
// most useful ones (resize the notes pane, click a figure to zoom, drag to
// pan) have no key at all and were previously undiscoverable.
function renderHelpOverlay(view, withEditor) {
  const shared = [
    ['Moving around', [
      ['<kbd>←</kbd> <kbd>→</kbd>', 'previous / next column'],
      ['<kbd>↑</kbd>', 'previous chunk'],
      ['<kbd>↓</kbd> · <kbd>Space</kbd>', 'reveal the next segment, then on to the next chunk'],
      ['<kbd>Enter</kbd> · <kbd>1</kbd>–<kbd>9</kbd>', 'open the first / n-th expansion'],
      ['<kbd>Esc</kbd>', 'step back out: figure, then overview, then expansion'],
    ]],
    ['Finding a slide', [
      ['<kbd>O</kbd>', 'overview – the whole lecture on one board (letter O, not zero)'],
      ['drag · wheel', 'pan the board · zoom the board'],
      ['click a slide', 'go there and leave the board'],
      ['<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>', 'move the selection (the board follows)'],
      ['<kbd>O</kbd> · <kbd>Enter</kbd>', 'land on the selected slide'],
      ['<kbd>/</kbd>', 'search – opens from anywhere, see below'],
      ['<kbd>T</kbd>', 'column list'],
    ]],
    ['Searching', [
      ['<kbd>/</kbd>', 'open the search panel, in overview or on a slide'],
      ['type', 'matching slides are listed with the sentence they matched'],
      ['<kbd>↑</kbd> <kbd>↓</kbd>', 'pick a hit (the overview board follows along)'],
      ['<kbd>Enter</kbd> · click', 'go to that slide'],
      ['<kbd>Esc</kbd>', 'close without moving'],
    ]],
    ['On the slide', [
      ['click a figure or code block', 'zoom it into a centred card'],
      ['drag · wheel · <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd>', 'pan · zoom · reset the zoomed card'],
      ['click a marginalia', 'pan the camera onto the aside'],
      ['drag the slide', 'pan within a chunk that is taller than the screen'],
      ['hold <kbd>Alt</kbd> and drag', 'select text to copy – dragging pans again once you let go'],
      ['click a link', 'opens it in a new tab of this window'],
      ['<kbd>Shift</kbd>-click a link', 'puts the address on both screens, big enough to write down'],
      ['<kbd>Esc</kbd>', 'back to the whole slide'],
    ]],
    ['Reading knobs', [
      ['<kbd>C</kbd>', 'collapse: what the room sees ↔ the full text'],
      ['<kbd>F</kbd>', 'font: serif → sans → mono'],
      ['<kbd>A</kbd>', 'theme: four light accents, a neutral dark, two phosphor modes'],
      ['<kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd>', 'text size, and zero resets it (kept separately for each collapse mode)'],
      ['<kbd>#</kbd>', 'auto-fit: size every slide to the screen, on or off'],
      ['<kbd>L</kbd>', 'slide numbers: stacked → in a row → off'],
      ['<kbd>B</kbd>', 'blank the projection – the speaker window keeps working, frozen or not'],
      ['<kbd>Shift</kbd>-any', 'cycle that knob backwards'],
    ]],
  ];
  const speakerOnly = [
    ['Arranging this window', [
      ['<kbd>Shift</kbd>-<kbd>V</kbd>', 'preview strip: along the bottom ↔ down the right edge'],
      ['drag the bar above the notes', 'resize the notes pane; the slide preview rescales to fit'],
      ['the hatched block on a slide', 'what the next Space or ↓ will reveal – cockpit only'],
      ['drag the bar on the preview strip', 'resize the strip, either orientation'],
      ['<kbd>&minus;</kbd> <kbd>+</kbd> in the notes corner', 'notes text size (no hotkey – you type in there)'],
      ['double-click either bar', 'back to automatic size'],
      ['drag the preview strip', 'scroll it · click a thumbnail to jump'],
    ]],
    ['Notes', [
      ['<kbd>Shift</kbd>-<kbd>N</kbd>', 'private notes for this chunk – never shown to the room'],
      ['<kbd>N</kbd>', 'annotation on the slide itself – the room sees you type'],
      ['<kbd>Shift</kbd>-<kbd>E</kbd>', 'copy annotations out as Markdown for source.md'],
      ['<kbd>Esc</kbd> in a note', 'back to the slide, so the arrows work again'],
    ]],
    ['The projector', [
      ['<kbd>V</kbd>', 'freeze the projection – the room holds this slide while you move on'],
      ['<kbd>V</kbd> again', 'live again, and the room catches up to where you are now'],
      ['move the mouse over the stage', 'laser pointer on the projector'],
    ]],
  ];
  // The editor's own section, from the one table in editor.md §4.2. Emitted
  // only where the editor ships, so a lecture without diagrams does not
  // advertise a modal it does not carry.
  const editorKeys = ['The diagram editor', [
    ['click a diagram, then <kbd>E</kbd>', 'open the editor on that figure – or the button in the corner of the card'],
    ['<kbd>1</kbd> <kbd>V</kbd>', 'select'],
    ['<kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>8</kbd>', 'box · dot · text · edge · image'],
    ['<kbd>9</kbd>', 'a plain line – the edge tool with both ends forced to coordinates'],
    ['<kbd>6</kbd> · <kbd>7</kbd>', 'container · brace, drawn around whatever is selected'],
    ['<kbd>Q</kbd>', 'keep the current tool instead of falling back to select'],
    ['drag · drag a handle', 'move it · resize it – the status bar shows the line it will write'],
    ['arrows · <kbd>Shift</kbd>-arrows', 'nudge the selection, fine · coarse'],
    ['<kbd>Ctrl</kbd> while dragging', 'suspend snapping, for when 0.5847 is meant'],
    ['<kbd>Delete</kbd>', 'delete, after listing what refers to it'],
    ['<kbd>Ctrl</kbd>-<kbd>Z</kbd> · <kbd>Shift</kbd>-<kbd>Ctrl</kbd>-<kbd>Z</kbd>', 'undo · redo'],
    ['<kbd>Ctrl</kbd>-<kbd>A</kbd> · <kbd>Ctrl</kbd>-<kbd>D</kbd>', 'select all · duplicate'],
    ['<kbd>Ctrl</kbd>-<kbd>C</kbd> · <kbd>Ctrl</kbd>-<kbd>V</kbd> · <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>V</kbd>', 'copy · paste · paste in place'],
    ['<kbd>Ctrl</kbd>-<kbd>S</kbd>', 'copy the finished block to the clipboard'],
    ['<kbd>Space</kbd>-drag · middle-drag · wheel', 'pan · pan · zoom'],
    ['<kbd>F</kbd>', 'frame: slide → column → print, the three places the figure can land'],
    ['<kbd>,</kbd> <kbd>.</kbd> · <kbd>PageUp</kbd> <kbd>PageDown</kbd>', 'previous / next figure in the lecture'],
    ['<kbd>O</kbd>', 'the figure board'],
    ['<kbd>Shift</kbd>-<kbd>V</kbd>', 'flip the figure strip between the bottom and the right edge'],
    ['<kbd>Esc</kbd>', 'step back out: deselect, then the select tool, then close'],
  ]];
  const otherWindows = ['The other windows', [
    ...(view === 'speaker' ? [] : [['<kbd>S</kbd>', 'open the speaker cockpit – both windows then stay in sync']]),
    ['<kbd>P</kbd>', 'open the print view in a new tab'],
    ['<kbd>?</kbd>', 'this panel'],
  ]];
  const groups = view === 'speaker'
    ? [...speakerOnly, ...shared, ...(withEditor ? [editorKeys] : []), otherWindows]
    : [...shared, ...(withEditor ? [editorKeys] : []), otherWindows];

  // Both columns are static author-written HTML (kbd markup and en-dashes),
  // never user content, so they go through verbatim.
  const sections = groups.map(([title, rows]) => `    <section>
      <h3>${title}</h3>
      <dl>
${rows.map(([k, v]) => `        <dt>${k}</dt><dd>${v}</dd>`).join('\n')}
      </dl>
    </section>`).join('\n');

  return `<div id="help-overlay" class="hidden" role="dialog" aria-label="Keyboard and mouse reference" aria-modal="false">
  <div id="help-inner">
    <header>
      <h2>psi-slides · ${view === 'speaker' ? 'speaker cockpit' : 'audience view'}</h2>
      <span class="help-dismiss"><kbd>?</kbd> or <kbd>Esc</kbd> closes</span>
    </header>
    <div class="help-grid">
${sections}
    </div>
  </div>
</div>
<button id="help-button" type="button" aria-label="Keyboard and mouse reference" title="Keyboard and mouse reference (?)">?</button>`;
}

function renderTocNav(columns) {
  const items = columns
    .map((c, i) => ({ c, i }))
    .filter(x => x.c.heading)
    .map(x => `<li data-toc-col="${x.i}"><button type="button">${escapeHtml(x.c.heading)}</button></li>`)
    .join('\n    ');
  return `<nav id="toc" aria-label="Contents">
  <h2>Contents</h2>
  <ol>
    ${items}
  </ol>
</nav>`;
}

// Whether this lecture's live views carry the diagram editor, and therefore
// the compiler's text. Two conditions, both cheap: the lecture has to contain
// a diagram at all – the same rule the KaTeX stylesheet follows, which is
// emitted only into views that contain a formula – and the author has to not
// have declined it.
function editorPayload(frontmatter, columnsHtml, view) {
  const want = viewDefaults(frontmatter).editor || 'both';
  if (want === 'none') return '';
  if (want === 'speaker' && view !== 'speaker') return '';
  if (!columnsHtml.includes('class="psi-diagram"')) return '';
  // The lecture-wide `default` layer, as text, parsed in the browser by the
  // same function the build uses. It is the same for every figure, so it is
  // emitted once here rather than repeated in each figure's payload – and
  // without it the in-browser compiler resolves a *different* four-layer
  // stack than the build did, which is a differently-styled figure and, for
  // an element whose `w` comes from a lecture default, a block that does not
  // compile at all.
  const base = frontmatter['diagram-defaults'] != null
    ? String(frontmatter['diagram-defaults']) : '';
  return `<style>\n${editorCss()}\n</style>\n`
    + `<script>\n${diagramCoreJs()}\n`
    + `window.PSI_DG_DEFAULTS = ${jsonForScript(base)};\n`
    + `${editorJs()}\n</script>`;
}

function renderAudience(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  let columnsHtml = renderColumnsHtml(columns, frontmatter);
  if (!editorPayload(frontmatter, columnsHtml, 'audience')) columnsHtml = stripDiagramAssets(columnsHtml);
  const titleJson = jsonForScript(title);
  const defaults = viewDefaults(frontmatter);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – lecture</title>
<style>
${AUDIENCE_CSS}
${DIAGRAM_CSS}
</style>
${fontStyleTag(opts.fontEmbed)}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body ${viewBodyAttrs(defaults)}>
${themeBootScript(defaults)}
<div id="stage-viewport">
  <div id="stage">
${columnsHtml}
  </div>
</div>
<div id="laser-pointer" aria-hidden="true"></div>
<div id="figure-overlay" aria-hidden="true"></div>
<nav id="touch-controls" aria-label="Slide controls">
  <button type="button" data-action="prev" aria-label="Previous">‹</button>
  <button type="button" data-action="next" aria-label="Next">›</button>
  <button type="button" data-action="overview" aria-label="Overview">⊞</button>
  <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
  <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
</nav>
${renderHelpOverlay('audience', !!editorPayload(frontmatter, columnsHtml, 'audience'))}
<div id="mode-badge"></div>
${OVERVIEW_BADGE_HTML}
${SEARCH_PANEL_HTML}
${BLANK_BADGE_HTML}
${LINK_OVERLAY_HTML}
${renderTocNav(columns)}
<script>
const LECTURE_TITLE = ${titleJson};
const VIEW_DEFAULTS = ${jsonForScript(defaults)};
const LINK_QR = ${jsonForScript(linkQrMap(columnsHtml))};
${DIAGRAM_JS}
${AUDIENCE_JS}
</script>
${editorPayload(frontmatter, columnsHtml, 'audience')}
</body>
</html>
`;
}

// ── audience CSS ─────────────────────────────────────────────────────

const AUDIENCE_CSS = `
:root {
  --ink-l:       0.20;
  --ink-soft-l:  0.62;
  --ink:        oklch(var(--ink-l) 0.01 260);
  --ink-soft:   oklch(var(--ink-soft-l) 0.01 260);
  --paper:      oklch(0.98 0.00 0);
  --paper-warm: oklch(0.96 0.01 90);
  --rule:       oklch(0.78 0.00 0);
  --emph:       oklch(0.42 0.16 30);

  --zoom: 1.35;
  --dim: 0.86;
  --camera-duration: 250ms;
  --slide-pad-x: 14%;
  /* Slide-internal sizes all derive from --slide-h so content layout is
     pixel-identical across views. --slide-w / --slide-h hold the AUDIENCE
     reference dimensions: in audience that's window.innerW/H; in speaker
     it's the audience's reported dimensions (postMessage). The speaker
     then applies transform: scale(--stage-scale) to fit this full-size
     slide into its narrower cell. This keeps font-size, padding, and
     text wrap identical on both sides – essential for laser-pointer
     coordinates to land correctly. */
  --slide-w: 100vw;
  --slide-h: 100vh;
  --stage-scale: 1;
  --slide-pad-y: calc(var(--slide-h) * 0.049);
  --slide-height: calc(var(--slide-h) * 0.4);
  --chunk-gap: calc(var(--slide-h) * 0.04);
  /* Interpolated from FONT_STACK_TAILS so an embedded family can be
     prepended to the very same list – see the embedded-webfonts section. */
  --serif-stack: ${FONT_STACK_TAILS.serif};
  --sans-stack:  ${FONT_STACK_TAILS.sans};
  /* Readable mono ("iA Writer"-style): prefer the Duo/Quattro faces if
     present, fall back to JetBrains Mono and system monospace. The iA
     fonts are free-to-use (SIL) when self-hosted; here we treat them
     as an opportunistic upgrade if the user installed them locally. */
  --read-mono-stack: 'iA Writer Duo V', 'iA Writer Duospace', 'iA Writer Quattro V',
                     'JetBrains Mono', 'Berkeley Mono', 'SF Mono', ui-monospace,
                     Menlo, monospace;
  --body-font: var(--serif-stack);
  --sans-font: var(--sans-stack);
  --mono-font: ${FONT_STACK_TAILS.mono};
  --bold-weight: 500;
}

/* ── Font family switch (hotkey F) ───────────────────────────────
   Three reading faces, cycled by the audience/speaker runtime. The
   switch is on <body> via data-font, so it persists across reloads
   when we mirror it into localStorage. Default: serif. */
body[data-font=serif] { --body-font: var(--serif-stack); }
body[data-font=sans]  { --body-font: var(--sans-stack); --bold-weight: 600; }
body[data-font=mono]  {
  --body-font: var(--read-mono-stack);
  --bold-weight: 600;
  /* Reading mono slides are visually denser; loosen line-height a hair. */
  line-height: 1.55;
}

/* ── Maths follows the font toggle (hotkey F) ─────────────────────
   With the body in sans or mono, formulas set in KaTeX's serif faces read
   as a different document embedded in the slide. KaTeX ships sans and
   typewriter families, so the letterforms can follow.

   Two things make this safe. It is applied only to the classes that carry
   *letterforms* – italic variables (.mathnormal) and ordinary symbols
   (.mord) – never to operators, relations or delimiters, whose glyphs live
   in Main and the Size families and have no sans equivalent. And it is a
   font *stack*, not a replacement: a glyph missing from the sans face falls
   back per character to the family KaTeX would have used anyway, which is
   exactly the desired behaviour and costs nothing when it does not happen. */
body[data-font=sans] .katex .mord,
body[data-font=sans] .katex .mathnormal {
  font-family: KaTeX_SansSerif, KaTeX_Main, KaTeX_Math;
}
body[data-font=mono] .katex .mord,
body[data-font=mono] .katex .mathnormal {
  font-family: KaTeX_Typewriter, KaTeX_Main, KaTeX_Math;
}

/* ── Theme / accent cycle (hotkey A) ──────────────────────────────
   Four light-mode accent variants plus two terminal/CRT dark modes.
   Paper/ink/rule/emph are all re-derived per theme so shadows, dims,
   and hairlines pick up the new colors automatically via var(). */
body[data-theme=light-red]    { --emph: oklch(0.42 0.16 30); }
body[data-theme=light-teal]   { --emph: oklch(0.52 0.12 195); }
body[data-theme=light-blue]   { --emph: oklch(0.48 0.18 250); }
body[data-theme=light-orange] { --emph: oklch(0.58 0.17 60);  }

/* Neutral dark mode – grey paper, white ink, the light-red accent lifted
   until it carries on a dark ground. Distinct from the terminal modes on
   purpose: those are a single phosphor tone with code colour suppressed,
   this one is an ordinary reading theme that happens to be dark, so syntax
   highlighting and the accent keep working. */
body[data-theme=dark] {
  --paper:      oklch(0.17 0.005 260);
  --paper-warm: oklch(0.22 0.008 260);
  --ink:        oklch(0.95 0 0);
  --ink-soft:   oklch(0.68 0.01 260);
  --rule:       oklch(0.38 0.01 260);
  --emph:       oklch(0.76 0.15 35);
}

/* Terminal modes – black paper, amber or phosphor-green ink.
   Dim opacity stays via --dim, shiki colors get suppressed (see below)
   so the whole slide reads as a single foreground color. */
body[data-theme=terminal-amber] {
  --paper:      oklch(0.12 0.02 60);
  --paper-warm: oklch(0.18 0.03 60);
  --ink:        oklch(0.82 0.14 75);
  --ink-soft:   oklch(0.60 0.10 75);
  --rule:       oklch(0.35 0.06 60);
  --emph:       oklch(0.94 0.18 85);
}
body[data-theme=terminal-green] {
  --paper:      oklch(0.11 0.02 150);
  --paper-warm: oklch(0.17 0.03 150);
  --ink:        oklch(0.80 0.20 145);
  --ink-soft:   oklch(0.58 0.12 145);
  --rule:       oklch(0.33 0.06 150);
  --emph:       oklch(0.92 0.24 145);
}

/* In terminal modes, neutralise shiki's baked-in token colors so the
   code reads in a single phosphor tone. The !important is necessary
   because shiki emits inline style="color:#..." per span. Fonts stay
   mono regardless of the body font choice. */
body[data-theme^=terminal] .chunk-body pre.shiki,
body[data-theme^=terminal] .chunk-body pre.shiki *,
body[data-theme^=terminal] .exp-body pre.shiki,
body[data-theme^=terminal] .exp-body pre.shiki * {
  color: var(--ink) !important;
  background: transparent !important;
}
body[data-theme^=terminal] .chunk-body pre.shiki,
body[data-theme^=terminal] .exp-body pre.shiki { background: var(--paper-warm) !important; padding: 0.5em 0.8em; }
/* Inline code and the shiki inline span inherit current color too. */
body[data-theme^=terminal] .chunk-body code,
body[data-theme^=terminal] .exp-body code { color: var(--emph); }
/* Exp-body card gets a slightly lighter background than paper so it
   still reads as a frame in terminal mode. */
body[data-theme^=terminal] .chunk.expanded .exp-body.on { background: var(--paper-warm); }
body[data-theme^=terminal] #stage-viewport { background: var(--paper); }
body[data-mode=dark] #stage-viewport { background: var(--paper); }

/* ── Dark chrome ─────────────────────────────────────────────────
   The panels around the slide were written against paper: fixed
   near-white backgrounds for the help sheet, the TOC, search, and the
   cockpit footer. Keyed on data-mode rather than on the theme name, so
   the terminal modes inherit the fix – they had exactly the same problem
   and only the help-sheet kbd had ever been patched. */
body[data-mode=dark] #help-inner kbd { background: var(--paper-warm); color: var(--ink); }
body[data-mode=dark] #help-button {
  background: oklch(from var(--paper) calc(l + 0.08) c h / 0.85);
  color: var(--ink-soft);
}
body[data-mode=dark] nav#toc,
body[data-mode=dark] #search-panel {
  background: oklch(from var(--paper) calc(l + 0.04) c h / 0.97);
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body-font);
  font-size: clamp(20px, calc(var(--slide-h) * 0.026), 38px);
}
/* Disable text selection in the live views: drag pans the stage and
   accidentally selecting prose mid-lecture is a constant
   micro-distraction. Print keeps selection for copy-paste. Textareas
   and inputs re-enable it so annotations/notes remain editable. */
html, body { user-select: none; -webkit-user-select: none; }
textarea, input, [contenteditable=true] {
  user-select: text;
  -webkit-user-select: text;
}
/* Hold Alt and the stage becomes selectable – see the runtime comment for
   why this is a held modifier rather than a mode. The cursor change is the
   only signal that it worked, so it is not optional. */
body.text-selecting #stage,
body.text-selecting #stage * {
  user-select: text;
  -webkit-user-select: text;
}
body.text-selecting #stage { cursor: text; }
::selection { background: color-mix(in oklch, var(--emph) 30%, transparent); }

/* stage */
#stage-viewport {
  position: relative;
  width: var(--slide-w);
  height: var(--slide-h);
  overflow: hidden;
  background: var(--paper);
}
#stage {
  position: absolute;
  top: 0; left: 0;
  display: flex;
  align-items: stretch;
  gap: calc(var(--slide-w) * 0.08);
  transform-origin: 0 0;
  transition: transform var(--camera-duration) cubic-bezier(0.45, 0, 0.2, 1);
  will-change: transform;
}
.column {
  display: flex;
  flex-direction: column;
  gap: var(--chunk-gap);
  flex-shrink: 0;
  width: var(--slide-w);
  position: relative;
}

/* chunk = slide */
.chunk {
  position: relative;
  width: var(--slide-w);
  min-height: var(--slide-height);
  display: grid;
  grid-template-columns: 1fr minmax(0, var(--content-w, 36em)) 1fr;
  align-items: center;
  padding: var(--slide-pad-y) var(--slide-pad-x);
  transition: opacity var(--camera-duration) ease;
}
/* 22em was a genuinely narrow column: a claim of two sentences became a
   tall thin ribbon that read worse than the same text at standard width.
   28em still reads as the narrow option next to standard's 36em, without
   forcing a line break every six words. */
.chunk[data-width=narrow]   { --content-w: 28em; }
.chunk[data-width=standard] { --content-w: 36em; }
.chunk[data-width=wide]     { --content-w: 52em; }
.chunk[data-width=full]     { --content-w: 72em; }

.chunk-content {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  position: relative;
}

.tag-label {
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.13em;
  font-size: calc(0.62em * var(--zoom));
  font-weight: 500;
  color: var(--ink-soft);
  opacity: 0.85;
}

/* Floating slide-number badge: vertical orientation, anchored to the
   top of the chunk so it stays visible even when a chunk's content
   overflows the viewport height (the audience camera lands on the
   heading first, and the badge sits right next to it). Sized in plain
   em (inherits from the responsive body font) so it tracks the viewport
   but ignores the user's --zoom hotkey. */
.chunk-num {
  position: absolute;
  top: var(--slide-pad-y);
  right: calc(var(--slide-pad-x) * 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--sans-font);
  font-size: 0.78em;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1.05;
  color: var(--ink-soft);
  opacity: 0.32;
  pointer-events: none;
  user-select: none;
  z-index: 2;
}
.chunk-num i { font-style: normal; }
.chunk:hover > .chunk-num,
.chunk.active > .chunk-num { opacity: 0.5; }
body.figure-focused .chunk-num { opacity: 0; }
/* Orientation is a taste question, so it is a setting rather than a
   decision the tool makes for everyone. L cycles it live; the frontmatter
   key sets where a lecture starts. */
body[data-slide-nums=horizontal] .chunk-num { flex-direction: row; gap: 0.08em; }
body[data-slide-nums=off] .chunk-num { display: none; }
.chunk-heading {
  font-family: var(--body-font);
  font-weight: 600;
  font-size: calc(1.55em * var(--zoom));
  margin: 0;
  line-height: 1.15;
  letter-spacing: -0.012em;
  color: var(--ink);
}
.chunk-body {
  font-size: calc(1em * var(--zoom));
  line-height: 1.5;
  text-align: left;
}
.chunk-body p { margin: 0 0 0.7em 0; }
.chunk-body p:last-child { margin-bottom: 0; }
.chunk-body strong { font-weight: var(--bold-weight); color: var(--emph); }
.chunk-body em { font-style: italic; }
.chunk-body a { color: var(--emph); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
.chunk-body a:hover { text-decoration-thickness: 2px; }
.chunk-body ul, .chunk-body ol { margin: 0 0 0.7em 1.4em; }
.chunk-body li { margin: 0.15em 0; }
.chunk-body code { font-family: var(--mono-font); font-size: 0.92em; }
/* GFM tables: marked emits bare <table>; without this they collapse to the
   browser default of ~1px cell spacing and read as cramped. Borders use
   var(--rule) so they track all six themes (same reactivity rule as figures). */
.chunk-body table {
  border-collapse: collapse;
  margin: 0.4em 0 0.7em 0;
  font-size: calc(0.92em * var(--zoom));
  line-height: 1.35;
}
.chunk-body th, .chunk-body td {
  padding: 0.35em 0.75em;
  border: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}
.chunk-body th {
  font-weight: var(--bold-weight);
  color: var(--emph);
  border-bottom-width: 2px;
}
.chunk-body pre {
  font-family: var(--mono-font);
  font-size: calc(0.78em * var(--zoom));
  line-height: 1.4;
  white-space: pre;
  overflow-x: auto;
  margin: 0.4em 0;
  color: var(--ink);
  text-align: left;
  max-width: 100%;
}
/* Top-level pre inside a reveal segment escapes the chunk's text-column
   width and pins to the slide center (same trick as before): pre grows
   to max-content, capped at 72vw (viewport minus 2×14% slide padding),
   and position:relative + left:50% + translateX(-50%) re-centers it on
   the slide when the pre is wider than .chunk-content. Nested pre (in
   .cols / .side / .marginalia) stays at 100% of its local container. */
.reveal-segment > pre,
.reveal-segment > div > pre, /* shiki wraps in <pre>; direct child is fine */
.chunk-content > .reveal-segment > pre {
  width: max-content;
  max-width: calc(var(--slide-w) * 0.72);
  position: relative;
  left: 50%;
  transform: translateX(-50%);
}

/* Shiki code blocks: match the chunk-body pre typography, suppress the
   theme's own background (use the slide's paper color so the code sits
   in the prose visually, not in a card). */
.chunk-body pre.shiki {
  background: transparent !important;
  padding: 0.4em 0;
}
.chunk-body pre.shiki code { font-size: inherit; }
/* Shiki wraps each line in <span class="line">. With white-space:pre on
   the outer <pre>, the newline text nodes between spans already break
   lines — display:block on .line would double the gap, so we force
   inline explicitly (some shiki versions apply block via their CSS). */
.chunk-body pre.shiki .line { display: inline; }

/* Layout primitives – cols, side, marginalia -------------------------- */

/* ::: cols N  – CSS multi-column flow for 2 or 3 short paragraphs */
/* A layout block is a stronger visual unit than a paragraph, so it needs
   more air around it than paragraph-to-paragraph spacing (0.7em), not
   less. At 0.3em the prose resuming after a two-column block read as if
   it were still part of it. Bottom is deliberately larger than top: the
   eye needs a clearer signal that the columns have ended than that they
   are about to start. */
.cols {
  column-gap: 2.2em;
  column-rule: 1px dotted transparent;
  margin: 0.85em 0 1.2em;
}
.cols-2 { column-count: 2; }
.cols-3 { column-count: 3; }
.cols > * { break-inside: avoid; }
.cols > :first-child { margin-top: 0; }
.cols p { margin: 0 0 0.55em; }
.cols p:last-child { margin-bottom: 0; }

/* Collapsed, a multi-column flow stops being worth its own hazard. What
   survives topic-bold is one sentence per paragraph plus promoted bolds,
   and the break-inside: avoid rule above forbids splitting a paragraph
   across columns, so the browser balances in whole paragraphs. Two
   paragraphs of one and five visible lines therefore land as one short
   column beside a tall one, and two short ones land as two stubs with the
   full gutter between them – which reads as a broken layout rather than as
   two parallel points. Single column while collapsed; print and the
   un-collapsed reading mode keep the author's columns, where the content
   is long enough for the flow to balance properly. */
[data-collapse=topic-bold] .cols-2,
[data-collapse=topic-bold] .cols-3 { column-count: 1; }

/* ::: side / ::: flip  – explicit two-pane grid for figure+text */
.side {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2em;
  align-items: start;
  margin: 0.85em 0 1.2em;
}
.side-a, .side-b { min-width: 0; }
.side-a > :first-child, .side-b > :first-child { margin-top: 0; }
.side-a > :last-child, .side-b > :last-child { margin-bottom: 0; }

/* ::: marginalia  – aside that extends into the right slide margin.
   Anchored to chunk-content's right edge, spills toward the slide
   padding. Camera does not pan automatically on load; click pans
   manualPan so the marginalia lands centered. */
.marginalia {
  position: absolute;
  left: calc(100% + 2vw);
  top: 0;
  width: 26vw;
  max-width: 36em;
  font-family: var(--body-font);
  font-size: calc(0.82em * var(--zoom));
  line-height: 1.45;
  color: var(--ink-soft);
  padding: 0 0 0 1.1em;
  border-left: 1px dotted var(--rule);
  cursor: zoom-in;
  z-index: 2;
}
.marginalia > :first-child { margin-top: 0; }
.marginalia > :last-child { margin-bottom: 0; }
.marginalia figure { margin: 0; }
.marginalia img { max-width: 100%; height: auto; display: block; }
.marginalia pre { font-size: 0.85em; }

/* Two-line action heading (heading | subline) */
.chunk-heading.has-sub { display: flex; flex-direction: column; gap: 0.1em; }
.chunk-heading .hd-main { display: block; }
.chunk-heading .hd-sub {
  display: block;
  font-weight: 400;
  font-size: 0.68em;
  line-height: 1.25;
  color: var(--ink-soft);
  letter-spacing: -0.005em;
  font-family: var(--sans-font);
  font-variant: normal;
  font-style: italic;
}
/* Code spans inside a heading (renderInlineMd). Default monospace at 1em
   towers over a large serif heading, and the italic sub-line should not
   italicise an identifier. */
.chunk-heading code {
  font-family: var(--mono-font);
  font-size: 0.84em;
  font-style: normal;
  font-weight: inherit;
  /* A mono glyph ends flush against the following italic word, so the
     inter-word space reads as none. Buy a hair of it back. */
  margin: 0 0.09em;
}

/* Images & figures --------------------------------------------------- */
/* Baseline for raw <img> (direct-path Markdown images that bypass the
   figure.figure-img wrapper). Without this, a high-resolution screenshot
   would render at intrinsic pixel size and overflow the slide. */
img { max-width: 100%; height: auto; }

figure.figure-img {
  margin: 0.6em 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: zoom-in;
}
/* Same box as a still figure, but deliberately NOT in FOCUSABLE_SEL: a
   click-to-zoom would fight the native controls, whose own fullscreen
   button does that job better. How big the clip sits on the slide is the
   chunk's width class. */
figure.figure-video {
  margin: 0.6em 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* A hosted player. The frame keeps 16/9 rather than a fixed height so it
   scales with the slide like everything else, and the address underneath is
   the fallback: it is what the room reads when the frame cannot play, and
   it carries a QR because the link machinery already gives every external
   address one. */
figure.figure-embed {
  margin: 0.6em 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.embed-frame {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 56vh;
  background: oklch(0.12 0 0);
  border-radius: 2px;
  overflow: hidden;
}
.embed-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
.embed-source {
  font-family: var(--sans-font);
  font-size: 0.62em;
  margin-top: 0.35em;
  opacity: 0.7;
  overflow-wrap: anywhere;
  text-align: center;
}
.embed-source a { color: var(--ink-soft); }
/* The instruction card that replaces a YouTube frame on a file:// deck. */
.embed-blocked {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 56vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  text-align: center;
  padding: 1em;
  border: 2px dashed var(--rule);
  border-radius: 3px;
  font-family: var(--sans-font);
  color: var(--ink-soft);
}
.embed-blocked strong { color: var(--ink); font-weight: 600; }
.embed-blocked code {
  font-family: var(--mono-font);
  font-size: 0.85em;
  color: var(--emph);
}
figure.figure-video video {
  max-width: 100%;
  max-height: 56vh;
  height: auto;
  display: block;
  background: oklch(0.12 0 0);
  border-radius: 2px;
}
figure.figure-img img,
figure.figure-img svg {
  max-width: 100%;
  /* Cap on-slide figure height so tall/portrait images fit the slide with
     room for heading + caption, instead of overflowing the (overflow:hidden)
     slide and being clipped top and bottom. vh-based so it scales with the
     viewport like the rest of the layout. The zoom overlay (press Enter)
     still shows the figure at full 92vh. */
  max-height: 50vh;
  height: auto;
  display: block;
  background: var(--paper);
}
figure.figure-img figcaption {
  font-family: var(--sans-font);
  font-size: calc(0.68em * var(--zoom));
  color: var(--ink-soft);
  margin-top: 0.4em;
  text-align: center;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.08em;
}
figure.figure-missing {
  border: 1px dashed oklch(0.62 0.16 30 / 0.6);
  padding: 0.8em 1em;
  color: oklch(0.42 0.16 30);
  font-family: var(--mono-font);
  font-size: 0.75em;
}
figure.figure-missing .figure-missing-placeholder { font-style: italic; }

/* Focused figure / pre overlay --------------------------------------- */
body.figure-focused #figure-overlay { display: flex; }
#figure-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: oklch(0.06 0 0 / 0.92);
  z-index: 30;
  cursor: grab;
  padding: 1vh 1vw;
  overflow: hidden;
}
body.figure-dragging #figure-overlay,
body.figure-dragging #figure-overlay * { cursor: grabbing !important; }
#figure-overlay > .figure-focus-target {
  transform-origin: center center;
  transition: transform 80ms ease-out;
  will-change: transform;
}
body.figure-dragging #figure-overlay > .figure-focus-target { transition: none; }
/* The target is always shown on a solid paper card – otherwise the
   dimmed backdrop bleeds through (shiki-highlighted code in particular
   loses legibility when translucent). !important wins over shiki's
   and the chunk-body override that set pre.shiki background to
   transparent for in-flow rendering. */
#figure-overlay > .figure-focus-target {
  max-width: 98vw;
  max-height: 98vh;
  overflow: auto;
  background: var(--paper) !important;
  box-shadow: 0 0 0 1px var(--rule);
  padding: 1.2vh 1.2vw;
  cursor: grab;
  font-family: var(--body-font);
  color: var(--ink);
}
#figure-overlay > pre.figure-focus-target,
#figure-overlay > pre.shiki.figure-focus-target {
  background: var(--paper) !important;
}
#figure-overlay pre {
  font-family: var(--mono-font);
  /* Overlay code should read LARGER than on-slide (where it's ~0.78em
     × zoom of body font). Scale off --slide-h so it stays consistent
     across audience/speaker. */
  font-size: clamp(20px, calc(var(--slide-h, 100vh) * 0.034), 52px);
  line-height: 1.5;
  white-space: pre;
  margin: 0;
  background: transparent;
}
#figure-overlay figure.figure-img { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 0.6em; }
/* Scale the image up to use the available overlay area. We drop the
   px cap so the figure consumes the viewport on big displays; the
   ~92vh ceiling leaves a sliver for the figcaption underneath.
   Inlined SVGs need the same constraints as <img> – they're spliced
   as <svg> elements and otherwise honor their intrinsic width="…". */
#figure-overlay figure.figure-img img,
#figure-overlay figure.figure-img svg {
  width: 95vw;
  max-height: 92vh;
  height: auto;
  object-fit: contain;
}
#figure-overlay figcaption {
  font-family: var(--sans-font);
  font-size: 0.9rem;
  color: var(--ink-soft);
  margin-top: 0.6em;
  text-align: center;
}
/* Dim the slide underneath so the overlay reads as a zoomed view. */
body.figure-focused #stage { filter: blur(2px) brightness(0.9); }

/* Any figure/pre/marginalia inside an active chunk is pointer-targetable. */
.chunk.active .chunk-body figure.figure-img,
.chunk.active .chunk-body pre,
.chunk.active .marginalia { cursor: zoom-in; }
.chunk:not(.active) .chunk-body figure.figure-img,
.chunk:not(.active) .chunk-body pre,
.chunk:not(.active) .marginalia { cursor: default; }

/* reveal segments: first visible, rest hidden until advanced */
.reveal-segment { transition: opacity 180ms ease; }
.reveal-segment[data-hidden] { display: none; }

/* per-tag treatments */
.chunk[data-tag=principle] .chunk-content::before {
  content: '';
  display: block;
  width: 2.5em; height: 4px;
  background: var(--ink);
  margin-bottom: 0.4em;
}
.chunk[data-tag=principle] .chunk-body { font-size: calc(1.2em * var(--zoom)); line-height: 1.4; }
.chunk[data-tag=principle] .chunk-heading { font-size: calc(1.8em * var(--zoom)); }

.chunk[data-tag=definition] .chunk-content::before {
  content: '';
  display: block;
  width: 100%; height: 1px;
  background: var(--rule);
  margin-bottom: 0.4em;
}

.chunk[data-tag=question] { text-align: center; }
.chunk[data-tag=question] .chunk-content { gap: 0.8em; align-items: flex-start; }
.chunk[data-tag=question] .chunk-heading { font-size: calc(2.4em * var(--zoom)); font-weight: 500; }
.chunk[data-tag=question] .chunk-body { font-size: calc(1.15em * var(--zoom)); color: var(--ink-soft); }

.chunk[data-tag=figure] .chunk-heading {
  font-size: calc(1.05em * var(--zoom));
  font-weight: 500;
  color: var(--ink-soft);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
}
.chunk[data-tag=figure] .chunk-content { align-items: center; gap: 0.9em; }
.chunk[data-tag=figure] .chunk-body { order: 3; max-width: 40em; text-align: left; font-size: calc(0.9em * var(--zoom)); color: var(--ink-soft); }
.chunk[data-tag=figure] .chunk-heading { order: 2; }
.chunk[data-tag=figure] .chunk-body pre { order: 1; font-size: calc(0.82em * var(--zoom)); }

.chunk[data-tag=exercise] .chunk-heading { font-style: italic; }
.chunk[data-tag=exercise] .chunk-content::before {
  content: 'EXERCISE';
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  font-size: calc(0.6em * var(--zoom));
  color: var(--ink-soft);
  margin-bottom: 0.2em;
}

/* title chunk: lower-left-third (PRD §4.4) */
.chunk-title { align-items: end; }
.chunk-title .chunk-content {
  grid-column: 2;
  gap: 0.5em;
  padding-bottom: 12vh;
}
.chunk-title .title-main {
  font-size: calc(2.6em * var(--zoom));
  font-weight: 500;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.chunk-title .title-presenter {
  font-size: calc(1em * var(--zoom));
  margin: 0;
  color: var(--ink);
}
.chunk-title .title-info {
  font-family: var(--sans-font);
  font-size: calc(0.72em * var(--zoom));
  color: var(--ink-soft);
  line-height: 1.5;
}
.chunk-title .title-info p { margin: 0.15em 0; }

/* section divider slide: opens each named column ('# Heading').
   Centered like a part-title page so the camera has a clear stop
   before the first chunk of the section. */
.chunk-section { align-items: center; }
.chunk-section .chunk-content {
  grid-column: 2;
  align-items: flex-start;
  gap: 0.4em;
}
.chunk-section .section-heading {
  font-family: var(--body-font);
  font-size: calc(2.6em * var(--zoom));
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
  color: var(--ink);
}
.chunk-section .section-heading::before {
  content: '§';
  display: block;
  font-family: var(--sans-font);
  font-size: calc(0.42em * var(--zoom));
  font-weight: 400;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  margin-bottom: 0.6em;
}

/* margin notes: inline below body, dimmed, small */
.margin-note {
  font-family: var(--sans-font);
  font-size: calc(0.78em * var(--zoom));
  line-height: 1.45;
  color: var(--ink-soft);
  padding: 0.6em 0 0.2em;
  margin-top: 0.6em;
  border-top: 1px dotted var(--rule);
}
.margin-note::before {
  content: attr(data-label);
  display: block;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.14em;
  font-size: 0.76em;
  margin-bottom: 0.25em;
  color: var(--ink-soft);
  opacity: 0.75;
}
.margin-note p { margin: 0.2em 0; }

/* annotation box – anchored to content column's left edge */
.annot-box {
  position: absolute;
  top: 0;
  right: calc(100% + 2.5vw);
  width: 21vw;
  display: none;
  font-family: var(--mono-font);
  font-size: calc(0.56em * var(--zoom));
  line-height: 1.5;
  color: var(--ink);
  padding: 1em 1.2em;
  border: 1px dotted var(--rule);
  background: var(--paper);
  z-index: 2;
  opacity: 0.4;
  transition: opacity 220ms ease;
}
.chunk.has-annot .annot-box,
.chunk.annot-visible .annot-box { display: block; }
.chunk.annot-visible .annot-box { opacity: 1; }
/* On the projected audience view the rest-state opacity (0.4) makes the
   note render as pale gray on the beamer – readable in the cockpit, but
   not out in the lecture hall. Keep notes fully opaque on audience so
   the Presentation Note is legible from the back row. Speaker keeps
   the dim at rest so the cockpit stays visually quiet. */
body[data-view=audience] .chunk.has-annot .annot-box { opacity: 1; }
.annot-box-label {
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.15em;
  font-size: 0.82em;
  color: var(--ink-soft);
  opacity: 0.7;
  margin-bottom: 0.6em;
}
.annot-textarea {
  display: block;
  width: 100%;
  background: transparent;
  border: 0;
  font: inherit;
  color: inherit;
  resize: none;
  outline: none;
  white-space: pre-wrap;
  overflow: hidden;
  min-height: 1.5em;
  height: auto;
  padding: 0;
  line-height: 1.5;
}
.annot-textarea::placeholder { color: oklch(0.78 0 0); font-style: italic; }
.annot-add {
  position: absolute;
  top: 0;
  right: calc(100% + 2.5vw);
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.15em;
  font-size: calc(0.6em * var(--zoom));
  color: var(--ink-soft);
  opacity: 0;
  cursor: pointer;
  background: transparent;
  border: 0;
  padding: 0.25em 0.4em;
  transition: opacity 200ms ease;
  z-index: 2;
  white-space: nowrap;
}
.chunk.active:not(.has-annot):not(.annot-visible) .annot-add { opacity: 0.45; }
.annot-add:hover { opacity: 0.9; }

/* expansion chevrons – bottom-right of the slide */
.exps {
  position: absolute;
  bottom: calc(var(--slide-pad-y) * 0.65);
  right: var(--slide-pad-x);
  display: flex;
  flex-direction: row;
  gap: 0.4em;
  align-items: flex-end;
  z-index: 2;
}
.exp-chev {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  font-family: var(--sans-font);
  font-size: calc(0.62em * var(--zoom));
  font-variant-caps: all-small-caps;
  letter-spacing: 0.12em;
  padding: 0.45em 0.7em;
  cursor: pointer;
  font-weight: 500;
  transition: color 150ms, border-color 150ms, background 150ms;
  white-space: nowrap;
}
.exp-chev:hover { color: var(--ink); border-color: var(--ink); }
.exp-chev .caret { opacity: 0.55; transition: transform 150ms; }
.exp-chev.on { color: var(--paper); background: var(--ink); border-color: var(--ink); }
.exp-chev.on .caret { opacity: 1; transform: rotate(90deg); }
.chunk:not(.active) .exps { display: none; }

/* expanded: split the slide grid into content-left + expansion-right.
   Exp-body gets a bit of extra breathing room (36em vs. 30em) so that
   standard-width code blocks fit without horizontal scroll. */
.chunk.expanded {
  grid-template-columns: minmax(0, var(--content-w, 36em)) minmax(0, 36em);
  gap: 5%;
}
.chunk.expanded .chunk-content { grid-column: 1; }
.exp-body { display: none; }
.chunk.expanded .exp-body.on {
  display: block;
  grid-column: 2;
  align-self: center;
  font-size: calc(0.88em * var(--zoom));
  line-height: 1.5;
  color: var(--ink);
  background: var(--paper);
  padding: 1.2em 1.6em;
  border: 1px solid var(--rule);
  border-left: 2px solid var(--ink);
  min-width: 0;
  max-height: 80vh;
  overflow-y: auto;
  /* Raise above the chunk-content column: code blocks inside reveal
     segments escape their grid cell (width: max-content, left: 50%,
     translateX(-50%)) and would otherwise paint on top of the card. */
  position: relative;
  z-index: 5;
  box-shadow: 0 2px 18px oklch(0 0 0 / 0.08);
}
.exp-body .tag-label { text-align: left; font-size: 0.72em; margin-bottom: 0.3em; }
.exp-body p { margin: 0 0 0.6em; }
.exp-body p:last-child { margin-bottom: 0; }
.exp-body strong { font-weight: var(--bold-weight); color: var(--emph); }
/* Code inside an expansion: a touch smaller than inline code so a typical
   6–8 line snippet fits the 36em width; overflow scrolls horizontally
   (and the aside's max-height caps vertical growth). */
.exp-body pre {
  font-family: var(--mono-font);
  font-size: 0.8em;
  line-height: 1.4;
  white-space: pre;
  margin: 0.4em 0;
  max-width: 100%;
  overflow-x: auto;
  background: transparent;
  color: var(--ink);
}
.exp-body pre.shiki { background: transparent !important; padding: 0.4em 0; }
.exp-body pre.shiki .line { display: inline; }
.exp-body code { font-family: var(--mono-font); font-size: 0.92em; }
.exp-body ul, .exp-body ol { margin: 0 0 0.6em 1.3em; padding: 0; }
.exp-body li { margin: 0.15em 0; }

/* focus / dim (§2 neighbor behavior: dim mode) */
.chunk:not(.active) {
  opacity: calc(1 - var(--dim) * 0.96);
  transition: opacity 500ms ease;
}
.chunk.active { opacity: 1; }

/* collapse modes (§4.5) – applied per reveal-segment.
   Two states only: 'none' (show everything) and 'topic-bold'
   (topic sentence + promoted bold fragments). */
[data-collapse=topic-bold] .reveal-segment .sentence-rest .prose { display: none; }
[data-collapse=topic-bold] .reveal-segment .sentence-rest strong {
  display: block;
  margin: 0.35em 0 0 1.5em;
  font-weight: 500;
  position: relative;
  color: var(--emph);
}
[data-collapse=topic-bold] .reveal-segment .sentence-rest strong::before {
  content: '–';
  position: absolute;
  left: -1em;
  color: var(--ink-soft);
  font-weight: 400;
  opacity: 0.6;
}

/* Explicit-slide mode (§4.5) – the alternative to deriving the slide from
   the prose. Precedence, highest first:
     1. chunk has a ::: slide   → show only that block
     2. chunk has a ::: script  → show everything except that block
     3. neither                 → topic sentence + promoted bolds (above)
   Rule 1 wins so a chunk can carry both: the slide block is the screen,
   the script block plus any loose prose is the narration.
   Inside an explicit block nothing is abridged – splitSentencesIn skips
   these subtrees entirely, so paragraphs render whole.

   The selector hides every element in the segment that is neither the slide
   block, nor an ancestor of it, nor inside it. Matching only direct children
   of .reveal-segment is not enough: a ::: slide nested in a ::: side or
   ::: cols sits below a wrapper div, and hiding that wrapper takes the slide
   block down with it. The guard is per reveal-segment, not per chunk, so a
   segment without an explicit block still falls back to rule 3. */
[data-collapse=topic-bold] .reveal-segment:has(.slide-explicit)
  *:not(.slide-explicit):not(:has(.slide-explicit)):not(.slide-explicit *),
[data-collapse=topic-bold] .script-only { display: none; }

/* Print and the un-collapsed reading mode show both, in source order, so
   nothing an author wrote is ever lost. The slide block keeps a quiet
   marker there: it is the part the room actually saw. */
.slide-explicit { border-inline-start: 2px solid var(--rule); padding-inline-start: 0.9em; }
[data-collapse=topic-bold] .slide-explicit { border-inline-start: none; padding-inline-start: 0; }
.slide-explicit > :first-child { margin-block-start: 0; }
.slide-explicit > :last-child { margin-block-end: 0; }
.script-only { color: var(--ink-soft); }

/* Math (PRD §2). Display formulas are block-level, so the topic-bold rules
   above never touch them – like a figure or a code block, a formula stays on
   screen when the prose around it collapses. Inline math lives inside a
   paragraph and therefore follows that paragraph: visible if it sits in the
   topic sentence, hidden with the continuation prose otherwise.
   KaTeX defaults to 1.21em, which shouts next to this body serif; 1.05em
   keeps a formula the same optical weight as the sentence carrying it. */
.katex { font-size: 1.05em; color: inherit; }
.math-display {
  margin-block: 0.9em;
  overflow-x: auto;
  overflow-y: hidden;
  padding-block: 0.15em;
}
.math-display .katex-display { margin: 0; }
.math-display .katex { font-size: 1.15em; }
.math-error { color: var(--emph); font-family: var(--mono, ui-monospace, monospace); }

/* blank mode */
/* Blanking is a projector action, not a global one. The speaker window
   keeps everything visible so the lecturer can change slide, read notes and
   line up what comes next while the room sees black. */
body:not([data-view=speaker]).blanked #stage-viewport { background: oklch(0.06 0 0); }
body:not([data-view=speaker]).blanked #stage { opacity: 0; }

/* The badge is the only feedback that the projection is off. In the speaker
   window it always shows while blanked; in the audience it shows only when
   there is no speaker window to show it instead, so a lecturer working from
   one screen still knows what happened and how to undo it. */
#blank-badge {
  position: fixed;
  bottom: 1.2rem;
  left: 50%;
  transform: translateX(-50%);
  background: oklch(0.06 0 0);
  color: oklch(0.97 0 0);
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.32rem 0.8rem;
  z-index: 45;
  pointer-events: none;
}
#blank-badge.hidden { display: none; }
/* The speaker footer already owns the bottom edge; clear it rather than
   sitting on top of the push indicator and the hotkey legend. */
body[data-view=speaker] #blank-badge { bottom: 3.4rem; }
#blank-badge span { font-weight: 400; opacity: 0.72; }

/* overlays */

/* Help overlay – the self-documentation surface for both live views.
   Grouped by task, not by key. Scrolls internally on short windows so a
   1280x800 laptop still reaches the last section. */
#help-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: oklch(0.14 0 0 / 0.72);
  display: grid;
  place-items: center;
  padding: 2.2vh 2vw;
}
#help-overlay.hidden { display: none; }
#help-inner {
  background: var(--paper);
  border: 1px solid var(--rule);
  box-shadow: 0 18px 60px oklch(0 0 0 / 0.35);
  /* Explicit width, not max-width: as a centred grid item the panel would
     otherwise shrink to its content and squeeze the description column to
     one word per line. */
  width: min(1180px, 95vw);
  max-height: 95vh;
  overflow-y: auto;
  padding: 1.4rem 1.7rem 1.7rem;
  font-family: var(--sans-font);
}
#help-inner header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5em;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.55rem;
  margin-bottom: 1rem;
}
#help-inner h2 {
  margin: 0;
  font-size: 0.95rem;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.16em;
  color: var(--ink);
  font-weight: 600;
}
#help-inner .help-dismiss { font-size: 0.7rem; color: var(--ink-soft); letter-spacing: 0.06em; }
.help-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 0.9rem 2.4rem;
  align-items: start;
}
.help-grid h3 {
  margin: 0 0 0.4rem;
  font-size: 0.7rem;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  color: var(--emph);
  font-weight: 600;
}
/* Two-column definition list: the trigger (key or gesture) sits left at a
   capped measure, the effect wraps in the remaining space. The cap matters –
   max-content lets a phrase like "drag the bar above the notes" eat the
   whole row and reduce the description to one word per line. */
.help-grid dl {
  margin: 0 0 0.9rem;
  display: grid;
  grid-template-columns: 9.5em 1fr;
  gap: 0.3rem 0.9rem;
  font-size: 0.78rem;
  line-height: 1.38;
}
.help-grid dt { color: var(--ink); text-wrap: balance; }
.help-grid dd { margin: 0; color: var(--ink-soft); }
#help-inner kbd {
  font-family: var(--mono-font);
  font-size: 0.9em;
  color: var(--ink);
  background: oklch(0.96 0 0);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0 0.32em;
}
body[data-theme^=terminal] #help-inner kbd { background: oklch(0.24 0.02 90); }

/* Persistent, unobtrusive way in. The overlay used to be reachable only by
   guessing that ? does something. */
#help-button {
  position: fixed;
  bottom: 12px; left: 12px;
  z-index: 22;
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 1px solid var(--rule);
  background: oklch(0.98 0 0 / 0.8);
  color: var(--ink-soft);
  font-family: var(--sans-font);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 140ms ease;
}
#help-button:hover { opacity: 1; }
body.overview-mode #help-button,
body:not([data-view=speaker]).blanked #help-button { display: none; }
/* The speaker cockpit has a labelled "? help" button in its footer, so the
   floating circle is a second door to the same room – and it sits bottom-left
   on top of the timer, which the lecturer reads far more often than the help. */
body[data-view=speaker] #help-button { display: none; }

/* Link address overlay. Shift-click on a link shows the URL on both
   screens instead of opening it on either: a lecture wants the room to be
   able to write an address down, and a browser tab pushed to a projector
   is a UI the lecturer is then driving blind. Sized to be read from the
   back row, and it breaks anywhere so a long URL never overflows. */
#link-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Opaque, not a veil. The job is an address someone is copying down onto
     paper; slide text showing through turns it into a puzzle. */
  background: var(--paper);
  padding: 4vh 4vw;
}
#link-overlay.hidden { display: none; }
/* B means everything off the screen, now. The overlay sits above the stage,
   so blanking has to reach it too – the speaker keeps it, like the rest of
   the cockpit, because that window goes on working while the room is dark. */
body:not([data-view=speaker]).blanked #link-overlay { display: none; }
#link-overlay-inner { max-width: 46em; text-align: center; }
#link-overlay-label {
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.14em;
  font-size: 1rem;
  color: var(--ink-soft);
  margin-bottom: 0.9rem;
}
#link-overlay-url {
  display: block;
  font-family: var(--mono-font);
  font-size: clamp(1.1rem, 3.4vw, 2.6rem);
  line-height: 1.35;
  color: var(--emph);
  overflow-wrap: anywhere;
  text-decoration: none;
  /* Selectable without the Alt modifier: the whole point of putting an
     address up is that someone copies it, and here there is no pan gesture
     to protect – the overlay covers the stage. */
  user-select: text;
  -webkit-user-select: text;
  cursor: pointer;
}
#link-overlay-url:hover { text-decoration: underline; text-underline-offset: 0.18em; }
/* The QR keeps its own white ground on every theme. Scanners cope badly
   with inverted codes, so a dark theme must not invert this one - the white
   card doubles as the quiet zone the spec requires. */
#link-overlay-qr {
  margin: 1.6rem auto 0;
  width: min(38vh, 300px);
  background: #fff;
  padding: 0.6rem;
  border-radius: 4px;
  line-height: 0;
}
#link-overlay-qr:empty { display: none; }
#link-overlay-qr svg { width: 100%; height: auto; display: block; }

#link-overlay-hint {
  margin-top: 1.4rem;
  font-family: var(--sans-font);
  font-size: 0.85rem;
  color: var(--ink-soft);
  opacity: 0.7;
}

/* Mode toast. This used to be a 10px small-caps chip in the top-right
   corner, tinted paper-on-paper – peripheral enough that the feedback for
   a toggle regularly went unnoticed, which is the one job it has. Now:
   top-centre, sentence-sized, white on near-black. The white hairline in
   the box-shadow is what keeps it legible on the terminal themes, where a
   dark toast would otherwise sit on a dark slide. */
#mode-badge {
  position: fixed;
  top: 18px; left: 50%;
  transform: translateX(-50%) translateY(-6px);
  background: oklch(0.16 0 0 / 0.94);
  color: oklch(0.99 0 0);
  font-family: var(--sans-font);
  font-size: 15px;
  letter-spacing: 0.01em;
  padding: 0.5rem 1.1rem;
  border-radius: 6px;
  box-shadow: 0 0 0 1px oklch(1 0 0 / 0.28), 0 8px 26px oklch(0 0 0 / 0.32);
  max-width: 70vw;
  text-align: center;
  opacity: 0;
  transition: opacity 130ms ease, transform 130ms ease;
  /* Above #figure-overlay (30) so a toggle pressed while a figure is
     zoomed still reports back. */
  z-index: 40;
  pointer-events: none;
}
#mode-badge.visible { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Laser pointer – the audience's mirror of the speaker's cursor.
   Speaker view does not render this (the speaker has a real cursor). */
#laser-pointer {
  position: fixed;
  top: 0; left: 0;
  width: 18px; height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: oklch(0.62 0.22 25 / 0.55);
  box-shadow: 0 0 0 2px oklch(0.62 0.22 25 / 0.25), 0 0 12px oklch(0.62 0.22 25 / 0.45);
  pointer-events: none;
  opacity: 0;
  transition: opacity 180ms ease;
  /* Above #figure-overlay (z 30) so the laser stays visible while the
     speaker hovers over a focused figure. */
  z-index: 40;
}
#laser-pointer.visible { opacity: 1; }
body[data-view=speaker] #laser-pointer { display: none; }

/* Touch control rail (audience only) – prev/next/overview/zoom shown
   only on coarse-pointer devices (phones, tablets without keyboards).
   The element doesn't exist in speaker.html. The CSS @media gate
   self-adapts: an iPad with a Magic Keyboard re-classifies as a fine
   pointer and the rail disappears. */
#touch-controls { display: none; }
@media (pointer: coarse) {
  #touch-controls {
    display: flex;
    position: fixed;
    bottom: max(0.6em, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    gap: 0.25em;
    z-index: 35;
    background: oklch(0.10 0 0 / 0.78);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    padding: 0.35em 0.5em;
    border-radius: 999px;
    box-shadow: 0 4px 18px oklch(0 0 0 / 0.35);
  }
  #touch-controls button {
    background: transparent;
    border: 0;
    color: oklch(0.96 0 0);
    font-size: 1.5em;
    width: 2.2em;
    height: 2.2em;
    border-radius: 50%;
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  #touch-controls button:active { background: oklch(0.30 0 0); }
  /* Hide while the screen is blanked. Stay visible during figure-focus
     so the +/− buttons remain reachable for figure zoom; the rail is
     above the overlay (z-index 35 vs 30) so taps still land on it. */
  body:not([data-view=speaker]).blanked #touch-controls { display: none; }
}

/* overview mode (PRD §5) ------------------------------------------- */
body.overview-mode #stage-viewport { cursor: grab; }
body.overview-mode #stage-viewport:active { cursor: grabbing; }
body.overview-mode #stage { transition: transform var(--camera-duration) cubic-bezier(0.45, 0, 0.2, 1); }
body.overview-mode.overview-dragging #stage { transition: none; }
body.view-panning, body.view-panning * { cursor: grabbing !important; }
body.view-panning #stage { transition: none; }
body.overview-mode .chunk {
  opacity: 1 !important;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: -1em;
  transition: outline-color 120ms ease;
}
body.overview-mode .chunk.overview-selected { outline-color: oklch(0.55 0.12 220); }
body.overview-mode .chunk.search-match    { outline-color: oklch(0.62 0.16 90); }
body.overview-mode .chunk.search-miss     { opacity: 0.1 !important; }
body.overview-mode .annot-add,
body.overview-mode .exps,
body.overview-mode .annot-box,
body.overview-mode .margin-note { display: none !important; }

#overview-badge {
  position: fixed;
  top: 14px; left: 14px;
  background: oklch(0.55 0.12 220);
  color: var(--paper);
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.15em;
  font-size: 11px;
  padding: 0.4rem 0.8rem;
  font-weight: 600;
  display: none;
  z-index: 21;
  pointer-events: auto;
}
body.overview-mode #overview-badge { display: flex; align-items: center; gap: 0.7em; }
#overview-badge .hint { pointer-events: none; }

/* Search panel (PRD SS5). Fixed overlay rather than a strip inside the
   overview badge, because it opens from anywhere now, not only from the
   board. Sized so a hit list of a dozen entries is readable without
   covering the whole slide. */
#search-panel {
  position: fixed;
  top: 8vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(46rem, 88vw);
  max-height: 74vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--rule);
  box-shadow: 0 8px 40px oklch(0 0 0 / 0.18);
  z-index: 40;
  font-family: var(--sans-font);
}
#search-panel.hidden { display: none; }
#search-panel #search-input {
  font: inherit;
  font-size: 1.05rem;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--rule);
  outline: 0;
  padding: 0.85rem 1.1rem;
}
#search-panel #search-input::placeholder { color: var(--ink-soft); font-style: italic; }
#search-results {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
#search-results li {
  padding: 0.6rem 1.1rem;
  border-bottom: 1px solid oklch(from var(--rule) l c h / 0.5);
  cursor: pointer;
}
#search-results li[aria-selected=true] { background: oklch(from var(--emph) l c h / 0.1); }
#search-results .sr-title {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--ink);
}
#search-results .sr-tag {
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
  font-size: 0.72rem;
  color: var(--ink-soft);
  margin-inline-end: 0.5em;
}
#search-results .sr-sub {
  font-weight: 400;
  color: var(--ink-soft);
  margin-inline-start: 0.5em;
}
#search-results .sr-context {
  display: block;
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-top: 0.15rem;
  line-height: 1.4;
}
#search-results mark {
  background: oklch(from var(--emph) l c h / 0.22);
  color: var(--emph);
  font-weight: 600;
}
#search-results .sr-empty { color: var(--ink-soft); font-style: italic; cursor: default; }
#search-foot {
  padding: 0.45rem 1.1rem;
  border-top: 1px solid var(--rule);
  font-size: 0.72rem;
  color: var(--ink-soft);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
}
#search-foot kbd { margin-inline-end: 0.15em; }

/* TOC overlay (PRD §5) --------------------------------------------- */
/* Scoped to the <nav> tag so author chunks that legitimately use
   id="toc" (see lectures/tutorial – a chunk explaining the TOC
   feature) don't inherit the overlay's fixed positioning and
   collapse into a floating blob. */
nav#toc {
  position: fixed;
  top: 0; right: 0;
  height: 100vh;
  width: 22em;
  max-width: 40vw;
  background: oklch(0.98 0 0 / 0.96);
  border-left: 1px solid var(--rule);
  padding: 3rem 2rem 2rem;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 220ms cubic-bezier(0.45, 0, 0.2, 1);
  z-index: 25;
}
body.toc-visible nav#toc { transform: translateX(0); }
nav#toc h2 {
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: var(--ink-soft);
  font-weight: 500;
  margin: 0 0 1.2rem;
}
nav#toc ol { list-style: decimal outside; padding-left: 1.6em; margin: 0; }
nav#toc li { margin: 0.5em 0; }
nav#toc button {
  background: transparent;
  border: 0;
  padding: 0.1em 0;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  letter-spacing: -0.005em;
  line-height: 1.3;
}
nav#toc button:hover { color: var(--emph); }
nav#toc li.toc-active button { font-weight: 600; color: var(--emph); }
`;

// ── audience runtime JS (inlined verbatim into the output HTML) ──────

const AUDIENCE_JS = `
const STORAGE_PREFIX = 'psi-slides:';
const storageKey = (s) => STORAGE_PREFIX + LECTURE_TITLE + ':' + s;

// The audience runtime is shared with the speaker view. The HTML sets
// body[data-view] to "audience" or "speaker"; runtime branches on it.
// Speaker-only behavior hangs off the viewHooks object defined below
// and is overridden in the speaker-specific runtime.
const VIEW = document.body.dataset.view || 'audience';
const viewHooks = {
  onN: (entry) => startAnnotate(entry.id),
  onActiveChange: () => {},
  onStateChange: () => {},
  shouldBroadcast: () => true,
};

const stage = document.getElementById('stage');
const viewport = document.getElementById('stage-viewport');
const modeBadge = document.getElementById('mode-badge');

// The camera is the only thing allowed to decide what is on screen, and it
// positions the deck with a transform on #stage. But #stage-viewport is a
// scroll container, and overflow: hidden does not make a box unscrollable -
// it only hides the scrollbars. The browser still scrolls it to reveal
// things, and then every chunk sits translated by an offset the camera math
// knows nothing about.
//
// Measured: opening audience.html#why-playwright left the viewport at
// scrollLeft 3111, scrollTop 2121, which put the addressed chunk entirely
// outside the window - a deep link into a lecture projected a blank screen.
// Fragment navigation is the obvious way in, but not the only one: focusing
// any control inside an off-centre chunk (an annotation textarea) or
// find-in-page does the same thing.
//
// Cheaper and more robust than intercepting each of those: let the scroll
// happen and undo it. Nothing in either view scrolls this element on
// purpose - the preview strip and the search results have their own
// containers - so a hard reset here cannot fight a legitimate scroll.
//
// Both the listener and the call in focusCamera are load-bearing. The
// listener catches scrolls that no camera solve follows; the call covers
// the boot fragment, which the browser may act on before this module has
// run and attached anything.
function resetViewportScroll() {
  if (viewport.scrollLeft) viewport.scrollLeft = 0;
  if (viewport.scrollTop) viewport.scrollTop = 0;
}
viewport.addEventListener('scroll', resetViewportScroll);

// What a click can zoom into, and the ordering the speaker-sync protocol
// addresses by index. This must be one constant: the audience and the
// speaker resolve figureIdx against their own DOM, so the two windows
// would focus different elements the moment the selectors disagreed.
// Display math is in the list because a formula on a projector is exactly
// the thing a room asks to see bigger.
const FOCUSABLE_SEL = 'figure.figure-img, figure.figure-diagram, .chunk-body pre, .chunk-body .math-display, .marginalia';

// ── Slide-size sync ─────────────────────────────────────────────────
// --slide-w / --slide-h hold the AUDIENCE window's pixel dimensions so
// that every slide-internal size (font, padding, chunk gap, etc.) is
// computed against the same reference on both sides. Audience fills
// its window 1:1; speaker renders the full audience-size slide and
// then CSS-transforms it down into its physical cell, preserving
// wrap, font-size, and laser-pointer coords exactly.
//
// Audience source of truth: window.innerWidth / window.innerHeight,
// refreshed on resize. Speaker: last-received audienceW/H from the
// state snapshot. Until a snapshot arrives, speaker falls back to
// window dims (best guess at projector shape).
function setSlideRef(w, h) {
  if (!(w > 0 && h > 0)) return;
  const root = document.documentElement.style;
  root.setProperty('--slide-w', w + 'px');
  root.setProperty('--slide-h', h + 'px');
  root.setProperty('--audience-aspect', String(w / h));
  if (VIEW === 'speaker' && typeof sizeStageViewport === 'function') {
    sizeStageViewport();
  }
  if (typeof focusCamera === 'function') focusCamera(true);
}
// Layout-space viewport size (untouched by --stage-scale transforms).
// getBoundingClientRect() returns visual pixels, which in speaker are
// scaled down; camera math lives in unscaled coords, so we use
// offsetWidth / offsetHeight instead wherever the math needs to match
// chunk.offsetLeft / offsetWidth.
function vpLayout() {
  return { width: viewport.offsetWidth, height: viewport.offsetHeight };
}
// Initial CSS-var write at module-load time – we can't call setSlideRef
// here yet because it calls focusCamera, and focusCamera reads the
// 'overview' let declared further down (TDZ). So set the raw vars
// directly, then register handlers that will use the full setSlideRef
// once the rest of the module (state, overview, etc.) has initialised.
(function primeSlideVars() {
  const w = window.innerWidth, h = window.innerHeight;
  const root = document.documentElement.style;
  root.setProperty('--slide-w', w + 'px');
  root.setProperty('--slide-h', h + 'px');
  root.setProperty('--audience-aspect', String(w / h));
})();
if (VIEW === 'audience') {
  // The new dimensions also have to reach the speaker, and they get their own
  // message rather than riding the state snapshot. A snapshot is a full state
  // apply: sending one here would drag the speaker back to whatever slide the
  // audience is showing, undoing a look-ahead every time the projector
  // renegotiates its resolution. The aspect is the only field that has to
  // travel, so it travels alone. Debounced because resize fires at ~60 Hz.
  let refTimer = null;
  window.addEventListener('resize', () => {
    setSlideRef(window.innerWidth, window.innerHeight);
    clearTimeout(refTimer);
    refTimer = setTimeout(() => {
      sendToPeer({ type: 'slide-ref', source: 'audience', w: window.innerWidth, h: window.innerHeight });
    }, 120);
  });
}
// Speaker's initial slide reference stays as this window's dimensions
// until the first audience state snapshot arrives via applyRemoteState,
// which calls setSlideRef directly. No immediate call needed.

// Flat list of all chunk elements with column index, preserving source order.
const flatChunks = [];
document.querySelectorAll('.column').forEach((col, ci) => {
  col.querySelectorAll('.chunk').forEach((el) => {
    flatChunks.push({ colIdx: ci, el, id: el.dataset.chunkId });
  });
});

// VIEW_DEFAULTS holds only the keys the author pinned in the frontmatter;
// everything absent from it falls back to the built-in default here and, for
// the three global preferences, to whatever the reader last chose.
const state = {
  activeIdx: 0,
  collapse: VIEW_DEFAULTS.collapse || 'topic-bold',
  zoom: 1.35,
  autoFit: !!VIEW_DEFAULTS.autoFit,   // # – refit the zoom on every slide, both modes
  blanked: false,
  font: VIEW_DEFAULTS.font || 'serif',           // serif | sans | mono (readable)
  theme: VIEW_DEFAULTS.theme || 'light-red',     // light-{red,teal,blue,orange} | terminal-{amber,green}
  slideNums: VIEW_DEFAULTS.slideNums || 'vertical',  // vertical | horizontal | off – L cycles
};
const FONT_CYCLE = ['serif', 'sans', 'mono'];
const SLIDE_NUM_MODES = ['vertical', 'horizontal', 'off'];
const THEME_CYCLE = ${JSON.stringify(THEME_NAMES)};
const DARK_THEMES = ${JSON.stringify(DARK_THEME_NAMES)};
let openExp = null;            // { chunkIdx, expIdx } | null
let annotEditingId = null;
let annotations = {};          // chunkId -> text
const revealed = {};           // chunkId -> count of visible segments

// overview / TOC / search (PRD §5)
//
// Two independent indices, deliberately: overviewAnchorIdx is the *only*
// thing the overview camera is centred on, selectedIdx is only the
// outline. Coupling them (the original design) forces every click to
// move the stage, which makes click-to-select feel like the view runs
// away from you. Keeping them apart means the framing is a pure function
// of (anchor, scale, pan) – all three travel in the sync payload, so the
// two views land on identical pixels.
let overview = false;
let overviewScale = 0.28;
const OVERVIEW_MIN_SCALE = 0.08;
const OVERVIEW_MAX_SCALE = 1;
let selectedIdx = 0;           // overview selection outline (independent of activeIdx)
let overviewAnchorIdx = 0;     // chunk the overview camera is centred on
let manualPan = { dx: 0, dy: 0 };
let searchActive = false;
let tocVisible = false;

// Replace obj's contents in-place so existing references (closures,
// readers holding &obj) see the update. Used from applyRemoteState
// where several module-level maps are live-synced.
function replaceContents(obj, src) {
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, src || {});
}

// One-shot rename of any leftover 'psi-lecdoc:*' localStorage keys to
// 'psi-slides:*'. Covers font, theme, preview-orientation, annotations,
// and activeIdx. Runs before loadPersisted so the subsequent reads find
// the migrated values. Safe to remove once no field instances are
// expected to have the old prefix.
(function migrateLegacyStorage() {
  try {
    const OLD = 'psi-lecdoc:';
    const NEW = 'psi-slides:';
    const toMove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OLD)) toMove.push(k);
    }
    for (const k of toMove) {
      const newKey = NEW + k.slice(OLD.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(k));
      }
      localStorage.removeItem(k);
    }
  } catch (e) {}
})();

function loadPersisted() {
  try {
    const raw = localStorage.getItem(storageKey('annotations'));
    if (raw) annotations = JSON.parse(raw) || {};
  } catch (e) {}
  try {
    const pos = localStorage.getItem(storageKey('activeIdx'));
    if (pos !== null) state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, parseInt(pos, 10) || 0));
  } catch (e) {}
  // Font, theme and slide numbers are global (not per-lecture): shared
  // across all lectures so the reading preference follows the user, not the
  // source file. Unless this lecture pinned the key in its frontmatter, in
  // which case the author's choice is the point and the stored preference
  // stays out of the way.
  try {
    const f = localStorage.getItem('psi-slides:font');
    if (!VIEW_DEFAULTS.font && f && FONT_CYCLE.includes(f)) state.font = f;
  } catch (e) {}
  // Theme is resolved before first paint by the boot script at the top of
  // <body> – stored preference, else the operating system's. Read its answer
  // back rather than duplicating that precedence here and risking the two
  // disagreeing. When the frontmatter pinned the theme no script was emitted
  // and the attribute already carries the author's choice.
  if (!VIEW_DEFAULTS.theme) {
    const booted = document.body.dataset.theme;
    if (booted && THEME_CYCLE.includes(booted)) state.theme = booted;
  }
  try {
    const n = localStorage.getItem('psi-slides:slide-nums');
    if (!VIEW_DEFAULTS.slideNums && n && SLIDE_NUM_MODES.includes(n)) state.slideNums = n;
  } catch (e) {}
}
function saveAnnotations() {
  try { localStorage.setItem(storageKey('annotations'), JSON.stringify(annotations)); } catch (e) {}
}
function saveActive() {
  try { localStorage.setItem(storageKey('activeIdx'), String(state.activeIdx)); } catch (e) {}
}
function applyFontTheme() {
  document.body.dataset.font = state.font;
  document.body.dataset.theme = state.theme;
  // Chrome around the slide keys off this rather than off each theme name,
  // so a new dark theme needs no new selectors.
  document.body.dataset.mode = DARK_THEMES.includes(state.theme) ? 'dark' : 'light';
  document.body.dataset.slideNums = state.slideNums;
}
function cycleSlideNums(dir) {
  const i = SLIDE_NUM_MODES.indexOf(state.slideNums);
  const next = SLIDE_NUM_MODES[(i + (dir || 1) + SLIDE_NUM_MODES.length) % SLIDE_NUM_MODES.length];
  state.slideNums = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:slide-nums', next); } catch (e) {}
  flashMode('slide numbers · ' + next);
  broadcastState();
}
function cycleFont(dir) {
  const i = FONT_CYCLE.indexOf(state.font);
  const next = FONT_CYCLE[(i + (dir || 1) + FONT_CYCLE.length) % FONT_CYCLE.length];
  state.font = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:font', next); } catch (e) {}
  flashMode('font · ' + next);
  broadcastState();
}
function cycleTheme(dir) {
  const i = THEME_CYCLE.indexOf(state.theme);
  const next = THEME_CYCLE[(i + (dir || 1) + THEME_CYCLE.length) % THEME_CYCLE.length];
  state.theme = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:theme', next); } catch (e) {}
  flashMode('theme · ' + next);
  broadcastState();
}

// ── window.postMessage sync (PRD §7 / speaker.md §3) ────────────────
// The audience spawns the speaker via S (window.open), which gives
// each window a reference to the other (return value of window.open
// for the audience, window.opener for the speaker). postMessage on
// these references is cross-origin by design, so this works even
// between two file:// pages where BroadcastChannel does not.
//
// Messages are always full state snapshots, never diffs. The peer
// is auto-adopted from any inbound message, so an audience reload
// while the speaker is alive recovers the link as soon as the
// speaker next pushes.
let peer = null;
let isApplyingRemote = false;
// Our own origin as postMessage reports it. On file:// that is the string
// "null" for both sides, which is why location.origin ("file://") is the
// wrong thing to compare against.
const SELF_ORIGIN = (typeof window.origin === 'string') ? window.origin : location.origin;
function setPeer(w) {
  if (w && w !== window && !w.closed) peer = w;
}
function sendToPeer(msg) {
  if (!peer || peer.closed) { peer = null; return; }
  try { peer.postMessage(msg, '*'); } catch (e) { peer = null; }
}
// Is the other window actually there? Drives the two decisions that differ
// between "running alone" and "driving a projector": where a mode toast
// lands, and whether the blank badge is drawn on the projection itself.
function hasLivePeer() {
  if (peer && peer.closed) peer = null;
  return !!peer;
}
// Audience broadcasts unconditionally; speaker overrides
// viewHooks.shouldBroadcast to gate on its push toggle.
function shouldBroadcast() {
  if (isApplyingRemote) return false;
  return viewHooks.shouldBroadcast();
}
function snapshot() {
  return {
    activeIdx: state.activeIdx,
    revealed: Object.assign({}, revealed),
    collapse: state.collapse,
    autoFit: state.autoFit,
    // The zoom that travels is the one the lecturer chose, not the one this
    // window happens to be showing. A chunk whose code would be cut off is
    // shrunk locally, and the two windows are different sizes, so each
    // derives that for itself – sending the shrunk value would let one wide
    // slide quietly lower the setting in the other window, and then in this
    // one on the way back.
    zoom: (!state.autoFit && state.collapse === 'topic-bold') ? collapsedZoom : state.zoom,
    blanked: state.blanked,
    font: state.font,
    theme: state.theme,
    slideNums: state.slideNums,
    // Inner window dimensions travel with every snapshot so the speaker
    // can match its preview's aspect ratio to the actual projector
    // window. Without this, laser-pointer coordinates (fractions of the
    // active chunk's bounding box) would land at the wrong pixel, and
    // content layout could differ (text wrap, code-block width, etc.).
    // Audience is the source of truth; speaker-side value is ignored.
    audienceW: window.innerWidth,
    audienceH: window.innerHeight,
    annotations: Object.assign({}, annotations),
    // Editing-id travels so the non-editing peer can pan its camera and
    // raise its .annot-box to full opacity while the lecturer types –
    // otherwise the audience view keeps the box at rest-state opacity
    // and doesn't shift the stage, so viewers can't read what's being
    // written. Cleared on blur, which also signals the pan-reset.
    annotEditingId: annotEditingId,
    openExp: openExp ? { chunkIdx: openExp.chunkIdx, expIdx: openExp.expIdx } : null,
    // Camera framing so the peer mirrors the exact viewport, not just which
    // slide is active: the manual drag-pan offset (layout-space dx/dy, shared
    // directly since both views do camera math in layout space and share the
    // audience aspect above), plus overview scale and the framed chunk.
    panDx: manualPan.dx,
    panDy: manualPan.dy,
    // Overview travels in the snapshot rather than in a side-channel
    // message. It used to be its own postMessage type handled only on the
    // audience side, which meant audience→speaker never synced and the
    // speaker could sit in normal-camera mode while adopting the
    // audience's overview drag-pan – driving its stage off screen.
    overview: overview,
    overviewScale: overviewScale,
    overviewAnchorIdx: overviewAnchorIdx,
    selectedIdx: selectedIdx,
  };
}
function broadcastState() {
  if (!shouldBroadcast()) return;
  sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
}
// Camera pan travels as a lightweight message during a drag (rAF-throttled)
// so the peer follows smoothly without re-running the full-snapshot apply
// 60×/second. The same fields also ride every state snapshot (above) so a
// navigation or a freshly (re)connected peer still lands on the right pan.
function broadcastPan() {
  if (!shouldBroadcast()) return;
  sendToPeer({
    type: 'pan', source: VIEW,
    dx: manualPan.dx, dy: manualPan.dy,
    overviewScale, overviewAnchorIdx, selectedIdx,
  });
}
let panBroadcastScheduled = false;
function schedulePanBroadcast() {
  if (panBroadcastScheduled) return;
  panBroadcastScheduled = true;
  requestAnimationFrame(() => { panBroadcastScheduled = false; broadcastPan(); });
}
// Apply a peer's camera framing (from a 'pan' message or a state snapshot).
// Clamped to the same range the local wheel handler enforces, so a peer
// running an older build can't push us to an unreachable scale.
function applyRemoteCamera(dx, dy, ovScale, selIdx, anchorIdx) {
  manualPan.dx = dx || 0;
  manualPan.dy = dy || 0;
  if (typeof ovScale === 'number' && ovScale > 0) {
    overviewScale = Math.max(OVERVIEW_MIN_SCALE, Math.min(OVERVIEW_MAX_SCALE, ovScale));
  }
  const inRange = (n) => typeof n === 'number' && n >= 0 && n < flatChunks.length;
  if (inRange(selIdx)) {
    selectedIdx = selIdx;
    // Only paint the outline while the mode is actually on: the snapshot
    // keeps carrying selectedIdx after an exit, and re-adding the class
    // here would undo the teardown setOverviewMode just did.
    if (overview) {
      flatChunks.forEach((c, i) => c.el.classList.toggle('overview-selected', i === selIdx));
    }
  }
  if (inRange(anchorIdx)) overviewAnchorIdx = anchorIdx;
}
function applyRemoteState(payload) {
  isApplyingRemote = true;
  try {
    unfocusFigure();
    state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, payload.activeIdx || 0));
    state.collapse = COLLAPSE_MODES.includes(payload.collapse) ? payload.collapse : 'topic-bold';
    state.zoom = payload.zoom || 1.35;
    state.autoFit = !!payload.autoFit;
    // Track the peer's collapsed zoom rather than syncing it as a field.
    // Both windows see the same zoom values, so remembering the one that
    // was live in topic-bold keeps the two in step without widening the
    // protocol. See speaker.md §3.
    if (state.collapse === 'topic-bold') collapsedZoom = state.zoom;
    state.blanked = !!payload.blanked;
    if (payload.font && FONT_CYCLE.includes(payload.font)) state.font = payload.font;
    if (payload.theme && THEME_CYCLE.includes(payload.theme)) state.theme = payload.theme;
    if (payload.slideNums && SLIDE_NUM_MODES.includes(payload.slideNums)) state.slideNums = payload.slideNums;
    applyFontTheme();
    // Speaker mirrors the audience window's aspect so its preview area
    // lays out content identically. Ignored on audience side (its own
    // window dimensions are the source of truth).
    if (VIEW === 'speaker' && payload.audienceW > 0 && payload.audienceH > 0) {
      setSlideRef(payload.audienceW, payload.audienceH);
    }
    replaceContents(revealed, payload.revealed);
    replaceContents(annotations, payload.annotations);
    // Reflect annotation text into the textareas so the other view sees
    // keystrokes landing in real time. A draft (annotations[id]) wins
    // over the source-prefilled defaultValue; if the draft is gone (e.g.
    // the speaker cleared it after export), fall back to defaultValue so
    // the Markdown-authored annotation stays visible.
    flatChunks.forEach(c => {
      const ta = c.el.querySelector('.annot-textarea');
      if (!ta) return;
      const v = (c.id in annotations) ? annotations[c.id] : ta.defaultValue;
      if (ta.value !== v) { ta.value = v; autosize(ta); }
      c.el.classList.toggle('has-annot', !!v.trim());
    });
    // Mirror the remote editing state: only the peer that owns the
    // focused textarea acts as editor, but both views raise the box
    // opacity and pan their stage to the same off-center position so
    // the audience can read along while the speaker types. focusCamera
    // reads annotEditingId below.
    const remoteEditingId = payload.annotEditingId || null;
    if (annotEditingId !== remoteEditingId) {
      if (annotEditingId) {
        const prev = flatChunks.find(c => c.id === annotEditingId);
        if (prev) prev.el.classList.remove('annot-visible');
      }
      annotEditingId = remoteEditingId;
      if (annotEditingId) {
        const cur = flatChunks.find(c => c.id === annotEditingId);
        if (cur) cur.el.classList.add('annot-visible', 'has-annot');
      }
    }
    applyBlankBadge();
    // Overview first: it decides which projection focusCamera picks, and
    // entering/leaving zeroes manualPan – so it has to run before the
    // camera fields are restored from the payload below.
    setOverviewMode(!!payload.overview, { selectActive: false });
    // Mirror the peer's camera framing before the camera is drawn below, so
    // focusCamera / applyOverviewCamera pick up the same drag-pan, overview
    // scale, and framed chunk.
    applyRemoteCamera(payload.panDx, payload.panDy, payload.overviewScale, payload.selectedIdx, payload.overviewAnchorIdx);
    // Expansions: close any current, open the remote one if any. toggleExp
    // calls applyState internally, so skip the second call in that branch.
    closeAnyExpansion();
    if (payload.openExp) {
      toggleExp(payload.openExp.chunkIdx, payload.openExp.expIdx);
    } else {
      applyState();
    }
    applyRevealAll();
    // The payload carries the zoom the lecturer chose. Whether this window
    // can show it on this chunk without cutting a code line off is a local
    // question, and it is asked after applyState has written the incoming
    // value to --zoom.
    clampZoomToWidth();
    saveActive();
    focusCamera(false);
  } finally {
    isApplyingRemote = false;
  }
}
window.addEventListener('message', (ev) => {
  // Same-origin only. Until ::: embed there were no other windows posting
  // here, so any sender could be adopted as the peer; a third-party iframe
  // now lives *inside* this window, and one object message from it would
  // have captured the peer slot - after which every state snapshot, blank,
  // toast and address went to the frame instead of the projector, silently.
  // Both live views are the same origin as each other by construction
  // (two file:// pages, or two pages off the same --serve).
  if (ev.origin !== SELF_ORIGIN) return;
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  if (m.source === VIEW) return; // ignore our own postings (shouldn't happen, defensive)
  // Adopt sender as peer. Handles two cases: audience reload while
  // speaker is alive (speaker's next push reconnects us); audience
  // first hearing from a speaker that booted via opener.
  if (ev.source && ev.source !== window) setPeer(ev.source);
  if (m.type === 'hello' && VIEW === 'audience') {
    sendToPeer({ type: 'state', source: 'audience', payload: snapshot() });
    return;
  }
  if (m.type === 'state') {
    applyRemoteState(m.payload);
    return;
  }
  if (m.type === 'video') { applyRemoteVideo(m); return; }
  // A diagram the other window edited. Its own message rather than a field
  // of the snapshot, following the video precedent and for the same reason:
  // applyRemoteState is a *full* apply, so folding an edit into the snapshot
  // would drag the receiver's slide position along with it.
  // Addressed by the diagram's own id, never by index, so reordering a chunk
  // cannot mis-target it – the lesson data-fig-id already carries for video.
  // Gated by the freeze flag on the sending side, like any shared state.
  if (m.type === 'diagram-edit') {
    if (window.psiApplyDiagramEdit) window.psiApplyDiagramEdit(m);
    return;
  }
  if (m.type === 'embed') { applyRemoteEmbed(m); return; }
  // Address overlay, outside the snapshot for the same reason as blank:
  // it is a command aimed at the projection, not shared navigation state.
  if (m.type === 'link-show') {
    showLinkOverlay(m.href, m.label);
    return;
  }
  if (m.type === 'link-hide') {
    hideLinkOverlay();
    return;
  }
  // Blank travels outside the snapshot so it still lands while frozen.
  if (m.type === 'blank' && VIEW === 'audience') {
    state.blanked = !!m.blanked;
    document.body.classList.toggle('blanked', state.blanked);
    applyBlankBadge();
    return;
  }
  // A toast the audience handed over because a cockpit is open. Shown
  // directly rather than via flashMode, which would bounce it back.
  if (m.type === 'toast') {
    showModeBadge(m.text);
    return;
  }
  // Aspect-only update: the audience window was resized (full screen, a
  // projector renegotiating its resolution). Re-letterboxes the speaker's
  // stage without touching which slide it is showing.
  if (m.type === 'slide-ref' && VIEW === 'speaker') {
    // setSlideRef re-runs sizeStageViewport, which rebuilds the strip, so
    // the thumbnails pick up the new --audience-aspect too.
    if (m.w > 0 && m.h > 0) setSlideRef(m.w, m.h);
    return;
  }
  if (m.type === 'pan') {
    isApplyingRemote = true;
    try {
      applyRemoteCamera(m.dx, m.dy, m.overviewScale, m.selectedIdx, m.overviewAnchorIdx);
      focusCamera(true);
    } finally { isApplyingRemote = false; }
    return;
  }
  if (m.type === 'cursor' && VIEW === 'audience') {
    showLaserPointer(m.chunkIdx, m.x, m.y, m.target);
  }
  if (VIEW === 'audience') {
    if (m.type === 'figure-focus') {
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll(FOCUSABLE_SEL)[m.figureIdx];
        if (el) focusFigure(el);
      }
      return;
    }
    if (m.type === 'figure-pan') {
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll(FOCUSABLE_SEL)[m.figureIdx];
        if (el) panToElement(el);
      }
      return;
    }
    if (m.type === 'figure-unfocus') { unfocusFigure(); return; }
    if (m.type === 'figure-view') {
      if (!focusedFigure) return;
      figureScale = Math.max(FIG_MIN_SCALE, Math.min(FIG_MAX_SCALE, m.scale || 1));
      figurePan = { x: m.panX || 0, y: m.panY || 0 };
      applyFigureTransform();
      return;
    }
  }
});

// Laser pointer – audience-only mirror of the speaker's mouse position.
// chunkIdx + percentage coords let the receiver position relative to
// its own copy of the active chunk (so different zoom levels still align).
const laserEl = document.getElementById('laser-pointer');
let laserHideTimer = null;
function showLaserPointer(chunkIdx, px, py, target) {
  if (!laserEl) return;
  if (chunkIdx < 0) { hideLaserPointer(); return; }
  let r;
  if (target === 'figure') {
    // Position relative to the audience's own focused card. If no figure
    // is focused locally (e.g. the focus message hasn't arrived yet),
    // drop the dot rather than render at a stale chunk position.
    if (!focusedFigure) { hideLaserPointer(); return; }
    r = focusedFigure.getBoundingClientRect();
  } else {
    if (chunkIdx !== state.activeIdx) { hideLaserPointer(); return; }
    const entry = flatChunks[chunkIdx];
    if (!entry) return;
    r = entry.el.getBoundingClientRect();
  }
  laserEl.style.left = (r.left + px * r.width) + 'px';
  laserEl.style.top  = (r.top  + py * r.height) + 'px';
  laserEl.classList.add('visible');
  clearTimeout(laserHideTimer);
  laserHideTimer = setTimeout(hideLaserPointer, 500);
}
function hideLaserPointer() {
  if (laserEl) laserEl.classList.remove('visible');
  clearTimeout(laserHideTimer);
  laserHideTimer = null;
}

// Wraps each paragraph as <head><rest>, and within rest wraps bare text
// runs in .prose. Collapse mode "topic-bold" then hides .prose while
// keeping <strong> phrases visible.
// A rendered formula is a precise tree of nested spans whose CSS depends on
// that exact nesting, so the walker treats it as one opaque node: never
// descend into it, and never let its text content decide where a sentence
// ends. Without the first guard, wrapProse would inject span.prose elements
// between KaTeX's own spans and the formula would visibly fall apart.
function isMathNode(el) {
  return el.nodeType === 1 && (el.classList.contains('katex')
    || el.classList.contains('math-inline')
    || el.classList.contains('math-display'));
}

// A period only ends the topic sentence when it plausibly ends a sentence.
// Without the guards, "Kleinberg u. a. 2017" cuts the head short after "u."
// and the collapsed slide shows a dangling abbreviation. Two cheap signals
// cover the lecture corpus: a single letter or digit before the dot is an
// abbreviation or ordinal ("u.", "z.", "B.", "8. April"), and a lowercase
// continuation after it is no sentence start ("et al. 2017"). "!" and "?"
// are never abbreviation marks and always end the sentence. The trade-off:
// a sentence genuinely ending in a single character ("… um Faktor 3.") now
// keeps its continuation in the head – a too-long topic sentence, which is
// less broken than a truncated one.
const SENTENCE_ABBREVS = new Set(['bzw','ca','vgl','etc','usw','engl','sog',
  'inkl','zzgl','ggf','evtl','al','vs','resp','Nr','Dr','Prof','Abs','Art',
  'Kap','Abb','Tab','Aufl','Hrsg','Mio','Mrd','ff','ebd','St']);
function dotEndsSentence(before, after) {
  const tok = (before.match(/([\\p{L}\\p{N}]+)$/u) || [])[1];
  if (tok && (tok.length === 1 || SENTENCE_ABBREVS.has(tok))) return false;
  if (/^\\p{Ll}/u.test(after)) return false;
  return true;
}
function sentenceEndIn(text) {
  const re = /[.!?](?=\\s)/g;
  let m;
  while ((m = re.exec(text))) {
    if (text[m.index] !== '.') return m.index;
    const after = text.slice(m.index + 1).replace(/^\\s+/, '');
    if (dotEndsSentence(text.slice(0, m.index), after)) return m.index;
  }
  return -1;
}
function tailEndsSentence(text) {
  const t = text.trimEnd();
  if (!/[.!?]$/.test(t)) return false;
  if (t.endsWith('.')) return dotEndsSentence(t.slice(0, -1), '');
  return true;
}

function splitSentencesIn(root) {
  const wrapProse = (node) => {
    for (const k of [...node.childNodes]) {
      if (k.nodeType === 3 && k.textContent.trim()) {
        const span = document.createElement('span');
        span.className = 'prose';
        span.appendChild(document.createTextNode(k.textContent));
        node.replaceChild(span, k);
      } else if (isMathNode(k)) {
        // Wrap rather than descend. A formula in continuation prose has to
        // disappear with the sentence it belongs to, or the collapsed slide
        // shows a bare symbol with none of the words that gave it meaning.
        // Wrapping hides it by the same rule as the surrounding text while
        // leaving KaTeX's internal markup untouched.
        const span = document.createElement('span');
        span.className = 'prose';
        node.replaceChild(span, k);
        span.appendChild(k);
      } else if (k.nodeType === 1 && k.tagName !== 'STRONG' && !k.classList.contains('prose')) {
        wrapProse(k);
      }
    }
  };
  root.querySelectorAll('p').forEach(p => {
    if (p.querySelector('.sentence-head')) return;
    // Explicit-slide blocks opt out of sentence extraction: the author has
    // already said what belongs on screen, so splitting their paragraphs
    // into head/rest would only give the collapse CSS something to hide.
    if (p.closest('.slide-explicit, .script-only')) return;
    const head = document.createElement('span'); head.className = 'sentence-head';
    const rest = document.createElement('span'); rest.className = 'sentence-rest';
    let mode = 'head';
    for (const k of [...p.childNodes]) {
      if (mode === 'head' && k.nodeType === 3) {
        const idx = sentenceEndIn(k.nodeValue);
        if (idx !== -1) {
          head.appendChild(document.createTextNode(k.nodeValue.slice(0, idx + 1)));
          rest.appendChild(document.createTextNode(k.nodeValue.slice(idx + 1)));
          mode = 'rest';
        } else head.appendChild(k.cloneNode(true));
      } else if (mode === 'head') {
        head.appendChild(k.cloneNode(true));
        // KaTeX renders a hidden MathML copy alongside the visible HTML, so
        // a formula's textContent is not the text the reader sees and must
        // not be tested for a sentence-ending period.
        if (k.nodeType === 1 && !isMathNode(k) && tailEndsSentence(k.textContent)) mode = 'rest';
      }
      else rest.appendChild(k.cloneNode(true));
    }
    p.textContent = '';
    p.appendChild(head);
    if (rest.childNodes.length) {
      wrapProse(rest);
      p.appendChild(rest);
    }
  });
}

// State
// Visible in the speaker window whenever the room is blanked, and in the
// audience only when no speaker window exists to carry it. Recomputed on
// every state application because the peer can appear or go away at any
// time – S spawns one, closing it takes it away again.
const blankBadge = document.getElementById('blank-badge');
function applyBlankBadge() {
  if (!blankBadge) return;
  const show = state.blanked && (VIEW === 'speaker' || !hasLivePeer());
  blankBadge.classList.toggle('hidden', !show);
}

function applyState() {
  document.body.dataset.collapse = state.collapse;
  document.documentElement.style.setProperty('--zoom', state.zoom);
  document.body.classList.toggle('blanked', state.blanked);
  applyBlankBadge();
  flatChunks.forEach((c, i) => c.el.classList.toggle('active', i === state.activeIdx));
  updateEmbedLoading();
  viewHooks.onActiveChange();
  broadcastState();
}

// A chunk's forward beats: the reveal segments after the first, plus one
// per diagram step, in document order. Making diagram steps beats on the
// existing counter rather than a mechanism of their own is what buys the
// whole feature its sync, its backward-navigation rule, its freeze gating
// and its localStorage recovery for free – revealed[chunkId] was already
// all of that, and it is still the only state involved. Document order
// also gets the interleaving right: a diagram inside segment 1 advances
// only once segment 1 is up.
function chunkBeats(el) {
  const out = [];
  let segIdx = 0;
  el.querySelectorAll('.reveal-segment, svg.psi-diagram').forEach(node => {
    // A diagram inside an expansion body is not on the projection, so its
    // steps must not consume beats – Space would advance a counter and the
    // room would see nothing happen.
    if (node.closest('.exp-body, .chunk-expansion')) return;
    if (node.classList.contains('reveal-segment')) {
      if (segIdx++ > 0) out.push({ type: 'seg', el: node });
      return;
    }
    const d = node.psiDiagram;
    if (!d || d.data.n < 2) return;
    for (let s = 1; s < d.data.n; s++) out.push({ type: 'diag', d, step: s });
  });
  return out;
}
// Positions, not beats: 1 means "in the chunk, nothing advanced yet", which
// is the convention jumpTo and advanceReveal were already written against.
function countSegments(el) {
  const beats = chunkBeats(el).length;
  if (beats) return beats + 1;
  return el.querySelector('.reveal-segment') ? 1 : 0;
}
function applyReveal(el, id, instant) {
  const beats = chunkBeats(el);
  const total = countSegments(el);
  const consumed = Math.max(0, (revealed[id] ?? (total ? 1 : 0)) - 1);
  const segs = el.querySelectorAll('.reveal-segment');
  if (segs[0]) { segs[0].removeAttribute('data-hidden'); segs[0].removeAttribute('data-next'); }
  const steps = new Map();
  beats.forEach(b => { if (b.type === 'diag' && !steps.has(b.d)) steps.set(b.d, 0); });
  beats.forEach((b, i) => {
    const on = i < consumed;
    if (b.type === 'seg') {
      if (on) b.el.removeAttribute('data-hidden');
      else b.el.setAttribute('data-hidden', '');
      // Mark the one segment that Space or Down will bring up next. Only the
      // speaker's stylesheet reacts to it, but the attribute is set in both
      // views so the two DOMs stay identical.
      if (i === consumed) b.el.setAttribute('data-next', '');
      else b.el.removeAttribute('data-next');
    } else if (on) {
      steps.set(b.d, Math.max(steps.get(b.d) || 0, b.step));
    }
  });
  // A chunk that is not on screen jumps rather than animates: applying the
  // stored reveal state to forty chunks at boot must not start forty tweens.
  const jump = instant || !el.classList.contains('active');
  steps.forEach((step, d) => dgStep(d, step, jump));
}
function applyRevealAll() {
  flatChunks.forEach(c => applyReveal(c.el, c.id));
}

// Camera – translate stage so the active slide is centered in the viewport.
function getOffset(el, parent) {
  let x = 0, y = 0, n = el;
  while (n && n !== parent) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}
function focusCamera(instant = false) {
  // The transform only frames correctly from a viewport at scroll origin.
  resetViewportScroll();
  if (overview) { applyOverviewCamera(instant); return; }
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  // Layout-space viewport dims: getBoundingClientRect is post-transform
  // (speaker's --stage-scale shrinks it visually) but chunk offsets live
  // in unscaled layout coords, so the math must stay in layout space.
  const vp = vpLayout();
  const { left, top, width, height } = getOffset(entry.el, stage);

  let tx, ty;
  if (annotEditingId === entry.id) {
    const contentEl = entry.el.querySelector('.chunk-content');
    const co = contentEl ? getOffset(contentEl, stage) : { left: left + width / 2 };
    tx = vp.width * 0.33 - co.left;
    ty = (height <= vp.height) ? vp.height / 2 - (top + height / 2) : vp.height * 0.05 - top;
  } else if (openExp && openExp.chunkIdx === state.activeIdx) {
    const body = entry.el.querySelector(\`.exp-body[data-exp-body="\${openExp.expIdx}"]\`);
    if (body) {
      const bo = getOffset(body, stage);
      tx = vp.width / 2 - (bo.left + bo.width / 2);
      ty = vp.height / 2 - (bo.top + bo.height / 2);
    } else {
      tx = vp.width / 2 - (left + width / 2);
      ty = vp.height / 2 - (top + height / 2);
    }
  } else {
    tx = vp.width / 2 - (left + width / 2);
    ty = (height <= vp.height) ? vp.height / 2 - (top + height / 2) : vp.height * 0.05 - top;
  }

  // Manual pan offset from drag (§5: zoom-induced overflow). Reset on chunk change.
  tx += manualPan.dx; ty += manualPan.dy;

  if (instant) stage.style.transition = 'none';
  stage.style.transform = \`translate(\${tx}px, \${ty}px)\`;
  if (instant) requestAnimationFrame(() => { stage.style.transition = ''; });
}

// Overview camera: translate-and-scale to center the anchor chunk at
// --overview-scale. The anchor is set when overview opens (the active
// chunk) and whenever the selection is moved *by keyboard or search* –
// never by a mouse click, so clicking a thumbnail leaves the stage
// exactly where it is.
function applyOverviewCamera(instant = false) {
  const entry = flatChunks[overviewAnchorIdx] || flatChunks[state.activeIdx];
  if (!entry) return;
  const vp = vpLayout();
  const { left, top, width, height } = getOffset(entry.el, stage);
  const s = overviewScale;
  const tx = vp.width / 2 - (left + width / 2) * s + manualPan.dx;
  const ty = vp.height / 2 - (top + height / 2) * s + manualPan.dy;
  if (instant) stage.style.transition = 'none';
  stage.style.transform = \`translate(\${tx}px, \${ty}px) scale(\${s})\`;
  if (instant) requestAnimationFrame(() => { stage.style.transition = ''; });
}

// Move the overview selection outline. opts.recenter decides whether the
// camera follows: a mouse click must NOT move the stage (the thumbnail
// you clicked has to stay under the cursor), while keyboard selection
// and search-commit do move, because the target can be off screen.
// Recentring re-anchors *and* drops the accumulated drag-pan – leaving
// the old offset in place would shove the freshly centred chunk right
// back out by however far you had dragged.
function setSelectedIdx(idx, opts = {}) {
  if (idx < 0 || idx >= flatChunks.length) return;
  flatChunks.forEach((c, i) => c.el.classList.toggle('overview-selected', i === idx));
  selectedIdx = idx;
  if (!overview) return;
  if (opts.recenter) {
    overviewAnchorIdx = idx;
    manualPan = { dx: 0, dy: 0 };
    applyOverviewCamera(false);
  }
  broadcastPan();
}

// Column-wise selection jump in overview: land on the first chunk of the
// next/previous column. Mirrors nextCol/prevCol, but moves the selection
// rather than the live slide.
function selectOverviewCol(dir) {
  const cur = flatChunks[selectedIdx];
  if (!cur) return;
  if (dir > 0) {
    for (let i = selectedIdx + 1; i < flatChunks.length; i++) {
      if (flatChunks[i].colIdx > cur.colIdx) return setSelectedIdx(i, { recenter: true });
    }
    return setSelectedIdx(flatChunks.length - 1, { recenter: true });
  }
  for (let i = selectedIdx - 1; i >= 0; i--) {
    if (flatChunks[i].colIdx < cur.colIdx) {
      let j = i;
      while (j > 0 && flatChunks[j - 1].colIdx === flatChunks[i].colIdx) j--;
      return setSelectedIdx(j, { recenter: true });
    }
  }
  setSelectedIdx(0, { recenter: true });
}

// Single entry point for entering/leaving overview, used by both the
// local hotkeys and applyRemoteState. Idempotent, so re-applying an
// unchanged remote flag costs nothing.
//   opts.landOnSelected – on exit, make the selected chunk the live one
//                         (O lands, Esc keeps the original)
//   opts.selectActive   – on entry, seed the selection from activeIdx.
//                         Off for remote applies, where the payload's
//                         own selectedIdx/anchor land right afterwards.
function setOverviewMode(on, opts = {}) {
  if (!!on === overview) return;
  if (on) {
    overview = true;
    document.body.classList.add('overview-mode');
    manualPan = { dx: 0, dy: 0 };
    overviewAnchorIdx = state.activeIdx;
    if (opts.selectActive !== false) setSelectedIdx(state.activeIdx);
    applyOverviewCamera(false);
    return;
  }
  endSearch();
  overview = false;
  document.body.classList.remove('overview-mode');
  manualPan = { dx: 0, dy: 0 };
  if (opts.landOnSelected && selectedIdx !== state.activeIdx) {
    state.activeIdx = selectedIdx;
    applyState();
    saveActive();
  }
  flatChunks.forEach(c => c.el.classList.remove('overview-selected'));
  focusCamera(false);
}

// Local (user-driven) transitions broadcast a full snapshot, which is
// what carries the overview flag to the peer in both directions.
function exitOverview(landOnSelected) {
  if (!overview) return;
  setOverviewMode(false, { landOnSelected });
  broadcastState();
}

function toggleOverview() {
  setOverviewMode(!overview, { landOnSelected: true });
  broadcastState();
}

function dismissOverviewNoMove() { exitOverview(false); }

// TOC panel – flat list of named columns (see renderAudience).
function toggleToc() {
  tocVisible = !tocVisible;
  document.body.classList.toggle('toc-visible', tocVisible);
  if (tocVisible) markTocActive();
}
function markTocActive() {
  const curColIdx = flatChunks[state.activeIdx]?.colIdx;
  document.querySelectorAll('nav#toc li').forEach(li => {
    li.classList.toggle('toc-active', parseInt(li.dataset.tocCol, 10) === curColIdx);
  });
}
function jumpToColumn(colIdx) {
  const idx = flatChunks.findIndex(c => c.colIdx === colIdx);
  if (idx >= 0) jumpTo(idx, idx < state.activeIdx ? 'back' : 'forward');
}

// Fulltext search (PRD §5) – active only in overview. Each keystroke filters
// chunks: matches get a highlight outline, non-matches fade to 0.1 opacity.
const searchInput = document.getElementById('search-input');
// Search is a hit list, not only a highlight on the board. Highlighting
// alone assumed the reader was looking at the overview and could see where
// the match was; most matches are off screen, and in a long lecture the
// useful question is "which slide says this", which a list answers and a
// fade does not. It opens from anywhere for the same reason: needing to be
// in overview first made it useless as the mid-lecture jump tool it is.
const searchPanel = document.getElementById('search-panel');
const searchResults = document.getElementById('search-results');
let searchHits = [];
let searchCursor = 0;
let searchIndex = null;

function escText(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  ));
}

// Built once. Reading textContent per keystroke over a 36-chunk lecture is
// cheap, but the heading/tag split is not, and it never changes.
function buildSearchIndex() {
  searchIndex = flatChunks.map((c, idx) => {
    const headEl = c.el.querySelector('.chunk-heading');
    // Read the tag off the element, not off a rendered label: the live
    // views stopped printing the eyebrow, and the search list is exactly
    // the place where naming the kind of slide is still useful.
    const tagName = c.el.dataset.tag && c.el.dataset.tag !== 'free' ? c.el.dataset.tag : '';
    const bodyEl = c.el.querySelector('.chunk-body');
    const mainEl = c.el.querySelector('.chunk-heading .hd-main');
    const subEl = c.el.querySelector('.chunk-heading .hd-sub');
    const clean = (n) => (n ? n.textContent : '').replace(/\\s+/g, ' ').trim();
    // The body has to be cleaned on a copy: an inlined SVG carries its own
    // style block, and textContent hands back the CSS rules as if they were
    // prose. Searching for a word then hit slides whose figure merely
    // mentioned it in a selector. Labels inside the drawing stay indexed,
    // which is the part worth searching.
    const cleanBody = (n) => {
      if (!n) return '';
      const copy = n.cloneNode(true);
      copy.querySelectorAll('style, script').forEach((s) => s.remove());
      return copy.textContent.replace(/\\s+/g, ' ').trim();
    };
    const title = clean(mainEl) || clean(headEl);
    const sub = mainEl ? clean(subEl) : '';
    const body = cleanBody(bodyEl);
    return {
      idx,
      tag: tagName,
      title: title || '(untitled)',
      sub,
      body,
      hay: (title + ' ' + sub + ' ' + body).toLowerCase(),
    };
  });
}

// A snippet centred on the match, so the reader sees the sentence rather
// than the slide title alone.
function contextFor(entry, q) {
  const lower = entry.body.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) return '';
  const start = Math.max(0, at - 45);
  const end = Math.min(entry.body.length, at + q.length + 75);
  const pre = (start > 0 ? '…' : '') + entry.body.slice(start, at);
  const hit = entry.body.slice(at, at + q.length);
  const post = entry.body.slice(at + q.length, end) + (end < entry.body.length ? '…' : '');
  return escText(pre) + '<mark>' + escText(hit) + '</mark>' + escText(post);
}

function startSearch() {
  if (!searchIndex) buildSearchIndex();
  searchActive = true;
  document.body.classList.add('search-active');
  searchPanel.classList.remove('hidden');
  searchInput.value = '';
  searchHits = [];
  searchCursor = 0;
  renderSearchResults('');
  searchInput.focus();
}

function endSearch() {
  if (!searchActive) return;
  searchActive = false;
  document.body.classList.remove('search-active');
  searchPanel.classList.add('hidden');
  searchInput.blur();
  searchInput.value = '';
  searchHits = [];
  flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
}

function renderSearchResults(q) {
  if (!q) {
    searchResults.innerHTML = '<li class="sr-empty">type to search headings and body text</li>';
    return;
  }
  if (!searchHits.length) {
    searchResults.innerHTML = '<li class="sr-empty">no slide matches ' + escText(q) + '</li>';
    return;
  }
  searchResults.innerHTML = searchHits.map((entry, i) => {
    const tag = entry.tag ? '<span class="sr-tag">' + escText(entry.tag) + '</span>' : '';
    const ctx = contextFor(entry, q);
    const sub = entry.sub ? '<span class="sr-sub">' + escText(entry.sub) + '</span>' : '';
    return '<li role="option" data-hit="' + i + '" aria-selected="' + (i === searchCursor) + '">'
      + '<span class="sr-title">' + tag + escText(entry.title) + sub + '</span>'
      + (ctx ? '<span class="sr-context">' + ctx + '</span>' : '')
      + '</li>';
  }).join('');
  const sel = searchResults.querySelector('[aria-selected=true]');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function updateSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchHits = [];
    searchCursor = 0;
    flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
    renderSearchResults('');
    return;
  }
  searchHits = searchIndex.filter(e => e.hay.includes(q));
  searchCursor = 0;
  const hitIdx = new Set(searchHits.map(e => e.idx));
  // Keep the board dimming too: when the panel is open over the overview,
  // the two reinforce each other.
  flatChunks.forEach((c, i) => {
    c.el.classList.toggle('search-match', hitIdx.has(i));
    c.el.classList.toggle('search-miss', !hitIdx.has(i));
  });
  renderSearchResults(q);
  followSearchCursor();
}

// Move the board selection along with the highlighted hit, so a match that
// is off screen becomes visible while the reader is still typing.
function followSearchCursor() {
  if (!overview) return;
  const hit = searchHits[searchCursor];
  if (hit) setSelectedIdx(hit.idx, { recenter: true });
}

function moveSearchCursor(delta) {
  if (!searchHits.length) return;
  searchCursor = (searchCursor + delta + searchHits.length) % searchHits.length;
  renderSearchResults(searchInput.value.trim().toLowerCase());
  followSearchCursor();
}

function commitSearchHit() {
  const hit = searchHits[searchCursor];
  endSearch();
  if (!hit) return;
  if (overview) {
    setSelectedIdx(hit.idx, { recenter: true });
    exitOverview(true);
  } else if (hit.idx !== state.activeIdx) {
    jumpTo(hit.idx, hit.idx > state.activeIdx ? 'forward' : 'back');
  }
}

// Nav
function jumpTo(idx, direction) {
  if (idx < 0 || idx >= flatChunks.length) return;
  if (annotEditingId) blurAnnotation();
  // Moving on retires the address: it belonged to the slide you left.
  dismissLinkOverlay();
  if (focusedFigure) unfocusFigure();
  closeAnyExpansion();
  // Reset drag pan on chunk change – pan is per-chunk inspection.
  manualPan = { dx: 0, dy: 0 };

  const target = flatChunks[idx];
  const segCount = countSegments(target.el);
  if (revealed[target.id] === undefined) {
    // First visit from any direction – show only the opening segment.
    // Backward nav only "re-reveals everything" when we're genuinely
    // returning to a chunk that's already been advanced; a chunk we've
    // never seen before should present itself fresh even if approached
    // from ahead in the reading order.
    revealed[target.id] = segCount ? 1 : 0;
  } else if (direction === 'back') {
    // Revisit via backward nav: show fully revealed (§4.6).
    revealed[target.id] = segCount;
  }
  // Forward revisit: preserve whatever state it was in.
  applyReveal(target.el, target.id);

  state.activeIdx = idx;
  if (state.autoFit) fitZoomToChunk(2.2);
  else clampZoomToWidth();
  applyState();
  focusCamera(false);
  saveActive();
}

// A fragment in the address is an explicit request for one chunk, so it
// has to select it, not merely let the browser scroll the document to it:
// without this the deck stayed wherever its state was, the addressed chunk
// sat at the inactive opacity, and the first arrow key jumped away from it.
// It also outranks the position recovered from localStorage – the reader
// followed or typed that address, the stored index is only where they
// happened to stop last time.
function chunkIdxFromHash() {
  const raw = (location.hash || '').slice(1);
  if (!raw) return -1;
  let id = raw;
  try { id = decodeURIComponent(raw); } catch (e) {}
  return flatChunks.findIndex(c => c.id === id);
}
window.addEventListener('hashchange', () => {
  const idx = chunkIdxFromHash();
  if (idx < 0 || idx === state.activeIdx) return;
  jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
});

function advanceReveal() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  const segCount = countSegments(entry.el);
  const cur = revealed[entry.id] ?? (segCount ? 1 : 0);
  if (cur < segCount) {
    revealed[entry.id] = cur + 1;
    applyReveal(entry.el, entry.id);
    broadcastState();
    return true;
  }
  return false;
}

function nextChunk() {
  if (state.activeIdx + 1 >= flatChunks.length) return;
  jumpTo(state.activeIdx + 1, 'forward');
}
function prevChunk() {
  if (state.activeIdx <= 0) return;
  jumpTo(state.activeIdx - 1, 'back');
}
function nextCol() {
  const cur = flatChunks[state.activeIdx];
  for (let i = state.activeIdx + 1; i < flatChunks.length; i++) {
    if (flatChunks[i].colIdx > cur.colIdx) return jumpTo(i, 'forward');
  }
  jumpTo(flatChunks.length - 1, 'forward');
}
function prevCol() {
  const cur = flatChunks[state.activeIdx];
  const target = cur.colIdx;
  // jump to the first chunk of the previous column (or first chunk of current
  // column if we're not on it, so users can quickly rewind to the column head).
  let firstOfCur = state.activeIdx;
  while (firstOfCur > 0 && flatChunks[firstOfCur - 1].colIdx === target) firstOfCur--;
  if (state.activeIdx !== firstOfCur) return jumpTo(firstOfCur, 'back');
  for (let i = state.activeIdx - 1; i >= 0; i--) {
    if (flatChunks[i].colIdx < target) {
      // walk back to the head of that column
      let j = i;
      while (j > 0 && flatChunks[j - 1].colIdx === flatChunks[i].colIdx) j--;
      return jumpTo(j, 'back');
    }
  }
  jumpTo(0, 'back');
}

// Expansions
function closeAnyExpansion() {
  if (!openExp) return;
  const entry = flatChunks[openExp.chunkIdx];
  if (entry) {
    entry.el.classList.remove('expanded');
    entry.el.querySelectorAll('.exp-chev, .exp-body').forEach(x => x.classList.remove('on'));
  }
  openExp = null;
}
function toggleExp(chunkIdx, expIdx) {
  const entry = flatChunks[chunkIdx];
  if (!entry) return;
  const chev = entry.el.querySelector(\`.exp-chev[data-exp="\${expIdx}"]\`);
  const body = entry.el.querySelector(\`.exp-body[data-exp-body="\${expIdx}"]\`);
  if (!chev || !body) return;
  const same = openExp && openExp.chunkIdx === chunkIdx && openExp.expIdx === expIdx;
  closeAnyExpansion();
  if (!same) {
    chev.classList.add('on');
    body.classList.add('on');
    entry.el.classList.add('expanded');
    openExp = { chunkIdx, expIdx };
  }
  state.activeIdx = chunkIdx;
  applyState();
  requestAnimationFrame(() => requestAnimationFrame(() => focusCamera(false)));
}

// Annotations
function autosize(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, parseFloat(getComputedStyle(ta).lineHeight || 20)) + 'px';
}
function startAnnotate(chunkId) {
  const entry = flatChunks.find(c => c.id === chunkId);
  if (!entry) return;
  const ta = entry.el.querySelector('.annot-textarea');
  if (!ta) return;
  entry.el.classList.add('annot-visible', 'has-annot');
  state.activeIdx = flatChunks.indexOf(entry);
  applyState();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function blurAnnotation() {
  if (!annotEditingId) return;
  const entry = flatChunks.find(c => c.id === annotEditingId);
  if (entry) {
    const ta = entry.el.querySelector('.annot-textarea');
    if (ta) ta.blur();
  }
}
function wireAnnotations() {
  flatChunks.forEach(({ el, id }) => {
    const ta = el.querySelector('.annot-textarea');
    if (!ta) return;
    // Source-authored annotation is baked into ta.defaultValue by the
    // server render; a localStorage draft (if any) wins. An explicit
    // empty-string draft is honored — the lecturer deliberately cleared.
    if (id in annotations) ta.value = annotations[id];
    if (ta.value.trim()) el.classList.add('has-annot');
    autosize(ta);
    ta.addEventListener('input', () => {
      annotations[id] = ta.value;
      autosize(ta);
      el.classList.toggle('has-annot', !!ta.value.trim());
      saveAnnotations();
      broadcastState();
    });
    ta.addEventListener('focus', () => {
      annotEditingId = id;
      el.classList.add('annot-visible');
      autosize(ta);
      requestAnimationFrame(() => requestAnimationFrame(() => focusCamera(false)));
      // Tell the peer so it can raise its box opacity and mirror the pan.
      broadcastState();
    });
    ta.addEventListener('blur', () => {
      if (annotEditingId === id) annotEditingId = null;
      el.classList.remove('annot-visible');
      setTimeout(() => focusCamera(false), 20);
      // Signals the peer to drop .annot-visible and pan back to center.
      broadcastState();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { ta.blur(); e.preventDefault(); }
    });
  });
}

function wireClicks() {
  flatChunks.forEach((entry, idx) => {
    entry.el.addEventListener('click', (ev) => {
      // Overview: a click is a decision, so it lands on the slide and
      // leaves the board in one gesture. A drag is not a click – the
      // pointerdown handler swallows the synthesized click past a 3px
      // move threshold, so panning the board still never navigates.
      if (overview) { setSelectedIdx(idx, { recenter: false }); exitOverview(true); return; }
      if (ev.target.closest('.annot-textarea')) return;
      if (ev.target.closest('[data-annot-add]')) { startAnnotate(entry.id); return; }
      if (ev.target.closest('.annot-box')) { startAnnotate(entry.id); return; }
      const chev = ev.target.closest('[data-exp]');
      if (chev) { toggleExp(idx, parseInt(chev.dataset.exp, 10)); return; }
      if (annotEditingId === entry.id) { blurAnnotation(); return; }
      if (idx !== state.activeIdx) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
    });
  });
  // TOC column buttons: jump camera + close TOC.
  document.querySelectorAll('nav#toc li').forEach(li => {
    const btn = li.querySelector('button');
    if (!btn) return;
    const colIdx = parseInt(li.dataset.tocCol, 10);
    btn.addEventListener('click', () => {
      jumpToColumn(colIdx);
      tocVisible = false;
      document.body.classList.remove('toc-visible');
    });
  });
}

// Collapse toggle: 'none' (show everything) ↔ 'topic-bold' (topic + bold).
const COLLAPSE_MODES = ['none', 'topic-bold'];
const COLLAPSE_LABEL = { 'none': 'show everything', 'topic-bold': 'topic + bold' };

// The two collapse modes carry very different amounts of text, so one zoom
// cannot serve both. The collapsed slide is the projector setting the
// lecturer chose and it is never touched automatically; the full-text mode
// gets a zoom computed on entry so the whole chunk fits the screen, which
// is what stops the C key from being followed by a row of minus presses.
// Leaving full text restores the remembered collapsed zoom exactly.
let collapsedZoom = state.zoom;
// Auto-fit only ever shrinks. Growing would be a surprise nobody asked
// for: a short chunk would jump to huge type on a keypress that the
// lecturer pressed to see more text, not bigger text.
const FULL_FIT_FILL = 0.94;   // leave a little air top and bottom

// Height alone does not decide whether a chunk fits. A long code line does
// not wrap, so a chunk can sit comfortably inside the available height and
// still push its content off the side of the screen. The elements that can
// do that are the ones whose content refuses to reflow – code blocks,
// tables, display maths – so they are collected once per fit and only the
// short resulting list is re-measured on each zoom step, rather than
// walking the whole subtree every iteration.
const NOWRAP_SEL = 'pre, table, .katex-display';

// Returns a predicate over the one chunk's non-reflowing elements. Built
// once per fit so the repeated zoom steps re-measure a short list instead of
// walking the subtree again. Sub-pixel layout rounding makes an exact
// comparison report phantom overflow on content that fits, so allow a pixel
// of slack.
function nowrapProbe(el) {
  const wide = [el].concat(Array.from(el.querySelectorAll(NOWRAP_SEL)));
  return () => wide.some((n) => n.scrollWidth > n.clientWidth + 1);
}

// ceiling: the largest zoom the fit is allowed to reach. Entering the full
// text on its own must never grow the type past what the lecturer chose for
// the projector – they pressed C to see more text, not bigger text. In
// auto-fit mode the ceiling is the global maximum instead, because there
// the whole point is that every slide is sized to the screen.
function fitZoomToChunk(ceiling) {
  const entry = flatChunks[state.activeIdx];
  const el = entry && entry.el;
  if (!el || !viewport) return;
  const cap = ceiling === undefined ? collapsedZoom : ceiling;
  const avail = viewport.clientHeight * FULL_FIT_FILL;
  if (!(avail > 0)) return;
  const overflowsX = nowrapProbe(el);
  if (el.scrollHeight <= avail && !overflowsX() && state.zoom >= cap) return;  // nothing to gain

  // A single proportional estimate is not enough, because zoom changes line
  // wrapping and therefore height, and it is not safe either: solving for
  // "exactly fills" lets a correction pass grow the zoom back over the
  // edge. So estimate once to get close, then walk in the real zoom
  // increment until the invariant holds, and only then try to give the
  // reclaimed space back. Without that last step the compounding of a
  // safety factor and the 0.05 rounding left chunks a quarter smaller than
  // they needed to be.
  const STEP = 0.05;
  let z = clampZoom(state.zoom * (avail / el.scrollHeight));
  if (z > cap) z = cap;
  applyZoom(z);

  // Shrink until it fits, in both directions.
  while ((el.scrollHeight > avail || overflowsX()) && z > 0.6) {
    z = clampZoom(z - STEP);
    applyZoom(z);
  }
  // Grow back while it still fits, never past the ceiling.
  while (z + STEP <= cap) {
    const probe = clampZoom(z + STEP);
    applyZoom(probe);
    if (el.scrollHeight > avail || overflowsX()) { applyZoom(z); break; }
    z = probe;
  }
}

// With auto-fit off the zoom is the lecturer's, and it is deliberately never
// touched automatically. That choice is global, though, and horizontal
// overflow is not: one chunk with a long code line loses its right-hand
// column while every other slide is fine, and nothing on screen says so. You
// find out in the lecture hall.
//
// So this shrinks that one chunk, only far enough to stop cutting, and it is
// the only automatic zoom change outside auto-fit mode. Three properties are
// load-bearing:
//
//   - it never writes collapsedZoom, and it always re-derives *from* it
//     rather than from whatever it last applied, so it is idempotent and the
//     lecturer's setting comes back untouched on the next chunk;
//   - it only ever shrinks – the ceiling is the chosen zoom;
//   - the shrunk value is local to this window (see snapshot()), because the
//     projection and the cockpit's stage are different sizes and each has to
//     answer the question for itself.
//
// Returns true when it had to shrink, so the caller can say so.
function clampZoomToWidth() {
  if (state.autoFit) return false;                    // auto-fit fits both directions already
  if (state.collapse !== 'topic-bold') return false;  // full text has its own fit on entry
  const entry = flatChunks[state.activeIdx];
  const el = entry && entry.el;
  if (!el) return false;
  const overflowsX = nowrapProbe(el);
  let z = clampZoom(collapsedZoom);
  applyZoom(z);
  while (overflowsX() && z > 0.6) {
    z = clampZoom(z - 0.05);
    applyZoom(z);
  }
  return z < collapsedZoom;
}

// Auto-fit mode: every slide gets a zoom that makes it fit, in both collapse
// modes, until it is switched off again. Distinct from the fit that happens
// on entering the full text, which is a one-off and never grows the type.
function toggleAutoFit() {
  state.autoFit = !state.autoFit;
  if (state.autoFit) fitZoomToChunk(2.2);
  else {
    applyZoom(state.collapse === 'topic-bold' ? collapsedZoom : state.zoom);
    clampZoomToWidth();
  }
  applyState();
  focusCamera(false);
  flashMode(state.autoFit ? 'auto-fit on · every slide sized to the screen' : 'auto-fit off · manual zoom');
}

// Zoom
// What + and – step from. On a chunk that clampZoomToWidth had to shrink,
// state.zoom is what this slide can show, not what the lecturer asked for –
// stepping from it would land back on the same clamped value and the key
// would read as dead. Step from the choice instead, so the setting really
// moves even when this one slide cannot follow it.
function zoomBase() {
  return (!state.autoFit && state.collapse === 'topic-bold') ? collapsedZoom : state.zoom;
}
function clampZoom(z) {
  return Math.round(Math.max(0.6, Math.min(2.2, z)) * 20) / 20;
}
// Write the zoom without the announcement or the broadcast, for the
// automatic fit which would otherwise flash a number on every C press.
function applyZoom(z) {
  state.zoom = clampZoom(z);
  document.documentElement.style.setProperty('--zoom', state.zoom);
}

function cycleCollapse(dir = 1) {
  const i = COLLAPSE_MODES.indexOf(state.collapse);
  const ni = (i + dir + COLLAPSE_MODES.length) % COLLAPSE_MODES.length;
  const leavingCollapsed = state.collapse === 'topic-bold';
  if (leavingCollapsed) collapsedZoom = state.zoom;
  state.collapse = COLLAPSE_MODES[ni];
  applyState();
  if (state.autoFit) fitZoomToChunk(2.2);
  else if (state.collapse === 'none') fitZoomToChunk();
  else { applyZoom(collapsedZoom); clampZoomToWidth(); }
  focusCamera(false);
  broadcastState();
  flashMode('collapse: ' + COLLAPSE_LABEL[state.collapse]);
}

function setZoom(z) {
  state.zoom = clampZoom(z);
  document.documentElement.style.setProperty('--zoom', state.zoom);
  // A manual adjustment in the collapsed view is the setting to remember;
  // in full text it is a one-off correction of the automatic fit and must
  // not overwrite what the lecturer chose for the projector.
  if (state.collapse === 'topic-bold') collapsedZoom = state.zoom;
  // The new setting is remembered whatever this chunk can show of it, but
  // the announcement has to report what is actually on screen – otherwise +
  // on a width-limited slide reads as a key that does nothing.
  const limited = clampZoomToWidth();
  setTimeout(() => focusCamera(false), 30);
  broadcastState();
  flashMode('zoom: ' + state.zoom.toFixed(2) + '×' + (limited ? ' · limited by this slide' : ''));
}

// Help overlay – single toggle for the ? key and the corner button.
const helpOverlay = document.getElementById('help-overlay');
const helpButton = document.getElementById('help-button');
function helpVisible() { return helpOverlay && !helpOverlay.classList.contains('hidden'); }
function toggleHelp(force) {
  if (!helpOverlay) return;
  const show = force === undefined ? !helpVisible() : !!force;
  helpOverlay.classList.toggle('hidden', !show);
}
if (helpButton) helpButton.addEventListener('click', () => toggleHelp(true));
// Click anywhere on the scrim closes; clicks inside the panel do not, so
// the reference stays open while you read it and try a key.
if (helpOverlay) {
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) toggleHelp(false);
  });
}

// ── video ───────────────────────────────────────────────────────────
// A clip is the one element on a slide the lecturer *operates* rather than
// just shows, so the two windows have to agree on it: pressing play in the
// cockpit has to start the projection, and scrubbing has to land the room
// in the same place. Addressed by data-fig-id rather than by index, because
// unlike figure focus this survives an author reordering the chunk.
//
// Gated by the freeze flag like any other broadcast: a frozen projection
// should not start playing because the lecturer previewed something.
let applyingRemoteVideo = false;
function videoByFigId(figId) {
  // Compared in JS rather than built into an attribute selector. A fig-id is
  // now sometimes a full URL, and CSS.escape escapes for an *identifier*,
  // not for a quoted attribute value – it happened to survive because CSS
  // unescapes inside quotes, which is luck, not a contract.
  for (const fig of document.querySelectorAll('.figure-video')) {
    if (fig.dataset.figId === figId) return fig.querySelector('video');
  }
  return null;
}
function wireVideos() {
  document.querySelectorAll('.figure-video').forEach((fig) => {
    const v = fig.querySelector('video');
    const figId = fig.dataset.figId;
    if (!v || !figId) return;
    const send = (action) => {
      if (applyingRemoteVideo || !shouldBroadcast()) return;
      sendToPeer({ type: 'video', source: VIEW, figId, action, time: v.currentTime });
    };
    v.addEventListener('play', () => send('play'));
    v.addEventListener('pause', () => send('pause'));
    // 'seeked', not 'seeking': one message when the handle lands, rather
    // than a stream of them while it is dragged.
    v.addEventListener('seeked', () => send('seek'));
  });
}
function applyRemoteVideo(m) {
  const v = videoByFigId(m.figId);
  if (!v) return;
  applyingRemoteVideo = true;
  try {
    if (typeof m.time === 'number' && Math.abs(v.currentTime - m.time) > 0.35) {
      v.currentTime = m.time;
    }
    if (m.action === 'play') { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    else if (m.action === 'pause') v.pause();
  } finally {
    // Cleared on a later task: the play/pause the line above triggers
    // arrives as an event of its own, and echoing it back would ping-pong.
    setTimeout(() => { applyingRemoteVideo = false; }, 0);
  }
}

// ── hosted embeds ───────────────────────────────────────────────────
// Two jobs. First, refuse to show a player that cannot work: YouTube needs
// a real origin, and a deck opened from disk has none, so from file:// the
// frame is replaced by an instruction card rather than left to render its
// own Error 153 in front of a room. Vimeo has no such constraint.
//
// Second, keep the two windows together. Both providers speak a postMessage
// control protocol – YouTube's is the one its own IFrame API uses, unlocked
// by enablejsapi=1 – so play and pause travel between projection and
// cockpit with no SDK loaded and no licence to honour.
const EMBED_NEEDS_ORIGIN = { youtube: true, vimeo: false, generic: false };

function embedCommand(frameWin, provider, action) {
  if (!frameWin) return;
  try {
    if (provider === 'youtube') {
      frameWin.postMessage(JSON.stringify({
        event: 'command', func: action === 'play' ? 'playVideo' : 'pauseVideo', args: [],
      }), '*');
    } else if (provider === 'vimeo') {
      frameWin.postMessage(JSON.stringify({ method: action === 'play' ? 'play' : 'pause' }), '*');
    }
  } catch (e) { /* a frame that is gone or refuses is not worth a throw */ }
}

function wireEmbeds() {
  const onFile = location.protocol === 'file:';
  document.querySelectorAll('.figure-embed').forEach((fig) => {
    if (!(onFile && EMBED_NEEDS_ORIGIN[fig.dataset.embedProvider])) return;
    // Swap the frame for an instruction card rather than let the player
    // render its own Error 153 in front of a room.
    const frame = fig.querySelector('.embed-frame');
    if (!frame) return;
    frame.className = 'embed-blocked';
    frame.innerHTML =
      '<strong>This player needs the lecture served over http.</strong>' +
      '<div>A page opened from a file has no origin, and YouTube refuses to play without one.</div>' +
      '<div><code>node build.js &lt;source.md&gt; --serve</code></div>' +
      '<div>The address below works in any case.</div>';
  });
}

// Load a hosted player only once its chunk is the one on screen, and drop it
// again on the way out. Three reasons, in order of weight: a lecture must not
// open connections to a third party for slides nobody showed; clearing the
// src is also the only reliable way to stop a cross-origin player when you
// move on, since it will happily keep playing behind you; and a deck with
// several embeds otherwise pays for all of them at load.
//
// Nothing autoplays. Arriving at the slide gives you a loaded player waiting
// on its play button - starting it is the lecturer's move, and the room
// following is what the sync below is for.
function updateEmbedLoading() {
  const active = flatChunks[state.activeIdx];
  document.querySelectorAll('.figure-embed').forEach((fig) => {
    const ifr = fig.querySelector('iframe');
    if (!ifr) return;                       // swapped for the instruction card
    const isActive = !!active && active.el.contains(fig);
    if (isActive) {
      if (!ifr.getAttribute('src')) {
        ifr.setAttribute('src', ifr.dataset.src);
        // YouTube only reports state to a parent that has announced itself
        // on the widget channel, and only once the document is up.
        if (fig.dataset.embedProvider === 'youtube') {
          ifr.addEventListener('load', () => setTimeout(() => {
            try {
              ifr.contentWindow.postMessage(
                JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
            } catch (e) {}
          }, 300), { once: true });
        }
      }
    } else if (ifr.getAttribute('src')) {
      ifr.removeAttribute('src');
    }
  });
}

// Relay the lecturer's play/pause to the other window. There is no reliable
// way to observe a click *inside* a cross-origin frame, so the cockpit sends
// on the provider's own state events (YouTube) or player events (Vimeo).
let applyingRemoteEmbed = false;
function embedFigByUrl(url) {
  for (const fig of document.querySelectorAll('.figure-embed')) {
    if (fig.dataset.embedUrl === url) return fig;
  }
  return null;
}
window.addEventListener('message', (ev) => {
  const o = String(ev.origin || '');
  if (!/youtube|vimeo/.test(o)) return;
  let d = ev.data;
  try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
  if (!d || typeof d !== 'object') return;
  // Which of our frames sent this?
  let fig = null;
  for (const f of document.querySelectorAll('.figure-embed')) {
    const ifr = f.querySelector('iframe');
    if (ifr && ifr.contentWindow === ev.source) { fig = f; break; }
  }
  if (!fig) return;
  let action = null;
  if (fig.dataset.embedProvider === 'youtube' && d.info && typeof d.info.playerState === 'number') {
    if (d.info.playerState === 1) action = 'play';
    else if (d.info.playerState === 2) action = 'pause';
  } else if (fig.dataset.embedProvider === 'vimeo') {
    if (d.event === 'play') action = 'play';
    else if (d.event === 'pause') action = 'pause';
  }
  if (!action || applyingRemoteEmbed || !shouldBroadcast()) return;
  sendToPeer({ type: 'embed', source: VIEW, url: fig.dataset.embedUrl, action });
});
function applyRemoteEmbed(m) {
  const fig = embedFigByUrl(m.url);
  if (!fig) return;
  const ifr = fig.querySelector('iframe');
  if (!ifr) return;
  applyingRemoteEmbed = true;
  try { embedCommand(ifr.contentWindow, fig.dataset.embedProvider, m.action); }
  finally { setTimeout(() => { applyingRemoteEmbed = false; }, 400); }
}

// ── links ───────────────────────────────────────────────────────────
// A plain click opens the link in a new tab of whichever window was
// clicked. In the cockpit that is the lecturer checking a source, which is
// what they usually want; the deck itself never navigates away, because the
// renderer puts target="_blank" on external links.
//
// Shift-click instead shows the address on *both* screens, large. That is
// the deliberate answer to "can I open a tab on the projector": you could,
// but then the lecturer is driving a browser they cannot see, and the room
// is watching someone else's UI instead of the lecture. What a room
// actually needs from a link during a talk is to write it down. So the
// projection gets the URL to read, not a page to watch, and the cockpit
// shows the identical overlay so the lecturer knows exactly what went up.
const linkOverlay = document.getElementById('link-overlay');
const linkOverlayUrl = document.getElementById('link-overlay-url');
const linkOverlayLabel = document.getElementById('link-overlay-label');
const linkOverlayQr = document.getElementById('link-overlay-qr');
function linkOverlayVisible() {
  return !!linkOverlay && !linkOverlay.classList.contains('hidden');
}
function showLinkOverlay(href, label) {
  if (!linkOverlay) return;
  linkOverlayUrl.textContent = href;
  linkOverlayUrl.href = href;
  linkOverlayLabel.textContent = label && label !== href ? label : 'link';
  // Pre-rendered at build time, keyed by address. A link that is not in the
  // source (there is currently no way to reach one) simply gets no code
  // rather than an encoder in the browser.
  linkOverlayQr.innerHTML = (typeof LINK_QR === 'object' && LINK_QR[href]) || '';
  linkOverlay.classList.remove('hidden');
}
function hideLinkOverlay() {
  if (linkOverlay) linkOverlay.classList.add('hidden');
}
// Dismissing has to reach both screens, or the room is left staring at a
// URL the lecturer has already moved on from.
function dismissLinkOverlay() {
  if (!linkOverlayVisible()) return;
  hideLinkOverlay();
  sendToPeer({ type: 'link-hide', source: VIEW });
}
// Clicking the backdrop dismisses; clicking the address itself opens it in a
// new tab of this window and leaves the overlay up, so the room keeps the
// address on screen while the lecturer goes and looks. Selecting the text
// must not dismiss either, hence the collapsed-selection check.
if (linkOverlay) {
  linkOverlay.addEventListener('click', (e) => {
    if (e.target.closest('#link-overlay-url')) return;
    const s = window.getSelection();
    if (s && !s.isCollapsed) return;
    dismissLinkOverlay();
  });
}
// Capture phase: this has to beat the stage's own click handling, which
// would otherwise treat the click as a chunk select.
document.addEventListener('click', (e) => {
  if (!e.shiftKey) return;
  // External only. A cross-reference resolves to a file:// path with a
  // fragment, which is noise on a projector and has no QR behind it.
  const a = e.target.closest && e.target.closest('#stage a[href^="http"]');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  const href = a.href;
  const label = (a.textContent || '').trim();
  showLinkOverlay(href, label);
  // Ungated by freeze, like blank: showing the room an address is an
  // explicit act aimed at the projection, not shared navigation state.
  sendToPeer({ type: 'link-show', source: VIEW, href, label });
  if (VIEW === 'speaker') flashMode('address shown on the projection');
}, true);

// ── text selection ──────────────────────────────────────────────────
// The live views disable selection globally: drag pans the stage, and a
// stray highlight on the projection is a distraction that never stops being
// one. But "let me copy that definition" is a real request, from the
// lecturer mid-talk and from anyone reading the deck afterwards.
//
// Hold Alt rather than toggling a mode. A mode is state you can forget you
// are in – and the state you forget here is the one where dragging no
// longer pans, which is exactly the wrong surprise mid-lecture. Selecting
// is a momentary act, so a held key matches it.
//
// The class deliberately outlives the keyup while a selection exists: let
// go of Alt to reach Cmd-C and user-select would snap back to none, which
// in Chrome discards the highlight you just made.
let altSelectHeld = false;
function hasTextSelection() {
  const s = window.getSelection();
  return !!s && !s.isCollapsed && String(s).trim().length > 0;
}
function setSelecting(on) {
  document.body.classList.toggle('text-selecting', on);
}
function endSelecting() {
  const s = window.getSelection();
  if (s) s.removeAllRanges();
  setSelecting(false);
}
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Alt' || altSelectHeld) return;
  // Same guard the main key handler uses. Without it, reaching for Alt while
  // typing a note fires the toast - and on the audience that toast is
  // relayed, so it lands in the lecturer's face mid-sentence.
  if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable=true]')) return;
  altSelectHeld = true;
  setSelecting(true);
  flashMode('select text while Alt is held · Esc clears');
});
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt') return;
  altSelectHeld = false;
  if (!hasTextSelection()) setSelecting(false);
});
document.addEventListener('selectionchange', () => {
  if (!altSelectHeld && !hasTextSelection()) setSelecting(false);
});
// Alt-Tab away and the keyup never arrives, which would strand the stage in
// a state where dragging silently stops panning.
window.addEventListener('blur', () => {
  altSelectHeld = false;
  if (!hasTextSelection()) setSelecting(false);
});

// Mode badge
let modeTimer = null;
function showModeBadge(text) {
  modeBadge.textContent = text;
  modeBadge.classList.add('visible');
  if (modeTimer) clearTimeout(modeTimer);
  modeTimer = setTimeout(() => modeBadge.classList.remove('visible'), 1800);
}
// A mode toast is feedback for the lecturer, so it belongs on the screen the
// lecturer is looking at – the cockpit – no matter which window the key was
// pressed in. The room should not have to watch "auto-fit on" slide across
// the projection. The audience only shows toasts when it is running alone.
function flashMode(text) {
  if (VIEW === 'audience' && hasLivePeer()) {
    sendToPeer({ type: 'toast', source: VIEW, text: text });
    return;
  }
  showModeBadge(text);
}

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('.annot-textarea')) return;
  // Search input: Enter commits, Esc exits search; other keys bubble to input.
  if (e.target === searchInput) {
    if (e.key === 'Enter') { commitSearchHit(); e.preventDefault(); }
    else if (e.key === 'Escape') { endSearch(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { moveSearchCursor(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { moveSearchCursor(-1); e.preventDefault(); }
    // typing is handled by the 'input' event listener on the input
    return;
  }
  if (e.target.matches('input,textarea')) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  // A browser or system shortcut is not a slide command. Every binding here
  // is a bare letter, so Cmd-C reached the c case and toggled the collapse
  // instead of copying the selection – on a view that has an Alt-to-select
  // mode, which makes copying something a reader is invited to do. The same
  // held for Cmd-A, Cmd-F, Cmd-P and Ctrl-R.
  //
  // Shift is deliberately absent from this list: Shift-N, Shift-E, Shift-V
  // and the reverse-cycling Shift-C are real bindings. Alt is here even
  // though holding Alt alone starts text selection – that listener tests the
  // key name, and Alt with a letter is a character on macOS, not a command.
  // (No backticks in this comment: one would end the template literal.)
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // In overview the arrows move the *selection*, never the live slide.
  // They used to fall through to nextChunk/nextCol, which silently
  // re-pointed the active chunk while the visible outline stayed put –
  // so an Esc afterwards dropped you on a slide you never picked.
  if (overview) {
    switch (e.key) {
      case 'ArrowDown':  setSelectedIdx(selectedIdx + 1, { recenter: true }); e.preventDefault(); return;
      case 'ArrowUp':    setSelectedIdx(selectedIdx - 1, { recenter: true }); e.preventDefault(); return;
      case 'ArrowRight': selectOverviewCol(1);  e.preventDefault(); return;
      case 'ArrowLeft':  selectOverviewCol(-1); e.preventDefault(); return;
    }
  }
  switch (e.key) {
    case 'ArrowRight': nextCol(); e.preventDefault(); break;
    case 'ArrowLeft':  prevCol(); e.preventDefault(); break;
    case 'ArrowUp':    prevChunk(); e.preventDefault(); break;
    case 'ArrowDown':
    case ' ': {
      // Down and Space are the same key. Down used to skip straight to the
      // next chunk, which meant walking a segmented slide with the arrows
      // silently swallowed every reveal on it – and remembering to switch
      // to Space for exactly those slides is the kind of thing that goes
      // wrong in front of a room. Advance the reveal; once the chunk is
      // fully out, fall through to the next one.
      if (overview) { e.preventDefault(); break; }
      if (!advanceReveal()) nextChunk();
      e.preventDefault(); break;
    }
    case 'Enter': {
      if (overview) { toggleOverview(); e.preventDefault(); break; }
      const entry = flatChunks[state.activeIdx];
      if (entry && entry.el.querySelector('.exp-chev[data-exp="0"]')) toggleExp(state.activeIdx, 0);
      e.preventDefault(); break;
    }
    case '1': case '2': case '3': case '4': case '5':
    case '6': case '7': case '8': case '9': {
      if (overview) break;
      const n = parseInt(e.key, 10) - 1;
      const entry = flatChunks[state.activeIdx];
      if (entry && entry.el.querySelector(\`.exp-chev[data-exp="\${n}"]\`)) toggleExp(state.activeIdx, n);
      e.preventDefault(); break;
    }
    case 'Escape': {
      // Help sits in front of everything, so it unwinds first.
      if (helpVisible()) { toggleHelp(false); e.preventDefault(); break; }
      // The address overlay covers both screens, so it unwinds early – and
      // on both, or the room would be left staring at a URL.
      if (linkOverlayVisible()) { dismissLinkOverlay(); e.preventDefault(); break; }
      // A live highlight is the most recent thing the user did, so it is
      // the first thing Esc should take back.
      if (hasTextSelection()) { endSelecting(); e.preventDefault(); break; }
      if (focusedFigure) {
        unfocusFigure();
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
        break;
      }
      if (tocVisible) { tocVisible = false; document.body.classList.remove('toc-visible'); break; }
      if (overview) { dismissOverviewNoMove(); break; }
      if (annotEditingId) { blurAnnotation(); break; }
      if (manualPan.dx || manualPan.dy) { manualPan = { dx: 0, dy: 0 }; focusCamera(false); break; }
      if (openExp) { closeAnyExpansion(); broadcastState(); setTimeout(() => focusCamera(false), 20); }
      break;
    }
    case 'n': case 'N': {
      if (overview) break;
      // Shift-N on speaker: force-open the private notes pane and
      // focus it (even when empty/collapsed). Plain N keeps the
      // existing behavior – audience-mirrored annotations.
      if (VIEW === 'speaker' && e.shiftKey && typeof focusNotesPane === 'function') {
        focusNotesPane();
        e.preventDefault(); break;
      }
      const entry = flatChunks[state.activeIdx];
      if (entry) viewHooks.onN(entry);
      e.preventDefault(); break;
    }
    case 'c': case 'C': cycleCollapse(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case 'f': case 'F': cycleFont(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case 'a': case 'A': cycleTheme(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case 'l': case 'L': cycleSlideNums(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case 'o': case 'O': toggleOverview(); e.preventDefault(); break;
    case 't': case 'T': toggleToc(); e.preventDefault(); break;
    case '/': startSearch(); e.preventDefault(); break;
    case '#': toggleAutoFit(); e.preventDefault(); break;
    case '+': case '=':
      if (focusedFigure) setFigureScale(figureScale * 1.2);
      else setZoom(zoomBase() + 0.1);
      e.preventDefault(); break;
    case '-': case '_':
      if (focusedFigure) setFigureScale(figureScale / 1.2);
      else setZoom(zoomBase() - 0.1);
      e.preventDefault(); break;
    case '0':
      if (focusedFigure) {
        resetFigureView();
        applyFigureTransform();
        broadcastFigureView();
      } else setZoom(1.35);
      e.preventDefault(); break;
    case 'b': case 'B':
      state.blanked = !state.blanked;
      applyState();
      // Blanking is a command to the projector, so it outranks the freeze
      // gate. Without this line, hitting B while frozen would toast
      // "projection blanked" at a projection that stayed lit – the one
      // failure that has to not happen, since B is what you reach for when
      // something must come off the screen now.
      if (VIEW === 'speaker') {
        sendToPeer({ type: 'blank', source: VIEW, blanked: state.blanked });
      }
      flashMode(state.blanked ? 'projection blanked' : 'projection back');
      e.preventDefault(); break;
    case 'p': case 'P':
      window.open('print.html', '_blank');
      e.preventDefault(); break;
    case 'e': case 'E':
      // Shift-E on the speaker copies live annotation drafts to the
      // clipboard for paste-back into source.md. Plain E is unbound.
      if (VIEW === 'speaker' && e.shiftKey && typeof exportAnnotations === 'function') {
        exportAnnotations();
        e.preventDefault();
      }
      break;
    case 'v': case 'V':
      // V freezes the projection – phonetically close enough to "freeze" to
      // stick, and F is already the font cycle. Rearranging this window is
      // the rarer, less urgent act, so it moves to Shift-V.
      if (VIEW !== 'speaker') break;
      if (e.shiftKey) {
        if (typeof togglePreviewOrientation === 'function') togglePreviewOrientation();
      } else if (typeof toggleFreeze === 'function') {
        toggleFreeze();
      }
      e.preventDefault(); break;
    case 's': case 'S':
      // Only in audience: open the speaker window and remember it as our peer.
      if (VIEW === 'audience') {
        const w = window.open('speaker.html', 'psi-slides-speaker', 'width=1400,height=900');
        setPeer(w);
        e.preventDefault();
      }
      break;
    case '?': toggleHelp(); e.preventDefault(); break;
  }
});

// Search input: live-filter on every keystroke.
searchInput.addEventListener('input', updateSearch);
// Clicking a hit is the same commitment as Enter on it. mousedown rather
// than click, because the input loses focus first and a click would then
// land after endSearch has already torn the list down.
searchResults.addEventListener('mousedown', (e) => {
  const li = e.target.closest('[data-hit]');
  if (!li) return;
  e.preventDefault();
  searchCursor = parseInt(li.dataset.hit, 10) || 0;
  commitSearchHit();
});

// Overview: wheel adjusts scale, pointer drag pans.
viewport.addEventListener('wheel', (e) => {
  if (!overview) return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  overviewScale = Math.max(OVERVIEW_MIN_SCALE, Math.min(OVERVIEW_MAX_SCALE, overviewScale * factor));
  applyOverviewCamera(false);
  schedulePanBroadcast();
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
  // Skip drag on interactive children so click-to-select still works.
  if (e.target.closest('button, textarea, input, .annot-box, .exp-chev, .annot-add, nav#toc')) return;
  // While Alt-selection is live the same gesture means "highlight this",
  // so the camera must keep its hands off it.
  if (document.body.classList.contains('text-selecting')) return;
  // Two pan modes share this handler: in overview, any drag pans; in
  // normal view, plain drag pans (chunk-local, reset on navigation).
  // The 3px movement threshold below keeps plain clicks (chunk select,
  // figure focus) intact – only an actual drag flips into pan mode.
  const mode = overview ? 'overview' : 'view';
  // Don't setPointerCapture eagerly: it would re-target pointerup to
  // viewport, breaking the synthesized click on the underlying chunk.
  // Use window-level listeners and only enter "dragging" after a real move.
  const session = { x: e.clientX, y: e.clientY, dx0: manualPan.dx, dy0: manualPan.dy, moved: false, mode };
  const dragClass = mode === 'overview' ? 'overview-dragging' : 'view-panning';
  const apply = mode === 'overview' ? applyOverviewCamera : focusCamera;
  const move = (ev) => {
    const dx = ev.clientX - session.x, dy = ev.clientY - session.y;
    if (!session.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      session.moved = true;
      document.body.classList.add(dragClass);
    }
    if (!session.moved) return;
    manualPan.dx = session.dx0 + dx;
    manualPan.dy = session.dy0 + dy;
    apply(true);
    schedulePanBroadcast();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) return;
    document.body.classList.remove(dragClass);
    broadcastPan(); // final position, exact (past any dropped throttle frame)
    // Swallow the synthesized click that follows a real drag, so a pan
    // doesn't accidentally select/jump on mouse-up.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// A narrower window can start cutting a code line that fitted a moment ago,
// and a wider one gives the lecturer's zoom back – clampZoomToWidth always
// re-derives from the chosen value, so it does both.
window.addEventListener('resize', () => { clampZoomToWidth(); focusCamera(true); });

// ── figure focus / marginalia pan (§figures) ────────────────────────
// Click a <figure>, a <pre>, or a .marginalia inside the active chunk
// to "focus" it: figures/pre land in a centered overlay with the slide
// dimmed underneath; .marginalia instead pans the camera right so the
// aside is centered in the viewport (no overlay – it's in-frame).
const figureOverlay = document.getElementById('figure-overlay');
let focusedFigure = null;
// Per-focus zoom + pan: +/− keys (and wheel) scale; drag pans. Reset
// every time a new figure gets focused so each one starts at 1x. Pan
// is in CSS px on the focus-target's layout box. The transform is
// applied with transform-origin: center, so the scale grows around
// the center of the card.
let figureScale = 1;
let figurePan = { x: 0, y: 0 };
const FIG_MIN_SCALE = 0.4;
const FIG_MAX_SCALE = 8;
function resetFigureView() {
  figureScale = 1;
  figurePan = { x: 0, y: 0 };
}
function applyFigureTransform() {
  if (!focusedFigure) return;
  focusedFigure.style.transform =
    'translate(' + figurePan.x + 'px, ' + figurePan.y + 'px) scale(' + figureScale + ')';
}
function setFigureScale(next) {
  figureScale = Math.max(FIG_MIN_SCALE, Math.min(FIG_MAX_SCALE, next));
  applyFigureTransform();
  broadcastFigureView();
}
function broadcastFigureView() {
  if (!shouldBroadcast()) return;
  sendToPeer({ type: 'figure-view', scale: figureScale, panX: figurePan.x, panY: figurePan.y });
}
function unfocusFigure() {
  if (!focusedFigure) return;
  focusedFigure.style.transform = '';
  focusedFigure = null;
  figureOverlay.replaceChildren();
  document.body.classList.remove('figure-focused');
  resetFigureView();
}
function focusFigure(el) {
  unfocusFigure();
  resetFigureView();
  const clone = el.cloneNode(true);
  clone.classList.add('figure-focus-target');
  clone.removeAttribute('id');
  figureOverlay.replaceChildren(clone);
  document.body.classList.add('figure-focused');
  focusedFigure = clone;
  applyFigureTransform();
  // A stepped diagram opens on the beat the slide is on, not on beat 0: the
  // clone carries whatever the emitter wrote statically, which is the *last*
  // beat. Same call the step runtime uses to keep it in sync from here on.
  const live = el.querySelector('svg.psi-diagram');
  const shown = clone.querySelector('svg.psi-diagram');
  if (live && shown && live.psiDiagram) dgRenderInto(shown, live.psiDiagram, live.psiDiagram.step);
}

// Overlay pointerdown: drag pans the focused figure; a click without
// drag closes (matches the previous click-to-unfocus affordance). 3px
// movement threshold mirrors the viewport-pan handler so a fingertip
// jitter still counts as a tap.
figureOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, textarea, input')) return;
  const session = {
    x: e.clientX, y: e.clientY,
    panX0: figurePan.x, panY0: figurePan.y,
    moved: false,
  };
  const move = (ev) => {
    const dx = ev.clientX - session.x, dy = ev.clientY - session.y;
    if (!session.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      session.moved = true;
      document.body.classList.add('figure-dragging');
    }
    if (!session.moved) return;
    figurePan = { x: session.panX0 + dx, y: session.panY0 + dy };
    applyFigureTransform();
    broadcastFigureView();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) {
      // Pure click → close (preserve previous click-to-unfocus UX).
      unfocusFigure();
      if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
      return;
    }
    document.body.classList.remove('figure-dragging');
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// Wheel zoom while focused. deltaY > 0 = scroll-down = zoom out, the
// natural direction for trackpad pinch (browsers translate pinch to
// wheel + ctrlKey on macOS but the sign is the same).
figureOverlay.addEventListener('wheel', (e) => {
  if (!focusedFigure) return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  setFigureScale(figureScale * factor);
}, { passive: false });

// Pan the camera so that a given element inside the active chunk lands
// centered horizontally in the viewport. Used for .marginalia clicks so
// the right-margin aside becomes the focal point without leaving the
// slide. Math lives in stage-local layout space so the speaker's
// transform:scale on the viewport doesn't break the calculation.
function panToElement(el) {
  const vp = vpLayout();
  const activeEntry = flatChunks[state.activeIdx];
  if (!activeEntry) return;
  const ao = getOffset(activeEntry.el, stage);
  const eo = getOffset(el, stage);
  // manualPan.dx offsets relative to the chunk-centered camera, so:
  //   Δ = (ao_center_x) - (eo_center_x)
  const dx = (ao.left + ao.width / 2) - (eo.left + eo.width / 2);
  manualPan = { dx: dx, dy: manualPan.dy || 0 };
  focusCamera(false);
}

// Touch control rail (audience only). The element is rendered only
// in audience.html; speaker.html doesn't include it, so this no-ops
// there. CSS hides the rail on fine-pointer devices.
function wireTouchControls() {
  const bar = document.getElementById('touch-controls');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    switch (btn.dataset.action) {
      case 'prev':      prevChunk(); break;
      case 'next':      if (!advanceReveal()) nextChunk(); break;
      case 'overview':  toggleOverview(); break;
      case 'zoom-in':
        if (focusedFigure) setFigureScale(figureScale * 1.2);
        else setZoom(zoomBase() + 0.1);
        break;
      case 'zoom-out':
        if (focusedFigure) setFigureScale(figureScale / 1.2);
        else setZoom(zoomBase() - 0.1);
        break;
    }
  });
}

function wireFigureClicks() {
  flatChunks.forEach(({ el }) => {
    el.querySelectorAll(FOCUSABLE_SEL).forEach(target => {
      if (target.dataset.figureWired) return;
      target.dataset.figureWired = '1';
      target.addEventListener('click', (ev) => {
        if (overview) return;
        if (ev.target.closest('.annot-textarea, input, button')) return;
        const chunk = target.closest('.chunk');
        if (!chunk || !chunk.classList.contains('active')) return;
        ev.stopPropagation();
        ev.preventDefault();
        if (target.classList.contains('marginalia')) {
          panToElement(target);
          if (shouldBroadcast()) {
            const figureIdx = Array.from(chunk.querySelectorAll(FOCUSABLE_SEL)).indexOf(target);
            sendToPeer({ type: 'figure-pan', chunkIdx: state.activeIdx, figureIdx });
          }
          return;
        }
        focusFigure(target);
        if (shouldBroadcast()) {
          const figureIdx = Array.from(chunk.querySelectorAll(FOCUSABLE_SEL)).indexOf(target);
          sendToPeer({ type: 'figure-focus', chunkIdx: state.activeIdx, figureIdx });
        }
      });
    });
  });
}

// Boot
loadPersisted();
// After loadPersisted, so an address with a fragment wins over the
// remembered position rather than the other way round.
const bootHashIdx = chunkIdxFromHash();
if (bootHashIdx >= 0) state.activeIdx = bootHashIdx;
applyFontTheme();
document.querySelectorAll('.reveal-segment').forEach(seg => splitSentencesIn(seg));
wireAnnotations();
wireVideos();
wireEmbeds();
wireClicks();
wireFigureClicks();
wireTouchControls();
initDiagrams();
applyRevealAll();
applyState();
// Two rAFs so fonts have a chance to settle before the first camera solve.
requestAnimationFrame(() => requestAnimationFrame(() => {
  // A lecture that opens with auto-fit has to fit its *first* slide too.
  // jumpTo does this on every later move; nothing calls it at boot.
  if (state.autoFit) fitZoomToChunk(2.2);
  else clampZoomToWidth();
  focusCamera(true);
}));
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (state.autoFit) fitZoomToChunk(2.2);
    else clampZoomToWidth();
    focusCamera(true);
  });
}
`;

// ── speaker rendering ────────────────────────────────────────────────

function renderSpeaker(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  let columnsHtml = renderColumnsHtml(columns, frontmatter);
  if (!editorPayload(frontmatter, columnsHtml, 'speaker')) columnsHtml = stripDiagramAssets(columnsHtml);

  // Speaker-source notes are emitted as <template> fragments holding
  // the *raw* note text (joined with blank lines between blocks). The
  // notes-pane is an editable textarea: each chunk's source text is
  // the default; per-chunk overrides live in localStorage so the
  // speaker can rewrite notes during rehearsal without touching source.
  const noteTemplates = [];
  for (const col of columns) for (const c of col.chunks) {
    if (c.id && c.speakerNotes && c.speakerNotes.length) {
      const raw = c.speakerNotes.join('\n\n');
      noteTemplates.push(
        `<template data-notes-for="${escapeHtml(c.id)}">${escapeHtml(raw)}</template>`
      );
    }
  }

  // Scrubber: column buttons + chunk dots below.
  const scrubberHtml = columns.map((col, ci) => {
    const dots = col.chunks
      .map((c, xi) => `<span class="dot" data-col-idx="${ci}" data-chunk-idx="${xi}"></span>`)
      .join('');
    const label = col.heading ? escapeHtml(col.heading) : '·';
    return `<div class="col-entry" data-col-idx="${ci}">
      <button class="col-btn" type="button">${label}</button>
      <div class="dots">${dots}</div>
    </div>`;
  }).join('\n');

  const slug = frontmatter.lecture || frontmatter.course || '';
  const titleJson = jsonForScript(title);
  const defaults = viewDefaults(frontmatter);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – speaker</title>
<style>
${AUDIENCE_CSS}
${DIAGRAM_CSS}
${SPEAKER_CSS}
</style>
${fontStyleTag(opts.fontEmbed)}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body ${viewBodyAttrs(defaults, 'data-view="speaker"')}>
${themeBootScript(defaults)}
<div id="scrubber">
${scrubberHtml}
</div>
<div id="stage-cell">
  <div id="stage-viewport">
    <div id="stage">
${columnsHtml}
    </div>
  </div>
  <button id="add-note-btn" type="button" title="Open speaker notes (Shift-N)">+ note</button>
</div>
<aside id="notes-pane">
  <div id="notes-resizer" role="separator" aria-orientation="horizontal" title="Drag to resize notes · double-click to reset"></div>
  <textarea id="notes-content" rows="1" spellcheck="false" placeholder=""></textarea>
  <div id="notes-zoom">
    <button id="notes-zoom-out" type="button" title="Smaller notes text" aria-label="Smaller notes text">&minus;</button>
    <button id="notes-zoom-in" type="button" title="Larger notes text" aria-label="Larger notes text">+</button>
  </div>
</aside>
<div id="preview-strip"></div>
<div id="preview-resizer" role="separator" title="Drag to resize the preview strip · double-click to reset"></div>
<div id="figure-overlay" aria-hidden="true"></div>
<footer id="speaker-footer">
  <span id="timer">00:00</span>
  <button id="freeze-btn" type="button" aria-pressed="false">● live</button>
  <button id="preview-orient-btn" type="button" title="Preview strip: along the bottom or down the right edge (Shift-V)">⇄ layout</button>
  <button id="export-annot-btn" type="button" title="Copy live annotations as &gt; annot: Markdown (Shift-E)">export notes</button>
  <button id="speaker-help-btn" type="button" title="Keyboard and mouse reference (?)">? help</button>
  <span id="slug">${escapeHtml(slug)}</span>
  <span class="spacer"></span>
  <span class="kbd-hint"><kbd>V</kbd> freeze &nbsp; <kbd>B</kbd> blank &nbsp; <kbd>N</kbd> annot &nbsp; <kbd>Shift</kbd>-<kbd>N</kbd> notes &nbsp; <kbd>Shift</kbd>-<kbd>E</kbd> export</span>
</footer>
<div id="note-templates">
${noteTemplates.join('\n')}
</div>
${renderHelpOverlay('speaker', !!editorPayload(frontmatter, columnsHtml, 'speaker'))}
<div id="mode-badge"></div>
<div id="center-toast" role="status" aria-live="polite"></div>
${OVERVIEW_BADGE_HTML}
${SEARCH_PANEL_HTML}
${BLANK_BADGE_HTML}
${LINK_OVERLAY_HTML}
${renderTocNav(columns)}
<script>
const LECTURE_TITLE = ${titleJson};
const VIEW_DEFAULTS = ${jsonForScript(defaults)};
const LINK_QR = ${jsonForScript(linkQrMap(columnsHtml))};
${DIAGRAM_JS}
${AUDIENCE_JS}
${SPEAKER_JS}
</script>
${editorPayload(frontmatter, columnsHtml, 'speaker')}
</body>
</html>
`;
}

// ── speaker CSS (layered on top of AUDIENCE_CSS) ─────────────────────

const SPEAKER_CSS = `
body[data-view=speaker] {
  display: grid;
  /* scrubber · stage · notes (auto, collapses to 0 when empty) ·
     preview-strip · footer. The preview row carries its default inside the
     var() fallback rather than behind a "sized" class, so a dragged height
     needs no extra state and an unset one cannot invalidate the track list. */
  grid-template-rows: 3vh 1fr auto var(--preview-h, 22vh) 2.2rem;
  grid-template-columns: 1fr;
  overflow: hidden;
}
body[data-view=speaker]:not(.has-notes) #notes-pane { display: none; }
#note-templates { display: none; }

/* scrubber: thin top strip with column buttons + chunk dots */
#scrubber {
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 1.5em;
  padding: 0 1rem;
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
  font-family: var(--sans-font);
  font-size: 11px;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
}
.col-entry { display: flex; align-items: center; gap: 0.4em; flex-shrink: 0; }
.col-entry.active .col-btn { color: var(--emph); font-weight: 600; }
.col-btn {
  background: transparent;
  border: 0;
  padding: 0.2em 0.3em;
  font: inherit;
  color: var(--ink-soft);
  cursor: pointer;
  letter-spacing: 0.04em;
  max-width: 14em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-btn:hover { color: var(--ink); }
.dots { display: flex; gap: 3px; }
.dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--rule);
  cursor: pointer;
  transition: background 120ms;
}
.dot:hover { background: var(--ink-soft); }
.dot.active { background: var(--emph); }

/* row 2: stage – full width, letterbox bars left/right if audience
   aspect is narrower than the cell. */
#stage-cell {
  grid-row: 2;
  position: relative;
  min-width: 0;
  min-height: 0;
  /* Letterbox bars: slightly darker than paper so the frame is visible
     without competing visually. */
  background: oklch(from var(--paper) calc(l - 0.03) c h);
  overflow: hidden;
}
body[data-view=speaker] #stage-viewport {
  /* Full audience-size rectangle (slide-w × slide-h), visually shrunk
     by --stage-scale to fit #stage-cell. translate(-50%, -50%) centers
     it inside the cell; because translate percentages refer to the
     element's layout size (pre-scale), centering still lands correctly
     after the scale composes in. */
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--slide-w);
  height: var(--slide-h);
  transform: translate(-50%, -50%) scale(var(--stage-scale, 1));
  transform-origin: center center;
  box-shadow: 0 0 0 1px var(--rule);
}
/* row 3: speaker notes below the slide. Collapses to 0 when empty
   (body lacks .has-notes). Auto-sizes 1→3 lines based on content,
   sans-serif for projector legibility at a glance. */
#notes-pane {
  grid-row: 3;
  border-top: 1px solid var(--rule);
  background: var(--paper-warm);
  display: flex;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
/* Drag handle straddling the stage/notes seam. Visible only while the
   notes row is open (has-notes); ns-resize cursor invites the drag.
   Sits 3px above the border-top so the hit area straddles the seam. */
#notes-resizer {
  display: none;
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  height: 8px;
  cursor: ns-resize;
  z-index: 5;
  background: transparent;
  touch-action: none;
}
#notes-resizer::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 42px;
  height: 2px;
  background: var(--ink-soft);
  opacity: 0.35;
  border-radius: 1px;
  transition: opacity 0.15s, background-color 0.15s, width 0.15s;
}
#notes-resizer:hover::before { opacity: 0.8; width: 84px; }
body.notes-resizing #notes-resizer::before { opacity: 1; background: var(--emph); width: 84px; }
/* A 2px hairline is not self-explanatory, and "how do I make the notes
   bigger" is exactly the question this pane kept failing to answer. Name
   the gesture on hover instead of relying on the title attribute's delay. */
#notes-resizer::after {
  content: 'drag to resize · double-click resets';
  position: absolute;
  top: -1.15rem;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--sans-font);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  background: var(--paper);
  padding: 1px 6px;
  border: 1px solid var(--rule);
  border-radius: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
#notes-resizer:hover::after,
body.notes-resizing #notes-resizer::after { opacity: 1; }
body.has-notes #notes-resizer { display: block; }
/* When the user has dragged the resizer, swap the auto row for a fixed
   pixel height; the 1fr stage row absorbs the delta and the
   stage-cell ResizeObserver re-fits --stage-scale automatically, so the
   audience preview shrinks ratio-proportional. */
body[data-view=speaker].notes-sized {
  grid-template-rows: 3vh 1fr var(--notes-height, auto) var(--preview-h, 22vh) 2.2rem;
}
body[data-view=speaker].notes-sized #notes-content {
  height: 100% !important;
  box-sizing: border-box;
  overflow: auto;
}
#notes-content {
  flex: 1;
  width: 100%;
  border: 0;
  outline: 0;
  resize: none;
  /* Right padding reserves the corner for the two zoom buttons, so a long
     note line does not run underneath them. In px, not rem: the buttons are
     a fixed pixel size, and this padding has to clear them at any notes
     font size the reader picks. */
  padding: 0.6rem 88px 0.6rem 1rem;
  background: transparent;
  color: var(--ink);
  font-family: var(--sans-font);
  font-size: var(--notes-font, 1.15rem);
  line-height: 1.35;
  /* Box-sizing content so the textarea's scrollHeight calc is stable. */
  box-sizing: content-box;
  overflow: hidden;
  height: 1.35em;
}
#notes-content:focus {
  outline: 2px solid oklch(0.55 0.12 220);
  outline-offset: -2px;
  overflow: auto; /* allow scroll while editing if overflowing 3 lines */
}
#notes-content::placeholder {
  color: var(--ink-soft);
  font-style: italic;
}
/* Notes font zoom. Buttons only, no hotkey – see the runtime comment: this
   is the surface the lecturer types into, and every free letter is already
   a navigation command. Sits below the resizer's 8px hit strip so the two
   affordances do not fight over the same pixels. */
#notes-zoom {
  position: absolute;
  top: 7px; right: 10px;
  display: flex;
  gap: 5px;
  z-index: 6;
  /* Never fully faded: mid-lecture you need to see the target before you
     aim at it, and hover-to-reveal costs a second you do not have. */
  opacity: 0.55;
  transition: opacity 0.15s;
}
#notes-pane:hover #notes-zoom,
#notes-zoom:focus-within { opacity: 1; }
#notes-zoom button {
  /* 32px square. These are pressed while talking to a room, so the target
     has to be hittable without looking at it – 20px was a fiddly aim. */
  width: 32px; height: 32px;
  padding: 0;
  line-height: 1;
  font-family: var(--sans-font);
  font-size: 18px;
  border: 1px solid var(--rule);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink-soft);
  cursor: pointer;
}
#notes-zoom button:hover { color: var(--ink); border-color: var(--ink-soft); }

/* bottom: preview strip – horizontal scroll of all chunks, drag or
   wheel to pan, click to jump. The active slot is highlighted and
   automatically scrolled into view on chunk change. */
#preview-strip {
  grid-row: 4;
  /* Explicit, not auto: #preview-resizer shares this cell, and grid
     auto-placement *avoids* an occupied cell instead of overlapping it –
     leaving the strip auto-placed pushed it into an implicit second column
     that grid-template-columns never declared. Overlap needs both items
     placed by hand. */
  grid-column: 1 / -1;
  display: flex;
  align-items: stretch;
  gap: 0.7rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--rule);
  background: var(--paper);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  cursor: grab;
  /* Firefox: thin scrollbar; Chrome/Safari: via -webkit-* below. */
  scrollbar-width: thin;
}
#preview-strip.dragging { cursor: grabbing; scroll-behavior: auto; }
#preview-strip::-webkit-scrollbar { height: 6px; }
#preview-strip::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 3px; }
/* Drag handle for the preview strip. It is a grid item of its own sharing
   the strip's cell and hugging the leading edge – it cannot live *inside*
   the strip, because the strip is a scroll container and the handle would
   scroll away with the thumbnails. Negative margin straddles the seam. */
#preview-resizer {
  grid-row: 4;
  grid-column: 1 / -1;
  align-self: start;
  position: relative;
  height: 9px;
  margin-top: -4px;
  cursor: ns-resize;
  touch-action: none;
  z-index: 6;
}
#preview-resizer::before {
  content: '';
  position: absolute;
  top: 3px; left: 50%;
  transform: translateX(-50%);
  width: 42px; height: 2px;
  background: var(--ink-soft);
  opacity: 0.35;
  border-radius: 1px;
  transition: opacity 0.15s, background-color 0.15s, width 0.15s, height 0.15s;
}
#preview-resizer:hover::before { opacity: 0.8; width: 84px; }
body.preview-resizing #preview-resizer::before { opacity: 1; background: var(--emph); width: 84px; }
/* Same reasoning as the notes handle: a 2px hairline does not announce
   itself, and "can I make these bigger" is the question it has to answer. */
#preview-resizer::after {
  content: 'drag to resize · double-click resets';
  position: absolute;
  top: -1.15rem; left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--sans-font);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  background: var(--paper);
  padding: 1px 6px;
  border: 1px solid var(--rule);
  border-radius: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
#preview-resizer:hover::after,
body.preview-resizing #preview-resizer::after { opacity: 1; }

.preview-slot {
  flex: 0 0 auto;
  /* Match audience aspect so clones render without letterboxing.
     Height fills the strip; width derives from aspect. */
  height: 100%;
  aspect-ratio: var(--audience-aspect, 16 / 9);
  width: auto;
  min-width: 0;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--rule);
  background: var(--paper);
  cursor: pointer;
  transition: box-shadow 120ms, border-color 120ms;
}
.preview-slot:hover { border-color: var(--ink-soft); }
.preview-slot.current {
  border-color: var(--emph);
  box-shadow: 0 0 0 2px var(--emph);
}
.preview-slot-label {
  position: absolute;
  top: 4px; left: 6px;
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.12em;
  font-size: 9px;
  color: var(--ink-soft);
  z-index: 1;
  opacity: 0.85;
  pointer-events: none;
}
.preview-slot.current .preview-slot-label { color: var(--emph); opacity: 1; }
.preview-slot .chunk-clone {
  transform-origin: top left;
  pointer-events: none;
}
/* Clones have .active removed so the live styling does not bleed onto
   them – but that triggers the global dim rule. Force full opacity. */
.preview-slot .chunk-clone,
.preview-slot .chunk-clone.chunk { opacity: 1 !important; }

/* Title chunks in audience are bottom-aligned with 12vh of bottom
   padding (lower-left-third per PRD §4.4). In a miniature preview
   that leaves 80%+ of the slot empty with the title crammed at the
   bottom edge. Center-align + zero padding inside clones so the
   thumbnail reads like what's on stage: a titled slide. */
.preview-slot .chunk-clone.chunk-title { align-items: center; }
.preview-slot .chunk-clone.chunk-title .chunk-content { padding-bottom: 0; }

/* footer */
#speaker-footer {
  grid-row: 5;
  display: flex;
  align-items: center;
  gap: 1.2em;
  padding: 0 1rem;
  border-top: 1px solid var(--rule);
  background: var(--paper);
  font-family: var(--sans-font);
  font-size: 11px;
  color: var(--ink-soft);
}
#speaker-footer #timer {
  font-family: var(--mono-font);
  color: var(--ink);
}
/* Freeze state, and the control for it – one element, because a status light
   you cannot press is a question with no answer next to it. */
#speaker-footer #freeze-btn {
  font: inherit;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.14em;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: oklch(0.55 0.16 150);
}
#speaker-footer #freeze-btn:hover { border-color: var(--rule); background: oklch(0.97 0 0); }
#speaker-footer #freeze-btn.is-frozen {
  color: oklch(0.99 0 0);
  background: oklch(0.55 0.15 250);
  border-color: oklch(0.48 0.15 250);
}
#speaker-footer #freeze-btn.is-frozen:hover { background: oklch(0.50 0.15 250); }
#speaker-footer #slug { color: var(--ink-soft); font-style: italic; }
#speaker-footer .spacer { flex: 1; }
#speaker-footer .kbd-hint { font-size: 10px; opacity: 0.7; }
#speaker-footer kbd { padding: 0 3px; border: 1px solid var(--rule); background: oklch(0.96 0 0); color: var(--ink); font-family: var(--mono-font); font-size: 9px; }
/* Footer buttons. These carry the three cockpit actions that are otherwise
   key-only – strip orientation, annotation export, and the help panel – so
   none of them depends on remembering a letter. */
#speaker-footer #export-annot-btn,
#speaker-footer #preview-orient-btn,
#speaker-footer #speaker-help-btn {
  font: inherit;
  white-space: nowrap;
  padding: 2px 8px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: oklch(0.97 0 0);
  color: var(--ink);
  cursor: pointer;
}
#speaker-footer #export-annot-btn:hover,
#speaker-footer #preview-orient-btn:hover,
#speaker-footer #speaker-help-btn:hover { background: oklch(0.93 0 0); }

/* Mode toast sits at the top of the *stage*, not the top of the window:
   row 1 is the scrubber, and a toast overlapping the column strip covers
   exactly the navigation the lecturer is checking against. */
body[data-view=speaker] #mode-badge { top: calc(3vh + 14px); }

/* A clip in the cockpit is the lecturer's control surface; the projection
   mirrors it. Nothing view-specific about the box itself. */
body[data-view=speaker] .figure-video video { cursor: pointer; }

/* ── Reveal preview ───────────────────────────────────────────────
   The cockpit shows the segment that Space or Down will bring up next,
   in place inside the slide, hatched and dash-framed so it can never be
   mistaken for something the room is already seeing. Only the immediate
   next one: the segments behind it stay hidden, or the preview would
   just be the un-collapsed chunk with extra decoration.

   The audience is untouched – [data-hidden] keeps its display:none there,
   and this override is scoped to the speaker. */
body[data-view=speaker] .reveal-segment[data-hidden][data-next] {
  display: block;
  /* Absolute with no offsets: the box renders at its static position –
     exactly where it will land when revealed – but contributes nothing to
     the chunk's height. That matters more than it looks. The laser pointer
     travels as a fraction of the active chunk's bounding box, so a cockpit
     chunk taller than the projected one would land the dot in the wrong
     place; measured on a three-segment chunk, in-flow made the speaker's
     box 840px against the audience's 718. width:100% resolves against
     .chunk-content, which is position:relative and the same width. */
  position: absolute;
  width: 100%;
  opacity: 0.5;
  outline: 2px dashed var(--emph);
  outline-offset: 7px;
}
body[data-view=speaker] .reveal-segment[data-hidden][data-next]::before {
  content: '';
  position: absolute;
  inset: -5px;
  pointer-events: none;
  background: repeating-linear-gradient(
    45deg,
    transparent 0 7px,
    color-mix(in oklch, var(--emph) 14%, transparent) 7px 9px
  );
}
body[data-view=speaker] .reveal-segment[data-hidden][data-next]::after {
  content: 'next';
  position: absolute;
  top: -1.5em; right: 0;
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.16em;
  font-size: 0.62em;
  color: var(--emph);
  opacity: 0.85;
  pointer-events: none;
}
/* Not on the overview board: at that scale the hatch is noise, and the
   board is for finding a slide, not for pacing one. */
body[data-view=speaker].overview-mode .reveal-segment[data-hidden][data-next] { display: none; }

/* A diagram step has no block to hatch the way a hidden reveal segment
   does, so the cockpit gets the next step's name in words instead. Same
   job as the hatch: tell the lecturer what the next Space will do. */
body[data-view=speaker] .dg-hint {
  display: block;
  font-family: var(--sans-font);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
  text-align: center;
  margin-top: 0.35rem;
}
body[data-view=speaker] .chunk:not(.active) .dg-hint { visibility: hidden; }
body[data-view=speaker].overview-mode .dg-hint { display: none; }

/* Cockpit chrome on a dark theme – same reasoning as the dark-chrome block
   in AUDIENCE_CSS. The footer, its key crib and the export modal all carry
   fixed light backgrounds otherwise. */
body[data-mode=dark] #speaker-footer kbd,
body[data-mode=dark] #speaker-footer #export-annot-btn,
body[data-mode=dark] #speaker-footer #preview-orient-btn,
body[data-mode=dark] #speaker-footer #speaker-help-btn,
body[data-mode=dark] #notes-zoom button,
body[data-mode=dark] .export-modal-inner,
body[data-mode=dark] .export-modal-code,
body[data-mode=dark] .export-modal-copy,
body[data-mode=dark] .export-modal-raw textarea,
body[data-mode=dark] .export-modal-keep {
  background: var(--paper-warm);
  color: var(--ink);
}
body[data-mode=dark] #speaker-footer #freeze-btn:hover,
body[data-mode=dark] #speaker-footer #export-annot-btn:hover,
body[data-mode=dark] #speaker-footer #preview-orient-btn:hover,
body[data-mode=dark] #speaker-footer #speaker-help-btn:hover,
body[data-mode=dark] #notes-zoom button:hover,
body[data-mode=dark] .export-modal-copy:hover,
body[data-mode=dark] .export-modal-keep:hover {
  background: oklch(from var(--paper) calc(l + 0.12) c h);
}

/* Center toast — prominent transient feedback for export-flow events.
   Placed inside the stage viewing zone (bottom-centre of #stage-cell)
   because the 10px #mode-badge in the top-right is too peripheral for
   outcomes the lecturer actually needs to see. */
#center-toast {
  position: fixed;
  left: 50%;
  bottom: 22%;
  transform: translateX(-50%);
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  background: oklch(0.18 0 0 / 0.88);
  color: oklch(0.99 0 0);
  font-family: var(--sans-font);
  font-size: 14px;
  letter-spacing: 0.01em;
  box-shadow: 0 6px 20px oklch(0 0 0 / 0.25);
  opacity: 0;
  transition: opacity 0.12s ease-out;
  pointer-events: none;
  z-index: 30;
  max-width: 60vw;
  text-align: center;
}
#center-toast.visible { opacity: 1; }
#center-toast.warn { background: oklch(0.55 0.16 25 / 0.92); }

/* Post-Shift-E modal: walks the lecturer through pasting the clipboard
   content back into source.md, running --integrate-annotations,
   rebuilding, and finally clearing the now-redundant localStorage
   drafts. The raw snippet stays in a <details> so a flaked clipboard
   copy can be recovered without re-triggering the export. */
#export-modal {
  position: fixed; inset: 0;
  background: oklch(0 0 0 / 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
  font-family: var(--sans-font);
}
#export-modal .export-modal-inner {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 1.3rem 1.5rem;
  width: min(640px, 92vw);
  max-height: 88vh;
  display: flex; flex-direction: column; gap: 0.75rem;
  box-shadow: 0 12px 40px oklch(0 0 0 / 0.25);
  overflow: auto;
  color: var(--ink);
}
.export-modal-head {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.export-modal-intro {
  margin: 0;
  font-size: 13px;
  color: var(--ink-soft);
}
.export-modal-steps {
  margin: 0;
  padding-left: 1.3em;
  display: flex; flex-direction: column; gap: 0.55rem;
  font-size: 13px;
}
.export-modal-steps li { line-height: 1.4; }
.export-modal-step-title { margin-bottom: 0.2rem; }
.export-modal-code-row {
  display: flex; align-items: stretch; gap: 4px;
}
.export-modal-code {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: oklch(0.98 0 0);
  font-family: var(--mono-font);
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
.export-modal-copy {
  font: inherit;
  font-size: 11px;
  padding: 0 8px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: oklch(0.96 0 0);
  cursor: pointer;
}
.export-modal-copy:hover { background: oklch(0.92 0 0); }
.export-modal-raw summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--ink-soft);
}
.export-modal-raw textarea {
  width: 100%;
  min-height: 8em;
  margin-top: 0.4rem;
  padding: 0.5rem;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: oklch(0.98 0 0);
  color: var(--ink);
  font-family: var(--mono-font);
  font-size: 11.5px;
  resize: vertical;
}
.export-modal-warn {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-left: 2pt solid oklch(0.72 0.12 80);
  background: oklch(0.985 0.014 80);
  font-size: 12px;
  color: var(--ink);
}
.export-modal-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 0.2rem;
}
.export-modal-actions button {
  font: inherit;
  font-size: 13px;
  padding: 6px 14px;
  border: 1px solid var(--rule);
  border-radius: 4px;
  cursor: pointer;
}
.export-modal-keep { background: oklch(0.97 0 0); color: var(--ink); }
.export-modal-keep:hover { background: oklch(0.93 0 0); }
.export-modal-clear { background: oklch(0.55 0.16 25); color: oklch(0.99 0 0); border-color: oklch(0.45 0.16 25); }
.export-modal-clear:hover { background: oklch(0.48 0.17 25); }

/* Hide the annotation "+ note" affordance in speaker – speaker has the
   notes pane for author-written notes. */
body[data-view=speaker] .annot-add { display: none !important; }

/* Corner-overlay button that opens the notes pane when it's collapsed.
   Doubles as discoverability for the Shift-N hotkey – newcomers see the
   affordance and learn the shortcut from the tooltip. Hidden once notes
   are visible so it doesn't clutter the slide. */
#add-note-btn {
  position: absolute;
  right: 0.7rem;
  bottom: 0.7rem;
  z-index: 10;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--rule);
  background: color-mix(in oklab, var(--paper) 82%, transparent);
  border-radius: 3px;
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
  font-size: 10px;
  color: var(--ink-soft);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 120ms, color 120ms, border-color 120ms;
}
#add-note-btn:hover {
  opacity: 1;
  color: var(--ink);
  border-color: var(--ink-soft);
}
body.has-notes #add-note-btn { display: none; }

/* ── preview-strip: right-mode (vertical) ─────────────────────────────
   Toggled by V. Strip moves from row 4 into row 2 / col 2, stacks
   slots vertically, scrolls on Y. Stage stays in col 1, notes and
   footer span both cols. Slot aspect-ratio handles sizing so slots
   grow taller when the strip is wider – more text legibility than
   the horizontal mode. */
body[data-view=speaker].preview-right {
  grid-template-rows: 3vh 1fr auto 2.2rem;
  grid-template-columns: 1fr var(--preview-w, clamp(180px, 18vw, 300px));
}
body[data-view=speaker].preview-right.notes-sized {
  grid-template-rows: 3vh 1fr var(--notes-height, auto) 2.2rem;
}
body[data-view=speaker].preview-right #scrubber     { grid-column: 1 / -1; grid-row: 1; }
body[data-view=speaker].preview-right #stage-cell   { grid-column: 1; grid-row: 2; }
body[data-view=speaker].preview-right #notes-pane   { grid-column: 1 / -1; grid-row: 3; }
body[data-view=speaker].preview-right #speaker-footer { grid-column: 1 / -1; grid-row: 4; }
body[data-view=speaker].preview-right #preview-strip {
  grid-column: 2;
  grid-row: 2;
  flex-direction: column;
  padding: 0.5rem 0.5rem;
  border-top: 0;
  border-left: 1px solid var(--rule);
  overflow-x: hidden;
  overflow-y: auto;
}
body[data-view=speaker].preview-right #preview-strip::-webkit-scrollbar { width: 6px; height: auto; }
body[data-view=speaker].preview-right .preview-slot {
  height: auto;
  width: auto;
  /* align-items: stretch on the flex parent fills cross-axis (width). */
}
/* The handle rotates with the strip: same cell, now hugging its left edge,
   and the drag axis becomes horizontal. */
body[data-view=speaker].preview-right #preview-resizer {
  grid-row: 2;
  grid-column: 2;
  justify-self: start;
  align-self: stretch;
  width: 9px;
  height: auto;
  margin-top: 0;
  margin-left: -4px;
  cursor: ew-resize;
}
body[data-view=speaker].preview-right #preview-resizer::before {
  top: 50%; left: 3px;
  transform: translateY(-50%);
  width: 2px; height: 42px;
}
body[data-view=speaker].preview-right #preview-resizer:hover::before,
body.preview-right.preview-resizing #preview-resizer::before { width: 2px; height: 84px; }
/* Label hangs into the strip instead of above it – there is no room above
   in this orientation, that cell is the stage. */
body[data-view=speaker].preview-right #preview-resizer::after {
  top: 8px; left: 10px;
  transform: none;
}
`;

// ── speaker-specific runtime (loaded after AUDIENCE_JS) ──────────────

const SPEAKER_JS = `
const notesContent = document.getElementById('notes-content');
const notesPane = document.getElementById('notes-pane');
const previewStrip = document.getElementById('preview-strip');
const scrubberEl = document.getElementById('scrubber');
const timerEl = document.getElementById('timer');
const freezeBtn = document.getElementById('freeze-btn');
const stageCell = document.getElementById('stage-cell');

// Compute --stage-scale so the audience-sized slide (slide-w × slide-h)
// fits inside #stage-cell with letterbox bars. The viewport itself is
// laid out at the full reference size; scale is purely visual. This
// guarantees identical content wrap + font size across audience and
// speaker, which the laser-pointer geometry depends on.
function sizeStageViewport() {
  if (!stageCell) return;
  const cw = stageCell.clientWidth;
  const ch = stageCell.clientHeight;
  if (!cw || !ch) return;
  const slideW = viewport.offsetWidth || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slide-w')) || cw;
  const slideH = viewport.offsetHeight || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slide-h')) || ch;
  if (!slideW || !slideH) return;
  const scale = Math.min(cw / slideW, ch / slideH);
  document.documentElement.style.setProperty('--stage-scale', String(scale));
  if (typeof focusCamera === 'function') focusCamera(true);
  if (typeof populatePreviewStrip === 'function') populatePreviewStrip();
}
try {
  new ResizeObserver(sizeStageViewport).observe(stageCell);
} catch (e) {}
window.addEventListener('resize', sizeStageViewport);
requestAnimationFrame(sizeStageViewport);

// Freeze: the projector metaphor, not the plumbing one. This used to be a
// "push" toggle plus a separate "force one push" key, which described what
// the code does (send a snapshot) rather than what the lecturer wants (hold
// the image while I look ahead). Inverted and renamed, the second key
// disappears: thawing *is* the resync, because the first thing an ungated
// broadcast does is hand the room our current state.
let frozen = false;
viewHooks.shouldBroadcast = () => !frozen;
function applyFreezeIndicator() {
  freezeBtn.classList.toggle('is-frozen', frozen);
  freezeBtn.textContent = frozen ? '❄ frozen' : '● live';
  freezeBtn.setAttribute('aria-pressed', frozen ? 'true' : 'false');
  freezeBtn.title = frozen
    ? 'The room is holding one slide while you move on. Click or press V to catch it up.'
    : 'The room follows this window. Click or press V to freeze the projection.';
}
function toggleFreeze() {
  frozen = !frozen;
  applyFreezeIndicator();
  // Thawing has to push immediately. Without this the room keeps the frozen
  // slide until the next navigation, so unfreezing on the slide you want to
  // land on would look like it did nothing at all.
  if (!frozen && !isApplyingRemote) {
    sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
  }
  flashMode(frozen
    ? 'projection frozen · the room holds this slide'
    : 'projection live · the room follows again');
}
applyFreezeIndicator();
freezeBtn.addEventListener('click', toggleFreeze);

// Export live annotation drafts as Markdown. Copies to clipboard first,
// then asks for explicit confirmation before clearing the draft buffer —
// a failed copy or a cancelled confirm leaves localStorage untouched, so
// nothing is lost if the lecturer aborts mid-workflow.
function collectAnnotationDrafts() {
  const out = [];
  flatChunks.forEach(({ id, el }) => {
    if (!id) return;
    if (!(id in annotations)) return;
    const text = (annotations[id] || '').trim();
    const ta = el.querySelector('.annot-textarea');
    const sourceDefault = ta ? (ta.defaultValue || '').trim() : '';
    if (!text && !sourceDefault) return;
    if (text === sourceDefault) return;
    out.push({ id, text });
  });
  return out;
}

function buildAnnotationSnippet(drafts) {
  const lines = ['<!-- annotations:start -->', ''];
  drafts.forEach(({ id, text }, i) => {
    if (i > 0) lines.push('');
    lines.push('### ' + id);
    if (text) {
      text.split('\\n').forEach(l => lines.push('> annot: ' + l));
    } else {
      lines.push('> annot:');
    }
  });
  lines.push('', '<!-- annotations:end -->', '');
  return lines.join('\\n');
}

async function copyToClipboardSafe(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

const centerToast = document.getElementById('center-toast');
let centerToastTimer = null;
function flashCenter(text, opts = {}) {
  if (!centerToast) return;
  centerToast.textContent = text;
  centerToast.classList.remove('warn');
  centerToast.classList.add('visible');
  if (opts.warn) centerToast.classList.add('warn');
  if (centerToastTimer) clearTimeout(centerToastTimer);
  centerToastTimer = setTimeout(() => {
    centerToast.classList.remove('visible', 'warn');
  }, opts.duration || 1800);
}

function clearExportedDrafts(drafts) {
  drafts.forEach(({ id }) => {
    delete annotations[id];
    const entry = flatChunks.find(c => c.id === id);
    if (entry) {
      const ta2 = entry.el.querySelector('.annot-textarea');
      if (ta2) {
        ta2.value = ta2.defaultValue;
        entry.el.classList.toggle('has-annot', !!ta2.value.trim());
        autosize(ta2);
      }
    }
  });
  saveAnnotations();
  broadcastState();
  flashCenter('drafts cleared');
}

// Derive the source.md path from the current page location so the modal
// can show a ready-to-run command. file:// URLs URL-encode spaces; decode
// before displaying. Falls back to a generic placeholder on non-file URLs.
function sourcePathForCommand() {
  try {
    const raw = decodeURIComponent(window.location.pathname || '');
    if (!raw) return '<path-to>/source.md';
    return raw.replace(/\\/[^/]+$/, '/source.md');
  } catch (e) {
    return '<path-to>/source.md';
  }
}

function showExportModal({ drafts, snippet, clipboardOk }) {
  let host = document.getElementById('export-modal');
  if (host) host.remove();
  host = document.createElement('div');
  host.id = 'export-modal';

  const inner = document.createElement('div');
  inner.className = 'export-modal-inner';

  const head = document.createElement('h2');
  head.className = 'export-modal-head';
  head.textContent = clipboardOk
    ? drafts.length + ' annotation' + (drafts.length === 1 ? '' : 's') + ' copied to clipboard'
    : 'Clipboard blocked — copy manually below';
  inner.appendChild(head);

  const intro = document.createElement('p');
  intro.className = 'export-modal-intro';
  intro.textContent = clipboardOk
    ? 'Next steps to make these notes part of the lecture source:'
    : 'Select the text below and copy it by hand, then follow the steps:';
  inner.appendChild(intro);

  const srcPath = sourcePathForCommand();
  const steps = [
    {
      n: 1,
      title: 'Paste the clipboard content at the end of source.md',
      code: srcPath,
      codeLabel: 'file',
    },
    {
      n: 2,
      title: 'Integrate the pasted block into the right chunks',
      code: 'node build.js ' + srcPath + ' --integrate-annotations',
    },
    {
      n: 3,
      title: 'Rebuild the lecture',
      code: 'node build.js ' + srcPath,
    },
    {
      n: 4,
      title: 'Review with git diff and commit when happy',
      code: 'git diff',
    },
    {
      n: 5,
      title: 'Then return here and press Clear Drafts to remove them from this browser',
    },
  ];

  const stepList = document.createElement('ol');
  stepList.className = 'export-modal-steps';
  for (const step of steps) {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'export-modal-step-title';
    title.textContent = step.title;
    li.appendChild(title);
    if (step.code) {
      const row = document.createElement('div');
      row.className = 'export-modal-code-row';
      const code = document.createElement('code');
      code.className = 'export-modal-code';
      code.textContent = step.code;
      row.appendChild(code);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'export-modal-copy';
      copyBtn.textContent = 'copy';
      copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboardSafe(step.code);
        copyBtn.textContent = ok ? 'copied ✓' : 'copy failed';
        setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
      });
      row.appendChild(copyBtn);
      li.appendChild(row);
    }
    stepList.appendChild(li);
  }
  inner.appendChild(stepList);

  // Always expose the raw snippet in a <details> so the lecturer can
  // re-copy it (clipboard flaked, pasted into wrong window, etc.) without
  // having to re-trigger the export flow.
  const details = document.createElement('details');
  details.className = 'export-modal-raw';
  details.open = !clipboardOk;
  const summary = document.createElement('summary');
  summary.textContent = clipboardOk ? 'show copied text' : 'copied text (select all and copy)';
  details.appendChild(summary);
  const raw = document.createElement('textarea');
  raw.readOnly = true;
  raw.value = snippet;
  details.appendChild(raw);
  inner.appendChild(details);

  const warn = document.createElement('p');
  warn.className = 'export-modal-warn';
  warn.textContent = 'Clear Drafts removes the annotations from localStorage. Do this only after the notes are safely in source.md.';
  inner.appendChild(warn);

  const actions = document.createElement('div');
  actions.className = 'export-modal-actions';
  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'export-modal-keep';
  keepBtn.textContent = 'Keep drafts (close)';
  keepBtn.addEventListener('click', () => host.remove());
  actions.appendChild(keepBtn);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'export-modal-clear';
  clearBtn.textContent = 'Clear drafts now';
  clearBtn.addEventListener('click', () => {
    clearExportedDrafts(drafts);
    host.remove();
  });
  actions.appendChild(clearBtn);
  inner.appendChild(actions);

  host.appendChild(inner);
  host.addEventListener('click', (e) => { if (e.target === host) host.remove(); });
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape') host.remove(); });
  document.body.appendChild(host);
  if (!clipboardOk) raw.select();
  else keepBtn.focus();
}

async function exportAnnotations() {
  const drafts = collectAnnotationDrafts();
  if (!drafts.length) {
    flashCenter('No live annotations to export — type some with N first.', { warn: true, duration: 2600 });
    return;
  }
  const snippet = buildAnnotationSnippet(drafts);
  const copied = await copyToClipboardSafe(snippet);
  showExportModal({ drafts, snippet, clipboardOk: copied });
}

const exportAnnotBtn = document.getElementById('export-annot-btn');
if (exportAnnotBtn) exportAnnotBtn.addEventListener('click', exportAnnotations);
document.getElementById('speaker-help-btn')?.addEventListener('click', () => toggleHelp(true));

// N on the speaker opens the audience-visible annotation slot (PRD §2 –
// the live marginalia channel that mirrors to the audience). The notes
// pane on the right is the read-side of source > note: lines plus the
// editable speaker-private notes; it is focused by clicking it (it has
// tabindex=0).
// (Default viewHooks.onN already maps to startAnnotate – no override.)

// Per-chunk speaker notes. Each chunk has a default text from the
// source > note: lines (carried in a <template>); the speaker can
// rewrite it during rehearsal/lecture and the override is persisted
// in localStorage. An empty string is a valid override (the speaker
// intentionally cleared the source notes for this chunk).
const noteOverrideKey = (id) => storageKey('speakernote:' + id);
function sourceNotesFor(id) {
  const tmpl = document.querySelector(\`template[data-notes-for="\${id}"]\`);
  // Template body was escapeHtml'd at build time; parsed back into text via .textContent.
  return tmpl ? tmpl.content.textContent : '';
}
function loadNotesFor(id) {
  try {
    const raw = localStorage.getItem(noteOverrideKey(id));
    return raw !== null ? raw : sourceNotesFor(id);
  } catch (e) { return sourceNotesFor(id); }
}
// Auto-size the notes textarea: 1 line minimum, up to 3 lines, scroll
// beyond. Also toggles body.has-notes so CSS can collapse the row
// entirely when there are no notes – reclaims vertical space for the
// slide preview above. Line-height is 1.35 (matching CSS).
const NOTES_MIN_LINES = 1;
const NOTES_MAX_LINES = 3;
function autoSizeNotes() {
  const hasText = notesContent.value.trim().length > 0;
  const sized = document.body.classList.contains('notes-sized');
  // Pane stays open while the textarea is focused so the author can
  // type into an empty pane (Shift-N / + note btn). On blur the class
  // drops back to hasText and an untouched pane collapses again.
  // A manually-sized pane stays open unconditionally.
  const keepOpen = sized || hasText || document.activeElement === notesContent;
  document.body.classList.toggle('has-notes', keepOpen);
  if (sized) {
    // Manually-sized: textarea fills the row; height comes from grid.
    notesContent.style.height = '100%';
    return;
  }
  if (!hasText) {
    notesContent.style.height = '1.35em';
    return;
  }
  // Measure content height by resetting then reading scrollHeight.
  notesContent.style.height = '1.35em';
  const lineHeight = 1.35 * parseFloat(getComputedStyle(notesContent).fontSize);
  const max = lineHeight * NOTES_MAX_LINES;
  const wanted = Math.min(notesContent.scrollHeight, max);
  const min = lineHeight * NOTES_MIN_LINES;
  notesContent.style.height = Math.max(min, wanted) + 'px';
}

function populateNotesPane() {
  const entry = flatChunks[state.activeIdx];
  notesContent.value = entry ? loadNotesFor(entry.id) : '';
  autoSizeNotes();
}
notesContent.addEventListener('input', () => {
  const entry = flatChunks[state.activeIdx];
  if (entry) {
    try { localStorage.setItem(noteOverrideKey(entry.id), notesContent.value); } catch (e) {}
  }
  autoSizeNotes();
});
notesContent.addEventListener('keydown', (e) => {
  // Esc blurs back to the slide so global hotkeys (arrows, space) work again.
  if (e.key === 'Escape') { notesContent.blur(); e.preventDefault(); }
});
notesContent.addEventListener('blur', autoSizeNotes);

// Shift-N entry point: force-show the notes row and focus the textarea
// even when currently collapsed (body lacks .has-notes). The class
// makes the row visible; focus() lands the caret; user types and the
// input handler keeps has-notes on. If they blur with no content,
// autoSizeNotes collapses again.
function focusNotesPane() {
  document.body.classList.add('has-notes');
  requestAnimationFrame(() => {
    notesContent.focus();
    autoSizeNotes();
  });
}

// Column / chunk-dot bookkeeping: a flat index of which flatChunks entry
// corresponds to each (colIdx, chunkIdx) pair in the scrubber.
const colChunkIdx = {};
flatChunks.forEach((c, i) => {
  if (!colChunkIdx[c.colIdx]) colChunkIdx[c.colIdx] = [];
  colChunkIdx[c.colIdx].push(i);
});

// Scrubber DOM is static after build — cache the node lists once so the
// onActiveChange hook (every keystroke, every remote-state apply) doesn't
// re-scan the document on each tick.
const colEntryEls = Array.from(document.querySelectorAll('.col-entry'));
const dotEls = Array.from(document.querySelectorAll('#scrubber .dot'));

function updateScrubber() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  for (const el of colEntryEls) {
    el.classList.toggle('active', parseInt(el.dataset.colIdx, 10) === entry.colIdx);
  }
  for (const dot of dotEls) {
    const ci = parseInt(dot.dataset.colIdx, 10);
    const xi = parseInt(dot.dataset.chunkIdx, 10);
    dot.classList.toggle('active', colChunkIdx[ci]?.[xi] === state.activeIdx);
  }
}

scrubberEl.addEventListener('click', (e) => {
  const dot = e.target.closest('.dot');
  if (dot) {
    const ci = parseInt(dot.dataset.colIdx, 10);
    const xi = parseInt(dot.dataset.chunkIdx, 10);
    const idx = colChunkIdx[ci]?.[xi];
    if (idx !== undefined) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
    return;
  }
  const btn = e.target.closest('.col-btn');
  if (btn) {
    const ci = parseInt(btn.closest('.col-entry').dataset.colIdx, 10);
    const idx = colChunkIdx[ci]?.[0];
    if (idx !== undefined) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
  }
});

// Preview strip: ALL chunks, each cloned and scaled to fit a slot.
// Scrollable along the strip's main axis – drag to pan, click a slot
// to jump. Current chunk highlighted and auto-scrolled into view.
//
// Clone is rendered at the audience reference size (slide-w × slide-h)
// and CSS-scaled into the slot. The scale factor is multiplied by
// PREVIEW_ZOOM so the content fills more of each slot than the raw
// letterbox would; the slot's overflow:hidden clips the small margin
// that overflows, which is an acceptable trade for readable text.
const PREVIEW_ZOOM = 1.22;
function isPreviewVertical() {
  return document.body.classList.contains('preview-right');
}
function populatePreviewStrip() {
  previewStrip.replaceChildren();
  flatChunks.forEach((entry, idx) => {
    const slot = document.createElement('div');
    slot.className = 'preview-slot';
    slot.dataset.idx = String(idx);
    if (idx === state.activeIdx) slot.classList.add('current');
    const label = document.createElement('div');
    label.className = 'preview-slot-label';
    const offset = idx - state.activeIdx;
    label.textContent = offset === 0 ? 'now' : (offset > 0 ? '+' + offset : String(offset));
    slot.appendChild(label);
    const clone = entry.el.cloneNode(true);
    clone.classList.add('chunk-clone');
    clone.classList.remove('active', 'expanded', 'annot-visible', 'has-annot', 'overview-selected');
    clone.querySelectorAll('.reveal-segment').forEach(s => s.removeAttribute('data-hidden'));
    // Thumbnails show slides fully revealed (PRD §4.6) so the speaker can
    // see where each one lands. A cloned diagram carries whatever step the
    // live one is on, because the runtime writes geometry onto attributes -
    // so the clone has to be walked forward to its last frame by hand.
    const liveDiagrams = entry.el.querySelectorAll('svg.psi-diagram');
    clone.querySelectorAll('svg.psi-diagram').forEach((svg, i) => {
      const d = liveDiagrams[i] && liveDiagrams[i].psiDiagram;
      if (d) dgRenderInto(svg, d, d.data.n - 1);
    });
    clone.querySelectorAll('.exps, .annot-box, .annot-add').forEach(n => n.remove());
    // Media never travels into a thumbnail. A cloned iframe carries the src
    // updateEmbedLoading just set, which would open a *second* live player
    // at the provider - defeating the whole "nothing loads until its chunk
    // is reached" guarantee, and doing it on every strip rebuild. A cloned
    // <video> would duplicate its data: URI into every slot.
    clone.querySelectorAll('.figure-embed iframe').forEach(n => {
      n.removeAttribute('src'); n.removeAttribute('data-src');
    });
    clone.querySelectorAll('.figure-video video').forEach(n => {
      n.removeAttribute('src'); n.removeAttribute('controls');
    });
    slot.appendChild(clone);
    previewStrip.appendChild(slot);
    requestAnimationFrame(() => {
      const slideW = viewport.clientWidth || window.innerWidth;
      if (!slideW) return;
      const baseScale = slot.clientWidth / slideW;
      const scale = baseScale * PREVIEW_ZOOM;
      clone.style.transform = \`scale(\${scale})\`;
      clone.style.width = slideW + 'px';
      clone.style.height = (slot.clientHeight / baseScale) + 'px';
    });
  });
  scrollPreviewToActive(false);
}

function scrollPreviewToActive(smooth) {
  const el = previewStrip.querySelector('.preview-slot.current');
  if (!el) return;
  // Center the current slot along the strip's main axis.
  const stripRect = previewStrip.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const behavior = smooth ? 'smooth' : 'auto';
  if (isPreviewVertical()) {
    const top = previewStrip.scrollTop + (elRect.top + elRect.height / 2) - (stripRect.top + stripRect.height / 2);
    previewStrip.scrollTo({ top, behavior });
  } else {
    const left = previewStrip.scrollLeft + (elRect.left + elRect.width / 2) - (stripRect.left + stripRect.width / 2);
    previewStrip.scrollTo({ left, behavior });
  }
}

// Light-touch "current" marker update without rebuilding the whole strip.
function markPreviewCurrent() {
  previewStrip.querySelectorAll('.preview-slot').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    el.classList.toggle('current', idx === state.activeIdx);
    const lbl = el.querySelector('.preview-slot-label');
    if (lbl) {
      const off = idx - state.activeIdx;
      lbl.textContent = off === 0 ? 'now' : (off > 0 ? '+' + off : String(off));
    }
  });
  scrollPreviewToActive(true);
}

// Pointer drag to pan. Tracks whether the pointer actually moved enough
// to constitute a drag (vs a click); click-to-jump wins if no drag.
// The slot is saved at pointerdown because pointer capture reroutes
// pointerup's e.target to the capturing element (previewStrip), so
// e.target.closest('.preview-slot') returns null at release time.
let previewDrag = null;
previewStrip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const slot = e.target.closest('.preview-slot');
  const vert = isPreviewVertical();
  previewDrag = {
    vert,
    start: vert ? e.clientY : e.clientX,
    scrollStart: vert ? previewStrip.scrollTop : previewStrip.scrollLeft,
    moved: false,
    pointerId: e.pointerId,
    slot,
  };
  previewStrip.setPointerCapture(e.pointerId);
});
previewStrip.addEventListener('pointermove', (e) => {
  if (!previewDrag) return;
  const cur = previewDrag.vert ? e.clientY : e.clientX;
  const d = cur - previewDrag.start;
  if (Math.abs(d) > 4) previewDrag.moved = true;
  if (previewDrag.vert) previewStrip.scrollTop = previewDrag.scrollStart - d;
  else previewStrip.scrollLeft = previewDrag.scrollStart - d;
  if (previewDrag.moved) previewStrip.classList.add('dragging');
});
previewStrip.addEventListener('pointerup', (e) => {
  if (!previewDrag) return;
  const { moved, slot } = previewDrag;
  try { previewStrip.releasePointerCapture(previewDrag.pointerId); } catch (err) {}
  previewDrag = null;
  previewStrip.classList.remove('dragging');
  if (moved || !slot) return;
  const idx = parseInt(slot.dataset.idx, 10);
  if (!Number.isFinite(idx) || idx === state.activeIdx) return;
  jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
});
previewStrip.addEventListener('pointercancel', () => {
  previewDrag = null;
  previewStrip.classList.remove('dragging');
});

// Vertical wheel maps to horizontal scroll when the strip runs
// horizontally; in vertical-strip mode the browser's native vertical
// scroll is already what we want.
previewStrip.addEventListener('wheel', (e) => {
  if (isPreviewVertical()) return;
  if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  previewStrip.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

// Timer: elapsed since page load, mm:ss.
const tStart = Date.now();
function renderTimer() {
  const s = Math.floor((Date.now() - tStart) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  timerEl.textContent = mm + ':' + ss;
}
setInterval(renderTimer, 1000);
renderTimer();

// Hook: refresh scrubber on every state change, notes+preview on chunk
// change only. The full-strip rebuild (populatePreviewStrip) happens
// once at load and on resize; subsequent chunk changes just re-mark
// the current slot and scroll it into view.
let lastPopulatedIdx = -1;
viewHooks.onActiveChange = () => {
  updateScrubber();
  if (state.activeIdx === lastPopulatedIdx) return;
  lastPopulatedIdx = state.activeIdx;
  populateNotesPane();
  markPreviewCurrent();
};

// Preview orientation (horizontal along bottom vs vertical along the
// right edge). Persisted globally – user preference follows them
// across lectures. Toggled with V.
const PREVIEW_ORIENTATION_KEY = 'psi-slides:preview-orientation';
function applyPreviewOrientation(mode) {
  document.body.classList.toggle('preview-right', mode === 'right');
}
try {
  const saved = localStorage.getItem(PREVIEW_ORIENTATION_KEY);
  if (saved === 'right') applyPreviewOrientation('right');
} catch (e) {}
function togglePreviewOrientation() {
  const next = document.body.classList.contains('preview-right') ? 'bottom' : 'right';
  applyPreviewOrientation(next);
  try { localStorage.setItem(PREVIEW_ORIENTATION_KEY, next); } catch (e) {}
  flashMode('viewer layout · preview ' + (next === 'right' ? 'down the right edge' : 'along the bottom'));
  populatePreviewStrip();
}
document.getElementById('preview-orient-btn')?.addEventListener('click', togglePreviewOrientation);

// The in-stage "+ note" overlay is an alternative entry point to
// Shift-N. Visible only while the notes pane is collapsed; the CSS
// hides it once has-notes lands on body.
document.getElementById('add-note-btn')?.addEventListener('click', () => {
  focusNotesPane();
});

// Drag-to-resize for the notes pane. Setting --notes-height + the
// notes-sized class swaps the grid's auto row for a fixed pixel row;
// the 1fr stage row shrinks correspondingly and stageCell's
// ResizeObserver re-runs sizeStageViewport(), so the audience preview
// rescales ratio-proportional. Persisted per-user; double-click resets.
const notesResizer = document.getElementById('notes-resizer');
const NOTES_HEIGHT_KEY = 'psi-slides:notes-height';
const NOTES_MIN_PX = 60;
const STAGE_MIN_PX = 140;

function applyNotesHeight(px) {
  document.documentElement.style.setProperty('--notes-height', px + 'px');
  document.body.classList.add('notes-sized');
  document.body.classList.add('has-notes');
  notesContent.style.height = '100%';
}
function clearNotesHeight() {
  document.documentElement.style.removeProperty('--notes-height');
  document.body.classList.remove('notes-sized');
  autoSizeNotes();
}
try {
  const saved = parseFloat(localStorage.getItem(NOTES_HEIGHT_KEY));
  if (saved && saved >= NOTES_MIN_PX) applyNotesHeight(saved);
} catch (e) {}

let notesDrag = null;
notesResizer?.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { notesResizer.setPointerCapture(ev.pointerId); } catch (e) {}
  notesDrag = {
    pointerId: ev.pointerId,
    startY: ev.clientY,
    startHeight: notesPane.getBoundingClientRect().height,
    stageHeight: stageCell.getBoundingClientRect().height,
  };
  document.body.classList.add('notes-resizing');
});
notesResizer?.addEventListener('pointermove', (ev) => {
  if (!notesDrag || ev.pointerId !== notesDrag.pointerId) return;
  // Drag up → notes grows (positive dy); cap so the stage keeps at
  // least STAGE_MIN_PX of room.
  const dy = notesDrag.startY - ev.clientY;
  const maxGrow = Math.max(0, notesDrag.stageHeight - STAGE_MIN_PX);
  const next = Math.max(NOTES_MIN_PX, Math.min(notesDrag.startHeight + dy, notesDrag.startHeight + maxGrow));
  applyNotesHeight(next);
});
function endNotesDrag(ev) {
  if (!notesDrag) return;
  try { notesResizer.releasePointerCapture(notesDrag.pointerId); } catch (e) {}
  document.body.classList.remove('notes-resizing');
  const px = Math.round(notesPane.getBoundingClientRect().height);
  try { localStorage.setItem(NOTES_HEIGHT_KEY, String(px)); } catch (e) {}
  notesDrag = null;
}
notesResizer?.addEventListener('pointerup', endNotesDrag);
notesResizer?.addEventListener('pointercancel', endNotesDrag);
notesResizer?.addEventListener('dblclick', () => {
  try { localStorage.removeItem(NOTES_HEIGHT_KEY); } catch (e) {}
  clearNotesHeight();
  flashMode('notes height: auto');
});

// Font zoom for the notes pane. Buttons only, deliberately no hotkey: this
// is the one surface the lecturer types into, and every free letter key is
// already a navigation command that would fire mid-sentence. autoSizeNotes
// reads the computed font-size, so the pane's auto height follows along.
const NOTES_FONT_KEY = 'psi-slides:notes-font';
const NOTES_FONT_BASE = 1.15;
const NOTES_FONT_MIN = 0.8;
const NOTES_FONT_MAX = 2.6;
const NOTES_FONT_STEP = 0.15;
let notesFontRem = NOTES_FONT_BASE;
function applyNotesFont(rem) {
  const clamped = Math.max(NOTES_FONT_MIN, Math.min(NOTES_FONT_MAX, rem));
  notesFontRem = Math.round(clamped * 100) / 100;
  document.documentElement.style.setProperty('--notes-font', notesFontRem + 'rem');
  autoSizeNotes();
}
try {
  const saved = parseFloat(localStorage.getItem(NOTES_FONT_KEY));
  if (saved >= NOTES_FONT_MIN && saved <= NOTES_FONT_MAX) applyNotesFont(saved);
} catch (e) {}
function stepNotesFont(dir) {
  applyNotesFont(notesFontRem + dir * NOTES_FONT_STEP);
  try { localStorage.setItem(NOTES_FONT_KEY, String(notesFontRem)); } catch (e) {}
  flashMode('notes text · ' + Math.round((notesFontRem / NOTES_FONT_BASE) * 100) + '%');
}
['notes-zoom-in', 'notes-zoom-out'].forEach((id, i) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  // Keep the caret where it is: a click that stole focus would blur the
  // textarea, and on an untouched empty pane that collapses the row out
  // from under the button being clicked.
  btn.addEventListener('mousedown', (ev) => ev.preventDefault());
  btn.addEventListener('click', () => stepNotesFont(i === 0 ? 1 : -1));
});

// Drag-to-resize for the preview strip, in both orientations. Two persisted
// values rather than one: the bottom strip is a height and the right strip a
// width, and someone who flips orientation wants each to come back the way
// they left it. The stage keeps its letterbox either way – #stage-cell's
// ResizeObserver re-runs sizeStageViewport, so the mirror stays at the
// audience aspect instead of stretching into whatever room is left.
const previewResizer = document.getElementById('preview-resizer');
const PREVIEW_H_KEY = 'psi-slides:preview-height';
const PREVIEW_W_KEY = 'psi-slides:preview-width';
const PREVIEW_MIN_PX = 70;

function previewIsVertical() { return document.body.classList.contains('preview-right'); }
function applyPreviewSize(px, vertical) {
  document.documentElement.style.setProperty(vertical ? '--preview-w' : '--preview-h', px + 'px');
}
try {
  const h = parseFloat(localStorage.getItem(PREVIEW_H_KEY));
  if (h >= PREVIEW_MIN_PX) applyPreviewSize(h, false);
  const w = parseFloat(localStorage.getItem(PREVIEW_W_KEY));
  if (w >= PREVIEW_MIN_PX) applyPreviewSize(w, true);
} catch (e) {}

let previewSizeDrag = null;
previewResizer?.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { previewResizer.setPointerCapture(ev.pointerId); } catch (e) {}
  const vertical = previewIsVertical();
  const strip = previewStrip.getBoundingClientRect();
  const cell = stageCell.getBoundingClientRect();
  previewSizeDrag = {
    pointerId: ev.pointerId,
    vertical,
    start: vertical ? ev.clientX : ev.clientY,
    startSize: vertical ? strip.width : strip.height,
    // How much the stage can give up before it stops being a usable mirror.
    room: Math.max(0, (vertical ? cell.width : cell.height) - STAGE_MIN_PX),
  };
  document.body.classList.add('preview-resizing');
});
previewResizer?.addEventListener('pointermove', (ev) => {
  if (!previewSizeDrag || ev.pointerId !== previewSizeDrag.pointerId) return;
  // Both orientations grow toward the leading edge: drag up to grow the
  // bottom strip, drag left to grow the right one.
  const moved = previewSizeDrag.start - (previewSizeDrag.vertical ? ev.clientX : ev.clientY);
  const next = Math.max(
    PREVIEW_MIN_PX,
    Math.min(previewSizeDrag.startSize + moved, previewSizeDrag.startSize + previewSizeDrag.room)
  );
  applyPreviewSize(next, previewSizeDrag.vertical);
});
function endPreviewDrag() {
  if (!previewSizeDrag) return;
  try { previewResizer.releasePointerCapture(previewSizeDrag.pointerId); } catch (e) {}
  document.body.classList.remove('preview-resizing');
  const strip = previewStrip.getBoundingClientRect();
  const px = Math.round(previewSizeDrag.vertical ? strip.width : strip.height);
  const key = previewSizeDrag.vertical ? PREVIEW_W_KEY : PREVIEW_H_KEY;
  try { localStorage.setItem(key, String(px)); } catch (e) {}
  previewSizeDrag = null;
  populatePreviewStrip();
}
previewResizer?.addEventListener('pointerup', endPreviewDrag);
previewResizer?.addEventListener('pointercancel', endPreviewDrag);
previewResizer?.addEventListener('dblclick', () => {
  const vertical = previewIsVertical();
  try { localStorage.removeItem(vertical ? PREVIEW_W_KEY : PREVIEW_H_KEY); } catch (e) {}
  document.documentElement.style.removeProperty(vertical ? '--preview-w' : '--preview-h');
  populatePreviewStrip();
  flashMode('preview size: auto');
});

// First populate (applyState ran before viewHooks was reassigned).
updateScrubber();
populateNotesPane();
populatePreviewStrip();

// Resize fires at ~60 Hz during a drag; rebuilding every tick clones
// N chunks and schedules N rAFs per event. Debounce to the trailing
// edge so one rebuild lands after the user stops dragging.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(populatePreviewStrip, 120);
});

// Laser pointer: while the speaker mouse hovers over the stage
// viewport, mirror its position to the audience. Coordinates are
// expressed as fractions of the active chunk's bounding box, so the
// audience can place the dot correctly even at a different zoom.
// rAF-throttled so we don't spam the peer with raw pointermove.
let laserPending = null;
function maybeSendLaser() {
  if (!laserPending) return;
  const { x, y, chunkIdx, target } = laserPending;
  laserPending = null;
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx, x, y, target });
}
viewport.addEventListener('pointermove', (ev) => {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const r = entry.el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (!laserPending) requestAnimationFrame(maybeSendLaser);
  laserPending = { x, y, chunkIdx: state.activeIdx, target: 'chunk' };
});
viewport.addEventListener('pointerleave', () => {
  // Tell audience to drop the dot when the speaker mouse leaves the stage.
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx: -1, x: 0, y: 0 });
});

// Mirror the speaker's cursor while a figure is focused. The overlay
// covers the viewport (z-index 30), so the viewport pointermove above
// stops firing once focus is active – without this handler the audience
// would never see the laser dot during figure inspection. Coords are
// fractions of the focused card's bounding box, which the audience
// resolves against its own card (kept in lockstep via figure-view).
figureOverlay.addEventListener('pointermove', (ev) => {
  if (!focusedFigure) return;
  const r = focusedFigure.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (!laserPending) requestAnimationFrame(maybeSendLaser);
  laserPending = { x, y, chunkIdx: state.activeIdx, target: 'figure' };
});
figureOverlay.addEventListener('pointerleave', () => {
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx: -1, x: 0, y: 0 });
});

// Hello handshake: at boot the speaker adopts its opener (the
// audience that spawned it via S) as peer and announces itself.
// Audience replies with the current state snapshot; applyRemoteState
// picks it up. If we were opened standalone (no opener), peer stays
// null and we run on our localStorage state.
setPeer(window.opener);
sendToPeer({ type: 'hello', source: 'speaker' });
`;

// ── annotation integration ───────────────────────────────────────────

// Move `> annot:` blocks from a trailing `<!-- annotations:start --> … end`
// marker block (pasted in from the speaker's Shift-E export) into their
// target chunks. Each inner `### <chunk-id>` section is matched against a
// `## … {#<chunk-id>}` heading elsewhere in the source; the `> annot:`
// blockquote is inserted directly under that heading. Unresolved sections
// (unknown id) are kept in a trimmed marker block at EOF so nothing is lost.
//
// Pure string patch, no AST — the source round-trips verbatim aside from
// the moved annotations and the removed marker block.
const ANNOT_MARKER_START = '<!-- annotations:start -->';
const ANNOT_MARKER_END = '<!-- annotations:end -->';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAnnotLines(lines) {
  const out = [];
  let inAnnot = false;
  for (const line of lines) {
    if (/^>\s*annot:/i.test(line)) {
      if (inAnnot) out.push('');
      out.push(line);
      inAnnot = true;
      continue;
    }
    if (inAnnot && /^>/.test(line)) { out.push(line); continue; }
    if (inAnnot && !line.trim()) { inAnnot = false; continue; }
    inAnnot = false;
  }
  return out;
}

function integrateAnnotations(src) {
  const startIdx = src.indexOf(ANNOT_MARKER_START);
  if (startIdx < 0) return { src, moved: 0, unresolved: [], warnings: [], hadMarker: false };
  const endMarkerIdx = src.indexOf(ANNOT_MARKER_END, startIdx + ANNOT_MARKER_START.length);
  const blockEnd = endMarkerIdx >= 0 ? endMarkerIdx + ANNOT_MARKER_END.length : src.length;
  const blockInner = src.slice(
    startIdx + ANNOT_MARKER_START.length,
    endMarkerIdx >= 0 ? endMarkerIdx : src.length,
  );

  const warnings = [];
  const orphanLines = [];
  const sections = new Map();
  let cur = null;
  for (const line of blockInner.split('\n')) {
    const h3 = line.match(/^###\s+([A-Za-z0-9_-]+)\s*$/);
    if (h3) {
      cur = sections.get(h3[1]) || { id: h3[1], lines: [] };
      sections.set(h3[1], cur);
      continue;
    }
    if (cur) cur.lines.push(line);
    else orphanLines.push(line);
  }
  if (orphanLines.some(l => /^>\s*annot:/i.test(l))) {
    warnings.push('`> annot:` lines before the first `### <id>` header were ignored — prefix them with `### some-chunk-id` so the integrator knows where to put them.');
  }

  let before = src.slice(0, startIdx).replace(/\n+$/, '\n');
  let after = src.slice(blockEnd).replace(/^\n+/, '');
  const baseSrc = before + (after ? '\n' + after : '');

  // Compute target positions against the unmutated source so injected
  // annotation text can never be misread as a chunk heading by a later
  // section's regex scan. Apply injections in descending order so earlier
  // indices stay valid.
  const plans = [];
  const unresolved = [];
  for (const sec of sections.values()) {
    const annotLines = extractAnnotLines(sec.lines);
    if (!annotLines.length) { unresolved.push({ id: sec.id, reason: 'no > annot: lines' }); continue; }
    const headingRe = new RegExp(
      '^##[^\\n]*\\{[^}\\n]*#' + escapeRegex(sec.id) + '(?=[\\s}])[^}\\n]*\\}[^\\n]*$',
      'm',
    );
    const m = baseSrc.match(headingRe);
    if (!m) { unresolved.push({ id: sec.id, reason: 'chunk id not found' }); continue; }
    plans.push({ insertAt: m.index + m[0].length, annotLines });
  }
  plans.sort((a, b) => b.insertAt - a.insertAt);

  let working = baseSrc;
  for (const { insertAt, annotLines } of plans) {
    working = working.slice(0, insertAt) + '\n\n' + annotLines.join('\n') + working.slice(insertAt);
  }

  if (unresolved.length) {
    const parked = unresolved
      .map(u => {
        const sec = sections.get(u.id);
        return '### ' + u.id + '\n' + sec.lines.join('\n').replace(/^\n+|\n+$/g, '');
      })
      .join('\n\n');
    if (!working.endsWith('\n')) working += '\n';
    working += '\n' + ANNOT_MARKER_START + '\n\n' + parked + '\n\n' + ANNOT_MARKER_END + '\n';
  }

  return { src: working, moved: plans.length, unresolved, warnings, hadMarker: true };
}

function runIntegrate(absIn) {
  const src = fs.readFileSync(absIn, 'utf8');
  const result = integrateAnnotations(src);
  if (!result.hadMarker) {
    console.error('No <!-- annotations:start --> block found in ' + absIn);
    process.exit(1);
  }
  if (result.moved === 0 && result.unresolved.length === 0 && !result.warnings.length) {
    console.log('Marker block was empty — nothing to integrate. Source unchanged.');
    return;
  }
  fs.writeFileSync(absIn, result.src);
  console.log('Integrated ' + result.moved + ' annotation' + (result.moved === 1 ? '' : 's') + ' into ' + absIn);
  for (const w of result.warnings) console.warn('Warning: ' + w);
  if (result.unresolved.length) {
    console.log('Unresolved (parked at EOF in the marker block):');
    for (const u of result.unresolved) {
      console.log('  - ' + u.id + ': ' + u.reason);
    }
  }
  console.log('Review with `git diff`, then rebuild the lecture to render the new Presentation Notes.');
}

// ── image optimisation (--optimize-images) ───────────────────────────
//
// The problem this solves is narrow and worth stating precisely, because the
// obvious fix is the wrong one. Assets that blow the inline cap are almost
// never oversized in *pixels* – measured across the content repo, the worst
// offender was a 3.03 MB PNG at exactly 1920x1080, i.e. already at slide
// resolution. The bytes are PNG being a poor fit for photographic content,
// not excess resolution.
//
// So this converts, and deliberately does not downscale by default:
//
//   - WebP q92 measured 12–18% of the original on real lecture assets
//     (3.03 MB -> 0.41 MB), and at 3x pixel-zoom on text over a photographic
//     background the difference is not visible. Lossless WebP only reaches
//     32–69%, which does not reliably clear the cap.
//   - Downscaling would actively damage a feature: figure focus zooms to
//     FIG_MAX_SCALE (8x), so a high-resolution diagram is high-resolution on
//     purpose. One asset here is 3968px wide at only 875 KB – exactly the
//     file you must not touch. --max-width exists for genuine outliers and
//     is off unless asked for.
//
// Encoders are shelled out to rather than added as an npm dependency: this
// is an occasional authoring step, not the build path, so requiring cwebp or
// ImageMagick here costs nothing to someone who only ever builds. (sips ships
// with macOS but cannot write WebP, so there is no zero-install fallback –
// another reason not to put conversion in buildOnce.)

const OPTIMIZE_MIN_BYTES = 512 * 1024;   // leave small assets alone
const WEBP_QUALITY = 92;
const OPTIMIZABLE_EXTS = new Set(['png', 'jpg', 'jpeg']);

// Pixel dimensions straight from the file header, so --max-width can refuse
// to enlarge and the report can show what it is working with. Zero-dep on
// purpose: pulling in an image library for two integers would be absurd, and
// `cwebp -resize W 0` happily *upscales* a narrower image, so the guard has
// to live here.
//   PNG: IHDR is always the first chunk – width/height at bytes 16..23.
//   JPEG: walk the segment chain to the first SOFn marker (excluding the
//         DHT/DAC/RSTn range) and read height/width from its payload.
function imageSize(absPath) {
  let fd;
  try {
    fd = fs.openSync(absPath, 'r');
    const head = Buffer.alloc(32);
    fs.readSync(fd, head, 0, 32, 0);
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
    }
    if (head[0] === 0xff && head[1] === 0xd8) {
      const size = fs.statSync(absPath).size;
      let pos = 2;
      const seg = Buffer.alloc(9);
      while (pos < size - 9) {
        fs.readSync(fd, seg, 0, 9, pos);
        if (seg[0] !== 0xff) { pos++; continue; }        // resync on padding
        const marker = seg[1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
        const len = seg.readUInt16BE(2);
        const isSOF = marker >= 0xc0 && marker <= 0xcf
          && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { height: seg.readUInt16BE(5), width: seg.readUInt16BE(7) };
        pos += 2 + len;
      }
    }
    // WebP – and it matters more than the others, because WebP is what this
    // project's own --optimize-images produces. Three chunk shapes: VP8X
    // (extended), VP8L (lossless) and VP8 (lossy).
    if (head.subarray(0, 4).toString('latin1') === 'RIFF'
        && head.subarray(8, 12).toString('latin1') === 'WEBP') {
      const fourcc = head.subarray(12, 16).toString('latin1');
      if (fourcc === 'VP8X') {
        return { width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
      }
      if (fourcc === 'VP8L' && head[20] === 0x2f) {
        const bits = head.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (fourcc === 'VP8 ') {
        return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
      }
    }
    if (head.subarray(0, 3).toString('latin1') === 'GIF') {
      return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) {} }
  }
}

function detectWebpEncoder() {
  const probe = (bin, args) => {
    try { execFileSync(bin, args, { stdio: 'ignore' }); return true; }
    catch (e) { return e.code !== 'ENOENT'; }
  };
  if (probe('cwebp', ['-version'])) {
    return {
      name: 'cwebp',
      encode(src, dst, resizeTo) {
        const args = ['-quiet', '-q', String(WEBP_QUALITY), '-m', '6', '-sharp_yuv'];
        // Height 0 keeps the aspect ratio. The caller has already decided
        // that resizeTo is smaller than the source.
        if (resizeTo) args.push('-resize', String(resizeTo), '0');
        execFileSync('cwebp', [...args, src, '-o', dst], { stdio: 'ignore' });
      },
    };
  }
  if (probe('magick', ['-version'])) {
    return {
      name: 'magick',
      encode(src, dst, resizeTo) {
        const args = [src, '-quality', String(WEBP_QUALITY)];
        // The trailing > is belt-and-braces: the caller already filtered.
        if (resizeTo) args.push('-resize', `${resizeTo}x>`);
        execFileSync('magick', [...args, dst], { stdio: 'ignore' });
      },
    };
  }
  return null;
}

// Collect every image reference in the source together with how it was
// written, because that decides whether a rename needs a source edit.
// Shorthand refs (`![](fig-id)`) resolve through IMG_EXTS and need none;
// explicit paths (`![](img/foo.png)`) name the extension and do.
function collectImageRefs(src, sourceDir) {
  const refs = new Map();   // absPath -> { absPath, ext, explicitRefs: Set<string> }
  const add = (absPath, explicitRef) => {
    const ext = path.extname(absPath).slice(1).toLowerCase();
    if (!refs.has(absPath)) refs.set(absPath, { absPath, ext, explicitRefs: new Set() });
    if (explicitRef) refs.get(absPath).explicitRefs.add(explicitRef);
  };
  for (const m of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    const href = m[1];
    if (/^[a-z]+:/i.test(href)) continue;                    // remote URL
    if (!href.includes('/') && !path.extname(href)) {
      const rel = resolveFigId(href);                        // shorthand
      if (rel) add(path.join(sourceDir, rel), null);
      continue;
    }
    const abs = path.resolve(sourceDir, href);
    if (fs.existsSync(abs)) add(abs, href);
  }
  // Diagram images too, or the verb the oversized-asset failure tells the
  // author to run answers "nothing to do" about the very file it refused.
  for (const ref of collectDiagramImageRefs(src)) {
    if (/^[a-z]+:/i.test(ref)) continue;
    if (!ref.includes('/') && !path.extname(ref)) {
      const rel = resolveFigId(ref);
      if (rel) add(path.join(sourceDir, rel), null);
      continue;
    }
    const abs = path.resolve(sourceDir, ref);
    if (fs.existsSync(abs)) add(abs, ref);
  }
  return [...refs.values()];
}

function runOptimizeImages(absIn, { dryRun = false, all = false, maxWidth = null } = {}) {
  const sourceDir = path.dirname(absIn);
  currentSourceDir = sourceDir;      // resolveFigId closes over this
  imgResolveCache.clear();
  let src = fs.readFileSync(absIn, 'utf8');

  const threshold = all ? 0 : OPTIMIZE_MIN_BYTES;
  const candidates = collectImageRefs(src, sourceDir)
    .filter(r => OPTIMIZABLE_EXTS.has(r.ext))
    .map(r => ({ ...r, size: fs.statSync(r.absPath).size }))
    .filter(r => r.size >= threshold)
    .sort((a, b) => b.size - a.size);

  if (!candidates.length) {
    console.log(all
      ? 'No PNG/JPEG assets referenced by this lecture.'
      : `Nothing to do: no referenced PNG/JPEG asset is ${(OPTIMIZE_MIN_BYTES / 1024).toFixed(0)} KB or larger. Use --all to convert every raster.`);
    return;
  }

  const encoder = detectWebpEncoder();
  if (!encoder) {
    console.error('No WebP encoder found. Install one of:');
    console.error('  brew install webp        # provides cwebp (preferred)');
    console.error('  brew install imagemagick # provides magick');
    console.error('macOS sips cannot write WebP, so there is no built-in fallback.');
    process.exit(1);
  }

  console.log(`Encoder: ${encoder.name} · quality ${WEBP_QUALITY}${maxWidth ? ` · max width ${maxWidth}px` : ' · no downscaling'}${dryRun ? ' · DRY RUN' : ''}`);
  console.log('');

  const rows = [];
  let before = 0, after = 0, converted = 0;
  const sourceEdits = [];

  for (const ref of candidates) {
    const dst = ref.absPath.replace(/\.[^.]+$/, '.webp');
    // A .webp already sitting next to the original would be shadowed by it
    // anyway (IMG_EXTS puts png before webp), so overwriting is the right
    // move – but say so rather than clobbering silently.
    const dstExisted = fs.existsSync(dst);
    const tmp = dst + '.tmp';
    // Only ever shrink. cwebp -resize enlarges a narrower image without
    // complaint, which would waste bytes and invent detail.
    const dims = imageSize(ref.absPath);
    const resizeTo = (maxWidth && dims && dims.width > maxWidth) ? maxWidth : null;
    const dimLabel = dims
      ? `${dims.width}x${dims.height}${resizeTo ? ` → ${resizeTo}w` : ''}`
      : '?';
    let outSize;
    try {
      encoder.encode(ref.absPath, tmp, resizeTo);
      outSize = fs.statSync(tmp).size;
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      rows.push({ name: path.basename(ref.absPath), from: ref.size, to: null, dims: dimLabel, note: 'encode failed' });
      continue;
    }
    // WebP is not always smaller – an already-optimised PNG of flat colour
    // can lose. Keep whichever is smaller and never report a regression as
    // a win.
    if (outSize >= ref.size) {
      fs.rmSync(tmp, { force: true });
      rows.push({ name: path.basename(ref.absPath), from: ref.size, to: outSize, dims: dimLabel, note: 'kept original (webp larger)' });
      before += ref.size; after += ref.size;
      continue;
    }
    before += ref.size; after += outSize; converted++;
    rows.push({
      name: path.basename(ref.absPath), from: ref.size, to: outSize, dims: dimLabel,
      note: dstExisted ? 'overwrote existing .webp' : '',
    });
    if (dryRun) { fs.rmSync(tmp, { force: true }); continue; }
    fs.renameSync(tmp, dst);
    fs.rmSync(ref.absPath, { force: true });
    for (const explicit of ref.explicitRefs) {
      const replacement = explicit.replace(/\.[^.]+$/, '.webp');
      sourceEdits.push({ from: explicit, to: replacement });
      src = src.split(`](${explicit})`).join(`](${replacement})`);
    }
  }

  const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
  for (const r of rows) {
    const pct = r.to == null ? '   –' : String(Math.round((r.to / r.from) * 100)).padStart(3) + '%';
    console.log(`  ${r.name.padEnd(44)} ${(r.dims || '?').padEnd(16)} ${kb(r.from)} → ${r.to == null ? '     —' : kb(r.to)}  ${pct}  ${r.note}`);
  }
  console.log('');
  console.log(`  ${'total'.padEnd(44)} ${''.padEnd(16)} ${kb(before)} → ${kb(after)}  ${String(Math.round((after / before) * 100)).padStart(3)}%  (${converted} converted)`);

  if (dryRun) {
    console.log('');
    console.log('Dry run – nothing written. Drop --dry-run to apply.');
    return;
  }

  if (sourceEdits.length) {
    fs.writeFileSync(absIn, src, 'utf8');
    console.log('');
    console.log(`Rewrote ${sourceEdits.length} explicit image path(s) in ${path.basename(absIn)}:`);
    for (const e of sourceEdits) console.log(`  ${e.from} → ${e.to}`);
  }
  console.log('');
  console.log('Originals were replaced. Review with `git diff` and `git status`, then rebuild.');
  console.log('Shorthand refs like ![](fig-id) need no edit – the resolver finds the .webp.');
}

// ── CLI ──────────────────────────────────────────────────────────────

// Self-check on the inlined stylesheets. Every CSS block in this file lives
// inside a template literal, where two edit mistakes are silent and costly:
// an unterminated /* comment swallows the rules that follow it, and a stray
// backtick inside a comment ends the literal (that one at least throws at
// parse time). An unbalanced comment does not throw – it just deletes styling
// from every output, which is how a whole collapse-mode rule once shipped
// broken. Cheap to check, so check it on every build.
function assertStylesheetsWellFormed() {
  // editor.css is a real file rather than a constant, and it goes through
  // this check for exactly the same reason the constants do: an unterminated
  // comment silently drops every rule to the next one.
  const sheets = { AUDIENCE_CSS, SPEAKER_CSS, PRINT_CSS, 'editor.css': editorCss() };
  for (const [name, css] of Object.entries(sheets)) {
    if (typeof css !== 'string') continue;
    const opens = (css.match(/\/\*/g) || []).length;
    const closes = (css.match(/\*\//g) || []).length;
    if (opens !== closes) {
      throw new Error(
        `${name} has ${opens} "/*" but ${closes} "*/" – an unbalanced CSS comment ` +
        `silently drops every rule until the next "*/". Fix build.js before shipping.`
      );
    }
    // Nesting is not allowed in CSS comments either: /* /* */ terminates at
    // the first */ and leaves the rest of the "comment" as broken CSS.
    if (/\/\*[^*]*(\*(?!\/)[^*]*)*\/\*/.test(css)) {
      throw new Error(`${name} contains a nested "/*" inside a CSS comment.`);
    }
  }
}

// Build the three HTML outputs for a single source file. Returns the
// list of written paths and the lecture shape string. Throws on parse
// errors – callers in --watch wrap this so a single bad save does not
// kill the watcher.
function buildOnce(absIn, only, opts = {}) {
  assertStylesheetsWellFormed();
  const src = fs.readFileSync(absIn, 'utf8');
  const outDir = path.dirname(absIn);
  // Scope image-shorthand resolution to this lecture's folder for the
  // duration of the render. marked renderers close over this via the
  // module-level currentSourceDir. Clearing the resolve cache per build
  // keeps --watch honest when authors add/remove asset files between
  // rebuilds (stale hits would otherwise mask real missing-asset errors).
  currentSourceDir = outDir;
  imgResolveCache.clear();
  dataUriCache.clear();
  inlineSvgCounter = 0;
  dgCore.resetCounter();
  dgWarned.clear();
  dgLectureTags.clear();
  MATH_ERRORS.length = 0;
  lastKatexSheet = null;
  // Auto-inline decision when neither --inline-images nor --no-inline-images
  // was passed: scan referenced images, inline iff total fits AUTO_INLINE_BUDGET.
  // Either way log the decision so authors notice when a deck silently flips
  // from inlined back to external (e.g. after adding a heavy asset).
  let inlineImages = opts.inlineImages;
  let scan = null;
  if (inlineImages === undefined) {
    scan = scanReferencedImages(src, outDir);
    const { total, count } = scan;
    if (count === 0) {
      inlineImages = false;
    } else if (total <= AUTO_INLINE_BUDGET) {
      inlineImages = true;
      const mb = (total / 1024 / 1024).toFixed(2);
      const budgetMb = AUTO_INLINE_BUDGET / 1024 / 1024;
      console.log(`[inline-images] auto-inlining ${count} image(s), ${mb} MB total (under ${budgetMb} MB budget). Use --no-inline-images to disable.`);
    } else {
      inlineImages = false;
      const mb = (total / 1024 / 1024).toFixed(2);
      const budgetMb = AUTO_INLINE_BUDGET / 1024 / 1024;
      console.log(`[inline-images] ${count} image(s) total ${mb} MB exceed ${budgetMb} MB auto-inline budget; using external paths. Use --inline-images to force.`);
    }
  }
  inlineAssetsEnabled = !!inlineImages;
  // Pre-flight, before any rendering: fail without leaving a half-broken
  // artefact on disk. Only matters when inlining is on – with external paths
  // the size cap is irrelevant and nothing is being promised.
  if (inlineAssetsEnabled) {
    if (!scan) scan = scanReferencedImages(src, outDir);
    // Oversized *images* still fail: there is no good answer for them, only
    // a broken figure later. Oversized clips do have one – staging into
    // videos/ – so they are handled rather than refused.
    assertInlinable(scan.oversized.filter(o => !isVideoExt(o.abs)), outDir);
  }
  // Reset before parsing, not after: renderEmbedOpen fills this from inside
  // parseLecture, so a reset further down wiped the very thing it collects.
  embedsThisBuild = [];
  const lecture = parseLecture(src);
  const chunkCount = lecture.columns.reduce((n, c) => n + c.chunks.length, 0);
  const shape = `${lecture.columns.length} columns, ${chunkCount} chunks`;

  // Read and encode the embedded faces once, not once per view: the four
  // outputs share the same bytes. Runs before anything is written, so a
  // frontmatter family with no matching file fails without leaving an
  // artefact behind – same contract as assertInlinable above.
  const authorFonts = collectEmbeddedFonts(lecture.frontmatter, outDir);
  // The bundle covers every role the author did not claim. `fonts: none`
  // turns it off for someone who would rather ship a smaller file and
  // accept whatever the presenting machine happens to have.
  const claimed = new Set((authorFonts ? authorFonts.overrides : []).map(o => o.role));
  const bundleOff = String(lecture.frontmatter.fonts || '').trim().toLowerCase() === 'none';
  const bundled = bundleOff ? [] : bundledFaces().filter(f => !claimed.has(f.role));
  const fontEmbed = (authorFonts || bundled.length)
    ? { faces: authorFonts ? authorFonts.faces : [],
        overrides: authorFonts ? authorFonts.overrides : [],
        bundled }
    : null;
  if (authorFonts) {
    const kb = Math.round(authorFonts.bytes / 1024);
    console.log(`[fonts] ${authorFonts.faces.length} face(s) from fonts/ embedded, ${kb} KB per view. Check that your licence permits redistribution.`);
    for (const n of authorFonts.notes) console.log(`[fonts] ${n}`);
  }
  if (bundled.length) {
    const kb = Math.round(bundled.reduce((n, f) => n + f.bytes, 0) / 1024);
    console.log(`[fonts] ${bundled.length} bundled face(s) embedded, ${kb} KB per view (OFL-1.1). Use \`fonts: none\` to ship without them.`);
  } else if (bundleOff) {
    console.log('[fonts] bundle disabled; the outputs name their typefaces and rely on the presenting machine having them. Safari does not expose installed fonts.');
  }
  lastQrStats = { count: 0, bytes: 0 };
  stagedVideos.clear();
  const renderOpts = { ...opts, fontEmbed };

  const targets = [
    ['print',       renderDocument],
    ['print-notes', (l, o) => renderDocument(l, { ...o, withNotes: true })],
    ['audience',    renderAudience],
    ['speaker',     renderSpeaker],
  ].filter(([name]) => !only || only === `--${name}-only`);

  const written = [];
  for (const [name, render] of targets) {
    const p = path.join(outDir, `${name}.html`);
    fs.writeFileSync(p, render(lecture, renderOpts));
    written.push(path.relative(process.cwd(), p));
  }
  if (embedsThisBuild.length) {
    const hosts = [...new Set(embedsThisBuild.map(e => e.host))].join(', ');
    console.log(
      `[embed] ${embedsThisBuild.length} hosted player(s) from ${hosts}.\n` +
      `        These outputs are NOT self-contained: the machine showing them contacts\n` +
      `        that host while the lecture runs.`
    );
    if (embedsThisBuild.some(e => !e.playsFromFile)) {
      console.log(
        `        YouTube will not play from a file:// page (it needs a real origin).\n` +
        `        Present with: node build.js <source.md> --serve`
      );
    }
  }
  if (stagedVideos.size) {
    const rows = [...stagedVideos.values()].filter(v => v.rel);
    const mb = (rows.reduce((n, v) => n + v.bytes, 0) / 1024 / 1024).toFixed(1);
    const copied = rows.filter(v => v.copied).length;
    console.log(
      `[video] ${rows.length} clip(s), ${mb} MB, are too large to inline and play from ` +
      `${VIDEO_STAGE_DIR}/ instead${copied ? ` (${copied} copied there now)` : ' (already there)'}.\n` +
      `        These outputs are NOT self-contained: keep the ${VIDEO_STAGE_DIR}/ folder beside the HTML when you share it.`
    );
    for (const v of stagedVideos.values()) {
      if (v.error) console.warn(`[video] could not stage a clip: ${v.error}`);
    }
  }
  if (lastQrStats.count) {
    console.log(`[qr] ${lastQrStats.count} link address(es) carry a QR code, ${Math.round(lastQrStats.bytes / 1024)} KB per live view.`);
  }
  // KaTeX renders a broken formula in red rather than throwing, which is the
  // right call mid-lecture but means a typo would otherwise ship silently.
  // Report it here so the author sees it on the terminal too. Deduplicated:
  // the same formula is rendered once per view.
  if (MATH_ERRORS.length) {
    const seen = new Set();
    for (const e of MATH_ERRORS) {
      if (seen.has(e.tex)) continue;
      seen.add(e.tex);
      console.warn(`[math] could not render: ${e.tex.slice(0, 60)} – ${e.message}`);
    }
  }
  if (lastKatexSheet) {
    const kb = (lastKatexSheet.bytes / 1024).toFixed(0);
    // The figure reported is the live views', which is the larger of the
    // two: they carry the sans and typewriter faces so the maths can follow
    // the F toggle. Print has no toggle and gets only what its formulas use.
    console.log(`[math] ${lastKatexSheet.families} KaTeX font families inlined, ${kb} KB of woff2 per live view (of 254 KB for the full set); print carries only the families its formulas use. A lecture without math inlines nothing.`);
  }
  return { written, shape };
}

// Watch mode: build once, start a WS server on a free port, install a
// debounced fs.watch on the source file, and broadcast 'reload' to all
// connected clients on each successful rebuild. The reload snippet
// reconnects on close, so the server can come and go without breaking
// the open browser tabs.
async function runWatch(absIn, only, baseOpts = {}) {
  const { WebSocketServer } = await import('ws');
  // Loopback, explicitly. Omitting `host` listens on every interface, which
  // for a one-way reload socket was merely untidy and for a socket that can
  // write to the author's disk is not.
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => wss.on('listening', resolve));
  const port = wss.address().port;
  // A per-build secret, required on every patch. Without it any page in the
  // browser that guessed the port could write to source.md.
  let nonce = crypto.randomBytes(16).toString('hex');
  const opts = { ...baseOpts, watchPort: port, watchNonce: nonce };

  const broadcast = (msg) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  };

  const rebuild = (label) => {
    try {
      const { written, shape } = buildOnce(absIn, only, opts);
      console.log(`[${label}] ${written.join(', ')} (${shape})`);
      broadcast('reload');
    } catch (err) {
      console.error(`[${label}] build failed: ${err.message}`);
    }
  };

  // Write-back from the editor. Three things have to be true before a patch
  // touches the file, and the third is what makes two open tabs safe:
  //
  //  - the nonce matches this build's,
  //  - the range is one a `::: diagram` block of the last build actually
  //    occupied,
  //  - and the bytes still there are the bytes that block compiled from.
  //
  // The file is re-read for that last check, so a patch computed against a
  // stale buffer is refused rather than applied at the wrong offset. Whoever
  // writes second is working against a range that no longer exists and gets
  // told so instead of corrupting the source.
  wss.on('connection', (sock) => {
    sock.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || (msg.type !== 'patch' && msg.type !== 'assets' && msg.type !== 'asset')) return;
      // `extra` first, so a payload field can never shadow a protocol one.
      // It could: an asset reply carries the asset's own `id`, and spreading
      // it last overwrote the message id the client pairs on – the write
      // succeeded, the promise never resolved, and the picker sat there.
      const reply = (ok, why, extra) => sock.send(JSON.stringify({ ...extra, type: msg.type + '-result', id: msg.id, ok, why }));
      if (msg.nonce !== nonce) return reply(false, 'this page is from an older build – reload it and try again');

      const assetDir = path.join(path.dirname(absIn), 'assets');

      // Everything in assets/ the resolver would find, so the editor's
      // picker can offer a file no diagram references yet. Names only – the
      // bytes stay on disk until the build inlines them.
      if (msg.type === 'assets') {
        let names = [];
        try {
          names = fs.readdirSync(assetDir)
            .filter(f => IMG_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
            .map(f => {
              const st = fs.statSync(path.join(assetDir, f));
              return { file: f, id: f.replace(/\.[^.]+$/, ''), bytes: st.size };
            })
            .sort((a, b) => a.id.localeCompare(b.id));
        } catch (e) { /* no assets/ yet is not an error, it is an empty list */ }
        return reply(true, '', { assets: names });
      }

      // A file, into assets/ beside source.md. Five refusals rather than five
      // sanitisations: a cleaned-up path is a path somebody reasoned about
      // wrongly, and this is the one message that writes somewhere the author
      // did not name.
      if (msg.type === 'asset') {
        const name = String(msg.name || '');
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
          return reply(false, `"${name}" is not a usable file name – letters, digits, dot, dash and underscore, and no path separators`);
        }
        const ext = path.extname(name).slice(1).toLowerCase();
        if (!IMG_EXTS.includes(ext)) {
          return reply(false, `psi-slides resolves ${IMG_EXTS.join(', ')} – not ".${ext}"`);
        }
        let bytes;
        try { bytes = Buffer.from(String(msg.data || ''), 'base64'); }
        catch { return reply(false, 'the file did not arrive intact'); }
        if (!bytes.length) return reply(false, 'the file is empty');
        // Refuse here rather than let assertInlinable hard-fail the very next
        // rebuild – failing the build an author is watching is worse than
        // declining the file while they can still do something about it.
        if (bytes.length > MAX_INLINE_BYTES) {
          return reply(false, `${(bytes.length / 1024 / 1024).toFixed(1)} MB is over the ${MAX_INLINE_BYTES / 1024 / 1024} MB inline cap, and the next build would refuse it. `
            + 'Shrink it first – "node build.js <source.md> --optimize-images" converts to WebP q92, which measured 12-18% of the original on real lecture assets.');
        }
        const dest = path.join(assetDir, name);
        if (fs.existsSync(dest) && !msg.replace) {
          const same = (() => { try { return fs.readFileSync(dest).equals(bytes); } catch { return false; } })();
          if (!same) return reply(false, `assets/${name} already exists and is a different file`, { exists: true });
          return reply(true, '', { file: name, id: name.replace(/\.[^.]+$/, ''), unchanged: true });
        }
        try {
          fs.mkdirSync(assetDir, { recursive: true });
          fs.writeFileSync(dest, bytes);
        } catch (e) { return reply(false, 'cannot write the asset: ' + e.message); }
        console.log(`[asset] assets/${name} (${bytes.length < 1024 ? bytes.length + ' B' : (bytes.length / 1024).toFixed(0) + ' KB'})`);
        // Deliberately no rebuild here. fs.watch is on source.md, so writing
        // the asset alone changes nothing on screen – the `patch` that adds
        // the `image` line is what kicks the build, and by then the file is
        // on disk. Sending them the other way round fails the rebuild on an
        // asset it cannot find.
        return reply(true, '', { file: name, id: name.replace(/\.[^.]+$/, '') });
      }

      const range = Array.isArray(msg.range) ? msg.range : null;
      if (!range || typeof msg.text !== 'string') return reply(false, 'malformed patch');
      const hit = dgEmittedBlocks.find(b => b.range[0] === range[0] && b.range[1] === range[1]);
      if (!hit) return reply(false, 'that is not a ::: diagram block this build emitted');
      let src;
      try { src = fs.readFileSync(absIn, 'utf8'); } catch (e) { return reply(false, 'cannot read the source: ' + e.message); }
      const there = src.slice(range[0], range[1]);
      if (there !== hit.body) {
        return reply(false, 'source.md has changed since this build – reload the page and try again');
      }
      // And the bytes the *page* believes are there. The check above only
      // proves the file still matches the last build; this one is what makes
      // two open tabs safe when an edit happens to keep the block's length,
      // where the range would otherwise still exist and the second write
      // would silently take the first one's change with it.
      if (typeof msg.was === 'string' && msg.was !== there) {
        return reply(false, 'another window has already edited this figure – reload the page and try again');
      }
      try {
        fs.writeFileSync(absIn, src.slice(0, range[0]) + msg.text + src.slice(range[1]), 'utf8');
      } catch (e) { return reply(false, 'cannot write the source: ' + e.message); }
      console.log(`[patch] ${path.relative(process.cwd(), absIn)} – ${hit.chunk ? '#' + hit.chunk : 'a diagram'}, ${msg.text.length - hit.body.length >= 0 ? '+' : ''}${msg.text.length - hit.body.length} bytes`);
      reply(true, '');
      // fs.watch fires on the write and the normal rebuild follows, so the
      // editor never owns a parallel copy of anything.
    });
  });

  rebuild('initial');
  console.log(`Watching ${path.relative(process.cwd(), absIn)} – live-reload active (open the HTML files in Chrome)`);

  // Editors typically emit two close-spaced events per save (write +
  // rename on atomic save). Debounce so we rebuild once per save.
  let timer = null;
  fs.watch(absIn, { persistent: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => rebuild('rebuild'), 80);
  });
}

// Phase-1-valid scaffold for `--new <slug>`. Builds without errors as
// soon as it lands on disk; TODO markers stay sentence-level so the
// title slide reads obviously-incomplete (and a future linter can flag
// them as author-action-required).
function scaffoldSource(slug) {
  return `---
title: TODO – Lecture title
presenter: Prof. Dr. Dominik Herrmann
info: |
  TODO – first info line (date, location)
  TODO – second info line (course code, semester)
course: TODO-course-slug
lecture: ${slug}
---

## title: {#title}

# Introduction {#intro}

## free: TODO – placeholder chunk {.standard #intro-placeholder}

Replace this paragraph with the opening prose of the lecture.

> note: Speaker note for this chunk lives here.

## figure: TODO – figure heading {.wide #intro-figure}

::: diagram
box a "A"
:::

A seed for the diagram editor: build this lecture, click the figure, and the
button in the corner of the card opens it. The editor is bad at exactly the
part a new figure needs – the chunk id, the heading, the caption prose – so
those are text, and this is the two lines that give it something to open.
`;
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

function runNew(slug) {
  if (!slug) {
    console.error('Usage: node build.js --new <slug>   (e.g. --new wlab02)');
    process.exit(1);
  }
  if (!SLUG_RE.test(slug)) {
    console.error(`Invalid slug: ${slug}. Use lowercase letters, digits, and hyphens; must start with a letter.`);
    process.exit(1);
  }

  const dir = path.resolve('lectures', slug);
  if (fs.existsSync(dir)) {
    console.error(`Error: ${path.relative(process.cwd(), dir)} already exists. Pick a different slug or delete it first.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const srcPath = path.join(dir, 'source.md');
  fs.writeFileSync(srcPath, scaffoldSource(slug));

  const rel = path.relative(process.cwd(), srcPath);
  console.log(`Created ${rel} – run \`node build.js ${rel} --watch\` to start.`);
}

// ── local static server (--serve) ───────────────────────────────────
//
// Anyone who can build a lecture already has Node, so serving one over
// http costs them nothing to gain. It is worth having for one specific
// reason: a page opened from file:// has the origin `null` and sends no
// Referer, and YouTube's embed refuses to play under those conditions
// (Error 153) while the very same page served over http works. So a
// lecture that genuinely needs a hosted embed can be presented from here.
//
// Bound to loopback only. This serves a directory off the author's disk;
// it has no business being reachable from the lecture-hall network.
const SERVE_MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf', otf: 'font/otf', md: 'text/plain; charset=utf-8',
};

async function runServe(rootDir, wantedPort) {
  const http = await import('node:http');
  // Canonicalise the root too, or a repo reached through a symlinked path
  // would fail its own containment check.
  try { rootDir = fs.realpathSync(rootDir); } catch { /* keep as given */ }
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); return res.end('bad request'); }
    if (rel === '/') rel = '/audience.html';
    // Resolve, then confirm the result is still inside the served root:
    // without this, a request for /../../.ssh/id_rsa would be honoured.
    // Resolve symlinks before the containment test, not just `..`. A prefix
    // check on the lexical path still serves whatever a symlink inside the
    // lecture folder points at.
    let abs = path.resolve(rootDir, '.' + rel);
    try { abs = fs.realpathSync(abs); } catch { res.writeHead(404); return res.end('not found'); }
    if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) {
      res.writeHead(403); return res.end('forbidden');
    }
    let stat;
    try { stat = fs.statSync(abs); } catch { res.writeHead(404); return res.end('not found'); }
    if (stat.isDirectory()) { res.writeHead(404); return res.end('not found'); }

    const type = SERVE_MIME[path.extname(abs).slice(1).toLowerCase()] || 'application/octet-stream';
    // Range support is not optional here: Chrome asks for byte ranges when
    // it seeks in a <video>, and a server that answers 200-with-everything
    // makes the scrub bar unusable on a long recording.
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      const size = stat.size;
      let start = range[1] ? parseInt(range[1], 10) : 0;
      let end = range[2] ? parseInt(range[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        return res.end();
      }
      end = Math.min(end, size - 1);
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
      });
      return fs.createReadStream(abs, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'accept-ranges': 'bytes',
      // The whole point of --watch is that a reload shows new bytes.
      'cache-control': 'no-cache',
    });
    fs.createReadStream(abs).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(wantedPort || 0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  console.log(`Serving ${path.relative(process.cwd(), rootDir) || '.'} on ${base}`);
  for (const name of ['audience', 'speaker', 'print', 'print-notes']) {
    if (fs.existsSync(path.join(rootDir, `${name}.html`))) {
      console.log(`  ${base}/${name}.html`);
    }
  }
  console.log('  (loopback only – Ctrl-C to stop)');
  return server;
}

// Flags that consume the following argv token as their value, so it is not
// mistaken for the source path.
const VALUE_FLAGS = new Set(['--max-width', '--port']);

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter((a, i) =>
    !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));

  if (flags.has('--new')) {
    runNew(positional[0]);
    return;
  }

  // Image optimisation shells out to an encoder and never renders, so it
  // runs before the Shiki init below rather than paying for it.
  if (flags.has('--optimize-images')) {
    const absIn = path.resolve(positional[0] || '');
    if (!positional[0] || !fs.existsSync(absIn)) {
      console.error(`Input not found: ${absIn}`);
      process.exit(1);
    }
    let maxWidth = null;
    const mwIdx = argv.indexOf('--max-width');
    if (mwIdx !== -1) {
      maxWidth = parseInt(argv[mwIdx + 1], 10);
      if (!Number.isFinite(maxWidth) || maxWidth < 320) {
        console.error('--max-width needs a pixel value of at least 320.');
        process.exit(1);
      }
    }
    runOptimizeImages(absIn, {
      dryRun: flags.has('--dry-run'),
      all: flags.has('--all'),
      maxWidth,
    });
    return;
  }

  // Shiki must be ready before any renderer runs (the highlighter
  // singleton is shared across --watch rebuilds).
  await initHighlighter();

  const [inputPath] = positional;

  if (!inputPath || flags.has('--help') || flags.has('-h')) {
    console.error('Usage:');
    console.error('  node build.js <source.md> [--watch] [--serve [--port N]] [--audience-only|--print-only|--print-notes-only|--speaker-only]');
    console.error('                            [--inline-images|--no-inline-images]');
    console.error('  node build.js <source.md> --integrate-annotations');
    console.error('  node build.js <source.md> --optimize-images [--dry-run] [--all] [--max-width N]');
    console.error('  node build.js --new <slug>');
    console.error('');
    console.error('Image inlining (default: auto – inline iff referenced images sum < 10 MB; per-image cap 2 MB):');
    console.error('  --inline-images       force inlining regardless of total size');
    console.error('  --no-inline-images    force external asset paths');
    console.error('');
    console.error('Image optimisation (converts referenced PNG/JPEG to WebP q92, replacing the');
    console.error('originals; needs cwebp or magick on PATH):');
    console.error('  --optimize-images     convert referenced rasters ≥ 512 KB');
    console.error('  --dry-run             report what would change, write nothing');
    console.error('  --all                 convert every referenced raster, not just large ones');
    console.error('  --max-width N         also downscale to N px wide. Off by default on purpose:');
    console.error('                        figure focus zooms to 8x, so a high-resolution diagram');
    console.error('                        is high-resolution for a reason.');
    console.error('');
    console.error('Annotation integration:');
    console.error('  --integrate-annotations   move `> annot:` blocks from a trailing');
    console.error('                            <!-- annotations:start --> … :end marker block');
    console.error('                            into their chunks and remove the marker block.');
    process.exit(inputPath ? 0 : 1);
  }

  if (flags.has('--integrate-annotations')) {
    const absIn = path.resolve(inputPath);
    if (!fs.existsSync(absIn)) {
      console.error(`Input not found: ${absIn}`);
      process.exit(1);
    }
    runIntegrate(absIn);
    return;
  }

  const onlyFlags =['--audience-only', '--print-only', '--print-notes-only', '--speaker-only'].filter(f => flags.has(f));
  if (onlyFlags.length > 1) {
    console.error(`Error: ${onlyFlags.join(' and ')} are mutually exclusive.`);
    process.exit(1);
  }
  const only = onlyFlags[0];
  if (flags.has('--inline-images') && flags.has('--no-inline-images')) {
    console.error('Error: --inline-images and --no-inline-images are mutually exclusive.');
    process.exit(1);
  }
  const opts = {};
  if (flags.has('--inline-images')) opts.inlineImages = true;
  else if (flags.has('--no-inline-images')) opts.inlineImages = false;
  // else: leave undefined → buildOnce decides automatically

  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Input not found: ${absIn}`);
    process.exit(1);
  }

  const portIdx = argv.indexOf('--port');
  const servePort = portIdx >= 0 ? parseInt(argv[portIdx + 1], 10) || 0 : 0;

  if (flags.has('--watch')) {
    runWatch(absIn, only, opts).catch(err => {
      console.error(`Watch failed: ${err.message}`);
      process.exit(1);
    });
    // Serving is layered on top of watching rather than instead of it, so
    // --watch --serve gives live reload over http in one command.
    if (flags.has('--serve')) {
      await runServe(path.dirname(absIn), servePort);
    }
    return;
  }

  const { written, shape } = buildOnce(absIn, only, opts);
  console.log(`Wrote ${written.join(', ')} (${shape})`);
  if (flags.has('--serve')) await runServe(path.dirname(absIn), servePort);
}

main().catch(err => {
  // userFacing errors carry instructions for the author; anything else is a
  // defect in the build and deserves its stack.
  console.error(err && err.userFacing ? err.message : err);
  process.exit(1);
});
