// Regression tests for behaviour reported against the real fx-991EX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, newCalc, press } from './helpers.js';
import { FONTS, textWidth } from '../js/ui/bitmap.js';
import { toPlain } from '../js/engine/format.js';

const ex = (name, seq, expected, setup) => test(name, () => assert.equal(run(seq, setup), expected));

// ---------- the subtraction key as a negative sign ----------
ex('[−] at the start of an expression is a negative sign', '- 1 =', '-1');
ex('Abs(−1) typed with the [−] key', 'SHIFT ( - 1 =', '1');
ex('Abs(−1) typed with the [−] key (Line IO)', 'SHIFT ( - 1 ) =', '1', { io: 'LL' });
ex('−2² with the [−] key = −4 (same priority as (−))', '- 2 x² =', '-4');
ex('2×−3 with the [−] key', '2 × - 3 =', '-6');
ex('5−−3 = 8', '5 - - 3 =', '8');
ex('(−3) with the [−] key', '( - 3 ) =', '-3');
ex('×10ˣ followed by the [−] key', '1 ×10x - 3 =', '1/1000');
ex('5−3 is still a subtraction', '5 - 3 =', '2');
ex('CMPLX: √(−4) with the [−] key = 2i', '√ - 4 =', '2𝑖', { mode: 'cmplx' });
ex('CMPLX: √(−4) with the [−] key (Line IO)', '√ - 4 ) =', '2𝑖', { mode: 'cmplx', io: 'LL' });
ex('EQN simultaneous: negative coefficient with the [−] key', '1 2 1 = - 2 = 3 = 2 = 3 = 4 = =', '𝑥=17/7, 𝑦=-2/7', { mode: 'eqn' });
ex('EQN polynomial: negative coefficient with the [−] key', '2 2 1 = 2 = - 2 = =', '𝑥₁=-1+√3, 𝑥₂=-1-√3, 𝑥=-1, 𝑦=-3', { mode: 'eqn' });
ex('Inequality: negative coefficient with the [−] key', '2 2 1 = 2 = - 3 = =', '-3<𝑥<1', { mode: 'ineq' });

// ---------- S⇔D in Ratio mode ----------
ex('Ratio: S⇔D turns X=9/2 into 4.5', '1 3 = 8 = 12 = = SD', '4.5', { mode: 'ratio' });
ex('Ratio: S⇔D twice is back to 9/2', '1 3 = 8 = 12 = = SD SD', '9/2', { mode: 'ratio' });
ex('Ratio: S⇔D on a decimal result (MathI/DecimalO) gives the fraction', '1 3 = 8 = 12 = = SD', '9/2', { mode: 'ratio', io: 'MD' });
ex('Ratio: integer result is unchanged by S⇔D', '1 1 = 2 = 10 = = SD', '5', { mode: 'ratio' });

// ---------- Statistics result list scrolls a page at a time ----------
test('2-Variable Calc: ▼/▲ move one page, not one line', () => {
  const c = newCalc({ mode: 'stat' });
  press(c, '2 1 = 2 = 3 = ▼ ▶ 4 = 5 = 7 = OPTN 3');
  const m = c.mode;
  assert.equal(m.screen, 'list');
  const tops = [m.listTop];
  for (let i = 0; i < 4; i++) { press(c, '▼'); tops.push(m.listTop); }
  assert.deepEqual(tops, [0, 6, 12, 18, 18]);
  press(c, '▲');
  assert.equal(m.listTop, 12);
  press(c, '▲ ▲ ▲');
  assert.equal(m.listTop, 0);
});

// ---------- Table: selected cell value always on one line ----------
test('Table: the selected value is shown linear (3⌟4) in MathI/MathO', () => {
  const c = newCalc({ mode: 'table' });
  press(c, 'ALPHA ) x² + 1 ▭ 2 = = - 1 = 1 = 0.5 = = ▶ ▼');
  const v = c.mode.rows[c.mode.sel].f;
  assert.equal(toPlain(c.mode.cellValueItems(v)), '3⌟4');
  assert.ok(c.mode.cellValueItems(v).every((it) => it.t === 'x'));
});
test('Table: the selected value is a decimal in the other IO settings', () => {
  for (const io of ['MD', 'LL', 'LD']) {
    const c = newCalc({ mode: 'table', io });
    press(c, 'ALPHA ) x² + 1 ▭ 2 = = - 1 = 1 = 0.5 = = ▶ ▼');
    assert.equal(toPlain(c.mode.cellValueItems(c.mode.rows[c.mode.sel].f)), '0.75', io);
  }
});

// ---------- LCD font ----------
test('large font: 9x14 character cells', () => {
  for (const [ch, g] of FONTS.L.glyphs) assert.equal(g.rows.length, 14, ch);
  for (const ch of '0123456789ABCDEFGHKNOPRSUVXYZabcdeghnopqsuvxyz') assert.equal(textWidth(ch, 'L'), 9, ch);
  assert.equal(textWidth('1234567890', 'L'), 90);
});
test('the variable 𝑥 and the multiplication sign × are drawn differently', () => {
  for (const font of ['L', 'S']) {
    const bits = (ch) => FONTS[font].glyphs.get(ch).rows.reduce((n, r) => n + r.toString(2).replace(/0/g, '').length, 0);
    const rows = (ch) => FONTS[font].glyphs.get(ch).rows.filter((r) => r).length;
    assert.ok(rows('×') < rows('𝑥'), `${font}: × must be smaller than 𝑥`);
    assert.ok(bits('×') < bits('𝑥'), `${font}: × must have less ink than 𝑥`);
    assert.notDeepEqual(FONTS[font].glyphs.get('𝑥').rows, FONTS[font].glyphs.get('x').rows, `${font}: 𝑥 differs from x`);
  }
});
test('radian / grad marks have large-font glyphs (no "?")', () => {
  assert.ok(FONTS.L.glyphs.has('ʳ'));
  assert.ok(FONTS.L.glyphs.has('ᵍ'));
});
