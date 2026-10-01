// 1-bit frame buffer for the 192x63 dot-matrix LCD plus text drawing.
// Pure JS (no DOM) so the whole calculator can run headless in tests.
import { LARGE, SMALL } from './fontdata.js';

export const LCD_W = 192;
export const LCD_H = 63;

function decodeFont(f) {
  const glyphs = new Map();
  for (const [ch, [w, rows]] of Object.entries(f.glyphs)) {
    glyphs.set(ch, { w, rows: rows.split(',').map((r) => parseInt(r, 36)) });
  }
  return { h: f.h, base: f.base, glyphs };
}
export const FONTS = { L: decodeFont(LARGE), S: decodeFont(SMALL) };

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+', 'ˣ': '𝑥', 'ʸ': '𝑦', 'ⁿ': 'n' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−', 'ₚ': 'p', 'ₙ': 'n', 'ₑ': 'e', 'ₜ': 't', 'ₐ': 'a', 'ₓ': 'x' };
const COMB = new Set(['̄', '̂']);

// split text into drawable units: {ch, mode:'n'|'sup'|'sub', acc}
export function parseText(str) {
  const out = [];
  const chars = Array.from(str);
  let mode = 'n';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if ((c === '^' || c === '_') && chars[i + 1] === '{') {
      const end = chars.indexOf('}', i + 2);
      if (end > 0) {
        for (const cc of chars.slice(i + 2, end)) out.push({ ch: cc, mode: c === '^' ? 'sup' : 'sub' });
        i = end;
        continue;
      }
    }
    if (COMB.has(c)) {
      if (out.length) out[out.length - 1].acc = c;
      continue;
    }
    if (SUP[c]) { out.push({ ch: SUP[c], mode: 'sup' }); continue; }
    if (SUB[c]) { out.push({ ch: SUB[c], mode: 'sub' }); continue; }
    out.push({ ch: c, mode });
  }
  return out;
}

function getGlyph(font, ch) {
  const f = FONTS[font];
  let g = f.glyphs.get(ch);
  if (!g) {
    const alt = { '−': '-', '𝑝': 'p', '𝑡': 't', 'ℏ': 'ħ', '▫': '□', '·': '•' }[ch];
    if (alt) g = f.glyphs.get(alt);
    if (!g) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1d44e && cp <= 0x1d467) g = f.glyphs.get(String.fromCharCode(97 + cp - 0x1d44e));
      else if (cp >= 0x1d434 && cp <= 0x1d44d) g = f.glyphs.get(String.fromCharCode(65 + cp - 0x1d434));
    }
    if (!g && font === 'S') g = FONTS.S.glyphs.get(ch.toUpperCase());
    if (!g) g = f.glyphs.get('?');
  }
  return g;
}

export class Bitmap {
  constructor(w = LCD_W, h = LCD_H) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
    this.clip = null;
  }
  clear() { this.px.fill(0); }
  setClip(x0, y0, x1, y1) { this.clip = [x0, y0, x1, y1]; }
  noClip() { this.clip = null; }
  set(x, y, v = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (this.clip && (x < this.clip[0] || y < this.clip[1] || x > this.clip[2] || y > this.clip[3])) return;
    this.px[y * this.w + x] = v;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]; }
  fill(x, y, w, h, v = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v); }
  invert(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      this.px[yy * this.w + xx] ^= 1;
    }
  }
  hline(x0, x1, y, v = 1) { for (let x = x0; x <= x1; x++) this.set(x, y, v); }
  vline(x, y0, y1, v = 1) { for (let y = y0; y <= y1; y++) this.set(x, y, v); }
  rect(x, y, w, h) { this.hline(x, x + w - 1, y); this.hline(x, x + w - 1, y + h - 1); this.vline(x, y, y + h - 1); this.vline(x + w - 1, y, y + h - 1); }
  dotRect(x, y, w, h) {
    for (let i = 0; i < w; i++) { if (i % 2 === 0) { this.set(x + i, y); this.set(x + i, y + h - 1); } }
    for (let j = 0; j < h; j++) { if (j % 2 === 0) { this.set(x, y + j); this.set(x + w - 1, y + j); } }
  }
  line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // draw glyph with its top-left at (x,y); returns glyph width
  glyph(ch, x, y, font = 'L', v = 1) {
    const g = getGlyph(font, ch);
    if (!g) return 0;
    for (let r = 0; r < g.rows.length; r++) {
      const bits = g.rows[r];
      if (!bits) continue;
      for (let i = 0; i < g.w; i++) if (bits & (1 << (g.w - 1 - i))) this.set(x + i, y + r, v);
    }
    return g.w;
  }
  // text with top of the font box at y. returns advance width.
  text(str, x, y, font = 'L', v = 1) {
    let cx = x;
    const units = parseText(str);
    for (const u of units) {
      let f = font, yy = y;
      if (u.mode === 'sup') { f = 'S'; yy = font === 'L' ? y - 1 : y - 3; }
      else if (u.mode === 'sub') { f = 'S'; yy = font === 'L' ? y + 6 : y + 3; }
      if (u.ch === ' ') { cx += font === 'L' ? 4 : 3; continue; }
      const w = this.glyph(u.ch, cx, yy, f, v);
      if (u.acc) {
        const top = inkTop(u.ch, f);
        const ay = yy + top - 2;
        if (u.acc === '̄') this.hline(cx, cx + w - 1, ay, v);
        else { const m = cx + (w >> 1); this.set(m, ay - 1, v); this.set(m - 1, ay, v); this.set(m + 1, ay, v); }
      }
      cx += w + 1;
    }
    return cx - x;
  }
}

const inkCache = new Map();
function inkTop(ch, font) {
  const k = font + ch;
  if (inkCache.has(k)) return inkCache.get(k);
  const g = getGlyph(font, ch);
  let t = 0;
  if (g) while (t < g.rows.length && !g.rows[t]) t++;
  inkCache.set(k, t);
  return t;
}

export function textWidth(str, font = 'L') {
  let w = 0;
  for (const u of parseText(str)) {
    const f = u.mode === 'n' ? font : 'S';
    if (u.ch === ' ') { w += font === 'L' ? 4 : 3; continue; }
    const g = getGlyph(f, u.ch);
    w += (g ? g.w : 0) + 1;
  }
  return w;
}
