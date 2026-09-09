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
    // Where the bar names a file rather than a role, the name is part of what
    // the switch changes: the handout pair is print.html and print-notes.html,
    // and a bar that kept saying one of them while showing the other would be
    // the exact confusion this switch was added to remove. The hero's bar says
    // "what the reader gets", carries no data-name, and is left alone.
    var name = fig.querySelector('.bar > b');
    var buttons = Array.prototype.slice.call(group.querySelectorAll('button'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        img.src = btn.getAttribute('data-src');
        img.alt = btn.getAttribute('data-alt') || '';
        if (name && btn.getAttribute('data-name')) name.textContent = btn.getAttribute('data-name');
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

  /* ── the three ways, as a chooser ──────────────────────────────────────
   * A lecture holds three kinds of text, and there are three ways that ends:
   * everything on the slides, slides plus a second document, or psi-slides.
   *
   * The section used to be all three at once - three paragraphs of prose and
   * three stacked drawings, with the clause you pointed at lighting up its
   * row. That read on a desktop and failed on a phone: the column stacks, so
   * the drawing answering the sentence you were reading sat three paragraphs
   * below it. Then it was one drawing switched by the clauses, which fixed
   * the height and left the three paragraphs standing.
   *
   * Now the text switches with the drawing. One option is on screen at a
   * time, its words and its picture together, and the tabs carry the
   * judgement - "not ideal", "our approach" - that the prose used to make.
   *
   * The tab labels are read out of the markup, not written here: without
   * scripting the three options stand in order with those labels as headings,
   * and the section still argues in three moves. The switch is the
   * enhancement, never the content.
   */
  (function ways() {
    var box = document.querySelector('.ways');
    if (!box) return;
    var opts = Array.prototype.slice.call(box.querySelectorAll('.way'));
    if (opts.length < 2) return;

    var tabs = document.createElement('div');
    tabs.className = 'way-tabs';
    tabs.setAttribute('role', 'tablist');
    var buttons = opts.map(function (opt) {
      var label = opt.querySelector('.way-label');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label ? label.textContent : opt.getAttribute('data-tie');
      btn.setAttribute('data-tie', opt.getAttribute('data-tie'));
      btn.setAttribute('role', 'tab');
      tabs.appendChild(btn);
      return btn;
    });
    box.parentNode.insertBefore(tabs, box);
    box.classList.add('is-switched');

    function show(key) {
      opts.forEach(function (opt) {
        opt.classList.toggle('is-shown', opt.getAttribute('data-tie') === key);
      });
      buttons.forEach(function (btn) {
        var on = btn.getAttribute('data-tie') === key;
        btn.classList.toggle('is-tied', on);
        btn.setAttribute('aria-selected', String(on));
      });
    }
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () { show(btn.getAttribute('data-tie')); });
    });

    /* Opens on the state a reader already knows - everything poured onto the
       slides - so the argument is made rather than assumed. Opening on the
       answer spends it before the question is asked. */
    show(opts[0].getAttribute('data-tie'));
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
