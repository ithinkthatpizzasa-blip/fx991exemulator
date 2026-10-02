// Result formatting. Produces display items (same structure as editor items,
// plus {t:'x', s:text} runs) for the LCD, and plain text for tests.
import * as D from './decimal.js';
import { Dec } from './decimal.js';
import * as R from './real.js';
import { Real, Ex, normEx, babs, gcd } from './real.js';
import { Complex } from './complex.js';
import * as F from './fn.js';
import { ENG_SYMBOLS } from '../editor/tokens.js';

const X = (s) => ({ t: 'x', s });
const MINUS = '−';

// ---------- plain text ----------
export function toPlain(items) {
  let out = '';
  for (const it of items) {
    if (it.t === 'x') out += it.s;
    else if (it.t === 'c') out += it.v;
    else if (it.t === 'frac') out += wrap(toPlain(it.s[0])) + '/' + wrap(toPlain(it.s[1]));
    else if (it.t === 'mixed') out += toPlain(it.s[0]) + ' ' + toPlain(it.s[1]) + '/' + toPlain(it.s[2]);
    else if (it.t === 'sqrt') out += '√' + wrap(toPlain(it.s[0]));
    else if (it.t === 'pow') out += '^' + wrap(toPlain(it.s[0]));
    else if (it.t === 'sub') out += toPlain(it.s[0]);
  }
  return out.replace(/−/g, '-');
}
function wrap(s) { return /^[-−]?[0-9A-Za-z.√π𝑖]+$/.test(s) && !/[+−-]/.test(s.slice(1)) ? s : '(' + s + ')'; }

// ---------- decimal formatting ----------
function trimZeros(s) {
  if (!s.includes('.')) return s;
  s = s.replace(/0+$/, '');
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

function groupDigits(intPart, sep) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// returns {neg, mant, exp}  exp === null -> plain
export function decParts(d, numFmt, engExp = null) {
  if (d.isZero()) {
    if (numFmt.type === 'Fix') return { neg: false, mant: numFmt.n ? '0.' + '0'.repeat(numFmt.n) : '0', exp: engExp };
    if (numFmt.type === 'Sci') {
      const N = numFmt.n || 10;
      return { neg: false, mant: N > 1 ? '0.' + '0'.repeat(N - 1) : '0', exp: 0 };
    }
    return { neg: false, mant: '0', exp: engExp };
  }
  const neg = d.isNeg();
  const a = d.abs();
  if (engExp !== null) {
    // fixed exponent (ENG display)
    const m = a.div(pow10Dec(engExp), 20);
    let ms;
    if (numFmt.type === 'Fix') ms = m.roundDP(numFmt.n).toString();
    else if (numFmt.type === 'Sci') ms = trimZeros(m.round(numFmt.n || 10).toString());
    else ms = trimZeros(m.round(10).toString());
    if (numFmt.type === 'Fix' && numFmt.n > 0 && !ms.includes('.')) ms += '.' + '0'.repeat(numFmt.n);
    else if (numFmt.type === 'Fix' && ms.includes('.')) {
      const dec = ms.split('.')[1].length;
      if (dec < numFmt.n) ms += '0'.repeat(numFmt.n - dec);
    }
    return { neg, mant: ms, exp: engExp };
  }
  if (numFmt.type === 'Sci') {
    const N = numFmt.n || 10;
    const s = a.sci(N);
    let digits = s.digits.padEnd(N, '0');
    const mant = digits[0] + (N > 1 ? '.' + digits.slice(1) : '');
    return { neg, mant, exp: s.exp };
  }
  if (numFmt.type === 'Fix') {
    const n = numFmt.n;
    if (a.ge(Dec.fromString('1e10')) || a.round(10).mag() >= 10) {
      const s = a.sci(n + 1);
      const digits = s.digits.padEnd(n + 1, '0');
      return { neg, mant: digits[0] + (n > 0 ? '.' + digits.slice(1) : ''), exp: s.exp };
    }
    const intDigits = Math.max(1, a.mag() + 1);
    const dp = Math.max(0, Math.min(n, 10 - intDigits));
    let r = a.roundDP(dp);
    let s = r.toString();
    if (dp > 0) {
      if (!s.includes('.')) s += '.';
      const cur = s.split('.')[1].length;
      if (cur < dp) s += '0'.repeat(dp - cur);
    }
    if (r.isZero()) return { neg: false, mant: s, exp: null };
    return { neg, mant: s, exp: null };
  }
  // Norm
  const r = a.round(10);
  const m = r.mag();
  const lo = numFmt.n === 2 ? -9 : -2;
  if (m >= 10 || m < lo) {
    const s = r.sci(10);
    const mant = trimZeros(s.digits[0] + '.' + s.digits.slice(1));
    return { neg, mant, exp: s.exp };
  }
  return { neg, mant: trimZeros(r.toString()), exp: null };
}

function pow10Dec(e) { return new Dec(1n, e); }

export function engParts(d, numFmt, shift) {
  // normalized engineering exponent
  if (d.isZero()) return 0;
  const r = d.abs().round(10);
  let e = r.mag();
  e = Math.floor(e / 3) * 3;
  return e + (shift || 0);
}

// decimal -> items
function decItems(d, st, engExp = null) {
  const p = decParts(d, st.numFmt, engExp);
  const items = [];
  let mant = p.mant;
  const mark = st.decimalMark === ',' ? ',' : '.';
  let [ip, fp] = mant.split('.');
  // the real unit separates groups of three digits with a space, whatever the decimal mark
  if (st.digitSep) ip = groupDigits(ip, ' ');
  mant = fp !== undefined ? ip + mark + fp : ip;
  let s = (p.neg ? MINUS : '') + mant;
  if (p.exp !== null) {
    if (st.engSym && engExp !== null) {
      const sym = ENG_SYMBOLS.find((x) => x[1] === p.exp);
      if (p.exp === 0) { items.push(X(s)); return items; }
      if (sym) { items.push(X(s + sym[0])); return items; }
    }
    if (engExp !== null && p.exp === 0 && st.engSym) { items.push(X(s)); return items; }
    items.push(X(s + '×10'));
    items.push({ t: 'pow', s: [[X(p.exp < 0 ? MINUS + -p.exp : String(p.exp))]] });
    return items;
  }
  items.push(X(s));
  return items;
}

function digitsLen(b) { return babs(b).toString().length; }

// ---------- exact forms ----------
function textNum(n) { return X(n.toString()); }

function fracItems(n, d, st, line) {
  // n may be negative
  const neg = n < 0n;
  const an = babs(n);
  const sign = neg ? [X(MINUS)] : [];
  if (d === 1n) return [X((neg ? MINUS : '') + an.toString())];
  const mixed = st.mixed;
  if (mixed && an > d) {
    const ip = an / d, rp = an % d;
    if (line) return [X((neg ? MINUS : '') + ip + '⌟' + rp + '⌟' + d)];
    return [...sign, { t: 'mixed', s: [[textNum(ip)], [textNum(rp)], [textNum(d)]] }];
  }
  if (line) return [X((neg ? MINUS : '') + an + '⌟' + d)];
  return [...sign, { t: 'frac', s: [[textNum(an)], [textNum(d)]] }];
}

export function fracFits(n, d, mixed) {
  const an = babs(n);
  if (mixed && an > d) {
    const ip = an / d, rp = an % d;
    return digitsLen(ip) + digitsLen(rp) + digitsLen(d) + 2 <= 10;
  }
  return digitsLen(an) + digitsLen(d) + 1 <= 10;
}

function surdFits(ex) {
  for (const [c, r] of ex.t) {
    const g = gcd(c, ex.d);
    const a = babs(c / g), cc = ex.d / g;
    if (a >= 100n || cc >= 100n) return false;
    if (r !== 1n && r >= 1000n) return false;
  }
  return true;
}

function surdNumItems(ex, signOutside) {
  const out = [];
  ex.t.forEach(([c, r], i) => {
    let cc = c;
    if (signOutside) cc = babs(c);
    if (i === 0) { if (cc < 0n) out.push(X(MINUS)); } else out.push(X(cc < 0n ? MINUS : '+'));
    const a = babs(cc);
    if (r === 1n) out.push(textNum(a));
    else {
      if (a !== 1n) out.push(textNum(a));
      out.push({ t: 'sqrt', s: [[textNum(r)]] });
    }
  });
  // merge adjacent text
  return mergeText(out);
}

export function mergeText(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.t === 'x' && last && last.t === 'x') last.s += it.s;
    else out.push(it.t === 'x' ? { t: 'x', s: it.s } : it);
  }
  return out;
}

// exact Real -> items or null if not displayable in exact form
export function exactItems(v, st, line) {
  const ex = v.x;
  if (!ex) return null;
  if (ex.isRational()) {
    const n = ex.num(), d = ex.d;
    if (d === 1n) return null; // integers use decimal formatting
    if (!fracFits(n, d, st.mixed)) return null;
    return fracItems(n, d, st, line);
  }
  if (line) return null; // Line output: fractions only
  if (ex.pi) {
    const n = ex.num(), d = ex.d;
    if (v.d.abs().ge(Dec.fromString('1e6'))) return null;
    if (digitsLen(n) + digitsLen(d) + 1 > 10) return null;
    const neg = n < 0n;
    const sign = neg ? [X(MINUS)] : [];
    if (d === 1n) return mergeText([...sign, X((babs(n) === 1n ? '' : babs(n).toString()) + 'π')]);
    return [...sign, { t: 'frac', s: [[textNum(babs(n))], [textNum(d)]] }, X('π')];
  }
  if (!surdFits(ex)) return null;
  const single = ex.t.length === 1;
  const neg = single && ex.t[0][0] < 0n;
  const num = surdNumItems(ex, single);
  if (ex.d === 1n) return neg ? mergeText([X(MINUS), ...num]) : num;
  const fr = { t: 'frac', s: [num, [textNum(ex.d)]] };
  return neg ? [X(MINUS), fr] : [fr];
}

// approximate decimal -> rational (S<->D on decimal-only values)
export function decToRational(d) {
  if (d.isZero()) return [0n, 1n];
  const neg = d.isNeg();
  const a = d.abs();
  // continued fraction on exact decimal value
  let num = a.m, den = 1n;
  if (a.e >= 0) num *= D.p10(a.e); else den = D.p10(-a.e);
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  let x = num, y = den;
  for (let i = 0; i < 60 && y !== 0n; i++) {
    const q = x / y;
    [x, y] = [y, x - q * y];
    [h0, h1] = [h1, q * h1 + h0];
    [k0, k1] = [k1, q * k1 + k0];
    // matches at 10 significant digits?
    const approx = Dec.fromBigInt(h1).div(Dec.fromBigInt(k1), 15);
    if (approx.round(10).eq(a.round(10)) && approx.sub(a, 20).abs().le(a.mul(Dec.fromString('1e-11'), 20))) {
      if (!fracFits(h1, k1, false)) return null;
      return [neg ? -h1 : h1, k1];
    }
    if (k1 > 10n ** 10n) return null;
  }
  return null;
}

// DMS formatting d°m's"
export function dmsItems(v, st) {
  const neg = v.sign() < 0;
  let a = v.d.abs();
  if (a.ge(Dec.fromString('1e7'))) return null;
  let deg = a.floor();
  let rem = a.sub(deg, 30).mul(Dec.fromInt(60), 30);
  let min = rem.floor();
  let sec = rem.sub(min, 30).mul(Dec.fromInt(60), 30);
  const degDigits = deg.isZero() ? 1 : deg.mag() + 1;
  const secDP = Math.max(0, 10 - degDigits - 2 - 2);
  sec = sec.roundDP(Math.min(secDP, 2));
  if (sec.ge(Dec.fromInt(60))) { sec = D.ZERO; min = min.add(D.ONE); }
  if (min.ge(Dec.fromInt(60))) { min = D.ZERO; deg = deg.add(D.ONE); }
  const s = (neg ? MINUS : '') + deg.toString() + '°' + min.toString() + "'" + trimZeros(sec.toString()) + '"';
  return [X(s)];
}

// prime factorization display
export function factItems(v) {
  if (!v.isInt() || v.sign() <= 0) return null;
  let n = v.toBigInt();
  if (n.toString().length > 10) return null;
  if (n === 1n) return [X('1')];
  const factors = [];
  let m = Number(n);
  const primes = [];
  for (let p = 2; p <= 1009; p++) {
    let isP = true;
    for (const q of primes) { if (q * q > p) break; if (p % q === 0) { isP = false; break; } }
    if (isP) primes.push(p);
  }
  for (const p of primes) {
    if (m % p === 0) {
      let k = 0;
      while (m % p === 0) { m /= p; k++; }
      factors.push([p, k]);
    }
    if (m === 1) break;
  }
  const items = [];
  const push = (s) => items.push(X(s));
  factors.forEach(([p, k], i) => {
    if (i) push('×');
    push(String(p));
    if (k > 1) items.push({ t: 'pow', s: [[X(String(k))]] });
  });
  if (m > 1) {
    if (factors.length) push('×');
    if (m < 1018081) push(String(m));
    else push('(' + m + ')');
  }
  return mergeText(items);
}

// ---------- top-level ----------
// st: { io: 'MM'|'MD'|'LL'|'LD', numFmt, mixed(bool), engSym, decimalMark, digitSep,
//       complexFmt: 'rect'|'polar', unit }
// disp: { sd: null|'exact'|'dec', eng: null|exp, dms: null|bool, fact: bool, approx: bool }
export function formatReal(v, st, disp = {}) {
  const line = st.io === 'LL' || st.io === 'LD';
  if (disp.fact) {
    const f = factItems(v);
    if (f) return f;
  }
  if (disp.eng !== null && disp.eng !== undefined) return decItems(v.d, st, disp.eng);
  const showDms = disp.dms !== null && disp.dms !== undefined ? disp.dms : v.dms;
  if (showDms) {
    const it = dmsItems(v, st);
    if (it) return it;
  }
  const exactDefault = (st.io === 'MM' || st.io === 'LL') && !disp.approx && !(st.io === 'LL' && v.ld);
  let wantExact = disp.sd === 'exact' ? true : disp.sd === 'dec' ? false : exactDefault;
  if (wantExact) {
    const lineOut = line;
    let ex = exactItems(v, st, lineOut);
    if (!ex && disp.sd === 'exact' && !v.x) {
      const r = decToRational(v.d);
      if (r && r[1] !== 1n) ex = fracItems(r[0], r[1], st, lineOut);
    }
    if (ex) return ex;
  }
  if (st.engSym) {
    const e = engParts(v.d, st.numFmt, 0);
    if (!v.d.isZero()) return decItems(v.d, st, e);
  }
  return decItems(v.d, st);
}

// Can S<->D toggle this value? (exact form exists and differs from decimal)
export function hasExactForm(v, st) {
  const line = st.io === 'LL' || st.io === 'LD';
  if (exactItems(v, st, line)) return true;
  if (!v.x) return !!decToRational(v.d) && decToRational(v.d)[1] !== 1n;
  return false;
}

export function formatComplex(z, st, disp = {}) {
  // returns array of lines (each an item array)
  const line = st.io === 'LL' || st.io === 'LD';
  const polar = disp.cfmt ? disp.cfmt === 'polar' : st.complexFmt === 'polar';
  if (polar && !z.isZero()) {
    const { cabs } = cplx;
    const r = cabs(z);
    const th = F.atan2(z.im, z.re, st.unit);
    const ri = formatReal(r, st, disp), ti = formatReal(th, st, disp);
    if (line) return [ri, [X('∠'), ...ti]];
    return [mergeText([...ri, X('∠'), ...ti])];
  }
  if (z.im.isZero()) return [formatReal(z.re, st, disp)];
  const imNeg = z.im.sign() < 0;
  const imAbs = imNeg ? R.neg(z.im) : z.im;
  let imItems = formatReal(imAbs, st, disp);
  const isOne = imAbs.x && imAbs.x.isInt() && imAbs.x.num() === 1n;
  if (isOne) imItems = [];
  // a fraction/surd imaginary part: CW shows e.g. (sqrt3/2)i
  const imPart = [...imItems, X('𝑖')];
  if (z.re.isZero()) return [mergeText([...(imNeg ? [X(MINUS)] : []), ...imPart])];
  const reItems = formatReal(z.re, st, disp);
  if (line) return [reItems, mergeText([X(imNeg ? MINUS : '+'), ...imPart])];
  return [mergeText([...reItems, X(imNeg ? MINUS : '+'), ...imPart])];
}

import * as cplx from './complex.js';

export function formatValueLines(v, st, disp = {}) {
  if (v instanceof Complex) return formatComplex(v, st, disp);
  if (v instanceof Real) return [formatReal(v, st, disp)];
  if (typeof v === 'bigint') return [[X(v.toString())]];
  return [[X('?')]];
}
