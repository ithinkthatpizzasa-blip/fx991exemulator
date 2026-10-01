// Calculate mode (MENU 1)
import { CalcScreen } from './calcscreen.js';
import { Menu } from '../ui/overlays.js';
import { stdOptnItems, serCalcScreen, restoreCalcScreen } from './common.js';

export class CalculateMode {
  constructor(calc) {
    this.calc = calc;
    this.cs = new CalcScreen(calc, {
      solve: true,
      optnMenu: (cb) => new Menu(calc, stdOptnItems(calc, cb)),
    });
  }
  enter() {}
  key(a, k) { return this.cs.key(a, k); }
  render(bm) { this.cs.render(bm); }
  status(f) { this.cs.status(f); }
  onSetup(k) { if (k === 'io') this.cs.resetIO(); }
  onON() { this.cs.clearAll(); }
  onCancel() { this.cs.onCancel(); }
  recover() { this.cs.resetIO(); }
  serialize() { return { cs: serCalcScreen(this.cs) }; }
  restore(o) { restoreCalcScreen(this.cs, o && o.cs); }
}
