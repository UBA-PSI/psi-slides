#!/usr/bin/env node
/**
 * Assembles the GitHub Pages site.
 *
 * Two kinds of page: the hand-written landing page (index.html, copied
 * verbatim) and the project documentation, rendered here from the same
 * Markdown files the repository serves to a reader on GitHub. Rendering
 * rather than copying means the site cannot drift from the docs, and the
 * in-repo links keep working because `.md` targets are rewritten to `.html`.
 *
 * Deliberately not part of build.js. That file renders *lectures*, and its
 * one-file shape is already carrying its weight; a website generator has
 * nothing to do with the lecture medium and would only blur what build.js
 * is for. It reuses `marked`, which is already a dependency, so this adds
 * nothing to install.
 *
 * Usage: node docs/site/build-site.js <out-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Only documents that are finished and written for someone deciding whether
// to use the tool. Three are deliberately absent: PRD.md is part
// specification and part plan, with sections describing intentions rather
// than behaviour; speaker.md is an internal protocol note; HANDOFF.md is a
// German build diary. All three stay in the repository for anyone who wants
// them, but on a public documentation page they would cost more confusion
// than they repay.
const PAGES = [
  { src: 'docs/comparison.md', out: 'comparison.html', title: 'How psi-slides compares',
    lead: 'Beamer, reveal.js, Quarto, Marp, Slidev, PowerPoint and friends, in both directions.' },
];

// Heading ids, so the in-page anchors that the Markdown already uses resolve.
// GitHub generates these implicitly; marked does not.
const slug = (text) => String(text)
  .toLowerCase()
  .replace(/<[^>]+>/g, '')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');

function renderMarkdown(md) {
  const seen = new Map();
  const renderer = new marked.Renderer();
  renderer.heading = (text, level) => {
    let id = slug(text);
    // Two headings with the same words would otherwise collide and send
    // every link to the first of them.
    if (seen.has(id)) {
      const n = seen.get(id) + 1;
      seen.set(id, n);
      id = `${id}-${n}`;
    } else {
      seen.set(id, 1);
    }
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };
  renderer.link = (href, title, text) => {
    let h = href || '';
    // Relative links to Markdown have to go somewhere real. A sibling that
    // this site publishes becomes its rendered page; anything else - README,
    // CLAUDE.md, a lecture source - points back at the repository, because a
    // dead link in the docs is worse than an off-site one. Matched on the
    // basename so ../speaker.md and docs/../speaker.md both land.
    if (!/^(?:https?:|mailto:|#)/i.test(h) && /\.md(?:#|$)/i.test(h)) {
      const [file, frag] = h.split('#');
      const base = path.basename(file);
      const known = PAGES.find(p => path.basename(p.src) === base);
      h = known
        ? known.out + (frag ? '#' + frag : '')
        : `https://github.com/UBA-PSI/psi-slides/blob/main/${file.replace(/^(?:\.\.?\/)+/, '')}` +
          (frag ? '#' + frag : '');
    }
    const ext = /^https?:/i.test(h) ? ' target="_blank" rel="noopener noreferrer"' : '';
    const t = title ? ` title="${title}"` : '';
    return `<a href="${h}"${t}${ext}>${text}</a>`;
  };
  return marked.parse(md, { renderer });
}

const SHELL = (title, lead, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – psi-slides</title>
<style>
:root {
  --ink: #1f1f24; --ink-soft: #62626a; --paper: #fbfbf8;
  --rule: #d9d9d2; --emph: #8b2e00;
  --serif: 'Source Serif 4', Georgia, serif;
  --sans: 'Inter Tight', Inter, system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #ececef; --ink-soft: #a2a2ac; --paper: #16161a;
    --rule: #35353d; --emph: #ff9b6a;
  }
}
* { box-sizing: border-box; }
html { font-family: var(--serif); color: var(--ink); background: var(--paper); line-height: 1.62; }
body { margin: 0; }
main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 6rem; }
nav.top { font-family: var(--sans); font-size: 0.86rem; padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--rule); }
nav.top a { color: var(--ink-soft); text-decoration: none; margin-right: 1.2rem; }
nav.top a:hover { color: var(--emph); }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 0.3rem; letter-spacing: -0.01em; }
.lead { font-family: var(--sans); color: var(--ink-soft); margin: 0 0 2.2rem; }
h2 { font-size: 1.35rem; margin: 2.6rem 0 0.6rem; letter-spacing: -0.01em; }
h3 { font-size: 1.08rem; margin: 1.8rem 0 0.4rem; }
p, li { hyphens: auto; }
a { color: var(--emph); }
code { font-family: var(--mono); font-size: 0.88em; }
pre { font-family: var(--mono); font-size: 0.8rem; line-height: 1.5; background: rgba(127,127,127,0.09);
  padding: 0.8rem 1rem; border-radius: 3px; overflow-x: auto; }
pre code { font-size: inherit; }
blockquote { margin: 1.2rem 0; padding-left: 1rem; border-left: 2px solid var(--rule); color: var(--ink-soft); }
table { border-collapse: collapse; width: 100%; font-size: 0.86rem; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--rule); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
th { font-family: var(--sans); font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.4rem 0; }
footer { font-family: var(--sans); font-size: 0.8rem; color: var(--ink-soft);
  border-top: 1px solid var(--rule); margin-top: 3rem; padding-top: 1rem; }
</style>
</head>
<body>
<nav class="top">
  <a href="index.html">psi-slides</a>
  <a href="comparison.html">Comparison</a>
  <a href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
</nav>
<main>
<h1>${title}</h1>
<p class="lead">${lead}</p>
${body}
<footer>
  psi-slides &middot; <a href="https://psi.uni-bamberg.de/">Privacy and Security in Information Systems</a>,
  University of Bamberg &middot; <a href="https://herdom.net">Dominik Herrmann</a><br>
  Tooling MIT-licensed, lecture content CC&nbsp;BY-SA&nbsp;4.0.
</footer>
</main>
</body>
</html>
`;

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node docs/site/build-site.js <out-dir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'index.html'), path.join(outDir, 'index.html'));
  // Screenshots the landing page shows. Copied rather than referenced out of
  // the repo, because the deployed site only has what lands in outDir.
  const img = path.join(HERE, 'img');
  if (fs.existsSync(img)) {
    fs.cpSync(img, path.join(outDir, 'img'), { recursive: true });
    console.log(`  docs/site/img -> img/ (${fs.readdirSync(img).length} files)`);
  }

  for (const page of PAGES) {
    const abs = path.join(ROOT, page.src);
    const md = fs.readFileSync(abs, 'utf8');
    // The Markdown files open with their own H1; the shell supplies one, so
    // drop the first heading rather than print the title twice.
    const body = renderMarkdown(md.replace(/^#\s+.*\n/, ''));
    fs.writeFileSync(path.join(outDir, page.out), SHELL(page.title, page.lead, body));
    console.log(`  ${page.src} -> ${page.out}`);
  }
}

main();
