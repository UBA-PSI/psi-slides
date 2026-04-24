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
 * ::: directives (margin/expand/sketch), KaTeX, image resolution,
 * geometry pass, linter, --watch, --assign-ids, --new.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { createHighlighter } from 'shiki';

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
  'html', 'css', 'json', 'yaml', 'markdown', 'sql', 'toml', 'diff', 'text',
];
const SHIKI_THEME = 'github-light';
const LANG_ALIAS = {
  py: 'python', sh: 'bash', zsh: 'bash',
  js: 'javascript', ts: 'typescript', md: 'markdown',
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
const MIME_BY_EXT = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const AUTO_INLINE_BUDGET = 10 * 1024 * 1024;
let currentSourceDir = null;
let inlineAssetsEnabled = false;
const imgResolveCache = new Map();
const dataUriCache = new Map();
function resolveFigId(figId) {
  if (!currentSourceDir) return null;
  const cacheKey = currentSourceDir + '::' + figId;
  if (imgResolveCache.has(cacheKey)) return imgResolveCache.get(cacheKey);
  for (const ext of IMG_EXTS) {
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
function toDataUri(absPath) {
  if (!absPath) return null;
  if (dataUriCache.has(absPath)) return dataUriCache.get(absPath);
  let stat;
  try { stat = fs.statSync(absPath); }
  catch { dataUriCache.set(absPath, null); return null; }
  if (stat.size > MAX_INLINE_BYTES) {
    const mb = (stat.size / 1024 / 1024).toFixed(2);
    console.warn(`[inline-images] skipping ${path.relative(process.cwd(), absPath)} (${mb} MB > 2 MB limit)`);
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

// Pre-scan a source file's image references to estimate inline cost.
// Used by the auto-inline decision in buildOnce: if total bytes fit
// AUTO_INLINE_BUDGET, the build inlines without an explicit flag. The
// regex catches false positives in code blocks, but for a budget
// heuristic that's fine – fence-aware scanning would be over-engineered.
function scanReferencedImages(src, sourceDir) {
  const refs = new Set();
  for (const match of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    refs.add(match[1]);
  }

  let total = 0;
  let count = 0;
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
      total += stat.size;
      count += 1;
    } catch { /* missing assets surface elsewhere as figure-missing */ }
  }
  return { total, count };
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
          let src = resolved;
          if (inlineAssetsEnabled) {
            const inlined = toDataUri(path.join(currentSourceDir, resolved));
            if (inlined) src = inlined;
          }
          const alt = escapeHtml(text || '');
          const cap = text ? `<figcaption>${alt}</figcaption>` : '';
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          return `<figure class="figure-img" data-fig-id="${escapeHtml(href)}"><img src="${escapeHtml(src)}" alt="${alt}"${titleAttr} loading="lazy">${cap}</figure>`;
        }
        // Unresolved: emit a visible placeholder so authors notice immediately.
        return `<figure class="figure-img figure-missing" data-fig-id="${escapeHtml(href)}"><div class="figure-missing-placeholder">missing: assets/${escapeHtml(href)}.(${IMG_EXTS.join('|')})</div>${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}</figure>`;
      }
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      let src = href;
      // Inline only true relative paths from disk; leave external URLs,
      // existing data URIs, and root-absolute paths untouched.
      if (inlineAssetsEnabled && href && currentSourceDir && !/^(?:https?:|data:|\/\/|\/)/i.test(href)) {
        const inlined = toDataUri(path.resolve(currentSourceDir, href));
        if (inlined) src = inlined;
      }
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text || '')}"${titleAttr}>`;
    },
  },
});

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
  const columns = [];
  let currentColumn = null;
  let currentChunk = null;
  let bodyLines = [];
  let inFence = false;
  let currentExpansion = null; // { label, lines } while inside a ::: expand block
  let noteBlock = null;        // { lines: string[] } – current `> note:` block
  let pendingNotes = [];       // notes that appeared before a chunk, attach to the next one
  let annotBlock = null;       // { lines: string[] } – current `> annot:` block
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

  for (const line of content.split('\n')) {
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
  flushChunk();

  return { frontmatter, columns };
}

// ── rendering ────────────────────────────────────────────────────────

// Live-reload snippet for --watch mode. The build threads opts.watchPort
// into each renderer; a non-null port emits this <script> just before
// </head>. Production builds receive opts.watchPort = null and the
// renderers emit nothing, keeping the output a static file.
function reloadScript(port) {
  if (!port) return '';
  return `<script>
(() => {
  const connect = () => {
    const ws = new WebSocket('ws://localhost:${port}');
    ws.addEventListener('message', e => { if (e.data === 'reload') location.reload(); });
    ws.addEventListener('close', () => setTimeout(connect, 500));
  };
  connect();
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

// Serialize a value for inline <script> injection. Plain JSON would let
// a title containing `</script>` close the tag and inject arbitrary HTML;
// escaping `<` as a unicode escape blocks that path and stays valid JSON.
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003C');
}

function lectureTitle(frontmatter) {
  return frontmatter.title || 'Untitled lecture';
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

function renderHeadingHtml(chunk, cls = 'chunk-heading') {
  if (!chunk.heading && !chunk.headingSub) return '';
  const main = escapeHtml(chunk.heading || '');
  if (!chunk.headingSub) return `<h2 class="${cls}">${main}</h2>`;
  const sub = escapeHtml(chunk.headingSub);
  // Space between spans so the print renderer (which uses display:inline
  // for the subline) keeps a readable gap; audience uses flex-column and
  // the space collapses under `gap: 0.1em`.
  return `<h2 class="${cls} has-sub"><span class="hd-main">${main}</span> <span class="hd-sub">${sub}</span></h2>`;
}

function renderChunk(chunk, frontmatter) {
  const { tag, body = '', id, width, expansions = [], annotation = '' } = chunk;
  const bodyHtml = body ? marked.parse(body) : '';

  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

  if (tag === 'title') {
    return `<article class="chunk chunk-title"${idAttr}>
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

  return `<article class="${classes}"${idAttr}>
  ${label}
  ${renderHeadingHtml(chunk)}
  ${bodyHtml}
  ${expansionsHtml}
  ${annotationHtml}
</article>`;
}

function renderColumn(col, frontmatter) {
  const chunksHtml = col.chunks.map(c => renderChunk(c, frontmatter)).join('\n');
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

function renderDocument(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  const toc = renderToc(columns);
  // Title / anon columns render above the TOC (cover page first),
  // named columns render after (body of the document).
  const anonHtml = columns.filter(c => !c.heading)
    .map(c => renderColumn(c, frontmatter)).join('\n');
  const namedHtml = columns.filter(c => c.heading)
    .map(c => renderColumn(c, frontmatter)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – print</title>
<style>
${PRINT_CSS}
</style>
${reloadScript(opts.watchPort)}
</head>
<body>
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
  --serif: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
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

/* Presentation Note: annotation the lecturer typed live (> annot: in
   source) and committed back into the document. Rendered as a small,
   indented block so it reads as a post-hoc remark rather than part of
   the main argument. */
.presentation-note {
  margin: 0.9rem 0 0.4rem;
  padding: 0.45rem 0.8rem;
  border-left: 2pt solid oklch(0.72 0.12 80);
  background: oklch(0.985 0.014 80);
  color: var(--ink);
  font-size: 0.92em;
}
.presentation-note-label {
  display: inline-block;
  font-family: var(--sans);
  font-variant-caps: all-small-caps;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  color: oklch(0.48 0.1 80);
  margin-right: 0.4em;
}
.presentation-note-body { display: inline; }
.presentation-note-body > :first-child { display: inline; margin: 0; }
.presentation-note-body > :first-child + * { margin-top: 0.35em; }
.presentation-note-body > :last-child { margin-bottom: 0; }

/* Title slide: lower-left-third per PRD §4.4 */
.chunk-title {
  min-height: calc(100vh - 6rem);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 0 0 12vh;
  page-break-after: always;
  page-break-inside: avoid;
  margin: 0;
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

/* Layout primitives reflow to linear prose in print. The goal is a
   readable document: columns collapse, side panes stack, marginalia
   sits inline as a quiet aside. */
.cols, .cols-2, .cols-3 { column-count: auto; }
.cols { margin: 0.4em 0; }
.cols > p, .side-a > p, .side-b > p { margin: 0.4em 0 0.9em; }
.side { display: block; margin: 0.4em 0; }
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

/* figure-img: single-column figure with caption below */
figure.figure-img { margin: 1rem 0; text-align: center; }
figure.figure-img img { max-width: 100%; height: auto; }
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
  .chunk-title { min-height: 24cm; }
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

function renderTitleChunk(chunk, frontmatter) {
  const idAttr = chunk.id ? ` id="${escapeHtml(chunk.id)}"` : '';
  const chunkId = chunk.id || 'title';
  const bodyHtml = (chunk.body || '').trim() ? marked.parse(chunk.body) : '';
  return `<article class="chunk chunk-title" data-tag="title" data-width="full" data-chunk-id="${escapeHtml(chunkId)}"${idAttr}>
  <div class="chunk-content">
    ${renderTitleBlock({ ...frontmatter, bodyHtml })}
  </div>
</article>`;
}

function renderAudienceChunk(chunk, frontmatter, colIdx, chunkIdx) {
  if (chunk.tag === 'title') return renderTitleChunk(chunk, frontmatter);

  const { tag, heading, segments = [], id, width, expansions = [], annotation = '' } = chunk;
  const chunkId = id || `c${colIdx}-${chunkIdx}`;
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

  const labelTag = tag && tag !== 'free' && tag !== 'exercise' && tag !== 'figure' ? tag : null;
  const tagLabel = labelTag
    ? `<div class="tag-label">${escapeHtml(labelTag)}</div>`
    : '';

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

  return `<article class="${classes}"${idAttr} data-chunk-id="${escapeHtml(chunkId)}"${tagAttr}${widthAttr}>
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
</article>`;
}

// Shared audience/speaker column shell. Both stage the same flat-chunk
// markup; only the per-view head/chrome differs.
function renderColumnsHtml(columns, frontmatter) {
  return columns.map((col, ci) => {
    const chunks = col.chunks
      .map((c, xi) => renderAudienceChunk(c, frontmatter, ci, xi))
      .join('\n');
    const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
    return `<section class="column" data-col="${ci}"${idAttr}>
${chunks}
</section>`;
  }).join('\n');
}

// The overview badge + search input is identical in both live views;
// keeping it a single constant means label/hotkey changes land once.
const OVERVIEW_BADGE_HTML = `<div id="overview-badge">
  <span class="hint">overview · drag · wheel · click · <kbd>O</kbd>/<kbd>Enter</kbd> land · <kbd>/</kbd> search · <kbd>Esc</kbd></span>
  <input id="search-input" type="text" placeholder="search..." autocomplete="off" spellcheck="false">
</div>`;

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

function renderAudience(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  const columnsHtml = renderColumnsHtml(columns, frontmatter);
  const titleJson = jsonForScript(title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – lecture</title>
<style>
${AUDIENCE_CSS}
</style>
${reloadScript(opts.watchPort)}
</head>
<body data-collapse="topic-bold" data-font="serif" data-theme="light-red">
<div id="stage-viewport">
  <div id="stage">
${columnsHtml}
  </div>
</div>
<div id="laser-pointer" aria-hidden="true"></div>
<div id="figure-overlay" aria-hidden="true"></div>
<div id="hints">
  <kbd>←</kbd><kbd>→</kbd> column &nbsp; <kbd>↑</kbd><kbd>↓</kbd> chunk &nbsp; <kbd>Space</kbd> reveal<br>
  <kbd>Enter</kbd>/<kbd>1</kbd>–<kbd>9</kbd> expand &nbsp; <kbd>N</kbd> annotate &nbsp; <kbd>C</kbd> collapse<br>
  <kbd>O</kbd> overview &nbsp; <kbd>T</kbd> toc &nbsp; <kbd>/</kbd> search &nbsp; <kbd>P</kbd> print &nbsp; <kbd>B</kbd> blank<br>
  <kbd>F</kbd> font &nbsp; <kbd>A</kbd> accent/theme &nbsp;
  <kbd>+</kbd><kbd>-</kbd><kbd>0</kbd> zoom &nbsp; <kbd>?</kbd> hide
</div>
<div id="mode-badge"></div>
${OVERVIEW_BADGE_HTML}
${renderTocNav(columns)}
<script>
const LECTURE_TITLE = ${titleJson};
${AUDIENCE_JS}
</script>
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
  --serif-stack: 'Literata', 'Source Serif 4', Georgia, serif;
  --sans-stack:  'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif;
  /* Readable mono ("iA Writer"-style): prefer the Duo/Quattro faces if
     present, fall back to JetBrains Mono and system monospace. The iA
     fonts are free-to-use (SIL) when self-hosted; here we treat them
     as an opportunistic upgrade if the user installed them locally. */
  --read-mono-stack: 'iA Writer Duo V', 'iA Writer Duospace', 'iA Writer Quattro V',
                     'JetBrains Mono', 'Berkeley Mono', 'SF Mono', ui-monospace,
                     Menlo, monospace;
  --body-font: var(--serif-stack);
  --sans-font: var(--sans-stack);
  --mono-font: 'JetBrains Mono', ui-monospace, Menlo, monospace;
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

/* ── Theme / accent cycle (hotkey A) ──────────────────────────────
   Four light-mode accent variants plus two terminal/CRT dark modes.
   Paper/ink/rule/emph are all re-derived per theme so shadows, dims,
   and hairlines pick up the new colors automatically via var(). */
body[data-theme=light-red]    { --emph: oklch(0.42 0.16 30); }
body[data-theme=light-teal]   { --emph: oklch(0.52 0.12 195); }
body[data-theme=light-blue]   { --emph: oklch(0.48 0.18 250); }
body[data-theme=light-orange] { --emph: oklch(0.58 0.17 60);  }

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

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body-font);
  font-size: clamp(20px, calc(var(--slide-h) * 0.026), 38px);
}
/* Disable text selection in the live views: shift-drag pans the stage
   and accidentally selecting prose mid-lecture is a constant
   micro-distraction. Print keeps selection for copy-paste. Textareas
   and inputs re-enable it so annotations/notes remain editable. */
html, body { user-select: none; -webkit-user-select: none; }
textarea, input, [contenteditable=true] {
  user-select: text;
  -webkit-user-select: text;
}

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
.chunk[data-width=narrow]   { --content-w: 22em; }
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
.chunk-body ul, .chunk-body ol { margin: 0 0 0.7em 1.4em; }
.chunk-body li { margin: 0.15em 0; }
.chunk-body code { font-family: var(--mono-font); font-size: 0.92em; }
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
.cols {
  column-gap: 2.2em;
  column-rule: 1px dotted transparent;
  margin: 0.3em 0;
}
.cols-2 { column-count: 2; }
.cols-3 { column-count: 3; }
.cols > * { break-inside: avoid; }
.cols > :first-child { margin-top: 0; }
.cols p { margin: 0 0 0.55em; }
.cols p:last-child { margin-bottom: 0; }

/* ::: side / ::: flip  – explicit two-pane grid for figure+text */
.side {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2em;
  align-items: start;
  margin: 0.5em 0;
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

/* Images & figures --------------------------------------------------- */
figure.figure-img {
  margin: 0.6em 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: zoom-in;
}
figure.figure-img img {
  max-width: 100%;
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
  background: oklch(0.06 0 0 / 0.78);
  z-index: 30;
  cursor: zoom-out;
  padding: 4vh 4vw;
}
/* The target is always shown on a solid paper card – otherwise the
   dimmed backdrop bleeds through (shiki-highlighted code in particular
   loses legibility when translucent). !important wins over shiki's
   and the chunk-body override that set pre.shiki background to
   transparent for in-flow rendering. */
#figure-overlay > .figure-focus-target {
  max-width: 92vw;
  max-height: 88vh;
  overflow: auto;
  background: var(--paper) !important;
  box-shadow: 0 0 0 1px var(--rule);
  padding: 3vh 3vw;
  cursor: zoom-out;
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
#figure-overlay figure.figure-img { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 0.8em; }
/* Scale the image up to use the available overlay area. width:auto +
   max-width + max-height preserves aspect ratio while letting the
   image grow beyond its intrinsic size (SVGs often default to 300×150
   when embedded via <img>, which is too small for a zoom overlay). */
#figure-overlay figure.figure-img img {
  width: min(86vw, 1400px);
  max-height: 78vh;
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

/* blank mode */
body.blanked #stage-viewport { background: oklch(0.06 0 0); }
body.blanked #stage { opacity: 0; }

/* overlays */
#hints {
  position: fixed;
  bottom: 14px; left: 14px;
  background: oklch(0.98 0 0 / 0.85);
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  padding: 0.5rem 0.75rem;
  font-family: var(--mono-font);
  font-size: 11px;
  line-height: 1.6;
  pointer-events: none;
  z-index: 20;
  opacity: 0.8;
  max-width: 360px;
}
#hints.hidden { display: none; }
#hints kbd { color: var(--ink); padding: 0 4px; border: 1px solid var(--rule); font-family: inherit; background: oklch(0.96 0 0); }

#mode-badge {
  position: fixed;
  top: 14px; right: 14px;
  background: oklch(0.98 0 0 / 0.9);
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.12em;
  font-size: 10px;
  padding: 0.3rem 0.6rem;
  display: none;
  z-index: 20;
  pointer-events: none;
}
#mode-badge.visible { display: block; }

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
  z-index: 25;
}
#laser-pointer.visible { opacity: 1; }
body[data-view=speaker] #laser-pointer { display: none; }

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
#overview-badge #search-input {
  display: none;
  font: inherit;
  letter-spacing: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0;
  min-width: 10em;
  text-transform: lowercase;
}
body.search-active #overview-badge #search-input { display: inline-block; }
body.search-active #overview-badge .hint { display: none; }
#overview-badge #search-input::placeholder { color: oklch(0.97 0 0 / 0.7); font-style: italic; }

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
  window.addEventListener('resize', () => setSlideRef(window.innerWidth, window.innerHeight));
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

const state = {
  activeIdx: 0,
  collapse: 'topic-bold',
  zoom: 1.35,
  blanked: false,
  font: 'serif',          // serif | sans | mono (readable)
  theme: 'light-red',     // light-{red,teal,blue,orange} | terminal-{amber,green}
};
const FONT_CYCLE = ['serif', 'sans', 'mono'];
const THEME_CYCLE = [
  'light-red', 'light-teal', 'light-blue', 'light-orange',
  'terminal-amber', 'terminal-green',
];
let openExp = null;            // { chunkIdx, expIdx } | null
let annotEditingId = null;
let annotations = {};          // chunkId -> text
const revealed = {};           // chunkId -> count of visible segments

// overview / TOC / search (PRD §5)
let overview = false;
let overviewScale = 0.28;
let selectedIdx = 0;           // overview selection (independent of activeIdx)
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
  // Font + theme are global (not per-lecture): shared across all lectures
  // so the reading preference follows the user, not the source file.
  try {
    const f = localStorage.getItem('psi-slides:font');
    if (f && FONT_CYCLE.includes(f)) state.font = f;
  } catch (e) {}
  try {
    const t = localStorage.getItem('psi-slides:theme');
    if (t && THEME_CYCLE.includes(t)) state.theme = t;
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
function setPeer(w) {
  if (w && w !== window && !w.closed) peer = w;
}
function sendToPeer(msg) {
  if (!peer || peer.closed) { peer = null; return; }
  try { peer.postMessage(msg, '*'); } catch (e) { peer = null; }
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
    zoom: state.zoom,
    blanked: state.blanked,
    font: state.font,
    theme: state.theme,
    // Inner window dimensions travel with every snapshot so the speaker
    // can match its preview's aspect ratio to the actual projector
    // window. Without this, laser-pointer coordinates (fractions of the
    // active chunk's bounding box) would land at the wrong pixel, and
    // content layout could differ (text wrap, code-block width, etc.).
    // Audience is the source of truth; speaker-side value is ignored.
    audienceW: window.innerWidth,
    audienceH: window.innerHeight,
    annotations: Object.assign({}, annotations),
    openExp: openExp ? { chunkIdx: openExp.chunkIdx, expIdx: openExp.expIdx } : null,
  };
}
function broadcastState() {
  if (!shouldBroadcast()) return;
  sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
}
function applyRemoteState(payload) {
  isApplyingRemote = true;
  try {
    unfocusFigure();
    state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, payload.activeIdx || 0));
    state.collapse = COLLAPSE_MODES.includes(payload.collapse) ? payload.collapse : 'topic-bold';
    state.zoom = payload.zoom || 1.35;
    state.blanked = !!payload.blanked;
    if (payload.font && FONT_CYCLE.includes(payload.font)) state.font = payload.font;
    if (payload.theme && THEME_CYCLE.includes(payload.theme)) state.theme = payload.theme;
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
    document.body.classList.toggle('blanked', state.blanked);
    // Expansions: close any current, open the remote one if any. toggleExp
    // calls applyState internally, so skip the second call in that branch.
    closeAnyExpansion();
    if (payload.openExp) {
      toggleExp(payload.openExp.chunkIdx, payload.openExp.expIdx);
    } else {
      applyState();
    }
    applyRevealAll();
    saveActive();
    focusCamera(false);
  } finally {
    isApplyingRemote = false;
  }
}
window.addEventListener('message', (ev) => {
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
  if (m.type === 'cursor' && VIEW === 'audience') {
    showLaserPointer(m.chunkIdx, m.x, m.y);
  }
  if (VIEW === 'audience') {
    if (m.type === 'figure-focus') {
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll('figure.figure-img, .chunk-body pre, .marginalia')[m.figureIdx];
        if (el) focusFigure(el);
      }
      return;
    }
    if (m.type === 'figure-pan') {
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll('figure.figure-img, .chunk-body pre, .marginalia')[m.figureIdx];
        if (el) panToElement(el);
      }
      return;
    }
    if (m.type === 'figure-unfocus') { unfocusFigure(); return; }
    if (m.type === 'overview') {
      if (m.active && !overview) toggleOverview();
      else if (!m.active && overview) exitOverview(false);
      return;
    }
  }
});

// Laser pointer – audience-only mirror of the speaker's mouse position.
// chunkIdx + percentage coords let the receiver position relative to
// its own copy of the active chunk (so different zoom levels still align).
const laserEl = document.getElementById('laser-pointer');
let laserHideTimer = null;
function showLaserPointer(chunkIdx, px, py) {
  if (!laserEl) return;
  if (chunkIdx !== state.activeIdx) { hideLaserPointer(); return; }
  const entry = flatChunks[chunkIdx];
  if (!entry) return;
  const r = entry.el.getBoundingClientRect();
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
function splitSentencesIn(root) {
  const wrapProse = (node) => {
    for (const k of [...node.childNodes]) {
      if (k.nodeType === 3 && k.textContent.trim()) {
        const span = document.createElement('span');
        span.className = 'prose';
        span.appendChild(document.createTextNode(k.textContent));
        node.replaceChild(span, k);
      } else if (k.nodeType === 1 && k.tagName !== 'STRONG' && !k.classList.contains('prose')) {
        wrapProse(k);
      }
    }
  };
  root.querySelectorAll('p').forEach(p => {
    if (p.querySelector('.sentence-head')) return;
    const head = document.createElement('span'); head.className = 'sentence-head';
    const rest = document.createElement('span'); rest.className = 'sentence-rest';
    let mode = 'head';
    for (const k of [...p.childNodes]) {
      if (mode === 'head' && k.nodeType === 3) {
        const m = k.nodeValue.match(/^([\\s\\S]*?[.!?])(\\s+[\\s\\S]*)$/);
        if (m) {
          head.appendChild(document.createTextNode(m[1]));
          rest.appendChild(document.createTextNode(m[2]));
          mode = 'rest';
        } else head.appendChild(k.cloneNode(true));
      } else if (mode === 'head') {
        head.appendChild(k.cloneNode(true));
        if (k.nodeType === 1 && /[.!?]$/.test(k.textContent.trimEnd())) mode = 'rest';
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
function applyState() {
  document.body.dataset.collapse = state.collapse;
  document.documentElement.style.setProperty('--zoom', state.zoom);
  flatChunks.forEach((c, i) => c.el.classList.toggle('active', i === state.activeIdx));
  viewHooks.onActiveChange();
  broadcastState();
}

function countSegments(el) {
  return el.querySelectorAll('.reveal-segment').length;
}
function applyReveal(el, id) {
  const segs = el.querySelectorAll('.reveal-segment');
  const count = revealed[id] ?? (segs.length ? 1 : 0);
  segs.forEach((s, i) => {
    if (i < count) s.removeAttribute('data-hidden');
    else s.setAttribute('data-hidden', '');
  });
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

  // Shift-drag manual pan offset (§5: zoom-induced overflow). Reset on chunk change.
  tx += manualPan.dx; ty += manualPan.dy;

  if (instant) stage.style.transition = 'none';
  stage.style.transform = \`translate(\${tx}px, \${ty}px)\`;
  if (instant) requestAnimationFrame(() => { stage.style.transition = ''; });
}

// Overview camera: translate-and-scale to center the selected chunk at
// --overview-scale. The selected chunk (not the active one) drives
// framing, so click-to-select in overview re-centers on each pick.
function applyOverviewCamera(instant = false) {
  const entry = flatChunks[selectedIdx] || flatChunks[state.activeIdx];
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

function setSelectedIdx(idx) {
  if (idx < 0 || idx >= flatChunks.length) return;
  flatChunks.forEach((c, i) => c.el.classList.toggle('overview-selected', i === idx));
  selectedIdx = idx;
  if (overview) applyOverviewCamera(false);
}

// Shared teardown for both the O-toggle exit and the Esc-style dismiss.
// The caller decides whether the selected chunk should become active —
// O lands on it, Esc keeps the original.
function exitOverview(landOnSelected) {
  if (!overview) return;
  endSearch();
  overview = false;
  document.body.classList.remove('overview-mode');
  manualPan = { dx: 0, dy: 0 };
  if (landOnSelected && selectedIdx !== state.activeIdx) {
    state.activeIdx = selectedIdx;
    applyState();
    saveActive();
  }
  flatChunks.forEach(c => c.el.classList.remove('overview-selected'));
  focusCamera(false);
}

function toggleOverview() {
  if (overview) { exitOverview(true); return; }
  overview = true;
  document.body.classList.add('overview-mode');
  manualPan = { dx: 0, dy: 0 };
  setSelectedIdx(state.activeIdx);
  applyOverviewCamera(false);
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
function startSearch() {
  if (!overview) return;
  searchActive = true;
  document.body.classList.add('search-active');
  searchInput.value = '';
  searchInput.focus();
  updateSearch();
}
function endSearch() {
  if (!searchActive) return;
  searchActive = false;
  document.body.classList.remove('search-active');
  searchInput.blur();
  searchInput.value = '';
  flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
}
function updateSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
    return;
  }
  flatChunks.forEach(c => {
    const text = (c.el.textContent || '').toLowerCase();
    const hit = text.includes(q);
    c.el.classList.toggle('search-match', hit);
    c.el.classList.toggle('search-miss', !hit);
  });
}
function commitSearchFirstMatch() {
  const first = flatChunks.findIndex(c => c.el.classList.contains('search-match'));
  if (first >= 0) setSelectedIdx(first);
  endSearch();
}

// Nav
function jumpTo(idx, direction) {
  if (idx < 0 || idx >= flatChunks.length) return;
  if (annotEditingId) blurAnnotation();
  if (focusedFigure) unfocusFigure();
  closeAnyExpansion();
  // Reset shift-drag pan on chunk change – pan is per-chunk inspection.
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
  applyState();
  focusCamera(false);
  saveActive();
}

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
    });
    ta.addEventListener('blur', () => {
      if (annotEditingId === id) annotEditingId = null;
      el.classList.remove('annot-visible');
      setTimeout(() => focusCamera(false), 20);
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { ta.blur(); e.preventDefault(); }
    });
  });
}

function wireClicks() {
  flatChunks.forEach((entry, idx) => {
    entry.el.addEventListener('click', (ev) => {
      // Overview: click selects (no camera move, no expansion, no annotate).
      if (overview) { setSelectedIdx(idx); return; }
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
function cycleCollapse(dir = 1) {
  const i = COLLAPSE_MODES.indexOf(state.collapse);
  const ni = (i + dir + COLLAPSE_MODES.length) % COLLAPSE_MODES.length;
  state.collapse = COLLAPSE_MODES[ni];
  applyState();
  focusCamera(false);
  flashMode('collapse: ' + COLLAPSE_LABEL[state.collapse]);
}

// Zoom
function setZoom(z) {
  state.zoom = Math.round(Math.max(0.6, Math.min(2.2, z)) * 20) / 20;
  document.documentElement.style.setProperty('--zoom', state.zoom);
  setTimeout(() => focusCamera(false), 30);
  broadcastState();
  flashMode('zoom: ' + state.zoom.toFixed(2) + '×');
}

// Mode badge
let modeTimer = null;
function flashMode(text) {
  modeBadge.textContent = text;
  modeBadge.classList.add('visible');
  if (modeTimer) clearTimeout(modeTimer);
  modeTimer = setTimeout(() => modeBadge.classList.remove('visible'), 1500);
}

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('.annot-textarea')) return;
  // Search input: Enter commits, Esc exits search; other keys bubble to input.
  if (e.target === searchInput) {
    if (e.key === 'Enter') { commitSearchFirstMatch(); e.preventDefault(); }
    else if (e.key === 'Escape') { endSearch(); e.preventDefault(); }
    // typing is handled by the 'input' event listener on the input
    return;
  }
  if (e.target.matches('input,textarea')) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  switch (e.key) {
    case 'ArrowRight': nextCol(); e.preventDefault(); break;
    case 'ArrowLeft':  prevCol(); e.preventDefault(); break;
    case 'ArrowDown':  nextChunk(); e.preventDefault(); break;
    case 'ArrowUp':    prevChunk(); e.preventDefault(); break;
    case ' ': {
      // Space: advance reveal; if fully revealed, pass through to next chunk.
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
      if (focusedFigure) {
        unfocusFigure();
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
        break;
      }
      if (tocVisible) { tocVisible = false; document.body.classList.remove('toc-visible'); break; }
      if (overview) {
        dismissOverviewNoMove();
        if (shouldBroadcast()) sendToPeer({ type: 'overview', active: false });
        break;
      }
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
    case 'o': case 'O':
      toggleOverview();
      if (shouldBroadcast()) sendToPeer({ type: 'overview', active: overview });
      e.preventDefault(); break;
    case 't': case 'T': toggleToc(); e.preventDefault(); break;
    case '/': if (overview) { startSearch(); e.preventDefault(); } break;
    case '+': case '=': setZoom(state.zoom + 0.1); e.preventDefault(); break;
    case '-': case '_': setZoom(state.zoom - 0.1); e.preventDefault(); break;
    case '0': setZoom(1.35); e.preventDefault(); break;
    case 'b': case 'B':
      state.blanked = !state.blanked;
      document.body.classList.toggle('blanked', state.blanked);
      broadcastState();
      e.preventDefault(); break;
    case 'p': case 'P':
      // In the speaker view, Shift-P is the push-to-audience toggle;
      // plain P still opens the print view in a new tab.
      if (VIEW === 'speaker' && e.shiftKey && typeof togglePush === 'function') {
        togglePush();
      } else {
        window.open('print.html', '_blank');
      }
      e.preventDefault(); break;
    case 'e': case 'E':
      // Shift-E on the speaker copies live annotation drafts to the
      // clipboard for paste-back into source.md. Plain E is unbound.
      if (VIEW === 'speaker' && e.shiftKey && typeof exportAnnotations === 'function') {
        exportAnnotations();
        e.preventDefault();
      }
      break;
    case '.':
      if (VIEW === 'speaker' && typeof forcePush === 'function') {
        forcePush();
        e.preventDefault();
      }
      break;
    case 'v': case 'V':
      if (VIEW === 'speaker' && typeof togglePreviewOrientation === 'function') {
        togglePreviewOrientation();
        e.preventDefault();
      }
      break;
    case 's': case 'S':
      // Only in audience: open the speaker window and remember it as our peer.
      if (VIEW === 'audience') {
        const w = window.open('speaker.html', 'psi-slides-speaker', 'width=1400,height=900');
        setPeer(w);
        e.preventDefault();
      }
      break;
    case '?':
      document.getElementById('hints').classList.toggle('hidden');
      e.preventDefault(); break;
  }
});

// Search input: live-filter on every keystroke.
searchInput.addEventListener('input', updateSearch);

// Overview: wheel adjusts scale, pointer drag pans.
viewport.addEventListener('wheel', (e) => {
  if (!overview) return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  overviewScale = Math.max(0.08, Math.min(1, overviewScale * factor));
  applyOverviewCamera(false);
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
  // Skip drag on interactive children so click-to-select still works.
  if (e.target.closest('button, textarea, input, .annot-box, .exp-chev, .annot-add, nav#toc')) return;
  // Two pan modes share this handler: in overview, any drag pans; in
  // normal view, shift+drag pans (chunk-local, reset on navigation).
  const mode = overview ? 'overview' : (e.shiftKey ? 'view' : null);
  if (!mode) return;
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
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) return;
    document.body.classList.remove(dragClass);
    // Swallow the synthesized click that follows a real drag, so a pan
    // doesn't accidentally select/jump on mouse-up.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

window.addEventListener('resize', () => focusCamera(true));

// ── figure focus / marginalia pan (§figures) ────────────────────────
// Click a <figure>, a <pre>, or a .marginalia inside the active chunk
// to "focus" it: figures/pre land in a centered overlay with the slide
// dimmed underneath; .marginalia instead pans the camera right so the
// aside is centered in the viewport (no overlay – it's in-frame).
const figureOverlay = document.getElementById('figure-overlay');
let focusedFigure = null;
function unfocusFigure() {
  if (!focusedFigure) return;
  focusedFigure = null;
  figureOverlay.replaceChildren();
  document.body.classList.remove('figure-focused');
}
function focusFigure(el) {
  unfocusFigure();
  const clone = el.cloneNode(true);
  clone.classList.add('figure-focus-target');
  clone.removeAttribute('id');
  figureOverlay.replaceChildren(clone);
  document.body.classList.add('figure-focused');
  focusedFigure = clone;
}
figureOverlay.addEventListener('click', () => {
  unfocusFigure();
  if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
});

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

function wireFigureClicks() {
  flatChunks.forEach(({ el }) => {
    el.querySelectorAll('figure.figure-img, .chunk-body pre, .marginalia').forEach(target => {
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
            const figureIdx = Array.from(chunk.querySelectorAll('figure.figure-img, .chunk-body pre, .marginalia')).indexOf(target);
            sendToPeer({ type: 'figure-pan', chunkIdx: state.activeIdx, figureIdx });
          }
          return;
        }
        focusFigure(target);
        if (shouldBroadcast()) {
          const figureIdx = Array.from(chunk.querySelectorAll('figure.figure-img, .chunk-body pre, .marginalia')).indexOf(target);
          sendToPeer({ type: 'figure-focus', chunkIdx: state.activeIdx, figureIdx });
        }
      });
    });
  });
}

// Boot
loadPersisted();
applyFontTheme();
document.querySelectorAll('.reveal-segment').forEach(seg => splitSentencesIn(seg));
wireAnnotations();
wireClicks();
wireFigureClicks();
applyRevealAll();
applyState();
// Two rAFs so fonts have a chance to settle before the first camera solve.
requestAnimationFrame(() => requestAnimationFrame(() => focusCamera(true)));
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => focusCamera(true));
}
`;

// ── speaker rendering ────────────────────────────────────────────────

function renderSpeaker(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = lectureTitle(frontmatter);
  const columnsHtml = renderColumnsHtml(columns, frontmatter);

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} – speaker</title>
<style>
${AUDIENCE_CSS}
${SPEAKER_CSS}
</style>
${reloadScript(opts.watchPort)}
</head>
<body data-collapse="topic-bold" data-view="speaker" data-font="serif" data-theme="light-red">
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
  <textarea id="notes-content" rows="1" spellcheck="false" placeholder=""></textarea>
</aside>
<div id="preview-strip"></div>
<div id="figure-overlay" aria-hidden="true"></div>
<footer id="speaker-footer">
  <span id="timer">00:00</span>
  <span id="push-indicator" class="push-on">push ●</span>
  <button id="export-annot-btn" type="button" title="Copy live annotations as &gt; annot: Markdown (Shift-E)">export notes</button>
  <span id="slug">${escapeHtml(slug)}</span>
  <span class="spacer"></span>
  <span class="kbd-hint"><kbd>N</kbd> annot &nbsp; <kbd>Shift</kbd>-<kbd>N</kbd> notes &nbsp; <kbd>Shift</kbd>-<kbd>E</kbd> export &nbsp; <kbd>V</kbd> preview &nbsp; <kbd>Shift</kbd>-<kbd>P</kbd> push &nbsp; <kbd>.</kbd> force &nbsp; <kbd>?</kbd> all</span>
</footer>
<div id="note-templates">
${noteTemplates.join('\n')}
</div>
<div id="hints" class="hidden">
  <kbd>←</kbd><kbd>→</kbd> column &nbsp; <kbd>↑</kbd><kbd>↓</kbd> chunk &nbsp; <kbd>Space</kbd> reveal<br>
  <kbd>Enter</kbd>/<kbd>1</kbd>–<kbd>9</kbd> expand &nbsp; <kbd>N</kbd> annot &nbsp; <kbd>Shift</kbd>-<kbd>N</kbd> notes &nbsp; <kbd>C</kbd> collapse<br>
  <kbd>O</kbd> overview &nbsp; <kbd>T</kbd> toc &nbsp; <kbd>/</kbd> search &nbsp; <kbd>V</kbd> preview view &nbsp; <kbd>B</kbd> blank<br>
  <kbd>F</kbd> font &nbsp; <kbd>A</kbd> accent/theme &nbsp;
  <kbd>Shift</kbd>-<kbd>P</kbd> push &nbsp; <kbd>.</kbd> force push &nbsp; <kbd>P</kbd> print
</div>
<div id="mode-badge"></div>
${OVERVIEW_BADGE_HTML}
${renderTocNav(columns)}
<script>
const LECTURE_TITLE = ${titleJson};
${AUDIENCE_JS}
${SPEAKER_JS}
</script>
</body>
</html>
`;
}

// ── speaker CSS (layered on top of AUDIENCE_CSS) ─────────────────────

const SPEAKER_CSS = `
body[data-view=speaker] {
  display: grid;
  /* scrubber · stage · notes (auto, collapses to 0 when empty) ·
     preview-strip · footer */
  grid-template-rows: 3vh 1fr auto 22vh 2.2rem;
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
}
#notes-content {
  flex: 1;
  width: 100%;
  border: 0;
  outline: 0;
  resize: none;
  padding: 0.6rem 1rem;
  background: transparent;
  color: var(--ink);
  font-family: var(--sans-font);
  font-size: 1.15rem;
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

/* bottom: preview strip – horizontal scroll of all chunks, drag or
   wheel to pan, click to jump. The active slot is highlighted and
   automatically scrolled into view on chunk change. */
#preview-strip {
  grid-row: 4;
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
#speaker-footer #push-indicator {
  font-variant-caps: all-small-caps;
  letter-spacing: 0.14em;
  font-weight: 600;
}
#speaker-footer #push-indicator.push-on  { color: oklch(0.55 0.16 150); }
#speaker-footer #push-indicator.push-off { color: var(--ink-soft); opacity: 0.55; }
#speaker-footer #slug { color: var(--ink-soft); font-style: italic; }
#speaker-footer .spacer { flex: 1; }
#speaker-footer .kbd-hint { font-size: 10px; opacity: 0.7; }
#speaker-footer kbd { padding: 0 3px; border: 1px solid var(--rule); background: oklch(0.96 0 0); color: var(--ink); font-family: var(--mono-font); font-size: 9px; }
#speaker-footer #export-annot-btn {
  font: inherit;
  padding: 2px 8px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: oklch(0.97 0 0);
  color: var(--ink);
  cursor: pointer;
}
#speaker-footer #export-annot-btn:hover { background: oklch(0.93 0 0); }

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
  grid-template-columns: 1fr clamp(180px, 18vw, 300px);
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
`;

// ── speaker-specific runtime (loaded after AUDIENCE_JS) ──────────────

const SPEAKER_JS = `
const notesContent = document.getElementById('notes-content');
const notesPane = document.getElementById('notes-pane');
const previewStrip = document.getElementById('preview-strip');
const scrubberEl = document.getElementById('scrubber');
const timerEl = document.getElementById('timer');
const pushIndicator = document.getElementById('push-indicator');
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

let pushEnabled = true;
viewHooks.shouldBroadcast = () => pushEnabled;
function togglePush() {
  pushEnabled = !pushEnabled;
  pushIndicator.classList.toggle('push-on', pushEnabled);
  pushIndicator.classList.toggle('push-off', !pushEnabled);
  pushIndicator.textContent = pushEnabled ? 'push ●' : 'push ○';
  flashMode(pushEnabled ? 'push on' : 'push off');
}
function forcePush() {
  // Bypass the push gate with a direct send.
  if (isApplyingRemote) return;
  sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
  flashMode('force push');
}

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
  flashMode('drafts cleared');
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
    flashMode('no annotations to export');
    return;
  }
  const snippet = buildAnnotationSnippet(drafts);
  const copied = await copyToClipboardSafe(snippet);
  flashMode(copied
    ? drafts.length + ' annotation' + (drafts.length === 1 ? '' : 's') + ' copied'
    : 'clipboard blocked — copy manually');
  showExportModal({ drafts, snippet, clipboardOk: copied });
}

const exportAnnotBtn = document.getElementById('export-annot-btn');
if (exportAnnotBtn) exportAnnotBtn.addEventListener('click', exportAnnotations);

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
  // Pane stays open while the textarea is focused so the author can
  // type into an empty pane (Shift-N / + note btn). On blur the class
  // drops back to hasText and an untouched pane collapses again.
  const keepOpen = hasText || document.activeElement === notesContent;
  document.body.classList.toggle('has-notes', keepOpen);
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
    clone.querySelectorAll('.exps, .annot-box, .annot-add').forEach(n => n.remove());
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
  flashMode('preview · ' + next);
  populatePreviewStrip();
}

// The in-stage "+ note" overlay is an alternative entry point to
// Shift-N. Visible only while the notes pane is collapsed; the CSS
// hides it once has-notes lands on body.
document.getElementById('add-note-btn')?.addEventListener('click', () => {
  focusNotesPane();
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
  const { x, y, chunkIdx } = laserPending;
  laserPending = null;
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx, x, y });
}
viewport.addEventListener('pointermove', (ev) => {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const r = entry.el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (!laserPending) requestAnimationFrame(maybeSendLaser);
  laserPending = { x, y, chunkIdx: state.activeIdx };
});
viewport.addEventListener('pointerleave', () => {
  // Tell audience to drop the dot when the speaker mouse leaves the stage.
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

// ── CLI ──────────────────────────────────────────────────────────────

// Build the three HTML outputs for a single source file. Returns the
// list of written paths and the lecture shape string. Throws on parse
// errors – callers in --watch wrap this so a single bad save does not
// kill the watcher.
function buildOnce(absIn, only, opts = {}) {
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
  // Auto-inline decision when neither --inline-images nor --no-inline-images
  // was passed: scan referenced images, inline iff total fits AUTO_INLINE_BUDGET.
  // Either way log the decision so authors notice when a deck silently flips
  // from inlined back to external (e.g. after adding a heavy asset).
  let inlineImages = opts.inlineImages;
  if (inlineImages === undefined) {
    const { total, count } = scanReferencedImages(src, outDir);
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
  const lecture = parseLecture(src);
  const chunkCount = lecture.columns.reduce((n, c) => n + c.chunks.length, 0);
  const shape = `${lecture.columns.length} columns, ${chunkCount} chunks`;

  const targets = [
    ['print',    renderDocument],
    ['audience', renderAudience],
    ['speaker',  renderSpeaker],
  ].filter(([name]) => !only || only === `--${name}-only`);

  const written = [];
  for (const [name, render] of targets) {
    const p = path.join(outDir, `${name}.html`);
    fs.writeFileSync(p, render(lecture, opts));
    written.push(path.relative(process.cwd(), p));
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
  const wss = new WebSocketServer({ port: 0 });
  await new Promise(resolve => wss.on('listening', resolve));
  const port = wss.address().port;
  const opts = { ...baseOpts, watchPort: port };

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

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter(a => !a.startsWith('--'));

  if (flags.has('--new')) {
    runNew(positional[0]);
    return;
  }

  // Shiki must be ready before any renderer runs (the highlighter
  // singleton is shared across --watch rebuilds).
  await initHighlighter();

  const [inputPath] = positional;

  if (!inputPath || flags.has('--help') || flags.has('-h')) {
    console.error('Usage:');
    console.error('  node build.js <source.md> [--watch] [--audience-only|--print-only|--speaker-only]');
    console.error('                            [--inline-images|--no-inline-images]');
    console.error('  node build.js <source.md> --integrate-annotations');
    console.error('  node build.js --new <slug>');
    console.error('');
    console.error('Image inlining (default: auto – inline iff referenced images sum < 10 MB; per-image cap 2 MB):');
    console.error('  --inline-images       force inlining regardless of total size');
    console.error('  --no-inline-images    force external asset paths');
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

  const onlyFlags = ['--audience-only', '--print-only', '--speaker-only'].filter(f => flags.has(f));
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

  if (flags.has('--watch')) {
    runWatch(absIn, only, opts).catch(err => {
      console.error(`Watch failed: ${err.message}`);
      process.exit(1);
    });
    return;
  }

  const { written, shape } = buildOnce(absIn, only, opts);
  console.log(`Wrote ${written.join(', ')} (${shape})`);
}

main().catch(err => { console.error(err); process.exit(1); });
