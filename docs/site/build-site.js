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

// The university bar. One definition, injected into the hand-written landing
// page and into every rendered page, because a bar that says who is
// responsible for the site has to be on all of it. The mark is the
// university's own outline, inlined: the page fetches nothing.
const TOPBAR = `<nav class="topbar" aria-label="Universität Bamberg and site navigation">
  <div class="topbar-in">
    <div class="topbar-row">
      <a class="topbar-brand" href="https://www.uni-bamberg.de/" target="_blank" rel="noopener">
        <svg viewBox="0 0 183 183" aria-hidden="true" focusable="false" style="fill-rule:evenodd;clip-rule:evenodd;stroke-miterlimit:11.3386"><circle cx="76.6" cy="106" r="36" style="fill:none;stroke:currentColor;stroke-width:19.84px"/><path d="M26.7,25.2C65.4,1.3 115.6,8.2 146.4,41.6C177.2,75 180.1,125.6 153.1,162.2" style="fill:none;fill-rule:nonzero;stroke:currentColor;stroke-width:19.84px"/><path d="M11.2,109.2C9.8,82.5 25,57.6 49.4,46.5C73.8,35.4 102.5,40.2 121.8,58.7C141.2,77.2 147.3,105.7 137.3,130.5C127.3,155.4 103.1,171.6 76.3,171.5" style="fill:none;fill-rule:nonzero;stroke:currentColor;stroke-width:19.84px"/></svg>
        <span>Universität Bamberg</span>
      </a>
      <div class="topbar-right">
        <a class="topbar-chair" href="https://psi.uni-bamberg.de/" target="_blank" rel="noopener">Chair of Privacy and Security in Information Systems</a>
        <span class="topbar-sep">·</span>
        <a href="https://psi.uni-bamberg.de/de/ueberuns/" target="_blank" rel="noopener">Prof. Dr. Dominik Herrmann</a>
      </div>
      <div class="topbar-actions">
        <div class="topbar-nav">
          <a href="index.html#open-them-yourself">Live lectures</a>
          <a href="index.html#getting-started">Getting started</a>
          <a href="comparison.html">Comparison</a>
        </div>
        <a href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
      </div>
    </div>
  </div>
</nav>`;

const SHELL = (title, lead, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – psi-slides</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
${TOPBAR}
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
  // The landing page is hand-written and otherwise copied verbatim; the only
  // thing built into it is the bar, so that its one definition covers every
  // page. A missing marker is an error rather than a page that quietly ships
  // without its affiliation.
  const indexSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const MARKER = '<!--topbar-->';
  if (!indexSrc.includes(MARKER)) {
    throw new Error(`docs/site/index.html has no ${MARKER} marker for the university bar`);
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), indexSrc.replace(MARKER, TOPBAR));
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
