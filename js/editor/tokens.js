// Token table shared by the editor, renderer and parser.
// s  : display text (LCD font characters; superscript/subscript unicode
//      characters are drawn in the small font raised/lowered)
// ls : display text in Line IO when different
// k  : parser kind
//   num   digit / point / exponent marker
//   op    binary operator           (p = priority group from the manual)
//   pre   prefix function with "(" (argument closed by ")")
//   post  postfix operator
//   val   operand (variable, constant, Ans...)
//   lp/rp/comma/colon/eq  structural
//   neg   negative sign
// b  : bytes used (input capacity)
export const T = {};

function def(id, s, k, extra = {}) {
  T[id] = { id, s, k, b: extra.b || (s.length > 1 && k !== 'num' ? 2 : 1), ...extra };
}

for (const d of '0123456789') def(d, d, 'num');
def('.', '.', 'num');
def('E', '×₁₀', 'num', { ls: '×₁₀' }); // exponent marker of ×10^x key; following digits raised
// hex digits (Base-N) - drawn as plain letters
for (const h of 'ABCDEF') def('h' + h, h, 'num', { hex: true });

def('+', '+', 'op', { p: 11 });
def('-', '−', 'op', { p: 11 });
def('×', '×', 'op', { p: 10 });
def('÷', '÷', 'op', { p: 10 });
def('nPr', 'P', 'op', { p: 8, sym: true });
def('nCr', 'C', 'op', { p: 8, sym: true });
def('∠', '∠', 'op', { p: 8 });
def('•', '•', 'op', { p: 9 });
def('and', ' and ', 'op', { p: 12 });
def('or', ' or ', 'op', { p: 13 });
def('xor', ' xor ', 'op', { p: 13 });
def('xnor', ' xnor ', 'op', { p: 13 });
def('xrt', 'ˣ√(', 'op', { p: 3, opens: true }); // Line IO  a x√( b )
def('^', '^(', 'op', { p: 3, opens: true }); // Line IO power

def('neg', '−', 'neg', { p: 5 });
def('(', '(', 'lp');
def(')', ')', 'rp');
def(',', ',', 'comma');
def(':', ':', 'colon');
def('=', '=', 'eq');
def('$', '$', 'dollar');
def('⌟', '⌟', 'op', { p: 4 }); // Line IO fraction separator

// variables / values
for (const v of ['A', 'B', 'C', 'D', 'E', 'F', 'M']) def('v' + v, v, 'val', { var: v });
def('vx', '𝑥', 'val', { var: 'x' });
def('vy', '𝑦', 'val', { var: 'y' });
def('Ans', 'Ans', 'val', { b: 1 });
def('π', 'π', 'val');
def('e', '𝑒', 'val');
def('i', '𝑖', 'val');
def('Ran#', 'Ran#', 'val');
for (const m of ['A', 'B', 'C', 'D']) {
  def('Mat' + m, 'Mat' + m, 'val', { mat: m });
  def('Vct' + m, 'Vct' + m, 'val', { vct: m });
}
def('MatAns', 'MatAns', 'val', { mat: 'Ans' });
def('VctAns', 'VctAns', 'val', { vct: 'Ans' });

// prefix functions (argument in parentheses)
const PRE = {
  'sin(': 'sin(', 'cos(': 'cos(', 'tan(': 'tan(',
  'asin(': 'sin⁻¹(', 'acos(': 'cos⁻¹(', 'atan(': 'tan⁻¹(',
  'sinh(': 'sinh(', 'cosh(': 'cosh(', 'tanh(': 'tanh(',
  'asinh(': 'sinh⁻¹(', 'acosh(': 'cosh⁻¹(', 'atanh(': 'tanh⁻¹(',
  'log(': 'log(', 'ln(': 'ln(', 'sqrt(': '√(', 'cbrt(': '³√(', 'Abs(': 'Abs(',
  'pow10(': '10^(', 'exp(': '𝑒^(',
  'Pol(': 'Pol(', 'Rec(': 'Rec(', 'Rnd(': 'Rnd(', 'RanInt(': 'RanInt#(',
  'int(': '∫(', 'diff(': 'd/d𝑥(', 'sum(': 'Σ(',
  'Arg(': 'Arg(', 'Conjg(': 'Conjg(', 'ReP(': 'ReP(', 'ImP(': 'ImP(',
  'Not(': 'Not(', 'Neg(': 'Neg(',
  'Det(': 'Det(', 'Trn(': 'Trn(', 'Identity(': 'Identity(',
  'Angle(': 'Angle(', 'UnitV(': 'UnitV(',
  'P(': 'P(', 'Q(': 'Q(', 'R(': 'R(',
  'Min(': 'Min(', 'Max(': 'Max(', 'Mean(': 'Mean(', 'Sum(': 'Sum(',
};
for (const [id, s] of Object.entries(PRE)) def(id, s, 'pre', { b: 2 });

// postfix
def('²', '²', 'post', { p: 3 });
def('³', '³', 'post', { p: 3 });
def('⁻¹', '⁻¹', 'post', { p: 3 });
def('!', '!', 'post', { p: 3 });
def('%', '%', 'post', { p: 3 });
def('dms', '°', 'post', { p: 3 }); // sexagesimal input marker
def('°', '°', 'post', { p: 3, ang: 'D' });
def('ʳ', 'ʳ', 'post', { p: 3, ang: 'R' });
def('ᵍ', 'ᵍ', 'post', { p: 3, ang: 'G' });
def('▶t', '▶t', 'post', { p: 3 });
def('x̂', '𝑥̂', 'post', { p: 6 });
def('ŷ', '𝑦̂', 'post', { p: 6 });
def('x̂1', '𝑥̂₁', 'post', { p: 6 });
def('x̂2', '𝑥̂₂', 'post', { p: 6 });
def('▶r∠θ', '▶𝑟∠θ', 'post', { p: 14 });
def('▶a+bi', '▶𝑎+𝑏𝑖', 'post', { p: 14 });

// engineering symbols (postfix, priority 3)
export const ENG_SYMBOLS = [
  ['m', -3], ['μ', -6], ['n', -9], ['p', -12], ['f', -15],
  ['k', 3], ['M', 6], ['G', 9], ['T', 12], ['P', 15], ['E', 18],
];
for (const [s, e] of ENG_SYMBOLS) def('eng' + s, s, 'post', { p: 3, eng: e, b: 1 });

// base-n prefixes
for (const [c, base] of [['d', 10], ['h', 16], ['b', 2], ['o', 8]]) def('bp' + c, c, 'neg', { p: 5, base });

// statistics variables (operands)
const STATV = {
  sx: 'Σ𝑥', sx2: 'Σ𝑥²', sy: 'Σ𝑦', sy2: 'Σ𝑦²', sxy: 'Σ𝑥𝑦', sx3: 'Σ𝑥³', sx2y: 'Σ𝑥²𝑦', sx4: 'Σ𝑥⁴',
  n: '𝑛', xbar: '𝑥̄', s2x: 'σ²𝑥', sigx: 'σ𝑥', ss2x: 's²𝑥', ssx: 's𝑥',
  ybar: '𝑦̄', s2y: 'σ²𝑦', sigy: 'σ𝑦', ss2y: 's²𝑦', ssy: 's𝑦',
  minx: 'min(𝑥)', maxx: 'max(𝑥)', miny: 'min(𝑦)', maxy: 'max(𝑦)',
  Q1: 'Q₁', Med: 'Med', Q3: 'Q₃',
  ra: '𝑎', rb: '𝑏', rc: '𝑐', rr: '𝑟',
};
for (const [id, s] of Object.entries(STATV)) def('st:' + id, s, 'val', { stat: id, b: 2 });

// display text of a template in Line IO is given by its line-IO token
export const TEMPLATE_LINE = {
  frac: null, mixed: null,
  sqrt: 'sqrt(', cbrt: 'cbrt(', root: 'xrt', pow: '^', pow10: 'pow10(', exp: 'exp(',
  logb: 'log(', abs: 'Abs(', integ: 'int(', diff: 'diff(', sum: 'sum(',
};

// number of slots of templates
export const TEMPLATE_SLOTS = {
  frac: 2, mixed: 3, sqrt: 1, cbrt: 1, root: 2, pow: 1, pow10: 1, exp: 1,
  logb: 2, abs: 1, integ: 3, diff: 2, sum: 3,
};

export function tokenText(id, line = false) {
  const t = T[id];
  if (!t) return id;
  return (line && t.ls) || t.s;
}

export function defineDynamic(id, s, k, extra) {
  if (!T[id]) def(id, s, k, extra);
  return T[id];
}
