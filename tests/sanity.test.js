// Sanity checks from the project spec (section 7.2) plus persistence and
// robustness tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, newCalc, press, result } from './helpers.js';
import { Calculator } from '../js/calc.js';

test('sin(30) in DEG gives 1/2, S⇔D gives 0.5', () => {
  assert.equal(run('sin 30 ) ='), '1/2');
  assert.equal(run('sin 30 ) = S⇔D'), '0.5');
});
test('1/3 + 1/6 gives 1/2', () => assert.equal(run('1 ▭ 3 ▶ + 1 ▭ 6 ='), '1/2'));
test('√2 × √8 gives 4', () => assert.equal(run('√ 2 ▶ × √ 8 ='), '4'));
test('0.1 + 0.2 displays 0.3 (no binary floating point error)', () => {
  // MathI/MathO shows the exact fraction like the real unit; decimal form is 0.3
  assert.equal(run('0 . 1 + 0 . 2 ='), '3/10');
  assert.equal(run('0 . 1 + 0 . 2 = S⇔D'), '0.3');
  assert.equal(run('0 . 1 + 0 . 2 =', { io: 'MD' }), '0.3');
  assert.equal(run('0 . 1 + 0 . 2 =', { io: 'LL' }), '0.3');
});
test('1 ÷ 0 gives Math ERROR', () => assert.equal(run('1 ÷ 0 ='), 'Math ERROR'));

function memStorage() {
  let data = null;
  return { load: () => (data ? JSON.parse(data) : null), save: (o) => { data = JSON.stringify(o); }, raw: () => data, set: (s) => { data = s; } };
}
test('variable stored with STO survives closing and reopening the app', () => {
  const st = memStorage();
  const c1 = new Calculator({ storage: st });
  press(c1, '1 ▭ 3 STO (−)');
  press(c1, '42 STO M+');
  const c2 = new Calculator({ storage: st });
  press(c2, 'ALPHA (−) =');
  assert.equal(result(c2), '1/3');
  assert.equal(c2.mem.vars.M.toNumber(), 42);
});
test('setup and mode survive a restart', () => {
  const st = memStorage();
  const c1 = new Calculator({ storage: st });
  press(c1, 'SHIFT MENU 2 2 MENU 2');
  const c2 = new Calculator({ storage: st });
  assert.equal(c2.setup.unit, 'R');
  assert.equal(c2.modeId, 'cmplx');
});
test('corrupted storage falls back to defaults', () => {
  for (const bad of ['{not json', '{"v":1,"setup":5,"mem":{"vars":{"A":{"d":["x",0]}}}}', '"hello"', '{"v":999}']) {
    const st = memStorage();
    st.set(bad);
    const c = new Calculator({ storage: { load: () => { try { return st.load(); } catch (e) { return null; } }, save: () => {} } });
    press(c, '1 + 1 =');
    assert.equal(result(c), '2');
  }
});
test('storage that throws (blocked / full) does not break the app', () => {
  const c = new Calculator({ storage: { load: () => { throw new Error('blocked'); }, save: () => { throw new Error('full'); } } });
  press(c, '2 × 3 =');
  assert.equal(result(c), '6');
});
test('ON clears history, OFF/ON keeps memory', () => {
  const c = newCalc();
  press(c, '5 STO (−) 1 + 1 = SHIFT AC');
  assert.equal(c.power, false);
  press(c, 'ON');
  assert.equal(c.power, true);
  assert.equal(c.mode.cs.history.length, 0);
  assert.equal(c.mem.vars.A.toNumber(), 5);
});
test('RESET Initialize All returns to defaults', () => {
  const c = newCalc();
  press(c, 'SHIFT MENU 2 2 5 STO (−) MENU 2 SHIFT 9 3 =');
  assert.equal(c.setup.unit, 'D');
  assert.equal(c.modeId, 'calc');
  assert.ok(c.mem.vars.A.isZero());
});
test('changing Input/Output clears history', () => {
  const c = newCalc();
  press(c, '1 + 1 = SHIFT MENU 1 3');
  assert.equal(c.mode.cs.history.length, 0);
  assert.equal(c.mode.cs.editor.line, true);
});
test('every key in every mode renders without throwing', () => {
  const keys = ['shift', 'alpha', 'up', 'down', 'left', 'right', 'menu', 'optn', 'calc', 'integ', 'xvar', 'frac', 'sqrt', 'sq', 'pow', 'log', 'ln',
    'neg', 'dms', 'inv', 'sin', 'cos', 'tan', 'sto', 'eng', 'lpar', 'rpar', 'sd', 'mplus', 'k7', 'k8', 'k9', 'del', 'ac', 'k4', 'k5', 'k6',
    'mul', 'div', 'k1', 'k2', 'k3', 'add', 'sub', 'k0', 'dot', 'exp', 'ans', 'eq'];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const mode of ['calc', 'cmplx', 'basen', 'matrix', 'vector', 'stat', 'dist', 'sheet', 'table', 'eqn', 'ineq', 'ratio']) {
    const c = newCalc({ mode });
    for (let i = 0; i < 400; i++) {
      const k = keys[Math.floor(rnd() * keys.length)];
      if (k === 'menu' && rnd() < 0.7) continue;
      c.press(k);
      c.render();
    }
  }
});
