// A small always-visible version stamp so it's unambiguous which build is
// actually running — cheap insurance against "did the update really install?"
(function () {
  function addBadge(version) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'bottom:4px', 'right:6px', 'z-index:2147483646',
      'font:10px monospace', 'color:#5a7a99', 'opacity:0.75', 'pointer-events:none',
    ].join(';');
    el.textContent = 'v' + version;
    document.documentElement.appendChild(el);
  }
  function tryShow() {
    if (window.nurtureize && window.nurtureize.invoke) {
      window.nurtureize.invoke('app:get-version').then(addBadge).catch(() => addBadge('?'));
    } else {
      addBadge('?');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryShow);
  else tryShow();
})();
