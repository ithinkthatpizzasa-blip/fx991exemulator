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

// ---------- S⇔D in Equation/Func mode ----------
ex('EQN: S⇔D turns the displayed root into a decimal', '2 2 1 = 0 = - 2 = = SD', '𝑥₁=1.414213562, 𝑥₂=-√2, 𝑥=0, 𝑦=-2', { mode: 'eqn' });
ex('EQN: S⇔D twice is back to the exact root', '2 2 1 = 0 = - 2 = = SD SD', '𝑥₁=√2, 𝑥₂=-√2, 𝑥=0, 𝑦=-2', { mode: 'eqn' });
ex('EQN: S⇔D acts on the root on screen', '2 2 1 = 0 = - 2 = = ▼ SD', '𝑥₁=√2, 𝑥₂=-1.414213562, 𝑥=0, 𝑦=-2', { mode: 'eqn' });
ex('EQN: S⇔D on a complex root', '2 2 1 = 2 = 4 = = SD', '𝑥₁=-1+1.732050808𝑖, 𝑥₂=-1-√3𝑖, 𝑥=-1, 𝑦=3', { mode: 'eqn' });
ex('EQN simultaneous: S⇔D on a fraction', '1 2 1 = - 2 = 3 = 2 = 3 = 4 = = SD', '𝑥=2.428571429, 𝑦=-2/7', { mode: 'eqn' });
ex('EQN simultaneous: S⇔D on a decimal (MathI/DecimalO) gives the fraction', '1 2 1 = - 2 = 3 = 2 = 3 = 4 = = SD', '𝑥=17/7, 𝑦=-0.2857142857', { mode: 'eqn', io: 'MD' });

// ---------- the addition key as a plus sign ----------
ex('[+] at the start of an expression is ignored: +2+4 = 6', '+ 2 + 4 =', '6');
ex('+2+4 = 6 (Line IO)', '+ 2 + 4 =', '6', { io: 'LL' });
ex('[+] after "(" and after an operator', '( + 3 ) × + 2 =', '6');
ex('[+] alone is still a Syntax ERROR', '+ =', 'Syntax ERROR');
ex('EQN simultaneous: +1, +2 as coefficients', '1 2 + 1 = + 2 = 3 = 2 = 3 = 4 = =', '𝑥=-1, 𝑦=2', { mode: 'eqn' });
ex('EQN polynomial: +1, +2 as coefficients', '2 2 + 1 = + 2 = - 2 = =', '𝑥₁=-1+√3, 𝑥₂=-1-√3, 𝑥=-1, 𝑦=-3', { mode: 'eqn' });
ex('Inequality: +1 as a coefficient', '2 2 + 1 = 2 = - 3 = =', '-3<𝑥<1', { mode: 'ineq' });
ex('Ratio: +3 as a value', '1 + 3 = 8 = 12 = =', '9/2', { mode: 'ratio' });

// ---------- MENU: ALPHA + the letter key also selects modes A, B, C ----------
for (const [seq, mode] of [['MENU neg', 'eqn'], ['MENU ALPHA neg', 'eqn'], ['MENU dms', 'ineq'], ['MENU ALPHA dms', 'ineq'], ['MENU inv', 'ratio'], ['MENU ALPHA inv', 'ratio']]) {
  test(`${seq} enters ${mode}`, () => assert.equal(press(newCalc(), seq).modeId, mode));
}
test('MENU: SHIFT + a letter key does not choose a mode', () => {
  const c = press(newCalc(), 'MENU SHIFT neg');
  assert.equal(c.modeId, 'calc');
  assert.equal(c.overlays.length, 1);
});

// ---------- digit separator is a space ----------
ex('Digit separator: groups of three digits separated by a space', '1 2 3 4 5 6 7 =', '1 234 567', { digitSep: true });
ex('Digit separator with the comma decimal mark', '1 2 3 4 5 6 7 . 5 ÷ 1 0 =', '123 456,75', { digitSep: true, io: 'MD', decimalMark: ',' });

// ---------- 2-Variable Calc list layout (measured on a photo of the real unit) ----------
test('2-Variable Calc: labels in column 37, "=" in column 79, values from column 85', () => {
  const c = newCalc({ mode: 'stat' });
  press(c, '2 1 = 2 = 3 = ▼ ▶ 4 = 5 = 7 = OPTN 3');
  const m = c.mode;
  const pages = [];
  for (let i = 0; i < 4; i++) { pages.push(...m.listPage()); press(c, '▼'); }
  assert.ok(pages.some((r) => r.label === 'max(𝑦)'));
  for (const r of pages) {
    assert.deepEqual([r.lx, r.ex, r.vx], [37, 79, 85], r.label);
    assert.ok(r.ex - (r.lx + textWidth(r.label, 'S')) >= 8, `${r.label}: gap before "="`);
    assert.ok(r.vx + textWidth(r.s, 'S') <= 188, `${r.label}: value clear of the scroll bar`);
  }
});
test('1-Variable Calc uses the same columns', () => {
  const c = newCalc({ mode: 'stat' });
  press(c, '1 1 = 2 = 3 = OPTN 3');
  for (const r of c.mode.listPage()) assert.deepEqual([r.lx, r.ex, r.vx], [37, 79, 85], r.label);
});
test('2-Variable Calc: the first-page scroll thumb is 4 dots wide with rounded ends (rows 0-14)', () => {
  const c = newCalc({ mode: 'stat' });
  press(c, '2 1 = 2 = 3 = ▼ ▶ 4 = 5 = 7 = OPTN 3');
  c.render();
  const row = (y) => [187, 188, 189, 190, 191].map((x) => (c.bm.get(x, y) ? '#' : '.')).join('');
  assert.equal(row(0), '..##.');
  for (let y = 1; y <= 13; y++) assert.equal(row(y), '.####', `row ${y}`);
  assert.equal(row(14), '..##.');
  assert.equal(row(15), '.....');
});
test('the longest value (−1.234567891×10⁻⁹⁹) still ends clear of the scroll bar', () => {
  const c = newCalc({ mode: 'stat' });
  press(c, '2 1 = 2 = 3 = ▼ ▶ 4 = 5 = 7 = OPTN 3');
  const m = c.mode;
  m.list.lines[0][1] = m.list.lines[0][1].constructor.parse('-1.234567891e-99');
  const page = m.listPage();
  assert.ok(page[0].vx + textWidth(page[0].s, 'S') <= 188);
  assert.ok(page.every((r) => r.lx === page[0].lx && r.lx <= 37));
});

// ---------- cursor at the left end of the line ----------
const cursorAtLeftEdge = (setup, seq) => {
  const c = newCalc(setup);
  press(c, seq);
  c.blink = true;
  c.render();
  let on = 0;
  for (let y = 0; y < 15; y++) on += c.bm.get(0, y) ? 1 : 0;
  return on;
};
test('cursor is visible at the leftmost position', () => {
  assert.ok(cursorAtLeftEdge({}, '') >= 10, 'empty input');
  assert.ok(cursorAtLeftEdge({}, '1 2 3 ◀ ◀ ◀') >= 10, 'before 123');
  assert.ok(cursorAtLeftEdge({}, '▭ ◀') >= 10, 'before a fraction');
  assert.ok(cursorAtLeftEdge({ io: 'LL' }, '1 2 3 ◀ ◀ ◀') >= 10, 'Line IO');
});
