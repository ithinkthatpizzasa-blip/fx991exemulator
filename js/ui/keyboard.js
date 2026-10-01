// Builds the calculator body (keys, legends, D-pad, LCD window) and turns
// pointer / keyboard input into key presses. Geometry in reference-photo units
// (1u = 1/841 of the body width).
const U = (n) => `${(n * 100 / 841).toFixed(4)}cqw`;

// ---------- glyph helpers (inline SVG so they never depend on system fonts) ----------
const svg = (vb, body, w = 1, extra = '') => `<svg class="k-svg" viewBox="${vb}" style="height:${extra || '1em'};width:${w}em" aria-hidden="true">${body}</svg>`;
const S = (d, sw = 9) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ITX = (h = '0.9em') => svg('0 0 100 100', S('M14 34 C22 24 36 22 43 38 L58 74 C63 86 76 88 86 74', 10) + S('M86 32 C78 22 66 24 59 36 L42 68 C35 82 22 84 14 74', 10), 0.9, h);
const ITX_S = ITX('0.75em');
const INTEG = (h = '1.15em') => svg('0 0 60 100', S('M44 10 C40 2 30 2 28 16 L22 84 C20 98 10 98 6 90', 8), 0.6, h);
const RAD = (h = '1em') => svg('0 0 100 100', S('M4 58 L16 52 L32 92 L56 6 L100 6', 9), 0.95, h);
const SIGMA = (h = '0.95em') => svg('0 0 80 100', S('M72 12 L12 12 L46 50 L12 88 L72 88', 10), 0.75, h);
const IFF = svg('0 0 120 60', S('M30 22 L90 22 M30 38 L90 38 M38 8 L16 30 L38 52 M82 8 L104 30 L82 52', 7), 1.2, '0.85em');
const ANGLE = svg('0 0 100 100', S('M86 16 L14 84 L92 84', 10), 0.8, '0.8em');
const LARROW = svg('0 0 100 60', S('M92 30 L12 30 M34 8 L12 30 L34 52', 10), 0.9, '0.7em');
const APPROX = svg('0 0 100 80', S('M10 30 C30 10 50 50 90 22 M10 58 C30 38 50 78 90 50', 10), 0.9, '0.8em');
const OP = (d, sw = 11) => svg('0 0 100 100', S(d, sw), 0.62, '0.62em');
const TIMES = OP('M20 20 L80 80 M80 20 L20 80');
const DIVIDE = svg('0 0 100 100', S('M14 50 L86 50', 10) + '<circle cx="50" cy="20" r="9" fill="currentColor"/><circle cx="50" cy="80" r="9" fill="currentColor"/>', 0.62, '0.62em');
const PLUS = OP('M50 12 L50 88 M12 50 L88 50');
const MINUS = OP('M12 50 L88 50');
const EQUALS = OP('M14 34 L86 34 M14 66 L86 66');
const DOT = svg('0 0 100 100', '<circle cx="50" cy="50" r="13" fill="currentColor"/>', 0.62, '0.62em');

const bx = (f = true, cls = '') => `<i class="bx${f ? ' f' : ''}${cls ? ' ' + cls : ''}"></i>`;
const fracIcon = (cls = '') => `<span class="fr ${cls}">${bx(true)}<b></b>${bx(true)}</span>`;
const mixIcon = `${bx(true)}<span class="fr">${bx(true)}<b></b>${bx(true)}</span>`;
const sp = (c, h) => `<span class="${c}">${h}</span>`;
const Y = (h) => sp('y', h), Rd = (h) => sp('r', h), Bl = (h) => sp('b', h), Pu = (h) => sp('p', h), Wh = (h) => sp('w', h);
const BRK = (letter) => `<span class="bk-b"><span class="r">${letter}</span></span>`;

// ---------- layout ----------
const FN_COLS = [56, 180, 303, 428, 552, 676];
const FN_ROWS = [811, 914, 1016, 1117];
const WK_COLS = [58, 208, 359, 509, 658];
const WK_ROWS = [1234, 1359, 1484, 1609];

const ROUND = [
  { id: 'shift', cx: 108, cy: 705, lg: Y('SHIFT') },
  { id: 'alpha', cx: 220, cy: 706, lg: Rd('ALPHA') },
  { id: 'menu', cx: 622, cy: 707, lg: Wh('MENU') + Y('SETUP'), gap: 6 },
  { id: 'on', cx: 732, cy: 707, lg: Wh('ON') },
];

const FN = [
  // row 0
  { id: 'optn', c: 0, r: 0, face: 'OPTN', lg: Y('QR') },
  { id: 'calc', c: 1, r: 0, face: 'CALC', lg: Y('SOLVE') + Rd('='), gap: 4 },
  { id: 'integ', c: 4, r: 0, face: `${INTEG()}<span style="display:inline-flex;flex-direction:column;font-size:.5em;margin-left:-.1em">${bx(false)}<span style="height:.5em"></span>${bx(false)}</span><span style="display:inline-block;width:.6em;height:.18em;background:currentColor;margin-left:.12em;opacity:.85"></span>`,
    lg: Y(`<span class="fr" style="font-size:.62em"><span>d</span><b></b><span>d${ITX('0.9em')}</span></span>${bx(true)}`) + Rd(':'), gap: 16 },
  { id: 'xvar', c: 5, r: 0, face: ITX('0.95em'), lg: Y(`${SIGMA('0.9em')}${bx(true)}`) },
  // row 1
  { id: 'frac', c: 0, r: 1, face: fracIcon(), lg: Y(mixIcon) },
  { id: 'sqrt', c: 1, r: 1, face: `${RAD()}${bx(true, 'gb')}`, lg: Y(`<sup style="font-size:.55em;margin-right:-.35em">3</sup>${RAD('0.9em')}${bx(true)}`) },
  { id: 'sq', c: 2, r: 1, face: `${ITX('0.95em')}<sup>2</sup>`, lg: Y(`${ITX_S}<sup>3</sup>`) + Bl('DEC') },
  { id: 'pow', c: 3, r: 1, face: `${ITX('0.95em')}<sup>${bx(true, 'gb')}</sup>`, lg: Y(`${bx(true)}${RAD('0.9em')}${bx(false)}`) + Bl('HEX') },
  { id: 'log', c: 4, r: 1, face: `log<sub style="font-size:.55em">${bx(true, 'gb')}</sub>${bx(false)}`, lg: Y(`10<sup>${bx(true)}</sup>`) + Bl('BIN') },
  { id: 'ln', c: 5, r: 1, face: 'ln', lg: Y(`<span style="font-style:italic">e</span><sup>${bx(true)}</sup>`) + Bl('OCT') },
  // row 2
  { id: 'neg', c: 0, r: 2, face: `(<span style="display:inline-block;width:.5em;height:.1em;background:currentColor;margin:0 .06em;vertical-align:.32em"></span>)`, lg: Y('log') + BRK('A') },
  { id: 'dms', c: 1, r: 2, face: '<span style="letter-spacing:.08em">°’”</span>', lg: Y('FACT') + BRK('B') },
  { id: 'inv', c: 2, r: 2, face: `${ITX('0.95em')}<sup>−1</sup>`, lg: Y(`${ITX_S}!`) + BRK('C') },
  { id: 'sin', c: 3, r: 2, face: 'sin', lg: Y('sin<sup>−1</sup>') + BRK('D') },
  { id: 'cos', c: 4, r: 2, face: 'cos', lg: Y('cos<sup>−1</sup>') + BRK('E') },
  { id: 'tan', c: 5, r: 2, face: 'tan', lg: Y('tan<sup>−1</sup>') + BRK('F') },
  // row 3
  { id: 'sto', c: 0, r: 3, face: 'STO', lg: Y('RECALL') },
  { id: 'eng', c: 1, r: 3, face: 'ENG', lg: `<span class="bk-p"><span class="p">${ANGLE}</span></span>` + Y(LARROW) + Pu(`<span style="font-style:italic;font-family:serif">i</span>`), gap: 6 },
  { id: 'lpar', c: 2, r: 3, face: '(', lg: Y('Abs') },
  { id: 'rpar', c: 3, r: 3, face: ')', lg: Y(',') + Rd(ITX('0.85em')), gap: 30 },
  { id: 'sd', c: 4, r: 3, face: `S${IFF}D`, lg: Y(`a<span class="fr" style="font-size:.55em"><span>b</span><b></b><span>c</span></span>${IFF}<span class="fr" style="font-size:.55em"><span>d</span><b></b><span>c</span></span>`) + Rd('<span style="font-style:italic;font-family:serif">y</span>'), gap: 6 },
  { id: 'mplus', c: 5, r: 3, face: 'M+', lg: Y('M−') + Rd('M'), gap: 22 },
];

const WK = [
  { id: 'k7', c: 0, r: 0, face: '7', lg: Y('CONST') },
  { id: 'k8', c: 1, r: 0, face: '8', lg: Y('CONV') },
  { id: 'k9', c: 2, r: 0, face: '9', lg: Y('RESET') },
  { id: 'del', c: 3, r: 0, face: 'DEL', blue: true, lg: Y('INS') + Rd('UNDO'), gap: 10 },
  { id: 'ac', c: 4, r: 0, face: 'AC', blue: true, lg: Y('OFF') },
  { id: 'k4', c: 0, r: 1, face: '4' },
  { id: 'k5', c: 1, r: 1, face: '5' },
  { id: 'k6', c: 2, r: 1, face: '6' },
  { id: 'mul', c: 3, r: 1, face: TIMES, lg: Y('nPr') },
  { id: 'div', c: 4, r: 1, face: DIVIDE, lg: Y('nCr') },
  { id: 'k1', c: 0, r: 2, face: '1' },
  { id: 'k2', c: 1, r: 2, face: '2' },
  { id: 'k3', c: 2, r: 2, face: '3' },
  { id: 'add', c: 3, r: 2, face: PLUS, lg: Y('Pol') },
  { id: 'sub', c: 4, r: 2, face: MINUS, lg: Y('Rec') },
  { id: 'k0', c: 0, r: 3, face: '0', lg: Y('Rnd') },
  { id: 'dot', c: 1, r: 3, face: DOT, lg: Y('Ran#') + Rd('RanInt'), gap: 6 },
  { id: 'exp', c: 2, r: 3, face: `<span style="font-size:.8em">×10</span><span style="font-size:.85em;margin-top:-.55em">${ITX('0.6em')}</span>`, lg: Y('π') + Rd('<span style="font-style:italic">e</span>'), spread: true },
  { id: 'ans', c: 3, r: 3, face: 'Ans', lg: Y('%') },
  { id: 'eq', c: 4, r: 3, face: EQUALS, lg: Y(APPROX) },
];

function el(tag, cls, style, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const box = (x, y, w, h) => ({ left: U(x), top: U(y), width: U(w), height: U(h) });

function legend(face, x, w, bottom, html, opts = {}) {
  const lg = el('div', 'lg' + (opts.spread ? ' spread' : ''), { ...box(x, bottom - 30, w, 30) }, html);
  if (opts.gap !== undefined) lg.style.gap = U(opts.gap);
  face.appendChild(lg);
}

export function buildCalculator(face, onKey) {
  face.appendChild(el('div', 'bezel'));
  face.appendChild(el('div', 'panel'));
  const brand = el('div', 'brand', null, 'LOGO');
  brand.id = 'brand';
  face.appendChild(brand);
  face.appendChild(el('div', 'solar'));
  face.appendChild(el('div', 'lcd-frame'));
  const lcd = el('div', 'lcd');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Calculator display');
  lcd.appendChild(canvas);
  face.appendChild(lcd);

  const keys = {};
  const addKey = (id, cls, b, html, aria) => {
    const k = el('div', 'key ' + cls, b, html);
    k.dataset.key = id;
    k.setAttribute('role', 'button');
    k.setAttribute('aria-label', aria || id);
    face.appendChild(k);
    keys[id] = k;
    return k;
  };

  for (const r of ROUND) {
    const d = 68;
    addKey(r.id, 'round', box(r.cx - d / 2, r.cy - d / 2, d, d), '', r.id);
    legend(face, r.cx - 80, 160, r.cy - d / 2 - 20, r.lg, { gap: r.gap });
  }
  for (const k of FN) {
    const x = FN_COLS[k.c] + 4, y = FN_ROWS[k.r] + 4, w = 99, h = 59;
    addKey(k.id, 'fn', box(x, y, w, h), k.face, k.id);
    if (k.lg) legend(face, x - 14, w + 28, y - 9, k.lg, { gap: k.gap });
  }
  for (const k of WK) {
    const x = WK_COLS[k.c], y = WK_ROWS[k.r], w = 122, h = 81;
    addKey(k.id, k.blue ? 'bk' : 'wk', box(x, y, w, h), k.face, k.id);
    if (k.lg) legend(face, x - 12, w + 24, y - 12, k.lg, { gap: k.gap, spread: k.spread });
  }
  buildDpad(face, keys);

  // ---- pointer input ----
  const press = (k, e) => {
    if (e) e.preventDefault();
    k.classList.add('down');
    onKey(k.dataset.key);
  };
  const release = (k) => k.classList.remove('down');
  for (const k of Object.values(keys)) {
    k.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      try { k.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      press(k, e);
    });
    k.addEventListener('pointerup', () => release(k));
    k.addEventListener('pointercancel', () => release(k));
    k.addEventListener('lostpointercapture', () => release(k));
    k.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return { canvas, keys, brand };
}

function buildDpad(face, keys) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 268, H = 206;
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${W} ${H}`);
  s.setAttribute('class', 'dpad');
  Object.assign(s.style, box(284, 653, W, H));
  const cx = W / 2, cy = H / 2;
  const shape = (k) => {
    // rounded diamond scaled by k around the centre
    const rx = (W / 2 - 2) * k, ry = (H / 2 - 2) * k;
    const p = (x, y) => `${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`;
    return `M${p(0, -ry)} C${p(rx * 0.3, -ry)} ${p(rx * 0.62, -ry * 0.62)} ${p(rx * 0.86, -ry * 0.34)} C${p(rx * 1.02, -ry * 0.15)} ${p(rx * 1.02, ry * 0.15)} ${p(rx * 0.86, ry * 0.34)} C${p(rx * 0.62, ry * 0.62)} ${p(rx * 0.3, ry)} ${p(0, ry)} C${p(-rx * 0.3, ry)} ${p(-rx * 0.62, ry * 0.62)} ${p(-rx * 0.86, ry * 0.34)} C${p(-rx * 1.02, ry * 0.15)} ${p(-rx * 1.02, -ry * 0.15)} ${p(-rx * 0.86, -ry * 0.34)} C${p(-rx * 0.62, -ry * 0.62)} ${p(-rx * 0.3, -ry)} ${p(0, -ry)} Z`;
  };
  const outer = shape(1), ringOut = shape(0.92), ringIn = shape(0.56);
  const sectors = {
    up: `M${cx},${cy} L0,0 L${W},0 Z`,
    right: `M${cx},${cy} L${W},0 L${W},${H} Z`,
    down: `M${cx},${cy} L${W},${H} L0,${H} Z`,
    left: `M${cx},${cy} L0,${H} L0,0 Z`,
  };
  let html = `<defs>
    <linearGradient id="dpg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbfbfb"/><stop offset=".35" stop-color="#c9c9c9"/>
      <stop offset=".55" stop-color="#f2f2f2"/><stop offset=".8" stop-color="#a5a5a5"/><stop offset="1" stop-color="#e3e3e3"/>
    </linearGradient>
    <radialGradient id="dpc" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#2a2a2c"/><stop offset="1" stop-color="#0d0d0e"/></radialGradient>`;
  for (const [k, d] of Object.entries(sectors)) html += `<clipPath id="dp-${k}"><path d="${d}"/></clipPath>`;
  html += `</defs><path d="${outer}" fill="#141416" stroke="#3a3a3d" stroke-width="2"/>`;
  for (const [k] of Object.entries(sectors)) {
    html += `<g class="arm" data-key="${k}"><g clip-path="url(#dp-${k})"><path class="silver" d="${ringOut} ${ringIn}" fill="url(#dpg)" fill-rule="evenodd"/></g><path d="${sectors[k]}" fill="transparent"/></g>`;
  }
  // dark gaps between the four arms
  const dx = W / 2, dy = H / 2;
  html += `<clipPath id="dp-outer"><path d="${ringOut}"/></clipPath>`;
  html += `<path clip-path="url(#dp-outer)" d="M${cx - dx},${cy - dy} L${cx + dx},${cy + dy} M${cx + dx},${cy - dy} L${cx - dx},${cy + dy}" stroke="#141416" stroke-width="9" pointer-events="none"/>`;
  html += `<path d="${ringIn}" fill="url(#dpc)" pointer-events="none"/>`;
  s.innerHTML = html;
  face.appendChild(s);
  for (const g of s.querySelectorAll('.arm')) {
    g.dataset.key = g.getAttribute('data-key');
    keys[g.dataset.key] = g;
  }
}

// physical keyboard -> key id(s)
export const KEYBOARD = {
  '0': 'k0', '1': 'k1', '2': 'k2', '3': 'k3', '4': 'k4', '5': 'k5', '6': 'k6', '7': 'k7', '8': 'k8', '9': 'k9',
  '+': 'add', '-': 'sub', '*': 'mul', x: 'xvar', '/': 'div', '.': 'dot', '(': 'lpar', ')': 'rpar', '^': 'pow',
  Enter: 'eq', '=': 'eq', Backspace: 'del', Delete: 'del', Escape: 'ac',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  F1: 'shift', F2: 'alpha', ',': ['shift', 'rpar'], '!': ['shift', 'inv'], '%': ['shift', 'ans'],
  s: 'sin', c: 'cos', t: 'tan', l: 'ln', g: 'log', r: 'sqrt', m: 'menu', o: 'optn', a: 'ans', e: 'exp',
  p: ['shift', 'exp'], d: 'sd', Home: 'on',
};
