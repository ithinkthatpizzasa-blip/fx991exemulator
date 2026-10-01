// Dev-only: verifies the PWA in Chromium (needs Playwright):
//  1. manifest fields  2. service worker installs and precaches every file
//  3. app works after going offline and reloading  4. a new version is picked
//  up automatically (new service worker takes control without a reload in use)
// Usage: node tools/pwa-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const pwPath = (() => { try { return require.resolve('playwright'); } catch { return require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }); } })();
const { chromium } = require(pwPath);

const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };

// serve a temporary copy under a sub-path, like GitHub Pages (/repo-name/)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-'));
const site = path.join(tmp, 'repo');
fs.mkdirSync(site);
for (const f of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'fonts', 'icons']) fs.cpSync(f, path.join(site, f), { recursive: true });
const srv = await serve(8124, tmp);
const base = 'http://localhost:8124/repo/';

const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
ok(m.start_url === './' && m.scope === './' && m.display === 'standalone', 'manifest start_url/scope/display');
ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.purpose === 'maskable'), 'manifest icons 192/512/maskable');
for (const i of m.icons) ok(fs.existsSync(i.src), 'icon exists ' + i.src);

// persistent (non-incognito) profile so Chrome evaluates installability like a normal install
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-profile-'));
const ctxOpts = { viewport: { width: 412, height: 892 } };
const ctx = await chromium.launchPersistentContext(profile, { ...ctxOpts, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  .catch(() => chromium.launchPersistentContext(profile, ctxOpts));
const browser = { close: () => ctx.close() };
const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
ok(true, 'service worker controls the page');
const cdp = await ctx.newCDPSession(page);
const inst = await cdp.send('Page.getInstallabilityErrors');
ok(inst.installabilityErrors.length === 0, 'Chrome installability: ' + (inst.installabilityErrors.map((e) => e.errorId).join(', ') || 'installable'));
const man = await cdp.send('Page.getAppManifest');
ok(!man.errors || man.errors.length === 0, 'manifest parsed without errors');
const sw = fs.readFileSync('sw.js', 'utf8');
const listed = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((x) => x[1]);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys.find((k) => k.startsWith('calc-v')));
  return (await c.keys()).map((r) => r.url);
});
ok(listed.every((f) => cached.some((u) => u === new URL(f, 'http://localhost:8124/repo/').href)), `all ${listed.length} precache entries cached`);

// offline
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const c = window.__calc;
  for (const k of ['k1', 'add', 'k2', 'eq']) c.press(k);
  return c.mode.cs.res && c.mode.cs.res.value.toNumber();
});
ok(r === 3, 'calculator works offline after reload (1+2=3)');
await ctx.setOffline(false);

// update: publish a new version on the server
const before = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
fs.writeFileSync(path.join(site, 'sw.js'), sw.replace(/const VERSION = '[^']*'/, "const VERSION = '9.9.9'"));
await page.evaluate(() => { window.__changed = false; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__changed = true; }); });
await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
await page.waitForFunction(() => window.__changed === true, null, { timeout: 15000 }).catch(() => {});
const changed = await page.evaluate(() => window.__changed);
ok(changed, 'new version installed and took control automatically');
await page.waitForTimeout(1500);
const keys = await page.evaluate(() => caches.keys());
const reqs = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
console.log('caches', JSON.stringify(reqs));
ok(keys.length === 1 && keys[0] === 'calc-v9.9.9', 'old caches deleted on activate: ' + keys.join(','));
ok(page.url() === base, 'page was not reloaded during use');
void before;
ok(errors.length === 0, 'no page errors ' + errors.join('; '));
await browser.close();
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(profile, { recursive: true, force: true });
