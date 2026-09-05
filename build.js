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
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import matter from 'gray-matter';
import { marked } from 'marked';
import { createHighlighter } from 'shiki';
import katex from 'katex';
// The diagram compiler. The one part of the rendering stack that is not in
// this file, because it is the one part that has to run in two places: here,
// and in the browser when the editor re-lays-out a figure after a drag.
// Imported for the build; its *text* is also read and inlined into the live
// views, the same way bundledFaces() reads woff2 out of node_modules.
import { createDiagramCompiler, parseDiagramDefaults, dgShapeD, dgSplineD, dgPathD, DG_SHAPE_CLASSES, dgBarFillCss } from './diagram-core.mjs';
// The {…} tail grammar and the ::: draw opener, shared with lint.js so the
// two files cannot disagree about a tail. Tables plus small pure helpers,
// zero dependencies - see the header of tails.mjs and CLAUDE.md.
import {
  CHUNK_SLOTS, CHUNK_STYLE_CLASSES,
  CARDS_SLOTS, OVERLAY_SLOTS, BACKDROP_SLOTS, SIDE_SLOTS,
  splitTail, parseTail, slotTable, strayTailProblem,
  parseDrawOpener, formatDrawOpener, drawCompilerAttrs,
} from './tails.mjs';

// KaTeX ships its stylesheet and fonts as plain files next to the module.
// They are not importable as ESM, so resolve them the CommonJS way.
const nodeRequire = createRequire(import.meta.url);

// `closing` is the bookend to `title`: the last slide of a deck, drawn in
// the same cover composition so the arc closes on the shape it opened
// with. It is a tag and not a second `title:` chunk, and not a
// frontmatter key, for three reasons that are each already written down
// somewhere else in this repo. A title chunk's heading is *ignored* (PRD
// §3) because the cover renders from frontmatter, so a closing slide -
// which needs its own words - could only get them by making the heading
// mean something on the second occurrence, which is a positional
// exception to a frozen rule. `lint.js` already warns that a second
// `title:` chunk does not render, so the two spellings would contradict
// each other. And a frontmatter key could only ever repeat the cover's
// own fields, which is the one thing the closing slide must not be.
const VALID_TAGS = new Set([
  'title', 'closing', 'outline', 'principle', 'definition', 'example',
  'question', 'figure', 'exercise', 'free',
]);

// The width and class vocabulary of a chunk heading's {…} tail is
// CHUNK_SLOTS in tails.mjs, next to the slot tables of the five directives
// that take one. `.bare` exists because a heading is two things at once -
// the slide's title and the chunk's name in the TOC, in search and in print
// - and leaving the text out gives up all four where `.bare` gives up one.
// The `.wrap-*` / `.blocks-*` classes answer a `style:` key for one chunk.

// ── syntax highlighting ──────────────────────────────────────────────
// Shiki is loaded once per process and reused across rebuilds. Output
// is static HTML with inline styles – no runtime theme CSS needed.

const SHIKI_LANGS = [
  'python', 'bash', 'shell', 'javascript', 'typescript',
  'html', 'css', 'c', 'json', 'yaml', 'markdown', 'sql', 'toml', 'diff', 'text',
];
// Two themes, not one. A single light theme was correct on paper and unusable
// on the dark reading theme: measured against that theme's --paper (#0e0f12),
// github-light put plain identifiers at 1.31:1 and strings at 1.45:1, so a
// C block read as keywords floating over invisible names. Shiki's dual-theme
// output keeps the light colour as the inline `color` – so every token in the
// four light themes and in print keeps the exact hex it had – and carries the
// dark one as a `--shiki-dark` custom property the dark rule in AUDIENCE_CSS
// switches to. github-dark-default is the same family as the light theme, so
// a token keeps its role; its worst token on our paper measures 6.23:1.
// Dual-theme mode does split a few tokens into more spans than single-theme
// mode did (it has to reconcile two tokenizations), so the print markup is
// not byte-identical even though every colour in it is.
const SHIKI_THEME = 'github-light';
const SHIKI_THEME_DARK = 'github-dark-default';
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
  highlighter = await createHighlighter({ themes: [SHIKI_THEME, SHIKI_THEME_DARK], langs: SHIKI_LANGS });
  loadedLangs = new Set(highlighter.getLoadedLanguages());
}
function highlightCode(code, lang) {
  if (!highlighter) return null;
  const alias = LANG_ALIAS[lang] ?? lang;
  const useLang = loadedLangs.has(alias) ? alias : 'text';
  const key = useLang + '::' + code;
  if (highlightCache.has(key)) return highlightCache.get(key);
  let html;
  // defaultColor: 'light' is load-bearing – it keeps the light colour in the
  // `color` property, so a view with no stylesheet (or print) shows exactly
  // what it showed before, and the dark theme rides along as a variable.
  try {
    html = highlighter.codeToHtml(code, {
      lang: useLang,
      themes: { light: SHIKI_THEME, dark: SHIKI_THEME_DARK },
      defaultColor: 'light',
    });
  }
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

// ── WebP on the way into the HTML, never onto the author's files ─────
//
// A data: URI is base64, so inlining a PNG costs a third more than the file.
// Transcoding to WebP first wins far more than that overhead gives away -
// WebP q92 measured 12-18% of the original on real lecture assets - and the
// reader cannot tell, which is the whole reason --optimize-images picked
// those settings.
//
// The difference from that verb is the only thing to remember here: this
// touches **nothing on disk**. The PNG stays a PNG, the source.md is not
// rewritten, and a clone that someone else builds produces the same output.
// --optimize-images remains the explicit run for an author who also wants
// their repository smaller, and it is the one that rewrites both.
//
// No encoder on PATH is not an error. The original bytes go in, the build
// says so once, and everything still works - which is what makes this safe
// to have on by default. --no-optimize-images turns it off.
let noOptimizeImages = false;    // --no-optimize-images
const WEBP_INLINE_EXTS = new Set(['png', 'jpg', 'jpeg']);
let webpEncoder;                 // undefined = not probed, null = none found
let webpNoticeShown = false;
const webpInlineCache = new Map();
let webpInlineCount = 0, webpInlineSaved = 0;

function webpInlineBytes(absPath, origBytes) {
  if (noOptimizeImages) return null;
  const ext = path.extname(absPath).slice(1).toLowerCase();
  if (!WEBP_INLINE_EXTS.has(ext)) return null;
  if (webpInlineCache.has(absPath)) return webpInlineCache.get(absPath);
  if (webpEncoder === undefined) webpEncoder = detectWebpEncoder();
  if (!webpEncoder) {
    if (!webpNoticeShown) {
      webpNoticeShown = true;
      console.log('[images] no cwebp or magick on PATH, so PNG and JPEG go in as they are.'
        + ' Install one (brew install webp) and they shrink to roughly a sixth.');
    }
    webpInlineCache.set(absPath, null);
    return null;
  }
  const tmp = path.join(os.tmpdir(), 'psi-webp-' + crypto.randomBytes(6).toString('hex') + '.webp');
  let out = null;
  try {
    webpEncoder.encode(absPath, tmp, null);
    const buf = fs.readFileSync(tmp);
    // Only when it actually wins. A small flat PNG - a diagram exported as a
    // raster, a screenshot of a terminal - can come out larger as WebP, and
    // shipping a bigger file to honour a default is not an optimisation.
    if (buf.length < origBytes) out = buf;
  } catch (e) {
    out = null;
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* never existed */ }
  }
  if (out) { webpInlineCount++; webpInlineSaved += origBytes - out.length; }
  webpInlineCache.set(absPath, out);
  return out;
}

// Said once per build, after the inlining decision, because a reader wants
// the two numbers together: how much went in, and how much of it was saved.
function reportWebpInline() {
  if (!webpInlineCount) return;
  const mb = (webpInlineSaved / 1024 / 1024).toFixed(2);
  console.log(`[images] ${webpInlineCount} PNG/JPEG re-encoded to WebP for the output, ${mb} MB saved.`
    + ' The files on disk are untouched; --no-optimize-images turns this off.');
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
    const webp = webpInlineBytes(absPath, buf.length);
    uri = webp
      ? `data:image/webp;base64,${webp.toString('base64')}`
      : `data:${mime};base64,${buf.toString('base64')}`;
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
  let inFence = false;
  for (const line of String(src).split('\n')) {
    // Fence-aware, like the block matchers in parseLecture and lintDiagram:
    // a ::: draw inside a code fence is a syntax example, and collecting
    // its image lines converted (and with --optimize-images deleted) files
    // the lecture never actually references.
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!inDiagram) {
      if (parseDrawOpener(line)) inDiagram = true;
      continue;
    }
    if (/^:::\s*$/.test(line)) { inDiagram = false; continue; }
    // `image <name> <asset>`, and a grid of images – `grid <name> image
    // <asset> CxR` – which carries its asset one token further along.
    const m = line.trim().match(/^image\s+\S+\s+(\S+)/)
      || line.trim().match(/^grid\s+\S+\s+image\s+(\S+)/);
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
  // A backdrop and a cover-image go through the same data: URI as a figure
  // does, so they are subject to the same per-image cap – and left out of
  // this scan an oversized one fell through toDataUri to an external path
  // with no complaint, which is the exact failure assertInlinable exists
  // to stop. The backdrop match is line-anchored and not fence-aware for
  // the same reason the frontmatter one is not: a ::: backdrop inside a
  // code fence is a documented example, and counting its asset costs a
  // warning about a file the lecture does not reference. Cheap either way,
  // and the tutorial is the file that would trip it.
  for (const m of src.matchAll(/^:::[ \t]+backdrop[ \t]+([^\s{]+)/gm)) refs.add(m[1]);
  for (const m of src.matchAll(/^cover-image:[ \t]*["']?([^"'\s#]+)/gm)) refs.add(m[1]);
  // closing-image is the same picture through the same data: URI, so it
  // meets the same cap. `closing-image: cover` names no file of its own -
  // the cover-image line above has already contributed it - and resolves to
  // nothing here, which is what the isShorthand/statSync path below does
  // with any token that is not an asset.
  for (const m of src.matchAll(/^closing-image:[ \t]*["']?([^"'\s#]+)/gm)) refs.add(m[1]);

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
    `${oversized.length} asset(s) exceed the ${MAX_INLINE_BYTES / 1024 / 1024} MB per-image inline cap, so they would be`,
    `left as external paths and this output would not be self-contained:`,
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
// The faces this tool can embed without the author supplying a file. Keyed
// by family, because from now on a lecture picks *which* of them it wants
// per role rather than getting a fixed three.
//
// That change is what makes an alternate affordable at all. The roster used
// to be a list and every output carried all of it; adding two more faces
// would have put ~470 KB in every file, including every lecture that wanted
// neither. Now exactly three families are ever embedded – the ones this
// lecture resolves to – so an alternate costs only the lecture that asks
// for it, and Iosevka, which is 25x heavier than the default mono, is a
// price the author chooses and the build prints.
const BUNDLED_FONTS = {
  Literata: {
    role: 'serif', pkg: '@fontsource-variable/literata', variable: true,
    files: { normal: 'literata-latin-wght-normal.woff2', italic: 'literata-latin-wght-italic.woff2' },
  },
  // Four serif alternates, and the role got them for the reason the sans and
  // the mono got theirs: the roster is per-lecture, so a family costs only
  // the deck that names it. They were picked against one question - what a
  // projector does to a typeface - and measured in a browser rather than
  // argued about. Stroke contrast is the stem of a capital O over its
  // hairline, and low is what survives a lit room and a tired lamp; the
  // second number is how much wider the 600 stem is than the 400, which
  // matters more here than anywhere else, because `topic-bold` puts the
  // first sentence and the bold fragments on the slide and nothing else.
  //
  //                  contrast   bold    advance   payload
  //   Literata         1.68     +40%     0.560     106 KB
  //   Bitter           1.35     +51%     0.547      66 KB
  //   Roboto Serif     1.60     +63%     0.606     136 KB
  //   Source Serif 4   1.91     +30%     0.559     100 KB
  //   Noto Serif       2.00     +34%     0.560      83 KB
  //
  // Two families that look like obvious candidates are deliberately absent.
  // Merriweather reads robust - the largest x-height of any of them - and
  // its bold is the worst in the field at +15%, which is the one measurement
  // this tool cannot afford to lose. IBM Plex Serif would pair with the
  // default sans and has no variable build on @fontsource-variable, so it
  // fails the rule that a bundled face is a variable latin subset; an author
  // who wants it drops the static files in fonts/.
  'Source Serif 4': {
    role: 'serif', pkg: '@fontsource-variable/source-serif-4', variable: true,
    files: { normal: 'source-serif-4-latin-wght-normal.woff2', italic: 'source-serif-4-latin-wght-italic.woff2' },
  },
  // The sturdiest of the four by every measure that matters on a projection,
  // and the cheapest: lowest contrast, thickest hairline, largest x-height
  // after Merriweather, and 66 KB against Literata's 106.
  Bitter: {
    role: 'serif', pkg: '@fontsource-variable/bitter', variable: true,
    files: { normal: 'bitter-latin-wght-normal.woff2', italic: 'bitter-latin-wght-italic.woff2' },
  },
  'Noto Serif': {
    role: 'serif', pkg: '@fontsource-variable/noto-serif', variable: true,
    files: { normal: 'noto-serif-latin-wght-normal.woff2', italic: 'noto-serif-latin-wght-italic.woff2' },
  },
  // The one alternate that re-wraps a finished deck: 8% wider than Literata,
  // which is a line the paragraph did not have before. It also has the best
  // bold separation of the five, so the trade is real rather than a defect.
  // The width reaches one more place - see the note on dgCharW below.
  'Roboto Serif': {
    role: 'serif', pkg: '@fontsource-variable/roboto-serif', variable: true,
    files: { normal: 'roboto-serif-latin-wght-normal.woff2', italic: 'roboto-serif-latin-wght-italic.woff2' },
  },
  // The default sans since it replaced Inter Tight. Tight is the condensed
  // cut of Inter, and the saved width is paid for in letter spacing that
  // reads cramped on a screen - worst exactly where the text is already
  // small, in figure labels. Plex's narrow forms (i l j t) are 13.5% wider
  // and its digits 9.7%, which is what separates 1 from I from l at a
  // distance. dgCharW in diagram-core.mjs is calibrated to this face.
  'IBM Plex Sans': {
    role: 'sans', pkg: '@fontsource-variable/ibm-plex-sans', variable: true,
    files: { normal: 'ibm-plex-sans-latin-wght-normal.woff2', italic: 'ibm-plex-sans-latin-wght-italic.woff2' },
  },
  // Kept selectable rather than deleted, because it is what every lecture
  // built against 1.0.0 was set in, and `layout: 1.0` has to be able to get
  // it back. `docs/site/build-site.js` self-hosts it independently.
  'Inter Tight': {
    role: 'sans', pkg: '@fontsource-variable/inter-tight', variable: true,
    files: { normal: 'inter-tight-latin-wght-normal.woff2', italic: 'inter-tight-latin-wght-italic.woff2' },
  },
  'JetBrains Mono': {
    role: 'mono', pkg: '@fontsource-variable/jetbrains-mono', variable: true,
    files: { normal: 'jetbrains-mono-latin-wght-normal.woff2', italic: 'jetbrains-mono-latin-wght-italic.woff2' },
  },
  // The condensed answer, and it is a *named instance* of a variable font
  // rather than a different typeface: Noto Sans Mono carries a wdth axis,
  // and `font-variation-settings` is a legal @font-face descriptor, so
  // pinning wdth 62.5 in the face declaration produces one ordinary family
  // that nothing downstream has to know about. No font-stretch on any
  // element, no second selector list, no rule that has to reach every place
  // the mono role is used.
  //
  // 0.50 em per character against JetBrains Mono's 0.60 - measured in a
  // browser - which is most of why an author wants it: a listing that
  // overran the slide fits. It has a slashed zero and its I, l and 1 are
  // three visibly different shapes, which is the other half of what a code
  // face has to do.
  //
  // Iosevka was here first and was taken out on payload. It is the same
  // 0.50 em, and it is 961 KB against this file's 54 - three static files
  // came to 3.87 MB of base64 per view, on a tool whose promise is a file
  // you can mail. An author who wants Iosevka specifically can still drop
  // it in fonts/, which is what that mechanism is for.
  'Noto Sans Mono Condensed': {
    role: 'mono', pkg: '@fontsource-variable/noto-sans-mono', variable: true,
    // The wdth axis lives in the `standard` build; the `wght` build has
    // weight alone and would silently ignore the setting.
    files: { normal: 'noto-sans-mono-latin-standard-normal.woff2' },
    variations: "'wdth' 62.5",
  },
};
// What a lecture gets when it names nothing. `layout: 1.0` swaps the sans.
const BUNDLED_DEFAULTS = { serif: 'Literata', sans: 'IBM Plex Sans', mono: 'JetBrains Mono' };
const bundledNamesFor = (role) =>
  Object.entries(BUNDLED_FONTS).filter(([, f]) => f.role === role).map(([n]) => n);

const bundledFacesCache = new Map();
function bundledFaces(roster = BUNDLED_DEFAULTS) {
  const key = JSON.stringify(roster);
  if (bundledFacesCache.has(key)) return bundledFacesCache.get(key);
  const out = [];
  for (const role of ['serif', 'sans', 'mono']) {
    const family = roster[role];
    if (!family) continue;
    const f = BUNDLED_FONTS[family];
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
    const entries = f.variable
      ? Object.entries(f.files).map(([style, file]) => ({ file, style, weight: '100 900' }))
      : f.files.map(e => ({ file: e.file, style: e.style, weight: String(e.weight) }));
    for (const e of entries) {
      const buf = fs.readFileSync(path.join(dir, 'files', e.file));
      out.push({
        role, family, style: e.style, weight: e.weight,
        bytes: buf.length,
        // A variable font pinned to a named instance. Verified rather than
        // assumed: with the descriptor the same file measures 0.50 em per
        // character and without it 0.60.
        variations: f.variations || null,
        src: `url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')`,
      });
    }
  }
  bundledFacesCache.set(key, out);
  return out;
}

// ── the bundled roster and ligatures ────────────────────────────────
//
// Three things have moved since 1.0.0 that a finished deck would notice:
// the bundled sans (Inter Tight to IBM Plex Sans), the text-wrap balancing,
// and code ligatures. All three stay reachable, and each is reachable as an
// ordinary preference - `fonts.sans`, `style.wrap`, `ligatures` - rather
// than through a version key.
//
// There WAS a `layout: 1.0` umbrella here and it was removed, which is
// worth recording because the reasoning generalises. One key naming a
// version reads as a promise that the engine can rebuild any past release,
// and that promise is unbounded: every future change to a shared stylesheet
// would have to be gated on a generation, the gates would compose, and the
// set of combinations nobody tests grows with every release. It also puts
// the burden in the wrong place - an author would have to know which
// version their deck was authored against and write it down, and the
// project would have to publish and explain a layout-version history beside
// the software version.
//
// None of that buys anything the settings do not already give. An author
// who wants Inter Tight is expressing a preference about type, not pinning a
// release; the same is true of the others, the bold pair included. So the
// settings stay, the umbrella is gone, and the 1.0.0 look is a short recipe
// in the docs rather than a mechanism in the code.

// Ligature policy. Two different questions get called "ligatures" and they
// need separating, because the defaults differ and one of them already
// moved:
//
//   text  fi, fl and friends in prose. On by default and always has been -
//         that is ordinary typesetting, not an effect.
//   code  `->` drawn as an arrow in a listing. Off since the fix, and off
//         for a reason worth keeping: in the figure grammar `->` and `--`
//         are two different edges, and every listing on a slide is source
//         a reader is meant to retype. What the room saw was a character
//         that does not exist in the language.
//
// So the default here is `text`, which is what the tool does today - not
// `none`. Defaulting to `none` would take fi and fl out of every existing
// lecture's prose, which is a change to finished decks made in the name of
// not changing finished decks.
const LIGATURE_MODES = ['text', 'none', 'all'];

function ligatureMode(frontmatter = {}) {
  if (frontmatter.ligatures == null) return 'text';
  const raw = String(frontmatter.ligatures).trim();
  if (!LIGATURE_MODES.includes(raw)) {
    const err = new Error(
      `Frontmatter: "ligatures: ${raw}" is not a value this key accepts.\n` +
      `  Valid values: ${LIGATURE_MODES.join(', ')}\n` +
      `    text  fi and fl in prose, none in code (the default)\n` +
      `    none  none anywhere, prose included\n` +
      `    all   code ligatures too - "->" draws as a single arrow glyph`);
    err.userFacing = true;
    throw err;
  }
  return raw;
}

// Which bundled family fills each role. An author names one in the `fonts:`
// block exactly as they would name a family in fonts/ - the difference is
// that a bundled name needs no file, which is the whole point of bundling
// it. A name that is neither a bundled family nor a file in fonts/ still
// fails the build, as it always did.
function bundledRoster(frontmatter = {}) {
  const roster = { ...BUNDLED_DEFAULTS };
  const spec = frontmatter.fonts;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return roster;
  for (const role of ['serif', 'sans', 'mono']) {
    if (!(role in spec)) continue;
    const family = String(spec[role]).trim();
    if (!family) continue;
    const hit = Object.keys(BUNDLED_FONTS)
      .find(n => normFontName(n) === normFontName(family) && BUNDLED_FONTS[n].role === role);
    if (hit) roster[role] = hit;
  }
  return roster;
}
// True when this role's family comes from the bundle rather than from
// fonts/. collectEmbeddedFonts uses it to skip the disk search, and the
// caller uses it to decide whether the stack needs an override.
function isBundledFamily(role, family) {
  return Object.keys(BUNDLED_FONTS)
    .some(n => normFontName(n) === normFontName(family) && BUNDLED_FONTS[n].role === role);
}

// ── embedded webfonts ───────────────────────────────────────────────
//
// Everything else in an output file is self-contained; type was not. The
// CSS shipped bare family stacks – Literata, IBM Plex Sans, JetBrains Mono –
// which resolve only on a machine where those are *installed*, and quietly
// fall through to Georgia / system-ui / Menlo everywhere else. A lecture
// mailed to a colleague kept its layout and its figures and lost its face.
//
// An author opts in by dropping font files next to source.md and naming the
// families in the frontmatter:
//
//   fonts:
//     serif: Literata
//     sans: IBM Plex Sans
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
  sans: `'IBM Plex Sans', 'Inter', system-ui, -apple-system, sans-serif`,
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
    // A bundled family needs no file – that is what bundling it is for.
    // Skipped here rather than resolved here, because the bytes come from
    // node_modules through bundledFaces() and only the CSS stack has to
    // learn the name; buildOnce emits that override.
    if (isBundledFamily(role, family)) continue;
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
        `Frontmatter names "fonts.${role}: ${family}" but it is neither a bundled family\n` +
        `nor a file in ${path.join(FONT_DIR, '')}/.\n` +
        `  Bundled ${role} families (no file needed): ${bundledNamesFor(role).join(', ')}\n` +
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

// The notice has to name the faces that are actually in this file. It used
// to name the three defaults as a literal, which was already wrong for a
// lecture on `sans: Inter Tight` and is wrong far more often now that the
// serif role has four alternates - a notice that names a font the file does
// not carry, and omits one it does, is not the notice the licence asks to
// travel with the bytes.
const oflNotice = (families) =>
  `/* Bundled typefaces: ${listAnd(families)}, each under\n` +
  '   SIL Open Font License 1.1 (https://openfontlicense.org). The licence\n' +
  '   permits this embedding and requires the notice to travel with it.\n' +
  '   Full text: node_modules/@fontsource-variable/<family>/LICENSE */';
const listAnd = (xs) =>
  xs.length < 2 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

// Emits the @font-face blocks and the stack overrides for one view. Takes
// the bundled defaults and whatever the author supplied; a role the author
// named uses their family, every other role uses the bundle.
function fontStyleTag(embed) {
  if (!embed) return '';
  const { faces = [], overrides = [], bundled = [] } = embed;
  const face = (f) =>
    `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};`
    + (f.variations ? `font-variation-settings:${f.variations};` : '')
    + `font-display:block;src:${f.src};}`;
  // font-display:block, not swap: a lecture must not flash a fallback face
  // on the projector and then reflow the slide under the room's eyes.
  const faceCss = [...bundled, ...faces].map(face).join('\n');
  // The roster family goes in front of the very list the build would have
  // emitted - and out of it, where it is already there. Source Serif 4 is the
  // first roster family that also sits in its own fallback tail, and without
  // the drop the stack reads `'Source Serif 4', 'Literata', 'Source Serif 4'`,
  // which works and says something untrue about what this file carries.
  const dropSelf = (tail, family) => tail
    .split(',')
    .filter(part => normFontName(part.replace(/['"]/g, '')) !== normFontName(family))
    .join(',')
    .trim();
  const varCss = overrides.map(({ role, family }) =>
    FONT_ROLE_VARS[role]
      .map(v => `  ${v}: '${family}', ${dropSelf(FONT_STACK_TAILS[role], family)};`)
      .join('\n')
  ).join('\n');
  const rootBlock = varCss ? `\n:root {\n${varCss}\n}` : '';
  const notice = bundled.length
    ? oflNotice([...new Set(bundled.map(f => f.family))]) + '\n' : '';
  return `<style>\n${notice}${faceCss}${rootBlock}\n</style>`;
}

// ── ::: draw autoplay ───────────────────────────────────────────────
// `::: draw autoplay 1200` walks the figure's own steps on a timer once
// the slide is on screen, one delay for every step. A cover figure that
// animates while the room files in is the case it was asked for, and it
// works on any chunk because nothing about it is cover-specific.
//
// Two decisions carry it, and both are about not inventing state:
//
//   * It advances the *reveal counter*, exactly as pressing Space does.
//     A private step index would have let the drawing and the counter
//     disagree, and the next Space would jump. Because it is the counter,
//     the speaker view follows through the ordinary state broadcast, the
//     freeze gate applies, and localStorage recovery is unchanged.
//   * It runs in the audience only, which is the state root, and stops for
//     good on the first key or click. A lecturer who touches the deck has
//     taken over, and a timer that resumes underneath them is worse than
//     no timer.
//
// The bounds (200 ms to 60 s), the opener grammar that carries the number
// and the refusals live in tails.mjs (parseDrawOpener), shared with lint.js.
function withAutoplay(ms, cycle, html) {
  if (!ms) return html;
  // On the <figure>, not the <svg>: the runtime finds the chunk from it,
  // and print strips the payload scripts but leaves the figure alone.
  const attr = `data-autoplay="${ms}"` + (cycle ? ' data-autoplay-cycle=""' : '');
  return html.replace(/^(\s*)<figure /, `$1<figure ${attr} `);
}

// ── slide decoration: backdrops, overlay cards, cover variants ───────
// Three constructs share one idea: a slide is a frame, and the frame can
// carry more than a text column. All three are additive – a source.md that
// uses none of them builds byte-identically to before.
//
//   ::: backdrop <ref> {.contain .top .invert .blur}   full-bleed image
//   ::: overlay {.bottom-left .ink .wide}  …  :::      a grounded text block
//   ::: cards 3  …  :::                                a row of equal cards
//
// The class tails are closed vocabularies resolved into *slots*, exactly as
// DG_CLASS_GROUPS does for a diagram: an unknown word fails the build, and
// two words from one slot fail it too, because both are silent no-ops
// otherwise – the second word lands, the first is thrown away, and nothing
// in the source says which won.

// A backdrop is painted as a CSS background-image, so it needs a *URL* and
// not the <figure> the markdown image renderer builds. An SVG stays a data:
// URI here rather than being spliced inline: a background layer has no
// element to splice into, so it also does not follow the theme – which is
// the right answer for a photograph and a stated limit for a drawing.
// Accepts the same three forms `![](…)` does: bare asset id, relative path,
// absolute URL.
function resolveAssetUrl(ref) {
  if (!ref) return null;
  const raw = String(ref).trim();
  if (/^(?:https?:|data:|\/\/|\/)/i.test(raw)) return raw;
  const isShorthand = !/[\\/]/.test(raw) && !/\.[a-z0-9]+$/i.test(raw);
  const rel = isShorthand ? resolveFigId(raw) : raw;
  if (!rel || !currentSourceDir) return null;
  const abs = path.resolve(currentSourceDir, rel);
  if (!fs.existsSync(abs)) return null;
  if (inlineAssetsEnabled) {
    const inlined = toDataUri(abs);
    if (inlined) return inlined;
  }
  return rel.split(path.sep).join('/');
}

// How a column's divider slide is drawn. Deliberately a shorter list than
// the cover's, and deliberately quieter: a divider that can be mistaken for
// the title slide has failed at the one job it has, which is to say "a new
// part starts here, and it is part of the thing you are already in".
//
// `plain` is what the tool always drew, minus the paragraph sign - see
// SECTION_MARK below.
const SECTION_VARIANTS = ['plain', 'tinted', 'rule', 'card', 'number', 'outline'];
// `outline` is the one divider that is not a treatment of the heading but a
// different slide: it lists every part of the lecture and says which one
// starts here. That is the running agenda a long lecture keeps wanting, and
// it is the recurring element that fights monotony - the room sees the same
// list four times and learns the shape of the hour from it.
//
// It needs something no other variant does: the *other* columns. Everything
// else on a divider is a function of its own heading, so renderColumnSectionChunk
// took one column; this one takes the list of headed columns and its own index
// in it, which renderColumnsHtml already computes for `number`.
//
// Print ignores it, like every other divider variant: a divider slide is an
// audience-only construct, auto-inserted so the camera lands on the heading,
// and the document renderer emits col.heading as an ordinary <h1>. That is
// what makes the whole family cheap.
// Ordered by how loudly the slide announces itself rather than
// alphabetically, because the list is the answer to one question - how much
// should the opening slide assert itself - and an author reads it to place
// their own talk on that range. Quietest first within each half, with the
// one exception of `quote`, which was added later and sits with the type
// compositions rather than at its own volume. This comment said
// "loud-to-quiet" and contradicted both prose documents; the list has always
// opened on `classic`, which is the quietest thing here.
//
// `editorial` used to sit here and is gone. It drew a 4px accent rail down
// the left edge of the type, which is the single most reliable tell of a
// machine-made layout: a coloured bar welded to the side of a block of
// text, carrying no information, present only so that the theme colour
// appears somewhere. Nothing replaced it one-for-one. The one good idea in
// it - the meta set as a row of credits instead of four stacked lines of
// equal weight - survives in `masthead`, where it is the composition
// rather than a decoration beside one.
const COVER_VARIANTS = [
  'classic', 'masthead', 'stack', 'display', 'panel', 'quote',
  'split', 'hero', 'beside', 'above',
];
// The covers that take their picture from the chunk's own body rather than
// from cover-image. That is what lets a ::: draw be the art: a diagram is
// not a file, so cover-image can never name one, and giving them a
// directive of their own would be a second way to say "this is the cover".
//
// It also changes one rule for exactly these covers and no others: a
// title chunk's body normally *replaces* the info lines (PRD §3), which
// would mean a figure cover could not carry a date. Here the body is the
// art and info: still supplies the meta.
const COVER_BODY_ART = new Set(['beside', 'above']);
// `masthead` is the third cover that does something with the chunk's own
// body, and it is deliberately NOT on the list above. The two there place
// the body as a picture in a grid track beside the type; a masthead has an
// empty field *between* its two bands, and what belongs in a field between
// a nameplate and a folio rule is the lede - a paragraph, a short list, a
// drawing, in the flow. So it stays inside .chunk-content and needs none of
// the cover-art plumbing: one more slot in renderTitleBlock, no grid track,
// no second stylesheet. It shares one rule with them, though: info: still
// supplies the meta, because the body is no longer standing in for it.
//
// `quote` is the second, and there the body is not a lede but the whole
// slide: a talk that opens on a claim rather than on its own name. It needs
// the body the way `beside` needs its art - a quote cover with no quotation
// is a title slide with the title in the wrong place - so it is refused
// without one.
//
// **No quotation marks.** Not a hanging curly quote, not a giant glyph
// behind the words, not a rule beside them. A sentence set at three times
// the body size, alone on a slide, with a name under it, already reads as a
// quotation; the mark is decoration added because the composition was not
// trusted to say it, which is the same failure the accent rail was.
const COVER_BODY_FIELD = new Set(['masthead', 'quote']);
const COVER_BODY_REQUIRED = new Set(['quote']);
// Which covers divide the slide, and therefore have a ratio to set.
const COVER_RATIO_VARIANTS = new Set(['split', 'beside', 'above']);
// Which covers draw a `cover-image` at all. On the six that do not it was
// read, stored and never looked at again: byte-identical output with and
// without the line, which is the silent no-op this format refuses. A picture
// reaches those six through `::: backdrop` on the title chunk, which is what
// that directive is for.
const COVER_IMAGE_VARIANTS = new Set(['split', 'hero', 'beside', 'above']);
// Where the type block sits on the vertical, for the covers that leave it
// any freedom. It is a separate key from `cover:` rather than six more
// variant names because it is one question asked of six compositions, and
// the alternative is `split-bottom`, `stack-top` and so on - a list that
// multiplies every time either half of it grows.
//
// The four it is refused on are refused for a reason each, not by omission:
// `display` sets the title to fill the slide, so there is no block to move;
// `above` puts the title in a band under the art, which *is* its vertical
// placement; and `masthead` pins its two bands to the two edges, which is
// the whole composition rather than one setting of it.
const COVER_ALIGNS = ['top', 'middle', 'bottom'];
const COVER_ALIGN_VARIANTS = new Set(['classic', 'stack', 'panel', 'quote', 'split', 'beside', 'hero']);
// `closing-image:` - the picture on the last slide, and the counterpart of
// `cover-image:` rather than a second mechanism. It draws through the same
// renderCoverArt into the same slot the composition already has, so a deck
// that opens on a bled photograph closes on one, in the same frame.
//
// One key with one reserved word, because the two cases want different
// spellings and only one of them is a filename:
//
//   closing-image: cover           the picture the deck opened with
//   closing-image: end-photo       a different one, same three forms as
//                                  cover-image (asset id, path, https URL)
//
// `cover` names *which* picture, where a word like `same` only says there
// is one. It is reserved, so a deck with an asset literally called `cover`
// writes the path (`assets/cover.jpg`) - which is one of the three forms
// anyway. A misspelling falls through to the asset resolver and fails with
// "resolves to no file", which names the line.
//
// It does NOT make `::: backdrop` on a closing chunk obsolete, and the two
// are not the same picture in two spellings: a backdrop is full bleed
// *behind* the type and works on all ten compositions, this fills the
// picture slot of the four that have one. A backdrop written on the chunk
// still wins, exactly as it does on the cover.
const CLOSING_IMAGE_COVER = 'cover';

// The slot tables (BACKDROP_SLOTS, CARDS_SLOTS, OVERLAY_SLOTS, SIDE_SLOTS)
// live in tails.mjs with the parser that reads them, and the collision
// assertion - no word in two slots of one table - runs there at load.
// Where a backdrop sits on the slide, and the whole of the reveal vocabulary.
// A band against one edge, the whole slide, or nothing - which is enough for
// both directions of the move: a picture that retreats to free the paper the
// type is written on, and a picture that grows over it.
//
// It is a *window* and not a size: the picture is painted at `cover` against
// the whole slide either way, so revealing it moves the frame and never the
// image. Scaling instead would have zoomed the photograph while it opened,
// which is a different effect and not the one anyone asked for.
const BACKDROP_EDGES = ['left', 'right', 'top', 'bottom'];
function parseBackdropExtent(tok, where) {
  const t = tok.trim();
  if (t === 'full') return 'inset(0)';
  if (t === 'none') return 'inset(50%)';
  const m = t.match(/^(left|right|top|bottom)[ \t]+([\d.]+)%$/);
  if (!m) {
    const err = new Error(
      `::: backdrop in ${where}: "${t}" is not a place on the slide.\n` +
      `  Write  full, none, or one of ${BACKDROP_EDGES.join(' / ')} with a percentage,\n` +
      `  as in  reveal full, right 45%`);
    err.userFacing = true;
    throw err;
  }
  const n = Number(m[2]);
  if (!(n >= 5 && n <= 95)) {
    const err = new Error(
      `::: backdrop in ${where}: "${t}" is not a percentage between 5 and 95.\n` +
      `  Under 5 the picture is a hairline and over 95 it is the whole slide,\n` +
      `  which is what \`full\` says.`);
    err.userFacing = true;
    throw err;
  }
  const rest = (100 - n).toFixed(4).replace(/\.?0+$/, '') + '%';
  return {
    left:   `inset(0 ${rest} 0 0)`,
    right:  `inset(0 0 0 ${rest})`,
    top:    `inset(0 0 ${rest} 0)`,
    bottom: `inset(${rest} 0 0 0)`,
  }[m[1]];
}
function parseBackdropReveal(spec, where) {
  if (spec == null) return null;
  const parts = String(spec).split(',').map(s => s.trim()).filter(Boolean);
  // One extent is a static crop written the long way round, and this format
  // refuses a construct that says it takes beats and then takes none.
  if (parts.length < 2) {
    const err = new Error(
      `::: backdrop in ${where}: \`reveal\` needs at least two places, one per beat.\n` +
      `  With one there is nothing to reveal - write  reveal full, right 45%`);
    err.userFacing = true;
    throw err;
  }
  return parts.map(p => parseBackdropExtent(p, where));
}
// Resolve a `{.a .b}` tail against a slot table, or refuse the build. The
// parser reports the three failures this grammar refuses everywhere - a
// word without its dot, a word from no slot, two words from one - and this
// turns the first into the userFacing error, with the whole vocabulary
// under it. Returns the resolved values plus `written`, which says whether
// the author wrote the word or the table supplied it: a written default is
// legal and changes nothing, and two constructs (`::: rows`, a scrim with no
// photo) need the difference.
// A ::: draw opener with a problem stops the build on the first one; the
// message spells the line to write.
function refuseDrawOpener(opener) {
  if (!opener.problems.length) return;
  const err = new Error(opener.problems[0].msg);
  err.userFacing = true;
  throw err;
}
function readTail(attrs, slots, what, where) {
  const t = parseTail(attrs, slots, `::: ${what}`, { id: 'none' });
  if (t.problems.length) {
    const err = new Error(
      `${t.problems[0].msg.replace(/^::: \w+:/, m => `${m.slice(0, -1)} in ${where}:`)}\n` +
      slotTable(slots));
    err.userFacing = true;
    throw err;
  }
  const out = { written: {} };
  for (const [slot, { value, written }] of Object.entries(t.slots)) {
    out[slot] = value;
    out.written[slot] = written;
  }
  return out;
}
// marked wraps a lone image in a <p> and passes a raw <figure> through as a
// block, so the same divider written two ways produced two different trees -
// and the side-by-side rule, which keys on the figure being a child of the
// body, matched one and not the other. Unwrapping here fixes the class of
// problem rather than adding a second selector for every rule that follows.
function unwrapLoneFigure(html) {
  const m = String(html).match(/^\s*<p>\s*(<figure[\s\S]*<\/figure>)\s*<\/p>\s*$/);
  // The capture is greedy and anchored only at the ends, so two pictures on
  // separate lines matched *across* the `</p>\n<p>` between them and the
  // function named "lone figure" fired on two - emitting an orphan closer and
  // an unclosed opener. A paragraph boundary inside the capture means there
  // was more than one, and then there is nothing to unwrap.
  return m && !/<\/p>/.test(m[1]) ? m[1] : String(html);
}

// The backdrop element. Returned with its scrim mode, because the mode is
// two facts at once: how the image is veiled, and – for `invert` – that the
// slide's ink has to turn light. The second lands as data-backdrop on the
// article, where the custom-property overrides can reach every descendant.
function renderBackdrop(bd, where) {
  if (!bd) return { html: '', scrim: null };
  const url = resolveAssetUrl(bd.ref);
  if (!url) {
    const err = new Error(
      `::: backdrop ${bd.ref} in ${where} resolves to no file.\n` +
      `  A backdrop takes the same three forms an image does: a bare asset id\n` +
      `  (assets/${bd.ref}.{${IMG_EXTS.join(',')}}), a relative path, or an https URL.`);
    err.userFacing = true;
    throw err;
  }
  const o = readTail(bd.attrs, BACKDROP_SLOTS, 'backdrop', where);
  const cls = ['chunk-backdrop', `bd-${o.fill}`, `bd-${o.crop}`, `bd-${o.scrim}`, `bd-${o.focus}`,
               `bd-${o.layer}`];
  // The reveal is live-only, and that is not an omission. On paper a
  // backdrop is already a banner band at the head of the chunk rather than
  // a full-bleed ground (print is a document, not a slide), so a window on
  // to a slide-sized picture has nothing to be a window on to. The frames
  // ride as a data attribute; the *inline* clip is frame 0, so the first
  // paint is the opening beat rather than a flash of the last one before
  // the runtime boots.
  const frames = parseBackdropReveal(bd.reveal, where);
  const fr = frames
    ? ` data-bd-frames="${escapeHtml(JSON.stringify(frames))}" style="background-image:url(&quot;${escapeHtml(url)}&quot;);clip-path:${frames[0]}"`
    : ` style="background-image:url(&quot;${escapeHtml(url)}&quot;)"`;
  return {
    html: `<div class="${cls.join(' ')}"${fr} aria-hidden="true"></div>`,
    scrim: o.scrim,
  };
}

// A card row is rendered here rather than pushed as an open <div> for the
// text between to fall into, and the reason is the size: choosing it means
// counting the words in the longest item, which is a fact about the source
// and cannot be recovered from CSS or from the rendered HTML without
// parsing it back. So the block's lines are captured and this renders them.
//
// The count is taken from the *source* lines rather than the rendered
// markup: a list item is one `- ` line, which is a rule the author can see,
// and it needs no HTML walking. Nested items are excluded, because they are
// the detail rather than the headline and folding them away is the default.
const CARDS_LARGE_MAX = 3;    // words in the longest item
const CARDS_MEDIUM_MAX = 12;

// Two ways to open a card, and the author already writes the difference:
//
//   - **panel** a tinted fill…     a lead-in. The bold runs into the sentence
//   - **Measure**\                 a heading. The bold on its own line, with
//     what the page does           the text under it and air between
//
// Which of the two a card got used to be decided in the stylesheet, and it
// could not be: every leading bold was forced to display: block, so the two
// forms drew identically and the distinction the tutorial documents did not
// exist. Keying it on `:has(+ br)` only moved the guess one step - a <br> is
// what the author typed, not what the author meant, so a bold followed by a
// bare text node lost its air while the same bold followed by a break kept
// it. The renderer can see the hard break in the source, so it writes the
// answer into the markup and the stylesheet reads a class.
//
// The slot stays open across an opening picture, which is the card that
// bleeds an image: there the lead-in is the line *under* the picture, and
// the two position-dependent selector pairs this replaces existed only to
// reach it. A class on the run reaches it wherever it sits.
const CARD_LEAD_RE = /^(\*\*(?:[^*]|\*(?!\*))+\*\*|__(?:[^_]|_(?!_))+__)(\s*\\[ \t]*|[ \t]{2,})$/;
const CARD_IMG_ONLY_RE = /^!\[[^\]]*\]\([^)]*\)$/;
function markCardLeads(lines) {
  let open = false;   // still at the item's opening slot
  return lines.map(raw => {
    let head, rest;
    const item = /^([-*+][ \t]+)(.*)$/.exec(raw);
    if (item) { open = true; [, head, rest] = item; }
    else if (open) {
      const cont = /^([ \t]+)(.*)$/.exec(raw);
      // A nested item, a blank line or an unindented line is the card's
      // body proper, and the opening slot is over.
      if (!cont || !cont[2].trim() || /^[-*+][ \t]/.test(cont[2])) { open = false; return raw; }
      [, head, rest] = cont;
    } else return raw;
    const lead = CARD_LEAD_RE.exec(rest);
    if (lead) {
      open = false;
      return head + `<strong class="card-lead">${lead[1].slice(2, -2)}</strong>` + lead[2];
    }
    if (rest.trim() && !CARD_IMG_ONLY_RE.test(rest.trim())) open = false;
    return raw;
  });
}

function renderCardsBlock(b) {
  const o = readTail(b.attrs, CARDS_SLOTS, b.rows ? 'rows' : 'cards', b.where);
  // An item is its `- ` line *plus its continuation lines* - the indented
  // lines under it that are not themselves list items. Counting the marker
  // line alone read `- **Measure**\` as one word and sized a row of full
  // sentences as a row of single words, because a hard line break puts the
  // rest of the item on the next line.
  const top = [];
  for (const raw of b.lines) {
    if (/^[-*+]\s+/.test(raw)) { top.push(raw); continue; }
    if (!top.length) continue;
    if (/^\s+[-*+]\s+/.test(raw)) continue;   // a nested item is the detail
    if (!raw.trim()) continue;
    top[top.length - 1] += ' ' + raw;
  }
  const wordsOf = (l) => l.replace(/^[-*+]\s+/, '').replace(/[*_`~\\]/g, '')
    .trim().split(/\s+/).filter(Boolean).length;
  // No list at all means one card per block, and a block is prose by
  // definition - the small end is the right guess, and an explicit size
  // is always available.
  // A row block is sized by its *terms*, not by its bodies: the term is
  // what sits in the card and the body is ordinary prose beside it, so
  // measuring the body made every row come out small and the terms with it.
  const measured = b.rows
    ? top.map(l => {
        const m = l.match(/^[-*+]\s+\*\*([^*]+)\*\*/);
        return m ? m[1].trim().split(/\s+/).filter(Boolean).length : wordsOf(l);
      })
    : top.map(wordsOf);
  const longest = measured.length ? Math.max(...measured) : CARDS_MEDIUM_MAX + 1;
  let size = o.size !== 'auto'
    ? o.size
    : (longest <= CARDS_LARGE_MAX ? 'large' : longest <= CARDS_MEDIUM_MAX ? 'medium' : 'small');
  // With no box, the type is the only thing carrying the structure, and at
  // the size a boxed card wants it reads as three headings side by side
  // rather than as three columns of prose. One step down, and only where
  // the author left the size to the tool - a written size is theirs.
  if (o.ground === 'clear' && o.size === 'auto') {
    size = size === 'large' ? 'medium' : 'small';
  }
  // A row's term is a label in a column, not a headline across the slide,
  // and at the large scale it simply did not fit: measured, `Separatism`
  // overflowed a 229px term track and ran across the body beside it. The
  // cap is on the automatic size only - a written size is the author's.
  if (b.rows && o.size === 'auto' && size === 'large') size = 'medium';
  // A row that carries a second level ranges left even when its heads are
  // two words: unfolded, a centred head over a left-aligned detail list
  // reads as a mistake, and the head cannot change alignment with the
  // collapse mode without the row jumping when C is pressed.
  const nested = b.lines.some(l => /^\s+[-*+]\s+/.test(l));
  const align = o.align !== 'auto'
    ? o.align
    : (size === 'large' && !nested ? 'center' : 'left');
  // A row's body has to be an element, or it cannot be put in column 2:
  // CSS can place a grid item, and an anonymous text run is not one. The
  // wrapping is done on the *source* rather than on the rendered HTML -
  // marked passes inline HTML through untouched, so one span in the line
  // is safe where a regex over nested <li> markup would not be.
  let body = b.lines;
  if (b.rows) {
    const out = [];
    for (const raw of b.lines) {
      const m = raw.match(/^([-*+]\s+)(\*\*[^*]+\*\*)[ \t]*\\?[ \t]*(.*)$/);
      if (m) { out.push({ head: m[1] + m[2], rest: m[3] ? [m[3]] : [] }); continue; }
      const last = out[out.length - 1];
      // An indented list item under a row is the detail level, and it
      // belongs to the fold rather than to the body beside the term.
      if (!last || /^\s+[-*+]\s+/.test(raw) || !raw.trim()) { out.push(raw); continue; }
      if (typeof last === 'string') { out.push(raw); continue; }
      last.rest.push(raw.trim());
    }
    body = out.map(e => typeof e === 'string' ? e
      : e.head + (e.rest.length ? `<span class="row-body">${e.rest.join(' ')}</span>` : ''));
  } else {
    // A row's term is already its own element in its own column, so the
    // lead-in question is a card question only.
    body = markCardLeads(b.lines);
  }
  // A row's default anchor is `middle`, and a card's is `top`. The default
  // differs by construct because the constructs differ: a card is a block
  // of text in a box and reads from its first line, while a row is a term
  // *beside* a body, and a one-line term against a three-line body's first
  // line reads as a mistake. `written` is what tells a written `top` from
  // the defaulted one - and this has to run *before* the class list is
  // built, which it did not at first.
  if (b.rows && !o.written.anchor) o.anchor = 'middle';
  const cls = [b.rows ? 'cards rows' : 'cards', `cards-${b.n}`, `cs-${size}`, `ca-${align}`,
    `cv-${o.anchor}`, `cd-${o.detail}`, `cg-${o.ground}`, `ck-${o.corner}`,
    `cx-${o.scrim}`];
  // A scrim with no picture to veil is a word the drawing ignores, which
  // this format refuses rather than drops. Checked against the *written*
  // tail, so `{.veil}` alone is caught even though veil is the default.
  if (o.ground !== 'photo' && o.written.scrim) {
    const err = new Error(
      `::: ${b.rows ? 'rows' : 'cards'} in ${b.where}: a scrim needs a picture to veil.\n` +
      `  ${o.scrim} applies to the photo ground; this row is ${o.ground}.`);
    err.userFacing = true;
    throw err;
  }
  return `<div class="${cls.join(' ')}">\n${marked.parse(body.join('\n'))}\n</div>`;
}

// Overlay cards live in one absolutely-positioned 3x3 grid covering the
// slide inside its padding, rather than each being positioned on its own.
// That is what makes two cards in one corner stack instead of overlap, and
// it is one element to keep out of the text flow instead of N.
function renderOverlayLayer(overlays, where) {
  if (!overlays || !overlays.length) return '';
  const cards = overlays.map((ov) => {
    const o = readTail(ov.attrs, OVERLAY_SLOTS, 'overlay', where);
    const body = marked.parse(ov.lines.join('\n'));
    // `from n` is the counterpart to a backdrop's reveal, and it is what
    // makes the picture half useful on a slide with no body to split: a
    // chunk's own segments already arrive on a beat, an overlay had no way
    // to. One integer rather than a list, because an overlay is one block
    // that is either on the slide or not - the backdrop's list says *where*
    // the picture is at each beat, which is a different question and is why
    // the two do not share a word.
    const from = ov.from == null ? '' : ` data-from="${Number(ov.from)}"`;
    return `<div class="overlay-card ov-${o.place} ov-${o.ground} ov-w-${o.width}"${from}>${body}</div>`;
  }).join('\n');
  return `<div class="overlay-layer">\n${cards}\n</div>`;
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
    // A code span is one token to the reader, and the default line-breaking
    // rules break it after any hyphen in it: `---`, the segment separator,
    // came out as "-" ending one line and "--" opening the next, which reads
    // as two different separators. white-space: nowrap is the only thing that
    // stops it (word-break, line-break and overflow-wrap were all measured in
    // a built page and all still broke), and it cannot go on every span: the
    // widest one in the tutorial is a 46-character linter directive already
    // filling 97% of its line, and unbreakable it would leave the column. A
    // span with no space in it is short by construction, so that is the test.
    codespan(text) {
      return `<code${/\s/.test(text) ? '' : ' class="nb"'}>${text}</code>`;
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
      const a = `<a href="${escapeHtml(href || '')}"${titleAttr}${target}>${text}</a>`;
      if (!isExternal) return a;
      // …and it gets a mark that opens the address with its QR code. Up to
      // 1.0.0 that was reachable only by Shift-clicking the link, and a
      // modifier nobody is told about is a feature that does not exist for
      // most readers. The mark says it is there; Shift-click is unchanged.
      //
      // A <button> and not a second <a>: it navigates nowhere, and a screen
      // reader should hear an action rather than a link to the same place.
      // It carries the address, so the runtime needs no lookup, and it is
      // hidden in print, where the address is already set beside the text.
      return a + `<button type="button" class="link-code"`
        + ` data-link-code="${escapeHtml(href)}"`
        + ` aria-label="Show this address large, with a code to scan">`
        + `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">`
        + `<path d="M1 1h5.4v5.4H1V1zm1.3 1.3v2.8h2.8V2.3H2.3zM9.6 1H15v5.4H9.6V1z`
        + `m1.3 1.3v2.8h2.8V2.3h-2.8zM1 9.6h5.4V15H1V9.6zm1.3 1.3v2.8h2.8v-2.8H2.3z"/>`
        + `<path d="M8 1h1.2v3.1H8V1zm0 4.3h1.2v2.4h2.3v1.2H8V5.3zm5.5 2.4H15v1.2h-1.5V7.7z`
        + `M8 10.1h1.2v1.4H8v-1.4zm2.4 0H15v1.2h-1.9v1.4H15V15h-1.2v-2.1h-2.2v-1.4h-1.2v-1.4z`
        + `M8 12.6h1.2V15H8v-2.4z"/>`
        + `</svg></button>`;
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

// ── diagrams (::: draw) ──────────────────────────────────────────
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
  // A clip is not a still. resolveFigId searches VIDEO_EXTS after the image
  // extensions – right for the ![](clip-id) shorthand, wrong here: an SVG
  // <image> element cannot play video, so the figure built without a word
  // of complaint and rendered an empty box (with the whole clip inlined as
  // a dead data: URI when it fit the cap). The compiler turns this flag
  // into an error that names the working construct.
  const isVideo = (p) => VIDEO_EXTS.includes(path.extname(p).slice(1).toLowerCase());
  if (/^(https?:)?\/\//i.test(ref)) {
    return isVideo(ref) ? { video: true, href: ref } : { abs: null, href: ref, remote: true };
  }
  const direct = ref.includes('/') || path.extname(ref)
    ? path.join(currentSourceDir, ref) : null;
  let rel = null;
  if (direct && fs.existsSync(direct)) rel = ref;
  else rel = resolveFigId(ref);
  if (!rel) return null;
  if (isVideo(rel)) return { video: true, href: rel };
  return { abs: path.join(currentSourceDir, rel), href: rel, remote: false };
}

// One place decides how see-through an element is; the emitter and the
// runtime both go through it.

// The `assetMarkup` leaf injected into diagram-core: the <svg> or <image>
// element for an asset that has been resolved on disk. Everything in here
// reads a file, which is exactly why it is on this side of the seam.
// A vector asset that appears more than once is embedded once as a <symbol>
// and referenced with <use>. Without this, every `image` statement splices a
// full copy of the file: two avatars in one figure is untidy, a grid of 96
// faces is a quarter of a megabyte across the four views.
//
// The first instance of a sharable file carries the definition and points at
// it; every later one is a pointer. So a file used once costs the <symbol>
// wrapper and nothing else, and no counting pass is needed to decide.
//
// Keyed by absolute path and reset per build, because ids have to be unique
// within one page and a symbol is only useful within the document it sits in.
const dgSymbols = new Map();   // abs path -> { id, emitted }
let dgSymbolCounter = 0;

// Not every file can be shared. A <use> instance is a shadow clone, and an
// asset that carries its own <style> block or internal id references cannot
// be relied on to keep them across that boundary - which is the failure the
// comment below describes, an illustration arriving with no lines, and it is
// invisible until someone looks at the slide. So sharing is offered only to
// files that have neither, and everything else keeps the copy it had.
function dgSharableSvg(spliced) {
  return !/<style[\s>]/i.test(spliced) && !/url\(#|href="#|xlink:href="#/i.test(spliced);
}

function dgAssetMarkup(node, id, geo, opts = {}) {
  const asset = node.asset;

  if (asset.abs && path.extname(asset.abs).toLowerCase() === '.svg') {
    // Already shared with an earlier instance: nothing to splice, just point
    // at it. The accessible name stays on the instance, because that is where
    // the picture actually is.
    const shared = opts.standalone ? null : dgSymbols.get(asset.abs);
    if (shared && shared.emitted) {
      const alt = node.alt ? ` role="img" aria-label="${escapeHtml(node.alt)}"` : '';
      return `<use id="${id}" href="#${shared.id}"${geo}${alt}/>`;
    }
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
      // The first instance of a sharable file carries the definition and uses
      // it, so a file referenced once costs exactly what it did before and a
      // file referenced ninety-six times costs one copy plus ninety-six
      // pointers. `preserveAspectRatio` sits on the symbol, where it belongs:
      // it is a property of the drawing, not of where the drawing is put.
      if (!opts.standalone && dgSharableSvg(spliced)) {
        const sym = { id: `psi-sym-${++dgSymbolCounter}`, emitted: true };
        dgSymbols.set(asset.abs, sym);
        const alt = node.alt ? ` role="img" aria-label="${escapeHtml(node.alt)}"` : '';
        // The root's own id, role and label have to come off. This element is
        // no longer the picture on the slide - it is the definition every
        // instance points at - and leaving the id on would give the document
        // two elements answering to the first instance's name.
        const symAttrs = attrs.replace(/\s(?:id|role|aria-label)\s*=\s*"[^"]*"/gi, '');
        // `body` still carries the file's own closing </svg> – the branch
        // below relies on that, because it opens an <svg> and never closes
        // one. A <symbol> has to close itself, so the tag comes off here.
        // Left in, it closed the diagram's own <svg> instead: the HTML parser
        // took every element after it out of the drawing and dropped it in
        // the <figure>, and the figure rendered as an empty box.
        const symBody = body.replace(/<\/svg>\s*$/i, '');
        return `<defs><symbol id="${sym.id}"${symAttrs}${vbAttr} preserveAspectRatio="xMidYMid meet">${symBody}</symbol></defs>`
          + `<use id="${id}" href="#${sym.id}"${geo}${alt}/>`;
      }
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
  // Sharing is scoped to one figure. Anything wider and a figure stops being
  // self-contained, which every consumer here assumes: the focus card clones
  // it, the speaker's preview strip clones it, the editor replaces it.
  resetAssets: () => { dgSymbols.clear(); },
});
const { parseDiagramSource, layoutDiagram, dgFrameDrawables, renderDiagram } = dgCore;

// Every `::: draw` block the last build emitted: its byte range in
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
  /* the serif FAMILY, not the reading voice: --body-font is what the F
     toggle rewrites, so naming it here made .serif and .hand follow the
     reader's font choice and collapse onto the sans the diagram already
     defaults to. Print was never affected - it defines no --body-font and
     fell through to --serif. Parallel to --dg-sans / --dg-mono above. */
  --dg-serif: var(--serif-stack, var(--serif));
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
/* Direct children of an element group, never descendants. A rect or a
   circle deeper than that belongs to an embedded asset, and this rule would
   paint it the canvas colour over the file's own answer - CSS beats a
   presentation attribute, so a style-free line drawing came out white on
   white. The tone rules below always used the child combinator; this one and
   the text rule did not, which is why the two of them were the leak. */
.psi-diagram .dg-el > rect, .psi-diagram .dg-el > circle, .psi-diagram .dg-el > .dg-shape {
  fill: var(--paper); stroke: var(--ink); stroke-width: 1.4; rx: 4px;
}
/* A box whose outline is not a rectangle is a <path>, so every rule below
   that paints a box has to name it too. They do it through :is(), which is
   also why those selectors read shorter than they used to: the alternative
   was a third copy of each one. The join is rounded so a chevron's nose is a
   point rather than a miter spike. */
.psi-diagram .dg-shape { stroke-linejoin: round; }
.psi-diagram .dg-stroke { stroke: var(--ink); stroke-width: 1.4; fill: none; stroke-linejoin: round; }
.psi-diagram .dg-head { fill: var(--ink); stroke: none; }
/* Same reason: a diagram's own labels live inside a .dg-lbl wrapper, and
   type inside an embedded drawing is the drawing's business. */
.psi-diagram .dg-lbl text { fill: var(--ink); font-family: var(--dg-sans); font-weight: 400; }
/* .dg-mono sits on the <text> itself, so this rule is (0,2,0) while the
   .dg-lbl text rule above it is (0,2,1) - the label rule won and .mono
   resolved, emitted its class and changed nothing. Measured before the fix:
   eight i's and eight W's in a .mono label came out 22.8px and 109.1px wide,
   which is the sans. The family classes are now all written the same way,
   matching on the wrapper and reaching the text, so they tie with the label
   rule and win on source order like .serif and .hand always did. */
.psi-diagram .mono text, .psi-diagram .dg-mono {
  font-family: var(--dg-mono);
  /* A .mono label is a token – a header field, a flag, an arrow – so it
     is spelled out for the same reason a listing is. Only the mono
     channel: the sans and serif labels keep their fi and fl. */
  font-variant-ligatures: none;
}
/* inline *accent* / ~muted~ inside a label */
.psi-diagram tspan.dg-em { fill: var(--emph); }
.psi-diagram tspan.dg-mu { fill: var(--ink-soft); }
.psi-diagram .dg-off { display: none; }

/* containers are a frame around their members, never a filled panel */
/* --rule is the hairline between two cells of a table; a container is a
   trust boundary, a segment, a machine - it has to read as a statement.
   Dashed at that weight it was barely visible on a shaded ground, which
   is exactly where these are usually drawn. */
.psi-diagram .dg-container > :is(rect, circle, .dg-shape) { fill: none; stroke: color-mix(in oklab, var(--ink) 42%, var(--paper)); stroke-width: 1.3; }
.psi-diagram .dg-caption text { fill: var(--ink-soft); }

/* braces have no fill and no head */
.psi-diagram .dg-brace .dg-stroke { stroke: var(--rule); }

/* ── tones ── four theme-safe fills, mixed from the page's own inks ── */
.psi-diagram .tone-1 > :is(rect, circle, .dg-shape) {
  fill: color-mix(in oklab, var(--emph) 13%, var(--paper));
  stroke: color-mix(in oklab, var(--emph) 60%, var(--ink));
}
.psi-diagram .tone-2 > :is(rect, circle, .dg-shape) {
  fill: color-mix(in oklab, var(--ink) 8%, var(--paper)); stroke: var(--ink);
}
.psi-diagram .tone-3 > :is(rect, circle, .dg-shape) {
  fill: color-mix(in oklab, var(--ink) 20%, var(--paper)); stroke: var(--ink);
}
.psi-diagram .tone-4 > :is(rect, circle, .dg-shape) {
  fill: var(--emph); stroke: var(--emph);
}
/* .clear is a see-through interior. .bare removes the *stroke*, so without
   this there was no way to draw a frame you can read through – which is
   what an outline over an image or another element wants. */
.psi-diagram .clear > :is(rect, circle, .dg-shape) { fill: none; }
/* The canvas colour, named. A box already defaults to it, but a box under a
   tinted default block had no way back, and a free text could not have one at
   all. A label with a ground is how it knocks out a line running behind it. */
.psi-diagram .paper > :is(rect, circle, .dg-shape) { fill: var(--paper); }

.psi-diagram .accent > :is(rect, circle, .dg-shape) { stroke: var(--emph); }
.psi-diagram .accent .dg-stroke { stroke: var(--emph); }
.psi-diagram .accent .dg-head { fill: var(--emph); }
.psi-diagram .accent text { fill: var(--emph); }
/* .muted and .dim answer different questions and were hard to tell apart,
   because a lighter grey alone reads as "slightly faint" rather than as a
   different kind of thing. .muted is scaffolding - an axis, a leader, a zone
   outline - and scaffolding is drawn thinner as well as lighter. .dim is the
   other axis entirely: full colour at a third of the strength, which is what
   the dim step operation reaches for when a beat moves on. */
.psi-diagram .muted > :is(rect, circle, .dg-shape) { stroke: var(--ink-soft); stroke-width: 1.05; }
.psi-diagram .muted .dg-stroke { stroke: var(--ink-soft); stroke-width: 1.05; }
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
.psi-diagram .dg-text:not(.tone-1):not(.tone-2):not(.tone-3):not(.tone-4):not(.paper) > :is(rect, circle, .dg-shape) { fill: none; }

/* An edge's label gets the same ground on the same terms: a fill class draws
   it, no fill class draws nothing. No stroke - a bordered label on a line is
   a box, and there is a statement for that - and no dash, which the .dashed
   rule above would otherwise put around the ground of a dashed edge's label.
   Written after the tone rules on purpose: they set a stroke at the same
   specificity, so source order is what decides. */
/* And no fill unless a tone asked for one. An SVG rect with no fill property
   is black, and this one is emitted in every frame of any edge that is ever
   given a tone - so without this rule an edge whose label gains a ground in
   beat 3 draws a black slab across its own line in beats 1 and 2. Exactly the
   rule the free text's ground already needs, for exactly the same reason. */
.psi-diagram .dg-edge:not(.tone-1):not(.tone-2):not(.tone-3):not(.tone-4):not(.paper) > rect { fill: none; }

.psi-diagram .dashed > :is(rect, circle, .dg-shape), .psi-diagram .dashed .dg-stroke { stroke-dasharray: 6 4; }
.psi-diagram .dotted > :is(rect, circle, .dg-shape), .psi-diagram .dotted .dg-stroke { stroke-dasharray: 1.5 3.5; stroke-linecap: round; }
.psi-diagram .thick > :is(rect, circle, .dg-shape), .psi-diagram .thick .dg-stroke { stroke-width: 2.6; }
.psi-diagram .bare > :is(rect, circle, .dg-shape) { stroke: none; }
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
.psi-diagram .emph > :is(rect, circle, .dg-shape) { stroke: var(--emph); stroke-width: 2.6; }
.psi-diagram .emph .dg-stroke { stroke: var(--emph); stroke-width: 2.6; }
.psi-diagram .emph .dg-head { fill: var(--emph); }
/* A chart's column: what it is filled with, and what emph does to it. A
   column draws no outline, so paper would make it vanish and there is nothing
   but its fill to emphasise; the rules come from DG_BAR_FILLS in
   diagram-core, which is also what the linter reads when it says a column is
   too pale for a theme - one table, so the warning is about the colour that
   is drawn. The block sits after the box tones on purpose: a column's tone
   rule is one class more specific and has to win. */
${dgBarFillCss()}
/* Words are the third thing emphasis can act on, and leaving them out left the
   emph verb on a text accepted and completely inert - the ground rule at the
   foot of this stylesheet refuses to stroke a label's rect, deliberately and
   for good reason, so on a text the two rules above have nothing to reach.
   That is not a corner case: the per-message tag a sequence generates is
   documented as the way to address one message, and it holds the arrow *and*
   its number *and* its second line, so the commonest emphasis in a protocol
   figure is a mixed set by construction. The .accent text rule two blocks up
   is the same act on the same channel and was already written this way.
   .tone-4 inverts its own label, and has to keep winning here exactly as it
   does over .accent text; one class more in the selector settles it rather
   than source order, which is the guard the stroke case below already uses.
   (No backticks in here: this whole stylesheet is a template literal.) */
.psi-diagram .emph text { fill: var(--emph); font-weight: 600; }
.psi-diagram .tone-4.emph text, .psi-diagram .tone-4.emph tspan { fill: var(--paper); }
/* .tone-4 fills with the accent, so an emphasis stroke in the accent lands
   invisibly on it: emph on such a box resolved, set its width and changed
   nothing on screen - the silent no-op again, arriving through the stylesheet
   rather than through the grammar. Inverted the way .tone-4's own label
   already is, and for the same reason. Higher specificity than the rule above,
   so source order does not decide it. (No backticks in here: this whole
   stylesheet is a template literal, and one would end it.) */
.psi-diagram .tone-4.emph > :is(rect, circle, .dg-shape) { stroke: var(--ink); }

/* A label's ground is never stroked, and this is where that has to be said.
   It was written up with the two rules that create the ground, above the
   tone rules that stroke - and .emph and .accent both set a stroke on the
   same child selector at the very same specificity, so source order decided
   it and they won. The result was a box drawn around a label the moment a step
   emphasised it: on a sequence, where every message label now carries a
   ground, emph @wa-msg-8 framed the words instead of thickening the arrow.
   A bordered label is a box, and there is a statement for that. */
.psi-diagram .dg-text > :is(rect, circle, .dg-shape) { stroke: none; }
.psi-diagram .dg-edge > :is(rect, circle, .dg-shape) { stroke: none; }

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

// The one text that draws the non-rectangular outlines, lifted straight out
// of diagram-core.mjs rather than transcribed. The build emits the opening
// beat with this function and the runtime redraws every later beat with it,
// so the two cannot drift; a hand copy here would be a second vocabulary
// nobody would think to keep in step.
// Keyed by the outline alone; a drawable kind may carry a direction after a
// colon (\`chevron:up\`), which dgShapeD reads and this lookup must not.
// Interpolated from DG_SHAPE_CLASSES rather than spelled out – a fifth
// outline added to the table would otherwise draw at build time and be
// unknown to the very runtime that has to move it.
const DG_SHAPES = ${JSON.stringify(Object.fromEntries([...DG_SHAPE_CLASSES].map(c => [c, 1])))};
${dgShapeD.toString()}
${dgPathD.toString()}
${dgSplineD.toString()}

function dgApplyVec(el, kind, v) {
  if (kind === 'rect') {
    el.setAttribute('x', v[0]); el.setAttribute('y', v[1]);
    el.setAttribute('width', Math.max(0, v[2])); el.setAttribute('height', Math.max(0, v[3]));
  } else if (DG_SHAPES[String(kind).split(':')[0]]) {
    // Same four numbers a rect carries, joined into a different outline. That
    // is the whole reason a hexagon costs nothing here: it tweens as a rect
    // does, and only the last step – turning the vector into a path – differs.
    el.setAttribute('d', dgShapeD(kind, v[0], v[1], Math.max(0, v[2]), Math.max(0, v[3])));
  } else if (kind === 'circle') {
    el.setAttribute('cx', v[0]); el.setAttribute('cy', v[1]); el.setAttribute('r', Math.max(0, v[2]));
  } else if (kind === 'spline') {
    el.setAttribute('d', dgSplineD(v));
  } else if (kind === 'path') {
    let d = '';
    for (let i = 0; i < v.length; i += 2) d += (i ? 'L' : 'M') + v[i] + ' ' + v[i + 1];
    el.setAttribute('d', d + (el.classList.contains('dg-head') ? 'Z' : ''));
  } else {
    // A label. The optional third number is the turn, so a rotated one is
    // carried, interpolated and applied by the very same machinery that moves
    // an upright one - no class lookup at step time, no second code path.
    el.setAttribute('transform', 'translate(' + v[0] + ',' + v[1] + ')'
      + (v[2] ? ' rotate(' + v[2] + ')' : ''));
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

// Swap one diagram for a freshly compiled copy of itself – the DOM half of
// an applied edit. Shared: the editor calls it after compiling in this
// window, and the diagram-edit receiver in a view that ships no editor
// (editor: speaker) calls it with the markup the cockpit sent along. One
// text, or the two swap paths would drift.
function dgSwapFigure(oldSvg, html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  // Belt and braces for the remote path: the compiler never emits an event
  // handler, an executable script or a javascript: URL, so anything of the
  // kind in incoming markup is not a figure – scrub it rather than let it
  // run. innerHTML does not execute script elements, but an on* attribute
  // on a parsed element fires the moment it is in the document.
  holder.querySelectorAll('script:not([type="application/json"])').forEach((s) => s.remove());
  holder.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      const v = String(a.value || '').trim().toLowerCase();
      if (n.indexOf('on') === 0 || v.indexOf('javascript:') === 0) el.removeAttribute(a.name);
    }
  });
  const next = holder.querySelector('svg.psi-diagram');
  const payload = holder.querySelector('script.psi-diagram-frames');
  if (!next) return null;
  const live = oldSvg.psiDiagram;
  if (next.dataset.liveViewbox) {
    next.setAttribute('viewBox', next.dataset.liveViewbox);
    const w = Number(next.getAttribute('width'));
    const r = Number(next.dataset.liveRatio);
    if (w && r) next.setAttribute('height', String(Math.round(w * r)));
  }
  const figure = oldSvg.closest('.figure-diagram');
  oldSvg.replaceWith(next);
  // The frames payload is what the step runtime reads. Replace it alongside
  // the drawing, or a figure that just gained steps has none the runtime can
  // see, while one that lost them keeps applying geometry from a picture
  // that no longer exists.
  const oldPayload = figure ? figure.querySelector('script.psi-diagram-frames') : null;
  if (payload) {
    payload.dataset.for = next.id;
    if (oldPayload) oldPayload.replaceWith(payload);
    else if (figure) figure.appendChild(payload);
  } else if (oldPayload) {
    oldPayload.remove();
  }
  let d = null;
  if (payload) {
    try {
      const data = JSON.parse(payload.textContent);
      d = live || { svg: next, step: 0, raf: 0, cur: null, cache: {},
        hint: figure ? figure.querySelector('.dg-hint') : null };
      d.data = data;
      d.svg = next;
      d.cache = {};
      d.cur = null;
      next.psiDiagram = d;
      if (!live) DG_LIST.push(d);
      dgStep(d, Math.min(d.step, data.n - 1), true);
    } catch (e) { d = null; }
  } else if (live) {
    // No steps any more: nothing left to tween, and the static attributes
    // the emitter wrote are already the finished picture.
    next.psiDiagram = null;
  }
  // The focus card holds a clone, ids and all, and it is what the room is
  // actually looking at while a figure is zoomed – the very state an edit
  // is usually made in. dgMirrorIntoFocus can only repaint ids that
  // survived the edit, so a structural change replaces the clone whole.
  const card = document.querySelector('#figure-overlay .figure-focus-target');
  if (card) {
    const shown = card.querySelector('svg.psi-diagram');
    if (shown && shown.id === next.id) {
      const clone = next.cloneNode(true);
      shown.replaceWith(clone);
      if (d) dgRenderInto(clone, d, d.step);
    }
  }
  return next;
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
    // A diagram inside an expansion consumes no beats – chunkBeats skips
    // expansion bodies, or Space would advance a counter while the room
    // sees nothing move – so nothing ever steps it. Rewinding it to its
    // opening beat therefore left it half-drawn for good, while print, with
    // no JavaScript at all, showed the finished picture. Where no beat can
    // reach, the finished picture is the one to show. Same selector as
    // chunkBeats, so the two answers cannot disagree.
    const beatless = svg.closest('.exp-body, .chunk-expansion');
    dgStep(d, beatless ? d.data.n - 1 : 0, true);
  });
}
`;

// ── parsing ──────────────────────────────────────────────────────────

// A heading line's tail, read through the shared parser and refused on the
// first problem. Every class token is recorded, recognised or not, and the
// callers decide what is legal where - a column heading takes an id and
// nothing else, a title chunk refuses a width - because that is a question
// about the line's place in the deck, which the parser cannot see.
function parseAttributeTail(line, { column = false } = {}) {
  const { text, tail, stray } = splitTail(line);
  const what = `{${String(tail ?? '').trim()}} on "${text}"`;
  const t = parseTail(tail, CHUNK_SLOTS, what, { id: 'one', classes: column ? 'none' : 'slots' });
  if (stray) t.problems.unshift(strayTailProblem(what, stray));
  if (t.problems.length) {
    const err = new Error(t.problems[0].msg);
    err.userFacing = true;
    throw err;
  }
  const out = { text, classes: t.classes, id: t.id };
  if (t.slots.width.written) out.width = t.slots.width.value;
  if (t.slots.bare.written) out.bare = true;
  if (t.slots.center.written) out.center = true;
  for (const key of ['wrap', 'blocks']) {
    if (!t.slots[key].written) continue;
    (out.styleOverrides ??= {})[key] = CHUNK_STYLE_CLASSES[t.slots[key].value][1];
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
  // Windows line endings. Every matcher below anchors on `$`, and a `\r`
  // before it made every heading and every directive miss - a CRLF source
  // built to a deck with no chunks and exit 0. Normalised once here, so
  // every byte range this parser records (the editor's patch targets) is in
  // LF coordinates; the watch server normalises the file the same way
  // before it splices.
  src = String(src).replace(/\r\n?/g, '\n');
  const { data: frontmatter, content } = matter(src);
  // The lecture-wide diagram layer, parsed once and handed to every block.
  // Validated here rather than at the first diagram, because a lecture whose
  // frontmatter is wrong should say so even when it has no diagram yet.
  dgLectureTags.clear();
  dgEmittedBlocks.length = 0;
  let diagramBase = null;
  if (frontmatter['draw-defaults'] != null) {
    const { layer, errors } = parseDiagramDefaults(frontmatter['draw-defaults']);
    if (errors.length) {
      const err = new Error(
        `Frontmatter: draw-defaults has ${errors.length} problem(s):\n`
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
  let currentOverlay = null;   // { attrs, lines } while inside a ::: overlay block
  let cardsBlock = null;      // { n, attrs, lines } while inside a ::: cards block
  let colsDepth = 0;          // open ::: cols blocks; a figure in one breaks its flow
  let noteBlock = null;        // { lines: string[] } – current `> note:` block
  let pendingNotes = [];       // notes that appeared before a chunk, attach to the next one
  let annotBlock = null;       // { lines: string[] } – current `> annot:` block
  let diagramBlock = null;     // { attrs, lines } while inside a ::: draw block
  // A column heading's own slide. The lines between `# Heading` and the
  // first `##` used to be dropped without a word; they are the divider's
  // content now, which is what lets a part open on a picture, a quotation
  // or a figure without a grammar of its own for any of the three.
  let colBody = [];
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

  const flushOverlay = () => {
    if (!currentOverlay || !currentChunk) return;
    currentChunk.overlays.push({
      attrs: currentOverlay.attrs,
      from: currentOverlay.from,
      lines: currentOverlay.lines,
    });
    currentOverlay = null;
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

  // The divider's body, joined once when the column's own slide is over -
  // which is the first `##`, the next `#`, or the end of the file. It is
  // trimmed rather than tested for emptiness anywhere else, so a column with
  // nothing under its heading carries an empty string and every renderer
  // that asks gets the same answer.
  const flushColBody = () => {
    if (currentColumn && colBody.length) currentColumn.body = colBody.join('\n').trim();
    colBody = [];
  };
  const flushChunk = () => {
    if (!currentChunk) return;
    flushNoteBlock();
    flushAnnotBlock();
    flushOverlay();
    flushExpansion();
    // Close any still-open layout directives defensively so the emitted
    // body HTML stays balanced. The linter will flag these separately.
    // Popped one at a time rather than in bulk, because `cols` carries a
    // counter beside the stack and the counter has to come down with it. Left
    // standing, one unclosed `::: cols` made every later ::: draw in the
    // lecture a hard build failure naming a chunk that contained no columns -
    // while lint.js correctly reported the real unclosed directive, so the two
    // files disagreed about what was wrong.
    while (layoutStack.length) {
      const l = layoutStack.pop();
      if (l.cols) colsDepth -= 1;
      bodyLines.push('', l.close, '');
    }
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
        const target = currentExpansion ? currentExpansion.lines
          : currentChunk ? bodyLines : colBody;
        const dgBody = diagramBlock.lines.join('\n');
        dgEmittedBlocks.push({
          range: [diagramBlock.bodyAt, diagramBlock.bodyAt + dgBody.length],
          body: dgBody,
          chunk: currentChunk ? currentChunk.id : null,
        });
        // The compiler learns one thing from the opener, the grid, and takes
        // it as the `unit=WxH` string it always has. The whole opener rides
        // in the payload as one canonical line so the editor can write the
        // block back verbatim without knowing the grammar.
        target.push('', withAutoplay(diagramBlock.autoplay, diagramBlock.cycle, renderDiagram(dgBody, drawCompilerAttrs(diagramBlock), {
          // The block body's byte range in source.md. Emitted with the
          // diagram so the editor can patch exactly those bytes back.
          range: [diagramBlock.bodyAt, diagramBlock.bodyAt + dgBody.length],
          chunk: currentChunk ? currentChunk.id : null,
          width: currentChunk ? currentChunk.width : null,
          opener: formatDrawOpener(diagramBlock),
          // Names the slide a broken figure is on. A divider figure has no
          // chunk, and used to be reported as "a chunk with no id" even
          // when its column had one.
          where: currentChunk
            ? (currentChunk.id ? `chunk #${currentChunk.id}`
                               : currentChunk.heading ? `chunk "${currentChunk.heading}"`
                                                      : 'an unnamed chunk')
            : currentColumn
              ? (currentColumn.id ? `the divider of column #${currentColumn.id}`
                                  : currentColumn.heading ? `the divider of column "${currentColumn.heading}"`
                                                          : 'an unnamed column divider')
              : 'an unattached diagram',
          alt: currentChunk ? currentChunk.heading : '',
          base: diagramBase,
          onCompile: (model) => {
            for (const tag of model.tags.keys()) dgLectureTags.add(tag);
            // A clock with nothing to walk. `autoplay N` advances the
            // figure's steps; a figure with none was a number the drawing
            // ignored, and this format refuses those rather than drops them.
            if (diagramBlock.autoplay != null && !model.steps.length) {
              const err = new Error(
                `::: draw autoplay ${diagramBlock.autoplay} on a figure with no step block.\n` +
                '  autoplay walks the steps, one delay each; write a  step  block, or drop\n' +
                '  the autoplay.');
              err.userFacing = true;
              throw err;
            }
          },
        })), '');
        diagramBlock = null;
      } else {
        diagramBlock.lines.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) inFence = !inFence;

    // A card row's body is captured rather than streamed, because choosing
    // its size means counting the words in the longest item - a fact about
    // the source that cannot be recovered from CSS. Fence-aware: a ::: in a
    // code sample inside a card must not close the row.
    if (cardsBlock) {
      if (!inFence && /^:::\s*$/.test(line)) {
        const target = currentOverlay ? currentOverlay.lines
          : currentExpansion ? currentExpansion.lines : bodyLines;
        target.push('', renderCardsBlock(cardsBlock), '');
        cardsBlock = null;
      } else {
        cardsBlock.lines.push(line);
      }
      continue;
    }

    // A heading inside a captured block is that block's content, not the
    // deck's structure. Without this an `# Heading` written in an
    // ::: overlay opened a new *column* - the overlay was left open, its
    // body came out empty, and the deck grew a divider slide carrying the
    // author's title. Nothing said so: the later `:::` still closed
    // something, so the unclosed-directive error never fired either. The
    // same held for ::: expand, and both are places an author reaches for a
    // heading. Guarding here rather than reordering the loop keeps the one
    // real diagnostic - a block that is genuinely never closed is now an
    // unclosed `:::`, which is what it is.
    const inCaptured = !!(currentOverlay || currentExpansion);
    if (!inFence) {
      const h1 = inCaptured ? null : line.match(/^#\s+(.*)$/);
      const h2 = inCaptured ? null : line.match(/^##\s+(.*)$/);

      if (h1) {
        flushChunk();
        flushColBody();
        // A column heading takes an id and nothing else. Width and `.bare`
        // are a chunk's business, and left unchecked they parsed here, were
        // dropped, and neither file said anything - which is the silent no-op
        // this format refuses everywhere else. The parser says so itself
        // (`classes: 'none'`), so a typo is not first answered with a
        // vocabulary this line never had.
        const h1Attr = parseAttributeTail(h1[1], { column: true });
        const { text, id } = h1Attr;
        currentColumn = { heading: text, id, chunks: [], body: '', backdrop: null };
        colBody = [];
        columns.push(currentColumn);
        continue;
      }

      if (h2) {
        flushChunk();
        flushColBody();
        if (!currentColumn) {
          // A chunk before any `# Column` (e.g. the title chunk).
          currentColumn = { heading: null, id: null, chunks: [] };
          columns.push(currentColumn);
        }
        const h2Attr = parseAttributeTail(h2[1]);
        const { text, width, id, bare, center } = h2Attr;
        const { tag, heading, headingSub } = parseTagPrefix(text);
        // A title or closing chunk is placed by its cover composition: both
        // renderers hardcode data-width="full", and the heading is the
        // composition's rather than the slide's. So a width class and .bare
        // were read, stored and thrown away - byte-identical output with and
        // without them, which is the silent no-op this format refuses.
        // A closing slide's heading IS its content - unlike a title chunk it
        // has no frontmatter to fall back on - so one with no heading renders
        // an empty <h1> and a slide with nothing on it. lint.js has said so
        // since the tag was added; the build let it through, which is the
        // direction that matters: a pre-commit gate refusing what the build
        // accepts is the wrong way round of a rule this project states.
        if (tag === 'closing' && !heading) {
          const err = new Error(
            'A closing chunk has no heading, and its heading is its content.\n' +
            '  Unlike `## title:`, which renders from the frontmatter, a closing\n' +
            '  slide has no other source for its words. Write  ## closing: Your line');
          err.userFacing = true;
          throw err;
        }
        if ((tag === 'title' || tag === 'closing') && (width || bare || center)) {
          const err = new Error(
            `A ${tag} chunk carries .${width || (bare ? 'bare' : 'center')}, which its cover composition decides ("${text}").\n` +
            '  A title or closing slide is always full width, its heading is the\n' +
            '  composition\'s, and where its words sit is cover-align\'s - so none\n' +
            '  of these classes has anything to act on.');
          err.userFacing = true;
          throw err;
        }
        currentChunk = {
          tag,
          heading,
          headingSub,
          // The one per-tag default. An agenda is a list of part titles and
          // wants the wider measure; every other tag is standard. It is set
          // here rather than in the renderer because the renderer's own
          // fallback could never fire - this line always supplies a value.
          width: width || (tag === 'outline' ? 'wide' : 'standard'),
          bare: !!bare,
          center: !!center,
          // The `style:` keys this one chunk answers differently, or null.
          // Null and not an empty object so every renderer's attribute
          // helper can leave in one line, and so a chunk that wrote none of
          // these classes carries nothing new through the pipeline.
          styleOverrides: h2Attr.styleOverrides || null,
          id,
          expansions: [],
          overlays: [],
          backdrop: null,
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

      // What a column heading's own slide may carry, and the list is short
      // on purpose. A divider is one slide with one heading and one thing on
      // it: a picture behind it, a figure on it, or the words under it. A
      // column layout, an expansion or a card row there is a slide that has
      // stopped being a divider - so those stay chunk-only, and writing one
      // there falls through to the stray-directive path rather than being
      // half-supported.
      if (!currentChunk && currentColumn) {
        const colBd = line.match(/^:::\s+backdrop\s+([^\s{]+)\s*(?:\{([^}]*)\})?\s*(?:reveal\s+(.+?))?\s*$/);
        if (!colBd && /^:::\s+backdrop\b/.test(line)) {
          const err = new Error(
            `::: backdrop: "${line.trim()}" is not a line this directive reads.\n` +
            '  It takes one asset id, path or URL, then an optional {.class} tail and an\n' +
            '  optional  reveal <place>, <place>:  ::: backdrop dusk {.cover .invert}');
          err.userFacing = true;
          throw err;
        }
        if (colBd) {
          if (currentColumn.backdrop) {
            const err = new Error(
              `A column heading has two ::: backdrop lines (${currentColumn.heading || 'no heading'}).\n`
              + `  One slide has one ground.`);
            err.userFacing = true;
            throw err;
          }
          currentColumn.backdrop = { ref: colBd[1], attrs: colBd[2] ?? null, reveal: colBd[3] || null };
          continue;
        }
        const colDraw = parseDrawOpener(line);
        if (colDraw) {
          refuseDrawOpener(colDraw);
          diagramBlock = { unit: colDraw.unit, autoplay: colDraw.autoplay, cycle: colDraw.cycle,
                           lines: [], bodyAt: fmOffset + lineAt };
          continue;
        }
      }

      if (currentChunk) {

        // ::: backdrop <ref> {.classes} – a full-bleed image behind the
        // whole slide. Chunk-level rather than a body wrapper, and that is
        // forced rather than chosen: .chunk-content sits in the middle
        // track of the slide's grid, so anything emitted inside the body
        // is boxed by the text column and can never reach the edges. One
        // line, no closer – the directive has no body to hold.
        // `reveal` rides after the attribute tail rather than inside it,
        // because it is a list of places and the tail is a set of closed
        // words - and a comma list of `left 45%` inside braces would have
        // been a second grammar wearing the slot table's syntax.
        const backdropOpen = line.match(/^:::\s+backdrop\s+([^\s{]+)\s*(?:\{([^}]*)\})?\s*(?:reveal\s+(.+?))?\s*$/);
        // A directive line the matcher does not read is refused, never left
        // to fall through as prose: `::: backdrop {.blur}` with no picture,
        // `::: cols 4`, `::: overlay {.ink} junk` used to print themselves
        // on the slide with exit 0 while lint.js refused them. Same guard on
        // every directive that takes arguments; ::: side has had one since
        // the ratio was added.
        if (!backdropOpen && /^:::\s+backdrop\b/.test(line)) {
          const err = new Error(
            `::: backdrop: "${line.trim()}" is not a line this directive reads.\n` +
            '  It takes one asset id, path or URL, then an optional {.class} tail and an\n' +
            '  optional  reveal <place>, <place>:  ::: backdrop dusk {.cover .invert}');
          err.userFacing = true;
          throw err;
        }
        if (backdropOpen) {
          if (currentChunk.backdrop) {
            const err = new Error(
              `A chunk has two ::: backdrop lines (${currentChunk.id ? '#' + currentChunk.id : 'no id'}).\n`
              + '  A slide has one background; the second would silently win.');
            err.userFacing = true;
            throw err;
          }
          currentChunk.backdrop = {
            ref: backdropOpen[1],
            attrs: backdropOpen[2] ?? null,
            reveal: backdropOpen[3] || null,
          };
          continue;
        }

        // ::: overlay {.classes} – a text block laid over the slide rather
        // than set in its column. Collected on the chunk for the same
        // reason the backdrop is: it has to escape the content track.
        // `from` takes a token rather than digits, and the token is checked
        // below. Matched narrowly, anything `from` could not swallow made the
        // whole line fail to match - so `from later` was not an overlay at
        // all, the build said nothing, and `::: overlay …` printed as literal
        // text on the projection while the linter blamed the closing `:::`.
        const overlayOpen = line.match(/^:::\s+overlay\s*(?:\{([^}]*)\})?\s*(?:from\s+(\S+))?\s*$/);
        if (!overlayOpen && /^:::\s+overlay\b/.test(line)) {
          const err = new Error(
            `::: overlay: "${line.trim()}" is not a line this directive reads.\n` +
            '  It takes an optional {.class} tail and an optional  from <beat>, and\n' +
            '  nothing else:  ::: overlay {.bottom-left .ink} from 2');
          err.userFacing = true;
          throw err;
        }
        if (overlayOpen) {
          // Assigned unconditionally, a second opener replaced the first and
          // its words were gone from every output with the build exiting 0 -
          // while lint.js reported `nested-directive`. Content loss and a
          // divergence in one line.
          if (currentOverlay) {
            const err = new Error(
              `::: overlay opened while one is still open (${currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id'}).\n` +
              '  An overlay is a block, not a marker: close the first with a ::: line\n' +
              '  before opening the second. Two overlays on one chunk are fine.');
            err.userFacing = true;
            throw err;
          }
          if (overlayOpen[2] != null && !/^[1-9]\d*$/.test(overlayOpen[2])) {
            const err = new Error(
              `::: overlay from ${overlayOpen[2]} in ${currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id'}.\n` +
              '  `from` takes a whole beat number from 1 up - the beat the block\n' +
              '  arrives on. Beat 0 is the beat the slide opens on, which is what\n' +
              '  writing no `from` already says.');
            err.userFacing = true;
            throw err;
          }
          if (overlayOpen[2] === '0') {
            const err = new Error(
              `::: overlay from 0 in ${currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id'}.\n` +
              '  Beat 0 is the beat the slide opens on, which is what writing no\n' +
              '  `from` already says. Write `from 1` for the next one.');
            err.userFacing = true;
            throw err;
          }
          flushExpansion();
          currentOverlay = { attrs: overlayOpen[1] ?? null, from: overlayOpen[2] || null, lines: [] };
          continue;
        }

        // ::: expand <label>  or  ::: footnote  –  open an aside block.
        // Both are modeled as expansions for the print renderer; the
        // audience view will distinguish them later (expansions get a
        // chevron, footnotes sit under the chunk).
        //
        // `::: margin` is the older spelling of `::: footnote` and stays
        // valid so that no existing source.md breaks - the source format is
        // the interface from 1.0.0. It is documented nowhere any more: the
        // two names were a keystroke apart from `::: marginalia`, which is a
        // different construct in a different place, and "margin note" named
        // the one thing the block never does, which is sit in the margin.
        // `word` remembers which spelling was written, so a message about an
        // unclosed block quotes the line the author actually typed.
        const expandOpen = line.match(/^:::\s+expand\s+(.+?)\s*$/);
        const marginOpen = line.match(/^:::\s+(footnote|margin)\s*$/);
        if (expandOpen || marginOpen) {
          flushExpansion();
          currentExpansion = {
            label: expandOpen ? expandOpen[1].trim() : 'note',
            kind: marginOpen ? 'margin' : 'expand',
            word: marginOpen ? marginOpen[1] : 'expand',
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
        // A ::: draw inside ::: cols is the same silent no-op a card row
        // was: `.cols` is `column-count`, so it is a text *flow*, and a
        // grid or an svg placed in it breaks the flow - the figure appears,
        // the second column never fills, and the author who wrote `cols 2`
        // gets one column with nothing to say why. Measured before it was
        // refused. ::: side is the construct that holds a figure beside
        // prose, and the message says so.
        if (colsDepth > 0 && parseDrawOpener(line)) {
          const err = new Error(
            `::: draw inside ::: cols (${currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id'}).\n` +
            '  ::: cols is one text flow balanced across columns, and a figure in it\n' +
            '  breaks the flow - the columns silently stop working. Use ::: side to\n' +
            '  put a figure beside prose, or take the figure out of the columns.');
          err.userFacing = true;
          throw err;
        }
        const colsOpen = line.match(/^:::\s+cols\s+(2|3)\s*$/);
        if (!colsOpen && /^:::\s+cols\b/.test(line)) {
          const err = new Error(
            `::: cols: "${line.trim()}" is not a line this directive reads.\n` +
            '  It takes 2 or 3 and nothing else - more columns than three is a table,\n' +
            '  and a card row is  ::: cards N');
          err.userFacing = true;
          throw err;
        }
        if (colsOpen) {
          target.push('', `<div class="cols cols-${colsOpen[1]}">`, '');
          colsDepth += 1;
          layoutStack.push({ close: '</div>', kind: 'cols', narrows: true, cols: true });
          continue;
        }
        // ::: cards N – N equal cards in a row, each with a subtle ground
        // and outline. Not a second spelling of `cols`: `cols` is a text
        // flow the browser balances across N tracks and one paragraph can
        // spill into the next column, while `cards` is N *containers* and
        // an item is whole or it is nowhere. The distinction is what makes
        // a three-item comparison read as three things rather than as one
        // paragraph cut in three.
        //
        // Which children become cards is decided in CSS, not here: a lone
        // list dissolves into the grid (`display: contents`) so its items
        // are the cards, and anything else contributes one card per block.
        // That is one rule an author can hold, and no parsing of the body.
        // `::: rows` is `::: cards` turned ninety degrees, and it is the
        // same container: the same slot vocabulary, the same auto size,
        // the same fold, the same print rules. Only the arrangement of the
        // item differs - term in a card on the left, body beside it - and
        // that is one `display` on the item plus a grid on the list.
        //
        // Written as its own keyword rather than a class on `cards`
        // because the count means something different: `cards 3` is three
        // columns, and a row block has exactly one. A class would have
        // left the number on the line meaning nothing.
        const rowsOpen = line.match(/^:::\s+rows\s*(?:\{([^}]*)\})?\s*$/);
        const cardsOpen = line.match(/^:::\s+cards\s+([1-6])\s*(?:\{([^}]*)\})?\s*$/);
        if (cardsOpen || rowsOpen) {
          const kw = rowsOpen ? 'rows' : 'cards';
          // A card row is N containers side by side, so it needs the whole
          // measure - and every directive that could enclose it has already
          // divided that measure up. Refused rather than rendered, because
          // what the three cases actually do is worse than nothing:
          //
          //   cols        the row spans the full width and the column flow
          //               is defeated - the author wrote `cols 2` and got
          //               one column, with nothing to say why
          //   side        the row is squeezed into half the slide and the
          //               other pane floats beside the heading
          //   marginalia  a full-width row inside a narrow aside, which is
          //               the opposite of what a margin note is
          //
          // expand and margin are the same story one layer down, and an
          // overlay is itself a card. Slide and script are exempt: they
          // divide nothing, they only say which half of the chunk is on
          // screen.
          // `side` was in this list and is not any more, and the
          // distinction is the one worth keeping: a ::: side pane is a
          // *container* with a width the row can fill, while ::: cols is a
          // text flow the row breaks. Measured, not assumed - a row in a
          // pane lays out correctly and a row in a column silently
          // defeated the column count.
          const encl = layoutStack.filter(l => l.narrows).pop();
          const where = encl ? `::: ${encl.kind}`
            : currentOverlay ? '::: overlay'
            : currentExpansion ? `::: ${currentExpansion.word || 'expand'}`
            : null;
          if (where) {
            const err = new Error(
              `::: ${kw} inside ${where} (${currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id'}).\n` +
              '  A card row is N containers side by side, so it needs the whole measure,\n' +
              `  and ${where} has already divided it. Put the row in the chunk body, or\n` +
              `  use the enclosing directive alone.`);
            err.userFacing = true;
            throw err;
          }
          cardsBlock = rowsOpen
            ? { n: 1, rows: true, attrs: rowsOpen[1] ?? null, lines: [],
                where: currentChunk.id ? `chunk #${currentChunk.id}` : 'a chunk with no id' }
            : { n: cardsOpen[1], attrs: cardsOpen[2] ?? null, lines: [],
                where: currentChunk.id ? `chunk #${currentChunk.id}` : 'a chunk with no id' };
          continue;
        }
        // `::: side 2:1` - how the two panes divide the measure. A ratio
        // rather than a set of classes, because it is the same question
        // `aspect W:H` answers on a chart and the same two-number answer;
        // a closed list would have had to guess which handful of splits an
        // author wants and would still refuse the one they meant.
        //
        // It costs nothing downstream, which is the reason it is the whole
        // of what was needed here: print sets .side to display:block and
        // stacks the panes, so a ratio it never reads changes nothing, and
        // the collapse mode does not touch .side at all - two panes are two
        // things rather than one flow. Placement-only constructs are cheap
        // exactly because print can ignore them and collapse does not care.
        // The counterpart of the ::: side refusal below, and missing for the
        // same two keywords: an unreadable line simply did not match, fell
        // through every branch and was emitted as literal text - the words
        // `::: cards 7` printed on the projection, with the build exiting 0
        // while lint.js reported bad-cards.
        if (/^:::\s+(cards|rows)\b/.test(line)) {
          const kw = /rows/.test(line) ? 'rows' : 'cards';
          const err = new Error(
            `::: ${kw} could not be read: "${line.trim()}".\n` +
            (kw === 'cards'
              ? '  Write  ::: cards N  with N from 1 to 6, and an optional {class} tail.'
              : '  Write  ::: rows  with an optional {class} tail - a row block has one column,\n  so it takes no count.'));
          err.userFacing = true;
          throw err;
        }
        // The ratio stays positional and the anchor rides in a brace tail,
        // which is the shape the rest of the language already has: a number
        // is read by its position, a word is read out of {braces} against a
        // closed slot table. A second positional token was the alternative
        // and it reads worse the moment both are written - `::: side 2:1
        // middle` is two grammars on one line, and the next word after it
        // would have had to be positional too.
        const sideOpen = line.match(
          /^:::\s+side(?:\s+(\d{1,2})\s*:\s*(\d{1,2}))?\s*(?:\{([^}]*)\})?\s*$/);
        if (sideOpen) {
          const style = sideOpen[1]
            ? ` style="--side-a:${sideOpen[1]}fr;--side-b:${sideOpen[2]}fr"`
            : '';
          const so = readTail(sideOpen[3] ?? null, SIDE_SLOTS, 'side',
            currentChunk && currentChunk.id ? `chunk #${currentChunk.id}` : 'a chunk with no id');
          // Only the written word reaches the markup. `top` is what a bare
          // ::: side has always drawn, so emitting a class for it would
          // change every existing output for a decision nobody made.
          const anchorCls = so.anchor === 'top' ? '' : ` sv-${so.anchor}`;
          target.push('', `<div class="side${anchorCls}"${style}><div class="side-a">`, '');
          layoutStack.push({ close: '</div></div>', kind: 'side', narrows: false });
          continue;
        }
        if (/^:::\s+side\b/.test(line)) {
          const err = new Error(
            `::: side takes an optional ratio, an optional {class} tail, and nothing\n` +
            `  else: "${line.trim()}".\n` +
            '  Write  ::: side  for equal panes, or  ::: side 2:1  to give the\n' +
            '  first pane twice the width of the second. Add  {middle}  to centre\n' +
            '  the shorter pane against the taller one.');
          err.userFacing = true;
          throw err;
        }
        if (/^:::\s+flip\s*$/.test(line)) {
          target.push('', `</div><div class="side-b">`, '');
          continue;
        }
        if (/^:::\s+marginalia\s*$/.test(line)) {
          target.push('', `<aside class="marginalia">`, '');
          layoutStack.push({ close: '</aside>', kind: 'marginalia', narrows: true });
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
          layoutStack.push({ close: '</figcaption></figure>', kind: 'embed', narrows: true });
          continue;
        }
        // ::: draw – a boxes-and-arrows figure written in the diagram
        // DSL and compiled to inline SVG at build time. Like ::: embed it
        // earns its own directive rather than overloading a fence, because
        // the body is not markdown and must not be parsed as any.
        const diagramOpen = parseDrawOpener(line);
        if (diagramOpen) {
          // `autoplay N` and `cycle` are the host's and never reach the
          // compiler. Playback is not part of the drawing: the compiler's
          // job ends at a set of per-beat geometries, and teaching it a
          // wall-clock number would put a runtime concern in the one file
          // that also runs in the editor, where there is no deck to play.
          refuseDrawOpener(diagramOpen);
          diagramBlock = { unit: diagramOpen.unit, autoplay: diagramOpen.autoplay, cycle: diagramOpen.cycle,
                           lines: [], bodyAt: fmOffset + lineAt };
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
          layoutStack.push({ close: '</div>', kind: 'slide', narrows: false });
          continue;
        }
        if (/^:::\s+script\s*$/.test(line)) {
          target.push('', `<div class="script-only">`, '');
          layoutStack.push({ close: '</div>', kind: 'script', narrows: false });
          continue;
        }
        // :::  –  closes the innermost open layout, or the expansion.
        if (/^:::\s*$/.test(line)) {
          if (layoutStack.length) {
            const closed = layoutStack.pop();
            if (closed.cols) colsDepth -= 1;
            target.push('', closed.close, '');
            continue;
          }
          if (currentOverlay) {
            flushOverlay();
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
      if (currentOverlay) currentOverlay.lines.push(line);
      else if (currentExpansion) currentExpansion.lines.push(line);
      else bodyLines.push(line);
    } else if (currentColumn) {
      colBody.push(line);
    }
  }
  flushColBody();
  if (cardsBlock) {
    const err = new Error(
      '::: cards was never closed. Everything after it was read as card\n'
      + 'content, so any chunk below it is missing from the output. Add a\n'
      + 'closing ::: line.');
    err.userFacing = true;
    throw err;
  }
  // Same reasoning as the two above, and it became reachable when headings
  // stopped breaking out of a captured block: an `## chunk` inside an open
  // ::: expand / ::: margin / ::: overlay is that block's content now, which
  // is right for a sub-heading in an aside and catastrophic for a directive
  // the author forgot to close - every slide below it was folded into the
  // aside and the build exited 0. The linter reported it; the build has to
  // as well, or a lecture loses slides between a clean lint and a clean
  // build.
  if (currentOverlay || currentExpansion) {
    const kind = currentOverlay ? 'overlay'
      : (currentExpansion.kind === 'margin' ? currentExpansion.word : `expand ${currentExpansion.label}`);
    const err = new Error(
      `::: ${kind} was never closed. Everything after it was read as that\n`
      + 'block\'s content, so any chunk below it is missing from the output.\n'
      + 'Add a closing ::: line.');
    err.userFacing = true;
    throw err;
  }
  if (diagramBlock) {
    // Everything after the opener was read as diagram source, so the chunks
    // below it simply vanished from all four outputs. Exiting 0 on that is
    // the worst possible answer.
    const err = new Error(
      '::: draw was never closed. Everything after it was read as diagram\n'
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
        'Frontmatter: draw-defaults targets tags no diagram in this lecture carries:\n'
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
      // The server could not rebuild – a deleted asset, a syntax error made
      // in a text editor. Surfaced to whoever can show it (the diagram
      // editor's status line); without this the page sat on the old build in
      // silence and the next write-back failed with unhelpful advice.
      if (m && m.type === 'build-failed') {
        if (window.psiWatchBuildFailed) window.psiWatchBuildFailed(m.why || 'the rebuild failed');
        return;
      }
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
    // Body first, protocol last – the same rule the server's reply follows,
    // and for the same reason: a payload field named like a protocol one
    // would otherwise silently take its place and the pairing would break.
    sock.send(JSON.stringify({ ...body, type, id, nonce: window.psiWatch.nonce }));
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
// auto-fit, slide numbers on screen and slide numbers on paper. Precedence
// is deliberate and one sentence long:
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

// How a slide number is drawn, in cycle order (hotkey L). One source of
// truth: the runtime's own cycle, both validator entries below and the two
// renderers all read this list.
const SLIDE_NUM_MODES = ['vertical', 'horizontal', 'off'];
// `horizontal` and not `vertical`, which it was up to 1.0.0. The stacked
// form sets each digit on its own line, so slide 10 reads as a 1 above a 0
// and the reader has to assemble the number – and the house-style file of
// the content repo had carried "set slide-numbers: horizontal" as a standing
// instruction, which is the tell that the default was the wrong way round.
// This moves the rendering of every deck that does not set the key.
const SLIDE_NUM_DEFAULT = 'horizontal';

// The three answers to "what does the zoom do when a slide arrives".
//
//   off     – nothing. The lecturer's zoom, on every slide.
//   full    – every slide is sized to the screen, up or down. The camera
//             grows a short chunk as readily as it shrinks a long one.
//   shrink  – the same fit, ceilinged at the lecturer's own zoom, so it can
//             only ever take size away. A slide that fits is left alone.
//
// The frontmatter spelling of the first two is `false` and `true`, because
// that is what the key has always accepted and this is additive; the runtime
// spelling is these three words, because a boolean cannot carry a third
// state. AUTO_FIT_FROM_KEY is the one place the two vocabularies meet.
//
// Written in the order the # key walks them, and interpolated into
// AUDIENCE_JS rather than restated there, so the cycle and the vocabulary
// cannot come apart. One press from the default is the mode most lectures
// want: leave my zoom alone, but do not let a slide run off the screen.
const AUTO_FIT_CYCLE = ['off', 'shrink', 'full'];
// Written in the order the refusal message lists them, which is the order
// lint.js lists them in: the two that were always there, then the new one.
const AUTO_FIT_FROM_KEY = { 'true': 'full', 'false': 'off', shrink: 'shrink' };

const VIEW_DEFAULT_SPEC = [
  ['font',          'font',      ['serif', 'sans', 'mono']],
  ['theme',         'theme',     THEME_NAMES],
  ['collapse',      'collapse',  ['topic-bold', 'none']],
  ['auto-fit',      'autoFit',   Object.keys(AUTO_FIT_FROM_KEY)],
  ['slide-numbers', 'slideNums', SLIDE_NUM_MODES],
  // The printed views' own numbering. Its default is not a value but a
  // deferral: an absent key means "whatever the live views are set to",
  // resolved by printSlideNums() at read time. That is why nothing here
  // writes a fallback for it – see the note on that function.
  ['print-slide-numbers', 'printSlideNums', SLIDE_NUM_MODES],
  // Where the diagram editor ships. Not a look but a payload, so it follows
  // `fonts: none` in spirit and the viewer-default machinery in mechanism –
  // an unknown value fails the build rather than quietly costing the lecture
  // its editor. `both` is the default; `speaker` keeps it out of the
  // projection; `none` ships neither the compiler nor the UI.
  ['editor',        'editor',    ['both', 'speaker', 'none']],
];
// ── lecture-wide typographic settings (the `style:` block) ───────────
// Three knobs an author reaches for on a whole lecture rather than on one
// chunk. They are a nested block and not six top-level keys because they
// are one subject, and because the top level is already the place where a
// typo is most expensive.
//
// Deliberately small, and deliberately not a stylesheet hook: each key is
// a closed vocabulary or a bounded number, so a lecture cannot end up
// depending on an internal class name that the next version renames.
// The six looks a `**bold**` phrase may have in a view, as the three
// declarations each one makes. `inherit` rather than a value, so a phrase
// set `plain` is exactly the sentence around it. W is the view's own bold
// weight: `var(--bold-weight)` live (500 serif, 600 sans and mono), 600 on
// paper, which is what PRINT_CSS has always given a strong.
const BOLD_LOOKS = {
  'plain':         (W) => 'font-weight: inherit; color: inherit; font-style: inherit;',
  'bold':          (W) => `font-weight: ${W}; color: inherit; font-style: inherit;`,
  'italic':        (W) => 'font-weight: inherit; color: inherit; font-style: italic;',
  'accent':        (W) => 'font-weight: inherit; color: var(--emph); font-style: inherit;',
  'accent-bold':   (W) => `font-weight: ${W}; color: var(--emph); font-style: inherit;`,
  'accent-italic': (W) => 'font-weight: inherit; color: var(--emph); font-style: italic;',
};
// The strongs the two keys reach: the ones the derivation reads, which is a
// strong inside a paragraph splitSentencesIn splits - ordinary prose, and
// prose inside ::: cols, ::: side, a blockquote, a loose list item, a
// caption and a ::: marginalia. Not a ::: slide or ::: script block, whose
// bolds the author typed for the look; not a card's lead or a row's term,
// which carry their own rules; not an overlay, an expansion, a margin or
// speaker note; not a cover or a section divider. The audience wraps prose
// in .chunk-body and print does not, so the anchor is the article both
// renderers emit. Specificity (0,4,3): above .chunk-body strong, above
// PRINT_CSS's bare strong, and above the promoted-bullet rule
// ([data-collapse=topic-bold] .reveal-segment .sentence-rest strong, (0,3,1)),
// which is why that rule no longer says anything about weight or colour.
const DERIVED_STRONG = '.chunk:not(.chunk-title, .chunk-section) '
  + 'p:not(:is(.slide-explicit, .script-only, .cards, .overlay-card, aside:not(.marginalia)) p) '
  + 'strong:not(.card-lead)';
// The rules for one stylesheet: the default look unguarded, every other
// look behind its body attribute, and the stress rule - an em inside such a
// phrase is upright, bold and accent in every look but accent-bold, where
// the phrase already has all three and the em stays the italic it always
// was. So a lecture that says nothing renders its stress marks, and the one
// that asks for the old look gets exactly the old look.
function boldLookCss(attr, dflt, W) {
  const out = [];
  for (const [name, decl] of Object.entries(BOLD_LOOKS)) {
    const guard = name === dflt ? '' : `body[data-${attr}=${name}] `;
    out.push(`${guard}${DERIVED_STRONG} { ${decl(W)} }`);
  }
  out.push(`body:not([data-${attr}=accent-bold]) ${DERIVED_STRONG} em { font-style: normal; font-weight: ${W}; color: var(--emph); }`);
  return out.join('\n');
}

const STYLE_SPEC = {
  // Where a heading sits. `auto` keeps the per-tag treatment (a question
  // is centred, a figure's caption is centred over its artwork); `left`
  // overrides all of it, which is what an author who wants one axis of
  // alignment through the whole deck is asking for.
  // `off` sits in this key rather than in one of its own, and the two
  // readings are one question: what does the projection do with a chunk's
  // heading. left / center are where it goes, off is that it does not go
  // anywhere - and the alternative was a second key whose only legal
  // combination with this one is "off, and also aligned left", which means
  // nothing. It is the *slide* it comes off: the TOC, the search index and
  // the printed document keep it, which is the whole point.
  headings: { kind: 'enum', values: ['auto', 'left', 'center', 'off'], dflt: 'auto' },
  // The hairline above a principle / definition chunk.
  rules:    { kind: 'enum', values: ['on', 'off'], dflt: 'on' },
  // The little code mark after an external link. Up to 1.0.0 the address and
  // its QR code were reachable only by Shift-clicking the link, which is a
  // gesture nobody finds who has not read about it - so in practice the
  // feature was there and unused. The mark says it is there; Shift-click
  // still works and is unchanged. `off` for a deck that would rather keep
  // its links bare, and for anyone who wants the 1.0.0 rendering back.
  'link-codes': { kind: 'enum', values: ['on', 'off'], dflt: 'on' },
  // Multipliers on the heading and body scales. Bounded rather than free:
  // outside this range the collapse mode, the code-width clamp and the
  // auto-fit camera all stop agreeing with each other, and the result is
  // not a look but a bug report.
  'heading-scale': { kind: 'num', min: 0.6, max: 1.8, dflt: 1 },
  'body-scale':    { kind: 'num', min: 0.6, max: 1.8, dflt: 1 },
  // Whether headings are balanced across their lines and prose gets a
  // protected last line. A preference in its own right - some authors want
  // the browser's plain greedy wrapping - and it is also the setting a deck
  // built before the balancing landed needs in order to break where it
  // used to.
  wrap: { kind: 'enum', values: ['balance', 'none'], dflt: 'balance' },
  // Where the three things that are not prose sit across the measure: a
  // code block, a figure with a caption, a display formula. All three have
  // always been centred, and centred is right when the block is the slide -
  // but a chunk that is a paragraph, a formula and another paragraph reads
  // as three blocks on three axes, which is the complaint this key answers.
  //
  // `left` is flush with the prose's own left edge and not with the slide's:
  // the point is that the formula starts where the sentence above it starts.
  // For a code block that means the box moves and its contents do not - the
  // listing is left-aligned inside its box either way, and what the eye sees
  // as centring is the breakout box being pinned to the slide's middle. For a
  // figure and a formula it is the other way round: the box is already the
  // full measure and it is the artwork, the caption and the equation inside
  // it that move.
  //
  // A `::: draw` is deliberately not in the list. Its <svg> is emitted 2000px
  // wide under max-width: 100%, so it fills the measure at every chunk width
  // and there is no space beside it to align in.
  blocks: { kind: 'enum', values: ['center', 'left'], dflt: 'center' },
  // The generated tag word above a chunk. Two different things wear that
  // name and one switch has to reach both: the document renderer emits a
  // <span class="chunk-label"> for principle, question, definition and
  // exercise, and the projection generates EXERCISE in CSS - the one tag
  // whose eyebrow survived the removal of the others.
  //
  // It is its own key rather than part of `rules`, because `rules` hides
  // the bar over a principle and the hairline over a definition, and a
  // word and a line are not one decision: an author may well want the
  // line and not the word.
  labels: { kind: 'enum', values: ['on', 'off'], dflt: 'on' },
  // Which views break a word at the end of a line. `lang:` picks the
  // dictionary and stays out of this: the language is a property of the
  // lecture, not an opening preference, and a German deck may perfectly
  // well want its projection unhyphenated.
  //
  //   print – prose hyphenates in the two document views and nowhere else.
  //           Today's behaviour, and the default, so nothing moves.
  //   all   – the projection and the lectern hyphenate too. For a German
  //           deck at .narrow, where a compound noun leaves a hole in the
  //           measure that no amount of rewriting closes.
  //   none  – nobody does, print included.
  //
  // What it does NOT reach: the `hyphens: auto` inside a card and a row's
  // term. Those are not a typographic preference but the rescue for a
  // 320px measure a long word overflows outright, with break-word as the
  // floor under them – so they answer a different question and keep
  // answering it in all three settings.
  hyphenate: { kind: 'enum', values: ['print', 'all', 'none'], dflt: 'print' },
  // Whether the printed document is set in the serif or the sans. The live
  // views have had this since the first commit - `F` cycles the three faces
  // and `font:` pins which one a lecture opens in - and print had nothing,
  // because PRINT_CSS names the serif on `html` and every reader of a
  // document is the author's choice rather than the reader's.
  //
  // It sits in `style:` next to `hyphenate`, which is the other key here
  // whose effect lands in the two document views and nowhere else, and it
  // rides the same styleBodyAttrs into every renderer. One rule carries it,
  // on `body`, because everything in PRINT_CSS that should be a sans already
  // names one: the tag word, a figure's caption, a sub-heading, the contents
  // list. What inherits the serif off `html` is the running text, the chunk
  // and column headings and a blockquote - which is exactly the set that
  // should move, so an enumerated list of elements would only be a way of
  // getting the set slightly wrong later.
  //
  // Deliberately NOT deferred to `font:` the way `print-slide-numbers`
  // defers to `slide-numbers`. That key was born deferring, so nothing moved
  // under anyone; here, a deck that already says `font: sans` for the room
  // would start printing in a sans it never asked for. And `font: mono` has
  // no sensible reading as a whole printed document, which a deferral would
  // have to invent one for.
  'print-body': { kind: 'enum', values: ['serif', 'sans'], dflt: 'serif' },
  // How a `**bold**` phrase looks. In this tool bold is a selection mark
  // first - the collapse lifts it onto the slide as a bullet of its own - and
  // a typographic weight only by the accident of markdown. `bold` answers for
  // the two live views, `print-bold` for the two documents, and the two
  // defaults differ on purpose: a slide of accent-coloured bold bullets reads
  // as a slide of highlights nobody asked for, so the projection sets them in
  // the sentence's own ink; a page keeps a plain bold so a reader can still
  // skim what the room saw. Within such a phrase, `*em*` is the stress mark -
  // see BOLD_LOOKS. The old look of both is `accent-bold`.
  'bold':       { kind: 'enum', values: Object.keys(BOLD_LOOKS), dflt: 'plain' },
  'print-bold': { kind: 'enum', values: Object.keys(BOLD_LOOKS), dflt: 'bold' },
};
function styleSettings(frontmatter = {}) {
  const raw = frontmatter.style;
  const out = {};
  for (const [k, spec] of Object.entries(STYLE_SPEC)) out[k] = spec.dflt;
  if (raw == null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error(
      'Frontmatter: "style:" is a block of keys, not a single value.\n' +
      '  style:\n    headings: left\n    heading-scale: 1.15');
    err.userFacing = true;
    throw err;
  }
  for (const [k, v] of Object.entries(raw)) {
    const spec = STYLE_SPEC[k];
    if (!spec) {
      const err = new Error(
        `Frontmatter: style has no key "${k}".\n` +
        `  Keys: ${Object.keys(STYLE_SPEC).join(', ')}`);
      err.userFacing = true;
      throw err;
    }
    if (spec.kind === 'enum') {
      const val = String(v).trim();
      if (!spec.values.includes(val)) {
        const err = new Error(
          `Frontmatter: "style.${k}: ${val}" is not a value this key accepts.\n` +
          `  Valid values for ${k}: ${spec.values.join(', ')}`);
        err.userFacing = true;
        throw err;
      }
      out[k] = val;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
        const err = new Error(
          `Frontmatter: "style.${k}: ${v}" is not a number between ${spec.min} and ${spec.max}.\n` +
          `  1 is the tool's own scale; 1.15 is 15% larger.`);
        err.userFacing = true;
        throw err;
      }
      out[k] = n;
    }
  }
  return out;
}
// The settings as one <style> element plus the two body attributes the
// selectors key off. Emitted for every view, print included: a lecture set
// in a larger body size should print in one.
function styleBlockCss(st) {
  const parts = [];
  if (st['heading-scale'] !== 1) parts.push(`--heading-scale: ${st['heading-scale']};`);
  if (st['body-scale'] !== 1) parts.push(`--body-scale: ${st['body-scale']};`);
  return parts.length ? `<style>:root { ${parts.join(' ')} }</style>` : '';
}
function styleBodyAttrs(st, frontmatter = {}) {
  const parts = [];
  if (st.headings !== 'auto') parts.push(`data-headings="${st.headings}"`);
  if (st.rules !== 'on') parts.push('data-rules="off"');
  if (st.labels !== 'on') parts.push('data-labels="off"');
  if (st['link-codes'] !== 'on') parts.push('data-link-codes="off"');
  // Emitted only when they differ from the default, so a lecture that says
  // nothing produces the same <body> tag it always did.
  const liga = ligatureMode(frontmatter);
  if (liga !== 'text') parts.push(`data-liga="${liga}"`);
  if (st.wrap !== 'balance') parts.push('data-wrap="none"');
  if (st.blocks !== 'center') parts.push('data-blocks="left"');
  if (st.hyphenate !== 'print') parts.push(`data-hyphenate="${st.hyphenate}"`);
  if (st['print-body'] !== 'serif') parts.push(`data-print-body="${st['print-body']}"`);
  if (st.bold !== 'plain') parts.push(`data-bold="${st.bold}"`);
  if (st['print-bold'] !== 'bold') parts.push(`data-print-bold="${st['print-bold']}"`);
  return parts.join(' ');
}
// The same two settings answered on one chunk, from its attribute tail. The
// attribute names are the body's, so one stylesheet serves both levels and
// the chunk wins on specificity alone: `.chunk[data-wrap=none]` is two
// classes where `body:not([data-wrap=none])` is one class and one element.
//
// Unlike `.bare` and `.center`, this is emitted by the print renderer too.
// Those two answer where words sit on a slide, which the printed document
// does not ask; these two answer typography, which it asks in the same
// words - and `style.wrap` has reached PRINT_CSS since it landed, so a
// per-chunk form that stopped at the projection would contradict the key it
// is named after.
function chunkStyleAttrs(chunk) {
  const ov = chunk && chunk.styleOverrides;
  if (!ov) return '';
  let out = '';
  if (ov.wrap) out += ` data-wrap="${ov.wrap}"`;
  if (ov.blocks) out += ` data-blocks="${ov.blocks}"`;
  return out;
}

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
    // auto-fit is the one key whose frontmatter word is not its runtime
    // word: the file says true/false/shrink, the runtime carries
    // off/full/shrink, and a boolean cannot hold three states.
    out[stateKey] = stateKey === 'autoFit' ? AUTO_FIT_FROM_KEY[raw] : raw;
  }
  return out;
}
// What the printed views number with. `print-slide-numbers` when the author
// wrote one, and otherwise whatever the live views are set to – so a deck
// that says `slide-numbers: off` prints without numbers too, and one that
// says nothing gets the built-in default in both places.
//
// The deferral is why the key has no default of its own. viewDefaults()
// writes a key only when the frontmatter carried it, so "unset" is a fourth
// state distinguishable from all three values, and this function is the
// documented step that turns it into one. Reading printSlideNums with a
// fallback of SLIDE_NUM_DEFAULT anywhere else would silently drop the
// deferral and make an unset key mean `horizontal` rather than "follow".
function printSlideNums(frontmatter = {}) {
  const d = viewDefaults(frontmatter);
  return d.printSlideNums || d.slideNums || SLIDE_NUM_DEFAULT;
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
    `data-slide-nums="${defaults.slideNums || SLIDE_NUM_DEFAULT}"`,
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

// `subtitle` is the hierarchy step the cover was missing. Without it an
// author has nowhere to put "Prevalence, Techniques, and Implications" but
// the `info` block, where it renders at meta size in soft ink beside the
// room and the date – so the one line that says what the talk is about is
// set exactly like the one that says which conference it is. That is the
// whole of the "hard to read" complaint the variants were asked for.
function renderTitleBlock({ title, subtitle, presenter, info, bodyHtml, bodyIsArt, bodyInField, variant }) {
  // The body stands in for `info` only where the composition has nowhere
  // else to put it. Where it does - as a picture in its own track, or as the
  // lede in a masthead's field - the info lines are still the meta.
  const bodyPlaced = bodyIsArt || bodyInField;
  const infoLines = (bodyHtml && !bodyPlaced)
    ? null // chunk body overrides `info` (PRD §3 rules)
    : splitInfo(info);
  const field = (bodyInField && bodyHtml)
    ? `<div class="title-field">${bodyHtml}</div>` : '';
  // On `quote` the field IS the slide, so it comes first and the title
  // reads as the attribution under it. Source order rather than CSS order:
  // the two are different documents, not one document laid out twice, and a
  // screen reader gets the claim before the name either way.
  const claimFirst = bodyInField && variant === 'quote';
  return `
    ${claimFirst ? field : ''}
    <h1 class="title-main">${escapeHtml(title || '')}</h1>
    ${subtitle ? `<p class="title-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${claimFirst ? '' : field}
    ${presenter ? `<p class="title-presenter">${escapeHtml(presenter)}</p>` : ''}
    ${infoLines
      ? `<div class="title-info">${infoLines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
      : (bodyPlaced ? '' : (bodyHtml || ''))}
  `.trim();
}

// The closing slide. Same three classes as the cover, so every cover
// variant styles it without a second stylesheet - and deliberately two
// fields short of one.
//
// It carries no presenter line and no info block, and that is what keeps
// it from reading as a duplicate of the opening slide. Those two say who
// is talking and where, which the room learned forty minutes ago; setting
// them again in the same composition is a slide that looks like a mistake
// in the deck. What it does carry is the author's own words - the heading
// is the closing line, the sub-heading the second line, the body whatever
// should be left on the screen while the room asks questions. The
// composition is inherited and the content is written, which is the
// division that makes it the same shape without being the same slide.
//
// The heading goes through renderInlineMd, not escapeHtml: it is an
// ordinary chunk heading and code spans work in it the way they do in
// every other one. The cover's title cannot, because it comes from
// frontmatter and is escaped there.
function renderClosingBlock(chunk, bodyHtml) {
  return `
    <h1 class="title-main">${renderInlineMd(chunk.heading || '')}</h1>
    ${chunk.headingSub ? `<p class="title-subtitle">${renderInlineMd(chunk.headingSub)}</p>` : ''}
    ${bodyHtml ? `<div class="closing-body">${bodyHtml}</div>` : ''}
  `.trim();
}

// Which cover the lecture opens with. Validated the way a viewer default
// is – an unknown value fails the build – for the identical reason: a typo
// here is otherwise invisible, because the lecture still builds and still
// looks fine, it just looks like the author never chose anything.
//
// It is deliberately NOT in VIEW_DEFAULT_SPEC. Those keys pin a *reader*
// preference the reader may then override with a key press; a cover is the
// author's composition and no key cycles it.
// The mark over a divider heading. It was a hard-coded PARAGRAPH SIGN, and
// that is a legal-citation mark: it reads as a statute number rather than
// as "section" to anyone outside a German law faculty, and on a projection
// it is a small grey glyph nobody can place. Any short string is allowed,
// because the useful values are a word ("Teil", "Kapitel"), a numeral the
// author writes themselves, or nothing.
function sectionSettings(frontmatter = {}) {
  const raw = frontmatter.section == null ? 'plain' : String(frontmatter.section).trim();
  if (!SECTION_VARIANTS.includes(raw)) {
    const err = new Error(
      `Frontmatter: "section: ${raw}" is not a divider this tool draws.\n` +
      `  Valid values: ${SECTION_VARIANTS.join(', ')}\n` +
      `    plain   the heading alone (the default)\n` +
      `    tinted  the whole slide takes the accent, lightly\n` +
      `    rule    the heading between two rules across the measure\n` +
      `    card    the heading on a panel, like a card\n` +
      `    number  a large counter above the heading`);
    err.userFacing = true;
    throw err;
  }
  // `section-mark: none` is the way to say "no mark at all"; anything else
  // is used verbatim. Absent means none, because the sign that used to be
  // here was one nobody asked for.
  const markRaw = frontmatter['section-mark'];
  const mark = markRaw == null || String(markRaw).trim().toLowerCase() === 'none'
    ? null
    : String(markRaw).trim();
  return { variant: raw, mark };
}

function coverSettings(frontmatter = {}) {
  const raw = frontmatter.cover == null ? 'classic' : String(frontmatter.cover).trim();
  if (!COVER_VARIANTS.includes(raw)) {
    const err = new Error(
      `Frontmatter: "cover: ${raw}" is not a cover this tool draws.\n` +
      `  Valid values: ${COVER_VARIANTS.join(', ')}\n` +
      `    all type:\n` +
      `      classic   the lower-left third (the default)\n` +
      `      masthead  title at the top edge, meta along the bottom\n` +
      `      stack     the block centred on both axes\n` +
      `      display   the title set to fill the slide\n` +
      `      panel     reversed out of a deep accent field\n` +
      `      quote     the title chunk's body set as the claim, title beneath\n` +
      `    with a picture:\n` +
      `      split     type left, cover-image bled off the right edge\n` +
      `      hero      cover-image full bleed, type reversed out of it\n` +
      `      beside    the chunk's own body inset to the right of the title\n` +
      `      above     the chunk's own body on top, title centred below`);
    err.userFacing = true;
    throw err;
  }
  const image = frontmatter['cover-image']
    ? String(frontmatter['cover-image']).trim()
    : null;
  if (image && !COVER_IMAGE_VARIANTS.has(raw)) {
    const err = new Error(
      `Frontmatter: cover-image is set, but "cover: ${raw}" draws no picture of its own.\n` +
      `  It applies to: ${[...COVER_IMAGE_VARIANTS].join(', ')}. To put a photograph\n` +
      '  behind this composition, write ::: backdrop on the title chunk instead.');
    err.userFacing = true;
    throw err;
  }
  if ((raw === 'split' || raw === 'hero') && !image) {
    const err = new Error(
      `Frontmatter: "cover: ${raw}" needs a picture, and no cover-image is set.\n` +
      `  Add e.g.  cover-image: cover-photo   (assets/cover-photo.jpg), a\n` +
      `  relative path, or an https URL – or choose one of the covers that\n` +
      `  needs no picture: classic, masthead, stack, display, panel.`);
    err.userFacing = true;
    throw err;
  }
  // How much of the slide the picture takes. A percentage rather than a
  // W:H ratio, because what an author is setting here is the split of one
  // fixed frame and not the shape of a free-standing figure - the slide's
  // own aspect is the projector's and nobody gets to choose it.
  let ratio = null;
  if (frontmatter['cover-ratio'] != null) {
    const rawR = String(frontmatter['cover-ratio']).trim();
    const n = Number(rawR.replace(/%$/, ''));
    if (!Number.isFinite(n) || n < 15 || n > 75) {
      const err = new Error(
        `Frontmatter: "cover-ratio: ${rawR}" is not a percentage between 15 and 75.\n` +
        `  It is how much of the slide the picture takes: cover-ratio: 42%`);
      err.userFacing = true;
      throw err;
    }
    if (!COVER_RATIO_VARIANTS.has(raw)) {
      // A number the drawing ignores is a silent no-op, which this format
      // refuses everywhere else too.
      const err = new Error(
        `Frontmatter: cover-ratio is set, but "cover: ${raw}" does not divide the slide,\n` +
        `  so there is nothing for it to divide. It applies to: ${[...COVER_RATIO_VARIANTS].join(', ')}`);
      err.userFacing = true;
      throw err;
    }
    ratio = n;
  }
  // Where the type sits on the vertical. Refused where the composition has
  // already answered it, for the same reason cover-ratio is: a key the
  // drawing ignores is a silent no-op.
  let align = null;
  if (frontmatter['cover-align'] != null) {
    const rawA = String(frontmatter['cover-align']).trim();
    if (!COVER_ALIGNS.includes(rawA)) {
      const err = new Error(
        `Frontmatter: "cover-align: ${rawA}" is not a place on the vertical.\n` +
        `  Valid values: ${COVER_ALIGNS.join(', ')}`);
      err.userFacing = true;
      throw err;
    }
    if (!COVER_ALIGN_VARIANTS.has(raw)) {
      const err = new Error(
        `Frontmatter: cover-align is set, but "cover: ${raw}" places its type itself,\n` +
        `  so there is nothing left for it to place. It applies to: ${[...COVER_ALIGN_VARIANTS].join(', ')}`);
      err.userFacing = true;
      throw err;
    }
    align = rawA;
  }
  // The picture on the last slide. Refused on the six compositions that
  // draw no picture of their own, for the same reason cover-image is:
  // read, stored and never looked at again is the silent no-op this format
  // refuses. `::: backdrop` on the closing chunk is the way to put a
  // photograph behind one of those six, and the message says so.
  let closingImage = null;
  if (frontmatter['closing-image'] != null) {
    const rawC = String(frontmatter['closing-image']).trim();
    if (!COVER_IMAGE_VARIANTS.has(raw)) {
      const err = new Error(
        `Frontmatter: closing-image is set, but "cover: ${raw}" draws no picture of its own,\n` +
        `  and the closing slide draws the cover's composition.\n` +
        `  It applies to: ${[...COVER_IMAGE_VARIANTS].join(', ')}. To put a photograph\n` +
        '  behind this composition, write ::: backdrop on the closing chunk instead.');
      err.userFacing = true;
      throw err;
    }
    if (rawC === CLOSING_IMAGE_COVER) {
      // "the one the deck opened with", so there has to be one. On beside
      // and above the cover's picture may be the title chunk's own body -
      // a ::: draw is not a file and cannot be pointed at from here - so
      // the message names both ways out.
      if (!image) {
        const err = new Error(
          `Frontmatter: "closing-image: ${CLOSING_IMAGE_COVER}" ends the deck on the picture it\n` +
          '  opened with, and no cover-image is set.\n' +
          '  Set cover-image, or name the closing slide\'s own picture:\n' +
          '    closing-image: end-photo   (assets/end-photo.jpg), a relative path,\n' +
          '  or an https URL. A ::: draw that is the cover cannot be reached from\n' +
          '  here - repeat it in the closing chunk, or give it a picture of its own.');
        err.userFacing = true;
        throw err;
      }
      closingImage = image;
    } else {
      closingImage = rawC;
    }
  }
  return {
    variant: raw, image, ratio, align, closingImage,
    bodyIsArt: COVER_BODY_ART.has(raw),
    bodyInField: COVER_BODY_FIELD.has(raw),
    bodyRequired: COVER_BODY_REQUIRED.has(raw),
  };
}

// The picture half of a closing slide, which is the cover's own function
// with two substitutions: the closing slide's picture, and no body. A
// closing chunk's body is its words - `## closing:` is the one cover-shaped
// slide whose text is authored - so the beside/above rule that makes a
// chunk body the art cannot apply here, and turning it off is what keeps
// the four picture compositions drawing a picture rather than a paragraph.
function renderClosingArt(cover) {
  if (!cover.closingImage) return { html: '', scrim: null };
  return renderCoverArt({ ...cover, image: cover.closingImage, bodyIsArt: false }, '');
}

// The picture half of a cover. `hero` reuses the ::: backdrop machinery
// verbatim rather than growing a second full-bleed path: a hero cover IS a
// chunk with a backdrop, and saying so in one line is what keeps the two
// from drifting. `split` is its own element, because a half-bleed panel is
// a grid track and not a background.
function renderCoverArt(cover, bodyHtml = '') {
  // beside / above take their art from the chunk's own body, so a ::: draw
  // can be the picture. A diagram is not a file and cover-image can never
  // name one; cover-image still works on these two as the fallback, which
  // is why the body is only preferred when there is one.
  if (cover.bodyIsArt && String(bodyHtml).trim()) {
    return { html: `<div class="cover-art cover-art-body">${bodyHtml}</div>`, scrim: null };
  }
  if (!cover.image) {
    if (cover.bodyIsArt) {
      const err = new Error(
        `Frontmatter: "cover: ${cover.variant}" draws a picture beside the title, and the\n` +
        `  title chunk has neither a body nor a cover-image.\n` +
        `  Put a ::: draw block (or an image) in the title chunk's body, or set cover-image.`);
      err.userFacing = true;
      throw err;
    }
    return { html: '', scrim: null };
  }
  if (cover.variant === 'hero') {
    return renderBackdrop({ ref: cover.image, attrs: '.invert' }, 'the cover');
  }
  if (cover.variant === 'split' || cover.variant === 'beside' || cover.variant === 'above') {
    const url = resolveAssetUrl(cover.image);
    if (!url) {
      const err = new Error(
        `Frontmatter: cover-image "${cover.image}" resolves to no file.\n` +
        `  It takes the same three forms an image does: a bare asset id\n` +
        `  (assets/${cover.image}.{${IMG_EXTS.join(',')}}), a relative path, or an https URL.`);
      err.userFacing = true;
      throw err;
    }
    return {
      html: `<div class="cover-art" style="background-image:url(&quot;${escapeHtml(url)}&quot;)" aria-hidden="true"></div>`,
      scrim: null,
    };
  }
  return { html: '', scrim: null };
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
  // An `outline:` chunk is an ordinary chunk whose body ends with the list,
  // and that is the whole of it. Rendering it through a shell of its own
  // dropped five things the ordinary path reads - its speaker notes, its
  // annotation, its expansions, its backdrop and its overlays - and dropped
  // them without a word, because nothing downstream knew they had been
  // written. Appending the list is one line and inherits all of it.
  const bodyHtml = (body ? marked.parse(body) : '')
    + (tag === 'outline' ? renderOutlineList(opts.parts || [], opts.partNo || 0) : '');

  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
  const numAttr = num ? ` data-chunk-num="${num}"` : '';
  const numHtml = renderChunkNumBadge(num, 'span');

  if (tag === 'title' || tag === 'closing') {
    // Title chunk's heading text and sub-heading are intentionally ignored:
    // the cover renders from frontmatter (`title`, `presenter`, `info`) so
    // there's a single source of truth. Authors write `## title: {#title}`
    // with an empty heading by convention; the body, if non-empty, overrides
    // the `info` lines (PRD §3, §4.4). A `closing:` chunk is the opposite
    // and has to be: it is the one cover-shaped slide whose words are its
    // own, so its heading is what it says.
    const closing = tag === 'closing';
    const where = closing ? 'the closing chunk' : 'the title chunk';
    const cover = coverSettings(frontmatter);
    const own = renderBackdrop(chunk.backdrop, where);
    const art = own.html ? own : (closing ? renderClosingArt(cover) : renderCoverArt(cover, bodyHtml));
    const scrimAttr = art.scrim && art.scrim !== 'veil' ? ` data-backdrop="${art.scrim}"` : '';
    const bdAttr = art.html ? ' data-has-backdrop=""' : '';
    const closingAttr = closing ? ' data-closing=""' : '';
    return `<article class="chunk chunk-title" data-cover="${cover.variant}"${closingAttr}${bdAttr}${scrimAttr}${chunkStyleAttrs(chunk)}${numAttr}${idAttr}>
  ${art.html}
  ${numHtml}
  ${closing
    ? renderClosingBlock(chunk, bodyHtml)
    : renderTitleBlock({ ...frontmatter, bodyHtml, bodyIsArt: cover.bodyIsArt, bodyInField: cover.bodyInField, variant: cover.variant })}
  ${renderOverlayLayer(chunk.overlays, where)}
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

  // Print is a document, not a slide: a backdrop becomes a banner band at
  // the head of the chunk and an overlay an ordinary block under it. Both
  // keep their ground classes, so an `ink` card still reads as an inverted
  // card on the page – the composition is what the paper cannot have, not
  // the treatment.
  const where = id ? `chunk #${id}` : `chunk "${chunk.heading || 'untitled'}"`;
  const bd = renderBackdrop(chunk.backdrop, where);
  const overlayHtml = renderOverlayLayer(chunk.overlays, where);
  const scrimAttr = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdAttr = bd.html ? ' data-has-backdrop=""' : '';

  return `<article class="${classes}"${idAttr}${numAttr}${bdAttr}${scrimAttr}${chunkStyleAttrs(chunk)}>
  ${bd.html}
  ${numHtml}
  ${label}
  ${renderHeadingHtml(chunk)}
  ${bodyHtml}
  ${overlayHtml}
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
  // A divider does not print - it is an auto-inserted camera stop - but what
  // the author wrote under the heading does, because that is content and not
  // a stop. It lands under the column heading, where a lede belongs; the
  // picture becomes the same banner band a chunk's backdrop becomes, print
  // being a document rather than a slide.
  const lede = (col.body || '').trim()
    ? `<div class="column-lede">${unwrapLoneFigure(marked.parse(col.body))}</div>` : '';
  const bd = renderBackdrop(col.backdrop, `the divider for "${col.heading}"`);
  // The same two attributes a chunk's backdrop puts on its article. Nothing
  // in PRINT_CSS keys on them today, which is exactly why they were missing -
  // and exactly why a scrim rule added later would have reached every chunk
  // and silently skipped every divider.
  const bdScrim = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdHas = bd.html ? ' data-has-backdrop=""' : '';
  return `<section class="column"${idAttr}${bdHas}${bdScrim}>
  <h1 class="column-heading">${escapeHtml(col.heading)}</h1>
  ${bd.html}
  ${lede}
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

// Print goes further: it ships no JavaScript at all, so the step frames and
// the editor's source payload are dead weight beside the asset table – no
// consumer ever reads them there. Measured on lectures/network-security
// before this existed: 346 KB of a 1.26 MB print file, all of it JSON that
// nothing would ever parse.
// A backdrop's reveal is a window on to a slide-sized picture, and on paper
// there is no such picture: print turns a backdrop into a banner band at the
// head of the chunk. Left in, the opening beat's inset cropped that banner -
// `reveal right 45%` printed the right 45% of a strip, a geometry that means
// nothing where it landed. Stripped here rather than branched at the emitter
// because renderBackdrop has five call sites and this is the pass that
// already removes what print has no runtime for.
function stripBackdropFrames(html) {
  return html
    .replace(/ data-bd-frames="[^"]*"/g, '')
    .replace(/(<div class="chunk-backdrop[^>]*style="[^"]*?);clip-path:[^";]*(")/g, '$1$2');
}
function stripDiagramPayloads(html) {
  return stripDiagramAssets(html).replace(
    /<script type="application\/json" class="psi-diagram-(?:frames|source)"[^>]*>[^<]*<\/script>/g, '');
}

// Shiki emits both palettes on every token: the light one as the inline
// color, the dark one as a --shiki-dark custom property beside it. Print
// has no themes at all – no data-theme, no theme cycle, no stylesheet that
// reads the variable – so in print that second colour is a few bytes per
// token that nothing can ever consume. Measured on lectures/python-intro,
// the code-heaviest lecture in the repo: 23 KB of a 525 KB print file.
// Rewrites only the inside of a start tag, so a code fence that happens to
// quote the property name is text content and stays untouched.
function stripDarkTokenColors(html) {
  return html.replace(/<(?:pre|span)\b[^>]*>/g, tag => tag
    .replace(/--shiki-dark(?:-bg)?:#[0-9a-fA-F]{3,8};?/g, '')
    .replace(/style="([^"]*);"/, 'style="$1"'));
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
  const forPrint = (html) => stripDarkTokenColors(stripDiagramPayloads(stripBackdropFrames(html)));
  // The parts a lecture has, and which one each column is, threaded through
  // so an `outline:` chunk can list them. Print reorders the columns (anon
  // first, named after), so the part number has to ride with the column
  // rather than being counted here.
  const parts = lectureParts(columns);
  const partNoOf = new Map();
  { let n = 0; for (const c of columns) if (c.heading) partNoOf.set(c, ++n); }
  const colOpts = (c) => ({ ...chunkOpts, parts, partNo: partNoOf.get(c) || 0 });
  const anonHtml = forPrint(columns.filter(c => !c.heading)
    .map(c => renderColumn(c, frontmatter, nextNum, colOpts(c))).join('\n'));
  const namedHtml = forPrint(columns.filter(c => c.heading)
    .map(c => renderColumn(c, frontmatter, nextNum, colOpts(c))).join('\n'));

  const titleSuffix = opts.withNotes ? 'print + notes' : 'print';
  // Print has no keyboard, so the frontmatter is its only say over the
  // slide-number markers. The other viewer defaults are live-view concepts
  // (collapse, auto-fit) or already fixed here (print has its own type).
  // A document is read at arm's length and a projection across a room, so
  // the two can want different markers – `print-slide-numbers` says so, and
  // says nothing by following the live key.
  const printNums = printSlideNums(frontmatter);
  const styleOpts = styleSettings(frontmatter);
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
${styleBlockCss(styleOpts)}
${katexStyleTag(anonHtml + namedHtml)}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body data-slide-nums="${printNums}" ${styleBodyAttrs(styleOpts, frontmatter)}>
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
  --heading-scale: 1;
  --body-scale: 1;
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
  --sans: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;
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
/* style: {print-body: sans}. One declaration on <body> is the whole switch:
   it beats what body inherits from html, and everything below that should
   stay a sans or a mono names its own family already, so only what actually
   inherited the serif moves - the running text, the chunk and column
   headings, a blockquote. The page number in @page is outside the document
   tree and was never the serif. */
body[data-print-body=sans] { font-family: var(--sans); }

main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; }

h1, h2, h3 { font-weight: 500; letter-spacing: -0.01em; break-after: avoid; page-break-after: avoid; }
/* A heading is a phrase, so a greedy line breaker leaving one word alone on
   the second line is always wrong; balance evens the lines instead. Prose is
   not balanced - a paragraph wants its measure kept and only its last line
   protected, which is what pretty does. Both degrade to nothing where the
   browser does not know the value, so neither needs a fallback. */
/* Balanced headings and protected last lines. Landed after 1.0.0, and it
   moves where lines break in a finished deck - so layout: 1.0 turns it
   off rather than leaving an old lecture to re-wrap under its author. */
body:not([data-wrap=none]) :is(h1, h2, h3, h4, .chunk-heading, .hd-sub, .section-heading, figcaption) { text-wrap: balance; }
body:not([data-wrap=none]) :is(p, li, dd) { text-wrap: pretty; }
/* The same question answered on one chunk, from a .wrap-none / .wrap-balance
   in its attribute tail. Both directions, because under a deck-wide
   wrap: none the only way left to ask for balancing is to ask for it here.
   text-wrap: wrap is the initial value of the shorthand, so the off switch hands the
   line back to the browser's plain greedy breaker rather than naming a third
   behaviour. Written as one rule per direction with the whole family inside
   an :is(), which is also what keeps the off switch specific enough to beat
   the two rules above it. */
.chunk[data-wrap=none] :is(h1, h2, h3, h4, .chunk-heading, .hd-sub, .section-heading, figcaption, p, li, dd) { text-wrap: wrap; }
.chunk[data-wrap=balance] :is(h1, h2, h3, h4, .chunk-heading, .hd-sub, .section-heading, figcaption) { text-wrap: balance; }
.chunk[data-wrap=balance] :is(p, li, dd) { text-wrap: pretty; }
p { margin: 0.4em 0 0.9em; orphans: 3; widows: 3; }

/* Hyphenation. On here by default and off in the live views by default:
   a hyphenated word on a projection reads badly, and the live views reflow
   constantly anyway. style.hyphenate is the author's say over both halves –
   none takes it out of the document too, all puts it into the projection,
   and the wrapper below is what makes the first of those reachable.
   The browser picks its dictionary from the lang attribute on html, which
   comes from the frontmatter lang key – so this does nothing useful for a
   German lecture until the author sets lang: de, and German is exactly the
   case where a 42rem measure needs it most.
   Limited to prose: hyphenating an identifier in code, a heading, or a URL
   would be actively wrong, and the hyphens property is inherited.
   (No backticks in this comment: one would end the template literal.) */
body:not([data-hyphenate=none]) :is(p, li, blockquote, figcaption, .speaker-note) {
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
/* style.print-bold - the look of a bold the derivation reads, default bold
   in the ink. See BOLD_LOOKS and DERIVED_STRONG. A bold outside that scope -
   a row's term, a tight list's item, a card's lead - keeps the rule above. */
${boldLookCss('print-bold', 'bold', '600')}

ul, ol { margin: 0.4em 0 0.9em 1.4em; }
li { margin: 0.2em 0; orphans: 2; widows: 2; }
li > p:first-child { margin-top: 0; }
li > p:last-child { margin-bottom: 0.3em; }

code { font-family: var(--mono); font-size: 0.92em; }
/* Set by the codespan renderer on a span with no space in it – see the note
   there. Keeps a three-hyphen separator, or an arrow token, from being split
   across a line break. No backtick in this comment: PRINT_CSS is a template
   literal and one would end it. */
code.nb { white-space: nowrap; }
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
/* A monospaced face with programming ligatures – JetBrains Mono, the
   bundled one, is such a face – draws the two characters -> as a single
   arrow glyph, and <-, <->, --, != and :: the same way. A listing is source
   a reader retypes, so the characters have to be the characters. The value
   is none and not no-contextual: the arrows live in the contextual set
   (calt) and the rest in liga, and only none covers both. No backtick in
   this comment, escaped or otherwise – see the template-literal rule in
   CLAUDE.md. */
/* Ligature policy, from the ligatures: frontmatter key. "text" is the
   default and is what this rule always did: none in code, ordinary fi and
   fl in prose. "all" puts the code ligatures back - JetBrains Mono draws
   "->" as one arrow glyph, which is pleasant in an editor and wrong on a
   slide, where the listing is source a reader is meant to retype. "none"
   takes them out of prose as well. */
body:not([data-liga=all]) code,
body:not([data-liga=all]) pre,
body:not([data-liga=all]) kbd,
body:not([data-liga=all]) samp { font-variant-ligatures: none; }
body[data-liga=none] { font-variant-ligatures: none; }

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
/* The agenda on paper. An outline: chunk is a slide the author wrote, so
   it prints - unlike a section divider, which is an auto-inserted camera
   stop and has never printed. Same markup, same grid, and the live item is
   still marked, because "we are here" is as true in a hand-out as on a
   projection; only the scale steps back, since a document is read at
   arm's length rather than from the back of a room. */
.section-outline {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 0.5rem;
  row-gap: 0.32rem;
  line-height: 1.25;
}
.section-outline li { display: contents; }
.so-num {
  font-family: var(--sans-font);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  text-align: right;
  color: var(--ink-soft);
}
.section-outline li[data-state=done] .so-text,
.section-outline li[data-state=next] .so-text { color: var(--ink-soft); }
.section-outline li[data-state=now] { font-size: 1.22em; }
.section-outline li[data-state=now] .so-text { font-weight: 600; }
.chunk-outline { break-inside: avoid; page-break-inside: avoid; }
/* What the author wrote under a column heading. The divider slide itself is
   an audience-only camera stop; these are the author's own words and they
   belong in the document, set as a lede under the part title. */
.column-lede {
  margin: -0.9rem 0 1.8rem;
  max-width: 34rem;
  color: var(--ink-soft);
}
.column-lede blockquote {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.2rem;
  line-height: 1.35;
  color: var(--ink);
}
.column-lede > :first-child { margin-top: 0; }
.column-lede > :last-child { margin-bottom: 0; }

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
  font-size: calc(1.12rem * var(--heading-scale));
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

/* The style: frontmatter block, on paper. Same two selectors as the live
   views; the two scales ride on custom properties emitted per build. */
body[data-headings=left] .chunk-heading,
body[data-headings=left] .title-main { text-align: left; }
body[data-headings=center] .chunk-heading { text-align: center; }

body[data-rules=off] .chunk-principle,
body[data-rules=off] .chunk-definition { border-top: 0; }
/* The document view labels every tagged chunk, which is where most of
   these eyebrows actually live - the projection generates only EXERCISE. */
/* The link mark is a control, and a control on paper is a smudge: there is
   nothing to click and nothing to scan. Note what this does not do - the
   document does not print the address either, so a link in a handout is a
   phrase whose target the reader cannot reach. That is how it has always
   been here; printing every href would change every existing handout, and it
   is a separate decision from making the code findable on screen. */
.link-code { display: none; }

body[data-labels=off] .chunk-label { display: none; }

/* style.blocks, on paper. Two of the three families it reaches exist here -
   a figure with its caption and a display formula - and the third does not:
   a code block in the document sits inside the 42rem measure with nothing to
   break out of, so it is already flush with the prose and there is nothing
   for left to move.

   It reaches print at all because block alignment is typography rather than
   stagecraft. The .bare and .center classes stop at the projection because where
   words sit on a slide is not a question a printed page asks; where a
   formula sits relative to the paragraph that introduced it is the same
   question on both, and style.wrap - the other key the chunk classes
   mirror - has been in this stylesheet since it landed. */
body[data-blocks=left] figure.figure-img,
body[data-blocks=left] figure.figure-video,
body[data-blocks=left] figure.figure-embed,
.chunk[data-blocks=left] figure.figure-img,
.chunk[data-blocks=left] figure.figure-video,
.chunk[data-blocks=left] figure.figure-embed { text-align: left; }
body[data-blocks=left] .math-display .katex-display,
body[data-blocks=left] .math-display .katex-display > .katex,
.chunk[data-blocks=left] .math-display .katex-display,
.chunk[data-blocks=left] .math-display .katex-display > .katex { text-align: left; }
/* And back, for one chunk in a document that set blocks: left. */
.chunk[data-blocks=center] figure.figure-img,
.chunk[data-blocks=center] figure.figure-video,
.chunk[data-blocks=center] figure.figure-embed { text-align: center; }
.chunk[data-blocks=center] .math-display .katex-display,
.chunk[data-blocks=center] .math-display .katex-display > .katex { text-align: center; }

/* Cover, backdrop, overlay and card grid in the document view. Print is a
   document, not a slide: composition over a picture is the one thing paper
   cannot have, so the backdrop becomes a banner band at the head of the
   chunk and an overlay an ordinary block under it. The treatments survive
   (an ink card is still an inverted card on the page); only the placement
   is dropped, because there is nothing to place it over. */
.chunk-title .title-subtitle {
  font-size: 1.35rem;
  line-height: 1.3;
  color: var(--ink-soft);
  margin: -0.35rem 0 0.9rem;
  max-width: 28em;
}
/* On paper a cover is a masthead whatever variant the projection uses:
   the compositions above are all answers to "how does this fill a 16:9
   frame", and a page is neither 16:9 nor a thing anybody projects. Two of
   them survive because they are treatments rather than placements - the
   reversed field, and the title at display size. */
.chunk-title[data-cover=panel] {
  background: color-mix(in oklab, var(--emph) 62%, var(--ink));
  border-bottom: 0;
  padding: 1.6rem 1.4rem;
  color: var(--paper);
}
.chunk-title[data-cover=panel] .title-main,
.chunk-title[data-cover=panel] .title-presenter { color: var(--paper); }
.chunk-title[data-cover=panel] .title-subtitle,
.chunk-title[data-cover=panel] .title-info p,
.chunk-title[data-cover=panel] .closing-body {
  color: color-mix(in oklch, var(--paper) 78%, transparent);
}
.chunk-title[data-cover=display] .title-main {
  font-size: 3.6rem;
  line-height: 1.02;
  letter-spacing: -0.03em;
  max-width: 11em;
}

/* The closing slide is a page like the cover is a page, and it carries the
   same rule under it that every other chunk does - it is the last thing in
   the document rather than the first, so a page break *after* it would be
   a blank sheet. */
.chunk-title[data-closing] {
  page-break-after: auto;
  page-break-before: always;
}
.chunk-title[data-closing] .closing-body {
  font-size: 1rem;
  line-height: 1.55;
  color: var(--ink-soft);
  max-width: 34em;
}
.chunk-title[data-closing] .closing-body > :first-child { margin-top: 0; }
/* Both selectors above weigh the same, and this one is written last in
   the file, so on paper the panel's reversed body lost to the soft ink and
   the closing slide's text came out grey on a brown plate. The live
   stylesheet happens to order the two the other way round and was correct
   by luck. Naming both attributes settles it by specificity instead. */
.chunk-title[data-cover=panel][data-closing] .closing-body {
  color: color-mix(in oklch, var(--paper) 78%, transparent);
}
.chunk-title .cover-art {
  width: 100%;
  aspect-ratio: 16 / 6;
  background-size: cover;
  background-position: center;
  border-radius: 3px;
  margin-bottom: 1.4rem;
  order: -1;
}
/* A divider's picture is emitted inside its <section class="column">, not
   inside a .chunk, so a selector scoped to .chunk left it with no height and
   no background-size - the author wrote a picture for the part opener and
   the paper showed nothing. Both hosts, one rule. */
:is(.chunk, .column) > .chunk-backdrop {
  width: 100%;
  aspect-ratio: 16 / 7;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 3px;
  margin: 0 0 1rem;
  display: block;
}
:is(.chunk, .column) > .chunk-backdrop.bd-contain { background-size: contain; background-color: color-mix(in oklch, var(--ink) 6%, transparent); }
:is(.chunk, .column) > .chunk-backdrop.bd-top { background-position: center top; }
:is(.chunk, .column) > .chunk-backdrop.bd-bottom { background-position: center bottom; }
.overlay-layer { display: block; margin: 0.9rem 0; }
.overlay-card {
  padding: 0.75rem 0.95rem;
  border-radius: 5px;
  margin: 0 0 0.7rem;
  max-width: 34em;
}
.overlay-card > :first-child { margin-top: 0; }
.overlay-card > :last-child { margin-bottom: 0; }
.overlay-card.ov-paper  { background: color-mix(in oklch, var(--ink) 4%, transparent); border: 1px solid var(--rule); }
.overlay-card.ov-glass  { background: color-mix(in oklch, var(--ink) 4%, transparent); border: 1px solid var(--rule); }
.overlay-card.ov-ink    { background: #1b1b20; color: #fff; }
.overlay-card.ov-ink a  { color: #fff; }
.overlay-card.ov-accent { background: var(--emph); color: #fff; }
.overlay-card.ov-clear  { padding: 0; background: none; border: 0; }
.cards {
  display: grid;
  grid-template-columns: repeat(var(--card-n), minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0.9rem 0;
}
.cards-1 { --card-n: 1; }
.cards-2 { --card-n: 2; }
.cards-3 { --card-n: 3; }
.cards-4 { --card-n: 4; }
.cards-5 { --card-n: 5; }
.cards-6 { --card-n: 6; }
.cards > ul, .cards > ol { display: contents; }
.cards > ul > li, .cards > ol > li, .cards > :not(ul):not(ol) {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  list-style: none;
  break-inside: avoid;
  font-size: calc(1em * var(--card-fs, 1));
  text-align: var(--card-align, left);
}
/* The document is read at the reader's own pace, so the size difference is
   damped: on paper a row of single words at 1.4x is shouting. The
   alignment is kept, because that is composition rather than emphasis. */
.cards.cs-large  { --card-fs: 1.15; }
.cards.cs-medium { --card-fs: 1; }
.cards.cs-small  { --card-fs: 0.92; }
.cards.ca-left   { --card-align: left; }
.cards.ca-center { --card-align: center; }
/* The five grounds on paper. accent and paper are the two that carry a
   real fill, so they are the two the reader's printer will actually be
   asked for; the rest stay hairlines, which is the right default for a
   document that may be printed in black and white. */
.cards.cg-panel > ul > li, .cards.cg-panel > ol > li, .cards.cg-panel > :not(ul):not(ol) {
  background: color-mix(in oklch, var(--ink) 4%, transparent); border-color: transparent;
}
.cards.cg-clear > ul > li, .cards.cg-clear > ol > li, .cards.cg-clear > :not(ul):not(ol) {
  border: 0; padding-left: 0; padding-right: 0;
}
.cards.cg-accent > ul > li, .cards.cg-accent > ol > li, .cards.cg-accent > :not(ul):not(ol) {
  background: var(--emph); color: #fff; border-color: transparent;
}
.cards.cg-paper > ul > li, .cards.cg-paper > ol > li, .cards.cg-paper > :not(ul):not(ol) {
  background: #fff;
}
.cards.ck-square > ul > li, .cards.ck-square > ol > li, .cards.ck-square > :not(ul):not(ol) { border-radius: 0; }
/* No data-collapse in a document, so the second level is always here -
   which is the point of writing one. */
.cards li ul, .cards li ol {
  margin: 0.3rem 0 0;
  padding-left: 1.05em;
  list-style: disc;
  font-size: 0.9em;
  color: var(--ink-soft);
  text-align: left;
}
.cards li li { display: list-item; }
.cards > ul > li::marker, .cards > ol > li::marker { content: none; }
.cards li > :first-child { margin-top: 0; }
.cards li > :last-child { margin-bottom: 0; }

/* ::: rows on paper. The emitter writes a row as a strong element holding
   the term followed immediately by span.row-body holding the body, with no
   separator between them, because in the live views the span is a grid item
   and a separator would be a stray anonymous item in the same grid. That
   made the span's placement load-bearing – and it existed only in
   AUDIENCE_CSS, so on paper the two ran together and every row in every
   lecture read "§ 202aObtaining specially protected data…".
   (No backticks in this comment: one would end the template literal.)

   The fix is a grid here too, but a smaller one than the live view's: the
   li keeps its box, so its border, padding and break-inside: avoid all
   still do their jobs and a row cannot be split across a page. Only the
   inside of the row becomes two columns. Baseline rather than the live
   view's centre, because a document is read line by line and a term
   hanging half a line above its first word reads as a mistake on paper. */
.cards.rows > ul > li, .cards.rows > ol > li {
  display: grid;
  grid-template-columns: minmax(5.5em, 0.3fr) minmax(0, 1fr);
  column-gap: 0.9em;
  align-items: baseline;
}
.cards.rows li > :is(strong, b):first-child { grid-column: 1; }
.cards.rows li > .row-body { grid-column: 2; text-align: left; min-width: 0; }
/* A markdown line break between the term and its body would otherwise be a
   third item in the two-column grid and push the body onto its own row. */
.cards.rows li > br { display: none; }
/* The detail level under a row belongs beside the body, not under the term. */
.cards.rows li > :is(ul, ol) { grid-column: 2; }

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

// A cover that draws the title chunk's body needs one. Checked here, beside
// assertInlinable and collectEmbeddedFonts, and not in the renderer that
// happens to need it: as a renderer check it fired after print.html and
// print-notes.html were already on disk, and --print-only never reached it
// at all, so an invalid deck built clean. Same contract as the two above -
// a failed build leaves no half-written artefact.
function assertCoverBody(lecture) {
  // Every frontmatter key that can refuse a deck is resolved here, not where
  // a renderer happens to need it. `section:` was read only while rendering a
  // live divider, so `section: bogus` built print.html and print-notes.html
  // and then threw - the half-written artefact this pre-flight exists to
  // prevent - and --print-only never reached it at all.
  sectionSettings(lecture.frontmatter);
  const cover = coverSettings(lecture.frontmatter);
  // A picture for a slide the deck does not have. The key reads and stores
  // fine and nothing ever draws it, which is the silent no-op every other
  // frontmatter key here is refused for - and this is the only place that
  // can see it, because whether a lecture ends on a `## closing:` chunk is
  // a fact about the body and not about the frontmatter.
  if (cover.closingImage &&
      !lecture.columns.some(c => c.chunks.some(k => k.tag === 'closing'))) {
    const err = new Error(
      'Frontmatter: closing-image is set, and the lecture has no `## closing:` chunk\n' +
      '  for it to draw on. Add one - a closing chunk carries its own heading, which\n' +
      '  is what it says:  ## closing: Questions? {#end}');
    err.userFacing = true;
    throw err;
  }
  if (!cover.bodyRequired) return;
  const title = lecture.columns
    .flatMap(c => c.chunks).find(c => c.tag === 'title');
  // Comments are stripped before the test: `<!-- nothing to say -->` survives
  // a trim and produced exactly the composition this refuses - a quote cover
  // with an empty quotation.
  const said = (title ? (title.body || '') : '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (said) return;
  const err = new Error(
    `Frontmatter: "cover: ${cover.variant}" sets the title chunk's body as the claim,\n` +
    `  and the title chunk has no body. Write the sentence the talk opens on\n` +
    '  under `## title:`, or choose a cover that needs no body.');
  err.userFacing = true;
  throw err;
}

function renderTitleChunk(chunk, frontmatter, num) {
  const closing = chunk.tag === 'closing';
  const where = closing ? 'the closing chunk' : 'the title chunk';
  const idAttr = chunk.id ? ` id="${escapeHtml(chunk.id)}"` : '';
  const chunkId = chunk.id || (closing ? 'closing' : 'title');
  const bodyHtml = (chunk.body || '').trim() ? marked.parse(chunk.body) : '';
  const numAttr = num ? ` data-chunk-num="${num}"` : '';
  const numHtml = renderChunkNumBadge(num, 'div');
  const cover = coverSettings(frontmatter);
  // A backdrop the author wrote on the title chunk itself wins over the
  // one the cover variant would build, so `cover: classic` plus a
  // ::: backdrop is a picture cover without a variant for it.
  const own = renderBackdrop(chunk.backdrop, where);
  // A closing slide never reaches for `cover-image` by itself: that is the
  // cover's picture, and re-running it unasked is precisely the repeat this
  // slide exists not to be. `closing-image:` is the author asking for it -
  // either the same file (`closing-image: cover`) or a different one - and
  // it draws into the same slot through the same function. Its own
  // ::: backdrop still wins over both, exactly as it does on the cover.
  const art = own.html ? own : (closing ? renderClosingArt(cover) : renderCoverArt(cover, bodyHtml));
  const scrimAttr = art.scrim && art.scrim !== 'veil' ? ` data-backdrop="${art.scrim}"` : '';
  const bdAttr = art.html ? ' data-has-backdrop=""' : '';
  // Whether the closing slide has a picture in the composition's own slot,
  // which is what decides between drawing that track and collapsing it. The
  // attribute is the fact and the missing element is only a symptom of it -
  // the same reasoning that keyed the collapse rules on data-closing. A
  // ::: backdrop is deliberately not it: that is a full-bleed ground behind
  // the type, the track it would have filled is still empty, and the slide
  // still wants it collapsed.
  const closingArt = closing && !own.html && art.html;
  const closingArtAttr = closingArt ? ' data-closing-art=""' : '';
  // The ratio divides a slide for a picture, so it follows the picture: a
  // closing slide without one has nothing to divide, and one with a
  // closing-image must divide the frame exactly as the cover did or the
  // bookend is a different composition wearing the same name.
  const ratioStyle = (cover.ratio && (!closing || closingArt)) ? ` style="--cover-ratio:${cover.ratio}%"` : '';
  // The closing slide takes the placement whether or not it has a picture.
  // It is where the type sits, and a deck whose cover puts its title in the
  // lower third and whose last slide centres it has not closed the arc it
  // opened.
  const alignAttr = cover.align ? ` data-cover-align="${cover.align}"` : '';
  const closingAttr = closing ? ' data-closing=""' : '';
  const block = closing
    ? renderClosingBlock(chunk, bodyHtml)
    : renderTitleBlock({ ...frontmatter, bodyHtml, bodyIsArt: cover.bodyIsArt, bodyInField: cover.bodyInField, variant: cover.variant });
  return `<article class="chunk chunk-title" data-tag="${closing ? 'closing' : 'title'}" data-width="full" data-cover="${cover.variant}"${closingAttr}${closingArtAttr}${alignAttr}${bdAttr}${scrimAttr}${chunkStyleAttrs(chunk)} data-chunk-id="${escapeHtml(chunkId)}"${numAttr}${idAttr}${ratioStyle}>
  ${art.html}
  <div class="chunk-content">
    ${block}
  </div>
  ${renderOverlayLayer(chunk.overlays, where)}
  ${numHtml}
</article>`;
}

function renderAudienceChunk(chunk, frontmatter, colIdx, chunkIdx, num, parts = [], now = 0) {
  if (chunk.tag === 'title' || chunk.tag === 'closing') return renderTitleChunk(chunk, frontmatter, num);
  const { tag, heading, id, width, expansions = [], annotation = '' } = chunk;
  // Same rule as the document renderer: the list is the end of the body, so
  // an outline chunk goes through the ordinary path and keeps its notes, its
  // annotation box, its expansions, its backdrop and its overlays.
  const segments = tag === 'outline'
    ? (() => {
        const s = (chunk.segments || []).slice();
        const list = renderOutlineList(parts, now);
        if (s.length) s[s.length - 1] += '\n\n' + list;
        else s.push(list);
        return s;
      })()
    : (chunk.segments || []);
  const chunkId = id || `c${colIdx}-${chunkIdx}`;
  // `.bare` takes the heading off the *slide* and nowhere else. It is an
  // attribute rather than a dropped element on purpose: the TOC, the search
  // index and the speaker's own lists all read the heading's text out of the
  // DOM, and every one of them should keep working. Emitted only here -
  // print has no slide to take it off.
  const bareAttr = chunk.bare ? ' data-bare=""' : '';
  // `.center` sets the chunk's prose on a centre axis, and like `.bare` it is
  // a decision about the *slide*: it is emitted here and nowhere else, so the
  // printed document keeps its left edge. A run of centred prose is hard to
  // read - the eye loses the start of each line - which is exactly why this
  // is a class an author writes rather than a treatment a tag carries. The
  // case it is for is the one or two lines under a figure, where left-aligned
  // prose starts at the far edge of a wide slide while the drawing sits in
  // the middle and the two read as unrelated blocks.
  const centerAttr = chunk.center ? ' data-center=""' : '';
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

  const where = id ? `chunk #${id}` : `chunk "${heading || chunkId}"`;
  const bd = renderBackdrop(chunk.backdrop, where);
  const overlayHtml = renderOverlayLayer(chunk.overlays, where);
  const scrimAttr = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdAttr = bd.html ? ' data-has-backdrop=""' : '';

  return `<article class="${classes}"${idAttr} data-chunk-id="${escapeHtml(chunkId)}"${tagAttr}${widthAttr}${bareAttr}${centerAttr}${chunkStyleAttrs(chunk)}${numAttr}${bdAttr}${scrimAttr}>
  ${bd.html}
  <div class="chunk-content">
    ${tagLabel}
    ${headingHtml}
    <div class="chunk-body">${segmentsHtml}</div>
    ${marginsHtml}
    <aside class="annot-box" data-annot-for="${escapeHtml(chunkId)}">
      <div class="annot-box-label">annotation · ${escapeHtml(chunkId)}</div>
      <textarea class="annot-textarea" placeholder="Note… (Enter for newline, Esc to exit)" rows="1">${escapeHtml(annotation)}</textarea>
    </aside>
  </div>
  <button class="annot-add" type="button" data-annot-add>+ note</button>
  ${overlayHtml}
  ${chevsHtml}
  ${expBodiesHtml}
  ${numHtml}
</article>`;
}

// A column with `# Heading {#id}` opens with a section-divider slide so
// the audience/speaker camera lands on the heading before the first
// chunk. Print already renders col.heading as a static `<h1>`; here we
// need it as its own `.chunk` so flatChunks (the navigator) sees it.
//
// `parts` is the list of every headed column, which only `outline` reads.
// It is passed rather than looked up because renderColumnsHtml is already
// walking the columns and already counting the headed ones for `number` -
// a second walk would be a second definition of "which columns are parts",
// and the two would disagree the first time the rule changed.
// What a lecture's parts are, in one place. `section: outline` and the
// `outline:` chunk both list them and both have to list the same set in the
// same order, or a deck says "part 3 of 5" on one slide and "3 of 6" on the
// next. It is the columns that carry a heading - the anonymous opening
// column, which holds the title chunk, is not a part anybody is counting.
function lectureParts(columns) {
  const out = [];
  for (const col of columns) if (col.heading) out.push({ no: out.length + 1, heading: col.heading });
  return out;
}
// The list itself, shared by the divider and the chunk. `now` is the part
// the reader is inside, or 0 for an agenda that sits before any of them -
// and 0 is not "nothing is live" rendered as a wall of grey. A list nobody
// has started yet is a plan, and a plan is read at full strength; recession
// is what says "not the one we are on", which needs there to be one.
// An `outline:` chunk is the agenda where the author puts it, which is what
// a divider cannot be: a divider is generated at a column boundary, and the
// place a lecture most often wants its plan is right after the cover, inside
// the anonymous column, where there is no boundary at all. It draws the same
// list the divider draws, so one stylesheet serves both - the difference is
// only which part is live, and before the first one none is.
//
// Unlike a divider it prints. A divider is an auto-inserted camera stop; this
// is a slide the author wrote, and print shows every slide the author wrote.
function renderOutlineList(parts, now) {
  if (!parts.length) return '';
  const items = parts.map(p => {
    const state = !now ? 'all' : (p.no < now ? 'done' : (p.no === now ? 'now' : 'next'));
    return `<li data-state="${state}"${p.no === now ? ' aria-current="step"' : ''}>` +
      `<span class="so-num">${p.no}</span>` +
      `<span class="so-text">${escapeHtml(p.heading)}</span></li>`;
  }).join('');
  return `<ol class="section-outline">${items}</ol>`;
}
function renderColumnSectionChunk(col, ci, frontmatter = {}, num = 0, parts = []) {
  const chunkId = col.id ? `${col.id}-section` : `__section-c${ci}`;
  const sec = sectionSettings(frontmatter);
  const mark = sec.mark
    ? `<div class="section-mark">${escapeHtml(sec.mark)}</div>`
    : (sec.variant === 'number' ? `<div class="section-mark section-num">${num}</div>` : '');
  // The running agenda. The heading is not set beside the list - it IS the
  // list's current item, which is the whole reason the variant exists: a
  // heading plus a list of headings says the same thing twice, and the
  // second copy is the one the room reads.
  const body = sec.variant === 'outline' && parts.length
    ? renderOutlineList(parts, num)
    : `<h1 class="section-heading">${escapeHtml(col.heading)}</h1>`;
  // The divider's own content, if the author wrote any under the heading.
  // It is what makes a part open on a picture, a quotation or a figure with
  // no vocabulary of its own for any of the three: a ::: backdrop is the
  // picture, ordinary markdown is the words, a ::: draw is the figure.
  const where = `the divider for "${col.heading}"`;
  const art = renderBackdrop(col.backdrop, where);
  const own = (col.body || '').trim()
    ? `<div class="section-body">${unwrapLoneFigure(marked.parse(col.body))}</div>` : '';
  const scrimAttr = art.scrim && art.scrim !== 'veil' ? ` data-backdrop="${art.scrim}"` : '';
  const bdAttr = art.html ? ' data-has-backdrop=""' : '';
  // The mark and the heading (or the list) are one block, and saying so in
  // the markup is what lets the beside layout be a two-column grid with one
  // row. Left as siblings they were separate grid rows, the figure spanned
  // all of them, and the extra height it forced was shared out among them -
  // measured, the list's centre sat 132px below the figure's. Everywhere
  // else the wrapper is `display: contents`, so it changes nothing.
  return `<article class="chunk chunk-section" data-tag="section" data-width="full" data-section="${sec.variant}"${bdAttr}${scrimAttr} data-chunk-id="${escapeHtml(chunkId)}">
  ${art.html}
  <div class="chunk-content">
    <div class="section-lead">
      ${mark}
      ${body}
    </div>
    ${own}
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
  // Which named column this is, counted over the columns that *have* a
  // heading - so `section: number` numbers the parts a reader sees rather
  // than the array index, which counts the anonymous opening column too.
  let sectionNo = 0;
  const parts = lectureParts(columns);
  return columns.map((col, ci) => {
    if (col.heading) sectionNo += 1;
    const sectionHtml = col.heading
      ? renderColumnSectionChunk(col, ci, frontmatter, sectionNo, parts) : '';
    const chunks = col.chunks
      .map((c, xi) => {
        num += 1;
        return renderAudienceChunk(c, frontmatter, ci, xi, num, parts, col.heading ? sectionNo : 0);
      })
      .join('\n');
    const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
    return `<section class="column" data-col="${ci}"${idAttr}>
${sectionHtml}
${chunks}
</section>`;
  }).join('\n');
}

// The controls a finger can reach. Shown only under `pointer: coarse`, and
// in BOTH live views - it used to be rendered into audience.html alone, which
// is the window a lecturer is least often holding: on a tablet at the lectern
// the cockpit is the one in your hands, and it had no touch controls at all
// and a footer carrying freeze, layout, export and help. So C, F, A, #, the
// search and the text selection were unreachable there without a keyboard.
//
// The rail carries what you press repeatedly; the palette behind `···` carries
// what you set once and leave. Every button calls the same function its key
// calls - never a second code path, or the palette and the key map drift the
// way build.js and lint.js do when nobody greps the other file.
const TOUCH_CONTROLS_HTML = `<nav id="touch-controls" aria-label="Slide controls">
  <div id="touch-palette" hidden>
    <button type="button" data-action="collapse" aria-label="Shorten or expand the text">C</button>
    <button type="button" data-action="font" aria-label="Change the font">F</button>
    <button type="button" data-action="theme" aria-label="Change the theme">A</button>
    <button type="button" data-action="autofit" aria-label="Auto-fit: off, shrink a slide that is too big, or fit every slide">#</button>
    <button type="button" data-action="search" aria-label="Search the lecture">&#x2315;</button>
    <button type="button" data-action="select" aria-label="Select text" aria-pressed="false">&#x2380;</button>
  </div>
  <div id="touch-rail">
    <button type="button" data-action="prev" aria-label="Previous">&#x2039;</button>
    <button type="button" data-action="next" aria-label="Next">&#x203A;</button>
    <button type="button" data-action="overview" aria-label="Overview">&#x229E;</button>
    <button type="button" data-action="zoom-out" aria-label="Zoom out">&#x2212;</button>
    <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
    <button type="button" data-action="more" aria-label="More controls" aria-expanded="false">&#x22EF;</button>
  </div>
</nav>`;

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
      ['<kbd>Space</kbd> · <kbd>↓</kbd> · <kbd>Enter</kbd> · <kbd>PageDown</kbd>', 'forward: the next reveal or diagram step, then the next slide'],
      ['<kbd>↑</kbd> · <kbd>PageUp</kbd> · <kbd>Backspace</kbd>', 'back: the reveal before it, then the slide before it'],
      ['<kbd>→</kbd> <kbd>←</kbd>', 'the same pair, on every slide'],
      ['<kbd>Shift</kbd><kbd>→</kbd> · <kbd>Shift</kbd><kbd>←</kbd>', 'the next column · the column before it – from anywhere'],
      ['the mark at the foot', '⌄ the next forward press leaves this column'],
      ['<kbd>1</kbd>–<kbd>9</kbd>', 'open the n-th expansion'],
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
      ['click a marginalia', 'slide the frame right until the whole aside is on it'],
      ['drag the slide', 'pan within a chunk that is taller than the screen'],
      ['hold <kbd>Alt</kbd>/<kbd>option</kbd> and drag', 'select text to copy – dragging pans again once you let go'],
      ['click a link', 'opens it in a new tab of this window'],
      ['<kbd>Shift</kbd>-click a link', 'puts the address on both screens, big enough to write down'],
      ['<kbd>Esc</kbd>', 'back to the whole slide'],
    ]],
    ['Reading knobs', [
      ['<kbd>C</kbd>', 'collapse: what the room sees ↔ the full text'],
      ['<kbd>F</kbd>', 'font: serif → sans → mono'],
      ['<kbd>A</kbd>', 'theme: four light accents, a neutral dark, two phosphor modes'],
      ['<kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd>', 'text size, and zero resets it (kept separately for each collapse mode)'],
      ['<kbd>#</kbd>', 'auto-fit: off → shrink a slide that is too big → size every slide to the screen'],
      ['<kbd>L</kbd>', 'slide numbers: stacked → in a row → off'],
      ['<kbd>B</kbd>', 'blank the projection – the speaker window keeps working, frozen or not'],
      ['<kbd>Shift</kbd>-<kbd>C</kbd> <kbd>F</kbd> <kbd>A</kbd> <kbd>L</kbd>', 'cycle that knob backwards'],
      ['on a touchscreen', 'the same settings sit behind the ⋯ button on the toolbar'],
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
  const editorKeys = ['The experimental diagram editor', [
    ['click a diagram, then <kbd>E</kbd>', 'open the editor on that figure – or the button in the corner of the card'],
    ['<kbd>1</kbd> <kbd>V</kbd>', 'select'],
    ['<kbd>2</kbd>/<kbd>R</kbd> <kbd>3</kbd>/<kbd>C</kbd> <kbd>4</kbd>/<kbd>T</kbd> <kbd>5</kbd>/<kbd>A</kbd> <kbd>8</kbd>/<kbd>I</kbd>', 'box · dot · text · edge · image'],
    ['<kbd>9</kbd>/<kbd>L</kbd>', 'a line with no arrowhead – both ends are plain coordinates, so it attaches to nothing'],
    ['<kbd>6</kbd> · <kbd>7</kbd>', 'container · brace, drawn around whatever is selected'],
    ['<kbd>Q</kbd>', 'keep the current tool instead of falling back to select'],
    ['drag · drag a handle', 'move it · resize it – the status bar shows the line it will write'],
    ['drag it over another element', 'four chips appear – release on one and it docks to that side of it, and follows it from then on'],
    ['drag it through what it sits beside', 'changes which side of that element it is on'],
    ['arrows · <kbd>Shift</kbd>-arrows', 'nudge the selection, fine · coarse'],
    ['<kbd>Ctrl</kbd> while dragging', 'suspend snapping, for when 0.5847 is meant'],
    ['<kbd>Alt</kbd> while dragging', 'leave an align or spread set at once – or just pull half a cell clear of it'],
    ['double-click a waypoint', 'take it off the arrow – the hollow dots on the line put one back'],
    ['<kbd>Delete</kbd>', 'delete, after listing what refers to it'],
    ['<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd> · <kbd>Shift</kbd>-<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd>', 'undo · redo'],
    ['<kbd>Ctrl/Cmd</kbd>-<kbd>A</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>D</kbd>', 'select all · duplicate'],
    ['<kbd>Ctrl/Cmd</kbd>-<kbd>C</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>V</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>Shift</kbd>-<kbd>V</kbd>', 'copy · paste · paste in place'],
    ['<kbd>Ctrl/Cmd</kbd>-<kbd>S</kbd>', 'write the block back – into source.md while --watch runs, otherwise to the clipboard'],
    ['<kbd>&lt;</kbd> <kbd>&gt;</kbd>', 'walk the diagram steps – a drag inside a step writes a move into that step'],
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
  const base = frontmatter['draw-defaults'] != null
    ? String(frontmatter['draw-defaults']) : '';
  // Only the cockpit of an `editor: speaker` lecture has a peer without a
  // compiler, and only then does an edit have to travel as compiled markup
  // as well as source – see the diagram-edit receiver's fallback.
  const peerNeedsHtml = want === 'speaker' && view === 'speaker';
  return `<style>\n${editorCss()}\n</style>\n`
    + `<script>\n${diagramCoreJs()}\n`
    + `window.PSI_DG_DEFAULTS = ${jsonForScript(base)};\n`
    + `window.PSI_DG_EDIT_HTML = ${peerNeedsHtml};\n`
    + `${editorJs()}\n</script>`;
}

function renderAudience(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  let columnsHtml = renderColumnsHtml(columns, frontmatter);
  if (!editorPayload(frontmatter, columnsHtml, 'audience')) columnsHtml = stripDiagramAssets(columnsHtml);
  const titleJson = jsonForScript(title);
  const defaults = viewDefaults(frontmatter);
  const styleOpts = styleSettings(frontmatter);

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
${styleBlockCss(styleOpts)}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body ${viewBodyAttrs(defaults, styleBodyAttrs(styleOpts, frontmatter))}>
${themeBootScript(defaults)}
<div id="stage-viewport">
  <div id="stage">
${columnsHtml}
  </div>
</div>
<div id="laser-pointer" aria-hidden="true"></div>
<div id="figure-overlay" aria-hidden="true"></div>
${TOUCH_CONTROLS_HTML}
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
  /* Multipliers the style: frontmatter block overrides. 1 is the tool's
     own scale, so a lecture that sets nothing is unchanged. */
  --heading-scale: 1;
  --body-scale: 1;
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

/* A dark reading theme switches shiki to its dark palette. Every token
   carries both colours: the light one as the inline color property, the dark one
   as the --shiki-dark custom property beside it, so this rule is the whole
   switch and no second copy of the code is shipped. Keyed on data-mode, so
   a further dark reading theme inherits it; the terminal modes are cut out
   by name because for them a single phosphor tone is the point, and their
   own suppression below would otherwise be arguing with this one over which
   !important came last. Scoped to pre.shiki rather than to .chunk-body, so
   a code block lifted into the focus overlay keeps its colours. */
body[data-mode=dark]:not([data-theme^=terminal]) pre.shiki,
body[data-mode=dark]:not([data-theme^=terminal]) pre.shiki span {
  color: var(--shiki-dark) !important;
}

/* In terminal modes, neutralise shiki's baked-in token colors so the
   code reads in a single phosphor tone. The !important is necessary
   because shiki emits inline style="color:#..." per span. Fonts stay
   mono regardless of the body font choice.

   Scoped to pre.shiki rather than to .chunk-body and .exp-body, for the
   same reason the dark rule above is: those two miss the focus overlay,
   which is where a code block goes when it is clicked. Measured there
   before this changed: the plain-identifier tone came through as
   github-light's #24292e on #0b0401 paper, 1.09:1, which is a code block
   that vanishes the moment a lecturer zooms into it. The overlay's own
   background rule carries an id and outranks the transparent here, so it
   keeps --paper and only the ink is neutralised. */
body[data-theme^=terminal] pre.shiki,
body[data-theme^=terminal] pre.shiki * {
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
   only signal that it worked, so it is not optional.

   #figure-overlay is named here beside #stage because it is not inside it.
   The focus card is cloned into a sibling of #stage-viewport – that is the
   one construct in the live views that deliberately escapes the stage – so a
   rule written against #stage left the focused code block unselectable, and
   a focused listing is the single thing on the screen a lecturer is most
   likely to want a line out of. The grab cursor the overlay and its card
   carry has to give way for the same reason the stage's does. */
body.text-selecting #stage,
body.text-selecting #stage *,
body.text-selecting #figure-overlay,
body.text-selecting #figure-overlay * {
  user-select: text;
  -webkit-user-select: text;
}
body.text-selecting #stage,
body.text-selecting #figure-overlay,
body.text-selecting #figure-overlay > .figure-focus-target { cursor: text; }
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

/* The chevrons float over the foot of the slide, so on a chunk that has them
   the words have to stop short. The band is one chevron tall and a chevron
   is sized in 0.62em times var(--zoom), so the reserve has to be written in
   the same terms or it stops matching the moment the lecturer presses +: measured
   on the tutorial's own #expand, a real line of prose sat inside the button
   rectangle at zoom 1.65, 1.95 and 2.2. 2.3 is the chevron's own box in
   its own type - line box plus 0.45em of padding top and bottom - and the
   0.7 on top of it is clearance: at exactly 2.3 the last line of prose
   ended on the button's top edge, and read as touching it. The band stands
   0.65 of the vertical slide padding off the floor, which is room the text
   already leaves, so that part comes back off.

   The em unit here is the chunk's, which is the responsive body size and
   carries no zoom of its own; the zoom is the explicit factor. That is the opposite of
   the [#17] finding, where an em on a *control* inherited the zoomed slide
   size and blew a touch bar up to 441px on a 390px phone. A control should
   not grow with the type. This is not a control - it is the space the type
   needs - so here it must.

   Which box gives way depends on which one is standing on the floor of the
   slide, and that is not the same box in both layouts, so the band is a
   variable used twice rather than a number written twice. Closed, the words
   are on the floor and the reserve is padding under .chunk-content - which
   is also where flowHeightProbe() wants it, since that function reads a
   level's own paddings and skips absolutely positioned children, so auto-fit
   counts the reserve and ignores the buttons. Expanded, the pane is on the
   floor, it is painted at z-index 5 over the buttons' 2, and it swallowed
   their bottom half; there the reserve is the chunk's own padding, which
   shortens the row the pane is centred in.

   The variable holds an em, and an em means whatever the element using it
   says it does. Both users here inherit the chunk's font size, so both
   resolve it the same way. The pane does not - it sets 0.88em times the zoom
   of its own - so do not reach for this inside .exp-body. */
.chunk:has(> .exps) {
  --exp-band: calc(0.62em * var(--zoom) * 3);
}
.chunk:has(> .exps):not(.expanded) > .chunk-content {
  padding-block-end: max(0px, calc(var(--exp-band) - var(--slide-pad-y) * 0.35));
}
.chunk.expanded {
  padding-block-end: calc(var(--slide-pad-y) + var(--exp-band, 0px));
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
  font-size: calc(1.55em * var(--zoom) * var(--heading-scale));
  margin: 0;
  line-height: 1.15;
  letter-spacing: -0.012em;
  color: var(--ink);
}
.chunk-body {
  font-size: calc(1em * var(--zoom) * var(--body-scale));
  line-height: 1.5;
  text-align: left;
}
.chunk-body p { margin: 0 0 0.7em 0; }
.chunk-body p:last-child { margin-bottom: 0; }
.chunk-body strong { font-weight: var(--bold-weight); color: var(--emph); }
.chunk-body em { font-style: italic; }
/* A link is styled for the whole live surface, not only inside .chunk-body.
   Three constructs render markdown outside that wrapper – a title chunk's
   body, a margin note and an expansion body – and scoped to the body their
   links fell through to the browser's own blue, the one colour in the view
   that follows none of the seven themes. The two chrome links (the address
   overlay and an embed's source line) carry their own colour and win on
   specificity. Print already styles the bare element for the same reason. */
a { color: var(--emph); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
a:hover { text-decoration-thickness: 2px; }
.chunk-body ul, .chunk-body ol { margin: 0 0 0.7em 1.4em; }
/* Adjacent items were 0.15em apart at line-height 1.5, so the gap between
   two items was smaller than the leading inside a two-line item and a list
   read as one block of text with dots in it. The gap is now larger than the
   line gap, which is what makes an item a unit. Card and row items are not
   affected: .cards > ul > li sets its own margin at a higher specificity,
   and their spacing is the grid's. */
.chunk-body li { margin: 0.45em 0; }
.chunk-body code { font-family: var(--mono-font); font-size: 0.92em; }
/* See the codespan renderer: a span with no space in it is one token and is
   not broken across lines. Bare element selector, so the heading, the
   expansions and the cockpit get it too. */
code.nb { white-space: nowrap; }
/* Same reason as the matching rule in PRINT_CSS: the bundled mono face
   ligates the arrow tokens into one glyph, and a slide is where the room is
   reading the token rather than the prose. Bare element selectors, so the
   cockpit gets it too – SPEAKER_CSS is layered on top of this sheet. */
/* Ligature policy, from the ligatures: frontmatter key. "text" is the
   default and is what this rule always did: none in code, ordinary fi and
   fl in prose. "all" puts the code ligatures back - JetBrains Mono draws
   "->" as one arrow glyph, which is pleasant in an editor and wrong on a
   slide, where the listing is source a reader is meant to retype. "none"
   takes them out of prose as well. */
body:not([data-liga=all]) code,
body:not([data-liga=all]) pre,
body:not([data-liga=all]) kbd,
body:not([data-liga=all]) samp { font-variant-ligatures: none; }
body[data-liga=none] { font-variant-ligatures: none; }
/* GFM tables: marked emits bare <table>; without this they collapse to the
   browser default of ~1px cell spacing and read as cramped. Borders use
   var(--rule) so they track all six themes (same reactivity rule as figures). */
.chunk-body table {
  border-collapse: collapse;
  margin: 0.4em 0 0.7em 0;
  /* No second var(--zoom) here or in the four rules below it: the em is
     .chunk-body's, and that has already been multiplied by the zoom. Written
     the other way these grew with its square - at the default zoom of 1.35 a
     code block set at 0.78em of the prose came out 5% *larger* than the prose
     it sat in, and a marginalia meant to be an aside outweighed the body. The
     coefficient is the relationship the stylesheet always intended; it only
     held at zoom 1. */
  font-size: 0.92em;
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
  font-size: 0.78em;
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
  grid-template-columns: var(--side-a, 1fr) var(--side-b, 1fr);
  gap: 2em;
  align-items: start;
  margin: 0.85em 0 1.2em;
}
/* ::: side {.middle} - the shorter pane centred against the taller one.
   One declaration, and it is the block's rather than each pane's because a
   grid row is as tall as its tallest item: the tall pane already fills the
   row and centring cannot move it, so this moves exactly the short one.
   That is the case it was asked for - two lines of prose beside a tall
   figure, sitting at the top of half an empty slide. */
.side.sv-middle { align-items: center; }
.side-a, .side-b { min-width: 0; }
.side-a > :first-child, .side-b > :first-child { margin-top: 0; }
.side-a > :last-child, .side-b > :last-child { margin-bottom: 0; }

/* ::: marginalia  – aside that extends into the right slide margin.
   Anchored to chunk-content's right edge, spills toward the slide padding
   and past it: the slide is framed as if the aside were not there, so
   whatever does not fit is simply cut off by the frame, which is what tells
   the reader there is more of it. Clicking it slides the camera right until
   all of it is on screen (asidePan in AUDIENCE_JS); Esc, or a click on the
   slide, gives the frame back. */
.marginalia {
  position: absolute;
  left: calc(100% + 2vw);
  top: 0;
  width: 26vw;
  max-width: 36em;
  font-family: var(--body-font);
  font-size: 0.82em;
  line-height: 1.45;
  color: var(--ink-soft);
  padding: 0 0 0 1.1em;
  border-left: 1px dotted var(--rule);
  cursor: zoom-in;
  z-index: 2;
}
.marginalia > :first-child { margin-top: 0; }
.marginalia > :last-child { margin-bottom: 0; }
/* The slide-number badge lives in the same corner: .chunk-num is anchored at
   top: var(--slide-pad-y) against the chunk's right edge, and an aside
   starting at top: 0 begins on exactly that line - measured at 1600x900 on
   the tutorial, both boxes had top: 173 and the digits sat on the aside's
   first words. So the aside starts below the badge whenever there is one.
   The two offsets differ because the badge does: horizontal is one line box,
   vertical stacks a line box per digit and has to clear three of them. They
   are written in the aside's own em, which is 0.82 of the chunk's, so the
   numbers are larger here than the badge's own measurements suggest. */
body:not([data-slide-nums=off]) .marginalia { top: calc(var(--slide-pad-y) + 1.5em); }
body[data-slide-nums=vertical] .marginalia { top: calc(var(--slide-pad-y) + 3.2em); }
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
  /* Every context this caption appears in is zoomed already - .chunk-body in
     a chunk, .section-body on a divider, .title-field on a cover - so the em
     carries the zoom in and the coefficient is a plain ratio. */
  font-size: 0.68em;
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
/* A display formula is focusable, and until this rule it was the one
   focusable thing the overlay did not enlarge: an image is given 95vw, a
   code block a clamp() off --slide-h, and a formula nothing at all - so
   clicking it laid it on a paper card at exactly the size it already had.
   Scaled the same way the code block is, so the two read alike, and off
   --slide-h rather than vh so audience and speaker agree. */
#figure-overlay > .math-display.figure-focus-target {
  overflow-x: auto;
  overflow-y: hidden;
}
#figure-overlay > .math-display.figure-focus-target .katex {
  font-size: clamp(30px, calc(var(--slide-h, 100vh) * 0.12), 150px);
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
/* Once the aside is in the frame the click that brought it in is also the
   click that lets it go, and the cursor is the only place that can say so. */
body.aside-panned .chunk.active .marginalia { cursor: zoom-out; }

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
.chunk[data-tag=principle] .chunk-body { font-size: calc(1.2em * var(--zoom) * var(--body-scale)); line-height: 1.4; }
.chunk[data-tag=principle] .chunk-heading { font-size: calc(1.8em * var(--zoom) * var(--heading-scale)); }

.chunk[data-tag=definition] .chunk-content::before {
  content: '';
  display: block;
  width: 100%; height: 1px;
  background: var(--rule);
  margin-bottom: 0.4em;
}

.chunk[data-tag=question] { text-align: center; }
.chunk[data-tag=question] .chunk-content { gap: 0.8em; align-items: flex-start; }
.chunk[data-tag=question] .chunk-heading { font-size: calc(2.4em * var(--zoom) * var(--heading-scale)); font-weight: 500; }
.chunk[data-tag=question] .chunk-body { font-size: calc(1.15em * var(--zoom) * var(--body-scale)); color: var(--ink-soft); }

.chunk[data-tag=figure] .chunk-heading {
  font-size: calc(1.05em * var(--zoom) * var(--heading-scale));
  font-weight: 500;
  color: var(--ink-soft);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
}
.chunk[data-tag=figure] .chunk-content { align-items: center; gap: 0.9em; }
.chunk[data-tag=figure] .chunk-body { order: 3; max-width: 40em; text-align: left; font-size: calc(0.9em * var(--zoom)); color: var(--ink-soft); }
.chunk[data-tag=figure] .chunk-heading { order: 2; }
.chunk[data-tag=figure] .chunk-body pre { order: 1; font-size: 0.82em; }

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
/* A cover owns the whole slide, whichever variant it is. Left at the 40%
   min-height every chunk gets, the next chunk's heading crept into the
   bottom of the frame and the split variant's picture stretched to a band
   across the top third instead of bleeding down the whole right edge. */
.chunk-title { align-items: end; min-height: var(--slide-h); }
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

/* ── lecture-wide style settings (the style: frontmatter block) ──────
   Two of the four keys are selectors rather than numbers, because what
   they turn off is a per-tag decision and not a size. Both are written as
   overrides of the tag treatments rather than by changing those rules, so
   a lecture that sets nothing meets the same stylesheet it always did. */
body[data-headings=left] .chunk[data-tag=question] { text-align: left; }
body[data-headings=left] .chunk[data-tag=figure] .chunk-content { align-items: flex-start; }
body[data-headings=left] .chunk[data-tag=figure] .chunk-body { text-align: left; }
body[data-headings=left] .chunk-heading,
body[data-headings=left] .title-main { text-align: left; }
body[data-headings=center] .chunk-heading { text-align: center; }
/* The heading comes off the slide and stays everywhere else. Two switches,
   both subtractive and both live-view-only: a .bare class on one chunk, and
   style.headings: off for a deck that is a run of figures with notes, where
   writing the class forty times is the repetition the key exists to remove.
   display: none rather than a dropped element, because the TOC, the search
   index and the speaker's lists all read the heading's text out of the DOM
   and every one of them keeps working. Both are audience-only: PRINT_CSS
   carries neither, so the document and its contents page are unchanged. */
.chunk[data-bare] > .chunk-content > .chunk-heading,
body[data-headings=off] .chunk-heading { display: none; }
/* .center sets the chunk's prose on a centre axis. Audience-only for the
   same reason .bare is: it is a decision about the slide, and the printed
   document keeps its left edge.

   The child combinator is what makes it safe. It reaches the chunk's own
   paragraphs and nothing nested - not a list, not a table, not a code
   listing, and not the prose inside a ::: side pane or a ::: cards row,
   each of which is a run of lines with a left edge of its own that centring
   would only ruin. It reaches no <figcaption> either: an image's alt text is
   the image's own line and is centred under it already. Centring was tried
   as a default for every figure: chunk first, and lectures/diagrams says why
   it cannot be one - the seven-line paragraph under #flowchart came out
   ragged on both edges and hard to read. The case is one or two lines, and
   only the author knows which chunk is that case.

   It is the prose and not the heading. Where a heading sits is already one
   question with one answer - the tag's treatment, overridden for a whole
   deck by style.headings - and a chunk class that also moved it would be a
   second, stronger way to say the same thing that style.headings: left could
   then no longer override. */
.chunk[data-center] > .chunk-content > .chunk-body > .reveal-segment > p { text-align: center; }
body[data-headings=center] .chunk[data-tag=question] { text-align: center; }
/* The hairline and the thick rule above a definition / principle chunk. */
body[data-rules=off] .chunk[data-tag=principle] .chunk-content::before,
body[data-rules=off] .chunk[data-tag=definition] .chunk-content::before { display: none; }
/* The one generated word left on the projection. The others were removed
   outright, because a taxonomy announces itself only as correctly as the
   tag choice was; this one stayed because a task the room is meant to do
   benefits from being named. Some authors do not want it either. */
body[data-labels=off] .chunk[data-tag=exercise] .chunk-content::before { content: none; }

/* ── cover variants ──────────────────────────────────────────────────
   Four compositions of the same five fields. classic is what the tool
   always drew and stays the default, so a lecture that says nothing about
   cover is unchanged to the pixel. The other three exist because a cover
   set only in ink, at one weight, with the subtitle at meta size beside
   the venue, reads as a text file rather than as the opening of a talk. */

/* The subtitle is the step the ladder was missing: title → subtitle →
   presenter → meta, four sizes rather than two. */
.chunk-title .title-subtitle {
  font-size: calc(1.28em * var(--zoom));
  line-height: 1.25;
  font-weight: 400;
  margin: -0.1em 0 0.25em;
  color: var(--ink-soft);
  max-width: 26em;
  text-wrap: balance;
}
.chunk-title .title-presenter { font-weight: 500; }
/* A cover with a page number on it is the detail that makes a deck look
   unfinished; every printed programme drops it too. */
.chunk-title > .chunk-num { display: none; }

/* The meta as a row of credits rather than four stacked lines of equal
   weight, which is what made the default block read as a log file. Shared
   by every variant that wants it, because it is one idea and it was worth
   keeping when the variant it arrived in was not. It wraps to as many rows
   as it needs. */
.chunk[data-cover=masthead] .title-info,
.chunk[data-cover=display] .title-info,
.chunk[data-cover=panel] .title-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15em 1.35em;
  font-size: calc(0.68em * var(--zoom));
  letter-spacing: 0.01em;
}
.chunk[data-cover=masthead] .title-info p,
.chunk[data-cover=display] .title-info p,
.chunk[data-cover=panel] .title-info p { margin: 0; }

/* masthead – the title along the top edge, the credits along the bottom,
   and the field between them left empty. The empty field is the whole
   composition, which is what separates this from every variant that fills
   it: there is no rule, no rail and no ground, so nothing on the slide is
   there to be looked at except the words and the distance between them.
   That distance is also the only thing carrying the format, so it has to
   be the slide's own height and not a margin – hence align-items: stretch
   on the chunk and margin-top: auto on the credits, which pins them to the
   bottom whatever the title above them measures. */
.chunk[data-cover=masthead] { align-items: stretch; }
.chunk[data-cover=masthead] .chunk-content {
  padding-top: 8vh;
  padding-bottom: 7vh;
  gap: 0;
  justify-content: flex-start;
}
.chunk[data-cover=masthead] .title-main {
  font-size: calc(2.5em * var(--zoom));
  font-weight: 600;
  letter-spacing: -0.026em;
  max-width: 17em;
}
.chunk[data-cover=masthead] .title-subtitle {
  margin: 0.5em 0 0;
  font-size: calc(1.15em * var(--zoom));
  max-width: 25em;
}
/* The one rule on the slide, and it is what turns the empty field from a
   hole into a field. A masthead is defined by a band that spans the measure,
   and with a short title nothing here spans anything: measured on a real
   deck, the longest line reached 55% of the frame and the right 45% was
   empty at every height, which is what "leer" was describing. The folio rule
   is the newspaper device for exactly that - it is the composition asserting
   its width, and it costs no colour, no ground and no glyph.

   2px and not 1: a hairline is invisible on most projectors and reads as a
   defect on the rest, which is the same measurement the outline card
   already carries. It sits on the presenter because the presenter already
   carries margin-top: auto, so the border lands at the top of the credits
   band whatever the field above it measures - no second element, no
   pseudo-element, nothing to keep in sync with the block above. */
.chunk[data-cover=masthead] .title-presenter {
  margin-top: auto;
  padding-top: 0.85em;
  border-top: 2px solid var(--rule);
  font-size: calc(1.02em * var(--zoom));
  font-weight: 600;
}
/* The credits run to both edges of the measure: who spoke on the left, where
   and when on the right. They were a single left-hugging run with a wide gap
   in the middle of it, which is a row that has been written but not laid
   out. space-between is the whole difference, and it needs the width to
   push against - a flex item in a column shrink-wraps its content. */
.chunk[data-cover=masthead] .title-info {
  margin-top: 0.35em;
  width: 100%;
  justify-content: space-between;
  column-gap: 2.4em;
}
/* The lede. A masthead's field wants what a front page puts there - a
   paragraph, a short list, a drawing - and it is the chunk's own body, in
   the flow, so every construct that works in a chunk works here. It takes
   the slack between the bands rather than sitting under the subtitle,
   because a two-line lede pinned to the top of a tall field re-creates the
   hole it was written to fill. */
.chunk[data-cover=masthead] .title-field {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.5em;
  margin: 1.4em 0 1.2em;
  /* Measured, not chosen: at 38em the widest line of a real lede ran to 84
     characters. A field that spans the measure is right for a rule and wrong
     for running text - the folio rule is what asserts the width now, so the
     lede does not have to. 28em is about 65 characters at this size. */
  max-width: 28em;
  font-size: calc(0.95em * var(--zoom));
  overflow: hidden;
}
/* With no lede the field is empty, and an empty field wants a bigger
   nameplate over it - the same reasoning the card row's auto size follows,
   and the same shape of rule: the composition reads what it was given and
   sets the scale from it, rather than making the author choose a size to go
   with a decision they already made by writing (or not writing) a body. */
.chunk[data-cover=masthead] .chunk-content:not(:has(.title-field)) .title-main {
  font-size: calc(3.05em * var(--zoom));
  max-width: 15em;
}
.chunk[data-cover=masthead] .chunk-content:not(:has(.title-field)) .title-subtitle {
  font-size: calc(1.3em * var(--zoom));
  margin-top: 0.55em;
}
.chunk[data-cover=masthead] .title-field > * { margin: 0; }
.chunk[data-cover=masthead] .title-field figure { margin: 0; min-height: 0; }
.chunk[data-cover=masthead] .title-field svg {
  width: auto; height: auto; max-width: 100%; max-height: 100%;
}

/* display – the title set to fill the slide, and nothing else asked to
   carry anything. The scale is the design: a lecture title at four and a
   half times the body size is the one typographic move that needs no
   second element to read as deliberate, which is exactly what a coloured
   bar beside a small title was failing to do.
   max-width is in em, so it scales with the type it bounds and a title
   breaks to two or three lines instead of running to a single thin line
   across a wide projector. line-height under 1 is safe here because the
   face is set once and never mixed. */
.chunk[data-cover=display] { align-items: center; }
.chunk[data-cover=display] .chunk-content {
  padding-bottom: 0;
  gap: 0;
}
.chunk[data-cover=display] .title-main {
  font-size: calc(4.4em * var(--zoom));
  font-weight: 600;
  line-height: 0.97;
  letter-spacing: -0.042em;
  max-width: 9.5em;
  text-wrap: balance;
}
.chunk[data-cover=display] .title-subtitle {
  margin: 0.75em 0 0;
  font-size: calc(1.2em * var(--zoom));
  max-width: 28em;
}
.chunk[data-cover=display] .title-presenter {
  margin-top: 1.5em;
  font-size: calc(1em * var(--zoom));
  font-weight: 600;
}
.chunk[data-cover=display] .title-info { margin-top: 0.3em; }

/* panel – the type set on a full field of the theme's own accent. This is
   the answer to "expressive" that the accent rail was reaching for and
   getting wrong: a colour is either the composition or it is decoration
   welded to the side of one, and a whole field is the first.
   The field is the accent driven to the far end of that theme's value
   range and the type is set at the near end. Which end is far depends on
   the mode, and that is not a refinement - it is the whole correctness of
   the thing. Written as one formula, the accent mixed towards the ink, it
   is a deep plate in the four light themes and a full-bleed acid field in
   the two terminal modes, because there the ink is the bright end:
   terminal-green resolved to oklch(0.87 0.09 145), a whole projector of
   phosphor green with black type on it. Rendered, it was the worst frame
   in the set, and nothing in the source said so.
   So the dark modes mix towards the paper instead and keep the theme's own
   ink on top. In a dark deck there is nothing to reverse - the deck is
   already reversed - and what a panel means there is a field deeper and
   more saturated than the paper. Keyed on data-mode, which is what every
   other surface in this file that was written against paper keys on.
   Nothing here redefines --emph, --ink or --paper. The field reads all
   three, and a declaration resolves var() against the element's own value,
   so an override in this block would make the field resolve to the new
   colour - the defect that shipped an invisible accent card twice. The two
   ends are carried as properties of their own instead.
   The field mixes in oklab and every other mix in this file stays oklch,
   which is not an inconsistency: oklch interpolates the *hue angle*, and
   this is the one mix here whose two ends are both chromatic and far
   apart on that circle. The neutral dark theme sets a warm accent at hue
   35 and a paper at hue 260, and the short way round between them runs
   backwards through magenta - so the plate under an orange accent
   rendered plum. oklab interpolates the rectangular components, which is
   what "the accent, darkened" means. Every other mix here is a colour
   with transparent, where there is no second hue to travel to. */
.chunk[data-cover=panel] {
  --panel-field: color-mix(in oklab, var(--emph) 62%, var(--ink));
  --panel-ink: var(--paper);
  background: var(--panel-field);
}
body[data-mode=dark] .chunk[data-cover=panel] {
  --panel-field: color-mix(in oklab, var(--emph) 30%, var(--paper));
  --panel-ink: var(--ink);
}
.chunk[data-cover=panel] .chunk-content {
  color: var(--panel-ink);
  padding-bottom: 12vh;
  gap: 0.3em;
}
.chunk[data-cover=panel] .title-main {
  color: var(--panel-ink);
  font-size: calc(2.85em * var(--zoom));
  font-weight: 600;
  letter-spacing: -0.028em;
}
.chunk[data-cover=panel] .title-subtitle {
  color: color-mix(in oklch, var(--panel-ink) 80%, transparent);
  margin: 0.4em 0 0;
  font-size: calc(1.18em * var(--zoom));
  max-width: 26em;
}
.chunk[data-cover=panel] .title-presenter {
  color: var(--panel-ink);
  margin-top: 1.1em;
  font-size: calc(1.02em * var(--zoom));
  font-weight: 600;
}
.chunk[data-cover=panel] .title-info {
  color: color-mix(in oklch, var(--panel-ink) 68%, transparent);
  margin-top: 0.3em;
}
/* panel with a picture under it. The scrim becomes the panel's own field
   at 80%, so the photograph reads through a plate of the accent rather
   than through the paper veil every other backdrop gets - which would
   lighten the ground under type that is already reversed and leave the
   words on nothing. This is the one place a cover and ::: backdrop
   compose into a look neither has alone. */
.chunk[data-cover=panel][data-has-backdrop] .chunk-backdrop::after {
  background: color-mix(in oklch, var(--panel-field) 80%, transparent);
}

/* quote - the talk opens on a claim rather than on its own name. The
   composition is one sentence and an attribution, and that is the whole of
   it: no quotation mark, no glyph behind the words, no rule beside them.
   A sentence set at twice the body size, alone, with a name under it,
   already reads as a quotation - the mark is what gets added when the
   composition is not trusted to say so, which is the same failure the
   accent rail was.

   Serif whatever the roster's default, because a claim is read rather than
   scanned and this is the one slide in a deck that is pure running text.
   The reader's own F toggle still wins, as it does everywhere. */
.chunk[data-cover=quote] { align-items: center; }
.chunk[data-cover=quote] .chunk-content {
  gap: 0;
  padding-bottom: 0;
}
.chunk[data-cover=quote] .title-field {
  font-family: var(--serif-font);
  font-size: calc(2.05em * var(--zoom));
  line-height: 1.24;
  letter-spacing: -0.012em;
  max-width: 19em;
  text-wrap: pretty;
  margin: 0 0 1.1em;
}
.chunk[data-cover=quote] .title-field > * { margin: 0 0 0.35em; }
.chunk[data-cover=quote] .title-field > :last-child { margin-bottom: 0; }
/* Under the claim the title is the attribution, so it is set at meta size
   and not as a headline - the one place in the family where the lecture's
   own name is not the largest thing on its cover. */
.chunk[data-cover=quote] .title-main {
  font-size: calc(1.05em * var(--zoom));
  font-weight: 600;
  letter-spacing: 0;
  max-width: 26em;
}
.chunk[data-cover=quote] .title-subtitle {
  margin: 0.2em 0 0;
  font-size: calc(0.92em * var(--zoom));
  max-width: 28em;
}
.chunk[data-cover=quote] .title-presenter {
  margin-top: 0.85em;
  font-size: calc(0.86em * var(--zoom));
  font-weight: 500;
  color: var(--ink-soft);
}
.chunk[data-cover=quote] .title-info {
  margin-top: 0.1em;
  font-size: calc(0.78em * var(--zoom));
}

/* split – type left, picture bled off the right edge. The picture is a
   grid track and not a background, because it has to end on a hard edge
   partway across rather than fade under the words. */
/* The slide's own padding moves onto the text column, so the picture
   track needs no negative margin to reach the edges – it simply is the
   edge. Tried the other way round first: min-height plus a negative
   margin made the article taller than the viewport, and the type went
   off the bottom of the frame while the picture reached neither end. */
/* The picture's share is the author's, exactly as it is on beside and above.
   Hard-coded here, split was in COVER_RATIO_VARIANTS - so the frontmatter
   was accepted, validated against the 15-75 band, emitted as a custom
   property on the article, and then read by nobody: measured, beside went
   from 519.8px to 671.4px at 62% and split did not move. A key the drawing
   ignores is the silent no-op this format refuses, and the refusal for the
   covers that do not divide only made it look deliberate. */
.chunk[data-cover=split] {
  grid-template-columns: minmax(0, 1fr) var(--cover-ratio, 42%);
  align-items: stretch;
  padding: 0;
  gap: 0;
}
.chunk[data-cover=split] .chunk-content {
  grid-column: 1;
  grid-row: 1;
  justify-content: center;
  padding: var(--slide-pad-y) 4.4em var(--slide-pad-y) calc(var(--slide-pad-x) * 0.62);
  gap: 0.42em;
}
/* Both tracks are pinned to row 1. The picture is emitted before the text
   (it has to sit under it in the stacking order), so sparse auto-placement
   fills column 2 of row 1 and then sends the text to a second row – and the
   picture becomes a 200px stub at the top of an 810px slide. */
.chunk[data-cover=split] .cover-art {
  grid-column: 2;
  grid-row: 1;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.chunk[data-cover=split] .title-main {
  font-size: calc(2.35em * var(--zoom));
  font-weight: 600;
}
.chunk[data-cover=split] .title-presenter { margin-top: 0.5em; }
.chunk[data-cover=split] .title-info { margin-top: 0.55em; }

/* hero – the picture is the slide and the type is reversed out of it.
   The scrim is a gradient from the bottom rather than an even veil: an
   even one greys the whole photograph to protect four lines in one
   corner, which is the look every stock template has. */
.chunk[data-cover=hero] { align-items: end; }
.chunk[data-cover=hero] .chunk-content {
  padding-bottom: 7vh;
  gap: 0.35em;
}
.chunk[data-cover=hero] .chunk-backdrop.bd-invert::after {
  background: linear-gradient(
    to top,
    oklch(0.12 0.02 260 / 0.88) 0%,
    oklch(0.12 0.02 260 / 0.72) 34%,
    oklch(0.12 0.02 260 / 0.28) 68%,
    oklch(0.12 0.02 260 / 0.10) 100%);
}
.chunk[data-cover=hero] .title-main {
  font-size: calc(2.75em * var(--zoom));
  font-weight: 600;
  letter-spacing: -0.026em;
}
.chunk[data-cover=hero] .title-subtitle { max-width: 24em; }
.chunk[data-cover=hero] .title-presenter {
  margin-top: 0.5em;
  font-weight: 600;
}

/* stack - the title block centred on both axes, and nothing else. PRD 4.4
   argues against a centred cover, and it is right about the reason: centred
   reads institutional. It is here because the argument is about weight, not
   about the axis - with a subtitle carrying the second line and generous
   leading there is enough on the slide for the centre to hold, and some
   talks want the quiet opening rather than the asymmetric one. */
.chunk[data-cover=stack] { align-items: center; text-align: center; }
.chunk[data-cover=stack] .chunk-content {
  padding-bottom: 0;
  align-items: center;
  gap: 0.28em;
  max-width: 34em;
  margin: 0 auto;
}
.chunk[data-cover=stack] .title-main { font-size: calc(2.6em * var(--zoom)); font-weight: 600; }
.chunk[data-cover=stack] .title-subtitle { max-width: 30em; margin-top: 0.1em; }
.chunk[data-cover=stack] .title-presenter { margin-top: 0.9em; font-weight: 600; }
.chunk[data-cover=stack] .title-info { margin-top: 0.15em; }

/* beside - the art to the right of the title, inset rather than bled. That
   is the difference from split, and it is the whole reason both exist: a
   photograph wants the edge, a drawing wants a margin, because a diagram
   cropped by the frame reads as a diagram that did not fit. */
.chunk[data-cover=beside] {
  grid-template-columns: minmax(0, 1fr) var(--cover-ratio, 48%);
  align-items: center;
  gap: 2.4em;
  padding-left: calc(var(--slide-pad-x) * 0.55);
  padding-right: calc(var(--slide-pad-x) * 0.55);
}
.chunk[data-cover=beside] .chunk-content {
  grid-column: 1; grid-row: 1;
  padding-bottom: 0;
  gap: 0.38em;
}
.chunk[data-cover=beside] .cover-art {
  grid-column: 2; grid-row: 1;
  align-self: center;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  min-height: 42vh;
}
.chunk[data-cover=beside] .title-main { font-size: calc(2.25em * var(--zoom)); font-weight: 600; }

/* above - the art on top, the title in the lower quarter and centred on
   both axes. The proportion is the point: cover-ratio is how much of the
   slide the drawing gets, and the type sits in what is left rather than
   floating in the middle of it. */
/* The height has to be *definite*, not a minimum, and that is the whole of
   why the title used to run off the bottom of the slide. A percentage row
   track resolves against the container's height, and a container with only
   a min-height has an indefinite one - so the 58% fell back to auto, the art
   row took the drawing's intrinsic height, the text row took the type's,
   and the two together came to more than a slide. Rendered with a figure
   and four meta lines, the subtitle was cut through the middle by the
   bottom edge of the frame. Nothing about the source said so, and the two
   sibling compositions are unaffected: beside divides the width, which
   is definite in every layout this tool draws.
   With the height pinned, minmax(0, …) on both tracks is what makes the
   art give way rather than the words: the drawing is a background or an
   svg with a max on both axes, so it letterboxes into whatever it gets. */
.chunk[data-cover=above] {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, var(--cover-ratio, 56%)) minmax(0, 1fr);
  height: var(--slide-h);
  align-items: center;
  text-align: center;
  row-gap: 0.6em;
}
.chunk[data-cover=above] .cover-art {
  grid-column: 1; grid-row: 1;
  align-self: center;
  background-size: contain;
  background-position: center bottom;
  background-repeat: no-repeat;
  min-height: 0;
  width: 100%;
  height: 100%;
}
.chunk[data-cover=above] .chunk-content {
  grid-column: 1; grid-row: 2;
  padding-bottom: 0;
  align-items: center;
  /* Centred in the band the drawing left, not pinned under it - which is
     what "the lower quarter, centred on both axes" means when the drawing
     turns out shorter than the track it was given. */
  align-self: center;
  gap: 0.22em;
  max-width: 36em;
  margin: 0 auto;
}
.chunk[data-cover=above] .title-main { font-size: calc(2.05em * var(--zoom)); font-weight: 600; }
.chunk[data-cover=above] .title-subtitle { max-width: 32em; font-size: calc(1.05em * var(--zoom)); }
.chunk[data-cover=above] .title-presenter { margin-top: 0.5em; font-weight: 600; }
.chunk[data-cover=above] .title-info { margin-top: 0.05em; font-size: calc(0.64em * var(--zoom)); }

/* ── the closing slide (## closing:) ─────────────────────────────────
   It reuses .chunk-title and data-cover wholesale, so every rule above
   already applies to it and there is no second family of compositions to
   keep in step. What it adds is only what differs: the picture is gone,
   and there is a body where the cover has its info block.

   The four picture compositions each have a track with nothing in it once
   the picture is gone, so it is collapsed rather than left as a band of
   paper the type is pushed out of. One declaration each, keyed on
   data-closing rather than on :has(.cover-art) - the attribute is the
   fact, and the absence of an element is only a symptom of it.

   closing-image is the author putting a picture back in that track, and
   then there is nothing to collapse - so every one of these carries
   :not([data-closing-art]). Written as an exclusion on the collapse rather
   than as a second set of rules restoring the track, because the track's
   own rules are the cover's and have never stopped applying: what the
   closing slide adds is only the absence, and the absence is what comes
   off. A ::: backdrop does not set the attribute and does not lift the
   collapse - it is a ground behind the type, and the track it would have
   filled is still empty. */
.chunk[data-cover=split][data-closing]:not([data-closing-art]),
.chunk[data-cover=beside][data-closing]:not([data-closing-art]) { grid-template-columns: minmax(0, 1fr); }
.chunk[data-cover=split][data-closing]:not([data-closing-art]) .chunk-content {
  padding-right: calc(var(--slide-pad-x) * 0.62);
}
.chunk[data-cover=above][data-closing]:not([data-closing-art]) { grid-template-rows: minmax(0, 1fr); }
.chunk[data-cover=above][data-closing]:not([data-closing-art]) .chunk-content { grid-row: 1; }
/* hero's gradient is on the backdrop, so a closing slide with no picture
   simply has none - the type sits where hero puts it, on paper. With a
   closing-image it has one, and it is the same inverted backdrop the cover
   builds, so the reversed type comes with it and needs no rule here. */

/* The body sits under the title the way the info block does on a cover,
   at reading size rather than meta size: it is the one thing on this slide
   the room is meant to act on - where to write, what is next week, which
   paper to read - and the cover's soft small type is for a date. */
.chunk-title[data-closing] .closing-body {
  margin-top: 1.1em;
  font-size: calc(0.95em * var(--zoom) * var(--body-scale));
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: 34em;
}
.chunk-title[data-closing] .closing-body > :first-child { margin-top: 0; }
.chunk-title[data-closing] .closing-body > :last-child { margin-bottom: 0; }
.chunk[data-cover=stack] .closing-body,
.chunk[data-cover=above] .closing-body { margin-left: auto; margin-right: auto; }
/* Reversed out, like the four fields above it. */
/* Both attributes named, so this beats the soft-ink rule above by
   specificity rather than by being written after it. It was correct here
   only because of the order, and the same pair in PRINT_CSS was ordered
   the other way and shipped grey text on a brown plate. */
.chunk[data-cover=panel][data-closing] .closing-body {
  color: color-mix(in oklch, var(--panel-ink) 76%, transparent);
}
/* masthead is two anchors with the slide's own height between them, and on
   a cover the bottom one is the credits row. A closing slide has no credits
   - that is the point of it - so the bottom anchor went missing and the
   composition collapsed into a top-heavy slide with a void under it, which
   is not the same composition at all. Whatever comes last takes the anchor,
   which on this slide is the body. */
.chunk[data-cover=masthead][data-closing] .closing-body { margin-top: auto; }

/* display sets the title at four and a half ems, which is right for a
   lecture title and shouting for the word "Questions?". The bookend keeps
   the composition and steps the scale back to the cover's own. */
.chunk[data-cover=display][data-closing] .title-main {
  font-size: calc(3.1em * var(--zoom));
  max-width: 14em;
}
/* quote is the other cover that sets .title-main to something it is not on a
   closing slide. There the lecture's title is the *attribution* under the
   claim, so it is meta-sized on purpose - but a closing slide has no claim
   above it and its heading IS its content, which came out at attribution
   size: measured, 29.9px where a heading belongs. The bookend keeps the
   composition and takes back the one rule that only made sense with a
   quotation over it. */
.chunk[data-cover=quote][data-closing] .title-main {
  font-size: calc(2.2em * var(--zoom));
  font-weight: 600;
  letter-spacing: -0.018em;
  max-width: 20em;
}
.chunk[data-cover=quote][data-closing] .title-subtitle {
  font-size: calc(1.05em * var(--zoom));
  margin-top: 0.35em;
}

/* The body-as-art wrapper has to let a figure fill it. A ::: draw emits a
   <figure class=psi-diagram> whose own margins are tuned for the text
   column it normally sits in; on a cover it is the composition. */
/* The art box is capped at the slide, and the drawing letterboxes inside
   it. An inline <svg> with a viewBox and width:100% is *width*-driven, so a
   tall figure in a narrow column grew to whatever its aspect demanded and
   took the whole article with it - the title went off the bottom of the
   frame and the drawing off the right. Giving the svg both dimensions hands
   the fitting to preserveAspectRatio, which is what it is for. */
.cover-art-body {
  display: flex; align-items: center; justify-content: center;
  min-width: 0; min-height: 0; overflow: hidden;
  max-height: calc(var(--slide-h) - 2 * var(--slide-pad-y));
}
.cover-art-body > * { margin: 0; max-width: 100%; max-height: 100%; }
.cover-art-body figure {
  margin: 0; min-width: 0; min-height: 0;
  display: flex; align-items: center; justify-content: center;
}
/* auto on both axes with a max on both. The svg carries width and height
   attributes in px, so it has an intrinsic size and an intrinsic ratio,
   and that is exactly the case where a pair of maxima shrinks it to fit
   and keeps the proportion. Setting height:100% instead made the box size
   from the content that was sizing from the box, and a tall figure ran
   off both the bottom and the right of the slide. */
.cover-art-body svg {
  width: auto; height: auto;
  max-width: 100%;
  max-height: calc(var(--slide-h) - 2 * var(--slide-pad-y));
}
.chunk[data-cover=split] .cover-art-body { padding: var(--slide-pad-y) 1.5em; }
/* In the above cover the art is inside a bounded row rather than beside
   the type, so its ceiling is the row and not the slide - the shared rule
   above caps the svg at the whole slide, which in a 56% track is no cap at
   all. Saying max-height: 100% is not enough on its own, and the reason is
   the one percentage rule everybody forgets: a percentage max-height
   resolves against the containing block's *specified* height, and where
   that is auto it resolves to none. The wrapper is a grid item with a
   definite height, but the figure between it and the svg is not, so the
   cap silently evaporated one level down and the drawing came out 622px
   tall in a 409px row - overflowing the track at both ends and running
   through the title. Measured, not guessed: it looked like the drawing had
   been scaled up. Giving the figure a height makes the chain definite. */
.chunk[data-cover=above] .cover-art-body,
.chunk[data-cover=above] .cover-art-body figure { height: 100%; max-height: 100%; }
.chunk[data-cover=above] .cover-art-body svg { max-height: 100%; }

/* ── cover-align: where the type sits on the vertical ────────────────
   One mechanism for six compositions, and it is deliberately the *content
   box* rather than the grid's align-items. Half of these covers put a
   picture in a second grid track, and align-items is per-item: setting it
   on the chunk to move the type also un-stretches the art, which on split
   collapses a full-height panel to the intrinsic height of an empty div -
   the picture vanishes and nothing in the rule says why. align-self on the
   content alone cannot reach the art at all.

   Stretching it is what makes justify-content operative: a flex column that
   shrink-wraps its own content has no slack to distribute, so the property
   would resolve and move nothing - the silent no-op this format refuses. */
.chunk[data-cover-align] .chunk-content { align-self: stretch; }
.chunk[data-cover-align=top] .chunk-content { justify-content: flex-start; }
.chunk[data-cover-align=middle] .chunk-content { justify-content: center; }
.chunk[data-cover-align=bottom] .chunk-content { justify-content: flex-end; }

/* ── full-bleed backdrops (::: backdrop) ─────────────────────────────
   The layer is inset:0 on the .chunk, so it fills whatever the chunk
   fills. That is only the viewport once the chunk is forced to the full
   slide height: a .chunk's min-height is 40% of the viewport, which for a
   text slide is right and for a picture would have painted a band across
   the middle third and left paper above and below it. */
.chunk[data-has-backdrop] { min-height: var(--slide-h); }
.chunk-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
  overflow: hidden;
}
.chunk-backdrop.bd-contain { background-size: contain; }
.chunk-backdrop.bd-top    { background-position: center top; }
.chunk-backdrop.bd-bottom { background-position: center bottom; }
/* The reveal animates the *window*, never the picture. clip-path is what
   makes that true: background-size: cover is resolved against the whole
   slide whatever the clip says, so the photograph stays exactly where it
   is and the frame opens or closes over it. Animating width or inset
   instead re-resolves cover on every frame, and the picture zooms and
   slides while it is being revealed - a different effect, and not one
   anybody asked for. It also costs no layout: clip-path is composited.

   0.62s, which is slower than the reveal of a text segment on purpose. A
   segment appearing is a footnote to what is already on the slide; a
   picture opening across the frame is the slide changing, and at the speed
   of a bullet it reads as a glitch. */
/* The opacity half has to be restated here: transition is a shorthand and
   this selector outranks the plain .chunk-backdrop rule, so naming only
   clip-path silently dropped the fade that keeps a backdrop off its
   neighbours - on exactly the backdrops that most need the crossfade. */
.chunk-backdrop[data-bd-frames] {
  transition: clip-path 0.62s cubic-bezier(0.4, 0, 0.2, 1), opacity 260ms ease;
}
/* The same shorthand clobber, one media query down: transition: none here
   took the opacity crossfade away too, so under reduced motion a revealed
   backdrop snapped between slides while every other one still faded. What
   reduced motion is asking to suppress is the picture opening across the
   frame, not a 260ms fade the tool keeps everywhere else. */
@media (prefers-reduced-motion: reduce) {
  .chunk-backdrop[data-bd-frames] { transition: opacity 260ms ease; }
}
/* Scaled up because a blur samples transparent pixels past the edge and
   would otherwise fade the frame out into paper on all four sides. */
.chunk-backdrop.bd-blur { filter: blur(18px) saturate(1.06); transform: scale(1.08); }
/* The veil is the theme's own paper, not white, so ordinary ink stays
   legible over a photograph in all seven themes with no second palette. */
.chunk-backdrop::after {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in oklch, var(--paper) 80%, transparent);
}
.chunk-backdrop.bd-clear::after { content: none; }
.chunk-backdrop.bd-invert::after {
  background: color-mix(in oklch, oklch(0.14 0.015 260) 58%, transparent);
}
/* An inverted slide re-points the ink tokens rather than restating every
   colour rule: everything downstream already reads --ink / --ink-soft /
   --rule, so one block covers headings, body, lists, rules and captions. */
.chunk[data-backdrop=invert] {
  /* color: var(--ink) is declared on body, so it is *computed* there
     against body's --ink and inherited as a finished colour: redefining
     the token further down changes nothing that already resolved. The
     title came out near-black on a night photograph for exactly that
     reason. Restating color here re-resolves it against this element's
     own tokens, and everything below inherits the new value. */
  color: var(--ink);
  --ink: oklch(0.99 0 0);
  --ink-soft: oklch(0.99 0 0 / 0.74);
  --rule: oklch(0.99 0 0 / 0.32);
  --emph: oklch(0.90 0.10 75);
  text-shadow: 0 1px 14px oklch(0.12 0.02 260 / 0.5);
}
/* Content has to clear the backdrop, which is z-index 0 in the same
   stacking context. Written as a z-index on each layer and never as a
   position – .overlay-layer is already absolute, and a sibling selector
   restating position: relative on it dropped the whole layer back into
   the text flow, where its three 1fr rows stretched the chunk to twice
   the viewport and pushed the card off the bottom of the slide. */
.chunk[data-has-backdrop] > .chunk-content { z-index: 1; }
/* The over word is the one backdrop that sits on the type. It stops short of the
   overlay layer deliberately: a picture that covers the title is a move
   that usually wants a word left standing on top of it, and an ::: overlay
   is where that word already goes. The three numbers below are one ladder -
   backdrop 0, content 1, an over-layer picture 2, overlays and the slide number
   3 - so changing one means reading all of them. */
.chunk-backdrop.bd-over { z-index: 2; }
.chunk[data-has-backdrop] > .chunk-num { z-index: 3; }

/* ── overlay cards (::: overlay) ─────────────────────────────────────
   One 3x3 grid over the whole slide inside its padding, rather than each
   card positioned on its own: two cards aimed at the same corner then
   stack instead of overlapping, and there is one element out of the text
   flow rather than N. */
.overlay-layer {
  position: absolute;
  inset: var(--slide-pad-y) calc(var(--slide-pad-x) * 0.62);
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 0.6em;
  pointer-events: none;
}
/* An overlay held back by a beat fades rather than vanishing, which is the
   one place it differs from a reveal segment. A segment is part of a text
   flow, so display: none is right - what follows it closes up. An overlay
   sits in its own grid cell over a picture, so nothing moves when it
   arrives, and a block of type appearing instantly on a photograph reads as
   a rendering fault rather than as a beat. It keeps its cell in both
   states, so the layout never shifts. */
.overlay-card {
  pointer-events: auto;
  padding: 0.85em 1.05em;
  border-radius: 6px;
  font-size: calc(0.92em * var(--zoom));
  line-height: 1.45;
  align-self: center;
  backdrop-filter: blur(3px);
  transition: opacity 0.5s ease 0.14s, transform 0.5s ease 0.14s, visibility 0.5s;
}
.overlay-card[data-hidden] {
  opacity: 0;
  visibility: hidden;
  transform: translateY(0.45em);
}
@media (prefers-reduced-motion: reduce) {
  .overlay-card { transition: none; }
  .overlay-card[data-hidden] { transform: none; }
}
.overlay-card > :first-child { margin-top: 0; }
.overlay-card > :last-child { margin-bottom: 0; }
.overlay-card p { margin: 0 0 0.5em; }
.overlay-card h1, .overlay-card h2, .overlay-card h3 {
  font-size: 1.45em;   /* .overlay-card's em is zoomed already */
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 0.3em;
  letter-spacing: -0.015em;
}
.overlay-card strong { font-weight: var(--bold-weight); color: var(--emph); }

/* place – nine cells, one slot. The row and column are set separately so
   the nine words stay one closed list rather than two crossed ones. */
.overlay-card.ov-top-left     { grid-area: 1 / 1; justify-self: start;  align-self: start; }
.overlay-card.ov-top          { grid-area: 1 / 2; justify-self: center; align-self: start; }
.overlay-card.ov-top-right    { grid-area: 1 / 3; justify-self: end;    align-self: start; }
.overlay-card.ov-left         { grid-area: 2 / 1; justify-self: start; }
.overlay-card.ov-center       { grid-area: 2 / 2; justify-self: center; }
.overlay-card.ov-right        { grid-area: 2 / 3; justify-self: end; }
.overlay-card.ov-bottom-left  { grid-area: 3 / 1; justify-self: start;  align-self: end; }
.overlay-card.ov-bottom       { grid-area: 3 / 2; justify-self: center; align-self: end; }
.overlay-card.ov-bottom-right { grid-area: 3 / 3; justify-self: end;    align-self: end; }

/* width – a card sized to its cell would be a third of the slide whatever
   it holds, so the width words set a max and the card shrinks to fit. The
   left column can grow rightwards, the right column leftwards, and the
   middle both ways, which is what makes full a band rather than a
   third. */
/* Measured in the card's own em, which is 0.92 of the slide's - so 24em was
   about 48 characters, short of the range running text wants and visibly so
   on a two-line pull-out over a photograph. Widened one step each; the
   full width is still the way to have the whole frame. */
.overlay-card.ov-w-narrow   { max-width: 19em; }
.overlay-card.ov-w-standard { max-width: 29em; }
.overlay-card.ov-w-wide     { max-width: 42em; }
.overlay-card.ov-w-full     { max-width: none; justify-self: stretch; }
.overlay-card.ov-w-wide, .overlay-card.ov-w-full { grid-column: 1 / -1; }
.overlay-card.ov-w-wide.ov-top-right,
.overlay-card.ov-w-wide.ov-right,
.overlay-card.ov-w-wide.ov-bottom-right { justify-self: end; }

/* ground – five answers to "what does this sit on". paper and ink are
   the theme's own two grounds, so both follow a theme change; accent
   is --emph; glass is the paper at low alpha over whatever is behind,
   which is the only one that needs the picture to still show through. */
.overlay-card.ov-paper {
  background: color-mix(in oklch, var(--paper) 94%, transparent);
  box-shadow: 0 2px 22px oklch(0.2 0.01 260 / 0.16);
  color: var(--ink);
  --ink-soft: color-mix(in oklch, var(--ink) 55%, transparent);
  text-shadow: none;
}
/* ov-ink's fill is a literal rather than var(--emph), so redefining --emph
   here is safe - and it is wanted, because an accent on a dark slab has to
   lift to stay legible. Kept as the counter-example to the rule above. */
.overlay-card.ov-ink {
  background: oklch(0.16 0.015 260 / 0.9);
  color: oklch(0.99 0 0);
  --ink: oklch(0.99 0 0);
  --ink-soft: oklch(0.99 0 0 / 0.72);
  --emph: oklch(0.90 0.10 75);
  text-shadow: none;
}
.overlay-card.ov-accent {
  background: color-mix(in oklch, var(--emph) 92%, transparent);
  color: var(--paper);
  --ink: var(--paper);
  --ink-soft: color-mix(in oklch, var(--paper) 80%, transparent);
  text-shadow: none;
}
.overlay-card.ov-accent strong, .overlay-card.ov-accent b { color: currentColor; }
.overlay-card.ov-glass {
  background: color-mix(in oklch, var(--paper) 26%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid color-mix(in oklch, var(--ink) 12%, transparent);
}
.overlay-card.ov-clear { background: none; padding: 0; backdrop-filter: none; }

/* ── card grid (::: cards N) ─────────────────────────────────────────
   Not a second spelling of cols. cols is one text flow the browser
   balances across N tracks, so a paragraph can spill from the foot of one
   into the head of the next; cards is N containers, and an item is
   whole or it is nowhere. Which is why a three-way comparison belongs
   here and a long argument belongs in cols.

   Which children become the cards is a CSS rule and not a parse: a lone
   list dissolves into the grid so its items are the cards, and anything
   else contributes one card per block. One rule, no body inspection. */
.cards {
  display: grid;
  grid-template-columns: repeat(var(--card-n), minmax(0, 1fr));
  /* The gutter has to read as the thing separating N cards, and at 0.7em
     against a 300px card it did not - the row looked like one panel with
     seams. Scaled with the card's own size so it stays proportional when
     the type gets bigger. */
  gap: calc(0.95em * var(--card-fs, 1));
  /* A card row needs more air above it than a paragraph does. It is a
     block of surfaces rather than a continuation of the text, so the
     heading has to stop belonging to it - at the paragraph's spacing the
     row read as the heading's own background. Scaled with the card size,
     because a large row is a heavier object.

     Both edges, and the bottom used to be a flat 0.4em: measured at the
     default size that was 35.8px of air above a row and 11.4px below it,
     so a paragraph after the last card sat almost against it and read as
     the card's own overflow - the same fault the top margin exists to
     prevent, in the direction nobody had looked. Two rows in a row are
     unaffected, because adjacent margins collapse to one. Print was
     symmetric all along. */
  margin: calc(1.5em * var(--card-fs, 1)) 0;
  align-items: stretch;
}
/* When the row is centred the heading over it should be too, or the slide
   has two axes and no reason for either. Written as a coupling rather than
   a class, because there is nothing an author would want to say here that
   the cards have not already said - and it yields entirely the moment
   style.headings names a value, which is what that key is for. */
/* Only a row that spans the measure moves the heading. A centred card row
   inside a ::: side pane is centred *in its pane*, and letting that centre
   the heading over the whole slide put the title above one column and the
   prose beside it - two axes, no reason for either. The child combinator
   is what says "spans the measure": in a pane the row sits under
   .side-a / .side-b instead. */
body:not([data-headings]) .chunk-content:has(.chunk-body > .reveal-segment > .cards.ca-center) .chunk-heading,
body:not([data-headings]) .chunk-content:has(.chunk-body > .reveal-segment > .cards.ca-center) .chunk-body > .reveal-segment > p {
  text-align: center;
}
.cards-1 { --card-n: 1; }
.cards-2 { --card-n: 2; }
.cards-3 { --card-n: 3; }
.cards-4 { --card-n: 4; }
.cards-5 { --card-n: 5; }
.cards-6 { --card-n: 6; }
.cards > ul, .cards > ol { display: contents; }
.cards > ul > li,
.cards > ol > li,
.cards > :not(ul):not(ol) {
  margin: 0;
  padding: var(--card-py, 1.05em) var(--card-px, 1.15em);
  border: var(--card-border, 0);
  /* 6px on a card 300px wide is the radius a stylesheet has when nobody
     chose one. At slide scale it needs to be visible as a decision. */
  border-radius: 10px;
  background: var(--card-bg, none);
  list-style: none;
  line-height: 1.38;
  font-size: calc(1em * var(--card-fs, 1));
  /* A card is the narrowest measure on the slide, so it is where a long
     word first runs out of room - measured, Countermeasures overflowed a
     320px card by 26px once the second level widened it. Breaking is the
     floor and hyphenation the preference; the language comes from the
     html lang attribute, which is why lang: de in the frontmatter is what
     makes a German compound break at all. */
  overflow-wrap: break-word;
  hyphens: auto;
  /* Only long words. Left to itself the browser broke until into un-
     and til, which costs a reader more than the ragged edge it saved.
     Eight characters is past every short function word and short of every
     compound worth breaking. */
  hyphenate-limit-chars: 8 4 4;
  /* A grid row is as tall as its longest card, so every other card has
     slack in it and something has to say where the text sits. This was a
     flex column, and the note beside it said align-content could not be
     used because a card can hold more than one block and they have to stay
     stacked. In block layout they do: align-content moves the content box
     as a whole inside the leftover height and the blocks inside it stay in
     the flow, which is what the flex column was reaching for.

     The flex column cost the run-in lead-in its whole existence. A flex
     container blockifies every child, so the bold at the head of
     - **panel** a tinted fill… was a flex item and the sentence after it
     an anonymous one, and the two stacked whatever the stylesheet said
     about display. Removing one rule would not have brought the run-in
     back; this is the rule that was preventing it. */
  display: block;
  align-content: var(--card-anchor, flex-start);
  text-align: var(--card-align, left);
}
/* Two ways to open a card, and the author writes the difference:
     - **panel** a tinted fill…     a lead-in. The bold runs into the text.
     - **Measure**\                 a heading. Own line, and air under it.
       what the page does
   Which one it is is answered in the renderer, by markCardLeads, which can
   read the hard break the author typed and marks the bold .card-lead when
   it finds one. It is not answerable here: every leading bold used to be
   forced to a block, so both forms drew as a heading and the run-in did
   not exist; keying the air on :has(+ br) instead only moved the guess,
   because a text node after the bold got no margin while a <br> after the
   same bold got one. A class also reaches the card that bleeds a picture,
   where the bold run is the *second* element and a :first-child rule
   reached none of it - that case cost this block two extra selectors and
   now costs it none. */
.cards li .card-lead { display: block; margin-bottom: 0.45em; }
/* An author who wrote the hard break meant one separation, not two: the
   block display already broke the line, so the <br> after it adds an
   empty one. */
.cards li .card-lead + br { display: none; }
/* An image in a card bleeds to its edges. Negative margins equal to the
   padding, which is why the padding is two custom properties rather than
   one shorthand - a shorthand cannot be negated a side at a time. The top
   corners follow the card's own radius; the bottom ones do not, because
   the image sits above text rather than filling the box. */
.cards li > :is(p, figure):first-child > img:only-child,
.cards li > img:first-child,
.cards li > figure.figure-img:first-child img {
  display: block;
  width: calc(100% + 2 * var(--card-px, 1.15em));
  /* The figure and image rules elsewhere cap every picture at max-width
     100%, which clamped the computed width straight back to the padded
     box: the negative margins were applied and the image still did not
     reach the edges. Measured - 327.6px asked for, 262.2px granted. */
  max-width: none;
  margin: calc(-1 * var(--card-py, 1.05em)) calc(-1 * var(--card-px, 1.15em)) 0.75em;
  border-radius: inherit;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  object-fit: cover;
}
.cards li > :is(p, figure):first-child { margin-top: 0; }
.cards li figure.figure-img { margin: 0; }
.cards li figure.figure-img figcaption { display: none; }

/* ── rows: the card row turned ninety degrees ────────────────────────
   Term in a card on the left, body beside it, several stacked. The list is
   the grid and each item dissolves into it (display: contents), so the
   term column is one width for every row - which is the whole point, and
   what a per-item grid could not give.

   align-items: center is the vertical middle the shape asks for: a term of
   one line beside a body of three should sit against the body's middle,
   not its first line. */
.cards.rows {
  display: grid;
  /* The anchor acts here, and until this line it did not: align-items was
     center unconditionally, so top and middle rendered identically -
     a word an author could write that moved nothing, which is the silent
     no-op this format refuses everywhere else. */
  align-items: var(--row-anchor, center);
  /* A definite share rather than an intrinsic track. Both intrinsic
     keywords were measured and both failed: auto resolves toward
     min-content under pressure, and the term inherits overflow-wrap from
     the card rule, so its min-content is one character - the column came
     out one letter wide. max-content then resolved to 0px with an item
     78px wide in it. A fraction is predictable, needs no puzzle, and a
     term column of about a third is what the shape wants anyway. */
  grid-template-columns: minmax(6em, 0.38fr) minmax(0, 1fr);
  column-gap: calc(1.1em * var(--card-fs, 1));
  row-gap: calc(0.7em * var(--card-fs, 1));
}
.cards.rows > ul, .cards.rows > ol { display: contents; }
.cards.rows > ul > li, .cards.rows > ol > li {
  display: contents;
}
/* The term is the card. Everything a card ground does is reached through
   the same custom properties, so every ground, corner and size works here
   with no second implementation. */
.cards.rows li > :is(strong, b):first-child {
  display: block;
  grid-column: 1;
  margin: 0;
  padding: var(--card-py, 1.05em) var(--card-px, 1.15em);
  background: var(--card-bg, none);
  border: var(--card-border, 0);
  border-radius: 10px;
  align-self: center;
  text-align: var(--card-align, left);
  font-size: calc(1em * var(--card-fs, 1));
  line-height: 1.25;
  /* A single long term cannot wrap between words, so it hyphenates - and
     if it is longer than even that allows, it breaks rather than running
     across the body beside it. */
  /* Hyphenation first and breaking only as the floor: Technocracy came
     out as Technocrac / y when break-word got there first, which is
     worse than the ragged edge it prevented. */
  hyphens: auto;
  overflow-wrap: break-word;
  hyphenate-limit-chars: 7 3 3;
}
.cards.rows.ck-square li > :is(strong, b):first-child { border-radius: 0; }
/* The body is the anonymous run after the term. It is prose beside a card
   rather than a second card, so it takes no ground and stays at the
   chunk's own size - a row whose two halves are both cards reads as a
   two-column table, which is a different thing and has a statement. */
/* On a row, align names how the *term* sits in its card - the term is
   the card, and the body is prose beside it. Centring a definition's body
   is not a thing anyone wants, so the body ranges left whatever the row
   says, and the slot keeps meaning one thing rather than two. */
.cards.rows li > .row-body {
  grid-column: 2;
  align-self: var(--row-anchor, center);
  text-align: left;
  min-width: 0;
}
.cards.rows li > :is(strong, b):first-child + br { display: none; }
/* The ground rules below do reach a row's li - it is still > ul > li - but
   a contents-display item paints nothing, so everything they say through a
   custom property arrives at the term and everything they paint directly
   has to be restated here. The accent ground's reversed ink is the third
   case, neither of those two: it is inherited, so it arrived at the *body*
   as well and made it invisible. That one is fixed where the ground is
   declared, by putting the ink on the term rather than on the item. */
.cards.rows.cg-paper li > :is(strong, b):first-child {
  box-shadow: 0 1px 2px oklch(0.2 0.01 260 / 0.10), 0 6px 20px oklch(0.2 0.01 260 / 0.10);
}

/* size - one decision for the row, never per card: three sizes in one row
   read as a mistake rather than as a hierarchy. */
/* Padding is in em, so it already scales with the card's own font size,
   and at large that was too much of a good thing: measured on a 4-up row
   of single words, a 231px card carried 39.8px of padding on each side and
   left 151px of inner width for a word 153.7px wide. The word overflowed
   its own content box, and centred text that overflows shifts - which is
   what read as "not centred". Small type gets proportionally more air, big
   type less, which is the opposite of what was written here first. */
.cards.cs-large  { --card-fs: 1.4;  --card-py: 0.62em; --card-px: 0.7em; }
.cards.cs-medium { --card-fs: 1;    --card-py: 1.05em; --card-px: 1.15em; }
.cards.cs-small  { --card-fs: 0.84; --card-py: 1.2em;  --card-px: 1.3em; }
/* ground - one device, never two. Five is the whole list: filled,
   outlined, nothing, the accent, the paper. Anyone who wants a sixth
   wants a drawing, and there is a language for that. */
.cards.cg-panel   { --card-bg: color-mix(in oklch, var(--ink) 5%, transparent); }
/* 2px, not 1. A hairline is a print value: on a projector one CSS pixel is
   at or below the limit of what the room can resolve, so the outline read
   as a rendering fault rather than as a border. Grey rather than dark,
   because the card is a container and not a callout. */
.cards.cg-outline { --card-border: 2px solid color-mix(in oklch, var(--ink) 22%, transparent); }
/* The accent, with its own ink. Written as token overrides rather than a
   colour per element for the reason every other inverted surface here is:
   everything downstream already reads --ink and --emph, so one block
   covers the type, the bold fragments and any rule inside the card. */
/* The fill reads --emph and the ink overrides do NOT redefine it, which is
   the whole of the fix: a declaration that uses var(--emph) resolves against
   this element's own --emph, so redefining it in the same block made the
   accent card paper-coloured on paper - invisible, text and all. Bold
   fragments take currentColor instead, which is what --emph was being
   bent to do. The overlay card had the identical defect and never showed
   it, because no test had ever rendered one. */
.cards.cg-accent > ul > li,
.cards.cg-accent > ol > li,
.cards.cg-accent > :not(ul):not(ol) {
  --card-bg: var(--emph);
}
/* The reversed ink goes on whatever the fill is painted on, and in a row
   block that is the term alone. The li there is display: contents and
   spans both columns, so ink declared on it reached the body beside the
   card as well - and the body has no fill behind it. Measured in the
   tutorial's #rows: oklch(0.98 0 0) text on an oklch(0.98 0 0) page, an
   810x87 box laid out correctly and impossible to see. The fill itself
   stays on the li above, because --card-bg is a custom property and the
   term picks it up by inheritance; only the colours have to move. */
.cards:not(.rows).cg-accent > ul > li,
.cards:not(.rows).cg-accent > ol > li,
.cards:not(.rows).cg-accent > :not(ul):not(ol),
.cards.rows.cg-accent li > :is(strong, b):first-child {
  color: var(--paper);
  --ink: var(--paper);
  --ink-soft: color-mix(in oklch, var(--paper) 78%, transparent);
}
.cards.cg-accent strong, .cards.cg-accent b { color: currentColor; }
/* The paper itself, which only reads as a card when the slide behind it is
   not paper - on a tinted or dark ground, or over a backdrop. It carries a
   shadow rather than a border for that reason: the edge has to come from
   depth, because there is no tint to separate it. */
.cards.cg-paper > ul > li,
.cards.cg-paper > ol > li,
.cards.cg-paper > :not(ul):not(ol) {
  --card-bg: var(--paper);
  box-shadow: 0 1px 2px oklch(0.2 0.01 260 / 0.10), 0 6px 20px oklch(0.2 0.01 260 / 0.10);
}
/* photo - the card's first picture becomes its ground rather than a band
   across its top. The image is the same <img> the bleeding rule handles;
   here it is taken out of the flow and stretched behind the text, which is
   why the two are alternatives and not a combination.

   The scrim is a pseudo-element over the picture and under the words, and
   it is the theme's own paper: that is what keeps ordinary ink legible on
   a photograph in all seven themes and in dark mode without a second
   palette. invert darkens instead and re-points the ink tokens, exactly
   as ::: backdrop does - one vocabulary, two places. */
.cards.cg-photo > ul > li,
.cards.cg-photo > ol > li,
.cards.cg-photo > :not(ul):not(ol) {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 7em;
}
.cards.cg-photo li > :is(p, figure):first-child > img:only-child,
.cards.cg-photo li > img:first-child,
.cards.cg-photo li > figure.figure-img:first-child img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  border-radius: inherit;
  object-fit: cover;
  z-index: -2;
}
.cards.cg-photo li > figure.figure-img:first-child { position: static; margin: 0; }
.cards.cg-photo li::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
}
.cards.cg-photo.cx-veil li::before {
  background: color-mix(in oklch, var(--paper) 78%, transparent);
}
.cards.cg-photo.cx-invert li::before {
  background: color-mix(in oklch, oklch(0.14 0.015 260) 62%, transparent);
}
.cards.cg-photo.cx-plain li::before { content: none; }
/* An inverted card re-points the ink tokens rather than restating a colour
   per element, and it restates color for the same reason .chunk
   [data-backdrop=invert] does: color: var(--ink) is computed where it is
   declared, so redefining the token alone changes nothing already resolved. */
.cards.cg-photo.cx-invert > ul > li,
.cards.cg-photo.cx-invert > ol > li,
.cards.cg-photo.cx-invert > :not(ul):not(ol) {
  color: var(--ink);
  --ink: oklch(0.99 0 0);
  --ink-soft: oklch(0.99 0 0 / 0.76);
  --emph: oklch(0.90 0.10 75);
}

/* corner - shape, not ground, so the two compose. */
.cards.ck-round  > ul > li, .cards.ck-round  > ol > li, .cards.ck-round  > :not(ul):not(ol) { border-radius: 10px; }
.cards.ck-square > ul > li, .cards.ck-square > ol > li, .cards.ck-square > :not(ul):not(ol) { border-radius: 0; }
/* No box at all: the gutter is what separates the cards, so it has to be
   wide enough to do that on its own, and the padding goes away with the
   ground it was insetting from. */
.cards.cg-clear   { --card-py: 0; --card-px: 0; }
.cards.cg-clear   { gap: calc(2.1em * var(--card-fs, 1)); }
.cards.ca-left   { --card-align: left; }
.cards.ca-center { --card-align: center; }
.cards.cv-top    { --card-anchor: flex-start; --row-anchor: start; }
.cards.cv-middle { --card-anchor: center;     --row-anchor: center; }
/* detail - the levels under the first. On the projection they are folded
   away, so the card carries the headline and the document carries the
   hierarchy; pressing C is what brings them back, and it needs no second
   markup because the nested list is already there. Print defines no
   data-collapse at all, so a hand-out always has them. */
[data-collapse=topic-bold] .cards.cd-fold li ul,
[data-collapse=topic-bold] .cards.cd-fold li ol { display: none; }
/* page is the same hiding with no collapse condition on it: the levels
   under the first are never on the projection, whatever C says. Print
   carries no data-collapse and no cd-page rule, so the document has them. */
.cards.cd-page li ul,
.cards.cd-page li ol { display: none; }
/* Shown, the nested level is an indented hierarchy rather than a second
   flat run - which is the whole reason to write one. */
.cards li ul, .cards li ol {
  margin: 0.35em 0 0;
  padding-left: 1.1em;
  list-style: disc;
  font-size: 0.88em;
  color: var(--ink-soft);
  text-align: left;
  /* Said out loud, because it used to be free: while the card was a flex
     column this list was a flex item and therefore a formatting context of
     its own, so its first and last item's margins stayed inside it. In an
     ordinary block they collapse out through its edges, which took 10.4px
     out of every second level in the repository and moved one decoration
     slide to a different auto-fit step. The containment was load-bearing
     and nothing had ever said so. */
  display: flow-root;
}
.cards li li { display: list-item; }
.cards li ul li::marker, .cards li ol li::marker { content: none; }
.cards li ul li { list-style: none; position: relative; padding-left: 0.75em; }
/* The dash sits on the middle of the item's first line box, and says so:
   0.5lh is half the line height that actually applies to this element, and
   the translate takes the rule's own thickness out of the sum. It was a
   flat 0.62em, which is a guess at half a line and was wrong for the line
   that is there - the nested level is set at 0.88em with its own leading,
   so the dash rode above the optical centre of the words beside it. In lh
   it stops depending on the size, the leading and the face, which is the
   whole reason to name the unit. */
.cards li ul li::before {
  content: '';
  position: absolute; left: 0; top: 0.5lh;
  transform: translateY(-50%);
  width: 0.28em; height: 1px;
  background: currentColor;
  opacity: 0.55;
}
.cards > ul > li::marker, .cards > ol > li::marker { content: none; }
.cards li > :first-child, .cards > div > :first-child { margin-top: 0; }
.cards li > :last-child, .cards > div > :last-child { margin-bottom: 0; }
.cards p { margin: 0 0 0.45em; }
/* A card is a container, so it does not fold to one column when the
   projection collapses – three things stay three things. What collapse
   still does inside one is abridge its prose, which is the same rule
   everywhere else. */
/* :not(.rows) is load-bearing: with a body attribute this selector
   outranks .cards.rows, so without it the collapse rule handed a row
   block the column grid and the term track resolved to 0px - an item 78px
   wide in a track of nothing. The rule itself only exists to stop a card
   row folding to one column the way .cols does. */
body[data-collapse=topic-bold] .cards:not(.rows) { grid-template-columns: repeat(var(--card-n), minmax(0, 1fr)); }

/* section divider slide: opens each named column ('# Heading').
   Centered like a part-title page so the camera has a clear stop
   before the first chunk of the section. */
/* A divider owns the whole slide. At the 40% min-height every chunk gets,
   tinted painted a band across the middle third with paper above and
   below it - the same trap the backdrop and the cover both fell into. */
.chunk-section { align-items: center; min-height: var(--slide-h); }
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
/* The PARAGRAPH SIGN that used to sit here is gone. It is a legal-citation
   mark - it reads as a statute number rather than as "section" to anyone
   outside a German law faculty - and on a projection it was a small grey
   glyph nobody could place. section-mark: Teil puts a word there
   instead, and saying nothing puts nothing there. */

/* ── section dividers ────────────────────────────────────────────────
   A divider says "a new part starts here, and it is part of the thing you
   are already in". Every variant below is therefore quieter than the cover
   it must not be mistaken for: no variant uses the title's scale, and the
   two that take a ground take it lightly. */
.chunk-section .section-mark {
  font-family: var(--sans-font);
  font-size: calc(0.42em * var(--zoom));
  font-weight: 500;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  margin-bottom: 0.35em;
}
/* The counter is the one mark that is not small caps: a numeral read
   across a room wants size, not spacing. */
.chunk-section .section-mark.section-num {
  /* Big enough to be the thing the room sees first, and still short of the
     cover's own scale - a divider that reads as a title has failed. */
  font-size: calc(3.2em * var(--zoom));
  font-variant-caps: normal;
  letter-spacing: -0.02em;
  font-weight: 600;
  color: var(--emph);
  line-height: 1;
  margin-bottom: 0.25em;
}
/* The divider's own content. It sits under the heading and is deliberately
   quiet: a divider that competes with the title slide has failed, and a
   divider that competes with its own heading has failed twice. A quotation
   is the case this exists for, so a blockquote here loses the bar and the
   indent a blockquote carries in a chunk - the words are the slide, and a
   rule beside them is a second thing to look at. */
.chunk-section .section-body {
  margin-top: 1.1em;
  max-width: 30em;
  font-size: calc(1.02em * var(--zoom));
  color: var(--ink-soft);
}
.chunk-section .section-body > :first-child { margin-top: 0; }
.chunk-section .section-body > :last-child { margin-bottom: 0; }
.chunk-section .section-body blockquote {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--serif-font);
  /* No second var(--zoom): the em here is .section-body's, which has already
     been multiplied by it. Written the other way the quotation grew with the
     square of the zoom while the part title and the agenda grew with the
     zoom - invisible at 1.0, and at the zoom auto-fit picks for a divider it
     was the largest thing on a slide whose whole job is to be quiet. */
  font-size: 1.35em;
  line-height: 1.3;
  color: var(--ink);
  text-wrap: pretty;
}
.chunk-section .section-body blockquote p { margin: 0 0 0.4em; }
.chunk-section .section-body blockquote > :last-child { margin-bottom: 0; }
/* A figure on a divider is the slide, so it gets the room a cover figure
   gets rather than the room a paragraph gets. */
.chunk-section .section-body figure { margin: 0; }
/* …and it sits *beside* the heading rather than under it. Stacked, a part
   title, an agenda and a drawing are three blocks down one axis with nothing
   balancing them across it - which is the busy, unresolved column the
   composition produced the first time. The same reasoning the beside cover
   follows, and it applies for the same reason: a drawing is a shape, and a
   shape wants the axis the words are not using.
   Only for a body that is *nothing but* a picture: prose under a heading is
   a lede and reads correctly stacked, which is what a quotation divider is.
   :has(> figure:only-child) is that test, written where the compiler already
   put the answer rather than being decided again in the parser. */
.section-lead { display: contents; }
.chunk-section .chunk-content:has(> .section-body > figure:only-child) {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  align-items: center;
  column-gap: 2.4em;
}
/* One row, two cells. The lead stops dissolving here and becomes the left
   cell, which is the whole of the fix: as separate grid rows the mark and the
   heading were pushed apart by the height the spanning figure forced into
   every row they sat in. */
.chunk-section .chunk-content:has(> .section-body > figure:only-child) > .section-lead {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  grid-column: 1;
  grid-row: 1;
}
.chunk-section .chunk-content:has(> .section-body > figure:only-child) > .section-body {
  grid-column: 2;
  grid-row: 1;
  margin-top: 0;
  max-width: none;
  align-self: center;
}
.chunk-section .chunk-content:has(> .section-body > figure:only-child) .section-body svg {
  max-height: calc(var(--slide-h) * 0.68);
}
.chunk-section .section-body svg {
  width: auto; height: auto;
  max-width: 100%;
  max-height: calc(var(--slide-h) * 0.52);
}
/* A divider with a picture behind it needs the full slide, like every other
   chunk that carries one - the shared rule keys on data-has-backdrop and is
   already there; this is the centring the divider itself needs so the
   heading does not sit on the picture's own subject by accident. */
.chunk-section[data-has-backdrop] .chunk-content { position: relative; z-index: 1; }

/* tinted - the whole slide takes the accent, at the strength that still
   leaves ordinary ink legible on it in all seven themes. This is the
   ten-metre signal: from the back of a room the colour arrives before any
   word does. */
.chunk[data-section=tinted] {
  background: color-mix(in oklch, var(--emph) 12%, var(--paper));
}
.chunk[data-section=tinted] .section-heading { color: var(--ink); }
/* rule - the heading between two rules across the measure. The quietest of
   the four, and the one that survives a monochrome print. */
.chunk[data-section=rule] .chunk-content { align-items: stretch; }
.chunk[data-section=rule] .section-heading {
  border-bottom: 3px solid var(--rule);
  padding: 0 0 0.3em;
}
/* card - the heading on a panel, which is the card vocabulary borrowed
   rather than a fifth thing to learn. */
.chunk[data-section=card] .chunk-content { align-items: flex-start; }
.chunk[data-section=card] .section-heading {
  background: color-mix(in oklch, var(--ink) 5%, transparent);
  border-radius: 10px;
  padding: 0.5em 0.7em;
}
/* number - the counter carries the weight, so the heading steps back. */
.chunk[data-section=number] .section-heading { font-size: calc(2.1em * var(--zoom)); }

/* outline - the running agenda, and the only divider that is a different
   slide rather than a treatment of the heading. It answers the question a
   long lecture keeps raising and a coloured field cannot: not "a new part
   starts" but "which part, out of how many, and how far in are we".

   It is also the recurring element that fights monotony, which is why it
   earns its place next to four treatments of one heading: the room meets
   the same list four or six times and learns the shape of the hour from
   it. That only works if the list is stable, so the items are the columns
   in source order and nothing about the slide changes but which one is
   live.

   Three states, and the difference between them is deliberately not three
   greys. Two greys a projector can tell apart, three it cannot; what
   carries progress is the *position* of the live item as it walks down the
   list, and the fade only has to say "not this one". Size and weight do
   the rest, which is why the current item needs no ground, no rail and no
   marker of its own. */
.chunk[data-section=outline] .chunk-content { align-items: flex-start; }
/* One grid for the whole list, with every item dissolved into it - the same
   trick ::: rows uses, and for the same reason. A grid per item sizes its own
   first column, so with the live row set 1.6x larger than the rest the text
   would start at two different x positions and the list would stop being a
   list. Here the numeral column is as wide as the widest numeral and every
   heading begins on one edge.

   display: contents keeps the <li> in the tree for inheritance, which is what
   lets the state selectors set a *row* font-size that both spans pick up. It
   also means the row can carry no colour of its own - which is fine, because
   the colour moved onto the spans anyway. */
.section-outline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 0.55em;
  row-gap: 0.62em;
  text-align: left;
  line-height: 1.2;
}
/* The zoom is applied once, where the list starts, and where that is depends
   on which of the two things this list is. A divider hangs it off
   .chunk-content, which is not zoomed, so the list itself carries the zoom;
   an outline: chunk puts the same list inside .chunk-body, which has
   already applied it, and the rows inherit it through their em. Written on
   the rows, it was applied twice in the chunk and once on the divider - one
   list obeying two laws, and the chunk grew with the square of the zoom. */
.chunk-section .section-outline { font-size: calc(1em * var(--zoom)); }
.section-outline li { display: contents; font-size: 1.02em; }
/* An outline chunk placed before the first part has nothing to recede from:
   a list nobody has started is a plan, and a plan is read at full strength.
   The numeral still steps back, because it is an index and not a word. */
.section-outline li[data-state=all] .so-num {
  color: color-mix(in oklch, var(--ink) 55%, var(--paper));
}
/* The agenda as an authored slide rather than a generated divider: it sits
   under a heading in the ordinary content column, so it needs the air a
   list gets after prose and none of the divider's centring. */
.chunk-outline .section-outline { margin-top: 0.5em; }
/* The measure is capped per row and not on the list, and that is the whole
   of it: an em on the <ol> is the *small* rows' em, so a cap that suits them
   is 1.6x too tight for the live row - which then wrapped after four words
   while a quotation under it on the same slide ran half again as wide.
   Written on the cell, each row is bounded in its own type size. */
.so-text { max-width: 26em; }
/* The numerals are set at their own row's size, which is what makes baseline
   alignment read as deliberate. At one small size for every row they sat on
   the live row's baseline - a footnote marker hanging under a headline, which
   is exactly what it looked like. Right-aligned, so the column has one edge
   whatever the digits measure. */
.so-num {
  font-family: var(--sans-font);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: 0.01em;
  text-align: right;
  color: color-mix(in oklch, var(--ink) 45%, var(--paper));
}
/* Recession is one mix toward the paper, not opacity over soft ink. Stacked,
   those two dim twice: in terminal-green --ink-soft is already L 0.58 against
   an L 0.11 ground, and 0.3 opacity on top put the coming parts at L 0.25 -
   invisible from the back of a room. One mix is also the idiom the rest of
   this stylesheet uses for exactly this. */
.section-outline li[data-state=done] .so-text {
  color: color-mix(in oklch, var(--ink) 62%, var(--paper));
}
.section-outline li[data-state=next] .so-text {
  color: color-mix(in oklch, var(--ink) 42%, var(--paper));
}
.section-outline li[data-state=next] .so-num {
  color: color-mix(in oklch, var(--ink) 32%, var(--paper));
}
/* The live item. The accent is on the numeral alone - it is the one mark
   that says which of them this is, and it says it in the column that
   exists to number them. Putting it on a bar beside the type instead is
   the machine-made layout this project took an accent rail out for. */
.section-outline li[data-state=now] { font-size: 1.6em; }
/* The live row needs its own air, and it cannot come from row-gap: the gap
   is one number for every row, and this row is 1.6x the others - at a gap
   that suits the small rows it sits shoulder to shoulder with them, and at
   one that suits it the whole list falls apart. Padding on the row's own
   cells is the per-row spacing a grid does not otherwise offer, and it goes
   on *both* cells so the two stay on one baseline. Written in the row's own
   em, so it scales with whatever size the live row is set to. */
.section-outline li[data-state=now] .so-num,
.section-outline li[data-state=now] .so-text { padding: 0.16em 0; }
.section-outline li[data-state=now] .so-num { color: var(--emph); }
.section-outline li[data-state=now] .so-text {
  color: var(--ink);
  font-weight: 600;
  letter-spacing: -0.014em;
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
/* The affordance sits in the *slide's* left gutter, not beside the content
   column, and it is a sibling of .chunk-content for exactly that reason: as
   a child it was positioned against the measure, so on a wide chunk or a
   narrow window it had nowhere to be but on top of the words. The gutter is
   the chunk's own padding and the measure is the middle grid track, so from
   out here it cannot reach the text whatever the width class says. Below the
   width where the gutter stops being a gutter it is not drawn at all - a
   hint for a key nobody has to be told about is not worth a collision. */
.annot-add {
  position: absolute;
  top: var(--slide-pad-y);
  left: 0.4em;
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
@media (max-width: 780px) { .annot-add { display: none; } }

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
.exp-chev .caret { opacity: 0.55; }
.exp-chev.on { color: var(--paper); background: var(--ink); border-color: var(--ink); }
.exp-chev.on .caret { opacity: 1; }
.chunk:not(.active) .exps { display: none; }

/* expanded: split the slide grid into content-left + expansion-right.
   Exp-body gets a bit of extra breathing room (36em vs. 30em) so that
   standard-width code blocks fit without horizontal scroll.

   The 36em cap has never been what decides the width, and reading the rule
   as though it were sends you to the wrong line. A closed chunk is one text
   column between two 1fr gutters, and it can afford a 14% margin on each
   side; an expanded one has two panels and the same margin leaves them 72%
   of the slide to share. Measured at three window sizes, both tracks came
   out at 21.0em (1440) and 23.4em (1920) - equal, because neither reaches
   its cap, so the free space is split evenly - and identical on a narrow,
   a wide and a full chunk. 21em is narrower than the *narrow* width class,
   and the pane scrolled in every case. So the margin is what gives, and it
   is set as the variable rather than as a padding property: .exps and
   .chunk-num are positioned against --slide-pad-x too, and trimming only the
   box's own padding would have left the chevrons standing 14% in, on top of
   the pane. Centred
   because a narrow chunk beside a 36em pane no longer fills the row. */
.chunk.expanded {
  --slide-pad-x: 6%;
  grid-template-columns: minmax(0, var(--content-w, 36em)) minmax(0, 36em);
  gap: 4%;
  justify-content: center;
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
/* A backdrop belongs to its own slide and to no other. Neighbouring chunks
   are dimmed rather than hidden - at --dim 1 they sit at 4% - which is
   invisible for a paragraph and very much not invisible for a photograph:
   the slide above showed as a grey band across the top of the one you were
   reading, and a revealed backdrop, being a clipped rectangle, showed as a
   grey block in a corner. Text at 4% is a rumour; a picture at 4% is a
   picture. So the ground goes to zero off the active slide and comes back
   with it, a little faster than the chunk's own fade so it has arrived by
   the time the camera lands. */
.chunk:not(.active) .chunk-backdrop { opacity: 0; }
.chunk-backdrop { transition: opacity 260ms ease; }

/* Prose in the live views had no line-breaking treatment at all, and the
   omission was invisible because the mode the room usually sees is the
   collapsed one, which the rule below balances. Press C once and every
   paragraph fell back to greedy wrapping: measured over the tutorial's 59
   multi-line paragraphs in reading mode, 31% ended on a line under a quarter
   of the measure - one word alone under a full line (822px then 57px, 938
   then 233, 832 then 158). pretty is the answer to exactly that and no more:
   it keeps the measure and protects the last line, where balance would even
   every line of a paragraph that is meant to read as prose.

   The document views have had this since 1.0.0; this is the same pair of
   lines from PRINT_CSS, minus dd, because the only dl in a live view is the
   help overlay's key table and a key is not a paragraph. Both selectors
   below it are more specific and keep winning: the collapsed slide line
   stays balanced, and a card stays pretty for its own reason.

   The guard travels with it. body:not([data-wrap=none]) is the
   style: {wrap: none} switch a finished deck uses to refuse a re-wrap, and
   a rule that skips it re-breaks the lines of a lecture whose author has
   said no. */
body:not([data-wrap=none]) :is(p, li) { text-wrap: pretty; }

/* collapse modes (§4.5) – applied per reveal-segment.
   Two states only: 'none' (show everything) and 'topic-bold'
   (topic sentence + promoted bold fragments). */
/* A collapsed slide line is a phrase, not a paragraph: what is on screen is
   the topic sentence plus the promoted bold fragments, each a clause or two.
   Measured on the tutorial and the diagram lecture before this rule, second
   lines ran at 8-30% of the first - one or two words stranded under a full
   line. balance evens them. It is scoped to the collapsed mode on purpose:
   in the reading mode the same paragraph is prose again, and prose wants
   pretty (protect the last line) rather than balance (even every line).
   The bold fragments are already display:block below, so the rule reaches
   them directly; the topic sentence is balanced through its own p. */
body:not([data-wrap=none]) :is(
  [data-collapse=topic-bold] .reveal-segment p,
  [data-collapse=topic-bold] .reveal-segment li,
  [data-collapse=topic-bold] .reveal-segment .sentence-rest strong) { text-wrap: balance; }
/* A card item is not a slide line, and balancing it is wrong: balance
   equalises line lengths, so a three-line card comes out as three short
   ragged lines with the column half empty. pretty fills the measure and
   only protects the last line, which is what a box of prose wants. */
body:not([data-wrap=none]) .cards li,
body:not([data-wrap=none]) .cards > :not(ul):not(ol) { text-wrap: pretty; }

/* Headings are phrases in every mode, so they balance whatever the collapse
   setting is - and unlike the slide lines they are the same in the live views
   and on paper. Measured on the tutorial at 1100px, the cover subtitle was
   the last runt left after the rule above. */
body:not([data-wrap=none]) :is(h1, h2, h3, h4, .chunk-heading, .hd-sub,
  .section-heading, figcaption, .tag-label, #toc-panel li) { text-wrap: balance; }

/* The same four rules answered on one chunk, from a .wrap-none /
   .wrap-balance in its attribute tail. Both directions: under a deck-wide
   wrap: none there is otherwise no way left to ask for balancing back.
   text-wrap: wrap is the shorthand's initial value, so the off switch hands
   the line to the browser's plain greedy breaker rather than inventing a
   third behaviour.

   #stage is load-bearing and not decoration. The heading rule above carries
   an id (#toc-panel li rides in its :is list), so it sits at one id, and a
   chunk-scoped rule made of classes alone loses to it however many classes
   it stacks. #stage is the element every chunk in both live views is inside,
   which makes it the honest way to say "this is a slide, not the chrome" and
   buys the id the cascade is asking for. The rules keep the base sheet's own
   order and relative weights, so a .wrap-balance chunk under a deck-wide
   wrap: none breaks exactly the way the same chunk breaks in a deck that
   said nothing - collapsed slide lines balanced, cards pretty, and the
   collapsed rule winning over the card rule the way it already does. */
#stage .chunk[data-wrap=none] :is(p, li, h1, h2, h3, h4, .chunk-heading,
  .hd-sub, .section-heading, figcaption, .tag-label, .sentence-rest strong,
  .cards > :not(ul):not(ol)) { text-wrap: wrap; }
#stage .chunk[data-wrap=balance] :is(p, li) { text-wrap: pretty; }
#stage .chunk[data-wrap=balance] .cards li,
#stage .chunk[data-wrap=balance] .cards > :not(ul):not(ol) { text-wrap: pretty; }
#stage .chunk[data-wrap=balance] :is(h1, h2, h3, h4, .chunk-heading, .hd-sub,
  .section-heading, figcaption, .tag-label) { text-wrap: balance; }
#stage .chunk[data-wrap=balance] :is(
  [data-collapse=topic-bold] .reveal-segment p,
  [data-collapse=topic-bold] .reveal-segment li,
  [data-collapse=topic-bold] .reveal-segment .sentence-rest strong) { text-wrap: balance; }

/* ── where a block sits across the slide (style.blocks) ──────────────
   Three things on a slide are not prose and have always been centred: a
   code block, a figure with its caption, a display formula. Centred is
   right when the block is the slide, and wrong when it is one step of an
   argument - a paragraph, then a formula, then a paragraph reads as three
   blocks on three axes. The left value puts all three on the prose's axis.

   Which thing moves is not the same for all three, and the difference is
   worth knowing before editing this. A top-level pre already breaks out of
   the text column to 72vw; what centres it is left: 50% plus the translate,
   so the *box* moves and the listing inside it was left-aligned all along.
   A figure and a formula are already the full measure, so it is the artwork,
   the caption and the equation *inside* the box that move.

   The left-hand max-width is exact rather than cautious. A column centred on
   the slide has (slide - column) / 2 to its left, so the room between its
   left edge and the content area's right edge is 0.36 x slide + half the
   column - which is what the calc says, and what keeps a wide listing inside
   the same 72vw the centred one gets without ever crossing the slide's
   padding. It holds at every chunk width, and for a figure: chunk too, whose
   .chunk-body is narrower than its .chunk-content and centred inside it.

   A ::: draw is deliberately not here. Its svg is emitted 2000px wide under
   max-width: 100%, so it fills the measure whatever the chunk width is and
   has no space beside it to sit in.

   #stage for the same reason as the wrap rules above: it keeps every rule
   here off the focus overlay, whose clone of a figure is a modal card and
   is centred because a modal card is centred, not because the slide is. */
body[data-blocks=left] #stage .reveal-segment > pre,
body[data-blocks=left] #stage .reveal-segment > div > pre,
body[data-blocks=left] #stage .chunk-content > .reveal-segment > pre,
#stage .chunk[data-blocks=left] .reveal-segment > pre,
#stage .chunk[data-blocks=left] .reveal-segment > div > pre,
#stage .chunk[data-blocks=left] .chunk-content > .reveal-segment > pre {
  left: 0;
  transform: none;
  max-width: calc(var(--slide-w) * 0.36 + 50%);
}
body[data-blocks=left] #stage figure.figure-img,
body[data-blocks=left] #stage figure.figure-video,
body[data-blocks=left] #stage figure.figure-embed,
#stage .chunk[data-blocks=left] figure.figure-img,
#stage .chunk[data-blocks=left] figure.figure-video,
#stage .chunk[data-blocks=left] figure.figure-embed { align-items: flex-start; }
body[data-blocks=left] #stage figure.figure-img figcaption,
#stage .chunk[data-blocks=left] figure.figure-img figcaption { text-align: left; }
body[data-blocks=left] #stage .math-display .katex-display,
body[data-blocks=left] #stage .math-display .katex-display > .katex,
#stage .chunk[data-blocks=left] .math-display .katex-display,
#stage .chunk[data-blocks=left] .math-display .katex-display > .katex { text-align: left; }

/* And back again, for one chunk in a deck that set blocks: left. Every
   declaration is the value the base sheet already gives an unset deck, so
   .blocks-center is a no-op wherever there is nothing to undo. */
#stage .chunk[data-blocks=center] .reveal-segment > pre,
#stage .chunk[data-blocks=center] .reveal-segment > div > pre,
#stage .chunk[data-blocks=center] .chunk-content > .reveal-segment > pre {
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(var(--slide-w) * 0.72);
}
#stage .chunk[data-blocks=center] figure.figure-img,
#stage .chunk[data-blocks=center] figure.figure-video,
#stage .chunk[data-blocks=center] figure.figure-embed { align-items: center; }
#stage .chunk[data-blocks=center] figure.figure-img figcaption { text-align: center; }
#stage .chunk[data-blocks=center] .math-display .katex-display,
#stage .chunk[data-blocks=center] .math-display .katex-display > .katex { text-align: center; }
/* Hyphenation on the projection, which is off unless the author asks.
   style: {hyphenate: all} is the ask, and the reason it is a key rather
   than a default is in PRINT_CSS: a broken word reads badly across a room
   and a live view reflows under the reader's hands. What makes it worth
   having anyway is a German deck at .narrow, where one compound noun opens
   a hole in the measure that no rewriting closes - which is also why the
   dictionary still comes from lang: de and this key cannot supply it.

   Scoped to the stage, so it is the slide's prose and never the chrome: a
   TOC entry, a search hit and the help sheet are lists a reader scans, and
   a broken word in one of those is only harder to scan. And the same
   manual reset PRINT_CSS carries, for the same reason - hyphens inherits,
   and a hyphenated identifier or URL is wrong in any view. */
body[data-hyphenate=all] #stage :is(p, li, blockquote, figcaption) {
  hyphens: auto;
  -webkit-hyphens: auto;
  hyphenate-limit-chars: 6 3 3;
}
body[data-hyphenate=all] #stage :is(h1, h2, h3, h4, .chunk-heading, .hd-sub,
  .section-heading, code, pre, pre *, .chunk-num, a[href^="http"]) {
  hyphens: manual;
  -webkit-hyphens: manual;
}

[data-collapse=topic-bold] .reveal-segment .sentence-rest .prose { display: none; }
[data-collapse=topic-bold] .reveal-segment .sentence-rest strong {
  display: block;
  margin: 0.35em 0 0 1.5em;
  position: relative;
}
/* style.bold - the look of a bold the derivation reads, promoted bullet and
   topic-sentence bold alike, default plain. See BOLD_LOOKS and
   DERIVED_STRONG; the speaker view embeds this stylesheet and carries the
   same body attribute, so it shows what the room sees. */
${boldLookCss('bold', 'plain', 'var(--bold-weight)')}
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
/* The mark after an external link. Sized in the surrounding em so it tracks
   the type at every zoom, and set in --ink-soft so it reads as a mark on the
   line rather than as a second word: at full ink a row of links comes out as a
   row of little black squares. It is what makes the address and its code
   findable at all - up to 1.0.0 the only way in was Shift-click. */
.link-code {
  appearance: none;
  border: 0;
  background: none;
  /* A button does not inherit font-size, so every em inside this rule used
     to resolve against the UA's own 13.33px however large the slide was
     set. Measured on a projection: link text 28.4px, mark 10.4px - 37% of
     the text, and pinned there, so the larger the type the smaller the
     affordance looked. Inheriting the font is what makes an em here mean
     what it means everywhere else in this stylesheet. */
  font: inherit;
  padding: 0 0.1em;
  margin-left: 0.2em;
  cursor: pointer;
  /* The mark belongs to the link, so it takes the link's colour. In soft
     ink it read as punctuation that had gone wrong. */
  color: var(--emph);
  vertical-align: baseline;
  line-height: 1;
}
.link-code svg {
  /* Cap height, near enough: the mark sits in a line of text and should
     read as one of its glyphs rather than as a footnote to it. */
  width: 0.72em;
  height: 0.72em;
  fill: currentColor;
  vertical-align: -0.04em;
}
.link-code:hover, .link-code:focus-visible { color: var(--emph); }
.link-code:focus-visible { outline: 2px solid var(--emph); outline-offset: 2px; border-radius: 2px; }
body[data-link-codes=off] .link-code { display: none; }

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
/* Where forward will take you. Sits at the viewport edge, not on the slide,
   so nothing in the author's layout moves for it; painted in --ink-soft at a
   fifth of full strength, which reads as a compass on a projection and
   disappears in a photograph of one. It appears when forward has nothing left
   to reveal and will leave the column next.
   There were two more, at the left and right edges, saying that the sideways
   arrows changed column on this chunk. They changed column on one chunk per
   column and moved a slide everywhere else, so a mark had a question to
   answer; Shift answers it the same way on every slide, and a mark for a key
   that never changes meaning is a mark nobody reads twice. */
#nav-hints span {
  position: absolute;
  color: var(--ink-soft);
  opacity: 0;
  font-size: 1.5em;
  line-height: 1;
  pointer-events: none;
  transition: opacity 220ms ease;
}
#nav-hints span[data-on] { opacity: 0.22; }
#nav-hints span[data-hint=down]  { bottom: 0.15em; left: 50%; transform: translateX(-50%); }
/* On the cockpit the mirror is scaled down, so the marks would be shrunk to
   nothing beside chrome that is not. The speaker is also the person who has
   to plan against them, so they are a little louder there. */
body[data-view=speaker] #nav-hints span[data-on] { opacity: 0.45; }
body:not([data-view=speaker]).blanked #nav-hints span,
/* The board has its own 2D map and its own arrow meanings; a compass for the
   slide keys would be pointing at the wrong thing. Done in CSS because
   setOverviewMode does not always go through applyState. */
body.overview-mode #nav-hints span { opacity: 0 !important; }

/* The controls a finger can reach, in both live views. Two pills, one above
   the other: the rail is what you press repeatedly, the palette behind the
   three dots
   is what you set once and leave. Splitting them is not decoration - eleven
   round buttons in one row do not fit a phone held upright, and the five that
   matter mid-talk should not shrink to make room for the six that do not. */
#touch-controls { display: none; }
@media (pointer: coarse) {
  #touch-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35em;
    position: fixed;
    bottom: max(0.6em, env(safe-area-inset-bottom));
    /* Stretched across, not centred with a transform. A fixed box with
       left: 50% and no width is shrink-to-fit against the space *left of
       the right edge* - half the viewport - and the transform only moves it
       afterwards. So on a 320px phone the pills were laid out into 160px and
       wrapped to two rows while there was room for one. The column flex below
       centres them, at the full width. */
    left: 0;
    right: 0;
    z-index: 35;
    pointer-events: none;
  }
  #touch-rail, #touch-palette { pointer-events: auto; }
  #touch-rail, #touch-palette {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 96vw;
    gap: clamp(3px, 0.8vw, 6px);
    background: oklch(0.10 0 0 / 0.78);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    padding: clamp(4px, 1vw, 7px) clamp(6px, 1.4vw, 10px);
    border-radius: 999px;
    box-shadow: 0 4px 18px oklch(0 0 0 / 0.35);
  }
  /* An id selector outranks the user agent's [hidden] rule, so the display
     above kept the palette open no matter what the attribute said. Toggling
     the hidden attribute is still the right handle - it is what a screen
     reader reads -
     so the stylesheet has to say so at a specificity that wins. */
  #touch-palette[hidden] { display: none; }
  /* The palette's letters are the keys they stand for, so they are set in the
     typeface a key is written in everywhere else in this tool. */
  #touch-palette button {
    font-family: var(--mono-font);
    font-size: clamp(14px, 4.2vw, 18px);
  }
  #touch-palette button[aria-pressed=true],
  #touch-rail button[aria-expanded=true] {
    background: oklch(0.96 0 0);
    color: oklch(0.15 0 0);
  }
  /* Sized against the viewport, in px, and against nothing else.
     em inherits the slide's own type, which carries --zoom, so the rail grew
     with the lecturer's text size: six buttons ran 441px wide on a 390px
     phone. rem is no better here - a mobile browser sets the root size by its
     own text-autosizing heuristics, and the same rule gave 63px buttons on an
     iPad in landscape and 83px on the same iPad turned upright.
     The floor is 44px because that is the smallest target a fingertip hits
     reliably; the ceiling keeps the rail from becoming furniture on a tablet.
     Between them the six fit one row at every width down to 320px, which is
     what the arithmetic in the max-width above is for. flex-wrap stays as the
     backstop for anything narrower than that. */
  #touch-controls button {
    background: transparent;
    border: 0;
    color: oklch(0.96 0 0);
    font-size: clamp(17px, 5.2vw, 22px);
    width: clamp(44px, 13.5vw, 56px);
    height: clamp(44px, 13.5vw, 56px);
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
  /* In the cockpit the bottom edge is spoken for several times over - the
     notes pane, the thumbnail strip, the footer - and two of the three change
     size while the lecture is running. The rail used to clear them by summing
     the numbers the grid rows are written in, and it summed two of the three.
     The one it missed is the notes pane, whose row is auto and therefore has
     no number to read: measured at three iPad sizes with Shift-N open, the
     opaque pill covered 81-82% of the pane, dead centre. On a tablet at the
     lectern - the case the rail was added for - the lecturer's notes were
     behind the buttons.

     So it stops counting and joins the grid instead, in the stage's own row
     and pinned to the bottom of it. Nothing below the stage can be covered by
     something that lives above it, whatever gets added there and however it is
     dragged. Both layouts put the stage in row 2 / column 1, so one rule
     serves them and the Shift-V special case goes with the arithmetic that
     needed it. It shares the cell with #stage-cell rather than taking a row of
     its own, so the stage keeps every pixel it had; z-index 35 still decides
     what is on top, which grid items honour without being positioned. */
  body[data-view=speaker] #touch-controls {
    position: static;
    grid-row: 2;
    grid-column: 1;
    align-self: end;
    padding-bottom: max(0.6em, env(safe-area-inset-bottom));
  }
}
/* An expansion is half of a two-column grid, which needs two columns' worth
   of room. Under this width there are not two, so the pane takes the whole
   column and stacks under the slide's own words, and focusCamera - which
   frames an open pane vertically - lifts it to the middle of the screen with
   the sentence it belongs to still above it.

   It was position: fixed, with the inset of a card pinned to the bottom of
   the window, and it was never pinned to anything of the sort. The pane
   lives inside #stage, #stage carries the camera's transform, and a fixed
   descendant of a transformed element is positioned against that element
   rather than against the viewport. What made it look right was the other
   half of the same defect: getOffset walks offsetParent up to the stage, a
   fixed box has no such chain, so the camera was computing its translation
   from the pane's own runaway coordinates and the two errors cancelled in
   the card while leaving the slide behind it 37,000px away - a card floating
   on an empty page. The one construct here that really does escape to the
   window is the figure overlay, and it escapes by leaving the stage:
   #figure-overlay is a sibling of it and the focused element is cloned in. */
@media (max-width: 900px) {
  .chunk.expanded {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 1.4em;
  }
  .chunk.expanded .exp-body.on {
    grid-column: 1;
    align-self: start;
    max-height: 70vh;
  }
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

// Auto-fit has three states and the # key walks them in this order:
//
//   off     – the lecturer's zoom on every slide, whatever it costs.
//   shrink  – fit, ceilinged at the lecturer's own zoom. Only ever smaller.
//   full    – fit, ceilinged at the global maximum. Grows a short slide too.
//
// Interpolated from build.js so the cycle and the frontmatter vocabulary
// have one source. Declared above state, because state's initialiser calls
// normAutoFit and a const read before its own line is a TDZ error, not a
// fallback.
const AUTO_FIT_CYCLE = ${JSON.stringify(AUTO_FIT_CYCLE)};
// What a value that came from somewhere else means here. Three somewheres:
// this build's own VIEW_DEFAULTS (already one of the three words), a peer
// window running a build that predates the third mode (a boolean, which is
// what the field was), and a payload from anywhere at all (nonsense, which
// must land on a mode rather than on undefined). The boolean case is the
// load-bearing one: audience.html and speaker.html are separate files and
// --audience-only rebuilds exactly one of them.
function normAutoFit(v) {
  if (v === true) return 'full';
  if (v === false || v == null) return 'off';
  return AUTO_FIT_CYCLE.includes(v) ? v : 'off';
}
// Is the camera solving the zoom at all? Never write state.autoFitMode into
// an if: every one of the three words is a truthy string.
function autoFitOn() { return state.autoFitMode !== 'off'; }
// The largest zoom the fit may reach. In full mode the global maximum,
// because there the point is that every slide is sized to the screen. In
// shrink mode the lecturer's own zoom, which is the whole of the difference
// between the two: a fit that cannot go above where the zoom already is can
// only ever take size away, and a slide that already fits is left alone.
function autoFitCeiling() { return state.autoFitMode === 'shrink' ? collapsedZoom : 2.2; }
// The fit with no else-branch beside it, for the one caller that has none.
function autoFitNow() { if (autoFitOn()) fitZoomToChunk(autoFitCeiling()); }

// VIEW_DEFAULTS holds only the keys the author pinned in the frontmatter;
// everything absent from it falls back to the built-in default here and, for
// the three global preferences, to whatever the reader last chose.
const state = {
  activeIdx: 0,
  collapse: VIEW_DEFAULTS.collapse || 'topic-bold',
  zoom: 1.35,
  // # – off | full | shrink. See AUTO_FIT_CYCLE above; never a boolean here,
  // because three states do not fit in one, and never read for truthiness,
  // because 'off' is a truthy string. autoFitOn() is the test.
  autoFitMode: normAutoFit(VIEW_DEFAULTS.autoFit),
  blanked: false,
  font: VIEW_DEFAULTS.font || 'serif',           // serif | sans | mono (readable)
  theme: VIEW_DEFAULTS.theme || 'light-red',     // light-{red,teal,blue,orange} | terminal-{amber,green}
  slideNums: VIEW_DEFAULTS.slideNums || ${JSON.stringify(SLIDE_NUM_DEFAULT)},  // vertical | horizontal | off – L cycles
};
const FONT_CYCLE = ['serif', 'sans', 'mono'];
const SLIDE_NUM_MODES = ${JSON.stringify(SLIDE_NUM_MODES)};
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
// The aside that has been brought into the frame: { chunkId, el }, or null.
// Deliberately not manualPan, which is where this used to live. manualPan is
// the drag offset - a free-hand nudge the camera keeps until something
// clears it - so a marginalia written into it survived a resize as a stale
// number of pixels, could not be told apart from a drag by anything that
// reads it, and had to be recomputed by hand every time the layout moved. A
// panned aside is a *state* the camera solves for, exactly the way
// annotEditingId is: focusCamera reads it and derives the offset from where
// the aside is now. See the branch there.
let asidePan = null;
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
    // Two fields for one setting, and the second is the compatibility one.
    // A peer built before the third mode reads autoFit and coerces it with
    // !!, so it has to keep receiving a boolean or 'off' would switch it
    // on. autoFitMode carries the whole answer for a peer that knows about
    // it; shrink degrades to full on an old peer, which is the safe way
    // round - the other would be a projection that runs off the screen.
    autoFit: autoFitOn(),
    autoFitMode: state.autoFitMode,
    // The zoom that travels is the one the lecturer chose, not the one this
    // window happens to be showing. A chunk whose code would be cut off is
    // shrunk locally, and the two windows are different sizes, so each
    // derives that for itself – sending the shrunk value would let one wide
    // slide quietly lower the setting in the other window, and then in this
    // one on the way back. zoomBase() is that value by definition – it is
    // what + and – step from, for the same reason.
    zoom: zoomBase(),
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
    // autoFitMode when the peer sends one, the old boolean when it does
    // not. normAutoFit takes either, so a window rebuilt on its own beside
    // one that was not still agrees about the two modes that existed then.
    state.autoFitMode = normAutoFit(
      payload.autoFitMode === undefined ? payload.autoFit : payload.autoFitMode);
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
    //
    // In shrink mode the same question has a taller answer: the setting that
    // travelled is the ceiling, and how far under it this chunk has to sit in
    // THIS window is what the mode is for - the projection and the cockpit's
    // stage are different sizes. Full auto-fit deliberately keeps adopting
    // the sender's fitted zoom, which is what it has always done.
    if (state.autoFitMode === 'shrink') fitZoomToChunk(collapsedZoom);
    else clampZoomToWidth();
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
    // The editor's own apply where the view ships one; otherwise the
    // compiled markup the cockpit sent along. That second path is what makes
    // editor: speaker honest: the projection carries no compiler, and it
    // used to drop every edit here in silence while the cockpit said the
    // room was following.
    if (window.psiApplyDiagramEdit) window.psiApplyDiagramEdit(m);
    else if (m.html) {
      const target = document.getElementById(m.id);
      if (target) dgSwapFigure(target, m.html);
    }
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
    // Bringing an aside into the frame is a command to the projector, not a
    // field of the shared state, so it travels as its own message type - the
    // same reasoning as blank and slide-ref. applyRemoteState is a full
    // apply, and a snapshot sent to say "the aside is in" would drag the
    // room's slide position with it. It has to travel at all because the
    // aside is on the projection: the lecturer clicks it in the cockpit and
    // the room is what has to move.
    if (m.type === 'figure-pan') {
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll(FOCUSABLE_SEL)[m.figureIdx];
        if (el && el.classList.contains('marginalia')) setAsidePan(el);
      }
      return;
    }
    if (m.type === 'figure-unpan') {
      if (clearAsidePan()) focusCamera(false);
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
  updateNavHints();
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
// A backdrop's reveal is indexed by the beat rather than pushed into the
// ordered list above, and that is the whole of the design. The backdrop is
// a sibling of .chunk-content, so document order would put every one of its
// places *before* every reveal segment - and the move this exists for is
// exactly the one where the picture retreats and the words arrive in the
// same beat. Indexed, extent i is simply what the slide looks like at beat
// i, and the last one persists.
//
// So it does not add beats, it *rides* them - except where the chunk has
// none of its own, which is the title slide the feature was asked for.
function bdFrames(el) {
  const bd = el.querySelector(':scope > .chunk-backdrop[data-bd-frames]');
  if (!bd) return null;
  try { return { el: bd, frames: JSON.parse(bd.dataset.bdFrames) }; }
  catch (e) { return null; }
}
// Positions, not beats: 1 means "in the chunk, nothing advanced yet", which
// is the convention jumpTo and advanceReveal were already written against.
function countSegments(el) {
  const beats = chunkBeats(el).length;
  const bd = bdFrames(el);
  let n = beats ? beats + 1 : (el.querySelector('.reveal-segment') ? 1 : 0);
  if (bd) n = Math.max(n, bd.frames.length);
  el.querySelectorAll('.overlay-card[data-from]').forEach(c => {
    n = Math.max(n, Number(c.dataset.from) + 1);
  });
  return n;
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
  el.querySelectorAll('.overlay-card[data-from]').forEach(c => {
    c.toggleAttribute('data-hidden', consumed < Number(c.dataset.from));
  });
  const bd = bdFrames(el);
  if (bd) {
    // The same rule the tween follows: a chunk off screen snaps, or booting
    // into the middle of a deck plays every backdrop's whole reveal at once
    // behind the reader's back.
    bd.el.style.transition = jump ? 'none' : '';
    bd.el.style.clipPath = bd.frames[Math.min(consumed, bd.frames.length - 1)];
    if (jump) { void bd.el.offsetWidth; bd.el.style.transition = ''; }
  }
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

  // The open expansion pane. The branch below reads its offsets in stage
  // coordinates, which holds because the pane is always part of the chunk's
  // own layout: under 900px the stylesheet re-flows the grid and stacks it,
  // and deliberately does not lift it out with position: fixed.
  //
  // That used to be the rule, and it was never fixed to the window. The pane
  // lives inside #stage, #stage carries this very transform, and a fixed
  // descendant of a transformed element is positioned against that element.
  // getOffset walks offsetParent up to the stage, of which such a box has
  // none, so the camera answered with translate(-4320px, -40850px) - the card
  // sat where fixed positioning put it and looked right, while the slide it
  // was supposed to cover was thirty-seven thousand pixels away.
  //
  // There is deliberately no runtime test for it. A position check here could
  // never be false once that rule was gone, and it would not be free: this
  // function is the pointermove handler for stage panning, so getComputedStyle
  // would force a style recalc on every frame of a drag to answer a question
  // with one possible answer. The invariant belongs where it can fail loudly,
  // and test/expansion.mjs holds it twice - the pane is not fixed, and the
  // chunk is still on screen behind it.
  const expPane = (openExp && openExp.chunkIdx === state.activeIdx)
    ? entry.el.querySelector(\`.exp-body[data-exp-body="\${openExp.expIdx}"]\`)
    : null;

  let tx, ty;
  if (annotEditingId === entry.id) {
    const contentEl = entry.el.querySelector('.chunk-content');
    const co = contentEl ? getOffset(contentEl, stage) : { left: left + width / 2 };
    tx = vp.width * 0.33 - co.left;
    ty = (height <= vp.height) ? vp.height / 2 - (top + height / 2) : vp.height * 0.05 - top;
  } else if (expPane) {
    const bo = getOffset(expPane, stage);
    // An expanded chunk is one composition and the stylesheet says so - the
    // slide's own column on the left, the pane on the right. Centring the
    // pane alone is centring half of it, which slid the words the pane
    // belongs to off the left edge; the room read a card and a cropped
    // sentence. So the horizontal frame is the chunk.
    tx = vp.width / 2 - (left + width / 2);
    // Vertically the pane is what is being read and it can stand taller than
    // the text beside it, so it keeps the centring it always had.
    ty = vp.height / 2 - (bo.top + bo.height / 2);
  } else {
    tx = vp.width / 2 - (left + width / 2);
    // Whether a chunk fits, and where it is centred, are judged on its
    // **content** and not on the chunk box. The box carries the breathing
    // space above the heading - a deliberate part of the design, and about
    // 78 px of it - which must not be charged against the frame. Measured on
    // the tutorial at 1280x800: six chunks whose content was 723-793 px had
    // boxes of 802-872 px, failed this test, took the walk below, had their
    // heads pinned at 5% and hung 2-78 px off the bottom of a frame they fit
    // inside comfortably. --check-fit measures the chunk-content box and had
    // been reporting exactly those as "fits the frame and is positioned
    // outside it"; the two were measuring different boxes, and only one of
    // them was the box a reader sees.
    //
    // The walk branch below still measures the box. A chunk whose *content*
    // overflows is genuinely walked, and the head pin and the foot-following
    // are a pair that has to stay in one coordinate system.
    const fitEl = entry.el.querySelector('.chunk-content');
    const fit = fitEl ? getOffset(fitEl, stage) : { top, height };
    if (fit.height <= vp.height) {
      ty = vp.height / 2 - (fit.top + fit.height / 2);
    } else {
      // A chunk taller than the frame cannot be framed, so it is walked: its
      // head is pinned near the top edge and stays there.
      //
      // That is right on arrival and wrong from the second beat onwards. A
      // hidden segment takes no space, so revealing one extends the chunk
      // *downwards* while this camera held the head still - and once the
      // chunk passed the height of the frame, forward put the new material
      // below the bottom edge. The lecturer pressed the key and the room saw
      // nothing change: on the tutorial's own reveal chunk the third beat
      // landed 430px below a 900px viewport. So follow the foot down, and
      // never further up than the head pin, which makes the walk reversible -
      // back shortens the chunk and the view rises with it.
      //
      // Both windows have to agree on where the camera is, so this stays a
      // pure function of the shared state: the foot is the chunk's own
      // bottom, which is what the revealed segments measure, and the walk
      // begins only past the opening beat. Arrival at the opening state
      // frames exactly what it framed before.
      const segCount = countSegments(entry.el);
      const shown = revealed[entry.id] ?? (segCount ? 1 : 0);
      const pinHead = vp.height * 0.05 - top;
      ty = (shown > 1) ? Math.min(pinHead, vp.height * 0.95 - (top + height)) : pinHead;
    }
  }

  // The aside, brought in. A ::: marginalia is not lifted into the overlay
  // the way a figure is - it is part of the slide's layout, not something
  // laid over it - so the camera slides sideways instead, far enough that
  // the whole aside is inside the frame and no further. Same shape as the
  // annotation branch above: a state the camera solves for, from where the
  // aside is *now*, so a resize or a zoom re-derives it rather than carrying
  // a stale offset.
  //
  // The minimum move on purpose. The aside was centred in the viewport
  // before, which is a bigger move than the question asks for: it took the
  // sentence the aside belongs to off the left edge, so the room was reading
  // a tangent with nothing to hang it on. Here the slide keeps as much of
  // itself as the aside's overhang allows.
  //
  // The gap on the right is the 2vw the stylesheet already puts between the
  // text column and the aside, so the aside is framed with the same air on
  // both sides.
  if (asidePan && asidePan.chunkId === entry.id && annotEditingId !== entry.id) {
    const mo = getOffset(asidePan.el, stage);
    const gap = vp.width * 0.02;
    const over = (mo.left + mo.width + tx + gap) - vp.width;
    if (over > 0) tx -= over;
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
// rather than the live slide - and that has to include where they stop.
//
// They stand still at the ends now; this went on falling through to the last
// or the first chunk of the whole deck. So the behaviour the key model was
// changed to remove was still reachable, through the board, where the next
// Enter commits it: open the overview in the last column, press Right, press
// Enter, and you are on the final slide of the lecture in front of a room.
// One gesture with two implementations has to agree about its edges, or the
// disagreement is something a lecturer finds by pressing it.
function selectOverviewCol(dir) {
  const cur = flatChunks[selectedIdx];
  if (!cur) return;
  if (dir > 0) {
    for (let i = selectedIdx + 1; i < flatChunks.length; i++) {
      if (flatChunks[i].colIdx > cur.colIdx) return setSelectedIdx(i, { recenter: true });
    }
    return;
  }
  for (let i = selectedIdx - 1; i >= 0; i--) {
    if (flatChunks[i].colIdx < cur.colIdx) {
      let j = i;
      while (j > 0 && flatChunks[j - 1].colIdx === flatChunks[i].colIdx) j--;
      return setSelectedIdx(j, { recenter: true });
    }
  }
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
    // A column divider is a chunk (flatChunks navigates to it) but wears
    // .section-heading rather than .chunk-heading, so the three selectors
    // above find nothing on it and every divider used to sit in the index
    // as "(untitled)" with an empty body. Searching a lecture for the name
    // of one of its own parts then found nothing, which is the one search
    // a reader is most likely to try first.
    // On an outline divider the heading is not set beside the list, it IS
    // the list's current item, so that is what the index has to read.
    const secHeadEl = c.el.querySelector('.section-heading')
      || c.el.querySelector('.section-outline li[aria-current] .so-text');
    const secBodyEl = c.el.querySelector('.section-body');
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
    const title = clean(mainEl) || clean(headEl) || clean(secHeadEl);
    const sub = mainEl ? clean(subEl) : '';
    const body = cleanBody(bodyEl) || cleanBody(secBodyEl);
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
  // Same for a brought-in aside: it belonged to the slide being left.
  clearAsidePan();

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
  if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
  else clampZoomToWidth();
  applyState();
  focusCamera(false);
  saveActive();
  restartAutoplay();
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
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    return true;
  }
  return false;
}

// A revealed segment is content arriving on a slide that is already on
// screen. Every other change of that kind re-solves both the zoom and the
// camera - jumpTo, the zoom keys, the auto-fit toggle, a window resize - and
// reveal re-solved neither, which is one omission with two faces:
//
//   - in auto-fit the chunk was sized to its opening segment and the rest
//     grew off the bottom of the screen, 129px of a tutorial chunk, with
//     nothing on either screen saying so;
//   - in both modes the camera held still while the chunk grew downwards,
//     so on a chunk already taller than the frame the new material landed
//     below the bottom edge and the key press did nothing the room could
//     see. focusCamera's walking branch is the other half of this fix.
//
// It runs before broadcastState, so the peer receives the zoom this window
// settled on rather than the one it is about to leave.
//
// The zoom half is auto-fit only: outside it the zoom is the lecturer's and
// is never touched automatically (clampZoomToWidth is the one exception, and
// it already runs per chunk). The camera half is not - a camera that frames
// the wrong part of the slide is wrong in either mode.
//
// Deliberately not called for an opened ::: expand or an annotation box:
// those shift the camera to bring a panel into view and change nothing about
// the slide's own content, which is why both already have their own branch
// in focusCamera and neither should resize anything.
function resettleAfterReveal() {
  autoFitNow();
  focusCamera(false);
}

// ── ::: draw autoplay ──
// A figure written with autoplay N walks its own steps once the slide is on
// screen. It calls advanceReveal(), so it IS the Space key on a timer:
// one counter, one broadcast, one freeze gate, and the speaker view follows
// without knowing this exists.
//
// The audience is the state root, so only the audience runs the clock -
// two windows both advancing would take two beats per tick. And the first
// deliberate act stops it for good: a lecturer who has touched the deck has
// taken over, and a timer resuming underneath them is worse than no timer.
let autoplayTimer = 0;
// The chunk the lecturer took over on, and it is a chunk id rather than a
// boolean for a reason that made the feature unusable. Taking over is an act
// on *this slide*; but you reach a slide by pressing a key, and a
// session-wide flag was therefore set by the very keypress that navigated to
// the figure, before it was on screen. Measured: jumping by address played
// the figure, one arrow key anywhere killed it for the rest of the session -
// so autoplay only ever ran on a slide a deck happened to open on. Scoped to
// the chunk, the arrival key belongs to the slide being left.
let autoplayStoppedOn = null;
function stopAutoplay() {
  if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = 0; }
}
function restartAutoplay() {
  stopAutoplay();
  if (VIEW !== 'audience') return;
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const fig = entry.el.querySelector('[data-autoplay]');
  if (!fig) return;
  const ms = Number(fig.dataset.autoplay);
  if (!ms) return;
  // Only from the opening beat. Arriving at a half-revealed slide means the
  // lecturer left it that way, and finishing it for them is the surprise
  // this feature must not spring.
  const segCount = countSegments(entry.el);
  if (autoplayStoppedOn === entry.id) return;
  if ((revealed[entry.id] ?? 0) > 1) return;
  const cycle = fig.hasAttribute('data-autoplay-cycle');
  const tick = () => {
    autoplayTimer = 0;
    if (autoplayStoppedOn === entry.id) return;
    if (flatChunks[state.activeIdx] !== entry) return;
    if (advanceReveal()) {
      if ((revealed[entry.id] ?? 0) < segCount) autoplayTimer = setTimeout(tick, ms);
      else if (cycle) autoplayTimer = setTimeout(tick, ms);
      return;
    }
    // advanceReveal said no, so we are at the last beat. Cycling rewinds
    // to the opening one through the same counter everything else reads,
    // so the speaker view follows the rewind exactly as it followed the
    // walk. The last beat is held for one delay like any other: a second
    // number for "how long to admire the finished picture" is a knob
    // nobody asked for and one more thing to get wrong.
    if (!cycle) return;
    revealed[entry.id] = 1;
    applyReveal(entry.el, entry.id);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    autoplayTimer = setTimeout(tick, ms);
  };
  if (segCount > 1) autoplayTimer = setTimeout(tick, ms);
}
// Any deliberate input retires the clock. Capture phase and passive, so it
// sees the event whatever else handles it and never delays one.
// Capture phase, and that is load-bearing here as well as for not delaying an
// event: the key that moves to the next slide is seen while state.activeIdx is
// still the slide being left, so the take-over is recorded against that one
// and not against the slide about to arrive. The navigation handler runs in
// the bubble phase, after this.
for (const ev of ['keydown', 'pointerdown', 'wheel']) {
  window.addEventListener(ev, () => {
    const cur = flatChunks[state.activeIdx];
    if (!cur || autoplayStoppedOn === cur.id) return;
    autoplayStoppedOn = cur.id;
    stopAutoplay();
  }, { capture: true, passive: true });
}

// The mirror of advanceReveal, and it costs nothing but the counter: every
// beat's state is recomputed from revealed[id] on each applyReveal, and
// dgStep renders any step in either direction. Reveal was forward-only
// because the *keys* were, never because the mechanism was.
function retreatReveal() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  const segCount = countSegments(entry.el);
  const cur = revealed[entry.id] ?? (segCount ? 1 : 0);
  if (cur > 1) {
    revealed[entry.id] = cur - 1;
    applyReveal(entry.el, entry.id);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    return true;
  }
  return false;
}

// One forward family and one backward family, the way a presentation tool is
// expected to behave: perform the slide, then move to the next one. Every one
// of those keys means the same thing on every slide, which is what makes the
// model teachable in a sentence.
//
// Columns are the one thing psi-slides has that a linear deck does not, and
// they used to be reached by giving the sideways arrows a second meaning on
// the first chunk of a column - so a key meant one thing here and another
// there, and two marks at the viewport edge existed to say which. Now they
// are Shift and the same arrows, from anywhere. A modifier that always means
// the same thing needs nothing on screen to announce it, so the two marks
// are gone; the one below, which says where forward will *take* you rather
// than what it means, stays.
// An opened card is a stage of its own on the way through a chunk, the way
// a revealed segment is. Esc already treated it that way; the arrow keys did
// not, and the press that ran out of beats fell straight through to
// nextChunk() - whose jumpTo closes the card on its way past. So one key
// took the figure off the screen AND changed the slide, on a slide the
// lecturer was very often still talking about, and it took two windows with
// it. Closing the card first costs one extra press and gives the chunk back.
function unfocusAsStage() {
  if (!focusedFigure) return false;
  unfocusFigure();
  if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
  return true;
}
function goForward() {
  if (advanceReveal() || unfocusAsStage()) return;
  nextChunk();
}
function goBack() {
  if (retreatReveal() || unfocusAsStage()) return;
  prevChunk();
}

// Where the columns begin and end. colLast is what the down mark reads;
// colFirst is what prevCol uses to decide between rewinding to the head of
// this column and leaving for the one before it.
//
// There used to be a third field here, sideways, saying whether the arrow
// keys changed column on this chunk - a per-chunk fact, because they only did
// so on the head of one. Both the key map and the marks read it, deliberately,
// so that a mark could never promise a move the key would not make. Shift
// makes the question disappear rather than answering it: nextCol and prevCol
// clamp on their own, so there is nothing left for a predicate to guard.
function markColumnEdges() {
  flatChunks.forEach((c, i) => {
    const prev = flatChunks[i - 1], next = flatChunks[i + 1];
    c.colFirst = !prev || prev.colIdx !== c.colIdx;
    c.colLast = !next || next.colIdx !== c.colIdx;
  });
}

function nextChunk() {
  if (state.activeIdx + 1 >= flatChunks.length) return;
  jumpTo(state.activeIdx + 1, 'forward');
}
function prevChunk() {
  if (state.activeIdx <= 0) return;
  jumpTo(state.activeIdx - 1, 'back');
}
// Both column keys stand still when there is no column that way, the same
// rule nextChunk and prevChunk follow at the two ends of the deck. nextCol
// used to fall back to the last chunk of the lecture instead. That was nearly
// unreachable while the key existed only on a column head with a column to
// the right of it - a guard in the key map made sure of it, and that guard is
// what the marks at the edge were drawn from. Shift reaches it from every
// slide in the last column, so the fallback would now be one keystroke from
// the end of the lecture, in front of a room.
function nextCol() {
  const cur = flatChunks[state.activeIdx];
  for (let i = state.activeIdx + 1; i < flatChunks.length; i++) {
    if (flatChunks[i].colIdx > cur.colIdx) return jumpTo(i, 'forward');
  }
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
      // Before the overview branch, because a selection gesture is not a
      // decision about where to be in either mode: a drag across an
      // inactive chunk otherwise navigates to it on release, and the
      // highlight the lecturer just made goes with the camera.
      if (gestureSelects(ev)) return;
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
      // Back from a brought-in aside. The aside's own click handler stops
      // propagation, so anything that reaches here is the slide itself -
      // which is the gesture that means "I am done with the tangent".
      if (asidePan && asidePan.chunkId === entry.id) {
        clearAsidePan();
        focusCamera(false);
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unpan' });
        return;
      }
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
//
// The chunk's own box is in that list as a backstop for anything wide that
// is not a pre, a table or a formula. It has to be told about the one thing
// that overflows on purpose: a ::: marginalia is absolutely positioned out
// past the text column and is *meant* to run off the right edge of the
// frame. Its overhang lands in the chunk's scrollWidth like any other, so
// the backstop read "this slide is cut off" on every marginalia chunk and
// the fit walked the zoom to its 0.6 floor - the tutorial's own
// #marginalia-demo came out at 0.6 where the slide before it was at 1.35,
// which is the whole reason a marginalia looked like a framing bug. So the
// allowance is the frame *or* the aside's own reach, whichever is further.
//
// What this deliberately cannot see is an in-flow element that overflows by
// less than the aside reaches, because the aside's excess hides it. Every
// element that can do that without reflowing is checked by name in the list
// beside it, which is what NOWRAP_SEL is for.
function nowrapProbe(el) {
  const wide = [el].concat(Array.from(el.querySelectorAll(NOWRAP_SEL)));
  const asides = Array.from(el.querySelectorAll('.marginalia'));
  return () => wide.some((n) => {
    let room = n.clientWidth;
    if (n === el) {
      for (const a of asides) {
        let reach = a.offsetWidth, p = a;
        while (p && p !== el) { reach += p.offsetLeft; p = p.offsetParent; }
        if (reach > room) room = reach;
      }
    }
    return n.scrollWidth > room + 1;
  });
}

// And a chunk's own box is not a measure of how much is on it. Three
// families are pinned to the full slide height so their ground fills the
// frame – the cover (.chunk-title), the section divider (.chunk-section)
// and anything carrying a backdrop ([data-has-backdrop]) – and a box that
// is as tall as the screen by construction can never fit inside 94% of it.
// The fit then read “still too tall” at every step and walked the zoom
// down to its 0.6 floor: with auto-fit on, every divider and every cover in
// a deck came out at minimum type, whatever was on it.
//
// So measure the flow instead – the extent of the chunk's in-flow children,
// which is the content column plus any expansion body open beneath it – and
// never more than the box itself, so an ordinary chunk measures exactly
// what it measured before. The out-of-flow children are ground and chrome
// (the backdrop, the overlay layer, the slide number, the annotate button):
// they are sized by the frame rather than by the type, so counting them
// would let the min-height back in through the side door. A child with no
// box at all is skipped – a collapsed ::: expand body is display:none, and
// its all-zero rect would otherwise anchor the extent at the viewport top.
//
// Offsets and not getBoundingClientRect: the cockpit scales its whole stage
// with a transform to fit the preview cell, and a client rect is in that
// scaled space while avail is in layout pixels. offsetTop and offsetHeight are
// layout pixels in both windows, and .chunk is positioned, so they are
// already relative to the chunk.
//
// Same shape as nowrapProbe, and for the same reason: the child list and
// the padding are read once per fit, and only the offsets are re-measured on
// each zoom step.
function flowHeightProbe(el) {
  // display: contents is not a box, it is a wrapper whose children are laid
  // out by the grandparent – the divider's own .section-lead is one, and so
  // is every <li> of an outline list. Skipping it as boxless measured a
  // divider by its prose alone and grew the type until the heading and the
  // agenda above it were off the top of the screen; taking its zeroed offsets
  // at face value would anchor the extent at the chunk's top edge. Both
  // readings are wrong for the same reason, so such a child is replaced by
  // the children it lends to this level.
  const flowKids = (node) => {
    const out = [];
    for (const c of node.children) {
      if (typeof c.offsetHeight !== 'number') continue;      // an <svg> has no offset box
      const cs = getComputedStyle(c);
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      if (cs.display === 'contents') { out.push(...flowKids(c)); continue; }
      out.push(c);
    }
    return out;
  };
  // One level: the in-flow children of a node and its two vertical paddings,
  // read once rather than on every zoom step.
  const levelOf = (node) => {
    const cs = getComputedStyle(node);
    return {
      flow: flowKids(node),
      padT: parseFloat(cs.paddingTop) || 0,
      padB: parseFloat(cs.paddingBottom) || 0,
    };
  };
  // Returns the top and bottom of what the level holds, in that level's own
  // offset coordinates, or null when nothing in it has a box.
  const span = (lvl) => {
    let top = Infinity, bottom = -Infinity;
    for (const c of lvl.flow) {
      if (!c.offsetHeight && !c.offsetWidth) continue;    // display:none has no box
      if (c.offsetTop < top) top = c.offsetTop;
      if (c.offsetTop + c.offsetHeight > bottom) bottom = c.offsetTop + c.offsetHeight;
    }
    return bottom < top ? null : { top, bottom };
  };

  const outer = levelOf(el);
  // The one box we look inside is .chunk-content, and only because on a
  // cover it is stretched to the frame as well: the block is then placed at
  // its top, middle or end (cover-align), so the box says where the type may
  // go and not how much of it there is. It is safe to look through precisely
  // because it carries no ground - no background, no border, no min-height -
  // and its own padding is added back below. Nothing deeper is looked
  // through: a card row keeps its min-height, a figure keeps its frame.
  const inner = outer.flow.map((c) => (c.classList.contains('chunk-content') ? levelOf(c) : null));

  return () => {
    let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < outer.flow.length; i++) {
      const c = outer.flow[i];
      if (!c.offsetHeight && !c.offsetWidth) continue;
      let t = c.offsetTop, b = c.offsetTop + c.offsetHeight;
      const lvl = inner[i];
      const s = lvl && span(lvl);
      if (s) {
        // .chunk-content is the offsetParent of its own children, so the
        // grandchildren's offsets are relative to it.
        t = Math.max(t, c.offsetTop + s.top - lvl.padT);
        b = Math.min(b, c.offsetTop + s.bottom + lvl.padB);
      }
      if (t < top) top = t;
      if (b > bottom) bottom = b;
    }
    if (bottom < top) return el.scrollHeight;
    return Math.min(el.scrollHeight, (bottom - top) + outer.padT + outer.padB);
  };
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
  const heightOf = flowHeightProbe(el);
  if (heightOf() <= avail && !overflowsX() && state.zoom >= cap) return;  // nothing to gain

  // A single proportional estimate is not enough, because zoom changes line
  // wrapping and therefore height, and it is not safe either: solving for
  // "exactly fills" lets a correction pass grow the zoom back over the
  // edge. So estimate once to get close, then walk in the real zoom
  // increment until the invariant holds, and only then try to give the
  // reclaimed space back. Without that last step the compounding of a
  // safety factor and the 0.05 rounding left chunks a quarter smaller than
  // they needed to be.
  const STEP = 0.05;
  let z = clampZoom(state.zoom * (avail / (heightOf() || avail)));
  if (z > cap) z = cap;
  applyZoom(z);

  // Shrink until it fits, in both directions.
  while ((heightOf() > avail || overflowsX()) && z > 0.6) {
    z = clampZoom(z - STEP);
    applyZoom(z);
  }
  // Grow back while it still fits, never past the ceiling.
  while (z + STEP <= cap) {
    const probe = clampZoom(z + STEP);
    applyZoom(probe);
    if (heightOf() > avail || overflowsX()) { applyZoom(z); break; }
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
  if (autoFitOn()) return false;                      // either fit does both directions already
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

// Auto-fit: every slide gets a zoom that makes it fit, in both collapse
// modes, until it is switched off again. Distinct from the fit that happens
// on entering the full text, which is a one-off and never grows the type -
// and shrink is that same one-off made permanent, which is the whole of
// what the third mode is.
//
// A cycle and not a toggle, walked in AUTO_FIT_CYCLE order. Shift does not
// reverse it, unlike C, F, A and L: # is Shift-3 on a US layout and an
// unshifted key of its own on a German one, so e.shiftKey carries no
// information here that is the same on two keyboards. Three states are two
// presses from anywhere, which is what makes that affordable.
const AUTO_FIT_LABEL = {
  off:    'auto-fit off · manual zoom',
  shrink: 'auto-fit shrink · a slide too big is made to fit, nothing else moves',
  full:   'auto-fit on · every slide sized to the screen',
};
function cycleAutoFit(dir) {
  const i = AUTO_FIT_CYCLE.indexOf(state.autoFitMode);
  const n = AUTO_FIT_CYCLE.length;
  state.autoFitMode = AUTO_FIT_CYCLE[(i + (dir || 1) + n) % n];
  if (autoFitOn()) {
    // Back to the lecturer's zoom first, so the fit solves from the setting
    // rather than from whatever the previous mode left on this slide - in
    // shrink mode that value IS the ceiling, and starting below it would
    // read as a mode that never gives the size back.
    applyZoom(state.collapse === 'topic-bold' ? collapsedZoom : state.zoom);
    fitZoomToChunk(autoFitCeiling());
  } else {
    applyZoom(state.collapse === 'topic-bold' ? collapsedZoom : state.zoom);
    clampZoomToWidth();
  }
  applyState();
  focusCamera(false);
  flashMode(AUTO_FIT_LABEL[state.autoFitMode]);
}

// Zoom
// What + and – step from. On a chunk that clampZoomToWidth had to shrink,
// state.zoom is what this slide can show, not what the lecturer asked for –
// stepping from it would land back on the same clamped value and the key
// would read as dead. Step from the choice instead, so the setting really
// moves even when this one slide cannot follow it.
//
// shrink counts as "the lecturer's zoom is still a setting" and full does
// not, which is the same line the two modes are separated by everywhere
// else: under a ceiling of the lecturer's own zoom, state.zoom is what this
// slide could take of it, and under a ceiling of 2.2 it is the answer.
function zoomBase() {
  return (state.autoFitMode !== 'full' && state.collapse === 'topic-bold') ? collapsedZoom : state.zoom;
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
  // zoomBase() and not state.zoom: on this slide state.zoom may be what an
  // automatic shrink could show of the setting rather than the setting, and
  // carrying that across a C press would lower the lecturer's zoom a little
  // on every wide slide they pass. setZoom is the only writer of the
  // setting, so outside full auto-fit this line is now a no-op by design.
  if (leavingCollapsed) collapsedZoom = zoomBase();
  state.collapse = COLLAPSE_MODES[ni];
  applyState();
  if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
  else if (state.collapse === 'none') fitZoomToChunk();
  else { applyZoom(collapsedZoom); clampZoomToWidth(); }
  focusCamera(false);
  broadcastState();
  flashMode('collapse: ' + COLLAPSE_LABEL[state.collapse]);
}

// One step of the zoom key, snapped to the ladder rather than added to where
// we happen to be. Adding 0.1 to the 1.35 default gave 1.25, 1.15, 1.05,
// 0.95 - a ladder on which **1.00 cannot be reached at all**, which is the
// one number a lecturer is most likely to want. Working in whole units of
// 0.05 (the grid clampZoom already rounds to) keeps the arithmetic exact:
// from an odd unit the first press lands on the neighbouring even one, and
// every press after that is a whole 0.1.
function stepZoom(dir) {
  const n = Math.round(zoomBase() * 20);
  const m = (n % 2 === 0) ? n + dir * 2 : n + dir;
  setZoom(m / 20);
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
  let limited;
  if (state.autoFitMode === 'shrink' && state.collapse === 'topic-bold') {
    // In shrink mode the setting is also the ceiling, so a change to it has
    // to be re-solved against this slide at once, or + reads as a key that
    // works on every slide except the one you are looking at. Held to the
    // collapsed mode for the reason clampZoomToWidth is: in the full text
    // the zoom is already a one-off correction of an automatic fit, and
    // fitting it again would undo the correction as it was made.
    fitZoomToChunk(collapsedZoom);
    limited = state.zoom < collapsedZoom;
  } else {
    limited = clampZoomToWidth();
  }
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
// The mark after a link, and Shift-click, are one act with two ways in. The
// mark exists because the modifier is not discoverable: a reader who has not
// been told about it never finds the address or its code. Both end in the
// same call, so the projection, the peer message and the freeze rule cannot
// drift apart between them.
document.addEventListener('click', (e) => {
  const mark = e.target.closest && e.target.closest('button[data-link-code]');
  if (!mark) return;
  e.preventDefault();
  e.stopPropagation();
  const a = mark.previousElementSibling;
  const href = mark.dataset.linkCode;
  const label = (a && a.tagName === 'A' ? a.textContent : '').trim();
  showLinkOverlay(href, label);
  sendToPeer({ type: 'link-show', source: VIEW, href, label });
  if (VIEW === 'speaker') flashMode('address shown on the projection');
  // Chrome leaves a clicked button focused, and the guard above then hands
  // it the next Space - so a lecturer who clicked the mark and pressed Space
  // to move on would have re-opened the address instead. A keyboard
  // activation reports detail 0 and keeps its place in the tab order.
  if (e.detail > 0) mark.blur();
}, true);

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
  flashMode('select text while Alt/option is held · Esc clears');
});
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt') return;
  altSelectHeld = false;
  if (!touchSelectOn && !hasTextSelection()) setSelecting(false);
});
document.addEventListener('selectionchange', () => {
  if (!altSelectHeld && !touchSelectOn && !hasTextSelection()) setSelecting(false);
});
// Alt-Tab away and the keyup never arrives, which would strand the stage in
// a state where dragging silently stops panning.
window.addEventListener('blur', () => {
  altSelectHeld = false;
  if (!touchSelectOn && !hasTextSelection()) setSelecting(false);
});

// ── the one question the click path asks ────────────────────────────
// Turning the stage selectable is not enough on its own: a drag across a
// code block still ends in a click on that block, and every handler that
// answers a click by navigating, focusing, closing or panning would answer
// this one too. That is how Alt-dragging a listing came to open the focus
// card instead of highlighting the line - and, with the card already open,
// to close it. Five sites stand aside for it, and they ask one predicate
// rather than each carrying its own copy of the condition: the two that
// decide at pointerdown ask whether this drag is going to select (the
// camera's pan, and the card's), the three that decide at click ask whether
// the gesture that just ended was a selection (the chunk, the focus target,
// and the card's click-to-close).
//
// The answer belongs to the gesture and not to the keyboard at the instant
// the click arrives, so it is decided at pointerdown and read at click: let
// go of Alt before the mouse comes up and the drag you are finishing is
// still the selection you started.
//
// Two signals rather than one, because they answer different halves. The
// class deliberately outlives the keyup while a highlight is still on screen
// - that is what lets a lecturer reach Cmd-C - so suppressing on the class
// alone would eat the first ordinary click after every selection, and
// clicking a figure to zoom it would do nothing until you clicked twice. The
// key alone is not enough either: a drag that starts on a standing highlight
// is the user still working with the selection, and the click that ends it
// must not zoom the block it happens to have crossed. So a held modifier
// means the pointer is selecting whatever it does, and a standing highlight
// means a drag is.
function stageSelectable() { return document.body.classList.contains('text-selecting'); }
function selectionModeOn() { return altSelectHeld || touchSelectOn; }
const pointerGesture = { selectable: false, mode: false, x: 0, y: 0 };
// Capture, on the document, so it is recorded before any handler that will
// go on to read it - including the ones bound to the stage and the overlay.
document.addEventListener('pointerdown', (e) => {
  pointerGesture.selectable = stageSelectable();
  pointerGesture.mode = selectionModeOn();
  pointerGesture.x = e.clientX;
  pointerGesture.y = e.clientY;
}, true);
// The same 3px the pan handlers use to tell a drag from a tap, measured
// against the click's own coordinates so no extra pointermove listener has
// to run for every gesture on the page.
function gestureSelects(ev) {
  if (pointerGesture.mode) return true;
  if (!pointerGesture.selectable) return false;
  return Math.abs((ev.clientX || 0) - pointerGesture.x) > 3
      || Math.abs((ev.clientY || 0) - pointerGesture.y) > 3;
}

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
  // A focused control has to be able to answer its own key. Space on the
  // focused link mark advanced the deck instead of showing the address, so
  // the mark was reachable by mouse alone - which is the thing it exists to
  // stop being. Narrow to that one button on purpose: standing back for
  // every button would take Space away from a lecturer who had just clicked
  // the freeze control and still expected the next press to advance.
  if (e.target.closest && e.target.closest('button[data-link-code]')
      && (e.key === 'Enter' || e.key === ' ')) return;
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
    // Forward and back are one pair everywhere - across reveals, across
    // chunks, across columns - and Shift is the column modifier from any
    // slide. That is the whole model, and it replaced one where the sideways
    // arrows changed column on the first chunk of a column and meant
    // forward/back on every other: an exception on exactly the slides a
    // lecturer arrives at, which is the worst place to keep one.
    // Shift collides with nothing here: the arrows are not cycling keys, so
    // it does not meet the Shift that runs C, F, A and L backwards.
    // updateNavHints still paints a mark, and it says something else now -
    // not "sideways changes column on this slide" but "the next forward press
    // leaves this column", which is a fact about the key already under the
    // finger rather than about a key that might not be pressed.
    case 'ArrowRight': e.shiftKey ? nextCol() : goForward(); e.preventDefault(); break;
    case 'ArrowLeft':  e.shiftKey ? prevCol() : goBack();    e.preventDefault(); break;
    // Down, Space, Enter and a presenter's forward button are one key, and
    // Up, PageUp and Backspace are its mirror. Down used to skip straight to
    // the next chunk, which meant walking a segmented slide with the arrows
    // silently swallowed every reveal on it – and remembering to switch to
    // Space for exactly those slides is the kind of thing that goes wrong in
    // front of a room. It never swallows one now, in either direction.
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      if (overview) { e.preventDefault(); break; }
      goBack(); e.preventDefault(); break;
    case 'ArrowDown':
    case 'PageDown':
    case ' ': {
      if (overview) { e.preventDefault(); break; }
      goForward();
      e.preventDefault(); break;
    }
    case 'Enter': {
      if (overview) { toggleOverview(); e.preventDefault(); break; }
      goForward();
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
      if (hasTextSelection() || touchSelectOn) {
        setTouchSelect(false);
        endSelecting();
        const sb = document.querySelector('#touch-controls [data-action=select]');
        if (sb) sb.setAttribute('aria-pressed', 'false');
        e.preventDefault(); break;
      }
      if (focusedFigure) {
        unfocusFigure();
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
        break;
      }
      if (tocVisible) { tocVisible = false; document.body.classList.remove('toc-visible'); break; }
      if (overview) { dismissOverviewNoMove(); break; }
      if (annotEditingId) { blurAnnotation(); break; }
      // A brought-in aside is a camera state like the drag-pan, and it is
      // the more recent of the two, so it unwinds first.
      if (asidePan) {
        clearAsidePan();
        focusCamera(false);
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unpan' });
        break;
      }
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
    case '#': cycleAutoFit(1); e.preventDefault(); break;
    case '+': case '=':
      if (focusedFigure) setFigureScale(figureScale * 1.2);
      else stepZoom(1);
      e.preventDefault(); break;
    case '-': case '_':
      if (focusedFigure) setFigureScale(figureScale / 1.2);
      else stepZoom(-1);
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
  // so the camera must keep its hands off it. The pointerdown-time question
  // is the stage's own selectability, not the modifier: a lingering
  // highlight leaves user-select on, so this drag would select either way.
  if (stageSelectable()) return;
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
// dimmed underneath; .marginalia gets no overlay - it is in the slide's
// layout rather than laid over it - and the camera slides right instead,
// far enough to put the whole aside inside the frame. See setAsidePan.
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
  fitFocusedMath(clone);
}

// A display formula is the one focus target whose size is set in type rather
// than by a box, and type does not know how tall the screen is. The overlay
// enlarges it to 0.12 of the slide height - 108px at 1440x900, three times
// what it was on the slide - and then the card caps at 98vh with overflow-y
// hidden. Eight rows of an aligned block measured 435px on the slide, fully
// visible, and 1285px inside an 882px card once focused: the bottom third of
// the formula was gone, and clicking a thing to see it better had made a
// third of it invisible.
//
// Scrolling is not the way out of this, however natural it looks beside the
// code block's overflow: auto. The overlay's wheel handler preventDefaults
// and zooms, and a drag pans, so a scrollbar inside the card is reachable
// only by dragging the bar itself, and on a touchscreen not at all.
//
// So the enlargement stops where the screen does. KaTeX scales linearly with
// its font size, which makes the correction one ratio rather than a search:
// the height it wants against the height it has. The second pass is not for
// re-flow - a formula does not re-wrap - it is for the horizontal scrollbar a
// narrow window can add underneath, which takes back a few pixels of the
// height the first pass just measured.
//
// Each window fits for itself, deliberately, and no part of this is
// broadcast: the projection and the cockpit's scaled stage are different
// sizes, so the answer is different, and the shared figure-view message
// carries the lecturer's own zoom and pan on top of whatever each window
// found. Same reasoning as clampZoomToWidth.
function fitFocusedMath(card) {
  if (!card.classList || !card.classList.contains('math-display')) return;
  const kx = card.querySelector('.katex');
  if (!kx) return;
  for (let pass = 0; pass < 2; pass++) {
    const cs = getComputedStyle(card);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const have = card.clientHeight - pad;
    const want = card.scrollHeight - pad;
    if (!(want > have + 1) || !(have > 0)) return;
    const size = parseFloat(getComputedStyle(kx).fontSize) || 0;
    if (!size) return;
    // 0.99 keeps the result off the exact edge, where a rounded layout pixel
    // would put the last row back under the clip.
    kx.style.fontSize = (size * (have / want) * 0.99) + 'px';
  }
}

// Overlay pointerdown: drag pans the focused figure; a click without
// drag closes (matches the previous click-to-unfocus affordance). 3px
// movement threshold mirrors the viewport-pan handler so a fingertip
// jitter still counts as a tap.
figureOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, textarea, input')) return;
  // The card is where a listing is largest and most readable, so it is where
  // a line is most likely to be copied. While the overlay is selectable the
  // drag belongs to the browser's own selection and the card must neither
  // pan under it nor close when the pointer comes up. Recorded here for the
  // same reason as everywhere else: Alt can be let go before the mouse is.
  const selecting = stageSelectable();
  const session = {
    x: e.clientX, y: e.clientY,
    panX0: figurePan.x, panY0: figurePan.y,
    moved: false,
  };
  const move = (ev) => {
    if (selecting) return;
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
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) {
      // Pure click → close (preserve previous click-to-unfocus UX) – unless
      // the pointer is being used to select, in which case it placed a caret
      // and closing the card would throw away what was being read.
      if (gestureSelects(ev)) return;
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

// Bring a .marginalia into the frame, or let it go again. All this does is
// set the state focusCamera solves against; the offset itself is derived
// there, from the aside's live geometry.
//
// A slide with a marginalia is framed exactly as one without: the aside is
// out past the text column and the frame simply cuts it off, which is the
// whole affordance - the reader sees that something continues off the right
// edge and clicks it.
function setAsidePan(el) {
  const chunk = el && el.closest('.chunk');
  if (!chunk || !chunk.dataset.chunkId) return;
  asidePan = { chunkId: chunk.dataset.chunkId, el };
  document.body.classList.add('aside-panned');
  focusCamera(false);
}
function clearAsidePan() {
  if (!asidePan) return false;
  asidePan = null;
  document.body.classList.remove('aside-panned');
  return true;
}

// ── where forward will take you ───────────────────────────────────
// One fact about the current slide that the picture cannot carry and that the
// keys otherwise only reveal by being pressed: the next forward press leaves
// this column. Drawn at the viewport edge rather than on the slide, so
// nothing in the author's layout moves, and quiet enough to sit on a
// projection - it is a compass, not a control.
//
// There were three marks. Two of them said "sideways changes column here",
// which was worth saying while the sideways arrows meant two different things
// depending on where you stood. They mean one thing now, and Shift means the
// other everywhere, so there is no longer a question for a mark to answer.
function buildNavHints() {
  const vp = document.getElementById('stage-viewport');
  if (!vp || document.getElementById('nav-hints')) return;
  const wrap = document.createElement('div');
  wrap.id = 'nav-hints';
  wrap.setAttribute('aria-hidden', 'true');
  const s = document.createElement('span');
  s.dataset.hint = 'down';
  s.textContent = '\u2304';
  wrap.appendChild(s);
  vp.appendChild(wrap);
}

function updateNavHints() {
  const wrap = document.getElementById('nav-hints');
  if (!wrap) return;
  const i = state.activeIdx;
  const c = flatChunks[i];
  const show = (dir, on) => {
    const el = wrap.querySelector('[data-hint="' + dir + '"]');
    if (el) el.toggleAttribute('data-on', !!on);
  };
  // Blanking darkens the audience stage only, so the cockpit is exactly where
  // the marks are still wanted: the lecturer is navigating with the room dark.
  if (!c || overview || (state.blanked && VIEW === 'audience')) {
    show('down', false);
    return;
  }
  // Forward leaves the column – but only once there is nothing left to
  // reveal, because until then forward is still working on this slide.
  const beatsLeft = (revealed[c.id] ?? (countSegments(c.el) ? 1 : 0)) < countSegments(c.el);
  show('down', c.colLast && !beatsLeft && i + 1 < flatChunks.length);
}

// The controls a finger can reach, in both live views. CSS hides the whole
// thing on fine-pointer devices, so a laptop never sees it and an iPad with a
// Magic Keyboard re-classifies and loses it again.
//
// Every case here calls the function the key calls, and nothing else. Not one
// of them re-implements what a key does: cycleFont is cycleFont, and the day
// the F key learns a fourth face the button learns it too. A second code path
// is how a palette comes to disagree with a key map, which is the same failure
// build.js and lint.js have to be grepped against each other to avoid.
function wireTouchControls() {
  const bar = document.getElementById('touch-controls');
  if (!bar) return;
  const palette = document.getElementById('touch-palette');
  const moreBtn = bar.querySelector('[data-action=more]');
  const selBtn = bar.querySelector('[data-action=select]');
  const setPalette = (open) => {
    if (palette) palette.hidden = !open;
    if (moreBtn) moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    switch (btn.dataset.action) {
      case 'prev':      goBack(); break;
      case 'next':      goForward(); break;
      case 'overview':  toggleOverview(); break;
      case 'zoom-in':
        if (focusedFigure) setFigureScale(figureScale * 1.2);
        else stepZoom(1);
        break;
      case 'zoom-out':
        if (focusedFigure) setFigureScale(figureScale / 1.2);
        else stepZoom(-1);
        break;
      case 'more':      setPalette(palette && palette.hidden); break;
      case 'collapse':  cycleCollapse(1); break;
      case 'font':      cycleFont(1); break;
      case 'theme':     cycleTheme(1); break;
      case 'autofit':   cycleAutoFit(1); break;
      case 'search':    setPalette(false); startSearch(); break;
      case 'select':    setTouchSelect(!touchSelectOn); break;
    }
    if (selBtn) selBtn.setAttribute('aria-pressed', touchSelectOn ? 'true' : 'false');
  });
}

// Selecting text without a modifier key.
//
// On a keyboard this is Alt held down, deliberately: a mode is state you can
// forget you are in, and the state you forget here is the one where dragging
// no longer pans. A finger has no modifier to hold, so on touch it has to be
// a mode - and the two mitigations are that the button shows it is on and
// that Esc, or turning it off, clears both the mode and the selection.
//
// It needs its own flag rather than borrowing altSelectHeld, because the
// selectionchange listener switches the class off whenever there is no
// selection and no key held. Toggling the mode on would have survived exactly
// until the next tap.
let touchSelectOn = false;
function setTouchSelect(on) {
  touchSelectOn = on;
  if (on) {
    setSelecting(true);
    flashMode('select text by dragging · tap the button again to pan');
  } else {
    endSelecting();
  }
}

function wireFigureClicks() {
  flatChunks.forEach(({ el }) => {
    el.querySelectorAll(FOCUSABLE_SEL).forEach(target => {
      if (target.dataset.figureWired) return;
      target.dataset.figureWired = '1';
      target.addEventListener('click', (ev) => {
        if (overview) return;
        // A drag across this <pre> ends in a click on it, so without this the
        // one element a lecturer most wants to copy out of is the one that
        // cannot be selected: the highlight is made and the focus card opens
        // on top of it.
        if (gestureSelects(ev)) return;
        if (ev.target.closest('.annot-textarea, input, button')) return;
        const chunk = target.closest('.chunk');
        if (!chunk || !chunk.classList.contains('active')) return;
        ev.stopPropagation();
        ev.preventDefault();
        if (target.classList.contains('marginalia')) {
          // A second click on the aside is the way back, the same as Esc:
          // the thing that brought it in is the nearest thing to hand.
          const panned = asidePan && asidePan.el === target;
          if (panned) clearAsidePan(); else setAsidePan(target);
          focusCamera(false);
          if (shouldBroadcast()) {
            const figureIdx = Array.from(chunk.querySelectorAll(FOCUSABLE_SEL)).indexOf(target);
            sendToPeer({
              type: panned ? 'figure-unpan' : 'figure-pan',
              chunkIdx: state.activeIdx, figureIdx,
            });
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
markColumnEdges();
buildNavHints();
initDiagrams();
applyRevealAll();
applyState();
// Two rAFs so fonts have a chance to settle before the first camera solve.
requestAnimationFrame(() => requestAnimationFrame(() => {
  // A lecture that opens with auto-fit has to fit its *first* slide too.
  // jumpTo does this on every later move; nothing calls it at boot.
  if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
  else clampZoomToWidth();
  focusCamera(true);
  // Same reasoning for autoplay, and it matters more here: the cover is
  // the slide the feature was asked for, and jumpTo never runs on it.
  restartAutoplay();
}));
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
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
  const styleOpts = styleSettings(frontmatter);

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
${styleBlockCss(styleOpts)}
${fontStyleTag(opts.fontEmbed)}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${reloadScript(opts.watchPort, opts.watchNonce)}
</head>
<body ${viewBodyAttrs(defaults, 'data-view="speaker" ' + styleBodyAttrs(styleOpts, frontmatter))}>
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
${TOUCH_CONTROLS_HTML}
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
    // Edits made while frozen were held back, not dropped: the editor kept
    // the latest source per figure, and thawing is when the room gets the
    // finished picture – the exact promise the freeze workflow makes.
    if (window.psiEditorThaw) window.psiEditorThaw();
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
      const beforeSrc = src;
      // Both spellings of a reference – the markdown `](path)` form and the
      // bare token a ::: draw `image` statement carries. Rewriting only
      // the markdown form deleted an original a diagram still pointed at
      // and then reported the rewrite as done: the next build failed on a
      // file this very command had removed. Fence-aware, line by line,
      // because a path inside a code fence is documentation, not a
      // reference – the same rule the collector follows.
      const esc = explicit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let fence = false;
      src = src.split('\n').map((line) => {
        if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
        if (fence) return line;
        return line.split(`](${explicit})`).join(`](${replacement})`)
          .replace(new RegExp(`(^|[\\s(])${esc}(?=[\\s)]|$)`, 'g'),
            (m0, pre) => pre + replacement);
      }).join('\n');
      if (src !== beforeSrc) sourceEdits.push({ from: explicit, to: replacement });
      else console.log(`  [warn] ${explicit} was converted but no reference in ${path.basename(absIn)} matched – check the file by hand.`);
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
  // DIAGRAM_CSS ships into all four views and was the one inlined
  // stylesheet this guard did not cover – the exact gap the guard exists
  // to close.
  const sheets = { AUDIENCE_CSS, SPEAKER_CSS, PRINT_CSS, DIAGRAM_CSS, 'editor.css': editorCss() };
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
  // Diagrams are compiled once per build and the same markup goes into all
  // four views, so a symbol defined during that one compile is present in
  // every document that references it. Reset here, with everything else that
  // is per build, or a --watch rebuild would keep pointing at symbols the
  // previous pass emitted.
  dgSymbolCounter = 0;
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
  assertCoverBody(lecture);
  // Pre-flight, beside assertInlinable and assertCoverBody: a viewer default
  // or a style key with a value the tool does not know fails the build here
  // rather than inside whichever renderer happens to read it. Both functions
  // are pure and the renderers call them again with the same frontmatter, so
  // this costs a parse of the block and buys the one property that matters -
  // `--print-only` refuses a typo in `auto-fit` and `--audience-only` refuses
  // one in `print-slide-numbers`, neither of which the view being built
  // would ever have looked at.
  viewDefaults(lecture.frontmatter);
  styleSettings(lecture.frontmatter);
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
  const roster = bundledRoster(lecture.frontmatter);
  // Only the roles the author did not fill from fonts/ come out of the
  // bundle, and only the three families this lecture resolved to are read
  // at all – which is what keeps a 3.87 MB alternate off every other deck.
  const bundleRoster = Object.fromEntries(
    ['serif', 'sans', 'mono'].filter(r => !claimed.has(r)).map(r => [r, roster[r]]));
  const bundled = bundleOff ? [] : bundledFaces(bundleRoster);
  // A bundled family other than the built-in default has to be named at the
  // head of the stack, or the @font-face lands and nothing asks for it:
  // --sans-font still says 'IBM Plex Sans' first and falls through to
  // whatever the machine has. Only emitted where it differs, so a default
  // lecture's CSS is byte-identical to before.
  const rosterOverrides = ['serif', 'sans', 'mono']
    .filter(r => !claimed.has(r) && !bundleOff && roster[r] !== BUNDLED_DEFAULTS[r])
    .map(r => ({ role: r, family: roster[r] }));
  const fontEmbed = (authorFonts || bundled.length)
    ? { faces: authorFonts ? authorFonts.faces : [],
        overrides: [...(authorFonts ? authorFonts.overrides : []), ...rosterOverrides],
        bundled }
    : null;
  if (authorFonts) {
    const kb = Math.round(authorFonts.bytes / 1024);
    console.log(`[fonts] ${authorFonts.faces.length} face(s) from fonts/ embedded, ${kb} KB per view. Check that your licence permits redistribution.`);
    for (const n of authorFonts.notes) console.log(`[fonts] ${n}`);
  }
  if (bundled.length) {
    const bytes = bundled.reduce((n, f) => n + f.bytes, 0);
    const names = [...new Set(bundled.map(f => f.family))].join(', ');
    const size = bytes > 900 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
    console.log(`[fonts] ${bundled.length} bundled face(s) embedded – ${names} – ${size} per view (OFL-1.1). Use \`fonts: none\` to ship without them.`);
    // Said once, with the number, rather than left to be discovered when
    // the mail attachment bounces. 900 KB is well above every variable
    // subset here and well below Iosevka's smallest useful set.
    if (bytes > 900 * 1024) {
      console.warn(`[fonts] that is ${(bytes * 4 / 3 / 1024 / 1024).toFixed(1)} MB of base64 in each of the four views. A static face`);
      console.warn('        (Iosevka) is an order of magnitude heavier than a variable latin subset;');
      console.warn('        pick a variable family or `fonts: none` if the file has to travel by mail.');
    }
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

  // The last rebuild's failure, if any. A failed rebuild used to be visible
  // only in the terminal: the open pages kept the old build silently, and
  // the next write-back was refused with "reload the page and try again" –
  // advice that cannot help while the build is broken. The pages are told,
  // and the refusal below names the real problem.
  let lastBuildError = null;
  const rebuild = (label) => {
    try {
      const { written, shape } = buildOnce(absIn, only, opts);
      lastBuildError = null;
      console.log(`[${label}] ${written.join(', ')} (${shape})`);
      broadcast('reload');
    } catch (err) {
      lastBuildError = err.message;
      console.error(`[${label}] build failed: ${err.message}`);
      broadcast(JSON.stringify({ type: 'build-failed', why: err.message }));
    }
  };

  // Write-back from the editor. Three things have to be true before a patch
  // touches the file, and the third is what makes two open tabs safe:
  //
  //  - the nonce matches this build's,
  //  - the range is one a `::: draw` block of the last build actually
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
      if (!hit) return reply(false, 'that is not a ::: draw block this build emitted');
      let src;
      try { src = fs.readFileSync(absIn, 'utf8'); } catch (e) { return reply(false, 'cannot read the source: ' + e.message); }
      // The ranges are in LF coordinates (parseLecture normalises); a CRLF
      // file is spliced in the same coordinates and written back as LF.
      src = src.replace(/\r\n?/g, '\n');
      const there = src.slice(range[0], range[1]);
      if (there !== hit.body) {
        return reply(false, lastBuildError
          ? `the last rebuild failed (${lastBuildError}) – fix that first; reloading alone cannot help`
          : 'source.md has changed since this build – reload the page and try again');
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
presenter: TODO – presenter
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

::: draw
box a "A"
:::

A seed for the diagram editor: build this lecture, click the figure, and the
button in the corner of the card opens it. The editor is bad at exactly the
part a new figure needs – the chunk id, the heading, the caption prose – so
those are text, and this is the two lines that give it something to open.
`;
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

// `into` is the folder the new lecture folder is created in. Without it the
// destination is `lectures/` under the working directory, which is right for
// somebody working inside a checkout of this repository and wrong for every
// other caller - a content repository beside it, or the desktop builder,
// which asks the author where the project should live.
function runNew(slug, into) {
  if (!slug) {
    console.error('Usage: node build.js --new <slug> [--into <dir>]   (e.g. --new wlab02)');
    process.exit(1);
  }
  if (!SLUG_RE.test(slug)) {
    console.error(`Invalid slug: ${slug}. Use lowercase letters, digits, and hyphens; must start with a letter.`);
    process.exit(1);
  }

  const dir = into ? path.resolve(into, slug) : path.resolve('lectures', slug);
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
const VALUE_FLAGS = new Set(['--max-width', '--port', '--viewport', '--squint-out', '--into']);

// ── driving the built projection (shared by --check-fit and --squint) ─
// Two commands answer questions that only a rendered page can answer - does
// the slide fit the frame, and what does the slide actually say - and both
// have the same three ways of not being able to look: nothing was built, no
// playwright-core, no browser. Written twice, the second copy learned the
// Chrome channel order late and by hand.
//
// Every failure here degrades rather than fails. A missing browser is a fact
// about the machine, not a defect in the deck, so it reports and returns 0;
// only "you have not built this yet" is the author's to fix.
async function openAudienceProbe(absIn, label, viewport, verb = 'read') {
  const audience = path.join(path.dirname(absIn), 'audience.html');
  if (!fs.existsSync(audience)) {
    console.error(`${label}: no audience.html beside the source; build it first.`);
    return { code: 1 };
  }
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error(`${label}: playwright-core is not installed, so nothing was ${verb}.`);
    console.error(`${' '.repeat(label.length)}  npm install, then try again.`);
    return { code: 0 };
  }
  // $PSI_CHROME first, which is what the test suite and docs/site/shoot.mjs
  // already read: a machine with a browser only in the Playwright cache has
  // no channel to answer these, and asking the author to install a second
  // Chrome to read their own slides back is not an answer.
  let browser;
  const starts = [
    ...(process.env.PSI_CHROME ? [{ executablePath: process.env.PSI_CHROME }] : []),
    { channel: 'chrome' }, { channel: 'msedge' }, {},
  ];
  for (const how of starts) {
    try { browser = await chromium.launch(how); break; } catch { /* next */ }
  }
  if (!browser) {
    console.error(`${label}: no Chrome or Chromium this process could start, so nothing was ${verb}.`);
    return { code: 0 };
  }
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(audience).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { browser, page };
}

// WIDTHxHEIGHT off the command line, for both commands that take one. Exits
// rather than falling back to the default: a mistyped viewport that silently
// measures 1600x900 answers a question nobody asked.
function readViewportFlag(argv, fallback = { width: 1600, height: 900 }) {
  const at = argv.indexOf('--viewport');
  if (at < 0) return fallback;
  const m = String(argv[at + 1] || '').match(/^(\d{3,5})x(\d{3,5})$/);
  if (!m) {
    console.error('--viewport takes WIDTHxHEIGHT, e.g. --viewport 1600x900.');
    process.exit(1);
  }
  return { width: Number(m[1]), height: Number(m[2]) };
}

// ── --check-fit ──────────────────────────────────────────────────────
// Whether every slide actually fits the frame, measured rather than
// estimated. This exists because nothing else in the toolchain can answer
// it: `lint.js` has no browser, the density budgets are word counts, and
// `::: cards` and `::: rows` are exactly the constructs that break the
// relation between words and height. A deck can reach `0 errors, 0
// warnings` under `--strict` with a card's reading sentence off the bottom
// of the slide and its heading scrolled off the top.
//
// Three decisions, each of which was got wrong once by a hand-rolled
// version of this check before it was written down:
//
//   * **1600x900.** A projector is 16:9. `.wide` resolves through auto-fit,
//     so the em - and with it every wrapped card and row - is a function of
//     the viewport. Two chunks that measured inside the frame at a laptop's
//     1440x810 are 835 and 836 px tall in a 900 px 16:9 one.
//   * **Against the stage, not a threshold.** The question is whether any
//     of the content is off the frame, so the comparison is the content box
//     against #stage-viewport's box - not the content height against a
//     guessed number with a fudge factor for chrome.
//   * **Per state, not per chunk.** A slide can fit at beat 0 and overflow
//     at beat 2, when a later reveal or figure step re-centres the stage.
//     A per-chunk probe cannot see that, so the walk presses the key.
//
// Degrades rather than fails: no browser, or no playwright-core, reports
// that it could not look and leaves the build's own exit code alone.
async function runCheckFit(absIn, viewport) {
  const opened = await openAudienceProbe(absIn, '--check-fit', viewport, 'measured');
  if (!opened.page) return opened.code;
  const { browser, page } = opened;

  const probe = () => page.evaluate(() => {
    const act = document.querySelector('.chunk.active');
    if (!act) return null;
    const content = act.querySelector('.chunk-content') || act;
    const r = content.getBoundingClientRect();
    const vp = document.getElementById('stage-viewport').getBoundingClientRect();
    // What the height is *made of*, which is not the same question as how
    // many words the chunk holds. Under topic-bold the collapse renders the
    // first sentence of each paragraph plus every promoted bold, and hides
    // `.sentence-rest .prose` outright - so cutting words out of a
    // continuation changes the collapsed height by exactly nothing, and the
    // word count is the wrong lever. Each promoted bold is display: block
    // with its own top margin, so un-bolding one removes a whole line box.
    const collapse = document.body.dataset.collapse || '';
    let bolds = 0, boldPx = 0;
    if (collapse === 'topic-bold') {
      for (const b of act.querySelectorAll('.reveal-segment .sentence-rest strong')) {
        const br = b.getBoundingClientRect();
        if (!br.height || b.offsetParent === null) continue;
        bolds++;
        boldPx += br.height + parseFloat(getComputedStyle(b).marginTop || 0);
      }
    }
    return {
      id: act.dataset.chunkId || act.id || '?',
      tag: act.dataset.tag || '', width: act.dataset.width || '',
      top: Math.round(r.top - vp.top), bottom: Math.round(r.bottom - vp.top),
      h: Math.round(r.height), vpH: Math.round(vp.height),
      collapse, bolds, boldPx: Math.round(boldPx),
    };
  });

  // The screenshot hash, not the DOM, decides when the walk is over. A
  // figure step changes no text and no element count, so a signature taken
  // from the document reports "nothing moved" and stops the walk on the
  // first stepped figure in the deck.
  const worst = new Map();
  let states = 0, lastHash = null, same = 0;
  for (let i = 0; i < 400; i++) {
    const st = await probe();
    if (!st) break;
    const shot = await page.screenshot();
    const hash = crypto.createHash('sha1').update(shot).digest('hex');
    // Count a state, not an iteration: a repeat that has not yet tripped the
    // two-in-a-row stop is the same slide seen twice. --squint counts the same
    // way, and the two commands reporting different totals for one deck is a
    // puzzle a reviewer should not have to solve.
    if (hash === lastHash) { if (++same >= 2) break; } else { same = 0; states++; }
    lastHash = hash;
    const over = Math.max(0, -st.top) + Math.max(0, st.bottom - st.vpH);
    if (over > 0) {
      const prev = worst.get(st.id);
      if (!prev || over > prev.over) worst.set(st.id, { ...st, over, beat: i });
    }
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(360);
  }
  await browser.close();

  // Two different things, and only one of them is a defect.
  //
  // A chunk **taller than the frame** is shown by scrolling: the stage is a
  // continuous column and it walks down a long chunk as its reveals advance,
  // so nothing is unreachable and the author may well have meant it. The
  // engine's own tutorial has twenty-one of these, at 1200 to 2200 px, and
  // reports every one of them as fine to read.
  //
  // A chunk that **fits the frame and is still outside it** cannot be
  // excused that way: the room has 900 px, the content wants 835, and a
  // sentence is off the bottom anyway. That is the class a review found by
  // hand in a rebuilt course - 835, 836 and 836 px in a 900 px frame - and
  // it is what this command exists to catch. Reported as the failure; the
  // tall ones are reported as a note and change no exit code.
  const all = [...worst.values()].sort((a, b) => b.over - a.over);
  const clipped = all.filter(b => b.h <= b.vpH);
  const tall = all.filter(b => b.h > b.vpH);
  const where = `${viewport.width}x${viewport.height}`;
  const tallNote = tall.length
    ? ` ${tall.length} chunk(s) are taller than the frame and are read by scrolling`
      + ` (${tall.slice(0, 4).map(b => '#' + b.id).join(', ')}${tall.length > 4 ? ', …' : ''}).`
    : '';
  if (!clipped.length) {
    console.log(`[check-fit] ${states} state(s) at ${where}: every slide that fits the frame is inside it.${tallNote}`);
    return 0;
  }
  console.error(`[check-fit] ${states} state(s) at ${where}: ${clipped.length} slide(s) fit the frame`
    + ` and are positioned outside it.${tallNote}`);
  for (const b of clipped) {
    const side = b.top < 0 && b.bottom > b.vpH ? 'clipped at both ends'
      : b.top < 0 ? `${-b.top} px off the top` : `${b.bottom - b.vpH} px off the bottom`;
    console.error(`  #${b.id} (${b.tag}${b.width ? ', .' + b.width : ''}) – ${side}`
      + ` at beat ${b.beat}; content ${b.h} px in a ${b.vpH} px frame, so it would fit.`);
    // The composition, not just the total. Reported because the total sends
    // an author at the word count, and under topic-bold that is the one lever
    // with no effect: a shortened continuation is hidden either way. This
    // line says how much of the height is bolds, each of which is a block
    // that un-bolding removes whole.
    if (b.collapse === 'topic-bold' && b.bolds) {
      console.error(`      ${b.bolds} promoted bold${b.bolds === 1 ? '' : 's'} account for`
        + ` ~${b.boldPx} px of that. Collapsed, this view shows the first sentence of each paragraph`
        + ` plus every bold after it, and hides the rest of the prose – so shortening a continuation`
        + ` changes nothing here, and un-bolding one fragment removes a whole line.`);
    }
  }
  console.error('  Nothing above the top or below the bottom reaches the room, and these would fit if'
    + ' they were a little shorter. Move a paragraph into a ::: expand, split the chunk, or widen it.');
  console.error(`  Measured at ${where} only. A room with a different aspect ratio wraps differently;`
    + ' --viewport WxH checks another one.');
  return 2;
}

// ── --squint ─────────────────────────────────────────────────────────
// What a room would see, in a file. The projection shows far less than the
// source: collapsed, a chunk renders its heading, the first sentence of each
// paragraph and the promoted `**bold**` fragments, while lists, code, figures
// and formulas stay whole, `::: slide` / `::: script` change the rule per
// chunk, and a backdrop or an overlay is not in `.chunk-body` at all. Anyone
// reading source.md - a person or a model - silently reasons about text that
// never reaches the room, and the defects that follow are all one shape: a
// slide that announces a list and withholds it, a sentence that points at
// something nobody can see, an instruction whose "how" is in a continuation
// clause. The lecture's own #anti-patterns chunk names the failure; nothing
// measured it.
//
// Three decisions, and the first is the whole design:
//
//   * **It reads a rendered page, never the source.** The collapse is CSS and
//     JS. A source-parsing extractor would be a second implementation of the
//     exact rule this command exists to stop people getting wrong, and it
//     would be wrong in the same places they are. Every line in the output
//     came out of a built view, and "is this painted?" is a question for the
//     browser (`checkVisibility`), not for a table of selectors here.
//   * **Per beat, not per slide.** A chunk with `---` shows only its first
//     segment when you arrive, and an overlay with `from 2` is not there at
//     all. Reporting the opening state as if it were the slide is the same
//     error one level down, so the walk presses the key and marks what
//     arrives late with `+N`.
//   * **Withheld prose is in the file, abridged.** The question a review
//     actually asks is "what did the room *not* get", and answering it from
//     two files is answering it badly. Answering it in full would make this a
//     copy of source.md with extra steps, so a hidden paragraph is one line:
//     its word count and its opening. The count is the part that diffs -
//     shortening a continuation moves nothing on the slide, and this file
//     says exactly that by changing one number and no text.
//
// Degrades rather than fails, like --check-fit: no browser, or no
// playwright-core, reports that it could not look and leaves the build's exit
// code alone. It never fails a build - it is a description, not a judgement.

// Runs inside the page, once per state, against the active chunk. Passed to
// page.evaluate as a function, so it must close over nothing.
function squintScan() {
  const art = document.querySelector('.chunk.active');
  if (!art) return null;

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const words = (s) => (norm(s).match(/\S+/g) || []).length;

  // Painted or not is a question for the browser. A re-implementation of the
  // collapse rules here would be the mistake this command exists to prevent.
  const seen = (el) => {
    if (!(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (cs.opacity === '0') return false;
    // `display: contents` generates no box, so checkVisibility answers false
    // for it - and this project uses it for a card row's list, for the
    // outline's items and for the divider's lead. Ask the parent instead.
    // Without this the decoration lecture reports six empty slides.
    if (cs.display === 'contents') return el.parentElement ? seen(el.parentElement) : true;
    if (el.checkVisibility) return el.checkVisibility({
      visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true });
    return cs.display !== 'none';
  };

  // Text as a reader gets it. Four things have to go first: a <style> block
  // inside an inlined <svg> is CSS and not prose (a naive walk that skips
  // display:none still finds it); KaTeX renders a hidden MathML copy beside
  // the visible formula, so textContent says every formula twice; <defs>
  // holds markup that is painted nowhere; and a <br> is a space, or two
  // sentences run together into one word.
  const textOf = (el) => {
    const c = el.cloneNode(true);
    for (const k of c.querySelectorAll('.katex')) {
      const tex = k.querySelector('annotation[encoding="application/x-tex"]');
      k.replaceWith(document.createTextNode(tex ? ' ' + norm(tex.textContent) + ' ' : ' '));
    }
    for (const k of c.querySelectorAll('style, script, defs, template, .katex-mathml')) k.remove();
    for (const k of c.querySelectorAll('br')) k.replaceWith(document.createTextNode(' '));
    return norm(c.textContent);
  };

  const lines = [];
  // How deep inside the constructs a line sits. A `::: side` pane, a card row
  // and an overlay all hold text, and a flat run of sentences says nothing
  // about which of them a sentence is inside - which on a two-pane slide is
  // half of what the reader wants to know.
  let depth = 0;
  const put = (mark, text, extra) => {
    const t = norm(text);
    if (!t && mark !== '|') return;
    lines.push(Object.assign({ mark, text: t, depth }, extra || {}));
  };
  const HEAD = 88;
  const clip = (s) => s.length > HEAD ? s.slice(0, HEAD - 1).replace(/\s\S*$/, '') + ' …' : s;
  const withheld = (text, why) => {
    const t = norm(text);
    if (!t) return;
    lines.push({ mark: '~', text: clip(t), depth, words: words(t), why: why || '' });
  };
  const slots = (el, prefix, drop) => [...el.classList]
    .filter(c => c.startsWith(prefix) && !(drop || []).includes(c.slice(prefix.length)))
    .map(c => c.slice(prefix.length)).join(' · ');

  // One paragraph, which is where the whole collapse lives. The head is the
  // topic sentence; in the rest, a <strong> is promoted to its own bullet and
  // everything else is withheld. Whether that is so is read off the page: in
  // the full reading mode the same markup paints the lot, and this then
  // reports one sentence with no bullets and nothing hidden.
  const para = (p) => {
    const head = p.querySelector(':scope > .sentence-head');
    if (!head) { put('.', textOf(p)); return; }
    put('.', textOf(head));
    const rest = p.querySelector(':scope > .sentence-rest');
    if (!rest) return;
    const prose = [...rest.querySelectorAll('.prose')];
    if (!prose.length || prose.some(seen)) { put('.', textOf(rest)); return; }
    for (const s of rest.querySelectorAll('strong')) if (seen(s)) put('-', textOf(s));
    // Lifting the bolds out leaves the prose around them, and joining only the
    // survivors reads as a defect: "Every paragraph has to , because …". The
    // bold went to a `-` line above, so say so in its place rather than
    // closing the gap over it.
    const around = [];
    for (const n of rest.childNodes) {
      if (n.nodeType === 3) { around.push(n.textContent); continue; }
      if (n.nodeType !== 1) continue;
      if (n.classList && n.classList.contains('prose')) { around.push(textOf(n)); continue; }
      if (n.tagName === 'STRONG' && seen(n)) { around.push('[\u2026]'); continue; }
      around.push(textOf(n));
    }
    withheld(around.join(' ').replace(/\s+([,.;:!?])/g, '$1'));
  };

  const list = (el, quiet) => {
    const items = [...el.children].filter(c => c.tagName === 'LI');
    // Which item is live is the whole of what an `outline` divider says. A
    // deck wearing it draws the same list at every part, so without this the
    // five dividers of a five-part lecture are five identical blocks here and
    // the one fact that separates them - which part starts - is in none of
    // them. Read off `aria-current`, which renderOutlineList already writes.
    const live = items.findIndex(li => li.matches('[aria-current]'));
    if (!quiet) put('[', 'list · ' + items.length + (items.length === 1 ? ' item' : ' items')
      + (live >= 0 ? ' · live ' + (live + 1) + ' of ' + items.length : ''));
    for (const li of items) {
      if (!seen(li)) continue;
      const mark = li.matches('[aria-current]') ? '▸' : '•';
      const nested = [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
      // Both of this project's two-cell list items are written with no
      // whitespace between the cells, because the grid supplies the gap: the
      // running agenda's numeral and its heading, and a card row's term and
      // its body - `renderOutlineList` writes the one, and the `b.rows` branch
      // of the card renderer eats the space to write the other. Read flat,
      // textContent runs the pair into one word that is on no slide, and a
      // reviewer then repairs a defect the deck does not have: "1The cover",
      // "Anonymitycomes from the others". The class sits on the *second* cell
      // in both, so one test finds both and a third such construct adds a
      // selector here and nothing else.
      if (li.querySelector(':scope > .so-text, :scope > .row-body')) {
        put(mark, [...li.children]
          .filter(k => !nested.includes(k) && seen(k)).map(textOf).filter(Boolean).join(' '));
      } else {
        const bare = li.cloneNode(true);
        for (const n of bare.querySelectorAll('ul, ol')) n.remove();
        put(mark, textOf(bare));
      }
      for (const n of nested) for (const sub of [...n.children]) put('•', '· ' + textOf(sub));
    }
  };

  // A figure is reported by what it is and how much of it there is, and its
  // labels are not transcribed. A drawing's meaning is its arrangement, and a
  // list of eleven words in reading order would describe a different picture
  // from the one on the slide - convincingly, which is worse than not at all.
  const figure = (el) => {
    const q = (s) => el.querySelector ? el.querySelector(s) : null;
    const svg = q('svg.psi-diagram');
    const img = q('img');
    const cap = q('figcaption');
    let what;
    if (svg) {
      const d = svg.psiDiagram;
      const n = svg.querySelectorAll('text').length;
      what = 'drawing · ' + n + (n === 1 ? ' label' : ' labels')
        + (d && d.data && d.data.n > 1 ? ' · ' + d.data.n + ' beats' : '');
    } else if (img) what = 'image' + (img.alt ? ' "' + norm(img.alt) + '"' : '');
    else if (q('video')) what = 'video';
    else if (q('iframe, .embed-card, .embed-shell')) what = 'hosted embed';
    else if (q('svg')) what = 'artwork (svg)';
    else what = 'figure';
    put('[', what);
    if (cap && seen(cap)) put('.', textOf(cap));
  };

  const walk = (el, ctx) => {
    const tag = el.tagName;
    const cl = el.classList;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TEMPLATE' || tag === 'NOSCRIPT'
      || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'defs') return;
    if (cl.contains('annot-box') || cl.contains('annot-add') || cl.contains('chunk-num')
      || cl.contains('exps')) return;

    // Four constructs are reported whether the page paints them or not,
    // because the fact worth having is that they exist. A `.bare` heading is
    // in the document and off the slide; an expansion is a key press away; a
    // ::: script block is the half that is deliberately not on screen; and a
    // backdrop is a picture that is not in .chunk-body at all - an extractor
    // that walks only the body calls such a chunk empty.
    if (cl.contains('chunk-backdrop')) {
      const url = (el.style.backgroundImage || '').match(/url\(["']?([^"')]*)/);
      const ref = !url ? '' : (/^data:/.test(url[1]) ? 'inlined'
        : decodeURIComponent(url[1].split('/').pop()));
      let frames = '', moved = '';
      try {
        const f = JSON.parse(el.getAttribute('data-bd-frames') || 'null');
        if (f) {
          // Both sides through the same serialiser. The runtime assigns a
          // frame straight out of this list, but `style.clipPath` reads back
          // what CSS made of it - `inset(0)` comes out `inset(0px)` - so a
          // string comparison against the list itself never matches.
          const probe = document.createElement('div');
          const canon = (v) => { probe.style.clipPath = ''; probe.style.clipPath = v;
            return probe.style.clipPath; };
          const at = f.map(canon).indexOf(canon(el.style.clipPath));
          frames = ' · reveal, ' + f.length + ' frames';
          // The frame it is showing is a line of its own rather than part of
          // the marker, so that the marker itself is the same string at every
          // beat: a line whose text changes each beat is a new line to the
          // merge, and the picture's second place would sort above its first.
          if (at > 0) moved = 'the picture moves to frame ' + (at + 1) + ' of ' + f.length;
        }
      } catch (e) { /* not a reveal */ }
      put('[', 'backdrop · ' + slots(el, 'bd-') + (ref ? ' · ' + ref : '') + frames);
      if (moved) put('[', moved);
      return;
    }
    if (cl.contains('exp-body')) {
      const label = el.querySelector('.tag-label');
      put('[', 'expansion "' + (label ? norm(label.textContent) : '') + '" · '
        + words(textOf(el)) + ' words, one key press away');
      return;
    }
    if (cl.contains('script-only')) { withheld(textOf(el), '::: script'); return; }
    if (cl.contains('chunk-heading') || cl.contains('section-heading')) {
      const main = el.querySelector('.hd-main');
      const sub = el.querySelector('.hd-sub');
      const headText = main ? textOf(main) : textOf(el);
      // `h` is defined as the heading *as the slide carries it*, so a heading
      // the slide does not carry - {.bare}, or style: {headings: off} - must
      // not wear that mark. It goes to the withheld class it belongs to,
      // where a reviewer scanning for what the room got will not count it in.
      if (seen(el)) {
        put('h', headText);
        if (sub) put('s', textOf(sub));
      } else {
        withheld(headText, 'heading, in the document and off the slide');
        if (sub) withheld(textOf(sub), 'sub-heading, off the slide');
      }
      return;
    }

    if (!seen(el)) {
      // A `::: slide` block does not abridge its neighbours, it hides them
      // outright, so without this nothing at all would be said about them -
      // and "the room read a four-item list" is half a fact when three
      // paragraphs beside it never arrived. Reported at the highest hidden
      // element, which is where the walk stops, so nothing is said twice.
      const seg = el.closest('.reveal-segment');
      if (seg && seg !== el && seen(seg) && seg.querySelector('.slide-explicit')
        && !el.closest('.slide-explicit')) {
        withheld(textOf(el), 'not in the ::: slide block');
      }
      return;
    }

    if (tag === 'P') {
      // A figure or a clip on a line of its own arrives inside a paragraph,
      // and `splitSentencesIn` wraps that paragraph like any other. Read as
      // prose it would come out as a drawing's labels run together into a
      // sentence nobody wrote, so a paragraph that is only art is walked as
      // structure. One with words around the picture stays prose.
      const art = el.querySelector('figure, svg.psi-diagram, video, iframe');
      if (art) {
        const rest = el.cloneNode(true);
        for (const a of rest.querySelectorAll('figure, svg.psi-diagram, video, iframe')) a.remove();
        if (!norm(rest.textContent)) { for (const k of [...el.children]) walk(k, ctx); return; }
      }
      para(el);
      return;
    }
    if (tag === 'PRE') {
      const src = el.textContent.replace(/\n+$/, '').split('\n');
      put('[', 'code · ' + src.length + (src.length === 1 ? ' line' : ' lines'));
      for (const l of src) put('|', l);
      return;
    }
    if (tag === 'TABLE') {
      const rows = [...el.querySelectorAll('tr')];
      const cols = rows.length ? rows[0].children.length : 0;
      put('[', 'table · ' + rows.length + ' × ' + cols);
      for (const r of rows) put('|', [...r.children].map(textOf).join(' | '));
      return;
    }
    if (tag === 'UL' || tag === 'OL') { list(el, ctx.inCards); return; }
    if (tag === 'FIGURE') { figure(el); return; }
    if (tag === 'IMG') { put('[', 'image' + (el.alt ? ' "' + norm(el.alt) + '"' : '')); return; }
    if (tag === 'svg') { figure(el.parentElement || el); return; }
    if (cl.contains('math-display')) {
      const tex = el.querySelector('annotation[encoding="application/x-tex"]');
      put('[', 'formula');
      put('|', tex ? norm(tex.textContent) : textOf(el));
      return;
    }

    let opened = true;
    if (cl.contains('cards')) {
      const n = [...el.querySelectorAll('li')].length;
      put('[', (cl.contains('rows') ? 'rows · ' : 'cards · ') + n + ' · ' + slots(el, 'cs-'));
      ctx = Object.assign({}, ctx, { inCards: true });
    } else if (cl.contains('overlay-card')) {
      put('[', 'overlay · ' + slots(el, 'ov-').replace(/ · w-[a-z]+/, ''));
    } else if (cl.contains('margin-note')) {
      put('[', 'footnote "' + norm(el.dataset.label || '') + '"');
    } else if (cl.contains('marginalia')) {
      put('[', 'marginalia');
    } else if (cl.contains('slide-explicit')) {
      put('[', '::: slide – the author named this block as the screen');
    } else if (cl.contains('cols')) {
      put('[', 'cols · ' + (slots(el, 'cols-') || '?'));
    } else if (cl.contains('side-a') || cl.contains('side-b')) {
      // The ratio is the thing `::: side 2:1` is *about*, and it was the one
      // fact about the construct this file did not carry. It lives on the
      // wrapper as two custom properties rather than in a class, so it is read
      // from there; an equal pair writes no style at all and is reported as
      // the 1:1 the room actually sees, because this file says what is
      // painted and not what was typed. The anchor rides along for the same
      // reason it is a class - `top` is the default and emits none.
      const box = el.parentElement;
      const cs = box ? getComputedStyle(box) : null;
      const fr = (k) => (cs ? cs.getPropertyValue(k).trim() : '').replace(/fr$/, '');
      const a = fr('--side-a'), b = fr('--side-b');
      const anchor = box ? slots(box, 'sv-') : '';
      put('[', 'side ' + (a && b ? a + ':' + b : '1:1') + (anchor ? ' · ' + anchor : '')
        + ' · ' + (cl.contains('side-a') ? 'first' : 'second') + ' pane');
    } else if (cl.contains('cover-art')) {
      put('[', 'cover art');
    } else opened = false;

    const kids = [...el.children];
    if (!kids.length) { put('.', textOf(el)); return; }
    if (opened) depth++;
    for (const k of kids) walk(k, ctx);
    if (opened) depth--;
  };

  for (const k of [...art.children]) walk(k, {});

  const col = art.closest('.column');
  // The signature says whether this state differs from the last one. The DOM
  // is enough here where a screenshot is needed in --check-fit, because every
  // change this file reports on is in it: a diagram step is a number on the
  // runtime object, a backdrop frame is a clip-path, and everything else
  // changes a line.
  const steps = [...art.querySelectorAll('svg.psi-diagram')]
    .map(s => (s.psiDiagram ? s.psiDiagram.step : 0)).join(',');
  const clips = [...art.querySelectorAll('.chunk-backdrop')]
    .map(b => b.style.clipPath || '').join(',');
  return {
    id: art.dataset.chunkId || art.id || '?',
    tag: art.dataset.tag || '',
    width: art.dataset.width || '',
    num: art.dataset.chunkNum || '',
    cover: art.dataset.cover || '',
    section: art.dataset.section || '',
    bare: art.hasAttribute('data-bare'),
    center: art.hasAttribute('data-center'),
    col: col ? Number(col.dataset.col) : -1,
    lines,
    sig: [art.dataset.chunkId, steps, clips, lines.length,
      lines.map(l => l.mark).join('')].join('|'),
  };
}

// The deck's own opening settings, and the column headings, read once.
function squintMeta() {
  const cols = [...document.querySelectorAll('.column')].map(c => {
    const h = c.querySelector('.chunk-section .section-heading');
    const li = c.querySelector('.chunk-section .section-outline li[aria-current] .so-text');
    return { col: Number(c.dataset.col), heading: h ? h.textContent : (li ? li.textContent : '') };
  });
  return {
    title: document.title || '',
    collapse: document.body.dataset.collapse || '',
    mode: document.body.dataset.mode || '',
    zoom: getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim(),
    chunks: document.querySelectorAll('.chunk').length,
    cols,
  };
}

// Merge one state's lines into the chunk's running list, recording the beat
// each line first appeared on. Content mostly accumulates, so this is an
// ordered merge rather than a diff: a line already present keeps its beat and
// its place, a new one is inserted where it was found.
function squintMerge(chunk, state, beat) {
  const counts = new Map();
  let at = 0;
  for (const l of state.lines) {
    const base = l.mark + ' ' + (l.depth || 0) + ' ' + l.text + ' ' + (l.words || '');
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    const key = base + ' #' + n;
    const idx = chunk.lines.findIndex((m, i) => i >= at && m.key === key);
    if (idx >= 0) { at = idx + 1; continue; }
    chunk.lines.splice(at, 0, Object.assign({}, l, { key, beat }));
    at++;
  }
}

const SQUINT_LEGEND = [
  '  h   the heading, when the slide carries it     s   its sub-heading',
  '  .   a sentence the room reads',
  '  -   a promoted bold, which the collapse renders as its own bullet',
  '  •   a list item                                ▸   the live one in a running agenda',
  '  |   code, a table row, a formula',
  '  [   a block or a construct that is on the slide whole',
  '  ~   prose the collapse withholds, with the number of words it holds',
  ' +N   first painted at beat N; a slide opens at beat 0',
];

// A slide with something under its heading. `~` does not count: withheld
// prose is the room getting nothing, which is the case being looked for.
function squintPaintsBody(c) {
  return c.lines.some(l => l.mark !== 'h' && l.mark !== 's' && l.mark !== '~');
}

function formatSquint(doc) {
  const out = [];
  const w = (...s) => out.push(...s);
  w('squint · ' + doc.title);
  w('');
  w('source    ' + doc.source);
  w('read from ' + doc.view + ' at ' + doc.viewport
    + ', collapse "' + (doc.meta.collapse || '?') + '", theme "' + (doc.meta.mode || '?') + '"');
  w('walked    ' + doc.chunks.length + ' slides, ' + doc.states + ' states, '
    + doc.meta.cols.length + ' columns'
    + (doc.notes ? '' : ' · no speaker.html beside the source, so no note counts'));
  w('');
  w('Everything below was read out of the rendered projection, not out of');
  w('source.md: the collapse is CSS and JS, and this file is here so that a');
  w('review argues about what the room got rather than about what was typed.');
  w('');
  w(...SQUINT_LEGEND);
  w('');
  w('A slide opens with its id, its type and its width, then whatever else is');
  w('true of it: the cover or divider composition, .bare or .center, how many');
  w('beats it has, how long its speaker note is. Notes are counted and never');
  w('quoted - they are the one thing certainly not on the projection, and');
  w('print-notes.html is the file for reading them.');
  w('');
  w('It cannot see colour, contrast, overlap, or anything below the fold -');
  w('a slide can be in this file in full and unreadable on the wall. Use');
  w('--check-fit for the frame, and your eyes for the rest.');

  let col = null;
  for (const c of doc.chunks) {
    if (c.col !== col) {
      col = c.col;
      const meta = doc.meta.cols.find(x => x.col === col);
      const head = meta && meta.heading ? meta.heading : '(no heading)';
      w('');
      w('');
      w('════ column ' + col + ' · ' + head);
    }
    const flags = [c.tag || 'free', c.width || '',
      c.cover ? 'cover=' + c.cover : '', c.section ? 'divider=' + c.section : '',
      c.bare ? '.bare' : '', c.center ? '.center' : '',
      c.beats > 1 ? c.beats + ' beats' : '',
      c.noteWords ? 'note ' + c.noteWords + ' words' : ''].filter(Boolean);
    w('');
    w('──── #' + c.id + ' · ' + flags.join(' · '));
    for (const l of c.lines) {
      const beat = l.beat ? '+' + l.beat : '';
      const tail = l.words ? '  (' + l.words + ' words withheld'
        + (l.why ? ' · ' + l.why : '') + ')' : '';
      w(beat.padStart(3) + ' ' + l.mark + ' ' + '  '.repeat(l.depth || 0) + l.text + tail);
    }
  }

  // A divider is a heading on purpose, so it is not one of these. Every
  // other slide that paints nothing under its heading is a slide that
  // announced something and withheld it, which is the whole reason this
  // file exists.
  const mute = doc.chunks.filter(c => c.tag !== 'section' && !squintPaintsBody(c));
  const hiddenWords = doc.chunks.reduce((n, c) =>
    n + c.lines.reduce((m, l) => m + (l.words || 0), 0), 0);
  w('');
  w('');
  w('════ what the walk added up to');
  w('');
  w('  ' + doc.chunks.length + ' slides, ' + doc.states + ' states, '
    + hiddenWords + ' words withheld by the collapse.');
  if (mute.length) {
    w('  ' + mute.length + ' slide(s) paint a heading and nothing else: '
      + mute.map(c => '#' + c.id).join(', ') + '.');
    w('  Section dividers are not counted; they are a heading on purpose.');
  } else {
    w('  Every slide but the dividers paints something under its heading.');
  }
  return out.join('\n') + '\n';
}

async function runSquint(absIn, viewport, outArg) {
  const probe = await openAudienceProbe(absIn, '--squint', viewport);
  if (!probe.page) return probe.code;
  const { browser, page } = probe;

  const meta = await page.evaluate(squintMeta);
  const chunks = [];
  const byId = new Map();
  let states = 0, lastSig = null, same = 0, lastId = null, onSame = 0;
  for (let i = 0; i < 2000; i++) {
    const st = await page.evaluate(squintScan);
    if (!st) break;
    // An autoplay-cycle diagram changes its own step on a timer, so its
    // signature never settles and the two-identical-states rule never fires.
    // Every other slide walks off it on the next key press; the last slide in
    // a deck has nowhere to walk to, and would press the key two thousand
    // times. No chunk in the corpus has more than five beats.
    onSame = st.id === lastId ? onSame + 1 : 0;
    lastId = st.id;
    if (onSame > 40) break;
    if (st.sig === lastSig) { if (++same >= 2) break; } else {
      same = 0;
      states++;
      let c = byId.get(st.id);
      if (!c) {
        c = Object.assign({}, st, { lines: [], beats: 0 });
        byId.set(st.id, c);
        chunks.push(c);
      } else c.beats++;
      squintMerge(c, st, c.beats);
    }
    lastSig = st.sig;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
  }
  for (const c of chunks) c.beats += 1;

  // Speaker notes are not on the projection and not in audience.html, and
  // this file is about the projection - so what it carries is that a prompt
  // exists and how long it is, never its text. A slide that withholds its
  // substance is a different matter when the lecturer has 60 words of notes
  // for it, and a different matter again when nobody has anything to say.
  // The text itself is one keystroke away in the cockpit and printed in
  // print-notes.html, which is the file for reading it.
  const speaker = path.join(path.dirname(absIn), 'speaker.html');
  let notes = null;
  if (fs.existsSync(speaker)) {
    await page.goto(pathToFileURL(speaker).href, { waitUntil: 'domcontentloaded' });
    notes = await page.evaluate(() => {
      const o = {};
      for (const t of document.querySelectorAll('template[data-notes-for]')) {
        o[t.dataset.notesFor] = (t.content ? t.content.textContent : t.textContent) || '';
      }
      return o;
    });
    for (const c of chunks) {
      const raw = notes[c.id];
      c.noteWords = raw ? (raw.match(/\S+/g) || []).length : 0;
    }
  }
  await browser.close();

  const doc = {
    // The audience view's <title> is the lecture's name plus " – lecture",
    // which is right in a browser tab and reads as a typo at the head of a
    // file that says what it is on the next line.
    title: (meta.title || '').replace(/\s+–\s+lecture$/, '')
      || path.basename(path.dirname(absIn)),
    source: path.relative(process.cwd(), absIn) || absIn,
    view: 'audience.html',
    viewport: viewport.width + '×' + viewport.height,
    meta, chunks, states, notes: !!notes,
  };
  const text = formatSquint(doc);
  if (outArg === '-') {
    process.stdout.write(text);
    return 0;
  }
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(path.dirname(absIn), 'squint.txt');
  fs.writeFileSync(outPath, text);
  const bodyless = chunks.filter(c => c.tag !== 'section' && !squintPaintsBody(c)).length;
  console.log('[squint] ' + chunks.length + ' slide(s) over ' + states + ' state(s) at '
    + doc.viewport + ' → ' + (path.relative(process.cwd(), outPath) || outPath)
    + (bodyless ? '; ' + bodyless + ' paint a heading and nothing else.' : '.'));
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter((a, i) =>
    !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));

  if (flags.has('--new')) {
    const intoIdx = argv.indexOf('--into');
    if (intoIdx >= 0 && !argv[intoIdx + 1]) {
      console.error('--into takes a directory: node build.js --new <slug> --into <dir>');
      process.exit(1);
    }
    runNew(positional[0], intoIdx >= 0 ? argv[intoIdx + 1] : null);
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
    console.error('                            [--no-optimize-images]');
    console.error('  node build.js <source.md> --check-fit [--viewport 1600x900]');
    console.error('  node build.js <source.md> --squint [--squint-out PATH] [--viewport 1600x900]');
    console.error('  node build.js <source.md> --integrate-annotations');
    console.error('  node build.js <source.md> --optimize-images [--dry-run] [--all] [--max-width N]');
    console.error('  node build.js --new <slug> [--into <dir>]');
    console.error('');
    console.error('Image inlining (default: auto – inline iff referenced images sum < 10 MB; per-image cap 2 MB):');
    console.error('  --inline-images       force inlining regardless of total size');
    console.error('  --no-inline-images    force external asset paths');
    console.error('  --no-optimize-images  inline PNG/JPEG as they are, rather than');
    console.error('                        re-encoding them to WebP for the output');
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
    console.error('Fit checking (needs playwright-core and a Chrome or Chromium):');
    console.error('  --check-fit           after building, walk audience.html state by state at');
    console.error('                        1600x900 and report any slide whose content leaves the');
    console.error('                        frame. Exit 2 if one does. The density budgets are word');
    console.error('                        counts, so cards and rows can overflow with a clean lint.');
    console.error('  --viewport WxH        measure at another size (default 1600x900, a 16:9 room).');
    console.error('');
    console.error('Reading the projection back (needs playwright-core and a Chrome or Chromium):');
    console.error('  --squint              after building, walk audience.html state by state and write');
    console.error('                        what a room would see – heading, topic sentences, promoted');
    console.error('                        bolds, what stays whole, what the collapse withholds – to');
    console.error('                        squint.txt beside the source. Never fails a build.');
    console.error('  --squint-out PATH     write it somewhere else; "-" writes to stdout.');
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
  // Transcoding into the output is on by default because it costs the author
  // nothing: no file changes, and no encoder simply means the original bytes.
  // The switch is for a build that must be byte-comparable against one made
  // on a machine with a different encoder version.
  if (flags.has('--no-optimize-images')) noOptimizeImages = true;
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
  reportWebpInline();
  console.log(`Wrote ${written.join(', ')} (${shape})`);
  // After the build, because it measures what the build just wrote. Its
  // exit code is the command's: a slide that does not fit is a defect the
  // author has to see, and a clean lint will not report it.
  if (flags.has('--check-fit')) {
    const code = await runCheckFit(absIn, readViewportFlag(argv));
    if (code) process.exitCode = code;
  }
  // After --check-fit, and never instead of it: one says whether the slide is
  // inside the frame, the other says what it says. Its exit code is not the
  // command's - a description of the projection is not a verdict on it.
  if (flags.has('--squint')) {
    const outIdx = argv.indexOf('--squint-out');
    if (outIdx >= 0 && !argv[outIdx + 1]) {
      console.error('--squint-out takes a path, or "-" for stdout.');
      process.exit(1);
    }
    const code = await runSquint(absIn, readViewportFlag(argv),
      outIdx >= 0 ? argv[outIdx + 1] : null);
    if (code) process.exitCode = code;
  }
  if (flags.has('--serve')) await runServe(path.dirname(absIn), servePort);
}

main().catch(err => {
  // userFacing errors carry instructions for the author; anything else is a
  // defect in the build and deserves its stack.
  console.error(err && err.userFacing ? err.message : err);
  process.exit(1);
});
