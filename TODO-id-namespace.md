# TODO – one namespace for the chrome's element ids

An author's `{#id}` and the runtime chrome's fixed ids share one HTML id
namespace, and nothing keeps them apart. The fix chosen: **every id the build
invents – the chrome's and the generated figure ids – moves under a reserved
prefix, `psiINT-`, and an author id that starts with it is refused.** Author ids stay exactly as written.

Not started, because `build.js` is being worked on in parallel.

## The finding

- **Author ids are emitted verbatim.** `# Heading {#id}` becomes
  `<section class="column" id="…">` (build.js ~10969), `## type: … {#id}`
  becomes `<article class="chunk" id="…">` (~10626). No prefix.
- **The only id checks are within the lecture**: `duplicate-id` in lint.js
  (~3506–3587) and `assertDistinctIds` in build.js (~10571), which guards the
  generated `{id}-section` suffix. Nothing compares an author id against the
  chrome.
- **The chrome uses 66 literal ids**, several of them words a slide would
  plausibly want (grep of `id="…"` and `getElementById('…')` over build.js and
  editor.mjs):

  `add-note-btn blank-badge center-toast clock clock-hint cue-btn cue-crumb
  cue-panel cue-pos cue-rail cue-where cue-zoom cue-zoom-in cue-zoom-out
  demo-badge demo-overlay demo-video drift export-annot-btn export-modal
  figure-overlay freeze-btn fullscreen-hint goto-prompt help-button help-inner
  help-overlay laser-pointer link-overlay link-overlay-hint link-overlay-inner
  link-overlay-label link-overlay-qr link-overlay-url mode-badge nav-hints
  note-templates notes-content notes-pane notes-resizer notes-zoom notes-zoom-in
  notes-zoom-out overview-badge preview-orient-btn preview-resizer preview-strip
  reader-contents reader-data scrubber search-foot search-input search-panel
  search-results slug speaker-footer speaker-help-btn stage stage-cell
  stage-viewport timer toc touch-controls touch-palette touch-rail`

  (`x` also matched the grep – check whether it is a real id or a comment.)
  The list is literals only: ids built in a template (`${…}`) are not in it
  and have to be found by reading.

## Why it bites the chrome and not the chunks

The runtime finds chunks through `flatChunks` (element references), and the
URL hash is resolved against that list too (`chunkIdxFromHash`, ~18409). So a
collision rarely hurts the slide lookup. **It hurts the chrome**: about 57
`getElementById('<chrome id>')` calls, and the chunk articles come *before* the
chrome in document order, so the lookup answers with the slide. An author who
writes `{#stage}`, `{#clock}`, `{#timer}`, `{#scrubber}`, `{#slug}` or
`{#search-panel}` gets a view whose chrome code acts on a slide, and the build
exits 0. Unqualified `#id` rules in the inlined CSS hit the slide the same way.

It has happened twice:

- **`#toc` – live today.** `lectures/tutorial/source.md:212` is
  `{.standard #toc}`, and the tutorial's `audience.html` carries both
  `<article id="toc">` and `<nav id="toc">`. Worked around by scoping every
  rule to `nav#toc` (comment at build.js ~16401) and the JS to
  `querySelectorAll('nav#toc li')`.
- **`#cue-panel`** (CLAUDE.md, conventions): a `display: none` aimed at the
  panel hid a tutorial slide, and one drag stopped after 75 px. Worked around
  by looking up the panel's pieces through `cueRoot.querySelector` and by the
  rule that chrome ids are "words a slide would not want".

Both workarounds are conventions a future change can forget.

## The two options, and why the smaller one

**A – prefix the author ids in the DOM.** Excludes the collision entirely but
touches every place an author id travels: TOC and reader links (`href="#id"`,
`data-rd`), markdown cross-references, the URL hash (published links like
`audience.html#grammar` must keep working), the search index,
`revealed[chunkId]` in the sync and in localStorage, annotation and note
override keys, `--integrate-annotations`, `docs/site/shoot.mjs` and every spec
that addresses a chunk by id. The hash, sync and storage would have to keep the
bare id while only the DOM carries the prefix – two spellings of one id.

**B – prefix the chrome's ids (chosen).** Only build.js (and editor.mjs /
editor.css, if they address chrome) change; everything that carries an author
id is untouched. The risk sits with the chrome's `getElementById` calls, so
this puts the fence exactly on the vulnerable side.

## Plan for B

1. **Prefix: `psiINT-`.** The views are standards mode (`<!DOCTYPE html>`),
   so CSS id selectors, `getElementById` and `querySelector` are
   case-sensitive, and the capitals make the reserved range something no
   author types by accident: none of the 1107 author ids in the corpus
   contains a capital letter, house style is kebab-case. The capitals do *not*
   separate the namespaces on their own – `tails.mjs:483` takes any token
   after `#` as the id, capitals included – so the refusal in step 4 stays;
   the prefix only makes it a refusal that practically never fires.
   (`psi-int-` was the first candidate; a chunk about “psi internals” could
   plausibly hit it. Refusing capitals in author ids altogether would separate
   the namespaces by case alone, but is a much wider source-format change and
   was rejected.) `psi-` stays free for authors.

   **The rule is: every id the build invents starts with `psiINT-`** – the
   chrome's fixed ids and the three generated prefixes below, so one refusal
   and one gate cover all of it rather than a second refusal for a second
   prefix, which is the kind of special case `#toc` and `#cue-panel` fell
   through.

   | today | where | becomes |
   |---|---|---|
   | `psi-fig-N-…` | inlined SVG assets, build.js ~396; regex at ~3028; `test/reproducible.mjs` | `psiINT-fig-N-…` |
   | `psi-sym-N` | a picture reused inside a figure, build.js ~3048 | `psiINT-sym-N` |
   | `dgN-…` (`dg1-root`, `dg1-a`, `dg1-a--r` …) | every element of every `::: draw`, the default `prefix` in diagram-core.mjs ~9147 | `psiINT-dgN-…` |

   The editor derives the diagram prefix from `data-for`
   (`sc.dataset.for.replace(/root$/, '')`, editor.mjs ~135), so it follows
   without a change of its own; diagram-core.mjs runs in the page too, so the
   new default ships in the same commit as the views built with it. Tests that
   spell `'dg1-'` / `"dg2-"` literally: `test/reader.mjs`,
   `test/gates/chains.mjs`, `test/gates/semantics.mjs`.

   **Not in scope: ids derived from an author id**, such as the divider's
   `{id}-section`. Those live in the author's namespace and
   `assertDistinctIds` already guards them.
2. **Rename every chrome id** – the literal list above plus the template-built
   ones – in the HTML skeletons, `AUDIENCE_JS`, `SPEAKER_JS`, the inlined CSS,
   editor.mjs / editor.css. Mind the template-literal traps in CLAUDE.md
   (backticks, doubled regex backslashes).
3. **Undo the workarounds**: `nav#toc` can go back to `#psiINT-toc`, the
   comment at ~16401 goes; `cueRoot.querySelector` may stay (it is good
   practice) but no longer carries the weight. Rewrite the CLAUDE.md
   convention about chrome ids to point at the prefix.
4. **Refuse the prefix in author ids**: a `buildOnce` pre-flight
   (`userFacing` error) and a `lint.js` error with the same key – match the
   prefix case-sensitively, exactly as the browser does – in one
   commit. Cover every construct that takes `{#id}` – chunks, column
   headings, and anything else `parseTail` resolves an id for. No existing
   lecture here or in `psi-slides-mylectures` uses an id starting with `psi`
   (checked over 1107 ids), so the refusal costs no known deck a build;
   strictly it is still a source-format change, so it goes in the changelog.
5. **A gate that keeps it true**: a `test/gates/` check that every
   `id="…"` template and `getElementById('…')` in build.js and
   diagram-core.mjs either starts with `psiINT-` or emits an author id (with
   an explicit allow-list for anything that must not, if any), so a new chrome
   element cannot slip back into the shared namespace.
6. **Check external readers of chrome ids**: `test/*.mjs` (e.g.
   `#preview-resizer`, `#notes-pane`, `#preview-strip`, `#speaker-footer`),
   `docs/site/shoot.mjs`, `desktop/` if it drives a view. Update them in the
   same commit.
7. Rebuild and commit the tracked views of `tutorial`, `diagrams`,
   `decoration`; run the gates and the browser suite (the rename touches
   `AUDIENCE_JS` and the speaker runtime).
