/* Trust Wallet — client hardening. Runs before the gate. */
(function () {
  'use strict';
  try {
    var host = location.hostname || '';
    var DEV_HOSTS = ['localhost', '127.0.0.1'];
    var EDITOR_HOSTS = ['lovable.dev', 'lovableproject.com'];
    var isEditor = EDITOR_HOSTS.some(function (h) { return host.indexOf(h) !== -1; });
    var isDev = DEV_HOSTS.indexOf(host) !== -1;
    if (isDev || isEditor) return; // never blank in dev / Lovable editor
  } catch (e) {}

  var blanked = false;
  function purge() {
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(';').forEach(function (c) {
        var k = c.split('=')[0].trim();
        if (k) document.cookie = k + '=;expires=' + new Date(0).toUTCString() + ';path=/';
      });
    } catch (e) {}
    try {
      if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function (dbs) {
          (dbs || []).forEach(function (d) { try { indexedDB.deleteDatabase(d.name); } catch (e) {} });
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function blank(reason) {
    if (blanked) return; blanked = true;
    try { document.documentElement.innerHTML = '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;width:100vw;height:100vh"></body>'; } catch (e) {}
    purge();
    if (window.console && console.warn) console.warn(reason);
    setTimeout(function () { try { location.replace('about:blank'); } catch (e) {} }, 50);
  }

  // ----- Mobile-only enforcement -----
  var ua = navigator.userAgent || '';
  var uaMobile = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua);
  var touch = (navigator.maxTouchPoints || 0) > 1;
  var coarse = false; try { coarse = matchMedia('(pointer:coarse)').matches; } catch (e) {}
  var mobile = uaMobile || (touch && coarse);
  if (!mobile) { blank('pc'); return; }

  // ----- DevTools heuristics (desktop should already be blanked, but defense-in-depth) -----
  function sizeCheck() {
    try {
      var wDiff = window.outerWidth - window.innerWidth;
      var hDiff = window.outerHeight - window.innerHeight;
      if (wDiff > 220 || hDiff > 240) blank('sz');
    } catch (e) {}
  }
  function timingCheck() {
    try {
      var t = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t > 120) blank('dbg');
    } catch (e) {}
  }
  setInterval(sizeCheck, 1500);
  setInterval(timingCheck, 4000);

  // ----- Block dev shortcuts -----
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toUpperCase();
    if (k === 'F12') { e.preventDefault(); blank('f12'); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) {
      e.preventDefault(); blank('sk'); return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'U') { e.preventDefault(); blank('vu'); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'S') { e.preventDefault(); }
  }, true);

  // ----- Block context menu (right-click reveals view-source) -----
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);

  try { Object.freeze(window.TrustShield = { v: 2 }); } catch (e) {}
})();
