/**
 * The source side of the design view: what a click on the canvas or a
 * change in the properties panel does to the HTML text. Every change is an
 * edit of one element's inline `style` or attributes, a new element written
 * into a slide, or one element rewritten (a table that grows a column, a
 * paragraph that becomes a list) — so the rest of the file stays byte for
 * byte as its author wrote it, and the deck's own CSS and runtime are never
 * touched.
 *
 * It works on the offset-tracking tree from `html-slides.ts`, which it takes
 * as `S`. Like that module it ships to the page through `toString()`, so it
 * is self-contained and never spells a comment opener or a script tag.
 */

export interface DesignEdit { at: number; del: number; ins: string; }

export interface DesignRgba { r: number; g: number; b: number; a: number; }

export interface DesignShadow { inset: boolean; x: number; y: number; blur: number; spread: number; color: string; }

export interface DesignBox { x: number; y: number; w: number; h: number; }

export interface DesignKit {
  decls(style: string): Array<{ prop: string; value: string }>;
  styleMap(style: string): Record<string, string>;
  editStyle(style: string, changes: Record<string, string | null>): string;
  attr(el: any, name: string): any;
  setStyle(src: string, el: any, changes: Record<string, string | null>): string;
  setStyles(src: string, list: Array<{ el: any; changes: Record<string, string | null> }>): string;
  styleEdit(src: string, el: any, changes: Record<string, string | null>): DesignEdit | null;
  attrEdit(src: string, el: any, name: string, value: string | null): DesignEdit | null;
  setAttr(src: string, el: any, name: string, value: string | null): string;
  apply(src: string, edits: Array<DesignEdit | null>): string;
  insertEnd(src: string, parent: any, html: string): { edit: DesignEdit; start: number };
  insertAfter(src: string, el: any, html: string): { edit: DesignEdit; start: number };
  removeEdit(src: string, el: any): DesignEdit;
  moveEdits(src: string, el: any, where: "first" | "last"): { edits: DesignEdit[]; start: number } | null;
  outer(src: string, el: any): string;
  replace(src: string, el: any, html: string): string;
  renameTag(src: string, el: any, name: string): string;
  textBox(o: any): string;
  shape(kind: string, o: any): string;
  table(o: any): string;
  image(o: any): string;
  video(o: any): string;
  line(o: any): string;
  lineGeom(html: string): any;
  shapeKinds(): Array<{ id: string; label: string; key: string }>;
  tableInfo(src: string, table: any): any;
  tableSize(src: string, table: any, rows: number, cols: number): string;
  tableHeader(src: string, table: any, on: boolean): string;
  tableColWidth(src: string, table: any, i: number, value: string | null): string;
  cellRole(src: string, cell: any, header: boolean): string;
  listKind(el: any): string;
  listify(src: string, el: any, kind: string): string;
  rgba(s: string): DesignRgba | null;
  hex(c: DesignRgba): string;
  css(c: DesignRgba): string;
  shadows(s: string): DesignShadow[];
  shadowCss(list: DesignShadow[]): string;
  sides(s: string): number[];
  splitTop(s: string, sep: string): string[];
  num(v: any): number;
  px(n: number): string;
  quoteFamilies(s: string): string;
  assetRefs(html: string): Array<{ start: number; end: number; url: string }>;
  transitions(): Array<{ id: string; label: string }>;
  frames(name: string, dir: number): any[] | null;
  stripHidden(m: any): string;
}

export function designKit(S: any): DesignKit {
  const CELL_PAD = "8px 14px";
  const CELL_LINE = "1px solid rgba(128,128,128,.5)";
  const HEAD_FILL = "rgba(128,128,128,.18)";
  const SHAPE_FILL = "#9AA0A6";

  // ── Inline styles ──────────────────────────────────────────────────────

  /**
   * Splits on the separators that matter: a `;` inside quotes or parens (a
   * data: URL, a font name) belongs to its value.
   */
  function splitTop(s: string, sep: string): string[] {
    const out: string[] = [];
    let depth = 0, quote = "", start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (c === sep && !depth) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out;
  }

  function decls(style: string): Array<{ prop: string; value: string }> {
    const out: Array<{ prop: string; value: string }> = [];
    splitTop(style || "", ";").forEach(function (part) {
      const at = part.indexOf(":");
      if (at < 0) return;
      const prop = part.slice(0, at).trim().toLowerCase();
      const value = part.slice(at + 1).trim();
      if (prop) out.push({ prop, value });
    });
    return out;
  }

  function styleMap(style: string): Record<string, string> {
    const m: Record<string, string> = {};
    decls(style).forEach(function (d) { m[d.prop] = d.value; });
    return m;
  }

  /**
   * Changes some declarations and keeps the rest as written: a changed one
   * stays where it was, a new one goes at the end, a null takes it out. The
   * spacing follows the attribute's own (`a:b;c:d` or `a: b; c: d`).
   */
  function editStyle(style: string, changes: Record<string, string | null>): string {
    const roomy = /:\s/.test(style || "") && /;\s/.test(style || "");
    const parts = splitTop(style || "", ";");
    const done: Record<string, 1> = {};
    const kept: string[] = [];
    parts.forEach(function (part) {
      const at = part.indexOf(":");
      if (at < 0) { if (part.trim()) kept.push(part.trim()); return; }
      const prop = part.slice(0, at).trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(changes, prop)) { kept.push(part.trim()); return; }
      if (done[prop]) return;
      done[prop] = 1;
      const v = changes[prop];
      if (v !== null && v !== undefined && v !== "") kept.push(prop + (roomy ? ": " : ":") + v);
    });
    Object.keys(changes).forEach(function (prop) {
      const v = changes[prop];
      if (done[prop] || v === null || v === undefined || v === "") return;
      kept.push(prop + (roomy ? ": " : ":") + v);
    });
    return kept.join(roomy ? "; " : ";");
  }

  // ── Elements in the source ─────────────────────────────────────────────

  function attr(el: any, name: string): any {
    for (let i = 0; i < el.attrs.length; i++) if (el.attrs[i].name === name) return el.attrs[i];
    return null;
  }

  function attrPos(src: string, el: any): number {
    let at = el.openEnd;
    if (src.charAt(at - 1) !== ">") return -1;
    at--;
    if (src.charAt(at - 1) === "/") at--;
    return at;
  }

  /** The value written out for an attribute, in whichever quote it needs least. */
  function quoted(value: string, prefer: string): string {
    const q = prefer === "'" ? "'" : '"';
    const other = q === '"' ? "'" : '"';
    const pick = value.indexOf(q) >= 0 && value.indexOf(other) < 0 ? other : q;
    let v = value.replace(/&/g, "&amp;");
    v = pick === '"' ? v.replace(/"/g, "&quot;") : v.replace(/'/g, "&#39;");
    return pick + v + pick;
  }

  function attrEdit(src: string, el: any, name: string, value: string | null): DesignEdit | null {
    const a = attr(el, name);
    if (a) {
      if (value === null) {
        let s = a.start;
        while (s > el.start && /[ \t\r\n]/.test(src.charAt(s - 1))) s--;
        return { at: s, del: a.end - s, ins: "" };
      }
      return { at: a.start, del: a.end - a.start, ins: name + "=" + quoted(value, a.quote) };
    }
    if (value === null) return null;
    const at = attrPos(src, el);
    if (at < 0) return null;
    return { at, del: 0, ins: " " + name + "=" + quoted(value, '"') };
  }

  function styleEdit(src: string, el: any, changes: Record<string, string | null>): DesignEdit | null {
    const a = attr(el, "style");
    const next = editStyle(a ? a.value : "", changes);
    if (a && next === a.value) return null;
    return attrEdit(src, el, "style", next ? next : null);
  }

  function apply(src: string, edits: Array<DesignEdit | null>): string {
    const list = edits.filter(function (e) { return !!e && e.at >= 0; }) as DesignEdit[];
    list.sort(function (a, b) { return b.at - a.at; });
    let out = src;
    let floor = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      // Overlapping edits cannot both land; the later one in the text wins.
      if (e.at + e.del > floor) continue;
      out = out.slice(0, e.at) + e.ins + out.slice(e.at + e.del);
      floor = e.at;
    }
    return out;
  }

  function setStyle(src: string, el: any, changes: Record<string, string | null>): string {
    return apply(src, [styleEdit(src, el, changes)]);
  }

  function setStyles(src: string, list: Array<{ el: any; changes: Record<string, string | null> }>): string {
    return apply(src, list.map(function (x) { return styleEdit(src, x.el, x.changes); }));
  }

  function setAttr(src: string, el: any, name: string, value: string | null): string {
    return apply(src, [attrEdit(src, el, name, value)]);
  }

  function lineStart(src: string, pos: number): number {
    return src.lastIndexOf("\n", pos - 1) + 1;
  }

  function indentAt(src: string, pos: number): string {
    const ls = lineStart(src, pos);
    return (/^[ \t]*/.exec(src.slice(ls, pos)) as any)[0];
  }

  function ownLine(src: string, el: any): boolean {
    const ls = lineStart(src, el.start);
    return /^[ \t]*$/.test(src.slice(ls, el.start));
  }

  function elKids(el: any): any[] {
    return el.children.filter(function (c: any) { return c.kind === "el"; });
  }

  /** The indentation a new child of `parent` should take. */
  function childIndent(src: string, parent: any): string {
    const kids = elKids(parent);
    for (let i = kids.length - 1; i >= 0; i--) if (ownLine(src, kids[i])) return indentAt(src, kids[i].start);
    const own = indentAt(src, parent.start);
    return own + (/\t/.test(own) ? "\t" : "  ");
  }

  /** `html` as the last child of `parent`, on a line of its own. */
  function insertEnd(src: string, parent: any, html: string): { edit: DesignEdit; start: number } {
    const close = parent.closeStart;
    const ind = childIndent(src, parent);
    const ls = lineStart(src, close);
    if (close > parent.openEnd && /^[ \t]*$/.test(src.slice(ls, close))) {
      return { edit: { at: ls, del: 0, ins: ind + html + "\n" }, start: ls + ind.length };
    }
    const tail = "\n" + indentAt(src, parent.start);
    return { edit: { at: close, del: 0, ins: "\n" + ind + html + tail }, start: close + 1 + ind.length };
  }

  /** `html` right after `el`, as its next sibling. */
  function insertAfter(src: string, el: any, html: string): { edit: DesignEdit; start: number } {
    if (ownLine(src, el)) {
      const ind = indentAt(src, el.start);
      return { edit: { at: el.end, del: 0, ins: "\n" + ind + html }, start: el.end + 1 + ind.length };
    }
    return { edit: { at: el.end, del: 0, ins: html }, start: el.end };
  }

  /** Takes the element out, and its line with it when it had the line to itself. */
  function removeEdit(src: string, el: any): DesignEdit {
    const ls = lineStart(src, el.start);
    let le = src.indexOf("\n", el.end);
    if (le < 0) le = src.length;
    if (/^[ \t]*$/.test(src.slice(ls, el.start)) && /^[ \t\r]*$/.test(src.slice(el.end, le))) {
      return { at: ls, del: Math.min(src.length, le + 1) - ls, ins: "" };
    }
    return { at: el.start, del: el.end - el.start, ins: "" };
  }

  /** Moves the element to the front or the back of its siblings: painted last or first. */
  function moveEdits(src: string, el: any, where: "first" | "last"): { edits: DesignEdit[]; start: number } | null {
    const p = el.parent;
    if (!p) return null;
    const kids = elKids(p);
    if (kids.length < 2) return null;
    if ((where === "last" && kids[kids.length - 1] === el) || (where === "first" && kids[0] === el)) return null;
    const text = src.slice(el.start, el.end);
    const cut = removeEdit(src, el);
    if (where === "last") {
      const ins = insertEnd(src, p, text);
      // The cut comes before the insertion point, so the new start shifts back by what was cut.
      return { edits: [cut, ins.edit], start: ins.start - (cut.at < ins.edit.at ? cut.del : 0) };
    }
    const firstKid = kids[0];
    if (ownLine(src, firstKid)) {
      const ls = lineStart(src, firstKid.start);
      const ind = indentAt(src, firstKid.start);
      return { edits: [cut, { at: ls, del: 0, ins: ind + text + "\n" }], start: ls + ind.length };
    }
    return { edits: [cut, { at: firstKid.start, del: 0, ins: text }], start: firstKid.start };
  }

  function outer(src: string, el: any): string {
    return src.slice(el.start, el.end);
  }

  function replace(src: string, el: any, html: string): string {
    return src.slice(0, el.start) + html + src.slice(el.end);
  }

  function renameTag(src: string, el: any, name: string): string {
    const edits: DesignEdit[] = [{ at: el.start + 1, del: el.name.length, ins: name }];
    const close = src.slice(el.closeStart, el.end);
    const m = /^<\/([A-Za-z][^\s/>]*)/.exec(close);
    if (m && el.closeStart < el.end) edits.push({ at: el.closeStart + 2, del: m[1].length, ins: name });
    return apply(src, edits);
  }

  // ── New elements ───────────────────────────────────────────────────────

  function px(n: number): string {
    const r = Math.round(n * 100) / 100;
    return (r === 0 ? 0 : r) + "px";
  }

  function num(v: any): number {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function at(o: any): string {
    return "position:absolute;left:" + px(o.x) + ";top:" + px(o.y);
  }

  function escText(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escAttr(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function textBox(o: any): string {
    let style = at(o) + ";width:" + px(o.w) + ";margin:0";
    if (o.h) style += ";height:" + px(o.h);
    if (o.font) style += ";" + o.font;
    return '<p data-dz="text" style="' + escAttr(style) + '">' + escText(o.text || "Text") + "</p>";
  }

  const SHAPES = [
    { id: "rect", label: "Rectangle", key: "R" },
    { id: "rounded", label: "Rounded rectangle", key: "Shift+R" },
    { id: "ellipse", label: "Ellipse", key: "O" },
    { id: "diamond", label: "Diamond (decision)", key: "D" },
    { id: "arrow-right", label: "Arrow right", key: "" },
    { id: "arrow-left", label: "Arrow left", key: "" },
    { id: "arrow-up", label: "Arrow up", key: "" },
    { id: "arrow-down", label: "Arrow down", key: "" },
    { id: "line", label: "Line", key: "L" },
    { id: "connector", label: "Connector", key: "Shift+L" },
  ];

  // Outlines drawn in a 100 × 100 box that stretches with the shape.
  const PATHS: Record<string, string> = {
    diamond: "M50 0L100 50L50 100L0 50Z",
    "arrow-right": "M0 28H58V4L100 50L58 96V72H0Z",
    "arrow-left": "M100 28H42V4L0 50L42 96V72H100Z",
    "arrow-up": "M28 100V42H4L50 0L96 42H72V100Z",
    "arrow-down": "M28 0V58H4L50 100L96 58H72V0Z",
  };

  function shapeKinds(): Array<{ id: string; label: string; key: string }> {
    return SHAPES.slice();
  }

  /**
   * A shape is a box that can hold a line of text. Rectangles and ellipses
   * paint with CSS; the outlines CSS cannot draw are an SVG path stretched
   * to the box, whose fill and stroke stand in for background and border.
   */
  function shape(kind: string, o: any): string {
    const fill = o.fill || SHAPE_FILL;
    let style = at(o) + ";width:" + px(o.w) + ";height:" + px(o.h) +
      ";display:flex;align-items:center;justify-content:center;text-align:center";
    let inner = "";
    if (PATHS[kind]) {
      inner = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">' +
        '<path d="' + PATHS[kind] + '" fill="' + escAttr(fill) + '" vector-effect="non-scaling-stroke"/></svg>';
    } else {
      style += ";background:" + fill;
      if (kind === "rounded") style += ";border-radius:24px";
      if (kind === "ellipse") style += ";border-radius:50%";
    }
    return '<div data-dz="' + kind + '" style="' + escAttr(style) + '">' + inner +
      '<p style="position:relative;margin:0"></p></div>';
  }

  function table(o: any): string {
    const rows = Math.max(1, o.rows || 3), cols = Math.max(1, o.cols || 3);
    // A cell's height is its least height: an empty row keeps one line's room.
    const cell = "padding:" + CELL_PAD + ";border:" + CELL_LINE + ";text-align:left;vertical-align:top;height:1.4em";
    const ind = o.indent === undefined ? "" : o.indent;
    let out = '<table data-dz="table" style="' + escAttr(at(o) + ";width:" + px(o.w) + ";border-collapse:collapse" +
      (o.font ? ";" + o.font : "")) + '">';
    for (let r = 0; r < rows; r++) {
      out += "\n" + ind + "  <tr>";
      for (let c = 0; c < cols; c++) {
        out += r === 0 && o.header !== false
          ? '<th style="' + escAttr(cell + ";background:" + HEAD_FILL + ";font-weight:700") + '">Column</th>'
          : '<td style="' + escAttr(cell) + '"></td>';
      }
      out += "</tr>";
    }
    return out + "\n" + ind + "</table>";
  }

  function image(o: any): string {
    return '<img data-dz="image" src="' + escAttr(o.src) + '" alt="' + escAttr(o.alt || "") + '" style="' +
      escAttr(at(o) + ";width:" + px(o.w) + ";height:" + px(o.h) + ";object-fit:cover") + '">';
  }

  function video(o: any): string {
    return '<video data-dz="video" src="' + escAttr(o.src) + '" controls playsinline preload="metadata" style="' +
      escAttr(at(o) + ";width:" + px(o.w) + ";height:" + px(o.h) + ";object-fit:cover;background:#000") + '"></video>';
  }

  /** A head for the end at (x2, y2), pointing away from (x1, y1). */
  function arrowHead(x1: number, y1: number, x2: number, y2: number, w: number): string {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const size = Math.max(9, w * 3.2);
    const bx = x2 - ux * size, by = y2 - uy * size;
    const nx = -uy * size * 0.55, ny = ux * size * 0.55;
    const r = function (n: number): string { return String(Math.round(n * 10) / 10); };
    return "M" + r(x2) + " " + r(y2) + "L" + r(bx + nx) + " " + r(by + ny) + "L" + r(bx - nx) + " " + r(by - ny) + "Z";
  }

  /**
   * A line from (x1, y1) to (x2, y2) in slide pixels: an SVG that spans the
   * two ends, so it moves like any other box. A connector carries an arrow
   * head; either end may also name the box it is attached to.
   */
  function line(o: any): string {
    const color = o.color || SHAPE_FILL;
    const w = o.width || 3;
    const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2);
    const bw = Math.max(1, Math.abs(o.x2 - o.x1)), bh = Math.max(1, Math.abs(o.y2 - o.y1));
    const a = { x: o.x1 - x, y: o.y1 - y }, b = { x: o.x2 - x, y: o.y2 - y };
    const r = function (n: number): string { return String(Math.round(n * 10) / 10); };
    let attrs = ' data-dz="' + (o.kind || "line") + '"';
    if (o.from) attrs += ' data-from="' + escAttr(o.from) + '"';
    if (o.to) attrs += ' data-to="' + escAttr(o.to) + '"';
    if (o.head === false) attrs += ' data-head="none"';
    if (o.tail) attrs += ' data-tail="arrow"';
    let body = '<line x1="' + r(a.x) + '" y1="' + r(a.y) + '" x2="' + r(b.x) + '" y2="' + r(b.y) +
      '" stroke="' + escAttr(color) + '" stroke-width="' + w + '" stroke-linecap="round"' +
      (o.dash ? ' stroke-dasharray="' + escAttr(o.dash) + '"' : "") + "/>";
    const kind = o.kind || "line";
    if (kind === "connector" && o.head !== false) body += '<path d="' + arrowHead(a.x, a.y, b.x, b.y, w) + '" fill="' + escAttr(color) + '"/>';
    if (o.tail) body += '<path d="' + arrowHead(b.x, b.y, a.x, a.y, w) + '" fill="' + escAttr(color) + '"/>';
    let style = "position:absolute;left:" + px(x) + ";top:" + px(y) + ";width:" + px(bw) + ";height:" + px(bh) + ";overflow:visible";
    // Whatever else the line was given (opacity, z-index, a filter) stays with it when it is redrawn.
    const own: Record<string, 1> = { position: 1, left: 1, top: 1, width: 1, height: 1, overflow: 1 };
    if (o.style) Object.keys(o.style).forEach(function (k) { if (!own[k] && o.style[k]) style += ";" + k + ":" + o.style[k]; });
    return '<svg' + attrs + ' viewBox="0 0 ' + r(bw) + " " + r(bh) + '" style="' + escAttr(style) + '">' + body + "</svg>";
  }

  /** A line's ends and look, read back from its markup, in slide pixels. */
  function lineGeom(html: string): any {
    const root = S.parse(html);
    let svg: any = null, ln: any = null;
    (function find(el: any): void {
      el.children.forEach(function (c: any) {
        if (c.kind !== "el") return;
        if (!svg && c.name === "svg") svg = c;
        if (svg && !ln && c.name === "line") ln = c;
        find(c);
      });
    })(root);
    if (!svg || !ln) return null;
    const st = styleMap((attr(svg, "style") || { value: "" }).value);
    const ox = num(st.left), oy = num(st.top);
    const g = function (n: string): number { const a = attr(ln, n); return a ? num(a.value) : 0; };
    const v = function (el: any, n: string): string { const a = attr(el, n); return a ? a.value : ""; };
    return {
      kind: v(svg, "data-dz") || "line",
      x1: ox + g("x1"), y1: oy + g("y1"), x2: ox + g("x2"), y2: oy + g("y2"),
      color: v(ln, "stroke") || SHAPE_FILL,
      width: num(v(ln, "stroke-width")) || 3,
      dash: v(ln, "stroke-dasharray"),
      from: v(svg, "data-from"), to: v(svg, "data-to"),
      head: v(svg, "data-head") !== "none",
      tail: v(svg, "data-tail") === "arrow",
      style: st,
    };
  }

  // ── Tables ─────────────────────────────────────────────────────────────

  function tableInfo(src: string, tbl: any): any {
    const rows: any[] = [];
    const visit = function (el: any): void {
      elKids(el).forEach(function (c: any) {
        if (c.name === "tr") rows.push({ el: c, cells: elKids(c).filter(function (x: any) { return x.name === "td" || x.name === "th"; }) });
        else if (c.name === "thead" || c.name === "tbody" || c.name === "tfoot") visit(c);
      });
    };
    visit(tbl);
    let cols = 0;
    rows.forEach(function (r) { cols = Math.max(cols, r.cells.length); });
    const header = rows.length > 0 && rows[0].cells.length > 0 && rows[0].cells.every(function (c: any) { return c.name === "th"; });
    const widths: string[] = [];
    for (let i = 0; i < cols; i++) {
      const c = rows.length ? rows[0].cells[i] : null;
      const w = c ? styleMap((attr(c, "style") || { value: "" }).value).width : "";
      widths.push(w || "auto");
    }
    return { rows, cols, header, widths };
  }

  /** A blank cell shaped like `like` (its tag and attributes, nothing inside). */
  function blankCell(src: string, like: any, name?: string): string {
    const open = src.slice(like.start, like.openEnd);
    const tag = name || like.name;
    return "<" + tag + open.slice(1 + like.name.length) + "</" + tag + ">";
  }

  /** A blank body cell modelled on `like`; a header cell loses its header look on the way. */
  function bodyCell(src: string, like: any, fromHead: boolean, made: boolean): string {
    if (!fromHead) return blankCell(src, like);
    const a = attr(like, "style");
    let open = src.slice(like.start + 1 + like.name.length, like.openEnd);
    if (a && made) {
      const st = headStyle(a.value, false);
      const rel = a.start - (like.start + 1 + like.name.length);
      open = open.slice(0, rel) + (st ? "style=" + quoted(st, a.quote) : "") + open.slice(rel + a.end - a.start);
    }
    return "<td" + open + "</td>";
  }

  /**
   * Grows or shrinks a table to `rows` × `cols`. New cells copy the last
   * cell's look on their row; new rows copy the last row's, emptied.
   */
  function tableSize(src: string, tbl: any, rows: number, cols: number): string {
    rows = Math.max(1, Math.min(60, Math.floor(rows)));
    cols = Math.max(1, Math.min(30, Math.floor(cols)));
    const html = outer(src, tbl);
    const base = tbl.start;
    const local = S.parse(html);
    const t = elKids(local)[0];
    const info = tableInfo(html, t);
    const edits: DesignEdit[] = [];
    info.rows.forEach(function (r: any, ri: number) {
      if (ri >= rows) return;
      const n = r.cells.length;
      if (n > cols) {
        edits.push({ at: r.cells[cols].start, del: r.cells[n - 1].end - r.cells[cols].start, ins: "" });
      } else if (n < cols && n > 0) {
        let add = "";
        for (let k = n; k < cols; k++) add += blankCell(html, r.cells[n - 1]);
        edits.push({ at: r.cells[n - 1].end, del: 0, ins: add });
      }
    });
    if (info.rows.length > rows) {
      const first = info.rows[rows].el, last = info.rows[info.rows.length - 1].el;
      let s = first.start;
      while (s > 0 && /[ \t]/.test(html.charAt(s - 1))) s--;
      if (html.charAt(s - 1) === "\n") s--;
      edits.push({ at: s, del: last.end - s, ins: "" });
    } else if (info.rows.length < rows && info.rows.length) {
      const lastRow = info.rows[info.rows.length - 1];
      // A table that is all header so far grows body rows, not more headers.
      const fromHead = info.rows.length === 1 && info.header;
      const made = !!attr(t, "data-dz");
      let row = html.slice(lastRow.el.start, lastRow.el.openEnd);
      for (let k = 0; k < cols; k++) {
        const like = lastRow.cells[Math.min(k, lastRow.cells.length - 1)];
        row += like ? bodyCell(html, like, fromHead, made) : "<td></td>";
      }
      row += "</tr>";
      const ind = ownLine(html, lastRow.el) ? indentAt(html, lastRow.el.start) : "";
      let add = "";
      for (let k = info.rows.length; k < rows; k++) add += (ind || k ? "\n" + ind : "") + row;
      edits.push({ at: lastRow.el.end, del: 0, ins: add });
    }
    return src.slice(0, base) + apply(html, edits) + src.slice(tbl.end);
  }

  function headStyle(style: string, on: boolean): string {
    const m = styleMap(style);
    // Only a table this view made carries its own header look.
    if (on) return editStyle(style, { background: m.background || HEAD_FILL, "font-weight": m["font-weight"] || "700" });
    const back: Record<string, string | null> = {};
    if (m.background === HEAD_FILL) back.background = null;
    if (m["font-weight"] === "700") back["font-weight"] = null;
    return editStyle(style, back);
  }

  function retag(html: string, cell: any, name: string, made: boolean, on: boolean): DesignEdit[] {
    const edits: DesignEdit[] = [];
    if (cell.name !== name) {
      edits.push({ at: cell.start + 1, del: cell.name.length, ins: name });
      if (cell.closeStart < cell.end && /^<\//.test(html.slice(cell.closeStart, cell.end))) {
        edits.push({ at: cell.closeStart + 2, del: cell.name.length, ins: name });
      }
    }
    if (made) {
      const a = attr(cell, "style");
      const next = headStyle(a ? a.value : "", on);
      const e = attrEdit(html, cell, "style", next || null);
      if (e && (!a || next !== a.value)) edits.push(e);
    }
    return edits;
  }

  function tableHeader(src: string, tbl: any, on: boolean): string {
    const html = outer(src, tbl);
    const local = S.parse(html);
    const t = elKids(local)[0];
    const info = tableInfo(html, t);
    if (!info.rows.length) return src;
    const made = !!attr(t, "data-dz");
    let edits: DesignEdit[] = [];
    info.rows[0].cells.forEach(function (c: any) { edits = edits.concat(retag(html, c, on ? "th" : "td", made, on)); });
    return src.slice(0, tbl.start) + apply(html, edits) + src.slice(tbl.end);
  }

  function tableColWidth(src: string, tbl: any, i: number, value: string | null): string {
    const info = tableInfo(src, tbl);
    const cell = info.rows.length ? info.rows[0].cells[i] : null;
    if (!cell) return src;
    return setStyle(src, cell, { width: value && value !== "auto" ? value : null });
  }

  function cellRole(src: string, cell: any, header: boolean): string {
    let tbl = cell.parent;
    while (tbl && tbl.name !== "table") tbl = tbl.parent;
    const made = !!(tbl && attr(tbl, "data-dz"));
    return apply(src, retag(src, cell, header ? "th" : "td", made, header));
  }

  // ── Lists ──────────────────────────────────────────────────────────────

  function listKind(el: any): string {
    if (el.name === "ul") return "bullet";
    if (el.name === "ol") return "number";
    if (el.name === "li" && el.parent) return listKind(el.parent);
    return "none";
  }

  function openAttrs(src: string, el: any): string {
    return src.slice(el.start + 1 + el.name.length, el.openEnd - 1).replace(/\/$/, "");
  }

  /**
   * Turns a text box into a list and back: its lines (split at `<br>`)
   * become items, and the items become lines again. The element keeps its
   * attributes, so its place and look stay.
   */
  function listify(src: string, el: any, kind: string): string {
    if (el.name === "li" && el.parent) return listify(src, el.parent, kind);
    const cur = listKind(el);
    if (cur === kind) return src;
    if (cur !== "none" && kind !== "none") return renameTag(src, el, kind === "number" ? "ol" : "ul");
    const attrs = openAttrs(src, el);
    if (cur !== "none") {
      const lines = elKids(el).filter(function (c: any) { return c.name === "li"; })
        .map(function (li: any) { return src.slice(li.openEnd, li.closeStart).trim(); });
      const a = attr(el, "style");
      let at2 = attrs;
      if (a) {
        const st = editStyle(a.value, { "padding-left": null, "list-style": null });
        at2 = attrs.replace(src.slice(a.start, a.end), st ? "style=" + quoted(st, a.quote) : "").replace(/\s+$/, "");
      }
      return replace(src, el, "<div" + at2 + ">" + lines.join("<br>") + "</div>");
    }
    const inner = src.slice(el.openEnd, el.closeStart);
    const items = inner.split(/<br\s*\/?>/i).map(function (s) { return s.trim(); }).filter(function (s, i, all) { return s || all.length === 1; });
    const tag = kind === "number" ? "ol" : "ul";
    const a = attr(el, "style");
    let at2 = attrs;
    const st = editStyle(a ? a.value : "", { "padding-left": "1.2em" });
    if (a) at2 = attrs.replace(src.slice(a.start, a.end), "style=" + quoted(st, a.quote));
    else at2 = attrs + " style=" + quoted(st, '"');
    return replace(src, el, "<" + tag + at2 + ">" + items.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</" + tag + ">");
  }

  // ── Values ─────────────────────────────────────────────────────────────

  function clamp(n: number, a: number, b: number): number { return Math.max(a, Math.min(b, n)); }

  function rgba(s: string): DesignRgba | null {
    if (!s) return null;
    s = String(s).trim().toLowerCase();
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map(function (c) { return c + c; }).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      return {
        r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 2.55) / 100 : 1,
      };
    }
    m = /^rgba?\(([^)]*)\)$/.exec(s);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = function (v: string): number { return /%$/.test(v) ? parseFloat(v) * 2.55 : parseFloat(v); };
    const al = parts[3] === undefined ? 1 : /%$/.test(parts[3]) ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: clamp(Math.round(ch(parts[0])), 0, 255), g: clamp(Math.round(ch(parts[1])), 0, 255), b: clamp(Math.round(ch(parts[2])), 0, 255), a: clamp(isFinite(al) ? al : 1, 0, 1) };
  }

  function hex(c: DesignRgba): string {
    const h = function (n: number): string { return (n < 16 ? "0" : "") + n.toString(16); };
    return ("#" + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
  }

  function css(c: DesignRgba): string {
    if (c.a >= 1) return hex(c);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + Math.round(c.a * 100) / 100 + ")";
  }

  const COLOR_RE = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|var\(|currentcolor|transparent|[a-z]+$)/i;

  function shadows(s: string): DesignShadow[] {
    if (!s || s === "none") return [];
    return splitTop(s, ",").map(function (part) {
      const toks: string[] = [];
      let depth = 0, cur = "";
      for (let i = 0; i < part.length; i++) {
        const c = part.charAt(i);
        if (c === "(") depth++;
        if (c === ")") depth--;
        if (/\s/.test(c) && !depth) { if (cur) toks.push(cur); cur = ""; } else cur += c;
      }
      if (cur) toks.push(cur);
      const out: DesignShadow = { inset: false, x: 0, y: 0, blur: 0, spread: 0, color: "rgba(0,0,0,.2)" };
      const lens: number[] = [];
      toks.forEach(function (t) {
        if (t.toLowerCase() === "inset") out.inset = true;
        else if (/^-?[\d.]+(px|em|rem)?$/.test(t)) lens.push(parseFloat(t));
        else if (COLOR_RE.test(t)) out.color = t;
      });
      out.x = lens[0] || 0; out.y = lens[1] || 0; out.blur = lens[2] || 0; out.spread = lens[3] || 0;
      return out;
    }).filter(function (sh) { return !!sh; });
  }

  function shadowCss(list: DesignShadow[]): string {
    if (!list.length) return "";
    return list.map(function (s) {
      return (s.inset ? "inset " : "") + px(s.x) + " " + px(s.y) + " " + px(s.blur) + (s.spread ? " " + px(s.spread) : "") + " " + s.color;
    }).join(", ");
  }

  function sides(s: string): number[] {
    const v = String(s || "").trim().split(/\s+/).map(function (t) { return num(t); });
    if (!v.length) return [0, 0, 0, 0];
    if (v.length === 1) return [v[0], v[0], v[0], v[0]];
    if (v.length === 2) return [v[0], v[1], v[0], v[1]];
    if (v.length === 3) return [v[0], v[1], v[2], v[1]];
    return [v[0], v[1], v[2], v[3]];
  }

  /** A font stack as it reads in a style attribute: inner names in single quotes. */
  function quoteFamilies(s: string): string {
    return splitTop(String(s || ""), ",").map(function (f) {
      const t = f.trim().replace(/^["']|["']$/g, "");
      return /^[\w-]+$/.test(t) ? t : "'" + t.replace(/'/g, "") + "'";
    }).join(", ");
  }

  /** Relative file URLs the page leans on: `src`, `poster`, and CSS `url()`. */
  function assetRefs(html: string): Array<{ start: number; end: number; url: string }> {
    const out: Array<{ start: number; end: number; url: string }> = [];
    const local = function (u: string): boolean {
      return !!u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(u.trim());
    };
    const attrRe = /\s(?:src|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(html))) {
      const val = m[2] !== undefined ? m[2] : m[3];
      const vs = m.index + m[0].length - m[1].length + 1;
      if (local(val)) out.push({ start: vs, end: vs + val.length, url: val });
    }
    const urlRe = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
    while ((m = urlRe.exec(html))) {
      const val = m[2];
      const vs = m.index + m[0].indexOf(val, 4);
      if (local(val)) out.push({ start: vs, end: vs + val.length, url: val });
    }
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  // ── Slide transitions ──────────────────────────────────────────────────
  // Stored on the slide as `data-transition`. A deck's own runtime ignores
  // the attribute; deckrun's presenter plays it on the slide coming in.

  const TRANSITIONS = [
    { id: "", label: "Deck default" },
    { id: "fade", label: "Fade" },
    { id: "slide", label: "Slide" },
    { id: "rise", label: "Rise" },
    { id: "zoom", label: "Zoom" },
    { id: "blur", label: "Blur" },
  ];

  function transitions(): Array<{ id: string; label: string }> {
    return TRANSITIONS.slice();
  }

  function frames(name: string, dir: number): any[] | null {
    const d = dir < 0 ? -1 : 1;
    if (name === "fade") return [{ opacity: 0 }, { opacity: 1 }];
    if (name === "slide") return [{ transform: "translateX(" + 14 * d + "%)", opacity: 0.2 }, { transform: "none", opacity: 1 }];
    if (name === "rise") return [{ transform: "translateY(7%)", opacity: 0 }, { transform: "none", opacity: 1 }];
    if (name === "zoom") return [{ transform: "scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }];
    if (name === "blur") return [{ filter: "blur(14px)", opacity: 0 }, { filter: "none", opacity: 1 }];
    return null;
  }

  /** The deck without its hidden slides: what a download should hold. */
  function stripHidden(m: any): string {
    const cuts = m.slides.filter(function (s: any) { return s.hidden; })
      .map(function (s: any) { return { at: s.start, del: s.end - s.start, ins: "" }; });
    if (!cuts.length) return m.src;
    // Each cut takes the line break before it, so no blank lines pile up.
    cuts.forEach(function (c: DesignEdit) {
      if (m.src.charAt(c.at - 1) === "\n") { c.at--; c.del++; }
    });
    return apply(m.src, cuts);
  }

  return {
    decls, styleMap, editStyle, attr, setStyle, setStyles, styleEdit, attrEdit, setAttr, apply,
    insertEnd, insertAfter, removeEdit, moveEdits, outer, replace, renameTag,
    textBox, shape, table, image, video, line, lineGeom, shapeKinds,
    tableInfo, tableSize, tableHeader, tableColWidth, cellRole, listKind, listify,
    rgba, hex, css, shadows, shadowCss, sides, splitTop, num, px, quoteFamilies, assetRefs,
    transitions, frames, stripHidden,
  };
}

/** Pasted into the editor after `DRSlides`, where it defines `DRDesign`. */
export const DESIGN_KIT_RUNTIME = `var DRDesign = (${designKit.toString()})(DRSlides);`;

/**
 * The presenter's half of slide transitions: the slide coming in plays its
 * `data-transition`. A deck's runtime shows a slide its own way, so the
 * incoming one is read from the opacity transition it just started, or
 * else from what is on screen once the change has landed.
 */
export function transitionPlayer(S: any, frames: (name: string, dir: number) => any[] | null): any {
  let last = -1;
  let until = 0;
  let raf = 0;
  let win: any = null;
  let doc: any = null;

  function core(k: number): any {
    const unit = doc && doc.querySelector('[data-dr-slide="' + k + '"]');
    if (!unit) return null;
    return unit.hasAttribute("data-transition") ? unit : unit.querySelector("[data-transition]");
  }

  function play(k: number, dir: number): void {
    const el = core(k);
    if (!el) return;
    const f = frames(el.getAttribute("data-transition") || "", dir);
    if (!f) return;
    try { el.animate(f, { duration: 520, easing: "cubic-bezier(.2,.75,.25,1)" }); } catch (e) {}
  }

  function incoming(): number {
    const units = doc ? Array.prototype.slice.call(doc.querySelectorAll("[data-dr-slide]")) : [];
    for (let i = 0; i < units.length; i++) {
      let anims: any[] = [];
      try { anims = units[i].getAnimations(); } catch (e) {}
      for (let j = 0; j < anims.length; j++) {
        const a = anims[j];
        if (a.transitionProperty !== "opacity" || !a.effect || !a.effect.getKeyframes) continue;
        const kf = a.effect.getKeyframes();
        if (kf.length > 1 && parseFloat(kf[kf.length - 1].opacity) > parseFloat(kf[0].opacity)) {
          return parseInt(units[i].getAttribute("data-dr-slide"), 10);
        }
      }
    }
    return -1;
  }

  function check(): void {
    if (!doc) return;
    let k = incoming();
    if (k < 0) { try { k = S.current(win); } catch (e) { k = -1; } }
    if (k < 0 || k === last) return;
    const prev = last;
    last = k;
    if (prev >= 0) play(k, k > prev ? 1 : -1);
  }

  function tick(): void {
    raf = 0;
    check();
    if (Date.now() < until) raf = requestAnimationFrame(tick);
  }

  function kick(): void {
    until = Date.now() + 700;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function attach(w: any): void {
    try {
      if (!w || !w.document || w.__drTransitions) return;
      w.__drTransitions = true;
      doc = w.document;
      win = w;
      last = -1;
      ["keydown", "keyup", "click", "hashchange", "wheel", "touchend"].forEach(function (t) {
        w.addEventListener(t, kick, true);
      });
      if (typeof w.MutationObserver !== "undefined" && doc.body) {
        new w.MutationObserver(function () { check(); kick(); })
          .observe(doc.body, { attributes: true, subtree: true, attributeFilter: ["class", "style", "hidden"] });
      }
      setTimeout(function () { try { if (last < 0) last = S.current(w); } catch (e) {} }, 300);
    } catch (e) {}
  }

  return { attach, check, play };
}

/** Defines `DRTransitions` in the presenter, after `DRSlides` and `DRDesign`. */
export const TRANSITION_PLAYER_RUNTIME = `var DRTransitions = (${transitionPlayer.toString()})(DRSlides, DRDesign.frames);`;
