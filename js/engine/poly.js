// Polynomial roots (degree 2..4) and simultaneous linear equations (2..4 unknowns).
// Exact (fraction / surd) results where possible, high-precision numeric otherwise.
import * as D from './decimal.js';
import { Dec } from './decimal.js';
import * as R from './real.js';
import { Real, ZERO_R, ONE_R, gcd, babs } from './real.js';
import { Complex } from './complex.js';
import * as C from './complex.js';
import { CalcError } from './errors.js';

// ---------- simultaneous equations ----------
// rows: [[a1,...,an, c], ...] (Real). Returns {status:'ok', sol:[Real]} | {status:'none'} | {status:'inf'}
export function solveLinear(rows) {
  const n = rows.length;
  const m = rows.map((r) => r.slice());
  let rank = 0;
  const pivCols = [];
  for (let col = 0; col < n && rank < n; col++) {
    let piv = -1;
    for (let r = rank; r < n; r++) {
      if (!isZeroish(m[r][col])) { if (piv < 0 || m[r][col].d.abs().gt(m[piv][col].d.abs())) piv = r; }
    }
    if (piv < 0) continue;
    [m[rank], m[piv]] = [m[piv], m[rank]];
    const pv = m[rank][col];
    m[rank] = m[rank].map((v) => R.div(v, pv));
    for (let r = 0; r < n; r++) {
      if (r === rank || isZeroish(m[r][col])) continue;
      const f = m[r][col];
      m[r] = m[r].map((v, k) => R.sub(v, R.mul(f, m[rank][k])));
    }
    pivCols.push(col);
    rank++;
  }
  if (rank < n) {
    for (let r = rank; r < n; r++) if (!isZeroish(m[r][n])) return { status: 'none' };
    return { status: 'inf' };
  }
  const sol = new Array(n);
  for (let r = 0; r < n; r++) sol[pivCols[r]] = clean(m[r][n]);
  return { status: 'ok', sol };
}
function isZeroish(v) {
  if (v.isZero()) return true;
  if (v.x) return false;
  return v.d.abs().mag() < -13;
}
function clean(v) { return isZeroish(v) ? ZERO_R : v; }

// ---------- polynomials ----------
// coefs: highest degree first, Real. Returns {roots:[Real|Complex]} ordered like the calculator
export function polyRoots(coefs) {
  if (coefs[0].isZero()) throw new CalcError('Math');
  const deg = coefs.length - 1;
  // exact path for rational coefficients
  const exact = coefs.every((c) => c.isRational());
  let rest = coefs.slice();
  const found = [];
  if (exact && deg > 2) {
    for (let guard = 0; guard < 4 && rest.length > 3; guard++) {
      const r = rationalRoot(rest);
      if (!r) break;
      found.push(r);
      rest = deflate(rest, r);
    }
  }
  let roots = [...found];
  if (rest.length === 3) roots.push(...quadratic(rest[0], rest[1], rest[2]));
  else if (rest.length > 3) roots.push(...numericRoots(rest));
  else if (rest.length === 2) roots.push(R.neg(R.div(rest[1], rest[0])));
  return sortRoots(roots);
}

function sortRoots(roots) {
  const real = [], cplx = [];
  for (const r of roots) {
    if (r instanceof Complex && !r.im.isZero()) cplx.push(r);
    else real.push(r instanceof Complex ? r.re : r);
  }
  if (roots.length === 2 && real.length === 2) return real; // quadratic keeps formula order
  real.sort((a, b) => R.cmp(b, a));
  cplx.sort((a, b) => R.cmp(b.re, a.re) || R.cmp(b.im, a.im));
  return [...real, ...cplx];
}

function quadratic(a, b, c) {
  const disc = R.sub(R.mul(b, b), R.mul(Real.int(4), R.mul(a, c)));
  const twoA = R.mul(Real.int(2), a);
  const nb = R.neg(b);
  if (disc.sign() >= 0) {
    const sq = R.sqrtR(disc);
    return [R.div(R.add(nb, sq), twoA), R.div(R.sub(nb, sq), twoA)];
  }
  const sq = R.sqrtR(R.neg(disc));
  const re = R.div(nb, twoA), im = R.div(sq, twoA);
  return [new Complex(re, im), new Complex(re, R.neg(im))];
}

function deflate(coefs, r) {
  // synthetic division by (x - r)
  const out = [coefs[0]];
  for (let i = 1; i < coefs.length - 1; i++) out.push(R.add(coefs[i], R.mul(out[i - 1], r)));
  return out;
}

function divisors(n, limit = 20000) {
  n = babs(n);
  if (n === 0n) return [1n];
  if (n > 1000000000000n) return null;
  const out = [];
  const N = Number(n);
  for (let i = 1; i * i <= N; i++) {
    if (N % i === 0) { out.push(BigInt(i)); if (i * i !== N) out.push(BigInt(N / i)); }
    if (out.length > limit) return null;
  }
  return out;
}

function rationalRoot(coefs) {
  // integer-scale coefficients
  let L = 1n;
  for (const c of coefs) { const d = c.x.d; L = (L / gcd(L, d)) * d; }
  const ints = coefs.map((c) => (c.x.num() * L) / c.x.d);
  let k = ints.length - 1;
  // zero root
  if (ints[k] === 0n) return ZERO_R;
  const P = divisors(ints[k]), Q = divisors(ints[0]);
  if (!P || !Q) return null;
  const evalAt = (p, q) => {
    // sum ints[i] p^(deg-i) q^i
    const deg = ints.length - 1;
    let s = 0n;
    for (let i = 0; i <= deg; i++) s += ints[i] * p ** BigInt(deg - i) * q ** BigInt(i);
    return s;
  };
  const cands = [];
  for (const q of Q) for (const p of P) { if (gcd(p, q) === 1n) { cands.push([p, q]); cands.push([-p, q]); } }
  cands.sort((a, b) => Number(a[0]) / Number(a[1]) - Number(b[0]) / Number(b[1]));
  for (const [p, q] of cands) if (evalAt(p, q) === 0n) return Real.rat(p, q);
  void k;
  return null;
}

// ---- numeric roots: Durand-Kerner in decimal complex arithmetic ----
const W = 30;
class DC {
  constructor(re, im) { this.re = re; this.im = im; }
  add(o) { return new DC(this.re.add(o.re, W), this.im.add(o.im, W)); }
  sub(o) { return new DC(this.re.sub(o.re, W), this.im.sub(o.im, W)); }
  mul(o) { return new DC(this.re.mul(o.re, W).sub(this.im.mul(o.im, W), W), this.re.mul(o.im, W).add(this.im.mul(o.re, W), W)); }
  div(o) {
    const den = o.re.mul(o.re, W).add(o.im.mul(o.im, W), W);
    if (den.isZero()) throw new CalcError('Math');
    return new DC(this.re.mul(o.re, W).add(this.im.mul(o.im, W), W).div(den, W), this.im.mul(o.re, W).sub(this.re.mul(o.im, W), W).div(den, W));
  }
  abs2() { return this.re.mul(this.re, W).add(this.im.mul(this.im, W), W); }
}
function numericRoots(coefs) {
  const n = coefs.length - 1;
  const a0 = coefs[0].d;
  const c = coefs.map((v) => new DC(v.d.div(a0, W), D.ZERO));
  const evalP = (z) => { let s = c[0]; for (let i = 1; i <= n; i++) s = s.mul(z).add(c[i]); return s; };
  // bound for initial circle
  let rad = D.ONE;
  for (let i = 1; i <= n; i++) { const a = c[i].re.abs(); if (a.gt(rad)) rad = a; }
  rad = rad.add(D.ONE, W);
  let z = [];
  for (let k = 0; k < n; k++) {
    const ang = Dec.fromNumber((2 * Math.PI * k) / n + 0.4);
    z.push(new DC(rad.mul(D.cos(ang, W), W).mul(Dec.fromString('0.8'), W), rad.mul(D.sin(ang, W), W).mul(Dec.fromString('0.8'), W)));
  }
  for (let it = 0; it < 500; it++) {
    let maxStep = D.ZERO;
    const nz = [];
    for (let i = 0; i < n; i++) {
      let den = new DC(D.ONE, D.ZERO);
      for (let j = 0; j < n; j++) if (j !== i) den = den.mul(z[i].sub(z[j]));
      const step = evalP(z[i]).div(den);
      nz.push(z[i].sub(step));
      const s2 = step.abs2();
      if (s2.gt(maxStep)) maxStep = s2;
    }
    z = nz;
    if (maxStep.isZero() || maxStep.mag() < -50) break;
  }
  return z.map((r) => {
    const re = R.fromDec(r.re.round(D.PREC));
    const scale = r.re.abs().gt(D.ONE) ? r.re.abs() : D.ONE;
    if (r.im.abs().le(scale.mul(Dec.fromString('1e-12'), W))) return snapReal(re);
    return new Complex(snapReal(re), snapReal(R.fromDec(r.im.round(D.PREC))));
  });
}
function snapReal(v) {
  // values within rounding noise of zero
  if (v.d.abs().mag() < -13) return ZERO_R;
  return v;
}

// evaluate polynomial (Real coefs) at decimal x
export function polyEval(coefs, x) {
  let s = D.ZERO;
  for (const c of coefs) s = s.mul(x, W).add(c.d, W);
  return s;
}

// real roots only (for inequalities), sorted ascending, with multiplicity info
export function realRootsAsc(coefs) {
  const roots = polyRoots(coefs).filter((r) => !(r instanceof Complex));
  // merge duplicates
  const out = [];
  for (const r of roots.sort((a, b) => R.cmp(a, b))) {
    const last = out[out.length - 1];
    if (last && last.v.d.sub(r.d, W).abs().lt(Dec.fromString('1e-9'))) last.mult++;
    else out.push({ v: r, mult: 1 });
  }
  return out;
}

export { ONE_R, C };
