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

const VALID_TAGS = new Set([
  'title', 'principle', 'definition', 'example',
  'question', 'figure', 'exercise', 'free',
]);

const VALID_WIDTHS = new Set(['narrow', 'standard', 'wide', 'full']);

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
    return { tag: m[1], heading: m[2].trim() };
  }
  return { heading: text.trim() };
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

  const flushChunk = () => {
    if (!currentChunk) return;
    flushNoteBlock();
    flushExpansion();
    // Split body at standalone `---` lines into reveal segments (§4.6).
    // `---` inside a ``` fenced code block stays part of the segment.
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
    // Print back-compat: body is the segments re-joined (fully revealed).
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
        const { tag, heading } = parseTagPrefix(text);
        currentChunk = {
          tag,
          heading,
          width: width || 'standard',
          id,
          expansions: [],
          speakerNotes: pendingNotes,
        };
        pendingNotes = [];
        continue;
      }

      // Speaker-note blockquotes. `> note: ...` opens a note block; any
      // following `> ...` continuation lines extend the same block until
      // a non-blockquote line ends it. Notes appearing before any chunk
      // are buffered in pendingNotes and attached to the next chunk (so
      // e.g. a `> note:` placed right under a column header still lands
      // on the first chunk of that column). Stripped from audience + print.
      const noteOpen = line.match(/^>\s*note:\s*(.*)$/i);
      if (noteOpen) {
        flushNoteBlock();
        noteBlock = { lines: [noteOpen[1]] };
        continue;
      }
      if (noteBlock) {
        const noteCont = line.match(/^>\s?(.*)$/);
        if (noteCont) { noteBlock.lines.push(noteCont[1]); continue; }
        flushNoteBlock();
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
        // :::  –  closes the open aside.
        if (/^:::\s*$/.test(line) && currentExpansion) {
          flushExpansion();
          continue;
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

function renderChunk(chunk, frontmatter) {
  const { tag, heading, body = '', id, width, expansions = [] } = chunk;
  const bodyHtml = body ? marked.parse(body) : '';

  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

  if (tag === 'title') {
    return `<article class="chunk chunk-title"${idAttr}>
  ${renderTitleBlock({ ...frontmatter, bodyHtml })}
</article>`;
  }

  const labelTag = tag && tag !== 'free' ? tag : null;
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

  return `<article class="${classes}"${idAttr}>
  ${label}
  ${heading ? `<h2 class="chunk-heading">${escapeHtml(heading)}</h2>` : ''}
  ${bodyHtml}
  ${expansionsHtml}
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
  const title = frontmatter.title || 'Untitled lecture';
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

@page { size: A4; margin: 2.2cm 2cm 2.5cm; }

* { box-sizing: border-box; }
html { font-family: var(--serif); color: var(--ink); line-height: 1.55; background: var(--paper); }
body { margin: 0; }

main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; }

h1, h2, h3 { font-weight: 500; letter-spacing: -0.01em; }
p { margin: 0.4em 0 0.9em; }
strong { color: var(--emph); font-weight: 600; }
em { font-style: italic; }

ul, ol { margin: 0.4em 0 0.9em 1.4em; }
li { margin: 0.2em 0; }
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

.column { margin: 0 0 3rem; page-break-before: always; }
.column-anon { page-break-before: auto; margin-top: 0; }
.column-heading {
  font-size: 1.9rem;
  margin: 0 0 1.8rem;
  padding-bottom: 0.4rem;
  border-bottom: 0.5pt solid var(--rule);
}

.chunk {
  margin: 1.6rem 0 2.2rem;
  page-break-inside: avoid;
}
.chunk-heading {
  font-size: 1.12rem;
  margin: 0 0 0.5rem;
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
  if (l.startsWith('note')) return 'N.B.';
  return l.slice(0, 3).replace(/^./, c => c.toUpperCase());
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

  const { tag, heading, segments = [], id, width, expansions = [] } = chunk;
  const chunkId = id || `c${colIdx}-${chunkIdx}`;
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

  const labelTag = tag && tag !== 'free' && tag !== 'exercise' ? tag : null;
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

  const headingHtml = heading ? `<h2 class="chunk-heading">${escapeHtml(heading)}</h2>` : '';

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
      <textarea class="annot-textarea" placeholder="Note… (Enter for newline, Esc to exit)" rows="1"></textarea>
    </aside>
    <button class="annot-add" type="button" data-annot-add>+ note</button>
  </div>
  ${chevsHtml}
  ${expBodiesHtml}
</article>`;
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

function renderAudience(lecture, opts = {}) {
  const { frontmatter, columns } = lecture;
  const title = frontmatter.title || 'Untitled lecture';
  const columnsHtml = columns.map((col, ci) => {
    const chunks = col.chunks
      .map((c, xi) => renderAudienceChunk(c, frontmatter, ci, xi))
      .join('\n');
    const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
    return `<section class="column" data-col="${ci}"${idAttr}>
${chunks}
</section>`;
  }).join('\n');

  const titleJson = JSON.stringify(title);

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
<body data-collapse="topic-bold">
<div id="stage-viewport">
  <div id="stage">
${columnsHtml}
  </div>
</div>
<div id="hints">
  <kbd>←</kbd><kbd>→</kbd> column &nbsp; <kbd>↑</kbd><kbd>↓</kbd> chunk &nbsp; <kbd>Space</kbd> reveal<br>
  <kbd>Enter</kbd>/<kbd>1</kbd>–<kbd>9</kbd> expand &nbsp; <kbd>N</kbd> annotate &nbsp; <kbd>C</kbd> collapse<br>
  <kbd>O</kbd> overview &nbsp; <kbd>T</kbd> toc &nbsp; <kbd>/</kbd> search &nbsp; <kbd>P</kbd> print &nbsp; <kbd>B</kbd> blank<br>
  <kbd>+</kbd><kbd>-</kbd><kbd>0</kbd> zoom &nbsp; <kbd>?</kbd> hide
</div>
<div id="mode-badge"></div>
<div id="overview-badge">
  <span class="hint">overview · drag · wheel · click · <kbd>O</kbd>/<kbd>Enter</kbd> land · <kbd>/</kbd> search · <kbd>Esc</kbd></span>
  <input id="search-input" type="text" placeholder="search..." autocomplete="off" spellcheck="false">
</div>
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
  --slide-pad-y: 4.9vh;
  --slide-height: 40vh;
  --chunk-gap: 4vh;
  --body-font: 'Literata', 'Source Serif 4', Georgia, serif;
  --sans-font: 'Inter Tight', system-ui, sans-serif;
  --mono-font: 'JetBrains Mono', Menlo, monospace;
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body-font);
  font-size: clamp(20px, 2.6vh, 38px);
}

/* stage */
#stage-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--paper);
}
#stage {
  position: absolute;
  top: 0; left: 0;
  display: flex;
  align-items: stretch;
  gap: 8vw;
  transform-origin: 0 0;
  transition: transform var(--camera-duration) cubic-bezier(0.45, 0, 0.2, 1);
  will-change: transform;
}
.column {
  display: flex;
  flex-direction: column;
  gap: var(--chunk-gap);
  flex-shrink: 0;
  width: 100vw;
  position: relative;
}

/* chunk = slide */
.chunk {
  position: relative;
  width: 100vw;
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
.chunk-body strong { font-weight: 600; color: var(--emph); }
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
  text-align: left; /* defensive: don't inherit parent text-align into preformatted text */
}

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
.chunk[data-tag=figure] .chunk-body { order: 3; max-width: 40em; text-align: center; font-size: calc(0.9em * var(--zoom)); color: var(--ink-soft); }
.chunk[data-tag=figure] .chunk-heading { order: 2; }
.chunk[data-tag=figure] .tag-label { order: 0; }
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

/* expanded: split the slide grid into content-left + expansion-right */
.chunk.expanded {
  grid-template-columns: minmax(0, var(--content-w, 36em)) minmax(0, 30em);
  gap: 6%;
}
.chunk.expanded .chunk-content { grid-column: 1; }
.exp-body { display: none; }
.chunk.expanded .exp-body.on {
  display: block;
  grid-column: 2;
  align-self: center;
  font-size: calc(0.92em * var(--zoom));
  line-height: 1.5;
  color: var(--ink);
  background: var(--paper);
  padding: 1.2em 1.6em;
  border: 1px solid var(--rule);
  border-left: 2px solid var(--ink);
}
.exp-body .tag-label { text-align: left; font-size: 0.72em; margin-bottom: 0.3em; }
.exp-body p { margin: 0 0 0.6em; }
.exp-body p:last-child { margin-bottom: 0; }
.exp-body strong { font-weight: 600; color: var(--emph); }

/* focus / dim (§2 neighbor behavior: dim mode) */
.chunk:not(.active) {
  opacity: calc(1 - var(--dim) * 0.96);
  transition: opacity 500ms ease;
}
.chunk.active { opacity: 1; }

/* collapse modes (§4.5) – applied per reveal-segment */
[data-collapse=topic] .reveal-segment p:nth-of-type(n+2) { display: none; }
[data-collapse=topic] .reveal-segment .sentence-rest { display: none; }

[data-collapse=bold] .reveal-segment p:not(:has(strong)) { display: none; }
[data-collapse=bold] .reveal-segment li:not(:has(strong)) { display: none; }
[data-collapse=bold] .reveal-segment .sentence-rest .prose { display: none; }
[data-collapse=bold] .reveal-segment pre { display: none; }

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

/* overview mode (PRD §5) ------------------------------------------- */
body.overview-mode #stage-viewport { cursor: grab; }
body.overview-mode #stage-viewport:active { cursor: grabbing; }
body.overview-mode #stage { transition: transform var(--camera-duration) cubic-bezier(0.45, 0, 0.2, 1); }
body.overview-mode.overview-dragging #stage { transition: none; }
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
#toc {
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
body.toc-visible #toc { transform: translateX(0); }
#toc h2 {
  font-family: var(--sans-font);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: var(--ink-soft);
  font-weight: 500;
  margin: 0 0 1.2rem;
}
#toc ol { list-style: decimal outside; padding-left: 1.6em; margin: 0; }
#toc li { margin: 0.5em 0; }
#toc button {
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
#toc button:hover { color: var(--emph); }
#toc li.toc-active button { font-weight: 600; color: var(--emph); }
`;

// ── audience runtime JS (inlined verbatim into the output HTML) ──────

const AUDIENCE_JS = `
const STORAGE_PREFIX = 'psi-lecdoc:';
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
};
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

function loadPersisted() {
  try {
    const raw = localStorage.getItem(storageKey('annotations'));
    if (raw) annotations = JSON.parse(raw) || {};
  } catch (e) {}
  try {
    const pos = localStorage.getItem(storageKey('activeIdx'));
    if (pos !== null) state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, parseInt(pos, 10) || 0));
  } catch (e) {}
}
function saveAnnotations() {
  try { localStorage.setItem(storageKey('annotations'), JSON.stringify(annotations)); } catch (e) {}
}
function saveActive() {
  try { localStorage.setItem(storageKey('activeIdx'), String(state.activeIdx)); } catch (e) {}
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
    state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, payload.activeIdx || 0));
    state.collapse = payload.collapse || 'topic-bold';
    state.zoom = payload.zoom || 1.35;
    state.blanked = !!payload.blanked;
    Object.keys(revealed).forEach(k => delete revealed[k]);
    Object.assign(revealed, payload.revealed || {});
    Object.keys(annotations).forEach(k => delete annotations[k]);
    Object.assign(annotations, payload.annotations || {});
    // Reflect annotation text into the textareas so the other view sees
    // keystrokes landing in real time.
    flatChunks.forEach(c => {
      const ta = c.el.querySelector('.annot-textarea');
      if (!ta) return;
      const v = annotations[c.id] || '';
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
  }
});

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
      } else if (mode === 'head') head.appendChild(k.cloneNode(true));
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
  const vp = viewport.getBoundingClientRect();
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
  const vp = viewport.getBoundingClientRect();
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

function toggleOverview() {
  if (overview) {
    // Exit: land on whatever was selected. If unchanged from active, it's a
    // no-op camera translation, which is exactly the right behavior.
    endSearch(); // leaving overview also leaves search
    overview = false;
    document.body.classList.remove('overview-mode');
    manualPan = { dx: 0, dy: 0 };
    if (selectedIdx !== state.activeIdx) {
      state.activeIdx = selectedIdx;
      applyState();
      saveActive();
    }
    flatChunks.forEach(c => c.el.classList.remove('overview-selected'));
    focusCamera(false);
  } else {
    overview = true;
    document.body.classList.add('overview-mode');
    manualPan = { dx: 0, dy: 0 };
    setSelectedIdx(state.activeIdx);
    applyOverviewCamera(false);
  }
}

function dismissOverviewNoMove() {
  if (!overview) return;
  endSearch();
  overview = false;
  document.body.classList.remove('overview-mode');
  manualPan = { dx: 0, dy: 0 };
  flatChunks.forEach(c => c.el.classList.remove('overview-selected'));
  focusCamera(false);
}

// TOC panel – flat list of named columns (see renderAudience).
function toggleToc() {
  tocVisible = !tocVisible;
  document.body.classList.toggle('toc-visible', tocVisible);
  if (tocVisible) markTocActive();
}
function markTocActive() {
  const curColIdx = flatChunks[state.activeIdx]?.colIdx;
  document.querySelectorAll('#toc li').forEach(li => {
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
  closeAnyExpansion();

  const target = flatChunks[idx];
  const segCount = countSegments(target.el);
  if (direction === 'back') {
    // Backward nav: target shows fully revealed (§4.6).
    revealed[target.id] = segCount;
  } else if (revealed[target.id] === undefined) {
    // First forward visit: only segment 0 visible.
    revealed[target.id] = segCount ? 1 : 0;
  }
  // Otherwise: preserve whatever state it was in (revisit = already shown).
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
  const cur = flatChunks[state.activeIdx];
  const nxt = flatChunks[state.activeIdx + 1];
  if (!nxt) return;
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
    const existing = annotations[id] || '';
    ta.value = existing;
    if (existing.trim()) el.classList.add('has-annot');
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
  document.querySelectorAll('#toc li').forEach(li => {
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

// Collapse cycle
const COLLAPSE_MODES = ['none', 'topic', 'topic-bold', 'bold'];
function cycleCollapse(dir = 1) {
  const i = COLLAPSE_MODES.indexOf(state.collapse);
  const ni = (i + dir + COLLAPSE_MODES.length) % COLLAPSE_MODES.length;
  state.collapse = COLLAPSE_MODES[ni];
  applyState();
  flashMode('collapse: ' + state.collapse);
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
      if (tocVisible) { tocVisible = false; document.body.classList.remove('toc-visible'); break; }
      if (overview) { dismissOverviewNoMove(); break; }
      if (annotEditingId) { blurAnnotation(); break; }
      if (openExp) { closeAnyExpansion(); broadcastState(); setTimeout(() => focusCamera(false), 20); }
      break;
    }
    case 'n': case 'N': {
      if (overview) break;
      const entry = flatChunks[state.activeIdx];
      if (entry) viewHooks.onN(entry);
      e.preventDefault(); break;
    }
    case 'c': case 'C': cycleCollapse(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case 'o': case 'O': toggleOverview(); e.preventDefault(); break;
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
    case '.':
      if (VIEW === 'speaker' && typeof forcePush === 'function') {
        forcePush();
        e.preventDefault();
      }
      break;
    case 's': case 'S':
      // Only in audience: open the speaker window and remember it as our peer.
      if (VIEW === 'audience') {
        const w = window.open('speaker.html', 'psi-lecdoc-speaker', 'width=1400,height=900');
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
  if (e.target.closest('button, textarea, input, .annot-box, .exp-chev, .annot-add, #toc')) return;
  if (!overview) return;
  // Don't preventDefault and don't setPointerCapture eagerly: the
  // capture would re-target pointerup to viewport, breaking the
  // synthesized click on the underlying chunk. Instead listen on the
  // window and only enter "dragging" mode after a real move.
  const session = { x: e.clientX, y: e.clientY, dx0: manualPan.dx, dy0: manualPan.dy, moved: false };
  const move = (ev) => {
    const dx = ev.clientX - session.x, dy = ev.clientY - session.y;
    if (!session.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      session.moved = true;
      document.body.classList.add('overview-dragging');
    }
    if (!session.moved) return;
    manualPan.dx = session.dx0 + dx;
    manualPan.dy = session.dy0 + dy;
    applyOverviewCamera(true);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) return;
    document.body.classList.remove('overview-dragging');
    // Swallow the synthesized click that follows a real drag, so a pan
    // doesn't accidentally select a chunk on mouse-up.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

window.addEventListener('resize', () => focusCamera(true));

// Boot
loadPersisted();
document.querySelectorAll('.reveal-segment').forEach(seg => splitSentencesIn(seg));
wireAnnotations();
wireClicks();
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
  const title = frontmatter.title || 'Untitled lecture';

  const columnsHtml = columns.map((col, ci) => {
    const chunks = col.chunks
      .map((c, xi) => renderAudienceChunk(c, frontmatter, ci, xi))
      .join('\n');
    const idAttr = col.id ? ` id="${escapeHtml(col.id)}"` : '';
    return `<section class="column" data-col="${ci}"${idAttr}>
${chunks}
</section>`;
  }).join('\n');

  // Speaker notes are rendered to HTML at build time (trusted source)
  // and emitted as <template> fragments. JS clones template content into
  // the notes pane – no innerHTML assignment at runtime.
  const noteTemplates = [];
  for (const col of columns) for (const c of col.chunks) {
    if (c.id && c.speakerNotes && c.speakerNotes.length) {
      const inner = c.speakerNotes.map(n => marked.parse(n)).join('\n');
      noteTemplates.push(
        `<template data-notes-for="${escapeHtml(c.id)}">${inner}</template>`
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
  const titleJson = JSON.stringify(title);

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
<body data-collapse="topic-bold" data-view="speaker">
<div id="scrubber">
${scrubberHtml}
</div>
<div id="speaker-main">
  <div id="stage-viewport">
    <div id="stage">
${columnsHtml}
    </div>
  </div>
  <aside id="notes-pane" tabindex="0">
    <div id="notes-content"></div>
  </aside>
</div>
<div id="preview-strip"></div>
<footer id="speaker-footer">
  <span id="timer">00:00</span>
  <span id="push-indicator" class="push-on">push ●</span>
  <span id="slug">${escapeHtml(slug)}</span>
  <span class="spacer"></span>
  <span class="kbd-hint"><kbd>Shift</kbd>-<kbd>P</kbd> push &nbsp; <kbd>.</kbd> force push &nbsp; <kbd>?</kbd> hints</span>
</footer>
<div id="note-templates">
${noteTemplates.join('\n')}
</div>
<div id="hints" class="hidden">
  <kbd>←</kbd><kbd>→</kbd> column &nbsp; <kbd>↑</kbd><kbd>↓</kbd> chunk &nbsp; <kbd>Space</kbd> reveal<br>
  <kbd>Enter</kbd>/<kbd>1</kbd>–<kbd>9</kbd> expand &nbsp; <kbd>N</kbd> notes &nbsp; <kbd>C</kbd> collapse<br>
  <kbd>O</kbd> overview &nbsp; <kbd>T</kbd> toc &nbsp; <kbd>/</kbd> search &nbsp; <kbd>B</kbd> blank<br>
  <kbd>Shift</kbd>-<kbd>P</kbd> push &nbsp; <kbd>.</kbd> force push &nbsp; <kbd>P</kbd> print
</div>
<div id="mode-badge"></div>
<div id="overview-badge">
  <span class="hint">overview · drag · wheel · click · <kbd>O</kbd>/<kbd>Enter</kbd> land · <kbd>/</kbd> search · <kbd>Esc</kbd></span>
  <input id="search-input" type="text" placeholder="search..." autocomplete="off" spellcheck="false">
</div>
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
  grid-template-rows: 3vh 1fr 22vh 2.2rem;
  grid-template-columns: 1fr;
  overflow: hidden;
}
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

/* middle row: stage viewport + notes pane */
#speaker-main {
  grid-row: 2;
  display: grid;
  grid-template-columns: 1fr 26em;
  min-height: 0;
  overflow: hidden;
}
body[data-view=speaker] #stage-viewport {
  width: auto;
  height: 100%;
  grid-column: 1;
}
#notes-pane {
  grid-column: 2;
  border-left: 1px solid var(--rule);
  padding: 1.5rem 1.5rem 1rem;
  overflow-y: auto;
  background: var(--paper-warm);
  font-family: var(--body-font);
  font-size: 0.95rem;
  line-height: 1.5;
}
#notes-pane:focus { outline: 2px solid oklch(0.55 0.12 220); outline-offset: -2px; }
#notes-content:empty::before {
  content: 'no notes for this chunk';
  color: var(--ink-soft);
  font-style: italic;
  font-size: 0.88rem;
}
#notes-content p  { margin: 0 0 0.7em; }
#notes-content strong { color: var(--emph); }

/* bottom: preview strip */
#preview-strip {
  grid-row: 3;
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--rule);
  background: var(--paper);
  overflow: hidden;
}
.preview-slot {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--rule);
  background: var(--paper);
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
  opacity: 0.8;
}
.preview-slot .chunk-clone {
  transform-origin: top left;
  pointer-events: none;
}
.preview-slot.empty { border-style: dashed; opacity: 0.4; }

/* footer */
#speaker-footer {
  grid-row: 4;
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

/* Hide the annotation "+ note" affordance in speaker – speaker has the
   notes pane for author-written notes. */
body[data-view=speaker] .annot-add { display: none !important; }
`;

// ── speaker-specific runtime (loaded after AUDIENCE_JS) ──────────────

const SPEAKER_JS = `
const notesContent = document.getElementById('notes-content');
const notesPane = document.getElementById('notes-pane');
const previewStrip = document.getElementById('preview-strip');
const scrubberEl = document.getElementById('scrubber');
const timerEl = document.getElementById('timer');
const pushIndicator = document.getElementById('push-indicator');

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

// N on the speaker opens the audience-visible annotation slot (PRD §2 –
// the live marginalia channel that mirrors to the audience). The notes
// pane on the right is the read-side of source > note: lines plus the
// editable speaker-private notes; it is focused by clicking it (it has
// tabindex=0).
// (Default viewHooks.onN already maps to startAnnotate – no override.)

// Clone the per-chunk <template> content into the notes pane. The
// template body is pre-rendered by marked at build time.
function populateNotesPane() {
  notesContent.replaceChildren();
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const tmpl = document.querySelector(\`template[data-notes-for="\${entry.id}"]\`);
  if (tmpl) notesContent.appendChild(tmpl.content.cloneNode(true));
}

// Column / chunk-dot bookkeeping: a flat index of which flatChunks entry
// corresponds to each (colIdx, chunkIdx) pair in the scrubber.
const colChunkIdx = {};
flatChunks.forEach((c, i) => {
  if (!colChunkIdx[c.colIdx]) colChunkIdx[c.colIdx] = [];
  colChunkIdx[c.colIdx].push(i);
});

function updateScrubber() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  document.querySelectorAll('.col-entry').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.colIdx, 10) === entry.colIdx);
  });
  document.querySelectorAll('#scrubber .dot').forEach(dot => {
    const ci = parseInt(dot.dataset.colIdx, 10);
    const xi = parseInt(dot.dataset.chunkIdx, 10);
    dot.classList.toggle('active', colChunkIdx[ci]?.[xi] === state.activeIdx);
  });
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

// Preview strip: next 3 chunks, each cloned, scaled to fit its slot,
// fully revealed (§7 – planning surface shows author intent).
const PREVIEW_COUNT = 3;
function populatePreviewStrip() {
  previewStrip.replaceChildren();
  for (let i = 0; i < PREVIEW_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'preview-slot';
    const targetIdx = state.activeIdx + 1 + i;
    const entry = flatChunks[targetIdx];
    if (!entry) {
      slot.classList.add('empty');
    } else {
      const label = document.createElement('div');
      label.className = 'preview-slot-label';
      label.textContent = '+' + (i + 1);
      slot.appendChild(label);
      const clone = entry.el.cloneNode(true);
      clone.classList.add('chunk-clone');
      clone.classList.remove('active', 'expanded', 'annot-visible', 'has-annot', 'overview-selected');
      clone.querySelectorAll('.reveal-segment').forEach(s => s.removeAttribute('data-hidden'));
      clone.querySelectorAll('.exps, .annot-box, .annot-add').forEach(n => n.remove());
      slot.appendChild(clone);
      requestAnimationFrame(() => {
        const scale = slot.clientWidth / window.innerWidth;
        clone.style.transform = \`scale(\${scale})\`;
        clone.style.width = window.innerWidth + 'px';
        clone.style.height = (slot.clientHeight / scale) + 'px';
      });
    }
    previewStrip.appendChild(slot);
  }
}

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

// Hook: refresh scrubber on every state change, but only re-populate the
// notes pane and preview strip when the active chunk actually changed.
// Without this guard, every remote annotation keystroke would rebuild 3
// cloned chunk subtrees in the preview strip.
let lastPopulatedIdx = -1;
viewHooks.onActiveChange = () => {
  updateScrubber();
  if (state.activeIdx === lastPopulatedIdx) return;
  lastPopulatedIdx = state.activeIdx;
  populateNotesPane();
  populatePreviewStrip();
};

// First populate (applyState ran before viewHooks was reassigned).
updateScrubber();
populateNotesPane();
populatePreviewStrip();

window.addEventListener('resize', populatePreviewStrip);

// Hello handshake: at boot the speaker adopts its opener (the
// audience that spawned it via S) as peer and announces itself.
// Audience replies with the current state snapshot; applyRemoteState
// picks it up. If we were opened standalone (no opener), peer stays
// null and we run on our localStorage state.
setPeer(window.opener);
sendToPeer({ type: 'hello', source: 'speaker' });
`;

// ── CLI ──────────────────────────────────────────────────────────────

// Build the three HTML outputs for a single source file. Returns the
// list of written paths and the lecture shape string. Throws on parse
// errors – callers in --watch wrap this so a single bad save does not
// kill the watcher.
function buildOnce(absIn, only, opts = {}) {
  const src = fs.readFileSync(absIn, 'utf8');
  const lecture = parseLecture(src);

  const outDir = path.dirname(absIn);
  const chunkCount = lecture.columns.reduce((n, c) => n + c.chunks.length, 0);
  const shape = `${lecture.columns.length} columns, ${chunkCount} chunks`;
  const written = [];

  const wants = (target) => !only || only === `--${target}-only`;

  if (wants('print')) {
    const p = path.join(outDir, 'print.html');
    fs.writeFileSync(p, renderDocument(lecture, opts));
    written.push(path.relative(process.cwd(), p));
  }
  if (wants('audience')) {
    const p = path.join(outDir, 'audience.html');
    fs.writeFileSync(p, renderAudience(lecture, opts));
    written.push(path.relative(process.cwd(), p));
  }
  if (wants('speaker')) {
    const p = path.join(outDir, 'speaker.html');
    fs.writeFileSync(p, renderSpeaker(lecture, opts));
    written.push(path.relative(process.cwd(), p));
  }

  return { written, shape };
}

// Watch mode: build once, start a WS server on a free port, install a
// debounced fs.watch on the source file, and broadcast 'reload' to all
// connected clients on each successful rebuild. The reload snippet
// reconnects on close, so the server can come and go without breaking
// the open browser tabs.
async function runWatch(absIn, only) {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ port: 0 });
  await new Promise(resolve => wss.on('listening', resolve));
  const port = wss.address().port;
  const opts = { watchPort: port };

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
  console.log(`Watching ${path.relative(process.cwd(), absIn)} – live-reload on ws://localhost:${port}`);

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

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter(a => !a.startsWith('--'));

  if (flags.has('--new')) {
    runNew(positional[0]);
    return;
  }

  const [inputPath] = positional;

  if (!inputPath || flags.has('--help') || flags.has('-h')) {
    console.error('Usage:');
    console.error('  node build.js <source.md> [--watch] [--audience-only|--print-only|--speaker-only]');
    console.error('  node build.js --new <slug>');
    process.exit(inputPath ? 0 : 1);
  }

  const onlyFlags = ['--audience-only', '--print-only', '--speaker-only'].filter(f => flags.has(f));
  if (onlyFlags.length > 1) {
    console.error(`Error: ${onlyFlags.join(' and ')} are mutually exclusive.`);
    process.exit(1);
  }
  const only = onlyFlags[0];

  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Input not found: ${absIn}`);
    process.exit(1);
  }

  if (flags.has('--watch')) {
    runWatch(absIn, only).catch(err => {
      console.error(`Watch failed: ${err.message}`);
      process.exit(1);
    });
    return;
  }

  const { written, shape } = buildOnce(absIn, only);
  console.log(`Wrote ${written.join(', ')} (${shape})`);
}

main();
