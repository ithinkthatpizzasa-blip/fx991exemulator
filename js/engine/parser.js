// Parser: editor items -> AST, following the manual's "Calculation Priority
// Sequence" (13 levels). Implicit multiplication (level 7) binds tighter than
// x and /, so 6/2(1+2) = 6/(2(1+2)) and 2/2sqrt2 = 2/(2sqrt2) as the manual says.
import { T } from '../editor/tokens.js';
import { Real } from './real.js';
import { CalcError } from './errors.js';

const syn = (ref) => new CalcError('Syntax', ref);

// --- flatten items into tokens (templates become atoms) ---
function flatten(items, opts) {
  const out = [];
  for (const it of items) {
    if (it.t === 'c') {
      const t = T[it.v];
      out.push({ k: t ? t.k : 'val', id: it.v, ref: it });
    } else if (it.t === 'pow') {
      out.push({ k: 'powpost', ref: it, exp: it.s[0] });
    } else {
      out.push({ k: 'atom', tpl: it.t, slots: it.s, ref: it });
    }
  }
  return out;
}

class P {
  constructor(items, opts = {}) {
    this.opts = opts;
    this.toks = flatten(items, opts);
    this.i = 0;
    this.last = items.length ? items[items.length - 1] : null;
  }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  eof() { return this.i >= this.toks.length; }
  errAt(t) { return syn(t ? t.ref : this.last); }

  // full expression incl. level-14 output-format commands
  expr() {
    let a = this.or();
    while (!this.eof() && this.peek().k === 'post' && T[this.peek().id].p === 14) {
      const t = this.next();
      a = { k: 'post', op: t.id, a, ref: t.ref };
    }
    return a;
  }
  or() {
    let a = this.and();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.id === 'or' || t.id === 'xor' || t.id === 'xnor')) {
        this.next();
        a = { k: 'bin', op: t.id, a, b: this.and(), ref: t.ref };
      } else return a;
    }
  }
  and() {
    let a = this.add();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && t.id === 'and') { this.next(); a = { k: 'bin', op: 'and', a, b: this.add(), ref: t.ref }; } else return a;
    }
  }
  add() {
    let a = this.mul();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.id === '+' || t.id === '-')) { this.next(); a = { k: 'bin', op: t.id, a, b: this.mul(), ref: t.ref }; } else return a;
    }
  }
  mul() {
    let a = this.dot();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.id === '×' || t.id === '÷')) { this.next(); a = { k: 'bin', op: t.id, a, b: this.dot(), ref: t.ref }; } else return a;
    }
  }
  dot() {
    let a = this.p8();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && t.id === '•') { this.next(); a = { k: 'bin', op: '•', a, b: this.p8(), ref: t.ref }; } else return a;
    }
  }
  p8() {
    let a = this.implicit();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.id === 'nPr' || t.id === 'nCr' || t.id === '∠')) { this.next(); a = { k: 'bin', op: t.id, a, b: this.implicit(), ref: t.ref }; } else return a;
    }
  }
  startsValue(t) {
    if (!t) return false;
    return t.k === 'lp' || t.k === 'pre' || t.k === 'val' || t.k === 'atom' || t.k === 'num' || t.k === 'dollar' ||
      (t.k === 'neg' && T[t.id] && T[t.id].base && this.opts.baseN);
  }
  implicit() {
    let a = this.p6();
    while (this.startsValue(this.peek())) {
      const t = this.peek();
      if (t.k === 'num') throw syn(t.ref);
      const b = this.p6();
      a = { k: 'bin', op: 'imul', a, b, ref: t.ref };
    }
    return a;
  }
  p6() {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'post' && T[t.id].p === 6) { this.next(); a = { k: 'post', op: t.id, a, ref: t.ref }; } else return a;
    }
  }
  unary() {
    const t = this.peek();
    if (t && t.k === 'neg') {
      this.next();
      const tt = T[t.id];
      if (tt.base) {
        // base-n prefix applies to the following literal
        const save = this.opts.forceBase;
        this.opts.forceBase = tt.base;
        const a = this.unary();
        this.opts.forceBase = save;
        return { k: 'based', base: tt.base, a, ref: t.ref };
      }
      return { k: 'neg', a: this.unary(), ref: t.ref };
    }
    return this.frac();
  }
  frac() {
    const a = this.postfix();
    const t = this.peek();
    if (t && t.id === '⌟') {
      this.next();
      const b = this.postfix();
      const t2 = this.peek();
      if (t2 && t2.id === '⌟') {
        this.next();
        const c = this.postfix();
        return { k: 'mixed', i: a, n: b, d: c, ref: t.ref };
      }
      return { k: 'frac', a, b, ref: t.ref };
    }
    return a;
  }
  postfix() {
    let a = this.primary();
    for (;;) {
      const t = this.peek();
      if (!t) return a;
      if (t.k === 'post' && T[t.id].p === 3) {
        this.next();
        if (t.id === 'dms') { a = this.dmsTail(a, t); continue; }
        a = { k: 'post', op: t.id, a, ref: t.ref };
        continue;
      }
      if (t.k === 'powpost') {
        this.next();
        if (!t.exp.length) throw syn(t.ref);
        const b = sub(t.exp, this.opts);
        a = { k: 'pow', a, b, ref: t.ref };
        continue;
      }
      if (t.k === 'op' && (t.id === '^' || t.id === 'xrt')) {
        this.next();
        const b = this.expr();
        this.closeParen();
        a = t.id === '^' ? { k: 'pow', a, b, ref: t.ref } : { k: 'root', n: a, a: b, ref: t.ref };
        continue;
      }
      return a;
    }
  }
  dmsTail(a, t) {
    // d° [m° [s°]]
    const parts = [a];
    for (let j = 0; j < 2; j++) {
      const save = this.i;
      const n = this.peek();
      if (n && n.k === 'num') {
        const lit = this.number();
        const m = this.peek();
        if (m && m.k === 'post' && m.id === 'dms') { this.next(); parts.push(lit); continue; }
        this.i = save;
      }
      break;
    }
    return { k: 'dms', parts, ref: t.ref };
  }
  closeParen() {
    const t = this.peek();
    if (!t) return; // auto-close at end
    if (t.k === 'rp') { this.next(); return; }
    throw syn(t.ref);
  }
  number() {
    const start = this.peek();
    let s = '', seenDot = false, seenE = false, expDigits = 0;
    const base = this.opts.forceBase || this.opts.baseN;
    let last = start;
    while (!this.eof()) {
      const t = this.peek();
      if (t.k !== 'num') {
        if (seenE && expDigits === 0 && t.k === 'neg' && !T[t.id].base && s.endsWith('e')) { this.next(); s += '-'; last = t; continue; }
        break;
      }
      this.next();
      last = t;
      if (t.id === '.') {
        if (seenDot || seenE || base) throw syn(t.ref);
        seenDot = true;
        s += '.';
      } else if (t.id === 'E') {
        if (seenE || base) throw syn(t.ref);
        seenE = true;
        if (s === '' || s === '.') s = '1';
        s += 'e';
      } else {
        const d = T[t.id].hex ? t.id.slice(1) : t.id;
        if (seenE) expDigits++;
        s += d;
      }
    }
    if (seenE && expDigits === 0) throw syn(last.ref);
    if (base) {
      return { k: 'int', s, base, ref: start.ref };
    }
    if (/[A-F]/.test(s)) throw syn(start.ref);
    if (s === '.' || s === '') throw syn(start.ref);
    if (s.startsWith('.')) s = '0' + s;
    if (s.endsWith('.')) s += '0';
    s = s.replace('.e', '.0e');
    return { k: 'num', v: Real.parse(s), ref: last.ref, src: s };
  }
  args() {
    const list = [];
    if (this.peek() && this.peek().k === 'rp') { this.next(); return list; }
    for (;;) {
      if (this.opts.cells && this.isCellStart()) {
        const a = this.cellOrRange();
        list.push(a);
      } else list.push(this.expr());
      const t = this.peek();
      if (!t) return list;
      if (t.k === 'comma') { this.next(); continue; }
      if (t.k === 'rp') { this.next(); return list; }
      throw syn(t.ref);
    }
  }
  isCellStart() {
    const t = this.peek();
    if (!t) return false;
    if (t.k === 'dollar') return true;
    return t.k === 'val' && /^v[A-E]$/.test(t.id) && this.peek(1) && (this.peek(1).k === 'num' || this.peek(1).k === 'dollar');
  }
  cell() {
    let absC = false, absR = false;
    let t = this.next();
    if (t.k === 'dollar') { absC = true; t = this.next(); }
    if (!t || t.k !== 'val' || !/^v[A-E]$/.test(t.id)) throw syn(t ? t.ref : this.last);
    const col = t.id.charCodeAt(1) - 65;
    if (this.peek() && this.peek().k === 'dollar') { this.next(); absR = true; }
    let s = '';
    let last = t;
    while (this.peek() && this.peek().k === 'num' && /^[0-9]$/.test(this.peek().id)) { last = this.next(); s += last.id; }
    if (!s) throw syn(last.ref);
    return { k: 'cell', col, row: parseInt(s, 10) - 1, absC, absR, ref: last.ref };
  }
  cellOrRange() {
    const a = this.cell();
    if (this.peek() && this.peek().k === 'colon') {
      this.next();
      const b = this.cell();
      return { k: 'range', a, b, ref: b.ref };
    }
    return a;
  }
  primary() {
    const t = this.peek();
    if (!t) throw syn(this.last);
    if (t.k === 'num') return this.number();
    if (this.opts.cells && this.isCellStart()) return this.cell();
    if (t.k === 'lp') {
      this.next();
      if (this.peek() && this.peek().k === 'rp') throw syn(this.peek().ref);
      const a = this.expr();
      this.closeParen();
      return { k: 'paren', a, ref: t.ref };
    }
    if (t.k === 'pre') {
      this.next();
      const args = this.args();
      return { k: 'fn', f: t.id, args, ref: t.ref };
    }
    if (t.k === 'val') {
      this.next();
      return valNode(t);
    }
    if (t.k === 'atom') {
      this.next();
      return atomNode(t, this.opts);
    }
    throw syn(t.ref);
  }
}

function valNode(t) {
  const id = t.id;
  const tt = T[id] || {};
  if (tt.var) return { k: 'var', n: tt.var, ref: t.ref };
  if (tt.mat) return { k: 'mat', n: tt.mat, ref: t.ref };
  if (tt.vct) return { k: 'vct', n: tt.vct, ref: t.ref };
  if (tt.stat) return { k: 'stat', n: tt.stat, ref: t.ref };
  if (id.startsWith('c:')) return { k: 'const', id, ref: t.ref };
  return { k: 'sym', id, ref: t.ref }; // Ans, π, e, i, Ran#
}

function sub(items, opts) {
  if (!items.length) throw syn(null);
  const p = new P(items, { ...opts, forceBase: undefined });
  const e = p.expr();
  if (!p.eof()) throw p.errAt(p.peek());
  return e;
}

function slotExpr(tok, k, opts) {
  const items = tok.slots[k];
  if (!items.length) {
    const e = syn(tok.ref);
    e.slot = [tok.ref, k];
    throw e;
  }
  return sub(items, opts);
}

function atomNode(t, opts) {
  const a = (k) => slotExpr(t, k, opts);
  const ref = t.ref;
  switch (t.tpl) {
    case 'frac': return { k: 'frac', a: a(0), b: a(1), ref };
    case 'mixed': return { k: 'mixed', i: a(0), n: a(1), d: a(2), ref };
    case 'sqrt': return { k: 'fn', f: 'sqrt(', args: [a(0)], ref };
    case 'cbrt': return { k: 'fn', f: 'cbrt(', args: [a(0)], ref };
    case 'root': return { k: 'root', n: a(0), a: a(1), ref };
    case 'pow10': return { k: 'fn', f: 'pow10(', args: [a(0)], ref };
    case 'exp': return { k: 'fn', f: 'exp(', args: [a(0)], ref };
    case 'logb': return { k: 'fn', f: 'log(', args: [a(0), a(1)], ref };
    case 'abs': return { k: 'fn', f: 'Abs(', args: [a(0)], ref };
    case 'integ': return { k: 'fn', f: 'int(', args: [a(0), a(1), a(2)], ref };
    case 'diff': return { k: 'fn', f: 'diff(', args: [a(0), a(1)], ref };
    case 'sum': return { k: 'fn', f: 'sum(', args: [a(0), a(1), a(2)], ref };
    default: throw syn(ref);
  }
}

// split items at top-level separators (':' for statements)
function splitTop(items, kind) {
  const parts = [[]];
  let depth = 0;
  for (const it of items) {
    if (it.t === 'c') {
      const k = T[it.v] ? T[it.v].k : '';
      if (k === 'lp' || k === 'pre' || (T[it.v] && T[it.v].opens)) depth++;
      else if (k === 'rp') depth = Math.max(0, depth - 1);
      else if (k === kind && depth === 0) { parts.push([]); parts[parts.length - 1].sep = it; continue; }
    }
    parts[parts.length - 1].push(it);
  }
  return parts;
}

// Parse one statement; supports "lhs = rhs" (SOLVE / CALC equations)
export function parseStatement(items, opts = {}) {
  const eqParts = splitTop(items, 'eq');
  if (eqParts.length > 2) throw syn(eqParts[2].sep);
  if (eqParts.length === 2) {
    if (!eqParts[0].length) throw syn(eqParts[1].sep);
    if (!eqParts[1].length) throw syn(eqParts[1].sep);
    return { k: 'eq', a: parseExpr(eqParts[0], opts), b: parseExpr(eqParts[1], opts), ref: eqParts[1].sep };
  }
  return parseExpr(items, opts);
}

export function parseExpr(items, opts = {}) {
  if (!items.length) throw syn(null);
  const p = new P(items, opts);
  const e = p.expr();
  if (!p.eof()) {
    const t = p.peek();
    throw p.errAt(t);
  }
  return e;
}

// Program = statements separated by ':'
export function parseProgram(items, opts = {}) {
  const parts = splitTop(items, 'colon');
  return parts.map((part, i) => {
    if (!part.length) throw syn(i > 0 ? part.sep : null);
    return parseStatement(part, opts);
  });
}

// collect variable names used in an AST (for CALC / SOLVE prompts)
export function collectVars(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.k === 'var' && !out.includes(node.n)) out.push(node.n);
  if (node.k === 'fn' && (node.f === 'int(' || node.f === 'diff(' || node.f === 'sum(')) {
    // x inside f(x) is the dummy variable
    for (let j = 1; j < node.args.length; j++) collectVars(node.args[j], out);
    const inner = collectVars(node.args[0], []);
    for (const v of inner) if (v !== 'x' && !out.includes(v)) out.push(v);
    return out;
  }
  for (const key of ['a', 'b', 'i', 'n', 'd']) if (node[key] && typeof node[key] === 'object' && node[key].k) collectVars(node[key], out);
  if (node.args) node.args.forEach((x) => collectVars(x, out));
  if (node.parts) node.parts.forEach((x) => collectVars(x, out));
  return out;
}
