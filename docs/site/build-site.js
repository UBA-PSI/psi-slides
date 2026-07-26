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
<link rel="stylesheet" href="site.css">
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
<script src="site.js"></script>
<footer>
  psi-slides &middot; <a href="https://psi.uni-bamberg.de/">Privacy and Security in Information Systems</a>,
  University of Bamberg &middot; <a href="https://herdom.net">Dominik Herrmann</a><br>
  Tooling MIT-licensed, lecture content CC&nbsp;BY-SA&nbsp;4.0.
</footer>
</main>
</body>
</html>
`;

// The two typefaces site.css asks for, gathered into one folder next to the
// pages. Inter Tight comes out of node_modules, the same packages build.js
// embeds into lectures, so a font upgrade lands here without a second step.
// Iosevka is checked in already subset (see docs/site/fonts/): its published
// latin cut is 961 KB, nearly all of it variants a web page never sets.
// A missing file is a hard error – silently shipping a page whose @font-face
// 404s is exactly the fallback-to-system-font failure this avoids.
function copyFonts(outDir) {
  const sources = [
    path.join(ROOT, 'node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2'),
    path.join(ROOT, 'node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-italic.woff2'),
    path.join(HERE, 'fonts', 'iosevka-subset-400.woff2'),
    path.join(HERE, 'fonts', 'iosevka-OFL.txt'),
  ];
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const src of sources) {
    if (!fs.existsSync(src)) {
      throw new Error(`site font missing: ${src}\nRun npm install first.`);
    }
    fs.copyFileSync(src, path.join(outDir, path.basename(src)));
    bytes += fs.statSync(src).size;
  }
  console.log(`  fonts -> fonts/ (${sources.length} files, ${Math.round(bytes / 1024)} KB)`);
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node docs/site/build-site.js <out-dir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'index.html'), path.join(outDir, 'index.html'));
  fs.copyFileSync(path.join(HERE, 'site.css'), path.join(outDir, 'site.css'));
  fs.copyFileSync(path.join(HERE, 'site.js'), path.join(outDir, 'site.js'));
  // Screenshots the landing page shows. Copied rather than referenced out of
  // the repo, because the deployed site only has what lands in outDir.
  const img = path.join(HERE, 'img');
  if (fs.existsSync(img)) {
    fs.cpSync(img, path.join(outDir, 'img'), { recursive: true });
    console.log(`  docs/site/img -> img/ (${fs.readdirSync(img).length} files)`);
  }
  copyFonts(path.join(outDir, 'fonts'));

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
