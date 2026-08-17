// Boot splash controller. External file (not inline) because the production
// CSP is script-src 'self' — inline scripts are blocked. Loaded synchronously
// right after the splash markup in index.html.
(function () {
  var splash = document.getElementById('azf-splash');
  if (!splash) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ripple(x, y) {
    if (reduced || splash.classList.contains('azf-hide')) return;
    var r = document.createElement('div');
    r.className = 'azf-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    splash.appendChild(r);
    setTimeout(function () {
      r.remove();
    }, 950);
  }
  splash.addEventListener('pointerdown', function (e) {
    ripple(e.clientX, e.clientY);
  });
  splash.addEventListener('pointermove', function (e) {
    if (e.pressure > 0 || e.buttons) ripple(e.clientX, e.clientY);
  });
  var hidden = false;
  window.__azfSplashHide = function () {
    if (hidden) return;
    hidden = true;
    splash.classList.add('azf-hide');
    setTimeout(function () {
      splash.remove();
    }, 600);
  };
  // Watchdog: never trap the user if the app fails to signal readiness.
  setTimeout(function () {
    window.__azfSplashHide();
  }, 10000);
})();
