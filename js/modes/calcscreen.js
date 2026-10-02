// The calculation screen shared by Calculate, Complex, Base-N, Matrix, Vector
// and Statistics modes: expression input, execution, result display toggles,
// history/replay, error handling, CALC and SOLVE.
import { Editor, cloneItems } from '../editor/editor.js';
import { layoutList, drawCursor } from '../editor/render.js';
import { parseProgram, parseStatement, collectVars } from '../engine/parser.js';
import { evaluate } from '../engine/evaluator.js';
import { CalcError, ERROR_TEXT, asCalcError } from '../engine/errors.js';
import { formatValueLines, formatReal, hasExactForm, engParts, factItems, mergeText, toPlain } from '../engine/format.js';
import * as R from '../engine/real.js';
import { Real, ZERO_R } from '../engine/real.js';
import { Complex } from '../engine/complex.js';
import * as C from '../engine/complex.js';
import { Matrix, Vector } from '../engine/matrix.js';
import * as D from '../engine/decimal.js';
import { Dec } from '../engine/decimal.js';
import { StoPending } from '../ui/overlays.js';
import { T } from '../editor/tokens.js';
import { textWidth } from '../ui/bitmap.js';

const X = (s) => ({ t: 'x', s });

// ---------- drawing helpers ----------
// Draw expression items with top at y, keeping the cursor visible.
export function drawExpr(bm, items, opts) {
  const size = opts.size || 'L';
  const cur = opts.cursor || null;
  const box = layoutList(items, size, { line: !!opts.line }, cur);
  const width = opts.width || 192;
  const x0 = opts.x || 0;
  let scroll = opts.scroll || 0;
  if (box.cursor) {
    const cx = box.cursor.x;
    if (cx - scroll > width - 6) scroll = cx - width + 6;
    if (cx - scroll < 0) scroll = Math.max(0, cx - 8);
  }
  if (box.w - scroll < width - 8) scroll = Math.max(0, box.w - width + 8);
  if (!box.cursor && !opts.keepScroll) scroll = 0;
  const base = (opts.y || 0) + box.a - 1;
  bm.setClip(x0, opts.clipTop ?? 0, x0 + width - 1, opts.clipBottom ?? 62);
  box.draw(bm, x0 - scroll, base);
  if (box.cursor && opts.showCursor) drawCursor(bm, x0 - scroll, base, box.cursor, opts.cursorShape || 'bar');
  bm.noClip();
  if (opts.arrows !== false) {
    if (scroll > 0) bm.text('◁', x0, base - 6, 'S');
    if (box.w - scroll > width) bm.text('▷', x0 + width - 4, base - 6, 'S');
  }
  return { box, scroll, base };
}

// Draw result items right aligned with bottom at yBottom
export function drawResult(bm, items, yBottom = 62, opts = {}) {
  const size = opts.size || 'L';
  const box = layoutList(items, size, { line: !!opts.line });
  const width = opts.width || 192;
  const base = yBottom - box.d;
  const scroll = opts.scroll || 0;
  if (box.w <= width) box.draw(bm, (opts.x || 0) + width - box.w, base);
  else {
    bm.setClip(0, 0, width - 6, 62);
    box.draw(bm, -scroll, base);
    bm.noClip();
    if (box.w - scroll > width - 6) bm.text('▶', width - 4, base - 6, 'S');
    if (scroll > 0) bm.text('◀', 0, base - 6, 'S');
  }
  return box;
}

export function errorScreen(bm, err) {
  const name = ERROR_TEXT[err.type] || err.message || 'ERROR';
  bm.text(name, Math.floor((192 - textWidth(name, 'L')) / 2), 2, 'L');
  bm.text('[AC] :Cancel', 0, 30, 'L');
  bm.text('[◀][▶]:Goto', 0, 45, 'L');
}

// tokens/templates that continue from Ans when typed right after a result
const ANS_TOKENS = new Set(['+', '-', '×', '÷', '²', '³', '⁻¹', '!', '%', 'nPr', 'nCr', '∠', '•', 'and', 'or', 'xor', 'xnor', '^', 'xrt', '⌟', '▶t', 'x̂', 'ŷ', 'x̂1', 'x̂2', '°', 'ʳ', 'ᵍ']);
const ANS_TEMPLATES = new Set(['pow', 'root', 'frac']);
function startsFromAns(action) {
  if (action.startsWith('t:')) {
    const id = action.slice(2);
    if (ANS_TOKENS.has(id)) return true;
    const t = T[id];
    return !!(t && (t.eng !== undefined || t.conv));
  }
  if (action.startsWith('p:')) return ANS_TEMPLATES.has(action.slice(2));
  return false;
}

export class CalcScreen {
  // opts: { parseOpts(), ctx(), formatLines(v, disp), onValue(v) -> bool, optnMenu(cb), solve: bool,
  //         calcKey: bool, onAction(action) -> bool, varKeys }
  constructor(calc, opts = {}) {
    this.calc = calc;
    this.opts = opts;
    this.editor = new Editor(!calc.isMathIn());
    this.state = 'input';
    this.history = [];
    this.hpos = -1;
    this.res = null;
    this.err = null;
    this.flow = null;
    this.scroll = 0;
    this.rscroll = 0;
  }

  get line() { return !this.calc.isMathIn(); }

  resetIO() {
    this.editor = new Editor(this.line);
    this.history = [];
    this.hpos = -1;
    this.res = null;
    this.state = 'input';
    this.flow = null;
  }
  clearAll() { this.resetIO(); }

  parseOpts() { return this.opts.parseOpts ? this.opts.parseOpts() : {}; }
  makeCtx(extra) {
    const c = this.opts.ctx ? this.opts.ctx() : this.calc.ctx();
    c.allowPolRec = true;
    return Object.assign(c, extra || {});
  }

  // ---------- keys ----------
  key(action, key) {
    if (this.flow) return this.flow.key(action, key);
    if (this.opts.onAction && this.opts.onAction(action, key, this)) return true;
    if (this.state === 'error') return this.keyError(action);
    if (this.state === 'result') return this.keyResult(action, key);
    return this.keyInput(action, key);
  }

  insert(action) {
    const ed = this.editor;
    if (this.state === 'result' || this.state === 'error') {
      const fromAns = this.state === 'result' && startsFromAns(action) && this.ansAvailable();
      ed.clear();
      ed.line = this.line;
      this.state = 'input';
      this.hpos = -1;
      if (fromAns) ed.insertToken(this.ansToken());
    }
    if (action.startsWith('t:')) ed.insertToken(action.slice(2));
    else if (action.startsWith('p:')) ed.insertTemplate(action.slice(2));
  }
  ansToken() { return this.opts.ansToken || 'Ans'; }
  ansAvailable() { return true; }

  keyInput(action) {
    const ed = this.editor;
    if (action.startsWith('t:') || action.startsWith('p:')) { this.insert(action); return true; }
    switch (action) {
      case 'LEFT': ed.left(); return true;
      case 'RIGHT': ed.right(); return true;
      case 'SLEFT': ed.jumpOut(false); return true;
      case 'SRIGHT': ed.jumpOut(true); return true;
      case 'UP': case 'DOWN':
        if (!this.line && ed.vertical(action === 'UP' ? -1 : 1)) return true;
        if (ed.isEmpty()) this.browse(action === 'UP' ? -1 : 1);
        return true;
      case 'DEL': ed.del(); return true;
      case 'INS': ed.toggleIns(); return true;
      case 'UNDO': ed.undo(); return true;
      case 'AC': ed.clear(); ed.line = this.line; return true;
      case 'EQ': this.execute({}); return true;
      case 'APPROX': this.execute({ approx: true }); return true;
      case 'STO': this.calc.openOverlay(new StoPending(this.calc, (v) => this.execute({ store: v }), this.opts.stoKeys)); return true;
      case 'RECALL': this.calc.openOverlay(this.calc.recallScreen((v) => this.insert('t:' + (v === 'x' ? 'vx' : v === 'y' ? 'vy' : 'v' + v)))); return true;
      case 'M+': this.execute({ mplus: 1 }); return true;
      case 'M-': this.execute({ mplus: -1 }); return true;
      case 'CALC': if (this.opts.calcKey !== false) this.startCalc(cloneItems(ed.root)); return true;
      case 'SOLVE': if (this.opts.solve) this.startSolve(cloneItems(ed.root)); return true;
      case 'OPTN': this.openOptn(); return true;
      case 'CONST': if (this.opts.constConv !== false) this.calc.openOverlay(this.calc.constMenu((id) => this.insert('t:' + id))); return true;
      case 'CONV': if (this.opts.constConv !== false) this.calc.openOverlay(this.calc.convMenu((id) => this.insert('t:' + id))); return true;
      case 'DMS': this.insert('t:dms'); return true;
      default: return false;
    }
  }

  openOptn() {
    if (!this.opts.optnMenu) return;
    const m = this.opts.optnMenu((a) => this.optnAction(a), this);
    if (m) { m.isOptn = true; this.calc.openOverlay(m); }
  }
  optnAction(a) {
    if (typeof a === 'function') return a();
    this.insert(a);
  }

  keyResult(action, key) {
    const res = this.res;
    if (res && res.pending && action === 'EQ') { this.runStatement(res.idx + 1); return true; }
    if (action.startsWith('t:') || action.startsWith('p:')) { this.insert(action); return true; }
    switch (action) {
      case 'EQ': this.execute({}); return true;
      case 'APPROX': this.execute({ approx: true }); return true;
      case 'LEFT': case 'RIGHT': {
        if (this.resultTooWide()) {
          this.rscroll = Math.max(0, this.rscroll + (action === 'LEFT' ? -24 : 24));
          return true;
        }
        this.state = 'input';
        this.hpos = -1;
        this.editor.path = [];
        this.editor.idx = action === 'LEFT' ? this.editor.root.length : 0;
        return true;
      }
      case 'DEL':
        this.state = 'input';
        this.hpos = -1;
        this.editor.path = [];
        this.editor.idx = this.editor.root.length;
        return true;
      case 'UP': this.browse(-1); return true;
      case 'DOWN': this.browse(1); return true;
      case 'AC': this.editor.clear(); this.editor.line = this.line; this.state = 'input'; this.res = null; this.hpos = -1; return true;
      case 'SD': this.toggleSD(); return true;
      case 'MIXED': this.toggleMixed(); return true;
      case 'ENG': this.eng(-1); return true;
      case 'ENGL': this.eng(1); return true;
      case 'DMS': this.toggleDms(); return true;
      case 'FACT': this.toggleFact(); return true;
      case 'STO': this.calc.openOverlay(new StoPending(this.calc, (v) => this.storeResult(v), this.opts.stoKeys)); return true;
      case 'M+': case 'M-': this.memPlus(action === 'M+' ? 1 : -1); return true;
      case 'CALC': if (this.opts.calcKey !== false) this.startCalc(cloneItems(this.editor.root)); return true;
      case 'SOLVE': if (this.opts.solve) this.startSolve(cloneItems(this.editor.root)); return true;
      case 'RECALL': this.calc.openOverlay(this.calc.recallScreen((v) => this.insert('t:' + (v === 'x' ? 'vx' : v === 'y' ? 'vy' : 'v' + v)))); return true;
      case 'OPTN': this.openOptn(); return true;
      case 'CONST': if (this.opts.constConv !== false) this.calc.openOverlay(this.calc.constMenu((id) => this.insert('t:' + id))); return true;
      case 'CONV': if (this.opts.constConv !== false) this.calc.openOverlay(this.calc.convMenu((id) => this.insert('t:' + id))); return true;
      default: return false;
    }
  }

  keyError(action) {
    if (action === 'AC') {
      this.editor.clear();
      this.editor.line = this.line;
      this.state = 'input';
      this.err = null;
      return true;
    }
    if (action === 'LEFT' || action === 'RIGHT') {
      const e = this.err;
      this.state = 'input';
      this.err = null;
      if (e && e.slot) {
        this.editor.moveAfterItem(null);
        this.gotoSlot(e.slot[0], e.slot[1]);
      } else this.editor.moveAfterItem(e ? e.pos : null);
      return true;
    }
    return true;
  }
  gotoSlot(ref, k) {
    const ed = this.editor;
    const search = (arr, path) => {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === ref) return [...path, [i, k]];
        if (arr[i].t !== 'c') for (let s = 0; s < arr[i].s.length; s++) { const r = search(arr[i].s[s], [...path, [i, s]]); if (r) return r; }
      }
      return null;
    };
    const p = search(ed.root, []);
    if (p) { ed.path = p; ed.idx = 0; }
  }

  showError(e, keepItems = true) {
    e = asCalcError(e);
    if (!(e instanceof CalcError)) { console.error(e); e = new CalcError('Math'); }
    this.err = e;
    this.state = 'error';
    void keepItems;
  }

  // ---------- execution ----------
  execute(opts) {
    const items = this.editor.root;
    if (!items.length) {
      if (opts.mplus && this.res) return this.memPlus(opts.mplus);
      return;
    }
    let prog;
    const auto = [];
    try { prog = parseProgram(items, { ...this.parseOpts(), autoParens: auto }); } catch (e) { this.showError(e); return; }
    if (auto.length && prog.length === 1 && prog[0].k !== 'eq') this.pendingParens = auto;
    this.res = { items: cloneItems(items), prog, idx: -1, value: null, disp: { approx: !!opts.approx }, store: opts.store, mplus: opts.mplus };
    this.rscroll = 0;
    this.runStatement(0);
  }

  runStatement(i) {
    const res = this.res;
    const stmt = res.prog[i];
    const ctx = this.makeCtx();
    const gen = (function* () {
      if (stmt.k === 'eq') throw new CalcError('Syntax', stmt.ref);
      return yield* evaluate(stmt, ctx);
    })();
    this.state = 'busy';
    this.calc.runJob(gen, (v) => this.statementDone(i, v, ctx), (e) => this.showError(e));
  }

  statementDone(i, v, ctx) {
    const res = this.res;
    const calc = this.calc;
    const last = i === res.prog.length - 1;
    res.idx = i;
    res.disp = { approx: res.disp.approx, cfmt: ctx.outFmt || null };
    if (v && v.pair) {
      calc.mem.vars.x = v.a;
      calc.mem.vars.y = v.b;
      calc.mem.ans = v.a;
    } else if (this.opts.onValue && this.opts.onValue(v, this, last)) {
      // handled by mode (matrix / vector answer)
    } else {
      calc.mem.ans = v;
    }
    if (last && res.store) calc.mem.vars[res.store] = v && v.pair ? v.a : v;
    if (last && res.mplus) this.addToM(v, res.mplus);
    res.value = v;
    res.pending = !last;
    if (!this.res.handled) this.state = 'result';
    if (last && this.pendingParens) {
      // show the automatically inserted parentheses in the expression
      const ed = this.editor;
      for (const [i0, i1] of this.pendingParens.sort((p, q) => q[0] - p[0])) {
        ed.root.splice(i1, 0, { t: 'c', v: ')' });
        ed.root.splice(i0, 0, { t: 'c', v: '(' });
      }
      res.items = cloneItems(ed.root);
      ed.idx = ed.root.length;
      ed.path = [];
    }
    this.pendingParens = null;
    if (last) {
      this.history.push({ items: res.items, value: v, disp: res.disp, store: res.store, mplus: res.mplus });
      if (this.history.length > 40) this.history.shift();
      this.hpos = -1;
    }
  }

  addToM(v, sign) {
    const calc = this.calc;
    if (!(v instanceof Real || v instanceof Complex)) return;
    const M = calc.mem.vars.M;
    try {
      if (v instanceof Complex || M instanceof Complex) {
        const a = C.toC(M), b = C.toC(v);
        calc.mem.vars.M = sign > 0 ? C.cadd(a, b) : C.csub(a, b);
      } else calc.mem.vars.M = sign > 0 ? R.add(M, v) : R.sub(M, v);
    } catch (e) { this.showError(e); }
  }
  memPlus(sign) {
    if (!this.res || this.res.value == null) return;
    this.addToM(this.res.value, sign);
    this.res.mplus = sign;
  }
  storeResult(name) {
    if (!this.res) return;
    const v = this.res.value;
    this.calc.mem.vars[name] = v && v.pair ? v.a : v;
    this.res.store = name;
  }

  // ---------- result display toggles ----------
  fmtSettings(disp) {
    const st = this.calc.fmt();
    if (disp && disp.mixed != null) st.mixed = disp.mixed;
    return st;
  }
  scalarValue() {
    const v = this.res && this.res.value;
    if (v instanceof Real || v instanceof Complex) return v;
    return null;
  }
  toggleSD() {
    const v = this.scalarValue();
    if (!v) return;
    const d = this.res.disp;
    const st = this.fmtSettings(d);
    const exactDefault = (st.io === 'MM' || st.io === 'LL') && !d.approx && !(st.io === 'LL' && v.ld);
    const cur = d.sd || (exactDefault ? 'exact' : 'dec');
    const parts = v instanceof Complex ? [v.re, v.im] : [v];
    const anyExact = parts.some((p) => hasExactForm(p, st));
    if (d.eng != null || d.dms || d.fact) { d.eng = null; d.dms = null; d.fact = false; d.sd = cur; return; }
    if (!anyExact) return;
    d.sd = cur === 'exact' ? 'dec' : 'exact';
  }
  toggleMixed() {
    const v = this.scalarValue();
    if (!(v instanceof Real) || !v.isRational()) return;
    const d = this.res.disp;
    const st = this.calc.fmt();
    d.mixed = !(d.mixed != null ? d.mixed : st.mixed);
    if (!d.sd) d.sd = 'exact';
  }
  eng(dir) {
    const v = this.scalarValue();
    if (!(v instanceof Real)) return;
    const d = this.res.disp;
    const norm = engParts(v.d, this.calc.setup.numFmt, 0);
    if (d.eng == null) {
      if (this.calc.setup.engSym && !v.d.isZero()) d.eng = norm + (dir < 0 ? -3 : 3);
      else d.eng = dir < 0 ? norm : (norm > 0 ? norm : norm + 3);
    } else d.eng += dir * 3;
    if (d.eng < norm - 9) d.eng = norm - 9;
    if (d.eng > norm + 9) d.eng = norm + 9;
    d.dms = null; d.fact = false;
  }
  toggleDms() {
    const v = this.scalarValue();
    if (!(v instanceof Real)) return;
    const d = this.res.disp;
    const cur = d.dms != null ? d.dms : v.dms;
    d.dms = !cur;
    if (!d.dms) d.sd = 'dec';
    d.eng = null; d.fact = false;
  }
  toggleFact() {
    const v = this.scalarValue();
    if (!(v instanceof Real)) return;
    const d = this.res.disp;
    if (d.fact) { d.fact = false; return; }
    if (!factItems(v)) { this.showError(new CalcError('Math')); return; }
    d.fact = true;
    d.eng = null; d.dms = null;
  }

  // ---------- history ----------
  browse(dir) {
    const H = this.history;
    if (!H.length) return;
    let p = this.hpos;
    if (p === -1) {
      if (dir > 0) return;
      p = this.state === 'result' ? H.length - 2 : H.length - 1;
    } else p += dir;
    if (p < 0 || p >= H.length) return;
    this.hpos = p;
    const h = H[p];
    this.editor.setItems(h.items);
    this.editor.line = this.line;
    this.res = { items: h.items, value: h.value, disp: { ...h.disp }, prog: null, idx: 0 };
    this.state = 'result';
    this.rscroll = 0;
  }
  historyFlags(f) {
    const H = this.history;
    if (this.state === 'result') {
      const p = this.hpos === -1 ? H.length - 1 : this.hpos;
      if (p > 0) f.up = true;
      if (p < H.length - 1) f.down = true;
    } else if (this.state === 'input' && this.editor.isEmpty() && H.length) f.up = true;
  }

  // ---------- rendering ----------
  resultLines(v, disp) {
    if (this.opts.formatLines) {
      const r = this.opts.formatLines(v, disp, this);
      if (r) return r;
    }
    const st = this.fmtSettings(disp);
    if (v && v.pair) {
      const [n1, n2] = v.pair === 'pol' ? ['𝑟=', 'θ='] : ['𝑥=', '𝑦='];
      const a = formatReal(v.a, st, disp), b = formatReal(v.b, st, disp);
      const sep = st.decimalMark === ',' ? '; ' : ', ';
      if (this.line) return [mergeText([X(n1), ...a]), mergeText([X(n2), ...b])];
      return [mergeText([X(n1), ...a, X(sep + n2), ...b])];
    }
    if (v == null) return [[X('')]];
    return formatValueLines(v, st, disp);
  }
  resultTooWide() {
    if (!this.res || this.res.value == null) return false;
    try {
      const lines = this.resultLines(this.res.value, this.res.disp);
      return lines.some((l) => layoutList(l, 'L', { line: this.line }).w > 192);
    } catch (e) { return false; }
  }

  status(f) {
    if (this.flow && this.flow.status) return this.flow.status(f);
    this.historyFlags(f);
    if (this.state === 'result' && this.res && this.res.pending) f.Disp = true;
  }

  render(bm) {
    if (this.flow) return this.flow.render(bm);
    if (this.state === 'error') { errorScreen(bm, this.err); return; }
    if (this.line) return this.renderLine(bm);
    return this.renderMath(bm);
  }

  cursorShape() {
    const ed = this.editor;
    if (ed.remaining() <= 10) return 'block';
    if (ed.line && !ed.insertMode) return 'under';
    if (ed.wrapNext) return 'ins';
    return 'bar';
  }

  renderMath(bm) {
    const ed = this.editor;
    const editing = this.state === 'input' || this.state === 'busy';
    const r = drawExpr(bm, ed.root, {
      y: 0, cursor: editing ? { path: ed.path, idx: ed.idx } : null, showCursor: editing && this.calc.blink && this.state !== 'busy',
      scroll: this.scroll, clipBottom: this.state === 'result' ? 30 : 62, cursorShape: this.cursorShape(),
    });
    this.scroll = editing ? r.scroll : 0;
    if (this.state === 'result' && this.res) {
      const lines = this.resultLines(this.res.value, this.res.disp);
      let y = 62;
      for (let k = lines.length - 1; k >= 0; k--) {
        const b = drawResult(bm, lines[k], y, { scroll: this.rscroll });
        y -= b.a + b.d + 1;
      }
    }
  }

  renderLine(bm) {
    const small = this.calc.setup.font === 'small';
    const size = small ? 'S' : 'L';
    const lh = small ? 10 : 15;
    const nLines = small ? 6 : 4;
    const rows = []; // {items, align, active}
    const splitColon = (items) => {
      const out = [[]];
      for (const it of items) { out[out.length - 1].push(it); if (it.t === 'c' && it.v === ':') out.push([]); }
      return out;
    };
    const H = this.history;
    const upto = this.state === 'result' ? (this.hpos === -1 ? H.length - 1 : this.hpos) : H.length;
    const st = this.fmtSettings({});
    for (let k = 0; k < upto && k < H.length; k++) {
      if (k === upto - 1 && this.state === 'result' && this.hpos === -1 && this.res && this.res.pending) continue;
      for (const l of splitColon(H[k].items)) rows.push({ items: l, align: 'left' });
      try {
        for (const l of this.resultLines(H[k].value, H[k].disp)) rows.push({ items: l, align: 'right', res: true });
      } catch (e) { /* ignore */ }
    }
    void st;
    if (this.state === 'result') {
      const items = this.editor.root;
      for (const l of splitColon(items)) rows.push({ items: l, align: 'left' });
      for (const l of this.resultLines(this.res.value, this.res.disp)) rows.push({ items: l, align: 'right', res: true, cur: true });
    } else {
      const ed = this.editor;
      // active input: split by colon, cursor on the right line
      const parts = splitColon(ed.root);
      let off = 0;
      parts.forEach((p, i) => {
        const has = ed.idx >= off && (ed.idx <= off + p.length || i === parts.length - 1) && !rows.some((r) => r.active);
        rows.push({ items: p, align: 'left', active: has, cidx: ed.idx - off });
        off += p.length;
      });
    }
    const shown = rows.slice(-nLines);
    shown.forEach((row, i) => {
      const y = i * lh + (small ? 1 : 0);
      if (row.align === 'right') {
        drawResult(bm, row.items, y + lh - (small ? 2 : 3), { size, line: true, scroll: row.cur ? this.rscroll : 0 });
      } else {
        const editing = row.active && (this.state === 'input' || this.state === 'busy');
        const r = drawExpr(bm, row.items, {
          y, size, line: true, cursor: editing ? { path: [], idx: row.cidx } : null,
          showCursor: editing && this.calc.blink, scroll: editing ? this.scroll : 0, clipTop: y, clipBottom: y + lh - 1,
          cursorShape: this.cursorShape(),
        });
        if (editing) this.scroll = r.scroll;
      }
    });
  }

  // ---------- CALC / SOLVE ----------
  startCalc(items) {
    if (!items.length) {
      if (!this.history.length) return;
      items = cloneItems(this.history[this.history.length - 1].items);
    }
    try {
      this.flow = new CalcFlow(this, items);
    } catch (e) { this.flow = null; this.editor.setItems(items); this.showError(e); }
  }
  startSolve(items) {
    if (!items.length) {
      if (!this.history.length) return;
      items = cloneItems(this.history[this.history.length - 1].items);
    }
    try {
      this.flow = new SolveFlow(this, items);
    } catch (e) { this.flow = null; this.editor.setItems(items); this.showError(e); }
  }
  exitFlow() {
    this.flow = null;
    this.editor.clear();
    this.editor.line = this.line;
    this.state = 'input';
  }
  onCancel() {
    if (this.flow && this.flow.onCancel) { this.flow.onCancel(); return; }
    this.state = 'input';
  }
}

// value prompt line ("A=   5") used by CALC and SOLVE (drawn, then inverted)
function drawPromptLine(bm, flow, name, y = 48) {
  const calc = flow.s.calc;
  const label = (name === 'x' ? '𝑥' : name === 'y' ? '𝑦' : name) + '=';
  const lw = textWidth(label, 'L') + 2;
  bm.fill(0, y - 1, 192, 15, 0);
  bm.text(label, 0, y - 1, 'L'); // same text top as the value / input drawn with base y + 10
  if (flow.ed) {
    const r = drawExpr(bm, flow.ed.root, { x: lw, width: 192 - lw, y, line: true, cursor: { path: [], idx: flow.ed.idx }, showCursor: calc.blink, scroll: flow.edScroll || 0, clipTop: y - 1, clipBottom: y + 13, arrows: false });
    flow.edScroll = r.scroll;
  } else {
    const st = { ...calc.fmt(), io: 'LL' };
    let items;
    try { items = formatValueLines(calc.mem.vars[name] || ZERO_R, st)[0]; } catch (e) { items = [X('0')]; }
    const box = layoutList(items, 'L', { line: true });
    box.draw(bm, lw, y + 10);
  }
  bm.invert(0, y - 1, 192, 15);
}
export { drawPromptLine };

class CalcFlow {
  constructor(screen, items) {
    this.s = screen;
    this.items = items;
    this.prog = parseProgram(items, screen.parseOpts());
    const vars = [];
    for (const st of this.prog) {
      if (st.k === 'eq') {
        if (st.a.k === 'var') collectVars(st.b, vars);
        else { collectVars(st.a, vars); collectVars(st.b, vars); }
      } else collectVars(st, vars);
    }
    this.vars = vars;
    this.idx = 0;
    this.ed = null;
    this.phase = 'prompt';
    this.err = null;
    if (!vars.length) this.run();
  }
  status(f) { if (this.phase === 'result' && this.pending) f.Disp = true; }
  key(action) {
    const calc = this.s.calc;
    if (this.phase === 'error') {
      if (action === 'AC' || action === 'LEFT' || action === 'RIGHT') { this.phase = 'prompt'; this.err = null; }
      return true;
    }
    if (this.phase === 'result') {
      if (action === 'EQ') {
        if (this.pending) { this.runStmt(this.stmtIdx + 1); return true; }
        if (this.vars.length) { this.phase = 'prompt'; this.idx = 0; } else this.run();
        return true;
      }
      if (action === 'AC') { this.s.exitFlow(); return true; }
      return true;
    }
    // prompt phase
    if (action.startsWith('t:') || action.startsWith('p:')) {
      if (!this.ed) this.ed = new Editor(true);
      if (action.startsWith('t:')) this.ed.insertToken(action.slice(2)); else this.ed.insertTemplate(action.slice(2));
      return true;
    }
    switch (action) {
      case 'AC': this.s.exitFlow(); return true;
      case 'DEL': if (this.ed) this.ed.del(); return true;
      case 'LEFT': if (this.ed) this.ed.left(); return true;
      case 'RIGHT': if (this.ed) this.ed.right(); return true;
      case 'UP': this.ed = null; this.idx = (this.idx + this.vars.length - 1) % this.vars.length; return true;
      case 'DOWN': this.ed = null; this.idx = (this.idx + 1) % this.vars.length; return true;
      case 'EQ': {
        if (this.ed && !this.ed.isEmpty()) {
          try {
            const v = this.evalInput(this.ed.root);
            calc.mem.vars[this.vars[this.idx]] = v;
          } catch (e) { this.err = asCalcError(e); this.phase = 'error'; return true; }
          this.ed = null;
          if (this.idx < this.vars.length - 1) this.idx++;
          return true;
        }
        this.ed = null;
        if (this.idx < this.vars.length - 1) { this.idx++; return true; }
        this.run();
        return true;
      }
      default: return true;
    }
  }
  evalInput(items) {
    const prog = parseStatement(items, this.s.parseOpts());
    const ctx = this.s.makeCtx();
    let r;
    const gen = evaluate(prog, ctx);
    let x = gen.next();
    while (!x.done) x = gen.next();
    r = x.value;
    return r;
  }
  run() { this.runStmt(0); }
  runStmt(i) {
    const st = this.prog[i];
    const ctx = this.s.makeCtx();
    const calc = this.s.calc;
    const gen = (function* () {
      if (st.k === 'eq') {
        if (st.a.k !== 'var') throw new CalcError('Syntax', st.ref);
        const v = yield* evaluate(st.b, ctx);
        calc.mem.vars[st.a.n] = v;
        return v;
      }
      return yield* evaluate(st, ctx);
    })();
    this.phase = 'busy';
    calc.runJob(gen, (v) => {
      this.stmtIdx = i;
      this.value = v;
      this.pending = i < this.prog.length - 1;
      this.disp = { cfmt: ctx.outFmt || null };
      if (v && v.pair) { calc.mem.vars.x = v.a; calc.mem.vars.y = v.b; calc.mem.ans = v.a; } else if (!this.s.opts.onValue || !this.s.opts.onValue(v, this.s, true)) calc.mem.ans = v;
      this.phase = 'result';
    }, (e) => { this.err = e; this.phase = 'error'; });
  }
  onCancel() { this.phase = 'prompt'; }
  resultText() {
    if (this.phase === 'error') return this.err.message;
    if (this.phase !== 'result') return null;
    return this.s.resultLines(this.value, this.disp || {}).map(toPlain).join(' | ');
  }
  render(bm) {
    if (this.phase === 'error') { errorScreen(bm, this.err); return; }
    const line = this.s.line;
    drawExpr(bm, this.items, { y: 0, line, clipBottom: 30 });
    if (this.phase === 'result') {
      const lines = this.s.resultLines(this.value, this.disp || {});
      let y = 62;
      for (let k = lines.length - 1; k >= 0; k--) { const b = drawResult(bm, lines[k], y); y -= b.a + b.d + 1; }
      return;
    }
    if (this.phase === 'prompt') drawPromptLine(bm, this, this.vars[this.idx]);
  }
}

class SolveFlow {
  constructor(screen, items) {
    this.s = screen;
    this.items = items;
    const prog = parseProgram(items, screen.parseOpts());
    if (prog.length !== 1) throw new CalcError('Syntax');
    this.stmt = prog[0];
    const vars = collectVars(this.stmt, []);
    if (!vars.length) throw new CalcError('Variable');
    this.vars = vars;
    this.idx = vars.includes('x') ? vars.indexOf('x') : 0;
    this.ed = null;
    this.phase = 'prompt';
  }
  key(action) {
    const calc = this.s.calc;
    if (this.phase === 'error') {
      if (action === 'AC') { this.s.exitFlow(); return true; }
      if (action === 'LEFT' || action === 'RIGHT') { this.phase = 'prompt'; return true; }
      return true;
    }
    if (this.phase === 'continue') {
      if (action === 'EQ') { this.solve(true); return true; }
      if (action === 'AC') { this.s.exitFlow(); return true; }
      return true;
    }
    if (this.phase === 'result') {
      if (action === 'EQ') { this.phase = 'prompt'; return true; }
      if (action === 'AC') { this.s.exitFlow(); return true; }
      return true;
    }
    if (action.startsWith('t:') || action.startsWith('p:')) {
      if (!this.ed) this.ed = new Editor(true);
      if (action.startsWith('t:')) this.ed.insertToken(action.slice(2)); else this.ed.insertTemplate(action.slice(2));
      return true;
    }
    switch (action) {
      case 'AC': this.s.exitFlow(); return true;
      case 'DEL': if (this.ed) this.ed.del(); return true;
      case 'LEFT': if (this.ed) this.ed.left(); return true;
      case 'RIGHT': if (this.ed) this.ed.right(); return true;
      case 'UP': this.ed = null; this.idx = (this.idx + this.vars.length - 1) % this.vars.length; return true;
      case 'DOWN': this.ed = null; this.idx = (this.idx + 1) % this.vars.length; return true;
      case 'EQ':
        if (this.ed && !this.ed.isEmpty()) {
          try {
            const v = CalcFlow.prototype.evalInput.call(this, this.ed.root);
            if (!(v instanceof Real)) throw new CalcError('Math');
            calc.mem.vars[this.vars[this.idx]] = v;
          } catch (e) { this.err = asCalcError(e); this.phase = 'error'; return true; }
          this.ed = null;
          if (this.idx < this.vars.length - 1) this.idx++;
          return true;
        }
        this.ed = null;
        this.solve(false);
        return true;
      default: return true;
    }
  }
  solve(cont) {
    const calc = this.s.calc;
    const name = this.vars[this.idx];
    if (!cont) this.target = name;
    const ctx = this.s.makeCtx();
    const st = this.stmt;
    const f = function* (xd) {
      calc.mem.vars[name] = R.fromDec(xd);
      ctx.ticks++;
      if ((ctx.ticks & 7) === 0) yield;
      if (st.k === 'eq') {
        const a = yield* evaluate(st.a, ctx), b = yield* evaluate(st.b, ctx);
        if (!(a instanceof Real) || !(b instanceof Real)) throw new CalcError('Math');
        return [a.d, b.d];
      }
      const a = yield* evaluate(st, ctx);
      if (!(a instanceof Real)) throw new CalcError('Math');
      return [a.d, D.ZERO];
    };
    const x0 = cont ? this.x : (calc.mem.vars[name] instanceof Real ? calc.mem.vars[name].d : D.ZERO);
    const self = this;
    this.phase = 'busy';
    calc.runJob(newton(f, x0), (r) => {
      if (r.cont) { self.x = r.x; self.phase = 'continue'; calc.mem.vars[name] = R.fromDec(r.x); return; }
      calc.mem.vars[name] = r.value;
      self.sol = r.value;
      self.lr = r.lr;
      self.solvedVar = name;
      self.phase = 'result';
    }, (e) => {
      self.err = e instanceof CalcError && e.type === 'Math' ? new CalcError('CantSolve') : e;
      if (!(self.err instanceof CalcError)) self.err = new CalcError('CantSolve');
      self.phase = 'error';
    });
  }
  onCancel() { this.phase = 'prompt'; }
  resultText() {
    if (this.phase === 'error') return this.err.message;
    if (this.phase === 'continue') return 'Continue';
    if (this.phase !== 'result') return null;
    const st = { ...this.s.calc.fmt(), io: 'MD' };
    return this.solvedVar + '=' + toPlain(formatValueLines(this.sol, st)[0]) + ', L-R=' + toPlain(formatValueLines(this.lr, st)[0]);
  }
  render(bm) {
    const calc = this.s.calc;
    if (this.phase === 'error') { errorScreen(bm, this.err); return; }
    drawExpr(bm, this.items, { y: 0, line: this.s.line, clipBottom: 30 });
    if (this.phase === 'prompt') { drawPromptLine(bm, this, this.vars[this.idx]); return; }
    if (this.phase === 'continue') { bm.text('Continue:[=]', 0, 48, 'L'); return; }
    if (this.phase === 'result') {
      const st = { ...calc.fmt(), io: 'MD' };
      const n = this.solvedVar;
      const sol = formatValueLines(this.sol, st)[0];
      const lr = formatValueLines(this.lr, st)[0];
      bm.text((n === 'x' ? '𝑥' : n === 'y' ? '𝑦' : n) + '=', 0, 33, 'L');
      drawResult(bm, sol, 46);
      bm.text('L−R=', 0, 48, 'L');
      drawResult(bm, lr, 61);
    }
  }
}

// Newton's method with numerical derivative; yields to the UI.
function* newton(f, x0) {
  const P = 20;
  let x = x0;
  const EPS = Dec.fromString('1e-14');
  let lastDx = null;
  for (let it = 0; it < 120; it++) {
    const [l, r] = yield* f(x);
    const fx = l.sub(r, P);
    if (fx.isZero()) return finish(x, l, r);
    let h = x.abs().mul(Dec.fromString('1e-6'), P);
    if (h.isZero() || h.lt(Dec.fromString('1e-10'))) h = Dec.fromString('1e-10');
    const [l1, r1] = yield* f(x.add(h, P));
    const [l2, r2] = yield* f(x.sub(h, P));
    const dfx = l1.sub(r1, P).sub(l2.sub(r2, P), P).div(h.mul(D.TWO, P), P);
    if (dfx.isZero()) {
      // nudge away from stationary point
      x = x.add(x.isZero() ? D.ONE : x.abs().mul(Dec.fromString('0.1'), P), P);
      continue;
    }
    const dx = fx.div(dfx, P);
    x = x.sub(dx, P);
    if (x.abs().mag() >= 100) throw new CalcError('CantSolve');
    const scale = x.isZero() ? D.ONE : x.abs();
    if (dx.abs().le(scale.mul(EPS, P))) {
      const [l3, r3] = yield* f(x);
      return finish(x, l3, r3);
    }
    lastDx = dx;
  }
  void lastDx;
  return { cont: true, x };
}
function finish(x, l, r) {
  const P = 20;
  let lr = l.sub(r, P);
  const scale = [l.abs(), r.abs(), D.ONE].reduce((a, b) => (a.gt(b) ? a : b));
  if (lr.abs().le(scale.mul(Dec.fromString('1e-12'), P))) lr = D.ZERO;
  return { value: R.fromDec(x.round(D.PREC)), lr: R.fromDec(lr) };
}

export { CalcFlow, SolveFlow, Matrix, Vector };
