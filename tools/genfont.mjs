// Dev-only: rasterises DejaVu Sans glyphs into 1-bit bitmaps for the LCD.
// Usage: node tools/genfont.mjs  (needs Playwright + Chromium; not needed at runtime)
// Output: tools/out/font-raw.json, reviewed/patched by hand into js/ui/fontdata.js
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const pwPath = (() => { try { return require.resolve('playwright'); } catch { return require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }); } })();
const { chromium } = require(pwPath);
import fs from 'node:fs';

const CHARS = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  ...'×÷−±·•→←↑↓▶◀▲▼▷◁∠°′″πθσμλΣ∫√≈≠≤≥∞εαγΦτℏħΩδ∂ᴇ⌟∣',
];

const specs = JSON.parse(process.argv[2] || '[{"name":"L","font":"14px DejaVu Sans","base":11,"h":14,"thr":0.42}]');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
const out = await page.evaluate(({ CHARS, specs }) => {
  const res = {};
  for (const s of specs) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 40;
    const g = c.getContext('2d', { willReadFrequently: true });
    const font = {};
    for (const ch of CHARS) {
      g.clearRect(0, 0, 64, 40);
      g.font = s.font;
      g.fillStyle = '#000';
      g.textBaseline = 'alphabetic';
      g.fillText(ch, 8, 8 + s.base);
      const d = g.getImageData(0, 0, 64, 40).data;
      let minx = 99, maxx = -1;
      const rows = [];
      for (let y = 8; y < 8 + s.h; y++) {
        let r = '';
        for (let x = 0; x < 64; x++) {
          const on = d[(y * 64 + x) * 4 + 3] / 255 >= s.thr;
          r += on ? '#' : '.';
          if (on) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); }
        }
        rows.push(r);
      }
      const adv = g.measureText(ch).width;
      if (maxx < 0) { font[ch] = { w: Math.round(adv), rows: [] }; continue; }
      font[ch] = { w: maxx - minx + 1, adv, rows: rows.map((r) => r.slice(minx, maxx + 1)) };
    }
    res[s.name] = font;
  }
  return res;
}, { CHARS, specs });
await browser.close();
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/font-raw.json', JSON.stringify(out));
for (const [name, f] of Object.entries(out)) {
  let txt = '';
  for (const [ch, g] of Object.entries(f)) txt += `== ${JSON.stringify(ch)} w=${g.w}\n${g.rows.join('\n')}\n`;
  fs.writeFileSync(`tools/out/font-${name}.txt`, txt);
}
console.log('done', Object.keys(out));
