/*
 * integrate.mjs – --integrate-annotations, the paste-back half of Shift-E.
 *
 * The cockpit's Shift-E copies a marker block of everything typed in this
 * browser that source.md does not say yet: the annotation drafts (N) and the
 * speaker-note overrides (the notes pane). The lecturer pastes it at the end
 * of source.md and runs
 *
 *   node build.js source.md --integrate-annotations
 *
 * which moves each part under the chunk it names and removes the block. What
 * cannot be placed is parked in a trimmed block at the end of the file, each
 * part with its reason, so nothing typed is lost.
 *
 * The snippet, one `### <chunk-id>` section per chunk:
 *
 *   <!-- annotations:start -->
 *
 *   ### intro
 *   <!-- annot-base: "" -->
 *   > annot: Ask who has used a hash function this week.
 *
 *   <!-- note-base: "Open with the question." -->
 *   > note: Open with the question.
 *   >
 *   > TODO: a better second example
 *
 *   <!-- annotations:end -->
 *
 * The flag and the marker format are source-format interface: a snippet
 * exported before notes existed (annotation lines and nothing else) moves
 * exactly as it always did. Two things are new beside it, and both are
 * invisible if the block is pasted and never integrated:
 *
 * - `> note:` lines are the whole of the chunk's notes as the lecturer left
 *   them, and a lone `> note:` says they were deleted.
 * - `<!-- note-base: … -->` / `<!-- annot-base: … -->` carry the source text
 *   the edit was begun from, as a JSON string on one line with `<` and `>`
 *   written as \u003c and \u003e – so no base can open or close a comment, or
 *   be read as the block's own end marker. JSON rather than base64 so that
 *   the line can be read in a diff. Absent when the cockpit does not know
 *   the base; an edit with no base is integrated as one always was.
 *
 * A base that is not what the chunk says now means source.md moved under the
 * edit, and the edit is parked rather than written over the newer text.
 *
 * Pure string work, zero Node APIs, and one import – the fence and comment
 * reader every structural reader in build.js and lint.js goes through – so
 * test/gates/integrate.mjs decides every rule without a build. build.js
 * imports it dynamically, under the flag alone, which is why the desktop
 * app's staged engine does not carry it.
 */
import { fenceTracker } from './tails.mjs';

export const ANNOT_MARKER_START = '<!-- annotations:start -->';
export const ANNOT_MARKER_END = '<!-- annotations:end -->';

// ── the base line, both directions ───────────────────────────────────

export function encodeBase(text) {
  return JSON.stringify(String(text ?? '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
const BASE_RE = /^<!--\s*(note|annot)-base:\s*(.*?)\s*-->\s*$/;
export function baseLine(kind, text) {
  return '<!-- ' + kind + '-base: ' + encodeBase(text) + ' -->';
}

// The lines of one note block for the source. A pinned block keeps its pin
// on the opening line alone, the way authors write it. An unpinned one whose
// first line would read as a pin (`from 3`) opens empty and carries that
// line on the next, where flushNoteBlock does not look for one.
export function noteBlockLines(text, from = null) {
  const lines = String(text).split('\n');
  const cont = (l) => (l ? '> ' + l : '>');
  if (from != null) return ['> note: from ' + from, ...lines.map(cont)];
  if (/^from\s+\d+$/i.test(lines[0].trim())) return ['> note:', ...lines.map(cont)];
  return ['> note: ' + lines[0], ...lines.slice(1).map(cont)];
}

// ── reading the source ───────────────────────────────────────────────

const NOTE_OPEN = /^>\s*note:\s*(.*)$/i;
const ANNOT_OPEN = /^>\s*annot:\s*(.*)$/i;
const QUOTE_CONT = /^>\s?(.*)$/;
const PIN = /^from\s+(\d+)$/i;

function tailHasId(line, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\{[^}]*#' + esc + '(?=[\\s}])[^}]*\\}').test(line);
}

// One walk over the source lines, marking each as structure or text the way
// parseLecture would: frontmatter, fenced code, a multi-line comment and the
// body of a `::: draw` (whose `#` lines are comments) are never structure,
// and a heading inside a block that captures its body is that block's text. Returns per
// line { h: 1 | 2 | 0, quote: true when a `>` line here could be a note or an
// annotation }.
const CAPTURES = new Set(['draw', 'cards', 'rows', 'overlay', 'dock', 'expand', 'footnote', 'margin', 'marginalia', 'pulse']);
function scanLines(lines) {
  const out = new Array(lines.length);
  let i = 0;
  if (lines[0] === '---') {
    out[0] = { h: 0, quote: false };
    for (i = 1; i < lines.length; i++) {
      out[i] = { h: 0, quote: false };
      if (lines[i] === '---') { i++; break; }
    }
  }
  const fence = fenceTracker();
  let depth = 0;
  let inDraw = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (inDraw) {
      out[i] = { h: 0, quote: false };
      if (/^:::\s*$/.test(line)) { inDraw = false; depth = Math.max(0, depth - 1); }
      continue;
    }
    const delim = fence.step(line);
    if (delim || fence.inside || fence.commented) { out[i] = { h: 0, quote: false }; continue; }
    const opener = line.match(/^:::\s+(\S+)/);
    if (opener) {
      // Only a block that captures its body makes a heading in it text, as
      // in parseLecture: a layout wrapper (cols, side, slide, …) does not,
      // and its closer at depth 0 closes nothing here. A `::: draw` inside a
      // captured block nests; a backdrop is one line with no closer, and
      // `::: flip` splits a pane rather than opening one.
      const w = opener[1];
      if (CAPTURES.has(w) || (depth && w !== 'backdrop' && w !== 'flip')) depth++;
      if (w === 'draw') inDraw = true;
      out[i] = { h: 0, quote: false };
      continue;
    }
    if (/^:::\s*$/.test(line)) { depth = Math.max(0, depth - 1); out[i] = { h: 0, quote: false }; continue; }
    const h = depth ? 0 : /^#\s/.test(line) ? 1 : /^##\s/.test(line) ? 2 : 0;
    out[i] = { h, quote: /^>/.test(line) };
  }
  return out;
}

// Where a chunk's heading is and where its slide ends: the next `#` or `##`.
// `x-section` is the cockpit's id for the divider `# … {#x}` (build.js's
// sectionChunkId), so a note edited on a divider finds its heading too - but
// only for notes: a divider has no annotation of its own (the parser gives
// one written there to the next chunk).
function locateChunk(lines, marks, id, { divider }) {
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (marks[i].h === 2 && tailHasId(lines[i], id)) { at = i; break; }
  }
  if (at < 0 && divider && id.endsWith('-section')) {
    const col = id.slice(0, -'-section'.length);
    for (let i = 0; col && i < lines.length; i++) {
      if (marks[i].h === 1 && tailHasId(lines[i], col)) { at = i; break; }
    }
  }
  if (at < 0) return null;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (marks[i].h) { end = i; break; }
  return { at, end };
}

// The `> note:` (or `> annot:`) blocks in a range, each with its line span,
// its pin and its text as flushNoteBlock reads it: the pin taken off the
// opening line, the lines joined, trimmed. A block ends at the first line
// that is not a `>` line, or at the next opener of either kind.
function blocksIn(lines, marks, from, to, kind) {
  const open = kind === 'note' ? NOTE_OPEN : ANNOT_OPEN;
  const out = [];
  for (let i = from; i < to; i++) {
    if (!marks[i].quote) continue;
    const m = lines[i].match(open);
    if (!m) continue;
    const body = [m[1]];
    let j = i + 1;
    while (j < to && marks[j].quote && !NOTE_OPEN.test(lines[j]) && !ANNOT_OPEN.test(lines[j])) {
      body.push(lines[j].match(QUOTE_CONT)[1]);
      j++;
    }
    let pin = null;
    if (kind === 'note') {
      const p = PIN.exec((body[0] || '').trim());
      if (p) { pin = Number(p[1]); body.shift(); }
    }
    out.push({ start: i, end: j, from: pin, text: body.join('\n').trim() });
    i = j - 1;
  }
  return out;
}
// What the cockpit's template (or the annotation textarea) holds for these
// blocks: the non-empty ones, joined with a blank line.
const joined = (blocks) => blocks.map(b => b.text).filter(Boolean).join('\n\n');

// ── reading the snippet ──────────────────────────────────────────────

function extractAnnotLines(lines) {
  const out = [];
  let inAnnot = false;
  for (const line of lines) {
    if (ANNOT_OPEN.test(line)) {
      if (inAnnot) out.push('');
      out.push(line);
      inAnnot = true;
      continue;
    }
    if (inAnnot && /^>/.test(line) && !NOTE_OPEN.test(line)) { out.push(line); continue; }
    if (inAnnot && !line.trim()) { inAnnot = false; continue; }
    inAnnot = false;
  }
  return out;
}

// One section's parts: the annotation lines (as they always were read), the
// notes (every `> note:` block of the section, joined as the parser joins
// them; present with an empty text for a lone `> note:`, which is the
// delete), the two bases, and the lines of each part as written, for
// parking it.
function readSection(sec, warnings) {
  const annotLines = extractAnnotLines(sec.lines);
  const bases = {};
  const baseLines = {};
  const noteLines = [];
  let note = null;
  for (let i = 0; i < sec.lines.length; i++) {
    const line = sec.lines[i];
    const b = line.match(BASE_RE);
    if (b) {
      baseLines[b[1]] = line;
      try {
        const v = JSON.parse(b[2]);
        if (typeof v !== 'string') throw new Error('not a string');
        bases[b[1]] = v;
      } catch (e) {
        warnings.push(`the ${b[1]}-base line under ### ${sec.id} is not a JSON string and was ignored, so that ${b[1]} is integrated as one with no base.`);
      }
      continue;
    }
    const n = line.match(NOTE_OPEN);
    if (!n) continue;
    const body = [n[1]];
    noteLines.push(line);
    while (i + 1 < sec.lines.length && /^>/.test(sec.lines[i + 1])
           && !NOTE_OPEN.test(sec.lines[i + 1]) && !ANNOT_OPEN.test(sec.lines[i + 1])) {
      i++;
      noteLines.push(sec.lines[i]);
      body.push(sec.lines[i].match(QUOTE_CONT)[1]);
    }
    const text = body.join('\n').trim();
    note = note ? { text: [note.text, text].filter(Boolean).join('\n\n') } : { text };
  }
  const raw = {
    annot: [baseLines.annot, ...annotLines].filter(l => l !== undefined),
    note: [baseLines.note, ...noteLines].filter(l => l !== undefined),
  };
  return { annotLines, note, bases, raw };
}

// ── the integrator ───────────────────────────────────────────────────

export const REASONS = {
  noLines: 'no > annot: or > note: lines',
  notFound: 'chunk id not found',
  annotMoved: 'source annotation changed since the draft',
  notesMoved: 'source notes changed since the edit',
  notesSpread: 'notes spread over several beats – merge by hand',
};

export function integrateAnnotations(input) {
  const empty = { moved: 0, notes: { replaced: 0, inserted: 0, deleted: 0 }, unresolved: [], warnings: [] };
  // A source written with CRLF is read as LF and written back with CRLF, so
  // that the moved lines do not come out with endings of their own.
  const crlf = input.includes('\r\n');
  const src = crlf ? input.replace(/\r\n/g, '\n') : input;
  const back = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);
  const startIdx = src.indexOf(ANNOT_MARKER_START);
  if (startIdx < 0) return { src: input, ...empty, hadMarker: false };
  // The end marker on a line of its own, as Shift-E writes it, so a note or
  // an annotation that quotes it - a `>` line - does not end the block; and
  // where no line is only the marker, the first one anywhere, as before.
  const innerAt = startIdx + ANNOT_MARKER_START.length;
  const endHit = /^[ \t]*<!-- annotations:end -->[ \t]*$/m.exec(src.slice(innerAt));
  const endMarkerIdx = endHit
    ? innerAt + endHit.index + endHit[0].indexOf('<')
    : src.indexOf(ANNOT_MARKER_END, innerAt);
  // No end marker is refused, never read as "to the end of the file": the
  // block is removed from the source, so that reading deleted every slide
  // written after a pasted snippet whose last line had not come along.
  if (endMarkerIdx < 0) return { src: input, ...empty, hadMarker: true, noEnd: true };
  const blockEnd = endMarkerIdx + ANNOT_MARKER_END.length;
  const blockInner = src.slice(startIdx + ANNOT_MARKER_START.length, endMarkerIdx);

  const warnings = [];
  const orphanLines = [];
  const sections = new Map();
  let cur = null;
  for (const line of blockInner.split('\n')) {
    const h3 = line.match(/^###\s+([A-Za-z0-9_-]+)\s*$/);
    if (h3) {
      cur = sections.get(h3[1]) || { id: h3[1], lines: [] };
      sections.set(h3[1], cur);
      continue;
    }
    if (cur) cur.lines.push(line);
    else orphanLines.push(line);
  }
  if (orphanLines.some(l => ANNOT_OPEN.test(l) || NOTE_OPEN.test(l))) {
    warnings.push('`> annot:` or `> note:` lines before the first `### <id>` header were ignored — prefix them with `### some-chunk-id` so the integrator knows where to put them.');
  }

  const before = src.slice(0, startIdx).replace(/\n+$/, '\n');
  const after = src.slice(blockEnd).replace(/^\n+/, '');
  const baseSrc = before + (after ? '\n' + after : '');
  const lines = baseSrc.split('\n');
  const marks = scanLines(lines);

  // Every edit is planned against the unmutated source, so a moved line can
  // never be read as a heading by a later section, and applied from the
  // bottom up so earlier line numbers stay valid. At one line the rank says
  // the order: a block replaced or removed first, then an inserted note, then
  // an inserted annotation - which so ends up directly under the heading, as
  // it always did, with the note under it.
  const edits = [];
  const unresolved = [];
  const parked = [];   // [id, lines]
  const notes = { replaced: 0, inserted: 0, deleted: 0 };
  let moved = 0;
  const park = (id, kind, reason, partLines) => {
    unresolved.push({ id, kind, reason });
    parked.push([id, partLines]);
  };

  for (const sec of sections.values()) {
    const part = readSection(sec, warnings);
    const hasAnnot = part.annotLines.length > 0;
    const hasNote = !!part.note;
    if (!hasAnnot && !hasNote) {
      unresolved.push({ id: sec.id, kind: null, reason: REASONS.noLines });
      parked.push([sec.id, sec.lines]);
      continue;
    }
    const chunk = locateChunk(lines, marks, sec.id, { divider: false });
    const noteChunk = chunk || (hasNote ? locateChunk(lines, marks, sec.id, { divider: true }) : null);
    if (!chunk && !noteChunk) {
      unresolved.push({ id: sec.id, kind: null, reason: REASONS.notFound });
      parked.push([sec.id, sec.lines]);
      continue;
    }

    if (hasAnnot) {
      if (!chunk) {
        park(sec.id, 'annot', REASONS.notFound, part.raw.annot);
      } else if ('annot' in part.bases
                 && part.bases.annot.trim() !== joined(blocksIn(lines, marks, chunk.at + 1, chunk.end, 'annot'))) {
        park(sec.id, 'annot', REASONS.annotMoved, part.raw.annot);
      } else {
        edits.push({ at: chunk.at + 1, remove: 0, insert: ['', ...part.annotLines], rank: 1 });
        moved++;
      }
    }

    if (hasNote) {
      const { at, end } = noteChunk;
      const blocks = blocksIn(lines, marks, at + 1, end, 'note');
      const filled = blocks.filter(b => b.text);
      const text = part.note.text;
      if ('note' in part.bases && part.bases.note.trim() !== joined(blocks)) {
        park(sec.id, 'note', REASONS.notesMoved, part.raw.note);
      } else if (!text) {
        // The lecturer deleted the notes: every block goes, with one blank
        // line beside it - the one after, else the one before.
        const taken = new Set();
        for (const b of blocks) {
          let s = b.start, e = b.end;
          if (e < lines.length && !lines[e].trim() && !taken.has(e)) e++;
          else if (s > 0 && !lines[s - 1].trim() && !taken.has(s - 1)) s--;
          for (let k = s; k < e; k++) taken.add(k);
          edits.push({ at: s, remove: e - s, insert: [], rank: 3 });
        }
        if (blocks.length) notes.deleted++;
      } else if (!filled.length) {
        edits.push({ at: at + 1, remove: 0, insert: ['', ...noteBlockLines(text)], rank: 2 });
        notes.inserted++;
      } else if (filled.length === 1) {
        const b = filled[0];
        edits.push({ at: b.start, remove: b.end - b.start, insert: noteBlockLines(text, b.from), rank: 3 });
        notes.replaced++;
      } else {
        const parts = text.split(/\n[ \t]*\n/).map(s => s.trim()).filter(Boolean);
        const clean = filled.every(b => !/\n[ \t]*\n/.test(b.text));
        if (clean && parts.length === filled.length) {
          filled.forEach((b, k) => {
            edits.push({ at: b.start, remove: b.end - b.start, insert: noteBlockLines(parts[k], b.from), rank: 3 });
          });
          notes.replaced++;
        } else {
          park(sec.id, 'note', REASONS.notesSpread, part.raw.note);
        }
      }
    }
  }

  edits.sort((a, b) => b.at - a.at || b.rank - a.rank);
  for (const e of edits) lines.splice(e.at, e.remove, ...e.insert);
  let working = lines.join('\n');

  if (parked.length) {
    // One section per id, its parts in the order they were parked.
    const byId = new Map();
    for (const [id, partLines] of parked) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(partLines.join('\n').replace(/^\n+|\n+$/g, ''));
    }
    const text = [...byId].map(([id, parts]) => '### ' + id + '\n' + parts.join('\n\n')).join('\n\n');
    if (!working.endsWith('\n')) working += '\n';
    working += '\n' + ANNOT_MARKER_START + '\n\n' + text + '\n\n' + ANNOT_MARKER_END + '\n';
  }

  return { src: back(working), moved, notes, unresolved, warnings, hadMarker: true };
}
