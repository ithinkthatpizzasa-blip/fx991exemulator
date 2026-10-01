// Every worked example in the fx-991EX user manual, entered as the manual's
// key sequence and checked against the result the manual prints.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, newCalc, press, result } from './helpers.js';

const FIX3 = { numFmt: { type: 'Fix', n: 3 } };
const ex = (name, seq, expected, setup) => test(name, () => assert.equal(run(seq, setup), expected));

// ---------- p.6-7 Configuring the Calculator Setup ----------
ex('p6 Fix 3: 100÷7 ≈ 14.286', '100 ÷ 7 SHIFT =', '14.286', FIX3);
ex('p7 Sci 5: 1÷7 ≈ 1.4286×10^-1', '1 ÷ 7 SHIFT =', '1.4286×10^-1', { numFmt: { type: 'Sci', n: 5 } });
ex('p7 Norm 1: 1÷200 ≈ 5×10^-3', '1 ÷ 200 SHIFT =', '5×10^-3', { numFmt: { type: 'Norm', n: 1 } });
ex('p7 Norm 2: 1÷200 ≈ 0.005', '1 ÷ 200 SHIFT =', '0.005', { numFmt: { type: 'Norm', n: 2 } });
test('p7 setup menu keys: SHIFT MENU 3 1 3 sets Fix 3', () => {
  const c = newCalc();
  press(c, 'SHIFT MENU 3 1 3');
  assert.deepEqual(c.setup.numFmt, { type: 'Fix', n: 3 });
  press(c, 'SHIFT MENU down 3 1');
  assert.equal(c.setup.statFreq, true);
  press(c, 'SHIFT MENU down down 2 1');
  assert.equal(c.setup.table, 'f');
});

// ---------- p.8 Basic input rules ----------
ex('p8 4×sin30×(30+10×3) = 120', '4 × sin 30 ) × ( 30 + 10 × 3 ) =', '120');
ex('p8 implicit × before ( : 6÷2(1+2) = 6÷(2(1+2))', '6 ÷ 2 ( 1 + 2 ) =', '1');
ex('p8 implicit × before √: 2÷2√2 = 2÷(2√2)', '2 ÷ 2 √ 2 =', '√2/2');
ex('p9 (−2)² = 4', '( (−) 2 ) x² =', '4');
ex('p9 −2² = −4', '(−) 2 x² =', '-4');

// ---------- p.9 Natural textbook input ----------
ex('p9 3½ + 5 3/2 = 10', 'SHIFT ▭ 3 ▶ 1 ▶ 2 ▶ + SHIFT ▭ 5 ▶ 3 ▶ 2 =', '10');
test('p9 SHIFT ◀ jumps before the template', () => {
  const c = newCalc();
  press(c, 'SHIFT ▭ 3 ▶ 1 ▶ 2 SHIFT ◀');
  const ed = c.mode.cs.editor;
  assert.deepEqual([ed.path.length, ed.idx], [0, 0]);
});
test('p9 UNDO (ALPHA DEL) undoes and redoes the last operation', () => {
  const c = newCalc();
  press(c, '1 + 2 DEL');
  assert.equal(c.mode.cs.editor.root.length, 2);
  press(c, 'ALPHA DEL');
  assert.equal(c.mode.cs.editor.root.length, 3);
  press(c, 'ALPHA DEL');
  assert.equal(c.mode.cs.editor.root.length, 2);
});

// ---------- p.10 INS / toggling results ----------
test('p10 1+7/6 then INS √ makes 7/6 the argument of √', () => {
  const c = newCalc();
  press(c, '1 + 7 ▭ 6 ◀ ◀ ◀ ◀ SHIFT DEL √');
  const root = c.mode.cs.editor.root;
  assert.equal(root[2].t, 'sqrt');
  assert.equal(root[2].s[0][0].t, 'frac');
  press(c, '=');
  assert.equal(result(c), '(6+√42)/6'); // = 1+√(7/6)
});
test('p10 Line IO overwrite mode via INS', () => {
  const c = newCalc({ io: 'LL' });
  press(c, '1 2 3 ◀ ◀ SHIFT DEL 9');
  assert.equal(c.mode.cs.editor.root.map((t) => t.v).join(''), '193');
});
ex('p10 π÷6 = 1/6π (MathO)', 'SHIFT ×10x ÷ 6 =', '1/6π');
ex('p10 π÷6 S⇔D 0.5235987756', 'SHIFT ×10x ÷ 6 = S⇔D', '0.5235987756');
ex('p10 (√2+2)×√3 = 5.913591358 (MathI/DecimalO)', '( √ 2 ▶ + 2 ) × √ 3 =', '5.913591358', { io: 'MD' });
ex('p10 (√2+2)×√3 S⇔D √6+2√3', '( √ 2 ▶ + 2 ) × √ 3 = S⇔D', '√6+2√3', { io: 'MD' });
ex('p10 2/3 + 1½ = 13/6 (MathO)', '2 ▭ 3 ▶ + SHIFT ▭ 1 ▶ 1 ▼ 2 =', '13/6');
ex('p11 2/3 + 1½ = 13⌟6 (LineO)', '2 ▭ 3 + 1 ▭ 1 ▭ 2 =', '13⌟6', { io: 'LL' });
ex('p11 a b/c ⇔ d/c toggle', '2 ▭ 3 ▶ + SHIFT ▭ 1 ▶ 1 ▼ 2 = SHIFT S⇔D', '2 1/6');
ex('p11 mixing fraction and decimal gives a decimal (LineO)', '1 ▭ 2 + 0 . 3 =', '0.8', { io: 'LL' });

// ---------- p.11 Percent ----------
ex('p11 150×20% = 30', '150 × 20 SHIFT Ans =', '30');
ex('p11 660 is 75% of 880', '660 ÷ 880 SHIFT Ans =', '75');
ex('p11 discount 3500 by 25%', '3500 - 3500 × 25 SHIFT Ans =', '2625');

// ---------- p.11 Sexagesimal ----------
ex('p11 2°20\'30" + 0°9\'30" = 2°30\'0"', '2 DMS 20 DMS 30 DMS + 0 DMS 9 DMS 30 DMS =', '2°30\'0"');
ex('p11 2°30\'0" → 2.5', '2 DMS 20 DMS 30 DMS + 0 DMS 9 DMS 30 DMS = DMS', '2.5');
ex('p11 2.5 → 2°30\'0"', '2 DMS 20 DMS 30 DMS + 0 DMS 9 DMS 30 DMS = DMS DMS', '2°30\'0"');

// ---------- p.11 Multi-statements ----------
ex('p11 3+3:3×3 → 6', '3 + 3 : 3 × 3 =', '6');
ex('p11 3+3:3×3 → 9', '3 + 3 : 3 × 3 = =', '9');
test('p11 Disp indicator shown for intermediate result', () => {
  const c = newCalc();
  press(c, '3 + 3 : 3 × 3 =');
  assert.equal(c.render().Disp, true);
  press(c, '=');
  assert.ok(!c.render().Disp);
});

// ---------- p.11 Engineering notation ----------
ex('p11 1234 = 1234', '1234 =', '1234');
ex('p11 ENG → 1.234×10^3', '1234 = ENG', '1.234×10^3');
ex('p11 ENG ENG → 1234×10^0', '1234 = ENG ENG', '1234×10^0');
ex('p11 ← → 1.234×10^3', '1234 = ENG ENG SHIFT ENG', '1.234×10^3');
ex('p11 ← ← → 0.001234×10^6', '1234 = ENG ENG SHIFT ENG SHIFT ENG', '0.001234×10^6');

// ---------- p.12 Engineering symbols (Engineer Symbol: On) ----------
const ENGON = { engSym: true };
ex('p12 500k', '500 OPTN 3 6 =', '500k', ENGON);
test('p12 engineering symbol menu', () => {
  const c = newCalc(ENGON);
  press(c, '500 OPTN 3');
  assert.equal(c.top.pageItems().map((i) => i.label).join(' '), 'm μ n p f k M G T P E');
});
ex('p12 999k+25k = 1.024M', '999 OPTN 3 6 + 25 OPTN 3 6 =', '1.024M', ENGON);
ex('p12 ENG → 1024k', '999 OPTN 3 6 + 25 OPTN 3 6 = ENG', '1024k', ENGON);
ex('p12 ENG ENG → 1024000', '999 OPTN 3 6 + 25 OPTN 3 6 = ENG ENG', '1024000', ENGON);
ex('p12 ← → 1024k', '999 OPTN 3 6 + 25 OPTN 3 6 = ENG ENG SHIFT ENG', '1024k', ENGON);

// ---------- p.12 Prime factorization ----------
ex('p12 1014 = 1014', '1014 =', '1014');
ex('p12 FACT → 2×3×13²', '1014 = SHIFT DMS', '2×3×13^2');
ex('p12 FACT again re-displays', '1014 = SHIFT DMS SHIFT DMS', '1014');
ex('p12 large prime factor shown in parentheses', '1018081 × 2 = SHIFT DMS', '2×1009^2');
ex('p12 factor beyond range in parentheses', '2 × 1018091 = SHIFT DMS', '2×(1018091)');

// ---------- p.12 History & replay ----------
ex('p12 history: 2+2, 3+3, ▲ → 4', '2 + 2 = 3 + 3 = ▲', '4');
test('p12 history arrows indicators', () => {
  const c = newCalc();
  press(c, '2 + 2 = 3 + 3 =');
  assert.equal(c.render().up, true);
  press(c, '▲');
  assert.equal(c.render().down, true);
});
ex('p12 replay: 4×3+2 → 4×3−7 = 5', '4 × 3 + 2 = ◀ DEL DEL - 7 =', '5');

// ---------- p.13 Memories ----------
ex('p13 Ans: 14×13 ÷7 = 26', '14 × 13 = ÷ 7 =', '26');
ex('p13 789 − Ans = 210', '123 + 456 = 789 - Ans =', '210');
ex('p13 3+5 → A', '3 + 5 STO (−)', '8');
ex('p13 A×10 = 80', '3 + 5 STO (−) ALPHA (−) × 10 =', '80');
ex('p13 RECALL A = 8', '3 + 5 STO (−) AC SHIFT STO (−) =', '8');
ex('p13 clear A: 0 → A', '3 + 5 STO (−) 0 STO (−)', '0');
ex('p13 M: 0→M, +50, −15, RECALL M = 35', '0 STO M+ 10 × 5 M+ 10 + 5 SHIFT M+ SHIFT STO M+ =', '35');
test('p13 M indicator appears when M≠0', () => {
  const c = newCalc();
  press(c, '10 × 5 M+');
  assert.equal(c.render().M, true);
});
test('p14 RESET Memory (SHIFT 9 2 =) clears variables', () => {
  const c = newCalc();
  press(c, '5 STO (−) SHIFT 9 2 =');
  assert.ok(c.mem.vars.A.isZero());
});

// ---------- p.14-16 Function calculations ----------
ex('p14 sin 30° = 1/2', 'sin 30 ) =', '1/2');
ex('p14 π/2 radians = 90°', '( SHIFT ×10x ÷ 2 ) OPTN 2 2 =', '90');
ex('p14 e^5×2 (MathO)', 'SHIFT ln 5 ▶ × 2 =', '296.8263182');
ex('p14 e^5×2 (LineO)', 'SHIFT ln 5 ) × 2 =', '296.8263182', { io: 'LL' });
ex('p14 log1000 = 3', 'SHIFT (−) 1000 ) =', '3');
ex('p14 log2 16 = 4', 'SHIFT (−) 2 SHIFT ) 16 ) =', '4');
ex('p14 log▫▫ 2 16 = 4', 'log 2 ▶ 16 =', '4');
ex('p14 ln 90 = 4.49980967', 'ln 90 ) =', '4.49980967');
ex('p14 (1+1)^(2+2) = 16', '( 1 + 1 ) x^ 2 + 2 =', '16');
ex('p14 (5²)³ = 15625', '( 5 x² ) SHIFT x² =', '15625');
ex('p14 5th root of 32 (MathO)', 'SHIFT x^ 5 ▶ 32 =', '2');
ex('p15 5th root of 32 (LineO)', '5 SHIFT x^ 32 ) =', '2', { io: 'LL' });
ex('p15 √2×3 = 3√2 (MathO)', '√ 2 ▶ × 3 =', '3√2');
ex('p15 √2×3 = 4.242640687 (LineO)', '√ 2 ) × 3 =', '4.242640687', { io: 'LL' });
ex('p15 ∫1..e ln x dx = 1 (MathO)', '∫ ln ALPHA ) ) ▶ 1 ▶ ALPHA ×10x =', '1');
ex('p15 ∫1..e ln x dx = 1 (LineO)', '∫ ln ALPHA ) ) SHIFT ) 1 SHIFT ) ALPHA ×10x ) =', '1', { io: 'LL' });
ex('p15 d/dx sin x at π/2 = 0 (MathO)', 'SHIFT ∫ sin ALPHA ) ) ▶ ▭ SHIFT ×10x ▶ 2 =', '0', { unit: 'R' });
ex('p15 d/dx sin x at π/2 = 0 (LineO)', 'SHIFT ∫ sin ALPHA ) ) SHIFT ) SHIFT ×10x ▭ 2 ) =', '0', { unit: 'R', io: 'LL' });
ex('p16 Σ(x+1, 1, 5) = 20 (MathO)', 'SHIFT x ALPHA ) + 1 ▶ 1 ▶ 5 =', '20');
ex('p16 Σ(x+1, 1, 5) = 20 (LineO)', 'SHIFT x ALPHA ) + 1 SHIFT ) 1 SHIFT ) 5 ) =', '20', { io: 'LL' });
ex('p16 Pol(√2,√2) → r=2, θ=45', 'SHIFT + √ 2 ▶ SHIFT ) √ 2 ▶ ) =', '𝑟=2, θ=45');
ex('p16 Rec(√2,45°) → x=1, y=1', 'SHIFT - √ 2 ▶ SHIFT ) 45 ) =', '𝑥=1, 𝑦=1');
test('p16 Pol assigns r and θ to x and y', () => {
  const c = newCalc();
  press(c, 'SHIFT + √ 2 ▶ SHIFT ) √ 2 ▶ ) =');
  assert.equal(c.mem.vars.x.toNumber(), 2);
  assert.equal(c.mem.vars.y.toNumber(), 45);
});
ex('p16 (5+3)! = 40320', '( 5 + 3 ) SHIFT x-1 =', '40320');
ex('p16 |2−7|×2 = 10 (MathO)', 'SHIFT ( 2 - 7 ▶ × 2 =', '10');
ex('p16 |2−7|×2 = 10 (LineO)', 'SHIFT ( 2 - 7 ) × 2 =', '10', { io: 'LL' });
test('p16 1000Ran# gives a random 3-digit integer', () => {
  for (let i = 0; i < 5; i++) {
    const v = Number(run('1000 SHIFT . ='));
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 999);
  }
});
test('p16 RanInt#(1,6) is in 1..6', () => {
  for (let i = 0; i < 5; i++) {
    const v = Number(run('ALPHA . 1 SHIFT ) 6 ) ='));
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
  }
});
ex('p16 10P4 = 5040', '10 SHIFT × 4 =', '5040');
ex('p16 10C4 = 210', '10 SHIFT ÷ 4 =', '210');
ex('p17 Fix3: 10÷3×3 = 10.000', '10 ÷ 3 × 3 =', '10.000', { ...FIX3, io: 'MD' });
ex('p17 Fix3: Rnd(10÷3)×3 = 9.999', 'SHIFT 0 10 ÷ 3 ) × 3 =', '9.999', { ...FIX3, io: 'MD' });

// ---------- p.18 Complex ----------
const CMPLX = { mode: 'cmplx' };
ex('p18 (1+i)^4+(1−i)^2 = −4−2i', '( 1 + ENG ) x^ 4 ▶ + ( 1 - ENG ) x² =', '-4-2𝑖', CMPLX);
ex('p18 2∠45 = √2+√2i', '2 SHIFT ENG 45 =', '√2+√2𝑖', CMPLX);
ex('p18 √2+√2i = 2∠45 (r∠θ)', '√ 2 ▶ + √ 2 ▶ ENG =', '2∠45', { ...CMPLX, complex: 'polar' });
ex('p18 Conjg(2+3i) = 2−3i', 'OPTN 2 2 + 3 ENG ) =', '2-3𝑖', CMPLX);
ex('p18 Abs(1+i) = √2', 'SHIFT ( 1 + ENG =', '√2', CMPLX);
ex('p18 Arg(1+i) = 45', 'OPTN 1 1 + ENG ) =', '45', CMPLX);
ex('p18 ReP(2+3i) = 2', 'OPTN 3 2 + 3 ENG ) =', '2', CMPLX);
ex('p18 ImP(2+3i) = 3', 'OPTN 4 2 + 3 ENG ) =', '3', CMPLX);
ex('p18 ▶r∠θ', '√ 2 ▶ + √ 2 ▶ ENG OPTN ▼ 1 =', '2∠45', CMPLX);
ex('p18 ▶a+bi', '2 SHIFT ENG 45 OPTN ▼ 2 =', '√2+√2𝑖', CMPLX);
test('p18 complex indicators i / ∠', () => {
  const c = newCalc(CMPLX);
  assert.equal(c.render().cplx, 'i');
  c.setup.complex = 'polar';
  assert.equal(c.render().cplx, '∠');
});
ex('p18 Line IO shows a and bi on separate lines', '1 + 2 ENG =', '1 | +2𝑖', { ...CMPLX, io: 'LL' });

// ---------- p.19 CALC / SOLVE ----------
ex('p19 CALC 3A+B with A=5, B=10 → 25', '3 ALPHA (−) + ALPHA DMS CALC 5 = 10 = =', '25');
ex('p19 SOLVE x²+B=0, B=−2 → x=1.414213562', 'ALPHA ) x² + ALPHA DMS ALPHA CALC 0 SHIFT CALC 1 = (−) 2 = ▲ =', 'x=1.414213562, L-R=0');
test('p38 SOLVE without a variable → Variable ERROR', () => assert.equal(run('2 + 3 SHIFT CALC'), 'Variable ERROR'));

// ---------- p.20-23 Statistics ----------
const STAT = { mode: 'stat' };
const EX1 = '4 170 = 173 = 179 = ▼ ▶ 66 = 68 = 75 =';
ex('p21 Ex1 regression calc (log)', EX1 + ' OPTN 4', '𝑎=-852.1627746, 𝑏=178.6897969, 𝑟=0.9919863213', STAT);
ex('p21 1-variable calc screen values', '1 170 = 173 = 179 = OPTN 3',
  '𝑥̄=174, Σ𝑥=522, Σ𝑥²=90870, σ²𝑥=14, σ𝑥=3.741657387, s²𝑥=21, s𝑥=4.582575695, 𝑛=3, min(𝑥)=170, Q₁=170, Med=173, Q₃=179, max(𝑥)=179', STAT);
const EX2 = '1 1 = 2 = 3 = 4 = 5 = ▼ ▶ 1 = 2 = 3 = 2 = 1 = AC';
ex('p22 Ex2 mean with Freq = 3', EX2 + ' OPTN ▼ 2 1 =', '3', { ...STAT, statFreq: true });
const EX3 = '4 20 = 110 = 200 = 290 = ▼ ▶ 3150 = 7310 = 8800 = 9310 = AC';
ex('p22 Ex3 r = 0.998', EX3 + ' OPTN ▼ 4 3 =', '0.998', { ...STAT, ...FIX3 });
ex('p22 Ex3 a = −3857.984', EX3 + ' OPTN ▼ 4 1 =', '-3857.984', { ...STAT, ...FIX3 });
ex('p22 Ex3 b = 2357.532', EX3 + ' OPTN ▼ 4 2 =', '2357.532', { ...STAT, ...FIX3 });
ex('p22 Ex4 ŷ(160) = 8106.898', EX3 + ' 160 OPTN ▼ 4 5 =', '8106.898', { ...STAT, ...FIX3 });
ex('p23 Ex5 2▶t = −0.8660254038', EX2 + ' 2 OPTN ▼ 4 4 =', '-0.8660254038', { ...STAT, statFreq: true });
ex('p23 Ex5 P(Ans) = 0.19324', EX2 + ' 2 OPTN ▼ 4 4 = OPTN ▼ 4 1 Ans ) =', '0.19324', { ...STAT, statFreq: true });
test('p21 changing the Statistics setting clears data', () => {
  const c = newCalc(STAT);
  press(c, '1 5 = 6 =');
  assert.equal(c.mode.rows.length, 2);
  press(c, 'SHIFT MENU ▼ 3 1');
  assert.equal(c.mode.rows.length, 0);
});

// ---------- p.23-24 Base-N ----------
const BASEN = { mode: 'basen' };
ex('p23 11₂+1₂ = 100₂', 'log 11 + 1 =', '0000 0000 0000 0000 | 0000 0000 0000 0100', BASEN);
ex('p24 10₁₀+10₁₆+10₂+10₈ = 36', 'AC x² OPTN ▼ 1 10 + OPTN ▼ 2 10 + OPTN ▼ 3 10 + OPTN ▼ 4 10 =', '36', BASEN);
ex('p24 15×37 = 555', 'AC x² 15 × 37 =', '555', BASEN);
ex('p24 555 → hex 0000022B', 'AC x² 15 × 37 = x^', '0000022B', BASEN);
ex('p24 1010 and 1100 = 1000', 'log AC 1010 OPTN 3 1100 =', '0000 0000 0000 0000 | 0000 0000 0000 1000', BASEN);
ex('p24 Not(1010) = 1111…0101', 'log AC OPTN 2 1010 ) =', '1111 1111 1111 1111 | 1111 1111 1111 0101', BASEN);
ex('p23 hex digits A-F from the function keys', 'x^ (−) DMS + 1 =', '000000AC', BASEN);
ex('p23 overflow → Math ERROR', 'x² 2147483647 + 1 =', 'Math ERROR', BASEN);

// ---------- p.24-25 Equation/Func ----------
const EQN = { mode: 'eqn' };
ex('p25 x+2y=3, 2x+3y=4 → x=−1, y=2', '1 2 1 = 2 = 3 = 2 = 3 = 4 = =', '𝑥=-1, 𝑦=2', EQN);
ex('p25 x²+2x−2=0 → −1±√3, vertex (−1,−3)', '2 2 1 = 2 = (−) 2 = =', '𝑥₁=-1+√3, 𝑥₂=-1-√3, 𝑥=-1, 𝑦=-3', EQN);
ex('p24 2x²+x−3=0 → 1, −3/2', '2 2 2 = 1 = (−) 3 = =', '𝑥₁=1, 𝑥₂=-3/2, 𝑥=-1/4, 𝑦=-25/8', EQN);
ex('p25 No Solution message', '1 2 1 = 1 = 1 = 1 = 1 = 2 = =', 'No Solution', EQN);
ex('p25 Infinite Solution message', '1 2 1 = 1 = 1 = 2 = 2 = 2 = =', 'Infinite Solution', EQN);
ex('p25 cubic with rational roots', '2 3 1 = (−) 6 = 11 = (−) 6 = =', '𝑥₁=3, 𝑥₂=2, 𝑥₃=1', EQN);
ex('p7 Equation/Func Off hides complex roots', '2 2 1 = 0 = 1 = =', 'No Real Roots', { ...EQN, eqnComplex: false });
ex('p7 Equation/Func On shows complex roots', '2 2 1 = 0 = 1 = =', '𝑥₁=𝑖, 𝑥₂=-𝑖, 𝑥=0, 𝑦=1', EQN);

// ---------- p.25-27 Matrix ----------
const MAT = { mode: 'matrix' };
const DEF_AB = '1 2 2 2 = 1 = 1 = 1 = OPTN 1 2 2 3 1 = 0 = (−) 1 = 0 = (−) 1 = 1 = AC';
const DEF_AB22 = '1 2 2 2 = 1 = 1 = 1 = OPTN 1 2 2 2 2 = (−) 1 = (−) 1 = 2 = AC';
ex('p26 MatA×MatB', DEF_AB22 + ' OPTN 3 × OPTN 4 =', '[3,0;1,1]', MAT);
ex('p26 Det(MatA) = 1', DEF_AB + ' OPTN ▼ 2 OPTN 3 ) =', '1', MAT);
ex('p26 Identity(2)+MatA', DEF_AB + ' OPTN ▼ 4 2 ) + OPTN 3 =', '[3,1;1,2]', MAT);
ex('p27 Trn(MatB)', DEF_AB + ' OPTN ▼ 3 OPTN 4 ) =', '[1,0;0,-1;-1,1]', MAT);
ex('p27 MatA⁻¹', DEF_AB + ' OPTN 3 x-1 =', '[1,-1;-1,2]', MAT);
ex('p27 MatA²', DEF_AB + ' OPTN 3 x² =', '[5,3;3,2]', MAT);
ex('p27 MatA³', DEF_AB + ' OPTN 3 SHIFT x² =', '[13,8;8,5]', MAT);
ex('p27 Abs(MatB)', DEF_AB + ' SHIFT ( OPTN 4 ) =', '[1,0,1;0,1,1]', MAT);
ex('p26 MatAns then + continues the calculation', DEF_AB22 + ' OPTN 3 × OPTN 4 = + OPTN 3 =', '[5,1;2,2]', MAT);
ex('p38 Dimension ERROR for incompatible sizes', DEF_AB + ' OPTN 3 + OPTN 4 =', 'Dimension ERROR', MAT);
test('p26 copying a matrix with STO', () => {
  const c = newCalc(MAT);
  press(c, '1 2 2 2 = 1 = 1 = 1 = STO sin');
  assert.equal(c.mem.mats.D.a[0][0].toNumber(), 2);
});

// ---------- p.27-28 Table ----------
ex('p27 table of x²+1/2 and x²−1/2', 'ALPHA ) x² + 1 ▭ 2 = ALPHA ) x² - 1 ▭ 2 = (−) 1 = 1 = 0.5 = =',
  '-1:1.5:0.5, -0.5:0.75:-0.25, 0:0.5:-0.5, 0.5:0.75:-0.25, 1:1.5:0.5', { mode: 'table' });
ex('p28 Range ERROR when too many rows', 'ALPHA ) = = 1 = 100 = 1 = =', 'Range ERROR', { mode: 'table' });
test('p28 + adds the step to the cell above', () => {
  const c = newCalc({ mode: 'table' });
  press(c, 'ALPHA ) x² = = 1 = 3 = 1 = = ▼ ▼ ▼ +');
  assert.equal(c.mode.rows.length, 4);
  assert.equal(c.mode.rows[3].x.toNumber(), 4);
  assert.equal(c.mode.rows[3].f.toNumber(), 16);
});

// ---------- p.28-29 Vector ----------
const VCT = { mode: 'vector' };
const DEF_V = '1 2 1 = 2 = OPTN 1 2 2 3 = 4 = OPTN 1 3 3 2 = (−) 1 = 2 = AC';
ex('p28 VctA+VctB', DEF_V + ' OPTN 3 + OPTN 4 =', '[4;6]', VCT);
ex('p29 VctA•VctB = 11', DEF_V + ' OPTN 3 OPTN ▼ 2 OPTN 4 =', '11', VCT);
ex('p29 VctA×VctB', DEF_V + ' OPTN 3 × OPTN 4 =', '[0;0;-2]', VCT);
ex('p29 Abs(VctC) = 3', DEF_V + ' SHIFT ( OPTN 5 ) =', '3', VCT);
ex('p29 Angle(VctA,VctB) = 10.305 (Fix 3)', DEF_V + ' OPTN ▼ 3 OPTN 3 SHIFT ) OPTN 4 ) =', '10.305', { ...VCT, ...FIX3 });
ex('p29 UnitV(VctB)', DEF_V + ' OPTN ▼ 4 OPTN 4 ) =', '[0.6;0.8]', VCT);

// ---------- p.29-30 Inequality ----------
const INEQ = { mode: 'ineq' };
ex('p30 3x³+3x²−x>0 (MathO)', '3 1 3 = 3 = (−) 1 = 0 = =', '(-3-√21)/6<𝑥<0, (-3+√21)/6<𝑥', INEQ);
test('p30 3x³+3x²−x>0 (other IO: a<x<b, c<x)', () => {
  const c = newCalc({ ...INEQ, io: 'MD' });
  press(c, '3 1 3 = 3 = (−) 1 = 0 = =');
  const s = c.mode.sol;
  assert.equal(s.parts.length, 2);
  assert.equal(s.parts[0].lo.d.round(10).toString(), '-1.263762616');
  assert.ok(s.parts[0].hi.isZero());
  assert.equal(s.parts[1].lo.d.round(10).toString(), '0.2637626158');
});
ex('p30 x²≥0 → All Real Numbers', '2 3 1 = 0 = 0 = =', 'All Real Numbers', INEQ);
ex('p30 x²<0 → No Solution', '2 2 1 = 0 = 0 = =', 'No Solution', INEQ);
ex('p29 x²+2x−3<0 → −3<x<1', '2 2 1 = 2 = (−) 3 = =', '-3<𝑥<1', INEQ);

// ---------- p.30 Ratio ----------
ex('p30 1:2 = X:10 → X=5', '1 1 = 2 = 10 = =', '5', { mode: 'ratio' });
ex('p30 3:8 = X:12 → X=9/2', '1 3 = 8 = 12 = =', '9/2', { mode: 'ratio' });
ex('p30 A:B=C:X', '2 1 = 2 = 3 = =', '6', { mode: 'ratio' });
ex('p30 0 coefficient → Math ERROR', '1 0 = 2 = 10 = =', 'Math ERROR', { mode: 'ratio' });

// ---------- p.31-33 Distribution ----------
const DIST = { mode: 'dist' };
ex('p32 Normal PD x=36 σ=2 μ=35', '1 36 = 2 = 35 = =', '0.1760326634', DIST);
ex('p32 Binomial PD list N=15 p=0.6', '4 1 10 = 11 = 12 = 13 = = 15 = 0.6 = =', '0.1859378448, 0.1267758032, 0.06338790162, 0.02194196595', DIST);
ex('p31 Normal CD −1..1 σ=1 μ=0', '2 (−) 1 = 1 = 1 = 0 = =', '0.6826894921', DIST);
ex('p31 Inverse Normal area 0.5', '3 0.5 = 1 = 0 = =', '0', DIST);
ex('p31 Poisson PD x=2 λ=3 (variable)', '▼ 2 2 2 = 3 = =', '0.2240418077', DIST);
ex('p31 Binomial CD x=2 N=5 p=0.5 (variable)', '▼ 1 2 2 = 5 = 0.5 = =', '0.5', DIST);

// ---------- p.33-36 Spreadsheet ----------
const SHEET = { mode: 'sheet' };
const SEX1 = '7 × 5 = 7 × 6 = ALPHA (−) 2 + 7 = ▲ ▲ ▲ ▶ ALPHA CALC ALPHA (−) 1 + 7 =';
ex('p33 Ex1 constants and =A1+7', SEX1, '35,42,,;42,,,;49,,,;,,,;,,,;,,,', SHEET);
ex('p34 Ex2 Grab =A2+7', SEX1 + ' ALPHA CALC OPTN 2 ◀ = + 7 =', '35,42,,;42,49,,;49,,,;,,,;,,,;,,,', SHEET);
ex('p35 Ex3 =Sum(A1:A3)', SEX1 + ' ◀ ▼ ▼ ALPHA CALC OPTN ▼ 4 ALPHA (−) 1 : ALPHA (−) 3 ) =', '35,42,,;42,,,;49,,,;126,,,;,,,;,,,', SHEET);
ex('p36 Ex4 Fill Formula =2A1−3 into B1:B3', SEX1 + ' ▲ OPTN 1 2 ALPHA (−) 1 - 3 = ▶ ▶ ▶ ▶ ▶ ▶ DEL 3 = =', '35,67,,;42,81,,;49,95,,;,,,;,,,;,,,', SHEET);
ex('p36 Ex5 Fill Value B1×3 into C1:C3', SEX1 + ' ▲ OPTN 1 2 ALPHA (−) 1 - 3 = ▶ ▶ ▶ ▶ ▶ ▶ DEL 3 = = ▶ OPTN 2 ALPHA DMS 1 × 3 = ▶ ▶ ▶ ▶ ▶ ▶ DEL 3 = =',
  '35,67,201,;42,81,243,;49,95,285,;,,,;,,,;,,,', SHEET);
ex('p39 Circular ERROR', 'ALPHA CALC ALPHA (−) 1 =', 'Circular ERROR', SHEET);
test('p35 copy & paste adjusts relative references', () => {
  const c = newCalc(SHEET);
  press(c, SEX1 + ' ▲ OPTN ▼ 2 ▶ ▼ ▼ =');
  // =A1+7 from B1 pasted into C3 becomes =B3+7
  assert.equal(c.mode.cells.get('2,2').items.map((t) => t.v).join(''), 'vB3+7');
});
test('p33 contents cleared by ON', () => {
  const c = newCalc(SHEET);
  press(c, '5 = ON');
  assert.equal(c.mode.cells.size, 0);
});

// ---------- p.37 Constants & conversion ----------
ex('p37 c0 = 299792458', 'AC SHIFT 7 1 3 =', '299792458');
ex('p37 5 cm▶in = 1.968503937 (LineIO)', 'AC 5 SHIFT 8 1 2 =', '1.968503937', { io: 'LL' });
ex('p44 °F▶°C', '212 SHIFT 8 ▼ ▼ 1 1 =', '100');

// ---------- p.37-38 Errors ----------
test('p37 error ◀/▶ returns to the expression with the cursor at the error', () => {
  const c = newCalc();
  press(c, '1 ÷ 0 + 5 =');
  assert.equal(result(c), 'Math ERROR');
  press(c, '◀');
  assert.equal(c.mode.cs.state, 'input');
  assert.equal(c.mode.cs.editor.root.length, 5);
});
test('p37 AC on error clears the calculation', () => {
  const c = newCalc();
  press(c, '1 ÷ 0 = AC');
  assert.equal(c.mode.cs.editor.root.length, 0);
});
ex('p38 Syntax ERROR', '1 + × 2 =', 'Syntax ERROR');
ex('p38 Math ERROR for out of range', '10 x^ 100 =', 'Math ERROR');

// ---------- p.42-43 FAQ ----------
ex('p43 (sin 30)+15 = 15.5 (LineIO)', 'sin 30 ) + 15 =', '15.5', { io: 'LL' });
ex('p43 sin(30+15 = 0.7071067812 (LineIO)', 'sin 30 + 15 =', '0.7071067812', { io: 'LL' });
