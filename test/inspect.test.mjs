import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseSlides } from "../dist/parser.js";
import { renderSlide } from "../dist/generate.js";
import { htmlSlides } from "../dist/html-slides.js";
import { INSPECT_RUNTIME } from "../dist/inspect.js";
import { generateEditorHtml } from "../dist/editor.js";

const S = htmlSlides();
const TAG = / data-dr-n="[^"]*"/g;

const MD = `# Title slide

Intro with **bold**, a [link](https://x.y "t"), and ![pic](a.png).

<!-- notes: say hi -->

---

## Lists

- one
- two
  - two a
  - two b with ![img](b.png)
    1. deep
- three

| a | b |
|---|---|
| 1 | 2 |

---

> A quote
> - q1

<div class="columns">
  <div class="col" id="left"><p>Raw <span class="hl">html</span></p></div>
</div>

---

## Tabs

	tab-indented code

- item
	- tab nested

$$
E = mc^2
$$

![side](r.png "right")
`;

/** The source text a map entry points at. */
function textOf(slide, j) {
  const n = slide.map[j];
  return MD.slice(n[0], n[1]);
}

function entry(slide, label, text) {
  return slide.map.findIndex((n, j) => n[4] === label && textOf(slide, j).startsWith(text));
}

test("a mapped Markdown parse renders the same HTML, plus source tags", () => {
  const decks = [MD].concat(["examples/example-1.md", "examples/example-2.md"].map((f) => fs.readFileSync(f, "utf8")));
  for (const md of decks) {
    const plain = parseSlides(md);
    const mapped = parseSlides(md, { map: true });
    assert.equal(mapped.length, plain.length);
    mapped.forEach((s, k) => {
      assert.equal(s.html.replace(TAG, ""), plain[k].html, `slide ${k + 1}`);
      assert.ok(s.map.length > 1, `slide ${k + 1} has entries beyond itself`);
      for (const m of s.html.matchAll(/data-dr-n="(\d+)\.(\d+)"/g)) {
        assert.equal(+m[1], k);
        assert.ok(s.map[+m[2]], `tag ${m[0]} has an entry`);
      }
    });
    assert.equal(plain.some((s) => s.map || s.tags), false, "an unmapped parse carries no map");
  }
});

test("map entries point at the Markdown each element came from", () => {
  const [one, two, three, four] = parseSlides(MD, { map: true });
  assert.equal(textOf(one, 0).split("\n")[0], "# Title slide");
  assert.equal(one.map[0][3], -1);
  assert.ok(entry(one, "h1", "# Title slide") > 0);
  assert.ok(entry(one, "a", "[link](https://x.y") > 0);
  assert.ok(entry(one, "img", "![pic](a.png)") > 0);

  // Nested list items are found by their lines, inside their parents.
  const deep = entry(two, "li", "1. deep");
  const twoB = entry(two, "li", "- two b with");
  assert.ok(deep > 0 && twoB > 0);
  assert.equal(two.map[two.map[deep][3]][4], "ol");
  assert.equal(two.map[two.map[two.map[deep][3]][3]], two.map[twoB]);
  assert.equal(textOf(two, twoB), "- two b with ![img](b.png)\n    1. deep");
  assert.ok(two.html.includes(`<li data-dr-n="1.${deep}">`));
  // A table row per source line.
  const rows = two.map.filter((n) => n[4] === "tr").map((n) => MD.slice(n[0], n[1]));
  assert.deepEqual(rows, ["| a | b |", "| 1 | 2 |"]);

  // Raw HTML: every element, labelled the DevTools way, nested as written.
  const left = entry(three, "div#left.col", "<div class=\"col\"");
  assert.ok(left > 0);
  assert.equal(three.map[three.map[left][3]][4], "div.columns");
  assert.ok(entry(three, "span.hl", "<span class=\"hl\">html</span>") > 0);
  assert.ok(entry(three, "li", "- q1") > 0);

  // Leading tabs are widened before marked sees them; the map still points at the tab.
  const code = entry(four, "pre", "\ttab-indented code");
  assert.ok(code > 0, JSON.stringify(four.map));
  assert.ok(entry(four, "li", "- tab nested") > 0);
  assert.ok(entry(four, "div.math-source", "$$") > 0);
  // A positioned image is drawn by renderSlide, which tags it too.
  assert.equal(four.tags.image, "3." + entry(four, "img", "![side](r.png \"right\")"));
  const html = renderSlide(four, 3);
  assert.ok(html.includes(`data-dr-n="${four.tags.slide}"`));
  assert.ok(html.includes(`alt="side" data-dr-n="${four.tags.image}"`));
  assert.equal(renderSlide(parseSlides(MD)[3], 3).includes("data-dr-n"), false);
});

test("the HTML preview tags every element outside the head, in node order", () => {
  const src = `<!DOCTYPE html><html><head><title>t</title><style>p{}</style></head>
<body><div class="slot"><section class="slide"><h1>Hi<br>there</h1><img src="a.png"/></section></div>
<template data-deckrun-hidden><div class="slot"><section class="slide"><p>hidden</p></section></div></template>
<script>var s = "<p>";</script></body></html>`;
  const m = S.model(src);
  const d = S.decoratePreview(m);
  assert.deepEqual(d.nodes.map((n) => n.name), ["html", "body", "div", "section", "h1", "br", "img", "div", "section", "p"]);
  const tagged = [];
  (function walk(el) {
    for (const c of el.children) {
      if (c.kind !== "el") continue;
      const a = c.attrs.find((x) => x.name === "data-dr-n");
      if (a) tagged.push([+a.value, c.name]);
      walk(c);
    }
  })(S.parse(d.html));
  assert.deepEqual(tagged, d.nodes.map((n, i) => [i, n.name]));
  assert.ok(d.html.includes('<img src="a.png" data-dr-n="6"/>'));
  assert.deepEqual(S.previewNodes(m), d.nodes);
  assert.equal(src.includes("data-dr-n"), false);
});

test("the inspector runtime is safe to paste into a script element, and ships in the editor", () => {
  assert.equal(/<\/?script|<!--/i.test(INSPECT_RUNTIME), false);
  new vm.Script(INSPECT_RUNTIME);
  const html = generateEditorHtml();
  for (const id of ['id="btn-inspect"', 'id="crumbs"', 'id="insp-layer"', "window.deckrunInspect = function inspector"]) {
    assert.ok(html.includes(id), id);
  }
});
