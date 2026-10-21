/*
 * CC AI SOLUTIONS – page behaviour (scroll colours, mobile menu, FAQ).
 * Same logic as the approved design; moved out of the design editor so the
 * page runs as a normal website. No secrets in this file.
 */
(function () {
  'use strict';

  /* Section colour zones, top to bottom (one per [data-zone] wrapper). */
  var ZONES = [
      { name: 'Porcelain', dark: false, bg: '#FFFFFF', ink: '#0E1220', muted: '#4A5163', line: 'rgba(14,18,32,0.12)', lineStrong: 'rgba(14,18,32,0.35)', eyebrow: '#9A3412', card: '#FFFFFF', inv: '#FFFFFF' },
      { name: 'Mist',      dark: false, bg: '#E8EEF7', ink: '#0E1220', muted: '#444C5E', line: 'rgba(14,18,32,0.12)', lineStrong: 'rgba(14,18,32,0.35)', eyebrow: '#9A3412', card: '#FFFFFF', inv: '#FFFFFF' },
      { name: 'Sage',      dark: false, bg: '#E2F0EA', ink: '#0B1A15', muted: '#3F5249', line: 'rgba(11,26,21,0.12)', lineStrong: 'rgba(11,26,21,0.35)', eyebrow: '#0F6B55', card: '#FFFFFF', inv: '#FFFFFF' },
      { name: 'Cobalt',    dark: true,  bg: '#1C3272', ink: '#F5F7FF', muted: '#C9D4F2', line: 'rgba(255,255,255,0.16)', lineStrong: 'rgba(255,255,255,0.45)', eyebrow: '#F2B544', card: 'rgba(255,255,255,0.06)', inv: '#0E1220' },
      { name: 'Lavender',  dark: false, bg: '#EDEAF8', ink: '#121027', muted: '#4A4863', line: 'rgba(18,16,39,0.12)', lineStrong: 'rgba(18,16,39,0.35)', eyebrow: '#5236B8', card: '#FFFFFF', inv: '#FFFFFF' },
      { name: 'Midnight',  dark: true,  bg: '#0B1430', ink: '#F3F5FB', muted: '#A9B4D0', line: 'rgba(255,255,255,0.12)', lineStrong: 'rgba(255,255,255,0.4)', eyebrow: '#F2B544', card: 'rgba(255,255,255,0.04)', inv: '#0B1430' },
      { name: 'Stone',     dark: false, bg: '#F4F2EE', ink: '#15140F', muted: '#4D4A42', line: 'rgba(21,20,15,0.12)', lineStrong: 'rgba(21,20,15,0.35)', eyebrow: '#9A3412', card: '#FFFFFF', inv: '#FFFFFF' },
      { name: 'Indigo',    dark: true,  bg: '#3A33B0', ink: '#FFFFFF', muted: '#DCDAF7', line: 'rgba(255,255,255,0.2)', lineStrong: 'rgba(255,255,255,0.55)', eyebrow: '#FFD27A', card: 'rgba(255,255,255,0.08)', inv: '#3A33B0' },
      { name: 'Ink',       dark: true,  bg: '#080C1A', ink: '#EEF1F8', muted: '#98A2BC', line: 'rgba(255,255,255,0.1)', lineStrong: 'rgba(255,255,255,0.35)', eyebrow: '#F2B544', card: 'rgba(255,255,255,0.04)', inv: '#080C1A' }
    ];
  var TRANSITION = 'background-color 120ms linear, --ink 260ms ease, --muted 260ms ease, --line 260ms ease, --line-strong 260ms ease, --eyebrow 260ms ease, --card 260ms ease, --inv 260ms ease';
  var TOKEN_VARS = {
    ink: '--ink', muted: '--muted', line: '--line', lineStrong: '--line-strong',
    eyebrow: '--eyebrow', card: '--card', inv: '--inv'
  };

  var root = document.querySelector('[data-cc-root]');
  if (!root) return;

  /* ---------- Scroll-driven background ---------- */
  var tok = 0, bgNow = '', holds = null, maxScroll = 1, viewH = 1, dirty = true, raf = 0;

  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

  function applyTokens(i) {
    var z = ZONES[i];
    for (var k in TOKEN_VARS) root.style.setProperty(TOKEN_VARS[k], z[k]);
  }
  function setBg(bg) {
    if (bg === bgNow) return;
    bgNow = bg;
    root.style.setProperty('--bg', bg);
  }

  function measure() {
    var el = document.scrollingElement || document.documentElement;
    var top = window.scrollY || el.scrollTop;
    var vh = window.innerHeight;

    if (dirty || !holds) {
      dirty = false;
      var nodes = document.querySelectorAll('[data-zone]');
      var n = Math.min(nodes.length, ZONES.length);
      holds = [];
      for (var i = 0; i < n; i++) {
        var r = nodes[i].getBoundingClientRect();
        var zt = r.top + top, zb = r.bottom + top;
        var pad = Math.min(vh * 0.2, (zb - zt) * 0.25);
        var hs = zt + pad, he = zb - pad;
        if (i === 0) { hs = -Infinity; he = 0; }   // hero blends from the first pixel
        if (i === n - 1) he = Infinity;            // footer holds to the end
        if (he < hs) { var mid = (hs + he) / 2; hs = mid; he = mid; }
        holds.push([hs, he]);
      }
      maxScroll = Math.max(1, el.scrollHeight - vh);
      viewH = vh;
    }
    var count = holds.length;
    if (!count) return;
    var probe = top + viewH * Math.min(1, top / maxScroll);

    var a = 0, b = 0, t = 0;
    for (var j = 0; j < count; j++) {
      if (probe <= holds[j][1]) {
        if (j > 0 && probe < holds[j][0]) {
          a = j - 1; b = j;
          t = (probe - holds[j - 1][1]) / Math.max(1, holds[j][0] - holds[j - 1][1]);
        } else { a = j; b = j; t = 0; }
        break;
      }
    }
    t = Math.min(1, Math.max(0, t));
    t = t * t * (3 - 2 * t); // smoothstep
    var za = ZONES[a], zb = ZONES[b];
    var ca = rgb(za.bg), cb = rgb(zb.bg);
    var mixed = ca.map(function (c, k) { return Math.round(c + (cb[k] - c) * t); });
    setBg('rgb(' + mixed.join(', ') + ')');

    var next = t < 0.5 ? a : b;
    if (za.dark !== zb.dark) {
      var L = lum(mixed);
      next = contrast(L, lum(rgb(za.ink))) >= contrast(L, lum(rgb(zb.ink))) ? a : b;
    }
    if (next !== tok) { tok = next; applyTokens(tok); }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; measure(); });
  }
  function invalidate() { dirty = true; schedule(); }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(invalidate).observe(root);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(invalidate);

  /* Reduced motion: colours still follow the scroll, without easing. */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function applyMotion() { root.style.transition = (mq && mq.matches) ? 'none' : TRANSITION; }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyMotion);
  applyMotion();
  measure();

  /* ---------- Mobile menu ---------- */
  var burger = document.querySelector('.cc-burger');
  var menu = document.getElementById('cc-mobile-menu');
  if (burger && menu) {
    var iconOpen = burger.querySelector('[data-cc-icon="open"]');
    var iconClose = burger.querySelector('[data-cc-icon="close"]');
    var setMenu = function (open, returnFocus) {
      menu.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      // SVG elements have no .hidden property, so toggle the attribute directly.
      if (iconOpen) { if (open) iconOpen.setAttribute('hidden', ''); else iconOpen.removeAttribute('hidden'); }
      if (iconClose) { if (open) iconClose.removeAttribute('hidden'); else iconClose.setAttribute('hidden', ''); }
      if (returnFocus) burger.focus();
      invalidate();
    };
    var onKey = function (e) {
      if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setMenu(false, true); }
    };
    burger.addEventListener('click', function () { setMenu(menu.hidden, false); });
    burger.addEventListener('keydown', onKey);
    menu.addEventListener('keydown', onKey);
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setMenu(false, false);
    });
  }

  /* ---------- FAQ accordion (one answer open at a time) ---------- */
  var faqButtons = Array.prototype.slice.call(document.querySelectorAll('[data-cc-faq]'));
  function setFaq(btn, open) {
    var answer = document.getElementById(btn.getAttribute('aria-controls'));
    var icon = btn.querySelector('[aria-hidden="true"]');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (answer) answer.hidden = !open;
    if (icon) icon.textContent = open ? '−' : '+';
  }
  faqButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wasOpen = btn.getAttribute('aria-expanded') === 'true';
      faqButtons.forEach(function (other) { setFaq(other, false); });
      if (!wasOpen) setFaq(btn, true);
      invalidate();
    });
  });
})();
