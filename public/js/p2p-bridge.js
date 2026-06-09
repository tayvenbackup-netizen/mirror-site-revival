/* Cross-app P2P bridge: send to + poll from TrueLedger (and any compatible app). */
(function () {
  const TL_URL = 'https://dncjsaecabpltoceyryi.supabase.co';
  const TL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuY2pzYWVjYWJwbHRvY2V5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjQwNTUsImV4cCI6MjA5MzUwMDA1NX0.hxfyxtM4-W-JuWdc1mBmn-RUfPycloYl16XkxwGkcBw';
  const TL_API = TL_URL + '/functions/v1/p2p';
  const SEEN_KEY = 'tw_bridge_seen_v1';
  const SKEY = 'tw_gate_session_v1';

  // ── Deterministic per-coin address derivation (SHA-256 of session token + symbol) ──
  const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const HEXCH  = '0123456789abcdef';

  function getSessionToken() {
    try {
      const s = JSON.parse(localStorage.getItem(SKEY) || 'null');
      return s && s.session_token ? String(s.session_token) : '';
    } catch { return ''; }
  }
  async function sha256Bytes(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buf);
  }
  function bytesToHex(b) {
    let s = ''; for (let i = 0; i < b.length; i++) s += HEXCH[b[i] >> 4] + HEXCH[b[i] & 15];
    return s;
  }
  function bytesToCharset(b, charset, len) {
    let s = '';
    for (let i = 0; i < len; i++) s += charset[b[i % b.length] % charset.length];
    return s;
  }
  function base58Encode(bytes) {
    let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    const digits = [0];
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let out = '';
    for (let i = 0; i < zeros; i++) out += BASE58[0];
    for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]];
    return out;
  }
  async function deriveAddress(token, sym, chain) {
    const seed = String(token || '') + '|' + String(sym || '').toUpperCase() + '|' + String(chain || '').toLowerCase();
    const h = await sha256Bytes(seed);
    const hex = bytesToHex(h);
    switch ((chain || '').toLowerCase()) {
      case 'btc':  return 'bc1q' + bytesToCharset(h, BECH32, 38);
      case 'eth':
      case 'bnb':
      case 'avax':
      case 'base': return '0x' + hex.slice(0, 40);
      case 'trx':  return 'T' + bytesToCharset(h, BASE58, 33);
      case 'sol':  return base58Encode(h).slice(0, 44);
      case 'xrp':  return 'r' + bytesToCharset(h, BASE58, 33);
      case 'xlm':  return 'G' + bytesToCharset(h, BASE58, 55).toUpperCase();
      case 'ton':  return 'UQ' + bytesToCharset(h, BASE58, 46);
      default:     return '0x' + hex.slice(0, 40);
    }
  }
  const COINS = [
    ['BTC','btc'], ['ETH','eth'], ['BNB','bnb'], ['SOL','sol'], ['TRX','trx'],
    ['AVAX','avax'], ['TON','ton'], ['USDT','trx'], ['USDC','eth'],
    ['TWT','bnb'], ['HEX','eth'], ['MSVP','bnb'], ['STRX','trx'],
    ['XRP','xrp'], ['XLM','xlm'],
  ];
  let ADDR_CACHE = {};
  let ADDR_TOKEN = '';
  async function rebuildAddresses() {
    const token = getSessionToken();
    if (!token) { ADDR_CACHE = {}; ADDR_TOKEN = ''; return; }
    if (token === ADDR_TOKEN && Object.keys(ADDR_CACHE).length) return;
    const out = {};
    for (const [sym, chain] of COINS) {
      try { out[sym + '_' + chain] = await deriveAddress(token, sym, chain); } catch {}
    }
    ADDR_CACHE = out; ADDR_TOKEN = token;
    try { window.dispatchEvent(new CustomEvent('tw:addresses', { detail: out })); } catch {}
  }
  window.TW_GET_ADDRESSES = function () { return { ...ADDR_CACHE }; };
  window.TW_DERIVE_ADDRESS = deriveAddress;
  rebuildAddresses();
  window.addEventListener('tw:session', () => { ADDR_TOKEN = ''; rebuildAddresses(); });

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
