// Dev-only: screenshot the app in Chromium. Usage:
//   node tools/screenshot.mjs out.png [width] [height] [keys...]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const pwPath = (() => { try { return require.resolve('playwright'); } catch { return require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }); } })();
const { chromium } = require(pwPath);

const [out = 'shot.png', w = '412', h = '892', ...keys] = process.argv.slice(2);
const srv = await serve(8123);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html');
await page.waitForTimeout(800);
for (const k of keys) {
  await page.evaluate((key) => window.__calc && window.__calc.press(key), k);
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
srv.close();
