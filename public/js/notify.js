/* Trust Wallet — native push notifications + Notification Generator */
(function () {
  const COIN_NAMES = { btc:'Bitcoin', eth:'Ethereum', sol:'Solana', bnb:'BNB', usdt:'Tether', trx:'TRON', xrp:'XRP', ltc:'Litecoin', usdc:'USD Coin', doge:'Dogecoin' };
  const SUPPORTED = 'Notification' in window;

  function shortAddr(a){ if(!a) return ''; const s=String(a); return s.length>12?s.slice(0,6)+'…'+s.slice(-4):s; }
  function fmtAmt(n){ const x=Number(n)||0; if(x>=1000)return x.toLocaleString('en-US',{maximumFractionDigits:2}); if(x>=1)return x.toLocaleString('en-US',{maximumFractionDigits:4}); return x.toLocaleString('en-US',{maximumFractionDigits:8}); }

  async function fire(title, body){
    try{
      if(!SUPPORTED) return;
      if(Notification.permission!=='granted'){
        try{ await Notification.requestPermission(); }catch{}
        if(Notification.permission!=='granted') return;
      }
      const payload={ body, icon:'/assets/trust-192.png', badge:'/assets/trust-192.png', tag:'tw-'+Date.now(), renotify:true };
      try{
        const reg = await (navigator.serviceWorker && navigator.serviceWorker.ready);
        if(reg && reg.showNotification){ await reg.showNotification(title, payload); return; }
      }catch{}
      try{ new Notification(title, payload); }catch{}
    }catch{}
  }

  function notifySent(sym, amount, toAddr){
    const s=String(sym||'').toUpperCase();
    fire('💸 Sent: '+fmtAmt(amount)+' '+s, 'Sent to '+shortAddr(toAddr));
  }
  function notifyReceived(sym, amount, fromAddr){
    const s=String(sym||'').toUpperCase();
    fire('💰 Received: '+fmtAmt(amount)+' '+s, 'From '+shortAddr(fromAddr));
  }

  window.TW_NOTIFY = { fire, notifySent, notifyReceived, supported:SUPPORTED, request:async()=>{ if(!SUPPORTED) return 'unsupported'; try{ return await Notification.requestPermission(); }catch{ return 'denied'; } } };

  // ── Generator UI controller ────────────────────────────────────
  function $(id){ return document.getElementById(id); }
  let autoTimer=null, autoStart=null;

  function genFakeAddr(sym){
    const s=String(sym||'').toLowerCase();
    const hex='0123456789abcdef'; const b58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function rand(set,n){ let r=''; for(let i=0;i<n;i++) r+=set[Math.floor(Math.random()*set.length)]; return r; }
    if(s==='btc') return 'bc1q'+rand(hex,38);
    if(s==='ltc') return 'ltc1q'+rand(hex,38);
    if(s==='xrp') return 'r'+rand(b58,33);
    if(s==='sol') return rand(b58,44);
    if(s==='trx'||s==='usdt') return 'T'+rand(b58,33);
    return '0x'+rand(hex,40);
  }

  function fireFromUI(){
    const tab = document.querySelector('.notif-tab.active')?.dataset.ntab || 'received';
    const sym = ($('notif-coin')?.value||'eth').toUpperCase();
    const wallet = ($('notif-wallet')?.value||'').trim();
    const amtRaw = parseFloat($('notif-amount')?.value);
    const randIfEmpty = $('notif-random-amt')?.checked;
    const amount = isFinite(amtRaw)&&amtRaw>0 ? amtRaw : (randIfEmpty ? (Math.random()*5+0.01) : 0);
    const addr = wallet || genFakeAddr(sym);
    if(tab==='sent') notifySent(sym, amount, addr); else notifyReceived(sym, amount, addr);
  }

  function refreshPushUI(){
    const btn=$('notifPushBtn'); const ic=$('notifPushIc'); const lbl=$('notifPushLabel');
    if(!btn) return;
    if(!SUPPORTED){ btn.dataset.enabled='0'; ic.textContent='✕'; lbl.textContent='Notifications not supported'; btn.disabled=true; return; }
    const g = Notification.permission==='granted';
    btn.dataset.enabled = g?'1':'0';
    ic.textContent = g?'✓':'✕';
    lbl.textContent = g?'Push Notifications Enabled':(Notification.permission==='denied'?'Notifications blocked in browser settings':'Enable Push Notifications');
  }

  function setMode(mode){
    const ab=$('notifAutoBox'), at=$('notifAutoToggle'), fb=$('notifFireBtn');
    if(ab) ab.style.display = mode==='auto'?'block':'none';
    if(at) at.style.display = mode==='auto'?'block':'none';
    if(fb) fb.style.display = mode==='manual'?'block':'none';
    if(mode==='manual' && autoTimer){ clearInterval(autoTimer); autoTimer=null; if(at) at.textContent='Start Auto Schedule'; }
  }

  function init(){
    if(!$('notifPushBtn')) return false;
    refreshPushUI();
    $('notifPushBtn').addEventListener('click', async ()=>{
      if(!SUPPORTED){ alert('Notifications are not supported on this device.'); return; }
      const r = await window.TW_NOTIFY.request();
      refreshPushUI();
      if(r==='granted') fire('Trust Wallet', 'Push notifications enabled');
      else if(r==='denied') alert('Notifications blocked. Enable them in your browser/system settings.');
    });
    document.querySelectorAll('.notif-tab').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('.notif-tab').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    }));
    document.querySelectorAll('.notif-mode-tab').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('.notif-mode-tab').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); setMode(b.dataset.nmode);
    }));
    const fireBtn=$('notifFireBtn');
    if(fireBtn) fireBtn.addEventListener('click', fireFromUI);
    const autoBtn=$('notifAutoToggle');
    if(autoBtn) autoBtn.addEventListener('click', ()=>{
      if(autoTimer){ clearInterval(autoTimer); autoTimer=null; clearTimeout(autoStart); autoStart=null; $('notifAutoToggle').textContent='Start Auto Schedule'; return; }
      const n=Math.max(1, parseInt($('notif-every').value)||1);
      const unit=parseInt($('notif-unit').value)||60000;
      const ms=n*unit;
      const startVal=$('notif-start').value;
      const startAt=startVal?new Date(startVal).getTime():Date.now();
      const delay=Math.max(0, startAt-Date.now());
      $('notifAutoToggle').textContent = delay>0?'Scheduled — Tap to Stop':'Running — Tap to Stop';
      autoStart=setTimeout(()=>{ $('notifAutoToggle').textContent='Running — Tap to Stop'; fireFromUI(); autoTimer=setInterval(fireFromUI, ms); }, delay);
    });
    setMode('manual');

    // Tabs in portfolio editor
    document.querySelectorAll('.pe-tab').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('.pe-tab').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const t=b.dataset.petab;
      const balPane=document.getElementById('peBalancesPane');
      const notPane=document.getElementById('peNotifPane');
      if(balPane) balPane.style.display = t==='balances'?'block':'none';
      if(notPane) notPane.style.display = t==='notif'?'block':'none';
    }));
    return true;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>{ const iv=setInterval(()=>{ if(init()) clearInterval(iv); }, 200); });
  else { const iv=setInterval(()=>{ if(init()) clearInterval(iv); }, 200); }
})();
