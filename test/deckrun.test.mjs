import test from "node:test";
import assert from "node:assert/strict";
import { parseSlides } from "../dist/parser.js";
import {
  findTemplate,
  resolveTemplateName,
  templateSummaries,
  templateListing,
  findTransition,
  resolveTransitionName,
  transitionSummaries,
  transitionListing,
  TEMPLATE_CSS,
  TRANSITION_CSS,
} from "../dist/presentation-options.js";
import { richContentFeatures, richContentHead } from "../dist/rich-content.js";
import { lintMarkdown } from "../dist/lint.js";
import { generateHtml, generateDocHtml } from "../dist/generate.js";
import { generatePreviewHtml } from "../dist/preview.js";
import { generateEditorHtml } from "../dist/editor.js";
import { findFont, resolveThemeName } from "../dist/themes.js";
import { HIGHLIGHT_RUNTIME, HIGHLIGHT_WARNING } from "../dist/highlights.js";
import { chatArgs, chatBlockedReason, chatEvents, chatPermissions } from "../dist/chat.js";
import vm from "node:vm";

test("Parser handles slides, notes, images, math, and reveals", () => {
  const md = `# Slide 1
Welcome to deckrun

<!-- notes: Introduction slide notes -->
---
# Slide 2
Here is a list:
- Point A
- Point B {reveal}

{reveal}
> Important quote

$$
E = mc^2
$$

Inline math $a^2 + b^2 = c^2$ here.
`;

  const slides = parseSlides(md);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].notes, "Introduction slide notes");
  assert.match(slides[1].html, /deckrun-fragment-marker/);
  assert.match(slides[1].html, /class="math-source"/);
  assert.match(slides[1].html, /data-display="true"/);
  assert.match(slides[1].html, /data-display="false"/);
});

test("Presentation options resolve correctly", () => {
  assert.equal(findTemplate("minimal"), "minimal");
  assert.equal(findTemplate("Classic"), "classic");
  assert.equal(findTemplate("non-existent"), null);
  assert.equal(resolveTemplateName("spotlight"), "spotlight");
  assert.equal(resolveTemplateName("invalid"), "classic");

  assert.equal(findTransition("fade"), "fade");
  assert.equal(findTransition("Zoom"), "zoom");
  assert.equal(findTransition("non-existent"), null);
  assert.equal(resolveTransitionName("lift"), "lift");
  assert.equal(resolveTransitionName("invalid"), "slide");

  assert.equal(templateSummaries().length, 4);
  assert.equal(transitionSummaries().length, 5);
  assert.equal(templateListing().length, 4);
  assert.equal(transitionListing().length, 5);

  assert.ok(TEMPLATE_CSS.includes("spotlight"));
  assert.ok(TRANSITION_CSS.includes("lift"));
});

test("Rich content detection and head tags work", () => {
  const slidesWithoutRich = parseSlides("# Simple\nHello");
  const feat1 = richContentFeatures(slidesWithoutRich);
  assert.equal(feat1.math, false);
  assert.equal(feat1.mermaid, false);
  assert.equal(richContentHead(feat1, "local"), "");

  const slidesWithRich = parseSlides("# Math\n$$\nx = y\n$$\n```mermaid\ngraph TD; A-->B;\n```");
  const feat2 = richContentFeatures(slidesWithRich);
  assert.equal(feat2.math, true);
  assert.equal(feat2.mermaid, true);

  const localHead = richContentHead(feat2, "local");
  assert.ok(localHead.includes("/__vendor/katex.min.css"));
  assert.ok(localHead.includes("/__vendor/mermaid.min.js"));

  const cdnHead = richContentHead(feat2, "cdn");
  assert.ok(cdnHead.includes("cdn.jsdelivr.net/npm/katex"));
  assert.ok(cdnHead.includes("cdn.jsdelivr.net/npm/mermaid"));
});

test("Linting catches errors and warnings properly", () => {
  // Empty deck
  const emptyRes = lintMarkdown("   ");
  assert.equal(emptyRes.errors, 1);
  assert.equal(emptyRes.issues[0].rule, "empty-deck");

  // Valid deck
  const validMd = `# Clean Slide
- Item 1
- Item 2
`;
  const validRes = lintMarkdown(validMd);
  assert.equal(validRes.errors, 0);
  assert.equal(validRes.warnings, 0);

  // Deck with untagged fence and unclosed fence
  const unclosedMd = `# Slide
\`\`\`
unclosed code
`;
  const unclosedRes = lintMarkdown(unclosedMd);
  assert.ok(unclosedRes.issues.some((i) => i.rule === "untagged-code-fence"));
  assert.ok(unclosedRes.issues.some((i) => i.rule === "unclosed-code-fence"));
  assert.equal(unclosedRes.errors, 1);

  // Deck with empty alt image and invalid opacity
  const badImgMd = `# Slide
![](pic.png "opacity=2.5")
`;
  const badImgRes = lintMarkdown(badImgMd);
  assert.ok(badImgRes.issues.some((i) => i.rule === "missing-image-alt"));
  assert.ok(badImgRes.issues.some((i) => i.rule === "invalid-image-opacity"));

  // Deck with unclosed math, long heading, dense slide, excessive reveals
  const complexBadMd = `# Slide with an extraordinarily long heading that exceeds eighty characters in length by a substantial margin
$$
x + y = z
---
# Dense slide
- A
- B
- C
- D
- E
- F
- G
- H
- I
{reveal} 1 {reveal} 2 {reveal} 3 {reveal} 4 {reveal} 5 {reveal} 6 {reveal} 7 {reveal} 8 {reveal} 9 {reveal} 10 {reveal} 11
`;
  const complexRes = lintMarkdown(complexBadMd);
  assert.ok(complexRes.issues.some((i) => i.rule === "unclosed-math"));
  assert.ok(complexRes.issues.some((i) => i.rule === "long-heading"));
  assert.ok(complexRes.issues.some((i) => i.rule === "dense-slide"));
  assert.ok(complexRes.issues.some((i) => i.rule === "reveal-excessive"));
});

test("Generate HTML produces valid complete document with templates and transitions", () => {
  const slides = parseSlides("# Slide 1\nHello\n<!-- notes: Test note -->");
  const html = generateHtml(
    slides,
    "My Test Deck",
    false,
    "nord",
    { head: null, body: null },
    { template: "editorial", transition: "fade" }
  );

  assert.ok(html.includes('data-theme="nord"'));
  assert.ok(html.includes('data-template="editorial"'));
  assert.ok(html.includes('data-transition="fade"'));
  assert.ok(html.includes("Test note"));
});

test("Generate Doc HTML produces valid standalone document wrapper", () => {
  const docHtml = generateDocHtml("/__remote-doc", "My Remote Doc", false, "tokyo");
  assert.ok(docHtml.includes('data-theme="tokyo"'));
  assert.ok(docHtml.includes('src="/__remote-doc"'));
  assert.ok(docHtml.includes("My Remote Doc"));
});

test("Editor bootstraps with the opened file, and without one when absent", () => {
  const plain = generateEditorHtml("nord", {}, "classic", "slide");
  assert.ok(plain.includes('"file":null'));

  const backed = generateEditorHtml("nord", {}, "classic", "slide", {
    name: "slides.md",
    kind: "markdown",
    writable: true,
    watched: true,
  });
  assert.ok(backed.includes('"name":"slides.md"'));
  assert.ok(backed.includes('"writable":true'));
  assert.ok(backed.includes('"watched":true'));
  // The runtime that loads, saves, and live-reloads the file rides along.
  assert.ok(backed.includes("/__file"));
  assert.ok(backed.includes("EventSource('/__events')"));
});

test("Generate preview HTML produces valid preview structure", () => {
  const html = generatePreviewHtml("gruvbox", {}, "minimal", "zoom");
  assert.ok(html.includes('data-theme="gruvbox"'));
  assert.ok(html.includes('data-template="minimal"'));
  assert.ok(html.includes('data-transition="zoom"'));
  assert.ok(html.includes('id="presentation"'));
});

test("Generate editor HTML produces valid editor interface", () => {
  const html = generateEditorHtml("dracula", { head: "inter", body: "lora" }, "spotlight", "lift");
  assert.ok(html.includes('data-theme="dracula"'));
  assert.ok(html.includes('data-template="spotlight"'));
  assert.ok(html.includes('data-transition="lift"'));
  assert.ok(html.includes("deckrun · editor"));
});

test("Theme and font resolvers function properly", () => {
  assert.equal(resolveThemeName("nord"), "nord");
  assert.equal(resolveThemeName("Nord"), "nord");
  assert.equal(resolveThemeName("invalid-theme"), "nord");

  assert.equal(findFont("inter"), "inter");
  assert.equal(findFont("Inter"), "inter");
  assert.equal(findFont("non-existent-font"), null);
});

test("Theme-dependent text selection highlight is configured", async () => {
  const { themeRootCss, themeSwitchableCss } = await import("../dist/themes.js");
  const nordCss = themeRootCss("nord");
  assert.ok(nordCss.includes("--selection-bg:"));
  assert.ok(nordCss.includes("--selection-text:"));

  const switchableCss = themeSwitchableCss();
  assert.ok(switchableCss.includes("--selection-bg:"));

  const slides = parseSlides("# Test\nSelection styling");
  const html = generateHtml(slides, "Test Deck", false, "nord", "m");
  assert.ok(html.includes("::selection"));
  assert.ok(html.includes("var(--selection-bg"));
});


test("Session highlights ship on every surface that renders a document", () => {
  const slides = parseSlides("# Slide 1\nHighlight me");

  // The deck reads hl=... so the tab present opens knows whose marks these are.
  const deck = generateHtml(slides, "Deck");
  assert.ok(deck.includes("window.deckrunHighlights"));
  assert.ok(deck.includes("scopes: 'slides'"));
  assert.ok(deck.includes("get('hl')"));

  // An HTML doc is one scope, highlighted through the presenter wrapper.
  const doc = generateDocHtml("/?deck=1", "Doc");
  assert.ok(doc.includes("window.deckrunHighlights"));
  assert.ok(doc.includes("scopes: 'doc'"));

  // The editor drives both of its previews and hands the key to present.
  const editor = generateEditorHtml();
  assert.ok(editor.includes("frame: frame"));
  assert.ok(editor.includes("frame: frameHtml"));
  assert.ok(editor.includes("'&hl=' + encodeURIComponent(highlightKey())"));

  // Exports and PDFs are built from the same markdown with no hl= on them,
  // so a printed deck never carries somebody's session marks.
  assert.ok(!deck.includes("&hl="));
});

test("Highlight runtime is valid, self-installing JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(HIGHLIGHT_RUNTIME));
  assert.ok(HIGHLIGHT_RUNTIME.includes("window.deckrunHighlights = {"));
  // Session storage only: nothing reaches localStorage or the server.
  assert.ok(HIGHLIGHT_RUNTIME.includes("sessionStorage"));
  assert.ok(!HIGHLIGHT_RUNTIME.includes("localStorage"));
  assert.ok(!HIGHLIGHT_RUNTIME.includes("fetch("));
  // Tabs of one session stay in step, which is how a highlight made in the
  // editor is already on the slide in the deck tab.
  assert.ok(HIGHLIGHT_RUNTIME.includes("BroadcastChannel"));
});

test("First use warns that highlights are session-only", () => {
  assert.match(HIGHLIGHT_WARNING, /session/i);
  assert.match(HIGHLIGHT_WARNING, /Nothing is written to disk/);
  const deck = generateHtml(parseSlides("# One"), "Deck");
  assert.ok(deck.includes(HIGHLIGHT_WARNING));
  assert.ok(generateEditorHtml().includes(HIGHLIGHT_WARNING));
});

test("Highlight colors are fixed, not borrowed from the theme", async () => {
  const { themeRootCss, THEME_IDS } = await import("../dist/themes.js");

  // A tint of the accent reads as part of the design; a highlight has to be
  // findable at a glance on every palette, so it carries its own colors.
  for (const id of THEME_IDS) {
    assert.ok(!themeRootCss(id).includes("--mark"), id + " defines no highlight color");
  }
  assert.ok(!HIGHLIGHT_RUNTIME.includes("var(--mark"),
    "the mark styles do not reach for a theme variable");

  // Pen yellow, its own dark ink, and a second pen for commented highlights.
  assert.ok(HIGHLIGHT_RUNTIME.includes("background: #ffe75e"));
  assert.ok(HIGHLIGHT_RUNTIME.includes("mark.dr-hl * { color: #15161a !important; }"));
  assert.ok(HIGHLIGHT_RUNTIME.includes("background: #7ae6ff"));

  // The popups are chrome, so those still match whatever theme is on.
  assert.ok(HIGHLIGHT_RUNTIME.includes("var(--mantle,"));
});

test("The four official Catppuccin flavors are registered with exact palette values", async () => {
  const { THEME_IDS, THEMES, themeSummaries, themeRootCss, resolveThemeName: resolveTheme } =
    await import("../dist/themes.js");

  const flavors = {
    "catppuccin-latte": { mood: "light", base: "#eff1f5", text: "#4c4f69", mauve: "#8839ef" },
    "catppuccin-frappe": { mood: "dark", base: "#303446", text: "#c6d0f5", mauve: "#ca9ee6" },
    "catppuccin-macchiato": { mood: "dark", base: "#24273a", text: "#cad3f5", mauve: "#c6a0f6" },
    "catppuccin-mocha": { mood: "dark", base: "#1e1e2e", text: "#cdd6f4", mauve: "#cba6f7" },
  };

  for (const [id, expected] of Object.entries(flavors)) {
    assert.ok(THEME_IDS.includes(id), id + " is registered in THEME_IDS");
    assert.equal(resolveTheme(id), id, id + " resolves to itself, not a fallback");

    const theme = THEMES[id];
    assert.equal(theme.mood, expected.mood, id + " has the right light/dark mood");
    assert.equal(theme.neutrals.base, expected.base, id + " base matches the official hex");
    assert.equal(theme.neutrals.text, expected.text, id + " text matches the official hex");
    assert.equal(theme.accents.mauve, expected.mauve, id + " mauve matches the official hex");

    // Every theme renders a full custom-property block, same as any other.
    const css = themeRootCss(id);
    assert.ok(css.includes(`--base:`) && css.includes(expected.base), id + " emits its base color");
    assert.ok(css.includes("--accent:"), id + " emits an accent role");

    const slides = parseSlides("# Catppuccin\nFlavor check");
    const html = generateHtml(slides, "Deck", false, id, "m");
    assert.ok(html.includes(`data-theme="${id}"`), id + " renders with its own data-theme attribute");
  }

  // Latte is the only light flavor; the other three are dark — this is the
  // exact axis "dark mode only" logic keys off of, so it must not misfire.
  const summaries = themeSummaries().filter((t) => t.id in flavors);
  assert.equal(summaries.length, 4);
  for (const s of summaries) {
    assert.equal(s.mood, flavors[s.id].mood, s.id + " summary mood matches");
  }
});

test("One Dark Pro is registered with the official Atom One Dark palette", async () => {
  const { THEME_IDS, THEMES, themeRootCss, resolveThemeName: resolveTheme } =
    await import("../dist/themes.js");

  assert.ok(THEME_IDS.includes("onedarkpro"), "onedarkpro is registered in THEME_IDS");
  assert.equal(resolveTheme("onedarkpro"), "onedarkpro", "resolves to itself, not a fallback");

  const theme = THEMES.onedarkpro;
  assert.equal(theme.mood, "dark");
  assert.equal(theme.neutrals.base, "#282c34", "base matches the official editor background");
  assert.equal(theme.neutrals.subtext1, "#abb2bf", "subtext1 matches the official body text color");
  assert.equal(theme.accents.mauve, "#c678dd", "mauve matches the official keyword purple");
  assert.equal(theme.accents.blue, "#61afef", "blue matches the official function blue");
  assert.equal(theme.accents.green, "#98c379", "green matches the official string green");
  // The user-facing grammar colors this theme advertises (keyword/string/number/
  // function/class/comment/variable/operator) are exactly highlight.js's own
  // atom-one-dark stylesheet, not an approximation like some other dark themes use.
  assert.ok(theme.hljs.includes("atom-one-dark.min.css"), "pairs with the exact atom-one-dark grammar");

  const slides = parseSlides("# One Dark Pro\nTheme check");
  const html = generateHtml(slides, "Deck", false, "onedarkpro", "m");
  assert.ok(html.includes('data-theme="onedarkpro"'), "renders with its own data-theme attribute");
  assert.ok(themeRootCss("onedarkpro").includes("--base:") && themeRootCss("onedarkpro").includes("#282c34"));
});

test("The type size option is gone from every surface", async () => {
  const themes = await import("../dist/themes.js");
  for (const gone of ["SIZE_IDS", "DEFAULT_SIZE", "findSize", "resolveSizeName",
                      "sizeSummaries", "sizeListing", "sizeRootCss", "sizeSwitchableCss"]) {
    assert.equal(themes[gone], undefined, gone + " is no longer exported");
  }

  // Nothing keys off a size any more: no attribute, no switchable scale, and
  // no multiplier left over from one.
  const deck = generateHtml(parseSlides("# One\nBody"), "Deck");
  const preview = generatePreviewHtml();
  const editor = generateEditorHtml();
  for (const [name, html] of Object.entries({ deck, preview, editor })) {
    assert.ok(!html.includes("data-size"), name + " sets no data-size");
    assert.ok(!html.includes("--type-display"), name + " has no type multiplier");
    assert.ok(!html.includes("--type-body"), name + " has no type multiplier");
  }
  assert.ok(!editor.includes("sz-btn"), "the editor has no size control");
  assert.ok(!editor.includes("th-size"), "the theme picker has no size row");
  assert.ok(!editor.includes('"sizes"'), "the editor is not handed a size list");

  // The one scale the deck now renders at still reaches the templates.
  assert.ok(deck.includes("--slide-pad-y: 4.4rem"));
  assert.ok(deck.includes("--slide-pad-x: 6rem"));
});

test("Chat confines Claude to the opened file", () => {
  const name = "my deck (v2) 망한.html";
  const args = chatArgs(name, "html", null);
  const after = (flag) => args[args.indexOf(flag) + 1];

  assert.ok(args.includes("--restricted"), "no code-running tools, no personal settings");
  assert.ok(args.includes("--strict-mcp-config"), "no MCP servers");
  assert.equal(after("--permission-mode"), "dontAsk");
  const tools = args.slice(args.indexOf("--tools") + 1, args.indexOf("--settings"));
  assert.deepEqual(tools, ["Read", "Edit", "Write", "Glob", "Grep"]);
  assert.ok(!args.includes("--allowedTools"), "the CLI flag splits names with spaces and parentheses");

  // The one edit rule names the file exactly, spaces, parentheses and all.
  assert.deepEqual(JSON.parse(after("--settings")).permissions.allow, ["Read", "Glob", "Grep", `Edit(./${name})`]);
  assert.equal(after("--settings"), chatPermissions(name));
  assert.ok(after("--append-system-prompt").includes(name));
  assert.ok(!after("--append-system-prompt").includes("\n"), "one line, so it survives cmd.exe");

  assert.ok(!args.includes("--resume"), "a first turn starts a new conversation");
  const later = chatArgs(name, "markdown", "abc-123", "sonnet");
  assert.equal(later[later.indexOf("--resume") + 1], "abc-123");
  assert.equal(later[later.indexOf("--model") + 1], "sonnet");

  assert.equal(chatBlockedReason(name), null);
  assert.match(chatBlockedReason("deck*.html"), /glob/);
  assert.match(chatBlockedReason("deck[1].md"), /glob/);
});

test("Chat stream events map to what the panel shows", () => {
  const cwd = process.platform === "win32" ? "C:\talks" : "/talks";
  const inCwd = (f) => (process.platform === "win32" ? "C:\talks\\" : "/talks/") + f;

  assert.deepEqual(chatEvents({ type: "system", subtype: "init", session_id: "s1" }, cwd), [{ type: "session", id: "s1" }]);
  assert.deepEqual(
    chatEvents({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } }, cwd),
    [{ type: "text", text: "Hi" }]
  );
  assert.deepEqual(
    chatEvents({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "…" } } }, cwd),
    []
  );
  assert.deepEqual(
    chatEvents({ type: "assistant", message: { content: [
      { type: "text", text: "Editing" },
      { type: "tool_use", name: "Edit", input: { file_path: inCwd("deck.html") } },
      { type: "tool_use", name: "Grep", input: { pattern: "<title>" } },
    ] } }, cwd),
    [{ type: "tool", name: "Edit", target: "deck.html" }, { type: "tool", name: "Grep", target: "<title>" }]
  );
  assert.deepEqual(
    chatEvents({ type: "result", subtype: "success", is_error: false, result: "Done.", duration_ms: 4200,
      permission_denials: [{ tool_name: "Write", tool_input: { file_path: inCwd("other.html") } }] }, cwd),
    [{ type: "done", ok: true, text: "Done.", ms: 4200, denied: ["Write other.html"] }]
  );
  assert.equal(chatEvents({ type: "result", subtype: "error_during_execution", is_error: true }, cwd)[0].ok, false);
  // A subagent's chatter is not the reply.
  assert.deepEqual(
    chatEvents({ type: "stream_event", parent_tool_use_id: "t1", event: { type: "content_block_delta", delta: { type: "text_delta", text: "x" } } }, cwd),
    []
  );
});

test("Editor offers the chat panel only when the server says it can", () => {
  const file = { name: "talk.html", kind: "html", writable: true, watched: true };
  const withChat = generateEditorHtml("nord", {}, "classic", "slide", { ...file, chat: true });
  const without = generateEditorHtml("nord", {}, "classic", "slide", file);
  assert.ok(withChat.includes('"chat":true'));
  assert.ok(!without.includes('"chat":true'));
  // The button exists in both, hidden by CSS until data-chat="on" is set.
  for (const html of [withChat, without]) {
    assert.ok(html.includes('id="btn-chat"'));
    assert.ok(html.includes('id="pane-chat"'));
    assert.match(html, /#btn-chat \{ display: none; \}/);
  }
  assert.ok(withChat.includes("fetch('/__chat'"));
});

test("The HTML doc preview keeps decks that write history running", () => {
  const editor = generateEditorHtml();
  const start = editor.indexOf("var HISTORY_SHIM");
  const end = editor.indexOf("function onHtmlInput");
  assert.ok(start > 0 && end > start, "the shim and its injector ship in the editor");
  const ctx = {};
  vm.runInNewContext(editor.slice(start, end), ctx);

  const shimmed = ctx.previewSrcdoc("<!doctype html><html><head><title>t</title></head><body><header>h</header></body></html>");
  assert.ok(shimmed.startsWith("<!doctype html><html><head><script>"), "injected first thing in <head>");
  assert.equal(shimmed.split("replaceState").length - 1, 1, "injected once, and not into <header>");
  const bare = ctx.previewSrcdoc("<!DOCTYPE html><p>hi</p>");
  assert.ok(bare.startsWith("<!DOCTYPE html><script>"), "after the doctype, so standards mode holds");

  // The shim turns a throwing replaceState into a no-op.
  const history = { replaceState() { throw new Error("SecurityError"); }, pushState() { throw new Error("SecurityError"); } };
  const shimJs = ctx.HISTORY_SHIM.replace(/^<script>|<\/script>$/g, "");
  vm.runInNewContext(shimJs, { history });
  assert.doesNotThrow(() => history.replaceState(null, "", "#2"));
  assert.doesNotThrow(() => history.pushState(null, "", "#3"));
});

test("Doc presenter focuses the doc and settles keys both could take", () => {
  const html = generateDocHtml("/?deck=1", "Talk");
  // Keys reach the doc's own script without a click first.
  assert.match(html, /function focusDoc\(\)/);
  assert.match(html, /el\.blur\(\);\s*focusDoc\(\);/, "toolbar clicks hand focus back to the doc");
  // deckrun's overlays win ahead of the doc; otherwise the doc's handled keys are its own.
  assert.ok(html.includes("addEventListener('keydown', onFrameKeyCapture, true)"));
  assert.ok(html.includes("addEventListener('keydown', onFrameKey)"));
  assert.match(html, /function onFrameKey\(e\) \{\s*if \(e\.defaultPrevented\) return;/);
  assert.match(html, /if \(helpOn \|\| blackOn \|\| themesOpen\(\)\) return true;/);
});
