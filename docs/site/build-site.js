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
// Labels per language. Everything the bar says in words, in one place, so a
// third language would be a table entry rather than a second copy of the
// markup.
const BAR_TEXT = {
  en: {
    aria: 'Universität Bamberg and site navigation',
    chair: 'Chair of Privacy and Security in Information Systems',
    lectures: 'Live lectures', start: 'Getting started', compare: 'Comparison',
    overview: 'Overview', menu: 'Menu', lang: 'Language',
  },
  de: {
    aria: 'Universität Bamberg und Seitennavigation',
    chair: 'Lehrstuhl für Privatsphäre und Sicherheit in Informationssystemen',
    lectures: 'Vorlesungen', start: 'Loslegen', compare: 'Vergleich',
    overview: 'Übersicht', menu: 'Menü', lang: 'Sprache',
  },
};

// `base` is the path back to the site root: '' for pages at the root, '../'
// for the German page under de/. `home` is the index in the page's own
// language, so the bar always navigates within the language you are reading.
function topbar(lang, base) {
  const t = BAR_TEXT[lang];
  const home = lang === 'de' ? base + 'de/index.html' : base + 'index.html';
  const other = lang === 'de' ? base + 'index.html' : base + 'de/index.html';
  const compare = base + 'comparison.html';
  // The switch is two links, not a redirect: see site.js for why the browser's
  // language only ever produces a hint here, never a jump.
  const langSwitch = `<span class="topbar-lang" role="group" aria-label="${t.lang}">
          <a href="${base}index.html" hreflang="en"${lang === 'en' ? ' aria-current="true"' : ''}>EN</a>
          <a href="${base}de/index.html" hreflang="de"${lang === 'de' ? ' aria-current="true"' : ''}>DE</a>
        </span>`;
  return `<nav class="topbar" aria-label="${t.aria}">
  <div class="topbar-in">
    <div class="topbar-row">
      <a class="topbar-brand" href="https://www.uni-bamberg.de/" target="_blank" rel="noopener">
        <svg viewBox="0 0 183 183" aria-hidden="true" focusable="false" style="fill-rule:evenodd;clip-rule:evenodd;stroke-miterlimit:11.3386"><circle cx="76.6" cy="106" r="36" style="fill:none;stroke:currentColor;stroke-width:19.84px"/><path d="M26.7,25.2C65.4,1.3 115.6,8.2 146.4,41.6C177.2,75 180.1,125.6 153.1,162.2" style="fill:none;fill-rule:nonzero;stroke:currentColor;stroke-width:19.84px"/><path d="M11.2,109.2C9.8,82.5 25,57.6 49.4,46.5C73.8,35.4 102.5,40.2 121.8,58.7C141.2,77.2 147.3,105.7 137.3,130.5C127.3,155.4 103.1,171.6 76.3,171.5" style="fill:none;fill-rule:nonzero;stroke:currentColor;stroke-width:19.84px"/></svg>
        <span>Universität Bamberg</span>
      </a>
      <div class="topbar-right">
        <a class="topbar-chair" href="https://psi.uni-bamberg.de/" target="_blank" rel="noopener">${t.chair}</a>
        <span class="topbar-sep">·</span>
        <a href="https://psi.uni-bamberg.de/de/ueberuns/" target="_blank" rel="noopener">Prof. Dr. Dominik Herrmann</a>
      </div>
      <div class="topbar-actions">
        <div class="topbar-nav">
          <a href="${home}#open-them-yourself">${t.lectures}</a>
          <a href="${home}#getting-started">${t.start}</a>
          <a href="${compare}">${t.compare}</a>
        </div>
        ${langSwitch}
        <a class="topbar-gh" href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
        <details class="topbar-menu">
          <summary aria-label="${t.menu}">
            <svg viewBox="0 0 14 12" aria-hidden="true" focusable="false"><path d="M0 1h14M0 6h14M0 11h14" style="stroke:currentColor;stroke-width:1.6px;fill:none"/></svg>
            <span>${t.menu}</span>
          </summary>
          <div class="topbar-panel">
            <a href="${home}">${t.overview}</a>
            <a href="${home}#open-them-yourself">${t.lectures}</a>
            <a href="${home}#getting-started">${t.start}</a>
            <a href="${compare}">${t.compare}</a>
            <a href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
            <hr>
            <a href="${other}" hreflang="${lang === 'de' ? 'en' : 'de'}">${lang === 'de' ? 'English version' : 'Deutsche Fassung'}</a>
            <hr>
            <a href="https://psi.uni-bamberg.de/" target="_blank" rel="noopener">${t.chair}</a>
            <a href="https://psi.uni-bamberg.de/de/ueberuns/" target="_blank" rel="noopener">Prof. Dr. Dominik Herrmann</a>
          </div>
        </details>
      </div>
    </div>
  </div>
</nav>`;
}
const TOPBAR = topbar('en', '');

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
  const MARKER = '<!--topbar-->';
  const landing = (src, out, lang, base) => {
    const html = fs.readFileSync(path.join(HERE, src), 'utf8');
    if (!html.includes(MARKER)) {
      throw new Error(`docs/site/${src} has no ${MARKER} marker for the university bar`);
    }
    fs.mkdirSync(path.dirname(path.join(outDir, out)), { recursive: true });
    fs.writeFileSync(path.join(outDir, out), html.replace(MARKER, topbar(lang, base)));
    console.log(`  docs/site/${src} -> ${out}`);
  };
  landing('index.html', 'index.html', 'en', '');
  // The German landing page lives at de/, so every asset reference in it is
  // one level up. Same document, translated; the lectures it links to stay in
  // the language they are taught in.
  landing('index.de.html', path.join('de', 'index.html'), 'de', '../');
  // The case for `::: diagram`. Its figures, its stepped payloads, its rails
  // and the diagram stylesheet and runtime are spliced in by
  // docs/artifact/refresh-figures.mjs, which is the only text that compiles a
  // figure for publication - so this page is copied verbatim like the landing
  // pages rather than rendered from Markdown, and `refresh-figures.mjs
  // --check` is what keeps it from going stale.
  landing('figures.html', 'figures.html', 'en', '');
  // The manual the case links to. It is not rendered from Markdown and it is
  // not assembled here - refresh-figures.mjs compiles every drawing on it from
  // a real build - so it is copied whole. Published because the page beside it
  // ends by sending the reader to it, and a link to a page that is not there
  // is worse than no link.
  // Its link back to the case is written for the repository, where the two
  // pages are one folder apart, because the manual is described as a page you
  // can open straight off disk and a link that only resolves after deployment
  // is broken for exactly that reader. In _site they are siblings, so the one
  // relative step is dropped here rather than being wrong in one of the two
  // places the page is read.
  const MANUAL = path.join(ROOT, 'docs/artifact/figures-you-write.html');
  const manual = fs.readFileSync(MANUAL, 'utf8');
  const LINK = '"../site/figures.html"';
  if (!manual.includes(LINK)) {
    throw new Error('the manual has no ' + LINK + ' link back to the case - has it been renamed?');
  }
  fs.writeFileSync(path.join(outDir, 'figures-you-write.html'),
    manual.split(LINK).join('"figures.html"'));
  console.log('  docs/artifact/figures-you-write.html -> figures-you-write.html');
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
