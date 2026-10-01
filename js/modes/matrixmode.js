// Matrix mode (MENU 4) and Vector mode (MENU 5)
import { CalcScreen } from './calcscreen.js';
import { Menu, Prompt, StoPending } from '../ui/overlays.js';
import { stdOptnItems, serCalcScreen, restoreCalcScreen } from './common.js';
import { ValueInput, cellText, valueItems, drawResult } from './widgets.js';
import { Matrix, Vector } from '../engine/matrix.js';
import { ZERO_R } from '../engine/real.js';
import { CalcError } from '../engine/errors.js';
import { errorScreen } from './calcscreen.js';
import { MAT_KEYS } from '../keymap.js';

const OP_KEYS = new Set(['t:+', 't:-', 't:×', 't:÷', 't:⁻¹', 't:²', 't:³']);

class ArrayMode {
  constructor(calc, kind) {
    this.calc = calc;
    this.kind = kind; // 'mat' | 'vct'
    this.P = kind === 'mat' ? 'Mat' : 'Vct';
    this.screen = 'calc'; // 'calc' | 'edit' | 'ans'
    this.editVar = 'A';
    this.cr = 0;
    this.cc = 0;
    this.input = null;
    this.err = null;
    const self = this;
    const store = kind === 'mat' ? calc.mem.mats : calc.mem.vcts;
    this.store = () => (kind === 'mat' ? calc.mem.mats : calc.mem.vcts);
    void store;
    this.cs = new CalcScreen(calc, {
      ctx: () => calc.ctx({
        getMat: (n) => { const m = calc.mem.mats[n]; if (!m || kind !== 'mat') throw new CalcError('Dimension'); return m; },
        getVct: (n) => { const v = calc.mem.vcts[n]; if (!v || kind !== 'vct') throw new CalcError('Dimension'); return v; },
      }),
      onValue: (v, cs, last) => {
        if ((kind === 'mat' && v instanceof Matrix) || (kind === 'vct' && v instanceof Vector)) {
          self.store().Ans = v;
          if (last) { self.screen = 'ans'; self.cr = 0; self.cc = 0; }
          return true;
        }
        if (v instanceof Matrix || v instanceof Vector) throw new CalcError('Syntax');
        return false;
      },
      optnMenu: (cb) => self.optn(cb),
      stoKeys: undefined,
    });
  }

  dimsOf(v) {
    if (!v) return null;
    return this.kind === 'mat' ? [v.r, v.c] : [v.n, 1];
  }
  get(name) { return this.store()[name]; }

  // ----- menus -----
  varMenu(cb, withDims = true) {
    const items = ['A', 'B', 'C', 'D'].map((n) => {
      const v = this.get(n);
      let label = this.P + n;
      if (withDims && v) label += this.kind === 'mat' ? `:${v.r}×${v.c}` : `:${v.n}`;
      return { label, act: () => cb(n) };
    });
    return new Menu(this.calc, items, { cols: 1 });
  }
  defineFlow() {
    const calc = this.calc;
    calc.openOverlay(this.varMenu((n) => {
      if (this.kind === 'mat') {
        calc.openOverlay(new Prompt(calc, 'Number of Rows?\nSelect 1~4', [1, 2, 3, 4], (r) => {
          calc.openOverlay(new Prompt(calc, 'Number of Columns?\nSelect 1~4', [1, 2, 3, 4], (c) => {
            this.store()[n] = Matrix.zeros(r, c);
            this.openEditor(n);
          }));
        }));
      } else {
        calc.openOverlay(new Prompt(calc, 'Dimension?\nSelect 2~3', [2, 3], (d) => {
          this.store()[n] = Vector.zeros(d);
          this.openEditor(n);
        }));
      }
    }));
  }
  editFlow() {
    this.calc.openOverlay(this.varMenu((n) => {
      if (!this.get(n)) { this.err = new CalcError('Dimension'); return; }
      this.openEditor(n);
    }));
  }
  openEditor(n) {
    this.screen = 'edit';
    this.editVar = n;
    this.cr = 0;
    this.cc = 0;
    this.input = null;
  }
  optn(cb) {
    const calc = this.calc;
    const P = this.P;
    const tok = (n) => () => cb('t:' + P + n);
    const page1 = { cols: 2, font: 'S', rows: 3, items: [
      { label: `Define ${this.kind === 'mat' ? 'Matrix' : 'Vector'}`, act: () => this.defineFlow() },
      { label: `Edit ${this.kind === 'mat' ? 'Matrix' : 'Vector'}`, act: () => this.editFlow() },
      { label: P + 'A', act: tok('A') }, { label: P + 'B', act: tok('B') },
      { label: P + 'C', act: tok('C') }, { label: P + 'D', act: tok('D') },
    ] };
    const page2 = this.kind === 'mat'
      ? { items: [
        { label: 'MatAns', act: tok('Ans') },
        { label: 'Determinant', act: () => cb('t:Det(') },
        { label: 'Transposition', act: () => cb('t:Trn(') },
        { label: 'Identity', act: () => cb('t:Identity(') },
      ] }
      : { items: [
        { label: 'VctAns', act: tok('Ans') },
        { label: 'Dot Product', act: () => cb('t:•') },
        { label: 'Angle', act: () => cb('t:Angle(') },
        { label: 'Unit Vector', act: () => cb('t:UnitV(') },
      ] };
    return new Menu(calc, null, { pages: [page1, page2, { items: stdOptnItems(calc, cb) }] });
  }

  enter() {
    // the Define dialog appears when the mode is entered
    this.screen = 'calc';
    this.defineFlow();
  }

  // ----- keys -----
  key(action, key) {
    if (this.err) {
      if (action === 'AC' || action === 'LEFT' || action === 'RIGHT') this.err = null;
      return true;
    }
    if (this.screen === 'calc') return this.cs.key(action, key);
    const v = this.screen === 'ans' ? this.get('Ans') : this.get(this.editVar);
    if (!v) { this.screen = 'calc'; return true; }
    const [R, Cc] = this.dimsOf(v);
    if (this.input) {
      if (action === 'EQ') {
        try {
          const val = this.input.evalReal();
          this.setCell(v, this.cr, this.cc, val);
        } catch (e) { this.err = e instanceof CalcError ? e : new CalcError('Math'); return true; }
        this.input = null;
        this.advance(R, Cc);
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'LEFT': this.cc = (this.cc + Cc - 1) % Cc; return true;
      case 'RIGHT': this.cc = (this.cc + 1) % Cc; return true;
      case 'UP': this.cr = (this.cr + R - 1) % R; return true;
      case 'DOWN': this.cr = (this.cr + 1) % R; return true;
      case 'AC': this.screen = 'calc'; this.cs.editor.clear(); this.cs.state = 'input'; return true;
      case 'EQ': if (this.screen === 'edit') this.advance(R, Cc); return true;
      case 'OPTN': {
        const m = this.optn((a) => {
          this.screen = 'calc';
          this.cs.editor.clear();
          this.cs.state = 'input';
          this.cs.insert(a);
        });
        m.isOptn = true;
        this.calc.openOverlay(m);
        return true;
      }
      case 'STO':
        this.calc.openOverlay(new StoPending(this.calc, (n) => {
          this.store()[n] = v;
          this.openEditor(n);
        }, MAT_KEYS));
        return true;
      default: break;
    }
    if (this.screen === 'ans' && (OP_KEYS.has(action))) {
      this.screen = 'calc';
      const cs = this.cs;
      cs.editor.clear();
      cs.state = 'input';
      cs.editor.insertToken(this.P + 'Ans');
      cs.insert(action);
      return true;
    }
    if (this.screen === 'edit' && (action.startsWith('t:') || action.startsWith('p:'))) {
      this.input = new ValueInput(this.calc);
      this.input.key(action);
      return true;
    }
    return true;
  }
  advance(R, Cc) {
    if (this.cc < Cc - 1) this.cc++;
    else { this.cc = 0; this.cr = (this.cr + 1) % R; }
  }
  setCell(v, r, c, val) {
    if (this.kind === 'mat') v.a[r][c] = val;
    else v.a[r] = val;
  }
  cell(v, r, c) { return this.kind === 'mat' ? v.a[r][c] : v.a[r]; }

  // ----- render -----
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (this.screen === 'calc') { this.cs.render(bm); return; }
    const name = this.screen === 'ans' ? this.P + 'Ans' : this.P + this.editVar;
    const v = this.get(this.screen === 'ans' ? 'Ans' : this.editVar);
    if (!v) return;
    bm.text(name + '=', 0, 0, 'S');
    const [R, Cc] = this.dimsOf(v);
    const cw = Cc === 1 ? 60 : Math.min(62, Math.floor(176 / Cc));
    const rh = 10;
    const gx = Math.max(4, Math.floor((192 - cw * Cc) / 2));
    const gy = 10;
    // brackets
    const top = gy - 1, bot = gy + R * rh;
    bm.vline(gx - 3, top, bot); bm.hline(gx - 3, gx - 1, top); bm.hline(gx - 3, gx - 1, bot);
    const rx = gx + cw * Cc + 2;
    bm.vline(rx, top, bot); bm.hline(rx - 2, rx, top); bm.hline(rx - 2, rx, bot);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < Cc; c++) {
        const s = cellText(this.cell(v, r, c), cw - 3, this.calc);
        const x = gx + c * cw, y = gy + r * rh;
        const w = textW(s);
        bm.text(s, x + cw - 2 - w, y + 1, 'S');
        if (r === this.cr && c === this.cc) bm.invert(x, y, cw, rh);
      }
    }
    if (this.input) {
      bm.fill(0, 47, 192, 16, 0);
      this.input.draw(bm, 48);
    } else if (R <= 3) {
      drawResult(bm, valueItems(this.cell(v, this.cr, this.cc), this.calc), 62);
    }
  }
  status(f) { if (this.screen === 'calc') this.cs.status(f); }
  onSetup(k) { if (k === 'io') this.cs.resetIO(); }
  onON() { this.cs.clearAll(); this.screen = 'calc'; this.input = null; this.err = null; }
  onCancel() { this.cs.onCancel(); }
  recover() { this.cs.resetIO(); this.screen = 'calc'; this.input = null; }
  serialize() { return { cs: serCalcScreen(this.cs), screen: this.screen === 'edit' ? 'edit' : 'calc', editVar: this.editVar }; }
  restore(o) {
    restoreCalcScreen(this.cs, o && o.cs);
    if (o && o.screen === 'edit' && this.get(o.editVar)) this.openEditor(o.editVar);
  }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen === 'ans') {
      const v = this.get('Ans');
      const [R, Cc] = this.dimsOf(v);
      const rows = [];
      for (let r = 0; r < R; r++) {
        const row = [];
        for (let c = 0; c < Cc; c++) row.push(cellText(this.cell(v, r, c), 999, this.calc));
        rows.push(row.join(','));
      }
      return '[' + rows.join(';') + ']';
    }
    return null;
  }
}

import { textWidth } from '../ui/bitmap.js';
const textW = (s) => textWidth(s, 'S') - 1;

export class MatrixMode extends ArrayMode { constructor(calc) { super(calc, 'mat'); } }
export class VectorMode extends ArrayMode { constructor(calc) { super(calc, 'vct'); } }
export { ZERO_R };
