// Surfaces otherwise-silent renderer failures directly on screen. This does
// NOT depend on the preload bridge (window.nurtureize) — it only uses plain
// DOM/window APIs — so it still works even if the bridge itself is broken,
// which is exactly the kind of failure that's invisible without DevTools.
(function () {
  function ensureBanner() {
    let el = document.getElementById('__diagBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__diagBanner';
    el.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#cc3311', 'color:#fff', 'font:11px/1.4 monospace',
      'padding:6px 8px', 'max-height:200px', 'overflow:auto',
      'white-space:pre-wrap', 'word-break:break-word',
    ].join(';');
    document.documentElement.appendChild(el);
    return el;
  }

  function report(label, detail) {
    try {
      const el = ensureBanner();
      const line = document.createElement('div');
      line.textContent = `[${label}] ${detail}`;
      el.appendChild(line);
    } catch { /* if this itself throws, there's nothing more we can do */ }
  }

  window.addEventListener('error', (e) => {
    report('ERROR', `${e.message} @ ${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report('UNHANDLED REJECTION', (r && (r.stack || r.message)) || String(r));
  });

  if (typeof window.nurtureize === 'undefined') {
    report('BRIDGE', 'window.nurtureize is undefined — the preload script did not expose its API. Nothing that talks to the app will work.');
  }
})();
