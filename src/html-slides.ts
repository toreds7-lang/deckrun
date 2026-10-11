/**
 * Slides inside a self-contained HTML deck: finding them in the source, and
 * rewriting the source to add, duplicate, delete, reorder, hide, and annotate
 * them — PowerPoint's slide operations, done on the text itself so that
 * everything outside the slides that change stays byte for byte as written.
 *
 * A deck is whatever the page's author made it, so nothing here assumes a
 * framework. A slide is an element with the class `slide` (or, failing any,
 * a `<section>`), climbed out to the wrapper that holds it and nothing else —
 * `<div class="slot"><section class="slide">` moves as one piece. The comment
 * just above a slide (`<!-- ===== 3. Results ===== -->`) travels with it, and
 * numbered comments are renumbered when the deck kept them in order.
 *
 * A hidden slide is wrapped in `<template data-deckrun-hidden>`. Template
 * content is inert and invisible to `querySelectorAll`, so any deck's own
 * runtime skips it when presenting, with no change to that runtime.
 *
 * Everything sits inside one factory so the same code runs under Node (the
 * tests) and in the editor page, which receives `htmlSlides.toString()`. It
 * must stay self-contained: no imports and no references outside itself. It
 * also never spells a comment opener or a script tag literally, since either
 * would end or derail the `<script>` element it is pasted into.
 */

export interface SlideAttr {
  /** Lowercased name. */
  name: string;
  /** Decoded value; empty for a bare attribute. */
  value: string;
  /** False for a bare attribute such as `hidden`. */
  hasValue: boolean;
  start: number;
  nameEnd: number;
  valueStart: number;
  valueEnd: number;
  /** `"`, `'`, or empty when unquoted. */
  quote: string;
  end: number;
}

export interface SlideNode {
  kind: "el" | "text" | "comment";
  start: number;
  end: number;
  parent: SlideEl | null;
}

export interface SlideEl extends SlideNode {
  kind: "el";
  name: string;
  openEnd: number;
  closeStart: number;
  attrs: SlideAttr[];
  children: SlideNode[];
}

export interface SlideLabel {
  start: number;
  end: number;
  /** The number in `<!-- 3. Results -->`, or null when the comment has none. */
  num: number | null;
  /** The number carries a hand-made sub-letter (`11a`), so the deck's numbering is curated. */
  sub: boolean;
  numStart: number;
  numEnd: number;
  label: string;
  labelStart: number;
  labelEnd: number;
}

export interface SlideNote {
  kind: "attr" | "aside";
  el: SlideEl;
  attr: SlideAttr | null;
  text: string;
}

export interface Slide {
  index: number;
  /** The block that moves: leading comment and indentation through the slide's end. */
  start: number;
  end: number;
  /** The outermost element: the hidden-slide template, or else the unit. */
  outer: SlideEl;
  /** The wrapper that is the slide as far as the deck is concerned. */
  unit: SlideEl;
  /** The element that matched: `.slide` or `<section>`. */
  core: SlideEl;
  hidden: boolean;
  comment: SlideLabel | null;
  title: string;
  note: SlideNote | null;
}

export interface SlideModel {
  src: string;
  root: SlideEl;
  slides: Slide[];
}

export interface SlideResult {
  src: string;
  /** Indices of the slides to select afterwards. */
  sel: number[];
}

export interface SlideTextBox {
  slide: number;
  start: number;
  end: number;
}

export interface SlideLayout {
  from: number;
  name: string;
  text: string;
}

export interface HtmlSlides {
  HIDDEN_ATTR: string;
  parse(src: string): SlideEl;
  model(src: string): SlideModel;
  decode(s: string): string;
  textOf(src: string, el: SlideEl): string;
  blockText(m: SlideModel, i: number): string;
  slideAt(m: SlideModel, pos: number): number;
  move(m: SlideModel, idxs: number[], to: number): SlideResult | null;
  duplicate(m: SlideModel, idxs: number[]): SlideResult;
  remove(m: SlideModel, idxs: number[]): SlideResult | null;
  insert(m: SlideModel, at: number, texts: string[]): SlideResult;
  hide(m: SlideModel, idxs: number[], on: boolean): SlideResult;
  setNote(m: SlideModel, i: number, text: string): string;
  copy(m: SlideModel, idxs: number[]): string;
  blocksIn(text: string): string[];
  layouts(m: SlideModel): SlideLayout[];
  blank(m: SlideModel, ref: number): string;
  isolate(m: SlideModel, k: number, replacement?: string): string;
  textBoxes(m: SlideModel): SlideTextBox[];
  decoratePreview(m: SlideModel): { html: string; boxes: SlideTextBox[]; nodes: SlideEl[] };
  previewNodes(m: SlideModel): SlideEl[];
  decoratePresent(m: SlideModel): { html: string; visible: number[] };
  renumber(src: string, base: number): string;
  numberBase(m: SlideModel): number | null;
  current(win: any): number;
  goto(win: any, k: number): boolean;
}

export function htmlSlides(): HtmlSlides {
  const HIDDEN_ATTR = "data-deckrun-hidden";
  const COMMENT_OPEN = "<!" + "--";
  const COMMENT_CLOSE = "--" + ">";

  const VOID: Record<string, 1> = {
    area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
    link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1,
  };
  // Raw text: nothing inside is markup, so a `<` in a script is not a tag.
  const RAW: Record<string, 1> = {
    script: 1, style: 1, textarea: 1, title: 1, xmp: 1, iframe: 1,
    noembed: 1, noframes: 1, noscript: 1,
  };
  const CLOSES_P: Record<string, 1> = {
    address: 1, article: 1, aside: 1, blockquote: 1, details: 1, div: 1, dl: 1,
    fieldset: 1, figcaption: 1, figure: 1, footer: 1, form: 1, h1: 1, h2: 1,
    h3: 1, h4: 1, h5: 1, h6: 1, header: 1, hgroup: 1, hr: 1, main: 1, menu: 1,
    nav: 1, ol: 1, p: 1, pre: 1, section: 1, table: 1, ul: 1,
  };
  const INLINE: Record<string, 1> = {
    a: 1, abbr: 1, b: 1, bdi: 1, bdo: 1, br: 1, cite: 1, code: 1, data: 1,
    del: 1, dfn: 1, em: 1, font: 1, i: 1, ins: 1, kbd: 1, mark: 1, q: 1, s: 1,
    samp: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, time: 1, u: 1,
    var: 1, wbr: 1,
  };
  // Elements whose text is not prose someone would retype on the slide.
  const NO_TEXT: Record<string, 1> = {
    svg: 1, math: 1, script: 1, style: 1, template: 1, textarea: 1, select: 1,
    option: 1, button: 1, iframe: 1, video: 1, audio: 1, canvas: 1, object: 1,
    noscript: 1, input: 1,
  };
  // Text slots that stay editable even when emptied.
  const TEXTY: Record<string, 1> = {
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, p: 1, li: 1, blockquote: 1,
    figcaption: 1, td: 1, th: 1, dt: 1, dd: 1, caption: 1, q: 1, cite: 1,
  };
  const NOTE_ATTRS = ["data-note", "data-notes", "data-speaker-notes"];
  const NAMED: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    hellip: "…", mdash: "—", ndash: "–", lsquo: "‘",
    rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚",
    bdquo: "„", middot: "·", bull: "•", copy: "©",
    reg: "®", trade: "™", times: "×", divide: "÷",
    rarr: "→", larr: "←", uarr: "↑", darr: "↓",
    harr: "↔", rArr: "⇒", lArr: "⇐", laquo: "«",
    raquo: "»", deg: "°", plusmn: "±", para: "¶",
    sect: "§", euro: "€", pound: "£", yen: "¥",
    cent: "¢", thinsp: " ", ensp: " ", emsp: " ",
    zwj: "‍", zwnj: "‌", shy: "­", minus: "−",
    le: "≤", ge: "≥", ne: "≠", asymp: "≈", check: "✓",
  };
  const IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E" +
    "%3Crect width='100%25' height='100%25' fill='%23cfd3da'/%3E%3C/svg%3E";

  // ── Parsing ─────────────────────────────────────────────────────────────

  function isWs(c: number): boolean {
    return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
  }

  function isAlpha(c: number): boolean {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  }

  function decode(s: string): string {
    if (s.indexOf("&") < 0) return s;
    return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, e: string) {
      if (e.charAt(0) === "#") {
        const hex = e.charAt(1) === "x" || e.charAt(1) === "X";
        const cp = hex ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (err) { return m; }
      }
      const v = NAMED[e];
      return v !== undefined ? v : m;
    });
  }

  function encAttr(s: string, quote: string): string {
    let out = s.replace(/&/g, "&amp;");
    out = quote === "'" ? out.replace(/'/g, "&#39;") : out.replace(/"/g, "&quot;");
    return out;
  }

  function encText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  interface Tag { name: string; attrs: SlideAttr[]; openEnd: number; selfClose: boolean; }

  function readTag(src: string, lt: number): Tag {
    const n = src.length;
    let i = lt + 1;
    while (i < n && !isWs(src.charCodeAt(i)) && src.charAt(i) !== "/" && src.charAt(i) !== ">") i++;
    const name = src.slice(lt + 1, i).toLowerCase();
    const attrs: SlideAttr[] = [];
    while (i < n) {
      while (i < n && isWs(src.charCodeAt(i))) i++;
      if (i >= n) break;
      const ch = src.charAt(i);
      if (ch === ">") return { name, attrs, openEnd: i + 1, selfClose: src.charAt(i - 1) === "/" };
      if (ch === "/") { i++; continue; }
      const ns = i;
      i++;
      while (i < n) {
        const c = src.charAt(i);
        if (isWs(src.charCodeAt(i)) || c === "/" || c === ">" || c === "=") break;
        i++;
      }
      const aname = src.slice(ns, i).toLowerCase();
      let j = i;
      while (j < n && isWs(src.charCodeAt(j))) j++;
      if (src.charAt(j) === "=") {
        j++;
        while (j < n && isWs(src.charCodeAt(j))) j++;
        const q = src.charAt(j);
        if (q === '"' || q === "'") {
          const close = src.indexOf(q, j + 1);
          const ve = close < 0 ? n : close;
          attrs.push({
            name: aname, value: decode(src.slice(j + 1, ve)), hasValue: true, start: ns, nameEnd: i,
            valueStart: j + 1, valueEnd: ve, quote: q, end: Math.min(n, ve + 1),
          });
          i = Math.min(n, ve + 1);
        } else {
          let k = j;
          while (k < n && !isWs(src.charCodeAt(k)) && src.charAt(k) !== ">") k++;
          attrs.push({
            name: aname, value: decode(src.slice(j, k)), hasValue: true, start: ns, nameEnd: i,
            valueStart: j, valueEnd: k, quote: "", end: k,
          });
          i = k;
        }
      } else {
        attrs.push({
          name: aname, value: "", hasValue: false, start: ns, nameEnd: i,
          valueStart: i, valueEnd: i, quote: "", end: i,
        });
      }
    }
    return { name, attrs, openEnd: n, selfClose: false };
  }

  /**
   * A forgiving tree with source offsets. It knows raw-text elements, void
   * elements, foreign self-closing tags, and the handful of implied end tags
   * (`p`, `li`, `td`, …) that would otherwise nest siblings inside each other.
   */
  function parse(src: string): SlideEl {
    const n = src.length;
    const root: SlideEl = {
      kind: "el", name: "#root", start: 0, end: n, openEnd: 0, closeStart: n,
      attrs: [], children: [], parent: null,
    };
    const stack: SlideEl[] = [root];
    let foreign = 0;

    function top(): SlideEl { return stack[stack.length - 1]; }
    function add(node: SlideNode): void { node.parent = top(); top().children.push(node); }
    function text(a: number, b: number): SlideNode { return { kind: "text", start: a, end: b, parent: null }; }
    function closeTo(k: number, at: number, closeEnd: number): void {
      while (stack.length - 1 >= k) {
        const el = stack.pop() as SlideEl;
        const last = stack.length === k;
        el.closeStart = at;
        el.end = last ? closeEnd : at;
        if (el.name === "svg" || el.name === "math") foreign--;
      }
    }
    function nearest(names: Record<string, 1>, stop: Record<string, 1>): number {
      for (let k = stack.length - 1; k > 0; k--) {
        const nm = stack[k].name;
        if (names[nm]) return k;
        if (stop[nm]) return -1;
      }
      return -1;
    }
    function implicitClose(name: string, at: number): void {
      if (foreign) return;
      let k = -1;
      if (CLOSES_P[name] && top().name === "p") k = stack.length - 1;
      else if (name === "li") k = nearest({ li: 1 }, { ul: 1, ol: 1, menu: 1 });
      else if (name === "dt" || name === "dd") k = nearest({ dt: 1, dd: 1 }, { dl: 1 });
      else if (name === "option") k = top().name === "option" ? stack.length - 1 : -1;
      else if (name === "tr") k = nearest({ tr: 1 }, { table: 1, tbody: 1, thead: 1, tfoot: 1 });
      else if (name === "td" || name === "th") k = nearest({ td: 1, th: 1 }, { tr: 1, table: 1 });
      if (k > 0) closeTo(k, at, at);
    }

    let i = 0;
    while (i < n) {
      const lt = src.indexOf("<", i);
      if (lt < 0) { add(text(i, n)); break; }
      if (lt > i) add(text(i, lt));
      if (src.startsWith(COMMENT_OPEN, lt)) {
        const close = src.indexOf(COMMENT_CLOSE, lt + 4);
        const end = close < 0 ? n : close + 3;
        add({ kind: "comment", start: lt, end, parent: null });
        i = end;
        continue;
      }
      const c1 = src.charCodeAt(lt + 1);
      if (c1 === 33 || c1 === 63) {
        const gt = src.indexOf(">", lt);
        i = gt < 0 ? n : gt + 1;
        continue;
      }
      if (c1 === 47) {
        const re = /<\/([A-Za-z][^\s/>]*)[^>]*>?/y;
        re.lastIndex = lt;
        const m = re.exec(src);
        if (!m) { add(text(lt, lt + 2)); i = lt + 2; continue; }
        const name = m[1].toLowerCase();
        const end = lt + m[0].length;
        for (let k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) { closeTo(k, lt, end); break; }
        }
        i = end;
        continue;
      }
      if (isAlpha(c1)) {
        const tag = readTag(src, lt);
        implicitClose(tag.name, lt);
        const el: SlideEl = {
          kind: "el", name: tag.name, start: lt, openEnd: tag.openEnd, closeStart: tag.openEnd,
          end: tag.openEnd, attrs: tag.attrs, children: [], parent: null,
        };
        add(el);
        i = tag.openEnd;
        if (VOID[tag.name] && !foreign) continue;
        if (tag.selfClose && foreign) continue;
        if (RAW[tag.name] && !(foreign && tag.name === "title")) {
          const re = new RegExp("</" + tag.name + "(?=[\\s/>])", "ig");
          re.lastIndex = tag.openEnd;
          const m = re.exec(src);
          if (!m) { el.closeStart = el.end = n; i = n; continue; }
          const gt = src.indexOf(">", m.index);
          el.closeStart = m.index;
          el.end = gt < 0 ? n : gt + 1;
          i = el.end;
          continue;
        }
        stack.push(el);
        if (tag.name === "svg" || tag.name === "math") foreign++;
        continue;
      }
      add(text(lt, lt + 1));
      i = lt + 1;
    }
    if (stack.length > 1) closeTo(1, n, n);
    return root;
  }

  // ── Tree helpers ────────────────────────────────────────────────────────

  function attr(el: SlideEl, name: string): SlideAttr | undefined {
    for (let i = 0; i < el.attrs.length; i++) if (el.attrs[i].name === name) return el.attrs[i];
    return undefined;
  }

  function hasClass(el: SlideEl, cls: string): boolean {
    const a = attr(el, "class");
    return !!a && (" " + a.value.replace(/\s+/g, " ") + " ").indexOf(" " + cls + " ") >= 0;
  }

  function walk(el: SlideEl, fn: (e: SlideEl) => boolean | void): void {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      if (c.kind !== "el") continue;
      if (fn(c as SlideEl) === false) continue;
      walk(c as SlideEl, fn);
    }
  }

  function first(el: SlideEl, test: (e: SlideEl) => boolean): SlideEl | null {
    let found: SlideEl | null = null;
    walk(el, function (e) {
      if (found) return false;
      if (test(e)) { found = e; return false; }
      return true;
    });
    return found;
  }

  function elChildren(el: SlideEl): SlideEl[] {
    return el.children.filter(function (c) { return c.kind === "el"; }) as SlideEl[];
  }

  function within(el: SlideEl, test: (e: SlideEl) => boolean): boolean {
    for (let p = el.parent; p; p = p.parent) if (test(p)) return true;
    return false;
  }

  function isOurTemplate(el: SlideEl): boolean {
    return el.name === "template" && !!attr(el, HIDDEN_ATTR);
  }

  function textOf(src: string, el: SlideEl): string {
    const inner = src.slice(el.openEnd, el.closeStart);
    const stripped = inner
      .split(COMMENT_OPEN).map(function (part, i) {
        if (!i) return part;
        const close = part.indexOf(COMMENT_CLOSE);
        return close < 0 ? "" : part.slice(close + 3);
      }).join("")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "");
    return decode(stripped).replace(/[\s ]+/g, " ").trim();
  }

  function hasText(src: string, el: SlideEl): boolean {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      if (c.kind === "text" && /\S/.test(src.slice(c.start, c.end))) return true;
      if (c.kind === "el" && hasText(src, c as SlideEl)) return true;
    }
    return false;
  }

  function inlineOnly(el: SlideEl): boolean {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      if (c.kind !== "el") continue;
      const e = c as SlideEl;
      if (!INLINE[e.name] || !inlineOnly(e)) return false;
    }
    return true;
  }

  function isNoteAside(el: SlideEl): boolean {
    return el.name === "aside" && (hasClass(el, "notes") || hasClass(el, "speaker-notes"));
  }

  /** The prose a person would retype on the slide: maximal runs of inline-only markup. */
  function boxesOf(src: string, el: SlideEl, out: SlideEl[]): SlideEl[] {
    if (NO_TEXT[el.name] || isNoteAside(el)) return out;
    if (inlineOnly(el) && (hasText(src, el) || TEXTY[el.name])) {
      if (el.closeStart > el.openEnd || TEXTY[el.name]) out.push(el);
      return out;
    }
    const kids = elChildren(el);
    for (let i = 0; i < kids.length; i++) boxesOf(src, kids[i], out);
    return out;
  }

  /** Where ` name="value"` goes so it lands inside the open tag. */
  function attrPos(src: string, el: SlideEl): number {
    let at = el.openEnd;
    if (src.charAt(at - 1) !== ">") return -1;
    at--;
    if (src.charAt(at - 1) === "/") at--;
    return at;
  }

  interface Edit { at: number; del: number; ins: string; }

  /**
   * Edits at the same offset land in the order given. One pass over the
   * source, since the preview tags every element of a long deck; edits that
   * overlap a deletion keep the original one-at-a-time behaviour.
   */
  function applyEdits(src: string, edits: Edit[]): string {
    const list = edits.filter(function (e) { return e && e.at >= 0; })
      .map(function (e, i) { return { e, i }; });
    const up = list.slice().sort(function (a, b) { return a.e.at - b.e.at || a.i - b.i; });
    const parts: string[] = [];
    let pos = 0;
    for (let k = 0; k < up.length; k++) {
      const e = up[k].e;
      if (e.at < pos) return applyOneByOne(src, list);
      parts.push(src.slice(pos, e.at), e.ins);
      pos = e.at + e.del;
    }
    parts.push(src.slice(pos));
    return parts.join("");
  }

  function applyOneByOne(src: string, list: Array<{ e: Edit; i: number }>): string {
    const down = list.slice().sort(function (a, b) { return b.e.at - a.e.at || b.i - a.i; });
    let out = src;
    for (let k = 0; k < down.length; k++) {
      const e = down[k].e;
      out = out.slice(0, e.at) + e.ins + out.slice(e.at + e.del);
    }
    return out;
  }

  function insertAttr(src: string, el: SlideEl, text: string): Edit {
    return { at: attrPos(src, el), del: 0, ins: text };
  }

  // ── The model ───────────────────────────────────────────────────────────

  // A comment's inside, such as ` ===== 3. Results ===== `: decoration,
  // number (with an optional hand-made sub-letter, `11a`), separator,
  // label, decoration. (Comments here ship in the runtime, so none of them
  // may spell out a comment opener.)
  const LABEL_RE = /^(\s*(?:[=\-*#~_+|/]+\s*)?)(\d+)([a-zA-Z]?)(?=[.):\s]|$)([.):]?\s*)([\s\S]*?)(\s*(?:[=\-*#~_+|/]+\s*)?)$/;

  function readLabel(src: string, node: SlideNode): SlideLabel {
    const innerStart = node.start + 4;
    const innerEnd = src.slice(node.start, node.end).endsWith(COMMENT_CLOSE) ? node.end - 3 : node.end;
    const inner = src.slice(innerStart, innerEnd);
    const m = LABEL_RE.exec(inner);
    if (!m) {
      const t = inner.replace(/^[\s=\-*#~_+|/]+|[\s=\-*#~_+|/]+$/g, "");
      const at = inner.indexOf(t);
      return {
        start: node.start, end: node.end, num: null, sub: false, numStart: -1, numEnd: -1, label: t,
        labelStart: innerStart + Math.max(0, at), labelEnd: innerStart + Math.max(0, at) + t.length,
      };
    }
    const numStart = innerStart + m[1].length;
    const labelStart = numStart + m[2].length + m[3].length + m[4].length;
    return {
      start: node.start, end: node.end, num: parseInt(m[2], 10), sub: !!m[3], numStart,
      numEnd: numStart + m[2].length, label: m[5], labelStart, labelEnd: labelStart + m[5].length,
    };
  }

  function findNote(src: string, unit: SlideEl, core: SlideEl): SlideNote | null {
    for (let e: SlideEl | null = core; e; e = e.parent) {
      for (let i = 0; i < NOTE_ATTRS.length; i++) {
        const a = attr(e, NOTE_ATTRS[i]);
        if (a) return { kind: "attr", el: e, attr: a, text: a.value };
      }
      if (e === unit) break;
    }
    const aside = first(unit, isNoteAside);
    if (aside) return { kind: "aside", el: aside, attr: null, text: textOf(src, aside) };
    return null;
  }

  function titleOf(src: string, unit: SlideEl, core: SlideEl): string {
    const h = first(core, function (e) { return /^h[1-6]$/.test(e.name); }) ||
      first(core, function (e) { return e.name === "blockquote"; });
    if (h) {
      const t = textOf(src, h);
      if (t) return t;
    }
    const boxes = boxesOf(src, unit, []);
    for (let i = 0; i < boxes.length; i++) {
      const t = textOf(src, boxes[i]);
      if (t) return t;
    }
    return "";
  }

  function model(src: string): SlideModel {
    const root = parse(src);
    const all: SlideEl[] = [];
    walk(root, function (e) { all.push(e); });

    function usable(e: SlideEl): boolean {
      return !within(e, function (p) {
        return p.name === "head" || p.name === "svg" || (p.name === "template" && !isOurTemplate(p));
      });
    }
    let cands = all.filter(function (e) { return hasClass(e, "slide") && usable(e); });
    if (!cands.length) cands = all.filter(function (e) { return e.name === "section" && usable(e); });
    const candSet = new Set(cands);
    cands = cands.filter(function (c) { return !within(c, function (p) { return candSet.has(p); }); });
    if (!cands.length) return { src, root, slides: [] };

    const count = new Map<SlideEl, number>();
    cands.forEach(function (c) {
      for (let p = c.parent; p; p = p.parent) count.set(p, (count.get(p) || 0) + 1);
    });
    const single = cands.length === 1;

    let prevEnd = 0;
    const slides: Slide[] = cands.map(function (core, index) {
      let unit = core;
      let wrap: SlideEl | null = null;
      for (;;) {
        const p = unit.parent;
        if (!p || p.name === "#root" || p.name === "html" || p.name === "body" || p.name === "head") break;
        if (count.get(p) !== 1) break;
        if (isOurTemplate(p)) { wrap = p; break; }
        // One slide alone cannot say where the deck's container begins; an
        // id or a sibling marks a container rather than a slide's own wrapper.
        if (single && (elChildren(p).length !== 1 || attr(p, "id"))) break;
        unit = p;
      }
      const outer = wrap || unit;

      // The comment directly above the slide is its label.
      let start = outer.start;
      let comment: SlideLabel | null = null;
      const sibs = outer.parent ? outer.parent.children : [];
      const at = sibs.indexOf(outer);
      for (let k = at - 1; k >= 0; k--) {
        const nd = sibs[k];
        if (nd.end <= prevEnd) break;
        if (nd.kind === "text") {
          const t = src.slice(nd.start, nd.end);
          if (/\S/.test(t) || (t.match(/\n/g) || []).length > 1) break;
          continue;
        }
        if (nd.kind !== "comment") break;
        // A comment trailing the previous element on its own line belongs to that one.
        const before = sibs[k - 1];
        if (before && before.kind === "el" && before.end === nd.start) break;
        if (before && before.kind === "text" && k >= 2 && sibs[k - 2].kind === "el" &&
            !/\n/.test(src.slice(before.start, before.end))) break;
        start = nd.start;
        if (!comment) comment = readLabel(src, nd);
      }
      let ls = start;
      while (ls > prevEnd && (src.charAt(ls - 1) === " " || src.charAt(ls - 1) === "\t")) ls--;
      if (ls === 0 || src.charAt(ls - 1) === "\n") start = ls;
      prevEnd = outer.end;

      return {
        index, start, end: outer.end, outer, unit, core, hidden: !!wrap, comment,
        title: titleOf(src, unit, core), note: findNote(src, unit, core),
      };
    });
    return { src, root, slides };
  }

  function blockText(m: SlideModel, i: number): string {
    const s = m.slides[i];
    return m.src.slice(s.start, s.end);
  }

  function slideAt(m: SlideModel, pos: number): number {
    let at = -1;
    for (let i = 0; i < m.slides.length; i++) {
      if (m.slides[i].start <= pos) at = i;
      else break;
    }
    return at < 0 && m.slides.length ? 0 : at;
  }

  // ── Rewriting ───────────────────────────────────────────────────────────

  function gaps(m: SlideModel): string[] {
    const out: string[] = [];
    for (let i = 0; i + 1 < m.slides.length; i++) out.push(m.src.slice(m.slides[i].end, m.slides[i + 1].start));
    return out;
  }

  function typicalGap(m: SlideModel): string {
    const tally: Record<string, number> = {};
    let best = "", most = 0;
    gaps(m).forEach(function (g) {
      if (/\S/.test(g)) return;
      tally[g] = (tally[g] || 0) + 1;
      if (tally[g] > most) { most = tally[g]; best = g; }
    });
    return most ? best : "\n";
  }

  /** Lays new blocks into the old slots, so whatever sits between slides stays put. */
  function rebuild(m: SlideModel, blocks: string[]): string {
    const s = m.slides;
    const g = gaps(m);
    const fill = typicalGap(m);
    let out = m.src.slice(0, s[0].start);
    for (let i = 0; i < blocks.length; i++) {
      if (i) out += i - 1 < g.length ? g[i - 1] : fill;
      out += blocks[i];
    }
    return out + m.src.slice(s[s.length - 1].end);
  }

  /**
   * Where the deck's comment numbering starts (0 or 1), or null when it is
   * not a plain count to keep up: unnumbered, out of order, or curated with
   * sub-numbers like `11a`. Unnumbered slides in between do not count.
   */
  function numberBase(m: SlideModel): number | null {
    const labels = m.slides
      .map(function (s) { return s.comment; })
      .filter(function (c) { return !!c && c.num !== null; }) as SlideLabel[];
    if (labels.length < 2 || labels.some(function (c) { return c.sub; })) return null;
    const base = labels[0].num as number;
    if (base !== 0 && base !== 1) return null;
    for (let i = 0; i < labels.length; i++) if (labels[i].num !== base + i) return null;
    return base;
  }

  function renumber(src: string, base: number): string {
    const m = model(src);
    const edits: Edit[] = [];
    let rank = 0;
    m.slides.forEach(function (s) {
      const c = s.comment;
      if (!c || c.num === null) return;
      const old = src.slice(c.numStart, c.numEnd);
      let next = String(base + rank++);
      if (old.length > 1 && old.charAt(0) === "0") while (next.length < old.length) next = "0" + next;
      if (next !== old) edits.push({ at: c.numStart, del: c.numEnd - c.numStart, ins: next });
    });
    return applyEdits(src, edits);
  }

  function finish(m: SlideModel, src: string, sel: number[]): SlideResult {
    const base = numberBase(m);
    return { src: base === null ? src : renumber(src, base), sel };
  }

  function idsIn(root: SlideEl): Set<string> {
    const ids = new Set<string>();
    walk(root, function (e) {
      const a = attr(e, "id");
      if (a && a.value) ids.add(a.value);
    });
    return ids;
  }

  /** A pasted or duplicated slide must not bring a second copy of an id. */
  function freshIds(text: string, taken: Set<string>): string {
    const edits: Edit[] = [];
    walk(parse(text), function (e) {
      const a = attr(e, "id");
      if (!a || !a.value) return;
      let id = a.value;
      if (taken.has(id)) {
        const stem = id.replace(/-\d+$/, "");
        let k = 2;
        while (taken.has(stem + "-" + k)) k++;
        id = stem + "-" + k;
        edits.push({ at: a.valueStart, del: a.valueEnd - a.valueStart, ins: encAttr(id, a.quote || '"') });
      }
      taken.add(id);
    });
    return applyEdits(text, edits);
  }

  function sorted(idxs: number[], n: number): number[] {
    const seen: Record<number, 1> = {};
    return idxs.filter(function (i) {
      if (i < 0 || i >= n || seen[i]) return false;
      seen[i] = 1;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  /** Moves the slides to sit before slide `to` (`to` = length means the end). */
  function move(m: SlideModel, idxs: number[], to: number): SlideResult | null {
    const n = m.slides.length;
    const moving = sorted(idxs, n);
    if (!moving.length) return null;
    const set: Record<number, 1> = {};
    moving.forEach(function (i) { set[i] = 1; });
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (!set[i]) rest.push(i);
    let p = 0;
    while (p < rest.length && rest[p] < to) p++;
    const order = rest.slice(0, p).concat(moving, rest.slice(p));
    if (order.every(function (v, i) { return v === i; })) return null;
    const src = rebuild(m, order.map(function (i) { return blockText(m, i); }));
    return finish(m, src, moving.map(function (_, j) { return p + j; }));
  }

  /** Copies land as a group after the last slide copied, like PowerPoint's. */
  function duplicate(m: SlideModel, idxs: number[]): SlideResult {
    const picked = sorted(idxs, m.slides.length);
    const taken = idsIn(m.root);
    const copies = picked.map(function (i) { return freshIds(blockText(m, i), taken); });
    return insertBlocks(m, picked[picked.length - 1] + 1, copies);
  }

  function insertBlocks(m: SlideModel, at: number, texts: string[]): SlideResult {
    const n = m.slides.length;
    at = Math.max(0, Math.min(n, at));
    const blocks: string[] = [];
    for (let i = 0; i < n; i++) {
      if (i === at) blocks.push.apply(blocks, texts);
      blocks.push(blockText(m, i));
    }
    if (at === n) blocks.push.apply(blocks, texts);
    const sel = texts.map(function (_, j) { return at + j; });
    return finish(m, rebuild(m, blocks), sel);
  }

  function insert(m: SlideModel, at: number, texts: string[]): SlideResult {
    const taken = idsIn(m.root);
    return insertBlocks(m, at, texts.map(function (t) { return freshIds(t, taken); }));
  }

  /** Null when that would leave the deck with no slides at all. */
  function remove(m: SlideModel, idxs: number[]): SlideResult | null {
    const n = m.slides.length;
    const gone = sorted(idxs, n);
    if (!gone.length || gone.length >= n) return null;
    const set: Record<number, 1> = {};
    gone.forEach(function (i) { set[i] = 1; });
    const keep: string[] = [];
    for (let i = 0; i < n; i++) if (!set[i]) keep.push(blockText(m, i));
    const next = Math.min(gone[0], keep.length - 1);
    return finish(m, rebuild(m, keep), [next]);
  }

  function hide(m: SlideModel, idxs: number[], on: boolean): SlideResult {
    const picked = sorted(idxs, m.slides.length);
    const edits: Edit[] = [];
    picked.forEach(function (i) {
      const s = m.slides[i];
      if (on && !s.hidden) {
        edits.push({ at: s.unit.start, del: 0, ins: "<template " + HIDDEN_ATTR + ">" });
        edits.push({ at: s.unit.end, del: 0, ins: "</template>" });
      } else if (!on && s.hidden) {
        edits.push({ at: s.outer.start, del: s.outer.openEnd - s.outer.start, ins: "" });
        edits.push({ at: s.outer.closeStart, del: s.outer.end - s.outer.closeStart, ins: "" });
      }
    });
    return { src: applyEdits(m.src, edits), sel: picked };
  }

  function setNote(m: SlideModel, i: number, text: string): string {
    const s = m.slides[i];
    const src = m.src;
    if (!s) return src;
    if (s.note && s.note.attr) {
      const a = s.note.attr;
      if (!a.hasValue || !a.quote) {
        const name = src.slice(a.start, a.nameEnd);
        return src.slice(0, a.start) + name + '="' + encAttr(text, '"') + '"' + src.slice(a.end);
      }
      return src.slice(0, a.valueStart) + encAttr(text, a.quote) + src.slice(a.valueEnd);
    }
    if (s.note) return src.slice(0, s.note.el.openEnd) + encText(text) + src.slice(s.note.el.closeStart);
    if (!text) return src;

    // No notes on this slide yet: follow whatever the rest of the deck does.
    let peer: Slide | null = null;
    for (let k = 0; k < m.slides.length && !peer; k++) if (m.slides[k].note) peer = m.slides[k];
    if (peer && peer.note && peer.note.kind === "aside") {
      const open = src.slice(peer.note.el.start, peer.note.el.openEnd);
      return src.slice(0, s.core.closeStart) + open + encText(text) + "</aside>" + src.slice(s.core.closeStart);
    }
    const name = peer && peer.note && peer.note.attr ? src.slice(peer.note.attr.start, peer.note.attr.nameEnd) : "data-note";
    const onUnit = !!peer && !!peer.note && peer.note.el === peer.unit && peer.unit !== peer.core;
    const at = attrPos(src, onUnit ? s.unit : s.core);
    if (at < 0) return src;
    return src.slice(0, at) + " " + name + '="' + encAttr(text, '"') + '"' + src.slice(at);
  }

  function copy(m: SlideModel, idxs: number[]): string {
    const gap = typicalGap(m);
    return sorted(idxs, m.slides.length).map(function (i) { return blockText(m, i); }).join(gap);
  }

  /** The slides in a pasted fragment, or none when it holds no slide. */
  function blocksIn(text: string): string[] {
    const m = model(text);
    return m.slides.map(function (_, i) { return blockText(m, i); });
  }

  // ── New slides ──────────────────────────────────────────────────────────

  function placeholderFor(src: string, el: SlideEl): string {
    if (el.name === "h1" || el.name === "h2") return "Title";
    if (/^h[3-6]$/.test(el.name)) return "Heading";
    if (el.name === "blockquote" || el.name === "q") return "Quote";
    if (el.name === "li") return "Item";
    return textOf(src, el).length <= 14 ? "Label" : "Text";
  }

  function relabel(src: string, c: SlideLabel, base: number, label: string): Edit {
    return { at: c.labelStart - base, del: c.labelEnd - c.labelStart, ins: label };
  }

  /** A slide's design with its words, notes, and pictures taken out. */
  function placeholderize(block: string): string {
    const m = model(block);
    if (!m.slides.length) return block;
    const s = m.slides[0];
    const edits: Edit[] = [];
    boxesOf(block, s.unit, []).forEach(function (b) {
      const t = textOf(block, b);
      if (/^\s*\d{1,2}[.)]?\s*$/.test(t)) return;
      edits.push({ at: b.openEnd, del: b.closeStart - b.openEnd, ins: placeholderFor(block, b) });
    });
    if (s.note && s.note.attr && s.note.attr.hasValue) {
      edits.push({ at: s.note.attr.valueStart, del: s.note.attr.valueEnd - s.note.attr.valueStart, ins: "" });
    } else if (s.note && !s.note.attr) {
      edits.push({ at: s.note.el.openEnd, del: s.note.el.closeStart - s.note.el.openEnd, ins: "" });
    }
    walk(s.unit, function (e) {
      if (e.name !== "img") return;
      const srcAttr = attr(e, "src");
      if (srcAttr && srcAttr.hasValue) {
        edits.push({ at: srcAttr.valueStart, del: srcAttr.valueEnd - srcAttr.valueStart, ins: IMAGE_PLACEHOLDER });
      }
      const alt = attr(e, "alt");
      if (alt && alt.hasValue) edits.push({ at: alt.valueStart, del: alt.valueEnd - alt.valueStart, ins: "" });
      const srcset = attr(e, "srcset");
      if (srcset) edits.push({ at: srcset.start - 1, del: srcset.end - srcset.start + 1, ins: "" });
    });
    if (s.comment) edits.push(relabel(block, s.comment, 0, "New slide"));
    return applyEdits(block, edits);
  }

  function signature(text: string): string {
    return text
      .split(COMMENT_OPEN).map(function (part, i) {
        if (!i) return part;
        const close = part.indexOf(COMMENT_CLOSE);
        return close < 0 ? "" : part.slice(close + 3);
      }).join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Every distinct design in the deck, offered the way PowerPoint offers layouts. */
  function layouts(m: SlideModel): SlideLayout[] {
    const seen: Record<string, 1> = {};
    const out: SlideLayout[] = [];
    m.slides.forEach(function (s, i) {
      const text = placeholderize(blockText(m, i));
      const sig = signature(text);
      if (seen[sig]) return;
      seen[sig] = 1;
      const name = (s.comment && s.comment.label) || s.title || "Slide " + (i + 1);
      out.push({ from: i, name, text });
    });
    return out;
  }

  function classSig(s: Slide): string {
    const cls = function (e: SlideEl): string {
      const a = attr(e, "class");
      return e.name + "." + (a ? a.value.trim().split(/\s+/).sort().join(".") : "");
    };
    return cls(s.unit) + ">" + cls(s.core);
  }

  /** The deck's own slide wrapper, holding an empty title and body. */
  function blank(m: SlideModel, ref: number): string {
    const src = m.src;
    const tally: Record<string, number> = {};
    let common = "", most = 0;
    m.slides.forEach(function (s) {
      const k = classSig(s);
      tally[k] = (tally[k] || 0) + 1;
      if (tally[k] > most) { most = tally[k]; common = k; }
    });
    // The current slide's wrapper when it is as common as any (a cover or a
    // closing slide usually is not), else the deck's most common one.
    let s = m.slides[ref] && tally[classSig(m.slides[ref])] === most ? m.slides[ref] : null;
    for (let i = 0; !s && i < m.slides.length; i++) if (classSig(m.slides[i]) === common) s = m.slides[i];
    if (!s) s = m.slides[0];

    const chain: SlideEl[] = [];
    for (let e: SlideEl | null = s.core; e; e = e.parent) {
      chain.unshift(e);
      if (e === s.unit) break;
    }
    let open = "", close = "";
    chain.forEach(function (e) {
      let tag = src.slice(e.start, e.openEnd);
      const note = s && s.note && s.note.el === e ? s.note.attr : null;
      if (note && note.hasValue) {
        tag = tag.slice(0, note.valueStart - e.start) + tag.slice(note.valueEnd - e.start);
      }
      open += tag;
      close = "</" + e.name + ">" + close;
    });

    let heading: SlideEl | null = null;
    for (let i = 0; !heading && i < m.slides.length; i++) {
      const t = m.slides[(i + s.index) % m.slides.length];
      heading = first(t.core, function (e) { return e.name === "h2"; }) ||
        first(t.core, function (e) { return /^h[1-6]$/.test(e.name); });
    }
    const hOpen = heading ? src.slice(heading.start, heading.openEnd) : "<h2>";
    const hName = heading ? heading.name : "h2";
    const indentMatch = /^\r?\n([ \t]*)\S/.exec(src.slice(s.core.openEnd, s.core.openEnd + 200));
    const indent = indentMatch ? indentMatch[1] : "  ";
    const body = "\n" + indent + hOpen + "Title</" + hName + ">\n" + indent + "<p>Text</p>\n";

    let lead = "";
    const labelled = m.slides.filter(function (t) { return t.comment; }).length;
    const sample = s.comment || (m.slides.filter(function (t) { return t.comment; })[0] || {}).comment;
    if (sample && labelled * 2 >= m.slides.length) {
      const text = src.slice(sample.start, sample.end);
      lead = applyEdits(text, [relabel(src, sample, sample.start, "New slide")]) + "\n";
    }
    return lead + open + body + close;
  }

  // ── Rendering copies ────────────────────────────────────────────────────

  function headPos(m: SlideModel): number {
    const head = first(m.root, function (e) { return e.name === "head"; });
    if (head) return head.closeStart;
    const html = first(m.root, function (e) { return e.name === "html"; });
    if (html) return html.openEnd;
    const doctype = /^\s*<!doctype[^>]*>/i.exec(m.src);
    return doctype ? doctype[0].length : 0;
  }

  function unwrapEdits(s: Slide): Edit[] {
    if (!s.hidden) return [];
    return [
      { at: s.outer.start, del: s.outer.openEnd - s.outer.start, ins: "" },
      { at: s.outer.closeStart, del: s.outer.end - s.outer.closeStart, ins: "" },
    ];
  }

  const THUMB_CSS =
    "<style data-dr-thumb>html,body{overflow:hidden!important}" +
    "body>:not([data-dr-keep]):not([data-dr-unit]){display:none!important}" +
    "*,*::before,*::after{transition:none!important}</style>";

  /**
   * The deck reduced to one slide, for a thumbnail. The deck's own runtime
   * still runs and shows its first slide, which is now this one; whatever
   * else sits on the page (nav buttons, progress bar, help) is hidden.
   */
  function isolate(m: SlideModel, k: number, replacement?: string): string {
    if (replacement !== undefined) {
      const s0 = m.slides[k];
      const swapped = m.src.slice(0, s0.start) + replacement + m.src.slice(s0.end);
      const m2 = model(swapped);
      const at = m2.slides.findIndex(function (s) { return s.start >= s0.start; });
      return at < 0 ? swapped : isolate(m2, at);
    }
    const s = m.slides[k];
    const edits: Edit[] = [];
    m.slides.forEach(function (t, j) { if (j !== k) edits.push({ at: t.start, del: t.end - t.start, ins: "" }); });
    edits.push.apply(edits, unwrapEdits(s));
    edits.push(insertAttr(m.src, s.unit, " data-dr-unit"));
    for (let p = s.outer.parent; p && p.name !== "#root" && p.name !== "html" && p.name !== "body"; p = p.parent) {
      edits.push(insertAttr(m.src, p, " data-dr-keep"));
    }
    // Notes never show on a thumbnail, so typing them never redraws one.
    if (s.note && s.note.attr && s.note.attr.hasValue) {
      edits.push({ at: s.note.attr.valueStart, del: s.note.attr.valueEnd - s.note.attr.valueStart, ins: "" });
    }
    edits.push({ at: headPos(m), del: 0, ins: THUMB_CSS });
    return applyEdits(m.src, edits);
  }

  function textBoxes(m: SlideModel): SlideTextBox[] {
    const out: SlideTextBox[] = [];
    m.slides.forEach(function (s, k) {
      boxesOf(m.src, s.unit, []).forEach(function (b) {
        out.push({ slide: k, start: b.openEnd, end: b.closeStart });
      });
    });
    return out;
  }

  /**
   * The editor preview's copy: hidden slides shown (PowerPoint shows them
   * while editing too), every slide tagged with its index, every text box
   * tagged so an edit made on the slide can find its way to the source, and
   * every element outside the head tagged with its index in `nodes`, which
   * is how the inspector links the slide and the source in both directions.
   */
  function decoratePreview(m: SlideModel): { html: string; boxes: SlideTextBox[]; nodes: SlideEl[] } {
    const edits: Edit[] = [];
    const boxes: SlideTextBox[] = [];
    m.slides.forEach(function (s, k) {
      edits.push.apply(edits, unwrapEdits(s));
      edits.push(insertAttr(m.src, s.unit, ' data-dr-slide="' + k + '"' + (s.hidden ? " data-dr-hidden" : "")));
      boxesOf(m.src, s.unit, []).forEach(function (b) {
        edits.push(insertAttr(m.src, b, ' data-dr-t="' + boxes.length + '"'));
        boxes.push({ slide: k, start: b.openEnd, end: b.closeStart });
      });
    });
    const nodes = previewNodes(m);
    nodes.forEach(function (e, n) { edits.push(insertAttr(m.src, e, ' data-dr-n="' + n + '"')); });
    return { html: applyEdits(m.src, edits), boxes, nodes };
  }

  /** The elements `decoratePreview` tags with `data-dr-n`, in tag order. */
  function previewNodes(m: SlideModel): SlideEl[] {
    const nodes: SlideEl[] = [];
    walk(m.root, function (e) {
      if (e.name === "head") return false;
      // A hidden slide's template tags are cut from the preview above.
      if (isOurTemplate(e) || e.name === "script" || e.name === "style") return true;
      if (attrPos(m.src, e) >= 0) nodes.push(e);
      return true;
    });
    return nodes;
  }

  /** The copy that is presented: hidden slides stay hidden; the rest are tagged by position. */
  function decoratePresent(m: SlideModel): { html: string; visible: number[] } {
    const edits: Edit[] = [];
    const visible: number[] = [];
    m.slides.forEach(function (s, k) {
      if (s.hidden) return;
      edits.push(insertAttr(m.src, s.unit, ' data-dr-slide="' + visible.length + '"'));
      visible.push(k);
    });
    return { html: applyEdits(m.src, edits), visible };
  }

  // ── Driving a live deck ─────────────────────────────────────────────────

  function liveSlides(doc: any): any[] {
    return Array.prototype.slice.call(doc.querySelectorAll("[data-dr-slide]"));
  }

  /** The tagged slide taking up the most of the viewport, weighted by opacity. */
  function current(win: any): number {
    let doc: any;
    try { doc = win.document; } catch (e) { return -1; }
    if (!doc || !doc.body) return -1;
    const els = liveSlides(doc);
    const vw = win.innerWidth, vh = win.innerHeight;
    let best = -1, bestScore = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      let op = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const cs = win.getComputedStyle(e);
        if (cs.display === "none") { op = 0; break; }
        op *= parseFloat(cs.opacity) || 0;
      }
      if (win.getComputedStyle(el).visibility === "hidden") op = 0;
      const score = w * h * op;
      if (score > bestScore * 1.02) {
        bestScore = score;
        best = parseInt(el.getAttribute("data-dr-slide"), 10);
      }
    }
    return best;
  }

  function settle(win: any, fn: () => boolean): boolean {
    const doc = win.document;
    const style = doc.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    (doc.head || doc.documentElement).appendChild(style);
    win.getComputedStyle(doc.body).opacity;
    try {
      return fn();
    } finally {
      // Entrance animations finish at once, so the slide reads as it ends up.
      try {
        doc.getAnimations().forEach(function (a: any) {
          try { a.finish(); } catch (e) {}
        });
      } catch (e) {}
      win.getComputedStyle(doc.body).opacity;
      style.remove();
    }
  }

  function press(win: any, key: string): void {
    const codes: Record<string, number> = { ArrowRight: 39, ArrowLeft: 37, Home: 36 };
    const doc = win.document;
    const target = doc.activeElement && doc.activeElement !== doc.documentElement ? doc.activeElement : doc.body;
    ["keydown", "keyup"].forEach(function (type) {
      const ev = new win.KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      try {
        Object.defineProperty(ev, "keyCode", { get: function () { return codes[key]; } });
        Object.defineProperty(ev, "which", { get: function () { return codes[key]; } });
      } catch (e) {}
      target.dispatchEvent(ev);
    });
  }

  /**
   * Shows slide k in a live deck without knowing its runtime: its hash
   * first (`#3`, the common convention), then its arrow keys one press at a
   * time, then plain scrolling for a doc that stacks its slides.
   */
  function goto(win: any, k: number): boolean {
    let doc: any;
    try { doc = win.document; } catch (e) { return false; }
    if (!doc || !doc.body) return false;
    const els = liveSlides(doc);
    const target = els.filter(function (el) { return parseInt(el.getAttribute("data-dr-slide"), 10) === k; })[0];
    if (!target) return false;
    const pos = els.indexOf(target);
    const posOf = function (idx: number): number {
      for (let i = 0; i < els.length; i++) if (parseInt(els[i].getAttribute("data-dr-slide"), 10) === idx) return i;
      return -1;
    };
    return settle(win, function () {
      if (current(win) === k) return true;
      try {
        if (win.location.hash !== "#" + (pos + 1)) win.location.hash = "#" + (pos + 1);
        win.dispatchEvent(new win.HashChangeEvent("hashchange"));
      } catch (e) {}
      if (current(win) === k) return true;
      if (current(win) < 0) press(win, "Home");
      for (let guard = 0; guard <= els.length + 1; guard++) {
        const now = current(win);
        if (now === k) return true;
        press(win, posOf(now) < pos ? "ArrowRight" : "ArrowLeft");
        if (current(win) === now) break;
      }
      if (current(win) === k) return true;
      try { target.scrollIntoView({ block: "start" }); } catch (e) {}
      return current(win) === k;
    });
  }

  return {
    HIDDEN_ATTR, parse, model, decode, textOf, blockText, slideAt, move, duplicate,
    remove, insert, hide, setNote, copy, blocksIn, layouts, blank, isolate, textBoxes,
    decoratePreview, previewNodes, decoratePresent, renumber, numberBase, current, goto,
  };
}

/** Pasted into the editor and the doc presenter, where it defines `DRSlides`. */
export const HTML_SLIDES_RUNTIME = `var DRSlides = (${htmlSlides.toString()})();`;
