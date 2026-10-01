// Complex numbers with Real (possibly exact) components.
import * as R from './real.js';
import { Real, ZERO_R, ONE_R } from './real.js';
import { CalcError } from './errors.js';

export class Complex {
  constructor(re, im) {
    this.re = re;
    this.im = im;
  }
  isReal() { return this.im.isZero(); }
  isZero() { return this.re.isZero() && this.im.isZero(); }
}

export const I = new Complex(ZERO_R, ONE_R);

export function toC(v) { return v instanceof Complex ? v : new Complex(v, ZERO_R); }

export function cadd(a, b) { return new Complex(R.add(a.re, b.re), R.add(a.im, b.im)); }
export function csub(a, b) { return new Complex(R.sub(a.re, b.re), R.sub(a.im, b.im)); }
export function cneg(a) { return new Complex(R.neg(a.re), R.neg(a.im)); }
export function cconj(a) { return new Complex(a.re, R.neg(a.im)); }
export function cmul(a, b) {
  if (a.im.isZero() && b.im.isZero()) return new Complex(R.mul(a.re, b.re), ZERO_R);
  return new Complex(
    R.sub(R.mul(a.re, b.re), R.mul(a.im, b.im)),
    R.add(R.mul(a.re, b.im), R.mul(a.im, b.re)),
  );
}
export function cdiv(a, b) {
  if (b.isZero()) throw new CalcError('Math');
  if (b.im.isZero()) return new Complex(R.div(a.re, b.re), R.div(a.im, b.re));
  const den = R.add(R.mul(b.re, b.re), R.mul(b.im, b.im));
  const num = cmul(a, cconj(b));
  return new Complex(R.div(num.re, den), R.div(num.im, den));
}
export function cabs2(a) { return R.add(R.mul(a.re, a.re), R.mul(a.im, a.im)); }
export function cabs(a) {
  if (a.im.isZero()) return R.abs(a.re);
  if (a.re.isZero()) return R.abs(a.im);
  return R.sqrtR(cabs2(a));
}

export function cpowInt(a, n) {
  // n BigInt ; manual: -1e10 < n < 1e10
  if (n === 0n) {
    if (a.isZero()) throw new CalcError('Math');
    return new Complex(ONE_R, ZERO_R);
  }
  let neg = n < 0n;
  if (neg) n = -n;
  if (n >= 10000000000n) throw new CalcError('Math');
  let res = new Complex(ONE_R, ZERO_R), base = a;
  while (n > 0n) {
    if (n & 1n) res = cmul(res, base);
    n >>= 1n;
    if (n > 0n) base = cmul(base, base);
  }
  if (neg) res = cdiv(new Complex(ONE_R, ZERO_R), res);
  return res;
}

export function creal(v) { return v instanceof Complex ? v.re : v; }
export function cimag(v) { return v instanceof Complex ? v.im : ZERO_R; }
export { Real };
