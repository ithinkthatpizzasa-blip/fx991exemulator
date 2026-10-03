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

// Key vibration strength 0-100 %. The Vibration API only takes a duration, so the
// strength is the pulse length: 30 % = the original 8 ms pulse, 100 % = 27 ms.
const VIBRATE_DEFAULT = 50;
const VIBRATE_MS_PER_PCT = 8 / 30;
const savedPrefs = readJSON(PREFS_KEY) || {};
const prefs = Object.assign({ vibration: VIBRATE_DEFAULT, sound: false }, savedPrefs);
if (typeof prefs.vibrate === 'boolean') {
  // settings saved by the old on/off checkbox: off stays off, on gets the new default
  if (!('vibration' in savedPrefs)) prefs.vibration = prefs.vibrate ? VIBRATE_DEFAULT : 0;
  delete prefs.vibrate;
}
const vib = Number(prefs.vibration);
prefs.vibration = Number.isFinite(vib) ? Math.min(100, Math.max(0, Math.round(vib))) : VIBRATE_DEFAULT;
function vibrate() {
  const pct = prefs.vibration;
  if (pct <= 0 || !navigator.vibrate) return;
  try { navigator.vibrate(Math.max(1, Math.round(pct * VIBRATE_MS_PER_PCT))); } catch (e) { /* ignore */ }
}

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

let audioCtx = null, clickBuf = null;
// A soft plastic "tick" + low "thock" (like a quiet rubber-dome keypad),
// synthesised once into a buffer instead of a raw oscillator beep.
function makeClickBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 0.05);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const k = (fc) => 1 - Math.exp((-2 * Math.PI * fc) / sr);
  const a1 = k(5000), a2 = k(900);
  let seed = 12345, lp1 = 0, lp2 = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    lp1 += a1 * ((seed / 0x3fffffff - 1) - lp1);
    lp2 += a2 * (lp1 - lp2);
    const band = lp1 - lp2; // band-passed noise: the plastic contact
    const t2 = t - 0.011; // key bottoming out a moment later
    let v = band * Math.exp(-t / 0.004) + (t2 > 0 ? 0.45 * band * Math.exp(-t2 / 0.003) : 0);
    v += 0.3 * Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.012); // body
    v += 0.15 * Math.sin(2 * Math.PI * 430 * t) * Math.exp(-t / 0.005);
    v *= Math.min(1, t / 0.0003); // no pop at the start
    d[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) d[i] /= peak;
  return buf;
}
function click() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!clickBuf) clickBuf = makeClickBuffer(audioCtx);
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
    src.buffer = clickBuf;
    src.playbackRate.value = 0.92 + Math.random() * 0.16; // slight variation, less robotic
    g.gain.value = 0.35;
    src.connect(g).connect(audioCtx.destination);
    src.start();
  } catch (e) { /* audio unsupported */ }
}

function onKey(k) {
  lastActivity = Date.now();
  vibrate();
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
const optV = document.getElementById('opt-vibrate'), optVval = document.getElementById('opt-vibrate-val');
const optS = document.getElementById('opt-sound');
document.getElementById('app-version').textContent = APP_VERSION;
const showVibration = () => { optVval.textContent = prefs.vibration + '%'; };
optV.value = String(prefs.vibration);
showVibration();
optS.checked = !!prefs.sound;
optV.addEventListener('input', () => { prefs.vibration = Number(optV.value); showVibration(); });
// save and give a sample pulse at the chosen strength when the slider is released
optV.addEventListener('change', () => { prefs.vibration = Number(optV.value); showVibration(); writeJSON(PREFS_KEY, prefs); vibrate(); });
optS.addEventListener('change', () => { prefs.sound = optS.checked; writeJSON(PREFS_KEY, prefs); });
document.getElementById('settings-btn').addEventListener('click', () => { sheet.hidden = false; });
document.getElementById('opt-close').addEventListener('click', () => { sheet.hidden = true; });
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.hidden = true; });
if (!navigator.vibrate) document.getElementById('opt-vibrate-row').style.display = 'none';

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
