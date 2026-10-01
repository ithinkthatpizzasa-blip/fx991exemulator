// Dev-only: refreshes the precache file list in sw.js from the files that make
// up the app (index.html, manifest, css, js, fonts, icons).
// Usage: node tools/build-sw.mjs
import fs from 'node:fs';
import path from 'node:path';

const roots = ['css', 'js', 'fonts', 'icons'];
const files = ['./', './index.html', './manifest.json'];
function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (!/\.(txt|md)$/i.test(f)) files.push('./' + p.split(path.sep).join('/'));
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r);
let sw = fs.readFileSync('sw.js', 'utf8');
const list = files.map((f) => `  '${f}',`).join('\n');
sw = sw.replace(/\/\* BEGIN FILES \*\/[\s\S]*?\/\* END FILES \*\//, `/* BEGIN FILES */\n${list}\n  /* END FILES */`);
fs.writeFileSync('sw.js', sw);
console.log(`sw.js precache: ${files.length} files`);
