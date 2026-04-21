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
    // Strip reveal separators (standalone `---`) from the main body.
    // `---` inside a ``` fenced code block is preserved.
    const body = bodyLines
      .filter((l, i, arr) => {
        if (l.trim() !== '---') return true;
        let fence = false;
        for (let j = 0; j < i; j++) {
          if (/^```/.test(arr[j])) fence = !fence;
        }
        return fence;
      })
      .join('\n')
      .trim();
    currentChunk.body = body;
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

// ── CLI ──────────────────────────────────────────────────────────────

function main() {
  const [, , inputPath, outPathArg] = process.argv;
  if (!inputPath) {
    console.error('Usage: node build.js <source.md> [output.html]');
    process.exit(1);
  }
  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Input not found: ${absIn}`);
    process.exit(1);
  }
  const src = fs.readFileSync(absIn, 'utf8');
  const lecture = parseLecture(src);
  const html = renderDocument(lecture);
  const outPath = outPathArg
    ? path.resolve(outPathArg)
    : path.join(path.dirname(absIn), 'print.html');
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)} ` +
    `(${lecture.columns.length} columns, ` +
    `${lecture.columns.reduce((n, c) => n + c.chunks.length, 0)} chunks)`);
}

main();
