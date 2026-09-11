# Bugs found and not yet fixed

One section per defect. Each says what was observed, what it costs an author,
where the code is, and what would have to change in the same commit. Delete a
section when it is fixed and the fix has a test.


---

## 1. A `::: draw` token value cannot hold a backslash before `n` or `"`, or at its end

**Found by** a code review of `5393766` (the label-escape fix) and confirmed by
round-tripping against the real `dgTokenize`. The editor's `dgeQuote` was
corrupting labels; that half is repaired in the same commit as this entry, and
what is left is the hole underneath it.

### What the two layers do

`dgTokenize` reads a quoted token and decodes exactly two sequences: `\n` is a
newline, `\"` is a quote that does not close the string. Every other `\X`
passes through whole, `\\` included. `dgSpans` then reads the token as label
text, and *it* treats `\_`, `\^`, `\*`, `\~` and `\\` as escapes.

So `\\` means two different things one layer apart: the tokenizer hands it on
as two characters, and dgSpans collapses it to one. That is deliberate – it is
what lets the label layer own its own escapes without the tokenizer knowing
about them.

The consequence is that **a token value containing `\` immediately before `n`
or `"`, or ending in `\`, has no source form at all**:

| wanted token value | written | tokenizer gives |
|---|---|---|
| `C:\` | `"C:\"` | the `\"` escapes the closing quote; the string runs on |
| `C:\new` | `"C:\new"` | `C:` + a newline + `ew` |
| `a\"b` | `"a\\"b"` | `a\\`, then the quote closes the string early |

### What is repaired and what is not

`dgeQuote` doubles a backslash in those three positions now, so the **drawing**
is right: the token gains a backslash and dgSpans collapses it back. Nothing is
swallowed and no label silently grows a newline. But the token is not
byte-identical, so a value like `C:\` gains one backslash per edit round-trip
through the panel. Two or three edits and the label is visibly wrong.

### What a fix has to decide, and it is not a one-liner

Which layer owns `\\`. The options, none of them free:

- **The tokenizer collapses `\\` to one backslash.** Then the source form
  exists, and `dgSpans` needs a different spelling for its own literal
  backslash, or an author writing `\\` in a label gets one backslash where the
  grammar documents two escapes.
- **`dgeQuote` stops working at token level** and the panel edits rendered
  label text instead. That is a bigger change than it sounds: `spanOf` hands
  back the token, and the span table splices at token offsets.
- **Refuse it.** The value is rare enough that naming it at parse time –
  "a label cannot end in a backslash; write `\\`" – may be the honest answer,
  and it is what this grammar does elsewhere rather than accept a form it
  cannot round-trip.

Whichever, the round-trip belongs in `test/gates/semantics.mjs` as an
assertion that `dgTokenize(dgeQuote(v))` is `v` for a table of awkward values,
because that is the property that was never checked and is why this shipped.
