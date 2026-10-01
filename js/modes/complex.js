// Complex mode (MENU 2)
import { CalcScreen } from './calcscreen.js';
import { Menu } from '../ui/overlays.js';
import { stdOptnItems, serCalcScreen, restoreCalcScreen } from './common.js';

export class ComplexMode {
  constructor(calc) {
    this.calc = calc;
    this.cs = new CalcScreen(calc, {
      optnMenu: (cb) => new Menu(calc, null, {
        pages: [
          { items: [
            { label: 'Argument', act: () => cb('t:Arg(') },
            { label: 'Conjugate', act: () => cb('t:Conjg(') },
            { label: 'Real Part', act: () => cb('t:ReP(') },
            { label: 'Imaginary Part', act: () => cb('t:ImP(') },
          ] },
          { items: [
            { label: '▶𝑟∠θ', act: () => cb('t:▶r∠θ') },
            { label: '▶𝑎+𝑏𝑖', act: () => cb('t:▶a+bi') },
          ] },
          { items: stdOptnItems(calc, cb) },
        ],
      }),
    });
  }
  enter() {}
  key(a, k) { return this.cs.key(a, k); }
  render(bm) { this.cs.render(bm); }
  status(f) {
    this.cs.status(f);
    f.cplx = this.calc.setup.complex === 'polar' ? '∠' : 'i';
  }
  onSetup(k) { if (k === 'io') this.cs.resetIO(); }
  onON() { this.cs.clearAll(); }
  onCancel() { this.cs.onCancel(); }
  recover() { this.cs.resetIO(); }
  serialize() { return { cs: serCalcScreen(this.cs) }; }
  restore(o) { restoreCalcScreen(this.cs, o && o.cs); }
}
