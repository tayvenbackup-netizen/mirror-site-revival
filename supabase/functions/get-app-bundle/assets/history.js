/* Trust Wallet — Transaction History + Transaction Creator */
(function () {
  'use strict';
  const KEY = 'tw_tx_v1';
  const COIN_ICONS = {
    btc:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/bitcoin/info/logo.png',
    eth:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/info/logo.png',
    sol:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/solana/info/logo.png',
    trx:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/tron/info/logo.png',
    bnb:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png',
    usdt: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/logo.png',
    usdc: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    xrp:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/xrp/info/logo.png',
    ltc:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/litecoin/info/logo.png',
    doge: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/doge/info/logo.png',
  };

  function $(id){ return document.getElementById(id); }
  function uid(){ return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function load(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; } }
  function save(list){ try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }
  function shortAddr(a){ if (!a) return '—'; const s = String(a); return s.length > 14 ? s.slice(0,7) + '...' + s.slice(-6) : s; }
  function fmtAmt(n){
    const x = Number(n) || 0;
    if (x >= 1000) return x.toLocaleString('en-US',{ maximumFractionDigits: 4 });
    if (x >= 1) return x.toLocaleString('en-US',{ maximumFractionDigits: 4 });
    return x.toLocaleString('en-US',{ maximumFractionDigits: 8 });
  }
  function fmtFiat(n){
    const x = Math.abs(Number(n) || 0);
    if (x === 0) return '$0.00';
    if (x < 0.01) return '≈ $' + x.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
    return '≈ $' + x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function fmtFiatDetail(n){
    const x = Math.abs(Number(n) || 0);
    if (x === 0) return '$0.00';
    if (x < 0.01) return '$' + x.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
    return '$' + x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtFullDate(d){
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${String(m).padStart(2,'0')} ${ap}`;
  }
  function dateBucket(iso){
    const d = new Date(iso);
    const today = new Date(); today.setHours(0,0,0,0);
    const dd = new Date(d); dd.setHours(0,0,0,0);
    const diff = Math.round((today - dd) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  function genAddr(sym){
    const s = String(sym || '').toLowerCase();
    const hex = '0123456789abcdef';
    const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function r(set, n){ let s=''; for (let i=0;i<n;i++) s += set[Math.floor(Math.random()*set.length)]; return s; }
    if (s === 'btc') return 'bc1q' + r(hex, 38);
    if (s === 'ltc') return 'ltc1q' + r(hex, 38);
    if (s === 'xrp') return 'r' + r(b58, 33);
    if (s === 'sol') return r(b58, 44);
    if (s === 'trx' || s === 'usdt') return 'T' + r(b58, 33);
    if (s === 'doge') return 'D' + r(b58, 33);
    return '0x' + r(hex, 40);
  }

  // ── Public API ────────────────────────────────────────
  function addTx(tx){
    const list = load();
    const sym = String(tx.sym || '').toLowerCase();
    const item = {
      id: tx.id || uid(),
      type: tx.type === 'sent' ? 'sent' : 'received',
      sym,
      symU: String(tx.sym || sym).toUpperCase(),
      chain: tx.chain || sym,
      amount: Number(tx.amount) || 0,
      fiat: Number(tx.fiat) || 0,
      addr: tx.addr || tx.to_address || tx.from_address || '',
      dateISO: tx.dateISO || new Date().toISOString(),
      status: tx.status || 'Completed',
      fee: Number(tx.fee) || 0,
      feeFiat: Number(tx.feeFiat) || 0,
    };
    list.unshift(item);
    save(list.slice(0, 500));
    renderHome();
    if ($('historyPage')?.classList.contains('open')) renderFull();
    return item;
  }

  function clearAll(){ save([]); renderHome(); renderFull(); }

  window.TW_TX = { add: addTx, all: load, clear: clearAll };

  // ── Rendering ────────────────────────────────────────
  function rowHTML(tx){
    const isSent = tx.type === 'sent';
    const live = (typeof window.TW_PRICE === 'function') ? window.TW_PRICE(tx.symU || tx.sym) : 0;
    const fiat = live > 0 ? (Number(tx.amount) || 0) * live : (Number(tx.fiat) || 0);
    const icon = isSent
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M12 19l-6-6M12 19l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const label = isSent ? 'Sent' : 'Received';
    const sub = (isSent ? 'To: ' : 'From: ') + shortAddr(tx.addr);
    const sign = isSent ? '-' : '+';
    const amtCls = isSent ? '' : 'pos';
    return `<div class="hh-item" data-txid="${tx.id}">
      <div class="hh-ic">${icon}</div>
      <div class="hh-mid"><div class="t">${label}</div><div class="s">${sub}</div></div>
      <div class="hh-right"><div class="a ${amtCls}">${sign}${fmtAmt(tx.amount)} ${tx.symU}</div><div class="f">${fmtFiat(fiat)}</div></div>
    </div>`;
  }

  function renderHome(){
    const wrap = $('homeHistoryList'); if (!wrap) return;
    const list = load();
    if (!list.length){
      wrap.innerHTML = `<div class="hh-empty">No transactions yet</div>`;
    } else {
      wrap.innerHTML = list.slice(0, 3).map(rowHTML).join('');
    }
  }

  function renderFull(){
    const body = $('historyBody'); if (!body) return;
    const list = load();
    if (!list.length){
      body.innerHTML = `<div class="hh-empty" style="padding:40px 0;">No transactions yet</div>`;
      return;
    }
    const groups = {};
    const order = [];
    list.forEach(tx => {
      const k = dateBucket(tx.dateISO);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(tx);
    });
    body.innerHTML = order.map(k => `<div class="hh-date">${k}</div>${groups[k].map(rowHTML).join('')}`).join('');
  }

  // ── Detail sheet ────────────────────────────────────
  function openDetail(tx){
    const o = $('txDetailOverlay'); if (!o) return;
    const isSent = tx.type === 'sent';
    // Live fiat recompute when a current price is available
    const live = (typeof window.TW_PRICE === 'function') ? window.TW_PRICE(tx.symU || tx.sym) : 0;
    const liveFiat = live > 0 ? (Number(tx.amount) || 0) * live : (Number(tx.fiat) || 0);
    const liveFeeFiat = (live > 0 && tx.fee > 0) ? tx.fee * live : (Number(tx.feeFiat) || 0);
    $('tdTitle').textContent = isSent ? 'Sent' : 'Received';
    $('tdAmtFiat').textContent = fmtFiatDetail(liveFiat);
    $('tdAmtCoin').textContent = `${isSent ? '-' : '+'}${fmtAmt(tx.amount)} ${tx.symU}`;
    $('tdDate').textContent = fmtFullDate(new Date(tx.dateISO));
    const st = $('tdStatus');
    st.textContent = tx.status;
    st.className = 'sc-row-val td-status' + (tx.status === 'Pending' ? ' pending' : tx.status === 'Failed' ? ' failed' : '');
    $('tdPartyLbl').textContent = isSent ? 'Recipient' : 'From';
    $('tdParty').textContent = shortAddr(tx.addr);
    const feeCard = $('tdFeeCard');
    if (tx.fee > 0){
      feeCard.style.display = '';
      $('tdFeeCoin').textContent = `${tx.fee} ${tx.symU}`;
      $('tdFeeFiat').textContent = fmtFiatDetail(liveFeeFiat);
    } else {
      feeCard.style.display = 'none';
    }
    o.style.display = 'flex';
    void o.offsetWidth;
    o.classList.add('open');
    o.setAttribute('aria-hidden', 'false');
  }
  function closeDetail(){
    const o = $('txDetailOverlay'); if (!o) return;
    o.classList.remove('open');
    o.setAttribute('aria-hidden', 'true');
    setTimeout(() => { o.style.display = 'none'; }, 320);
  }

  function openHistoryPage(){
    const el = $('historyPage'); if (!el) return;
    renderFull();
    el.style.display = 'flex';
    void el.offsetWidth;
    el.classList.add('open');
    el.setAttribute('aria-hidden','false');
    document.body.classList.add('wf-modal-open');
  }

  // ── Transaction Creator (3rd Balance-Editor tab) ────
  let txTab = 'received';
  function setTxTab(t){
    txTab = t === 'sent' ? 'sent' : 'received';
    document.querySelectorAll('.tx-tab').forEach(b => {
      const active = b.dataset.txtab === txTab;
      b.classList.toggle('active', active);
      b.style.background = active ? '#2a2a2a' : 'transparent';
      b.style.color = active ? '#fff' : '#888';
    });
    const btn = $('txCreateBtn');
    if (btn) btn.textContent = txTab === 'sent' ? 'Add Sent Transaction' : 'Add Received Transaction';
  }
  function buildDateISO(){
    const d = $('tx-date')?.value;
    const t = $('tx-time')?.value || '12:00';
    if (!d) return new Date().toISOString();
    const iso = new Date(d + 'T' + t).toISOString();
    return iso;
  }
  function createTx(){
    const sym = ($('tx-coin')?.value || 'usdt').toLowerCase();
    const amount = parseFloat($('tx-amount')?.value || '0');
    if (!(amount > 0)) { try { $('tx-amount')?.focus(); } catch {} return; }
    const fiat = parseFloat($('tx-fiat')?.value || '0') || amount;
    const addr = ($('tx-addr')?.value || '').trim() || genAddr(sym);
    const status = $('tx-status')?.value || 'Completed';
    const dateISO = buildDateISO();
    const adjust = $('tx-adjustBalance')?.checked;
    addTx({ type: txTab, sym, amount, fiat, addr, status, dateISO });
    if (adjust && typeof window !== 'undefined') {
      try {
        const raw = JSON.parse(localStorage.getItem('twallet_settings') || '{}');
        raw.coins = raw.coins || {};
        const cur = Number(raw.coins[sym]) || 0;
        raw.coins[sym] = Math.max(0, cur + (txTab === 'sent' ? -amount : amount));
        localStorage.setItem('twallet_settings', JSON.stringify(raw));
        if (typeof window.renderWalletFromSettings === 'function') window.renderWalletFromSettings();
        if (typeof window.updateWallet === 'function') window.updateWallet(true);
      } catch {}
    }
    // Reset amount fields, keep coin/date
    $('tx-amount').value = '';
    $('tx-fiat').value = '';
    $('tx-addr').value = '';
  }

  // ── Click delegation ────────────────────────────────
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.hh-item');
    if (item){
      const id = item.getAttribute('data-txid');
      const tx = load().find(t => t.id === id);
      if (tx) openDetail(tx);
      return;
    }
    if (e.target.closest('#homeHistoryHeader') || e.target.closest('#homeHistoryViewAll') || e.target.closest('[data-testid="wallet-assets-history-button"]')){
      e.preventDefault();
      openHistoryPage();
      return;
    }
    if (e.target.closest('#tdClose') || e.target === $('txDetailOverlay')){
      e.preventDefault(); closeDetail(); return;
    }
    const txTabBtn = e.target.closest('.tx-tab');
    if (txTabBtn){ e.preventDefault(); setTxTab(txTabBtn.dataset.txtab); return; }
    if (e.target.closest('#txCreateBtn')){ e.preventDefault(); createTx(); return; }
    if (e.target.closest('#txClearAllBtn')){
      e.preventDefault();
      if (confirm('Clear all transactions?')) clearAll();
      return;
    }
    // pe-tab Transaction Creator pane switching (extends notify.js panes)
    const peTab = e.target.closest('.pe-tab');
    if (peTab && peTab.dataset.petab === 'txgen'){
      // notify.js will set styles for .pe-tab but doesn't know peTxPane; handle here
      setTimeout(() => {
        const bal = $('peBalancesPane'); const nt = $('peNotifPane'); const tx = $('peTxPane');
        if (bal) bal.style.display = 'none';
        if (nt)  nt.style.display = 'none';
        if (tx)  tx.style.display = 'block';
        document.querySelectorAll('.pe-tab').forEach(b => {
          const a = b.dataset.petab === 'txgen';
          b.classList.toggle('active', a);
          b.style.background = a ? '#2a2a2a' : 'transparent';
          b.style.color = a ? '#fff' : '#888';
          b.setAttribute('aria-pressed', a ? 'true' : 'false');
        });
      }, 0);
      return;
    }
    if (peTab && peTab.dataset.petab !== 'txgen'){
      // Ensure tx pane hidden when switching away
      setTimeout(() => { const tx = $('peTxPane'); if (tx) tx.style.display = 'none'; }, 0);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Default the creator date to today
    const d = new Date();
    const yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
    if ($('tx-date')) $('tx-date').value = `${yyyy}-${mm}-${dd}`;
    if ($('tx-time')) $('tx-time').value = `${hh}:${mi}`;
    setTxTab('received');
    renderHome();
  });
})();