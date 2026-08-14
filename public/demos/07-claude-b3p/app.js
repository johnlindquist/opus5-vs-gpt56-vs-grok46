/* Kinetic Poster Foundry — editor shell.
 * Owns the DOM controls, the animation loop, input, and PNG export.
 * All simulation and drawing lives in engine.js.
 */
(function () {
  'use strict';

  var Engine = window.KPFEngine;
  var $ = function (id) { return document.getElementById(id); };

  var view = $('view');
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(mq && mq.matches);

  var foundry = Engine.createFoundry({
    stage: view,
    makeCanvas: function (w, h) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    },
    reducedMotion: reduced,
    viewportWidth: function () { return window.innerWidth || 1600; }
  });

  var els = {
    phrase: $('phrase'), fontStack: $('fontStack'), layout: $('layout'), align: $('align'),
    margin: $('margin'), density: $('density'), stiffness: $('stiffness'), damping: $('damping'),
    trail: $('trail'), glow: $('glow'), palette: $('palette'), marks: $('marks'),
    status: $('posterStatus'), pausedBadge: $('pausedBadge'), rmBadge: $('rmBadge'),
    exportBtn: $('export'), resetBtn: $('reset'), pauseBtn: $('pause'), collapse: $('collapse'),
    panelBody: $('panelBody'), hint: $('hint')
  };
  var outs = {
    margin: $('marginOut'), density: $('densityOut'), stiffness: $('stiffnessOut'),
    damping: $('dampingOut'), trail: $('trailOut'), glow: $('glowOut')
  };

  var paused = false;

  /* ------------------------------------------------------------- ui sync */

  function syncControlsFromState() {
    var s = foundry.state;
    els.phrase.value = s.phrase;
    els.fontStack.value = s.fontStack;
    els.layout.value = s.layout;
    els.align.value = s.align;
    els.margin.value = String(Math.round(s.margin * 100));
    els.density.value = String(s.density);
    els.stiffness.value = String(s.stiffness);
    els.damping.value = String(s.damping);
    els.trail.value = String(s.trail);
    els.glow.value = String(s.glow);
    els.palette.value = s.palette;
    els.marks.checked = !!s.marks;
    syncOutputs();
    var buttons = document.querySelectorAll('.preset');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(Number(buttons[i].dataset.preset) === s.preset));
    }
  }

  function syncOutputs() {
    var s = foundry.state;
    outs.margin.value = Math.round(s.margin * 100) + '%';
    outs.density.value = Number(s.density).toFixed(2) + '×';
    outs.stiffness.value = Number(s.stiffness).toFixed(3);
    outs.damping.value = Number(s.damping).toFixed(3);
    outs.trail.value = Number(s.trail).toFixed(2);
    outs.glow.value = Number(s.glow).toFixed(2);
  }

  function describe() {
    var info = foundry.info();
    var s = foundry.state;
    var phrase = info.empty ? 'no phrase' : '“' + info.lines.join(' / ') + '”';
    var msg = 'Phrase ' + phrase + ' · preset ' + info.preset +
      ' · ' + foundry.presets[s.preset].key + ' · ' + info.nodes + ' nodes / ' +
      info.links + ' links · type size ' + info.size + 'px';
    if (info.reduced) msg += ' · reduced motion';
    var warn = '';
    if (info.empty) warn = 'Empty phrase — poster shows crop marks only.';
    else if (String(s.phrase).length >= 140) warn = 'Phrase clipped to 140 characters.';
    else if (info.lines.length > 2 && s.layout !== 'single') warn = 'Long phrase wrapped to ' + info.lines.length + ' lines.';
    els.status.textContent = msg + (warn ? ' — ' + warn : '');
    els.status.classList.toggle('warn', !!warn);
    view.setAttribute('aria-label',
      'Kinetic poster canvas. ' + msg + '. Drag to twist the type, release for a ripple.');
  }

  function push(patch) {
    if (reduced && patch.trail != null) patch.trail = Math.min(patch.trail, 0.12);
    foundry.setState(patch);
    syncOutputs();
    describe();
  }

  /* ------------------------------------------------------------ controls */

  var phraseTimer = 0;
  els.phrase.addEventListener('input', function () {
    // Debounced so typing never triggers a rebuild per keystroke; the DOM is
    // untouched, so focus and caret position survive.
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(function () { push({ phrase: els.phrase.value }); }, 140);
  });

  els.fontStack.addEventListener('change', function () { push({ fontStack: els.fontStack.value }); });
  els.layout.addEventListener('change', function () { push({ layout: els.layout.value }); });
  els.align.addEventListener('change', function () { push({ align: els.align.value }); });
  els.palette.addEventListener('change', function () { push({ palette: els.palette.value }); });
  els.marks.addEventListener('change', function () { push({ marks: els.marks.checked }); });

  els.margin.addEventListener('input', function () { push({ margin: Number(els.margin.value) / 100 }); });
  els.density.addEventListener('input', function () { push({ density: Number(els.density.value) }); });
  els.stiffness.addEventListener('input', function () { push({ stiffness: Number(els.stiffness.value) }); });
  els.damping.addEventListener('input', function () { push({ damping: Number(els.damping.value) }); });
  els.trail.addEventListener('input', function () { push({ trail: Number(els.trail.value) }); });
  els.glow.addEventListener('input', function () { push({ glow: Number(els.glow.value) }); });

  function selectPreset(i) {
    foundry.applyPreset(i);
    if (reduced) foundry.setState({ trail: Math.min(foundry.state.trail, 0.12) });
    syncControlsFromState();
    describe();
  }

  var presetButtons = document.querySelectorAll('.preset');
  for (var b = 0; b < presetButtons.length; b++) {
    (function (btn) {
      btn.addEventListener('click', function () { selectPreset(Number(btn.dataset.preset)); });
    })(presetButtons[b]);
  }

  els.resetBtn.addEventListener('click', function () { foundry.rest(); });
  els.pauseBtn.addEventListener('click', function () { setPaused(!paused); });

  els.collapse.addEventListener('click', function () {
    var open = els.panelBody.hasAttribute('hidden');
    if (open) els.panelBody.removeAttribute('hidden'); else els.panelBody.setAttribute('hidden', '');
    els.collapse.setAttribute('aria-expanded', String(open));
    els.collapse.textContent = open ? 'hide' : 'show';
  });

  function setPaused(v) {
    paused = v;
    els.pausedBadge.hidden = !v;
    els.pauseBtn.setAttribute('aria-pressed', String(v));
    els.pauseBtn.textContent = v ? 'Resume (P)' : 'Pause (P)';
  }

  /* -------------------------------------------------------------- export */

  els.exportBtn.addEventListener('click', function () {
    // The visible canvas *is* the 1600x900 poster stage, so this exports exactly
    // the current local canvas state with no editor chrome in it.
    var done = function (url, revoke) {
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kinetic-poster-' + foundry.presets[foundry.state.preset].key + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    };
    if (view.toBlob) {
      view.toBlob(function (blob) {
        if (!blob) { done(view.toDataURL('image/png'), false); return; }
        done(URL.createObjectURL(blob), true);
      }, 'image/png');
    } else {
      done(view.toDataURL('image/png'), false);
    }
    els.status.textContent = 'Exported 1600×900 PNG. ' + els.status.textContent;
  });

  /* ------------------------------------------------------------- pointer */

  function toPoster(e) {
    var r = view.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (e.clientX - r.left) * (foundry.POSTER_W / r.width),
      y: (e.clientY - r.top) * (foundry.POSTER_H / r.height)
    };
  }

  view.addEventListener('pointermove', function (e) {
    var p = toPoster(e);
    if (p) foundry.movePointer(p.x, p.y);
  });
  view.addEventListener('pointerdown', function (e) {
    var p = toPoster(e);
    if (!p) return;
    view.setPointerCapture && view.setPointerCapture(e.pointerId);
    foundry.pointerDown(p.x, p.y);
    view.focus({ preventScroll: true });
  });
  function release(e) {
    if (e && e.pointerId != null && view.releasePointerCapture && view.hasPointerCapture && view.hasPointerCapture(e.pointerId)) {
      view.releasePointerCapture(e.pointerId);
    }
    foundry.pointerUp();
  }
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);
  view.addEventListener('pointerleave', function (e) { release(e); foundry.pointerLeave(); });
  view.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ------------------------------------------------------------ keyboard */

  window.addEventListener('keydown', function (e) {
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      if (tag === 'BUTTON') return;
      e.preventDefault();
      foundry.impulse();
      return;
    }
    var k = e.key.toLowerCase();
    if (k === 'r') { foundry.rest(); }
    else if (k === 'p') { setPaused(!paused); }
    else if (k >= '1' && k <= '4') { selectPreset(Number(k) - 1); }
  });

  /* ---------------------------------------------------------------- loop */

  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 16.6667;
    last = ts;
    if (paused) return;
    if (!isFinite(dt) || dt <= 0) dt = 1;
    foundry.step(Math.min(dt, 2.2));
    foundry.render();
  }
  requestAnimationFrame(frame);

  /* -------------------------------------------------------------- resize */

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    // Poster space is fixed; only the node budget depends on screen size.
    resizeTimer = setTimeout(function () { foundry.rebuild(); describe(); }, 220);
  });

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) {
      reduced = e.matches;
      els.rmBadge.hidden = !reduced;
      foundry.setReducedMotion(reduced);
      if (reduced) push({ trail: 0.12 });
      syncControlsFromState();
      describe();
    });
  }

  /* ---------------------------------------------------------------- boot */

  if (reduced) {
    els.rmBadge.hidden = false;
    foundry.setState({ trail: 0.12 });
  }
  syncControlsFromState();
  describe();
})();
