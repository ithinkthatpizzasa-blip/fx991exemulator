// Scientific constants (CODATA 2010, as stated in the manual) and metric
// conversions (NIST SP 811 (2008)) - menu structure follows the manual's
// Reference Sheet.
import { Dec } from './decimal.js';
import * as R from './real.js';
import { Real } from './real.js';
import { defineDynamic } from '../editor/tokens.js';

// [display name (LCD markup), value]
export const CONST_CATEGORIES = [
  ['Universal', [
    ['h', '6.62606957e-34'], ['ħ', '1.054571726e-34'], ['c_{0}', '299792458'],
    ['ε_{0}', '8.854187817e-12'], ['μ_{0}', '1.2566370614e-6'], ['Z_{0}', '376.730313461'],
    ['G', '6.67384e-11'], ['l_{P}', '1.616199e-35'], ['t_{P}', '5.39106e-44'],
  ]],
  ['Electromagnetic', [
    ['μ_{N}', '5.05078353e-27'], ['μ_{B}', '9.27400968e-24'], ['e', '1.602176565e-19'],
    ['Φ_{0}', '2.067833758e-15'], ['G_{0}', '7.7480917346e-5'], ['K_{J}', '4.8359787e14'],
    ['R_{K}', '25812.8074434'],
  ]],
  ['Atomic&Nuclear', [
    ['m_{p}', '1.672621777e-27'], ['m_{n}', '1.674927351e-27'], ['m_{e}', '9.10938291e-31'],
    ['m_{μ}', '1.883531475e-28'], ['a_{0}', '5.2917721092e-11'], ['α', '7.2973525698e-3'],
    ['r_{e}', '2.8179403267e-15'], ['λ_{C}', '2.4263102389e-12'], ['γ_{p}', '2.675222005e8'],
    ['λ_{Cp}', '1.32140985623e-15'], ['λ_{Cn}', '1.3195909068e-15'], ['R_{∞}', '10973731.568539'],
    ['μ_{p}', '1.410606743e-26'], ['μ_{e}', '-9.2847643e-24'], ['μ_{n}', '-9.6623647e-27'],
    ['μ_{μ}', '-4.49044807e-26'], ['m_{τ}', '3.16747e-27'],
  ]],
  ['Physico-Chem', [
    ['u', '1.660538921e-27'], ['F', '96485.3365'], ['N_{A}', '6.02214129e23'],
    ['k', '1.3806488e-23'], ['V_{m}', '0.022413968'], ['R', '8.3144621'],
    ['c_{1}', '3.74177153e-16'], ['c_{2}', '0.014387770'], ['σ', '5.670373e-8'],
  ]],
  ['Adopted Values', [
    ['g', '9.80665'], ['atm', '101325'], ['R_{K-90}', '25812.807'], ['K_{J-90}', '4.835979e14'],
  ]],
  ['Other', [['t', '273.15']]],
];

export const CONSTS = {}; // id -> {name, value}
let ci = 0;
for (const [, list] of CONST_CATEGORIES) {
  for (const item of list) {
    ci++;
    const id = 'c:' + ci;
    item.push(id);
    CONSTS[id] = { name: item[0], value: item[1] };
    defineDynamic(id, item[0], 'val', { b: 2 });
  }
}

export function constValue(id) {
  const c = CONSTS[id];
  // constants are decimal values (displayed in decimal form)
  return R.fromDec(Dec.fromString(c.value));
}

// conversions: [label, kind, factor or fn]
const f = (s) => Dec.fromString(s);
export const CONV_CATEGORIES = [
  ['Length', [
    ['in▶cm', 'mul', '2.54'], ['cm▶in', 'div', '2.54'], ['ft▶m', 'mul', '0.3048'], ['m▶ft', 'div', '0.3048'],
    ['yd▶m', 'mul', '0.9144'], ['m▶yd', 'div', '0.9144'], ['mile▶km', 'mul', '1.609344'], ['km▶mile', 'div', '1.609344'],
    ['n mile▶m', 'mul', '1852'], ['m▶n mile', 'div', '1852'], ['pc▶km', 'mul', '3.0856775814913e13'], ['km▶pc', 'div', '3.0856775814913e13'],
  ]],
  ['Area', [['acre▶m²', 'mul', '4046.8564224'], ['m²▶acre', 'div', '4046.8564224']]],
  ['Volume', [
    ['gal(US)▶L', 'mul', '3.785411784'], ['L▶gal(US)', 'div', '3.785411784'],
    ['gal(UK)▶L', 'mul', '4.54609'], ['L▶gal(UK)', 'div', '4.54609'],
  ]],
  ['Mass', [
    ['oz▶g', 'mul', '28.349523125'], ['g▶oz', 'div', '28.349523125'],
    ['lb▶kg', 'mul', '0.45359237'], ['kg▶lb', 'div', '0.45359237'],
  ]],
  ['Velocity', [['km/h▶m/s', 'div', '3.6'], ['m/s▶km/h', 'mul', '3.6']]],
  ['Pressure', [
    ['atm▶Pa', 'mul', '101325'], ['Pa▶atm', 'div', '101325'],
    ['mmHg▶Pa', 'mul', '133.322387415'], ['Pa▶mmHg', 'div', '133.322387415'],
    ['kgf/cm²▶Pa', 'mul', '98066.5'], ['Pa▶kgf/cm²', 'div', '98066.5'],
    ['lbf/in²▶kPa', 'mul', '6.894757293168'], ['kPa▶lbf/in²', 'div', '6.894757293168'],
  ]],
  ['Energy', [
    ['kgf•m▶J', 'mul', '9.80665'], ['J▶kgf•m', 'div', '9.80665'],
    ['J▶cal', 'div', '4.1855'], ['cal▶J', 'mul', '4.1855'],
  ]],
  ['Power', [['hp▶kW', 'mul', '0.745699872'], ['kW▶hp', 'div', '0.745699872']]],
  ['Temperature', [['°F▶°C', 'F2C'], ['°C▶°F', 'C2F']]],
];

export const CONVS = {};
let vi = 0;
for (const [, list] of CONV_CATEGORIES) {
  for (const item of list) {
    vi++;
    const id = 'cv:' + vi;
    item.push(id);
    CONVS[id] = item;
    defineDynamic(id, item[0], 'post', { p: 6, b: 2, conv: true });
  }
}

export function convApply(id, x) {
  const [, kind, k] = CONVS[id];
  if (kind === 'mul') return R.mul(x, R.fromDec(f(k)));
  if (kind === 'div') return R.div(x, R.fromDec(f(k)));
  const r18 = Real.rat(9, 5), r32 = Real.int(32);
  const r = kind === 'F2C' ? R.div(R.sub(x, r32), r18) : R.add(R.mul(x, r18), r32);
  return R.fromDec(r.d);
}
