# TODO – site and example lectures after the 2.0.0 sweep

A read-only audit of the project site (EN and DE), `docs/comparison.md`, the
tutorial and the twelve other lectures, run by four agents against `8c700cbe`.
Findings marked ✓ were reproduced by hand. Line numbers are grep targets, not
promises. Only the coordinating session edits this file: tick a box when the
slice's commit lands and add its hash.

Status: `[ ]` open · `[~]` in progress (agent named) · `[x]` done (commit)

Ground rules for every slice:

- Another session shares this working tree and index. `git add <paths>` then a
  bare `git commit`; never `git add -A`, never commit files outside the slice.
- Lecture sources change tracked views (`tutorial`, `diagrams`, `decoration`).
  Agents edit the source only; the rebuild (`npm run build:tracked`) is one
  step at the end of a phase, announced to the other session first.
- The `.de` twins stay congruent with the English pages – `node
  docs/site/build-site.js <scratch dir>` gates headings, pictures, commands and
  link targets, and every link. Run it into the scratchpad, delete it after.
- Chunk `{#id}`s are frozen. En dashes only, typographic quotes in prose.

## Phase 1 – facts that are wrong now (before the tag)

### F1 – Site: counts and pasted output (`index`, `getting-started`, EN + DE)

`[~]` site-a

- [ ] ✓ Pasted build output says „12 columns, 92 chunks“, 2 images, 0.00 MB,
      ~2.3 MB files – today 13 columns, 104 chunks, 8 images. `index.html:621–631`,
      `getting-started.html:359`, both `.de` twins. Paste a fresh run.
- [ ] Lecture counts: python-intro 36 → 39 (`index.html:269`, `:492`, alt text
      `in-the-room.html:335`), tutorial 92 → current, Figures 40 → 42, Decoration
      39 → 40 (`index.html:503–535`, `index.de.html:498–543`). Decide once how a
      „slide“ is counted (chunks, or chunks + dividers) and apply it everywhere.
- [ ] `getting-started` points at the „Breaking“ list „at the head of 2.0.0“;
      `CHANGELOG.md` still says `[Unreleased]` – true only once the tag lands.
      Leave, but check at tagging.
- [ ] PDF prerequisite: site says „needs Chrome“ (`getting-started.html:241`,
      `in-the-room.html:507`); README names `$PSI_CHROME`, the Playwright cache
      or system Chrome. Say also that the app's export needs nothing.

### F2 – Site: missing 2.0.0 features, small contradictions

`[~]` site-b

- [ ] `in-the-room` mentions Cmd-K but not the start menu on the projection –
      the first thing a lecturer sees. Also `G` (go to slide) and `W`
      (fullscreen).
- [ ] `prompter` never says the desktop app cannot run it.
- [ ] `decoration.html:41` „builds exactly as it did before – byte for byte“:
      „before“ undefined, and a 1.0.0 deck does not (slide-numbers default).
- [ ] `decoration.html:215` face kinds „a hand, a machine, a poster“ vs
      `display-faces.html` „hand, machine, graphic“.
- [ ] `decoration.html:34–38` „Nothing here is drawn … no box to drag“
      contradicts the editor sold on other pages.
- [ ] `build-site.js:136–137` comment speaks of five live entries; six are live.

### F3 – `docs/comparison.md`

`[~]` site-c

- [ ] ✓ `:181` „psi-slides does not have URL deep links“ – `chunkIdxFromHash`
      (build.js) opens the live views at `#id`.
- [ ] ✓ `:40` „eight types and eight `:::` directives“ – 11 types, ~16 directives.
- [ ] `:233` „fifty specs“ → 51. `PRD §4.5 / §6 / §10` cited unlinked
      (`:59`, `:145`, `:259`).
- [ ] `:55` „exactly the failure this project is named after“ – unclear (the
      name is the chair's).

### F4 – DE site: terminology and drift

`[~]` site-a + site-b

- [ ] Footer and licence line differ across the five DE pages; use the German
      chair name everywhere (`index.de.html:695–697`, `getting-started.de.html:488`).
- [ ] `prompter.de.html:68` „Füllwörter“ → „Fülllaute (äh, ähm)“.
- [ ] Address form: `index.de.html:370` „dir“, `getting-started.de.html:352`
      `C:\Users\du\…` → impersonal.
- [ ] One word each, applied across all DE pages: Build (introduce once),
      Farbschema (not „Thema“/„Themes“), Sprechernotizen, Leertaste (not Space),
      Tastendruck (not „Druck“, esp. the PDF section), Schritte (not „Beats“),
      „die Lesenden“, Frontmatter (glossed once; „Vorspann“ is the credit block).
- [ ] Translationese in `decoration.de` (`:40`, `:43`, `:136`, `:152`, `:261`,
      `:399`, `:414`) and `getting-started.de` (`:171`, `:174`, `:185`).
- [ ] Mark English targets „(englisch)“ + `hreflang="en"`: figures,
      figures-you-write, comparison, display-faces, and the tutorial
      (`index.de.html:509–513`, `:684`, `in-the-room.de`, `getting-started.de:347`).
      Point to `docs/site/example/` as the German model to copy.
- [ ] Say that the desktop app speaks German.
- [ ] Unify „Zum Weiterlesen“ / „Wo es weitergeht“.
- [ ] Nav „Im Raum“ → „Im Hörsaal“ (`BAR_TEXT.de.nav.room`, H1).

### F5 – Tutorial: statements that are false now

`[ ]` on hold – the other session’s `npm test` builds these sources in place

- [ ] ✓ `:1455` `{middle}` / `{top}` → `{.middle}` / `{.top}` (bare form refused).
- [ ] ✓ `:1752`, `:1784`, `:1790` „seven frontmatter keys“ / nine shown / „the
      six above“ – there are eleven; `transition:` and `reader:` missing.
- [ ] `:160` the expand chip shows the author's label now (abbreviation only as
      fallback) – so the slug labels (`digits-and-chevrons`, …) reach the
      projection as typed. Fix the text and give the expansions readable labels.
- [ ] `:1336`, `:1342` overlay „three slots“, „every one is a card“ – five
      slots, `{.panel}` is not a card.
- [ ] `:1591`, `:1595` „one of the five“ fonts – nine (as `:1564` says).
- [ ] `:1564`, `:1586` three font roles – four; `display` never mentioned.
- [ ] `:484`, `:1764` `slide-numbers` default changed to horizontal – say so.
- [ ] `:564` „the label above it always reads NOTE“ – not under `labels:` or `lang: de`.
- [ ] `:1748` only `--slides-pdf`; add `--print-pdf`, `--print-notes-pdf`, the app.
- [ ] `:43` „Those are all of them“ (terms) – false; „beat“ never defined.

### F6 – Other lectures: statements that are false now

`[ ]` on hold – the other session’s `npm test` builds these sources in place

- [ ] ✓ `diagrams:392`, `:1227` „seventeen statements, and no more“ –
      `DG_KEYWORDS` has 20 (`zone`, `row`, `col`).
- [ ] `diagrams:805` „Six statements expand at parse time“ – seven.
- [ ] `diagrams:3` subtitle „Six real lecture slides“ on a 42-chunk catalogue;
      `:669`, `:1158` history framing.
- [ ] `decoration:87` „Three keys the cover reads“ omits `cover-ground:`, `closing-image:`.
- [ ] `decoration:119–121` closing slide carries no presenter line – contradicted
      by `closing-credits:`, which the deck sets itself (line 8).
- [ ] `decoration:524` vs `:591` five vs six grounds.
- [ ] `decoration` closing slide is a compatibility promise, not a close.
- [ ] `decoration:586` „Merke:“ in an English deck; spaced hyphens as dashes
      (`:379`, `:430`, `:431`, `:521`, `:534`, `:573`, `:643`).
- [ ] `display-face:69` points at `tools/font-playground/` instead of
      `display-faces.html`; `:46–48` „byte for byte“.
- [ ] `network-security` frontmatter subtitle vs title chunk (`:17`) disagree.
- [ ] `frame-lab`: English title, German body, no `lang:`; CHANGELOG.md:1178
      calls it untracked (it is tracked).

## Phase 2 – structure

### S1 – Figures: one page instead of two

`[~]` site-s1 (Opus)

- [ ] `figures.html` and `figures-you-write.html` share a title and open with the
      same figure; the manual has no top bar. Merge the case into the head of
      the manual, one bar entry, top bar on it. Both pages come out of
      `docs/artifact/refresh-figures.mjs`; its `--check` must stay green.

### S2 – Landing page and getting started

- [ ] Hero: a two-line „Start here“ – no terminal → app, *New lecture…*; see it
      first → the tutorial („a lecture about writing lectures“). Links straight
      to `getting-started.html#app` and the tutorial's `audience.html`.
- [ ] Drop the getting-started teaser band and the figure source listing from
      `index`; move „Open the lectures yourself“ up, tutorial first.
- [ ] `getting-started`: app first, ending in „your first lecture“ (*New
      lecture…*, Help ▸ How to write a lecture, the release ZIP with built
      examples); then the command line; „Versions“ to one line at the foot.
- [ ] `comparison`: fold „Dimension by dimension“ and „Tool by tool“ into
      `<details>`.

### S3 – Tutorial: basics in the tutorial, advanced into the reference decks

- [ ] `lectures/tutorial` keeps the basics (~55 chunks: welcome, moving,
      finding, on-screen, vocabulary, cockpit, layouts, craft, next) plus a 3–4
      chunk „Beyond the basics“ part that links on. Add what 2.0.0 added and the
      basics need: Cmd-K, start menu, `G`/`W`, reader tools in `print.html`,
      „every `---` is a beat“, `--squint` instead of the hand-walked exercise.
- [ ] Figures part → `diagrams` as an opening „The language in five lines“ part
      (`#diagram-beats-rule`, `#diagram-beats-pinned`, `#diagram-slots`,
      `#diagram-placement`, `#diagram-coords`); keep `#drawn-from-text`,
      `#diagram`, `#diagram-beats` in the tutorial. Add chunks to `diagrams`,
      never touch existing figure ids (≈25 specs drive them).
- [ ] Decoration part → dedupe against `decoration` (`#cover-list`,
      `#cover-keys`, `#rows` exist in both); keep `#deco-idea`, `#deco-picture`.
- [ ] `style:` block and fonts (`#style-block` … `#fonts`) → a „Type and colour“
      part in `decoration`.
- [ ] Pulse to 2 chunks, video + embed to 1–2.
- [ ] `test/gates/corpus.mjs:47` pins the tutorial at 11 figures – same commit.

### S4 – Lectures nobody explains

- [ ] `demo-deco` → test fixture (it is a coverage probe). `demo-tracking`,
      `demo-responsibility`: document as corpus decks or move beside the
      fixtures; fix or accept their 15 canvas warnings; `pages.yml:76–82` builds
      them. **Decision for the maintainer.**
- [ ] `display-face` into CLAUDE.md's reference list; `title-block` and
      `display-face` into README beside decoration.

## Phase 3 – prose passes (prose-passes skill, EN + DE together)

Audience: lecturers and teaching staff, many not developers. Run after Phase 2
on the pages as they then stand.

- [ ] `index` – lede says „Four HTML files“ before saying what a lecturer gets;
      „source“, „projection“ unglossed; riddle at `:116`; caption rationale
      `:282–286`; `:90–92`; `file://` as reassurance `:547–556`.
- [ ] `in-the-room` – `:33–39`, `:101–104`, `:188–199` (lede before `K`),
      `:293–297` (six facts in one lede), `:323–329` contradiction.
- [ ] `getting-started` – `:41–44`, `:54–59`, `:163–169`, `:384–386`, `:440–446`.
- [ ] `decoration` – `:188–190`, `:209–211`, `:304–305`; „deck“ → „lecture“.
- [ ] Figures page (merged) – `figures.html:850`, `:862`.
- [ ] `comparison` – `:42`, `:44` universal claims.
- [ ] Tutorial (basics) – cover slide explains its own composition; `:147`
      cockpit deferred; `:270`, `:322–324`, `:541` engine detail in first lessons;
      `:363`, `:1506`, `:1631`, `:1746` changelog asides; `:609`, `:665–667`
      payload KB; `:1584`; hard breaks `:1317–1319`.
- [ ] `diagrams`, `decoration`, `title-block` (`:31–32`, `:44–49`),
      `display-face` subtitle, `network-security` compiler commentary on content
      slides (`:49`), `spoken-talk:56`, `demo-responsibility:181` quotes.
- [ ] Credits: one scheme across the decks (`presenter:` + `affiliation:`).

## Phase 4 – close

- [ ] `npm run build:tracked`, `npm run gate`, `node lint.js lectures/ --strict`,
      site build with both gates, `node docs/artifact/refresh-figures.mjs --check`.
- [ ] Browser specs touching tutorial / diagrams / decoration.
- [ ] Move this file to `docs/history/`.
