// Arbitrary-precision decimal floating point built on BigInt.
// value = m * 10^e  (m: BigInt, e: integer Number). Immutable.
// Results are rounded (half away from zero) to a number of significant
// digits; the calculator stores 15 (manual: "Number of Digits for Internal
// Calculation: 15 digits").

export const PREC = 15;

const P10 = [1n];
export function p10(n) {
  while (P10.length <= n) P10.push(P10[P10.length - 1] * 10n);
  return P10[n];
}

export function digitsOf(m) {
  if (m < 0n) m = -m;
  if (m < 10n) return 1;
  return m.toString().length;
}

function absBig(m) {
  return m < 0n ? -m : m;
}

export class Dec {
  constructor(m, e) {
    this.m = m;
    this.e = e;
  }

  static make(m, e, p = PREC) {
    if (m === 0n) return ZERO;
    const neg = m < 0n;
    if (neg) m = -m;
    if (p !== Infinity) {
      const d = digitsOf(m);
      if (d > p) {
        const k = d - p;
        const div = p10(k);
        let q = m / div;
        const r = m - q * div;
        if (r * 2n >= div) q += 1n;
        m = q;
        e += k;
      }
    }
    if (m % 10n === 0n) {
      // strip trailing zeros in chunks
      while (m % 100000000n === 0n) { m /= 100000000n; e += 8; }
      while (m % 10n === 0n) { m /= 10n; e += 1; }
    }
    return new Dec(neg ? -m : m, e);
  }

  static fromBigInt(n) { return Dec.make(BigInt(n), 0, Infinity); }
  static fromInt(n) { return Dec.make(BigInt(n), 0, Infinity); }

  static fromString(s, p = Infinity) {
    s = String(s).trim();
    let neg = false;
    if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    let exp = 0;
    const ei = s.search(/[eE]/);
    if (ei >= 0) { exp = parseInt(s.slice(ei + 1), 10); s = s.slice(0, ei); }
    const dot = s.indexOf('.');
    if (dot >= 0) { exp -= s.length - dot - 1; s = s.slice(0, dot) + s.slice(dot + 1); }
    if (s === '') s = '0';
    let m = BigInt(s);
    if (neg) m = -m;
    return Dec.make(m, exp, p);
  }

  static fromNumber(x, p = 17) {
    if (!isFinite(x)) throw new Error('non-finite');
    if (x === 0) return ZERO;
    return Dec.fromString(x.toExponential(p - 1), PREC + 2);
  }

  isZero() { return this.m === 0n; }
  sign() { return this.m > 0n ? 1 : this.m < 0n ? -1 : 0; }
  isNeg() { return this.m < 0n; }
  neg() { return this.m === 0n ? this : new Dec(-this.m, this.e); }
  abs() { return this.m < 0n ? new Dec(-this.m, this.e) : this; }
  // floor(log10(|x|)) for non-zero x
  mag() { return digitsOf(this.m) - 1 + this.e; }
  isInt() { return this.m === 0n || this.e >= 0; }

  round(p = PREC) { return Dec.make(this.m, this.e, p); }

  add(b, p = PREC) {
    const a = this;
    if (a.m === 0n) return b.round(p);
    if (b.m === 0n) return a.round(p);
    if (p !== Infinity) {
      const ma = a.mag(), mb = b.mag();
      if (ma - mb > p + 3) return a.round(p);
      if (mb - ma > p + 3) return b.round(p);
    }
    if (a.e === b.e) return Dec.make(a.m + b.m, a.e, p);
    if (a.e > b.e) return Dec.make(a.m * p10(a.e - b.e) + b.m, b.e, p);
    return Dec.make(a.m + b.m * p10(b.e - a.e), a.e, p);
  }
  sub(b, p = PREC) { return this.add(b.neg(), p); }
  mul(b, p = PREC) {
    if (this.m === 0n || b.m === 0n) return ZERO;
    return Dec.make(this.m * b.m, this.e + b.e, p);
  }
  div(b, p = PREC) {
    if (b.m === 0n) throw new RangeError('div0');
    if (this.m === 0n) return ZERO;
    const pp = p === Infinity ? 40 : p;
    const neg = (this.m < 0n) !== (b.m < 0n);
    const am = absBig(this.m), bm = absBig(b.m);
    let k = pp + 3 - digitsOf(am) + digitsOf(bm);
    if (k < 0) k = 0;
    const num = am * p10(k);
    let q = num / bm;
    const r = num - q * bm;
    q = q * 10n + (r === 0n ? 0n : 1n); // sticky digit
    return Dec.make(neg ? -q : q, this.e - b.e - k - 1, pp);
  }
  mulInt(n, p = PREC) { return this.mul(Dec.fromInt(n), p); }
  divInt(n, p = PREC) { return this.div(Dec.fromInt(n), p); }

  cmp(b) {
    const s1 = this.sign(), s2 = b.sign();
    if (s1 !== s2) return s1 < s2 ? -1 : 1;
    if (s1 === 0) return 0;
    const d = this.sub(b, Infinity);
    return d.sign();
  }
  eq(b) { return this.cmp(b) === 0; }
  lt(b) { return this.cmp(b) < 0; }
  gt(b) { return this.cmp(b) > 0; }
  le(b) { return this.cmp(b) <= 0; }
  ge(b) { return this.cmp(b) >= 0; }
  cmpAbs(b) { return this.abs().cmp(b.abs()); }

  // truncate toward zero -> BigInt
  toBigInt() {
    if (this.e >= 0) return this.m * p10(this.e);
    if (-this.e > digitsOf(this.m) + 1) return 0n;
    return this.m / p10(-this.e);
  }
  trunc() { return Dec.make(this.toBigInt(), 0, Infinity); }
  floor() {
    const t = this.toBigInt();
    const tr = Dec.make(t, 0, Infinity);
    if (this.isNeg() && !tr.eq(this)) return Dec.make(t - 1n, 0, Infinity);
    return tr;
  }
  frac() { return this.sub(this.trunc(), Infinity); }
  // round to n decimal places (half away from zero)
  roundDP(n) {
    if (this.m === 0n) return ZERO;
    if (this.e >= -n) return this;
    const k = -n - this.e; // digits to drop
    const div = p10(k);
    const neg = this.m < 0n;
    let m = absBig(this.m);
    let q = m / div;
    if ((m - q * div) * 2n >= div) q += 1n;
    return Dec.make(neg ? -q : q, -n, Infinity);
  }

  toNumber() { return Number(this.toString()); }

  toString() {
    if (this.m === 0n) return '0';
    const neg = this.m < 0n;
    const s = absBig(this.m).toString();
    let out;
    if (this.e >= 0) out = s + '0'.repeat(Math.min(this.e, 400));
    else {
      const k = -this.e;
      out = k >= s.length ? '0.' + '0'.repeat(k - s.length) + s : s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    }
    return (neg ? '-' : '') + out;
  }
  // mantissa digits string and exponent (scientific), rounded to p digits
  sci(p) {
    const r = this.round(p);
    const s = absBig(r.m).toString();
    return { neg: r.m < 0n, digits: s, exp: r.e + s.length - 1 };
  }
}

export const ZERO = new Dec(0n, 0);
export const ONE = new Dec(1n, 0);
export const TWO = new Dec(2n, 0);
export const HALF = new Dec(5n, -1);
export const TEN_D = new Dec(1n, 1);

const PI_S = '3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803';
const LN10_S = '2.30258509299404568401799145468436420760110148862877297603332790096757260967735248023599';
const LN2_S = '0.69314718055994530941723212145817656807550013436025525412068000949339362196969471560586';
export const PI = Dec.fromString(PI_S);
export const LN10 = Dec.fromString(LN10_S);
export const LN2 = Dec.fromString(LN2_S);
export const E = Dec.fromString('2.71828182845904523536028747135266249775724709369995957496696762772407663035354759457138');
const SQRTPI = Dec.fromString('1.77245385090551602729816748334114518279754945612238712821380778985291128459103218137495');

const G = 14; // guard digits for transcendental functions

// ---------- roots ----------
function isqrt(n) {
  if (n < 0n) throw new RangeError('isqrt');
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  if (x === 0n) x = 1n;
  // Newton
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x - 1n && y <= x + 1n) {
      let r = y;
      while (r * r > n) r -= 1n;
      while ((r + 1n) * (r + 1n) <= n) r += 1n;
      return r;
    }
    x = y;
  }
}
export { isqrt };

export function sqrt(x, p = PREC) {
  if (x.m === 0n) return ZERO;
  if (x.m < 0n) throw new RangeError('sqrt neg');
  const w = p + 4;
  let m = x.m, e = x.e;
  // want m with ~2w digits and e even
  let k = 2 * w - digitsOf(m);
  if (k < 0) k = 0;
  if ((e - k) % 2 !== 0) k += 1;
  m = m * p10(k);
  e -= k;
  const r = isqrt(m);
  const exact = r * r === m;
  // sticky bit for correct rounding
  const rr = exact ? r * 10n : r * 10n + 1n;
  return Dec.make(rr, e / 2 - 1, p);
}

export function nthRootInt(n, k) {
  // integer k-th root (floor) of non-negative BigInt n
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.pow(Number(n), 1 / k)));
  if (x < 1n) x = 1n;
  const kb = BigInt(k);
  for (let i = 0; i < 200; i++) {
    const xk1 = x ** (kb - 1n);
    const y = ((kb - 1n) * x + n / xk1) / kb;
    if (y === x) break;
    if (y > x && i > 2) { break; }
    x = y;
  }
  while (x ** kb > n) x -= 1n;
  while ((x + 1n) ** kb <= n) x += 1n;
  return x;
}

// ---------- exp / ln ----------
export function exp(x, p = PREC) {
  if (x.m === 0n) return ONE;
  const w = p + G;
  if (x.mag() < -w) return ONE.add(x, p);
  // x = n*ln10 + r
  const ni = BigInt(Math.round(x.div(LN10, 20).toNumber()));
  let r = x.sub(LN10.mul(Dec.fromBigInt(ni), w + 6), w + 4);
  // reduce by 2^10
  const K = 10;
  r = r.div(Dec.fromInt(1 << K), w + 4);
  // Taylor
  let sum = ONE, term = ONE;
  for (let k = 1; k < 200; k++) {
    term = term.mul(r, w + 4).divInt(k, w + 4);
    sum = sum.add(term, w + 4);
    if (term.m === 0n || term.mag() < sum.mag() - w - 4) break;
  }
  for (let i = 0; i < K; i++) sum = sum.mul(sum, w + 4);
  return Dec.make(sum.m, sum.e + Number(ni), p);
}

export function ln(x, p = PREC) {
  if (x.m <= 0n) throw new RangeError('ln domain');
  const w = p + G;
  const d = digitsOf(x.m);
  const E10 = x.e + d - 1;
  let y = new Dec(x.m, -(d - 1)); // in [1,10)
  // reduce y into [0.75,1.5] by powers of two
  let k = 0;
  const lim = Dec.fromString('1.5');
  while (y.gt(lim)) { y = y.div(TWO, w + 6); k++; }
  const z = y.sub(ONE, w + 6).div(y.add(ONE, w + 6), w + 6);
  const z2 = z.mul(z, w + 6);
  let sum = z, term = z;
  for (let n = 3; n < 2000; n += 2) {
    term = term.mul(z2, w + 6);
    const t = term.divInt(n, w + 6);
    sum = sum.add(t, w + 6);
    if (t.m === 0n || t.mag() < sum.mag() - w - 4) break;
  }
  let res = sum.mul(TWO, w + 6);
  if (k) res = res.add(LN2.mul(Dec.fromInt(k), w + 6), w + 6);
  if (E10) res = res.add(LN10.mul(Dec.fromInt(E10), w + 8), w + 6);
  return res.round(p);
}

export function log10(x, p = PREC) {
  // exact for powers of ten
  if (x.m > 0n) {
    const s = x.m.toString();
    if (/^10*$/.test(s)) return Dec.fromInt(x.e + s.length - 1);
  }
  return ln(x, p + 4).div(LN10, p);
}

// x^y for x>0 general real y
export function powReal(x, y, p = PREC) {
  if (x.m <= 0n) throw new RangeError('pow domain');
  const lx = ln(x, p + G + 4);
  return exp(lx.mul(y, p + G + 4), p);
}

export function powInt(x, n, p = PREC) {
  // n: BigInt
  if (n === 0n) return ONE;
  let neg = n < 0n;
  if (neg) n = -n;
  const w = p + 10;
  let result = ONE, base = x;
  while (n > 0n) {
    if (n & 1n) result = result.mul(base, w);
    n >>= 1n;
    if (n > 0n) base = base.mul(base, w);
  }
  if (neg) return ONE.div(result, p);
  return result.round(p);
}

// ---------- trigonometric (radians) ----------
const PI2 = PI.mul(TWO, Infinity);
const PIH = PI.div(TWO, 80);
const PIQ = PI.div(Dec.fromInt(4), 80);

// returns [sin, cos] of t with |t| <= pi/4
function sinCosSmall(t, w) {
  const t2 = t.mul(t, w);
  let s = t, term = t;
  for (let k = 1; k < 100; k++) {
    term = term.mul(t2, w).divInt((2 * k) * (2 * k + 1), w).neg();
    s = s.add(term, w);
    if (term.m === 0n || term.mag() < -w - 2) break;
  }
  let c = ONE;
  term = ONE;
  for (let k = 1; k < 100; k++) {
    term = term.mul(t2, w).divInt((2 * k - 1) * (2 * k), w).neg();
    c = c.add(term, w);
    if (term.m === 0n || term.mag() < -w - 2) break;
  }
  return [s, c];
}

// reduce radians: returns [t, q] with x = t + q*pi/2, |t|<=pi/4
function reduce(x, w) {
  const qd = x.div(PIH, 30);
  const q = BigInt(Math.round(qd.toNumber()));
  // need extra digits for large x
  const extra = Math.max(0, x.mag()) + 4;
  const t = x.sub(PIH.mul(Dec.fromBigInt(q), w + extra + 4), w + 4);
  return [t, Number(((q % 4n) + 4n) % 4n)];
}

export function sinCos(x, p = PREC) {
  const w = p + G;
  if (x.m === 0n) return [ZERO, ONE];
  if (x.mag() < -w) return [x.round(p), ONE];
  const [t, q] = reduce(x, w);
  const [s, c] = sinCosSmall(t, w);
  let rs, rc;
  switch (q) {
    case 0: rs = s; rc = c; break;
    case 1: rs = c; rc = s.neg(); break;
    case 2: rs = s.neg(); rc = c.neg(); break;
    default: rs = c.neg(); rc = s; break;
  }
  return [rs.round(p), rc.round(p)];
}
export function sin(x, p = PREC) { return sinCos(x, p)[0]; }
export function cos(x, p = PREC) { return sinCos(x, p)[1]; }
export function tan(x, p = PREC) {
  const [s, c] = sinCos(x, p + 6);
  if (c.m === 0n || c.mag() < -(p + 6)) throw new RangeError('tan');
  return s.div(c, p);
}

export function atan(x, p = PREC) {
  const w = p + G;
  if (x.m === 0n) return ZERO;
  if (x.mag() < -w) return x.round(p);
  const neg = x.isNeg();
  let a = x.abs();
  let inv = false;
  if (a.gt(ONE)) { a = ONE.div(a, w + 4); inv = true; }
  // two halvings: a -> a/(1+sqrt(1+a^2))
  for (let i = 0; i < 2; i++) a = a.div(ONE.add(sqrt(ONE.add(a.mul(a, w + 4), w + 4), w + 4), w + 4), w + 4);
  const a2 = a.mul(a, w + 4);
  let sum = a, term = a;
  for (let n = 3; n < 2000; n += 2) {
    term = term.mul(a2, w + 4).neg();
    const t = term.divInt(n, w + 4);
    sum = sum.add(t, w + 4);
    if (t.m === 0n || t.mag() < sum.mag() - w - 4) break;
  }
  let r = sum.mul(Dec.fromInt(4), w + 4);
  if (inv) r = PIH.sub(r, w + 4);
  return (neg ? r.neg() : r).round(p);
}

export function asin(x, p = PREC) {
  const c = x.cmpAbs(ONE);
  if (c > 0) throw new RangeError('asin');
  if (c === 0) return x.isNeg() ? PIH.neg().round(p) : PIH.round(p);
  const w = p + G;
  const d = sqrt(ONE.sub(x.mul(x, Infinity), w), w);
  return atan(x.div(d, w), p);
}
export function acos(x, p = PREC) {
  return PIH.sub(asin(x, p + 6), p + 6).round(p);
}
export function atan2(y, x, p = PREC) {
  // angle in (-pi, pi]
  if (x.m === 0n) {
    if (y.m === 0n) throw new RangeError('atan2');
    return y.isNeg() ? PIH.neg().round(p) : PIH.round(p);
  }
  const a = atan(y.div(x, p + 6), p + 6);
  if (!x.isNeg()) return a.round(p);
  return (y.isNeg() ? a.sub(PI, p + 6) : a.add(PI, p + 6)).round(p);
}

// ---------- hyperbolic ----------
function extraFor(x) { return Math.max(0, -x.mag()); }
export function sinh(x, p = PREC) {
  if (x.m === 0n) return ZERO;
  const w = p + 6 + extraFor(x);
  const ex = exp(x, w);
  return ex.sub(ONE.div(ex, w), w).div(TWO, p);
}
export function cosh(x, p = PREC) {
  const w = p + 6;
  const ex = exp(x, w);
  return ex.add(ONE.div(ex, w), w).div(TWO, p);
}
export function tanh(x, p = PREC) {
  if (x.m === 0n) return ZERO;
  if (x.abs().gt(Dec.fromInt(40))) return x.isNeg() ? ONE.neg() : ONE;
  const w = p + 6 + extraFor(x);
  const e2 = exp(x.mul(TWO, w), w);
  return e2.sub(ONE, w).div(e2.add(ONE, w), p);
}
export function asinh(x, p = PREC) {
  if (x.m === 0n) return ZERO;
  const neg = x.isNeg();
  const a = x.abs();
  const w = p + 6 + extraFor(x);
  let r;
  if (a.mag() > 40) r = ln(a, w).add(LN2, w);
  else r = ln(a.add(sqrt(a.mul(a, Infinity).add(ONE, w + 4), w), w), w);
  return (neg ? r.neg() : r).round(p);
}
export function acosh(x, p = PREC) {
  if (x.lt(ONE)) throw new RangeError('acosh');
  const w = p + 8;
  if (x.mag() > 40) return ln(x, w).add(LN2, w).round(p);
  return ln(x.add(sqrt(x.mul(x, Infinity).sub(ONE, w + 4), w), w), p);
}
export function atanh(x, p = PREC) {
  if (x.cmpAbs(ONE) >= 0) throw new RangeError('atanh');
  if (x.m === 0n) return ZERO;
  const w = p + 6 + extraFor(x);
  return ln(ONE.add(x, w).div(ONE.sub(x, w), w), w).div(TWO, p);
}

// ---------- normal distribution helpers ----------
// erf for any x (series for |x|<3, continued fraction erfc otherwise)
export function erf(x, p = PREC) {
  if (x.m === 0n) return ZERO;
  const a = x.abs();
  if (a.lt(Dec.fromInt(3))) {
    const w = p + 20;
    const x2 = a.mul(a, w);
    let sum = a, term = a; // term_n = (-1)^n x^(2n+1)/n!
    for (let n = 1; n < 400; n++) {
      term = term.mul(x2, w).divInt(n, w).neg();
      const t = term.divInt(2 * n + 1, w);
      sum = sum.add(t, w);
      if (t.m === 0n || t.mag() < -w) break;
    }
    const r = sum.mul(TWO, w).div(SQRTPI, w);
    return (x.isNeg() ? r.neg() : r).round(p);
  }
  const r = ONE.sub(erfc(a, p + 4), p + 4);
  return (x.isNeg() ? r.neg() : r).round(p);
}
export function erfc(x, p = PREC) {
  if (x.lt(Dec.fromInt(3))) return ONE.sub(erf(x, p + 10), p);
  // Lentz continued fraction: erfc(x) = exp(-x^2)/sqrt(pi) * 1/(x+ 1/2/(x+ 1/(x+ 3/2/(x+ 2/(x+...)))))
  const w = p + 10;
  const tiny = Dec.fromString('1e-60');
  let f = x, C = x, D = ZERO;
  for (let n = 1; n < 2000; n++) {
    const an = Dec.fromInt(n).div(TWO, w);
    D = x.add(an.mul(D, w), w);
    if (D.m === 0n) D = tiny;
    C = x.add(an.div(C, w), w);
    if (C.m === 0n) C = tiny;
    D = ONE.div(D, w);
    const delta = C.mul(D, w);
    f = f.mul(delta, w);
    if (delta.sub(ONE, w).abs().lt(Dec.fromString('1e-' + (p + 4)))) break;
  }
  return exp(x.mul(x, w).neg(), w).div(f.mul(SQRTPI, w), p);
}

export const CONST = { PI, E, LN10, LN2, PIH, PI2, PIQ, SQRTPI };
