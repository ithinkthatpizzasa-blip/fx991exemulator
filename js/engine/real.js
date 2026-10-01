// Real numbers with optional exact representation.
// Exact forms ("Ex"): (sum of c_i * sqrt(r_i)) / d, at most two terms,
// or a rational multiple of pi. Decimal value is always kept (15 digits).
import * as D from './decimal.js';
import { Dec, PREC } from './decimal.js';
import { CalcError } from './errors.js';

export function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}
export function babs(a) { return a < 0n ? -a : a; }

const LIMIT = 10n ** 32n; // exact forms with larger integers are dropped
const RAD_LIMIT = 10n ** 10n; // radicands we are willing to factor

// n = k^2 * r with r squarefree. Returns [k, r] or null when too large.
const sqCache = new Map();
export function squareFree(n) {
  if (n <= 0n) return null;
  if (n > RAD_LIMIT) return null;
  const key = n;
  if (sqCache.has(key)) return sqCache.get(key);
  let m = Number(n), k = 1, r = 1;
  for (let p = 2; p * p <= m; p += p === 2 ? 1 : 2) {
    if (m % p === 0) {
      let c = 0;
      while (m % p === 0) { m /= p; c++; }
      k *= p ** Math.floor(c / 2);
      if (c % 2) r *= p;
    }
  }
  r *= m;
  const res = [BigInt(k), BigInt(r)];
  if (sqCache.size > 5000) sqCache.clear();
  sqCache.set(key, res);
  return res;
}

// ---------- Exact forms ----------
export class Ex {
  // terms: [[c, r], ...] ; d > 0 ; pi: boolean (value = (c/d) * pi, single r=1 term)
  constructor(terms, d, pi = false) {
    this.t = terms;
    this.d = d;
    this.pi = pi;
  }
  static rat(n, d = 1n) { return normEx([[BigInt(n), 1n]], BigInt(d), false); }
  static piRat(n, d = 1n) { return normEx([[BigInt(n), 1n]], BigInt(d), true); }
  isZero() { return this.t.length === 0; }
  isRational() { return !this.pi && (this.t.length === 0 || (this.t.length === 1 && this.t[0][1] === 1n)); }
  num() { return this.t.length ? this.t[0][0] : 0n; } // only for rational / pi
  isInt() { return this.isRational() && this.d === 1n; }
  sign() {
    // sign of value
    if (this.t.length === 0) return 0;
    if (this.t.length === 1) return this.t[0][0] > 0n ? 1 : -1;
    const v = this.toDec(PREC + 5);
    return v.sign();
  }
  toDec(p = PREC) {
    if (this.t.length === 0) return D.ZERO;
    const w = p + 6;
    let s = D.ZERO;
    for (const [c, r] of this.t) {
      const cd = Dec.fromBigInt(c);
      s = s.add(r === 1n ? cd : cd.mul(D.sqrt(Dec.fromBigInt(r), w), w), w);
    }
    if (this.pi) s = s.mul(D.PI, w);
    return s.div(Dec.fromBigInt(this.d), p);
  }
  eq(o) {
    if (!o || this.pi !== o.pi || this.d !== o.d || this.t.length !== o.t.length) return false;
    for (let i = 0; i < this.t.length; i++) if (this.t[i][0] !== o.t[i][0] || this.t[i][1] !== o.t[i][1]) return false;
    return true;
  }
}

export function normEx(terms, d, pi) {
  if (d === 0n) throw new CalcError('Math');
  if (d < 0n) { d = -d; terms = terms.map(([c, r]) => [-c, r]); }
  const map = new Map();
  for (const [c, r] of terms) {
    if (c === 0n) continue;
    map.set(r, (map.get(r) || 0n) + c);
  }
  let t = [];
  for (const [r, c] of map) if (c !== 0n) t.push([c, r]);
  if (t.length === 0) return new Ex([], 1n, false);
  // ordering: rational term first, then descending radicand
  t.sort((a, b) => (a[1] === 1n ? -1 : b[1] === 1n ? 1 : a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));
  let g = d;
  for (const [c] of t) g = gcd(g, c);
  if (g > 1n) { t = t.map(([c, r]) => [c / g, r]); d /= g; }
  if (t.length > 2) return null;
  if (d > LIMIT) return null;
  for (const [c, r] of t) if (babs(c) > LIMIT || r > RAD_LIMIT) return null;
  if (pi && !(t.length === 1 && t[0][1] === 1n)) return null;
  return new Ex(t, d, pi);
}

export function exNeg(a) { return new Ex(a.t.map(([c, r]) => [-c, r]), a.d, a.pi); }

export function exAdd(a, b) {
  if (!a || !b) return null;
  if (a.isZero()) return b;
  if (b.isZero()) return a;
  if (a.pi !== b.pi) return null;
  const terms = [...a.t.map(([c, r]) => [c * b.d, r]), ...b.t.map(([c, r]) => [c * a.d, r])];
  return normEx(terms, a.d * b.d, a.pi);
}

function mulSurd(r1, r2) {
  if (r1 === 1n) return [1n, r2];
  if (r2 === 1n) return [1n, r1];
  const g = gcd(r1, r2);
  // sqrt(r1 r2) = g * sqrt(r1/g * r2/g) when both squarefree
  const rest = (r1 / g) * (r2 / g);
  const sf = squareFree(rest);
  if (!sf) return null;
  return [g * sf[0], sf[1]];
}

export function exMul(a, b) {
  if (!a || !b) return null;
  if (a.isZero() || b.isZero()) return new Ex([], 1n, false);
  if (a.pi && b.pi) return null;
  if ((a.pi && !b.isRational()) || (b.pi && !a.isRational())) return null;
  const terms = [];
  for (const [c1, r1] of a.t) {
    for (const [c2, r2] of b.t) {
      const m = mulSurd(r1, r2);
      if (!m) return null;
      terms.push([c1 * c2 * m[0], m[1]]);
    }
  }
  return normEx(terms, a.d * b.d, a.pi || b.pi);
}

export function exInv(a) {
  if (!a || a.isZero()) return null;
  if (a.pi) return null;
  if (a.t.length === 1) {
    const [c, r] = a.t[0];
    // d/(c sqrt r) = d sqrt r / (c r)
    return normEx([[a.d, r]], c * r, false);
  }
  const [[c1, r1], [c2, r2]] = a.t;
  // d / (c1 sqrt r1 + c2 sqrt r2) = d (c1 sqrt r1 - c2 sqrt r2) / (c1^2 r1 - c2^2 r2)
  const den = c1 * c1 * r1 - c2 * c2 * r2;
  if (den === 0n) return null;
  return normEx([[a.d * c1, r1], [-a.d * c2, r2]], den, false);
}

export function exDiv(a, b) {
  if (!a || !b) return null;
  if (b.isZero()) throw new CalcError('Math');
  if (a.isZero()) return a;
  if (a.pi && b.pi) {
    return normEx([[a.t[0][0] * b.d, 1n]], a.d * b.t[0][0], false);
  }
  if (b.pi) return null;
  if (a.pi) {
    if (!b.isRational()) return null;
    return normEx([[a.t[0][0] * b.d, 1n]], a.d * b.t[0][0], true);
  }
  return exMul(a, exInv(b));
}

export function exSqrt(a) {
  if (!a) return null;
  if (a.isZero()) return a;
  if (!a.isRational()) return null;
  const n = a.t[0][0];
  if (n < 0n) return null;
  const pq = n * a.d;
  const sf = squareFree(pq);
  if (!sf) return null;
  return normEx([[sf[0], sf[1]]], a.d, false);
}

export function exPowInt(a, n) {
  // n: BigInt
  if (!a) return null;
  if (n === 0n) return Ex.rat(1n);
  if (a.isZero()) return n > 0n ? a : null;
  let neg = n < 0n;
  if (neg) n = -n;
  if (n > 400n) return null;
  if (a.isRational() || a.pi) {
    if (a.pi && n > 1n) return null;
    const c = a.t[0][0] ** n, d = a.d ** n;
    if (babs(c) > LIMIT * LIMIT || d > LIMIT * LIMIT) return null;
    let r = normEx([[c, 1n]], d, a.pi);
    if (neg) r = r && (r.pi ? null : exInv(r));
    return r;
  }
  let res = Ex.rat(1n), base = a;
  while (n > 0n && res) {
    if (n & 1n) res = exMul(res, base);
    n >>= 1n;
    if (n > 0n) base = exMul(base, base);
    if (!base) return null;
  }
  if (neg) res = exInv(res);
  return res;
}

// integer k-th root of rational (exact) if perfect power
export function exRootInt(a, k) {
  if (!a || !a.isRational()) return null;
  const n = a.t.length ? a.t[0][0] : 0n;
  if (n === 0n) return a;
  const neg = n < 0n;
  if (neg && k % 2 === 0) return null;
  const an = babs(n);
  const rn = D.nthRootInt(an, k), rd = D.nthRootInt(a.d, k);
  const kb = BigInt(k);
  if (rn ** kb !== an || rd ** kb !== a.d) {
    if (k === 2) return exSqrt(a);
    return null;
  }
  return normEx([[neg ? -rn : rn, 1n]], rd, false);
}

// ---------- Real ----------
export class Real {
  constructor(dec, ex = null) {
    this.d = dec; // Dec
    this.x = ex; // Ex | null
    this.dms = false;
    this.ld = false; // derived from a decimal-point literal (Line output shows decimals)
  }
  static fromEx(ex) {
    if (!ex) throw new Error('null ex');
    return new Real(ex.toDec(PREC), ex);
  }
  static int(n) { return Real.fromEx(Ex.rat(BigInt(n))); }
  static rat(n, d) { return Real.fromEx(Ex.rat(BigInt(n), BigInt(d))); }
  static dec(dec) { return new Real(dec.round(PREC), null); }
  static parse(str) {
    // literal like "12.5e-3" -> exact rational when possible
    const dd = Dec.fromString(str, Infinity);
    const r = Real.fromDecExact(dd);
    if (str.includes('.')) { const c = new Real(r.d, r.x); c.ld = true; return c; }
    return r;
  }
  static fromDecExact(dd) {
    // exact rational from a finite decimal
    if (dd.isZero()) return ZERO_R;
    if (D.digitsOf(dd.m) > PREC) dd = dd.round(PREC);
    if (dd.e >= 0) {
      if (dd.e > 40) return new Real(dd, null);
      return Real.fromEx(Ex.rat(dd.m * D.p10(dd.e)));
    }
    if (-dd.e > 40) return new Real(dd, null);
    return Real.fromEx(Ex.rat(dd.m, D.p10(-dd.e)));
  }
  isZero() { return this.d.isZero(); }
  sign() { return this.d.sign(); }
  isExact() { return !!this.x; }
  isRational() { return !!this.x && this.x.isRational(); }
  isInt() {
    if (this.x) return this.x.isInt();
    return this.d.isInt();
  }
  // integer value as BigInt (assumes isInt)
  toBigInt() {
    if (this.x && this.x.isInt()) return this.x.num();
    return this.d.toBigInt();
  }
  toNumber() { return this.d.toNumber(); }
  withDms(flag) { const r = new Real(this.d, this.x); r.dms = flag; return r; }
  ratParts() { return this.isRational() ? [this.x.num(), this.x.d] : null; }
}

export const ZERO_R = new Real(D.ZERO, new Ex([], 1n, false));
export const ONE_R = Real.int(1);

export function checkRange(r) {
  // Manual: calculation range +-1e-99 .. +-9.999999999e99
  const d = r.d;
  if (d.isZero()) return r;
  const m = d.mag();
  if (m >= 100) throw new CalcError('Math');
  if (m < -99) {
    // underflow -> 0
    return ZERO_R;
  }
  return r;
}

function mk(dec, ex) {
  if (ex) {
    const r = new Real(ex.toDec(PREC), ex);
    return r;
  }
  return new Real(dec.round(PREC), null);
}

function ldf(r, a, b) {
  if ((a && a.ld) || (b && b.ld)) { if (r === ZERO_R || r === ONE_R) r = new Real(r.d, r.x); r.ld = true; }
  return r;
}
export function add(a, b) {
  const ex = a.x && b.x ? exAdd(a.x, b.x) : null;
  return ldf(checkRange(mk(ex ? null : a.d.add(b.d), ex)), a, b);
}
export function sub(a, b) { return add(a, neg(b)); }
export function neg(a) {
  const r = new Real(a.d.neg(), a.x ? exNeg(a.x) : null);
  r.dms = a.dms;
  r.ld = a.ld;
  return r;
}
export function mul(a, b) {
  const ex = a.x && b.x ? exMul(a.x, b.x) : null;
  return ldf(checkRange(mk(ex ? null : a.d.mul(b.d), ex)), a, b);
}
export function div(a, b) {
  if (b.isZero()) throw new CalcError('Math');
  const ex = a.x && b.x ? exDiv(a.x, b.x) : null;
  return ldf(checkRange(mk(ex ? null : a.d.div(b.d), ex)), a, b);
}
export function cmp(a, b) {
  if (a.x && b.x && a.x.isRational() && b.x.isRational()) {
    const l = a.x.num() * b.x.d, r = b.x.num() * a.x.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  return a.d.cmp(b.d);
}
export function abs(a) { return a.sign() < 0 ? neg(a) : a; }

export function fromDec(dec) { return checkRange(new Real(dec.round(PREC), null)); }

export function sqrtR(a) {
  if (a.sign() < 0) throw new CalcError('Math');
  const ex = a.x ? exSqrt(a.x) : null;
  if (ex) return mk(null, ex);
  return new Real(D.sqrt(a.d), null);
}

export function powInt(a, n) {
  // n: BigInt
  if (a.isZero()) {
    if (n <= 0n) throw new CalcError('Math');
    return ZERO_R;
  }
  const ex = a.x ? exPowInt(a.x, n) : null;
  if (ex) return ldf(checkRange(mk(null, ex)), a);
  const est = Number(n) * Math.log10(Math.abs(a.d.toNumber()));
  if (est > 110) throw new CalcError('Math');
  if (est < -120) return ZERO_R;
  return checkRange(new Real(D.powInt(a.d, n), null));
}

// rational exactness check helper
export function asRational(a) {
  if (a.x && a.x.isRational()) return [a.x.num(), a.x.d];
  return null;
}
