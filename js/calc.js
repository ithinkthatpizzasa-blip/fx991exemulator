// Calculator core: power, SHIFT/ALPHA, global menus (MENU, SETUP, CONST, CONV,
// RESET, RECALL), memory, persistence, job runner and mode dispatch.
import { Bitmap } from './ui/bitmap.js';
import { resolve } from './keymap.js';
import { Menu, Prompt, Message, Contrast, Overlay } from './ui/overlays.js';
import { MainMenu, MODES } from './ui/mainmenu.js';
import { runSync, runAsync } from './engine/evaluator.js';
import { asCalcError, CalcError } from './engine/errors.js';
import { ZERO_R } from './engine/real.js';
import { ser, de } from './engine/serial.js';
import { CONST_CATEGORIES, CONV_CATEGORIES, constValue, convApply } from './engine/constants.js';
import { createMode } from './modes/index.js';
import { formatValueLines, toPlain } from './engine/format.js';
import { Real } from './engine/real.js';
import { Complex } from './engine/complex.js';
import { Matrix, Vector } from './engine/matrix.js';
import { normDistFn } from './engine/stats.js';

export const STORAGE_VERSION = 1;

export function defaultSetup() {
  return {
    io: 'MM', unit: 'D', numFmt: { type: 'Norm', n: 1 }, engSym: false, frac: 'dc', complex: 'rect',
    statFreq: false, sheetAuto: true, sheetShow: 'formula', eqnComplex: true, table: 'fg',
    decimalMark: '.', digitSep: false, font: 'normal', qr: 11, contrast: 5,
  };
}

const VAR_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'];
export function defaultMem() {
  const vars = {};
  for (const v of VAR_NAMES) vars[v] = ZERO_R;
  return { vars, ans: ZERO_R, mats: { A: null, B: null, C: null, D: null, Ans: null }, vcts: { A: null, B: null, C: null, D: null, Ans: null } };
}

export class Calculator {
  constructor(opts = {}) {
    this.storage = opts.storage || null;
    this.async = !!opts.async;
    this.onChange = opts.onChange || (() => {});
    this.bm = new Bitmap();
    this.overlays = [];
    this.power = true;
    this.shift = false;
    this.alpha = false;
    this.job = null;
    this.setup = defaultSetup();
    this.mem = defaultMem();
    this.modeId = 'calc';
    this.mode = null;
    this.blink = true;
    this.store = {};
    if (!this.load()) this.enterMode('calc');
  }

  // ---------- persistence ----------
  serialize() {
    const vars = {};
    for (const [k, v] of Object.entries(this.mem.vars)) vars[k] = ser(v);
    const mats = {}, vcts = {};
    for (const [k, v] of Object.entries(this.mem.mats)) mats[k] = ser(v);
    for (const [k, v] of Object.entries(this.mem.vcts)) vcts[k] = ser(v);
    let modeState = null;
    try { modeState = this.mode && this.mode.serialize ? this.mode.serialize() : null; } catch (e) { modeState = null; }
    return { v: STORAGE_VERSION, setup: this.setup, mem: { vars, ans: ser(this.mem.ans), mats, vcts }, modeId: this.modeId, modeState, store: this.store, power: this.power };
  }
  save() {
    if (!this.storage) return;
    try { this.storage.save(this.serialize()); } catch (e) { /* storage full / blocked: ignore */ }
  }
  load() {
    if (!this.storage) return false;
    let o = null;
    try { o = this.storage.load(); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || o.v !== STORAGE_VERSION) return false;
    try {
      const setup = { ...defaultSetup(), ...(o.setup || {}) };
      const mem = defaultMem();
      for (const k of VAR_NAMES) if (o.mem && o.mem.vars && o.mem.vars[k]) mem.vars[k] = de(o.mem.vars[k]) || ZERO_R;
      if (o.mem && o.mem.ans) mem.ans = de(o.mem.ans) || ZERO_R;
      for (const k of Object.keys(mem.mats)) if (o.mem && o.mem.mats && o.mem.mats[k]) mem.mats[k] = de(o.mem.mats[k]);
      for (const k of Object.keys(mem.vcts)) if (o.mem && o.mem.vcts && o.mem.vcts[k]) mem.vcts[k] = de(o.mem.vcts[k]);
      this.setup = setup;
      this.mem = mem;
      this.store = o.store && typeof o.store === 'object' ? o.store : {};
      const id = MODES.find((m) => m.id === o.modeId) ? o.modeId : 'calc';
      this.modeId = id;
      this.mode = createMode(id, this);
      if (o.modeState && this.mode.restore) {
        try { this.mode.restore(o.modeState); } catch (e) { this.mode = createMode(id, this); this.mode.enter(); }
      } else this.mode.enter();
      this.power = o.power !== false;
      return true;
    } catch (e) {
      this.setup = defaultSetup();
      this.mem = defaultMem();
      return false;
    }
  }

  changed() { this.onChange(); }

  // ---------- settings helpers ----------
  fmt() {
    const s = this.setup;
    return { io: s.io, numFmt: s.numFmt, mixed: s.frac === 'abc', engSym: s.engSym, decimalMark: s.decimalMark, digitSep: s.digitSep, complexFmt: s.complex, unit: s.unit };
  }
  isMathIn() { return this.setup.io === 'MM' || this.setup.io === 'MD'; }

  // base evaluation context
  ctx(extra = {}) {
    const mem = this.mem;
    const c = {
      unit: this.setup.unit,
      mode: this.modeId,
      getVar: (n) => mem.vars[n] || ZERO_R,
      setVar: (n, v) => { mem.vars[n] = v; },
      ans: mem.ans,
      getMat: () => { throw new CalcError('Syntax'); },
      getVct: () => { throw new CalcError('Syntax'); },
      stat: () => { throw new CalcError('Syntax'); },
      statEst: () => { throw new CalcError('Syntax'); },
      normDist: () => { throw new CalcError('Syntax'); },
      constant: (id) => constValue(id),
      conv: (id, x) => convApply(id, x),
      numFmt: this.setup.numFmt,
      ticks: 0,
      timeLimit: this.async ? 30000 : 0,
    };
    return Object.assign(c, extra);
  }

  // ---------- jobs ----------
  runJob(gen, done, fail) {
    if (!this.async) {
      let v;
      try { v = runSync(gen); } catch (e) { fail(asCalcError(e)); return; }
      done(v);
      return;
    }
    const h = runAsync(gen, (v) => { this.job = null; done(v); this.save(); this.changed(); },
      (e) => { this.job = null; fail(e); this.save(); this.changed(); });
    this.job = h;
    h.step();
  }
  cancelJob() {
    if (!this.job) return;
    this.job.cancel();
    this.job = null;
    if (this.mode.onCancel) this.mode.onCancel();
  }

  // ---------- overlays ----------
  get top() { return this.overlays[this.overlays.length - 1] || null; }
  openOverlay(o) { this.overlays.push(o); }
  closeOverlay(o) {
    const i = this.overlays.indexOf(o);
    if (i >= 0) this.overlays.splice(i, 1);
  }
  replaceOverlay(o, n) {
    const i = this.overlays.indexOf(o);
    if (i >= 0) this.overlays[i] = n; else this.overlays.push(n);
  }
  closeAllOverlays() { this.overlays.length = 0; }

  // ---------- modes ----------
  enterMode(id) {
    if (this.mode && this.mode.exit) this.mode.exit();
    this.modeId = id;
    this.mode = createMode(id, this);
    this.mode.enter();
  }

  // ---------- power ----------
  powerOff() {
    this.power = false;
    this.closeAllOverlays();
    this.shift = this.alpha = false;
    if (this.job) this.cancelJob();
    if (this.mode.powerOff) this.mode.powerOff();
    this.save();
  }
  onKey() {
    // ON: power on / clear history and return to the mode's initial screen
    this.power = true;
    this.closeAllOverlays();
    this.shift = this.alpha = false;
    if (this.mode.onON) this.mode.onON();
    this.save();
  }

  // ---------- keys ----------
  press(key) {
    if (!this.power) {
      if (key === 'on') this.onKey();
      this.changed();
      return;
    }
    if (this.job) {
      if (key === 'ac') this.cancelJob();
      this.changed();
      return;
    }
    if (key === 'shift') { this.shift = !this.shift; this.alpha = false; this.changed(); return; }
    if (key === 'alpha') { this.alpha = !this.alpha; this.shift = false; this.changed(); return; }
    const action = resolve(key, this.shift, this.alpha, this.modeId);
    this.lastMods = { shift: this.shift, alpha: this.alpha };
    this.shift = false;
    this.alpha = false;
    try {
      this.dispatch(key, action);
    } catch (e) {
      // never let an unexpected error lock the calculator
      if (typeof console !== 'undefined') console.error(e);
      this.closeAllOverlays();
      if (this.mode && this.mode.recover) this.mode.recover(e);
    }
    this.blink = true;
    this.save();
    this.changed();
  }

  dispatch(key, action) {
    if (action === 'ON') return this.onKey();
    if (action === 'OFF') return this.powerOff();
    const top = this.top;
    if (top) {
      const consumed = top.key(key, action);
      if (consumed !== false) return;
    }
    switch (action) {
      case 'MENU': return this.openOverlay(new MainMenu(this));
      case 'SETUP': return this.openOverlay(this.setupMenu());
      case 'RESET': return this.openOverlay(this.resetMenu());
      case 'QR': return this.openOverlay(new Message(this, ['QR Code', 'not available', 'in this app.', '[AC] :Exit'], {}));
      default: break;
    }
    if (action == null) return;
    this.mode.key(action, key);
  }

  // ---------- render ----------
  render() {
    const bm = this.bm;
    bm.clear();
    bm.noClip();
    const f = { S: this.shift, A: this.alpha };
    if (!this.power) return { off: true };
    const top = this.top;
    if (top && !top.transparent) top.render(bm);
    else this.mode.render(bm);
    bm.noClip();
    const s = this.setup;
    const Mv = this.mem.vars.M;
    f.M = !!Mv && !((Mv instanceof Real || Mv instanceof Complex) && Mv.isZero());
    f.unit = s.unit;
    if (s.numFmt.type === 'Fix') f.FIX = true;
    if (s.numFmt.type === 'Sci') f.SCI = true;
    f.Math = s.io === 'MM' || s.io === 'MD';
    f.E = s.engSym;
    if (this.mode.status) this.mode.status(f);
    for (const o of this.overlays) if (o.status) o.status(f);
    if (top && !top.transparent) { f.up = f.down = false; f.Disp = false; }
    if (this.job) f.busy = true;
    return f;
  }

  // ---------- global menus ----------
  setupMenu() {
    const s = this.setup;
    const set = (k, v, after) => () => { const old = s[k]; s[k] = v; if (after) after(old); if (this.mode.onSetup) this.mode.onSetup(k, old); };
    const ioItems = [['MathI/MathO', 'MM'], ['MathI/DecimalO', 'MD'], ['LineI/LineO', 'LL'], ['LineI/DecimalO', 'LD']];
    const sub = (items) => () => new Menu(this, items);
    const items = [
      { label: 'Input/Output', sub: sub(ioItems.map(([l, v]) => ({ label: l, act: set('io', v) }))) },
      { label: 'Angle Unit', sub: sub([['Degree', 'D'], ['Radian', 'R'], ['Gradian', 'G']].map(([l, v]) => ({ label: l, act: set('unit', v) }))) },
      {
        label: 'Number Format',
        sub: sub([
          { label: 'Fix', act: () => this.openOverlay(new Prompt(this, 'Fix  0~9?', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (n) => { s.numFmt = { type: 'Fix', n }; })) },
          { label: 'Sci', act: () => this.openOverlay(new Prompt(this, 'Sci  0~9?', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (n) => { s.numFmt = { type: 'Sci', n }; })) },
          { label: 'Norm', act: () => this.openOverlay(new Prompt(this, 'Norm  1~2?', [1, 2], (n) => { s.numFmt = { type: 'Norm', n }; })) },
        ]),
      },
      { label: 'Engineer Symbol', sub: sub([{ label: 'On', act: set('engSym', true) }, { label: 'Off', act: set('engSym', false) }]) },
      { label: 'Fraction Result', sub: sub([{ label: 'ab/c', act: set('frac', 'abc') }, { label: 'd/c', act: set('frac', 'dc') }]) },
      { label: 'Complex', sub: sub([{ label: '𝑎+𝑏𝑖', act: set('complex', 'rect') }, { label: '𝑟∠θ', act: set('complex', 'polar') }]) },
      { label: 'Statistics', sub: sub([{ label: 'On', act: set('statFreq', true) }, { label: 'Off', act: set('statFreq', false) }]) },
      {
        label: 'Spreadsheet',
        sub: sub([
          { label: 'Auto Calc', sub: sub([{ label: 'On', act: set('sheetAuto', true) }, { label: 'Off', act: set('sheetAuto', false) }]) },
          { label: 'Show Cell', sub: sub([{ label: 'Formula', act: set('sheetShow', 'formula') }, { label: 'Value', act: set('sheetShow', 'value') }]) },
        ]),
      },
      { label: 'Equation/Func', sub: sub([{ label: 'On', act: set('eqnComplex', true) }, { label: 'Off', act: set('eqnComplex', false) }]) },
      { label: 'Table', sub: sub([{ label: '𝑓(𝑥)', act: set('table', 'f') }, { label: '𝑓(𝑥),𝑔(𝑥)', act: set('table', 'fg') }]) },
      { label: 'Decimal Mark', sub: sub([{ label: 'Dot', act: set('decimalMark', '.') }, { label: 'Comma', act: set('decimalMark', ',') }]) },
      { label: 'Digit Separator', sub: sub([{ label: 'On', act: set('digitSep', true) }, { label: 'Off', act: set('digitSep', false) }]) },
      { label: 'MultiLine Font', sub: sub([{ label: 'Normal Font', act: set('font', 'normal') }, { label: 'Small Font', act: set('font', 'small') }]) },
      { label: 'QR Code', sub: sub([{ label: 'Version 3', act: set('qr', 3) }, { label: 'Version 11', act: set('qr', 11) }]) },
      { label: 'Contrast', act: () => this.openOverlay(new Contrast(this)) },
    ];
    return new Menu(this, items);
  }

  resetMenu() {
    const done = (what) => this.openOverlay(new Message(this, [what, { s: 'Complete!', center: true }, '', { s: 'Press [AC] Key', center: true }], {}));
    const confirm = (title, fn, what) => () => this.openOverlay(new Message(this, [title, '', '[=]  :Yes', '[AC] :Cancel'], { onYes: () => { fn(); done(what); } }));
    return new Menu(this, [
      { label: 'Setup Data', act: confirm('Reset Setup?', () => this.resetSetup(), 'Reset Setup') },
      { label: 'Memory', act: confirm('Clear Memory?', () => this.resetMemory(), 'Clear Memory') },
      { label: 'Initialize All', act: confirm('Initialize All?', () => this.resetAll(), 'Initialize All') },
    ]);
  }
  resetSetup() {
    const contrast = this.setup.contrast;
    this.setup = defaultSetup();
    this.setup.contrast = contrast;
    this.enterMode('calc');
  }
  resetMemory() {
    const m = defaultMem();
    this.mem.vars = m.vars;
    this.mem.ans = m.ans;
    this.mem.mats = m.mats;
    this.mem.vcts = m.vcts;
    if (this.mode.onMemoryReset) this.mode.onMemoryReset();
  }
  resetAll() {
    const contrast = this.setup.contrast;
    this.setup = defaultSetup();
    this.setup.contrast = contrast;
    this.mem = defaultMem();
    this.store = {};
    this.enterMode('calc');
  }

  // CONST / CONV menus; cb receives a token id
  constMenu(cb) {
    const cats = CONST_CATEGORIES.map(([name, list]) => ({
      label: name,
      sub: () => new Menu(this, list.map(([n, , id]) => ({ label: n, act: () => cb(id) })), { cols: 3, font: 'S', rows: 6 }),
    }));
    return new Menu(this, cats);
  }
  convMenu(cb) {
    const cats = CONV_CATEGORIES.map(([name, list]) => ({
      label: name,
      sub: () => new Menu(this, list.map(([n, , , id]) => ({ label: n, act: () => cb(id) })), { cols: 2, font: 'S', rows: 6 }),
    }));
    return new Menu(this, cats);
  }

  // RECALL screen; cb(var) when a variable key is pressed
  recallScreen(cb) {
    const calc = this;
    const o = new Overlay(this);
    o.status = (f) => { f.RCL = true; };
    o.key = (key, action) => {
      if (action === 'ON' || action === 'OFF') return false;
      const VK = { neg: 'A', dms: 'B', inv: 'C', sin: 'D', cos: 'E', tan: 'F', mplus: 'M', rpar: 'x', xvar: 'x', sd: 'y' };
      if (VK[key]) { calc.closeOverlay(o); cb(VK[key]); return true; }
      if (action === 'AC') calc.closeOverlay(o);
      return true;
    };
    o.render = (bm) => {
      const st = { ...calc.fmt(), io: 'LL', numFmt: { type: 'Norm', n: 1 }, engSym: false, mixed: false };
      const show = (name, v, x, y) => {
        let s;
        try {
          if (v instanceof Real || v instanceof Complex) s = formatValueLines(v, st).map((l) => toPlainLcd(l)).join('');
          else s = '0';
        } catch (e) { s = '?'; }
        bm.text(name + '=' + s, x, y, 'S');
      };
      const V = calc.mem.vars;
      const order = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['M', 'x'], ['y', null]];
      order.forEach(([a, b], r) => {
        show(a === 'x' ? '𝑥' : a, V[a], 0, r * 10 + 1);
        if (b) show(b === 'x' ? '𝑥' : b, V[b], 98, r * 10 + 1);
      });
    };
    return o;
  }

  normDist() { return normDistFn; }
}

// plain text with LCD glyphs (for one-line compact displays)
export function toPlainLcd(items) {
  let out = '';
  for (const it of items) {
    if (it.t === 'x') out += it.s;
    else if (it.t === 'frac') out += toPlainLcd(it.s[0]) + '⌟' + toPlainLcd(it.s[1]);
    else if (it.t === 'mixed') out += toPlainLcd(it.s[0]) + '⌟' + toPlainLcd(it.s[1]) + '⌟' + toPlainLcd(it.s[2]);
    else if (it.t === 'sqrt') out += '√(' + toPlainLcd(it.s[0]) + ')';
    else if (it.t === 'pow') out += '^{' + toPlainLcd(it.s[0]) + '}';
  }
  return out;
}

export { toPlain, Matrix, Vector };
