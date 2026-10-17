
const notesContent = document.getElementById('psiINT-notes-content');
const notesPane = document.getElementById('psiINT-notes-pane');
const previewStrip = document.getElementById('psiINT-preview-strip');
const scrubberEl = document.getElementById('psiINT-scrubber');
const timerEl = document.getElementById('psiINT-timer');
const freezeBtn = document.getElementById('psiINT-freeze-btn');
const stageCell = document.getElementById('psiINT-stage-cell');

// Compute --stage-scale so the audience-sized slide (slide-w × slide-h)
// fits inside #psiINT-stage-cell with letterbox bars. The viewport itself is
// laid out at the full reference size; scale is purely visual. This
// guarantees identical content wrap + font size across audience and
// speaker, which the laser-pointer geometry depends on.
function sizeStageViewport() {
  if (!stageCell) return;
  const cw = stageCell.clientWidth;
  const ch = stageCell.clientHeight;
  if (!cw || !ch) return;
  const slideW = viewport.offsetWidth || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slide-w')) || cw;
  const slideH = viewport.offsetHeight || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slide-h')) || ch;
  if (!slideW || !slideH) return;
  const scale = Math.min(cw / slideW, ch / slideH);
  document.documentElement.style.setProperty('--stage-scale', String(scale));
  if (typeof focusCamera === 'function') focusCamera(true);
  if (typeof populatePreviewStrip === 'function') populatePreviewStrip();
}
try {
  new ResizeObserver(sizeStageViewport).observe(stageCell);
} catch (e) {}
window.addEventListener('resize', sizeStageViewport);
requestAnimationFrame(sizeStageViewport);

// Freeze: the projector metaphor, not the plumbing one. This used to be a
// "push" toggle plus a separate "force one push" key, which described what
// the code does (send a snapshot) rather than what the lecturer wants (hold
// the image while I look ahead). Inverted and renamed, the second key
// disappears: thawing *is* the resync, because the first thing an ungated
// broadcast does is hand the room our current state.
// A --watch save reloads this window with the freeze it had (watchResume in
// AUDIENCE_JS); a frozen cockpit that came back live pushed its look-ahead
// to the room on the first message.
let frozen = !!(watchResume && watchResume.frozen);
viewHooks.shouldBroadcast = () => !frozen;
viewHooks.lookingAhead = () => frozen;
// The cockpit's own commands, assigned into the key map's COMMAND_RUN the way
// viewHooks are set: what the letters mean is in commands.mjs, what they do
// here is in this file, next to the code that does it.
//
// V freezes the projection – phonetically close enough to "freeze" to
// stick, and F is already the font cycle. Rearranging this window is the
// rarer, less urgent act, so it is Shift-V.
COMMAND_RUN['freeze'] = (e) => { toggleFreeze(); e.preventDefault(); };
COMMAND_RUN['preview-orientation'] = (e) => { togglePreviewOrientation(); e.preventDefault(); };
// Shift-N: force-open the private notes pane and focus it, even when it is
// empty or collapsed. Plain N stays the annotation the room reads along.
COMMAND_RUN['notes-pane'] = (e) => {
  if (overview) return;
  focusNotesPane();
  e.preventDefault();
};
COMMAND_RUN['export-annotations'] = (e) => { exportAnnotations(); e.preventDefault(); };
// This window's own frame, for the one-screen case where the cockpit IS the
// thing to fill; plain W is the projection's.
COMMAND_RUN['fullscreen-window'] = (e) => { toggleFullscreenHere(); e.preventDefault(); };
// S opens the projection, or brings it forward (openViewWindow). The other
// half of the projection's S, and the way back from a projection closed by
// mistake: the window it opens has this cockpit for its opener, so it
// attaches here, and the clock, the freeze and the cue cursor stay as they
// are. A cockpit opened on its own used to spend the press on nothing.
function openProjection() {
  if (hasLivePeer()) { try { peer.focus(); } catch (err) {} return; }
  withView('audience', () => openViewWindow('audience'));
}
COMMAND_RUN['projection'] = (e) => { openProjection(); e.preventDefault(); };
// A projection that has just booted in a window this cockpit opened, or come
// back from a reload: it is handed the slide, the way thawing hands it -
// unless the cockpit is frozen, where the room is not this window's to
// move, and a projection that has not greeted yet is only asked to.
viewHooks.onPeerBoot = (greeted) => {
  if (!frozen) {
    sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
    figureFocusState().forEach(sendToPeer);
  } else if (!greeted) {
    sendToPeer({ type: 'ping', source: VIEW });
  }
};
viewHooks.onPeerChange = () => applyFreezeIndicator();
// The footer's one light says two things, because a cockpit that drives
// nothing is the state that must not look like the one that does: whether a
// projection answers (hasLivePeer, kept current by peerTick), and if one
// does, whether it follows. With no projection the click opens one.
function applyFreezeIndicator() {
  const live = hasLivePeer();
  freezeBtn.classList.toggle('is-frozen', frozen && live);
  freezeBtn.classList.toggle('no-peer', !live);
  freezeBtn.textContent = !live ? (frozen ? '○ no projection · frozen' : '○ no projection')
    : frozen ? '❄ frozen' : '● live';
  freezeBtn.setAttribute('aria-pressed', frozen ? 'true' : 'false');
  freezeBtn.title = !live
    ? 'No projection window answers this cockpit. Click or press S to open it.'
      + (frozen ? ' V thaws the freeze.' : '')
    : frozen
    ? 'The room is holding one slide while you move on. Click or press V to catch it up.'
    : 'The room follows this window. Click or press V to freeze the projection.';
}
// The heartbeat a projection opened by hand reads before it opens a second
// cockpit (cockpitElsewhere in AUDIENCE_JS). Removed when this page goes.
function cockpitBeat() {
  try { localStorage.setItem(COCKPIT_BEAT_KEY, String(Date.now())); } catch (e) {}
}
cockpitBeat();
setInterval(cockpitBeat, COCKPIT_BEAT_MS);
window.addEventListener('pagehide', () => {
  try { localStorage.removeItem(COCKPIT_BEAT_KEY); } catch (e) {}
});
function toggleFreeze() {
  frozen = !frozen;
  applyFreezeIndicator();
  // A dot already on the wall stays there until its timeout otherwise.
  if (frozen) sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx: -1, x: 0, y: 0 });
  // Thawing has to push immediately. Without this the room keeps the frozen
  // slide until the next navigation, so unfreezing on the slide you want to
  // land on would look like it did nothing at all.
  if (!frozen && !isApplyingRemote) {
    sendToPeer({ type: 'state', source: VIEW, payload: snapshot() });
    // The snapshot moves the slide, not the focus card or a brought-in
    // aside: those travel as their own messages, and a frozen window sent
    // none, so the room's card has to be told explicitly - opened, closed or
    // left as it is.
    figureFocusState().forEach(sendToPeer);
    // The room is now on this window's slide, so this is the position a
    // reloaded projection should come back to.
    saveActive();
    // Edits made while frozen were held back, not dropped: the editor kept
    // the latest source per figure, and thawing is when the room gets the
    // finished picture – the exact promise the freeze workflow makes.
    if (window.psiEditorThaw) window.psiEditorThaw();
  }
  flashMode(!hasLivePeer()
    ? (frozen ? 'frozen · no projection window open' : 'live again · no projection window open')
    : frozen
    ? 'projection frozen · the room holds this slide'
    : 'projection live · the room follows again');
}
applyFreezeIndicator();
freezeBtn.addEventListener('click', () => {
  if (hasLivePeer()) toggleFreeze();
  else openProjection();
});

// Export live annotation drafts as Markdown. Copies to clipboard first,
// then asks for explicit confirmation before clearing the draft buffer —
// a failed copy or a cancelled confirm leaves localStorage untouched, so
// nothing is lost if the lecturer aborts mid-workflow.
const centerToast = document.getElementById('psiINT-center-toast');
let centerToastTimer = null;
function flashCenter(text, opts = {}) {
  if (!centerToast) return;
  centerToast.textContent = text;
  centerToast.classList.remove('warn');
  centerToast.classList.add('visible');
  if (opts.warn) centerToast.classList.add('warn');
  if (centerToastTimer) clearTimeout(centerToastTimer);
  centerToastTimer = setTimeout(() => {
    centerToast.classList.remove('visible', 'warn');
  }, opts.duration || 1800);
}

function clearExportedDrafts(drafts) {
  drafts.forEach(({ id }) => {
    delete annotations[id];
    const entry = flatChunks.find(c => c.id === id);
    if (entry) {
      const ta2 = entry.el.querySelector('.annot-textarea');
      if (ta2) {
        ta2.value = ta2.defaultValue;
        entry.el.classList.toggle('has-annot', !!ta2.value.trim());
        autosize(ta2);
      }
    }
  });
  saveAnnotations();
  broadcastState();
  flashCenter('drafts cleared');
}

// Derive the source.md path from the current page location so the modal
// can show a ready-to-run command. file:// URLs URL-encode spaces; decode
// before displaying. Falls back to a generic placeholder on non-file URLs.
function sourcePathForCommand() {
  try {
    const raw = decodeURIComponent(window.location.pathname || '');
    if (!raw) return '<path-to>/source.md';
    return raw.replace(/\/[^/]+$/, '/source.md');
  } catch (e) {
    return '<path-to>/source.md';
  }
}

function showExportModal({ drafts, snippet, clipboardOk }) {
  let host = document.getElementById('psiINT-export-modal');
  if (host) host.remove();
  host = document.createElement('div');
  host.id = 'psiINT-export-modal';

  const inner = document.createElement('div');
  inner.className = 'export-modal-inner';

  const head = document.createElement('h2');
  head.className = 'export-modal-head';
  head.textContent = clipboardOk
    ? drafts.length + ' annotation' + (drafts.length === 1 ? '' : 's') + ' copied to clipboard'
    : 'Clipboard blocked — copy manually below';
  inner.appendChild(head);

  const intro = document.createElement('p');
  intro.className = 'export-modal-intro';
  intro.textContent = clipboardOk
    ? 'Next steps to make these notes part of the lecture source:'
    : 'Select the text below and copy it by hand, then follow the steps:';
  inner.appendChild(intro);

  const srcPath = sourcePathForCommand();
  const steps = [
    {
      n: 1,
      title: 'Paste the clipboard content at the end of source.md',
      code: srcPath,
      codeLabel: 'file',
    },
    {
      n: 2,
      title: 'Integrate the pasted block into the right chunks',
      code: 'node build.js ' + srcPath + ' --integrate-annotations',
    },
    {
      n: 3,
      title: 'Rebuild the lecture',
      code: 'node build.js ' + srcPath,
    },
    {
      n: 4,
      title: 'Review with git diff and commit when happy',
      code: 'git diff',
    },
    {
      n: 5,
      title: 'Then return here and press Clear Drafts to remove them from this browser',
    },
  ];

  const stepList = document.createElement('ol');
  stepList.className = 'export-modal-steps';
  for (const step of steps) {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'export-modal-step-title';
    title.textContent = step.title;
    li.appendChild(title);
    if (step.code) {
      const row = document.createElement('div');
      row.className = 'export-modal-code-row';
      const code = document.createElement('code');
      code.className = 'export-modal-code';
      code.textContent = step.code;
      row.appendChild(code);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'export-modal-copy';
      copyBtn.textContent = 'copy';
      copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboardSafe(step.code);
        copyBtn.textContent = ok ? 'copied ✓' : 'copy failed';
        setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
      });
      row.appendChild(copyBtn);
      li.appendChild(row);
    }
    stepList.appendChild(li);
  }
  inner.appendChild(stepList);

  // Always expose the raw snippet in a <details> so the lecturer can
  // re-copy it (clipboard flaked, pasted into wrong window, etc.) without
  // having to re-trigger the export flow.
  const details = document.createElement('details');
  details.className = 'export-modal-raw';
  details.open = !clipboardOk;
  const summary = document.createElement('summary');
  summary.textContent = clipboardOk ? 'show copied text' : 'copied text (select all and copy)';
  details.appendChild(summary);
  const raw = document.createElement('textarea');
  raw.readOnly = true;
  raw.value = snippet;
  details.appendChild(raw);
  inner.appendChild(details);

  const warn = document.createElement('p');
  warn.className = 'export-modal-warn';
  warn.textContent = 'Clear Drafts removes the annotations from localStorage. Do this only after the notes are safely in source.md.';
  inner.appendChild(warn);

  const actions = document.createElement('div');
  actions.className = 'export-modal-actions';
  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'export-modal-keep';
  keepBtn.textContent = 'Keep drafts (close)';
  keepBtn.addEventListener('click', () => host.remove());
  actions.appendChild(keepBtn);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'export-modal-clear';
  clearBtn.textContent = 'Clear drafts now';
  clearBtn.addEventListener('click', () => {
    clearExportedDrafts(drafts);
    host.remove();
  });
  actions.appendChild(clearBtn);
  inner.appendChild(actions);

  host.appendChild(inner);
  host.addEventListener('click', (e) => { if (e.target === host) host.remove(); });
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape') host.remove(); });
  document.body.appendChild(host);
  if (!clipboardOk) raw.select();
  else keepBtn.focus();
}

async function exportAnnotations() {
  const drafts = collectAnnotationDrafts();
  if (!drafts.length) {
    flashCenter('No live annotations to export — type some with N first.', { warn: true, duration: 2600 });
    return;
  }
  const snippet = buildAnnotationSnippet(drafts);
  const copied = await copyToClipboardSafe(snippet);
  showExportModal({ drafts, snippet, clipboardOk: copied });
}

const exportAnnotBtn = document.getElementById('psiINT-export-annot-btn');
if (exportAnnotBtn) exportAnnotBtn.addEventListener('click', exportAnnotations);
document.getElementById('psiINT-speaker-help-btn')?.addEventListener('click', () => toggleHelp(true));

// N on the speaker opens the audience-visible annotation slot (PRD §2 –
// the live marginalia channel that mirrors to the audience). The notes
// pane on the right is the read-side of source > note: lines plus the
// editable speaker-private notes; it is focused by clicking it (it has
// tabindex=0).
// (Default viewHooks.onN already maps to startAnnotate – no override.)

// Per-chunk speaker notes. Each chunk has a default text from the
// source > note: lines (carried in a <template>); the speaker can
// rewrite it during rehearsal/lecture and the override is persisted
// in localStorage. An empty string is a valid override (the speaker
// intentionally cleared the source notes for this chunk).
const noteOverrideKey = (id) => storageKey('speakernote:' + id);
function sourceNotesFor(id) {
  const tmpl = document.querySelector(`template[data-notes-for="${id}"]`);
  // Template body was escapeHtml'd at build time; parsed back into text via .textContent.
  return tmpl ? tmpl.content.textContent : '';
}
function loadNotesFor(id) {
  try {
    const raw = localStorage.getItem(noteOverrideKey(id));
    return raw !== null ? raw : sourceNotesFor(id);
  } catch (e) { return sourceNotesFor(id); }
}
// Auto-size the notes textarea: 1 line minimum, up to 3 lines, scroll
// beyond. Also toggles body.has-notes so CSS can collapse the row
// entirely when there are no notes – reclaims vertical space for the
// slide preview above. Line-height is 1.35 (matching CSS).
//
// Where the browser has field-sizing: content, the stylesheet sizes the
// field and this only toggles a class: a slide change used to write the
// height, read it back and write it again, one forced layout of a document
// that holds every slide twice. Elsewhere the measurement runs once per
// frame, after whatever else the press changed.
const NOTES_MIN_LINES = 1;
const NOTES_MAX_LINES = 3;
const NOTES_CSS_SIZED = !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));
const NOTES_CSS_MORE = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()'));
let notesFrame = 0;
let notesTopFrame = 0;
function autoSizeNotes() {
  const hasText = notesContent.value.trim().length > 0;
  // Pane stays open while the note is being edited so the author can
  // type into an empty pane (Shift-N / + note btn). On blur the class
  // drops back to hasText and an untouched pane collapses again.
  // A manually-sized pane stays open unconditionally.
  const sized = document.body.classList.contains('notes-sized');
  const editing = !notesContent.readOnly || document.activeElement === notesContent;
  document.body.classList.toggle('has-notes', sized || hasText || editing);
  if (NOTES_CSS_SIZED && NOTES_CSS_MORE) return;
  if (!notesFrame) notesFrame = requestAnimationFrame(measureNotes);
}
function measureNotes() {
  notesFrame = 0;
  if (!NOTES_CSS_SIZED && !document.body.classList.contains('notes-sized')) {
    // Measure content height by resetting then reading scrollHeight.
    notesContent.style.height = '1.35em';
    if (notesContent.value.trim()) {
      const lineHeight = 1.35 * parseFloat(getComputedStyle(notesContent).fontSize);
      const wanted = Math.min(notesContent.scrollHeight, lineHeight * NOTES_MAX_LINES);
      notesContent.style.height = Math.max(lineHeight * NOTES_MIN_LINES, wanted) + 'px';
    }
  }
  if (!NOTES_CSS_MORE) markNotesMore();
}
function markNotesMore() {
  const t = notesContent;
  t.classList.toggle('notes-more', t.scrollTop + t.clientHeight < t.scrollHeight - 1);
}
if (!NOTES_CSS_MORE) notesContent.addEventListener('scroll', markNotesMore, { passive: true });

function populateNotesPane() {
  const entry = flatChunks[state.activeIdx];
  notesContent.value = entry ? loadNotesFor(entry.id) : '';
  autoSizeNotes();
  // Back to the head of the new note a frame later: writing scrollTop inside
  // the press would be a forced layout of its own.
  if (!notesTopFrame) notesTopFrame = requestAnimationFrame(() => {
    notesTopFrame = 0;
    notesContent.scrollTop = 0;
  });
}
notesContent.addEventListener('input', () => {
  const entry = flatChunks[state.activeIdx];
  if (entry) {
    try { localStorage.setItem(noteOverrideKey(entry.id), notesContent.value); } catch (e) {}
    // The override replaces this chunk's cards, marks and all, and a mark
    // typed here moves the drift beside the clock at once.
    cueMarks = null;
    cueSync();
  }
  autoSizeNotes();
});

// The field is read-only until an edit is asked for. One click into it used
// to take the presenter remote: the key map stands back for a text field, so
// PageDown and PageUp did nothing, and B and . were typed into the note and
// kept in localStorage as an override of the source. Now a single click does
// not focus it at all (the wheel scrolls it without), and the key map's
// text-field guard lets a read-only notes field through. An edit is Shift-N,
// the + note button, or a double-click, which goes on to place the caret and
// pick the word the way a double-click in any text does.
function beginNotesEdit() { notesContent.readOnly = false; }
notesContent.addEventListener('mousedown', (e) => {
  if (!notesContent.readOnly) return;
  if (e.detail >= 2) { beginNotesEdit(); return; }
  e.preventDefault();
});
notesContent.addEventListener('keydown', (e) => {
  if (notesContent.readOnly) return;
  // Esc ends the edit and is spent on that alone.
  if (e.key === 'Escape') {
    notesContent.blur(); e.preventDefault(); e.stopPropagation();
    return;
  }
  // PageDown and PageUp are what a remote sends, and nobody edits a note
  // with them: they end the edit and go on to the key map as a page turn.
  if ((e.key === 'PageDown' || e.key === 'PageUp') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    notesContent.blur();
  }
});
notesContent.addEventListener('blur', () => {
  notesContent.readOnly = true;
  autoSizeNotes();
});

// Shift-N entry point: force-show the notes row and focus the textarea
// even when currently collapsed (body lacks .has-notes). The class
// makes the row visible; focus() lands the caret; user types and the
// input handler keeps has-notes on. If they blur with no content,
// autoSizeNotes collapses again.
function focusNotesPane() {
  if (cueOn()) applyCueMode(false);
  document.body.classList.add('has-notes');
  beginNotesEdit();
  requestAnimationFrame(() => {
    notesContent.focus();
    autoSizeNotes();
  });
}

// Column / chunk-dot bookkeeping: a flat index of which flatChunks entry
// corresponds to each (colIdx, chunkIdx) pair in the scrubber.
const colChunkIdx = {};
flatChunks.forEach((c, i) => {
  if (!colChunkIdx[c.colIdx]) colChunkIdx[c.colIdx] = [];
  colChunkIdx[c.colIdx].push(i);
});

// Scrubber DOM is static after build — cache the node lists once so the
// onActiveChange hook (every keystroke, every remote-state apply) doesn't
// re-scan the document on each tick.
const colEntryEls = Array.from(document.querySelectorAll('.col-entry'));
const dotEls = Array.from(document.querySelectorAll('#psiINT-scrubber .dot'));

function updateScrubber() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  for (const el of colEntryEls) {
    el.classList.toggle('active', parseInt(el.dataset.colIdx, 10) === entry.colIdx);
  }
  for (const dot of dotEls) {
    const ci = parseInt(dot.dataset.colIdx, 10);
    const xi = parseInt(dot.dataset.chunkIdx, 10);
    dot.classList.toggle('active', colChunkIdx[ci]?.[xi] === state.activeIdx);
  }
}

scrubberEl.addEventListener('click', (e) => {
  const dot = e.target.closest('.dot');
  if (dot) {
    const ci = parseInt(dot.dataset.colIdx, 10);
    const xi = parseInt(dot.dataset.chunkIdx, 10);
    const idx = colChunkIdx[ci]?.[xi];
    settleFade();
    if (idx !== undefined) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
    return;
  }
  const btn = e.target.closest('.col-btn');
  if (btn) {
    const ci = parseInt(btn.closest('.col-entry').dataset.colIdx, 10);
    const idx = colChunkIdx[ci]?.[0];
    settleFade();
    if (idx !== undefined) jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
  }
});

// Preview strip: ALL chunks, each cloned and scaled to fit a slot.
// Scrollable along the strip's main axis – drag to pan, click a slot
// to jump. Current chunk highlighted and auto-scrolled into view.
//
// Clone is rendered at the audience reference size (slide-w × slide-h)
// and CSS-scaled into the slot. The scale factor is multiplied by
// PREVIEW_ZOOM so the content fills more of each slot than the raw
// letterbox would; the slot's overflow:hidden clips the small margin
// that overflows, which is an acceptable trade for readable text.
const PREVIEW_ZOOM = 1.22;
function isPreviewVertical() {
  return document.body.classList.contains('preview-right') || document.body.classList.contains('cue-cards');
}
function populatePreviewStrip() {
  previewStrip.replaceChildren();
  flatChunks.forEach((entry, idx) => {
    const slot = document.createElement('div');
    slot.className = 'preview-slot';
    slot.dataset.idx = String(idx);
    if (idx === state.activeIdx) slot.classList.add('current');
    const label = document.createElement('div');
    label.className = 'preview-slot-label';
    const offset = idx - state.activeIdx;
    label.textContent = offset === 0 ? 'now' : (offset > 0 ? '+' + offset : String(offset));
    slot.appendChild(label);
    const clone = entry.el.cloneNode(true);
    clone.classList.add('chunk-clone');
    clone.classList.remove('active', 'expanded', 'annot-visible', 'has-annot', 'overview-selected');
    // A slide may be holding the zoom inline until the catch-up (showZoom);
    // a thumbnail takes the document's, as it always has.
    clone.style.removeProperty('--zoom');
    clone.querySelectorAll('.reveal-segment').forEach(s => s.removeAttribute('data-hidden'));
    clone.querySelectorAll('[data-beat-hidden]').forEach(s => { s.removeAttribute('data-beat-hidden'); s.removeAttribute('data-next'); });
    // Thumbnails show slides fully revealed (PRD §4.6) so the speaker can
    // see where each one lands. A cloned diagram carries whatever step the
    // live one is on, because the runtime writes geometry onto attributes -
    // so the clone has to be walked forward to its last frame by hand.
    const liveDiagrams = entry.el.querySelectorAll('svg.psi-diagram');
    clone.querySelectorAll('svg.psi-diagram').forEach((svg, i) => {
      const d = liveDiagrams[i] && liveDiagrams[i].psiDiagram;
      if (d) dgRenderInto(svg, d, d.data.n - 1);
    });
    clone.querySelectorAll('.exps, .annot-box, .annot-add').forEach(n => n.remove());
    // Media never travels into a thumbnail. A cloned iframe carries the src
    // updateEmbedLoading just set, which would open a *second* live player
    // at the provider - defeating the whole "nothing loads until its chunk
    // is reached" guarantee, and doing it on every strip rebuild. A cloned
    // <video> would duplicate its data: URI into every slot.
    clone.querySelectorAll('.figure-embed iframe').forEach(n => {
      n.removeAttribute('src'); n.removeAttribute('data-src');
    });
    clone.querySelectorAll('.figure-video video').forEach(n => {
      n.removeAttribute('src'); n.removeAttribute('controls');
    });
    slot.appendChild(clone);
    previewStrip.appendChild(slot);
    requestAnimationFrame(() => {
      const slideW = viewport.clientWidth || window.innerWidth;
      if (!slideW) return;
      const baseScale = slot.clientWidth / slideW;
      const scale = baseScale * PREVIEW_ZOOM;
      clone.style.transform = `scale(${scale})`;
      clone.style.width = slideW + 'px';
      clone.style.height = (slot.clientHeight / baseScale) + 'px';
    });
  });
  cuePlaceStage();
  scrollPreviewToActive(false);
}

function scrollPreviewToActive(smooth) {
  // In cue-card mode the mirror stands in for the current thumbnail, so it
  // is what has to end up in the middle of the strip.
  const el = cueOn() ? stageCell : previewStrip.querySelector('.preview-slot.current');
  if (!el) return;
  // Center the current slot along the strip's main axis.
  const stripRect = previewStrip.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const behavior = smooth ? 'smooth' : 'auto';
  if (isPreviewVertical()) {
    const top = previewStrip.scrollTop + (elRect.top + elRect.height / 2) - (stripRect.top + stripRect.height / 2);
    previewStrip.scrollTo({ top, behavior });
  } else {
    const left = previewStrip.scrollLeft + (elRect.left + elRect.width / 2) - (stripRect.left + stripRect.width / 2);
    previewStrip.scrollTo({ left, behavior });
  }
}

// Light-touch "current" marker update without rebuilding the whole strip.
let previewScrollFrame = 0;
function markPreviewCurrent() {
  previewStrip.querySelectorAll('.preview-slot').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    el.classList.toggle('current', idx === state.activeIdx);
    const lbl = el.querySelector('.preview-slot-label');
    if (lbl) {
      const off = idx - state.activeIdx;
      lbl.textContent = off === 0 ? 'now' : (off > 0 ? '+' + off : String(off));
    }
  });
  cuePlaceStage();
  // A frame later rather than inside the press: the two rects it reads were
  // one forced layout of a document that holds every slide twice, and the
  // scroll is a smooth one, so a frame's delay is not seen.
  if (!previewScrollFrame) previewScrollFrame = requestAnimationFrame(() => {
    previewScrollFrame = 0;
    scrollPreviewToActive(true);
  });
}

// Pointer drag to pan. Tracks whether the pointer actually moved enough
// to constitute a drag (vs a click); click-to-jump wins if no drag.
// The slot is saved at pointerdown because pointer capture reroutes
// pointerup's e.target to the capturing element (previewStrip), so
// e.target.closest('.preview-slot') returns null at release time.
let previewDrag = null;
previewStrip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const slot = e.target.closest('.preview-slot');
  const vert = isPreviewVertical();
  previewDrag = {
    vert,
    start: vert ? e.clientY : e.clientX,
    scrollStart: vert ? previewStrip.scrollTop : previewStrip.scrollLeft,
    moved: false,
    pointerId: e.pointerId,
    slot,
  };
  previewStrip.setPointerCapture(e.pointerId);
});
previewStrip.addEventListener('pointermove', (e) => {
  if (!previewDrag) return;
  const cur = previewDrag.vert ? e.clientY : e.clientX;
  const d = cur - previewDrag.start;
  if (Math.abs(d) > 4) previewDrag.moved = true;
  if (previewDrag.vert) previewStrip.scrollTop = previewDrag.scrollStart - d;
  else previewStrip.scrollLeft = previewDrag.scrollStart - d;
  if (previewDrag.moved) previewStrip.classList.add('dragging');
});
previewStrip.addEventListener('pointerup', (e) => {
  if (!previewDrag) return;
  const { moved, slot } = previewDrag;
  try { previewStrip.releasePointerCapture(previewDrag.pointerId); } catch (err) {}
  previewDrag = null;
  previewStrip.classList.remove('dragging');
  if (moved || !slot) return;
  const idx = parseInt(slot.dataset.idx, 10);
  settleFade();
  if (!Number.isFinite(idx) || idx === state.activeIdx) return;
  jumpTo(idx, idx > state.activeIdx ? 'forward' : 'back');
});
previewStrip.addEventListener('pointercancel', () => {
  previewDrag = null;
  previewStrip.classList.remove('dragging');
});

// Vertical wheel maps to horizontal scroll when the strip runs
// horizontally; in vertical-strip mode the browser's native vertical
// scroll is already what we want.
previewStrip.addEventListener('wheel', (e) => {
  if (isPreviewVertical()) return;
  if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  previewStrip.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

// The clock: elapsed since the talk began, which is the first forward or back
// press, or since the last click on it. Until that press it stands at 0:00,
// dimmed: a lecturer opens the deck early, often with a figure cycling on the
// title slide while the room fills, and the talk begins when they first touch
// the deck - the moment a presentation program starts its own clock. A back
// press counts too, so the clock can be started on the title slide without
// leaving it; a press a cue card consumes counts, and so does one in the
// projection (a clicker focused on the other window), which says so with a
// press message of its own. A jump does not - the preview strip, the overview,
// go-to, search - nor an autoplay figure stepping by itself, nor a press in a
// frozen cockpit, which is the lecturer looking ahead rather than the talk.
// A click is the whole control - no pause, because a paused clock is one
// stray click away from a drift that is wrong for the rest of the talk, and a
// restart is the case that actually happens: the first press came early.
//
// "Not started yet" is tStart = Infinity, which every reader already floors
// at zero and the waiting class already reads as a clock that holds.
//
// Three more things move it without restarting it, and all of them go
// through clockSet, as the first press does. A minute back and a minute
// forward (the two small buttons, < and >): a talk that began late has lost
// those minutes against its @mm:ss marks, and the speaker who wants to see
// them puts them on the clock. And, where the deck names its planned start
// (start: "14:20"), the time since then (the button that says so, Z): at
// 14:25 the clock reads 5:00 and runs on. Before the planned start it holds
// at 0:00 and starts by itself when the time comes - one rule, the clock is
// the time since the planned start and never less than zero - which is why
// tStart may lie in the future and every reader floors at zero. Only a clock
// nobody has set is started by a press: one holding for its planned start
// keeps holding. Nothing but a press sets it: a rehearsal at another hour
// must find it at 0:00, as it always did.
//
// What a press or a gesture set survives a reload of this window
// (sessionStorage, this deck's key, twelve hours at most) and nothing else
// does: a cockpit opened afresh waits at 0:00, and one navigated here from
// elsewhere too - and so does a reload of one that had not started.
let tStart = Infinity;
const CLOCK_KEY = storageKey('clock');
const CLOCK_KEEP_MS = 12 * 3600 * 1000;
const clockBox = document.getElementById('psiINT-clock-box');
const clockPlanBtn = document.getElementById('psiINT-clock-plan');
try {
  const nav = performance.getEntriesByType('navigation')[0];
  const kept = Number(sessionStorage.getItem(CLOCK_KEY));
  if (nav && nav.type === 'reload' && isFinite(kept) && kept > 0
      && Math.abs(Date.now() - kept) < CLOCK_KEEP_MS) tStart = kept;
  else sessionStorage.removeItem(CLOCK_KEY);
} catch (e) { /* a private window is allowed to refuse */ }
// The clock unrounded, in seconds, and never below zero.
function clockSeconds() { return Math.max(0, (Date.now() - tStart) / 1000); }
function elapsedSeconds() { return Math.floor(clockSeconds()); }
function renderTimer() {
  timerEl.textContent = PSI_CARDS.formatClock(elapsedSeconds());
  clockBox.classList.toggle('waiting', tStart > Date.now());
}
setInterval(renderTimer, 1000);
renderTimer();
// Called with (how, delta) after every press or gesture that set the clock:
// 'start' (the first press), 'restart', 'step' or 'plan', and the seconds the
// reading moved by, forward positive. The prompter listens, because it stamps
// things on this clock.
const clockListeners = [];
function clockSet(origin, how, say) {
  const before = clockSeconds();
  tStart = origin;
  const delta = clockSeconds() - before;
  try { sessionStorage.setItem(CLOCK_KEY, String(tStart)); } catch (e) { /* private window */ }
  renderTimer();
  renderDrift();
  for (const fn of clockListeners) fn(how, delta);
  flashCenter(say);
}
// The first press of the talk, from this window (viewHooks.onPress, at the
// head of goForward and goBack, before a cue card can consume it) or from the
// projection's (a press message). A clock already set - started, restarted,
// stepped or holding for its planned start - is left alone.
function clockAutoStart() {
  if (tStart !== Infinity) return;
  clockSet(Date.now(), 'start', 'clock started');
}
viewHooks.onPress = (remote) => { if (remote || !frozen) clockAutoStart(); };
// One minute, in either direction, and not below 0:00. A step from a clock
// that is holding for its planned start lets go of the plan: the speaker has
// said what the clock should read.
function clockStep(dir) {
  const now = clockSeconds();
  if (dir < 0 && now < 1) { flashCenter('the clock is at 0:00'); return; }
  const next = Math.max(0, now + dir * 60);
  clockSet(Date.now() - next * 1000, 'step',
    'clock ' + PSI_CARDS.formatClock(Math.floor(next)) + ' · ' + (dir > 0 ? '+' : '−') + '1 min');
}
// The moment the talk was planned to begin, as this window's own clock knows
// the day: the last time it was that time of day if that is less than twelve
// hours ago, and the next time otherwise. So a quarter past midnight is forty
// minutes into a talk planned for 23:35, and a rehearsal at nine in the
// morning finds a 14:20 talk still ahead.
function clockPlanOrigin(minutes, now) {
  const d = new Date(now);
  const at = (day) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + day,
    Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
  const past = at(0) <= now ? at(0) : at(-1);
  if (now - past < CLOCK_KEEP_MS) return past;
  return at(0) > now ? at(0) : at(1);
}
function clockToPlan() {
  const minutes = clockPlanBtn ? Number(clockPlanBtn.dataset.start) : NaN;
  if (!isFinite(minutes)) {
    flashCenter('no planned start – start: "14:20" in the frontmatter', { duration: 3200 });
    return;
  }
  const hhmm = Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
  const origin = clockPlanOrigin(minutes, Date.now());
  const ahead = origin > Date.now();
  clockSet(origin, 'plan', ahead
    ? 'clock holds at 0:00 until ' + hhmm
    : 'clock ' + PSI_CARDS.formatClock(Math.floor((Date.now() - origin) / 1000)) + ' · since ' + hhmm);
}
document.getElementById('psiINT-clock').addEventListener('click', () => {
  clockSet(Date.now(), 'restart', 'clock restarted');
});
document.getElementById('psiINT-clock-back').addEventListener('click', () => clockStep(-1));
document.getElementById('psiINT-clock-fwd').addEventListener('click', () => clockStep(1));
if (clockPlanBtn) clockPlanBtn.addEventListener('click', clockToPlan);
COMMAND_RUN['clock-back'] = (e) => { clockStep(-1); e.preventDefault(); };
COMMAND_RUN['clock-forward'] = (e) => { clockStep(1); e.preventDefault(); };
COMMAND_RUN['clock-plan'] = (e) => { clockToPlan(); e.preventDefault(); };

// Hook: refresh scrubber on every state change, notes+preview on chunk
// change only. The full-strip rebuild (populatePreviewStrip) happens
// once at load and on resize; subsequent chunk changes just re-mark
// the current slot and scroll it into view.
let lastPopulatedIdx = -1;
viewHooks.onActiveChange = () => {
  updateScrubber();
  cueSync();
  if (state.activeIdx === lastPopulatedIdx) return;
  lastPopulatedIdx = state.activeIdx;
  populateNotesPane();
  markPreviewCurrent();
};
viewHooks.onStateChange = () => { cueSync(); };

// The prompter's cards for slides that have not come up yet, chunk id to a
// list of {cueId, text}. This and the merge in cueCardsFor are the two pieces
// of the prompter that a cockpit carries whether or not it has one: the rail
// is drawn from here, and drawing it cannot be conditional on a literal that
// may not have been spliced. Over an empty Map both are free. Declared up
// here rather than beside them because the cue section restores the saved
// arrangement at its end, which draws the rail - and a let still in its
// temporal dead zone throws there, inside the try that guards localStorage,
// which swallows it whole.
const souffleuseCues = new Map();

// ── cue cards ───────────────────────────────────────────────────────
// The notes of the active chunk as cards in a column, the projection small
// in the corner (speaker.md §4.1, docs/history/PLAN-cue-cards.md). Everything here is
// local to this window. The one piece of state is the cursor - which card
// of the current beat is being said - and it sits in FRONT of the reveal
// counter: goForward asks consumeForward first, and the press reaches
// advanceReveal and the room from the last card of the beat.
// revealed[chunkId] stays the only thing the two windows share.
const CUE_MODE_KEY = 'psi-slides:cue-cards';
const CUE_SCALE_KEY = 'psi-slides:cue-scale';
// The cockpit's own ids carry the psiINT- prefix, so no chunk id - the
// chunks are in this document too, inside the mirror - can answer for one.
// The pieces of the panel are still looked up through the panel.
const cueRoot = document.querySelector('body > #psiINT-cue-panel');
const cueRail = cueRoot.querySelector('#psiINT-cue-rail');
const cueCrumb = cueRoot.querySelector('#psiINT-cue-crumb');
const cuePos = cueRoot.querySelector('#psiINT-cue-pos');
const cueBtn = document.getElementById('psiINT-cue-btn');
const clockEl = document.getElementById('psiINT-clock');
// Where the stage sits in the classic arrangement, so the cue-card mode can
// put it back: it moves into the preview strip while the cards are up.
const stageHome = stageCell.nextElementSibling;
// { id, beat, card } - the chunk, the number of advances it has taken,
// and how many of that beat's cards have been said.
let cue = { id: null, beat: -1, card: 0 };
let cueLast = { idx: -1, pos: 0 };
// The two time marks the clock is measured against: 'cur' is the mark of the
// current card or of the last card before it that carried one, 'next' the
// first one still to come. Both are kept, because behind is measured against
// the mark the talk is heading for and ahead against the one it has passed.
// null when the deck carries no mark at all.
let cueDriftMarks = null;
// Whether the drift's own bindings below exist yet. The classic cockpit has
// no cueRender to set the marks, so cueSync sets them itself - and a hook
// that fired before driftEl was declared would run into its dead zone.
let cueDriftReady = false;

function cueOn() { return document.body.classList.contains('cue-cards'); }
// The mirror goes where the current thumbnail would have been, and CSS hides
// that thumbnail - so the left column is one film strip with the real
// projection in the middle of it, rather than two copies of one slide only
// one of which is laid out the way the room sees it. populatePreviewStrip
// replaces every child of the strip, so this runs after it and after every
// re-mark.
function cuePlaceStage() {
  if (!cueOn()) return;
  const cur = previewStrip.querySelector('.preview-slot.current');
  if (cur) previewStrip.insertBefore(stageCell, cur);
  else previewStrip.appendChild(stageCell);
}
function applyCueMode(on) {
  document.body.classList.toggle('cue-cards', on);
  cueBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  // The clock is one element in two places: over the stage's letterbox in
  // the classic arrangement, in the column's header here.
  if (on) cueRoot.querySelector('#psiINT-cue-where').appendChild(clockBox);
  else stageCell.appendChild(clockBox);
  if (!on) document.body.insertBefore(stageCell, stageHome);
  populatePreviewStrip();
  if (on) cueSync();
}
function toggleCueMode() {
  const on = !cueOn();
  applyCueMode(on);
  try { localStorage.setItem(CUE_MODE_KEY, on ? 'on' : 'off'); } catch (e) {}
  flashMode(on ? 'cue cards · Space says the next card, then clicks the projector' : 'classic cockpit');
}
// Card size, per user and across lectures like the notes-pane zoom and the
// strip orientation: how far the laptop stands from the lectern is a
// property of the room, not of the deck.
function applyCueScale(v) {
  document.documentElement.style.setProperty('--cue-scale', String(v));
  try { localStorage.setItem(CUE_SCALE_KEY, String(v)); } catch (e) {}
}
function cueScale() {
  const v = Number(document.documentElement.style.getPropertyValue('--cue-scale'));
  return v > 0 ? v : 1;
}
function nudgeCueScale(d) {
  applyCueScale(Math.min(1.8, Math.max(0.7, Math.round((cueScale() + d) * 20) / 20)));
}
cueRoot.querySelector('#psiINT-cue-zoom-in').addEventListener('click', () => nudgeCueScale(0.1));
cueRoot.querySelector('#psiINT-cue-zoom-out').addEventListener('click', () => nudgeCueScale(-0.1));
try {
  const saved = Number(localStorage.getItem(CUE_SCALE_KEY));
  if (saved > 0) applyCueScale(saved);
} catch (e) {}
COMMAND_RUN['cue-cards'] = (e) => {
  if (overview) return;
  toggleCueMode();
  e.preventDefault();
};
cueBtn.addEventListener('click', toggleCueMode);
// The saved mode is restored at the FOOT of this section, not here. Two of
// the bindings cueRender reaches - cueMarks and driftEl - are declared
// further down, so a restore at this point ran into their temporal dead
// zone, and the try that guards localStorage swallowed the ReferenceError
// whole: the cockpit came up in cue-card mode with an empty rail, and the
// first arrow key filled it. Reading localStorage is what needs the try;
// applying the mode does not, and wrapping both hid a defect for a release.

// The cards of a chunk, keyed by the number of advances after which they are
// said - the same number an overlay's from N counts, and the same one
// applyReveal calls consumed. 0 is the slide as it opens.
//
// A note pins itself with a note-from line and is filed under exactly that.
// Otherwise the parser gave it a top-level segment, and the segment's own
// beat says which advance brings it up - which is what lets a chunk whose
// beats are a diagram's steps carry cards at all: no separator line can sit
// between two steps, but a number can name one. Inside a block, a
// [Klick ...] line is a press of its own and the cards behind it are filed
// one advance later - the two spellings compose, so a pinned block counts
// its clicks from its own number. A rehearsal override in the textarea
// replaces the whole chunk's text and knows of no pin, so it starts at the
// opening beat - its clicks still count from there.
function cueCardsFor(id, beats, maxC) {
  const by = new Map();
  const segAt = [0];
  // at ?? pos + 1: a pinned segment has no positional index, and pos + 1 on
  // undefined is NaN - which is not nullish, so the ?? below did not catch
  // it and the cards went into the Map under a key nothing reads back.
  beats.forEach(b => { if (b.type === 'seg') segAt.push(b.at ?? b.pos + 1); });
  const put = (c, cards) => {
    const k = Math.max(0, Math.min(maxC, c));
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(...cards);
  };
  // Where the block sits is where its FIRST card sits; a [Klick ...] line
  // inside it moves every card behind that line one advance further on, and
  // notesToCards counted them. The clamp in put() is what an author gets who
  // wrote more clicks than the slide has beats: the surplus cards stand
  // together on the last one, and lint says so by name.
  const file = (base, cards) => cards.forEach(card => put(base + (card.advance || 0), [card]));
  let override = null;
  try { override = localStorage.getItem(noteOverrideKey(id)); } catch (e) {}
  if (override !== null) {
    file(0, PSI_CARDS.notesToCards(override));
  } else {
    document.querySelectorAll('template[data-cards-for="' + CSS.escape(id) + '"]').forEach(t => {
      const c = t.dataset.at != null ? Number(t.dataset.at)
        : (segAt[Number(t.dataset.seg) || 0] ?? 0);
      file(c, PSI_CARDS.notesToCards(t.content.textContent));
    });
  }
  // Whatever the prompter laid into this slide, last and on the opening
  // beat: it was sent while an earlier slide was up and it is about the
  // whole of this one, so there is no beat it could honestly claim. It
  // survives the rehearsal override for the same reason - the override
  // replaces what the author wrote, and this is not that.
  (souffleuseCues.get(id) || []).forEach(c => file(0, [{
    title: null, at: null, bullets: [c.text], prose: null, souffleuse: true,
  }]));
  return by;
}
// Where the counter stands. pos is what revealed[] holds (1 = nothing
// advanced); consumed is pos - 1, the number of presses this slide has
// taken, which is what every beat and every card is filed under.
function cuePosition(entry) {
  const total = countSegments(entry.el);
  const pos = Math.max(1, revealed[entry.id] ?? 1);
  // Every beat, pinned or not. The filter that used to stand here dropped
  // anything carrying an at-number, written when only a marker inside a
  // pinned overlay could carry one and the cue list had nothing to say about
  // those. A pinned segment carries text, so dropping it shifted segAt for
  // every segment after it and left the last one falling off the end - the
  // cards for those segments were filed on beat 0 and shown as the slide
  // opened. cueEntries decides per type what it can name; that is the place
  // for the question, not here.
  const beats = chunkBeats(entry.el);
  return { pos, consumed: pos - 1, total, maxC: Math.max(0, total - 1), beats };
}
function cueText(node, max) {
  const t = (node ? node.textContent : '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
function cueChunkTitle(entry) {
  const h = entry.el.querySelector('.chunk-heading');
  if (h) return cueText(h, 80);
  // A column's divider carries no chunk heading - what names it is the
  // column, which is also what the room is about to read on it.
  if (entry.el.dataset.tag === 'section') return cueColumnTitle(entry) || 'the next part';
  const p = entry.el.querySelector('.reveal-segment p, .chunk-content p, p');
  return cueText(p, 60) || ('slide ' + (flatChunks.indexOf(entry) + 1));
}
function cueColumnTitle(entry) {
  const btn = document.querySelector('.col-entry[data-col-idx="' + entry.colIdx + '"] .col-btn');
  const t = btn ? btn.textContent.trim() : '';
  return t === '·' ? '' : t;
}
// The column as one list: for every advance this slide takes, the cards said
// on it and then the press that leaves it - a reveal, a diagram step, a
// nested beat - and at the end the next slide. That is the order the room
// experiences, so it is the order to read down.
function cueEntries(entry) {
  const { consumed, pos, total, maxC, beats } = cuePosition(entry);
  const cards = cueCardsFor(entry.id, beats, maxC);
  const segTotal = beats.filter(b => b.type === 'seg').length;
  const out = [];
  let segN = 0;
  for (let c = 0; c <= maxC; c++) {
    (cards.get(c) || []).forEach((card, k) => out.push({ type: 'card', c, k, card }));
    // c is a 0-based index and an entry says it arrives on press c + 1, so
    // an unpinned beat matches its own pos while a pinned one - which arrives
    // when consumed reaches its number - matches that number minus one.
    // cueCardsFor files the same beats one scale up; the two must not be as
    // the same number.
    const b = beats.find(x => (x.at != null ? x.at - 1 : x.pos) === c);
    if (b && b.type === 'seg') {
      out.push({ type: 'step', at: c + 1, k: 'reveal ' + (++segN) + '/' + segTotal, what: cueText(b.el, 120) });
    } else if (b && b.type === 'diag') {
      // The author's own name for the beat if the step carries one - it
      // says what the picture is about to do, which "step 2" does not.
      const nm = (b.d.data.names || [])[b.step - 1] || '';
      out.push({ type: 'step', at: c + 1, k: 'figure · step ' + b.step, what: nm });
    } else if (b) {
      out.push({ type: 'step', at: c + 1, k: 'beat', what: cueText(b.els[0], 120) });
    } else if (c < maxC) {
      // An advance the beat list does not carry: an overlay held by from,
      // a backdrop frame. It is still a press.
      out.push({ type: 'step', at: c + 1, k: 'advance', what: '' });
    }
  }
  const nxt = flatChunks[state.activeIdx + 1];
  const nxtK = !nxt ? 'end'
    : nxt.el.dataset.tag === 'section' ? 'next part'
    : 'slide ' + (state.activeIdx + 2);
  out.push({ type: 'chunk', k: nxtK, what: nxt ? cueChunkTitle(nxt) : 'the last slide' });
  // said or not, and the first that is not is the cursor
  let cur = -1;
  out.forEach((e, i) => {
    e.done = e.type === 'card' ? (e.c < consumed || (e.c === consumed && e.k < cue.card))
           : e.type === 'step' ? e.at <= consumed : false;
    if (!e.done && cur < 0) cur = i;
  });
  return { out, cur, pos, total, consumed, cards };
}
// Keep the cursor on the chunk and beat the counter is in. Arriving at a
// new beat going forward makes its first card the one being said; arriving
// going back makes its last card that one - the card the press that left
// it was spent on, so each press back undoes exactly one press forward.
// A beat with no cards has card 0 either way, and the cursor is then the
// press that leaves it.
function cueBind(entry) {
  const { consumed, pos, maxC, beats } = cuePosition(entry);
  if (cue.id !== entry.id || cue.beat !== consumed) {
    const back = state.activeIdx < cueLast.idx || (state.activeIdx === cueLast.idx && pos < cueLast.pos);
    const n = (cueCardsFor(entry.id, beats, maxC).get(consumed) || []).length;
    cue = { id: entry.id, beat: consumed, card: back ? Math.max(0, n - 1) : 0 };
  }
  cueLast = { idx: state.activeIdx, pos };
}
// Called from onActiveChange and onStateChange, so the cursor follows a jump,
// a TOC pick, a remote apply - anything that moves the deck. The two consume
// hooks bind too: at boot nothing has moved yet, so a first Space would
// otherwise count against a cursor belonging to no chunk.
function cueSync() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  cueBind(entry);
  if (cueOn()) cueRender();
  else if (cueDriftReady) {
    // The clock stands over the stage here and the drift beside it: the
    // question "am I late" is not one only a speaker reading cards asks.
    cueDriftMarks = cueDriftRefs(cuePosition(entry).consumed);
    renderDrift();
  }
}
viewHooks.consumeForward = () => {
  if (!cueOn() || overview) return false;
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  cueBind(entry);
  // A press is spent on the cursor only while another card of the same
  // beat stands behind it. On the last card of a beat the press goes
  // straight through to the counter: the reveal, the figure step or the
  // next slide happens, and its first card becomes the one being said. A
  // press that moved the cursor onto the entry for the click, and a second
  // one that clicked, was a press on which the room saw nothing.
  const { out, cur } = cueEntries(entry);
  const here = out[cur], after = out[cur + 1];
  if (!here || here.type !== 'card' || !after || after.type !== 'card' || after.c !== here.c) return false;
  cue.card += 1;
  cueRender();
  return true;
};
viewHooks.consumeBack = () => {
  if (!cueOn() || overview) return false;
  const entry = flatChunks[state.activeIdx];
  if (!entry) return false;
  cueBind(entry);
  // The mirror image: back to the card before, while there is one on this
  // beat; on the first card the press goes through, the counter steps back,
  // and cueBind lands on that beat's last card.
  const { consumed, cards } = cueEntries(entry);
  const k = Math.min(cue.card, (cards.get(consumed) || []).length - 1);
  if (k <= 0) return false;
  cue.card = k - 1;
  cueRender();
  return true;
};
// Enter: the cards of this slide are said, whatever is left of them, and
// the next slide comes up. The reveals it had left stay where they are.
viewHooks.onEnter = () => {
  if (!cueOn() || overview) return false;
  nextChunk();
  return true;
};

// Every time mark in the deck, in the order the talk reaches them. The
// drift used to be read off the active slide alone, so it appeared at the
// first mark and vanished again on every slide that carried none - a
// number that comes and goes reads as a fault, and the question it
// answers ("am I late") does not stop being asked on an unmarked slide.
// Built once and kept; a rehearsal override in the textarea drops it.
let cueMarks = null;
function cueMarkList() {
  if (cueMarks) return cueMarks;
  cueMarks = [];
  flatChunks.forEach((entry, idx) => {
    const { maxC, beats } = cuePosition(entry);
    cueCardsFor(entry.id, beats, maxC).forEach((list, c) => list.forEach((card, k) => {
      if (card.at != null) cueMarks.push({ idx, c, k, at: card.at });
    }));
  });
  cueMarks.sort((a, b) => a.idx - b.idx || a.c - b.c || a.k - b.k);
  return cueMarks;
}
// The marks the clock is measured against: the last one at or before the
// cursor, and the first one still ahead of it. The marks are in talk order,
// so everything reached is a prefix of the list and the first mark that is
// not reached is the one the talk is heading for. 'cur' is null until the
// first mark has been passed, 'next' once the last one has been.
// Null only when the deck carries no mark at all.
function cueDriftRefs(consumed) {
  const marks = cueMarkList();
  if (!marks.length) return null;
  let cur = null;
  let next = null;
  for (const m of marks) {
    const reached = m.idx < state.activeIdx
      || (m.idx === state.activeIdx && (m.c < consumed || (m.c === consumed && m.k <= cue.card)));
    if (reached) cur = m;
    else { next = m; break; }
  }
  return { cur: cur ? cur.at : null, next: next ? next.at : null };
}
// How far the talk is from its plan, in seconds, positive being behind.
// Behind is measured against the *next* mark and ahead against the current
// one, and between the two the talk is on budget and the drift is zero:
// drift = max(elapsed - next, min(elapsed - cur, 0)). A cover card marked
// @0:00 whose successor is marked @2:30 used to read "+2:16 behind" after
// 2:16 of speaking, because the reference was the mark already passed - the
// number climbed with the dwell time on every slide and only snapped to the
// truth on reaching the next marked one, which in a real talk read as a
// clock that had not been reset. The @mm:ss marks say when a passage should
// be *done*, so a speaker still short of the coming one is not late.
// Past the last mark there is nothing left to head for and the current mark
// is the reference again; before the first, that first mark is what the talk
// is heading for, so a talk that has not got to its 5:00 card yet is ahead
// by whatever is left of the five minutes.
function cueDriftValue() {
  if (!cueDriftMarks) return null;
  const e = elapsedSeconds();
  const cur = cueDriftMarks.cur;
  const next = cueDriftMarks.next;
  if (cur == null) return next == null ? null : e - next;
  if (next == null) return e - cur;
  return Math.max(e - next, Math.min(e - cur, 0));
}
// Beside the clock: how far the talk is from its plan. Behind is
// the number that matters and is red; ahead is grey; on the mark it is
// a signed zero rather than nothing, because a blank where a number
// belongs is read as a broken clock, not as good timekeeping. A minute
// is not worth a number, so the display is coarse to the ten seconds.
const driftEl = document.getElementById('psiINT-drift');
function renderDrift() {
  const d = cueDriftValue();
  if (d == null) { driftEl.hidden = true; return; }
  const shown = Math.round(d / 10) * 10;
  driftEl.hidden = false;
  driftEl.textContent = (shown > 0 ? '+' : shown < 0 ? '−' : '±') + PSI_CARDS.formatClock(Math.abs(shown));
  driftEl.classList.toggle('ahead', shown <= 0);
  // The tooltip names the mark the number is actually about, which under this
  // model is not always the same one: behind is against the mark ahead, ahead
  // against the mark behind, and on budget is against the pair.
  const cur = cueDriftMarks.cur;
  const next = cueDriftMarks.next;
  const clockOf = (v) => '@' + PSI_CARDS.formatClock(v);
  driftEl.title = cur == null
    ? 'against the ' + clockOf(next) + ' mark, not reached yet'
    : next == null
      ? 'against the ' + clockOf(cur) + ' mark, the last one'
      : shown > 0
        ? 'against the ' + clockOf(next) + ' mark, already past it'
        : shown < 0
          ? 'against the ' + clockOf(cur) + ' mark, still ahead of it'
          : 'on budget between the ' + clockOf(cur) + ' and ' + clockOf(next) + ' marks';
}
// Its own tick rather than a call from renderTimer: the clock starts
// earlier in this script than the cards exist.
setInterval(renderDrift, 1000);
function cueRender() {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const { out, cur, pos, total, consumed, cards } = cueEntries(entry);
  const col = cueColumnTitle(entry);
  cueCrumb.innerHTML = (col ? '<span class="cue-col">' + escText(col) + '</span>' : '') + escText(cueChunkTitle(entry));
  const here = cards.get(consumed) || [];
  cuePos.innerHTML = 'slide <b>' + (state.activeIdx + 1) + '</b>/' + flatChunks.length
    + (total > 1 ? ' · beat <b>' + pos + '</b>/' + total : '')
    + (here.length ? ' · card <b>' + Math.min(cue.card + 1, here.length) + '</b>/' + here.length : '');
  const hasCards = [...cards.values()].some(a => a.length);
  cueDriftMarks = cueDriftRefs(consumed);
  renderDrift();
  const html = [];
  out.forEach((e, i) => {
    // next is the entry the coming press brings up, which on the last card
    // of a beat is the click itself
    const cls = e.done ? 'done' : i === cur ? 'cur' : i === cur + 1 ? 'next' : 'later';
    const titled = e.type === 'card' && e.card.title ? ' titled' : '';
    const souff = e.type === 'card' && e.card.souffleuse ? ' souffleuse' : '';
    const tick = '<div class="cue-tick ' + (e.type === 'card' ? '' : 'step ') + cls + titled + souff + '"><i></i></div>';
    if (e.type === 'card') {
      const c = e.card;
      // A card the prompter laid, said in words and not only in a line style.
      let body = c.souffleuse ? '<p class="cue-added">added while you spoke</p>' : '';
      body += c.title ? '<p class="cue-title">' + escText(c.title) + '</p>' : '';
      if (c.at != null) body += '<span class="cue-at">@ ' + PSI_CARDS.formatClock(c.at) + '</span>';
      // A stage direction rides the card it belongs with, before its words
      // or after them, and is set as a direction rather than as words to say.
      const stage = (list) => (list || []).map(d => '<p class="cue-stage">' + escText(d) + '</p>').join('');
      body += stage(c.lead);
      body += c.bullets.length
        ? '<ul>' + c.bullets.map(b => '<li>' + escText(b) + '</li>').join('') + '</ul>'
        : '<p class="' + (c.stage ? 'cue-stage' : 'cue-prose') + '">' + escText(c.prose) + '</p>';
      body += stage(c.tail);
      html.push(tick + '<div class="cue-entry ' + cls + '"><div class="cue-card' + souff + '">' + body + '</div></div>');
    } else {
      html.push(tick + '<div class="cue-entry ' + cls + '"><div class="cue-step"><span class="cue-k">' + escText(e.k) + '</span>'
        + (e.what ? '<span class="cue-what">' + escText(e.what) + '</span>' : '') + '</div></div>');
    }
  });
  if (!hasCards) {
    html.unshift('<p class="cue-empty">No notes on this slide. Write <kbd>&gt; note:</kbd> blocks in the source, one paragraph a card, the bold phrases its bullets.</p>');
  }
  cueRail.innerHTML = html.join('');
  // the cursor sits a third of the way down, so what comes has room
  const curEl = cueRail.querySelector('.cue-entry.cur');
  if (curEl) {
    const top = curEl.offsetTop - cueRail.clientHeight * 0.28;
    cueRail.scrollTo({ top: Math.max(0, top) });
  }
}
// Restore the saved arrangement, now that every binding cueRender reaches
// exists. The read is guarded, the apply is not - see the note beside
// toggleCueMode.
let cueModeSaved = null;
try { cueModeSaved = localStorage.getItem(CUE_MODE_KEY); } catch (e) {}
if (cueModeSaved === 'on') applyCueMode(true);
cueDriftReady = true;
cueSync();

// Preview orientation (horizontal along bottom vs vertical along the
// right edge). Persisted globally – user preference follows them
// across lectures. Toggled with V.
const PREVIEW_ORIENTATION_KEY = 'psi-slides:preview-orientation';
function applyPreviewOrientation(mode) {
  document.body.classList.toggle('preview-right', mode === 'right');
}
try {
  const saved = localStorage.getItem(PREVIEW_ORIENTATION_KEY);
  if (saved === 'right') applyPreviewOrientation('right');
} catch (e) {}
function togglePreviewOrientation() {
  const next = document.body.classList.contains('preview-right') ? 'bottom' : 'right';
  applyPreviewOrientation(next);
  try { localStorage.setItem(PREVIEW_ORIENTATION_KEY, next); } catch (e) {}
  flashMode('viewer layout · preview ' + (next === 'right' ? 'down the right edge' : 'along the bottom'));
  populatePreviewStrip();
}
document.getElementById('psiINT-preview-orient-btn')?.addEventListener('click', togglePreviewOrientation);

// The in-stage "+ note" overlay is an alternative entry point to
// Shift-N. Visible only while the notes pane is collapsed; the CSS
// hides it once has-notes lands on body.
document.getElementById('psiINT-add-note-btn')?.addEventListener('click', () => {
  focusNotesPane();
});

// Drag-to-resize for the notes pane. Setting --notes-height + the
// notes-sized class swaps the grid's auto row for a fixed pixel row;
// the 1fr stage row shrinks correspondingly and stageCell's
// ResizeObserver re-runs sizeStageViewport(), so the audience preview
// rescales ratio-proportional. Persisted per-user; double-click resets.
const notesResizer = document.getElementById('psiINT-notes-resizer');
const NOTES_HEIGHT_KEY = 'psi-slides:notes-height';
const NOTES_MIN_PX = 60;
const STAGE_MIN_PX = 140;

function applyNotesHeight(px) {
  document.documentElement.style.setProperty('--notes-height', px + 'px');
  document.body.classList.add('notes-sized');
  document.body.classList.add('has-notes');
  autoSizeNotes();
}
function clearNotesHeight() {
  document.documentElement.style.removeProperty('--notes-height');
  document.body.classList.remove('notes-sized');
  autoSizeNotes();
}
try {
  const saved = parseFloat(localStorage.getItem(NOTES_HEIGHT_KEY));
  if (saved && saved >= NOTES_MIN_PX) applyNotesHeight(saved);
} catch (e) {}

let notesDrag = null;
notesResizer?.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { notesResizer.setPointerCapture(ev.pointerId); } catch (e) {}
  notesDrag = {
    pointerId: ev.pointerId,
    startY: ev.clientY,
    startHeight: notesPane.getBoundingClientRect().height,
    stageHeight: stageCell.getBoundingClientRect().height,
  };
  document.body.classList.add('notes-resizing');
});
notesResizer?.addEventListener('pointermove', (ev) => {
  if (!notesDrag || ev.pointerId !== notesDrag.pointerId) return;
  // Drag up → notes grows (positive dy); cap so the stage keeps at
  // least STAGE_MIN_PX of room.
  const dy = notesDrag.startY - ev.clientY;
  const maxGrow = Math.max(0, notesDrag.stageHeight - STAGE_MIN_PX);
  const next = Math.max(NOTES_MIN_PX, Math.min(notesDrag.startHeight + dy, notesDrag.startHeight + maxGrow));
  applyNotesHeight(next);
});
function endNotesDrag(ev) {
  if (!notesDrag) return;
  try { notesResizer.releasePointerCapture(notesDrag.pointerId); } catch (e) {}
  document.body.classList.remove('notes-resizing');
  const px = Math.round(notesPane.getBoundingClientRect().height);
  try { localStorage.setItem(NOTES_HEIGHT_KEY, String(px)); } catch (e) {}
  notesDrag = null;
}
notesResizer?.addEventListener('pointerup', endNotesDrag);
notesResizer?.addEventListener('pointercancel', endNotesDrag);
notesResizer?.addEventListener('dblclick', () => {
  try { localStorage.removeItem(NOTES_HEIGHT_KEY); } catch (e) {}
  clearNotesHeight();
  flashMode('notes height: auto');
});

// Font zoom for the notes pane. Buttons only, deliberately no hotkey: this
// is the one surface the lecturer types into, and every free letter key is
// already a navigation command that would fire mid-sentence. autoSizeNotes
// reads the computed font-size, so the pane's auto height follows along.
const NOTES_FONT_KEY = 'psi-slides:notes-font';
const NOTES_FONT_BASE = 1.15;
const NOTES_FONT_MIN = 0.8;
const NOTES_FONT_MAX = 2.6;
const NOTES_FONT_STEP = 0.15;
let notesFontRem = NOTES_FONT_BASE;
function applyNotesFont(rem) {
  const clamped = Math.max(NOTES_FONT_MIN, Math.min(NOTES_FONT_MAX, rem));
  notesFontRem = Math.round(clamped * 100) / 100;
  document.documentElement.style.setProperty('--notes-font', notesFontRem + 'rem');
  autoSizeNotes();
}
try {
  const saved = parseFloat(localStorage.getItem(NOTES_FONT_KEY));
  if (saved >= NOTES_FONT_MIN && saved <= NOTES_FONT_MAX) applyNotesFont(saved);
} catch (e) {}
function stepNotesFont(dir) {
  applyNotesFont(notesFontRem + dir * NOTES_FONT_STEP);
  try { localStorage.setItem(NOTES_FONT_KEY, String(notesFontRem)); } catch (e) {}
  flashMode('notes text · ' + Math.round((notesFontRem / NOTES_FONT_BASE) * 100) + '%');
}
['psiINT-notes-zoom-in', 'psiINT-notes-zoom-out'].forEach((id, i) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  // Keep the caret where it is: a click that stole focus would blur the
  // textarea, and on an untouched empty pane that collapses the row out
  // from under the button being clicked.
  btn.addEventListener('mousedown', (ev) => ev.preventDefault());
  btn.addEventListener('click', () => stepNotesFont(i === 0 ? 1 : -1));
});

// Drag-to-resize for the preview strip, in both orientations. Two persisted
// values rather than one: the bottom strip is a height and the right strip a
// width, and someone who flips orientation wants each to come back the way
// they left it. The stage keeps its letterbox either way – #psiINT-stage-cell's
// ResizeObserver re-runs sizeStageViewport, so the mirror stays at the
// audience aspect instead of stretching into whatever room is left.
const previewResizer = document.getElementById('psiINT-preview-resizer');
const PREVIEW_MIN_PX = 70;
// What has to be left of the cue column for it to still be a cue column:
// the cards are the thing being read, and a strip dragged over them is a
// gesture with no way back except the double-click.
const CUE_RAIL_MIN_PX = 260;
// Three arrangements of this window, one drag. Each says which axis it
// moves on, which way the strip grows, the custom property that carries
// its size and the key it is remembered under. A third branch inside the
// handlers is how the cue mode would come to resize differently from the
// other two - the same reason the consume hooks live on goForward rather
// than in the key map.
const PREVIEW_AXES = {
  bottom: { axis: 'y', grow: -1, prop: '--preview-h', key: 'psi-slides:preview-height' },
  right: { axis: 'x', grow: -1, prop: '--preview-w', key: 'psi-slides:preview-width' },
  cue: { axis: 'x', grow: 1, prop: '--cue-strip-w', key: 'psi-slides:cue-strip-width' },
};
function previewAxis() {
  return PREVIEW_AXES[cueOn() ? 'cue'
    : document.body.classList.contains('preview-right') ? 'right' : 'bottom'];
}
function applyPreviewSize(px, ax) {
  document.documentElement.style.setProperty(ax.prop, px + 'px');
}
try {
  Object.values(PREVIEW_AXES).forEach(ax => {
    const v = parseFloat(localStorage.getItem(ax.key));
    if (v >= PREVIEW_MIN_PX) applyPreviewSize(v, ax);
  });
} catch (e) {}

let previewSizeDrag = null;
// How far the strip may grow before it eats the thing it sits beside: the
// mirror in the two classic arrangements, the cards in this one - where
// the mirror grows *with* the strip instead, because it is inside it.
function previewRoom(ax) {
  if (ax.prop === '--cue-strip-w') {
    return Math.max(0, cueRoot.getBoundingClientRect().width - CUE_RAIL_MIN_PX);
  }
  const cell = stageCell.getBoundingClientRect();
  return Math.max(0, (ax.axis === 'x' ? cell.width : cell.height) - STAGE_MIN_PX);
}
previewResizer?.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  try { previewResizer.setPointerCapture(ev.pointerId); } catch (e) {}
  const ax = previewAxis();
  const strip = previewStrip.getBoundingClientRect();
  previewSizeDrag = {
    pointerId: ev.pointerId,
    ax,
    start: ax.axis === 'x' ? ev.clientX : ev.clientY,
    startSize: ax.axis === 'x' ? strip.width : strip.height,
    room: previewRoom(ax),
  };
  document.body.classList.add('preview-resizing');
});
previewResizer?.addEventListener('pointermove', (ev) => {
  if (!previewSizeDrag || ev.pointerId !== previewSizeDrag.pointerId) return;
  const { ax } = previewSizeDrag;
  // Every strip grows away from the edge it hangs on, which is what grow
  // records: up for the bottom strip, left for the right one, right for
  // the cue column, which hangs on the left edge of the window.
  const moved = ax.grow * ((ax.axis === 'x' ? ev.clientX : ev.clientY) - previewSizeDrag.start);
  const next = Math.max(
    PREVIEW_MIN_PX,
    Math.min(previewSizeDrag.startSize + moved, previewSizeDrag.startSize + previewSizeDrag.room)
  );
  applyPreviewSize(next, ax);
});
function endPreviewDrag() {
  if (!previewSizeDrag) return;
  const { ax } = previewSizeDrag;
  try { previewResizer.releasePointerCapture(previewSizeDrag.pointerId); } catch (e) {}
  document.body.classList.remove('preview-resizing');
  const strip = previewStrip.getBoundingClientRect();
  const px = Math.round(ax.axis === 'x' ? strip.width : strip.height);
  try { localStorage.setItem(ax.key, String(px)); } catch (e) {}
  previewSizeDrag = null;
  populatePreviewStrip();
}
previewResizer?.addEventListener('pointerup', endPreviewDrag);
previewResizer?.addEventListener('pointercancel', endPreviewDrag);
previewResizer?.addEventListener('dblclick', () => {
  const ax = previewAxis();
  try { localStorage.removeItem(ax.key); } catch (e) {}
  document.documentElement.style.removeProperty(ax.prop);
  populatePreviewStrip();
  flashMode('preview size: auto');
});

// First populate (applyState ran before viewHooks was reassigned).
updateScrubber();
populateNotesPane();
populatePreviewStrip();

// Resize fires at ~60 Hz during a drag; rebuilding every tick clones
// N chunks and schedules N rAFs per event. Debounce to the trailing
// edge so one rebuild lands after the user stops dragging.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(populatePreviewStrip, 120);
});

// Laser pointer: while the speaker mouse hovers over the stage
// viewport, mirror its position to the audience. Coordinates are
// expressed as fractions of the active chunk's bounding box, so the
// audience can place the dot correctly even at a different zoom.
// rAF-throttled so we don't spam the peer with raw pointermove.
let laserPending = null;
function maybeSendLaser() {
  if (!laserPending) return;
  const { x, y, chunkIdx, target } = laserPending;
  laserPending = null;
  // The pointer is drawn on the room's slide, and a frozen cockpit is not
  // showing the room's slide: the dot would land on a page the room is not
  // looking at, or on the held one at a spot that means something else.
  if (frozen) return;
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx, x, y, target });
}
viewport.addEventListener('pointermove', (ev) => {
  const entry = flatChunks[state.activeIdx];
  if (!entry) return;
  const r = entry.el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (!laserPending) requestAnimationFrame(maybeSendLaser);
  laserPending = { x, y, chunkIdx: state.activeIdx, target: 'chunk' };
});
viewport.addEventListener('pointerleave', () => {
  // Tell audience to drop the dot when the speaker mouse leaves the stage.
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx: -1, x: 0, y: 0 });
});

// Mirror the speaker's cursor while a figure is focused. The overlay
// covers the viewport (z-index 30), so the viewport pointermove above
// stops firing once focus is active – without this handler the audience
// would never see the laser dot during figure inspection. Coords are
// fractions of the focused card's bounding box, which the audience
// resolves against its own card (kept in lockstep via figure-view).
figureOverlay.addEventListener('pointermove', (ev) => {
  if (!focusedFigure) return;
  const r = focusedFigure.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (!laserPending) requestAnimationFrame(maybeSendLaser);
  laserPending = { x, y, chunkIdx: state.activeIdx, target: 'figure' };
});
figureOverlay.addEventListener('pointerleave', () => {
  sendToPeer({ type: 'cursor', source: 'speaker', chunkIdx: -1, x: 0, y: 0 });
});

// Hello handshake: at boot the speaker adopts its opener (the
// audience that spawned it via S) as peer and announces itself.
// Audience replies with the current state snapshot; applyRemoteState
// picks it up. If we were opened standalone (no opener), peer stays
// null and we run on our localStorage state.
setPeer(window.opener);
sendToPeer({ type: 'hello', source: 'speaker' });
