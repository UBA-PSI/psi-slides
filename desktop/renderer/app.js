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

  function renderProject() {
    $('project-name').textContent = state.name || '';
    $('project-path').textContent = shorten(state.source || '', 58);
    $('project-path').title = state.source || '';

    renderStatus();
    renderOutputs();

    var restart = state.phase === 'process-error';
    $('btn-build').textContent = restart ? t('status.restart') : t('actions.build');
    $('chk-auto').checked = !!state.auto;
    $('chk-auto').disabled = restart;

    var browserHint = state.browser && state.browser.kind === 'default';
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

  function openSheet(id) {
    closeSheets();
    show($(id), true);
    var first = $(id).querySelector('input, button');
    if (first) first.focus();
  }

  function closeSheets() {
    show($('sheet-new'), false);
    show($('sheet-settings'), false);
  }

  function openNew() {
    newFolder = '';
    $('new-name').value = '';
    $('new-folder').textContent = '';
    show($('new-error'), false);
    openSheet('sheet-new');
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

  // ── wiring ───────────────────────────────────────────────────────

  function wire() {
    $('btn-open').addEventListener('click', function () { api.chooseSource(); });
    $('btn-new').addEventListener('click', openNew);
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
    $('btn-settings').addEventListener('click', function () { openSheet('sheet-settings'); });
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
