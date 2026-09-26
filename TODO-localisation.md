# TODO – localise the generated strings, keyed off `lang:`

Every word the build *invents* – the words that are not in `source.md` but
appear in the four outputs – is English, and there is no way to say
otherwise. `lang:` exists and is honoured, but today it does exactly one
thing: it lands in `<html lang>` so the browser picks a hyphenation
dictionary. This file inventories the invented words, proposes one table in
`build.js` that `lang:` selects from, and lists what has to move with it. It
is written so a fresh session can implement it without re-deriving the
inventory; every entry carries a `build.js:NNNN` anchor that was correct
when the file was written and is a grep target, not a promise.

Nothing here changes how an existing `source.md` builds: a lecture with no
`lang:` or with `lang: en` produces the same HTML it produces today. That is
the 1.0.0 contract (CLAUDE.md, *What this is*) and it is the constraint on
every design choice below.

## 1. The problem, and what forced it

A German course reading text – `lang: de`, prose in German, headings in
German – builds a `print.html` and a `print-notes.html` whose table of
contents is headed **Contents**, whose asides are labelled **Speaker Note**
and **Presentation Note**, and whose tagged chunks wear an eyebrow reading
**exercise**, **question**, **principle**, **definition**, **example**. The
projection adds **EXERCISE** over every exercise chunk in CSS. A reader of the
handout sees a German document with English furniture.

The author's two options today are both wrong: run `sed` over the built HTML
after every build (which the `--watch` loop overwrites, and which the release
workflow's staleness check cannot know about), or set
`style: {labels: off}` and lose the eyebrows entirely – but not the table of
contents heading, and not the note labels, which no key reaches.

The fix is not a German build. It is that `lang:` – which already declares the
lecture's language, and already fails the build on a value that is not a
language tag (`lectureLang`, build.js:4514) – selects the words too.

## 2. Inventory

Everything below was found by grepping `build.js` for literal text in
markup, in `content:` declarations and in runtime `textContent` /
`flashMode` calls, then classified by who sees it. Three tiers:

- **Reader** – on paper or on the projection, seen by a student or a reader
  of the handout. These are the strings the request is about, and the ones
  the locale table must cover.
- **Reader, on interaction** – on the projection, but only after someone at
  the keyboard presses a key or taps a control (`?`, `/`, `T`, `O`, the touch
  rail). A student browsing `audience.html` alone sees them; a room being
  projected to normally does not.
- **Speaker** – `speaker.html` only, or the cockpit half of a shared element.
  Operator UI. Out of scope for the first pass; listed so the inventory is
  complete and so nobody has to redo the grep.

### 2.1 Document views (`print.html`, `print-notes.html`)

| String | Where | View | Seen by |
| --- | --- | --- | --- |
| `Contents` (heading) and `aria-label="Contents"` | `renderToc`, build.js:5416–5417 | print, print-notes | Reader |
| `Speaker Note` | `.speaker-note-label`, build.js:5345 | print-notes | Reader |
| `Presentation Note` (the printed `> annot:` block) | `.presentation-note-label`, build.js:5338 | print, print-notes | Reader |
| Type eyebrow: the tag word itself – `principle`, `definition`, `example`, `question`, `exercise`, `outline` | `labelTag` → `<span class="chunk-label">`, build.js:5317–5319; small-caps in CSS at :5786; hidden by `style.labels: off` at :5981 | print, print-notes | Reader |
| `note` – default eyebrow of a `::: footnote` / `::: margin` aside, and of a `::: expand` written without a label | set in the parser, build.js:4014; drawn by `content: attr(data-label)` at :5874 | print, print-notes (and audience, :9829) | Reader |
| `– print` / `– print + notes` (`<title>` suffix) | build.js:5499, :5513 | print, print-notes | Reader (browser tab) |
| `Untitled lecture` | `lectureTitle`, build.js:4507 | all four | Reader (only when `title:` is missing) |
| `missing: assets/<name>.(png\|jpg\|…)` | image resolver, build.js:2127 | all four | Reader – but this is a diagnostic for the author; see §5 |

Not affected, checked: the cover (`renderTitleBlock` :4965, `renderClosingBlock`
:5010) emits only frontmatter and body text; the section divider draws
`section-mark:` verbatim or a number (:5032–5054); `renderOutlineList` (:6646)
and `renderDock` (:2028) emit `data-state="done|now|next"` as **attribute
values** only, never as visible words; slide numbers are digits; `@page`
footers carry `counter(page)` and no word (:5556–5560).

### 2.2 Projection (`audience.html`), always visible

| String | Where | Seen by |
| --- | --- | --- |
| `EXERCISE` – the one eyebrow the projection still generates | `content: 'EXERCISE'` in AUDIENCE_CSS, build.js:7952; its `labels: off` counterpart at :8042 | Reader |
| `note` – default aside label, as above | `content: attr(data-label)` at build.js:9829 (`.margin-note::before`) | Reader |
| `annotation · <chunk-id>` – label over a shown `> annot:` box | build.js:6584 (`.annot-box-label`; shown in the audience at full opacity, :9866) | Reader, when a chunk carries an annotation |
| `+ note` – the annotation button on the active chunk | build.js:6588; hidden only in the cockpit (:15668), dim on the projection (:10003) | Reader |
| Chevron abbreviations `Ex`, `Exp`, `Ref`, `Pf`, `Fig`, `Set`, `N.B.`, `ASD` … | `abbrevForLabel`, build.js:6359–6376; matched on **English prefixes** of the author's `::: expand` label, so a German label (`Beweis`, `Beispiel`) falls to `Exp` | Reader |
| `– lecture` (`<title>` suffix) | build.js:7008; note that `--squint` strips exactly this suffix by regex at :18819 | Reader (browser tab) |
| `Embedded video` (iframe title) | build.js:823 | Reader (assistive tech) |
| `QR code for this address` (aria) | build.js:925 | Reader (assistive tech) |
| `Show this address large, with a code to scan` (aria on the link mark) | build.js:2182; asserted verbatim by `test/settings.mjs:1743` | Reader (assistive tech) |

### 2.3 Projection, on interaction

| String | Where | Seen by |
| --- | --- | --- |
| `Contents` heading and aria on the `T` column list | `renderTocNav`, build.js:6956–6957 | Reader, after `T` |
| The `?` cheat sheet: section titles (`Moving around`, `Finding a slide`, `Searching`, `On the slide`, `Reading knobs`, `The other windows`, `The experimental diagram editor`), every row, the header `psi-slides · audience view`, `? or Esc closes`, the button's aria/title `Keyboard and mouse reference` | `renderHelpOverlay`, build.js:6808–6947 – one data structure for both live views, as CLAUDE.md says | Reader, after `?` |
| Search panel: `search the lecture...` placeholder, `pick · go · close` foot, aria `Search slides`, `(untitled)` for a chunk with no heading | build.js:6796–6799, :12425 | Reader, after `/` |
| Overview badge: `overview · drag pans · wheel zooms · … selects · … lands · / search · Esc leaves` | build.js:6765 | Reader, after `O` |
| Touch rail and palette aria-labels: `Slide controls`, `Shorten or expand the text`, `Change the font`, `Change the theme`, `Auto-fit: …`, `Search the lecture`, `Select text`, `Previous`, `Next`, `Overview`, `Zoom out`, `Zoom in`, `More controls` | build.js:6743–6758 | Reader on a touchscreen (assistive tech) |
| Link overlay: aria `Link address`, hint `scan it, or click the address to open it · Esc closes` | build.js:6779–6787 | Reader, after Shift-click |
| `BLANK · hit B to toggle`, `DEMO · hit D to end it` | build.js:6774, :6794; on the projection only when no cockpit is open (:10372–10384) | Reader, single-screen use |
| Mode badges (`flashMode`): `slide numbers · …`, `font · …`, `theme · …`, `collapse: show everything` / `topic + bold` (`COLLAPSE_LABEL`, :13093), `zoom: 1.25× · limited by this slide`, `select text while Alt/option is held · Esc clears`, `select text by dragging · tap the button again to pan` | build.js:11359–11377, :13460, :13501, :14049, :14730 | Reader, after a knob key |
| `Note… (Enter for newline, Esc to exit)` – annotation textarea placeholder | build.js:6585 | Speaker in practice (typed from the cockpit), but the markup is in both views |

### 2.4 Cockpit only (`speaker.html`)

Listed for completeness. None of it is on paper or on the projector.

| String | Where |
| --- | --- |
| `+ note` / `Open speaker notes (Shift-N)`, `Elapsed since the talk began · click to restart from 0:00` | build.js:14894–14895 |
| `Cue cards` (aria), `Drag to resize notes · double-click to reset`, `Smaller notes text`, `Larger notes text` | build.js:14897–14909 |
| `Drag to resize the preview strip · double-click to reset`, `● live`, `⇄ layout` + title, `▤ cards` + title, `export notes` + title, `? help` + title, footer `V freeze · B blank · D demo · N annot · Shift-N notes · Shift-E export` | build.js:14913–14924 |
| CSS `content:` – `drag to resize · double-click resets` (twice), `next` on the hatched reveal preview | build.js:15088, :15242, :15450 |
| Diagram step hint `next: <step name>` | build.js:2876; `.dg-hint` is `display: none` outside the cockpit (:2732, :15491) |
| Cue rail: `reveal n/m`, `figure · step n`, `beat`, `advance`, `slide n` / `end`, `the last slide`, `slide n/m`, `now`, `+1`, `No notes on this slide. Write > note: blocks …` | build.js:16662–16675, :16753, :16396, :16463, :16781 |
| `against the @… mark of the current card` | build.js:16741 |
| Export modal: `copy`, `Clear Drafts removes the annotations from localStorage …`, `Keep drafts (close)`, `Clear drafts now` | build.js:16165–16209 |
| `flashMode` in the cockpit: `address shown on the projection`, `demo ended`, `demo live`, `no screen capture in this browser`, `no projection window – it opens with S from the audience view`, `demo: … did not answer – rebuild it`, `demo: connection lost`, `demo: no WebRTC`, `demo: could not connect`, `viewer layout · preview …`, `notes height: auto`, `notes text · n%`, `preview size: auto` | build.js:13767–13991, :16807–16985 |
| The cockpit half of the `?` sheet (`Cue cards`, `Arranging this window`, `Notes`, `The projector`) and its header `psi-slides · speaker cockpit`, `– speaker` in `<title>` | build.js:6859–6890, :6940, :14872 |

## 3. Mechanism

### 3.1 One table, selected by `lang:`

A `STRINGS` table next to `lectureLang` (build.js:4514), one object per locale,
keyed by **role** and never by the English text:

```js
const STRINGS = {
  en: {
    contents: 'Contents',
    'speaker-note': 'Speaker Note',
    'presentation-note': 'Presentation Note',
    'aside-note': 'note',                 // default ::: footnote / ::: expand label
    type: { principle: 'Principle', definition: 'Definition', example: 'Example',
            question: 'Question', exercise: 'Exercise', outline: 'Outline' },
    'title-print': 'print', 'title-print-notes': 'print + notes',
    'title-lecture': 'lecture',
    'untitled-lecture': 'Untitled lecture',
    // …§2.2 and §2.3 follow the same shape
  },
  de: { /* §4 */ },
};

function lectureStrings(frontmatter = {}) {
  const tag = lectureLang(frontmatter);
  const primary = tag.split('-')[0].toLowerCase();   // de-AT → de
  const base = STRINGS[primary];
  if (!base && primary !== 'en') warnOnce(
    `[lang] no wording for "lang: ${tag}" – the generated labels stay English.\n` +
    `        Locales this build knows: ${Object.keys(STRINGS).join(', ')}.\n` +
    `        Override single words with a labels: block in the frontmatter.`);
  return mergeLabels(base || STRINGS.en, frontmatter);   // §3.2
}
```

Decisions folded into that sketch:

- **Primary subtag, not the whole tag.** `lectureLang` already accepts
  `de-DE`, `de-AT`, `en-GB`. The dictionary wants the full tag in `<html lang>`;
  the wording wants the language. A regional table can be added later as
  `'de-AT'` and looked up before the primary, but nothing needs it now.
- **A `lang:` with no locale is a warning, not an error, and the build falls
  back to `en`.** `lang: fr` is a correct language tag that the hyphenator
  honours today; refusing it because the wording table has no French would
  make an existing lecture stop building, which is the one thing the 1.0.0
  contract forbids. The warning goes through `console.warn` the way
  `warnOversizedAsset` (build.js:200) does, once per build, and names the
  `labels:` override so the author knows the way out.
- **Resolved once in the `buildOnce` pre-flight** (build.js:17572–17581,
  beside `styleSettings`), so that a bad override refuses the build before any
  view is written – the same "no half-written artefact" contract
  `assertInlinable` sets. The resolved object is passed into the three
  renderers alongside `frontmatter`, not re-derived in each.
- **Absence produces today's HTML.** `STRINGS.en` is transcribed from the
  current literals character for character; a lecture that says nothing gets
  the same bytes. The gate for that is in §6.

### 3.2 Overriding single words: a top-level `labels:` block

```yaml
lang: de
labels:
  contents: Inhalt
  speaker-note: Moderation
  type:
    exercise: Übung
```

Why a **top-level** block and not `style: {labels: {…}}`:

- `style:` is documented as *deliberately not a stylesheet hook: each key is a
  closed vocabulary or a bounded number* (build.js:4602–4611), and `lint.js`
  mirrors it as `STYLE_ENUMS` (lint.js:98, :2274–2300) – a whitelist of
  values. Free text inside `style:` breaks that rule and the linter's mirror
  at once.
- `style.labels` is already taken: it is the `on`/`off` switch for the
  eyebrows (`STYLE_SPEC.labels`, build.js:4718). Making one key an enum in one
  spelling and a map in another is exactly the kind of inconsistency
  `TODO-inconsistencies.md` exists to remove.
- The precedent for author-supplied free text is `section-mark:` (build.js:5049–
  5054): a top-level key, used verbatim, `none` to suppress. `labels:` follows
  it – a top-level key whose *values* are free text and whose *keys* are a
  closed set.

Rules: the keys are the role names of `STRINGS.en` (nested `type:` for the
tag words); an unknown key fails the build with the `Frontmatter: labels has
no key "…"` shape `styleSettings` uses (build.js:4795–4800), and `lint.js` gets a
matching `unknown-label-key` error in the same commit (CLAUDE.md, *lint.js is
independent*: when you add a refusal to one file, grep the other); a value is
used verbatim after `escapeHtml` in markup and after CSS-string escaping in
`content:` (§3.3). `labels:` without `lang:` is allowed – an English deck may
want `Contents` to read `In this lecture`. The block covers the **reader**
tiers (§2.1–2.3). Cockpit strings (§2.4) are not overridable; if they are ever
localised it is through the table alone.

Both `style.labels: off` and a `labels:` block are legal together: the first
hides the eyebrows, the second still names the TOC and the notes.

### 3.3 The projection's `EXERCISE`: CSS `content:` from a custom property

The type word is emitted twice and one switch has to reach both – the comment
above `STYLE_SPEC.labels` (build.js:4708–4718) already says so for the on/off
case. For the wording:

- **Print** (build.js:5317–5319): `escapeHtml(S.type[labelTag])` instead of
  `escapeHtml(labelTag)`. Print lowercases today and lets `.chunk-label`'s
  `font-variant-caps: all-small-caps` (:5786) set it; keep the emitted case
  as it is so the look does not move.
- **Projection** (build.js:7952): `content: 'EXERCISE'` becomes
  `content: var(--label-exercise, 'EXERCISE')`, and `styleBlockCss`
  (build.js:4829–4834) – which already emits a per-build `:root { … }` – adds
  `--label-exercise: "AUFGABE";` when the resolved word differs from the
  default. The value has to be a CSS string: escape `\`, `"` and newlines
  (there is no `CSS.escape` in Node; a four-line replace does it). Note that
  `all-small-caps` leaves capitals as full caps, which is why the projection
  writes `EXERCISE` in caps and print writes `exercise` in lowercase: uppercase
  the table word for the projection, lowercase it for print, and the two views
  keep their present weights.
- `body[data-labels=off] … ::before { content: none }` (build.js:8042) is
  untouched.

An alternative – emitting `data-label` on the article and using
`attr(data-label)` as the asides already do (:5874, :9829) – would also work,
but it changes the audience markup for every exercise chunk, which the
custom property does not.

### 3.4 What each site reads

`S` is the resolved object. Anchors are the ones in §2.

| Site | Today | After |
| --- | --- | --- |
| `renderToc` :5416, `renderTocNav` :6956 | `Contents` ×2 each | `S.contents` in the heading and the aria |
| :5338, :5345 | `Presentation Note`, `Speaker Note` | `S['presentation-note']`, `S['speaker-note']` |
| parser :4014 | `'note'` | the parser stays; the **renderers** substitute `S['aside-note']` when `e.label === 'note'` and the author wrote no label – or, cleaner, the parser stores `label: null` and both renderers fill it. The second needs `lint.js` and `abbrevForLabel` (:6360, which treats `''` as `Exp`) checked. |
| :5499, :7008, :14872 | `<title>` suffixes | `S['title-*']`; and `--squint` at :18819 strips `S['title-lecture']` rather than the literal |
| :4507 | `Untitled lecture` | `S['untitled-lecture']` |
| :7952 + :4829 | `content: 'EXERCISE'` | §3.3 |
| :6584, :6588 | `annotation ·`, `+ note` | `S['annotation-label']`, `S['add-note']` |
| :6359–6376 `abbrevForLabel` | English prefixes | add the German prefixes to the same chain (`bew` → `Pf`, `bei` → `Ex`, `lit`/`que` → `Ref`, `lös`/`ant` → `?`, `abb` → `Fig`, `war`/`ach` → `!`); the abbreviations themselves stay, they are glyph-like |
| :6808–6947 `renderHelpOverlay` | one array literal | the arrays move under `STRINGS.<lang>.help`; the shape is already data, which is why this is cheap |
| :6743–6799 the five HTML constants | literals | become functions of `S`, the way `renderHelpOverlay` already is; `test/gates/inlined.mjs:53` names these five literals by name and scans them as literals, so the gate's opener/closer detection needs a look |
| :11359–14730 audience `flashMode` | literals inside `AUDIENCE_JS` | the runtime cannot read `S` at build time; emit `window.PSI_STRINGS = {…}` in the page head (the way `VIEW`, `KATEX_TOGGLE_FAMS` and the editor payload are already injected) and have `flashMode` read from it. Second pass; see §7 |

## 4. German wording

The reader tiers first. Casing as the table stores it; each site cases as
§3.3 says.

| Role | en | de |
| --- | --- | --- |
| `contents` | Contents | Inhalt |
| `speaker-note` | Speaker Note | Sprechernotiz |
| `presentation-note` | Presentation Note | Anmerkung |
| `aside-note` | note | Anmerkung |
| `type.principle` | Principle | Grundsatz |
| `type.definition` | Definition | Definition |
| `type.example` | Example | Beispiel |
| `type.question` | Question | Frage |
| `type.exercise` | Exercise | Aufgabe |
| `type.outline` | Outline | Überblick |
| `type.figure` (not emitted today, reserved) | Figure | Abbildung |
| `title-print` | print | Druck |
| `title-print-notes` | print + notes | Druck + Notizen |
| `title-lecture` | lecture | Vorlesung |
| `title-speaker` | speaker | Sprecher |
| `untitled-lecture` | Untitled lecture | Vorlesung ohne Titel |
| `annotation-label` | annotation | Anmerkung |
| `add-note` | + note | + Anmerkung |

Two words need a decision rather than a translation. **`Presentation Note`**
is the printed `> annot:` block – what the lecturer typed on the slide during
the talk – and `Anmerkung` (also used for the aside default and the annotation
box, which are the same object seen from three views) keeps the three
consistent; `Präsentationsnotiz` is the literal rendering if the distinction
from `Sprechernotiz` matters more than the consistency. **`Principle`** has no
single German equivalent; `Grundsatz` is proposed, `Prinzip` and `Merksatz`
are the alternatives, and this is the word an author is likeliest to
override – which is what `labels:` is for.

Interaction tier (§2.3), in the same table, so a student on a tablet gets a
German `?` sheet:

| Role | en | de |
| --- | --- | --- |
| help header | audience view / speaker cockpit | Zuschaueransicht / Sprecherpult |
| help sections | Moving around · Finding a slide · Searching · On the slide · Reading knobs · The other windows | Navigation · Eine Folie finden · Suchen · Auf der Folie · Lesehilfen · Die anderen Fenster |
| help dismiss | ? or Esc closes | ? oder Esc schließt |
| search placeholder | search the lecture... | Vorlesung durchsuchen... |
| search foot | pick · go · close | wählen · öffnen · schließen |
| search untitled | (untitled) | (ohne Titel) |
| overview badge | overview · drag pans · wheel zooms · … selects · … lands · / search · Esc leaves | Übersicht · Ziehen verschiebt · Rad zoomt · … wählt · … öffnet · / Suche · Esc verlässt |
| touch aria | Slide controls · Shorten or expand the text · Change the font · Change the theme · Auto-fit … · Search the lecture · Select text · Previous · Next · Overview · Zoom out · Zoom in · More controls | Foliensteuerung · Text kürzen oder ausklappen · Schrift wechseln · Farbschema wechseln · Automatisch einpassen … · Vorlesung durchsuchen · Text auswählen · Zurück · Weiter · Übersicht · Verkleinern · Vergrößern · Weitere Steuerung |
| link overlay | Link address · scan it, or click the address to open it · Esc closes | Linkadresse · scannen oder Adresse anklicken · Esc schließt |
| link mark aria | Show this address large, with a code to scan | Adresse groß anzeigen, mit Code zum Scannen |
| QR aria / iframe title | QR code for this address / Embedded video | QR-Code für diese Adresse / Eingebettetes Video |
| badges | BLANK · hit B to toggle / DEMO · hit D to end it | SCHWARZ · B schaltet um / DEMO · D beendet |
| collapse label | show everything / topic + bold | alles zeigen / Kernsatz + fett |
| mode badges | slide numbers · / font · / theme · / zoom: … limited by this slide / select text while Alt/option is held · Esc clears | Foliennummern · / Schrift · / Farbschema · / Zoom: … durch diese Folie begrenzt / Text auswählen bei gehaltenem Alt/Option · Esc hebt auf |

The help rows themselves (some seventy) are not translated in this file;
they are the bulk of the work in the second pass and belong in the table, not
here. Keep every key name (`Space`, `Esc`, `Shift`) as it is printed on the
keyboard – see §5.

## 5. What is not localised, and why

- **Key names and hotkeys.** `Esc`, `Space`, `Shift-N`, `B`, `V` are what the
  keycap says; translating `Space` to `Leertaste` in the `?` sheet is
  arguable, translating the letter keys is not, and the row text around them
  is where the language lives. `<kbd>` content stays.
- **Lint messages, build refusals, the build log.** `lint.js` output and
  every `userFacing` error are read by the author at a terminal, they quote
  source lines and key names, and a translated refusal that names an English
  key (`style.hyphenate: yes is not a value …`) is worse than an English one.
  The `[lang]` warning of §3.1 is English for the same reason.
- **The image placeholder** `missing: assets/…` (build.js:2127). It is a
  build diagnostic that happens to render; the fix is the file, not the word.
- **Source-format vocabulary.** `## exercise:`, `::: footnote`, `> note:`,
  `{.wide}` – the interface. The tag *word* in the source stays English;
  only the eyebrow it produces changes.
- **Chevron abbreviations** (`Exp`, `Ref`, `Pf`, `Fig`, `N.B.`). Two or three
  glyphs on a button, closer to an icon than a word; the prefix matching
  gains German prefixes (§3.4) and the glyphs stay.
- **Diagram text, code, math.** Author content; the compiler emits no words
  of its own into a figure.
- **The cockpit** (§2.4), in the first pass. It is one person's tool, that
  person reads the English docs to learn it, and every string there sits
  beside a hotkey. It is not excluded by design – the table can grow – but it
  is not what the German handout needed.
- **Author-written labels.** `::: expand Beweis` prints `Beweis`; a
  `section-mark:`; `cover`, `presenter`, `info`. Already the author's words.

## 6. Tests and gates to move with it

Browser suite (`test/`, `npm test`) and gates (`test/gates/`, `npm run gate`),
per `test/README.md`. What exists and touches this:

| Spec | What it pins today | What changes |
| --- | --- | --- |
| `test/settings.mjs:337–349` (*style.labels reaches both views*) | `class="chunk-label"` in print; `data-labels="off"` on both bodies; `body[data-labels=off] .chunk-label` rule in print; the `.chunk[data-tag=exercise]` off-rule in the audience CSS | the last assertion matches the selector, not the `content:` value, so it survives §3.3 – re-check after the `var()` rewrite that the regex `body\[data-labels=off\][^{]*\.chunk\[data-tag=exercise\]` still finds the rule |
| `test/settings.mjs:2206–2229` (*lang / hyphenate*) | builds `lang: de` decks and asserts on `data-hyphenate` and `lang="de"` | these builds will now emit German labels; none of the assertions matches an English label, but the block is the natural home for the new assertions below |
| `test/settings.mjs:1743` | `aria-label="Show this address large, with a code to scan"` verbatim | keep for the `en` build; add the `de` counterpart or match the role rather than the words |
| `test/gates/inlined.mjs:40–60` | scans the seven CSS/JS literals and the five HTML constants (`TOUCH_CONTROLS_HTML`, `OVERVIEW_BADGE_HTML`, `BLANK_BADGE_HTML`, `LINK_OVERLAY_HTML`, `SEARCH_PANEL_HTML`) for a raw backtick, by name | if those five become functions of `S` (§3.4) the gate's opener pattern (`const NAME = \``) no longer matches them; either keep them as literals with `${…}` holes – a template literal is still a literal – or teach the gate the new shape |
| `test/expansion.mjs`, `test/marginalia.mjs` | chevron and aside behaviour; no assertion on the label text found | unchanged, but run them: the aside default label is on the path |
| `--squint` (build.js:18819) | strips ` – lecture` from the audience `<title>` | reads the suffix from the table; a `de` squint of a lecture should not carry `– Vorlesung` into its report title |

New assertions, in `test/settings.mjs` beside the `lang:` block:

- A deck with no `lang:` and a deck with `lang: en` build byte-identical
  print, print-notes and audience HTML before and after (the 1.0.0 gate for
  this change; compare against a fixture built from `main`).
- `lang: de` → print has `>Inhalt<`, `Sprechernotiz`, `Anmerkung`, a
  `chunk-label` reading `aufgabe`; audience CSS has
  `--label-exercise: "AUFGABE"`; no `Contents` anywhere in the reader tiers.
- `lang: de-AT` resolves to the `de` table.
- `lang: fr` builds, exits 0, and the log carries `[lang] no wording for
  "lang: fr"` exactly once across all four views.
- `labels: {contents: Inhalt}` without `lang:` → `Inhalt` in an otherwise
  English build; `labels: {contentz: x}` → build refused, `lint.js` reports
  `unknown-label-key`; a value containing `"` and `\` survives into
  `content:` as a valid CSS string (build the audience view and check the
  page's stylesheet parses – `document.styleSheets[…].cssRules` in the
  harness).
- `style: {labels: off}` together with `labels: {contents: Inhalt}`: no
  eyebrow, German TOC heading.

Gates: a small `test/gates/strings.mjs` that loads `build.js` far enough to
read `STRINGS` – or the table is moved into a zero-dep module the gate can
import, which is the `tails.mjs` pattern and also what `lint.js` needs for its
key whitelist – and asserts every locale has every key `en` has, and no key
`en` lacks. That is the check that keeps a new string from being added to
`en` alone.

Docs: `README.md:137` lists the composition keys – add `labels:`; the
`psi-slides-appearance` skill's *Document language and hyphenation* section
(SKILL.md:109) gets a paragraph on wording; `CLAUDE.md:344` (`lang:` picks the
dictionary) gets the second clause; `CHANGELOG.md` *Unreleased / Added*.

## 7. Steps

Two passes. The first is what the German handout needs and touches print,
print-notes and the always-visible projection strings; the second is the
interaction tier and the cockpit.

**Pass 1 – documents and the projection's furniture**

- [ ] Add `STRINGS` with `en` and `de`, and `lectureStrings(frontmatter)`
      beside `lectureLang` (build.js:4514); primary-subtag lookup, `en`
      fallback, one `console.warn` for an unknown locale.
- [ ] Add the top-level `labels:` block: closed key set, free values,
      unknown key refused in the `buildOnce` pre-flight (build.js:17572) with
      the `styleSettings` message shape; `lint.js` mirror
      (`unknown-label-key`) in the same commit.
- [ ] Thread `S` into `renderPrint*`, the audience renderer and the speaker
      renderer alongside `frontmatter`; no renderer calls
      `lectureStrings` itself.
- [ ] `renderToc` :5416 and `renderTocNav` :6956 – heading and aria.
- [ ] :5338 / :5345 – the two note labels.
- [ ] :5317–5319 – the print eyebrow from `S.type`.
- [ ] :7952 – `content: var(--label-exercise, 'EXERCISE')`; `styleBlockCss`
      :4829 emits the property with CSS-string escaping.
- [ ] The aside default `note` (:4014 → :5874, :9829); decide parser-null vs
      renderer-substitution and check `abbrevForLabel` :6360 either way.
- [ ] `<title>` suffixes :5499, :7008, :14872 and the `--squint` regex
      :18819; `Untitled lecture` :4507.
- [ ] `annotation ·` :6584 and `+ note` :6588.
- [ ] German prefixes in `abbrevForLabel` :6359.
- [ ] Tests from §6: the byte-identity gate first, then the `de` assertions,
      the `fr` warning, the `labels:` refusal, the CSS-string escape.
- [ ] Docs from §6; `CHANGELOG.md`.
- [ ] Rebuild `lectures/tutorial`, `lectures/diagrams`, `lectures/decoration`
      and confirm their committed HTML is unchanged (they carry no `lang:`);
      the release workflow fails on stale HTML, so this is the check that the
      `en` path really is byte-identical.

**Pass 2 – the interaction tier and the cockpit**

- [ ] Move `renderHelpOverlay`'s arrays under `STRINGS.<lang>.help`; translate
      the rows; `<kbd>` content stays.
- [ ] The five HTML constants (:6743–6799) read from `S`; settle the
      `test/gates/inlined.mjs` question first (§6).
- [ ] Touch-rail aria-labels, link-mark aria :2182, QR aria :925, iframe title
      :823.
- [ ] `window.PSI_STRINGS` injected into the live views; `flashMode` sites,
      `COLLAPSE_LABEL` :13093, the search panel's `(untitled)` :12425 read it.
- [ ] Cockpit strings (§2.4) – only if wanted; the table can hold them, the
      `labels:` block does not expose them.
- [ ] `test/gates/strings.mjs` key-parity gate.
