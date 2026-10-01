// Shared pieces for modes: OPTN sub-menus and CalcScreen (de)serialisation.
import { Menu } from '../ui/overlays.js';
import { ENG_SYMBOLS } from '../editor/tokens.js';
import { ser, de } from '../engine/serial.js';
import { Editor } from '../editor/editor.js';

export function hypMenu(calc, cb) {
  const f = [['sinh', 'sinh('], ['cosh', 'cosh('], ['tanh', 'tanh('], ['sinh⁻¹', 'asinh('], ['cosh⁻¹', 'acosh('], ['tanh⁻¹', 'atanh(']];
  return new Menu(calc, f.map(([l, id]) => ({ label: l, act: () => cb('t:' + id) })), { cols: 2 });
}
export function angleMenu(calc, cb) {
  return new Menu(calc, [['°', '°'], ['ʳ', 'ʳ'], ['ᵍ', 'ᵍ']].map(([l, id]) => ({ label: l, act: () => cb('t:' + id) })), { cols: 3 });
}
export function engMenu(calc, cb) {
  return new Menu(calc, ENG_SYMBOLS.map(([s]) => ({ label: s, act: () => cb('t:eng' + s) })), { cols: 3 });
}
export function stdOptnItems(calc, cb) {
  return [
    { label: 'Hyperbolic Func', sub: () => hypMenu(calc, cb) },
    { label: 'Angle Unit', sub: () => angleMenu(calc, cb) },
    { label: 'Engineer Symbol', sub: () => engMenu(calc, cb) },
  ];
}
// pad a list of items to a full page of 4
export function padPage(items) {
  const out = items.slice();
  while (out.length % 4) out.push(null);
  return out;
}

export function serCalcScreen(cs) {
  const res = cs.state === 'result' && cs.res && cs.res.value !== undefined && !cs.res.pending
    ? { items: cs.res.items, value: safeSer(cs.res.value), disp: cs.res.disp } : null;
  return {
    ed: cs.editor.root,
    line: cs.editor.line,
    res,
    hist: cs.history.slice(-20).map((h) => ({ items: h.items, value: safeSer(h.value), disp: h.disp })),
  };
}
function safeSer(v) {
  if (v && v.pair) return { pair: v.pair, a: ser(v.a), b: ser(v.b) };
  return { v: ser(v) };
}
function safeDe(o) {
  if (!o) return null;
  if (o.pair) return { pair: o.pair, a: de(o.a), b: de(o.b) };
  return de(o.v);
}
export function restoreCalcScreen(cs, o) {
  if (!o) return;
  cs.editor = new Editor(cs.line);
  if (Array.isArray(o.ed) && o.line === cs.line) cs.editor.setItems(o.ed);
  cs.history = Array.isArray(o.hist) && o.line === cs.line ? o.hist.map((h) => ({ items: h.items, value: safeDe(h.value), disp: h.disp || {} })) : [];
  if (o.res && o.line === cs.line) {
    cs.res = { items: o.res.items, value: safeDe(o.res.value), disp: o.res.disp || {}, prog: null, idx: 0 };
    cs.state = 'result';
  }
}
