// Statistics mode (MENU 6)
import { CalcScreen, errorScreen } from './calcscreen.js';
import { Menu } from '../ui/overlays.js';
import { stdOptnItems, serCalcScreen, restoreCalcScreen } from './common.js';
import { ValueInput, cellText, valueItems, drawResult } from './widgets.js';
import { REG_TYPES, computeStats, statValue, regression, regValue, estimate, normDistFn } from '../engine/stats.js';
import * as R from '../engine/real.js';
import { Real, ZERO_R, ONE_R } from '../engine/real.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { ser, de } from '../engine/serial.js';
import { formatValueLines, toPlain } from '../engine/format.js';
import { textWidth } from '../ui/bitmap.js';

const SUMS = [['Σ𝑥', 'sx'], ['Σ𝑥²', 'sx2'], ['Σ𝑦', 'sy'], ['Σ𝑦²', 'sy2'], ['Σ𝑥𝑦', 'sxy'], ['Σ𝑥³', 'sx3'], ['Σ𝑥²𝑦', 'sx2y'], ['Σ𝑥⁴', 'sx4']];
const VARS = [['𝑥̄', 'xbar'], ['σ²𝑥', 's2x'], ['σ𝑥', 'sigx'], ['s²𝑥', 'ss2x'], ['s𝑥', 'ssx'], ['𝑛', 'n'], ['𝑦̄', 'ybar'], ['σ²𝑦', 's2y'], ['σ𝑦', 'sigy'], ['s²𝑦', 'ss2y'], ['s𝑦', 'ssy']];

export class StatMode {
  constructor(calc) {
    this.calc = calc;
    this.type = null;
    this.rows = [];
    this.screen = 'editor'; // editor | calc | list
    this.prev = 'editor';
    this.cr = 0;
    this.cc = 0;
    this.top = 0;
    this.input = null;
    this.err = null;
    this.list = null;
    this.listTop = 0;
    const self = this;
    this.cs = new CalcScreen(calc, {
      ctx: () => calc.ctx({
        stat: (n) => self.statVar(n),
        statEst: (op, v) => self.est(op, v),
        normDist: (k, t) => normDistFn(k, t),
      }),
      optnMenu: (cb) => self.calcOptn(cb),
    });
  }
  get paired() { const t = REG_TYPES.find((r) => r.id === this.type); return !!(t && t.paired); }
  get freq() { return this.calc.setup.statFreq; }
  columns() {
    const c = [{ title: '𝑥', key: 'x' }];
    if (this.paired) c.push({ title: '𝑦', key: 'y' });
    if (this.freq) c.push({ title: 'Freq', key: 'f' });
    return c;
  }
  maxRows() { return [160, 80, 53][this.columns().length - 1]; }

  // ----- statistics access -----
  stats() {
    if (!this.rows.length) throw new CalcError('Math');
    return computeStats(this.rows, this.paired, this.freq);
  }
  statVar(n) {
    if (!this.type) throw new CalcError('Syntax');
    const pairedOnly = ['sy', 'sy2', 'sxy', 'sx3', 'sx2y', 'sx4', 'ybar', 's2y', 'sigy', 'ss2y', 'ssy', 'miny', 'maxy', 'ra', 'rb', 'rc', 'rr'];
    if (!this.paired && pairedOnly.includes(n)) throw new CalcError('Syntax');
    if (['ra', 'rb', 'rc', 'rr'].includes(n)) {
      if (n === 'rc' && this.type !== 'quad') throw new CalcError('Syntax');
      if (n === 'rr' && this.type === 'quad') throw new CalcError('Syntax');
      return regValue(regression(this.stats(), this.type), n);
    }
    return statValue(this.stats(), n);
  }
  est(op, v) {
    if (op === 't') {
      if (this.paired) throw new CalcError('Syntax');
      const s = this.stats();
      const m = statValue(s, 'xbar'), sg = statValue(s, 'sigx');
      if (sg.isZero()) throw new CalcError('Math');
      return R.fromDec(v.d.sub(m.d, 20).div(sg.d, 15));
    }
    if (!this.paired) throw new CalcError('Syntax');
    return estimate(regression(this.stats(), this.type), this.type, op, v);
  }

  // ----- menus -----
  typeMenu() {
    const items = REG_TYPES.map((t) => ({ label: t.name, act: () => this.setType(t.id) }));
    return new Menu(this.calc, null, { pages: [{ items: items.slice(0, 4) }, { items: items.slice(4) }] });
  }
  setType(id) {
    const wasPaired = this.paired;
    const had = this.type;
    this.type = id;
    if (had && wasPaired !== this.paired) this.rows = [];
    if (!this.paired) for (const r of this.rows) delete r.y;
    this.screen = 'editor';
    this.cr = 0; this.cc = 0; this.top = 0;
    this.input = null;
  }
  editorMenu() {
    return new Menu(this.calc, [
      { label: 'Insert Row', act: () => this.insertRow() },
      { label: 'Delete All', act: () => { this.rows = []; this.cr = 0; this.top = 0; } },
    ]);
  }
  editorOptn() {
    const items = [
      { label: 'Select Type', sub: () => this.typeMenu() },
      { label: 'Editor', sub: () => this.editorMenu() },
      { label: this.paired ? '2-Variable Calc' : '1-Variable Calc', act: () => this.showVarCalc('editor') },
    ];
    if (this.paired) items.push({ label: 'Regression Calc', act: () => this.showRegCalc('editor') });
    return new Menu(this.calc, items);
  }
  calcOptn(cb) {
    const tok = (id) => () => cb('t:st:' + id);
    const p1 = this.paired
      ? [{ label: 'Select Type', sub: () => this.typeMenu() }, { label: '2-Variable Calc', act: () => this.showVarCalc('calc') },
        { label: 'Regression Calc', act: () => this.showRegCalc('calc') }, { label: 'Data', act: () => { this.screen = 'editor'; } }]
      : [{ label: 'Select Type', sub: () => this.typeMenu() }, { label: '1-Variable Calc', act: () => this.showVarCalc('calc') },
        { label: 'Data', act: () => { this.screen = 'editor'; } }];
    const sums = (this.paired ? SUMS : SUMS.slice(0, 2)).map(([l, id]) => ({ label: l, act: tok(id) }));
    const vars = (this.paired ? VARS : VARS.slice(0, 6)).map(([l, id]) => ({ label: l, act: tok(id) }));
    const mm = this.paired
      ? [['min(𝑥)', 'minx'], ['max(𝑥)', 'maxx'], ['min(𝑦)', 'miny'], ['max(𝑦)', 'maxy']]
      : [['min(𝑥)', 'minx'], ['Q₁', 'Q1'], ['Med', 'Med'], ['Q₃', 'Q3'], ['max(𝑥)', 'maxx']];
    const reg = this.type === 'quad'
      ? [['𝑎', 'ra'], ['𝑏', 'rb'], ['𝑐', 'rc'], ['𝑥̂₁', null, 'x̂1'], ['𝑥̂₂', null, 'x̂2'], ['𝑦̂', null, 'ŷ']]
      : [['𝑎', 'ra'], ['𝑏', 'rb'], ['𝑟', 'rr'], ['𝑥̂', null, 'x̂'], ['𝑦̂', null, 'ŷ']];
    const sub = (items, cols = 2) => () => new Menu(this.calc, items, { cols });
    const p2 = [
      { label: 'Summation', sub: sub(sums) },
      { label: 'Variable', sub: sub(vars) },
      { label: 'Min/Max', sub: sub(mm.map(([l, id]) => ({ label: l, act: tok(id) }))) },
      this.paired
        ? { label: 'Regression', sub: sub(reg.map(([l, id, t]) => ({ label: l, act: id ? tok(id) : () => cb('t:' + t) }))) }
        : { label: 'Norm Dist', sub: sub([['P(', 'P('], ['Q(', 'Q('], ['R(', 'R('], ['▶𝑡', '▶t']].map(([l, id]) => ({ label: l, act: () => cb('t:' + id) }))) },
    ];
    return new Menu(this.calc, null, { pages: [{ items: p1 }, { items: p2 }, { items: stdOptnItems(this.calc, cb) }] });
  }

  showVarCalc(from) {
    this.prev = from;
    const lines = [];
    const add = (label, id) => {
      let v;
      try { v = statValue(this.stats(), id); } catch (e) { v = null; }
      lines.push([label, v]);
    };
    const one = [['𝑥̄', 'xbar'], ['Σ𝑥', 'sx'], ['Σ𝑥²', 'sx2'], ['σ²𝑥', 's2x'], ['σ𝑥', 'sigx'], ['s²𝑥', 'ss2x'], ['s𝑥', 'ssx'], ['𝑛', 'n']];
    for (const [l, id] of one) add(l, id);
    if (this.paired) {
      for (const [l, id] of [['𝑦̄', 'ybar'], ['Σ𝑦', 'sy'], ['Σ𝑦²', 'sy2'], ['σ²𝑦', 's2y'], ['σ𝑦', 'sigy'], ['s²𝑦', 'ss2y'], ['s𝑦', 'ssy'],
        ['Σ𝑥𝑦', 'sxy'], ['Σ𝑥³', 'sx3'], ['Σ𝑥²𝑦', 'sx2y'], ['Σ𝑥⁴', 'sx4'], ['min(𝑥)', 'minx'], ['max(𝑥)', 'maxx'], ['min(𝑦)', 'miny'], ['max(𝑦)', 'maxy']]) add(l, id);
    } else {
      for (const [l, id] of [['min(𝑥)', 'minx'], ['Q₁', 'Q1'], ['Med', 'Med'], ['Q₃', 'Q3'], ['max(𝑥)', 'maxx']]) add(l, id);
    }
    this.list = { title: null, lines };
    this.listTop = 0;
    this.screen = 'list';
  }
  showRegCalc(from) {
    this.prev = from;
    let reg;
    try { reg = regression(this.stats(), this.type); } catch (e) { this.err = asCalcError(e); return; }
    const t = REG_TYPES.find((r) => r.id === this.type);
    const lines = [['𝑎', regValue(reg, 'ra')], ['𝑏', regValue(reg, 'rb')]];
    if (this.type === 'quad') lines.push(['𝑐', regValue(reg, 'rc')]);
    else lines.push(['𝑟', regValue(reg, 'rr')]);
    this.list = { title: t.name, lines };
    this.listTop = 0;
    this.screen = 'list';
  }
  insertRow() {
    if (this.rows.length >= this.maxRows()) return;
    const r = { x: ZERO_R };
    if (this.paired) r.y = ZERO_R;
    r.f = ONE_R;
    this.rows.splice(Math.min(this.cr, this.rows.length), 0, r);
  }

  enter() {
    this.screen = 'editor';
    this.calc.openOverlay(this.typeMenu());
  }

  // ----- keys -----
  key(action, key) {
    if (this.err) { if (action === 'AC' || action === 'LEFT' || action === 'RIGHT') this.err = null; return true; }
    if (!this.type) { this.calc.openOverlay(this.typeMenu()); return true; }
    if (this.screen === 'calc') {
      return this.cs.key(action, key);
    }
    if (this.screen === 'list') {
      const n = this.list.lines.length;
      if (action === 'UP') this.listTop = Math.max(0, this.listTop - 1);
      else if (action === 'DOWN') this.listTop = Math.min(Math.max(0, n - (this.list.title ? 5 : 6)), this.listTop + 1);
      else if (action === 'AC') this.screen = this.prev;
      else if (action === 'OPTN') { this.screen = this.prev; return this.key(action, key); }
      return true;
    }
    return this.editorKey(action);
  }
  editorKey(action) {
    const cols = this.columns();
    const n = this.rows.length;
    if (this.input) {
      if (action === 'EQ') {
        let v;
        try { v = this.input.evalReal(); } catch (e) { this.err = asCalcError(e); return true; }
        const key = cols[this.cc].key;
        if (this.cr >= n) {
          if (n >= this.maxRows()) { this.input = null; return true; }
          const r = { x: ZERO_R, f: ONE_R };
          if (this.paired) r.y = ZERO_R;
          this.rows.push(r);
        }
        this.rows[this.cr][key] = v;
        this.input = null;
        this.cr = Math.min(this.cr + 1, Math.min(this.rows.length, this.maxRows() - 1));
        this.scrollTo();
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    switch (action) {
      case 'UP': this.cr = Math.max(0, this.cr - 1); this.scrollTo(); return true;
      case 'DOWN': this.cr = Math.min(Math.min(n, this.maxRows() - 1), this.cr + 1); this.scrollTo(); return true;
      case 'LEFT': case 'RIGHT': {
        const nc = action === 'LEFT' ? Math.max(0, this.cc - 1) : Math.min(cols.length - 1, this.cc + 1);
        // from the empty row after the data, moving to another column starts at its first row
        if (nc !== this.cc && this.cr >= n && n > 0) { this.cr = 0; this.top = 0; }
        this.cc = nc;
        return true;
      }
      case 'DEL':
        if (this.cr < n) this.rows.splice(this.cr, 1);
        if (this.cr > this.rows.length) this.cr = this.rows.length;
        return true;
      case 'AC': this.screen = 'calc'; this.cs.editor.clear(); this.cs.state = 'input'; return true;
      case 'OPTN': { const m = this.editorOptn(); this.calc.openOverlay(m); return true; }
      case 'STO': return true;
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) {
      this.input = new ValueInput(this.calc);
      this.input.key(action);
    }
    return true;
  }
  scrollTo() {
    if (this.cr < this.top) this.top = this.cr;
    if (this.cr > this.top + 3) this.top = this.cr - 3;
  }

  // ----- render -----
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (!this.type) return;
    if (this.screen === 'calc') { this.cs.render(bm); return; }
    if (this.screen === 'list') return this.renderList(bm);
    const cols = this.columns();
    const nw = 13;
    const cw = Math.min(60, Math.floor((192 - nw) / cols.length));
    // header
    cols.forEach((c, i) => {
      const x = nw + i * cw;
      bm.text(c.title, x + Math.floor((cw - textWidth(c.title, 'S')) / 2), 0, 'S');
      bm.vline(x - 1, 0, 49);
    });
    bm.vline(nw + cols.length * cw - 1, 0, 49);
    for (let k = 0; k < 4; k++) {
      const r = this.top + k;
      const y = 10 + k * 10;
      if (r > this.rows.length) break;
      bm.text(String(r + 1), 0, y + 1, 'S');
      cols.forEach((c, i) => {
        const x = nw + i * cw;
        const v = r < this.rows.length ? this.rows[r][c.key] : null;
        const s = v ? cellText(v, cw - 4, this.calc) : '';
        bm.text(s, x + cw - 3 - (textWidth(s, 'S') - 1), y + 1, 'S');
        if (r === this.cr && i === this.cc) bm.invert(x, y, cw - 1, 10);
      });
    }
    if (this.input) { bm.fill(0, 49, 192, 14, 0); this.input.draw(bm, 50); }
    else if (this.cr < this.rows.length) {
      const v = this.rows[this.cr][cols[this.cc].key];
      drawResult(bm, valueItems(v, this.calc), 62);
    }
  }
  renderList(bm) {
    const L = this.list;
    let y = 0;
    if (L.title) { bm.text(L.title, 0, 0, 'S'); y = 10; }
    const vis = L.title ? 5 : 6;
    const st = { ...this.calc.fmt(), io: 'MD', engSym: false };
    for (let i = 0; i < vis; i++) {
      const line = L.lines[this.listTop + i];
      if (!line) break;
      const [label, v] = line;
      bm.text(label, 0, y + i * 10 + 1, 'S');
      bm.text('=', 26, y + i * 10 + 1, 'S');
      let s = 'ERROR';
      if (v) { try { s = toPlain(formatValueLines(v, st)[0]).replace(/-/g, '−').replace(/×10\^\(?(−?\d+)\)?/, '×10^{$1}'); } catch (e) { s = 'ERROR'; } }
      bm.text(s, 34, y + i * 10 + 1, 'S');
    }
    const n = L.lines.length;
    if (n > vis) {
      const h = 60, seg = Math.max(6, Math.floor((h * vis) / n));
      const pos = Math.round(((h - seg) * this.listTop) / Math.max(1, n - vis));
      bm.fill(189, pos, 2, seg);
    }
  }
  status(f) { if (this.screen === 'calc') this.cs.status(f); }
  onSetup(k) {
    if (k === 'io') this.cs.resetIO();
    if (k === 'statFreq') { this.rows = []; this.cr = 0; this.cc = 0; this.top = 0; }
  }
  onON() { this.cs.clearAll(); this.input = null; this.err = null; if (this.screen === 'list') this.screen = 'editor'; }
  onCancel() { this.cs.onCancel(); }
  recover() { this.cs.resetIO(); this.input = null; this.screen = 'editor'; }
  serialize() {
    return {
      type: this.type, screen: this.screen === 'list' ? this.prev : this.screen,
      rows: this.rows.map((r) => ({ x: ser(r.x), y: r.y ? ser(r.y) : null, f: r.f ? ser(r.f) : null })),
      cs: serCalcScreen(this.cs),
    };
  }
  restore(o) {
    if (!o) return this.enter();
    this.type = REG_TYPES.some((t) => t.id === o.type) ? o.type : null;
    this.rows = Array.isArray(o.rows) ? o.rows.map((r) => ({ x: de(r.x) || ZERO_R, y: r.y ? de(r.y) : undefined, f: r.f ? de(r.f) : ONE_R })) : [];
    this.screen = o.screen === 'calc' ? 'calc' : 'editor';
    restoreCalcScreen(this.cs, o.cs);
    if (!this.type) this.enter();
  }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen === 'list') {
      const st = { ...this.calc.fmt(), io: 'MD' };
      return this.list.lines.map(([l, v]) => l + '=' + (v ? toPlain(formatValueLines(v, st)[0]) : 'ERROR')).join(', ');
    }
    return null;
  }
}
