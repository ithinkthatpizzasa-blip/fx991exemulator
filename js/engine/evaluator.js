// AST evaluator. Written as generators so that long computations
// (integration, summation, SOLVE) can yield to the UI and be cancelled with AC.
import * as D from './decimal.js';
import { Dec, PREC } from './decimal.js';
import * as R from './real.js';
import { Real, Ex, ZERO_R, ONE_R } from './real.js';
import * as F from './fn.js';
import * as C from './complex.js';
import { Complex } from './complex.js';
import * as M from './matrix.js';
import { Matrix, Vector } from './matrix.js';
import { CalcError, asCalcError } from './errors.js';
import { T } from '../editor/tokens.js';

export { Matrix, Vector, Complex };

// ---------- runners ----------
export function runSync(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

// Runs a generator in time slices. Returns a handle with cancel().
export function runAsync(gen, onDone, onError, sliceMs = 25) {
  let cancelled = false;
  const step = () => {
    if (cancelled) return;
    const t0 = Date.now();
    try {
      let r;
      do {
        r = gen.next();
        if (r.done) { onDone(r.value); return; }
      } while (Date.now() - t0 < sliceMs);
    } catch (e) {
      onError(asCalcError(e));
      return;
    }
    setTimeout(step, 0);
  };
  return { cancel() { cancelled = true; }, step };
}

// ---------- generic arithmetic ----------
const isR = (v) => v instanceof Real;
const isC = (v) => v instanceof Complex;
const isM = (v) => v instanceof Matrix;
const isV = (v) => v instanceof Vector;
const isScalar = (v) => isR(v) || isC(v);

function scalarReal(v) {
  if (isR(v)) return v;
  if (isC(v) && v.im.isZero()) return v.re;
  if (isC(v)) throw new CalcError('Math');
  throw new CalcError('Syntax');
}

function simplifyC(v) { return v; }

export function add(a, b, sign = 1) {
  if (isR(a) && isR(b)) {
    const r = sign > 0 ? R.add(a, b) : R.sub(a, b);
    if (a.dms || b.dms) r.dms = true;
    return r;
  }
  if (isScalar(a) && isScalar(b)) return simplifyC(sign > 0 ? C.cadd(C.toC(a), C.toC(b)) : C.csub(C.toC(a), C.toC(b)));
  if (isM(a) && isM(b)) return M.madd(a, b, sign);
  if (isV(a) && isV(b)) return M.vadd(a, b, sign);
  if ((isM(a) || isV(a) || isM(b) || isV(b))) throw new CalcError('Dimension');
  throw new CalcError('Syntax');
}
export function mul(a, b) {
  if (isR(a) && isR(b)) {
    const r = R.mul(a, b);
    if (a.dms || b.dms) r.dms = true;
    return r;
  }
  if (isScalar(a) && isScalar(b)) return C.cmul(C.toC(a), C.toC(b));
  if (isM(a) && isM(b)) return M.mmul(a, b);
  if (isScalar(a) && isM(b)) return M.mscale(b, scalarReal(a));
  if (isM(a) && isScalar(b)) return M.mscale(a, scalarReal(b));
  if (isV(a) && isV(b)) return M.vcross(a, b);
  if (isScalar(a) && isV(b)) return M.vscale(b, scalarReal(a));
  if (isV(a) && isScalar(b)) return M.vscale(a, scalarReal(b));
  if (isM(a) && isV(b)) return M.mvmul(a, b);
  throw new CalcError('Dimension');
}
export function div(a, b) {
  if (isR(a) && isR(b)) {
    const r = R.div(a, b);
    if (a.dms || b.dms) r.dms = true;
    return r;
  }
  if (isScalar(a) && isScalar(b)) return C.cdiv(C.toC(a), C.toC(b));
  if (isM(a) && isScalar(b)) return M.mscale(a, R.div(ONE_R, scalarReal(b)));
  if (isV(a) && isScalar(b)) return M.vscale(a, R.div(ONE_R, scalarReal(b)));
  if (isM(b) || isV(b)) throw new CalcError('Dimension');
  throw new CalcError('Syntax');
}
export function neg(a) {
  if (isR(a)) return R.neg(a);
  if (isC(a)) return C.cneg(a);
  if (isM(a)) return M.mscale(a, R.neg(ONE_R));
  if (isV(a)) return M.vscale(a, R.neg(ONE_R));
  throw new CalcError('Syntax');
}

function realArg(v) {
  if (isR(v)) return v;
  if (isC(v)) {
    if (v.im.isZero()) return v.re;
    throw new CalcError('Math');
  }
  if (isM(v) || isV(v)) throw new CalcError('Dimension');
  throw new CalcError('Syntax');
}

function powv(a, b) {
  if (isM(a)) {
    const n = realArg(b);
    if (!n.isInt()) throw new CalcError('Math');
    const k = Number(n.toBigInt());
    if (k === -1) return M.minv(a);
    if (k < 0) throw new CalcError('Math');
    return M.mpowInt(a, k);
  }
  if (isC(a) && !a.im.isZero()) {
    const n = realArg(b);
    if (!n.isInt()) throw new CalcError('Math');
    return C.cpowInt(a, n.toBigInt());
  }
  if (isC(b) && !b.im.isZero()) throw new CalcError('Math');
  return F.pow(realArg(a), realArg(b));
}

// ---------- evaluation ----------
// ctx: { unit, mode, getVar, setVar, ans, getMat, getVct, stat, statEst, constant, conv,
//        numFmt, cell, rangeVals, baseN, ticks }

export function* evaluate(node, ctx) {
  try {
    return yield* ev(node, ctx);
  } catch (e) {
    throw asCalcError(e);
  }
}

function tagErr(e, ref) {
  e = asCalcError(e);
  if (e instanceof CalcError && e.pos == null && ref) e.pos = ref;
  return e;
}

function* ev(n, c) {
  try {
    return yield* ev0(n, c);
  } catch (e) {
    throw tagErr(e, n.ref);
  }
}

function* ev0(n, c) {
  if (c.baseN) return yield* evBase(n, c);
  switch (n.k) {
    case 'num': return n.v;
    case 'paren': return yield* ev(n.a, c);
    case 'var': return c.getVar(n.n);
    case 'sym':
      switch (n.id) {
        case 'Ans': return c.ans;
        case 'π': return Real.fromEx(Ex.piRat(1n));
        case 'e': return R.fromDec(D.E);
        case 'i':
          if (c.mode !== 'cmplx' && !c.allowComplex) throw new CalcError('Syntax');
          return C.I;
        case 'Ran#': return F.ranHash();
        default: throw new CalcError('Syntax');
      }
    case 'const': return c.constant(n.id);
    case 'mat': return c.getMat(n.n);
    case 'vct': return c.getVct(n.n);
    case 'stat': return c.stat(n.n);
    case 'cell': return c.cell(n);
    case 'range': throw new CalcError('Syntax');
    case 'dms': {
      const parts = [];
      for (const p of n.parts) parts.push(realArg(yield* ev(p, c)));
      const [d, m, s] = parts;
      const neg = d.sign() < 0;
      let v = F.dmsValue(neg ? R.neg(d) : d, m, s);
      if (neg) v = R.neg(v);
      v.dms = true;
      return v;
    }
    case 'frac': {
      const a = yield* ev(n.a, c), b = yield* ev(n.b, c);
      if (isScalar(b) && (isC(b) ? b.isZero() : b.isZero())) throw new CalcError('Math');
      const r = div(a, b);
      if (isR(r)) r.dms = false;
      return r;
    }
    case 'mixed': {
      const i = realArg(yield* ev(n.i, c)), nn = realArg(yield* ev(n.n, c)), d = realArg(yield* ev(n.d, c));
      if (d.isZero()) throw new CalcError('Math');
      const f = R.div(nn, d);
      return i.sign() < 0 ? R.sub(i, f) : R.add(i, f);
    }
    case 'neg': return neg(yield* ev(n.a, c));
    case 'bin': return yield* evBin(n, c);
    case 'post': return yield* evPost(n, c);
    case 'pow': {
      const a = yield* ev(n.a, c);
      const b = yield* ev(n.b, c);
      return powv(a, b);
    }
    case 'root': {
      const k = realArg(yield* ev(n.n, c));
      const a = realArg(yield* ev(n.a, c));
      return F.root(k, a);
    }
    case 'fn': return yield* evFn(n, c);
    case 'based': throw new CalcError('Syntax');
    case 'int': throw new CalcError('Syntax');
    case 'eq': throw new CalcError('Syntax');
    default: throw new CalcError('Syntax');
  }
}

function* evBin(n, c) {
  const op = n.op;
  const a = yield* ev(n.a, c);
  const b = yield* ev(n.b, c);
  switch (op) {
    case '+': return add(a, b, 1);
    case '-': return add(a, b, -1);
    case '×': case 'imul': return mul(a, b);
    case '÷':
      if (isScalar(b) && b.isZero()) throw new CalcError('Math');
      return div(a, b);
    case 'nPr': return F.nPr(realArg(a), realArg(b));
    case 'nCr': return F.nCr(realArg(a), realArg(b));
    case '∠': {
      if (c.mode !== 'cmplx' && !c.allowComplex) throw new CalcError('Syntax');
      const r = realArg(a), th = realArg(b);
      return new Complex(R.mul(r, F.cos(th, c.unit)), R.mul(r, F.sin(th, c.unit)));
    }
    case '•': {
      if (isV(a) && isV(b)) return M.vdot(a, b);
      throw new CalcError('Syntax');
    }
    default: throw new CalcError('Syntax');
  }
}

function* evPost(n, c) {
  const a = yield* ev(n.a, c);
  const op = n.op;
  const tt = T[op] || {};
  if (op === '▶r∠θ' || op === '▶a+bi') {
    if (c.mode !== 'cmplx') throw new CalcError('Syntax');
    c.outFmt = op === '▶r∠θ' ? 'polar' : 'rect';
    return a;
  }
  if (tt.eng !== undefined) {
    if (isC(a)) return C.cmul(a, C.toC(F.engScale(ONE_R, tt.eng)));
    return F.engScale(realArg(a), tt.eng);
  }
  if (op.startsWith('cv:')) return c.conv(op, realArg(a));
  switch (op) {
    case '²':
      if (isM(a)) return M.mpowInt(a, 2);
      if (isC(a)) return C.cmul(a, a);
      if (isV(a)) throw new CalcError('Syntax');
      return F.sq(realArg(a));
    case '³':
      if (isM(a)) return M.mpowInt(a, 3);
      if (isC(a)) return C.cpowInt(a, 3n);
      return F.cube(realArg(a));
    case '⁻¹':
      if (isM(a)) return M.minv(a);
      if (isC(a)) return C.cdiv(C.toC(ONE_R), a);
      return F.inv(realArg(a));
    case '!': return F.fact(realArg(a));
    case '%': return F.percent(realArg(a));
    case '°': case 'ʳ': case 'ᵍ': return F.angleConv(realArg(a), tt.ang, c.unit);
    case '▶t': return c.statEst('t', realArg(a));
    case 'x̂': return c.statEst('x̂', realArg(a));
    case 'ŷ': return c.statEst('ŷ', realArg(a));
    case 'x̂1': return c.statEst('x̂1', realArg(a));
    case 'x̂2': return c.statEst('x̂2', realArg(a));
    default: throw new CalcError('Syntax');
  }
}

const HEAVY = new Set(['int(', 'diff(', 'sum(', 'Pol(', 'Rec(', 'RanInt(']);

function* evFn(n, c) {
  const f = n.f;
  const args = n.args;
  if (f === 'int(' || f === 'diff(' || f === 'sum(') return yield* evCalculus(n, c);
  if (f === 'Pol(' || f === 'Rec(') {
    if (!c.allowPolRec) throw new CalcError('Syntax');
    if (args.length !== 2) throw new CalcError('Syntax');
    const x = realArg(yield* ev(args[0], c)), y = realArg(yield* ev(args[1], c));
    const [p, q] = f === 'Pol(' ? F.pol(x, y, c.unit) : F.rec(x, y, c.unit);
    return { pair: f === 'Pol(' ? 'pol' : 'rec', a: p, b: q };
  }
  if (f === 'Min(' || f === 'Max(' || f === 'Mean(' || f === 'Sum(') {
    if (!c.rangeVals || args.length !== 1 || args[0].k !== 'range') throw new CalcError('Syntax');
    const vals = c.rangeVals(args[0]);
    if (!vals.length) return ZERO_R;
    let acc = vals[0];
    if (f === 'Min(') { for (const v of vals) if (R.cmp(v, acc) < 0) acc = v; return acc; }
    if (f === 'Max(') { for (const v of vals) if (R.cmp(v, acc) > 0) acc = v; return acc; }
    let s = ZERO_R;
    for (const v of vals) s = R.add(s, v);
    return f === 'Sum(' ? s : R.div(s, Real.int(vals.length));
  }
  const vals = [];
  for (const a of args) vals.push(yield* ev(a, c));
  const need = (k) => { if (vals.length !== k) throw new CalcError('Syntax'); };
  const one = () => { need(1); return vals[0]; };
  const u = c.unit;
  switch (f) {
    case 'sin(': return F.sin(realArg(one()), u);
    case 'cos(': return F.cos(realArg(one()), u);
    case 'tan(': return F.tan(realArg(one()), u);
    case 'asin(': return F.asin(realArg(one()), u);
    case 'acos(': return F.acos(realArg(one()), u);
    case 'atan(': return F.atan(realArg(one()), u);
    case 'sinh(': return F.sinh(realArg(one()));
    case 'cosh(': return F.cosh(realArg(one()));
    case 'tanh(': return F.tanh(realArg(one()));
    case 'asinh(': return F.asinh(realArg(one()));
    case 'acosh(': return F.acosh(realArg(one()));
    case 'atanh(': return F.atanh(realArg(one()));
    case 'log(':
      if (vals.length === 1) return F.log10(realArg(vals[0]));
      need(2);
      return F.logab(realArg(vals[0]), realArg(vals[1]));
    case 'ln(': return F.ln(realArg(one()));
    case 'pow10(': return F.pow10(realArg(one()));
    case 'exp(': return F.expE(realArg(one()));
    case 'sqrt(': {
      const v = one();
      if (isC(v) && !v.im.isZero()) throw new CalcError('Math');
      const r = realArg(v);
      if (r.sign() < 0 && c.mode === 'cmplx') return new Complex(ZERO_R, F.sqrt(R.neg(r)));
      return F.sqrt(r);
    }
    case 'cbrt(': return F.root(Real.int(3), realArg(one()));
    case 'Abs(': {
      const v = one();
      if (isC(v)) return C.cabs(v);
      if (isM(v)) return M.mabs(v);
      if (isV(v)) return M.vnorm(v);
      return F.abs(v);
    }
    case 'Rnd(': {
      const v = one();
      if (isC(v)) return new Complex(F.rnd(v.re, c.numFmt), F.rnd(v.im, c.numFmt));
      return F.rnd(realArg(v), c.numFmt);
    }
    case 'RanInt(': need(2); return F.ranInt(realArg(vals[0]), realArg(vals[1]));
    case 'Arg(': {
      const v = C.toC(one());
      return F.atan2(v.im, v.re, u);
    }
    case 'Conjg(': return C.cconj(C.toC(one()));
    case 'ReP(': return C.creal(one());
    case 'ImP(': return C.cimag(one());
    case 'Det(': { const v = one(); if (!isM(v)) throw new CalcError('Syntax'); return M.mdet(v); }
    case 'Trn(': { const v = one(); if (!isM(v)) throw new CalcError('Syntax'); return M.mtrn(v); }
    case 'Identity(': return M.identity(realArg(one()));
    case 'Angle(': {
      need(2);
      if (!isV(vals[0]) || !isV(vals[1])) throw new CalcError('Syntax');
      return M.vangle(vals[0], vals[1], u);
    }
    case 'UnitV(': { const v = one(); if (!isV(v)) throw new CalcError('Syntax'); return M.vunit(v); }
    case 'P(': case 'Q(': case 'R(': return c.normDist(f[0], realArg(one()));
    default: throw new CalcError('Syntax');
  }
}

// ---------- numerical calculus ----------
const GK_X = ['0.991455371120812639206854697526329', '0.949107912342758524526189684047851', '0.864864423359769072789712788640926', '0.741531185599394439863864773280788', '0.586087235467691130294144845693013', '0.405845151377397166906606412076961', '0.207784955007898467600689403773245', '0'].map((s) => Dec.fromString(s));
const GK_WK = ['0.022935322010529224963732008058970', '0.063092092629978553290700663189204', '0.104790010322250183839876322541518', '0.140653259715525918745189590510238', '0.169004726639267902826583426598550', '0.190350578064785409913256402421014', '0.204432940075298892414161999234649', '0.209482141084727828012999174891714'].map((s) => Dec.fromString(s));
const GK_WG = ['0.129484966168869693270611432679082', '0.279705391489276667901467771423780', '0.381830050505118944950369775488975', '0.417959183673469387755102040816327'].map((s) => Dec.fromString(s));

function* withX(c, fNode, xv) {
  return realArg(yield* ev(fNode, c));
}

function* evCalculus(n, c) {
  if (c.inCalculus) throw new CalcError('Syntax');
  const f = n.f;
  const args = n.args;
  const saveX = c.getVar('x');
  c.inCalculus = true;
  try {
    if (f === 'sum(') {
      if (args.length !== 3) throw new CalcError('Syntax');
      const a = realArg(yield* ev(args[1], c)), b = realArg(yield* ev(args[2], c));
      if (!a.isInt() || !b.isInt()) throw new CalcError('Math');
      const A = a.toBigInt(), B = b.toBigInt();
      const L = 10000000000n;
      if (A <= -L || B >= L || A > B) throw new CalcError('Math');
      let s = ZERO_R;
      let k = 0;
      for (let x = A; x <= B; x++) {
        c.setVar('x', Real.int(x));
        s = add(s, yield* ev(args[0], c), 1);
        if ((++k & 31) === 0) yield;
      }
      return s;
    }
    if (f === 'int(') {
      if (args.length < 3 || args.length > 4) throw new CalcError('Syntax');
      const a = realArg(yield* ev(args[1], c)), b = realArg(yield* ev(args[2], c));
      let tol = Dec.fromString('1e-5');
      if (args.length === 4) tol = realArg(yield* ev(args[3], c)).d.abs();
      return yield* integrate(c, args[0], a, b, tol);
    }
    // diff
    if (args.length < 2 || args.length > 3) throw new CalcError('Syntax');
    const a = realArg(yield* ev(args[1], c));
    let tol = Dec.fromString('1e-10');
    if (args.length === 3) tol = realArg(yield* ev(args[2], c)).d.abs();
    return yield* differentiate(c, args[0], a, tol);
  } finally {
    c.inCalculus = false;
    c.setVar('x', saveX);
  }
}

function* fAt(c, node, xd) {
  c.setVar('x', R.fromDec(xd));
  if ((++c.ticks & 15) === 0) yield;
  return realArg(yield* ev(node, c)).d;
}

function* gk15(c, node, a, b) {
  const W = PREC + 4;
  const h = b.sub(a, W).div(D.TWO, W);
  const m = a.add(h, W);
  let k = D.ZERO, g = D.ZERO;
  const fc = yield* fAt(c, node, m);
  k = fc.mul(GK_WK[7], W);
  g = fc.mul(GK_WG[3], W);
  for (let j = 0; j < 7; j++) {
    const dx = h.mul(GK_X[j], W);
    const f1 = yield* fAt(c, node, m.sub(dx, W));
    const f2 = yield* fAt(c, node, m.add(dx, W));
    const s = f1.add(f2, W);
    k = k.add(s.mul(GK_WK[j], W), W);
    if (j % 2 === 1) g = g.add(s.mul(GK_WG[(j - 1) / 2], W), W);
  }
  const K = k.mul(h, W), G = g.mul(h, W);
  return [K, K.sub(G, W).abs()];
}

function* integrate(c, node, a, b, tol) {
  if (a.d.eq(b.d)) return ZERO_R;
  const W = PREC + 4;
  const t0 = Date.now();
  let intervals = [];
  let [I, E] = yield* gk15(c, node, a.d, b.d);
  intervals.push({ a: a.d, b: b.d, I, E });
  let iter = 0;
  for (;;) {
    let total = D.ZERO, err = D.ZERO;
    for (const iv of intervals) { total = total.add(iv.I, W); err = err.add(iv.E, W); }
    const lim = tol.mul(D.ONE.add(total.abs(), W), W);
    if (err.le(lim) || err.mag() < total.mag() - 14 || total.isZero() && err.isZero()) return R.fromDec(total);
    if (++iter > 200 || intervals.length > 400 || (c.timeLimit && Date.now() - t0 > c.timeLimit)) throw new CalcError('TimeOut');
    // split worst interval
    let wi = 0;
    for (let j = 1; j < intervals.length; j++) if (intervals[j].E.gt(intervals[wi].E)) wi = j;
    const iv = intervals[wi];
    const mid = iv.a.add(iv.b, W).div(D.TWO, W);
    const [I1, E1] = yield* gk15(c, node, iv.a, mid);
    const [I2, E2] = yield* gk15(c, node, mid, iv.b);
    intervals.splice(wi, 1, { a: iv.a, b: mid, I: I1, E: E1 }, { a: mid, b: iv.b, I: I2, E: E2 });
  }
}

function* differentiate(c, node, a, tol) {
  // Ridders' extrapolation of central differences
  const W = PREC + 4;
  const x = a.d;
  const NTAB = 10;
  let h = x.isZero() ? Dec.fromString('0.1') : x.abs().mul(Dec.fromString('0.1'), W);
  if (h.lt(Dec.fromString('0.001'))) h = Dec.fromString('0.001');
  const CON = Dec.fromString('1.4'), CON2 = CON.mul(CON, W);
  const tab = [];
  let best = null, errBest = null;
  let fscale = D.ZERO;
  for (let i = 0; i < NTAB; i++) {
    const f1 = yield* fAt(c, node, x.add(h, W));
    const f2 = yield* fAt(c, node, x.sub(h, W));
    fscale = fscale.abs().gt(f1.abs()) ? fscale : f1.abs();
    tab[i] = [f1.sub(f2, W).div(h.mul(D.TWO, W), W)];
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      const v = tab[i][j - 1].mul(fac, W).sub(tab[i - 1][j - 1], W).div(fac.sub(D.ONE, W), W);
      tab[i][j] = v;
      fac = fac.mul(CON2, W);
      const e1 = v.sub(tab[i][j - 1], W).abs(), e2 = v.sub(tab[i - 1][j - 1], W).abs();
      const errt = e1.gt(e2) ? e1 : e2;
      if (errBest === null || errt.le(errBest)) { errBest = errt; best = v; }
    }
    if (i > 0 && errBest !== null && tab[i][i].sub(tab[i - 1][i - 1], W).abs().ge(errBest.mul(D.TWO, W))) break;
    if (errBest !== null && errBest.lt(tol) && i >= 3) break;
    h = h.div(CON, W);
  }
  if (best === null) throw new CalcError('TimeOut');
  if (errBest.gt(tol.mul(Dec.fromInt(1000), W).add(Dec.fromString('1e-6'), W))) throw new CalcError('TimeOut');
  // results indistinguishable from zero (relative to function scale) are zero
  const noise = fscale.mul(Dec.fromString('1e-11'), W).add(errBest.mul(Dec.fromInt(4), W), W);
  if (best.abs().lt(noise)) return ZERO_R;
  // round off digits beyond the attainable precision
  const digits = Math.max(1, Math.min(PREC, best.mag() - errBest.mag()));
  return R.fromDec(best.round(Math.max(digits, 10)));
}

// ---------- Base-N ----------
const MIN32 = -2147483648n, MAX32 = 2147483647n;
function wrapCheck(v) {
  if (v < MIN32 || v > MAX32) throw new CalcError('Math');
  return v;
}
function toU32(v) { return v < 0n ? v + 4294967296n : v; }
function fromU32(u) { return u >= 2147483648n ? u - 4294967296n : u; }

export function parseBaseLiteral(s, base) {
  const digits = '0123456789ABCDEF'.slice(0, base);
  for (const ch of s) if (!digits.includes(ch)) throw new CalcError('Syntax');
  let v = 0n;
  for (const ch of s) v = v * BigInt(base) + BigInt(digits.indexOf(ch));
  if (base === 10) return wrapCheck(v);
  if (v > 4294967295n) throw new CalcError('Math');
  return fromU32(v);
}

function* evBase(n, c) {
  const r = (x) => x;
  switch (n.k) {
    case 'int': return parseBaseLiteral(n.s, n.base);
    case 'num': throw new CalcError('Syntax');
    case 'paren': return yield* evBase(n.a, c);
    case 'based': return yield* evBase(n.a, c);
    case 'neg': return wrapCheck(-(yield* evBase(n.a, c)));
    case 'var': {
      const v = c.getVar(n.n);
      if (typeof v === 'bigint') return v;
      if (v instanceof Real) {
        const t = v.d.trunc().toBigInt();
        return wrapCheck(t);
      }
      throw new CalcError('Math');
    }
    case 'sym':
      if (n.id === 'Ans') {
        const v = c.ans;
        if (typeof v === 'bigint') return v;
        if (v instanceof Real) return wrapCheck(v.d.trunc().toBigInt());
        return 0n;
      }
      throw new CalcError('Syntax');
    case 'bin': {
      const a = yield* evBase(n.a, c), b = yield* evBase(n.b, c);
      switch (n.op) {
        case '+': return wrapCheck(a + b);
        case '-': return wrapCheck(a - b);
        case '×': case 'imul': return wrapCheck(a * b);
        case '÷':
          if (b === 0n) throw new CalcError('Math');
          return wrapCheck(a / b);
        case 'and': return fromU32(toU32(a) & toU32(b));
        case 'or': return fromU32(toU32(a) | toU32(b));
        case 'xor': return fromU32(toU32(a) ^ toU32(b));
        case 'xnor': return fromU32((toU32(a) ^ toU32(b)) ^ 4294967295n);
        default: throw new CalcError('Syntax');
      }
    }
    case 'fn': {
      if (n.args.length !== 1) throw new CalcError('Syntax');
      const a = yield* evBase(n.args[0], c);
      if (n.f === 'Not(') return fromU32(toU32(a) ^ 4294967295n);
      if (n.f === 'Neg(') return fromU32((4294967296n - toU32(a)) % 4294967296n);
      throw new CalcError('Syntax');
    }
    default: void r; throw new CalcError('Syntax');
  }
}

export { realArg, HEAVY };
