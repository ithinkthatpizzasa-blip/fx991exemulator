// Unit tests of the custom number engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/engine/decimal.js';
import { Dec } from '../js/engine/decimal.js';

const f = (s) => Dec.fromString(s);
test('decimal arithmetic rounds to 15 significant digits', () => {
  assert.equal(D.ONE.div(f('3')).toString(), '0.333333333333333');
  assert.equal(f('2').div(f('3')).toString(), '0.666666666666667');
  assert.equal(f('0.1').add(f('0.2')).toString(), '0.3');
});
test('transcendental functions', () => {
  assert.equal(D.sqrt(f('2')).toString(), '1.4142135623731');
  assert.equal(D.exp(D.ONE).toString(), '2.71828182845905');
  assert.equal(D.ln(f('90')).round(10).toString(), '4.49980967');
  assert.equal(D.sin(D.ONE).toString(), '0.841470984807897');
  assert.equal(D.atan(D.ONE).mul(f('4')).toString(), '3.14159265358979');
  assert.equal(D.erf(D.ONE).round(10).toString(), '0.8427007929');
});
test('engine speed: sin is fast enough for numeric integration', () => {
  const t = Date.now();
  for (let i = 0; i < 2000; i++) D.sin(f('0.7'));
  assert.ok(Date.now() - t < 2000);
});
