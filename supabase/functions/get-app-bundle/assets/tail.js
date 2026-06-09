// Wire the admin key icon — visible only when current session is admin
(function(){
  function init(){
    var btn = document.getElementById('settingsAdminKey');
    if (!btn) return;
    function refresh() { if (window.TW_IS_ADMIN && window.TW_IS_ADMIN()) btn.classList.add('visible'); else btn.classList.remove('visible'); }
    btn.addEventListener('click', function () { if (window.TW_OPEN_ADMIN) window.TW_OPEN_ADMIN(); });
    setInterval(refresh, 1000); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
