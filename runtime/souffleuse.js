
// ── the live prompter (--prompter) ────────────────────────────────
// The cockpit's half of docs/history/PLAN-souffleuse.md: an ear, a switch, and one way
// back to the sidecar over the watch socket that is already here. This whole
// text is spliced into speaker.html only under --prompter, at the end of
// the same script element SPEAKER_JS is in, so everything below reads the
// cockpit's own bindings - flatChunks, state, viewHooks, cueSync,
// souffleuseCues, applyCueMode, cuePosition, flashMode - as if it still
// stood where it was written. A cockpit built any other way carries none of
// it, and SOUFFLEUSE is null in the one line that survives.
//
// The projection never learns any of this. Not one field of snapshot()
// moves, every message is its own type on the socket, and the room sees
// exactly what it saw before the flag existed.
if (SOUFFLEUSE && window.psiWatch) {
  const souffWatch = window.psiWatch;
  const souffBtn = document.getElementById('psiINT-souffleuse-btn');
  const souffBadgeEl = document.getElementById('psiINT-souffleuse-badge');
  const souffStrip = document.getElementById('psiINT-souffleuse-strip');
  const souffStripGlyph = souffStrip && souffStrip.querySelector('.souffleuse-glyph');
  const souffStripText = souffStrip && souffStrip.querySelector('.souffleuse-text');
  const souffHeardEl = document.getElementById('psiINT-souffleuse-heard');
  const souffLogEl = document.getElementById('psiINT-souffleuse-log');
  // sessionStorage, never local: a microphone is an act of consent and the
  // button is where it is given, so the answer lasts as long as this tab
  // and no longer. A rebuild reloads the page on every save, and a
  // rehearsal should not have to press the switch again for each of them.
  const SOUFF_ON_KEY = 'psi-slides:souffleuse';
  // The two preferences are the other way round: how you like to rehearse
  // is a property of you, not of this tab, so they are local and outlive
  // the session the microphone does not.
  const SOUFF_HEARD_KEY = 'psi-slides:souffleuse-heard';
  const SOUFF_CUES_KEY = 'psi-slides:souffleuse-cues';
  // The clock's origin, kept beside the consent and only while the prompter is
  // on. tStart was once the page load, and --watch reloads the page on every
  // save: the clock used to restart in the middle of a rehearsal, which the
  // sidecar believed - the drift went wildly negative, a negative gap since the
  // last tick stopped every slide tick for the rest of the talk, and the
  // opening quiet minute was stamped again on each save. The cockpit's own
  // key (CLOCK_KEY) now keeps any clock a press or a gesture set across a
  // reload, so this is the second copy, kept because it also survives a
  // navigation within the tab while the prompter is on. A clock that has not
  // started (tStart is Infinity) is not written: a reload finds it waiting
  // again. sessionStorage, like the consent it sits beside - the clock of this
  // talk in this tab.
  const SOUFF_CLOCK_KEY = 'psi-slides:souffleuse-clock';
  // And the moment the switch was thrown, on that clock. The opening quiet is
  // measured from the press, and the restore path used to stamp it afresh on
  // every save: the cockpit then showed the words it was hearing for another
  // minute and said "it cannot help you yet" through a minute in which it
  // could, while the sidecar - which keeps its own stamp and rebases it -
  // correctly did not re-quiet. Only a gesture starts a new quiet minute.
  const SOUFF_ONAT_KEY = 'psi-slides:souffleuse-onat';
  // Said once per tab: the full sentence on the first switch-on, the short one
  // after that. What a toast is for is telling somebody something they do not
  // already know.
  const SOUFF_TOLD_KEY = 'psi-slides:souffleuse-told';
  const souffClockBtn = document.getElementById('psiINT-clock');
  let souffShowHeard = false;
  // The frontmatter is a ceiling, not a default: a deck whose prompter
  // block switched cues off does not get cards because a preference in this
  // browser says otherwise.
  let souffCuesOn = !!SOUFFLEUSE.cues;
  try {
    souffShowHeard = localStorage.getItem(SOUFF_HEARD_KEY) === 'on';
    const saved = localStorage.getItem(SOUFF_CUES_KEY);
    if (saved !== null) souffCuesOn = saved === 'on' && !!SOUFFLEUSE.cues;
  } catch (e) { /* a private window is allowed to refuse */ }
  // The clock of a talk that was already running when this page was replaced.
  // Refused if it is in the future or more than twelve hours old, which is the
  // same ceiling talkDuration has: a stale key from yesterday's rehearsal
  // would put the talk hours behind before a word was said.
  try {
    const kept = Number(sessionStorage.getItem(SOUFF_CLOCK_KEY));
    if (sessionStorage.getItem(SOUFF_ON_KEY) === 'on' && isFinite(kept) && kept > 0
        && kept <= Date.now() && Date.now() - kept < 12 * 3600 * 1000) {
      tStart = kept;
      renderTimer();
    }
  } catch (e) { /* a private window is allowed to refuse */ }

  // ── the speech-to-text adapter ─────────────────────────────────────
  // One interface, so a whisper.cpp in Node (the cwebp-on-PATH pattern) or
  // a hosted recogniser can take this place without the socket protocol
  // changing a word:
  //
  //   {name, available(lang), start(lang, {onFinal, onInterim, onState}),
  //    stop()}
  //
  // available resolves {ok, local, why}; onFinal takes {text, t0, t1} in
  // seconds of the cockpit's own clock.
  // The spellings of one language, most specific first. Chrome's on-device
  // packs carry a region (the one on the machine this was first tested on is
  // en-US) while a deck writes the document's language, which is usually the
  // bare subtag. Asking only what the deck wrote is how a machine that has the
  // model installed still talks to a server.
  const STT_REGION = {
    en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT',
    nl: 'nl-NL', pt: 'pt-BR', pl: 'pl-PL', sv: 'sv-SE', da: 'da-DK',
    tr: 'tr-TR', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  };
  function sttTags(lang) {
    const want = String(lang || 'en').trim();
    const primary = want.split('-')[0].toLowerCase();
    const out = [want];
    const add = (t) => { if (t && out.indexOf(t) < 0) out.push(t); };
    // The browser's own locale, but only when it is the same language: a
    // German Chrome must not be asked for German when the deck is English.
    const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || '');
    if (nav && nav.split('-')[0].toLowerCase() === primary) add(nav);
    add(STT_REGION[primary]);
    return out;
  }

  function webSpeechAdapter() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    let cbs = null;
    let want = false;
    let local = false;
    let needDownload = false;
    // Where the utterance now being heard began, on the cockpit's clock. The
    // API gives a result no start time, so it is taken from speechstart - the
    // event that fires when the room starts talking - with the first interim
    // after a final as the fallback for a recogniser that does not send one.
    //
    // It used to be the end of the *previous* final, and that made every
    // number the delivery rests on a number about something else: the pause
    // between two sentences sat inside t1 - t0, so longestGap was
    // structurally 0, a speaker who thought for a minute and then said a
    // sentence had that sentence rated at ten words a minute, the sample
    // floor was reached on silence alone, and the cadence counted the quiet
    // as speech. The rehearsal line reading "longest silence 0s" was the tell.
    let speechAt = null;
    // The clock at the end of the last final, and the floor under a span that
    // has nothing better: a second final inside one utterance starts where the
    // first ended, which is speech. Re-stamped on every open, so a segment can
    // never span the silence a restart sat in.
    let mark = 0;
    let restarts = [];
    // What Chrome answered for each spelling, and which one is worth installing.
    let verdicts = [];
    let downloadTag = null;

    function open(lang) {
      // The instance is held locally as well as in the shared slot, and every
      // handler below asks whether it is still the live one. Without that,
      // start()'s own guard built the thing it guards against: it aborts the
      // open recogniser, clears the slot and opens a new one synchronously,
      // and the old one's end event then arrives, clears the slot - dropping
      // the reference to the new, still-listening recogniser - and starts a
      // third. Two ears, every sentence sent twice, the cadence counted twice.
      const r = new SR();
      rec = r;
      // A restart is a fresh listening window, and the mark from before it is
      // on the far side of however long the room was quiet.
      mark = souffClock();
      speechAt = null;
      r.continuous = true;
      r.interimResults = true;
      r.lang = lang;
      if (local) { try { r.processLocally = true; } catch (e) { /* older Chrome */ } }
      // Talking started. Overwritten rather than kept on a second one, because
      // the wrong direction to err in here is the one that counts silence as
      // speech.
      r.addEventListener('speechstart', () => { if (rec === r) speechAt = souffClock(); });
      r.addEventListener('result', (ev) => {
        if (rec !== r) return;
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = ((r[0] && r[0].transcript) || '').trim();
          if (r.isFinal) {
            const t1 = souffClock();
            // The start of this utterance, never the end of the last one. The
            // min is the floor: a clock the lecturer restarted under a
            // sentence would otherwise hand the sidecar a negative span.
            const t0 = Math.min(speechAt == null ? mark : speechAt, t1);
            mark = t1;
            speechAt = null;
            if (text) cbs.onFinal({ text, t0, t1 });
          } else if (text) {
            // Where speechstart did not arrive, the first interim after a
            // final is the earliest evidence this ear has that words are
            // being said.
            if (speechAt == null) speechAt = souffClock();
            interim += (interim ? ' ' : '') + text;
          }
        }
        if (interim) cbs.onInterim(interim);
      });
      r.addEventListener('error', (ev) => {
        if (rec !== r) return;
        const err = (ev && ev.error) || '';
        // Silence and a deliberate abort are the ordinary course of a talk,
        // not failures: Chrome ends an utterance whenever the room goes
        // quiet, and end below starts the next one.
        if (err === 'no-speech' || err === 'aborted') return;
        if (err === 'not-allowed' || err === 'service-not-allowed') { want = false; cbs.onState('denied'); return; }
        if (err === 'audio-capture') { want = false; cbs.onState('no-mic'); return; }
        if (err === 'network') { cbs.onState('network'); return; }
        cbs.onState('error');
      });
      r.addEventListener('end', () => {
        if (rec !== r) return;
        rec = null;
        if (!want) return;
        const now = Date.now();
        restarts = restarts.filter(t => now - t < 60000);
        // Ending is normal; ending six times in a minute is not pausing,
        // it is refusing, and restarting it for the rest of the talk would
        // hold the microphone light on for nothing.
        if (restarts.length >= 6) { want = false; cbs.onState('stalled'); return; }
        restarts.push(now);
        // A beat before the next one: a restart in the same tick of an
        // immediate end is a loop, not a recogniser.
        setTimeout(() => { if (want && !rec) open(lang); }, 250);
      });
      try { r.start(); } catch (e) { cbs.onState('error'); }
    }

    return {
      name: 'web-speech',
      needsDownload: () => needDownload,
      async available(lang) {
        if (!SR) return { ok: false, local: false, why: 'no speech recognition in this browser' };
        needDownload = false;
        verdicts = [];
        downloadTag = null;
        // Chrome's on-device path. available() is young and, on macOS, the
        // subject of an open Chromium bug - so anything that is not a plain
        // "available" falls back to the server recogniser rather than being
        // argued with, and the badge says which one the room is getting.
        //
        // It is asked for more than one spelling of the language, because the
        // two halves disagree about what a language is. A deck writes lang: en,
        // which is right for the document, and Chrome's packs are regional:
        // the one on this machine is en-US. Asking only for the bare subtag is
        // how a machine with the model already installed still ends up on
        // Google's servers. The candidates are the deck's own tag first, then
        // the browser's own locale when it shares the primary subtag, then one
        // default region - and every answer is written down, so the log can say
        // why the room is not getting the on-device ear.
        if (typeof SR.available !== 'function') {
          return { ok: true, local: false, why: 'server speech recognition', verdicts };
        }
        for (const tag of sttTags(lang)) {
          let st = 'threw';
          try { st = await SR.available({ langs: [tag], processLocally: true }); }
          catch (e) { st = 'threw'; }
          verdicts.push(tag + ': ' + st);
          if (st === 'available') return { ok: true, local: true, why: '', lang: tag, verdicts };
          if (st === 'downloading' && !downloadTag) downloadTag = tag;
          if (st === 'downloadable' && !downloadTag) { downloadTag = tag; needDownload = true; }
        }
        return { ok: true, local: false, why: 'server speech recognition', verdicts };
      },
      // Only ever from inside a click: the download wants a user gesture,
      // and the recogniser that carries the talk in the meantime is the
      // server one, with the badge up.
      // The tag that was actually downloadable, not the one the deck names:
      // installing the bare en on a machine whose pack is en-US asks for nothing.
      download(lang) {
        if (!SR || typeof SR.install !== 'function') return null;
        const tag = downloadTag || sttTags(lang)[0];
        try { SR.install({ langs: [tag], processLocally: true }); return tag; }
        catch (e) { return null; }
      },
      start(lang, handlers, onDevice) {
        // A second start while a recogniser is open would leave the first one
        // running and unreferenced - open overwrites rec - and every final
        // result would arrive twice. The switch guards against getting here
        // twice at all; this is the guard a caller cannot forget.
        if (rec) {
          want = false;
          try { rec.abort(); } catch (e) { /* already gone */ }
          rec = null;
        }
        cbs = handlers;
        want = true;
        local = !!onDevice;
        restarts = [];
        open(lang);
      },
      // The speaker moved the clock under an utterance: the two stamps a span
      // is measured between move with it, or the sentence being said is a
      // minute longer or has no length at all.
      shift(delta) {
        mark += delta;
        if (speechAt != null) speechAt += delta;
      },
      stop() {
        want = false;
        if (rec) { try { rec.abort(); } catch (e) { /* already gone */ } }
        rec = null;
      },
    };
  }

  // ── the switch, and what it feeds ──────────────────────────────────
  const souffStt = webSpeechAdapter();
  let souffOn = false;
  let souffState = 'off';
  let souffLocal = false;
  let souffVerdicts = [];
  let souffAsked = null;
  // The switch-on moment on the cockpit's own clock, the opening quiet the
  // sidecar reported, and the heartbeat: when the model was last asked, and
  // how often this session.
  // The tag recognition actually runs in. It starts as the deck's own and
  // becomes whatever the availability check settled on, which may carry a
  // region the deck never wrote.
  let souffLangTag = SOUFFLEUSE ? SOUFFLEUSE.lang : 'en';
  let souffOnAt = null;
  let souffStartQuiet = 60;
  let souffAskedAt = null;
  let souffAskCount = 0;
  let souffHeardWords = [];
  let souffBeatTimer = null;
  let souffLastSent = { idx: -1, beat: -1 };

  // The cockpit's clock, unrounded. renderTimer floors the same number for
  // the digits; four fifths of a second of speech is not zero seconds of
  // speech, and the cadence is counted in those.
  // Never below zero, like the digits: a clock holding for a planned start
  // that is still ahead stands at 0:00 for the sidecar too.
  function souffClock() { return Math.round(Math.max(0, Date.now() - tStart) / 10) / 100; }

  // The badge is for degraded states only, and two things have to remember
  // which - a status arrives every tick, and the first version of this
  // wiped the reason one message after it was given: a refused key put
  // "off - no key in the environment" up, and the idle that followed the
  // cockpit's own switch-off took it down again, which is exactly the
  // moment a lecturer needs to read it. So the ear keeps its reason and the
  // sidecar keeps its own, and the badge is painted from them rather than
  // written to directly.
  let souffEarWhy = null;    // the recogniser: denied, no microphone, stalled
  let souffSideWhy = null;   // the sidecar: no key, unreachable, five failures
  function souffSetBadge(msg) {
    if (!souffBadgeEl) return;
    if (!msg) { souffBadgeEl.hidden = true; souffBadgeEl.innerHTML = ''; return; }
    souffBadgeEl.innerHTML = 'PROMPTER<span> &middot; ' + escText(msg) + '</span>';
    souffBadgeEl.hidden = false;
  }
  // A recogniser running through Google rather than on this machine is a
  // fact about the whole session and the quietest of the degraded states,
  // so it is what is left when nothing louder stands.
  function souffPaintBadge() {
    // The quiet state says what would change it. A pack that is downloading
    // will be there next time the switch is thrown, and that is worth a
    // different sentence from one that was never asked for.
    let ear = null;
    if (souffOn && !souffLocal) {
      ear = souffAsked
        ? 'server speech recognition – fetching the ' + souffAsked + ' model, press again later'
        : 'server speech recognition';
    }
    souffSetBadge(souffEarWhy || souffSideWhy || ear);
  }
  function souffPaint() {
    if (!souffBtn) return;
    const st = souffOn ? souffState : 'off';
    souffBtn.setAttribute('aria-pressed', souffOn ? 'true' : 'false');
    souffBtn.dataset.state = st;
    const dot = souffBtn.querySelector('.souffleuse-dot');
    if (dot) dot.textContent = st === 'off' ? '\u25cc' : '\u25cf';
    // The toast that named the language is gone in two seconds, so the switch
    // itself answers the question for the rest of the talk.
    souffBtn.title = souffOn
      ? 'listening in ' + souffLangName() + (souffLocal ? ', on this machine' : ', through Google')
      : 'the live prompter (Shift-S)';
  }

  // Where the talk stands, in the three numbers the sidecar files everything
  // under. The beat is the consumed count - how many presses this slide has
  // taken - which is what a cue card is filed under, what an overlay's
  // from N counts, and what deckPayload numbered the beats by. Read from
  // anywhere else, the two halves come to disagree about which beat a
  // sentence was said on.
  function souffWhere() {
    const entry = flatChunks[state.activeIdx];
    if (!entry) return null;
    // The total rides along as the beats count: how many presses this slide
    // has in all. It exists in this window's DOM and nowhere else, and the
    // state line the model reads says beat 2 of 3 with it - two of three is a
    // slide nearly done, two of nine is a slide barely begun, and without the
    // second number they are the same sentence.
    const { consumed, total } = cuePosition(entry);
    return {
      chunkId: entry.id || null, idx: state.activeIdx, beat: consumed, beats: total,
    };
  }

  // What a slide is called, for a line about a card laid into it. The id is
  // the fallback, because it is what the author would search for.
  function souffSlideName(id) {
    const entry = flatChunks.find(e => e.id === id);
    const name = entry ? cueChunkTitle(entry) : '';
    const t = String(name || id || 'a later slide');
    return t.length > 42 ? t.slice(0, 41).trimEnd() + '…' : t;
  }

  function souffRemember(on) {
    try {
      if (on) {
        sessionStorage.setItem(SOUFF_ON_KEY, 'on');
        if (isFinite(tStart)) sessionStorage.setItem(SOUFF_CLOCK_KEY, String(tStart));
        else sessionStorage.removeItem(SOUFF_CLOCK_KEY);
        if (souffOnAt != null) sessionStorage.setItem(SOUFF_ONAT_KEY, String(souffOnAt));
      } else {
        sessionStorage.removeItem(SOUFF_ON_KEY);
        sessionStorage.removeItem(SOUFF_CLOCK_KEY);
        sessionStorage.removeItem(SOUFF_ONAT_KEY);
      }
    } catch (e) { /* a private window is allowed to refuse */ }
  }
  // The clock button restarts the talk, and while the prompter is on that new
  // origin is the one a reload has to come back to. This listener is added
  // after the cockpit's own, so tStart is already the new one when it runs.
  if (souffClockBtn) {
    souffClockBtn.addEventListener('click', () => { if (souffOn) souffRemember(true); });
  }
  // A minute back or forward, or the clock set to the planned start, is not a
  // restart: the talk goes on and only the reading changed. Everything this
  // window has stamped on the clock moves by the same seconds - the switch-on
  // moment, so the opening quiet is neither owed again nor skipped, the
  // heartbeat, the open utterance, the rows of the history - and the sidecar
  // is told in so many words (clockDelta on a move), because a jump forward
  // is otherwise indistinguishable from a minute that passed, and a jump back
  // of less than its tolerance from two messages out of order. A restart
  // sends nothing of the kind: the sidecar reads that one off the clock going
  // backwards, as it always did.
  //
  // The first press of the talk is the other kind of clock event: a clock that
  // stood at 0:00 starts from 0:00, so nothing here moves (the switch-on stamp
  // of a prompter thrown before the press is 0, which is now the start). The
  // sidecar has been carrying its own reading forward on the wall clock all
  // that while, so it is told in so many words (clockStart on a move): it
  // takes the reading as a new clock whatever the gap, and its clock line -
  // which the debrief reads as the talk beginning - lands on the moment the
  // talk did.
  clockListeners.push((how, delta) => {
    if (souffOn && how === 'start') {
      souffRemember(true);
      const w = souffWhere();
      if (!w) return;
      souffLastSent = { idx: w.idx, beat: w.beat };
      souffWatch.ask('souffleuse-move', {
        chunkId: w.chunkId, idx: w.idx, beat: w.beat, beats: w.beats,
        elapsed: souffClock(), clockStart: true,
      });
      return;
    }
    if (!souffOn || how === 'restart' || how === 'start' || !delta) return;
    if (souffOnAt != null) souffOnAt += delta;
    if (souffAskedAt != null) souffAskedAt += delta;
    if (souffStt.shift) souffStt.shift(delta);
    for (const h of souffHistory) h.at = Math.max(0, (Number(h.at) || 0) + delta);
    souffRenderLog();
    souffRemember(true);
    const w = souffWhere();
    if (!w) return;
    souffLastSent = { idx: w.idx, beat: w.beat };
    souffWatch.ask('souffleuse-move', {
      chunkId: w.chunkId, idx: w.idx, beat: w.beat, beats: w.beats,
      elapsed: souffClock(), clockDelta: Math.round(delta * 100) / 100,
    });
  });

  function souffHello() {
    return souffWatch.ask('souffleuse-hello', {
      lang: SOUFFLEUSE.lang,
      stt: {
        engine: souffStt.name,
        local: souffLocal,
        // Why the ear is where it is, in Chrome's own words, one entry per
        // spelling of the language that was tried.
        onDevice: souffVerdicts,
        installing: souffAsked,
      },
    });
  }

  // Switching on is two awaits long - asking the browser about the recogniser
  // and saying hello to the sidecar - and souffOn is only true at the end of
  // it. So a second press, or the sessionStorage restore racing a click,
  // walked straight past the souffOn guard and started a second recogniser: the
  // adapter's open() overwrites its own handle, the first recogniser keeps
  // listening unreferenced, and every sentence is sent twice. souffStarting is
  // the flag for the window in between, and it is cleared on every way out.
  let souffStarting = false;
  async function souffStart(fromGesture) {
    if (souffOn || souffStarting) return;
    souffStarting = true;
    try {
      let av;
      try { av = await souffStt.available(SOUFFLEUSE.lang); }
      catch (e) { av = { ok: false, why: 'speech recognition would not start' }; }
      if (!av.ok) { souffEarWhy = av.why; souffPaintBadge(); souffPaint(); return; }
      // The install wants a user gesture, so it can only be fired from the
      // press itself. What it asked for is written down: a download that was
      // never started and one that is still running look the same from the
      // badge, and the difference decides whether pressing again will help.
      souffAsked = null;
      if (fromGesture && souffStt.needsDownload()) souffAsked = souffStt.download(SOUFFLEUSE.lang);
      souffLocal = !!av.local;
      souffLangTag = av.lang || SOUFFLEUSE.lang;
      souffVerdicts = av.verdicts || [];
      souffEarWhy = null;
      const hi = await souffHello();
      if (!hi || !hi.ok) {
        souffSideWhy = 'off \u2013 ' + ((hi && hi.why) || 'the watch server is gone');
        souffPaintBadge();
        souffPaint();
        return;
      }
      if (!hi.enabled) {
        // Nothing to undo: a hello registers this window and stamps the
        // sidecar's clock, and only a toggle switches anything on. So a
        // refusal here is simply not followed by one.
        souffSideWhy = 'off \u2013 ' + (hi.why || 'the prompter is not running');
        souffPaintBadge();
        souffPaint();
        return;
      }
      souffSideWhy = null;
      souffOn = true;
      souffState = 'listening';
      try {
        // The tag the availability check settled on, not the one the deck
        // wrote. A deck says lang: en and Chrome's model is en-US; asking for
        // the model under one name and then listening under the other is how
        // the on-device ear gets found and then not used.
        souffStt.start(souffLangTag, {
          onFinal: souffHeard, onInterim: souffInterim, onState: souffSttState,
        }, souffLocal);
      } catch (e) {
        souffOn = false;
        souffEarWhy = 'speech recognition would not start';
        souffPaintBadge();
        souffPaint();
        return;
      }
      souffPaintBadge();
      // The preference before the switch: the sidecar decides what to offer
      // the model out of cueTargets, and it should know whether cards are
      // wanted before the first tick can happen.
      souffWatch.ask('souffleuse-prefs', { cues: souffCuesOn });
      souffWatch.ask('souffleuse-toggle', { on: true });
      // A reload is not a fresh switch-on. The stamp is kept beside the clock
      // it is measured on, and read back on the restore path only: a value in
      // the new clock's future is a clock somebody restarted under it, and
      // then the minute is owed again.
      souffOnAt = souffClock();
      if (!fromGesture) {
        try {
          const kept = Number(sessionStorage.getItem(SOUFF_ONAT_KEY));
          if (isFinite(kept) && kept >= 0 && kept <= souffOnAt) souffOnAt = kept;
        } catch (e) { /* a private window is allowed to refuse */ }
      }
      if (hi.startQuiet != null && isFinite(Number(hi.startQuiet))) souffStartQuiet = Number(hi.startQuiet);
      // Once every two seconds is enough for a line that counts in seconds,
      // and it is what carries the opening minute's words over to the
      // heartbeat without either of them waiting on the next spoken word.
      if (souffBeatTimer) clearInterval(souffBeatTimer);
      souffBeatTimer = setInterval(() => { if (souffOn) souffInterim(null); }, 2000);
      souffInterim(null);
      souffRemember(true);
      // Whatever the sidecar has already laid into slides still to come. On a
      // reload this window's Map is empty and the sidecar's list is not.
      souffCueReplay(hi.cueCards);
      souffLastSent = { idx: -1, beat: -1 };
      souffMoved();
      souffPaint();
      // The first switch-on of a tab says where the words go, because that is
      // the fact a person consents to and the ear is only half of it: the
      // recogniser may well run on this machine while the transcript does not
      // stay on it. After that the short form, so the toast stops being noise.
      let told = false;
      try {
        told = sessionStorage.getItem(SOUFF_TOLD_KEY) === 'on';
        sessionStorage.setItem(SOUFF_TOLD_KEY, 'on');
      } catch (e) { /* a private window is allowed to refuse */ }
      // The two halves of where it goes, and each one only as true as the run
      // it is said of: a dry run sends nothing to a model, but a recogniser
      // that is not on the device sends the audio to Google in a dry run too.
      const ear = souffLocal ? 'on-device' : 'server recognition';
      const dest = hi.dryRun
        ? (souffLocal ? 'dry run, nothing leaves this machine' : 'dry run, audio to Google for recognition, nothing to a model')
        : (souffLocal ? 'text goes to openrouter.ai' : 'audio to Google, text to openrouter.ai');
      // The language it is about to listen in, named rather than tagged. It
      // is the thing a speaker can most easily be wrong about and least
      // easily notice: a German talk heard as English produces a transcript
      // of plausible nonsense, and the model then corrects the nonsense.
      flashMode('prompter listening \u00b7 ' + souffLangName()
        + ' \u00b7 ' + ear + (told ? '' : ' \u00b7 ' + dest));
    } finally {
      souffStarting = false;
    }
  }

  // The quiet flag is for the one case the sidecar asked for this itself:
  // telling it again would be an answer to its own message.
  function souffStop(quiet) {
    const was = souffOn;
    souffOn = false;
    souffState = 'off';
    try { souffStt.stop(); } catch (e) { /* never started */ }
    if (souffHeardEl) { souffHeardEl.hidden = true; souffHeardEl.classList.remove('beat'); }
    if (souffBeatTimer) { clearInterval(souffBeatTimer); souffBeatTimer = null; }
    souffOnAt = null;
    souffHeardWords = [];
    // The strip goes with the switch, and so do its two timers. Left running,
    // a hint faded fifteen seconds after the ear was closed and sent a
    // dismissal to a sidecar that is no longer listening for one - and the
    // speaker watched a whisper leave a prompter that was already off.
    souffClearHint('off');
    souffRemember(false);
    if (was && !quiet) souffWatch.ask('souffleuse-toggle', { on: false });
    souffPaintBadge();
    souffPaint();
    if (was && !quiet) flashMode('prompter off');
  }

  function souffToggle() {
    if (souffOn) { souffEarWhy = null; souffStop(false); }
    else souffStart(true);
  }
  // Shift-S: a bare letter would fire in the middle of a sentence, and S
  // itself means "open the cockpit" one window over.
  COMMAND_RUN['prompter'] = (e) => { souffToggle(); e.preventDefault(); };
  // Shift-click rather than a key: every free letter in this window is a
  // navigation command that would fire mid-sentence, and the history is
  // read after a talk or between two slides, never in the middle of one.
  if (souffBtn) souffBtn.addEventListener('click', (e) => {
    if (e.shiftKey) { souffShowLog(souffLogEl ? souffLogEl.hidden : false); return; }
    souffToggle();
  });

  function souffHeard(seg) {
    if (!souffOn) return;
    souffEarRecovered();
    const w = souffWhere();
    souffWatch.ask('souffleuse-say', {
      text: seg.text, t0: seg.t0, t1: seg.t1,
      chunkId: w ? w.chunkId : null,
      idx: w ? w.idx : 0,
      beat: w ? w.beat : 0,
    });
    // A segment carries the cursor too, so the move below has nothing left
    // to say about this position.
    if (w) souffLastSent = { idx: w.idx, beat: w.beat };
  }

  // What the ear has provisionally heard, the last eight words of it. Off by
  // default: reassuring while rehearsing, one moving line too many in front
  // of a room. The adapter reports interims either way - what decides
  // whether they are shown is not the ear.
  // The line under the strip, and it has two jobs at two moments.
  //
  // For the first minute after the switch the prompter cannot say anything at
  // all - that is the opening quiet, and it is exactly the minute in which a
  // speaker wonders whether the thing is working. So the words it is hearing
  // go there, unasked, and then stop: leaving them up for the rest of the talk
  // is a moving line in the corner of the eye, which is what the checkbox is
  // for when somebody wants it anyway.
  //
  // After that the same line carries the heartbeat. It is not the transcript
  // and it is not a hint; it is the answer to "is it still there", which in a
  // system whose correct behaviour is silence is a question that gets asked.
  function souffOpeningQuiet() {
    return souffOn && souffOnAt != null && (souffClock() - souffOnAt) < souffStartQuiet;
  }
  function souffInterim(text) {
    if (text != null) souffHeardWords = String(text || '').split(/\s+/).filter(Boolean);
    if (!souffHeardEl) return;
    if (!souffOn) { souffHeardEl.hidden = true; return; }
    if (souffShowHeard || souffOpeningQuiet()) {
      souffHeardEl.classList.remove('beat');
      souffHeardEl.textContent = souffHeardWords.slice(-8).join(' ');
      souffHeardEl.hidden = !souffHeardWords.length;
      return;
    }
    souffHeardEl.classList.add('beat');
    souffHeardEl.textContent = souffBeatText();
    souffHeardEl.hidden = false;
  }
  // German, not de-DE. Intl knows the names; the tag is kept beside it when
  // the two differ, because a speaker who set lang: en and is being heard as
  // en-US should be able to see which model is in play.
  function souffLangName() {
    const tag = souffLangTag || 'en';
    // The primary subtag is what gets a name: asking Intl for the whole tag
    // answers "Deutsch (Deutschland)", and with the tag beside it that is the
    // region said three times. The tag stays because it names the model.
    const primary = tag.split('-')[0];
    let name = primary;
    try {
      const dn = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' });
      name = dn.of(primary) || primary;
    } catch (e) { /* an older browser keeps the tag */ }
    if (name.toLowerCase() === tag.toLowerCase()) return tag;
    return name + ' (' + tag + ')';
  }

  function souffBeatText() {
    if (souffState === 'thinking') return 'asking the model…';
    if (souffAskedAt == null) return 'listening';
    const ago = Math.max(0, Math.round(souffClock() - souffAskedAt));
    const when = ago < 90 ? ago + 's ago' : Math.round(ago / 60) + ' min ago';
    return 'asked ' + when + (souffAskCount > 1 ? ' · ' + souffAskCount + ' so far' : '');
  }

  function souffSttState(st) {
    // The first three are the microphone saying it will not work at all, so
    // the switch goes with them: a listening light over a dead ear is worse
    // than no light. The other two are conditions that pass, and the ear
    // restarts itself underneath them.
    if (st === 'denied') { souffEarWhy = 'microphone denied \u2013 allow it in the address bar'; souffStop(false); }
    else if (st === 'no-mic') { souffEarWhy = 'no microphone'; souffStop(false); }
    else if (st === 'stalled') { souffEarWhy = 'recognition keeps stopping'; souffStop(false); }
    else if (st === 'network') { souffEarWhy = 'speech recognition lost the network'; souffPaintBadge(); }
    else if (st === 'error') { souffEarWhy = 'speech recognition stopped with an error'; souffPaintBadge(); }
  }

  // ...and those last two clear themselves. The ear restarts underneath both,
  // so a hiccup that the next sentence disproves used to leave its sentence
  // on the badge for the rest of the talk, over a prompter that was working.
  // A final result is the proof, and it is the only one the ear has.
  function souffEarRecovered() {
    if (souffEarWhy !== 'speech recognition lost the network'
        && souffEarWhy !== 'speech recognition stopped with an error') return;
    souffEarWhy = null;
    souffPaintBadge();
  }

  // Chained, never replaced: the cue cards already own both of these, and
  // the cursor they keep is what the beat below is read from.
  const souffPrevActive = viewHooks.onActiveChange;
  const souffPrevState = viewHooks.onStateChange;
  viewHooks.onActiveChange = () => { souffPrevActive(); souffMoved(); souffCueOnArrival(); };
  viewHooks.onStateChange = () => { souffPrevState(); souffMoved(); };
  function souffMoved() {
    if (!souffOn) return;
    const w = souffWhere();
    if (!w) return;
    if (w.idx === souffLastSent.idx && w.beat === souffLastSent.beat) return;
    souffLastSent = { idx: w.idx, beat: w.beat };
    souffWatch.ask('souffleuse-move', {
      chunkId: w.chunkId, idx: w.idx, beat: w.beat, beats: w.beats, elapsed: souffClock(),
    });
  }


  // The strip is one element in two homes, exactly like the clock: over the
  // stage's bottom edge in the classic arrangement, at the head of the card
  // column under K, with the line of what it is hearing under it.
  // applyCueMode is wrapped rather than edited for the reason the two hooks
  // above are chained - the move belongs to the prompter, and a cockpit built
  // without one must be the cockpit it was before. Wrapped here, it also has
  // to be run once: the cue section restored the saved arrangement while this
  // text did not yet exist.
  function cuePlaceStrip(on) {
    const strip = document.getElementById('psiINT-souffleuse-strip');
    const heard = document.getElementById('psiINT-souffleuse-heard');
    if (!strip) return;
    if (on) {
      cueRoot.insertBefore(strip, cueRail);
      if (heard) cueRoot.insertBefore(heard, cueRail);
    } else {
      stageCell.appendChild(strip);
      if (heard) stageCell.appendChild(heard);
    }
  }
  const souffPrevCueMode = applyCueMode;
  applyCueMode = (on) => { souffPrevCueMode(on); cuePlaceStrip(on); };
  cuePlaceStrip(cueOn());

  // ── the strip: one line, the newest thing said ─────────────────────
  // A glyph for the kind, the words, and a cross. A new hint replaces a
  // standing one without ceremony: the policy in Node has already decided
  // that this one may come, and two of them on the screen at once is the
  // thing the whole design is against.
  // One glyph per kind of the sidecar's KINDS, plus one for a card. The two
  // that are not geometric figures are the two that are about how a sentence
  // is being said rather than what is in it: a pace hint is two chevrons
  // pointing the way the talk is going too fast, and a skipped one is the
  // ellipsis of something left out.
  const SOUFF_GLYPHS = {
    time: '\u25f7', example: '\u25c7', fact: '\u25b3',
    delivery: '\u25cc', pace: '\u226b', skipped: '\u22ef', cue: '\u25a4',
  };
  let souffHint = null;
  let souffHintTimer = null;
  let souffHintFade = null;
  // The last ten, for the panel. Not persisted: it is a record of this
  // talk, and the next run of it is a different talk.
  const souffHistory = [];
  // Which cards are already in that record, by cueId. Separate from the rows
  // because the rows are capped at ten: a card whose row has fallen off the
  // end has still been said once, and a replay must not enter it again.
  const souffCuesLogged = new Set();

  function souffShow(h) {
    if (!souffStrip) return;
    souffHint = h;
    souffStrip.dataset.severity = h.severity === 'high' ? 'high' : 'low';
    souffStripGlyph.textContent = SOUFF_GLYPHS[h.kind] || SOUFF_GLYPHS.delivery;
    souffStripText.textContent = h.text;
    if (souffHintFade) { clearTimeout(souffHintFade); souffHintFade = null; }
    souffStrip.hidden = false;
    // Two frames rather than one: the element has just come back from
    // display: none, and a class set in the same tick has nothing to
    // transition from.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (souffHint === h) souffStrip.classList.add('visible');
    }));
    if (souffHintTimer) clearTimeout(souffHintTimer);
    souffHintTimer = setTimeout(() => souffDismiss('fade'),
      h.fade || (h.severity === 'high' ? 25000 : 15000));
    // A card's arrival is acknowledged on the strip but recorded by
    // souffCueAdd, under the slide it was filed for; entering it twice would
    // put it in the history as a whisper as well as a card.
    if (h.noHistory) return;
    souffHistory.unshift({
      at: elapsedSeconds(), kind: h.kind, text: h.text, hintId: h.hintId, how: null,
    });
    if (souffHistory.length > 10) souffHistory.length = 10;
    souffRenderLog();
  }

  // The strip emptied without the speaker having answered for what was on it:
  // the switch was thrown, here or in Node. No dismissal goes out - there is
  // nobody to tell, and the sidecar's policy hears about a hint leaving the
  // screen from the next hello rather than from a socket that is idle.
  function souffClearHint(how) {
    if (souffHintTimer) { clearTimeout(souffHintTimer); souffHintTimer = null; }
    if (souffHintFade) { clearTimeout(souffHintFade); souffHintFade = null; }
    if (souffHint) {
      const seen = souffHistory.find(x => x.text === souffHint.text && x.how === null);
      if (seen) seen.how = how;
      souffHint = null;
      souffRenderLog();
    }
    if (souffStrip) { souffStrip.classList.remove('visible'); souffStrip.hidden = true; }
  }

  function souffDismiss(how) {
    if (!souffHint || !souffStrip) return false;
    const h = souffHint;
    souffHint = null;
    if (souffHintTimer) { clearTimeout(souffHintTimer); souffHintTimer = null; }
    souffStrip.classList.remove('visible');
    souffHintFade = setTimeout(() => { if (!souffHint) souffStrip.hidden = true; }, 400);
    const seen = souffHistory.find(x => x.text === h.text && x.how === null);
    if (seen) seen.how = how;
    souffRenderLog();
    // A cue shown here in the classic layout is this window's own doing -
    // the sidecar filed it as a card for a slide, not as a hint, and has
    // nothing to record about it going away.
    if (h.hintId) souffWatch.ask('souffleuse-dismiss', { hintId: h.hintId, how });
    return true;
  }

  if (souffStrip) {
    souffStrip.querySelector('.souffleuse-x').addEventListener('click', () => souffDismiss('click'));
  }
  // Esc, after the help panel and the address overlay and before a
  // highlight the lecturer made on purpose. The panel first: it was opened
  // deliberately and is the larger thing in the way.
  viewHooks.escapePrompter = () => {
    if (souffLogEl && !souffLogEl.hidden) { souffShowLog(false); return true; }
    return souffDismiss('esc');
  };

  // ── the history, and the two preferences that live in it ───────────
  function souffLogRow(h) {
    // A card is not dismissed, it is filed - so the column that says how a
    // hint went away says which slide a card went into instead.
    const gone = h.how === 'card' ? 'for ' + escText(h.slide || '')
      : h.how === 'fade' ? 'faded'
      : h.how === 'esc' ? 'Esc'
      : h.how === 'click' ? 'dismissed'
      : h.how === 'off' ? 'switched off'
      : 'standing';
    return '<li><span class="souffleuse-log-at">' + escText(PSI_CARDS.formatClock(h.at)) + '</span>'
      + '<span class="souffleuse-glyph">' + escText(SOUFF_GLYPHS[h.kind] || '') + '</span>'
      + '<span class="souffleuse-log-text">' + escText(h.text) + '</span>'
      + '<span class="souffleuse-log-gone">' + gone + '</span></li>';
  }
  function souffRenderLog() {
    if (!souffLogEl || souffLogEl.hidden) return;
    const list = souffLogEl.querySelector('#psiINT-souffleuse-log-list');
    if (!list) return;
    list.innerHTML = souffHistory.length
      ? souffHistory.map(souffLogRow).join('')
      : '<li class="souffleuse-log-empty">Nothing yet. The usual answer is nothing.</li>';
  }
  function souffShowLog(want) {
    if (!souffLogEl) return;
    souffLogEl.hidden = !want;
    if (want) souffRenderLog();
  }
  if (souffLogEl) {
    souffLogEl.querySelector('header .souffleuse-x')
      .addEventListener('click', () => souffShowLog(false));
    const heardBox = souffLogEl.querySelector('#psiINT-souffleuse-heard-toggle');
    const cuesBox = souffLogEl.querySelector('#psiINT-souffleuse-cues-toggle');
    heardBox.checked = souffShowHeard;
    cuesBox.checked = souffCuesOn;
    cuesBox.disabled = !SOUFFLEUSE.cues;
    heardBox.addEventListener('change', () => {
      souffShowHeard = heardBox.checked;
      try { localStorage.setItem(SOUFF_HEARD_KEY, souffShowHeard ? 'on' : 'off'); } catch (e) {}
      souffInterim(null);
    });
    cuesBox.addEventListener('change', () => {
      souffCuesOn = cuesBox.checked && !!SOUFFLEUSE.cues;
      try { localStorage.setItem(SOUFF_CUES_KEY, souffCuesOn ? 'on' : 'off'); } catch (e) {}
      // Switched off, the cards already laid in go with it: leaving them in
      // the rail while the box says no is the kind of half-answer that gets
      // read as a defect.
      if (!souffCuesOn) { souffleuseCues.clear(); cueSync(); }
      // And the sidecar is told, because the box changes what the model is
      // asked: with it off there are no cue_targets, so nothing is judged, no
      // slide is locked against a second card and nothing enters the
      // duplicate rule. The answer carries the cards it has laid, so ticking
      // the box again brings back what unticking it cleared.
      souffWatch.ask('souffleuse-prefs', { cues: souffCuesOn }).then((r) => {
        if (souffCuesOn && r && r.ok) souffCueReplay(r.cueCards);
      });
    });
  }

  // One card into the Map the rail is drawn from. Returns whether it was new,
  // so the two callers - a card arriving on the socket, and the list that
  // comes back with a hello - can decide once whether to redraw.
  function souffCueAdd(c) {
    if (!souffCuesOn) return false;
    const id = String((c && c.chunkId) || '');
    if (!id || !c.cueId) return false;
    const list = souffleuseCues.get(id) || [];
    if (list.some(x => x.cueId === c.cueId)) return false;
    list.push({ cueId: c.cueId, text: String(c.text || '') });
    souffleuseCues.set(id, list);
    // The history is what the prompter has said, and a card is the other half
    // of that. It used to hold hints alone, so a run in which the prompter
    // laid four cards and whispered nothing read as a prompter that had done
    // nothing at all - and the cards are the part nobody sees until the talk
    // walks onto the slide.
    //
    // Once per card, though, and at the time it was actually laid. The Map is
    // emptied by a reload and by unticking the box, and a replay then
    // legitimately re-adds the card - which used to enter a second row,
    // stamped with the clock at replay time. In a real talk the panel showed
    // one card twice, at 5:55 and at 7:33, for one cue the sidecar had sent
    // once. So the id is remembered separately from the rows (which are
    // capped at ten, and a row that fell off the end must not come back as a
    // new saying), and the time comes from the sidecar, which knows when it
    // laid the card and says so again on a replay.
    if (!souffCuesLogged.has(c.cueId)) {
      souffCuesLogged.add(c.cueId);
      const at = (c.at != null && isFinite(Number(c.at))) ? Number(c.at) : elapsedSeconds();
      souffHistory.unshift({
        at, kind: 'cue', text: String(c.text || ''), cueId: c.cueId,
        hintId: null, how: 'card', slide: souffSlideName(id),
      });
      souffHistory.sort((a, b) => b.at - a.at);
      if (souffHistory.length > 10) souffHistory.length = 10;
      souffRenderLog();
    }
    return true;
  }

  // The cards the sidecar has already laid, handed back by a hello or by a
  // preference change. They live in this window and nowhere else, so a
  // reload - which a --watch rebuild does on every save - lost every one of
  // them while the sidecar went on holding those slides locked against a
  // second card: the slide was spent and the card was gone.
  function souffCueReplay(list) {
    if (!Array.isArray(list)) return;
    let added = 0;
    for (const c of list) if (souffCueAdd(c)) added += 1;
    if (added) cueSync();
  }

  // A card for a slide that is now up, in the arrangement that has no rail
  // to put it in. Shown once, as a hint of its own kind, so both
  // arrangements see what the prompter laid in.
  //
  // The index guard is what makes this one card per arrival rather than one
  // per call: a slide holding two cards shows the first, and the second is
  // read in the rail or in the panel. The late flag is the one caller that
  // has to get past it, and it is the race this used to lose - a card that
  // arrives while the speaker is already walking onto its slide was marked as
  // seen on the way through, so the rail got it and the classic layout got a
  // receipt naming the slide the speaker was standing on. Returns whether
  // anything was shown, which is how that caller chooses between the two.
  let souffCueIdx = -1;
  const souffCuesShown = new Set();
  function souffCueOnArrival(late) {
    if (cueOn() || (!late && state.activeIdx === souffCueIdx)) return false;
    souffCueIdx = state.activeIdx;
    const entry = flatChunks[state.activeIdx];
    if (!entry || !entry.id) return false;
    const cards = souffleuseCues.get(entry.id) || [];
    const fresh = cards.find(c => !souffCuesShown.has(c.cueId));
    if (!fresh) return false;
    souffCuesShown.add(fresh.cueId);
    // No history row: the card is already one of its own, filed under
    // the slide it went into. Showing it on the strip is the rail's job done
    // in an arrangement that has no rail, not a second saying - and this set
    // is per page, so after a reload the same card may legitimately be
    // announced again. **That one is left as it is**: the announcement is
    // owed to the speaker the first time they walk onto the slide, a page
    // that has just loaded cannot know whether they already did, and showing
    // a card that is genuinely on the slide in front of them twice is
    // cheaper than never showing it at all.
    //
    // Twice the standing time of a whisper, and its own figure rather than
    // the high-severity one it would otherwise borrow. A hint is glanced at
    // and a card is read - and in this arrangement the strip is the only place
    // its words stand at all, the panel apart.
    souffShow({
      hintId: null, cueId: fresh.cueId, kind: 'cue', text: fresh.text,
      severity: 'low', noHistory: true, fade: 30000,
    });
    return true;
  }

  // ── what the sidecar says back ─────────────────────────────────────
  souffWatch.on('souffleuse-status', (m) => {
    const st = String((m && m.state) || '');
    // off is the sidecar saying it cannot work at all, and idle is the
    // prompter having been switched off. Both stop the ear; the difference
    // is the badge. off keeps its reason there, because the speaker has to
    // read why; idle is a switch somebody threw and leaves the badge to
    // whatever already stood on it - the whole reason the two reasons are
    // remembered separately.
    //
    // idle used to only set souffState, which left souffOn true and the
    // microphone open: a driver switching the prompter off through the
    // engine's stdin took two presses in the cockpit to undo, and a reload
    // in between said hello and switched the sidecar back on.
    if (st === 'off' || st === 'idle') {
      if (st === 'off') souffSideWhy = 'off \u2013 ' + ((m && m.why) || 'the prompter stopped');
      souffStop(true);
      return;
    }
    if (st === 'error') {
      souffState = 'error';
      souffSideWhy = (m && m.why) || 'the prompter hit an error';
      souffPaintBadge();
      souffPaint();
      return;
    }
    if (st === 'listening' || st === 'thinking') { souffState = st; souffSideWhy = null; }
    // A call going out is the one moment the cockpit can see that the whole
    // chain is alive, so it is what the heartbeat under the strip counts.
    if (st === 'thinking') { souffAskedAt = souffClock(); souffAskCount += 1; }
    souffInterim(null);
    souffPaintBadge();
    souffPaint();
  });

  souffWatch.on('souffleuse-hint', (m) => {
    souffShow({
      hintId: m.hintId,
      kind: String(m.kind || 'delivery'),
      text: String(m.text || ''),
      severity: m.severity === 'high' ? 'high' : 'low',
    });
  });

  souffWatch.on('souffleuse-cue', (m) => {
    // The rail is redrawn from the Map, so a card that arrives while the
    // slide it belongs to is already open appears without a press.
    if (!souffCueAdd(m)) return;
    cueSync();
    // One beat of acknowledgement. A card is laid into a slide still to come,
    // so without this the only sign that the prompter did anything is a row
    // in a panel nobody has open - and the rehearsal checklist told the
    // speaker to look for a card that will not appear until they walk there.
    // Six seconds, low, and never over a hint that is standing: what stands
    // was judged worth interrupting a sentence for, and this is not.
    if (souffHint) return;
    // Unless the slide is the one already up, which is not news about a slide
    // to come: the receipt would name the slide the speaker is standing on.
    // Then it is the arrival announcement, late - and souffCueOnArrival is
    // asked for it rather than souffShow being called here a second way, so
    // one text decides what a card looks like on the strip and enters it in
    // the seen set. In cue-card mode it declines and the rail has it already.
    const here = flatChunks[state.activeIdx];
    if (here && here.id === String((m && m.chunkId) || '')
        && souffCueOnArrival(true)) return;
    souffShow({
      hintId: null, cueId: m.cueId, kind: 'cue', severity: 'low', fade: 6000,
      noHistory: true,
      text: 'card for ' + souffSlideName(String(m.chunkId || '')),
    });
  });

  // The socket reconnects itself; a session does not. After a reconnect the
  // sidecar has no cockpit to whisper to until one says hello, and its idea
  // of the clock is re-stamped from ours when one does.
  souffWatch.onConnect(() => {
    if (!souffOn) return;
    souffHello().then((hi) => {
      if (!hi || !hi.ok || !hi.enabled) {
        // A watcher restarted under this page has a new nonce, and this page
        // keeps the old one until a save reloads it - so the hello comes back
        // refused, and every segment sent after it is refused too. Returning
        // here left the switch pressed, the microphone open and a heartbeat
        // saying listening, which is the failure class this feature has already
        // been caught in twice: a light over a dead ear. So the same thing
        // souffStart does with the same refusal - the reason on the badge, the
        // ear closed, the switch back up.
        souffSideWhy = 'off \u2013 ' + ((hi && hi.why) || 'the watch server is gone');
        souffStop(true);
        return;
      }
      // A hello only registers a socket. The switch has to be sent again,
      // because the watcher may have been restarted under this page and a
      // fresh sidecar starts off - and the preference with it, for the same
      // reason.
      souffWatch.ask('souffleuse-prefs', { cues: souffCuesOn });
      souffWatch.ask('souffleuse-toggle', { on: true });
      souffCueReplay(hi.cueCards);
    });
  });

  // Switched on, and then the page reloaded - which a rebuild does on every
  // save. The permission is still granted for this tab, so recognition
  // starts again; if the browser refuses it without a gesture, the badge
  // says so and the switch stays off.
  let souffWanted = false;
  try { souffWanted = sessionStorage.getItem(SOUFF_ON_KEY) === 'on'; } catch (e) {}
  if (souffWanted) {
    const waitForSocket = (left) => {
      if (souffWatch.ready()) { souffStart(false); return; }
      if (left > 0) setTimeout(() => waitForSocket(left - 1), 200);
    };
    setTimeout(() => waitForSocket(25), 200);
  }
  souffPaint();
}
