// Paints the calculator's 192x63 frame buffer plus the status-indicator row
// onto the LCD canvas as a crisp dot matrix at the device's pixel density.
import { Bitmap, LCD_W, LCD_H } from './bitmap.js';

const GLASS_W = 671, GLASS_H = 269; // LCD glass in body units
const PITCH = 640 / 192; // dot pitch in body units
const MX = (GLASS_W - 192 * PITCH) / 2;
const STATUS_ROWS = 8, GAP_ROWS = 2;
const MY = (GLASS_H - (STATUS_ROWS + GAP_ROWS + LCD_H) * PITCH) / 2;

const status = new Bitmap(192, STATUS_ROWS);

function boxText(bm, x, s, on) {
  if (!on) return 0;
  const w = s.length * 6 + 1;
  bm.fill(x, 0, w, 8);
  bm.text(s, x + 1, -1, 'S', 0);
  return w;
}

export function drawStatus(f) {
  const b = status;
  b.clear();
  if (!f || f.off) return b;
  boxText(b, 0, 'S', f.S);
  boxText(b, 9, 'A', f.A);
  if (f.M) b.text('M', 19, -1, 'S');
  if (f.STO) { b.text('→', 27, -1, 'S'); b.text('𝑥', 33, -1, 'S'); }
  if (f.RCL) b.text('RCL', 41, -1, 'S');
  if (f.cplx === 'i') b.text('𝑖', 62, -1, 'S');
  if (f.cplx === '∠') b.text('∠', 60, -1, 'S');
  if (f.E) boxText(b, 68, 'E', true);
  if (f.unit) boxText(b, 78, f.unit, true);
  if (f.FIX) b.text('FIX', 88, -1, 'S');
  if (f.SCI) b.text('SCI', 88, -1, 'S');
  if (f.Math) {
    b.text('√', 110, -1, 'S');
    b.rect(115, 1, 5, 6);
    b.line(116, 6, 120, 2);
  }
  if (f.up) b.text('▲', 134, -2, 'S');
  if (f.down) b.text('▼', 141, -2, 'S');
  if (f.Disp) { b.fill(150, 0, 9, 8); b.vline(153, 1, 6, 0); b.vline(155, 1, 6, 0); }
  if (f.busy) { b.fill(184, 0, 7, 8); b.fill(186, 2, 3, 4, 0); }
  return b;
}

export class LcdView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.lastKey = '';
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = w / GLASS_W;
    this.lastKey = '';
    this.ghost = null;
  }
  ghostLayer(contrast) {
    if (this.ghost && this.ghostContrast === contrast) return this.ghost;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = `rgba(40,60,50,${(0.018 + contrast * 0.003).toFixed(3)})`;
    for (let j = 0; j < LCD_H; j++) {
      const y = this.py(j + STATUS_ROWS + GAP_ROWS), h = this.dh(j + STATUS_ROWS + GAP_ROWS);
      for (let i = 0; i < LCD_W; i++) g.fillRect(this.px(i), y, this.dw(i), h);
    }
    this.ghost = c;
    this.ghostContrast = contrast;
    return c;
  }
  px(i) { return Math.round((MX + i * PITCH) * this.scale); }
  py(j) { return Math.round((MY + j * PITCH) * this.scale); }
  dw(i) { return Math.max(1, Math.round((MX + i * PITCH) * this.scale + PITCH * this.scale * 0.94) - this.px(i)); }
  dh(j) { return Math.max(1, Math.round((MY + j * PITCH) * this.scale + PITCH * this.scale * 0.94) - this.py(j)); }
  draw(bm, flags, contrast = 5) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const s = this.scale;
    const st = drawStatus(flags);
    ctx.clearRect(0, 0, W, H);
    const k = 0.6 + contrast * 0.06; // contrast 0..10
    const on = `rgba(18,26,22,${Math.min(1, k).toFixed(3)})`;
    const px = (i) => this.px(i), py = (j) => this.py(j), dw = (i) => this.dw(i), dh = (j) => this.dh(j);
    if (!(flags && flags.off)) ctx.drawImage(this.ghostLayer(contrast), 0, 0);
    void s;
    ctx.fillStyle = on;
    for (let j = 0; j < STATUS_ROWS; j++) {
      const y = py(j), h = dh(j);
      for (let i = 0; i < 192; i++) if (st.px[j * 192 + i]) ctx.fillRect(px(i), y, dw(i), h);
    }
    if (flags && flags.off) return;
    for (let j = 0; j < LCD_H; j++) {
      const y = py(j + STATUS_ROWS + GAP_ROWS), h = dh(j + STATUS_ROWS + GAP_ROWS);
      const row = j * LCD_W;
      for (let i = 0; i < LCD_W; i++) if (bm.px[row + i]) ctx.fillRect(px(i), y, dw(i), h);
    }
  }
}
