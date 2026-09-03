---
name: psi-slides-media
description: How a psi-slides lecture references something that is not text – `![](clip-id)` video (inlined, staged to `videos/`, or remote) with its cross-window play/pause/seek sync, `::: embed <url>` for YouTube and Vimeo (the `data-src` privacy property, the SDK-free postMessage control protocol, the `file://` Error 153 card), and external link addresses with their build-time QR codes and the `style.link-codes` switch. Use when changing `VIDEO_EXTS`, `stageVideo`, `parseEmbedUrl`, `wireEmbeds`, `qrSvg`, the `LINK_QR` map, or their `lint.js` mirrors.
---

# Video, hosted embeds and link addresses in psi-slides

Lifted out of `CLAUDE.md` so it loads when external media is the work rather than
in every session. The one rule that spans all three: **an output file is
self-contained, and each of these is a negotiated exception to that** - a clip
over `MAX_INLINE_VIDEO_BYTES` is staged beside the HTML, an `::: embed` is the
single construct that makes an output fetch from a third party at run time, and a
link is answered with an address and a QR code rather than by navigating the
projector.

## Video

A clip is a figure that moves, so it shares the `![](clip-id)` shorthand rather than getting a directive of its own: `VIDEO_EXTS` (`mp4`, `webm`, `m4v`, `mov`) are searched *after* the image extensions, so an id with both a poster and a clip still resolves to the still. The renderer emits `<figure class="figure-video"><video controls preload="metadata" playsinline>`.

Three ways to reference one:

- `![](clip-id)` – a file in `assets/`, inlined if under the cap.
- `![](path/to/clip.mp4)` or `![](https://host/clip.mp4)` – a written-out path or URL. A **remote** clip is worth more than it looks: it is still a local `<video>`, so the play/pause/seek sync works unchanged, with no iframe and no provider SDK. That is exactly what a YouTube or Vimeo embed cannot give back.
- Over the cap: **staged**. `stageVideo()` copies the file to `videos/` next to the output and emits `videos/<name>`; the build says so and says the output now needs that folder beside it. Copied, never moved, and skipped when the destination already matches by size and mtime so `--watch` does not re-copy 200 MB on every keystroke. Oversized *images* still hard-fail in `assertInlinable`, because for them there is no such fallback, only a broken figure later.

Three decisions worth keeping:

- **No new "fullscreen" syntax.** Native controls already carry a fullscreen button, and how large the clip sits on the slide is the chunk's width class, exactly like a still figure.
- **Video is deliberately *not* in `FOCUSABLE_SEL`.** Click-to-zoom would fight the native controls, which live in shadow DOM and cannot be distinguished from the element in a click handler.
- **A diagram `image` refuses a clip.** `dgResolveImage` searches the same extension order as the shorthand, so an id with only an `.mp4` behind it used to resolve – into an SVG `<image>` element, which cannot play video, so the figure built without complaint and rendered an empty box. The error names the working construct: `![](clip-id)` in the chunk body.
- **`MAX_INLINE_VIDEO_BYTES` is 12 MB**, separate from the 2 MB image cap, because a clip is inherently an order of magnitude heavier and the image cap would reject every real one. It is still a cap: base64 adds a third, and the bytes land in all four outputs, so 12 MB of source is already ~64 MB written to disk. `inlineCapFor()` picks the right one everywhere; `lint.js` mirrors both.

Play, pause and seek are **synced between the windows** (`type: 'video'`, addressed by `data-fig-id`, not by index, so reordering a chunk cannot mis-target it). Gated by the freeze flag like any other broadcast, so a lecturer can preview a clip on a frozen projection. `applyingRemoteVideo` suppresses the echo: applying a remote play fires a local `play` event that would otherwise bounce straight back.

## Hosted embeds (`::: embed <url>`)

Its own directive, never the meaning of a bare link or asset, because it is the single construct that makes an output fetch from a third party at run time. `parseEmbedUrl()` recognises YouTube and Vimeo (leniently: a bare `youtu.be/ID` or `vimeo.com/ID` is fine, which is what people paste) and normalises them to `youtube-nocookie.com/embed/…?enablejsapi=1` and `player.vimeo.com/video/…?dnt=1`; any other `https://` URL is framed as-is with no sync. `lint.js` mirrors that leniency exactly – a linter stricter than the build is worse than none.

Four behaviours worth not breaking:

- **The iframe is emitted with `data-src`, not `src`.** `updateEmbedLoading()` (called from `applyState`) sets it when the chunk becomes active and removes it on the way out. That is the privacy property – a lecture contacts a provider only for slides actually shown – and it is also the only reliable way to stop a cross-origin player when you navigate away.
- **Play/pause syncs without any SDK.** Both providers speak a `postMessage` control protocol; YouTube's is the one its own IFrame API uses, unlocked by `enablejsapi=1` plus a `listening` handshake on the `widget` channel after load. Measured: `playerState` transitions and `currentTime` stream back. Gated by the freeze flag, echo-suppressed by `applyingRemoteEmbed`.
- **Nothing autoplays.**
- **YouTube cannot work from `file://`** (origin `null`, no Referer → Error 153). `wireEmbeds()` replaces its frame with an instruction card pointing at `--serve` rather than letting the player render its own error in front of an audience. Vimeo is unaffected; `EMBED_NEEDS_ORIGIN` is the table.

The original address is always emitted as a real link under the frame: it is the fallback when the player will not run, it is what survives into a printed handout (the frame is `display: none` in `@media print`), and it gets a QR code from the existing link machinery.

## Link addresses and their QR codes

An external link puts its address on both screens with a QR code beside it, instead of opening a page on the projector. The reasoning, and the measurements behind it, are in `speaker.md`; the short version is that ~64% of realistic link targets refuse to be framed, the refusal is undetectable from script, and a page pushed to the projector is a UI the lecturer is driving blind.

**Up to 1.0.0 the only way in was `Shift`-click, and that is what changed.** A modifier nobody is told about is a feature most readers never learn exists: nothing on the slide said the address view was there, so a plain click opened the page and the lecturer discovered the overlay by accident or not at all. The renderer emits a small **mark** after every external link now – a button, not a second anchor – and clicking it takes exactly the path `Shift`-click takes. `Shift`-click is unchanged, so a deck and a lecturer that learned the old gesture keep it.

Three things about the mark are worth keeping. It is a `<button>`, so it announces itself (`aria-label`) and takes focus – but **a focusable button is not yet a usable one here**, and that gap was real: the deck's key map binds bare letters and `Space`, so `Space` on the focused mark advanced the slide and the address never appeared. The map stands back for that one button, narrowly on purpose – standing back for every button would take `Space` away from a lecturer who had just clicked the freeze control. The other half is that a *pointer* activation blurs the mark (`e.detail > 0`), because Chrome leaves a clicked button focused and the guard would otherwise hand it the lecturer's next `Space`. Verified in a browser in all four directions: `Enter` and `Space` on the focused mark open the address and leave the slide where it is, `Space` with nothing focused still advances, and `Space` after a mouse click advances again. It is emitted **only for `https?://` links**, because a cross-reference within the deck has no address anyone needs to type. And it is hidden in print (`PRINT_CSS`), where there is nothing to click – note that the printed document then shows **no** address at all for a link, which is a real gap and not a decision this feature made.

`style: {link-codes: off}` takes the marks away for a deck that would rather keep its links bare; `on` is the default, so a source that says nothing gets them. The key emits `data-link-codes="off"` **only when off**, which is what keeps every existing deck's markup byte-identical. `lint.js` mirrors the enum in `STYLE_ENUMS`, same contract as `VALID_TAGS`.

QR codes are generated **at build time** by `qrSvg()` and shipped as a `LINK_QR` map keyed by URL, so there is no encoder in the browser and a lecture without links pays nothing. Three things worth keeping:

- The encoder is a dependency (`qrcode-generator`, MIT, zero deps of its own), not hand-rolled Reed-Solomon. An error in that maths yields codes that scan to the *wrong string* and look perfectly correct. Verify changes by decoding, not by looking – `BarcodeDetector` in Chrome does it in a few lines.
- The map is keyed by the **decoded** URL (`&amp;` → `&`), because that is what `a.href` hands the runtime.
- The code keeps a white ground on every theme. Scanners cope badly with inverted codes, and the white card doubles as the quiet zone.

