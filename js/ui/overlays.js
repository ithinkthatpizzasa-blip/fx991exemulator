// Modal screens drawn over the current mode: menus, prompts, messages,
// the variable RECALL screen, STO standby and the contrast screen.
import { MENU_KEYS, MENU_LABELS, VAR_KEYS } from '../keymap.js';
import { textWidth } from './bitmap.js';

export class Overlay {
  constructor(calc) { this.calc = calc; }
  key() { return true; }
  render() {}
  status() {}
  close() { this.calc.closeOverlay(this); }
}

function scrollBar(bm, page, pages) {
  if (pages <= 1) return;
  const h = 63;
  const seg = Math.max(4, Math.floor(h / pages));
  const y = Math.min(h - seg, Math.round((page * (h - seg)) / (pages - 1)));
  bm.fill(190, y, 2, seg);
}

// Generic numbered menu.
// items: [{label, act?: () => void, sub?: () => Menu, keep?: bool}]
export class Menu extends Overlay {
  constructor(calc, items, opts = {}) {
    super(calc);
    // explicit pages: opts.pages = [{items, cols, font, rows}]
    this.pageDefs = opts.pages || null;
    this.items = items || [];
    this.cols = opts.cols || 1;
    this.font = opts.font || (this.cols === 3 && this.items.length > 12 ? 'S' : 'L');
    this.rows = opts.rows || (this.font === 'S' ? 6 : 4);
    this.perPage = this.rows * this.cols;
    this.page = 0;
    this.parent = opts.parent || null;
    this.title = opts.title || null;
    this.onClose = opts.onClose || null;
    this.labelFn = opts.labelFn || null;
  }
  get pages() { return this.pageDefs ? this.pageDefs.length : Math.max(1, Math.ceil(this.items.length / this.perPage)); }
  pageItems() {
    if (this.pageDefs) return this.pageDefs[this.page].items;
    return this.items.slice(this.page * this.perPage, (this.page + 1) * this.perPage);
  }
  pageLayout() {
    if (!this.pageDefs) return { cols: this.cols, font: this.font, rows: this.rows };
    const p = this.pageDefs[this.page];
    const font = p.font || 'L';
    return { cols: p.cols || 1, font, rows: p.rows || (font === 'S' ? 6 : 4) };
  }
  key(key, action) {
    if (action === 'AC' || action === 'OFF') {
      this.calc.closeAllOverlays();
      if (action === 'OFF') return false;
      return true;
    }
    if (action === 'ON') return false;
    if (key === 'left' && this.parent) {
      this.calc.replaceOverlay(this, this.parent);
      return true;
    }
    if (key === 'down') { this.page = (this.page + 1) % this.pages; return true; }
    if (key === 'up') { this.page = (this.page + this.pages - 1) % this.pages; return true; }
    if (key === 'optn' && this.isOptn) { this.calc.closeAllOverlays(); return true; }
    const lab = MENU_KEYS[key];
    if (!lab || this.calc.shift || this.calc.alpha) return true;
    const idx = MENU_LABELS.indexOf(lab);
    const items = this.pageItems();
    if (idx < 0 || idx >= items.length) return true;
    const it = items[idx];
    if (!it) return true;
    if (it.sub) {
      const m = it.sub();
      if (m) {
        m.parent = this;
        m.isOptn = this.isOptn;
        this.calc.replaceOverlay(this, m);
      }
      return true;
    }
    if (it.act) {
      if (!it.keep) this.calc.closeAllOverlays();
      it.act();
    }
    return true;
  }
  render(bm) {
    bm.clear();
    const items = this.pageItems();
    const { cols, font } = this.pageLayout();
    const lh = font === 'S' ? 10 : 15;
    let y0 = 0;
    if (this.title) { bm.text(this.title, 0, 0, font); y0 = lh; }
    const colW = Math.floor(186 / cols);
    items.forEach((it, i) => {
      if (!it) return;
      const r = Math.floor(i / cols), c = i % cols;
      const lab = this.labelFn ? this.labelFn(it, i) : MENU_LABELS[i] + ':' + it.label;
      bm.text(lab, c * colW, y0 + r * lh + (font === 'S' ? 1 : 0), font);
    });
    scrollBar(bm, this.page, this.pages);
    if (this.parent) {
      // sub-menu indicator (left arrow at top right)
      bm.glyph('◀', 184, 0, 'S');
    }
  }
}

// Prompt like "Fix 0~9?" accepting a digit
export class Prompt extends Overlay {
  constructor(calc, text, accept, cb) {
    super(calc);
    this.text = text;
    this.accept = accept; // array of digits
    this.cb = cb;
  }
  key(key, action) {
    if (action === 'AC') { this.calc.closeAllOverlays(); return true; }
    if (action === 'ON' || action === 'OFF') return false;
    if (key === 'left' && this.parent) { this.calc.replaceOverlay(this, this.parent); return true; }
    const m = /^t:([0-9])$/.exec(action || '');
    if (m && this.accept.includes(+m[1])) {
      this.calc.closeAllOverlays();
      this.cb(+m[1]);
    }
    return true;
  }
  render(bm) {
    bm.clear();
    String(this.text).split('\n').forEach((l, i) => bm.text(l, 0, i * 15, 'L'));
  }
}

// Message box; lines of text. onYes: called on '='
export class Message extends Overlay {
  constructor(calc, lines, opts = {}) {
    super(calc);
    this.lines = lines;
    this.onYes = opts.onYes || null;
    this.anyKey = opts.anyKey || false;
    this.font = opts.font || 'L';
    this.onClose = opts.onClose || null;
  }
  key(key, action) {
    if (action === 'ON' || action === 'OFF') return false;
    if (action === 'EQ' && this.onYes) { const f = this.onYes; this.close(); f(); return true; }
    if (action === 'AC' || this.anyKey) { this.close(); if (this.onClose) this.onClose(); return true; }
    return true;
  }
  render(bm) {
    bm.clear();
    const lh = this.font === 'S' ? 10 : 15;
    this.lines.forEach((l, i) => {
      if (typeof l === 'object') {
        const x = l.center ? Math.floor((192 - textWidth(l.s, this.font)) / 2) : (l.right ? 192 - textWidth(l.s, this.font) : 0);
        bm.text(l.s, x, i * lh, this.font);
        if (l.inv) bm.invert(0, i * lh, 192, lh);
      } else bm.text(l, 0, i * lh, this.font);
    });
  }
}

// waits for a variable key after STO
export class StoPending extends Overlay {
  constructor(calc, cb, keys = VAR_KEYS) {
    super(calc);
    this.cb = cb;
    this.keys = keys;
    this.transparent = true;
  }
  status(f) { f.STO = true; }
  key(key, action) {
    if (action === 'ON' || action === 'OFF') return false;
    if (key === 'shift' || key === 'alpha') return false;
    this.close();
    if (action === 'AC') return true;
    const v = this.keys[key];
    if (v) this.cb(v);
    return true;
  }
}

export class Contrast extends Overlay {
  key(key, action) {
    if (action === 'AC') { this.close(); return true; }
    if (action === 'ON' || action === 'OFF') return false;
    const s = this.calc.setup;
    if (key === 'left') s.contrast = Math.max(0, s.contrast - 1);
    if (key === 'right') s.contrast = Math.min(10, s.contrast + 1);
    this.calc.save();
    return true;
  }
  render(bm) {
    bm.clear();
    bm.text('CONTRAST', 54, 2, 'L');
    bm.text('LIGHT', 0, 26, 'S');
    bm.text('DARK', 168, 26, 'S');
    bm.text('◀', 40, 24, 'L');
    bm.text('▶', 144, 24, 'L');
    bm.rect(52, 26, 88, 8);
    bm.fill(53, 27, Math.round((86 * this.calc.setup.contrast) / 10), 6);
    bm.text('[AC]:Exit', 0, 48, 'L');
  }
}
