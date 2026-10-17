
(() => {
  const body = document.body;
  const nav = document.getElementById('psiINT-reader-contents');
  const main = document.querySelector('main');
  if (!nav || !main) return;
  const toggle = document.querySelector('.rd-toggle');
  const links = [...nav.querySelectorAll('a[data-rd], a.rd-part')];
  const targets = links.map(a => document.getElementById(a.dataset.rd || (a.getAttribute('href') || '').slice(1)));
  const groups = [...nav.querySelectorAll('.rd-group')];
  const handOpen = new Set();
  let reading = null, handClosed = null;
  const fold = () => {
    for (const g of groups) {
      const b = g.querySelector('.rd-fold');
      const on = !!b && (handOpen.has(g) || (g === reading && handClosed !== g));
      g.classList.toggle('is-open', on);
      if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  };
  const overlay = window.matchMedia('(max-width: __PSI_READER_WIDE_BELOW__px)');
  let tops = [], current = null, stale = true, queued = false, placed = false;

  const measure = () => {
    const y = window.scrollY;
    tops = targets.map(t => t ? t.getBoundingClientRect().top + y : Infinity);
  };
  // Keep the marked entry inside the list's own scroll box - near an edge as
  // the reader scrolls, in the middle when the sidebar is opened over the
  // page. Adjusts the box and never the page, which scrollIntoView would
  // also move.
  const list = nav.querySelector('.rd-list') || nav;
  const reveal = (a, centre) => {
    if (!a) return;
    const n = list.getBoundingClientRect(), r = a.getBoundingClientRect();
    if (centre) { list.scrollTop += (r.top + r.bottom) / 2 - (n.top + n.bottom) / 2; return; }
    const pad = 48;
    if (r.top < n.top + pad) list.scrollTop += r.top - n.top - pad;
    else if (r.bottom > n.bottom - pad) list.scrollTop += r.bottom - n.bottom + pad;
  };
  const mark = () => {
    const y = window.scrollY, h = window.innerHeight;
    const atFoot = y + h >= document.documentElement.scrollHeight - 2;
    const line = atFoot ? y + h - 1 : y + h * 0.3;
    let idx = -1;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= line) idx = i;
    const next = idx >= 0 ? links[idx] : null;
    if (next === current) return;
    if (current) current.removeAttribute('aria-current');
    if (next) next.setAttribute('aria-current', 'location');
    const g = next && next.closest('.rd-group');
    if (g !== reading) { reading = g || null; handClosed = null; fold(); }
    // The first entry marked is centred - a page opened at a #hash or
    // restored half-way down - and every later one only kept in view.
    current = next;
    reveal(current, !placed);
    if (current) placed = true;
  };
  const schedule = (remeasure) => {
    if (remeasure) stale = true;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (stale) { measure(); stale = false; }
      mark();
    });
  };
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.rd-fold');
    if (!b) return;
    const g = b.closest('.rd-group');
    if (g.classList.contains('is-open')) {
      handOpen.delete(g);
      if (g === reading) handClosed = g;
    } else {
      handOpen.add(g);
      if (handClosed === g) handClosed = null;
    }
    fold();
  });
  window.addEventListener('scroll', () => schedule(false), { passive: true });
  window.addEventListener('resize', () => schedule(true));
  window.addEventListener('load', () => schedule(true));
  if (window.ResizeObserver) new ResizeObserver(() => schedule(true)).observe(main);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => schedule(true));
  schedule(true);

  // ── the sidebar over the page, below the wide layout ──
  const isOpen = () => body.classList.contains('rd-open');
  const setOpen = (on, refocus) => {
    body.classList.toggle('rd-open', on);
    if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      // Opened over the page, the part being read is open whatever the
      // reader did to it the last time.
      if (handClosed) { handClosed = null; fold(); }
      reveal(current, true);
      const first = current || nav.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    } else if (refocus && toggle) {
      toggle.focus({ preventScroll: true });
    }
  };
  if (toggle) toggle.addEventListener('click', () => setOpen(!isOpen(), false));
  const closer = nav.querySelector('.rd-close');
  if (closer) closer.addEventListener('click', () => setOpen(false, true));
  nav.addEventListener('click', (e) => {
    if (isOpen() && e.target.closest('a')) setOpen(false, false);
  });
  document.addEventListener('click', (e) => {
    if (!isOpen() || e.target.closest('#psiINT-reader-contents, .rd-toggle')) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false, true);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); setOpen(false, true); }
  });
  const onWidth = () => { if (!overlay.matches && isOpen()) setOpen(false, false); };
  if (overlay.addEventListener) overlay.addEventListener('change', onWidth);
})();
