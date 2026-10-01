// Dev-only: render calculator LCD screens headless to a PNG contact sheet.
// Usage: node tools/lcdshot.mjs out.png '<json setup>' 'keys seq 1' 'keys seq 2' ...
import { newCalc, press } from '../tests/helpers.js';
import { Bitmap } from '../js/ui/bitmap.js';
import { drawStatus } from '../js/ui/lcdview.js';
import { savePng } from './lcdpng.mjs';

const [out, setupJson, ...seqs] = process.argv.slice(2);
const setup = setupJson ? JSON.parse(setupJson) : {};
const W = 196, H = 76;
const cols = 2;
const rows = Math.ceil(seqs.length / cols);
const sheet = new Bitmap(W * cols, H * rows);
seqs.forEach((seq, i) => {
  const parts = seq.split('|');
  const c = newCalc(parts.length > 1 ? { ...setup, ...JSON.parse(parts[0]) } : setup);
  c.blink = true;
  press(c, parts[parts.length - 1]);
  c.blink = true;
  const f = c.render();
  const st = drawStatus(f);
  const ox = (i % cols) * W + 2, oy = Math.floor(i / cols) * H + 2;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 192; x++) if (st.px[y * 192 + x]) sheet.set(ox + x, oy + y);
  for (let y = 0; y < 63; y++) for (let x = 0; x < 192; x++) if (c.bm.px[y * 192 + x]) sheet.set(ox + x, oy + 10 + y);
  // frame
  sheet.hline(ox - 2, ox + 193, oy + H - 3);
  sheet.vline(ox + 193, oy - 2, oy + H - 3);
});
savePng(sheet, out, 3);
