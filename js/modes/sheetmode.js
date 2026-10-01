// Spreadsheet mode (MENU 8): 5 columns (A-E) x 45 rows.
import { Editor, tok, cloneItems, itemsBytes } from '../editor/editor.js';
import { drawExpr, errorScreen, drawResult } from './calcscreen.js';
import { Menu, Message, StoPending } from '../ui/overlays.js';
import { stdOptnItems } from './common.js';
import { cellText, valueItems } from './widgets.js';
import { parseExpr } from '../engine/parser.js';
import { evaluate, runSync } from '../engine/evaluator.js';
import { Real, ZERO_R } from '../engine/real.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { formatValueLines, toPlain } from '../engine/format.js';
import { textWidth } from '../ui/bitmap.js';
import { T } from '../editor/tokens.js';

const COLS = 5, ROWS = 45, CAPACITY = 1700;
const key = (c, r) => c + ',' + r;
const colName = (c) => 'ABCDE'[c];

// find cell references in a linear token list: returns [{start,end,col,row,absC,absR}]
function findRefs(items) {
  const refs = [];
  for (let i = 0; i < items.length; i++) {
    let j = i;
    let absC = false, absR = false;
    if (items[j] && items[j].v === '$') { absC = true; j++; }
    const it = items[j];
    if (!it || it.t !== 'c' || !/^v[A-E]$/.test(it.v)) continue;
    const col = it.v.charCodeAt(1) - 65;
    j++;
    if (items[j] && items[j].v === '$') { absR = true; j++; }
    let s = '';
    while (items[j] && items[j].t === 'c' && /^[0-9]$/.test(items[j].v)) { s += items[j].v; j++; }
    if (!s) continue;
    refs.push({ start: i, end: j, col, row: parseInt(s, 10) - 1, absC, absR });
    i = j - 1;
  }
  return refs;
}
// shift relative references by (dc, dr); out of range -> '?'
function shiftRefs(items, dc, dr) {
  const refs = findRefs(items);
  if (!refs.length) return cloneItems(items);
  const out = [];
  let pos = 0;
  for (const ref of refs) {
    out.push(...cloneItems(items.slice(pos, ref.start)));
    const c = ref.absC ? ref.col : ref.col + dc;
    const r = ref.absR ? ref.row : ref.row + dr;
    if (ref.absC) out.push(tok('$'));
    out.push(c >= 0 && c < COLS ? tok('v' + colName(c)) : tok('?'));
    if (ref.absR) out.push(tok('$'));
    if (r >= 0 && r < ROWS) for (const ch of String(r + 1)) out.push(tok(ch));
    else out.push(tok('?'));
    pos = ref.end;
  }
  out.push(...cloneItems(items.slice(pos)));
  return out;
}
function parseCellName(s) {
  const m = /^\$?([A-E])\$?(\d{1,2})$/.exec(s);
  if (!m) return null;
  const r = parseInt(m[2], 10) - 1;
  if (r < 0 || r >= ROWS) return null;
  return { c: m[1].charCodeAt(0) - 65, r };
}
function itemsText(items) {
  return items.map((it) => (it.t === 'c' ? (it.v.startsWith('v') && it.v.length === 2 ? it.v[1] : (T[it.v] ? T[it.v].s : it.v)) : '')).join('');
}

export class SheetMode {
  constructor(calc) {
    this.calc = calc;
    this.cells = new Map(); // key -> {items, formula, value}
    this.cc = 0; this.cr = 0;
    this.left = 0; this.top = 0;
    this.edit = null; // Editor
    this.grab = null; // {c, r}
    this.paste = null; // {mode:'cut'|'copy', c, r}
    this.fill = null; // {kind, fields:[Editor,Editor], sel, ready}
    this.err = null;
    this.scroll = 0;
  }
  enter() {}

  // ---------- storage / memory ----------
  bytesUsed() {
    let b = 0;
    for (const cell of this.cells.values()) b += cell.formula ? 11 + itemsBytes(cell.items) : 10;
    return b;
  }

  // ---------- evaluation ----------
  ctxFor(stack) {
    return this.calc.ctx({
      cell: (n) => this.refValue(n.col, n.row, stack),
      rangeVals: (rg) => {
        const out = [];
        const c0 = Math.min(rg.a.col, rg.b.col), c1 = Math.max(rg.a.col, rg.b.col);
        const r0 = Math.min(rg.a.row, rg.b.row), r1 = Math.max(rg.a.row, rg.b.row);
        if (c0 < 0 || c1 >= COLS || r0 < 0 || r1 >= ROWS) throw new CalcError('Range');
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
          if (!this.cells.has(key(c, r))) continue;
          out.push(this.refValue(c, r, stack));
        }
        return out;
      },
    });
  }
  refValue(c, r, stack) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) throw new CalcError('Range');
    const cell = this.cells.get(key(c, r));
    if (!cell) return ZERO_R;
    if (!cell.formula) return cell.value instanceof Real ? cell.value : (() => { throw new CalcError('Math'); })();
    if (this.cache && this.cache.has(key(c, r))) {
      const v = this.cache.get(key(c, r));
      if (v instanceof Real) return v;
      throw v;
    }
    const k = key(c, r);
    if (stack.has(k)) throw new CalcError('Circular');
    stack.add(k);
    try {
      const v = this.evalItems(cell.items, stack);
      if (this.cache) this.cache.set(k, v);
      return v;
    } catch (e) {
      const err = asCalcError(e);
      if (this.cache && err.type !== 'Circular') this.cache.set(k, err);
      throw err;
    } finally {
      stack.delete(k);
    }
  }
  evalItems(items, stack) {
    if (items.some((it) => it.v === '?')) throw new CalcError('Range');
    const node = parseExpr(items, { cells: true });
    const v = runSync(evaluate(node, this.ctxFor(stack)));
    if (!(v instanceof Real)) throw new CalcError('Math');
    return v;
  }
  recalcAll() {
    this.cache = new Map();
    let circular = null;
    for (const [k, cell] of this.cells) {
      if (!cell.formula) continue;
      const [c, r] = k.split(',').map(Number);
      try { cell.value = this.refValue(c, r, new Set()); } catch (e) {
        cell.value = 'ERROR';
        if (e.type === 'Circular') circular = e;
      }
    }
    this.cache = null;
    return circular;
  }

  // ---------- editing ----------
  startEdit(initial, existing = false) {
    this.edit = new Editor(true);
    if (existing) {
      const cell = this.cells.get(key(this.cc, this.cr));
      if (cell) this.edit.setItems(cell.formula ? [tok('='), ...cell.items] : this.constItems(cell));
    }
    if (initial) this.applyEditKey(initial);
  }
  constItems(cell) {
    // constants are edited as their value
    const st = { ...this.calc.fmt(), io: 'LL' };
    const s = toPlain(formatValueLines(cell.value, st)[0]);
    const out = [];
    for (const ch of s.replace('⌟', '|')) {
      if (/[0-9.]/.test(ch)) out.push(tok(ch));
      else if (ch === '-') out.push(tok('neg'));
      else if (ch === '|') out.push(tok('⌟'));
    }
    return out;
  }
  applyEditKey(action) {
    const ed = this.edit;
    if (action.startsWith('t:')) {
      const id = action.slice(2);
      const isFormula = ed.root.length && ed.root[0].v === '=';
      const lim = isFormula ? 49 + 1 : 10;
      if (ed.bytes() >= lim && ed.insertMode) return;
      ed.insertToken(id);
    } else if (action.startsWith('p:')) ed.insertTemplate(action.slice(2));
  }
  commitEdit() {
    const ed = this.edit;
    const items = cloneItems(ed.root);
    const k = key(this.cc, this.cr);
    if (!items.length) { this.edit = null; return; }
    const formula = items[0].t === 'c' && items[0].v === '=';
    const body = formula ? items.slice(1) : items;
    if (!body.length) throw new CalcError('Syntax');
    const old = this.cells.get(k);
    if (formula) {
      if (itemsBytes(body) > 49) throw new CalcError('Memory');
      parseExpr(body, { cells: true });
      this.cells.set(k, { items: body, formula: true, value: null });
      if (this.bytesUsed() > CAPACITY) { if (old) this.cells.set(k, old); else this.cells.delete(k); throw new CalcError('Memory'); }
      // circular check for this cell
      this.cache = new Map();
      try { this.cells.get(k).value = this.refValue(this.cc, this.cr, new Set()); } catch (e) {
        this.cache = null;
        if (e.type === 'Circular') { if (old) this.cells.set(k, old); else this.cells.delete(k); throw e; }
        this.cells.get(k).value = 'ERROR';
      }
      this.cache = null;
    } else {
      if (itemsBytes(body) > 10) throw new CalcError('Memory');
      const v = this.evalItems(body, new Set([k]));
      this.cells.set(k, { items: body, formula: false, value: v });
      if (this.bytesUsed() > CAPACITY) { if (old) this.cells.set(k, old); else this.cells.delete(k); throw new CalcError('Memory'); }
    }
    if (this.calc.setup.sheetAuto) this.recalcAll();
    this.edit = null;
    this.move(0, 1);
  }
  move(dc, dr) {
    this.cc = Math.max(0, Math.min(COLS - 1, this.cc + dc));
    this.cr = Math.max(0, Math.min(ROWS - 1, this.cr + dr));
    if (this.cc < this.left) this.left = this.cc;
    if (this.cc > this.left + 3) this.left = this.cc - 3;
    if (this.cr < this.top) this.top = this.cr;
    if (this.cr > this.top + 3) this.top = this.cr - 3;
  }

  // ---------- menus ----------
  gridOptn() {
    const calc = this.calc;
    return new Menu(calc, null, {
      pages: [
        { items: [
          { label: 'Fill Formula', act: () => this.openFill('formula') },
          { label: 'Fill Value', act: () => this.openFill('value') },
          { label: 'Edit Cell', act: () => this.startEdit(null, true) },
          { label: 'Free Space', act: () => calc.openOverlay(new Message(calc, ['Free Space', `${CAPACITY - this.bytesUsed()} bytes`, '', '[AC] :Exit'])) },
        ] },
        { items: [
          { label: 'Cut & Paste', act: () => { this.paste = { mode: 'cut', c: this.cc, r: this.cr }; } },
          { label: 'Copy & Paste', act: () => { this.paste = { mode: 'copy', c: this.cc, r: this.cr }; } },
          { label: 'Delete All', act: () => calc.openOverlay(new Message(calc, ['Delete All?', '', '[=]  :Yes', '[AC] :Cancel'], { onYes: () => { this.cells.clear(); } })) },
          { label: 'Recalculate', act: () => { const e = this.recalcAll(); if (e) this.err = e; } },
        ] },
        { items: stdOptnItems(calc, () => {}) },
      ],
    });
  }
  editOptn() {
    const calc = this.calc;
    const ins = (id) => () => this.applyEditKey('t:' + id);
    return new Menu(calc, null, {
      pages: [
        { items: [
          { label: '$', act: ins('$') },
          { label: 'Grab', act: () => { this.grab = { c: this.cc, r: this.cr }; } },
        ] },
        { items: [
          { label: 'Min', act: ins('Min(') }, { label: 'Max', act: ins('Max(') },
          { label: 'Mean', act: ins('Mean(') }, { label: 'Sum', act: ins('Sum(') },
        ] },
        { items: stdOptnItems(calc, (a) => this.applyEditKey(a)) },
      ],
    });
  }
  openFill(kind) {
    const f1 = new Editor(true), f2 = new Editor(true);
    const name = colName(this.cc) + (this.cr + 1);
    for (const ch of name + ':' + name) f2.insertToken(ch === ':' ? ':' : /[A-E]/.test(ch) ? 'v' + ch : ch);
    f2.idx = 0;
    this.fill = { kind, fields: [f1, f2], sel: 0, ready: false };
  }
  applyFill() {
    const f = this.fill;
    const rtxt = itemsText(f.fields[1].root);
    const parts = rtxt.split(':');
    if (parts.length !== 2) throw new CalcError('Range');
    const a = parseCellName(parts[0]), b = parseCellName(parts[1]);
    if (!a || !b) throw new CalcError('Range');
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c), r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    let src = cloneItems(f.fields[0].root);
    if (src.length && src[0].v === '=') src = src.slice(1);
    if (!src.length) throw new CalcError('Syntax');
    parseExpr(src, { cells: true });
    const backup = new Map(this.cells);
    try {
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
        const items = shiftRefs(src, c - c0, r - r0);
        if (f.kind === 'formula') this.cells.set(key(c, r), { items, formula: true, value: null });
        else {
          const v = this.evalItems(items, new Set());
          this.cells.set(key(c, r), { items, formula: false, value: v });
        }
      }
      if (this.bytesUsed() > CAPACITY) throw new CalcError('Memory');
    } catch (e) { this.cells = backup; throw e; }
    const circ = this.recalcAll();
    this.fill = null;
    if (circ) throw circ;
  }
  doPaste() {
    const p = this.paste;
    const src = this.cells.get(key(p.c, p.r));
    const dst = key(this.cc, this.cr);
    if (!src) { this.cells.delete(dst); } else if (p.mode === 'cut') {
      this.cells.set(dst, { items: cloneItems(src.items), formula: src.formula, value: src.value });
      if (dst !== key(p.c, p.r)) this.cells.delete(key(p.c, p.r));
      this.paste = null;
    } else {
      const items = src.formula ? shiftRefs(src.items, this.cc - p.c, this.cr - p.r) : cloneItems(src.items);
      this.cells.set(dst, { items, formula: src.formula, value: src.value });
    }
    const circ = this.recalcAll();
    if (circ) this.err = circ;
  }

  // ---------- keys ----------
  key(action) {
    if (this.err) { if (['AC', 'LEFT', 'RIGHT'].includes(action)) this.err = null; return true; }
    try { return this.key0(action); } catch (e) { this.err = asCalcError(e); return true; }
  }
  key0(action) {
    const arrows = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
    if (this.fill) {
      const f = this.fill;
      const ed = f.fields[f.sel];
      if (action === 'AC') { this.fill = null; return true; }
      if (action === 'UP' || action === 'DOWN') { f.sel = action === 'UP' ? 0 : 1; f.ready = false; return true; }
      if (action === 'EQ') {
        if (f.sel === 0) { f.sel = 1; f.ready = false; return true; }
        if (f.ready) { this.applyFill(); return true; }
        f.ready = true;
        return true;
      }
      if (action === 'LEFT') { ed.left(); return true; }
      if (action === 'RIGHT') { ed.right(); return true; }
      if (action === 'DEL') { ed.del(); f.ready = false; return true; }
      if (action.startsWith('t:')) { ed.insertToken(action.slice(2)); f.ready = false; }
      return true;
    }
    if (this.grab) {
      if (arrows[action]) {
        const [dc, dr] = arrows[action];
        this.grab.c = Math.max(0, Math.min(COLS - 1, this.grab.c + dc));
        this.grab.r = Math.max(0, Math.min(ROWS - 1, this.grab.r + dr));
        this.scrollTo(this.grab.c, this.grab.r);
        return true;
      }
      if (action === 'EQ') {
        this.edit.insertToken('v' + colName(this.grab.c));
        for (const ch of String(this.grab.r + 1)) this.edit.insertToken(ch);
        this.grab = null;
        this.scrollTo(this.cc, this.cr);
        return true;
      }
      if (action === 'AC') { this.grab = null; this.scrollTo(this.cc, this.cr); }
      return true;
    }
    if (this.edit) {
      const ed = this.edit;
      switch (action) {
        case 'EQ': this.commitEdit(); return true;
        case 'AC': this.edit = null; return true;
        case 'LEFT': ed.left(); return true;
        case 'RIGHT': ed.right(); return true;
        case 'DEL': ed.del(); return true;
        case 'INS': ed.toggleIns(); return true;
        case 'OPTN': { const m = this.editOptn(); m.isOptn = true; this.calc.openOverlay(m); return true; }
        case 'RECALL': this.calc.openOverlay(this.calc.recallScreen((v) => this.applyEditKey('t:' + (v === 'x' ? 'vx' : v === 'y' ? 'vy' : 'v' + v)))); return true;
        case 'CONST': this.calc.openOverlay(this.calc.constMenu((id) => this.applyEditKey('t:' + id))); return true;
        case 'CONV': this.calc.openOverlay(this.calc.convMenu((id) => this.applyEditKey('t:' + id))); return true;
        case 'DMS': this.applyEditKey('t:dms'); return true;
        default: break;
      }
      if (action.startsWith('t:') || action.startsWith('p:')) this.applyEditKey(action);
      return true;
    }
    if (arrows[action]) { const [dc, dr] = arrows[action]; this.move(dc, dr); return true; }
    switch (action) {
      case 'EQ': if (this.paste) this.doPaste(); return true;
      case 'AC': this.paste = null; return true;
      case 'DEL': this.cells.delete(key(this.cc, this.cr)); if (this.calc.setup.sheetAuto) this.recalcAll(); return true;
      case 'OPTN': { const m = this.gridOptn(); m.isOptn = true; this.calc.openOverlay(m); return true; }
      case 'STO': {
        const cell = this.cells.get(key(this.cc, this.cr));
        const v = cell && cell.value instanceof Real ? cell.value : ZERO_R;
        this.calc.openOverlay(new StoPending(this.calc, (n) => { this.calc.mem.vars[n] = v; }));
        return true;
      }
      case 'RECALL':
        this.startEdit(null);
        this.calc.openOverlay(this.calc.recallScreen((v) => this.applyEditKey('t:' + (v === 'x' ? 'vx' : v === 'y' ? 'vy' : 'v' + v))));
        return true;
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) { this.paste = null; this.startEdit(action); }
    return true;
  }
  scrollTo(c, r) {
    if (c < this.left) this.left = c;
    if (c > this.left + 3) this.left = c - 3;
    if (r < this.top) this.top = r;
    if (r > this.top + 3) this.top = r - 3;
  }

  // ---------- render ----------
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (this.fill) return this.renderFill(bm);
    const nw = 11, cw = 45;
    // header
    bm.fill(0, 0, 192, 9);
    for (let i = 0; i < 4; i++) {
      const c = this.left + i;
      bm.text(colName(c), nw + i * cw + 20, 0, 'S', 0);
    }
    for (let k = 0; k < 4; k++) {
      const r = this.top + k;
      const y = 9 + k * 10;
      bm.fill(0, y, nw - 1, 10);
      const rs = String(r + 1);
      bm.text(rs, nw - 2 - (textWidth(rs, 'S') - 1), y + 1, 'S', 0);
      for (let i = 0; i < 4; i++) {
        const c = this.left + i;
        const x = nw + i * cw;
        bm.hline(x, x + cw - 1, y + 9);
        bm.vline(x + cw - 1, y, y + 9);
        const cell = this.cells.get(key(c, r));
        if (cell) {
          const s = cell.value === 'ERROR' || cell.value == null ? (cell.value === 'ERROR' ? 'ERROR' : '') : cellText(cell.value, cw - 4, this.calc);
          bm.text(s, x + cw - 3 - (textWidth(s, 'S') - 1), y + 1, 'S');
        }
        const sel = this.grab ? (c === this.grab.c && r === this.grab.r) : (c === this.cc && r === this.cr);
        if (sel) bm.invert(x, y, cw - 1, 9);
        if (this.paste && c === this.paste.c && r === this.paste.r) bm.dotRect(x, y, cw - 1, 9);
      }
    }
    // edit box
    if (this.grab) { bm.text('Set:[=]', 0, 50, 'L'); return; }
    if (this.edit) {
      bm.fill(0, 48, 192, 15, 0);
      const r = drawExpr(bm, this.edit.root, { x: 0, y: 49, width: 192, line: true, cursor: { path: [], idx: this.edit.idx }, showCursor: this.calc.blink, scroll: this.scroll, clipTop: 48, cursorShape: this.edit.insertMode ? 'bar' : 'under' });
      this.scroll = r.scroll;
      return;
    }
    if (this.paste) { bm.text(this.paste.mode === 'cut' ? 'Cut&Paste' : 'Copy&Paste', 0, 52, 'S'); }
    const cell = this.cells.get(key(this.cc, this.cr));
    if (cell) {
      let items;
      if (cell.formula && this.calc.setup.sheetShow === 'formula') items = [tok('='), ...cell.items];
      else if (cell.value instanceof Real) items = valueItems(cell.value, this.calc);
      else items = [{ t: 'x', s: 'ERROR' }];
      const x0 = 96;
      drawResult(bm, items, 62, { x: x0, width: 96, line: cell.formula });
    }
  }
  renderFill(bm) {
    const f = this.fill;
    bm.text(f.kind === 'formula' ? 'Fill Formula' : 'Fill Value', 0, 0, 'L');
    const labels = [f.kind === 'formula' ? 'Form  =' : 'Value :', 'Range :'];
    for (let i = 0; i < 2; i++) {
      const y = 16 + i * 16;
      const lw = textWidth(labels[i], 'L');
      bm.text(labels[i], 0, y, 'L');
      drawExpr(bm, f.fields[i].root, { x: lw, width: 192 - lw, y, line: true, cursor: i === f.sel ? { path: [], idx: f.fields[i].idx } : null, showCursor: i === f.sel && this.calc.blink, clipTop: y - 1, clipBottom: y + 13, arrows: false });
      if (i === f.sel) bm.invert(0, y - 1, 192, 15);
    }
  }
  status() {}
  onSetup(k) { if (k === 'sheetAuto' && this.calc.setup.sheetAuto) this.recalcAll(); }
  // manual: spreadsheet contents are cleared when exiting the mode, turning off or pressing ON
  onON() { this.cells.clear(); this.edit = null; this.grab = null; this.paste = null; this.fill = null; this.err = null; }
  powerOff() { this.onON(); }
  exit() { this.cells.clear(); }
  recover() { this.edit = null; this.grab = null; this.fill = null; }
  serialize() { return null; }
  restore() {}
  resultText() {
    if (this.err) return this.err.message;
    const out = [];
    for (let r = 0; r < 6; r++) {
      const row = [];
      for (let c = 0; c < 4; c++) {
        const cell = this.cells.get(key(c, r));
        row.push(cell ? (cell.value instanceof Real ? toPlain(formatValueLines(cell.value, this.calc.fmt())[0]) : 'ERROR') : '');
      }
      out.push(row.join(','));
    }
    return out.join(';');
  }
}
