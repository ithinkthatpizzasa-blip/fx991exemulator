// Physical keys -> actions. n: normal, s: SHIFT, a: ALPHA,
// b: Base-N mode (blue legends), cn/cs: Complex mode normal/SHIFT (purple legends).
// Action prefixes: 't:' insert token, 'p:' insert template (Math IO) / its
// linear equivalent (Line IO); other actions are commands.
export const KEYMAP = {
  shift: { n: 'SHIFT' },
  alpha: { n: 'ALPHA' },
  up: { n: 'UP' },
  down: { n: 'DOWN' },
  left: { n: 'LEFT', s: 'SLEFT' },
  right: { n: 'RIGHT', s: 'SRIGHT' },
  menu: { n: 'MENU', s: 'SETUP' },
  on: { n: 'ON' },
  optn: { n: 'OPTN', s: 'QR' },
  calc: { n: 'CALC', s: 'SOLVE', a: 't:=' },
  integ: { n: 'p:integ', s: 'p:diff', a: 't::' },
  xvar: { n: 't:vx', s: 'p:sum' },
  frac: { n: 'p:frac', s: 'p:mixed' },
  sqrt: { n: 'p:sqrt', s: 'p:cbrt' },
  sq: { n: 't:²', s: 't:³', b: 'BASE:10' },
  pow: { n: 'p:pow', s: 'p:root', b: 'BASE:16' },
  log: { n: 'p:logb', s: 'p:pow10', b: 'BASE:2' },
  ln: { n: 't:ln(', s: 'p:exp', b: 'BASE:8' },
  neg: { n: 't:neg', s: 't:log(', a: 't:vA', b: 't:hA' },
  dms: { n: 'DMS', s: 'FACT', a: 't:vB', b: 't:hB' },
  inv: { n: 't:⁻¹', s: 't:!', a: 't:vC', b: 't:hC' },
  sin: { n: 't:sin(', s: 't:asin(', a: 't:vD', b: 't:hD' },
  cos: { n: 't:cos(', s: 't:acos(', a: 't:vE', b: 't:hE' },
  tan: { n: 't:tan(', s: 't:atan(', a: 't:vF', b: 't:hF' },
  sto: { n: 'STO', s: 'RECALL' },
  eng: { n: 'ENG', s: 'ENGL', cn: 't:i', cs: 't:∠' },
  lpar: { n: 't:(', s: 'p:abs' },
  rpar: { n: 't:)', s: 't:,', a: 't:vx' },
  sd: { n: 'SD', s: 'MIXED', a: 't:vy' },
  mplus: { n: 'M+', s: 'M-', a: 't:vM' },
  k7: { n: 't:7', s: 'CONST' },
  k8: { n: 't:8', s: 'CONV' },
  k9: { n: 't:9', s: 'RESET' },
  del: { n: 'DEL', s: 'INS', a: 'UNDO' },
  ac: { n: 'AC', s: 'OFF' },
  k4: { n: 't:4' },
  k5: { n: 't:5' },
  k6: { n: 't:6' },
  mul: { n: 't:×', s: 't:nPr' },
  div: { n: 't:÷', s: 't:nCr' },
  k1: { n: 't:1' },
  k2: { n: 't:2' },
  k3: { n: 't:3' },
  add: { n: 't:+', s: 't:Pol(' },
  sub: { n: 't:-', s: 't:Rec(' },
  k0: { n: 't:0', s: 't:Rnd(' },
  dot: { n: 't:.', s: 't:Ran#', a: 't:RanInt(' },
  exp: { n: 't:E', s: 't:π', a: 't:e' },
  ans: { n: 't:Ans', s: 't:%' },
  eq: { n: 'EQ', s: 'APPROX' },
};

// menu item selection keys: 1..9, A..F (keys carrying the red letters), M, x
export const MENU_KEYS = {
  k1: '1', k2: '2', k3: '3', k4: '4', k5: '5', k6: '6', k7: '7', k8: '8', k9: '9',
  neg: 'A', dms: 'B', inv: 'C', sin: 'D', cos: 'E', tan: 'F', mplus: 'M', xvar: 'x', rpar: 'x', k0: '0',
};
export const MENU_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'M', 'x'];

// variable keys after STO / RECALL
export const VAR_KEYS = { neg: 'A', dms: 'B', inv: 'C', sin: 'D', cos: 'E', tan: 'F', mplus: 'M', rpar: 'x', xvar: 'x', sd: 'y' };
export const MAT_KEYS = { neg: 'A', dms: 'B', inv: 'C', sin: 'D' };

export function resolve(key, shift, alpha, mode) {
  const k = KEYMAP[key];
  if (!k) return null;
  if (mode === 'basen' && k.b && !shift && !alpha) return k.b;
  if (mode === 'cmplx') {
    if (shift && k.cs) return k.cs;
    if (!shift && !alpha && k.cn) return k.cn;
  }
  if (shift) return k.s || null;
  if (alpha) return k.a || null;
  return k.n;
}
