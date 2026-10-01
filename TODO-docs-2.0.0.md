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

`[x]` site-a – 8251f450

- [x] ✓ Pasted build output says „12 columns, 92 chunks“, 2 images, 0.00 MB,
      ~2.3 MB files – today 13 columns, 104 chunks, 8 images. `index.html:621–631`,
      `getting-started.html:359`, both `.de` twins. Paste a fresh run.
- [x] Lecture counts: python-intro 36 → 39 (`index.html:269`, `:492`, alt text
      `in-the-room.html:335`), tutorial 92 → current, Figures 40 → 42, Decoration
      39 → 40 (`index.html:503–535`, `index.de.html:498–543`). Decide once how a
      „slide“ is counted (chunks, or chunks + dividers) and apply it everywhere.
- [ ] `getting-started` points at the „Breaking“ list „at the head of 2.0.0“;
      `CHANGELOG.md` still says `[Unreleased]` – true only once the tag lands.
      Leave, but check at tagging.
- [x] PDF prerequisite: site says „needs Chrome“ (`getting-started.html:241`,
      `in-the-room.html:507`); README names `$PSI_CHROME`, the Playwright cache
      or system Chrome. Say also that the app's export needs nothing.

### F2 – Site: missing 2.0.0 features, small contradictions

`[x]` site-b – cd4a85c4

- [x] `in-the-room` mentions Cmd-K but not the start menu on the projection –
      the first thing a lecturer sees. Also `G` (go to slide) and `W`
      (fullscreen).
- [x] `prompter` never says the desktop app cannot run it.
- [x] `decoration.html:41` „builds exactly as it did before – byte for byte“:
      „before“ undefined, and a 1.0.0 deck does not (slide-numbers default).
- [x] `decoration.html:215` face kinds „a hand, a machine, a poster“ vs
      `display-faces.html` „hand, machine, graphic“.
- [x] `decoration.html:34–38` „Nothing here is drawn … no box to drag“
      contradicts the editor sold on other pages.
- [x] `build-site.js:136–137` comment speaks of five live entries; six are live.

### F3 – `docs/comparison.md`

`[x]` site-c – ae1c642f

- [x] ✓ `:181` „psi-slides does not have URL deep links“ – `chunkIdxFromHash`
      (build.js) opens the live views at `#id`.
- [x] ✓ `:40` „eight types and eight `:::` directives“ – 11 types, ~16 directives.
- [x] `:233` „fifty specs“ → 51. `PRD §4.5 / §6 / §10` cited unlinked
      (`:59`, `:145`, `:259`).
- [x] `:55` „exactly the failure this project is named after“ – unclear (the
      name is the chair's).

### F4 – DE site: terminology and drift

`[x]` site-a (8251f450), site-b (cd4a85c4)

- [x] Footer and licence line differ across the five DE pages; use the German
      chair name everywhere (`index.de.html:695–697`, `getting-started.de.html:488`).
- [x] `prompter.de.html:68` „Füllwörter“ → „Fülllaute (äh, ähm)“.
- [x] Address form: `index.de.html:370` „dir“, `getting-started.de.html:352`
      `C:\Users\du\…` → impersonal.
- [x] One word each, applied across all DE pages: Build (introduce once),
      Farbschema (not „Thema“/„Themes“), Sprechernotizen, Leertaste (not Space),
      Tastendruck (not „Druck“, esp. the PDF section), Schritte (not „Beats“),
      „die Lesenden“, Frontmatter (glossed once; „Vorspann“ is the credit block).
- [x] Translationese in `decoration.de` (`:40`, `:43`, `:136`, `:152`, `:261`,
      `:399`, `:414`) and `getting-started.de` (`:171`, `:174`, `:185`).
- [x] Mark English targets „(englisch)“ + `hreflang="en"`: figures,
      figures-you-write, comparison, display-faces, and the tutorial
      (`index.de.html:509–513`, `:684`, `in-the-room.de`, `getting-started.de:347`).
      Point to `docs/site/example/` as the German model to copy.
- [x] Say that the desktop app speaks German.
- [x] Unify „Zum Weiterlesen“ / „Wo es weitergeht“.
- [x] Nav „Im Raum“ → „Im Hörsaal“ (`BAR_TEXT.de.nav.room`, H1).

### F5 – Tutorial: statements that are false now

`[x]` lec-f5 – 483e6fbe (views not yet rebuilt)

- [x] ✓ `:1455` `{middle}` / `{top}` → `{.middle}` / `{.top}` (bare form refused).
- [x] ✓ `:1752`, `:1784`, `:1790` „seven frontmatter keys“ / nine shown / „the
      six above“ – there are eleven; `transition:` and `reader:` missing.
- [x] `:160` the expand chip shows the author's label now (abbreviation only as
      fallback) – so the slug labels (`digits-and-chevrons`, …) reach the
      projection as typed. Fix the text and give the expansions readable labels.
- [x] `:1336`, `:1342` overlay „three slots“, „every one is a card“ – five
      slots, `{.panel}` is not a card.
- [x] `:1591`, `:1595` „one of the five“ fonts – nine (as `:1564` says).
- [x] `:1564`, `:1586` three font roles – four; `display` never mentioned.
- [x] `:484`, `:1764` `slide-numbers` default changed to horizontal – say so.
- [x] `:564` „the label above it always reads NOTE“ – not under `labels:` or `lang: de`.
- [x] `:1748` only `--slides-pdf`; add `--print-pdf`, `--print-notes-pdf`, the app.
- [x] `:43` „Those are all of them“ (terms) – false; „beat“ never defined.

### F6 – Other lectures: statements that are false now

`[x]` lec-f6 – 8877e68f (views not yet rebuilt; CHANGELOG.md:1178 still open)

- [x] ✓ `diagrams:392`, `:1227` „seventeen statements, and no more“ –
      `DG_KEYWORDS` has 20 (`zone`, `row`, `col`).
- [x] `diagrams:805` „Six statements expand at parse time“ – seven.
- [x] `diagrams:3` subtitle „Six real lecture slides“ on a 42-chunk catalogue;
      `:669`, `:1158` history framing.
- [x] `decoration:87` „Three keys the cover reads“ omits `cover-ground:`, `closing-image:`.
- [x] `decoration:119–121` closing slide carries no presenter line – contradicted
      by `closing-credits:`, which the deck sets itself (line 8).
- [x] `decoration:524` vs `:591` five vs six grounds.
- [x] `decoration` closing slide is a compatibility promise, not a close.
- [x] `decoration:586` „Merke:“ in an English deck; spaced hyphens as dashes
      (`:379`, `:430`, `:431`, `:521`, `:534`, `:573`, `:643`).
- [x] `display-face:69` points at `tools/font-playground/` instead of
      `display-faces.html`; `:46–48` „byte for byte“.
- [x] `network-security` frontmatter subtitle vs title chunk (`:17`) disagree.
- [x] `frame-lab`: English title, German body, no `lang:`; CHANGELOG.md:1178
      calls it untracked (it is tracked).

## Phase 2 – structure

### S1 – Figures: one page instead of two

`[x]` site-s1 – f26cbd7c, links in 5e4d0f3c and the in-the-room/decoration commit, docs 0a487ea2

- [x] `figures.html` and `figures-you-write.html` share a title and open with the
      same figure; the manual has no top bar. Merge the case into the head of
      the manual, one bar entry, top bar on it. Both pages come out of
      `docs/artifact/refresh-figures.mjs`; its `--check` must stay green.

### S2 – Landing page and getting started

`[x]` site-s2 – 5e4d0f3c · site-cmp – f8d325d9 · site-polish – ce2b34b2

- [x] Hero: a two-line „Start here“ – no terminal → app, *New lecture…*; see it
      first → the tutorial („a lecture about writing lectures“). Links straight
      to `getting-started.html#app` and the tutorial's `audience.html`.
- [x] Drop the getting-started teaser band and the figure source listing from
      `index`; move „Open the lectures yourself“ up, tutorial first.
- [x] `getting-started`: app first, ending in „your first lecture“ (*New
      lecture…*, Help ▸ How to write a lecture, the release ZIP with built
      examples); then the command line; „Versions“ to one line at the foot.
- [x] `comparison`: fold „Dimension by dimension“ and „Tool by tool“ into
      `<details>`.

### S3 – Tutorial: basics in the tutorial, advanced into the reference decks

`[x]` lec-s3 – 1b998c31 (refs 04f769c9, views 78f18613). Tutorial 61 chunks; diagrams 47 (new part after the vocabulary, so nav-goto holds); decoration 54 (Type and colour last)

- [x] `lectures/tutorial` keeps the basics (~55 chunks: welcome, moving,
      finding, on-screen, vocabulary, cockpit, layouts, craft, next) plus a 3–4
      chunk „Beyond the basics“ part that links on. Add what 2.0.0 added and the
      basics need: Cmd-K, start menu, `G`/`W`, reader tools in `print.html`,
      „every `---` is a beat“, `--squint` instead of the hand-walked exercise.
- [x] Figures part → `diagrams` as an opening „The language in five lines“ part
      (`#diagram-beats-rule`, `#diagram-beats-pinned`, `#diagram-slots`,
      `#diagram-placement`, `#diagram-coords`); keep `#drawn-from-text`,
      `#diagram`, `#diagram-beats` in the tutorial. Add chunks to `diagrams`,
      never touch existing figure ids (≈25 specs drive them).
- [x] Decoration part → dedupe against `decoration` (`#cover-list`,
      `#cover-keys`, `#rows` exist in both); keep `#deco-idea`, `#deco-picture`.
- [x] `style:` block and fonts (`#style-block` … `#fonts`) → a „Type and colour“
      part in `decoration`.
- [x] Pulse to 2 chunks, video + embed to 1–2.
- [x] `test/gates/corpus.mjs:47` pins the tutorial at 11 figures – same commit.

### S4 – Lectures nobody explains

- [x] **Done (see git log): moved all three demo-* decks to `test/corpus/`**. Was: move all three demo-* decks under `test/`** (update pages.yml). `demo-deco` → test fixture (it is a coverage probe). `demo-tracking`,
      `demo-responsibility`: document as corpus decks or move beside the
      fixtures; fix or accept their 15 canvas warnings; `pages.yml:76–82` builds
      them. **Decision for the maintainer.**
- [x] `display-face` into CLAUDE.md's reference list; `title-block` and
      `display-face` into README beside decoration.

## Phase 3 – prose passes (prose-passes skill, EN + DE together)

Lectures `[x]`: tutorial 85f15e00 · decoration, title-block, display-face, spoken-talk ×2 (see git log) · diagrams, network-security (see git log) · views 30d9d6ae. python-intro left alone: the site's shots come from it. Credits: `presenter:` + `affiliation:` everywhere except python-intro.

`[x]` site-p3 – b58c4016 (in-the-room, decoration, prompter) · index + getting-started in 5e4d0f3c

Audience: lecturers and teaching staff, many not developers. Run after Phase 2
on the pages as they then stand.

- [x] `index` – lede says „Four HTML files“ before saying what a lecturer gets;
      „source“, „projection“ unglossed; riddle at `:116`; caption rationale
      `:282–286`; `:90–92`; `file://` as reassurance `:547–556`.
- [x] `in-the-room` – `:33–39`, `:101–104`, `:188–199` (lede before `K`),
      `:293–297` (six facts in one lede), `:323–329` contradiction.
- [x] `getting-started` – `:41–44`, `:54–59`, `:163–169`, `:384–386`, `:440–446`.
- [x] `decoration` – `:188–190`, `:209–211`, `:304–305`; „deck“ → „lecture“.
- [x] Figures page (merged) – `figures.html:850`, `:862`.
- [x] `comparison` – `:42`, `:44` universal claims.
- [x] Tutorial (basics) – cover slide explains its own composition; `:147`
      cockpit deferred; `:270`, `:322–324`, `:541` engine detail in first lessons;
      `:363`, `:1506`, `:1631`, `:1746` changelog asides; `:609`, `:665–667`
      payload KB; `:1584`; hard breaks `:1317–1319`.
- [x] `diagrams`, `decoration`, `title-block` (`:31–32`, `:44–49`),
      `display-face` subtitle, `network-security` compiler commentary on content
      slides (`:49`), `spoken-talk:56`, `demo-responsibility:181` quotes.
- [x] Credits: one scheme across the decks (`presenter:` + `affiliation:`).

## Phase 4 – close

- [x] Site counts and tutorial descriptions after the split – f719a203.
- [x] Browser suite after the split: 1737 passed, 0 failed.
- [x] `img/builder.webp` is used by no page any more – deleted; it was taken by `desktop/test/smoke.mjs` (a comment), not `shoot.mjs`, and that comment now publishes `builder-lecture.webp`.
- [x] Dark and light mode of the eight site pages at 1440 and 390: no overflow, no invisible text, the figures page's bar matches.
- [ ] figures.html, light: the teal accent (`rgb(0,121,130)`) on tinted backgrounds measures 4.1–4.4:1 – darken it slightly (`docs/artifact/figures-you-write.html`).
- [ ] getting-started, 390 px: a ~40 px gap in the collapsed „Your first lecture“ block (grid row-gap in `site.css`).
- [x] Browser suite after the prose passes: 1737 passed, 0 failed.
- [x] Site shots re-shot: `deco-display-cover`, the five decoration tiles (slide numbers moved, `deco-dock` wording), `editor` (figure count 33), `figure` (larger raster, same drawing), `cue-beat-0`/`-1` (invisible but reproducible), `builder-lecture.webp` with its alt texts. `deco-display-divider` unchanged. `shoot.mjs`'s PDF sheet reads the `psiINT-pdf-p` wrapper id.
- [ ] Prompter shots `prompter-hint` and `prompter-hint-de` are stale (`#two-numbers` note changed) – `shoot-prompter.mjs` costs model calls, not run.
- [ ] python-intro shots drifted with the engine, not re-shot: `printed`, `handout`, `handout-plain` (the reader tools' Contents button and a shifted column), `full` (the start-menu chevron beside `?`), small drift in `cockpit`, `collapsed`, `overview`, `search`, `annotation`.
- [ ] Desktop smoke, parity step: 2 failures – slides.pdf page 9 (`#arrows` beat 1) fits at zoom 0.95 in the app and 0.9 on the command line, so 3 pages' text differs.
- [ ] python-intro: „the hour ahead“ vs „all afternoon“ – left because of the shots.
- [ ] spoken-talk `#board`: sub-heading says „six steps“, the drawing has three boxes – check.

- [x] `comparison`'s details: a `summary` style in `site.css` (it is the
      browser default now) and open the block a `#fragment` names (`site.js`,
      on load and `hashchange`). After site-s1, which may touch `site.css`.

- [ ] Top bar at its breakpoints: the DE entry is now „Im Hörsaal“ (was „Im
      Raum“) – check it does not wrap (`PSI_SITE_NAV_ALL`, DESIGN.md).
- [x] Re-shoot `img/builder-lecture.webp` (its alt text, getting-started EN
      :104 / DE :109, still describes „12 sections, 92 slides, 2 pictures“).

- [x] `npm run build:tracked`, `npm run gate`, `node lint.js lectures/ --strict`,
      site build with both gates, `node docs/artifact/refresh-figures.mjs --check`.
- [x] Browser specs touching tutorial / diagrams / decoration.
- [ ] Move this file to `docs/history/`.
