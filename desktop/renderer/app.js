// The window's whole behaviour. A plain script, no module syntax and no
// framework: it renders one of two screens from one state object that the
// main process sends whole on every change, so there is nothing here that
// can disagree with what the build process is actually doing.
//
// The dictionary is the global STRINGS from strings.js, loaded before this.

(function () {
  'use strict';

  var api = window.builder;

  // ── state ────────────────────────────────────────────────────────

  var state = null;      // the build state from the main process
  var settings = null;   // language, browser preference, recent list, homedir
  var lang = 'en';
  // Remembered for the session, not saved: a disclosure that reopened itself
  // a week later would be a setting nobody made.
  var detailsOpen = false;
  var serveRestarting = false;
  var newFolder = '';
  // The control a sheet was opened from, so that closing it puts the focus
  // back where the person left it.
  var sheetOpener = null;
  // The PDF export, as far as the window knows it: the last choice made in
  // the sheet (remembered for the session, like the disclosure), the kind
  // running now, and the outcome of the last one – a result or an error –
  // for the lecture it was made from. The main process holds the file; the
  // window never sees a path.
  var pdf = { kind: 'slides', collapse: 'topic-bold', running: null, outcome: null, source: null };

  // ── words ────────────────────────────────────────────────────────

  function t(key, vars) {
    var table = STRINGS[lang] || STRINGS.en;
    var s = table[key];
    if (s === undefined) {
      s = STRINGS.en[key];
      if (settings && settings.isDev) console.warn('missing string: ' + key + ' (' + lang + ')');
    }
    if (s === undefined) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
      });
    }
    return s;
  }

  function locale() {
    // en-GB rather than en, so that a time of day is 14:32 on both sides of
    // the language switch; the app is written for a European timetable.
    return lang === 'de' ? 'de-DE' : 'en-GB';
  }

  function fmtTime(ms) {
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  }

  function fmtDuration(ms) {
    var n = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(ms / 1000);
    return t('time.seconds', { n: n });
  }

  // A count with the thousands separator of the language on screen: 14.149
  // in German and 14,149 in English. Six numbers under one another are read
  // as a set, and a four-digit one without a separator breaks the set.
  function fmtCount(n) {
    return new Intl.NumberFormat(locale()).format(n || 0);
  }

  // "at 14:31", "yesterday at 14:31", "on 12 Aug at 14:31". A time alone is
  // enough for what happened today, which is nearly everything the builder
  // shows, and a date without a time would be useless for the rest: the
  // question these two answer is whether the build is newer than the save.
  function fmtWhen(ms) {
    if (!ms) return null;
    var now = new Date();
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    if (ms >= midnight) return t('facts.at', { time: fmtTime(ms) });
    if (ms >= yesterday) return t('facts.atYesterday', { time: fmtTime(ms) });
    var date = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(ms));
    return t('facts.atDate', { date: date, time: fmtTime(ms) });
  }

  function fmtAgo(ms) {
    var d = Date.now() - ms;
    if (!ms || d < 0) d = 0;
    var min = Math.floor(d / 60000);
    if (min < 1) return t('time.justNow');
    if (min < 60) return t('time.minutes', { n: min });
    var hours = Math.floor(min / 60);
    if (hours < 24) return t('time.hours', { n: hours });
    var days = Math.floor(hours / 24);
    if (days === 1) return t('time.yesterday');
    if (days < 7) return t('time.days', { n: days });
    return new Intl.DateTimeFormat(locale(), { dateStyle: 'short' }).format(new Date(ms));
  }

  // ── paths ────────────────────────────────────────────────────────

  // The home directory is a prefix everybody recognises and nobody needs to
  // read, so it becomes a tilde. Everything after it is the person's own
  // naming and stays untouched.
  function withTilde(p) {
    var home = settings && settings.homedir;
    if (home && p.indexOf(home) === 0) return '~' + p.slice(home.length);
    return p;
  }

  // Middle truncation in script rather than in CSS: the usual `direction:
  // rtl` trick reorders mixed text, and a path with a bracket or a German
  // word in it comes out scrambled. The last two segments are what a person
  // recognises their lecture by, so those are the ones that survive.
  function shorten(p, budget) {
    var s = withTilde(p);
    if (s.length <= budget) return s;
    var sep = s.indexOf('/') >= 0 ? '/' : '\\';
    var parts = s.split(sep);
    if (parts.length <= 2) return s;
    var tail = parts.slice(-2).join(sep);
    var out = '…' + sep + tail;
    if (out.length > budget) out = '…' + sep + parts[parts.length - 1];
    return out;
  }

  // ── the dictionary applied to the markup ─────────────────────────

  function applyStatic() {
    document.documentElement.lang = lang;
    var i, els;
    els = document.querySelectorAll('[data-t]');
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    els = document.querySelectorAll('[data-t-aria]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('aria-label', t(els[i].getAttribute('data-t-aria')));
    els = document.querySelectorAll('[data-t-title]');
    for (i = 0; i < els.length; i++) els[i].title = t(els[i].getAttribute('data-t-title'));
    $('lang-de').classList.toggle('current', lang === 'de');
    $('lang-en').classList.toggle('current', lang === 'en');
  }

  function $(id) { return document.getElementById(id); }

  function show(el, on) { el.hidden = !on; }

  // ── the start screen ─────────────────────────────────────────────

  function renderRecent() {
    var list = $('recent');
    list.textContent = '';
    var entries = (settings && settings.recent) || [];
    show($('recent-empty'), entries.length === 0);
    entries.forEach(function (entry) {
      var li = document.createElement('li');
      if (!entry.exists) li.className = 'missing';

      var open = document.createElement('button');
      open.type = 'button';
      open.className = 'open';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name;
      var pathEl = document.createElement('span');
      pathEl.className = 'path mono';
      pathEl.textContent = shorten(entry.path, 46);
      pathEl.title = entry.path;
      open.appendChild(name);
      open.appendChild(pathEl);
      open.addEventListener('click', function () { openProject(entry.path); });

      var when = document.createElement('span');
      when.className = 'when';
      when.textContent = entry.exists ? fmtAgo(entry.openedAt) : t('start.missing');

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-btn remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t('start.remove'));
      remove.title = t('start.remove');
      remove.addEventListener('click', function (e) {
        e.stopPropagation();
        api.removeRecent(entry.path);
      });

      li.appendChild(open);
      li.appendChild(when);
      li.appendChild(remove);
      list.appendChild(li);
    });
  }

  // ── the project screen ───────────────────────────────────────────

  function renderStatus() {
    var dot = $('status-dot');
    var text = $('status-text');
    var sub = $('status-sub');
    var bug = $('status-bug');
    var msg = $('status-message');
    dot.className = 'dot';
    show(sub, false);
    show(bug, false);
    show(msg, false);

    var last = state.lastSuccess;
    if (state.phase === 'starting') {
      dot.classList.add('busy');
      text.textContent = t('status.starting');
    } else if (state.phase === 'building') {
      dot.classList.add('busy');
      text.textContent = t('status.building');
    } else if (state.phase === 'ready') {
      dot.classList.add('ok');
      // Auto-build off and the file changed since the build: nothing is
      // wrong, so the dot keeps its colour and only the sentence moves.
      if (state.changedSinceBuild && last) {
        text.textContent = t('status.changed', { time: fmtTime(last.at) });
      } else if (last) {
        text.textContent = t('status.ready', { time: fmtTime(last.at), duration: fmtDuration(last.durationMs) });
      } else {
        text.textContent = t('status.building');
      }
    } else if (state.phase === 'build-error') {
      dot.classList.add('bad');
      text.textContent = t('status.error');
      sub.textContent = last ? t('status.errorKeep', { time: fmtTime(last.at) }) : t('status.errorNone');
      show(sub, true);
      if (state.lastError) {
        if (!state.lastError.userFacing) show(bug, true);
        msg.textContent = state.lastError.message;
        show(msg, true);
      }
    } else if (state.phase === 'process-error') {
      dot.classList.add('bad');
      text.textContent = t('status.exited');
      if (state.lastError && state.lastError.message) {
        msg.textContent = state.lastError.message;
        show(msg, true);
      }
    }
  }

  function renderOutputs() {
    var views = (state.lastSuccess && state.lastSuccess.views) || [];
    var kinds = ['audience', 'speaker', 'print', 'print-notes'];
    kinds.forEach(function (kind) {
      var cell = $('out-' + kind);
      var built = views.indexOf(kind) >= 0;
      cell.disabled = !built;
      var hint = cell.querySelector('.cell-hint');
      var key = { 'audience': 'outputs.audienceHint', 'speaker': 'outputs.speakerHint',
        'print': 'outputs.printHint', 'print-notes': 'outputs.printNotesHint' }[kind];
      hint.textContent = built ? t(key) : t('outputs.notBuilt');
    });
  }

  // What is in the lecture, from the last build that succeeded. It stays on
  // screen through a failed build for the same reason the output cells do:
  // the four views on disk are still that build's, and so are these numbers.
  function renderFacts() {
    var stats = state.lastSuccess && state.lastSuccess.stats;
    var grid = $('fact-grid');
    var times = $('facts-times');
    var wait = $('facts-wait');
    show(grid, !!stats);
    show(wait, !stats);
    if (!stats) { show(times, false); return; }

    $('fact-sections').textContent = fmtCount(stats.sections);
    $('fact-chunks').textContent = fmtCount(stats.chunks);
    $('fact-page-words').textContent = fmtCount(stats.pageWords);
    $('fact-note-words').textContent = fmtCount(stats.noteWords);
    $('fact-pictures').textContent = fmtCount(stats.pictures);
    $('fact-drawings').textContent = fmtCount(stats.drawings);

    var saved = fmtWhen(state.sourceModifiedMs);
    if (saved) {
      times.textContent = t('facts.times', { saved: saved, built: fmtWhen(state.lastSuccess.at) });
    }
    show(times, !!saved);
  }

  // Sets text only when it changed, so that a state message that arrives
  // every few seconds during an export does not make the live region read
  // the same sentence out again.
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function renderPdf() {
    var box = $('pdf-status');
    var text = $('pdf-text');
    var actions = $('pdf-actions');
    var sub = $('pdf-sub');
    var msg = $('pdf-message');
    var built = !!state.lastSuccess;
    var btn = $('btn-pdf');
    btn.setAttribute('aria-disabled', pdf.running || !built ? 'true' : 'false');

    var o = pdf.outcome;
    show(box, !!(pdf.running || o));
    show(actions, false);
    show(sub, false);
    show(msg, false);
    if (pdf.running) {
      setText(text, t('pdf.running.' + pdf.running));
      // The slides are the export that takes long enough to wonder about,
      // and there is no progress to show (one walk, one answer), so the
      // line says why instead.
      if (pdf.running === 'slides') { setText(sub, t('pdf.runningSlides')); show(sub, true); }
      return;
    }
    if (!o) return;
    if (o.ok) {
      var vars = { name: o.name, time: fmtTime(o.at), pages: fmtCount(o.pages) };
      setText(text, o.pages === null || o.pages === undefined ? t('pdf.doneUncounted', vars)
        : o.pages === 1 ? t('pdf.doneOne', vars) : t('pdf.done', vars));
      show(actions, true);
      if (o.stale) { setText(sub, t('pdf.stale')); show(sub, true); }
      // The diagnostics verbatim, one per line, as a build error is shown:
      // they are the export's own words, written for the author, and each
      // names the slide it is about.
      if (o.diagnostics && o.diagnostics.length) {
        setText(sub, (o.stale ? t('pdf.stale') + ' ' : '') + t('pdf.diagnostics'));
        show(sub, true);
        setText(msg, o.diagnostics.map(function (d) { return d.text; }).join('\n'));
        show(msg, true);
      }
      return;
    }
    setText(text, t(o.error));
    if (o.error === 'pdf.failed' && o.reason) {
      setText(msg, o.reason);
      show(msg, true);
    }
  }

  function renderProject() {
    $('project-name').textContent = state.name || '';
    $('project-path').textContent = shorten(state.source || '', 58);
    $('project-path').title = state.source || '';

    renderStatus();
    renderPdf();
    renderOutputs();
    renderFacts();

    var restart = state.phase === 'process-error';
    $('btn-build').textContent = restart ? t('status.restart') : t('actions.build');
    $('chk-auto').checked = !!state.auto;
    $('chk-auto').disabled = restart;

    // Only when the search ran and found nothing. Somebody who chose "always
    // the default browser" in the settings is not missing anything, and a
    // hint that tells them so would be the app arguing with a decision.
    var browserHint = state.browser && state.browser.kind === 'default' && settings.browser === 'auto';
    var embedHint = state.embeds > 0 && !(state.serve && state.serve.enabled);
    show($('hint-browser'), browserHint);
    show($('hint-embeds'), embedHint);
    show($('hints'), browserHint || embedHint);

    $('chk-serve').checked = !!(state.serve && state.serve.enabled);
    var addr = $('serve-address');
    if (state.serve && state.serve.enabled && state.serve.url) {
      addr.textContent = t('serve.address', { url: state.serve.url });
      show(addr, true);
    } else {
      show(addr, false);
    }
    show($('serve-restarting'), serveRestarting && state.phase !== 'ready');

    var logText = (state.log || []).join('\n');
    if (state.lastError && state.lastError.stack) {
      logText += (logText ? '\n\n' : '') + state.lastError.stack;
    }
    $('log').textContent = logText || t('details.empty');
    $('btn-details').textContent = detailsOpen ? t('details.hide') : t('details.show');
    $('btn-details').classList.toggle('open', detailsOpen);
    $('btn-details').setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
    show($('details-body'), detailsOpen);
  }

  function render() {
    if (!state || !settings) return;
    applyStatic();
    var open = state.phase !== 'closed';
    show($('screen-start'), !open);
    show($('screen-project'), open);
    show($('btn-back'), open);
    if (open) renderProject();
    else renderRecent();
    $('settings-version').textContent = t('settings.version', { version: settings.version });
    $('set-lang-' + lang).checked = true;
    $('set-br-' + (settings.browser === 'default' ? 'default' : 'auto')).checked = true;
  }

  // ── actions ──────────────────────────────────────────────────────

  function notice(message) {
    $('notice-text').textContent = message;
    show($('notice'), true);
  }

  function openProject(p) {
    api.openProject(p).then(function (res) {
      if (res && !res.ok && !res.canceled) {
        notice(t(res.error, { path: shorten(res.path || p, 48) }));
      }
    });
  }

  function reportOpen(res, what) {
    if (res && !res.ok && !res.canceled) {
      notice(t(res.error === 'outputs.notBuilt' ? 'outputs.notBuilt' : 'error.openFailed',
        { path: res.path || what, reason: res.reason || '' }));
    }
  }

  // ── the sheets ───────────────────────────────────────────────────

  // A sheet takes the screen's place rather than covering it: #content goes
  // away for as long as one is open. `hidden` is what removes it, and `inert`
  // is there for the day a stylesheet overrides `[hidden]` – the two say the
  // same thing, and nothing behind a sheet may take focus or a click.
  function openSheet(id, opener) {
    closeSheets();
    sheetOpener = opener || (document.activeElement !== document.body ? document.activeElement : null);
    var content = $('content');
    content.hidden = true;
    content.setAttribute('inert', '');
    show($(id), true);
    var first = $(id).querySelector('input, button');
    if (first) first.focus();
  }

  function isSheetOpen(id) { return !$(id).hidden; }

  function closeSheets() {
    show($('sheet-new'), false);
    show($('sheet-settings'), false);
    show($('sheet-pdf'), false);
    var content = $('content');
    content.hidden = false;
    content.removeAttribute('inert');
    // The focus goes back to the control that opened the sheet, so that a
    // person who tabbed to the gear is not returned to the top of the window.
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
    sheetOpener = null;
  }

  function openNew(opener) {
    newFolder = '';
    $('new-name').value = '';
    $('new-folder').textContent = '';
    show($('new-error'), false);
    openSheet('sheet-new', opener);
  }

  function newErrorText(message) {
    $('new-error').textContent = message;
    show($('new-error'), true);
  }

  function newError(key) { newErrorText(t(key)); }

  function create() {
    var name = $('new-name').value.trim();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) return newError('new.badName');
    if (!newFolder) return newError('new.noFolder');
    show($('new-error'), false);
    api.createProject({ name: name, into: newFolder }).then(function (res) {
      if (res && res.ok) { closeSheets(); return; }
      if (!res) return;
      if (res.error === 'new.exists' || res.error === 'new.badName' || res.error === 'new.noFolder') {
        newError(res.error);
      } else {
        newErrorText(t('error.openFailed', { path: name, reason: res.reason || '' }));
      }
    });
  }

  // ── the PDF export ───────────────────────────────────────────────

  function pdfBlocked() {
    return !!pdf.running || !(state && state.lastSuccess);
  }

  function syncPdfSheet() {
    $('pdf-kind-' + pdf.kind).checked = true;
    $('pdf-collapse-' + (pdf.collapse === 'none' ? 'full' : 'slide')).checked = true;
    show($('pdf-collapse'), pdf.kind === 'slides');
  }

  // Opened from the button under the grid, or from File > Export as PDF
  // with its choice made. The focus lands on the chosen kind, which is where
  // the arrow keys then move between the three.
  function openPdfSheet(kind, opener) {
    if (!state || state.phase === 'closed' || pdf.running) return;
    if (kind) pdf.kind = kind;
    syncPdfSheet();
    openSheet('sheet-pdf', opener);
    $('pdf-kind-' + pdf.kind).focus();
  }

  function startPdf() {
    if (pdf.running) return;
    var kind = pdf.kind;
    var source = state && state.source;
    var opts = kind === 'slides' ? { collapse: pdf.collapse } : undefined;
    closeSheets();
    // Cancelling the save dialog says nothing, so the line goes back to
    // whatever it said before.
    var before = pdf.outcome;
    pdf.running = kind;
    pdf.outcome = null;
    pdf.source = source;
    render();
    api.exportPdf(kind, opts).then(function (res) {
      finishPdf(source, before, res);
    }, function (err) {
      finishPdf(source, before, { ok: false, error: 'pdf.failed', reason: String(err && err.message || err) });
    });
  }

  function finishPdf(source, before, res) {
    // An answer for a lecture that is no longer open is nobody's news: the
    // main process aborted it when the lecture closed.
    if (!state || state.source !== source) { pdf.running = null; return; }
    pdf.running = null;
    if (!res || res.canceled) pdf.outcome = before;
    else pdf.outcome = res.ok ? Object.assign({ at: Date.now() }, res) : res;
    render();
  }

  // ── wiring ───────────────────────────────────────────────────────

  function wire() {
    $('btn-open').addEventListener('click', function () { api.chooseSource(); });
    $('btn-new').addEventListener('click', function () { openNew($('btn-new')); });
    $('btn-back').addEventListener('click', function () { api.closeProject(); });

    $('btn-build').addEventListener('click', function () {
      if (state && state.phase === 'process-error') api.openProject(state.source);
      else api.buildNow();
    });
    $('chk-auto').addEventListener('change', function () { api.setAuto($('chk-auto').checked); });
    $('chk-serve').addEventListener('change', function () {
      serveRestarting = true;
      api.setServe($('chk-serve').checked);
    });

    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
      (function (cell) {
        cell.addEventListener('click', function () {
          api.openOutput(cell.getAttribute('data-kind')).then(function (res) {
            reportOpen(res, cell.getAttribute('data-kind') + '.html');
          });
        });
      })(cells[i]);
    }

    $('btn-source').addEventListener('click', function () {
      api.openSource().then(function (res) { reportOpen(res, 'source.md'); });
    });
    $('btn-folder').addEventListener('click', function () { api.showFolder(); });

    $('btn-pdf').addEventListener('click', function () {
      if (!pdfBlocked()) openPdfSheet(null, $('btn-pdf'));
    });
    ['slides', 'print', 'print-notes'].forEach(function (kind) {
      $('pdf-kind-' + kind).addEventListener('change', function () {
        pdf.kind = kind;
        syncPdfSheet();
      });
    });
    $('pdf-collapse-slide').addEventListener('change', function () { pdf.collapse = 'topic-bold'; });
    $('pdf-collapse-full').addEventListener('change', function () { pdf.collapse = 'none'; });
    $('btn-pdf-export').addEventListener('click', startPdf);
    $('btn-pdf-cancel').addEventListener('click', closeSheets);
    // Enter on a choice is the Export button, as it is in a form.
    $('sheet-pdf').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.type === 'radio') { e.preventDefault(); startPdf(); }
    });
    $('btn-pdf-open').addEventListener('click', function () {
      api.openPdf().then(function (res) { reportOpen(res, pdf.outcome && pdf.outcome.name); });
    });
    $('btn-pdf-show').addEventListener('click', function () {
      api.showPdf().then(function (res) { reportOpen(res, pdf.outcome && pdf.outcome.name); });
    });

    $('btn-details').addEventListener('click', function () {
      detailsOpen = !detailsOpen;
      render();
    });
    $('btn-copy').addEventListener('click', function () {
      var text = $('log').textContent;
      var done = function () {
        $('btn-copy').textContent = t('details.copied');
        setTimeout(function () { $('btn-copy').textContent = t('details.copy'); }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });

    $('notice-dismiss').addEventListener('click', function () { show($('notice'), false); });

    $('lang-de').addEventListener('click', function () { api.setLanguage('de'); });
    $('lang-en').addEventListener('click', function () { api.setLanguage('en'); });
    $('btn-settings').addEventListener('click', function () { openSheet('sheet-settings', $('btn-settings')); });
    $('btn-settings-done').addEventListener('click', closeSheets);
    $('set-lang-en').addEventListener('change', function () { api.setLanguage('en'); });
    $('set-lang-de').addEventListener('change', function () { api.setLanguage('de'); });
    $('set-br-auto').addEventListener('change', function () { api.setBrowserPreference('auto'); });
    $('set-br-default').addEventListener('change', function () { api.setBrowserPreference('default'); });

    $('btn-choose-folder').addEventListener('click', function () {
      api.chooseFolder().then(function (res) {
        if (res && res.ok) {
          newFolder = res.path;
          $('new-folder').textContent = withTilde(res.path);
          show($('new-error'), false);
        }
      });
    });
    $('btn-create').addEventListener('click', create);
    $('btn-cancel-new').addEventListener('click', closeSheets);
    $('new-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheets();
    });

    // ── drag and drop ────────────────────────────────────────────
    //
    // A sandboxed renderer no longer sees File.path, so the preload asks
    // Electron for it. Everything after that is the same validation an Open
    // dialog goes through.
    var depth = 0;
    function dragOn(on) {
      show($('drop-frame'), on);
      var lead = $('start-lead');
      lead.textContent = on ? t('drop.hint') : t('start.lead');
    }
    window.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; dragOn(true); });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) dragOn(false);
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0;
      dragOn(false);
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var p = api.pathForFile(files[0]);
      if (p) openProject(p);
    });
  }

  // ── start ────────────────────────────────────────────────────────

  api.onState(function (s) {
    var wasStarting = state && state.phase === 'starting';
    // Another lecture, or none: the last export's line was about the old one.
    if (!state || s.source !== state.source || s.phase === 'closed') {
      pdf.outcome = null;
      if (s.phase === 'closed' && isSheetOpen('sheet-pdf')) closeSheets();
    }
    state = s;
    if (s.phase === 'ready' || (wasStarting && s.phase === 'build-error')) serveRestarting = false;
    render();
  });

  api.onSettings(function (s) {
    settings = s;
    lang = s.language;
    render();
  });

  api.onCommand(function (cmd) {
    var name = cmd && cmd.name;
    if (name === 'new') openNew();
    else if (name === 'settings') openSheet('sheet-settings');
    else if (name === 'exportPdf') openPdfSheet(cmd.kind);
    else if (name === 'openFailed') notice(t(cmd.error, { path: shorten(cmd.path || '', 48) }));
  });

  wire();
  Promise.all([api.getSettings(), api.getState()]).then(function (r) {
    settings = r[0];
    lang = settings.language;
    state = r[1];
    render();
  });
})();
