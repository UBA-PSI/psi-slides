/*
 * Two small behaviours for the project site. No dependencies and no build
 * step: the page it enhances is a hand-written file, and a bundler for
 * sixty lines would be its own kind of joke on a tool that ships static
 * HTML.
 *
 * Everything here degrades to something sensible if the script never runs:
 * the toggle's default image is already in the markup, and a screenshot
 * without a lightbox is still a screenshot.
 */
(function () {
  'use strict';

  /* ── the hero's second view ────────────────────────────────────────────
   * "What the reader gets" has two honest answers: the same slide with the
   * abridgement switched off, and the document that falls out of the same
   * file. The second one is the actual point of the tool, so it gets a
   * switch rather than a third picture in a row that nobody scrolls to.
   */
  Array.prototype.forEach.call(document.querySelectorAll('.shot .swap'), function (group) {
    var fig = group.closest('.shot');
    var img = fig && fig.querySelector('img');
    if (!img) return;
    var buttons = Array.prototype.slice.call(group.querySelectorAll('button'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        img.src = btn.getAttribute('data-src');
        img.alt = btn.getAttribute('data-alt') || '';
      });
    });
  });

  /* ── the other-language hint ───────────────────────────────────────────
   * GitHub Pages serves static files: no Accept-Language, no server-side
   * redirect. The tempting fix is a script that reads navigator.language and
   * jumps. This does not, for three reasons that outlive the convenience:
   *
   *   - a shared URL has to keep leading where it points, or the person who
   *     sent it and the person who opens it are looking at different pages;
   *   - navigator.language is the interface language, which for a lot of
   *     academics is English on a German desk, so it guesses badly;
   *   - it overrules a reader who has already chosen, and a redirect is
   *     hard to argue with.
   *
   * So: offer, once, and remember the answer.
   */
  (function languageHint() {
    var alt = document.querySelector('link[rel=alternate][hreflang]:not([hreflang=x-default])');
    if (!alt) return;
    var pageLang = (document.documentElement.lang || 'en').slice(0, 2);
    var wanted = (navigator.language || '').slice(0, 2).toLowerCase();
    if (!wanted || wanted === pageLang) return;
    var target = document.querySelector('link[rel=alternate][hreflang^="' + wanted + '"]');
    if (!target) return;
    try {
      if (localStorage.getItem('psi-slides:lang-hint') === 'off') return;
    } catch (e) { /* private mode: show it, just do not remember */ }

    var copy = wanted === 'de'
      ? { text: 'Diese Seite gibt es auch auf Deutsch.', link: 'Zur deutschen Fassung', close: 'Nein, danke' }
      : { text: 'This page is also available in English.', link: 'Go to the English version', close: 'No thanks' };

    var bar = document.createElement('div');
    bar.className = 'langhint';
    bar.lang = wanted;
    var inner = document.createElement('div');
    inner.className = 'langhint-in';
    var p = document.createElement('p');
    p.textContent = copy.text + ' ';
    var a = document.createElement('a');
    a.href = target.getAttribute('href');
    a.hreflang = wanted;
    a.textContent = copy.link;
    p.appendChild(a);
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = copy.close;
    close.addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem('psi-slides:lang-hint', 'off'); } catch (e) { /* ignore */ }
    });
    inner.appendChild(p);
    inner.appendChild(close);
    bar.appendChild(inner);
    // Under the university bar, above the page: it belongs to the site, not
    // to the article.
    var topbar = document.querySelector('.topbar');
    if (topbar && topbar.parentNode) topbar.parentNode.insertBefore(bar, topbar.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  })();

  /* ── the narrow-width menu ─────────────────────────────────────────────
   * The <details> opens, closes, and is keyboard-operable on its own. Two
   * things it does not do are what everyone expects from a menu: Escape, and
   * clicking somewhere else. Both are added here, so the markup still works
   * with scripting off and only the manners are progressive.
   */
  var menu = document.querySelector('.topbar-menu');
  if (menu) {
    document.addEventListener('click', function (ev) {
      if (menu.open && !menu.contains(ev.target)) menu.open = false;
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && menu.open) {
        menu.open = false;
        var summary = menu.querySelector('summary');
        if (summary) summary.focus();
      }
    });
  }

  /* ── lightbox ──────────────────────────────────────────────────────────
   * The shots are laid out between a third and a half of the size they were
   * captured at, which is enough to see the shape of a slide and not enough
   * to read one. A click shows the pixels that were actually taken.
   */
  var box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.tabIndex = -1;
  box.appendChild(document.createElement('img'));
  var boxImg = box.firstChild;
  boxImg.alt = '';
  document.body.appendChild(box);

  function open(img) {
    // currentSrc, not src: it is what the browser actually chose to paint.
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt;
    box.hidden = false;
    document.body.classList.add('lightbox-open');
    box.focus();
  }

  function close() {
    if (box.hidden) return;
    box.hidden = true;
    boxImg.removeAttribute('src');
    document.body.classList.remove('lightbox-open');
  }

  Array.prototype.forEach.call(document.querySelectorAll('figure.shot img'), function (img) {
    // The image becomes the control, so it needs to be reachable and
    // operable without a mouse.
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.addEventListener('click', function () { open(img); });
    img.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(img); }
    });
  });

  box.addEventListener('click', close);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') close();
  });
})();
