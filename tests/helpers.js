// Test helpers: drive the calculator headless with key sequences written the
// way the manual prints them.
import { Calculator } from '../js/calc.js';
import { toPlain } from '../js/engine/format.js';
import { setSeed } from '../js/engine/fn.js';
import '../js/modes/all.js';

const NAMES = {
  '0': 'k0', '1': 'k1', '2': 'k2', '3': 'k3', '4': 'k4', '5': 'k5', '6': 'k6', '7': 'k7', '8': 'k8', '9': 'k9',
  '+': 'add', '-': 'sub', '×': 'mul', '*': 'mul', '÷': 'div', '/': 'div', '=': 'eq', '.': 'dot', '(': 'lpar', ')': 'rpar',
  SHIFT: 'shift', ALPHA: 'alpha', AC: 'ac', DEL: 'del', ON: 'on', MENU: 'menu', OPTN: 'optn', CALC: 'calc', STO: 'sto', ENG: 'eng',
  'S⇔D': 'sd', SD: 'sd', 'M+': 'mplus', Ans: 'ans', ans: 'ans', '×10x': 'exp', EXP: 'exp', '(-)': 'neg', '(−)': 'neg', neg: 'neg',
  "°'\"": 'dms', DMS: 'dms', 'x-1': 'inv', 'x⁻¹': 'inv', inv: 'inv', sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', 'log▫▫': 'log', ln: 'ln',
  'x²': 'sq', sq: 'sq', 'x^': 'pow', pow: 'pow', '√': 'sqrt', sqrt: 'sqrt', frac: 'frac', '▭': 'frac', x: 'xvar', '∫': 'integ', integ: 'integ',
  '▲': 'up', '▼': 'down', '◀': 'left', '▶': 'right', up: 'up', down: 'down', left: 'left', right: 'right',
};

export function newCalc(setup = {}) {
  setSeed(12345);
  const c = new Calculator({});
  const { mode, ...rest } = setup;
  Object.assign(c.setup, rest);
  if (setup.io) c.mode.onSetup && c.mode.onSetup('io');
  if (mode) c.enterMode(mode);
  return c;
}

export function press(calc, seq) {
  for (const tok of seq.trim().split(/\s+/)) {
    if (!tok) continue;
    let k = NAMES[tok];
    if (!k) {
      if (/^[\d.]+$/.test(tok)) { for (const ch of tok) { calc.press(NAMES[ch]); calc.render(); } continue; }
      k = tok; // raw key id
    }
    calc.press(k);
    calc.render();
  }
  return calc;
}

export function result(calc) {
  const m = calc.mode;
  if (m.resultText) { const r = m.resultText(); if (r != null) return r; }
  const cs = m.cs;
  if (!cs) return m.resultText ? m.resultText() : null;
  if (cs.flow) return cs.flow.resultText ? cs.flow.resultText() : null;
  if (cs.state === 'error') return cs.err.message;
  if (cs.state !== 'result' || !cs.res) return null;
  return cs.resultLines(cs.res.value, cs.res.disp).map(toPlain).join(' | ');
}

export function run(seq, setup) {
  const c = newCalc(setup);
  press(c, seq);
  return result(c);
}
