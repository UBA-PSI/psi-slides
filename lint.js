#!/usr/bin/env node
/**
 * Lecture linter – static checks for source.md files.
 *
 * Stand-alone and zero-dep so it can evolve alongside build.js without
 * sharing state. Mirrors the parser's ground truth: VALID_TAGS,
 * VALID_WIDTHS, attribute-tail syntax, fence-aware reveal splits,
 * ::: directives.
 *
 * Usage:
 *   node lint.js <source.md>
 *   node lint.js lectures/
 *   node lint.js lectures/ --strict     # warnings become exit 2
 *
 * Exit codes:
 *   0  clean (or warnings without --strict)
 *   1  one or more errors
 *   2  --strict and at least one warning
 *
 * Per-file override anywhere in the source:
 *   <!-- linter: ignore reveal-overuse, density -->
 */

import fs from 'node:fs';
import path from 'node:path';

const VALID_TAGS = new Set([
  'title', 'principle', 'definition', 'example',
  'question', 'figure', 'exercise', 'free',
]);

const VALID_WIDTHS = new Set(['narrow', 'standard', 'wide', 'full']);

// Per-tag word budget. null = no limit. Tags with deliberately large
// bodies (figure, title) are exempt; one-liner tags are strict.
const DENSITY_BUDGET = {
  title: null,
  figure: null,
  principle: 80,
  question: 80,
  definition: 200,
  example: 250,
  exercise: 350,
  free: 250,
};

const REVEAL_PCT_WARN = 0.5;
const ORPHAN_MIN = 2;

function splitFrontmatter(src) {
  if (!src.startsWith('---\n')) return { body: src, fmLines: 0 };
  const end = src.indexOf('\n---\n', 4);
  if (end === -1) return { body: src, fmLines: 0 };
  const header = src.slice(4, end);
  const body = src.slice(end + 5);
  const fmLines = header.split('\n').length + 2;
  return { body, fmLines };
}

function parseAttributeTail(text) {
  const m = text.match(/^(.*?)\s*\{([^}]*)\}\s*$/);
  if (!m) return { text: text.trim(), classes: [], ids: [] };
  const out = { text: m[1].trim(), classes: [], ids: [] };
  for (const tok of m[2].trim().split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('.')) out.classes.push(tok.slice(1));
    else if (tok.startsWith('#')) out.ids.push(tok.slice(1));
  }
  return out;
}

function parseIgnores(src) {
  const set = new Set();
  const re = /<!--\s*linter:\s*ignore\s+([^>]+?)\s*-->/g;
  for (const m of src.matchAll(re)) {
    for (const tok of m[1].split(/[,\s]+/).filter(Boolean)) set.add(tok);
  }
  return set;
}

function wordCountOf(lines) {
  return lines.join(' ').split(/\s+/).filter(Boolean).length;
}

function lintFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const ignores = parseIgnores(src);
  const { body, fmLines } = splitFrontmatter(src);
  const lines = body.split('\n');
  const findings = [];

  const add = (bodyLine, severity, rule, msg) => {
    if (ignores.has(rule)) return;
    findings.push({
      file: filePath, line: fmLines + bodyLine, severity, rule, msg,
    });
  };

  const ids = new Map();
  const columns = [];
  let col = null;
  let chunk = null;
  let chunkBody = [];
  let chunkHasReveal = false;
  let inFence = false;
  let activeDirective = null;

  const flushChunk = () => {
    if (!chunk) return;
    const budget = DENSITY_BUDGET[chunk.tag ?? 'free'];
    if (budget !== null) {
      const wc = wordCountOf(chunkBody);
      if (wc > budget) {
        add(chunk.line, 'warn', 'density',
            `chunk body is ${wc} words (budget for ${chunk.tag ?? 'free'}: ${budget})`);
      }
    }
    if (activeDirective) {
      add(activeDirective.line, 'error', 'unclosed-directive',
          `::: ${activeDirective.kind} not closed before next chunk or column`);
      activeDirective = null;
    }
    chunk.hasReveal = chunkHasReveal;
    col.chunks.push(chunk);
    chunk = null;
    chunkBody = [];
    chunkHasReveal = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    if (/^```/.test(line)) {
      inFence = !inFence;
      if (chunk) chunkBody.push(line);
      continue;
    }
    if (inFence) { if (chunk) chunkBody.push(line); continue; }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);

    if (h1) {
      flushChunk();
      const attr = parseAttributeTail(h1[1]);
      if (attr.ids.length > 1) {
        add(ln, 'error', 'multiple-ids',
            `column heading has ${attr.ids.length} {#id} tokens; only the first is used`);
      }
      const id = attr.ids[0];
      if (id) {
        if (ids.has(id)) {
          add(ln, 'error', 'duplicate-id',
              `id '${id}' already defined at line ${ids.get(id)}`);
        } else {
          ids.set(id, fmLines + ln);
        }
      }
      col = { line: ln, heading: attr.text, id, chunks: [] };
      columns.push(col);
      continue;
    }

    if (h2) {
      flushChunk();
      if (!col) {
        col = { line: ln, heading: null, id: null, chunks: [] };
        columns.push(col);
      }
      const attr = parseAttributeTail(h2[1]);
      const id = attr.ids[0];
      if (attr.ids.length > 1) {
        add(ln, 'error', 'multiple-ids',
            `chunk heading has ${attr.ids.length} {#id} tokens; only the first is used`);
      }
      const tagMatch = attr.text.match(/^([a-z]+):\s*(.*)$/);
      let tag = null, heading = attr.text;
      if (tagMatch) {
        if (VALID_TAGS.has(tagMatch[1])) {
          tag = tagMatch[1];
          heading = tagMatch[2].trim();
        } else {
          add(ln, 'error', 'unknown-tag',
              `unknown tag '${tagMatch[1]}:' – valid: ${[...VALID_TAGS].join(', ')}`);
        }
      }
      for (const cls of attr.classes) {
        if (!VALID_WIDTHS.has(cls)) {
          add(ln, 'error', 'unknown-width',
              `unknown width '.${cls}' – valid: ${[...VALID_WIDTHS].map(w => '.' + w).join(', ')}`);
        }
      }
      if (!id) {
        add(ln, 'error', 'missing-id',
            `'## ${tag ? tag + ': ' : ''}${heading || ''}' has no {#id}`);
      } else if (ids.has(id)) {
        add(ln, 'error', 'duplicate-id',
            `id '${id}' already defined at line ${ids.get(id)}`);
      } else {
        ids.set(id, fmLines + ln);
      }
      chunk = { line: ln, tag, heading, id, classes: attr.classes };
      continue;
    }

    const expandOpen = line.match(/^:::\s+expand\s+(.+?)\s*$/);
    const marginOpen = /^:::\s+margin\s*$/.test(line);
    if (expandOpen || marginOpen) {
      if (activeDirective) {
        add(ln, 'error', 'nested-directive',
            `::: ${expandOpen ? 'expand' : 'margin'} inside still-open ::: ${activeDirective.kind} (line ${activeDirective.line})`);
      }
      if (!chunk) {
        add(ln, 'error', 'stray-directive',
            `::: directive outside any chunk`);
      }
      activeDirective = { kind: expandOpen ? 'expand' : 'margin', line: ln };
      continue;
    }
    if (/^:::\s*$/.test(line)) {
      if (!activeDirective) {
        add(ln, 'error', 'stray-directive-close',
            `::: without a matching open directive`);
      }
      activeDirective = null;
      continue;
    }

    if (chunk && !activeDirective && line.trim() === '---') {
      chunkHasReveal = true;
      continue;
    }

    if (chunk) chunkBody.push(line);
  }
  flushChunk();

  const allChunks = columns.flatMap(c => c.chunks);
  const titleChunks = allChunks.filter(c => c.tag === 'title');
  if (titleChunks.length === 0) {
    add(1, 'warn', 'title-count', `no 'title:' chunk found`);
  } else if (titleChunks.length > 1) {
    add(titleChunks[1].line, 'warn', 'title-count',
        `multiple 'title:' chunks (${titleChunks.length}); only the first renders`);
  }

  for (const c of columns) {
    if (c.heading === null) continue;
    if (c.chunks.length < ORPHAN_MIN) {
      add(c.line, 'warn', 'orphan-column',
          `column '${c.heading}' has ${c.chunks.length} chunk${c.chunks.length === 1 ? '' : 's'} (min ${ORPHAN_MIN})`);
    }
  }

  const nonTitle = allChunks.filter(c => c.tag !== 'title');
  const reveals = nonTitle.filter(c => c.hasReveal).length;
  if (nonTitle.length > 0) {
    const pct = reveals / nonTitle.length;
    if (pct > REVEAL_PCT_WARN) {
      add(1, 'warn', 'reveal-overuse',
          `${reveals}/${nonTitle.length} chunks use reveal segments (${Math.round(pct * 100)}% > ${REVEAL_PCT_WARN * 100}%) – split the column, or add '<!-- linter: ignore reveal-overuse -->'`);
    }
  }

  return findings;
}

function collectFiles(inputs) {
  const out = new Set();
  for (const p of inputs) {
    const s = fs.statSync(p);
    if (s.isFile()) { out.add(p); continue; }
    if (s.isDirectory()) {
      const stack = [p];
      while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const full = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.isFile() && entry.name === 'source.md') out.add(full);
        }
      }
    }
  }
  return [...out].sort();
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const inputs = args.filter(a => !a.startsWith('--'));
  if (inputs.length === 0) {
    console.error('usage: node lint.js <source.md | dir> [--strict]');
    process.exit(2);
  }
  const files = collectFiles(inputs);
  if (files.length === 0) {
    console.error('no source.md files found');
    process.exit(2);
  }

  let errors = 0, warnings = 0;
  for (const f of files) {
    for (const x of lintFile(f)) {
      const sev = x.severity === 'error' ? 'error' : 'warn ';
      console.log(`${x.file}:${x.line}  ${sev}  ${x.rule.padEnd(22)}  ${x.msg}`);
      if (x.severity === 'error') errors++;
      else warnings++;
    }
  }

  const summary = `${files.length} file(s), ${errors} error(s), ${warnings} warning(s)`;
  console.log(errors || warnings ? `\n${summary}` : `ok – ${summary}`);
  if (errors) process.exit(1);
  if (strict && warnings) process.exit(2);
}

main();
