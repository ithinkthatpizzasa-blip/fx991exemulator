// (De)serialisation of calculator values for localStorage persistence.
import { Dec } from './decimal.js';
import { Real, Ex } from './real.js';
import { Complex } from './complex.js';
import { Matrix, Vector } from './matrix.js';

export function ser(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return { b: v.toString() };
  if (v instanceof Real) {
    const o = { d: [v.d.m.toString(), v.d.e] };
    if (v.x) o.x = [v.x.t.map(([c, r]) => [c.toString(), r.toString()]), v.x.d.toString(), v.x.pi ? 1 : 0];
    if (v.dms) o.dms = 1;
    if (v.ld) o.ld = 1;
    return o;
  }
  if (v instanceof Complex) return { c: [ser(v.re), ser(v.im)] };
  if (v instanceof Matrix) return { m: v.a.map((row) => row.map(ser)) };
  if (v instanceof Vector) return { v: v.a.map(ser) };
  return null;
}

export function de(o) {
  if (o == null) return null;
  if (o.b !== undefined) return BigInt(o.b);
  if (o.d) {
    const r = new Real(new Dec(BigInt(o.d[0]), o.d[1]), o.x ? new Ex(o.x[0].map(([c, r2]) => [BigInt(c), BigInt(r2)]), BigInt(o.x[1]), !!o.x[2]) : null);
    if (o.dms) r.dms = true;
    if (o.ld) r.ld = true;
    return r;
  }
  if (o.c) return new Complex(de(o.c[0]), de(o.c[1]));
  if (o.m) return new Matrix(o.m.map((row) => row.map(de)));
  if (o.v) return new Vector(o.v.map(de));
  return null;
}
