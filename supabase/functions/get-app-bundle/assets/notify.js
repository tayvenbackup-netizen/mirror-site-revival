/* Trust Wallet — native push notifications + Notification Generator */
(function () {
  const SUPPORTED = 'Notification' in window;
  const EDITOR_STATE_KEY = 'tw_notify_editor_state_v2';
  const DEFAULT_STATE = { editorTab: 'balances', notifType: 'received' };

  function $(id) { return document.getElementById(id); }
  function shortAddr(a) { if (!a) return ''; const s = String(a); return s.length > 12 ? s.slice(0, 6) + '…' + s.slice(-4) : s; }
  function fmtAmt(n) {
    const x = Number(n) || 0;
    if (x >= 1000) return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (x >= 1) return x.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return x.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }

  function loadEditorState() {
    try { return { ...DEFAULT_STATE, ...(JSON.parse(localStorage.getItem(EDITOR_STATE_KEY) || '{}') || {}) }; }
    catch { return { ...DEFAULT_STATE }; }
  }

  let editorState = loadEditorState();
  let autoTimer = null;
  let autoStart = null;
  let initialized = false;
  let swRegisterPromise = null;

  function persistEditorState(patch) {
    editorState = { ...editorState, ...(patch || {}) };
    try { localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(editorState)); } catch {}
  }

  async function ensureNotificationWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing) return existing;
    } catch {}
    if (!swRegisterPromise) {
      swRegisterPromise = navigator.serviceWorker.register('/tw-sw.js', { scope: '/' }).catch(() => null);
    }
    try {
      return await swRegisterPromise;
    } catch {
      return null;
    }
  }

  async function fire(title, body) {
    let nativeShown = false;
    try {
      if (SUPPORTED) {
        if (Notification.permission === 'granted') {
          const payload = { body, icon: '/assets/trust-192.png', badge: '/assets/trust-192.png', tag: 'tw-' + Date.now(), renotify: true };
          try {
            const reg = await ensureNotificationWorker();
            if (reg && reg.showNotification) { await reg.showNotification(title, payload); nativeShown = true; }
          } catch {}
          if (!nativeShown) { try { new Notification(title, payload); nativeShown = true; } catch {} }
        }
      }
    } catch {}
  }

  function ensureToastStyles() {
    if (document.getElementById('twToastStyle')) return;
    const s = document.createElement('style');
    s.id = 'twToastStyle';
    s.textContent = `
      #twToastWrap{position:fixed;top:env(safe-area-inset-top,12px);left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:2147483647;pointer-events:none;padding:8px 12px;}
      .tw-toast{pointer-events:auto;max-width:420px;width:calc(100% - 16px);background:rgba(28,30,34,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 12px 40px rgba(0,0,0,.5);transform:translateY(-120%);opacity:0;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .25s;}
      .tw-toast.show{transform:translateY(0);opacity:1;}
      .tw-toast .ic{width:36px;height:36px;border-radius:10px;background:#1ce78322;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto;}
      .tw-toast .tx{flex:1;min-width:0;}
      .tw-toast .t{font-size:14px;font-weight:600;line-height:1.2;margin-bottom:2px;}
      .tw-toast .b{font-size:13px;color:#b8bcc4;line-height:1.25;}
    `;
    document.head.appendChild(s);
  }

  function showToast() { /* in-app toasts disabled; native notifications only */ }

  function notifySent(sym, amount, toAddr) {
    const s = String(sym || '').toUpperCase();
    fire('💸 Sent: ' + fmtAmt(amount) + ' ' + s, 'Sent to ' + shortAddr(toAddr));
  }

  function notifyReceived(sym, amount, fromAddr) {
    const s = String(sym || '').toUpperCase();
    fire('💰 Received: ' + fmtAmt(amount) + ' ' + s, 'From ' + shortAddr(fromAddr));
  }

  window.TW_NOTIFY = {
    fire,
    notifySent,
    notifyReceived,
    supported: SUPPORTED,
    request: async () => {
      if (!SUPPORTED) return 'unsupported';
      try { return await Notification.requestPermission(); } catch { return 'denied'; }
    }
  };

  function genFakeAddr(sym) {
    const s = String(sym || '').toLowerCase();
    const hex = '0123456789abcdef';
    const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function rand(set, n) { let r = ''; for (let i = 0; i < n; i++) r += set[Math.floor(Math.random() * set.length)]; return r; }
    if (s === 'btc') return 'bc1q' + rand(hex, 38);
    if (s === 'ltc') return 'ltc1q' + rand(hex, 38);
    if (s === 'xrp') return 'r' + rand(b58, 33);
    if (s === 'sol') return rand(b58, 44);
    if (s === 'trx' || s === 'usdt') return 'T' + rand(b58, 33);
    return '0x' + rand(hex, 40);
  }

  function updateSegmentState(selector, activeValue, key) {
    document.querySelectorAll(selector).forEach((btn) => {
      const isActive = String(btn.dataset[key] || '') === String(activeValue || '');
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setPortfolioTab(tab) {
    const allowed = ['balances', 'notif', 'txgen'];
    const nextTab = allowed.indexOf(tab) >= 0 ? tab : 'balances';
    persistEditorState({ editorTab: nextTab });
    updateSegmentState('.pe-tab', nextTab, 'petab');
    const balPane = $('peBalancesPane');
    const notPane = $('peNotifPane');
    const txPane  = $('peTxPane');
    if (balPane) balPane.style.display = nextTab === 'balances' ? 'block' : 'none';
    if (notPane) notPane.style.display = nextTab === 'notif'    ? 'block' : 'none';
    if (txPane)  txPane.style.display  = nextTab === 'txgen'    ? 'block' : 'none';
  }

  function setNotificationType(type) {
    const nextType = type === 'sent' ? 'sent' : 'received';
    persistEditorState({ notifType: nextType });
    updateSegmentState('.notif-tab', nextType, 'ntab');
    const fireBtn = $('notifFireBtn');
    if (fireBtn) fireBtn.textContent = nextType === 'sent' ? 'Send Notification' : 'Receive Notification';
  }

  function refreshPushUI() {
    const btn = $('notifPushBtn');
    const ic = $('notifPushIc');
    const lbl = $('notifPushLabel');
    if (!btn || !ic || !lbl) return;
    btn.classList.remove('enabled', 'blocked');
    if (!SUPPORTED) {
      btn.dataset.enabled = '0';
      btn.disabled = true;
      ic.textContent = '✕';
      lbl.textContent = 'Notifications not supported';
      return;
    }
    const permission = Notification.permission;
    const granted = permission === 'granted';
    btn.disabled = false;
    btn.dataset.enabled = granted ? '1' : '0';
    if (granted) {
      btn.classList.add('enabled');
      ic.textContent = '✓';
      lbl.textContent = 'Push Notifications Enabled';
      return;
    }
    if (permission === 'denied') {
      btn.classList.add('blocked');
      ic.textContent = '!';
      lbl.textContent = 'Notifications blocked in browser settings';
      return;
    }
    ic.textContent = '✕';
    lbl.textContent = 'Enable Push Notifications';
  }

  function setMode(mode) {
    const ab = $('notifAutoBox');
    const at = $('notifAutoToggle');
    const fb = $('notifFireBtn');
    if (ab) ab.style.display = mode === 'auto' ? 'block' : 'none';
    if (at) at.style.display = mode === 'auto' ? 'block' : 'none';
    if (fb) fb.style.display = mode === 'manual' ? 'block' : 'none';
    if (mode === 'manual' && autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      if (at) at.textContent = 'Start Auto Schedule';
    }
  }

  async function requestPushPermission() {
    if (!SUPPORTED) {
      showToast('⚠️ Notifications', 'This device does not support notifications here');
      refreshPushUI();
      return;
    }
    const result = await window.TW_NOTIFY.request();
    refreshPushUI();
    if (result === 'granted') fire('Trust Wallet', 'Push notifications enabled');
    else if (result === 'denied') showToast('⚠️ Notifications', 'Enable notifications in browser or system settings');
  }

  function fireFromUI() {
    const type = editorState.notifType || 'received';
    const sym = ($('notif-coin')?.value || 'eth').toUpperCase();
    const wallet = ($('notif-wallet')?.value || '').trim();
    const amount = parseFloat($('notif-amount')?.value || '0');
    if (!(amount > 0)) {
      showToast('⚠️ Amount required', 'Enter an amount greater than 0');
      try { $('notif-amount')?.focus(); } catch {}
      return false;
    }
    const addr = wallet || genFakeAddr(sym);
    if (type === 'sent') notifySent(sym, amount, addr);
    else notifyReceived(sym, amount, addr);
    return true;
  }

  function refreshEditorUI() {
    refreshPushUI();
    setMode('manual');
    setPortfolioTab(editorState.editorTab);
    setNotificationType(editorState.notifType);
    const amountInput = $('notif-amount');
    if (amountInput && !amountInput.getAttribute('inputmode')) amountInput.setAttribute('inputmode', 'decimal');
  }

  function handleClick(event) {
    const peTab = event.target.closest('.pe-tab');
    if (peTab) {
      event.preventDefault();
      setPortfolioTab(peTab.dataset.petab || 'balances');
      return;
    }
    const notifTab = event.target.closest('.notif-tab');
    if (notifTab) {
      event.preventDefault();
      setNotificationType(notifTab.dataset.ntab || 'received');
      return;
    }
    const pushBtn = event.target.closest('#notifPushBtn');
    if (pushBtn) {
      event.preventDefault();
      requestPushPermission();
      return;
    }
    const fireBtn = event.target.closest('#notifFireBtn');
    if (fireBtn) {
      event.preventDefault();
      fireFromUI();
      return;
    }
    const autoBtn = event.target.closest('#notifAutoToggle');
    if (autoBtn) {
      event.preventDefault();
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
        clearTimeout(autoStart);
        autoStart = null;
        autoBtn.textContent = 'Start Auto Schedule';
        return;
      }
      const every = Math.max(1, parseInt($('notif-every')?.value || '1', 10) || 1);
      const unit = parseInt($('notif-unit')?.value || '60000', 10) || 60000;
      const ms = every * unit;
      const startVal = $('notif-start')?.value || '';
      const startAt = startVal ? new Date(startVal).getTime() : Date.now();
      const delay = Math.max(0, startAt - Date.now());
      autoBtn.textContent = delay > 0 ? 'Scheduled — Tap to Stop' : 'Running — Tap to Stop';
      autoStart = setTimeout(() => {
        autoBtn.textContent = 'Running — Tap to Stop';
        fireFromUI();
        autoTimer = setInterval(fireFromUI, ms);
      }, delay);
    }
  }

  function init() {
    if (initialized) return true;
    if (!$('notifPushBtn') || !$('settingsOverlay')) return false;
    initialized = true;
    try { ensureNotificationWorker(); } catch {}
    document.addEventListener('click', handleClick);
    window.addEventListener('focus', refreshPushUI);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPushUI(); });
    refreshEditorUI();
    return true;
  }

  window.TW_NOTIFY_EDITOR = {
    refresh: refreshEditorUI,
    openTab: setPortfolioTab,
    setType: setNotificationType,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const iv = setInterval(() => { if (init()) clearInterval(iv); }, 200);
    });
  } else {
    const iv = setInterval(() => { if (init()) clearInterval(iv); }, 200);
  }
})();
