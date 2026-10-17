
  let bfEl = null;
  const bfPaint = () => {
    if (!bfEl) return;
    const here = !window.psiBuildBannerHere || window.psiBuildBannerHere();
    bfEl.hidden = !here || bfEl.hasAttribute('data-dismissed');
  };
  window.psiBuildBannerRefresh = bfPaint;
  const bfShow = (why, detailed) => {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => bfShow(why, detailed), { once: true });
      return;
    }
    let byEditor = false;
    if (detailed && window.psiWatchBuildFailed) {
      try { byEditor = window.psiWatchBuildFailed(why || 'the rebuild failed') === true; } catch (err) { /* ignore */ }
    }
    if (!bfEl) {
      bfEl = document.createElement('div');
      bfEl.id = 'psiINT-build-failed';
      bfEl.setAttribute('role', 'status');
      bfEl.title = 'Click to hide. It goes by itself when a build succeeds.';
      bfEl.addEventListener('click', () => { bfEl.setAttribute('data-dismissed', ''); bfPaint(); });
      document.body.appendChild(bfEl);
    }
    let first = detailed ? String(why || '').split('\n')[0].trim() : '';
    if (first.length > 240) first = first.slice(0, 239) + '…';
    const head = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = first ? 'The rebuild failed: ' : 'The rebuild failed.';
    head.append(strong, first);
    const soft = document.createElement('div');
    soft.className = 'bf-soft';
    soft.textContent = (first ? '' : 'The terminal says why. ') + 'This page still shows the last good build.';
    bfEl.replaceChildren(head, soft);
    bfEl.classList.toggle('by-editor', byEditor);
    bfEl.removeAttribute('data-dismissed');
    bfPaint();
  };
  // A watch reload: the live views stash where they are first (psiWatchResume
  // in runtime/audience.js), so the page comes back on the same chunk and beat.
  const bfReload = () => {
    try { if (window.psiWatchResumeSave) window.psiWatchResumeSave(); } catch (err) { /* ignore */ }
    location.reload();
  };