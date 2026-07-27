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

  /* ── the other language ────────────────────────────────────────────────
   * There used to be a scripted bar here, offering the other language when
   * navigator.language disagreed with the page. Both pages now carry the
   * pointer in the mark line above the headline, and a banner saying the same
   * thing on top of it read as a cookie notice.
   *
   * The static link is also the better instrument. It shows for everybody,
   * where the scripted bar could only fire on a language mismatch, and the
   * mismatch is exactly what navigator.language gets wrong: for a lot of
   * academics it reports English on a German desk. It needs no dismissal, so
   * it needs no localStorage.
   *
   * What is still deliberately absent is a redirect. A shared URL has to keep
   * leading where it points, or the person who sent it and the person who
   * opens it are looking at different pages, and a jump overrules a reader
   * who has already chosen.
   */

  /* ── the three sheets ──────────────────────────────────────────────────
   * Two ways in, one state. The sheets are the operable control and carry
   * the keyboard path; the three phrases in the prose are a shortcut for a
   * pointer, and are deliberately not buttons - they are the sentence, and
   * putting three tab stops inside a paragraph would make the sentence worse
   * to read with a screen reader for a picture that repeats what it says.
   *
   * Hovering previews, clicking holds. Leaving a sheet falls back to whatever
   * is held rather than to nothing, or a click would be undone by the mouse
   * moving two pixels off the edge.
   */
  (function sheets() {
    var stack = document.querySelector('.sheets');
    if (!stack) return;
    var buttons = Array.prototype.slice.call(stack.querySelectorAll('.sheet'));
    var cues = Array.prototype.slice.call(document.querySelectorAll('.kind-cue'));
    var held = null;

    function paint(kind) {
      stack.classList.toggle('is-picked', !!kind);
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-kind') === kind;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      cues.forEach(function (c) {
        c.classList.toggle('is-on', c.getAttribute('data-kind') === kind);
      });
    }
    function preview(kind) { paint(kind || held); }

    buttons.forEach(function (b) {
      var kind = b.getAttribute('data-kind');
      b.addEventListener('mouseenter', function () { preview(kind); });
      b.addEventListener('mouseleave', function () { preview(null); });
      b.addEventListener('focus', function () { preview(kind); });
      b.addEventListener('blur', function () { preview(null); });
      b.addEventListener('click', function () {
        held = held === kind ? null : kind;
        paint(held);
      });
    });
    cues.forEach(function (c) {
      var kind = c.getAttribute('data-kind');
      c.addEventListener('mouseenter', function () { preview(kind); });
      c.addEventListener('mouseleave', function () { preview(null); });
    });

    /* One nudge, the first time the stack is on screen, to say the pieces
     * come apart. Once: a thing that moves every time you scroll past is a
     * thing you end up scrolling past faster. */
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if ((still && still.matches) || !window.IntersectionObserver) return;
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      io.disconnect();
      stack.classList.add('is-hinting');
      setTimeout(function () { stack.classList.remove('is-hinting'); }, 1100);
    }, { threshold: 0.4 });
    io.observe(stack);
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
