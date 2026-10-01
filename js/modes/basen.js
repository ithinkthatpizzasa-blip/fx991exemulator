// Base-N mode (MENU 3): 32-bit two's complement integer arithmetic in
// decimal, hexadecimal, binary and octal, with logical operations.
import { CalcScreen, drawExpr, drawResult, errorScreen } from './calcscreen.js';
import { Menu } from '../ui/overlays.js';
import { serCalcScreen, restoreCalcScreen } from './common.js';
import { Real } from '../engine/real.js';
import { Editor } from '../editor/editor.js';

const NAMES = { 10: 'Dec', 16: 'Hex', 2: 'Bin', 8: 'Oct' };

export function baseString(v, base) {
  const u = v < 0n ? v + 4294967296n : v;
  if (base === 10) return v.toString();
  if (base === 16) return u.toString(16).toUpperCase().padStart(8, '0');
  if (base === 8) return u.toString(8).padStart(11, '0');
  return u.toString(2).padStart(32, '0');
}

export class BaseNMode {
  constructor(calc) {
    this.calc = calc;
    this.base = 10;
    const self = this;
    this.cs = new CalcScreen(calc, {
      constConv: false,
      calcKey: false,
      parseOpts: () => ({ baseN: self.base }),
      ctx: () => calc.ctx({ baseN: self.base }),
      onValue: (v) => {
        if (typeof v === 'bigint') { calc.mem.ans = Real.int(v); return true; }
        return false;
      },
      formatLines: (v) => self.lines(v),
      stoKeys: { mplus: 'M', rpar: 'x', xvar: 'x', sd: 'y' },
      optnMenu: (cb) => new Menu(calc, null, {
        pages: [
          { cols: 2, rows: 3, items: [
            { label: 'Neg', act: () => cb('t:Neg(') }, { label: 'Not', act: () => cb('t:Not(') },
            { label: 'and', act: () => cb('t:and') }, { label: 'or', act: () => cb('t:or') },
            { label: 'xor', act: () => cb('t:xor') }, { label: 'xnor', act: () => cb('t:xnor') },
          ] },
          { cols: 2, rows: 2, items: [
            { label: 'd', act: () => cb('t:bpd') }, { label: 'h', act: () => cb('t:bph') },
            { label: 'b', act: () => cb('t:bpb') }, { label: 'o', act: () => cb('t:bpo') },
          ] },
        ],
      }),
      onAction: (action, key, cs) => {
        const m = /^BASE:(\d+)$/.exec(action);
        if (!m) return false;
        self.base = +m[1];
        return true;
      },
    });
    // Base-N always uses linear input
    this.cs.editor = new Editor(true);
    Object.defineProperty(this.cs, 'line', { get: () => true });
  }
  lines(v) {
    if (typeof v !== 'bigint') {
      if (v instanceof Real) v = v.d.trunc().toBigInt();
      else return [[{ t: 'x', s: '' }]];
    }
    const s = baseString(v, this.base);
    if (this.base === 2) {
      const g = (t) => t.match(/.{4}/g).join(' ');
      return [[{ t: 'x', s: g(s.slice(0, 16)) }], [{ t: 'x', s: g(s.slice(16)) }]];
    }
    return [[{ t: 'x', s }]];
  }
  enter() {}
  key(a, k) { return this.cs.key(a, k); }
  render(bm) {
    const cs = this.cs;
    if (cs.state === 'error') { errorScreen(bm, cs.err); return; }
    bm.text(NAMES[this.base], 0, 0, 'S');
    const ed = cs.editor;
    const editing = cs.state === 'input' || cs.state === 'busy';
    const r = drawExpr(bm, ed.root, {
      y: 12, line: true, cursor: editing ? { path: ed.path, idx: ed.idx } : null,
      showCursor: editing && this.calc.blink, scroll: cs.scroll, clipTop: 11, clipBottom: 30, cursorShape: cs.cursorShape(),
    });
    cs.scroll = editing ? r.scroll : 0;
    if (cs.state === 'result' && cs.res) {
      const lines = this.lines(cs.res.value);
      if (lines.length === 2) {
        drawResult(bm, lines[0], 46);
        drawResult(bm, lines[1], 61);
      } else drawResult(bm, lines[0], 61);
    }
  }
  status(f) { this.cs.status(f); }
  onSetup() {}
  onON() { this.cs.clearAll(); this.cs.editor = new Editor(true); }
  onCancel() { this.cs.onCancel(); }
  recover() { this.cs.resetIO(); this.cs.editor = new Editor(true); }
  serialize() { return { base: this.base, cs: serCalcScreen(this.cs) }; }
  restore(o) {
    if (o && [2, 8, 10, 16].includes(o.base)) this.base = o.base;
    restoreCalcScreen(this.cs, o && o.cs);
    if (!this.cs.editor.line) this.cs.editor = new Editor(true);
  }
}
