/**
 * Inspect: the source and the preview point at each other, the way Chrome's
 * DevTools links its Elements panel to the page.
 *
 * - Hovering the source outlines the element under the mouse on the slide,
 *   in DevTools' margin / border / padding / content colors, with a label
 *   such as `h2.title 640 × 80`, and tints that element's source lines.
 * - Inspect mode (the inspect button, or Ctrl Shift X) turns the preview into
 *   a picker: hovering it colors the element's source lines and scrolls them
 *   into view, and a click puts the caret there and ends the mode. The deck
 *   never sees the pointer while the mode is on; Esc or a right-click leaves.
 * - The element holding the caret keeps a dashed outline on the slide, and
 *   its path sits in the status bar as breadcrumbs: hover one to see that
 *   element, click it to put the caret there.
 *
 * Every element the preview renders from the source carries `data-dr-n`, a
 * key into a map of source ranges. The host hands over the map for the
 * document the preview shows (an HTML doc's parse tree, or the server's
 * Markdown positions), and null while the preview is behind the source.
 * The tags live in the preview's copy only.
 *
 * Like the slide panel, this ships to the page through `toString()`, so it is
 * self-contained and never spells a comment opener or a script tag.
 */

export const INSPECT_CSS = `
/* ── Inspect ──────────────────────────────────────────────────────────── */
#insp-layer { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
.insp-clip { position: fixed; overflow: hidden; display: none; }
.insp-clip > div { position: absolute; box-sizing: border-box; display: none; }
.insp-clip.is-on, .insp-clip > div.is-on { display: block; }
/* DevTools' own highlight colors, which people already read without a key. */
.insp-m { border: 0 solid rgba(246, 178, 107, 0.66); }
.insp-b { border: 0 solid rgba(255, 229, 153, 0.66); }
.insp-p { border: 0 solid rgba(147, 196, 125, 0.55); }
.insp-c { background: rgba(111, 168, 220, 0.66); }
.insp-clip > .insp-sel { outline: 1.5px dashed var(--accent); outline-offset: 1px; border-radius: 2px; }
.insp-tip, .insp-away {
  position: fixed;
  display: none;
  max-width: 460px;
  padding: 3px 8px;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 3px;
}
.insp-tip { color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); }
.insp-tip b { color: #881280; font-weight: 600; }
.insp-tip i { color: #1a1aa6; font-style: normal; }
.insp-tip span { margin-left: 10px; color: #777; }
.insp-away { color: var(--text); background: var(--surface0); border: 1px solid var(--surface1); }
.insp-tip.is-on, .insp-away.is-on { display: block; }
.insp-catch { position: fixed; display: none; pointer-events: auto; cursor: default; }
.insp-catch.is-on { display: block; }

/* Source lines, painted behind the (transparent) source textarea. */
.insp-src { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.insp-band { position: absolute; left: 0; right: 0; display: none; }
.insp-band.is-on { display: block; }
.insp-band--all { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.insp-band--open { background: color-mix(in srgb, var(--accent) 20%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
.insp-src.is-strong .insp-band--all { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.insp-src.is-strong .insp-band--open { background: color-mix(in srgb, var(--accent) 32%, transparent); }

#btn-inspect[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }

#crumbs { display: none; flex: 1 1 auto !important; min-width: 0; align-items: center; gap: 1px; overflow: hidden; white-space: nowrap; }
#statusbar.has-crumbs #crumbs { display: flex; }
#statusbar.has-crumbs #tipbar { display: none; }
#crumbs.is-stale { opacity: 0.45; }
.crumb { flex: none; max-width: 26ch; padding: 1px 5px; overflow: hidden; text-overflow: ellipsis; color: var(--subtext0); border-radius: 4px; }
.crumb:hover { color: var(--text); background: var(--surface0); }
.crumb.is-cur { color: var(--accent); }
.crumb-sep, .crumb-more { flex: none; color: var(--overlay0); }
`;

export const INSPECT_BUTTON = `<button class="btn" id="btn-inspect" aria-pressed="false" title="Inspect: hover the slide to find its code, click to put the cursor there (Cmd Shift X)">inspect <kbd>Cmd Shift X</kbd></button>`;

export const INSPECT_CRUMBS = `<span id="crumbs" aria-label="The element at the cursor and its parents"></span>`;

export const INSPECT_LAYER = `<div id="insp-layer" aria-hidden="true"></div>`;

/**
 * host.kind()      "html" or "markdown"
 * host.src()       the source textarea in use
 * host.frame()     the preview iframe in use
 * host.sources     both source textareas, to hear the pointer and the caret
 * host.frames      both preview iframes, to hear their keys and scrolling
 * host.htmlMap()   the slide panel's inspectMap(): { root, nodes, slideAt }, or null
 * host.mdMap()     { slides: [[start, end, firstLineEnd, parent, label], …] per slide }, or null
 * host.shown()     the slide the preview shows, or -1
 * host.wrap        { hl, measure }: the Markdown editor's highlight layer and measuring mirror
 * host.caret(pos)  focus the source with the caret at pos, and let the editor follow
 */
export function inspector(host: any): any {
  const doc: any = document;
  const win: any = window;
  const ATTR = "data-dr-n";
  const $ = function (id: string): any { return doc.getElementById(id); };
  const layer = $("insp-layer"), crumbs = $("crumbs"), bar = $("statusbar"), btn = $("btn-inspect");

  function make(cls: string, parent: any): any {
    const d = doc.createElement("div");
    d.className = cls;
    parent.appendChild(d);
    return d;
  }

  const clip = make("insp-clip", layer);
  const ring = { m: make("insp-m", clip), b: make("insp-b", clip), p: make("insp-p", clip), c: make("insp-c", clip) };
  const caretBox = make("insp-sel", clip);
  const tip = make("insp-tip", layer);
  const away = make("insp-away", layer);
  const catcher = make("insp-catch", layer);

  let on = false;
  let hover: any = null;        // { key, from: "src" | "frame" | "crumb", el? }
  let mouse: any = null;        // the pointer over a source textarea: { ta, x, y }
  let picking: any = null;      // the pointer over the preview in inspect mode: { x, y }
  let crumbsKey: string | null = "";
  let crumbsMap: any = null;
  let raf = 0;
  let until = 0;

  // ── Maps: source position ↔ tag key ────────────────────────────────────

  const adapters = new WeakMap();

  function map(): any {
    const html = host.kind() === "html";
    const raw = html ? host.htmlMap() : host.mdMap();
    if (!raw) return null;
    let a = adapters.get(raw);
    if (!a) {
      a = html ? htmlAdapter(raw) : mdAdapter(raw);
      adapters.set(raw, a);
    }
    return a;
  }

  function htmlAdapter(raw: any): any {
    const ids = new Map();
    raw.nodes.forEach(function (n: any, i: number) { ids.set(n, i); });
    function label(n: any): string {
      let id = "", cls = "";
      n.attrs.forEach(function (a: any) {
        if (a.name === "id" && a.value) id = "#" + a.value;
        if (a.name === "class") {
          cls = a.value.trim().split(/\s+/).filter(Boolean).slice(0, 3)
            .map(function (c: string) { return "." + c; }).join("");
        }
      });
      return n.name + id + cls;
    }
    return {
      /** The innermost element whose source holds pos; null when that element is not on the page. */
      at: function (pos: number): string | null {
        let cur = raw.root, deepest: any = null;
        for (;;) {
          const kids = cur.children;
          let next: any = null;
          for (let i = 0; i < kids.length; i++) {
            const c = kids[i];
            if (c.start > pos) break;
            if (c.kind === "el" && pos < c.end) { next = c; break; }
          }
          if (!next) break;
          deepest = cur = next;
        }
        return deepest && ids.has(deepest) ? String(ids.get(deepest)) : null;
      },
      node: function (key: string): any {
        const n = raw.nodes[+key];
        if (!n || String(+key) !== key) return null;
        let p = n.parent;
        while (p && !ids.has(p)) p = p.parent;
        return {
          s: n.start, e: n.end, o: n.openEnd, label: label(n),
          parent: p ? String(ids.get(p)) : null, slide: raw.slideAt(n.start),
        };
      },
    };
  }

  function mdAdapter(raw: any): any {
    return {
      at: function (pos: number): string | null {
        let best: string | null = null, size = Infinity;
        raw.slides.forEach(function (list: any[], k: number) {
          if (!list.length || pos < list[0][0] || pos >= list[0][1]) return;
          for (let j = 0; j < list.length; j++) {
            const n = list[j];
            // Ties go to the later entry, which is the inner one.
            if (pos >= n[0] && pos < n[1] && n[1] - n[0] <= size) { size = n[1] - n[0]; best = k + "." + j; }
          }
        });
        return best;
      },
      node: function (key: string): any {
        const dot = key.indexOf(".");
        const k = +key.slice(0, dot), j = +key.slice(dot + 1);
        const n = raw.slides[k] && raw.slides[k][j];
        if (!n) return null;
        return { s: n[0], e: n[1], o: n[2], label: n[4], parent: n[3] >= 0 ? k + "." + n[3] : null, slide: k };
      },
    };
  }

  // ── Source geometry ────────────────────────────────────────────────────

  const pen = doc.createElement("canvas").getContext("2d");
  let penFont = "";
  let widths: any = {};

  function metrics(ta: any): any {
    const cs = win.getComputedStyle(ta);
    const size = parseFloat(cs.fontSize) || 13;
    const font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    if (font !== penFont) { penFont = font; widths = {}; }
    pen.font = font;
    return {
      lh: parseFloat(cs.lineHeight) || size * 1.5,
      pt: parseFloat(cs.paddingTop) || 0,
      pl: parseFloat(cs.paddingLeft) || 0,
      bt: parseFloat(cs.borderTopWidth) || 0,
      bl: parseFloat(cs.borderLeftWidth) || 0,
      tab: parseFloat(cs.tabSize) || 8,
    };
  }

  function charW(ch: string): number {
    let w = widths[ch];
    if (w === undefined) w = widths[ch] = pen.measureText(ch).width;
    return w;
  }

  let linesText: string | null = null;
  let starts: number[] = [0];

  function lineStarts(text: string): number[] {
    if (text !== linesText) {
      starts = [0];
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
      linesText = text;
    }
    return starts;
  }

  function lineOf(text: string, pos: number): number {
    const st = lineStarts(text);
    let lo = 0, hi = st.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (st[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /** Width of text[a, b) on one unwrapped line, tabs included. */
  function widthOf(text: string, a: number, b: number, mt: any): number {
    const tabW = mt.tab * charW(" ");
    let w = 0;
    for (let i = a; i < b;) {
      const ch = String.fromCodePoint(text.codePointAt(i) as number);
      w += ch === "\t" ? tabW - (w % tabW) : charW(ch);
      i += ch.length;
    }
    return w;
  }

  /**
   * Like a row in DevTools' tree: anywhere on a line counts, so a point in
   * the indentation or past the end is taken as the line's first or last
   * character. Blank lines are nothing's.
   */
  function snap(text: string, pos: number): number {
    const a = text.lastIndexOf("\n", pos - 1) + 1;
    let b = text.indexOf("\n", pos);
    if (b < 0) b = text.length;
    let x = a, y = b;
    while (x < b && /\s/.test(text.charAt(x))) x++;
    while (y > x && /\s/.test(text.charAt(y - 1))) y--;
    return x >= y ? -1 : Math.min(Math.max(pos, x), y - 1);
  }

  function inside(ta: any, x: number, y: number): boolean {
    const r = ta.getBoundingClientRect();
    return x >= r.left && y >= r.top && x < r.left + ta.clientLeft + ta.clientWidth && y < r.top + ta.clientTop + ta.clientHeight;
  }

  /** The HTML source: one line per row, no wrapping, so rows and columns are arithmetic. */
  function posAtRows(ta: any, x: number, y: number): number {
    if (!inside(ta, x, y)) return -1;
    const r = ta.getBoundingClientRect(), mt = metrics(ta), text = ta.value, st = lineStarts(text);
    const line = Math.floor((y - r.top - mt.bt + ta.scrollTop - mt.pt) / mt.lh);
    if (line < 0 || line >= st.length) return -1;
    const a = st[line], b = line + 1 < st.length ? st[line + 1] - 1 : text.length;
    const want = x - r.left - mt.bl + ta.scrollLeft - mt.pl;
    const tabW = mt.tab * charW(" ");
    let w = 0, i = a;
    while (i < b) {
      const ch = String.fromCodePoint(text.codePointAt(i) as number);
      const cw = ch === "\t" ? tabW - (w % tabW) : charW(ch);
      if (want < w + cw) break;
      w += cw;
      i += ch.length;
    }
    return snap(text, i);
  }

  /** The Markdown source wraps, so ask the highlight layer under it, which spells the text out exactly. */
  function posAtWrapped(ta: any, x: number, y: number): number {
    const hl = host.wrap.hl;
    if (!inside(ta, x, y)) return -1;
    let node: any = null, off = 0;
    const t0 = ta.style.pointerEvents, h0 = hl.style.pointerEvents;
    ta.style.pointerEvents = "none";
    hl.style.pointerEvents = "auto";
    try {
      if (doc.caretPositionFromPoint) {
        const p = doc.caretPositionFromPoint(x, y);
        if (p) { node = p.offsetNode; off = p.offset; }
      } else if (doc.caretRangeFromPoint) {
        const rg = doc.caretRangeFromPoint(x, y);
        if (rg) { node = rg.startContainer; off = rg.startOffset; }
      }
    } catch (e) {}
    ta.style.pointerEvents = t0;
    hl.style.pointerEvents = h0;
    if (!node || !hl.contains(node)) return -1;
    const rg = doc.createRange();
    rg.setStart(hl, 0);
    rg.setEnd(node, off);
    return snap(ta.value, Math.min(rg.toString().length, ta.value.length));
  }

  function topOf(pos: number): number {
    const m = host.wrap.measure;
    m.textContent = host.src().value.slice(0, pos);
    const mark = doc.createElement("span");
    mark.textContent = "\u200b";
    m.appendChild(mark);
    return mark.offsetTop;
  }

  let topsMemo: any = null;

  /** An element's lines in the source's content box: all of them, and the ones its open tag spans. */
  function tops(ta: any, n: any): any {
    const md = host.kind() === "markdown";
    const text = ta.value;
    const width = ta.clientWidth;
    if (topsMemo && topsMemo.ta === ta && topsMemo.s === n.s && topsMemo.e === n.e &&
        topsMemo.width === width && topsMemo.text === text) return topsMemo.t;
    const mt = metrics(ta);
    const last = Math.max(n.s, n.e - 1), open = Math.max(n.s, n.o - 1);
    let t: any;
    if (md) {
      t = { top: topOf(n.s), bottom: topOf(last) + mt.lh, open: topOf(open) + mt.lh };
    } else {
      const l1 = lineOf(text, n.s);
      t = { top: mt.pt + l1 * mt.lh, bottom: mt.pt + (lineOf(text, last) + 1) * mt.lh, open: mt.pt + (lineOf(text, open) + 1) * mt.lh };
    }
    t.bt = mt.bt;
    topsMemo = { ta, s: n.s, e: n.e, width, text, t };
    return t;
  }

  /** Scrolls the source so the element's first line is in view, a third of the way down. */
  function reveal(ta: any, n: any): void {
    const t = tops(ta, n);
    const view = ta.clientHeight;
    if (t.top < ta.scrollTop + 4 || t.open > ta.scrollTop + view - 4) ta.scrollTop = Math.max(0, t.top - view * 0.3);
    if (host.kind() === "html") {
      const mt = metrics(ta), text = ta.value;
      const a = lineStarts(text)[lineOf(text, n.s)];
      const x = mt.pl + widthOf(text, a, n.s, mt);
      if (x < ta.scrollLeft + 8 || x > ta.scrollLeft + ta.clientWidth - 80) ta.scrollLeft = Math.max(0, x - 48);
    }
  }

  const bandLayers = new Map();

  function bandsFor(ta: any): any {
    let l = bandLayers.get(ta);
    if (!l) {
      l = doc.createElement("div");
      l.className = "insp-src";
      ta.parentNode.insertBefore(l, ta);
      l.__all = make("insp-band insp-band--all", l);
      l.__open = make("insp-band insp-band--open", l);
      bandLayers.set(ta, l);
    }
    return l;
  }

  function drawBands(n: any): void {
    const ta = host.src();
    bandLayers.forEach(function (l: any, t: any) {
      if (t !== ta) { l.__all.classList.remove("is-on"); l.__open.classList.remove("is-on"); }
    });
    const l = bandsFor(ta);
    l.__all.classList.toggle("is-on", !!n);
    l.__open.classList.toggle("is-on", !!n);
    if (!n) return;
    const t = tops(ta, n);
    const shift = t.bt - ta.scrollTop;
    l.classList.toggle("is-strong", hover.from !== "src");
    l.__all.style.top = l.__open.style.top = t.top + shift + "px";
    l.__all.style.height = t.bottom - t.top + "px";
    l.__open.style.height = t.open - t.top + "px";
  }

  // ── Preview geometry ───────────────────────────────────────────────────

  function frameDoc(): any {
    try { return host.frame().contentDocument; } catch (e) { return null; }
  }

  /** The frame's box, its scale, and the part of it on screen. */
  function frameBox(): any {
    const fr = host.frame();
    if (!fr) return null;
    const r = fr.getBoundingClientRect();
    if (!r.width || !r.height || !fr.clientWidth || !fr.clientHeight) return null;
    let L = Math.max(0, r.left), T = Math.max(0, r.top);
    let R = Math.min(win.innerWidth, r.right), B = Math.min(win.innerHeight, r.bottom);
    [fr.parentElement, fr.closest("#pane-prev")].forEach(function (p: any) {
      if (!p) return;
      const q = p.getBoundingClientRect();
      L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom);
    });
    if (R <= L || B <= T) return null;
    return { r, sx: r.width / fr.clientWidth, sy: r.height / fr.clientHeight, clip: { left: L, top: T, right: R, bottom: B } };
  }

  /** Painted, on screen in the frame, and not faded or hidden: a slide the deck is not showing fails. */
  function onScreen(el: any): boolean {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const w = el.ownerDocument.defaultView;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= w.innerWidth || r.top >= w.innerHeight) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return true;
  }

  function liveFor(key: string): any {
    const d = frameDoc();
    if (!d) return null;
    let list: any;
    try { list = d.querySelectorAll("[" + ATTR + '="' + key + '"]'); } catch (e) { return null; }
    for (let i = 0; i < list.length; i++) if (onScreen(list[i])) return list[i];
    return null;
  }

  function place(div: any, x: number, y: number, w: number, h: number, edge?: number[]): void {
    const s = div.style;
    s.left = x + "px";
    s.top = y + "px";
    s.width = Math.max(0, w) + "px";
    s.height = Math.max(0, h) + "px";
    if (edge) s.borderWidth = edge[0] + "px " + edge[1] + "px " + edge[2] + "px " + edge[3] + "px";
  }

  /** The element's border box on the editor page, and its size in the deck's own CSS pixels. */
  function boxOf(el: any, g: any): any {
    const r = el.getBoundingClientRect();
    const ow = el.offsetWidth, oh = el.offsetHeight;
    return {
      x: g.r.left + r.left * g.sx, y: g.r.top + r.top * g.sy, w: r.width * g.sx, h: r.height * g.sy,
      kx: (ow ? r.width / ow : 1) * g.sx, ky: (oh ? r.height / oh : 1) * g.sy,
      cw: typeof ow === "number" ? ow : r.width, ch: typeof oh === "number" ? oh : r.height,
    };
  }

  function drawRings(el: any, box: any, g: any): void {
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    const sides = function (pre: string, post: string): number[] {
      return [
        (parseFloat(cs[pre + "Top" + post]) || 0) * box.ky, (parseFloat(cs[pre + "Right" + post]) || 0) * box.kx,
        (parseFloat(cs[pre + "Bottom" + post]) || 0) * box.ky, (parseFloat(cs[pre + "Left" + post]) || 0) * box.kx,
      ].map(function (v) { return Math.max(0, v); });
    };
    const m = sides("margin", ""), b = sides("border", "Width"), p = sides("padding", "");
    const x = box.x - g.clip.left, y = box.y - g.clip.top;
    place(ring.m, x - m[3], y - m[0], box.w + m[1] + m[3], box.h + m[0] + m[2], m);
    place(ring.b, x, y, box.w, box.h, b);
    place(ring.p, x + b[3], y + b[0], box.w - b[1] - b[3], box.h - b[0] - b[2], p);
    place(ring.c, x + b[3] + p[3], y + b[0] + p[0], box.w - b[1] - b[3] - p[1] - p[3], box.h - b[0] - b[2] - p[0] - p[2]);
  }

  function showRings(show: boolean): void {
    [ring.m, ring.b, ring.p, ring.c].forEach(function (d) { d.classList.toggle("is-on", show); });
  }

  function size(v: number): string {
    return String(Math.round(v * 100) / 100);
  }

  function drawTip(label: string, box: any, g: any): void {
    const name = (/^[^#.]*/.exec(label) as any)[0];
    tip.textContent = "";
    const b = doc.createElement("b"), i = doc.createElement("i"), dims = doc.createElement("span");
    b.textContent = name;
    i.textContent = label.slice(name.length);
    dims.textContent = size(box.cw) + " \u00d7 " + size(box.ch);
    tip.appendChild(b);
    tip.appendChild(i);
    tip.appendChild(dims);
    tip.classList.add("is-on");
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top = box.y + box.h + 6;
    if (top + th > g.clip.bottom) top = box.y - th - 6;
    if (top < g.clip.top) top = Math.min(g.clip.bottom - th, Math.max(g.clip.top, box.y) + 6);
    const left = Math.max(g.clip.left + 4, Math.min(box.x, g.clip.right - tw - 4));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function drawAway(n: any, g: any): void {
    const shown = host.shown();
    away.textContent = n.slide >= 0 && n.slide !== shown
      ? n.label + " is on slide " + (n.slide + 1)
      : n.label + " isn't visible in the preview";
    away.classList.add("is-on");
    away.style.left = Math.max(g.clip.left + 4, (g.clip.left + g.clip.right - away.offsetWidth) / 2) + "px";
    away.style.top = g.clip.top + 10 + "px";
  }

  // ── Drawing ────────────────────────────────────────────────────────────

  function draw(): void {
    const g = frameBox();
    const m = map();
    if (g) {
      place(clip, g.clip.left, g.clip.top, g.clip.right - g.clip.left, g.clip.bottom - g.clip.top);
      if (on) place(catcher, g.clip.left, g.clip.top, g.clip.right - g.clip.left, g.clip.bottom - g.clip.top);
    }
    clip.classList.toggle("is-on", !!g);
    catcher.classList.toggle("is-on", on && !!g);

    // The hovered element: DevTools' rings and label, or a note when it is off the slide.
    const n = hover && m ? m.node(hover.key) : null;
    let el: any = null;
    if (n && g) el = hover.el && onScreen(hover.el) ? hover.el : liveFor(hover.key);
    if (el) {
      const box = boxOf(el, g);
      drawRings(el, box, g);
      drawTip(n.label, box, g);
    } else {
      tip.classList.remove("is-on");
    }
    showRings(!!el);
    if (n && g && !el) drawAway(n, g); else away.classList.remove("is-on");

    // The caret's element, while the source has focus.
    const ta = host.src();
    const ck = m && doc.activeElement === ta ? m.at(ta.selectionStart) : null;
    const cel = ck && g ? liveFor(ck) : null;
    if (cel) {
      const box = boxOf(cel, g);
      place(caretBox, box.x - g.clip.left, box.y - g.clip.top, box.w, box.h);
    }
    caretBox.classList.toggle("is-on", !!cel);

    drawBands(n);
    paintCrumbs(m);
  }

  function tick(): void {
    raf = 0;
    try { draw(); } catch (e) {}
    if (on || hover || Date.now() < until) raf = win.requestAnimationFrame(tick);
  }

  /** Redraws for a while: long enough for a slide transition or a re-render to settle. */
  function kick(): void {
    until = Math.max(until, Date.now() + 800);
    if (!raf) raf = win.requestAnimationFrame(tick);
  }

  function setHover(h: any): void {
    if (!h && !hover) return;
    if (h && hover && h.key === hover.key && h.from === hover.from && h.el === hover.el) return;
    const before = hover;
    hover = h;
    if (h && h.from === "frame" && (!before || before.key !== h.key)) {
      const m = map();
      const n = m && m.node(h.key);
      if (n) reveal(host.src(), n);
    }
    kick();
  }

  // ── Breadcrumbs: the caret's element and its parents ───────────────────

  function paintCrumbs(m: any): void {
    if (!m) { crumbs.classList.add("is-stale"); return; }
    crumbs.classList.remove("is-stale");
    const key = m.at(host.src().selectionStart);
    if (key === crumbsKey && m === crumbsMap) return;
    crumbsKey = key;
    crumbsMap = m;
    crumbs.textContent = "";
    bar.classList.toggle("has-crumbs", !!key);
    if (!key) return;
    const chain: any[] = [];
    for (let k: string | null = key; k;) {
      const n = m.node(k);
      if (!n) break;
      chain.unshift({ k, n });
      k = n.parent;
    }
    // Every HTML path starts at <html>; it says nothing.
    if (chain.length > 1 && /^html(?![\w-])/.test(chain[0].n.label)) chain.shift();
    chain.forEach(function (c: any, i: number) {
      if (i) {
        const sep = doc.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "\u203a";
        crumbs.appendChild(sep);
      }
      const b = doc.createElement("button");
      b.className = "crumb" + (i === chain.length - 1 ? " is-cur" : "");
      b.textContent = c.n.label;
      b.title = c.n.label;
      b.addEventListener("mouseenter", function () { setHover({ key: c.k, from: "crumb" }); });
      b.addEventListener("mouseleave", function () { if (hover && hover.from === "crumb") setHover(null); });
      b.addEventListener("click", function () {
        const cur = map();
        const n = cur === m && cur.node(c.k);
        if (!n) return;
        setHover(null);
        reveal(host.src(), n);
        host.caret(n.s);
        kick();
      });
      crumbs.appendChild(b);
    });
    // Too long for the bar: the innermost crumbs stay, the outer ones fold into "…".
    while (crumbs.scrollWidth > crumbs.clientWidth && crumbs.querySelectorAll(".crumb").length > 1) {
      const first = crumbs.querySelector(".crumb");
      const sep = first.nextSibling;
      first.remove();
      if (sep && sep.className === "crumb-sep") sep.remove();
      if (!crumbs.querySelector(".crumb-more")) {
        const more = doc.createElement("span");
        more.className = "crumb-more";
        more.textContent = "\u2026 \u203a";
        crumbs.insertBefore(more, crumbs.firstChild);
      }
    }
  }

  // ── Hovering the source ────────────────────────────────────────────────

  let srcQueued = false;

  function srcHit(): void {
    if (!mouse || mouse.ta !== host.src()) return;
    const m = map();
    const pos = !m ? -1 : host.kind() === "markdown"
      ? posAtWrapped(mouse.ta, mouse.x, mouse.y)
      : posAtRows(mouse.ta, mouse.x, mouse.y);
    const key = pos >= 0 ? m.at(pos) : null;
    if (key) setHover({ key, from: "src" });
    else if (hover && hover.from === "src") setHover(null);
  }

  function queueSrc(): void {
    if (srcQueued || !mouse) return;
    srcQueued = true;
    win.requestAnimationFrame(function () { srcQueued = false; srcHit(); });
  }

  function watchSource(ta: any): void {
    ta.addEventListener("mousemove", function (e: any) {
      mouse = { ta, x: e.clientX, y: e.clientY };
      queueSrc();
    });
    ta.addEventListener("mouseleave", function () {
      mouse = null;
      if (hover && hover.from === "src") setHover(null);
    });
    ta.addEventListener("scroll", function () { queueSrc(); kick(); });
    // Typing is not hovering: the caret's outline says what is being edited.
    ["keydown", "input"].forEach(function (t) {
      ta.addEventListener(t, function () { if (hover && hover.from === "src") setHover(null); kick(); });
    });
    ["keyup", "mouseup", "focus", "blur", "select"].forEach(function (t) { ta.addEventListener(t, kick); });
  }
  (host.sources || []).forEach(watchSource);

  // ── Inspect mode: picking on the preview ───────────────────────────────

  let pickQueued = false;

  function pickAt(x: number, y: number): void {
    const g = frameBox(), m = map(), d = frameDoc();
    let found: any = null;
    if (g && m && d) {
      try {
        const list = d.elementsFromPoint((x - g.r.left) / g.sx, (y - g.r.top) / g.sy);
        for (let i = 0; i < list.length; i++) {
          if (list[i].hasAttribute && list[i].hasAttribute(ATTR)) { found = list[i]; break; }
        }
      } catch (e) {}
    }
    const key = found && found.getAttribute(ATTR);
    if (key && m.node(key)) setHover({ key, from: "frame", el: found });
    else if (hover && hover.from === "frame") setHover(null);
  }

  catcher.addEventListener("mousemove", function (e: any) {
    picking = { x: e.clientX, y: e.clientY };
    if (pickQueued) return;
    pickQueued = true;
    win.requestAnimationFrame(function () {
      pickQueued = false;
      if (picking) pickAt(picking.x, picking.y);
    });
  });
  catcher.addEventListener("mouseleave", function () {
    picking = null;
    if (hover && hover.from === "frame") setHover(null);
  });
  catcher.addEventListener("mousedown", function (e: any) { e.preventDefault(); });
  catcher.addEventListener("click", function (e: any) {
    e.preventDefault();
    pickAt(e.clientX, e.clientY);
    const m = map();
    const n = hover && hover.from === "frame" && m ? m.node(hover.key) : null;
    setInspect(false);
    if (n) host.caret(n.s);
  });
  catcher.addEventListener("contextmenu", function (e: any) {
    e.preventDefault();
    setInspect(false);
  });
  // The deck's own wheel handling is off while picking; plain scrolling still works.
  catcher.addEventListener("wheel", function (e: any) {
    e.preventDefault();
    const g = frameBox();
    try { host.frame().contentWindow.scrollBy(e.deltaX / (g ? g.sx : 1), e.deltaY / (g ? g.sy : 1)); } catch (err) {}
    if (picking) pickAt(picking.x, picking.y);
  }, { passive: false });

  function setInspect(next: boolean): void {
    if (next === on) return;
    on = next;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!on) {
      picking = null;
      if (hover && hover.from === "frame") setHover(null);
    }
    kick();
  }

  function onKey(e: any): void {
    if (e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && !e.altKey && (e.code === "KeyX" || (e.key || "").toLowerCase() === "x")) {
      e.preventDefault();
      e.stopPropagation();
      setInspect(!on);
    } else if (on && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setInspect(false);
    }
  }

  doc.addEventListener("keydown", onKey, true);
  btn.addEventListener("click", function () { setInspect(!on); });

  /** A preview document: hear its keys (focus may sit in it) and redraw when it scrolls or moves. */
  function hook(w: any): void {
    try {
      if (!w || w.__drInspect) return;
      w.__drInspect = true;
      w.addEventListener("keydown", onKey, true);
      ["scroll", "resize", "hashchange", "transitionend", "animationend"].forEach(function (t) {
        w.addEventListener(t, kick, true);
      });
    } catch (e) {}
  }

  (host.frames || []).forEach(function (f: any) {
    f.addEventListener("load", function () { hook(f.contentWindow); srcHit(); kick(); });
    hook(f.contentWindow);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(kick);
      ro.observe(f);
      if (f.parentElement) ro.observe(f.parentElement);
    }
  });
  win.addEventListener("resize", kick);

  return {
    /** The preview or its map changed. */
    refresh: function (): void { srcHit(); kick(); },
    /** The caret moved in the source. */
    caretMoved: kick,
    /** A preview document is up. */
    ready: function (w: any): void { hook(w); srcHit(); kick(); },
    /** A different document was opened. */
    reset: function (): void {
      setInspect(false);
      mouse = null;
      setHover(null);
      crumbsKey = "";
      crumbsMap = null;
      crumbs.textContent = "";
      bar.classList.remove("has-crumbs");
      kick();
    },
    toggle: function (): void { setInspect(!on); },
    /** The innermost element whose source holds pos, as { s, e, label, slide }; null while the map is stale. */
    elementAt: function (pos: number): any {
      const m = map();
      const key = m && m.at(pos);
      return key ? m.node(key) : null;
    },
    /** The source of a preview element (or the nearest tagged one around it). */
    elementFor: function (el: any): any {
      const m = map();
      while (el && el.nodeType !== 1) el = el.parentNode;
      const tagged = el && el.closest ? el.closest("[" + ATTR + "]") : null;
      return m && tagged ? m.node(tagged.getAttribute(ATTR)) : null;
    },
  };
}

/** Defines `deckrunInspect(host)` on the page. */
export const INSPECT_RUNTIME = `window.deckrunInspect = ${inspector.toString()};`;
