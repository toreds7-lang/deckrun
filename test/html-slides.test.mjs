import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { htmlSlides, HTML_SLIDES_RUNTIME } from "../dist/html-slides.js";

const S = htmlSlides();

// Shaped like a hand-written deck: a wrapper per slide, a numbered comment
// above each, notes in an attribute, and a runtime whose strings look like tags.
const DECK = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Deck</title>
<style>
.slot{position:absolute;inset:0;opacity:0}
.slot.on{opacity:1}
</style>
</head>
<body>

<div id="stage"><div id="deck">

<!-- ===== 1. 표지 ===== -->
<div class="slot"><section class="slide cover" data-note="Open with &quot;why&quot; &amp; how.">
  <h1>Why I <br>started</h1>
  <img src="family.png" alt="family">
</section></div>

<!-- ===== 2. Four scenes ===== -->
<div class="slot" data-c="blue"><section class="slide" data-note="Four scenes.">
  <h2 class="h">Four <span class="mark">scenes</span></h2>
  <div class="card" id="c1"><div class="no">01</div><div class="say">Change<br>the school</div></div>
</section></div>

<!-- ===== 3. Ending ===== -->
<div class="slot"><section class="slide end" data-note="">
  <blockquote>Anyone can do it</blockquote>
  <p>last line
</section></div>

</div></div>

<div id="nav"><button id="next">next</button></div>
<script>
(function(){
  var slots = document.querySelectorAll('.slot');
  if (slots.length < 2) { document.body.innerHTML += '</div><section class="slide">x</section>'; }
})();
</script>
</body>
</html>
`;

/** Each slide's comment label as written, number included: "2a. c". */
function labels(src) {
  return S.model(src).slides.map((s) => {
    const c = s.comment;
    if (!c) return null;
    return src.slice(c.num === null ? c.labelStart : c.numStart, c.labelEnd);
  });
}

test("finds each slide's wrapper, label, title, and notes", () => {
  const m = S.model(DECK);
  assert.equal(m.slides.length, 3, "the runtime's tag-like strings are not slides");
  assert.deepEqual(m.slides.map((s) => s.unit.name + ">" + s.core.name), ["div>section", "div>section", "div>section"]);
  assert.deepEqual(labels(DECK), ["1. 표지", "2. Four scenes", "3. Ending"]);
  assert.deepEqual(m.slides.map((s) => s.title), ["Why I started", "Four scenes", "Anyone can do it"]);
  assert.equal(m.slides[0].note.text, 'Open with "why" & how.');
  assert.ok(S.blockText(m, 0).startsWith('<!-- ===== 1. 표지 ===== -->\n<div class="slot">'));
  assert.ok(S.blockText(m, 2).endsWith("</section></div>"));
  assert.equal(S.slideAt(m, m.slides[1].start + 40), 1);
  assert.equal(S.numberBase(m), 1);
});

test("reorder keeps everything else byte for byte and renumbers", () => {
  const m = S.model(DECK);
  const r = S.move(m, [2], 0);
  assert.deepEqual(r.sel, [0]);
  assert.deepEqual(labels(r.src), ["1. Ending", "2. 표지", "3. Four scenes"]);
  assert.ok(r.src.startsWith(DECK.slice(0, m.slides[0].start)));
  assert.ok(r.src.endsWith(DECK.slice(m.slides[2].end)));
  assert.equal(r.src.length, DECK.length);
  assert.equal(S.move(m, [1], 1), null, "dropping a slide where it already is changes nothing");
  assert.equal(S.move(m, [1], 2), null);
  assert.equal(S.move(S.model(r.src), [0], 3).src, DECK, "moving it back restores the original exactly");
  assert.deepEqual(labels(S.move(m, [0, 2], 2).src), ["1. Four scenes", "2. 표지", "3. Ending"]);
});

test("duplicate, delete, copy, and paste", () => {
  const m = S.model(DECK);
  const dup = S.duplicate(m, [1]);
  assert.deepEqual(dup.sel, [2]);
  assert.deepEqual(labels(dup.src), ["1. 표지", "2. Four scenes", "3. Four scenes", "4. Ending"]);
  assert.ok(dup.src.includes('id="c1"') && dup.src.includes('id="c1-2"'), "the copy gets its own id");

  assert.equal(S.remove(m, [0, 1, 2]), null, "the last slide cannot go");
  const del = S.remove(m, [0]);
  assert.deepEqual(del.sel, [0]);
  assert.deepEqual(labels(del.src), ["1. Four scenes", "2. Ending"]);
  assert.ok(del.src.includes('<div id="deck">\n\n<!-- ===== 1. Four scenes'), "no stray blank lines left behind");

  const blocks = S.blocksIn(S.copy(m, [0, 1]));
  assert.equal(blocks.length, 2);
  const pasted = S.insert(m, 3, blocks);
  assert.deepEqual(pasted.sel, [3, 4]);
  assert.deepEqual(labels(pasted.src), ["1. 표지", "2. Four scenes", "3. Ending", "4. 표지", "5. Four scenes"]);
  assert.deepEqual(S.blocksIn("just some words"), []);
});

test("hidden slides are inert templates the deck's runtime never sees", () => {
  const m = S.model(DECK);
  const hidden = S.hide(m, [1], true).src;
  assert.ok(hidden.includes('<template data-deckrun-hidden><div class="slot" data-c="blue">'));
  assert.ok(hidden.includes("</section></div></template>"));
  const hm = S.model(hidden);
  assert.equal(hm.slides.length, 3);
  assert.deepEqual(hm.slides.map((s) => s.hidden), [false, true, false]);
  assert.deepEqual(labels(hidden), labels(DECK), "the label still belongs to the hidden slide");
  assert.equal(S.hide(hm, [1], false).src, DECK, "showing it again restores the source");

  const present = S.decoratePresent(hm);
  assert.deepEqual(present.visible, [0, 2]);
  assert.equal(present.html.split("data-dr-slide=").length - 1, 2);

  const preview = S.decoratePreview(hm);
  assert.ok(!preview.html.includes("<template data-deckrun-hidden>"), "the editor preview shows it");
  assert.ok(preview.html.includes('data-dr-slide="1" data-dr-hidden'));
  assert.ok(preview.html.includes('<h2 class="h" data-dr-t='));
  assert.ok(preview.boxes.every((b) => b.end > b.start && b.slide >= 0 && b.slide < 3));
  assert.deepEqual(preview.boxes, S.textBoxes(hm));
});

test("notes are written back escaped, in the deck's own convention", () => {
  const m = S.model(DECK);
  const once = S.setNote(m, 1, 'He said "go" & left');
  assert.ok(once.includes('data-note="He said &quot;go&quot; &amp; left"'));
  assert.equal(S.model(once).slides[1].note.text, 'He said "go" & left');
  assert.equal(S.setNote(m, 2, "x").length, DECK.length + 1);

  const bare = DECK.replace('<section class="slide end" data-note="">', '<section class="slide end">');
  assert.ok(S.setNote(S.model(bare), 2, "Close it").includes('<section class="slide end" data-note="Close it">'));
  assert.equal(S.setNote(S.model(bare), 2, ""), bare);

  const reveal = `<div class="reveal"><div class="slides">
  <section><h2>A</h2></section>
  <section><section><h2>B1</h2></section><section><h2>B2</h2></section></section>
  <section><h2>C</h2><aside class="notes">Say C</aside></section>
</div></div>`;
  const rm = S.model(reveal);
  assert.equal(rm.slides.length, 3, "a vertical stack is one slide");
  assert.equal(rm.slides[2].note.text, "Say C");
  assert.ok(S.setNote(rm, 0, "a < b").includes('<h2>A</h2><aside class="notes">a &lt; b</aside></section>'));
});

test("layouts and blank slides come from the deck's own markup", () => {
  const m = S.model(DECK);
  const lays = S.layouts(m);
  assert.equal(lays.length, 3);
  assert.equal(lays[1].name, "Four scenes");
  assert.ok(lays[0].text.includes("<h1>Title</h1>"));
  assert.ok(lays[0].text.includes('src="data:image/svg+xml,') && lays[0].text.includes('alt=""'));
  assert.ok(lays[0].text.includes('data-note=""'));
  assert.ok(lays[0].text.startsWith("<!-- ===== 1. New slide ===== -->"));
  assert.ok(lays[1].text.includes('<div class="no">01</div>'), "a slide number stays");
  assert.ok(lays[1].text.includes('<h2 class="h">Title</h2>'));

  const blank = S.blank(m, 1);
  assert.ok(blank.startsWith("<!-- ===== 2. New slide ===== -->\n"));
  assert.ok(blank.includes('<div class="slot" data-c="blue"><section class="slide" data-note="">'));
  assert.ok(blank.includes('  <h2 class="h">Title</h2>\n  <p>Text</p>\n</section></div>'));
  assert.deepEqual(labels(S.insert(m, 2, [blank]).src), ["1. 표지", "2. Four scenes", "3. New slide", "4. Ending"]);
});

test("a thumbnail copy holds one slide and hides the deck's chrome", () => {
  const m = S.model(DECK);
  const one = S.isolate(m, 1);
  assert.ok(!one.includes("Why I") && !one.includes("Anyone can"));
  assert.ok(one.includes('<div class="slot" data-c="blue" data-dr-unit>'));
  assert.ok(one.includes('<div id="stage" data-dr-keep><div id="deck" data-dr-keep>'));
  assert.ok(one.includes('<section class="slide" data-note="">'), "notes are left out, so typing them never redraws it");
  assert.match(one, /<style data-dr-thumb>[^<]*<\/style><\/head>/);
  const lay = S.isolate(m, 1, S.layouts(m)[0].text);
  assert.ok(lay.includes("<h1>Title</h1>") && !lay.includes("Four scenes"));
});

test("the parser survives scripts, implied end tags, and SVG", () => {
  const tricky = `<body><div id="d">
<section class="slide"><ul><li>one<li>two</ul><p>a<p>b<svg><path d="M0 0"/><text>t</text></svg></section>
<section class="slide"><script>if (a < b) document.write("<section class='slide'>")</script><p>ok</p></section>
</div></body>`;
  const m = S.model(tricky);
  assert.equal(m.slides.length, 2);
  const ul = m.slides[0].core.children.find((c) => c.kind === "el" && c.name === "ul");
  assert.equal(ul.children.filter((c) => c.kind === "el").length, 2, "li closes li");

  const single = `<div id="deck"><div class="slot"><section class="slide"><h1>Only</h1></section></div></div>`;
  const sm = S.model(single);
  assert.equal(S.blockText(sm, 0), '<div class="slot"><section class="slide"><h1>Only</h1></section></div>');
  assert.equal(S.model(S.duplicate(sm, [0]).src).slides.length, 2);
});

test("curated numbering is left alone, and unnumbered slides are skipped", () => {
  const curated = `<body>
<!-- 1. a -->
<section class="slide">a</section>
<!-- 2. b -->
<section class="slide">b</section>
<!-- 2a. c -->
<section class="slide">c</section>
</body>`;
  assert.equal(S.numberBase(S.model(curated)), null);
  assert.deepEqual(labels(S.move(S.model(curated), [2], 0).src), ["2a. c", "1. a", "2. b"]);

  const partial = `<body>
<!-- 1. a -->
<section class="slide">a</section>

<section class="slide">b</section>
<!-- 2. c -->
<section class="slide">c</section>
</body>`;
  assert.deepEqual(labels(S.move(S.model(partial), [2], 0).src), ["1. c", "2. a", null]);
});

test("the editor ships the slide panel, and every inline script parses", async () => {
  const { generateEditorHtml } = await import("../dist/editor.js");
  const { SLIDE_PANEL_RUNTIME } = await import("../dist/slide-panel.js");
  const html = generateEditorHtml("nord", {}, "classic", "slide", { name: "talk.html", kind: "html", writable: true, watched: true });
  for (const id of ["doc-view", "rail", "doc-notes-input", "dr-menu", "dr-newmenu", "dh-sorter", "dh-from",
    "dh-code", "dz-insert", "dz-view", "dz-props", "dz-overlay", "dz-menu", "dz-pop"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(/<div id="doc-main">\s*<div id="dz-stage">\s*<div id="dz-canvas"[^>]*>\s*<div id="dz-sizer">\s*<iframe id="frame-html"/.test(html),
    "the preview sits on the design canvas, beside the rail");
  assert.ok(/<\/div>\s*<aside id="dz-props"/.test(html), "the properties panel follows the canvas");
  assert.ok(html.includes("var DRSlides = (function htmlSlides()"));
  assert.ok(html.includes("window.deckrunSlidePanel = function slidePanel("));
  assert.ok(html.includes("var DRDesign = (function designKit("));
  assert.ok(html.includes("window.deckrunDesigner = function designer("));
  const { DESIGN_RUNTIME } = await import("../dist/design.js");
  for (const rt of [SLIDE_PANEL_RUNTIME, DESIGN_RUNTIME]) {
    const lower = rt.toLowerCase();
    assert.ok(!lower.includes("<!" + "--") && !lower.includes("<scr" + "ipt") && !lower.includes("</scr" + "ipt"));
  }
  const scripts = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2);
  for (const [, code] of scripts) assert.doesNotThrow(() => new vm.Script(code));
});

test("present from here opens the doc at a slide and steps a deck that ignores its hash", async () => {
  const { generateDocHtml } = await import("../dist/generate.js");
  const plain = generateDocHtml("/?deck=1", "Talk");
  assert.ok(plain.includes('src="/?deck=1"') && !plain.includes("DRSlides.goto"));
  const from = generateDocHtml("/?deck=1", "Talk", false, "nord", 2);
  assert.ok(from.includes('src="/?deck=1#3"'), "asked for by hash first");
  assert.ok(from.includes("DRSlides.goto(frame.contentWindow, 2)"));
  assert.ok(from.includes("DRTransitions.attach(frame.contentWindow)"), "slide transitions play in the presenter");
  const scripts = [...from.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, code] of scripts) assert.doesNotThrow(() => new vm.Script(code));
});

test("the runtime is safe to paste into a script element", () => {
  const lower = HTML_SLIDES_RUNTIME.toLowerCase();
  assert.ok(!lower.includes("<!" + "--") && !lower.includes("<scr" + "ipt") && !lower.includes("</scr" + "ipt"));
  const ctx = { src: DECK };
  vm.runInNewContext(HTML_SLIDES_RUNTIME + ";this.count = DRSlides.model(src).slides.length;", ctx);
  assert.equal(ctx.count, 3);
});
