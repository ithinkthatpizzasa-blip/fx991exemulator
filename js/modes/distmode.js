// Distribution mode (MENU 7)
import { Menu, StoPending } from '../ui/overlays.js';
import { errorScreen } from './calcscreen.js';
import { ValueInput, cellText, valueItems, drawResult } from './widgets.js';
import * as ST from '../engine/stats.js';
import * as R from '../engine/real.js';
import { Real, ZERO_R, ONE_R } from '../engine/real.js';
import { Dec } from '../engine/decimal.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { ser, de } from '../engine/serial.js';
import { formatValueLines, toPlain } from '../engine/format.js';
import { textWidth } from '../ui/bitmap.js';

const TYPES = [
  { id: 'npd', name: 'Normal PD', vars: [['x', '𝑥', '0'], ['s', 'σ', '1'], ['m', 'μ', '0']], res: '𝑝' },
  { id: 'ncd', name: 'Normal CD', vars: [['lo', 'Lower', '0'], ['up', 'Upper', '0'], ['s', 'σ', '1'], ['m', 'μ', '0']], res: '𝑝' },
  { id: 'inv', name: 'Inverse Normal', vars: [['area', 'Area', '0'], ['s', 'σ', '1'], ['m', 'μ', '0']], res: '𝑥' },
  { id: 'bpd', name: 'Binomial PD', vars: [['x', '𝑥', '0'], ['N', 'N', '0'], ['p', '𝑝', '0']], res: '𝑝', list: true },
  { id: 'bcd', name: 'Binomial CD', vars: [['x', '𝑥', '0'], ['N', 'N', '0'], ['p', '𝑝', '0']], res: '𝑝', list: true },
  { id: 'ppd', name: 'Poisson PD', vars: [['x', '𝑥', '0'], ['l', 'λ', '0']], res: '𝑝', list: true },
  { id: 'pcd', name: 'Poisson CD', vars: [['x', '𝑥', '0'], ['l', 'λ', '0']], res: '𝑝', list: true },
];

export class DistMode {
  constructor(calc) {
    this.calc = calc;
    this.type = null;
    this.useList = false;
    this.vals = {};
    this.list = []; // [{x: Real, p: Real|null|'ERROR'}]
    this.screen = 'vars'; // vars | result | list
    this.sel = 0;
    this.top = 0;
    this.input = null;
    this.err = null;
    this.result = null;
  }
  get T() { return TYPES.find((t) => t.id === this.type); }
  varList() {
    const t = this.T;
    return this.useList ? t.vars.filter((v) => v[0] !== 'x') : t.vars;
  }
  typeMenu() {
    const items = TYPES.map((t) => ({ label: t.name, act: () => this.setType(t.id) }));
    return new Menu(this.calc, null, { pages: [{ items: items.slice(0, 4) }, { items: items.slice(4) }] });
  }
  setType(id) {
    this.type = id;
    const t = this.T;
    for (const [k, , d] of t.vars) if (!this.vals[k] || this.lastType !== id) this.vals[k] = Real.parse(d);
    this.lastType = id;
    this.sel = 0;
    this.top = 0;
    this.input = null;
    this.result = null;
    if (t.list) {
      this.calc.openOverlay(new Menu(this.calc, [
        { label: 'List', act: () => { this.useList = true; this.screen = 'list'; this.list = []; this.sel = 0; } },
        { label: 'Variable', act: () => { this.useList = false; this.screen = 'vars'; } },
      ]));
    } else {
      this.useList = false;
      this.screen = 'vars';
    }
  }
  enter() { this.calc.openOverlay(this.typeMenu()); }

  compute(xOverride) {
    const t = this.T;
    const v = (k) => (k === 'x' && xOverride ? xOverride : this.vals[k]).d;
    let d;
    switch (t.id) {
      case 'npd': d = ST.normalPD(v('x'), v('s'), v('m')); break;
      case 'ncd': d = ST.normalCD(v('lo'), v('up'), v('s'), v('m')); break;
      case 'inv': d = ST.invNormal(v('area'), v('s'), v('m')); break;
      case 'bpd': d = ST.binomialPD(v('x'), v('N'), v('p')); break;
      case 'bcd': d = ST.binomialCD(v('x'), v('N'), v('p')); break;
      case 'ppd': d = ST.poissonPD(v('x'), v('l')); break;
      case 'pcd': d = ST.poissonCD(v('x'), v('l')); break;
      default: throw new CalcError('Syntax');
    }
    return R.fromDec(d);
  }
  checkInputs() {
    const t = this.T;
    const g = (k) => this.vals[k];
    if (['npd', 'ncd', 'inv'].includes(t.id) && g('s').sign() <= 0) throw new CalcError('Math');
    if (t.id === 'inv' && (g('area').sign() < 0 || g('area').d.gt(Dec.fromInt(1)))) throw new CalcError('Math');
    if ((t.id === 'bpd' || t.id === 'bcd') && (g('p').sign() < 0 || g('p').d.gt(Dec.fromInt(1)) || !g('N').isInt() || g('N').sign() < 0)) throw new CalcError('Math');
    if ((t.id === 'ppd' || t.id === 'pcd') && g('l').sign() <= 0) throw new CalcError('Math');
  }
  run() {
    try {
      this.checkInputs();
      if (this.useList) {
        for (const row of this.list) {
          try { row.p = this.compute(row.x); } catch (e) { row.p = 'ERROR'; }
        }
        this.screen = 'list';
        this.sel = 0;
        this.top = 0;
        this.listCol = 0;
        return;
      }
      this.result = this.compute();
      this.calc.mem.ans = this.result;
      this.screen = 'result';
    } catch (e) { this.err = asCalcError(e); }
  }

  key(action) {
    if (this.err) { if (action === 'AC' || action === 'LEFT' || action === 'RIGHT') this.err = null; return true; }
    if (!this.type) { this.enter(); return true; }
    if (action === 'OPTN') {
      const items = [{ label: 'Select Type', sub: () => this.typeMenu() }];
      if (this.useList && this.screen === 'list') {
        items.push({ label: 'Editor', sub: () => new Menu(this.calc, [
          { label: 'Insert Row', act: () => { if (this.list.length < 45) { this.list.splice(this.sel, 0, { x: ZERO_R, p: null }); this.clearResults(); } } },
          { label: 'Delete All', act: () => { this.list = []; this.sel = 0; this.top = 0; } },
        ]) });
      }
      this.calc.openOverlay(new Menu(this.calc, items));
      return true;
    }
    if (this.screen === 'result') {
      if (action === 'EQ' || action === 'AC') { this.screen = 'vars'; return true; }
      if (action === 'STO') {
        this.calc.openOverlay(new StoPending(this.calc, (n) => { this.calc.mem.vars[n] = this.result; }));
        return true;
      }
      return true;
    }
    if (this.screen === 'list') return this.listKey(action);
    return this.varKey(action);
  }
  varKey(action) {
    const vars = this.varList();
    if (this.input) {
      if (action === 'EQ') {
        try { this.vals[vars[this.sel][0]] = this.input.evalReal(); } catch (e) { this.err = asCalcError(e); return true; }
        this.input = null;
        if (this.sel < vars.length - 1) this.sel++;
        this.scroll(vars.length);
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'UP': this.sel = Math.max(0, this.sel - 1); this.scroll(vars.length); return true;
      case 'DOWN': this.sel = Math.min(vars.length - 1, this.sel + 1); this.scroll(vars.length); return true;
      case 'EQ': this.run(); return true;
      case 'AC': if (this.useList) { this.screen = 'list'; } return true;
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) {
      this.input = new ValueInput(this.calc);
      this.input.key(action);
    }
    return true;
  }
  scroll(n) {
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel > this.top + 2) this.top = this.sel - 2;
    if (this.top > Math.max(0, n - 3)) this.top = Math.max(0, n - 3);
  }
  clearResults() { for (const r of this.list) r.p = null; }
  listKey(action) {
    const n = this.list.length;
    if (this.input) {
      if (action === 'EQ') {
        let v;
        try { v = this.input.evalReal(); } catch (e) { this.err = asCalcError(e); return true; }
        if (this.sel >= n) { if (n >= 45) { this.input = null; return true; } this.list.push({ x: v, p: null }); } else this.list[this.sel].x = v;
        this.clearResults();
        this.input = null;
        this.sel = Math.min(this.sel + 1, Math.min(this.list.length, 44));
        this.listScroll();
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'UP': this.sel = Math.max(0, this.sel - 1); this.listScroll(); return true;
      case 'DOWN': this.sel = Math.min(Math.min(n, 44), this.sel + 1); this.listScroll(); return true;
      case 'DEL': if (this.sel < n) { this.list.splice(this.sel, 1); this.clearResults(); } return true;
      case 'EQ': if (this.list.length) { this.screen = 'vars'; this.sel = 0; this.top = 0; } return true;
      case 'AC': return true;
      case 'STO': {
        const row = this.list[this.sel];
        if (row) this.calc.openOverlay(new StoPending(this.calc, (nm) => { this.calc.mem.vars[nm] = row.p instanceof Real ? row.p : row.x; }));
        return true;
      }
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) {
      this.input = new ValueInput(this.calc);
      this.input.key(action);
    }
    return true;
  }
  listScroll() {
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel > this.top + 3) this.top = this.sel - 3;
  }

  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (!this.type) return;
    const t = this.T;
    if (this.screen === 'result') {
      bm.text(t.name, 0, 0, 'L');
      bm.text(t.res + '=', 0, 48, 'L');
      drawResult(bm, valueItems(this.result, this.calc, this.calc.setup.io === 'MM' ? 'MD' : this.calc.setup.io === 'LL' ? 'LD' : undefined), 62);
      return;
    }
    if (this.screen === 'list') return this.renderList(bm);
    bm.text(t.name, 0, 0, 'L');
    const vars = this.varList();
    for (let i = 0; i < 3; i++) {
      const k = this.top + i;
      if (k >= vars.length) break;
      const [key, label] = vars[k];
      const y = 15 + i * 15;
      bm.text(label, 2, y, 'L');
      bm.text(':', 50, y, 'L');
      if (this.input && k === this.sel) {
        this.input.draw(bm, y, 56, 136);
      } else {
        const items = valueItems(this.vals[key], this.calc, 'LL');
        const s = toPlain(items).replace(/-/g, '−');
        bm.text(s, 58, y, 'L');
      }
      if (k === this.sel) bm.invert(0, y - 1, 192, 15);
    }
  }
  renderList(bm) {
    const t = this.T;
    const nw = 13, cw = 44;
    bm.text('𝑥', nw + 18, 0, 'S');
    bm.text('P', nw + cw + 18, 0, 'S');
    bm.vline(nw - 1, 0, 49); bm.vline(nw + cw - 1, 0, 49); bm.vline(nw + 2 * cw - 1, 0, 49);
    for (let k = 0; k < 4; k++) {
      const r = this.top + k;
      if (r > this.list.length) break;
      const y = 10 + k * 10;
      bm.text(String(r + 1), 0, y + 1, 'S');
      const row = this.list[r];
      if (row) {
        const xs = cellText(row.x, cw - 4, this.calc);
        bm.text(xs, nw + cw - 3 - (textWidth(xs, 'S') - 1), y + 1, 'S');
        if (row.p != null) {
          const ps = row.p === 'ERROR' ? 'ERROR' : cellText(row.p, cw - 4, this.calc, { exact: false });
          bm.text(ps, nw + 2 * cw - 3 - (textWidth(ps, 'S') - 1), y + 1, 'S');
        }
      }
      if (r === this.sel) bm.invert(nw, y, cw - 1, 10);
    }
    // type name on the right
    const words = t.name.split(' ');
    words.forEach((w, i) => bm.text(w, 104, i * 15, 'L'));
    if (this.input) { bm.fill(0, 48, 192, 15, 0); this.input.draw(bm, 49); }
    else if (this.list[this.sel]) {
      drawResult(bm, valueItems(this.list[this.sel].x, this.calc), 62, { x: 100, width: 92 });
    }
  }
  status() {}
  onSetup() {}
  onON() { this.input = null; this.err = null; if (this.screen === 'result') this.screen = 'vars'; }
  recover() { this.input = null; this.screen = this.useList ? 'list' : 'vars'; }
  serialize() {
    const vals = {};
    for (const [k, v] of Object.entries(this.vals)) vals[k] = ser(v);
    return { type: this.type, useList: this.useList, vals, lastType: this.lastType, list: this.list.map((r) => ser(r.x)), screen: this.screen === 'result' ? 'vars' : this.screen };
  }
  restore(o) {
    if (!o || !TYPES.some((t) => t.id === o.type)) return this.enter();
    this.type = o.type;
    this.lastType = o.lastType;
    this.useList = !!o.useList;
    for (const [k, v] of Object.entries(o.vals || {})) this.vals[k] = de(v) || ZERO_R;
    for (const [k, , d] of this.T.vars) if (!this.vals[k]) this.vals[k] = Real.parse(d);
    this.list = Array.isArray(o.list) ? o.list.map((x) => ({ x: de(x) || ZERO_R, p: null })) : [];
    this.screen = o.screen === 'list' && this.useList ? 'list' : 'vars';
  }
  resultText() {
    if (this.err) return this.err.message;
    const st = { ...this.calc.fmt(), io: 'MD' };
    if (this.screen === 'result') return toPlain(formatValueLines(this.result, st)[0]);
    if (this.screen === 'list' && this.list.some((r) => r.p != null)) {
      return this.list.map((r) => (r.p === 'ERROR' ? 'ERROR' : r.p ? toPlain(formatValueLines(r.p, st)[0]) : '')).join(', ');
    }
    return null;
  }
}
export { ONE_R };
