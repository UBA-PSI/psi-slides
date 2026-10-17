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
import { execFile, execFileSync, spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
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
import { createDiagramCompiler, parseDiagramDefaults, dgShapeD, dgSplineD, dgPathD, dgFullFrames, DG_SHAPE_CLASSES, dgBarFillCss, DG_SOFT_GROUND, DG_FONT, DG_UNIT } from './diagram-core.mjs';
// The PDF export's option checks, so --slides-pdf refuses a bad value before a
// browser starts and in the words the desktop app uses too. Zero imports; the
// export itself (pdf-export.mjs, which needs playwright-core) stays a dynamic
// import behind the flag.
import { resolvePdfOptions } from './pdf-core.mjs';
// Which files on this machine a lecture may reach - the build's reads,
// --serve's answers, and the pages the PDF exports and the probes open from
// disk. Its own file because the desktop app's export applies it too.
import {
  pathWithin, realpathLoose, assetRootOf, assetRootNarrowed, assetRootExposed, EXPOSED_FOLDERS,
  assetKindOf, assetEscape, SERVE_MIME, servePathAllowed, fileUrlAllowed,
} from './local-files.mjs';
// The {…} tail grammar and the ::: draw opener, shared with lint.js so the
// two files cannot disagree about a tail. Tables plus small pure helpers,
// zero dependencies - see the header of tails.mjs and CLAUDE.md.
import {
  CHUNK_SLOTS, CHUNK_STYLE_CLASSES, COLUMN_SLOTS, FIGURE_TYPE_STEPS,
  CARDS_SLOTS, OVERLAY_SLOTS, BACKDROP_SLOTS, SIDE_SLOTS, DOCK_SLOTS,
  splitTail, parseTail, slotTable, strayTailProblem,
  parseDrawOpener, formatDrawOpener, drawCompilerAttrs, parseRevealMark,
  fenceTracker, htmlCommentOpens, headingIdOf, HEADING_ID_TAIL_RE, RESERVED_ID_PREFIX,
} from './tails.mjs';
// The live views' commands: which key means what, and the ? panel's rows.
// Imported here to render the panel; its text is also spliced into both
// live views as window.PSI_COMMANDS, where the key map dispatches from it -
// see the header of commands.mjs.
import { helpGroups, COMMANDS, START_MENU, keyText } from './commands.mjs';
// Comments out of the runtime and the stylesheets on their way into a view;
// they stay in the source, where they are the documentation. A tokenizer,
// zero dependencies - see the header of strip-comments.mjs.
import { stripJs, stripCss } from './strip-comments.mjs';

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
  'title', 'closing', 'outline', 'principle', 'statement', 'definition',
  'example', 'question', 'figure', 'exercise', 'free',
]);

// The width and class vocabulary of a chunk heading's {…} tail is
// CHUNK_SLOTS in tails.mjs, next to the slot tables of the five directives
// that take one. `.bare` exists because a heading is two things at once -
// the slide's title and the chunk's name in the TOC, in search and in print
// - and leaving the text out gives up all four where `.bare` gives up one.
// `.center` and `.middle` are the two axes of the same question - where the
// slide's words sit across the measure, and where what this beat paints sits
// in the frame - and the second is read by focusCamera rather than by a
// stylesheet rule. The `.wrap-*` / `.blocks-*` classes answer a `style:` key
// for one chunk.

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
// dark one as a `--shiki-dark` custom property the dark rule in runtime/audience.css
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

// ── a source.md someone sent you ─────────────────────────────────────
//
// Building a deck is something people do with a folder they were sent: a
// colleague's lecture, a student's talk, a template off the internet. Three
// things in this section keep that from being more than reading it.
//
//  - The frontmatter is YAML and nothing else. gray-matter picks its parser
//    from whatever follows the opening `---` on the same line, and two of the
//    parsers it ships are programs: `---js` is handed to eval and `---coffee`
//    to CoffeeScript, so a deck opening with `---js` ran code on the machine
//    that built it. Refused twice - by reading the line before gray-matter
//    does, and by handing gray-matter engines for those languages that throw
//    - because the first is a regex over someone else's parser's rules and
//    the second holds even if the two ever read the line differently.
//  - An asset is read only from the lecture's folder or the folder one level
//    up, after symbolic links are resolved. `../../../` and a link in assets/
//    pointing at a key file both used to be read and inlined as a data: URI
//    into a page the author then sends on. One level up, and not the
//    lecture's folder alone, because a set of lectures sharing a picture
//    folder beside them (`../shared/assets/x.png`) is a layout people use.
//  - An output never follows a link. A folder that arrives with
//    `print.html -> ~/.zshrc` in it had the build overwrite the shell profile
//    with a handout. Every whole file the build writes goes to a fresh
//    temporary name beside it and is renamed over the target, which replaces
//    a link rather than writing through it; the one file appended to (the
//    prompter's log) is opened with O_NOFOLLOW, and a folder the build writes
//    into (videos/, frames/) is refused when it is a link.

// Everything gray-matter could be told after `---` that parses data rather
// than running it. An empty name is the ordinary `---` line.
const FRONTMATTER_LANGUAGES = new Set(['', 'yaml', 'yml']);

// What gray-matter will read as the frontmatter's language: the rest of the
// opening line, trimmed. Mirrors matter.language(), and the two cases in
// which there is no frontmatter at all - no `---` at the head, or `----`,
// which gray-matter reads as a rule rather than a delimiter.
function frontmatterLanguage(src) {
  const s = String(src).replace(/^﻿/, '');
  if (!s.startsWith('---') || s.charAt(3) === '-') return '';
  const nl = s.search(/\r?\n/);
  return (nl < 0 ? s.slice(3) : s.slice(3, nl)).trim();
}

function frontmatterLanguageError(lang) {
  const err = new Error(
    `The frontmatter opens with "---${lang}". psi-slides reads frontmatter as YAML only:\n` +
    'a "---js" or "---coffee" block is run as a program on the machine that builds the\n' +
    'deck, so every language other than YAML is refused.\n' +
    '  Fix: write the opening line as a bare "---" and the block as YAML.');
  err.userFacing = true;
  return err;
}

const refusedFrontmatterEngine = (lang) => ({
  parse() { throw frontmatterLanguageError(lang); },
  stringify() { throw frontmatterLanguageError(lang); },
});

// The only way this file calls gray-matter. Options are always passed, which
// also keeps the result out of gray-matter's module-level cache.
function safeMatter(src) {
  const lang = frontmatterLanguage(src);
  if (!FRONTMATTER_LANGUAGES.has(lang.toLowerCase())) throw frontmatterLanguageError(lang);
  try {
    return matter(src, {
      engines: {
        javascript: refusedFrontmatterEngine('js'),
        coffee: refusedFrontmatterEngine('coffee'),
      },
    });
  } catch (e) {
    // A block that is not valid YAML - `title: Security: an intro`, a key
    // written twice - used to escape as a YAMLException with a stack trace
    // and no word about which line. The parser's buffer starts with the
    // newline after the opening ---, so its 0-based line is the file's
    // 1-based one. lint.js reports the two common cases as bad-frontmatter.
    if (!e || e.name !== 'YAMLException') throw e;
    const line = e.mark && Number.isInteger(e.mark.line) ? e.mark.line + 1 : null;
    const err = new Error(
      `Frontmatter: the YAML${line ? ` on line ${line}` : ''} does not parse: ${e.reason || e.message}.\n` +
      '  A value with ": " or a leading special character in it needs quotes\n' +
      '  (title: "Security: an intro"), and each key may be written once.');
    err.userFacing = true;
    throw err;
  }
}

// The rule itself - the asset root, the dot-folders, a link's kind, and
// what a page opened from disk may load - is local-files.mjs, imported at the
// top of this file: the desktop app's PDF export has to refuse the same
// files in its own main process, and cannot import this file to do it.

// Files the current build was asked to read and did not, keyed by where they
// really are. Filled by assetAllowed at every reader, refused before any view
// is written (assertAssetsConfined), cleared per build.
const OUTSIDE_ASSETS = new Map();   // real path -> the path as this build met it

function assetAllowed(abs) {
  if (!currentSourceDir || !abs) return true;
  const out = assetEscape(abs, currentSourceDir);
  if (out === null) return true;
  if (!OUTSIDE_ASSETS.has(out)) OUTSIDE_ASSETS.set(out, path.relative(currentSourceDir, abs));
  return false;
}

function assetsConfinedError(outside, sourceDir) {
  const root = assetRootOf(sourceDir);
  const narrowed = assetRootNarrowed(realpathLoose(sourceDir));
  const exposed = assetRootExposed(realpathLoose(sourceDir));
  const lines = [
    `This lecture refers to ${outside.size} file(s) the build may not read:`,
    '',
  ];
  for (const [real, shown] of outside) {
    const rel = path.relative(root, real);
    const where = !pathWithin(root, real) ? ''
      : (rel && rel.split(path.sep).some(c => c.startsWith('.')))
        ? '  (in a folder whose name starts with a dot)'
        : (exposed && !EXPOSED_FOLDERS.includes(rel.split(path.sep)[0]))
          ? '  (not in assets/ or fonts/)'
          : '  (a link to a file that is not a picture, a clip or a font)';
    lines.push((shown && path.resolve(sourceDir, shown) !== real ? `  ${shown}  ->  ${real}` : `  ${real}`) + where);
  }
  lines.push('');
  if (exposed) {
    lines.push(`The lecture's folder, ${root}, is your home folder or the top of a disk, so a build`);
    lines.push('reads from its assets/ and fonts/ folders alone – the rest of it is everything you own.');
  } else if (narrowed) {
    lines.push(`A build reads assets from the lecture's folder and from the folder one level up –`);
    lines.push(`except where that folder is your home folder or the top of a disk, as it is here,`);
    lines.push(`and then from the lecture's folder alone: ${root}.`);
  } else {
    lines.push(`A build reads assets from the lecture's folder and from the folder one level up –`);
    lines.push(`here ${root} – and from nowhere further out.`);
  }
  lines.push('Nothing is read from a folder whose name starts with a dot (.ssh, .git, .config …),');
  lines.push('even inside that. A symbolic link counts as the file it points to, and is read only');
  lines.push('when that file is the same kind as the link\'s name says – a picture, a clip or a font.');
  lines.push('This is what keeps a deck you were sent from copying a file from elsewhere on your');
  lines.push('machine into its output.');
  if (exposed) {
    lines.push('  Fix: move the lecture into a folder of its own; or copy the file into assets/ and');
    lines.push('  point the reference at the copy.');
  } else {
    lines.push(`  Fix: copy the file into ${root} or below it (not into a dot-folder), and point the`);
    lines.push('  reference at the copy.');
  }
  const err = new Error(lines.join('\n'));
  err.userFacing = true;
  return err;
}

// A lecture whose folder is the home folder or the top of a disk reads from
// its assets/ and fonts/ alone, which is a rule an author meets as a refusal
// of a picture they can see beside source.md. Said once per run, before
// anything is refused, so the refusal is not the first word on it.
let exposedWarned = false;
function warnExposedOnce(sourceDir) {
  if (exposedWarned || !assetRootExposed(realpathLoose(sourceDir))) return;
  exposedWarned = true;
  console.warn(`[assets] ${realpathLoose(sourceDir)} is your home folder or the top of a disk, so this build`
    + ' reads pictures, clips and faces from its assets/ and fonts/ folders only. Move the lecture'
    + ' into a folder of its own to lift that.');
}

function assertAssetsConfined(sourceDir) {
  if (OUTSIDE_ASSETS.size) throw assetsConfinedError(OUTSIDE_ASSETS, sourceDir);
}

// Write a whole output file without following a link at its path: the bytes
// go to a new name beside it (O_EXCL, so not through a link either) and are
// renamed over the target, which replaces a link rather than its target.
// `mode` is for a file that should be the author's alone (the prompter's
// prompt); the default leaves it to the umask, as before.
function writeOutputFile(p, data, mode = 0o666) {
  const tmp = path.join(path.dirname(p),
    `.${path.basename(p)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, data, { flag: 'wx', mode });
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never written */ }
    throw e;
  }
}

// Append to a file, refusing (ELOOP) when the path is a link. Windows has no
// O_NOFOLLOW, and there the flag is simply absent.
function appendOutputFile(p, data, mode = 0o666) {
  const c = fs.constants;
  const fd = fs.openSync(p, c.O_WRONLY | c.O_APPEND | c.O_CREAT | (c.O_NOFOLLOW || 0), mode);
  try { fs.writeSync(fd, data); } finally { fs.closeSync(fd); }
}

// source.md itself, rewritten by --integrate-annotations, --optimize-images
// and the editor's patch: the same rule as an output, because a sent folder
// can carry a source.md that links to the reader's shell profile. Its mode is
// kept; a link is replaced by a file, and the build says so, since an author
// who linked source.md on purpose would otherwise find the edit missing from
// the file the link pointed to.
function rewriteSourceFile(p, text) {
  let st = null;
  try { st = fs.lstatSync(p); } catch { /* not there */ }
  const wasLink = !!(st && st.isSymbolicLink());
  writeOutputFile(p, text, st && !wasLink ? (st.mode & 0o777) : 0o666);
  if (wasLink) {
    console.log(`${path.basename(p)} was a symbolic link. The change is written to a file in its place,`
      + ' and the file the link pointed to is unchanged.');
  }
}

// A folder the build writes into, created when missing and refused when it is
// a link - a rename inside a linked folder still lands wherever it points.
function outputDir(dir) {
  let st = null;
  try { st = fs.lstatSync(dir); } catch { /* not there yet */ }
  if (st && st.isSymbolicLink()) {
    const err = new Error(
      `${dir} is a symbolic link, and the build writes files into it.\n` +
      'It does not write through a link, which could put them anywhere on this machine.\n' +
      '  Fix: remove the link (the build creates the folder itself), or name a real folder.');
    err.userFacing = true;
    throw err;
  }
  if (!st) fs.mkdirSync(dir, { recursive: true });
  return dir;
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
// Whether this build wraps address-shaped tokens so the hyphenation
// dictionary cannot reach them. Only true under `style: {hyphenate: all}`,
// so a deck that does not ask for hyphens on the projection emits the same
// bytes it always did. See markAddresses.
let addressSpansOn = false;
const imgResolveCache = new Map();
const dataUriCache = new Map();
// Per-build counter for unique SVG ID prefixes. Reset in buildOnce so the
// first inlined SVG of a build is always psiINT-fig-1-.
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
  noteImageOutcome(absPath, { orig: size, note: isVideoExt(absPath)
    ? 'not inlined, over the cap – staged into videos/'
    : 'NOT inlined, over the cap – external path' });
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
// absPath -> { hash, out, outcome, noted }. Keyed on the bytes as well as the
// path, and kept across --watch rebuilds on purpose, so an unchanged picture
// is encoded once a session. A path alone kept the old pixels of a picture
// replaced under the same name - by hand, or by the editor's upload with
// `replace` - for as long as the watch ran. `outcome` is what the summary
// says about it, entered when the render first uses it (`noted`), so a
// picture the pre-pass encoded is reported in the order the deck uses it,
// as one encoded during the render always was.
const webpInlineCache = new Map();
let webpInlineCount = 0, webpInlineSaved = 0;

// What became of each raster on its way into the HTML, so the summary can say
// it per asset. The old summary was one line – “6 PNG/JPEG re-encoded to WebP”
// – and it printed unchanged on a build where a seventh image was over the cap
// and stayed an external path: a success line standing over the one outcome
// the report exists to make visible. Keyed by absolute path, so an asset drawn
// on four slides is one row.
const imageOutcomes = new Map();   // absPath -> { orig, out, note }
function noteImageOutcome(absPath, entry) {
  imageOutcomes.set(absPath, { ...(imageOutcomes.get(absPath) || {}), ...entry });
}

function webpInlineBytes(absPath, buf) {
  if (noOptimizeImages) return null;
  const ext = path.extname(absPath).slice(1).toLowerCase();
  if (!WEBP_INLINE_EXTS.has(ext)) return null;
  const key = path.resolve(absPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  let entry = webpInlineCache.get(key);
  if (!entry || entry.hash !== hash) {
    if (webpEncoder === undefined) webpEncoder = detectWebpEncoder();
    if (!webpEncoder) {
      if (!webpNoticeShown) {
        webpNoticeShown = true;
        console.log('[images] no cwebp or magick on PATH, so PNG and JPEG go in as they are.'
          + ' Install one (brew install webp) and they shrink to roughly a sixth.');
      }
      entry = { hash, out: null, outcome: { orig: buf.length, note: 'original bytes (no encoder)' } };
    } else {
      let webp = readWebpCache(hash);
      let failed = false;
      if (!webp) {
        const tmp = path.join(os.tmpdir(), 'psi-webp-' + crypto.randomBytes(6).toString('hex') + '.webp');
        try {
          webpEncoder.encode(absPath, tmp, null);
          webp = fs.readFileSync(tmp);
          writeWebpCache(hash, webp);
        } catch (e) {
          failed = true;
        } finally {
          try { fs.unlinkSync(tmp); } catch (e) { /* never existed */ }
        }
      }
      entry = webpEntry(hash, buf.length, failed ? null : webp);
    }
    webpInlineCache.set(key, entry);
  }
  if (!entry.noted) {
    entry.noted = true;
    noteImageOutcome(key, entry.outcome);
    if (entry.out) { webpInlineCount++; webpInlineSaved += entry.outcome.orig - entry.out.length; }
  }
  return entry.out;
}

// What one encode means for the output. Only a WebP that actually wins goes
// in: a small flat PNG - a diagram exported as a raster, a screenshot of a
// terminal - can come out larger as WebP, and shipping a bigger file to
// honour a default is not an optimisation.
function webpEntry(hash, origBytes, webp) {
  if (!webp) return { hash, out: null, outcome: { orig: origBytes, note: 'original bytes (encode failed)' } };
  if (webp.length >= origBytes) {
    return { hash, out: null, outcome: { orig: origBytes, out: webp.length, note: 'original bytes (WebP larger)' } };
  }
  return { hash, out: webp, outcome: { orig: origBytes, out: webp.length } };
}

// ── the inline encodes: on disk across runs, side by side in one ──────
//
// An encode at -m 6 -sharp_yuv takes 0.1-0.3 s a picture, and a cold build
// used to do them one after another - 1.8 s for a deck of fourteen photographs
// against 0.3 s for one without - and again on every run, because the cache
// above lives as long as the process. Two things take that away, and neither
// changes a byte of the output:
//
// - **A cache on disk**, in the user's cache folder (~/Library/Caches/
//   psi-slides/webp, $XDG_CACHE_HOME/psi-slides/webp or ~/.cache/…,
//   %LOCALAPPDATA%\psi-slides\Cache\webp), never in the lecture's folder.
//   An entry is named by a hash of the picture's bytes, the encoder, its
//   version and its arguments, so another cwebp, other settings or other
//   pixels are another entry and never a stale one. It is written the way an
//   output is (a fresh name, then a rename; a linked folder is not written
//   into), read without following a link, and checked to be a whole WebP
//   before it is used; anything wrong with it is an encode, never a failed
//   build. PSI_CACHE_DIR names another folder, and PSI_CACHE_DIR=off turns
//   it off. Nothing prunes it: an entry is the size of the picture in the
//   output, and the folder is the operating system's to clear.
// - **A pre-pass** (prewarmWebp) that encodes the pictures the build is going
//   to inline before the render asks for them, several at once - the render
//   is synchronous and meets them one by one. It reads exactly what the
//   inline scan reads, and does nothing when that scan says the pictures will
//   not be inlined, so it encodes nothing the render would not have.
let webpCacheDirMemo;              // undefined = not resolved, null = off
let webpCacheNoticeShown = false;
function webpCacheDir() {
  if (webpCacheDirMemo !== undefined) return webpCacheDirMemo;
  const env = process.env.PSI_CACHE_DIR;
  let base;
  if (env === 'off') base = null;
  else if (env) base = path.resolve(env);
  else if (process.platform === 'darwin') base = path.join(os.homedir(), 'Library', 'Caches', 'psi-slides');
  else if (process.platform === 'win32') base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'psi-slides', 'Cache');
  else base = path.join(process.env.XDG_CACHE_HOME && path.isAbsolute(process.env.XDG_CACHE_HOME)
    ? process.env.XDG_CACHE_HOME : path.join(os.homedir(), '.cache'), 'psi-slides');
  webpCacheDirMemo = base ? path.join(base, 'webp') : null;
  return webpCacheDirMemo;
}
// The cache is off for a run whose lecture would hold it: a cache inside the
// author's folder is a cache in their repository.
function webpCacheUsable() {
  const dir = webpCacheDir();
  return !!dir && !(currentSourceDir && pathWithin(path.resolve(currentSourceDir), dir));
}
function webpCacheKey(hash) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([webpEncoder.name, webpEncoder.version, webpEncoder.argv('<in>', '<out>', null), hash]))
    .digest('hex');
}
// RIFF, a length that is the file's, WEBP: a whole file, not half of one.
const isWholeWebp = (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF'
  && b.toString('latin1', 8, 12) === 'WEBP' && b.readUInt32LE(4) + 8 === b.length;
function readWebpCache(hash) {
  if (!webpCacheUsable()) return null;
  const p = path.join(webpCacheDir(), webpCacheKey(hash) + '.webp');
  let fd;
  try {
    fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    if (!fs.fstatSync(fd).isFile()) return null;
    const buf = fs.readFileSync(fd);
    return isWholeWebp(buf) ? buf : null;
  } catch { return null; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ } }
}
function writeWebpCache(hash, webp) {
  if (!webpCacheUsable() || !isWholeWebp(webp)) return;
  const dir = webpCacheDir();
  try {
    let st = null;
    try { st = fs.lstatSync(dir); } catch { /* not there yet */ }
    if (st && !st.isDirectory()) throw new Error(`${dir} is not a folder (a link is not followed)`);
    if (!st) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeOutputFile(path.join(dir, webpCacheKey(hash) + '.webp'), webp, 0o600);
  } catch (e) {
    if (!webpCacheNoticeShown) {
      webpCacheNoticeShown = true;
      console.log(`[images] the WebP cache is not written this run: ${e.message}. The output is the same; the next build encodes again.`);
    }
  }
}

async function prewarmWebp(absIn, opts = {}) {
  if (noOptimizeImages || opts.inlineImages === false) return;
  const dir = path.dirname(absIn);
  let src;
  try { src = fs.readFileSync(absIn, 'utf8'); } catch { return; }
  // The scan resolves a shorthand against the lecture's folder, as the build
  // does; buildOnce sets and clears both again before it renders.
  currentSourceDir = dir;
  imgResolveCache.clear();
  const scan = scanReferencedImages(src, dir);
  if (opts.inlineImages === undefined && (scan.count === 0 || scan.total > AUTO_INLINE_BUDGET)) return;
  if (scan.oversized.some(o => !isVideoExt(o.abs))) return;   // the build refuses the deck
  const todo = [...new Set(scan.images.map(p => path.resolve(p)))]
    .filter(p => WEBP_INLINE_EXTS.has(path.extname(p).slice(1).toLowerCase()));
  if (!todo.length) return;
  if (webpEncoder === undefined) webpEncoder = detectWebpEncoder();
  if (!webpEncoder) return;
  const one = async (abs) => {
    let buf;
    try { buf = fs.readFileSync(abs); } catch { return; }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const had = webpInlineCache.get(abs);
    if (had && had.hash === hash) return;
    let webp = readWebpCache(hash);
    if (!webp) {
      const tmp = path.join(os.tmpdir(), 'psi-webp-' + crypto.randomBytes(6).toString('hex') + '.webp');
      try {
        await webpEncoder.encodeAsync(abs, tmp);
        webp = fs.readFileSync(tmp);
        writeWebpCache(hash, webp);
      } catch {
        return;   // left to the render, which tries once more and says so
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* never existed */ }
      }
    }
    webpInlineCache.set(abs, webpEntry(hash, buf.length, webp));
  };
  // cwebp is single-threaded, so as many at once as there are cores, and no
  // more than eight: each holds a decoded picture in memory.
  const width = Math.max(1, Math.min(8, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, todo.length) }, async () => {
    while (next < todo.length) await one(todo[next++]);
  }));
}

// Said once per build, after the inlining decision, because a reader wants the
// two numbers together: how much went in, and how much of it was saved – and
// then a line per asset, because the headline alone cannot say that one of
// them did not go in at all.
function reportWebpInline() {
  if (!imageOutcomes.size) return;
  // KB under a megabyte: two decimals of a megabyte is 0.03 for every small
  // asset, which is a column of the same number.
  const sz = (n) => (n < 1024 * 1024
    ? (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB'
    : (n / 1024 / 1024).toFixed(2) + ' MB').padStart(8);
  if (webpInlineCount) {
    console.log(`[images] ${webpInlineCount} PNG/JPEG re-encoded to WebP for the output, ${sz(webpInlineSaved).trim()} saved.`
      + ' The files on disk are untouched; --no-optimize-images turns this off.');
  }
  for (const [abs, o] of imageOutcomes) {
    const name = path.relative(process.cwd(), abs);
    const to = o.out == null ? ' '.repeat(11) : ` → ${sz(o.out)}`;
    console.log(`         ${name.padEnd(48)} ${sz(o.orig)}${to}  ${o.note || ''}`.trimEnd());
  }
}

function toDataUri(absPath) {
  if (!absPath) return null;
  if (dataUriCache.has(absPath)) return dataUriCache.get(absPath);
  if (!assetAllowed(absPath)) { dataUriCache.set(absPath, null); return null; }
  // Under the clip cap, and staged all the same: the auto decision found no
  // room for it in the deck's budget. Not an oversize, so no warning - the
  // decision line and the [video] summary say what happened.
  if (clipsOverBudget.has(path.resolve(absPath))) { dataUriCache.set(absPath, null); return null; }
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
    const webp = webpInlineBytes(absPath, buf);
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
  if (!assetAllowed(absPath)) return null;
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
  const prefix = `psiINT-fig-${inlineSvgCounter}-`;
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
  const fence = fenceTracker();
  for (const line of String(src).split('\n')) {
    // Fence-aware, like the block matchers in parseLecture and lintDiagram:
    // a ::: draw inside a code fence is a syntax example, and collecting
    // its image lines converted (and with --optimize-images deleted) files
    // the lecture never actually references. A diagram body is not
    // markdown, so a fence-looking line inside one is the diagram's own.
    if (!inDiagram && (fence.step(line) || fence.inside)) continue;
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

// The third way a source names a picture, after markdown and the diagram
// DSL: a `::: backdrop` (in a chunk or under a `#` divider heading) and the
// two frontmatter keys that name one. All three go into the output through
// the same data: URI as a figure does, so they meet the same per-image cap –
// and left out of a scan an oversized one fell through toDataUri to an
// external path with no complaint, which is the exact failure
// assertInlinable exists to stop.
//
// **One collector, two readers**, and that is the whole reason it is a
// function: scanReferencedImages below weighs these refs against the cap, and
// collectImageRefs hands them to --optimize-images. They used to be two regex
// sets in one file and only one of them had these forms, so a keynote whose
// only oversized assets were a backdrop and a cover-image was refused by the
// build and then told “nothing to do” by the verb that refusal recommends.
//
// Line-anchored and fence-aware, the rule collectDiagramImageRefs follows and
// for the harder half of the same reason: a ::: backdrop inside a code fence
// is a documented example (the tutorial is full of them), and while counting
// one against the inline budget costs nothing, handing it to --optimize-images
// converts a file the lecture never references and then deletes the original.
// The rewrite that follows a conversion skips fences, so a collector that did
// not would delete a file and leave the only line naming it unedited.
//
// `closing-image: cover` names no file of its own – the cover-image line has
// already contributed it – and resolves to nothing in both readers, which is
// what each does with any token that is not an asset.
function collectDecorationImageRefs(src) {
  const refs = [];
  const fence = fenceTracker();
  for (const line of String(src).split('\n')) {
    if (fence.step(line) || fence.inside) continue;
    const bd = line.match(/^:::[ \t]+backdrop[ \t]+([^\s{]+)/);
    if (bd) { refs.push(bd[1]); continue; }
    const fm = line.match(/^(?:cover-image|closing-image):[ \t]*["']?([^"'\s#]+)/);
    if (fm) refs.push(fm[1]);
  }
  return refs;
}

// The first way a source names a picture, and the one with the most
// spellings, because it is Markdown's: `![alt](path "title")`, the angle form
// `![alt](<path with spaces>)`, and the three reference forms `![alt][ref]`,
// `![alt][]` and `![ref]` with a `[ref]: path` definition anywhere in the
// file. marked renders every one of them through the same image renderer, so
// every one of them is inlined - and a reader that matched only the first
// weighed none of the others: an oversized picture named by reference
// shipped as an external path with no refusal, and a deck whose pictures were
// all named that way counted no image and turned inlining off.
//
// The refs come back as written, query and fragment included, because
// rewriteAssetRef edits the text the author wrote; a reader that wants the
// file strips `?…` / `#…` itself (assetFileOf). Fence-aware and blind to code
// spans, like the renderer, and a ::: draw body is not Markdown. lint.js
// mirrors this in markdownImageRefs.
function collectMarkdownImageRefs(src) {
  const fence = fenceTracker();
  let inDiagram = false;
  const kept = [];
  for (const line of String(src).split('\n')) {
    if (inDiagram) { if (/^:::\s*$/.test(line)) inDiagram = false; kept.push(''); continue; }
    if (fence.step(line) || fence.inside) { kept.push(''); continue; }
    if (parseDrawOpener(line)) { inDiagram = true; kept.push(''); continue; }
    kept.push(line.replace(/`[^`\n]*`/g, ''));
  }
  // A reference resolves only against a definition in its own slide:
  // marked renders each chunk's body on its own, so `![a][r]` with `[r]:`
  // under another heading is printed as text and inlines nothing.
  const sections = [];
  let start = 0;
  kept.forEach((l, i) => { if (i > start && /^#{1,2}\s/.test(l)) { sections.push([start, i]); start = i; } });
  sections.push([start, kept.length]);
  const label = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');
  const refs = [];
  for (const [from, to] of sections) {
    const text = kept.slice(from, to).join('\n');
    const defs = new Map();
    for (const m of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))/gm)) {
      if (!defs.has(label(m[1]))) defs.set(label(m[1]), m[2] ?? m[3]);
    }
    for (const m of text.matchAll(/!\[([^\]]*)\](?:\(\s*(?:<([^>\n]*)>|([^)\s]+))[^)]*\)|\[([^\]]*)\])?/g)) {
      if (m[2] != null) refs.push(m[2]);
      else if (m[3] != null) refs.push(m[3]);
      else {
        const ref = defs.get(label(m[4] || m[1]));
        if (ref) refs.push(ref);
      }
    }
  }
  return refs;
}

// The file a written path names: a `?query` or `#fragment` is a cache-buster
// on a served URL, not part of the file name. Every reader that goes to disk
// strips it - the renderer's existence test did and its inlining did not, so
// `![](assets/pic.png?v=2)` was found, never read, and shipped as an
// external path.
function assetFileOf(href) {
  return String(href).replace(/[?#].*$/, '');
}

function scanReferencedImages(src, sourceDir) {
  const refs = new Set();
  for (const ref of collectMarkdownImageRefs(src)) refs.add(ref);
  for (const ref of collectDiagramImageRefs(src)) refs.add(ref);
  for (const ref of collectDecorationImageRefs(src)) refs.add(ref);

  let total = 0;
  let count = 0;
  // Clips are counted apart: they are not weighed against the budget (see
  // below), but a deck whose only media are clips still has something to
  // inline, and counting it as a deck with nothing turned inlining off and
  // staged a 20 KB clip into videos/ as "too large to inline".
  let clips = 0;
  // And listed, in the order the deck names them: the auto decision fits
  // them into what the images leave of the budget, and the staging plan
  // gives each its name under videos/.
  const clipList = [];
  // Assets past the per-image cap are collected rather than merely counted:
  // buildOnce refuses to emit a half-inlined output (see assertInlinable).
  const oversized = [];
  // The images, by absolute path, in the order the deck names them: what the
  // inline pre-pass encodes ahead of the render (prewarmWebp).
  const images = [];
  for (const href of refs) {
    let abs = null;
    const isShorthand = !/[\\/]/.test(href) && !/\.[a-z0-9]+$/i.test(href);
    if (isShorthand) {
      const rel = resolveFigId(href);
      if (rel) abs = path.join(sourceDir, rel);
    } else if (!/^(?:https?:|data:|\/\/|\/)/i.test(href)) {
      abs = path.resolve(sourceDir, assetFileOf(href));
    }
    if (!abs) continue;
    // Not weighed, not even stat'ed: a file outside the asset root is never
    // read, and the renderer that meets it puts it on the refusal list.
    if (assetEscape(abs, sourceDir) !== null) continue;
    try {
      const stat = fs.statSync(abs);
      // Video is kept out of the images' total. That total decides "inline
      // the images or none of them"; a clip has its own, larger per-file cap
      // and its own fallback (staging into videos/), so letting one push the
      // sum past 10 MB turned inlining off for every diagram in the lecture
      // and reported the clip as an "image". The clips are fitted into what
      // the images leave of the budget afterwards, one by one (buildOnce).
      if (!isVideoExt(abs)) {
        total += stat.size;
        count += 1;
        images.push(abs);
      } else {
        clips += 1;
        clipList.push({ abs: path.resolve(abs), size: stat.size });
      }
      if (stat.size > inlineCapFor(abs)) oversized.push({ abs, size: stat.size });
    } catch { /* missing assets surface elsewhere as figure-missing */ }
  }
  return { total, count, clips, clipList, oversized, images };
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
  // A photograph is a photograph whatever its extension, and --optimize-images
  // reaches all three: it converts a PNG or a JPEG, and it re-encodes a WebP
  // already over the cap at a smaller width. “Simplify by hand” was written for
  // a diagram and is wrong advice for a picture of a room – it now reaches only
  // the formats the verb really cannot help with, which in practice is SVG.
  const rasters = oversized.filter(o => RESCUABLE_EXTS.has(path.extname(o.abs).slice(1).toLowerCase()));
  if (rasters.length) {
    if (detectWebpEncoder()) {
      lines.push('Fix:  node build.js <source.md> --optimize-images');
      lines.push(`      (WebP q92, and a photograph still over the cap is downscaled to`);
      lines.push(`      ${CAP_RESCUE_WIDTH} px wide. Add --max-width N for a smaller one.)`);
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
    lines.push(`--optimize-images handles PNG, JPEG and an oversized WebP, so it cannot help with`);
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

// An explicit relative image path (`![](sub/x.png)`, or a bare name written
// with its extension) that resolves to no file on disk. The shorthand form
// already degrades to a visible placeholder when it finds nothing; an explicit
// path used to fall through and ship the raw string as an external `src`,
// which is a broken figure everywhere the single-file output travels and the
// one thing this format promises not to do. Collected during rendering,
// deduplicated, warned once - the same pattern MATH_ERRORS follows.
const UNRESOLVED_ASSETS = new Set();
// Outside the asset root it answers no without looking, and the path is on
// the list assertAssetsConfined refuses before anything is written.
const assetOnDisk = (abs) => {
  if (!assetAllowed(abs)) return false;
  try { return fs.existsSync(abs); } catch { return false; }
};

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
// the maths follows – see the katex-follows-the-font block in runtime/audience.css.
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
// The name each clip the deck names gets under videos/, planned once per
// build from the whole list (planClipStageNames) so it is the same in every
// view and under every partial flag. Keyed by resolved path.
const clipStageNames = new Map();
// Clips the auto-inline decision stages although each is under the clip cap,
// because inlining it would take the deck past AUTO_INLINE_BUDGET. Per build.
const clipsOverBudget = new Set();

// One folder, so two clips with one file name - `a/intro.mp4` and
// `b/intro.mp4`, or a shorthand `![](intro)` and `../shared/intro.mp4` - were
// both staged as videos/intro.mp4, the second copy overwrote the first, and
// slide A played slide B's clip. A name only one clip of the deck has stays
// as it is; where two or more share one (compared without case, which is how
// the file systems the decks are made on compare), each gets a short hash of
// its path relative to the source folder - a function of the source alone,
// so a rebuild names it the same. A clip already living in videos/ keeps
// its name, because it is played where it is.
function clipHashName(absPath) {
  const name = path.basename(absPath);
  const ext = path.extname(name);
  const rel = path.relative(currentSourceDir, absPath).split(path.sep).join('/');
  const h = crypto.createHash('sha256').update(rel).digest('hex').slice(0, 8);
  return `${name.slice(0, name.length - ext.length)}-${h}${ext}`;
}
function planClipStageNames(clips) {
  clipStageNames.clear();
  const groups = new Map();
  for (const c of clips) {
    const abs = path.resolve(c);
    const key = path.basename(abs).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    if (!groups.get(key).includes(abs)) groups.get(key).push(abs);
  }
  for (const list of groups.values()) {
    for (const abs of list) {
      const name = path.basename(abs);
      const home = path.resolve(currentSourceDir, VIDEO_STAGE_DIR, name);
      clipStageNames.set(abs, list.length === 1 || abs === home ? name : clipHashName(abs));
    }
  }
}
// A clip the plan did not see (a reference only a renderer reads) takes its
// own name unless a clip staged before it in this build has it already.
function clipStageName(absPath) {
  const abs = path.resolve(absPath);
  if (clipStageNames.has(abs)) return clipStageNames.get(abs);
  const name = path.basename(abs);
  const taken = [...clipStageNames.values(), ...[...stagedVideos.values()]
    .map(v => v.rel && v.rel.slice(VIDEO_STAGE_DIR.length + 1))]
    .some(n => n && n.toLowerCase() === name.toLowerCase());
  const chosen = taken && abs !== path.resolve(currentSourceDir, VIDEO_STAGE_DIR, name) ? clipHashName(abs) : name;
  clipStageNames.set(abs, chosen);
  return chosen;
}

function stageVideo(absPath) {
  if (stagedVideos.has(absPath)) return stagedVideos.get(absPath);
  if (!assetAllowed(absPath)) {
    stagedVideos.set(absPath, { rel: null, copied: false, bytes: 0 });
    return stagedVideos.get(absPath);
  }
  const name = clipStageName(absPath);
  const destDir = path.join(currentSourceDir, VIDEO_STAGE_DIR);
  const dest = path.join(destDir, name);
  const rel = `${VIDEO_STAGE_DIR}/${name}`;
  // Already living in videos/ – nothing to copy, just address it there.
  if (path.resolve(absPath) === path.resolve(dest)) {
    stagedVideos.set(absPath, { rel, copied: false, bytes: safeSize(absPath) });
    return stagedVideos.get(absPath);
  }
  try {
    // Refused when videos/ is a link, and the copy is renamed into place, so
    // a folder that arrives with videos/ or videos/<clip> pointing elsewhere
    // gets neither written through (see the section on a source.md someone
    // sent you).
    outputDir(destDir);
    const src = fs.statSync(absPath);
    let need = true;
    try {
      const cur = fs.lstatSync(dest);
      // Same size and no older than the source: treat as already staged.
      // Keeps --watch from re-copying a large file on every keystroke.
      need = cur.isSymbolicLink() || !(cur.size === src.size && cur.mtimeMs >= src.mtimeMs);
    } catch { /* not there yet */ }
    if (need) {
      const tmp = path.join(destDir, `.${name}.${crypto.randomBytes(6).toString('hex')}.tmp`);
      try {
        fs.copyFileSync(absPath, tmp, fs.constants.COPYFILE_EXCL);
        fs.renameSync(tmp, dest);
      } catch (e) {
        try { fs.unlinkSync(tmp); } catch { /* never written */ }
        throw e;
      }
    }
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
// fine to the eye. Running it in Node also kept it out of the template
// literals the runtime then lived in, where an escape mistake was silent.
//
// Error correction level M (~15%), which survives a projector's contrast
// and a photograph taken at an angle from the back of a room.
const qrCodeGen = nodeRequire('qrcode-generator');
// UTF-8, not the library's default: that one masks every code unit to a
// byte, so an address with a non-Latin-1 character in its path scanned to a
// different string and looked perfectly right on the slide. TextEncoder
// rather than the library's own UTF-8 table, which its ESM build does not
// carry; the live encoder (liveQrSvg in runtime/audience.js) and the spec set the
// same function, so every side draws one code.
qrCodeGen.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
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
  // `xHeight` is the height of a lowercase x in this face, as a fraction of
  // the em, and every text-role entry below carries one. It is there because
  // inline code is set in the mono role inside a sentence set in the serif or
  // the sans, and the three roles disagree about that height by a tenth of an
  // em – Source Serif 4 is 0.492 and JetBrains Mono 0.550. At one font-size
  // the code then reads as a shout inside the sentence, so the code is sized
  // to bring the two x-heights level, which needs the number.
  //
  // MEASURED, NOT READ OFF A SPECIMEN: tools/font-playground/measure-xheight.mjs
  // declares each face exactly as fontStyleTag does – the named instance of
  // Noto Sans Mono Condensed included – and reads the CSS `ex` unit in
  // Chromium at weight 400, cross-checked against the ink height of an x on a
  // canvas. It writes tools/font-playground/xheights.json; the numbers here
  // are that file, to three decimals. Re-run it when a face joins the roster
  // or a package ships different bytes, and copy the numbers across;
  // `node test/gates/run.mjs xheight` holds the two files together and
  // refuses an entry with no number. Same discipline as `sizeAdjust` below
  // and `dgCharW` in diagram-core.mjs, for the same reason: a number nobody
  // measured is a number that is quietly wrong on every slide.
  Literata: {
    role: 'serif', pkg: '@fontsource-variable/literata', variable: true, xHeight: 0.507,
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
    role: 'serif', pkg: '@fontsource-variable/source-serif-4', variable: true, xHeight: 0.492,
    files: { normal: 'source-serif-4-latin-wght-normal.woff2', italic: 'source-serif-4-latin-wght-italic.woff2' },
  },
  // The sturdiest of the four by every measure that matters on a projection,
  // and the cheapest: lowest contrast, thickest hairline, largest x-height
  // after Merriweather, and 66 KB against Literata's 106.
  Bitter: {
    role: 'serif', pkg: '@fontsource-variable/bitter', variable: true, xHeight: 0.532,
    files: { normal: 'bitter-latin-wght-normal.woff2', italic: 'bitter-latin-wght-italic.woff2' },
  },
  'Noto Serif': {
    role: 'serif', pkg: '@fontsource-variable/noto-serif', variable: true, xHeight: 0.536,
    files: { normal: 'noto-serif-latin-wght-normal.woff2', italic: 'noto-serif-latin-wght-italic.woff2' },
  },
  // The one alternate that re-wraps a finished deck: 8% wider than Literata,
  // which is a line the paragraph did not have before. It also has the best
  // bold separation of the five, so the trade is real rather than a defect.
  // The width reaches one more place - see the note on dgCharW below.
  'Roboto Serif': {
    role: 'serif', pkg: '@fontsource-variable/roboto-serif', variable: true, xHeight: 0.537,
    files: { normal: 'roboto-serif-latin-wght-normal.woff2', italic: 'roboto-serif-latin-wght-italic.woff2' },
  },
  // The default sans since it replaced Inter Tight. Tight is the condensed
  // cut of Inter, and the saved width is paid for in letter spacing that
  // reads cramped on a screen - worst exactly where the text is already
  // small, in figure labels. Plex's narrow forms (i l j t) are 13.5% wider
  // and its digits 9.7%, which is what separates 1 from I from l at a
  // distance. dgCharW in diagram-core.mjs is calibrated to this face.
  'IBM Plex Sans': {
    role: 'sans', pkg: '@fontsource-variable/ibm-plex-sans', variable: true, xHeight: 0.516,
    files: { normal: 'ibm-plex-sans-latin-wght-normal.woff2', italic: 'ibm-plex-sans-latin-wght-italic.woff2' },
  },
  // Kept selectable rather than deleted, because it is what every lecture
  // built against 1.0.0 was set in, and `layout: 1.0` has to be able to get
  // it back. `docs/site/build-site.js` self-hosts it independently.
  'Inter Tight': {
    role: 'sans', pkg: '@fontsource-variable/inter-tight', variable: true, xHeight: 0.546,
    files: { normal: 'inter-tight-latin-wght-normal.woff2', italic: 'inter-tight-latin-wght-italic.woff2' },
  },
  'JetBrains Mono': {
    role: 'mono', pkg: '@fontsource-variable/jetbrains-mono', variable: true, xHeight: 0.550,
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
    role: 'mono', pkg: '@fontsource-variable/noto-sans-mono', variable: true, xHeight: 0.536,
    // The wdth axis lives in the `standard` build; the `wght` build has
    // weight alone and would silently ignore the setting.
    files: { normal: 'noto-sans-mono-latin-standard-normal.woff2' },
    variations: "'wdth' 62.5",
  },

  // ── the display role ──────────────────────────────────────────────
  //
  // The face the three transition slides wear – the cover, the closing
  // slide and the section dividers – and which no other slide in the deck
  // is given. That is the one place in a lecture where a loud typeface is
  // not a mistake: nobody reads a divider, they recognise it.
  //
  // Four things separate this role from the three text roles above, and
  // each is a bend made on purpose rather than an omission.
  //
  //   NO DEFAULT. BUNDLED_DEFAULTS has no `display` entry, so a deck that
  //   names none resolves the role to nothing, embeds nothing and emits no
  //   rule – it builds byte for byte what it built before this existed.
  //   That absence is the feature, not a gap waiting to be filled.
  //
  //   NOT A VARIABLE LATIN SUBSET. The rule the three text roles keep holds
  //   because `topic-bold` puts bold fragments on every slide and that
  //   wants a weight axis. A headline carries three words and no bold, so
  //   the axis buys nothing here, and 21 of these have no variable build at
  //   all. Anton is one weight; that is what Anton is.
  //
  //   `kind` is what the face IS, which is a different question from what
  //   it looks like, and it drives exactly one rule: a display serif over a
  //   serif body reads as one typeface set badly rather than as two. That
  //   rule is lint.js's `display-pairing` warning and this field is the
  //   table it mirrors. Chakra Petch is the case that proves the two
  //   questions differ – a machine to look at and a sans to pair with.
  //
  //   `sizeAdjust` is a measured width correction, carried as the
  //   @font-face descriptor of the same name and written here as the
  //   percentage that descriptor takes. These faces disagree about advance
  //   width by a factor of three while the cover's type size is tuned for
  //   Literata: Anton set at it looks timid, Press Start 2P set at it runs
  //   off the slide, which is what it did in the playground before this
  //   number existed. Each one is the advance width of a German reference
  //   title against Literata's, inverted and clamped to [55, 145] – see
  //   tools/font-playground/measure-scale.mjs, which writes scales.json;
  //   re-run it when a face is added and copy the number across. Same
  //   discipline as dgCharW in diagram-core.mjs and for the same reason: a
  //   number nobody measured is a number that silently overflows a slide.
  //   It sits on the face rather than on a font-size rule because six cover
  //   compositions set their own title size and print, the zoom, auto-fit
  //   and --check-fit all work off whatever those produce. A multiplier in
  //   a layout rule would have to be repeated in every one of them, and
  //   would be forgotten in one.
  //
  //   WIDTH IS THE METRIC, AND APPARENT SIZE THEREFORE VARIES. That is a
  //   decision, not an oversight. One multiplier cannot serve both fit and
  //   apparent size: a face that is wide per glyph has to be set small to
  //   keep the line count, and then it looks small. Measured against
  //   Literata after the correction, the ink height of a reference title
  //   runs from 0.38 (Silkscreen) to 1.34 (Patrick Hand) - so a Silkscreen
  //   divider really does read as a thin band, and Anton a quarter too big.
  //   Width wins anyway because the two failures are not equal: a headline
  //   that takes one line too many runs off the slide, and a headline that
  //   reads small is merely weak. Nor would a clamp on the vertical help -
  //   pulling Silkscreen's ink to parity puts its width past twice
  //   Literata's, which trades the weak slide for the broken one. Note that
  //   it is not an all-caps problem: Bebas Neue and Staatliches, the two
  //   purest caps faces, land at 1.00 and 0.90 ink height, because their
  //   tall capitals come with no descenders.
  //
  // THE RULE THAT KEEPS THE FACE OUT OF THE READER'S HANDS: `display` must
  // never join FONT_CYCLE, and --display-stack must never be assigned under
  // a body[data-font=…] or body[data-theme=…] selector. F cycles a
  // *variable*, not a family, so pointing the two headline selectors at
  // --display-stack takes them out of that cycle by construction – there is
  // no "F does not apply here" rule to write and therefore none to forget
  // when a fourth body font is added later. A re-points colour tokens only
  // and no theme touches a family, so the face is already immune to it
  // while its colour still follows --ink and --emph and so stays readable
  // on the three dark themes.
  //
  // All 32 are SIL OFL 1.1 like the text roster, so oflNotice() names
  // whichever of them a view happens to carry. Three further candidates
  // were cut for being Apache-2.0 – not because that licence forbids
  // embedding, it does not, but because bundledFaces() emits OFL text with
  // the bytes and a second licence regime in that path buys one typeface at
  // the price of a special case.

  // ── hand: a line that was drawn rather than set. Pairs with any body. ──
  Caveat: { role: 'display', kind: 'hand', sizeAdjust: 139,
    pkg: '@fontsource-variable/caveat',
    files: [{ file: 'caveat-latin-wght-normal.woff2', style: 'normal', weight: '400 700' }] },
  'Shantell Sans': { role: 'display', kind: 'hand', sizeAdjust: 88,
    pkg: '@fontsource-variable/shantell-sans',
    files: [{ file: 'shantell-sans-latin-wght-normal.woff2', style: 'normal', weight: '300 800' }] },
  'Caveat Brush': { role: 'display', kind: 'hand', sizeAdjust: 134,
    pkg: '@fontsource/caveat-brush',
    files: [{ file: 'caveat-brush-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Patrick Hand': { role: 'display', kind: 'hand', sizeAdjust: 133,
    pkg: '@fontsource/patrick-hand',
    files: [{ file: 'patrick-hand-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  Kalam: { role: 'display', kind: 'hand', sizeAdjust: 106,
    pkg: '@fontsource/kalam',
    files: [{ file: 'kalam-latin-700-normal.woff2', style: 'normal', weight: '700' }] },
  'Amatic SC': { role: 'display', kind: 'hand', sizeAdjust: 145,
    pkg: '@fontsource/amatic-sc',
    files: [{ file: 'amatic-sc-latin-700-normal.woff2', style: 'normal', weight: '700' }] },

  // ── machine: pixel grids, terminals, exaggerated monospace. ──
  'Press Start 2P': { role: 'display', kind: 'mono', sizeAdjust: 55,
    pkg: '@fontsource/press-start-2p',
    files: [{ file: 'press-start-2p-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  Silkscreen: { role: 'display', kind: 'mono', sizeAdjust: 62,
    pkg: '@fontsource/silkscreen',
    files: [{ file: 'silkscreen-latin-700-normal.woff2', style: 'normal', weight: '700' }] },
  'Pixelify Sans': { role: 'display', kind: 'sans', sizeAdjust: 96,
    pkg: '@fontsource-variable/pixelify-sans',
    files: [{ file: 'pixelify-sans-latin-wght-normal.woff2', style: 'normal', weight: '400 700' }] },
  VT323: { role: 'display', kind: 'mono', sizeAdjust: 119,
    pkg: '@fontsource/vt323',
    files: [{ file: 'vt323-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Space Mono': { role: 'display', kind: 'mono', sizeAdjust: 78,
    pkg: '@fontsource/space-mono',
    files: [{ file: 'space-mono-latin-700-normal.woff2', style: 'normal', weight: '700' }] },
  // The one face here with no eszett: a German title gets a fallback glyph
  // mid-word, and lint.js warns on a German deck that picks it. Found by
  // eye against a Times fallback rather than by a coverage probe alone,
  // which is also how its second oddity surfaced – it draws lowercase as
  // capitals.
  'Rubik Mono One': { role: 'display', kind: 'mono', sizeAdjust: 56, noEszett: true,
    pkg: '@fontsource/rubik-mono-one',
    files: [{ file: 'rubik-mono-one-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Chakra Petch': { role: 'display', kind: 'sans', sizeAdjust: 101,
    pkg: '@fontsource/chakra-petch',
    files: [{ file: 'chakra-petch-latin-700-normal.woff2', style: 'normal', weight: '700' }] },
  Orbitron: { role: 'display', kind: 'sans', sizeAdjust: 87,
    pkg: '@fontsource-variable/orbitron',
    files: [{ file: 'orbitron-latin-wght-normal.woff2', style: 'normal', weight: '400 900' }] },

  // ── graphic: display weight, loud serifs, poster type. ──
  'Bodoni Moda': { role: 'display', kind: 'serif', sizeAdjust: 92,
    pkg: '@fontsource-variable/bodoni-moda',
    files: [{ file: 'bodoni-moda-latin-wght-normal.woff2', style: 'normal', weight: '400 900' }] },
  Prata: { role: 'display', kind: 'serif', sizeAdjust: 100,
    pkg: '@fontsource/prata',
    files: [{ file: 'prata-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'DM Serif Display': { role: 'display', kind: 'serif', sizeAdjust: 108,
    pkg: '@fontsource/dm-serif-display',
    files: [{ file: 'dm-serif-display-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Abril Fatface': { role: 'display', kind: 'serif', sizeAdjust: 103,
    pkg: '@fontsource/abril-fatface',
    files: [{ file: 'abril-fatface-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Alfa Slab One': { role: 'display', kind: 'serif', sizeAdjust: 89,
    pkg: '@fontsource/alfa-slab-one',
    files: [{ file: 'alfa-slab-one-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Young Serif': { role: 'display', kind: 'serif', sizeAdjust: 95,
    pkg: '@fontsource/young-serif',
    files: [{ file: 'young-serif-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Instrument Serif': { role: 'display', kind: 'serif', sizeAdjust: 142,
    pkg: '@fontsource/instrument-serif',
    files: [{ file: 'instrument-serif-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Yeseva One': { role: 'display', kind: 'serif', sizeAdjust: 93,
    pkg: '@fontsource/yeseva-one',
    files: [{ file: 'yeseva-one-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  Anton: { role: 'display', kind: 'sans', sizeAdjust: 120,
    pkg: '@fontsource/anton',
    files: [{ file: 'anton-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  Oswald: { role: 'display', kind: 'sans', sizeAdjust: 116,
    pkg: '@fontsource-variable/oswald',
    files: [{ file: 'oswald-latin-wght-normal.woff2', style: 'normal', weight: '200 700' }] },
  'Archivo Black': { role: 'display', kind: 'sans', sizeAdjust: 87,
    pkg: '@fontsource/archivo-black',
    files: [{ file: 'archivo-black-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Bebas Neue': { role: 'display', kind: 'sans', sizeAdjust: 142,
    pkg: '@fontsource/bebas-neue',
    files: [{ file: 'bebas-neue-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
  'Big Shoulders Display': { role: 'display', kind: 'sans', sizeAdjust: 122,
    pkg: '@fontsource-variable/big-shoulders-display',
    files: [{ file: 'big-shoulders-display-latin-wght-normal.woff2', style: 'normal', weight: '100 900' }] },
  Syne: { role: 'display', kind: 'sans', sizeAdjust: 61,
    pkg: '@fontsource-variable/syne',
    files: [{ file: 'syne-latin-wght-normal.woff2', style: 'normal', weight: '400 800' }] },
  'Bricolage Grotesque': { role: 'display', kind: 'sans', sizeAdjust: 97,
    pkg: '@fontsource-variable/bricolage-grotesque',
    files: [{ file: 'bricolage-grotesque-latin-wght-normal.woff2', style: 'normal', weight: '200 800' }] },
  'Space Grotesk': { role: 'display', kind: 'sans', sizeAdjust: 99,
    pkg: '@fontsource-variable/space-grotesk',
    files: [{ file: 'space-grotesk-latin-wght-normal.woff2', style: 'normal', weight: '300 700' }] },
  Unbounded: { role: 'display', kind: 'sans', sizeAdjust: 73,
    pkg: '@fontsource-variable/unbounded',
    files: [{ file: 'unbounded-latin-wght-normal.woff2', style: 'normal', weight: '200 900' }] },
  Staatliches: { role: 'display', kind: 'sans', sizeAdjust: 128,
    pkg: '@fontsource/staatliches',
    files: [{ file: 'staatliches-latin-400-normal.woff2', style: 'normal', weight: '400' }] },
};
// What a lecture gets when it names nothing. `layout: 1.0` swaps the sans.
// There is no `display` here on purpose – see the display roster above.
const BUNDLED_DEFAULTS = { serif: 'Literata', sans: 'IBM Plex Sans', mono: 'JetBrains Mono' };
// Every role the `fonts:` block has a slot for, in the order a stylesheet
// wants them. Deliberately NOT the same list as FONT_CYCLE: the reader's F
// key walks the three reading faces and must never reach the fourth.
const FONT_ROLES = ['serif', 'sans', 'mono', 'display'];
const bundledNamesFor = (role) =>
  Object.entries(BUNDLED_FONTS).filter(([, f]) => f.role === role).map(([n]) => n);

const bundledFacesCache = new Map();
function bundledFaces(roster = BUNDLED_DEFAULTS) {
  const key = JSON.stringify(roster);
  if (bundledFacesCache.has(key)) return bundledFacesCache.get(key);
  const out = [];
  // `display` is the role that may simply be absent, and the `!family`
  // guard below is what carries that – nothing is read, nothing is emitted.
  for (const role of FONT_ROLES) {
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
        // The display role's measured width correction, as a percentage.
        // Null for the text roles, which are all set at the size the layout
        // asks for because the layout was drawn around them.
        sizeAdjust: f.sizeAdjust || null,
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
  for (const role of FONT_ROLES) {
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
const SANS_STACK_TAIL = `'IBM Plex Sans', 'Inter', system-ui, -apple-system, sans-serif`;
const FONT_STACK_TAILS = {
  serif: `'Literata', 'Source Serif 4', Georgia, serif`,
  sans: SANS_STACK_TAIL,
  mono: `'JetBrains Mono', ui-monospace, Menlo, monospace`,
  // No sensible default chain exists for a display face – naming one would
  // be naming a poster typeface and hoping the machine has it, which is the
  // failure the bundle exists to end. So the tail IS the sans stack, shared
  // rather than copied: a headline that loses its face degrades to the
  // deck's own sans rather than to a serif pretending to be loud.
  display: SANS_STACK_TAIL,
};
// Which CSS custom properties each role feeds. Audience and print use
// different names for the same idea; setting a property a given view never
// reads costs nothing, so one override block serves all four outputs.
const FONT_ROLE_VARS = {
  serif: ['--serif-stack', '--serif'],
  sans: ['--sans-stack', '--sans'],
  mono: ['--mono-font', '--read-mono-stack', '--mono'],
  // One property, and one that no stylesheet defines a value for: it exists
  // only when a display face resolved, which is what lets the two headline
  // selectors fall back through var()'s own second argument. It must never
  // be assigned under body[data-font=…] or body[data-theme=…] – see the
  // display roster.
  display: ['--display-stack'],
};

// ── the display role's line heights ─────────────────────────────────
//
// `size-adjust` scales a face's glyph outlines AND its own metrics, but a
// NUMERIC line-height resolves against the nominal font-size and does not
// follow. Measured on a cover in Anton at size-adjust 120%: font-size
// 82.13px, line box 90.35px (1.1 of it), apparent type 98.6px. A one-line
// headline is merely tight; a three-line German one collides – the ö-dots
// and the t of the first line sit inside the letters of the second. That
// ships as a broken slide, so each of these is multiplied by the face's own
// factor in the block fontStyleTag emits. A face below 1.0 (Press Start 2P
// at 55%) correctly tightens instead.
//
// They live here because a blanket `line-height` on the display role's
// selectors would clobber deliberate values – the sub-1 ratios under
// `cover: display`, where a headline is meant to stack, and the 1.12 / 1.1
// the eyebrow subtitle carries, which is not the title's number in print.
// So this table is exactly the line heights the DISPLAY FACE WEARS, keyed by
// the selector that carries each, and every one of them is read back out of
// here by the block fontStyleTag emits. A line height on an element the face
// does not reach – 1.3 on the eyebrow kicker, 1.25 / 1.3 on a quiet subtitle
// under `headline: stacked` – stays a literal in the stylesheet, because
// there is nothing to keep it in step with.
//
// THE PROPERTY THAT MAKES THE INDIRECTION SAFE: interpolating the string
// '1.1' emits the characters `1.1`, so the two stylesheets are the same
// bytes they were and a deck with no display face still builds byte for
// byte what it built before the role existed. Copying the numbers into the
// conditional block instead would have put seven of them in two places.
const DISPLAY_LH = {
  print: {
    '.chunk-title .title-main': '1.15',
    '.chunk-title[data-cover=display] .title-main': '1.02',
    'body[data-headline=eyebrow] .chunk-title .title-subtitle': '1.12',
  },
  live: {
    '.chunk-title .title-main': '1.1',
    '.chunk[data-cover=display] .title-main': '0.97',
    '.chunk-section .section-heading': '1.1',
    'body[data-headline=eyebrow] .chunk-title .title-subtitle': '1.1',
  },
};
// Reached through a function and not by indexing, because a mistyped key
// would interpolate the word `undefined` into a stylesheet: an invalid
// declaration the browser drops in silence, which is the failure mode this
// file spends its comments on. Called while the CSS constants are built, so
// a typo throws at import rather than on somebody's cover.
function displayLh(view, sel) {
  const v = DISPLAY_LH[view] && DISPLAY_LH[view][sel];
  if (!v) throw new Error(`DISPLAY_LH has no ${view} line-height for ${sel}`);
  return v;
}

// The same oversight as the line heights, found later and by eye rather than
// by a gate: tracking chosen for the body serif was reaching a face that never
// asked for it. `cover: display` sets `letter-spacing: -0.042em`, because it
// sets the title largest and a serif at that size wants tightening - and Anton,
// already condensed and tightly fitted, came out with its letters touching.
// The divider only looked straight because its -0.02em is a quarter of that.
//
// So every rule that sets tracking on a slot the display face wears is listed
// here and reset to `normal` in the conditional block: a display face is fitted
// by the person who drew it, and the deck's correction is a correction for
// Literata. The eyebrow kicker is deliberately absent from both lists - under
// `headline: eyebrow` the face is on the subtitle and the kicker keeps its own
// 0.015em, or 0.055em when `caps: on` tracks the capitals.
//
// Kept complete by `node test/gates/run.mjs display-track`, which re-reads both
// stylesheets: a new cover composition with a tracking of its own is otherwise
// exactly the change that would put the collision back without saying so.
const DISPLAY_TRACK = {
  print: [
    'body[data-headline=eyebrow] .chunk-title .title-subtitle',
    '.chunk-title[data-cover=display] .title-main',
  ],
  live: [
    '.chunk-title .title-main',
    'body[data-headline=eyebrow] .chunk-title .title-subtitle',
    '.chunk[data-cover=masthead] .title-main',
    '.chunk[data-cover=display] .title-main',
    '.chunk[data-cover=panel] .title-main',
    '.chunk[data-cover=quote] .title-main',
    '.chunk[data-cover=hero] .title-main',
    '.chunk[data-cover=quote][data-closing] .title-main',
    // A stacked divider is no longer a second entry here: it set a tracking
    // of its own while the heading was a caption, and now the heading is the
    // plain divider heading one size step down, so the rule below tracks it
    // and is where the display face gets its reset.
    '.chunk-section .section-heading',
  ],
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

// The shape of the `fonts:` block, checked before anything reads it: a map
// of the four roles, or the one word `none`. Both readers below skip
// anything else without a word, so `fonts: off` shipped the whole bundle and
// `fonts: {heading: Anton}` embedded nothing - two decks that look as if
// their author never wrote the line. lint.js: unknown-font-role.
function assertFontsBlock(frontmatter = {}) {
  const spec = frontmatter.fonts;
  if (spec == null) return;
  const fail = (msg) => { const err = new Error(msg); err.userFacing = true; throw err; };
  if (typeof spec !== 'object' || Array.isArray(spec)) {
    if (String(spec).trim().toLowerCase() === 'none') return;
    fail(`Frontmatter: "fonts: ${String(spec).trim()}" is not a value this key takes.\n` +
      '  fonts: is a block naming a family per role, or the one word none, which\n' +
      '  ships no bundled face at all:\n' +
      '    fonts:\n      sans: Inter Tight\n      display: Anton');
  }
  const unknown = Object.keys(spec).filter(k => !FONT_ROLES.includes(k));
  if (unknown.length) {
    fail(`Frontmatter: fonts has no role "${unknown[0]}".\n` +
      `  Roles: ${FONT_ROLES.join(', ')}`);
  }
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

  for (const role of FONT_ROLES) {
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
      const lead = `  Bundled ${role} families (no file needed): `;
      const err = new Error(
        `Frontmatter names "fonts.${role}: ${family}" but it is neither a bundled family\n` +
        `nor a file in ${path.join(FONT_DIR, '')}/.\n` +
        `${lead}${wrapNames(bundledNamesFor(role), lead.length)}\n` +
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

    // A face file is an asset like any other: read from the asset root and
    // no further, a link in fonts/ counting as the file it points to.
    const outside = new Map();
    for (const { file } of bySlot.values()) {
      const out = assetEscape(path.join(dir, file), srcDir);
      if (out !== null) outside.set(out, path.join(FONT_DIR, file));
    }
    if (outside.size) throw assetsConfinedError(outside, srcDir);
    for (const { file, ext, face } of bySlot.values()) {
      const buf = fs.readFileSync(path.join(dir, file));
      bytes += buf.length;
      if (ext !== 'woff2') {
        notes.push(`${file} is ${ext} (${(buf.length / 1024).toFixed(0)} KB) – woff2 is typically 30-50% smaller`);
      }
      faces.push({
        // The role rides along so a display face an author supplied from
        // fonts/ is findable in this list the way a bundled one is in the
        // other - `style: {display-scale}` has to reach both, and nothing
        // else here distinguishes them. fontStyleTag ignores the field.
        role, family, weight: face.weight, style: face.style, file,
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
// A comma list, folded onto continuation lines under a hanging indent. The
// three text roles have two to five families each and come out on one line
// exactly as they did; the display role has 32, and one 450-character line
// is a list nobody reads their own typo out of. `lead` is the width of
// whatever the caller has already written on that first line, without which
// only the second line onwards would wrap.
function wrapNames(names, lead = 0, width = 78, indent = '    ') {
  const out = [];
  let line = '';
  const shown = () => (out.length ? 0 : lead) + line.length;
  names.forEach((n, i) => {
    const piece = n + (i < names.length - 1 ? ',' : '');
    if (line && shown() + 1 + piece.length > width) { out.push(line); line = indent + piece; }
    else line = line ? `${line} ${piece}` : piece;
  });
  if (line) out.push(line);
  return out.join('\n');
}

// Emits the @font-face blocks and the stack overrides for one view. Takes
// the bundled defaults and whatever the author supplied; a role the author
// named uses their family, every other role uses the bundle.
function fontStyleTag(embed, view) {
  if (!embed) return '';
  const { faces = [], overrides = [], bundled = [] } = embed;
  const face = (f) =>
    `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};`
    + (f.variations ? `font-variation-settings:${f.variations};` : '')
    // The display role's width correction rides on the face, not on a
    // font-size, so every rule that sets a title's size gets it for free –
    // the six cover compositions, print, the zoom, auto-fit and --check-fit.
    + (f.sizeAdjust ? `size-adjust:${f.sizeAdjust}%;` : '')
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
  // Where the display role reaches, and the whole of its reach: the cover,
  // the closing slide (which is the cover's own element, wearing
  // data-closing) and the section dividers. A `## principle:` heading is not
  // one of them.
  //
  // THE FACE FOLLOWS THE LOUD LINE, WHICH IS NOT ALWAYS .title-main.
  // `style: {headline: eyebrow}` turns a title pair the other way up: the
  // title is set small as a kicker and .title-subtitle carries the weight.
  // Left alone, the role then put a poster face on the kicker and the body
  // serif on the headline - measured on a cover in that mode, .title-main
  // was Anton at 32px over .title-subtitle in Literata at 82px, which is the
  // exact inverse of what an author asking for a display face is asking for.
  // So the eyebrow pair is restated under a body[data-headline=eyebrow]
  // guard, one rule each way, and specificity settles it rather than source
  // order: the kicker is handed explicitly back to --body-font, because
  // leaving it out would leave the unqualified rule above still matching it.
  // Under `stacked`, the deck's default, nothing here applies and the
  // rendering is what it was.
  //
  // A divider is untouched either way - it has one line, and `headline:`
  // does not reach .section-heading.
  //
  // It rides here rather than in runtime/audience.css and runtime/print.css because
  // those are constants with no way to ask whether this lecture resolved a
  // display face, and the answer has to be "emit nothing" for every deck
  // that did not: a rule naming --display-stack in the two stylesheets
  // would move every existing output's bytes for a variable nothing sets.
  // Standing after both of them also beats the one rule it has to beat -
  // .chunk-section .section-heading sets font-family: var(--body-font) at
  // the same specificity, so this wins on document order.
  //
  // `view` is 'print' or 'live' and exists for the line heights alone: the
  // two stylesheets spell the same composition differently
  // (.chunk-title[data-cover=display] against .chunk[data-cover=display])
  // and give it different ratios, 1.02 against 0.97, while BOTH selectors
  // match in both views. One shared block would therefore hand print the
  // projection's ratio, or the reverse, depending on which came last.
  //
  // The line heights below it are the second half of the same condition, and
  // they move with the face: under `eyebrow` it is the subtitle's own value
  // that is scaled, not the title's, and the kicker keeps the plain 1.3 it
  // has always had - the stylesheet's own rule is a class more specific than
  // the unqualified one here, so nothing has to be written to hold it. They
  // are read out of DISPLAY_LH, which is also what the two stylesheets
  // interpolated, so the numbers exist once; see the note there for why a
  // blanket line-height would be wrong and why this costs no bytes. A face
  // an author supplied from fonts/ carries no measurement, so its factor is
  // 1 and nothing is restated - the correction belongs to `size-adjust`, and
  // where there is no size-adjust there is nothing to correct.
  let displayCss = '';
  if (overrides.some(o => o.role === 'display')) {
    if (!DISPLAY_LH[view]) throw new Error(`fontStyleTag: unknown view ${view}`);
    const wears = 'font-family: var(--display-stack, var(--body-font));';
    displayCss = [
      '',
      `.chunk-title .title-main,\n.chunk-section .section-heading { ${wears} }`,
      `body[data-headline=eyebrow] .chunk-title .title-main { font-family: var(--body-font); }`,
      `body[data-headline=eyebrow] .chunk-title .title-subtitle { ${wears} }`,
      // Emitted whatever the size-adjust is, unlike the line heights below:
      // the tracking is wrong for a display face at any size, and an author
      // face from fonts/ carries no measurement but is just as badly served
      // by a correction meant for the body serif.
      `${DISPLAY_TRACK[view].join(',\n')} { letter-spacing: normal; }`,
    ].join('\n');
    // Both lists, because a display face can come from the bundle or from
    // fonts/, and it is the same list faceCss walks two lines above. The
    // number is whatever the descriptor says - buildOnce has already folded
    // style.display-scale into it - so the two cannot drift by a rounding
    // step the way two separate products would.
    const pct = ([...bundled, ...faces].find(f => f.role === 'display') || {}).sizeAdjust;
    // Divided in CSS rather than in JS: the emitted rule then carries the
    // measured percentage itself, beside the size-adjust descriptor it
    // answers, and no float is formatted on the way out.
    if (pct && pct !== 100) displayCss += '\n' + Object.entries(DISPLAY_LH[view])
      .map(([sel, lh]) => `${sel} { line-height: calc(${lh} * ${pct} / 100); }`)
      .join('\n');
  }
  const notice = bundled.length
    ? oflNotice([...new Set(bundled.map(f => f.family))]) + '\n' : '';
  return `<style>\n${notice}${faceCss}${rootBlock}${displayCss}\n</style>`;
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
  // Thrown here and not left for the pass before the write: a null would be
  // reported first as a backdrop or cover that "resolves to no file".
  if (!assetAllowed(abs)) throw assetsConfinedError(OUTSIDE_ASSETS, currentSourceDir);
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

// `closing-credits:` - which of the cover's credit fields the closing slide
// repeats. The slide carries none of them by default and that stays the
// default: the presenter line and the info block say who is talking and
// where, which the room learned an hour ago, and setting them again in the
// same composition is a slide that looks like a mistake in the deck.
//
// What the argument never covered is the one line a last slide is most
// often asked to carry, which is where the slides can be found. So the key
// is graded rather than boolean, and it borrows `cover` as a reserved word
// from `closing-image:` for the same reason that key does - it names *which*
// credits, where a word like `same` would only say there are some.
//
//   none     nothing, as today
//   contact  the foot row only: `contact:` and `notice:`
//   cover    the whole block the cover carried
const CLOSING_CREDITS_NONE = 'none';
const CLOSING_CREDITS_COVER = 'cover';
const CLOSING_CREDITS = [CLOSING_CREDITS_NONE, 'contact', CLOSING_CREDITS_COVER];

// `cover-ground:` - whether the opening slide is dark while the rest of the
// deck is light. The machinery is already here and was reachable only
// through a photograph: `cover: hero` emits an inverted backdrop, and
// `.chunk[data-backdrop=invert]` re-points the ink tokens for that one
// chunk. A deck that wants the dark opening and no picture had no path,
// because `::: backdrop` requires an asset.
//
// It is a key rather than an eleventh composition because it is one
// question asked of all ten - the same reasoning `cover-align:` is a key
// and not six more variant names.
const COVER_GROUNDS = ['paper', 'ink'];

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

// The quiet line of a `statement:` chunk. Every line of a statement is one
// size, one weight and one ink - that is what separates the type from every
// other one, where a heading names the slide and the body says something
// under it. The register this was missing is the line that is not the
// utterance: a definition standing over the claim it qualifies, a source
// under it. A keynote wanted exactly that and could not have it, so its
// thesis slide was a `::: draw` of two text elements - a drawing, with a
// drawing's price: no wrap, no hyphenation, no search index, a fixed grid.
//
// The spelling is a paragraph set *entirely* in italic, and "entirely" is
// what makes it a register rather than an accident: a statement with an
// emphasised word in the middle of it is a loud line with a stress mark,
// which is what `*em*` means everywhere else in the format. So the test is
// the rendered paragraph, anchored at both ends, and the `<em>` is left in
// place - the marker and the look are the same thing, which is what makes it
// legible in the source and reversible by deleting two asterisks.
//
// Applied by both renderers, so the document carries the register the
// projection does; `<p class="quiet-line">` is the whole of the contract
// between here and the two stylesheets.
function markQuietStatementLines(html) {
  return String(html).replace(/<p>(<em>[\s\S]*?<\/em>)<\/p>/g,
    (whole, inner) => (/<\/p>|<\/em>[\s\S]*<em>/.test(inner)
      ? whole : `<p class="quiet-line">${inner}</p>`));
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
// markup: a list item is its `- ` line and the lines that continue it, which
// is a rule the author can see, and it needs no HTML walking. Nested items
// are excluded, every line of them, because they are the detail rather than
// the headline and folding them away is the default.
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
  // A compiled figure arrives as html - a <figure> line and the svg's own
  // lines under it, blank-padded - and is a card, not words: counted, its
  // markup landed on the last claim and forced the whole row small.
  //
  // A nested item is the detail, and so is every line of it: its own
  // wrapped continuation used to read as the card's, because only the
  // marker line was skipped - one detail bullet broken over two source
  // lines put its second half on the head and dropped the row a size. A
  // line belongs to the open nested item while no blank line has come
  // between (a lazy continuation, whatever its indent) or while it is
  // indented to the item's text (a second paragraph of it); after a blank,
  // a line indented less is the card's own again. `subCol` is that text
  // column, null when no nested item is open; ordered sub-items count, as
  // they do for `detail` below.
  let inHtml = false, subCol = null, blank = false;
  for (const raw of b.lines) {
    if (isBeatMark(raw)) continue;
    if (inHtml) { if (!raw.trim()) inHtml = false; continue; }
    if (/^\s*<(figure|div|svg)\b/.test(raw)) { inHtml = true; continue; }
    if (/^[-*+]\s+/.test(raw)) { top.push(raw); subCol = null; blank = false; continue; }
    if (!top.length) continue;
    const sub = /^(\s+(?:[-*+]|\d+[.)])\s+)/.exec(raw);
    if (sub) { subCol = sub[1].length; blank = false; continue; }
    if (!raw.trim()) { blank = true; continue; }
    if (subCol !== null) {
      if (!blank || /^\s*/.exec(raw)[0].length >= subCol) { blank = false; continue; }
      subCol = null;
    }
    blank = false;
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
  // A nested list item, ordered or not: `detail` acts on `li ul` AND `li ol`,
  // so an ordered sub-list (`  1.`) is a second level too - counting only
  // `[-*+]` refused a `detail` word that legitimately governs a numbered one.
  const nested = b.lines.some(l => /^\s+(?:[-*+]|\d+[.)])\s+/.test(l));
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
    let inHtml = false;
    for (const raw of b.lines) {
      // A figure's markup passes through whole, as the block it is.
      if (inHtml) { out.push(raw); if (!raw.trim()) inHtml = false; continue; }
      if (/^\s*<(figure|div|svg)\b/.test(raw)) { inHtml = true; out.push(raw); continue; }
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
  // A card's default anchor is `top`. A row's depends on what the term sits
  // on, and that is the whole of this rule: the alignment follows from the
  // ground rather than being a second question about it.
  //
  // On a ground - a fill, an outline, the accent, paper - the term is a
  // visible block, and a block beside a longer body wants centring: this
  // note used to say a one-line term against a three-line body's first line
  // reads as a mistake, and on a slab that is still true. Measured on a
  // four-line body the term's first line sits 66px below the body's, and it
  // reads as a slab placed in the middle of its row, which is what it is.
  //
  // With `clear` there is no slab. The ground also zeroes the padding, so
  // the term is bare words in a column - and bare words centred against a
  // four-line body read as misaligned rather than as placed. On the
  // baseline they read as a hanging indent, which is the typographic form
  // this construction has always been: a term, and its definition beside it.
  //
  // `written` is what tells an authored word from a defaulted one, and this
  // has to run *before* the class list is built, which it did not at first.
  if (b.rows && !o.written.anchor) o.anchor = o.ground === 'clear' ? 'baseline' : 'middle';
  const cls = [b.rows ? 'cards rows' : 'cards', `cards-${b.n}`, `cs-${size}`, `ca-${align}`,
    `cv-${o.anchor}`, `cd-${o.detail}`, `cg-${o.ground}`, `ck-${o.corner}`,
    `cx-${o.scrim}`];
  // A .photo ground, and a scrim over it, are words the drawing ignores
  // unless a card actually carries a picture - and a word that does nothing
  // is a refusal in this format, not a silent no-op. Both are checked against
  // the *written* tail, so `.photo` or `{.veil}` alone is caught even though
  // one draws nothing and the other is the default. `hasPicture` reads the
  // block's own lines: a markdown image, or a compiled <figure>/<svg>/<img>
  // spliced in (a ::: draw figure, an inlined asset).
  const what = b.rows ? 'rows' : 'cards';
  const bad = (msg) => {
    const err = new Error(`::: ${what} in ${b.where}: ${msg}`);
    err.userFacing = true;
    throw err;
  };
  // What the cg-photo ground CSS can actually draw: a markdown image (still
  // markdown here, rendered at the end), an already-spliced figure-img (a
  // raster or an inline svg image), or a bare img. Deliberately NOT a bare
  // <figure>/<svg> - a ::: draw compiles to a figure-diagram whose svg the
  // ground selector never matches, so counting it would let `.photo` on a
  // diagram-only card through as the very no-op this refuses.
  const hasPicture = b.lines.some(l =>
    /!\[[^\]]*\]\([^)]*\)/.test(l) || /class="figure-img"/.test(l) || /<img\b/.test(l));
  // baseline aligns a term with the body beside it, and a card has no body
  // beside it - so on a ::: cards block the word would resolve to something
  // it does not mean. A word that does nothing is a refusal here, not a
  // silent no-op, which is the same rule .photo answers to below.
  if (o.written.anchor && o.anchor === 'baseline' && !b.rows) {
    bad('.baseline lines a term up with the body beside it, and a card has no body beside it.\n' +
        '       Use .top or .middle here, or write ::: rows if the items are term-and-definition pairs.');
  }
  if (o.written.ground && o.ground === 'photo' && !hasPicture) {
    bad('.photo makes a card\'s first image its ground, and no card here carries one.\n' +
        '  Give a card a picture, or drop .photo.');
  }
  if (o.written.scrim && (o.ground !== 'photo' || !hasPicture)) {
    bad('a scrim needs a picture to veil.\n' +
        (o.ground !== 'photo'
          ? `  ${o.scrim} applies to the photo ground; this row is ${o.ground}.`
          : `  ${o.scrim} veils a card's picture, and no card here carries one.`));
  }
  // detail decides what happens to a card's nested level - fold hides it on
  // the projection, show keeps it there, page keeps it to the hand-out. With
  // no nested level there is nothing for the word to act on, so a written one
  // is refused the way a groundless scrim is.
  if (o.written.detail && !nested) {
    bad(`detail: ${o.detail} decides what happens to a card's nested level, and no\n` +
        '  card here has one. Add a nested list, or drop the detail word.');
  }
  return `<div class="${cls.join(' ')}">\n${marked.parse(body.join('\n'))}\n</div>`;
}

// Overlay cards live in one absolutely-positioned 3x3 grid covering the
// slide inside its padding, rather than each being positioned on its own.
// That is what makes two cards in one corner stack instead of overlap, and
// it is one element to keep out of the text flow instead of N.
// Whether a chunk's overlays include a panel, read the way the renderer
// reads them. A panel positions itself against the slide, and a chunk with
// no backdrop is only as tall as its text plus a minimum - so the article
// has to be told to take the slide's height, the way one with a picture
// does, or a full-height column comes out as a slab across the middle.
function overlaysHavePanel(overlays) {
  return (overlays || []).some(ov => {
    const t = parseTail(ov.attrs, OVERLAY_SLOTS, '::: overlay', { id: 'none' });
    return !t.problems.length && t.slots.shape.value === 'panel';
  });
}
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
    // lint.js: bad-overlay-panel. A panel reaches an edge, and a corner
    // names two; which one the slab should run along is not a question the
    // renderer can answer for the author.
    if (o.shape === 'panel' && /-/.test(o.place)) {
      const err = new Error(
        `::: overlay {.panel .${o.place}} in ${where}: a panel reaches one edge of the frame, and a\n` +
        '  corner names two. Write left, right, top or bottom for a column or a band,\n' +
        '  or center for the whole frame.');
      err.userFacing = true;
      throw err;
    }
    // lint.js: bad-overlay-height. A band's height is the one dimension a
    // panel does not take from the frame; a column's is the slide's and a
    // card's is its words', so the word would draw nothing there.
    if (o.height !== 'snug' && !(o.shape === 'panel' && (o.place === 'top' || o.place === 'bottom'))) {
      const err = new Error(
        `::: overlay {.${o.height}} in ${where}: a height belongs to a top or bottom panel.\n` +
        '  A column is as tall as the slide and a card as tall as its words, so\n' +
        '  the word has nothing to set. Write  {.bottom .panel .' + o.height + '}.');
      err.userFacing = true;
      throw err;
    }
    const shape = o.shape === 'panel' ? ' ov-panel' : '';
    const height = o.height === 'snug' ? '' : ` ov-h-${o.height}`;
    return `<div class="overlay-card ov-${o.place} ov-${o.ground} ov-w-${o.width}${shape}${height}"${from}>${body}</div>`;
  }).join('\n');
  return `<div class="overlay-layer">\n${cards}\n</div>`;
}

// A ::: dock, shared by the audience and the print renderer. The dock is the
// overlay's vocabulary with the other layout contract - part of the frame,
// and the text column yields to it - so it wears the same ov-<ground> class
// and its own dock-* classes for edge, width and height. `pos` is where the
// slide is in the one numbering: the chunk's number, `firstNum - 0.5` for a
// divider (it stands before the first chunk of its column), null for print,
// which carries no state. A #link in the body is the live marker: it lights
// the item the room is on, so a link that names no slide can never light,
// and that is refused - for print too, because the check stands before the
// state and only the state is skipped there.
function refuseDockLink(where, id) {
  const err = new Error(
    `::: dock in ${where} links #${id}, and no chunk or column carries that id.\n` +
    '  A #link in a dock is the live marker - it lights the item the room is on -\n' +
    '  so a link that names no slide can never light. Fix the id, or write the\n' +
    '  item without a link.');
  err.userFacing = true;
  throw err;
}
function renderDock(dock, where, pos, nums) {
  if (!dock) return '';
  let body = marked.parse(dock.lines.join('\n'));
  const states = [];
  body = body.replace(/<a href="#([^"]+)"/g, (m, id) => {
    const span = nums.byId.get(decodeURIComponent(id));
    if (!span) refuseDockLink(where, id);
    if (pos == null) return m;
    const st = pos < span[0] ? 'next' : pos > span[1] ? 'done' : 'now';
    states.push(st);
    return `<a href="#${id}" data-state="${st}"`;
  });
  // A list nobody has started is a plan, read at full strength - the same
  // rule renderOutlineList applies when now is 0.
  if (states.length && !states.some(st => st !== 'next')) body = body.replace(/ data-state="next"/g, ' data-state="all"');
  const cls = ['dock', `dock-${dock.edge}`, `ov-${dock.ground}`, `dock-w-${dock.width}`,
    dock.height !== 'snug' ? `dock-h-${dock.height}` : ''].filter(Boolean).join(' ');
  const from = dock.from == null ? '' : ` data-from="${dock.from}"`;
  const inh = dock.inherited ? ' data-inherited=""' : '';
  return `<aside class="${cls}"${from}${inh}>${body}</aside>`;
}
// The attributes a chunk with a dock carries on its article. The width word
// rides on the article, not only on the aside, because the reserved track
// is the chunk's padding and the padding resolves --dock-px there.
function dockAttrs(dock) {
  return dock ? ` data-dock="${dock.edge}" data-dock-w="${dock.width}"` : '';
}

// A token the hyphenation dictionary has no business in. Three shapes, and
// each one was a defect on a real slide:
//
//   a dot between two word characters   bakule.de, 10.1109/SP, §4.5, z.B.
//   a slash anywhere in the token       Z/PQM, and/or, assets/room.jpg
//   a no-break space inside it          n = 4 910, 12 kW, Art. 5
//
// The third is the one that looks odd and is not: a no-break space is the
// author joining two halves into one token, and a dictionary that can reach
// inside the group can break what was joined. `\s` in JavaScript matches
// U+00A0, so the token class has to name the two spaces explicitly or the
// match stops at the very character it is there for.
//
// `<` and `>` cannot occur - the text arrives escaped - but they are excluded
// anyway, so that a stray angle bracket can never put a span inside a tag.
const ADDRESS_TOKEN = /(?:[^\s<>]|[  ])*(?:[A-Za-z0-9À-ɏ]\.[A-Za-z0-9À-ɏ]|\/|[  ])(?:[^\s<>]|[  ])*/g;
function markAddresses(text) {
  return String(text).replace(ADDRESS_TOKEN, (tok) =>
    // A token with no letter or digit in it has no syllables either - the
    // lone slash in "Handreichung / Z/PQM" is punctuation, and wrapping it
    // would put a span in the output that protects nothing.
    (/[A-Za-z0-9À-ɏ]/.test(tok) ? `<span class="nohy">${tok}</span>` : tok));
}

// ── marked renderer overrides (code highlighting + image shorthand) ──

// Which side of a spaced code span keeps its margin. The spaced look puts a
// margin on both sides of a span with a space in it, and that margin is only
// right next to a space. At the head of a paragraph, a list item, a table
// cell or a row's body it is an indent: the line starts a quarter em to the
// right of the lines under it. Glued to a character - "`inf upload`:" or
// "(`a b`)" - it is a gap before the colon, or after the bracket, that reads
// as a typo. No selector can see either - :first-child counts elements and
// does not see a text node - so the build marks the span, the way the
// codespan renderer marks .nb: .lead drops the left margin, .trail the
// right. Only a bare span is looked at (a .nb span carries no margin), and a
// code span's text is escaped and holds no tag, so [^<]* is the whole of it;
// a listing is preceded by its pre and never by one of these openers. A tag
// next to the span is not a character (</strong>: stays as it is), and a
// no-break space is a space, though it arrives as an entity like a glued
// quote does.
const CODE_SPAN_RE = /(<(?:p|li|td|th|dd)(?:\s[^>]*)?>|<span class="row-body">|<br\s*\/?>)?(\s*)<code>([^<]*)<\/code>/g;
const CODE_SEP = String.raw`[\s<>]|&(?:nbsp|#160|#x0*a0);`;
const CODE_SEP_BEFORE = new RegExp(`(?:^|${CODE_SEP})$`, 'i');
const CODE_SEP_AFTER = new RegExp(`^(?:$|${CODE_SEP})`, 'i');
const gluedBefore = (s, at) => !CODE_SEP_BEFORE.test(s.slice(Math.max(0, at - 10), at));
const gluedAfter = (s, end) => !CODE_SEP_AFTER.test(s.slice(end, end + 10));
marked.use({
  hooks: {
    postprocess(html) {
      if (!html.includes('<code>')) return html;
      return html.replace(CODE_SPAN_RE, (m, opener = '', ws, body, at, s) => {
        const lead = opener || (!ws && gluedBefore(s, at));
        const trail = gluedAfter(s, at + m.length);
        if (!lead && !trail) return m;
        const cls = [lead && 'lead', trail && 'trail'].filter(Boolean).join(' ');
        return `${opener}${ws}<code class="${cls}">${body}</code>`;
      });
    },
  },
});

// Whether a `### Heading {#id}` gives its heading the id. Set by
// renderDocument for the length of its render and nowhere else: the
// documents carry each chunk once, where the cockpit draws a chunk in more
// than one place and an id there would be two elements with one name. Every
// view takes the brace off the words either way (HEADING_ID_TAIL_RE).
let documentHeadingIds = false;
marked.use({
  renderer: {
    // Byte for byte marked's own heading, plus the id. A level-1 or level-2
    // heading in a body is not touched: those are structure everywhere but
    // inside an aside, and their tails belong to parseTail.
    heading(text, level) {
      const m = level >= 3 ? HEADING_ID_TAIL_RE.exec(text) : null;
      if (!m) return `<h${level}>${text}</h${level}>\n`;
      const headingId = m[1];
      const idAttr = documentHeadingIds ? ` id="${escapeHtml(headingId)}"` : '';
      return `<h${level}${idAttr}>${text.slice(0, m.index)}</h${level}>\n`;
    },
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
    // The one thing `hyphens: auto` cannot be told in CSS: which tokens are
    // not words. A hyphenation dictionary breaks at syllables and reads a dot
    // and a slash as word boundaries, so under `hyphenate: all` a keynote's
    // address came out as `pro-jekt-bakule.de` and `Handreichung / Z/PQM`
    // split across the slash. There is no selector for "this run of
    // characters", so the build marks them instead, and only when the deck
    // asked for the dictionary at all.
    //
    // A renderer override and not a pass over the finished HTML: this is
    // handed the text of one text token, already escaped, with no tag and no
    // attribute anywhere in it - a code span, a link href and an image's alt
    // all arrive through other renderers. A regex over rendered markup would
    // have had to know that, and would have been wrong once.
    text(t) {
      return addressSpansOn ? markAddresses(t) : t;
    },
    image(href, title, text) {
      // Shorthand: bare id (no slash, no extension) → assets/<id>.<ext>
      const isShorthand = href && !/[\\/]/.test(href) && !/\.[a-z0-9]+$/i.test(href);
      if (isShorthand) {
        const resolved = resolveFigId(href);
        if (resolved) {
          const absResolved = path.join(currentSourceDir, resolved);
          // Recorded whether or not this build inlines: with inlining off the
          // file is not read, but the deck still names it, and a deck is
          // refused or not by what it names (the linter cannot know the flag).
          assetAllowed(absResolved);
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
      // A true relative path that names no file on disk is a typo, not an
      // intentional external ref (those are http(s), data:, // and root
      // absolute, all excluded above). Shipping the raw string as an external
      // src is a broken figure wherever the output travels alone, so give it
      // the same visible placeholder the shorthand branch gives a missing
      // asset, and record it for the one warning at the end of the build. The
      // most common way to trip this is writing the extension on a name meant
      // for the assets/ shorthand: `![](chain.jpg)` is an explicit path (the
      // extension takes it out of the shorthand), and the file is in assets/.
      // A ?query or #fragment is a cache-buster on the served URL, not part of
      // the file name (the isSvgPath and video tests already read [?#]), so it
      // is stripped before the existence test - otherwise `![](assets/x.png?v=2)`
      // stated a file that cannot exist and fell to the placeholder.
      const hrefFile = href.replace(/[?#].*$/, '');
      if (isRelative && !assetOnDisk(path.resolve(currentSourceDir, hrefFile))) {
        UNRESOLVED_ASSETS.add(href);
        const alt = escapeHtml(text || '');
        return `<figure class="figure-img figure-missing" data-fig-id="${escapeHtml(href)}">`
          + `<div class="figure-missing-placeholder">missing: ${escapeHtml(href)}</div>`
          + (text ? `<figcaption>${alt}</figcaption>` : '') + '</figure>';
      }
      const isSvgPath = href && /\.svg(?:[?#]|$)/i.test(href);
      if (inlineAssetsEnabled && isRelative && isSvgPath) {
        const abs = path.resolve(currentSourceDir, hrefFile);
        const svg = inlineSvg(abs, { alt: text || '', title: title || '' });
        if (svg) return svg;
      }
      let src = href;
      // Inline only true relative paths from disk; leave external URLs,
      // existing data URIs, and root-absolute paths untouched.
      if (inlineAssetsEnabled && isRelative) {
        const inlined = toDataUri(path.resolve(currentSourceDir, hrefFile));
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
        // A local clip not inlined goes where the shorthand's does: into
        // videos/ beside the output. It used to keep the path it was written
        // with, which the summary then reported as staged.
        if (isRelative && !src.startsWith('data:')) {
          const staged = stageVideo(path.resolve(currentSourceDir, hrefFile));
          if (staged.rel) src = staged.rel;
        }
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
// step runtime are runtime/diagram.css and runtime/diagram.js, read as text
// and inlined into the output like every other stylesheet and runtime the
// build ships (PLAN-runtime-extraction.md).

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
  // Thrown rather than returned as null, which the compiler would report as
  // an image it "cannot find".
  const refuse = () => { throw assetsConfinedError(OUTSIDE_ASSETS, currentSourceDir); };
  if (direct && !assetAllowed(direct)) refuse();
  if (direct && fs.existsSync(direct)) rel = ref;
  else rel = resolveFigId(ref);
  if (!rel) return null;
  if (!assetAllowed(path.join(currentSourceDir, rel))) refuse();
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
      const rootId = (spliced.match(/\bid="(psiINT-fig-\d+-root)"/) || [])[1];
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
        const sym = { id: `psiINT-sym-${++dgSymbolCounter}`, emitted: true };
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
//
// Every one of these texts, and the runtime scripts and stylesheets the
// renderers splice in (the files in runtime/, which were literals in this
// file until they moved out), goes
// through shipJs / shipCss on the way: their comments are the project's
// documentation and about 740 KB of every live view, so they stay in the
// source and out of the output (strip-comments.mjs). Third-party text - the
// QR encoder, pulse-embed.js, KaTeX's sheet - ships as it came, licence
// header and all. PSI_KEEP_COMMENTS=1 ships the comments too, for reading a
// built page in the browser's debugger; nothing else about the output moves.
// Memoised per text: each text is the same string on every build of a
// --watch run, so the strip is paid once per process.
const KEEP_COMMENTS = process.env.PSI_KEEP_COMMENTS === '1';
const shippedJs = new Map();
const shippedCss = new Map();
function shipJs(text) {
  if (KEEP_COMMENTS || !text) return text;
  let out = shippedJs.get(text);
  if (out === undefined) shippedJs.set(text, out = stripJs(text));
  return out;
}
function shipCss(text) {
  if (KEEP_COMMENTS || !text) return text;
  let out = shippedCss.get(text);
  if (out === undefined) shippedCss.set(text, out = stripCss(text));
  return out;
}
// A runtime/ file whose literal had substitutions holds a placeholder where
// each one stood (PLAN-runtime-extraction.md, "Substitution scheme"), and
// its getter fills them here, before shipJs / shipCss, so the strip and its
// memo see the same string the literal evaluated to. A placeholder is
// __PSI_NAME__: capitals, digits and single underscores, with no capital,
// digit or underscore straight after it, so where a name ends is never a
// guess. That is an identifier to JavaScript and to CSS, valid in a string,
// a value, an expression and a selector, and not a comment, so a strip would
// not make one vanish. Written as a whole comment, /*__PSI_NAME__*/, the
// comment is what is replaced: the form for a generated block, where only a
// comment keeps the file valid. The values are a table of name to string or
// finite number, rendered with String() – what a template literal's
// coercion did. Strict, because an unfilled placeholder ships a wrong value
// with exit 0: a placeholder without a value, a value no placeholder uses, a
// value of another type and any __PSI_ that is not a placeholder all throw.
// A defect in the build, not the author's to fix, so not userFacing. `where`
// is the file's URL (or a name); the message names runtime/<file>.
function fillRuntime(where, text, values) {
  const file = String(where).replace(/^.*\/(?=runtime\/)/, '');
  const slot = /\/\*__PSI_([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)__\*\/|__PSI_([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)__(?![A-Z0-9_])/g;
  const starts = new Set();
  for (const m of text.matchAll(slot)) starts.add(m[1] ? m.index + 2 : m.index);
  for (let i = text.indexOf('__PSI_'); i >= 0; i = text.indexOf('__PSI_', i + 1)) {
    if (!starts.has(i)) {
      throw new Error(`${file}: "${text.slice(i, i + 40).split('\n')[0]}" is not a placeholder – __PSI_, capitals, digits and single underscores, __, and no capital, digit or underscore after it`);
    }
  }
  const used = new Set();
  const out = text.replace(slot, (m, inComment, bare) => {
    const name = inComment || bare;
    if (!Object.hasOwn(values, name)) throw new Error(`${file}: placeholder __PSI_${name}__ has no value`);
    const v = values[name];
    if (!(typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) {
      throw new Error(`${file}: the value for __PSI_${name}__ is ${Array.isArray(v) ? 'an array' : typeof v === 'number' ? v : typeof v}, not a string or a finite number`);
    }
    used.add(name);
    return String(v);
  });
  const unused = Object.keys(values).filter(k => !used.has(k));
  if (unused.length) throw new Error(`${file}: no placeholder for ${unused.map(k => `__PSI_${k}__`).join(', ')}`);
  return out;
}
const DIAGRAM_CORE_PATH = new URL('./diagram-core.mjs', import.meta.url);
function diagramCoreScript() {
  const text = shipJs(fs.readFileSync(DIAGRAM_CORE_PATH, 'utf8'));
  const names = [...text.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]);
  const plain = text
    .replace(/^export\s+(function|const|let)\s/gm, '$1 ')
    .replace(/<\/(script)/gi, '<\\/$1');
  return `window.PSI_DG = (function () {\n${plain}\nreturn { ${names.join(', ')} };\n})();`;
}
let diagramCoreCache = null;
const diagramCoreJs = () => (diagramCoreCache ??= diagramCoreScript());

// The cue-card grammar, same treatment: the cockpit derives the cards from
// the note text at run time (an override typed into the textarea during a
// rehearsal goes the same way as the source), so the one function that does
// it is read from cue-cards.mjs as text and lands as window.PSI_CARDS. Its
// regexes stay out of every template literal that way.
const CUE_CARDS_PATH = new URL('./cue-cards.mjs', import.meta.url);
function cueCardsScript() {
  const text = shipJs(fs.readFileSync(CUE_CARDS_PATH, 'utf8'));
  const names = [...text.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]);
  const plain = text
    .replace(/^export\s+(function|const|let)\s/gm, '$1 ')
    .replace(/<\/(script)/gi, '<\\/$1');
  return `window.PSI_CARDS = (function () {\n${plain}\nreturn { ${names.join(', ')} };\n})();`;
}
let cueCardsCache = null;
const cueCardsJs = () => (cueCardsCache ??= cueCardsScript());

// The command table, same treatment again: the key map in runtime/audience.js looks
// a press up in it and the panel is rendered from it, so the one text has to
// be in Node and in the page. It lands as window.PSI_COMMANDS in both live
// views, in a script element of its own ahead of the runtime.
const COMMANDS_PATH = new URL('./commands.mjs', import.meta.url);
function commandsScript() {
  const text = shipJs(fs.readFileSync(COMMANDS_PATH, 'utf8'));
  const names = [...text.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]);
  const plain = text
    .replace(/^export\s+(function|const|let)\s/gm, '$1 ')
    .replace(/<\/(script)/gi, '<\\/$1');
  return `window.PSI_COMMANDS = (function () {\n${plain}\nreturn { ${names.join(', ')} };\n})();`;
}
let commandsCache = null;
const commandsJs = () => (commandsCache ??= commandsScript());

// Pulse Embed v2, the self-test widget for ::: pulse, same treatment: a
// verbatim copy of the client the Pulse server publishes (its header names
// the version), inlined into the documents that have a question and into no
// other view, so a document still opens from file:// and fetches nothing
// until its reader signs in. Updating it is copying the new file over.
const PULSE_EMBED_PATH = new URL('./pulse-embed.js', import.meta.url);
const PULSE_HOST = 'https://pulse.psi.uni-bamberg.de';
let pulseEmbedCache = null;
const pulseEmbedJs = () => (pulseEmbedCache ??= fs.readFileSync(PULSE_EMBED_PATH, 'utf8')
  .replace(/<\/(script)/gi, '<\\/$1'));

// The editor UI and its chrome, same treatment and for the same reason: read
// as text, so a backtick or a regex backslash in it means what it says.
const EDITOR_JS_PATH = new URL('./editor.mjs', import.meta.url);
const EDITOR_CSS_PATH = new URL('./editor.css', import.meta.url);
let editorJsCache = null;
const editorJs = () => (editorJsCache ??= shipJs(fs.readFileSync(EDITOR_JS_PATH, 'utf8'))
  .replace(/<\/(script)/gi, '<\\/$1'));
let editorCssCache = null;
const editorCss = () => (editorCssCache ??= fs.readFileSync(EDITOR_CSS_PATH, 'utf8'));
// What a view is handed; editorCss() stays the source, which the stylesheet
// check reads.
const editorCssShipped = () => shipCss(editorCss());

// The QR encoder, for the live annotation. Build-time codes (qrSvg) stay as
// they are - a lecture's links are known when it is built. The one address
// that is not is the one typed into an annotation mid-talk, so both live
// views carry the very encoder the build uses, read out of node_modules as
// text for the reason diagram-core.mjs is: no template literal, so no
// escape to get wrong, and the same maths on both sides of the build. Its
// UMD wrapper leaves a global named qrcode when loaded as a plain script.
// 56 KB per live view; print pays nothing.
// Resolved as the package, not the file: its exports map hides the path.
const QR_LIB_PATH = nodeRequire.resolve('qrcode-generator');
let qrLibCache = null;
const qrLibJs = () => (qrLibCache ??= fs.readFileSync(QR_LIB_PATH, 'utf8')
  .replace(/<\/(script)/gi, '<\\/$1'));

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

// ── the canvas a figure is laid out on ───────────────────────────────
// **A slide has a fixed canvas, and a figure is drawn on it.** That is the
// whole of this section, and it replaces the arrangement where a `::: draw`
// viewBox hugged its own content: the live views size a drawing from the
// viewBox measured in labels, so a figure 21 labels wide got big type, one 55
// wide pulled the whole slide down to small type, and a deck of twenty figure
// slides looked like twenty different decks. PowerPoint's canvas is fixed per
// slide and the mess there starts when someone drags one figure bigger; here
// the engine was dragging every figure, by deriving the box from the drawing.
//
// So every `::: draw` in a chunk's own body gets a canvas, and it is the same
// box on every ordinary slide of a deck: the chunk's column wide and
// FIG_CANVAS_H_LABELS label-heights tall, which is one fixed rectangle of
// slide whatever the drawing inside it turns out to be.
//
// **It changes no drawing's rendered size.** The canvas is exactly the width
// at which a base label lands at the size of the words beside it, so a figure
// that fits inside it is drawn at precisely the scale it was drawn at before
// and only the box round it grows; a figure past it is drawn exactly as it
// was too, because the box is the union of the two. What the canvas adds is a
// measurable claim - this much slide is a figure's - and therefore two things
// the build can say about a drawing that it could not say before.
//
// The column widths are measured, not derived: .chunk is a
// `1fr minmax(0, --content-w) 1fr` grid inside 14% padding either side, so a
// class wider than the frame allows is clipped to it. Read off a built
// audience.html at 1600x900: .wide comes out at the frame's 1152 px rather
// than its nominal 52em, and .full, which pads 6% instead of 14%, at 1408 px
// rather than 72em. Re-measure them if --slide-pad-x or the em changes.
//
// **.bleed is the one column that is derived**, because there is nothing to
// measure: the chunk pads nothing and its column is the frame, so the figure's
// column is the reference viewport's own width.
const FIG_REF_SLIDE_W_PX = 1600;                   // the reference viewport's width
const FIG_COLUMN_PX = { narrow: 655, standard: 842, wide: 1152, full: 1408, bleed: FIG_REF_SLIDE_W_PX };
// **And the em a figure stands in is not 1rem.** 1rem is
// clamp(20px, --slide-h * 0.026, 38px) = 23.4 px at 1600x900, but a chunk
// body is `1rem * --zoom * --body-scale` and --zoom's own default is 1.35, so
// the em the width rule multiplies is 31.6 px on an ordinary slide. Reading
// the rem here instead is off by that factor in the direction that hurts: it
// would make every canvas a quarter too wide, the labels inside it a quarter
// smaller than the words beside them, and undo the one rule this file's
// sizing exists to keep - a label is a word.
//
// Verified against the browser on a keynote's twenty figures: with 31.6 as
// the ceiling, figureSettle's predicted body type lands within 0.8 px of what
// --check-fit measured on every one of them.
const FIG_REF_REM_PX = 23.4;                       // 1rem at 1600x900
const FIG_REF_ZOOM = 1.35;                         // the live views' own default --zoom
// ...and the coefficient the chunk's own type puts in front of it. These are
// the `--body-fs:` rules of runtime/audience.css, mirrored by hand because a
// stylesheet cannot be read from here - held against those rules by
// `node test/gates/run.mjs canvas`, which greps them out of that file as text.
// A `statement` chunk sizes its body from --statement-size, which is a
// composition's own number rather than a coefficient, so it is not in the
// table and takes the default; its figure is sized against the ordinary body
// em and comes out a little narrow or a little capped, which is the one case
// this table cannot answer without inventing a number.
const FIG_BODY_REM = { principle: 1.2, question: 1.15, figure: 0.9 };
// The em a figure in a chunk of this type stands in, at 1600x900 and the
// default zoom. Everything about the canvas is measured in it.
function figureRefEm(tag) {
  return FIG_REF_REM_PX * FIG_REF_ZOOM * (FIG_BODY_REM[tag] || 1);
}
const FIG_REF_BODY_PX = FIG_REF_REM_PX * FIG_REF_ZOOM;   // 31.59, the ordinary chunk's em
// **How much of the slide's height a live figure may take, per tier.** One
// table, mirrored by four stylesheet rules that set `--fig-cap` (the base
// value written as the fallback in runtime/diagram.css and in
// `--dg-box-w`, plus `.chunk[data-canvas-tier=picture]`,
// `.chunk[data-canvas-tier=bleed]` and the stacked divider's) and held
// against them by `node test/gates/run.mjs canvas`. The reasoning for each
// number is beside the label count it belongs to, under FIG_CANVAS_H_LABELS.
const FIG_CAP = { chunk: 0.62, picture: 0.79, stack: 0.72, bleed: 1 };
const FIG_REF_SLIDE_H_PX = 900;                    // the reference viewport's height
// The height cap of one tier at that viewport, in px.
function figureCapPx(tier) {
  return FIG_REF_SLIDE_H_PX * (FIG_CAP[tier] || FIG_CAP.chunk);
}
const FIG_TYPE_FLOOR_PX = 18;                      // under this, the back row is guessing
// ...and under this share of the deck's own median settled body type, the
// slide is out of step with its neighbours whatever its absolute size. 0.85
// because what a room sees is a heading that changes size from slide to
// slide, and a tenth of a heading is not a change anyone notices while a
// seventh is. Read by --check-fit, which measures the zoom the camera
// actually settled on; with a canvas the build can no longer be out of step
// without overflowing it, and says the latter instead.
const FIG_TYPE_EVEN_TOL = 0.85;

// **Sixteen label-heights, and the measurement is a slide with everything on
// it.** Built a `.wide` chunk with a one-line heading and a sub-heading, two
// lines of prose under the drawing and a one-line `::: footnote`, and
// measured the content box at 1600x900: the furniture costs 383 px (the
// heading pair, two lines at the body's own leading, and the footnote, minus
// the margins they share). Sixteen label-heights is 505 px, so that slide -
// the fullest a figure chunk can be without saying more - stands at 888 px in
// a 900 px frame. It fits, which is the whole of the criterion; eighteen did
// not, and fourteen would have called most of a real keynote's figures too
// big for a slide they are plainly not too big for.
//
// The same number arrived at from the other side: the keynote's twenty
// figures render between 143 and 558 px tall with a median of 505.
//
// The ceiling is 17.7 and it is not a matter of taste: `--dg-box-w` caps a
// figure's width at `--slide-h * 0.62 * --dg-ar`, so a canvas past 62 % of
// the slide is height-capped and comes out narrower than its own column -
// which is the uniformity this exists to produce, lost. `frame WxH` may ask
// for more and will be told by the same cap.
const FIG_CANVAS_H_LABELS = 16;
// **Twenty-two label-heights on a picture slide, and the measurement is a
// slide with nothing on it but the drawing.** The sixteen above is what is
// left beside a heading pair, two lines of prose and a footnote. A chunk
// whose heading is off the slide (`.bare`, or none written) and whose
// on-screen body is one `::: draw` has none of that furniture, and at sixteen
// it stood with a third of the frame empty above and below the figure.
// Measured on such a slide at 1600x900: the chunk pads 44 px top and bottom
// and the figure carries 20 px of margin top and bottom, so the svg may
// physically take 900 - 2 * (44 + 20) = 772 px. Auto-fit is the tighter
// bound: it holds the flow height, the 88 px of chunk padding included,
// under FULL_FIT_FILL = 0.94 of the frame = 846 px, which leaves the svg
// 846 - 88 - 40 = 718 px before the type is stepped down. Twenty-two
// label-heights is 695 px and fits that; twenty-three is 727 px and does not.
//
// Its cap follows from the same rule the sixteen obeys: the canvas has to
// stay under the height cap or `--dg-box-w` narrows it below its own column.
// 695 / 900 = 0.772, so the picture tier's cap is 0.79 (711 px) - above the
// canvas, below the 718 px auto-fit allows.
//
// **The invariant the canvas exists for is untouched: the WIDTH is still the
// chunk's column in every tier.** A figure that fits its canvas therefore
// settles at the body em whichever tier it is on; a picture canvas only
// offers more rows before `figure-overflows-canvas`, never smaller type.
const FIG_CANVAS_H_LABELS_PICTURE = 22;
// Under this share of the canvas's area the slide reads empty. Half, because
// a drawing filling half a box is the point at which the eye stops reading
// the box as full and starts reading it as a box - and because a flatter
// threshold would fire on every legitimately wide, flat figure.
const FIG_UNDERFILL = 0.5;

// The canvas for one figure, in viewBox units, or null for a figure that
// keeps the box that hugs its content.
//
// `frame` is the author's answer and it wins: `WxH` in grid units, the same
// unit the opener's grid is counted in, and `none` for a deck that is a
// catalogue of drawings rather than a talk. Otherwise the default, and the
// default is a pixel box expressed in labels - which is why `figure-type`
// divides both sides. The key says how large a label is against body type, so
// a bigger label is fewer labels in the same column and fewer label-heights
// in the same reserve; the box on the slide is the same box either way, and
// that is the property the whole arrangement rests on.
// A stacked divider's figure may take 0.72 of the slide (its own max-height
// rule), and its canvas says so: 20 labels at the ordinary em against the
// chunk's 16, measured as floor(900 * 0.72 / 31.59). Sized to the box it is
// drawn in, so the overflow and underfill numbers describe that box.
const FIG_CANVAS_H_LABELS_STACK = 20;
// **A `.bleed` chunk's canvas is the frame, and its label count is derived
// rather than chosen.** The other three tiers are a whole number picked under
// a measured bound - what is left beside the furniture, under the padding,
// under what auto-fit leaves. A bleed chunk has no furniture and no padding,
// and fitZoomToChunk gives it the whole frame (fitFill), so there is no bound
// to stay under: the canvas is as tall as the reference viewport, in labels at
// the ordinary em - 900 / 31.59 = 28.49. Written as the division, because a
// rounded 28 would leave 15 px of the frame outside the canvas and a typed
// 28.49 would stop being the frame the day the em moves. Its cap is 1.
//
// The width rule is the same one every tier obeys: the canvas is the chunk's
// column in labels, and this chunk's column is 1600 px (FIG_COLUMN_PX.bleed).
// So a drawing that fits a bleed canvas settles at the body em like any
// other; what the tier adds is room, 50.6 x 28.5 labels of it against a .full
// picture slide's 44.6 x 22.
const FIG_CANVAS_H_LABELS_BLEED = FIG_REF_SLIDE_H_PX / FIG_REF_BODY_PX;
// The label count of each tier, keyed like FIG_CAP.
const FIG_TIER_H_LABELS = {
  chunk: FIG_CANVAS_H_LABELS,
  picture: FIG_CANVAS_H_LABELS_PICTURE,
  stack: FIG_CANVAS_H_LABELS_STACK,
  bleed: FIG_CANVAS_H_LABELS_BLEED,
};
// The height of the ordinary sixteen-label canvas in viewBox units, for a
// figure of this chunk type and multiplier. `figure-underfills-canvas` judges
// a picture slide against it: see reportFigureTypeStatic.
function figureRefCanvasH(tag, ft) {
  const mult = ft > 0 ? ft : 1;
  return (FIG_CANVAS_H_LABELS * FIG_REF_BODY_PX / (figureRefEm(tag) * mult)) * DG_FONT;
}
function figureCanvas({ width, ft, tag, frame, unit, align, hLabels = FIG_CANVAS_H_LABELS }) {
  if (frame === 'none') return null;
  const mult = ft > 0 ? ft : 1;
  const [uw, uh] = unit && unit.length === 2 ? unit : DG_UNIT;
  if (frame) {
    const m = /^([\d.]+)x([\d.]+)$/.exec(frame);
    if (!m) return null;
    return { w: Number(m[1]) * uw, h: Number(m[2]) * uh, align };
  }
  const col = FIG_COLUMN_PX[width || 'standard'];
  if (!col) return null;
  const em = figureRefEm(tag);
  return {
    w: (col / (em * mult)) * DG_FONT,
    h: (hLabels * FIG_REF_BODY_PX / (em * mult)) * DG_FONT,
    align,
  };
}

// Where a figure's slide comes to rest, worked out the way fitZoomToChunk
// arrives at it. The drawing asks for typeW x body x figure-type pixels; the
// box - the column, or the height budget turned into a width - caps that, and
// a capped figure counts as "does not fit", so the zoom walks down until the
// two meet. The resting point is therefore box / (typeW x figure-type) for the
// body type and box / typeW for a base label, and a drawing that never reaches
// its box leaves the slide where the words put it.
//
// That equation is the whole reason a static check can say anything about a
// dynamic camera: there is no browser in it. With a canvas, typeW is the
// canvas's own width in labels, so `body` comes out at exactly the chunk's
// own em for every figure that fits its canvas - which is the uniformity,
// arrived at rather than asserted.
function figureSettle(typeW, ar, width, ft, tag, tier) {
  const col = FIG_COLUMN_PX[width || 'standard'];
  if (!col || !(typeW > 0)) return null;
  // The height budget is the tier's own: a picture slide's figure may stand
  // taller than a chunk's, a stacked divider's too.
  const byHeight = ar > 0 ? figureCapPx(tier) * ar : Infinity;
  const box = Math.min(col, byHeight);
  const mult = ft > 0 ? ft : 1;
  const em = figureRefEm(tag);
  return {
    box, byHeight, col, em,
    body: Math.min(em, box / (typeW * mult)),
    label: Math.min(em * mult, box / typeW),
  };
}

// Every figure the current lecture compiled, with the numbers the report
// needs. Filled by the onSized callback and ruled on once at the end of
// parseLecture. Reset per build alongside dgWarned.
const figureTypeSeen = [];

// The figure-type multiplier in force on one chunk: the deck's, unless the
// chunk's tail answered the key for itself. The class carries per cent, the
// same string the data attribute and the stylesheet trade in, so the one
// division lives here.
function chunkFigureType(chunk, deckFt) {
  const w = chunk && chunk.styleOverrides && chunk.styleOverrides['figure-type'];
  return w ? Number(w) / 100 : (deckFt || 1);
}
// The same question for `blocks`, which decides where the drawing sits inside
// its canvas: on the ink edge under `left`, centred under `center`. It is the
// same word answering the same question one level out, so there is no second
// key for it.
function chunkBlocks(chunk, deckBlocks) {
  const w = chunk && chunk.styleOverrides && chunk.styleOverrides.blocks;
  return w || deckBlocks || 'center';
}

function recordFigureType(sized, width, where, ft, unit, tag, tier = 'chunk') {
  const { typeW, vbW, vbH, canvas, contentW, contentH } = sized;
  // The box the room is shown, which is the canvas where there is one. typeW
  // comes off the print viewBox, so a figure smaller than its canvas would
  // otherwise be settled against a width the live views never use.
  const liveW = canvas ? Math.max(canvas.w, contentW) : vbW;
  const liveH = canvas ? Math.max(canvas.h, contentH) : vbH;
  const ar = liveH ? liveW / liveH : 0;
  const st = figureSettle(liveW / DG_FONT, ar, width, ft, tag, tier);
  if (!st) return;
  figureTypeSeen.push({ typeW: liveW / DG_FONT, ar, width, where, ft: ft > 0 ? ft : 1,
                        canvas, contentW, contentH, unit, tier, tag, ...st });
}

// The three complaints, and the canvas is what makes the first two sayable.
//
// **Over the canvas** is the one a room sees. The canvas is the chunk's
// column at body type, so a drawing past it is capped and pulls its own
// slide's type down and nothing else's: a deck with one dense figure and one
// sparse one read its headings at 25 px and 44 px in consecutive slides,
// measured on a keynote, a factor of 1.76 between two slides of the same
// width class. Every figure that stays inside its canvas settles at the same
// body type by construction, so this is now the only way a figure slide can
// be out of step, and the message says which axis did it.
//
// **Under the canvas** is the opposite and was never said at all: a drawing
// using a third of its box leaves the slide standing two thirds empty, and
// the old hugging viewBox hid it by shrinking the box to fit.
//
// **Under the floor** is the older complaint and still worth saying for a
// figure with no canvas - one under `frame: none`, or in a card, a pane or a
// divider - where nothing else can: a deck whose figures are uniformly small
// is perfectly even, and still unreadable from the back.
//
// One line per chunk. A figure that is both over its canvas and under the
// floor is reported as the former, with the absolute number in the same
// line - two lines about one slide is how a report stops being read.
function reportFigureTypeStatic() {
  if (!figureTypeSeen.length) return;
  const lab = (px) => (px / DG_FONT).toFixed(1);
  for (const f of figureTypeSeen) {
    // What the author would have to write to reserve exactly what this
    // drawing needs, in the vocabulary that can answer it for one figure.
    // Rounded up in grid units to a tenth, because `frame` is counted in the
    // same cells the drawing is.
    const [uw, uh] = f.unit && f.unit.length === 2 ? f.unit : DG_UNIT;
    const fits = (n, u) => (Math.ceil((n / u) * 10) / 10);
    const wants = `frame ${fits(f.contentW, uw)}x${fits(f.contentH, uh)}`;
    if (f.canvas) {
      const overW = f.contentW - f.canvas.w, overH = f.contentH - f.canvas.h;
      if (overW > 0.5 || overH > 0.5) {
        // **The overshoot in the unit the check is made in, and in the unit
        // the drawing is measured in.** It is decided at half a pixel and was
        // reported in base labels to one decimal, so "over by 0.2 across" is
        // anything from 2.3 px to 3.7 px and an author shortening a label
        // against that number builds three times to find out which. A base
        // label is DG_FONT px, so both figures are the same quantity twice
        // and the second one is what an edit is actually measured in - the
        // same unit the two sentences after it already speak.
        const over = (px, axis) => `${lab(px)} ${axis} (${Math.round(px)} px)`;
        const axes = [];
        if (overW > 0.5) axes.push(over(overW, 'across'));
        if (overH > 0.5) axes.push(over(overH, 'down'));
        dgWarn(`figure-overflows-canvas in ${f.where}: the drawing is ${lab(f.contentW)} x`
          + ` ${lab(f.contentH)} labels and its canvas is ${lab(f.canvas.w)} x ${lab(f.canvas.h)}`
          + ` - over by ${axes.join(' and ')}. The canvas is ${f.tier === 'bleed' ? 'the slide frame' : "the chunk's column"} at body type, so a`
          + ` drawing past it takes its own slide's type down with it: about ${f.body.toFixed(0)} px`
          + ` against the ${f.em.toFixed(0)} px every figure slide that fits its canvas settles at,`
          + ` which a room reads as a heading that changes size from slide to slide.`
          + ` Shorter labels, a row moved onto a second line`
          + (f.width === 'wide' || f.width === 'full' || f.width === 'bleed' ? '' : ', a wider column')
          + `, or  ${wants}  on this figure to say the box is meant to be that big.`
          + (f.label < FIG_TYPE_FLOOR_PX
            ? ` Its own labels land at about ${f.label.toFixed(0)} px either way - that is the`
              + ` drawing's width against its box, which no multiplier changes - under the`
              + ` ${FIG_TYPE_FLOOR_PX} px a back row can read.`
            : ''));
        continue;
      }
      // **A picture canvas is room to grow, not a claim that the slide must
      // be two thirds drawing.** The tall tier exists so a figure that needs
      // twenty rows has them; a flat figure that filled the ordinary canvas
      // well reads no emptier for the six label-heights it was offered and
      // did not take. So on a picture slide the fill is judged against the
      // canvas's width times the smaller of its height and the ordinary
      // sixteen-label height - the box every other slide is judged against -
      // and the message says which box it means.
      const judgeH = f.tier === 'picture'
        ? Math.min(f.canvas.h, figureRefCanvasH(f.tag, f.ft)) : f.canvas.h;
      const fill = (f.contentW * f.contentH) / (f.canvas.w * judgeH);
      if (fill < FIG_UNDERFILL) {
        const box = judgeH < f.canvas.h - 0.5
          ? `${lab(f.canvas.w)} x ${lab(judgeH)} - the ordinary ${FIG_CANVAS_H_LABELS}-label box; this`
            + ` picture slide's own canvas runs to ${lab(f.canvas.h)} and is room to grow, not the measure`
          : `${lab(f.canvas.w)} x ${lab(f.canvas.h)}`;
        dgWarn(`figure-underfills-canvas in ${f.where}: the drawing fills ${Math.round(fill * 100)}%`
          + ` of its canvas (${lab(f.contentW)} x ${lab(f.contentH)} labels in ${box}),`
          + ` so the slide reads empty. `
          + (f.tier === 'bleed'
            // A bleed chunk asked for the frame and is judged against all of
            // it. `frame` is refused there, so the answers are the drawing,
            // the multiplier, or giving the frame back.
            ? `More in the drawing, a larger {.figure-type-N}, or .full in place of .bleed`
              + ` (${(FIG_COLUMN_PX.full / (f.em * f.ft)).toFixed(0)} labels across against the frame's`
              + ` ${(FIG_COLUMN_PX.bleed / (f.em * f.ft)).toFixed(0)}) - a .bleed chunk says the drawing is the slide.`
            : `More in the drawing, a narrower column`
              + ` (.standard holds ${(FIG_COLUMN_PX.standard / (f.em * f.ft)).toFixed(0)}`
              + ` labels against .wide's ${(FIG_COLUMN_PX.wide / (f.em * f.ft)).toFixed(0)}),`
              + ` a larger {.figure-type-N}, or  ${wants}  to reserve only what it needs.`));
        continue;
      }
    }
    if (f.label >= FIG_TYPE_FLOOR_PX) continue;
    // Two different drawings reach this, and the fix is not the same one.
    if (f.byHeight < f.col) {
      dgWarn(`figure-type-small in ${f.where}: the figure is ${f.typeW.toFixed(0)} labels wide, and at`
        + ` body-size labels it would stand ${Math.round(f.typeW * f.em / f.ar)} px tall against`
        + ` the ${Math.round(figureCapPx(f.tier))} px a slide allows - so it is scaled to that and its`
        + ` labels land at about ${f.label.toFixed(0)} px at 1600x900, under the ${FIG_TYPE_FLOOR_PX} px a`
        + ` back row can read. Here it is the height cap and not the column that decides the width:`
        + ` less in the drawing, or a flatter arrangement of the same thing.`);
      continue;
    }
    const roomier = f.width === 'wide' || f.width === 'full' || f.width === 'bleed'
      ? 'it is already as wide as the frame allows, so the drawing itself has to give'
      : `.wide would give it ${(FIG_COLUMN_PX.wide / f.typeW).toFixed(0)} px`;
    dgWarn(`figure-type-small in ${f.where}: the figure is ${f.typeW.toFixed(0)} labels wide, so in a`
      + ` .${f.width || 'standard'} column its labels land at about ${f.label.toFixed(0)} px at`
      + ` 1600x900 - under the ${FIG_TYPE_FLOOR_PX} px a back row can read. Fewer grid`
      + ` units or shorter labels, or ${roomier}.`);
  }
}

// ── diagram CSS (shared by all four views) ──────────────────────────
// Everything colours through the page's custom properties, so a diagram
// re-inks with the A theme cycle exactly like an inlined SVG asset does.
// The tones are color-mix over --emph and --ink rather than fixed hues:
// four distinguishable fills that stay inside whichever theme is active,
// instead of a palette imported from a slide deck that only worked on one
// background.
//
// runtime/diagram.css, read as text at build time (PLAN-runtime-extraction.md;
// DIAGRAM_CSS until it left this file), with three placeholders: the two
// opacities a dimmed and a ghosted element's ground is taken down by stand in
// it as __PSI_DG_SOFT_GROUND_DIM__ and __PSI_DG_SOFT_GROUND_GHOST__, and the
// column fills dgBarFillCss() generates as /*__PSI_BAR_FILL_RULES__*/ - the
// comment form, because a bare name among rules would be read as the next
// rule's selector. fillRuntime puts the values there from the table below,
// once per process, before shipCss strips the sheet on its way into all four
// views. Filled, its bytes are the old literal's value, so a view built
// before and after the move is the same file.
const DIAGRAM_CSS_PATH = new URL('./runtime/diagram.css', import.meta.url);
const DIAGRAM_CSS_FILL = {
  DG_SOFT_GROUND_DIM: DG_SOFT_GROUND.dim.toFixed(4),
  DG_SOFT_GROUND_GHOST: DG_SOFT_GROUND.ghost.toFixed(4),
  BAR_FILL_RULES: dgBarFillCss(),
};
let diagramCssCache = null;
const diagramCss = () => (diagramCssCache ??= fillRuntime(DIAGRAM_CSS_PATH, fs.readFileSync(DIAGRAM_CSS_PATH, 'utf8'), DIAGRAM_CSS_FILL));

// ── diagram runtime (inlined into the live views) ───────────────────
// Interpolates the precomputed per-step vectors. There is no layout here
// on purpose: the browser is handed numbers, not a model.
//
// runtime/diagram.js, read as text at build time (PLAN-runtime-extraction.md;
// DIAGRAM_JS until it left this file), with five placeholders. The outline
// table stands in it as a value, `const DG_SHAPES = __PSI_DG_SHAPES__;`, and
// the four functions lifted out of diagram-core.mjs - dgShapeD, dgPathD,
// dgSplineD and dgFullFrames, so the build and the runtime draw and expand a
// beat with one text - each as a line of its own in the comment form,
// /*__PSI_DG_SHAPE_D__*/ and so on, because what goes there is a declaration
// rather than a value. fillRuntime puts the values there from the table
// below, once per process, before shipJs strips the script on its way into
// the audience view and the cockpit. The file is the literal's value, not its
// source text (44 backslashes were escapes the literal resolved), and filled,
// its bytes are that value, so a view built before and after the move is the
// same file.
const DIAGRAM_JS_PATH = new URL('./runtime/diagram.js', import.meta.url);
const DIAGRAM_JS_FILL = {
  DG_SHAPES: JSON.stringify(Object.fromEntries([...DG_SHAPE_CLASSES].map(c => [c, 1]))),
  DG_SHAPE_D: dgShapeD.toString(),
  DG_PATH_D: dgPathD.toString(),
  DG_SPLINE_D: dgSplineD.toString(),
  DG_FULL_FRAMES: dgFullFrames.toString(),
};
let diagramJsCache = null;
const diagramJs = () => (diagramJsCache ??= fillRuntime(DIAGRAM_JS_PATH, fs.readFileSync(DIAGRAM_JS_PATH, 'utf8'), DIAGRAM_JS_FILL));

// ── parsing ──────────────────────────────────────────────────────────

// A heading line's tail, read through the shared parser and refused on the
// first problem. Every class token is recorded, recognised or not, and the
// callers decide what is legal where - a column heading takes an id and
// nothing else, a title chunk refuses a width - because that is a question
// about the line's place in the deck, which the parser cannot see.
function parseAttributeTail(line, { column = false } = {}) {
  const { text, tail, stray } = splitTail(line);
  const what = `{${String(tail ?? '').trim()}} on "${text}"`;
  const t = parseTail(tail, column ? COLUMN_SLOTS : CHUNK_SLOTS, what,
    { id: 'one', classes: column ? 'column' : 'slots' });
  if (stray) t.problems.unshift(strayTailProblem(what, stray));
  if (t.problems.length) {
    const err = new Error(t.problems[0].msg);
    err.userFacing = true;
    throw err;
  }
  const out = { text, classes: t.classes, id: t.id };
  // A `#` heading's tail is a different table with a different question in
  // it, so it leaves here rather than falling through the chunk's slots.
  if (column) {
    if (t.slots.stack.written) out.stack = true;
    if (t.slots.bare.written) out.bare = true;
    return out;
  }
  if (t.slots.width.written) out.width = t.slots.width.value;
  if (t.slots.bare.written) out.bare = true;
  if (t.slots.center.written) out.center = true;
  // Three states, not two: `.middle`, `.top`, and neither - and the third is
  // not a synonym for the second. An unwritten slot leaves `middle`
  // undefined, and flushChunk reads the chunk's shape to answer it.
  if (t.slots.anchor.written) out.middle = t.slots.anchor.value === 'middle';
  for (const key of ['wrap', 'blocks', 'figure-type']) {
    if (!t.slots[key].written) continue;
    (out.styleOverrides ??= {})[key] = CHUNK_STYLE_CLASSES[t.slots[key].value][1];
  }
  return out;
}

// ── where a slide's camera sits, when the author did not say ─────────
//
// Is this slide a picture? The body handed in here has already had the
// asides lifted out of it - a `::: footnote`, a `::: marginalia` and a
// `::: expand` are nodes on the chunk by the time flushChunk asks - and the
// `> note:` blocks with them, so what is left is the slide. One `::: draw`,
// or one image paragraph, and nothing else on it, is a drawing standing on
// the slide; anything else (a sentence, a second directive, a code block) is
// prose with a figure in it, which is a different slide and keeps its head at
// the top.
//
// Deliberately a shape and not a type. `figure:` is the type an author reaches
// for when a chunk is *about* a figure, and in `lectures/diagrams` those
// chunks are two paragraphs explaining a drawing - centring those would move
// the explanation off the top of the frame. `free:` with nothing but a
// `::: draw` in it is the keynote's picture slide, and it is written with
// five different types across the corpus. The shape is what the room sees.
// Read on the body as flushChunk leaves it, which is half rendered and half
// markdown: a `::: draw` is already the compiled `<figure class=figure-diagram>`
// (the DSL is not markdown and is compiled where it is read), a `::: cols` or
// `::: side` is the wrapper `<div>` it emits, and everything else is still the
// author's Markdown. So the figure is matched as an element - it contains no
// second `</figure>`, which is what makes the lazy match safe - and every line
// left over after it is taken out is content on the slide.
function isPictureBody(body) {
  const { pictures, other } = pictureBodyCount(body);
  return pictures === 1 && other === 0;
}
// The two counts behind that answer, for the one caller that has to say WHY
// a body is not a picture (bleedObstacle).
function pictureBodyCount(body) {
  let pictures = 0;
  const rest = String(body).replace(
    /<figure\b[^>]*\bclass="figure-diagram"[^>]*>[\s\S]*?<\/figure>/g,
    () => { pictures++; return ''; });
  let other = 0;
  for (const raw of rest.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // A paragraph that is one image and nothing else - the `![](fig-id)`
    // shorthand as much as an explicit path. A sentence with an image in it
    // is prose.
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(line)) { pictures++; continue; }
    // A comment says nothing to the room. `<!-- linter: ignore … -->` is the
    // one an author writes, and it can stand anywhere in a body.
    if (/^<!--[\s\S]*-->$/.test(line)) continue;
    other++;
  }
  return { pictures, other };
}

// **Is this chunk a picture slide** - a frame with one drawing on it and no
// furniture, which is what earns the tall canvas tier (FIG_CAP.picture)?
// Asked in flushChunk over the raw body lines, before the reveal split, so
// three things isPictureBody is never shown have to be taken out by hand:
//
//   - `---` lines. They are beats, not content, and the finished body has
//     lost them by the time chunkOpensCentred reads it.
//   - the half of the chunk that is not on the screen. A `::: script` block
//     is narration and is hidden while collapsed; a `::: slide` block says
//     that it alone is the screen. `explicit` holds their line ranges, and
//     the rule is lint.js's own for the word budget: the `::: slide` block if
//     there is one, else everything outside `::: script`. Only while the deck
//     opens collapsed - under `collapse: none` both halves are on the slide.
//   - what is lifted out of the body but still takes height in the frame: a
//     `::: footnote` stands under the figure, and a dock at the top or the
//     bottom takes a band of the slide. (An `::: expand` is off the
//     projection, marginalia is beside the column, an overlay lies over it.)
//
// The heading has to be off the slide too: `.bare`, or none written.
function isPictureSlide(chunk, lines, explicit, collapsed, isMark) {
  if (pictureFurniture(chunk)) return false;
  return isPictureBody(pictureScreen(lines, explicit, collapsed, isMark));
}
// What stands in the frame beside the body, or null. The order is the order
// a `bad-bleed` refusal names them in, and lint.js's is the same.
function pictureFurniture(chunk) {
  if (!(chunk.bare || !chunk.heading)) return 'heading';
  if (chunk.tag === 'title' || chunk.tag === 'closing') return 'cover';
  if ((chunk.expansions || []).some(e => e.kind === 'margin')) return 'footnote';
  if (chunk.dock) return 'dock';
  return null;
}
// The half of the raw body that is on the screen, as one string.
function pictureScreen(lines, explicit, collapsed, isMark) {
  let keep = lines.map(() => true);
  if (collapsed && explicit.length) {
    const slides = explicit.filter(r => r.kind === 'slide');
    if (slides.length) {
      keep = lines.map(() => false);
      // Each wrapper is pushed as three lines either end: '', the tag, ''.
      for (const r of slides) for (let i = r.from + 3; i < r.to - 3; i++) keep[i] = true;
    } else {
      for (const r of explicit) for (let i = r.from; i < r.to; i++) keep[i] = false;
    }
  }
  const screen = lines.filter((line, i) => keep[i] && !isMark(line));
  return screen.join('\n');
}

// **Why a `.bleed` chunk is not a picture slide, in the author's words, or
// null when it is one.** `.bleed` takes the chunk's padding and column away
// and hands the frame to one drawing, so it is legal exactly where the tall
// canvas tier is earned - isPictureSlide, the same decision, and it must stay
// the same decision: a second rule about what a picture slide is would be
// two answers to one question. What this adds is only the sentence. lint.js
// mirrors it as `bad-bleed`, in the same order.
function bleedObstacle(chunk, lines, explicit, collapsed, isMark) {
  const furniture = pictureFurniture(chunk);
  if (furniture === 'heading') {
    return 'its heading is on the slide - write {.bare} to keep the heading in the'
      + ' document and off the frame';
  }
  if (furniture === 'cover') return `a ${chunk.tag} chunk is drawn by its cover composition`;
  if (furniture === 'footnote') return 'it carries a ::: footnote, which stands under the figure';
  if (furniture === 'dock') {
    return `it carries a ::: dock${chunk.dock.inherited ? ' (inherited from its # heading)' : ''},`
      + ' which takes a band of the frame';
  }
  const { pictures, other } = pictureBodyCount(pictureScreen(lines, explicit, collapsed, isMark));
  if (pictures > 1) return `it shows ${pictures} figures, and the frame is one drawing's`;
  if (other > 0) {
    return 'there is something on the screen beside the figure - prose, a second block or a'
      + ' layout wrapper. Words on a drawing that fills the frame go in a ::: overlay;'
      + (collapsed
        ? ' narration goes in ::: script'
        : ' and under collapse: none a ::: script block is on the screen too');
  }
  if (pictures === 0) return 'there is no ::: draw on its screen';
  return null;
}

// The answer to `.middle` / `.top` for a chunk that wrote neither. Two shapes
// open framed on what the beat paints: a slide that is a picture, and a
// `statement:`, where the heading and every paragraph are one size and arrive
// one per press - beat 0 of a three-line statement is one line at the top of
// two lines of reserve nobody can see yet. Everything else keeps the top
// anchoring every deck was written against.
function chunkOpensCentred(chunk) {
  if (chunk.tag === 'title' || chunk.tag === 'closing') return false;
  return chunk.tag === 'statement' || isPictureBody(chunk.body);
}

function parseTagPrefix(text) {
  const m = text.match(/^([a-z]+):\s*(.*)$/);
  if (m && VALID_TAGS.has(m[1])) {
    return { tag: m[1], ...splitHeading(m[2].trim()) };
  }
  // A lowercase `word:` prefix that is not one of the eleven types is a typo,
  // not a heading that happens to hold a colon: `## principl: X` fell through
  // here and rendered as the literal heading with no data-tag, so the search
  // index and the speaker lists saw an untyped chunk. lint.js has reported
  // `unknown-type` on exactly this since the tag vocabulary existed; the build
  // rendering what the linter refuses is the direction this project does not
  // allow. The regex demands lowercase, so a real colon heading (`Note: …`) is
  // unaffected; and a `//` after the colon is a URL scheme (`## https://…`),
  // not a type - refusing that with "unknown chunk type" named the wrong thing.
  if (m && !m[2].startsWith('//')) {
    const err = new Error(
      `unknown chunk type '${m[1]}:' in "## ${text}"\n` +
      `  valid types: ${[...VALID_TAGS].join(', ')}\n` +
      '  A `word:` prefix must be one of these; write the heading without a\n' +
      '  colon if you did not mean a type.');
    err.userFacing = true;
    throw err;
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

// A reveal separator below the top level of a chunk. A `---` between two
// top-level blocks splits the body into reveal segments, and a wrapper
// cannot straddle two of those - so inside a ::: side pane, a card row, an
// overlay card or a divider's body the same line becomes this marker
// instead, and the runtime hides everything that follows it inside its
// parent until the beat it stands for. One counter over the whole slide,
// in source order: the left pane's second paragraph, then the right pane's
// first, then the card row under both. Hidden in print by the stylesheet.
const BEAT_MARK = '<div class="beat-mark"></div>';
// A beat marker below the top level, pinned or not. The unpinned form is the
// constant above so that every existing comparison against it still reads.
const beatMark = (from) => from == null ? BEAT_MARK
  : `<div class="beat-mark" data-from="${from}"></div>`;
const isBeatMark = (raw) => /^<div class="beat-mark"/.test(raw);

// Which of the raw segments the renderer ships, as a boolean per raw index.
// Every `---` is a beat: the source's count of separators is the deck's
// count of clicks, and a segment with nothing between two of them is a click
// all the same. It paints nothing new, which is a thing an author writes on
// purpose - the slide stands while the speaker says the next thing, a
// `::: footnote` written in it arrives with it, a backdrop's reveal moves to
// its next place, an overlay held by `from` comes up.
//
// An empty segment used to be dropped, and a real keynote then had five
// clicks fewer than its source asked for: a `> note: from 1` that could
// never fire, footnotes that arrived with the words above them, and a last
// click that was dead. Asides do not change the arithmetic either way - a
// `::: footnote`, a `::: overlay`, a `::: dock` and a `::: backdrop` are
// lifted out of the body, so a segment holding nothing else is empty here
// and is shipped all the same. lint.js reports the one shape that is left,
// a beat with nothing on it and nothing riding it, as `empty-beat`.
//
// Two shapes keep the old answer, because neither of them is a `---`: a
// chunk with no separator and an empty body ships no segment at all, and a
// `title:` or `closing:` chunk is drawn from `body` by renderTitleChunk and
// renders no reveal segments, so a separator there buys no beat to begin
// with. lint.js mirrors this in `segmentsKept`.
function segmentsKept(segments, rendersSegments) {
  if (segments.length < 2 || !rendersSegments) return segments.map(t => t.length > 0);
  return segments.map(() => true);
}

// Whether a chunk renders reveal segments at all - the one question
// segmentsKept still asks about the chunk. A title or closing chunk wears a
// cover composition, which renderTitleChunk draws from `body`.
function chunkRendersSegments(chunk) {
  return chunk.tag !== 'title' && chunk.tag !== 'closing';
}

// Where a position in the chunk body falls among the reveal segments the
// renderer actually ships, as a function of the `at` index into bodyLines.
// Two readers needing the same answer: the cue-card position rule below, and
// a `::: footnote`, which the parser lifts out of the body into a chunk-level
// node and which therefore has to carry its segment as a number rather than
// as a place in the DOM. `kept` is what segmentsKept answered; without it
// the old rule, every non-empty segment, is assumed.
function segmentIndexer(bodyLines, segments, kept) {
  kept = kept || segments.map(s => s.length > 0);
  // raw segment index -> index among the kept ones (or that of the
  // previous kept one, or 0)
  const rawToNonEmpty = [];
  let seen = -1;
  segments.forEach((seg, i) => { if (kept[i]) seen += 1; rawToNonEmpty.push(Math.max(0, seen)); });
  // separator positions: the bodyLines index of every top-level `---`
  const seps = [];
  const fence = fenceTracker();
  bodyLines.forEach((line, i) => {
    if (fence.step(line)) return;
    if (!fence.inside && parseRevealMark(line)) seps.push(i);
  });
  return (at) => rawToNonEmpty[seps.filter(i => i < at).length] ?? 0;
}

// Which reveal segment each speaker note belongs to - the position rule of
// the cockpit's cue-card mode: a note before the first `---` is said while
// beat 1 is on the screen, a note after it while beat 2 is, and so on.
// `at` is the bodyLines index the note stood before, `segments` the raw
// split (empty ones included, because a `---` followed by nothing but a
// note is a real case) and `kept` what segmentsKept answered. Two rules on
// top of the position:
//  - a note in a dropped segment belongs to the previous kept one, and the
//    index is into the kept list, which is what the renderer ships;
//  - a chunk whose notes all sit in its LAST SEGMENT WITH WORDS IN IT has
//    chunk-level notes and gets 0 for every one of them. That is where every
//    deck written before this rule keeps its notes - after the last
//    segment's text - and the position rule alone would put the whole
//    support after the last click. The moment one note stands in an earlier
//    segment, the author is using positions and the rule is off for the
//    chunk.
//    **Words, not the last segment that ships.** Since every `---` buys a
//    beat, a chunk that ends with a separator and nothing after it - the
//    slide standing while the speaker says the next thing - ships an empty
//    segment last, and measuring the rule against that one filed the legacy
//    shape's notes one beat past the text they belong to. Nothing warned.
//    What follows from reading it off the words is that a note standing
//    alone behind a trailing `---` is no longer in the last segment and
//    keeps its position: the author wrote the separator above it, so the
//    note is said on the beat it opens, which is the shape the empty
//    segment exists for.
function noteSegments(bodyLines, segments, noteAt, kept) {
  if (!noteAt || !noteAt.length) return [];
  kept = kept || segments.map(s => s.length > 0);
  const indexAt = segmentIndexer(bodyLines, segments, kept);
  const segs = noteAt.map(at => indexAt(at));
  let last = 0;
  segments.filter((_, i) => kept[i]).forEach((t, i) => { if (t.length) last = i; });
  if (last > 0 && segs.every(k => k === last)) return segs.map(() => 0);
  return segs;

}

// One shape for the clock a `duration:` may take, written once because three
// readers have to agree about it: the sexagesimal restore in `parseLecture`
// puts the author's text back, `talkDuration` reads it, and `lint.js` mirrors
// the same literal by hand (the linter imports nothing from build.js – see
// CLAUDE.md § lint.js is independent). They disagreed once, in the direction
// that merges green: the restore took two digits before the first colon and
// the other two took three, so `duration: 120:00` linted clean, arrived from
// gray-matter as the sexagesimal integer 7200, and was refused by the build
// as a talk of 7200 minutes.
const TALK_CLOCK_SRC = '(?:(\\d{1,2}):)?(\\d{1,3}):(\\d{2})';
const TALK_CLOCK_RE = new RegExp('^' + TALK_CLOCK_SRC + '$');
const TALK_DURATION_LINE_RE = new RegExp(
  '^duration:[ \\t]*(' + TALK_CLOCK_SRC + ')[ \\t]*(?:#.*)?$', 'm');
// And the one shape for the time of day a `start:` takes: 24-hour H:MM or
// HH:MM, nothing after the minutes. Three readers again - the restore in
// `parseLecture` (a bare `start: 14:20` is the sexagesimal integer 860 to
// YAML 1.1), `talkStart`, and the literal `lint.js` mirrors by hand.
const TALK_START_SRC = '(\\d{1,2}):(\\d{2})';
const TALK_START_RE = new RegExp('^' + TALK_START_SRC + '$');
// Wider than the shape on purpose: whatever digits and colons the author
// wrote are put back, so a refusal quotes `14:20:00` and not the 51600 that
// YAML made of it.
const TALK_START_LINE_RE = /^start:[ \t]*([\d:]+)[ \t]*(?:#.*)?$/m;

// The opener the parser writes for a ::: slide block. renderAudienceChunk
// looks for the same string to mark the reveal segment holding one
// (data-explicit), which the collapse CSS and --squint read; one constant,
// so the two cannot come apart.
const SLIDE_EXPLICIT_OPEN = '<div class="slide-explicit">';

function parseLecture(src) {
  // Windows line endings. Every matcher below anchors on `$`, and a `\r`
  // before it made every heading and every directive miss - a CRLF source
  // built to a deck with no chunks and exit 0. Normalised once here, so
  // every byte range this parser records (the editor's patch targets) is in
  // LF coordinates; the watch server normalises the file the same way
  // before it splices.
  src = String(src).replace(/\r\n?/g, '\n');
  const { data: frontmatter, content, matter: fmRaw } = safeMatter(src);
  // `duration: 45:00` is a clock to the author and a sexagesimal integer to
  // YAML 1.1, which is what gray-matter speaks: it arrives as 2700, and
  // talkDuration would read that as minutes. The one key that takes a clock
  // is put back to the text the author wrote, so the bare form and the
  // quoted form mean the same thing. TALK_CLOCK_SRC is the one shape, shared
  // with talkDuration: a restore that read a narrower clock than the reader
  // left `duration: 120:00` arriving as the integer 7200.
  {
    const m = String(fmRaw || '').match(TALK_DURATION_LINE_RE);
    if (m && typeof frontmatter.duration === 'number') frontmatter.duration = m[1];
  }
  // The same for `start: 14:20`, which arrives as 860.
  {
    const m = String(fmRaw || '').match(TALK_START_LINE_RE);
    if (m && typeof frontmatter.start === 'number') frontmatter.start = m[1];
  }
  // The lecture-wide diagram layer, parsed once and handed to every block.
  // Validated here rather than at the first diagram, because a lecture whose
  // frontmatter is wrong should say so even when it has no diagram yet.
  dgLectureTags.clear();
  dgEmittedBlocks.length = 0;
  figureTypeSeen.length = 0;
  // The deck-wide half of the figure's type size, read once so every figure
  // can be settled against the same number. In a try, because the pre-flight
  // in buildOnce is where a bad `style:` value is refused and this must not
  // take that refusal's place - a typo here is reported with its own message
  // a moment later, and a report that throws first would bury it.
  let deckFigureType = 1;
  let deckBlocks = 'center';
  // Read here and not in buildOnce, because the parser renders three bodies
  // itself - a card, an overlay and a dock - and by the time buildOnce has a
  // resolved style block those are already HTML.
  addressSpansOn = false;
  try {
    const st = styleSettings(frontmatter);
    deckFigureType = st['figure-type'] || 1;
    deckBlocks = st.blocks || 'center';
    addressSpansOn = st.hyphenate === 'all';
  } catch (e) { /* the pre-flight says it */ }
  let diagramBase = null;
  // The deck's answer to "how big is a figure's canvas", when it has one:
  // `frame WxH` or `frame none` as a line of the draw-defaults block, which
  // is where everything else lecture-wide about drawings already lives. A
  // figure's own `frame` in its opener wins over it.
  let deckDrawFrame = null;
  if (frontmatter['draw-defaults'] != null) {
    const { layer, frame, errors } = parseDiagramDefaults(frontmatter['draw-defaults']);
    if (errors.length) {
      const err = new Error(
        `Frontmatter: draw-defaults has ${errors.length} problem(s):\n`
        + errors.map(e => `  line ${e.line} of the block: ${e.msg}`).join('\n'));
      err.userFacing = true;
      throw err;
    }
    diagramBase = layer;
    deckDrawFrame = frame || null;
  }
  const columns = [];
  let currentColumn = null;
  let currentChunk = null;
  let bodyLines = [];
  // **A figure in a chunk's own flow is compiled when the chunk closes, not
  // when its `::: draw` does.** Which canvas it is laid out on depends on
  // whether anything follows it on the slide, and that is only known at the
  // next heading. So the closing `:::` leaves a one-line placeholder in
  // bodyLines - one element, exactly where the compiled figure would have
  // gone, so every index into bodyLines (speakerNoteAt, an aside's `at`)
  // stays what it was - and `pendingDraw` holds what the compile needs.
  // settlePendingDraw swaps the placeholder for the figure, in place.
  //
  // At most one is ever pending: the compiler numbers its figures in the
  // order it is called (`psiINT-dg<N>-`), so a second `::: draw` anywhere in
  // the same chunk settles the first at the ordinary tier before it compiles
  // itself. Two drawings are not a picture slide in any case, and the ids
  // come out in source order as they always have.
  let pendingDraw = null;
  // The `::: slide` / `::: script` blocks of the chunk being read, as line
  // ranges into bodyLines: [{kind, from, to}]. Read by isPictureSlide.
  let explicitRanges = [];
  let inFence = false;
  const fence = fenceTracker();  // inFence is fence.inside, read once per line
  let currentExpansion = null; // { label, lines } while inside a ::: expand block
  const pulseKeys = new Map(); // ::: pulse key -> the chunk that first used it (one namespace per lecture)
  let currentOverlay = null;   // { attrs, lines } while inside a ::: overlay block
  let currentDock = null;      // { edge, ground, width, height, scope, from, lines } while inside a ::: dock block
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

  // What may open inside what. Every directive below asks the same question
  // - what is already open around this line - and for a long time nothing
  // answered it: a ::: expand inside ::: cols let the expansion's closer
  // close the columns instead, a --- inside ::: side split the pane's <div>
  // across two reveal segments so the second pane arrived on the first
  // beat, a ::: cols inside ::: overlay put its wrapper in the body and its
  // words in the card, and a ::: draw inside ::: cards printed itself as
  // text. All of it built with exit 0, and none of it was ever a picture an
  // author meant. The corpus nests exactly one thing, a figure in a pane,
  // so these refusals cost no existing lecture a build. lint.js mirrors
  // each one under the code named beside it.
  const chunkRef = () => currentChunk ? (currentChunk.id ? '#' + currentChunk.id : 'a chunk with no id')
    : currentColumn ? (currentColumn.id ? `the divider of column #${currentColumn.id}`
                                        : `the divider of column "${currentColumn.heading}"`)
    : 'a chunk with no id';
  const refuse = (msg) => { const err = new Error(msg); err.userFacing = true; throw err; };
  // Every `---` in this parser goes through one reader, and a refused one is
  // refused here rather than at six call sites. Returns null for a line that
  // is not a reveal marker at all, which is what each caller tests.
  const revealMark = (line) => {
    const m = parseRevealMark(line);
    if (m && m.problems.length) refuse(`${m.problems[0].msg}\n  (${chunkRef()})`);
    return m;
  };
  // The innermost open aside (a captured block) and the innermost open
  // layout wrapper, named the way the author wrote them.
  const openAside = () => currentDock ? '::: dock'
    : currentOverlay ? '::: overlay'
    : currentExpansion ? `::: ${currentExpansion.word}` : null;
  const openLayout = () => layoutStack.length ? `::: ${layoutStack[layoutStack.length - 1].kind}` : null;
  const inLayout = (kind) => layoutStack.some(l => l.kind === kind);
  // The two checks a `from <beat>` token gets, shared by ::: overlay and
  // ::: dock: the wording is the overlay's, the directive is the parameter.
  // A third copy of these two messages would be the reason tails.mjs exists.
  const checkFromBeat = (tok, directive) => {
    if (tok == null) return;
    if (!/^[1-9]\d*$/.test(tok)) {
      const err = new Error(
        `::: ${directive} from ${tok} in ${chunkRef()}.\n` +
        '  `from` takes a whole beat number from 1 up - the beat the block\n' +
        '  arrives on. Beat 0 is the beat the slide opens on, which is what\n' +
        '  writing no `from` already says.');
      err.userFacing = true;
      throw err;
    }
    if (tok === '0') {
      const err = new Error(
        `::: ${directive} from 0 in ${chunkRef()}.\n` +
        '  Beat 0 is the beat the slide opens on, which is what writing no\n' +
        '  `from` already says. Write `from 1` for the next one.');
      err.userFacing = true;
      throw err;
    }
  };
  // ::: dock, read the same way on a chunk and on a divider. Returns true
  // when the line was a dock line - opened, or refused. The overlay's
  // vocabulary with the other layout contract: the dock is part of the
  // frame and the text column yields to it. The tail is read *here* and not
  // in the renderer, because an inherited dock (`.every`) is rendered by
  // print exactly once, so a renderer-side refusal would be unreachable
  // for it; and because inheritance needs `scope` before anything renders.
  const readDockLine = (line) => {
    const dockOpen = line.match(/^:::\s+dock\s*(?:\{([^}]*)\})?\s*(?:from\s+(\S+))?\s*$/);
    if (!dockOpen && /^:::\s+dock\b/.test(line)) {
      refuse(
        `::: dock: "${line.trim()}" is not a line this directive reads.\n` +
        '  It takes an optional {.class} tail and an optional  from <beat>, and\n' +
        '  nothing else:  ::: dock {.left .paper .every}');
    }
    if (!dockOpen) return false;
    // lint.js: nested-directive.
    if (currentDock) {
      refuse(
        `::: dock opened while one is still open (${chunkRef()}).\n` +
        '  A slide has one dock: close the first with a ::: line. If a second\n' +
        '  dock was meant, it cannot be - put its words in the first.');
    }
    // lint.js: unknown-class / same-slot / stray-attribute, via the shared
    // tail parser.
    const d = readTail(dockOpen[1] ?? null, DOCK_SLOTS, 'dock', chunkRef());
    // lint.js: bad-dock-from.
    checkFromBeat(dockOpen[2], 'dock');
    const from = dockOpen[2] == null ? null : Number(dockOpen[2]);
    // lint.js: dock-on-cover. A title or closing slide is framed by its
    // cover composition, which decides where the type and the picture sit.
    if (currentChunk && (currentChunk.tag === 'title' || currentChunk.tag === 'closing')) {
      refuse(
        `::: dock on a ${currentChunk.tag} chunk (${chunkRef()}).\n` +
        '  A title or closing slide is framed by its cover composition, which\n' +
        '  decides where the type and the picture sit. A dock belongs on the\n' +
        '  chunks after it.');
    }
    // lint.js: bad-dock-height. A column is as tall as the slide.
    if (d.height !== 'snug' && (d.edge === 'left' || d.edge === 'right')) {
      refuse(
        `::: dock {.${d.height}} in ${chunkRef()}: a height belongs to a top or bottom dock.\n` +
        '  A column is as tall as the slide, so the word has nothing to set.\n' +
        `  Write  {.bottom .${d.height}}.`);
    }
    // lint.js: dock-scope. Inheritance runs from the part's heading.
    if (currentChunk && d.scope === 'every') {
      refuse(
        `::: dock {.every} in ${chunkRef()}.\n` +
        '  A dock is inherited from the part\'s # heading, not from a chunk: write\n' +
        '  it under the heading, and every chunk of the part carries it.');
    }
    // lint.js: bad-dock-from. A beat is one slide's; an inherited dock is
    // on every slide of the part from the moment each opens.
    if (d.scope === 'every' && from != null) {
      refuse(
        `::: dock {.every} from ${from} (${chunkRef()}).\n` +
        '  An inherited dock is on every slide of the part from the moment each\n' +
        '  opens, and a beat is one slide\'s. Drop from, or drop .every.');
    }
    // lint.js: nested-directive. A dock is part of the frame; an aside is
    // folded under the slide or laid over it.
    if (currentExpansion || currentOverlay) {
      refuse(
        `::: dock inside ${openAside()} (${chunkRef()}).\n` +
        '  A dock is part of the slide\'s frame and an aside is folded under it or\n' +
        '  laid over it, so one cannot hold the other. Close the block first; a\n' +
        '  chunk can carry both side by side.');
    }
    // lint.js: dock-in-layout. Same failure as the overlay's: the wrapper's
    // closing ::: was read as the dock's.
    if (layoutStack.length) {
      refuse(
        `::: dock inside ${openLayout()} (${chunkRef()}).\n` +
        '  A dock is part of the slide\'s frame, so its place in the body means\n' +
        '  nothing - and the block\'s closing ::: was read as the dock\'s. Write the\n' +
        '  dock outside the block, at chunk level.');
    }
    // lint.js: duplicate-dock. One slide has one dock (decision 2 of
    // docs/history/PLAN-dock.md): two docks plus content is a frame, and the corner rule
    // of two edges would be arbitrary.
    const host = currentChunk || currentColumn;
    if (host && host.dock) {
      refuse(
        `A ${currentChunk ? 'chunk' : 'column heading'} has two ::: dock blocks (${chunkRef()}).\n` +
        '  One slide has one dock; the second would silently win. Put the words\n' +
        '  in the first, or move it to another slide.');
    }
    currentDock = { edge: d.edge, ground: d.ground, width: d.width, height: d.height,
                    scope: d.scope, from, lines: [] };
    return true;
  };
  // ::: overlay, read the same way on a chunk and on a divider. Returns true
  // when the line was an overlay line - opened, or refused.
  const readOverlayLine = (line) => {
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
          `::: overlay opened while one is still open (${chunkRef()}).\n` +
          '  An overlay is a block, not a marker: close the first with a ::: line\n' +
          '  before opening the second. Two overlays on one chunk are fine.');
        err.userFacing = true;
        throw err;
      }
      checkFromBeat(overlayOpen[2], 'overlay');
      // lint.js: nested-directive. A dock is part of the frame and an
      // overlay is laid over it; neither holds the other.
      if (currentDock) {
        refuse(
          `::: overlay inside ::: dock (${chunkRef()}).\n` +
          '  A dock is part of the slide\'s frame and an overlay is laid over it,\n' +
          '  so one cannot hold the other. Close the dock first; a chunk can carry\n' +
          '  both side by side.');
      }
      // lint.js: nested-directive / overlay-in-layout. Opened inside an
      // expansion, the overlay used to close it silently (flushExpansion
      // ran here); opened inside a wrapper, the wrapper's closer was
      // taken as the overlay's and the prose after it went into the
      // card. An overlay escapes the content track altogether, so no
      // position inside the body means anything for it.
      if (currentExpansion) {
        refuse(
          `::: overlay inside ::: ${currentExpansion.word} (${chunkRef()}).\n` +
          '  An overlay is laid over the whole slide and an expansion is folded\n' +
          '  under it, so one cannot hold the other. Close the expansion first;\n' +
          '  a chunk can carry both side by side.');
      }
      if (layoutStack.length) {
        refuse(
          `::: overlay inside ${openLayout()} (${chunkRef()}).\n` +
          '  An overlay is laid over the whole slide, so its place in the body\n' +
          '  means nothing - and the block\'s closing ::: was read as the overlay\'s.\n' +
          '  Write the overlay outside the block, at chunk level.');
      }
      currentOverlay = { attrs: overlayOpen[1] ?? null, from: overlayOpen[2] || null, lines: [] };
      return true;
    }
    return false;
  };

  // ::: pulse – one self-test question for the printed document: the question,
  // a line that is exactly ---, the answer. The split is fence-aware for the
  // reason the reveal split is: a --- inside a code sample is the sample's.
  // Exactly one separator and two halves with words in them, because the
  // widget shows the first half as the question and hides the second, and a
  // block with nothing to hide, or with a rule in its answer, would be
  // something else pretending to be a question. lint.js: bad-pulse-split.
  const splitPulse = (blk) => {
    const halves = [[]];
    const fence = fenceTracker();
    for (const l of blk.lines) {
      fence.step(l);
      if (!fence.inside && /^\s*---\s*$/.test(l)) { halves.push([]); continue; }
      halves[halves.length - 1].push(l);
    }
    const [q, a] = halves.map(h => h.join('\n').trim());
    if (halves.length !== 2 || !q || !a) {
      refuse(
        `::: pulse ${blk.key ? `{#${blk.key}} ` : ''}(${chunkRef()}) needs a question, one line that is\n` +
        `  exactly ---, and an answer${halves.length !== 2 ? ` - it has ${halves.length - 1} such line${halves.length === 2 ? '' : 's'}` : ''}${halves.length === 2 ? ', and one half is empty' : ''}.\n` +
        '  Everything above the --- is the question, everything below it the answer.\n' +
        '  For a rule inside either half write ***.');
    }
    return { kind: 'pulse', key: blk.key, question: q, answer: a, at: blk.at };
  };

  const flushExpansion = () => {
    if (!currentExpansion || !currentChunk) return;
    if (currentExpansion.kind === 'pulse') {
      currentChunk.expansions.push(splitPulse(currentExpansion));
      currentExpansion = null;
      return;
    }
    currentChunk.expansions.push({
      label: currentExpansion.label,
      kind: currentExpansion.kind,
      // Where the opener stood in the body, resolved to a segment index at
      // the end of the chunk - the aside itself is out of the body by then.
      at: currentExpansion.at,
      body: currentExpansion.lines.join('\n').trim(),
    });
    currentExpansion = null;
  };

  const flushOverlay = () => {
    const host = currentChunk || currentColumn;
    if (!currentOverlay || !host) return;
    host.overlays.push({
      attrs: currentOverlay.attrs,
      from: currentOverlay.from,
      lines: currentOverlay.lines,
    });
    currentOverlay = null;
  };
  const flushDock = () => {
    const host = currentChunk || currentColumn;
    if (!currentDock || !host) return;
    host.dock = { ...currentDock, inherited: false };
    currentDock = null;
  };

  const flushNoteBlock = () => {
    if (!noteBlock) return;
    // `> note: from 3` pins the block to a beat by number instead of by
    // where it stands. That is the escape hatch for the beats a position
    // cannot name: a diagram's steps are beats on the same counter but
    // they are inside one segment, so no `---` can sit between them. The
    // number counts advances on this slide, as `::: overlay from N` does -
    // 0 is the slide as it opens, 1 is after the first press.
    const pin = /^from\s+(\d+)$/i.exec((noteBlock.lines[0] || '').trim());
    if (pin) { noteBlock.from = Number(pin[1]); noteBlock.lines.shift(); }
    const text = noteBlock.lines.join('\n').trim();
    if (text) {
      if (currentChunk) {
        currentChunk.speakerNotes.push(text);
        // The body line the note stood before. flushChunk turns it into
        // the reveal segment the note belongs to (speakerNoteSegs), which
        // is what the cockpit's cue-card mode reads. The note line itself
        // is never pushed to bodyLines, so this is the index of whatever
        // body line follows it - a `---` right after the note therefore
        // does not count for it.
        currentChunk.speakerNoteAt.push(bodyLines.length);
        currentChunk.speakerNoteFrom.push(noteBlock.from ?? null);
      } else if (currentColumn && currentColumn.heading) {
        // A divider is a slide, and a slide the speaker talks on: it is the
        // camera stop where the room is told what the next part is for. So a
        // note written between a `#` heading and the first `##` is the
        // divider's own. It used to be an orphan and arrived, silently, as
        // the first cue card of the following chunk - the note said "this
        // part is about X" while the projection was already on slide one.
        // A divider has no top-level reveal segments (a `---` under a
        // heading is a beat marker inside one body), so its notes are chunk
        // notes on beat 0 and `from N` is the only way to name a later beat.
        currentColumn.speakerNotes.push(text);
        currentColumn.speakerNoteFrom.push(noteBlock.from ?? null);
      } else pendingNotes.push(text);  // before any heading – attach to the next chunk
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
  // Compile the figure a chunk left pending, on the canvas of the tier its
  // slide turned out to have, and put it where its placeholder stands.
  // `tier` is 'picture' or 'chunk'; under a `frame WxH` the canvas is the
  // author's either way and only the height cap follows the tier.
  const settlePendingDraw = (tier) => {
    const p = pendingDraw;
    if (!p) return;
    pendingDraw = null;
    const at = bodyLines.indexOf(p.placeholder);
    bodyLines[at] = p.render(tier);
  };
  const flushChunk = () => {
    if (!currentChunk) return;
    flushNoteBlock();
    flushAnnotBlock();
    flushOverlay();
    flushDock();
    // Inheritance happens here, once, so the data model says for every
    // slide what is on it and both renderers stay dumb. A chunk's own dock
    // replaces the part's entirely, at whichever edge. The copy shares
    // `lines`; nothing is duplicated.
    if (!currentChunk.dock && currentColumn && currentColumn.dock && currentColumn.dock.scope === 'every') {
      currentChunk.dock = { ...currentColumn.dock, inherited: true };
    }
    // lint.js: marginalia-in-dock. The aside is anchored at the right edge
    // of .chunk-content and runs into the right margin, which a right dock
    // occupies. Checked at the flush and not when the aside opens, because
    // the chunk's own dock may follow it in the body.
    if (currentChunk.hasMarginalia && currentChunk.dock && currentChunk.dock.edge === 'right') {
      refuse(
        `::: marginalia on a slide with a right dock (${chunkRef()}).\n` +
        '  The aside extends into the right margin, which the dock occupies. Put the\n' +
        '  dock on the left, or drop the aside.');
    }
    flushExpansion();
    // The chunk's figure, on the canvas its slide earns. After the dock, the
    // inheritance and the asides above, because all three are part of the
    // answer; before the reveal split below, which reads the compiled body.
    //
    // **`.bleed` is decided here too, and it is the same decision.** The word
    // makes the frame the chunk's column, which is only an answer for a slide
    // that is one drawing and nothing else - so anything isPictureSlide would
    // not call a picture slide is refused, with the reason named, and the
    // figure's own `frame` is refused beside it: both name the canvas, and
    // two answers to one question is what this format does not accept.
    // lint.js: bad-bleed.
    if (currentChunk.width === 'bleed') {
      const collapsed = frontmatter.collapse !== 'none';
      // A figure in a pane, a card or an overlay is not the chunk's own; an
      // image is a photograph, and a photograph that fills the frame is a
      // backdrop.
      const why = bleedObstacle(currentChunk, bodyLines, explicitRanges, collapsed, revealMark)
        || (pendingDraw ? null
          : 'its picture is not a ::: draw in the chunk\'s own flow - an image that fills'
            + ' the frame is ::: backdrop');
      if (why) {
        refuse(
          `.bleed on a chunk that is not one drawing and nothing else (${chunkRef()}): ${why}.\n` +
          '  .bleed makes the slide frame the figure\'s canvas, so it is legal only on a\n' +
          '  picture slide: the heading off the slide ({.bare}, or none written), no\n' +
          '  ::: footnote, no ::: dock, and one ::: draw as the whole on-screen body.\n' +
          '  A ::: backdrop behind it, a ::: overlay on it and a > note: are fine.');
      }
      if (pendingDraw.frame != null) {
        refuse(
          `::: draw … frame ${pendingDraw.frame} in a .bleed chunk (${chunkRef()}).\n` +
          '  Both name the figure\'s canvas: .bleed says it is the slide frame, and\n' +
          '  frame says it is something else. Drop one - the frame from the opener,\n' +
          '  or .bleed from the chunk for .full.');
      }
      currentChunk.canvasTier = 'bleed';
      settlePendingDraw('bleed');
    } else if (pendingDraw) {
      const collapsed = frontmatter.collapse !== 'none';
      const picture = isPictureSlide(currentChunk, bodyLines, explicitRanges, collapsed, revealMark);
      if (picture) currentChunk.canvasTier = 'picture';
      settlePendingDraw(picture ? 'picture' : 'chunk');
    }
    explicitRanges = [];
    // A layout wrapper still open when the slide ends. It used to be closed
    // here without a word, so the build shipped a slide whose columns, pane
    // or ::: slide block ran to the end of the chunk while lint.js reported
    // unclosed-directive - the build accepting what the linter refuses.
    // Refused, in the linter's words; the innermost is the one named, since
    // that is the closer the author left out.
    if (layoutStack.length) {
      const l = layoutStack[layoutStack.length - 1];
      refuse(
        `::: ${l.kind} not closed before the next chunk or column (${chunkRef()}).\n` +
        '  Everything after it up to the next heading was read as its content.\n' +
        '  Add a closing ::: line where the block ends.');
    }
    // Split body at standalone `---` lines into reveal segments (§4.6).
    // A `---` inside a fenced code block stays part of the segment — the
    // `inFence` flag below tracks that.
    const segments = [];
    // What the marker that *opened* each segment pinned it to, aligned with
    // `segments` - null for the opening segment and for every unpinned one.
    // A parallel array rather than a richer element, because `segments` is
    // read as strings in three places; speakerNoteFrom is the same shape for
    // the same reason.
    const segFrom = [null];
    let cur = [];
    const fence = fenceTracker();
    for (const line of bodyLines) {
      if (fence.step(line)) { cur.push(line); continue; }
      const mark = fence.inside ? null : revealMark(line);
      if (mark) {
        segments.push(cur.join('\n').trim());
        segFrom.push(mark.from);
        cur = [];
        continue;
      }
      cur.push(line);
    }
    // The segment after the last `---` exists whether or not a line follows
    // the marker: a trailing `---` straight above the next heading is a beat
    // as much as one with a blank line under it, and it used to be dropped
    // in the first case only (lint.js counted it in both).
    if (cur.length || segments.length) segments.push(cur.join('\n').trim());
    // Every `---` is a beat, so every segment between two of them ships,
    // empty or not: the source's `---` count is the deck's click count.
    // lint.js reports a beat with nothing on it and nothing riding it as
    // `empty-beat`. See segmentsKept.
    const kept = segmentsKept(segments, chunkRendersSegments(currentChunk));
    const keep = segments.map((t, i) => [t, segFrom[i]]).filter((_, i) => kept[i]);
    const nonEmpty = keep.map(([t]) => t);
    currentChunk.segments = nonEmpty;
    currentChunk.segmentFrom = keep.map(([, f]) => f);
    currentChunk.speakerNoteSegs = noteSegments(bodyLines, segments, currentChunk.speakerNoteAt, kept);
    // An aside is lifted out of the body, so it cannot carry a beat marker -
    // a marker's beat is the elements that follow it inside one parent, and
    // the aside has left that parent. It carries the number of the segment it
    // was written in instead, and the live runtime holds it back until that
    // segment is up. Written before the first `---`, or in a chunk with no
    // `---` at all, this is 0 and nothing about the output changes.
    {
      const segAt = segmentIndexer(bodyLines, segments, kept);
      currentChunk.expansions.forEach((e) => {
        e.seg = segAt(e.at || 0);
        // Where a footnote stands among the body's blocks, for the documents'
        // margin (renderChunk, style: {print-marginalia: margin}): the number
        // of top-level blocks written before its opener, counted the way the
        // print body is - every segment joined, the reveal marks out.
        if (e.kind === 'margin') {
          const fence = fenceTracker();
          const before = bodyLines.slice(0, e.at || 0).filter((l) => {
            const fenceLine = fence.step(l);
            return fenceLine || fence.inside || !parseRevealMark(l);
          });
          e.blocksBefore = marked.lexer(before.join('\n')).filter(t => t.type !== 'space').length;
        }
        delete e.at;
      });
    }
    // A pinned note keeps its own number and takes no part in the
    // chunk-level fallback the position rule applies.
    (currentChunk.speakerNoteFrom || []).forEach((f, i) => { if (f != null) currentChunk.speakerNoteSegs[i] = null; });
    delete currentChunk.speakerNoteAt;
    // Print collapses reveals: `body` is every segment joined, so the
    // print renderer can stay oblivious to the reveal split.
    // A document has no clicks to spend an empty segment on, so `body` stays
    // what it was: the segments with words in them, joined.
    currentChunk.body = nonEmpty.filter(t => t.length).join('\n\n');
    // The camera's anchor, answered from the finished body when the author
    // wrote neither `.middle` nor `.top`. Here and not in the renderer,
    // because both live views and --check-fit read the same attribute and a
    // second copy of the rule is how two of them come to disagree.
    if (currentChunk.middle === null) currentChunk.middle = chunkOpensCentred(currentChunk);
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
        // A figure goes wherever it was opened: into the card row being
        // captured, the overlay card, the expansion, the chunk body or the
        // divider. The first two are recent - a ::: draw in an overlay used
        // to land in the body behind it, and one in a card row printed as
        // text - and both are places a figure earns: a small drawing on a
        // card laid over a photograph, three figures side by side.
        const target = cardsBlock ? cardsBlock.lines
          : currentDock ? currentDock.lines
          : currentOverlay ? currentOverlay.lines
          : currentExpansion ? currentExpansion.lines
          : currentChunk ? bodyLines : colBody;
        const dgBody = diagramBlock.lines.join('\n');
        dgEmittedBlocks.push({
          range: [diagramBlock.bodyAt, diagramBlock.bodyAt + dgBody.length],
          body: dgBody,
          chunk: currentChunk ? currentChunk.id : null,
        });
        // Names the slide a broken figure is on. A divider figure has no
        // chunk, and used to be reported as "a chunk with no id" even
        // when its column had one. A local rather than an inline expression
        // because two of the options below want it.
        const dgWhere = currentChunk
          ? (currentChunk.id ? `chunk #${currentChunk.id}`
                             : currentChunk.heading ? `chunk "${currentChunk.heading}"`
                                                    : 'an unnamed chunk')
          : currentColumn
            ? (currentColumn.id ? `the divider of column #${currentColumn.id}`
                                : currentColumn.heading ? `the divider of column "${currentColumn.heading}"`
                                                        : 'an unnamed column divider')
            : 'an unattached diagram';
        // **Which figures get a canvas.** The default canvas is the CHUNK's
        // column at body type, so it is the right box for exactly the figures
        // that have that column: the ones standing in the chunk's own flow.
        // A figure in a card, a pane, a dock, an overlay or an expansion has
        // a fraction of it and would be laid out on a canvas several times
        // its own box; a divider figure has no width class at all and its
        // frame is the slide rather than a text column. Those keep the box
        // that hugs their content, which is what they had before this
        // existed. `::: slide` and `::: script` are not layout: they say
        // which half of the chunk is the screen, and the column is the same
        // either way.
        //
        // **A cover slide is the same case, and it is the one that is not
        // obvious.** A `title:` or `closing:` chunk's body is not in a text
        // column at all: the cover composition places it, and which box that
        // is depends on the variant - `beside` and `above` hand it to the
        // art panel that `cover-ratio` divides the frame with, `masthead`
        // and `quote` set it as a field beside the title pair, and the rest
        // draw no body. So there is no one column to measure, and the chunk
        // canvas is several times too wide and far too short: measured on
        // `lectures/python-intro`, whose `cover: beside` puts four stacked
        // boxes in a 34% panel that runs the whole height of the slide, the
        // build reserved a `.standard` column 16 labels tall and warned
        // `figure-overflows-canvas` about a drawing that is comfortably
        // inside its actual panel. A cover figure keeps the box that hugs
        // it, like a figure in a card.
        const dgUnit = diagramBlock.unit
          ? diagramBlock.unit.split('x').map(Number) : DG_UNIT.slice();
        const dgInFlow = !!currentChunk && !cardsBlock && !currentDock && !currentOverlay
          && !currentExpansion
          && currentChunk.tag !== 'title' && currentChunk.tag !== 'closing'
          && layoutStack.every(l => l.kind === 'slide' || l.kind === 'script');
        // One divider does have a column: `# Heading {.stack}` sets its body
        // at the .full measure, and a keynote that opens each part on a
        // figure there wants that figure at the same type as every other
        // figure slide - measured, the four stacked dividers of one talk
        // settled 26% under the deck while every chunk figure sat on its
        // canvas. So a stacked divider's figure is on the .full canvas; a
        // beside-layout divider still hugs, because its figure shares the
        // frame with the heading.
        const dgStacked = !currentChunk && !!currentColumn && !!currentColumn.stack
          && !cardsBlock && !currentDock && !currentOverlay && !currentExpansion
          && layoutStack.length === 0;
        const dgFt = currentChunk ? chunkFigureType(currentChunk, deckFigureType)
          : (deckFigureType > 0 ? deckFigureType : 1);
        // The tier decides the canvas's height and the height cap that goes
        // with it: 'stack' for a stacked divider, and for a chunk 'chunk' or
        // 'picture' - which is not known yet, so the compile is a function of
        // it. Everything else it needs is captured here, at the closing `:::`,
        // because the parser has moved on by the time it runs: the block, the
        // chunk and the place are the ones this figure was written in.
        const dgBlock = diagramBlock;
        const dgChunk = currentChunk;
        const dgRender = (tier) => {
          const dgCanvas = dgInFlow || dgStacked
            ? figureCanvas({
                width: dgChunk ? dgChunk.width : 'full',
                ft: dgFt,
                tag: dgChunk ? dgChunk.tag : 'free',
                // The figure's own `frame`, else the deck's, else the default.
                // A `.bleed` chunk has answered already: its own `frame` was
                // refused in flushChunk, and the deck's does not reach it -
                // the chunk's word is the more specific answer, exactly as a
                // figure's own `frame` beats the deck's.
                frame: tier === 'bleed' ? null
                  : dgBlock.frame != null ? dgBlock.frame : deckDrawFrame,
                unit: dgUnit,
                align: dgChunk ? chunkBlocks(dgChunk, deckBlocks) : deckBlocks,
                hLabels: FIG_TIER_H_LABELS[tier],
              })
            : null;
          // The compiler learns one thing from the opener, the grid, and takes
          // it as the `unit=WxH` string it always has. The whole opener rides
          // in the payload as one canonical line so the editor can write the
          // block back verbatim without knowing the grammar.
          return withAutoplay(dgBlock.autoplay, dgBlock.cycle, renderDiagram(dgBody, drawCompilerAttrs(dgBlock), {
            // The block body's byte range in source.md. Emitted with the
            // diagram so the editor can patch exactly those bytes back.
            range: [dgBlock.bodyAt, dgBlock.bodyAt + dgBody.length],
            chunk: dgChunk ? dgChunk.id : null,
            width: dgChunk ? dgChunk.width : null,
            opener: formatDrawOpener(dgBlock),
            where: dgWhere,
            canvas: dgCanvas,
            // How the drawing sits in its box and how small its labels land in
            // a room, which only this side knows: the compiler has the viewBox
            // and the caller has the chunk's width class. A divider figure is
            // not held to it - it has no width class and its frame is the
            // slide, not a text column.
            onSized: dgChunk
              ? (sized) => recordFigureType(sized, dgChunk.width, dgWhere, dgFt, dgUnit, dgChunk.tag, tier)
              : dgStacked
                ? (sized) => recordFigureType(sized, 'full', dgWhere, dgFt, dgUnit, 'free', tier)
                : null,
            alt: dgChunk ? dgChunk.heading : '',
            base: diagramBase,
            onCompile: (model) => {
              for (const tag of model.tags.keys()) dgLectureTags.add(tag);
              // A clock with nothing to walk. `autoplay N` advances the
              // figure's steps; a figure with none was a number the drawing
              // ignored, and this format refuses those rather than drops them.
              if (dgBlock.autoplay != null && !model.steps.length) {
                const err = new Error(
                  `::: draw autoplay ${dgBlock.autoplay} on a figure with no step block.\n` +
                  '  autoplay walks the steps, one delay each; write a  step  block, or drop\n' +
                  '  the autoplay.');
                err.userFacing = true;
                throw err;
              }
            },
          }));
        };
        // A figure already waiting in this chunk is no longer alone on its
        // slide, and the compiler numbers figures in call order: it goes
        // first, at the ordinary tier.
        if (pendingDraw) settlePendingDraw('chunk');
        if (dgInFlow && target === bodyLines) {
          // A string isPictureBody counts as a figure, on one line, that no
          // author can have written: the range is this block's own.
          const placeholder = `<figure class="figure-diagram" data-dg-pending="${dgBlock.bodyAt}"></figure>`;
          target.push('', placeholder, '');
          pendingDraw = { placeholder, render: dgRender, frame: dgBlock.frame };
        } else {
          target.push('', dgRender(dgChunk ? 'chunk' : 'stack'), '');
        }
        diagramBlock = null;
      } else {
        diagramBlock.lines.push(line);
      }
      continue;
    }
    fence.step(line, fmOffset + lineStart);
    inFence = fence.inside;

    // A multi-line HTML comment is taken out of the deck, whole: no line in
    // it is a heading, a `---`, a directive or a note (tails.mjs,
    // `commented`), and none of it reaches a view. A heading inside one used
    // to open a chunk, the `-->` landed in the next slide's paragraph as
    // `--&gt;`, and the browser's comment never closed - every later slide
    // gone from all four views. Passed through instead of dropped, it was
    // still at the mercy of every capture mode that splits at a blank line
    // (a card row cut one in two), and a draft parked in it shipped to every
    // reader of the page source. The comment leaves one blank line where it
    // stood, which ends a paragraph the way the HTML block did; text after
    // the `-->` on its closing line stays, as body text. A comment on one
    // line is untouched. lint.js reads it the same way.
    if (fence.commented) {
      if (noteBlock) flushNoteBlock();
      if (annotBlock) flushAnnotBlock();
      const target = cardsBlock ? cardsBlock.lines
        : currentDock ? currentDock.lines
        : currentOverlay ? currentOverlay.lines
        : currentExpansion ? currentExpansion.lines
        : currentChunk ? bodyLines
        : currentColumn ? colBody : null;
      if (target) {
        if (htmlCommentOpens(line)) target.push('');
        if (!fence.inComment) {
          const after = line.slice(line.indexOf('-->') + 3);
          if (after.trim()) target.push(after);
        }
      }
      continue;
    }

    // A card row's body is captured rather than streamed, because choosing
    // its size means counting the words in the longest item - a fact about
    // the source that cannot be recovered from CSS. Fence-aware: a ::: in a
    // code sample inside a card must not close the row.
    //
    // A `> note:` or `> annot:` block is the exception: it is the speaker's
    // or the room's, never a card's, so it leaves the row and falls through
    // to the note reader below, as one in an overlay, a pane or an expansion
    // does. Captured as card text it was a blockquote on the projection and
    // missing from the cockpit. A line after the block that is not a `>` line
    // ends it, as everywhere else. lint.js mirrors the peel.
    const cardNote = !!cardsBlock && !inFence
      && (/^>\s*(?:note|annot):/i.test(line) || (!!(noteBlock || annotBlock) && /^>/.test(line)));
    if (cardsBlock && !cardNote && (noteBlock || annotBlock)) { flushNoteBlock(); flushAnnotBlock(); }
    if (cardsBlock && !cardNote) {
      const cardDraw = inFence ? null : parseDrawOpener(line);
      if (!inFence && /^:::\s*$/.test(line)) {
        const target = currentOverlay ? currentOverlay.lines
          : currentExpansion ? currentExpansion.lines
          : currentChunk ? bodyLines : colBody;
        target.push('', renderCardsBlock(cardsBlock), '');
        cardsBlock = null;
      } else if (!inFence && revealMark(line)) {
        // A row that arrives card by card.
        cardsBlock.lines.push('', beatMark(revealMark(line).from), '');
      } else if (cardDraw) {
        // A figure is a card. In the block form of a row every top-level
        // block is one card, so the figure stands in a card of its own,
        // beside the text cards - which is what three small figures side
        // by side, or a figure next to two claims, need. The compiled svg is
        // an html block to marked and passes through renderCardsBlock like
        // a paragraph would.
        refuseDrawOpener(cardDraw);
        diagramBlock = { unit: cardDraw.unit, frame: cardDraw.frame, autoplay: cardDraw.autoplay, cycle: cardDraw.cycle,
                         lines: [], bodyAt: fmOffset + lineAt };
      } else if (!inFence && /^:::\s+\S/.test(line)) {
        // lint.js: directive-in-cards. The body is captured, not parsed, so a
        // directive in a card was printed on the slide as its own text and
        // its closer ended the row early - every item after it fell out of
        // the grid.
        const kw = cardsBlock.rows ? 'rows' : 'cards';
        refuse(
          `${line.trim().split(/\s+/).slice(0, 2).join(' ')} inside ::: ${kw} (${cardsBlock.where}).\n` +
          '  A card holds prose - paragraphs, a list, an image - and no directive:\n' +
          '  the row\'s body is read as text, so the directive printed itself on the\n' +
          '  slide and its closing ::: ended the row early. Put it outside the row.');
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
    const inCaptured = !!(currentDock || currentOverlay || currentExpansion);
    if (!inFence) {
      const h1 = inCaptured ? null : line.match(/^#\s+(.*)$/);
      const h2 = inCaptured ? null : line.match(/^##\s+(.*)$/);

      if (h1) {
        // A note block still open while no chunk is stands under the *previous*
        // `#` heading, so it is that divider's. flushChunk cannot do it - it
        // leaves at once when there is no chunk - and left to the line after
        // the heading it would be flushed against the new column.
        if (!currentChunk) flushNoteBlock();
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
        currentColumn = { heading: text, id, chunks: [], body: '', backdrop: null, overlays: [], dock: null,
          stack: !!h1Attr.stack, bare: !!h1Attr.bare, speakerNotes: [], speakerNoteFrom: [] };
        colBody = [];
        columns.push(currentColumn);
        continue;
      }

      if (h2) {
        // Same reason as at `#`, one level down: a `> note:` written under a
        // column heading with no blank line before the first `##` is the
        // divider's, and without this flush it stayed open across the
        // boundary and landed in the chunk instead - so the same note meant
        // two different things depending on a blank line.
        if (!currentChunk) flushNoteBlock();
        flushChunk();
        flushColBody();
        if (!currentColumn) {
          // A chunk before any `# Column` (e.g. the title chunk).
          // The two note arrays are here as well as on a headed column so
          // that every reader can say `col.speakerNotes.length` without a
          // guard; an anonymous column draws no divider and never fills them.
          currentColumn = { heading: null, id: null, chunks: [], overlays: [], dock: null,
            stack: false, bare: false, speakerNotes: [], speakerNoteFrom: [] };
          columns.push(currentColumn);
        }
        const h2Attr = parseAttributeTail(h2[1]);
        const { text, width, id, bare, center, middle } = h2Attr;
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
        if ((tag === 'title' || tag === 'closing') && (width || bare || center || middle !== undefined)) {
          const err = new Error(
            `A ${tag} chunk carries .${width || (bare ? 'bare' : center ? 'center' : middle ? 'middle' : 'top')}, which its cover composition decides ("${text}").\n` +
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
          // The per-tag defaults, and both are a fact about the slide rather
          // than a preference. An agenda is a list of part titles and wants
          // the wider measure. A title or closing chunk is always full width
          // - both renderers hardcode `data-width="full"` on it, and a width
          // class there is refused a dozen lines up - so storing `standard`
          // made the two sides of the build disagree about the same slide:
          // --check-fit read `(title, .full)` off the DOM while every static
          // reader here measured a `.standard` column. `defaultWidthFor` in
          // lint.js already resolved it this way, with the same reasoning.
          // It is set here rather than in the renderer because the
          // renderer's own fallback could never fire - this line always
          // supplies a value.
          width: width || (tag === 'title' || tag === 'closing' ? 'full'
            : tag === 'outline' ? 'wide' : 'standard'),
          bare: !!bare,
          center: !!center,
          // Left null when the author wrote neither `.middle` nor `.top`, and
          // answered from the chunk's shape at the flush, where the body is
          // finally known. A boolean here would have had to guess before the
          // first body line was read.
          middle: middle === undefined ? null : middle,
          // The `style:` keys this one chunk answers differently, or null.
          // Null and not an empty object so every renderer's attribute
          // helper can leave in one line, and so a chunk that wrote none of
          // these classes carries nothing new through the pipeline.
          styleOverrides: h2Attr.styleOverrides || null,
          id,
          expansions: [],
          overlays: [],
          backdrop: null,
          dock: null,
          speakerNotes: pendingNotes,
          // A note written before the chunk stands before its first body
          // line: segment 0.
          speakerNoteAt: pendingNotes.map(() => 0),
          speakerNoteFrom: pendingNotes.map(() => null),
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
      // lint.js: note-in-pulse. A note is peeled off wherever it stands, so
      // one written inside a question left the question and became the
      // chunk's speaker note - or emptied the question and failed the split.
      if ((noteOpen || annotOpen) && currentExpansion && currentExpansion.kind === 'pulse') {
        refuse(
          `> ${noteOpen ? 'note' : 'annot'}: inside ::: pulse (${chunkRef()}).\n` +
          '  A note belongs to the slide, not to a question. Close the ::: pulse\n' +
          '  first and write the note after it.');
      }
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
      // it: a picture behind it, a figure or a card row on it, or the words
      // under it. A column layout, an expansion or an overlay there is a
      // slide that has stopped being a divider - so those stay chunk-only,
      // and writing one there is refused below rather than half-supported
      // (it used to fall through and print itself under the heading).
      if (!currentChunk && currentColumn) {
        // A divider takes an overlay: a photograph behind the part's heading
        // and a card of words in a corner is the composition a section
        // opener most often wants, and every piece of it already existed.
        // A dock is captured the same way, and the two need the same three
        // lines: the closer, the beat, the directive refusal.
        const cap = currentDock || currentOverlay;
        if (cap) {
          if (/^:::\s*$/.test(line)) { if (currentDock) flushDock(); else flushOverlay(); continue; }
          const m = revealMark(line);
          if (m) {
            // lint.js: bad-dock-beat. An inherited dock is on every slide of
            // the part, and a beat is one slide's.
            if (currentDock && currentDock.scope === 'every') {
              refuse(
                `--- inside ::: dock {.every} (${chunkRef()}).\n` +
                '  An inherited dock is on every slide of the part, and a beat is one\n' +
                '  slide\'s. Write *** for a rule, or drop .every.');
            }
            if (m.from != null && cap.from != null) {
              refuse(
                `--- from ${m.from} inside ::: ${currentDock ? 'dock' : 'overlay'} ` +
                `from ${cap.from} (${chunkRef()}).\n` +
                '  A block held to a beat counts its own beats from the one it arrives\n' +
                '  on, so its markers are numbered already. Drop the `from` here, or\n' +
                '  take it off the directive.');
            }
            cap.lines.push('', beatMark(m.from), '');
            continue;
          }
          // lint.js: cards-nested / directive-in-overlay / directive-in-dock.
          // The chunk path refuses these; this one let a ::: cards through
          // and drew the grid inside the card, and a ::: backdrop written
          // here became the column's picture without a word.
          if (/^:::\s+\S/.test(line) && !parseDrawOpener(line)) {
            const head = line.trim().split(/\s+/).slice(0, 2).join(' ');
            if (currentDock) {
              refuse(
                `${head} inside ::: dock (${chunkRef()}).\n` +
                '  A dock holds prose, a list, an image or a ::: draw, and no other\n' +
                '  directive. Close the dock first.');
            }
            refuse(
              `${head} inside ::: overlay (${chunkRef()}).\n` +
              '  An overlay is a card laid over the slide - prose, a list, an image,\n' +
              '  a ::: draw - and holds no other directive. Close the overlay first.');
          }
        }
        if (readDockLine(line)) continue;
        if (readOverlayLine(line)) continue;
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
          diagramBlock = { unit: colDraw.unit, frame: colDraw.frame, autoplay: colDraw.autoplay, cycle: colDraw.cycle,
                           lines: [], bodyAt: fmOffset + lineAt };
          continue;
        }
        // A divider's content walks the same counter a chunk's does.
        { const m = revealMark(line); if (m) { colBody.push('', beatMark(m.from), ''); continue; } }
        // A card row or a row block is the one more thing a divider takes:
        // three figures, three claims or three names under the part's
        // heading is still one slide with one heading and one thing on it.
        // Unreadable lines get the same message a chunk's would.
        const colRows = line.match(/^:::\s+rows\s*(?:\{([^}]*)\})?\s*$/);
        const colCards = line.match(/^:::\s+cards\s+([1-6])\s*(?:\{([^}]*)\})?\s*$/);
        const colWhere = currentColumn.id ? `the divider of column #${currentColumn.id}`
          : `the divider of column "${currentColumn.heading}"`;
        if (colCards || colRows) {
          cardsBlock = colRows
            ? { n: 1, rows: true, attrs: colRows[1] ?? null, lines: [], where: colWhere }
            : { n: colCards[1], attrs: colCards[2] ?? null, lines: [], where: colWhere };
          continue;
        }
        if (/^:::\s+(cards|rows)\b/.test(line)) {
          const kw = /rows/.test(line) ? 'rows' : 'cards';
          refuse(
            `::: ${kw} could not be read: "${line.trim()}".\n` +
            (kw === 'cards'
              ? '  Write  ::: cards N  with N from 1 to 6, and an optional {class} tail.'
              : '  Write  ::: rows  with an optional {class} tail - a row block has one column,\n  so it takes no count.'));
        }
        // lint.js: stray-directive. Everything else a chunk can open is a
        // slide that has stopped being a divider - a column layout, an
        // expansion, an overlay - and used to print itself under the heading
        // as text, since nothing here read it.
        if (/^:::\s+\S/.test(line)) {
          refuse(
            `${line.trim().split(/\s+/).slice(0, 2).join(' ')} under a column heading (${colWhere}).\n` +
            '  A divider is one slide with one heading and one thing on it: a\n' +
            '  ::: backdrop behind it, a ::: draw or a ::: cards / ::: rows on it, or\n' +
            '  the words under it. Anything else belongs in a ## chunk.');
        }
      }

      if (currentChunk) {

        // A --- inside a wrapper or an overlay is a beat, not a segment split:
        // flushChunk splits the body at every top-level --- and a wrapper
        // cannot straddle two segments (the opening <div> landed in one, the
        // closing in the next, and the browser's repair put the second pane
        // on the first beat). So below the top level the line becomes
        // BEAT_MARK and the runtime does the hiding. An expansion keeps the
        // <hr>: its body is not on the projection and has no beats to give.
        const nestedMark = (layoutStack.length || currentOverlay || currentDock) && !currentExpansion
          ? revealMark(line) : null;
        if (nestedMark) {
          // lint.js: bad-dock-beat. Unreachable on a chunk today - `.every`
          // is refused there - and kept so the two paths read the same.
          if (currentDock && currentDock.scope === 'every') {
            refuse(
              `--- inside ::: dock {.every} (${chunkRef()}).\n` +
              '  An inherited dock is on every slide of the part, and a beat is one\n' +
              '  slide\'s. Write *** for a rule, or drop .every.');
          }
          // Inside ::: script the line stays what marked makes of it, a
          // rule: the block is narration, off the projection under the
          // default collapse, and a beat there is a Space that shows nothing.
          // Written back as ***, the other spelling of a rule, because
          // flushChunk would otherwise split the segment on the --- itself.
          // Inside ::: script the line is written back as a rule, so a number
          // on it is a pin nothing takes - refused rather than dropped.
          if (nestedMark.from != null && inLayout('script')) {
            refuse(
              `--- from ${nestedMark.from} inside ::: script (${chunkRef()}).\n` +
              '  The block is narration and is off the projection, so the line stays a\n' +
              '  rule there and the number would do nothing. Write --- on its own.');
          }
          const host = currentDock || currentOverlay;
          if (nestedMark.from != null && host && host.from != null) {
            refuse(
              `--- from ${nestedMark.from} inside ::: ${currentDock ? 'dock' : 'overlay'} ` +
              `from ${host.from} (${chunkRef()}).\n` +
              '  A block held to a beat counts its own beats from the one it arrives\n' +
              '  on, so its markers are numbered already. Drop the `from` here, or\n' +
              '  take it off the directive.');
          }
          (currentDock ? currentDock.lines : currentOverlay ? currentOverlay.lines : bodyLines)
            .push('', inLayout('script') ? '***' : beatMark(nestedMark.from), '');
          continue;
        }
        // lint.js: directive-in-dock / cards-nested / nested-directive. A
        // dock's body is captured, and it holds prose, a list, an image or a
        // figure - no other directive. One guard for the whole list, the
        // same three lines the divider path has, so the two cannot drift.
        // Read after ::: dock itself, whose own opener names the open one.
        // lint.js: directive-in-pulse. A question and its answer are prose,
        // a list, code or a formula; the widget splits them at the one ---,
        // and a wrapper or a figure in either half would be cut in two.
        if (currentExpansion && currentExpansion.kind === 'pulse' && /^:::\s+\S/.test(line)) {
          refuse(
            `${line.trim().split(/\s+/).slice(0, 2).join(' ')} inside ::: pulse (${chunkRef()}).\n` +
            '  A question and its answer hold prose, a list, code or a formula, and\n' +
            '  no directive. Close the ::: pulse first.');
        }
        if (readDockLine(line)) continue;
        if (currentDock && /^:::\s+\S/.test(line) && !parseDrawOpener(line)) {
          refuse(
            `${line.trim().split(/\s+/).slice(0, 2).join(' ')} inside ::: dock (${chunkRef()}).\n` +
            '  A dock holds prose, a list, an image or a ::: draw, and no other\n' +
            '  directive. Close the dock first.');
        }

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
          // lint.js: directive-in-overlay / nested-directive. The line is
          // the slide's wherever it stands, so inside a captured block it
          // silently became the chunk's picture while reading as the card's.
          if (openAside()) {
            refuse(
              `::: backdrop inside ${openAside()} (${chunkRef()}).\n` +
              '  A backdrop is the slide\'s ground, not the block\'s. Write it at chunk\n' +
              '  level, outside the block.');
          }
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

        if (readOverlayLine(line)) continue;

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
        // ::: pulse [{#key}] – a self-test question, the third aside. It is
        // lifted out of the body like a footnote, so every rule below holds
        // for it unchanged, and the live renderers never draw it: they pick
        // expansions by kind. Only the documents do (renderChunk).
        const pulseOpen = line.match(/^:::\s+pulse\s*(?:\{\s*#([A-Za-z0-9][\w-]*)\s*\})?\s*$/);
        if (!pulseOpen && /^:::\s+pulse\b/.test(line)) {
          refuse(
            `::: pulse could not be read: "${line.trim()}" (${chunkRef()}).\n` +
            '  Write  ::: pulse  or  ::: pulse {#key}  - the key is letters, digits,\n' +
            '  - and _, and it defaults to the chunk\'s id.');
        }
        if (expandOpen || marginOpen || pulseOpen) {
          const word = marginOpen ? marginOpen[1] : pulseOpen ? 'pulse' : 'expand';
          // lint.js: nested-directive / aside-in-layout. A second aside used
          // to close the first without a word (flushExpansion ran here) and
          // print the leftover ::: as text. Inside a wrapper, the closer that
          // should end the aside popped the wrapper instead, so the prose
          // after the aside was folded into it.
          if (openAside()) {
            refuse(
              `::: ${word} inside ${openAside()} (${chunkRef()}).\n` +
              '  Asides do not nest: an expansion or footnote is folded under the\n' +
              '  chunk and an overlay is laid over it. Close the open block with a\n' +
              '  ::: line first; a chunk can carry several, one after the other.');
          }
          if (layoutStack.length) {
            refuse(
              `::: ${word} inside ${openLayout()} (${chunkRef()}).\n` +
              '  An expansion or footnote is folded under the whole chunk, so a\n' +
              '  place inside a block means nothing - and its closing ::: ended the\n' +
              '  block instead. A block inside the aside is fine; write the aside\n' +
              '  after the block\'s closing :::.');
          }
          // A self-test question is filed under its key in the reader's
          // Pulse account, with the lecture's title as the page: the key is
          // the question's identity, so a corrected wording keeps what the
          // reader has learnt. The chunk id is the default because ids are
          // frozen once authored already; a second question on one chunk has
          // to name itself. lint.js: bad-pulse / duplicate-pulse-key.
          let pulseKey = null;
          if (pulseOpen) {
            if (currentChunk.tag === 'title' || currentChunk.tag === 'closing') {
              refuse(
                `::: pulse on the ${currentChunk.tag} chunk (${chunkRef()}).\n` +
                '  The documents draw the cover from the frontmatter and nothing else\n' +
                '  of that chunk, so the question would silently vanish. Put it on\n' +
                '  the slide it asks about.');
            }
            pulseKey = pulseOpen[1] || currentChunk.id || null;
            if (!pulseKey) {
              refuse(
                `::: pulse in a chunk with no id, and no {#key} on the line.\n` +
                '  The key is what the reader\'s progress is filed under, so it has to\n' +
                '  be stable: give the chunk an {#id} or write  ::: pulse {#key}.');
            }
            if (pulseKeys.has(pulseKey)) {
              refuse(
                `::: pulse key '${pulseKey}' is used twice: first on ${pulseKeys.get(pulseKey)}, again on ${chunkRef()}.\n` +
                '  Each question needs a key of its own - it is what the reader\'s\n' +
                '  progress is filed under. A chunk\'s first question takes the chunk\'s\n' +
                '  id; name any further one:  ::: pulse {#key}');
            }
            pulseKeys.set(pulseKey, chunkRef());
          }
          currentExpansion = {
            label: expandOpen ? expandOpen[1].trim() : 'note',
            kind: marginOpen ? 'margin' : pulseOpen ? 'pulse' : 'expand',
            key: pulseKey,
            word,
            // The body position the opener stood at, which is what says
            // which reveal segment the aside was written in.
            at: bodyLines.length,
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
        const diagramOpen = parseDrawOpener(line);
        if (diagramOpen && colsDepth > 0) {
          refuse(
            `::: draw inside ::: cols (${chunkRef()}).\n` +
            '  ::: cols is one text flow balanced across columns, and a figure in it\n' +
            '  breaks the flow - the columns silently stop working. Use ::: side to\n' +
            '  put a figure beside prose, or take the figure out of the columns.');
        }
        // lint.js: directive-in-overlay / directive-in-embed. An overlay's
        // lines are captured while a wrapper's markup went to the body, so
        // `::: cols` in an overlay drew an empty column block on the slide
        // and the card kept the words. A figure is different: the diagram
        // close above sends it into the overlay, where a small drawing on a
        // card over a photograph is a design the format wants. An embed's
        // lines are its caption, and a wrapper or an svg inside a
        // <figcaption> is markup no reader asked for.
        const layoutWord = diagramOpen ? 'draw'
          : (line.match(/^:::\s+(cols|side|flip|marginalia|embed|slide|script)\b/) || [])[1];
        if (layoutWord && layoutWord !== 'draw' && currentOverlay) {
          refuse(
            `::: ${layoutWord} inside ::: overlay (${chunkRef()}).\n` +
            '  An overlay is a card laid over the slide - prose, a list, an image,\n' +
            '  a ::: draw - and holds no layout block. Close the overlay and write\n' +
            '  the block in the chunk body.');
        }
        if (layoutWord && inLayout('embed')) {
          refuse(
            `::: ${layoutWord} inside ::: embed (${chunkRef()}).\n` +
            '  The lines under ::: embed are the player\'s caption, and a caption is\n' +
            '  prose. Close the embed before the block.');
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
            : openAside();
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
          // lint.js: side-in-cols. The same measurement as ::: draw and
          // ::: cards in a column flow: a grid placed in `column-count`
          // breaks the flow, and the author who wrote `cols 2` got one
          // column with the panes wedged into it.
          if (colsDepth > 0) {
            refuse(
              `::: side inside ::: cols (${chunkRef()}).\n` +
              '  ::: cols is one text flow balanced across columns, and a two-pane\n' +
              '  grid in it breaks the flow - the columns silently stop working. Use\n' +
              '  one or the other: ::: side for a figure beside prose, ::: cols for\n' +
              '  prose balanced across columns.');
          }
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
          // lint.js: stray-directive / duplicate-flip. The marker emits a
          // closer for pane A and an opener for pane B, and used to do so
          // wherever it stood: outside a ::: side it closed whatever block
          // was innermost, and a second one opened a third pane in a
          // two-track grid, which wrapped onto a row of its own.
          const top = layoutStack[layoutStack.length - 1];
          if (!top || top.kind !== 'side') {
            refuse(
              `::: flip ${top ? `inside ${openLayout()}` : 'outside any ::: side'} (${chunkRef()}).\n` +
              '  flip is the middle of a ::: side pair and switches from the first pane\n' +
              '  to the second; it has to stand directly inside the ::: side block.');
          }
          if (top.flipped) {
            refuse(
              `A second ::: flip in one ::: side (${chunkRef()}).\n` +
              '  ::: side has two panes and one flip between them. For three things in\n' +
              '  a row write ::: cards 3.');
          }
          top.flipped = true;
          target.push('', `</div><div class="side-b">`, '');
          continue;
        }
        if (/^:::\s+marginalia\s*$/.test(line)) {
          currentChunk.hasMarginalia = true;
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
        if (diagramOpen) {
          // `autoplay N` and `cycle` are the host's and never reach the
          // compiler. Playback is not part of the drawing: the compiler's
          // job ends at a set of per-beat geometries, and teaching it a
          // wall-clock number would put a runtime concern in the one file
          // that also runs in the editor, where there is no deck to play.
          refuseDrawOpener(diagramOpen);
          diagramBlock = { unit: diagramOpen.unit, frame: diagramOpen.frame, autoplay: diagramOpen.autoplay, cycle: diagramOpen.cycle,
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
        // lint.js: explicit-nested. One block says "this is the screen", the
        // other "this is not", and one inside the other is a sentence with
        // both halves. Rendered, the CSS picked a winner nobody chose.
        const explicitOpen = /^:::\s+(slide|script)\s*$/.exec(line);
        if (explicitOpen && (inLayout('slide') || inLayout('script'))) {
          refuse(
            `::: ${explicitOpen[1]} inside ::: ${inLayout('slide') ? 'slide' : 'script'} (${chunkRef()}).\n` +
            '  ::: slide says "this block is the screen" and ::: script says "this\n' +
            '  block is not"; neither can hold the other or itself. Close the open\n' +
            '  block first - a chunk may carry one of each, side by side.');
        }
        if (/^:::\s+slide\s*$/.test(line)) {
          layoutStack.push({ close: '</div>', kind: 'slide', narrows: false,
                             from: target === bodyLines ? bodyLines.length : -1 });
          target.push('', SLIDE_EXPLICIT_OPEN, '');
          continue;
        }
        if (/^:::\s+script\s*$/.test(line)) {
          layoutStack.push({ close: '</div>', kind: 'script', narrows: false,
                             from: target === bodyLines ? bodyLines.length : -1 });
          target.push('', `<div class="script-only">`, '');
          continue;
        }
        // :::  –  closes the innermost open layout, or the expansion.
        if (/^:::\s*$/.test(line)) {
          if (layoutStack.length) {
            const closed = layoutStack.pop();
            if (closed.cols) colsDepth -= 1;
            target.push('', closed.close, '');
            // Which lines of the body were the block, for isPictureSlide.
            if (closed.from >= 0 && target === bodyLines) {
              explicitRanges.push({ kind: closed.kind, from: closed.from, to: bodyLines.length });
            }
            continue;
          }
          if (currentDock) {
            flushDock();
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
          // Nothing is open, so this ::: closes nothing. It used to fall
          // through to the body and render as a literal `:::` paragraph on
          // the slide; lint.js has reported stray-directive-close on it, and
          // the build rendering what the linter refuses is the direction this
          // project does not allow. An intentional ::: as content goes in a
          // code fence or an inline `code span`, both of which are handled
          // before this line is ever reached.
          refuse(
            `a ::: closes a block, and none is open here (${chunkRef()}).\n` +
            '  It would otherwise print as a literal ::: on the slide. If you\n' +
            '  meant the characters themselves, put them in a code fence or an\n' +
            '  inline `code span`.');
        }
      }
    }

    if (currentChunk) {
      if (currentDock) currentDock.lines.push(line);
      else if (currentOverlay) currentOverlay.lines.push(line);
      else if (currentExpansion) currentExpansion.lines.push(line);
      else bodyLines.push(line);
    } else if (!currentColumn && !inFence && /^:::\s+\S/.test(line)) {
      // lint.js: stray-directive. Before the first heading there is no slide
      // for a directive to be on, and the lines used to be dropped without
      // a word - a ::: dock written above `## title:` simply vanished.
      refuse(
        `${line.trim().split(/\s+/).slice(0, 2).join(' ')} before the first heading.\n` +
        '  A directive belongs to a slide, and no ## chunk or # column has opened\n' +
        '  yet. Move it below the heading of the slide it is for.');
    } else if (currentColumn) {
      if (currentDock) currentDock.lines.push(line);
      else if (currentOverlay) currentOverlay.lines.push(line);
      // A ::: that closes nothing in a divider's body, the same stray closer
      // the chunk path refuses - a captured cards/overlay/dock closer is
      // handled long before here, so one reaching this point is genuinely
      // stray. It used to print as a literal ::: in the divider lede while
      // lint.js reported stray-directive-close.
      else if (!inFence && /^:::\s*$/.test(line)) {
        refuse(
          `a ::: closes a block, and none is open in the divider of column ` +
          `#${currentColumn.id || currentColumn.heading || '?'}.\n` +
          '  It would otherwise print as a literal ::: on the slide. Put the\n' +
          '  characters in a code fence or an inline `code span` if you meant them.');
      }
      else colBody.push(line);
    }
  }
  flushColBody();
  // A fence still open at the end of the file read every line after its
  // opener as code: the slides below it vanished into one listing and the
  // build exited 0. Checked first, because an open fence is also why a
  // block around it never saw its closing ::: - the fence is the cause.
  // lint.js: unclosed-fence.
  if (fence.inside) {
    const ln = src.slice(0, fence.openedAt).split('\n').length;
    refuse(
      `The code fence opened on line ${ln} (${fence.marker}) is never closed.\n` +
      '  Everything after it was read as code, so any slide below it is missing\n' +
      `  from the output. Close it with a line of at least ${fence.marker}.`);
  }
  // The same for an HTML comment. No line inside one is structure, so a
  // `<!--` with no `-->` after it folded every slide below it into one
  // comment; and before that rule it was worse, because the browser's
  // comment never closed either and the views lost every later slide while
  // the build counted them. lint.js: unclosed-comment.
  if (fence.inComment) {
    const ln = src.slice(0, fence.commentOpenedAt).split('\n').length;
    refuse(
      `The HTML comment opened on line ${ln} (<!--) is never closed.\n` +
      '  Everything after it is inside the comment, so any slide below it is\n' +
      '  missing from the output. Close it with a line containing -->.');
  }
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
  if (currentDock || currentOverlay || currentExpansion) {
    const kind = currentDock ? 'dock' : currentOverlay ? 'overlay'
      : (currentExpansion.kind === 'expand' ? `expand ${currentExpansion.label}` : currentExpansion.word);
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

  // Every figure in the lecture has compiled, which is the earliest the whole
  // set can be ruled on at once - see reportFigureTypeStatic.
  reportFigureTypeStatic();

  // `.stack` says where the divider's own content stands, so a divider with
  // no content has nothing for it to say - the silent no-op this format
  // refuses everywhere. Checked here, at the end of the parse, because a
  // divider's body is only complete when the next heading has arrived; and
  // in the parser rather than in a renderer, so `--print-only` reaches it
  // too. lint.js mirrors it as `bad-section-stack`.
  //
  // `.bare` is refused on the same condition and for a plainer reason: it
  // takes the heading off the slide, so with nothing under the heading the
  // slide is empty.
  for (const col of columns) {
    if ((!col.stack && !col.bare) || (col.body || '').trim()) continue;
    const what = col.stack ? '{.stack}' : '{.bare}';
    const why = col.stack
      ? '  .stack puts the part\'s own figure, quotation or card row *under* the\n'
        + '  heading at full width instead of beside it. Write something under the\n'
        + '  `#` line, or drop the class.'
      : '  .bare takes the divider\'s heading off the slide and leaves it in the\n'
        + '  contents, in `section: outline`, in the speaker view and in search - so\n'
        + '  with nothing under the `#` line the slide has nothing on it. Write the\n'
        + '  divider\'s own figure, quotation or card row there, or drop the class.';
    const err = new Error(
      `${what} on the divider of column ${col.id ? '#' + col.id : `"${col.heading}"`}, ` +
      'which has no content under its heading.\n' + why);
    err.userFacing = true;
    throw err;
  }
  return { frontmatter, columns };
}

// ── lecture statistics (the `stats` payload of --events) ─────────────
//
// Six numbers a lecturer asks about the deck they are writing: how many
// parts, how many slides, how much prose the students get, how much of it is
// the lecturer's alone, and how many pictures and drawings are in it. The
// desktop builder shows them; nothing in the build depends on them.
//
// It is a *counting* walk, not a second parser. Sections and chunks come from
// the parsed lecture, which already knows them exactly. The rest is a shallow
// line walk over the source in the style of `scanReferencedImages` above –
// fence-aware, note-aware, and aware of `::: draw` because a diagram's source
// lines are a drawing rather than prose. It deliberately knows nothing else
// about the directive vocabulary: a `:::` line is markup and carries no words
// whichever directive it opens, so that vocabulary can keep growing without
// this walk having to hear about it.
//
// Two decisions the numbers do not show on their own:
//
//   - Fenced code is not prose. A listing is on the printed page, but
//     `for (i = 0; i < n; i++) {` is not six words of a lecture, and counting
//     it made a deck with two code slides read as twice the lecture it is.
//   - `> note:` is the only thing subtracted from the page count. Everything
//     else the author wrote – a `::: script` block, an `::: expand` body, a
//     card, a dock – is in print.html, and print.html is what the students
//     get, so it counts.

// One line of Markdown reduced to the words a reader would say out loud. An
// image keeps its alt text (it becomes a figcaption) and a link keeps its
// label; everything else that is punctuation of the format goes.
function statsWordsIn(line) {
  const text = String(line)
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_~`#>|]/g, ' ');
  let n = 0;
  for (const w of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(w)) n++;
  return n;
}

// Is this reference a picture rather than a clip? `![](clip-id)` is the same
// shorthand a picture uses – a clip is a figure that moves – so the question
// can only be answered by resolving the reference the way the build does.
// A reference that resolves to nothing is counted as a picture: the author
// meant one, and the missing asset is reported elsewhere.
function statsIsPicture(href) {
  if (/^(?:https?:|data:|\/\/|\/)/i.test(href)) return !isVideoExt(href);
  const shorthand = !/[\\/]/.test(href) && !/\.[a-z0-9]+$/i.test(href);
  const rel = shorthand ? resolveFigId(href) : href;
  return rel ? !isVideoExt(rel) : true;
}

// A heading line without its type prefix and without its {…} tail: what a
// reader sees at the top of the slide, and nothing of the grammar around it.
function statsHeadingWords(line) {
  const bare = line.replace(/^#{1,6}\s*/, '').replace(/\{[^}]*\}\s*$/, '');
  const m = bare.match(/^([a-z]+):\s*(.*)$/);
  return statsWordsIn((m && VALID_TAGS.has(m[1]) ? m[2] : bare).replace(/\|/g, ' '));
}

// When source.md was last written. 0 rather than a throw if it is gone: a
// missing timestamp is a line a driver leaves out, not a failed build.
function sourceModifiedAt(file) {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
}

function lectureStats(src, lecture) {
  const stats = {
    sections: lecture.columns.length,
    chunks: lecture.columns.reduce((n, c) => n + c.chunks.length, 0),
    pageWords: 0,
    noteWords: 0,
    pictures: 0,
    drawings: 0,
  };

  const fence = fenceTracker();
  let inDraw = false;
  // Which bucket the blockquote block being read belongs to, or null between
  // blocks: `> note:` is the lecturer's, `> annot:` prints for the students.
  let quoteBucket = null;

  for (const line of safeMatter(src).content.split('\n')) {
    if (!inDraw && (fence.step(line) || fence.inside)) continue;

    if (inDraw) {
      if (/^:::\s*$/.test(line)) inDraw = false;
      continue;
    }

    // A note or annotation block runs from its opener to the first line that
    // is not a blockquote – the parser's own rule.
    if (quoteBucket) {
      if (/^\s*>/.test(line)) { stats[quoteBucket] += statsWordsIn(line); continue; }
      quoteBucket = null;
    }
    const quote = line.match(/^\s*>\s*(note|annot):(.*)$/i);
    if (quote) {
      quoteBucket = quote[1].toLowerCase() === 'note' ? 'noteWords' : 'pageWords';
      stats[quoteBucket] += statsWordsIn(quote[2]);
      continue;
    }

    if (/^:::\s+draw\b/.test(line)) { inDraw = true; stats.drawings++; continue; }
    // A backdrop names its picture on the opener; every other directive line
    // is markup with nothing on the page.
    if (/^:::\s+backdrop\s+[^\s{]/.test(line)) { stats.pictures++; continue; }
    if (/^:::/.test(line)) continue;

    // Inline code first: a lecture that documents the format writes
    // `![Caption](fig-id)` in prose, and that is an example, not a picture.
    for (const m of line.replace(/`[^`]*`/g, ' ').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      if (statsIsPicture(m[1])) stats.pictures++;
    }
    stats.pageWords += /^#{1,6}\s/.test(line) ? statsHeadingWords(line) : statsWordsIn(line);
  }

  // The cover and the closing slide take their picture from the frontmatter,
  // which the walk above never sees. Read off the parsed block rather than
  // matched in the source, because a lecture that documents the format has a
  // `cover-image:` line in a fenced example and that is not a picture.
  // `closing-image: cover` names no file of its own – it is the cover's
  // picture a second time.
  const cover = String(lecture.frontmatter['cover-image'] || '').trim();
  const closing = String(lecture.frontmatter['closing-image'] || '').trim();
  if (cover) stats.pictures++;
  if (closing && closing !== 'cover') stats.pictures++;

  return stats;
}

// ── rendering ────────────────────────────────────────────────────────

// Live-reload snippet for --watch mode. The build threads opts.watchPort
// into each renderer; a non-null port emits this <script> just before
// </head>. Production builds receive opts.watchPort = null and the
// renderers emit nothing, keeping the output a static file.
// What a failed rebuild looks like in an open page. Ships inside the reload
// script and nowhere else, so a build without --watch carries none of it.
// A page used to sit on its old build in silence while the terminal said
// the rebuild had failed, and an author whose terminal was behind the
// browser saved, saw nothing change and took the edit for one with no
// effect. Shown where the lecturer looks: always in the cockpit, in the
// projection only while no cockpit answers it (psiBuildBannerHere in
// runtime/audience.js, a projector mid-talk is not where a typo belongs), and in the
// two documents. Gone on the next good build, because every good build
// reloads every page; a click hides it until the next failure.
//
// The reason is text from the build's error, which can quote source.md, so
// it reaches the page through textContent and never as markup. A page that
// knows neither secret hears only that a rebuild failed (the bare string),
// and says the terminal has the reason.
//
// The diagram editor's status line already says it while the editor is
// open (psiWatchBuildFailed answers true when it did), so the banner then
// stands behind the editor rather than beside it.
//
// runtime/watch-banner.css, read as text at build time
// (PLAN-runtime-extraction.md; WATCH_BANNER_CSS until it left this file),
// in editor.css's shape: read once per process. It ships **raw**, as the
// literal did, not through shipCss, and only in a watch build, inside
// reloadScript's own style element: the literal carried the <style> and
// </style> tags, the file holds only the rules so that it is a stylesheet,
// and reloadScript writes the two tags round it. Its bytes are the literal's
// value between those tags.
const WATCH_BANNER_CSS_PATH = new URL('./runtime/watch-banner.css', import.meta.url);
let watchBannerCssCache = null;
const watchBannerCss = () => (watchBannerCssCache ??= fs.readFileSync(WATCH_BANNER_CSS_PATH, 'utf8'));

// runtime/watch-banner.js, the banner's script, read the same way
// (WATCH_BANNER_JS until it left this file) and also shipped raw, comments
// and all: reloadScript splices it at the head of the function its reload
// script runs, so it is a fragment of that function's body, not a module,
// and its bfReload is what the rest of the reload script calls. Its bytes
// are the old literal's *value* – the literal resolved a doubled backslash
// in '\\n', and the \u escape of an ellipsis, which it turned into the
// character itself.
const WATCH_BANNER_JS_PATH = new URL('./runtime/watch-banner.js', import.meta.url);
let watchBannerJsCache = null;
const watchBannerJs = () => (watchBannerJsCache ??= fs.readFileSync(WATCH_BANNER_JS_PATH, 'utf8'));

// What every page with a reload script does when its socket closes and when
// it opens again. The watcher's socket has a port of the lecture's own
// (lecturePorts), so a page left open across a restart of the watcher finds
// the new run where the old one was – and is a page of the old run. The
// server says which run it is on every connection, after its first good
// build; a page whose run differs reloads itself, once per run, so a view a
// --*-only run did not rebuild comes back as the old file and stays rather
// than reloading for ever. A reload is all a stranger's message could cause,
// and the Origin check keeps strangers off the socket anyway. The retry
// backs off from half a second to five, where it used to knock on a dead
// port every 500 ms for as long as the tab was open.
function watchRunJs(run) {
  return `
  const psiRun = ${JSON.stringify(run || '')};
  let retryMs = 500;
  const retryLater = (fn) => { setTimeout(fn, retryMs); retryMs = Math.min(retryMs * 2, 5000); };
  const runSeen = (id) => {
    if (!psiRun || typeof id !== 'string' || !id || id === psiRun) return;
    try {
      if (sessionStorage.getItem('psi-watch-run') === id) return;
      sessionStorage.setItem('psi-watch-run', id);
    } catch (err) { return; }
    bfReload();
  };`;
}

function reloadScript(port, nonce, opts = {}) {
  if (!port) return '';
  // Two-way now. The reload half is unchanged; the other half is what the
  // diagram editor writes back through, and it is deliberately the *same*
  // socket: source.md stays the single source of truth, the normal rebuild
  // runs on the write, and every open tab reloads.
  //
  // And one thing more: the server may now speak first. Every message so far
  // was an answer to a question the page had asked, paired by id; a hint from
  // the prompter is nobody's answer. `on(type, fn)` is the listener map for
  // those – build-failed was the precedent, hard-wired to one global, and the
  // prompter would have been a second such wire.
  // The two documents get the reload and nothing else: no nonce, no psiWatch,
  // nothing they could send. They are the views an author hands on, and a
  // --watch build of one used to carry the secret that lets a page write to
  // source.md. The server sends a bare "reload" to every socket it accepted,
  // so this needs no message of its own.
  //
  // A live view without a writer (`listen`) says one thing on every open, a
  // second secret that marks the socket as one this build made and that may
  // be told why a rebuild failed - and that lets it do nothing else. The
  // documents send nothing at all and hear only that one failed.
  if (opts.receiveOnly) {
    const listen = opts.listen ? `
    const listen = ${JSON.stringify(opts.listen)};
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify({ type: 'hello', listen })); } catch (err) { /* closing */ }
    });` : '';
    return `<style>${watchBannerCss()}</style><script>
(() => {${watchBannerJs()}${watchRunJs(opts.run)}
  const connect = () => {
    const ws = new WebSocket('ws://127.0.0.1:${port}');${listen}
    ws.addEventListener('open', () => { retryMs = 500; });
    ws.addEventListener('message', e => {
      if (e.data === 'reload') { bfReload(); return; }
      if (e.data === 'build-failed') { ${opts.listen ? '/* the reason follows */' : "bfShow('', false);"} return; }
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && m.type === 'run') { runSeen(m.id); return; }
      if (m && m.type === 'build-failed') bfShow(m.why, true);
    });
    ws.addEventListener('close', () => { retryLater(connect); });
  };
  connect();
})();
</script>`;
  }
  return `<style>${watchBannerCss()}</style><script>
window.psiWatch = (() => {${watchBannerJs()}${watchRunJs(opts.run)}
  let sock = null;
  let seq = 0;
  const waiting = new Map();
  const listeners = new Map();
  // Told when a socket opens, including every silent reconnect below. The
  // prompter needs it: its session begins with a hello, and a socket that
  // came back without one is a sidecar whispering into a cockpit that has
  // stopped saying where it is.
  const opened = [];
  const connect = () => {
    const ws = new WebSocket('ws://127.0.0.1:${port}');
    sock = ws;
    ws.addEventListener('open', () => {
      retryMs = 500;
      // The page says who it is before anything else, so the server can tell
      // a view it built from any other page that connected: only a socket
      // that has shown this build's nonce is told why a rebuild failed.
      const nonce = ${JSON.stringify(nonce || '')};
      if (nonce) {
        try { ws.send(JSON.stringify({ type: 'hello', nonce })); } catch (err) { /* closing */ }
      }
      for (const fn of opened) { try { fn(); } catch (err) { /* ignore */ } }
    });
    ws.addEventListener('message', e => {
      if (e.data === 'reload') { bfReload(); return; }
      // The bare form goes to a socket that has not said hello yet; the
      // reason follows the hello.
      if (e.data === 'build-failed') return;
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && m.type === 'run') { runSeen(m.id); return; }
      // The server could not rebuild – a deleted asset, a syntax error made
      // in a text editor. The banner says so, and the diagram editor's status
      // line too while it is open; without this the page sat on the old
      // build in silence and the next write-back failed with unhelpful
      // advice.
      if (m && m.type === 'build-failed') {
        bfShow(m.why, true);
        return;
      }
      // Any *-result carrying an id we are waiting on. The patch protocol
      // was the first; the asset ones ride the same pairing rather than
      // growing a second mechanism beside it.
      if (m && typeof m.type === 'string' && m.type.endsWith('-result') && waiting.has(m.id)) {
        waiting.get(m.id)(m);
        waiting.delete(m.id);
      }
      // After the pairing, never instead of it: a listener on a type that is
      // also awaited would otherwise decide which of the two gets the message.
      const fns = m && typeof m.type === 'string' ? listeners.get(m.type) : null;
      if (fns) for (const fn of fns) {
        // A defect in a listener is not a defect in the socket, and the talk
        // is still running.
        try { fn(m); } catch (err) { /* ignore */ }
      }
    });
    ws.addEventListener('close', () => { sock = null; retryLater(connect); });
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
    // Unsolicited server messages, by type. Additive: a page that registers
    // none behaves exactly as before.
    on: (type, fn) => {
      const l = listeners.get(type) || [];
      l.push(fn);
      listeners.set(type, l);
    },
    // Every open, not only the first: the socket reconnects itself, and
    // whoever holds a session across that has to hear about it.
    onConnect: (fn) => { opened.push(fn); },
    ask,
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

function lectureTitle(frontmatter, S) {
  return frontmatter.title || (S && S['untitled-lecture']) || 'Untitled lecture';
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

// The planned length of the talk, in seconds, or null when the deck does
// not say. `duration: 45` is minutes, because that is how a slot is
// announced; `duration: 45:00` and `1:30:00` are read as written. It is a
// property of the talk like `lang:`, not a setting of any one view, which
// is why it sits at the top level and not inside `prompter:` - the
// cockpit's clock can measure against it whether or not a prompter is
// listening. Refused rather than ignored: a number nothing reads is the
// silent no-op this format refuses everywhere.
function talkDuration(frontmatter = {}) {
  const v = frontmatter.duration;
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  let secs = null;
  if (/^\d+(\.\d+)?$/.test(raw)) secs = Math.round(Number(raw) * 60);
  else {
    const m = raw.match(TALK_CLOCK_RE);
    if (m) secs = (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
  }
  if (secs == null || !(secs > 0) || secs > 12 * 3600) {
    const err = new Error(
      `Frontmatter: "duration: ${raw}" is not a length this key reads.\n` +
      '  Expected minutes (duration: 45) or a clock (duration: 45:00, duration: 1:30:00), up to twelve hours.');
    err.userFacing = true;
    throw err;
  }
  return secs;
}

// The time of day the talk is planned to begin, in minutes after local
// midnight, or null when the deck does not say. `start: "14:20"` - a time and
// no date, because a lecture is given every week and a deck that named the
// day would be wrong on all the others; the cockpit reads it against the day
// it is opened on. Nothing happens by itself: the key puts one command and one
// button beside the cockpit's clock, which set it to the time since then
// (speaker.md, Clock). Refused rather than ignored, like `duration:`.
function talkStart(frontmatter = {}) {
  const v = frontmatter.start;
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  const m = raw.match(TALK_START_RE);
  const h = m ? Number(m[1]) : NaN;
  const min = m ? Number(m[2]) : NaN;
  if (!m || h > 23 || min > 59) {
    const err = new Error(
      `Frontmatter: "start: ${raw}" is not a time of day this key reads.\n` +
      '  Expected the local time the talk is planned to begin, 24-hour HH:MM (start: "14:20").');
    err.userFacing = true;
    throw err;
  }
  return h * 60 + min;
}

// ── the words the build invents (localised by `lang:`) ───────────────
// Every string the four outputs carry that is NOT in source.md - the TOC
// heading, the note labels, the type eyebrow, the <title> suffixes - is
// English furniture. `lang:` already declares the lecture's language (and
// already fails the build on a value that is not a language tag), so it
// selects the wording too. One table, keyed by role and never by the
// English text; `STRINGS.en` is the current literals transcribed character
// for character, so a lecture with no `lang:` or `lang: en` builds
// byte-identical HTML to before - the 1.0.0 contract.
//
// Casing is stored once and cased per site: the projection uppercases the
// type word (all-small-caps leaves capitals as full caps, so EXERCISE) and
// the printed document lowercases it (small-caps then draws it), which is
// why the table holds `Exercise` and neither site holds the rendered form.
const STRINGS = {
  en: {
    contents: 'Contents',
    'speaker-note': 'Speaker Note',
    'presentation-note': 'Presentation Note',
    'aside-note': 'note',
    'pulse-answer': 'Answer',
    type: { principle: 'Principle', definition: 'Definition', example: 'Example',
            question: 'Question', exercise: 'Exercise', outline: 'Outline',
            figure: 'Figure' },
    'title-print': 'print',
    'title-print-notes': 'print + notes',
    'title-lecture': 'lecture',
    'title-speaker': 'speaker',
    'untitled-lecture': 'Untitled lecture',
    'annotation-label': 'annotation',
    'add-note': '+ note',
    // The contents sidebar of the documents (reader: on): the label of the
    // button that closes it where it lies over the page. Its heading and the
    // button that opens it say `contents`, above.
    'reader-close': 'Close contents',
    // The reader's highlights (reader: on): the button that appears at the
    // end of a selection, the note field on a highlight's card and its one
    // action, the notice a delete leaves with its undo, the heading over the
    // highlights a rebuilt document no longer has the words for, and the one
    // line said when the browser will not let the page store anything.
    'reader-mark': 'Highlight',
    'reader-note': 'Note (optional)',
    'reader-remove': 'Remove',
    'reader-removed': 'Highlight removed.',
    'reader-undo': 'Undo',
    'reader-orphans': 'No longer found in this version',
    'reader-orphan-remove': 'remove',
    'reader-session': 'This browser does not let the page save highlights – they are lost when the tab is closed.',
    // The way through them: the name of the pill at the foot of the window
    // (also what the count beside a contents entry is read out as), its two
    // arrows, and the two halves of its filter.
    'reader-nav': 'Highlights',
    'reader-prev': 'Previous highlight',
    'reader-next': 'Next highlight',
    'reader-filter-all': 'all',
    'reader-filter-notes': 'with note',
    // The menu in the contents sidebar's foot: export, import, delete all,
    // the ? beside them and the four lines it opens (what the tools are,
    // where they keep things, why that is fragile, the export), and what the three
    // actions leave behind. A {name} is filled in by the page; each count
    // stands after a colon, so no word has to agree with a number. The file
    // word names the download, <folder>-<word>.md, and is best left without
    // spaces.
    'reader-export': 'Export highlights (.md)',
    'reader-import': 'Import',
    'reader-delete-all': 'Delete all',
    'reader-help': 'About highlights',
    'reader-help-what': 'Select words to highlight them and add a note. Figures, diagrams, images, code and formulas have a button in their corner that marks them whole; open a figure to mark a spot in it.',
    'reader-help-keys': 'On a keyboard: n and p step through the highlights, m marks a spot in an open figure.',
    'reader-help-where': 'Highlights and notes are stored only in this browser, on this device.',
    'reader-help-risk': 'That storage can be lost: clearing site data or closing a private window deletes it, and browsers may delete it on their own – Safari, notably on iPhone and iPad, after seven days of Safari use in which this page was not used.',
    'reader-help-backup': 'So export regularly, as a backup: the export is a readable .md file, and importing it brings the highlights back – here, in another browser or on another device.',

    // (The keys line is shown only where a keyboard is likely.)
    // The contents sidebar folds each part to its heading: the name of the
    // button beside a heading that opens or closes its list of slides.
    'reader-fold': 'Slides in this part',
    // The two switches over the sidebar's foot (runtime/print-view.js): how
    // the page is lit and which face the running text is set in.
    'reader-scheme': 'Page',
    'reader-scheme-auto': 'Auto',
    'reader-scheme-light': 'Light',
    'reader-scheme-dark': 'Dark',
    'reader-face': 'Text',
    'reader-face-serif': 'Serif',
    'reader-face-sans': 'Sans',
    'reader-export-file': 'highlights',
    'reader-export-line': 'Exported on {date}. Highlights: {n}, with a note: {notes}.',
    'reader-imported': 'Imported: {added} new, {updated} updated, {orphaned} not found in this version.',
    'reader-import-none': 'This file holds no highlights.',
    'reader-import-skipped': 'Entries that could not be read: {n}.',
    'reader-deleted-all': 'All highlights deleted.',
    // Highlights on figures (plan §11): the button in a figure's corner that
    // marks it whole, the lightbox's two controls, the line a figure's card
    // and its export entry name it by ({key} is its alt text, its label or
    // its file name; {label} the words on the part a pin is on), and what a
    // card says when that part is gone from a rebuilt figure.
    'reader-fig-mark': 'Highlight this figure',
    'reader-lb-spot': 'Mark a spot',
    'reader-lb-close': 'Close',
    'reader-fig': 'Figure “{key}”',
    'reader-fig-at': 'Figure “{key}”, at “{label}”',
    'reader-fig-spot': 'Figure “{key}”, a spot in it',
    'reader-fig-approx': 'Approximate: that part is no longer in this version of the figure.',
    // Code blocks and display formulas: the corner button's name for each,
    // and the lines a card and the export name them by - {line} is the line
    // of the block a highlight starts on, {key} the block's first line or
    // the formula's TeX.
    'reader-code-mark': 'Highlight this code',
    'reader-formula-mark': 'Highlight this formula',
    'reader-code': 'Code, line {line}',
    'reader-code-block': 'Code “{key}”',
    'reader-formula': 'Formula “{key}”',
    // The search field at the head of the ? panel in both live views, and
    // the one line that stands in the panel when nothing matches. The rows
    // themselves are not localised.
    'help-search': 'find a key or an action',
    'help-none': 'no key or action matches',
  },
  de: {
    contents: 'Inhalt',
    'speaker-note': 'Sprechernotiz',
    'presentation-note': 'Anmerkung',
    'pulse-answer': 'Antwort',
    'aside-note': 'Anmerkung',
    type: { principle: 'Grundsatz', definition: 'Definition', example: 'Beispiel',
            question: 'Frage', exercise: 'Aufgabe', outline: 'Überblick',
            figure: 'Abbildung' },
    'title-print': 'Druck',
    'title-print-notes': 'Druck + Notizen',
    'title-lecture': 'Vorlesung',
    'title-speaker': 'Sprecher',
    'untitled-lecture': 'Vorlesung ohne Titel',
    'annotation-label': 'Anmerkung',
    // Not "+ Anmerkung", which is the word the box below the slide already
    // wears: at 45% opacity in the gutter of every slide the longer word is
    // the loudest piece of chrome the projection carries, and the button is
    // a hint for a key rather than a label for the thing it opens.
    'add-note': '+ Notiz',
    'reader-close': 'Inhalt schließen',
    'reader-mark': 'Markieren',
    'reader-note': 'Notiz (optional)',
    'reader-remove': 'Entfernen',
    'reader-removed': 'Markierung entfernt.',
    'reader-undo': 'Rückgängig',
    'reader-orphans': 'In dieser Fassung nicht mehr gefunden',
    'reader-orphan-remove': 'entfernen',
    'reader-session': 'Dieser Browser lässt die Seite keine Markierungen speichern – sie gehen verloren, wenn der Tab geschlossen wird.',
    'reader-nav': 'Markierungen',
    'reader-prev': 'Vorige Markierung',
    'reader-next': 'Nächste Markierung',
    'reader-filter-all': 'alle',
    'reader-filter-notes': 'mit Notiz',
    'reader-export': 'Markierungen exportieren (.md)',
    'reader-import': 'Importieren',
    'reader-delete-all': 'Alle löschen',
    'reader-help': 'Über Markierungen',
    'reader-help-what': 'Wähle Text aus, um ihn zu markieren und eine Notiz dazuzuschreiben. Abbildungen, Diagramme, Bilder, Code und Formeln haben in der Ecke einen Knopf, der sie ganz markiert; in einer geöffneten Abbildung markierst du eine Stelle.',
    'reader-help-keys': 'Mit Tastatur: n und p gehen durch die Markierungen, m markiert eine Stelle in einer geöffneten Abbildung.',
    'reader-help-where': 'Markierungen und Notizen liegen nur in diesem Browser, auf diesem Gerät.',
    'reader-help-risk': 'Dieser Speicher ist nicht sicher: Er ist weg, wenn Websitedaten gelöscht werden oder ein privates Fenster geschlossen wird, und Browser dürfen ihn selbst löschen – Safari, vor allem auf iPhone und iPad, nach sieben Tagen Safari-Nutzung, an denen du diese Seite nicht genutzt hast.',
    'reader-help-backup': 'Exportiere deshalb regelmäßig, als Sicherung: Der Export ist eine lesbare .md-Datei, und importiert bringt er die Markierungen zurück – hier, in einem anderen Browser oder auf einem anderen Gerät.',
    'reader-fold': 'Folien dieses Teils',
    'reader-scheme': 'Seite',
    'reader-scheme-auto': 'Auto',
    'reader-scheme-light': 'Hell',
    'reader-scheme-dark': 'Dunkel',
    'reader-face': 'Schrift',
    'reader-face-serif': 'Serif',
    'reader-face-sans': 'Sans',
    'reader-export-file': 'markierungen',
    'reader-export-line': 'Exportiert am {date}. Markierungen: {n}, mit Notiz: {notes}.',
    'reader-imported': 'Importiert: {added} neu, {updated} aktualisiert, {orphaned} in dieser Fassung nicht gefunden.',
    'reader-import-none': 'Diese Datei enthält keine Markierungen.',
    'reader-import-skipped': 'Nicht lesbare Einträge: {n}.',
    'reader-deleted-all': 'Alle Markierungen gelöscht.',
    'reader-fig-mark': 'Abbildung markieren',
    'reader-lb-spot': 'Stelle markieren',
    'reader-lb-close': 'Schließen',
    'reader-fig': 'Abbildung „{key}“',
    'reader-fig-at': 'Abbildung „{key}“, bei »{label}«',
    'reader-fig-spot': 'Abbildung „{key}“, eine Stelle darin',
    'reader-fig-approx': 'Ungefähr: Diesen Teil gibt es in dieser Fassung der Abbildung nicht mehr.',
    'reader-code-mark': 'Code markieren',
    'reader-formula-mark': 'Formel markieren',
    'reader-code': 'Code, Zeile {line}',
    'reader-code-block': 'Code „{key}“',
    'reader-formula': 'Formel „{key}“',
    'help-search': 'Taste oder Aktion suchen',
    'help-none': 'Keine Taste und keine Aktion passt',
  },
};

// A `lang:` with no wording table is a warning, not an error, and the build
// falls back to English: `lang: fr` is a correct tag the hyphenator honours
// today, and refusing it would stop an existing lecture from building, which
// the 1.0.0 contract forbids. Said once per build, like warnOversizedAsset,
// and it names the way out.
const localeWarned = new Set();
function warnUnknownLocale(tag) {
  if (localeWarned.has(tag)) return;
  localeWarned.add(tag);
  console.warn(
    `[lang] no wording for "lang: ${tag}" – the generated labels stay English.\n` +
    `        Locales this build knows: ${Object.keys(STRINGS).join(', ')}.\n` +
    `        Override single words with a labels: block in the frontmatter.`);
}

// The resolved words for this lecture. Looked up by the primary subtag
// (`de-AT` → `de`); an author's top-level `labels:` block overrides single
// entries. Pure - resolved once in the buildOnce pre-flight and passed into
// the three renderers, which never call this themselves.
function lectureStrings(frontmatter = {}) {
  const tag = lectureLang(frontmatter);
  const primary = tag.split('-')[0].toLowerCase();
  const base = STRINGS[primary];
  if (!base && primary !== 'en') warnUnknownLocale(tag);
  return mergeLabels(base || STRINGS.en, frontmatter);
}

// The top-level `labels:` block. Its keys are the role names of STRINGS.en
// (with the nested `type:` map for the tag words); its values are free text,
// used verbatim. Unknown key fails the build with the shape styleSettings
// uses, and lint.js mirrors it as `unknown-label-key` - a top-level block
// rather than `style: {labels: {…}}` because `style.labels` is already the
// on/off switch and every other `style:` key is a closed vocabulary the
// linter whitelists.
function mergeLabels(base, frontmatter = {}) {
  const raw = frontmatter.labels;
  if (raw == null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error(
      'Frontmatter: "labels:" is a block of keys, not a single value.\n' +
      '  labels:\n    contents: Inhalt\n    type:\n      exercise: Übung');
    err.userFacing = true;
    throw err;
  }
  const out = { ...base, type: { ...base.type } };
  const topKeys = Object.keys(STRINGS.en).filter(k => k !== 'type');
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'type') {
      if (typeof v !== 'object' || Array.isArray(v)) {
        const err = new Error(
          'Frontmatter: "labels.type:" is a block of tag words, not a single value.\n' +
          '  labels:\n    type:\n      exercise: Übung');
        err.userFacing = true;
        throw err;
      }
      for (const [tk, tv] of Object.entries(v)) {
        if (!(tk in base.type)) {
          const err = new Error(
            `Frontmatter: labels.type has no key "${tk}".\n` +
            `  Keys: ${Object.keys(STRINGS.en.type).join(', ')}`);
          err.userFacing = true;
          throw err;
        }
        out.type[tk] = String(tv);
      }
      continue;
    }
    if (!topKeys.includes(k)) {
      const err = new Error(
        `Frontmatter: labels has no key "${k}".\n` +
        `  Keys: ${topKeys.join(', ')}, type`);
      err.userFacing = true;
      throw err;
    }
    out[k] = String(v);
  }
  return out;
}

// A CSS string literal for a `content:` value: there is no CSS.escape in
// Node, and the word can arrive from an author's labels: block, so escape
// the backslash, the double quote and a newline (folded to the CSS escape
// for U+000A) before it is wrapped in quotes.
function cssString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\A ');
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
// overrides key off – see the dark-surfaces block in runtime/audience.css.
const DARK_THEME_NAMES = ['dark', 'terminal-amber', 'terminal-green'];
// The `dark` theme's palette, for the documents' dark scheme (printDarkCss):
// the same palette on the reader's screen as body[data-theme=dark] in
// runtime/audience.css, one dark theme across the four views rather than a second
// one invented for print. A copy, because the theme gates read that block
// as text; the semantics gate holds the two equal.
const DARK_TOKENS = {
  paper: 'oklch(0.17 0.005 260)',
  'paper-warm': 'oklch(0.22 0.008 260)',
  ink: 'oklch(0.95 0 0)',
  'ink-soft': 'oklch(0.68 0.01 260)',
  rule: 'oklch(0.38 0.01 260)',
  emph: 'oklch(0.76 0.15 35)',
};
// The documents' own paper palette, the one :root in runtime/print.css
// sets. Named so the dark scheme can put it back on the few things that must stay on
// light paper there - a picture drawn for a white page, the reversed cover.
const PRINT_LIGHT_TOKENS = {
  ink: '#1f1f24',
  'ink-soft': '#6b6b72',
  paper: '#fafaf7',
  rule: '#c8c8c0',
  emph: '#8b2e00',
};
const tokenDecls = (t, indent = '  ') => Object.entries(t).map(([k, v]) => `${indent}--${k}: ${v};`).join('\n');

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
// Written in the order the # key walks them, and filled into
// runtime/audience.js rather than restated there, so the cycle and the vocabulary
// cannot come apart. One press from the default is the mode most lectures
// want: leave my zoom alone, but do not let a slide run off the screen.
const AUTO_FIT_CYCLE = ['off', 'shrink', 'full'];
// Written in the order the refusal message lists them, which is the order
// lint.js lists them in: the two that were always there, then the new one.
const AUTO_FIT_FROM_KEY = { 'true': 'full', 'false': 'off', shrink: 'shrink' };

// A style key that used to exist and does not any more. The message an author
// gets for one of these has to say what happened, not just that the key is
// unknown: they wrote it because it did something, and "no such key" reads as
// a typo they did not make. Same courtesy the refused `::: draw` opener pays.
const STYLE_KEYS_REMOVED = {
  reveal: 'Every reveal reserves its space now, which is what `hold` bought – delete the key.',
};
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
  // The `+ note` affordance in the slide's left gutter. A lecture wants it
  // (the key it stands for is otherwise undiscoverable); a keynote that is
  // rehearsed and has nothing to annotate wants the frame clean, and at 45%
  // opacity on every active slide it is the one piece of chrome a
  // photographed projection always carries. `off` hides the button and
  // nothing else - N still opens an annotation, so this costs no ability.
  ['note-button',   'noteButton', ['on', 'off']],
  // What the projection does with the slide before and the slide after.
  // `dim` is the lecture behaviour and the default: the camera pans through
  // a column and the neighbours stand there faintly, which is the whole
  // reason the view is one long board rather than a stack of cards. `hidden`
  // is the keynote answer - a frame that shows the slide and nothing else.
  ['neighbours',    'neighbours', ['dim', 'hidden']],
  // What a slide change looks like. `pan` is the lecture behaviour and the
  // default: the stage is one continuous column and the camera glides to
  // the next chunk over --camera-duration, which is what tells the room
  // that the slides are a board rather than a pile. `cut` lands the camera
  // in no time at all and `fade` dips the stage through the paper and back,
  // which are the two things every other slide tool does and the two a
  // keynote is usually asking for. Only the *slide change* is affected: a
  // reveal, a figure step, a .middle chunk's per-press glide and the walk
  // down a chunk taller than the frame all keep their motion in every mode,
  // because those are things happening on a slide that is already there.
  ['transition',    'transition', ['pan', 'cut', 'fade']],
  // The reader's tools in the two documents - print.html and
  // print-notes.html, read on a screen after the lecture. `on` is the
  // default and gives the reader a contents sidebar that knows where they
  // are; `off` ships none of it, neither the sidebar nor its script nor a
  // body attribute for its CSS to match, and leaves the lightbox, which is
  // how a figure is read rather than a tool of the reader's. The live views
  // do not read the key: a projection is driven by keys and clicks already.
  ['reader',        'reader',     ['on', 'off']],
  // Every dark theme on a true black ground. A projector cannot show black:
  // what it throws for a dark grey paper is a lit rectangle on the wall, and
  // the words lose the contrast the dark theme was chosen for. `on` takes
  // --paper to #000 under the three dark themes and under any later one,
  // because the rule keys off data-mode and not off a theme name; a light
  // theme shows nothing of it, and the switch stays set for the next press
  // of A. Not a theme of its own, since it is one answer for all of them,
  // and a reading preference like the theme: the frontmatter pins it,
  // otherwise the reader's stored choice holds, and the palette's
  // `pitchblack` command toggles it in either window. The owner's word.
  ['pitchblack',    'pitchblack', ['on', 'off']],
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
// paper, which is what runtime/print.css has always given a strong.
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
// runtime/print.css's bare strong, and above the promoted-bullet rule
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

// ── inline code in running text (style: {code}) ──────────────────────
//
// What the two stylesheets set an inline code span at before this key
// existed, and what `plain` puts it back to. Also the floor the other two
// looks fall back to when a pairing carries no measurement.
const CODE_SIZE_PLAIN = 0.92;
// `spaced` and `tint` size the mono to the prose face's own x-height instead,
// and then take 4% off it. The ratio of the two measurements is the part that
// is measured (see `xHeight` in BUNDLED_FONTS); this factor is the part that
// is taste, and it is deliberately below 1. Level x-heights still leave the
// mono reading as the heavier face - its stems are wider and its counters
// larger at the same height - and code inside a sentence should be the
// quieter of the two, because the sentence is what carries the argument.
const CODE_XHEIGHT_RATIO = 0.96;
// Inline code in running text, and only there. A span in a heading has its
// own treatment (.chunk-heading code, smaller again and upright), a listing
// is a block rather than a span, and the blocked-embed card is chrome.
// Specificity is carried by the :not() arguments - (0,3,5) live, (0,1,4) on
// paper - so both sit above the base rules they add to.
//
// Live, it is anywhere in a chunk, as on paper, and not only in .chunk-body:
// a cover's or a closing slide's body, a divider's, an overlay card and a
// dock all stand outside it, and a span there got none of this - not the
// size, not the spaced pair, not even the mono face, which fell back to the
// browser's own monospace at 1em ("Abgabe mit inf upload:" on a closing
// slide, the gap inside the span twice the gaps around it).
const INLINE_CODE_SEL = {
  live: ['.chunk code:not(pre code):not(.chunk-heading code):not(.embed-blocked code)'],
  print: ['code:not(pre code):not(.chunk-heading code)'],
};
// One selector list, written once and distributed over its parts, so the
// guard a look needs and the `:not(.nb)` `spaced` needs cannot be spelled
// two ways in the same file. `guard` is a body attribute or '' and `extra`
// a further :not - both go on every part, which is what a comma-separated
// list means and what hand-writing one gets wrong.
const inlineCodeSel = (view, guard = '', extra = '') =>
  INLINE_CODE_SEL[view].map(s => `${guard ? guard + ' ' : ''}${s}${extra}`).join(',\n');
// The code size for one prose face, as a number of em, or null when either
// side of the pairing carries no measurement. Three decimals: the difference
// between two adjacent thousandths is a hundredth of a pixel on a projector,
// and a fourth would only make the emitted CSS harder to read.
function codeEm(proseXh, monoXh) {
  if (!proseXh || !monoXh) return null;
  return Math.round(CODE_XHEIGHT_RATIO * (proseXh / monoXh) * 1000) / 1000;
}
// Which faces this lecture resolved to, answered as x-heights. A role the
// author filled from fonts/ has no measurement, and neither has any role
// under `fonts: none`, where what resolves is whatever the presenting
// machine happens to have - so both come back null and the look falls back
// to CODE_SIZE_PLAIN for that pairing rather than guessing.
function codeSizingFor(roster, claimed, bundleOff) {
  const xh = (role) => {
    if (bundleOff || claimed.has(role)) return null;
    const f = BUNDLED_FONTS[roster[role]];
    return (f && f.xHeight) || null;
  };
  const mono = xh('mono');
  const unmeasured = ['serif', 'sans', 'mono'].filter(r => !xh(r));
  return {
    serif: codeEm(xh('serif'), mono),
    sans: codeEm(xh('sans'), mono),
    // The reading-mono body mode is the mono face set as prose, so the two
    // x-heights are the same one and the ratio is the bare factor. Written
    // out rather than special-cased, because --read-mono-stack may resolve
    // to an installed iA Writer face before it reaches the bundled mono and
    // the number is right either way: it is the deliberate undersize, not a
    // correction between two faces.
    mono: mono ? CODE_XHEIGHT_RATIO : null,
    unmeasured,
  };
}
// Everything about the key that the two stylesheets cannot say, emitted after
// the view's stylesheet. Two things arrive here and they are mutually
// exclusive.
//
// Under a sized look it is the size, which is per lecture: the ratio between
// the prose face's x-height and the mono's is a property of this roster, and
// a constant cannot know it. Live emits one rule per reading face, because
// `F` switches the prose face under the reader's hands and the code has to
// follow it; print emits one, for whichever face `print-body` put on the
// page. No data-code guard on those: the sizes exist only when the look is
// not plain, and a second guard would only be a place for the two to
// disagree.
//
// Under `plain` it is the reset - the way back to the rendering before this
// key existed. It has to undo the unattributed spaced rule AND outrank any
// size rule, and it is emitted here rather than in the stylesheet for the
// second of those: the sizes land after the stylesheet at the same
// specificity, so a reset written up there would lose on source order the
// day someone emits a size under plain too.
function codeTag(st, sizing, view) {
  if (st.code === 'plain') {
    return `<style>\n${inlineCodeSel(view, 'body[data-code=plain]')} {\n` +
           `  margin: 0;\n  word-spacing: normal;\n  font-size: ${CODE_SIZE_PLAIN}em;\n}\n</style>`;
  }
  if (!sizing) return '';
  const rules = [];
  if (view === 'print') {
    const em = st['print-body'] === 'sans' ? sizing.sans : sizing.serif;
    if (em) rules.push(`${inlineCodeSel('print')} { font-size: ${em}em; }`);
    // The reader may set the text in the other face on screen
    // (runtime/print-view.js), and the code size is a pairing with the prose
    // face.
    const faced = ['serif', 'sans'].filter(f => sizing[f])
      .map(f => `${inlineCodeSel('print', `:root[data-face=${f}] body`)} { font-size: ${sizing[f]}em; }`);
    if (faced.length) rules.push(`@media screen {\n${faced.join('\n')}\n}`);
  } else {
    for (const face of ['serif', 'sans', 'mono']) {
      if (!sizing[face]) continue;
      rules.push(`${inlineCodeSel('live', `body[data-font=${face}]`)} { font-size: ${sizing[face]}em; }`);
    }
  }
  return rules.length ? `<style>\n${rules.join('\n')}\n</style>` : '';
}

const STYLE_SPEC = {
  // Where a heading sits. `auto` keeps the per-tag treatment (a figure's
  // caption is centred over its artwork); `left` overrides it, and `center`
  // puts every heading on a centre axis, which is what an author who wants one
  // axis of alignment through the whole deck is asking for.
  // A question used to be centred under `auto` and is not any more: it centred
  // the heading and not the paragraph under it, so the slide carried two axes.
  // The stylesheet says why beside `.chunk[data-tag=question]`.
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
  // A figure's base label against the body type it stands in. 1 means a label
  // is set at the size of the words around it, which is what the live views do
  // now and what the room needs: a label is a word, and there is no running
  // text beside a projected figure to excuse a smaller one. The documents ask
  // the same question and answer it 0.9 (--dg-fig-size in
  // runtime/print.css), because on paper a figure IS apparatus inside a column of prose.
  //
  // Bounded more tightly than the two above, and in the direction that costs
  // something: the figure's width is this number times --dg-type-w, so 1.6
  // already caps most drawings at the column and pulls the slide's own type
  // down to meet them (fitZoomToChunk), and under 0.6 the labels are the
  // defect. What it cannot do is make a figure legible that has more grid
  // units than the column has room for - that is a drawing to redraw, and
  // the build names it.
  'figure-type':   { kind: 'num', min: 0.6, max: 2, dflt: 1 },
  // The display face's own size, and the one place taste gets a say over a
  // measurement. The roster's size-adjust numbers normalise ADVANCE WIDTH,
  // because line count is the failure that breaks a slide - a headline that
  // takes one line too many runs off the frame, where one that reads small is
  // merely weak. Apparent size therefore varies, and measurably: against
  // Literata's ink height the roster runs from 0.38 (Silkscreen) to 1.34
  // (Patrick Hand), which rendered is a Silkscreen divider as a thin band on
  // an empty frame beside an Anton one that fills it. No automatic correction
  // closes that without bringing the overflow back - pulling Silkscreen's ink
  // to 0.85 needs a scale near 1.39, at which it sets 2.2x Literata's width.
  // So the build answers the question it can measure and this key answers the
  // one that is taste.
  //
  // It is not `heading-scale`, which does not reach --title-lead: a cover's
  // type size is set by its composition, not by the heading ladder. And it
  // multiplies the measured percentage at the single site that emits it, so
  // everything the correction already reaches - the six cover compositions,
  // print, the zoom, auto-fit, --check-fit and the line heights - follows
  // without a second place knowing the key exists. Bounded like its two
  // neighbours; below 0.6 a headline stops being one and above 1.8 no cover
  // composition holds it.
  'display-scale': { kind: 'num', min: 0.6, max: 1.8, dflt: 1 },
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
  // A `::: draw` used to be outside this key, because its <svg> was emitted
  // 2000px wide under max-width: 100% and filled the measure at every chunk
  // width - there was no space beside it to align in. Both media size a
  // drawing from its type now, so the box hugs the picture and the key reaches
  // it in both: see main .psi-diagram in runtime/print.css and
  // .chunk .psi-diagram in runtime/audience.css.
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
  // What hue the greys carry. In the four light themes the A key moves
  // --emph and nothing else: --ink is fixed at chroma 0.01 on hue 260,
  // --paper and --rule at chroma 0. Every tinted surface is mixed out of
  // --ink (a card is 5% of it, a dock and an overlay card 4%), so a card
  // under a light-orange or light-red accent is a cool grey under a warm
  // word - the two agree only in light-blue, and there by coincidence. The
  // dark and terminal themes never had the problem, because there --ink
  // moves with the theme.
  //
  //   neutral - today's rendering, and the default. A deck that says
  //             nothing builds byte-identical HTML.
  //   tinted  - the greys take the accent's own hue at low chroma, so the
  //             slide reads as one palette whichever accent the room gets.
  //   warm    - a fixed warm grey (hue 70), the accent notwithstanding.
  //   cool    - a fixed cool grey (hue 250), which is where the neutrals
  //             already sit; writing it makes today's cast a choice and
  //             carries it into --paper and --rule, which are at chroma 0.
  //
  // warm and cool are held off the two terminal themes on purpose: a single
  // phosphor tone is what those are, and a warm-grey paper under green ink
  // is neither. tinted needs no such guard - there the accent's hue IS the
  // theme's, so it resolves to what the theme already does.
  neutrals: { kind: 'enum', values: ['neutral', 'tinted', 'warm', 'cool'], dflt: 'neutral' },
  // The same question for the two documents, and a separate key because the
  // two grounds are not the same ground. Print's palette is already warm
  // where the live one is cool at chroma 0 - paper #fafaf7 against
  // oklch(0.98 0 0) - so a deck can reasonably want the page warm and the
  // projection cool, or the other way round, and one key could say only one
  // of those.
  //
  // Its default is not a value but a deferral: '' is the seeded default and
  // no written value can be '', so an unset key is a fifth state and
  // printNeutrals() is the documented step that turns it into one. Writing
  // `neutrals: warm` alone therefore warms both, which is what an author who
  // writes one key means; writing both says they differ on purpose. Reading
  // this key anywhere else with a fallback of 'neutral' would silently make
  // an unset key mean neutral rather than follow - the trap
  // print-slide-numbers carries the same note for.
  'print-neutrals': { kind: 'enum', values: ['neutral', 'tinted', 'warm', 'cool'], dflt: '' },
  // Which of a title pair's two lines is the loud one. The cover has
  // carried a pair since `subtitle:` landed, and so has every divider and
  // closing slide through `Heading | Sub`; what none of them had is a way
  // to say that the first line is the quiet one.
  //
  //   stacked - the title large, the subtitle quieter underneath it.
  //             Today's rendering, and the default.
  //   eyebrow - the title set small above a subtitle that carries the
  //             weight. The newspaper kicker, and the shape a lecture
  //             title takes when the first line names the field and the
  //             second asks the question.
  //
  // `title:` stays the content key of whichever line is loud, and that is
  // the reason this is a treatment rather than a second pair of content
  // keys. `title:` is also the <title> element, the TOC entry and what the
  // search index reads: inverting the hierarchy by telling authors to put
  // the hook in `title:` would rename the browser tab to the hook and
  // leave the lecture's own name nowhere. So the words do not move and
  // only their type does - which is also what lets one key serve the
  // cover, the dividers and the closing slide at once.
  headline: { kind: 'enum', values: ['stacked', 'eyebrow'], dflt: 'stacked' },
  // Whether the small type around a title is set in capitals. The
  // *tracking* that has to come with them is deliberately not a key:
  // capitals at the tracking of lowercase read as one jammed word, which
  // is a typographic rule and not a preference, so the build applies it
  // itself - to the line an author typed in capitals as much as to the
  // line this key transforms. See `isAllCaps`.
  //
  // It reaches the eyebrow, the presenter and the affiliation, and
  // deliberately not the headline: a key that capitalises the loud line is
  // a key that makes a talk shout.
  caps: { kind: 'enum', values: ['off', 'on'], dflt: 'off' },
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
  // because runtime/print.css names the serif on `html` and every reader of a
  // document is the author's choice rather than the reader's.
  //
  // It sits in `style:` next to `hyphenate`, which is the other key here
  // whose effect lands in the two document views and nowhere else, and it
  // rides the same styleBodyAttrs into every renderer. One rule carries it,
  // on `body`, because everything in runtime/print.css that should be a
  // sans already names one: the tag word, a figure's caption, a sub-heading, the contents
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
  // Where a ::: marginalia and a ::: footnote print. On the projection the
  // one stands in the slide's right margin and the other under the slide; in
  // the documents both were blocks in the text column, and the empty outer
  // margin the print layout keeps (main's rule in runtime/print.css's
  // @media print block) is where they belong.
  //
  //   margin - the default, in every print view: a marginalia beside the
  //            block it is written before, a footnote beside the block it is
  //            written after (renderChunk, footnoteSlots), on a screen wide
  //            enough to have a margin and on paper; a narrow window falls
  //            back to the two blocks as they were.
  //   inline - both in the column, the handout as it was before the margin.
  //
  // It was a deferral for a while - margin in a kind: document, inline in a
  // lecture - and the lectures' handouts moved to the margin on purpose.
  'print-marginalia': { kind: 'enum', values: ['inline', 'margin'], dflt: 'margin' },
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
  // How an inline code span looks in running text - `async def` inside a
  // sentence, not a listing. Two things about a monospaced face set inside a
  // proportional one are measurable rather than matters of taste, and the
  // default answers both.
  //
  // A mono space is about 0.55 em where the prose word space is about 0.25,
  // so a span of more than one token reads as a hole: the gap inside
  // "async def" is wider than the gaps around it, and the room sees three
  // words where the author wrote two. And the mono's x-height is the larger
  // of the two - JetBrains Mono is 0.550 against Literata's 0.507 - so at one
  // font-size the code shouts inside its own sentence.
  //
  //   plain  - the rendering up to 1.0.0 and nothing else: the mono face at
  //            0.92em. A finished deck writes this to keep the look it had.
  //   spaced - the default. A span WITH whitespace in it gets a hair of
  //            outer margin and has its inner word spaces pulled in, so the
  //            gaps around the span come out wider than the gaps inside it.
  //            A single-token span gets neither, because it has no hole to
  //            close and an indent where a line opens with one would be
  //            visible. Sized by x-height, see CODE_XHEIGHT_RATIO.
  //   tint   - a dimmed ground behind every span, one token or many, padded
  //            left and right ONLY: a vertical padding would change the
  //            leading of whichever line the span happens to fall on, so a
  //            paragraph would set differently for carrying one. Sized by
  //            x-height too.
  //
  // This is the one key in this table whose own default moves what an
  // existing deck renders, `slide-numbers` in the viewer defaults being the
  // other such change in the format. `code: plain` is the way back, and the
  // 1.0.0 recipe in the appearance skill carries it.
  code: { kind: 'enum', values: ['plain', 'tint', 'spaced'], dflt: 'spaced' },
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
        (STYLE_KEYS_REMOVED[k] ? `  ${STYLE_KEYS_REMOVED[k]}\n` : '') +
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
// The `prompter:` block - how the live prompter (--prompter) behaves
// for this deck. Read in the buildOnce pre-flight beside styleSettings so a
// typo fails every build, not only the one that starts the sidecar. Mirrored
// in lint.js as SOUFFLEUSE_ENUMS / SOUFFLEUSE_NUM_KEYS / SOUFFLEUSE_FREE_KEYS,
// and test/gates/tails.mjs holds the two key sets equal. `model` is any
// OpenRouter model id, `language` a BCP-47 tag that defaults to `lang:`,
// `cadence` the seconds of new speech that earn the model a call, `cooldown`
// the seconds of silence a shown hint buys, `cues` whether the prompter may
// lay cards into upcoming chunks, `calls-per-hour` the most calls to the
// model in any sixty minutes - a hard ceiling on what a run can cost, set at
// one call per ten seconds, the cadence's own floor, so a talk at any legal
// cadence stays under it. docs/history/PLAN-souffleuse.md has the reasoning.
const SOUFFLEUSE_SPEC = {
  'model':    { kind: 'text', dflt: 'anthropic/claude-sonnet-5' },
  'language': { kind: 'lang', dflt: null },
  'cadence':  { kind: 'number', min: 10, max: 120, dflt: 25, unit: 'seconds' },
  'cooldown': { kind: 'number', min: 10, max: 600, dflt: 20, unit: 'seconds' },
  'cues':     { kind: 'enum', values: ['on', 'off'], dflt: 'on' },
  'calls-per-hour': { kind: 'number', min: 10, max: 1000, dflt: 360, unit: 'calls' },
};
function souffleuseSettings(frontmatter = {}) {
  const raw = frontmatter.prompter;
  const out = {};
  for (const [k, spec] of Object.entries(SOUFFLEUSE_SPEC)) out[k] = spec.dflt;
  if (raw == null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error(
      'Frontmatter: "prompter:" is a block of keys, not a single value.\n' +
      '  prompter:\n    model: anthropic/claude-sonnet-5\n    cadence: 25');
    err.userFacing = true;
    throw err;
  }
  for (const [k, v] of Object.entries(raw)) {
    const spec = SOUFFLEUSE_SPEC[k];
    if (!spec) {
      const err = new Error(
        `Frontmatter: prompter has no key "${k}".\n` +
        `  Keys: ${Object.keys(SOUFFLEUSE_SPEC).join(', ')}`);
      err.userFacing = true;
      throw err;
    }
    const val = String(v == null ? '' : v).trim();
    if (spec.kind === 'enum') {
      if (!spec.values.includes(val)) {
        const err = new Error(
          `Frontmatter: "prompter.${k}: ${val}" is not a value this key accepts.\n` +
          `  Valid values for ${k}: ${spec.values.join(', ')}`);
        err.userFacing = true;
        throw err;
      }
      out[k] = val;
    } else if (spec.kind === 'number') {
      const n = Number(val);
      if (!val || !Number.isFinite(n) || n < spec.min || n > spec.max) {
        const err = new Error(
          `Frontmatter: "prompter.${k}: ${val}" is not a number of ${spec.unit} between ${spec.min} and ${spec.max}.`);
        err.userFacing = true;
        throw err;
      }
      out[k] = n;
    } else if (spec.kind === 'lang') {
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(val)) {
        const err = new Error(
          `Frontmatter: "prompter.language: ${val}" is not a language tag.\n` +
          '  Expected something like: en, de, de-DE, en-GB, fr.');
        err.userFacing = true;
        throw err;
      }
      out[k] = val;
    } else {
      if (!val) {
        const err = new Error(`Frontmatter: "prompter.${k}" is set to nothing.`);
        err.userFacing = true;
        throw err;
      }
      out[k] = val;
    }
  }
  return out;
}
// The settings as one <style> element plus the two body attributes the
// selectors key off. Emitted for every view, print included: a lecture set
// in a larger body size should print in one.
function styleBlockCss(st, S) {
  const rootVars = [];
  if (st['heading-scale'] !== 1) rootVars.push(`--heading-scale: ${st['heading-scale']};`);
  if (st['body-scale'] !== 1) rootVars.push(`--body-scale: ${st['body-scale']};`);
  // Read by the live width rule (.chunk .psi-diagram) through a var() fallback
  // of 1, so a deck that says nothing emits nothing and builds byte-identical
  // HTML. Print has its own --dg-fig-size and does not read this.
  if (st['figure-type'] !== 1) rootVars.push(`--figure-type: ${st['figure-type']};`);
  const rules = [];
  if (rootVars.length) rules.push(`:root { ${rootVars.join(' ')} }`);
  // The projection's one generated eyebrow, EXERCISE, is a CSS `content:`
  // string and cannot read the strings table. Rather than change the base
  // rule in runtime/audience.css – which would move a byte in every deck, localised
  // or not, and break the 1.0.0 contract – the localised word rides in as a
  // same-specificity override emitted here, after the main stylesheet, so it
  // wins on source order. Emitted only for the live views (S is passed there,
  // not for print, whose eyebrow is a <span> of real text) and only when the
  // word differs from the default, so an English deck's CSS is byte-identical
  // to before. Uppercased to match the projection – all-small-caps leaves
  // capitals as full caps, which is why EXERCISE is written in caps.
  if (S && S.type && S.type.exercise) {
    const word = S.type.exercise.toUpperCase();
    if (word !== STRINGS.en.type.exercise.toUpperCase()) {
      rules.push(`.chunk[data-tag=exercise] .chunk-content::before { content: "${cssString(word)}"; }`);
    }
  }
  return rules.length ? `<style>${rules.join(' ')}</style>` : '';
}
// The documents' neutrals, and the one place the deferral is resolved. An
// unset `print-neutrals` is not `neutral`, it is "whatever the live views
// are set to" - see the note on the key in STYLE_SPEC, and printSlideNums()
// for the same shape one block over.
function printNeutrals(st) {
  return st['print-neutrals'] || st.neutrals || 'neutral';
}
function styleBodyAttrs(st, frontmatter = {}) {
  const parts = [];
  if (st.headings !== 'auto') parts.push(`data-headings="${st.headings}"`);
  if (st.rules !== 'on') parts.push('data-rules="off"');
  if (st.labels !== 'on') parts.push('data-labels="off"');
  if (st.neutrals !== 'neutral') parts.push(`data-neutrals="${st.neutrals}"`);
  // Both attributes on both bodies: the stylesheets pick, runtime/audience.css on
  // data-neutrals and runtime/print.css on data-print-neutrals, so neither has to
  // know which view it is in.
  const pn = printNeutrals(st);
  if (pn !== 'neutral') parts.push(`data-print-neutrals="${pn}"`);
  if (st.headline !== 'stacked') parts.push(`data-headline="${st.headline}"`);
  // `data-title-caps` and not `data-caps`: the renderer writes a bare
  // data-caps on each slot that is already in capitals, and one name doing
  // both jobs would make `body[data-caps]` and `[data-caps]` the same
  // selector at two scales.
  if (st.caps !== 'off') parts.push('data-title-caps="on"');
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
  // `spaced` is the unattributed rule in both stylesheets, `plain` the reset
  // back to the rendering before the key existed (emitted by codeTag, which
  // is where it can outrank the sizes) and `tint` an addition on top.
  if (st.code !== 'spaced') parts.push(`data-code="${st.code}"`);
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
// words - and `style.wrap` has reached runtime/print.css since it
// landed, so a per-chunk form that stopped at the projection would
// contradict the key it is named after.
function chunkStyleAttrs(chunk) {
  const ov = chunk && chunk.styleOverrides;
  if (!ov) return '';
  let out = '';
  if (ov.wrap) out += ` data-wrap="${ov.wrap}"`;
  if (ov.blocks) out += ` data-blocks="${ov.blocks}"`;
  // The third one is a number, and it carries the per cent the class spelled
  // rather than the multiplier: an attribute selector matches a string, and a
  // rule per step is how a bounded set of words becomes a custom property
  // without a style attribute on the article - which the cover already uses
  // for its ratio, and two style attributes on one element is one too many.
  if (ov['figure-type']) out += ` data-figure-type="${ov['figure-type']}"`;
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
// What a source.md is. `lecture` is every deck there has ever been and the
// default; `document` is a long piece of prose that is read and never
// projected - a course syllabus was the first - and it builds the printed
// document alone. Not a viewer default: it does not say how a view opens
// but which views there are, so it is a top-level key of its own, refused
// in the pre-flight like the twelve when the value is a word it does not
// know. lint.js mirrors the two words (`unknown-kind`).
//
// What a document changes, all of it in the print renderer and its
// stylesheet: the parts and their chunks are numbered (1, 1.1) in the
// headings, the printed contents and the reader's sidebar, so the source
// carries no numbers; the slide number in the margin and the type word over
// a chunk are gone; the cover is a masthead on paper rather than a page of
// its own; and a ::: marginalia stands in the right margin beside the block
// it is written before (style: {print-marginalia}). lint.js drops the
// checks that only a projected slide needs (DOCUMENT_QUIET there).
const LECTURE_KINDS = ['lecture', 'document'];
function lectureKind(frontmatter = {}) {
  if (frontmatter.kind == null) return 'lecture';
  const raw = String(frontmatter.kind).trim();
  if (!LECTURE_KINDS.includes(raw)) {
    const err = new Error(
      `Frontmatter: "kind: ${raw}" is not a value this key accepts.\n` +
      `  Valid values for kind: ${LECTURE_KINDS.join(', ')}\n` +
      '  `kind: document` builds print.html alone, for prose that is read and not projected.');
    err.userFacing = true;
    throw err;
  }
  return raw;
}
const isDocumentKind = (frontmatter) => lectureKind(frontmatter) === 'document';
// Where a ::: marginalia and a ::: footnote print: `margin` (the default,
// documents and lectures alike) or `inline`, the blocks in the text column
// they used to be. One reader, so the body attribute and the footnote slots
// in renderChunk cannot disagree.
function printMarginalia(st) {
  return st['print-marginalia'] || 'margin';
}
// The numbers a document prints: 1, 2, … for its parts and 1.1, 1.2, … for
// the chunks of each part that carry a heading. A chunk before the first
// part is front matter and goes unnumbered, and so does one with no heading
// - a number on a heading that is not there would be a number nobody can
// find on the page - as do the cover, a closing chunk and an outline, which
// are not sections. One walk, read by the headings, the printed contents
// and the sidebar alike, so the three cannot disagree.
function documentNumbers(columns) {
  const part = new Map();
  const chunk = new Map();
  let p = 0;
  for (const col of columns) {
    if (!col.heading) continue;
    p += 1;
    part.set(col, String(p));
    let k = 0;
    for (const c of col.chunks) {
      if (!c.heading || ['title', 'closing', 'outline'].includes(c.tag)) continue;
      k += 1;
      chunk.set(c, `${p}.${k}`);
    }
  }
  return { part, chunk };
}
// How a slide change is drawn: pan (the default), cut or fade.
function slideTransition(frontmatterDefaults = {}) {
  return frontmatterDefaults.transition || 'pan';
}
// What the projection does with the slide before and the slide after, once
// the transition has had its say. The same shape as printSlideNums(), for
// the same reason: viewDefaults() writes a key only when the frontmatter
// carried it, so "unset" is a fourth state, and this is the one documented
// step that turns it into a value.
//
// `neighbours` when the author wrote one. Otherwise `dim` under a pan, and
// `hidden` under a cut or a fade – where the camera does not travel, so a
// neighbour is never passed on the way and the only thing a dimmed one can
// do is sit at the edge of a zoomed-out frame or smear through a fade. The
// author can still write `dim` next to either and get it.
function neighbourMode(frontmatterDefaults = {}) {
  if (frontmatterDefaults.neighbours) return frontmatterDefaults.neighbours;
  return slideTransition(frontmatterDefaults) === 'pan' ? 'dim' : 'hidden';
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
    // These two are written only when the author turned them off, because
    // both stylesheets ask for the off-value by name and the on-value is the
    // absence of the attribute. A deck that says nothing about either builds
    // exactly the bytes it did before the keys existed. applyFontTheme()
    // writes them in full once the runtime is up, which is what lets M
    // toggle the first of them.
    defaults.noteButton === 'off' ? 'data-note-button="off"' : '',
    // Same arrangement, one step further on: the value written is the
    // resolved one, because `cut` and `fade` imply `hidden`. A deck that
    // pins neither still carries neither attribute.
    neighbourMode(defaults) === 'hidden' ? 'data-neighbours="hidden"' : '',
    slideTransition(defaults) !== 'pan' ? `data-transition="${slideTransition(defaults)}"` : '',
    // And once more: `on` is written, `off` is the absence, so a deck that
    // does not say `pitchblack:` carries no attribute until the runtime or
    // the boot script below writes the reader's own choice.
    defaults.pitchblack === 'on' ? 'data-pitchblack="on"' : '',
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
// nothing to resolve for it.
//
// `pitchblack` is the second thing settled here, for the same reason in a
// smaller size: a reader who switched it on would otherwise see the dark
// theme's own grey paper for the frames before the runtime boots, which on
// a projector is the flash the switch exists to remove. Stored choice only -
// the operating system has no opinion on it. Each half is emitted only where
// the frontmatter left its question open, and with both pinned there is no
// script at all.
function themeBootScript(defaults) {
  const theme = defaults.theme ? '' : `
  var names = ${JSON.stringify(THEME_NAMES)};
  var dark = ${JSON.stringify(DARK_THEME_NAMES)};
  var set = function (t) { d.theme = t; d.mode = dark.indexOf(t) >= 0 ? 'dark' : 'light'; };
  var stored = null;
  try { stored = localStorage.getItem('psi-slides:theme'); } catch (e) {}
  if (stored && names.indexOf(stored) >= 0) set(stored);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) set('dark');`;
  const pitch = defaults.pitchblack ? '' : `
  try { if (localStorage.getItem('psi-slides:pitchblack') === 'on') d.pitchblack = 'on'; } catch (e) {}`;
  if (!theme && !pitch) return '';
  return `<script>
(function () {
  var d = document.body.dataset;${theme}${pitch}
})();
</script>`;
}

function splitInfo(info = '') {
  return String(info).split('\n').map(l => l.trim()).filter(Boolean);
}

// Capitals set at the tracking of lowercase read as one jammed word. That
// is a typographic rule rather than a preference, so it is not a key: the
// build marks any title slot whose text is already in capitals and the
// stylesheet tracks it out. It reaches the line an author typed that way
// (`presenter: PROF. DR. ...`, which rendered jammed and nothing said why)
// and, through the same attribute, the lines `style: {caps: on}` transforms.
//
// Tested as "has an uppercase letter and no lowercase one" rather than
// `s === s.toUpperCase()`, which is a different question the moment an s-z
// ligature is in the string: uppercasing it yields SS, so a capitalised
// German line would never equal its own uppercase and would silently miss
// the tracking - which is exactly the deck most likely to want this.
function isAllCaps(s) {
  const t = String(s || '');
  return /\p{Lu}/u.test(t) && !/\p{Ll}/u.test(t);
}
const capsAttr = s => (isAllCaps(s) ? ' data-caps=""' : '');


// `subtitle` is the hierarchy step the cover was missing. Without it an
// author has nowhere to put "Prevalence, Techniques, and Implications" but
// the `info` block, where it renders at meta size in soft ink beside the
// room and the date – so the one line that says what the talk is about is
// set exactly like the one that says which conference it is. That is the
// whole of the "hard to read" complaint the variants were asked for.
// The credit block, in four ranks. It used to be one strong line over a run
// of equals: `presenter:` was set apart and everything else went into
// `info:`, where the institution, the venue and the date all arrived at meta
// size in soft ink - so the one line that qualifies the speaker's name was
// set exactly like the one that gives the date, and the block read as a log
// file rather than as a masthead.
//
// `contact` and `notice` are a *row* along the foot rather than two more
// stacked lines, because they do a different job from the two above them:
// the presenter and the affiliation introduce the speaker, while an address
// and "the slides are online" answer the room. One is the head of the
// block, the other is its foot.
//
// Factored out of renderTitleBlock because the closing slide serves it too
// (`closing-credits:`) and a second copy is how a bookend stops being the
// same composition. `metaHtml` is passed rather than built from `info`
// because the cover has one caller that overrides it: a chunk body stands
// in for the info lines where the composition has nowhere else to put it.
// `footBand` says the composition pins this block to the bottom of a box that
// is already stretched to the frame - masthead does, with `margin-top: auto`
// on the presenter, which is also what carries its folio rule. The marker is
// read by flowHeightProbe, which has to keep such a band out of its span: see
// the note there. Named here rather than sniffed there, because whether a
// composition pins its credits is a fact about the composition and the
// stylesheet, not something a measured gap can be trusted to reveal.
//
// The document renderer emits it too and print reads it nowhere - the two
// views share renderCredits, and threading a view flag through it to drop one
// inert data attribute would be more machinery than the attribute costs. It
// is internal markup like data-chunk-id, not a setting an author wrote, which
// is the line between this and the no-op lint.js warns about.
const FOOT_BAND_COVERS = new Set(['masthead']);

function renderCredits({ presenter, affiliation, contact, notice, metaHtml = '', footBand = false }) {
  const foot = [
    contact ? `<span class="title-contact">${escapeHtml(contact)}</span>` : '',
    notice ? `<span class="title-notice">${escapeHtml(notice)}</span>` : '',
  ].filter(Boolean).join('');
  return [
    presenter ? `<p class="title-presenter"${footBand ? ' data-foot=""' : ''}${capsAttr(presenter)}>${escapeHtml(presenter)}</p>` : '',
    affiliation ? `<p class="title-affiliation"${capsAttr(affiliation)}>${escapeHtml(affiliation)}</p>` : '',
    metaHtml || '',
    foot ? `<div class="title-foot">${foot}</div>` : '',
  ].filter(Boolean).join('\n    ');
}

// `cover-ground: ink` - a dark opening slide under a light deck. Written
// only where nothing has already darkened the slide: a backdrop's own scrim
// wins, exactly as a backdrop wins over the composition's picture. The
// closing slide takes it too, because the ground is part of the composition
// it inherits, and a deck that opens dark and closes light has not closed
// the arc it opened.
function groundAttrFor(cover, art) {
  return (cover.ground === 'ink' && !art.scrim) ? ' data-cover-ground="ink"' : '';
}

function renderTitleBlock({ title, subtitle, presenter, affiliation, info, contact, notice, bodyHtml, bodyIsArt, bodyInField, variant, infoWithBody }) {
  // The body stands in for `info` only where the composition has nowhere
  // else to put it. Where it does - as a picture in its own track, or as the
  // lede in a masthead's field - the info lines are still the meta.
  //
  // It has never stood in for the presenter, and it does not stand in for
  // the three slots beside it either: a cover whose body is a drawing still
  // has an author, an institution and an address.
  const bodyPlaced = bodyIsArt || bodyInField;
  // A document's masthead (infoWithBody, renderChunk under kind: document)
  // keeps both: the info lines are its version and its institution, quiet
  // under the presenter, and the body is the opening line under all of it.
  // A slide has room for one of the two and the body wins there.
  const lede = infoWithBody && bodyHtml && !bodyPlaced ? `<div class="title-lede">${bodyHtml}</div>` : '';
  const infoLines = (bodyHtml && !bodyPlaced && !infoWithBody)
    ? null // chunk body overrides `info` (PRD §3 rules)
    : splitInfo(info);
  const metaHtml = infoLines
    ? (infoLines.length
        ? `<div class="title-info">${infoLines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
        : '')
    : (bodyPlaced ? '' : (bodyHtml || ''));
  const field = (bodyInField && bodyHtml)
    ? `<div class="title-field">${bodyHtml}</div>` : '';
  // On `quote` the field IS the slide, so it comes first and the title
  // reads as the attribution under it. Source order rather than CSS order:
  // the two are different documents, not one document laid out twice, and a
  // screen reader gets the claim before the name either way.
  const claimFirst = bodyInField && variant === 'quote';
  return `
    ${claimFirst ? field : ''}
    <h1 class="title-main"${capsAttr(title)}>${escapeHtml(title || '')}</h1>
    ${subtitle ? `<p class="title-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${claimFirst ? '' : field}
    ${renderCredits({ presenter, affiliation, contact, notice, metaHtml, footBand: FOOT_BAND_COVERS.has(variant) })}
    ${lede}
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
function renderClosingBlock(chunk, bodyHtml, frontmatter = {}, cover = {}) {
  // `closing-credits:` is the author asking for the fields back, and the
  // default is still none of them. `contact` is the value expected to earn
  // its keep - a last slide that repeats the speaker's name reads as a
  // duplicate, and one that repeats where the slides live is answering the
  // question the room is about to ask - while `cover` is for the deck that
  // ends on a full restatement.
  const want = cover.closingCredits || CLOSING_CREDITS_NONE;
  const all = want === CLOSING_CREDITS_COVER;
  const infoLines = all ? splitInfo(frontmatter.info) : [];
  const credits = want === CLOSING_CREDITS_NONE ? '' : renderCredits({
    footBand: FOOT_BAND_COVERS.has(cover.variant),
    presenter: all ? frontmatter.presenter : '',
    affiliation: all ? frontmatter.affiliation : '',
    contact: frontmatter.contact,
    notice: frontmatter.notice,
    metaHtml: infoLines.length
      ? `<div class="title-info">${infoLines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
      : '',
  });
  return `
    <h1 class="title-main"${capsAttr(chunk.heading)}>${renderInlineMd(chunk.heading || '')}</h1>
    ${chunk.headingSub ? `<p class="title-subtitle">${renderInlineMd(chunk.headingSub)}</p>` : ''}
    ${bodyHtml ? `<div class="closing-body">${bodyHtml}</div>` : ''}
    ${credits}
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
  // Validated here rather than in a renderer, because coverSettings runs in
  // the buildOnce pre-flight: a check that can refuse a deck has to fire
  // before any view is written, or `--print-only` never reaches it and a
  // typo ships silently in half the outputs.
  let closingCredits = CLOSING_CREDITS_NONE;
  if (frontmatter['closing-credits'] != null) {
    const rawCC = String(frontmatter['closing-credits']).trim();
    if (!CLOSING_CREDITS.includes(rawCC)) {
      const err = new Error(
        `Frontmatter: "closing-credits: ${rawCC}" is not a value this key takes.\n` +
        `  Valid values: ${CLOSING_CREDITS.join(', ')}\n` +
        '    none     the closing slide carries no credits (the default)\n' +
        '    contact  the foot row only: contact: and notice:\n' +
        '    cover    the whole credit block the cover carried');
      err.userFacing = true;
      throw err;
    }
    closingCredits = rawCC;
  }
  let ground = 'paper';
  if (frontmatter['cover-ground'] != null) {
    const rawG = String(frontmatter['cover-ground']).trim();
    if (!COVER_GROUNDS.includes(rawG)) {
      const err = new Error(
        `Frontmatter: "cover-ground: ${rawG}" is not a ground this tool draws.\n` +
        `  Valid values: ${COVER_GROUNDS.join(', ')}\n` +
        '    paper  the deck\'s own ground (the default)\n' +
        '    ink    a dark opening slide while the rest of the deck stays light');
      err.userFacing = true;
      throw err;
    }
    ground = rawG;
  }
  return {
    variant: raw, image, ratio, align, closingImage, closingCredits, ground,
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

// `num` is a document's section number (documentNumbers), set before the
// words in a span of its own so the reader's text, the highlights' anchor,
// can skip it the way it skips the slide number.
function renderHeadingHtml(chunk, cls = 'chunk-heading', num = '') {
  if (!chunk.heading && !chunk.headingSub) return '';
  const main = (num ? `<span class="sec-num">${num}</span> ` : '') + renderInlineMd(chunk.heading);
  if (!chunk.headingSub) return `<h2 class="${cls}">${main}</h2>`;
  const sub = renderInlineMd(chunk.headingSub);
  // Space between spans so the print renderer (which uses display:inline
  // for the subline) keeps a readable gap; audience uses flex-column and
  // the space collapses under `gap: 0.1em`.
  return `<h2 class="${cls} has-sub"><span class="hd-main">${main}</span> <span class="hd-sub">${sub}</span></h2>`;
}

// A ::: footnote in the margin (opts.marginNotes, renderChunk). It is lifted
// out of the body by the parser, which remembers how many of the body's
// top-level blocks were written before it (blocksBefore); here a sentinel
// comment goes in front of that block - the last one before the opener, or
// the first when nothing preceded it - so the note, a right float, stands
// level with the block it was written after. A block inside a wrapper (a
// ::: side pane, a ::: marginalia) is not a place: the sentinel goes in front
// of the outermost wrapper instead. The source is split at a token's raw
// offset, which needs the tokens' raws to add up to the body; where they do
// not, the slots go to the end, which is where a footnote has always been.
function footnoteSlots(body, notes) {
  const tokens = marked.lexer(body);
  const blocks = [];
  let off = 0, depth = 0, outerStart = null;
  const OPEN = /<(div|aside|figure|section|details)\b[^>]*>/g;
  const CLOSE = /<\/(div|aside|figure|section|details)>/g;
  for (const t of tokens) {
    const start = off;
    off += t.raw.length;
    if (t.type === 'space') continue;
    blocks.push({ start: depth > 0 ? outerStart : start });
    if (t.type === 'html') {
      const before = depth;
      depth += (t.raw.match(OPEN) || []).length - (t.raw.match(CLOSE) || []).length;
      if (depth < 0) depth = 0;
      if (before === 0 && depth > 0) outerStart = start;
    }
  }
  const at = off === body.length && blocks.length
    ? notes.map(n => blocks[Math.min(Math.max(n.blocksBefore || 0, 1), blocks.length) - 1].start)
    : notes.map(() => body.length);
  let src = body;
  notes.map((n, i) => [at[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).forEach(([pos, i]) => {
    src = src.slice(0, pos) + `<!--psiINT-fn-${i}-->\n\n` + src.slice(pos);
  });
  return src;
}

function renderChunk(chunk, frontmatter, num, opts = {}) {
  const { tag, body = '', id, width, expansions = [], annotation = '', speakerNotes = [] } = chunk;
  const S = opts.strings || lectureStrings(frontmatter);
  const nums = opts.nums || chunkNumbers([]);
  const asideHtml = (e) => {
    const inner = marked.parse(e.body || '');
    const kind = e.kind || 'expand';
    return `<aside class="chunk-expansion chunk-expansion-${kind}" data-label="${escapeHtml(kind === 'margin' && e.label === 'note' ? S['aside-note'] : e.label)}">
${inner}
</aside>`;
  };
  // An `outline:` chunk is an ordinary chunk whose body ends with the list,
  // and that is the whole of it. Rendering it through a shell of its own
  // dropped five things the ordinary path reads - its speaker notes, its
  // annotation, its expansions, its backdrop and its overlays - and dropped
  // them without a word, because nothing downstream knew they had been
  // written. Appending the list is one line and inherits all of it.
  // The footnotes that go into the margin, each at its block (footnoteSlots);
  // under print-marginalia: inline, and for a footnote on a chunk with no
  // body, they stay where they always were, after the body.
  const marginNotes = opts.marginNotes && body ? expansions.filter(e => e.kind === 'margin') : [];
  const bodySrc = marginNotes.length ? footnoteSlots(body, marginNotes) : body;
  const bodyHtml = (body ? (tag === 'statement'
      ? markQuietStatementLines(marked.parse(bodySrc)) : marked.parse(bodySrc)) : '')
      .replace(/<!--psiINT-fn-(\d+)-->\n?/g, (m, i) => `<div class="fn-slot">${asideHtml(marginNotes[Number(i)])}</div>\n`)
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
    const groundAttr = groundAttrFor(cover, art);
    return `<article class="chunk chunk-title" data-cover="${cover.variant}"${closingAttr}${bdAttr}${scrimAttr}${groundAttr}${chunkStyleAttrs(chunk)}${numAttr}${idAttr}>
  ${art.html}
  ${numHtml}
  ${closing
    ? renderClosingBlock(chunk, bodyHtml, frontmatter, cover)
    : renderTitleBlock({ ...frontmatter, bodyHtml, bodyIsArt: cover.bodyIsArt, bodyInField: cover.bodyInField, variant: cover.variant, infoWithBody: !!opts.docNums })}
  ${renderOverlayLayer(chunk.overlays, where)}
</article>`;
  }

  // `figure:` is self-evident from the artwork; eyebrow would just stack a
  // third label above the heading + sub-heading. `statement:` prints no
  // label either, and for the reason the type exists: its heading and its
  // paragraphs are one utterance set at one size, and a small-caps word over
  // them turns three lines of speech into a labelled specimen.
  // A document prints no type word unless its author asked for one
  // (opts.noLabels, renderDocument): a syllabus section is not a definition
  // or an example, whatever prefix its heading line carries.
  const labelTag = !opts.noLabels && tag && tag !== 'free' && tag !== 'figure' && tag !== 'statement' ? tag : null;
  const label = labelTag
    ? `<span class="chunk-label">${escapeHtml((S.type[labelTag] || labelTag).toLowerCase())}</span>`
    : '';

  const classes = [
    'chunk',
    `chunk-${tag || 'free'}`,
    `width-${width}`,
  ].join(' ');

  const expansionsHtml = expansions.filter(e => e.kind !== 'pulse' && !marginNotes.includes(e)).map(asideHtml).join('\n');

  const annotationHtml = annotation.trim()
    ? `<aside class="presentation-note">
<span class="presentation-note-label">${escapeHtml(S['presentation-note'])}</span>
<div class="presentation-note-body">${marked.parse(annotation)}</div>
</aside>`
    : '';

  const notesHtml = (opts.withNotes && speakerNotes.length)
    ? `<aside class="speaker-note">
<span class="speaker-note-label">${escapeHtml(S['speaker-note'])}</span>
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
  // A chunk's own dock prints as a box after the body, before the overlay
  // cards - the overlay's pattern, one line beside it. An inherited dock
  // prints once, under the column heading (renderColumn), not on every
  // chunk of the part.
  const dockHtml = chunk.dock && !chunk.dock.inherited ? renderDock(chunk.dock, where, null, nums) : '';
  const scrimAttr = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdAttr = bd.html ? ' data-has-backdrop=""' : '';

  return `<article class="${classes}"${idAttr}${numAttr}${bdAttr}${scrimAttr}${chunkStyleAttrs(chunk)}>
  ${bd.html}
  ${numHtml}
  ${label}
  ${renderHeadingHtml(chunk, 'chunk-heading', opts.docNums ? (opts.docNums.chunk.get(chunk) || '') : '')}
  ${bodyHtml}
  ${dockHtml}
  ${overlayHtml}
  ${expansionsHtml}
  ${annotationHtml}
  ${notesHtml}${renderPulseQuestions(expansions.filter(e => e.kind === 'pulse'), S)}
</article>`;
}

// A ::: pulse block in the documents, in the markup Pulse Embed v2 reads:
// everything before the <details> is the question, the details' body is the
// answer. Before the script runs, or without it, that is what it is - a
// question and a folded answer. Last in the chunk, after the notes, because
// it asks about all of it.
// Two or more questions on one chunk are a deck: on screen the widget shows
// one at a time with "Question 2 of 3" and a button to the next, due ones
// first; printed, it stands every question under the one before, answers
// included. No syntax of its own - the chunk already says they belong together.
function renderPulseQuestions(qs, S) {
  if (!qs.length) return '';
  const html = qs.map(e => renderPulseQuestion(e, S)).join('\n');
  return '\n' + (qs.length > 1 ? `<pulse-deck>\n${html}\n</pulse-deck>` : html);
}

function renderPulseQuestion(e, S) {
  // The id is set here because the widget otherwise numbers its questions
  // pulse-1, pulse-2 …, in the namespace the chunk ids live in; the summary's
  // links jump to it. It is the build's, so it is psiINT-: the key is the
  // chunk id by default, and pulse-<key> could be another chunk's id. Only
  // the summary's in-page links read it - the widget files the question
  // under the key attribute, which is what reaches the server.
  return `<pulse-question id="psiINT-pulse-${escapeHtml(e.key)}" key="${escapeHtml(e.key)}">
${marked.parse(e.question)}
<details><summary>${escapeHtml(S['pulse-answer'])}</summary>
${marked.parse(e.answer)}
</details>
</pulse-question>`;
}

function renderColumn(col, frontmatter, nums, chunkOpts = {}) {
  const chunksHtml = col.chunks.map(c => renderChunk(c, frontmatter, nums.of.get(c), { ...chunkOpts, nums })).join('\n');
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
  // in runtime/print.css keys on them today, which is exactly why they were missing -
  // and exactly why a scrim rule added later would have reached every chunk
  // and silently skipped every divider.
  const bdScrim = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdHas = bd.html ? ' data-has-backdrop=""' : '';
  // A divider's own speaker notes, in the hand-out that carries notes. The
  // aside is the chunk's, spelled the same way, because a reader of
  // print-notes.html is reading one document and a divider's prompt is not a
  // different kind of thing from a slide's.
  const S = chunkOpts.strings || lectureStrings(frontmatter);
  const notesHtml = (chunkOpts.withNotes && (col.speakerNotes || []).length)
    ? `<aside class="speaker-note">
<span class="speaker-note-label">${escapeHtml(S['speaker-note'])}</span>
<div class="speaker-note-body">${col.speakerNotes.map(n => marked.parse(n)).join('\n')}</div>
</aside>`
    : '';
  const secNum = chunkOpts.docNums ? chunkOpts.docNums.part.get(col) : '';
  return `<section class="column"${idAttr}${bdHas}${bdScrim}>
  <h1 class="column-heading">${secNum ? `<span class="sec-num">${secNum}</span> ` : ''}${escapeHtml(col.heading)}</h1>
  ${bd.html}
  ${lede}
  ${renderDock(col.dock, `the divider for "${col.heading}"`, null, nums)}
  ${renderOverlayLayer(col.overlays, `the divider for "${col.heading}"`)}
  ${notesHtml}
${chunksHtml}
</section>`;
}

// A document's contents: the parts and, under each, its numbered sections,
// with the numbers the headings carry. Two levels because a document is
// looked things up in - "where are the exam rules" is a section, not a part -
// where a lecture's printed contents list the parts it was given in.
function renderDocumentToc(columns, docNums, S) {
  const text = (t) => renderInlineMd(t).replace(/<\/?a\b[^>]*>/g, '');
  const num = (n) => n ? `<span class="toc-num">${n}</span> ` : '';
  const items = columns.filter(c => c.heading).map(c => {
    const subs = c.chunks.filter(ch => docNums.chunk.has(ch) && ch.id)
      .map(ch => `<li><a href="#${escapeHtml(ch.id)}">${num(docNums.chunk.get(ch))}${text(ch.heading)}</a></li>`)
      .join('');
    return `<li><a href="#${escapeHtml(c.id || '')}">${num(docNums.part.get(c))}${escapeHtml(c.heading)}</a>`
      + (subs ? `<ol>${subs}</ol>` : '') + '</li>';
  }).join('\n    ');
  if (!items) return '';
  return `<nav class="toc toc-document" aria-label="${escapeHtml(S.contents)}">
  <h2>${escapeHtml(S.contents)}</h2>
  <ol>
    ${items}
  </ol>
</nav>`;
}

function renderToc(columns, S) {
  const items = columns
    .filter(c => c.heading)
    .map(c => `<li><a href="#${escapeHtml(c.id || '')}">${escapeHtml(c.heading)}</a></li>`)
    .join('\n    ');
  if (!items) return '';
  return `<nav class="toc" aria-label="${escapeHtml(S.contents)}">
  <h2>${escapeHtml(S.contents)}</h2>
  <ol>
    ${items}
  </ol>
</nav>`;
}

// The reader's contents sidebar (reader: on). The in-flow nav.toc above is
// the printed contents page and lists parts; this one lists slides, grouped
// by part, with the number the document prints beside each chunk, and it is
// what the scroll-spy in runtime/print-reader.js marks. Emitted at build
// time rather than assembled by the script: the list is then a function of
// the source, so a rebuild is the same bytes, and the words it carries come
// out of STRINGS like every other word the build invents.
//
// It ships with the hidden attribute, and READER_EARLY_JS removes it. A
// page read without scripts is therefore the document it was before the
// sidebar existed - no button that opens nothing, no list the width of the
// window above the cover.
//
// The order is the document's, not the source's: print sets the anonymous
// columns first and the named ones after, and a contents list that disagreed
// with the page it sits beside would send the scroll-spy backwards. The
// title chunk and an outline: chunk are not entries - the first is the cover
// and the second is a contents list already. A chunk with no heading is
// named by its type word where it has one and by its id where it does not,
// because an entry with nothing in it cannot be clicked.
function renderReaderContents(columns, nums, S, docNums = null) {
  const entry = (c) => {
    if (!c.id || c.tag === 'title' || c.tag === 'outline') return '';
    // A heading may hold a link, and a link cannot sit inside the entry's
    // own; its text stays and the anchor goes.
    const text = c.heading || c.headingSub
      ? renderInlineMd(c.heading || c.headingSub).replace(/<\/?a\b[^>]*>/g, '')
      : escapeHtml((S.type[c.tag]) || c.id);
    // A document lists its section numbers where a lecture lists its slide
    // numbers, and a chunk with no heading is no entry: it continues the
    // section above it, and the type word or the id is no name for a place
    // in a document. Front matter before the first part keeps its entry
    // and has no number.
    if (docNums && !c.heading) return '';
    const num = docNums ? (docNums.chunk.get(c) || '') : nums.of.get(c);
    return `<li><a href="#${escapeHtml(c.id)}" data-rd="${escapeHtml(c.id)}">` +
      `<span class="rd-num">${num || ''}</span><span class="rd-text">${text}</span></a></li>`;
  };
  // A part folds to its heading: the script opens the one being read and any
  // the reader opens by hand, and the button beside the heading is how. The
  // slides before the first part have no heading to fold under and stay a
  // flat list. The list's id is the part's position, not its own id, which
  // a part without one does not have.
  const ordered = [...columns.filter(c => !c.heading), ...columns.filter(c => c.heading)];
  let part = 0;
  const groups = ordered.map(col => {
    const items = col.chunks.map(entry).filter(Boolean).join('');
    if (!col.heading) return items;
    const partNum = docNums ? `<span class="rd-part-num">${docNums.part.get(col)}</span> ` : '';
    const head = col.id
      ? `<a class="rd-part" href="#${escapeHtml(col.id)}">${partNum}${escapeHtml(col.heading)}</a>`
      : `<span class="rd-part">${partNum}${escapeHtml(col.heading)}</span>`;
    if (!items) return `<li class="rd-group"><div class="rd-part-row">${head}</div></li>`;
    const listId = `psiINT-rd-part-${++part}`;
    const fold = `<button type="button" class="rd-fold" aria-expanded="false" aria-controls="${listId}" ` +
      `aria-label="${escapeHtml(S['reader-fold'])}: ${escapeHtml(col.heading)}">` +
      `<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M3.5 2 L6.5 5 L3.5 8"/></svg></button>`;
    return `<li class="rd-group"><div class="rd-part-row">${head}${fold}</div><ol id="${listId}">${items}</ol></li>`;
  }).filter(Boolean).join('\n');
  if (!groups) return '';
  // The foot is empty on purpose: it is where the reader's own tools go -
  // the menu and the list of highlights that could not be placed - and a
  // slot the build writes is one the script fills without guessing where.
  return `<button type="button" class="rd-toggle" aria-controls="psiINT-reader-contents" aria-expanded="false" hidden>${escapeHtml(S.contents)}</button>
<nav id="psiINT-reader-contents" class="rd-contents" aria-label="${escapeHtml(S.contents)}" hidden>
  <div class="rd-head"><span class="rd-label">${escapeHtml(S.contents)}</span><button type="button" class="rd-close" aria-label="${escapeHtml(S['reader-close'])}">×</button></div>
  <ol class="rd-list">
${groups}
  </ol>
  ${renderReaderView(S)}
  <div class="rd-foot" data-reader-slot="tools"></div>
</nav>`;
}

// The reader's two switches, over the foot of the contents: the page light,
// dark or as the system has it, and the running text in the serif or the
// sans. Written by the build so their words come out of STRINGS; wired by
// runtime/print-view.js, which also says which button is pressed. Toggle buttons in
// a labelled group, so each is one Tab stop with a name and a state.
function renderReaderView(S) {
  const seg = (label, attr, pairs) => `<div class="rd-view-row"><span class="rd-view-label" aria-hidden="true">${escapeHtml(label)}</span>`
    + `<div class="rd-seg" role="group" aria-label="${escapeHtml(label)}">`
    + pairs.map(([v, k]) => `<button type="button" ${attr}="${v}" aria-pressed="false">${escapeHtml(S[k])}</button>`).join('')
    + '</div></div>';
  return `<div class="rd-view">`
    + seg(S['reader-scheme'], 'data-set-scheme', [['auto', 'reader-scheme-auto'], ['light', 'reader-scheme-light'], ['dark', 'reader-scheme-dark']])
    + seg(S['reader-face'], 'data-set-face', [['serif', 'reader-face-serif'], ['sans', 'reader-face-sans']])
    + '</div>';
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

// Print goes further: its only script is the lightbox (runtime/print.js), which
// clones what the page already shows, so the step frames and the editor's
// source payload are dead weight beside the asset table – no consumer ever
// reads them there. Measured on lectures/network-security
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
// color, the dark one as a --shiki-dark custom property beside it. The
// documents read the token colour since they follow a dark screen
// (printDarkCss), at about 23 KB of a 525 KB print file on
// lectures/python-intro, the code-heaviest lecture in the repo; what they
// still never read is the dark *ground*, --shiki-dark-bg, because a listing
// in a document stands on the page's own paper. Rewrites only the inside of
// a start tag, so a code fence that happens to quote the property name is
// text content and stays untouched.
function stripDarkTokenColors(html) {
  return html.replace(/<(?:pre|span)\b[^>]*>/g, tag => tag
    .replace(/--shiki-dark-bg:#[0-9a-fA-F]{3,8};?/g, '')
    .replace(/style="([^"]*);"/, 'style="$1"'));
}

// The key a reader's highlights are filed under in the browser: the source
// folder's name, then a short hash of the name of the folder above it. The
// folder's name alone was the key up to 2.0.0, and in a browser that keeps
// one store for every file:// page two lectures in two week1 folders (of two
// courses) shared it. The folder above tells them apart; it goes in as a
// hash so a page sent on does not name it - it may be the author's home
// folder, and the home folder's name is their user name. Only names, never a
// path: the key is the same on any machine that builds the same tree, so the
// tracked views do not depend on where the checkout is. A lecture moved under
// another folder files under a new key and its readers start empty there;
// the page copies its own entries of the old name-only store across once
// (runtime/print-highlights.js, LEGACY), and that is the one migration there
// is. The live views' editor files a reader's kept figure edits under the
// same key (editorPayload), with no migration, as before.
function readerStoreKey(dir) {
  const name = path.basename(dir);
  const above = path.basename(path.dirname(dir));
  return name + '@' + crypto.createHash('sha256').update('psi-reader\0' + above).digest('hex').slice(0, 8);
}

function renderDocument(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const S = opts.strings || lectureStrings(frontmatter);
  const title = lectureTitle(frontmatter, S);
  // An `outline:` chunk is already a contents list - renderOutlineList walks
  // the same parts renderToc walks - so a deck that carries one was getting
  // the identical run of headings twice, 29px apart, the generated nav
  // starting under the last line of the chunk that had just said it. The
  // author's version wins: it has a heading they wrote, a lede, and a place
  // in the argument. A deck with no outline chunk still gets the nav, which
  // is what it is there for.
  const hasOutline = columns.some(c => (c.chunks || []).some(ch => ch.tag === 'outline'));
  // kind: document (lectureKind). Its numbers are the one walk the
  // headings, the contents and the sidebar all read.
  const docMode = isDocumentKind(frontmatter);
  const docNums = docMode ? documentNumbers(columns) : null;
  const toc = hasOutline ? '' : (docMode ? renderDocumentToc(columns, docNums, S) : renderToc(columns, S));
  // The one numbering, shared with renderColumnsHtml, so the print numbers
  // match the audience's chunk-num badges 1:1 - and so a dock's link
  // states in both views compare against the same "slide 12".
  const nums = chunkNumbers(columns);
  // Title / anon columns render above the TOC (cover page first),
  // named columns render after (body of the document).
  // A document prints no type word unless its author wrote style: {labels}
  // themselves - the default is the lecture's `on`, so the question is
  // whether the key was written, not what it resolved to.
  const labelsWritten = !!(frontmatter.style && typeof frontmatter.style === 'object' && 'labels' in frontmatter.style);
  const chunkOpts = { withNotes: !!opts.withNotes, strings: S, docNums, noLabels: docMode && !labelsWritten,
    marginNotes: printMarginalia(styleSettings(frontmatter)) === 'margin' };
  const forPrint = (html) => stripDarkTokenColors(stripDiagramPayloads(stripBackdropFrames(html)));
  // The parts a lecture has, and which one each column is, threaded through
  // so an `outline:` chunk can list them. Print reorders the columns (anon
  // first, named after), so the part number has to ride with the column
  // rather than being counted here.
  const parts = lectureParts(columns);
  const partNoOf = new Map();
  { let n = 0; for (const c of columns) if (c.heading) partNoOf.set(c, ++n); }
  const colOpts = (c) => ({ ...chunkOpts, parts, partNo: partNoOf.get(c) || 0 });
  // The heading ids of a `### Heading {#id}` exist in the documents only;
  // see documentHeadingIds. Reset in a finally, so a renderer that throws
  // cannot leave the live views rendering them on the next build.
  let anonHtml, namedHtml;
  documentHeadingIds = true;
  try {
    anonHtml = forPrint(columns.filter(c => !c.heading)
      .map(c => renderColumn(c, frontmatter, nums, colOpts(c))).join('\n'));
    namedHtml = forPrint(columns.filter(c => c.heading)
      .map(c => renderColumn(c, frontmatter, nums, colOpts(c))).join('\n'));
  } finally {
    documentHeadingIds = false;
  }

  // A document is the only view of itself, so its tab carries the title
  // alone, with no "– print" to tell it from views it does not have.
  const titleSuffix = docMode ? '' : opts.withNotes ? S['title-print-notes'] : S['title-print'];
  // Print has no keyboard, so the frontmatter is its only say over the
  // slide-number markers. The other viewer defaults are live-view concepts
  // (collapse, auto-fit) or already fixed here (print has its own type).
  // A document is read at arm's length and a projection across a room, so
  // the two can want different markers – `print-slide-numbers` says so, and
  // says nothing by following the live key.
  // A document numbers its sections in the headings, so the slide number
  // in the margin would be a second, different count beside them.
  const printNums = docMode ? 'off' : printSlideNums(frontmatter);
  const styleOpts = styleSettings(frontmatter);
  // Two attributes the stylesheet keys a document and its margin notes off,
  // written only when they say something, so a lecture's handout is the
  // bytes it was.
  const kindAttrs = (docMode ? ' data-kind="document"' : '')
    + (printMarginalia(styleOpts) === 'margin' ? ' data-marginalia="margin"' : '');
  // reader: off ships none of it - no attribute, no sidebar, no script - so
  // the CSS keyed off body[data-reader=on] has nothing to match and the
  // lightbox is the only script left, which is what the key promises.
  const readerOn = (viewDefaults(frontmatter).reader || 'on') === 'on';
  const readerHtml = readerOn ? renderReaderContents(columns, nums, S, docNums) : '';
  // What the highlights script needs from the build: the key its store is
  // filed under, the folder name its export file is named by and the store
  // used to be filed under, the title its export is headed with, and the
  // words it puts on the page. The key is readerStoreKey's, the same for
  // print.html and print-notes.html, so the two share a store and a copied
  // folder does not inherit a store it was not given. JSON in a data block rather than in the script, so the script
  // stays one constant for every lecture; a less-than sign is escaped, which
  // is all it takes to keep a closing script tag out of a label.
  const readerData = readerOn
    ? `<script type="application/json" id="psiINT-reader-data">${JSON.stringify({
        key: opts.readerKey || opts.lectureKey || 'lecture',
        name: opts.lectureKey || 'lecture',
        title,
        s: Object.fromEntries(Object.entries(S).filter(([k]) => k.startsWith('reader-'))),
      }).replace(/</g, '\\u003c')}</script>\n`
    : '';
  // ::: pulse: the widget and the reader's standing on this lecture - one
  // line under the contents, the full account at the end - only in a
  // document that asks something. The lecture's title is the page the
  // questions are filed under in the reader's account and named by in the
  // reminder mails; no address is sent, so a document opened from file://
  // gives away no path.
  const hasPulse = columns.some(c => (c.chunks || []).some(ch => (ch.expansions || []).some(e => e.kind === 'pulse')));
  // The one-line standing goes where the document's body begins, after the
  // cover and the contents. A deck with no # part has no such place - every
  // chunk is in the anonymous column - and there the full account at the end
  // is the only one.
  const pulseTop = hasPulse && namedHtml.trim() ? '<pulse-summary compact></pulse-summary>\n' : '';
  const pulseEnd = hasPulse ? '<pulse-summary></pulse-summary>\n' : '';
  const pulseScript = hasPulse
    ? `<script data-host="${PULSE_HOST}" data-page="${escapeHtml(title)}">${pulseEmbedJs()}</script>\n` : '';
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}${titleSuffix ? ` – ${escapeHtml(titleSuffix)}` : ''}</title>
${PRINT_VIEW_EARLY_JS}
<style>
${shipCss(printCss())}
${shipCss(diagramCss())}
${hasPulse ? shipCss(pulsePrintCss()) : ''}${docMode ? shipCss(DOCUMENT_PAGE_CSS) : ''}</style>
${fontStyleTag(opts.fontEmbed, 'print')}
${styleBlockCss(styleOpts)}
${codeTag(styleOpts, opts.codeSizing, 'print')}
${katexStyleTag(anonHtml + namedHtml)}
${reloadScript(opts.watchPort, null, { receiveOnly: true, run: opts.watchRun })}
</head>
<body data-slide-nums="${printNums}" ${styleBodyAttrs(styleOpts, frontmatter)}${kindAttrs}${readerOn ? ' data-reader="on"' : ''}>
${readerOn ? readerHtml + READER_EARLY_JS : ''}<main>
${anonHtml}
${toc}
${pulseTop}${namedHtml}
${pulseEnd}</main>
<script>${shipJs(printJs())}</script>
${pulseScript}${readerOn ? `${readerData}<script>${shipJs(printReaderJs())}${shipJs(printViewJs())}${shipJs(printHighlightsJs())}</script>\n` : ''}</body>
</html>
`;
}

// ── print CSS ────────────────────────────────────────────────────────

// The two widths the reader's layout changes at (reader: on), in px because a
// media query cannot read the root size - see the note in runtime/print.css
// for how they were solved. Filled into that stylesheet and into
// runtime/print-reader.js, which asks the same question when it decides
// whether the contents lie over the page.
const READER_WIDE_PX = 1216;
const READER_NOTES_PX = 920;

// ── the documents on a dark screen, and the reader's face ────────────
// print.html is read on screens after the lecture, and a reader whose system
// is dark got a white page. It follows prefers-color-scheme now, and the
// reader's sidebar carries a switch - light, dark, or the system's - and one
// for the face of the running text, serif or sans (runtime/print-view.js). Both are
// the reader's, remembered in their browser under PRINT_PREF_KEYS, and both
// stop at the screen: every rule here is under @media screen, so paper and
// the PDF export are the author's document as it always was.
//
// The palette is the `dark` theme's (DARK_TOKENS), so the documents and the
// projection are one dark theme. The rules are written once for a scope and
// emitted twice: under the system's dark preference unless the reader chose
// light, and under the reader's choice of dark - the order a stored choice
// has to win in, without a script having to run first.
//
// What a plain swap of the tokens would get wrong, each answered below: code
// (Shiki emits the dark palette as --shiki-dark on every token, and the
// documents now keep it), a picture drawn for a white page (it stands on a
// panel of the light paper, with the light tokens, so an SVG that reads
// var(--ink) is drawn as its author saw it; a photograph is not inverted),
// the asides whose ground is a light tint, the reader's yellow, and the two
// grounds that put white type on the accent, which the dark theme lifts.
const PRINT_PREF_KEYS = { scheme: 'psi-reader:scheme', face: 'psi-reader:face' };
function printDarkCss(S) {
  const light = tokenDecls(PRINT_LIGHT_TOKENS, '    ');
  return `
  ${S}, ${S} body {
    color-scheme: dark;
${tokenDecls(DARK_TOKENS, '    ')}
  }
  ${S} pre { background: color-mix(in oklch, var(--ink) 7%, transparent); }
  ${S} pre.shiki, ${S} pre.shiki span { color: var(--shiki-dark) !important; }
  ${S} .speaker-note { --note-border: oklch(0.6 0.1 240); --note-bg: oklch(0.24 0.03 240); --note-label: oklch(0.78 0.08 240); }
  ${S} .presentation-note { --note-border: oklch(0.66 0.12 80); --note-bg: oklch(0.25 0.03 80); --note-label: oklch(0.8 0.1 80); }
  ${S} :is(figure.figure-img, .chunk-title[data-cover=panel]) {
${light}
  }
  ${S} figure.figure-img {
    background: var(--paper);
    color: var(--ink);
    padding: 0.6rem;
    border-radius: var(--radius-card);
  }
  ${S} .cards.cg-paper > ul > li, ${S} .cards.cg-paper > ol > li, ${S} .cards.cg-paper > :not(ul):not(ol) { background: var(--paper-warm); }
  ${S} .cards.cg-accent > ul > li, ${S} .cards.cg-accent > ol > li, ${S} .cards.cg-accent > :not(ul):not(ol),
  ${S} :is(.overlay-card, .dock).ov-accent { color: var(--paper); }
  ${S} figure.figure-embed .embed-frame { background: var(--paper-warm); }
  ${S} body[data-reader=on] { --rd-hl: oklch(0.42 0.08 95); --rd-hl-strong: oklch(0.6 0.13 94); }
  ${S} .rd-pin-dot, ${S} svg .rd-pin text { color: #1f1f24; fill: #1f1f24; }`;
}
// Read before the first paint, in <head>, so a dark reader never sees a white
// flash: the stored choices become two attributes on <html>, and nothing
// else. Every read is in a try - a browser that refuses storage gets the
// system's scheme and the author's face.
const PRINT_VIEW_EARLY_JS = `<script>(() => { const d = document.documentElement; try { const s = localStorage.getItem('${PRINT_PREF_KEYS.scheme}'); const f = localStorage.getItem('${PRINT_PREF_KEYS.face}'); if (s === 'light' || s === 'dark') d.setAttribute('data-scheme', s); if (f === 'serif' || f === 'sans') d.setAttribute('data-face', f); } catch (e) { /* no storage: the system decides */ } })();</script>`;

// runtime/print.css, the stylesheet of the two documents, read as text at
// build time (PLAN-runtime-extraction.md; PRINT_CSS until it left this
// file), with 21 placeholders for fifteen names. Bare where a value goes:
// the four inline-code selector lists (INLINE_CODE_SEL, in selector
// position), the three line heights the display face wears (DISPLAY_LH),
// and the reader's media-query widths - READER_NOTES_PX and READER_WIDE_PX
// as they are, and the width just under each breakpoint as
// READER_NOTES_BELOW / READER_WIDE_BELOW, the names runtime/print-reader.js
// and runtime/print-highlights.js give the same two numbers. In the comment
// form where a whole block of rules or declarations goes: the paper palette
// (PRINT_LIGHT_TOKENS), the bold looks (boldLookCss) and the two scopes of
// the dark scheme (printDarkCss), where a bare name would be read as the
// next rule's selector. Every value is a build-wide constant, so
// fillRuntime puts them there once per process, from the table below,
// before shipCss strips the sheet on its way into print.html and
// print-notes.html. Filled, its bytes are the old literal's value, so a
// document built before and after the move is the same file.
const PRINT_CSS_PATH = new URL('./runtime/print.css', import.meta.url);
const PRINT_CSS_FILL = {
  PRINT_LIGHT_TOKENS: tokenDecls(PRINT_LIGHT_TOKENS),
  PRINT_BOLD_LOOKS: boldLookCss('print-bold', 'bold', '600'),
  INLINE_CODE_SPACED: inlineCodeSel('print', '', ':not(.nb)'),
  INLINE_CODE_SPACED_LEAD: inlineCodeSel('print', '', ':not(.nb).lead'),
  INLINE_CODE_SPACED_TRAIL: inlineCodeSel('print', '', ':not(.nb).trail'),
  INLINE_CODE_TINT: inlineCodeSel('print', 'body[data-code=tint]'),
  DISPLAY_LH_TITLE: displayLh('print', '.chunk-title .title-main'),
  DISPLAY_LH_EYEBROW_SUBTITLE: displayLh('print', 'body[data-headline=eyebrow] .chunk-title .title-subtitle'),
  DISPLAY_LH_DISPLAY_COVER_TITLE: displayLh('print', '.chunk-title[data-cover=display] .title-main'),
  READER_NOTES_PX: READER_NOTES_PX,
  READER_NOTES_BELOW: READER_NOTES_PX - 0.02,
  PRINT_DARK_BY_SYSTEM: printDarkCss(':root:not([data-scheme=light])'),
  PRINT_DARK_BY_CHOICE: printDarkCss(':root[data-scheme=dark]'),
  READER_WIDE_PX: READER_WIDE_PX,
  READER_WIDE_BELOW: READER_WIDE_PX - 0.02,
};
let printCssCache = null;
const printCss = () => (printCssCache ??= fillRuntime(PRINT_CSS_PATH, fs.readFileSync(PRINT_CSS_PATH, 'utf8'), PRINT_CSS_FILL));

// A document's sheet (kind: document). The page area moves right so the
// strip beside the 38rem column is wide enough for a margin note with a
// picture in it: 17.2cm of A4 less the 12.1cm column leaves 5.1cm, where a
// lecture's 16cm leaves 3.9. An @page rule cannot be keyed off a body
// attribute, so it is emitted into a document only, after
// runtime/print.css, and overrides the margins alone - the page number in
// the foot stays.
const DOCUMENT_PAGE_CSS = `
@page { margin: 2.2cm 1.6cm 2.6cm 2.2cm; }
`;

// ::: pulse (Pulse Embed v2) in the documents, emitted only into a document
// that asks something, so a lecture without a question is byte-identical to
// before. The widget's own rules sit in @layer pulse behind :where(), so
// these win without !important; the variables are its documented interface.
// The label is set like the asides' labels, and the summary takes main's
// measure like a chunk does.
//
// runtime/pulse-print.css, read as text at build time
// (PLAN-runtime-extraction.md; PULSE_PRINT_CSS until it left this file), in
// editor.css's shape: read once per process, the text kept as the source
// the stylesheet check reads, stripped on its way into a document by
// shipCss. Its bytes are the old literal's value.
const PULSE_PRINT_CSS_PATH = new URL('./runtime/pulse-print.css', import.meta.url);
let pulsePrintCssCache = null;
const pulsePrintCss = () => (pulsePrintCssCache ??= fs.readFileSync(PULSE_PRINT_CSS_PATH, 'utf8'));

// ── the lightbox for the documents (screen only) ────────────────────
// The one script the two documents carry. The same gesture the live views'
// figure focus answers - a clone on a card, zoom under the pointer, drag to
// pan - written again rather than lifted out of runtime/audience.js, because that
// code is bound to the slide camera, the peer sync and the stepped-diagram
// runtime, and a document has none of them. The wheel arithmetic is the
// same: exp() of the travelled pixels, one event clamped to 12 px so a mouse
// notch is a step and not a leap, and a quiet period ends the gesture.
//
// Three events on the overlay are what the reader's figure highlights hang
// off (runtime/print-highlights.js, plan §11), so this script knows nothing
// of them: lb:open and lb:close carry the clone and the element it was made
// from, and lb:click is sent for a press that did not drag, before it closes
// the overlay - cancelled, it does not. lb:dismiss asks for the overlay to
// close. A key already spent, or one typed into a field on the overlay, is
// not a zoom.
//
// runtime/print.js, read as text at build time (PLAN-runtime-extraction.md;
// PRINT_JS until it left this file), in editor.css's shape: read once per
// process, stripped on its way into print.html and print-notes.html by
// shipJs. Its bytes are the old literal's value, so a document built before
// and after the move is the same file.
const PRINT_JS_PATH = new URL('./runtime/print.js', import.meta.url);
let printJsCache = null;
const printJs = () => (printJsCache ??= fs.readFileSync(PRINT_JS_PATH, 'utf8'));

// ── the reader's tools in the documents (reader: on, screen only) ────
// The first script runs right after the contents sidebar, before main is
// parsed, so the class the layout keys off is on the body before the first
// paint - a document is megabytes of inlined figures, and a browser paints
// what it has long before it reaches the end of one. It also takes the
// hidden attribute off the sidebar and its button, which is all that stands
// between a page read without scripts and a sidebar that could not open.
const READER_EARLY_JS = `<script>document.body.classList.add('rd-ready');for (const e of document.querySelectorAll('.rd-contents, .rd-toggle')) e.hidden = false;</script>
`;

// The second is the contents sidebar's behaviour. Scroll-spy: the entry of
// the chunk whose top last crossed 30% of the window is marked with
// aria-current="location"; the tops are measured once and again whenever
// the page can have moved under them - a resize, main changing size (a
// figure decoding, a video's poster arriving), the fonts landing - and a
// scroll only compares, batched into one animation frame. At the foot of the
// page the last slides cannot reach that line, so there the last one on
// screen is marked instead. A part's heading is an entry of the same kind,
// marked while its divider is the last thing to have crossed the line.
//
// The parts fold to their headings. The part holding the marked entry opens
// and the one the reader has left closes again; a part opened by hand stays
// open until it is closed by hand or the page is loaded again, and the part
// being read, closed by hand, stays closed until the reader leaves it. The
// fold changes only the sidebar, in the frame that marks the entry, and the
// entry is kept in view after it - so the list does not jump under a reader
// who is only scrolling the page.
//
// Below READER_WIDE_PX the sidebar lies over the page: the button opens it,
// a link, the close button, Esc or a click beside it closes it, and a click
// beside it is spent on closing rather than on whatever it landed on - the
// lightbox, a link.
//
// Emitted only under reader: on.
//
// runtime/print-reader.js, read as text at build time (PLAN-runtime-extraction.md;
// PRINT_READER_JS until it left this file): the width the contents start to
// lie over the page stands in it as __PSI_READER_WIDE_BELOW__, inside the
// matchMedia string the literal had, and fillRuntime puts READER_WIDE_PX - 0.02
// there from the table below, once per process, before shipJs strips it on
// its way into print.html and print-notes.html. Filled, its bytes are the old
// literal's value, so a document built before and after the move is the same
// file.
const PRINT_READER_JS_PATH = new URL('./runtime/print-reader.js', import.meta.url);
const PRINT_READER_JS_FILL = {
  READER_WIDE_BELOW: READER_WIDE_PX - 0.02,
};
let printReaderJsCache = null;
const printReaderJs = () => (printReaderJsCache ??= fillRuntime(PRINT_READER_JS_PATH, fs.readFileSync(PRINT_READER_JS_PATH, 'utf8'), PRINT_READER_JS_FILL));

// The reader's two switches (renderReaderView): the scheme - auto, light or
// dark - and the face of the running text. A press sets the attribute
// PRINT_VIEW_EARLY_JS set at load, stores the choice under PRINT_PREF_KEYS,
// and marks the pressed button; auto removes the attribute and the stored
// word, so the system decides again. The keys are the reader's and not the
// lecture's: one choice for every document the browser opens from this
// origin, and a choice made in another tab arrives through the storage
// event. Every access is in a try - without storage the switches still
// work, for as long as the page is open.
//
// runtime/print-view.js, read as text at build time (PLAN-runtime-extraction.md;
// PRINT_VIEW_JS until it left this file), and the first runtime/ file with
// placeholders: the two storage keys stand in it as __PSI_PRINT_PREF_KEYS_SCHEME__
// and __PSI_PRINT_PREF_KEYS_FACE__, inside the quotes the literal had, and
// fillRuntime puts PRINT_PREF_KEYS's two words there from the table below,
// once per process, before shipJs strips it on its way into print.html and
// print-notes.html. Filled, its bytes are the old literal's value, so a
// document built before and after the move is the same file.
const PRINT_VIEW_JS_PATH = new URL('./runtime/print-view.js', import.meta.url);
const PRINT_VIEW_JS_FILL = {
  PRINT_PREF_KEYS_SCHEME: PRINT_PREF_KEYS.scheme,
  PRINT_PREF_KEYS_FACE: PRINT_PREF_KEYS.face,
};
let printViewJsCache = null;
const printViewJs = () => (printViewJsCache ??= fillRuntime(PRINT_VIEW_JS_PATH, fs.readFileSync(PRINT_VIEW_JS_PATH, 'utf8'), PRINT_VIEW_JS_FILL));

// ── the reader's highlights and notes (reader: on) ───────────────────
// Select words in a slide and a button at the end of the selection marks
// them yellow and opens a card for a note. A highlight is the reader's, kept
// in their browser and seen by nobody else - nothing here shares a path or a
// word with the lecturer's annotations. docs/history/PLAN-reader-highlights.md §2 to §4.
//
// A highlight is anchored to a chunk, by its frozen id, and to offsets into
// that chunk's reader text: its text nodes in document order, less what is
// not the author's running text - the build's own labels and numbers, a
// speaker note, a figure, a formula, a code block, and everything this script
// adds. Leaving the speaker notes out is what makes the offsets the same in
// print.html and print-notes.html, so one store serves both files. The text
// of a divider's lede is anchored to its column, with the chunks under it
// left out.
//
// A rebuild can move the words. The quote is looked for where the offsets
// say, then anywhere in the chunk (the surrounding 32 characters decide
// between several hits), then with whitespace and soft hyphens folded; a
// highlight none of that places is listed in the sidebar's foot and kept,
// never dropped on load.
//
// Every entry is painted through KINDS, keyed by its type, and a card only
// asks the painter for the elements it drew. A text highlight is the one kind
// so far; a figure's (plan §11) joins as a second entry there, with its own
// locate and paint, and the store, the cards and the undo take it as they
// are. An entry of a kind this build does not know is listed as not found
// and kept, so a store written by a later build survives an older one.
//
// Once there is a highlight, a pill at the foot of the window goes through
// them in the page's order, all of them or those with a note, and so do n
// and p; the contents sidebar counts them per slide.
//
// The sidebar's foot holds the menu: export, import, delete all. The export
// is Markdown a person can read as it stands - the highlights grouped under
// their slides, with the number the page prints, each quote a blockquote with
// its note under it - and one HTML comment per entry that carries the entry
// itself. Import reads those comments and nothing else, so a file the reader
// or the lecturer has written in stays importable; it merges by id, the later
// edit winning, and places what it took the way a load does. It is the one
// way highlights cross from one browser to another, and from one document to
// the other where the browser keeps a store per file. An entry of a type this
// build does not paint is exported and imported all the same, and listed as
// not found.
//
// On paper the yellow stays, and a highlight with a note is numbered, with
// the note beside it in the outer margin: the number and the note are
// written into the text for print alone (see paper below).
//
// Storage is localStorage under psi-reader:v1:<source folder>@<hash of the
// folder above it> (readerStoreKey), and every access is in a try: a browser that refuses it gets highlights that last as
// long as the tab, and one line in the sidebar's foot that says so. Where two
// tabs share the store, a write in one is picked up by the other.
//
// runtime/print-highlights.js, read as text at build time
// (PLAN-runtime-extraction.md; PRINT_HIGHLIGHTS_JS until it left this file).
// The file is the literal's value, not its source text: every backslash the
// literal doubled (in a regex, in a string's escape) stands single in the
// file, as the page always got it. The width under which a note card shows
// only while opened, under its paragraph, rather than in the notes column
// stands in its matchMedia string as __PSI_READER_NOTES_BELOW__, and
// fillRuntime puts READER_NOTES_PX - 0.02 there from the table below, once
// per process, before shipJs strips it on its way into print.html and
// print-notes.html. Filled, its bytes are the old literal's value, so a
// document built before and after the move is the same file.
const PRINT_HIGHLIGHTS_JS_PATH = new URL('./runtime/print-highlights.js', import.meta.url);
const PRINT_HIGHLIGHTS_JS_FILL = {
  READER_NOTES_BELOW: READER_NOTES_PX - 0.02,
};
let printHighlightsJsCache = null;
const printHighlightsJs = () => (printHighlightsJsCache ??= fillRuntime(PRINT_HIGHLIGHTS_JS_PATH, fs.readFileSync(PRINT_HIGHLIGHTS_JS_PATH, 'utf8'), PRINT_HIGHLIGHTS_JS_FILL));

// ── audience rendering ───────────────────────────────────────────────

// The chip on an unopened expansion used to wear one of these
// abbreviations instead of the author's own label, on the argument that a
// fixed vocabulary keeps the strip readable and honest about what kind of
// aside is behind the chip. Measured on a keynote, it is the opposite: a
// chip reading EXP stood for an expansion labelled "Fehlermeldung", the
// fallback screen for a live demo, and the one word that said what pressing
// it would show had been thrown away by the renderer. Every label longer
// than the table's prefixes lands on that fallback, so the more descriptive
// the author was, the less the room was told.
//
// So the chip carries the label, and this table is what it carries when
// there is none - a `::: expand` with no word after it, where "Exp" is
// still better than an empty button. The open pane has always shown the
// label in full (.tag-label), which is the other half of why the chip
// saying something else read as a defect rather than as a convention.
function abbrevForLabel(label) {
  const l = String(label || '').toLowerCase();
  if (!l) return 'Exp';
  // The abbreviations are glyph-like and stay – it is the prefix matching
  // that gains the German words, so a `::: expand Beispiel` reads `Ex` rather
  // than falling to the `Exp` default. `war` (Warnung) already sits on the
  // `!` line; the others are added beside their English counterparts.
  if (l.startsWith('exa') || l.startsWith('bei')) return 'Ex';
  if (l.startsWith('exp') || l.startsWith('det') || l.startsWith('deep')) return 'Exp';
  if (l.startsWith('ref') || l.startsWith('cit') || l.startsWith('bib') || l.startsWith('lit') || l.startsWith('que')) return 'Ref';
  if (l.startsWith('ans') || l.startsWith('sol') || l.startsWith('lös') || l.startsWith('ant')) return '?';
  if (l.startsWith('pro') || l.startsWith('bew')) return 'Pf';
  if (l.startsWith('fig') || l.startsWith('dia') || l.startsWith('abb')) return 'Fig';
  if (l.startsWith('cod')) return '{}';
  if (l.startsWith('set')) return 'Set';
  if (l.startsWith('note') || l.startsWith('n.b') || l.startsWith('nb')) return 'N.B.';
  if (l.startsWith('asi') || l.startsWith('asd')) return 'ASD';
  if (l.startsWith('war') || l.startsWith('cav') || l.startsWith('pit') || l.startsWith('ach')) return '!';
  return 'Exp';
}

// A cover that draws the title chunk's body needs one. Checked here, beside
// assertInlinable and collectEmbeddedFonts, and not in the renderer that
// happens to need it: as a renderer check it fired after print.html and
// print-notes.html were already on disk, and --print-only never reached it
// at all, so an invalid deck built clean. Same contract as the two above -
// a failed build leaves no half-written artefact.
// Chunk ids and column ids share one namespace, and a duplicate breaks four
// things that all key off getElementById: cross-references, the TOC, the
// speaker-sync snapshot and localStorage recovery - two `<article id="x">`
// in one document mean the second is unreachable and the two share one
// `revealed[]` slot. The build used to emit both and exit 0; lint.js has
// reported `duplicate-id` on exactly this (over one shared `ids` map for `#`
// and `##`), so the build accepting it is the direction this project does
// not allow. A pre-flight beside assertCoverBody, walking the parsed
// structure rather than the source, so `--print-only` refuses it too.
function assertDistinctIds(lecture, src = '') {
  const seen = new Map();
  const check = (id, what) => {
    if (!id) return;
    if (seen.has(id)) {
      const err = new Error(
        `id '${id}' is used twice: first on ${seen.get(id)}, again on ${what}.\n` +
        '  Chunk ids and column ids share one namespace, and a duplicate makes\n' +
        '  the second element unreachable - the two share one reveal/sync slot.\n' +
        '  Ids are frozen once authored; rename the later one.');
      err.userFacing = true;
      throw err;
    }
    seen.set(id, what);
  };
  lecture.columns.forEach((col, ci) => {
    if (col.id) {
      check(col.id, `column "${col.heading || col.id}"`);
      // The divider slide renders with id `${col.id}-section`, in the same
      // getElementById namespace, so a chunk (or column) authored that name is
      // a real duplicate - two elements answer one id. renderColumnSectionChunk
      // owns this scheme.
      check(`${col.id}-section`, `the divider of column #${col.id}`);
    }
    // A chunk with no id is given one by position, `c<column>-<chunk>`
    // (renderAudienceChunk), in the same namespace - so an author id of that
    // shape on another chunk made two articles with one data-chunk-id, one
    // reveal slot and one sync target, and nothing said so.
    col.chunks.forEach((chunk, xi) => {
      const what = `chunk ## ${chunk.tag ? chunk.tag + ': ' : ''}${chunk.heading || chunk.id || ''}`;
      check(chunk.id || `c${ci}-${xi}`, chunk.id ? what : `${what} (no id, so it is given c${ci}-${xi} by its position)`);
    });
  });
  // A `### Heading {#id}` is an element in the documents, in the same
  // getElementById namespace, so it is held to the same two rules as a chunk
  // id: one name per element, and none of the build's own. Read off the
  // source the way lint.js reads it - one walk after the chunks and parts,
  // so a heading that takes a chunk's name is the one called the duplicate,
  // fenced lines and comments skipped, a ::: draw body skipped (a `#` there
  // is a figure's comment) - because a heading can stand in any body the
  // renderer draws: a chunk's, an aside's, an overlay's, a card's, a
  // divider's.
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const fence = fenceTracker();
  let inFrontmatter = /^\uFEFF?---[A-Za-z]*\s*$/.test(lines[0] || '');
  let inDraw = false;
  lines.forEach((line, i) => {
    if (inFrontmatter) { if (i > 0 && /^---\s*$/.test(line)) inFrontmatter = false; return; }
    if (fence.step(line) || fence.inside || fence.commented) return;
    if (inDraw) { if (/^:::\s*$/.test(line)) inDraw = false; return; }
    if (parseDrawOpener(line)) { inDraw = true; return; }
    const h = headingIdOf(line);
    if (!h) return;
    if (h.id.startsWith(RESERVED_ID_PREFIX)) {
      const err = new Error(
        `"{#${h.id}}" on the heading "${h.text}" (line ${i + 1}):\n` +
        `  ids starting with ${RESERVED_ID_PREFIX} are the build's own (the chrome and the generated\n` +
        '  figure ids live there). Name it without the prefix.');
      err.userFacing = true;
      throw err;
    }
    check(h.id, `the heading "${h.text}" (line ${i + 1})`);
  });
}

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
  const groundAttr = groundAttrFor(cover, art);
  const block = closing
    ? renderClosingBlock(chunk, bodyHtml, frontmatter, cover)
    : renderTitleBlock({ ...frontmatter, bodyHtml, bodyIsArt: cover.bodyIsArt, bodyInField: cover.bodyInField, variant: cover.variant, infoWithBody: false });
  return `<article class="chunk chunk-title" data-tag="${closing ? 'closing' : 'title'}" data-width="full" data-cover="${cover.variant}"${closingAttr}${closingArtAttr}${alignAttr}${bdAttr}${scrimAttr}${groundAttr}${chunkStyleAttrs(chunk)} data-chunk-id="${escapeHtml(chunkId)}"${numAttr}${idAttr}${ratioStyle}>
  ${art.html}
  <div class="chunk-content">
    ${block}
  </div>
  ${renderOverlayLayer(chunk.overlays, where)}
  ${numHtml}
</article>`;
}

function renderAudienceChunk(chunk, frontmatter, colIdx, chunkIdx, nums, parts = [], now = 0, S = null) {
  S = S || lectureStrings(frontmatter);
  const num = nums.of.get(chunk);
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
  // `.middle` is the same kind of decision one axis over, and it is read by
  // the camera rather than by the stylesheet: see focusCamera. Audience-only
  // for the reason the other two are - a printed page has no frame to be
  // centred in.
  const middleAttr = chunk.middle ? ' data-middle=""' : '';
  // The canvas tier of a picture slide (isPictureSlide) or of a `.bleed`
  // chunk: the stylesheet reads it to raise --fig-cap, so the taller canvas
  // the parser laid the figure out on is not narrowed by the ordinary height
  // cap, and fitZoomToChunk reads it to give a bleed chunk the whole frame. Audience-only like the
  // rest - a document has no frame, and runtime/print.css sizes a figure on
  // its own.
  const tierAttr = chunk.canvasTier ? ` data-canvas-tier="${chunk.canvasTier}"` : '';
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
  const segFrom = chunk.segmentFrom || [];
  const segmentsHtml = segments.map((seg, i) => {
    const inner = chunk.tag === 'statement'
      ? markQuietStatementLines(marked.parse(seg || '')) : marked.parse(seg || '');
    const hidden = i === 0 ? '' : ' data-hidden';
    // A pinned segment says which beat it arrives on; an unpinned one is
    // still counted by its position, which is what `pos` in chunkBeats does.
    const from = segFrom[i] == null ? '' : ` data-from="${segFrom[i]}"`;
    // A segment two `---` leave empty (segmentsKept): it paints nothing and
    // is a beat all the same - the slide stands, and a footnote, a note or a
    // backdrop place may ride it. Named rather than left to `:empty`,
    // because the block gap between two segments has to skip it and a
    // selector that reads the box says why.
    const empty = seg ? '' : ' data-empty=""';
    // A segment that holds a ::: slide block, at any depth, says so: the
    // collapse rule that hides the prose round the block is keyed on it.
    // That rule's rightmost compound matches every element, so without an
    // attribute on the ancestor the browser ran its :has() for every node in
    // every segment on each full restyle - a fifth of all selector time on a
    // deck of figures with no ::: slide in it. The string is the parser's own
    // opener, one constant for both; quoted in a code span or a fence, marked
    // escapes it, so it is found only where the element is.
    const explicit = inner.includes(SLIDE_EXPLICIT_OPEN) ? ' data-explicit=""' : '';
    return `<div class="reveal-segment" data-seg="${i}"${hidden}${from}${empty}${explicit}>${inner}</div>`;
  }).join('\n');

  const headingHtml = renderHeadingHtml(chunk);

  // Margin expansions render as a quiet, always-visible side note; expand
  // expansions get chevrons that the JS wires up to the expanded grid.
  const expandList = expansions.filter(e => (e.kind || 'expand') === 'expand');
  const marginList = expansions.filter(e => e.kind === 'margin');

  // A footnote arrives with the reveal segment it was written in: `data-seg`
  // names that segment and applyReveal mirrors its visibility. Emitted only
  // past the opening segment, so a deck whose footnotes all stand before the
  // first `---` - which is every deck written before this - builds the same
  // bytes it did.
  const marginsHtml = marginList.map(e => {
    const inner = marked.parse(e.body || '');
    const segAttr = e.seg > 0 ? ` data-seg="${e.seg}"` : '';
    return `<aside class="margin-note"${segAttr} data-label="${escapeHtml(e.label === 'note' ? S['aside-note'] : e.label)}">${inner}</aside>`;
  }).join('\n');

  const chevsHtml = expandList.length
    ? `<div class="exps">${expandList.map((e, i) =>
      `<button class="exp-chev" type="button" data-exp="${i}" title="${escapeHtml(e.label || abbrevForLabel(e.label))}">
         <span class="exp-name">${escapeHtml(e.label || abbrevForLabel(e.label))}</span>
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
  // After .chunk-content and before .overlay-layer, as a sibling: outside
  // every .reveal-segment, so the collapse never abridges it (decision 10
  // of docs/history/PLAN-dock.md), and under the overlay layer in the z-ladder.
  const dockHtml = renderDock(chunk.dock, where, num, nums);
  const scrimAttr = bd.scrim && bd.scrim !== 'veil' ? ` data-backdrop="${bd.scrim}"` : '';
  const bdAttr = (bd.html ? ' data-has-backdrop=""' : '') + (overlaysHavePanel(chunk.overlays) ? ' data-has-panel=""' : '');

  return `<article class="${classes}"${idAttr} data-chunk-id="${escapeHtml(chunkId)}"${tagAttr}${widthAttr}${bareAttr}${centerAttr}${middleAttr}${tierAttr}${chunkStyleAttrs(chunk)}${numAttr}${bdAttr}${scrimAttr}${dockAttrs(chunk.dock)}>
  ${bd.html}
  <div class="chunk-content">
    ${tagLabel}
    ${headingHtml}
    <div class="chunk-body">${segmentsHtml}</div>
    ${marginsHtml}
    <aside class="annot-box" data-annot-for="${escapeHtml(chunkId)}">
      <div class="annot-box-label">${escapeHtml(S['annotation-label'])} · ${escapeHtml(chunkId)}</div>
      <div class="annot-qr qr-card" aria-hidden="true"></div>
      <textarea class="annot-textarea" placeholder="Note… (Enter for newline, Esc to exit)" rows="1">${escapeHtml(annotation)}</textarea>
    </aside>
  </div>
  <button class="annot-add" type="button" data-annot-add>${escapeHtml(S['add-note'])}</button>
  ${dockHtml}
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
// The one walk that numbers the slides. renderColumnsHtml and the print
// renderer both read it, because a dock's link states compare a target's
// number with the slide's, and a second counter would be a second
// definition of "slide 12". A column maps to the span of its chunks, which
// is what lets a dock link a part and light it while the reader is inside.
function chunkNumbers(columns) {
  const of = new Map(); const byId = new Map(); let n = 0;
  for (const col of columns) {
    const first = n + 1;
    for (const c of col.chunks) { n += 1; of.set(c, n); if (c.id) byId.set(c.id, [n, n]); }
    if (col.id && col.chunks.length) byId.set(col.id, [first, n]);
  }
  return { of, byId };
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
// The divider's element id, in one place. `renderColumnsHtml` draws the slide
// with it and `renderSpeaker` files the divider's own notes under it; two
// spellings would be a cockpit whose notes pane is empty on every divider,
// and nothing would say so.
function sectionChunkId(col, ci) {
  return col.id ? `${col.id}-section` : `__section-c${ci}`;
}
function renderColumnSectionChunk(col, ci, frontmatter = {}, num = 0, parts = [], nums = chunkNumbers([])) {
  const chunkId = sectionChunkId(col, ci);
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
  const bdAttr = (art.html ? ' data-has-backdrop=""' : '') + (overlaysHavePanel(col.overlays) ? ' data-has-panel=""' : '');
  // The divider stands before the first chunk of its column, so its
  // position is half a slide before it; a column with no chunks is after
  // everything.
  const firstNum = col.chunks.length ? nums.of.get(col.chunks[0]) : Infinity;
  const dockHtml = renderDock(col.dock, where, firstNum - 0.5, nums);
  // The mark and the heading (or the list) are one block, and saying so in
  // the markup is what lets the beside layout be a two-column grid with one
  // row. Left as siblings they were separate grid rows, the figure spanned
  // all of them, and the extra height it forced was shared out among them -
  // measured, the list's centre sat 132px below the figure's. Everywhere
  // else the wrapper is `display: contents`, so it changes nothing.
  // `.stack` on the `#` heading: the content stands under the heading at the
  // full measure and the heading becomes its caption. An attribute rather
  // than a class for the reason `data-closing-art` is one - the attribute is
  // the fact the author wrote, the layout only what follows from it.
  const stackAttr = col.stack ? ' data-section-layout="stack"' : '';
  // `.bare` on the same line: the heading is still written into the markup -
  // the contents page, the agenda, the speaker's board and the search index
  // all read it out of the DOM - and a stylesheet takes it off the slide.
  // Same mechanism as a chunk's `.bare`, and audience-only for the same
  // reason: it is a decision about a projection.
  const sBareAttr = col.bare ? ' data-section-bare=""' : '';
  return `<article class="chunk chunk-section" data-tag="section" data-width="full" data-section="${sec.variant}"${stackAttr}${sBareAttr}${bdAttr}${scrimAttr}${dockAttrs(col.dock)} data-chunk-id="${escapeHtml(chunkId)}">
  ${art.html}
  <div class="chunk-content">
    <div class="section-lead">
      ${mark}
      ${body}
    </div>
    ${own}
  </div>
  ${dockHtml}
  ${renderOverlayLayer(col.overlays, where)}
</article>`;
}

// Shared audience/speaker column shell. Both stage the same flat-chunk
// markup; only the per-view head/chrome differs.
//
// A monotonic chunk counter is threaded across every authored chunk so
// each slide can render a corner badge with its global number. Section
// dividers are auto-inserted, not authored, and stay unnumbered – this
// keeps audience numbering aligned with print.
function renderColumnsHtml(columns, frontmatter, S) {
  const nums = chunkNumbers(columns);
  // Which named column this is, counted over the columns that *have* a
  // heading - so `section: number` numbers the parts a reader sees rather
  // than the array index, which counts the anonymous opening column too.
  let sectionNo = 0;
  const parts = lectureParts(columns);
  return columns.map((col, ci) => {
    if (col.heading) sectionNo += 1;
    const sectionHtml = col.heading
      ? renderColumnSectionChunk(col, ci, frontmatter, sectionNo, parts, nums) : '';
    const chunks = col.chunks
      .map((c, xi) => renderAudienceChunk(c, frontmatter, ci, xi, nums, parts, col.heading ? sectionNo : 0, S))
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
const TOUCH_CONTROLS_HTML = `<nav id="psiINT-touch-controls" aria-label="Slide controls">
  <div id="psiINT-touch-palette" hidden>
    <button type="button" data-action="collapse" aria-label="Shorten or expand the text">C</button>
    <button type="button" data-action="font" aria-label="Change the font">F</button>
    <button type="button" data-action="theme" aria-label="Change the theme">A</button>
    <button type="button" data-action="autofit" aria-label="Auto-fit: off, shrink a slide that is too big, or fit every slide">#</button>
    <button type="button" data-action="search" aria-label="Search the lecture">&#x2315;</button>
    <button type="button" data-action="select" aria-label="Select text" aria-pressed="false">&#x2380;</button>
    <button type="button" data-action="fullscreen" aria-label="Fullscreen">&#x26F6;</button>
  </div>
  <div id="psiINT-touch-rail">
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
const OVERVIEW_BADGE_HTML = `<div id="psiINT-overview-badge">
  <span class="hint">overview · drag pans · wheel zooms · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> selects · click or <kbd>O</kbd>/<kbd>Enter</kbd> lands · <kbd>/</kbd> search · <kbd>Esc</kbd> leaves</span>
</div>`;

// Search moved out of the overview badge into its own panel so it can be
// opened from anywhere, and so a hit can be shown as a readable line
// (heading plus the sentence it matched) instead of only as a highlight on
// a board the reader may not be looking at. Same markup in both live views.
// Shown while the projection is blanked. In the speaker window it is the
// only sign that the room sees black, so it has to say how to undo that.
const BLANK_BADGE_HTML = `<div id="psiINT-blank-badge" class="cmd-badge hidden" role="status">BLANK<span> &middot; hit B to toggle</span></div>`;

// W: the projection's own frame, with none of the browser round it. This one
// line is the whole of what a *remote* request looks like on the wall.
//
// Entering fullscreen is one of the calls a browser answers only to a user
// gesture in the window that makes it, and the lecturer's keyboard is in the
// cockpit. Measured in Chromium, headless and headed alike: a
// requestFullscreen inside a message handler is refused with
// "TypeError: Permissions check failed". So a W pressed in the cockpit cannot
// put the projection into fullscreen - it can only arm it, and this is the
// affordance that spends the arming. See the fullscreen section of the
// runtime for the rest of the reasoning.
//
// Its id carries the psiINT- prefix every id the build invents carries, so
// no author id can answer for it.
const FULLSCREEN_HINT_HTML = `<button type="button" id="psiINT-fullscreen-hint" class="hidden">fullscreen<span> &middot; click anywhere, or hit W on this screen</span></button>`;

// Shift-clicking a link puts its address on both screens, large enough to
// copy down. See the runtime section for why the room gets the URL to read
// rather than a browser tab to watch.
const LINK_OVERLAY_HTML = `<div id="psiINT-link-overlay" class="hidden" role="dialog" aria-label="Link address">
  <div id="psiINT-link-overlay-inner">
    <div id="psiINT-link-overlay-label"></div>
    <a id="psiINT-link-overlay-url" target="_blank" rel="noopener noreferrer"></a>
    <div id="psiINT-link-overlay-qr" class="qr-card" aria-hidden="true"></div>
    <div id="psiINT-link-overlay-hint">scan it, or click the address to open it &middot; Esc closes</div>
  </div>
</div>`;

// D puts a window or a screen of this machine on the projection as video.
// Audience only: the cockpit never shows the picture (the lecturer is
// looking at the real window), it shows the badge. See the runtime section.
const DEMO_OVERLAY_HTML = `<div id="psiINT-demo-overlay" class="hidden" role="region" aria-label="Live demo">
  <video id="psiINT-demo-video" autoplay muted playsinline></video>
</div>`;
// The badge carries the two demo commands a hand does not find by key:
// Shift-D is easy to forget mid-talk, and the end has no key at all.
const DEMO_BADGE_HTML = `<div id="psiINT-demo-badge" class="cmd-badge hidden" role="status">DEMO<span> &middot; hit D to pause it</span><button type="button" class="demo-btn" data-demo="switch" title="pick another window (Shift-D)">other window</button><button type="button" class="demo-btn" data-demo="end" title="stop the capture">end</button></div>`;

const SEARCH_PANEL_HTML = `<div id="psiINT-search-panel" class="hidden" role="dialog" aria-label="Search slides">
  <input id="psiINT-search-input" type="text" placeholder="search the lecture..." autocomplete="off" spellcheck="false" aria-controls="psiINT-search-results">
  <ul id="psiINT-search-results" role="listbox"></ul>
  <div id="psiINT-search-foot"><kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> go · <kbd>Esc</kbd> close</div>
</div>`;

// G: the slide number in the corner, typed back. A lecturer who knows the
// deck knows the number, and reaching that slide otherwise means either the
// board (which puts the whole lecture on the projection) or the search panel
// (which needs a word). The prompt reads back "N of M" while the digits are
// typed, so a mistyped number is visible before Enter rather than after it.
//
// Everything inside it is reached through this element, never through
// getElementById.
const GOTO_PROMPT_HTML = `<div id="psiINT-goto-prompt" class="hidden" role="dialog" aria-label="Go to slide">
  <span class="goto-label">go to</span>
  <span class="goto-digits" aria-live="polite"></span>
  <span class="goto-of"></span>
  <span class="goto-foot"><kbd>Enter</kbd> go · <kbd>Esc</kbd> cancel</span>
</div>`;

// Keyboard + mouse reference, opened with ? (or the corner button) in both
// live views. Grouped by task rather than by key, because the thing a
// lecturer forgets mid-talk is "how do I make the notes bigger", not "what
// does V do". Mouse gestures are listed alongside the keys – several of the
// most useful ones (resize the notes pane, click a figure to zoom, drag to
// pan) have no key at all and were previously undiscoverable.
//
// The search field at its head filters the rows as it is typed into (the
// runtime half is beside toggleHelp in runtime/audience.js). Its two words come from
// STRINGS; the rows do not, and stay English whatever lang: says.
//
// The rows are commands.mjs's table, one entry per row, through helpGroups:
// the same entries the key map in runtime/audience.js dispatches from, so a key is
// bound by writing its row. test/gates/commands.mjs holds the keys the
// listener's guards still answer in code to a row as well, or to an entry
// on its reviewed list.
function renderHelpOverlay(view, withEditor, withSouffleuse, S = STRINGS.en) {
  const groups = helpGroups(view, { editor: !!withEditor, prompter: !!withSouffleuse });

  // Both columns are static author-written HTML (kbd markup and en-dashes),
  // never user content, so they go through verbatim. A row the panel can run
  // as a palette names its command on the dt (runsFromPanel in commands.mjs);
  // whether this view has a run function for it is the runtime's question.
  // helpGroups hands the sections over in two runs, the runnable rows first
  // and the reference after them, and the reference opens with a line that
  // says what it is.
  const section = ([title, rows, ref]) => `    <section${ref ? ' class="help-ref"' : ''}>
      <h3>${title}</h3>
      <dl>
${rows.map(([k, v, id, row]) => `        <dt data-row="${row}"${id ? ` data-cmd="${id}"` : ''}>${k}</dt><dd>${v}</dd>`).join('\n')}
      </dl>
    </section>`;
  const firstRef = groups.findIndex((g) => g[2]);
  const sections = groups.map((g, i) => (i === firstRef
    ? '    <p class="help-part">For reference – the mouse, and keys that answer in one place</p>\n' : '') + section(g)).join('\n');

  const find = escapeHtml(S['help-search'] || STRINGS.en['help-search']);
  return `<div id="psiINT-help-overlay" class="hidden" role="dialog" aria-label="Keyboard and mouse reference" aria-modal="false">
  <div id="psiINT-help-inner">
    <header>
      <h2>psi-slides · ${view === 'speaker' ? 'speaker cockpit' : 'audience view'}</h2>
      <input id="psiINT-help-search" type="text" placeholder="${find}" aria-label="${find}" autocomplete="off" spellcheck="false">
      <span class="help-dismiss"><kbd>?</kbd> or <kbd>Esc</kbd> closes</span>
    </header>
    <p class="help-none" hidden>${escapeHtml(S['help-none'] || STRINGS.en['help-none'])}</p>
    <div class="help-grid">
${sections}
      <dl class="help-results" hidden></dl>
    </div>
  </div>
</div>
<button id="psiINT-help-button" type="button" aria-label="Keyboard and mouse reference" title="Keyboard and mouse reference (?)">?</button>`;
}

// The projection's start menu, beside the ? corner: the three things a
// lecturer does before the first slide moves - fullscreen, the cockpit, the
// print view - for somebody who has not learnt W, S and P yet. Rendered
// hidden into audience.html alone, and shown by the runtime only before the
// talk starts (see the start menu in runtime/audience.js), so a view that runs no
// script, the cockpit and every document never carry it, and the PDF export
// builds its print DOM by inclusion and never reaches it.
//
// Names, keys and order come from commands.mjs (START_MENU, short, keys), and
// a click runs COMMAND_RUN for the command, as the key does. The chevron is
// the touch rail's glyph; its mirror image, a button of its own beside the ?
// circle, is the way back once the menu is folded, and stands wherever the
// circle does.
//
// An entry whose view is not beside audience.html is rendered hidden
// (`absentViews`, decided once in buildOnce - see siblingViewsAbsent), so a
// projection built alone or handed on as one file offers no button that
// opens a broken window. Its key stays bound and says so instead. Hidden
// rather than left out, because the page asks again when the menu is shown
// (probeStartMenu) and a later partial build may have put the view there.
function renderStartMenu(absentViews = []) {
  const items = START_MENU.map((id) => COMMANDS.find((x) => x.id === id)).map((c) => {
    const key = keyText(c.keys[0]);
    const plain = key.replace(/<[^>]+>/g, '');
    const hidden = c.opens && absentViews.includes(c.opens) ? ' hidden' : '';
    return `  <button type="button" data-cmd="${c.id}"${hidden} title="${escapeHtml(c.label)} (${escapeHtml(plain)})">${escapeHtml(c.short)} ${key}</button>`;
  }).join('\n');
  return `<nav id="psiINT-start-menu" aria-label="Before the talk" hidden>
${items}
  <button type="button" id="psiINT-start-menu-hide" aria-label="Put this menu away" title="Put this menu away – the ? panel has the same keys">&#x2039;</button>
</nav>
<button type="button" id="psiINT-start-menu-show" aria-label="Show the start menu" title="Show the start menu again" hidden>&#x203A;</button>`;
}

// Which of the views the projection opens are NOT beside audience.html after
// this build: a view counts as there when this build writes it or when it is
// already in the output folder - a partial build next to an earlier full one,
// or --audience-only rebuilding one window against an older peer, where the
// stale file is exactly what the key should open. The one place this is
// decided; renderAudience gets the answer as data. A full build has every
// view, so it emits nothing and its audience.html is unchanged by this. The
// views asked about are the `opens` of the commands (commands.mjs): the
// start menu's two, and the cockpit's S, which opens audience.html.
function siblingViewsAbsent(outDir, targetNames) {
  const opened = [...new Set(COMMANDS.map((c) => c.opens).filter(Boolean))];
  return opened.filter((name) =>
    !targetNames.includes(name) && !fs.existsSync(path.join(outDir, `${name}.html`)));
}

// The same answer for the runtime: the S and P keys (and the palette rows,
// which run the same functions) read it and show a notice instead of opening
// a window onto a missing file. Emitted only when something is missing, so a
// deck with all its views carries not a byte of it. Into the cockpit too:
// its P is the projection's run function and asks the same way, and without
// the list a cockpit that could not ask (no file: or http(s): address, a
// probe with no answer) opened print.html however the build had found it.
function absentViewsScript(absentViews) {
  if (!absentViews || !absentViews.length) return '';
  return `<script>window.PSI_ABSENT_VIEWS = ${jsonForScript(absentViews)};</script>\n`;
}

function renderTocNav(columns, S) {
  const items = columns
    .map((c, i) => ({ c, i }))
    .filter(x => x.c.heading)
    .map(x => `<li data-toc-col="${x.i}"><button type="button">${escapeHtml(x.c.heading)}</button></li>`)
    .join('\n    ');
  return `<nav id="psiINT-toc" aria-label="${escapeHtml(S.contents)}">
  <h2>${escapeHtml(S.contents)}</h2>
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
// `lectureKey` is the key the reader's highlights are filed under
// (readerStoreKey: the source folder's name and a hash of the one above): a
// reader's kept figure edits are filed under it too, since every lecture
// opened from file:// shares one store in Chrome. It was the folder's name
// alone, so two week1 folders of two courses shared their kept edits. Edits
// kept under the old key are not carried across, as they never were.
function editorPayload(frontmatter, columnsHtml, view, lectureKey) {
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
  return `<style>\n${editorCssShipped()}\n</style>\n`
    + `<script>\n${diagramCoreJs()}\n`
    + `window.PSI_DG_DEFAULTS = ${jsonForScript(base)};\n`
    + `window.PSI_DG_EDIT_HTML = ${peerNeedsHtml};\n`
    + `window.PSI_DG_LECTURE = ${jsonForScript(lectureKey || 'lecture')};\n`
    + `${editorJs()}\n</script>`;
}

function renderAudience(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const S = opts.strings || lectureStrings(frontmatter);
  const title = lectureTitle(frontmatter, S);
  let columnsHtml = renderColumnsHtml(columns, frontmatter, S);
  const shipsEditor = !!editorPayload(frontmatter, columnsHtml, 'audience');
  if (!shipsEditor) columnsHtml = stripDiagramAssets(columnsHtml);
  const titleJson = jsonForScript(title);
  const defaults = viewDefaults(frontmatter);
  const styleOpts = styleSettings(frontmatter);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – ${escapeHtml(S['title-lecture'])}</title>
<style>
${shipCss(audienceCss())}
${shipCss(diagramCss())}
</style>
${fontStyleTag(opts.fontEmbed, 'live')}
${styleBlockCss(styleOpts, S)}
${codeTag(styleOpts, opts.codeSizing, 'live')}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${shipsEditor
  ? reloadScript(opts.watchPort, opts.watchNonce, { run: opts.watchRun })
  // The editor is the projection's only writer. A projection without it -
  // editor: speaker or none, or a lecture with no figure - gets the reload
  // the documents get and no nonce: it is the window on the projector, and
  // the nonce is what lets a page write to source.md.
  : reloadScript(opts.watchPort, null, { receiveOnly: true, listen: opts.watchListen, run: opts.watchRun })}
</head>
<body ${viewBodyAttrs(defaults, styleBodyAttrs(styleOpts, frontmatter))}>
${themeBootScript(defaults)}
<div id="psiINT-stage-viewport">
  <div id="psiINT-stage">
${columnsHtml}
  </div>
</div>
<div id="psiINT-laser-pointer" aria-hidden="true"></div>
<div id="psiINT-figure-overlay" aria-hidden="true"></div>
${TOUCH_CONTROLS_HTML}
${renderHelpOverlay('audience', !!editorPayload(frontmatter, columnsHtml, 'audience'), false, S)}
${renderStartMenu(opts.absentViews)}
<div id="psiINT-mode-badge"></div>
${OVERVIEW_BADGE_HTML}
${SEARCH_PANEL_HTML}
${GOTO_PROMPT_HTML}
${BLANK_BADGE_HTML}
${FULLSCREEN_HINT_HTML}
${DEMO_BADGE_HTML}
${LINK_OVERLAY_HTML}
${DEMO_OVERLAY_HTML}
${renderTocNav(columns, S)}
${absentViewsScript(opts.absentViews)}<script>
${qrLibJs()}
</script>
<script>
${commandsJs()}
</script>
<script>
const LECTURE_TITLE = ${titleJson};
const VIEW_DEFAULTS = ${jsonForScript(defaults)};
const LINK_QR = ${jsonForScript(linkQrMap(columnsHtml))};
${shipJs(diagramJs())}
${shipJs(audienceJs())}
</script>
${editorPayload(frontmatter, columnsHtml, 'audience', opts.readerKey || opts.lectureKey)}
</body>
</html>
`;
}

// ── audience CSS ─────────────────────────────────────────────────────

// runtime/audience.css, the stylesheet of the two live views – audience.html
// and the cockpit, which layers runtime/speaker.css on top of it – read as
// text at build time (PLAN-runtime-extraction.md; AUDIENCE_CSS until it left
// this file), with 15 placeholders. Bare where a value goes: the three
// default font stacks (FONT_STACK_TAILS, the tails fontStyleTag prepends an
// embedded family to), the six inline-code selector lists (INLINE_CODE_SEL,
// in selector position, the live counterparts of runtime/print.css's
// INLINE_CODE_* lists) and the four line heights the display face wears
// (DISPLAY_LH). In the comment form where a whole block of rules goes: one
// rule per figure-type step (FIGURE_TYPE_STEPS, the table the tail parser
// reads) and the bold looks (boldLookCss), where a bare name would be read
// as the next rule's selector. Every value is a build-wide constant, so
// fillRuntime puts them there once per process, from the table below,
// before shipCss strips the sheet on its way into both live views. Filled,
// its bytes are the old literal's value, so a view built before and after
// the move is the same file.
const AUDIENCE_CSS_PATH = new URL('./runtime/audience.css', import.meta.url);
const AUDIENCE_CSS_FILL = {
  FONT_STACK_TAILS_SERIF: FONT_STACK_TAILS.serif,
  FONT_STACK_TAILS_SANS: FONT_STACK_TAILS.sans,
  FONT_STACK_TAILS_MONO: FONT_STACK_TAILS.mono,
  LIVE_INLINE_CODE_TINT_PITCHBLACK: inlineCodeSel('live', 'body[data-code=tint][data-mode=dark][data-pitchblack=on]'),
  LIVE_INLINE_CODE_TERMINAL: inlineCodeSel('live', 'body[data-theme^=terminal]'),
  LIVE_INLINE_CODE_SPACED: inlineCodeSel('live', '', ':not(.nb)'),
  LIVE_INLINE_CODE_SPACED_LEAD: inlineCodeSel('live', '', ':not(.nb).lead'),
  LIVE_INLINE_CODE_SPACED_TRAIL: inlineCodeSel('live', '', ':not(.nb).trail'),
  LIVE_INLINE_CODE_TINT: inlineCodeSel('live', 'body[data-code=tint]'),
  FIGURE_TYPE_RULES: FIGURE_TYPE_STEPS.map(n => '.chunk[data-figure-type="' + n + '"] { --figure-type: ' + (n / 100) + '; }').join('\n'),
  LIVE_DISPLAY_LH_TITLE: displayLh('live', '.chunk-title .title-main'),
  LIVE_DISPLAY_LH_EYEBROW_SUBTITLE: displayLh('live', 'body[data-headline=eyebrow] .chunk-title .title-subtitle'),
  LIVE_DISPLAY_LH_DISPLAY_COVER_TITLE: displayLh('live', '.chunk[data-cover=display] .title-main'),
  LIVE_DISPLAY_LH_SECTION_HEADING: displayLh('live', '.chunk-section .section-heading'),
  LIVE_BOLD_LOOKS: boldLookCss('bold', 'plain', 'var(--bold-weight)'),
};
let audienceCssCache = null;
const audienceCss = () => (audienceCssCache ??= fillRuntime(AUDIENCE_CSS_PATH, fs.readFileSync(AUDIENCE_CSS_PATH, 'utf8'), AUDIENCE_CSS_FILL));

// ── audience runtime JS (inlined verbatim into the output HTML) ──────

// runtime/audience.js, the runtime of the two live views – audience.html and
// the cockpit, whose runtime/speaker.js (and runtime/souffleuse.js under
// --prompter) runs after it in the same script element and in its lexical
// scope – read as text at build time (PLAN-runtime-extraction.md; AUDIENCE_JS
// until it left this file, the last of the large literals to go), with five
// placeholders. Each stands where a JSON value goes, bare, in expression
// position – `const THEME_CYCLE = __PSI_THEME_NAMES__;` – so the raw file
// still compiles as a script; each is named after the build-side table it is
// filled from. The file's own `${…}` are browser templates, which fillRuntime
// never touches. fillRuntime puts the values there from the table below, once
// per process, before shipJs strips the script on its way into both live
// views. The file is the literal's value, not its source text (66 backslashes
// were escapes the literal resolved: doubled regex escapes, nine escaped
// browser templates, three \u escapes in strings now the characters
// themselves), and filled, its bytes are that value, so a view built before
// and after the move is the same file.
const AUDIENCE_JS_PATH = new URL('./runtime/audience.js', import.meta.url);
const AUDIENCE_JS_FILL = {
  AUTO_FIT_CYCLE: JSON.stringify(AUTO_FIT_CYCLE),
  SLIDE_NUM_DEFAULT: JSON.stringify(SLIDE_NUM_DEFAULT),
  SLIDE_NUM_MODES: JSON.stringify(SLIDE_NUM_MODES),
  THEME_NAMES: JSON.stringify(THEME_NAMES),
  DARK_THEME_NAMES: JSON.stringify(DARK_THEME_NAMES),
};
let audienceJsCache = null;
const audienceJs = () => (audienceJsCache ??= fillRuntime(AUDIENCE_JS_PATH, fs.readFileSync(AUDIENCE_JS_PATH, 'utf8'), AUDIENCE_JS_FILL));

// ── speaker rendering ────────────────────────────────────────────────

function renderSpeaker(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const S = opts.strings || lectureStrings(frontmatter);
  const title = lectureTitle(frontmatter, S);
  let columnsHtml = renderColumnsHtml(columns, frontmatter, S);
  const shipsEditor = !!editorPayload(frontmatter, columnsHtml, 'speaker');
  if (!shipsEditor) columnsHtml = stripDiagramAssets(columnsHtml);

  // Speaker-source notes are emitted as <template> fragments holding
  // the *raw* note text (joined with blank lines between blocks). The
  // notes-pane is an editable textarea: each chunk's source text is
  // the default; per-chunk overrides live in localStorage so the
  // speaker can rewrite notes during rehearsal without touching source.
  const noteTemplates = [];
  // One emitter for a chunk and for a divider, because the cockpit reads the
  // two through the same id namespace and a second copy of these six lines
  // is how a divider comes to show its notes in the pane and not on a card.
  // `segOf` is the only difference: a chunk files a block by the reveal
  // segment it stood in, a divider has no top-level segments and files every
  // unpinned block on beat 0.
  const pushNotes = (id, notes, froms, segOf) => {
    if (!id || !notes || !notes.length) return;
    noteTemplates.push(
      `<template data-notes-for="${escapeHtml(id)}">${escapeHtml(notes.join('\n\n'))}</template>`
    );
    // The same blocks once more, one template each, with the reveal
    // segment the block stood in (parser: noteSegments). The cue-card
    // mode reads these; the textarea, --squint and the overrides keep
    // reading the joined one above, so neither knows about the other.
    notes.forEach((n, k) => {
      const from = (froms || [])[k];
      const where = from != null ? `data-at="${from}"` : `data-seg="${segOf(k)}"`;
      noteTemplates.push(
        `<template data-cards-for="${escapeHtml(id)}" ${where}>${escapeHtml(n)}</template>`
      );
    });
  };
  columns.forEach((col, ci) => {
    // The divider first, because that is where the camera lands first.
    if (col.heading) pushNotes(sectionChunkId(col, ci), col.speakerNotes, col.speakerNoteFrom, () => 0);
    for (const c of col.chunks) pushNotes(c.id, c.speakerNotes, c.speakerNoteFrom, k => (c.speakerNoteSegs || [])[k] ?? 0);
  });

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

  // The live prompter is chrome that exists only under --prompter, which
  // itself only runs with --watch. Without the flag SOUFFLEUSE is null, none
  // of the elements below are emitted, and neither runtime/souffleuse.css nor
  // runtime/souffleuse.js is spliced - so a cockpit built any other way is the file
  // it was before the feature, apart from the cue-card integration the rail
  // needs either way. The two texts are conditional exactly the way
  // editorPayload is, and for the same reason: 36 KB of runtime and
  // stylesheet that nothing in an ordinary cockpit could ever reach.
  // The visible word is `prompter`; `souffleuse` is the codename and survives
  // in the ids, under the psiINT- prefix every chrome id carries.
  const souffSettings = opts.souffleuse ? souffleuseSettings(frontmatter) : null;
  const souffleuseJs = souffSettings
    ? jsonForScript({
      lang: souffSettings.language || lectureLang(frontmatter),
      cadence: souffSettings.cadence,
      cues: souffSettings.cues !== 'off',
      label: 'prompter',
    })
    : 'null';
  const souffleuseBtn = souffSettings
    ? `\n  <button id="psiINT-souffleuse-btn" type="button" aria-pressed="false" data-state="off" title="The live prompter: it listens and whispers back (Shift-S) · Shift-click for what it has said"><span class="souffleuse-dot">◌</span> prompter</button>`
    : '';
  // Opens with the newline rather than standing on a line of its own in the
  // template: an empty expression on its own line still emits the line, and
  // every cockpit without a prompter carried a blank one where this is.
  // The footer's crib names every key that is not on a button, and Shift-S is
  // one of them: the button says `prompter` and nothing on it says which key
  // it answers to. Conditional like the button beside it.
  const souffleuseKbd = souffSettings
    ? ' &nbsp; <kbd>Shift</kbd>-<kbd>S</kbd> prompter'
    : '';
  const souffleuseChrome = souffSettings
    ? `\n<div id="psiINT-souffleuse-badge" class="cmd-badge" role="status" hidden></div>
<div id="psiINT-souffleuse-log" hidden aria-label="What the prompter has said">
  <header>what the prompter has said<button class="souffleuse-x" type="button" aria-label="close">&times;</button></header>
  <ol id="psiINT-souffleuse-log-list"></ol>
  <footer>
    <label><input type="checkbox" id="psiINT-souffleuse-heard-toggle"> show what it hears</label>
    <label><input type="checkbox" id="psiINT-souffleuse-cues-toggle"> cards into upcoming slides</label>
  </footer>
</div>`
    : '';
  // The strip and the line under it are emitted inside #psiINT-stage-cell, because
  // that is their classic home - absolutely positioned over its bottom edge,
  // the way the "+ note" button owns the other corner. In cue-card mode
  // cuePlaceStrip moves both into the head of the card column and back.
  // `start:` puts one more button beside the clock: the clock as the time
  // since the planned beginning. The minutes ride on the button, which is
  // where the runtime reads them from; a deck without the key has no button.
  const planStart = talkStart(frontmatter);
  const planClock = planStart == null ? ''
    : Math.floor(planStart / 60) + ':' + String(planStart % 60).padStart(2, '0');
  const clockPlanBtn = planStart == null ? ''
    : `<button id="psiINT-clock-plan" class="clock-step" type="button" data-start="${planStart}" title="Set the clock to the time since ${planClock}, the planned start (Z)">since ${planClock}</button>`;
  const souffleuseStrip = souffSettings
    ? `\n  <div id="psiINT-souffleuse-strip" role="status" aria-live="polite" hidden><span class="souffleuse-glyph"></span><span class="souffleuse-text"></span><button class="souffleuse-x" type="button" aria-label="dismiss">&times;</button></div>
  <div id="psiINT-souffleuse-heard" hidden></div>`
    : '';
  // Spliced into the same style and script elements the cockpit's own CSS
  // and JS are in, so the runtime keeps runtime/speaker.js's scope and the
  // rules keep their place in the cascade. Empty strings otherwise, and then
  // every byte of this file is the byte it was.
  const souffleuseCss = souffSettings ? souffleuseSheet() : '';
  const souffleuseRuntime = souffSettings ? souffleuseScript() : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lectureLang(frontmatter))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – ${escapeHtml(S['title-speaker'])}</title>
<style>
${shipCss(audienceCss())}
${shipCss(diagramCss())}
${shipCss(speakerCss())}${shipCss(souffleuseCss)}
</style>
${styleBlockCss(styleOpts, S)}
${fontStyleTag(opts.fontEmbed, 'live')}
${codeTag(styleOpts, opts.codeSizing, 'live')}
${katexStyleTag(columnsHtml, { fontToggle: true })}
${shipsEditor || souffSettings
  ? reloadScript(opts.watchPort, opts.watchNonce, { run: opts.watchRun })
  // The editor and the prompter are the cockpit's two writers; with
  // neither, it gets the reload alone, as the projection does.
  : reloadScript(opts.watchPort, null, { receiveOnly: true, listen: opts.watchListen, run: opts.watchRun })}
</head>
<body ${viewBodyAttrs(defaults, 'data-view="speaker" ' + styleBodyAttrs(styleOpts, frontmatter))}>
${themeBootScript(defaults)}
<div id="psiINT-scrubber">
${scrubberHtml}
</div>
<div id="psiINT-stage-cell">
  <div id="psiINT-stage-viewport">
    <div id="psiINT-stage">
${columnsHtml}
    </div>
  </div>
  <button id="psiINT-add-note-btn" type="button" title="Open speaker notes (Shift-N)">+ note</button>
  <div id="psiINT-clock-box">${clockPlanBtn}<button id="psiINT-clock-back" class="clock-step" type="button" title="The clock one minute back (&lt;)" aria-label="Clock one minute back">&minus;1</button><button id="psiINT-clock-fwd" class="clock-step" type="button" title="The clock one minute forward (&gt;)" aria-label="Clock one minute forward">+1</button><button id="psiINT-clock" type="button" title="Elapsed since the talk began · click to restart from 0:00"><span id="psiINT-timer">0:00</span><span id="psiINT-drift" hidden></span><span id="psiINT-clock-hint" aria-hidden="true">reset</span></button></div>${souffleuseStrip}
</div>
<section id="psiINT-cue-panel" aria-label="Cue cards">
  <header id="psiINT-cue-where">
    <span id="psiINT-cue-crumb"></span>
    <span id="psiINT-cue-pos"></span>
    <span id="psiINT-cue-zoom">
      <button id="psiINT-cue-zoom-out" type="button" title="Smaller cards" aria-label="Smaller cards">&minus;</button>
      <button id="psiINT-cue-zoom-in" type="button" title="Larger cards" aria-label="Larger cards">+</button>
    </span>
  </header>
  <div id="psiINT-cue-rail"></div>
</section>
<aside id="psiINT-notes-pane">
  <div id="psiINT-notes-resizer" role="separator" aria-orientation="horizontal" title="Drag to resize notes · double-click to reset"></div>
  <textarea id="psiINT-notes-content" rows="1" spellcheck="false" placeholder="" readonly></textarea>
  <div id="psiINT-notes-zoom">
    <button id="psiINT-notes-zoom-out" type="button" title="Smaller notes text" aria-label="Smaller notes text">&minus;</button>
    <button id="psiINT-notes-zoom-in" type="button" title="Larger notes text" aria-label="Larger notes text">+</button>
  </div>
</aside>
<div id="psiINT-preview-strip"></div>
<div id="psiINT-preview-resizer" role="separator" title="Drag to resize the preview strip · double-click to reset"></div>
<div id="psiINT-figure-overlay" aria-hidden="true"></div>
<footer id="psiINT-speaker-footer">
  <button id="psiINT-freeze-btn" type="button" aria-pressed="false">● live</button>
  <button id="psiINT-preview-orient-btn" type="button" title="Preview strip: along the bottom or down the right edge (Shift-V)">⇄ layout</button>
  <button id="psiINT-cue-btn" type="button" aria-pressed="false" title="Cue cards: your notes as cards, the projection small in the corner (K)">▤ cards</button>${souffleuseBtn}
  <button id="psiINT-export-annot-btn" type="button" title="Copy live annotations as &gt; annot: Markdown (Shift-E)">export notes</button>
  <button id="psiINT-speaker-help-btn" type="button" title="Keyboard and mouse reference (?)">? help</button>
  <span id="psiINT-slug">${escapeHtml(slug)}</span>
  <span class="spacer"></span>
  <span class="kbd-hint"><kbd>V</kbd> freeze &nbsp; <kbd>B</kbd> blank &nbsp; <kbd>W</kbd> full &nbsp; <kbd>D</kbd> demo &nbsp; <kbd>N</kbd> annot &nbsp; <kbd>Shift</kbd>-<kbd>N</kbd> notes &nbsp; <kbd>Shift</kbd>-<kbd>E</kbd> export${souffleuseKbd}</span>
</footer>
<div id="psiINT-note-templates">
${noteTemplates.join('\n')}
</div>
${TOUCH_CONTROLS_HTML}
${renderHelpOverlay('speaker', !!editorPayload(frontmatter, columnsHtml, 'speaker'), !!souffSettings, S)}
<div id="psiINT-mode-badge"></div>
<div id="psiINT-center-toast" role="status" aria-live="polite"></div>${souffleuseChrome}
${OVERVIEW_BADGE_HTML}
${SEARCH_PANEL_HTML}
${GOTO_PROMPT_HTML}
${BLANK_BADGE_HTML}
${FULLSCREEN_HINT_HTML}
${DEMO_BADGE_HTML}
${LINK_OVERLAY_HTML}
${renderTocNav(columns, S)}
${absentViewsScript(opts.absentViews)}<script>
${qrLibJs()}
</script>
<script>
${cueCardsJs()}
</script>
<script>
${commandsJs()}
</script>
<script>
const LECTURE_TITLE = ${titleJson};
const VIEW_DEFAULTS = ${jsonForScript(defaults)};
const LINK_QR = ${jsonForScript(linkQrMap(columnsHtml))};
const SOUFFLEUSE = ${souffleuseJs};
${shipJs(diagramJs())}
${shipJs(audienceJs())}
${shipJs(speakerJs())}${shipJs(souffleuseRuntime)}
</script>
${editorPayload(frontmatter, columnsHtml, 'speaker', opts.readerKey || opts.lectureKey)}
</body>
</html>
`;
}

// ── speaker CSS (layered on top of runtime/audience.css) ─────────────

// runtime/speaker.css, read as text at build time – the first of the
// literals to leave this file (PLAN-runtime-extraction.md), in editor.css's
// shape: read once per process, the text kept as the source the stylesheet
// check reads, stripped on its way into speaker.html by shipCss. Its bytes
// are the old literal's value, so a cockpit built before and after the move
// is the same file.
const SPEAKER_CSS_PATH = new URL('./runtime/speaker.css', import.meta.url);
let speakerCssCache = null;
const speakerCss = () => (speakerCssCache ??= fs.readFileSync(SPEAKER_CSS_PATH, 'utf8'));

// ── speaker-specific runtime (loaded after runtime/audience.js) ──────

// runtime/speaker.js, read as text at build time (PLAN-runtime-extraction.md;
// SPEAKER_JS until it left this file), in editor.css's shape: read once per
// process, stripped on its way into speaker.html by shipJs. It is a fragment,
// not a module: it runs in the one script element after runtime/audience.js and
// shares its lexical scope, and runtime/souffleuse.js follows it in the same
// element under --prompter. Its bytes are the old literal's *value* – the literal
// resolved sixteen escape characters, two of them browser templates written
// as \${ – so a cockpit built before and after the move is the same file.
const SPEAKER_JS_PATH = new URL('./runtime/speaker.js', import.meta.url);
let speakerJsCache = null;
const speakerJs = () => (speakerJsCache ??= fs.readFileSync(SPEAKER_JS_PATH, 'utf8'));

// ── the live prompter's CSS and runtime (--prompter only) ─────────
//
// Two files that reach a page only when the build carries --prompter: the
// stylesheet runtime/souffleuse.css after runtime/speaker.css inside the same
// style element, the script runtime/souffleuse.js after runtime/speaker.js
// inside the same script element (SOUFFLEUSE_CSS and SOUFFLEUSE_JS until they
// left this file). Being separate texts is the whole point of them. The
// rules used to live in the cockpit's stylesheet (then SPEAKER_CSS, now
// runtime/speaker.css) and the runtime at the foot of SPEAKER_JS (now
// runtime/speaker.js), which put 36 KB of prompter into every cockpit
// anybody ever built - while the comment in renderSpeaker promised that a
// build without the flag is the file it was before the feature. It is now,
// apart from the cue-card integration the rail needs either way
// (souffleuseCues and the merge in cueCardsFor, twenty-odd lines that are
// free over an empty Map).
//
// **The runtime is spliced inside the same script element, at the point where
// it used to stand.** It shares runtime/speaker.js's lexical scope and needs
// to: it reads flatChunks, state, viewHooks, cueSync, cueOn, cuePosition,
// souffleuseCues, applyCueMode, flashMode, escText, elapsedSeconds, tStart
// and PSI_CARDS. In a script element of its own every one of those is
// undefined.
//
// Both are files, so the template-literal rules of this file no longer apply
// to them: a backtick is a backtick there and a regex escape is written once.

// runtime/souffleuse.css, read as text at build time (PLAN-runtime-extraction.md;
// SOUFFLEUSE_CSS until it left this file), in editor.css's shape: read once
// per process, stripped on its way into speaker.html by shipCss. Not named
// souffleuseCss, which is renderSpeaker's local for the text it splices.
// renderSpeaker calls this only under --prompter; the stylesheet check in
// buildOnce reads it on every build, as it read the literal, so a broken
// sheet fails a build without the flag too. Its bytes are the old literal's
// *value* – the literal resolved one escape, the doubled backslash of a CSS
// content escape – so a cockpit built before and after the move is the same
// file.
const SOUFFLEUSE_CSS_PATH = new URL('./runtime/souffleuse.css', import.meta.url);
let souffleuseSheetCache = null;
const souffleuseSheet = () => (souffleuseSheetCache ??= fs.readFileSync(SOUFFLEUSE_CSS_PATH, 'utf8'));

// runtime/souffleuse.js, read as text at build time (PLAN-runtime-extraction.md;
// SOUFFLEUSE_JS until it left this file), in editor.css's shape: read once
// per process, stripped on its way into speaker.html by shipJs. Not named
// souffleuseJs, which is renderSpeaker's local for the SOUFFLEUSE settings,
// nor souffleuseRuntime, its local for the text it splices. renderSpeaker
// calls this only under --prompter, so a build without the flag never reads
// the file. It is a fragment, not a module: it runs after runtime/speaker.js
// in the same script element and shares its lexical scope. Its bytes are the
// old literal's *value* – the literal resolved thirty-nine escape characters
// (doubled backslashes in strings and one regex, and \u escapes it turned
// into the characters themselves) – so a cockpit built before and after the
// move is the same file.
const SOUFFLEUSE_JS_PATH = new URL('./runtime/souffleuse.js', import.meta.url);
let souffleuseScriptCache = null;
const souffleuseScript = () => (souffleuseScriptCache ??= fs.readFileSync(SOUFFLEUSE_JS_PATH, 'utf8'));

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
  // No end marker is refused, never read as "to the end of the file": the
  // block is removed from the source, so that reading deleted every slide
  // written after a pasted snippet whose last line had not come along.
  if (endMarkerIdx < 0) return { src, moved: 0, unresolved: [], warnings: [], hadMarker: true, noEnd: true };
  const blockEnd = endMarkerIdx + ANNOT_MARKER_END.length;
  const blockInner = src.slice(startIdx + ANNOT_MARKER_START.length, endMarkerIdx);

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
  if (result.noEnd) {
    console.error('The <!-- annotations:start --> block in ' + absIn + ' has no <!-- annotations:end --> line after it.');
    console.error('Without one there is no telling where the snippet stops and the lecture goes on, so nothing was changed.');
    console.error('Add the end marker under the last `> annot:` block, then run --integrate-annotations again.');
    process.exit(1);
  }
  if (result.moved === 0 && result.unresolved.length === 0 && !result.warnings.length) {
    console.log('Marker block was empty — nothing to integrate. Source unchanged.');
    return;
  }
  rewriteSourceFile(absIn, result.src);
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
// What --optimize-images can do something about when an asset is over the
// per-image inline cap, which is a wider set than what it converts: a WebP is
// not a conversion candidate – it is already WebP – but one over the cap is
// exactly the asset assertInlinable refuses, and re-encoding it narrower is
// the only thing that helps. Held here so assertInlinable's advice and this
// verb's candidate list cannot drift.
const RESCUABLE_EXTS = new Set([...OPTIMIZABLE_EXTS, 'webp']);
// The width a photograph is downscaled to when q92 alone does not clear the
// cap. Measured case: a 4032px exam-room photograph came out of cwebp at
// 2.23 MB and only -resize 2400 0 brought it under – and before this the
// build refused the deck after the verb it recommends had reported success.
//
// Downscaling still happens only here, never by default: figure focus zooms to
// FIG_MAX_SCALE (8x), so a wide diagram is wide on purpose. This is the last
// step before giving up on an asset the build will otherwise refuse, and
// 2560 px is more resolution than a photographic backdrop on a 1600x900 frame
// can show at any zoom the reader has.
const CAP_RESCUE_WIDTH = 2560;
// What to suggest when even that is over the cap. Two steps down a ladder
// rather than arithmetic, because the author is going to type it.
const nextRescueWidth = (w) => (w > 1920 ? 1920 : w > 1280 ? 1280 : 960);

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

// ImageMagick's format prefix for a source file, from its extension. Only the
// formats the encoder is ever handed; anything else is refused rather than
// left to content sniffing.
const MAGICK_DECODERS = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp' };
function magickInput(src) {
  const fmt = MAGICK_DECODERS[path.extname(src).slice(1).toLowerCase()];
  if (!fmt) throw new Error(`magick: no decoder named for ${path.basename(src)}`);
  return `${fmt}:${src}`;
}

function detectWebpEncoder() {
  const probe = (bin, args) => {
    try { execFileSync(bin, args, { stdio: 'ignore' }); return true; }
    catch (e) { return e.code !== 'ENOENT'; }
  };
  // The version is part of what the inline cache keys an encode by (see
  // webpCacheKey): another cwebp may write other bytes for the same picture.
  const version = (bin) => {
    try { return String(execFileSync(bin, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] })).split('\n')[0].trim(); }
    catch { return ''; }
  };
  // One argument list per encoder, run either way: encode() blocks, as
  // --optimize-images and a picture met mid-render want, and encodeAsync()
  // is what the inline pre-pass runs several of at once. The same list in
  // both is what keeps the bytes the same whichever ran.
  const make = (name, argv) => ({
    name,
    version: version(name),
    argv,
    encode(src, dst, resizeTo) {
      execFileSync(name, argv(src, dst, resizeTo), { stdio: 'ignore' });
    },
    encodeAsync(src, dst) {
      return new Promise((resolve, reject) => {
        execFile(name, argv(src, dst, null), { stdio: 'ignore' }, (err) => (err ? reject(err) : resolve()));
      });
    },
  });
  if (probe('cwebp', ['-version'])) {
    return make('cwebp', (src, dst, resizeTo) => {
      const args = ['-quiet', '-q', String(WEBP_QUALITY), '-m', '6', '-sharp_yuv'];
      // Height 0 keeps the aspect ratio. The caller has already decided
      // that resizeTo is smaller than the source.
      if (resizeTo) args.push('-resize', String(resizeTo), '0');
      return [...args, src, '-o', dst];
    });
  }
  if (probe('magick', ['-version'])) {
    return make('magick', (src, dst, resizeTo) => {
      // The decoder is named, not guessed. ImageMagick picks one from the
      // file's content, and a "photo.png" that is really an MVG or an SVG
      // script can tell it to read any file on the machine into the picture
      // (`text:/path/to/key`). With `png:` in front it is a PNG or it is an
      // error. The output is named too: the caller's dst ends in .tmp.
      const args = [magickInput(src), '-quality', String(WEBP_QUALITY)];
      // The trailing > is belt-and-braces: the caller already filtered.
      if (resizeTo) args.push('-resize', `${resizeTo}x>`);
      return [...args, `webp:${dst}`];
    });
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
  // One resolver for all three ways a source names a picture. It used to be
  // written out twice and the third way was missing from both.
  const addRef = (ref) => {
    if (!ref) return;
    if (/^[a-z]+:/i.test(ref) || ref.startsWith('//')) return;   // remote URL
    if (!ref.includes('/') && !path.extname(ref)) {
      const rel = resolveFigId(ref);                             // shorthand
      if (rel) add(path.join(sourceDir, rel), null);
      return;
    }
    // Recorded without a query or fragment: the rewrite below swaps the
    // extension, and keeps whatever `?…` the author wrote after it.
    const file = assetFileOf(ref);
    const abs = path.resolve(sourceDir, file);
    if (fs.existsSync(abs)) add(abs, file);
  };
  for (const ref of collectMarkdownImageRefs(src)) addRef(ref);
  // Diagram images too, or the verb the oversized-asset failure tells the
  // author to run answers "nothing to do" about the very file it refused.
  for (const ref of collectDiagramImageRefs(src)) addRef(ref);
  // And a ::: backdrop, a cover-image: and a closing-image:, for exactly that
  // reason: those are the references most likely to be a photograph, which is
  // the kind of asset that blows the cap. `closing-image: cover` names no file
  // and resolves to nothing here.
  for (const ref of collectDecorationImageRefs(src)) addRef(ref);
  return [...refs.values()];
}

// Rewrite one converted asset's explicit references in a source.md, in every
// spelling a source carries them:
//
//   ![alt](assets/room.jpg)          the markdown form
//   image photo assets/room.jpg      the bare token a ::: draw statement takes
//   ::: backdrop assets/room.jpg     the bare token a directive takes
//   cover-image: assets/room.jpg     a frontmatter value, quoted or not
//
// Fence-aware, because a path inside a code fence is documentation, not a
// reference – the same rule the collectors follow. Rewriting only the markdown
// form once deleted an original a diagram still pointed at and then reported
// the rewrite as done, so the next build failed on a file this very command
// had removed; the bare-token form covers the other three, and the quotes are
// in the boundary classes so a quoted frontmatter value is not missed.
// Shorthand refs (`![](room)`, `::: backdrop room`) need no edit at all – the
// resolver finds the .webp.
function rewriteAssetRef(src, from, to) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `<` and `>` for the angle form `![](<path>)`, `?` and `#` for a path the
  // author wrote with a query or fragment after it.
  const bare = new RegExp(`(^|[\\s("'<])${esc}(?=[\\s)"'>?#]|$)`, 'g');
  const fence = fenceTracker();
  return String(src).split('\n').map((line) => {
    if (fence.step(line) || fence.inside) return line;
    return line.split(`](${from})`).join(`](${to})`)
      .replace(bare, (m0, pre) => pre + to);
  }).join('\n');
}

function runOptimizeImages(absIn, { dryRun = false, all = false, maxWidth = null } = {}) {
  const sourceDir = path.dirname(absIn);
  currentSourceDir = sourceDir;      // resolveFigId closes over this
  imgResolveCache.clear();
  let src = fs.readFileSync(absIn, 'utf8');

  const threshold = all ? 0 : OPTIMIZE_MIN_BYTES;
  // This verb replaces files and deletes originals, so it works only inside
  // the lecture's own folder, links resolved. A picture one level up is one
  // the build may read - a folder of pictures several lectures share - and
  // converting it would delete a file the other lectures name by its path;
  // one further out is one the build refuses to read at all.
  const ownDir = realpathLoose(sourceDir);
  const assetRoot = assetRootOf(sourceDir);
  const shared = [], refused = [];
  const refs = collectImageRefs(src, sourceDir).filter((r) => {
    if (assetEscape(r.absPath, sourceDir) !== null) { refused.push(path.relative(sourceDir, r.absPath)); return false; }
    if (pathWithin(ownDir, realpathLoose(r.absPath))) return true;
    shared.push(path.relative(sourceDir, r.absPath));
    return false;
  });
  if (shared.length) {
    console.log(`Skipped ${shared.length} shared picture(s) outside this lecture's folder – another lecture`);
    console.log('may name them by their path, so convert them by hand if you need to:');
    for (const n of shared) console.log(`  ${n}`);
    console.log('');
  }
  if (refused.length) {
    console.log(`Refused ${refused.length} picture(s) outside ${assetRoot} or in a dot-folder, which the build will not read either:`);
    for (const n of refused) console.log(`  ${n}`);
    console.log('');
  }
  const candidates = refs
    .filter(r => RESCUABLE_EXTS.has(r.ext))
    .map(r => ({ ...r, size: fs.statSync(r.absPath).size }))
    // A PNG or a JPEG over the size threshold is a conversion candidate. A
    // WebP is not – it is already WebP, and re-encoding one on a whim is
    // generation loss for nothing – but a WebP over the per-image inline cap
    // is the asset the build refuses, and a narrower re-encode is the only
    // move left. So it comes in when, and only when, it is over the cap.
    .filter(r => (OPTIMIZABLE_EXTS.has(r.ext) && r.size >= threshold)
      || (r.ext === 'webp' && r.size > MAX_INLINE_BYTES))
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

  const capMb = MAX_INLINE_BYTES / 1024 / 1024;

  for (const ref of candidates) {
    // A WebP is re-encoded onto itself: there is no second file to write and
    // no reference to rewrite, only a narrower picture at the same path.
    const inPlace = ref.ext === 'webp';
    const dst = inPlace ? ref.absPath : ref.absPath.replace(/\.[^.]+$/, '.webp');
    // The new name has to be free, and so does the stem. logo.png and
    // logo.jpg both became one logo.webp and both originals were deleted; a
    // logo.webp the lecture shows as a picture of its own was overwritten;
    // and a shorthand ![](logo) that found logo.png finds logo.jpg once the
    // PNG is gone. Any other picture or clip with this stem in the folder is
    // refused by name, before anything is encoded, and the author renames.
    if (!inPlace) {
      const stem = path.basename(ref.absPath).replace(/\.[^.]+$/, '').toLowerCase();
      const own = path.basename(ref.absPath).toLowerCase();
      let siblings = [];
      try {
        siblings = fs.readdirSync(path.dirname(ref.absPath)).filter((f) => {
          const lower = f.toLowerCase();
          const ext = path.extname(lower).slice(1);
          return lower !== own && lower.replace(/\.[^.]+$/, '') === stem
            && (IMG_EXTS.includes(ext) || VIDEO_EXTS.includes(ext));
        });
      } catch (e) { /* an unreadable folder: the encode below will say so */ }
      if (siblings.length) {
        rows.push({
          name: path.basename(ref.absPath), from: ref.size, to: null, dims: '?',
          note: `skipped: ${siblings.join(', ')} has the same name – rename one and rerun`,
        });
        before += ref.size; after += ref.size;
        continue;
      }
    }
    // A fresh name, not dst + '.tmp': the encoder writes wherever a path
    // points, and a fixed name is one a folder can arrive with as a link.
    const tmpName = (tag) => path.join(path.dirname(dst),
      `.${path.basename(dst)}.${crypto.randomBytes(6).toString('hex')}.${tag}.tmp`);
    const tmp = tmpName('encode');
    // Only ever shrink. cwebp -resize enlarges a narrower image without
    // complaint, which would waste bytes and invent detail.
    const dims = imageSize(ref.absPath);
    let resizeTo = (maxWidth && dims && dims.width > maxWidth) ? maxWidth : null;
    let outSize;
    try {
      encoder.encode(ref.absPath, tmp, resizeTo);
      outSize = fs.statSync(tmp).size;
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      rows.push({ name: path.basename(ref.absPath), from: ref.size, to: null, dims: dims ? `${dims.width}x${dims.height}` : '?', note: 'encode failed' });
      continue;
    }
    // q92 clears the cap on nearly everything, and then there is the
    // photograph of a room: 4032 px wide, 2.23 MB as WebP, still refused. Do
    // not stop at "converted" there – the author is running this command
    // because the build refused the deck, and coming back to say the asset is
    // smaller but still refused is the same dead end in fewer megabytes. One
    // more pass at CAP_RESCUE_WIDTH, and the report says it happened.
    let rescued = false;
    if (outSize > MAX_INLINE_BYTES && dims && CAP_RESCUE_WIDTH < (resizeTo || dims.width)) {
      const tmp2 = tmpName('rescue');
      try {
        encoder.encode(ref.absPath, tmp2, CAP_RESCUE_WIDTH);
        const rescueSize = fs.statSync(tmp2).size;
        fs.rmSync(tmp, { force: true });
        fs.renameSync(tmp2, tmp);
        outSize = rescueSize;
        resizeTo = CAP_RESCUE_WIDTH;
        rescued = true;
      } catch (e) {
        fs.rmSync(tmp2, { force: true });   // keep the first encode
      }
    }
    const dimLabel = dims
      ? `${dims.width}x${dims.height}${resizeTo ? ` → ${resizeTo}w` : ''}`
      : '?';
    // WebP is not always smaller – an already-optimised PNG of flat colour
    // can lose. Keep whichever is smaller and never report a regression as
    // a win.
    if (outSize >= ref.size) {
      fs.rmSync(tmp, { force: true });
      const kept = ['kept original (webp larger)'];
      if (ref.size > MAX_INLINE_BYTES) {
        kept.push(`still over the ${capMb} MB cap – rerun with --max-width ${nextRescueWidth(dims ? dims.width : CAP_RESCUE_WIDTH)}`);
      }
      rows.push({
        name: path.basename(ref.absPath), from: ref.size, to: outSize, dims: dimLabel,
        note: kept.join('; '), over: ref.size > MAX_INLINE_BYTES, final: ref.size,
        width: dims ? dims.width : null,
      });
      before += ref.size; after += ref.size;
      continue;
    }
    before += ref.size; after += outSize; converted++;
    const notes = [];
    if (rescued) notes.push(`downscaled to ${CAP_RESCUE_WIDTH}w to clear the ${capMb} MB cap`);
    else if (inPlace) notes.push('re-encoded in place');
    const stillOver = outSize > MAX_INLINE_BYTES;
    if (stillOver) {
      notes.push(`still ${(outSize / 1024 / 1024).toFixed(2)} MB, over the ${capMb} MB cap – rerun with --max-width ${nextRescueWidth(resizeTo || (dims ? dims.width : CAP_RESCUE_WIDTH))}`);
    }
    rows.push({
      name: path.basename(ref.absPath), from: ref.size, to: outSize, dims: dimLabel,
      note: notes.join('; '), over: stillOver, final: outSize,
      width: resizeTo || (dims ? dims.width : null),
    });
    if (dryRun) { fs.rmSync(tmp, { force: true }); continue; }
    fs.renameSync(tmp, dst);
    // Never after an in-place re-encode: dst IS absPath there, and removing it
    // would delete the file just written.
    if (!inPlace) fs.rmSync(ref.absPath, { force: true });
    for (const explicit of ref.explicitRefs) {
      const replacement = explicit.replace(/\.[^.]+$/, '.webp');
      if (replacement === explicit) continue;      // a .webp kept its own name
      const rewritten = rewriteAssetRef(src, explicit, replacement);
      if (rewritten !== src) { src = rewritten; sourceEdits.push({ from: explicit, to: replacement }); }
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

  // Said again, apart from the table, because this is the one outcome that
  // leaves the build still refusing the deck – and it is a row among twenty.
  const stuck = rows.filter(r => r.over);
  if (stuck.length) {
    console.log('');
    console.log(`${stuck.length} asset(s) are still over the ${capMb} MB per-image inline cap, so the build will refuse this deck:`);
    for (const r of stuck) {
      console.log(`  ${r.name}  ${(r.final / 1024 / 1024).toFixed(2)} MB  – rerun with --max-width ${nextRescueWidth(r.width || CAP_RESCUE_WIDTH)}`);
    }
    console.log('  (or --no-inline-images at build time, which ships external asset paths on purpose.)');
  }

  if (dryRun) {
    console.log('');
    console.log('Dry run – nothing written. Drop --dry-run to apply.');
    return;
  }

  if (sourceEdits.length) {
    rewriteSourceFile(absIn, src);
    console.log('');
    console.log(`Rewrote ${sourceEdits.length} explicit image path(s) in ${path.basename(absIn)}:`);
    for (const e of sourceEdits) console.log(`  ${e.from} → ${e.to}`);
  }
  console.log('');
  console.log('Originals were replaced. Review with `git diff` and `git status`, then rebuild.');
  console.log('Shorthand refs like ![](fig-id) need no edit – the resolver finds the .webp.');
}

// ── souffleuse (--prompter) ────────────────────────────────────────
//
// The live prompter's Node half. The cockpit listens to the room and sends
// what it heard over the watch socket; this section holds the deck, the
// clock and the transcript, calls one model through OpenRouter when there is
// an occasion, and whispers back at most twelve words. docs/history/PLAN-souffleuse.md is
// the design; souffleuse.mjs is everything about it that is pure, and is why
// the restraint can be tested without a network.
//
// Three properties this section exists to keep:
//
//  - The key never reaches the HTML. It is read from the environment here and
//    stays here; a page only ever sees a finished hint.
//  - Nothing loads without the flag. Both modules are imported dynamically
//    inside createSouffleuse, so an ordinary build never reads either file –
//    which is also why `desktop/scripts/stage-engine.mjs` is untouched in v1:
//    the packaged app has no network entitlement and never passes the flag,
//    and a file it cannot reach is a file it does not have to ship.
//  - Nothing throws out of a handler. This runs while somebody is talking to
//    a room. Every failure becomes a status, a log line and silence.
//
// The whole thing is inert until a cockpit says hello: without one there is
// no clock, no transcript and no occasion to call anybody.

const SOUFFLEUSE_TIMEOUT_MS = 8000;
// What an API key is made of: printable ASCII, no spaces. Anything else is
// refused at start (see createSouffleuse) rather than put into a header.
const SOUFFLEUSE_KEY_RE = /^[\x21-\x7e]+$/;
// A segment's spoken seconds may not exceed the wall-clock seconds since the
// one before it by more than this (souffleuse.mjs `clampSpan`). The
// recogniser's stamps are the cockpit's clock, which the page controls; this
// is the slack for two messages crossing a socket.
const SOUFFLEUSE_SPAN_SLACK_S = 2;
// The longest id, name or word a page may put into the log: a chunk id, a
// hint id, how a hint was sent away, the recogniser's name. Every string a
// cockpit sends is the page's to choose, and a hundred kilobytes in a
// `dismiss` was a hundred kilobytes on every line of the debrief. The heard
// words have their own cap, SEGMENT_MAX_CHARS; a language tag is shorter
// still (BCP 47 allows 35).
const SOUFFLEUSE_ID_MAX = 200;
const SOUFFLEUSE_LANG_MAX = 35;
const pageString = (v, max = SOUFFLEUSE_ID_MAX) => String(v == null ? '' : v).slice(0, max);
// 30 s, 60 s, then two minutes, and after five in a row the sidecar gives up
// for this build. A prompter that keeps retrying through a talk is a prompter
// that spends the speaker's bandwidth on nothing.
const SOUFFLEUSE_BACKOFF_MS = [30000, 60000, 120000];
const SOUFFLEUSE_MAX_ERRORS = 5;
const SOUFFLEUSE_MAX_GARBAGE = 5;
const SOUFFLEUSE_BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter shows both on its activity page, which is where somebody with
// the bill in front of them goes to ask what spent it. The address is the
// repository from package.json.
const SOUFFLEUSE_TITLE = 'psi-slides';
const SOUFFLEUSE_REFERER = 'https://github.com/UBA-PSI/psi-slides';
// The transcript window the tick message rolls: seconds first, words as the
// second cap. Both are souffleuse.mjs defaults, named here because they are a
// cost decision rather than a grammar one.
const SOUFFLEUSE_WINDOW_S = 90;
const SOUFFLEUSE_WINDOW_WORDS = 600;
// How many segments are kept at all. A two-hour talk is a few thousand, and
// nothing older than the window is ever read, so the rest is memory nobody
// looks at.
const SOUFFLEUSE_TRANSCRIPT_MAX = 500;

// A line for the terminal, with every control character (and the bidi
// overrides that reorder what a terminal shows) replaced by a space. The
// prompter prints a model's words and an endpoint's errors there, and an
// escape sequence in either is an instruction to the author's terminal.
function terminalSafe(line) {
  return String(line).replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, (c) => (c === '\n' ? '\n' : ' '));
}

// One log per run of the watcher, beside source.md: the debrief. Seconds in
// the name, because two runs started in one minute – a rehearsal stopped and
// started again – shared a file when it had minutes only, and a dry run says
// so in its name, so the debrief's default can pass it over without opening
// it. `--prompter-debrief` still reads the minute-precision names
// (`logNameFacts` in souffleuse.mjs).
function souffleuseLogPath(absIn, when = new Date(), { dry = false } = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}`
    + `-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
  return path.join(path.dirname(absIn), `prompter-${stamp}${dry ? '-dry' : ''}.jsonl`);
}

// A path for the prompter's lines: relative to where the command runs when it
// is below it, else whole – "../../../.." helps nobody find a file.
function shownPath(p) {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
}

// Where the key is read from when the environment has none: one file, the
// user's own, holding the key alone or an `OPENROUTER_API_KEY=…` line. Under
// $XDG_CONFIG_HOME when that is set to an absolute path, else ~/.config.
// Refused, as ssh refuses a private key, when another account owns it or may
// read or write it. Nothing else is read from it – OPENROUTER_BASE_URL least
// of all – and no `.env` anywhere is read: one beside source.md would be
// the sender's of a deck, and an endpoint of their choosing receives the
// deck, the speaker notes and what the room says.
function prompterKeyFile(env = process.env, home = os.homedir()) {
  const xdg = String(env.XDG_CONFIG_HOME || '');
  const dir = path.isAbsolute(xdg) ? xdg : path.join(home, '.config');
  return path.join(dir, 'psi-slides', 'openrouter.key');
}

// The key and where it came from, or why there is none.
//   { key, from }       from: 'OPENROUTER_API_KEY' or the file's path
//   { key: '', file, problem }   problem: null when the file is not there
function resolvePrompterKey(env = process.env, home = os.homedir()) {
  const fromEnv = String(env.OPENROUTER_API_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, from: 'OPENROUTER_API_KEY' };
  const file = prompterKeyFile(env, home);
  const shown = file.startsWith(home + path.sep) ? '~' + file.slice(home.length) : file;
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch (e) {
    return { key: '', file: shown, problem: e.code === 'ENOENT' ? null : `${shown} cannot be read (${e.code || e.message})` };
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return { key: '', file: shown, problem: `${shown} is not a file` };
    if (process.platform !== 'win32') {
      if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
        return { key: '', file: shown, problem: `${shown} belongs to another account, so it is not read` };
      }
      if (st.mode & 0o077) {
        return {
          key: '', file: shown,
          problem: `${shown} can be read by other accounts (mode ${(st.mode & 0o777).toString(8)}; chmod 600 it), so it is not read`,
        };
      }
    }
    if (st.size > 4096) return { key: '', file: shown, problem: `${shown} is longer than a key` };
    const text = fs.readFileSync(fd, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m && m[1] !== 'OPENROUTER_API_KEY') continue;
      const key = (m ? m[2] : line).trim().replace(/^(['"])(.*)\1$/, '$2').trim();
      if (key) return { key, from: shown };
    }
    return { key: '', file: shown, problem: `${shown} holds no key` };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The sidecar. One per watch process, created before the first build and fed
 * the parsed deck by `rebuild`.
 *
 *   onBuild(lecture)          a build succeeded – new deck, new prefix
 *   onMessage(msg, reply, s)  a souffleuse-* message off the watch socket
 *   say(segment)              the same as a souffleuse-say, for a producer
 *                             inside Node (whisper.cpp, one day)
 *   setEnabled(on)            the --events stdin command
 *   close()                   abandon whatever is in flight
 *
 * `sendToCockpit` is the caller's, because the socket of the last hello is
 * the caller's to track: it is the one thing here that has to notice a
 * WebSocket closing.
 */
async function createSouffleuse({
  absIn, opts = {}, sendToCockpit: sendRaw = () => false,
  emitEvent: emitRaw = () => {}, log: logRaw = console.log,
} = {}) {
  // Dynamic, and only here. souffleuse.mjs is the pure half; cue-cards.mjs is
  // imported for `notesToCards` alone, which deckPayload takes as an injected
  // leaf – the same arrangement createDiagramCompiler has with its four.
  const souff = await import('./souffleuse.mjs');
  const { notesToCards } = await import('./cue-cards.mjs');

  // The environment's key, or the key file's (resolvePrompterKey). A dry run
  // asks for none and does not open the file; the environment's is still
  // taken, so that redact knows it.
  const found = opts.dryRun
    ? { key: String(process.env.OPENROUTER_API_KEY || '').trim(), from: 'OPENROUTER_API_KEY' }
    : resolvePrompterKey();
  let key = found.key;
  const base = String(process.env.OPENROUTER_BASE_URL || SOUFFLEUSE_BASE_URL)
    .trim().replace(/\/+$/, '');
  // A key is printable ASCII and nothing else. One with a line break or a
  // space inside it - pasted with its neighbour, or with the shell's quote -
  // made the HTTP client throw an error that quoted the header, key and all,
  // and that message went to the log, the terminal, the cockpit's badge and
  // --events. It is refused here, in words that do not contain it, and never
  // sent anywhere.
  const keyUnusable = !!key && !SOUFFLEUSE_KEY_RE.test(key);
  if (keyUnusable) key = '';
  const unusableKey = found.key;
  // No usable key is a dry run rather than a prompter that is off: the ear,
  // the ticks, the policy and the log all run, which is what a rehearsal on a
  // machine without the key wants, and the start says so in one line with
  // the fix. --prompter-dry-run is the same run, asked for.
  const noKeyWhy = opts.dryRun || key ? null
    : keyUnusable
      ? `the key in ${found.from} is not usable – it contains a space, a line break or a character outside printable ASCII`
      : found.problem || 'no OpenRouter key';
  const dryRun = !!opts.dryRun || !!noKeyWhy;
  const logPath = souffleuseLogPath(absIn, new Date(), { dry: dryRun });

  // Every string that leaves this function - a log line, a terminal line, an
  // event, a status on the cockpit's badge, a reply - goes through this, so
  // an error that quotes the key (an HTTP client echoing the header, an
  // endpoint echoing the request) never reaches any of them. The terminal
  // copy is also stripped of control characters: a model's words and an
  // endpoint's error are printed there, and an escape sequence in either is
  // an instruction to the author's terminal.
  const redact = (x) => {
    let t = String(x);
    for (const k of [key, unusableKey]) {
      if (!k || k.length < 4) continue;
      // And its JSON-escaped spelling, which is how a log line carries it.
      for (const form of new Set([k, JSON.stringify(k).slice(1, -1)])) t = t.split(form).join('[key]');
    }
    return t;
  };
  const scrub = (v) => {
    if (typeof v === 'string') return redact(v);
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = scrub(x);
      return o;
    }
    return v;
  };
  const log = (line) => logRaw(terminalSafe(redact(line)));
  const emit = (ev) => emitRaw(scrub(ev));
  const sendToCockpit = (msg) => sendRaw(scrub(msg));

  // Disabled is not off: the transcript, the moves and the ticks that would
  // have gone out are still logged, because the log is what a rehearsal is
  // read back from. A run starts enabled – without a key it is a dry run,
  // above – and is disabled only by what happens later: a key the endpoint
  // refuses, five failures in a row.
  let disabled = null;

  let deck = null;            // what deckPayload made of the last build
  let prefix = null;          // {text, hash} – the cached system prompt
  let marks = [];             // flattenMarks(deck), for the drift
  let model = String(opts.model || '').trim() || null;   // --prompter-model
  const cliModel = model;
  let lang = 'en';
  let cadence = SOUFFLEUSE_SPEC.cadence.dflt;
  let cooldown = SOUFFLEUSE_SPEC.cooldown.dflt;
  // Two halves of one permission. The deck's `prompter: {cues: off}` is the
  // ceiling and the cockpit's checkbox is the speaker's own answer under it;
  // `cuesAllowed` is the conjunction, and it is what `cueTargets` reads. With
  // the box off the model is offered no target at all, so no cue is judged,
  // no slide is locked against a second and nothing enters the duplicate
  // rule – rather than cards being laid into a rail that refuses to show
  // them.
  let cuesCeiling = true;
  let cuesWanted = true;
  let cuesAllowed = true;
  let callsPerHour = SOUFFLEUSE_SPEC['calls-per-hour'].dflt;
  let durationS = null;
  let policy = null;
  let stt = null;             // what the cockpit said its ear is

  let on = false;             // the switch in the cockpit
  let onAtElapsed = 0;        // and when it was thrown, on the cockpit's clock
  const cursor = {
    chunkId: null, idx: 0, beat: 0, beats: null, elapsed: 0, wallAt: Date.now(),
  };
  let warnedIdx = false;      // the out-of-range warning is said once, not per press
  const transcript = [];
  const hints = [];           // what went to the strip, newest last
  const cues = [];
  // What has been said since the last call, and when (on this machine's
  // clock) the count started: the wall seconds the credited speech and the
  // slide floor are held to (`shouldTick`'s `wallSince`).
  let sinceTick = { seconds: 0, words: 0, wall: Date.now() };
  let lastTickAt = null;
  // Whether any call has gone out in this run. Not `lastTickAt == null`:
  // a clock jump clears that stamp, and a cleared stamp read as "no call yet"
  // skipped the floor on every pair of moves (`shouldTick`'s `ticked`).
  let ticked = false;
  let lastTickReason = null;
  let slideChanged = false;
  let inflight = null;        // the AbortController of the call that is out
  let pendingReason = null;   // an occasion that arrived while one was out
  let errorStreak = 0;
  let garbageStreak = 0;
  let backoffUntil = 0;
  let lastTimeHint = null;
  let hintSeq = 0;
  let cueSeq = 0;
  let lastStatus = null;
  // The calls of the last hour, as wall-clock stamps, for the budget in
  // `prompter: {calls-per-hour}`. Dry-run calls count too, so a rehearsal
  // shows where the budget would bite.
  const callTimes = [];
  let budgetSpent = false;
  // When the last segment arrived, on this machine's clock: the reference a
  // segment's claimed length is held to (`clampSpan`). Only a test that
  // moves the cockpit's clock by hand turns that off.
  let lastSayWall = Date.now();
  const freeClock = process.env.PSI_PROMPTER_FREE_CLOCK === '1';

  // The cockpit's clock, carried forward between messages. Every `say` and
  // `move` stamps it; between them the wall clock runs, which is what makes
  // a cadence measured in seconds mean seconds and not messages.
  const nowElapsed = () => cursor.elapsed + (Date.now() - cursor.wallAt) / 1000;

  let logFailed = false;
  function logLine(type, body) {
    try {
      appendOutputFile(logPath,
        redact(JSON.stringify({ t: new Date().toISOString(), type, ...body })) + '\n', 0o600);
    } catch (e) {
      // A log that cannot be written is not a reason to stop a talk, but it
      // is said once: the debrief this run promised will not be there. A
      // link at the log's path is the refusal that lands here (ELOOP).
      if (!logFailed) {
        logFailed = true;
        log(`[prompter] cannot write the log ${logPath} (${e.code || e.message}) – this run keeps no debrief`);
      }
    }
  }

  // Five states, and two of them are not the same thing: `off` is the sidecar
  // saying it cannot work at all (no key, a refused key, five failures), with
  // the reason; `idle` is the speaker having switched the prompter off, which
  // is a choice and reverses on the next press.
  function status(state, why = null) {
    const quiet = state === 'thinking' || state === 'listening';
    const changed = !lastStatus || lastStatus.state !== state || lastStatus.why !== why;
    lastStatus = { state, why };
    sendToCockpit({ type: 'souffleuse-status', state, why });
    // The clock rides along because the log is read back: `--prompter-replay`
    // measures the opening quiet from the `listening` that the switch wrote,
    // and nothing else in the log says when the switch was thrown.
    logLine('status', { state, why, elapsed: nowElapsed() });
    emit({ type: 'prompter', state, why });
    // The terminal hears the states a person would want to be told about. A
    // line per tick would bury the build log the author is actually reading.
    if (changed && !quiet) log(`[prompter] ${state}${why ? ' – ' + why : ''}`);
  }

  function disable(why) {
    disabled = { why: redact(why) };
    on = false;
    status('off', why);
  }

  function logSession(via) {
    logLine('session', {
      via,
      model,
      base,
      prefixHash: prefix ? prefix.hash : null,
      prefixChars: prefix ? prefix.text.length : 0,
      chunkCount: deck ? deck.chunks.length : 0,
      lang,
      durationS,
      cadence,
      cooldown,
      cues: cuesAllowed,
      stt,
      disabled: disabled ? disabled.why : null,
      dryRun,
    });
  }

  // ── what a build gives it ──────────────────────────────────────────

  function onBuild(lecture) {
    try {
      const fm = (lecture && lecture.frontmatter) || {};
      // Already validated in the buildOnce pre-flight – read again here
      // because both functions are pure and the sidecar wants the values.
      const settings = souffleuseSettings(fm);
      lang = settings.language || lectureLang(fm);
      durationS = talkDuration(fm);
      cadence = settings.cadence;
      cooldown = settings.cooldown;
      callsPerHour = settings['calls-per-hour'];
      cuesCeiling = settings.cues !== 'off';
      cuesAllowed = cuesCeiling && cuesWanted;
      model = cliModel || settings.model;
      deck = souff.deckPayload(lecture, { notesToCards, durationS, lang });
      marks = souff.flattenMarks(deck);
      const text = souff.systemPrefix(deck, { lang });
      const hash = souff.prefixHash(text);
      const fresh = !prefix || prefix.hash !== hash;
      prefix = { text, hash };
      // The policy is made once and kept across rebuilds. It carries what has
      // already been whispered, and a save in the middle of a talk must not
      // hand the speaker the same hint a second time.
      if (!policy) policy = souff.createPolicy({ cooldown });
      // Cards laid into slides that this build no longer has. The cockpit
      // reloads and replays what the hello hands it, so a card for a deleted
      // slide would be replayed for ever into a rail that cannot show it –
      // and the slide it locked against a second card is gone too.
      const live = new Set(deck.chunks.map(c => c.id));
      for (let i = cues.length - 1; i >= 0; i--) {
        if (!live.has(cues[i].chunkId)) {
          const [gone] = cues.splice(i, 1);
          logLine('cue-dropped', { cueId: gone.cueId, chunkId: gone.chunkId, text: gone.text });
        }
      }
      if (fresh) {
        logSession('build');
        // The prompt beside the log, so the deck the model is reading can be
        // read by a person. It is 20 to 60 KB and would be on every `tick`
        // line; one file per hash is the same text once, and a new build with
        // a changed deck writes a new one under its own name.
        const promptPath = path.join(path.dirname(absIn), `prompter-${hash}.prompt.txt`);
        try { writeOutputFile(promptPath, prefix.text, 0o600); } catch (e) { /* not fatal */ }
        const kb = Math.round(prefix.text.length / 1024);
        log(`[prompter] deck ${deck.chunks.length} slides, prompt ${kb} KB (${hash}), `
          + `model ${model}, cadence ${cadence}s, cues ${cuesAllowed ? 'on' : 'off'}`);
        log(`             the prompt as sent: ${shownPath(promptPath)}`);
        emit({
          type: 'prompter', state: disabled ? 'off' : 'ready',
          why: disabled ? disabled.why : null,
          model, session: hash, chunks: deck.chunks.length,
        });
      }
    } catch (e) {
      // A deck the prompter cannot read is a prompter that stays quiet, not a
      // watcher that dies.
      logLine('error', { why: 'onBuild: ' + ((e && e.message) || String(e)) });
    }
  }

  // ── what the cockpit says ──────────────────────────────────────────

  function setCursor(msg, elapsed, fromMove) {
    // By index, never by id. A divider's element id in the cockpit is
    // `<col-id>-section`, while deckPayload numbers it by the column's own
    // id – so the two agree on position and not on name, and position is
    // what both of them actually mean.
    let idx = cursor.idx;
    if (msg.idx != null && isFinite(Number(msg.idx))) {
      idx = Math.max(0, Math.round(Number(msg.idx)));
      // Clamped to the deck this sidecar holds. A cockpit from a build ago is
      // refused by the nonce, but a rebuild that *shortens* the deck arrives
      // here before the reload does, and an idx past the end made
      // `deck.chunks[idx]` undefined: the chunk id fell back to the sent one,
      // `cueTargets` was empty, and `driftSeconds` measured against a mark
      // list that has nothing at that index – a drift with no meaning, silently.
      const last = deck && deck.chunks.length ? deck.chunks.length - 1 : 0;
      if (idx > last) {
        logLine('warn', { why: 'slide index past the end of the deck', sent: idx, clamped: last });
        if (!warnedIdx) {
          warnedIdx = true;
          log(`[prompter] the cockpit is on slide ${idx + 1} and this deck has `
            + `${last + 1} – reading it as the last one. Reload the cockpit.`);
        }
        idx = last;
      }
    }
    const changed = idx !== cursor.idx;
    cursor.idx = idx;
    if (msg.beat != null && isFinite(Number(msg.beat))) {
      cursor.beat = Math.max(0, Math.round(Number(msg.beat)));
    }
    // How many beats the slide has in the cockpit's own DOM, which is the only
    // place that number exists – the state line says `beat 2/3` with it.
    if (msg.beats != null && isFinite(Number(msg.beats))) {
      cursor.beats = Math.max(0, Math.round(Number(msg.beats)));
    }
    cursor.chunkId = (deck && deck.chunks[idx] && deck.chunks[idx].id)
      || (msg.chunkId == null ? cursor.chunkId : pageString(msg.chunkId));
    if (elapsed != null && isFinite(Number(elapsed))) {
      const next = Math.max(0, Number(elapsed));
      // The cockpit's clock went backwards: its page reloaded, which a --watch
      // rebuild does on every save, and the timer started again at zero. Every
      // number here is stamped on the old clock, so they are all moved onto the
      // new one at once - see `rebaseClock`. The cockpit persists its origin
      // while the prompter is on, so this is the second line of defence rather
      // than the first, and it holds whatever page the sidecar is talking to.
      //
      // And the other way a clock moves: the speaker set it - a minute back or
      // forward, or to the planned start - and the cockpit says so with a
      // `clockDelta` on the move. Then the reading is taken as sent, in either
      // direction and however small, and everything moves with it; but nothing
      // is forgotten, because the talk did not start again: the count since
      // the last call stands, so a page cannot buy a call by moving its clock.
      //
      // And the first press of the talk (`clockStart`): the cockpit's clock
      // stood at 0:00 until then while this reading ran on with the wall
      // clock, so the reading sent is a new clock however small the drop -
      // tolerance 0 - and the `clock` line is written even when nothing had
      // to move, because that line is where the debrief says the talk began.
      const set = msg.clockDelta != null && isFinite(Number(msg.clockDelta)) && Number(msg.clockDelta) !== 0;
      const start = !set && msg.clockStart === true;
      const jump = souff.rebaseClock({
        prev: nowElapsed(), next, onAt: onAtElapsed, lastTickAt, transcript,
        startQuiet: souff.START_QUIET_S, set, tolerance: start ? 0 : undefined,
      });
      if (jump) {
        onAtElapsed = jump.onAt;
        lastTickAt = jump.lastTickAt;
        transcript.splice(0, transcript.length, ...jump.transcript);
        if (!set) sinceTick = { seconds: 0, words: 0, wall: Date.now() };
        if (lastTimeHint) lastTimeHint = { ...lastTimeHint, at: lastTimeHint.at + jump.delta };
        // And everything else stamped on the clock that died. The policy keeps
        // four timestamps of its own, and moving the transcript without them
        // left every cool-down answering to a clock nobody was on: a second
        // cockpit tab taking the prompter twenty-five minutes in starts near
        // 0:00, so a hint shown at 25:00 refused every `low` hint for the next
        // twenty-five minutes under `cooldown` - which reads in the log exactly
        // like the policy working. The strip's own record and the laid cards go
        // with them, because the tick message prints those times.
        if (policy) policy.rebase(jump.delta);
        for (const h of hints) h.at = (Number(h.at) || 0) + jump.delta;
        for (const c of cues) c.at = (Number(c.at) || 0) + jump.delta;
        // Two line types, because the debrief reads a `clock` line as the talk
        // beginning: what stands before the last one is the room filling. A
        // clock the speaker moved mid-talk is not that, and gets its own.
        logLine(set ? 'clock-set' : 'clock', {
          why: set ? 'the speaker set the clock'
            : start ? 'the cockpit clock started' : 'the cockpit clock restarted',
          delta: Math.round(jump.delta),
          was: Math.round(nowElapsed()), now: next,
          onAt: jump.onAt, dropped: jump.dropped,
        });
      } else if (start) {
        logLine('clock', {
          why: 'the cockpit clock started', delta: 0,
          was: Math.round(nowElapsed()), now: next, onAt: onAtElapsed, dropped: 0,
        });
      }
      cursor.elapsed = next;
      cursor.wallAt = Date.now();
    }
    if (fromMove && changed) slideChanged = true;
    return changed;
  }

  // The cards already laid, as the cockpit gets them back from a hello or a
  // preference change. `at` rides along because the cockpit's history is a
  // record of when the prompter said something, and a replayed card is not
  // said again: without it the row that survived a reload read the clock at
  // replay time, which is quietly false rather than merely repeated.
  const laidCards = () => cues.map(
    c => ({ cueId: c.cueId, chunkId: c.chunkId, text: c.text, at: c.at }));

  // A hello registers a cockpit and stamps the clock. It does **not** switch
  // the prompter on: `toggle` and `setEnabled` are the only two things that
  // do. It used to, and the cockpit then had to undo it with a separate,
  // un-awaited toggle whenever the answer said `enabled: false` – so a lost
  // reply, or a recogniser that would not start, left the sidecar listening
  // and calling a model for a cockpit whose switch was off.
  function hello(msg, reply) {
    stt = msg.stt && typeof msg.stt === 'object'
      ? { engine: pageString(msg.stt.engine || ''), local: !!msg.stt.local } : null;
    if (msg.lang) lang = pageString(msg.lang, SOUFFLEUSE_LANG_MAX) || lang;
    // The cockpit's clock is stamped here, before anything reads it. Until a
    // cockpit says hello there is no talk and no clock, and `wallAt` from the
    // moment the watcher started would otherwise make nowElapsed() count the
    // minutes the author spent writing slides as minutes of the talk – which
    // is exactly how the opening quiet came to be over before the prompter
    // was switched on.
    cursor.wallAt = Date.now();
    lastSayWall = Date.now();
    // A hello is a page that has just started: whatever stood on its strip a
    // moment ago is not on this one. The standing slot is the policy's memory
    // of "one at a time", and a hint nobody is looking at holding it would
    // drop every low hint for the rest of the talk – which is what a --watch
    // rebuild in the middle of a hint used to do.
    if (policy) policy.forgetStanding();
    logSession('hello');
    // The reason rides in the reply's own `why`, not in a field of the same
    // name in the payload: `reply` spreads the extras first so a payload
    // field can never shadow a protocol one, which means a payload `why`
    // would be overwritten by the protocol's.
    //
    // `cues` is the permission, `cueCards` the cards already laid – they are
    // two different things and the second is why they cannot share a name.
    // The cards live in the cockpit's memory alone, so a reload lost every
    // one of them while the sidecar went on holding those slides locked
    // against a second card; the reply hands them back.
    reply(true, disabled ? disabled.why : '', {
      enabled: !disabled,
      model,
      cadence,
      // So the cockpit's first toast can say where the words go without
      // saying it of a run in which they go nowhere.
      dryRun,
      // The opening quiet, so the cockpit knows how long the one minute it
      // cannot be helped in actually is, and can show what it hears until
      // then instead of leaving the speaker to guess whether the ear works.
      startQuiet: souff.START_QUIET_S,
      cues: cuesAllowed,
      cueCards: laidCards(),
      session: prefix ? prefix.hash : null,
    });
    // Only news: the sidecar cannot work at all, or it is already running and
    // this is a reconnect saying so again. A hello from a cockpit that is
    // about to switch on says nothing, because nothing has happened yet – and
    // an `idle` here would race the cockpit's own switch-on and undo it.
    if (disabled) status('off', disabled.why);
    else if (on) status('listening');
  }

  function heard(msg, reply) {
    // Capped: a final from a recogniser is a sentence or two, and a page
    // that sends a megabyte as one segment would otherwise have it in every
    // tick message for ninety seconds. The newest words are the ones kept.
    let text = String(msg.text == null ? '' : msg.text).replace(/\s+/g, ' ').trim();
    if (text.length > souff.SEGMENT_MAX_CHARS) text = text.slice(-souff.SEGMENT_MAX_CHARS);
    const t1 = isFinite(Number(msg.t1)) ? Number(msg.t1) : nowElapsed();
    const wall = Date.now();
    // The seconds a segment claims to have been spoken in are the cockpit's
    // to say, and the cadence is counted in them - so a page claiming a
    // minute of speech every second would earn a call every second. Held to
    // the wall clock since the segment before it.
    const t0raw = isFinite(Number(msg.t0)) ? Number(msg.t0) : t1;
    const t0 = freeClock ? t0raw : souff.clampSpan({
      t0: t0raw, t1, wallSeconds: (wall - lastSayWall) / 1000, slack: SOUFFLEUSE_SPAN_SLACK_S,
    });
    lastSayWall = wall;
    // The cursor first, and the segment after it: this segment is stamped on
    // the clock the message carries, so a rebase inside setCursor must not
    // move it. Everything already in the transcript is on the old clock and is
    // exactly what the rebase is for.
    setCursor(msg, t1, false);
    if (text) {
      transcript.push({ text, t0, t1 });
      if (transcript.length > SOUFFLEUSE_TRANSCRIPT_MAX) {
        transcript.splice(0, transcript.length - SOUFFLEUSE_TRANSCRIPT_MAX);
      }
      // Speech seconds, not wall seconds: silence is not an occasion, and the
      // cadence is about how much was said since the last call.
      sinceTick.seconds += Math.max(0, t1 - t0);
      sinceTick.words += souff.wordCount(text);
    }
    logLine('say', {
      text, t0, t1,
      chunkId: cursor.chunkId, idx: cursor.idx, beat: cursor.beat,
    });
    reply(true, '');
    maybeTick();
  }

  function moved(msg, reply) {
    setCursor(msg, msg.elapsed, true);
    logLine('move', {
      idx: cursor.idx, chunkId: cursor.chunkId,
      sentId: msg.chunkId == null ? null : pageString(msg.chunkId),
      beat: cursor.beat, elapsed: cursor.elapsed,
    });
    reply(true, '');
    maybeTick();
  }

  function dismissed(msg, reply) {
    const id = pageString(msg.hintId);
    const how = pageString(msg.how);
    if (policy) policy.dismissed(id);
    // The prompt shows dismissed hints with a ✕ precisely because they are
    // the ones that must not come back in other words.
    for (let i = hints.length - 1; i >= 0; i--) {
      if (hints[i].id === id) { hints[i].dismissed = true; break; }
    }
    logLine('dismiss', { hintId: id, how });
    reply(true, '');
  }

  function toggled(msg, reply) {
    setEnabled(!!msg.on, 'the cockpit');
    reply(true, disabled ? disabled.why : '', { enabled: !disabled, on });
  }

  // The one preference the sidecar has to know about, because it changes what
  // the model is asked rather than what the cockpit does with the answer. Its
  // own message rather than a field of `souffleuse-toggle`: the checkbox is
  // changed in the middle of a talk with the switch untouched, and a switch
  // message that also carried a preference would mean two things at once. The
  // reply hands the laid cards back, so ticking the box again restores what
  // unticking it cleared.
  function prefs(msg, reply) {
    if (msg.cues != null) {
      cuesWanted = !!msg.cues;
      const want = cuesCeiling && cuesWanted;
      if (want !== cuesAllowed) {
        cuesAllowed = want;
        logLine('prefs', { cues: cuesAllowed, ceiling: cuesCeiling });
      }
    }
    reply(true, '', {
      cues: cuesAllowed,
      cueCards: laidCards(),
    });
  }

  function setEnabled(want, who = 'the driver') {
    if (want && !on) {
      // A sidecar that cannot work does not come on because somebody pressed
      // the switch. It used to: `on` was set whatever `disabled` said, so the
      // reply to a toggle after a refused key read `{on: true, enabled:
      // false}` – a switch reporting itself thrown on a prompter that will
      // never call anybody – and every `say` after it ran a tick scheduler
      // whose calls `maybeTick` then dropped on the floor.
      if (disabled) { status('off', disabled.why); return; }
      on = true;
      // The opening quiet is measured from the press, not from the start of
      // the talk: switching the prompter on in the middle still buys the
      // speaker a minute to find the room.
      onAtElapsed = nowElapsed();
      sinceTick = { seconds: 0, words: 0, wall: Date.now() };
      status('listening');
    } else if (!want && on) {
      on = false;
      pendingReason = null;
      if (inflight) { try { inflight.abort(); } catch (e) { /* already gone */ } }
      status('idle', 'switched off by ' + who);
    }
  }

  function onMessage(msg, reply, sock) {
    try {
      switch (msg.type) {
        case 'souffleuse-hello': return hello(msg, reply);
        case 'souffleuse-say': return heard(msg, reply);
        case 'souffleuse-move': return moved(msg, reply);
        case 'souffleuse-dismiss': return dismissed(msg, reply);
        case 'souffleuse-toggle': return toggled(msg, reply);
        case 'souffleuse-prefs': return prefs(msg, reply);
        default: return reply(false, `the prompter has no message "${msg.type}"`);
      }
    } catch (e) {
      // The one place a defect in here could have reached the watcher.
      logLine('error', { why: 'handler: ' + ((e && e.message) || String(e)) });
      try { reply(false, redact('the prompter could not handle that: ' + ((e && e.message) || ''))); }
      catch (e2) { /* the socket went away mid-answer */ }
    }
  }

  // ── the tick ───────────────────────────────────────────────────────

  // The hour's budget, checked before every call. Spent, it says so once –
  // on the badge, in the log and on the terminal – and the prompter stays
  // quiet until the oldest call of the hour has aged out. A hard ceiling on
  // what one run can cost, whatever the cadence or the page asks for.
  function budgetLeft() {
    const hourAgo = Date.now() - 3600 * 1000;
    while (callTimes.length && callTimes[0] <= hourAgo) callTimes.shift();
    if (callTimes.length < callsPerHour) {
      budgetSpent = false;
      return true;
    }
    if (!budgetSpent) {
      budgetSpent = true;
      const back = Math.max(1, Math.ceil((callTimes[0] + 3600 * 1000 - Date.now()) / 60000));
      logLine('warn', { why: 'calls-per-hour spent', budget: callsPerHour });
      status('error', `${callsPerHour} calls in the last hour, the budget in prompter: {calls-per-hour} – quiet for about ${back} min`);
    }
    return false;
  }

  function maybeTick() {
    if (!on || disabled || !prefix || !policy) return;
    if (Date.now() < backoffUntil) return;
    if (!budgetLeft()) return;
    const d = souff.shouldTick({
      now: nowElapsed(),
      lastTickAt, lastTickReason, ticked,
      speechSecondsSince: sinceTick.seconds,
      newWordsSince: sinceTick.words,
      cadence, slideChanged, inflight: !!inflight,
      // The sidecar's own seconds since the count started. The cockpit's clock
      // is the page's to set, and on it alone a page with the nonce earned a
      // call per message. Only the test that moves that clock by hand
      // turns it off, with the switch `clampSpan` answers to.
      wallSince: freeClock ? null : (Date.now() - sinceTick.wall) / 1000,
      slack: SOUFFLEUSE_SPAN_SLACK_S,
    });
    if (!d.tick) {
      // An occasion that arrived while a call was out is not lost, it is
      // remembered and fired the moment the answer lands. `coalesce` is the
      // field that says a *new* occasion arrived; `reason` under inflight
      // falls back to the reason of the call already out, and is therefore
      // always set. Reading it here made every say and every move schedule a
      // follow-up call, which finish() fired at once, which was itself in
      // flight when the next segment arrived - a call every few seconds for
      // the whole talk. Invisible against a fast endpoint, which is why the
      // fakes never showed it: it needs a reply slower than the gap between
      // two sentences. Measured at 10 calls in 40 s where two were due.
      if (inflight && d.coalesce) pendingReason = d.reason;
      return;
    }
    tick(d.reason);
  }

  function tick(reason) {
    callTimes.push(Date.now());
    const elapsed = nowElapsed();
    const idx = cursor.idx;
    const chunkCount = deck.chunks.length;
    const drift = souff.driftSeconds({
      elapsed, marks, idx, beat: cursor.beat, durationS, chunkCount,
    });
    const allowed = drift ? souff.timeHintAllowed({
      drift: drift.drift, rough: drift.rough, beforeFirst: drift.beforeFirst,
      lastTimeHint, elapsed,
    }) : false;
    const targets = cuesAllowed ? souff.cueTargets(deck, idx) : [];
    const session = {
      deck, idx, chunkId: cursor.chunkId, beat: cursor.beat, beats: cursor.beats,
      chunkCount, elapsed,
      // The language the room is being spoken to in, which the filler count
      // needs: "um" is a hesitation in English and a preposition in German.
      // The deck carries it too, and a hello may have corrected it.
      lang,
      drift: drift ? drift.drift : null,
      rough: drift ? drift.rough : false,
      // The state line says so where the number is: a drift measured against
      // a mark the talk has not reached is the distance to a clock nobody has
      // arrived at, and a bare "-685s ahead" reads as a fact about the talk.
      beforeFirst: drift ? !!drift.beforeFirst : false,
      timeHintAllowed: allowed,
      cueTargets: targets,
      hints, transcript, lastTickAt,
      windowSeconds: SOUFFLEUSE_WINDOW_S,
      windowWords: SOUFFLEUSE_WINDOW_WORDS,
    };
    const message = souff.tickMessage(session);
    lastTickAt = elapsed;
    ticked = true;
    lastTickReason = reason;
    sinceTick = { seconds: 0, words: 0, wall: Date.now() };
    slideChanged = false;
    pendingReason = null;
    // The user message, never the prefix: the prefix is the same 20 to 60 KB
    // on every line of the log, and it is already in the build.
    logLine('tick', {
      reason, idx, chunkId: cursor.chunkId, beat: cursor.beat, elapsed,
      drift: session.drift, rough: session.rough, beforeFirst: session.beforeFirst,
      timeHintAllowed: allowed, cueTargets: targets, message,
    });
    // Deliberately not awaited – the tick is fired from a socket handler and
    // the answer arrives whenever it arrives. The catch is the last net: ask
    // handles its own failures, and anything that got past them is a defect
    // here, which must still not reach the watcher as a rejection.
    ask(message, session).catch((e) => {
      logLine('error', { why: 'tick: ' + ((e && e.message) || String(e)) });
    });
  }

  // What an OpenAI-compatible endpoint says went wrong, as one clause. The
  // shape is `{error: {message, code}}` on both OpenRouter and OpenAI, and
  // both halves are worth having: the message says what, the code says whose.
  function apiErrorText(body) {
    const e = body && typeof body === 'object' ? body.error : null;
    if (!e || typeof e !== 'object') return '';
    const msg = String(e.message == null ? '' : e.message).replace(/\s+/g, ' ').trim();
    const code = e.code == null ? '' : String(e.code).trim();
    if (!msg) return code ? 'error code ' + code : '';
    return code ? `${msg} (code ${code})` : msg;
  }

  // Said once per run, and only the first time, because it answers the two
  // questions a rehearsal is read for and both are decided by then: how long
  // the whisper took to arrive, and whether the deck is being paid for again
  // every cadence. The log has both on every answer; the terminal needs them
  // once, while somebody is still watching it.
  let saidFirstAnswer = false;
  function firstAnswer(json, durationMs) {
    if (saidFirstAnswer) return;
    saidFirstAnswer = true;
    const u = (json && json.usage) || null;
    const cached = u && u.prompt_tokens_details ? u.prompt_tokens_details.cached_tokens : null;
    const cache = (cached != null && u && u.prompt_tokens != null)
      ? `${cached} of ${u.prompt_tokens} prompt tokens cached`
      : 'no cache figures in the reply';
    log(`[prompter] first answer in ${(durationMs / 1000).toFixed(1)} s · ${cache}`);
  }

  async function ask(message, session) {
    // A dry run does everything except spend money and say anything to a
    // third party: the ear, the socket, the ticks, the log and the policy all
    // run, and this one call is skipped. It is the rehearsal tool - and the
    // only way to read a `tick` message, with its state line and its window,
    // without a key.
    if (dryRun) {
      // Including the two statuses around it. The heartbeat under the strip
      // counts `thinking` - it is the one moment the cockpit can see that the
      // whole chain is alive - so a dry run that only ever said `listening`
      // showed the word `listening` for a whole talk and never `asked 18s ago ·
      // 4 so far`, in the mode whose entire job is answering "is this wired
      // up". Both states are quiet on the terminal.
      status('thinking');
      logLine('answer', { dryRun: true, durationMs: 0 });
      if (on && !disabled) status('listening');
      return finish();
    }
    const ctrl = new AbortController();
    inflight = ctrl;
    status('thinking');
    const started = Date.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { ctrl.abort(); } catch (e) { /* gone */ }
    }, SOUFFLEUSE_TIMEOUT_MS);
    let res = null;
    let json = null;
    let failed = null;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'X-Title': SOUFFLEUSE_TITLE,
          'HTTP-Referer': SOUFFLEUSE_REFERER,
        },
        body: JSON.stringify({
          model,
          // Twelve words need a handful of tokens; the rest of this ceiling is the
      // `why` that goes to the log, and the first rehearsal hit it: a truncated
      // tool call came back as unparseable JSON and was read as the model
      // talking nonsense. Output is billed by what is generated, not by the
      // ceiling, so headroom here costs nothing and buys the debrief.
      max_tokens: 320,
          temperature: 0.2,
          // OpenRouter's unified parameter: think a little, and do not send
          // the thinking back. Latency is the scarce resource here.
          reasoning: { effort: 'low', exclude: true },
          messages: [
            // The deck, as one content block with a cache breakpoint on it.
            // Byte-stable per build, which is what makes it worth caching.
            {
              role: 'system',
              content: [{
                type: 'text',
                text: prefix.text,
                cache_control: { type: 'ephemeral' },
              }],
            },
            { role: 'user', content: message },
          ],
          tools: [souff.TOOL_SCHEMA],
          // The answer's vocabulary is the tool schema, so the call is forced
          // and there is exactly one of it.
          tool_choice: { type: 'function', function: { name: 'advise' } },
          parallel_tool_calls: false,
          // Sticky routing: the provider holding the warm cache for this
          // prefix. A rebuild changes the hash and starts a new one.
          session_id: prefix.hash,
          usage: { include: true },
        }),
      });
      const text = await res.text();
      try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    } catch (e) {
      failed = e;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    const durationMs = Date.now() - started;

    if (failed) {
      if (failed.name === 'AbortError' && !timedOut) {
        // Switched off, or the watcher going away, while the call was out.
        logLine('error', { why: 'aborted', durationMs });
      } else if (failed.name === 'AbortError') {
        // Too late for the sentence it was about. Not a network failure, and
        // no backoff: the answer simply missed its moment. It does count
        // towards giving up, though - an endpoint that never answers in time
        // is paid for on every call and helps with none of them.
        errorStreak += 1;
        logLine('error', { why: 'timeout', durationMs, streak: errorStreak });
        if (errorStreak >= SOUFFLEUSE_MAX_ERRORS) {
          disable(`${SOUFFLEUSE_MAX_ERRORS} failed or timed-out calls in a row – last: no answer within ${SOUFFLEUSE_TIMEOUT_MS / 1000}s`);
        } else if (on && !disabled) status('listening');
      } else {
        trouble('network: ' + ((failed && failed.message) || String(failed)), durationMs);
      }
      return finish();
    }
    if (res.status === 401 || res.status === 403) {
      // A refused key is refused on every retry, so there are none.
      logLine('error', { why: 'auth', status: res.status, body: json, durationMs });
      // What the speaker can do about it, in the sentence they will read on
      // the badge: the key is read once, at start, from the environment of the
      // watcher – so there is nothing to press here and nothing to wait for.
      const said = apiErrorText(json);
      disable(`OpenRouter refused the key (HTTP ${res.status}`
        + `${said ? ' – ' + said : ''}) – restart the watcher with a corrected key`);
      return finish();
    }
    if (!res.ok) {
      // The body's own message, not only the number. A mistyped model id is a
      // 400 whose `error.message` says exactly that, and "HTTP 400" on a badge
      // sends the author looking at their network.
      const said = apiErrorText(json);
      trouble('HTTP ' + res.status + (said ? ' – ' + said : ''), durationMs, json);
      return finish();
    }
    // A 200 can still be a refusal: OpenRouter answers some upstream failures
    // with `{error: {message, code}}` and no `choices` at all. That used to
    // reach `parseAnswer`, which found no tool call and no content, and was
    // logged as `garbage` – so a model out of credits or an unknown id read in
    // the debrief as the model talking nonsense, five times in a row, and the
    // one sentence saying what was actually wrong was thrown away.
    if (json && typeof json === 'object' && json.error
        && !(Array.isArray(json.choices) && json.choices.length)) {
      trouble('the model answered with an error – ' + (apiErrorText(json) || 'no message'),
        durationMs, json);
      return finish();
    }
    errorStreak = 0;
    backoffUntil = 0;
    logLine('answer', {
      body: json,
      usage: (json && json.usage) || null,
      durationMs,
    });
    firstAnswer(json, durationMs);
    judge(souff.parseAnswer(json, session), session);
    return finish();
  }

  // An occasion that was coalesced while the call was out. Fired here rather
  // than on a timer, because "right after the answer" is exactly when the
  // prompter is free again.
  function finish() {
    if (!on || disabled) return;
    if (!pendingReason) return;
    const reason = pendingReason;
    pendingReason = null;
    if (Date.now() < backoffUntil) return;
    if (!budgetLeft()) return;
    tick(reason);
  }

  function trouble(why, durationMs, body = null) {
    errorStreak += 1;
    logLine('error', { why, durationMs, body, streak: errorStreak });
    if (errorStreak >= SOUFFLEUSE_MAX_ERRORS) {
      disable(`${SOUFFLEUSE_MAX_ERRORS} failed or timed-out calls in a row – last: ${why}`);
      return;
    }
    const wait = SOUFFLEUSE_BACKOFF_MS[Math.min(errorStreak - 1, SOUFFLEUSE_BACKOFF_MS.length - 1)];
    backoffUntil = Date.now() + wait;
    status('error', `${why}; trying again in ${Math.round(wait / 1000)}s`);
  }

  // A refusal the model meant something by, on the terminal. The log has every
  // one of them, but the log is read after the talk – and while it is running,
  // "the prompter has said nothing for ten minutes" and "the prompter has
  // wanted to say six things and the policy took all six" look identical from
  // the outside. A plain `nothing` is not one of these: that is the answer the
  // whole design expects, and a line per tick would bury the build log.
  // `too-long` and `bad-cue` come out of `parseAnswer` as a `nothing` already,
  // so the test is not the action alone: an answer that carries words is one
  // the model meant, whoever refused it.
  function heldBack(reason, answer) {
    const action = (answer && answer.action) || '';
    const what = String((answer && answer.text) || '').trim();
    if (action !== 'hint' && action !== 'cue' && !what) return;
    log(`[prompter] held back (${reason}): "${what}"`);
  }

  function judge(answer, session) {
    const now = nowElapsed();
    const verdict = policy.judge(answer, {
      now,
      elapsedSinceOn: now - onAtElapsed,
      chunkId: session.chunkId,
      cueTargets: session.cueTargets,
      timeHintAllowed: session.timeHintAllowed,
    });
    if (!verdict.show) {
      const reason = verdict.reason || 'nothing';
      // Only nonsense counts towards the garbage streak. A policy that
      // swallows a well-formed hint is the policy working. `truncated` is
      // counted too, but it says so in its own words: the answer ran into
      // this tool's max_tokens, which is a number here and not the model's
      // fault, and a run of them means the ceiling is wrong.
      if (reason === 'garbage' || reason === 'too-long' || reason === 'bad-cue'
          || reason === 'truncated') garbageStreak += 1;
      else garbageStreak = 0;
      logLine('suppressed', {
        reason,
        action: answer.action || null,
        kind: answer.kind || null,
        text: answer.text || null,
        chunkId: answer.chunk_id || null,
        why: answer.why == null ? null : answer.why,
      });
      heldBack(reason, answer);
      if (garbageStreak >= SOUFFLEUSE_MAX_GARBAGE) {
        status('error', reason === 'truncated'
          ? `${SOUFFLEUSE_MAX_GARBAGE} answers in a row cut off by max_tokens`
          : `${SOUFFLEUSE_MAX_GARBAGE} unusable answers in a row from ${model}`);
      } else {
        status('listening');
      }
      return;
    }
    garbageStreak = 0;
    const at = now;
    // Sent first, recorded second, and nothing is recorded if the send
    // failed. `policy.shown` is what takes the standing slot, starts the
    // cool-downs and locks a slide against a second card – so recording a
    // whisper that never reached a screen (the socket closing, a cockpit
    // between two reloads) made the policy refuse everything after it for a
    // hint the speaker never saw.
    const gone = (reason, extra) => {
      logLine('suppressed', {
        reason,
        action: answer.action || null,
        kind: answer.kind || null,
        text: answer.text || null,
        why: answer.why == null ? null : answer.why,
        ...extra,
      });
      heldBack(reason, answer);
      status('listening');
    };
    if (answer.action === 'cue') {
      // The deck may have been rebuilt while this call was out: `cueTargets`
      // was computed against the deck of the tick, and `onBuild` only sweeps
      // the cards that were already laid. A card for a slide this build no
      // longer has would be filed, replayed into every reloaded cockpit under
      // a dead id and locked against a second - until the next build dropped
      // it with a `cue-dropped` line nobody was waiting for.
      if (!deck || !deck.chunks.some(c => c.id === answer.chunk_id)) {
        return gone('stale-deck', { chunkId: answer.chunk_id || null });
      }
      const cueId = 'cue' + (++cueSeq);
      if (!sendToCockpit({
        // `at` is the cockpit's own clock, carried forward here, and it is the
        // same field a replayed card comes back with – so the history has one
        // rule for when a card was laid rather than two.
        type: 'souffleuse-cue', cueId, chunkId: answer.chunk_id, text: answer.text, at,
      })) return gone('no-cockpit', { cueId });
      policy.shown({ id: cueId, action: 'cue', text: answer.text, chunk_id: answer.chunk_id, at });
      cues.push({ cueId, chunkId: answer.chunk_id, text: answer.text, at });
      logLine('cue', {
        cueId, chunkId: answer.chunk_id, text: answer.text,
        why: answer.why == null ? null : answer.why, at,
      });
      log(`[prompter] cue → #${answer.chunk_id}: ${answer.text}`);
      emit({ type: 'prompter', state: 'cue', chunkId: answer.chunk_id });
    } else {
      const hintId = 'hint' + (++hintSeq);
      if (!sendToCockpit({
        type: 'souffleuse-hint', hintId, kind: answer.kind,
        text: answer.text, severity: answer.severity, at,
      })) return gone('no-cockpit', { hintId });
      policy.shown({
        id: hintId, action: 'hint', kind: answer.kind, text: answer.text,
        chunkId: session.chunkId, at,
      });
      hints.push({
        id: hintId, kind: answer.kind, text: answer.text,
        severity: answer.severity, at, dismissed: false,
      });
      if (answer.kind === 'time') {
        lastTimeHint = { at, drift: session.drift == null ? 0 : session.drift };
      }
      logLine('hint', {
        hintId, kind: answer.kind, text: answer.text, severity: answer.severity,
        chunkId: session.chunkId, why: answer.why == null ? null : answer.why, at,
      });
      log(`[prompter] ${answer.kind}: ${answer.text}`);
      emit({
        type: 'prompter', state: 'hint',
        kind: answer.kind, severity: answer.severity,
      });
    }
    status('listening');
  }

  // The same door a socket `say` comes through, for a producer that lives
  // inside Node – whisper.cpp on PATH, the way cwebp is. Nothing calls it in
  // v1, and the shape it takes is the reason the protocol does not have to
  // change when something does.
  function say(segment) {
    heard({ ...(segment || {}), type: 'souffleuse-say' }, () => {});
  }

  function close() {
    if (inflight) { try { inflight.abort(); } catch (e) { /* already gone */ } }
    inflight = null;
    pendingReason = null;
  }

  // The run's last line, on a clean stop (Ctrl-C or a SIGTERM): a log that
  // ends without it is one whose process died, which the debrief says. Only
  // into a log that exists – a run that never wrote one has nothing to close.
  function end(how) {
    if (!fs.existsSync(logPath)) return;
    logLine('end', { how: String(how || ''), elapsed: nowElapsed() });
  }

  // Said once, at the start, because it is the one thing about this flag a
  // person has to know before they use it. docs/history/PLAN-souffleuse.md § Privacy.
  //
  // The audio half is the browser's, not this process's, and it is not
  // nothing: Chrome's speech recognition runs on the device only where it
  // has a model for the language, and otherwise sends the audio to Google –
  // in a dry run as much as in a live one. The cockpit says which it got.
  if (noKeyWhy) {
    log(`[prompter] ${noKeyWhy}, so this is a dry run – for hints, `
      + (found.problem ? 'fix that' : `put the key in ${found.file || prompterKeyFile()} (chmod 600)`)
      + ' and start again.');
  } else if (!dryRun) {
    log(`[prompter] the key: ${found.from}`);
  }
  if (dryRun) {
    log('[prompter] dry run: the ear, the ticks, the policy and the log all run; nothing goes to a model.');
    log('             Chrome\'s speech recognition sends the audio to Google unless it runs on this');
    log('             device – the cockpit says which.');
  } else {
    log('[prompter] the live prompter is on. What it sends, as text: the deck including');
    log('             speaker notes, and what the cockpit hears, to ' + base + '.');
    log('             The prompter sends no audio; Chrome\'s speech recognition sends the audio');
    log('             to Google unless it runs on this device – the cockpit says which. Nothing');
    log('             goes to the projection or into source.md, and the key never into the HTML.');
    log('             The microphone hears the room too – switch it off before a question round,');
    log('             or tell the room.');
  }
  // An endpoint that is not https carries the deck, the transcript and the
  // key in the clear, unless it is on this machine (the spec's fake is).
  if (!dryRun) {
    let u = null;
    try { u = new URL(base); } catch (e) { /* said below */ }
    const loopback = u && /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(u.hostname);
    if (!u) log(`[prompter] OPENROUTER_BASE_URL is not an address (${base}) – every call will fail.`);
    else if (u.protocol !== 'https:' && !loopback) {
      log(`[prompter] warning: OPENROUTER_BASE_URL is ${u.protocol}//${u.host}, not https – the deck,`);
      log('             what the room says and the key would cross the network unencrypted.');
    }
  }
  // The full path, not the basename, and a sentence about it: the log holds
  // the words the room said, and it is written beside source.md wherever that
  // is. That is where it is worth having – the debrief belongs with the deck
  // it is about – but this engine's .gitignore only covers this repository,
  // and a lecture being written in a content repo of its own is one `git add
  // -A` away from committing a transcript of a rehearsal.
  log('[prompter] the debrief of this run, with the spoken words verbatim: ' + shownPath(logPath));
  log('             In a content repository of your own, gitignore prompter-*.jsonl and');
  log('             prompter-*.prompt.txt (the system prompt of each build) before the first rehearsal.');

  // Where this run's two files are, for the line Ctrl-C prints: the log once
  // it exists, and the prompt of the last build.
  function files() {
    let log = null;
    try { if (fs.statSync(logPath).isFile()) log = logPath; } catch (e) { /* none written */ }
    const prompt = prefix ? path.join(path.dirname(absIn), `prompter-${prefix.hash}.prompt.txt`) : null;
    return { log, prompt: prompt && fs.existsSync(prompt) ? prompt : null };
  }

  return { onBuild, onMessage, say, setEnabled, close, end, logPath, files, dryRun };
}

// ── CLI ──────────────────────────────────────────────────────────────

// ── --events: NDJSON on stdout, commands on stdin ────────────────────
//
// For a tool that drives the build rather than reads it – the desktop
// builder is the first. The alternative was to have that tool parse the
// human log, which would have made a rewording of `[rebuild] …` a breaking
// change and put a rule about it in CLAUDE.md; a flag of a few dozen lines
// is cheaper than that rule.
//
// The human log is untouched: these are additional lines, and a tool tells
// them apart by the leading `{"type":` – no log line of this build starts
// that way. Without the flag `emitEvent` writes nothing and stdin is never
// touched, so nothing about the ordinary command changes, not even whether
// the process can exit.
//
// A channel of its own (Node IPC, a MessagePort) was the other option and
// was dropped: build.js is plain Node started as plain Node, and a driver
// should not have to start it any particular way to read its state.
//
// `prompter` is the newest type – emitted only under --prompter, one per
// transition of the live prompter, carrying `state` and whatever that state
// needs (`kind` on a hint, `why` on an error). The desktop app never passes
// that flag, and its reducer returns the state unchanged for a type it does
// not know (`desktop/main/builder.js`, the `default` arm), so an engine that
// emits it stays compatible with an app that has never heard of it.
let eventsEnabled = false;
// When the one-shot build started, so the top-level catch can time a failure
// it did not start. --watch does its own timing inside `rebuild`.
let oneShotStart = 0;

function emitEvent(obj) {
  if (!eventsEnabled) return;
  const write = rawStdoutWrite || ((t) => process.stdout.write(t));
  // A log line written without its newline would otherwise swallow the
  // event's opening brace into itself.
  if (!stdoutAtLineStart) write('\n');
  write(JSON.stringify(obj) + '\n');
  stdoutAtLineStart = true;
}

// ── what the build prints ────────────────────────────────────────────
//
// The log quotes the source: a heading in an error, a file or folder name in
// a note, a path in every `Wrote` line. Two readers take that text for
// something other than text. A terminal obeys an escape sequence in it -
// `## bogus: A ESC]0;PWNED BEL` retitled the terminal, and OSC 52 writes the
// clipboard - and an --events driver takes a line that starts with
// `{"type":` for an event: a lecture folder whose name held a newline and a
// `serving` event made the desktop app open a foreign address. So every
// human line goes out through one guard, installed first thing in main():
// control characters except a newline and a tab, and the bidi overrides,
// become spaces (terminalSafe's rule), and under --events a human line that
// starts with a brace is indented by one space, so that only emitEvent,
// which writes past the guard, can start one.
let rawStdoutWrite = null;
let stdoutAtLineStart = true;

function consoleSafe(text) {
  return String(text).replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu,
    (c) => (c === '\n' || c === '\t' ? c : ' '));
}

function guardConsole() {
  if (rawStdoutWrite) return;
  const asText = (chunk) => (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
  const callback = (rest) => rest.find((a) => typeof a === 'function');
  const out = process.stdout;
  const err = process.stderr;
  rawStdoutWrite = out.write.bind(out);
  const rawErr = err.write.bind(err);
  out.write = (chunk, ...rest) => {
    let text = consoleSafe(asText(chunk));
    if (eventsEnabled) {
      if (stdoutAtLineStart && text.startsWith('{')) text = ' ' + text;
      text = text.replace(/\n\{/g, '\n {');
    }
    if (text.length) stdoutAtLineStart = text.endsWith('\n');
    return rawStdoutWrite(text, 'utf8', callback(rest));
  };
  err.write = (chunk, ...rest) => rawErr(consoleSafe(asText(chunk)), 'utf8', callback(rest));
}

// The files build.js reads beside itself at run time, one entry per path
// constant – the URL on import.meta.url each getter reads from – so this is
// a list of the constants rather than a second list of names, and the
// `engine-files` gate holds it equal to every such read in this file, in
// both directions. assertEngineComplete checks them at the head of buildOnce,
// before the stylesheet check reads the first of them: a file missing from a
// broken install, a partial copy of the engine or a staging list that missed
// one used to surface as an ENOENT stack out of whichever renderer read it
// first (or out of that check), and the one useful line was buried in it.
//
// Every file, every build, whichever view or flag reads it – the prompter's
// script included, which only a --prompter build reads. The rule is one
// sentence, the one desktop/scripts/stage-engine.mjs's test holds the staged
// copy to (every run-time read is there); no engine this repository ships
// lacks one of them (the release tarball and the app's staged copy carry them
// all); and which files a build will read is known only after the parse for
// most of the others too (the reader scripts by frontmatter, pulse-embed.js by
// a ::: pulse, editor.mjs by a figure, the banner by --watch), so a narrower
// check would either move behind the parse or check some files and not
// others. An install that lacks one is incomplete, and is told so by its
// first build rather than by the first deck that happens to need the file.
// Existence and permission only – nothing is read here, so the getters'
// memos and what a build without --prompter reads are as they were.
//
// diagram-core.mjs and commands.mjs are imported as well as read, so when one
// of those is missing Node refuses the import before this runs; they are
// listed because the rule is every run-time read.
const ENGINE_FILES = [
  DIAGRAM_CORE_PATH, CUE_CARDS_PATH, COMMANDS_PATH, PULSE_EMBED_PATH, EDITOR_JS_PATH, EDITOR_CSS_PATH,
  DIAGRAM_CSS_PATH, DIAGRAM_JS_PATH, WATCH_BANNER_CSS_PATH, WATCH_BANNER_JS_PATH,
  PRINT_CSS_PATH, PULSE_PRINT_CSS_PATH, PRINT_JS_PATH, PRINT_READER_JS_PATH, PRINT_VIEW_JS_PATH, PRINT_HIGHLIGHTS_JS_PATH,
  AUDIENCE_CSS_PATH, AUDIENCE_JS_PATH, SPEAKER_CSS_PATH, SPEAKER_JS_PATH, SOUFFLEUSE_CSS_PATH, SOUFFLEUSE_JS_PATH,
];
// userFacing, although a missing engine file is no mistake of the author's:
// the flag is for errors whose message is the whole of what the person
// running the build needs, and this is one. Nothing in build.js is wrong –
// the stack would point into a renderer that read a path correctly – and what
// has to happen happens outside it: reinstall, or put the file back. A defect
// in build.js itself (a placeholder without a value, an unbalanced comment in
// a sheet) keeps its stack.
function assertEngineComplete() {
  const unreadable = ENGINE_FILES.filter((url) => {
    try { fs.accessSync(url, fs.constants.R_OK); return !fs.statSync(url).isFile(); } catch { return true; }
  });
  if (!unreadable.length) return;
  const engineDir = path.dirname(fileURLToPath(import.meta.url));
  const names = unreadable.map((url) => path.relative(engineDir, fileURLToPath(url)).split(path.sep).join('/'));
  const err = new Error(
    `The psi-slides installation in ${engineDir} is incomplete: ${names.join(', ')} ` +
    `${names.length === 1 ? 'is' : 'are'} missing or unreadable – reinstall psi-slides, or restore ` +
    `${names.length === 1 ? 'the file' : 'the files'} from the release it came from.`);
  err.userFacing = true;
  throw err;
}

// Self-check on the inlined stylesheets. Every one of them lived inside a
// template literal in this file, where two edit mistakes are silent and
// costly: an unterminated /* comment swallows the rules that follow it, and a
// stray backtick inside a comment ends the literal (that one at least throws
// at parse time). The sheets are files now (runtime/, editor.css), and the
// first mistake is as silent in a file. An unbalanced comment does not throw
// – it just deletes styling from every output, which is how a whole
// collapse-mode rule once shipped broken. Cheap to check, so check it on
// every build.
function assertStylesheetsWellFormed() {
  // Every sheet here is a file, and an unterminated comment in a file
  // silently drops every rule to the next one as it did in a constant.
  // runtime/diagram.css (DIAGRAM_CSS until it left this file) ships into all
  // four views and was the one inlined stylesheet this guard did not cover –
  // the exact gap the guard exists to close. It is checked filled, as it
  // ships.
  const sheets = { 'runtime/audience.css': audienceCss(), 'runtime/speaker.css': speakerCss(), 'runtime/souffleuse.css': souffleuseSheet(), 'runtime/print.css': printCss(), 'runtime/pulse-print.css': pulsePrintCss(), 'runtime/diagram.css': diagramCss(), 'editor.css': editorCss() };
  for (const [name, css] of Object.entries(sheets)) {
    if (typeof css !== 'string') continue;
    const opens = (css.match(/\/\*/g) || []).length;
    const closes = (css.match(/\*\//g) || []).length;
    if (opens !== closes) {
      throw new Error(
        `${name} has ${opens} "/*" but ${closes} "*/" – an unbalanced CSS comment ` +
        `silently drops every rule until the next "*/". Fix ${name} before shipping.`
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
  assertEngineComplete();
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
  UNRESOLVED_ASSETS.clear();
  OUTSIDE_ASSETS.clear();
  warnExposedOnce(outDir);
  lastKatexSheet = null;
  // Auto-inline decision when neither --inline-images nor --no-inline-images
  // was passed: scan referenced images, inline iff total fits AUTO_INLINE_BUDGET.
  // Either way log the decision so authors notice when a deck silently flips
  // from inlined back to external (e.g. after adding a heavy asset).
  let inlineImages = opts.inlineImages;
  // Every build plans its clips' names under videos/, whatever the flags:
  // the plan needs the whole list, and a name has to be the same under
  // --audience-only as under a full build.
  let scan = scanReferencedImages(src, outDir);
  clipsOverBudget.clear();
  planClipStageNames(scan.clipList.map(c => c.abs));
  if (inlineImages === undefined) {
    const { total, count, clips, clipList } = scan;
    const budgetMb = AUTO_INLINE_BUDGET / 1024 / 1024;
    // What the images leave of the budget is what the clips may take, in the
    // order the deck names them; a clip that does not fit plays from videos/.
    // They used to be inlined each up to their own 12 MB cap with no total at
    // all, so three 8 MB clips wrote about 32 MB into every view.
    const fitClips = (room) => {
      let inl = 0, bytes = 0, staged = 0;
      for (const c of clipList) {
        if (c.size > MAX_INLINE_VIDEO_BYTES) continue;  // staged by the cap, and said so
        if (c.size <= room) { room -= c.size; bytes += c.size; inl += 1; }
        else { clipsOverBudget.add(c.abs); staged += 1; }
      }
      return { inl, bytes, staged };
    };
    const clipNote = (f) => `${f.inl} clip(s) inlined, ${(f.bytes / 1024 / 1024).toFixed(2)} MB`
      + (f.staged ? `, ${f.staged} past the budget play from ${VIDEO_STAGE_DIR}/ (--inline-images inlines each up to the ${MAX_INLINE_VIDEO_BYTES / 1024 / 1024} MB clip cap)` : '');
    if (count === 0) {
      // Nothing to weigh but the clips. A deck of clips alone inlines what
      // fits the budget, and the rest plays from videos/.
      inlineImages = clips > 0;
      if (clips) {
        console.log(`[inline-images] no images, ${clips} clip(s) under a ${budgetMb} MB auto-inline budget: ${clipNote(fitClips(AUTO_INLINE_BUDGET))}. Use --no-inline-images to disable.`);
      }
    } else if (total <= AUTO_INLINE_BUDGET) {
      inlineImages = true;
      const mb = (total / 1024 / 1024).toFixed(2);
      const f = clips ? fitClips(AUTO_INLINE_BUDGET - total) : null;
      console.log(`[inline-images] auto-inlining ${count} image(s), ${mb} MB total (under ${budgetMb} MB budget)${f ? '; ' + clipNote(f) : ''}. Use --no-inline-images to disable.`);
    } else {
      inlineImages = false;
      const mb = (total / 1024 / 1024).toFixed(2);
      console.log(`[inline-images] ${count} image(s) total ${mb} MB exceed ${budgetMb} MB auto-inline budget; using external paths. Use --inline-images to force.`);
    }
  }
  inlineAssetsEnabled = !!inlineImages;
  // Pre-flight, before any rendering: fail without leaving a half-broken
  // artefact on disk. Only matters when inlining is on – with external paths
  // the size cap is irrelevant and nothing is being promised.
  if (inlineAssetsEnabled) {
    // Oversized *images* still fail: there is no good answer for them, only
    // a broken figure later. Oversized clips do have one – staging into
    // videos/ – so they are handled rather than refused.
    assertInlinable(scan.oversized.filter(o => !isVideoExt(o.abs)), outDir);
  }
  // Reset before parsing, not after: renderEmbedOpen fills this from inside
  // parseLecture, so a reset further down wiped the very thing it collects.
  embedsThisBuild = [];
  const lecture = parseLecture(src);
  assertDistinctIds(lecture, src);
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
  const styleOpts = styleSettings(lecture.frontmatter);
  // kind: a document builds print.html alone. A --*-only flag naming a
  // view it does not have is refused rather than answered with nothing,
  // and before anything is written.
  const docMode = isDocumentKind(lecture.frontmatter);
  if (docMode && only && only !== '--print-only') {
    const err = new Error(
      `${only}: this source is a document (kind: document), and a document has no\n` +
      '  projection, cockpit or notes - print.html is its one view.\n' +
      '  node build.js <source.md>          builds it; --print-pdf prints it.');
    err.userFacing = true;
    throw err;
  }
  // Same pre-flight contract: an unknown `labels:` key fails the build here,
  // before any view is written, rather than inside a renderer. Resolved once
  // and passed to all three renderers via renderOpts.strings, which is why
  // no renderer calls lectureStrings itself.
  const strings = lectureStrings(lecture.frontmatter);
  // Same reasoning for the two the live prompter reads: nothing in a
  // --print-only build looks at them, so this is the only place a typo
  // in `duration:` or `prompter:` is caught for that build.
  talkDuration(lecture.frontmatter);
  talkStart(lecture.frontmatter);
  souffleuseSettings(lecture.frontmatter);
  const chunkCount = lecture.columns.reduce((n, c) => n + c.chunks.length, 0);
  const shape = `${lecture.columns.length} columns, ${chunkCount} chunks`;

  // Read and encode the embedded faces once, not once per view: the four
  // outputs share the same bytes. Runs before anything is written, so a
  // frontmatter family with no matching file fails without leaving an
  // artefact behind – same contract as assertInlinable above.
  assertFontsBlock(lecture.frontmatter);
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
    FONT_ROLES.filter(r => !claimed.has(r)).map(r => [r, roster[r]]));
  const bundled = bundleOff ? [] : bundledFaces(bundleRoster);
  // A bundled family other than the built-in default has to be named at the
  // head of the stack, or the @font-face lands and nothing asks for it:
  // --sans-font still says 'IBM Plex Sans' first and falls through to
  // whatever the machine has. Only emitted where it differs, so a default
  // lecture's CSS is byte-identical to before.
  // For `display` the two sides of that comparison are undefined when the
  // deck names no display face, so the role drops out here exactly as it
  // drops out of bundleRoster – and `fonts: none` takes it off with the
  // other three.
  const rosterOverrides = FONT_ROLES
    .filter(r => !claimed.has(r) && !bundleOff && roster[r] !== BUNDLED_DEFAULTS[r])
    .map(r => ({ role: r, family: roster[r] }));
  // `style: {display-scale}` folded into the face's own measurement, here and
  // nowhere else: the descriptor and the line-height calc then read one
  // number rather than computing the same product twice and rounding it
  // differently. Kept to one decimal - 62 x 1.4 is 86.8 and an integer would
  // throw half a percent away - and a scale of 1 leaves the integer alone, so
  // a deck that does not set the key emits exactly the bytes it did before.
  // A face from fonts/ carries no measurement, and 100% is its baseline: the
  // author is scaling from the size the layout would have set it at anyway.
  // Copied rather than written through, because bundledFaces() caches its
  // array across rebuilds under --watch.
  const dScale = styleOpts['display-scale'];
  const displayScaled = (f) => {
    if (f.role !== 'display' || dScale === 1) return f;
    return { ...f, sizeAdjust: Math.round((f.sizeAdjust || 100) * dScale * 10) / 10 };
  };
  const fontEmbed = (authorFonts || bundled.length)
    ? { faces: (authorFonts ? authorFonts.faces : []).map(displayScaled),
        overrides: [...(authorFonts ? authorFonts.overrides : []), ...rosterOverrides],
        bundled: bundled.map(displayScaled) }
    : null;
  // A key that scales a face the deck does not have does nothing, and this
  // format does not accept a silent no-op - the same rule that refuses a
  // cover-ratio on a cover which does not divide the slide. In the pre-flight
  // rather than in a renderer, so --print-only refuses it too.
  if (dScale !== 1 && !(fontEmbed && fontEmbed.overrides.some(o => o.role === 'display'))) {
    const err = new Error(
      `Frontmatter: "style.display-scale: ${dScale}" sets the size of this lecture's\n` +
      'display face, and the lecture has no display face to size.\n' +
      (bundleOff
        ? '  `fonts: none` turns the whole bundle off, the display role with it, so\n' +
          '  either drop that line and name a display face, or delete this key.'
        : '  Name one in the fonts: block -\n    fonts:\n      display: Anton\n' +
          '  - or delete the key, which is doing nothing as it stands.'));
    err.userFacing = true;
    throw err;
  }
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
  // style: {code} sizes an inline span against the prose face's x-height, so
  // it has to be answered here, where the roster is resolved, and not in a
  // renderer that sees only the frontmatter. One object for all four views -
  // the pairings are the same in every one of them, only the selector differs.
  const codeSizing = codeSizingFor(roster, claimed, bundleOff);
  // Said once per build rather than once per view, and only when it changes
  // something: a role with no measurement leaves that pairing at the size
  // `plain` would have set, which is a quiet fallback and therefore one the
  // build has to name.
  if (styleOpts.code !== 'plain' && codeSizing.unmeasured.length) {
    console.log(
      `[fonts] inline code keeps its ${CODE_SIZE_PLAIN}em size where the pairing cannot be measured ` +
      `(${codeSizing.unmeasured.join(', ')}: ${bundleOff ? '`fonts: none`' : 'a face from fonts/'}). ` +
      'Write `style: {code: plain}` to ask for that size everywhere.');
  }
  lastQrStats = { count: 0, bytes: 0 };
  stagedVideos.clear();
  // The documents file a reader's highlights under readerKey (the source
  // folder's name and a hash of the one above, see readerStoreKey), and the
  // live views' editor a reader's kept figure edits under the same key (see
  // editorPayload). lectureKey, the name alone, is what the documents
  // migrate from.
  const renderOpts = {
    ...opts, fontEmbed, strings, codeSizing,
    lectureKey: path.basename(outDir), readerKey: readerStoreKey(outDir),
  };

  const targets = [
    ['print',       renderDocument],
    ['print-notes', (l, o) => renderDocument(l, { ...o, withNotes: true })],
    ['audience',    renderAudience],
    ['speaker',     renderSpeaker],
  ].filter(([name]) => (!only || only === `--${name}-only`) && (!docMode || name === 'print'));
  renderOpts.absentViews = siblingViewsAbsent(outDir, targets.map(([name]) => name));

  // Render every view first, write afterwards. The pre-flights above catch
  // what can be seen before a renderer runs, but a defect that only one
  // renderer trips over used to leave two new files and two old ones beside
  // each other - a deck whose projection had moved on from its handout, with
  // nothing on disk saying so. In two passes the last good build survives a
  // failure whole: either all four files are the new one, or none of them is.
  // Each view is its own document, and an inlined SVG's id prefix only has to
  // be unique inside one. Resetting per build instead made a view's bytes
  // depend on the flags that produced it: --audience-only wrote psiINT-fig-6-
  // where a full build wrote psiINT-fig-8- for the same figure, so a tracked view
  // rebuilt with a partial flag reads as stale to release.yml and the diff is
  // pure id churn. Measured, not inferred.
  //
  // The floor is not zero, and that is the whole subtlety. parseLecture above
  // compiles the ::: draw blocks once and dgAssetMarkup splices vector assets
  // into them there, through this same counter - and that markup is shared by
  // all four views. So the ids minted during the parse are common property and
  // a view has to start above them, or its own first figure would collide with
  // a diagram's.
  const svgIdFloor = inlineSvgCounter;
  const rendered = targets.map(([name, render]) => {
    inlineSvgCounter = svgIdFloor;
    return [name, render(lecture, renderOpts)];
  });
  // A file outside the asset root was met while parsing or rendering and not
  // read. Refused here, after every renderer and before any view is written,
  // rather than in the pre-flight above: the renderers are the only reader
  // that knows which `![](…)` is an image and which is an example in a code
  // span, and a refusal of a path the deck only mentions would be a false one.
  assertAssetsConfined(outDir);
  const written = [];
  for (const [name, html] of rendered) {
    const p = path.join(outDir, `${name}.html`);
    writeOutputFile(p, html);
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
      `[video] ${rows.length} clip(s), ${mb} MB, ` +
      `${!inlineAssetsEnabled ? 'are not inlined (inlining is off) and play'
        : clipsOverBudget.size ? 'are too large to inline, or past the auto-inline budget, and play'
        : 'are too large to inline and play'} from ` +
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
  // A relative image path that named no file: it is a placeholder in the
  // output now rather than a silently broken external src, but the author has
  // to be told which ref and, usually, that the fix is dropping the extension
  // so the assets/ shorthand resolves it. lint.js reports the same as
  // `unresolved-asset`.
  if (UNRESOLVED_ASSETS.size) {
    for (const ref of UNRESOLVED_ASSETS) {
      const hint = /[\\/]/.test(ref) ? '' :
        `  – if it is in assets/, write ![](${ref.replace(/\.[a-z0-9]+$/i, '')}) without the extension`;
      console.warn(`[assets] not found: ${ref}${hint}`);
    }
  }
  if (lastKatexSheet) {
    const kb = (lastKatexSheet.bytes / 1024).toFixed(0);
    // The figure reported is the live views', which is the larger of the
    // two: they carry the sans and typewriter faces so the maths can follow
    // the F toggle. Print has no toggle and gets only what its formulas use.
    console.log(`[math] ${lastKatexSheet.families} KaTeX font families inlined, ${kb} KB of woff2 per live view (of 254 KB for the full set); print carries only the families its formulas use. A lecture without math inlines nothing.`);
  }
  // Cheap enough to do on every build (a line walk over the source), and
  // only a driver ever reads it: the human log says nothing about it.
  const stats = lectureStats(src, lecture);
  // `lecture` rides along for the one caller that wants the parsed deck
  // rather than the files: the souffleuse sidecar in runWatch builds its
  // prompt from it on every successful build.
  return { written, shape, stats, sourceModifiedMs: sourceModifiedAt(absIn), lecture };
}

// Watch mode: build once, start a WS server on the lecture's own port
// (lecturePorts), install a debounced fs.watch on the source file, and
// broadcast 'reload' to all connected clients on each successful rebuild.
// The reload snippet reconnects on close, and a page of an earlier run
// reloads when it hears this run's id, so the server can come and go
// without breaking the open browser tabs.
// The largest message the watch socket takes. The biggest thing a page sends
// is an asset upload, capped at MAX_INLINE_BYTES before base64 (2.7 MB after
// it); anything larger is refused by `ws` before a byte of it is parsed.
const WATCH_MAX_PAYLOAD = 4 * 1024 * 1024;

// Which pages may open the watch socket, by the Origin a browser sends with
// the handshake: a view opened from disk (`null`, and `file://`, which is
// what Chrome sends for a file page) and a view --serve delivered. Any other
// web page is refused before it can listen or send - the nonce used to be
// the only guard, and a page without it could still hear every reload and
// every failed build's message, source lines included. No Origin at all is
// not a browser: a local program, which could read source.md itself.
function watchOriginAllowed(origin, port) {
  if (origin == null || origin === '') return true;
  const o = String(origin).trim().toLowerCase();
  if (o === 'null' || o === 'file://') return true;
  if (!port) return false;
  return ['localhost', '127.0.0.1', '[::1]'].some(n => o === `http://${n}:${port}`);
}

async function runWatch(absIn, only, baseOpts = {}, { serve = false } = {}) {
  const { WebSocketServer } = await import('ws');
  const http = await import('node:http');
  // Loopback, explicitly. Omitting `host` listens on every interface, which
  // for a one-way reload socket was merely untidy and for a socket that can
  // write to the author's disk is not. On the lecture's own port, so a page
  // left open across a restart finds this run (watchRunJs); listened on
  // before the socket is attached, because `ws` rethrows a failed listen of
  // a server it is attached to.
  const wsHttp = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  const listened = await listenOnLecturePort(wsHttp, lecturePorts(absIn, WATCH_PORT_BASE));
  const port = listened.port;
  const wss = new WebSocketServer({
    server: wsHttp,
    maxPayload: WATCH_MAX_PAYLOAD,
    // Read at every handshake rather than once: --serve starts beside this
    // and learns its port after the socket is already listening.
    verifyClient: ({ origin }) => watchOriginAllowed(origin, servedPort),
  });
  if (listened.moved) {
    console.log(`The reload socket's port ${listened.wanted} is taken – using ${port}; a page left open`
      + ' from an earlier run will not reload by itself.');
  }
  // Which run of the watcher this is. Not a secret: it is said to every page
  // that connects, and a page of another run reloads (watchRunJs).
  const runId = crypto.randomBytes(8).toString('hex');
  let builtOnce = false;
  // A per-build secret, required on every patch. Without it any page in the
  // browser that guessed the port could write to source.md.
  let nonce = crypto.randomBytes(16).toString('hex');
  // The second secret, for the live views that carry no writer: it lets a
  // socket hear why a rebuild failed and nothing else. Never accepted where
  // the nonce is asked for.
  const listenKey = crypto.randomBytes(16).toString('hex');
  const opts = { ...baseOpts, watchPort: port, watchNonce: nonce, watchListen: listenKey, watchRun: runId };

  // Only a driver on stdin can turn this off, and the watch process stays up
  // when it does: live reload and the editor's write-back hang off this
  // socket and this nonce, so a process that died whenever somebody switched
  // auto-build off would make every open page unwritable. Auto off means the
  // watcher reports `changed` and does not build.
  let autoBuild = true;

  // The live prompter, or nothing at all. Created before the first build, so
  // the deck of that build reaches it like every other; the socket of the
  // last `souffleuse-hello` is tracked here rather than inside the sidecar,
  // because a closing WebSocket is this function's business.
  let cockpit = null;
  const sendToCockpit = (msg) => {
    if (!cockpit || cockpit.readyState !== 1) return false;
    try { cockpit.send(JSON.stringify(msg)); } catch (e) { return false; }
    return true;
  };
  const sidecar = baseOpts.souffleuse
    ? await createSouffleuse({
      absIn, opts: baseOpts.souffleuse, sendToCockpit, emitEvent, log: console.log,
    })
    : null;
  // Sync-only work, so it is safe here, and it is the one place that knows
  // the process is going: a call left in flight is abandoned rather than
  // resolved into a socket nobody is holding any more.
  if (sidecar) process.on('exit', () => sidecar.close());
  // Ctrl-C: a closing line in the log, where this run's debrief is, and then
  // the signal's own end, as if there had been no handler (an exit code of
  // 130 or 143 is what a shell and a test harness read). The log is written a
  // line at a time with a synchronous append, so there is nothing to flush;
  // abandoning the call in flight is all that is left to do.
  if (sidecar) {
    const stop = (sig) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      try {
        sidecar.close();
        sidecar.end(sig);
        const { log, prompt } = sidecar.files();
        if (log) {
          process.stdout.write((process.stdout.isTTY ? '\n' : '')
            + `[prompter] this run's log: ${shownPath(log)}${prompt ? ` · its prompt: ${shownPath(prompt)}` : ''}\n`);
        }
      } catch (e) { /* stopping anyway */ }
      process.kill(process.pid, sig);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }

  // Sockets that have shown this build's nonce - a live view saying hello,
  // or any message it sent with it. A reload goes to every socket, because
  // the two documents carry no nonce and still reload; why a build failed
  // goes only to these, because it quotes the source.
  const trusted = new WeakSet();
  // Sockets that may be told why a build failed: the trusted ones, and a
  // live view without a writer that showed the listen key. Everyone else -
  // the two documents, which send nothing - hears the bare 'build-failed'.
  const hearers = new WeakSet();
  const broadcast = (msg) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  };
  const failedFor = (client, why) =>
    hearers.has(client) ? JSON.stringify({ type: 'build-failed', why }) : 'build-failed';

  // The last rebuild's failure, if any. A failed rebuild used to be visible
  // only in the terminal: the open pages kept the old build silently, and
  // the next write-back was refused with "reload the page and try again" –
  // advice that cannot help while the build is broken. The pages are told,
  // and the refusal below names the real problem.
  let lastBuildError = null;
  // `label` prefixes the human log line and `reason` rides in the event. They
  // are the same word for every trigger but the file watcher, whose log line
  // has said `[rebuild]` since the beginning and whose reason a driver wants
  // to read as `change` – renaming the log line to match would break exactly
  // the coupling --events exists to remove.
  const rebuild = (label, reason = label) => {
    emitEvent({ type: 'build-start', reason });
    const t0 = Date.now();
    try {
      const { written, shape, stats, sourceModifiedMs, lecture } = buildOnce(absIn, only, opts);
      lastBuildError = null;
      // The parsed deck, to the one thing that wants it rather than the
      // files. A new prefix hash starts a new cache and a new session id.
      if (sidecar) sidecar.onBuild(lecture);
      console.log(`[${label}] ${written.join(', ')} (${shape})`);
      emitEvent({
        type: 'build-success', reason,
        views: written.map(p => path.basename(p, '.html')),
        shape, durationMs: Date.now() - t0, embeds: embedsThisBuild.length,
        stats, sourceModifiedMs,
      });
      builtOnce = true;
      broadcast('reload');
    } catch (err) {
      lastBuildError = err.message;
      console.error(`[${label}] build failed: ${err.message}`);
      emitEvent({
        type: 'build-error', reason, message: err.message,
        userFacing: !!err.userFacing,
        // A userFacing error is instructions for the author, so a stack is
        // noise; anything else is a defect here, and the driver shows it as
        // one, which needs the stack.
        stack: err.userFacing ? null : (err.stack || null),
        durationMs: Date.now() - t0,
      });
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(failedFor(client, err.message));
      }
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
    // A cockpit that goes away takes its hints with it. Without this the
    // sidecar would keep whispering into a socket in CLOSED, and the next
    // cockpit's hello would be the second one to be answered.
    sock.on('close', () => { if (cockpit === sock) cockpit = null; });
    // A socket error is the socket's end, not the watcher's. Without a
    // listener `ws` rethrows it, and one message over WATCH_MAX_PAYLOAD - or
    // a malformed frame - took the whole watch process down with it.
    sock.on('error', () => { try { sock.terminate(); } catch (e) { /* gone */ } });
    // A page that opens while the source is broken is on the last good build
    // too. The reason, if it may hear one, follows its hello.
    if (lastBuildError) { try { sock.send('build-failed'); } catch (e) { /* gone */ } }
    // Which run this is, once this run has written its views: a page of an
    // earlier run reloads onto them. Before the first good build the files
    // on disk are still the earlier run's, and the reload that build sends
    // reaches this socket too.
    if (builtOnce) { try { sock.send(JSON.stringify({ type: 'run', id: runId })); } catch (e) { /* gone */ } }
    sock.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      // A live view's first word on every connection, answered with nothing:
      // it only marks the socket as one this build made.
      if (msg.type === 'hello') {
        if (typeof msg.nonce === 'string' && msg.nonce === nonce) { trusted.add(sock); hearers.add(sock); }
        else if (typeof msg.listen === 'string' && msg.listen === listenKey) hearers.add(sock);
        if (lastBuildError && hearers.has(sock)) sock.send(failedFor(sock, lastBuildError));
        return;
      }
      const known = msg.type === 'patch' || msg.type === 'assets' || msg.type === 'asset'
        || msg.type.startsWith('souffleuse-');
      if (!known) return;
      // `extra` first, so a payload field can never shadow a protocol one.
      // It could: an asset reply carries the asset's own `id`, and spreading
      // it last overwrote the message id the client pairs on – the write
      // succeeded, the promise never resolved, and the picker sat there.
      const reply = (ok, why, extra) => sock.send(JSON.stringify({ ...extra, type: msg.type + '-result', id: msg.id, ok, why }));
      if (msg.nonce !== nonce) return reply(false, 'this page is from an older build – reload it and try again');
      trusted.add(sock);
      hearers.add(sock);

      // The live prompter, after the nonce check like everything else. A
      // second cockpit tab takes the hints over by saying hello; the one that
      // said it last is the one being whispered to.
      if (msg.type.startsWith('souffleuse-')) {
        if (msg.type === 'souffleuse-hello') {
          // The cockpit that was being whispered to is told it has been
          // displaced. It used to be dropped in silence: a second tab – which
          // is one stray `S` in the projection away – left the first one with
          // its switch pressed, its microphone open and its strip empty for
          // the rest of the talk, sending a transcript nothing answered. An
          // `idle` with the reason is exactly what the cockpit already knows
          // how to act on: the ear stops and the switch goes back up.
          if (cockpit && cockpit !== sock && cockpit.readyState === 1) {
            try {
              cockpit.send(JSON.stringify({
                type: 'souffleuse-status', state: 'idle',
                why: 'another cockpit took the prompter',
              }));
            } catch (e) { /* it was going away anyway */ }
          }
          cockpit = sock;
        }
        if (!sidecar) return reply(false, 'start the build with --prompter');
        return sidecar.onMessage(msg, reply, sock);
      }

      const assetDir = path.join(path.dirname(absIn), 'assets');

      // Everything in assets/ the resolver would find, so the editor's
      // picker can offer a file no diagram references yet. Names only – the
      // bytes stay on disk until the build inlines them.
      //
      // Held to the rule a build holds a reference to: a name the build
      // would refuse - a link out of the asset root, into a dot-folder, or to
      // a file that is not a picture - is left off the list and never
      // stat'ed, so its size does not say anything about a file elsewhere.
      if (msg.type === 'assets') {
        let names = [];
        try {
          names = fs.readdirSync(assetDir)
            .filter(f => IMG_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
            .filter(f => assetEscape(path.join(assetDir, f), path.dirname(absIn)) === null)
            .map(f => {
              const st = fs.statSync(path.join(assetDir, f));
              return st.isFile() ? { file: f, id: f.replace(/\.[^.]+$/, ''), bytes: st.size } : null;
            })
            .filter(Boolean)
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
        // assets/ itself may not be a link: the rename below would land
        // wherever it points. outputDir refuses one and creates a missing one.
        try { outputDir(assetDir); }
        catch (e) { return reply(false, 'assets/ is a symbolic link, and the editor does not write through one – replace it with a real folder'); }
        const dest = path.join(assetDir, name);
        // lstat, not exists: a link at the name is "a different file" and is
        // never read for the comparison, which would read wherever it points.
        let there = null;
        try { there = fs.lstatSync(dest); } catch { /* a new name */ }
        if (there && !msg.replace) {
          const same = there.isFile()
            && (() => { try { return fs.readFileSync(dest).equals(bytes); } catch { return false; } })();
          if (!same) return reply(false, `assets/${name} already exists and is a different file`, { exists: true });
          return reply(true, '', { file: name, id: name.replace(/\.[^.]+$/, ''), unchanged: true });
        }
        try {
          writeOutputFile(dest, bytes);
        } catch (e) { return reply(false, 'cannot write the asset: ' + e.message); }
        console.log(`[asset] assets/${name} (${bytes.length < 1024 ? bytes.length + ' B' : (bytes.length / 1024).toFixed(0) + ' KB'})`);
        emitEvent({ type: 'asset', file: name, bytes: bytes.length });
        // Deliberately no rebuild here. The watcher only answers to
        // source.md, so writing the asset alone changes nothing on screen
        // – the `patch` that adds
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
        rewriteSourceFile(absIn, src.slice(0, range[0]) + msg.text + src.slice(range[1]));
      } catch (e) { return reply(false, 'cannot write the source: ' + e.message); }
      console.log(`[patch] ${path.relative(process.cwd(), absIn)} – ${hit.chunk ? '#' + hit.chunk : 'a diagram'}, ${msg.text.length - hit.body.length >= 0 ? '+' : ''}${msg.text.length - hit.body.length} bytes`);
      emitEvent({ type: 'patch', chunk: hit.chunk || null, delta: msg.text.length - hit.body.length });
      reply(true, '');
      // fs.watch fires on the write and the normal rebuild follows, so the
      // editor never owns a parallel copy of anything – unless auto-build is
      // off, where the watcher only reports. A patch is a change the person
      // just made on purpose, in a figure they are looking at, so it builds
      // either way; with auto on, the file event does it and this would be a
      // second build of the same bytes.
      if (!autoBuild) rebuild('patch');
    });
  });

  await prewarmWebp(absIn, opts);
  rebuild('initial');
  console.log(`Watching ${path.relative(process.cwd(), absIn)} – `
    + (serve ? 'every save rebuilds and reloads the open views' : 'live-reload active (open the HTML files in Chrome)'));
  // Absolute, unlike the log line: a driver knows neither this process's
  // working directory nor which folder a relative path is relative to.
  emitEvent({ type: 'watching', source: absIn, dir: path.dirname(absIn), auto: autoBuild });

  // The folder, not the file. An editor that saves atomically – vim, gedit,
  // VS Code by default – writes a temporary file and renames it over the
  // original, so the name gets a new inode. On Linux inotify follows the
  // inode, so a watch on the file itself keeps reporting on a file nobody
  // reads any more and the second save onwards is silent. A watch on the
  // directory survives the rename; the filter below is what keeps it from
  // rebuilding on every asset and every output the build just wrote.
  //
  // `filename` is null on some platforms and event types, and a lost name is
  // not a reason to stop watching, so an unnamed event rebuilds.
  //
  // Editors typically emit two close-spaced events per save (write +
  // rename on atomic save). Debounce so we rebuild once per save.
  const watchDir = path.dirname(absIn);
  const watchBase = path.basename(absIn);
  let timer = null;
  fs.watch(watchDir, { persistent: true }, (_event, filename) => {
    if (filename && filename !== watchBase) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (autoBuild) rebuild('rebuild', 'change');
      // The save time rides along, so a driver showing "last saved" is right
      // without a watcher of its own – and right while auto-build is off,
      // which is the only state in which the two times differ.
      else emitEvent({ type: 'changed', modifiedMs: sourceModifiedAt(absIn) });
    }, 80);
  });

  // Commands, one JSON object per line. Only under --events, because reading
  // stdin at all would keep an ordinary `--watch` alive past a closed pipe
  // and change nothing for the better. An unparsable or unknown line is
  // ignored rather than answered: this is a private channel between a driver
  // and the process it started, and a complaint has nobody to reach.
  //
  // `end` is deliberately not handled. A driver may close its write end and
  // keep reading events, and the watch is the thing the person opened; only
  // a kill ends it.
  if (eventsEnabled) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'rebuild') rebuild('manual');
      else if (msg.type === 'auto') {
        autoBuild = !!msg.enabled;
        emitEvent({ type: 'auto', enabled: autoBuild });
      } else if (msg.type === 'prompter' && sidecar) {
        // The same switch the cockpit's button throws, for a driver that has
        // a switch of its own. Silently ignored without a sidecar, like every
        // unknown line: this channel has nobody to complain to.
        sidecar.setEnabled(!!msg.enabled);
      }
    });
  }
  return { port, runId, built: builtOnce, prompter: sidecar };
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
//
// Loopback is not the whole of it, because a web page in the same browser
// can reach loopback too: a site that points its own host name at 127.0.0.1
// (DNS rebinding) reads whatever this answers as if it were its own. So a
// request is answered only when its Host is this server's own name -
// localhost, 127.0.0.1 or [::1] with this port - which a rebinding page
// cannot send. And what is answered is what the four views can ask for:
// a file of a kind in this table (the views themselves, pictures, clips,
// faces, a PDF a slide links to), never below a name that starts with a dot
// (.env, .git), and never the prompter's transcript or prompt, which are
// the one thing in the folder that is the room's words rather than the
// deck. source.md is not served either: no view reads it - the editor
// carries the text it edits in the page and writes back over the watch
// socket - and it holds the speaker notes the projection does not show.
// SERVE_MIME and servePathAllowed are local-files.mjs's, because a page the
// engine opens from disk is held to what this server would answer.

// The port --serve listens on, once it does; null without --serve. The watch
// socket reads it to accept a page this server delivered.
let servedPort = null;

// Whether a request's Host header names this server. Lower-cased, and the
// port must be the one listened on: `localhost` alone is what a browser
// sends for port 80, which is not this.
function serveHostAllowed(host, port) {
  const h = String(host || '').trim().toLowerCase();
  return ['localhost', '127.0.0.1', '[::1]'].some(n => h === `${n}:${port}` || (port === 80 && h === n));
}


// Sent with every answer, a refusal included. No site but this one may
// frame a view: the cockpit carries the watch socket's nonce, and a page
// elsewhere that framed it could at least watch it. The browser takes each
// file for the type it is served as, and no other origin may load a picture
// or a clip from here - which is all a page elsewhere needs to learn which
// files exist. frame-ancestors restricts who frames these pages, not what
// they frame, so a YouTube embed - the reason --serve exists - is untouched.
// No Referrer-Policy: an embed carries its own (strict-origin-when-cross-
// origin), because YouTube refuses to play without a Referer, and a page-wide
// no-referrer is one attribute away from breaking it.
const SERVE_HEADERS = [
  ['content-security-policy', "frame-ancestors 'self'"],
  ['x-content-type-options', 'nosniff'],
  ['cross-origin-resource-policy', 'same-origin'],
];

async function runServe(rootDir, wantedPort, { absIn = null } = {}) {
  const http = await import('node:http');
  // Canonicalise the root too, or a repo reached through a symlinked path
  // would fail its own containment check.
  try { rootDir = fs.realpathSync(rootDir); } catch { /* keep as given */ }
  // A lecture whose folder is the home folder or the top of a disk is served
  // its four views, assets/, fonts/ and videos/ and nothing else of it.
  const exposed = assetRootExposed(rootDir);
  let port = null;
  const server = http.createServer((req, res) => {
    for (const [name, value] of SERVE_HEADERS) res.setHeader(name, value);
    if (!serveHostAllowed(req.headers.host, port)) {
      res.writeHead(403); return res.end('forbidden');
    }
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); return res.end('bad request'); }
    if (rel === '/') rel = '/audience.html';
    // Judged on the path as asked and again on where it really is below,
    // so a link named like a picture does not serve a transcript.
    if (!servePathAllowed(rel, exposed)) { res.writeHead(404); return res.end('not found'); }
    // Resolve, then confirm the result is still inside the served root:
    // without this, a request for /../../.ssh/id_rsa would be honoured.
    // Resolve symlinks before the containment test, not just `..`. A prefix
    // check on the lexical path still serves whatever a symlink inside the
    // lecture folder points at.
    let abs = path.resolve(rootDir, '.' + rel);
    try { abs = fs.realpathSync(abs); } catch { abs = null; }
    // A picture, clip or face the deck reads from the folder one level up -
    // `../shared/logo.png`, which the build allows so lectures side by side
    // can share one - is asked for as /shared/logo.png, because a URL cannot
    // climb above the served root. Answered from that folder when the
    // lecture's own has no such file, and only for a file the build itself
    // would read (assetEscape: inside the asset root, no dot-folder, a link
    // only to its own kind); a view, a PDF or a script up there is not part
    // of this deck and stays unserved. Without this a deck that inlined its
    // shared logo broke under --no-inline-images --serve.
    if (!abs) {
      const up = path.dirname(rootDir);
      const cand = path.resolve(up, '.' + rel);
      let real = null;
      try { real = fs.realpathSync(cand); } catch { /* not there either */ }
      if (real && up !== rootDir && !assetRootNarrowed(rootDir)
          && assetKindOf(cand) && assetEscape(cand, rootDir) === null
          && pathWithin(up, real) && servePathAllowed(path.relative(up, real))) {
        abs = real;
      } else { res.writeHead(404); return res.end('not found'); }
    } else {
      if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) {
        res.writeHead(403); return res.end('forbidden');
      }
      if (!servePathAllowed(path.relative(rootDir, abs), exposed)) { res.writeHead(404); return res.end('not found'); }
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
      // `bytes=-500` is a suffix: the last 500 bytes, not the first 501
      // (RFC 9110 14.1.2). Safari asks for one before it plays a clip.
      if (!range[1] && range[2]) {
        const n = parseInt(range[2], 10);
        start = Math.max(0, size - n);
        end = size - 1;
        if (n === 0) start = size;
      }
      if (!range[1] && !range[2]) start = size;
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

  // A port the author named is that port or a refusal; otherwise the
  // lecture's own (lecturePorts), so a restart is the same origin.
  let moved = null;
  if (wantedPort) {
    await new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(wantedPort, '127.0.0.1', resolve);
    }).catch((err) => { throw portRefusal(err, wantedPort); });
  } else {
    const got = await listenOnLecturePort(server,
      lecturePorts(absIn || path.join(rootDir, 'source.md'), SERVE_PORT_BASE));
    if (got.moved) moved = got.wanted;
  }
  port = server.address().port;
  servedPort = port;
  const base = `http://localhost:${port}`;
  console.log(`Serving ${path.relative(process.cwd(), rootDir) || '.'} on ${base} – loopback only, Ctrl-C to stop`);
  if (moved) {
    console.log(`  Port ${moved}, this lecture's own, is taken – by this lecture in another terminal, or by`
      + ` another program – so ${port} it is. A tab from an earlier run still points at ${moved}.`);
  }
  emitEvent({ type: 'serving', url: base });
  return { server, base, port };
}

// The addresses, once the views they name are on disk: printed after the
// first build rather than when the server starts, which under --watch was
// before anything was built – a fresh folder printed no address at all, and
// a second run listed the files of the first. The cockpit first, because it
// is the one a lecturer opens; the projection is opened from it (S).
function printViewAddresses(rootDir, base, { prompter = false, document = false } = {}) {
  // A document's folder may still hold the views of a build from before it
  // said `kind: document`; only the one it has is named.
  const rows = [
    ['cockpit', 'speaker'], ['projection', 'audience'],
    ['document', 'print'], ['with notes', 'print-notes'],
  ].filter(([, name]) => (!document || name === 'print') && fs.existsSync(path.join(rootDir, `${name}.html`)));
  if (!rows.length) return;
  console.log('');
  for (const [label, name] of rows) console.log(`  ${label.padEnd(11)} ${base}/${name}.html`);
  if (prompter) console.log(`  ${'prompter'.padEnd(11)} Chrome only (speech recognition) – Shift-S in the cockpit switches it on`);
  console.log('');
}

// ── the lecture's own ports ──────────────────────────────────────────
//
// A served page's localStorage – the slide it was on, the theme, the live
// annotations not yet exported – belongs to its origin, and the origin is the
// port. A free port per run made every restart a new origin and an empty
// store, and a tab left open across the restart pointed at a port nobody was
// listening on. So a lecture has ports of its own, derived from where its
// source.md really is: one for --serve in 41000-44999 and one for the watch
// socket in 45000-48999, the same offset in both. Below 49152, where macOS
// and Windows hand out ephemeral ports, and a handful of services a lecture
// hall's own machines speak are skipped. Taken - the same lecture still
// running in another terminal, or some other program - the next free one of
// the next few is used and the start says so; after those, any free port.
// --port keeps the old answer: that port, or a refusal.
const LECTURE_PORT_SPAN = 4000;
const SERVE_PORT_BASE = 41000;
const WATCH_PORT_BASE = 45000;
const LECTURE_PORT_TRIES = 10;
// Crestron (41794, 41795), EtherNet/IP (44818), WinRM (47001), BACnet (47808).
const LECTURE_PORTS_AVOIDED = new Set([41794, 41795, 44818, 47001, 47808]);

function lecturePorts(absIn, base) {
  let real = absIn;
  try { real = fs.realpathSync.native(absIn); } catch { /* as given */ }
  const at = crypto.createHash('sha256').update(real).digest().readUInt32BE(0) % LECTURE_PORT_SPAN;
  const out = [];
  for (let k = 0; out.length < LECTURE_PORT_TRIES && k < LECTURE_PORT_SPAN; k++) {
    const port = base + (at + k) % LECTURE_PORT_SPAN;
    if (!LECTURE_PORTS_AVOIDED.has(port)) out.push(port);
  }
  return out;
}

// Listens on the first of `ports` the system gives, else on a free one.
// Resolves to the port; `moved` says the first was taken.
async function listenOnLecturePort(server, ports) {
  const attempt = (port) => new Promise((resolve, reject) => {
    const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
  for (const port of ports) {
    try {
      await attempt(port);
      return { port: server.address().port, wanted: ports[0], moved: port !== ports[0] };
    } catch (err) {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
    }
  }
  await attempt(0);
  return { port: server.address().port, wanted: ports[0], moved: true };
}

// --open: the cockpit in a browser, once the first build is on disk and the
// server listens. Chrome under --prompter, because the prompter's ear is
// Chrome's speech recognition; elsewhere the system's default. Never a reason
// for the run to fail: a browser that does not start is one line saying what
// to open by hand. PSI_OPEN=print says what would be opened instead, which is
// how the tests ask without a window appearing.
function openInBrowser(url, { chrome = false } = {}) {
  const how = chrome && process.platform === 'darwin' ? 'Google Chrome' : 'the default browser';
  if (process.env.PSI_OPEN === 'print') {
    console.log(`[open] ${how}: ${url}`);
    return;
  }
  const byHand = () => console.log(`Could not open a browser – open ${url} by hand.`);
  const run = (cmd, args, onFail, extra = {}) => {
    let failed = false;
    const fail = () => { if (!failed) { failed = true; onFail(); } };
    let child;
    try { child = spawn(cmd, args, { stdio: 'ignore', ...extra }); } catch (e) { fail(); return; }
    child.on('error', fail);
    child.on('exit', (code) => { if (code) fail(); });
    child.unref();
  };
  if (process.platform === 'darwin') {
    if (!chrome) { run('open', [url], byHand); return; }
    run('open', ['-a', 'Google Chrome', url], () => {
      console.log('Google Chrome is not installed here, so the default browser opens – the prompter needs Chrome.');
      run('open', [url], byHand);
    });
  } else if (process.platform === 'win32') {
    run('cmd', ['/c', 'start', '""', url], byHand, { windowsVerbatimArguments: true });
  } else {
    run('xdg-open', [url], byHand);
  }
}

// A port the author named and the system will not give. Said as a sentence
// rather than as Node's EADDRINUSE stack, and asked before anything is built
// (assertPortFree, from main) as well as at the listen itself, because under
// --watch --serve the watcher has already built and printed by the time the
// server listens. The watch socket's port is never named on the line: when
// the lecture's own is taken it moves to another (listenOnLecturePort).
function portRefusal(err, port) {
  if (!err || !port) return err;
  const other = port < 65535 ? port + 1 : port - 1;
  const msg = err.code === 'EADDRINUSE'
    ? `Error: port ${port} is in use – by another build.js --serve, or by another program.\n`
      + `  Pick another (--port ${other}), or leave --port out and the lecture's own is used.`
    : err.code === 'EACCES'
      ? `Error: port ${port} needs privileges this account does not have.\n`
        + '  Pick one above 1023, or leave --port out and the lecture\'s own is used.'
      : null;
  if (!msg) return err;
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

async function assertPortFree(port) {
  if (!port) return;
  const net = await import('node:net');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  }).catch((err) => { throw portRefusal(err, port); });
}

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
  // The PDF exports' rule for the disk: the page may load what --serve would
  // answer for this lecture and nothing else. A deck's HTML can show a file
  // it cannot read - an iframe of ../../secret.txt, a folder drawn as a
  // listing under the user's name - and a frame of --frames is a picture of
  // what was shown. One rule, so it comes from where the exports keep it.
  const { routeLocalFiles } = await import('./pdf-export.mjs');
  const lectureDir = path.dirname(absIn);
  const refusedSaid = new Set();
  await routeLocalFiles(page, (url) => fileUrlAllowed(url, lectureDir), (url) => {
    const u = String(url).split('#')[0].slice(0, 300);
    if (refusedSaid.has(u)) return;
    refusedSaid.add(u);
    console.error(`${label}: refused ${u} – a page opened from the lecture loads only its own files`
      + ' and what the build may read one level up.');
  });
  // What the three probes look at is the room's projection mid-talk, so the
  // start menu a lecturer sees before the first slide moves stays down: frame
  // 1 of --frames would otherwise carry it.
  await page.addInitScript(() => { window.PSI_NO_START_MENU = true; });
  await page.goto(pathToFileURL(audience).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { browser, page };
}

// Hold still before looking. Both probes below press a key and then wait a
// fixed 360 ms, which is longer than a reveal's 180 ms fade and the 260 ms
// crossfade - and shorter than two things that matter: the camera's own
// glide, and a `::: backdrop … reveal` at 620 ms. A picture taken at 360 ms
// of that reveal is the clip-path part-way open, and a full-frame photograph
// is then a centred rectangle with paper round it: measured on a keynote,
// #klausur came out 1352x775 in a 1600x900 frame and #projektmesse 1260x708,
// and both were read off the contact sheet as a layout defect - the backdrop
// being scaled with the slide - which they are not. The DOM says
// inset(0) and background-size: cover at rest; the camera had simply
// photographed a state the projection passes through.
//
// So wait for the transitions rather than for a number. getAnimations() sees
// CSS transitions and animations, which is every one of the cases above; a
// figure `step` is tweened in JavaScript and is covered by the fixed wait the
// callers keep. The cap is there because a deck may hold a looping animation
// (an autoplaying figure, a caret) that never finishes, and a probe that
// waits for one of those would never return.
const PROBE_SETTLE_MS = 1200;
function settleProbe(page, cap = PROBE_SETTLE_MS) {
  return page.evaluate((ms) => new Promise((done) => {
    const t0 = performance.now();
    const tick = () => {
      const running = document.getAnimations().some(a => a.playState === 'running');
      if (!running || performance.now() - t0 > ms) { done(Math.round(performance.now() - t0)); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }), cap).catch(() => 0);
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

// ── --frames ─────────────────────────────────────────────────────────
// Every state of the projection as a picture, because the two probes above
// answer two narrow questions and a deck goes wrong in ways neither asks
// about: a figure whose type is 12 px on a 1600 px slide, a `.bare` cell
// that swallowed its `.dashed`, a caption over a figure instead of under
// it. --check-fit is geometry against the frame and --squint is text; both
// were clean on a keynote whose author found seven of its defects only
// after writing this walk by hand in Playwright and running it six times.
//
// One PNG per state at 1600x900, named by position, chunk id and beat, and
// a contact sheet of eight per page next to them - the sheet is what one
// actually reads, because the defects above are visible at a quarter of
// the size and forty frames on five pages is a review, forty files is not.
// The sheet is drawn by the same browser from an HTML page of the frames,
// so it costs no image library. Never fails a build.
function frameIdPart(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'chunk';
}

async function runFrames(absIn, viewport, outDir) {
  const opened = await openAudienceProbe(absIn, '--frames', viewport, 'written');
  if (!opened.page) return opened.code;
  const { browser, page } = opened;
  const dir = path.resolve(path.dirname(absIn), outDir || 'frames');
  try { outputDir(dir); }
  catch (e) { await browser.close(); throw e; }
  for (const f of fs.readdirSync(dir)) {
    if (/^(\d{3}-.*\.png|sheet-\d+\.png|sheet\.html)$/.test(f)) fs.unlinkSync(path.join(dir, f));
  }

  const where = () => page.evaluate(() => {
    const act = document.querySelector('.chunk.active');
    return act ? (act.dataset.chunkId || act.id || 'chunk') : null;
  });

  // Same stop rule as --check-fit: the screenshot hash decides, because a
  // figure step moves nothing the DOM can count. Duplicates are not written
  // - a press that painted the same pixels is the same state.
  const frames = [];
  let lastHash = null, same = 0, lastId = null, beat = 0;
  for (let i = 0; i < 400; i++) {
    const id = await where();
    if (!id) break;
    await settleProbe(page);
    const shot = await page.screenshot();
    const hash = crypto.createHash('sha1').update(shot).digest('hex');
    if (hash === lastHash) { if (++same >= 2) break; }
    else {
      same = 0;
      beat = id === lastId ? beat + 1 : 0;
      lastId = id;
      // The id comes out of the live page, which runs the deck's scripts, so
      // it is a name only after this: a script that set data-chunk-id to
      // ../../x wrote frames outside the folder, and the caption below put
      // the same string into the sheet's markup.
      const name = `${String(frames.length + 1).padStart(3, '0')}-${frameIdPart(id)}-b${beat}.png`;
      writeOutputFile(path.join(dir, name), shot);
      frames.push({ name, id, beat });
    }
    lastHash = hash;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(360);
  }

  // The contact sheet: eight frames a page, four by two, each captioned with
  // its file name so a defect seen on the sheet can be opened at full size.
  const per = 8, sheets = Math.ceil(frames.length / per);
  const cell = Math.floor((viewport.width - 5 * 16) / 4);
  const cellH = Math.round(cell * viewport.height / viewport.width);
  for (let s = 0; s < sheets; s++) {
    const slice = frames.slice(s * per, s * per + per);
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#444;font:12px/1.3 system-ui,sans-serif;color:#eee}
      .grid{display:grid;grid-template-columns:repeat(4,${cell}px);gap:16px;padding:16px}
      figure{margin:0}img{width:${cell}px;height:${cellH}px;display:block;background:#fff;outline:1px solid #222}
      figcaption{padding:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    </style><div class="grid">${slice.map(f =>
      `<figure><img src="${pathToFileURL(path.join(dir, f.name)).href}"><figcaption>${f.name}</figcaption></figure>`).join('')}</div>`;
    const sheetHtml = path.join(dir, 'sheet.html');
    writeOutputFile(sheetHtml, html);
    const sp = await browser.newPage({ viewport: { width: viewport.width, height: 2 * (cellH + 40) + 16 }, deviceScaleFactor: 1 });
    await sp.goto(pathToFileURL(sheetHtml).href, { waitUntil: 'networkidle' });
    writeOutputFile(path.join(dir, `sheet-${s + 1}.png`), await sp.screenshot({ fullPage: true }));
    await sp.close();
    fs.unlinkSync(sheetHtml);
  }
  await browser.close();
  console.log(`[frames] ${frames.length} state(s) at ${viewport.width}x${viewport.height}`
    + ` written to ${path.relative(process.cwd(), dir) || '.'}/, ${sheets} contact sheet(s).`);
  return 0;
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
//     against #psiINT-stage-viewport's box - not the content height against a
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
    const vp = document.getElementById('psiINT-stage-viewport').getBoundingClientRect();
    // The box the CAMERA framed, not a box of this probe's own choosing.
    // focusCamera measures `.chunk-content` for an ordinary chunk, the chunk
    // itself where a dock or a panel takes a grid row, and – on a `.middle`
    // chunk – the span that is actually painted at this beat. A probe that
    // kept measuring the content box on a `.middle` chunk reported the empty
    // reserve under a growing stack as overflow: measured on a keynote,
    // #drei-jahre "184 px off the bottom" and #busfaktor "40 px" with nothing
    // cut off either frame. The three branches have to be one rule, so they
    // are read off the same attributes and the same walk the camera uses.
    const framed = act.hasAttribute('data-dock') || act.hasAttribute('data-has-panel') ? act : content;
    let r = framed.getBoundingClientRect();
    if (framed !== act && act.hasAttribute('data-middle') && typeof paintedClientSpan === 'function') {
      const sp = paintedClientSpan(framed);
      // The camera's own guard: a painted span taller than the frame is
      // walked from its head like any other tall chunk, and framing it would
      // be framing the middle of something with no top on screen.
      if (sp && sp.height <= vp.height) r = sp;
    }
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
    // How large the figure's type actually came out, which is the other
    // question a rendered page is the only place to ask. A label's size is
    // its font-size through the viewBox transform - the attribute times the
    // screen CTM - and the figure's BASE label is that for an unclassed one,
    // which is the rendered width over --dg-fit-w by construction. The base
    // is what the width rule aims at and what is compared here; the smallest
    // label on the drawing is reported beside it but never tested, because
    // `.small` IS 0.8 of the base and testing it would report the vocabulary.
    //
    // Against the body type beside it, because "small" on a slide is a
    // relation and not only a number: the two are meant to match
    // (.chunk .psi-diagram).
    //
    // And how much of its canvas the drawing filled, which is the question
    // the canvas made askable: `data-canvas` is the box the slide reserved
    // and the box the drawing took, both in viewBox units, and it is on the
    // svg only where a canvas applies.
    const body = act.querySelector('.chunk-body') || act.querySelector('.section-body') || content;
    const bodyPx = parseFloat(getComputedStyle(body).fontSize) || 0;
    const figs = [];
    for (const svg of act.querySelectorAll('svg.psi-diagram')) {
      if (!svg.clientWidth || svg.closest('.exps')) continue;
      const typeW = parseFloat(getComputedStyle(svg).getPropertyValue('--dg-fit-w'));
      if (!(typeW > 0)) continue;
      let min = Infinity;
      for (const t of svg.querySelectorAll('.dg-lbl text')) {
        const m = t.getScreenCTM();
        const px = parseFloat(getComputedStyle(t).fontSize) * (m ? m.a : 1);
        if (px > 0 && px < min) min = px;
      }
      const cv = (svg.dataset.canvas || '').split(/\s+/).map(Number);
      // The four numbers and not only the ratio: the ratio says whether the
      // slide reads full, and what an author about to add a row needs is how
      // much room is left, per axis. Kept in viewBox units and divided by the
      // base label on the way out, the way the static warnings say it.
      const canvas = cv.length === 4 && cv.every(n => n > 0)
        ? { w: cv[0], h: cv[1], cw: cv[2], ch: cv[3],
            // The tier and the multiplier, for the report's "reads empty":
            // a picture slide is judged against the ordinary canvas height.
            tier: act.dataset.canvasTier || '',
            ft: parseFloat(getComputedStyle(svg).getPropertyValue('--figure-type')) || 1,
            fill: Math.round(100 * (cv[2] * cv[3]) / (cv[0] * cv[1])),
            over: Math.max(0, cv[2] - cv[0]) > 0.5 || Math.max(0, cv[3] - cv[1]) > 0.5 }
        : null;
      figs.push({
        canvas,
        base: Math.round((svg.clientWidth / typeW) * 10) / 10,
        min: min === Infinity ? null : Math.round(min * 10) / 10,
      });
    }
    return {
      id: act.dataset.chunkId || act.id || '?',
      tag: act.dataset.tag || '', width: act.dataset.width || '',
      top: Math.round(r.top - vp.top), bottom: Math.round(r.bottom - vp.top),
      h: Math.round(r.height), vpH: Math.round(vp.height),
      collapse, bolds, boldPx: Math.round(boldPx),
      figs, bodyPx: Math.round(bodyPx * 10) / 10,
    };
  });

  // The screenshot hash, not the DOM, decides when the walk is over. A
  // figure step changes no text and no element count, so a signature taken
  // from the document reports "nothing moved" and stops the walk on the
  // first stepped figure in the deck.
  const worst = new Map();
  const figType = new Map();
  // What every slide's body type settled at, figure or not - the reference
  // "what the deck's other slides get" has to be measured over the whole deck
  // and not over the figures alone, or a deck whose figures are all dense
  // reports itself as even. Smallest per chunk, for the same reason figType
  // keeps the smallest: a chunk is as small as its worst beat made it.
  const bodySeen = new Map();
  let states = 0, lastHash = null, same = 0;
  for (let i = 0; i < 400; i++) {
    await settleProbe(page);
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
    // The smallest label the slide showed at any of its beats, kept per chunk:
    // a figure can arrive on a later beat, and a `step` can swap a label for a
    // longer one that is typeset smaller.
    for (const f of st.figs) {
      const prev = figType.get(st.id);
      if (!prev || f.base < prev.px) {
        figType.set(st.id, { px: f.base, min: f.min, bodyPx: st.bodyPx, width: st.width, tag: st.tag,
                             canvas: f.canvas });
      }
    }
    if (st.bodyPx > 0 && !isCoverSlide(st.tag)) {
      const prev = bodySeen.get(st.id);
      if (prev == null || st.bodyPx < prev) bodySeen.set(st.id, st.bodyPx);
    }
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
  reportFigureType(figType, bodySeen, where);
  // Named, all of them, and on their own lines. The summary used to carry a
  // count and the first four ids, which is the shape of a line nobody can act
  // on: a deck with nine tall chunks got "9 chunk(s) … (#a, #b, #c, #d, …)"
  // and the author had no way to find the other five but to walk the deck.
  // They are still not a failure and still change no exit code - a tall chunk
  // is shown by scrolling and the author may well have meant it - so this is
  // a list to read, with the height beside each name so the ones that are
  // barely over can be told from the ones that are twice the frame.
  const tallNote = tall.length
    ? ` ${tall.length} chunk(s) are taller than the frame and are read by scrolling:`
    : '';
  const tallLines = tall
    .slice()
    .sort((a, b) => b.h - a.h)
    .map(b => `  #${b.id} (${b.tag}${b.width ? ', .' + b.width : ''}) – ${b.h} px`
      + ` in a ${b.vpH} px frame, walked from beat ${b.beat}.`);
  if (!clipped.length) {
    console.log(`[check-fit] ${states} state(s) at ${where}: every slide that fits the frame is inside it.${tallNote}`);
    for (const line of tallLines) console.log(line);
    return 0;
  }
  console.error(`[check-fit] ${states} state(s) at ${where}: ${clipped.length} slide(s) fit the frame`
    + ` and are positioned outside it.${tallNote}`);
  for (const line of tallLines) console.error(line);
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

// What the figures' type came out at, said once for the deck. It is a note
// and never an exit code: a drawing the room cannot read is a defect, but it
// is not the defect this command promises to police, and turning it into a
// failure would make --check-fit refuse decks it used to pass over a rule
// they were never written against.
//
// Two numbers, because "small" is two different complaints. Under
// FIG_TYPE_FLOOR_PX is absolute - the back row is guessing whatever else is
// on the slide. Under 0.8 of the body is relative: the slide's own words are
// legible and its figure is not, which is the inconsistency the width rule
// removed and the one thing that can bring it back (a container measured in
// the same ems as the type - see figureCapProbe).
//
// And, since the canvas, a third: how much of the box the slide reserved the
// drawing actually took. That one is measured rather than computed - the
// build says the same thing statically as `figure-overflows-canvas` and
// `figure-underfills-canvas` - but the two are worth having side by side,
// because this half sees a figure inside a card or a pane that the static
// half measures against the chunk's column.
// A cover slide is not measured against the deck's body type, in either
// direction: it neither sets the median nor is compared with it. Its words
// are the composition's - the title pair, the credit block, a quotation in a
// field - and there is no `.chunk-body` on it at all, so what the probe reads
// back is the content box's own font size, which is a different quantity
// wearing the same name. Counting it moved the median, and comparing a cover
// with it printed "#title settles at 20 px, 38% under the deck - its figure
// is what took the slide down" about a slide whose figure IS the cover's
// picture and whose type nothing took down.
const isCoverSlide = (tag) => tag === 'title' || tag === 'closing';

function reportFigureType(figType, bodySeen, where) {
  if (!figType.size) return;
  const rows = [...figType.entries()].map(([id, f]) => ({ id, ...f, ratio: f.bodyPx ? f.px / f.bodyPx : 0 }));
  const ratios = rows.map(f => f.ratio).filter(r => r > 0).sort((a, b) => a - b);
  const behind = rows.filter(f => f.ratio && f.ratio < 0.8).sort((a, b) => a.ratio - b.ratio);
  const tiny = rows.filter(f => f.px < FIG_TYPE_FLOOR_PX && !(f.ratio < 0.8)).sort((a, b) => a.px - b.px);
  console.log(`[check-fit] ${rows.length} chunk(s) with a figure at ${where}: base labels run`
    + ` ${ratios[0].toFixed(2)}x to ${ratios[ratios.length - 1].toFixed(2)}x of the body type beside them`
    + `${behind.length || tiny.length ? '.' : ', and none is under ' + FIG_TYPE_FLOOR_PX + ' px.'}`);
  // The canvas, per figure, sorted by how badly it is used - a line a reader
  // can run down to see whether a deck's figure slides are one deck.
  const onCanvas = rows.filter(f => f.canvas).sort((a, b) => a.canvas.fill - b.canvas.fill);
  if (onCanvas.length) {
    const scaled = onCanvas.filter(f => f.canvas.over);
    // "Reads empty" is the static `figure-underfills-canvas` measured, so it
    // is judged the same way: a picture slide's tall canvas is room to grow,
    // and its drawing is held against the ordinary sixteen-label height. The
    // percentage printed stays the share of the canvas actually reserved,
    // which is why a picture slide reads lower in the range above.
    const judged = (f) => {
      if (f.canvas.tier !== 'picture') return f.canvas.fill;
      const h = Math.min(f.canvas.h, figureRefCanvasH(f.tag, f.canvas.ft));
      return Math.round(100 * (f.canvas.cw * f.canvas.ch) / (f.canvas.w * h));
    };
    const empty = onCanvas.filter(f => !f.canvas.over && judged(f) < Math.round(FIG_UNDERFILL * 100));
    console.log(`  ${onCanvas.length} of them are on a canvas and take`
      + ` ${onCanvas[0].canvas.fill}% to ${onCanvas[onCanvas.length - 1].canvas.fill}% of it`
      + `${scaled.length ? `; ${scaled.length} had to be scaled past it.` : ', and none had to be scaled past it.'}`);
    // **How much room each figure has left, per axis.** The two complaints
    // above speak about a figure that has already gone wrong – past its
    // canvas, or so far inside it that the slide reads empty – and the
    // question an author has *before* either happens is "can I put another row
    // in this one". Both boxes were in hand and the report never said.
    //
    // One line per figure, and the two complaints ride that one line rather
    // than getting a second: two lines about one slide is how a report stops
    // being read. In base labels, because that is the unit the canvas is
    // defined in and the unit `frame WxH` is written in, so a number here is a
    // number the author can act on. Room is the canvas minus the drawing and
    // is signed: negative is the overflow, and the clause at the end of the
    // line says so rather than leaving a minus sign to carry it.
    //
    // Sorted by the tighter of a figure's two axes, so the list reads as a
    // queue – whatever stands at the top is what the next edit breaks first.
    const lab = (n) => (n / DG_FONT).toFixed(1);
    const room = (f) => Math.min(f.canvas.w - f.canvas.cw, f.canvas.h - f.canvas.ch);
    const byRoom = [...onCanvas].sort((a, b) => room(a) - room(b));
    console.log('  room left on each – the canvas minus the drawing, in base labels and in px, so a'
      + ' figure at 0.0 across is one column from overflowing:');
    for (const f of byRoom) {
      const dw = f.canvas.w - f.canvas.cw, dh = f.canvas.h - f.canvas.ch;
      // Both units, the way `figure-overflows-canvas` says the same thing
      // statically: one decimal of a base label hides up to seven px, and a
      // figure near zero is exactly where the number is read.
      const axis = (px, which) => `${lab(px)} ${which} (${Math.round(px)} px)`;
      console.log(`  #${f.id} (${f.tag}${f.width ? ', .' + f.width : ''})`
        + ` – canvas ${lab(f.canvas.w)} x ${lab(f.canvas.h)},`
        + ` drawing ${lab(f.canvas.cw)} x ${lab(f.canvas.ch)},`
        + ` room ${axis(dw, 'across')} and ${axis(dh, 'down')}`
        + (f.canvas.over
          ? `; past its canvas, so this slide settles at ${f.bodyPx} px of body type rather than the deck's own.`
          : empty.includes(f)
            ? `; ${f.canvas.fill}% of the canvas, so the slide reads empty.`
            : '.'));
    }
  }
  for (const f of behind) {
    console.log(`  #${f.id} (${f.tag}${f.width ? ', .' + f.width : ''}) – base label ${f.px} px against`
      + ` ${f.bodyPx} px of body type (${f.ratio.toFixed(2)}x)${f.min && f.min < f.px ? `, smallest on the drawing ${f.min} px` : ''}.`
      + ` A figure is sized from the type it stands in and capped by its box, so this one is at its box:`
      + ` fewer grid units, shorter labels, or more room for it.`);
  }
  // One line for the whole class, not one per chunk: every member of it says
  // the same thing, and it is not a sentence about the figure. The labels
  // match the words beside them and both are small, so what is small is the
  // slide - auto-fit answering the rest of what is on it.
  if (tiny.length) {
    const names = tiny.slice(0, 6).map(f => '#' + f.id).join(', ');
    console.log(`  ${tiny.length} figure(s) are under ${FIG_TYPE_FLOOR_PX} px and match the body type`
      + ` beside them (${tiny[0].px} px at the smallest): the slide is small, not the drawing –`
      + ` ${names}${tiny.length > 6 ? ', …' : ''}.`);
  }

  // The third number, and it is about the deck rather than about a figure.
  // A drawing capped at its column pulls its own slide's type down and
  // nothing else's, so what the room sees is a heading that changes size
  // between consecutive slides - measured on a keynote, 25 px against 44 px
  // in the same width class. Neither reading above can see that: both compare
  // a figure with the words beside it, and on a shrunken slide those agree
  // perfectly. So compare each slide with the deck's own median instead.
  // With a canvas this is the proof rather than the complaint: a figure that
  // fits its canvas settles at the same body type as every other figure
  // slide, so a spread here is a list of the figures that did not fit.
  const all = [...bodySeen.values()].filter(v => v > 0).sort((a, b) => a - b);
  if (all.length < 3) return;
  const median = all.length % 2 ? all[(all.length - 1) / 2]
    : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
  const under = rows.filter(f => !isCoverSlide(f.tag) && f.bodyPx > 0 && f.bodyPx < median * FIG_TYPE_EVEN_TOL)
    .sort((a, b) => a.bodyPx - b.bodyPx);
  console.log(`  the deck's body type settles between ${all[0]} and ${all[all.length - 1]} px,`
    + ` median ${median} px${under.length ? '.' : ', and no slide with a figure is more than '
      + Math.round((1 - FIG_TYPE_EVEN_TOL) * 100) + '% under it.'}`);
  for (const f of under) {
    console.log(`  #${f.id} (${f.tag}${f.width ? ', .' + f.width : ''}) settles at ${f.bodyPx} px,`
      + ` ${Math.round(100 * (1 - f.bodyPx / median))}% under the deck - its figure is what took the`
      + ` slide down.`
      + (f.canvas
        ? (f.canvas.over
          ? ' It is over its canvas: less in the drawing, or  frame WxH  on this figure.'
          : ' It is inside its canvas, so what took the slide down is the rest of what is on it.')
        : ' It is not on a canvas (frame: none, or a figure in a card, a pane or a divider), so'
          + ' {.figure-type-N} on this chunk is how one slide answers that without moving the rest.'));
  }
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
      if (seg && seg !== el && seen(seg) && seg.hasAttribute('data-explicit')
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
    } else if (cl.contains('dock')) {
      put('[', 'dock · ' + slots(el, 'dock-') + (el.hasAttribute('data-inherited') ? ' · inherited' : ''));
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
    middle: art.hasAttribute('data-middle'),
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
    lang: document.documentElement.lang || 'en',
    collapse: document.body.dataset.collapse || '',
    mode: document.body.dataset.mode || '',
    // The live slide's, which is what the room sees: <html> may still be
    // catching up with it (showZoom in the runtime).
    zoom: getComputedStyle(document.querySelector('.chunk.active') || document.documentElement).getPropertyValue('--zoom').trim(),
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
  w('true of it: the cover or divider composition, .bare, .center or .middle,');
  w('how many beats it has, how long its speaker note is. Notes are counted');
  w('and never quoted - they are the one thing certainly not on the');
  w('projection, and print-notes.html is the file for reading them.');
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
      c.bare ? '.bare' : '', c.center ? '.center' : '', c.middle ? '.middle' : '',
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

  // The audience view's <title> suffix follows `lang:` now, so the strip has
  // to read the same table the build wrote it from – a `de` squint should not
  // carry " – Vorlesung" into its report title.
  const S = lectureStrings({ lang: meta.lang });
  const suffixRe = new RegExp('\\s+–\\s+' + S['title-lecture'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  const doc = {
    // The audience view's <title> is the lecture's name plus " – lecture" (or
    // its localised form), which is right in a browser tab and reads as a
    // typo at the head of a file that says what it is on the next line.
    title: (meta.title || '').replace(suffixRe, '')
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
  writeOutputFile(outPath, text);
  const bodyless = chunks.filter(c => c.tag !== 'section' && !squintPaintsBody(c)).length;
  console.log('[squint] ' + chunks.length + ' slide(s) over ' + states + ' state(s) at '
    + doc.viewport + ' → ' + (path.relative(process.cwd(), outPath) || outPath)
    + (bodyless ? '; ' + bodyless + ' paint a heading and nothing else.' : '.'));
  return 0;
}

// ── PDF export (--slides-pdf, --print-pdf, --print-notes-pdf) ────────
//
// The sizes, the fit ceiling and every check on a value live in pdf-core.mjs,
// so the command line and the desktop app refuse the same values with the same
// words. What stays here is argv: the `--name=value` form, which exports were
// asked for, and the combinations that would do nothing.

// The three exports, each named after the view it prints and writing a file
// named after it beside the source - slides.pdf being the exception that was
// there first.
const PDF_EXPORTS = [
  { flag: '--slides-pdf', view: 'audience.html', file: 'slides.pdf' },
  { flag: '--print-pdf', view: 'print.html', file: 'print.pdf' },
  { flag: '--print-notes-pdf', view: 'print-notes.html', file: 'print-notes.pdf' },
];
// What only the slide deck reads. --pdf-dump-dom is the test's and is
// documented nowhere, but it is a slide option all the same.
const SLIDE_PDF_OPTIONS = ['--pdf-beats', '--pdf-size', '--pdf-zoom', '--pdf-zoom-max',
  '--pdf-collapse', '--pdf-dump-dom'];

// A --pdf-* value flag, in the `--name=value` form. The older value flags in
// this CLI take a separate argument (--port 8080); these do not, because a
// separate argument has to be excluded from `positional` by hand and that
// list is the kind that grows a hole.
function pdfFlagValue(argv, name) {
  const hit = argv.filter(a => a === name || a.startsWith(name + '='));
  if (!hit.length) return null;
  const last = hit[hit.length - 1];
  if (last === name) {
    const err = new Error(`Error: ${name} needs a value, as ${name}=<value>.`);
    err.userFacing = true;
    throw err;
  }
  return last.slice(name.length + 1);
}
const pdfFlagGiven = (argv, name) => argv.some(a => a === name || a.startsWith(name + '='));
const joinFlagNames = (names) => names.length < 2
  ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function pdfUsageError(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  return err;
}

// Everything --slides-pdf was told, refused early and in one place. A bad
// value here is a typo, and a typo that reaches the browser costs a minute
// before it says so.
function pdfOptionsFrom(argv, absIn) {
  const resolved = resolvePdfOptions({
    beats: pdfFlagValue(argv, '--pdf-beats'),
    size: pdfFlagValue(argv, '--pdf-size'),
    zoomMax: pdfFlagValue(argv, '--pdf-zoom-max'),
    zoom: pdfFlagValue(argv, '--pdf-zoom'),
    collapse: pdfFlagValue(argv, '--pdf-collapse'),
  });
  const outArg = pdfFlagValue(argv, '--pdf-out');
  return {
    ...resolved,
    audienceHtml: path.join(path.dirname(absIn), 'audience.html'),
    out: outArg ? path.resolve(outArg) : path.join(path.dirname(absIn), 'slides.pdf'),
    dumpDom: pdfFlagValue(argv, '--pdf-dump-dom'),
  };
}

// Which PDFs the command asked for, or null for none - and every flag that
// would otherwise do nothing, refused by name, the way the --prompter-*
// settings are. In this order: --watch first, as it always was for
// --slides-pdf; then an option with no export to read it; then --pdf-out
// with more than one file to name; then the slide values.
function pdfJobsFrom(argv, flags, absIn) {
  const asked = PDF_EXPORTS.filter(e => flags.has(e.flag));
  const names = asked.map(e => e.flag);
  const slideOpts = SLIDE_PDF_OPTIONS.filter(name => pdfFlagGiven(argv, name));

  if (!asked.length) {
    if (slideOpts.length) {
      throw pdfUsageError(
        `Error: ${joinFlagNames(slideOpts)} without --slides-pdf.\n`
        + '  It sets how the slide deck is printed, and no slide deck is being printed –\n'
        + '  on its own it changes nothing about the build.\n'
        + `  node build.js <source.md> --slides-pdf ${slideOpts.map(n => argv.filter(a => a === n || a.startsWith(n + '=')).pop()).join(' ')}`);
    }
    if (pdfFlagGiven(argv, '--pdf-out')) {
      throw pdfUsageError(
        'Error: --pdf-out without a PDF to write.\n'
        + '  It names the file --slides-pdf, --print-pdf or --print-notes-pdf writes,\n'
        + '  and none of them was asked for, so on its own it changes nothing.');
    }
    return null;
  }

  if (flags.has('--watch')) {
    throw pdfUsageError(
      `Error: ${joinFlagNames([...names, '--watch'])} are mutually exclusive.\n`
      + '  --watch rebuilds on every save and keeps running; the export drives a\n'
      + '  browser over one finished build and exits. Run the export when you are\n'
      + '  done authoring, or in a second terminal.');
  }
  if (!flags.has('--slides-pdf') && slideOpts.length) {
    throw pdfUsageError(
      `Error: ${joinFlagNames(slideOpts)} without --slides-pdf.\n`
      + '  It sets how the slide deck is printed. '
      + `${joinFlagNames(names)} ${names.length > 1 ? 'print documents' : 'prints a document'} on\n`
      + '  the paper its view\'s own @page rule sets, and takes no options.');
  }
  if (asked.length > 1 && pdfFlagGiven(argv, '--pdf-out')) {
    throw pdfUsageError(
      `Error: --pdf-out names one file, and ${joinFlagNames(names)} write ${asked.length}.\n`
      + `  Drop --pdf-out and they are written beside source.md as ${joinFlagNames(asked.map(e => e.file))},\n`
      + '  or run one export per command.');
  }

  const dir = path.dirname(absIn);
  const outArg = asked.length === 1 ? pdfFlagValue(argv, '--pdf-out') : null;
  return {
    slides: flags.has('--slides-pdf') ? pdfOptionsFrom(argv, absIn) : null,
    documents: asked.filter(e => e.flag !== '--slides-pdf').map(e => ({
      flag: e.flag,
      html: path.join(dir, e.view),
      out: outArg ? path.resolve(outArg) : path.join(dir, e.file),
    })),
  };
}

// ── the command line's flags ─────────────────────────────────────────
//
// Every flag main() reads, in one table, and a word the table does not hold is
// refused with the nearest name: an unknown flag used to build an ordinary
// deck and exit 0 (`--wacth`, `--check-fitt`, `--check-fit=true`), the silent
// no-op each of the specific refusals in main() was written after. Those stay,
// because they explain more. The --help text is generated from these rows, and
// test/gates/cli.mjs holds the table against every flag main() reads and
// against CLAUDE.md's commands block. The two constants between the markers
// are plain literals, because that gate reads them out of this file as text.
//
//   value    absent: a switch, and `--name=x` is refused;
//            'next': the value is the next word (--port 8080), required;
//            'optional': the next word, unless it is a flag or names a .md
//              file (--frames [DIR]); with `accepts`, only a word ending in
//              it (--prompter-debrief [LOG] takes a .jsonl and leaves a
//              lecture folder after it to be the source);
//            'equals': one word, `--name=value` (the --pdf-* options).
//   need     what the value is, for the refusal when it is missing.
//   needs    refused unless one of these is given too – nothing else reads it.
//            Not set where main() has a refusal of its own that says more.
//   mode     a command of its own that returns before the build; `takes` is
//            the only company it keeps, `does` what it does instead.
//   notWith  refused together with these.
//   hidden   read and checked, documented in neither --help nor CLAUDE.md.
//   doc      the --help rows: [label, line, …]; the first line beside the
//            label. Without one, the row is the name and its arg.
// cli-flags:start
const CLI_GROUPS = [
  { id: 'build', title: ['Building and watching:'] },
  { id: 'images', title: ['Image inlining (default: auto – inline iff referenced images sum < 10 MB; per-image cap 2 MB):'] },
  { id: 'optimize', title: ['Image optimisation (converts referenced PNG/JPEG to WebP q92, replacing the',
    'originals; needs cwebp or magick on PATH):'] },
  { id: 'fit', title: ['Fit checking (needs playwright-core and a Chrome or Chromium):'] },
  { id: 'squint', title: ['Reading the projection back (needs playwright-core and a Chrome or Chromium):'] },
  { id: 'prompter', title: ['Live prompter (only together with --watch or --present; the cockpit reaches it',
    'over the watch socket, and Shift-S in the cockpit switches it on – in Chrome).',
    'What it sends is text: the deck including speaker notes, and what the cockpit',
    'hears. The prompter sends no audio; Chrome\'s speech recognition sends the audio',
    'to Google unless it runs on the device.'],
  rows: [
    ['OPENROUTER_API_KEY', 'the key. Without it, and without the key file below,',
      'the prompter runs dry and says so.'],
    ['the key file', '~/.config/psi-slides/openrouter.key ($XDG_CONFIG_HOME',
      'if set), read when the environment has none: the key',
      'alone or OPENROUTER_API_KEY=…, mode 600. Nothing else',
      'is read from it, and no .env from anywhere.'],
    ['OPENROUTER_BASE_URL', 'another OpenAI-compatible endpoint',
      '(default https://openrouter.ai/api/v1).'],
  ] },
  { id: 'events', title: ['Driving the build from another program:'] },
  { id: 'slides-pdf', title: ['PDF slide export (a fallback deck; print.html stays the document):'],
    foot: ['Needs a Chromium (playwright-core, $PSI_CHROME or a system Chrome).'] },
  { id: 'doc-pdf', title: ['PDF document export (print.html on paper, at its own A4 page, margins and numbers):'],
    foot: ['Any of the three PDF flags combine and start one browser. --pdf-out names the',
      'file when exactly one is asked for; the --pdf-* options above are the slides\'.'] },
  { id: 'annotations', title: ['Annotation integration:'] },
  { id: 'new', title: ['A new lecture:'] },
  { id: 'help', title: ['This text:'] },
];

const CLI_FLAGS = [
  { name: '--present', group: 'build',
    doc: [null, 'give or rehearse the talk: --watch --serve --open in one, plus',
      '--prompter when the lecture has a `prompter:` block or the line',
      'names --prompter, --prompter-dry-run or --prompter-model. The',
      'port is the lecture\'s own, so a restart keeps the address.'] },
  { name: '--watch', group: 'build',
    doc: [null, 'rebuild on every save and reload the views open in a browser.'] },
  { name: '--serve', group: 'build',
    doc: [null, 'serve the lecture folder over http on loopback once it is built;',
      'with --watch, live reload over http. A hosted embed (YouTube)',
      'plays only from http.'] },
  { name: '--port', group: 'build', value: 'next', arg: 'N', needs: ['--serve', '--present'],
    need: 'a port number, e.g. --port 8080; leave it out and the lecture\'s own is used.',
    why: 'It sets the port --serve listens on',
    doc: [null, 'the port --serve listens on. Default: the lecture\'s own, from',
      'where its source.md is (41000-44999), or one of the next few',
      'when another program has it.'] },
  { name: '--open', group: 'build', needs: ['--watch', '--serve', '--present'],
    why: 'It opens what a watching or serving run has built',
    doc: [null, 'open the cockpit in a browser once it is built – Chrome',
      'under --prompter. A browser that does not start costs a line,',
      'not the run.'] },
  { name: '--audience-only', group: 'build', doc: [null, 'build audience.html and nothing else.'] },
  { name: '--print-only', group: 'build', doc: [null, 'build print.html and nothing else.'] },
  { name: '--print-notes-only', group: 'build', doc: [null, 'build print-notes.html and nothing else.'] },
  { name: '--speaker-only', group: 'build', doc: [null, 'build speaker.html and nothing else.'] },

  { name: '--inline-images', group: 'images', doc: [null, 'force inlining regardless of total size'] },
  { name: '--no-inline-images', group: 'images', doc: [null, 'force external asset paths'] },
  { name: '--no-optimize-images', group: 'images',
    doc: [null, 'inline PNG/JPEG as they are, rather than', 're-encoding them to WebP for the output'] },

  { name: '--optimize-images', group: 'optimize', mode: true,
    takes: ['--dry-run', '--all', '--max-width'],
    does: 'converts the referenced pictures and exits; it builds nothing',
    doc: [null, 'convert referenced rasters ≥ 512 KB'] },
  { name: '--dry-run', group: 'optimize', needs: ['--optimize-images'],
    why: 'It says what --optimize-images should only report',
    doc: [null, 'report what would change, write nothing'] },
  { name: '--all', group: 'optimize', needs: ['--optimize-images'],
    why: 'It widens what --optimize-images converts',
    doc: [null, 'convert every referenced raster, not just large ones'] },
  { name: '--max-width', group: 'optimize', value: 'next', arg: 'N', needs: ['--optimize-images'],
    need: 'a pixel value of at least 320, e.g. --max-width 2600.',
    why: 'It caps the width --optimize-images writes',
    doc: [null, 'also downscale to N px wide. Off by default on purpose:',
      'figure focus zooms to 8x, so a high-resolution diagram',
      'is high-resolution for a reason.'] },

  { name: '--check-fit', group: 'fit', notWith: ['--watch'],
    does: 'looks at one finished build and exits',
    doc: [null, 'after building, walk audience.html state by state at',
      '1600x900 and report any slide whose content leaves the',
      'frame. Exit 2 if one does. The density budgets are word',
      'counts, so cards and rows can overflow with a clean lint.',
      'It also reports the deck\'s median settled body type and',
      'names every slide with a figure more than 15% under it,',
      'and gives each figure its canvas, its drawing and the room',
      'left per axis in base labels, tightest first.'] },
  { name: '--viewport', group: 'fit', value: 'next', arg: 'WxH',
    needs: ['--check-fit', '--squint', '--frames'],
    need: 'WIDTHxHEIGHT, e.g. --viewport 1600x900.',
    why: 'It sets the size --check-fit, --squint and --frames measure at',
    doc: [null, 'measure at another size (default 1600x900, a 16:9 room).'] },

  { name: '--squint', group: 'squint', notWith: ['--watch'],
    does: 'reads one finished build back and exits',
    doc: [null, 'after building, walk audience.html state by state and write',
      'what a room would see – heading, topic sentences, promoted',
      'bolds, what stays whole, what the collapse withholds – to',
      'squint.txt beside the source. Never fails a build.'] },
  { name: '--frames', group: 'squint', value: 'optional', arg: '[DIR]', notWith: ['--watch'],
    does: 'photographs one finished build and exits',
    doc: [null, 'after building, write every state of audience.html as a PNG',
      'plus contact sheets of eight to DIR (default: frames/ beside',
      'the source). The review --check-fit and --squint cannot do.'] },
  { name: '--squint-out', group: 'squint', value: 'next', arg: 'PATH', needs: ['--squint'],
    need: 'a path, or "-" for stdout.',
    why: 'It names the file --squint writes',
    doc: [null, 'write it somewhere else; "-" writes to stdout.'] },

  { name: '--prompter', group: 'prompter',
    doc: [null, 'run the prompter sidecar beside the watch build.'] },
  { name: '--prompter-model', group: 'prompter', value: 'next', arg: 'ID',
    need: 'an OpenRouter model id, e.g. anthropic/claude-sonnet-5.',
    doc: [null, 'an OpenRouter model id, overriding the deck\'s',
      '`prompter: model:` and the default.'] },
  { name: '--prompter-dry-run', group: 'prompter',
    doc: [null, 'everything but the call: the ear, the ticks, the',
      'policy and the log all run, nothing goes to a',
      'model, and no key is needed.'] },
  { name: '--prompter-replay', group: 'prompter', value: 'next', arg: 'FILE', mode: true, takes: [],
    need: 'a prompter-*.jsonl written by an earlier run.\n'
      + '  node build.js <source.md> --prompter-replay prompter-20260911-1015.jsonl',
    does: 'reads a finished run\'s log back and exits; it builds nothing',
    doc: [null, 'no watcher and no browser: read a run\'s',
      'prompter-*.jsonl (or an older souffleuse-*.jsonl)',
      'back and print, per answer, what the model',
      'proposed and what the policy would do now.'] },
  { name: '--prompter-debrief', group: 'prompter', value: 'optional', accepts: '.jsonl', arg: '[LOG]',
    mode: true, takes: ['--transcript', '--no-replay'],
    does: 'reads a finished run\'s log back and exits; it builds nothing',
    doc: [null, 'no watcher and no browser: read a run\'s log and',
      'print the clock, the time table against the @mm:ss',
      'marks in the notes, what the prompter whispered and',
      'held back, then the replay. LOG defaults to the',
      'newest log beside source.md that is not a dry run.'] },
  { name: '--transcript', group: 'prompter', needs: ['--prompter-debrief'],
    why: 'It says what --prompter-debrief prints',
    doc: [null, 'with --prompter-debrief: only the spoken words, per',
      'slide with the talk clock, from the clock\'s start on.'] },
  { name: '--no-replay', group: 'prompter', needs: ['--prompter-debrief'],
    why: 'It says what --prompter-debrief prints',
    doc: [null, 'with --prompter-debrief: leave the replay out.'] },

  { name: '--events', group: 'events',
    doc: [null, 'emit build events as JSON lines on stdout and accept',
      'commands on stdin; for tools that drive the build.'] },

  { name: '--slides-pdf', group: 'slides-pdf',
    doc: [null, 'drive audience.html through every beat and print slides.pdf'] },
  { name: '--pdf-beats', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-beats=all', 'one page per state, cumulative (default)'],
    more: [['--pdf-beats=final', 'one page per chunk, fully built up']] },
  { name: '--pdf-size', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-size=16:9', '1600x900 css px, a 1200x675 pt page (default)'],
    more: [['--pdf-size=16:10', '1600x1000 css px, a 1200x750 pt page']] },
  { name: '--pdf-zoom', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-zoom=fit', 'size each chunk to the page, never above 1.35 (default)'],
    more: [['--pdf-zoom=<n>', 'hold every page at that zoom (0.6-2.2) and report overruns']] },
  { name: '--pdf-zoom-max', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-zoom-max=<n>', 'largest zoom the fit may reach (default 1.35). Raise it to',
      'fill more of each page, lower it to keep the type even'] },
  { name: '--pdf-collapse', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-collapse=topic-bold', 'only the slide text: topic sentences and bolds'],
    more: [['--pdf-collapse=none', 'the full prose. Default: whatever the lecture opens with']] },
  { name: '--pdf-out', group: 'slides-pdf', value: 'equals',
    doc: ['--pdf-out=<path>', 'default: slides.pdf beside source.md'] },
  // The PDF export test's and the desktop parity step's: the print DOM, dumped.
  { name: '--pdf-dump-dom', group: 'slides-pdf', value: 'equals', hidden: true },

  { name: '--print-pdf', group: 'doc-pdf',
    doc: [null, 'print print.html to print.pdf beside source.md'] },
  { name: '--print-notes-pdf', group: 'doc-pdf',
    doc: [null, 'print print-notes.html to print-notes.pdf'] },

  { name: '--integrate-annotations', group: 'annotations', mode: true, takes: [],
    does: 'rewrites source.md and exits; it builds nothing',
    doc: [null, 'move `> annot:` blocks from a trailing',
      '<!-- annotations:start --> … :end marker block',
      'into their chunks and remove the marker block.'] },

  { name: '--new', group: 'new', mode: true, takes: ['--into'],
    does: 'writes a new lecture folder and exits; it builds nothing',
    doc: ['--new SLUG', 'write SLUG/source.md with valid frontmatter and example',
      'chunks, plus SLUG/assets/, in lectures/ by default.'] },
  { name: '--into', group: 'new', value: 'next', arg: 'DIR', needs: ['--new'],
    need: 'a directory: node build.js --new <slug> --into <dir>',
    why: 'It says where --new writes the lecture folder',
    doc: [null, 'write the folder into DIR instead.'] },

  { name: '--help', group: 'help',
    doc: ['--help, -h', 'print this text to stdout. Before anything else is read,',
      'so it can stand anywhere on the line.'] },
];
// cli-flags:end

const CLI_FLAG = new Map(CLI_FLAGS.map(f => [f.name, f]));

function cliError(msg) {
  const err = new Error(msg);
  err.userFacing = true;
  return err;
}

const cliLabel = (f) => f.name + (!f.arg ? '' : f.value === 'equals' ? '=' + f.arg : ' ' + f.arg);

// The --help text, from the table. The usage block at its head is the one
// hand-written part: a synopsis of the commands, not a list of flags.
function helpText() {
  const out = [
    'Usage:',
    '  node build.js <source.md> --present [--port N] [--prompter-dry-run] [--prompter-model ID]',
    '  node build.js <source.md> [--watch] [--serve [--port N]] [--open] [--audience-only|--print-only|--print-notes-only|--speaker-only]',
    '                            [--inline-images|--no-inline-images] [--no-optimize-images] [--events]',
    '  node build.js <source.md> --watch --prompter [--prompter-model ID] [--prompter-dry-run]',
    '  node build.js <source.md> --check-fit [--viewport 1600x900]',
    '  node build.js <source.md> --squint [--squint-out PATH] [--viewport 1600x900]',
    '  node build.js <source.md> --frames [DIR] [--viewport 1600x900]',
    '  node build.js <source.md> --slides-pdf [--pdf-beats=all|final] [--pdf-size=16:9|16:10]',
    '                                         [--pdf-zoom=fit|<n>] [--pdf-zoom-max=<n>]',
    '                                         [--pdf-collapse=topic-bold|none] [--pdf-out=<path>]',
    '  node build.js <source.md> --print-pdf|--print-notes-pdf [--pdf-out=<path>]',
    '  node build.js <source.md> --prompter-replay FILE',
    '  node build.js <source.md> --prompter-debrief [LOG] [--transcript | --no-replay]',
    '  node build.js <source.md> --integrate-annotations',
    '  node build.js <source.md> --optimize-images [--dry-run] [--all] [--max-width N]',
    '  node build.js --new <slug> [--into <dir>]',
    '  node build.js --help',
    '',
    '<source.md> may also be the folder that holds it.',
  ];
  for (const g of CLI_GROUPS) {
    const rows = [];
    for (const f of CLI_FLAGS) {
      if (f.group !== g.id || f.hidden) continue;
      const [label, ...lines] = f.doc || [null];
      rows.push([label || cliLabel(f), ...lines]);
      for (const more of f.more || []) rows.push(more);
    }
    rows.push(...(g.rows || []));
    const width = Math.max(22, ...rows.map(r => r[0].length + 2));
    out.push('', ...g.title);
    for (const [label, first = '', ...rest] of rows) {
      out.push(('  ' + label.padEnd(width) + first).trimEnd());
      for (const line of rest) out.push('  ' + ' '.repeat(width) + line);
    }
    for (const line of g.foot || []) out.push('  ' + line);
  }
  return out.join('\n') + '\n';
}

// Optimal string alignment distance: Levenshtein plus one transposition, so
// `--wacth` is one step from `--watch` rather than two.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// The known name an unknown word was most likely meant to be, or null. Close
// by edit distance, or the one name the word begins (`--integrate`).
function nearestFlag(word) {
  const w = '--' + word.replace(/^-+/, '').toLowerCase();
  const names = CLI_FLAGS.filter(f => !f.hidden).map(f => f.name);
  let best = null;
  let bestD = Infinity;
  for (const n of names) {
    const dist = editDistance(w, n);
    if (dist < bestD) { best = n; bestD = dist; }
  }
  // Two edits at most for a short name, a fifth of a long one, and never
  // more than half of what was typed: `-w` is too little to guess from.
  if (best && bestD <= Math.max(2, Math.floor(best.length / 5))
      && bestD <= Math.floor((w.length - 2) / 2)) return best;
  const starts = w.length >= 6 ? names.filter(n => n.startsWith(w)) : [];
  return starts.length === 1 ? starts[0] : null;
}

// argv into flags, values and the words that are not flags, refusing every
// word that is not in the table and every value in the wrong form. Nothing
// here knows what a flag does; the combinations are refused by
// refuseCombinations below.
function parseCommandLine(argv) {
  const flags = new Set();
  const values = new Map();
  const positional = [];
  const isFlag = (w) => typeof w === 'string' && (w.startsWith('--') || w === '-h');
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (word === '-h') { flags.add('--help'); continue; }
    if (!(word.length > 1 && word.startsWith('-'))) { positional.push(word); continue; }
    const eq = word.startsWith('--') ? word.indexOf('=') : -1;
    const name = eq > 0 ? word.slice(0, eq) : word;
    const given = eq > 0 ? word.slice(eq + 1) : null;
    // The prompter was built as the Souffleuse, and its flags carried that
    // name until 2.0.0 gave it its public one. Said with the new name rather
    // than as a typo of the nearest flag.
    if (/^--souffleuse(-|$)/.test(name)) {
      throw cliError(`${name} is not a flag any more: the live prompter's flags are\n`
        + '  --prompter, --prompter-model, --prompter-dry-run, --prompter-replay and --prompter-debrief.\n'
        + `  ${name} is now ${name.replace('--souffleuse', '--prompter')}.`);
    }
    const f = CLI_FLAG.get(name);
    if (!f) {
      const near = nearestFlag(name);
      throw cliError(`Error: ${word} is not a flag of build.js.`
        + (near ? ` Did you mean ${near}${given !== null && CLI_FLAG.get(near).value ? (CLI_FLAG.get(near).value === 'equals' ? '=' : ' ') + given : ''}?` : '')
        + '\n  node build.js --help lists every flag.');
    }
    flags.add(name);
    if (f.value === 'equals') {
      if (given === null) throw cliError(`Error: ${name} needs a value, as ${name}=<value>.`);
      values.set(name, given);
      continue;
    }
    if (given !== null) {
      throw cliError(f.value
        ? `Error: ${name} takes its value as the next word: ${name} ${given}`
        : `Error: ${name} takes no value; write ${name} on its own.`);
    }
    if (f.value === 'next') {
      const v = argv[i + 1];
      if (v === undefined || isFlag(v)) {
        throw cliError(`Error: ${name} takes ${f.need}`
          + (v === undefined ? '' : `\n  ${v} is a flag, not its value.`));
      }
      values.set(name, v);
      i++;
    } else if (f.value === 'optional') {
      const v = argv[i + 1];
      if (v !== undefined && !isFlag(v) && !/\.md$/i.test(v)
          && (!f.accepts || v.toLowerCase().endsWith(f.accepts))) { values.set(name, v); i++; }
    }
  }
  return { flags, values, positional };
}

// The combinations the table can name: a mode with company it ignores, an
// option without the flag that reads it, two flags that cannot run together,
// more than one input. Each was an ordinary build and exit 0 before.
function refuseCombinations({ flags, values, positional }) {
  const given = (n) => n + (values.has(n) ? ' ' + values.get(n) : '');
  const modes = CLI_FLAGS.filter(f => f.mode && flags.has(f.name));
  if (modes.length > 1) {
    throw cliError(`Error: ${joinFlagNames(modes.map(m => m.name))} are separate commands; run one at a time.`);
  }
  if (modes.length) {
    const m = modes[0];
    const extra = [...flags].filter(n => n !== m.name && !m.takes.includes(n));
    if (extra.length) {
      throw cliError(`Error: ${joinFlagNames(extra)} ${extra.length > 1 ? 'do' : 'does'} nothing with ${m.name}.\n`
        + `  ${m.name} ${m.does}.\n`
        + `  Drop ${extra.length > 1 ? 'them' : 'it'}, or run the build as a second command.`);
    }
  }
  for (const f of CLI_FLAGS) {
    if (!flags.has(f.name) || !f.needs || f.needs.some(n => flags.has(n))) continue;
    const head = f.needs[0] === '--new' ? '--new <slug>' : '<source.md> ' + f.needs[0];
    throw cliError(`Error: ${f.name} without ${joinFlagNames(f.needs).replace(/ and (\S+)$/, ' or $1')}.\n`
      + `  ${f.why}, so on its own it changes nothing about the build.\n`
      + `  node build.js ${head} ${given(f.name)}`);
  }
  const clash = CLI_FLAGS.filter(f => flags.has(f.name) && (f.notWith || []).some(n => flags.has(n)));
  if (clash.length) {
    const other = clash[0].notWith.find(n => flags.has(n));
    throw cliError(`Error: ${joinFlagNames([...clash.map(f => f.name), other])} are mutually exclusive.\n`
      + `  ${joinFlagNames(clash.map(f => f.name))} ${clash.length > 1 ? 'each ' : ''}${clash[0].does}; `
      + `${other} keeps rebuilding.\n`
      + '  Run it in a second terminal, or when you are done authoring.');
  }
  if (positional.length > 1) {
    throw cliError(flags.has('--new')
      ? `Error: --new takes one slug, and was given ${positional.length}: ${positional.join(', ')}.`
      : `Error: build.js takes one source.md, and was given ${positional.length}: ${positional.join(', ')}.\n`
        + '  Build them one at a time.');
  }
}

// --present is a talk: all four views, rebuilt and served until Ctrl-C. A flag
// that builds one view would leave the others as an earlier run wrote them,
// and one that looks at a finished build and exits has nothing to look at in
// a run that does not finish.
const PRESENT_ONE_VIEW = ['--audience-only', '--print-only', '--print-notes-only', '--speaker-only'];
const PRESENT_EXITS = ['--check-fit', '--squint', '--frames', '--slides-pdf', '--print-pdf', '--print-notes-pdf'];
function refusePresentCompany({ flags }) {
  if (!flags.has('--present')) return;
  const one = PRESENT_ONE_VIEW.find(n => flags.has(n));
  if (one) {
    throw cliError(`Error: --present and ${one} cannot run together.\n`
      + `  --present builds all four views for a talk; ${one} would leave three of them as they were.\n`
      + `  For one view: node build.js <source.md> --watch --serve ${one}`);
  }
  const exits = PRESENT_EXITS.find(n => flags.has(n));
  if (exits) {
    throw cliError(`Error: --present and ${exits} cannot run together.\n`
      + `  ${exits} works on one finished build and exits; --present keeps rebuilding until Ctrl-C.\n`
      + '  Run it in a second terminal.');
  }
}

// Whether --present starts the prompter on its own: when the lecture has a
// `prompter:` block, which is its author saying the talk is given with one.
// A key on the machine is not enough – a talk given without the prompter
// should not start listening because a rehearsal of another one left a key.
function lectureWantsPrompter(absIn) {
  try {
    const fm = safeMatter(fs.readFileSync(absIn, 'utf8')).data || {};
    return fm.prompter != null;
  } catch (e) {
    return false;   // the build says what is wrong with the frontmatter
  }
}

// Whether the source is a `kind: document`, asked before anything is built
// so a flag that needs a projection is refused in one sentence. A
// frontmatter that does not read is not a document here; the build then
// says what is wrong with it.
function sourceIsDocument(absIn) {
  try {
    return isDocumentKind(safeMatter(fs.readFileSync(absIn, 'utf8')).data || {});
  } catch (e) {
    return false;
  }
}
// The flags that ask for something only a lecture has: a view other than
// print.html, an export or a probe of the projection, the prompter. On a
// document each was a build of nothing or of a stale file.
const DOCUMENT_REFUSES = ['--present', '--audience-only', '--speaker-only', '--print-notes-only',
  '--slides-pdf', '--print-notes-pdf', '--check-fit', '--squint', '--frames',
  '--prompter', '--prompter-dry-run', '--prompter-model'];
function refuseForDocument(flags, absIn) {
  const asked = DOCUMENT_REFUSES.filter(n => flags.has(n));
  if (!asked.length || !sourceIsDocument(absIn)) return;
  throw cliError(`Error: ${joinFlagNames(asked)} ${asked.length > 1 ? 'need' : 'needs'} a lecture, and this source is a document (kind: document).\n`
    + '  A document builds print.html alone: no projection, cockpit or notes view.\n'
    + '  node build.js <source.md> --print-pdf     the document and its PDF\n'
    + '  node build.js <source.md> --watch --serve --open   to write it with a live page');
}

// --open's target: the cockpit if there is one, else the projection; over
// http under --serve, as a file otherwise. A document's is its one view.
function openCockpit(rootDir, base, { chrome = false, document = false } = {}) {
  const name = (document ? ['print'] : ['speaker', 'audience']).find(n => fs.existsSync(path.join(rootDir, `${n}.html`)));
  if (!name) {
    console.log('Nothing to open yet: no speaker.html or audience.html was written.');
    return;
  }
  openInBrowser(base ? `${base}/${name}.html` : pathToFileURL(path.join(rootDir, `${name}.html`)).href, { chrome });
}

// The source.md a command names, or the one in the folder it names. Exits as
// "Input not found" always did; a folder without a source.md says what it
// holds instead of failing on EISDIR.
function resolveSourceArg(arg) {
  const abs = path.resolve(arg || '');
  let st = null;
  try { st = fs.statSync(abs); } catch { /* reported below */ }
  if (!arg || !st) {
    console.error(`Input not found: ${abs}`);
    process.exit(1);
  }
  if (!st.isDirectory()) return abs;
  const inside = path.join(abs, 'source.md');
  if (fs.existsSync(inside) && fs.statSync(inside).isFile()) {
    console.log(`Using ${path.join(arg, 'source.md')}.`);
    return inside;
  }
  let lectures = [];
  try {
    lectures = fs.readdirSync(abs, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(abs, d.name, 'source.md')))
      .map(d => d.name).sort();
  } catch { /* an unreadable folder holds nothing we can name */ }
  const shown = lectures.slice(0, 3).join(', ') + (lectures.length > 3 ? ', …' : '');
  console.error(`${arg} is a folder with no source.md in it.`
    + (lectures.length
      ? ` It holds ${lectures.length} lecture folder${lectures.length > 1 ? 's' : ''} (${shown});`
        + ` name one, e.g.\n  node build.js ${path.join(arg, lectures[0])}`
      : '\n  build.js takes one lecture\'s source.md, or the folder that holds it.'));
  process.exit(1);
}

// ── reading a run's log back (--prompter-replay, --prompter-debrief) ─

// A log a command names: as given, then – a relative path – beside
// source.md, and a bare file name also in an old/ folder there, where test
// runs used to be put by hand.
function resolveLogArg(arg, absIn, flag) {
  const dir = path.dirname(absIn);
  const tries = [path.resolve(arg)];
  if (!path.isAbsolute(arg)) tries.push(path.join(dir, arg));
  const bare = path.basename(arg) === arg;
  if (bare) tries.push(path.join(dir, 'old', arg));
  const hit = tries.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!hit) {
    throw cliError(`${flag}: no log ${arg}`
      + (bare ? ` here, beside ${shownPath(absIn)} or in its old/ folder.`
        : tries.length > 1 ? ` here or beside ${shownPath(absIn)}.` : '.'));
  }
  return hit;
}

function readLogLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n')
    .filter(l => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(Boolean);
}

// The log a debrief reads when none is named: the newest beside source.md
// that is not a dry run – named so since the name carries `-dry`, read so
// in a log from before (`pickDebriefLog`).
function newestLog(absIn, souff) {
  const dir = path.dirname(absIn);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* none */ }
  const dryByContent = (n) => {
    try { return souff.logIsDryRun(readLogLines(path.join(dir, n))); } catch { return false; }
  };
  const pick = souff.pickDebriefLog(names, dryByContent);
  if (!pick) {
    const dry = names.filter(n => souff.logNameFacts(n)).length;
    throw cliError(`No prompter log beside ${shownPath(absIn)}`
      + (dry ? ` but ${dry === 1 ? 'a dry run' : dry + ' dry runs'}; name one to read it:\n`
        + `  node build.js ${shownPath(absIn)} --prompter-debrief ${names.filter(n => souff.logNameFacts(n)).sort().pop()}`
        : '. A run with --prompter writes one there.'));
  }
  pickedLog = pick;
  return path.join(dir, pick.name);
}
let pickedLog = null;

// Every field below is the model's, the room's or the log's words, and a log
// is a file somebody may have sent along with the deck: printed through
// terminalSafe, so an escape sequence in any of them reaches the terminal as
// a space, and on one line, so a line break in one cannot forge another.
const logField = (x) => terminalSafe(String(x == null ? '' : x).replace(/\s+/g, ' ').trim());

function printReplay(absIn, logFile, souff, { formatClock }) {
  const settings = souffleuseSettings(safeMatter(fs.readFileSync(absIn, 'utf8')).data || {});
  const rows = souff.replayAnswers(readLogLines(logFile), { cooldown: settings.cooldown });
  console.log(`[replay] ${logField(path.basename(logFile))} · cooldown ${settings.cooldown}s`
    + ` · ${rows.length} answer(s) the model gave`);
  const t = logField;
  for (const r of rows) {
    const what = r.action === 'cue' ? `cue → #${t(r.target)}` : t(r.kind || r.action);
    console.log(`  ${String(r.n).padStart(3)} · ${formatClock(r.at)} · #${t(r.chunkId || '?')}`
      + ` · ${what}${r.text ? `: "${t(r.text)}"` : ''}`
      + `\n        → ${r.show ? 'shown' : 'held back (' + t(r.reason) + ')'}`
      + (r.why ? ` · the model: ${t(r.why)}` : ''));
  }
  const shown = rows.filter(r => r.show).length;
  console.log(`[replay] ${shown} would be whispered, ${rows.length - shown} held back.`);
}

// The wall clock of a log line, in this machine's time zone.
function logWallTime(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '--:--:--';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function printDebrief(absIn, logFile, souff, cards, { transcript = false, replay = true } = {}) {
  const { formatClock, notesToCards } = cards;
  const lines = readLogLines(logFile);
  const t = logField;
  const clock = (s) => formatClock(Number(s) || 0);
  const signed = (s) => (s > 0 ? '+' : s < 0 ? '-' : '±') + formatClock(Math.abs(s));
  const out = (line = '') => console.log(line);

  if (transcript) {
    const tr = souff.debriefTranscript(lines);
    const rep = souff.debriefReport(lines);
    out(`transcript of ${t(shownPath(logFile))}`
      + (rep.talkFrom ? `, from the clock's start at ${logWallTime(rep.talkFrom)}` : ', the whole log (the clock never started)'));
    for (const sl of tr.slides) {
      out('');
      out(`## #${t(sl.chunkId || '?')}  [${clock(sl.at)}]`);
      for (const w of sl.text) out(t(w));
    }
    out('');
    out(`${tr.words} words in ${clock(tr.seconds)}`
      + (tr.wpm != null ? ` · ${tr.wpm} words per minute` : ''));
    return;
  }

  const fm = safeMatter(fs.readFileSync(absIn, 'utf8')).data || {};
  const settings = souffleuseSettings(fm);
  const deck = souff.deckPayload(parseLecture(fs.readFileSync(absIn, 'utf8')), {
    notesToCards, durationS: talkDuration(fm), lang: settings.language || lectureLang(fm),
  });
  const rep = souff.debriefReport(lines, { deck });

  out(`lecture  ${t(shownPath(absIn))}`);
  out(`log      ${t(shownPath(logFile))}`
    + (pickedLog && pickedLog.skipped.length
      ? ` (passed over ${pickedLog.skipped.length === 1 ? 'a newer dry run' : pickedLog.skipped.length + ' newer dry runs'})`
      : ''));
  if (rep.dryRun) out('         a dry run: nothing went to a model.');
  out('');

  // ── 1. the clock ──
  out('== the clock');
  for (const s of rep.sessions) {
    out(`  ${logWallTime(s.t)}  session via ${t(s.via)}${s.model ? ' · ' + t(s.model) : ''}`
      + (s.dryRun ? ' · dry run' : '') + (s.disabled ? ' · off: ' + t(s.disabled) : ''));
  }
  for (const c of rep.clocks) {
    out(`  ${logWallTime(c.t)}  ${c.type}: ${t(c.why)} · was ${clock(c.was)} → ${clock(c.now)}`);
  }
  if (!rep.talkFrom) out('  the cockpit clock never started: every time below is on the clock as it ran');
  if (rep.firstWords) {
    out(`  ${logWallTime(rep.firstWords.t)}  first words${rep.talkFrom ? ' after that' : ''}: `
      + `"${t(rep.firstWords.text).slice(0, 80)}"`);
  }
  out(`  ${logWallTime(rep.end.t)}  log ends at ${clock(rep.end.elapsed)} on the talk clock · `
    + (rep.end.how
      ? `stopped with ${t(rep.end.how)}`
      : (rep.end.why ? t(rep.end.why) + ' · ' : '')
        + 'no closing line (the process ended without Ctrl-C, or before the engine wrote one)'));
  out('');

  // ── 2. the time table ──
  const rows = rep.table ? rep.table.rows : [];
  if (!rows.length) {
    out('== no @mm:ss marks in the notes, so no time table');
  } else {
    out('== the time table: mark vs arrival, budget vs time spent (until the next marked slide)');
    const label = (r) => '#' + r.id + (r.beat ? ` ·${r.beat}` : '');
    const w = Math.max(18, ...rows.map(r => t(label(r)).length + 2));
    const pad = (s, n) => String(s).padEnd(n);
    const rpad = (s, n) => String(s).padStart(n);
    out('  ' + pad('slide', w) + rpad('mark', 8) + rpad('arrived', 9) + rpad('drift', 8)
      + rpad('budget', 8) + rpad('spent', 8) + rpad('over', 8));
    for (const r of rows) {
      const head = '  ' + pad(t(label(r)), w) + rpad(clock(r.mark), 8);
      if (r.arrived == null) { out(head + '  (not reached)'); continue; }
      out(head + rpad(clock(r.arrived), 9) + rpad(signed(r.drift), 8)
        + rpad(r.budget != null ? clock(r.budget) : '', 8) + rpad(clock(r.spent), 8)
        + rpad(r.over != null ? signed(r.over) : '', 8));
    }
    out(`  planned to the last mark ${clock(rep.table.lastMark)} · talk clock at the end ${clock(rep.end.elapsed)}`
      + ` · over budget on marked slides ${signed(rep.table.over)}`);
  }
  out('');

  // ── 3. what the prompter said ──
  out(`== whispered (${rep.hints.length})`);
  for (const h of rep.hints) {
    out(`  ${clock(h.at)}  ${t(h.kind)}${h.chunkId ? ' · #' + t(h.chunkId) : ''} · "${t(h.text)}"`
      + (h.went ? ` · went away: ${t(h.went)}` : ''));
    if (h.why) out(`          the model: ${t(h.why)}`);
  }
  if (rep.cues.length) {
    out(`== cards laid (${rep.cues.length})`);
    for (const c of rep.cues) out(`  ${clock(c.at)}  → #${t(c.chunkId || '?')} · "${t(c.text)}"`);
  }
  out(`== held back (${rep.held.length})`);
  for (const h of rep.held) {
    const what = h.action === 'cue' ? `cue → #${t(h.target || '?')}` : t(h.kind || h.action);
    out(`  ${clock(h.at)}  ${what} · "${t(h.text)}" · held back: ${t(h.reason)}`);
    if (h.why) out(`          the model: ${t(h.why)}`);
  }
  const c = rep.calls;
  out(c.dry === c.count && c.count
    ? `== ${c.count} call${c.count === 1 ? '' : 's'} a dry run did not send`
    : `== ${c.count - c.dry} call${c.count - c.dry === 1 ? '' : 's'} to the model`
      + (c.avgMs != null ? ` · ${c.avgMs} ms each` : '')
      + (c.cost ? ` · $${c.cost.toFixed(2)}` : ''));

  if (replay) {
    out('');
    out('== the replay through today\'s policy');
    printReplay(absIn, logFile, souff, cards);
  }
}

async function main() {
  guardConsole();
  const argv = process.argv.slice(2);
  // Set before anything else can emit: the pre-flights inside buildOnce throw
  // through main's catch, and that catch reports a build-error.
  eventsEnabled = argv.includes('--events');

  // Asked for, the help goes to stdout and the command succeeds; read before
  // the flags are checked, so it can stand anywhere on the line.
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(helpText());
    return;
  }
  // Nothing at all: the same text, as the answer to a mistake.
  if (!argv.length) {
    process.stderr.write(helpText());
    process.exitCode = 1;
    return;
  }

  const cli = parseCommandLine(argv);
  refuseCombinations(cli);
  refusePresentCompany(cli);
  const { flags, values, positional } = cli;

  if (flags.has('--new')) {
    runNew(positional[0], values.get('--into') || null);
    return;
  }

  // Image optimisation shells out to an encoder and never renders, so it
  // runs before the Shiki init below rather than paying for it.
  if (flags.has('--optimize-images')) {
    const absIn = resolveSourceArg(positional[0]);
    let maxWidth = null;
    if (values.has('--max-width')) {
      maxWidth = parseInt(values.get('--max-width'), 10);
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

  // Reading a finished run's log back. No watcher, no browser, no renderer
  // and no network: one log, one frontmatter (and for the debrief the notes'
  // marks), and lines on stdout. --prompter-replay says per answer what the
  // policy would do with it now, which is how a threshold gets changed with
  // evidence; --prompter-debrief is the whole run for the person who gave
  // the talk, and ends in the same replay.
  if (flags.has('--prompter-replay') || flags.has('--prompter-debrief')) {
    const flag = flags.has('--prompter-replay') ? '--prompter-replay' : '--prompter-debrief';
    if (flags.has('--transcript') && flags.has('--no-replay')) {
      throw cliError('Error: --no-replay does nothing with --transcript, which prints no replay.\n'
        + '  Drop one of the two.');
    }
    if (!positional[0]) {
      throw cliError(flag === '--prompter-replay'
        ? '--prompter-replay needs the source.md the log was written beside:'
          + ' its\n  `prompter:` block is what the policy is rebuilt from.'
        : '--prompter-debrief needs the source.md the log was written beside:'
          + ' its notes\n  carry the @mm:ss marks, and the log is looked for beside it.\n'
          + '  node build.js <source.md> --prompter-debrief [LOG]');
    }
    const absIn = resolveSourceArg(positional[0]);
    const souff = await import('./souffleuse.mjs');
    const cards = await import('./cue-cards.mjs');
    const logPath = values.get(flag)
      ? resolveLogArg(values.get(flag), absIn, flag)
      : newestLog(absIn, souff);
    if (flag === '--prompter-replay') printReplay(absIn, logPath, souff, cards);
    else printDebrief(absIn, logPath, souff, cards, {
      transcript: flags.has('--transcript'), replay: !flags.has('--no-replay'),
    });
    return;
  }

  const [inputPath] = positional;
  if (!inputPath) {
    // --frames takes the next word as its folder, so a source folder written
    // after it is read as that folder: say so rather than only "no source".
    const ate = values.get('--frames');
    const hint = ate && fs.existsSync(path.join(path.resolve(ate), 'source.md'))
      ? `\n  --frames took ${ate} as the folder its pictures go to; put the source first:\n`
        + `  node build.js ${ate} --frames`
      : '';
    console.error('No source.md given: node build.js <source.md> ' + [...flags].join(' ')
      + hint + '\n  node build.js --help lists every flag.');
    process.exit(1);
  }

  if (flags.has('--integrate-annotations')) {
    runIntegrate(resolveSourceArg(inputPath));
    return;
  }

  // Resolved before the Shiki init, so a wrong path is said at once; and a
  // viewport before the build it would measure, not after it.
  const absIn = resolveSourceArg(inputPath);
  refuseForDocument(flags, absIn);
  const docMode = sourceIsDocument(absIn);
  // --present is the three flags a talk is started with, and the prompter
  // when the lecture has settings for one or the line asks for it. Expanded
  // here, so everything below reads the flags it always read.
  if (flags.has('--present')) {
    for (const f of ['--watch', '--serve', '--open']) flags.add(f);
    if (['--prompter-dry-run', '--prompter-model'].some(f => flags.has(f)) || lectureWantsPrompter(absIn)) {
      flags.add('--prompter');
    }
  }
  if (values.has('--viewport')) readViewportFlag(argv);

  // A port the system will not give is said before anything is built.
  let servePort = 0;
  if (values.has('--port')) {
    const v = values.get('--port');
    servePort = /^\d{1,5}$/.test(v) ? Number(v) : NaN;
    if (!(servePort >= 0 && servePort <= 65535)) {
      const err = new Error(`Error: --port takes a port number from 1 to 65535, and ${v} is not one.\n`
        + '  Leave --port out and the lecture\'s own is used.');
      err.userFacing = true;
      throw err;
    }
    await assertPortFree(servePort);
  }

  // Shiki must be ready before any renderer runs (the highlighter
  // singleton is shared across --watch rebuilds).
  await initHighlighter();

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

  // The live prompter. Only with --watch, and that is not a convenience: the
  // cockpit reaches the sidecar over the watch socket and there is no other
  // channel, so a one-shot build would start something nothing could talk to.
  const souffModel = values.get('--prompter-model');
  // The model id is a setting of a prompter, and it is read nowhere else: on
  // its own it built an ordinary deck with no prompter in it and said nothing,
  // which is the silent no-op this CLI refuses everywhere else.
  if (souffModel && !flags.has('--prompter')) {
    const err = new Error(
      '--prompter-model without --prompter.\n'
      + '  The model id is only ever read by the prompter, so on its own it changes\n'
      + '  nothing about the build – no prompter would run.\n'
      + '  node build.js <source.md> --watch --prompter --prompter-model '
      + souffModel);
    err.userFacing = true;
    throw err;
  }
  // The rehearsal switch. It is read nowhere but the sidecar, so on its own it
  // is the same silent no-op --prompter-model was.
  if (flags.has('--prompter-dry-run') && !flags.has('--prompter')) {
    const err = new Error(
      '--prompter-dry-run without --prompter.\n'
      + '  It says what the prompter should skip, and without a prompter there is\n'
      + '  nothing to skip – the build would be an ordinary one.\n'
      + '  node build.js <source.md> --watch --prompter --prompter-dry-run');
    err.userFacing = true;
    throw err;
  }
  if (flags.has('--prompter')) {
    if (!flags.has('--watch')) {
      const err = new Error(
        '--prompter needs --watch.\n'
        + '  The cockpit talks to the prompter over the watch socket, and a build without\n'
        + '  --watch has none – the sidecar would start with nothing able to reach it.\n'
        + '  node build.js <source.md> --watch --prompter');
      err.userFacing = true;
      throw err;
    }
    opts.souffleuse = {
      model: souffModel || null,
      dryRun: flags.has('--prompter-dry-run'),
    };
  }

  // Parsed before the --watch branch, not after: --watch returns from main()
  // without ever reaching the build, so a check that sits below it never runs
  // and `--watch --slides-pdf` would start a watcher and quietly export
  // nothing. Everything a PDF flag can be told wrong is refused here, in
  // one place, before a browser is started.
  const pdf = pdfJobsFrom(argv, flags, absIn);

  if (flags.has('--watch')) {
    // Awaited: it returns once the first build is on disk, which is when the
    // addresses below name files that exist.
    try {
      await runWatch(absIn, only, opts, { serve: flags.has('--serve') });
    } catch (err) {
      console.error(`Watch failed: ${err.message}`);
      emitEvent({ type: 'watch-error', message: err.message });
      process.exit(1);
    }
    // Serving is layered on top of watching rather than instead of it, so
    // --watch --serve gives live reload over http in one command.
    let base = null;
    if (flags.has('--serve')) {
      ({ base } = await runServe(path.dirname(absIn), servePort, { absIn }));
      printViewAddresses(path.dirname(absIn), base, { prompter: !!opts.souffleuse, document: docMode });
    } else if (opts.souffleuse) {
      console.log('Prompter: open speaker.html in Chrome (speech recognition); Shift-S there switches it on.');
    }
    if (flags.has('--open')) openCockpit(path.dirname(absIn), base, { chrome: !!opts.souffleuse, document: docMode });
    return;
  }

  // The PDF flags ignore the --*-only flags rather than obeying them:
  // `--print-only --slides-pdf` would otherwise export a stale audience.html,
  // or none at all, and `--audience-only --print-pdf` a stale print.html.
  // Ignoring surprises least - the author still gets every view they would
  // have got without the export flag, plus the PDF.
  emitEvent({ type: 'build-start', reason: 'manual' });
  oneShotStart = Date.now();
  await prewarmWebp(absIn, opts);
  const { written, shape, stats, sourceModifiedMs } = buildOnce(absIn, pdf ? undefined : only, opts);
  reportWebpInline();
  console.log(`Wrote ${written.join(', ')} (${shape})`);
  emitEvent({
    type: 'build-success', reason: 'manual',
    views: written.map(p => path.basename(p, '.html')),
    shape, durationMs: Date.now() - oneShotStart, embeds: embedsThisBuild.length,
    stats, sourceModifiedMs,
  });
  if (pdf) {
    // Loaded here and not at the top of the file, because pdf-export.mjs
    // imports playwright-core and build.js must keep running on an install
    // that has no browser binding at all (acceptance criterion 9). This is
    // the only new import in build.js, and it sits behind the flag.
    // One browser for every PDF asked for.
    const { exportPdfs } = await import('./pdf-export.mjs');
    // Which local files the page may load: what --serve would answer for
    // this lecture (local-files.mjs), so a deck's own HTML cannot put a file
    // from elsewhere on the disk into the PDF by showing it.
    const lectureDir = path.dirname(absIn);
    await exportPdfs({ ...pdf, allowFile: (url) => fileUrlAllowed(url, lectureDir) });
  }
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
    const code = await runSquint(absIn, readViewportFlag(argv),
      values.get('--squint-out') || null);
    if (code) process.exitCode = code;
  }
  // Pictures of every state, for the eyes the two probes above do not have.
  if (flags.has('--frames')) {
    const code = await runFrames(absIn, readViewportFlag(argv), values.get('--frames') || null);
    if (code) process.exitCode = code;
  }
  if (flags.has('--serve')) {
    const { base } = await runServe(path.dirname(absIn), servePort, { absIn });
    printViewAddresses(path.dirname(absIn), base, { document: docMode });
    if (flags.has('--open')) openCockpit(path.dirname(absIn), base, { document: docMode });
  }
}

main().catch(err => {
  // userFacing errors carry instructions for the author; anything else is a
  // defect in the build and deserves its stack.
  console.error(err && err.userFacing ? err.message : err);
  // The one-shot path has no try/catch of its own – the pre-flights throw
  // straight through main – so this is where a driver hears that the build
  // refused the deck. Under --watch the failure was already reported by
  // `rebuild` and never reaches here.
  emitEvent({
    type: 'build-error', reason: 'manual',
    message: (err && err.message) || String(err),
    userFacing: !!(err && err.userFacing),
    stack: err && err.userFacing ? null : ((err && err.stack) || null),
    durationMs: oneShotStart ? Date.now() - oneShotStart : 0,
  });
  process.exit(1);
});
