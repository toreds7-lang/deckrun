import { marked, Marked, type TokenizerAndRendererExtension } from "marked";
import { htmlSlides, type SlideEl } from "./html-slides.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Capture TeX before the regular Markdown tokenizer sees it. This keeps
 * operators such as `*` and `_` inside a formula instead of turning them into
 * emphasis. The browser can then render these deliberately marked nodes with
 * KaTeX after fonts and layout styles are available.
 */
const EXTENSIONS: TokenizerAndRendererExtension[] = [
  {
    name: "deckrunBlockMath",
    level: "block",
    tokenizer(src) {
      const dollars = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$(?:[ \t]*(?:\n|$))/.exec(src);
      const brackets = /^\\\[[ \t]*\n?([\s\S]+?)\n?[ \t]*\\\](?:[ \t]*(?:\n|$))/.exec(src);
      const match = dollars ?? brackets;
      if (!match) return;
      return {
        type: "deckrunBlockMath",
        raw: match[0],
        text: match[1].trim(),
        display: true,
      };
    },
    renderer(token) {
      return `<div class="math-source" data-display="true">${escapeHtml(String(token.text))}</div>\n`;
    },
  },
  {
    name: "deckrunInlineMath",
    level: "inline",
    start(src) {
      const dollar = src.indexOf("$");
      const paren = src.indexOf("\\(");
      if (dollar < 0) return paren < 0 ? undefined : paren;
      if (paren < 0) return dollar;
      return Math.min(dollar, paren);
    },
    tokenizer(src) {
      // A closing dollar followed by a digit is treated as currency rather
      // than math, so ordinary prose like "$5 and $10" stays untouched.
      const dollars = /^\$(?!\s|\$)((?:\\.|[^\\$\n])*?[^\\$\s])\$(?!\$|\d)/.exec(src);
      const parens = /^\\\(((?:\\.|[^\\\n])*?)\\\)/.exec(src);
      const match = dollars ?? parens;
      if (!match) return;
      return {
        type: "deckrunInlineMath",
        raw: match[0],
        text: match[1],
        display: false,
      };
    },
    renderer(token) {
      return `<span class="math-source" data-display="false">${escapeHtml(String(token.text))}</span>`;
    },
  },
  {
    name: "deckrunRevealMarker",
    level: "inline",
    start(src) {
      const at = src.indexOf("{reveal}");
      return at < 0 ? undefined : at;
    },
    tokenizer(src) {
      const match = /^\{reveal\}/.exec(src);
      if (!match) return;
      return { type: "deckrunRevealMarker", raw: match[0] };
    },
    renderer() {
      return '<span class="deckrun-fragment-marker" aria-hidden="true"></span>';
    },
  },
];

marked.use({ extensions: EXTENSIONS });

export interface PositionedImage {
  src: string;
  alt: string;
  opacity: number;
}

/**
 * Where a rendered element came from, for the editor's inspector:
 * `[start, end, firstLineEnd, parent, label]`. Offsets index the Markdown as
 * sent (line endings normalized), and `parent` indexes the same slide's list,
 * whose entry 0 is the slide itself (parent -1).
 */
export type SourceNode = [number, number, number, number, string];

export interface Slide {
  html: string;
  bgImage?: PositionedImage;
  rightImage?: PositionedImage;
  leftImage?: PositionedImage;
  notes?: string;
  /** Only when parsed with `map`: entry j is the element tagged `data-dr-n="k.j"` on slide k. */
  map?: SourceNode[];
  /** Only when parsed with `map`: the tags `renderSlide` puts on the parts it adds itself. */
  tags?: { slide: string; image?: string; bg?: string };
}

type ImagePosition = "inline" | "right" | "left" | "bg";

function parseImageDirective(title: string | undefined | null): {
  position: ImagePosition;
  opacity: number;
} {
  if (!title) return { position: "inline", opacity: 1 };

  const t = title.trim().toLowerCase();
  let position: ImagePosition = "inline";

  if (t.includes("right")) position = "right";
  else if (t.includes("left")) position = "left";
  else if (t.includes("bg")) position = "bg";

  const opacityMatch = t.match(/opacity[=:]?\s*([0-9]*\.?[0-9]+)/);
  const opacity = opacityMatch
    ? Math.min(1, Math.max(0, parseFloat(opacityMatch[1])))
    : 1;

  return { position, opacity };
}

/**
 * `map` is for the editor's preview: every element rendered from the source
 * also carries `data-dr-n`, and `slide.map` says where each one came from.
 * The HTML is otherwise byte for byte what an unmapped parse produces.
 */
export function parseSlides(markdown: string, opts: { map?: boolean } = {}): Slide[] {
  // Normalize line endings
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split on slide separator: "---" on its own line (with optional surrounding
  // blank lines), keeping where each piece starts for the map.
  const pieces: Array<{ text: string; at: number }> = [];
  const separator = /\n[ \t]*---[ \t]*\n/g;
  let from = 0;
  for (let m = separator.exec(normalized); m; m = separator.exec(normalized)) {
    pieces.push({ text: normalized.slice(from, m.index), at: from });
    from = m.index + m[0].length;
  }
  pieces.push({ text: normalized.slice(from), at: from });

  const slides: Slide[] = [];
  for (const piece of pieces) {
    const raw = piece.text.trim();
    if (raw.length === 0) continue;
    const rawAt = piece.at + piece.text.length - piece.text.trimStart().length;
    slides.push(parseSlide(raw, opts.map ? { k: slides.length, at: rawAt } : null));
  }
  return slides;
}

function parseSlide(raw: string, mapping: { k: number; at: number } | null): Slide {
  const slide: Slide = { html: "" };
  const imageAt: Partial<Record<ImagePosition, [number, number]>> = {};

  // Extract speaker notes (<!-- notes: ... --> at end)
  const notesMatch = raw.match(/<!--\s*notes?:\s*([\s\S]*?)\s*-->/i);
  if (notesMatch) {
    slide.notes = notesMatch[1].trim();
  }
  let processedMd = raw.replace(/<!--\s*notes?:\s*[\s\S]*?\s*-->/gi, "");

  // Find positioned images via title attribute: ![alt](src "right opacity:0.7")
  const imgRegex =
    /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
  const toRemove: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex before use since we're reusing the regex
  imgRegex.lastIndex = 0;

  while ((match = imgRegex.exec(raw)) !== null) {
    const [full, alt, src, titleAttr] = match;
    const { position, opacity } = parseImageDirective(titleAttr);

    if (position === "bg") {
      slide.bgImage = { src, alt, opacity };
      toRemove.push(full);
    } else if (position === "right") {
      slide.rightImage = { src, alt, opacity };
      toRemove.push(full);
    } else if (position === "left") {
      slide.leftImage = { src, alt, opacity };
      toRemove.push(full);
    }
    if (position !== "inline") imageAt[position] = [match.index, match.index + full.length];
  }

  for (const item of toRemove) {
    // Replace only first occurrence (the matched image)
    processedMd = processedMd.replace(item, "");
  }

  // Render remaining markdown to HTML
  slide.html = marked.parse(processedMd.trim()) as string;

  if (mapping) mapSlide(slide, mapping.k, mapping.at, raw, toRemove, processedMd.trim(), imageAt);
  return slide;
}

// ── Source map for the editor's inspector ─────────────────────────────────

const H = htmlSlides();
const TAG_ATTR = "data-dr-n";
const TAGGED_TYPES = [
  "heading", "paragraph", "list", "code", "blockquote", "table", "hr", "html",
  "image", "link", "deckrunBlockMath",
];

/** One block or inline token's tags: its own, its list items', its table rows', or a raw HTML token's elements. */
interface TokenTags {
  key: string;
  items?: Array<string | null>;
  rows?: Array<string | null>;
  els?: Array<{ at: number; key: string }>;
  raw?: string;
}

/** Set only while a slide renders through TAGGER (rendering is synchronous). */
let tagging: { tags: Map<object, TokenTags>; busy: Set<object> } | null = null;

/**
 * Renders each tagged token the ordinary way, then adds `data-dr-n` to the
 * element it produced. Re-entering marked for the same token returns false,
 * which hands it to the built-in renderer (or the deckrun extension's).
 */
const TAGGER = new Marked(
  { extensions: EXTENSIONS },
  {
    extensions: TAGGED_TYPES.map((name) => ({
      name,
      renderer(this: any, token: any) {
        const tags = tagging && tagging.tags.get(token);
        if (!tagging || !tags || tagging.busy.has(token)) return false;
        const busy = tagging.busy;
        busy.add(token);
        let html: string;
        try {
          const inline = name === "image" || name === "link" || (name === "html" && !token.block);
          html = inline ? this.parser.parseInline([token]) : this.parser.parse([token]);
        } finally {
          busy.delete(token);
        }
        return tagHtml(html, tags);
      },
    })),
  }
);

function attrAt(html: string, el: SlideEl): number {
  const at = el.openEnd - 1;
  if (html.charAt(at) !== ">") return -1;
  return html.charAt(at - 1) === "/" ? at - 1 : at;
}

function elementsOf(el: SlideEl, out: SlideEl[] = []): SlideEl[] {
  for (const c of el.children) {
    if (c.kind !== "el") continue;
    out.push(c as SlideEl);
    elementsOf(c as SlideEl, out);
  }
  return out;
}

function tagHtml(html: string, tags: TokenTags): string {
  const edits: Array<[number, string]> = [];
  if (tags.els) {
    // Raw HTML passes through verbatim, so its offsets are the source's.
    if (html !== tags.raw) return html;
    for (const e of tags.els) edits.push([e.at, e.key]);
  } else {
    const all = elementsOf(H.parse(html));
    const first = all[0];
    if (!first) return html;
    edits.push([attrAt(html, first), tags.key]);
    if (tags.items) {
      const items = first.children.filter((c) => c.kind === "el" && (c as SlideEl).name === "li") as SlideEl[];
      items.forEach((li, i) => { if (tags.items![i]) edits.push([attrAt(html, li), tags.items![i]!]); });
    }
    if (tags.rows) {
      all.filter((e) => e.name === "tr").forEach((tr, i) => {
        if (tags.rows![i]) edits.push([attrAt(html, tr), tags.rows![i]!]);
      });
    }
  }
  let out = html;
  edits.filter((e) => e[0] >= 0).sort((a, b) => b[0] - a[0]).forEach(([at, key]) => {
    out = out.slice(0, at) + " " + TAG_ATTR + '="' + key + '"' + out.slice(at);
  });
  return out;
}

function htmlLabel(el: SlideEl): string {
  let label = el.name;
  for (const a of el.attrs) {
    if (a.name === "id" && a.value) label += "#" + a.value;
  }
  for (const a of el.attrs) {
    if (a.name === "class") label += a.value.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => "." + c).join("");
  }
  return label;
}

/** Text with each character traced back to its offset in the source. */
interface Traced { text: string; at: number[]; }

function cut(t: Traced, a: number, b: number): Traced {
  return { text: t.text.slice(0, a) + t.text.slice(b), at: t.at.slice(0, a).concat(t.at.slice(b)) };
}

function mapSlide(
  slide: Slide,
  k: number,
  base: number,
  raw: string,
  removed: string[],
  processed: string,
  imageAt: Partial<Record<ImagePosition, [number, number]>>
): void {
  const key = (j: number): string => k + "." + j;
  const firstLine = raw.indexOf("\n");
  const map: SourceNode[] = [[base, base + raw.length, base + (firstLine < 0 ? raw.length : firstLine), -1, "slide " + (k + 1)]];
  slide.map = map;
  slide.tags = { slide: key(0) };
  const side = slide.rightImage ? imageAt.right : slide.leftImage ? imageAt.left : undefined;
  if (side) {
    slide.tags.image = key(map.length);
    map.push([base + side[0], base + side[1], base + side[1], 0, "img"]);
  }
  if (slide.bgImage && imageAt.bg) {
    slide.tags.bg = key(map.length);
    map.push([base + imageAt.bg[0], base + imageAt.bg[1], base + imageAt.bg[1], 0, "background image"]);
  }

  // Replay parseSlide's cuts on traced text, so every offset marked sees
  // still knows where it came from.
  let t: Traced = { text: raw, at: Array.from({ length: raw.length }, (_, i) => base + i) };
  const notes = Array.from(raw.matchAll(/<!--\s*notes?:\s*[\s\S]*?\s*-->/gi));
  for (let i = notes.length - 1; i >= 0; i--) t = cut(t, notes[i].index!, notes[i].index! + notes[i][0].length);
  for (const item of removed) {
    const i = t.text.indexOf(item);
    if (i >= 0) t = cut(t, i, i + item.length);
  }
  const lead = t.text.length - t.text.trimStart().length;
  const trimmed = t.text.trim();
  t = { text: trimmed, at: t.at.slice(lead, lead + trimmed.length) };
  if (t.text !== processed) return;
  t = widenTabs(t);

  const before = map.length;
  const tokens = TAGGER.lexer(t.text);
  tagging = { tags: placeTokens(t, tokens, key, map), busy: new Set() };
  let html = "";
  try {
    html = TAGGER.parser(tokens) as string;
  } catch {
    html = "";
  } finally {
    tagging = null;
  }
  // The tags are the only difference allowed; anything else keeps the plain render.
  if (html.replace(/ data-dr-n="[^"]*"/g, "") !== slide.html) {
    map.length = before;
    return;
  }
  slide.html = html;
}

/** marked widens leading tabs to four spaces before it tokenizes; doing it first keeps its offsets ours. */
function widenTabs(t: Traced): Traced {
  if (t.text.indexOf("\t") < 0) return t;
  let text = "";
  const at: number[] = [];
  const keep = (a: number, b: number): void => {
    text += t.text.slice(a, b);
    for (let i = a; i < b; i++) at.push(t.at[i]);
  };
  const re = /^( *)(\t+)/gm;
  let last = 0;
  for (let m = re.exec(t.text); m; m = re.exec(t.text)) {
    keep(last, m.index + m[1].length);
    for (let i = 0; i < m[2].length; i++) {
      const o = t.at[m.index + m[1].length + i];
      text += "    ";
      at.push(o, o, o, o);
    }
    last = m.index + m[0].length;
  }
  keep(last, t.text.length);
  return { text, at };
}

/**
 * Gives every taggable token a source range and a map entry. Top-level
 * tokens tile the text exactly. Nested ones (list items, quoted blocks)
 * were lexed from de-indented or de-quoted copies, so they are found by
 * their lines, in order, inside their parent's range.
 */
function placeTokens(t: Traced, tokens: any[], key: (j: number) => string, map: SourceNode[]): Map<object, TokenTags> {
  const tags = new Map<object, TokenTags>();
  const text = t.text;
  const srcAt = (i: number): number => (i < t.at.length ? t.at[i] : t.at.length ? t.at[t.at.length - 1] + 1 : 0);
  const srcEnd = (i: number): number => (i > 0 ? t.at[Math.min(i, t.at.length) - 1] + 1 : srcAt(0));

  function node(s: number, e: number, parent: number, label: string): number {
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    const nl = text.indexOf("\n", s);
    const o = nl >= 0 && nl < e ? nl : e;
    map.push([srcAt(s), srcEnd(e), srcEnd(o), parent, label]);
    return map.length - 1;
  }

  function locate(raw: string, from: number, to: number): [number, number] | null {
    const lines = String(raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
    let s = -1, c = from;
    for (const line of lines) {
      const at = text.indexOf(line, c);
      if (at < 0 || at + line.length > to) break;
      if (s < 0) s = at;
      c = at + line.length;
    }
    return s < 0 ? null : [s, c];
  }

  function blockName(tok: any): string | null {
    switch (tok.type) {
      case "heading": return "h" + tok.depth;
      case "paragraph": return "p";
      case "list": return tok.ordered ? "ol" : "ul";
      case "code": return "pre";
      case "blockquote": return "blockquote";
      case "table": return "table";
      case "hr": return "hr";
      case "deckrunBlockMath": return "div.math-source";
      default: return null;
    }
  }

  // Raw HTML: each element inside it gets its own entry, as long as the
  // token sits in the source verbatim.
  function html(tok: any, s: number, parent: number): void {
    const raw = String(tok.raw || "");
    if (!raw || !text.startsWith(raw, s)) return;
    const els: Array<{ at: number; key: string }> = [];
    const ids = new Map<SlideEl, number>();
    for (const el of elementsOf(H.parse(raw))) {
      if (el.name === "script" || el.name === "style") continue;
      const at = attrAt(raw, el);
      if (at < 0) continue;
      const up = el.parent && ids.has(el.parent as SlideEl) ? ids.get(el.parent as SlideEl)! : parent;
      const j = node(s + el.start, s + el.end, up, htmlLabel(el));
      ids.set(el, j);
      els.push({ at, key: key(j) });
    }
    if (els.length) tags.set(tok, { key: "", els, raw });
  }

  function inline(list: any[] | undefined, from: number, to: number, parent: number): void {
    let c = from;
    for (const tok of list || []) {
      const raw = String(tok.raw || "");
      if (!raw) continue;
      const at = text.indexOf(raw, c);
      if (at < 0 || at + raw.length > to) continue;
      c = at + raw.length;
      if (tok.type === "image") {
        tags.set(tok, { key: key(node(at, c, parent, "img")) });
      } else if (tok.type === "link") {
        const j = node(at, c, parent, "a");
        tags.set(tok, { key: key(j) });
        inline(tok.tokens, at, c, j);
      } else if (tok.type === "html") {
        html(tok, at, parent);
      } else if (tok.tokens) {
        inline(tok.tokens, at, c, parent);
      }
    }
  }

  function block(tok: any, s: number, e: number, parent: number): void {
    if (tok.type === "html") { html(tok, s, parent); return; }
    const name = blockName(tok);
    if (!name) {
      if (tok.type === "text") inline(tok.tokens, s, e, parent);
      return;
    }
    const j = node(s, e, parent, name);
    const own: TokenTags = { key: key(j) };
    tags.set(tok, own);
    if (tok.type === "list") {
      own.items = [];
      let c = s;
      for (const item of tok.items || []) {
        const r = locate(item.raw, c, e);
        if (!r) { own.items.push(null); continue; }
        c = r[1];
        const ij = node(r[0], r[1], j, "li");
        own.items.push(key(ij));
        blocks(item.tokens, r[0], r[1], ij, false);
      }
    } else if (tok.type === "blockquote") {
      blocks(tok.tokens, s, e, j, false);
    } else if (tok.type === "paragraph" || tok.type === "heading") {
      inline(tok.tokens, s, e, j);
    } else if (tok.type === "table") {
      // One source line per row: the header, the delimiter row, then the body.
      const lines: Array<[number, number]> = [];
      for (let a = s; a < e;) {
        const nl = text.indexOf("\n", a);
        const b = nl < 0 || nl > e ? e : nl;
        if (text.slice(a, b).trim()) lines.push([a, b]);
        a = b + 1;
      }
      const rowLines = lines.slice(0, 1).concat(lines.slice(2));
      const cells = [tok.header].concat(tok.rows || []);
      own.rows = cells.map((row: any[], i: number) => {
        const ln = rowLines[i];
        if (!ln) return null;
        const rj = node(ln[0], ln[1], j, "tr");
        for (const cell of row || []) inline(cell.tokens, ln[0], ln[1], rj);
        return key(rj);
      });
    }
  }

  function blocks(list: any[] | undefined, from: number, to: number, parent: number, exact: boolean): void {
    let c = from;
    for (const tok of list || []) {
      const raw = String(tok.raw || "");
      let r: [number, number] | null;
      if (exact) {
        const at = text.startsWith(raw, c) ? c : text.indexOf(raw, c);
        r = at < 0 ? null : [at, at + raw.length];
      } else {
        r = tok.type === "space" || !raw.trim() ? null : locate(raw, c, to);
      }
      if (!r) continue;
      c = r[1];
      if (tok.type !== "space") block(tok, r[0], r[1], parent);
    }
  }

  blocks(tokens, 0, text.length, 0, true);
  return tags;
}
