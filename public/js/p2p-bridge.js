/* Cross-app P2P bridge: send to + poll from TrueLedger (and any compatible app). */
(function () {
  const TL_URL = 'https://dncjsaecabpltoceyryi.supabase.co';
  const TL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuY2pzYWVjYWJwbHRvY2V5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjQwNTUsImV4cCI6MjA5MzUwMDA1NX0.hxfyxtM4-W-JuWdc1mBmn-RUfPycloYl16XkxwGkcBw';
  const TL_API = TL_URL + '/functions/v1/p2p';
  const SEEN_KEY = 'tw_bridge_seen_v1';

  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } }
  function saveSeen(arr) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-500))); } catch {} }

  async function call(body) {
    const r = await fetch(TL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': TL_ANON, 'Authorization': 'Bearer ' + TL_ANON },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    try { return t ? JSON.parse(t) : {}; } catch { return {}; }
  }

  function myAddresses() {
    const out = new Set();
    try {
      const a = (typeof window.TW_GET_ADDRESSES === 'function') ? window.TW_GET_ADDRESSES() : {};
      Object.values(a || {}).forEach(v => v && out.add(String(v)));
    } catch {}
    return Array.from(out);
  }

  // Send: forward to TrueLedger network so any matching address (in either app) credits.
  window.TW_BRIDGE_SEND = async function (payload) {
    try {
      const coin = String(payload.sym || payload.coin || '').toLowerCase();
      const to_address = String(payload.to_address || payload.toAddr || '').trim();
      const amount = Number(payload.amount);
      const from_address = String(payload.from_address || payload.fromAddr || '').trim() || null;
      if (!coin || !to_address || !(amount > 0)) return;
      const client_nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      await call({ action: 'send', coin, to_address, amount, from_address, memo: payload.memo || '', client_nonce });
    } catch {}
  };

  async function pollOnce() {
    const addrs = myAddresses();
    if (!addrs.length) return;
    try {
      const d = await call({ action: 'poll', addresses: addrs });
      const list = Array.isArray(d?.deposits) ? d.deposits : [];
      if (!list.length) return;
      const seen = new Set(loadSeen());
      const fresh = list.filter(x => x && x.id && !seen.has(x.id));
      if (!fresh.length) return;
      fresh.forEach(x => {
        try {
          if (typeof window.TW_APPLY_TRANSFER === 'function') {
            window.TW_APPLY_TRANSFER({
              id: x.id,
              sym: String(x.coin || '').toUpperCase(),
              amount: Number(x.amount),
              from_address: x.from_address || '',
            });
          } else if (window.TW_NOTIFY) {
            window.TW_NOTIFY.notifyReceived(String(x.coin || '').toUpperCase(), Number(x.amount), x.from_address || '');
          }
          seen.add(x.id);
        } catch {}
      });
      saveSeen(Array.from(seen));
    } catch {}
  }

  // Poll every 4s once a session exists.
  setInterval(pollOnce, 4000);
  // First pass shortly after load.
  setTimeout(pollOnce, 1500);
  window.addEventListener('tw:session', () => setTimeout(pollOnce, 500));
})();
