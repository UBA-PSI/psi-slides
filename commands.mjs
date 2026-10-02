/*
 * commands.mjs – the live views' commands, and the one place a key is bound.
 *
 * A table and the few pure helpers that read it. Zero imports, zero Node
 * APIs, the sixth module of that kind. build.js imports it to render the ?
 * panel (renderHelpOverlay) and splices this same text into both live views
 * as window.PSI_COMMANDS, the way cue-cards.mjs travels as window.PSI_CARDS:
 * the keydown listener in AUDIENCE_JS looks a press up in keyMap(VIEW) and
 * runs COMMAND_RUN[id], so the key in the panel and the key in the handler
 * are one entry here and cannot drift apart. test/gates/commands.mjs holds
 * the rest without a browser: every key the key map answered before the
 * table existed is still answered, every command has a run function in the
 * view that answers it, every panel row spells the keys its command has.
 *
 * One entry is one row of the ? panel. Two kinds:
 *
 *   a command   has `keys`, and the key map dispatches them to COMMAND_RUN[id];
 *               the panel can run its row as a palette (all but ? itself)
 *   a doc row   has no `keys`: a mouse gesture (`mouse`), or a key answered
 *               somewhere other than the key map (`context`: the overview
 *               board, the search field, a focused figure, the cue cards, a
 *               note, the prompter's strip, the editor) - the guards before
 *               the lookup are code, because they are rules about *where* a
 *               key is pressed rather than about what a command is
 *
 * The panel lists a view's commands first, section by section in GROUPS
 * order, and its doc rows after them as a reference, in the same sections
 * (helpGroups): a row the arrows can select never has one they skip
 * between it and the next. Shift-C, Shift-F, Shift-A and Shift-L used to
 * share one line; they are four lines now, each one runnable.
 *
 * Fields:
 *
 *   id        stable; the name a page, the app or a later palette runs it by
 *   group     a GROUPS id, or { audience, speaker } where the two panels file
 *             it differently
 *   views     where the key map answers it (a doc row: where it is listed)
 *   keys      combos as comboOf spells them: e.key lower-cased, with
 *             'shift+' in front when the binding needs Shift held. A shifted
 *             press with no binding of its own falls back to the plain key,
 *             which is how Shift-B still blanks and Shift-S still opens the
 *             cockpit, as they always did
 *   label     a verb phrase, sentence case, for a menu or a palette row
 *   short     a name of one or two words, where the click is the verb: the
 *             projection's start menu (START_MENU) reads it
 *   opens     the view a command opens in a window of its own ('speaker',
 *             'print'): the start menu leaves the entry out when the build
 *             put no such file beside audience.html, and the key says so
 *   hint      the panel's second column (HTML), or { audience, speaker }
 *   show      the panel's key column (HTML) where keyText(keys) would spell
 *             it differently; mouse is the same for a row with no key
 *   reach     local / broadcast / ungated - descriptive, speaker.md §2's
 *             three kinds; nothing enforces it here
 *   state     the field a checkmark or aria-pressed reads, or null
 *   when      a named predicate for contextual hints, or null
 *   requires  'editor' | 'prompter' - listed only where that ships
 *
 * The panel stays English whatever lang: says; the words here are the
 * 1.0.0 words, transcribed from the hand-written panel byte for byte.
 */

export const VIEWS = ['audience', 'speaker'];
export const REQUIRES = ['editor', 'prompter'];
export const REACH = ['local', 'broadcast', 'ungated'];
export const WHEN = ['has-expansion', 'has-notes', 'focused-figure'];
export const CONTEXTS = ['overview', 'search', 'figure', 'cards', 'note', 'strip', 'editor'];

// The panel's sections, in the cockpit's order. The audience panel is the
// same list with the cockpit's own sections left out, which is the order it
// has always had. The prompter stands first where there is one, in both of
// the panel's runs (helpGroups): its switch heads the runnable rows, and its
// privacy row, the one line to read before pressing anything, heads the
// reference.
export const GROUPS = [
  { id: 'prompter', title: 'The prompter', views: ['speaker'], requires: 'prompter' },
  { id: 'cards', title: 'Cue cards', views: ['speaker'] },
  { id: 'arrange', title: 'Arranging this window', views: ['speaker'] },
  { id: 'notes', title: 'Notes', views: ['speaker'] },
  { id: 'projector', title: 'The projector', views: ['speaker'] },
  { id: 'moving', title: 'Moving around', views: VIEWS },
  { id: 'finding', title: 'Finding a slide', views: VIEWS },
  { id: 'searching', title: 'Searching', views: VIEWS },
  { id: 'slide', title: 'On the slide', views: VIEWS },
  { id: 'knobs', title: 'Reading knobs', views: VIEWS },
  { id: 'editor', title: 'The experimental diagram editor', views: VIEWS, requires: 'editor' },
  { id: 'windows', title: 'The other windows', views: VIEWS },
];

const BOTH = VIEWS;
const SPK = ['speaker'];
const AUD = ['audience'];
// A doc row of the editor's own section. Its keys are answered by
// dgeKeydown in editor.mjs, a modal with a key map of its own that runs
// ahead of this one, so they are listed and never dispatched from here.
const ed = (id, show, hint) => ({ id: 'editor-' + id, group: 'editor', views: BOTH, show, hint, context: 'editor', requires: 'editor' });

export const COMMANDS = [
  // ── the prompter (cockpit, --prompter only) ──
  { id: 'prompter-privacy', group: 'prompter', views: SPK, requires: 'prompter',
    mouse: 'what leaves this machine',
    hint: 'the prompter sends no audio: the transcript and the deck including your notes go as text to openrouter.ai. The speech recognition is Chrome\'s, and it sends the audio to Google unless it runs on this device – the badge says which. Nothing reaches the projection and nothing is written into source.md. The microphone hears the room too – switch it off before a question round, or tell the room' },
  { id: 'prompter', group: 'prompter', views: SPK, requires: 'prompter', keys: ['shift+s'],
    label: 'Switch the prompter on or off', reach: 'local', state: 'prompter',
    hint: 'the prompter listens, or stops – the <b>◌ prompter</b> button in the footer is the same switch' },
  { id: 'prompter-dismiss', group: 'prompter', views: SPK, requires: 'prompter', context: 'strip',
    show: '<kbd>Esc</kbd>',
    hint: 'take the hint standing on the strip away – it also goes by itself after fifteen seconds, and the × on it does the same' },
  { id: 'prompter-where', group: 'prompter', views: SPK, requires: 'prompter',
    mouse: 'where it appears',
    hint: 'a line over the foot of the slide, or at the head of the card column under <kbd>K</kbd> – <code>◷</code> time · <code>◇</code> example · <code>△</code> fact · <code>◌</code> delivery · <code>≫</code> pace · <code>⋯</code> something your notes planned and you have not said · <code>▤</code> a card laid into a slide still to come' },
  { id: 'prompter-history', group: 'prompter', views: SPK, requires: 'prompter',
    mouse: '<kbd>Shift</kbd>-click <b>◌ prompter</b>',
    hint: 'the last ten it has said, and the two switches: show what it hears, and whether it may lay cards into upcoming slides' },
  { id: 'prompter-scope', group: 'prompter', views: SPK, requires: 'prompter',
    mouse: 'what it may say',
    hint: 'at most twelve words, one at a time, and usually nothing: behind time, a missing example, a probable slip, a word about delivery, how fast you are speaking, and a thing your notes planned that has gone past' },

  // ── cue cards (cockpit) ──
  // Answered in the audience as well, where it does nothing but spend the
  // press: that is what the key map always did with K there.
  { id: 'cue-cards', group: 'cards', views: BOTH, keys: ['k'],
    label: 'Show the notes as cue cards', reach: 'local', state: 'cueCards', when: 'has-notes',
    hint: 'your notes as cards down a rail, the projection small in the corner – and back' },
  { id: 'cards-forward', group: 'cards', views: SPK, context: 'cards',
    show: '<kbd>Space</kbd> · <kbd>↓</kbd> · <kbd>→</kbd>',
    hint: 'the next card of this beat; when they are said, the next reveal, then the next slide – the diamonds on the rail are the clicks the room sees' },
  { id: 'cards-back', group: 'cards', views: SPK, context: 'cards',
    show: '<kbd>Backspace</kbd> · <kbd>↑</kbd> · <kbd>←</kbd>',
    hint: 'one press back, whatever the last press was' },
  { id: 'cards-skip', group: 'cards', views: SPK, context: 'cards',
    show: '<kbd>Enter</kbd>',
    hint: 'the next slide, skipping what is left of this one\'s cards (a presenter that sends Enter for forward will do this too)' },
  { id: 'cards-source', group: 'cards', views: SPK,
    mouse: 'in source.md',
    hint: 'a <code>&gt; note:</code> paragraph is a card and its <b>bold</b> phrases are the bullets; a note after a <code>---</code> belongs to that beat; <code>@12:30</code> on a card puts the drift beside the clock' },
  { id: 'clock-reset', group: 'cards', views: SPK,
    mouse: 'click the clock',
    hint: 'restart it at 0:00 – it started when this window opened' },

  // ── arranging this window (cockpit) ──
  { id: 'preview-orientation', group: 'arrange', views: SPK, keys: ['shift+v'],
    label: 'Move the preview strip', reach: 'local', state: null,
    hint: 'preview strip: along the bottom ↔ down the right edge' },
  { id: 'notes-resize', group: 'arrange', views: SPK,
    mouse: 'drag the bar above the notes',
    hint: 'resize the notes pane; the slide preview rescales to fit' },
  { id: 'next-reveal-mark', group: 'arrange', views: SPK,
    mouse: 'the hatched block on a slide',
    hint: 'what the next Space or ↓ will reveal – cockpit only' },
  { id: 'strip-resize', group: 'arrange', views: SPK,
    mouse: 'drag the bar on the preview strip',
    hint: 'resize the strip, any of the three arrangements – in the cue cards it sizes the mirror with it; double-click resets' },
  { id: 'notes-zoom', group: 'arrange', views: SPK,
    mouse: '<kbd>&minus;</kbd> <kbd>+</kbd> in the notes corner',
    hint: 'notes text size (no hotkey – you type in there)' },
  { id: 'bars-reset', group: 'arrange', views: SPK,
    mouse: 'double-click either bar',
    hint: 'back to automatic size' },
  { id: 'strip-scroll', group: 'arrange', views: SPK,
    mouse: 'drag the preview strip',
    hint: 'scroll it · click a thumbnail to jump' },
  { id: 'column-bar', group: 'arrange', views: SPK,
    mouse: 'click the bar along the top',
    hint: 'a column name goes to that column\'s first slide, a dot to its slide' },

  // ── the projector (cockpit) ──
  { id: 'freeze', group: 'projector', views: SPK, keys: ['v'],
    label: 'Freeze the projection', reach: 'local', state: 'frozen',
    hint: 'freeze the projection – the room holds this slide while you move on' },
  { id: 'freeze-again', group: 'projector', views: SPK,
    show: '<kbd>V</kbd> again',
    hint: 'live again, and the room catches up to where you are now' },
  { id: 'laser', group: 'projector', views: SPK,
    mouse: 'move the mouse over the stage',
    hint: 'laser pointer on the projector' },

  // ── moving around ──
  // Enter is forward too, but in overview it lands on the selected slide and
  // in the cockpit it skips the rest of this slide's cue cards first; the run
  // function says so, the panel lists it with the other three.
  { id: 'forward', group: 'moving', views: BOTH, keys: [' ', 'arrowdown', 'enter', 'pagedown', 'arrowright'],
    label: 'Forward', reach: 'broadcast',
    show: '<kbd>Space</kbd> · <kbd>↓</kbd> · <kbd>Enter</kbd> · <kbd>PageDown</kbd>',
    hint: 'forward: the next reveal or diagram step, then the next slide' },
  { id: 'back', group: 'moving', views: BOTH, keys: ['arrowup', 'pageup', 'backspace', 'arrowleft'],
    label: 'Back', reach: 'broadcast',
    show: '<kbd>↑</kbd> · <kbd>PageUp</kbd> · <kbd>Backspace</kbd>',
    hint: 'back: the reveal before it, then the slide before it' },
  { id: 'sideways', group: 'moving', views: BOTH,
    show: '<kbd>→</kbd> <kbd>←</kbd>',
    hint: 'the same pair, on every slide' },
  { id: 'next-column', group: 'moving', views: BOTH, keys: ['shift+arrowright'],
    label: 'Next column', reach: 'broadcast',
    hint: 'the next column – from anywhere' },
  { id: 'prev-column', group: 'moving', views: BOTH, keys: ['shift+arrowleft'],
    label: 'Previous column', reach: 'broadcast',
    hint: 'the column before it – from anywhere' },
  { id: 'column-mark', group: 'moving', views: BOTH,
    mouse: 'the mark at the foot',
    hint: '⌄ the next forward press leaves this column' },
  { id: 'expansion', group: 'moving', views: BOTH, keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    label: 'Open an expansion', reach: 'local', when: 'has-expansion',
    show: '<kbd>1</kbd>–<kbd>9</kbd>',
    hint: 'open the n-th expansion' },
  { id: 'escape', group: 'moving', views: BOTH, keys: ['escape'],
    label: 'Step back out', reach: 'local',
    hint: 'step back out: figure, then overview, then expansion' },

  // ── finding a slide ──
  { id: 'overview', group: 'finding', views: BOTH, keys: ['o'],
    label: 'Show the overview', reach: 'broadcast', state: 'overview',
    hint: 'overview – the whole lecture on one board (letter O, not zero)' },
  { id: 'overview-pan', group: 'finding', views: BOTH, context: 'overview',
    mouse: 'drag · wheel',
    hint: 'pan the board · zoom it where the pointer is' },
  { id: 'overview-click', group: 'finding', views: BOTH, context: 'overview',
    mouse: 'click a slide',
    hint: 'go there and leave the board' },
  { id: 'overview-select', group: 'finding', views: BOTH, context: 'overview',
    show: '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>',
    hint: 'move the selection (the board follows)' },
  { id: 'overview-land', group: 'finding', views: BOTH, context: 'overview',
    show: '<kbd>O</kbd> · <kbd>Enter</kbd>',
    hint: 'land on the selected slide' },
  { id: 'goto', group: 'finding', views: BOTH, keys: ['g'],
    label: 'Go to a slide by number', reach: 'broadcast',
    hint: 'go to a slide by the number in its corner – type the digits, <kbd>Backspace</kbd> takes one back, <kbd>Enter</kbd> lands, <kbd>Esc</kbd> cancels' },
  { id: 'search-see-below', group: 'finding', views: BOTH,
    show: '<kbd>/</kbd>',
    hint: 'search – opens from anywhere, see below' },
  { id: 'toc', group: 'finding', views: BOTH, keys: ['t'],
    label: 'Show the column list', reach: 'local',
    hint: 'column list' },

  // ── searching ──
  { id: 'search', group: 'searching', views: BOTH, keys: ['/'],
    label: 'Search the lecture', reach: 'local',
    hint: 'open the search panel, in overview or on a slide' },
  { id: 'search-type', group: 'searching', views: BOTH, context: 'search',
    mouse: 'type',
    hint: 'matching slides are listed with the sentence they matched' },
  { id: 'search-pick', group: 'searching', views: BOTH, context: 'search',
    show: '<kbd>↑</kbd> <kbd>↓</kbd>',
    hint: 'pick a hit (the overview board follows along)' },
  { id: 'search-go', group: 'searching', views: BOTH, context: 'search',
    show: '<kbd>Enter</kbd> · click',
    hint: 'go to that slide' },
  { id: 'search-close', group: 'searching', views: BOTH, context: 'search',
    show: '<kbd>Esc</kbd>',
    hint: 'close without moving' },

  // ── on the slide ──
  { id: 'figure-focus', group: 'slide', views: BOTH,
    mouse: 'click a figure or code block',
    hint: 'zoom it into a centred card' },
  { id: 'figure-pan', group: 'slide', views: BOTH, context: 'figure',
    mouse: 'drag · wheel',
    hint: 'pan the card · zoom it where the pointer is' },
  { id: 'figure-zoom', group: 'slide', views: BOTH, context: 'figure',
    show: '<kbd>+</kbd> <kbd>-</kbd> · <kbd>0</kbd>',
    hint: 'zoom from the centre · reset the zoomed card' },
  { id: 'marginalia', group: 'slide', views: BOTH,
    mouse: 'click a marginalia',
    hint: 'slide the frame right until the whole aside is on it' },
  { id: 'slide-pan', group: 'slide', views: BOTH,
    mouse: 'drag the slide',
    hint: 'pan within a chunk that is taller than the screen' },
  { id: 'select-text', group: 'slide', views: BOTH,
    mouse: 'hold <kbd>Alt</kbd>/<kbd>option</kbd> and drag',
    hint: 'select text to copy – dragging pans again once you let go' },
  { id: 'link-open', group: 'slide', views: BOTH,
    mouse: 'click a link',
    hint: 'opens it in a new tab of this window' },
  { id: 'link-show', group: 'slide', views: BOTH,
    mouse: '<kbd>Shift</kbd>-click a link',
    hint: 'puts the address on both screens, big enough to write down' },
  { id: 'figure-unfocus', group: 'slide', views: BOTH, context: 'figure',
    show: '<kbd>Esc</kbd>',
    hint: 'back to the whole slide' },

  // ── reading knobs ──
  { id: 'collapse', group: 'knobs', views: BOTH, keys: ['c'],
    label: 'Cycle the collapse', reach: 'broadcast',
    hint: 'collapse: what the room sees ↔ the full text' },
  { id: 'font', group: 'knobs', views: BOTH, keys: ['f'],
    label: 'Cycle the font', reach: 'broadcast',
    hint: 'font: serif → sans → mono' },
  { id: 'theme', group: 'knobs', views: BOTH, keys: ['a'],
    label: 'Cycle the theme', reach: 'broadcast',
    hint: 'theme: four light accents, a neutral dark, two phosphor modes' },
  // = and _ are the other spellings of the two physical keys on a US layout.
  { id: 'zoom-in', group: 'knobs', views: BOTH, keys: ['+', '='],
    label: 'Larger text', reach: 'broadcast',
    show: '<kbd>+</kbd>',
    hint: 'larger text (the size is kept separately for each collapse mode)' },
  { id: 'zoom-out', group: 'knobs', views: BOTH, keys: ['-', '_'],
    label: 'Smaller text', reach: 'broadcast',
    show: '<kbd>-</kbd>',
    hint: 'smaller text' },
  { id: 'zoom-reset', group: 'knobs', views: BOTH, keys: ['0'],
    label: 'Reset the text size', reach: 'broadcast',
    hint: 'the text size back to where it started' },
  { id: 'auto-fit', group: 'knobs', views: BOTH, keys: ['#'],
    label: 'Cycle auto-fit', reach: 'broadcast',
    hint: 'auto-fit: off → shrink a slide that is too big → size every slide to the screen' },
  { id: 'slide-numbers', group: 'knobs', views: BOTH, keys: ['l'],
    label: 'Cycle the slide numbers', reach: 'broadcast',
    hint: 'slide numbers: stacked → in a row → off' },
  { id: 'note-button', group: 'knobs', views: BOTH, keys: ['m'],
    label: 'Show or hide the note button', reach: 'ungated', state: 'noteButton',
    hint: 'the <i>+ note</i> button in the slide\'s left gutter: shown ↔ hidden – pressed here it lands on the projection too, and <kbd>N</kbd> still opens an annotation either way' },
  { id: 'notes-pane', group: 'notes', views: SPK, keys: ['shift+n'],
    label: 'Write a private note', reach: 'local',
    hint: 'private notes for this chunk – never shown to the room' },
  { id: 'annotate', group: { audience: 'knobs', speaker: 'notes' }, views: BOTH, keys: ['n'],
    label: 'Annotate the slide', reach: 'broadcast',
    hint: {
      audience: 'annotation on the slide itself – it fills the frame while you type; an address in it gets a QR code, and <kbd>Esc</kbd> leaves it as a margin note',
      speaker: 'annotation on the slide itself – it fills the frame while you type and the room reads along; an address in it gets a QR code',
    } },
  { id: 'export-annotations', group: { audience: 'knobs', speaker: 'notes' }, views: BOTH, keys: ['shift+e'],
    label: 'Copy the annotations as Markdown', reach: 'local',
    hint: {
      audience: 'copy the annotations typed with <kbd>N</kbd> out as Markdown for source.md',
      speaker: 'copy annotations out as Markdown for source.md',
    } },
  { id: 'note-escape', group: 'notes', views: SPK, context: 'note',
    show: '<kbd>Esc</kbd> in a note',
    hint: 'back to the slide, so the arrows work again – the annotation stays as a margin note' },
  { id: 'fullscreen', group: 'knobs', views: BOTH, keys: ['w'],
    label: 'Fullscreen on the projection', short: 'Fullscreen', reach: 'ungated', state: 'fullscreen',
    hint: {
      audience: 'fullscreen on the projection – nothing of the browser round the slide, and <kbd>Esc</kbd> leaves it again',
      speaker: 'fullscreen on the projection – nothing of the browser round the slide. The browser only grants this to a press in the window itself, so the projection puts up a line to click once, and <kbd>Esc</kbd> leaves',
    } },
  { id: 'fullscreen-window', group: 'knobs', views: SPK, keys: ['shift+w'],
    label: 'Fullscreen for this window', reach: 'local',
    hint: 'fullscreen for this window instead of the projection' },
  // The full stop is the key many presenter remotes send for a black screen.
  { id: 'blank', group: 'knobs', views: BOTH, keys: ['b', '.'],
    label: 'Blank the projection', reach: 'ungated', state: 'blanked',
    hint: 'blank the projection – the speaker window keeps working, frozen or not' },
  { id: 'demo', group: 'knobs', views: BOTH, keys: ['d'],
    label: 'Show a live demo', reach: 'ungated', state: 'demo',
    hint: 'live demo: a window or a screen of this machine on the projection, until D again – pressed in the cockpit, the picker opens on the laptop; the very first capture on a Mac fails while macOS asks for screen-recording rights, so try it once before the talk' },
  { id: 'collapse-back', group: 'knobs', views: BOTH, keys: ['shift+c'],
    label: 'Cycle the collapse backwards', reach: 'broadcast',
    hint: 'the collapse, backwards' },
  { id: 'font-back', group: 'knobs', views: BOTH, keys: ['shift+f'],
    label: 'Cycle the font backwards', reach: 'broadcast',
    hint: 'the font, backwards' },
  { id: 'theme-back', group: 'knobs', views: BOTH, keys: ['shift+a'],
    label: 'Cycle the theme backwards', reach: 'broadcast',
    hint: 'the theme, backwards' },
  { id: 'slide-numbers-back', group: 'knobs', views: BOTH, keys: ['shift+l'],
    label: 'Cycle the slide numbers backwards', reach: 'broadcast',
    hint: 'the slide numbers, backwards' },
  { id: 'touch-palette', group: 'knobs', views: BOTH,
    mouse: 'on a touchscreen',
    hint: 'the same settings sit behind the ⋯ button on the toolbar' },

  // ── the diagram editor (where it ships) ──
  // From the one table in editor.md §4.2.
  ed('open', 'click a diagram, then <kbd>E</kbd>', 'open the editor on that figure – or the button in the corner of the card'),
  ed('select', '<kbd>1</kbd> <kbd>V</kbd>', 'select'),
  ed('tools', '<kbd>2</kbd>/<kbd>R</kbd> <kbd>3</kbd>/<kbd>C</kbd> <kbd>4</kbd>/<kbd>T</kbd> <kbd>5</kbd>/<kbd>A</kbd> <kbd>8</kbd>/<kbd>I</kbd>', 'box · dot · text · edge · image'),
  ed('line', '<kbd>9</kbd>/<kbd>L</kbd>', 'a line with no arrowhead – both ends are plain coordinates, so it attaches to nothing'),
  ed('wrap', '<kbd>6</kbd> · <kbd>7</kbd>', 'container · brace, drawn around whatever is selected'),
  ed('lock', '<kbd>Q</kbd>', 'keep the current tool instead of falling back to select'),
  ed('drag', 'drag · drag a handle', 'move it · resize it – the status bar shows the line it will write'),
  ed('dock', 'drag it over another element', 'four chips appear – release on one and it docks to that side of it, and follows it from then on'),
  ed('side', 'drag it through what it sits beside', 'changes which side of that element it is on'),
  ed('nudge', 'arrows · <kbd>Shift</kbd>-arrows', 'nudge the selection, fine · coarse'),
  ed('nosnap', '<kbd>Ctrl</kbd> while dragging', 'suspend snapping, for when 0.5847 is meant'),
  ed('unalign', '<kbd>Alt</kbd> while dragging', 'leave an align or spread set at once – or just pull half a cell clear of it'),
  ed('waypoint', 'double-click a waypoint', 'take it off the arrow – the hollow dots on the line put one back'),
  ed('delete', '<kbd>Delete</kbd> · <kbd>Backspace</kbd>', 'delete, after listing what refers to it'),
  ed('undo', '<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd> · <kbd>Shift</kbd>-<kbd>Ctrl/Cmd</kbd>-<kbd>Z</kbd>', 'undo · redo'),
  ed('select-all', '<kbd>Ctrl/Cmd</kbd>-<kbd>A</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>D</kbd>', 'select all · duplicate'),
  ed('clipboard', '<kbd>Ctrl/Cmd</kbd>-<kbd>C</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>V</kbd> · <kbd>Ctrl/Cmd</kbd>-<kbd>Shift</kbd>-<kbd>V</kbd>', 'copy · paste · paste in place'),
  ed('commit', '<kbd>Ctrl/Cmd</kbd>-<kbd>S</kbd>', 'write the block back – into source.md while --watch runs, otherwise to the clipboard'),
  ed('steps', '<kbd>&lt;</kbd> <kbd>&gt;</kbd>', 'walk the diagram steps – a drag inside a step writes a move into that step'),
  ed('pan', '<kbd>Space</kbd>-drag · middle-drag · wheel', 'pan · pan · zoom'),
  ed('frame', '<kbd>F</kbd> · <kbd>Shift</kbd>-<kbd>F</kbd>', 'frame: slide → column → print, the three places the figure can land · the same the other way round'),
  ed('figures', '<kbd>,</kbd> <kbd>.</kbd> · <kbd>PageUp</kbd> <kbd>PageDown</kbd>', 'previous / next figure in the lecture'),
  ed('board', '<kbd>O</kbd>', 'the figure board'),
  ed('strip', '<kbd>Shift</kbd>-<kbd>V</kbd>', 'flip the figure strip between the bottom and the right edge'),
  ed('escape', '<kbd>Esc</kbd>', 'step back out: deselect, then the select tool, then close'),
  ed('help', '<kbd>?</kbd>', 'this panel, over the editor'),

  // ── the other windows ──
  { id: 'cockpit', group: 'windows', views: AUD, keys: ['s'],
    label: 'Open the speaker cockpit', short: 'Speaker cockpit', opens: 'speaker', reach: 'local',
    hint: 'open the speaker cockpit – both windows then stay in sync' },
  { id: 'print', group: 'windows', views: BOTH, keys: ['p'],
    label: 'Open the print view', short: 'Print view', opens: 'print', reach: 'local',
    hint: 'open the print view in a new tab' },
  { id: 'help', group: 'windows', views: BOTH, keys: ['?'],
    label: 'Show the keyboard and mouse reference', reach: 'local',
    hint: 'this panel' },
  // Answered in the listener's head, ahead of the guard that lets every
  // Cmd and Ctrl chord through to the browser, so it is a doc row: the
  // table spells no modifier but Shift.
  { id: 'palette', group: 'windows', views: BOTH,
    show: '<kbd>Ctrl/Cmd</kbd>-<kbd>K</kbd>',
    hint: 'this panel as a command palette: the field has the keys, <kbd>↑</kbd> <kbd>↓</kbd> pick a row, <kbd>Enter</kbd> or a click runs it' },
];

// The projection's start menu: the three things a lecturer does before the
// first slide moves, in this order. audience.html only, and only until the
// talk starts (see the start menu in AUDIENCE_JS).
export const START_MENU = ['fullscreen', 'cockpit', 'print'];

// ── reading the table ─────────────────────────────────────────────────

// A press as the table spells it. Lower case, so Caps Lock is not Shift
// and 'ArrowRight' is 'arrowright'; Shift as a prefix, never folded into the
// letter.
export function comboOf(e) {
  return (e.shiftKey ? 'shift+' : '') + String(e.key).toLowerCase();
}

// combo -> id for one view. Every command the view answers is in it,
// whatever it requires: a command whose module did not ship has no run
// function, so its key is spent on nothing - which is what Shift-S in a
// cockpit without the prompter always did.
export function keyMap(view) {
  const map = Object.create(null);
  for (const c of COMMANDS) {
    if (!c.keys || !c.views.includes(view)) continue;
    for (const k of c.keys) map[k] = c.id;
  }
  return map;
}

// The command a press means, or null. A shifted press with no binding of
// its own means what the plain key means: the switch this replaced matched
// e.key case-insensitively and read e.shiftKey only where Shift was a
// binding, so Shift-B blanked, Shift-K toggled the cards, and ? and # (which
// arrive with Shift held) reached their cases.
export function commandFor(map, e) {
  const k = String(e.key).toLowerCase();
  if (e.shiftKey && map['shift+' + k]) return map['shift+' + k];
  return map[k] || null;
}

const KEY_NAMES = {
  ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  escape: 'Esc', enter: 'Enter', backspace: 'Backspace', pageup: 'PageUp', pagedown: 'PageDown',
};
const kbd = (s) => '<kbd>' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</kbd>';
// A combo as the panel spells it: Shift-W, Esc, Space.
export function keyText(combo) {
  const shift = combo.startsWith('shift+');
  const k = shift ? combo.slice(6) : combo;
  const name = KEY_NAMES[k] || (k.length === 1 ? k.toUpperCase() : k);
  return (shift ? kbd('Shift') + '-' : '') + kbd(name);
}

const pick = (v, view) => (v && typeof v === 'object' ? v[view] : v);

// Whether the panel may run this entry's row as a palette: a command, but
// not ?, whose row would only open the panel again.
export function runsFromPanel(c) {
  return !!(c.keys && c.id !== 'help');
}

// The panel's sections for one view, in two runs:
// [[title, [[keyColumn, hint, runId, rowId], …], ref], …] - first every
// section's runnable rows (ref false), then every section's other rows (ref
// true): the doc rows, and ? itself. Both columns HTML, runId the command a
// click on the row runs (null for a reference row), rowId the entry the row
// is. Two runs and not one list per section, so that the arrows, which move
// through the runnable rows, never pass over a row they cannot select.
// `ships` says which optional modules this view carries.
export function helpGroups(view, ships = {}) {
  const run = [], ref = [];
  for (const g of GROUPS) {
    if (!g.views.includes(view) || (g.requires && !ships[g.requires])) continue;
    const rows = [[], []];
    for (const c of COMMANDS) {
      if (!c.views.includes(view) || pick(c.group, view) !== g.id) continue;
      if (c.requires && !ships[c.requires]) continue;
      const keys = c.show || c.mouse || c.keys.map(keyText).join(' · ');
      const runs = runsFromPanel(c);
      rows[runs ? 0 : 1].push([keys, pick(c.hint, view), runs ? c.id : null, c.id]);
    }
    if (rows[0].length) run.push([g.title, rows[0], false]);
    if (rows[1].length) ref.push([g.title, rows[1], true]);
  }
  return run.concat(ref);
}

// ── the table's own rules, asserted at load ───────────────────────────
// As tails.mjs asserts its slot rule: a broken table throws in build.js,
// in lint.js's neighbour the gate, and in the page, rather than binding one
// key twice and letting the order of the array decide.
(function assertTable() {
  const fail = (msg) => { throw new Error('commands.mjs: ' + msg); };
  const ids = new Set();
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const c of COMMANDS) {
    if (ids.has(c.id)) fail('two entries are called ' + c.id);
    ids.add(c.id);
    for (const v of c.views) if (!VIEWS.includes(v)) fail(c.id + ' names an unknown view ' + v);
    for (const v of c.views) if (!groups.has(pick(c.group, v))) fail(c.id + ' is filed under an unknown group');
    if (c.requires && !REQUIRES.includes(c.requires)) fail(c.id + ' requires an unknown ' + c.requires);
    if (c.reach && !REACH.includes(c.reach)) fail(c.id + ' has an unknown reach ' + c.reach);
    if (c.when && !WHEN.includes(c.when)) fail(c.id + ' has an unknown when ' + c.when);
    if (c.context && !CONTEXTS.includes(c.context)) fail(c.id + ' has an unknown context ' + c.context);
    if (c.keys && !c.label) fail(c.id + ' is a command without a label');
    if (!c.hint) fail(c.id + ' is a row without a hint');
    if (!c.keys && !c.show && !c.mouse) fail(c.id + ' has no keys and nothing to show for them');
  }
  for (const c of COMMANDS) if ('row' in c) fail(c.id + ' names a row to share; every command has a row of its own');
  for (const id of START_MENU) {
    const c = COMMANDS.find((x) => x.id === id);
    if (!c || !c.keys || !c.short || !c.views.includes('audience')) fail('the start menu names ' + id + ', which is no audience command with a short name');
  }
  for (const view of VIEWS) {
    const seen = Object.create(null);
    for (const c of COMMANDS) {
      if (!c.keys || !c.views.includes(view)) continue;
      for (const k of c.keys) {
        if (k !== String(k).toLowerCase()) fail(c.id + ' spells ' + k + ' in upper case');
        if (seen[k]) fail('in the ' + view + ' view ' + k + ' is bound to ' + seen[k] + ' and to ' + c.id);
        seen[k] = c.id;
      }
    }
  }
})();
