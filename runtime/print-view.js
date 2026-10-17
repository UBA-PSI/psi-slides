
(() => {
  const d = document.documentElement;
  const box = document.querySelector('.rd-view');
  if (!box) return;
  const KEYS = { scheme: '__PSI_PRINT_PREF_KEYS_SCHEME__', face: '__PSI_PRINT_PREF_KEYS_FACE__' };
  const authoredFace = document.body.getAttribute('data-print-body') === 'sans' ? 'sans' : 'serif';
  const store = (k, v) => {
    try { if (v) localStorage.setItem(KEYS[k], v); else localStorage.removeItem(KEYS[k]); } catch (e) { /* this tab only */ }
  };
  const paint = () => {
    const scheme = d.getAttribute('data-scheme') || 'auto';
    const face = d.getAttribute('data-face') || authoredFace;
    for (const b of box.querySelectorAll('[data-set-scheme]')) b.setAttribute('aria-pressed', String(b.getAttribute('data-set-scheme') === scheme));
    for (const b of box.querySelectorAll('[data-set-face]')) b.setAttribute('aria-pressed', String(b.getAttribute('data-set-face') === face));
  };
  const apply = (attr, v) => { if (v) d.setAttribute(attr, v); else d.removeAttribute(attr); };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const scheme = b.getAttribute('data-set-scheme');
    const face = b.getAttribute('data-set-face');
    if (scheme) {
      const v = scheme === 'auto' ? null : scheme;
      apply('data-scheme', v);
      store('scheme', v);
    } else if (face) {
      apply('data-face', face);
      store('face', face);
    }
    paint();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.scheme) apply('data-scheme', e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : null);
    else if (e.key === KEYS.face) apply('data-face', e.newValue === 'serif' || e.newValue === 'sans' ? e.newValue : null);
    else return;
    paint();
  });
  paint();
})();
