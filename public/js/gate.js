/* Trust Wallet Access Gate — refined UI + richer admin panel */
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
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'x-device-fingerprint': DEVICE_FP,
      },
      body: JSON.stringify({ action, device_fingerprint: DEVICE_FP, ...(body || {}) }),
    });
    const t = await r.text();
    let d = {}; try { d = t ? JSON.parse(t) : {}; } catch { d = { error: t }; }
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }

  function saveSession(s) { session = s; localStorage.setItem(SKEY, JSON.stringify(s)); }
  function clearSession() { session = null; localStorage.removeItem(SKEY); }

  function hideWallet() { const r = document.getElementById('root'); if (r) r.style.visibility = 'hidden'; }
  function showWallet() { const r = document.getElementById('root'); if (r) r.style.visibility = 'visible'; }

  // ---------- Server-side bundle loader ----------
  let __bundleLoaded = false;
  async function loadAppBundle() {
    if (__bundleLoaded) return true;
    if (!session?.session_token) return false;
    try {
      const r = await fetch(SUPABASE_URL + '/functions/v1/get-app-bundle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'x-session-token': session.session_token,
          'x-device-fingerprint': DEVICE_FP,
        },
        body: JSON.stringify({ session_token: session.session_token, device_fingerprint: DEVICE_FP }),
      });
      if (!r.ok) throw new Error('bundle http ' + r.status);
      const b = await r.json();
      if (!b || !b.html || !b.css || !b.js) throw new Error('bundle invalid');
      // Inject CSS
      if (!document.getElementById('twAppCss')) {
        const st = document.createElement('style');
        st.id = 'twAppCss';
        st.textContent = b.css;
        document.head.appendChild(st);
      }
      // Inject HTML into #root
      const root = document.getElementById('root');
      if (root) root.innerHTML = b.html;
      // Patch DOMContentLoaded so late-registered handlers still fire
      const _origAdd = document.addEventListener.bind(document);
      document.addEventListener = function (type, fn, opts) {
        if (type === 'DOMContentLoaded') {
          if (document.readyState !== 'loading') {
            try { setTimeout(function () { try { fn({ type: 'DOMContentLoaded' }); } catch (e) { console.error(e); } }, 0); } catch (e) {}
            return;
          }
        }
        return _origAdd(type, fn, opts);
      };
      // Execute JS bundle in global scope
      try { (0, eval)(b.js); } catch (e) { console.error('bundle exec', e); }
      // Re-dispatch readiness events so any window-level listeners also fire
      try { window.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) {}
      try { window.dispatchEvent(new Event('load')); } catch (e) {}
      // Restore original addEventListener after a tick
      setTimeout(function () { document.addEventListener = _origAdd; }, 200);
      __bundleLoaded = true;
      return true;
    } catch (e) {
      console.error('bundle load failed', e);
      return false;
    }
  }
  function unloadAppBundle() {
    __bundleLoaded = false;
    const root = document.getElementById('root');
    if (root) root.innerHTML = '';
    const st = document.getElementById('twAppCss');
    if (st) st.remove();
  }

  // ---------- Gate UI ----------
  function buildGate() {
    if (document.getElementById('gateRoot')) return;
    const el = document.createElement('div');
    el.id = 'gateRoot';
    el.innerHTML = `
      <div class="g-bg">
        <div class="g-orb g-orb-a"></div>
        <div class="g-orb g-orb-b"></div>
        <div class="g-grid"></div>
      </div>
      <div class="g-card" role="dialog" aria-labelledby="gTitle">
        <div class="g-logo-wrap">
          <div class="g-logo-ring"></div>
          <div class="g-logo">
            <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
              <defs>
                <linearGradient id="gShield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#5ff7a8"/>
                  <stop offset="1" stop-color="#0ea5e9"/>
                </linearGradient>
              </defs>
              <path fill="url(#gShield)" d="M32 4 9 12v18c0 13 9.6 24.7 23 28 13.4-3.3 23-15 23-28V12L32 4z"/>
              <path fill="#0a1015" d="M32 14 17 19v11c0 8.6 6.3 16.3 15 18.7 8.7-2.4 15-10.1 15-18.7V19L32 14z"/>
              <path fill="#5ff7a8" d="M24.5 31.5 30 37l10-10.5-2-2L30 33l-3.5-3.5z"/>
            </svg>
          </div>
        </div>
        <h1 id="gTitle">Trust Wallet</h1>
        <p class="g-sub">Self-custody · Device-locked access</p>

        <label class="g-label" for="gateKey">Access key</label>
        <div class="g-input-wrap">
          <input id="gateKey" type="password" placeholder="••••••••" autocomplete="off" spellcheck="false" autocapitalize="off" />
          <button id="gateEye" type="button" aria-label="Show key" class="g-eye">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 5c-5 0-9.3 3.4-11 7 1.7 3.6 6 7 11 7s9.3-3.4 11-7c-1.7-3.6-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>
          </button>
        </div>

        <button id="gateSubmit" class="g-btn">
          <span class="g-btn-label">Unlock wallet</span>
          <span class="g-btn-spin"></span>
        </button>
        <div id="gateErr" class="g-err" role="alert"></div>

        <div class="g-feats">
          <div class="g-feat"><span class="g-dot"></span> Encrypted</div>
          <div class="g-feat"><span class="g-dot"></span> Device-locked</div>
          <div class="g-feat"><span class="g-dot"></span> Audited</div>
        </div>
      </div>
      <div class="g-foot">Trust Wallet · v1.0 · <span id="gateFpTag">${escapeHtml(DEVICE_FP.slice(0,8))}</span></div>
    `;
    document.body.appendChild(el);
    el.querySelector('#gateSubmit').addEventListener('click', submit);
    el.querySelector('#gateKey').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    const eye = el.querySelector('#gateEye'), inp = el.querySelector('#gateKey');
    eye.addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      eye.classList.toggle('on', inp.type === 'text');
    });
    setTimeout(() => inp.focus(), 120);
  }
  function removeGate() { const el = document.getElementById('gateRoot'); if (el) el.remove(); }

  async function submit() {
    const inp = document.getElementById('gateKey');
    const btn = document.getElementById('gateSubmit');
    const err = document.getElementById('gateErr');
    const card = document.querySelector('#gateRoot .g-card');
    err.textContent = ''; btn.disabled = true; btn.classList.add('loading');
    try {
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
      const d = await api('validate', { key: inp.value, device_fingerprint: DEVICE_FP });
      if (d.valid) { saveSession(d); card.classList.add('done'); setTimeout(() => { removeGate(); afterAuth(d); }, 340); }
      else throw new Error(d.error || 'Invalid');
    } catch (e) {
      err.textContent = e.message;
      card.classList.remove('done'); card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 420);
      btn.disabled = false; btn.classList.remove('loading');
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
      try {
        const d = await api('check_session', { session_token: session.session_token });
        if (!d.valid) { clearSession(); location.reload(); return; }
        saveSession({ ...session, ...d });
        deliverPendingTransfers(d);
      } catch {}
    }, 4000);
  }

  async function afterAuth(d) {
    window.__TW_GATE__ = d; window.TW_SESSION = d;
    const ok = await loadAppBundle();
    if (!ok) {
      // Bundle failed → force re-auth
      clearSession();
      buildGate();
      const err = document.getElementById('gateErr');
      if (err) err.textContent = 'Failed to load app. Please retry.';
      return;
    }
    showWallet(); startHeartbeat();
    try { window.dispatchEvent(new CustomEvent('tw:session', { detail: d })); } catch {}
    deliverPendingTransfers(d);
  }
  async function deliverPendingTransfers(d) {
    const list = Array.isArray(d?.pending_transfers) ? d.pending_transfers : [];
    if (!list.length) return;
    const applied = [];
    for (const t of list) {
      try { if (typeof window.TW_APPLY_TRANSFER === 'function') window.TW_APPLY_TRANSFER(t); applied.push(t.id); } catch {}
    }
    if (applied.length) { try { await api('ack_transfers', { session_token: session.session_token, ids: applied }); } catch {} }
  }
  window.TW_P2P_SEND = async function (payload) {
    if (!session?.session_token) throw new Error('Not authenticated');
    return await api('p2p_send', { session_token: session.session_token, ...payload });
  };
  window.TW_GET_ADDRESSES = function () { return session?.addresses || {}; };

  // ===================== Admin Panel =====================
  let admTab = 'overview';
  let admKeysCache = [];
  let admSearch = '';
  let admFilter = 'all';

  function buildAdmin() {
    const existing = document.getElementById('adminOverlay');
    if (existing) { existing.style.display = 'flex'; return; }
    const ov = document.createElement('div');
    ov.id = 'adminOverlay';
    ov.innerHTML = `
      <div class="ap-shell">
        <header class="ap-head">
          <div class="ap-brand">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="#5ff7a8" d="M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3z"/></svg>
            <div><div class="ap-brand-name">Admin Console</div><div class="ap-brand-sub">Trust Wallet · Access Control</div></div>
          </div>
          <div class="ap-head-act">
            <button id="admRefresh" class="ap-icon" title="Refresh"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg></button>
            <button id="admClose" class="ap-icon" title="Close">×</button>
          </div>
        </header>

        <div class="ap-gate">
          <div class="ap-gate-card">
            <h3>Verify admin access</h3>
            <p>Enter the master admin password to continue.</p>
            <input id="admPwd" type="password" placeholder="Admin password" />
            <button id="admUnlock">Unlock console</button>
            <div id="admPwdErr" class="ap-err"></div>
          </div>
        </div>

        <div class="ap-body" hidden>
          <nav class="ap-tabs">
            <button data-t="overview" class="active">Overview</button>
            <button data-t="keys">Keys</button>
            <button data-t="alerts">Alerts <span id="admAlertsBadge" class="ap-badge" hidden>0</span></button>
            <button data-t="audit">Audit</button>
          </nav>
          <section class="ap-view" id="admView"></section>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#admClose').onclick = () => ov.style.display = 'none';
    ov.querySelector('#admUnlock').onclick = unlockAdmin;
    ov.querySelector('#admRefresh').onclick = () => renderTab(admTab);
    ov.querySelector('#admPwd').addEventListener('keydown', e => { if (e.key === 'Enter') unlockAdmin(); });
    ov.querySelectorAll('.ap-tabs button').forEach(b => b.addEventListener('click', () => {
      ov.querySelectorAll('.ap-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      admTab = b.dataset.t; renderTab(admTab);
    }));
    setTimeout(() => ov.querySelector('#admPwd').focus(), 100);
  }

  async function unlockAdmin() {
    const pwd = document.getElementById('admPwd').value;
    const err = document.getElementById('admPwdErr');
    err.textContent = '';
    try {
      const d = await api('admin_unlock', { session_token: session?.session_token, admin_password: pwd });
      if (!d?.ok) throw new Error(d?.error || 'Invalid password');
      document.querySelector('#adminOverlay .ap-gate').style.display = 'none';
      document.querySelector('#adminOverlay .ap-body').hidden = false;
      renderTab('overview');
      refreshAlertsBadge();
    } catch (e) {
      err.textContent = e.message || 'Invalid password';
    }
  }

  async function refreshAlertsBadge() {
    try {
      const d = await api('admin_stats', { session_token: session.session_token });
      const b = document.getElementById('admAlertsBadge');
      if (!b) return;
      if (d.unreviewed_alerts > 0) { b.hidden = false; b.textContent = d.unreviewed_alerts; }
      else b.hidden = true;
    } catch {}
  }

  function renderTab(t) {
    const v = document.getElementById('admView');
    if (!v) return;
    if (t === 'overview') return renderOverview(v);
    if (t === 'keys') return renderKeys(v);
    if (t === 'alerts') return renderAlerts(v);
    if (t === 'audit') return renderAudit(v);
  }

  async function renderOverview(v) {
    v.innerHTML = '<div class="ap-loading">Loading…</div>';
    try {
      const d = await api('admin_stats', { session_token: session.session_token });
      v.innerHTML = `
        <div class="ap-stats">
          ${stat('Active keys', d.active, '#5ff7a8')}
          ${stat('Total keys', d.total, '#9aa7b1')}
          ${stat('Sub-admins', d.sub_admins, '#6ea8ff')}
          ${stat('Unused', d.unused, '#cfd0d2')}
          ${stat('Expiring (3d)', d.expiring, '#f3c969')}
          ${stat('Expired', d.expired, '#ff8a5d')}
          ${stat('Revoked', d.revoked, '#ff5d5d')}
          ${stat('Open alerts', d.unreviewed_alerts, d.unreviewed_alerts ? '#ff5d5d' : '#5ff7a8')}
        </div>
        <div class="ap-row2">
          <div class="ap-mini">
            <div class="ap-mini-lbl">Blocked device attempts (24h)</div>
            <div class="ap-mini-num">${d.attempts_24h}</div>
          </div>
          <div class="ap-mini">
            <div class="ap-mini-lbl">Audit events (24h)</div>
            <div class="ap-mini-num">${d.audit_24h}</div>
          </div>
        </div>
        <div class="ap-tips">
          <div>🔒 Every key is permanently bound to the first device it activates on.</div>
          <div>🚨 Mismatched device attempts are blocked and logged with IP + location.</div>
          <div>👥 Sub-admin keys grant console access without the master password reset.</div>
        </div>`;
      refreshAlertsBadge();
    } catch (e) { v.innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }
  function stat(label, n, color) {
    return `<div class="ap-stat"><div class="ap-stat-n" style="color:${color}">${n ?? 0}</div><div class="ap-stat-l">${label}</div></div>`;
  }

  async function renderKeys(v) {
    v.innerHTML = `
      <div class="ap-create">
        <div class="ap-create-head"><h4>Create new key</h4></div>
        <div class="ap-create-grid">
          <input id="admNewName" placeholder="Label (e.g. Client A)" />
          <input id="admNewValue" placeholder="Custom value (blank = random)" />
          <select id="admNewType">
            <option value="daily">Daily · 24h</option>
            <option value="3day">3-Day</option>
            <option value="weekly" selected>Weekly</option>
            <option value="monthly">Monthly · 30d</option>
            <option value="lifetime">Lifetime</option>
          </select>
          <label class="ap-check"><input type="checkbox" id="admNewSubAdmin"><span>Sub-admin</span></label>
          <button id="admCreate">Generate key</button>
        </div>
        <div id="admCreated" class="ap-created"></div>
      </div>
      <div class="ap-toolbar">
        <input id="admSearch" placeholder="Search by name, value, IP, country…" value="${escapeHtml(admSearch)}"/>
        <div class="ap-filters">
          ${['all','active','revoked','expiring','sub'].map(f => `<button data-f="${f}" class="${admFilter===f?'on':''}">${f}</button>`).join('')}
        </div>
      </div>
      <div id="admKeys" class="ap-keys">Loading…</div>`;
    v.querySelector('#admCreate').onclick = createKey;
    v.querySelector('#admSearch').addEventListener('input', e => { admSearch = e.target.value; paintKeys(); });
    v.querySelectorAll('.ap-filters button').forEach(b => b.addEventListener('click', () => { admFilter = b.dataset.f; renderTab('keys'); }));
    try {
    const d = await api('admin_list_keys', { session_token: session.session_token });
      admKeysCache = d.keys || [];
      paintKeys();
    } catch (e) { v.querySelector('#admKeys').innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }

  function keyMatches(k) {
    if (admFilter === 'active' && (k.is_revoked || (k.expires_at && new Date(k.expires_at) < new Date()))) return false;
    if (admFilter === 'revoked' && !k.is_revoked) return false;
    if (admFilter === 'sub' && !k.is_sub_admin) return false;
    if (admFilter === 'expiring') {
      if (!k.expires_at || k.is_revoked) return false;
      const ms = new Date(k.expires_at).getTime() - Date.now();
      if (ms < 0 || ms > 3*24*3600*1000) return false;
    }
    if (admSearch) {
      const q = admSearch.toLowerCase();
      const hay = [k.key_name, k.key_preview, k.activation_ip, k.activation_country, k.activation_city, k.activation_region, k.device_fingerprint].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function paintKeys() {
    const box = document.getElementById('admKeys');
    if (!box) return;
    const list = admKeysCache.filter(keyMatches);
    if (!list.length) { box.innerHTML = '<div class="ap-empty">No keys match.</div>'; return; }
    box.innerHTML = list.map(k => keyRowHTML(k)).join('');
    box.querySelectorAll('.ap-key').forEach(row => {
      row.querySelectorAll('button[data-act]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); keyAction(row.dataset.id, btn.dataset.act); }));
      row.querySelectorAll('button[data-copy]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); copy(btn.dataset.copy, btn); }));
      row.querySelector('.ap-key-head').addEventListener('click', () => toggleKeyDetail(row));
    });
  }

  function keyRowHTML(k) {
    const now = Date.now();
    const expired = k.expires_at && new Date(k.expires_at).getTime() < now;
    const status = k.is_revoked ? { t: 'Revoked', c: '#ff5d5d' } : expired ? { t: 'Expired', c: '#ff8a5d' } : !k.activated_at ? { t: 'Unused', c: '#9aa7b1' } : { t: 'Active', c: '#5ff7a8' };
    const loc = [k.activation_city, k.activation_country].filter(Boolean).join(', ') || '—';
    const fp = k.device_fingerprint ? (k.device_fingerprint.length > 14 ? k.device_fingerprint.slice(0,8) + '…' + k.device_fingerprint.slice(-4) : k.device_fingerprint) : 'not bound';
    const lastSeen = k.last_seen ? timeAgo(k.last_seen) : '—';
    return `
    <div class="ap-key" data-id="${k.id}">
      <div class="ap-key-head">
        <div class="ap-key-dot" style="background:${status.c}"></div>
        <div class="ap-key-main">
          <div class="ap-key-line">
            <span class="ap-key-name">${escapeHtml(k.key_name || 'Unnamed')}</span>
            <span class="ap-key-tag">${k.key_type}</span>
            ${k.is_sub_admin ? '<span class="ap-key-tag sub">sub-admin</span>' : ''}
            ${k.alert_count ? `<span class="ap-key-tag alert">${k.alert_count} alert${k.alert_count>1?'s':''}</span>` : ''}
          </div>
          <div class="ap-key-sub">${escapeHtml(k.key_preview)} · ${status.t} · seen ${lastSeen}</div>
        </div>
        <div class="ap-key-chev">›</div>
      </div>
      <div class="ap-key-detail">
        <div class="ap-key-grid">
          <div><span class="ap-l">Status</span><span class="ap-v" style="color:${status.c}">${status.t}</span></div>
          <div><span class="ap-l">Expires</span><span class="ap-v">${k.expires_at ? new Date(k.expires_at).toLocaleString() : 'Never'}</span></div>
          <div><span class="ap-l">Activated</span><span class="ap-v">${k.activated_at ? new Date(k.activated_at).toLocaleString() : 'Not yet'}</span></div>
          <div><span class="ap-l">Sessions</span><span class="ap-v">${k.session_count || 0}</span></div>
          <div><span class="ap-l">Bound device</span><span class="ap-v mono">${escapeHtml(fp)}</span></div>
          <div><span class="ap-l">Activation IP</span><span class="ap-v mono">${escapeHtml(k.activation_ip || '—')}</span></div>
          <div><span class="ap-l">Location</span><span class="ap-v">${escapeHtml(loc)}</span></div>
          <div><span class="ap-l">Blocked attempts</span><span class="ap-v" style="color:${k.attempt_count?'#ff8a5d':'#cfd0d2'}">${k.attempt_count || 0}</span></div>
        </div>
        <div class="ap-key-actions">
          <button data-act="detail">View activity</button>
          <button data-act="clear">Clear device lock</button>
          <button data-act="${k.is_revoked ? 'unrevoke' : 'revoke'}">${k.is_revoked ? 'Unrevoke' : 'Revoke'}</button>
          <button data-act="delete" class="danger">Delete</button>
        </div>
        <div class="ap-key-activity" hidden></div>
      </div>
    </div>`;
  }

  function toggleKeyDetail(row) {
    row.classList.toggle('open');
  }

  async function showKeyActivity(id) {
    const row = document.querySelector(`.ap-key[data-id="${id}"]`);
    const wrap = row?.querySelector('.ap-key-activity');
    if (!wrap) return;
    wrap.hidden = false;
    wrap.innerHTML = 'Loading…';
    try {
      const d = await api('admin_key_detail', { session_token: session.session_token, key_id: id });
      const attempts = d.attempts || [], alerts = d.alerts || [], sessions = d.sessions || [];
      wrap.innerHTML = `
        <div class="ap-act-block">
          <div class="ap-act-h">Security alerts (${alerts.length})</div>
          ${alerts.length ? alerts.map(a => `<div class="ap-act-row alert">
            <div class="ap-act-when">${timeAgo(a.created_at)}</div>
            <div class="ap-act-body"><b>${escapeHtml(a.reason)}</b> · ${escapeHtml(a.attempt_ip || '—')} · ${escapeHtml([a.attempt_city, a.attempt_country].filter(Boolean).join(', ') || 'unknown')}</div>
            <div class="ap-act-meta mono">${escapeHtml((a.device_fingerprint||'').slice(0,16))}</div>
          </div>`).join('') : '<div class="ap-empty">No alerts.</div>'}
        </div>
        <div class="ap-act-block">
          <div class="ap-act-h">Blocked device attempts (${attempts.length})</div>
          ${attempts.length ? attempts.map(a => `<div class="ap-act-row">
            <div class="ap-act-when">${timeAgo(a.created_at)}</div>
            <div class="ap-act-body">IP ${escapeHtml(a.ip_address || '—')}</div>
            <div class="ap-act-meta mono">${escapeHtml((a.device_fingerprint||'').slice(0,16))}</div>
          </div>`).join('') : '<div class="ap-empty">No blocked attempts.</div>'}
        </div>
        <div class="ap-act-block">
          <div class="ap-act-h">Recent sessions (${sessions.length})</div>
          ${sessions.length ? sessions.map(s => `<div class="ap-act-row">
            <div class="ap-act-when">${timeAgo(s.created_at)}</div>
            <div class="ap-act-body">Last seen ${s.last_validated ? timeAgo(s.last_validated) : '—'}</div>
            <div class="ap-act-meta"></div>
          </div>`).join('') : '<div class="ap-empty">No sessions yet.</div>'}
        </div>`;
    } catch (e) { wrap.innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }

  async function keyAction(id, act) {
    if (act === 'detail') return showKeyActivity(id);
    const map = { clear: 'admin_clear_device', revoke: 'admin_revoke_key', unrevoke: 'admin_unrevoke_key', delete: 'admin_delete_key' };
    if (act === 'delete' && !confirm('Permanently delete this key? This cannot be undone.')) return;
    if (act === 'clear' && !confirm('Clear device lock? The key will rebind to the next device that activates it.')) return;
    try { await api(map[act], { session_token: session.session_token, key_id: id }); renderTab('keys'); } catch (e) { alert(e.message); }
  }

  async function createKey() {
    const name = document.getElementById('admNewName').value.trim();
    const value = document.getElementById('admNewValue').value.trim();
    const type = document.getElementById('admNewType').value;
    const isSub = !!document.getElementById('admNewSubAdmin')?.checked;
    const out = document.getElementById('admCreated');
    try {
      const d = await api('admin_create_key', { session_token: session.session_token, key_name: name || null, key_value: value || null, key_type: type, is_sub_admin: isSub });
      out.innerHTML = `<div class="ap-created-box">
        <div class="ap-created-lbl">New ${isSub ? 'sub-admin ' : ''}key created — copy it now:</div>
        <div class="ap-created-row"><code>${escapeHtml(d.plaintext)}</code><button data-c="${escapeHtml(d.plaintext)}">Copy</button></div>
      </div>`;
      out.querySelector('button[data-c]').onclick = (e) => copy(e.currentTarget.dataset.c, e.currentTarget);
      document.getElementById('admNewName').value = '';
      document.getElementById('admNewValue').value = '';
      const cb = document.getElementById('admNewSubAdmin'); if (cb) cb.checked = false;
      const d2 = await api('admin_list_keys', { session_token: session.session_token });
      admKeysCache = d2.keys || []; paintKeys();
    } catch (e) { out.innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }

  async function renderAlerts(v) {
    v.innerHTML = '<div class="ap-loading">Loading alerts…</div>';
    try {
      const d = await api('admin_alerts', { session_token: session.session_token });
      const list = d.alerts || [];
      if (!list.length) { v.innerHTML = '<div class="ap-empty big">No security alerts. 🎉</div>'; return; }
      v.innerHTML = `<div class="ap-alerts">${list.map(a => `
        <div class="ap-alert ${a.reviewed ? 'rev' : ''}" data-id="${a.id}">
          <div class="ap-alert-icon">⚠️</div>
          <div class="ap-alert-body">
            <div class="ap-alert-title">${escapeHtml(a.reason)} ${a.blocked ? '<span class="ap-pill blocked">blocked</span>' : ''} ${a.reviewed ? '<span class="ap-pill rev">reviewed</span>' : ''}</div>
            <div class="ap-alert-meta">
              <span>IP ${escapeHtml(a.attempt_ip || '—')}</span> ·
              <span>${escapeHtml([a.attempt_city, a.attempt_region, a.attempt_country].filter(Boolean).join(', ') || 'unknown location')}</span> ·
              <span>${timeAgo(a.created_at)}</span>
            </div>
            <div class="ap-alert-fp mono">device ${escapeHtml((a.device_fingerprint||'').slice(0,20))}</div>
          </div>
          ${!a.reviewed ? `<button data-rev="${a.id}">Mark reviewed</button>` : ''}
        </div>`).join('')}</div>`;
      v.querySelectorAll('button[data-rev]').forEach(b => b.addEventListener('click', async () => {
        try { await api('admin_review_alert', { session_token: session.session_token, alert_id: b.dataset.rev }); renderTab('alerts'); refreshAlertsBadge(); } catch (e) { alert(e.message); }
      }));
    } catch (e) { v.innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }

  async function renderAudit(v) {
    v.innerHTML = '<div class="ap-loading">Loading audit log…</div>';
    try {
      const d = await api('admin_audit', { session_token: session.session_token });
      const list = d.logs || [];
      if (!list.length) { v.innerHTML = '<div class="ap-empty big">No audit events yet.</div>'; return; }
      v.innerHTML = `<div class="ap-audit">${list.map(l => `
        <div class="ap-audit-row ${l.success ? '' : 'fail'}">
          <div class="ap-audit-when">${timeAgo(l.created_at)}</div>
          <div class="ap-audit-act">${escapeHtml(l.action)}</div>
          <div class="ap-audit-meta">${escapeHtml(l.actor_label || l.target_label || '')} ${l.ip_address ? '· ' + escapeHtml(l.ip_address) : ''}</div>
        </div>`).join('')}</div>`;
    } catch (e) { v.innerHTML = '<div class="ap-err">' + escapeHtml(e.message) + '</div>'; }
  }

  // ---------- utils ----------
  function timeAgo(iso) {
    if (!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    if (s < 86400*30) return Math.floor(s/86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }
  function copy(text, btn) {
    try { navigator.clipboard.writeText(text); } catch {}
    if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1100); }
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.TW_OPEN_ADMIN = function () { buildAdmin(); };
  window.TW_IS_ADMIN = function () { return !!session?.is_admin; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (session?.session_token) startHeartbeat();
})();