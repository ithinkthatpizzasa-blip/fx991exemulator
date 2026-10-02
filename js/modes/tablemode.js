// Table mode (MENU 9): number table of f(x) (and g(x)).
import { Editor, cloneItems } from '../editor/editor.js';
import { drawExpr, errorScreen } from './calcscreen.js';
import { Menu } from '../ui/overlays.js';
import { stdOptnItems } from './common.js';
import { ValueInput, cellText, valueItems, drawResult } from './widgets.js';
import { parseExpr } from '../engine/parser.js';
import { evaluate, runSync } from '../engine/evaluator.js';
import * as R from '../engine/real.js';
import { Real, ZERO_R, ONE_R } from '../engine/real.js';
import { Dec } from '../engine/decimal.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { ser, de } from '../engine/serial.js';
import { formatValueLines, toPlain } from '../engine/format.js';
import { textWidth } from '../ui/bitmap.js';

export class TableMode {
  constructor(calc) {
    this.calc = calc;
    const st = calc.store.table || {};
    const line = !calc.isMathIn();
    this.f = st.line === line && Array.isArray(st.f) ? st.f : [];
    this.g = st.line === line && Array.isArray(st.g) ? st.g : [];
    this.range = {
      start: st.range ? de(st.range.start) || ONE_R : ONE_R,
      end: st.range ? de(st.range.end) || Real.int(5) : Real.int(5),
      step: st.range ? de(st.range.step) || ONE_R : ONE_R,
    };
    this.screen = 'f';
    this.ed = new Editor(line);
    this.ed.setItems(this.f);
    this.rsel = 0;
    this.input = null;
    this.rows = [];
    this.sel = 0;
    this.col = 0;
    this.top = 0;
    this.err = null;
    this.scroll = 0;
  }
  get fg() { return this.calc.setup.table === 'fg'; }
  persist() {
    this.calc.store.table = {
      line: !this.calc.isMathIn(), f: cloneItems(this.f), g: cloneItems(this.g),
      range: { start: ser(this.range.start), end: ser(this.range.end), step: ser(this.range.step) },
    };
  }
  enter() { this.screen = 'f'; this.ed = new Editor(!this.calc.isMathIn()); this.ed.setItems(this.f); }

  evalAt(items, x) {
    if (!items.length) return null;
    const node = parseExpr(items, {});
    const ctx = this.calc.ctx();
    this.calc.mem.vars.x = x;
    const v = runSync(evaluate(node, ctx));
    if (!(v instanceof Real)) throw new CalcError('Math');
    return v;
  }
  rowFor(x) {
    const row = { x, f: null, g: null };
    try { row.f = this.evalAt(this.f, x); } catch (e) { row.f = 'ERROR'; }
    if (this.fg && this.g.length) { try { row.g = this.evalAt(this.g, x); } catch (e) { row.g = 'ERROR'; } }
    return row;
  }
  generate() {
    const { start, end, step } = this.range;
    if (step.isZero() || (R.cmp(end, start) < 0 && step.sign() > 0) || (R.cmp(end, start) > 0 && step.sign() < 0)) throw new CalcError('Range');
    const count = R.div(R.sub(end, start), step).d.floor().toNumber() + 1;
    const max = this.fg && this.g.length ? 30 : 45;
    if (count > max || count < 1) throw new CalcError('Range');
    // syntax check first
    parseExpr(this.f, {});
    if (this.fg && this.g.length) parseExpr(this.g, {});
    this.rows = [];
    for (let i = 0; i < count; i++) this.rows.push(this.rowFor(R.add(start, R.mul(Real.int(i), step))));
    this.sel = 0; this.col = 0; this.top = 0;
    this.screen = 'table';
  }

  key(action) {
    if (this.err) {
      if (action === 'AC') { this.err = null; return true; }
      if (action === 'LEFT' || action === 'RIGHT') { this.err = null; return true; }
      return true;
    }
    if (this.screen === 'f' || this.screen === 'g') return this.funcKey(action);
    if (this.screen === 'range') return this.rangeKey(action);
    return this.tableKey(action);
  }
  funcKey(action) {
    const ed = this.ed;
    if (action.startsWith('t:') || action.startsWith('p:')) {
      if (action.startsWith('t:')) ed.insertToken(action.slice(2)); else ed.insertTemplate(action.slice(2));
      return true;
    }
    switch (action) {
      case 'LEFT': ed.left(); return true;
      case 'RIGHT': ed.right(); return true;
      case 'SLEFT': ed.jumpOut(false); return true;
      case 'SRIGHT': ed.jumpOut(true); return true;
      case 'UP': case 'DOWN': ed.vertical(action === 'UP' ? -1 : 1); return true;
      case 'DEL': ed.del(); return true;
      case 'INS': ed.toggleIns(); return true;
      case 'UNDO': ed.undo(); return true;
      case 'AC': ed.clear(); ed.line = !this.calc.isMathIn(); return true;
      case 'DMS': ed.insertToken('dms'); return true;
      case 'OPTN': this.calc.openOverlay(new Menu(this.calc, stdOptnItems(this.calc, (a) => this.funcKey(a)))); return true;
      case 'RECALL': this.calc.openOverlay(this.calc.recallScreen((v) => ed.insertToken(v === 'x' ? 'vx' : v === 'y' ? 'vy' : 'v' + v))); return true;
      case 'CONST': this.calc.openOverlay(this.calc.constMenu((id) => ed.insertToken(id))); return true;
      case 'CONV': this.calc.openOverlay(this.calc.convMenu((id) => ed.insertToken(id))); return true;
      case 'EQ': {
        if (this.screen === 'f') {
          this.f = cloneItems(ed.root);
          if (this.fg) { this.screen = 'g'; ed.setItems(this.g); return true; }
        } else this.g = cloneItems(ed.root);
        if (!this.f.length) { this.screen = 'f'; ed.setItems(this.f); return true; }
        this.persist();
        this.screen = 'range';
        this.rsel = 0;
        this.input = null;
        return true;
      }
      default: return true;
    }
  }
  rangeKey(action) {
    const keys = ['start', 'end', 'step'];
    if (this.input) {
      if (action === 'EQ') {
        try { this.range[keys[this.rsel]] = this.input.evalReal(); } catch (e) { this.err = asCalcError(e); return true; }
        this.input = null;
        if (this.rsel < 2) this.rsel++;
        this.persist();
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'UP': this.rsel = Math.max(0, this.rsel - 1); return true;
      case 'DOWN': this.rsel = Math.min(2, this.rsel + 1); return true;
      case 'EQ':
        if (this.rsel < 2) { this.rsel++; return true; }
        try { this.generate(); } catch (e) { this.err = asCalcError(e); }
        return true;
      case 'AC': this.screen = 'f'; this.ed.setItems(this.f); return true;
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) { this.input = new ValueInput(this.calc, { line: true }); this.input.key(action); }
    return true;
  }
  tableKey(action) {
    const n = this.rows.length;
    const cols = this.fg && this.g.length ? 3 : 2;
    const max = cols === 3 ? 30 : 45;
    const step = this.range.step;
    if (this.input) {
      if (action === 'EQ') {
        let v;
        try { v = this.input.evalReal(); } catch (e) { this.err = asCalcError(e); return true; }
        this.input = null;
        this.setX(this.sel, v, max);
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'UP': this.sel = Math.max(0, this.sel - 1); this.scrollTo(); return true;
      case 'DOWN': this.sel = Math.min(Math.min(n, max - 1), this.sel + 1); this.scrollTo(); return true;
      case 'LEFT': this.col = Math.max(0, this.col - 1); return true;
      case 'RIGHT': this.col = Math.min(cols - 1, this.col + 1); return true;
      case 'AC': this.screen = 'f'; this.ed = new Editor(!this.calc.isMathIn()); this.ed.setItems(this.f); return true;
      case 'DEL': if (this.col === 0 && this.sel < n) { this.rows.splice(this.sel, 1); } return true;
      case 'EQ': case 't:+': case 't:-':
        if (this.col === 0 && this.sel > 0 && this.rows[this.sel - 1]) {
          const prev = this.rows[this.sel - 1].x;
          this.setX(this.sel, action === 't:-' ? R.sub(prev, step) : R.add(prev, step), max);
        }
        return true;
      default: break;
    }
    if (this.col === 0 && (action.startsWith('t:') || action.startsWith('p:'))) {
      this.input = new ValueInput(this.calc);
      this.input.key(action);
    }
    return true;
  }
  setX(i, v, max) {
    if (i >= this.rows.length) {
      if (this.rows.length >= max) return;
      this.rows.push(this.rowFor(v));
    } else this.rows[i] = this.rowFor(v);
    this.sel = Math.min(i + 1, Math.min(this.rows.length, max - 1));
    this.scrollTo();
  }
  scrollTo() {
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel > this.top + 3) this.top = this.sel - 3;
  }

  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    const line = !this.calc.isMathIn();
    if (this.screen === 'f' || this.screen === 'g') {
      const label = this.screen === 'f' ? '𝑓(𝑥)=' : '𝑔(𝑥)=';
      const lw = textWidth(label, 'L');
      bm.text(label, 0, 2, 'L');
      const r = drawExpr(bm, this.ed.root, {
        x: lw, width: 192 - lw, y: 0, line, cursor: { path: this.ed.path, idx: this.ed.idx },
        showCursor: this.calc.blink, scroll: this.scroll,
      });
      this.scroll = r.scroll;
      return;
    }
    if (this.screen === 'range') {
      bm.text('Table Range', 0, 0, 'L');
      const labels = [' Start:', ' End  :', ' Step :'];
      ['start', 'end', 'step'].forEach((k, i) => {
        const y = 15 + i * 15;
        bm.text(labels[i], 0, y, 'L');
        if (this.input && this.rsel === i) this.input.draw(bm, y, 52, 140);
        else bm.text(toPlain(valueItems(this.range[k], this.calc, 'LL')).replace(/-/g, '−'), 52, y, 'L');
        if (this.rsel === i) bm.invert(0, y - 1, 192, 15);
      });
      return;
    }
    const cols = this.fg && this.g.length ? 3 : 2;
    const nw = 13;
    const cw = Math.floor((192 - nw) / cols);
    const heads = ['𝑥', '𝑓(𝑥)', '𝑔(𝑥)'];
    for (let c = 0; c < cols; c++) {
      const x = nw + c * cw;
      bm.text(heads[c], x + Math.floor((cw - textWidth(heads[c], 'S')) / 2), 0, 'S');
      bm.vline(x - 1, 0, 49);
    }
    for (let k = 0; k < 4; k++) {
      const r = this.top + k;
      const y = 10 + k * 10;
      if (r > this.rows.length) break;
      bm.text(String(r + 1), 0, y + 1, 'S');
      const row = this.rows[r];
      for (let c = 0; c < cols; c++) {
        const x = nw + c * cw;
        const v = row ? [row.x, row.f, row.g][c] : null;
        const s = v === 'ERROR' ? 'ERROR' : v ? cellText(v, cw - 4, this.calc) : '';
        bm.text(s, x + cw - 3 - (textWidth(s, 'S') - 1), y + 1, 'S');
        if (r === this.sel && c === this.col) bm.invert(x, y, cw - 1, 10);
      }
    }
    if (this.input) { bm.fill(0, 48, 192, 15, 0); this.input.draw(bm, 49); return; }
    const row = this.rows[this.sel];
    const v = row ? [row.x, row.f, row.g][this.col] : null;
    if (v === 'ERROR') bm.text('ERROR', 150, 50, 'L');
    else if (v) drawResult(bm, this.cellValueItems(v), 62);
  }
  // the value of the selected cell is always shown on one line, whatever the
  // Input/Output setting: MathI/MathO 3/2 is shown as 3⌟2, not a stacked fraction
  cellValueItems(v) {
    if (this.calc.setup.io !== 'MM') return valueItems(v, this.calc);
    let lv = v;
    if (v instanceof Real && v.ld) { lv = new Real(v.d, v.x); lv.dms = v.dms; }
    return valueItems(lv, this.calc, 'LL');
  }
  status() {}
  onSetup(k) {
    if (k === 'io') {
      // manual: functions are deleted when the Input/Output setting changes in Table mode
      this.f = []; this.g = [];
      this.persist();
      this.enter();
    }
  }
  onON() { this.input = null; this.err = null; this.enter(); }
  recover() { this.onON(); }
  serialize() { return { screen: this.screen === 'table' ? 'f' : this.screen }; }
  restore() { this.enter(); }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen !== 'table') return null;
    const st = { ...this.calc.fmt(), io: 'MD' };
    const f = (v) => (v === 'ERROR' ? 'ERROR' : v ? toPlain(formatValueLines(v, st)[0]) : '');
    return this.rows.map((r) => [r.x, r.f, r.g].filter((v) => v !== null).map(f).join(':')).join(', ');
  }
}
export { Dec, ZERO_R };
