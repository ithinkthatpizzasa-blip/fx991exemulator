// Scientific functions on Real values, keeping exact forms where the real
// calculator does (special trig angles, perfect powers, logs of powers of 10...).
import * as D from './decimal.js';
import { Dec, PREC } from './decimal.js';
import * as R from './real.js';
import { Real, Ex, normEx, exNeg, ZERO_R, ONE_R, checkRange } from './real.js';
import { CalcError } from './errors.js';

const B = BigInt;
const mkEx = (terms, d) => normEx(terms.map(([c, r]) => [B(c), B(r)]), B(d), false);
const ZERO_EX = new Ex([], 1n, false);

// exact sin of degrees 0..90
const SIN_TAB = new Map([
  [0, ZERO_EX],
  [15, mkEx([[1, 6], [-1, 2]], 4)],
  [18, mkEx([[-1, 1], [1, 5]], 4)],
  [30, mkEx([[1, 1]], 2)],
  [45, mkEx([[1, 2]], 2)],
  [54, mkEx([[1, 1], [1, 5]], 4)],
  [60, mkEx([[1, 3]], 2)],
  [75, mkEx([[1, 6], [1, 2]], 4)],
  [90, mkEx([[1, 1]], 1)],
]);
const TAN_TAB = new Map([
  [0, ZERO_EX],
  [15, mkEx([[2, 1], [-1, 3]], 1)],
  [30, mkEx([[1, 3]], 3)],
  [45, mkEx([[1, 1]], 1)],
  [60, mkEx([[1, 3]], 1)],
  [75, mkEx([[2, 1], [1, 3]], 1)],
]);

function sinExactDeg(a) {
  // a: BigInt degrees
  let x = Number(((a % 360n) + 360n) % 360n);
  let neg = false;
  if (x > 180) { x -= 180; neg = true; }
  if (x > 90) x = 180 - x;
  const e = SIN_TAB.get(x);
  if (!e) return undefined;
  return neg ? exNeg(e) : e;
}

// rational degrees of an exact angle, or null
function exactDegrees(x, unit) {
  if (!x.x) return null;
  if (x.isZero()) return [0n, 1n];
  if (unit === 'D') return x.isRational() ? [x.x.num(), x.x.d] : null;
  if (unit === 'R') return x.x.pi ? [x.x.num() * 180n, x.x.d] : null;
  if (unit === 'G') return x.isRational() ? [x.x.num() * 9n, x.x.d * 10n] : null;
  return null;
}

function intDegrees(x, unit) {
  const r = exactDegrees(x, unit);
  if (!r) return null;
  const [n, d] = r;
  if (n % d !== 0n) return null;
  return n / d;
}

const N360 = Dec.fromInt(360), N400 = Dec.fromInt(400), N180 = Dec.fromInt(180), N200 = Dec.fromInt(200);
const DEG_LIMIT = Dec.fromString('9e9');
const RAD_LIMIT = Dec.fromString('157079632.7');
const GRA_LIMIT = Dec.fromString('1e10');

function decMod(x, m) {
  const q = x.div(m, 40).floor();
  return x.sub(q.mul(m, Infinity), Infinity);
}

// angle (Real in unit) -> radians Dec, with manual's input range checks
export function toRadians(x, unit, check = true) {
  const a = x.d;
  const W = PREC + 12;
  if (unit === 'D') {
    if (check && a.abs().ge(DEG_LIMIT)) throw new CalcError('Math');
    if (x.x && x.isRational()) {
      // exact reduction for rationals
    }
    return decMod(a, N360).mul(D.PI, W).div(N180, W);
  }
  if (unit === 'G') {
    if (check && a.abs().ge(GRA_LIMIT)) throw new CalcError('Math');
    return decMod(a, N400).mul(D.PI, W).div(N200, W);
  }
  if (check && a.abs().ge(RAD_LIMIT)) throw new CalcError('Math');
  if (x.x && x.x.pi) return x.x.toDec(W);
  return a;
}

export function fromRadians(rad, unit) {
  const W = PREC + 6;
  if (unit === 'D') return rad.mul(N180, W).div(D.PI, PREC);
  if (unit === 'G') return rad.mul(N200, W).div(D.PI, PREC);
  return rad.round(PREC);
}

export function degToUnitExact(n, d, unit) {
  // exact degrees n/d -> Real in unit
  if (unit === 'D') return Real.fromEx(normEx([[n, 1n]], d, false));
  if (unit === 'R') return Real.fromEx(normEx([[n, 1n]], d * 180n, true));
  return Real.fromEx(normEx([[n * 10n, 1n]], d * 9n, false));
}

export function sin(x, unit) {
  const a = intDegrees(x, unit);
  if (a !== null) {
    const e = sinExactDeg(a);
    if (e) return Real.fromEx(e);
  }
  return R.fromDec(D.sin(toRadians(x, unit)));
}
export function cos(x, unit) {
  const a = intDegrees(x, unit);
  if (a !== null) {
    const e = sinExactDeg(a + 90n);
    if (e) return Real.fromEx(e);
  }
  return R.fromDec(D.cos(toRadians(x, unit)));
}
export function tan(x, unit) {
  const a = intDegrees(x, unit);
  if (a !== null) {
    const m = Number(((a % 180n) + 180n) % 180n);
    if (m === 90) throw new CalcError('Math');
    const s = sinExactDeg(a), c = sinExactDeg(a + 90n);
    if (s && c) return R.div(Real.fromEx(s), Real.fromEx(c));
  }
  // range check (same as sin, except odd multiples of 90)
  const rad = toRadians(x, unit);
  try {
    const t = D.tan(rad);
    return R.fromDec(t);
  } catch (e) {
    throw new CalcError('Math');
  }
}

function matchTable(v, tab) {
  // v exact Real -> degrees (Number, signed) or null
  if (!v.x) return null;
  const neg = v.sign() < 0;
  const av = neg ? R.neg(v) : v;
  for (const [deg, e] of tab) if (e.eq(av.x)) return neg ? -deg : deg;
  return null;
}

export function asin(x, unit) {
  if (x.d.cmpAbs(D.ONE) > 0) throw new CalcError('Math');
  const m = matchTable(x, SIN_TAB);
  if (m !== null) return degToUnitExact(B(m), 1n, unit);
  return R.fromDec(fromRadians(D.asin(x.d, PREC + 4), unit));
}
export function acos(x, unit) {
  if (x.d.cmpAbs(D.ONE) > 0) throw new CalcError('Math');
  const m = matchTable(x, SIN_TAB);
  if (m !== null) return degToUnitExact(B(90 - m), 1n, unit);
  return R.fromDec(fromRadians(D.acos(x.d, PREC + 4), unit));
}
export function atan(x, unit) {
  const m = matchTable(x, TAN_TAB);
  if (m !== null) return degToUnitExact(B(m), 1n, unit);
  return R.fromDec(fromRadians(D.atan(x.d, PREC + 4), unit));
}

// angle of (x, y) in (-180, 180]
export function atan2(y, x, unit) {
  if (x.isZero() && y.isZero()) throw new CalcError('Math');
  if (x.isZero()) return degToUnitExact(y.sign() > 0 ? 90n : -90n, 1n, unit);
  if (x.x && y.x) {
    try {
      const q = R.div(y, x);
      const m = matchTable(q, TAN_TAB);
      if (m !== null) {
        let deg = m;
        if (x.sign() < 0) deg = y.sign() < 0 ? m - 180 : m + 180;
        if (y.isZero()) deg = x.sign() < 0 ? 180 : 0;
        return degToUnitExact(B(deg), 1n, unit);
      }
    } catch (e) { /* fall through */ }
  }
  return R.fromDec(fromRadians(D.atan2(y.d, x.d, PREC + 4), unit));
}

// ---------- hyperbolic ----------
const HYP_LIMIT = Dec.fromString('230.2585092');
export function sinh(x) {
  if (x.d.abs().gt(HYP_LIMIT)) throw new CalcError('Math');
  if (x.isZero()) return ZERO_R;
  return R.fromDec(D.sinh(x.d));
}
export function cosh(x) {
  if (x.d.abs().gt(HYP_LIMIT)) throw new CalcError('Math');
  if (x.isZero()) return ONE_R;
  return R.fromDec(D.cosh(x.d));
}
export function tanh(x) { return x.isZero() ? ZERO_R : R.fromDec(D.tanh(x.d)); }
export function asinh(x) {
  if (x.d.abs().gt(Dec.fromString('4.999999999e99'))) throw new CalcError('Math');
  return x.isZero() ? ZERO_R : R.fromDec(D.asinh(x.d));
}
export function acosh(x) {
  if (x.d.lt(D.ONE)) throw new CalcError('Math');
  if (x.d.eq(D.ONE)) return ZERO_R;
  return R.fromDec(D.acosh(x.d));
}
export function atanh(x) {
  if (x.d.cmpAbs(D.ONE) >= 0) throw new CalcError('Math');
  return x.isZero() ? ZERO_R : R.fromDec(D.atanh(x.d));
}

// ---------- logarithms / exponentials ----------
function powerOf10(x) {
  // exact rational 10^k -> k
  if (!x.isRational() || x.sign() <= 0) return null;
  const n = x.x.num(), d = x.x.d;
  const isP = (v) => /^10*$/.test(v.toString());
  if (d === 1n && isP(n)) return n.toString().length - 1;
  if (n === 1n && isP(d)) return -(d.toString().length - 1);
  return null;
}
export function log10(x) {
  if (x.sign() <= 0) throw new CalcError('Math');
  const k = powerOf10(x);
  if (k !== null) return Real.int(k);
  return R.fromDec(D.log10(x.d));
}
export function ln(x) {
  if (x.sign() <= 0) throw new CalcError('Math');
  if (x.isRational() && x.x.isInt() && x.x.num() === 1n) return ZERO_R;
  return R.fromDec(D.ln(x.d));
}
export function logab(a, b) {
  if (a.sign() <= 0 || b.sign() <= 0) throw new CalcError('Math');
  if (a.d.eq(D.ONE)) throw new CalcError('Math');
  const r = D.ln(b.d, PREC + 6).div(D.ln(a.d, PREC + 6), PREC);
  // exact integer results like log_2(16)=4
  const ri = r.roundDP(0);
  if (r.sub(ri, Infinity).abs().lt(Dec.fromString('1e-12')) && a.isRational() && b.isRational()) {
    try {
      const p = R.powInt(a, ri.toBigInt());
      if (p.x && b.x && p.x.eq(b.x)) return Real.int(ri.toBigInt());
    } catch (e) { /* ignore */ }
  }
  return R.fromDec(r);
}
const P10_MAX = Dec.fromString('99.99999999');
export function pow10(x) {
  if (x.d.gt(P10_MAX) && !(x.isInt() && x.d.lt(Dec.fromInt(100)))) throw new CalcError('Math');
  if (x.isInt() && x.x) {
    const k = x.toBigInt();
    if (k >= 100n) throw new CalcError('Math');
    if (k < -99n) return ZERO_R;
    return k >= 0n ? Real.fromEx(Ex.rat(10n ** k)) : Real.fromEx(Ex.rat(1n, 10n ** -k));
  }
  return checkRange(R.fromDec(D.powReal(Dec.fromInt(10), x.d)));
}
export function expE(x) {
  if (x.isZero()) return ONE_R;
  if (x.d.gt(HYP_LIMIT)) throw new CalcError('Math');
  return checkRange(R.fromDec(D.exp(x.d)));
}

// ---------- powers & roots ----------
export function sqrt(x) {
  if (x.sign() < 0) throw new CalcError('Math');
  return R.sqrtR(x);
}
export function sq(x) {
  if (x.d.abs().mag() >= 50) throw new CalcError('Math');
  return R.mul(x, x);
}
export function cube(x) { return R.powInt(x, 3n); }
export function inv(x) {
  if (x.isZero()) throw new CalcError('Math');
  return R.div(ONE_R, x);
}

// x^y
export function pow(x, y) {
  if (y.isInt() && (y.x || y.d.abs().lt(Dec.fromInt(1000000)))) {
    const n = y.toBigInt();
    if (x.isZero()) {
      if (n <= 0n) throw new CalcError('Math');
      return ZERO_R;
    }
    return R.powInt(x, n);
  }
  if (x.isZero()) {
    if (y.sign() > 0) return ZERO_R;
    throw new CalcError('Math');
  }
  // rational exponent p/q
  const yr = R.asRational(y);
  if (x.sign() < 0) {
    if (y.isInt()) {
      const r = pow(R.neg(x), y);
      return y.d.toBigInt() % 2n === 0n ? r : R.neg(r);
    }
    if (!yr || yr[1] % 2n === 0n) throw new CalcError('Math');
    const ax = R.neg(x);
    const r = pow(ax, y);
    return yr[0] % 2n === 0n ? r : R.neg(r);
  }
  if (yr && yr[1] <= 64n && x.isRational() && R.babs(yr[0]) <= 64n) {
    const [p, q] = yr;
    try {
      const xp = R.powInt(x, p);
      const ex = R.babs(p) <= 64n ? rootExact(xp, Number(q)) : null;
      if (ex) return ex;
    } catch (e) { if (e instanceof CalcError) throw e; }
  }
  const lg = y.d.mul(D.log10(x.d, PREC + 4), PREC + 4);
  if (lg.ge(Dec.fromInt(100))) throw new CalcError('Math');
  if (lg.lt(Dec.fromInt(-100))) return ZERO_R;
  return checkRange(R.fromDec(D.powReal(x.d, y.d)));
}

function rootExact(x, q) {
  if (!x.x || !x.isRational()) return null;
  const ex = R.exRootInt(x.x, q);
  return ex ? Real.fromEx(ex) : null;
}

// n-th root of x  (x^(1/n))
export function root(n, x) {
  if (n.isZero()) throw new CalcError('Math');
  if (n.isInt() && n.x) {
    const k = n.toBigInt();
    if (k > 0n && k <= 64n) {
      const ex = rootExact(x, Number(k));
      if (ex) return ex;
      if (x.sign() < 0) {
        if (k % 2n === 0n) throw new CalcError('Math');
        return R.neg(root(n, R.neg(x)));
      }
    }
  }
  return pow(x, inv(n));
}

// ---------- combinatorics ----------
export function fact(x) {
  if (!x.isInt() || x.sign() < 0) throw new CalcError('Math');
  const n = x.toBigInt();
  if (n > 69n) throw new CalcError('Math');
  let r = 1n;
  for (let i = 2n; i <= n; i++) r *= i;
  return Real.fromEx(Ex.rat(r));
}
const LIM100 = 10n ** 100n;
function intArgs(n, r) {
  if (!n.isInt() || !r.isInt()) throw new CalcError('Math');
  const N = n.toBigInt(), K = r.toBigInt();
  if (N < 0n || K < 0n || K > N || N >= 10000000000n) throw new CalcError('Math');
  return [N, K];
}
export function nPr(n, r) {
  const [N, K] = intArgs(n, r);
  let res = 1n;
  for (let i = 0n; i < K; i++) {
    res *= N - i;
    if (res >= LIM100) throw new CalcError('Math');
  }
  return Real.fromEx(Ex.rat(res));
}
export function nCr(n, r) {
  let [N, K] = intArgs(n, r);
  if (K > N - K) K = N - K;
  let res = 1n;
  for (let i = 1n; i <= K; i++) {
    res = (res * (N - K + i)) / i;
    if (res >= LIM100) throw new CalcError('Math');
  }
  return Real.fromEx(Ex.rat(res));
}

// ---------- misc ----------
export function abs(x) { return R.abs(x); }
export function percent(x) { return R.div(x, Real.int(100)); }

export function engScale(x, e) {
  const f = e >= 0 ? Real.fromEx(Ex.rat(10n ** B(e))) : Real.fromEx(Ex.rat(1n, 10n ** B(-e)));
  return R.mul(x, f);
}

// round per number format (Rnd)
export function rnd(x, fmt) {
  if (x.isZero()) return x;
  let d = x.d;
  if (fmt.type === 'Fix') d = d.roundDP(fmt.n);
  else if (fmt.type === 'Sci') d = d.round(fmt.n === 0 ? 10 : fmt.n);
  else d = d.round(10);
  return Real.fromDecExact(d);
}

// angle conversion postfix (°, r, g): value given in 'from' unit -> current unit
export function angleConv(x, from, to) {
  if (from === to) return x;
  const deg = exactDegrees(x, from);
  if (deg) return degToUnitExact(deg[0], deg[1], to);
  let rad;
  const W = PREC + 6;
  if (from === 'D') rad = x.d.mul(D.PI, W).div(N180, W);
  else if (from === 'G') rad = x.d.mul(D.PI, W).div(N200, W);
  else rad = x.d;
  return R.fromDec(fromRadians(rad, to));
}

// Pol(x,y) -> [r, theta]
export function pol(x, y, unit) {
  const r = R.sqrtR(R.add(R.mul(x, x), R.mul(y, y)));
  const th = atan2(y, x, unit);
  return [r, th];
}
export function rec(r, th, unit) {
  return [R.mul(r, cos(th, unit)), R.mul(r, sin(th, unit))];
}

// sexagesimal value
export function dmsValue(d, m, s) {
  let v = d;
  if (m) v = R.add(v, R.div(m, Real.int(60)));
  if (s) v = R.add(v, R.div(s, Real.int(3600)));
  return v.withDms(true);
}

// random
let seed = (Date.now() ^ 0x5deece66d) >>> 0;
export function setSeed(s) { seed = s >>> 0; }
function rand() {
  // xorshift32
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
export function ranHash() {
  const k = Math.floor(rand() * 1000);
  return Real.fromEx(Ex.rat(B(k), 1000n));
}
export function ranInt(a, b) {
  if (!a.isInt() || !b.isInt()) throw new CalcError('Math');
  const A = a.toBigInt(), Bb = b.toBigInt();
  if (A >= Bb) throw new CalcError('Math');
  const lim = 10000000000n;
  if (A <= -lim || A >= lim || Bb <= -lim || Bb >= lim || Bb - A >= lim) throw new CalcError('Math');
  const span = Number(Bb - A + 1n);
  return Real.int(A + B(Math.floor(rand() * span)));
}
