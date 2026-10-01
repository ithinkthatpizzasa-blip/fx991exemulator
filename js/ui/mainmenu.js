// MENU screen: 12 mode icons (4 per row, two rows visible) + name of the
// highlighted mode. Icons are original pixel drawings.
import { Overlay } from './overlays.js';
import { MENU_KEYS, MENU_LABELS } from '../keymap.js';

export const MODES = [
  { id: 'calc', name: 'Calculate' },
  { id: 'cmplx', name: 'Complex' },
  { id: 'basen', name: 'Base-N' },
  { id: 'matrix', name: 'Matrix' },
  { id: 'vector', name: 'Vector' },
  { id: 'stat', name: 'Statistics' },
  { id: 'dist', name: 'Distribution' },
  { id: 'sheet', name: 'Spreadsheet' },
  { id: 'table', name: 'Table' },
  { id: 'eqn', name: 'Equation/Func' },
  { id: 'ineq', name: 'Inequality' },
  { id: 'ratio', name: 'Ratio' },
];

const ICONS = [
  (bm, x, y) => { bm.text('×÷', x + 9, y + 1, 'S'); bm.text('+−', x + 9, y + 10, 'S'); },
  (bm, x, y) => { bm.rect(x + 6, y + 3, 11, 14); bm.text('𝑖', x + 9, y + 5, 'S'); bm.line(x + 20, y + 16, x + 29, y + 5); bm.hline(x + 20, x + 31, y + 16); },
  (bm, x, y) => { bm.text('2  8', x + 7, y + 1, 'S'); bm.text('10 16', x + 4, y + 10, 'S'); },
  (bm, x, y) => {
    bm.vline(x + 6, y + 2, y + 18); bm.hline(x + 6, x + 8, y + 2); bm.hline(x + 6, x + 8, y + 18);
    bm.vline(x + 31, y + 2, y + 18); bm.hline(x + 29, x + 31, y + 2); bm.hline(x + 29, x + 31, y + 18);
    bm.fill(x + 11, y + 5, 5, 4); bm.fill(x + 21, y + 5, 5, 4); bm.fill(x + 11, y + 12, 5, 4); bm.fill(x + 21, y + 12, 5, 4);
  },
  (bm, x, y) => {
    bm.line(x + 8, y + 17, x + 8, y + 3); bm.line(x + 8, y + 3, x + 6, y + 5); bm.line(x + 8, y + 3, x + 10, y + 5);
    bm.line(x + 8, y + 17, x + 26, y + 5); bm.line(x + 26, y + 5, x + 22, y + 5); bm.line(x + 26, y + 5, x + 25, y + 9);
    bm.line(x + 14, y + 17, x + 30, y + 13); bm.line(x + 30, y + 13, x + 27, y + 11); bm.line(x + 30, y + 13, x + 27, y + 16);
  },
  (bm, x, y) => {
    bm.vline(x + 6, y + 2, y + 18); bm.hline(x + 6, x + 32, y + 18);
    bm.fill(x + 9, y + 10, 4, 8); bm.fill(x + 15, y + 5, 4, 13); bm.fill(x + 21, y + 8, 4, 10); bm.rect(x + 27, y + 13, 4, 5);
  },
  (bm, x, y) => {
    bm.hline(x + 4, x + 34, y + 18);
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = (i - 14) / 5;
      pts.push([x + 5 + i, y + 17 - Math.round(14 * Math.exp(-t * t / 2))]);
    }
    for (let i = 1; i < pts.length; i++) bm.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    bm.vline(x + 19, y + 3, y + 18);
  },
  (bm, x, y) => {
    bm.rect(x + 5, y + 2, 28, 17); bm.fill(x + 5, y + 2, 28, 4); bm.fill(x + 5, y + 2, 5, 17);
    bm.vline(x + 17, y + 2, y + 18); bm.vline(x + 25, y + 2, y + 18); bm.hline(x + 5, x + 32, y + 10); bm.hline(x + 5, x + 32, y + 14);
  },
  (bm, x, y) => {
    bm.rect(x + 5, y + 2, 13, 17); bm.rect(x + 20, y + 2, 13, 17); bm.hline(x + 5, x + 17, y + 6); bm.hline(x + 20, x + 32, y + 6);
    bm.hline(x + 8, x + 14, y + 10); bm.hline(x + 8, x + 14, y + 14); bm.hline(x + 23, x + 29, y + 10); bm.hline(x + 23, x + 29, y + 14);
  },
  (bm, x, y) => { bm.text('𝑥 𝑦', x + 9, y + 1, 'S'); bm.text('=0', x + 12, y + 10, 'S'); },
  (bm, x, y) => { bm.text('𝑥 𝑦', x + 9, y + 1, 'S'); bm.text('>0', x + 12, y + 10, 'S'); },
  (bm, x, y) => { bm.rect(x + 5, y + 5, 10, 11); bm.fill(x + 18, y + 7, 2, 2); bm.fill(x + 18, y + 12, 2, 2); bm.rect(x + 23, y + 5, 10, 11); },
];

export class MainMenu extends Overlay {
  constructor(calc) {
    super(calc);
    this.sel = Math.max(0, MODES.findIndex((m) => m.id === calc.modeId));
    this.topRow = this.sel >= 8 ? 1 : 0;
  }
  key(key, action) {
    if (action === 'ON' || action === 'OFF') return false;
    if (action === 'AC' || action === 'MENU') { this.close(); return true; }
    const n = MODES.length;
    if (key === 'left') this.sel = (this.sel + n - 1) % n;
    else if (key === 'right') this.sel = (this.sel + 1) % n;
    else if (key === 'up') this.sel = (this.sel + n - 4) % n;
    else if (key === 'down') this.sel = (this.sel + 4) % n;
    else if (action === 'EQ') return this.choose(this.sel);
    else {
      const lab = MENU_KEYS[key];
      const idx = lab ? MENU_LABELS.indexOf(lab) : -1;
      if (idx >= 0 && idx < n && !this.calc.lastMods.shift && !this.calc.lastMods.alpha) return this.choose(idx);
    }
    const row = Math.floor(this.sel / 4);
    if (row < this.topRow) this.topRow = row;
    if (row > this.topRow + 1) this.topRow = row - 1;
    return true;
  }
  choose(i) {
    this.close();
    this.calc.enterMode(MODES[i].id);
    return true;
  }
  render(bm) {
    bm.clear();
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const i = (this.topRow + r) * 4 + c;
        if (i >= MODES.length) continue;
        const x = c * 48, y = r * 24;
        ICONS[i](bm, x + 2, y + 1);
        bm.text(MENU_LABELS[i], x + 41, y + 13, 'S');
        bm.hline(x + 2, x + 46, y + 23);
        bm.vline(x + 46, y + 1, y + 23);
        if (i === this.sel) bm.invert(x, y, 47, 23);
      }
    }
    // scroll bar
    bm.fill(190, this.topRow ? 24 : 0, 2, 24);
    const m = MODES[this.sel];
    bm.text(MENU_LABELS[this.sel] + ':' + m.name, 0, 48, 'L');
  }
}
