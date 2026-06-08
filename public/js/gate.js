/* Trust Wallet Access Gate (vanilla) */
(function () {
  const SUPABASE_URL = 'https://evnnztbtmzxvagdxgxdn.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bm56dGJ0bXp4dmFnZHhneGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTAzNzQsImV4cCI6MjA5NjUyNjM3NH0.7lzYZZWfV4AwxB0I5iUePIld2lW5zMQIKpcej6MK2-s';
  const API = SUPABASE_URL + '/functions/v1/validate-key';
  const SKEY = 'tw_gate_session_v1';
  const FP_KEY = 'tw_gate_fp_v1';

  function fp() {
    let v = localStorage.getItem(FP_KEY);
    if (v) return v;
    const sig = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(), navigator.hardwareConcurrency || '',
      navigator.platform || '', navigator.maxTouchPoints || ''].join('|');
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < sig.length; i++) { const c = sig.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    v = (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(FP_KEY, v); return v;
  }
  const DEVICE_FP = fp();

  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch {}

  async function api(action, body) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ action, ...(body || {}) }),
    });
    const t = await r.text();
    let d = {}; try { d = t ? JSON.parse(t) : {}; } catch { d = { error: t }; }
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }

  function saveSession(s) { session = s; localStorage.setItem(SKEY, JSON.stringify(s)); }
  function clearSession() { session = null; localStorage.removeItem(SKEY); }

  // ---------- DOM ----------
  function hideWallet() {
    const root = document.getElementById('root');
    if (root) root.style.visibility = 'hidden';
  }
  function showWallet() {
    const root = document.getElementById('root');
    if (root) root.style.visibility = 'visible';
  }

  function buildGate() {
    if (document.getElementById('gateRoot')) return;
    const el = document.createElement('div');
    el.id = 'gateRoot';
    el.innerHTML = `
      <div class="gate-card">
        <div class="gate-logo">
          <svg viewBox="0 0 48 48" width="56" height="56"><path fill="#1ce783" d="M24 4 8 10v12c0 9.4 6.6 18.2 16 22 9.4-3.8 16-12.6 16-22V10L24 4z"/><path fill="#0b1418" d="M24 12 14 16v8c0 6 4 11.5 10 14 6-2.5 10-8 10-14v-8L24 12z"/></svg>
        </div>
        <h1>Trust Wallet</h1>
        <p class="gate-sub">Enter your access key to continue</p>
        <input id="gateKey" type="password" placeholder="Access key" autocomplete="off" spellcheck="false" />
        <button id="gateSubmit">Unlock</button>
        <div id="gateErr" class="gate-err"></div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#gateSubmit').addEventListener('click', submit);
    el.querySelector('#gateKey').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => el.querySelector('#gateKey').focus(), 100);
  }
  function removeGate() { const el = document.getElementById('gateRoot'); if (el) el.remove(); }

  async function submit() {
    const inp = document.getElementById('gateKey');
    const btn = document.getElementById('gateSubmit');
    const err = document.getElementById('gateErr');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      const d = await api('validate', { key: inp.value, device_fingerprint: DEVICE_FP });
      if (d.valid) { saveSession(d); removeGate(); afterAuth(d); }
      else throw new Error(d.error || 'Invalid');
    } catch (e) {
      err.textContent = e.message; btn.disabled = false; btn.textContent = 'Unlock';
    }
  }

  async function boot() {
    hideWallet();
    if (session?.session_token) {
      try {
        const d = await api('check_session', { session_token: session.session_token });
        if (d.valid) { saveSession(d); afterAuth(d); return; }
      } catch {}
      clearSession();
    }
    buildGate();
  }

  function startHeartbeat() {
    setInterval(async () => {
      if (!session?.session_token) return;
      try { const d = await api('session_heartbeat', { session_token: session.session_token }); if (d.revoked) { clearSession(); location.reload(); } } catch {}
    }, 30000);
  }

  function afterAuth(d) {
    window.__TW_GATE__ = d;
    window.TW_SESSION = d;
    showWallet();
    startHeartbeat();
    try { window.dispatchEvent(new CustomEvent('tw:session', { detail: d })); } catch {}
    deliverPendingTransfers(d);
  }
  async function deliverPendingTransfers(d) {
    const list = Array.isArray(d?.pending_transfers) ? d.pending_transfers : [];
    if (!list.length) return;
    const applied = [];
    for (const t of list) {
      try {
        if (typeof window.TW_APPLY_TRANSFER === 'function') window.TW_APPLY_TRANSFER(t);
        applied.push(t.id);
      } catch {}
    }
    if (applied.length) {
      try { await api('ack_transfers', { session_token: session.session_token, ids: applied }); } catch {}
    }
  }
  window.TW_P2P_SEND = async function (payload) {
    if (!session?.session_token) throw new Error('Not authenticated');
    return await api('p2p_send', { session_token: session.session_token, ...payload });
  };
  window.TW_GET_ADDRESSES = function () { return session?.addresses || {}; };

  // ---------- Admin panel ----------
  function buildAdmin() {
    if (document.getElementById('adminOverlay')) { document.getElementById('adminOverlay').style.display = 'flex'; return; }
    const ov = document.createElement('div');
    ov.id = 'adminOverlay';
    ov.innerHTML = `
      <div class="adm-panel">
        <div class="adm-head">
          <h2>Admin Panel</h2>
          <button id="admClose">×</button>
        </div>
        <div class="adm-gate">
          <p>Enter admin password</p>
          <input id="admPwd" type="password" placeholder="Admin password" />
          <button id="admUnlock">Unlock</button>
          <div id="admPwdErr" class="gate-err"></div>
        </div>
        <div class="adm-body" style="display:none">
          <div class="adm-create">
            <h3>Create Key</h3>
            <input id="admNewName" placeholder="Name (optional)" />
            <input id="admNewValue" placeholder="Custom value (optional, blank = random)" />
            <select id="admNewType">
              <option value="daily">Daily</option>
              <option value="3day">3-Day</option>
              <option value="weekly" selected>Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="lifetime">Lifetime</option>
            </select>
            <button id="admCreate">Create</button>
            <div id="admCreated" class="adm-created"></div>
          </div>
          <div class="adm-list">
            <h3>Keys</h3>
            <div id="admKeys"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#admClose').onclick = () => ov.style.display = 'none';
    ov.querySelector('#admUnlock').onclick = unlockAdmin;
    ov.querySelector('#admPwd').addEventListener('keydown', e => { if (e.key === 'Enter') unlockAdmin(); });
    ov.querySelector('#admCreate').onclick = createKey;
    setTimeout(() => ov.querySelector('#admPwd').focus(), 100);
  }

  async function unlockAdmin() {
    const pwd = document.getElementById('admPwd').value;
    const err = document.getElementById('admPwdErr');
    err.textContent = '';
    if (pwd !== 'ascend2trusted') { err.textContent = 'Invalid password'; return; }
    if (!session?.is_admin) { err.textContent = 'Admin session required'; return; }
    document.querySelector('#adminOverlay .adm-gate').style.display = 'none';
    document.querySelector('#adminOverlay .adm-body').style.display = 'block';
    await loadKeys();
  }

  async function loadKeys() {
    const box = document.getElementById('admKeys');
    box.innerHTML = 'Loading…';
    try {
      const d = await api('admin_list_keys', { session_token: session.session_token });
      if (!d.keys?.length) { box.innerHTML = '<div class="adm-empty">No keys yet.</div>'; return; }
      box.innerHTML = d.keys.map(k => `
        <div class="adm-row" data-id="${k.id}">
          <div class="adm-row-main">
            <div class="adm-row-name">${escapeHtml(k.key_name || '—')} <span class="adm-row-tag">${k.key_type}</span> ${k.is_revoked ? '<span class="adm-row-rev">revoked</span>' : ''}</div>
            <div class="adm-row-meta">${escapeHtml(k.key_value || k.key_preview)} · ${k.expires_at ? 'exp ' + new Date(k.expires_at).toLocaleDateString() : 'never'} · sessions ${k.session_count}</div>
          </div>
          <div class="adm-row-act">
            <button data-act="clear">Clear device</button>
            <button data-act="${k.is_revoked ? 'unrevoke' : 'revoke'}">${k.is_revoked ? 'Unrevoke' : 'Revoke'}</button>
            <button data-act="delete" class="danger">Delete</button>
          </div>
        </div>`).join('');
      box.querySelectorAll('.adm-row').forEach(row => {
        row.querySelectorAll('button[data-act]').forEach(btn => {
          btn.addEventListener('click', () => keyAction(row.dataset.id, btn.dataset.act));
        });
      });
    } catch (e) { box.innerHTML = '<div class="gate-err">' + e.message + '</div>'; }
  }

  async function keyAction(id, act) {
    const map = { clear: 'admin_clear_device', revoke: 'admin_revoke_key', unrevoke: 'admin_unrevoke_key', delete: 'admin_delete_key' };
    if (act === 'delete' && !confirm('Delete this key permanently?')) return;
    try { await api(map[act], { session_token: session.session_token, key_id: id }); await loadKeys(); } catch (e) { alert(e.message); }
  }

  async function createKey() {
    const name = document.getElementById('admNewName').value.trim();
    const value = document.getElementById('admNewValue').value.trim();
    const type = document.getElementById('admNewType').value;
    const out = document.getElementById('admCreated');
    try {
      const d = await api('admin_create_key', { session_token: session.session_token, key_name: name || null, key_value: value || null, key_type: type });
      out.innerHTML = `Created: <code>${escapeHtml(d.plaintext)}</code>`;
      document.getElementById('admNewName').value = '';
      document.getElementById('admNewValue').value = '';
      await loadKeys();
    } catch (e) { out.innerHTML = '<span class="gate-err">' + e.message + '</span>'; }
  }

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Public hooks
  window.TW_OPEN_ADMIN = function () { buildAdmin(); };
  window.TW_IS_ADMIN = function () { return !!session?.is_admin; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (session?.session_token) startHeartbeat();
})();