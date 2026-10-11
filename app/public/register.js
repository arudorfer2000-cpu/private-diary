// Registers the offline cache. Same-origin only; if the browser has no service worker the app still works online.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {});
  });
}
