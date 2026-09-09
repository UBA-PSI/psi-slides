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
import crypto from 'node:crypto';
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
  { src: 'docs/comparison.md', out: 'comparison.html', page: 'comparison',
    title: 'How psi-slides compares',
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
    menu: 'Menu', lang: 'Language',
    nav: {
      home: 'Home', room: 'In the room', decoration: 'Title slides',
      figures: 'Figures', start: 'Getting started', comparison: 'Comparison',
    },
  },
  de: {
    aria: 'Universität Bamberg und Seitennavigation',
    chair: 'Lehrstuhl für Privatsphäre und Sicherheit in Informationssystemen',
    menu: 'Menü', lang: 'Sprache',
    nav: {
      home: 'Start', room: 'Im Raum', decoration: 'Titelfolien',
      figures: 'Abbildungen', start: 'Loslegen', comparison: 'Vergleich',
    },
  },
};

/*
 * Every page the site publishes, one row each. This is the table the bar is
 * built from, so taking a page into the navigation is a row here and nothing
 * else: no second list in the markup, no per-page copy of the bar.
 *
 *   en / de   where the page lives, relative to the site root. A row without
 *             `de` is English-only, and its language switch is the named
 *             exception in topbar() below.
 *   nav       the key in BAR_TEXT[lang].nav, and the entry's presence in the
 *             bar. A row without `nav` is a page the bar does not carry - the
 *             figure manual - listed so the link gate knows what it is.
 *   pending   the destination does not exist yet. The row stays in the table
 *             so the page it names is one flag away, and the bar leaves it
 *             out until then: an entry that 404s is worse than one that is
 *             missing. PSI_SITE_NAV_ALL=1 renders the pending rows anyway,
 *             which is how the bar's breakpoints were measured against the
 *             full six entries rather than against today's five.
 *
 * One row still points at a section of the home page rather than at a page of
 * its own, because that is where its content is today. When PLAN-website.md
 * splits that section out, the row's target changes and the bar follows -
 * which is all `start` needed when getting-started.html was written.
 */
const SITE_PAGES = {
  home:       { en: 'index.html',                 de: 'de/index.html',                 nav: 'home' },
  room:       { en: 'in-the-room.html',           de: 'de/in-the-room.html',           nav: 'room', pending: true },
  decoration: { en: 'index.html#covers',          de: 'de/index.html#covers',          nav: 'decoration' },
  figures:    { en: 'figures.html',                                                    nav: 'figures' },
  start:      { en: 'getting-started.html',       de: 'de/getting-started.html',       nav: 'start' },
  comparison: { en: 'comparison.html',                                                 nav: 'comparison' },
  manual:     { en: 'figures-you-write.html' },
};
// Bar order, left to right: the argument first, then the two catalogues, then
// the two pages a reader opens after deciding.
const NAV_ORDER = ['home', 'room', 'decoration', 'figures', 'start', 'comparison'];
const NAV_ALL = process.env.PSI_SITE_NAV_ALL === '1';

// `base` is the path back to the site root: '' for pages at the root, '../'
// for the German pages under de/. `page` is this page's key in SITE_PAGES,
// which is what makes its own entry carry aria-current and what points the
// language switch at this page's twin rather than always at the other
// language's home page.
function topbar(page, lang, base) {
  const t = BAR_TEXT[lang];
  const here = SITE_PAGES[page];
  if (!here) throw new Error(`topbar(): no SITE_PAGES row for "${page}"`);
  const url = (row, l) => base + (row[l] || row.en);
  // The named exception. A page that exists only in English - figures.html,
  // the figure manual, comparison.html - has no German twin to switch to, so
  // its DE link goes to the German home page. Every page with a twin switches
  // to that twin.
  const enHref = url(here, 'en');
  const deHref = here.de ? base + here.de : base + SITE_PAGES.home.de;
  // The switch is two links, not a redirect: see site.js for why the browser's
  // language only ever produces a hint here, never a jump.
  const langSwitch = `<span class="topbar-lang" role="group" aria-label="${t.lang}">
          <a href="${enHref}" hreflang="en"${lang === 'en' ? ' aria-current="true"' : ''}>EN</a>
          <a href="${deHref}" hreflang="de"${lang === 'de' ? ' aria-current="true"' : ''}>DE</a>
        </span>`;
  const entries = NAV_ORDER
    .map((key) => ({ key, row: SITE_PAGES[key] }))
    .filter(({ row }) => row && row.nav && (NAV_ALL || !row.pending));
  // aria-current="page" on the entry for the page being built, and the
  // stylesheet's only job is to make that visible without a device: the other
  // entries step back a shade, this one stays white and takes a thin rule
  // under it. No accent border, no eyebrow - see docs/site/DESIGN.md.
  const links = (indent) => entries.map(({ key, row }) => {
    const current = key === page ? ' aria-current="page"' : '';
    return `<a href="${url(row, lang)}"${current}>${t.nav[row.nav]}</a>`;
  }).join('\n' + indent);
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
          ${links('          ')}
        </div>
        ${langSwitch}
        <a class="topbar-gh" href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
        <details class="topbar-menu">
          <summary aria-label="${t.menu}">
            <svg viewBox="0 0 14 12" aria-hidden="true" focusable="false"><path d="M0 1h14M0 6h14M0 11h14" style="stroke:currentColor;stroke-width:1.6px;fill:none"/></svg>
            <span>${t.menu}</span>
          </summary>
          <div class="topbar-panel">
            ${links('            ')}
            <a href="https://github.com/UBA-PSI/psi-slides">GitHub</a>
            <hr>
            <a href="${lang === 'de' ? enHref : deHref}" hreflang="${lang === 'de' ? 'en' : 'de'}">${lang === 'de' ? 'English version' : 'Deutsche Fassung'}</a>
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

const SHELL = (title, lead, body, page) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – psi-slides</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
${topbar(page, 'en', '')}
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

// The webfaces site.css asks for are tracked beside it. That makes the hand-
// written source pages complete when opened straight from a fresh checkout or
// a release archive; making their type depend on somebody having assembled
// the site first only moves a silent @font-face 404 to a different machine.
// They are the same Fontsource cuts build.js embeds into lectures. When those
// packages are upgraded, refresh these tracked copies and their OFL notices in
// the same change.
// Tracking them costs a second place an upgrade has to reach, and the note
// above asking for both to move together is a convention until something
// checks it. This is what checks it. Bytes rather than versions: a package can
// re-subset a face without bumping, and the file is what the page loads.
//
// It lives here rather than in test/gates/, which deliberately runs without
// npm ci - a check that cannot see node_modules would be pending in exactly
// the job that is supposed to run it. This file imports marked, so it never
// runs without node_modules at all and always has something to compare
// against; the missing-package guard below is for a partial install, not for
// a release archive, which could not get this far.
function fontDrift(names) {
  const PKG = { 'ibm-plex-sans': 'ibm-plex-sans', 'jetbrains-mono': 'jetbrains-mono' };
  const out = [];
  for (const name of names) {
    const pkg = Object.keys(PKG).find((p) => name.startsWith(p));
    if (!pkg) continue;
    const dir = path.join(ROOT, 'node_modules/@fontsource-variable', pkg);
    if (!fs.existsSync(dir)) return [];
    const shipped = name.endsWith('.woff2')
      ? path.join(dir, 'files', name)
      : path.join(dir, 'LICENSE');
    if (!fs.existsSync(shipped)) continue;
    const sum = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
    const a = sum(path.join(HERE, 'fonts', name)), b = sum(shipped);
    if (a !== b) out.push(`${name}: tracked ${a}, package ${b}`);
  }
  return out;
}

function copyFonts(outDir) {
  const names = [
    'ibm-plex-sans-latin-wght-normal.woff2',
    'ibm-plex-sans-latin-wght-italic.woff2',
    'jetbrains-mono-latin-wght-normal.woff2',
    'ibm-plex-sans-OFL.txt',
    'jetbrains-mono-OFL.txt',
  ];
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const name of names) {
    const src = path.join(HERE, 'fonts', name);
    if (!fs.existsSync(src)) {
      throw new Error(`tracked site font missing: ${src}`);
    }
    fs.copyFileSync(src, path.join(outDir, name));
    if (name.endsWith('.woff2')) bytes += fs.statSync(src).size;
  }
  const drift = fontDrift(names);
  if (drift.length) {
    throw new Error('tracked site fonts no longer match their packages:\n  '
      + drift.join('\n  ')
      + '\nCopy them over from node_modules/@fontsource-variable/.');
  }
  console.log(`  fonts -> fonts/ (3 faces + 2 licences, ${Math.round(bytes / 1024)} KB)`);
}

/*
 * ── Reading a built page ───────────────────────────────────────────────────
 *
 * Three checks below all need the same two things out of an HTML file: what
 * it links to, and what it says. One pair of readers rather than three, so a
 * page cannot pass one check and fail another over a difference in how the
 * markup was scanned.
 *
 * Regexes rather than a parser. These pages are written here, by hand or by
 * this file, so the markup is known - and a DOM parser would be the first
 * dependency this script adds beyond `marked`, for a job that is reading
 * attributes out of text.
 */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', middot: '·',
  laquo: '«', raquo: '»', bdquo: '„', ldquo: '“',
  rdquo: '”', lsquo: '‘', rsquo: '’', times: '×',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};
const decodeEntities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (_, n) => (n in ENTITIES ? ENTITIES[n] : `&${n};`));

// Everything a page points at, in document order, from the four attributes
// that fetch or navigate. `src` is in because a missing screenshot is exactly
// the kind of broken link this gate is for.
function hrefsIn(html) {
  const out = [];
  const re = /\b(?:href|src)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) out.push(decodeEntities(m[1]));
  return out;
}

const idsIn = (html) => {
  const out = new Set();
  const re = /\bid\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return out;
};

// The visible prose of a page: from <main>, with the things a reader does not
// read as sentences removed. Comments go first, or a commented-out <pre>
// leaves its closing tag behind and swallows the rest of the page.
function proseSource(html) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  let s = main ? main[1] : html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of ['svg', 'pre', 'script', 'style', 'footer']) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }
  return s;
}

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' '));
const countWords = (s) => stripTags(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/*
 * ── The word count ─────────────────────────────────────────────────────────
 *
 * `--words` after the out-dir. PLAN-website.md sets the home page a budget -
 * under 1,400 prose words, no section over 400 - and without a measurement
 * that is an opinion. Sections are cut at <h2>, because that is what a reader
 * sees as a section; the words before the first one are the hero.
 */
function wordTable(html) {
  const parts = proseSource(html).split(/<h2\b[^>]*>/i);
  const rows = [];
  const lead = countWords(parts[0]);
  if (lead) rows.push({ section: '(before the first heading)', words: lead });
  for (const part of parts.slice(1)) {
    const cut = part.indexOf('</h2>');
    const title = cut < 0 ? '(unclosed h2)' : stripTags(part.slice(0, cut)).trim();
    rows.push({ section: title.replace(/\s+/g, ' '), words: countWords(cut < 0 ? part : part.slice(cut + 5)) });
  }
  return rows;
}

function reportWords(pages) {
  for (const { out, file } of pages) {
    const rows = wordTable(fs.readFileSync(file, 'utf8'));
    const total = rows.reduce((n, r) => n + r.words, 0);
    const w = Math.max(20, ...rows.map((r) => r.section.length));
    console.log(`\n  ${out}  -  ${total} prose words`);
    console.log(`  ${'-'.repeat(w + 9)}`);
    for (const r of rows) {
      console.log(`  ${r.section.padEnd(w)}  ${String(r.words).padStart(5)}`);
    }
    console.log(`  ${'-'.repeat(w + 9)}`);
    console.log(`  ${'total'.padEnd(w)}  ${String(total).padStart(5)}`);
  }
  console.log('');
}

/*
 * ── The link gate ──────────────────────────────────────────────────────────
 *
 * Every href and src on every page this script writes has to resolve, and a
 * fragment on a page this script writes has to name an id that page has.
 * External addresses (http, mailto, data) are out of scope: they are not
 * this build's to keep alive.
 *
 * The lecture views are the one thing in the output that this script does not
 * put there - pages.yml builds the lectures and copies four HTML views per
 * lecture into the out-dir *after* this runs. Two ways to make the gate see
 * them; this is the second one, the gate is told where they come from. The
 * reason is that reordering pages.yml would only fix the gate in CI: the
 * documented local command is `node docs/site/build-site.js _site` into an
 * empty directory, and a gate that needs the copy to have happened first
 * would then be red on every developer's machine and green in the one place
 * nobody watches it. So the table below is the contract with pages.yml, and
 * the two have to be changed together - it names the same folders that
 * workflow copies, and the gate checks the lecture's source.md is really in
 * the repository, which is what makes a typo in a folder name fail.
 */
const LECTURE_VIEWS = [
  { dir: 'tutorial',     from: 'lectures/tutorial' },
  { dir: 'python-intro', from: 'lectures/python-intro' },
  { dir: 'diagrams',     from: 'lectures/diagrams' },
  { dir: 'decoration',   from: 'lectures/decoration',  views: ['audience.html', 'print.html'] },
  { dir: 'example',      from: 'docs/site/example' },
];
const ALL_VIEWS = ['audience.html', 'speaker.html', 'print.html', 'print-notes.html'];

function checkLinks(outDir, pages) {
  const ids = new Map();
  for (const { out, file } of pages) ids.set(out, idsIn(fs.readFileSync(file, 'utf8')));
  const problems = [];
  for (const { out, file } of pages) {
    const html = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(out);
    for (const raw of hrefsIn(html)) {
      if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;   // http, mailto, data, //cdn
      const [target, frag] = raw.split('#');
      // A bare fragment is a link into the page it is on.
      const rel = target === '' ? out : path.posix.normalize(path.posix.join(dir, target));
      if (ids.has(rel)) {
        if (frag && !ids.get(rel).has(frag)) {
          problems.push(`${out}: "${raw}" - ${rel} has no id="${frag}"`);
        }
        continue;
      }
      // A lecture view, copied in by pages.yml after this script ran.
      const lec = LECTURE_VIEWS.find((l) => rel.startsWith(l.dir + '/'));
      if (lec) {
        const view = rel.slice(lec.dir.length + 1);
        if (!(lec.views || ALL_VIEWS).includes(view)) {
          problems.push(`${out}: "${raw}" - ${lec.dir} does not publish ${view}`);
        } else if (!fs.existsSync(path.join(ROOT, lec.from, 'source.md'))) {
          problems.push(`${out}: "${raw}" - no ${lec.from}/source.md to build it from`);
        }
        continue;
      }
      // Under PSI_SITE_NAV_ALL the bar carries the entries whose pages are
      // still to be written. That is a measuring aid, not a publishable site,
      // so the gate lets exactly those targets through rather than making the
      // aid unusable.
      if (NAV_ALL && Object.values(SITE_PAGES).some((r) => r.pending && (r.en === rel || r.de === rel))) {
        continue;
      }
      if (/\.html$/i.test(rel)) {
        problems.push(`${out}: "${raw}" - no page ${rel} in the output`);
        continue;
      }
      if (!fs.existsSync(path.join(outDir, rel))) {
        problems.push(`${out}: "${raw}" - no file ${rel} in the output`);
      }
    }
  }
  if (problems.length) {
    throw new Error('the site links to things that are not there:\n  ' + problems.join('\n  '));
  }
  console.log(`  links: ${pages.length} pages, every target resolves`);
}

/*
 * ── The twin gate ──────────────────────────────────────────────────────────
 *
 * `index.html` and `index.de.html` are the same document in two languages,
 * and the German one falls behind the moment somebody edits one and forgets
 * the other. What "the same document" means has to be defined against a real
 * translation rather than against a wish, so it is structure only, in four
 * parts, and the sentences between them are free:
 *
 *   headings   the same number of h2/h3 in the same order at the same level.
 *              Ids are compared where the English page has one: those are the
 *              anchors both languages are linked by, and a translation that
 *              renames one silently breaks a link on the other page. Not
 *              every heading needs an id, which is why the sequence of levels
 *              is what carries the comparison.
 *   images     the same pictures in the same order. The German page lives one
 *              directory down, so its "../" is normalised away.
 *   code       the same commands. A German code block may translate its
 *              `#` comments and may not translate the command, so the
 *              comparison cuts the comments off first and strips the
 *              highlighter's spans - that boundary is the whole point of the
 *              check.
 *   links      the same destinations. A page's own two languages are folded
 *              together: "de/index.html" and "../index.html" are the same
 *              link seen from the two sides.
 *
 * It reads the two *sources*, not the built pages, because the bar is built
 * into them per language and would differ by design.
 */
function twinStructure(html) {
  const headings = [];
  const re = /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = /\bid\s*=\s*"([^"]+)"/i.exec(m[2]);
    headings.push({ level: m[1].toLowerCase(), id: id ? id[1] : null });
  }
  const norm = (p) => p.replace(/^(?:\.\.\/)+/, '').replace(/^de\//, '');
  const images = [];
  const imgRe = /<(?:img|source)\b[^>]*\b(?:src|srcset)\s*=\s*"([^"]+)"/gi;
  while ((m = imgRe.exec(html))) images.push(norm(decodeEntities(m[1]).split(' ')[0]));
  const code = [];
  const preRe = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
  while ((m = preRe.exec(html))) {
    code.push(stripTags(m[1])
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n'));
  }
  const links = hrefsIn(html)
    .filter((h) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(h))
    .map(norm);
  return { headings, images, code, links };
}

function checkTwins(twins) {
  const problems = [];
  for (const { en, de } of twins) {
    const a = twinStructure(fs.readFileSync(path.join(HERE, en), 'utf8'));
    const b = twinStructure(fs.readFileSync(path.join(HERE, de), 'utf8'));
    const say = (what, x, y) => problems.push(`${en} / ${de}: ${what}\n      en: ${x}\n      de: ${y}`);
    if (a.headings.length !== b.headings.length) {
      say(`${a.headings.length} headings against ${b.headings.length}`,
        a.headings.map((h) => h.level).join(' '), b.headings.map((h) => h.level).join(' '));
    } else {
      a.headings.forEach((h, i) => {
        if (h.level !== b.headings[i].level) say(`heading ${i + 1} is a different level`, h.level, b.headings[i].level);
        else if (h.id && h.id !== b.headings[i].id) say(`heading ${i + 1} has a different id`, h.id, b.headings[i].id);
      });
    }
    for (const key of ['images', 'code', 'links']) {
      if (a[key].length !== b[key].length) {
        say(`${a[key].length} ${key} against ${b[key].length}`, a[key].join(' | '), b[key].join(' | '));
        continue;
      }
      a[key].forEach((v, i) => {
        if (v !== b[key][i]) say(`${key.replace(/s$/, '')} ${i + 1} differs`, JSON.stringify(v), JSON.stringify(b[key][i]));
      });
    }
  }
  if (problems.length) {
    throw new Error('the German pages have drifted from their English twins:\n  '
      + problems.join('\n  ')
      + '\n  Prose is free; headings, pictures, commands and link targets are not.');
  }
  console.log(`  twins: ${twins.length} pair(s), same structure`);
}

function main() {
  const args = process.argv.slice(2);
  // `--words` prints the per-section prose count of every page this script
  // writes, after writing them. It is a mode of the build rather than a script
  // of its own so that it measures what is published, not what is on disk
  // beside it - a page's bar and its spliced-in figures are part of it.
  const wantWords = args.includes('--words');
  const outDir = args.find((a) => !a.startsWith('--'));
  if (!outDir) {
    console.error('Usage: node docs/site/build-site.js <out-dir> [--words]');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  // Every page written here, so the two gates below and --words all work from
  // one list rather than from three walks of the output directory.
  const written = [];
  const wrote = (out) => written.push({ out, file: path.join(outDir, out) });
  // The landing page is hand-written and otherwise copied verbatim; the only
  // thing built into it is the bar, so that its one definition covers every
  // page. A missing marker is an error rather than a page that quietly ships
  // without its affiliation.
  const MARKER = '<!--topbar-->';
  const landing = (src, out, page, lang, base) => {
    const html = fs.readFileSync(path.join(HERE, src), 'utf8');
    if (!html.includes(MARKER)) {
      throw new Error(`docs/site/${src} has no ${MARKER} marker for the university bar`);
    }
    fs.mkdirSync(path.dirname(path.join(outDir, out)), { recursive: true });
    fs.writeFileSync(path.join(outDir, out), html.replace(MARKER, topbar(page, lang, base)));
    wrote(out.split(path.sep).join('/'));
    console.log(`  docs/site/${src} -> ${out}`);
  };
  landing('index.html', 'index.html', 'home', 'en', '');
  // The German landing page lives at de/, so every asset reference in it is
  // one level up. Same document, translated; the lectures it links to stay in
  // the language they are taught in.
  landing('index.de.html', path.join('de', 'index.html'), 'home', 'de', '../');
  // The two ways in, pulled out of the front page: the app and the command
  // line. It is the bar's `start` entry, so its two files and that row move
  // together.
  landing('getting-started.html', 'getting-started.html', 'start', 'en', '');
  landing('getting-started.de.html', path.join('de', 'getting-started.html'), 'start', 'de', '../');
  // The case for `::: diagram`. Its figures, its stepped payloads, its rails
  // and the diagram stylesheet and runtime are spliced in by
  // docs/artifact/refresh-figures.mjs, which is the only text that compiles a
  // figure for publication - so this page is copied verbatim like the landing
  // pages rather than rendered from Markdown, and `refresh-figures.mjs
  // --check` is what keeps it from going stale.
  landing('figures.html', 'figures.html', 'figures', 'en', '');
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
  // The whole relative step is the prefix, not one filename: the manual links
  // back to the case, to a section of the case, and now to the project home,
  // and a per-target rewrite is a list that has to be extended every time a
  // link is added - silently, because the missed one still resolves in the
  // repository and only breaks once deployed. In _site every page is a
  // sibling, so "../site/ never means anything there.
  const LINK = '"../site/';
  if (!manual.includes(LINK)) {
    throw new Error('the manual has no ' + LINK + '..." link back to the site - has it been renamed?');
  }
  fs.writeFileSync(path.join(outDir, 'figures-you-write.html'),
    manual.split(LINK).join('"'));
  wrote('figures-you-write.html');
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
    fs.writeFileSync(path.join(outDir, page.out), SHELL(page.title, page.lead, body, page.page));
    wrote(page.out);
    console.log(`  ${page.src} -> ${page.out}`);
  }

  // Both gates run here rather than in pages.yml, so that the one documented
  // command builds the site *and* checks it, and the workflow gets them
  // without a step of its own.
  checkLinks(outDir, written);
  checkTwins([
    { en: 'index.html', de: 'index.de.html' },
    { en: 'getting-started.html', de: 'getting-started.de.html' },
  ]);
  if (wantWords) reportWords(written);
}

// The two gates report things an author has to fix, and a stack trace through
// this file's internals only buries the list. Same reasoning as build.js's
// `userFacing` errors.
try {
  main();
} catch (err) {
  console.error('\n' + err.message + '\n');
  process.exit(1);
}
