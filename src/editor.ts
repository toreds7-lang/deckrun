import { RESET_CSS } from "./generate.js";
import {
  DEFAULT_THEME,
  decorOf,
  findFont,
  fontSummaries,
  googleFontsHref,
  themeSummaries,
  themeSwitchableCss,
  type ThemeName,
} from "./themes.js";
import {
  SNIPPETS,
  SNIPPET_GROUPS,
  TIPS,
  WELCOME_DECK,
} from "./editor-content.js";
import { PREVIEW_WIDTH, PREVIEW_HEIGHT } from "./preview.js";
import {
  DEFAULT_TEMPLATE,
  DEFAULT_TRANSITION,
  resolveTemplateName,
  resolveTransitionName,
  templateSummaries,
  transitionSummaries,
  type TemplateName,
  type TransitionName,
} from "./presentation-options.js";
import { HIGHLIGHT_RUNTIME } from "./highlights.js";
import { HTML_SLIDES_RUNTIME } from "./html-slides.js";
import { SLIDE_PANEL_CSS, SLIDE_PANEL_MARKUP, SLIDE_PANEL_RUNTIME } from "./slide-panel.js";
import { DESIGN_CSS, DESIGN_RUNTIME } from "./design.js";
import { DESIGN_KIT_RUNTIME } from "./design-kit.js";
import { INSPECT_BUTTON, INSPECT_CRUMBS, INSPECT_CSS, INSPECT_LAYER, INSPECT_RUNTIME } from "./inspect.js";
import { CHAT_KIT_RUNTIME } from "./chat-kit.js";
import { UPLOAD_ACCEPT } from "./folder.js";

/** A document the editor is backed by: a local file or a fetched URL. */
export interface EditorFileInfo {
  /** Shown as the document name; also the download filename. */
  name: string;
  kind: "markdown" | "html";
  /** Editor changes are written back (a local file, not a fetched URL). */
  writable: boolean;
  /** The server watches the file and pings /__events on external changes. */
  watched: boolean;
  /** Claude Code is available to edit the file from the chat panel. */
  chat?: boolean;
  /** The file's folder, by name: the files menu opens its other decks and copies uploads into it. */
  folder?: string;
}

function bootstrapJson(
  theme: ThemeName,
  fonts: { head: string | null; body: string | null },
  template: TemplateName,
  transition: TransitionName,
  file: EditorFileInfo | null
): string {
  const payload = {
    file,
    theme,
    themes: themeSummaries(),
    fonts,
    faces: fontSummaries(),
    template,
    templates: templateSummaries(),
    transition,
    transitions: transitionSummaries(),
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    groups: SNIPPET_GROUPS,
    snippets: SNIPPETS,
    tips: TIPS,
    welcome: WELCOME_DECK,
  };
  // Keep the JSON inert inside a <script> block.
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/** The Markdown editor served when `deckrun` is launched without a file. */
export function generateEditorHtml(
  theme: ThemeName = DEFAULT_THEME,
  fontInput: { head?: string | null; body?: string | null } = {},
  templateInput: TemplateName = DEFAULT_TEMPLATE,
  transitionInput: TransitionName = DEFAULT_TRANSITION,
  file: EditorFileInfo | null = null
): string {
  const template = resolveTemplateName(templateInput);
  const transition = resolveTransitionName(transitionInput);
  const fonts = { head: findFont(fontInput.head), body: findFont(fontInput.body) };
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}" data-decor="${decorOf(theme)}" data-template="${template}" data-transition="${transition}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>deckrun · editor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsHref()}" rel="stylesheet">
  <style>
${RESET_CSS}

${themeSwitchableCss()}

html, body {
  height: 100%;
  overflow: hidden;
  background: var(--crust);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
::selection { background: var(--selection-bg, var(--accent-line, rgba(56, 139, 253, 0.35))); color: var(--selection-text, inherit); }
::-moz-selection { background: var(--selection-bg, var(--accent-line, rgba(56, 139, 253, 0.35))); color: var(--selection-text, inherit); }

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--surface1); border-radius: 5px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--surface2); background-clip: content-box; }

#app { display: flex; flex-direction: column; height: 100%; }

/* ── Top bar ──────────────────────────────────────────────────────────── */
/* Ten controls live here and there is no room to spare. The bar wraps rather
   than scrolls: a scrollable top bar would clip the dropdowns that hang out of
   it, since overflow-x also clips vertically. */
#topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 9px;
  min-height: 46px;
  flex: 0 0 auto;
  padding: 7px 12px;
  background: var(--mantle);
  border-bottom: 1px solid var(--surface0);
}

/* The right-hand controls wrap as a block and stay right-aligned, so a narrow
   window never leaves "present" stranded at the far left of a second row. */
#topbar-right {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 7px 9px;
  min-width: 0;
}

/* Before it wraps, shed what is least load-bearing: the keyboard hints, then
   the two buttons whose action the command palette also carries. */
#font-label {
  display: inline-block;
  max-width: 136px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

@media (max-width: 1460px) {
  .btn kbd { display: none; }
}

@media (max-width: 1300px) {
  #font-label { max-width: 76px; }
  #docname { width: 130px; }
}

@media (max-width: 1140px) {
  #btn-new { display: none; }
}

@media (max-width: 1040px) {
  #btn-guide { display: none; }
}

#brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

#brand .caret {
  width: 8px;
  height: 15px;
  background: var(--accent);
  animation: blink 1.1s step-start infinite;
}

@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

#docname {
  width: 190px;
  padding: 5px 8px;
  font: inherit;
  color: var(--subtext1);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
}

#docname:hover { border-color: var(--surface0); }
#docname:focus { outline: none; border-color: var(--accent); color: var(--text); }

/* Both of these sat in the top bar and were the loudest things in it. They
   belong with the other counters, at the bottom. */
#chip-slides { white-space: nowrap; }

#save-state { white-space: nowrap; color: var(--overlay1); }
#save-state:empty { display: none; }
#save-state.ok { color: var(--green); }
#save-state.warn { color: var(--yellow); }
#save-state.err { color: var(--red); }

.spacer { flex: 1 1 auto; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  font-size: 12px;
  color: var(--subtext1);
  border: 1px solid var(--surface0);
  border-radius: 7px;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.btn:hover { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }
.btn kbd { font: inherit; font-size: 10px; color: var(--overlay0); }

/* ── Font menu ────────────────────────────────────────────────────────── */
.menu__pop--font { min-width: 452px; padding: 0; }

#ff-cols { display: flex; }
.ff-col { flex: 1 1 0; min-width: 0; padding: 7px; }
.ff-col + .ff-col { border-left: 1px solid var(--surface0); }

.ff-col__title {
  padding: 4px 8px 7px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--overlay0);
}

.ff-list { max-height: 58vh; overflow-y: auto; }

.ff-row {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border-radius: 6px;
  border-left: 2px solid transparent;
  text-align: left;
}

.ff-row:hover { background: var(--surface-soft); border-left-color: var(--accent); }
.ff-row.is-on { border-left-color: var(--accent); }
.ff-row.is-on .ff-row__name { color: var(--accent); }

/* Each row is set in the face it offers, which is the only honest preview. */
.ff-row__name {
  display: block;
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ff-row--auto .ff-row__name { font-family: var(--font-mono); font-size: 12px; color: var(--subtext0); }

.ff-foot {
  padding: 8px 14px;
  border-top: 1px solid var(--surface0);
  font-size: 10px;
  color: var(--overlay0);
}

/* The swatch on the theme button, so the current palette is visible at rest. */
.th-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex: 0 0 auto;
  background: var(--gradient);
  transform: rotate(45deg);
}
.btn--icon { padding: 0 9px; }

.btn--primary {
  color: var(--crust);
  font-weight: 600;
  border-color: transparent;
  background: var(--gradient);
}

/* The gradient has to be restated: .btn:hover is a class plus a pseudo-class,
   so its faint tint outranks the plain .btn--primary background and the button
   would drop to near-black text on a barely-there surface. */
.btn--primary:hover {
  background: var(--gradient);
  filter: brightness(1.12);
  border-color: transparent;
  color: var(--crust);
}
.btn--primary kbd { color: var(--crust); opacity: 0.7; }

/* ── Panes ────────────────────────────────────────────────────────────── */
#panes { flex: 1 1 auto; display: flex; min-height: 0; }

#pane-edit {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 240px;
  background: var(--mantle);
}

#divider { flex: 0 0 7px; position: relative; cursor: col-resize; background: var(--crust); }
#divider::after {
  content: '';
  position: absolute;
  inset: 0 3px;
  background: var(--surface0);
  transition: background 0.15s ease;
}
#divider:hover::after, #divider.is-dragging::after { background: var(--accent); }

#pane-prev {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 260px;
  background: var(--crust);
}

/* ── Editor surface ───────────────────────────────────────────────────── */
#edit-wrap { position: relative; flex: 1 1 auto; min-height: 0; }

#hl, #src, #measure {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 18px 20px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  font-weight: 400;
  font-style: normal;
  line-height: 1.75;
  letter-spacing: 0;
  word-spacing: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  tab-size: 2;
  border: 0;
  box-sizing: border-box;
  background: transparent;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

#hl::-webkit-scrollbar, #src::-webkit-scrollbar {
  display: none;
}

#hl { z-index: 1; overflow: hidden; pointer-events: none; color: var(--subtext0); }
#measure { z-index: 0; visibility: hidden; overflow: hidden; }

#src {
  z-index: 2;
  overflow-y: auto;
  overflow-x: hidden;
  color: transparent;
  caret-color: var(--accent);
  resize: none;
  outline: none;
}

#src::selection { background: var(--selection-bg, var(--accent-line, rgba(56, 139, 253, 0.35))); color: transparent; }
#src::-moz-selection { background: var(--selection-bg, var(--accent-line, rgba(56, 139, 253, 0.35))); color: transparent; }

/* Markdown tokens — color only to guarantee pixel-identical alignment */
.t-h1 { color: var(--accent); }
.t-h2 { color: var(--accent-2); }
.t-h3 { color: var(--accent-3); }
.t-h4 { color: var(--teal); }
.t-strong { color: var(--peach); }
.t-em { color: var(--subtext1); }
.t-code { color: var(--green); }
.t-fence { color: var(--overlay1); }
.t-codeline { color: var(--subtext1); }
.t-quote { color: var(--subtext0); }
.t-marker { color: var(--accent); }
.t-link { color: var(--blue); }
.t-url { color: var(--overlay0); }
.t-img { color: var(--sapphire); }
.t-dir { color: var(--yellow); }
.t-note { color: var(--overlay0); }
.t-html { color: var(--pink); }
.t-table { color: var(--lavender); }
.t-sep { color: var(--accent); }

/* ── Drop target ──────────────────────────────────────────────────────── */
#pane-edit.is-dropping::after {
  content: 'drop a Markdown or HTML file to open it';
  position: absolute;
  inset: 10px;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--accent);
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
  letter-spacing: 0.05em;
  pointer-events: none;
}
[data-folder="on"] #pane-edit.is-dropping::after {
  content: 'drop .html, .md, or images to copy them into this folder';
}

/* ── Preview ──────────────────────────────────────────────────────────── */
#prev-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  flex: 0 0 34px;
  padding: 0 12px;
  border-bottom: 1px solid var(--surface0);
  font-size: 11px;
  color: var(--overlay1);
}

#overflow-badge {
  display: none;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid var(--yellow);
  border-radius: 999px;
  color: var(--yellow);
  background: var(--surface-soft);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

#overflow-badge.is-on { display: inline-flex; }

/* ── Dropdown menu ────────────────────────────────────────────────────── */
.menu { position: relative; display: inline-flex; }
.menu__chev { font-size: 9px; color: var(--overlay0); }
.menu.is-open > .btn { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }

.menu__pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 45;
  min-width: 316px;
  padding: 5px;
  display: none;
  flex-direction: column;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
}

.menu.is-open .menu__pop { display: flex; }

.menu__pop button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  border-left: 2px solid transparent;
  text-align: left;
}

.menu__pop button:hover, .menu__pop button.is-sel {
  background: var(--surface-soft);
  border-left-color: var(--accent);
}

/* A fixed name column keeps the three rows on one grid. */
.menu__name { flex: 0 0 74px; font-size: 12.5px; color: var(--text); }
.menu__hint { flex: 1 1 auto; font-size: 11px; color: var(--overlay1); white-space: nowrap; }
.menu__pop kbd {
  flex: 0 0 auto;
  margin-left: auto;
  font: inherit;
  font-size: 10px;
  color: var(--overlay0);
  white-space: nowrap;
}

.menu__pop--template { min-width: 390px; padding: 7px; }
.menu-section + .menu-section { margin-top: 6px; padding-top: 7px; border-top: 1px solid var(--surface0); }
.menu-section__title {
  padding: 2px 10px 5px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--overlay0);
}
.menu__pop--template button.is-on {
  background: var(--accent-soft);
  border-left-color: var(--accent);
}
.menu__pop--template button.is-on .menu__name { color: var(--accent); }

/* The files menu: the decks beside the opened file, in file mode only. Its
   button carries the file's name, standing in for the read-only name box. */
#files-wrap { display: none; }
[data-folder="on"] #files-wrap { display: inline-flex; }
[data-folder="on"] #docname { display: none; }
#files-label { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1300px) {
  #files-label { max-width: 150px; }
}
.menu__pop--files {
  left: 0;
  right: auto;
  min-width: 340px;
  max-width: min(520px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  overflow-y: auto;
}
.menu__pop--files .menu__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu__pop--files .menu__hint { flex: 0 0 auto; }
.menu__pop--files button.is-on { background: var(--accent-soft); border-left-color: var(--accent); }
.menu__pop--files button.is-on .menu__name { color: var(--accent); }
#files-list { display: flex; flex-direction: column; }
.files-empty { padding: 8px 10px; font-size: 11.5px; line-height: 1.5; color: var(--overlay1); }
.files-foot { display: flex; flex-direction: column; margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--surface0); }

.seg { display: flex; border: 1px solid var(--surface0); border-radius: 7px; overflow: hidden; }
.seg button { font-size: 11px; padding: 3px 10px; color: var(--overlay1); }
.seg button.is-on { background: var(--surface0); color: var(--text); }

.step { font-size: 13px; color: var(--overlay1); padding: 0 5px; }
.step:hover { color: var(--text); }
.step[disabled] { opacity: 0.3; cursor: default; }

#stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
}

#frame-box { position: relative; }

#frame {
  position: absolute;
  top: 0;
  left: 0;
  width: ${PREVIEW_WIDTH}px;
  height: ${PREVIEW_HEIGHT}px;
  border: 0;
  transform-origin: top left;
  background: var(--base);
}

#frame-box.is-single {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--surface0);
  box-shadow: var(--shadow-lg);
}

#notes {
  flex: 0 0 auto;
  max-height: 24%;
  overflow: auto;
  padding: 9px 12px 11px;
  border-top: 1px solid var(--surface0);
  background: var(--mantle);
  display: none;
}

#notes.is-on { display: block; }
#notes__label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--overlay0);
  margin-bottom: 4px;
}
#notes__text { font-size: 12.5px; line-height: 1.65; color: var(--subtext0); white-space: pre-wrap; }

/* ── Status bar ───────────────────────────────────────────────────────── */
#statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 28px;
  flex: 0 0 28px;
  padding: 0 12px;
  background: var(--mantle);
  border-top: 1px solid var(--surface0);
  font-size: 11px;
  color: var(--overlay0);
}

#statusbar > span { flex: 0 0 auto; }
#tipbar { flex: 1 1 auto !important; display: flex; align-items: center; gap: 8px; min-width: 0; }
#tipbar .tag {
  flex: 0 0 auto;
  color: var(--accent);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 9px;
}
#tip-text { color: var(--subtext0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#tipbar button { color: var(--overlay0); padding: 0 3px; }
#tipbar button:hover { color: var(--text); }

#follow-chip {
  flex: 0 0 auto;
  border: 1px solid var(--surface0);
  border-radius: 5px;
  padding: 1px 7px;
  color: var(--accent2);
  cursor: pointer;
  user-select: none;
}
#follow-chip:hover { border-color: var(--accent2); }
#follow-chip b { font-weight: 600; }
#follow-chip.hidden { display: none; }

/* ── Command palette ──────────────────────────────────────────────────── */
#palette, #guide, #library { position: fixed; inset: 0; z-index: 40; display: none; }
#palette.is-on, #guide.is-on, #library.is-on { display: block; }
.backdrop { position: absolute; inset: 0; background: var(--scrim); backdrop-filter: blur(3px); }

#pal-box, #lib-box {
  position: relative;
  width: min(690px, 92vw);
  margin: 9vh auto 0;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

#pal-input, #lib-head {
  width: 100%;
  padding: 15px 18px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--surface0);
  outline: none;
}

#pal-input::placeholder { color: var(--overlay0); }
#pal-list, #lib-list { max-height: 54vh; overflow-y: auto; padding: 6px; }

#lib-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
}
#lib-head span { flex: 1 1 auto; }
#lib-head button {
  font-size: 11px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 6px;
  padding: 4px 9px;
}
#lib-head button:hover { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }

.lib-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  border-left: 2px solid transparent;
  cursor: pointer;
}

.lib-row.is-sel { background: var(--surface-soft); border-left-color: var(--accent); }
.lib-row.is-current .lib-row__name { color: var(--accent-2); }
.lib-row__main { flex: 1 1 auto; min-width: 0; }
.lib-row__name {
  color: var(--text);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lib-row__meta { color: var(--overlay1); font-size: 11px; margin-top: 2px; }
.lib-row__acts { flex: 0 0 auto; display: flex; gap: 5px; opacity: 0; transition: opacity 0.12s ease; }
.lib-row:hover .lib-row__acts, .lib-row.is-sel .lib-row__acts { opacity: 1; }
.lib-row__acts button {
  font-size: 10px;
  color: var(--overlay1);
  border: 1px solid var(--surface1);
  border-radius: 5px;
  padding: 3px 7px;
}
.lib-row__acts button:hover { border-color: var(--accent); color: var(--text); }
.lib-row__acts button.danger:hover { border-color: var(--red); color: var(--red); }

.pal-group {
  padding: 11px 12px 5px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--overlay0);
}

.pal-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border-left: 2px solid transparent;
  cursor: pointer;
}

.pal-row.is-sel { background: var(--surface-soft); border-left-color: var(--accent); }
.pal-row__main { flex: 1 1 auto; min-width: 0; }
.pal-row__label { color: var(--text); font-size: 12.5px; }
.pal-row__hint { color: var(--overlay1); font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pal-row__syntax {
  flex: 0 0 auto;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--green);
  background: var(--surface-soft);
  border-radius: 5px;
  padding: 3px 7px;
}
.pal-row__keys { flex: 0 0 auto; font-size: 10px; color: var(--overlay0); }
#pal-foot {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--surface0);
  font-size: 10px;
  color: var(--overlay0);
}

/* ── Guide drawer ─────────────────────────────────────────────────────── */
#guide-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(540px, 94vw);
  display: flex;
  flex-direction: column;
  background: var(--mantle);
  border-left: 1px solid var(--surface1);
  box-shadow: -22px 0 70px var(--scrim);
}

#guide-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--surface0);
}
#guide-head h2 { font-size: 14px; font-weight: 600; color: var(--text); }
#guide-head p { font-size: 11px; color: var(--overlay1); margin-top: 3px; }
#guide-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 16px 30px; }

.gsec { margin-bottom: 22px; }
.gsec > h3 {
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 9px;
}

.gcard {
  border: 1px solid var(--surface0);
  border-radius: 10px;
  padding: 11px 12px;
  margin-bottom: 8px;
  background: var(--base);
  transition: border-color 0.15s ease;
}
.gcard:hover { border-color: var(--surface2); }
.gcard__top { display: flex; align-items: baseline; gap: 10px; }
.gcard__label { flex: 1 1 auto; color: var(--text); font-size: 12.5px; }
.gcard__keys { font-size: 10px; color: var(--overlay0); }
.gcard__hint { font-size: 11.5px; color: var(--overlay1); line-height: 1.6; margin-top: 4px; }
.gcard__syntax {
  margin-top: 8px;
  font-size: 11px;
  color: var(--green);
  background: var(--crust);
  border: 1px solid var(--surface0);
  border-radius: 6px;
  padding: 7px 9px;
  overflow-x: auto;
  white-space: pre;
}
.gcard__ins {
  margin-top: 8px;
  font-size: 11px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 6px;
  padding: 4px 9px;
}
.gcard__ins:hover { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }

/* ── Theme picker ─────────────────────────────────────────────────────── */
#themes { position: fixed; inset: 0; z-index: 44; display: none; }
#themes.is-on { display: block; }

#th-box {
  position: relative;
  width: min(1120px, 95vw);
  margin: 5vh auto 0;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

#th-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--surface0);
  font-size: 13px;
  color: var(--text);
}

#th-head .th-head__sub { flex: 1 1 auto; font-size: 11px; color: var(--overlay1); }
#th-head .th-head__sub kbd {
  font: inherit;
  font-size: 10px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 3px;
  padding: 0 3px;
}

#th-head button {
  font-size: 11px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 6px;
  padding: 4px 9px;
}
#th-head button:hover { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }

#th-list { max-height: 76vh; overflow-y: auto; padding: 14px 16px 18px; }

.th-group {
  padding: 4px 2px 8px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--overlay0);
}

.th-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.th-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--surface1);
  border-radius: 12px;
  background: var(--base);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
}

.th-card:hover, .th-card.is-sel {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.th-card.is-current { box-shadow: inset 0 0 0 1px var(--accent); }

/* The thumbnail is a real slide in miniature: the theme's own background,
   its own accent, its own faces. Nothing about it is a stand-in. */
.th-thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 13px 14px;
  overflow: hidden;
  border-bottom: 1px solid var(--surface0);
}

.th-thumb__glow {
  position: absolute;
  width: 150%;
  height: 150%;
  right: -55%;
  top: -60%;
  border-radius: 50%;
  pointer-events: none;
}

.th-thumb__title {
  position: relative;
  font-size: 15px;
  line-height: 1.1;
  margin-bottom: 6px;
}

.th-thumb__rule { position: relative; width: 34px; height: 2px; border-radius: 2px; margin-bottom: 9px; }
.th-thumb__line { position: relative; height: 3px; border-radius: 2px; margin-bottom: 5px; }
.th-thumb__code {
  position: relative;
  margin-top: 8px;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 8px;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
}

.th-meta { padding: 9px 12px 11px; }
.th-meta__top { display: flex; align-items: baseline; gap: 7px; }
.th-meta__name { flex: 1 1 auto; font-size: 12.5px; color: var(--text); }
.th-meta__mood {
  flex: 0 0 auto;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--overlay0);
}
.th-meta__blurb {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--overlay1);
  margin-top: 4px;
}

/* ── Toasts ───────────────────────────────────────────────────────────── */
#toasts {
  position: fixed;
  right: 16px;
  bottom: 42px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 380px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--subtext1);
  background: var(--base);
  border: 1px solid var(--surface1);
  border-left: 2px solid var(--teal);
  border-radius: 9px;
  box-shadow: var(--shadow-md);
  pointer-events: all;
  animation: rise 0.18s ease;
}

.toast--warn { border-left-color: var(--yellow); }
.toast--err { border-left-color: var(--red); }
.toast button {
  font-size: 11px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 6px;
  padding: 3px 8px;
}
.toast button:hover { border-color: var(--accent); color: var(--text); }

@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ── HTML doc source / preview ───────────────────────────────────────────
   These live inside the same #pane-edit / #pane-prev panes the Markdown
   editor uses, so the divider drag-resize keeps working for free — only the
   inner content swaps, via [data-doc-kind]. */
#src-html {
  display: none;
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 18px 20px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text);
  caret-color: var(--accent);
  background: transparent;
  border: 0;
  outline: none;
  resize: none;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

#frame-html {
  display: none;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  border: 0;
  background: #fff;
}

[data-doc-kind="html"] #edit-wrap,
[data-doc-kind="html"] #nudge,
[data-doc-kind="html"] #prev-head,
[data-doc-kind="html"] #stage,
[data-doc-kind="html"] #notes {
  display: none !important;
}

[data-doc-kind="html"] #src-html,
[data-doc-kind="html"] #frame-html {
  display: block;
}

[data-doc-kind="html"] #btn-guide,
[data-doc-kind="html"] #btn-palette,
[data-doc-kind="html"] #template-wrap {
  display: none !important;
}

/* ── Start screen ─────────────────────────────────────────────────────── */
#screen-start { position: fixed; inset: 0; z-index: 55; display: none; }
#screen-start.is-on { display: block; }

#start-box {
  position: relative;
  width: min(680px, 92vw);
  margin: 12vh auto 0;
  padding: 26px 28px 22px;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
}

#start-head { margin-bottom: 18px; }
#start-head #brand { font-size: 15px; }
#start-head p { margin-top: 8px; font-size: 12.5px; color: var(--overlay1); }

#start-cards { display: flex; flex-direction: column; gap: 10px; }

.start-card {
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  background: var(--base);
  border: 1px solid var(--surface0);
  border-radius: 10px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.start-card:hover { border-color: var(--accent); background: var(--accent-soft); }
.start-card.is-disabled { opacity: 0.45; pointer-events: none; }

.start-card__title { display: block; font-size: 13px; font-weight: 600; color: var(--text); }
.start-card__desc { display: block; margin-top: 4px; font-size: 11.5px; color: var(--overlay1); }

.start-card__acts { display: flex; gap: 8px; margin-top: 10px; }
.start-card__acts button {
  padding: 5px 10px;
  font-size: 11.5px;
  color: var(--subtext1);
  border: 1px solid var(--surface1);
  border-radius: 6px;
  flex: none;
}
.start-card__acts button:hover { border-color: var(--accent); color: var(--text); }

.start-options {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--surface0);
}
.start-options__row { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
.start-options__label {
  flex: 0 0 72px;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--overlay0);
}
.start-options__choices { display: flex; flex-wrap: wrap; gap: 5px; }
.start-choice {
  padding: 4px 8px;
  font-size: 10.5px;
  color: var(--subtext0);
  border: 1px solid var(--surface1);
  border-radius: 6px;
}
.start-choice:hover { color: var(--text); border-color: var(--accent); }
.start-choice.is-on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }

.start-card__url { display: flex; gap: 6px; flex: 1 1 auto; min-width: 0; }
.start-card__url input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 5px 8px;
  font-size: 11.5px;
  font-family: inherit;
  color: var(--text);
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 6px;
}
.start-card__url input:focus { border-color: var(--accent); outline: none; }
.start-card__url button { flex: none; }

/* ── Claude chat ──────────────────────────────────────────────────────────
   A third column, only offered when the editor is backed by a file and
   Claude Code is on the machine. Edits come back through the file watcher,
   so the panel itself only has to show the conversation. */
#btn-chat { display: none; }
[data-chat="on"] #btn-chat { display: inline-flex; }
#btn-chat.is-on { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }

#pane-chat {
  display: none;
  flex: 0 0 360px;
  flex-direction: column;
  min-width: 0;
  background: var(--mantle);
  border-left: 1px solid var(--surface0);
}
#pane-chat.is-on { display: flex; }

#chat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 9px 12px;
  border-bottom: 1px solid var(--surface0);
}
#chat-title { font-weight: 600; color: var(--text); }
#chat-file { color: var(--overlay1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.chat-link {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--overlay1);
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
}
.chat-link:hover { color: var(--text); border-color: var(--surface1); }
#chat-close { font-size: 15px; line-height: 1; }

#chat-log {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.chat-msg {
  font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  font-size: 13px;
  line-height: 1.55;
  color: var(--subtext1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-msg--user {
  align-self: flex-end;
  max-width: 88%;
  padding: 7px 10px;
  color: var(--text);
  background: var(--surface0);
  border-radius: 9px 9px 2px 9px;
}
.chat-msg--err { color: var(--red); }
.chat-tool { font-size: 11px; color: var(--overlay1); }
.chat-tool--edit { color: var(--green); }
.chat-meta { font-size: 10px; color: var(--overlay0); letter-spacing: 0.04em; }
.chat-empty { font-size: 12px; line-height: 1.6; color: var(--overlay1); }
.chat-empty button {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 6px 9px;
  text-align: left;
  font-size: 12px;
  color: var(--subtext0);
  border: 1px solid var(--surface0);
  border-radius: 7px;
}
.chat-empty button:hover { border-color: var(--accent); color: var(--text); }
#pane-chat.is-busy #chat-log::after {
  content: 'working…';
  font-size: 11px;
  color: var(--accent);
  animation: blink 1.1s step-start infinite;
}

#chat-foot { flex: 0 0 auto; padding: 10px 12px 12px; border-top: 1px solid var(--surface0); }
#chat-input {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 40vh;
  padding: 8px 10px;
  font: inherit;
  font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  background: var(--crust);
  border: 1px solid var(--surface1);
  border-radius: 8px;
  outline: none;
  resize: vertical;
}
#chat-input:focus { border-color: var(--accent); }
#chat-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
#chat-note { flex: 1 1 auto; font-size: 10px; line-height: 1.45; color: var(--overlay0); }

/* What the message went with, under it: "slide 5 · h2.title". */
.chat-tag { align-self: flex-end; margin-top: -5px; font-size: 10px; color: var(--overlay0); }
.chat-sys {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--overlay1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 6px 9px;
  border-left: 2px solid var(--surface1);
}
.chat-sys b { color: var(--subtext1); font-weight: 600; }

/* Claude asked back: its likely answers, one click each. */
.chat-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.chat-choices button {
  max-width: 100%;
  padding: 5px 10px;
  font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  font-size: 12px;
  text-align: left;
  color: var(--subtext0);
  border: 1px solid var(--accent-line, var(--surface1));
  border-radius: 14px;
}
.chat-choices button:hover:not(:disabled) { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }
.chat-choices button:disabled { opacity: 0.45; cursor: default; }
.chat-choices button.is-picked { opacity: 1; border-color: var(--accent); color: var(--text); }

/* What a turn changed, and its undo. */
.chat-turn { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 11px; color: var(--overlay1); }
.chat-turn .chat-slide {
  padding: 1px 6px;
  font-size: 11px;
  color: var(--green);
  border: 1px solid color-mix(in srgb, var(--green) 40%, transparent);
  border-radius: 5px;
}
.chat-turn .chat-slide:hover { background: color-mix(in srgb, var(--green) 14%, transparent); }
.chat-turn .chat-undo { margin-left: auto; padding: 1px 8px; font-size: 11px; color: var(--subtext0); border: 1px solid var(--surface1); border-radius: 5px; }
.chat-turn .chat-undo:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.chat-turn .chat-undo:disabled { opacity: 0.5; cursor: default; }
.chat-turn.is-undone .chat-slide { color: var(--overlay0); border-color: var(--surface1); text-decoration: line-through; }

/* Slash commands, as in Claude Code: type / for the list. */
#chat-foot { position: relative; }
#chat-menu {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(100% - 6px);
  z-index: 5;
  display: none;
  padding: 4px;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.28));
}
#chat-menu.is-on { display: block; max-height: min(320px, 50vh); overflow-y: auto; }
.chat-cmd-hint { padding: 4px 8px; font-size: 11px; color: var(--overlay1); }
.chat-cmd-hint b { font-family: var(--font-mono, ui-monospace, monospace); font-weight: 600; color: var(--subtext1); }

/* /look: the picture Claude was sent, under the message. */
.chat-look { flex: 0 0 auto; align-self: flex-end; display: block; width: 78%; margin-top: -2px; border: 1px solid var(--surface1); border-radius: 6px; overflow: hidden; }
.chat-look img { display: block; width: 100%; height: auto; }
.chat-look:hover { border-color: var(--accent); }
#chat-model.is-set { color: var(--accent); border-color: var(--accent-line, var(--surface1)); }
.chat-cmd { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 5px 8px; text-align: left; border-radius: 5px; }
.chat-cmd.is-active { background: var(--accent-soft); }
.chat-cmd__name { flex: 0 0 auto; font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--text); }
.chat-cmd__args { color: var(--overlay1); }
.chat-cmd__help { flex: 1 1 auto; min-width: 0; font-size: 11px; color: var(--overlay1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

${SLIDE_PANEL_CSS}

${DESIGN_CSS}

${INSPECT_CSS}

/* ── Narrow screens ───────────────────────────────────────────────────── */
@media (max-width: 900px) {
  #panes { flex-direction: column; }
  #pane-edit { flex: 1 1 50%; width: auto !important; min-height: 0; }
  #pane-prev { flex: 1 1 50%; min-height: 0; }
  #divider { display: none; }
  #pane-chat { flex: 0 0 40%; border-left: 0; border-top: 1px solid var(--surface0); }
}
  </style>
</head>
<body>
<div id="app">
  <header id="topbar">
    <span id="brand">deckrun<span class="caret"></span></span>
    <input id="docname" value="deck" spellcheck="false" title="Deck name, also the download filename">
    <button class="btn" id="btn-decks" title="Switch between the decks in this browser">decks <span id="deck-count">1</span> <kbd>Cmd O</kbd></button>
    <span class="menu" id="files-wrap">
      <button class="btn" id="btn-files" aria-haspopup="true" aria-expanded="false" title="Open another deck from this folder, or copy files into it"><span id="files-label">files</span> <span class="menu__chev">&#9662;</span></button>
      <div class="menu__pop menu__pop--files" id="files-menu">
        <div class="menu-section__title" id="files-folder">this folder</div>
        <div id="files-list"></div>
        <div class="files-foot">
          <button id="files-upload">
            <span class="menu__name">upload&hellip;</span>
            <span class="menu__hint">copy .html, .md, or images into this folder</span>
          </button>
        </div>
      </div>
    </span>
    <span class="spacer"></span>
    <span id="topbar-right">
    <button class="btn" id="btn-guide" title="Everything you can put on a slide">guide <kbd>Cmd /</kbd></button>
    <button class="btn" id="btn-palette" title="Insert anything">insert <kbd>Cmd K</kbd></button>
    <button class="btn" id="btn-new" title="Start a new Markdown deck or HTML doc">new</button>
    <span class="menu">
      <button class="btn" id="btn-export" aria-haspopup="true" aria-expanded="false">export <span class="menu__chev">&#9662;</span></button>
      <div class="menu__pop" id="export-menu">
        <button data-export="md">
          <span class="menu__name">Markdown</span>
          <span class="menu__hint">a plain .md file</span>
          <kbd>Cmd S</kbd>
        </button>
        <button data-export="pdf">
          <span class="menu__name">PDF</span>
          <span class="menu__hint">16:9 pages, styling intact</span>
          <kbd>Cmd Shift S</kbd>
        </button>
        <button data-export="html">
          <span class="menu__name">HTML</span>
          <span class="menu__hint">one self-contained page</span>
          <kbd></kbd>
        </button>
      </div>
    </span>
    <span class="menu" id="template-wrap">
      <button class="btn" id="btn-template" aria-haspopup="true" aria-expanded="false" title="Composition template and slide transition">
        <span id="template-label">template</span> <span class="menu__chev">&#9662;</span>
      </button>
      <div class="menu__pop menu__pop--template" id="template-menu">
        <div class="menu-section">
          <div class="menu-section__title">template</div>
          <div id="template-list"></div>
        </div>
        <div class="menu-section">
          <div class="menu-section__title">transition</div>
          <div id="transition-list"></div>
        </div>
      </div>
    </span>
    <button class="btn" id="btn-theme" title="Pick a theme">
      <span class="th-dot" id="theme-dot"></span>
      <span id="theme-label">theme</span>
      <kbd>Cmd Shift L</kbd>
    </button>
    <span class="menu">
      <button class="btn" id="btn-font" aria-haspopup="true" aria-expanded="false" title="Heading and body faces">
        <span id="font-label">font</span> <span class="menu__chev">&#9662;</span>
      </button>
      <div class="menu__pop menu__pop--font" id="font-menu">
        <div id="ff-cols">
          <div class="ff-col">
            <div class="ff-col__title">heading &amp; title</div>
            <div class="ff-list" id="ff-head"></div>
          </div>
          <div class="ff-col">
            <div class="ff-col__title">body</div>
            <div class="ff-list" id="ff-body"></div>
          </div>
        </div>
        <div class="ff-foot">Code keeps the theme's monospace face.</div>
      </div>
    </span>
    ${INSPECT_BUTTON}
    <button class="btn" id="btn-chat" title="Ask Claude to edit this file">claude <kbd>Cmd J</kbd></button>
    <button class="btn btn--primary" id="btn-present" title="Open the real deck in a new tab">present <kbd>Cmd Enter</kbd></button>
    </span>
  </header>

  <main id="panes">
    <section id="pane-edit">
      <div id="edit-wrap">
        <pre id="hl" aria-hidden="true"></pre>
        <pre id="measure" aria-hidden="true"></pre>
        <textarea id="src" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="soft" aria-label="Markdown source"></textarea>
      </div>
      <textarea id="src-html" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="HTML source"></textarea>
    </section>

    <div id="divider" title="Drag to resize, double-click to reset"></div>

    <section id="pane-prev">
      <div id="prev-head">
        <button class="step" id="btn-prev" title="Previous slide">&#8592;</button>
        <span id="prev-count">slide 0 / 0</span>
        <button class="step" id="btn-next" title="Next slide">&#8594;</button>
        <span id="overflow-badge" title="This slide is clipped. Shorten it or split it with three dashes.">overflow</span>
        <span class="spacer"></span>
        <span id="prev-scale"></span>
        <div class="seg">
          <button id="seg-single" class="is-on">single</button>
          <button id="seg-grid">grid</button>
        </div>
      </div>
      <div id="stage">
        <div id="frame-box" class="is-single">
          <iframe id="frame" src="/__preview" title="Slide preview"></iframe>
        </div>
      </div>
      <div id="notes">
        <div id="notes__label">speaker notes</div>
        <div id="notes__text"></div>
      </div>
      ${SLIDE_PANEL_MARKUP}
    </section>

    <aside id="pane-chat" aria-label="Claude chat">
      <div id="chat-head">
        <span id="chat-title">claude</span>
        <span id="chat-file"></span>
        <span class="spacer"></span>
        <button class="chat-link" id="chat-model" title="The model Claude uses here; click to change (/model)">default</button>
        <button class="chat-link" id="chat-new" title="Forget this conversation and start a new one">new chat</button>
        <button class="chat-link" id="chat-close" title="Close the chat">&times;</button>
      </div>
      <div id="chat-log" aria-live="polite"></div>
      <div id="chat-foot">
        <div id="chat-menu" role="listbox" aria-label="Commands"></div>
        <textarea id="chat-input" rows="3" spellcheck="false" placeholder="Ask for a change to this slide · / for commands"></textarea>
        <div id="chat-row">
          <span id="chat-note">Your message and this file go to Claude through your Claude Code login.</span>
          <button class="btn btn--primary" id="chat-send">send</button>
        </div>
      </div>
    </aside>
  </main>

  <footer id="statusbar">
    <span id="pos">Ln 1, Col 1</span>
    <span id="words">0 words</span>
    <span id="chip-slides">0 slides</span>
    <span id="save-state"></span>
    ${INSPECT_CRUMBS}
    <span id="follow-chip" class="hidden" title="The editor is mirroring the presented deck. Click to stop following.">following deck &middot; <b id="follow-slide">1</b></span>
    <span id="tipbar">
      <span class="tag">tip</span>
      <span id="tip-text"></span>
      <button id="tip-prev" title="Previous tip">&#8249;</button>
      <button id="tip-next" title="Next tip">&#8250;</button>
    </span>
    <span id="local-note">local only, nothing is uploaded</span>
  </footer>
</div>

<div id="palette">
  <div class="backdrop" data-close="palette"></div>
  <div id="pal-box">
    <input id="pal-input" placeholder="Insert a style, layout, embed, or action" spellcheck="false" autocomplete="off">
    <div id="pal-list"></div>
    <div id="pal-foot">
      <span>&#8593;&#8595; move</span><span>enter inserts</span><span>esc closes</span>
    </div>
  </div>
</div>

<div id="guide">
  <div class="backdrop" data-close="guide"></div>
  <div id="guide-panel">
    <div id="guide-head">
      <div style="flex:1 1 auto">
        <h2>Everything you can put on a slide</h2>
        <p>Click insert on any card to drop it at your caret.</p>
      </div>
      <button class="nudge-btn nudge-btn--x" data-close="guide" title="Close">&times;</button>
    </div>
    <div id="guide-body"></div>
  </div>
</div>

<div id="library">
  <div class="backdrop" data-close="library"></div>
  <div id="lib-box">
    <div id="lib-head">
      <span>Decks in this browser</span>
      <button id="lib-new">new deck</button>
      <button data-close="library">close</button>
    </div>
    <div id="lib-list"></div>
    <div id="pal-foot">
      <span>&#8593;&#8595; move</span><span>enter opens</span><span>esc closes</span>
    </div>
  </div>
</div>

<div id="themes">
  <div class="backdrop" data-close="themes"></div>
  <div id="th-box">
    <div id="th-head">
      <span>Themes</span>
      <span class="th-head__sub">Arrow keys preview a theme live &nbsp;·&nbsp; enter keeps it &nbsp;·&nbsp; esc puts it back</span>
      <button data-close="themes">close</button>
    </div>
    <div id="th-list"></div>
  </div>
</div>

<div id="screen-start">
  <div class="backdrop"></div>
  <div id="start-box">
    <div id="start-head">
      <span id="brand">deckrun<span class="caret"></span></span>
      <p>What are you making?</p>
    </div>
    <div id="start-cards">
      <div class="start-card" id="start-md-card">
        <span class="start-card__title">Markdown deck</span>
        <span class="start-card__desc">Slides written in Markdown, presented one at a time.</span>
        <span class="start-card__acts">
          <button id="start-md-blank">start blank</button>
          <button id="start-md-upload">upload .md</button>
        </span>
        <div class="start-options">
          <div class="start-options__row">
            <span class="start-options__label">template</span>
            <span class="start-options__choices" id="start-template-list"></span>
          </div>
          <div class="start-options__row">
            <span class="start-options__label">transition</span>
            <span class="start-options__choices" id="start-transition-list"></span>
          </div>
        </div>
      </div>
      <div class="start-card" id="start-html-card">
        <span class="start-card__title">HTML document</span>
        <span class="start-card__desc">One self-contained page, presented with the laser, pen, and canvas &mdash; no slide boundaries.</span>
        <span class="start-card__acts">
          <button id="start-html-upload">upload .html</button>
          <span class="start-card__url">
            <input type="url" id="start-html-url" placeholder="https://a-public-page.html" inputmode="url" autocomplete="off" spellcheck="false">
            <button id="start-html-url-go">load URL</button>
          </span>
        </span>
      </div>
      <button class="start-card" id="start-lib">
        <span class="start-card__title">Open from library</span>
        <span class="start-card__desc" id="start-lib-desc">Decks and docs already in this browser.</span>
      </button>
    </div>
  </div>
</div>

<div id="toasts"></div>
${INSPECT_LAYER}
<input type="file" id="file-any" accept=".md,.markdown,text/markdown,text/plain,.html,.htm,text/html" hidden>
<input type="file" id="file-upload" accept="${UPLOAD_ACCEPT}" multiple hidden>

<script type="application/json" id="bootstrap">${bootstrapJson(theme, fonts, template, transition, file)}</script>
<script>
${HIGHLIGHT_RUNTIME}
${HTML_SLIDES_RUNTIME}
${SLIDE_PANEL_RUNTIME}
${DESIGN_KIT_RUNTIME}
${DESIGN_RUNTIME}
${INSPECT_RUNTIME}
${CHAT_KIT_RUNTIME}
</script>
<script>
(function () {
  'use strict';

  var D = JSON.parse(document.getElementById('bootstrap').textContent);
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var CMD = MAC ? 'Cmd' : 'Ctrl';

  // The document deckrun was launched with (a file on disk or a fetched
  // URL). When set, the editor is backed by it instead of the browser
  // library: content comes from /__file, edits save back through it, and
  // external changes on disk arrive over /__events.
  var FILE = D.file || null;
  // Every request about the file names it, so a tab keeps working on its
  // own deck after another tab opens a different one from the folder.
  var FILE_Q = FILE && FILE.writable ? '?file=' + encodeURIComponent(FILE.name) : '';
  var FOLDER = !!(FILE && FILE.folder);

  var K = {
    index:   'deckrun.decks.v1',
    deck:    'deckrun.deck.',
    current: 'deckrun.current.v1',
    theme:   'deckrun.theme.v1',
    head:    'deckrun.font.head.v1',
    body:    'deckrun.font.body.v1',
    template:'deckrun.template.v1',
    transition:'deckrun.transition.v1',
    split:   'deckrun.split.v1',
    mode:    'deckrun.mode.v1',
    nudge:   'deckrun.nudges.v1',
    chat:    'deckrun.chat.v1',
    chatModel: 'deckrun.chat-model.v1',
    // Superseded by the deck library, read once to migrate.
    oldDoc:  'presentmd.doc.v1',
    oldName: 'presentmd.name.v1'
  };

  // present-md was renamed to deckrun — the whole storage namespace moves
  // with it, so this copies it over once rather than orphaning every deck
  // already saved under the old prefix.
  var OLD_NS = {
    index: 'presentmd.decks.v1', deck: 'presentmd.deck.', current: 'presentmd.current.v1',
    theme: 'presentmd.theme.v1', head: 'presentmd.font.head.v1',
    body: 'presentmd.font.body.v1', split: 'presentmd.split.v1', mode: 'presentmd.mode.v1',
    nudge: 'presentmd.nudges.v1'
  };
  (function migrateNamespace() {
    if (lsGet(K.index, null) !== null) return;
    var oldIndexRaw = lsGet(OLD_NS.index, null);
    if (oldIndexRaw === null) return;
    lsSet(K.index, oldIndexRaw);
    lsDel(OLD_NS.index);
    try {
      var oldIndex = JSON.parse(oldIndexRaw);
      if (Object.prototype.toString.call(oldIndex) === '[object Array]') {
        oldIndex.forEach(function (entry) {
          if (!entry || !entry.id) return;
          var content = lsGet(OLD_NS.deck + entry.id, null);
          if (content !== null) {
            lsSet(K.deck + entry.id, content);
            lsDel(OLD_NS.deck + entry.id);
          }
        });
      }
    } catch (e) {}
    ['current', 'theme', 'head', 'body', 'split', 'mode', 'nudge'].forEach(function (slot) {
      var v = lsGet(OLD_NS[slot], null);
      if (v !== null) { lsSet(K[slot], v); lsDel(OLD_NS[slot]); }
    });
  })();

  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) { return false; }
  }

  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  // ── Deck library ───────────────────────────────────────────────────────
  // The index holds metadata only, so listing decks never reads their text.
  // Each deck's Markdown lives under its own key.

  function loadIndex() {
    try {
      var list = JSON.parse(lsGet(K.index, '[]'));
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    } catch (e) { return []; }
  }

  function saveIndex(list) {
    return lsSet(K.index, JSON.stringify(list));
  }

  function newDeckId() {
    return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function readDeck(id) { return lsGet(K.deck + id, ''); }

  function findDeck(id) {
    var list = loadIndex();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Returns the new deck's id, or null if this browser refused to store it. */
  function createDeck(name, content, kind, template, transition) {
    var id = newDeckId();
    if (!lsSet(K.deck + id, content)) return null;
    var list = loadIndex();
    list.unshift({
      id: id,
      name: name || 'untitled',
      kind: kind || 'markdown',
      slides: 0,
      chars: content.length,
      template: template || (typeof state !== 'undefined' && state.template ? state.template : D.template),
      transition: transition || (typeof state !== 'undefined' && state.transition ? state.transition : D.transition),
      at: Date.now()
    });
    if (!saveIndex(list)) { lsDel(K.deck + id); return null; }
    return id;
  }

  function uniqueName(base) {
    var list = loadIndex();
    var taken = {};
    list.forEach(function (d) { taken[d.name] = true; });
    if (!taken[base]) return base;
    for (var n = 2; n < 500; n++) if (!taken[base + ' ' + n]) return base + ' ' + n;
    return base;
  }

  function timeAgo(ts) {
    var mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  function updateDocTitle() {
    if ($('screen-start') && $('screen-start').classList.contains('is-on')) {
      document.title = 'deckrun \u00b7 start';
      return;
    }
    if ($('library') && $('library').classList.contains('is-on')) {
      document.title = 'deckrun \u00b7 library';
      return;
    }
    var name = ($('docname').value || '').trim();
    document.title = name ? name + ' \u00b7 deckrun' : 'deckrun \u00b7 editor';
  }

  /** One deck's metadata is refreshed from the editor on every save. */
  function touchCurrent() {
    var list = loadIndex();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.deckId) {
        list[i].name = $('docname').value.trim() || 'untitled';
        list[i].kind = state.kind;
        list[i].template = state.template;
        list[i].transition = state.transition;
        if (state.kind === 'html') {
          list[i].slides = 0;
          list[i].chars = srcHtml.value.length;
        } else {
          list[i].slides = state.slides.length;
          list[i].chars = src.value.length;
        }
        list[i].at = Date.now();
        break;
      }
    }
    updateDocTitle();
    return saveIndex(list);
  }

  function updateDeckCount() {
    $('deck-count').textContent = String(loadIndex().length);
  }

  /** The open document's own text, whichever kind it is. */
  function curValue() { return state.kind === 'html' ? srcHtml.value : src.value; }

  /** Relabels the export menu, since "Markdown" makes no sense for a doc. */
  function paintExportMenu() {
    var mdName = document.querySelector('#export-menu [data-export="md"] .menu__name');
    var mdHint = document.querySelector('#export-menu [data-export="md"] .menu__hint');
    var htmlName = document.querySelector('#export-menu [data-export="html"] .menu__name');
    var htmlHint = document.querySelector('#export-menu [data-export="html"] .menu__hint');
    if (state.kind === 'html') {
      mdName.textContent = 'Source';
      mdHint.textContent = 'the raw .html file';
      htmlName.textContent = 'Presenter Page';
      htmlHint.textContent = 'standalone, with the tool belt built in';
    } else {
      mdName.textContent = 'Markdown';
      mdHint.textContent = 'a plain .md file';
      htmlName.textContent = 'HTML';
      htmlHint.textContent = 'one self-contained page';
    }
  }

  /** Switches which document kind the chrome is dressed for. */
  function setDocKind(kind) {
    state.kind = kind === 'html' ? 'html' : 'markdown';
    document.documentElement.dataset.docKind = state.kind;
    paintExportMenu();
    if (inspect) inspect.reset();
  }

  // ── Themes ─────────────────────────────────────────────────────────────
  var THEMES = D.themes;
  var THEME_BY_ID = {};
  THEMES.forEach(function (t) { THEME_BY_ID[t.id] = t; });

  /** A theme id we can actually apply, whatever localStorage happens to hold. */
  function pickTheme(id) {
    return THEME_BY_ID[id] ? id : (THEME_BY_ID[D.theme] ? D.theme : THEMES[0].id);
  }

  var TEMPLATES = D.templates;
  var TEMPLATE_BY_ID = {};
  TEMPLATES.forEach(function (item) { TEMPLATE_BY_ID[item.id] = item; });

  function pickTemplate(id) {
    return TEMPLATE_BY_ID[id] ? id : (TEMPLATE_BY_ID[D.template] ? D.template : 'classic');
  }

  var TRANSITIONS = D.transitions;
  var TRANSITION_BY_ID = {};
  TRANSITIONS.forEach(function (item) { TRANSITION_BY_ID[item.id] = item; });

  function pickTransition(id) {
    return TRANSITION_BY_ID[id] ? id : (TRANSITION_BY_ID[D.transition] ? D.transition : 'slide');
  }

  var FACES = D.faces;
  var FACE_BY_ID = {};
  FACES.forEach(function (f) { FACE_BY_ID[f.id] = f; });

  /** null means "whatever the theme says", which is not a face id. */
  function pickFont(id) {
    return FACE_BY_ID[id] ? id : null;
  }

  // ── Elements ───────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var src = $('src'), hl = $('hl'), measure = $('measure');
  var frame = $('frame'), frameBox = $('frame-box'), stage = $('stage');
  var paneEdit = $('pane-edit'), panePrev = $('pane-prev'), divider = $('divider');
  var elChipSlides = $('chip-slides'), elSave = $('save-state'), elPos = $('pos'), elWords = $('words');
  var elCount = $('prev-count'), elScale = $('prev-scale');
  var elNotes = $('notes'), elNotesText = $('notes__text');
  var palette = $('palette'), palInput = $('pal-input'), palList = $('pal-list');
  var guide = $('guide'), guideBody = $('guide-body');
  var srcHtml = $('src-html'), frameHtml = $('frame-html');
  var slidePanel = null;
  var designer = null;
  var inspect = null;
  // The Markdown preview's source map: { src, slides }, from the parse that drew it.
  var mdMap = null;

  // ── State ──────────────────────────────────────────────────────────────
  var state = {
    deckId: null,
    kind: 'markdown',
    slides: [],
    notes: [],
    index: 0,
    mode: lsGet(K.mode, 'single') === 'grid' ? 'grid' : 'single',
    theme: pickTheme(lsGet(K.theme, D.theme)),
    head: pickFont(lsGet(K.head, D.fonts.head)),
    body: pickFont(lsGet(K.body, D.fonts.body)),
    template: pickTemplate(lsGet(K.template, D.template)),
    transition: pickTransition(lsGet(K.transition, D.transition)),
    frameReady: false,
    overflow: {},
    dismissed: {},
    activeNudge: null,
    nudgeShownAt: 0,
    seq: 0,
    inflight: null,
    tip: Math.floor(Math.random() * D.tips.length)
  };

  try {
    var saved = JSON.parse(lsGet(K.nudge, '[]'));
    if (saved && saved.length) saved.forEach(function (id) { state.dismissed[id] = true; });
  } catch (e) {}

  // ── Following the presented deck ───────────────────────────────────────
  // Presenting hands the deck tab this editor's session id (ps=... in the
  // URL), and the editor listens on that same channel: the preview and the
  // notes panel mirror the deck's current slide, so the editor window is the
  // presenter's screen and the deck tab is the projector. No second window
  // is involved.
  var FOLLOW_KEY = 'deckrun.presenter.session';
  var followSid = null;
  try { followSid = sessionStorage.getItem(FOLLOW_KEY); } catch (e) {}
  if (!followSid) {
    followSid = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    try { sessionStorage.setItem(FOLLOW_KEY, followSid); } catch (e) {}
  }
  var followChan = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('deckrun:' + followSid)
    : null;

  var following = false;   // the editor is mirroring the deck right now
  var expectingDeck = false; // a present just went out: follow the deck that answers
  var deckNotes = [];      // the deck's own notes, authoritative while following
  var followChipEl = $('follow-chip');
  var followSlideEl = $('follow-slide');

  /** The editor drives the deck as well as the preview: wherever the
      presenter lands in the editor, the deck goes there too. The deck echoes
      its state back over the same channel, which is what keeps both in step. */
  function announceIndex(i) {
    if (followChan) followChan.postMessage({ id: followSid, type: 'goto', index: i });
  }

  function followDeck(i) {
    var n = state.slides.length;
    if (!n) return;
    i = Math.max(0, Math.min(n - 1, i));
    var changed = i !== state.index;
    state.index = i;
    state.notes = deckNotes;
    followSlideEl.textContent = String(i + 1);
    if (changed) pushFrame();
    renderCounts();
  }

  if (followChan) {
    followChan.onmessage = function (e) {
      var m = e.data || {};
      if (m.id !== followSid) return;
      if (m.type === 'init') {
        deckNotes = m.notes || [];
        if (expectingDeck) {
          expectingDeck = false;
          following = true;
        }
        followChipEl.classList.toggle('hidden', !following);
      } else if (m.type === 'state') {
        if (following) followDeck(m.index);
      }
    };
    setInterval(function () {
      followChan.postMessage({ id: followSid, type: 'ready' });
    }, 2000);
  }

  followChipEl.addEventListener('click', function () {
    following = false;
    followChipEl.classList.add('hidden');
  });

  // ── Session highlights ─────────────────────────────────────────────────
  // Selecting text in either preview paints a highlight and, optionally,
  // hangs a comment off it. The store is the browser session's, shared with
  // the tab present opens, so the marks are already there on the projector.
  // Nothing is written to disk, and closing the browser clears the lot.
  function highlightKey() {
    if (FILE) return 'file:' + FILE.name;
    return state.deckId ? 'deck:' + state.deckId : 'deck:unsaved';
  }

  var hlSlides = null, hlDoc = null;
  if (window.deckrunHighlights) {
    var onHighlightWarn = function (message) { toast(message, 'warn'); };
    hlSlides = window.deckrunHighlights.mount({
      frame: frame,
      docKey: highlightKey(),
      scopes: 'slides',
      onWarn: onHighlightWarn
    });
    hlDoc = window.deckrunHighlights.mount({
      frame: frameHtml,
      docKey: highlightKey(),
      scopes: 'doc',
      onWarn: onHighlightWarn
    });
  }

  /** Points both previews at whichever document is now open. */
  function syncHighlightDoc() {
    var key = highlightKey();
    if (hlSlides) hlSlides.setDocKey(key);
    if (hlDoc) hlDoc.setDocKey(key);
  }

  // ── Toasts ─────────────────────────────────────────────────────────────
  function toast(message, kind, actionLabel, action) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    var text = document.createElement('span');
    text.style.flex = '1 1 auto';
    text.textContent = message;
    el.appendChild(text);
    if (actionLabel) {
      var btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.addEventListener('click', function () { action(); el.remove(); });
      el.appendChild(btn);
    }
    $('toasts').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, actionLabel ? 8000 : 4200);
  }

  // ── Markdown highlighting for the editor surface ───────────────────────
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var HOLD = '\\u0000';

  function inlineTokens(line) {
    var held = [];
    function hold(html) { held.push(html); return HOLD + (held.length - 1) + HOLD; }

    var out = esc(line);

    // Images first: the title attribute carries the layout directive.
    out = out.replace(/!\\[([^\\]\\n]*)\\]\\(([^\\s)]*)(\\s+"[^"\\n]*")?\\)/g, function (m, alt, url, title) {
      var html = '<span class="t-img">![' + alt + ']</span><span class="t-url">(' + url;
      if (title) html += '</span><span class="t-dir">' + title + '</span><span class="t-url">';
      return hold(html + ')</span>');
    });

    // Links.
    out = out.replace(/\\[([^\\]\\n]*)\\]\\(([^\\s)]*)(\\s+"[^"\\n]*")?\\)/g, function (m, label, url, title) {
      return hold('<span class="t-link">[' + label + ']</span><span class="t-url">(' + url +
        (title ? '</span><span class="t-dir">' + title + '</span><span class="t-url">' : '') + ')</span>');
    });

    // Inline code.
    out = out.replace(/\`[^\`\\n]+\`/g, function (m) { return hold('<span class="t-code">' + m + '</span>'); });

    // Raw HTML tags.
    out = out.replace(/&lt;\\/?[a-zA-Z][^&]{0,200}?&gt;/g, function (m) {
      return hold('<span class="t-html">' + m + '</span>');
    });

    out = out.replace(/\\*\\*[^*\\n]+\\*\\*/g, function (m) { return '<span class="t-strong">' + m + '</span>'; });
    out = out.replace(/(^|[^*\\w])(\\*[^*\\n]+\\*)/g, function (m, pre, body) {
      return pre + '<span class="t-em">' + body + '</span>';
    });
    out = out.replace(/(^|[^_\\w])(_[^_\\n]+_)/g, function (m, pre, body) {
      return pre + '<span class="t-em">' + body + '</span>';
    });

    return out.replace(new RegExp(HOLD + '(\\\\d+)' + HOLD, 'g'), function (m, i) { return held[+i]; });
  }

  function highlightMarkdown(text) {
    var lines = text.split('\\n');
    var out = [];
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // A pasted data URI is one enormous line. Colour it in a single pass so
      // typing stays responsive.
      if (line.length > 4000) {
        out.push('<span class="t-url">' + esc(line) + '</span>');
        continue;
      }

      if (/^\\s*\`\`\`/.test(line)) {
        out.push('<span class="t-fence">' + esc(line) + '</span>');
        inFence = !inFence;
        continue;
      }
      if (inFence) { out.push('<span class="t-codeline">' + esc(line) + '</span>'); continue; }
      if (/^[ \\t]*---[ \\t]*$/.test(line)) {
        out.push('<span class="t-sep">' + esc(line) + '</span>');
        continue;
      }
      if (/^\\s*<!--/.test(line)) {
        out.push('<span class="t-note">' + esc(line) + '</span>');
        continue;
      }

      var head = line.match(/^(#{1,6})\\s/);
      if (head) {
        var lvl = Math.min(head[1].length, 4);
        out.push('<span class="t-h' + lvl + '">' + inlineTokens(line) + '</span>');
        continue;
      }
      if (/^\\s*>/.test(line)) {
        out.push('<span class="t-quote">' + inlineTokens(line) + '</span>');
        continue;
      }
      if (/^\\s*\\|.*\\|\\s*$/.test(line)) {
        out.push('<span class="t-table">' + inlineTokens(line) + '</span>');
        continue;
      }
      var marker = line.match(/^(\\s*)([-*+]|\\d+[.)])(\\s+)/);
      if (marker) {
        out.push(marker[1] + '<span class="t-marker">' + esc(marker[2]) + '</span>' + marker[3] +
          inlineTokens(line.slice(marker[0].length)));
        continue;
      }
      out.push(inlineTokens(line));
    }

    return out.join('\\n') + '\\n';
  }

  function paint() { hl.innerHTML = highlightMarkdown(src.value); }

  function syncScroll() { hl.scrollTop = src.scrollTop; hl.scrollLeft = src.scrollLeft; }

  // ── Slide map, mirroring the server-side split ─────────────────────────
  var SEP = /\\r?\\n[ \\t]*---[ \\t]*\\r?\\n/g;

  function slideMap(of) {
    var text = of === undefined ? src.value : of, spans = [], last = 0, m;
    SEP.lastIndex = 0;
    while ((m = SEP.exec(text)) !== null) {
      spans.push([last, m.index]);
      last = m.index + m[0].length;
      SEP.lastIndex = last;
    }
    spans.push([last, text.length]);
    return spans.filter(function (s) { return text.slice(s[0], s[1]).trim().length > 0; });
  }

  function caretSlide() {
    var pos = src.selectionStart, spans = slideMap();
    for (var i = 0; i < spans.length; i++) {
      if (pos <= spans[i][1]) return i;
    }
    return Math.max(0, spans.length - 1);
  }

  function offsetTop(pos) {
    measure.textContent = src.value.slice(0, pos);
    var marker = document.createElement('span');
    marker.textContent = '\\u200b';
    measure.appendChild(marker);
    return marker.offsetTop;
  }

  function scrollCaretIntoView() {
    var top = offsetTop(src.selectionStart);
    var view = src.clientHeight;
    if (top < src.scrollTop + 40 || top > src.scrollTop + view - 80) {
      src.scrollTop = Math.max(0, top - view / 3);
      syncScroll();
    }
  }

  // ── Preview plumbing ───────────────────────────────────────────────────
  /** Dropped rather than queued until the frame is up: see the ready handler. */
  function post(msg) {
    if (!state.frameReady) return;
    frame.contentWindow.postMessage(msg, '*');
    if (inspect) inspect.refresh();
  }

  function pushFrame() {
    post({ type: 'render', slides: state.slides, index: state.index, mode: state.mode });
  }

  function layout() {
    var padding = 32;
    var w = Math.max(120, stage.clientWidth - padding);
    var h = Math.max(90, stage.clientHeight - padding);
    var scale;
    if (state.mode === 'single') {
      scale = Math.min(w / D.width, h / D.height);
      frame.style.height = D.height + 'px';
      frameBox.classList.add('is-single');
      frameBox.style.width = Math.round(D.width * scale) + 'px';
      frameBox.style.height = Math.round(D.height * scale) + 'px';
    } else {
      scale = w / D.width;
      var virtualH = Math.round(h / scale);
      frame.style.height = virtualH + 'px';
      frameBox.classList.remove('is-single');
      frameBox.style.width = Math.round(w) + 'px';
      frameBox.style.height = Math.round(h) + 'px';
    }
    frame.style.transform = 'scale(' + scale + ')';
    elScale.textContent = Math.round(scale * 100) + '%';
  }

  function renderCounts() {
    // The Markdown preview frame reports in even while an HTML doc is open.
    if (state.kind === 'html') { renderHtmlCounts(); return; }
    var n = state.slides.length;
    elChipSlides.textContent = n + (n === 1 ? ' slide' : ' slides');
    elCount.textContent = 'slide ' + (n ? state.index + 1 : 0) + ' / ' + n;
    $('btn-prev').disabled = state.index <= 0;
    $('btn-next').disabled = state.index >= n - 1;
    $('overflow-badge').classList.toggle(
      'is-on',
      state.mode === 'single' && !!state.overflow[state.index]
    );

    var note = state.notes[state.index];
    if (note) { elNotesText.textContent = note; elNotes.classList.add('is-on'); }
    else { elNotes.classList.remove('is-on'); }

    var words = src.value.trim() ? src.value.trim().split(/\\s+/).length : 0;
    elWords.textContent = words + (words === 1 ? ' word' : ' words');
  }

  function setIndex(i, moveCaret) {
    var n = state.slides.length;
    if (!n) return;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === state.index && !moveCaret) return;
    state.index = i;
    if (moveCaret) {
      var spans = slideMap();
      if (spans[i]) {
        var target = spans[i][0];
        while (/\\s/.test(src.value.charAt(target)) && target < spans[i][1]) target++;
        src.focus();
        src.setSelectionRange(target, target);
        scrollCaretIntoView();
        updateCaretUi();
      }
    }
    post({ type: 'index', index: state.index });
    announceIndex(state.index);
    renderCounts();
  }

  function updateCaretUi() {
    var before = src.value.slice(0, src.selectionStart);
    var lines = before.split('\\n');
    elPos.textContent = 'Ln ' + lines.length + ', Col ' + (lines[lines.length - 1].length + 1);
  }

  // ── Parse round-trip: the server owns the Markdown, so what you see here
  //    is byte-for-byte what deckrun file.md renders. ───────────────
  function refresh() {
    var mine = ++state.seq;
    var sent = src.value;
    if (state.inflight) state.inflight.abort();
    state.inflight = new AbortController();

    fetch('/__parse', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: sent,
      signal: state.inflight.signal
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (mine !== state.seq) return;
        state.slides = data.slides || [];
        mdMap = { src: sent, slides: data.map || [] };
        state.notes = data.notes || [];
        if (state.index >= state.slides.length) state.index = Math.max(0, state.slides.length - 1);
        pushFrame();
        renderCounts();
        evalNudges();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        toast('Preview failed: ' + err.message + '. Is the server still running?', 'err');
      });
  }

  // ── Autosave ───────────────────────────────────────────────────────────
  var saveTimer = null;
  // The file-mode write in flight, if any; it resolves true once it landed.
  var saving = null;

  function saveNow() {
    if (FILE) {
      if (!FILE.writable) return Promise.resolve(true);
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      var write = fetch('/__file' + FILE_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: curValue()
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          elSave.className = '';
          elSave.textContent = '';
          return true;
        })
        .catch(function () {
          elSave.className = 'err';
          elSave.textContent = 'not saved: write to ' + FILE.name + ' failed';
          return false;
        });
      saving = write;
      write.then(function () { if (saving === write) saving = null; });
      return write;
    }
    var ok = state.deckId && lsSet(K.deck + state.deckId, curValue()) && touchCurrent();
    if (ok) {
      elSave.className = '';
      elSave.textContent = '';
    } else if (state.deckId) {
      elSave.className = 'err';
      elSave.textContent = 'not saved: storage full';
      toast('This browser is out of room. Download this deck, or delete one you no longer need.', 'err', 'download', download);
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    // Writing a megabyte of content costs real time. Back off on big docs.
    saveTimer = setTimeout(saveNow, curValue().length > 1024 * 1024 ? 1500 : 500);
  }

  /**
   * Writes a pending edit now and settles once it is on disk, for anything
   * that reads the disk next: Claude, or the deck opened after a switch.
   * Resolves false when the write failed.
   */
  function flushSave() {
    if (slidePanel) slidePanel.flush();
    if (saveTimer) return saveNow();
    return saving || Promise.resolve(true);
  }

  // An edit still waiting on its write would go with the page, so leaving
  // mid-save asks first, and the write is already on its way.
  window.addEventListener('beforeunload', function (e) {
    if (!FILE || !FILE.writable) return;
    if (slidePanel) slidePanel.flush();
    if (!(saveTimer || saving)) return;
    if (saveTimer) saveNow();
    e.preventDefault();
    e.returnValue = '';
  });

  // ── Text insertion, undo-safe ──────────────────────────────────────────
  function typeText(text) {
    src.focus();
    var inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch (e) {}
    if (!inserted) {
      var s = src.selectionStart, e2 = src.selectionEnd;
      src.setRangeText(text, s, e2, 'end');
    }
  }

  var MARK = '\\u0001';

  function insertSnippet(sn) {
    if (!sn.insert) return;
    var s = src.selectionStart, e = src.selectionEnd;
    var sel = src.value.slice(s, e);

    var text = sn.insert.split('{caret}').join(MARK);
    if (text.indexOf(MARK) === -1 && !sel) text = text.split('{sel}').join(MARK);
    text = text.split('{sel}').join(sel);

    var prefix = '', suffix = '';
    if (sn.block) {
      var before = src.value.slice(0, s);
      if (before && !/\\n[ \\t]*$/.test(before)) prefix = '\\n\\n';
      else if (before && !/\\n[ \\t]*\\n[ \\t]*$/.test(before)) prefix = '\\n';
      var after = src.value.slice(e);
      if (after && !/^[ \\t]*\\n/.test(after)) suffix = '\\n';
    }

    var caretAt = text.indexOf(MARK);
    text = text.split(MARK).join('');
    var full = prefix + text + suffix;

    typeText(full);
    var pos = s + prefix.length + (caretAt === -1 ? text.length : caretAt);
    src.setSelectionRange(pos, pos);
    onInput();
    scrollCaretIntoView();
  }

  // ── Nudges: rules evaluated against the live document ──────────────────
  var NUDGE_RULES = [
    {
      id: 'overflow',
      sticky: true,
      test: function (ctx) {
        var i = state.index;
        return state.overflow[i] ? 'Slide ' + (i + 1) + ' overflows and is being clipped. Trim it, or split it with <code>---</code>.' : null;
      },
      snippet: 'slide-break'
    },
    {
      id: 'no-split',
      test: function (ctx) {
        return ctx.count === 1 && ctx.text.length > 420
          ? 'This is one long slide. Three dashes on their own line start the next one.'
          : null;
      },
      snippet: 'slide-break'
    },
    {
      id: 'untagged-fence',
      test: function (ctx) {
        return ctx.untaggedFence
          ? 'That code block has no language tag. Write <code>&#96;&#96;&#96;go</code> and it gets highlighted.'
          : null;
      },
      snippet: 'code-go'
    },
    {
      id: 'img-plain',
      test: function (ctx) {
        return ctx.plainImage
          ? 'Your image is inline. Add <code>"right"</code> after the URL and the slide splits: text left, image right.'
          : null;
      },
      snippet: 'img-right'
    },
    {
      id: 'no-notes',
      test: function (ctx) {
        return ctx.count >= 3 && !ctx.hasNotes
          ? 'Speaker notes live in <code>&#60;!-- notes: ... --&#62;</code>. They show under the preview and never reach the deck.'
          : null;
      },
      snippet: 'slide-notes'
    },
    {
      id: 'no-image',
      test: function (ctx) {
        return ctx.count >= 4 && !ctx.hasImage
          ? 'All text so far. An image path resolves against the folder you launched in: <code>![alt](diagram.png "right")</code>.'
          : null;
      },
      snippet: 'img-right'
    },
    {
      id: 'no-table',
      test: function (ctx) {
        return ctx.count >= 5 && !ctx.hasTable
          ? 'Numbers land harder in a table than in bullets. Zebra rows and an accented header come for free.'
          : null;
      },
      snippet: 'table'
    },
    {
      id: 'no-embed',
      test: function (ctx) {
        return ctx.count >= 6 && !ctx.hasEmbed
          ? 'Raw HTML works, so a YouTube or dashboard <code>&#60;iframe&#62;</code> can live on a slide, sized to 16:9.'
          : null;
      },
      snippet: 'embed-youtube'
    },
    {
      id: 'dense',
      test: function (ctx) {
        return ctx.denseSlide !== -1
          ? 'Slide ' + (ctx.denseSlide + 1) + ' is dense. Around seven bullets is the ceiling from the back row.'
          : null;
      },
      snippet: 'slide-break'
    },
    {
      id: 'huge',
      sticky: true,
      test: function (ctx) {
        return ctx.text.length > 3.5 * 1024 * 1024
          ? 'This deck is over 3.5 MB, near what a browser will autosave. Download a copy.'
          : null;
      },
      action: 'download'
    }
  ];

  function docContext() {
    var text = src.value;
    var lines = text.split('\\n');
    var untagged = false, inFence = false;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\\s*\`\`\`(.*)$/);
      if (!m) continue;
      if (!inFence && !m[1].trim()) untagged = true;
      inFence = !inFence;
    }

    var dense = -1;
    var spans = slideMap();
    for (var j = 0; j < spans.length; j++) {
      var body = text.slice(spans[j][0], spans[j][1]);
      if (body.indexOf('\`\`\`') !== -1) continue;
      var bullets = body.split('\\n').filter(function (l) { return /^\\s*([-*+]|\\d+[.)])\\s/.test(l); });
      if (bullets.length > 9) { dense = j; break; }
    }

    return {
      text: text,
      count: state.slides.length,
      untaggedFence: untagged,
      plainImage: /!\\[[^\\]]*\\]\\([^\\s)]+\\)(?!\\s*\\{)/.test(text) && !/!\\[[^\\]]*\\]\\([^\\s)]+\\s+"[^"]*"\\)/.test(text),
      hasNotes: /<!--\\s*notes?:/i.test(text),
      hasImage: /!\\[[^\\]]*\\]\\(/.test(text),
      hasTable: /^\\s*\\|.*\\|\\s*$/m.test(text),
      hasEmbed: /<(iframe|video)\\b/i.test(text),
      denseSlide: dense
    };
  }

  var bySnippetId = {};
  D.snippets.forEach(function (s) { bySnippetId[s.id] = s; });

  function evalNudges() {}
  function hideNudge() {}

  // ── Tips carousel ──────────────────────────────────────────────────────
  var tipTimer = null;

  function showTip(step) {
    state.tip = (state.tip + step + D.tips.length) % D.tips.length;
    $('tip-text').textContent = D.tips[state.tip];
  }

  function startTips() {
    showTip(0);
    if (tipTimer) clearInterval(tipTimer);
    tipTimer = setInterval(function () { showTip(1); }, 13000);
  }

  $('tip-prev').addEventListener('click', function () { showTip(-1); startTips(); });
  $('tip-next').addEventListener('click', function () { showTip(1); startTips(); });
  $('tipbar').addEventListener('mouseenter', function () { if (tipTimer) clearInterval(tipTimer); });
  $('tipbar').addEventListener('mouseleave', startTips);

  // ── Command palette ────────────────────────────────────────────────────
  var palRows = [], palSel = 0;

  function palFilter() {
    var q = palInput.value.trim().toLowerCase();
    var terms = q ? q.split(/\\s+/) : [];
    return D.snippets.filter(function (s) {
      if (!terms.length) return true;
      var hay = (s.label + ' ' + s.group + ' ' + s.hint + ' ' + s.syntax).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
  }

  function renderPalette() {
    var items = palFilter();
    palRows = items;
    if (palSel >= items.length) palSel = Math.max(0, items.length - 1);
    palList.innerHTML = '';

    if (!items.length) {
      var none = document.createElement('div');
      none.className = 'pal-group';
      none.textContent = 'nothing matches';
      palList.appendChild(none);
      return;
    }

    var group = null;
    items.forEach(function (item, i) {
      if (item.group !== group) {
        group = item.group;
        var head = document.createElement('div');
        head.className = 'pal-group';
        head.textContent = group;
        palList.appendChild(head);
      }
      var row = document.createElement('div');
      row.className = 'pal-row' + (i === palSel ? ' is-sel' : '');
      row.dataset.i = String(i);

      var main = document.createElement('div');
      main.className = 'pal-row__main';
      var label = document.createElement('div');
      label.className = 'pal-row__label';
      label.textContent = item.label;
      var hint = document.createElement('div');
      hint.className = 'pal-row__hint';
      hint.textContent = item.hint;
      main.appendChild(label);
      main.appendChild(hint);
      row.appendChild(main);

      if (item.syntax) {
        var syn = document.createElement('code');
        syn.className = 'pal-row__syntax';
        syn.textContent = item.syntax.split('\\\\n').join(' ');
        row.appendChild(syn);
      }
      if (item.keys) {
        var keys = document.createElement('span');
        keys.className = 'pal-row__keys';
        keys.textContent = item.keys.replace('Cmd', CMD);
        row.appendChild(keys);
      }

      row.addEventListener('mousemove', function () {
        if (palSel === i) return;
        palSel = i;
        var sel = palList.querySelector('.pal-row.is-sel');
        if (sel) sel.classList.remove('is-sel');
        row.classList.add('is-sel');
      });
      row.addEventListener('click', function () { palRun(i); });
      palList.appendChild(row);
    });
  }

  function palRun(i) {
    var item = palRows[i];
    if (!item) return;
    closeOverlays();
    if (item.action) runAction(item.action);
    else insertSnippet(item);
  }

  function palMove(step) {
    if (!palRows.length) return;
    palSel = (palSel + step + palRows.length) % palRows.length;
    renderPalette();
    var sel = palList.querySelector('.pal-row.is-sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    palette.classList.add('is-on');
    palInput.value = '';
    palSel = 0;
    renderPalette();
    palInput.focus();
  }

  palInput.addEventListener('input', function () { palSel = 0; renderPalette(); });
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); palRun(palSel); }
    else if (e.key === 'Escape') { e.preventDefault(); closeOverlays(); }
  });

  // ── Guide drawer ───────────────────────────────────────────────────────
  function buildGuide() {
    guideBody.innerHTML = '';
    D.groups.forEach(function (group) {
      var items = D.snippets.filter(function (s) { return s.group === group; });
      if (!items.length) return;

      var sec = document.createElement('section');
      sec.className = 'gsec';
      var head = document.createElement('h3');
      head.textContent = group;
      sec.appendChild(head);

      items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'gcard';

        var top = document.createElement('div');
        top.className = 'gcard__top';
        var label = document.createElement('span');
        label.className = 'gcard__label';
        label.textContent = item.label;
        top.appendChild(label);
        if (item.keys) {
          var keys = document.createElement('span');
          keys.className = 'gcard__keys';
          keys.textContent = item.keys.replace('Cmd', CMD);
          top.appendChild(keys);
        }
        card.appendChild(top);

        var hint = document.createElement('div');
        hint.className = 'gcard__hint';
        hint.textContent = item.hint;
        card.appendChild(hint);

        if (item.syntax) {
          var syn = document.createElement('pre');
          syn.className = 'gcard__syntax';
          syn.textContent = item.syntax.split('\\\\n').join('\\n');
          card.appendChild(syn);
        }

        var btn = document.createElement('button');
        btn.className = 'gcard__ins';
        btn.textContent = item.action ? 'run' : 'insert at caret';
        btn.addEventListener('click', function () {
          closeOverlays();
          if (item.action) runAction(item.action);
          else insertSnippet(item);
        });
        card.appendChild(btn);

        sec.appendChild(card);
      });

      guideBody.appendChild(sec);
    });
  }

  function closeOverlays(keepFocus) {
    // A dropdown outranks the picker in the stacking order, so it has to go
    // down too or it floats over the modal that just opened.
    closeMenu();
    palette.classList.remove('is-on');
    guide.classList.remove('is-on');
    $('library').classList.remove('is-on');
    if ($('themes').classList.contains('is-on')) closeThemes(true);
    updateDocTitle();
    if (!keepFocus) src.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
    el.addEventListener('click', function () { closeOverlays(); });
  });

  // ── Actions ────────────────────────────────────────────────────────────
  function slugify(s) {
    return (s || 'deck').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'deck';
  }

  function download() {
    var name = slugify($('docname').value);
    if (state.kind === 'html') {
      if (!/\\.html?$/.test(name)) name += '.html';
      saveBlob(name, new Blob([srcHtml.value], { type: 'text/html;charset=utf-8' }));
      toast('Downloaded ' + name);
      return;
    }
    if (!/\\.(md|markdown)$/.test(name)) name += '.md';
    saveBlob(name, new Blob([src.value], { type: 'text/markdown;charset=utf-8' }));
    toast('Downloaded ' + name);
  }

  function saveBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function isEmpty() {
    return state.kind === 'html' ? !srcHtml.value.trim() : !state.slides.length;
  }

  /** Downloads the built deck or doc as one standalone page. */
  function exportHtml() {
    if (isEmpty()) { toast('Nothing to export yet.', 'warn'); return; }
    var builder = state.kind === 'html' ? buildHtmlDoc : buildDeck;
    builder(false, true)
      .then(function (data) { return fetch(data.path); })
      .then(function (r) {
        if (!r.ok) throw new Error('server said ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var name = slugify($('docname').value).replace(/\\.(md|markdown|html?)$/, '') + '.html';
        saveBlob(name, new Blob([html], { type: 'text/html;charset=utf-8' }));
        toast('Downloaded ' + name + '. Fonts and highlighting load from a CDN, so it needs a connection.');
      })
      .catch(function (err) { toast('Could not export HTML: ' + err.message, 'err'); });
  }

  /**
   * An HTML deck as one .html file to hand around: hidden slides left out,
   * and the pictures and video it loads from its folder carried inside.
   */
  function downloadWebPage() {
    if (state.kind !== 'html' || !window.DRDesign) { exportHtml(); return; }
    if (isEmpty()) { toast('Nothing to export yet.', 'warn'); return; }
    var html = window.DRDesign.stripHidden(window.DRSlides.model(srcHtml.value));
    var refs = window.DRDesign.assetRefs(html);
    var wanted = {};
    refs.forEach(function (r) { wanted[r.url] = true; });
    var data = {}, missing = [];
    elSave.className = 'warn';
    elSave.textContent = 'packing the page';
    Promise.all(Object.keys(wanted).map(function (u) {
      return fetch(u)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .then(function (b) {
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { data[u] = String(fr.result); resolve(); };
            fr.onerror = function () { missing.push(u); resolve(); };
            fr.readAsDataURL(b);
          });
        })
        .catch(function () { missing.push(u); });
    }))
      .then(function () {
        var out = '', pos = 0;
        refs.forEach(function (r) {
          if (!data[r.url]) return;
          out += html.slice(pos, r.start) + data[r.url];
          pos = r.end;
        });
        out += html.slice(pos);
        var name = slugify($('docname').value).replace(/\\.(md|markdown|html?)$/, '') + '.html';
        saveBlob(name, new Blob([out], { type: 'text/html;charset=utf-8' }));
        toast('Downloaded ' + name + (missing.length
          ? '. Not found, so still linked: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') + '.'
          : (refs.length ? ', with its pictures inside.' : '.')), missing.length ? 'warn' : null);
      })
      .then(function () {
        elSave.className = '';
        elSave.textContent = '';
        scheduleSave();
      });
  }

  /** Slide k as a PNG at twice its size, drawn by the same headless browser as the PDF. */
  function downloadSlidePng(k) {
    if (state.kind !== 'html' || !window.DRSlides) return;
    var m = window.DRSlides.model(srcHtml.value);
    if (!m.slides[k]) return;
    var size = designer ? designer.size() : { w: 1280, h: 720 };
    elSave.className = 'warn';
    elSave.textContent = 'drawing slide ' + (k + 1);
    fetch('/__png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: window.DRSlides.isolate(m, k), width: size.w, height: size.h, scale: 2 })
    })
      .then(function (r) {
        if (r.ok) return r.blob();
        return r.json().then(
          function (info) { throw new Error((info && info.detail) || 'server said ' + r.status); },
          function () { throw new Error('server said ' + r.status); }
        );
      })
      .then(function (blob) {
        var name = slugify($('docname').value).replace(/\\.(md|markdown|html?)$/, '') + '-slide-' + (k + 1) + '.png';
        saveBlob(name, blob);
        toast('Downloaded ' + name + '.');
      })
      .catch(function (err) { toast('Could not draw the slide: ' + err.message, 'err'); })
      .then(function () {
        elSave.className = '';
        elSave.textContent = '';
        scheduleSave();
      });
  }

  /**
   * Exports a real PDF file. The server drives a headless browser, so nobody
   * has to find the landscape and background-graphics settings in a dialog.
   * Falls back to the dialog only when the machine has no browser to drive.
   */
  var pdfInFlight = false;

  function exportPdf() {
    if (isEmpty()) { toast('Nothing to export yet.', 'warn'); return; }
    if (pdfInFlight) { toast('Already building a PDF.'); return; }
    pdfInFlight = true;
    elSave.className = 'warn';
    elSave.textContent = 'building the PDF';

    var pdfUrl = state.kind === 'html' ? '/__pdf-doc' : '/__pdf';
    var pdfBody = state.kind === 'html'
      ? { html: srcHtml.value, title: $('docname').value }
      : {
          markdown: src.value,
          theme: state.theme,
          head: state.head,
          body: state.body,
          template: state.template,
          transition: state.transition,
          title: $('docname').value
        };

    fetch(pdfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pdfBody)
    })
      .then(function (r) {
        if (r.status === 501) {
          return r.json().then(function (info) {
            printFallback(info && info.detail);
            return null;
          });
        }
        if (!r.ok) {
          return r.json().then(
            function (info) { throw new Error((info && info.detail) || 'server said ' + r.status); },
            function () { throw new Error('server said ' + r.status); }
          );
        }
        return r.blob();
      })
      .then(function (blob) {
        if (!blob) return;
        var name = slugify($('docname').value).replace(/\\.(md|markdown|html?)$/, '') + '.pdf';
        saveBlob(name, blob);
        toast('Downloaded ' + name + (state.kind === 'html' ? '.' : ', one 16:9 page per slide.'));
      })
      .catch(function (err) { toast('Could not export the PDF: ' + err.message, 'err'); })
      .then(function () {
        pdfInFlight = false;
        elSave.className = '';
        elSave.textContent = '';
        scheduleSave();
      });
  }

  /** No local browser to drive: hand the deck or doc to the print dialog instead. */
  function printFallback(detail) {
    var tab = window.open('about:blank', '_blank');
    var builder = state.kind === 'html' ? buildHtmlDoc : buildDeck;
    builder(true)
      .then(function (data) {
        var url = location.origin + data.path;
        if (!tab) {
          toast('Allow pop-ups, or press Cmd P, to save a PDF.', 'warn', 'open here', function () { location.href = url; });
          return;
        }
        tab.location.replace(url);
        toast((detail || 'No local browser to render with.') + ' Using the print dialog instead, which is already set to landscape.', 'warn');
      })
      .catch(function (err) {
        if (tab) tab.close();
        toast('Could not build the page: ' + err.message, 'err');
      });
  }

  function buildDeck(forPrint, standalone) {
    return fetch('/__present', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: src.value,
        theme: state.theme,
        head: state.head,
        body: state.body,
        template: state.template,
        transition: state.transition,
        title: $('docname').value,
        print: !!forPrint,
        standalone: !!standalone
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('server said ' + r.status);
      return r.json();
    });
  }

  /** from: { html, start } presents a tagged copy opened at one slide. */
  function buildHtmlDoc(forPrint, from) {
    return fetch('/__present-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: from ? from.html : srcHtml.value,
        start: from ? from.start : undefined,
        theme: state.theme,
        title: $('docname').value,
        print: !!forPrint
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('server said ' + r.status);
      return r.json();
    });
  }

  /**
   * Presents an HTML deck from slide k. Hidden slides are not in the
   * presented deck at all, so a hidden k starts at the next one shown.
   */
  function presentFrom(k) {
    if (state.kind !== 'html' || !window.DRSlides) { present(); return; }
    var d = window.DRSlides.decoratePresent(window.DRSlides.model(srcHtml.value));
    if (!d.visible.length) { toast('Every slide is hidden, so there is nothing to present.', 'warn'); return; }
    var at = 0;
    while (at < d.visible.length - 1 && d.visible[at] < k) at++;
    present({ html: d.html, start: at });
  }

  function present(from) {
    if (isEmpty()) { toast('Nothing to present yet.', 'warn'); return; }
    // Bound straight to a click as well, where the argument is the event.
    from = from && typeof from.start === 'number' ? from : null;
    // A deck presents as a tagged copy from its first slide, so its slide transitions can play.
    if (!from && state.kind === 'html' && slidePanel && slidePanel.count()) { presentFrom(0); return; }
    expectingDeck = true;
    var tab = window.open('about:blank', '_blank');
    (state.kind === 'html' ? buildHtmlDoc(false, from) : buildDeck(false))
      .then(function (data) {
        var url = location.origin + data.path +
          (data.path.indexOf('?') >= 0 ? '&' : '?') + 'ps=' + followSid +
          '&hl=' + encodeURIComponent(highlightKey());
        if (tab) tab.location.replace(url);
        else toast('Allow pop-ups to present in a new tab.', 'warn', 'present here', function () { location.href = url; });
      })
      .catch(function (err) {
        if (tab) tab.close();
        toast('Could not build the page: ' + err.message, 'err');
      });
  }

  /**
   * Applies a theme everywhere at once: the editor chrome, the preview iframe,
   * and the decor attribute the backdrop patterns key off. A remember of false
   * means the picker is only previewing, so arrowing past a theme never
   * overwrites the one the user actually chose.
   */
  function setTheme(next, remember) {
    var id = pickTheme(next);
    state.theme = id;
    document.documentElement.dataset.theme = id;
    document.documentElement.dataset.decor = THEME_BY_ID[id].decor;
    if (remember !== false) lsSet(K.theme, id);
    pushLook();
  }

  function setTemplate(next, remember) {
    var id = pickTemplate(next);
    state.template = id;
    document.documentElement.dataset.template = id;
    if (remember !== false) {
      lsSet(K.template, id);
      scheduleSave();
    }
    pushLook();
    paintTemplateMenu();
  }

  function setTransition(next, remember) {
    var id = pickTransition(next);
    state.transition = id;
    document.documentElement.dataset.transition = id;
    if (remember !== false) {
      lsSet(K.transition, id);
      scheduleSave();
    }
    pushLook();
    paintTemplateMenu();
  }

  /**
   * Heading and body faces are chosen separately, and either can be handed
   * back to the theme by picking nothing. Passing null is what clears it.
   */
  function setFont(slot, id, remember) {
    if (slot !== 'head' && slot !== 'body') return;
    var next = pickFont(id);
    state[slot] = next;
    if (remember !== false) {
      // '' rather than a missing key, so a cleared override survives a reload
      // instead of falling back to whatever the CLI started with.
      lsSet(slot === 'head' ? K.head : K.body, next || '');
    }
    pushLook();
    paintFontMenu();
  }

  function syncHtmlFrameTheme() {
    if (!frameHtml) return;
    try {
      var root = frameHtml.contentDocument && frameHtml.contentDocument.documentElement;
      if (root) {
        root.dataset.theme = state.theme;
        root.dataset.decor = decorOf(state.theme);
        root.dataset.template = state.template;
        root.dataset.transition = state.transition;
        if (state.head) root.dataset.head = state.head; else delete root.dataset.head;
        if (state.body) root.dataset.body = state.body; else delete root.dataset.body;
      }
    } catch (e) {}
    try {
      if (frameHtml.contentWindow) {
        frameHtml.contentWindow.postMessage({
          type: 'theme',
          theme: state.theme,
          head: state.head,
          body: state.body,
          template: state.template,
          transition: state.transition
        }, '*');
      }
    } catch (e) {}
  }

  /** One message for all four, since the preview applies them to one root. */
  function pushLook() {
    post({
      type: 'theme',
      theme: state.theme,
      head: state.head,
      body: state.body,
      template: state.template,
      transition: state.transition
    });
    syncHtmlFrameTheme();
    paintThemeButton();
    paintTemplateMenu();
  }

  function faceLabel(id) {
    return id && FACE_BY_ID[id] ? FACE_BY_ID[id].name : 'theme';
  }

  function buildFontMenu() {
    [['head', 'ff-head'], ['body', 'ff-body']].forEach(function (pair) {
      var slot = pair[0];
      var host = $(pair[1]);
      host.innerHTML = '';

      host.appendChild(fontRow(slot, null, 'theme default', null));

      var lastKind = null;
      FACES.forEach(function (f) {
        if (f.kind !== lastKind) {
          lastKind = f.kind;
          var head = document.createElement('div');
          head.className = 'ff-col__title';
          head.textContent = f.kind;
          host.appendChild(head);
        }
        host.appendChild(fontRow(slot, f.id, f.name, f));
      });
    });
    paintFontMenu();
  }

  function fontRow(slot, id, label, face) {
    var b = document.createElement('button');
    b.className = 'ff-row' + (id ? '' : ' ff-row--auto');
    b.dataset.slot = slot;
    if (id) b.dataset.font = id;

    var name = document.createElement('span');
    name.className = 'ff-row__name';
    name.textContent = label;
    if (face) name.style.fontFamily = face.stack;
    b.appendChild(name);

    return b;
  }

  function paintFontMenu() {
    Array.prototype.forEach.call($('font-menu').querySelectorAll('.ff-row'), function (b) {
      var slot = b.dataset.slot;
      b.classList.toggle('is-on', (b.dataset.font || null) === state[slot]);
    });
    var custom = state.head || state.body;
    $('font-label').textContent = custom
      ? faceLabel(state.head) + ' / ' + faceLabel(state.body)
      : 'font';
    $('btn-font').title = 'Heading ' + faceLabel(state.head) +
      ' · body ' + faceLabel(state.body);
  }

  function paintThemeButton() {
    var t = THEME_BY_ID[state.theme];
    $('theme-label').textContent = t ? t.label : 'theme';
    $('btn-theme').title = t ? t.label + ' — ' + t.blurb : 'Pick a theme';
  }

  function optionRow(kind, item) {
    var b = document.createElement('button');
    b.dataset[kind] = item.id;
    var name = document.createElement('span');
    name.className = 'menu__name';
    name.textContent = item.label;
    var hint = document.createElement('span');
    hint.className = 'menu__hint';
    hint.textContent = item.blurb;
    b.appendChild(name);
    b.appendChild(hint);
    return b;
  }

  function buildTemplateMenu() {
    var templateHost = $('template-list');
    var transitionHost = $('transition-list');
    templateHost.innerHTML = '';
    transitionHost.innerHTML = '';
    TEMPLATES.forEach(function (item) { templateHost.appendChild(optionRow('template', item)); });
    TRANSITIONS.forEach(function (item) { transitionHost.appendChild(optionRow('transition', item)); });
    paintTemplateMenu();
  }

  function paintTemplateMenu() {
    var menu = $('template-menu');
    if (!menu) return;
    Array.prototype.forEach.call(menu.querySelectorAll('[data-template]'), function (b) {
      b.classList.toggle('is-on', b.dataset.template === state.template);
    });
    Array.prototype.forEach.call(menu.querySelectorAll('[data-transition]'), function (b) {
      b.classList.toggle('is-on', b.dataset.transition === state.transition);
    });
    var current = TEMPLATE_BY_ID[state.template];
    $('template-label').textContent = current ? current.label : 'template';
    $('btn-template').title = (current ? current.blurb : 'Composition template') +
      ' · transition ' + state.transition;
  }

  // ── Theme picker ───────────────────────────────────────────────────────
  var themeCards = [];
  var themeSel = 0;
  var themeCommitted = null;

  /** A slide in miniature, painted with the theme's own palette and faces. */
  function themeThumb(t) {
    var c = t.colors;
    var wrap = document.createElement('div');
    wrap.className = 'th-thumb';
    wrap.style.background = c.crust;

    var glow = document.createElement('div');
    glow.className = 'th-thumb__glow';
    glow.style.background = 'radial-gradient(circle, ' + c.accent + '2e 0%, transparent 68%)';
    wrap.appendChild(glow);

    var title = document.createElement('div');
    title.className = 'th-thumb__title';
    title.textContent = 'Aa';
    title.style.fontFamily = t.fonts.display;
    title.style.fontWeight = '700';
    title.style.color = c.accent;
    wrap.appendChild(title);

    var rule = document.createElement('div');
    rule.className = 'th-thumb__rule';
    rule.style.background = 'linear-gradient(90deg, ' + c.accent + ', ' + c.accent2 + ')';
    wrap.appendChild(rule);

    [88, 70, 52].forEach(function (pct, i) {
      var line = document.createElement('div');
      line.className = 'th-thumb__line';
      line.style.width = pct + '%';
      line.style.background = i === 0 ? c.subtext1 : c.overlay1;
      line.style.opacity = i === 0 ? '0.85' : '0.5';
      wrap.appendChild(line);
    });

    var code = document.createElement('div');
    code.className = 'th-thumb__code';
    code.textContent = 'const deck = md';
    code.style.fontFamily = t.fonts.mono;
    code.style.background = c.mantle;
    code.style.color = c.accent3;
    code.style.border = '1px solid ' + c.surface0;
    wrap.appendChild(code);

    return wrap;
  }

  function themeCard(t) {
    var card = document.createElement('button');
    card.className = 'th-card' + (t.id === state.theme ? ' is-current' : '');
    card.dataset.theme = t.id;
    card.appendChild(themeThumb(t));

    var meta = document.createElement('div');
    meta.className = 'th-meta';

    var top = document.createElement('div');
    top.className = 'th-meta__top';
    var name = document.createElement('span');
    name.className = 'th-meta__name';
    name.textContent = t.label;
    var mood = document.createElement('span');
    mood.className = 'th-meta__mood';
    mood.textContent = t.mood;
    top.appendChild(name);
    top.appendChild(mood);

    var blurb = document.createElement('div');
    blurb.className = 'th-meta__blurb';
    blurb.textContent = t.blurb;

    meta.appendChild(top);
    meta.appendChild(blurb);
    card.appendChild(meta);
    return card;
  }

  function buildThemePicker() {
    var host = $('th-list');
    host.innerHTML = '';
    themeCards = [];

    [['dark', 'dark'], ['light', 'light']].forEach(function (pair) {
      var list = THEMES.filter(function (t) { return t.mood === pair[0]; });
      if (!list.length) return;

      var label = document.createElement('div');
      label.className = 'th-group';
      label.textContent = pair[1];
      host.appendChild(label);

      var grid = document.createElement('div');
      grid.className = 'th-grid';
      list.forEach(function (t) {
        var card = themeCard(t);
        // Hovering previews too, so the mouse gets the same instant feedback
        // as the arrow keys.
        card.addEventListener('mouseenter', function () { selectTheme(themeCards.indexOf(card)); });
        card.addEventListener('click', function () { selectTheme(themeCards.indexOf(card)); commitTheme(); });
        grid.appendChild(card);
        themeCards.push(card);
      });
      host.appendChild(grid);
    });
  }

  function selectTheme(i) {
    if (i < 0 || i >= themeCards.length) return;
    themeSel = i;
    themeCards.forEach(function (c, n) { c.classList.toggle('is-sel', n === i); });
    setTheme(themeCards[i].dataset.theme, false);
  }

  function openThemes() {
    closeOverlays(true);
    themeCommitted = state.theme;
    buildThemePicker();
    var at = 0;
    themeCards.forEach(function (c, n) { if (c.dataset.theme === state.theme) at = n; });
    $('themes').classList.add('is-on');
    selectTheme(at);
    themeCards[themeSel].scrollIntoView({ block: 'nearest' });
    src.blur();
  }

  function commitTheme() {
    themeCommitted = state.theme;
    lsSet(K.theme, state.theme);
    closeThemes();
    var t = THEME_BY_ID[state.theme];
    toast('Theme set to ' + (t ? t.label : state.theme) + '.');
  }

  /** Leaving without choosing puts back whatever was on when the picker opened. */
  function closeThemes(restore) {
    if (restore && themeCommitted && themeCommitted !== state.theme) {
      setTheme(themeCommitted, true);
    }
    $('themes').classList.remove('is-on');
    themeCards.forEach(function (c) { c.classList.remove('is-sel'); });
  }

  function themesOpen() { return $('themes').classList.contains('is-on'); }

  function setMode(next) {
    state.mode = next;
    lsSet(K.mode, next);
    $('seg-single').classList.toggle('is-on', next === 'single');
    $('seg-grid').classList.toggle('is-on', next === 'grid');
    layout();
    pushFrame();
  }

  /** The status-bar counters' HTML-doc analog: chars and caret position. */
  function renderHtmlCounts() {
    var slideCount = slidePanel ? slidePanel.count() : 0;
    elChipSlides.textContent = (slideCount ? slideCount + (slideCount === 1 ? ' slide · ' : ' slides · ') : '') +
      srcHtml.value.length + ' chars';
    var before = srcHtml.value.slice(0, srcHtml.selectionStart || 0);
    var lines = before.split('\\n');
    elPos.textContent = 'Ln ' + lines.length + ', Col ' + (lines[lines.length - 1].length + 1);
    elWords.textContent = '';
  }

  /** Load a deck or doc into the editor, saving whatever is open first. */
  /** File mode owns the session: the browser library stays out of the way. */
  function fileModeBlocks() {
    if (!FILE) return false;
    toast('Editing ' + FILE.name + ' — the browser library is available when deckrun runs without a file.', 'warn');
    return true;
  }

  function openDeck(id, announce) {
    if (fileModeBlocks()) return;
    var meta = findDeck(id);
    if (!meta) { toast('That deck is gone.', 'warn'); return; }
    if (state.deckId && id !== state.deckId) saveNow();
    state.deckId = id;
    lsSet(K.current, id);
    syncHighlightDoc();
    setDocKind(meta.kind || 'markdown');
    setTemplate(meta.template || state.template, true);
    setTransition(meta.transition || state.transition, true);
    $('docname').value = meta.name;
    updateDocTitle();
    updateDeckCount();
    elSave.className = '';
    elSave.textContent = '';

    if (state.kind === 'html') {
      srcHtml.value = readDeck(id);
      if (slidePanel) slidePanel.reset();
      if (designer) designer.reset();
      reloadPreview();
      renderHtmlCounts();
      if (announce) toast('Opened ' + meta.name);
      srcHtml.focus();
      return;
    }

    src.value = readDeck(id);
    src.setSelectionRange(0, 0);
    src.scrollTop = 0;
    state.index = 0;
    state.overflow = {};
    paint();
    syncScroll();
    updateCaretUi();
    refresh();
    if (announce) toast('Opened ' + meta.name);
    src.focus();
  }

  function noRoom() {
    toast('This browser has no room for another deck. Delete one, or download this one first.', 'err');
  }

  function newDeck() {
    if (fileModeBlocks()) return;
    saveNow();
    var id = createDeck(uniqueName('untitled'), '', 'markdown');
    if (!id) { noRoom(); return; }
    openDeck(id);
    toast('New deck. Press ' + CMD + ' K to see what you can add.');
  }

  function duplicateDeck() {
    if (fileModeBlocks()) return;
    saveNow();
    var meta = findDeck(state.deckId);
    var id = createDeck(uniqueName((meta ? meta.name : 'deck') + ' copy'), curValue(), state.kind);
    if (!id) { noRoom(); return; }
    openDeck(id);
    toast('Duplicated');
  }

  function deleteDeck(id) {
    if (fileModeBlocks()) return;
    var meta = findDeck(id);
    if (!meta) return;
    if (!confirm('Delete "' + meta.name + '"? This cannot be undone, and it is only in this browser.')) return;

    var list = loadIndex().filter(function (d) { return d.id !== id; });
    saveIndex(list);
    lsDel(K.deck + id);
    if (window.deckrunHighlights) window.deckrunHighlights.forget('deck:' + id);

    if (id === state.deckId) {
      if (list.length) {
        openDeck(list[0].id);
      } else {
        var fresh = createDeck('deck', '', 'markdown');
        if (fresh) openDeck(fresh);
      }
    }
    updateDeckCount();
    renderLibrary();
    toast('Deleted ' + meta.name);
  }

  // ── Library panel ──────────────────────────────────────────────────────
  var libRows = [], libSel = 0;

  /** Most recently touched first, the useful order for a switcher. */
  function libraryList() {
    return loadIndex().slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  function renderLibrary() {
    var list = libraryList();
    libRows = list;
    if (libSel >= list.length) libSel = Math.max(0, list.length - 1);
    var host = $('lib-list');
    host.innerHTML = '';

    list.forEach(function (deck, i) {
      var row = document.createElement('div');
      row.className = 'lib-row' + (i === libSel ? ' is-sel' : '') +
        (deck.id === state.deckId ? ' is-current' : '');

      var main = document.createElement('div');
      main.className = 'lib-row__main';
      var name = document.createElement('div');
      name.className = 'lib-row__name';
      name.textContent = deck.name + (deck.id === state.deckId ? '  (open)' : '');
      var meta = document.createElement('div');
      meta.className = 'lib-row__meta';
      var kind = deck.kind || 'markdown';
      if (kind === 'html') {
        var chars = deck.id === state.deckId ? srcHtml.value.length : deck.chars;
        meta.textContent = 'html' +
          '  \u00b7  ' + Math.max(1, Math.round((chars || 0) / 1024)) + ' KB' +
          '  \u00b7  ' + timeAgo(deck.at || Date.now());
      } else {
        var slides = deck.id === state.deckId ? state.slides.length : deck.slides;
        meta.textContent = (slides || 0) + (slides === 1 ? ' slide' : ' slides') +
          '  \u00b7  ' + Math.max(1, Math.round((deck.chars || 0) / 1024)) + ' KB' +
          '  \u00b7  ' + timeAgo(deck.at || Date.now());
      }
      main.appendChild(name);
      main.appendChild(meta);
      row.appendChild(main);

      var acts = document.createElement('div');
      acts.className = 'lib-row__acts';

      var dupe = document.createElement('button');
      dupe.textContent = 'duplicate';
      dupe.addEventListener('click', function (e) {
        e.stopPropagation();
        if (deck.id === state.deckId) { duplicateDeck(); renderLibrary(); return; }
        var id = createDeck(
          uniqueName(deck.name + ' copy'),
          readDeck(deck.id),
          deck.kind || 'markdown',
          deck.template || state.template,
          deck.transition || state.transition
        );
        if (!id) { noRoom(); return; }
        updateDeckCount();
        renderLibrary();
        toast('Duplicated ' + deck.name);
      });
      acts.appendChild(dupe);

      var del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'delete';
      del.addEventListener('click', function (e) { e.stopPropagation(); deleteDeck(deck.id); });
      acts.appendChild(del);

      row.appendChild(acts);
      row.addEventListener('mousemove', function () {
        if (libSel === i) return;
        libSel = i;
        var sel = host.querySelector('.lib-row.is-sel');
        if (sel) sel.classList.remove('is-sel');
        row.classList.add('is-sel');
      });
      row.addEventListener('click', function () { closeOverlays(); openDeck(deck.id, true); });
      host.appendChild(row);
    });
  }

  function openLibrary() {
    if (fileModeBlocks()) return;
    var list = libraryList();
    libSel = 0;
    for (var i = 0; i < list.length; i++) if (list[i].id === state.deckId) libSel = i;
    renderLibrary();
    $('library').classList.add('is-on');
    updateDocTitle();
  }

  $('lib-new').addEventListener('click', function () { closeOverlays(); showStartScreen(); });

  $('btn-decks').addEventListener('click', openLibrary);

  // ── Start screen ─────────────────────────────────────────────────────
  // Shown on a true first run, and whenever "new" is chosen explicitly from
  // the library — never on an ordinary launch that has a deck to resume.
  var startTemplate = state.template;
  var startTransition = state.transition;

  function paintStartOptions() {
    Array.prototype.forEach.call($('start-template-list').querySelectorAll('[data-template]'), function (b) {
      b.classList.toggle('is-on', b.dataset.template === startTemplate);
    });
    Array.prototype.forEach.call($('start-transition-list').querySelectorAll('[data-transition]'), function (b) {
      b.classList.toggle('is-on', b.dataset.transition === startTransition);
    });
  }

  function buildStartOptions() {
    var templateHost = $('start-template-list');
    var transitionHost = $('start-transition-list');
    templateHost.innerHTML = '';
    transitionHost.innerHTML = '';
    TEMPLATES.forEach(function (item) {
      var b = document.createElement('button');
      b.className = 'start-choice';
      b.dataset.template = item.id;
      b.textContent = item.label;
      b.title = item.blurb;
      b.addEventListener('click', function () { startTemplate = item.id; paintStartOptions(); });
      templateHost.appendChild(b);
    });
    TRANSITIONS.forEach(function (item) {
      var b = document.createElement('button');
      b.className = 'start-choice';
      b.dataset.transition = item.id;
      b.textContent = item.label;
      b.title = item.blurb;
      b.addEventListener('click', function () { startTransition = item.id; paintStartOptions(); });
      transitionHost.appendChild(b);
    });
    paintStartOptions();
  }

  function showStartScreen() {
    startTemplate = state.template;
    startTransition = state.transition;
    paintStartOptions();
    $('start-lib').classList.toggle('is-disabled', !loadIndex().length);
    $('screen-start').classList.add('is-on');
    updateDocTitle();
  }

  function hideStartScreenSilently() {
    $('screen-start').classList.remove('is-on');
    updateDocTitle();
  }

  /** Escape/backdrop close. With nothing open yet, that would be a dead end,
      so the one specified fallback is a blank Markdown deck. */
  function hideStartScreen(fallbackIfEmpty) {
    hideStartScreenSilently();
    if (fallbackIfEmpty && !state.deckId) startNewMarkdown();
  }

  function startNewMarkdown() {
    setTemplate(startTemplate, true);
    setTransition(startTransition, true);
    var id = createDeck(uniqueName('untitled'), D.welcome, 'markdown', startTemplate, startTransition);
    hideStartScreenSilently();
    if (!id) {
      // Storage refuses even a first write: use the deck unsaved rather than
      // leaving the editor with nothing open.
      state.deckId = newDeckId();
      setDocKind('markdown');
      src.value = D.welcome;
      $('docname').value = 'deck';
      src.setSelectionRange(0, 0);
      src.scrollTop = 0;
      paint();
      syncScroll();
      updateCaretUi();
      refresh();
      updateDeckCount();
      elSave.className = 'err';
      elSave.textContent = 'this browser blocks local storage';
      setTimeout(function () {
        toast('This browser will not let the editor save anything. Download your deck to keep it.', 'err', 'download', download);
      }, 700);
      src.focus();
      return;
    }
    openDeck(id);
    setTimeout(function () {
      toast('This deck is yours to overwrite. Press ' + CMD + ' K to see every layout and style.', null, 'open the guide', function () { runAction('guide'); });
    }, 900);
  }

  function startOpenLibrary() {
    if (!loadIndex().length) return;
    hideStartScreenSilently();
    openLibrary();
  }

  /** Fetches a public URL server-side (sidesteps CORS) and opens it as a new Markdown deck or HTML doc. */
  function loadHtmlUrl() {
    var input = $('start-html-url');
    var raw = input.value.trim();
    if (!raw) { input.focus(); return; }
    var url;
    try { url = new URL(raw); } catch (err) { toast('Not a valid URL.', 'err'); return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      toast('URL must be http or https.', 'err');
      return;
    }
    var btn = $('start-html-url-go');
    btn.disabled = true;
    fetch('/__fetch-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.toString() }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.detail || body.error || 'could not load that URL');
          return body;
        });
      })
      .then(function (body) {
        saveNow();
        var name = uniqueName(body.title || url.hostname);
        var kind = body.kind || (body.markdown ? 'markdown' : 'html');
        var content = kind === 'markdown' ? (body.markdown || body.content || '') : (body.html || body.content || '');
        var id = createDeck(
          name,
          content,
          kind,
          kind === 'markdown' ? startTemplate : state.template,
          kind === 'markdown' ? startTransition : state.transition
        );
        if (!id) { noRoom(); return; }
        input.value = '';
        hideStartScreenSilently();
        openDeck(id);
        toast('Loaded ' + (kind === 'markdown' ? 'Markdown deck' : 'HTML doc') + ' from ' + url.hostname);
      })
      .catch(function (err) { toast('Could not load URL: ' + err.message, 'err'); })
      .then(function () { btn.disabled = false; });
  }

  $('start-md-blank').addEventListener('click', startNewMarkdown);
  $('start-md-upload').addEventListener('click', function () { $('file-any').click(); });
  $('start-html-upload').addEventListener('click', function () { $('file-any').click(); });
  $('start-html-url-go').addEventListener('click', loadHtmlUrl);
  $('start-html-url').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); loadHtmlUrl(); }
  });
  $('start-lib').addEventListener('click', startOpenLibrary);
  $('screen-start').querySelector('.backdrop').addEventListener('click', function () { hideStartScreen(true); });

  function runAction(name) {
    if (name === 'present') present();
    else if (name === 'download') download();
    else if (name === 'pdf') exportPdf();
    else if (name === 'html') exportHtml();
    else if (name === 'open') $(FOLDER ? 'file-upload' : 'file-any').click();
    else if (name === 'grid') setMode(state.mode === 'grid' ? 'single' : 'grid');
    else if (name === 'theme') openThemes();
    else if (name === 'guide') { guide.classList.add('is-on'); }
    else if (name === 'palette') openPalette();
    else if (name === 'decks') { if (FOLDER) openFilesMenu(); else openLibrary(); }
    else if (name === 'new') newDeck();
    else if (name === 'duplicate') duplicateDeck();
    else if (name === 'delete') deleteDeck(state.deckId);
  }

  // ── Wiring ─────────────────────────────────────────────────────────────
  var parseTimer = null;

  function onInput() {
    // Typing takes the editor back from the deck.
    if (following) { following = false; followChipEl.classList.add('hidden'); }
    paint();
    syncScroll();
    updateCaretUi();
    scheduleSave();
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(refresh, 140);
  }

  src.addEventListener('input', onInput);
  src.addEventListener('scroll', syncScroll);
  src.addEventListener('click', updateCaretUi);
  src.addEventListener('keyup', function (e) {
    if (e.key.indexOf('Arrow') === 0 || e.key === 'Home' || e.key === 'End' ||
        e.key === 'PageUp' || e.key === 'PageDown') updateCaretUi();
  });

  src.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      typeText('  ');
      onInput();
    }
  });

  // ── HTML doc source ──────────────────────────────────────────────────
  var htmlPreviewTimer = null;

  // The preview is an about:srcdoc frame, where history.pushState and
  // replaceState throw for any URL, even a bare hash. A slide deck that
  // records its position that way would stop dead on its first slide, so
  // the preview copy (never the file) gets both calls made harmless.
  var HISTORY_SHIM = '<scr' + 'ipt>(function(){var h=history;["pushState","replaceState"].forEach(function(m){' +
    'var f=h[m];h[m]=function(){try{return f.apply(h,arguments)}catch(e){}}})})();</scr' + 'ipt>';

  function previewSrcdoc(html) {
    var head = /<head(\\s[^>]*)?>/i.exec(html) || /<html(\\s[^>]*)?>/i.exec(html);
    if (head) return html.slice(0, head.index + head[0].length) + HISTORY_SHIM + html.slice(head.index + head[0].length);
    // No <head> or <html>: after a doctype, if any, so the doc keeps standards mode.
    var doctype = /^\\s*<!doctype[^>]*>/i.exec(html);
    var at = doctype ? doctype[0].length : 0;
    return html.slice(0, at) + HISTORY_SHIM + html.slice(at);
  }

  function onHtmlInput() {
    scheduleSave();
    renderHtmlCounts();
    if (slidePanel) slidePanel.edited();
    if (designer) designer.sourceChanged({});
    schedulePreview();
  }

  function schedulePreview() {
    if (htmlPreviewTimer) clearTimeout(htmlPreviewTimer);
    htmlPreviewTimer = setTimeout(reloadPreview, 140);
  }

  /** The preview's copy carries the slide panel's tags; the source never does. */
  function reloadPreview() {
    if (htmlPreviewTimer) clearTimeout(htmlPreviewTimer);
    htmlPreviewTimer = null;
    var html = srcHtml.value;
    frameHtml.srcdoc = previewSrcdoc(slidePanel ? slidePanel.previewHtml(html) : html);
  }

  // ── HTML slide panel ─────────────────────────────────────────────────
  // For a doc that is a slide deck: thumbnails, sorter, notes, and every
  // slide operation, each one a rewrite of the source above.
  slidePanel = window.deckrunSlidePanel && window.DRSlides ? window.deckrunSlidePanel(window.DRSlides, {
    src: srcHtml,
    frame: frameHtml,
    cmd: CMD,
    srcdoc: previewSrcdoc,
    isHtml: function () { return state.kind === 'html'; },
    onSource: function (opts) {
      if (!opts.nosave) scheduleSave();
      renderHtmlCounts();
      if (!opts.quiet) schedulePreview();
      if (designer) designer.sourceChanged(opts);
    },
    reload: reloadPreview,
    ready: function (win) {
      if (inspect) inspect.ready(win);
      hookSlash(win);
      if (designer) designer.ready(win);
    },
    slideShown: function (k) { if (designer) designer.slideShown(k); },
    layout: layout,
    present: presentFrom,
    chat: FILE && FILE.chat ? chatAsk : null,
    toast: toast,
    get: lsGet,
    set: lsSet
  }) : null;

  // ── Design view ──────────────────────────────────────────────────────
  // The slide on a zoomable canvas: insert text, pictures, tables, shapes,
  // lines, and connectors; select, move, resize; and a properties panel for
  // whatever is selected. Each change is a rewrite of one element's markup.
  var KD = { code: 'deckrun.design.code.v1' };
  var codeOn = lsGet(KD.code, '1') !== '0';

  function setCode(on) {
    codeOn = on;
    lsSet(KD.code, on ? '1' : '0');
    document.documentElement.classList.toggle('code-off', !on);
    $('dh-code').setAttribute('aria-pressed', on ? 'true' : 'false');
    layout();
    if (slidePanel) slidePanel.layout();
    if (designer) designer.codeMode(on);
  }

  /** Scrolls the HTML source so pos sits a third of the way down, without moving focus. */
  function scrollSourceTo(pos) {
    var line = srcHtml.value.slice(0, pos).split('\\n').length - 1;
    var lh = parseFloat(getComputedStyle(srcHtml).lineHeight) || 22;
    var top = line * lh;
    if (top < srcHtml.scrollTop + lh || top > srcHtml.scrollTop + srcHtml.clientHeight - 2 * lh) {
      srcHtml.scrollTop = Math.max(0, top - srcHtml.clientHeight * 0.3);
    }
  }

  /** Where a picture or video for the deck lives: copied into its folder, or kept inside it. */
  function mediaUrl(file) {
    if (FOLDER) {
      return uploadOne(file, false).then(function (r) {
        if (!r || !r.name) throw new Error('the copy did not land');
        if (r.status === 'renamed') toast(file.name + ' was already there, so this one is ' + r.name + '.');
        return r.name.replace(/[ #?%"'<>]/g, function (c) { return encodeURIComponent(c); });
      });
    }
    if (file.size > 4 * 1024 * 1024) {
      toast(file.name + ' is large, and goes inside the file itself. Open the deck from a folder to keep pictures beside it instead.', 'warn');
    }
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(new Error('could not read it')); };
      fr.readAsDataURL(file);
    });
  }

  designer = window.deckrunDesigner && window.DRDesign && slidePanel ? window.deckrunDesigner(window.DRSlides, window.DRDesign, {
    panel: slidePanel,
    src: srcHtml,
    frame: frameHtml,
    cmd: CMD,
    isHtml: function () { return state.kind === 'html'; },
    inspecting: function () { return $('btn-inspect').getAttribute('aria-pressed') === 'true'; },
    // A dialog or menu of the editor's own is up: the design view's keys stand down.
    modal: function () {
      return themesOpen() || menuIsOpen() || palette.classList.contains('is-on') || guide.classList.contains('is-on') ||
        $('library').classList.contains('is-on') || $('screen-start').classList.contains('is-on');
    },
    pick: function (pos) {
      try { srcHtml.setSelectionRange(pos, pos); } catch (e) {}
      if (codeOn) scrollSourceTo(pos);
      // A selection on the canvas is the person pointing at an element: the chat's "this".
      chatMark('src');
      renderHtmlCounts();
      if (inspect) inspect.caretMoved();
    },
    reveal: function (pos) {
      if (!codeOn) setCode(true);
      srcHtml.focus();
      try { srcHtml.setSelectionRange(pos, pos); } catch (e) {}
      scrollSourceTo(pos);
      onHtmlCaret();
    },
    upload: mediaUrl,
    download: function (kind, k) {
      if (kind === 'pdf') exportPdf();
      else if (kind === 'web') downloadWebPage();
      else if (kind === 'png') downloadSlidePng(k);
    },
    present: presentFrom,
    reload: reloadPreview,
    toast: toast,
    get: lsGet,
    set: lsSet
  }) : null;

  $('dh-code').addEventListener('click', function () { setCode(!codeOn); });
  setCode(codeOn);

  // ── Inspect ──────────────────────────────────────────────────────────
  // The source and the preview point at each other, as in Chrome's
  // DevTools: hover the source to find its element on the slide, or turn on
  // inspect mode and hover the slide to find its source.
  inspect = window.deckrunInspect ? window.deckrunInspect({
    kind: function () { return state.kind; },
    src: function () { return state.kind === 'html' ? srcHtml : src; },
    frame: function () { return state.kind === 'html' ? frameHtml : frame; },
    sources: [src, srcHtml],
    frames: [frame, frameHtml],
    htmlMap: function () { return slidePanel ? slidePanel.inspectMap() : null; },
    mdMap: function () { return state.frameReady && mdMap && mdMap.src === src.value ? mdMap : null; },
    shown: function () { return state.kind === 'html' ? (slidePanel ? slidePanel.current() : -1) : state.index; },
    wrap: { hl: hl, measure: measure },
    caret: function (pos) {
      var ta = state.kind === 'html' ? srcHtml : src;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      // A pick is the person pointing at an element: the chat's "this".
      chatMark('src');
      if (state.kind === 'html') onHtmlCaret();
      else { scrollCaretIntoView(); updateCaretUi(); }
    }
  }) : null;

  srcHtml.addEventListener('input', onHtmlInput);
  frameHtml.addEventListener('load', syncHtmlFrameTheme);
  function onHtmlCaret() {
    renderHtmlCounts();
    if (slidePanel) slidePanel.caretMoved();
  }
  srcHtml.addEventListener('click', onHtmlCaret);
  srcHtml.addEventListener('keyup', function (e) {
    if (e.key.indexOf('Arrow') === 0 || e.key === 'Home' || e.key === 'End' ||
        e.key === 'PageUp' || e.key === 'PageDown') onHtmlCaret();
  });
  srcHtml.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    srcHtml.focus();
    var inserted = false;
    try { inserted = document.execCommand('insertText', false, '  '); } catch (err) {}
    if (!inserted) {
      var s = srcHtml.selectionStart, e2 = srcHtml.selectionEnd;
      srcHtml.setRangeText('  ', s, e2, 'end');
    }
    onHtmlInput();
  });

  // Drag and drop a .md file onto the editor to open it. In file mode the
  // drop is copied into the folder instead (see uploadFiles).
  ['dragenter', 'dragover'].forEach(function (type) {
    paneEdit.addEventListener(type, function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      paneEdit.classList.add('is-dropping');
    });
  });

  ['dragleave', 'dragend'].forEach(function (type) {
    paneEdit.addEventListener(type, function (e) {
      if (e.target === paneEdit || type === 'dragend') paneEdit.classList.remove('is-dropping');
    });
  });

  paneEdit.addEventListener('drop', function (e) {
    e.preventDefault();
    paneEdit.classList.remove('is-dropping');
    var files = e.dataTransfer ? e.dataTransfer.files : null;
    if (!files || !files.length) return;
    if (FOLDER) { uploadFiles(files); return; }
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (/\\.(md|markdown|txt)$/i.test(f.name)) loadMarkdownFile(f);
      else if (/\\.html?$/i.test(f.name)) loadHtmlFile(f);
      else toast('Skipped ' + f.name + '. Drop a Markdown or HTML file to open it.', 'warn');
    }
  });

  /** An opened file lands as a new deck, so nothing in the library is lost. */
  function loadMarkdownFile(file, chosenTemplate, chosenTransition) {
    if (fileModeBlocks()) return;
    var fr = new FileReader();
    fr.onload = function () {
      saveNow();
      var markdown = String(fr.result).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
      var name = uniqueName(file.name.replace(/\\.(md|markdown|txt)$/i, '') || 'untitled');
      var id = createDeck(
        name,
        markdown,
        'markdown',
        chosenTemplate || state.template,
        chosenTransition || state.transition
      );
      if (!id) { noRoom(); return; }
      hideStartScreenSilently();
      openDeck(id);
      toast('Loaded ' + file.name + ' as a new deck');
    };
    fr.onerror = function () { toast('Could not read ' + file.name, 'err'); };
    fr.readAsText(file);
  }

  /** An uploaded HTML doc lands as a new library entry, same as a .md file. */
  function loadHtmlFile(file) {
    if (fileModeBlocks()) return;
    var fr = new FileReader();
    fr.onload = function () {
      saveNow();
      var html = String(fr.result);
      var name = uniqueName(file.name.replace(/\\.html?$/i, '') || 'untitled');
      var id = createDeck(name, html, 'html');
      if (!id) { noRoom(); return; }
      hideStartScreenSilently();
      openDeck(id);
      toast('Loaded ' + file.name + ' as a new HTML doc');
    };
    fr.onerror = function () { toast('Could not read ' + file.name, 'err'); };
    fr.readAsText(file);
  }

  $('file-any').addEventListener('change', function (e) {
    if (FOLDER) {
      hideStartScreenSilently();
      uploadFiles(e.target.files);
      e.target.value = '';
      return;
    }
    var f = e.target.files[0];
    if (f) {
      var fromStart = $('screen-start').classList.contains('is-on');
      if (/\\.(md|markdown|txt)$/i.test(f.name)) {
        loadMarkdownFile(
          f,
          fromStart ? startTemplate : state.template,
          fromStart ? startTransition : state.transition
        );
      }
      else if (/\\.html?$/i.test(f.name)) loadHtmlFile(f);
      else toast('Unrecognized file type.', 'warn');
    }
    e.target.value = '';
  });

  $('docname').addEventListener('input', function () {
    updateDocTitle();
    scheduleSave();
  });

  $('btn-guide').addEventListener('click', function () { runAction('guide'); });
  $('btn-palette').addEventListener('click', openPalette);
  $('btn-new').addEventListener('click', function () { closeOverlays(); showStartScreen(); });
  // ── Dropdown menus ─────────────────────────────────────────────────────
  // Both the export and font popovers behave the same way, so one open menu is
  // tracked here rather than each growing its own copy of this.
  var openMenu = null;

  function menuIsOpen() { return !!openMenu; }

  function closeMenu() {
    if (!openMenu) return;
    openMenu.classList.remove('is-open');
    var btn = openMenu.querySelector('.btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  function toggleMenu(el) {
    var wasOpen = openMenu === el;
    closeMenu();
    if (wasOpen) return;
    openMenu = el;
    el.classList.add('is-open');
    var btn = el.querySelector('.btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var first = el.querySelector('.menu__pop button');
    if (first) first.focus();
  }

  /** Wires one dropdown: its trigger, its arrow keys, and its own Escape. */
  function bindMenu(triggerId, popId, onPick, pickSelector) {
    var wrap = $(triggerId).parentNode;
    var pop = $(popId);

    $(triggerId).addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu(wrap);
    });

    pop.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest(pickSelector) : null;
      if (!btn) return;
      onPick(btn);
    });

    menuKeys(pop);
    return wrap;
  }

  /** Arrow keys walk a menu's buttons; Escape closes it. */
  function menuKeys(pop) {
    pop.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(pop.querySelectorAll('button'));
      var at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        src.focus();
      }
    });
  }

  bindMenu('btn-export', 'export-menu', function (btn) {
    closeMenu();
    runExport(btn.dataset.export);
  }, 'button[data-export]');

  // The font menu stays open across picks: choosing a heading face and then a
  // body face is one decision, and closing between them would fight the user.
  bindMenu('btn-font', 'font-menu', function (btn) {
    setFont(btn.dataset.slot, btn.dataset.font || null, true);
  }, 'button[data-slot]');

  // Template and transition compose, so the menu remains open while either
  // choice is changed and the existing Markdown reflows immediately.
  bindMenu('btn-template', 'template-menu', function (btn) {
    if (btn.dataset.template) setTemplate(btn.dataset.template, true);
    if (btn.dataset.transition) setTransition(btn.dataset.transition, true);
  }, 'button[data-template], button[data-transition]');

  document.addEventListener('click', function (e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  });

  function runExport(kind) {
    if (kind === 'md') download();
    else if (kind === 'pdf') exportPdf();
    else if (kind === 'html') exportHtml();
  }
  $('btn-theme').addEventListener('click', function () { runAction('theme'); });

  // The picker owns the arrow keys while it is up, and Enter keeps the preview.
  document.addEventListener('keydown', function (e) {
    if (!themesOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    var cols = 0;
    if (themeCards.length) {
      var grid = themeCards[themeSel].parentNode;
      cols = Math.max(1, Math.round(grid.clientWidth / themeCards[themeSel].offsetWidth));
    }
    var step = 0;
    if (e.key === 'ArrowRight') step = 1;
    else if (e.key === 'ArrowLeft') step = -1;
    else if (e.key === 'ArrowDown') step = cols;
    else if (e.key === 'ArrowUp') step = -cols;
    else if (e.key === 'Enter') { e.preventDefault(); commitTheme(); return; }
    else if (e.key === 'Escape') { e.preventDefault(); closeOverlays(); return; }
    else return;
    e.preventDefault();
    var next = (themeSel + step + themeCards.length) % themeCards.length;
    selectTheme(next);
    themeCards[next].scrollIntoView({ block: 'nearest' });
  }, true);
  $('btn-present').addEventListener('click', present);
  $('btn-prev').addEventListener('click', function () { setIndex(state.index - 1, false); });
  $('btn-next').addEventListener('click', function () { setIndex(state.index + 1, false); });
  $('seg-single').addEventListener('click', function () { setMode('single'); });
  $('seg-grid').addEventListener('click', function () { setMode('grid'); });

  $('pane-prev').addEventListener('mousedown', function () {
    if (document.activeElement && isEditingText()) {
      document.activeElement.blur();
    }
  });

  // ── Global keys ────────────────────────────────────────────────────────
  function isEditingText() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'textarea' || tag === 'input' || el.isContentEditable;
  }

  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;

    if (themesOpen()) return;

    if ($('screen-start').classList.contains('is-on')) {
      if (e.key === 'Escape') { e.preventDefault(); hideStartScreen(true); }
      return;
    }

    if ($('library').classList.contains('is-on') && !mod) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (libRows.length) {
          libSel = (libSel + (e.key === 'ArrowDown' ? 1 : -1) + libRows.length) % libRows.length;
          renderLibrary();
          var sel = $('lib-list').querySelector('.lib-row.is-sel');
          if (sel) sel.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (libRows[libSel]) { closeOverlays(); openDeck(libRows[libSel].id, true); }
        return;
      }
    }

    if (e.key === 'Escape') {
      if (menuIsOpen()) { e.preventDefault(); closeMenu(); src.focus(); return; }
      if (palette.classList.contains('is-on') || guide.classList.contains('is-on') ||
          $('library').classList.contains('is-on')) {
        e.preventDefault();
        closeOverlays();
      }
      return;
    }

    if (mod) {
      var key = e.key.toLowerCase();
      var md = state.kind === 'markdown';

      if (key === 'k' && !e.shiftKey && md) { e.preventDefault(); openPalette(); }
      else if (key === 'o') { e.preventDefault(); if (FOLDER) openFilesMenu(); else openLibrary(); }
      else if (key === '/' && md) { e.preventDefault(); runAction('guide'); }
      else if (key === 'p' || (key === 's' && e.shiftKey)) { e.preventDefault(); exportPdf(); }
      else if (key === 's') { e.preventDefault(); saveNow(); download(); }
      else if (key === 'enter') { e.preventDefault(); present(); }
      else if (key === 'd' && md) { e.preventDefault(); insertSnippet(bySnippetId['slide-break']); }
      else if (key === 'b' && md) { e.preventDefault(); insertSnippet(bySnippetId.bold); }
      else if (key === 'i' && md) { e.preventDefault(); insertSnippet(bySnippetId.italic); }
      else if (key === 'e' && md) { e.preventDefault(); insertSnippet(bySnippetId['inline-code']); }
      else if (key === 'g' && md) { e.preventDefault(); runAction('grid'); }
      else if (key === 'l' && e.shiftKey) { e.preventDefault(); runAction('theme'); }
      else if (key === 'j' && CHAT) { e.preventDefault(); setChatOpen(!chatOpen()); }
      else if (e.code === 'Backslash' && state.kind === 'html') { e.preventDefault(); setCode(!codeOn); }
      return;
    }

    if (palette.classList.contains('is-on') || guide.classList.contains('is-on') ||
        $('library').classList.contains('is-on') || menuIsOpen()) {
      return;
    }

    // "/" anywhere but a text field opens the chat at its commands, as in Claude Code.
    if (CHAT && e.key === '/' && !e.altKey && !isEditingText()) {
      e.preventDefault();
      openChatCommands();
      return;
    }

    // An HTML deck steps through its slides the same way, through its slide panel.
    if (state.kind === 'html') {
      if (!slidePanel || !slidePanel.count() || (!e.altKey && isEditingText())) return;
      var fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || (!e.altKey && e.key === ' ');
      var back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp';
      if (fwd || back) {
        e.preventDefault();
        slidePanel.step(fwd ? 1 : -1);
      }
      return;
    }

    // Alt + arrows/page keys hops between slides (works anywhere, including inside the editor).
    if (e.altKey) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setIndex(state.index + 1, false);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex(state.index - 1, false);
      }
      return;
    }

    // Direct arrow keys / page keys when not typing into a text field.
    if (!isEditingText()) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setIndex(state.index + 1, false);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex(state.index - 1, false);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIndex(0, false);
      } else if (e.key === 'End') {
        e.preventDefault();
        setIndex(state.slides.length - 1, false);
      }
    }
  });

  // ── Split pane ─────────────────────────────────────────────────────────
  var splitPct = parseFloat(lsGet(K.split, '48'));
  if (!(splitPct > 15 && splitPct < 85)) splitPct = 48;

  function applySplit() {
    paneEdit.style.flex = '0 0 ' + splitPct + '%';
    layout();
  }

  divider.addEventListener('mousedown', function (e) {
    e.preventDefault();
    divider.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';

    function move(ev) {
      var box = $('panes').getBoundingClientRect();
      var pct = ((ev.clientX - box.left) / box.width) * 100;
      splitPct = Math.max(18, Math.min(82, pct));
      applySplit();
    }

    function up() {
      divider.classList.remove('is-dragging');
      document.body.style.cursor = '';
      lsSet(K.split, String(Math.round(splitPct)));
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  divider.addEventListener('dblclick', function () {
    splitPct = 48;
    lsSet(K.split, '48');
    applySplit();
  });

  window.addEventListener('resize', layout);

  // ── Frame messages ─────────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.type === 'ready') {
      // pushLook and pushFrame between them send the whole of the current
      // state, so a message dropped while the frame was loading is already
      // superseded by the time it is up.
      state.frameReady = true;
      pushLook();
      pushFrame();
    } else if (m.type === 'goto') {
      setMode('single');
      setIndex(m.index, true);
    } else if (m.type === 'nav') {
      setIndex(state.index + m.delta, false);
    } else if (m.type === 'index-select') {
      setIndex(m.index, false);
    } else if (m.type === 'action') {
      runAction(m.action);
    } else if (m.type === 'overflow') {
      var had = !!state.overflow[m.index];
      state.overflow[m.index] = m.overflow;
      renderCounts();
      if (had !== m.overflow) evalNudges();
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────────
  state.bootAt = Date.now();

  // Carry over a deck saved before the library existed.
  var legacy = lsGet(K.oldDoc, null);
  if (legacy !== null && !loadIndex().length) {
    createDeck(lsGet(K.oldName, 'deck'), legacy, 'markdown');
    lsDel(K.oldDoc);
    lsDel(K.oldName);
  }

  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.decor = THEME_BY_ID[state.theme].decor;
  document.documentElement.dataset.template = state.template;
  document.documentElement.dataset.transition = state.transition;
  buildFontMenu();
  buildTemplateMenu();
  buildStartOptions();
  paintThemeButton();
  $('seg-single').classList.toggle('is-on', state.mode === 'single');
  $('seg-grid').classList.toggle('is-on', state.mode === 'grid');

  Array.prototype.forEach.call(document.querySelectorAll('.btn kbd, .menu__pop kbd'), function (el) {
    el.textContent = el.textContent.replace('Cmd', CMD);
  });

  buildGuide();
  startTips();
  applySplit();
  paintExportMenu();
  updateDeckCount();

  // ── File mode ──────────────────────────────────────────────────────────
  /** Replaces the open document with what the server just read. */
  function setFileContent(content) {
    chatMark('ext');
    if (state.kind === 'html') {
      if (slidePanel) { slidePanel.external(content); return; }
      srcHtml.value = content;
      reloadPreview();
      renderHtmlCounts();
      return;
    }
    // Keep the caret and scroll roughly in place across an external reload.
    var s = src.selectionStart, e = src.selectionEnd, top = src.scrollTop;
    src.value = content;
    src.setSelectionRange(Math.min(s, content.length), Math.min(e, content.length));
    src.scrollTop = top;
    state.overflow = {};
    paint();
    syncScroll();
    updateCaretUi();
    refresh();
  }

  function loadFromDisk(announce) {
    return fetch('/__file' + FILE_Q)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (content) {
        if (content === curValue()) return;
        setFileContent(content);
        if (announce) toast('Reloaded ' + FILE.name + ' from disk');
      })
      .catch(function (err) {
        toast('Cannot read ' + FILE.name + ': ' + err.message, 'err');
      });
  }

  // ── Claude chat ────────────────────────────────────────────────────────
  // Offered when the editor is backed by a file and Claude Code is on this
  // machine. Each message runs one confined claude -p turn on the server
  // that may edit only this file; its edits land on disk and come back
  // through the file watcher like any other external change.
  var CHAT = !!(FILE && FILE.chat);
  var chatPane = $('pane-chat'), chatLog = $('chat-log'), chatInput = $('chat-input'), chatSend = $('chat-send');
  var chatBusy = false;

  var CHAT_STARTERS = {
    html: [
      'Make the title on this slide shorter',
      'Rewrite the speaker notes on this slide in natural spoken English',
      '/deck Check every slide for typos and fix them',
      '/look Does anything on this slide overflow or overlap?'
    ],
    markdown: [
      'Tighten the bullets on this slide',
      'Add speaker notes to this slide',
      '/deck Check every slide for typos and fix them'
    ]
  };

  // What Claude takes "this" to mean leans on what the person last did in
  // the source: a caret or selection they put there counts until a reload
  // from disk (Claude's edit, an undo) moves the text under it.
  var chatMarks = { clock: 0, src: 0, ext: 0 };
  function chatMark(kind) {
    if (!chatMarks) return;
    chatMarks[kind] = ++chatMarks.clock;
  }

  // Turns that changed the file, for undo and redo, and the message whose
  // changes were undone since Claude last heard from the person.
  var chatTurns = [];
  var chatReverted = null;
  // Picked with /model; "" leaves it to Claude Code.
  var chatModel = '';
  var chatMenu = $('chat-menu'), menuItems = [], menuAt = 0;

  function chatOpen() { return chatPane.classList.contains('is-on'); }

  function setChatOpen(on, quiet) {
    if (!CHAT) return;
    chatPane.classList.toggle('is-on', on);
    $('btn-chat').classList.toggle('is-on', on);
    lsSet(K.chat, on ? '1' : '0');
    layout();
    if (quiet) return;
    if (on) chatInput.focus();
    else (state.kind === 'html' ? srcHtml : src).focus();
  }

  function chatLine(cls, text) {
    var el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  /** A note from deckrun itself, not from Claude. */
  function chatSys(text) {
    if (chatLog.querySelector('.chat-empty')) chatLog.textContent = '';
    return chatLine('chat-sys', text);
  }

  function chatEmptyState() {
    chatLog.textContent = '';
    var box = document.createElement('div');
    box.className = 'chat-empty';
    box.textContent = 'Claude edits ' + FILE.name + ' directly, and the preview reloads as it does. ' +
      'A request is about the slide in the preview, or what you singled out on it: code you selected, text you selected on the slide, ' +
      'or an element you picked with ' + CMD + ' Shift X. Type / for commands.';
    (CHAT_STARTERS[state.kind] || CHAT_STARTERS.html).forEach(function (text) {
      var b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', function () { chatInput.value = text; chatInput.focus(); });
      box.appendChild(b);
    });
    chatLog.appendChild(box);
  }

  // ── What "this" is ─────────────────────────────────────────────────────

  function mdTitle(text) {
    var m = /^[ \\t]*#{1,6}[ \\t]+(.+)$/m.exec(text);
    return m ? m[1].trim() : '';
  }

  /** Each slide's place in text: the editor's own, or a snapshot from before a turn. */
  function chatSpans(text) {
    if (state.kind === 'html') return slidePanel ? slidePanel.spans(text) : [];
    return slideMap(text).map(function (sp) {
      // Without the blank lines around the separators, so the range starts at the slide's first line.
      var a = sp[0], b = sp[1];
      while (a < b && /\\s/.test(text.charAt(a))) a++;
      while (b > a && /\\s/.test(text.charAt(b - 1))) b--;
      return { start: a, end: b, title: mdTitle(text.slice(a, b)) };
    });
  }

  function chatSlideCount() { return chatSpans(curValue()).length; }

  function chatCurrent(count) {
    if (!count) return -1;
    if (state.kind === 'html') return slidePanel ? slidePanel.current() : -1;
    return Math.max(0, Math.min(state.index, count - 1));
  }

  /** A document that is not a deck: the words in the middle of the preview. */
  function shownText() {
    try {
      var doc = frameHtml.contentDocument;
      var el = doc && doc.elementFromPoint(frameHtml.clientWidth / 2, frameHtml.clientHeight / 2);
      var box = el && (el.closest('section, article, [class*="slide"]') || el);
      if (!box || box === doc.body || box === doc.documentElement) return '';
      return (box.innerText || '').replace(/\\s+/g, ' ').trim();
    } catch (e) {}
    return '';
  }

  /** The narrowest thing singled out on slide k: selected code, selected slide text, or the caret's element. */
  function chatFocus(ta, slides, k) {
    var slide = slides[k] || null;
    var fresh = chatMarks.src > chatMarks.ext;
    var a = ta.selectionStart, b = ta.selectionEnd;
    if (fresh && b > a && ta.value.slice(a, b).trim()) return { how: 'code', start: a, end: b };

    try {
      var win = (state.kind === 'html' ? frameHtml : frame).contentWindow;
      var sel = win && win.getSelection();
      var said = sel && !sel.isCollapsed ? sel.toString().replace(/\\s+/g, ' ').trim() : '';
      if (said) {
        var n = inspect ? inspect.elementFor(sel.getRangeAt(0).commonAncestorContainer) : null;
        // Text selected on a slide the deck has since moved away from says nothing about this one.
        if (n && (!slide || n.slide === k)) return { how: 'text', text: said, start: n.s, end: n.e, label: n.label };
        if (!n) return { how: 'text', text: said, start: -1, end: -1 };
      }
    } catch (e) {}

    if (fresh && inspect && slide) {
      var el = inspect.elementAt(a);
      var inner = slide.inner || [slide.start, slide.end];
      if (el && el.parent !== null && el.s >= inner[0] && el.e <= inner[1]) {
        return { how: 'element', start: el.s, end: el.e, label: el.label };
      }
    }
    return null;
  }

  /** What goes to Claude with a message, and the tag shown under it. */
  function chatTarget(scope, k, look) {
    var html = state.kind === 'html';
    var ta = html ? srcHtml : src;
    var slides = chatSpans(ta.value);
    if (k === undefined) k = chatCurrent(slides.length);
    return DRChat.target({
      file: FILE.name,
      text: ta.value,
      scope: scope,
      slides: slides,
      current: k,
      focus: scope === 'deck' ? null : chatFocus(ta, slides, k),
      shown: html && !slides.length ? shownText() : '',
      reverted: chatReverted,
      look: !!look
    });
  }

  function goSlide(k) {
    if (state.kind === 'html') { if (slidePanel) slidePanel.go(k); }
    else setIndex(k, true);
    if (chatOpen()) chatInput.focus();
  }

  // ── Slash commands ─────────────────────────────────────────────────────
  // As in Claude Code: "/" lists the commands, the list narrows as you type,
  // and a command that takes a choice (a model, a slide) lists those next.

  function menuOpen() { return menuItems.length > 0 && chatMenu.classList.contains('is-on'); }

  function hideMenu() {
    chatMenu.classList.remove('is-on');
    chatMenu.textContent = '';
    menuItems = [];
  }

  function paintMenu() {
    var value = chatInput.value;
    menuItems = DRChat.complete(value, { slides: chatSpans(curValue()), model: chatModel });
    chatMenu.textContent = '';
    if (!menuItems.length) {
      // Typing a command's words: a reminder of what it takes.
      var h = DRChat.hint(value);
      if (!h) { hideMenu(); return; }
      var row = document.createElement('div');
      row.className = 'chat-cmd-hint';
      var usage = document.createElement('b');
      usage.textContent = '/' + h.name + ' ' + h.args;
      row.appendChild(usage);
      row.appendChild(document.createTextNode('  ' + h.help));
      chatMenu.appendChild(row);
      chatMenu.classList.add('is-on');
      return;
    }
    if (menuAt >= menuItems.length) menuAt = 0;
    menuItems.forEach(function (it, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-cmd' + (i === menuAt ? ' is-active' : '');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', i === menuAt ? 'true' : 'false');
      var name = document.createElement('span');
      name.className = 'chat-cmd__name';
      name.textContent = it.label;
      if (it.hint) {
        var args = document.createElement('span');
        args.className = 'chat-cmd__args';
        args.textContent = ' ' + it.hint;
        name.appendChild(args);
      }
      var help = document.createElement('span');
      help.className = 'chat-cmd__help';
      help.textContent = it.help;
      b.appendChild(name);
      b.appendChild(help);
      // Keep the caret in the input.
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { pickItem(it); });
      chatMenu.appendChild(b);
    });
    chatMenu.classList.add('is-on');
    var active = chatMenu.querySelector('.chat-cmd.is-active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  /** Enter or a click runs what is complete and waits for the words the rest need; Tab only completes. */
  function pickItem(it, tab) {
    hideMenu();
    chatInput.value = tab ? it.fill : it.value;
    chatInput.focus();
    if (!tab && it.run) { sendChat(); return; }
    menuAt = 0;
    paintMenu();
  }

  /** "/" outside a text field: the chat, open at its commands. */
  function openChatCommands() {
    if (!CHAT) return;
    setChatOpen(true, true);
    chatInput.focus();
    if (chatInput.value.trim()) return;
    chatInput.value = '/';
    menuAt = 0;
    paintMenu();
  }

  /** The preview is the deck's own page, with its own keys; "/" there opens the commands too. */
  function hookSlash(win) {
    try {
      if (!win || win.__drSlash) return;
      win.__drSlash = true;
      win.addEventListener('keydown', function (e) {
        if (!CHAT || e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        var t = e.target;
        if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) return;
        e.preventDefault();
        e.stopPropagation();
        openChatCommands();
      }, true);
    } catch (err) {}
  }

  function busyNote() {
    chatSys('Claude is still working on the last message. Wait for it, or type /stop.');
  }

  function chatHelp() {
    var lines = DRChat.COMMANDS.map(function (c) {
      return '/' + c.name + (c.args ? ' ' + c.args : '') + '  —  ' + c.help;
    });
    lines.push('', 'Models for /model: ' + DRChat.MODELS.map(function (x) { return x.name; }).join(', ') +
      '. Now: ' + (chatModel || 'default') + '.');
    lines.push('', 'Without a command, a request is about the slide in the preview. To narrow it, select code, ' +
      'select text on the slide, or pick an element with ' + CMD + ' Shift X before you ask. ' +
      'Press / anywhere outside a text box to open this list.');
    chatSys(lines.join('\\n'));
  }

  function showContext() {
    var t = chatTarget('slide');
    var parts = t.context.split('\\n\\n');
    var text = 'This message would be about: ' + (t.tag || 'the whole file') + '\\n\\n' + parts[0];
    if (parts.length > 1) text += '\\n\\n(Claude also gets the source shown above, ' + (parts.slice(1).join('\\n\\n').split('\\n').length - 1) + ' lines.)';
    text += '\\n\\nModel: ' + (chatModel || 'default') + '.';
    chatSys(text);
  }

  // ── /model ─────────────────────────────────────────────────────────────

  function paintModel() {
    var b = $('chat-model');
    b.textContent = chatModel || 'default';
    b.classList.toggle('is-set', !!chatModel);
  }

  function setChatModel(name) {
    chatModel = name === 'default' ? '' : name;
    lsSet(K.chatModel, chatModel);
    paintModel();
  }

  function modelCommand(arg, typed) {
    var m = /^(\\S+)(?:\\s+([\\s\\S]*))?$/.exec(arg);
    if (!m) {
      chatSys('Model: ' + (chatModel || "default (Claude Code's own setting)") + '. Pick one from the list, or type /model <name>.');
      chatInput.value = '/model ';
      menuAt = 0;
      paintMenu();
      return;
    }
    var said = DRChat.latin(m[1]).toLowerCase();
    var known = DRChat.MODELS.filter(function (x) { return x.name === said; })[0];
    var name = known ? known.name : m[1];
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@\\/[\\]-]{0,199}$/.test(name)) {
      chatSys("'" + m[1] + "' is not a model name. Try " + DRChat.MODELS.map(function (x) { return x.name; }).join(', ') + '.');
      return;
    }
    // With a request after the name, that model answers this one message.
    if (m[2] && m[2].trim()) {
      if (chatBusy) { busyNote(); return; }
      chatInput.value = '';
      askClaude(m[2].trim(), 'slide', typed, undefined, { model: name });
      return;
    }
    chatInput.value = '';
    setChatModel(name);
    chatSys(name === 'default'
      ? "Back to Claude Code's own model setting."
      : 'Using ' + name + ' from the next message on.' + (known ? '' : ' Claude Code will say so if it does not know that name.'));
  }

  // ── /look ──────────────────────────────────────────────────────────────

  function lastUserText() {
    var all = chatLog.querySelectorAll('.chat-msg--user');
    return all.length ? all[all.length - 1].textContent : '';
  }

  /** What /look asks on its own, in the language the person writes in. */
  function lookRequest() {
    var ko = /[ㄱ-ㆎ가-힣]/.test(lastUserText()) || /^ko/i.test(navigator.language || '');
    return ko
      ? '이 슬라이드가 실제로 보이는 모습을 보고, 레이아웃이나 글자에 문제가 있으면 알려줘. 아직 파일은 고치지 마.'
      : 'Look at how this slide renders and tell me what looks wrong in its layout or text, if anything. Do not change the file yet.';
  }

  /**
   * Renders the slide in the preview the way a thumbnail shows it, the
   * deck reduced to that one slide, in a headless browser at 1280x720, then
   * sends the picture with the request.
   */
  function lookAndAsk(request, typed) {
    if (state.kind !== 'html' || !slidePanel || !slidePanel.count() || !window.DRSlides) {
      chatSys('/look works on HTML slide decks.');
      return;
    }
    slidePanel.flush();
    var k = slidePanel.current();
    var html = window.DRSlides.isolate(window.DRSlides.model(srcHtml.value), k);
    if (chatLog.querySelector('.chat-empty')) chatLog.textContent = '';
    var note = chatLine('chat-meta', 'taking a picture of slide ' + (k + 1) + '…');
    setChatBusy(true);
    fetch('/__look' + FILE_Q, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.detail || j.error || 'HTTP ' + r.status);
          return j;
        });
      })
      .then(function (j) {
        note.remove();
        setChatBusy(false);
        askClaude(request || lookRequest(), 'slide', typed, k, { look: j.id });
      })
      .catch(function (err) {
        note.remove();
        setChatBusy(false);
        chatLine('chat-msg chat-msg--err', 'Could not take a picture of the slide: ' + err.message);
      });
  }

  function runCommand(cmd, typed) {
    if (cmd.matches.length !== 1) {
      chatSys(cmd.matches.length
        ? '/' + cmd.name + ' could be ' + cmd.matches.map(function (n) { return '/' + n; }).join(' or ') + '.'
        : 'There is no /' + cmd.name + '. Type /help for the list.');
      return;
    }
    var arg = cmd.arg;
    if (cmd.name === 'stop') {
      chatInput.value = '';
      if (chatBusy) stopChat(); else chatSys('Claude is not working on anything.');
      return;
    }
    if (cmd.name === 'help') { chatInput.value = ''; chatHelp(); return; }
    if (cmd.name === 'context') { chatInput.value = ''; showContext(); return; }
    if (cmd.name === 'model') { modelCommand(arg, typed); return; }
    if (chatBusy) { busyNote(); return; }
    if (cmd.name === 'clear') { chatInput.value = ''; newChat(); return; }
    if (cmd.name === 'undo') {
      chatInput.value = '';
      var last = null;
      chatTurns.forEach(function (t) { if (!t.undone) last = t; });
      if (last) undoTurn(last); else chatSys('Nothing Claude changed in this chat is left to undo.');
      return;
    }
    if (cmd.name === 'look') { chatInput.value = ''; lookAndAsk(arg, typed); return; }
    if (cmd.name === 'deck') {
      if (!arg) { chatSys('Say what to do with it: /deck check every slide for typos'); return; }
      chatInput.value = '';
      askClaude(arg, 'deck', typed);
      return;
    }
    if (cmd.name === 'slide') {
      var total = chatSlideCount();
      var m = /^(\\d+)(?:\\s+([\\s\\S]*))?$/.exec(arg);
      var k = m ? +m[1] - 1 : -1;
      if (k < 0 || k >= total) {
        chatSys(total ? 'Which slide? /slide 1 to /slide ' + total + ', then what to do with it.' : FILE.name + ' has no slides.');
        return;
      }
      chatInput.value = '';
      goSlide(k);
      if (m[2] && m[2].trim()) askClaude(m[2].trim(), 'slide', typed, k);
      return;
    }
  }

  // ── Claude's choices, as buttons ───────────────────────────────────────

  /** Choices answer the question they came with; a new message retires them. */
  function retireChoices() {
    Array.prototype.forEach.call(chatLog.querySelectorAll('.chat-choices button'), function (b) { b.disabled = true; });
  }

  function showChoices(after, list) {
    var box = document.createElement('div');
    box.className = 'chat-choices';
    list.forEach(function (text) {
      var b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', function () {
        if (chatBusy) { busyNote(); return; }
        b.classList.add('is-picked');
        chatInput.value = text;
        sendChat();
      });
      box.appendChild(b);
    });
    chatLog.insertBefore(box, after.nextSibling);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // ── What a turn changed, and undoing it ────────────────────────────────

  function finishTurn(turn) {
    turn.after = curValue();
    if (turn.before === null || turn.after === turn.before) return;
    var ch = DRChat.changes(turn.before, chatSpans(turn.before), turn.after, chatSpans(turn.after));
    var row = document.createElement('div');
    row.className = 'chat-turn';
    function word(text) { row.appendChild(document.createTextNode(text)); }
    function slides(label, ks) {
      if (!ks.length) return;
      word(label);
      ks.forEach(function (k) {
        var b = document.createElement('button');
        b.className = 'chat-slide';
        b.textContent = String(k + 1);
        b.title = 'Show slide ' + (k + 1);
        b.addEventListener('click', function () { if (!turn.undone) goSlide(k); });
        row.appendChild(b);
      });
    }
    slides('changed slide', ch.changed);
    slides(ch.changed.length ? ' \\u00b7 new' : 'new slide', ch.added);
    if (ch.removed) word((ch.changed.length || ch.added.length ? ' \\u00b7 ' : '') + ch.removed + ' removed');
    if (ch.outside) word((ch.changed.length || ch.added.length || ch.removed ? ' \\u00b7 ' : 'changed ') + 'styles, scripts or head');
    if (!row.childNodes.length) word('changed ' + FILE.name);
    var btn = document.createElement('button');
    btn.className = 'chat-undo';
    btn.textContent = 'undo';
    btn.title = 'Put ' + FILE.name + ' back the way it was before this message';
    btn.addEventListener('click', function () { if (turn.undone) redoTurn(turn); else undoTurn(turn); });
    row.appendChild(btn);
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
    turn.el = row;
    turn.btn = btn;
    turn.undone = false;
    chatTurns.push(turn);
    if (slidePanel && state.kind === 'html') slidePanel.flash(ch.changed.concat(ch.added));
  }

  function setUndone(turn, on) {
    turn.undone = on;
    turn.el.classList.toggle('is-undone', on);
    turn.btn.textContent = on ? 'redo' : 'undo';
    turn.btn.title = on
      ? 'Put back what Claude changed for this message'
      : 'Put ' + FILE.name + ' back the way it was before this message';
  }

  /** Writes content as if it came from disk, so the slide panel's undo history keeps the step, then saves it. */
  function restoreFile(content) {
    if (slidePanel && state.kind === 'html') slidePanel.flush();
    setFileContent(content);
    scheduleSave();
    flushSave();
  }

  function undoTurn(turn) {
    if (chatBusy) { busyNote(); return; }
    var at = chatTurns.indexOf(turn);
    if (curValue() !== turn.after &&
        !confirm('Undo what Claude changed for "' + turn.message.slice(0, 60) + '"?\\n\\nEverything changed in ' + FILE.name + ' after it, by Claude or by you, is undone too.')) return;
    restoreFile(turn.before);
    chatTurns.forEach(function (t, i) { if (i >= at && !t.undone) setUndone(t, true); });
    chatReverted = turn.message;
    chatSys('Undid the changes for "' + turn.message.slice(0, 80) + '". Claude will be told before your next message.');
  }

  function redoTurn(turn) {
    if (chatBusy) { busyNote(); return; }
    if (curValue() !== turn.before &&
        !confirm('Put back what Claude changed for "' + turn.message.slice(0, 60) + '"?\\n\\n' + FILE.name + ' has changed since, and those changes would be replaced.')) return;
    restoreFile(turn.after);
    setUndone(turn, false);
    // Claude's memory of the turn is true again.
    if (chatReverted === turn.message) chatReverted = null;
  }

  // ── Sending ────────────────────────────────────────────────────────────

  function setChatBusy(on) {
    chatBusy = on;
    if (slidePanel) slidePanel.busy(on);
    chatPane.classList.toggle('is-busy', on);
    chatSend.textContent = on ? 'stop' : 'send';
    // Claude is writing the file; typing now would race its edits.
    src.readOnly = on;
    srcHtml.readOnly = on;
    elSave.className = on ? 'warn' : '';
    elSave.textContent = on ? 'claude is editing ' + FILE.name : '';
  }

  function sendChat() {
    var message = chatInput.value.trim();
    if (!message) return;
    hideMenu();
    var cmd = DRChat.command(message);
    if (cmd) { runCommand(cmd, message); return; }
    if (chatBusy) return;
    chatInput.value = '';
    askClaude(message, 'slide', message);
  }

  /**
   * One turn: the message, what it is about, the reply as it streams, and
   * what changed. opts.look is a picture of the slide from /look; opts.model
   * answers this message only.
   */
  function askClaude(message, scope, typed, k, opts) {
    opts = opts || {};
    if (chatLog.querySelector('.chat-empty')) chatLog.textContent = '';
    retireChoices();
    // Notes or slide text still being typed are written first, so the line
    // numbers Claude gets match the file it reads.
    if (slidePanel) slidePanel.flush();
    var target = chatTarget(scope, k, opts.look);
    var model = opts.model || chatModel;
    chatLine('chat-msg chat-msg--user', typed || message);
    var tag = target.tag + (opts.model ? (target.tag ? ' \\u00b7 ' : '') + opts.model : '');
    if (tag) chatLine('chat-tag', '\\u2192 ' + tag);
    if (opts.look) {
      var pic = document.createElement('a');
      pic.className = 'chat-look';
      pic.href = '/__look?id=' + opts.look;
      pic.target = '_blank';
      pic.title = 'The picture Claude was sent';
      var img = document.createElement('img');
      img.alt = 'The slide as Claude sees it';
      img.addEventListener('load', function () { chatLog.scrollTop = chatLog.scrollHeight; });
      img.src = pic.href;
      pic.appendChild(img);
      chatLog.appendChild(pic);
    }
    var reverted = chatReverted;
    chatReverted = null;
    setChatBusy(true);

    var turn = { message: typed || message, before: null, after: null };
    var reply = null, lastReply = null, heard = false;
    function onEvent(ev) {
      heard = true;
      if (ev.type === 'text') {
        if (!reply) { reply = lastReply = chatLine('chat-msg', ''); reply.raw = ''; }
        reply.raw += ev.text;
        reply.textContent = DRChat.visible(reply.raw);
        chatLog.scrollTop = chatLog.scrollHeight;
      } else if (ev.type === 'tool') {
        // Text after a tool call is a new paragraph, not a continuation.
        reply = null;
        var edits = ev.name === 'Edit' || ev.name === 'Write';
        chatLine('chat-tool' + (edits ? ' chat-tool--edit' : ''), (edits ? 'edited ' : ev.name.toLowerCase() + ' ') + (ev.target || ''));
      } else if (ev.type === 'done') {
        if (!lastReply && ev.text) { lastReply = chatLine('chat-msg', ''); lastReply.raw = ev.text; }
        if (lastReply) {
          var said = DRChat.choices(lastReply.raw);
          lastReply.textContent = said.text;
          if (said.choices.length) showChoices(lastReply, said.choices);
        }
        if (ev.denied && ev.denied.length) {
          chatLine('chat-msg chat-msg--err', 'Blocked: ' + ev.denied.join(', ') + '. Chat can only edit ' + FILE.name + '.');
        }
        if (!ev.ok) chatLine('chat-msg chat-msg--err', 'Claude stopped with an error.');
        chatLine('chat-meta', 'done in ' + Math.max(1, Math.round(ev.ms / 1000)) + 's');
      } else if (ev.type === 'error') {
        chatLine('chat-msg chat-msg--err', ev.message);
      }
    }

    flushSave()
      .then(function () {
        turn.before = curValue();
        return fetch('/__chat' + FILE_Q, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, context: target.context, model: model || undefined, look: opts.look })
        });
      })
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.detail || j.error || 'HTTP ' + r.status);
          });
        }
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return;
            buf += decoder.decode(chunk.value, { stream: true });
            var nl;
            while ((nl = buf.indexOf('\\n')) >= 0) {
              var line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.trim()) onEvent(JSON.parse(line));
            }
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        // Claude never heard about the undo; tell it next time.
        if (!heard && reverted) chatReverted = reverted;
        chatLine('chat-msg chat-msg--err', 'Chat failed: ' + err.message);
      })
      .then(function () {
        setChatBusy(false);
        // The watcher has usually delivered the edits already; this covers
        // --no-watch and the last write of the turn.
        return loadFromDisk(false);
      })
      .then(function () {
        finishTurn(turn);
        if (chatOpen()) chatInput.focus();
      });
  }

  /** Sends a message on the person's behalf, as if typed into the chat. */
  function chatAsk(message) {
    if (!CHAT || chatBusy) {
      toast(chatBusy ? 'Claude is still working on the last message.' : 'Chat is off for this file.', 'warn');
      return;
    }
    setChatOpen(true, true);
    chatInput.value = message;
    sendChat();
  }

  function stopChat() {
    fetch('/__chat/stop', { method: 'POST' }).catch(function () {});
  }

  function newChat() {
    if (chatBusy) return;
    fetch('/__chat/reset' + FILE_Q, { method: 'POST' }).catch(function () {});
    // A new conversation starts from the file as it is; old undo buttons go with the old log.
    chatTurns = [];
    chatReverted = null;
    chatEmptyState();
    chatInput.focus();
  }

  if (CHAT) {
    document.documentElement.dataset.chat = 'on';
    $('chat-file').textContent = FILE.name;
    $('local-note').textContent = 'local only, except what you send to Claude';
    $('btn-chat').addEventListener('click', function () { setChatOpen(!chatOpen()); });
    $('chat-close').addEventListener('click', function () { setChatOpen(false); });
    $('chat-new').addEventListener('click', newChat);
    chatSend.addEventListener('click', function () { if (chatBusy) stopChat(); else sendChat(); });
    chatInput.addEventListener('keydown', function (e) {
      // Enter mid-composition picks an IME candidate (Korean, Japanese, …).
      if (e.isComposing || e.keyCode === 229) return;
      if (menuOpen()) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          menuAt = (menuAt + (e.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length;
          paintMenu();
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); pickItem(menuItems[menuAt], e.key === 'Tab'); return; }
      }
      // Esc closes the list or the reminder first, then the chat.
      if (e.key === 'Escape' && chatMenu.classList.contains('is-on')) { e.preventDefault(); hideMenu(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
      else if (e.key === 'Escape') { e.preventDefault(); setChatOpen(false); }
    });
    chatInput.addEventListener('input', function (e) {
      // A full-width slash, from an input method in full-width mode, is the same key.
      if (!e.isComposing && chatInput.value.charAt(0) === '\\uff0f') {
        chatInput.value = '/' + chatInput.value.slice(1);
      }
      menuAt = 0;
      paintMenu();
    });
    chatInput.addEventListener('blur', hideMenu);
    chatModel = lsGet(K.chatModel, '');
    paintModel();
    $('chat-model').addEventListener('click', function () {
      setChatOpen(true, true);
      chatInput.value = '/model ';
      chatInput.focus();
      menuAt = 0;
      paintMenu();
    });
    // A caret or selection the person puts in the source is what "this" can narrow to.
    [src, srcHtml].forEach(function (ta) {
      ['mouseup', 'keyup', 'input'].forEach(function (t) { ta.addEventListener(t, function () { chatMark('src'); }); });
    });
  }

  // ── Folder ─────────────────────────────────────────────────────────────
  // In file mode the files menu lists the decks beside the opened file.
  // Picking one opens it in this tab at /?file=<name>, so Back returns to the
  // last one. Uploads, from the menu or dropped on the editor, are copied
  // into that folder and opened from there: they save to disk, their images
  // load, and the chat can edit them, like the file deckrun started with.
  var filesWrap = $('files-wrap');
  var DECK_FILE = /\\.(html?|md|markdown)$/i;
  // A message for the page the next switch lands on.
  var FLASH = 'deckrun.flash.v1';

  function sizeLabel(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function filesNote(text) {
    var host = $('files-list');
    host.textContent = '';
    var note = document.createElement('div');
    note.className = 'files-empty';
    note.textContent = text;
    host.appendChild(note);
  }

  function renderFiles(files) {
    if (!files.length) { filesNote('No .html or .md decks here yet.'); return; }
    var host = $('files-list');
    host.textContent = '';
    files.forEach(function (f) {
      var open = f.name === FILE.name;
      var b = document.createElement('button');
      b.dataset.file = f.name;
      b.title = open ? f.name + ' is open' : 'Open ' + f.name;
      if (open) b.className = 'is-on';
      var name = document.createElement('span');
      name.className = 'menu__name';
      name.textContent = f.name;
      var hint = document.createElement('span');
      hint.className = 'menu__hint';
      hint.textContent = open ? 'open' : sizeLabel(f.size);
      b.appendChild(name);
      b.appendChild(hint);
      host.appendChild(b);
    });
  }

  /** Lists the folder fresh each time, so files added outside deckrun show up. */
  function openFilesMenu() {
    if (openMenu === filesWrap) { closeMenu(); return; }
    fetch('/__files')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        $('files-folder').textContent = data.folder;
        $('files-folder').title = data.path;
        renderFiles(data.files || []);
      })
      .catch(function () { filesNote('Could not list the folder. Is deckrun still running?'); })
      .then(function () {
        if (openMenu !== filesWrap) toggleMenu(filesWrap);
        var on = $('files-list').querySelector('.is-on');
        if (on) on.focus();
      });
  }

  /** Opens another deck from the folder in this tab, once this one is saved. */
  function switchFile(name, flash) {
    if (chatBusy) {
      if (!confirm('Claude is still working on ' + FILE.name + '. Stop it and open ' + name + '?')) return;
      stopChat();
    }
    flushSave().then(function (ok) {
      if (!ok) {
        toast(FILE.name + ' could not be saved, so it stays open. Is deckrun still running?', 'err');
        return;
      }
      if (flash) { try { sessionStorage.setItem(FLASH, JSON.stringify(flash)); } catch (err) {} }
      location.href = '/?file=' + encodeURIComponent(name);
    });
  }

  /** Sends one file. An asset whose name is taken by other content asks first. */
  function uploadOne(file, replace) {
    return fetch('/__upload?name=' + encodeURIComponent(file.name) + (replace ? '&replace=1' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.detail || body.error || 'HTTP ' + r.status);
          return body;
        });
      })
      .then(function (body) {
        if (body.status !== 'conflict') return body;
        var replaceIt = confirm(
          file.name + ' is already in ' + FILE.folder + ', with different content.\\n\\n' +
          'OK replaces it. The old one is kept in .deckrun-backup.\\n' +
          'Cancel keeps the one that is there.'
        );
        return replaceIt ? uploadOne(file, true) : { status: 'kept', name: file.name };
      });
  }

  /**
   * Copies files into the folder, one at a time and assets first, so a deck
   * among them opens with its images already in place; then opens the first
   * deck. A deck never overwrites one already there.
   */
  function uploadFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    files.sort(function (a, b) { return DECK_FILE.test(a.name) - DECK_FILE.test(b.name); });
    var notes = [], copied = 0, failed = 0, deck = null;
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return uploadOne(file, false).then(function (r) {
          if (r.status === 'created' || r.status === 'renamed' || r.status === 'replaced') copied++;
          if (r.status === 'renamed') notes.push(file.name + ' was already there with different content, so the copy is ' + r.name + '.');
          if (r.status === 'replaced') notes.push('The old ' + r.name + ' is in ' + r.backup + '.');
          if (!deck && DECK_FILE.test(r.name)) deck = r.name;
        }, function (err) {
          failed++;
          notes.push('Skipped ' + file.name + ': ' + err.message + '.');
        });
      });
    });
    chain.then(function () {
      var head = copied ? 'Copied ' + copied + ' file' + (copied === 1 ? '' : 's') + ' into ' + FILE.folder + '.' : '';
      var text = [head].concat(notes).filter(Boolean).join(' ');
      var kind = failed ? 'warn' : null;
      if (deck && deck !== FILE.name) {
        switchFile(deck, { text: text || deck + ' was already in ' + FILE.folder + '.', kind: kind });
        return;
      }
      if (!text && deck) text = deck + ' is already open.';
      if (text) toast(text, kind);
      // Images the open deck was missing may have just arrived.
      if (copied) { if (state.kind === 'html') reloadPreview(); else refresh(); }
    });
  }

  function showFlash() {
    var flash = null;
    try {
      flash = JSON.parse(sessionStorage.getItem(FLASH) || 'null');
      sessionStorage.removeItem(FLASH);
    } catch (err) {}
    if (flash && flash.text) setTimeout(function () { toast(flash.text, flash.kind || null); }, 300);
  }

  if (FOLDER) {
    document.documentElement.dataset.folder = 'on';
    $('files-label').textContent = FILE.name;
    $('btn-files').title = FILE.name + ' \\u00b7 open another deck from ' + FILE.folder + ', or copy files into it (' + CMD + ' O)';
    $('btn-files').addEventListener('click', function (e) {
      e.stopPropagation();
      openFilesMenu();
    });
    menuKeys($('files-menu'));
    $('files-menu').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      closeMenu();
      if (b.id === 'files-upload') $('file-upload').click();
      else if (b.dataset.file && b.dataset.file !== FILE.name) switchFile(b.dataset.file);
    });
    $('file-upload').addEventListener('change', function (e) {
      uploadFiles(e.target.files);
      e.target.value = '';
    });
  }

  function bootFromFile() {
    syncHighlightDoc();
    setDocKind(FILE.kind);
    $('docname').value = FILE.name;
    // The name is the file's; renaming a disk file is the shell's job.
    $('docname').readOnly = true;
    $('btn-decks').style.display = 'none';
    updateDocTitle();
    loadFromDisk(false);
    if (FILE.watched && typeof EventSource !== 'undefined') {
      var es = new EventSource('/__events');
      es.onmessage = function (e) {
        var msg = null;
        try { msg = JSON.parse(e.data); } catch (err) {}
        // Claude's own edits reload quietly; the chat already says so.
        if (msg && msg.reload === FILE.name) loadFromDisk(!chatBusy);
      };
    }
    if (CHAT) {
      chatEmptyState();
      if (lsGet(K.chat, '0') === '1') setChatOpen(true, true);
    }
    var missing = new URLSearchParams(location.search).get('missing');
    if (missing !== null) {
      history.replaceState(null, '', '/');
      toast((missing || 'That file') + ' is no longer in ' + (FILE.folder || 'the folder') + ', so ' + FILE.name + ' opened instead.', 'warn');
    }
    showFlash();
    (state.kind === 'html' ? srcHtml : src).focus();
  }

  // A launch with a file opens straight into it; otherwise a deck to resume
  // opens with zero clicks, exactly as before, and only a true first run —
  // nothing in the library at all — shows the start screen.
  if (FILE) {
    bootFromFile();
  } else {
    var index = loadIndex();
    if (index.length === 0) {
      showStartScreen();
    } else {
      var wanted = lsGet(K.current, null);
      openDeck(findDeck(wanted) ? wanted : index[0].id);
    }
  }
})();
</script>
</body>
</html>`;
}
