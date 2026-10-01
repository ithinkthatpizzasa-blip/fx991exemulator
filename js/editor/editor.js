// Expression editor model.
// An expression is an array of items:
//   {t:'c', v:tokenId}                       a token
//   {t:<template>, s:[slot0[], slot1[]...]}  a natural-display template
// Math IO uses templates; Line IO stores only tokens (templates are
// converted to their linear token equivalents). Both are rendered from this
// same model by js/editor/render.js.
import { T, TEMPLATE_SLOTS, TEMPLATE_LINE } from './tokens.js';

export const MAX_BYTES = 199;

export function tok(v) { return { t: 'c', v }; }
export function tpl(t, n = TEMPLATE_SLOTS[t]) { return { t, s: Array.from({ length: n }, () => []) }; }
export function isTpl(it) { return it && it.t !== 'c'; }

export function cloneItems(items) {
  return items.map((it) => (it.t === 'c' ? { t: 'c', v: it.v } : { t: it.t, s: it.s.map(cloneItems) }));
}

export function itemBytes(it) {
  if (it.t === 'c') return (T[it.v] && T[it.v].b) || 1;
  let b = it.t === 'frac' || it.t === 'pow' ? 1 : 2;
  for (const s of it.s) b += itemsBytes(s) + (it.s.length > 1 ? 1 : 0);
  return b;
}
export function itemsBytes(items) {
  let b = 0;
  for (const it of items) b += itemBytes(it);
  return b;
}

// tokens that make up a number literal
function isNumTok(it) { return it && it.t === 'c' && T[it.v] && T[it.v].k === 'num'; }
function kindOf(it) { return it && it.t === 'c' ? (T[it.v] ? T[it.v].k : 'val') : 'tpl'; }

// Start index of the operand that ends right before idx (for fraction / power pulling).
export function operandStart(arr, idx) {
  let i = idx;
  // trailing postfix operators
  while (i > 0 && kindOf(arr[i - 1]) === 'post') i--;
  if (i === 0) return idx;
  const prev = arr[i - 1];
  const k = kindOf(prev);
  if (k === 'num') {
    while (i > 0 && isNumTok(arr[i - 1])) i--;
    return i;
  }
  if (k === 'val') return i - 1;
  if (k === 'tpl') {
    if (prev.t === 'pow') {
      // include base of power
      const s = operandStart(arr, i - 1);
      return s < i - 1 ? s : i - 1;
    }
    return i - 1;
  }
  if (k === 'rp') {
    let depth = 0;
    for (let j = i - 1; j >= 0; j--) {
      const kk = kindOf(arr[j]);
      if (kk === 'rp') depth++;
      else if (kk === 'lp' || kk === 'pre' || (arr[j].t === 'c' && T[arr[j].v] && T[arr[j].v].opens)) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return idx;
  }
  return idx;
}

// End index (exclusive) of the operand starting at idx (for INS wrapping).
export function operandEnd(arr, idx) {
  if (idx >= arr.length) return idx;
  const it = arr[idx];
  const k = kindOf(it);
  let j = idx;
  if (k === 'num') { while (j < arr.length && isNumTok(arr[j])) j++; }
  else if (k === 'val' || k === 'tpl') j = idx + 1;
  else if (k === 'lp' || k === 'pre') {
    let depth = 0;
    for (; j < arr.length; j++) {
      const kk = kindOf(arr[j]);
      if (kk === 'lp' || kk === 'pre') depth++;
      else if (kk === 'rp') { depth--; if (depth === 0) { j++; break; } }
    }
  } else if (k === 'neg') {
    return operandEnd(arr, idx + 1);
  } else return idx;
  while (j < arr.length && (kindOf(arr[j]) === 'post' || (arr[j].t === 'pow'))) j++;
  return j;
}

export class Editor {
  constructor(line = false) {
    this.line = line;
    this.clear();
  }
  clear() {
    this.root = [];
    this.path = [];
    this.idx = 0;
    this.insertMode = true; // Line IO overwrite toggle
    this.wrapNext = false; // Math IO INS
    this.undoState = null;
  }
  setLine(line) { this.line = line; this.clear(); }
  isEmpty() { return this.root.length === 0; }

  slotOf(path) {
    let arr = this.root;
    for (const [i, s] of path) arr = arr[i].s[s];
    return arr;
  }
  get slot() { return this.slotOf(this.path); }
  parentTemplate() {
    if (!this.path.length) return null;
    const pp = this.path.slice(0, -1);
    const [i, s] = this.path[this.path.length - 1];
    return { arr: this.slotOf(pp), index: i, slot: s, item: this.slotOf(pp)[i], ppath: pp };
  }

  bytes() { return itemsBytes(this.root); }
  remaining() { return MAX_BYTES - this.bytes(); }

  snapshot() { return { root: cloneItems(this.root), path: this.path.map((p) => p.slice()), idx: this.idx }; }
  restore(s) { this.root = cloneItems(s.root); this.path = s.path.map((p) => p.slice()); this.idx = s.idx; }
  saveUndo() { if (!this.line) this.undoState = this.snapshot(); }
  undo() {
    if (!this.undoState) return;
    const cur = this.snapshot();
    this.restore(this.undoState);
    this.undoState = cur;
  }

  setItems(items, cursorAtEnd = true) {
    this.root = cloneItems(items);
    this.path = [];
    this.idx = cursorAtEnd ? this.root.length : 0;
    this.wrapNext = false;
  }

  canInsert(bytes) { return this.bytes() + bytes <= MAX_BYTES; }

  // ---- insertion ----
  insertToken(v) {
    const t = T[v];
    const b = (t && t.b) || 1;
    if (this.line && !this.insertMode && this.idx < this.slot.length) {
      this.saveUndo();
      this.slot.splice(this.idx, 1, tok(v));
      this.idx++;
      return true;
    }
    if (!this.canInsert(b)) return false;
    this.saveUndo();
    if (this.wrapNext && !this.line && t && t.k === 'pre') {
      // INS: function wraps the operand right of the cursor
      this.wrapNext = false;
      const arr = this.slot;
      const end = operandEnd(arr, this.idx);
      const inner = arr.slice(this.idx, end);
      arr.splice(this.idx, end - this.idx, tok(v), ...inner, tok(')'));
      this.idx += inner.length + 2;
      return true;
    }
    this.wrapNext = false;
    this.slot.splice(this.idx, 0, tok(v));
    this.idx++;
    return true;
  }
  insertTokens(list) { for (const v of list) if (!this.insertToken(v)) return false; return true; }

  insertTemplate(name) {
    if (this.line) {
      if (name === 'frac') return this.insertToken('⌟');
      if (name === 'mixed') return this.insertToken('⌟');
      if (name === 'pow10') return this.insertTokens(['pow10(']);
      const lt = TEMPLATE_LINE[name];
      return this.insertToken(lt);
    }
    if (!this.canInsert(3)) return false;
    this.saveUndo();
    const arr = this.slot;
    const node = tpl(name);
    if (this.wrapNext) {
      this.wrapNext = false;
      const end = operandEnd(arr, this.idx);
      const inner = arr.splice(this.idx, end - this.idx);
      const target = name === 'root' || name === 'logb' ? 1 : 0;
      if (name === 'pow') {
        node.s[0] = inner;
        arr.splice(this.idx, 0, node);
        this.path = [...this.path, [this.idx, 0]];
        this.idx = inner.length;
        return true;
      }
      node.s[target] = inner;
      arr.splice(this.idx, 0, node);
      this.path = [...this.path, [this.idx, target]];
      this.idx = inner.length;
      return true;
    }
    let enterSlot = 0;
    if (name === 'frac' || name === 'mixed' || name === 'root') {
      const st = operandStart(arr, this.idx);
      if (st < this.idx) {
        const pulled = arr.splice(st, this.idx - st);
        // strip enclosing parentheses of a pulled group? keep as typed
        node.s[0] = pulled;
        this.idx = st;
        enterSlot = 1;
      }
    }
    arr.splice(this.idx, 0, node);
    this.path = [...this.path, [this.idx, enterSlot]];
    this.idx = 0;
    return true;
  }

  // ---- navigation ----
  enter(arrIndex, slotIndex, atEnd) {
    this.path = [...this.path, [arrIndex, slotIndex]];
    this.idx = atEnd ? this.slot.length : 0;
  }
  exitTemplate(after) {
    const p = this.parentTemplate();
    this.path = p.ppath;
    this.idx = after ? p.index + 1 : p.index;
  }

  left() {
    this.wrapNext = false;
    if (this.idx > 0) {
      const it = this.slot[this.idx - 1];
      if (isTpl(it) && !this.line) {
        const n = it.s.length;
        this.enter(this.idx - 1, n - 1, true);
        return;
      }
      this.idx--;
      return;
    }
    const p = this.parentTemplate();
    if (!p) {
      // wrap to end
      this.idx = this.root.length;
      return;
    }
    if (p.slot > 0) {
      this.path = [...p.ppath, [p.index, p.slot - 1]];
      this.idx = this.slot.length;
      return;
    }
    this.exitTemplate(false);
  }

  right() {
    this.wrapNext = false;
    const arr = this.slot;
    if (this.idx < arr.length) {
      const it = arr[this.idx];
      if (isTpl(it) && !this.line) {
        this.enter(this.idx, 0, false);
        return;
      }
      this.idx++;
      return;
    }
    const p = this.parentTemplate();
    if (!p) {
      this.idx = 0;
      return;
    }
    if (p.slot < p.item.s.length - 1) {
      this.path = [...p.ppath, [p.index, p.slot + 1]];
      this.idx = 0;
      return;
    }
    this.exitTemplate(true);
  }

  // SHIFT+left/right: jump out of the current template
  jumpOut(after) {
    if (!this.path.length) {
      this.idx = after ? this.root.length : 0;
      return;
    }
    this.exitTemplate(after);
  }

  // up/down inside stacked templates. Returns true if handled.
  vertical(dir) {
    for (let depth = this.path.length - 1; depth >= 0; depth--) {
      const pp = this.path.slice(0, depth);
      const [i, s] = this.path[depth];
      const node = this.slotOf(pp)[i];
      let target = null;
      if (node.t === 'frac') target = dir < 0 ? (s === 1 ? 0 : null) : (s === 0 ? 1 : null);
      else if (node.t === 'mixed') target = dir < 0 ? (s === 2 ? 1 : null) : (s === 1 ? 2 : null);
      else if (node.t === 'integ' || node.t === 'sum') target = dir < 0 ? (s === 1 ? 2 : null) : (s === 2 ? 1 : null);
      if (target !== null) {
        this.path = [...pp, [i, target]];
        this.idx = Math.min(this.idx, this.slot.length);
        if (depth < this.path.length - 1) this.idx = this.slot.length;
        return true;
      }
    }
    return false;
  }

  del() {
    const arr = this.slot;
    this.wrapNext = false;
    if (this.line && !this.insertMode) {
      if (this.idx < arr.length) { this.saveUndo(); arr.splice(this.idx, 1); return; }
      if (this.idx > 0) { this.saveUndo(); arr.splice(this.idx - 1, 1); this.idx--; }
      return;
    }
    if (this.idx > 0) {
      const it = arr[this.idx - 1];
      this.saveUndo();
      if (isTpl(it) && !this.line) {
        if (it.s.every((s) => s.length === 0)) {
          arr.splice(this.idx - 1, 1);
          this.idx--;
          return;
        }
        // remove template, keep its contents inline
        const flat = [];
        for (const s of it.s) flat.push(...s);
        arr.splice(this.idx - 1, 1, ...flat);
        this.idx = this.idx - 1 + flat.length;
        return;
      }
      arr.splice(this.idx - 1, 1);
      this.idx--;
      return;
    }
    // at start of a slot: dissolve the enclosing template
    const p = this.parentTemplate();
    if (!p) return;
    this.saveUndo();
    const node = p.item;
    const flat = [];
    let cursor = 0;
    node.s.forEach((s, si) => {
      if (si === p.slot) cursor = flat.length;
      flat.push(...s);
    });
    p.arr.splice(p.index, 1, ...flat);
    this.path = p.ppath;
    this.idx = p.index + cursor;
  }

  toggleIns() {
    if (this.line) this.insertMode = !this.insertMode;
    else this.wrapNext = !this.wrapNext;
  }

  // place cursor right after the given item object (error "Goto")
  moveAfterItem(target) {
    const search = (arr, path) => {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (it === target) return { path, idx: i + 1 };
        if (isTpl(it)) {
          for (let s = 0; s < it.s.length; s++) {
            const r = search(it.s[s], [...path, [i, s]]);
            if (r) return r;
          }
        }
      }
      return null;
    };
    const r = target ? search(this.root, []) : null;
    if (r) { this.path = r.path; this.idx = r.idx; } else { this.path = []; this.idx = this.root.length; }
  }

  // is the cursor inside any template (for rendering)
  cursorPath() { return { path: this.path, idx: this.idx }; }
}

// Convert Math IO items to Line IO linear tokens (used for CALC/SOLVE prompts and STO menus)
export function linearize(items) {
  const out = [];
  for (const it of items) {
    if (it.t === 'c') { out.push(it); continue; }
    const s = it.s.map(linearize);
    const p = (x) => [tok('('), ...x, tok(')')];
    switch (it.t) {
      case 'frac': out.push(...p(s[0]), tok('⌟'), ...p(s[1])); break;
      case 'mixed': out.push(...s[0], tok('⌟'), ...s[1], tok('⌟'), ...s[2]); break;
      case 'sqrt': out.push(tok('sqrt('), ...s[0], tok(')')); break;
      case 'cbrt': out.push(tok('cbrt('), ...s[0], tok(')')); break;
      case 'root': out.push(...p(s[0]), tok('xrt'), ...s[1], tok(')')); break;
      case 'pow': out.push(tok('^'), ...s[0], tok(')')); break;
      case 'pow10': out.push(tok('pow10('), ...s[0], tok(')')); break;
      case 'exp': out.push(tok('exp('), ...s[0], tok(')')); break;
      case 'logb': out.push(tok('log('), ...s[0], tok(','), ...s[1], tok(')')); break;
      case 'abs': out.push(tok('Abs('), ...s[0], tok(')')); break;
      case 'integ': out.push(tok('int('), ...s[0], tok(','), ...s[1], tok(','), ...s[2], tok(')')); break;
      case 'diff': out.push(tok('diff('), ...s[0], tok(','), ...s[1], tok(')')); break;
      case 'sum': out.push(tok('sum('), ...s[0], tok(','), ...s[1], tok(','), ...s[2], tok(')')); break;
      default: break;
    }
  }
  return out;
}
