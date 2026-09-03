# TODO – inconsistencies, surprises, ambiguities, laxness

Collected while making every `{…}` tail dot-mandatory. Each entry is something
the format does two ways, or one way it should not. None is fixed here.

## Attribute tails

- **`{autoplay=1200 cycle}` on `::: draw` is the one tail that breaks the
  sigil rule.** `autoplay=N` is key=value and `cycle` is a bare flag, inside
  the same braces where every other setting is `.word`. Options: `.cycle`
  plus an `autoplay` written outside the braces like `reveal` on a backdrop
  and `from` on an overlay (`::: draw autoplay 1200 cycle`), which is where
  the format already puts settings that carry a value. Decide before the
  draw block ships in a release.
- **Value-carrying settings live in three places.** `::: side 2:1` (positional,
  before the tail), `::: backdrop pic {…} reveal left 45%` and `::: overlay {…}
  from 2` (after the tail), `{autoplay=1200}` (inside the tail). One position
  would do: after the tail, as a keyword and its value.
- **The chunk tail spells its slots key-value, the directives spell them
  value-only.** `.wrap-none` / `.blocks-center` on a heading; `.outline` /
  `.middle` on a card row. Both are "one word per slot", and the reader
  cannot see that from the spelling. The chunk classes are 1.0.0 interface,
  so this stays; but a *new* chunk-level setting should not add to the
  hyphenated family without deciding which spelling the format wants.
- **`!class` removal exists only in `::: draw`.** A fourth sigil (`.`, `#`,
  `@`, `!`) that no other tail has. Fine while draw is the only place with
  layered defaults, but it should be named in the same sentence as the other
  three wherever the sigil rule is documented.
- **Placeholders differ.** Docs write `<ref>` for a required word and
  `{.classes}` for the tail, `{.width #id}` on a heading, `{.anchor}` on side.
  One placeholder convention across the skills.

## Lint codes

- **The same refusal has a different code per directive.** `bad-side-class`,
  `bad-overlay-class`, `bad-backdrop-class` (and the cards/rows code) all
  report "not a word this directive knows" and "both answer one slot"; the
  chunk tail now says `stray-attribute` and `same-slot`. One family –
  `unknown-slot-word`, `same-slot`, `stray-attribute` – with the directive
  named in the message rather than the code.
- **`unknown-width` fires for any unknown chunk class**, including `.bar` where
  `.bare` was meant; the message says "unknown class", the code says width.
- **`bad-diagram-attribute` is one code for at least five different mistakes**
  (name in the tail, empty `@`, unknown sigil, `!x` twice, bare word).

## Parser behaviour

- **`parseSlotClasses` cannot tell a written default from an absent one.**
  `rows` works around it by testing the raw tail text for `top` before the
  class list is built (its anchor default is `middle`, cards' is `top`). A
  parser that returns `{value, written}` per slot would remove the special
  case and the trap for the next directive whose default differs.
- **Two parsers for one grammar.** `parseAttributeTail` (heading) and
  `parseSlotClasses` (directives) both read `{…}`, both refuse the same three
  things, and each has its own copy of the checks in build.js *and* lint.js –
  four implementations. The heading tail could be a slot table (`width`,
  `wrap`, `blocks`, `heading: shown|bare`, `axis: left|center`) handed to the
  same function, and lint could import it from build rather than mirror it.
- **The build and lint.js mirror every constant by hand** (`CHUNK_STYLE_CLASSES`,
  `SIDE_SLOTS`, `VALID_WIDTHS`, …), each with a comment saying "mirrors X in
  the other file". One module both import would end the class of bug where
  the two disagree about a typo.
- **The column heading (`# Heading {#id}`) refuses classes but silently takes a
  second id**: lint says `multiple-ids`, the build takes the last one written –
  the same "last wins" the chunk tail no longer allows. Now refused in the
  build for chunk headings; check the column path does the same.

## Seen on the way, not a syntax matter

- **`test/text-select.mjs` fails three Alt-drag assertions on this machine**
  ("Alt-dragging the listing selects text", "the highlight survives the key
  release", "a drag that outlives the key still selects") on the tree before
  the tail change as well as after it. Environment or a real regression in
  the selection gesture – undecided, and outside this change.
