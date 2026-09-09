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

  /* ── the diagram and the sentences it draws ────────────────────────────
   * Each row of the diagram is one clause of the argument: the slide that
   * fills up, the second document that stops matching, and psi-slides.
   *
   * It used to draw all three at once and dim two of them when you pointed at
   * a clause, which meant the section always carried three stacked drawings -
   * eight hundred pixels of picture for three sentences of text, and on a
   * phone the row being talked about could be a screen away from the sentence
   * talking about it. It shows ONE row now, and the clause you pick is the
   * one drawn. Same wiring, a third of the height, and the answer arrives
   * where the question was asked.
   *
   * Click, not hover: a hover-only switch has no answer on a touchscreen, and
   * this is now the only way to reach two of the three rows. So the clauses
   * become real controls - focusable, Enter and Space - and a row of tabs is
   * added above the drawing for a reader who is not reading the sentences.
   *
   * With scripting off the markup is untouched: all three rows stand, stacked,
   * exactly as they did before. The switch is the enhancement, not the
   * content.
   */
  (function ties() {
    var paths = document.querySelector('.paths');
    if (!paths) return;
    var rows = Array.prototype.slice.call(paths.querySelectorAll('.path'));
    var clauses = Array.prototype.slice.call(document.querySelectorAll('.tie'));
    if (rows.length < 2 || !clauses.length) return;

    var tabs = document.createElement('div');
    tabs.className = 'path-tabs';
    tabs.setAttribute('role', 'tablist');
    var buttons = rows.map(function (row) {
      var cap = row.querySelector('figcaption');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = cap ? cap.textContent : row.getAttribute('data-tie');
      btn.setAttribute('data-tie', row.getAttribute('data-tie'));
      btn.setAttribute('role', 'tab');
      tabs.appendChild(btn);
      return btn;
    });
    paths.parentNode.insertBefore(tabs, paths);
    paths.classList.add('is-switched');

    function show(key) {
      rows.forEach(function (row) {
        row.classList.toggle('is-shown', row.getAttribute('data-tie') === key);
      });
      buttons.concat(clauses).forEach(function (el) {
        var on = el.getAttribute('data-tie') === key;
        el.classList.toggle('is-tied', on);
        el.setAttribute('aria-pressed', String(on));
        if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', String(on));
      });
    }

    clauses.forEach(function (el) {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
      });
    });
    buttons.concat(clauses).forEach(function (el) {
      el.addEventListener('click', function () { show(el.getAttribute('data-tie')); });
    });

    /* The first row is the state a reader already knows - everything poured
       onto the slides - so the section opens on the problem and the two
       clauses after it move the picture on. Opening on the answer would
       spend the argument before it is made. */
    show(rows[0].getAttribute('data-tie'));
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
