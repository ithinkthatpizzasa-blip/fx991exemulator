// Service worker: precaches the whole app (cache-first, works fully offline)
// and updates itself automatically. The file list and version below are
// maintained by `node tools/build-sw.mjs` / `node tools/bump-version.mjs`.
const VERSION = '1.0.0';
const CACHE = 'calc-v' + VERSION;
const PRECACHE = [
  /* BEGIN FILES */
  './',
  './index.html',
  './manifest.json',
  './css/calc.css',
  './js/brand.js',
  './js/calc.js',
  './js/editor/editor.js',
  './js/editor/render.js',
  './js/editor/tokens.js',
  './js/engine/complex.js',
  './js/engine/constants.js',
  './js/engine/decimal.js',
  './js/engine/errors.js',
  './js/engine/evaluator.js',
  './js/engine/fn.js',
  './js/engine/format.js',
  './js/engine/matrix.js',
  './js/engine/parser.js',
  './js/engine/poly.js',
  './js/engine/real.js',
  './js/engine/serial.js',
  './js/engine/stats.js',
  './js/keymap.js',
  './js/main.js',
  './js/modes/all.js',
  './js/modes/basen.js',
  './js/modes/calcscreen.js',
  './js/modes/calculate.js',
  './js/modes/common.js',
  './js/modes/complex.js',
  './js/modes/distmode.js',
  './js/modes/eqnmode.js',
  './js/modes/index.js',
  './js/modes/matrixmode.js',
  './js/modes/sheetmode.js',
  './js/modes/statmode.js',
  './js/modes/tablemode.js',
  './js/modes/widgets.js',
  './js/ui/bitmap.js',
  './js/ui/fontdata.js',
  './js/ui/keyboard.js',
  './js/ui/lcdview.js',
  './js/ui/mainmenu.js',
  './js/ui/overlays.js',
  './js/version.js',
  './fonts/saira-semicondensed-600.woff2',
  './fonts/saira-semicondensed-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  /* END FILES */
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('calc-v') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const INDEX = new URL('./index.html', self.registration.scope).href;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(INDEX).then((r) => r || fetch(req)).catch(() => caches.match(INDEX)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((resp) => {
      if (resp && resp.ok && resp.type === 'basic') {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return resp;
    })),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.source) event.source.postMessage({ version: VERSION });
});
