// App bootstrap: builds the UI, connects input, rendering, persistence,
// power management and the service worker (offline + auto update).
import { Calculator } from './calc.js';
import { buildCalculator, KEYBOARD } from './ui/keyboard.js';
import { LcdView } from './ui/lcdview.js';
import { APP_VERSION } from './version.js';
import { LOGO_SRC } from './brand.js';
import './modes/all.js';

console.info(`SciCalc EX version ${APP_VERSION}`);

const STATE_KEY = 'scicalc.state.v1';
const PREFS_KEY = 'scicalc.prefs.v1';
const AUTO_OFF_MS = 10 * 60 * 1000; // manual: turns off after ~10 minutes of non-use

// ---------- storage (every access guarded; corrupt data falls back to defaults) ----------
function readJSON(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}
let pendingState = null, saveTimer = 0;
const storage = {
  load: () => readJSON(STATE_KEY),
  save: (o) => {
    pendingState = o;
    if (!saveTimer) saveTimer = setTimeout(flushSave, 250);
  },
};
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (pendingState) { writeJSON(STATE_KEY, pendingState); pendingState = null; }
}

const prefs = Object.assign({ vibrate: true, sound: false }, readJSON(PREFS_KEY) || {});

// ---------- UI ----------
const face = document.getElementById('face');
let calc = null;
let lastActivity = Date.now();
const ui = buildCalculator(face, (k) => onKey(k));
const lcd = new LcdView(ui.canvas);

let frame = 0;
function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}
function draw() {
  frame = 0;
  if (!calc) return;
  const flags = calc.render();
  lcd.draw(calc.bm, flags, calc.setup.contrast);
}

calc = new Calculator({ storage, async: true, onChange: schedule });
window.__calc = calc; // handy for debugging in the console

let audioCtx = null;
function click() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 1900;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.035);
  } catch (e) { /* audio unsupported */ }
}

function onKey(k) {
  lastActivity = Date.now();
  if (prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } }
  if (prefs.sound) click();
  calc.press(k);
}

// ---------- physical keyboard ----------
window.addEventListener('keydown', (e) => {
  if (!document.getElementById('settings').hidden) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const m = KEYBOARD[e.key];
  if (!m) return;
  e.preventDefault();
  const seq = Array.isArray(m) ? m : [m];
  for (const k of seq) {
    const elk = ui.keys[k];
    if (elk) { elk.classList.add('down'); setTimeout(() => elk.classList.remove('down'), 90); }
    onKey(k);
  }
});

// ---------- cursor blink & auto power-off ----------
setInterval(() => {
  if (!calc.power) return;
  calc.blink = !calc.blink;
  schedule();
}, 500);
setInterval(() => {
  if (calc.power && !calc.job && Date.now() - lastActivity > AUTO_OFF_MS) {
    calc.powerOff();
    schedule();
  }
}, 15000);

// ---------- resize ----------
const ro = new ResizeObserver(() => { lcd.resize(); schedule(); });
ro.observe(ui.canvas);
window.addEventListener('resize', () => { lcd.resize(); schedule(); });
schedule();

// prevent pinch zoom / double-tap zoom / scrolling
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !e.target.closest('#settings')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- settings sheet ----------
const sheet = document.getElementById('settings');
const optV = document.getElementById('opt-vibrate'), optS = document.getElementById('opt-sound');
document.getElementById('app-version').textContent = APP_VERSION;
optV.checked = !!prefs.vibrate;
optS.checked = !!prefs.sound;
optV.addEventListener('change', () => { prefs.vibrate = optV.checked; writeJSON(PREFS_KEY, prefs); });
optS.addEventListener('change', () => { prefs.sound = optS.checked; writeJSON(PREFS_KEY, prefs); });
document.getElementById('settings-btn').addEventListener('click', () => { sheet.hidden = false; });
document.getElementById('opt-close').addEventListener('click', () => { sheet.hidden = true; });
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.hidden = true; });
if (!navigator.vibrate) optV.parentElement.style.display = 'none';

// ---------- owner logo (set LOGO_SRC in js/brand.js) ----------
if (LOGO_SRC) {
  const img = new Image();
  img.alt = '';
  img.onload = () => { ui.brand.textContent = ''; ui.brand.appendChild(img); ui.brand.classList.add('has-logo'); };
  img.src = LOGO_SRC;
}

// ---------- persistence on background / close ----------
let updateReady = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    calc.save();
    flushSave();
    // apply a downloaded update while the app is idle in the background
    if (updateReady && !calc.job && Date.now() - lastActivity > 2000) location.reload();
  } else if (swReg) {
    swReg.update().catch(() => {});
  }
});
window.addEventListener('pagehide', () => { calc.save(); flushSave(); });

// ---------- service worker: offline + automatic updates ----------
let swReg = null;
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // a new version took control; never reload in the middle of use
    if (hadController) updateReady = true;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      swReg = reg;
      reg.update().catch(() => {});
    }).catch((e) => console.warn('SW registration failed', e));
  });
}
