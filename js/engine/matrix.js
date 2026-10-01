// Matrix (up to 4x4) and vector (2 or 3 dimensions) values and operations.
import * as R from './real.js';
import { Real, ZERO_R, ONE_R } from './real.js';
import * as F from './fn.js';
import { CalcError } from './errors.js';

export class Matrix {
  constructor(a) {
    this.a = a; // Real[][]
    this.r = a.length;
    this.c = a[0].length;
  }
  static zeros(r, c) { return new Matrix(Array.from({ length: r }, () => Array.from({ length: c }, () => ZERO_R))); }
  get(i, j) { return this.a[i][j]; }
}
export class Vector {
  constructor(a) { this.a = a; this.n = a.length; }
  static zeros(n) { return new Vector(Array.from({ length: n }, () => ZERO_R)); }
}

const dim = () => new CalcError('Dimension');

export function madd(A, B, sign = 1) {
  if (A.r !== B.r || A.c !== B.c) throw dim();
  return new Matrix(A.a.map((row, i) => row.map((v, j) => (sign > 0 ? R.add(v, B.a[i][j]) : R.sub(v, B.a[i][j])))));
}
export function mscale(A, k) { return new Matrix(A.a.map((row) => row.map((v) => R.mul(k, v)))); }
export function mmul(A, B) {
  if (A.c !== B.r) throw dim();
  const out = [];
  for (let i = 0; i < A.r; i++) {
    const row = [];
    for (let j = 0; j < B.c; j++) {
      let s = ZERO_R;
      for (let k = 0; k < A.c; k++) s = R.add(s, R.mul(A.a[i][k], B.a[k][j]));
      row.push(s);
    }
    out.push(row);
  }
  return new Matrix(out);
}
export function mtrn(A) {
  return new Matrix(Array.from({ length: A.c }, (_, j) => Array.from({ length: A.r }, (_, i) => A.a[i][j])));
}
export function identity(n) {
  if (!n.isInt()) throw new CalcError('Argument');
  const k = Number(n.toBigInt());
  if (k < 1 || k > 4) throw new CalcError('Argument');
  return new Matrix(Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? ONE_R : ZERO_R))));
}
export function mdet(A) {
  if (A.r !== A.c) throw dim();
  const det = (m) => {
    const n = m.length;
    if (n === 1) return m[0][0];
    if (n === 2) return R.sub(R.mul(m[0][0], m[1][1]), R.mul(m[0][1], m[1][0]));
    let s = ZERO_R;
    for (let j = 0; j < n; j++) {
      const minor = m.slice(1).map((row) => row.filter((_, k) => k !== j));
      const t = R.mul(m[0][j], det(minor));
      s = j % 2 === 0 ? R.add(s, t) : R.sub(s, t);
    }
    return s;
  };
  return det(A.a);
}
export function minv(A) {
  if (A.r !== A.c) throw dim();
  const n = A.r;
  const m = A.a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? ONE_R : ZERO_R))]);
  for (let col = 0; col < n; col++) {
    let piv = -1;
    for (let r = col; r < n; r++) {
      if (m[r][col].isZero()) continue;
      if (piv < 0 || m[r][col].d.abs().gt(m[piv][col].d.abs())) piv = r;
    }
    if (piv < 0) throw new CalcError('Math');
    [m[col], m[piv]] = [m[piv], m[col]];
    const pv = m[col][col];
    m[col] = m[col].map((v) => R.div(v, pv));
    for (let r = 0; r < n; r++) {
      if (r === col || m[r][col].isZero()) continue;
      const f = m[r][col];
      m[r] = m[r].map((v, k) => R.sub(v, R.mul(f, m[col][k])));
    }
  }
  return new Matrix(m.map((row) => row.slice(n)));
}
export function mpowInt(A, n) {
  if (A.r !== A.c) throw dim();
  let res = identity(Real.int(A.r));
  for (let i = 0; i < n; i++) res = mmul(res, A);
  return res;
}
export function mabs(A) { return new Matrix(A.a.map((row) => row.map((v) => R.abs(v)))); }

// ---- vectors ----
export function vadd(a, b, sign = 1) {
  if (a.n !== b.n) throw dim();
  return new Vector(a.a.map((v, i) => (sign > 0 ? R.add(v, b.a[i]) : R.sub(v, b.a[i]))));
}
export function vscale(a, k) { return new Vector(a.a.map((v) => R.mul(k, v))); }
export function vdot(a, b) {
  if (a.n !== b.n) throw dim();
  let s = ZERO_R;
  for (let i = 0; i < a.n; i++) s = R.add(s, R.mul(a.a[i], b.a[i]));
  return s;
}
export function vcross(a, b) {
  if (a.n !== b.n) throw dim();
  const g = (v) => (v.n === 2 ? [v.a[0], v.a[1], ZERO_R] : v.a);
  const [a1, a2, a3] = g(a), [b1, b2, b3] = g(b);
  return new Vector([
    R.sub(R.mul(a2, b3), R.mul(a3, b2)),
    R.sub(R.mul(a3, b1), R.mul(a1, b3)),
    R.sub(R.mul(a1, b2), R.mul(a2, b1)),
  ]);
}
export function vnorm(a) { return R.sqrtR(vdot(a, a)); }
export function vangle(a, b, unit) {
  const d = R.mul(vnorm(a), vnorm(b));
  if (d.isZero()) throw new CalcError('Math');
  let c = R.div(vdot(a, b), d);
  // clamp rounding noise
  if (c.d.abs().gt(R.ONE_R.d)) c = c.sign() > 0 ? ONE_R : R.neg(ONE_R);
  return F.acos(c, unit);
}
export function vunit(a) {
  const n = vnorm(a);
  if (n.isZero()) throw new CalcError('Math');
  return new Vector(a.a.map((v) => R.div(v, n)));
}
// vector times matrix and matrix times vector (treated as column/row)
export function mvmul(A, v) {
  if (A.c !== v.n) throw dim();
  return new Vector(A.a.map((row) => row.reduce((s, x, k) => R.add(s, R.mul(x, v.a[k])), ZERO_R)));
}
