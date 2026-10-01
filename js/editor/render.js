// Natural (2D) and linear layout of expression items onto the LCD bitmap.
// Box metrics: a = rows from top down to and including the baseline row,
//              d = rows below the baseline.
import { T } from './tokens.js';
import { textWidth, parseText } from '../ui/bitmap.js';

const M = {
  L: { a: 11, d: 2, top: 11, axis: 4, ph: [7, 10] },
  S: { a: 7, d: 2, top: 7, axis: 3, ph: [5, 7] },
};

export function tokenDisplay(id, line) {
  const t = T[id];
  if (!t) return id;
  return (line && t.ls) || t.s;
}

function textBox(str, size) {
  const units = parseText(str);
  const hasSup = units.some((u) => u.mode === 'sup');
  const hasSub = units.some((u) => u.mode === 'sub');
  const w = textWidth(str, size);
  const m = M[size];
  return {
    w, a: m.a + (hasSup ? 2 : 0), d: m.d + (hasSub ? 2 : 0),
    draw(bm, x, base) { bm.text(str, x, base - m.top, size); },
  };
}

function placeholder(size) {
  const [w, h] = M[size].ph;
  return {
    w: w + 1, a: h, d: 0, empty: true,
    draw(bm, x, base) { bm.dotRect(x, base - h + 1, w, h); },
  };
}

// cursor info: { path: [[i,s],...], idx } relative to the list being laid out
function sub(cur, i, s) {
  if (!cur || !cur.path.length) return null;
  const [pi, ps] = cur.path[0];
  if (pi !== i || ps !== s) return null;
  return { path: cur.path.slice(1), idx: cur.idx };
}

const isDigitTok = (it) => it.t === 'c' && /^[0-9]$/.test(it.v);

export function layoutList(items, size, opts = {}, cur = null) {
  const boxes = [];
  let x = 0, a = 0, d = 0;
  let cursor = null;
  let raise = false; // digits after the x10 exponent marker
  const here = cur && cur.path.length === 0 ? cur.idx : -1;
  for (let i = 0; i <= items.length; i++) {
    if (i === here) cursor = { x, size };
    if (i === items.length) break;
    const it = items[i];
    let b;
    if (it.t === 'x') {
      b = textBox(it.s, size);
    } else if (it.t === 'c') {
      if (raise && (isDigitTok(it) || it.v === 'neg')) {
        const sb = textBox(tokenDisplay(it.v, opts.line), 'S');
        const shift = size === 'L' ? 5 : 3;
        b = { w: sb.w, a: sb.a + shift, d: Math.max(0, sb.d - shift), draw: (bm, xx, base) => sb.draw(bm, xx, base - shift) };
      } else {
        raise = it.v === 'E';
        b = textBox(tokenDisplay(it.v, opts.line), size);
      }
      if (!(isDigitTok(it) || it.v === 'neg' || it.v === 'E')) raise = false;
    } else if (it.t === 'pow') {
      const prev = boxes.length ? boxes[boxes.length - 1].box : null;
      const e = layoutList(it.s[0], 'S', opts, sub(cur, i, 0));
      const baseA = size === 'L' ? 11 : 7;
      const shift = Math.max(size === 'L' ? 6 : 4, prev ? prev.a - baseA + (size === 'L' ? 6 : 4) : 0);
      b = wrapShift(e, shift);
      if (e.cursor) b.cursor = { ...e.cursor, dy: -shift };
      raise = false;
    } else {
      b = layoutTemplate(it, size, opts, (s) => sub(cur, i, s));
      raise = false;
    }
    boxes.push({ x, box: b });
    if (b.cursor) cursor = { x: x + b.cursor.x, size: b.cursor.size, dy: b.cursor.dy || 0, h: b.cursor.h };
    x += b.w;
    a = Math.max(a, b.a);
    d = Math.max(d, b.d);
  }
  if (!items.length && opts.slot) {
    const p = placeholder(size);
    return { w: p.w, a: p.a, d: 0, cursor: here === 0 ? { x: 0, size } : null, draw: p.draw, empty: true };
  }
  const m = M[size];
  if (!items.length) { a = m.a; d = m.d; }
  a = Math.max(a, m.a);
  return {
    w: x, a, d, cursor,
    draw(bm, x0, base) { for (const bx of boxes) bx.box.draw(bm, x0 + bx.x, base); },
  };
}

function wrapShift(e, shift) {
  return {
    w: e.w + 1, a: e.a + shift, d: Math.max(0, e.d - shift),
    draw(bm, x, base) { e.draw(bm, x, base - shift); },
  };
}

function slotBox(it, k, size, opts, curf) {
  return layoutList(it.s[k], size, { ...opts, slot: true }, curf(k));
}

function withCursor(b, child, dx, dy) {
  if (child.cursor) b.cursor = { x: dx + child.cursor.x, size: child.cursor.size, dy: (child.cursor.dy || 0) + dy, h: child.cursor.h };
}

function drawRadical(bm, x, top, bottom, size) {
  if (size === 'L') {
    bm.set(x, bottom - 4); bm.set(x + 1, bottom - 4); bm.set(x + 1, bottom - 3);
    bm.set(x + 2, bottom - 2); bm.set(x + 2, bottom - 1); bm.set(x + 3, bottom);
    bm.vline(x + 4, top, bottom - 1);
    return 5;
  }
  bm.set(x, bottom - 3); bm.set(x + 1, bottom - 2); bm.set(x + 1, bottom - 1); bm.set(x + 2, bottom);
  bm.vline(x + 3, top, bottom - 1);
  return 4;
}

function parens(bm, x, top, bottom, left) {
  if (left) { bm.set(x + 2, top); bm.set(x + 1, top + 1); bm.vline(x, top + 2, bottom - 2); bm.set(x + 1, bottom - 1); bm.set(x + 2, bottom); }
  else { bm.set(x, top); bm.set(x + 1, top + 1); bm.vline(x + 2, top + 2, bottom - 2); bm.set(x + 1, bottom - 1); bm.set(x, bottom); }
}

function parenWrap(inner, size) {
  // stretchy parentheses around a box
  const m = M[size];
  const a = Math.max(inner.a, m.a), d = Math.max(inner.d, m.d - 1);
  const tall = inner.a > m.a || inner.d > m.d;
  if (!tall) {
    const lp = textBox('(', size), rp = textBox(')', size);
    const b = {
      w: lp.w + inner.w + rp.w, a, d,
      draw(bm, x, base) { lp.draw(bm, x, base); inner.draw(bm, x + lp.w, base); rp.draw(bm, x + lp.w + inner.w, base); },
    };
    withCursor(b, inner, lp.w, 0);
    return b;
  }
  const b = {
    w: inner.w + 8, a: a + 1, d: d + 1,
    draw(bm, x, base) {
      parens(bm, x, base - a, base + d, true);
      inner.draw(bm, x + 4, base);
      parens(bm, x + 4 + inner.w, base - a, base + d, false);
    },
  };
  withCursor(b, inner, 4, 0);
  return b;
}

function layoutTemplate(it, size, opts, curf) {
  const m = M[size];
  const S = size === 'L' ? 'S' : 'S';
  switch (it.t) {
    case 'frac': {
      const n = slotBox(it, 0, size, opts, curf), dn = slotBox(it, 1, size, opts, curf);
      const w = Math.max(n.w, dn.w) + 3;
      const bar = -m.axis;
      const nBase = bar - 1 - n.d;
      const nTop = nBase - n.a + 1;
      const dBase = bar + 1 + dn.a;
      const nx = Math.floor((w - 1 - n.w) / 2) + 1, dx = Math.floor((w - 1 - dn.w) / 2) + 1;
      const b = {
        w: w + 1, a: 1 - nTop, d: dBase + dn.d,
        draw(bm, x, base) {
          n.draw(bm, x + nx, base + nBase);
          bm.hline(x, x + w - 1, base + bar);
          dn.draw(bm, x + dx, base + dBase);
        },
      };
      withCursor(b, n, nx, nBase);
      withCursor(b, dn, dx, dBase);
      return b;
    }
    case 'mixed': {
      const ip = slotBox(it, 0, size, opts, curf);
      const fr = layoutTemplate({ t: 'frac', s: [it.s[1], it.s[2]] }, size, opts, (k) => curf(k + 1));
      const b = {
        w: ip.w + fr.w, a: Math.max(ip.a, fr.a), d: Math.max(ip.d, fr.d),
        draw(bm, x, base) { ip.draw(bm, x, base); fr.draw(bm, x + ip.w, base); },
      };
      withCursor(b, ip, 0, 0);
      withCursor(b, fr, ip.w, 0);
      return b;
    }
    case 'sqrt': case 'cbrt': case 'root': {
      const ci = it.t === 'root' ? 1 : 0;
      const c = slotBox(it, ci, size, opts, curf);
      let idx = null;
      if (it.t === 'root') idx = slotBox(it, 0, S, opts, curf);
      else if (it.t === 'cbrt') idx = textBox('3', 'S');
      const rw = size === 'L' ? 5 : 4;
      const off = idx ? Math.max(0, idx.w - 2) : 0;
      const a = c.a + 2, d = c.d;
      const b = {
        w: off + rw + c.w + 2, a: Math.max(a, idx ? 4 + idx.a + idx.d : 0), d,
        draw(bm, x, base) {
          const top = base - a + 1, bottom = base + d;
          if (idx) idx.draw(bm, x, bottom - (size === 'L' ? 5 : 4) - idx.d);
          drawRadical(bm, x + off, top, bottom, size);
          bm.hline(x + off + rw - 1, x + off + rw + c.w, top);
          c.draw(bm, x + off + rw + 1, base);
        },
      };
      if (idx && idx.cursor) b.cursor = { x: idx.cursor.x, size: 'S', dy: d - (size === 'L' ? 5 : 4) - idx.d + (idx.cursor.dy || 0) };
      withCursor(b, c, off + rw + 1, 0);
      return b;
    }
    case 'pow10': case 'exp': {
      const head = textBox(it.t === 'pow10' ? '10' : '𝑒', size);
      const e = slotBox(it, 0, 'S', opts, curf);
      const shift = size === 'L' ? 6 : 4;
      const b = {
        w: head.w + e.w + 1, a: Math.max(head.a, e.a + shift), d: Math.max(head.d, e.d - shift),
        draw(bm, x, base) { head.draw(bm, x, base); e.draw(bm, x + head.w, base - shift); },
      };
      withCursor(b, e, head.w, -shift);
      return b;
    }
    case 'logb': {
      const head = textBox('log', size);
      const bs = slotBox(it, 0, 'S', opts, curf);
      const arg = parenWrap(slotBox(it, 1, size, opts, curf), size);
      const drop = size === 'L' ? 3 + bs.a - 4 : 2 + bs.a - 3;
      const b = {
        w: head.w + bs.w + arg.w, a: Math.max(head.a, arg.a), d: Math.max(head.d, arg.d, bs.d + drop),
        draw(bm, x, base) { head.draw(bm, x, base); bs.draw(bm, x + head.w, base + drop); arg.draw(bm, x + head.w + bs.w, base); },
      };
      withCursor(b, bs, head.w, drop);
      withCursor(b, arg, head.w + bs.w, 0);
      return b;
    }
    case 'abs': {
      const c = slotBox(it, 0, size, opts, curf);
      const a = Math.max(c.a, m.a), d = Math.max(c.d, 1);
      const b = {
        w: c.w + 5, a: a + 1, d: d + 1,
        draw(bm, x, base) {
          bm.vline(x + 1, base - a, base + d);
          c.draw(bm, x + 3, base);
          bm.vline(x + 3 + c.w, base - a, base + d);
        },
      };
      withCursor(b, c, 3, 0);
      return b;
    }
    case 'integ': {
      const f = slotBox(it, 0, size, opts, curf);
      const la = slotBox(it, 1, 'S', opts, curf), lb = slotBox(it, 2, 'S', opts, curf);
      const A = Math.max(f.a, m.a) + 4, Dd = Math.max(f.d, 2) + 4;
      const lw = Math.max(la.w, lb.w);
      const dx = textBox('d𝑥', size);
      const bBase = -A + lb.a, aBase = Dd - la.d;
      const fx = 6 + lw + 1;
      const b = {
        w: fx + f.w + dx.w + 1, a: A + 1, d: Dd,
        draw(bm, x, base) {
          const top = base - A, bot = base + Dd;
          bm.set(x + 3, top); bm.set(x + 4, top + 1); bm.vline(x + 2, top + 1, bot - 1); bm.set(x + 1, bot); bm.set(x, bot - 1);
          lb.draw(bm, x + 5, base + bBase);
          la.draw(bm, x + 5, base + aBase);
          f.draw(bm, x + fx, base);
          dx.draw(bm, x + fx + f.w, base);
        },
      };
      withCursor(b, f, fx, 0);
      withCursor(b, la, 5, aBase);
      withCursor(b, lb, 5, bBase);
      return b;
    }
    case 'diff': {
      const f = parenWrap(slotBox(it, 0, size, opts, curf), size);
      const av = slotBox(it, 1, 'S', opts, curf);
      const dTop = textBox('d', 'S'), dBot = textBox('d𝑥', 'S');
      const fw = Math.max(dTop.w, dBot.w) + 1;
      const bar = -m.axis;
      const xeq = textBox('𝑥=', 'S');
      const A = Math.max(f.a, 12), D = Math.max(f.d, 2);
      const subBase = D + 2;
      const fx = fw + 1;
      const b = {
        w: fx + f.w + 3 + xeq.w + av.w, a: A + 1, d: Math.max(D, subBase + av.d),
        draw(bm, x, base) {
          dTop.draw(bm, x + Math.floor((fw - dTop.w) / 2), base + bar - 1 - 2);
          bm.hline(x, x + fw - 1, base + bar);
          dBot.draw(bm, x, base + bar + 1 + 7);
          f.draw(bm, x + fx, base);
          const vx = x + fx + f.w + 1;
          bm.vline(vx, base - A, base + D);
          xeq.draw(bm, vx + 2, base + subBase);
          av.draw(bm, vx + 2 + xeq.w, base + subBase);
        },
      };
      withCursor(b, f, fx, 0);
      withCursor(b, av, fx + f.w + 3 + xeq.w, subBase);
      return b;
    }
    case 'sum': {
      const f = parenWrap(slotBox(it, 0, size, opts, curf), size);
      const la = slotBox(it, 1, 'S', opts, curf), lb = slotBox(it, 2, 'S', opts, curf);
      const sig = textBox('Σ', size);
      const xeq = textBox('𝑥=', 'S');
      const lowW = xeq.w + la.w;
      const colW = Math.max(sig.w, lowW, lb.w);
      const sigTop = -m.a + 1;
      const bBase = sigTop - 1 - lb.d;
      const aBase = m.d + 1 + la.a - 1;
      const b = {
        w: colW + 1 + f.w, a: Math.max(f.a, 1 - (bBase - lb.a + 1)), d: Math.max(f.d, aBase + la.d),
        draw(bm, x, base) {
          sig.draw(bm, x + Math.floor((colW - sig.w) / 2), base);
          lb.draw(bm, x + Math.floor((colW - lb.w) / 2), base + bBase);
          const lx = x + Math.floor((colW - lowW) / 2);
          xeq.draw(bm, lx, base + aBase);
          la.draw(bm, lx + xeq.w, base + aBase);
          f.draw(bm, x + colW + 1, base);
        },
      };
      withCursor(b, f, colW + 1, 0);
      withCursor(b, lb, Math.floor((colW - lb.w) / 2), bBase);
      withCursor(b, la, Math.floor((colW - lowW) / 2) + xeq.w, aBase);
      return b;
    }
    case 'sub': {
      // display-only subscript run
      const c = layoutList(it.s[0], 'S', opts);
      const drop = size === 'L' ? 3 : 2;
      return { w: c.w, a: m.a, d: Math.max(m.d, c.d + drop), draw(bm, x, base) { c.draw(bm, x, base + drop); } };
    }
    default:
      return textBox('?', size);
  }
}

// Draw cursor at position from a laid out box
export function drawCursor(bm, x, base, cur, shape = 'bar') {
  const size = cur.size || 'L';
  const b = base + (cur.dy || 0);
  const cx = x + cur.x - 1;
  if (shape === 'under') { bm.hline(cx + 1, cx + (size === 'L' ? 6 : 4), b + 2); return; }
  if (shape === 'block') { bm.fill(cx, b - (size === 'L' ? 10 : 6), size === 'L' ? 6 : 4, size === 'L' ? 11 : 7); return; }
  const top = b - (size === 'L' ? 10 : 6);
  bm.vline(cx, top, b + 1);
  if (shape === 'ins') bm.vline(cx + 1, top, b + 1);
}

export function measureItems(items, size = 'L', line = false) {
  return layoutList(items, size, { line });
}
