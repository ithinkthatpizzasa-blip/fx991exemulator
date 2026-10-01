// Statistics (single/paired variable, 7 regression types) and probability
// distributions (normal, binomial, Poisson).
import * as D from './decimal.js';
import { Dec, PREC } from './decimal.js';
import * as R from './real.js';
import { Real, ZERO_R, ONE_R } from './real.js';
import { CalcError } from './errors.js';

const W = PREC + 6;
const dd = (v) => (v instanceof Real ? v.d : v);
const toR = (d) => R.fromDec(d);
const N = (k) => Dec.fromInt(k);

export const REG_TYPES = [
  { id: '1', name: '1-Variable', paired: false },
  { id: 'lin', name: '𝑦=𝑎+𝑏𝑥', paired: true },
  { id: 'quad', name: '𝑦=𝑎+𝑏𝑥+𝑐𝑥²', paired: true },
  { id: 'log', name: '𝑦=𝑎+𝑏•ln(𝑥)', paired: true },
  { id: 'eexp', name: '𝑦=𝑎•𝑒^(𝑏𝑥)', paired: true },
  { id: 'abexp', name: '𝑦=𝑎•𝑏^𝑥', paired: true },
  { id: 'pow', name: '𝑦=𝑎•𝑥^𝑏', paired: true },
  { id: 'inv', name: '𝑦=𝑎+𝑏/𝑥', paired: true },
];

// rows: [{x: Real, y?: Real, f?: Real}]
export function computeStats(rows, paired, useFreq) {
  const xs = [], ys = [], fs = [];
  for (const r of rows) {
    const f = useFreq && r.f ? r.f.d : D.ONE;
    if (f.isNeg()) throw new CalcError('Math');
    xs.push(r.x.d);
    ys.push(paired && r.y ? r.y.d : D.ZERO);
    fs.push(f);
  }
  let n = D.ZERO, sx = D.ZERO, sx2 = D.ZERO, sy = D.ZERO, sy2 = D.ZERO, sxy = D.ZERO, sx3 = D.ZERO, sx2y = D.ZERO, sx4 = D.ZERO;
  const P = 30;
  for (let i = 0; i < xs.length; i++) {
    const f = fs[i], x = xs[i], y = ys[i];
    const x2 = x.mul(x, P);
    n = n.add(f, P);
    sx = sx.add(f.mul(x, P), P);
    sx2 = sx2.add(f.mul(x2, P), P);
    sy = sy.add(f.mul(y, P), P);
    sy2 = sy2.add(f.mul(y.mul(y, P), P), P);
    sxy = sxy.add(f.mul(x.mul(y, P), P), P);
    sx3 = sx3.add(f.mul(x2.mul(x, P), P), P);
    sx2y = sx2y.add(f.mul(x2.mul(y, P), P), P);
    sx4 = sx4.add(f.mul(x2.mul(x2, P), P), P);
  }
  const s = { n, sx, sx2, sy, sy2, sxy, sx3, sx2y, sx4, xs, ys, fs, paired };
  return s;
}

function needN(s, k = 1) { if (s.n.lt(N(k))) throw new CalcError('Math'); }

export function statValue(s, name) {
  const P = W;
  switch (name) {
    case 'n': return toR(s.n);
    case 'sx': return toR(s.sx);
    case 'sx2': return toR(s.sx2);
    case 'sy': return toR(s.sy);
    case 'sy2': return toR(s.sy2);
    case 'sxy': return toR(s.sxy);
    case 'sx3': return toR(s.sx3);
    case 'sx2y': return toR(s.sx2y);
    case 'sx4': return toR(s.sx4);
    case 'xbar': needN(s); return toR(s.sx.div(s.n, P));
    case 'ybar': needN(s); return toR(s.sy.div(s.n, P));
    case 's2x': return toR(variance(s.sx, s.sx2, s.n, false));
    case 'sigx': return toR(D.sqrt(variance(s.sx, s.sx2, s.n, false), P));
    case 'ss2x': return toR(variance(s.sx, s.sx2, s.n, true));
    case 'ssx': return toR(D.sqrt(variance(s.sx, s.sx2, s.n, true), P));
    case 's2y': return toR(variance(s.sy, s.sy2, s.n, false));
    case 'sigy': return toR(D.sqrt(variance(s.sy, s.sy2, s.n, false), P));
    case 'ss2y': return toR(variance(s.sy, s.sy2, s.n, true));
    case 'ssy': return toR(D.sqrt(variance(s.sy, s.sy2, s.n, true), P));
    case 'minx': return toR(minmax(s.xs, s.fs, -1));
    case 'maxx': return toR(minmax(s.xs, s.fs, 1));
    case 'miny': return toR(minmax(s.ys, s.fs, -1));
    case 'maxy': return toR(minmax(s.ys, s.fs, 1));
    case 'Q1': return toR(quartile(s, 1));
    case 'Med': return toR(quartile(s, 2));
    case 'Q3': return toR(quartile(s, 3));
    default: throw new CalcError('Syntax');
  }
}

function variance(sx, sx2, n, sample) {
  const den = sample ? n.sub(D.ONE, W) : n;
  if (den.sign() <= 0) throw new CalcError('Math');
  let v = sx2.sub(sx.mul(sx, 40).div(n, 40), 40).div(den, W);
  if (v.isNeg()) v = D.ZERO;
  return v;
}
function minmax(arr, fs, dir) {
  let best = null;
  arr.forEach((v, i) => { if (fs[i].isZero()) return; if (best === null || (dir < 0 ? v.lt(best) : v.gt(best))) best = v; });
  if (best === null) throw new CalcError('Math');
  return best;
}

// Casio quartile method: Q1/Q3 are medians of the lower/upper halves
function quartile(s, q) {
  const pairs = s.xs.map((x, i) => [x, s.fs[i]]).filter((p) => !p[1].isZero());
  for (const [, f] of pairs) if (!f.isInt()) throw new CalcError('Math');
  pairs.sort((a, b) => a[0].cmp(b[0]));
  const n = Number(s.n.toBigInt());
  if (n < 1) throw new CalcError('Math');
  const at = (k) => { // k-th value (0-based)
    let c = 0;
    for (const [x, f] of pairs) { c += Number(f.toBigInt()); if (k < c) return x; }
    return pairs[pairs.length - 1][0];
  };
  const med = (start, len) => {
    if (len <= 0) return at(start);
    if (len % 2) return at(start + (len - 1) / 2);
    return at(start + len / 2 - 1).add(at(start + len / 2), W).div(D.TWO, W);
  };
  if (q === 2) return med(0, n);
  const half = Math.floor(n / 2);
  if (n === 1) return at(0);
  if (q === 1) return med(0, half);
  return med(n - half, half);
}

// ---------- regression ----------
function linFit(X, Y, F) {
  let n = D.ZERO, sx = D.ZERO, sy = D.ZERO, sxx = D.ZERO, syy = D.ZERO, sxy = D.ZERO;
  const P = 34;
  for (let i = 0; i < X.length; i++) {
    const f = F[i];
    n = n.add(f, P); sx = sx.add(f.mul(X[i], P), P); sy = sy.add(f.mul(Y[i], P), P);
    sxx = sxx.add(f.mul(X[i].mul(X[i], P), P), P); syy = syy.add(f.mul(Y[i].mul(Y[i], P), P), P); sxy = sxy.add(f.mul(X[i].mul(Y[i], P), P), P);
  }
  const Sxx = sxx.sub(sx.mul(sx, P).div(n, P), P), Syy = syy.sub(sy.mul(sy, P).div(n, P), P), Sxy = sxy.sub(sx.mul(sy, P).div(n, P), P);
  if (Sxx.isZero()) throw new CalcError('Math');
  const b = Sxy.div(Sxx, W);
  const a = sy.div(n, P).sub(b.mul(sx.div(n, P), P), W);
  let r = null;
  if (!Syy.isZero() && Sxx.sign() > 0 && Syy.sign() > 0) r = Sxy.div(D.sqrt(Sxx.mul(Syy, P), P), W);
  else r = D.ZERO;
  return { a, b, r };
}

export function regression(s, type) {
  const F = s.fs;
  const X = s.xs, Y = s.ys;
  const P = W;
  const lnArr = (arr) => arr.map((v) => { if (v.sign() <= 0) throw new CalcError('Math'); return D.ln(v, P); });
  switch (type) {
    case 'lin': return linFit(X, Y, F);
    case 'log': return linFit(lnArr(X), Y, F);
    case 'inv': return linFit(X.map((v) => { if (v.isZero()) throw new CalcError('Math'); return D.ONE.div(v, P); }), Y, F);
    case 'eexp': { const f = linFit(X, lnArr(Y), F); return { a: D.exp(f.a, P), b: f.b, r: f.r }; }
    case 'abexp': { const f = linFit(X, lnArr(Y), F); return { a: D.exp(f.a, P), b: D.exp(f.b, P), r: f.r }; }
    case 'pow': { const f = linFit(lnArr(X), lnArr(Y), F); return { a: D.exp(f.a, P), b: f.b, r: f.r }; }
    case 'quad': {
      const { n, sx, sx2, sx3, sx4, sy, sxy, sx2y } = s;
      const A = [[n, sx, sx2, sy], [sx, sx2, sx3, sxy], [sx2, sx3, sx4, sx2y]];
      const sol = solveDecLinear(A);
      return { a: sol[0], b: sol[1], c: sol[2] };
    }
    default: throw new CalcError('Syntax');
  }
}

function solveDecLinear(A) {
  const n = A.length;
  const P = 34;
  const m = A.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (m[r][c].abs().gt(m[p][c].abs())) p = r;
    if (m[p][c].isZero()) throw new CalcError('Math');
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c].div(m[c][c], P);
      for (let k = c; k <= n; k++) m[r][k] = m[r][k].sub(f.mul(m[c][k], P), P);
    }
  }
  return m.map((row, i) => row[n].div(row[i], W));
}

export function regValue(reg, name) {
  const v = { ra: reg.a, rb: reg.b, rc: reg.c, rr: reg.r }[name];
  if (v === undefined || v === null) throw new CalcError('Syntax');
  return toR(v);
}

export function estimate(reg, type, op, v) {
  const x = v.d, P = W;
  const { a, b, c } = reg;
  const yhat = (t) => {
    switch (type) {
      case 'lin': return a.add(b.mul(t, P), P);
      case 'quad': return a.add(b.mul(t, P), P).add(c.mul(t.mul(t, P), P), P);
      case 'log': if (t.sign() <= 0) throw new CalcError('Math'); return a.add(b.mul(D.ln(t, P), P), P);
      case 'eexp': return a.mul(D.exp(b.mul(t, P), P), P);
      case 'abexp': return a.mul(D.powReal(b, t, P), P);
      case 'pow': if (t.sign() <= 0) throw new CalcError('Math'); return a.mul(D.powReal(t, b, P), P);
      case 'inv': if (t.isZero()) throw new CalcError('Math'); return a.add(b.div(t, P), P);
      default: throw new CalcError('Syntax');
    }
  };
  if (op === 'ŷ') return toR(yhat(x));
  if (type === 'quad') {
    if (op === 'x̂') throw new CalcError('Syntax');
    if (c.isZero()) throw new CalcError('Math');
    const disc = b.mul(b, P).sub(N(4).mul(c, P).mul(a.sub(x, P), P), P);
    if (disc.isNeg()) throw new CalcError('Math');
    const sq = D.sqrt(disc, P);
    const den = c.mul(D.TWO, P);
    return toR((op === 'x̂1' ? b.neg().add(sq, P) : b.neg().sub(sq, P)).div(den, P));
  }
  if (op !== 'x̂') throw new CalcError('Syntax');
  switch (type) {
    case 'lin': if (b.isZero()) throw new CalcError('Math'); return toR(x.sub(a, P).div(b, P));
    case 'log': if (b.isZero()) throw new CalcError('Math'); return toR(D.exp(x.sub(a, P).div(b, P), P));
    case 'eexp': { const q = x.div(a, P); if (q.sign() <= 0 || b.isZero()) throw new CalcError('Math'); return toR(D.ln(q, P).div(b, P)); }
    case 'abexp': { const q = x.div(a, P); if (q.sign() <= 0) throw new CalcError('Math'); const lb = D.ln(b, P); if (lb.isZero()) throw new CalcError('Math'); return toR(D.ln(q, P).div(lb, P)); }
    case 'pow': { const q = x.div(a, P); if (q.sign() <= 0 || b.isZero()) throw new CalcError('Math'); return toR(D.powReal(q, D.ONE.div(b, P), P)); }
    case 'inv': { const q = x.sub(a, P); if (q.isZero()) throw new CalcError('Math'); return toR(b.div(q, P)); }
    default: throw new CalcError('Syntax');
  }
}

// ---------- normal distribution ----------
const SQRT2 = D.sqrt(D.TWO, 40);
export function phi(t) { // standard normal CDF
  const z = t.div(SQRT2, W).neg();
  return D.erfc(z, W).div(D.TWO, W);
}
export function upperTail(t) { return D.erfc(t.div(SQRT2, W), W).div(D.TWO, W); }

// P(, Q(, R( : results rounded to 5 decimal places (as the real unit shows)
export function normDistFn(kind, tv) {
  const t = tv.d;
  let v;
  if (kind === 'P') v = phi(t);
  else if (kind === 'R') v = upperTail(t);
  else v = phi(t.abs()).sub(D.HALF, W);
  return R.fromDec(v.roundDP(5));
}

const SQRT2PI = D.sqrt(D.PI.mul(D.TWO, 40), 40);
export function normalPD(x, sigma, mu) {
  if (sigma.sign() <= 0) throw new CalcError('Math');
  const z = x.sub(mu, W).div(sigma, W);
  return D.exp(z.mul(z, W).div(D.TWO, W).neg(), W).div(sigma.mul(SQRT2PI, W), PREC);
}
export function normalCD(lo, hi, sigma, mu) {
  if (sigma.sign() <= 0) throw new CalcError('Math');
  const zl = lo.sub(mu, W).div(sigma, W), zh = hi.sub(mu, W).div(sigma, W);
  // use the tail giving best precision
  let p;
  if (zl.sign() >= 0) p = upperTail(zl).sub(upperTail(zh), W);
  else if (zh.sign() <= 0) p = phi(zh).sub(phi(zl), W);
  else p = D.ONE.sub(phi(zl), W).sub(upperTail(zh), W);
  return p.round(PREC);
}
export function invNormal(area, sigma, mu) {
  if (sigma.sign() <= 0 || area.sign() < 0 || area.gt(D.ONE)) throw new CalcError('Math');
  if (area.isZero() || area.eq(D.ONE)) throw new CalcError('Math');
  // initial guess (Acklam's rational approximation in double precision)
  const pnum = area.toNumber();
  let z = acklam(pnum);
  let zd = Dec.fromNumber(z);
  for (let i = 0; i < 30; i++) {
    const f = phi(zd).sub(area, W);
    const dens = D.exp(zd.mul(zd, W).div(D.TWO, W).neg(), W).div(SQRT2PI, W);
    if (dens.isZero()) break;
    const step = f.div(dens, W);
    zd = zd.sub(step, W);
    if (step.isZero() || step.abs().mag() < -18) break;
  }
  return mu.add(sigma.mul(zd, W), PREC);
}
function acklam(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- discrete distributions ----------
function lnFact(n) {
  // ln(n!) for integer n >= 0
  if (n < 2) return D.ZERO;
  if (n <= 2000) {
    let s = D.ZERO;
    for (let k = 2; k <= n; k++) s = s.add(D.ln(N(k), W), W);
    return s;
  }
  // Stirling series
  const x = N(n);
  const P = W;
  let s = x.mul(D.ln(x, P), P).sub(x, P).add(D.ln(D.PI.mul(D.TWO, P).mul(x, P), P).div(D.TWO, P), P);
  const x2 = x.mul(x, P);
  s = s.add(D.ONE.div(N(12).mul(x, P), P), P).sub(D.ONE.div(N(360).mul(x2.mul(x, P), P), P), P);
  return s;
}
function checkInt(v, min = 0) {
  if (!v.isInt() || v.lt(N(min))) throw new CalcError('Math');
  return Number(v.toBigInt());
}
export function binomialPD(xv, nv, p) {
  const n = checkInt(nv);
  if (p.isNeg() || p.gt(D.ONE)) throw new CalcError('Math');
  if (!xv.isInt()) throw new CalcError('Math');
  const x = Number(xv.toBigInt());
  if (x < 0 || x > n) return D.ZERO;
  if (p.isZero()) return x === 0 ? D.ONE : D.ZERO;
  if (p.eq(D.ONE)) return x === n ? D.ONE : D.ZERO;
  const P = W;
  const lc = lnFact(n).sub(lnFact(x), P).sub(lnFact(n - x), P);
  const l = lc.add(N(x).mul(D.ln(p, P), P), P).add(N(n - x).mul(D.ln(D.ONE.sub(p, P), P), P), P);
  return D.exp(l, PREC);
}
export function binomialCD(xv, nv, p) {
  const n = checkInt(nv);
  if (!xv.isInt()) throw new CalcError('Math');
  const x = Number(xv.toBigInt());
  if (x < 0) return D.ZERO;
  if (x >= n) return D.ONE;
  let s = D.ZERO;
  for (let k = 0; k <= x; k++) s = s.add(binomialPD(N(k), nv, p), W);
  return s.gt(D.ONE) ? D.ONE : s.round(PREC);
}
export function poissonPD(xv, lambda) {
  if (lambda.sign() <= 0) throw new CalcError('Math');
  if (!xv.isInt()) throw new CalcError('Math');
  const x = Number(xv.toBigInt());
  if (x < 0) return D.ZERO;
  const P = W;
  const l = N(x).mul(D.ln(lambda, P), P).sub(lambda, P).sub(lnFact(x), P);
  return D.exp(l, PREC);
}
export function poissonCD(xv, lambda) {
  if (!xv.isInt()) throw new CalcError('Math');
  const x = Number(xv.toBigInt());
  if (x < 0) return D.ZERO;
  let s = D.ZERO;
  for (let k = 0; k <= x; k++) s = s.add(poissonPD(N(k), lambda), W);
  return s.gt(D.ONE) ? D.ONE : s.round(PREC);
}

export { ZERO_R, ONE_R };
