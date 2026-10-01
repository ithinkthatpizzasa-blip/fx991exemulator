// Dev-only: sets the app version everywhere (js/version.js, sw.js cache name,
// manifest.json) and refreshes the precache list.
// Usage: node tools/bump-version.mjs 1.0.1
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) {
  console.error('usage: node tools/bump-version.mjs <major.minor.patch>');
  process.exit(1);
}
const rep = (file, re, to) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(re, to));
rep('js/version.js', /APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`);
rep('sw.js', /const VERSION = '[^']*'/, `const VERSION = '${v}'`);
const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
m.version = v;
fs.writeFileSync('manifest.json', JSON.stringify(m, null, 2) + '\n');
execFileSync(process.execPath, ['tools/build-sw.mjs'], { stdio: 'inherit' });
console.log('version set to', v);
