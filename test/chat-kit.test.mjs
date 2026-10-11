import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { chatKit, CHAT_KIT_RUNTIME } from "../dist/chat-kit.js";
import { htmlSlides } from "../dist/html-slides.js";
import { chatArgs, chatInput, chatModelOk } from "../dist/chat.js";

const K = chatKit();
const S = htmlSlides();

const DECK = `<!doctype html>
<html><head><style>.slide{color:red}</style></head>
<body>
<!-- 1. Intro -->
<section class="slide"><h1>Hello</h1><p class="lead">First words</p></section>
<!-- 2. Why -->
<section class="slide"><h2 class="title">Why English?</h2>
<p>Because the world speaks it.</p>
<img src="data:image/png;base64,${"A".repeat(3000)}">
</section>
<template data-deckrun-hidden><section class="slide"><h2>Spare</h2></section></template>
</body></html>`;

function spans(text) {
  return S.model(text).slides.map((s) => ({
    start: s.start, end: s.end, hidden: s.hidden,
    title: (s.comment && s.comment.label) || s.title || "",
    inner: [s.core.openEnd, s.core.closeStart],
  }));
}

test("The runtime string defines DRChat and never ends its script early", () => {
  assert.ok(!/<\/script|<!--/i.test(CHAT_KIT_RUNTIME));
  const ctx = {};
  vm.runInNewContext(CHAT_KIT_RUNTIME + ";this.out = DRChat.command('/u');", ctx);
  assert.equal(ctx.out.name, "undo");
});

test("The target is the slide in the preview, with its lines and its source", () => {
  const slides = spans(DECK);
  const t = K.target({ file: "deck.html", text: DECK, scope: "slide", slides, current: 1 });
  assert.equal(t.tag, "slide 2");
  assert.match(t.context, /^Target: slide 2 of 3 \('Why'\), lines 6-10 of deck\.html\./);
  assert.match(t.context, /Slide 2 source \(lines 6-10\):\n<!-- 2\. Why -->/);
  // An embedded image is shortened rather than sent whole.
  assert.ok(!t.context.includes("A".repeat(300)));
  assert.match(t.context, /data:image\/png;base64,…\(3 KB, shortened here\)/);
  assert.ok(t.context.length < 1200);

  const hidden = K.target({ file: "deck.html", text: DECK, scope: "slide", slides, current: 2 });
  assert.match(hidden.context, /hidden slide, wrapped in <template data-deckrun-hidden>/);
});

test("Something narrower than the slide is named, with its own lines", () => {
  const slides = spans(DECK);
  const h2 = DECK.indexOf('<h2 class="title">');
  const h2End = DECK.indexOf("</h2>", h2) + 5;
  const el = K.target({
    file: "deck.html", text: DECK, scope: "slide", slides, current: 1,
    focus: { how: "element", start: h2, end: h2End, label: "h2.title" },
  });
  assert.equal(el.tag, "slide 2 · h2.title");
  assert.match(el.context, /Narrower: the <h2\.title> element at line 7,/);

  const text = K.target({
    file: "deck.html", text: DECK, scope: "slide", slides, current: 0,
    focus: { how: "text", text: "First   words", start: DECK.indexOf("<p class"), end: DECK.indexOf("</p>") + 4, label: "p.lead" },
  });
  assert.match(text.context, /they selected the text 'First words' on the slide, inside <p\.lead> at line 5\./);
  assert.equal(text.tag, "slide 1 · 'First words'");

  // Code selected outside any slide still goes, with its own source.
  const style = DECK.indexOf(".slide{");
  const code = K.target({
    file: "deck.html", text: DECK, scope: "slide", slides, current: 0,
    focus: { how: "code", start: style, end: style + 20 },
  });
  assert.equal(code.tag, "slide 1 · line 2");
  assert.match(code.context, /Narrower target source \(line 2\):\n\.slide\{color:red\}/);
});

test("A slide too long to send goes as its line range, with the narrower part's source", () => {
  const big = DECK.replace("Because the world speaks it.", "word ".repeat(1500));
  const slides = spans(big);
  const h2 = big.indexOf('<h2 class="title">');
  const t = K.target({
    file: "deck.html", text: big, scope: "slide", slides, current: 1,
    focus: { how: "element", start: h2, end: big.indexOf("</h2>", h2) + 5, label: "h2.title" },
  });
  assert.ok(!t.context.includes("Slide 2 source"));
  assert.match(t.context, /Narrower target source \(line 7\):\n<h2 class="title">Why English\?<\/h2>/);
});

test("/deck and an undo since the last reply reach Claude as such", () => {
  const slides = spans(DECK);
  const t = K.target({ file: "deck.html", text: DECK, scope: "deck", slides, current: 1, reverted: "Make it red" });
  assert.equal(t.tag, "whole deck");
  assert.match(t.context, /undid the changes from their message 'Make it red'/);
  assert.match(t.context, /Target: the whole deck, all 3 slides \(they asked with \/deck\)\. The preview is on slide 2\./);
  assert.ok(!t.context.includes("source"));
});

test("A document that is not a deck falls back to what the preview shows", () => {
  const t = K.target({ file: "page.html", text: "<p>hi</p>", scope: "slide", slides: [], current: -1, shown: "hi   there" });
  assert.equal(t.tag, "");
  assert.match(t.context, /the part of page\.html that reads: 'hi there'/);
});

test("Slash commands complete and parse like Claude Code's", () => {
  const labels = (items) => items.map((c) => c.label);
  assert.deepEqual(labels(K.complete("/")), ["/slide", "/look", "/deck", "/undo", "/model", "/context", "/clear", "/stop", "/help"]);
  assert.deepEqual(labels(K.complete("/c")), ["/context", "/clear"]);
  assert.deepEqual(K.complete("make /c"), []);
  // A command that takes words waits for them; one that does not runs.
  const [slide] = K.complete("/sl");
  assert.equal(slide.value, "/slide ");
  assert.equal(slide.run, false);
  assert.equal(slide.fill, "/slide ");
  assert.deepEqual(K.complete("/he").map((c) => [c.value, c.run, c.fill]), [["/help", true, "/help"]]);
  // Words that are optional: Enter runs it bare, Tab leaves room for them.
  assert.deepEqual(K.complete("/lo").map((c) => [c.value, c.run, c.fill]), [["/look", true, "/look "]]);

  assert.deepEqual(K.command("/slide 3 make the title shorter"), { name: "slide", arg: "3 make the title shorter", matches: ["slide"] });
  assert.deepEqual(K.command("/U"), { name: "undo", arg: "", matches: ["undo"] });
  assert.deepEqual(K.command("/c").matches, ["context", "clear"]);
  assert.deepEqual(K.command("/nope").matches, []);
  assert.equal(K.command("/deck\nfix typos").arg, "fix typos");
  // Not a command: a path, or a slash later on.
  assert.equal(K.command("/images/a.png is missing"), null);
  assert.equal(K.command("make it 1/2 size"), null);
});

test("After a command, the menu lists its choices, or a reminder of what it takes", () => {
  const models = K.complete("/model ", { model: "" });
  assert.deepEqual(models.map((m) => m.label), ["default", "fable", "opus", "sonnet", "haiku"]);
  assert.equal(models[0].hint, "current");
  assert.deepEqual(K.complete("/model so", { model: "sonnet" }).map((m) => [m.value, m.hint, m.run]), [["/model sonnet", "current", true]]);

  const slides = [{ title: "Cover" }, { title: "Quiz", hidden: true }].concat(Array.from({ length: 10 }, (_, i) => ({ title: "S" + (i + 3) })));
  const all = K.complete("/slide ", { slides });
  assert.equal(all.length, 12);
  assert.deepEqual([all[1].label, all[1].help, all[1].hint, all[1].value, all[1].run], ["2", "Quiz", "hidden", "/slide 2", true]);
  assert.deepEqual(K.complete("/slide 1", { slides }).map((s) => s.label), ["1", "10", "11", "12"]);
  // Past the first word, or for a command without choices: nothing to list.
  assert.deepEqual(K.complete("/slide 3 make it", { slides }), []);
  assert.deepEqual(K.complete("/deck ", { slides }), []);

  assert.equal(K.hint("/deck fix the typos").name, "deck");
  assert.equal(K.hint("/look ").name, "look");
  assert.equal(K.hint("/clear "), null);
  assert.equal(K.hint("/deck"), null);
});

test("Commands typed with the Korean input method still on are understood", () => {
  // m-o-d-e-l on the 2-beolsik layout, as the input method composes it.
  assert.equal(K.latin("ㅡㅐㅇ디"), "model");
  assert.equal(K.latin("니ㅑㅇㄷ"), "slide");
  assert.equal(K.latin("ㅣㅐㅐㅏ"), "look");
  assert.equal(K.latin("치ㄷㅁㄱ"), "clear");
  assert.equal(K.latin("ㅗ디ㅔ"), "help");
  assert.equal(K.latin("내ㅜㅜㄷㅅ"), "sonnet");
  assert.equal(K.latin("abc 3"), "abc 3");
  assert.deepEqual(K.complete("/ㅡㅐㅇ디").map((c) => c.label), ["/model"]);
  assert.deepEqual(K.complete("/ㅡㅐㅇ디 ㅗ먀ㅏㅕ").map((c) => c.label), ["haiku"]);
  assert.deepEqual(K.command("/니ㅑㅇㄷ 3 제목 줄여줘"), { name: "slide", arg: "3 제목 줄여줘", matches: ["slide"] });
  // A message that happens to start with "/" and Korean is just a message.
  assert.equal(K.command("/안녕하세요"), null);
});

test("/look tells Claude a picture of the slide comes with the message", () => {
  const slides = spans(DECK);
  const t = K.target({ file: "deck.html", text: DECK, scope: "slide", slides, current: 1, look: true });
  assert.equal(t.tag, "slide 2 · picture");
  assert.match(t.context, /Attached: a picture of slide 2 as it renders at 1280x720\./);
});

test("Claude's choices become buttons and never show as raw tags", () => {
  const raw = "Which one?\n<choices>\n- The title\n2. The subtitle\nBoth\n</choices>";
  assert.deepEqual(K.choices(raw), { text: "Which one?", choices: ["The title", "The subtitle", "Both"] });
  assert.deepEqual(K.choices("All done."), { text: "All done.", choices: [] });
  // While streaming, the block and a tag half-way in are held back.
  assert.equal(K.visible("Which one?\n<cho"), "Which one?");
  assert.equal(K.visible("Which one?\n<choices>\n- The ti"), "Which one?");
  assert.equal(K.visible("a < b"), "a < b");
  // A block cut off by a stop still yields its choices.
  assert.deepEqual(K.choices("Pick:\n<choices>\nA\nB").choices, ["A", "B"]);
});

test("A turn's changes are named by slide, without blaming the ones that only moved", () => {
  const before = DECK;
  const edited = before.replace("Why English?", "Why learn English?");
  assert.deepEqual(K.changes(before, spans(before), edited, spans(edited)), { changed: [1], added: [], removed: 0, outside: false });

  const newFirst = before.replace("<!-- 1. Intro -->", '<section class="slide"><h1>New</h1></section>\n<!-- 1. Intro -->');
  assert.deepEqual(K.changes(before, spans(before), newFirst, spans(newFirst)), { changed: [], added: [0], removed: 0, outside: false });

  const gone = before.replace(/<!-- 2\. Why -->[\s\S]*?<\/section>\n/, "");
  assert.deepEqual(K.changes(before, spans(before), gone, spans(gone)), { changed: [], added: [], removed: 1, outside: false });

  const styled = before.replace("color:red", "color:blue").replace("First words", "Opening words");
  assert.deepEqual(K.changes(before, spans(before), styled, spans(styled)), { changed: [0], added: [], removed: 0, outside: true });
});

test("The chat's system prompt stays one line with no double quotes, for the cmd.exe launcher", () => {
  const args = chatArgs("deck.html", "html", null);
  const prompt = args[args.indexOf("--append-system-prompt") + 1];
  assert.ok(!prompt.includes('"'));
  assert.ok(!prompt.includes("\n"));
  assert.ok(!prompt.includes("%"));
  assert.match(prompt, /<choices> and <\/choices>/);
});

test("A picture goes to the CLI as one stream-json user message; text alone stays plain", () => {
  assert.ok(!chatArgs("deck.html", "html", null).includes("--input-format"));
  const args = chatArgs("deck.html", "html", "s1", "haiku", true);
  assert.equal(args[args.indexOf("--input-format") + 1], "stream-json");
  assert.equal(args[args.indexOf("--model") + 1], "haiku");

  assert.equal(chatInput("hello"), "hello");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const line = chatInput("what is wrong here?", png);
  assert.ok(line.endsWith("\n") && !line.slice(0, -1).includes("\n"));
  const msg = JSON.parse(line);
  assert.equal(msg.type, "user");
  assert.deepEqual(msg.message.content, [
    { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } },
    { type: "text", text: "what is wrong here?" },
  ]);
});

test("Only model names reach the CLI", () => {
  for (const ok of ["sonnet", "opus", "claude-opus-4-1", "claude-sonnet-4-5-20250929", "sonnet[1m]"]) assert.ok(chatModelOk(ok), ok);
  for (const bad of ["", "-p", "a b", "x\"y", "sonnet;rm", "a".repeat(65)]) assert.ok(!chatModelOk(bad), bad);
});
