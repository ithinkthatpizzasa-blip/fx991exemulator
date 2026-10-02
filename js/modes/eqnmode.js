// Equation/Func (MENU A), Inequality (MENU B) and Ratio (MENU C) modes.
import { Menu, Prompt, StoPending } from '../ui/overlays.js';
import { errorScreen, drawExpr } from './calcscreen.js';
import { ValueInput, cellText, valueItems, drawResult } from './widgets.js';
import { solveLinear, polyRoots, realRootsAsc, polyEval } from '../engine/poly.js';
import * as R from '../engine/real.js';
import { Real, ZERO_R, ONE_R } from '../engine/real.js';
import { Complex } from '../engine/complex.js';
import { Dec } from '../engine/decimal.js';
import * as D from '../engine/decimal.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { ser, de } from '../engine/serial.js';
import { formatValueLines, toPlain, mergeText, hasExactForm } from '../engine/format.js';
import { textWidth } from '../ui/bitmap.js';
import { layoutList } from '../editor/render.js';

const X = (s) => ({ t: 'x', s });
const SUP = { 2: '²', 3: '³', 4: '⁴' };
const VARN = ['𝑥', '𝑦', '𝑧', '𝑡'];
const LETTERS = ['𝑎', '𝑏', '𝑐', '𝑑', '𝑒'];

// grid of coefficient cells with the "= stores and advances / = on the last cell executes" behaviour
class CoefEditor {
  constructor(calc, n, def = ZERO_R, opts = {}) {
    this.calc = calc;
    this.vals = Array.from({ length: n }, () => def);
    this.def = def;
    this.sel = 0;
    this.input = null;
    this.maxBytes = opts.maxBytes || null;
    this.cols = opts.cols || n;
  }
  reset() { this.vals = this.vals.map(() => this.def); this.input = null; }
  // returns 'run' when the user asks to execute, true otherwise
  key(action) {
    const n = this.vals.length;
    if (this.input) {
      if (action === 'EQ') {
        this.vals[this.sel] = this.input.evalReal();
        this.input = null;
        if (this.sel < n - 1) this.sel++;
        return true;
      }
      if (action === 'AC') { this.input = null; return true; }
      if (action === 'UP' || action === 'DOWN') return true;
      this.input.key(action);
      return true;
    }
    const c = this.cols;
    switch (action) {
      case 'LEFT': this.sel = (this.sel + n - 1) % n; return true;
      case 'RIGHT': this.sel = (this.sel + 1) % n; return true;
      case 'UP': if (this.sel - c >= 0) this.sel -= c; return true;
      case 'DOWN': if (this.sel + c < n) this.sel += c; return true;
      case 'EQ':
        if (this.sel < n - 1) { this.sel++; return true; }
        return 'run';
      case 'AC': this.reset(); return true;
      default: break;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) {
      this.input = new ValueInput(this.calc, { maxBytes: this.maxBytes });
      this.input.key(action);
    }
    return true;
  }
  drawInput(bm) {
    if (this.input) { bm.fill(0, 48, 192, 15, 0); this.input.draw(bm, 49); return true; }
    return false;
  }
  drawCell(bm, i, x, y, w) {
    const s = cellText(this.vals[i], w - 3, this.calc);
    bm.text(s, x + w - 2 - (textWidth(s, 'S') - 1), y + 1, 'S');
    if (i === this.sel) bm.invert(x, y, w, 10);
  }
}

function polyTemplate(deg, rel = '=0') {
  let s = '';
  for (let i = 0; i <= deg; i++) {
    const p = deg - i;
    s += LETTERS[i] + (p >= 2 ? '𝑥' + SUP[p] : p === 1 ? '𝑥' : '') + (i < deg ? '+' : '');
  }
  return s + rel;
}

// ===================== Equation/Func =====================
export class EqnMode {
  constructor(calc) {
    this.calc = calc;
    this.kind = null;
    this.n = 2;
    this.ed = null;
    this.screen = 'editor';
    this.sols = [];
    this.si = 0;
    this.msg = null;
    this.err = null;
  }
  typeMenu() {
    const calc = this.calc;
    return new Menu(calc, [
      { label: 'Simul Equation', act: () => calc.openOverlay(new Prompt(calc, 'Number of Unknowns?\nSelect 2~4', [2, 3, 4], (n) => this.setType('simul', n))) },
      { label: 'Polynomial', act: () => calc.openOverlay(new Prompt(calc, 'Degree?\nSelect 2~4', [2, 3, 4], (n) => this.setType('poly', n))) },
    ]);
  }
  setType(kind, n) {
    this.kind = kind;
    this.n = n;
    const size = kind === 'simul' ? n * (n + 1) : n + 1;
    this.ed = new CoefEditor(this.calc, size, ZERO_R, { cols: kind === 'simul' ? n + 1 : n + 1 });
    this.screen = 'editor';
  }
  enter() { this.calc.openOverlay(this.typeMenu()); }
  key(action) {
    if (this.err) { if (['AC', 'LEFT', 'RIGHT'].includes(action)) this.err = null; return true; }
    if (!this.kind) { this.enter(); return true; }
    if (action === 'OPTN') {
      const calc = this.calc;
      calc.openOverlay(new Menu(calc, [
        { label: 'Simul Equation', act: () => calc.openOverlay(new Prompt(calc, 'Number of Unknowns?\nSelect 2~4', [2, 3, 4], (n) => this.setType('simul', n))) },
        { label: 'Polynomial', act: () => calc.openOverlay(new Prompt(calc, 'Degree?\nSelect 2~4', [2, 3, 4], (n) => this.setType('poly', n))) },
      ]));
      return true;
    }
    if (this.screen === 'msg') { if (action === 'AC' || action === 'EQ') this.screen = 'editor'; return true; }
    if (this.screen === 'sol') {
      if (action === 'AC') { this.screen = 'editor'; return true; }
      if (action === 'EQ' || action === 'DOWN') {
        if (this.si < this.sols.length - 1) this.si++;
        else if (action === 'EQ') this.screen = 'editor';
        return true;
      }
      if (action === 'UP') { if (this.si > 0) this.si--; return true; }
      if (action === 'STO') {
        const v = this.sols[this.si].v;
        this.calc.openOverlay(new StoPending(this.calc, (nm) => { this.calc.mem.vars[nm] = v; }));
        return true;
      }
      return true;
    }
    let r;
    try { r = this.ed.key(action); } catch (e) { this.err = asCalcError(e); return true; }
    if (r === 'run') this.solve();
    return true;
  }
  solve() {
    const v = this.ed.vals;
    const n = this.n;
    try {
      if (this.kind === 'simul') {
        const rows = [];
        for (let i = 0; i < n; i++) rows.push(v.slice(i * (n + 1), (i + 1) * (n + 1)));
        const res = solveLinear(rows);
        if (res.status === 'none') { this.msg = 'No Solution'; this.screen = 'msg'; return; }
        if (res.status === 'inf') { this.msg = 'Infinite Solution'; this.screen = 'msg'; return; }
        this.sols = res.sol.map((s, i) => ({ label: VARN[i] + '=', v: s }));
      } else {
        if (v[0].isZero()) throw new CalcError('Math');
        let roots = polyRoots(v);
        if (!this.calc.setup.eqnComplex) {
          roots = roots.filter((x) => !(x instanceof Complex) || x.im.isZero());
          if (!roots.length) { this.msg = 'No Real Roots'; this.screen = 'msg'; return; }
        }
        // repeated roots are shown once
        const uniq = [];
        for (const r of roots) {
          if (uniq.some((u) => sameVal(u, r))) continue;
          uniq.push(r);
        }
        this.sols = uniq.map((s, i) => ({ label: uniq.length > 1 ? `𝑥${'₁₂₃₄'[i]}=` : '𝑥=', v: s }));
        if (n === 2) {
          // vertex of y = ax²+bx+c
          const [a, b, c] = v;
          const xv = R.neg(R.div(b, R.mul(Real.int(2), a)));
          const yv = R.add(R.mul(a, R.mul(xv, xv)), R.add(R.mul(b, xv), c));
          const kind = a.sign() > 0 ? 'Minimum' : 'Maximum';
          this.sols.push({ label: '𝑥=', v: xv, cap: kind }, { label: '𝑦=', v: yv, cap: kind });
        }
      }
      this.si = 0;
      this.screen = 'sol';
    } catch (e) { this.err = asCalcError(e); }
  }
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (!this.kind) return;
    if (this.screen === 'msg') { bm.text(this.msg, Math.floor((192 - textWidth(this.msg, 'L')) / 2), 16, 'L'); return; }
    if (this.screen === 'sol') {
      const s = this.sols[this.si];
      if (s.cap) bm.text(s.cap, 0, 0, 'S');
      const st = this.calc.fmt();
      if (this.kind === 'simul' && st.io === 'MM') st.io = 'MM';
      bm.text(s.label, 0, 30, 'L');
      const lines = formatValueLines(s.v, { ...st, complexFmt: st.complexFmt }, {});
      let y = 62;
      for (let k = lines.length - 1; k >= 0; k--) { const b = drawResult(bm, lines[k], y); y -= b.a + b.d + 1; }
      if (this.si > 0) bm.text('▲', 184, 0, 'S');
      if (this.si < this.sols.length - 1) bm.text('▼', 184, 10, 'S');
      return;
    }
    const ed = this.ed;
    const n = this.n;
    if (this.kind === 'simul') {
      const cols = n + 1;
      const cw = Math.floor(176 / cols);
      const x0 = 10;
      for (let c = 0; c < cols; c++) {
        const lab = c < n ? VARN[c] : '=';
        bm.text(lab, x0 + c * cw + Math.floor(cw / 2) - 2, 0, 'S');
      }
      const rows = n;
      const rh = n === 4 ? 9 : 10;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) ed.drawCell(bm, r * cols + c, x0 + c * cw, 10 + r * rh, cw - 1);
      }
      // brace
      bm.vline(3, 11, 10 + rows * rh - 2); bm.set(4, 10); bm.set(4, 10 + rows * rh - 1); bm.set(2, 10 + Math.floor(rows * rh / 2));
    } else {
      bm.text(polyTemplate(n), 0, 0, 'S');
      const cols = n + 1;
      const cw = Math.floor(186 / cols);
      for (let c = 0; c < cols; c++) {
        bm.text(LETTERS[c], c * cw + Math.floor(cw / 2) - 2, 12, 'S');
        ed.drawCell(bm, c, c * cw, 22, cw - 1);
      }
    }
    if (!ed.drawInput(bm)) drawResult(bm, valueItems(ed.vals[ed.sel], this.calc), 62);
  }
  status(f) { f.cplx = this.calc.setup.complex === 'polar' ? '∠' : 'i'; }
  onSetup() {}
  onON() { if (this.screen !== 'editor') this.screen = 'editor'; if (this.ed) this.ed.input = null; this.err = null; }
  recover() { this.screen = 'editor'; if (this.ed) this.ed.input = null; }
  serialize() { return this.kind ? { kind: this.kind, n: this.n, vals: this.ed.vals.map(ser) } : null; }
  restore(o) {
    if (!o || !o.kind) return this.enter();
    this.setType(o.kind, o.n);
    if (Array.isArray(o.vals) && o.vals.length === this.ed.vals.length) this.ed.vals = o.vals.map((v) => de(v) || ZERO_R);
  }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen === 'msg') return this.msg;
    if (this.screen === 'sol') {
      const st = this.calc.fmt();
      return this.sols.map((s) => toPlain([X(s.label)]) + formatValueLines(s.v, st, {}).map(toPlain).join(' ')).join(', ');
    }
    return null;
  }
}
function sameVal(a, b) {
  const re = (v) => (v instanceof Complex ? v.re : v), im = (v) => (v instanceof Complex ? v.im : ZERO_R);
  const close = (p, q) => (p.x && q.x ? p.x.eq(q.x) : p.d.sub(q.d, 20).abs().lt(Dec.fromString('1e-12')));
  return close(re(a), re(b)) && close(im(a), im(b));
}

// ===================== Inequality =====================
const INEQ = [['>', '>0'], ['<', '<0'], ['≥', '≥0'], ['≤', '≤0']];
export class IneqMode {
  constructor(calc) {
    this.calc = calc;
    this.deg = null;
    this.rel = 0;
    this.ed = null;
    this.screen = 'editor';
    this.err = null;
    this.sol = null;
    this.scroll = 0;
  }
  degreePrompt() {
    const calc = this.calc;
    return new Prompt(calc, 'Degree?\nSelect 2~4', [2, 3, 4], (d) => {
      calc.openOverlay(new Menu(calc, INEQ.map(([, r], i) => ({ label: polyTemplate(d, r), act: () => this.setType(d, i) })), { font: 'S', rows: 6 }));
    });
  }
  setType(d, rel) {
    this.deg = d;
    this.rel = rel;
    this.ed = new CoefEditor(this.calc, d + 1, ZERO_R);
    this.screen = 'editor';
  }
  enter() { this.calc.openOverlay(this.degreePrompt()); }
  key(action) {
    if (this.err) { if (['AC', 'LEFT', 'RIGHT'].includes(action)) this.err = null; return true; }
    if (!this.deg) { this.enter(); return true; }
    if (action === 'OPTN') { this.calc.openOverlay(new Menu(this.calc, [{ label: 'Polynomial', act: () => this.calc.openOverlay(this.degreePrompt()) }])); return true; }
    if (this.screen === 'sol') {
      if (action === 'AC' || action === 'EQ') { this.screen = 'editor'; return true; }
      if (action === 'RIGHT') this.scroll += 24;
      if (action === 'LEFT') this.scroll = Math.max(0, this.scroll - 24);
      return true;
    }
    let r;
    try { r = this.ed.key(action); } catch (e) { this.err = asCalcError(e); return true; }
    if (r === 'run') this.solve();
    return true;
  }
  solve() {
    try {
      const c = this.ed.vals;
      if (c[0].isZero()) throw new CalcError('Math');
      // normalise so that leading coefficient is positive
      let coefs = c;
      let rel = INEQ[this.rel][0];
      if (c[0].sign() < 0) {
        coefs = c.map((v) => R.neg(v));
        rel = { '>': '<', '<': '>', '≥': '≤', '≤': '≥' }[rel];
      }
      const roots = realRootsAsc(coefs);
      this.sol = solveIntervals(coefs, roots, rel);
      this.screen = 'sol';
      this.scroll = 0;
    } catch (e) { this.err = asCalcError(e); }
  }
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (!this.deg) return;
    const rel = INEQ[this.rel][1];
    if (this.screen === 'sol') return this.renderSol(bm);
    bm.text(polyTemplate(this.deg, rel), 0, 0, 'S');
    const cols = this.deg + 1;
    const cw = Math.floor(186 / cols);
    for (let c = 0; c < cols; c++) {
      bm.text(LETTERS[c], c * cw + Math.floor(cw / 2) - 2, 12, 'S');
      this.ed.drawCell(bm, c, c * cw, 22, cw - 1);
    }
    if (!this.ed.drawInput(bm)) drawResult(bm, valueItems(this.ed.vals[this.ed.sel], this.calc), 62);
  }
  solItems(mathO) {
    const s = this.sol;
    if (s.all) return [X('All Real Numbers')];
    if (s.none) return [X('No Solution')];
    const st = { ...this.calc.fmt(), io: mathO ? 'MM' : 'MD' };
    const val = (v) => formatValueLines(v, st, {})[0];
    const out = [];
    s.parts.forEach((p, i) => {
      if (i) out.push(X(', '));
      if (p.eq) out.push(X('𝑥='), ...val(p.eq));
      else {
        if (p.lo) out.push(...val(p.lo), X(p.loIncl ? '≤' : '<'));
        out.push(X('𝑥'));
        if (p.hi) out.push(X(p.hiIncl ? '≤' : '<'), ...val(p.hi));
      }
    });
    return mergeText(out);
  }
  renderSol(bm) {
    const mathO = this.calc.setup.io === 'MM';
    const s = this.sol;
    if (mathO || s.all || s.none) {
      const items = this.solItems(true);
      const box = layoutList(items, 'L', {});
      const scroll = Math.min(this.scroll, Math.max(0, box.w - 186));
      this.scroll = scroll;
      bm.setClip(0, 0, 191, 62);
      box.draw(bm, -scroll + (box.w < 192 ? 0 : 0), Math.max(box.a, 20));
      bm.noClip();
      if (box.w - scroll > 192) bm.text('▶', 186, 10, 'S');
      return;
    }
    // symbolic letters then the values
    const names = 'abcdef';
    let k = 0;
    const vals = [];
    const nm = () => names[k++];
    let txt = '';
    s.parts.forEach((p, i) => {
      if (i) txt += ',';
      if (p.eq) { const n = nm(); vals.push([n, p.eq]); txt += '𝑥=' + n; return; }
      if (p.lo) { const n = nm(); vals.push([n, p.lo]); txt += n + (p.loIncl ? '≤' : '<'); }
      txt += '𝑥';
      if (p.hi) { const n = nm(); vals.push([n, p.hi]); txt += (p.hiIncl ? '≤' : '<') + n; }
    });
    bm.text(txt, 0, 0, 'S');
    const st = { ...this.calc.fmt(), io: 'MD' };
    vals.slice(0, 5).forEach(([n, v], i) => {
      bm.text(n + '=', 0, 11 + i * 10, 'S');
      const t = toPlain(formatValueLines(v, st, {})[0]).replace(/-/g, '−');
      bm.text(t, 191 - (textWidth(t, 'S') - 1), 11 + i * 10, 'S');
    });
  }
  status() {}
  onSetup() {}
  onON() { this.screen = 'editor'; if (this.ed) this.ed.input = null; this.err = null; }
  recover() { this.onON(); }
  serialize() { return this.deg ? { deg: this.deg, rel: this.rel, vals: this.ed.vals.map(ser) } : null; }
  restore(o) {
    if (!o || !o.deg) return this.enter();
    this.setType(o.deg, o.rel || 0);
    if (Array.isArray(o.vals) && o.vals.length === this.ed.vals.length) this.ed.vals = o.vals.map((v) => de(v) || ZERO_R);
  }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen === 'sol') return toPlain(this.solItems(true));
    return null;
  }
}

// sign analysis: coefs with positive leading coefficient
function solveIntervals(coefs, roots, rel) {
  const strict = rel === '>' || rel === '<';
  const wantPos = rel === '>' || rel === '≥';
  if (!roots.length) {
    // polynomial never changes sign; sign = sign at 0 (= leading sign for even degree without real roots)
    const v = polyEval(coefs, D.ZERO);
    const pos = v.sign() > 0;
    return pos === wantPos ? { all: true } : { none: true };
  }
  // intervals between roots
  const pts = roots.map((r) => r.v);
  const signs = [];
  for (let i = 0; i <= pts.length; i++) {
    let x;
    if (i === 0) x = pts[0].d.sub(D.ONE, 20);
    else if (i === pts.length) x = pts[pts.length - 1].d.add(D.ONE, 20);
    else x = pts[i - 1].d.add(pts[i].d, 20).div(D.TWO, 20);
    signs.push(polyEval(coefs, x).sign());
  }
  const good = signs.map((s) => (wantPos ? s > 0 : s < 0));
  const k = pts.length;
  const parts = [];
  if (strict) {
    for (let i = 0; i <= k; i++) if (good[i]) parts.push({ lo: i ? pts[i - 1] : null, hi: i < k ? pts[i] : null, loIncl: false, hiIncl: false });
  } else {
    let i = 0;
    while (i <= k) {
      if (good[i]) {
        const start = i;
        while (i + 1 <= k && good[i + 1]) i++;
        parts.push({ lo: start ? pts[start - 1] : null, loIncl: true, hi: i < k ? pts[i] : null, hiIncl: true });
        i++;
      } else {
        if (i < k && !good[i + 1]) parts.push({ eq: pts[i] });
        i++;
      }
    }
  }
  if (!parts.length) return { none: true };
  if (parts.length === 1 && !parts[0].eq && !parts[0].lo && !parts[0].hi) return { all: true };
  return { parts };
}

// ===================== Ratio =====================
export class RatioMode {
  constructor(calc) {
    this.calc = calc;
    this.type = null; // 0: A:B=X:D  1: A:B=C:X
    this.ed = null;
    this.screen = 'editor';
    this.res = null;
    this.disp = {};
    this.err = null;
  }
  typeMenu() {
    return new Menu(this.calc, [
      { label: 'A:B=X:D', act: () => this.setType(0) },
      { label: 'A:B=C:X', act: () => this.setType(1) },
    ]);
  }
  setType(t) {
    this.type = t;
    this.ed = new CoefEditor(this.calc, 3, ONE_R, { maxBytes: 10 });
    this.screen = 'editor';
  }
  enter() { this.calc.openOverlay(this.typeMenu()); }
  key(action) {
    if (this.err) { if (['AC', 'LEFT', 'RIGHT'].includes(action)) this.err = null; return true; }
    if (this.type === null) { this.enter(); return true; }
    if (action === 'OPTN') { this.calc.openOverlay(new Menu(this.calc, [{ label: 'Select Type', sub: () => this.typeMenu() }])); return true; }
    if (this.screen === 'res') {
      if (action === 'EQ' || action === 'AC') { this.screen = 'editor'; return true; }
      if (action === 'STO') { this.calc.openOverlay(new StoPending(this.calc, (n) => { this.calc.mem.vars[n] = this.res; })); return true; }
      if (action === 'SD') { this.toggleSD(); return true; }
      return true;
    }
    let r;
    try { r = this.ed.key(action); } catch (e) { this.err = asCalcError(e); return true; }
    if (r === 'run') {
      try {
        const [a, b, c] = this.ed.vals;
        if (a.isZero() || b.isZero() || c.isZero()) throw new CalcError('Math');
        this.res = this.type === 0 ? R.div(R.mul(a, c), b) : R.div(R.mul(b, c), a);
        this.calc.mem.ans = this.res;
        this.disp = {};
        this.screen = 'res';
      } catch (e) { this.err = asCalcError(e); }
    }
    return true;
  }
  // S⇔D on the X= result: exact (fraction / √ / π) form <-> decimal
  toggleSD() {
    const v = this.res, st = this.calc.fmt();
    if (!v || !hasExactForm(v, st)) return;
    const exactDefault = (st.io === 'MM' || st.io === 'LL') && !(st.io === 'LL' && v.ld);
    const cur = this.disp.sd || (exactDefault ? 'exact' : 'dec');
    this.disp = { sd: cur === 'exact' ? 'dec' : 'exact' };
  }
  render(bm) {
    if (this.err) { errorScreen(bm, this.err); return; }
    if (this.type === null) return;
    if (this.screen === 'res') {
      bm.text('X=', 0, 30, 'L');
      drawResult(bm, formatValueLines(this.res, this.calc.fmt(), this.disp)[0], 62);
      return;
    }
    // A : B = X : D   (cells drawn in small font)
    const ed = this.ed;
    const slots = this.type === 0 ? [0, 1, 'X', 2] : [0, 1, 2, 'X'];
    const sep = ['', ':', '=', ':'];
    const cw = 40;
    let x = 4;
    slots.forEach((s, i) => {
      if (sep[i]) { bm.text(sep[i], x, 10, 'L'); x += sep[i] === '=' ? 10 : 7; }
      if (s === 'X') { bm.text('X', x + cw - 10, 12, 'S'); }
      else ed.drawCell(bm, s, x, 11, cw);
      x += cw + 2;
    });
    if (!ed.drawInput(bm)) drawResult(bm, valueItems(ed.vals[ed.sel], this.calc), 62);
  }
  status() {}
  onSetup() {}
  onON() { this.screen = 'editor'; if (this.ed) this.ed.input = null; this.err = null; }
  recover() { this.onON(); }
  serialize() { return this.type !== null ? { type: this.type, vals: this.ed.vals.map(ser) } : null; }
  restore(o) {
    if (!o || o.type == null) return this.enter();
    this.setType(o.type);
    if (Array.isArray(o.vals) && o.vals.length === 3) this.ed.vals = o.vals.map((v) => de(v) || ONE_R);
  }
  resultText() {
    if (this.err) return this.err.message;
    if (this.screen === 'res') return toPlain(formatValueLines(this.res, this.calc.fmt(), this.disp)[0]);
    return null;
  }
}

export { drawExpr, Real };
