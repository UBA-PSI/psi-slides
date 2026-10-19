
const STORAGE_PREFIX = 'psi-slides:';
const storageKey = (s) => STORAGE_PREFIX + LECTURE_TITLE + ':' + s;

// The audience runtime is shared with the speaker view. The HTML sets
// body[data-view] to "audience" or "speaker"; runtime branches on it.
// Speaker-only behavior hangs off the viewHooks object defined below
// and is overridden in the speaker-specific runtime.
const VIEW = document.body.dataset.view || 'audience';
const viewHooks = {
  onN: (entry) => startAnnotate(entry.id),
  onActiveChange: () => {},
  onStateChange: () => {},
  shouldBroadcast: () => true,
  // A frozen cockpit is the lecturer's private look-ahead: the slide it shows
  // is not the room's. While this says so, incoming snapshots and pans do not
  // move it (only the blank and the projection's size are taken), it stores
  // no position a reloaded projection would boot onto, and it sends no laser
  // pointer. The audience is never looking ahead.
  lookingAhead: () => false,
  // The cockpit's cue cards sit in front of the reveal counter: a forward
  // press is consumed by a card before it reaches advanceReveal, and a back
  // press by the card before it. Both default to "not consumed", so the
  // audience never sees them. They are hooks on goForward and goBack
  // rather than cases in the key map so that a key, the touch rail and a
  // presenter's button all go through one cursor - a second path is how
  // a click comes to count differently from a key.
  consumeForward: () => false,
  consumeBack: () => false,
  // A forward or back press, called first of all in goForward and goBack -
  // ahead of the cue cards, and whether or not it moves anything. The
  // cockpit starts its clock on the first one; the projection tells the
  // cockpit, because a clicker may be aimed at this window. An autoplay
  // figure steps through advanceReveal and never comes here. remote is true
  // for a press reported by the other window.
  onPress: (remote) => { if (!remote) sendToPeer({ type: 'press', source: VIEW }); },
  onEnter: () => false,
  // The prompter's step in the Esc chain: its history panel if that is
  // open, otherwise the hint standing on the strip. Returns whether it took
  // something back, so the chain carries on when it did not.
  escapePrompter: () => false,
  // The answer to hasLivePeer() changed: a window appeared, answered again,
  // said goodbye or was closed. The cockpit's footer says which.
  onPeerChange: (live) => {},
  // A projection has just booted in a window the cockpit opened, or come
  // back from a reload (greeted: it has already adopted this window). Only
  // the cockpit answers.
  onPeerBoot: (greeted) => {},
};

const stage = document.getElementById('psiINT-stage');
const viewport = document.getElementById('psiINT-stage-viewport');
const modeBadge = document.getElementById('psiINT-mode-badge');

// The camera is the only thing allowed to decide what is on screen, and it
// positions the deck with a transform on #psiINT-stage. But #psiINT-stage-viewport is a
// scroll container, and overflow: hidden does not make a box unscrollable -
// it only hides the scrollbars. The browser still scrolls it to reveal
// things, and then every chunk sits translated by an offset the camera math
// knows nothing about.
//
// Measured: opening audience.html#why-playwright left the viewport at
// scrollLeft 3111, scrollTop 2121, which put the addressed chunk entirely
// outside the window - a deep link into a lecture projected a blank screen.
// Fragment navigation is the obvious way in, but not the only one: focusing
// any control inside an off-centre chunk (an annotation textarea) or
// find-in-page does the same thing.
//
// Cheaper and more robust than intercepting each of those: let the scroll
// happen and undo it. Nothing in either view scrolls this element on
// purpose - the preview strip and the search results have their own
// containers - so a hard reset here cannot fight a legitimate scroll.
//
// Both the listener and the call in focusCamera are load-bearing. The
// listener catches scrolls that no camera solve follows; the call covers
// the boot fragment, which the browser may act on before this module has
// run and attached anything.
function resetViewportScroll() {
  if (viewport.scrollLeft) viewport.scrollLeft = 0;
  if (viewport.scrollTop) viewport.scrollTop = 0;
}
viewport.addEventListener('scroll', resetViewportScroll);

// What a click can zoom into, and the ordering the speaker-sync protocol
// addresses by index. This must be one constant: the audience and the
// speaker resolve figureIdx against their own DOM, so the two windows
// would focus different elements the moment the selectors disagreed.
// Display math is in the list because a formula on a projector is exactly
// the thing a room asks to see bigger.
const FOCUSABLE_SEL = 'figure.figure-img, figure.figure-diagram, .chunk-body pre, .chunk-body .math-display, .marginalia';
// Everything that is held to a beat by from N. One string, or the three
// walks below (chunkBeats, countSegments, applyReveal) disagree about what
// arrives when. A dock with from is, for the counter, an overlay card.
// Everything held to a beat by a written from-number. A reveal segment joins
// the two containers because a marker inside a pinned segment has to count
// from the segment's own beat: numbered positionally it un-hid on beat 1
// inside a segment that does not arrive until beat 3, and then both halves
// appeared together on 3, losing the stagger the author wrote.
const FROM_SEL = '.overlay-card[data-from], .dock[data-from], .reveal-segment[data-from]';

// ── Slide-size sync ─────────────────────────────────────────────────
// --slide-w / --slide-h hold the AUDIENCE window's pixel dimensions so
// that every slide-internal size (font, padding, chunk gap, etc.) is
// computed against the same reference on both sides. Audience fills
// its window 1:1; speaker renders the full audience-size slide and
// then CSS-transforms it down into its physical cell, preserving
// wrap, font-size, and laser-pointer coords exactly.
//
// Audience source of truth: window.innerWidth / window.innerHeight,
// refreshed on resize. Speaker: last-received audienceW/H from the
// state snapshot. Until a snapshot arrives, speaker falls back to
// window dims (best guess at projector shape).
function setSlideRef(w, h) {
  if (!(w > 0 && h > 0)) return;
  const root = document.documentElement.style;
  root.setProperty('--slide-w', w + 'px');
  root.setProperty('--slide-h', h + 'px');
  root.setProperty('--audience-aspect', String(w / h));
  if (VIEW === 'speaker' && typeof sizeStageViewport === 'function') {
    sizeStageViewport();
  }
  if (typeof focusCamera === 'function') focusCamera(true);
}
// Layout-space viewport size (untouched by --stage-scale transforms).
// getBoundingClientRect() returns visual pixels, which in speaker are
// scaled down; camera math lives in unscaled coords, so we use
// offsetWidth / offsetHeight instead wherever the math needs to match
// chunk.offsetLeft / offsetWidth.
function vpLayout() {
  return { width: viewport.offsetWidth, height: viewport.offsetHeight };
}
// Initial CSS-var write at module-load time – we can't call setSlideRef
// here yet because it calls focusCamera, and focusCamera reads the
// 'overview' let declared further down (TDZ). So set the raw vars
// directly, then register handlers that will use the full setSlideRef
// once the rest of the module (state, overview, etc.) has initialised.
(function primeSlideVars() {
  const w = window.innerWidth, h = window.innerHeight;
  const root = document.documentElement.style;
  root.setProperty('--slide-w', w + 'px');
  root.setProperty('--slide-h', h + 'px');
  root.setProperty('--audience-aspect', String(w / h));
})();
if (VIEW === 'audience') {
  // The new dimensions also have to reach the speaker, and they get their own
  // message rather than riding the state snapshot. A snapshot is a full state
  // apply: sending one here would drag the speaker back to whatever slide the
  // audience is showing, undoing a look-ahead every time the projector
  // renegotiates its resolution. The aspect is the only field that has to
  // travel, so it travels alone. Debounced because resize fires at ~60 Hz.
  let refTimer = null;
  window.addEventListener('resize', () => {
    setSlideRef(window.innerWidth, window.innerHeight);
    clearTimeout(refTimer);
    refTimer = setTimeout(() => {
      sendToPeer({ type: 'slide-ref', source: 'audience', w: window.innerWidth, h: window.innerHeight });
    }, 120);
  });
}
// Speaker's initial slide reference stays as this window's dimensions
// until the first audience state snapshot arrives via applyRemoteState,
// which calls setSlideRef directly. No immediate call needed.

// Flat list of all chunk elements with column index, preserving source order.
const flatChunks = [];
document.querySelectorAll('.column').forEach((col, ci) => {
  col.querySelectorAll('.chunk').forEach((el) => {
    flatChunks.push({ colIdx: ci, el, id: el.dataset.chunkId });
  });
});

// Auto-fit has three states and the # key walks them in this order:
//
//   off     – the lecturer's zoom on every slide, whatever it costs.
//   shrink  – fit, ceilinged at the lecturer's own zoom. Only ever smaller.
//   full    – fit, ceilinged at the global maximum. Grows a short slide too.
//
// Filled in by the build from build.js's tables so the cycle and the
// frontmatter vocabulary have one source. Declared above state, because state's initialiser calls
// normAutoFit and a const read before its own line is a TDZ error, not a
// fallback.
const AUTO_FIT_CYCLE = __PSI_AUTO_FIT_CYCLE__;
// What a value that came from somewhere else means here. Three somewheres:
// this build's own VIEW_DEFAULTS (already one of the three words), a peer
// window running a build that predates the third mode (a boolean, which is
// what the field was), and a payload from anywhere at all (nonsense, which
// must land on a mode rather than on undefined). The boolean case is the
// load-bearing one: audience.html and speaker.html are separate files and
// --audience-only rebuilds exactly one of them.
function normAutoFit(v) {
  if (v === true) return 'full';
  if (v === false || v == null) return 'off';
  return AUTO_FIT_CYCLE.includes(v) ? v : 'off';
}
// Is the camera solving the zoom at all? Never write state.autoFitMode into
// an if: every one of the three words is a truthy string.
function autoFitOn() { return state.autoFitMode !== 'off'; }
// The largest zoom the fit may reach. In full mode the global maximum,
// because there the point is that every slide is sized to the screen. In
// shrink mode the lecturer's own zoom, which is the whole of the difference
// between the two: a fit that cannot go above where the zoom already is can
// only ever take size away, and a slide that already fits is left alone.
function autoFitCeiling() { return state.autoFitMode === 'shrink' ? collapsedZoom : 2.2; }
// The fit with no else-branch beside it, for the one caller that has none.
function autoFitNow() { if (autoFitOn()) fitZoomToChunk(autoFitCeiling()); }

// VIEW_DEFAULTS holds only the keys the author pinned in the frontmatter;
// everything absent from it falls back to the built-in default here and, for
// the three global preferences, to whatever the reader last chose.
const state = {
  activeIdx: 0,
  collapse: VIEW_DEFAULTS.collapse || 'topic-bold',
  zoom: 1.35,
  // # – off | full | shrink. See AUTO_FIT_CYCLE above; never a boolean here,
  // because three states do not fit in one, and never read for truthiness,
  // because 'off' is a truthy string. autoFitOn() is the test.
  autoFitMode: normAutoFit(VIEW_DEFAULTS.autoFit),
  blanked: false,
  font: VIEW_DEFAULTS.font || 'serif',           // serif | sans | mono (readable)
  theme: VIEW_DEFAULTS.theme || 'light-red',     // light-{red,teal,blue,orange} | terminal-{amber,green}
  slideNums: VIEW_DEFAULTS.slideNums || __PSI_SLIDE_NUM_DEFAULT__,  // vertical | horizontal | off – L cycles
  noteButton: VIEW_DEFAULTS.noteButton || 'on',  // on | off – M toggles
  pitchblack: VIEW_DEFAULTS.pitchblack || 'off', // on | off – the palette's pitchblack command toggles, no key
};
// pan | cut | fade. Not a field of state: it is the author's decision about
// what a slide change looks like, there is no key that cycles it, and the
// snapshot is a full apply - a mode in it would be one more thing two
// windows could disagree about for no gain. Both views read the same
// frontmatter, so both answer the same word.
const SLIDE_TRANSITION = VIEW_DEFAULTS.transition || 'pan';
// The whole of a fade, half of it going and half coming back. 260ms is the
// backdrop's number, kept deliberately: a fade and a backdrop crossfade are
// the same gesture at different scales, and a deck that has both should not
// have two speeds in it.
const FADE_MS = 260;
const FONT_CYCLE = ['serif', 'sans', 'mono'];
const SLIDE_NUM_MODES = __PSI_SLIDE_NUM_MODES__;
const THEME_CYCLE = __PSI_THEME_NAMES__;
const DARK_THEMES = __PSI_DARK_THEME_NAMES__;
let openExp = null;            // { chunkIdx, expIdx } | null
let annotEditingId = null;
let annotations = {};          // chunkId -> text
const revealed = {};           // chunkId -> count of visible segments

// overview / TOC / search (PRD §5)
//
// Two independent indices, deliberately: overviewAnchorIdx is the *only*
// thing the overview camera is centred on, selectedIdx is only the
// outline. Coupling them (the original design) forces every click to
// move the stage, which makes click-to-select feel like the view runs
// away from you. Keeping them apart means the framing is a pure function
// of (anchor, scale, pan) – all three travel in the sync payload, so the
// two views land on identical pixels.
let overview = false;
let overviewScale = 0.28;
const OVERVIEW_MIN_SCALE = 0.08;
const OVERVIEW_MAX_SCALE = 1;
let selectedIdx = 0;           // overview selection outline (independent of activeIdx)
let overviewAnchorIdx = 0;     // chunk the overview camera is centred on
let manualPan = { dx: 0, dy: 0 };
// The aside that has been brought into the frame: { chunkId, el }, or null.
// Deliberately not manualPan, which is where this used to live. manualPan is
// the drag offset - a free-hand nudge the camera keeps until something
// clears it - so a marginalia written into it survived a resize as a stale
// number of pixels, could not be told apart from a drag by anything that
// reads it, and had to be recomputed by hand every time the layout moved. A
// panned aside is a *state* the camera solves for, exactly the way
// annotEditingId is: focusCamera reads it and derives the offset from where
// the aside is now. See the branch there.
let asidePan = null;
let searchActive = false;
let tocVisible = false;

// Replace obj's contents in-place so existing references (closures,
// readers holding &obj) see the update. Used from applyRemoteState
// where several module-level maps are live-synced.
function replaceContents(obj, src) {
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, src || {});
}

// One-shot rename of any leftover 'psi-lecdoc:*' localStorage keys to
// 'psi-slides:*'. Covers font, theme, preview-orientation, annotations,
// and activeIdx. Runs before loadPersisted so the subsequent reads find
// the migrated values. Safe to remove once no field instances are
// expected to have the old prefix.
(function migrateLegacyStorage() {
  try {
    const OLD = 'psi-lecdoc:';
    const NEW = 'psi-slides:';
    const toMove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OLD)) toMove.push(k);
    }
    for (const k of toMove) {
      const newKey = NEW + k.slice(OLD.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(k));
      }
      localStorage.removeItem(k);
    }
  } catch (e) {}
})();

function loadPersisted() {
  try {
    const raw = localStorage.getItem(storageKey('annotations'));
    if (raw) annotations = JSON.parse(raw) || {};
  } catch (e) {}
  // The chunk id first, the index where the id is gone (or was never
  // written, by a build before it). An index alone put a reopened deck on
  // the neighbour of its slide as soon as a chunk was added above it.
  try {
    const pos = localStorage.getItem(storageKey('activeIdx'));
    if (pos !== null) state.activeIdx = Math.max(0, Math.min(flatChunks.length - 1, parseInt(pos, 10) || 0));
    const at = chunkIdxOf(localStorage.getItem(storageKey('activeId')));
    if (at >= 0) state.activeIdx = at;
  } catch (e) {}
  // Font, theme and slide numbers are global (not per-lecture): shared
  // across all lectures so the reading preference follows the user, not the
  // source file. Unless this lecture pinned the key in its frontmatter, in
  // which case the author's choice is the point and the stored preference
  // stays out of the way.
  try {
    const f = localStorage.getItem('psi-slides:font');
    if (!VIEW_DEFAULTS.font && f && FONT_CYCLE.includes(f)) state.font = f;
  } catch (e) {}
  // Theme is resolved before first paint by the boot script at the top of
  // <body> – stored preference, else the operating system's. Read its answer
  // back rather than duplicating that precedence here and risking the two
  // disagreeing. When the frontmatter pinned the theme no script was emitted
  // and the attribute already carries the author's choice.
  if (!VIEW_DEFAULTS.theme) {
    const booted = document.body.dataset.theme;
    if (booted && THEME_CYCLE.includes(booted)) state.theme = booted;
  }
  try {
    const n = localStorage.getItem('psi-slides:slide-nums');
    if (!VIEW_DEFAULTS.slideNums && n && SLIDE_NUM_MODES.includes(n)) state.slideNums = n;
  } catch (e) {}
  // The note button is a reading preference like the three above and is
  // stored the same way: globally, not per lecture, and only where the
  // frontmatter left the question open. A lecturer who hides it once has
  // hidden it for the next deck too, which is the point of turning it off.
  try {
    const nb = localStorage.getItem('psi-slides:note-button');
    if (!VIEW_DEFAULTS.noteButton && (nb === 'on' || nb === 'off')) state.noteButton = nb;
  } catch (e) {}
  // Pitch black is settled before first paint by the same boot script as the
  // theme, from the reader's stored choice, and read back here the same way:
  // one place knows the precedence. Pinned in the frontmatter, the attribute
  // carries the author's word (or its absence, which is off).
  if (!VIEW_DEFAULTS.pitchblack && document.body.dataset.pitchblack === 'on') state.pitchblack = 'on';
}
function saveAnnotations() {
  try { localStorage.setItem(storageKey('annotations'), JSON.stringify(annotations)); } catch (e) {}
}
function saveActive() {
  // One key for both windows, so a cockpit looking ahead must not write it:
  // a projection reloaded under a freeze read the cockpit's look-ahead and
  // put it on the wall. Thawing stores the position the room then gets.
  if (viewHooks.lookingAhead()) return;
  try {
    localStorage.setItem(storageKey('activeIdx'), String(state.activeIdx));
    const entry = flatChunks[state.activeIdx];
    if (entry && entry.id) localStorage.setItem(storageKey('activeId'), entry.id);
  } catch (e) {}
}
// The index of the chunk with this id, or -1. Positions that outlive one
// build - a stored one, the other window's, one kept across a watch reload -
// are named by id, because an index moves whenever a chunk is added above.
function chunkIdxOf(id) {
  if (typeof id !== 'string' || !id) return -1;
  return flatChunks.findIndex(c => c.id === id);
}
// Where a payload from the other window says the room is: by its chunk id
// when this window has that chunk, else by index. The two windows reload
// one after the other on a --watch save, so for a moment one of them holds
// the old build: its indices are the old deck's, its ids are still right.
// An older peer sends no id and is read by index, as before.
function remoteActiveIdx(payload) {
  const at = chunkIdxOf(payload.activeId);
  if (at >= 0) return at;
  return Math.max(0, Math.min(flatChunks.length - 1, payload.activeIdx || 0));
}
function applyFontTheme() {
  document.body.dataset.font = state.font;
  document.body.dataset.theme = state.theme;
  // Chrome around the slide keys off this rather than off each theme name,
  // so a new dark theme needs no new selectors.
  document.body.dataset.mode = DARK_THEMES.includes(state.theme) ? 'dark' : 'light';
  document.body.dataset.slideNums = state.slideNums;
  document.body.dataset.noteButton = state.noteButton;
  document.body.dataset.pitchblack = state.pitchblack;
}
// The add-note button on the projection. Its own function rather than a
// field of the snapshot, and its own message type, for the reason blank has
// one: applyRemoteState is a full apply, so a snapshot sent to say "the
// button is hidden" would drag the receiver's slide position with it. And it
// has to travel at all because the button only exists in the audience window
// while the lecturer's keyboard is in the cockpit - pressing M in the
// cockpit and watching nothing happen anywhere would be the whole feature
// missing. Past the freeze gate for the same reason blank is: it is a
// command aimed at the projector, not shared navigation state.
function setNoteButton(mode, announce) {
  state.noteButton = mode === 'off' ? 'off' : 'on';
  applyFontTheme();
  try { localStorage.setItem('psi-slides:note-button', state.noteButton); } catch (e) {}
  if (announce) {
    sendToPeer({ type: 'note-button', source: VIEW, mode: state.noteButton });
    flashMode(state.noteButton === 'off' ? 'note button hidden' : 'note button shown');
  }
}
// Every dark theme on a true black ground, or back on its own paper. The
// state is one word beside the theme and travels the way the theme does - a
// field of the snapshot, stored globally, pinned by the frontmatter - because
// it is the same kind of thing: a reading preference both windows have to
// agree on. It has no key (commands.mjs, keys: []): the palette runs it.
// Under a light theme nothing on the slide moves, so the toast says where it
// will show; the switch is set all the same and A finds it there.
function togglePitchblack() {
  state.pitchblack = state.pitchblack === 'on' ? 'off' : 'on';
  applyFontTheme();
  try { localStorage.setItem('psi-slides:pitchblack', state.pitchblack); } catch (e) {}
  flashMode('pitch black · ' + state.pitchblack
    + (state.pitchblack === 'on' && !DARK_THEMES.includes(state.theme) ? ' · shows under a dark theme' : ''));
  broadcastState();
}
function cycleSlideNums(dir) {
  const i = SLIDE_NUM_MODES.indexOf(state.slideNums);
  const next = SLIDE_NUM_MODES[(i + (dir || 1) + SLIDE_NUM_MODES.length) % SLIDE_NUM_MODES.length];
  state.slideNums = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:slide-nums', next); } catch (e) {}
  flashMode('slide numbers · ' + next);
  broadcastState();
}
function cycleFont(dir) {
  const i = FONT_CYCLE.indexOf(state.font);
  const next = FONT_CYCLE[(i + (dir || 1) + FONT_CYCLE.length) % FONT_CYCLE.length];
  state.font = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:font', next); } catch (e) {}
  flashMode('font · ' + next);
  broadcastState();
}
function cycleTheme(dir) {
  const i = THEME_CYCLE.indexOf(state.theme);
  const next = THEME_CYCLE[(i + (dir || 1) + THEME_CYCLE.length) % THEME_CYCLE.length];
  state.theme = next;
  applyFontTheme();
  try { localStorage.setItem('psi-slides:theme', next); } catch (e) {}
  flashMode('theme · ' + next);
  broadcastState();
}

// ── window.postMessage sync (PRD §7 / speaker.md §3) ────────────────
// The audience spawns the speaker via S (window.open), which gives
// each window a reference to the other (return value of window.open
// for the audience, window.opener for the speaker). postMessage on
// these references is cross-origin by design, so this works even
// between two file:// pages where BroadcastChannel does not.
//
// Messages are always full state snapshots, never diffs. The peer
// is adopted from an inbound message whose sender is the other view
// (isPeerWindow), so an audience reload while the speaker is alive
// recovers the link as soon as the speaker next pushes.
let peer = null;
let isApplyingRemote = false;
// Our own origin as postMessage reports it. On file:// that is the string
// "null" for both sides, which is why location.origin ("file://") is the
// wrong thing to compare against.
const SELF_ORIGIN = (typeof window.origin === 'string') ? window.origin : location.origin;
// Which deck this window belongs to: the folder it was loaded from, hashed,
// because the two views of one deck are always side by side and two decks
// never share a folder. Every message carries it and a message from another
// deck is dropped, which the opener relationship alone cannot do - a tab
// that went from one deck's projection to another's is still the opener of
// the first deck's cockpit, and that cockpit and the new projection used to
// drive each other. The folder rather than the title, which two decks can
// share; hashed, so the path on disk is not what travels.
const DECK_ID = (() => {
  const s = new URL('.', location.href).href;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
})();
function setPeer(w) {
  if (w && w !== window && !w.closed) peer = w;
}
// Is this sender the other live view? The origin alone cannot say: on
// file:// it is the string "null" for both views, and for every sandboxed
// frame as well - one inside an embedded player, one a player's own page
// makes - and a frame posting "null" used to be adopted as the peer and
// obeyed, down to a diagram-edit that put its own markup on the projection.
// So a sender is accepted by who it is, never by where it says it is from.
// Three windows qualify, and only top-level ones can: the peer we already
// hold; our opener, which is how a cockpit knows its projection; and a
// window whose opener we are, which is how the projection knows the cockpit
// it opened with S - still true after the projection reloads, because the
// cockpit's opener is this browsing context and not this document, which is
// what lets a reloaded projection take the cockpit's next push. A frame has
// no opener that is us, and a popup a frame opens has the frame for one.
function isPeerWindow(w) {
  if (!w || w === window) return false;
  if (w === peer || w === window.opener) return true;
  try { return w.opener === window; } catch (e) { return false; }
}
function sendToPeer(msg) {
  if (!peer || peer.closed) { peer = null; return; }
  try { peer.postMessage(Object.assign({ deck: DECK_ID }, msg), '*'); } catch (e) { peer = null; }
}
// The peer said goodbye: its page went away (pagehide), which is a reload, a
// navigation or a window closing. The handle is kept - a reload keeps the
// window, and the next document in it is reached through the same handle -
// but nothing counts it as there until it speaks again. A closed window
// says so through .closed as well; the goodbye is for the other two, where
// .closed stays false and the cockpit used to say "live" to a window that
// showed another page. Cleared by any message from the peer.
let peerGone = false;
// Is the other window actually there? Drives the decisions that differ
// between "running alone" and "driving a projector": where a mode toast
// lands, whether the blank badge is drawn on the projection itself, and
// what the cockpit's footer says.
function hasLivePeer() {
  if (peer && peer.closed) { peer = null; peerGone = false; }
  return !!peer && !peerGone;
}
// While the peer is gone but its window is still there, it is asked once a
// second whether a page of this deck stands in it again. A reloaded window
// answers (a ping is a message from a window it accepts, so it adopts the
// sender and greets); a window that went to another page never does, and
// after PEER_PING_MAX tries the asking stops - the next press still pushes
// through the handle. The same tick notices a window that was closed, which
// sends no goodbye a closed window can be relied on for, and tells the view
// when the answer to hasLivePeer() changed (viewHooks.onPeerChange).
const PEER_PING_MAX = 120;
let peerPings = 0;
let peerSeen = false;
function notePeer() {
  const live = hasLivePeer();
  if (live !== peerSeen) {
    peerSeen = live;
    if (live && VIEW === 'audience') {
      try { sessionStorage.setItem(PAIRED_KEY, '1'); } catch (e) {}
    }
    viewHooks.onPeerChange(live);
    if (window.psiBuildBannerRefresh) window.psiBuildBannerRefresh();
  }
}
// Whether --watch's failed-build banner (reloadScript) may stand in this
// window: always in the cockpit, in the projection only while no cockpit
// answers - with one attached, the projection is on a wall and the
// lecturer reads it in the cockpit.
window.psiBuildBannerHere = () => VIEW !== 'audience' || !hasLivePeer();
// This tab's projection has had a cockpit of this deck - kept across a
// reload, and not copied into a tab opened by hand. A projection that had one
// finds it again by its window name (openViewWindow), so the heartbeat check
// in cockpitElsewhere is only for a projection that never had one.
const PAIRED_KEY = 'psi-slides:paired:' + DECK_ID;
function pairedBefore() {
  try { return sessionStorage.getItem(PAIRED_KEY) === '1'; } catch (e) { return false; }
}
function peerTick() {
  if (peer && peerGone && !peer.closed && peerPings < PEER_PING_MAX) {
    peerPings++;
    sendToPeer({ type: 'ping', source: VIEW });
  }
  notePeer();
}
setInterval(peerTick, 1000);
// The goodbye has to be the last thing the peer hears from this page, or a
// message sent after it (the live demo's stop, also on pagehide) clears it
// again. Listeners run in the order they were added, so it is added once
// every script has run.
window.addEventListener('load', () => {
  window.addEventListener('pagehide', () => { sendToPeer({ type: 'bye', source: VIEW }); });
});
// Audience broadcasts unconditionally; speaker overrides
// viewHooks.shouldBroadcast to gate on its push toggle.
function shouldBroadcast() {
  if (isApplyingRemote) return false;
  return viewHooks.shouldBroadcast();
}
function snapshot() {
  return {
    activeIdx: state.activeIdx,
    // The same position by name; see remoteActiveIdx.
    activeId: (flatChunks[state.activeIdx] || {}).id || null,
    revealed: Object.assign({}, revealed),
    collapse: state.collapse,
    // Two fields for one setting, and the second is the compatibility one.
    // A peer built before the third mode reads autoFit and coerces it with
    // !!, so it has to keep receiving a boolean or 'off' would switch it
    // on. autoFitMode carries the whole answer for a peer that knows about
    // it; shrink degrades to full on an old peer, which is the safe way
    // round - the other would be a projection that runs off the screen.
    autoFit: autoFitOn(),
    autoFitMode: state.autoFitMode,
    // The zoom that travels is the one the lecturer chose, not the one this
    // window happens to be showing. A chunk whose code would be cut off is
    // shrunk locally, and the two windows are different sizes, so each
    // derives that for itself – sending the shrunk value would let one wide
    // slide quietly lower the setting in the other window, and then in this
    // one on the way back. zoomBase() is that value by definition – it is
    // what + and – step from, for the same reason.
    zoom: zoomBase(),
    blanked: state.blanked,
    font: state.font,
    theme: state.theme,
    slideNums: state.slideNums,
    // A peer built before the switch ignores the field, and one that sends
    // none leaves this window's own answer alone (applyRemoteState).
    pitchblack: state.pitchblack,
    // Inner window dimensions travel with every snapshot so the speaker
    // can match its preview's aspect ratio to the actual projector
    // window. Without this, laser-pointer coordinates (fractions of the
    // active chunk's bounding box) would land at the wrong pixel, and
    // content layout could differ (text wrap, code-block width, etc.).
    // Audience is the source of truth; speaker-side value is ignored.
    audienceW: window.innerWidth,
    audienceH: window.innerHeight,
    annotations: Object.assign({}, annotations),
    // Editing-id travels so the non-editing peer can pan its camera and
    // raise its .annot-box to full opacity while the lecturer types –
    // otherwise the audience view keeps the box at rest-state opacity
    // and doesn't shift the stage, so viewers can't read what's being
    // written. Cleared on blur, which also signals the pan-reset.
    annotEditingId: annotEditingId,
    openExp: openExp ? { chunkIdx: openExp.chunkIdx, expIdx: openExp.expIdx } : null,
    // Camera framing so the peer mirrors the exact viewport, not just which
    // slide is active: the manual drag-pan offset (layout-space dx/dy, shared
    // directly since both views do camera math in layout space and share the
    // audience aspect above), plus overview scale and the framed chunk.
    panDx: manualPan.dx,
    panDy: manualPan.dy,
    // Overview travels in the snapshot rather than in a side-channel
    // message. It used to be its own postMessage type handled only on the
    // audience side, which meant audience→speaker never synced and the
    // speaker could sit in normal-camera mode while adopting the
    // audience's overview drag-pan – driving its stage off screen.
    overview: overview,
    overviewScale: overviewScale,
    overviewAnchorIdx: overviewAnchorIdx,
    selectedIdx: selectedIdx,
  };
}
function broadcastState() {
  if (!shouldBroadcast()) return;
  sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
}
// Camera pan travels as a lightweight message during a drag (rAF-throttled)
// so the peer follows smoothly without re-running the full-snapshot apply
// 60×/second. The same fields also ride every state snapshot (above) so a
// navigation or a freshly (re)connected peer still lands on the right pan.
function broadcastPan() {
  if (!shouldBroadcast()) return;
  sendToPeer({
    type: 'pan', source: VIEW,
    dx: manualPan.dx, dy: manualPan.dy,
    overviewScale, overviewAnchorIdx, selectedIdx,
  });
}
let panBroadcastScheduled = false;
function schedulePanBroadcast() {
  if (panBroadcastScheduled) return;
  panBroadcastScheduled = true;
  requestAnimationFrame(() => { panBroadcastScheduled = false; broadcastPan(); });
}
// Apply a peer's camera framing (from a 'pan' message or a state snapshot).
// Clamped to the same range the local wheel handler enforces, so a peer
// running an older build can't push us to an unreachable scale.
function applyRemoteCamera(dx, dy, ovScale, selIdx, anchorIdx) {
  manualPan.dx = dx || 0;
  manualPan.dy = dy || 0;
  if (typeof ovScale === 'number' && ovScale > 0) {
    overviewScale = Math.max(OVERVIEW_MIN_SCALE, Math.min(OVERVIEW_MAX_SCALE, ovScale));
  }
  const inRange = (n) => typeof n === 'number' && n >= 0 && n < flatChunks.length;
  if (inRange(selIdx)) {
    selectedIdx = selIdx;
    // Only paint the outline while the mode is actually on: the snapshot
    // keeps carrying selectedIdx after an exit, and re-adding the class
    // here would undo the teardown setOverviewMode just did.
    if (overview) {
      flatChunks.forEach((c, i) => c.el.classList.toggle('overview-selected', i === selIdx));
    }
  }
  if (inRange(anchorIdx)) overviewAnchorIdx = anchorIdx;
}
// What a frozen cockpit takes from a projection snapshot: the facts about the
// room rather than about the deck. See the 'state' branch of the listener.
function applyFrozenState(payload) {
  if (!payload) return;
  state.blanked = !!payload.blanked;
  document.body.classList.toggle('blanked', state.blanked);
  applyBlankBadge();
  if (VIEW === 'speaker' && payload.audienceW > 0 && payload.audienceH > 0) {
    setSlideRef(payload.audienceW, payload.audienceH);
  }
}
function applyRemoteState(payload, handover) {
  // A remote apply that changes which chunk is live is a slide change and
  // wears the deck's transition, exactly as a local one does. The whole
  // apply goes inside the fade rather than only the camera, because it is
  // a *full* apply: the reveals, the zoom and the collapse all land with
  // the slide, and letting them land before the dip would show the old
  // slide re-dressing itself on its way out.
  //
  // Each window runs its own dip when it learns of the change, so the two
  // are half a fade out of step - the cockpit dips on the press, the
  // projection on the message that follows the cockpit's swap. 130ms, on a
  // pair of screens nobody sees at once, was judged cheaper than teaching
  // the snapshot to carry a phase.
  settleFade();
  const changed = remoteActiveIdx(payload) !== state.activeIdx;
  if (changed) landSlide(() => applyRemoteStateNow(payload, true));
  else {
    // A snapshot on the slide already up can be the other window's hand on
    // it - a press, a zoom, a collapse - and that is a take-over of an
    // autoplay figure, exactly as a key on this window's own keyboard is.
    // It used to be taken for one whatever it said, and not every snapshot
    // is a hand: a cockpit hands its slide to a projection back from a
    // reload (handover, viewHooks.onPeerBoot), and anything that broadcasts
    // without changing the slide sends the slide as it already is. Each of
    // those stopped a break slide's loop that nobody had touched, so the
    // test is now what the snapshot changes (remoteTakesOver). The cockpit
    // never rebroadcasts what it received, so the projection's own ticks do
    // not come back here.
    const cur = flatChunks[state.activeIdx];
    if (cur && autoplayTimer && !handover && remoteTakesOver(payload, cur)) {
      autoplayStoppedOn = cur.id;
      stopAutoplay();
    }
    applyRemoteStateNow(payload, false);
  }
  if (typeof payload.zoom === 'number') lastPeerZoom = payload.zoom;
}
// Whether a snapshot on the slide already up changes anything a hand would:
// this slide's beat, or one of the settings a key in the other window moves.
// Compared with what this window shows, because after a full apply the two
// agree, so a snapshot that repeats the slide is not a change - except the
// zoom, which each window fits for itself under auto-fit and so is compared
// with what the other window sent last. A beat the payload does not name is
// the opening one, as it is everywhere else the counter is read.
let lastPeerZoom = null;
const TAKE_OVER_FIELDS = ['collapse', 'autoFitMode', 'blanked', 'font', 'theme', 'slideNums',
  'pitchblack', 'overview', 'openExp', 'annotEditingId', 'panDx', 'panDy'];
function remoteTakesOver(payload, cur) {
  const opening = countSegments(cur.el) ? 1 : 0;
  const beat = (m) => (m && m[cur.id] != null ? m[cur.id] : opening);
  if (payload.revealed && beat(payload.revealed) !== beat(revealed)) return true;
  const here = snapshot();
  for (const k of TAKE_OVER_FIELDS) {
    if (payload[k] === undefined) continue;
    if (JSON.stringify(payload[k]) !== JSON.stringify(here[k])) return true;
  }
  return typeof payload.zoom === 'number' && lastPeerZoom !== null && payload.zoom !== lastPeerZoom;
}
function applyRemoteStateNow(payload, changed) {
  // The cockpit moving the projection is a move: it ends the start menu
  // as a press here would. Read before the apply, on the slide that was up.
  const was = flatChunks[state.activeIdx];
  if (changed || (was && payload.revealed && (payload.revealed[was.id] ?? null) !== (revealed[was.id] ?? null))) endStartMenu();
  isApplyingRemote = true;
  try {
    // Only a slide change takes a focused figure down. A snapshot is also how
    // a knob arrives - a zoom, a theme, a reveal - and closing the card on
    // every one of them closed it on the projection alone while the cockpit
    // kept it open and went on sending figure-view into nothing. The card is
    // a clone in the overlay, so the apply below cannot leave it stale; a
    // stepped figure's clone follows the step runtime. Closing it on purpose
    // travels as figure-unfocus.
    if (changed) unfocusFigure();
    state.activeIdx = remoteActiveIdx(payload);
    state.collapse = COLLAPSE_MODES.includes(payload.collapse) ? payload.collapse : 'topic-bold';
    state.zoom = payload.zoom || 1.35;
    // autoFitMode when the peer sends one, the old boolean when it does
    // not. normAutoFit takes either, so a window rebuilt on its own beside
    // one that was not still agrees about the two modes that existed then.
    state.autoFitMode = normAutoFit(
      payload.autoFitMode === undefined ? payload.autoFit : payload.autoFitMode);
    // Track the peer's collapsed zoom rather than syncing it as a field.
    // Both windows see the same zoom values, so remembering the one that
    // was live in topic-bold keeps the two in step without widening the
    // protocol. See speaker.md §3.
    if (state.collapse === 'topic-bold') collapsedZoom = state.zoom;
    state.blanked = !!payload.blanked;
    if (payload.font && FONT_CYCLE.includes(payload.font)) state.font = payload.font;
    if (payload.theme && THEME_CYCLE.includes(payload.theme)) state.theme = payload.theme;
    if (payload.slideNums && SLIDE_NUM_MODES.includes(payload.slideNums)) state.slideNums = payload.slideNums;
    if (payload.pitchblack === 'on' || payload.pitchblack === 'off') state.pitchblack = payload.pitchblack;
    applyFontTheme();
    // Speaker mirrors the audience window's aspect so its preview area
    // lays out content identically. Ignored on audience side (its own
    // window dimensions are the source of truth).
    if (VIEW === 'speaker' && payload.audienceW > 0 && payload.audienceH > 0) {
      setSlideRef(payload.audienceW, payload.audienceH);
    }
    replaceContents(revealed, payload.revealed);
    replaceContents(annotations, payload.annotations);
    // Reflect annotation text into the textareas so the other view sees
    // keystrokes landing in real time. A draft (annotations[id]) wins
    // over the source-prefilled defaultValue; if the draft is gone (e.g.
    // the speaker cleared it after export), fall back to defaultValue so
    // the Markdown-authored annotation stays visible.
    flatChunks.forEach(c => {
      const ta = c.el.querySelector('.annot-textarea');
      if (!ta) return;
      const v = (c.id in annotations) ? annotations[c.id] : ta.defaultValue;
      // Under the layer the size is fitAnnotation's, run once from applyState
      // below; autosize here would be a forced layout thrown away.
      if (ta.value !== v) { ta.value = v; if (!c.el.classList.contains('annot-visible')) autosize(ta); }
      c.el.classList.toggle('has-annot', !!v.trim());
    });
    // Mirror the remote editing state: only the peer that owns the
    // focused textarea acts as editor, but both views raise the box
    // opacity and pan their stage to the same off-center position so
    // the audience can read along while the speaker types. focusCamera
    // reads annotEditingId below.
    const remoteEditingId = payload.annotEditingId || null;
    if (annotEditingId !== remoteEditingId) {
      if (annotEditingId) annotRest(flatChunks.find(c => c.id === annotEditingId));
      annotEditingId = remoteEditingId;
      if (annotEditingId) {
        const cur = flatChunks.find(c => c.id === annotEditingId);
        // fitAnnotation follows in applyState, which every apply reaches.
        if (cur) cur.el.classList.add('annot-visible', 'has-annot');
      }
    }
    applyBlankBadge();
    // Overview first: it decides which projection focusCamera picks, and
    // entering/leaving zeroes manualPan – so it has to run before the
    // camera fields are restored from the payload below.
    setOverviewMode(!!payload.overview, { selectActive: false });
    // Mirror the peer's camera framing before the camera is drawn below, so
    // focusCamera / applyOverviewCamera pick up the same drag-pan, overview
    // scale, and framed chunk.
    applyRemoteCamera(payload.panDx, payload.panDy, payload.overviewScale, payload.selectedIdx, payload.overviewAnchorIdx);
    // Expansions: close any current, open the remote one if any. toggleExp
    // calls applyState internally, so skip the second call in that branch.
    closeAnyExpansion();
    if (payload.openExp) {
      toggleExp(payload.openExp.chunkIdx, payload.openExp.expIdx);
    } else {
      applyState();
    }
    applyRevealAll();
    // The payload carries the zoom the lecturer chose. Whether this window
    // can show it on this chunk without cutting a code line off is a local
    // question, and it is asked after applyState has written the incoming
    // value to --zoom.
    //
    // In shrink mode the same question has a taller answer: the setting that
    // travelled is the ceiling, and how far under it this chunk has to sit in
    // THIS window is what the mode is for - the projection and the cockpit's
    // stage are different sizes. Full auto-fit deliberately keeps adopting
    // the sender's fitted zoom, which is what it has always done.
    if (state.autoFitMode === 'shrink') fitZoomToChunk(collapsedZoom);
    else clampZoomToWidth();
    saveActive();
    // Instant only where the slide itself changed. A remote apply is also
    // how a reveal, a zoom and a collapse arrive, and those are moves on a
    // slide that is already on the frame - the walk down a chunk taller
    // than the screen and a .middle chunk's per-press glide both live here,
    // and both keep their motion in every mode.
    focusCamera(changed && SLIDE_TRANSITION !== 'pan');
  } finally {
    isApplyingRemote = false;
  }
  viewHooks.onStateChange();
}
window.addEventListener('message', (ev) => {
  // Same-origin only. Until ::: embed there were no other windows posting
  // here, so any sender could be adopted as the peer; a third-party iframe
  // now lives *inside* this window, and one object message from it would
  // have captured the peer slot - after which every state snapshot, blank,
  // toast and address went to the frame instead of the projector, silently.
  // Both live views are the same origin as each other by construction
  // (two file:// pages, or two pages off the same --serve).
  if (ev.origin !== SELF_ORIGIN) return;
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  // The window handshake (openViewWindow): a view that found a window under
  // the other view's name it cannot read asks which deck it shows. Ahead
  // of the peer check, because the asker is not yet anyone's peer; answered
  // only to a top-level window, never to a frame, and it gives away nothing
  // but the hash.
  if (m.type === 'whois') {
    let top = false;
    try { top = !!ev.source && ev.source.top === ev.source; } catch (e) {}
    // Both views answer: the projection asks a window called
    // psi-slides-speaker, the cockpit one called psi-slides-audience
    // (openViewWindow). A build before the cockpit's S had only the cockpit
    // answer, and its projection reads only the deck.
    if (top || isPeerWindow(ev.source)) {
      try { ev.source.postMessage({ type: 'iam', source: VIEW, deck: DECK_ID }, '*'); } catch (e) {}
    }
    return;
  }
  if (m.type === 'iam') {
    if (viewAsk && ev.source === viewAsk.w) {
      viewAsk.settle(m.deck === DECK_ID && (m.source === undefined || m.source === viewAsk.view));
    }
    return;
  }
  // And the origin is not enough: a sandboxed frame is "null" too. See
  // isPeerWindow.
  if (!isPeerWindow(ev.source)) return;
  // Another deck's window - see DECK_ID. A message without the field is
  // from a build before it and is taken, so --audience-only beside an older
  // cockpit still pairs.
  if (m.deck !== undefined && m.deck !== DECK_ID) return;
  if (m.source === VIEW) return; // ignore our own postings (shouldn't happen, defensive)
  // The peer's page is going away - see peerGone. Ahead of the adoption
  // below, which would count the goodbye itself as a sign of life.
  if (m.type === 'bye') {
    // The first ask comes sooner than the tick: a reload is back in a few
    // hundred milliseconds, and a lecturer's next press should find it.
    if (ev.source === peer) { peerGone = true; peerPings = 0; notePeer(); setTimeout(peerTick, 400); }
    return;
  }
  // Adopt sender as peer. Handles two cases: audience reload while
  // speaker is alive (speaker's next push reconnects us); audience
  // first hearing from a speaker that booted via opener.
  // Either window greets a window it has just adopted – a cockpit that
  // booted, the one it lost to its own reload, a reloaded cockpit asking
  // with a ping – so that whichever window holds a demo can hand it over
  // again (demoAnnounce), and a reloaded cockpit is sent the room's state
  // as its own boot hello would have been. Not on a hello, which is a
  // greeting already, and not on a here, which the cockpit answers itself.
  const hadPeer = hasLivePeer();
  const wasGone = peerGone && ev.source === peer;
  setPeer(ev.source);
  peerGone = false;
  if (!hadPeer && hasLivePeer() && m.type !== 'hello' && m.type !== 'here') {
    sendToPeer({ type: 'hello', source: VIEW });
  }
  notePeer();
  // A projection that has just booted in a window this cockpit opened
  // (the cockpit's S): the cockpit hands it the slide.
  if (m.type === 'here') { viewHooks.onPeerBoot(false); return; }
  if (m.type === 'hello') {
    if (VIEW === 'audience') sendToPeer({ type: 'state', source: 'audience', payload: snapshot() });
    // A projection back from its own reload, answering the cockpit's ping:
    // the cockpit hands it the slide it was on.
    else if (wasGone) viewHooks.onPeerBoot(true);
    demoAnnounce();
    countdownAnnounce();
    // Same reasoning as demoAnnounce: a cockpit that has just booted, or the
    // one the projection lost to its own reload, has no idea whether the room
    // is already fullscreen, and its W would then toggle the wrong way.
    announceFullscreen();
    return;
  }
  if (m.type === 'state') {
    // Frozen, the cockpit keeps its own slide, reveals, camera and drafts -
    // the projection's autoplay ticks, or a key pressed on its keyboard,
    // used to drag the look-ahead back to the room's slide. Two things are
    // still the room's to say: whether it is blanked, and how big it is.
    // Thawing pushes this window's snapshot, which is the re-sync.
    if (viewHooks.lookingAhead()) { applyFrozenState(m.payload); return; }
    applyRemoteState(m.payload, !!m.handover);
    return;
  }
  // A press in the other window - the projection's clicker. Not state: the
  // cockpit's clock starts on the first one, and nothing else reads it.
  // Ahead of nothing it could be confused with, and past the freeze gate,
  // because a frozen cockpit is looking ahead while the room's talk begins.
  if (m.type === 'press') { viewHooks.onPress(true); return; }
  // A window that had said goodbye asking whether this page is there. The
  // adoption above has already answered it with a hello when this window had
  // no peer; one that still held it answers with a pong, which says nothing
  // but "here" and clears the asker's peerGone like any message.
  if (m.type === 'ping') { if (hadPeer) sendToPeer({ type: 'pong', source: VIEW }); return; }
  if (m.type === 'pong') return;
  if (m.type === 'video') { applyRemoteVideo(m); return; }
  // A diagram the other window edited. Its own message rather than a field
  // of the snapshot, following the video precedent and for the same reason:
  // applyRemoteState is a *full* apply, so folding an edit into the snapshot
  // would drag the receiver's slide position along with it.
  // Addressed by the diagram's own id, never by index, so reordering a chunk
  // cannot mis-target it – the lesson data-fig-id already carries for video.
  // Gated by the freeze flag on the sending side, like any shared state.
  if (m.type === 'diagram-edit') {
    // The editor's own apply where the view ships one; otherwise the
    // compiled markup the cockpit sent along. That second path is what makes
    // editor: speaker honest: the projection carries no compiler, and it
    // used to drop every edit here in silence while the cockpit said the
    // room was following.
    if (window.psiApplyDiagramEdit) window.psiApplyDiagramEdit(m);
    else if (m.html) {
      const target = document.getElementById(m.id);
      if (target) dgSwapFigure(target, m.html);
    }
    return;
  }
  if (m.type === 'embed') { applyRemoteEmbed(m); return; }
  // Address overlay, outside the snapshot for the same reason as blank:
  // it is a command aimed at the projection, not shared navigation state.
  if (m.type === 'link-show') {
    showLinkOverlay(m.href, m.label);
    return;
  }
  if (m.type === 'link-hide') {
    hideLinkOverlay();
    return;
  }
  // The live demo is a command to the projector like blank: outside the
  // snapshot, past the freeze gate. Four types, one for the state and three
  // that carry the WebRTC handshake when the windows are not one origin.
  // 'live' says the sender holds a capture and whether it is paused;
  // 'pause' and 'resume' come from either window, since D pauses a demo
  // whichever of the two holds it.
  if (m.type === 'demo') {
    if (m.action === 'stop') {
      endDemoLocally();
    } else if (m.action === 'live') {
      demoRemoteLive = true;
      demoPaused = !!m.paused;
      applyDemoView();
    } else if (m.action === 'pause' || m.action === 'resume') {
      demoPaused = m.action === 'pause';
      applyDemoView();
    }
    return;
  }
  if (m.type === 'demo-offer') { demoReceiveOffer(m); return; }
  if (m.type === 'demo-answer') { demoReceiveAnswer(m); return; }
  if (m.type === 'demo-ice') { demoReceiveIce(m); return; }
  // The note button, outside the snapshot for the same reason as blank: a
  // command to the projection, not shared state. Applied in both windows
  // rather than in the audience alone, so a cockpit that was toggled from
  // the projection agrees about what the room is looking at.
  if (m.type === 'note-button') {
    setNoteButton(m.mode, false);
    return;
  }
  // The projection's own frame (W), outside the snapshot for the reason blank
  // is - a command aimed at the projector - and per-window besides: one of
  // these two windows is on a projector and the other on a laptop, so there
  // is no shared value to put in a snapshot at all.
  if (m.type === 'fullscreen') {
    // What the projection is actually doing, so the cockpit's W knows which
    // way to toggle after an Escape it never saw.
    if (m.action === 'state') { peerFullscreen = !!m.on; return; }
    if (VIEW !== 'audience') return;
    if (m.action === 'exit') {
      disarmFullscreen();
      if (fullscreenOn()) exitFullscreenHere().catch(() => {});
      return;
    }
    // Ask first and arm only on the refusal. Chromium refuses this with
    // "Permissions check failed" because no gesture in *this* window started
    // it; asking anyway is what makes the hint stop appearing on a browser
    // that ever relaxes the rule, rather than leaving a click in the way for
    // ever because of a measurement taken once.
    requestFullscreenHere().catch(() => armFullscreen());
    return;
  }
  // Blank travels outside the snapshot so it still lands while frozen.
  if (m.type === 'blank' && VIEW === 'audience') {
    state.blanked = !!m.blanked;
    document.body.classList.toggle('blanked', state.blanked);
    applyBlankBadge();
    return;
  }
  // The countdown travels outside the snapshot like blank, past the freeze
  // gate: it is the window's, not the slide's.
  if (m.type === 'timer') { countdownReceive(m.timer); return; }
  // A toast the audience handed over because a cockpit is open. Shown
  // directly rather than via flashMode, which would bounce it back.
  if (m.type === 'toast') {
    showModeBadge(m.text);
    return;
  }
  // Aspect-only update: the audience window was resized (full screen, a
  // projector renegotiating its resolution). Re-letterboxes the speaker's
  // stage without touching which slide it is showing.
  if (m.type === 'slide-ref' && VIEW === 'speaker') {
    // setSlideRef re-runs sizeStageViewport, which rebuilds the strip, so
    // the thumbnails pick up the new --audience-aspect too.
    if (m.w > 0 && m.h > 0) setSlideRef(m.w, m.h);
    return;
  }
  if (m.type === 'pan') {
    if (viewHooks.lookingAhead()) return;
    isApplyingRemote = true;
    try {
      applyRemoteCamera(m.dx, m.dy, m.overviewScale, m.selectedIdx, m.overviewAnchorIdx);
      focusCamera(true);
    } finally { isApplyingRemote = false; }
    return;
  }
  if (m.type === 'cursor' && VIEW === 'audience') {
    showLaserPointer(m.chunkIdx, m.x, m.y, m.target);
  }
  if (VIEW === 'audience') {
    if (m.type === 'figure-focus') {
      // A slide change still in its dip would close the card when it lands.
      settleFade();
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll(FOCUSABLE_SEL)[m.figureIdx];
        if (el) focusFigure(el);
      }
      return;
    }
    // Bringing an aside into the frame is a command to the projector, not a
    // field of the shared state, so it travels as its own message type - the
    // same reasoning as blank and slide-ref. applyRemoteState is a full
    // apply, and a snapshot sent to say "the aside is in" would drag the
    // room's slide position with it. It has to travel at all because the
    // aside is on the projection: the lecturer clicks it in the cockpit and
    // the room is what has to move.
    if (m.type === 'figure-pan') {
      settleFade();
      const chunk = flatChunks[m.chunkIdx];
      if (chunk) {
        const el = chunk.el.querySelectorAll(FOCUSABLE_SEL)[m.figureIdx];
        if (el && el.classList.contains('marginalia')) setAsidePan(el);
      }
      return;
    }
    if (m.type === 'figure-unpan') {
      if (clearAsidePan()) focusCamera(false);
      return;
    }
    if (m.type === 'figure-unfocus') { unfocusFigure(); return; }
    if (m.type === 'figure-view') {
      if (!focusedFigure) return;
      // The receiving side needs the transition off for the same reason the
      // sending side does, and it is the half the room actually looks at: a
      // peer zooming with a trackpad streams these at frame rate, and the
      // 80 ms ease on the focus card would be re-aimed by every one of them.
      // The pan receiver above solves it by passing instant=true to
      // focusCamera; there is no such flag here, so hold the class instead
      // and let its quiet period drop it once the messages stop.
      markZooming('figure-zooming');
      figureScale = Math.max(FIG_MIN_SCALE, Math.min(FIG_MAX_SCALE, m.scale || 1));
      figurePan = { x: m.panX || 0, y: m.panY || 0 };
      applyFigureTransform();
      return;
    }
  }
});

// Laser pointer – audience-only mirror of the speaker's mouse position.
// chunkIdx + percentage coords let the receiver position relative to
// its own copy of the active chunk (so different zoom levels still align).
const laserEl = document.getElementById('psiINT-laser-pointer');
let laserHideTimer = null;
function showLaserPointer(chunkIdx, px, py, target) {
  if (!laserEl) return;
  if (chunkIdx < 0) { hideLaserPointer(); return; }
  let r;
  if (target === 'figure') {
    // Position relative to the audience's own focused card. If no figure
    // is focused locally (e.g. the focus message hasn't arrived yet),
    // drop the dot rather than render at a stale chunk position.
    if (!focusedFigure) { hideLaserPointer(); return; }
    r = focusedFigure.getBoundingClientRect();
  } else {
    if (chunkIdx !== state.activeIdx) { hideLaserPointer(); return; }
    const entry = flatChunks[chunkIdx];
    if (!entry) return;
    r = entry.el.getBoundingClientRect();
  }
  laserEl.style.left = (r.left + px * r.width) + 'px';
  laserEl.style.top  = (r.top  + py * r.height) + 'px';
  laserEl.classList.add('visible');
  clearTimeout(laserHideTimer);
  laserHideTimer = setTimeout(hideLaserPointer, 500);
}
function hideLaserPointer() {
  if (laserEl) laserEl.classList.remove('visible');
  clearTimeout(laserHideTimer);
  laserHideTimer = null;
}

// Wraps each paragraph as <head><rest>, and within rest wraps bare text
// runs in .prose. Collapse mode "topic-bold" then hides .prose while
// keeping <strong> phrases visible.
// A rendered formula is a precise tree of nested spans whose CSS depends on
// that exact nesting, so the walker treats it as one opaque node: never
// descend into it, and never let its text content decide where a sentence
// ends. Without the first guard, wrapProse would inject span.prose elements
// between KaTeX's own spans and the formula would visibly fall apart.
function isMathNode(el) {
  return el.nodeType === 1 && (el.classList.contains('katex')
    || el.classList.contains('math-inline')
    || el.classList.contains('math-display'));
}

// A period only ends the topic sentence when it plausibly ends a sentence.
// Without the guards, "Kleinberg u. a. 2017" cuts the head short after "u."
// and the collapsed slide shows a dangling abbreviation. Two cheap signals
// cover the lecture corpus: a single letter or digit before the dot is an
// abbreviation or ordinal ("u.", "z.", "B.", "8. April"), and a lowercase
// continuation after it is no sentence start ("et al. 2017"). "!" and "?"
// are never abbreviation marks and always end the sentence. The trade-off:
// a sentence genuinely ending in a single character ("… um Faktor 3.") now
// keeps its continuation in the head – a too-long topic sentence, which is
// less broken than a truncated one.
const SENTENCE_ABBREVS = new Set(['bzw','ca','vgl','etc','usw','engl','sog',
  'inkl','zzgl','ggf','evtl','al','vs','resp','Nr','Dr','Prof','Abs','Art',
  'Kap','Abb','Tab','Aufl','Hrsg','Mio','Mrd','ff','ebd','St']);
function dotEndsSentence(before, after) {
  const tok = (before.match(/([\p{L}\p{N}]+)$/u) || [])[1];
  if (tok && (tok.length === 1 || SENTENCE_ABBREVS.has(tok))) return false;
  if (/^\p{Ll}/u.test(after)) return false;
  return true;
}
function sentenceEndIn(text) {
  const re = /[.!?](?=\s)/g;
  let m;
  while ((m = re.exec(text))) {
    if (text[m.index] !== '.') return m.index;
    const after = text.slice(m.index + 1).replace(/^\s+/, '');
    if (dotEndsSentence(text.slice(0, m.index), after)) return m.index;
  }
  return -1;
}
function tailEndsSentence(text) {
  const t = text.trimEnd();
  if (!/[.!?]$/.test(t)) return false;
  if (t.endsWith('.')) return dotEndsSentence(t.slice(0, -1), '');
  return true;
}

function splitSentencesIn(root) {
  const wrapProse = (node) => {
    for (const k of [...node.childNodes]) {
      if (k.nodeType === 3 && k.textContent.trim()) {
        const span = document.createElement('span');
        span.className = 'prose';
        span.appendChild(document.createTextNode(k.textContent));
        node.replaceChild(span, k);
      } else if (isMathNode(k) || k.tagName === 'CODE') {
        // Wrap rather than descend. A formula in continuation prose has to
        // disappear with the sentence it belongs to, or the collapsed slide
        // shows a bare symbol with none of the words that gave it meaning.
        // Wrapping hides it by the same rule as the surrounding text while
        // leaving KaTeX's internal markup untouched. A code span for the
        // same reason and one more: descending left an empty <code> in the
        // line, and once style.code gave a span with a space a margin (or
        // tint a padding), that empty inline made the line box real - a
        // blank line under the promoted bullet, 47px at 1600x900.
        const span = document.createElement('span');
        span.className = 'prose';
        node.replaceChild(span, k);
        span.appendChild(k);
      } else if (k.nodeType === 1 && k.tagName !== 'STRONG' && !k.classList.contains('prose')) {
        wrapProse(k);
      }
    }
  };
  root.querySelectorAll('p').forEach(p => {
    if (p.querySelector('.sentence-head')) return;
    // Explicit-slide blocks opt out of sentence extraction: the author has
    // already said what belongs on screen, so splitting their paragraphs
    // into head/rest would only give the collapse CSS something to hide.
    // A statement chunk opts out for the same reason without a block to
    // write: its paragraphs ARE the lines of the slide, one per press, so
    // abridging them would leave the room with the first word of each.
    if (p.closest('.slide-explicit, .script-only, [data-tag=statement]')) return;
    const head = document.createElement('span'); head.className = 'sentence-head';
    const rest = document.createElement('span'); rest.className = 'sentence-rest';
    let mode = 'head';
    for (const k of [...p.childNodes]) {
      if (mode === 'head' && k.nodeType === 3) {
        const idx = sentenceEndIn(k.nodeValue);
        if (idx !== -1) {
          head.appendChild(document.createTextNode(k.nodeValue.slice(0, idx + 1)));
          rest.appendChild(document.createTextNode(k.nodeValue.slice(idx + 1)));
          mode = 'rest';
        } else head.appendChild(k.cloneNode(true));
      } else if (mode === 'head') {
        head.appendChild(k.cloneNode(true));
        // KaTeX renders a hidden MathML copy alongside the visible HTML, so
        // a formula's textContent is not the text the reader sees and must
        // not be tested for a sentence-ending period.
        if (k.nodeType === 1 && !isMathNode(k) && tailEndsSentence(k.textContent)) mode = 'rest';
      }
      else rest.appendChild(k.cloneNode(true));
    }
    p.textContent = '';
    p.appendChild(head);
    if (rest.childNodes.length) {
      wrapProse(rest);
      p.appendChild(rest);
    }
  });
}

// State
// Visible in the speaker window whenever the room is blanked, and in the
// audience only when no speaker window exists to carry it. Recomputed on
// every state application because the peer can appear or go away at any
// time – S spawns one, closing it takes it away again.
// The window the lecturer is looking at: the cockpit when there is one,
// otherwise the projection running alone. Where a badge or a toast lands.
function lecturerScreen() {
  return VIEW === 'speaker' || !hasLivePeer();
}
const blankBadge = document.getElementById('psiINT-blank-badge');
function applyBlankBadge() {
  if (!blankBadge) return;
  blankBadge.classList.toggle('hidden', !(state.blanked && lecturerScreen()));
}
// ── countdown timer (Shift-T) ──
// The countdown belongs to the window, not to a chunk: a bar along the top edge
// and the time left, both fixed over everything and out of the layout, so no
// slide change, reveal, blank or zoom touches them. It is a message family of
// its own ('timer'), outside the state snapshot for the reason blank is, and
// carries the absolute end time, so the two windows (one machine, one clock)
// cannot drift. Nothing is in the DOM while no countdown is set.
const COUNTDOWN_KEY = storageKey('timer');
const COUNTDOWN_MUTED_KEY = storageKey('timer-muted');
const COUNTDOWN_STALE_MS = 10 * 60 * 1000;   // a reload this long after the end finds no countdown
const COUNTDOWN_MAX_MIN = 600;
let countdown = null;          // { end, dur, muted } in epoch ms, or null
let countdownEl = null, countdownFill = null, countdownRead = null, countdownMute = null;
let countdownTick = 0;
let countdownAudio = null;
let countdownModal = null;
function countdownDefaultMuted() {
  try { return localStorage.getItem(COUNTDOWN_MUTED_KEY) === '1'; } catch (e) { return false; }
}
// "5" is minutes, "2:30" minutes and seconds, "0:45" seconds. Returns seconds,
// 0 for an input that clears, or null for one that is not a time.
function parseCountdownInput(text) {
  const s = String(text).trim();
  if (s === '') return 0;
  const m = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(s);
  if (!m) return null;
  const min = Number(m[1]), sec = m[2] === undefined ? 0 : Number(m[2]);
  if (min > COUNTDOWN_MAX_MIN || (min === COUNTDOWN_MAX_MIN && sec > 0)) return null;
  return min * 60 + sec;
}
function countdownLeft(now) { return countdown ? countdown.end - now : 0; }
function fmtCountdown(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const s = t % 60;
  return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s;
}
const COUNTDOWN_BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5"/><path d="M4.5 5.5 7.5 3M19.5 5.5 16.5 3"/>'
  + '<path class="countdown-strike" d="M3 21 21 4"/></svg>';
function countdownBuild() {
  if (countdownEl) return;
  countdownEl = document.createElement('div');
  countdownEl.id = 'psiINT-countdown';
  countdownEl.setAttribute('role', 'timer');
  countdownFill = document.createElement('div');
  countdownFill.id = 'psiINT-countdown-fill';
  countdownRead = document.createElement('div');
  countdownRead.id = 'psiINT-countdown-read';
  countdownMute = document.createElement('button');
  countdownMute.type = 'button';
  countdownMute.id = 'psiINT-countdown-mute';
  countdownMute.innerHTML = COUNTDOWN_BELL;
  const num = document.createElement('span');
  num.id = 'psiINT-countdown-num';
  countdownRead.append(countdownMute, num);
  countdownEl.append(countdownFill);
  // The cockpit draws it over its picture of the slide, where the room sees
  // it, rather than over the column bar at the window's top.
  (VIEW === 'speaker' && document.getElementById('psiINT-stage-cell') || document.body)
    .append(countdownEl, countdownRead);
  countdownMute.addEventListener('click', (ev) => {
    ev.stopPropagation();
    countdownPrime();
    countdown.muted = !countdown.muted;
    try { localStorage.setItem(COUNTDOWN_MUTED_KEY, countdown.muted ? '1' : '0'); } catch (e) {}
    countdownCommit();
  });
  const dismiss = () => { if (countdown && countdownLeft(Date.now()) <= 0) countdownSet(0); };
  countdownEl.addEventListener('click', dismiss);
  num.addEventListener('click', dismiss);
}
function countdownDestroy() {
  clearInterval(countdownTick); countdownTick = 0;
  if (countdownEl) { countdownEl.remove(); countdownRead.remove(); }
  countdownEl = countdownFill = countdownRead = countdownMute = null;
}
function countdownPaint() {
  if (!countdown) { countdownDestroy(); return; }
  countdownBuild();
  const left = countdownLeft(Date.now());
  const done = left <= 0;
  const frac = done ? 1 : Math.min(1, Math.max(0, 1 - left / countdown.dur));
  countdownFill.style.width = (frac * 100) + '%';
  countdownRead.querySelector('#psiINT-countdown-num').textContent = fmtCountdown(left);
  for (const el of [countdownEl, countdownRead]) el.classList.toggle('countdown-done', done);
  countdownMute.classList.toggle('countdown-muted', !!countdown.muted);
  countdownMute.setAttribute('aria-pressed', countdown.muted ? 'true' : 'false');
  countdownMute.setAttribute('aria-label', countdown.muted ? 'Sound is off – click to turn it on' : 'Sound is on – click to mute');
  countdownMute.title = countdown.muted ? 'Sound off' : 'Sound on';
}
// One of the two windows beeps: the one the countdown was set in, which has
// had the gesture, or the other when that one is gone. Autoplay rules let a page make sound only after a gesture in
// it, so the context is made and resumed on the press that sets the countdown,
// on the mute click and on any later press while a countdown runs; without one
// the beep is skipped without a word.
function countdownPrime() {
  try {
    if (!countdownAudio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      countdownAudio = new AC();
    }
    if (countdownAudio.state === 'suspended') countdownAudio.resume().catch(() => {});
  } catch (e) {}
}
function countdownBeep() {
  if (!countdown || countdown.muted) return;
  if (countdown.by && countdown.by !== VIEW && hasLivePeer()) return;
  try {
    countdownPrime();
    const ac = countdownAudio;
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator(), g = ac.createGain();
      const t = t0 + i * 0.28;
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.015);
      g.gain.setValueAtTime(0.25, t + 0.15);
      g.gain.linearRampToValueAtTime(0, t + 0.19);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.22);
    }
    countdownBeeps++;
  } catch (e) {}
}
let countdownBeeps = 0;   // beeps this page has started, for the spec
let countdownWasDone = false;
function countdownStep() {
  if (!countdown) return;
  const left = countdownLeft(Date.now());
  const done = left <= 0;
  countdownPaint();
  if (done && !countdownWasDone) {
    countdownWasDone = true;
    // Only an expiry seen live sounds: a page reloaded after the end is quiet.
    if (-left < 2500) countdownBeep();
  }
  if (done && countdownTick) { clearInterval(countdownTick); countdownTick = 0; }
}
function countdownStart(t) {
  countdown = t;
  countdownWasDone = t ? countdownLeft(Date.now()) <= 0 : false;
  clearInterval(countdownTick); countdownTick = 0;
  countdownPaint();
  if (countdown && !countdownWasDone) countdownTick = setInterval(countdownStep, 250);
}
function countdownStore() {
  try {
    if (countdown) localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(countdown));
    else localStorage.removeItem(COUNTDOWN_KEY);
  } catch (e) {}
}
function countdownCommit() {
  countdownStore();
  countdownPaint();
  sendToPeer({ type: 'timer', source: VIEW, timer: countdown });
}
// Set a countdown of `seconds` from now, or clear it (0).
function countdownSet(seconds) {
  if (!seconds) countdownStart(null);
  else {
    const dur = seconds * 1000;
    countdownStart({ end: Date.now() + dur, dur, muted: countdownDefaultMuted(), by: VIEW });
  }
  countdownCommit();
}
function countdownReceive(t) {
  countdownStart(t && typeof t.end === 'number' && t.dur > 0
    ? { end: t.end, dur: t.dur, muted: !!t.muted, by: t.by } : null);
  countdownStore();
}
function countdownAnnounce() {
  if (countdown) sendToPeer({ type: 'timer', source: VIEW, timer: countdown });
}
function countdownRestore() {
  try {
    const t = JSON.parse(localStorage.getItem(COUNTDOWN_KEY) || 'null');
    if (t && typeof t.end === 'number' && t.dur > 0 && Date.now() - t.end < COUNTDOWN_STALE_MS) {
      countdownStart({ end: t.end, dur: t.dur, muted: !!t.muted, by: t.by });
    }
  } catch (e) {}
}
function closeCountdownModal() {
  if (!countdownModal) return;
  countdownModal.remove();
  countdownModal = null;
}
function openCountdownModal() {
  if (countdownModal) { countdownModal.querySelector('input').focus(); return; }
  const box = document.createElement('div');
  box.id = 'psiINT-countdown-modal';
  box.innerHTML = '<form id="psiINT-countdown-form" autocomplete="off">'
    + '<label for="psiINT-countdown-input">Countdown</label>'
    + '<input id="psiINT-countdown-input" type="text" inputmode="numeric" spellcheck="false" placeholder="5 · 2:30 · 0:45">'
    + '<p id="psiINT-countdown-hint" aria-live="polite">Minutes, or m:ss. Empty clears the countdown.</p>'
    + '</form>';
  document.body.append(box);
  countdownModal = box;
  const input = box.querySelector('input'), hint = box.querySelector('#psiINT-countdown-hint');
  box.querySelector('form').addEventListener('submit', (ev) => ev.preventDefault());
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { closeCountdownModal(); ev.preventDefault(); ev.stopPropagation(); }
    else if (ev.key === 'Enter') {
      ev.preventDefault(); ev.stopPropagation();
      const secs = parseCountdownInput(input.value);
      if (secs === null) {
        hint.textContent = 'Not a time – try 5, 2:30 or 0:45.';
        hint.classList.add('countdown-bad');
        return;
      }
      countdownPrime();
      closeCountdownModal();
      countdownSet(secs);
    }
  });
  input.addEventListener('input', () => {
    hint.classList.remove('countdown-bad');
    hint.textContent = 'Minutes, or m:ss. Empty clears the countdown.';
  });
  box.addEventListener('mousedown', (ev) => { if (ev.target === box) closeCountdownModal(); });
  input.focus();
}
// Any later press in this window keeps the audio context usable.
for (const evName of ['keydown', 'pointerdown']) {
  document.addEventListener(evName, () => { if (countdown && !countdownAudio) countdownPrime(); }, true);
}
countdownRestore();
// Live demo (D): the capture this window holds, whether the other window
// said it holds one, whether the demo is paused, the loopback connection at
// either end, and the promise that its remote description is in. Declared
// here, next to the blank badge, because applyState reads them through
// applyDemoBadge before the demo section further down has run. The
// functions are in the "live demo" section.
let demoStream = null;
let demoPending = false;
let demoRemoteLive = false;
let demoPaused = false;
let demoPc = null;
let demoRemoteReady = null;
const demoBadge = document.getElementById('psiINT-demo-badge');
function demoOn() { return !!demoStream || demoRemoteLive; }
function applyDemoBadge() {
  if (!demoBadge) return;
  demoBadge.classList.toggle('hidden', !(demoOn() && lecturerScreen()));
  // Paused, the capture still runs - the browser's sharing bar says so on
  // the laptop - and the badge says it too, so the room's slides are not
  // mistaken for the end of it.
  const word = demoBadge.firstChild, hint = demoBadge.querySelector('span');
  if (word && word.nodeType === 3) word.nodeValue = demoPaused ? 'DEMO PAUSED' : 'DEMO';
  if (hint) hint.textContent = demoPaused ? ' · hit D to show it again' : ' · hit D to pause it';
  // Another window is picked where the capture is held; a window that only
  // shows the demo has nothing to offer the button.
  const sw = demoBadge.querySelector('[data-demo=switch]');
  if (sw) sw.hidden = !demoStream;
}

function applyState() {
  document.body.dataset.collapse = state.collapse;
  showZoom();
  document.body.classList.toggle('blanked', state.blanked);
  applyBlankBadge();
  applyDemoBadge();
  flatChunks.forEach((c, i) => c.el.classList.toggle('active', i === state.activeIdx));
  // The cap on the live annotation's type is in slide sizes, so zoom moves it.
  if (annotEditingId) fitAnnotation(flatChunks.find(c => c.id === annotEditingId));
  updateEmbedLoading();
  updateNavHints();
  viewHooks.onActiveChange();
  broadcastState();
}

// A chunk's forward beats: the reveal segments after the first, plus one
// per diagram step, in document order. Making diagram steps beats on the
// existing counter rather than a mechanism of their own is what buys the
// whole feature its sync, its backward-navigation rule, its freeze gating
// and its localStorage recovery for free – revealed[chunkId] was already
// all of that, and it is still the only state involved. Document order
// also gets the interleaving right: a diagram inside segment 1 advances
// only once segment 1 is up.
// Every beat carries pos, its index among the beats that are counted by
// position - a mark with at is not one of them. It used to be, and a
// mark inside an overlay was then counted twice: once by its place in this
// list and once by at, which gave the slide a dead Space at the end and
// shifted every positional beat after it by one.
// What a "--- from N" wrote, on a segment or on a marker. One reader, because
// two spellings of "read this attribute" is how the two windows come to
// disagree about what arrives when.
function fromOf(node) {
  const raw = node.dataset ? node.dataset.from : null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function chunkBeats(el) {
  const out = [];
  let segIdx = 0;
  let pos = 0;
  const push = (b) => { if (b.at == null) b.pos = pos++; out.push(b); };
  // Beats inside a container held to a beat count from the container's own:
  // from 3 with a marker and a figure step inside is the container on 3, the
  // marker on 4, the step on 5. One counter per container, in document order,
  // so a marker and a diagram step inside one interleave as they are written.
  // Diagram steps used to be pushed positionally wherever they stood, and a
  // figure in an overlay held to from 2 played its steps behind a card that
  // was not yet on the slide.
  const inner = new Map();
  const innerAt = (node) => {
    const c = node.closest(FROM_SEL);
    if (!c) return null;
    const k = (inner.get(c) || 0) + 1;
    inner.set(c, k);
    return Number(c.dataset.from) + k;
  };
  el.querySelectorAll('.reveal-segment, svg.psi-diagram, .beat-mark').forEach(node => {
    // A diagram inside an expansion body is not on the projection, so its
    // steps must not consume beats – Space would advance a counter and the
    // room would see nothing happen.
    if (node.closest('.exp-body, .chunk-expansion')) return;
    if (node.classList.contains('reveal-segment')) {
      // A "--- from N" pins the segment to an advance by number instead of to
      // its place in the order. push() then leaves it out of the positional
      // count, which is the same arrangement a marker inside an overlay has
      // had since a from-beat existed.
      //
      // The first rendered segment is normally the slide's opening state and
      // is no beat at all - but it can be a pinned one, when the segment
      // above it was emptied by a captured directive (a chunk that opens on
      // its backdrop and takes its words at beat 3). Without the second test
      // it was hidden by the FROM_SEL sweep at the foot of applyReveal and
      // managed by nothing: no entry in the beat list, so no next-mark in
      // the cockpit and no line in the cue list.
      const at = fromOf(node);
      if (segIdx++ > 0 || at != null) push({ type: 'seg', el: node, at });
      return;
    }
    // A --- below the top level: the beat owns every element sibling after
    // the marker up to the next marker in the same parent. Document order
    // is source order, so a marker in the left pane comes before one in the
    // right and both before a top-level segment written after the block.
    if (node.classList.contains('beat-mark')) {
      const els = [];
      for (let n = node.nextElementSibling; n && !n.classList.contains('beat-mark'); n = n.nextElementSibling) els.push(n);
      // Inside an overlay held to a beat, the card's own beats start after
      // it arrives: from 3 and two markers is the card on 3, its second
      // block on 4, its third on 5 - whatever position the marker has in
      // the slide's list. Without at, the overlay layer comes after the
      // body in document order, so its inner beats would be numbered
      // before its own from-beat and play behind a card not yet shown.
      // A written number wins over the position; inside a container that is
      // itself held to a beat the two cannot both be present, which the
      // parser refuses, so this is a choice between one answer and none.
      const at = fromOf(node) ?? innerAt(node);
      push({ type: 'mark', els, at });
      return;
    }
    const d = node.psiDiagram;
    if (!d || d.data.n < 2) return;
    for (let s = 1; s < d.data.n; s++) push({ type: 'diag', d, step: s, at: innerAt(node) });
  });
  return out;
}
// A backdrop's reveal is indexed by the beat rather than pushed into the
// ordered list above, and that is the whole of the design. The backdrop is
// a sibling of .chunk-content, so document order would put every one of its
// places *before* every reveal segment - and the move this exists for is
// exactly the one where the picture retreats and the words arrive in the
// same beat. Indexed, extent i is simply what the slide looks like at beat
// i, and the last one persists.
//
// So it does not add beats, it *rides* them - except where the chunk has
// none of its own, which is the title slide the feature was asked for.
function bdFrames(el) {
  const bd = el.querySelector(':scope > .chunk-backdrop[data-bd-frames]');
  if (!bd) return null;
  try { return { el: bd, frames: JSON.parse(bd.dataset.bdFrames) }; }
  catch (e) { return null; }
}
// Positions, not beats: 1 means "in the chunk, nothing advanced yet", which
// is the convention jumpTo and advanceReveal were already written against.
function countSegments(el) {
  const all = chunkBeats(el);
  const beats = all.filter(b => b.at == null).length;
  const bd = bdFrames(el);
  let n = beats ? beats + 1 : (el.querySelector('.reveal-segment') ? 1 : 0);
  all.forEach(b => { if (b.at != null) n = Math.max(n, b.at + 1); });
  if (bd) n = Math.max(n, bd.frames.length);
  el.querySelectorAll(FROM_SEL).forEach(c => {
    n = Math.max(n, Number(c.dataset.from) + 1);
  });
  return n;
}
function applyReveal(el, id, instant) {
  const beats = chunkBeats(el);
  const total = countSegments(el);
  const consumed = Math.max(0, (revealed[id] ?? (total ? 1 : 0)) - 1);
  const segs = el.querySelectorAll('.reveal-segment');
  if (segs[0]) { segs[0].removeAttribute('data-hidden'); segs[0].removeAttribute('data-next'); }
  const steps = new Map();
  beats.forEach(b => { if (b.type === 'diag' && !steps.has(b.d)) steps.set(b.d, 0); });
  beats.forEach((b) => {
    const i = b.pos;
    const on = b.at == null && i < consumed;
    if (b.type === 'seg') {
      const shown = b.at != null ? consumed >= b.at : on;
      if (shown) b.el.removeAttribute('data-hidden');
      else b.el.setAttribute('data-hidden', '');
      // Mark the one segment that Space or Down will bring up next. Only the
      // speaker's stylesheet reacts to it, but the attribute is set in both
      // views so the two DOMs stay identical.
      if (b.at != null ? consumed === b.at - 1 : i === consumed) b.el.setAttribute('data-next', '');
      else b.el.removeAttribute('data-next');
    } else if (b.type === 'mark') {
      const shown = b.at != null ? consumed >= b.at : on;
      const next = b.at != null ? consumed === b.at - 1 : i === consumed;
      b.els.forEach((e, k) => {
        e.toggleAttribute('data-beat-hidden', !shown);
        e.toggleAttribute('data-next', !shown && next && k === 0);
      });
    } else if (b.at != null ? consumed >= b.at : on) {
      steps.set(b.d, Math.max(steps.get(b.d) || 0, b.step));
    }
  });
  // A chunk that is not on screen jumps rather than animates: applying the
  // stored reveal state to forty chunks at boot must not start forty tweens.
  const jump = instant || !el.classList.contains('active');
  steps.forEach((step, d) => dgStep(d, step, jump));
  el.querySelectorAll(FROM_SEL).forEach(c => {
    c.toggleAttribute('data-hidden', consumed < Number(c.dataset.from));
  });
  // A ::: footnote follows the segment it was written in. It rides the
  // segment rather than a beat number because the two are not the same
  // count: a diagram step between two segments is a beat, so the second
  // segment's number is not its index. Mirroring the segment's own state is
  // exact whatever sits between them, and adds no beat of its own - which is
  // why countSegments knows nothing about this.
  el.querySelectorAll('.margin-note[data-seg]').forEach(a => {
    const seg = segs[Number(a.dataset.seg)];
    a.toggleAttribute('data-beat-hidden', !!seg && seg.hasAttribute('data-hidden'));
  });
  const bd = bdFrames(el);
  if (bd) {
    // The same rule the tween follows: a chunk off screen snaps, or booting
    // into the middle of a deck plays every backdrop's whole reveal at once
    // behind the reader's back.
    bd.el.style.transition = jump ? 'none' : '';
    bd.el.style.clipPath = bd.frames[Math.min(consumed, bd.frames.length - 1)];
    if (jump) { void bd.el.offsetWidth; bd.el.style.transition = ''; }
  }
}
function applyRevealAll() {
  flatChunks.forEach(c => applyReveal(c.el, c.id));
}

// Camera – translate stage so the active slide is centered in the viewport.
function getOffset(el, parent) {
  let x = 0, y = 0, n = el;
  while (n && n !== parent) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}
// The vertical extent of what is actually painted inside a box, in the same
// layout coordinates getOffset answers in. Only a .middle chunk reads it (see
// focusCamera), and it exists because offsetHeight cannot answer the
// question: a segment past the opening beat keeps its box and a beat below
// the top level keeps its row, by design, so the box is the chunk's final
// shape from beat 0 and says nothing about what the room can see.
//
// Client rects and not offsets, because the things that are painted are
// often not the things that have an offsetParent - a rows block dissolves
// its list into the grid with display: contents, and a dissolved element has
// no box at all. So the walk descends through anything with no box of its
// own, stops at anything holding its own text (whose box covers its
// children), and converts once at the end: the cockpit's stage is scaled,
// and one ratio taken from the container is exactly the factor between the
// two coordinate systems.
// Split in two, and the client half is the one --check-fit needs. The camera
// wants the span in the stage's layout coordinates; the probe compares
// everything against #psiINT-stage-viewport's client rect, and a probe that
// re-derived "what is painted" from a selector list of its own would be a
// second implementation of the exact rule the camera follows. One walk, two
// coordinate systems.
function paintedClientSpan(el) {
  let top = Infinity, bottom = -Infinity;
  const walk = (node) => {
    for (const k of node.children) {
      if (k.hasAttribute('data-hidden') || k.hasAttribute('data-beat-hidden')) continue;
      const cl = k.classList;
      // Chrome that lives inside the content box and is not the slide.
      if (cl.contains('annot-box') || cl.contains('annot-add') || cl.contains('exps')) continue;
      const r = k.getBoundingClientRect();
      const boxed = r.width > 0 || r.height > 0;
      const tag = k.tagName;
      const atom = tag === 'svg' || tag === 'IMG' || tag === 'HR' || tag === 'PRE' || tag === 'CANVAS';
      const ownText = [...k.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (boxed && (atom || ownText || !k.children.length)) {
        if (r.top < top) top = r.top;
        if (r.bottom > bottom) bottom = r.bottom;
        continue;
      }
      walk(k);
    }
  };
  walk(el);
  if (bottom < top) return null;
  return { top, bottom, height: bottom - top };
}
function paintedSpan(el) {
  const base = el.getBoundingClientRect();
  const o = getOffset(el, stage);
  if (!base.height || !o.height) return null;
  const span = paintedClientSpan(el);
  if (!span) return null;
  const scale = base.height / o.height;
  return { top: o.top + (span.top - base.top) / scale, height: span.height / scale };
}
function focusCamera(instant = false) {
  // The transform only frames correctly from a viewport at scroll origin.
  resetViewportScroll();
  if (overview) { applyOverviewCamera(instant); return; }
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  // Layout-space viewport dims: getBoundingClientRect is post-transform
  // (speaker's --stage-scale shrinks it visually) but chunk offsets live
  // in unscaled layout coords, so the math must stay in layout space.
  const vp = vpLayout();
  const { left, top, width, height } = getOffset(entry.el, stage);

  // The open expansion pane. The branch below reads its offsets in stage
  // coordinates, which holds because the pane is always part of the chunk's
  // own layout: under 900px the stylesheet re-flows the grid and stacks it,
  // and deliberately does not lift it out with position: fixed.
  //
  // That used to be the rule, and it was never fixed to the window. The pane
  // lives inside #psiINT-stage, #psiINT-stage carries this very transform, and a fixed
  // descendant of a transformed element is positioned against that element.
  // getOffset walks offsetParent up to the stage, of which such a box has
  // none, so the camera answered with translate(-4320px, -40850px) - the card
  // sat where fixed positioning put it and looked right, while the slide it
  // was supposed to cover was thirty-seven thousand pixels away.
  //
  // There is deliberately no runtime test for it. A position check here could
  // never be false once that rule was gone, and it would not be free: this
  // function is the pointermove handler for stage panning, so getComputedStyle
  // would force a style recalc on every frame of a drag to answer a question
  // with one possible answer. The invariant belongs where it can fail loudly,
  // and test/expansion.mjs holds it twice - the pane is not fixed, and the
  // chunk is still on screen behind it.
  const expPane = (openExp && openExp.chunkIdx === state.activeIdx)
    ? entry.el.querySelector(`.exp-body[data-exp-body="${openExp.expIdx}"]`)
    : null;

  let tx, ty;
  if (annotEditingId === entry.id) {
    // The annotation being typed is a layer over the whole chunk, which
    // takes the slide's height for the duration (the annot-visible rules in
    // runtime/audience.css), so framing it is centring the chunk - whatever its
    // height, because the layer is centred on the chunk and the words are
    // centred in the layer. It used to park the slide a third of the way
    // right to uncover a margin column; that column is now the frame.
    tx = vp.width / 2 - (left + width / 2);
    ty = vp.height / 2 - (top + height / 2);
  } else if (expPane) {
    const bo = getOffset(expPane, stage);
    // An expanded chunk is one composition and the stylesheet says so - the
    // slide's own column on the left, the pane on the right. Centring the
    // pane alone is centring half of it, which slid the words the pane
    // belongs to off the left edge; the room read a card and a cropped
    // sentence. So the horizontal frame is the chunk.
    tx = vp.width / 2 - (left + width / 2);
    // Vertically the pane is what is being read and it can stand taller than
    // the text beside it, so it keeps the centring it always had.
    ty = vp.height / 2 - (bo.top + bo.height / 2);
  } else {
    tx = vp.width / 2 - (left + width / 2);
    // Whether a chunk fits, and where it is centred, are judged on its
    // **content** and not on the chunk box. The box carries the breathing
    // space above the heading - a deliberate part of the design, and about
    // 78 px of it - which must not be charged against the frame. Measured on
    // the tutorial at 1280x800: six chunks whose content was 723-793 px had
    // boxes of 802-872 px, failed this test, took the walk below, had their
    // heads pinned at 5% and hung 2-78 px off the bottom of a frame they fit
    // inside comfortably. --check-fit measures the chunk-content box and had
    // been reporting exactly those as "fits the frame and is positioned
    // outside it"; the two were measuring different boxes, and only one of
    // them was the box a reader sees.
    //
    // The walk branch below still measures the box. A chunk whose *content*
    // overflows is genuinely walked, and the head pin and the foot-following
    // are a pair that has to stay in one coordinate system.
    // A chunk with a dock is framed as a whole: a band takes a grid row of
    // its own, so the content box sits above (or below) the slide's middle
    // by design, and centring it pushed the band off the bottom edge.
    const fitEl = entry.el.hasAttribute('data-dock') || entry.el.hasAttribute('data-has-panel') ? null : entry.el.querySelector('.chunk-content');
    const fit = fitEl ? getOffset(fitEl, stage) : { top, height };
    // The .middle class on the chunk. The box above is the one the reveals will
    // fill, and it is dead-centred already - measured on a keynote, every
    // chunk-content box sat with equal paper above and below it. What the
    // room sees at the opening beat is not that box: a chunk whose reveals
    // arrive downwards paints its first line at the top of a reserve that is
    // still empty, and #drei-jahre opened with one row of type 155 px from
    // the ceiling and 698 px of paper under it.
    //
    // There is no arrangement that both centres every beat and leaves every
    // beat where the last one put it - a stack that grows downwards cannot
    // hold each prefix centred and each row still. So this is opt-in and it
    // chooses centring: the camera frames what is painted now. Nothing in
    // the slide moves relative to anything else in it, the reserved height
    // is untouched, and auto-fit still measures the whole box, so the type
    // is the same size on every beat - the frame glides, on the same 250 ms
    // transition that already follows the foot of a chunk taller than the
    // screen.
    const shownFit = (fitEl && entry.el.hasAttribute('data-middle')) ? paintedSpan(fitEl) : null;
    if (shownFit && shownFit.height <= vp.height) {
      ty = vp.height / 2 - (shownFit.top + shownFit.height / 2);
    } else if (fit.height <= vp.height) {
      ty = vp.height / 2 - (fit.top + fit.height / 2);
    } else {
      // A chunk taller than the frame cannot be framed, so it is walked: its
      // head is pinned near the top edge and stays there.
      //
      // That is right on arrival and wrong from the second beat onwards. A
      // hidden segment takes no space, so revealing one extends the chunk
      // *downwards* while this camera held the head still - and once the
      // chunk passed the height of the frame, forward put the new material
      // below the bottom edge. The lecturer pressed the key and the room saw
      // nothing change: on the tutorial's own reveal chunk the third beat
      // landed 430px below a 900px viewport. So follow the foot down, and
      // never further up than the head pin, which makes the walk reversible -
      // back shortens the chunk and the view rises with it.
      //
      // Both windows have to agree on where the camera is, so this stays a
      // pure function of the shared state: the foot is the chunk's own
      // bottom, which is what the revealed segments measure, and the walk
      // begins only past the opening beat. Arrival at the opening state
      // frames exactly what it framed before.
      const segCount = countSegments(entry.el);
      const shown = revealed[entry.id] ?? (segCount ? 1 : 0);
      const pinHead = vp.height * 0.05 - top;
      ty = (shown > 1) ? Math.min(pinHead, vp.height * 0.95 - (top + height)) : pinHead;
    }
  }

  // The aside, brought in. A ::: marginalia is not lifted into the overlay
  // the way a figure is - it is part of the slide's layout, not something
  // laid over it - so the camera slides sideways instead, far enough that
  // the whole aside is inside the frame and no further. Same shape as the
  // annotation branch above: a state the camera solves for, from where the
  // aside is *now*, so a resize or a zoom re-derives it rather than carrying
  // a stale offset.
  //
  // The minimum move on purpose. The aside was centred in the viewport
  // before, which is a bigger move than the question asks for: it took the
  // sentence the aside belongs to off the left edge, so the room was reading
  // a tangent with nothing to hang it on. Here the slide keeps as much of
  // itself as the aside's overhang allows.
  //
  // The gap on the right is the 2vw the stylesheet already puts between the
  // text column and the aside, so the aside is framed with the same air on
  // both sides.
  if (asidePan && asidePan.chunkId === entry.id && annotEditingId !== entry.id) {
    const mo = getOffset(asidePan.el, stage);
    const gap = vp.width * 0.02;
    const over = (mo.left + mo.width + tx + gap) - vp.width;
    if (over > 0) tx -= over;
  }

  // Manual pan offset from drag (§5: zoom-induced overflow). Reset on chunk change.
  tx += manualPan.dx; ty += manualPan.dy;

  if (instant) stage.style.transition = 'none';
  stage.style.transform = `translate(${tx}px, ${ty}px)`;
  if (instant) requestAnimationFrame(() => { stage.style.transition = ''; });
}

// ── the slide change (transition: pan | cut | fade) ─────────────────
//
// One helper and one rule: everything that changes which chunk is live goes
// through landSlide(), and landSlide() is what decides whether the camera
// glides, lands, or lands inside a fade. There are exactly two callers -
// jumpTo, for a press in this window, and applyRemoteState, for a press in
// the other one - because a third path is how two windows come to show a
// slide change differently.
//
// pan  – the camera glides over --camera-duration. The stage is one
//        continuous column and the room watches the frame travel along it.
// cut  – focusCamera(true), which kills the transition for one frame. The
//        new slide is simply there.
// fade – the stage dips to the paper and comes back, and the camera's jump
//        is taken at the bottom, where nothing is on screen to see it move.
//
// WHY THE DIP AND NOT A TWO-LAYER CROSSFADE, measured rather than argued.
// A cross-dissolve needs the two slides in the same place at the same
// moment, which a continuous column does not give: they are a slide-height
// and a gap apart. Duplicating the stage to get them there was never going
// to be cheap - a second copy of every chunk, every figure and every
// inlined photograph in the deck - but the cheap version of the same idea
// is one line: jump the camera and hand the outgoing chunk the inverse of
// that jump, which puts it back where the room last saw it. That was built
// and its half-way frame shot at 1600x900 beside the dip's. It works, and
// what it paints is two paragraphs of text standing on each other, letter
// through letter, for a sixth of a second - on this tool a slide is dark
// words on pale paper and nothing else, so a dissolve of two of them is a
// double exposure, unreadable in exactly the moment the room is reading.
// The dip's half-way frame is the slide being left, at half strength,
// still legible, on its way out. It also costs one animation on one
// element, and it cannot disagree with focusCamera about where the camera
// is, because it is focusCamera that moves it.
//
// Traced per animation frame in Chromium, the dip is: 130ms of the stage
// falling 1 to 0 with the transform held exactly where it was, one frame at
// 0 in which the transform changes, 130ms back up. No dropped frame and no
// positional motion at any opacity a room can see.
let fadeAnim = null;    // the half in flight
let fadePending = null; // what it still has to do at the bottom
function fadeSwap(land) {
  // No WAAPI, no fade. Nothing here is worth a slide change that never
  // happens.
  if (!stage.animate) { land(); return; }
  // A second press before the first fade has landed must not lose the first
  // one's state change: run it now, and start the new fade from here.
  if (fadePending) { const p = fadePending; fadePending = null; p(); }
  if (fadeAnim) { fadeAnim.cancel(); fadeAnim = null; }
  fadePending = land;
  fadeAnim = stage.animate([{ opacity: 1 }, { opacity: 0 }],
    { duration: FADE_MS / 2, easing: 'ease-in', fill: 'forwards' });
  fadeAnim.onfinish = () => {
    const p = fadePending;
    fadePending = null;
    // The state change and the camera jump, both while the stage is at
    // nothing. land() measures and writes; neither paints, because a paint
    // is a frame away and this is one task.
    if (p) p();
    const rise = stage.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: FADE_MS / 2, easing: 'ease-out' });
    // After the fall is dropped the element has no opacity of its own left,
    // which is what keeps the stage free of an inline style between slides.
    if (fadeAnim) { fadeAnim.cancel(); fadeAnim = null; }
    fadeAnim = rise;
    rise.onfinish = () => { if (fadeAnim === rise) fadeAnim = null; };
  };
}
// Make idx the live chunk, in whatever way this deck changes slides. land()
// carries everything that has to happen at the moment of the change - the
// index, the fit, the paint, the camera - so that a fade can hold all of it
// until the stage is invisible rather than only some of it.
//
// It is also the one place a slide is arrived at, so what every arrival owes
// the slide is done here rather than by each caller: autoplay starts on any
// slide reached by a key here, by a snapshot from the other window, or by
// leaving the overview - it used to start from jumpTo alone, so a figure the
// cockpit drove onto never played.
//
// The slide being left loses its clock here, at the start, and not when the
// new one starts its own at the end: under fade the two are a dip apart, and
// a tick of the old figure inside the dip advanced the slide being left and
// broadcast it. On the projection, landing a cockpit's move, that snapshot
// put the old slide back in the cockpit, and the landing that followed runs
// under isApplyingRemote and sends nothing - the two windows stayed on two
// different slides until the next press.
//
// Only a landing that changes the slide is an arrival for autoplay
// (restartAutoplay's argument): the overview left on the slide it was
// opened on, or a jump to the slide already up, lands too, and neither is a
// way onto the slide.
function landSlide(land) {
  stopAutoplay();
  const from = state.activeIdx;
  const arrive = () => { land(); restartAutoplay(state.activeIdx !== from); };
  if (SLIDE_TRANSITION === 'fade') fadeSwap(arrive);
  else arrive();
}
// A slide change still waiting for the bottom of a fade is done now. Every
// reader of state.activeIdx that is about to act on it calls this first: a
// press within the dip otherwise read the slide being left, so a second
// forward press was lost and a back press reversed the first one. The fade
// itself carries on from where it is.
function settleFade() {
  if (!fadePending) return;
  const p = fadePending;
  fadePending = null;
  p();
}

// Overview camera: translate-and-scale to center the anchor chunk at
// --overview-scale. The anchor is set when overview opens (the active
// chunk) and whenever the selection is moved *by keyboard or search* –
// never by a mouse click, so clicking a thumbnail leaves the stage
// exactly where it is.
function applyOverviewCamera(instant = false) {
  const entry = flatChunks[overviewAnchorIdx] || flatChunks[state.activeIdx];
  if (!entry) return;
  const vp = vpLayout();
  const { left, top, width, height } = getOffset(entry.el, stage);
  const s = overviewScale;
  const tx = vp.width / 2 - (left + width / 2) * s + manualPan.dx;
  const ty = vp.height / 2 - (top + height / 2) * s + manualPan.dy;
  if (instant) stage.style.transition = 'none';
  stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  if (instant) requestAnimationFrame(() => { stage.style.transition = ''; });
}

// Move the overview selection outline. opts.recenter decides whether the
// camera follows: a mouse click must NOT move the stage (the thumbnail
// you clicked has to stay under the cursor), while keyboard selection
// and search-commit do move, because the target can be off screen.
// Recentring re-anchors *and* drops the accumulated drag-pan – leaving
// the old offset in place would shove the freshly centred chunk right
// back out by however far you had dragged.
function setSelectedIdx(idx, opts = {}) {
  if (idx < 0 || idx >= flatChunks.length) return;
  flatChunks.forEach((c, i) => c.el.classList.toggle('overview-selected', i === idx));
  selectedIdx = idx;
  if (!overview) return;
  if (opts.recenter) {
    overviewAnchorIdx = idx;
    manualPan = { dx: 0, dy: 0 };
    applyOverviewCamera(false);
  }
  broadcastPan();
}

// Column-wise selection jump in overview: land on the first chunk of the
// next/previous column. Mirrors nextCol/prevCol, but moves the selection
// rather than the live slide - and that has to include where they stop.
//
// They stand still at the ends now; this went on falling through to the last
// or the first chunk of the whole deck. So the behaviour the key model was
// changed to remove was still reachable, through the board, where the next
// Enter commits it: open the overview in the last column, press Right, press
// Enter, and you are on the final slide of the lecture in front of a room.
// One gesture with two implementations has to agree about its edges, or the
// disagreement is something a lecturer finds by pressing it.
function selectOverviewCol(dir) {
  const cur = flatChunks[selectedIdx];
  if (!cur) return;
  if (dir > 0) {
    for (let i = selectedIdx + 1; i < flatChunks.length; i++) {
      if (flatChunks[i].colIdx > cur.colIdx) return setSelectedIdx(i, { recenter: true });
    }
    return;
  }
  for (let i = selectedIdx - 1; i >= 0; i--) {
    if (flatChunks[i].colIdx < cur.colIdx) {
      let j = i;
      while (j > 0 && flatChunks[j - 1].colIdx === flatChunks[i].colIdx) j--;
      return setSelectedIdx(j, { recenter: true });
    }
  }
}

// Single entry point for entering/leaving overview, used by both the
// local hotkeys and applyRemoteState. Idempotent, so re-applying an
// unchanged remote flag costs nothing.
//   opts.landOnSelected – on exit, make the selected chunk the live one
//                         (O lands, Esc keeps the original)
//   opts.selectActive   – on entry, seed the selection from activeIdx.
//                         Off for remote applies, where the payload's
//                         own selectedIdx/anchor land right afterwards.
function setOverviewMode(on, opts = {}) {
  if (!!on === overview) return;
  // The board opens on the live slide and lands against it, so a slide
  // change still in its dip is finished first.
  settleFade();
  if (on) {
    overview = true;
    document.body.classList.add('overview-mode');
    manualPan = { dx: 0, dy: 0 };
    overviewAnchorIdx = state.activeIdx;
    if (opts.selectActive !== false) setSelectedIdx(state.activeIdx);
    // The board shows every slide, so the zoom the live one shows reaches
    // them all now rather than at the catch-up (showZoom).
    flushZoom();
    applyOverviewCamera(false);
    return;
  }
  endSearch();
  overview = false;
  document.body.classList.remove('overview-mode');
  manualPan = { dx: 0, dy: 0 };
  flatChunks.forEach(c => c.el.classList.remove('overview-selected'));
  // Landing on the selected slide is a slide change like any other, so it
  // goes through jumpTo: it used to assign the index and repaint, which
  // skipped auto-fit, the open expansion, the reveal of a slide never seen
  // and autoplay - O, Enter, a click on the board and G all came this way.
  // The direction is the one G uses outside the overview.
  if (opts.landOnSelected && selectedIdx !== state.activeIdx) {
    jumpTo(selectedIdx, selectedIdx > state.activeIdx ? 'forward' : 'back');
    return;
  }
  focusCamera(false);
}

// Local (user-driven) transitions broadcast a full snapshot, which is
// what carries the overview flag to the peer in both directions.
function exitOverview(landOnSelected) {
  if (!overview) return;
  setOverviewMode(false, { landOnSelected });
  broadcastState();
}

function toggleOverview() {
  setOverviewMode(!overview, { landOnSelected: true });
  broadcastState();
}

function dismissOverviewNoMove() { exitOverview(false); }

// TOC panel – flat list of named columns (see renderAudience).
function toggleToc() {
  tocVisible = !tocVisible;
  document.body.classList.toggle('toc-visible', tocVisible);
  if (tocVisible) markTocActive();
}
function markTocActive() {
  const curColIdx = flatChunks[state.activeIdx]?.colIdx;
  document.querySelectorAll('#psiINT-toc li').forEach(li => {
    li.classList.toggle('toc-active', parseInt(li.dataset.tocCol, 10) === curColIdx);
  });
}
function jumpToColumn(colIdx) {
  settleFade();
  const idx = flatChunks.findIndex(c => c.colIdx === colIdx);
  if (idx >= 0) jumpTo(idx, idx < state.activeIdx ? 'back' : 'forward');
}

// Fulltext search (PRD §5) – active only in overview. Each keystroke filters
// chunks: matches get a highlight outline, non-matches fade to 0.1 opacity.
const searchInput = document.getElementById('psiINT-search-input');
// Search is a hit list, not only a highlight on the board. Highlighting
// alone assumed the reader was looking at the overview and could see where
// the match was; most matches are off screen, and in a long lecture the
// useful question is "which slide says this", which a list answers and a
// fade does not. It opens from anywhere for the same reason: needing to be
// in overview first made it useless as the mid-lecture jump tool it is.
const searchPanel = document.getElementById('psiINT-search-panel');
const searchResults = document.getElementById('psiINT-search-results');
let searchHits = [];
let searchCursor = 0;
let searchIndex = null;

function escText(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  ));
}

// Built once. Reading textContent per keystroke over a 36-chunk lecture is
// cheap, but the heading/tag split is not, and it never changes.
function buildSearchIndex() {
  searchIndex = flatChunks.map((c, idx) => {
    const headEl = c.el.querySelector('.chunk-heading');
    // Read the tag off the element, not off a rendered label: the live
    // views stopped printing the eyebrow, and the search list is exactly
    // the place where naming the kind of slide is still useful.
    const tagName = c.el.dataset.tag && c.el.dataset.tag !== 'free' ? c.el.dataset.tag : '';
    const bodyEl = c.el.querySelector('.chunk-body');
    const mainEl = c.el.querySelector('.chunk-heading .hd-main');
    const subEl = c.el.querySelector('.chunk-heading .hd-sub');
    // A column divider is a chunk (flatChunks navigates to it) but wears
    // .section-heading rather than .chunk-heading, so the three selectors
    // above find nothing on it and every divider used to sit in the index
    // as "(untitled)" with an empty body. Searching a lecture for the name
    // of one of its own parts then found nothing, which is the one search
    // a reader is most likely to try first.
    // On an outline divider the heading is not set beside the list, it IS
    // the list's current item, so that is what the index has to read.
    const secHeadEl = c.el.querySelector('.section-heading')
      || c.el.querySelector('.section-outline li[aria-current] .so-text');
    const secBodyEl = c.el.querySelector('.section-body');
    const clean = (n) => (n ? n.textContent : '').replace(/\s+/g, ' ').trim();
    // The body has to be cleaned on a copy: an inlined SVG carries its own
    // style block, and textContent hands back the CSS rules as if they were
    // prose. Searching for a word then hit slides whose figure merely
    // mentioned it in a selector. Labels inside the drawing stay indexed,
    // which is the part worth searching.
    const cleanBody = (n) => {
      if (!n) return '';
      const copy = n.cloneNode(true);
      copy.querySelectorAll('style, script').forEach((s) => s.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    };
    const title = clean(mainEl) || clean(headEl) || clean(secHeadEl);
    const sub = mainEl ? clean(subEl) : '';
    const body = cleanBody(bodyEl) || cleanBody(secBodyEl);
    return {
      idx,
      tag: tagName,
      title: title || '(untitled)',
      sub,
      body,
      hay: (title + ' ' + sub + ' ' + body).toLowerCase(),
    };
  });
}

// A snippet centred on the match, so the reader sees the sentence rather
// than the slide title alone.
function contextFor(entry, q) {
  const lower = entry.body.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) return '';
  const start = Math.max(0, at - 45);
  const end = Math.min(entry.body.length, at + q.length + 75);
  const pre = (start > 0 ? '…' : '') + entry.body.slice(start, at);
  const hit = entry.body.slice(at, at + q.length);
  const post = entry.body.slice(at + q.length, end) + (end < entry.body.length ? '…' : '');
  return escText(pre) + '<mark>' + escText(hit) + '</mark>' + escText(post);
}

function startSearch() {
  if (!searchIndex) buildSearchIndex();
  searchActive = true;
  document.body.classList.add('search-active');
  searchPanel.classList.remove('hidden');
  searchInput.value = '';
  searchHits = [];
  searchCursor = 0;
  renderSearchResults('');
  searchInput.focus();
}

function endSearch() {
  if (!searchActive) return;
  searchActive = false;
  document.body.classList.remove('search-active');
  searchPanel.classList.add('hidden');
  searchInput.blur();
  searchInput.value = '';
  searchHits = [];
  flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
}

// ── go to a slide by its number (G) ──────────────────────────────────
//
// The number is the one the corner badge shows, which is data-chunk-num:
// authored chunks counted straight through the deck, dividers left out
// because they are inserted by the build rather than written. The printed
// document and the cockpit's list count the same way, so what a lecturer
// reads anywhere is what they type here - and reading it off the DOM rather
// than recomputing it is what keeps that true if the counting ever changes.
//
// Everything inside the prompt is reached through gotoRoot, never through
// getElementById.
const gotoRoot = document.getElementById('psiINT-goto-prompt');
const gotoDigitsEl = gotoRoot.querySelector('.goto-digits');
const gotoOfEl = gotoRoot.querySelector('.goto-of');
let gotoActive = false;
let gotoTyped = '';
let gotoNums = null;

// number -> index into flatChunks. Built once; the badge numbers are
// rendered at build time and nothing moves them.
function gotoMap() {
  if (gotoNums) return gotoNums;
  gotoNums = new Map();
  flatChunks.forEach((c, idx) => {
    const n = parseInt(c.el.dataset.chunkNum || '', 10);
    if (n > 0 && !gotoNums.has(n)) gotoNums.set(n, idx);
  });
  return gotoNums;
}
function gotoLast() {
  let max = 0;
  gotoMap().forEach((idx, n) => { if (n > max) max = n; });
  return max;
}

function gotoPaint() {
  const last = gotoLast();
  gotoDigitsEl.textContent = gotoTyped || '–';
  gotoOfEl.textContent = 'of ' + last;
}

function startGoto() {
  if (gotoActive) return;
  gotoActive = true;
  gotoTyped = '';
  gotoPaint();
  gotoRoot.classList.remove('hidden');
}

function endGoto() {
  if (!gotoActive) return;
  gotoActive = false;
  gotoTyped = '';
  gotoRoot.classList.add('hidden');
  gotoRoot.classList.remove('goto-refused');
}

// A number the deck does not have is refused where it was typed. The class
// has to come off before it can go on again, or a second wrong number in a
// row would be silent.
function gotoRefuse() {
  gotoRoot.classList.remove('goto-refused');
  void gotoRoot.offsetWidth;
  gotoRoot.classList.add('goto-refused');
}

function gotoCommit() {
  const idx = gotoTyped ? gotoMap().get(parseInt(gotoTyped, 10)) : undefined;
  if (idx === undefined) { gotoRefuse(); return; }
  endGoto();
  settleFade();
  // The same landing a click in the contents or a committed search hit uses,
  // so the broadcast, the cue-card cursor, auto-fit and the stored position
  // all see an ordinary jump and nothing here has to know about any of them.
  if (overview) {
    setSelectedIdx(idx, { recenter: true });
    exitOverview(true);
  } else if (idx !== state.activeIdx) {
    jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
  }
}

// While the prompt is open it owns the keyboard: Space would advance the
// deck and N would open an annotation, so every key is spent here whether
// the prompt has a use for it or not.
function gotoKey(e) {
  const k = e.key;
  if (k === 'Escape') { endGoto(); e.preventDefault(); return; }
  if (k === 'Enter') { gotoCommit(); e.preventDefault(); return; }
  if (k === 'Backspace') {
    gotoTyped = gotoTyped.slice(0, -1);
    gotoPaint();
    e.preventDefault(); return;
  }
  if (k.length === 1 && k >= '0' && k <= '9') {
    // Four digits is more slides than any deck here has, and the cap stops
    // a held key from growing a number nothing can match.
    if (gotoTyped.length < 4) gotoTyped += k;
    gotoPaint();
    e.preventDefault(); return;
  }
  if (k === 'Shift' || k === 'Alt' || k === 'Control' || k === 'Meta') return;
  e.preventDefault();
}

function renderSearchResults(q) {
  if (!q) {
    searchResults.innerHTML = '<li class="sr-empty">type to search headings and body text</li>';
    return;
  }
  if (!searchHits.length) {
    searchResults.innerHTML = '<li class="sr-empty">no slide matches ' + escText(q) + '</li>';
    return;
  }
  searchResults.innerHTML = searchHits.map((entry, i) => {
    const tag = entry.tag ? '<span class="sr-tag">' + escText(entry.tag) + '</span>' : '';
    const ctx = contextFor(entry, q);
    const sub = entry.sub ? '<span class="sr-sub">' + escText(entry.sub) + '</span>' : '';
    return '<li role="option" data-hit="' + i + '" aria-selected="' + (i === searchCursor) + '">'
      + '<span class="sr-title">' + tag + escText(entry.title) + sub + '</span>'
      + (ctx ? '<span class="sr-context">' + ctx + '</span>' : '')
      + '</li>';
  }).join('');
  const sel = searchResults.querySelector('[aria-selected=true]');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function updateSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchHits = [];
    searchCursor = 0;
    flatChunks.forEach(c => c.el.classList.remove('search-match', 'search-miss'));
    renderSearchResults('');
    return;
  }
  searchHits = searchIndex.filter(e => e.hay.includes(q));
  searchCursor = 0;
  const hitIdx = new Set(searchHits.map(e => e.idx));
  // Keep the board dimming too: when the panel is open over the overview,
  // the two reinforce each other.
  flatChunks.forEach((c, i) => {
    c.el.classList.toggle('search-match', hitIdx.has(i));
    c.el.classList.toggle('search-miss', !hitIdx.has(i));
  });
  renderSearchResults(q);
  followSearchCursor();
}

// Move the board selection along with the highlighted hit, so a match that
// is off screen becomes visible while the reader is still typing.
function followSearchCursor() {
  if (!overview) return;
  const hit = searchHits[searchCursor];
  if (hit) setSelectedIdx(hit.idx, { recenter: true });
}

function moveSearchCursor(delta) {
  if (!searchHits.length) return;
  searchCursor = (searchCursor + delta + searchHits.length) % searchHits.length;
  renderSearchResults(searchInput.value.trim().toLowerCase());
  followSearchCursor();
}

function commitSearchHit() {
  const hit = searchHits[searchCursor];
  endSearch();
  if (!hit) return;
  settleFade();
  if (overview) {
    setSelectedIdx(hit.idx, { recenter: true });
    exitOverview(true);
  } else if (hit.idx !== state.activeIdx) {
    jumpTo(hit.idx, hit.idx > state.activeIdx ? 'forward' : 'back');
  }
}

// Nav
function jumpTo(idx, direction) {
  if (idx < 0 || idx >= flatChunks.length) return;
  endStartMenu();
  settleFade();
  if (annotEditingId) blurAnnotation();
  // Moving on retires the address: it belonged to the slide you left.
  dismissLinkOverlay();
  if (focusedFigure) unfocusFigure();
  closeAnyExpansion();
  // Reset drag pan on chunk change – pan is per-chunk inspection.
  manualPan = { dx: 0, dy: 0 };
  // Same for a brought-in aside: it belonged to the slide being left.
  clearAsidePan();

  const target = flatChunks[idx];
  const segCount = countSegments(target.el);
  if (revealed[target.id] === undefined) {
    // First visit from any direction – show only the opening segment.
    // Backward nav only "re-reveals everything" when we're genuinely
    // returning to a chunk that's already been advanced; a chunk we've
    // never seen before should present itself fresh even if approached
    // from ahead in the reading order.
    revealed[target.id] = segCount ? 1 : 0;
  } else if (direction === 'back') {
    // Revisit via backward nav: show fully revealed (§4.6).
    revealed[target.id] = segCount;
  }
  // Forward revisit: preserve whatever state it was in.
  applyReveal(target.el, target.id);

  // Everything from here is the slide change itself, so it goes through
  // landSlide: under fade the whole of it waits for the bottom of the dip,
  // and under cut the camera lands rather than glides. applyReveal above
  // is deliberately outside it - it dresses the chunk being arrived at,
  // which is off the frame either way, and doing it early means the slide
  // the fade uncovers is already finished.
  landSlide(() => {
    state.activeIdx = idx;
    if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
    else clampZoomToWidth();
    applyState();
    focusCamera(SLIDE_TRANSITION !== 'pan');
    saveActive();
  });
}

// A fragment in the address is an explicit request for one chunk, so it
// has to select it, not merely let the browser scroll the document to it:
// without this the deck stayed wherever its state was, the addressed chunk
// sat at the inactive opacity, and the first arrow key jumped away from it.
// It also outranks the position recovered from localStorage – the reader
// followed or typed that address, the stored index is only where they
// happened to stop last time.
function chunkIdxFromHash() {
  const raw = (location.hash || '').slice(1);
  if (!raw) return -1;
  let id = raw;
  try { id = decodeURIComponent(raw); } catch (e) {}
  return flatChunks.findIndex(c => c.id === id);
}
window.addEventListener('hashchange', () => {
  // Every caller below that compares a target with state.activeIdx lands a
  // pending fade first: a target equal to the slide being left read as
  // "already here" and the fade then went on to the other one.
  settleFade();
  const idx = chunkIdxFromHash();
  if (idx < 0 || idx === state.activeIdx) return;
  jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
});

function advanceReveal() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  const segCount = countSegments(entry.el);
  const cur = revealed[entry.id] ?? (segCount ? 1 : 0);
  if (cur < segCount) {
    revealed[entry.id] = cur + 1;
    applyReveal(entry.el, entry.id);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    return true;
  }
  return false;
}

// A revealed segment is content arriving on a slide that is already on
// screen. Every other change of that kind re-solves both the zoom and the
// camera - jumpTo, the zoom keys, the auto-fit toggle, a window resize - and
// reveal re-solved neither, which is one omission with two faces:
//
//   - in auto-fit the chunk was sized to its opening segment and the rest
//     grew off the bottom of the screen, 129px of a tutorial chunk, with
//     nothing on either screen saying so;
//   - in both modes the camera held still while the chunk grew downwards,
//     so on a chunk already taller than the frame the new material landed
//     below the bottom edge and the key press did nothing the room could
//     see. focusCamera's walking branch is the other half of this fix.
//
// It runs before broadcastState, so the peer receives the zoom this window
// settled on rather than the one it is about to leave.
//
// The zoom half is auto-fit only: outside it the zoom is the lecturer's and
// is never touched automatically (clampZoomToWidth is the one exception, and
// it already runs per chunk). The camera half is not - a camera that frames
// the wrong part of the slide is wrong in either mode.
//
// Deliberately not called for an opened ::: expand or an annotation box:
// those shift the camera to bring a panel into view and change nothing about
// the slide's own content, which is why both already have their own branch
// in focusCamera and neither should resize anything.
function resettleAfterReveal() {
  autoFitNow();
  focusCamera(false);
}

// ── ::: draw autoplay ──
// A figure written with autoplay N walks its own steps once the slide is on
// screen. It calls advanceReveal(), so it IS the Space key on a timer:
// one counter, one broadcast, one freeze gate, and the speaker view follows
// without knowing this exists.
//
// The audience is the state root, so only the audience runs the clock -
// two windows both advancing would take two beats per tick. And the first
// deliberate act stops it for good: a lecturer who has touched the deck has
// taken over, and a timer resuming underneath them is worse than no timer.
let autoplayTimer = 0;
// The chunk the lecturer took over on, and it is a chunk id rather than a
// boolean for a reason that made the feature unusable. Taking over is an act
// on *this slide*; but you reach a slide by pressing a key, and a
// session-wide flag was therefore set by the very keypress that navigated to
// the figure, before it was on screen. Measured: jumping by address played
// the figure, one arrow key anywhere killed it for the rest of the session -
// so autoplay only ever ran on a slide a deck happened to open on. Scoped to
// the chunk, the arrival key belongs to the slide being left.
//
// It lasts until the slide is left. An arrival clears it (restartAutoplay),
// because leaving and coming back is how a lecturer asks for the figure
// again; a key did that already, by charging the slide it left, but a move
// from the cockpit presses no key here, so a figure taken over once from the
// cockpit stayed stopped on every later visit of the session.
let autoplayStoppedOn = null;
function stopAutoplay() {
  if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = 0; }
}
// arriving: the slide has just become the live one (landSlide, or the boot).
// Everything else that restarts the clock is on a slide already up.
function restartAutoplay(arriving) {
  stopAutoplay();
  if (VIEW !== 'audience') return;
  if (arriving) autoplayStoppedOn = null;
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const fig = entry.el.querySelector('[data-autoplay]');
  if (!fig) return;
  const ms = Number(fig.dataset.autoplay);
  if (!ms) return;
  const segCount = countSegments(entry.el);
  if (autoplayStoppedOn === entry.id) return;
  const cycle = fig.hasAttribute('data-autoplay-cycle');
  // Only from the opening beat. Arriving at a half-revealed slide means the
  // lecturer left it that way, and finishing it for them is the surprise
  // this feature must not spring.
  //
  // Except for a cycle. A loop has no half-revealed state worth keeping -
  // it is a break slide, a cover while the room fills - and it is never at
  // its opening beat on a second visit: clicked through once in rehearsal,
  // walked off from its last step, or reached backwards, which shows a
  // slide fully revealed. Measured on a break slide, autoplay then did
  // nothing on every arrival after the first. So arriving at a cycle
  // rewinds it to the opening beat and starts the clock there, through the
  // same counter and broadcast the walk uses, and the cockpit follows.
  if ((revealed[entry.id] ?? 0) > 1) {
    if (!(cycle && arriving)) return;
    revealed[entry.id] = 1;
    applyReveal(entry.el, entry.id, true);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
  }
  const tick = () => {
    autoplayTimer = 0;
    if (autoplayStoppedOn === entry.id) return;
    if (flatChunks[state.activeIdx] !== entry) return;
    if (advanceReveal()) {
      if ((revealed[entry.id] ?? 0) < segCount) autoplayTimer = setTimeout(tick, ms);
      else if (cycle) autoplayTimer = setTimeout(tick, ms);
      return;
    }
    // advanceReveal said no, so we are at the last beat. Cycling rewinds
    // to the opening one through the same counter everything else reads,
    // so the speaker view follows the rewind exactly as it followed the
    // walk. The last beat is held for one delay like any other: a second
    // number for "how long to admire the finished picture" is a knob
    // nobody asked for and one more thing to get wrong.
    if (!cycle) return;
    revealed[entry.id] = 1;
    applyReveal(entry.el, entry.id);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    autoplayTimer = setTimeout(tick, ms);
  };
  if (segCount > 1) autoplayTimer = setTimeout(tick, ms);
}
// Any deliberate input retires the clock. Capture phase and passive, so it
// sees the event whatever else handles it and never delays one.
// Capture phase, and that is load-bearing here as well as for not delaying an
// event: the key that moves to the next slide is seen while state.activeIdx is
// still the slide being left, so the take-over is recorded against that one
// and not against the slide about to arrive. The navigation handler runs in
// the bubble phase, after this.
for (const ev of ['keydown', 'pointerdown', 'wheel']) {
  window.addEventListener(ev, () => {
    const cur = flatChunks[state.activeIdx];
    if (!cur || autoplayStoppedOn === cur.id) return;
    autoplayStoppedOn = cur.id;
    stopAutoplay();
  }, { capture: true, passive: true });
}

// The mirror of advanceReveal, and it costs nothing but the counter: every
// beat's state is recomputed from revealed[id] on each applyReveal, and
// dgStep renders any step in either direction. Reveal was forward-only
// because the *keys* were, never because the mechanism was.
function retreatReveal() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  const segCount = countSegments(entry.el);
  const cur = revealed[entry.id] ?? (segCount ? 1 : 0);
  if (cur > 1) {
    revealed[entry.id] = cur - 1;
    applyReveal(entry.el, entry.id);
    resettleAfterReveal();
    updateNavHints();
    broadcastState();
    return true;
  }
  return false;
}

// One forward family and one backward family, the way a presentation tool is
// expected to behave: perform the slide, then move to the next one. Every one
// of those keys means the same thing on every slide, which is what makes the
// model teachable in a sentence.
//
// Columns are the one thing psi-slides has that a linear deck does not, and
// they used to be reached by giving the sideways arrows a second meaning on
// the first chunk of a column - so a key meant one thing here and another
// there, and two marks at the viewport edge existed to say which. Now they
// are Shift and the same arrows, from anywhere. A modifier that always means
// the same thing needs nothing on screen to announce it, so the two marks
// are gone; the one below, which says where forward will *take* you rather
// than what it means, stays.
// An opened card is a stage of its own on the way through a chunk, the way
// a revealed segment is. Esc already treated it that way; the arrow keys did
// not, and the press that ran out of beats fell straight through to
// nextChunk() - whose jumpTo closes the card on its way past. So one key
// took the figure off the screen AND changed the slide, on a slide the
// lecturer was very often still talking about, and it took two windows with
// it. Closing the card first costs one extra press and gives the chunk back.
function unfocusAsStage() {
  if (!focusedFigure) return false;
  unfocusFigure();
  if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
  return true;
}
function goForward() {
  viewHooks.onPress(false);
  endStartMenu();
  settleFade();
  if (viewHooks.consumeForward()) return;
  if (advanceReveal() || unfocusAsStage()) { viewHooks.onStateChange(); return; }
  nextChunk();
}
function goBack() {
  viewHooks.onPress(false);
  endStartMenu();
  settleFade();
  if (viewHooks.consumeBack()) return;
  if (retreatReveal() || unfocusAsStage()) { viewHooks.onStateChange(); return; }
  prevChunk();
}

// Where the columns begin and end. colLast is what the down mark reads;
// colFirst is what prevCol uses to decide between rewinding to the head of
// this column and leaving for the one before it.
//
// There used to be a third field here, sideways, saying whether the arrow
// keys changed column on this chunk - a per-chunk fact, because they only did
// so on the head of one. Both the key map and the marks read it, deliberately,
// so that a mark could never promise a move the key would not make. Shift
// makes the question disappear rather than answering it: nextCol and prevCol
// clamp on their own, so there is nothing left for a predicate to guard.
function markColumnEdges() {
  flatChunks.forEach((c, i) => {
    const prev = flatChunks[i - 1], next = flatChunks[i + 1];
    c.colFirst = !prev || prev.colIdx !== c.colIdx;
    c.colLast = !next || next.colIdx !== c.colIdx;
  });
}

function nextChunk() {
  settleFade();
  if (state.activeIdx + 1 >= flatChunks.length) return;
  jumpTo(state.activeIdx + 1, 'forward');
}
function prevChunk() {
  settleFade();
  if (state.activeIdx <= 0) return;
  jumpTo(state.activeIdx - 1, 'back');
}
// Both column keys stand still when there is no column that way, the same
// rule nextChunk and prevChunk follow at the two ends of the deck. nextCol
// used to fall back to the last chunk of the lecture instead. That was nearly
// unreachable while the key existed only on a column head with a column to
// the right of it - a guard in the key map made sure of it, and that guard is
// what the marks at the edge were drawn from. Shift reaches it from every
// slide in the last column, so the fallback would now be one keystroke from
// the end of the lecture, in front of a room.
//
// Both read state.activeIdx to find the target, so a pending fade is landed
// first (settleFade): two quick presses otherwise both counted from the
// column being left and moved one column between them.
function nextCol() {
  settleFade();
  const cur = flatChunks[state.activeIdx];
  for (let i = state.activeIdx + 1; i < flatChunks.length; i++) {
    if (flatChunks[i].colIdx > cur.colIdx) return jumpTo(i, 'forward');
  }
}
function prevCol() {
  settleFade();
  const cur = flatChunks[state.activeIdx];
  const target = cur.colIdx;
  // jump to the first chunk of the previous column (or first chunk of current
  // column if we're not on it, so users can quickly rewind to the column head).
  let firstOfCur = state.activeIdx;
  while (firstOfCur > 0 && flatChunks[firstOfCur - 1].colIdx === target) firstOfCur--;
  if (state.activeIdx !== firstOfCur) return jumpTo(firstOfCur, 'back');
  for (let i = state.activeIdx - 1; i >= 0; i--) {
    if (flatChunks[i].colIdx < target) {
      // walk back to the head of that column
      let j = i;
      while (j > 0 && flatChunks[j - 1].colIdx === flatChunks[i].colIdx) j--;
      return jumpTo(j, 'back');
    }
  }
}

// Expansions
function closeAnyExpansion() {
  if (!openExp) return;
  const entry = flatChunks[openExp.chunkIdx];
  if (entry) {
    entry.el.classList.remove('expanded');
    entry.el.querySelectorAll('.exp-chev, .exp-body').forEach(x => x.classList.remove('on'));
  }
  openExp = null;
}
function toggleExp(chunkIdx, expIdx) {
  // It makes chunkIdx the live chunk without jumpTo, so a fade still on its
  // way to another slide must land first or it would land over this.
  settleFade();
  const entry = flatChunks[chunkIdx];
  if (!entry) return;
  const chev = entry.el.querySelector(`.exp-chev[data-exp="${expIdx}"]`);
  const body = entry.el.querySelector(`.exp-body[data-exp-body="${expIdx}"]`);
  if (!chev || !body) return;
  const same = openExp && openExp.chunkIdx === chunkIdx && openExp.expIdx === expIdx;
  closeAnyExpansion();
  if (!same) {
    chev.classList.add('on');
    body.classList.add('on');
    entry.el.classList.add('expanded');
    openExp = { chunkIdx, expIdx };
  }
  state.activeIdx = chunkIdx;
  applyState();
  requestAnimationFrame(() => requestAnimationFrame(() => focusCamera(false)));
}

// Annotations
function autosize(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, parseFloat(getComputedStyle(ta).lineHeight || 20)) + 'px';
}

// ── the annotation being typed is the slide ─────────────────────────
// While a chunk carries .annot-visible its annotation box is a layer over
// the frame (the CSS beside .annot-box), and these set the three custom
// properties that layer is drawn from. Everything is derived from the text,
// so the two windows agree without a field in the snapshot: the peer gets
// the keystrokes it already got and runs the same arithmetic.
//
// The size is one rule, not a short/long switch: the largest type at which
// the longest line stands in 85% of the frame and every line in its height,
// capped at three times the slide's own size. A word lands on the cap, a
// sentence is held by the width, ASCII art by its longest line, a long note
// by the height. Below 0.35 of the slide's type the lines wrap instead of
// shrinking further - a note that long is the signal that it is too long.
// The face is monospace, and that is what makes this arithmetic rather than
// measurement: the width of a line is its length times one advance, read
// once from the face itself.
//
// The block is exactly as wide as its longest line, so one line is centred
// and several stand left-aligned - the same rule, no line count to test.
const ANNOT_LH = 1.3;           // the line-height the stage rule sets
const ANNOT_CAP = 3;            // in slide type sizes
const ANNOT_FLOOR = 0.35;
const ANNOT_QR_MIN = 0.2;       // of the frame's height; smaller does not scan from the back row
const ANNOT_QR_MAX = 0.5;
let annotCharEm = { font: '', em: 0 };
function annotCharWidth(box, font) {
  if (annotCharEm.font === font && annotCharEm.em) return annotCharEm.em;
  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(40);
  // offsetWidth, not a bounding rect: the speaker's stage is scaled and a
  // rect would report the scaled width against an unscaled font size.
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;font-size:100px';
  box.appendChild(probe);
  annotCharEm = { font, em: probe.offsetWidth / 40 / 100 };
  probe.remove();
  return annotCharEm.em;
}
// The last http(s) address in the text, trailing punctuation dropped. The
// last one because that is the one just typed, and because the choice has
// to come from the text: a cursor position travels to nobody.
function annotUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/g);
  return m ? m[m.length - 1].replace(/[.,;:!?)\]]+$/, '') : null;
}
// Same encoder, level, byte function and quiet zone as the build's qrSvg;
// the library's own SVG writer, because size is not the concern here that
// it is in a file every link of the lecture is inlined into. An address the
// largest symbol cannot hold (the library throws a string past ~2.3 KB at
// level M) is no code rather than an exception out of the input handler -
// that would have stopped the keystroke from reaching the peer and the
// draft from reaching localStorage until the address was shortened.
function liveQrSvg(url) {
  if (typeof qrcode !== 'function') return '';
  try {
    qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
  } catch (e) {
    return '';
  }
}
function fitAnnotation(entry) {
  if (!entry || !entry.el.classList.contains('annot-visible')) return;
  const box = entry.el.querySelector('.annot-box');
  const ta = box && box.querySelector('.annot-textarea');
  if (!ta) return;
  const cs = getComputedStyle(box);
  const W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const base = parseFloat(getComputedStyle(entry.el).fontSize) * state.zoom;
  const cw = annotCharWidth(box, cs.fontFamily);
  const lines = (ta.value || ta.placeholder || ' ').split('\n');
  const chars = Math.max(1, ...lines.map(l => l.length)) + 1;   // one for the caret
  const url = annotUrl(ta.value);
  const maxW = W;                 // 85% of the frame: the layer's own padding
  const textRoom = url ? H * (1 - ANNOT_QR_MIN) - gap : H;
  let fs = Math.min(base * ANNOT_CAP, maxW / (chars * cw), textRoom / (lines.length * ANNOT_LH));
  fs = Math.max(fs, base * ANNOT_FLOOR);
  const w = Math.min(maxW, chars * cw * fs);
  // At the floor a line may be longer than the block and wraps; count the
  // rows it takes rather than measure them, so a size transition in flight
  // cannot be read back as the height.
  const perRow = Math.max(1, Math.floor(w / (cw * fs)));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perRow)), 0);
  const textH = rows * ANNOT_LH * fs;
  box.style.setProperty('--annot-fs', fs + 'px');
  box.style.setProperty('--annot-w', w + 'px');
  ta.style.height = textH + 'px';
  const qrEl = box.querySelector('.annot-qr');
  if (!qrEl) return;
  if ((qrEl.dataset.url || '') !== (url || '')) {
    qrEl.innerHTML = url ? liveQrSvg(url) : '';
    qrEl.dataset.url = url || '';
  }
  if (url) {
    const side = Math.max(H * ANNOT_QR_MIN, Math.min(H * ANNOT_QR_MAX, H - textH - gap));
    box.style.setProperty('--annot-qr', side + 'px');
  }
}
// Back to the margin note: the layer's properties go, and the textarea is
// sized by its content again rather than by the arithmetic above.
function annotRest(entry) {
  if (!entry) return;
  entry.el.classList.remove('annot-visible');
  const box = entry.el.querySelector('.annot-box');
  if (box) ['--annot-fs', '--annot-w', '--annot-qr'].forEach(p => box.style.removeProperty(p));
  autosize(entry.el.querySelector('.annot-textarea'));
}
function startAnnotate(chunkId) {
  const entry = flatChunks.find(c => c.id === chunkId);
  if (!entry) return;
  const ta = entry.el.querySelector('.annot-textarea');
  if (!ta) return;
  settleFade();
  entry.el.classList.add('annot-visible', 'has-annot');
  state.activeIdx = flatChunks.indexOf(entry);
  applyState();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function blurAnnotation() {
  if (!annotEditingId) return;
  const entry = flatChunks.find(c => c.id === annotEditingId);
  if (entry) {
    const ta = entry.el.querySelector('.annot-textarea');
    if (ta) ta.blur();
  }
}
function wireAnnotations() {
  flatChunks.forEach(({ el, id }) => {
    const ta = el.querySelector('.annot-textarea');
    if (!ta) return;
    // Source-authored annotation is baked into ta.defaultValue by the
    // server render; a localStorage draft (if any) wins. An explicit
    // empty-string draft is honored – the lecturer deliberately cleared.
    if (id in annotations) ta.value = annotations[id];
    if (ta.value.trim()) el.classList.add('has-annot');
    autosize(ta);
    ta.addEventListener('input', () => {
      annotations[id] = ta.value;
      // Under the layer the height is fitAnnotation's; autosize would force
      // a layout only to be overwritten.
      if (el.classList.contains('annot-visible')) fitAnnotation(flatChunks.find(c => c.id === id));
      else autosize(ta);
      el.classList.toggle('has-annot', !!ta.value.trim());
      saveAnnotations();
      broadcastState();
    });
    ta.addEventListener('focus', () => {
      annotEditingId = id;
      el.classList.add('annot-visible');
      fitAnnotation(flatChunks.find(c => c.id === id));
      requestAnimationFrame(() => requestAnimationFrame(() => focusCamera(false)));
      // Tell the peer so it can raise its box opacity and mirror the pan.
      broadcastState();
    });
    ta.addEventListener('blur', () => {
      if (annotEditingId === id) annotEditingId = null;
      annotRest(flatChunks.find(c => c.id === id));
      setTimeout(() => focusCamera(false), 20);
      // Signals the peer to drop .annot-visible and pan back to center.
      broadcastState();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { ta.blur(); e.preventDefault(); }
    });
  });
}

function wireClicks() {
  flatChunks.forEach((entry, idx) => {
    entry.el.addEventListener('click', (ev) => {
      // Before the overview branch, because a selection gesture is not a
      // decision about where to be in either mode: a drag across an
      // inactive chunk otherwise navigates to it on release, and the
      // highlight the lecturer just made goes with the camera.
      if (gestureSelects(ev)) return;
      // Overview: a click is a decision, so it lands on the slide and
      // leaves the board in one gesture. A drag is not a click – the
      // pointerdown handler swallows the synthesized click past a 3px
      // move threshold, so panning the board still never navigates.
      if (overview) { setSelectedIdx(idx, { recenter: false }); exitOverview(true); return; }
      if (ev.target.closest('.annot-textarea')) return;
      if (ev.target.closest('[data-annot-add]')) { startAnnotate(entry.id); return; }
      if (ev.target.closest('.annot-box')) { startAnnotate(entry.id); return; }
      const chev = ev.target.closest('[data-exp]');
      if (chev) { toggleExp(idx, parseInt(chev.dataset.exp, 10)); return; }
      if (annotEditingId === entry.id) { blurAnnotation(); return; }
      // Back from a brought-in aside. The aside's own click handler stops
      // propagation, so anything that reaches here is the slide itself -
      // which is the gesture that means "I am done with the tangent".
      if (asidePan && asidePan.chunkId === entry.id) {
        clearAsidePan();
        focusCamera(false);
        if (shouldBroadcast()) sendToPeer({ type: 'figure-unpan' });
        return;
      }
      settleFade();
      if (idx !== state.activeIdx) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
    });
  });
  // TOC column buttons: jump camera + close TOC.
  document.querySelectorAll('#psiINT-toc li').forEach(li => {
    const btn = li.querySelector('button');
    if (!btn) return;
    const colIdx = parseInt(li.dataset.tocCol, 10);
    btn.addEventListener('click', () => {
      jumpToColumn(colIdx);
      tocVisible = false;
      document.body.classList.remove('toc-visible');
    });
  });
}

// Collapse toggle: 'none' (show everything) ↔ 'topic-bold' (topic + bold).
const COLLAPSE_MODES = ['none', 'topic-bold'];
const COLLAPSE_LABEL = { 'none': 'show everything', 'topic-bold': 'topic + bold' };

// The two collapse modes carry very different amounts of text, so one zoom
// cannot serve both. The collapsed slide is the projector setting the
// lecturer chose and it is never touched automatically; the full-text mode
// gets a zoom computed on entry so the whole chunk fits the screen, which
// is what stops the C key from being followed by a row of minus presses.
// Leaving full text restores the remembered collapsed zoom exactly.
let collapsedZoom = state.zoom;
// Auto-fit only ever shrinks. Growing would be a surprise nobody asked
// for: a short chunk would jump to huge type on a keypress that the
// lecturer pressed to see more text, not bigger text.
const FULL_FIT_FILL = 0.94;   // leave a little air top and bottom
// ...except on a .bleed chunk, whose drawing IS the frame. Its canvas is one
// slide tall by construction, so a figure drawn to it measures exactly the
// viewport's height and would be over 0.94 of it at every slide: the fit
// stepped each one down a notch and the labels with it, which is the one
// thing the canvas promises not to happen. The whole frame, then, and one
// pixel on top of it - the svg's height is a width times an aspect ratio and
// lands a fraction either side of the integer the viewport reports.
function fitAvail(el) {
  if (!viewport) return 0;
  return el && el.dataset && el.dataset.canvasTier === 'bleed'
    ? viewport.clientHeight + 1
    : viewport.clientHeight * FULL_FIT_FILL;
}

// Height alone does not decide whether a chunk fits. A long code line does
// not wrap, so a chunk can sit comfortably inside the available height and
// still push its content off the side of the screen. The elements that can
// do that are the ones whose content refuses to reflow – code blocks,
// tables, display maths – so they are collected once per fit and only the
// short resulting list is re-measured on each zoom step, rather than
// walking the whole subtree every iteration.
const NOWRAP_SEL = 'pre, table, .katex-display';

// Returns a predicate over the one chunk's non-reflowing elements. Built
// once per fit so the repeated zoom steps re-measure a short list instead of
// walking the subtree again. Sub-pixel layout rounding makes an exact
// comparison report phantom overflow on content that fits, so allow a pixel
// of slack.
//
// The chunk's own box is in that list as a backstop for anything wide that
// is not a pre, a table or a formula. It has to be told about the one thing
// that overflows on purpose: a ::: marginalia is absolutely positioned out
// past the text column and is *meant* to run off the right edge of the
// frame. Its overhang lands in the chunk's scrollWidth like any other, so
// the backstop read "this slide is cut off" on every marginalia chunk and
// the fit walked the zoom to its 0.6 floor - the tutorial's own
// #marginalia-demo came out at 0.6 where the slide before it was at 1.35,
// which is the whole reason a marginalia looked like a framing bug. So the
// allowance is the frame *or* the aside's own reach, whichever is further.
//
// What this deliberately cannot see is an in-flow element that overflows by
// less than the aside reaches, because the aside's excess hides it. Every
// element that can do that without reflowing is checked by name in the list
// beside it, which is what NOWRAP_SEL is for.
function nowrapProbe(el) {
  const wide = [el].concat(Array.from(el.querySelectorAll(NOWRAP_SEL)));
  const asides = Array.from(el.querySelectorAll('.marginalia'));
  return () => wide.some((n) => {
    let room = n.clientWidth;
    if (n === el) {
      for (const a of asides) {
        let reach = a.offsetWidth, p = a;
        while (p && p !== el) { reach += p.offsetLeft; p = p.offsetParent; }
        if (reach > room) room = reach;
      }
    }
    return n.scrollWidth > room + 1;
  });
}

// The third thing a slide can fail to do, and the newest. A figure is sized
// from the type it stands in (.chunk .psi-diagram in runtime/audience.css):
// the width it wants is --dg-fit-w base labels, one label to the em - the slide canvas
// where the chunk has one. When that is more
// than the column has, or more than the height cap allows, the min() caps it
// and the drawing stops following the type - so growing the slide's words from
// there makes the labels relatively SMALLER, which is the inconsistency the
// width rule was written to remove, arriving again through the camera.
//
// So a capped figure counts as "does not fit", in both directions. The
// consequence is deliberate and it is the honest one: a drawing too wide for
// its column pulls the slide's text down to meet it rather than growing away
// from it. It converges, because the width it wants shrinks with the type -
// the resting point is the zoom at which the figure exactly fills its column,
// which is also the largest type at which the labels still match the words.
//
// A display: none figure (a collapsed ::: expand) measures zero and is
// skipped; data-beat-hidden is visibility: hidden and keeps its box, so a
// figure that has not arrived yet is still measured, which is what stops the
// slide resizing under the room on the press that brings it in.
//
// It has one way of being wrong, and it is the expensive one, so it is
// written into the probe rather than into a list of containers to remember.
// Shrinking the type shrinks the width the figure ASKS for, so a cap measured
// in pixels - the chunk's column, the height cap - is escaped by it and the
// deficit closes. A cap measured in the same em as the type is not: both
// sides move together, the deficit stands at every zoom, and the loop below
// runs to its 0.6 floor with nothing on screen saying why. That is not
// hypothetical - a figure chunk's 40em caption measure did exactly this to
// thirteen measured slides of lectures/diagrams before the rule above moved it
// off the picture, and a card or a pane can hold the same shape.
//
// So the probe watches whether shrinking is actually helping, and gives up on
// the figure the first time a step does not close the gap. The reading is
// memoised per zoom, because the loops below ask more than once at a zoom and
// "no improvement since the last call" would otherwise be true immediately.
//
// Same shape as the two probes above: the list is collected once per fit and
// only the widths are re-read on each zoom step.
function figureCapProbe(el) {
  const figs = Array.from(el.querySelectorAll('svg.psi-diagram'));
  if (!figs.length) return () => false;
  // The worst shortfall on the slide, as a fraction of the width the type
  // asks for. 1 is "every figure has the width its labels want".
  const shortfall = () => {
    let worst = 1;
    for (const svg of figs) {
      const cs = getComputedStyle(svg);
      // --dg-fit-w and not --dg-type-w: the live views show the canvas, and
      // measuring a drawing against the box it is not in reads a figure that
      // exactly fills its canvas as one that overflowed its column.
      const typeW = parseFloat(cs.getPropertyValue('--dg-fit-w'));
      const mult = parseFloat(cs.getPropertyValue('--figure-type')) || 1;
      // The svg's own em, which is the text it stands in: the chunk body, a
      // pane, a card. Exactly what the width rule multiplies.
      const want = typeW * parseFloat(cs.fontSize) * mult;
      // clientWidth and not a client rect: the cockpit scales its whole stage
      // with a transform, and a rect there is in that scaled space while the
      // font size is in layout pixels. Same reason flowHeightProbe reads
      // offsets. A figure with no box at all (a collapsed expansion) is not on
      // the slide and is skipped.
      const got = svg.clientWidth;
      if (want > 0 && got > 0 && got / want < worst) worst = got / want;
    }
    return worst;
  };
  let seenZoom = null, seenShort = 1, answer = false, giveUp = false;
  return () => {
    if (giveUp) return false;
    if (state.zoom === seenZoom) return answer;
    const now = shortfall();
    if (seenZoom !== null && state.zoom < seenZoom && now <= seenShort + 0.002) {
      giveUp = true;                  // the cap moves with the type; shrinking cannot reach it
      answer = false;
    } else {
      answer = now < 0.995;
    }
    seenZoom = state.zoom; seenShort = now;
    return answer;
  };
}

// And a chunk's own box is not a measure of how much is on it. Three
// families are pinned to the full slide height so their ground fills the
// frame – the cover (.chunk-title), the section divider (.chunk-section)
// and anything carrying a backdrop ([data-has-backdrop]) – and a box that
// is as tall as the screen by construction can never fit inside 94% of it.
// The fit then read “still too tall” at every step and walked the zoom
// down to its 0.6 floor: with auto-fit on, every divider and every cover in
// a deck came out at minimum type, whatever was on it.
//
// So measure the flow instead – the extent of the chunk's in-flow children,
// which is the content column plus any expansion body open beneath it – and
// never more than the box itself, so an ordinary chunk measures exactly
// what it measured before. The out-of-flow children are ground and chrome
// (the backdrop, the overlay layer, the slide number, the annotate button):
// they are sized by the frame rather than by the type, so counting them
// would let the min-height back in through the side door. A child with no
// box at all is skipped – a collapsed ::: expand body is display:none, and
// its all-zero rect would otherwise anchor the extent at the viewport top.
//
// Offsets and not getBoundingClientRect: the cockpit scales its whole stage
// with a transform to fit the preview cell, and a client rect is in that
// scaled space while avail is in layout pixels. offsetTop and offsetHeight are
// layout pixels in both windows, and .chunk is positioned, so they are
// already relative to the chunk.
//
// Same shape as nowrapProbe, and for the same reason: the child list and
// the padding are read once per fit, and only the offsets are re-measured on
// each zoom step.
function flowHeightProbe(el) {
  // display: contents is not a box, it is a wrapper whose children are laid
  // out by the grandparent – the divider's own .section-lead is one, and so
  // is every <li> of an outline list. Skipping it as boxless measured a
  // divider by its prose alone and grew the type until the heading and the
  // agenda above it were off the top of the screen; taking its zeroed offsets
  // at face value would anchor the extent at the chunk's top edge. Both
  // readings are wrong for the same reason, so such a child is replaced by
  // the children it lends to this level.
  const flowKids = (node) => {
    const out = [];
    for (const c of node.children) {
      if (typeof c.offsetHeight !== 'number') continue;      // an <svg> has no offset box
      const cs = getComputedStyle(c);
      // A side dock is absolute and still counts: it is looked through
      // below, so it contributes the extent of its words plus its paddings
      // rather than the slide height it is stretched to. Skipped, a
      // seven-item list in a 13em column could grow past the frame with
      // nothing telling auto-fit.
      // The overlay layer counts only when it holds a side panel, which is
      // looked through below; with cards or a band alone it is skipped as the
      // slide-high absolute box it is, or the fit would read it as content.
      const sidePanel = c.classList.contains('overlay-layer') && c.querySelector(':scope > .ov-panel.ov-left, :scope > .ov-panel.ov-right');
      if ((cs.position === 'absolute' || cs.position === 'fixed') && !c.classList.contains('dock') && !sidePanel) continue;
      if (cs.display === 'contents') { out.push(...flowKids(c)); continue; }
      out.push(c);
    }
    return out;
  };
  // One level: the in-flow children of a node and its two vertical paddings,
  // read once rather than on every zoom step.
  //
  // A composition may pin the foot of its type block to the bottom of a box
  // that is already stretched to the frame. masthead does it with an auto
  // top margin on the credits, which is also what lands its folio rule at
  // the top of them. The extent from the words at the top to the words at
  // the bottom is then the box's height at *every* type size, so the fit's
  // height test never becomes false and it walks to its 0.6 floor. Measured:
  // one presenter line took a masthead cover from zoom 2.2 to 0.6 and nothing
  // said why. That is the same failure panelLevel already describes for a
  // band overlay, and it gets the same answer: keep the band out of the span
  // and add its own height back below.
  const levelOf = (node) => {
    const cs = getComputedStyle(node);
    const flow = flowKids(node);
    // Never cut at the first child: a block that is *entirely* the band has no
    // words above it to measure, and an empty span falls back to the box.
    const cut = flow.findIndex((c) => c.hasAttribute && c.hasAttribute('data-foot'));
    return {
      flow: cut > 0 ? flow.slice(0, cut) : flow,
      foot: cut > 0 ? flow.slice(cut) : [],
      padT: parseFloat(cs.paddingTop) || 0,
      padB: parseFloat(cs.paddingBottom) || 0,
    };
  };
  // Returns the top and bottom of what the level holds, in that level's own
  // offset coordinates, or null when nothing in it has a box.
  const span = (lvl) => {
    let top = Infinity, bottom = -Infinity;
    for (const c of lvl.flow) {
      if (!c.offsetHeight && !c.offsetWidth) continue;    // display:none has no box
      if (c.offsetTop < top) top = c.offsetTop;
      if (c.offsetTop + c.offsetHeight > bottom) bottom = c.offsetTop + c.offsetHeight;
    }
    return bottom < top ? null : { top, bottom };
  };

  const outer = levelOf(el);
  // The one box we look inside is .chunk-content, and only because on a
  // cover it is stretched to the frame as well: the block is then placed at
  // its top, middle or end (cover-align), so the box says where the type may
  // go and not how much of it there is. It is safe to look through precisely
  // because it carries no ground - no background, no border, no min-height -
  // and its own padding is added back below. Nothing deeper is looked
  // through: a card row keeps its min-height, a figure keeps its frame.
  // The overlay layer is looked through twice: the layer to its panels
  // (cards keep their cell and are not measured), a panel to its words -
  // so a bare photo slide whose only text is a panel is fitted to that
  // text rather than zoomed to the ceiling.
  const panelLevel = (layer) => {
    // Side panels only. A band sits at the foot (or head) of the frame, so
    // one extent from the words above it to the words in it is the slide's
    // height whatever the type size, and the fit ran to the floor. A band's
    // own height is its words' (snug) or a fixed share, and the words above
    // it are measured through .chunk-content as on any slide.
    const panels = [...layer.children].filter((k) => k.classList.contains('ov-panel')
      && (k.classList.contains('ov-left') || k.classList.contains('ov-right')));
    if (!panels.length) return null;
    const lv = levelOf(layer);
    // A panel is positioned against the layer's padding box, not inside its
    // padding, so the layer's own paddings are not part of the height.
    lv.padT = 0; lv.padB = 0;
    const levels = panels.map(levelOf);
    // A panel is the offsetParent of its words (it is absolute), so a
    // word's extent is the panel's offset plus its own, less the panel's
    // padding - the same arithmetic the closure below does one level up.
    lv.spanFn = () => {
      let top = Infinity, bottom = -Infinity;
      panels.forEach((p, j) => {
        const s = span(levels[j]);
        if (!s) return;
        const t = p.offsetTop + s.top - levels[j].padT, b = p.offsetTop + s.bottom + levels[j].padB;
        if (t < top) top = t;
        if (b > bottom) bottom = b;
      });
      return bottom < top ? null : { top, bottom };
    };
    return lv;
  };
  const inner = outer.flow.map((c) => (c.classList.contains('chunk-content') || c.classList.contains('dock') ? levelOf(c)
    : c.classList.contains('overlay-layer') ? panelLevel(c) : null));

  return () => {
    let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < outer.flow.length; i++) {
      const c = outer.flow[i];
      if (!c.offsetHeight && !c.offsetWidth) continue;
      let t = c.offsetTop, b = c.offsetTop + c.offsetHeight;
      const lvl = inner[i];
      const s = lvl && (lvl.spanFn ? lvl.spanFn() : span(lvl));
      if (s) {
        // .chunk-content is the offsetParent of its own children, so the
        // grandchildren's offsets are relative to it.
        t = Math.max(t, c.offsetTop + s.top - lvl.padT);
        b = Math.min(b, c.offsetTop + s.bottom + lvl.padB);
      }
      if (t < top) top = t;
      if (b > bottom) bottom = b;
    }
    // A band at the head or foot is not in the span (see panelLevel) but
    // it takes its height from the frame all the same, so the words have
    // that much less: a two-line divider heading lost its second line under
    // a snug band at the zoom the span alone allowed.
    let bands = 0;
    for (const b of el.querySelectorAll(':scope > .overlay-layer > .ov-panel.ov-top, :scope > .overlay-layer > .ov-panel.ov-bottom')) bands += b.offsetHeight;
    // A pinned foot is out of the span for the reason above, and its words
    // still take room, so its own extent comes back here - exactly as a band
    // overlay's height does on the line above.
    for (const lvl of inner) {
      if (!lvl || !lvl.foot || !lvl.foot.length) continue;
      const fs = span({ flow: lvl.foot });
      if (fs) bands += fs.bottom - fs.top;
    }
    if (bottom < top) return el.scrollHeight;
    return Math.min(el.scrollHeight, (bottom - top) + outer.padT + outer.padB + bands);
  };
}

// ceiling: the largest zoom the fit is allowed to reach. Entering the full
// text on its own must never grow the type past what the lecturer chose for
// the projector – they pressed C to see more text, not bigger text. In
// auto-fit mode the ceiling is the global maximum instead, because there
// the whole point is that every slide is sized to the screen.
function fitZoomToChunk(ceiling) {
  const entry = flatChunks[state.activeIdx];
  const el = entry && entry.el;
  if (!el || !viewport) return;
  const cap = ceiling === undefined ? collapsedZoom : ceiling;
  const avail = fitAvail(el);
  if (!(avail > 0)) return;
  onChunk(el, (trial) => {
    // Measured at state.zoom, which <html> may not be showing: the slide PDF
    // export writes its ceiling there without telling state.zoom. Answering
    // "nothing to gain" from a reading at another zoom made a chunk's fit
    // depend on the order the deck was walked in.
    trial(state.zoom);
    fitWalk(el, cap, avail, trial);
  });
}

function fitWalk(el, cap, avail, trial) {
  const overflowsX = nowrapProbe(el);
  const heightOf = flowHeightProbe(el);
  const figCapped = figureCapProbe(el);
  // "Nothing to gain" has to know about the figure too, or a slide already at
  // the ceiling with a capped drawing on it is returned from before the shrink
  // loop ever runs.
  if (heightOf() <= avail && !overflowsX() && !figCapped() && state.zoom >= cap) return;

  // A single proportional estimate is not enough, because zoom changes line
  // wrapping and therefore height, and it is not safe either: solving for
  // "exactly fills" lets a correction pass grow the zoom back over the
  // edge. So estimate once to get close, then walk in the real zoom
  // increment until the invariant holds, and only then try to give the
  // reclaimed space back. Without that last step the compounding of a
  // safety factor and the 0.05 rounding left chunks a quarter smaller than
  // they needed to be.
  const STEP = 0.05;
  let z = clampZoom(state.zoom * (avail / (heightOf() || avail)));
  if (z > cap) z = cap;
  trial(z);

  // Shrink until it fits, in all three senses.
  while ((heightOf() > avail || overflowsX() || figCapped()) && z > 0.6) {
    z = clampZoom(z - STEP);
    trial(z);
  }
  // Grow back while it still fits, never past the ceiling.
  while (z + STEP <= cap) {
    const probe = clampZoom(z + STEP);
    trial(probe);
    if (heightOf() > avail || overflowsX() || figCapped()) { trial(z); break; }
    z = probe;
  }
}

// The fit's steps are written on the one chunk being fitted, not on <html>.
// Every rule that reads var(--zoom) sits on .chunk or below it, so the chunk
// measures exactly what it would under a document-wide value - but a change
// on <html> restyles and relays every element of every slide, and the walk
// above takes up to twenty steps. Measured on lectures/diagrams (47 chunks,
// 5,700 elements): 90 ms a step, up to two seconds a press, two thirds of it
// style recalculation. On the chunk a step costs that chunk; the document is
// restyled once, by the catch-up after commitZoom (see showZoom), and not at
// all when the answer is the zoom it already had - which is every press that
// only reveals a beat.
// state.zoom follows each step because figureCapProbe memoises on it.
//
// That "on .chunk or below" is held by the zoom-scope gate, which fails on a
// rule reading var(--zoom) whose selector is not on its reviewed list.
//
// onChunk runs a walk and always ends it with commitZoom, in a finally: a
// throw mid-walk would otherwise leave the slide on a private zoom that + and
// - cannot reach. A walk that throws commits the zoom it started from, not
// the step it had reached - each trial moves state.zoom, so committing it
// as it stands would put a half-walked value on the slide and in the next
// snapshot, a zoom nobody chose.
function onChunk(el, walk) {
  const before = state.zoom;
  let done = false;
  try {
    walk((z) => applyZoom(z, el));
    done = true;
  } finally {
    if (!done) state.zoom = before;
    commitZoom(el);
  }
}
function commitZoom(el) {
  el.style.removeProperty('--zoom');
  showZoom();
}
// Puts state.zoom on the page: at once on the slides that can be on screen,
// and on <html> a moment later. It does nothing when the page shows it
// already, so a caller that set state.zoom and then ran a fit that may have
// returned before committing can call it unconditionally. Every writer of
// the zoom ends here (applyState, setZoom, the fits through commitZoom); a
// second one writing <html> directly would not reach a slide that holds the
// zoom inline.
//
// WHY NOT <html> AT ONCE. The value on <html> is inherited by every element
// of every slide, so writing it restyled and relaid the whole deck on the
// slide change that moved the zoom - which under auto-fit is nearly every
// one. The read that paid for it was focusCamera's, inside the press:
// measured on lectures/diagrams at 1600x900, 45 ms against 10 for a slide
// change that kept its zoom, 97 ms with the CPU throttled 4x; in a 77-chunk
// course's cockpit, which also carries a clone of every slide in its preview
// strip, 67 ms and 182 ms. Under cut that is how long the new slide takes to
// appear, under pan how late the glide starts.
//
// What can be on screen at a slide change is the live slide, the one it
// replaces (under pan it is in the frame for the whole glide, and fading
// under neighbours: hidden) and the slide on either side of it (the
// neighbours a dim frame shows at its edges). Those four take the zoom
// inline, now, which restyles four slides; the rest of the deck still
// inherits the old value from <html> and catches up in catchUpZoom, once
// the stage has stopped moving and the browser is idle. Nothing a frame at
// rest shows differs, before or after the catch-up: the camera centres the
// live slide wherever the slides above it put it, and the catch-up re-solves
// the camera in the same task when they moved it. What does differ is
// deliberate and brief: a slide the camera passes over on a long jump, or
// the cockpit's thumbnails, keep the old zoom until the catch-up - and a
// slide above the one being left no longer changes height at the start of
// the glide, which used to jerk the outgoing slide before it moved.
//
// Three readers need <html> current and get it synchronously: the overview
// board, which shows every slide; the PDF export, which writes <html>
// itself after jumpTo and so must not find a slide holding a zoom inline
// (psiExport sets zoomNow); and the first write, at boot.
const ZOOM_CATCH_UP_MS = 500;
const zoomHeld = new Set();   // slides carrying state.zoom inline until the catch-up
let zoomLastActive = -1;      // the live slide at the last showZoom: the one being left
let zoomNow = false;          // set for good by a caller that needs <html> current
let zoomTimer = 0, zoomGen = 0;
function rootZoom() {
  return parseFloat(document.documentElement.style.getPropertyValue('--zoom'));
}
function showZoom() {
  const left = zoomLastActive;
  zoomLastActive = state.activeIdx;
  const root = rootZoom();
  if (root === state.zoom && !zoomHeld.size) return;
  if (overview || zoomNow || !(root > 0)) { flushZoom(); return; }
  for (const i of [left, state.activeIdx - 1, state.activeIdx, state.activeIdx + 1]) {
    const c = flatChunks[i];
    if (!c) continue;
    c.el.style.setProperty('--zoom', state.zoom);
    zoomHeld.add(c.el);
  }
  scheduleZoomCatchUp();
}
// <html> takes state.zoom and every slide holding it inline lets go. Returns
// whether anything was written, for the catch-up's camera check.
function flushZoom() {
  clearTimeout(zoomTimer);
  zoomTimer = 0;
  zoomGen++;
  if (rootZoom() === state.zoom && !zoomHeld.size) return false;
  applyZoom(state.zoom);
  zoomHeld.forEach(el => el.style.removeProperty('--zoom'));
  zoomHeld.clear();
  return true;
}
// Every showZoom that leaves <html> behind re-arms this, so a run of presses
// pays for one catch-up after the last of them rather than one per press.
function scheduleZoomCatchUp() {
  clearTimeout(zoomTimer);
  const gen = ++zoomGen;
  zoomTimer = setTimeout(() => {
    zoomTimer = 0;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    idle(() => { if (gen === zoomGen) catchUpZoom(); }, { timeout: 1000 });
  }, ZOOM_CATCH_UP_MS);
}
// Not while the stage moves: a camera re-solve with the transition off would
// cut a glide short, and a fade has a slide change still to make.
function catchUpZoom() {
  const moving = fadeAnim || fadePending || (stage.getAnimations && stage.getAnimations().length);
  if (moving) { scheduleZoomCatchUp(); return; }
  const entry = flatChunks[state.activeIdx];
  const before = entry && !overview ? getOffset(entry.el, stage) : null;
  if (!flushZoom() || !before) return;
  // A slide above the live one in its column that is taller or shorter at
  // the new zoom moves the live slide; the transform is re-solved in this
  // task, before a frame is painted, so the room sees nothing move.
  //
  // The style is read back before returning, which focusCamera(true) alone
  // does not do. It turns the transition off, sets the transform and turns
  // the transition back on in the next animation frame - and from an idle
  // callback no style is computed in between, so the frame computed both at
  // once and glided: the slide stood off the frame by the distance it had
  // moved, for 250 ms, measured under --frames.
  const after = getOffset(entry.el, stage);
  if (after.left !== before.left || after.top !== before.top) {
    focusCamera(true);
    void getComputedStyle(stage).transform;
  }
}

// With auto-fit off the zoom is the lecturer's, and it is deliberately never
// touched automatically. That choice is global, though, and horizontal
// overflow is not: one chunk with a long code line loses its right-hand
// column while every other slide is fine, and nothing on screen says so. You
// find out in the lecture hall.
//
// So this shrinks that one chunk, only far enough to stop cutting, and it is
// the only automatic zoom change outside auto-fit mode. Three properties are
// load-bearing:
//
//   - it never writes collapsedZoom, and it always re-derives *from* it
//     rather than from whatever it last applied, so it is idempotent and the
//     lecturer's setting comes back untouched on the next chunk;
//   - it only ever shrinks – the ceiling is the chosen zoom;
//   - the shrunk value is local to this window (see snapshot()), because the
//     projection and the cockpit's stage are different sizes and each has to
//     answer the question for itself.
//
// Returns true when it had to shrink, so the caller can say so.
function clampZoomToWidth() {
  if (autoFitOn()) return false;                      // either fit does both directions already
  if (state.collapse !== 'topic-bold') return false;  // full text has its own fit on entry
  const entry = flatChunks[state.activeIdx];
  const el = entry && entry.el;
  if (!el) return false;
  const overflowsX = nowrapProbe(el);
  let z = clampZoom(collapsedZoom);
  onChunk(el, (trial) => {
    trial(z);
    while (overflowsX() && z > 0.6) {
      z = clampZoom(z - 0.05);
      trial(z);
    }
  });
  return z < collapsedZoom;
}

// Auto-fit: every slide gets a zoom that makes it fit, in both collapse
// modes, until it is switched off again. Distinct from the fit that happens
// on entering the full text, which is a one-off and never grows the type -
// and shrink is that same one-off made permanent, which is the whole of
// what the third mode is.
//
// A cycle and not a toggle, walked in AUTO_FIT_CYCLE order. Shift does not
// reverse it, unlike C, F, A and L: # is Shift-3 on a US layout and an
// unshifted key of its own on a German one, so e.shiftKey carries no
// information here that is the same on two keyboards. Three states are two
// presses from anywhere, which is what makes that affordable.
const AUTO_FIT_LABEL = {
  off:    'auto-fit off · manual zoom',
  shrink: 'auto-fit shrink · a slide too big is made to fit, nothing else moves',
  full:   'auto-fit on · every slide sized to the screen',
};
function cycleAutoFit(dir) {
  const i = AUTO_FIT_CYCLE.indexOf(state.autoFitMode);
  const n = AUTO_FIT_CYCLE.length;
  state.autoFitMode = AUTO_FIT_CYCLE[(i + (dir || 1) + n) % n];
  if (autoFitOn()) {
    // Back to the lecturer's zoom first, so the fit solves from the setting
    // rather than from whatever the previous mode left on this slide - in
    // shrink mode that value IS the ceiling, and starting below it would
    // read as a mode that never gives the size back. Set on state.zoom
    // only: the fit trials on the chunk and commits once, and writing the
    // setting to <html> first would restyle every slide for a value about
    // to be replaced. showZoom covers a fit that returned before committing.
    state.zoom = clampZoom(state.collapse === 'topic-bold' ? collapsedZoom : state.zoom);
    fitZoomToChunk(autoFitCeiling());
  } else {
    state.zoom = clampZoom(state.collapse === 'topic-bold' ? collapsedZoom : state.zoom);
    clampZoomToWidth();
  }
  showZoom();
  applyState();
  focusCamera(false);
  flashMode(AUTO_FIT_LABEL[state.autoFitMode]);
}

// Zoom
// What + and – step from. On a chunk that clampZoomToWidth had to shrink,
// state.zoom is what this slide can show, not what the lecturer asked for –
// stepping from it would land back on the same clamped value and the key
// would read as dead. Step from the choice instead, so the setting really
// moves even when this one slide cannot follow it.
//
// shrink counts as "the lecturer's zoom is still a setting" and full does
// not, which is the same line the two modes are separated by everywhere
// else: under a ceiling of the lecturer's own zoom, state.zoom is what this
// slide could take of it, and under a ceiling of 2.2 it is the answer.
function zoomBase() {
  return (state.autoFitMode !== 'full' && state.collapse === 'topic-bold') ? collapsedZoom : state.zoom;
}
function clampZoom(z) {
  return Math.round(Math.max(0.6, Math.min(2.2, z)) * 20) / 20;
}
// Write the zoom without the announcement or the broadcast, for the
// automatic fit which would otherwise flash a number on every C press.
// On the document by default, which only flushZoom asks for; the fit's trial
// steps pass the chunk (onChunk). Anything else goes through showZoom.
function applyZoom(z, target = document.documentElement) {
  state.zoom = clampZoom(z);
  target.style.setProperty('--zoom', state.zoom);
}

function cycleCollapse(dir = 1) {
  const i = COLLAPSE_MODES.indexOf(state.collapse);
  const ni = (i + dir + COLLAPSE_MODES.length) % COLLAPSE_MODES.length;
  const leavingCollapsed = state.collapse === 'topic-bold';
  // zoomBase() and not state.zoom: on this slide state.zoom may be what an
  // automatic shrink could show of the setting rather than the setting, and
  // carrying that across a C press would lower the lecturer's zoom a little
  // on every wide slide they pass. setZoom is the only writer of the
  // setting, so outside full auto-fit this line is now a no-op by design.
  if (leavingCollapsed) collapsedZoom = zoomBase();
  state.collapse = COLLAPSE_MODES[ni];
  applyState();
  if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
  else if (state.collapse === 'none') fitZoomToChunk();
  else { state.zoom = clampZoom(collapsedZoom); clampZoomToWidth(); }
  showZoom();     // as in cycleAutoFit: one write to <html>, after the fit
  focusCamera(false);
  broadcastState();
  flashMode('collapse: ' + COLLAPSE_LABEL[state.collapse]);
}

// One step of the zoom key, snapped to the ladder rather than added to where
// we happen to be. Adding 0.1 to the 1.35 default gave 1.25, 1.15, 1.05,
// 0.95 - a ladder on which **1.00 cannot be reached at all**, which is the
// one number a lecturer is most likely to want. Working in whole units of
// 0.05 (the grid clampZoom already rounds to) keeps the arithmetic exact:
// from an odd unit the first press lands on the neighbouring even one, and
// every press after that is a whole 0.1.
function stepZoom(dir) {
  const n = Math.round(zoomBase() * 20);
  const m = (n % 2 === 0) ? n + dir * 2 : n + dir;
  setZoom(m / 20);
}

function setZoom(z) {
  state.zoom = clampZoom(z);
  showZoom();
  // A manual adjustment in the collapsed view is the setting to remember;
  // in full text it is a one-off correction of the automatic fit and must
  // not overwrite what the lecturer chose for the projector.
  if (state.collapse === 'topic-bold') collapsedZoom = state.zoom;
  // The new setting is remembered whatever this chunk can show of it, but
  // the announcement has to report what is actually on screen – otherwise +
  // on a width-limited slide reads as a key that does nothing.
  let limited;
  if (state.autoFitMode === 'shrink' && state.collapse === 'topic-bold') {
    // In shrink mode the setting is also the ceiling, so a change to it has
    // to be re-solved against this slide at once, or + reads as a key that
    // works on every slide except the one you are looking at. Held to the
    // collapsed mode for the reason clampZoomToWidth is: in the full text
    // the zoom is already a one-off correction of an automatic fit, and
    // fitting it again would undo the correction as it was made.
    fitZoomToChunk(collapsedZoom);
    limited = state.zoom < collapsedZoom;
  } else {
    limited = clampZoomToWidth();
  }
  setTimeout(() => focusCamera(false), 30);
  broadcastState();
  flashMode('zoom: ' + state.zoom.toFixed(2) + '×' + (limited ? ' · limited by this slide' : ''));
}

// Help overlay – single toggle for the ? key and the corner button.
const helpOverlay = document.getElementById('psiINT-help-overlay');
const helpButton = document.getElementById('psiINT-help-button');
function helpVisible() { return helpOverlay && !helpOverlay.classList.contains('hidden'); }
function toggleHelp(force) {
  if (!helpOverlay) return;
  const show = force === undefined ? !helpVisible() : !!force;
  helpOverlay.classList.toggle('hidden', !show);
  if (!helpSearch) return;
  if (show) {
    // Opened empty every time: a filter left over from the last visit would
    // show a panel with most of its rows missing and no reason why.
    helpSearch.value = '';
    filterHelp();
    // Not on a touchscreen, where focusing a field puts up a keyboard over
    // half of the panel it was opened to read.
    if (!(window.matchMedia && window.matchMedia('(hover: none)').matches)) {
      helpSearch.focus({ preventScroll: true });
    }
  } else if (document.activeElement === helpSearch) {
    // A hidden field that keeps the focus would keep the keyboard too, and
    // the key map stands aside for any focused input.
    helpSearch.blur();
  }
}

// ── the search field at the head of the ? panel ─────────────────────
// Filters the rows as it is typed into. A row matches when every word of
// the query is in it: a word of two or more characters anywhere in the key
// column, the description or the section title; a single character only as
// a key, because B or / typed alone means that key and not every row whose
// prose contains the letter. Case and diacritics are folded on both sides.
// The keys are read off the rows' kbd elements, with the arrow glyphs and
// Esc given the words a person types for them.
//
// While the field has the focus the key map stands aside, in the keydown
// listener's input guard, so b types a b there rather than blanking the
// projection. Esc empties a field with text in it and closes the panel from
// an empty one; ? closes it from an empty one too, since the dismiss line
// says ? closes.
const helpSearch = helpOverlay ? helpOverlay.querySelector('#psiINT-help-search') : null;
const helpNone = helpOverlay ? helpOverlay.querySelector('.help-none') : null;
const HELP_KEY_WORDS = {
  '↑': 'up arrow', '↓': 'down arrow', '←': 'left arrow', '→': 'right arrow',
  'esc': 'escape', '/': 'slash', '?': 'question mark', '#': 'hash',
  '+': 'plus', '-': 'minus', '−': 'minus', ',': 'comma', '.': 'period',
};
function helpFold(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
let helpIndex = null;
function helpRows() {
  if (helpIndex) return helpIndex;
  helpIndex = [];
  if (!helpOverlay) return helpIndex;
  for (const sec of helpOverlay.querySelectorAll('.help-grid section')) {
    const h = sec.querySelector('h3');
    const title = h ? h.textContent : '';
    const rows = [];
    for (const dt of sec.querySelectorAll('dt')) {
      const dd = dt.nextElementSibling;
      const keys = [...dt.querySelectorAll('kbd')].map((k) => helpFold(k.textContent.trim()));
      // 1–9 is written as two keys and a dash, and means the seven between.
      const range = dt.innerHTML.match(/<kbd>(\d)<\/kbd>–<kbd>(\d)<\/kbd>/);
      if (range) for (let d = +range[1] + 1; d < +range[2]; d++) keys.push(String(d));
      const words = keys.map((k) => HELP_KEY_WORDS[k] || '').join(' ');
      // Runnable when the build named a command on the row and this view
      // has a run function for it - a cockpit without the prompter lists no
      // Shift-S, and a doc row names nothing.
      const cmd = dt.dataset.cmd && COMMAND_RUN[dt.dataset.cmd] ? dt.dataset.cmd : null;
      if (cmd) for (const el of [dt, dd]) if (el) el.classList.add('help-run');
      rows.push({
        dt, dd, keys, cmd,
        hay: helpFold(dt.textContent + ' ' + (dd ? dd.textContent : '') + ' ' + words + ' ' + title),
      });
    }
    helpIndex.push({ sec, rows });
  }
  return helpIndex;
}
// The palette's lines: the reference's rows again, one line each, keyed
// and labelled as in the panel, with the section a line comes from as a tag
// at its end. Built once, into the list at the grid's foot, in the panel's
// order - which is the tie-break of the ranking - and with the panel's
// line between the runnable lines and the rest.
const helpResults = helpOverlay ? helpOverlay.querySelector('.help-results') : null;
let paletteIndex = null;
let paletteRefLine = null;
function helpWords(str) { return helpFold(str).split(/[^a-z0-9]+/).filter(Boolean); }
function paletteRows() {
  if (paletteIndex) return paletteIndex;
  paletteIndex = [];
  if (!helpResults) return paletteIndex;
  const part = helpOverlay.querySelector('.help-grid > .help-part');
  paletteRefLine = document.createElement('div');
  paletteRefLine.className = 'help-part';
  paletteRefLine.textContent = part ? part.textContent : '';
  paletteRefLine.hidden = true;
  helpResults.append(paletteRefLine);
  const table = PSI_COMMANDS.COMMANDS;
  for (const { sec, rows } of helpRows()) {
    const h = sec.querySelector('h3');
    const title = h ? h.textContent : '';
    const ref = sec.classList.contains('help-ref');
    for (const r of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      const where = document.createElement('dd');
      dt.innerHTML = r.dt.innerHTML;
      dd.innerHTML = r.dd ? r.dd.innerHTML : '';
      where.className = 'help-where';
      where.textContent = title;
      if (r.cmd) { dt.dataset.cmd = r.cmd; for (const el of [dt, dd, where]) el.classList.add('help-run'); }
      if (ref) for (const el of [dt, dd, where]) el.classList.add('help-ref');
      for (const el of [dt, dd, where]) el.hidden = true;
      helpResults.append(dt, dd, where);
      const c = table.find((m) => m.id === r.dt.dataset.row);
      const label = c && c.label ? c.label : '';
      paletteIndex.push({
        dt, dd, where, cmd: r.cmd, ref, keys: r.keys, order: paletteIndex.length,
        keyWords: helpFold(r.keys.map((k) => HELP_KEY_WORDS[k] || '').join(' ')),
        label: helpWords(label), labelText: helpFold(label),
        words: helpWords(dd.textContent),
        text: helpFold(dt.textContent + ' ' + dd.textContent),
        title: helpFold(title),
      });
    }
  }
  return paletteIndex;
}
// How well a line answers the query, 0 for not at all. Every word of the
// query has to match somewhere, and each counts by where: a key (a single
// character only ever matches a key, so b finds B and not every row with a
// b in it), then a word of the command's own name, then the description,
// then the key's spoken name and the section. So "overview" puts O, whose
// name it is, ahead of the rows that mention the overview in passing.
function paletteScore(e, terms) {
  let total = 0;
  for (const t of terms) {
    let s = 0;
    if (e.keys.includes(t)) s = 100;
    else if (t.length > 1) {
      if (e.label.includes(t)) s = 70;
      else if (e.label.some((w) => w.startsWith(t))) s = 60;
      else if (e.labelText.includes(t)) s = 45;
      else if (e.words.includes(t)) s = 30;
      else if (e.words.some((w) => w.startsWith(t))) s = 25;
      else if (e.text.includes(t) || e.keyWords.includes(t)) s = 15;
      else if (e.title.includes(t)) s = 10;
    }
    if (!s) return 0;
    total += s;
  }
  return total;
}
let paletteShown = [];
function filterHelp() {
  if (!helpSearch) return;
  const terms = helpFold(helpSearch.value).trim().split(/\s+/).filter(Boolean);
  const grid = helpOverlay.querySelector('.help-grid');
  if (grid) grid.toggleAttribute('data-filtered', terms.length > 0);
  if (helpResults) helpResults.hidden = !terms.length;
  paletteShown = [];
  if (terms.length) {
    const scored = [];
    for (const e of paletteRows()) {
      const score = paletteScore(e, terms);
      for (const el of [e.dt, e.dd, e.where]) el.hidden = !score;
      if (score) scored.push([score, e]);
    }
    // Best match first within each half; the runnable half before the
    // reference, as in the unfiltered panel, so a line the arrows cannot
    // take never stands between two they can.
    const runs = (e) => (e.cmd ? 0 : 1);
    scored.sort((x, y) => runs(x[1]) - runs(y[1]) || y[0] - x[0] || x[1].order - y[1].order);
    paletteShown = scored.map((x) => x[1]);
    const firstRef = paletteShown.findIndex((e) => !e.cmd);
    paletteRefLine.hidden = firstRef < 0;
    paletteShown.forEach((e, i) => {
      if (i === firstRef) helpResults.append(paletteRefLine);
      helpResults.append(e.dt, e.dd, e.where);
    });
  }
  if (helpNone) helpNone.hidden = !terms.length || paletteShown.length > 0;
  // A query selects its best runnable line, so typing a word and Enter runs
  // it; an empty field selects nothing, so Enter there runs nothing. The
  // list starts at the top again whatever was scrolled before.
  if (grid) grid.scrollTop = 0;
  const runnable = helpRunnable();
  setHelpSel(terms.length && runnable.length ? runnable[0] : null);
}

// ── the panel as a command palette ──────────────────────────────────
// Cmd-K or Ctrl-K opens the panel with the field focused; the arrows move a
// selection through the rows still standing that the panel can run, and
// Enter or a click runs one. Running closes the panel first and then calls
// COMMAND_RUN for the command with an event shaped like its first key, so
// the row does what the key does and nothing is implemented twice: in the
// cockpit, W from a row arms the projection as the cockpit's W does. A
// reference row - a gesture, a key answered by a guard, ? itself - is not
// selectable, and the panel lists every one of them after the last row that
// is (helpGroups in commands.mjs, and the sort in filterHelp), so the
// arrows move from a row to the one right under it, always. They stop at
// either end rather than wrap; PageDown and PageUp move by what the panel
// shows at once.
let helpSel = null;
function helpRunnable() {
  const out = [];
  if (helpResults && !helpResults.hidden) {
    for (const e of paletteShown) if (e.cmd) out.push(e);
    return out;
  }
  for (const { rows } of helpRows()) for (const r of rows) if (r.cmd) out.push(r);
  return out;
}
const helpCells = (row) => [row.dt, row.dd, row.where].filter(Boolean);
// The pointer selects too, without scrolling: the row is already under it.
// The arrows scroll the row into view, and the first row of a section with
// its heading, which would otherwise stay just above the fold.
function setHelpSel(row, scroll = true) {
  if (helpSel) for (const el of helpCells(helpSel)) el.classList.remove('help-sel');
  helpSel = row;
  if (!row) return;
  for (const el of helpCells(row)) el.classList.add('help-sel');
  if (!scroll || !row.dt.scrollIntoView) return;
  const sec = row.dt.parentElement && row.dt.parentElement.parentElement;
  if (sec && sec.tagName === 'SECTION' && row.dt.parentElement.firstElementChild === row.dt) {
    const h = sec.querySelector('h3');
    if (h) h.scrollIntoView({ block: 'nearest' });
  }
  row.dt.scrollIntoView({ block: 'nearest' });
}
function helpRowOf(cell) {
  for (const e of paletteIndex || []) if (e.dt === cell || e.dd === cell || e.where === cell) return e;
  for (const { rows } of helpRows()) for (const r of rows) if (r.dt === cell || r.dd === cell) return r;
  return null;
}
function moveHelpSel(step) {
  const list = helpRunnable();
  if (!list.length) return;
  const at = list.indexOf(helpSel);
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + step));
  setHelpSel(list[next]);
}
// PageDown / PageUp: the farthest runnable row less than a panel's height
// away, and at least the next one.
function pageHelpSel(dir) {
  const list = helpRunnable();
  const grid = helpOverlay.querySelector('.help-grid');
  if (!list.length || !grid) return;
  const at = list.indexOf(helpSel);
  if (at < 0) { setHelpSel(list[dir > 0 ? 0 : list.length - 1]); return; }
  const from = list[at].dt.getBoundingClientRect().top;
  const reach = grid.clientHeight * 0.85;
  let next = Math.max(0, Math.min(list.length - 1, at + dir));
  for (let i = next; i >= 0 && i < list.length; i += dir) {
    if (Math.abs(list[i].dt.getBoundingClientRect().top - from) > reach) break;
    next = i;
  }
  setHelpSel(list[next]);
}
// A command run from anywhere but its key: the panel, the start menu. For a
// command that has no key this is the only way in.
function runCommand(id) {
  const run = COMMAND_RUN[id];
  if (!run) return;
  const c = PSI_COMMANDS.COMMANDS.find((x) => x.id === id);
  // A command with no key (keys: []) is run with an event that names none.
  const combo = (c && c.keys && c.keys[0]) || '';
  const shift = combo.indexOf('shift+') === 0;
  run({
    key: shift ? combo.slice(6) : combo, shiftKey: shift,
    metaKey: false, ctrlKey: false, altKey: false,
    target: document.body, preventDefault() {}, stopPropagation() {},
  });
}
function runHelpRow(row) {
  if (!row || !row.cmd) return;
  toggleHelp(false);
  runCommand(row.cmd);
}
function openPalette() {
  if (!helpOverlay || !helpSearch) return;
  if (helpVisible() && document.activeElement === helpSearch) { toggleHelp(false); return; }
  if (!helpVisible()) toggleHelp(true);
  // A chord is a keyboard, so the field takes the focus on a touchscreen
  // too, where toggleHelp alone leaves it.
  helpSearch.focus({ preventScroll: true });
}
if (helpSearch) helpSearch.addEventListener('input', filterHelp);
if (helpButton) helpButton.addEventListener('click', () => toggleHelp(true));
// Click anywhere on the scrim closes; clicks inside the panel do not, so
// the reference stays open while you read it and try a key - except a click
// on a runnable row, which runs it.
if (helpOverlay) {
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) { toggleHelp(false); return; }
    const cell = e.target.closest && e.target.closest('.help-run');
    if (cell) runHelpRow(helpRowOf(cell));
  });
  helpOverlay.addEventListener('mousemove', (e) => {
    const cell = e.target.closest && e.target.closest('.help-run');
    const row = cell ? helpRowOf(cell) : null;
    if (row && row !== helpSel) setHelpSel(row, false);
  });
}

// ── the start menu (audience only) ──────────────────────────────────
// Fullscreen, the cockpit and the print view, beside the ? corner, for the
// minutes before a talk in which somebody who has not learnt W, S and P sets
// the projection up. It opens by itself only then: on the first slide of a
// page load that opened on it - no chunk in the address, no remembered
// position elsewhere - outside fullscreen, before anything has moved. The
// first move folds it, from either window (a forward press, a jump, a
// column, the cockpit driving the projection), and so do W, fullscreen and
// the chevron; the chevron is also remembered, globally, like the other
// reading preferences, because a lecturer who put it away once knows the
// three keys.
//
// Folded, the menu leaves the mirrored chevron beside the ? circle, which
// stands where the circle stands and is hidden where it is (the overview, a
// blanked projection). A click on it opens the menu again on whatever slide
// is up and forgets the stored choice, so the next page load on slide 1
// opens with the menu; the menu then folds on the next move, W, fullscreen
// or its own chevron, as it does before the talk.
//
// A probe that photographs or reads the projection (--frames, --check-fit,
// --squint) sets window.PSI_NO_START_MENU before the page runs: its frames
// are the room's slides, not a lecturer's set-up, so neither the menu nor
// the chevron stands there.
const startMenu = VIEW === 'audience' ? document.getElementById('psiINT-start-menu') : null;
const startMenuShow = startMenu ? document.getElementById('psiINT-start-menu-show') : null;
const START_MENU_KEY = 'psi-slides:start-menu';
let startMenuOff = !startMenu;
let startMenuEnded = false;
function setStartMenu(open) {
  startMenu.hidden = !open;
  if (startMenuShow) startMenuShow.hidden = open;
  if (open) probeStartMenu();
}
// An entry steps out of the menu when the page cannot find its view now
// (probeView), and back in when it can - one the build found missing is
// rendered hidden rather than left out, so a view a later partial build put
// beside this file is offered the next time the menu is shown.
function probeStartMenu() {
  for (const b of startMenu.querySelectorAll('button[data-cmd]')) {
    const c = PSI_COMMANDS.COMMANDS.find((x) => x.id === b.dataset.cmd);
    if (c && c.opens) probeView(c.opens, (there) => { b.hidden = !there; });
  }
}
function endStartMenu() {
  if (startMenuOff) return;
  startMenuEnded = true;
  if (!startMenu.hidden) setStartMenu(false);
}
function initStartMenu() {
  if (startMenuOff) return;
  if (window.PSI_NO_START_MENU) { startMenuOff = true; return; }
  let away = false;
  try { away = localStorage.getItem(START_MENU_KEY) === 'away'; } catch (e) {}
  setStartMenu(!(startMenuEnded || away || state.activeIdx !== 0
    || chunkIdxFromHash() >= 0 || fullscreenOn()));
}
if (startMenu) {
  startMenu.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (!b) return;
    if (b.id === 'psiINT-start-menu-hide') {
      try { localStorage.setItem(START_MENU_KEY, 'away'); } catch (err) {}
      endStartMenu();
      return;
    }
    if (b.dataset.cmd) runCommand(b.dataset.cmd);
  });
}
if (startMenuShow) {
  startMenuShow.addEventListener('click', () => {
    if (startMenuOff) return;
    try { localStorage.removeItem(START_MENU_KEY); } catch (err) {}
    setStartMenu(true);
  });
}

// ── video ───────────────────────────────────────────────────────────
// A clip is the one element on a slide the lecturer *operates* rather than
// just shows, so the two windows have to agree on it: pressing play in the
// cockpit has to start the projection, and scrubbing has to land the room
// in the same place. Addressed by data-fig-id rather than by index, because
// unlike figure focus this survives an author reordering the chunk.
//
// Gated by the freeze flag like any other broadcast: a frozen projection
// should not start playing because the lecturer previewed something.
let applyingRemoteVideo = false;
function videoByFigId(figId) {
  // Compared in JS rather than built into an attribute selector. A fig-id is
  // now sometimes a full URL, and CSS.escape escapes for an *identifier*,
  // not for a quoted attribute value – it happened to survive because CSS
  // unescapes inside quotes, which is luck, not a contract.
  for (const fig of document.querySelectorAll('.figure-video')) {
    if (fig.dataset.figId === figId) return fig.querySelector('video');
  }
  return null;
}
function wireVideos() {
  document.querySelectorAll('.figure-video').forEach((fig) => {
    const v = fig.querySelector('video');
    const figId = fig.dataset.figId;
    if (!v || !figId) return;
    const send = (action) => {
      if (applyingRemoteVideo || !shouldBroadcast()) return;
      sendToPeer({ type: 'video', source: VIEW, figId, action, time: v.currentTime });
    };
    v.addEventListener('play', () => send('play'));
    v.addEventListener('pause', () => send('pause'));
    // 'seeked', not 'seeking': one message when the handle lands, rather
    // than a stream of them while it is dragged.
    v.addEventListener('seeked', () => send('seek'));
  });
}
function applyRemoteVideo(m) {
  const v = videoByFigId(m.figId);
  if (!v) return;
  applyingRemoteVideo = true;
  try {
    if (typeof m.time === 'number' && Math.abs(v.currentTime - m.time) > 0.35) {
      v.currentTime = m.time;
    }
    if (m.action === 'play') { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    else if (m.action === 'pause') v.pause();
  } finally {
    // Cleared on a later task: the play/pause the line above triggers
    // arrives as an event of its own, and echoing it back would ping-pong.
    setTimeout(() => { applyingRemoteVideo = false; }, 0);
  }
}

// ── hosted embeds ───────────────────────────────────────────────────
// Two jobs. First, refuse to show a player that cannot work: YouTube needs
// a real origin, and a deck opened from disk has none, so from file:// the
// frame is replaced by an instruction card rather than left to render its
// own Error 153 in front of a room. Vimeo has no such constraint.
//
// Second, keep the two windows together. Both providers speak a postMessage
// control protocol – YouTube's is the one its own IFrame API uses, unlocked
// by enablejsapi=1 – so play and pause travel between projection and
// cockpit with no SDK loaded and no licence to honour.
const EMBED_NEEDS_ORIGIN = { youtube: true, vimeo: false, generic: false };

function embedCommand(frameWin, provider, action) {
  if (!frameWin) return;
  try {
    if (provider === 'youtube') {
      frameWin.postMessage(JSON.stringify({
        event: 'command', func: action === 'play' ? 'playVideo' : 'pauseVideo', args: [],
      }), '*');
    } else if (provider === 'vimeo') {
      frameWin.postMessage(JSON.stringify({ method: action === 'play' ? 'play' : 'pause' }), '*');
    }
  } catch (e) { /* a frame that is gone or refuses is not worth a throw */ }
}

function wireEmbeds() {
  const onFile = location.protocol === 'file:';
  document.querySelectorAll('.figure-embed').forEach((fig) => {
    if (!(onFile && EMBED_NEEDS_ORIGIN[fig.dataset.embedProvider])) return;
    // Swap the frame for an instruction card rather than let the player
    // render its own Error 153 in front of a room.
    const frame = fig.querySelector('.embed-frame');
    if (!frame) return;
    frame.className = 'embed-blocked';
    frame.innerHTML =
      '<strong>This player needs the lecture served over http.</strong>' +
      '<div>A page opened from a file has no origin, and YouTube refuses to play without one.</div>' +
      '<div><code>node build.js &lt;source.md&gt; --serve</code></div>' +
      '<div>The address below works in any case.</div>';
  });
}

// Load a hosted player only once its chunk is the one on screen, and drop it
// again on the way out. Three reasons, in order of weight: a lecture must not
// open connections to a third party for slides nobody showed; clearing the
// src is also the only reliable way to stop a cross-origin player when you
// move on, since it will happily keep playing behind you; and a deck with
// several embeds otherwise pays for all of them at load.
//
// Nothing autoplays. Arriving at the slide gives you a loaded player waiting
// on its play button - starting it is the lecturer's move, and the room
// following is what the sync below is for.
function updateEmbedLoading() {
  const active = flatChunks[state.activeIdx];
  document.querySelectorAll('.figure-embed').forEach((fig) => {
    const ifr = fig.querySelector('iframe');
    if (!ifr) return;                       // swapped for the instruction card
    const isActive = !!active && active.el.contains(fig);
    if (isActive) {
      if (!ifr.getAttribute('src')) {
        ifr.setAttribute('src', ifr.dataset.src);
        // YouTube only reports state to a parent that has announced itself
        // on the widget channel, and only once the document is up.
        if (fig.dataset.embedProvider === 'youtube') {
          ifr.addEventListener('load', () => setTimeout(() => {
            try {
              ifr.contentWindow.postMessage(
                JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
            } catch (e) {}
          }, 300), { once: true });
        }
      }
    } else if (ifr.getAttribute('src')) {
      ifr.removeAttribute('src');
    }
  });
}

// Relay the lecturer's play/pause to the other window. There is no reliable
// way to observe a click *inside* a cross-origin frame, so the cockpit sends
// on the provider's own state events (YouTube) or player events (Vimeo).
let applyingRemoteEmbed = false;
function embedFigByUrl(url) {
  for (const fig of document.querySelectorAll('.figure-embed')) {
    if (fig.dataset.embedUrl === url) return fig;
  }
  return null;
}
window.addEventListener('message', (ev) => {
  const o = String(ev.origin || '');
  if (!/youtube|vimeo/.test(o)) return;
  let d = ev.data;
  try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
  if (!d || typeof d !== 'object') return;
  // Which of our frames sent this?
  let fig = null;
  for (const f of document.querySelectorAll('.figure-embed')) {
    const ifr = f.querySelector('iframe');
    if (ifr && ifr.contentWindow === ev.source) { fig = f; break; }
  }
  if (!fig) return;
  let action = null;
  if (fig.dataset.embedProvider === 'youtube' && d.info && typeof d.info.playerState === 'number') {
    if (d.info.playerState === 1) action = 'play';
    else if (d.info.playerState === 2) action = 'pause';
  } else if (fig.dataset.embedProvider === 'vimeo') {
    if (d.event === 'play') action = 'play';
    else if (d.event === 'pause') action = 'pause';
  }
  if (!action || applyingRemoteEmbed || !shouldBroadcast()) return;
  sendToPeer({ type: 'embed', source: VIEW, url: fig.dataset.embedUrl, action });
});
function applyRemoteEmbed(m) {
  const fig = embedFigByUrl(m.url);
  if (!fig) return;
  const ifr = fig.querySelector('iframe');
  if (!ifr) return;
  applyingRemoteEmbed = true;
  try { embedCommand(ifr.contentWindow, fig.dataset.embedProvider, m.action); }
  finally { setTimeout(() => { applyingRemoteEmbed = false; }, 400); }
}

// ── links ───────────────────────────────────────────────────────────
// A plain click opens the link in a new tab of whichever window was
// clicked. In the cockpit that is the lecturer checking a source, which is
// what they usually want; the deck itself never navigates away, because the
// renderer puts target="_blank" on external links.
//
// Shift-click instead shows the address on *both* screens, large. That is
// the deliberate answer to "can I open a tab on the projector": you could,
// but then the lecturer is driving a browser they cannot see, and the room
// is watching someone else's UI instead of the lecture. What a room
// actually needs from a link during a talk is to write it down. So the
// projection gets the URL to read, not a page to watch, and the cockpit
// shows the identical overlay so the lecturer knows exactly what went up.
const linkOverlay = document.getElementById('psiINT-link-overlay');
const linkOverlayUrl = document.getElementById('psiINT-link-overlay-url');
const linkOverlayLabel = document.getElementById('psiINT-link-overlay-label');
const linkOverlayQr = document.getElementById('psiINT-link-overlay-qr');
function linkOverlayVisible() {
  return !!linkOverlay && !linkOverlay.classList.contains('hidden');
}
function showLinkOverlay(href, label) {
  if (!linkOverlay) return;
  linkOverlayUrl.textContent = href;
  linkOverlayUrl.href = href;
  linkOverlayLabel.textContent = label && label !== href ? label : 'link';
  // Pre-rendered at build time, keyed by address. A link that is not in the
  // source (there is currently no way to reach one) simply gets no code
  // rather than an encoder in the browser.
  linkOverlayQr.innerHTML = (typeof LINK_QR === 'object' && LINK_QR[href]) || '';
  linkOverlay.classList.remove('hidden');
}
function hideLinkOverlay() {
  if (linkOverlay) linkOverlay.classList.add('hidden');
}
// Dismissing has to reach both screens, or the room is left staring at a
// URL the lecturer has already moved on from.
function dismissLinkOverlay() {
  if (!linkOverlayVisible()) return;
  hideLinkOverlay();
  sendToPeer({ type: 'link-hide', source: VIEW });
}
// Clicking the backdrop dismisses; clicking the address itself opens it in a
// new tab of this window and leaves the overlay up, so the room keeps the
// address on screen while the lecturer goes and looks. Selecting the text
// must not dismiss either, hence the collapsed-selection check.
if (linkOverlay) {
  linkOverlay.addEventListener('click', (e) => {
    if (e.target.closest('#psiINT-link-overlay-url')) return;
    const s = window.getSelection();
    if (s && !s.isCollapsed) return;
    dismissLinkOverlay();
  });
}
// What the cockpit says after it has sent an address: on the projection, or
// only here when there is none.
function addressShownText() {
  return hasLivePeer() ? 'address shown on the projection' : 'address shown here – no projection window open';
}
// Capture phase: this has to beat the stage's own click handling, which
// would otherwise treat the click as a chunk select.
// The mark after a link, and Shift-click, are one act with two ways in. The
// mark exists because the modifier is not discoverable: a reader who has not
// been told about it never finds the address or its code. Both end in the
// same call, so the projection, the peer message and the freeze rule cannot
// drift apart between them.
document.addEventListener('click', (e) => {
  const mark = e.target.closest && e.target.closest('button[data-link-code]');
  if (!mark) return;
  e.preventDefault();
  e.stopPropagation();
  const a = mark.previousElementSibling;
  const href = mark.dataset.linkCode;
  const label = (a && a.tagName === 'A' ? a.textContent : '').trim();
  showLinkOverlay(href, label);
  sendToPeer({ type: 'link-show', source: VIEW, href, label });
  if (VIEW === 'speaker') flashMode(addressShownText());
  // Chrome leaves a clicked button focused, and the guard above then hands
  // it the next Space - so a lecturer who clicked the mark and pressed Space
  // to move on would have re-opened the address instead. A keyboard
  // activation reports detail 0 and keeps its place in the tab order.
  if (e.detail > 0) mark.blur();
}, true);

document.addEventListener('click', (e) => {
  if (!e.shiftKey) return;
  // External only. A cross-reference resolves to a file:// path with a
  // fragment, which is noise on a projector and has no QR behind it.
  const a = e.target.closest && e.target.closest('#psiINT-stage a[href^="http"]');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  const href = a.href;
  const label = (a.textContent || '').trim();
  showLinkOverlay(href, label);
  // Ungated by freeze, like blank: showing the room an address is an
  // explicit act aimed at the projection, not shared navigation state.
  sendToPeer({ type: 'link-show', source: VIEW, href, label });
  if (VIEW === 'speaker') flashMode(addressShownText());
}, true);

// ── live demo (D) ───────────────────────────────────────────────────
// A window or a screen of this machine, put on the projection as video.
// The problem it answers is the extended desktop: the demo runs on the
// laptop screen, where the pointer and the keyboard are, and the room sees
// it without the displays being mirrored and un-mirrored around it, which
// loses every window position on the way back.
//
// getDisplayMedia needs a key press in the window that calls it and opens
// its picker in that window. So the cockpit captures and the projection
// shows: the picker lands on the laptop, never on the wall. Running alone,
// the audience window captures and shows for itself.
//
// Two ways from the capturing window to the showing one, chosen at run
// time. Served over http (--serve) the two windows are one origin and the
// projection plays the cockpit's MediaStream directly – a property call on
// the peer window, no copy, no encoder, no added latency. From file:// the
// windows are two opaque origins and that call throws, so the stream goes
// through an RTCPeerConnection on loopback, signalled over the same
// postMessage link as everything else. That path costs one encode; the
// contentHint and a raised bitrate keep text legible through it. Chromium
// 141 cannot transfer a MediaStreamTrack between windows in either case
// (measured), which is why the direct path is a call and not a transfer.
//
// A command to the projector, like blank: outside the snapshot, past the
// freeze gate. D again pauses it from either window and D once more shows
// it again: the capture keeps running while it is paused, so there is no
// second picker and the window chosen once comes back as it is now.
// Shift-D picks another window in its place. It ends with "End the live
// demo" in the palette, with Chrome's own "stop sharing" bar, or when the
// shared window closes - the track ends, and that ends the demo, so a D
// after that opens the picker again. track.stop() fires no 'ended' on the
// other side, so the stop is always also a message.
const DEMO_MAX_BITRATE = 40e6;
// A capture is never larger than a projector shows; a Retina or 5K screen
// captured at its own size is a copy per frame nobody sees the benefit of,
// and on the loopback path a frame size the software encoder cannot keep
// up with at all.
const DEMO_MAX_W = 2560, DEMO_MAX_H = 1600;
// Same origin is known at boot, not probed: two file:// windows both report
// the origin "null", and everything served reports a real one.
const DEMO_DIRECT = SELF_ORIGIN !== 'null';
const demoOverlay = document.getElementById('psiINT-demo-overlay');
const demoVideo = document.getElementById('psiINT-demo-video');
// The showing side. The stream may belong to another realm (the direct
// path) – srcObject takes it all the same. A paused demo keeps its stream
// on the video and only takes the overlay away, so showing it again is a
// class and not a new connection.
function applyDemoView() {
  const show = !!(demoOverlay && demoVideo && demoVideo.srcObject) && !demoPaused;
  if (demoOverlay) demoOverlay.classList.toggle('hidden', !show);
  document.body.classList.toggle('demo-live', show);
  applyDemoBadge();
}
function attachDemo(stream) {
  if (!demoOverlay || !demoVideo) return;
  demoVideo.srcObject = stream;
  applyDemoView();
  const p = demoVideo.play();
  if (p && p.catch) p.catch(() => {});
}
function detachDemo() {
  if (demoVideo) demoVideo.srcObject = null;
  if (demoPc) { demoPc.close(); demoPc = null; }
  demoRemoteReady = null;
  applyDemoView();
}
// The direct path's entry point, called by a same-origin peer window. The
// pause rides along, so a projection reloaded under a paused demo does not
// show it for the moment before the message saying so arrives.
window.psiDemoAttach = function (stream, paused) {
  if (paused !== undefined) demoPaused = !!paused;
  attachDemo(stream);
};

function endDemoLocally() {
  const s = demoStream;
  demoStream = null;
  demoRemoteLive = false;
  demoPaused = false;
  if (s) s.getTracks().forEach(t => t.stop());
  detachDemo();
}
function stopDemo() {
  endDemoLocally();
  sendToPeer({ type: 'demo', source: VIEW, action: 'stop' });
  flashMode('demo ended');
}
// Either window, whichever holds the capture: the state is mirrored on
// both sides by the message, as blank is.
function setDemoPaused(paused) {
  demoPaused = paused;
  applyDemoView();
  sendToPeer({ type: 'demo', source: VIEW, action: paused ? 'pause' : 'resume' });
  flashMode(paused ? 'demo paused – D shows it again' : 'demo live');
}
// replace: a demo is running and Shift-D asked for another window. A
// cancelled picker then keeps the one already shared.
async function startDemo(replace) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    flashMode('no screen capture in this browser');
    return;
  }
  // The cockpit never shows the picture itself, so without a projection
  // window a capture would run into nothing while the badge said DEMO.
  if (VIEW === 'speaker' && !hasLivePeer()) {
    flashMode('no projection window – S opens it');
    return;
  }
  demoPending = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: DEMO_MAX_W }, height: { max: DEMO_MAX_H },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
      // The picker offers windows and screens; not this browser window,
      // which would only ever show the room a picture of itself.
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
    });
  } catch (e) {
    // Cancelled in the picker, or refused by the OS: macOS asks once for
    // screen-recording rights and the first attempt fails (seen in Chromium
    // and Safari alike), so on a Mac the toast says what to do next.
    demoPending = false;
    if (replace && demoStream) { flashMode('demo: kept the window already shared'); return; }
    flashMode(/Mac/.test(navigator.platform || '')
      ? 'demo cancelled – the first capture on a Mac fails while macOS asks for screen-recording rights; allow it and press D again'
      : 'demo cancelled');
    return;
  }
  demoPending = false;
  const track = stream.getVideoTracks()[0];
  // Text over motion: the encoder keeps resolution and drops frames.
  track.contentHint = 'detail';
  const old = demoStream;
  demoStream = stream;
  // A window picked in place of another is shown, paused or not.
  demoPaused = false;
  // Chrome's own "stop sharing" bar ends the track, and so does closing the
  // shared window; that ends the demo too.
  track.addEventListener('ended', () => { if (demoStream === stream) stopDemo(); }, { once: true });
  if (VIEW === 'speaker') deliverDemo(stream, old);
  else attachDemo(stream);
  if (old) old.getTracks().forEach(t => t.stop());
  applyDemoBadge();
  sendToPeer({ type: 'demo', source: VIEW, action: 'live', paused: false });
  flashMode(old ? 'demo: another window' : 'demo live');
}
// D while the picker is still open is neither a start nor a stop. A demo
// that exists is paused or shown again, from whichever window; only with
// none does D open the picker.
function toggleDemo() {
  if (demoPending) return;
  if (demoOn()) setDemoPaused(!demoPaused);
  else startDemo();
}
// Shift-D: another window in place of the one shared. The picker opens in
// the window that holds the capture, so the projection hands the press on
// rather than putting a picker on the wall.
function switchDemo() {
  if (demoPending) return;
  if (demoStream) startDemo(true);
  else if (demoRemoteLive) flashMode('the cockpit holds the demo – Shift-D there picks another window');
  else startDemo();
}
// The palette's way out, from either window: the capture stops and the
// next D opens the picker again.
function endDemo() {
  if (demoOn()) stopDemo();
  else flashMode('no live demo running');
}
// The badge's buttons: the same two commands, for the hand that does not
// remember Shift-D. A click is a gesture, so the picker opens from it as it
// does from a key. Blurred after a pointer activation, as the link mark is,
// or the focused button would take the lecturer's next Space.
if (demoBadge) demoBadge.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.demo-btn');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.detail > 0) b.blur();
  if (b.dataset.demo === 'switch') switchDemo();
  else endDemo();
});
// A peer that has just appeared – a cockpit opened with S, a projection
// back from a reload – is handed the running demo again, paused or not.
// Called on hello.
function demoAnnounce() {
  if (!demoStream) return;
  if (VIEW === 'speaker') deliverDemo(demoStream);
  sendToPeer({ type: 'demo', source: VIEW, action: 'live', paused: demoPaused });
}
// Same origin: hand the stream over as an object. Otherwise the loopback
// connection - and when a running connection carries the window being
// replaced, the new track goes into its sender, with no new handshake and
// the bitrate already negotiated. A same-origin peer without the hook is a
// projection built before the demo existed, and that is said rather than
// silently re-routed to an offer it would never answer.
function deliverDemo(stream, replacing) {
  if (DEMO_DIRECT) {
    if (peer && typeof peer.psiDemoAttach === 'function') peer.psiDemoAttach(stream, demoPaused);
    else { endDemoLocally(); flashMode('demo: the projection window did not answer – rebuild it'); }
    return;
  }
  const sender = replacing && demoPc && demoPc.connectionState === 'connected' && demoPc.getSenders()[0];
  if (sender) {
    sender.replaceTrack(stream.getVideoTracks()[0])
      .catch(() => { if (demoStream === stream) demoSendOffer(stream); });
    return;
  }
  demoSendOffer(stream);
}
function demoNewPc() {
  // No ICE servers, deliberately: both ends are this machine, and a STUN
  // server here would make every D press reach the internet.
  const pc = new RTCPeerConnection();
  // A window picked in place of another over a connection that was not up
  // yet: the older one is dropped rather than left running beside it.
  if (demoPc) demoPc.close();
  demoPc = pc;
  demoRemoteReady = new Promise((resolve) => { pc.psiRemoteReady = resolve; });
  pc.onicecandidate = (ev) => {
    if (ev.candidate) sendToPeer({ type: 'demo-ice', source: VIEW, candidate: ev.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (demoPc !== pc) return;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      endDemoLocally();
      flashMode('demo: connection lost');
    }
  };
  return pc;
}
function demoSendOffer(stream) {
  if (typeof RTCPeerConnection !== 'function') { flashMode('demo: no WebRTC'); return; }
  const pc = demoNewPc();
  const sender = pc.addTrack(stream.getVideoTracks()[0], stream);
  // Loopback has bandwidth to spare; the default cap is tuned for the
  // internet and blurs a terminal the moment it scrolls. Set before the
  // offer and measured to survive negotiation in Chromium 141.
  const p = sender.getParameters();
  if (!p.encodings || !p.encodings.length) p.encodings = [{}];
  p.encodings[0].maxBitrate = DEMO_MAX_BITRATE;
  p.degradationPreference = 'maintain-resolution';
  sender.setParameters(p).catch(() => {});
  pc.createOffer()
    .then(o => pc.setLocalDescription(o))
    .then(() => sendToPeer({ type: 'demo-offer', source: VIEW, sdp: pc.localDescription.sdp }))
    .catch(() => { if (demoPc === pc) { endDemoLocally(); flashMode('demo: could not connect'); } });
}
// A fresh offer replaces whatever connection was up. Every await checks the
// connection is still the current one: a quick stop and start can leave an
// older handshake in flight, and it must neither speak nor toast.
async function demoReceiveOffer(m) {
  if (typeof RTCPeerConnection !== 'function') return;
  detachDemo();
  const pc = demoNewPc();
  pc.ontrack = (ev) => { if (demoPc === pc) attachDemo(ev.streams[0] || new MediaStream([ev.track])); };
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    if (demoPc !== pc) return;
    pc.psiRemoteReady();
    const a = await pc.createAnswer();
    if (demoPc !== pc) return;
    await pc.setLocalDescription(a);
    if (demoPc !== pc) return;
    sendToPeer({ type: 'demo-answer', source: VIEW, sdp: pc.localDescription.sdp });
  } catch (e) {
    if (demoPc === pc) { detachDemo(); flashMode('demo: could not connect'); }
  }
}
async function demoReceiveAnswer(m) {
  const pc = demoPc;
  if (!pc) return;
  try { await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) { return; }
  if (demoPc === pc) pc.psiRemoteReady();
}
// A candidate can arrive while setRemoteDescription is still pending on
// this side; it waits on the promise until the description is in.
function demoReceiveIce(m) {
  const pc = demoPc, ready = demoRemoteReady;
  if (!pc || !ready) return;
  ready.then(() => { if (demoPc === pc) return pc.addIceCandidate(m.candidate); }).catch(() => {});
}
// Closing or reloading the capturing window ends its tracks; the other
// window has to hear that, or the projection keeps a frozen last frame.
// Only the message – the browser tears down the rest.
window.addEventListener('pagehide', () => {
  if (demoStream) sendToPeer({ type: 'demo', source: VIEW, action: 'stop' });
});

// ── text selection ──────────────────────────────────────────────────
// The live views disable selection globally: drag pans the stage, and a
// stray highlight on the projection is a distraction that never stops being
// one. But "let me copy that definition" is a real request, from the
// lecturer mid-talk and from anyone reading the deck afterwards.
//
// Hold Alt rather than toggling a mode. A mode is state you can forget you
// are in – and the state you forget here is the one where dragging no
// longer pans, which is exactly the wrong surprise mid-lecture. Selecting
// is a momentary act, so a held key matches it.
//
// The class deliberately outlives the keyup while a selection exists: let
// go of Alt to reach Cmd-C and user-select would snap back to none, which
// in Chrome discards the highlight you just made.
let altSelectHeld = false;
function hasTextSelection() {
  const s = window.getSelection();
  return !!s && !s.isCollapsed && String(s).trim().length > 0;
}
function setSelecting(on) {
  document.body.classList.toggle('text-selecting', on);
}
function endSelecting() {
  const s = window.getSelection();
  if (s) s.removeAllRanges();
  setSelecting(false);
}
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Alt' || altSelectHeld) return;
  // Same guard the main key handler uses. Without it, reaching for Alt while
  // typing a note fires the toast - and on the audience that toast is
  // relayed, so it lands in the lecturer's face mid-sentence.
  if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable=true]')) return;
  altSelectHeld = true;
  setSelecting(true);
  flashMode('select text while Alt/option is held · Esc clears');
});
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt') return;
  altSelectHeld = false;
  if (!touchSelectOn && !hasTextSelection()) setSelecting(false);
});
document.addEventListener('selectionchange', () => {
  if (!altSelectHeld && !touchSelectOn && !hasTextSelection()) setSelecting(false);
});
// Alt-Tab away and the keyup never arrives, which would strand the stage in
// a state where dragging silently stops panning.
window.addEventListener('blur', () => {
  altSelectHeld = false;
  if (!touchSelectOn && !hasTextSelection()) setSelecting(false);
});

// ── the one question the click path asks ────────────────────────────
// Turning the stage selectable is not enough on its own: a drag across a
// code block still ends in a click on that block, and every handler that
// answers a click by navigating, focusing, closing or panning would answer
// this one too. That is how Alt-dragging a listing came to open the focus
// card instead of highlighting the line - and, with the card already open,
// to close it. Five sites stand aside for it, and they ask one predicate
// rather than each carrying its own copy of the condition: the two that
// decide at pointerdown ask whether this drag is going to select (the
// camera's pan, and the card's), the three that decide at click ask whether
// the gesture that just ended was a selection (the chunk, the focus target,
// and the card's click-to-close).
//
// The answer belongs to the gesture and not to the keyboard at the instant
// the click arrives, so it is decided at pointerdown and read at click: let
// go of Alt before the mouse comes up and the drag you are finishing is
// still the selection you started.
//
// Two signals rather than one, because they answer different halves. The
// class deliberately outlives the keyup while a highlight is still on screen
// - that is what lets a lecturer reach Cmd-C - so suppressing on the class
// alone would eat the first ordinary click after every selection, and
// clicking a figure to zoom it would do nothing until you clicked twice. The
// key alone is not enough either: a drag that starts on a standing highlight
// is the user still working with the selection, and the click that ends it
// must not zoom the block it happens to have crossed. So a held modifier
// means the pointer is selecting whatever it does, and a standing highlight
// means a drag is.
function stageSelectable() { return document.body.classList.contains('text-selecting'); }
function selectionModeOn() { return altSelectHeld || touchSelectOn; }
const pointerGesture = { selectable: false, mode: false, x: 0, y: 0 };
// Capture, on the document, so it is recorded before any handler that will
// go on to read it - including the ones bound to the stage and the overlay.
document.addEventListener('pointerdown', (e) => {
  pointerGesture.selectable = stageSelectable();
  pointerGesture.mode = selectionModeOn();
  pointerGesture.x = e.clientX;
  pointerGesture.y = e.clientY;
}, true);
// The same 3px the pan handlers use to tell a drag from a tap, measured
// against the click's own coordinates so no extra pointermove listener has
// to run for every gesture on the page.
function gestureSelects(ev) {
  if (pointerGesture.mode) return true;
  if (!pointerGesture.selectable) return false;
  return Math.abs((ev.clientX || 0) - pointerGesture.x) > 3
      || Math.abs((ev.clientY || 0) - pointerGesture.y) > 3;
}

// Mode badge
let modeTimer = null;
function showModeBadge(text) {
  modeBadge.textContent = text;
  modeBadge.classList.add('visible');
  if (modeTimer) clearTimeout(modeTimer);
  modeTimer = setTimeout(() => modeBadge.classList.remove('visible'), 1800);
}
// A mode toast is feedback for the lecturer, so it belongs on the screen the
// lecturer is looking at – the cockpit – no matter which window the key was
// pressed in. The room should not have to watch "auto-fit on" slide across
// the projection. The audience only shows toasts when it is running alone.
function flashMode(text) {
  if (!lecturerScreen()) {
    sendToPeer({ type: 'toast', source: VIEW, text: text });
    return;
  }
  showModeBadge(text);
}
// A view that is not beside this file: the S or P press says so in the
// mode badge and opens nothing, and the start menu leaves its entry out.
// Two answers, the build's and the page's own, and the page's wins:
//
// - window.PSI_ABSENT_VIEWS, written by the build only when a view was
//   missing when it ran. A hint and not a verdict: it is known before
//   anything is pressed, which is why the start menu is drawn without the
//   entry, but a later partial build can write the view beside this file
//   without rewriting this file - --audience-only, then --speaker-only, then
//   --print-only into an empty folder left an audience.html that said both
//   were missing and never looked. It decides only where the page cannot
//   ask (no file: or http(s): address, or a probe that never answers).
// - A probe at run time, for the view that was there when the build ran and
//   is not now - audience.html mailed on alone, or copied out of its folder -
//   and for the one that was not there and is now.
//   Under http(s) it is a HEAD request. From file:// no request can read a
//   file, but a script element can try to load one, and the load and error
//   events tell the two apart - measured in Chrome 154, Firefox 156 and
//   Safari 26.6: load for a view that is there, error for one that is not,
//   in every one. Nothing in the file runs: a view starts with its doctype,
//   which is a syntax error before the first statement, and that error is
//   taken off the console while the probe stands (a missing file does put
//   its "not found" line there, which is the one case it is news). The
//   probe runs on a press of S or P and when the start menu is shown, never
//   on a page load the menu does not stand on.
//
// The answer is kept, so the next press can open its window inside the
// gesture rather than after the probe; a press re-asks in the background,
// so a view that appears later, or goes, is found by the next one.
const viewThere = Object.create(null);
function buildSaysAbsent(name) {
  const absent = window.PSI_ABSENT_VIEWS;
  return !!(absent && absent.indexOf(name) >= 0);
}
function probeView(name, done) {
  const file = name + '.html';
  const settle = (there) => { viewThere[name] = there; if (done) done(there); };
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    fetch(file, { method: 'HEAD', cache: 'no-store' })
      .then((r) => settle(r.status !== 404 && r.status !== 410), () => settle(!buildSaysAbsent(name)));
    return;
  }
  if (location.protocol !== 'file:') { settle(!buildSaysAbsent(name)); return; }
  const want = new URL(file, location.href).href;
  const quiet = (ev) => {
    if (ev.filename === want || (!ev.filename && /^Script error/.test(ev.message || ''))) ev.preventDefault();
  };
  const s = document.createElement('script');
  let over = false;
  const end = (there) => {
    if (over) return;
    over = true;
    s.remove();
    window.removeEventListener('error', quiet, true);
    settle(there);
  };
  window.addEventListener('error', quiet, true);
  s.onload = () => end(true);
  s.onerror = () => end(false);
  s.src = file;
  document.head.appendChild(s);
  // No answer at all is not an answer that the file is missing - unless the
  // build said so.
  setTimeout(() => end(!buildSaysAbsent(name)), 3000);
}
// Opens the view through open() when it is there, says so when it is not.
function withView(name, open) {
  const absent = () => flashMode(name + '.html is not beside this file');
  if (viewThere[name] === true) { open(); probeView(name); return; }
  probeView(name, (there) => (there ? open() : absent()));
}

// ── fullscreen (W) ───────────────────────────────────────────────────
//
// A room wants the slide and nothing else, and a browser window carries an
// address bar, a tab strip and a menu bar above it. W takes them off.
//
// **W means the projection, Shift-W means this window.** In the audience the
// two are the same window, so plain W there is simply this one going
// fullscreen. In the cockpit plain W is a command sent to the projector and
// the cockpit stays in its window, which is what a lecturer reading notes off
// a laptop wants; Shift-W is the cockpit's own frame, for the one-screen case
// where the cockpit IS the thing to fill.
//
// The whole difficulty is that requestFullscreen is one of the calls a
// browser answers only to a user gesture **in the window that makes it**, and
// the lecturer's keyboard is in the cockpit. Measured in Chromium, headless
// and headed alike: a requestFullscreen inside a message handler is refused
// with "TypeError: Permissions check failed". So the cockpit's W cannot put
// the room's window into fullscreen - it *arms* it. The projection shows one
// line in the corner and spends the next click anywhere on it, or W on its
// own keyboard, on entering. The arming lapses after ARM_MS, because an
// affordance nobody took must not stay on the wall for the rest of the talk.
//
// **Leaving costs nothing.** exitFullscreen needs no gesture, so the cockpit's
// W takes the projection straight back out with no hint and no click. The
// asymmetry is the browser's, not this tool's.
//
// **Nothing of this is in the state snapshot.** Fullscreen is a property of
// one window on one screen - the projector is full and the laptop is not -
// and applyRemoteState is a full apply, so a snapshot sent to carry it would
// drag the receiver's slide position with it. The projection instead reports
// where it is on every fullscreenchange, which is what lets the cockpit's W
// toggle the right way after an Escape nobody told it about.
//
// The frame changes size on the way in and on the way out, and everything
// solved against it is then stale; the resize listener further down re-runs
// the fit and re-sends slide-ref, which is why there is no re-measure here.
const FULLSCREEN_ARM_MS = 20000;
const fsHint = document.getElementById('psiINT-fullscreen-hint');
let fsArmTimer = null;
let fsArmedClick = null;
let peerFullscreen = false;
function fullscreenOn() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
// The two prefixed spellings Safari still needs, and a rejected promise
// wherever the call is refused - Chromium throws this one synchronously.
function requestFullscreenHere() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return Promise.reject(new Error('no fullscreen here'));
  try { return Promise.resolve(fn.call(el)); } catch (err) { return Promise.reject(err); }
}
function exitFullscreenHere() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return Promise.reject(new Error('no fullscreen here'));
  try { return Promise.resolve(fn.call(document)); } catch (err) { return Promise.reject(err); }
}
function disarmFullscreen() {
  if (fsArmTimer) { clearTimeout(fsArmTimer); fsArmTimer = null; }
  if (fsArmedClick) { window.removeEventListener('click', fsArmedClick, true); fsArmedClick = null; }
  if (fsHint) fsHint.classList.add('hidden');
}
// The capture phase and one shot: the click that answers the hint must not
// also focus the figure it happened to land on. One press, one thing.
function armFullscreen() {
  if (fullscreenOn()) return;
  disarmFullscreen();
  if (fsHint) fsHint.classList.remove('hidden');
  fsArmedClick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fsArmedClick = null;
    disarmFullscreen();
    requestFullscreenHere().catch(() => {});
  };
  window.addEventListener('click', fsArmedClick, true);
  fsArmTimer = setTimeout(disarmFullscreen, FULLSCREEN_ARM_MS);
}
// This window's own frame, off a key press in it - the one path a browser
// grants without argument.
function toggleFullscreenHere() {
  disarmFullscreen();
  if (fullscreenOn()) exitFullscreenHere().catch(() => {});
  else requestFullscreenHere().catch(() => flashMode('this browser would not go fullscreen'));
}
function toggleProjectionFullscreen() {
  if (VIEW !== 'speaker') { endStartMenu(); toggleFullscreenHere(); return; }
  if (!hasLivePeer()) { flashMode('no projection window – S opens it · Shift-W fills this one'); return; }
  const want = !peerFullscreen;
  sendToPeer({ type: 'fullscreen', source: VIEW, action: want ? 'enter' : 'exit' });
  flashMode(want
    ? 'fullscreen asked for – click the projection once, or hit W on it'
    : 'projection back in its window');
}
// Told, not assumed: an Escape on the projection is the browser's own way out
// and never passes through this tool at all.
function announceFullscreen() {
  if (VIEW === 'audience') {
    sendToPeer({ type: 'fullscreen', source: VIEW, action: 'state', on: fullscreenOn() });
  }
}
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
  document.addEventListener(ev, () => {
    if (fullscreenOn()) { disarmFullscreen(); endStartMenu(); }
    announceFullscreen();
  });
});

// Keyboard
//
// What a key means is one table, commands.mjs, which reaches the page as
// PSI_COMMANDS: COMMAND_KEYS is this view's combo-to-command map, and
// COMMAND_RUN below says what each command does - each entry is the body of
// the case it replaced in the switch that used to stand here, guards and all.
// The ? panel is rendered from the same table, so a key cannot be bound
// without a row (test/gates/commands.mjs holds the rest).
//
// runtime/speaker.js and runtime/souffleuse.js add their own commands by
// assigning into COMMAND_RUN, the way they set viewHooks; a command this view's table has
// and nothing here runs is a press spent on nothing.
//
// What stays code is the listener's head: the rules about *where* a key was
// pressed - a text field, the ? panel's search, the search box, the link
// mark, a modifier chord, the go-to prompt, the overview board - which come
// before any command is looked up.
const COMMAND_KEYS = PSI_COMMANDS.keyMap(VIEW);
const COMMAND_RUN = {
  // Forward and back are one pair everywhere - across reveals, across
  // chunks, across columns - and Shift is the column modifier from any
  // slide. That is the whole model, and it replaced one where the sideways
  // arrows changed column on the first chunk of a column and meant
  // forward/back on every other: an exception on exactly the slides a
  // lecturer arrives at, which is the worst place to keep one.
  // Shift collides with nothing here: the arrows are not cycling keys, so
  // it does not meet the Shift that runs C, F, A and L backwards.
  // updateNavHints still paints a mark, and it says something else now -
  // not "sideways changes column on this slide" but "the next forward press
  // leaves this column", which is a fact about the key already under the
  // finger rather than about a key that might not be pressed.
  //
  // Down, Space, Enter and a presenter's forward button are one key, and
  // Up, PageUp and Backspace are its mirror. Down used to skip straight to
  // the next chunk, which meant walking a segmented slide with the arrows
  // silently swallowed every reveal on it – and remembering to switch to
  // Space for exactly those slides is the kind of thing that goes wrong in
  // front of a room. It never swallows one now, in either direction.
  //
  // Enter is the one of them with a mind of its own: in overview it lands
  // on the selected slide, and in the cockpit viewHooks.onEnter may spend it
  // on skipping the rest of this slide's cue cards.
  'forward': (e) => {
    if (e.key === 'Enter') {
      if (overview) { toggleOverview(); e.preventDefault(); return; }
      if (viewHooks.onEnter()) { viewHooks.onPress(false); e.preventDefault(); return; }
    } else if (overview) { e.preventDefault(); return; }
    goForward();
    e.preventDefault();
  },
  'back': (e) => {
    if (overview) { e.preventDefault(); return; }
    goBack(); e.preventDefault();
  },
  'next-column': (e) => { nextCol(); e.preventDefault(); },
  'prev-column': (e) => { prevCol(); e.preventDefault(); },
  'expansion': (e) => {
    if (overview) return;
    const n = parseInt(e.key, 10) - 1;
    const entry = flatChunks[state.activeIdx];
    if (entry && entry.el.querySelector(`.exp-chev[data-exp="${n}"]`)) toggleExp(state.activeIdx, n);
    e.preventDefault();
  },
  'escape': (e) => {
    // Help sits in front of everything, so it unwinds first.
    if (helpVisible()) { toggleHelp(false); e.preventDefault(); return; }
    // The address overlay covers both screens, so it unwinds early – and
    // on both, or the room would be left staring at a URL.
    if (linkOverlayVisible()) { dismissLinkOverlay(); e.preventDefault(); return; }
    // A whisper from the prompter arrived uninvited and is in the way of
    // nothing, so it goes before a highlight the lecturer made on purpose
    // – and it goes on the first Esc, which is what a hand reaches for
    // when a line has been read and is now in the way.
    if (viewHooks.escapePrompter()) { e.preventDefault(); return; }
    // A live highlight is the most recent thing the user did, so it is
    // the first thing Esc should take back.
    if (hasTextSelection() || touchSelectOn) {
      setTouchSelect(false);
      endSelecting();
      const sb = document.querySelector('#psiINT-touch-controls [data-action=select]');
      if (sb) sb.setAttribute('aria-pressed', 'false');
      e.preventDefault(); return;
    }
    if (focusedFigure) {
      unfocusFigure();
      if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
      return;
    }
    if (tocVisible) { tocVisible = false; document.body.classList.remove('toc-visible'); return; }
    if (overview) { dismissOverviewNoMove(); return; }
    if (annotEditingId) { blurAnnotation(); return; }
    // A brought-in aside is a camera state like the drag-pan, and it is
    // the more recent of the two, so it unwinds first.
    if (asidePan) {
      clearAsidePan();
      focusCamera(false);
      if (shouldBroadcast()) sendToPeer({ type: 'figure-unpan' });
      return;
    }
    if (manualPan.dx || manualPan.dy) { manualPan = { dx: 0, dy: 0 }; focusCamera(false); return; }
    if (openExp) { closeAnyExpansion(); broadcastState(); setTimeout(() => focusCamera(false), 20); }
  },
  'annotate': (e) => {
    if (overview) return;
    const entry = flatChunks[state.activeIdx];
    if (entry) viewHooks.onN(entry);
    e.preventDefault();
  },
  'collapse': (e) => { cycleCollapse(1); e.preventDefault(); },
  'collapse-back': (e) => { cycleCollapse(-1); e.preventDefault(); },
  'font': (e) => { cycleFont(1); e.preventDefault(); },
  'font-back': (e) => { cycleFont(-1); e.preventDefault(); },
  'theme': (e) => { cycleTheme(1); e.preventDefault(); },
  'theme-back': (e) => { cycleTheme(-1); e.preventDefault(); },
  'slide-numbers': (e) => { cycleSlideNums(1); e.preventDefault(); },
  'slide-numbers-back': (e) => { cycleSlideNums(-1); e.preventDefault(); },
  // The one command no key reaches: the palette runs it (runCommand), with
  // an event that names no key.
  'pitchblack': (e) => { togglePitchblack(); e.preventDefault(); },
  // The add-note affordance on the projection, shown or hidden. A bare
  // free letter and not a Shift pair: Shift-B was the obvious mnemonic
  // (both take something off the screen) and is exactly the one that
  // cannot be taken, because B is what a hand reaches for when something
  // has to be off the projection now and a mistyped Shift must not turn
  // that into a chrome toggle.
  'note-button': (e) => {
    setNoteButton(state.noteButton === 'off' ? 'on' : 'off', true);
    e.preventDefault();
  },
  'overview': (e) => { toggleOverview(); e.preventDefault(); },
  // The cue cards are the cockpit's, which replaces this entry; here the
  // press is spent on nothing, as it always was.
  'cue-cards': (e) => { if (overview) return; e.preventDefault(); },
  'toc': (e) => { toggleToc(); e.preventDefault(); },
  // The third way to reach a slide, beside the board and the search. It
  // works in overview too, where it lands the same way a committed search
  // hit does - there is no reason for the board to be the one place a
  // lecturer who knows the number has to hunt for it.
  'goto': (e) => { startGoto(); e.preventDefault(); },
  'search': (e) => { startSearch(); e.preventDefault(); },
  'auto-fit': (e) => { cycleAutoFit(1); e.preventDefault(); },
  'zoom-in': (e) => {
    if (focusedFigure) setFigureScale(figureScale * 1.2);
    else stepZoom(1);
    e.preventDefault();
  },
  'zoom-out': (e) => {
    if (focusedFigure) setFigureScale(figureScale / 1.2);
    else stepZoom(-1);
    e.preventDefault();
  },
  'timer': (e) => {
    openCountdownModal();
    e.preventDefault();
  },
  'zoom-reset': (e) => {
    if (focusedFigure) {
      resetFigureView();
      applyFigureTransform();
      broadcastFigureView();
    } else setZoom(1.35);
    e.preventDefault();
  },
  'blank': (e) => {
    // A cockpit with no projection has nothing to blank, and saying
    // "projection blanked" there is the same false comfort as below. A blank
    // still standing from before the projection went can be lifted, so the
    // BLANK badge does not outlive it.
    const alone = VIEW === 'speaker' && !hasLivePeer();
    if (alone && !state.blanked) {
      flashMode('no projection window – nothing to blank · S opens it');
      e.preventDefault();
      return;
    }
    state.blanked = !state.blanked;
    applyState();
    // Blanking is a command to the projector, so it outranks the freeze
    // gate. Without this line, hitting B while frozen would toast
    // "projection blanked" at a projection that stayed lit – the one
    // failure that has to not happen, since B is what you reach for when
    // something must come off the screen now.
    if (VIEW === 'speaker') {
      sendToPeer({ type: 'blank', source: VIEW, blanked: state.blanked });
    }
    flashMode(alone ? 'blank lifted – no projection window open'
      : state.blanked ? 'projection blanked' : 'projection back');
    e.preventDefault();
  },
  // W is the projection's frame, Shift-W is this window's - see the
  // fullscreen section for why the cockpit's W can only arm the
  // projection and not enter it for the lecturer. A free letter and not
  // a Shift pair on B or F: F is the font cycle, and Shift-B is the one
  // pair that cannot be taken, for the reason M records. In the audience
  // the projection is this window, so Shift-W, which has no entry of its
  // own there, reaches this one and does the same.
  'fullscreen': (e) => { toggleProjectionFullscreen(); e.preventDefault(); },
  // A view this build left without its sibling (see siblingViewsAbsent)
  // says so rather than opening a window onto a missing file. The cockpit
  // runs this same function for its P and its palette row - runtime/speaker.js
  // must not assign a print of its own that skips withView.
  'print': (e) => {
    e.preventDefault();
    withView('print', () => window.open('print.html', '_blank', 'noopener'));
  },
  // Live demo: a window or a screen of this machine on the projection.
  // Pressed in the cockpit, the picker opens on the laptop and the room
  // sees the picture; pressed again anywhere, the room is back on the
  // slides while the capture waits, and once more brings it back without a
  // picker. No overview guard, as on B: taking it off the wall is the
  // urgent half. Shift-D picks another window; the palette ends it.
  'demo': (e) => { toggleDemo(); e.preventDefault(); },
  'demo-switch': (e) => { switchDemo(); e.preventDefault(); },
  'demo-end': (e) => { endDemo(); if (e) e.preventDefault(); },
  // Shift-E copies live annotation drafts to the clipboard for paste-back
  // into source.md. Plain E is unbound; the cockpit replaces this entry with
  // its own export.
  'export-annotations': (e) => { exportAnnotationsPlain(); e.preventDefault(); },
  // Only in audience: open the speaker window and remember it as our peer.
  // A cockpit that is already open is brought forward, never opened again
  // (openViewWindow); one this window cannot reach is named rather than
  // doubled (cockpitElsewhere). The cockpit's S is the projection command in
  // runtime/speaker.js.
  'cockpit': (e) => {
    e.preventDefault();
    if (hasLivePeer()) { try { peer.focus(); } catch (err) {} return; }
    if (!pairedBefore() && cockpitElsewhere()) return;
    withView('speaker', () => openViewWindow('speaker'));
  },
  'help': (e) => { toggleHelp(); e.preventDefault(); },
};
// The two windows each open the other under a fixed name: the projection's S
// the cockpit, the cockpit's S the projection. Whichever opened the other is
// its opener, which is the relationship postMessage rides on (isPeerWindow).
const VIEW_WINDOWS = {
  speaker: { name: 'psi-slides-speaker', features: 'width=1400,height=900' },
  audience: { name: 'psi-slides-audience', features: 'width=1280,height=720' },
};
// How long a found window has to say which deck it shows. It answers from
// its message handler, so a few milliseconds when it is there at all;
// silence means a page that is no view of this build.
const VIEW_ASK_MS = 250;
let viewAsk = null;
// Opens the other view, or finds it. A window that is already open is
// brought forward, never opened again: window.open with a URL re-navigates
// the named window, which reloaded the cockpit and lost its freeze, its
// clock and its cue cursor. Opening with an empty URL finds the named window
// without navigating it; only when that is not already this deck's view is
// it sent to the file. Whether it is this deck's is read off its address
// where the address can be read, and asked where it cannot.
//
// The cockpit does not take the window as its peer here: a projection that
// boots says so to its opener (here), and one that was already standing is
// asked (ping), and the answer is what makes it the peer - the footer says
// "live" only once a projection has spoken.
function openViewWindow(view) {
  const spec = VIEW_WINDOWS[view];
  const w = window.open('', spec.name, spec.features);
  if (!w) return;
  try { w.focus(); } catch (err) {}
  const adopt = () => {
    if (view === 'speaker') setPeer(w);
    else { try { w.postMessage({ type: 'ping', source: VIEW, deck: DECK_ID }, '*'); } catch (err) {} }
  };
  // Readable means same origin: a blank window, or under --serve a page
  // that may be another deck's view - either way, unless it already is
  // this deck's, it is sent there.
  const want = new URL(view + '.html', location.href).href;
  let here = null;
  try { here = String(w.location.href).split(/[?#]/)[0]; } catch (err) { here = null; }
  if (here !== null) {
    if (here !== want) { w.location.href = want; if (view === 'speaker') setPeer(w); }
    else adopt();
    return;
  }
  // Unreadable: a page from another file:// address. That used to be taken
  // for this deck's cockpit, and on a tab that had gone from one deck to
  // another it was the first deck's, driven by the second. So it is asked,
  // and only an answer naming this deck and this view keeps it as it is;
  // another deck, or no answer, and it is sent to this deck's file.
  if (viewAsk) clearTimeout(viewAsk.timer);
  const ask = { w, view, timer: 0 };
  ask.settle = (ours) => {
    if (viewAsk !== ask) return;
    viewAsk = null;
    clearTimeout(ask.timer);
    if (w.closed) return;
    if (!ours) {
      try { w.location.href = want; } catch (err) { return; }
      if (view === 'speaker') setPeer(w);
      return;
    }
    adopt();
  };
  viewAsk = ask;
  ask.timer = setTimeout(() => ask.settle(false), VIEW_ASK_MS);
  try { w.postMessage({ type: 'whois', source: VIEW }, '*'); } catch (err) { ask.settle(false); }
}
// A projection opened from the cockpit tells its opener it is there, and the
// cockpit hands it the slide (viewHooks.onPeerBoot). Not adopted as the peer
// on its own word: an opener can be any page, and only a cockpit of this deck
// answers.
if (VIEW === 'audience' && window.opener && window.opener !== window) {
  try { window.opener.postMessage({ type: 'here', source: VIEW, deck: DECK_ID }, '*'); } catch (err) {}
}
// A cockpit of this deck that this window cannot reach. A projection opened
// by hand in a new tab or window has no relation to a cockpit already
// running - the browser keeps the two apart, so neither the named-window
// lookup nor a message finds it - and its S used to open a second cockpit
// with its clock at 0:00 while the first drove nothing. The cockpit writes a
// heartbeat into localStorage (one store for every file:// page in Chrome
// and Safari, and for every page under --serve), and S here reads it: a
// fresh one says where the cockpit is, and a second S within
// COCKPIT_ELSEWHERE_MS opens another one anyway. Firefox keeps a store per
// file, so there the heartbeat is never seen and S opens a cockpit as before.
const COCKPIT_BEAT_KEY = 'psi-slides:cockpit-beat:' + DECK_ID;
const COCKPIT_BEAT_MS = 5000;
const COCKPIT_ELSEWHERE_MS = 10000;
let cockpitWarnedAt = 0;
function cockpitElsewhere() {
  let beat = 0;
  try { beat = Number(localStorage.getItem(COCKPIT_BEAT_KEY)) || 0; } catch (err) { return false; }
  const now = Date.now();
  if (!beat || now - beat > COCKPIT_BEAT_MS * 3) return false;
  if (now - cockpitWarnedAt < COCKPIT_ELSEWHERE_MS) { cockpitWarnedAt = 0; return false; }
  cockpitWarnedAt = now;
  flashMode('a cockpit is open in another window – S there opens the projection · S again opens a second one');
  return true;
}
// A field a key types into stands outside the key map. The cockpit's notes
// field is the exception while it is read-only: it is focusable but not being
// edited, and a presenter remote's keys have to reach the deck through it.
function typingIn(el) {
  return el.matches('input,textarea,select') && !el.matches('#psiINT-notes-content[readonly]');
}
document.addEventListener('keydown', (e) => {
  if (e.target.matches('.annot-textarea')) return;
  // Cmd-K / Ctrl-K: the ? panel as a command palette. Ahead of the guard
  // further down that hands every Cmd and Ctrl chord to the browser, and
  // nowhere a person is typing - except the panel's own field, where it
  // closes the panel again.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    if (e.target !== helpSearch && (typingIn(e.target) || e.target.isContentEditable)) return;
    openPalette();
    e.preventDefault();
    return;
  }
  // The ? panel's search field: every key types, except the two that close
  // and the three that pick and run a row.
  if (e.target === helpSearch) {
    if (e.key === 'Escape') {
      if (helpSearch.value) { helpSearch.value = ''; filterHelp(); }
      else toggleHelp(false);
      e.preventDefault();
    } else if (e.key === '?' && !helpSearch.value) {
      toggleHelp(false);
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      moveHelpSel(e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      pageHelpSel(e.key === 'PageDown' ? 1 : -1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (helpSel) runHelpRow(helpSel);
      e.preventDefault();
    }
    return;
  }
  // Search input: Enter commits, Esc exits search; other keys bubble to input.
  if (e.target === searchInput) {
    if (e.key === 'Enter') { commitSearchHit(); e.preventDefault(); }
    else if (e.key === 'Escape') { endSearch(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { moveSearchCursor(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { moveSearchCursor(-1); e.preventDefault(); }
    // typing is handled by the 'input' event listener on the input
    return;
  }
  if (typingIn(e.target)) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  // A focused control has to be able to answer its own key. Space on the
  // focused link mark advanced the deck instead of showing the address, so
  // the mark was reachable by mouse alone - which is the thing it exists to
  // stop being. Narrow to that one button on purpose: standing back for
  // every button would take Space away from a lecturer who had just clicked
  // the freeze control and still expected the next press to advance.
  if (e.target.closest && e.target.closest('button[data-link-code]')
      && (e.key === 'Enter' || e.key === ' ')) return;
  // A browser or system shortcut is not a slide command. Every binding here
  // is a bare letter, so Cmd-C reached the c case and toggled the collapse
  // instead of copying the selection – on a view that has an Alt-to-select
  // mode, which makes copying something a reader is invited to do. The same
  // held for Cmd-A, Cmd-F, Cmd-P and Ctrl-R.
  //
  // Shift is deliberately absent from this list: Shift-N, Shift-E, Shift-V
  // and the reverse-cycling Shift-C are real bindings. Alt is here even
  // though holding Alt alone starts text selection – that listener tests the
  // key name, and Alt with a letter is a character on macOS, not a command.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // The go-to prompt is modal over the key map, and it stands after the
  // guards above rather than before them: an annotation textarea and the
  // search box answer their own keys first, so a digit typed into either
  // one goes where the caret is. Cmd and Ctrl have already left, so a
  // browser shortcut still works with the prompt open.
  if (gotoActive) { gotoKey(e); return; }
  // In overview the arrows move the *selection*, never the live slide.
  // They used to fall through to nextChunk/nextCol, which silently
  // re-pointed the active chunk while the visible outline stayed put –
  // so an Esc afterwards dropped you on a slide you never picked.
  if (overview) {
    switch (e.key) {
      case 'ArrowDown':  setSelectedIdx(selectedIdx + 1, { recenter: true }); e.preventDefault(); return;
      case 'ArrowUp':    setSelectedIdx(selectedIdx - 1, { recenter: true }); e.preventDefault(); return;
      case 'ArrowRight': selectOverviewCol(1);  e.preventDefault(); return;
      case 'ArrowLeft':  selectOverviewCol(-1); e.preventDefault(); return;
    }
  }
  const id = PSI_COMMANDS.commandFor(COMMAND_KEYS, e);
  if (id && COMMAND_RUN[id]) COMMAND_RUN[id](e);
});

// Search input: live-filter on every keystroke.
searchInput.addEventListener('input', updateSearch);
// Clicking a hit is the same commitment as Enter on it. mousedown rather
// than click, because the input loses focus first and a click would then
// land after endSearch has already torn the list down.
searchResults.addEventListener('mousedown', (e) => {
  const li = e.target.closest('[data-hit]');
  if (!li) return;
  e.preventDefault();
  searchCursor = parseInt(li.dataset.hit, 10) || 0;
  commitSearchHit();
});

// ── wheel zoom, shared by the overview camera and the focus card ──
//
// Both zooms used to answer a wheel event with a fixed factor picked off the
// sign of deltaY, which got three things wrong. The numbers below are from a
// macOS trackpad in Chrome, 991 events over 12 gestures, not from assumption:
// events arrive every 8.4 ms, and one carries between 0.012 and 6 px.
//
//  - A fixed step makes the zoom a function of how many events arrived
//    rather than of how far the fingers moved. Twenty-two events at 1.1
//    crossed the focus card's whole 1x..8x range and thirty-three at 1.08
//    crossed the board's 0.08x..1x - 183 ms and 276 ms of contact - so both
//    stood at their ceiling before the gesture was properly under way.
//    Worse, macOS keeps sending an inertia tail once the fingers lift -
//    deltaY around 0.2, gaps widening past 100 ms, the sign flipping as it
//    dies out - and each of those was another full 8 % in whichever
//    direction, which is the bounce the lecturer felt.
//  - Scaling by exp() rather than multiplying a constant also makes the
//    gesture composable: two events of 1 px land exactly where one of 2 px
//    does, so the coalescing below cannot change where a gesture ends up.
//  - A mouse wheel is not a trackpad. One notch is 100-120 px where the
//    largest measured trackpad event was 6, so an unclamped exp() would
//    zoom 3.3x per notch. Clamping the per-event delta leaves every
//    trackpad event untouched and turns a notch into about 13 %.
//
// deltaMode is 0 (pixels) for every trackpad event, but a device sending
// lines or pages still has to mean something, so convert before clamping.
const ZOOM_K = 0.01;           // the full 1x..8x range ~= 208 px of travel
const ZOOM_MAX_STEP_PX = 12;   // 2x the largest delta the trackpad produced
const ZOOM_QUIET_MS = 160;     // longer than the gaps in the inertia tail
function wheelZoomPx(e) {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= window.innerHeight;
  return Math.max(-ZOOM_MAX_STEP_PX, Math.min(ZOOM_MAX_STEP_PX, dy));
}
const zoomScaleFor = (px) => Math.exp(-px * ZOOM_K);
// Hold the matching no-transition class for the length of the gesture. A
// wheel stream has no end event, so a quiet period ends it; the timer is per
// class so zooming the board and then a card cannot leave one of them stuck.
const zoomQuietTimers = {};
function markZooming(cls) {
  document.body.classList.add(cls);
  clearTimeout(zoomQuietTimers[cls]);
  zoomQuietTimers[cls] = setTimeout(() => {
    document.body.classList.remove(cls);
  }, ZOOM_QUIET_MS);
}

// Overview: wheel adjusts scale, pointer drag pans.
let overviewZoomPx = 0, overviewZoomRaf = 0, overviewZoomAt = null;
viewport.addEventListener('wheel', (e) => {
  if (!overview) return;
  e.preventDefault();
  markZooming('overview-zooming');
  // Coalesce to one apply per frame. Two events land inside a 60 Hz frame at
  // this event rate, and applyOverviewCamera walks offsetLeft/offsetTop up
  // the offsetParent chain before it writes the transform - so a second
  // apply in one frame buys a second forced reflow and a paint nobody sees.
  overviewZoomPx += wheelZoomPx(e);
  overviewZoomAt = { x: e.clientX, y: e.clientY };
  if (overviewZoomRaf) return;
  overviewZoomRaf = requestAnimationFrame(() => {
    overviewZoomRaf = 0;
    const px = overviewZoomPx;
    overviewZoomPx = 0;
    const next = Math.max(OVERVIEW_MIN_SCALE,
      Math.min(OVERVIEW_MAX_SCALE, overviewScale * zoomScaleFor(px)));
    const r = next / overviewScale;
    // Hold the board still under the cursor. applyOverviewCamera puts the
    // anchor chunk's centre at the viewport centre and then adds manualPan,
    // so both the anchor and the scale cancel out of the correction and one
    // step on manualPan is all that is left:
    //
    //   pan' = pan + (1 - r) * (Q - viewportCentre - pan)
    //
    // Two things about the units, and the second one is the trap. #psiINT-stage has
    // transform-origin: 0 0, which is what the camera's own tx/ty already
    // assume. And the arithmetic has to happen in LAYOUT space: in the
    // cockpit #psiINT-stage-viewport is itself drawn through scale(--stage-scale),
    // so a clientX is a shrunken px while manualPan and the chunk offsets
    // the camera reads are full-size ones. focusCamera carries the same
    // warning for the same reason. The ratio is uniform, so one factor does
    // both axes, and it is 1 in the audience view.
    if (r !== 1 && overviewZoomAt) {
      const rect = viewport.getBoundingClientRect();
      const vp = vpLayout();
      const toLayout = rect.width ? vp.width / rect.width : 1;
      const qx = (overviewZoomAt.x - rect.left) * toLayout;
      const qy = (overviewZoomAt.y - rect.top) * toLayout;
      manualPan.dx += (1 - r) * (qx - vp.width / 2 - manualPan.dx);
      manualPan.dy += (1 - r) * (qy - vp.height / 2 - manualPan.dy);
    }
    overviewScale = next;
    applyOverviewCamera(false);
    schedulePanBroadcast();
  });
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
  // Skip drag on interactive children so click-to-select still works.
  if (e.target.closest('button, textarea, input, .annot-box, .exp-chev, .annot-add, #psiINT-toc')) return;
  // While Alt-selection is live the same gesture means "highlight this",
  // so the camera must keep its hands off it. The pointerdown-time question
  // is the stage's own selectability, not the modifier: a lingering
  // highlight leaves user-select on, so this drag would select either way.
  if (stageSelectable()) return;
  // Two pan modes share this handler: in overview, any drag pans; in
  // normal view, plain drag pans (chunk-local, reset on navigation).
  // The 3px movement threshold below keeps plain clicks (chunk select,
  // figure focus) intact – only an actual drag flips into pan mode.
  const mode = overview ? 'overview' : 'view';
  // Don't setPointerCapture eagerly: it would re-target pointerup to
  // viewport, breaking the synthesized click on the underlying chunk.
  // Use window-level listeners and only enter "dragging" after a real move.
  const session = { x: e.clientX, y: e.clientY, dx0: manualPan.dx, dy0: manualPan.dy, moved: false, mode };
  const dragClass = mode === 'overview' ? 'overview-dragging' : 'view-panning';
  const apply = mode === 'overview' ? applyOverviewCamera : focusCamera;
  const move = (ev) => {
    const dx = ev.clientX - session.x, dy = ev.clientY - session.y;
    if (!session.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      session.moved = true;
      document.body.classList.add(dragClass);
    }
    if (!session.moved) return;
    manualPan.dx = session.dx0 + dx;
    manualPan.dy = session.dy0 + dy;
    apply(true);
    schedulePanBroadcast();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) return;
    document.body.classList.remove(dragClass);
    broadcastPan(); // final position, exact (past any dropped throttle frame)
    // Swallow the synthesized click that follows a real drag, so a pan
    // doesn't accidentally select/jump on mouse-up.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// A narrower window can start cutting a code line that fitted a moment ago,
// and a wider one gives the lecturer's zoom back – clampZoomToWidth always
// re-derives from the chosen value, so it does both.
window.addEventListener('resize', () => {
  // Auto-fit solves the zoom against the frame, so a frame that changed size
  // has to be solved again - and clampZoomToWidth deliberately stands aside
  // while a fit is on, which left the one case nothing covered. It went
  // unnoticed while a resize meant a lecturer dragging a window edge; W makes
  // it the ordinary path, because entering fullscreen is a resize of several
  // hundred pixels in one step.
  autoFitNow();
  clampZoomToWidth();
  if (annotEditingId) fitAnnotation(flatChunks.find(c => c.id === annotEditingId));
  focusCamera(true);
});

// ── figure focus / marginalia pan (§figures) ────────────────────────
// Click a <figure>, a <pre>, or a .marginalia inside the active chunk
// to "focus" it: figures/pre land in a centered overlay with the slide
// dimmed underneath; .marginalia gets no overlay - it is in the slide's
// layout rather than laid over it - and the camera slides right instead,
// far enough to put the whole aside inside the frame. See setAsidePan.
const figureOverlay = document.getElementById('psiINT-figure-overlay');
let focusedFigure = null;
// The element on the slide the card is a clone of, so a thawing cockpit can
// name it to the projection (figureFocusState).
let focusedFigureSrc = null;
// Per-focus zoom + pan: +/− keys (and wheel) scale; drag pans. Reset
// every time a new figure gets focused so each one starts at 1x. Pan
// is in CSS px on the focus-target's layout box. The transform is
// applied with transform-origin: center, so the scale grows around
// the center of the card.
let figureScale = 1;
let figurePan = { x: 0, y: 0 };
const FIG_MIN_SCALE = 0.4;
const FIG_MAX_SCALE = 8;
function resetFigureView() {
  figureScale = 1;
  figurePan = { x: 0, y: 0 };
}
function applyFigureTransform() {
  if (!focusedFigure) return;
  focusedFigure.style.transform =
    'translate(' + figurePan.x + 'px, ' + figurePan.y + 'px) scale(' + figureScale + ')';
}
function setFigureScale(next) {
  figureScale = Math.max(FIG_MIN_SCALE, Math.min(FIG_MAX_SCALE, next));
  applyFigureTransform();
  broadcastFigureView();
}
// Zoom the card by a factor and leave the point under the cursor where it is.
// setFigureScale above stays the centred version, because that is the right
// answer for the +/- keys: there is no pointer in a keypress.
//
// The card is drawn as translate(pan) scale(s) about its own centre, so a
// material point at offset u from that centre sits at centre + pan + s*u.
// Requiring the cursor Q to describe the same point before and after a change
// of scale collapses to one line - the centre and u both drop out:
//
//   pan' = pan + (1 - r) * (Q - visibleCentre)
//
// where visibleCentre is what getBoundingClientRect reports, since scaling
// about the centre does not move it. Client px are the right unit:
// #psiINT-figure-overlay is position: fixed and a sibling of #psiINT-stage-viewport, so the
// cockpit's --stage-scale never composes into it.
//
// r must be the ratio actually achieved rather than the one asked for. At
// FIG_MAX_SCALE the scale stops but (1 - r) would not, and the card would go
// on sliding under a cursor that is no longer zooming anything.
function zoomFigureAt(factor, at) {
  if (!focusedFigure) return;
  const next = Math.max(FIG_MIN_SCALE, Math.min(FIG_MAX_SCALE, figureScale * factor));
  const r = next / figureScale;
  if (r !== 1 && at) {
    const box = focusedFigure.getBoundingClientRect();
    figurePan = {
      x: figurePan.x + (1 - r) * (at.x - (box.left + box.width / 2)),
      y: figurePan.y + (1 - r) * (at.y - (box.top + box.height / 2)),
    };
  }
  figureScale = next;
  applyFigureTransform();
  broadcastFigureView();
}
// Coalesced to one message per frame, the way schedulePanBroadcast already
// is. A drag sent one per pointermove and a wheel zoom one per wheel event,
// which on a trackpad is 119 a second - each of them a postMessage the peer
// answers with a style write. Reading the state inside the frame rather than
// capturing it means the message that goes out is the newest one; a frame
// that lands after an unfocus is harmless, because the receiver returns
// early when it has no focused figure.
let figureViewRaf = 0;
function broadcastFigureView() {
  if (!shouldBroadcast()) return;
  if (figureViewRaf) return;
  figureViewRaf = requestAnimationFrame(() => {
    figureViewRaf = 0;
    if (!shouldBroadcast()) return;
    sendToPeer({ type: 'figure-view', scale: figureScale, panX: figurePan.x, panY: figurePan.y });
  });
}
function unfocusFigure() {
  if (!focusedFigure) return;
  focusedFigure.style.transform = '';
  focusedFigure = null;
  focusedFigureSrc = null;
  figureOverlay.replaceChildren();
  document.body.classList.remove('figure-focused');
  resetFigureView();
}
function focusFigure(el) {
  unfocusFigure();
  resetFigureView();
  const clone = el.cloneNode(true);
  clone.classList.add('figure-focus-target');
  clone.removeAttribute('id');
  figureOverlay.replaceChildren(clone);
  document.body.classList.add('figure-focused');
  focusedFigure = clone;
  focusedFigureSrc = el;
  applyFigureTransform();
  // A stepped diagram opens on the beat the slide is on, not on beat 0: the
  // clone carries whatever the emitter wrote statically, which is the *last*
  // beat. Same call the step runtime uses to keep it in sync from here on.
  const live = el.querySelector('svg.psi-diagram');
  const shown = clone.querySelector('svg.psi-diagram');
  if (live && shown && live.psiDiagram) dgRenderInto(shown, live.psiDiagram, live.psiDiagram.step);
  fitFocusedMath(clone);
}

// A display formula is the one focus target whose size is set in type rather
// than by a box, and type does not know how tall the screen is. The overlay
// enlarges it to 0.12 of the slide height - 108px at 1440x900, three times
// what it was on the slide - and then the card caps at 98vh with overflow-y
// hidden. Eight rows of an aligned block measured 435px on the slide, fully
// visible, and 1285px inside an 882px card once focused: the bottom third of
// the formula was gone, and clicking a thing to see it better had made a
// third of it invisible.
//
// Scrolling is not the way out of this, however natural it looks beside the
// code block's overflow: auto. The overlay's wheel handler preventDefaults
// and zooms, and a drag pans, so a scrollbar inside the card is reachable
// only by dragging the bar itself, and on a touchscreen not at all.
//
// So the enlargement stops where the screen does. KaTeX scales linearly with
// its font size, which makes the correction one ratio rather than a search:
// the height it wants against the height it has. The second pass is not for
// re-flow - a formula does not re-wrap - it is for the horizontal scrollbar a
// narrow window can add underneath, which takes back a few pixels of the
// height the first pass just measured.
//
// Each window fits for itself, deliberately, and no part of this is
// broadcast: the projection and the cockpit's scaled stage are different
// sizes, so the answer is different, and the shared figure-view message
// carries the lecturer's own zoom and pan on top of whatever each window
// found. Same reasoning as clampZoomToWidth.
function fitFocusedMath(card) {
  if (!card.classList || !card.classList.contains('math-display')) return;
  const kx = card.querySelector('.katex');
  if (!kx) return;
  for (let pass = 0; pass < 2; pass++) {
    const cs = getComputedStyle(card);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const have = card.clientHeight - pad;
    const want = card.scrollHeight - pad;
    if (!(want > have + 1) || !(have > 0)) return;
    const size = parseFloat(getComputedStyle(kx).fontSize) || 0;
    if (!size) return;
    // 0.99 keeps the result off the exact edge, where a rounded layout pixel
    // would put the last row back under the clip.
    kx.style.fontSize = (size * (have / want) * 0.99) + 'px';
  }
}

// ── annotation export (Shift-E) ──────────────────────────────────────
//
// Shared by both live views. The cockpit wraps these in a modal that walks
// through the paste-back; the projection running alone copies and says so.
function collectAnnotationDrafts() {
  const out = [];
  flatChunks.forEach(({ id, el }) => {
    if (!id) return;
    if (!(id in annotations)) return;
    const text = (annotations[id] || '').trim();
    const ta = el.querySelector('.annot-textarea');
    const sourceDefault = ta ? (ta.defaultValue || '').trim() : '';
    if (!text && !sourceDefault) return;
    if (text === sourceDefault) return;
    out.push({ id, text });
  });
  return out;
}

function buildAnnotationSnippet(drafts) {
  const lines = ['<!-- annotations:start -->', ''];
  drafts.forEach(({ id, text }, i) => {
    if (i > 0) lines.push('');
    lines.push('### ' + id);
    if (text) {
      text.split('\n').forEach(l => lines.push('> annot: ' + l));
    } else {
      lines.push('> annot:');
    }
  });
  lines.push('', '<!-- annotations:end -->', '');
  return lines.join('\n');
}

async function copyToClipboardSafe(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

async function exportAnnotationsPlain() {
  const drafts = collectAnnotationDrafts();
  if (!drafts.length) { showModeBadge('no live annotations to export – type some with N first'); return; }
  const snippet = buildAnnotationSnippet(drafts);
  const ok = await copyToClipboardSafe(snippet);
  if (!ok) console.log(snippet);
  showModeBadge(ok
    ? drafts.length + ' annotation' + (drafts.length === 1 ? '' : 's') + ' copied – paste at the end of source.md, then --integrate-annotations'
    : 'clipboard blocked – the Markdown is in the console');
}

// A focused raster is an <img>, and a browser answers a drag on one by
// lifting the picture out of the page: the pointer stream is cancelled and
// the pan only lands when the button comes up. The drag here is the pan.
figureOverlay.addEventListener('dragstart', (e) => e.preventDefault());

// Overlay pointerdown: drag pans the focused figure; a click without
// drag closes (matches the previous click-to-unfocus affordance). 3px
// movement threshold mirrors the viewport-pan handler so a fingertip
// jitter still counts as a tap.
figureOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, textarea, input')) return;
  // The card is where a listing is largest and most readable, so it is where
  // a line is most likely to be copied. While the overlay is selectable the
  // drag belongs to the browser's own selection and the card must neither
  // pan under it nor close when the pointer comes up. Recorded here for the
  // same reason as everywhere else: Alt can be let go before the mouse is.
  const selecting = stageSelectable();
  const session = {
    x: e.clientX, y: e.clientY,
    panX0: figurePan.x, panY0: figurePan.y,
    moved: false,
  };
  const move = (ev) => {
    if (selecting) return;
    const dx = ev.clientX - session.x, dy = ev.clientY - session.y;
    if (!session.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      session.moved = true;
      document.body.classList.add('figure-dragging');
    }
    if (!session.moved) return;
    figurePan = { x: session.panX0 + dx, y: session.panY0 + dy };
    applyFigureTransform();
    broadcastFigureView();
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!session.moved) {
      // Pure click → close (preserve previous click-to-unfocus UX) – unless
      // the pointer is being used to select, in which case it placed a caret
      // and closing the card would throw away what was being read.
      if (gestureSelects(ev)) return;
      unfocusFigure();
      if (shouldBroadcast()) sendToPeer({ type: 'figure-unfocus' });
      return;
    }
    document.body.classList.remove('figure-dragging');
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// Wheel zoom while focused. deltaY > 0 = scroll-down = zoom out, the
// natural direction for trackpad pinch (browsers translate pinch to
// wheel + ctrlKey on macOS but the sign is the same, so both gestures go
// through one path - two thirds of the measured events were a two-finger
// scroll rather than a pinch, and the lecturer wants both to zoom here).
// See the wheelZoomPx block above for why the step is an exp() and not a
// constant, and why the class is held for the length of the gesture.
let figureZoomPx = 0, figureZoomRaf = 0, figureZoomAt = null;
figureOverlay.addEventListener('wheel', (e) => {
  if (!focusedFigure) return;
  e.preventDefault();
  markZooming('figure-zooming');
  figureZoomPx += wheelZoomPx(e);
  // The last event of the frame supplies the anchor. The cursor can travel a
  // few px between two events 8 ms apart, and the newest position is the one
  // the hand is actually over.
  figureZoomAt = { x: e.clientX, y: e.clientY };
  if (figureZoomRaf) return;
  figureZoomRaf = requestAnimationFrame(() => {
    figureZoomRaf = 0;
    const px = figureZoomPx;
    figureZoomPx = 0;
    zoomFigureAt(zoomScaleFor(px), figureZoomAt);
  });
}, { passive: false });

// Bring a .marginalia into the frame, or let it go again. All this does is
// set the state focusCamera solves against; the offset itself is derived
// there, from the aside's live geometry.
//
// A slide with a marginalia is framed exactly as one without: the aside is
// out past the text column and the frame simply cuts it off, which is the
// whole affordance - the reader sees that something continues off the right
// edge and clicks it.
function setAsidePan(el) {
  const chunk = el && el.closest('.chunk');
  if (!chunk || !chunk.dataset.chunkId) return;
  asidePan = { chunkId: chunk.dataset.chunkId, el };
  document.body.classList.add('aside-panned');
  focusCamera(false);
}
function clearAsidePan() {
  if (!asidePan) return false;
  asidePan = null;
  document.body.classList.remove('aside-panned');
  return true;
}
// What is open over or beside the live slide, as the messages that would put
// the other window in the same place: the focus card with its zoom, or the
// brought-in aside - and the closing message for each that is not open. A
// frozen cockpit sends none of these as they happen, and the snapshot a thaw
// pushes carries neither, so a card closed while frozen stayed up on the
// projection. Thawing sends this list after the snapshot (toggleFreeze).
function figureFocusState() {
  const entry = flatChunks[state.activeIdx];
  const idxIn = (el) => (entry && el ? Array.from(entry.el.querySelectorAll(FOCUSABLE_SEL)).indexOf(el) : -1);
  const out = [];
  const f = focusedFigure ? idxIn(focusedFigureSrc) : -1;
  if (f >= 0) {
    out.push({ type: 'figure-focus', chunkIdx: state.activeIdx, figureIdx: f });
    out.push({ type: 'figure-view', scale: figureScale, panX: figurePan.x, panY: figurePan.y });
  } else out.push({ type: 'figure-unfocus' });
  const a = asidePan ? idxIn(asidePan.el) : -1;
  out.push(a >= 0 ? { type: 'figure-pan', chunkIdx: state.activeIdx, figureIdx: a } : { type: 'figure-unpan' });
  return out;
}

// ── where forward will take you ───────────────────────────────────
// One fact about the current slide that the picture cannot carry and that the
// keys otherwise only reveal by being pressed: the next forward press leaves
// this column. Drawn at the viewport edge rather than on the slide, so
// nothing in the author's layout moves, and quiet enough to sit on a
// projection - it is a compass, not a control.
//
// There were three marks. Two of them said "sideways changes column here",
// which was worth saying while the sideways arrows meant two different things
// depending on where you stood. They mean one thing now, and Shift means the
// other everywhere, so there is no longer a question for a mark to answer.
function buildNavHints() {
  const vp = document.getElementById('psiINT-stage-viewport');
  if (!vp || document.getElementById('psiINT-nav-hints')) return;
  const wrap = document.createElement('div');
  wrap.id = 'psiINT-nav-hints';
  wrap.setAttribute('aria-hidden', 'true');
  const s = document.createElement('span');
  s.dataset.hint = 'down';
  s.textContent = '⌄';
  wrap.appendChild(s);
  vp.appendChild(wrap);
}

function updateNavHints() {
  const wrap = document.getElementById('psiINT-nav-hints');
  if (!wrap) return;
  const i = state.activeIdx;
  const c = flatChunks[i];
  const show = (dir, on) => {
    const el = wrap.querySelector('[data-hint="' + dir + '"]');
    if (el) el.toggleAttribute('data-on', !!on);
  };
  // Blanking darkens the audience stage only, so the cockpit is exactly where
  // the marks are still wanted: the lecturer is navigating with the room dark.
  if (!c || overview || (state.blanked && VIEW === 'audience')) {
    show('down', false);
    return;
  }
  // Forward leaves the column – but only once there is nothing left to
  // reveal, because until then forward is still working on this slide.
  const beatsLeft = (revealed[c.id] ?? (countSegments(c.el) ? 1 : 0)) < countSegments(c.el);
  show('down', c.colLast && !beatsLeft && i + 1 < flatChunks.length);
}

// The controls a finger can reach, in both live views. CSS hides the whole
// thing on fine-pointer devices, so a laptop never sees it and an iPad with a
// Magic Keyboard re-classifies and loses it again.
//
// Every case here calls the function the key calls, and nothing else. Not one
// of them re-implements what a key does: cycleFont is cycleFont, and the day
// the F key learns a fourth face the button learns it too. A second code path
// is how a palette comes to disagree with a key map, which is the same failure
// build.js and lint.js have to be grepped against each other to avoid.
function wireTouchControls() {
  const bar = document.getElementById('psiINT-touch-controls');
  if (!bar) return;
  const palette = document.getElementById('psiINT-touch-palette');
  const moreBtn = bar.querySelector('[data-action=more]');
  const selBtn = bar.querySelector('[data-action=select]');
  const setPalette = (open) => {
    if (palette) palette.hidden = !open;
    if (moreBtn) moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    switch (btn.dataset.action) {
      case 'prev':      goBack(); break;
      case 'next':      goForward(); break;
      case 'overview':  toggleOverview(); break;
      case 'zoom-in':
        if (focusedFigure) setFigureScale(figureScale * 1.2);
        else stepZoom(1);
        break;
      case 'zoom-out':
        if (focusedFigure) setFigureScale(figureScale / 1.2);
        else stepZoom(-1);
        break;
      case 'more':      setPalette(palette && palette.hidden); break;
      case 'collapse':  cycleCollapse(1); break;
      case 'font':      cycleFont(1); break;
      case 'theme':     cycleTheme(1); break;
      case 'autofit':   cycleAutoFit(1); break;
      case 'search':    setPalette(false); startSearch(); break;
      case 'select':    setTouchSelect(!touchSelectOn); break;
      // A tablet driving the projection has no W to press. It calls the same
      // function the key calls, so the two cannot drift - and in the
      // projection's own window the tap is itself the gesture the browser
      // asks for, which is the whole of what the hint exists to collect. The
      // palette closes first, or the pill stays over the frame it cleared.
      case 'fullscreen': setPalette(false); toggleProjectionFullscreen(); break;
    }
    if (selBtn) selBtn.setAttribute('aria-pressed', touchSelectOn ? 'true' : 'false');
  });
}

// Selecting text without a modifier key.
//
// On a keyboard this is Alt held down, deliberately: a mode is state you can
// forget you are in, and the state you forget here is the one where dragging
// no longer pans. A finger has no modifier to hold, so on touch it has to be
// a mode - and the two mitigations are that the button shows it is on and
// that Esc, or turning it off, clears both the mode and the selection.
//
// It needs its own flag rather than borrowing altSelectHeld, because the
// selectionchange listener switches the class off whenever there is no
// selection and no key held. Toggling the mode on would have survived exactly
// until the next tap.
let touchSelectOn = false;
function setTouchSelect(on) {
  touchSelectOn = on;
  if (on) {
    setSelecting(true);
    flashMode('select text by dragging · tap the button again to pan');
  } else {
    endSelecting();
  }
}

function wireFigureClicks() {
  flatChunks.forEach(({ el }) => {
    el.querySelectorAll(FOCUSABLE_SEL).forEach(target => {
      if (target.dataset.figureWired) return;
      target.dataset.figureWired = '1';
      target.addEventListener('click', (ev) => {
        if (overview) return;
        // A drag across this <pre> ends in a click on it, so without this the
        // one element a lecturer most wants to copy out of is the one that
        // cannot be selected: the highlight is made and the focus card opens
        // on top of it.
        if (gestureSelects(ev)) return;
        if (ev.target.closest('.annot-textarea, input, button')) return;
        const chunk = target.closest('.chunk');
        if (!chunk || !chunk.classList.contains('active')) return;
        ev.stopPropagation();
        ev.preventDefault();
        if (target.classList.contains('marginalia')) {
          // A second click on the aside is the way back, the same as Esc:
          // the thing that brought it in is the nearest thing to hand.
          const panned = asidePan && asidePan.el === target;
          if (panned) clearAsidePan(); else setAsidePan(target);
          focusCamera(false);
          if (shouldBroadcast()) {
            const figureIdx = Array.from(chunk.querySelectorAll(FOCUSABLE_SEL)).indexOf(target);
            sendToPeer({
              type: panned ? 'figure-unpan' : 'figure-pan',
              chunkIdx: state.activeIdx, figureIdx,
            });
          }
          return;
        }
        focusFigure(target);
        if (shouldBroadcast()) {
          const figureIdx = Array.from(chunk.querySelectorAll(FOCUSABLE_SEL)).indexOf(target);
          sendToPeer({ type: 'figure-focus', chunkIdx: state.activeIdx, figureIdx });
        }
      });
    });
  });
}

// The PDF exporter's whole contract with this runtime: mechanism, no policy.
// The order of the beats has exactly one definition and it is above this
// line; the export calls it rather than reimplementing it, which is why it
// cannot be wrong about the order - only about the rendering, and that is a
// class of fault you look at instead of hunting for. Everything the export
// decides - which states, what leaves the clone, what the print DOM is -
// lives in pdf-core.mjs and is injected by whichever browser drives it. None
// of it ships here.
//
// Reaching into the runtime's own consts from an injected function would work,
// because this is a classic script and they sit in the global lexical scope,
// and it would save these lines at the price of a contract no reader of
// this file can see and a rename breaks in silence.
window.psiExport = {
  // The export writes <html>'s zoom itself after jumpTo and the fit, and
  // clones the slide it prints, so it must find no slide holding a zoom
  // inline: from its first call on, showZoom writes <html> at once.
  chunks: () => { zoomNow = true; flushZoom(); return flatChunks; },
  countSegments,
  jumpTo: (idx, dir) => { zoomNow = true; jumpTo(idx, dir); },
  setRevealed: (id, n) => { revealed[id] = n; },
  applyReveal,
  settle: () => { if (autoFitOn()) fitZoomToChunk(2.2); else clampZoomToWidth(); },
  setAutoFit: (on) => { state.autoFitMode = on ? 'full' : 'off'; },
  setCollapse: (m) => { state.collapse = m; },
  quiesce: () => { autoplayStopped = true; stopAutoplay(); },
  zoom: () => state.zoom,
  // What the fit would measure, without fitting: el's flow height at each
  // zoom given, by the probe fitZoomToChunk uses, and the limit it holds a
  // chunk to. Each zoom is written on el, as the fit's trial steps are, and
  // el's inline value is put back before returning; state.zoom is not
  // touched. Read by the PDF export's parity numbers and by nothing in the
  // live views.
  fitMeasure: (el, zooms) => {
    const limit = fitAvail(el);
    if (!(limit > 0)) return null;
    const probe = flowHeightProbe(el);
    const before = el.style.getPropertyValue('--zoom');
    try {
      const heights = zooms.map(z => { el.style.setProperty('--zoom', z); return probe(); });
      return { limit, heights };
    } finally {
      if (before) el.style.setProperty('--zoom', before); else el.style.removeProperty('--zoom');
    }
  },
};

// Boot
loadPersisted();
// After loadPersisted, so an address with a fragment wins over the
// remembered position rather than the other way round.
const bootHashIdx = chunkIdxFromHash();
if (bootHashIdx >= 0) state.activeIdx = bootHashIdx;
// And a --watch reload wins over both: the page is coming back from a save,
// and the author is where they were a moment ago, not where the address
// they opened pointed. One stash per window (sessionStorage), written by the
// reload script just before it reloads (psiWatchResumeSave) and taken once
// here. The chunk by id - a chunk added above used to land the page on its
// neighbour - and the old index, clamped, when the id is gone; every chunk's
// beat, clamped to the beats it has now - the reveal state used to start
// over, so a stepped figure took three presses after every save. A frozen
// cockpit stays frozen, or its first push would move the room to the slide
// it was looking ahead at. Only on a reload, and only a fresh stash: a
// stash nobody took is not a reason to move a later visit.
const WATCH_RESUME_KEY = storageKey('watch-resume');
window.psiWatchResumeSave = () => {
  const entry = flatChunks[state.activeIdx];
  sessionStorage.setItem(WATCH_RESUME_KEY, JSON.stringify({
    id: entry ? entry.id : null, idx: state.activeIdx,
    revealed: Object.assign({}, revealed),
    frozen: viewHooks.lookingAhead(), at: Date.now(),
  }));
};
const watchResume = (() => {
  let r = null;
  try {
    const raw = sessionStorage.getItem(WATCH_RESUME_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(WATCH_RESUME_KEY);
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'reload') return null;
    r = JSON.parse(raw);
  } catch (e) { return null; }
  if (!r || typeof r !== 'object' || !(Date.now() - r.at < 60000)) return null;
  return r;
})();
if (watchResume) {
  const at = chunkIdxOf(watchResume.id);
  state.activeIdx = at >= 0 ? at
    : Math.max(0, Math.min(flatChunks.length - 1, Number(watchResume.idx) || 0));
  const kept = watchResume.revealed || {};
  flatChunks.forEach(c => {
    const n = kept[c.id];
    if (typeof n === 'number' && n >= 0) revealed[c.id] = Math.min(n, countSegments(c.el));
  });
}
applyFontTheme();
document.querySelectorAll('.reveal-segment').forEach(seg => splitSentencesIn(seg));
wireAnnotations();
wireVideos();
wireEmbeds();
wireClicks();
wireFigureClicks();
wireTouchControls();
markColumnEdges();
buildNavHints();
initDiagrams();
applyRevealAll();
applyState();
initStartMenu();
// Two rAFs so fonts have a chance to settle before the first camera solve.
requestAnimationFrame(() => requestAnimationFrame(() => {
  // A lecture that opens with auto-fit has to fit its *first* slide too.
  // jumpTo does this on every later move; nothing calls it at boot.
  if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
  else clampZoomToWidth();
  focusCamera(true);
  // Same reasoning for autoplay, and it matters more here: the cover is
  // the slide the feature was asked for, and jumpTo never runs on it.
  restartAutoplay(true);
}));
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (autoFitOn()) fitZoomToChunk(autoFitCeiling());
    else clampZoomToWidth();
    focusCamera(true);
  });
}
// A picture that loads after the camera has framed. An image is emitted with
// loading="lazy" and without dimensions, so until the browser fetches it - and
// it fetches it when the camera gets near, inlined or not - its box has no
// height. jumpTo therefore solved the zoom and the camera for a slide that was
// still missing its picture, the picture arrived a tenth of a second later,
// and nothing solved either again: measured on a lecture at 1600x900, a slide
// of 791 px was centred as the 341 px it was without its photograph and stood
// 170 px off the bottom of a frame it fits. Which slide it happens to depends
// on how far the camera travels and how long the lecturer stayed on the slide
// before, so it read as a fault of the chunk in front.
//
// So a late picture is content arriving on the stage, like a reveal and like
// the fonts above, and gets the same answer. The fit is solved again only
// where the picture is on the live slide; the camera always, because a
// picture higher up the column moves the live slide down with it. load does
// not bubble, hence the capture. Under pan the correction glides - it usually
// lands inside the glide that is bringing the slide in and simply retargets
// it - and under cut and fade it lands, like the slide did.
stage.addEventListener('load', (e) => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  const entry = flatChunks[state.activeIdx];
  if (entry && entry.el.contains(img)) {
    autoFitNow();
    clampZoomToWidth();
  }
  focusCamera(SLIDE_TRANSITION !== 'pan');
}, true);
