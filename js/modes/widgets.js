// Small building blocks shared by the editor-style modes (matrix, vector,
// statistics, distribution, spreadsheet, table, equation, inequality, ratio).
import { Editor } from '../editor/editor.js';
import { parseStatement } from '../engine/parser.js';
import { evaluate, runSync } from '../engine/evaluator.js';
import { CalcError, asCalcError } from '../engine/errors.js';
import { formatValueLines, decParts } from '../engine/format.js';
import { Real } from '../engine/real.js';
import { Complex } from '../engine/complex.js';
import { drawExpr, drawResult } from './calcscreen.js';
import { textWidth } from '../ui/bitmap.js';
import { toPlainLcd } from '../calc.js';

// A value being typed into a cell / field. Handles editing keys; eval() returns the value.
export class ValueInput {
  constructor(calc, opts = {}) {
    this.calc = calc;
    this.line = opts.line !== undefined ? opts.line : !calc.isMathIn();
    this.ed = new Editor(this.line);
    this.scroll = 0;
    this.maxBytes = opts.maxBytes || null;
  }
  isEmpty() { return this.ed.isEmpty(); }
  // returns true if the action was an editing action
  key(action) {
    const ed = this.ed;
    if (action.startsWith('t:')) {
      if (this.maxBytes && ed.bytes() >= this.maxBytes) return true;
      ed.insertToken(action.slice(2));
      return true;
    }
    if (action.startsWith('p:')) { ed.insertTemplate(action.slice(2)); return true; }
    switch (action) {
      case 'LEFT': ed.left(); return true;
      case 'RIGHT': ed.right(); return true;
      case 'SLEFT': ed.jumpOut(false); return true;
      case 'SRIGHT': ed.jumpOut(true); return true;
      case 'DEL': ed.del(); return true;
      case 'INS': ed.toggleIns(); return true;
      case 'UNDO': ed.undo(); return true;
      case 'DMS': ed.insertToken('dms'); return true;
      default: return false;
    }
  }
  eval(ctxExtra = {}, parseOpts = {}) {
    const node = parseStatement(this.ed.root, parseOpts);
    if (node.k === 'eq') throw new CalcError('Syntax');
    const ctx = this.calc.ctx(ctxExtra);
    return runSync(evaluate(node, ctx));
  }
  evalReal(ctxExtra, parseOpts) {
    const v = this.eval(ctxExtra, parseOpts);
    if (v instanceof Real) return v;
    if (v instanceof Complex && v.im.isZero()) return v.re;
    throw new CalcError('Math');
  }
  draw(bm, y = 48, x = 0, width = 192) {
    const r = drawExpr(bm, this.ed.root, {
      x, y, width, line: this.line, cursor: { path: this.ed.path, idx: this.ed.idx },
      showCursor: this.calc.blink, scroll: this.scroll, clipTop: y - 1, clipBottom: 62, arrows: true,
      cursorShape: this.ed.line && !this.ed.insertMode ? 'under' : 'bar',
    });
    this.scroll = r.scroll;
  }
}

// compact text for a value inside a grid cell of `width` pixels (small font)
export function cellText(v, width, calc, opts = {}) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const fit = (s) => textWidth(s, 'S') <= width;
  let r = v;
  if (r instanceof Complex) r = r.re;
  if (!(r instanceof Real)) return '?';
  if (opts.exact !== false) {
    try {
      const st = { ...calc.fmt(), io: 'LL', engSym: false, mixed: false };
      const s = toPlainLcd(formatValueLines(r, st)[0]);
      if (fit(s)) return s;
    } catch (e) { /* fall through */ }
  }
  for (let digits = 10; digits >= 1; digits--) {
    const pp = decParts(r.d.round(digits), { type: 'Norm', n: 1 });
    const s = (pp.neg ? '-' : '') + pp.mant + (pp.exp !== null ? 'E' + pp.exp : '');
    if (fit(s)) return s;
  }
  return '…';
}

// value -> one line of items for the bottom value line
export function valueItems(v, calc, io) {
  const st = { ...calc.fmt() };
  if (io) st.io = io;
  try { return formatValueLines(v, st)[0]; } catch (e) { return [{ t: 'x', s: '?' }]; }
}

export function drawValueLine(bm, v, calc, y = 62) {
  drawResult(bm, valueItems(v, calc), y);
}

export function evalError(e) { return asCalcError(e); }

export { drawExpr, drawResult };
