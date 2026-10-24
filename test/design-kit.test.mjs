import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { htmlSlides, HTML_SLIDES_RUNTIME } from "../dist/html-slides.js";
import { designKit, DESIGN_KIT_RUNTIME, TRANSITION_PLAYER_RUNTIME } from "../dist/design-kit.js";

const S = htmlSlides();
const K = designKit(S);

const DECK = `<!doctype html>
<html><head><style>.slide{width:1280px;height:720px}</style></head>
<body>
<div id="deck">
<!-- ===== 1. Cover ===== -->
<div class="slot"><section class="slide cover" data-note="hi">
  <h1 class="h" style="margin-top:14px">Hello</h1>
  <p class="lead">One<br>Two</p>
</section></div>

<!-- ===== 2. Table ===== -->
<div class="slot"><section class="slide">
  <table class="cefr"><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>
</section></div>
<template data-deckrun-hidden><div class="slot"><section class="slide"><h2>Spare</h2></section></div></template>
</div>
</body></html>`;

function find(src, test) {
  let hit = null;
  (function walk(el) {
    for (const c of el.children) {
      if (c.kind !== "el") continue;
      if (!hit && test(c)) hit = c;
      walk(c);
    }
  })(S.parse(src));
  return hit;
}

test("inline styles change one declaration and keep the rest as written", () => {
  assert.equal(K.editStyle("margin-top:14px;color:red", { color: "blue" }), "margin-top:14px;color:blue");
  assert.equal(K.editStyle("margin-top: 14px; color: red", { width: "10px" }), "margin-top: 14px; color: red; width: 10px");
  assert.equal(K.editStyle("a:1;b:2", { a: null }), "b:2");
  assert.equal(K.editStyle("", { left: "4px", top: "5px" }), "left:4px;top:5px");
  // A semicolon inside a URL or quotes is part of the value.
  const bg = "background:url(\"data:image/svg+xml;utf8,<svg/>\");color:red";
  assert.equal(K.editStyle(bg, { color: null }), "background:url(\"data:image/svg+xml;utf8,<svg/>\")");
  assert.deepEqual(K.styleMap("Color:Red; font-family:'A B', serif"), { color: "Red", "font-family": "'A B', serif" });
});

test("setStyle rewrites only the style attribute, or adds one", () => {
  const h1 = find(DECK, (e) => e.name === "h1");
  const out = K.setStyle(DECK, h1, { color: "#FF0000", "margin-top": null });
  assert.ok(out.includes('<h1 class="h" style="color:#FF0000">Hello</h1>'));
  assert.equal(out.length - DECK.length, '"color:#FF0000"'.length - '"margin-top:14px"'.length);
  const p = find(DECK, (e) => e.name === "p");
  const out2 = K.setStyle(DECK, p, { "font-family": "'Pretendard Variable', serif" });
  assert.ok(out2.includes(`<p class="lead" style="font-family:'Pretendard Variable', serif">`));
  // A value holding double quotes switches the attribute to single quotes.
  const out3 = K.setStyle(DECK, p, { "font-family": '"A B"' });
  assert.ok(out3.includes(`style='font-family:"A B"'`));
  // Clearing the last declaration drops the attribute.
  const h1b = find(out, (e) => e.name === "h1");
  assert.ok(K.setStyle(out, h1b, { color: null }).includes('<h1 class="h">Hello</h1>'));
});

test("new elements go in as the slide's last child, indented like their siblings", () => {
  const m = S.model(DECK);
  const core = m.slides[0].core;
  const html = K.textBox({ x: 100, y: 50.5, w: 320 });
  const ins = K.insertEnd(DECK, core, html);
  const out = K.apply(DECK, [ins.edit]);
  assert.ok(out.includes('  <p class="lead">One<br>Two</p>\n  <p data-dz="text" style="position:absolute;left:100px;top:50.5px;width:320px;margin:0">Text</p>\n</section></div>'));
  assert.equal(out.slice(ins.start, ins.start + 3), "<p ");
  const m2 = S.model(out);
  assert.equal(m2.slides.length, 3, "still three slides");
});

test("an element can be removed with its line, duplicated after itself, and moved to the front", () => {
  const p = find(DECK, (e) => e.name === "p");
  const gone = K.apply(DECK, [K.removeEdit(DECK, p)]);
  assert.ok(gone.includes('<h1 class="h" style="margin-top:14px">Hello</h1>\n</section>'));
  const dup = K.insertAfter(DECK, p, K.outer(DECK, p));
  const two = K.apply(DECK, [dup.edit]);
  assert.equal((two.match(/class="lead"/g) || []).length, 2);
  assert.equal(two.slice(dup.start, dup.start + 16), '<p class="lead">');
  const h1 = find(DECK, (e) => e.name === "h1");
  const mv = K.moveEdits(DECK, h1, "last");
  const moved = K.apply(DECK, mv.edits);
  assert.ok(moved.indexOf('class="lead"') < moved.indexOf("<h1"));
  assert.equal(moved.slice(mv.start, mv.start + 3), "<h1");
});

test("shapes, lines, and tables are self-contained markup the parser reads back", () => {
  const rect = K.shape("rect", { x: 10, y: 20, w: 200, h: 120 });
  assert.ok(rect.startsWith('<div data-dz="rect" style="position:absolute;left:10px;top:20px;width:200px;height:120px;'));
  assert.ok(rect.includes("background:#9AA0A6"));
  const dia = K.shape("diamond", { x: 0, y: 0, w: 100, h: 80 });
  assert.ok(dia.includes('<path d="M50 0L100 50L50 100L0 50Z" fill="#9AA0A6"'));
  const ln = K.line({ kind: "connector", x1: 300, y1: 200, x2: 100, y2: 260, width: 2, color: "#123456" });
  const g = K.lineGeom(ln);
  assert.deepEqual([g.x1, g.y1, g.x2, g.y2], [300, 200, 100, 260]);
  assert.equal(g.kind, "connector");
  assert.equal(g.color, "#123456");
  assert.ok(ln.includes("<path"), "a connector has an arrow head");
  // Redrawn from its geometry, a line keeps whatever else its style held.
  const styled = ln.replace("overflow:visible", "overflow:visible;z-index:2;opacity:0.5");
  const again = K.line(K.lineGeom(styled));
  assert.ok(again.includes("z-index:2;opacity:0.5"));
  assert.deepEqual(K.lineGeom(again).x1, 300);
  const tbl = K.table({ x: 0, y: 0, w: 480, rows: 3, cols: 3 });
  const t = find(tbl, (e) => e.name === "table");
  const info = K.tableInfo(tbl, t);
  assert.equal(info.rows.length, 3);
  assert.equal(info.cols, 3);
  assert.equal(info.header, true);
});

test("tables grow and shrink by rows and columns, and toggle their header row", () => {
  let src = DECK;
  let t = find(src, (e) => e.name === "table");
  src = K.tableSize(src, t, 3, 3);
  t = find(src, (e) => e.name === "table");
  let info = K.tableInfo(src, t);
  assert.equal(info.rows.length, 3);
  assert.ok(info.rows.every((r) => r.cells.length === 3));
  src = K.tableSize(src, t, 1, 1);
  t = find(src, (e) => e.name === "table");
  assert.equal(K.outer(src, t), '<table class="cefr"><tr><td>A</td></tr></table>');
  src = K.tableHeader(src, t, true);
  assert.ok(src.includes('<table class="cefr"><tr><th>A</th></tr></table>'));

  // A table this view made grows body rows from its header without the header look.
  let made = `<div>${K.table({ x: 0, y: 0, w: 300, rows: 1, cols: 2 })}</div>`;
  let mt = find(made, (e) => e.name === "table");
  made = K.tableSize(made, mt, 2, 2);
  mt = find(made, (e) => e.name === "table");
  info = K.tableInfo(made, mt);
  assert.equal(info.rows[1].cells[0].name, "td");
  assert.ok(!/background|font-weight/.test(K.attr(info.rows[1].cells[0], "style").value));
  made = K.tableHeader(made, mt, false);
  mt = find(made, (e) => e.name === "table");
  info = K.tableInfo(made, mt);
  assert.equal(info.header, false);
  assert.ok(!/background/.test(K.attr(info.rows[0].cells[0], "style").value));
  made = K.tableColWidth(made, mt, 1, "120px");
  mt = find(made, (e) => e.name === "table");
  assert.deepEqual(K.tableInfo(made, mt).widths, ["auto", "120px"]);
});

test("a text box becomes a list and back, keeping its attributes", () => {
  const p = find(DECK, (e) => e.name === "p");
  const ul = K.listify(DECK, p, "bullet");
  assert.ok(ul.includes('<ul class="lead" style="padding-left:1.2em"><li>One</li><li>Two</li></ul>'));
  const list = find(ul, (e) => e.name === "ul");
  const ol = K.listify(ul, list, "number");
  assert.ok(ol.includes('<ol class="lead" style="padding-left:1.2em"><li>One</li><li>Two</li></ol>'));
  const back = K.listify(ol, find(ol, (e) => e.name === "ol"), "none");
  assert.ok(back.includes('<div class="lead">One<br>Two</div>'));
});

test("colors, shadows, sides, and font stacks parse the way computed styles read", () => {
  assert.deepEqual(K.rgba("rgb(22, 19, 31)"), { r: 22, g: 19, b: 31, a: 1 });
  assert.deepEqual(K.rgba("rgba(0, 0, 0, 0.2)"), { r: 0, g: 0, b: 0, a: 0.2 });
  assert.deepEqual(K.rgba("#abc"), { r: 170, g: 187, b: 204, a: 1 });
  assert.equal(K.hex({ r: 22, g: 19, b: 31, a: 1 }), "#16131F");
  assert.equal(K.css({ r: 0, g: 0, b: 0, a: 0.2 }), "rgba(0,0,0,0.2)");
  const sh = K.shadows("rgba(0, 0, 0, 0.2) 0px 2px 8px 0px, inset 0 1px 2px #000");
  assert.equal(sh.length, 2);
  assert.deepEqual([sh[0].x, sh[0].y, sh[0].blur, sh[0].spread, sh[0].inset], [0, 2, 8, 0, false]);
  assert.equal(sh[0].color, "rgba(0, 0, 0, 0.2)");
  assert.equal(sh[1].inset, true);
  assert.equal(K.shadowCss(sh), "0px 2px 8px rgba(0, 0, 0, 0.2), inset 0px 1px 2px #000");
  assert.deepEqual(K.sides("20px 36px"), [20, 36, 20, 36]);
  assert.equal(K.quoteFamilies('"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif'),
    "'Pretendard Variable', Pretendard, 'Malgun Gothic', sans-serif");
});

test("downloads drop hidden slides and find the files a page leans on", () => {
  const m = S.model(DECK);
  const out = K.stripHidden(m);
  assert.ok(!out.includes("Spare") && !out.includes("data-deckrun-hidden"));
  assert.equal(S.model(out).slides.length, 2);
  const refs = K.assetRefs('<img src="a.png"><video poster="b c.jpg" src="https://x/y.mp4"></video><div style="background:url(\'img/d.webp\')"></div><img src="data:image/png;base64,AA">');
  assert.deepEqual(refs.map((r) => r.url), ["a.png", "b c.jpg", "img/d.webp"]);
});

test("transitions name their keyframes, and the runtimes paste safely into a script element", () => {
  assert.equal(K.frames("", 1), null);
  assert.equal(K.frames("slide", -1)[0].transform, "translateX(-14%)");
  for (const rt of [DESIGN_KIT_RUNTIME, TRANSITION_PLAYER_RUNTIME]) {
    const lower = rt.toLowerCase();
    assert.ok(!lower.includes("<!" + "--") && !lower.includes("<scr" + "ipt") && !lower.includes("</scr" + "ipt"));
  }
  const ctx = { src: DECK, requestAnimationFrame: () => 0 };
  vm.runInNewContext(HTML_SLIDES_RUNTIME + ";" + DESIGN_KIT_RUNTIME + ";" + TRANSITION_PLAYER_RUNTIME +
    ";this.n = DRDesign.styleMap('a:b').a; this.ok = typeof DRTransitions.attach;", ctx);
  assert.equal(ctx.n, "b");
  assert.equal(ctx.ok, "function");
});
