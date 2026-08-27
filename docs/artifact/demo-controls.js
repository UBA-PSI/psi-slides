/*
 * The controls under a stepped figure: the two arrows, the beat rail and the
 * play button. It drives the lifted diagram runtime and depends on nothing
 * else - initDiagrams, dgStep and DG_LIST, all of which arrive from the
 * runtime spliced in above it.
 *
 * A file of its own for the reason editor.mjs and editor.css are: read from
 * disk and inlined, so a backtick or a backslash in it means what it says.
 * refresh-figures.mjs splices it into both pages that carry stepped figures -
 * docs/artifact/figures-you-write.html, which is the manual, and
 * docs/site/figures.html, which is the case for the language - so the two
 * cannot drift into two different sets of controls.
 */
// Drives the lifted runtime. dgStep(d, k) renders any beat in either
// direction - stepping back costs nothing, because each beat is recomputed
// from the counter rather than undone.
(function () {
  if (typeof initDiagrams !== 'function') return;
  initDiagrams();
  var slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One control bar, wherever it is: the two live demos and, once opened,
  // any of the fifteen gallery cards.
  function controls(scope, d) {
    var play = scope.querySelector('.play');
    var rail = [].slice.call(scope.querySelectorAll('.rail li'));
    var timer = 0;
    function stop() { clearInterval(timer); timer = 0; if (play) play.textContent = 'play'; }
    function paint() {
      rail.forEach(function (li, i) { li.setAttribute('aria-current', i === d.step ? 'true' : 'false'); });
      scope.querySelectorAll('[data-go]').forEach(function (b) {
        var k = d.step + Number(b.getAttribute('data-go'));
        b.disabled = k < 0 || k > d.data.n - 1;
      });
    }
    function go(k, instant) {
      dgStep(d, Math.max(0, Math.min(d.data.n - 1, k)), instant);
      paint();
    }
    scope.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { stop(); go(d.step + Number(b.getAttribute('data-go'))); });
    });
    rail.forEach(function (li, i) {
      li.querySelector('button').addEventListener('click', function () { stop(); go(i); });
    });
    if (play) play.addEventListener('click', function () {
      if (timer) return stop();
      play.textContent = 'stop';
      if (d.step >= d.data.n - 1) go(0, true);
      timer = setInterval(function () {
        if (d.step >= d.data.n - 1) { stop(); return; }
        go(d.step + 1);
      }, slow ? 1600 : 1150);
    });
    paint();
  }

  document.querySelectorAll('.demo').forEach(function (demo) {
    var svg = demo.querySelector('svg.psi-diagram');
    if (svg && svg.psiDiagram) controls(demo, svg.psiDiagram);
  });

  // A gallery card shows its finished picture until someone opens the source,
  // and only then becomes steppable. Its beat data is marked with
  // a class initDiagrams() does not look for: registering these at load would
  // widen each figure to the frame that holds every beat and rewind it to the
  // first, so fifteen finished pictures would arrive half-drawn.
  function wireCard(card) {
    var svg = card.querySelector('svg.psi-diagram');
    var sc = card.querySelector('script.psi-card-frames');
    if (!svg || !sc || svg.psiDiagram) return;
    var data;
    try { data = JSON.parse(sc.textContent); } catch (e) { return; }
    // The same setup initDiagrams() does for one figure. Repeated rather than
    // called, because that function walks the whole document and would
    // register the two demos a second time.
    if (svg.dataset.liveViewbox) {
      svg.setAttribute('viewBox', svg.dataset.liveViewbox);
      var w = Number(svg.getAttribute('width'));
      var r = Number(svg.dataset.liveRatio);
      if (w && r) svg.setAttribute('height', String(Math.round(w * r)));
    }
    var d = { svg: svg, data: data, step: -1, raf: 0, cur: null, cache: {}, hint: null };
    svg.psiDiagram = d;
    if (typeof DG_LIST !== 'undefined') DG_LIST.push(d);
    // Open on the beat the closed card was showing, so nothing jumps.
    dgStep(d, data.n - 1, true);
    card.classList.add('steppable');
    controls(card, d);
  }

  document.querySelectorAll('figure.card details.src').forEach(function (det) {
    det.addEventListener('toggle', function () {
      if (det.open) wireCard(det.closest('figure.card'));
    });
  });
})();
