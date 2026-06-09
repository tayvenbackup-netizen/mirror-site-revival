// Client-side hardening: PC detection, devtools detection, anti-tampering.
const _w = window as any;

export function isMobileDevice(): boolean {
  const ua = navigator.userAgent || '';
  const uaMob = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua);
  const touch = (navigator.maxTouchPoints || 0) > 1;
  const coarse = matchMedia('(pointer:coarse)').matches;
  return uaMob || (touch && coarse);
}

let blanked = false;
function blank(reason: string) {
  if (blanked) return;
  blanked = true;
  try {
    document.documentElement.innerHTML = '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;width:100vw;height:100vh"></body>';
  } catch {}
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  try { document.cookie.split(';').forEach(c => { document.cookie = c.split('=')[0] + '=;expires=' + new Date(0).toUTCString() + ';path=/'; }); } catch {}
  try {
    const idb = (window as any).indexedDB;
    if (idb && typeof idb.databases === 'function') {
      idb.databases().then((dbs: any[]) => {
        (dbs || []).forEach((d: any) => { try { idb.deleteDatabase(d.name); } catch {} });
      }).catch(() => {});
    }
  } catch {}
  console.warn(reason);
  setTimeout(() => { try { location.replace('about:blank'); } catch {} }, 50);
}

export function installDevtoolsShield() {
  try {
    if (import.meta.env.DEV) return;
    const host = location.hostname;
    if (host.includes('lovableproject.com') || host.includes('lovable.dev') || host === 'localhost' || host === '127.0.0.1') return;
  } catch {}

  const mobile = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini|webOS/i.test(navigator.userAgent || '')
    || ((navigator.maxTouchPoints || 0) > 1 && matchMedia('(pointer:coarse)').matches);

  if (!mobile) { blank('pc'); return; }

  if (!mobile) {
    const sizeCheck = () => {
      const wDiff = window.outerWidth - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      if (wDiff > 220 || hDiff > 240) blank('sz');
    };
    setInterval(sizeCheck, 1500);
  }

  // Defense-in-depth: debugger-timing devtools detector
  setInterval(() => {
    try {
      const t = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t > 120) blank('dbg');
    } catch {}
  }, 4000);

  window.addEventListener('keydown', e => {
    const k = e.key?.toUpperCase();
    if (k === 'F12') { e.preventDefault(); blank('f12'); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) { e.preventDefault(); blank('sk'); }
    if ((e.ctrlKey || e.metaKey) && k === 'U') { e.preventDefault(); blank('vu'); }
    if ((e.ctrlKey || e.metaKey) && k === 'S') { e.preventDefault(); }
  }, true);

  window.addEventListener('contextmenu', e => e.preventDefault(), true);
  Object.freeze(_w.TrustShield = { v: 2 });
}