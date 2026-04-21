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

  const flushExpansion = () => {
    if (!currentExpansion || !currentChunk) return;
    currentChunk.expansions.push({
      label: currentExpansion.label,
      kind: currentExpansion.kind,
      body: currentExpansion.lines.join('\n').trim(),
    });
    currentExpansion = null;
  };

  const flushChunk = () => {
    if (!currentChunk) return;
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
        };
        continue;
      }

      if (currentChunk) {
        // Speaker-note blockquote (single line): stripped from print.
        // PRD §9 specifies no speaker notes in the print view.
        if (/^>\s*note:/i.test(line)) continue;

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

function renderDocument(lecture) {
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
  const { title, presenter, info } = frontmatter;
  const idAttr = chunk.id ? ` id="${escapeHtml(chunk.id)}"` : '';
  const chunkId = chunk.id || 'title';
  const bodyHtml = (chunk.body || '').trim() ? marked.parse(chunk.body) : '';
  const infoHtml = bodyHtml
    ? bodyHtml
    : splitInfo(info).map(l => `<p>${escapeHtml(l)}</p>`).join('');
  return `<article class="chunk chunk-title" data-tag="title" data-width="full" data-chunk-id="${escapeHtml(chunkId)}"${idAttr}>
  <div class="chunk-content">
    <h1 class="title-main">${escapeHtml(title || '')}</h1>
    ${presenter ? `<p class="title-presenter">${escapeHtml(presenter)}</p>` : ''}
    ${infoHtml ? `<div class="title-info">${infoHtml}</div>` : ''}
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

function renderAudience(lecture) {
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

  // Lecture-title string drives the localStorage namespace. Escaping it
  // into JSON makes the value safe to embed inline in a script literal.
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
  <kbd>+</kbd><kbd>-</kbd><kbd>0</kbd> zoom &nbsp; <kbd>B</kbd> blank &nbsp; <kbd>P</kbd> print &nbsp; <kbd>?</kbd> hide
</div>
<div id="mode-badge"></div>
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
`;

// ── audience runtime JS (inlined verbatim into the output HTML) ──────

const AUDIENCE_JS = `
const STORAGE_PREFIX = 'psi-lecdoc:';
const storageKey = (s) => STORAGE_PREFIX + LECTURE_TITLE + ':' + s;

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

// Collapse-mode DOM transforms: wrap each paragraph's first sentence in
// .sentence-head + .sentence-rest, and wrap text runs inside .sentence-rest
// with .prose so the collapse CSS can hide just the prose while keeping
// <strong> phrases visible in topic+bold mode.
function splitSentencesIn(root) {
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
function wrapProse(node) {
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
}

// State
function applyState() {
  document.body.dataset.collapse = state.collapse;
  document.documentElement.style.setProperty('--zoom', state.zoom);
  flatChunks.forEach((c, i) => c.el.classList.toggle('active', i === state.activeIdx));
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

// Click handling on the stage: distinguishes chunk-body clicks, chevrons,
// and annotation affordances.
function wireClicks() {
  flatChunks.forEach((entry, idx) => {
    entry.el.addEventListener('click', (ev) => {
      if (ev.target.closest('.annot-textarea')) return;
      if (ev.target.closest('[data-annot-add]')) { startAnnotate(entry.id); return; }
      if (ev.target.closest('.annot-box')) { startAnnotate(entry.id); return; }
      const chev = ev.target.closest('[data-exp]');
      if (chev) { toggleExp(idx, parseInt(chev.dataset.exp, 10)); return; }
      if (annotEditingId === entry.id) { blurAnnotation(); return; }
      if (idx !== state.activeIdx) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
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
      if (!advanceReveal()) nextChunk();
      e.preventDefault(); break;
    }
    case 'Enter': {
      const entry = flatChunks[state.activeIdx];
      if (entry && entry.el.querySelector('.exp-chev[data-exp="0"]')) toggleExp(state.activeIdx, 0);
      e.preventDefault(); break;
    }
    case '1': case '2': case '3': case '4': case '5':
    case '6': case '7': case '8': case '9': {
      const n = parseInt(e.key, 10) - 1;
      const entry = flatChunks[state.activeIdx];
      if (entry && entry.el.querySelector(\`.exp-chev[data-exp="\${n}"]\`)) toggleExp(state.activeIdx, n);
      e.preventDefault(); break;
    }
    case 'Escape': {
      if (annotEditingId) { blurAnnotation(); break; }
      if (openExp) { closeAnyExpansion(); setTimeout(() => focusCamera(false), 20); }
      break;
    }
    case 'n': case 'N': {
      const entry = flatChunks[state.activeIdx];
      if (entry) startAnnotate(entry.id);
      e.preventDefault(); break;
    }
    case 'c': case 'C': cycleCollapse(e.shiftKey ? -1 : 1); e.preventDefault(); break;
    case '+': case '=': setZoom(state.zoom + 0.1); e.preventDefault(); break;
    case '-': case '_': setZoom(state.zoom - 0.1); e.preventDefault(); break;
    case '0': setZoom(1.35); e.preventDefault(); break;
    case 'b': case 'B':
      state.blanked = !state.blanked;
      document.body.classList.toggle('blanked', state.blanked);
      e.preventDefault(); break;
    case 'p': case 'P':
      window.open('print.html', '_blank');
      e.preventDefault(); break;
    case '?':
      document.getElementById('hints').classList.toggle('hidden');
      e.preventDefault(); break;
  }
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

// ── CLI ──────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter(a => !a.startsWith('--'));
  const [inputPath] = positional;

  if (!inputPath || flags.has('--help') || flags.has('-h')) {
    console.error('Usage: node build.js <source.md> [--audience-only] [--print-only]');
    process.exit(inputPath ? 0 : 1);
  }

  const audienceOnly = flags.has('--audience-only');
  const printOnly    = flags.has('--print-only');
  if (audienceOnly && printOnly) {
    console.error('Error: --audience-only and --print-only are mutually exclusive.');
    process.exit(1);
  }

  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Input not found: ${absIn}`);
    process.exit(1);
  }
  const src = fs.readFileSync(absIn, 'utf8');
  const lecture = parseLecture(src);

  const outDir = path.dirname(absIn);
  const chunkCount = lecture.columns.reduce((n, c) => n + c.chunks.length, 0);
  const shape = `${lecture.columns.length} columns, ${chunkCount} chunks`;
  const written = [];

  if (!audienceOnly) {
    const printPath = path.join(outDir, 'print.html');
    fs.writeFileSync(printPath, renderDocument(lecture));
    written.push(path.relative(process.cwd(), printPath));
  }
  if (!printOnly) {
    const audiencePath = path.join(outDir, 'audience.html');
    fs.writeFileSync(audiencePath, renderAudience(lecture));
    written.push(path.relative(process.cwd(), audiencePath));
  }

  console.log(`Wrote ${written.join(', ')} (${shape})`);
}

main();
