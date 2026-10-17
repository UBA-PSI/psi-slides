
(() => {
  const SEL = 'figure.figure-img, figure.figure-diagram, main pre, main .math-display';
  const MIN = 0.5, MAX = 8, K = 0.01, STEP = 12, QUIET = 160;
  const box = document.createElement('div');
  box.id = 'psiINT-lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  document.body.appendChild(box);
  document.body.classList.add('lb-ready');
  let card = null, scale = 1, pan = { x: 0, y: 0 }, quiet = 0, opener = null;
  const apply = () => {
    if (card) card.style.transform = 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + scale + ')';
  };
  const zoomAt = (factor, at) => {
    if (!card) return;
    const next = Math.max(MIN, Math.min(MAX, scale * factor));
    const r = next / scale;
    if (r !== 1 && at) {
      const b = card.getBoundingClientRect();
      pan = { x: pan.x + (1 - r) * (at.x - (b.left + b.width / 2)),
              y: pan.y + (1 - r) * (at.y - (b.top + b.height / 2)) };
    }
    scale = next;
    apply();
  };
  const open = (el) => {
    opener = el;
    card = el.cloneNode(true);
    card.removeAttribute('id');
    card.classList.add('lb-card');
    card.style.transform = '';
    // A picture would start the browser's own drag of the image, which ends
    // the pan after its first move.
    for (const i of card.querySelectorAll('img')) i.draggable = false;
    box.replaceChildren(card);
    scale = 1; pan = { x: 0, y: 0 };
    apply();
    document.body.classList.add('lb-open');
    box.setAttribute('tabindex', '-1');
    box.focus({ preventScroll: true });
    box.dispatchEvent(new CustomEvent('lb:open', { detail: { card, opener } }));
  };
  const close = () => {
    if (!card) return;
    card = null;
    box.replaceChildren();
    document.body.classList.remove('lb-open', 'lb-dragging', 'lb-zooming');
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    const was = opener;
    opener = null;
    box.dispatchEvent(new CustomEvent('lb:close', { detail: { opener: was } }));
  };
  box.addEventListener('lb:dismiss', close);
  document.addEventListener('click', (e) => {
    if (card) return;
    if (e.defaultPrevented || e.button !== 0) return;
    // A link inside a figure or a selection being made stays what it was.
    if (e.target.closest('a, video, iframe, button')) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    const el = e.target.closest(SEL);
    if (!el || el.closest('#psiINT-lightbox')) return;
    e.preventDefault();
    open(el);
  });
  box.addEventListener('wheel', (e) => {
    if (!card) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    dy = Math.max(-STEP, Math.min(STEP, dy));
    document.body.classList.add('lb-zooming');
    clearTimeout(quiet);
    quiet = setTimeout(() => document.body.classList.remove('lb-zooming'), QUIET);
    zoomAt(Math.exp(-dy * K), { x: e.clientX, y: e.clientY });
  }, { passive: false });
  // Pointer events cover mouse, pen and touch; two fingers on a touchscreen
  // pinch, one drags. A press that never moves more than 3 px is a click,
  // and a click closes.
  const pts = new Map();
  let drag = null, pinch = null;
  box.addEventListener('pointerdown', (e) => {
    if (!card) return;
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      drag = null;
      document.body.classList.add('lb-zooming');
    } else if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) zoomAt((pinch.s * d / pinch.d) / scale, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true;
      document.body.classList.add('lb-dragging');
    }
    if (!drag.moved) return;
    pan = { x: drag.px + dx, y: drag.py + dy };
    apply();
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) { pinch = null; document.body.classList.remove('lb-zooming'); }
      // The finger left behind drags on from where it is, and must not count
      // as a click on its way up.
      if (pts.size === 1) {
        const [p] = [...pts.values()];
        drag = { x: p.x, y: p.y, px: pan.x, py: pan.y, moved: true };
      }
      return;
    }
    const d = drag;
    drag = null;
    document.body.classList.remove('lb-dragging');
    if (d && !d.moved && e.type === 'pointerup'
        && box.dispatchEvent(new CustomEvent('lb:click', { cancelable: true, detail: { x: e.clientX, y: e.clientY } }))) close();
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  document.addEventListener('keydown', (e) => {
    if (!card || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, null);
    else if (e.key === '-' || e.key === '_') zoomAt(0.8, null);
    else if (e.key === '0') { scale = 1; pan = { x: 0, y: 0 }; apply(); }
    else return;
    e.preventDefault();
  });
})();
