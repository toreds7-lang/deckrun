/**
 * The design view of an HTML deck: the slide on a zoomable canvas, a bar to
 * insert text boxes, pictures, tables, shapes, lines, and connectors, a bar
 * to download, present, and zoom, and a properties panel for whatever is
 * selected — the slide itself, a text box, a table, a shape, or any element
 * the deck already has.
 *
 * Click selects, drag moves, the handles resize, and a double-click edits
 * text in place (the slide panel's editing). Elements placed here are
 * absolutely positioned; an element the deck lays out itself moves by a CSS
 * `translate`, so its neighbours stay where they are. Every change is a
 * rewrite of one element in the source (`design-kit.ts`), made through the
 * slide panel's single undo history.
 *
 * Like the slide panel, this ships to the page through `toString()`: it is
 * self-contained and never spells a comment opener or a script tag.
 */

export const DESIGN_CSS = `
/* ── Design view ──────────────────────────────────────────────────────── */
#dz-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; container-type: inline-size; }
#dz-canvas { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; outline: none; }
#doc-view.has-slides #dz-canvas { overflow: auto; background: var(--crust); }
#dz-sizer { position: relative; width: 100%; height: 100%; }
#doc-view.has-slides #frame-html {
  position: absolute;
  flex: none;
  transform-origin: 0 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18), 0 10px 34px rgba(0, 0, 0, 0.22);
}
#doc-view:not(.has-slides) #frame-html { width: 100%; height: 100%; }
#dz-overlay { position: absolute; display: none; pointer-events: none; transform-origin: 0 0; z-index: 2; --z: 1; }
#doc-view.has-slides #dz-overlay { display: block; }
#dz-overlay.is-placing { pointer-events: auto; cursor: crosshair; }
#dz-overlay > div { position: absolute; display: none; box-sizing: border-box; }
#dz-overlay > div.is-on { display: block; }
.dz-selbox { border: calc(1.5px / var(--z)) solid #4c8dff; }
.dz-selbox.is-flow { border-style: dashed; }
.dz-hover { border: calc(1px / var(--z)) solid rgba(76, 141, 255, 0.85); }
.dz-rubber { border: calc(1px / var(--z)) dashed #4c8dff; background: rgba(76, 141, 255, 0.08); }
.dz-guide { background: #ff4fa3; }
.dz-guide--v { width: calc(1px / var(--z)) !important; }
.dz-guide--h { height: calc(1px / var(--z)) !important; }
.dz-anchor { width: calc(8px / var(--z)); height: calc(8px / var(--z)); margin: calc(-4px / var(--z)) 0 0 calc(-4px / var(--z)); border-radius: 50%; background: #ff4fa3; }
.dz-h {
  width: calc(9px / var(--z));
  height: calc(9px / var(--z));
  margin: calc(-4.5px / var(--z)) 0 0 calc(-4.5px / var(--z));
  background: #fff;
  border: calc(1.5px / var(--z)) solid #4c8dff;
  border-radius: calc(2px / var(--z));
  pointer-events: auto;
}
.dz-h--p1, .dz-h--p2 { border-radius: 50%; cursor: move; }
.dz-h--nw, .dz-h--se { cursor: nwse-resize; }
.dz-h--ne, .dz-h--sw { cursor: nesw-resize; }
.dz-h--n, .dz-h--s { cursor: ns-resize; }
.dz-h--e, .dz-h--w { cursor: ew-resize; }
.dz-dims {
  padding: calc(2px / var(--z)) calc(6px / var(--z));
  font: calc(11px / var(--z))/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #fff;
  background: #4c8dff;
  border-radius: calc(4px / var(--z));
  white-space: nowrap;
  transform: translateX(-50%);
}
.dz-line { position: absolute; inset: 0; overflow: visible; width: 100%; height: 100%; display: none; }
.dz-line.is-on { display: block; }

.dz-bar {
  position: absolute;
  top: 10px;
  z-index: 5;
  display: none;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 11px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.16);
}
#doc-view.has-slides .dz-bar { display: flex; }
#dz-insert { left: 12px; }
#dz-view { right: 12px; }
/* Too narrow for both bars on one line (the source pane is open): the view bar goes under. */
@container (max-width: 470px) {
  #dz-view { top: 54px; right: auto; left: 12px; }
}
.dz-b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  color: var(--subtext1);
  border-radius: 7px;
}
.dz-b:hover { color: var(--text); background: var(--surface-soft); }
.dz-b[aria-pressed="true"], .dz-b.is-on { color: var(--accent); background: var(--accent-soft); }
.dz-b svg { flex: none; display: block; }
.dz-zoom { min-width: 64px; font: 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; }
.dz-sep { width: 1px; height: 18px; margin: 0 3px; background: var(--surface1); }

#dz-tip {
  position: fixed;
  z-index: 90;
  display: none;
  max-width: 260px;
  padding: 6px 9px;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  color: #f4f4f5;
  background: #111;
  border-radius: 7px;
  pointer-events: none;
}
#dz-tip.is-on { display: flex; gap: 14px; align-items: flex-start; }
#dz-tip kbd { font: inherit; color: #9a9aa2; white-space: nowrap; }
#dz-ghost {
  position: fixed;
  z-index: 90;
  display: none;
  padding: 4px 9px;
  font: 11px system-ui, sans-serif;
  color: var(--crust);
  background: var(--accent);
  border-radius: 999px;
  pointer-events: none;
}
#dz-ghost.is-on { display: block; }

.dz-pop .dr-mi svg { flex: none; color: var(--subtext0); }
.dz-pop .dr-mi { gap: 10px; }
.dz-pop .dr-mi .dz-mi-label { flex: 1 1 auto; }

/* ── Properties panel ─────────────────────────────────────────────────── */
#dz-props {
  display: none;
  flex: 0 0 280px;
  min-width: 0;
  flex-direction: column;
  background: var(--mantle);
  border-left: 1px solid var(--surface0);
  font: 12px/1.35 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  color: var(--text);
}
#doc-view.has-slides.props-on:not(.is-sorter) #dz-props { display: flex; }
#dz-props-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 10px 6px 14px;
  border-bottom: 1px solid var(--surface0);
}
#dz-props-head .dz-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
#dz-props-head .dz-sub { color: var(--overlay1); font-weight: 400; margin-left: 6px; }
.dz-ib {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--overlay1);
  border-radius: 6px;
}
.dz-ib:hover { color: var(--text); background: var(--surface-soft); }
.dz-ib[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
#dz-props-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: 40px; }
.dz-sec { padding: 10px 12px 12px 14px; border-bottom: 1px solid var(--surface0); }
.dz-sec__head { display: flex; align-items: center; gap: 6px; min-height: 22px; margin-bottom: 6px; }
.dz-sec__title { flex: 1 1 auto; font-weight: 600; font-size: 12px; }
.dz-sec__head .dz-ib { width: 22px; height: 22px; }
.dz-sec.is-folded .dz-sec__head { margin-bottom: 0; }
.dz-sec.is-folded .dz-sec__body { display: none; }
.dz-sec__sub { margin: 10px 0 5px; font-size: 11px; font-weight: 600; color: var(--subtext0); }
.dz-row { display: flex; align-items: center; gap: 6px; min-height: 28px; }
.dz-row + .dz-row { margin-top: 3px; }
.dz-row > label, .dz-label {
  flex: 0 0 74px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--overlay1);
}
.dz-row > .dz-ctl { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 5px; }
.dz-ctl > * { min-width: 0; }
.dz-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 5px; flex: 1 1 auto; min-width: 0; }
.dz-field, .dz-select, .dz-text {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
  height: 26px;
  padding: 0 7px;
  background: var(--base);
  border: 1px solid var(--surface0);
  border-radius: 6px;
  color: var(--text);
}
.dz-field:focus-within, .dz-select:focus, .dz-text:focus-within { border-color: var(--accent); }
.dz-field input, .dz-text input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.dz-field .dz-unit { flex: none; font-size: 10.5px; color: var(--overlay0); }
.dz-field .dz-fi { flex: none; display: inline-flex; color: var(--overlay0); cursor: ew-resize; }
.dz-select { appearance: none; -webkit-appearance: none; font: inherit; cursor: pointer; padding-right: 22px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 12px) 11px, calc(100% - 8px) 11px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.dz-select option { color: var(--text); background: var(--base); }
.dz-mode { flex: 0 0 82px; }
.dz-seg { display: flex; flex: 1 1 auto; min-width: 0; padding: 2px; gap: 2px; background: var(--base); border: 1px solid var(--surface0); border-radius: 7px; }
.dz-seg button { flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; min-width: 0; height: 22px; color: var(--overlay1); border-radius: 5px; font-size: 11.5px; }
.dz-seg button:hover { color: var(--text); }
.dz-seg button[aria-pressed="true"] { color: var(--text); background: var(--surface0); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.dz-seg--toggles { flex: 0 0 auto; }
.dz-seg--toggles button { flex: 0 0 26px; }
.dz-swatch {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--surface1);
  background-color: transparent;
  background-image: linear-gradient(45deg, rgba(128,128,128,.35) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.35) 75%),
    linear-gradient(45deg, rgba(128,128,128,.35) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.35) 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.dz-swatch > i { position: absolute; inset: 0; }
.dz-range { flex: 1 1 auto; min-width: 0; accent-color: var(--accent); }
.dz-small { flex: 0 0 64px !important; }
.dz-check { width: 15px; height: 15px; accent-color: var(--accent); }
.dz-link { flex: none; font-size: 11px; color: var(--accent); }
.dz-link:hover { text-decoration: underline; }
.dz-note { margin-top: 6px; font-size: 11px; line-height: 1.45; color: var(--overlay0); }
.dz-fx { display: flex; align-items: center; gap: 7px; min-height: 28px; padding: 0 2px 0 0; border-radius: 6px; cursor: pointer; }
.dz-fx:hover { background: var(--surface-soft); }
.dz-fx__name { flex: 0 0 74px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--overlay1); font-size: 11.5px; }
.dz-fx__sum { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dz-fx__alpha { flex: none; color: var(--overlay0); font-size: 11px; }
.dz-fx-edit { margin: 2px 0 8px; padding: 8px; background: var(--base); border: 1px solid var(--surface0); border-radius: 8px; }

#dz-pop { width: 248px; padding: 10px; font: 12px system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); }
.dz-pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
.dz-pal button { aspect-ratio: 1; border-radius: 5px; border: 1px solid var(--surface1); position: relative; overflow: hidden; }
.dz-pal button:hover { outline: 2px solid var(--accent); outline-offset: 1px; }
.dz-pop-title { margin: 8px 0 6px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--overlay0); }
.dz-pop-title:first-child { margin-top: 0; }
.dz-pop-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.dz-pop-row input[type="color"] { flex: none; width: 34px; height: 28px; padding: 0; border: 1px solid var(--surface1); border-radius: 6px; background: none; cursor: pointer; }
.dz-pop-row .dz-btn { flex: 1 1 0; height: 26px; padding: 0 8px; font-size: 11.5px; color: var(--subtext0); border: 1px solid var(--surface1); border-radius: 6px; }
.dz-pop-row .dz-btn:hover { color: var(--text); border-color: var(--accent); }

html[data-doc-kind="html"].code-off #pane-edit,
html[data-doc-kind="html"].code-off #divider { display: none !important; }
#dh-code[aria-pressed="false"] { color: var(--accent); border-color: var(--accent-line, var(--accent)); }
`;

/** The canvas: the preview frame on a zoomable stage, with its two bars. Replaces the bare preview frame. */
export const DESIGN_CANVAS = `<div id="dz-stage">
              <div id="dz-canvas" tabindex="-1">
                <div id="dz-sizer">
                  <iframe id="frame-html" title="HTML doc preview"></iframe>
                  <div id="dz-overlay" aria-hidden="true"></div>
                </div>
              </div>
              <div class="dz-bar" id="dz-insert" role="toolbar" aria-label="Insert">
                <button class="dz-b" data-tool="text" data-icon="text" data-tip="Add a text box: click, then click the slide where it goes. Or drag it onto the slide" data-key="T" aria-label="Text box"></button>
                <button class="dz-b" data-tool="image" data-icon="image" data-tip="Insert an image or video&hellip;" aria-label="Image or video"></button>
                <button class="dz-b" data-tool="table" data-icon="table" data-tip="Insert a table &mdash; click, or drag onto the slide" aria-label="Table"></button>
                <button class="dz-b" id="dz-shapes" data-icon="shapes" data-chev="1" data-tip="Shapes, lines, and connectors" aria-haspopup="true" aria-label="Shapes"></button>
              </div>
              <div class="dz-bar" id="dz-view" role="toolbar" aria-label="View">
                <button class="dz-b" id="dz-download" data-icon="download" data-tip="Download the presentation as a PDF or a web page (skipped slides stay out), or this slide as an image" aria-haspopup="true" aria-label="Download"></button>
                <button class="dz-b" id="dz-play" data-icon="play" data-tip="Present from this slide" data-key="Ctrl Shift Enter" aria-label="Present"></button>
                <span class="dz-sep"></span>
                <button class="dz-b" id="dz-panel" data-icon="panel" data-tip="Show or hide the properties panel" aria-pressed="true" aria-label="Properties panel"></button>
                <span class="dz-sep"></span>
                <button class="dz-b dz-zoom" id="dz-zoom" data-chev="1" data-tip="Zoom" data-key="Ctrl + / Ctrl &minus; / Ctrl 0" aria-haspopup="true"><span id="dz-zoom-v">100%</span></button>
              </div>
            </div>`;

/** The properties panel, beside the canvas. */
export const DESIGN_PANEL = `<aside id="dz-props" aria-label="Properties">
            <div id="dz-props-head"></div>
            <div id="dz-props-body"></div>
          </aside>`;

/** Menus, the color picker, the tooltip, and the drag ghost. */
export const DESIGN_POPS = `<div id="dz-menu" class="dr-pop dz-pop" role="menu" tabindex="-1"></div>
        <div id="dz-pop" class="dr-pop" tabindex="-1"></div>
        <div id="dz-tip" role="tooltip"></div>
        <div id="dz-ghost" aria-hidden="true"></div>`;

/**
 * host.panel       the slide panel's API (apply, model, current, inspectMap, editText, editingEl, undo, redo, go)
 * host.src         the HTML source textarea
 * host.frame       the preview iframe
 * host.isHtml()    an HTML doc is open
 * host.inspecting() the inspector's picker is on
 * host.pick(pos)   the selection is the element at pos: the caret goes there (unfocused) and the chat's "this" follows
 * host.reveal(pos) show the source at pos, focused
 * host.upload(file) → Promise of a URL the deck can use (copied into its folder, or a data: URL)
 * host.download(kind, k) "pdf" | "web" | "png"
 * host.present(k)  present from slide k
 * host.reload()    rebuild the preview now
 * host.toast       host.get / host.set (localStorage)   host.cmd ("Cmd" or "Ctrl")
 */
export function designer(S: any, K: any, host: any): any {
  const doc: any = document;
  const $ = function (id: string): any { return doc.getElementById(id); };
  const panel = host.panel;
  const src: any = host.src;
  const frame: any = host.frame;
  const view = $("doc-view"), stage = $("dz-stage"), canvas = $("dz-canvas"), sizer = $("dz-sizer"), overlay = $("dz-overlay");
  const props = $("dz-props"), head = $("dz-props-head"), body = $("dz-props-body");
  const menu = $("dz-menu"), pop = $("dz-pop"), tipEl = $("dz-tip"), ghost = $("dz-ghost");
  // The panel is remembered per mode: beside the source it is off at first, in the design view on.
  const KEY = { zoom: "deckrun.design.zoom.v1", props: "deckrun.design.props.", adv: "deckrun.design.advanced.v1" };
  let mode = "design";
  const PAD = 28, PAD_TOP = 60;
  const LINES: Record<string, 1> = { line: 1, connector: 1 };
  const PATHED: Record<string, 1> = { diamond: 1, "arrow-right": 1, "arrow-left": 1, "arrow-up": 1, "arrow-down": 1 };
  const NAMES: Record<string, string> = {
    text: "Text", rect: "Rectangle", rounded: "Rounded rectangle", ellipse: "Ellipse", diamond: "Diamond",
    "arrow-right": "Arrow", "arrow-left": "Arrow", "arrow-up": "Arrow", "arrow-down": "Arrow",
    line: "Line", connector: "Connector", table: "Table", image: "Image", video: "Video",
  };
  const cmd = function (s: string): string { return s.replace(/Ctrl/g, host.cmd || "Ctrl"); };

  const ICONS: Record<string, string> = {
    text: '<path d="M3.5 3.5h9M8 3.5V13"/>',
    image: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><circle cx="10" cy="6" r="1.4"/><path d="M2.8 11.2l3.2-3 3.5 3.3"/>',
    table: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 6.2h11M2.5 9.8h11M6.4 6.2v7.3"/>',
    shapes: '<rect x="2" y="2" width="8" height="8" rx="1.6"/><circle cx="10.4" cy="10.4" r="3.6"/>',
    chev: '<path d="M5.5 7l2.5 2.5L10.5 7"/>',
    download: '<path d="M8 2.5v7.5M5 7.2l3 3 3-3M3 13h10"/>',
    play: '<path d="M5 3.4v9.2L12.2 8z"/>',
    panel: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M10.2 3v10"/>',
    rect: '<rect x="2.5" y="3.5" width="11" height="9" rx=".5"/>',
    rounded: '<rect x="2.5" y="3.5" width="11" height="9" rx="2.6"/>',
    ellipse: '<circle cx="8" cy="8" r="5.5"/>',
    diamond: '<path d="M8 2.2L13.8 8 8 13.8 2.2 8z"/>',
    "arrow-right": '<path d="M2.5 6.2h6V3.6L13.5 8l-5 4.4V9.8h-6z"/>',
    "arrow-left": '<path d="M13.5 6.2h-6V3.6L2.5 8l5 4.4V9.8h6z"/>',
    "arrow-up": '<path d="M6.2 13.5v-6H3.6L8 2.5l4.4 5H9.8v6z"/>',
    "arrow-down": '<path d="M6.2 2.5v6H3.6L8 13.5l4.4-5H9.8v-6z"/>',
    line: '<path d="M3 13L13 3"/>',
    connector: '<path d="M3 13L12.5 3.5M7.5 3.3h5.2v5.2"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    minus: '<path d="M3.5 8h9"/>',
    right: '<path d="M6.5 4.5L10 8l-3.5 3.5"/>',
    down: '<path d="M4.5 6.5L8 10l3.5-3.5"/>',
    parent: '<path d="M8 13V3.5M4.5 7L8 3.5 11.5 7"/>',
    code: '<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    sides: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2 2"/><path d="M5.5 5.5h5v5h-5z"/>',
    corners: '<path d="M2.5 6V4.5a2 2 0 012-2H6M10 2.5h1.5a2 2 0 012 2V6M13.5 10v1.5a2 2 0 01-2 2H10M6 13.5H4.5a2 2 0 01-2-2V10"/>',
    pt: '<path d="M3 3.5h10"/>', pr: '<path d="M12.5 3v10"/>', pb: '<path d="M3 12.5h10"/>', pl: '<path d="M3.5 3v10"/>',
    lh: '<path d="M2.5 3h11M2.5 13h11M6 6h7M6 10h7M3.5 6.5v3"/>',
    ls: '<path d="M2.5 3v10M13.5 3v10M5.5 11L8 5l2.5 6M6.3 9.3h3.4"/>',
    "al-left": '<path d="M2.5 4h11M2.5 8h7M2.5 12h9"/>',
    "al-center": '<path d="M2.5 4h11M4.5 8h7M3.5 12h9"/>',
    "al-right": '<path d="M2.5 4h11M6.5 8h7M4.5 12h9"/>',
    "al-justify": '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
    none: '<circle cx="8" cy="8" r="5.3"/><path d="M4.3 11.7l7.4-7.4"/>',
    bullets: '<path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/><circle cx="3.4" cy="4.5" r=".8"/><circle cx="3.4" cy="8" r=".8"/><circle cx="3.4" cy="11.5" r=".8"/>',
    numbers: '<path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7M2.6 3.4l1-.5v3M2.4 9.2c.2-.6 1.6-.7 1.6.2 0 .6-1.6 1.3-1.6 2.1H4"/>',
    solid: '<path d="M2.5 8h11"/>',
    dashed: '<path d="M2.5 8h3M7 8h2.5M11 8h2.5"/>',
    dotted: '<path d="M2.6 8h.1M5.4 8h.1M8.2 8h.1M11 8h.1M13.4 8h.1" stroke-width="2"/>',
    shadow: '<rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.5"/><path d="M13.5 5.5v6.5a1.5 1.5 0 01-1.5 1.5H5.5"/>',
    blur: '<circle cx="8" cy="8" r="5.3" stroke-dasharray="1.6 1.6"/>',
    rot: '<path d="M12.8 7.2A5 5 0 113.6 5M3.2 2.5v2.8h2.8"/>',
    front: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M2.5 9V3.7a1.2 1.2 0 011.2-1.2H9"/>',
    back: '<rect x="2.5" y="2.5" width="8" height="8" rx="1.2"/><path d="M13.5 7v5.3a1.2 1.2 0 01-1.2 1.2H7"/>',
  };

  function icon(name: string, size?: number): string {
    const s = size || 16;
    const body = ICONS[name] || "";
    const fill = name === "play" ? ' fill="currentColor"' : ' fill="none"';
    return '<svg viewBox="0 0 16 16" width="' + s + '" height="' + s + '"' + fill +
      ' stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  }

  Array.prototype.slice.call(stage.querySelectorAll("[data-icon], [data-chev]")).forEach(function (b: any) {
    const label = b.innerHTML;
    const ic = b.getAttribute("data-icon");
    b.innerHTML = (ic ? icon(ic) : "") + label + (b.getAttribute("data-chev") ? icon("chev", 12) : "");
  });

  // ── State ──────────────────────────────────────────────────────────────

  let zoom: any = host.get(KEY.zoom, "fit");
  zoom = zoom === "fit" ? "fit" : Math.max(0.1, Math.min(4, parseFloat(zoom) || 1));
  let scale = 1;
  let slideW = 1280, slideH = 720;
  let sel: any = null;           // { key, start, cell }: the selected element, by its preview tag and source offset
  let pendingStart = -1;         // select the element at this source offset once the preview is up
  let editAfter = false;         // and start typing in it
  let lastSrc: string = src.value;
  let tool: string | null = null;
  let drag: any = null;
  let hoverEl: any = null;
  let propsOn = host.get(KEY.props + mode + ".v1", "1") !== "0";
  let advOn = host.get(KEY.adv, "0") === "1";
  let clip = "";
  let press = false;             // a press on the slide that the design view took
  let fonts: any[] = [];
  let presets: any[] = [];
  let themeColors: any[] = [];
  let fitTimer: any = null;
  let until = 0, raf = 0;

  function fdoc(): any { try { return frame.contentDocument; } catch (e) { return null; } }

  function on(): boolean {
    return !!host.isHtml() && view.classList.contains("has-slides") && !view.classList.contains("is-sorter");
  }

  function kick(): void {
    until = Math.max(until, Date.now() + 600);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(): void {
    raf = 0;
    try { draw(); } catch (e) {}
    if (drag || Date.now() < until) raf = requestAnimationFrame(tick);
  }

  // ── Canvas and zoom ────────────────────────────────────────────────────

  function layout(): void {
    const frames = [frame, overlay];
    if (!view.classList.contains("has-slides")) {
      frames.forEach(function (el: any) { el.style.left = el.style.top = el.style.width = el.style.height = el.style.transform = ""; });
      sizer.style.width = sizer.style.height = "";
      return;
    }
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    // The slide starts below the bars, however many rows they take.
    let top = PAD_TOP;
    [$("dz-insert"), $("dz-view")].forEach(function (b: any) { if (b.offsetHeight) top = Math.max(top, b.offsetTop + b.offsetHeight + 10); });
    const fit = Math.max(0.05, Math.min((cw - PAD * 2) / slideW, (ch - top - PAD) / slideH));
    scale = zoom === "fit" ? fit : zoom;
    const w = slideW * scale, h = slideH * scale;
    const sw = Math.max(cw, w + PAD * 2), sh = Math.max(ch, h + top + PAD);
    // Only a slide bigger than the canvas sizes the scroll area; otherwise it stays at 100%.
    // clientWidth/Height are rounded, so pinning the sizer to them can overshoot the real box by
    // a fraction of a pixel (browser zoom, 150% displays). The canvas then grows scrollbars,
    // shrinks, refits the slide smaller, loses them, grows, and refits again, every frame.
    sizer.style.width = sw > cw + 1 ? sw + "px" : "";
    sizer.style.height = sh > ch + 1 ? sh + "px" : "";
    const x = Math.round(Math.max(PAD, (sw - w) / 2));
    const y = Math.round(Math.max(top, (sh - h) / 2));
    frames.forEach(function (el: any) {
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.width = slideW + "px";
      el.style.height = slideH + "px";
      el.style.transform = "scale(" + scale + ")";
    });
    overlay.style.setProperty("--z", String(scale));
    $("dz-zoom-v").textContent = Math.round(scale * 100) + "%";
    kick();
  }

  const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.88, 1, 1.25, 1.5, 2, 3, 4];

  function setZoom(z: any, at?: any): void {
    const before = scale;
    const cr = canvas.getBoundingClientRect();
    const ax = at ? at.x - cr.left : canvas.clientWidth / 2, ay = at ? at.y - cr.top : canvas.clientHeight / 2;
    const fr = frame.getBoundingClientRect();
    const fx = (cr.left + ax - fr.left) / before, fy = (cr.top + ay - fr.top) / before;
    zoom = z === "fit" ? "fit" : Math.max(0.1, Math.min(4, z));
    host.set(KEY.zoom, String(zoom));
    layout();
    if (zoom !== "fit") {
      const f2 = frame.getBoundingClientRect();
      canvas.scrollLeft += f2.left + fx * scale - (cr.left + ax);
      canvas.scrollTop += f2.top + fy * scale - (cr.top + ay);
    }
  }

  function zoomBy(d: number, at?: any): void {
    let next = scale;
    if (d > 0) { for (let i = 0; i < STEPS.length; i++) if (STEPS[i] > scale + 0.001) { next = STEPS[i]; break; } }
    else { for (let i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < scale - 0.001) { next = STEPS[i]; break; } }
    setZoom(next, at);
  }

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { layout(); }).observe(canvas);
  window.addEventListener("resize", layout);

  canvas.addEventListener("wheel", function (e: any) {
    if (!(e.ctrlKey || e.metaKey) || !on()) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
  }, { passive: false });

  canvas.addEventListener("pointerdown", function (e: any) {
    // The grey around the slide: nothing is selected there.
    if (e.target === canvas || e.target === sizer) {
      closeAll();
      if (sel) select(null);
      focusCanvas();
    }
  });

  canvas.addEventListener("scroll", kick);

  function focusCanvas(): void {
    try { canvas.focus({ preventScroll: true }); } catch (e) {}
  }

  /** Finds the slide's own size, so the frame is exactly one slide and the deck draws it at 1:1. */
  function measure(): void {
    const d = fdoc();
    if (!d) return;
    const k = Math.max(0, panel.current());
    const unit = d.querySelector('[data-dr-slide="' + k + '"]') || d.querySelector("[data-dr-slide]");
    if (!unit) return;
    const w = unit.offsetWidth, h = unit.offsetHeight;
    if (w >= 320 && w <= 3840 && h >= 180 && h <= 2400 && w / h > 0.4 && w / h < 3.2 && (w !== slideW || h !== slideH)) {
      slideW = w;
      slideH = h;
      layout();
    }
  }

  // ── The map from the preview to the source ─────────────────────────────

  function map(): any { return panel.inspectMap(); }

  function nodeOf(key: any): any {
    const m = map();
    return m && key !== null && key !== undefined ? m.nodes[+key] || null : null;
  }

  function keyOf(el: any): string | null {
    return el && el.getAttribute ? el.getAttribute("data-dr-n") : null;
  }

  function liveOf(key: any): any {
    const d = fdoc();
    if (!d || key === null || key === undefined) return null;
    const list = d.querySelectorAll('[data-dr-n="' + key + '"]');
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (r.width || r.height) return list[i];
    }
    return list[0] || null;
  }

  function selEl(): any { return sel && sel.key !== null ? liveOf(sel.key) : null; }
  function selNode(): any { return sel && sel.key !== null ? nodeOf(sel.key) : null; }

  function slideOfNode(n: any): any {
    const m = map();
    if (!m || !m.model || !n) return null;
    return m.model.slides[m.slideAt(n.start)] || null;
  }

  /** The slide's own boxes — its wrapper and the `.slide` inside — are the slide, not something on it. */
  function isSlideBox(el: any): boolean {
    if (!el || !el.getAttribute) return true;
    if (el.hasAttribute("data-dr-slide")) return true;
    const n = nodeOf(keyOf(el));
    const s = slideOfNode(n);
    if (!n || !s) return true;
    for (let p = s.core; p; p = p.parent) {
      if (p === n) return true;
      if (p === s.unit) break;
    }
    return false;
  }

  function kindOf(el: any): string {
    return el && el.getAttribute ? el.getAttribute("data-dz") || "" : "";
  }

  function topDz(el: any, unit: any): any {
    let found: any = null;
    for (let p = el; p && p !== unit; p = p.parentElement) if (p.hasAttribute && p.hasAttribute("data-dz")) found = p;
    return found;
  }

  function taggedParent(el: any): any {
    const p = el.parentElement;
    return p && p.closest ? p.closest("[data-dr-n]") : null;
  }

  /**
   * What a click at `t` selects: a box placed here as a whole; otherwise the
   * block the click landed in (an inline run counts as its block, a cell as
   * its table). `deep` takes the innermost element instead.
   */
  function candidate(t: any, deep: boolean): any {
    let el = t && t.nodeType === 1 ? t : t && t.parentElement;
    if (!el || !el.closest) return null;
    el = el.closest("[data-dr-n]");
    if (!el) return null;
    const unit = el.closest("[data-dr-slide]");
    if (!unit || isSlideBox(el)) return null;
    const dz = topDz(el, unit);
    if (dz && !deep) return dz;
    if (deep) return el;
    const w = el.ownerDocument.defaultView;
    for (;;) {
      const p = taggedParent(el);
      if (!p || isSlideBox(p)) break;
      const d = w.getComputedStyle(el).display;
      if (d !== "inline" && d !== "contents") break;
      el = p;
    }
    const inner = el.closest("td,th,tr,thead,tbody,tfoot,caption");
    if (inner) {
      const tbl = inner.closest("table");
      if (tbl && unit.contains(tbl) && tbl.hasAttribute("data-dr-n") && !isSlideBox(tbl)) return tbl;
    }
    return el;
  }

  function select(key: any, opts?: any): void {
    if (key === null || key === undefined) {
      sel = null;
    } else {
      const n = nodeOf(key);
      sel = n ? { key: String(key), start: n.start, cell: opts && opts.cell ? opts.cell : null } : null;
      if (n) host.pick(n.start);
    }
    hoverEl = null;
    kick();
    renderPanel();
  }

  /** After the source changed: where the selected element went, by its offset. */
  function mapPos(a: string, b: string, pos: number): number {
    const n1 = a.length, n2 = b.length;
    let i = 0;
    while (i < n1 && i < n2 && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    let j = 0;
    while (j < n1 - i && j < n2 - i && a.charCodeAt(n1 - 1 - j) === b.charCodeAt(n2 - 1 - j)) j++;
    if (pos < i) return pos;
    if (pos >= n1 - j) return pos + n2 - n1;
    return -1;
  }

  function resolve(): void {
    const m = map();
    if (!m || !sel) return;
    const n = m.nodes[+sel.key];
    if (sel.key !== null && n && n.start === sel.start) return;
    sel.key = null;
    for (let i = 0; i < m.nodes.length; i++) {
      if (m.nodes[i].start === sel.start) { sel.key = String(i); break; }
    }
    if (sel.key === null) sel = null;
  }

  // ── Drawing ────────────────────────────────────────────────────────────

  function mk(cls: string): any {
    const d = doc.createElement("div");
    d.className = cls;
    overlay.appendChild(d);
    return d;
  }

  const hov = mk("dz-hover"), box = mk("dz-selbox"), rubber = mk("dz-rubber"), dims = mk("dz-dims");
  const guideV = mk("dz-guide dz-guide--v"), guideH = mk("dz-guide dz-guide--h");
  const anchorDot = mk("dz-anchor");
  const handles: any = {};
  ["nw", "n", "ne", "e", "se", "s", "sw", "w", "p1", "p2"].forEach(function (h) {
    const d = mk("dz-h dz-h--" + h);
    d.setAttribute("data-h", h);
    handles[h] = d;
  });
  const lineGhost = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  lineGhost.setAttribute("class", "dz-line");
  overlay.appendChild(lineGhost);

  function put(d: any, x: number, y: number, w?: number, h?: number): void {
    d.style.left = x + "px";
    d.style.top = y + "px";
    if (w !== undefined) d.style.width = Math.max(0, w) + "px";
    if (h !== undefined) d.style.height = Math.max(0, h) + "px";
    d.classList.add("is-on");
  }

  function off(d: any): void { d.classList.remove("is-on"); }

  function rectOf(el: any): any {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function lineEnds(el: any): any {
    const ln = el && el.querySelector ? el.querySelector("line") : null;
    if (!ln) return null;
    const r = el.getBoundingClientRect();
    const vb = el.viewBox && el.viewBox.baseVal;
    const sx = vb && vb.width ? r.width / vb.width : 1, sy = vb && vb.height ? r.height / vb.height : 1;
    const g = function (n: string): number { return parseFloat(ln.getAttribute(n)) || 0; };
    return { a: { x: r.left + g("x1") * sx, y: r.top + g("y1") * sy }, b: { x: r.left + g("x2") * sx, y: r.top + g("y2") * sy } };
  }

  function draw(): void {
    const el = on() ? selEl() : null;
    const isLine = !!el && !!LINES[kindOf(el)];
    const showBox = !!el && !isLine && !(drag && drag.kind === "place");
    Object.keys(handles).forEach(function (h) { off(handles[h]); });
    if (showBox) {
      const r = rectOf(el);
      put(box, r.x, r.y, r.w, r.h);
      box.classList.toggle("is-flow", !isAbs(el));
      const editingNow = panel.editingEl() && el.contains(panel.editingEl());
      if (!editingNow) {
        const pts: any = {
          nw: [r.x, r.y], n: [r.x + r.w / 2, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, r.y + r.h / 2],
          se: [r.x + r.w, r.y + r.h], s: [r.x + r.w / 2, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, r.y + r.h / 2],
        };
        // A thin box keeps the two handles along its length; the rest would sit on top of each other.
        const thinW = r.w * scale < 26, thinH = r.h * scale < 26;
        Object.keys(pts).forEach(function (h) {
          if (thinH && !thinW && h !== "e" && h !== "w") return;
          if (thinW && !thinH && h !== "n" && h !== "s") return;
          if (thinW && thinH && h !== "se") return;
          put(handles[h], pts[h][0], pts[h][1]);
        });
      }
    } else {
      off(box);
    }
    if (isLine) {
      const ends = lineEnds(el);
      if (ends) { put(handles.p1, ends.a.x, ends.a.y); put(handles.p2, ends.b.x, ends.b.y); }
    }
    if (hoverEl && hoverEl !== el && on() && !drag && hoverEl.isConnected) {
      const r = rectOf(hoverEl);
      put(hov, r.x, r.y, r.w, r.h);
    } else {
      off(hov);
    }
    if (drag && drag.started && drag.label && el) {
      const r = rectOf(el);
      dims.textContent = drag.label;
      put(dims, r.x + r.w / 2, r.y + r.h + 8 / scale);
    } else if (!drag || !drag.started) {
      off(dims);
    }
    if (!drag) { off(guideV); off(guideH); off(anchorDot); }
  }

  // ── Element geometry, in the deck's own CSS pixels ─────────────────────

  function cs(el: any): any { return el.ownerDocument.defaultView.getComputedStyle(el); }

  function isAbs(el: any): boolean {
    const p = cs(el).position;
    return p === "absolute" || p === "fixed";
  }

  /** Frame pixels per CSS pixel of the element: 1 unless the deck scales its stage. */
  function kOf(el: any): number {
    // An SVG element has no offset box; its HTML parent scales the same.
    while (el && el.offsetWidth === undefined) el = el.parentElement;
    if (!el || !el.offsetWidth) return 1;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  }

  function firstEl(html: string): any {
    return S.parse(html).children.filter(function (c: any) { return c.kind === "el"; })[0] || null;
  }

  /**
   * Several edits to one element, made on its own markup one after another
   * (two edits to one tag would overlap), then put back in the source.
   * ops: { style: changes } or { attr: [name, value] }.
   */
  function local(n: any, ops: any[]): string {
    let html = K.outer(src.value, n);
    ops.forEach(function (op) {
      const el = firstEl(html);
      if (!el) return;
      html = op.style ? K.setStyle(html, el, op.style) : K.setAttr(html, el, op.attr[0], op.attr[1]);
    });
    return src.value.slice(0, n.start) + html + src.value.slice(n.end);
  }

  function pxv(v: string, dflt: number): number {
    const n = parseFloat(v);
    return isFinite(n) ? n : dflt;
  }

  function translateOf(el: any): any {
    const t = cs(el).translate;
    if (!t || t === "none") return { x: 0, y: 0 };
    const p = t.split(/\s+/);
    return { x: pxv(p[0], 0), y: pxv(p[1] || "0", 0) };
  }

  function rotateOf(el: any): number {
    const r = cs(el).rotate;
    if (!r || r === "none") return 0;
    const m = /(-?[\d.]+)deg/.exec(r);
    return m ? parseFloat(m[1]) : 0;
  }

  /** The box new elements are placed in on slide k, and how frame pixels map into it. */
  function placing(k: number): any {
    const m = map();
    const pm = panel.model();
    const s = pm.slides[k];
    if (!m || !s) return null;
    const coreIdx = m.nodes.indexOf(m.model.slides[k] ? m.model.slides[k].core : null);
    const d = fdoc();
    const core = coreIdx >= 0 && d ? d.querySelector('[data-dr-n="' + coreIdx + '"]') : null;
    if (!core) return null;
    const w = core.ownerDocument.defaultView;
    // New boxes are placed against the slide itself. A slide that is not
    // positioned gets `position: relative`: its wrapper may hold it on screen,
    // but a deck's print styles often let go of the wrapper (a PDF export),
    // and the boxes must stay on their slide there too.
    const needsRel = w.getComputedStyle(core).position === "static";
    const cb = core;
    const r = cb.getBoundingClientRect();
    const k2 = cb.offsetWidth ? r.width / cb.offsetWidth || 1 : 1;
    return {
      node: s.core, live: core, needsRel, k: k2,
      ox: r.left + cb.clientLeft * k2, oy: r.top + cb.clientTop * k2,
      w: cb.clientWidth, h: cb.clientHeight,
    };
  }

  // ── Committing a change ────────────────────────────────────────────────

  function patchStyle(el: any, changes: any): void {
    Object.keys(changes).forEach(function (p) {
      const v = changes[p];
      if (v === null || v === undefined || v === "") el.style.removeProperty(p);
      else el.style.setProperty(p, v);
    });
  }

  /**
   * A change that leaves every element where it was (a style, an attribute):
   * the source is rewritten and the preview patched in place, no reload.
   */
  function commit(next: string, tag: string, fold: boolean, patch: () => void): boolean {
    if (next === src.value) { patch(); kick(); return true; }
    const ok = panel.apply(next, { kind: "dz:" + tag, fold, quiet: true });
    if (ok) patch(); else host.reload();
    // The change added or took away an element after all (an arrow head on a
    // line): the preview's tags no longer line up, so draw it again.
    if (ok && !map()) {
      if (sel) pendingStart = sel.start;
      host.reload();
    }
    kick();
    refresh();
    return ok;
  }

  /** A change to the shape of the document: the preview reloads, and `start` is selected after. */
  function rebuild(next: string, tag: string, start: number, typeAfter?: boolean): boolean {
    if (next === src.value) return false;
    const keep = { sel, pendingStart, editAfter };
    pendingStart = start;
    editAfter = !!typeAfter;
    const ok = panel.apply(next, { kind: "dz:" + tag, fold: false });
    if (!ok) { sel = keep.sel; pendingStart = keep.pendingStart; editAfter = keep.editAfter; }
    return ok;
  }

  function setStyle(el: any, n: any, changes: any, tag: string, fold?: boolean): boolean {
    if (!el || !n) return false;
    return commit(K.setStyle(src.value, n, changes), tag + ":" + sel.key, fold !== false, function () { patchStyle(el, changes); });
  }

  function styleSel(changes: any, tag: string, fold?: boolean): boolean {
    return setStyle(selEl(), selNode(), changes, tag, fold);
  }

  function attrSel(name: string, value: string | null, tag: string): boolean {
    const el = selEl(), n = selNode();
    if (!el || !n) return false;
    return commit(K.setAttr(src.value, n, name, value), tag + ":" + sel.key, true, function () {
      if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
    });
  }

  /** Swaps an element's markup for `html` of the same shape, keeping the preview's tags on it. */
  function swap(el: any, n: any, html: string, tag: string, more?: any[]): boolean {
    const edits = [{ at: n.start, del: n.end - n.start, ins: html }].concat(more || []);
    const next = K.apply(src.value, edits);
    return commit(next, tag + ":" + keyOf(el), true, function () { patchOuter(el, html); });
  }

  function patchOuter(el: any, html: string): void {
    const d = el.ownerDocument;
    const holder = d.createElementNS(el.namespaceURI || "http://www.w3.org/1999/xhtml", el.namespaceURI === "http://www.w3.org/2000/svg" ? "svg" : "div");
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      const t = d.createElement("template");
      t.innerHTML = html;
      const fresh = t.content.firstElementChild;
      if (!fresh) return;
      copyTags(el, fresh);
      el.replaceWith(d.importNode(fresh, true));
      return;
    }
    holder.innerHTML = html;
    const fresh2 = holder.firstElementChild;
    if (!fresh2) return;
    copyTags(el, fresh2);
    el.replaceWith(fresh2);
  }

  function copyTags(from: any, to: any): void {
    const a = [from].concat(Array.prototype.slice.call(from.querySelectorAll("*")));
    const b = [to].concat(Array.prototype.slice.call(to.querySelectorAll("*")));
    for (let i = 0; i < a.length && i < b.length; i++) {
      ["data-dr-n", "data-dr-t"].forEach(function (n) {
        const v = a[i].getAttribute(n);
        if (v !== null) b[i].setAttribute(n, v);
      });
    }
  }

  // ── Selecting and moving on the slide ──────────────────────────────────

  function attach(win: any): void {
    try {
      if (!win || win.__drDesign) return;
      win.__drDesign = true;
    } catch (e) { return; }
    win.addEventListener("pointerdown", onFrameDown, true);
    win.addEventListener("pointermove", onFrameMove, true);
    win.addEventListener("pointerup", onFrameUp, true);
    win.addEventListener("pointercancel", onFrameUp, true);
    win.addEventListener("mousedown", swallow, true);
    win.addEventListener("mouseup", swallow, true);
    win.addEventListener("click", swallowClick, true);
    win.addEventListener("dblclick", onFrameDbl, true);
    win.addEventListener("contextmenu", onFrameContext, true);
    win.addEventListener("keydown", function (e: any) { onKey(e, true); }, true);
    win.addEventListener("wheel", function (e: any) {
      if (!(e.ctrlKey || e.metaKey) || !on()) return;
      e.preventDefault();
      const fr = frame.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1 : -1, { x: fr.left + e.clientX * scale, y: fr.top + e.clientY * scale });
    }, { passive: false, capture: true });
    win.addEventListener("dragover", function (e: any) {
      if (on() && hasFiles(e)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    win.addEventListener("drop", function (e: any) {
      if (!on() || !hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dropFiles(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
    }, true);
    win.addEventListener("pointerleave", function () { if (hoverEl) { hoverEl = null; kick(); } });
    ["scroll", "resize", "transitionend", "animationend", "hashchange"].forEach(function (t) { win.addEventListener(t, kick, true); });
  }

  function editingTarget(t: any): boolean {
    const ed = panel.editingEl();
    return !!ed && !!t && ed.contains(t);
  }

  function swallow(e: any): void {
    if (press && !editingTarget(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }

  function swallowClick(e: any): void {
    if (!on() || e.altKey || editingTarget(e.target) || host.inspecting()) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onFrameDown(e: any): void {
    press = false;
    if (!on() || e.altKey || host.inspecting() || editingTarget(e.target)) return;
    if (e.button !== 0 && e.button !== 2) return;
    press = true;
    e.stopPropagation();
    closeAll();
    if (e.button === 2) return;
    focusCanvas();
    const deep = e.ctrlKey || e.metaKey;
    const cur = selEl();
    const el = cur && !deep && cur.contains(e.target) ? cur : candidate(e.target, deep);
    const cell = e.target.closest ? e.target.closest("td,th") : null;
    if (!el) { select(null); return; }
    const cellKey = cell && el.tagName === "TABLE" && el.contains(cell) ? keyOf(cell) : null;
    if (el !== cur) select(keyOf(el), { cell: cellKey });
    else if (cellKey && sel && sel.cell !== cellKey) { sel.cell = cellKey; renderPanel(); }
    beginMove(e, el);
  }

  function beginMove(e: any, el: any): void {
    const abs = isAbs(el);
    const c = cs(el);
    drag = {
      kind: "move", id: e.pointerId, x0: e.clientX, y0: e.clientY, el, abs, k: kOf(el), started: false,
      rect: rectOf(el), base: abs ? { left: pxv(c.left, el.offsetLeft), top: pxv(c.top, el.offsetTop) } : translateOf(el),
      snaps: null, right: abs && specified(el, "right"), bottom: abs && specified(el, "bottom"),
    };
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
  }

  /**
   * Whether the element's own style or a rule of the deck's sets `prop`. A
   * positioned element reads back a pixel value for every side, so the
   * computed style cannot tell an inset someone set from one worked out.
   */
  function specified(el: any, prop: string): boolean {
    if (el.style && el.style.getPropertyValue(prop)) return true;
    let hit = false;
    const visit = function (rules: any): void {
      Array.prototype.forEach.call(rules || [], function (r: any) {
        if (hit) return;
        if (r.cssRules && !r.selectorText) { if (!r.media || el.ownerDocument.defaultView.matchMedia(r.media.mediaText).matches) visit(r.cssRules); return; }
        try { if (r.style && r.style.getPropertyValue(prop) && el.matches(r.selectorText)) hit = true; } catch (e) {}
      });
    };
    Array.prototype.forEach.call(el.ownerDocument.styleSheets, function (sh: any) {
      try { visit(sh.cssRules); } catch (e) {}
    });
    return hit;
  }

  function onFrameMove(e: any): void {
    if (drag && drag.kind === "move") { moveDrag(e.clientX, e.clientY, e.ctrlKey || e.metaKey, e.shiftKey); return; }
    if (!on() || tool || e.buttons) return;
    const c = editingTarget(e.target) ? null : candidate(e.target, e.ctrlKey || e.metaKey);
    const next = c && c !== selEl() ? c : null;
    if (next !== hoverEl) { hoverEl = next; kick(); }
  }

  function onFrameUp(e: any): void {
    if (drag && drag.kind === "move") {
      if (e.type === "pointercancel") cancelDrag(); else endMove();
    }
    setTimeout(function () { press = false; }, 0);
  }

  // Snapping: the slide's edges and middle, and the edges and middles of the
  // boxes on it, pull a moving box in from a few screen pixels away.
  function snapLines(el: any): any {
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    const xs: number[] = [], ys: number[] = [];
    const add = function (r: any): void {
      xs.push(r.x, r.x + r.w / 2, r.x + r.w);
      ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    };
    if (pl) add(rectOf(pl.live));
    const d = fdoc();
    const unit = d ? d.querySelector('[data-dr-slide="' + k + '"]') : null;
    if (unit && pl) {
      // The slide's own parts, the boxes placed here, the element's siblings, and the boxes it sits in.
      let list = Array.prototype.slice.call(pl.live.children).concat(Array.prototype.slice.call(unit.querySelectorAll("[data-dz]")));
      if (el.parentElement) list = list.concat(Array.prototype.slice.call(el.parentElement.children));
      for (let p = el.parentElement; p && p !== pl.live && unit.contains(p); p = p.parentElement) list.push(p);
      list.forEach(function (o: any) {
        if (!o || o === el || el.contains(o) || !o.getBoundingClientRect) return;
        const r = rectOf(o);
        if (r.w || r.h) add(r);
      });
    }
    return { xs, ys };
  }

  function snapAxis(vals: number[], lines: number[], tol: number): any {
    let best: any = null;
    vals.forEach(function (v, i) {
      lines.forEach(function (l) {
        const d = l - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: l, i };
      });
    });
    return best;
  }

  function showGuides(gx: any, gy: any): void {
    const H = slideH, W = slideW;
    if (gx) put(guideV, gx.at, 0, 1, H); else off(guideV);
    if (gy) put(guideH, 0, gy.at, W, 1); else off(guideH);
  }

  function moveDrag(cx: number, cy: number, free: boolean, axis: boolean): void {
    let dx = cx - drag.x0, dy = cy - drag.y0;
    if (!drag.started) {
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.started = true;
      hoverEl = null;
      if (panel.editingEl()) return;
      drag.snaps = snapLines(drag.el);
    }
    if (axis) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    let gx: any = null, gy: any = null;
    if (!free && drag.snaps) {
      const r = drag.rect, tol = 6 / scale;
      gx = snapAxis([r.x + dx, r.x + dx + r.w / 2, r.x + dx + r.w], drag.snaps.xs, tol);
      gy = snapAxis([r.y + dy, r.y + dy + r.h / 2, r.y + dy + r.h], drag.snaps.ys, tol);
      if (gx) dx += gx.d;
      if (gy) dy += gy.d;
    }
    showGuides(gx, gy);
    const ex = dx / drag.k, ey = dy / drag.k;
    if (drag.abs) {
      drag.now = { left: Math.round(drag.base.left + ex), top: Math.round(drag.base.top + ey) };
      drag.el.style.left = drag.now.left + "px";
      drag.el.style.top = drag.now.top + "px";
      if (drag.right) drag.el.style.right = "auto";
      if (drag.bottom) drag.el.style.bottom = "auto";
      drag.label = "x " + drag.now.left + "  y " + drag.now.top;
    } else {
      drag.now = { x: Math.round(drag.base.x + ex), y: Math.round(drag.base.y + ey) };
      drag.el.style.translate = drag.now.x + "px " + drag.now.y + "px";
      drag.label = "offset " + drag.now.x + ", " + drag.now.y;
    }
    kick();
  }

  function cancelDrag(): void {
    const d = drag;
    drag = null;
    if (d && d.started) host.reload();
    kick();
  }

  function endMove(): void {
    const d = drag;
    drag = null;
    off(guideV); off(guideH);
    if (!d || !d.started || !d.now) { kick(); return; }
    const n = nodeOf(keyOf(d.el));
    if (!n) { host.reload(); return; }
    let changes: any;
    if (d.abs) {
      changes = { left: d.now.left + "px", top: d.now.top + "px" };
      if (d.right) changes.right = "auto";
      if (d.bottom) changes.bottom = "auto";
    } else {
      changes = { translate: d.now.x || d.now.y ? d.now.x + "px " + d.now.y + "px" : null };
    }
    moved(d.el, n, changes, "move", false);
  }

  /**
   * Commits a move or resize, and drags along the connectors attached to the
   * element (one undo step for both). A connector moved on its own lets go.
   */
  function moved(el: any, n: any, changes: any, tag: string, fold: boolean): void {
    const edits: any[] = [K.styleEdit(src.value, n, changes)];
    const patches: Array<() => void> = [function () { patchStyle(el, changes); }];
    if (kindOf(el) === "connector" && (el.hasAttribute("data-from") || el.hasAttribute("data-to"))) {
      edits.push(K.attrEdit(src.value, n, "data-from", null), K.attrEdit(src.value, n, "data-to", null));
      patches.push(function () { el.removeAttribute("data-from"); el.removeAttribute("data-to"); });
    }
    // Apply the element's own change live first, so attached connectors read its new place.
    patchStyle(el, changes);
    const id = el.getAttribute("id");
    if (id) {
      followers(id).forEach(function (c: any) {
        const cn = nodeOf(keyOf(c));
        if (!cn) return;
        const g = K.lineGeom(K.outer(src.value, cn));
        if (!g) return;
        reroute(c, g);
        const html = K.line(g);
        edits.push({ at: cn.start, del: cn.end - cn.start, ins: html });
        patches.push(function () { patchOuter(c, html); });
      });
    }
    const next = K.apply(src.value, edits);
    commit(next, tag + ":" + keyOf(el), fold, function () { patches.forEach(function (p) { p(); }); });
    scheduleFit();
  }

  // ── Resizing with the handles ──────────────────────────────────────────

  Object.keys(handles).forEach(function (h) {
    const d = handles[h];
    d.addEventListener("pointerdown", function (e: any) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = selEl();
      if (!el) return;
      closeAll();
      try { d.setPointerCapture(e.pointerId); } catch (err) {}
      if (h === "p1" || h === "p2") { beginEnd(e, el, h); return; }
      const c = cs(el);
      const abs = isAbs(el);
      const bw = el.offsetWidth, bh = el.offsetHeight;
      const extraW = c.boxSizing === "content-box" ? pxv(c.paddingLeft, 0) + pxv(c.paddingRight, 0) + pxv(c.borderLeftWidth, 0) + pxv(c.borderRightWidth, 0) : 0;
      const extraH = c.boxSizing === "content-box" ? pxv(c.paddingTop, 0) + pxv(c.paddingBottom, 0) + pxv(c.borderTopWidth, 0) + pxv(c.borderBottomWidth, 0) : 0;
      const n = selNode();
      const inline = n ? K.styleMap((K.attr(n, "style") || { value: "" }).value) : {};
      drag = {
        kind: "resize", h, x0: e.clientX, y0: e.clientY, el, abs, k: kOf(el), started: false,
        rect: rectOf(el), bw, bh, extraW, extraH,
        base: abs ? { left: pxv(c.left, el.offsetLeft), top: pxv(c.top, el.offsetTop) } : translateOf(el),
        autoH: !inline.height && (el.tagName === "P" || kindOf(el) === "text" || /^H[1-6]$/.test(el.tagName)),
        hasW: !!inline.width, hasH: !!inline.height,
        aspect: el.tagName === "IMG" || el.tagName === "VIDEO",
      };
      drag.snaps = snapLines(el);
    });
    d.addEventListener("pointermove", function (e: any) {
      if (!drag || (drag.kind !== "resize" && drag.kind !== "end")) return;
      if (drag.kind === "end") endDragMove(e);
      else resizeMove(e);
    });
    d.addEventListener("pointerup", function () {
      if (drag && drag.kind === "resize") endResize();
      else if (drag && drag.kind === "end") endEnd();
    });
    d.addEventListener("pointercancel", function () { cancelDrag(); });
  });

  function resizeMove(e: any): void {
    const dxs = (e.clientX - drag.x0) / scale, dys = (e.clientY - drag.y0) / scale;
    if (!drag.started && Math.abs(dxs) + Math.abs(dys) < 1) return;
    drag.started = true;
    const r = drag.rect, h = drag.h;
    let x = r.x, y = r.y, w = r.w, ht = r.h;
    const free = e.ctrlKey || e.metaKey;
    let gx: any = null, gy: any = null;
    let ex = dxs, ey = dys;
    if (!free && drag.snaps) {
      const tol = 6 / scale;
      if (h.indexOf("e") >= 0) { gx = snapAxis([r.x + r.w + ex], drag.snaps.xs, tol); if (gx) ex += gx.d; }
      if (h.indexOf("w") >= 0) { gx = snapAxis([r.x + ex], drag.snaps.xs, tol); if (gx) ex += gx.d; }
      if (h.indexOf("s") >= 0) { gy = snapAxis([r.y + r.h + ey], drag.snaps.ys, tol); if (gy) ey += gy.d; }
      if (h.indexOf("n") >= 0) { gy = snapAxis([r.y + ey], drag.snaps.ys, tol); if (gy) ey += gy.d; }
    }
    if (h.indexOf("e") >= 0) w = r.w + ex;
    if (h.indexOf("w") >= 0) { w = r.w - ex; x = r.x + ex; }
    if (h.indexOf("s") >= 0) ht = r.h + ey;
    if (h.indexOf("n") >= 0) { ht = r.h - ey; y = r.y + ey; }
    const corner = h.length === 2;
    if ((e.shiftKey || (drag.aspect && corner)) && corner && r.w && r.h) {
      const ratio = r.w / r.h;
      if (Math.abs(w / r.w) > Math.abs(ht / r.h)) ht = w / ratio; else w = ht * ratio;
      if (h.indexOf("w") >= 0) x = r.x + r.w - w;
      if (h.indexOf("n") >= 0) y = r.y + r.h - ht;
      gx = gy = null;
    }
    if (e.altKey) {
      x = r.x - (w - r.w) / 2;
      y = r.y - (ht - r.h) / 2;
      if (h.length === 1 && (h === "e" || h === "w")) { w = r.w + 2 * Math.abs(w - r.w) * (w > r.w ? 1 : -1); x = r.x - (w - r.w) / 2; }
      if (h.length === 1 && (h === "n" || h === "s")) { ht = r.h + 2 * Math.abs(ht - r.h) * (ht > r.h ? 1 : -1); y = r.y - (ht - r.h) / 2; }
    }
    const minS = 4;
    if (w < minS) { if (h.indexOf("w") >= 0) x -= minS - w; w = minS; }
    if (ht < minS) { if (h.indexOf("n") >= 0) y -= minS - ht; ht = minS; }
    showGuides(gx, gy);
    const k = drag.k;
    const cw = Math.round(w / k - drag.extraW), chh = Math.round(ht / k - drag.extraH);
    const ox = Math.round((x - r.x) / k), oy = Math.round((y - r.y) / k);
    // A side handle sets the one dimension it moves; the other stays as it was (auto stays auto).
    const vertical = h.indexOf("n") >= 0 || h.indexOf("s") >= 0;
    const horizontal = h.indexOf("e") >= 0 || h.indexOf("w") >= 0;
    const changes: any = {};
    if (horizontal || drag.hasW) changes.width = cw + "px";
    if (vertical || (drag.hasH && !drag.autoH)) changes.height = chh + "px";
    if (drag.abs) {
      changes.left = Math.round(drag.base.left + ox) + "px";
      changes.top = Math.round(drag.base.top + oy) + "px";
    } else if (ox || oy || drag.base.x || drag.base.y) {
      changes.translate = (drag.base.x + ox) + "px " + (drag.base.y + oy) + "px";
    }
    drag.changes = changes;
    patchStyle(drag.el, changes);
    drag.label = (changes.width ? cw : Math.round(drag.el.offsetWidth)) + " × " + (changes.height ? chh : Math.round(drag.el.offsetHeight));
    kick();
  }

  function endResize(): void {
    const d = drag;
    drag = null;
    off(guideV); off(guideH);
    if (!d || !d.started || !d.changes) { kick(); return; }
    const n = nodeOf(keyOf(d.el));
    if (!n) { host.reload(); return; }
    moved(d.el, n, d.changes, "resize", false);
  }

  // ── Lines and connectors: dragging an end ──────────────────────────────

  /** Points a connector end can attach to: the middle of each side of the boxes on the slide. */
  function anchors(except: any): any[] {
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    const d = fdoc();
    const unit = d ? d.querySelector('[data-dr-slide="' + k + '"]') : null;
    if (!unit || !pl) return [];
    const out: any[] = [];
    const seen = new Set();
    const list = Array.prototype.slice.call(pl.live.children).concat(Array.prototype.slice.call(unit.querySelectorAll("[data-dz]")));
    list.forEach(function (o: any) {
      if (!o || seen.has(o) || o === except || LINES[kindOf(o)] || !o.hasAttribute("data-dr-n") || isSlideBox(o)) return;
      seen.add(o);
      const r = rectOf(o);
      if (!r.w || !r.h) return;
      out.push({ el: o, side: "t", x: r.x + r.w / 2, y: r.y });
      out.push({ el: o, side: "r", x: r.x + r.w, y: r.y + r.h / 2 });
      out.push({ el: o, side: "b", x: r.x + r.w / 2, y: r.y + r.h });
      out.push({ el: o, side: "l", x: r.x, y: r.y + r.h / 2 });
    });
    return out;
  }

  function nearest(list: any[], x: number, y: number): any {
    let best: any = null, bd = 14 / scale;
    list.forEach(function (a) {
      const dd = Math.hypot(a.x - x, a.y - y);
      if (dd < bd) { bd = dd; best = a; }
    });
    return best;
  }

  function anchorPoint(id: string, side: string): any {
    const d = fdoc();
    const el = d ? d.getElementById(id) : null;
    if (!el) return null;
    const r = rectOf(el);
    if (side === "t") return { x: r.x + r.w / 2, y: r.y };
    if (side === "r") return { x: r.x + r.w, y: r.y + r.h / 2 };
    if (side === "b") return { x: r.x + r.w / 2, y: r.y + r.h };
    return { x: r.x, y: r.y + r.h / 2 };
  }

  function followers(id: string): any[] {
    const d = fdoc();
    if (!d) return [];
    return Array.prototype.slice.call(d.querySelectorAll('[data-dz="connector"]')).filter(function (c: any) {
      return (c.getAttribute("data-from") || "").split(":")[0] === id || (c.getAttribute("data-to") || "").split(":")[0] === id;
    });
  }

  /** A connector's ends follow the boxes they are attached to. */
  function reroute(c: any, g: any): void {
    const ends = lineEnds(c);
    if (!ends) return;
    const k = kOf(c);
    // Frame pixels of the deck's (0, 0) for this connector: its first end, less its own coordinates.
    const bx = ends.a.x - g.x1 * k, by = ends.a.y - g.y1 * k;
    [["from", "x1", "y1"], ["to", "x2", "y2"]].forEach(function (p) {
      const ref = g[p[0]];
      if (!ref) return;
      const parts = ref.split(":");
      const pt = anchorPoint(parts[0], parts[1] || "l");
      if (!pt) return;
      g[p[1]] = Math.round((pt.x - bx) / k);
      g[p[2]] = Math.round((pt.y - by) / k);
    });
  }

  function beginEnd(e: any, el: any, h: string): void {
    const n = selNode();
    if (!n) return;
    const g = K.lineGeom(K.outer(src.value, n));
    if (!g) return;
    const ends = lineEnds(el);
    const k = kOf(el);
    // Frame pixels of the deck's (0, 0) for this line: its first end, less its own coordinates.
    const ox = ends.a.x - g.x1 * k, oy = ends.a.y - g.y1 * k;
    drag = { kind: "end", h, x0: e.clientX, y0: e.clientY, el, g, ox, oy, k, started: false, list: g.kind === "connector" ? anchors(null) : [] };
  }

  function endDragMove(e: any): void {
    const ov = overlay.getBoundingClientRect();
    let fx = (e.clientX - ov.left) / scale, fy = (e.clientY - ov.top) / scale;
    drag.started = true;
    const hit = drag.list.length && !(e.ctrlKey || e.metaKey) ? nearest(drag.list, fx, fy) : null;
    if (hit) { fx = hit.x; fy = hit.y; put(anchorDot, fx, fy); } else off(anchorDot);
    if (e.shiftKey && !hit) {
      const other = drag.h === "p1" ? { x: drag.g.x2, y: drag.g.y2 } : { x: drag.g.x1, y: drag.g.y1 };
      const ox2 = drag.ox + other.x * drag.k, oy2 = drag.oy + other.y * drag.k;
      if (Math.abs(fx - ox2) > Math.abs(fy - oy2)) fy = oy2; else fx = ox2;
    }
    const g = drag.g;
    const x = Math.round((fx - drag.ox) / drag.k), y = Math.round((fy - drag.oy) / drag.k);
    if (drag.h === "p1") { g.x1 = x; g.y1 = y; g.from = hit ? attachRef(hit) : ""; }
    else { g.x2 = x; g.y2 = y; g.to = hit ? attachRef(hit) : ""; }
    drag.hit = drag.h === "p1" ? { from: hit } : { to: hit };
    drag.hits = Object.assign(drag.hits || {}, drag.hit);
    patchOuter(drag.el, K.line(g));
    drag.el = liveOf(sel.key);
    kick();
  }

  /** "id:side" for an anchor; an element without an id gets one when the connector lands. */
  function attachRef(a: any): string {
    return (a.el.getAttribute("id") || "\u0000") + ":" + a.side;
  }

  function endEnd(): void {
    const d = drag;
    drag = null;
    off(anchorDot);
    if (!d || !d.started) { kick(); return; }
    const n = selNode();
    if (!n) { host.reload(); return; }
    const more: any[] = [];
    const ids: any[] = [];
    const used = idsInUse();
    ["from", "to"].forEach(function (p) {
      const hit = d.hits && d.hits[p];
      if (!hit || (d.g[p] || "").indexOf("\u0000") !== 0) return;
      let id = "";
      for (let i = 1; !id; i++) if (!used.has("dz-" + i)) id = "dz-" + i;
      used.add(id);
      d.g[p] = id + ":" + hit.side;
      const hn = nodeOf(keyOf(hit.el));
      if (hn) { more.push(K.attrEdit(src.value, hn, "id", id)); ids.push([hit.el, id]); }
    });
    const html = K.line(d.g);
    const el = liveOf(sel.key);
    swap(el, n, html, "line", more);
    ids.forEach(function (p) { p[0].setAttribute("id", p[1]); });
  }

  function idsInUse(): Set<string> {
    const out = new Set<string>();
    const re = /\sid\s*=\s*["']?([^"'\s>]+)/g;
    let m: any;
    while ((m = re.exec(src.value))) out.add(m[1]);
    return out;
  }

  // ── Placing new elements ───────────────────────────────────────────────

  function setTool(t: string | null): void {
    tool = t;
    overlay.classList.toggle("is-placing", !!t);
    Array.prototype.slice.call(stage.querySelectorAll("[data-tool]")).forEach(function (b: any) {
      b.classList.toggle("is-on", b.getAttribute("data-tool") === t);
    });
    $("dz-shapes").classList.toggle("is-on", !!t && t !== "text" && t !== "table");
    if (t) { closeAll(); hoverEl = null; kick(); }
  }

  function ovPoint(e: any): any {
    const ov = overlay.getBoundingClientRect();
    return { x: (e.clientX - ov.left) / scale, y: (e.clientY - ov.top) / scale };
  }

  overlay.addEventListener("pointerdown", function (e: any) {
    if (!tool || e.target !== overlay || e.button !== 0) return;
    e.preventDefault();
    const p = ovPoint(e);
    drag = { kind: "place", tool, a: p, b: p, started: false };
    try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
  });

  overlay.addEventListener("pointermove", function (e: any) {
    if (!drag || drag.kind !== "place") return;
    let p = ovPoint(e);
    if (e.shiftKey) {
      const dx = p.x - drag.a.x, dy = p.y - drag.a.y;
      if (LINES[drag.tool]) { if (Math.abs(dx) > Math.abs(dy)) p = { x: p.x, y: drag.a.y }; else p = { x: drag.a.x, y: p.y }; }
      else { const s = Math.max(Math.abs(dx), Math.abs(dy)); p = { x: drag.a.x + (dx < 0 ? -s : s), y: drag.a.y + (dy < 0 ? -s : s) }; }
    }
    if (drag.tool === "connector") {
      drag.list = drag.list || anchors(null);
      const hit = nearest(drag.list, p.x, p.y);
      if (hit) { p = { x: hit.x, y: hit.y }; put(anchorDot, hit.x, hit.y); } else off(anchorDot);
      drag.endHit = hit;
      if (!drag.started) drag.startHit = nearest(drag.list, drag.a.x, drag.a.y);
    }
    drag.b = p;
    if (Math.abs(p.x - drag.a.x) + Math.abs(p.y - drag.a.y) > 4) drag.started = true;
    if (!drag.started) return;
    if (LINES[drag.tool]) {
      const a = drag.startHit ? drag.startHit : drag.a;
      lineGhost.innerHTML = '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + p.x + '" y2="' + p.y + '" stroke="#4c8dff" stroke-width="' + 2 / scale + '"/>';
      lineGhost.classList.add("is-on");
    } else {
      put(rubber, Math.min(drag.a.x, p.x), Math.min(drag.a.y, p.y), Math.abs(p.x - drag.a.x), Math.abs(p.y - drag.a.y));
    }
  });

  overlay.addEventListener("pointerup", function () {
    if (!drag || drag.kind !== "place") return;
    const d = drag;
    drag = null;
    off(rubber); off(anchorDot);
    lineGhost.classList.remove("is-on");
    setTool(null);
    if (d.started) insert(d.tool, d.a, d.b, d);
    else insert(d.tool, d.a, null, d);
  });

  overlay.addEventListener("pointercancel", function () {
    drag = null;
    off(rubber);
    lineGhost.classList.remove("is-on");
  });

  /** The deck's own text look, for new text: its body text when it has some. */
  function bodyFont(): string {
    const p = presets.filter(function (x) { return x.label === "Body"; })[0];
    if (!p) return "font-size:28px";
    return "font-size:" + p.size + "px;line-height:" + p.lh;
  }

  const DEFAULTS: Record<string, number[]> = {
    text: [360, 0], table: [520, 0], rect: [220, 130], rounded: [220, 130], ellipse: [160, 160], diamond: [200, 140],
    "arrow-right": [200, 90], "arrow-left": [200, 90], "arrow-up": [90, 200], "arrow-down": [90, 200],
    line: [240, 0], connector: [240, 0],
  };

  /** Writes a new element into the current slide: the box dragged out, or its usual size at the click. */
  function insert(kind: string, a: any, b: any, extra?: any): void {
    if (!on()) return;
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    if (!pl) { host.toast("The preview is still loading. Try again in a moment.", "warn"); return; }
    const toCss = function (p: any): any { return { x: Math.round((p.x - pl.ox) / pl.k), y: Math.round((p.y - pl.oy) / pl.k) }; };
    const A = toCss(a);
    const B = b ? toCss(b) : null;
    const dflt = DEFAULTS[kind] || [200, 120];
    let html = "";
    if (LINES[kind]) {
      const ex = extra || {};
      const sa = ex.startHit ? toCss(ex.startHit) : A;
      const sb = B && (Math.abs(B.x - A.x) + Math.abs(B.y - A.y) > 4) ? (ex.endHit ? toCss(ex.endHit) : B) : { x: A.x + dflt[0], y: A.y };
      const o: any = { kind, x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y, width: 3, color: "#9AA0A6" };
      const ids: any[] = [];
      const used = idsInUse();
      const edits: any[] = [];
      [["from", ex.startHit], ["to", ex.endHit]].forEach(function (p: any) {
        const hit = p[1];
        if (kind !== "connector" || !hit) return;
        let id = hit.el.getAttribute("id");
        if (!id) {
          for (let i = 1; !id; i++) if (!used.has("dz-" + i)) id = "dz-" + i;
          used.add(id);
          const hn = nodeOf(keyOf(hit.el));
          if (hn) edits.push(K.attrEdit(src.value, hn, "id", id));
          ids.push(id);
        }
        o[p[0]] = id + ":" + hit.side;
      });
      html = K.line(o);
      place(pl, html, edits, false);
      return;
    }
    let x = A.x, y = A.y, w = dflt[0], h = dflt[1];
    if (B && Math.abs(B.x - A.x) > 6 && (Math.abs(B.y - A.y) > 6 || kind === "text" || kind === "table")) {
      x = Math.min(A.x, B.x); y = Math.min(A.y, B.y);
      w = Math.abs(B.x - A.x); h = Math.abs(B.y - A.y);
    } else if (extra && extra.centered) {
      x = Math.round(A.x - w / 2); y = Math.round(A.y - (h || 40) / 2);
    }
    x = Math.max(0, Math.min(x, pl.w - 20));
    y = Math.max(0, Math.min(y, pl.h - 20));
    if (kind === "text") html = K.textBox({ x, y, w, h: B && h > 30 ? h : 0, font: bodyFont() });
    else if (kind === "table") html = K.table({ x, y, w, rows: 3, cols: 3, font: bodyFont(), indent: indentFor(pl) });
    else if (kind === "image" || kind === "video") html = kind === "image" ? K.image(extra.o) : K.video(extra.o);
    else html = K.shape(kind, { x, y, w, h });
    place(pl, html, [], kind === "text");
  }

  function indentFor(pl: any): string {
    const t = src.value;
    const ls = t.lastIndexOf("\n", pl.node.closeStart - 1) + 1;
    const own = (/^[ \t]*/.exec(t.slice(ls, pl.node.closeStart)) as any)[0];
    return own + "  ";
  }

  /**
   * One above the highest z-index among the children, or null when none
   * stacks. `deckOnly` counts only the deck's own parts: boxes placed here
   * share one level and stack by their order, so the numbers never creep.
   */
  function zAbove(parent: any, except?: any, deckOnly?: boolean): number | null {
    let max = 0;
    Array.prototype.forEach.call(parent.children, function (ch: any) {
      if (ch === except || (deckOnly && ch.hasAttribute("data-dz"))) return;
      const z = parseInt(cs(ch).zIndex, 10);
      if (z > max) max = z;
    });
    return max > 0 ? max + 1 : null;
  }

  function withStyle(html: string, changes: any): string {
    const el = firstEl(html);
    return el ? K.setStyle(html, el, changes) : html;
  }

  function place(pl: any, html: string, more: any[], type: boolean): void {
    const s0 = src.value;
    // Something new goes on top, even of the parts of the slide that stack themselves.
    const z = zAbove(pl.live, null, true);
    if (z) html = withStyle(html, { "z-index": String(z) });
    const edits = more.slice();
    if (pl.needsRel) edits.push(K.styleEdit(s0, pl.node, { position: "relative" }));
    const ins = K.insertEnd(s0, pl.node, html);
    edits.push(ins.edit);
    let start = ins.start;
    edits.forEach(function (e: any) {
      if (e && e !== ins.edit && e.at < ins.edit.at) start += e.ins.length - e.del;
    });
    rebuild(K.apply(s0, edits), "insert", start, type);
  }

  // Pictures and video: picked, dropped, or pasted; copied into the deck's folder.
  const picker = doc.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,video/*";
  picker.hidden = true;
  doc.body.appendChild(picker);
  let pickAt: any = null;
  let replacing: any = null;

  picker.addEventListener("change", function () {
    const f = picker.files && picker.files[0];
    picker.value = "";
    if (!f) return;
    if (replacing) { const r = replacing; replacing = null; replaceMedia(r, f); return; }
    addMedia(f, pickAt);
    pickAt = null;
  });

  function pickMedia(at: any): void {
    pickAt = at;
    picker.click();
  }

  function hasFiles(e: any): boolean {
    const t = e.dataTransfer && e.dataTransfer.types;
    return !!t && Array.prototype.indexOf.call(t, "Files") >= 0;
  }

  function dropFiles(files: any, at: any): void {
    const list = Array.prototype.slice.call(files || []).filter(function (f: any) { return /^(image|video)\//.test(f.type); });
    if (!list.length) { host.toast("Drop a picture or a video to put it on the slide.", "warn"); return; }
    addMedia(list[0], at);
  }

  function mediaSize(url: string, video: boolean): Promise<any> {
    return new Promise(function (resolve) {
      const done = function (w: number, h: number): void { resolve({ w: w || 640, h: h || 360 }); };
      if (video) {
        const v = doc.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = function () { done(v.videoWidth, v.videoHeight); };
        v.onerror = function () { done(640, 360); };
        v.src = url;
      } else {
        const im = new Image();
        im.onload = function () { done(im.naturalWidth, im.naturalHeight); };
        im.onerror = function () { done(480, 320); };
        im.src = url;
      }
      setTimeout(function () { done(640, 360); }, 4000);
    });
  }

  function addMedia(file: any, at: any): void {
    const video = /^video\//.test(file.type);
    host.upload(file).then(function (url: string) {
      if (!url) return;
      return mediaSize(url, video).then(function (sz: any) {
        const k = Math.max(0, panel.current());
        const pl = placing(k);
        if (!pl) return;
        const maxW = pl.w * 0.5, maxH = pl.h * 0.6;
        const f = Math.min(1, maxW / sz.w, maxH / sz.h);
        const w = Math.round(sz.w * f), h = Math.round(sz.h * f);
        let x: number, y: number;
        if (at) { x = Math.round((at.x - pl.ox) / pl.k - w / 2); y = Math.round((at.y - pl.oy) / pl.k - h / 2); }
        else { x = Math.round((pl.w - w) / 2); y = Math.round((pl.h - h) / 2); }
        x = Math.max(0, Math.min(x, pl.w - w)); y = Math.max(0, Math.min(y, pl.h - h));
        const o = { src: url, x, y, w, h, alt: file.name.replace(/\.[^.]+$/, "") };
        place(pl, video ? K.video(o) : K.image(o), [], false);
      });
    }).catch(function (err: any) { host.toast("Could not add " + file.name + ": " + (err && err.message ? err.message : err), "err"); });
  }

  function replaceMedia(el: any, file: any): void {
    host.upload(file).then(function (url: string) {
      if (!url || !el.isConnected) return;
      const n = nodeOf(keyOf(el));
      if (!n) return;
      commit(K.setAttr(src.value, n, "src", url), "src:" + keyOf(el), false, function () { el.setAttribute("src", url); });
    }).catch(function (err: any) { host.toast("Could not use " + file.name + ": " + (err && err.message ? err.message : err), "err"); });
  }

  stage.addEventListener("dragover", function (e: any) { if (on() && hasFiles(e)) e.preventDefault(); });
  stage.addEventListener("drop", function (e: any) {
    if (!on() || !hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const fr = frame.getBoundingClientRect();
    dropFiles(e.dataTransfer.files, { x: (e.clientX - fr.left) / scale, y: (e.clientY - fr.top) / scale });
  });

  // ── The insert bar ─────────────────────────────────────────────────────

  let barDrag: any = null;

  Array.prototype.slice.call(stage.querySelectorAll("[data-tool]")).forEach(function (b: any) {
    const t = b.getAttribute("data-tool");
    b.addEventListener("pointerdown", function (e: any) {
      if (e.button !== 0) return;
      hideTip();
      barDrag = { tool: t, x0: e.clientX, y0: e.clientY, started: false, b };
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
    });
    b.addEventListener("pointermove", function (e: any) {
      if (!barDrag || barDrag.b !== b) return;
      if (!barDrag.started && Math.abs(e.clientX - barDrag.x0) + Math.abs(e.clientY - barDrag.y0) > 5) {
        barDrag.started = true;
        ghost.textContent = t === "text" ? "text box" : t === "table" ? "table" : t;
        ghost.classList.add("is-on");
      }
      if (barDrag.started) { ghost.style.left = e.clientX + 12 + "px"; ghost.style.top = e.clientY + 10 + "px"; }
    });
    b.addEventListener("pointerup", function (e: any) {
      const d = barDrag;
      barDrag = null;
      ghost.classList.remove("is-on");
      if (!d || d.b !== b) return;
      if (!d.started) {
        if (t === "image") pickMedia(null);
        else setTool(tool === t ? null : t);
        return;
      }
      const fr = frame.getBoundingClientRect();
      if (e.clientX < fr.left || e.clientY < fr.top || e.clientX > fr.right || e.clientY > fr.bottom) return;
      const p = { x: (e.clientX - fr.left) / scale, y: (e.clientY - fr.top) / scale };
      if (t === "image") pickMedia(p);
      else insert(t, p, null, { centered: true });
    });
  });

  // ── Menus ──────────────────────────────────────────────────────────────

  function closeAll(): void {
    menu.classList.remove("is-on");
    pop.classList.remove("is-on");
    ["dz-shapes", "dz-download", "dz-zoom"].forEach(function (id) { $(id).setAttribute("aria-expanded", "false"); });
  }

  function placeAt(el: any, x: number, y: number): void {
    el.style.left = "0px";
    el.style.top = "0px";
    el.classList.add("is-on");
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + "px";
    el.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + "px";
  }

  /** rows: [label, shortcut, action, disabled, icon] or null for a separator. */
  function openMenu(rows: any[], x: number, y: number, owner?: any): void {
    closeAll();
    menu.textContent = "";
    const items: any[] = [];
    rows.forEach(function (row: any) {
      if (!row) {
        const sep = doc.createElement("div");
        sep.className = "dr-sep";
        menu.appendChild(sep);
        return;
      }
      const b = doc.createElement("button");
      b.className = "dr-mi";
      b.setAttribute("role", "menuitem");
      b.disabled = !!row[3];
      b.innerHTML = (row[4] ? icon(row[4]) : "") + '<span class="dz-mi-label"></span>' + (row[1] ? "<kbd></kbd>" : "");
      b.querySelector(".dz-mi-label").textContent = row[0];
      if (row[1]) b.querySelector("kbd").textContent = cmd(row[1]);
      b.addEventListener("click", function () { closeAll(); row[2](); });
      menu.appendChild(b);
      if (!b.disabled) items.push(b);
    });
    placeAt(menu, x, y);
    if (owner) owner.setAttribute("aria-expanded", "true");
    let at = -1;
    menu.onkeydown = function (e: any) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        at = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[at].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeAll();
        focusCanvas();
      }
      e.stopPropagation();
    };
    menu.focus({ preventScroll: true });
  }

  function under(b: any): any {
    const r = b.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 6, r };
  }

  $("dz-shapes").addEventListener("click", function () {
    if (menu.classList.contains("is-on") && $("dz-shapes").getAttribute("aria-expanded") === "true") { closeAll(); return; }
    const kinds = K.shapeKinds();
    const rows: any[] = [];
    kinds.forEach(function (s: any) {
      if (s.id === "line") rows.push(null);
      rows.push([s.label, s.key, function () { setTool(s.id); }, false, s.id]);
    });
    const p = under($("dz-shapes"));
    openMenu(rows, p.x, p.y, $("dz-shapes"));
  });

  $("dz-download").addEventListener("click", function () {
    const k = Math.max(0, panel.current());
    const p = under($("dz-download"));
    openMenu([
      ["PDF — the whole presentation", "", function () { host.download("pdf", k); }, false, "download"],
      ["Web page — one .html file, pictures inside", "", function () { host.download("web", k); }, false, "code"],
      ["This slide as an image (PNG)", "", function () { host.download("png", k); }, false, "image"],
    ], p.r.right - 290, p.y, $("dz-download"));
  });

  $("dz-play").addEventListener("click", function () { host.present(Math.max(0, panel.current())); });

  $("dz-panel").addEventListener("click", function () { setProps(!propsOn); });

  $("dz-zoom").addEventListener("click", function () {
    const p = under($("dz-zoom"));
    openMenu([
      ["Zoom in", "Ctrl +", function () { zoomBy(1); }],
      ["Zoom out", "Ctrl −", function () { zoomBy(-1); }],
      ["Zoom to fit", "Ctrl 0", function () { setZoom("fit"); }],
      null,
      ["50%", "", function () { setZoom(0.5); }],
      ["100%", "", function () { setZoom(1); }],
      ["200%", "", function () { setZoom(2); }],
    ], p.r.right - 200, p.y, $("dz-zoom"));
  });

  function setProps(next: boolean, keep?: boolean): void {
    propsOn = next;
    if (!keep) host.set(KEY.props + mode + ".v1", next ? "1" : "0");
    view.classList.toggle("props-on", next);
    $("dz-panel").setAttribute("aria-pressed", next ? "true" : "false");
    if (next) renderPanel();
  }

  doc.addEventListener("pointerdown", function (e: any) {
    if (menu.contains(e.target) || pop.contains(e.target)) return;
    if (e.target.closest && e.target.closest("#dz-shapes,#dz-download,#dz-zoom")) return;
    if (menu.classList.contains("is-on") || pop.classList.contains("is-on")) closeAll();
  }, true);

  // Tooltips: the bars say what each button does, and its key.
  let tipTimer: any = null;

  function hideTip(): void { clearTimeout(tipTimer); tipEl.classList.remove("is-on"); }

  Array.prototype.slice.call(stage.querySelectorAll("[data-tip]")).forEach(function (b: any) {
    b.addEventListener("pointerenter", function () {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () {
        if (menu.classList.contains("is-on")) return;
        tipEl.innerHTML = "<span></span>" + (b.getAttribute("data-key") ? "<kbd></kbd>" : "");
        tipEl.firstChild.textContent = b.getAttribute("data-tip");
        if (b.getAttribute("data-key")) tipEl.querySelector("kbd").textContent = cmd(b.getAttribute("data-key"));
        tipEl.classList.add("is-on");
        const r = b.getBoundingClientRect();
        const w = tipEl.offsetWidth;
        tipEl.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 6)) + "px";
        tipEl.style.top = r.bottom + 8 + "px";
      }, 380);
    });
    b.addEventListener("pointerleave", hideTip);
    b.addEventListener("pointerdown", hideTip);
  });

  // ── Element commands ───────────────────────────────────────────────────

  function canEdit(): boolean {
    if (!sel || !selNode()) return false;
    return true;
  }

  function removeSel(): void {
    const n = selNode();
    if (!n) return;
    const el = selEl();
    const edits: any[] = [K.removeEdit(src.value, n)];
    // Connectors attached to it let go of that end.
    const id = el && el.getAttribute("id");
    if (id) {
      followers(id).forEach(function (c: any) {
        const cn = nodeOf(keyOf(c));
        if (!cn || cn.start >= n.start && cn.end <= n.end) return;
        ["data-from", "data-to"].forEach(function (a) {
          if ((c.getAttribute(a) || "").split(":")[0] === id) edits.push(K.attrEdit(src.value, cn, a, null));
        });
      });
    }
    sel = null;
    rebuild(K.apply(src.value, edits), "delete", -1);
    renderPanel();
  }

  /**
   * A copy of an element's markup: without its id (ids stay unique) or its
   * connector attachments, and nudged down and right when placed freely.
   */
  function copyOf(html: string, nudge: boolean): string {
    let out = html;
    ["id", "data-from", "data-to"].forEach(function (a) {
      const el = firstEl(out);
      if (el && K.attr(el, a)) out = K.setAttr(out, el, a, null);
    });
    const el = firstEl(out);
    if (nudge && el) {
      const st = K.styleMap((K.attr(el, "style") || { value: "" }).value);
      if (/absolute|fixed/.test(st.position || "")) out = K.setStyle(out, el, { left: K.px(K.num(st.left) + 16), top: K.px(K.num(st.top) + 16) });
    }
    return out;
  }

  function duplicateSel(): void {
    const n = selNode();
    if (!n) return;
    const html = copyOf(K.outer(src.value, n), true);
    const ins = K.insertAfter(src.value, n, html);
    rebuild(K.apply(src.value, [ins.edit]), "duplicate", ins.start);
  }

  function copySel(cut: boolean): void {
    const n = selNode();
    if (!n) return;
    clip = K.outer(src.value, n);
    try { navigator.clipboard.writeText(clip).catch(function () {}); } catch (e) {}
    if (cut) removeSel();
    else host.toast("Copied. Paste puts it on any slide.");
  }

  function pasteHtml(text: string): void {
    text = (text || "").replace(/\r\n?/g, "\n").trim();
    if (!text) text = clip;
    if (!text) return;
    if (S.blocksIn(text).length) { host.toast("That is a whole slide. Paste it in the slide panel to add it as one.", "warn"); return; }
    const root = S.parse(text);
    const els = root.children.filter(function (c: any) { return c.kind === "el"; });
    if (!els.length || /^\s*</.test(text) === false) { pasteText(text); return; }
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    if (!pl) return;
    place(pl, copyOf(text, true), [], false);
  }

  function pasteText(text: string): void {
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    if (!pl) return;
    const lines = text.split("\n").map(function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); });
    const html = K.textBox({ x: Math.round(pl.w * 0.1), y: Math.round(pl.h * 0.4), w: Math.round(pl.w * 0.5), font: bodyFont(), text: "\u0001" })
      .replace("\u0001", lines.join("<br>"));
    place(pl, html, [], false);
  }

  /**
   * Front or back among the element's siblings. A freely placed box moves to
   * the end or start of its parent (painted last or first) and takes a
   * z-index past any sibling that stacks itself; a box the deck lays out
   * keeps its place in the flow and only stacks.
   */
  function order(where: string): void {
    const n = selNode(), el = selEl();
    if (!n || !el || !el.parentElement) return;
    const front = where === "front";
    const z = front ? zAbove(el.parentElement, el) : null;
    if (!isAbs(el)) {
      const zz = front ? String(z || 1) : "-1";
      styleSel({ position: cs(el).position === "static" ? "relative" : null, "z-index": zz }, "z", false);
      return;
    }
    const before = K.outer(src.value, n);
    const after = withStyle(before, { "z-index": front ? (z ? String(z) : null) : null });
    const mv = K.moveEdits(src.value, n, front ? "last" : "first");
    if (!mv) {
      if (after !== before) styleSel({ "z-index": front ? (z ? String(z) : null) : null }, "z", false);
      return;
    }
    mv.edits.forEach(function (e: any) { if (e.ins && e.ins.indexOf(before) >= 0) e.ins = e.ins.replace(before, after); });
    rebuild(K.apply(src.value, mv.edits), "order", mv.start);
  }

  function parentSel(): void {
    const el = selEl();
    if (!el) return;
    const p = taggedParent(el);
    if (!p || isSlideBox(p)) select(null);
    else select(keyOf(p));
  }

  function childSel(): void {
    const el = selEl();
    if (!el) return;
    const c = el.querySelector("[data-dr-n]");
    if (c) select(keyOf(c));
  }

  function editSel(all: boolean): boolean {
    const el = selEl();
    if (!el) return false;
    const t = el.hasAttribute("data-dr-t") ? el : el.querySelector("[data-dr-t]");
    if (!t) return false;
    return panel.editText(t, all);
  }

  function nudge(dx: number, dy: number): void {
    const el = selEl(), n = selNode();
    if (!el || !n) return;
    const ex = dx, ey = dy;
    let changes: any;
    if (isAbs(el)) {
      const c = cs(el);
      changes = { left: Math.round(pxv(c.left, el.offsetLeft) + ex) + "px", top: Math.round(pxv(c.top, el.offsetTop) + ey) + "px" };
    } else {
      const t = translateOf(el);
      const x = Math.round(t.x + ex), y = Math.round(t.y + ey);
      changes = { translate: x || y ? x + "px " + y + "px" : null };
    }
    moved(el, n, changes, "nudge", true);
  }

  function onFrameDbl(e: any): void {
    if (!on() || editingTarget(e.target)) return;
    const el = selEl();
    if (!el || !el.contains(e.target)) return;
    if (el.tagName === "IMG" && !e.target.closest("[data-dr-t]")) {
      e.preventDefault();
      e.stopPropagation();
      replacing = el;
      picker.click();
      return;
    }
    // A shape or a box whose text sits in a child: type into that child.
    if (!e.target.closest("[data-dr-t]")) {
      e.stopPropagation();
      editSel(false);
    }
  }

  function onFrameContext(e: any): void {
    if (!on() || editingTarget(e.target) || host.inspecting()) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = selEl();
    if (!cur || !cur.contains(e.target)) {
      const c = candidate(e.target, e.ctrlKey || e.metaKey);
      select(c ? keyOf(c) : null);
    }
    const fr = frame.getBoundingClientRect();
    contextMenu(fr.left + e.clientX * scale, fr.top + e.clientY * scale);
  }

  function contextMenu(x: number, y: number): void {
    const has = canEdit();
    const el = selEl();
    const text = !!el && !!(el.hasAttribute("data-dr-t") || el.querySelector("[data-dr-t]"));
    openMenu([
      ["Edit text", "Enter", function () { editSel(false); }, !text],
      null,
      ["Cut", "Ctrl X", function () { copySel(true); }, !has],
      ["Copy", "Ctrl C", function () { copySel(false); }, !has],
      ["Paste", "Ctrl V", pasteFromClipboard],
      ["Duplicate", "Ctrl D", duplicateSel, !has],
      ["Delete", "Del", removeSel, !has],
      null,
      ["Bring to front", "Ctrl ]", function () { order("front"); }, !has, "front"],
      ["Send to back", "Ctrl [", function () { order("back"); }, !has, "back"],
      null,
      ["Select parent", "Esc", parentSel, !has, "parent"],
      ["Show in source", "", function () { const n = selNode(); if (n) host.reveal(n.start); }, !has, "code"],
    ], x, y);
  }

  function pasteFromClipboard(): void {
    try { navigator.clipboard.readText().then(pasteHtml, function () { pasteHtml(""); }); } catch (e) { pasteHtml(""); }
  }

  // ── Keys ───────────────────────────────────────────────────────────────

  function textField(el: any): boolean {
    if (!el) return false;
    const t = (el.tagName || "").toLowerCase();
    return t === "textarea" || t === "select" || (t === "input" && !/^(checkbox|radio|button|range|color)$/i.test(el.type)) || !!el.isContentEditable;
  }

  /** Where design keys apply: the canvas, the bars, the panel's buttons; never a text field or an open dialog. */
  function designFocus(fromFrame: boolean, e: any): boolean {
    if (host.modal && host.modal()) return false;
    if (fromFrame) return !editingTarget(e.target) && !textField(e.target);
    const a = doc.activeElement;
    if (!a || a === doc.body || a === doc.documentElement || a === canvas || a === frame) return true;
    if (textField(a)) return false;
    return stage.contains(a) || props.contains(a) || menu.contains(a);
  }

  const TOOL_KEYS: Record<string, string> = { t: "text", r: "rect", o: "ellipse", d: "diamond", l: "line" };

  function onKey(e: any, fromFrame: boolean): void {
    // Taken already: the Esc that ends typing on the slide must not also deselect.
    if (!on() || e.defaultPrevented || e.isComposing || e.keyCode === 229 || host.inspecting()) return;
    if (!designFocus(fromFrame, e)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key || "";
    const lower = k.toLowerCase();
    const has = canEdit();
    let done = true;
    if (mod && !e.altKey && (k === "=" || k === "+" || e.code === "Equal" || e.code === "NumpadAdd")) zoomBy(1);
    else if (mod && !e.altKey && (k === "-" || k === "_" || e.code === "Minus" || e.code === "NumpadSubtract")) zoomBy(-1);
    else if (mod && !e.altKey && (k === "0" || e.code === "Digit0" || e.code === "Numpad0")) setZoom("fit");
    else if (k === "Escape") {
      if (tool) setTool(null);
      else if (menu.classList.contains("is-on") || pop.classList.contains("is-on")) closeAll();
      else if (has) parentSel();
      else done = false;
    }
    else if (mod && lower === "z" && !e.shiftKey) panel.undo();
    else if (mod && (lower === "y" || (lower === "z" && e.shiftKey))) panel.redo();
    else if (has && !mod && (k === "Delete" || k === "Backspace")) removeSel();
    else if (has && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") && !mod) {
      const s = e.shiftKey ? 10 : 1;
      nudge(k === "ArrowLeft" ? -s : k === "ArrowRight" ? s : 0, k === "ArrowUp" ? -s : k === "ArrowDown" ? s : 0);
    }
    else if (has && !mod && k === "Enter" && e.shiftKey) parentSel();
    else if (has && !mod && k === "Enter") { if (!editSel(false)) childSel(); }
    else if (has && mod && lower === "d" && !e.shiftKey) duplicateSel();
    else if (has && mod && (lower === "c" || lower === "x") && !e.shiftKey && !hasTextSelection()) copySel(lower === "x");
    else if (mod && lower === "v" && !e.shiftKey && fromFrame) pasteFromClipboard();
    else if (has && mod && (k === "]" || e.code === "BracketRight")) order("front");
    else if (has && mod && (k === "[" || e.code === "BracketLeft")) order("back");
    else if (!mod && !e.altKey && TOOL_KEYS[lower]) {
      const t = TOOL_KEYS[lower];
      setTool(e.shiftKey ? (t === "rect" ? "rounded" : t === "line" ? "connector" : t) : t);
    }
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  }

  function hasTextSelection(): boolean {
    try {
      const s = fdoc() && fdoc().defaultView.getSelection();
      return !!s && !s.isCollapsed;
    } catch (e) { return false; }
  }

  doc.addEventListener("keydown", function (e: any) { onKey(e, false); }, true);

  // A paste on the canvas (Ctrl V there) lands on the slide.
  doc.addEventListener("paste", function (e: any) {
    if (!on() || !designFocus(false, e) || (doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("#rail"))) return;
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); dropFiles(files, null); return; }
    const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    e.preventDefault();
    pasteHtml(text);
  });
  doc.addEventListener("copy", function (e: any) {
    if (!on() || !canEdit() || !designFocus(false, e)) return;
    const n = selNode();
    if (!n) return;
    clip = K.outer(src.value, n);
    e.clipboardData.setData("text/plain", clip);
    e.preventDefault();
  });
  doc.addEventListener("cut", function (e: any) {
    if (!on() || !canEdit() || !designFocus(false, e)) return;
    const n = selNode();
    if (!n) return;
    clip = K.outer(src.value, n);
    e.clipboardData.setData("text/plain", clip);
    e.preventDefault();
    removeSel();
  });

  // ── What the deck offers: its text styles, fonts, and colors ───────────

  function learnDeck(): void {
    const d = fdoc();
    if (!d || !d.body) return;
    const w = d.defaultView;
    presets = [];
    // Each style is the look that carries the most words among its elements,
    // so a short label set in small caps does not pass for the body text.
    [["Title", "h1"], ["Heading", "h2"], ["Subheading", "h3, h4"], ["Body", "p, li, dd, td"], ["Caption", "figcaption, small, .caption"]].forEach(function (p) {
      // A sample is enough to find the common look, and keeps a long deck quick to reload.
      const list = Array.prototype.slice.call(d.querySelectorAll(p[1].split(", ").map(function (q) { return "[data-dr-slide] " + q; }).join(", ")), 0, 400);
      const tally: any = {};
      let best: any = null;
      list.forEach(function (el: any) {
        const c = w.getComputedStyle(el);
        const key = c.fontSize + "|" + c.fontWeight + "|" + c.fontFamily;
        const words = (el.textContent || "").replace(/\s+/g, " ").trim().length;
        if (!words) return;
        tally[key] = (tally[key] || 0) + words;
        if (!best || tally[key] > tally[best.key]) best = { key, c };
      });
      if (!best) return;
      const c = best.c;
      const size = Math.round(parseFloat(c.fontSize) * 10) / 10;
      const lh = c.lineHeight === "normal" ? "1.2" : String(Math.round(parseFloat(c.lineHeight) / parseFloat(c.fontSize) * 100) / 100);
      presets.push({ label: p[0], family: c.fontFamily, size, weight: c.fontWeight, lh, ls: c.letterSpacing === "normal" ? "0" : c.letterSpacing });
    });
    const seen: Record<string, 1> = {};
    fonts = [];
    const addFont = function (stack: string): void {
      if (!stack) return;
      const first = K.splitTop(stack, ",")[0].trim().replace(/^["']|["']$/g, "");
      if (!first || seen[first.toLowerCase()] || /^(inherit|initial|unset|var\()/i.test(first)) return;
      seen[first.toLowerCase()] = 1;
      fonts.push({ name: first, stack: K.quoteFamilies(stack) });
    };
    presets.forEach(function (p) { addFont(p.family); });
    try {
      Array.prototype.slice.call(d.styleSheets).forEach(function (sh: any) {
        let rules: any;
        try { rules = sh.cssRules; } catch (e) { return; }
        Array.prototype.slice.call(rules || []).forEach(function (r: any) { if (r.style && r.style.fontFamily) addFont(r.style.fontFamily); });
      });
    } catch (e) {}
    ["system-ui, sans-serif", "Georgia, serif", "'Times New Roman', serif", "Arial, sans-serif", "'Courier New', monospace", "ui-monospace, monospace"]
      .forEach(addFont);
    themeColors = [];
    const probe = d.createElement("i");
    probe.style.display = "none";
    d.body.appendChild(probe);
    const names: Record<string, 1> = {};
    try {
      Array.prototype.slice.call(d.styleSheets).forEach(function (sh: any) {
        let rules: any;
        try { rules = sh.cssRules; } catch (e) { return; }
        Array.prototype.slice.call(rules || []).forEach(function (r: any) {
          if (!r.style || !/^(:root|html|body)$/.test((r.selectorText || "").trim())) return;
          for (let i = 0; i < r.style.length; i++) {
            const name = r.style[i];
            if (name.indexOf("--") !== 0 || names[name]) continue;
            probe.style.color = "";
            probe.style.color = "var(" + name + ")";
            const c = w.getComputedStyle(probe).color;
            const raw = r.style.getPropertyValue(name).trim();
            if (!K.rgba(c) || !/^(#|rgb|hsl|oklch|oklab|lab|lch|color|[a-z]+$)/i.test(raw) || /^(inherit|initial|none)$/i.test(raw)) continue;
            names[name] = 1;
            themeColors.push({ name, css: "var(" + name + ")", color: c });
          }
        });
      });
    } catch (e) {}
    probe.remove();
    themeColors = themeColors.slice(0, 24);
  }

  // ── The properties panel ───────────────────────────────────────────────

  let ctrls: any[] = [];
  let openFx = -1;

  function h(tag: string, cls?: string, text?: string): any {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function section(title: string, opts?: any): any {
    const s = h("div", "dz-sec");
    const hd = h("div", "dz-sec__head");
    hd.appendChild(h("span", "dz-sec__title", title));
    s.appendChild(hd);
    const b = h("div", "dz-sec__body");
    s.appendChild(b);
    if (opts && opts.add) {
      const add = h("button", "dz-ib");
      add.innerHTML = icon("plus", 14);
      add.title = opts.addTitle || "Add";
      add.addEventListener("click", function (e: any) { opts.add(e, add); });
      hd.appendChild(add);
    }
    if (opts && opts.fold !== undefined) {
      const tog = h("button", "dz-ib");
      const paint = function (): void {
        s.classList.toggle("is-folded", !advOn);
        tog.innerHTML = icon(advOn ? "down" : "right", 14);
      };
      tog.title = "Show or hide";
      hd.style.cursor = "pointer";
      hd.addEventListener("click", function () { advOn = !advOn; host.set(KEY.adv, advOn ? "1" : "0"); paint(); });
      hd.appendChild(tog);
      paint();
    }
    body.appendChild(s);
    return b;
  }

  function row(parent: any, label: string, ...kids: any[]): any {
    const r = h("div", "dz-row");
    const l = h("label", "", label);
    l.title = label;
    r.appendChild(l);
    const c = h("div", "dz-ctl");
    kids.forEach(function (k) { if (k) c.appendChild(k); });
    r.appendChild(c);
    parent.appendChild(r);
    return r;
  }

  function reg(c: any): any { ctrls.push(c); return c.el; }

  function fmt(n: any): string {
    if (typeof n !== "number") return n === undefined || n === null ? "" : String(n);
    return String(Math.round(n * 100) / 100);
  }

  /** A number with a unit; arrows step it, Enter or leaving sets it. Words like auto pass through. */
  function numCtl(o: any): any {
    const f = h("div", "dz-field");
    if (o.icon) {
      const ic = h("span", "dz-fi");
      ic.innerHTML = icon(o.icon, 13);
      ic.title = o.title || "";
      f.appendChild(ic);
      scrub(ic, o);
    }
    const inp = h("input");
    inp.spellcheck = false;
    if (o.placeholder) inp.placeholder = o.placeholder;
    if (o.title) inp.title = o.title;
    f.appendChild(inp);
    if (o.unit) f.appendChild(h("span", "dz-unit", o.unit));
    let shown = "";
    const refresh = function (): void {
      if (doc.activeElement === inp) return;
      shown = fmt(o.get());
      inp.value = shown;
    };
    const set = function (raw: string): void {
      raw = raw.trim();
      if (raw === shown) return;
      const n = parseFloat(raw);
      if (raw === "" || !isFinite(n)) { if (o.words || raw === "") { o.set(raw === "" ? null : raw); } }
      else o.set(Math.max(o.min !== undefined ? o.min : -Infinity, Math.min(o.max !== undefined ? o.max : Infinity, n)));
      shown = raw;
      setTimeout(refresh, 0);
    };
    inp.addEventListener("keydown", function (e: any) {
      if (e.key === "Enter") { e.preventDefault(); set(inp.value); inp.select(); }
      else if (e.key === "Escape") { e.preventDefault(); inp.value = shown; inp.blur(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = parseFloat(inp.value) || 0;
        const st = (o.step || 1) * (e.shiftKey ? 10 : 1);
        const next = Math.round((cur + (e.key === "ArrowUp" ? st : -st)) * 1000) / 1000;
        inp.value = fmt(next);
        set(inp.value);
      }
      e.stopPropagation();
    });
    inp.addEventListener("blur", function () { set(inp.value); });
    refresh();
    return reg({ el: f, refresh });
  }

  /**
   * Dragging a field's icon sideways scrubs its number, as in Figma. Each
   * write is a rewrite of the whole file, so a fast scrub writes a few times
   * a second and once more where it stops; the undo history folds them.
   */
  function scrub(ic: any, o: any): void {
    ic.addEventListener("pointerdown", function (e: any) {
      e.preventDefault();
      const start = parseFloat(String(o.get())) || 0;
      const x0 = e.clientX;
      let last = 0, want: number | null = null, timer: any = null;
      try { ic.setPointerCapture(e.pointerId); } catch (err) {}
      const flush = function (): void {
        clearTimeout(timer);
        timer = null;
        if (want === null) return;
        const v = want;
        want = null;
        last = Date.now();
        o.set(v);
        refreshAll();
      };
      const mv = function (ev: any): void {
        const st = (o.step || 1) * (ev.shiftKey ? 10 : 1);
        const v = Math.round((start + Math.round((ev.clientX - x0) / 2) * st) * 1000) / 1000;
        want = Math.max(o.min !== undefined ? o.min : -Infinity, Math.min(o.max !== undefined ? o.max : Infinity, v));
        if (Date.now() - last > 120) flush();
        else if (!timer) timer = setTimeout(flush, 120);
      };
      const up = function (): void {
        flush();
        ic.removeEventListener("pointermove", mv);
        ic.removeEventListener("pointerup", up);
      };
      ic.addEventListener("pointermove", mv);
      ic.addEventListener("pointerup", up);
    });
  }

  function selectCtl(o: any): any {
    const s = h("select", "dz-select" + (o.cls ? " " + o.cls : ""));
    const fill = function (): void {
      s.textContent = "";
      const opts = typeof o.options === "function" ? o.options() : o.options;
      opts.forEach(function (p: any) {
        const op = h("option", "", p[1]);
        op.value = p[0];
        s.appendChild(op);
      });
    };
    fill();
    const refresh = function (): void {
      if (doc.activeElement === s) return;
      const v = String(o.get());
      if (!Array.prototype.some.call(s.options, function (op: any) { return op.value === v; })) {
        const op = h("option", "", o.label ? o.label(v) : v);
        op.value = v;
        s.appendChild(op);
      }
      s.value = v;
    };
    s.addEventListener("change", function () { o.set(s.value); setTimeout(refresh, 0); });
    s.addEventListener("keydown", function (e: any) { e.stopPropagation(); });
    refresh();
    return reg({ el: s, refresh });
  }

  /** Buttons where one is on (radio), or each toggles on its own (toggles). */
  function segCtl(o: any): any {
    const s = h("div", "dz-seg" + (o.toggles ? " dz-seg--toggles" : ""));
    const btns = o.options.map(function (p: any) {
      const b = h("button");
      b.type = "button";
      if (p[1]) b.innerHTML = p[1].length < 3 || p[1].charAt(0) === "<" ? p[1] : icon(p[1], 14);
      b.title = p[2] || p[0];
      b.addEventListener("click", function () {
        if (o.toggles) o.set(p[0], b.getAttribute("aria-pressed") !== "true");
        else o.set(p[0]);
        refreshAll();
      });
      s.appendChild(b);
      return b;
    });
    const refresh = function (): void {
      const v = o.get();
      btns.forEach(function (b: any, i: number) {
        const key = o.options[i][0];
        b.setAttribute("aria-pressed", (o.toggles ? !!(v && v[key]) : v === key) ? "true" : "false");
      });
    };
    refresh();
    return reg({ el: s, refresh });
  }

  function textCtl(o: any): any {
    const f = h("div", "dz-text");
    const inp = h("input");
    inp.spellcheck = false;
    inp.placeholder = o.placeholder || "";
    f.appendChild(inp);
    let shown = "";
    const refresh = function (): void { if (doc.activeElement !== inp) { shown = String(o.get() || ""); inp.value = shown; } };
    const set = function (): void { if (inp.value.trim() !== shown) { shown = inp.value.trim(); o.set(shown || null); } };
    inp.addEventListener("keydown", function (e: any) {
      if (e.key === "Enter") { e.preventDefault(); set(); }
      else if (e.key === "Escape") { inp.value = shown; inp.blur(); }
      e.stopPropagation();
    });
    inp.addEventListener("blur", set);
    refresh();
    return reg({ el: f, refresh });
  }

  function checkCtl(o: any): any {
    const c = h("input", "dz-check");
    c.type = "checkbox";
    const refresh = function (): void { c.checked = !!o.get(); };
    c.addEventListener("change", function () { o.set(c.checked); });
    refresh();
    return reg({ el: c, refresh });
  }

  function rangeCtl(o: any): any {
    const r = h("input", "dz-range");
    r.type = "range";
    r.min = String(o.min); r.max = String(o.max); r.step = String(o.step);
    const refresh = function (): void { if (doc.activeElement !== r) r.value = String(o.get()); };
    r.addEventListener("input", function () { o.preview(parseFloat(r.value)); refreshAll(r); });
    r.addEventListener("change", function () { o.set(parseFloat(r.value)); });
    refresh();
    return reg({ el: r, refresh });
  }

  /**
   * A color: the swatch opens the picker (the deck's own colors first), the
   * text takes any CSS color or `var(--name)`. `get` gives { value, shown }:
   * what the element sets itself, and what it ends up painted with.
   */
  function colorCtl(o: any): any {
    const f = h("div", "dz-text");
    const sw = h("span", "dz-swatch");
    const chip = h("i");
    sw.appendChild(chip);
    f.appendChild(sw);
    const inp = h("input");
    inp.spellcheck = false;
    f.appendChild(inp);
    let shown = "";
    const refresh = function (): void {
      const v = o.get();
      chip.style.background = v.shown || "transparent";
      if (doc.activeElement === inp) return;
      shown = v.text;
      inp.value = shown;
    };
    const set = function (): void {
      const t = inp.value.trim();
      if (t === shown) return;
      if (!t || /^(none|default|theme default)$/i.test(t)) { o.set(t.toLowerCase() === "none" ? "transparent" : null, true); }
      else if (/^[0-9a-f]{3,8}$/i.test(t)) o.set("#" + t.toUpperCase(), true);
      else if (cssColor(t)) o.set(t, true);
      else { host.toast("Not a color: " + t, "warn"); inp.value = shown; return; }
      setTimeout(refresh, 0);
    };
    inp.addEventListener("keydown", function (e: any) {
      if (e.key === "Enter") { e.preventDefault(); set(); }
      else if (e.key === "Escape") { inp.value = shown; inp.blur(); }
      e.stopPropagation();
    });
    inp.addEventListener("blur", set);
    sw.addEventListener("click", function () {
      openColor(sw, o.get(), o.set, o.none);
    });
    refresh();
    return reg({ el: f, refresh });
  }

  function cssColor(t: string): boolean {
    if (/^var\(--[\w-]+\)$/.test(t)) return true;
    try { return (window as any).CSS && (window as any).CSS.supports("color", t); } catch (e) { return false; }
  }

  const BASIC = ["#FFFFFF", "#F4F4F5", "#D4D4D8", "#9AA0A6", "#52525B", "#27272A", "#111111", "#000000",
    "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#22C55E", "#14B8A6", "#3B82F6", "#8B5CF6"];

  /** The picker: the deck's colors, a basic set, a full picker, and None / Default. */
  function openColor(anchor: any, cur: any, set: (v: string | null, final: boolean) => void, noneLabel?: string): void {
    closeAll();
    pop.textContent = "";
    const swatches = function (title: string, list: any[]): void {
      if (!list.length) return;
      pop.appendChild(h("div", "dz-pop-title", title));
      const g = h("div", "dz-pal");
      list.forEach(function (c: any) {
        const b = h("button");
        b.type = "button";
        b.title = c.name || c.css;
        b.style.background = c.color || c.css;
        b.addEventListener("click", function () { set(c.css, true); closeAll(); refreshAll(); });
        g.appendChild(b);
      });
      pop.appendChild(g);
    };
    swatches("this deck", themeColors);
    swatches("basic", BASIC.map(function (c) { return { css: c }; }));
    const rw = h("div", "dz-pop-row");
    const pick = h("input");
    pick.type = "color";
    const c0 = K.rgba(cur && cur.shown) || { r: 154, g: 160, b: 166, a: 1 };
    pick.value = K.hex(c0).toLowerCase();
    pick.addEventListener("input", function () { set(pick.value.toUpperCase(), false); refreshAll(); });
    pick.addEventListener("change", function () { set(pick.value.toUpperCase(), true); refreshAll(); });
    rw.appendChild(pick);
    const none = h("button", "dz-btn", "None");
    none.type = "button";
    none.title = "Nothing painted (transparent)";
    none.addEventListener("click", function () { set("transparent", true); closeAll(); refreshAll(); });
    rw.appendChild(none);
    const dflt = h("button", "dz-btn", noneLabel || "Default");
    dflt.type = "button";
    dflt.title = "Take away this setting, so the deck's own style applies";
    dflt.addEventListener("click", function () { set(null, true); closeAll(); refreshAll(); });
    rw.appendChild(dflt);
    pop.appendChild(rw);
    const r = anchor.getBoundingClientRect();
    placeAt(pop, r.left - 200, r.bottom + 6);
  }

  function refreshAll(except?: any): void {
    ctrls.forEach(function (c) { if (c.el !== except) { try { c.refresh(); } catch (e) {} } });
  }

  function refresh(): void {
    if (!propsOn) return;
    refreshAll();
    paintHead();
  }

  // Reading the element: what its own style says, and what it computes to.

  function inl(): any {
    const n = selNode();
    return n ? K.styleMap((K.attr(n, "style") || { value: "" }).value) : {};
  }

  function colorOf(value: string | undefined, computed: string, noneText: string): any {
    if (value) {
      const c = K.rgba(computed);
      return { value, shown: computed, text: /^var\(/.test(value) ? value : c ? (c.a === 0 ? "None" : K.css(c)) : value };
    }
    const c = K.rgba(computed);
    return { value: null, shown: computed, text: !c || c.a === 0 ? noneText : noneText === "Theme default" ? noneText : K.css(c) };
  }

  function paintHead(): void {
    head.textContent = "";
    const el = selEl(), n = selNode();
    const t = h("span", "dz-title");
    if (!el || !n) {
      const k = Math.max(0, panel.current());
      const s = panel.model().slides[k];
      t.textContent = "Slide " + (k + 1);
      if (s) {
        const sub = h("span", "dz-sub", (s.comment && s.comment.label) || s.title || "");
        t.appendChild(sub);
      }
      head.appendChild(t);
      return;
    }
    const kind = kindOf(el);
    const cls = ((K.attr(n, "class") || { value: "" }).value || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (c: string) { return "." + c; }).join("");
    t.textContent = NAMES[kind] || n.name + cls;
    t.title = n.name + cls;
    head.appendChild(t);
    const up = h("button", "dz-ib");
    up.innerHTML = icon("parent", 14);
    up.title = "Select the parent (Esc)";
    up.addEventListener("click", parentSel);
    head.appendChild(up);
    const code = h("button", "dz-ib");
    code.innerHTML = icon("code", 14);
    code.title = "Show in source";
    code.addEventListener("click", function () { host.reveal(n.start); });
    head.appendChild(code);
    const x = h("button", "dz-ib");
    x.innerHTML = icon("close", 13);
    x.title = "Deselect";
    x.addEventListener("click", function () { select(null); });
    head.appendChild(x);
  }

  function renderPanel(): void {
    if (!propsOn) return;
    const top = body.scrollTop;
    body.textContent = "";
    ctrls = [];
    paintHead();
    if (!on()) return;
    const el = selEl(), n = selNode();
    if (!el || !n) renderSlide();
    else renderElement(el, n);
    body.scrollTop = top;
  }

  function renderSlide(): void {
    const k = Math.max(0, panel.current());
    const pl = placing(k);
    const m = panel.model();
    const s = m.slides[k];
    if (!s) return;
    const core = pl ? pl.live : null;
    const coreStyle = function (): any { return K.styleMap((K.attr(panel.model().slides[k].core, "style") || { value: "" }).value); };
    const setCore = function (changes: any, tag: string, fold: boolean): void {
      const s2 = panel.model().slides[k];
      commit(K.setStyle(src.value, s2.core, changes), "slide-" + tag + ":" + k, fold, function () { if (core) patchStyle(core, changes); });
    };
    const sec = section("Slide");
    const tr = function (): string { const a = K.attr(panel.model().slides[k].core, "data-transition"); return a ? a.value : ""; };
    row(sec, "Transition", selectCtl({
      options: K.transitions().map(function (t: any) { return [t.id, t.label]; }),
      get: tr,
      set: function (v: string) {
        const s2 = panel.model().slides[k];
        commit(K.setAttr(src.value, s2.core, "data-transition", v || null), "transition:" + k, false, function () {
          if (!core) return;
          if (v) core.setAttribute("data-transition", v); else core.removeAttribute("data-transition");
          const f = K.frames(v, 1);
          if (f) { try { core.animate(f, { duration: 520, easing: "cubic-bezier(.2,.75,.25,1)" }); } catch (e) {} }
        });
      },
    }));
    const all = h("button", "dz-link", "Apply to every slide");
    all.type = "button";
    all.addEventListener("click", function () {
      const v = tr();
      const mm = panel.model();
      const edits = mm.slides.map(function (x: any) { return K.attrEdit(src.value, x.core, "data-transition", v || null); });
      if (panel.apply(K.apply(src.value, edits), { kind: "dz:transition-all", fold: false })) host.toast(v ? "Every slide now comes in with " + v + "." : "Every slide is back to the deck's own transition.");
    });
    row(sec, "", all);
    const note = h("div", "dz-note", "Plays when you present from deckrun. Opened on its own, the deck keeps its own way of changing slides.");
    sec.appendChild(note);
    const ap = section("Appearance");
    row(ap, "Background", colorCtl({
      none: "Default",
      get: function () { return colorOf(coreStyle()["background-color"] || coreStyle().background, core ? cs(core).backgroundColor : "", "Default"); },
      set: function (v: string | null, final: boolean) {
        if (!final) { if (core) patchStyle(core, { "background-color": v }); return; }
        setCore({ "background-color": v }, "bg", true);
      },
    }));
  }

  function isTexty(el: any): boolean {
    return !/^(IMG|VIDEO|SVG|IFRAME|HR|BR|CANVAS|AUDIO|svg|line|path)$/.test(el.tagName) && !LINES[kindOf(el)];
  }

  function renderElement(el: any, n: any): void {
    const kind = kindOf(el);
    if (LINES[kind]) { renderLine(el, n); return; }
    const abs = isAbs(el);
    const set = function (changes: any, tag: string, fold?: boolean): void { styleSel(changes, tag, fold); };

    // Position
    const pos = section(abs ? "Position" : "Offset");
    if (abs) {
      const g = h("div", "dz-grid2");
      g.appendChild(numCtl({ icon: "pl", title: "X (left)", unit: "px", get: function () { return Math.round(pxv(cs(selEl()).left, 0)); }, set: function (v: number) { moved(selEl(), selNode(), { left: v + "px" }, "x", true); } }));
      g.appendChild(numCtl({ icon: "pt", title: "Y (top)", unit: "px", get: function () { return Math.round(pxv(cs(selEl()).top, 0)); }, set: function (v: number) { moved(selEl(), selNode(), { top: v + "px" }, "y", true); } }));
      row(pos, "X / Y", g);
    } else {
      const g = h("div", "dz-grid2");
      g.appendChild(numCtl({ icon: "pl", title: "Moved right by", unit: "px", get: function () { return translateOf(selEl()).x; }, set: function (v: number) { const t = translateOf(selEl()); moved(selEl(), selNode(), { translate: v || t.y ? v + "px " + t.y + "px" : null }, "tx", true); } }));
      g.appendChild(numCtl({ icon: "pt", title: "Moved down by", unit: "px", get: function () { return translateOf(selEl()).y; }, set: function (v: number) { const t = translateOf(selEl()); moved(selEl(), selNode(), { translate: t.x || v ? t.x + "px " + v + "px" : null }, "ty", true); } }));
      row(pos, "X / Y", g);
    }
    row(pos, "Rotation", numCtl({ icon: "rot", unit: "°", step: 1, get: function () { return rotateOf(selEl()); }, set: function (v: number) { set({ rotate: v ? v + "deg" : null }, "rotate"); } }));

    // Size
    const sz = section("Size");
    const modeOf = function (prop: string): string {
      const v = (inl()[prop] || "").trim();
      if (!v) return "auto";
      if (/^(fit-content|max-content)$/.test(v)) return "hug";
      if (v === "100%" || v === "stretch" || v === "-webkit-fill-available") return "fill";
      return "fixed";
    };
    const dim = function (prop: string): any {
      const f = numCtl({
        unit: "px", min: 0, words: true,
        get: function () { const e = selEl(); return prop === "width" ? Math.round(e.offsetWidth) : Math.round(e.offsetHeight); },
        set: function (v: any) {
          if (typeof v !== "number") { set({ [prop]: v }, prop); return; }
          const c = cs(selEl());
          const extra = c.boxSizing === "content-box"
            ? (prop === "width" ? pxv(c.paddingLeft, 0) + pxv(c.paddingRight, 0) + pxv(c.borderLeftWidth, 0) + pxv(c.borderRightWidth, 0)
              : pxv(c.paddingTop, 0) + pxv(c.paddingBottom, 0) + pxv(c.borderTopWidth, 0) + pxv(c.borderBottomWidth, 0))
            : 0;
          moved(selEl(), selNode(), { [prop]: Math.max(0, v - extra) + "px" }, prop, true);
        },
      });
      const mode = selectCtl({
        cls: "dz-mode",
        options: prop === "width"
          ? [["auto", "Auto"], ["hug", "Hug"], ["fixed", "Fixed"], ["fill", "Fill"]]
          : [["auto", "Auto"], ["fixed", "Fixed"], ["fill", "Fill"]],
        get: function () { return modeOf(prop); },
        set: function (v: string) {
          const e = selEl();
          const val = v === "auto" ? null : v === "hug" ? "fit-content" : v === "fill" ? "100%" : Math.round(prop === "width" ? e.offsetWidth : e.offsetHeight) + "px";
          set({ [prop]: val }, prop + "-mode", false);
        },
      });
      return [f, mode];
    };
    row.apply(null, [sz, "Width"].concat(dim("width")) as any);
    row.apply(null, [sz, "Height"].concat(dim("height")) as any);
    const mm = h("div", "dz-grid2");
    [["min-width", "Min W"], ["max-width", "Max W"], ["min-height", "Min H"], ["max-height", "Max H"]].forEach(function (p) {
      mm.appendChild(numCtl({
        unit: "px", min: 0, words: true, placeholder: p[0].indexOf("max") === 0 ? "—" : "0", title: p[1],
        get: function () { const v = inl()[p[0]]; return v ? K.num(v) || v : ""; },
        set: function (v: any) { set({ [p[0]]: v === null ? null : typeof v === "number" ? v + "px" : v }, p[0]); },
      }));
    });
    row(sz, "Min / max", mm);

    // Layout
    const lay = section("Layout");
    padRow(lay, el);
    const disp = cs(el).display;
    if (/flex|grid/.test(disp)) {
      row(lay, "Gap", numCtl({ unit: "px", min: 0, get: function () { return Math.round(pxv(cs(selEl()).rowGap, 0)); }, set: function (v: number) { set({ gap: v + "px" }, "gap"); } }));
      if (/flex/.test(disp)) {
        row(lay, "Direction", segCtl({
          options: [["row", "→", "Side by side"], ["column", "↓", "Stacked"]],
          get: function () { return /column/.test(cs(selEl()).flexDirection) ? "column" : "row"; },
          set: function (v: string) { set({ "flex-direction": v }, "dir", false); },
        }));
      }
    }

    if (isTexty(el)) renderText(el, n);
    if (el.tagName === "TABLE") renderTable(el, n);
    renderAppearance(el, n);
    renderEffects(el);
    renderAdvanced(el, n);
  }

  function padRow(sec: any, el: any): void {
    const perSide = (function (): boolean {
      const c = cs(el);
      return !(c.paddingTop === c.paddingRight && c.paddingTop === c.paddingBottom && c.paddingTop === c.paddingLeft);
    })();
    let split = perSide;
    const table = el.tagName === "TABLE";
    const read = function (side: string): number {
      const e = selEl();
      if (!e) return 0;
      const t = table ? e.querySelector("td,th") || e : e;
      return Math.round(pxv(cs(t)["padding" + side], 0));
    };
    const write = function (changes: any): void {
      if (table) { styleCells(changes, "pad"); return; }
      styleSel(changes, "pad");
    };
    const wrap = h("div");
    wrap.style.flex = "1 1 auto";
    const one = h("div", "dz-ctl");
    const grid = h("div", "dz-grid2");
    wrap.appendChild(one);
    wrap.appendChild(grid);
    one.appendChild(numCtl({ unit: "px", min: 0, placeholder: "Per side", get: function () { return split ? "" : read("Top"); }, set: function (v: number) { write({ padding: v + "px" }); } }));
    [["Top", "pt"], ["Right", "pr"], ["Bottom", "pb"], ["Left", "pl"]].forEach(function (p) {
      grid.appendChild(numCtl({
        icon: p[1], title: p[0], unit: "", min: 0,
        get: function () { return read(p[0]); },
        set: function (v: number) {
          const ch: any = {};
          ["Top", "Right", "Bottom", "Left"].forEach(function (s2) { ch["padding-" + s2.toLowerCase()] = (s2 === p[0] ? v : read(s2)) + "px"; });
          ch.padding = null;
          write(ch);
        },
      }));
    });
    const paint = function (): void { grid.style.display = split ? "grid" : "none"; grid.style.marginTop = "4px"; };
    paint();
    const tog = h("button", "dz-ib");
    tog.innerHTML = icon("sides", 14);
    tog.title = "Each side on its own";
    tog.setAttribute("aria-pressed", split ? "true" : "false");
    tog.addEventListener("click", function () { split = !split; tog.setAttribute("aria-pressed", split ? "true" : "false"); paint(); refreshAll(); });
    row(sec, "Padding", wrap, tog);
  }

  /** A table's look lives on its cells: padding and borders go to every one. */
  function styleCells(changes: any, tag: string): void {
    const el = selEl(), n = selNode();
    if (!el || !n) return;
    const info = K.tableInfo(src.value, n);
    const list: any[] = [];
    info.rows.forEach(function (r: any) { r.cells.forEach(function (c: any) { list.push({ el: c, changes }); }); });
    const next = K.setStyles(src.value, list);
    commit(next, tag + ":" + sel.key, true, function () {
      Array.prototype.slice.call(el.querySelectorAll("td,th")).forEach(function (c: any) { patchStyle(c, changes); });
    });
  }

  const WEIGHTS = [["100", "Thin"], ["200", "Extra light"], ["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"], ["900", "Black"]];

  function renderText(el: any, n: any): void {
    const sec = section("Text");
    const set = function (changes: any, tag: string, fold?: boolean): void { styleSel(changes, tag, fold); scheduleFit(); };
    const c = function (): any { return cs(selEl()); };
    const firstFam = function (s: string): string { return K.splitTop(s || "", ",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase(); };
    if (presets.length) {
      row(sec, "Text style", selectCtl({
        options: function () { return presets.map(function (p) { return [p.label, p.label]; }).concat([["Custom", "Custom"]]); },
        get: function () {
          const cc = c();
          const size = Math.round(parseFloat(cc.fontSize) * 10) / 10;
          const hit = presets.filter(function (p) { return p.size === size && String(p.weight) === String(cc.fontWeight) && firstFam(p.family) === firstFam(cc.fontFamily); })[0];
          return hit ? hit.label : "Custom";
        },
        set: function (v: string) {
          const p = presets.filter(function (x) { return x.label === v; })[0];
          if (!p) return;
          set({ "font-family": K.quoteFamilies(p.family), "font-size": p.size + "px", "font-weight": String(p.weight), "line-height": p.lh, "letter-spacing": p.ls === "0" ? null : p.ls }, "style", false);
        },
      }));
    }
    row(sec, "Font", selectCtl({
      options: function () { return fonts.map(function (f) { return [f.stack, f.name]; }); },
      label: function (v: string) { return K.splitTop(v, ",")[0].replace(/["']/g, "").trim(); },
      get: function () {
        const fam = firstFam(c().fontFamily);
        const f = fonts.filter(function (x) { return x.name.toLowerCase() === fam; })[0];
        return f ? f.stack : K.quoteFamilies(c().fontFamily);
      },
      set: function (v: string) { set({ "font-family": v }, "font", false); },
    }));
    row(sec, "Weight", selectCtl({
      options: WEIGHTS,
      get: function () { return String(Math.round(parseFloat(c().fontWeight) / 100) * 100 || 400); },
      set: function (v: string) { set({ "font-weight": v }, "weight", false); },
    }));
    row(sec, "Size", numCtl({ unit: "px", min: 1, get: function () { return Math.round(parseFloat(c().fontSize) * 10) / 10; }, set: function (v: number) { set({ "font-size": v + "px" }, "size"); } }));
    const sp = h("div", "dz-grid2");
    sp.appendChild(numCtl({
      icon: "lh", title: "Line height", step: 0.05, min: 0,
      get: function () { const cc = c(); return cc.lineHeight === "normal" ? "normal" : Math.round(parseFloat(cc.lineHeight) / parseFloat(cc.fontSize) * 100) / 100; },
      set: function (v: any) { set({ "line-height": v === null ? null : String(v) }, "lh"); }, words: true,
    }));
    sp.appendChild(numCtl({
      icon: "ls", title: "Letter spacing (px)", step: 0.1,
      get: function () { const v = c().letterSpacing; return v === "normal" ? 0 : Math.round(parseFloat(v) * 100) / 100; },
      set: function (v: number) { set({ "letter-spacing": v ? v + "px" : null }, "ls"); },
    }));
    row(sec, "Spacing", sp);
    row(sec, "Color", colorCtl({
      none: "Theme default",
      get: function () { return colorOf(inl().color, c().color, "Theme default"); },
      set: function (v: string | null, final: boolean) {
        if (!final) { patchStyle(selEl(), { color: v }); return; }
        set({ color: v }, "color");
      },
    }));
    row(sec, "Emphasis", segCtl({
      toggles: true,
      options: [["b", "<b>B</b>", "Bold"], ["i", "<i>I</i>", "Italic"], ["u", "<u>U</u>", "Underline"], ["s", "<s>S</s>", "Strikethrough"]],
      get: function () {
        const cc = c();
        const line = cc.textDecorationLine || "";
        return { b: parseFloat(cc.fontWeight) >= 600, i: cc.fontStyle === "italic", u: /underline/.test(line), s: /line-through/.test(line) };
      },
      set: function (k: string, onNow: boolean) {
        const cc = c();
        if (k === "b") set({ "font-weight": onNow ? "700" : "400" }, "b", false);
        else if (k === "i") set({ "font-style": onNow ? "italic" : "normal" }, "i", false);
        else {
          const parts = (cc.textDecorationLine || "").split(/\s+/).filter(function (x: string) { return x && x !== "none"; });
          const word = k === "u" ? "underline" : "line-through";
          const next = onNow ? parts.concat(parts.indexOf(word) < 0 ? [word] : []) : parts.filter(function (x: string) { return x !== word; });
          set({ "text-decoration-line": next.length ? next.join(" ") : "none" }, "deco", false);
        }
      },
    }));
    if (/^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|SPAN)$/.test(el.tagName) && !el.querySelector("div,p,section,table,img,svg")) {
      row(sec, "List", segCtl({
        options: [["none", "none", "No list"], ["bullet", "bullets", "Bullets"], ["number", "numbers", "Numbers"]],
        get: function () { return K.listKind(selNode()); },
        set: function (v: string) {
          const nn = selNode();
          if (!nn || K.listKind(nn) === v) return;
          const target = nn.name === "li" ? nn.parent : nn;
          rebuild(K.listify(src.value, nn, v), "list", target.start);
        },
      }));
    }
    row(sec, "Align", segCtl({
      options: [["left", "al-left", "Left"], ["center", "al-center", "Center"], ["right", "al-right", "Right"], ["justify", "al-justify", "Justify"]],
      get: function () { const a = c().textAlign; return a === "start" ? "left" : a === "end" ? "right" : a; },
      set: function (v: string) { set({ "text-align": v }, "align", false); },
    }));
    row(sec, "Case", selectCtl({
      options: [["none", "None"], ["uppercase", "UPPERCASE"], ["lowercase", "lowercase"], ["capitalize", "Title Case"]],
      get: function () { return c().textTransform || "none"; },
      set: function (v: string) { set({ "text-transform": v === "none" ? (inl()["text-transform"] ? null : "none") : v }, "case", false); },
    }));
    if (kindOf(el) || el.tagName === "P" || /^H[1-6]$/.test(el.tagName)) {
      row(sec, "Resize", selectCtl({
        options: [["auto", "Auto height"], ["fixed", "Fixed size"], ["shrink", "Shrink text to fit"]],
        get: function () {
          const e = selEl();
          if (e.getAttribute("data-fit") === "shrink") return "shrink";
          return inl().height ? "fixed" : "auto";
        },
        set: function (v: string) {
          const e = selEl(), nn = selNode();
          if (!e || !nn) return;
          const hgt = v === "auto" ? null : (inl().height || Math.round(e.offsetHeight) + "px");
          const shrink = v === "shrink";
          // The size the text goes back up to when it is shortened again.
          const max = shrink ? String(Math.round(parseFloat(cs(e).fontSize) * 10) / 10) : null;
          const next = local(nn, [{ style: { height: hgt } }, { attr: ["data-fit", shrink ? "shrink" : null] }, { attr: ["data-fit-max", max] }]);
          commit(next, "resize-mode:" + sel.key, false, function () {
            patchStyle(e, { height: hgt });
            if (shrink) { e.setAttribute("data-fit", "shrink"); e.setAttribute("data-fit-max", max); }
            else { e.removeAttribute("data-fit"); e.removeAttribute("data-fit-max"); }
          });
          if (shrink) scheduleFit();
        },
      }));
    }
  }

  // "Shrink text to fit": the box keeps its size and the type gets smaller
  // until it fits. Worked out here, as you edit, so the file stays plain CSS.
  function scheduleFit(): void {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitNow, 250);
  }

  function fitNow(): void {
    const d = fdoc();
    if (!d) return;
    Array.prototype.slice.call(d.querySelectorAll('[data-fit="shrink"]')).forEach(function (e: any) {
      if (panel.editingEl() && e.contains(panel.editingEl()) && e !== panel.editingEl()) return;
      const n = nodeOf(keyOf(e));
      if (!n) return;
      const st = K.styleMap((K.attr(n, "style") || { value: "" }).value);
      const max = K.num(e.getAttribute("data-fit-max")) || K.num(st["font-size"]) || parseFloat(cs(e).fontSize);
      const fits = function (): boolean { return e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1; };
      const before = e.style.fontSize;
      let lo = 6, hi = max, best = lo;
      e.style.fontSize = max + "px";
      if (fits()) best = max;
      else {
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          e.style.fontSize = mid + "px";
          if (fits()) { best = mid; lo = mid; } else hi = mid;
        }
      }
      best = Math.floor(best * 2) / 2;
      e.style.fontSize = before;
      const cur = K.num(st["font-size"]);
      if (Math.abs(cur - best) < 0.5) return;
      const keyNow = keyOf(e);
      commit(K.setStyle(src.value, n, { "font-size": best + "px" }), "fit:" + keyNow, true, function () { e.style.fontSize = best + "px"; });
    });
  }

  function renderTable(el: any, n: any): void {
    const sec = section("Table");
    const info = function (): any { return K.tableInfo(src.value, selNode()); };
    const sizeTo = function (rows: number, cols: number): void {
      const nn = selNode();
      if (!nn) return;
      rebuild(K.tableSize(src.value, nn, rows, cols), "table-size", nn.start);
    };
    row(sec, "Columns", numCtl({ min: 1, max: 30, get: function () { return info().cols; }, set: function (v: number) { sizeTo(info().rows.length, v); } }));
    row(sec, "Rows", numCtl({ min: 1, max: 60, get: function () { return info().rows.length; }, set: function (v: number) { sizeTo(v, info().cols); } }));
    row(sec, "Resize", selectCtl({
      options: [["auto", "Auto height"], ["shrink", "Shrink text to fit"]],
      get: function () { return selEl().getAttribute("data-fit") === "shrink" ? "shrink" : "auto"; },
      set: function (v: string) {
        attrSel("data-fit", v === "shrink" ? "shrink" : null, "table-fit");
        if (v === "shrink" && !inl().height) styleSel({ height: Math.round(selEl().offsetHeight) + "px" }, "table-h", false);
        scheduleFit();
      },
    }));
    const cellNode = function (): any { return sel && sel.cell ? nodeOf(sel.cell) : null; };
    row(sec, "Cell role", selectCtl({
      options: [["td", "Default (body)"], ["th", "Header"]],
      get: function () { const c = cellNode(); return c ? c.name : "td"; },
      set: function (v: string) {
        const c = cellNode();
        if (!c) { host.toast("Click a cell first, then pick its role.", "warn"); return; }
        const t = selNode();
        rebuild(K.cellRole(src.value, c, v === "th"), "cell-role", t.start);
      },
    }));
    sec.appendChild(h("div", "dz-sec__sub", "Column widths"));
    const g = h("div", "dz-grid2");
    const cols = info().cols;
    for (let i = 0; i < cols; i++) {
      (function (i2: number) {
        const f = textCtl({
          placeholder: "auto",
          get: function () { return info().widths[i2] === "auto" ? "" : info().widths[i2]; },
          set: function (v: string | null) {
            const nn = selNode();
            const val = v && /^[\d.]+$/.test(v) ? v + "px" : v;
            const inf = info();
            const cell = inf.rows.length ? inf.rows[0].cells[i2] : null;
            if (!cell) return;
            const live2 = liveOf(String(map().nodes.indexOf(cell)));
            commit(K.tableColWidth(src.value, nn, i2, val), "colw" + i2 + ":" + sel.key, true, function () { if (live2) patchStyle(live2, { width: val }); });
          },
        });
        const lab = h("span", "dz-unit", "Col " + (i2 + 1));
        lab.style.flex = "none";
        f.insertBefore(lab, f.firstChild);
        g.appendChild(f);
      })(i);
    }
    sec.appendChild(g);
    row(sec, "Header row", checkCtl({
      get: function () { return info().header; },
      set: function (v: boolean) { const nn = selNode(); rebuild(K.tableHeader(src.value, nn, v), "table-head", nn.start); },
    }));
  }

  function renderAppearance(el: any, n: any): void {
    const sec = section("Appearance");
    const kind = kindOf(el);
    const pathed = !!PATHED[kind];
    const path = function (): any { const e = selEl(); return e ? e.querySelector("svg path") : null; };
    const pathNode = function (): any { const p = path(); return p ? nodeOf(keyOf(p)) : null; };
    const setPath = function (attrs: any, tag: string): void {
      const p = path(), pn = pathNode();
      if (!p || !pn) return;
      const next = local(pn, Object.keys(attrs).map(function (a) { return { attr: [a, attrs[a]] }; }));
      commit(next, tag + ":" + sel.key, true, function () {
        Object.keys(attrs).forEach(function (a) { if (attrs[a] === null) p.removeAttribute(a); else p.setAttribute(a, attrs[a]); });
      });
    };
    row(sec, "Background", colorCtl({
      none: "None",
      get: function () {
        if (pathed) { const p = path(); return colorOf(p ? p.getAttribute("fill") || "" : "", p ? cs(p).fill : "", "None"); }
        return colorOf(inl()["background-color"] || inl().background, cs(selEl()).backgroundColor, "None");
      },
      set: function (v: string | null, final: boolean) {
        if (pathed) {
          if (!final) { const p = path(); if (p) p.setAttribute("fill", v || "none"); return; }
          setPath({ fill: v || "none" }, "fill");
          return;
        }
        if (!final) { patchStyle(selEl(), { "background-color": v }); return; }
        const ch: any = { "background-color": v };
        if (inl().background && !/url\(|gradient/.test(inl().background)) ch.background = null;
        styleSel(ch, "bg");
      },
    }));
    const op = function (): number { return Math.round(parseFloat(cs(selEl()).opacity) * 100) / 100; };
    row(sec, "Opacity",
      numCtl({ min: 0, max: 1, step: 0.05, get: op, set: function (v: number) { styleSel({ opacity: v >= 1 ? null : String(v) }, "opacity"); } }),
      rangeCtl({
        min: 0, max: 1, step: 0.01, get: op,
        preview: function (v: number) { patchStyle(selEl(), { opacity: String(v) }); },
        set: function (v: number) { styleSel({ opacity: v >= 1 ? null : String(v) }, "opacity"); },
      }));
    if (!pathed && el.tagName !== "svg") {
      let corners = (function (): boolean { const c = cs(el); return !(c.borderTopLeftRadius === c.borderTopRightRadius && c.borderTopLeftRadius === c.borderBottomRightRadius && c.borderTopLeftRadius === c.borderBottomLeftRadius); })();
      const wrap = h("div");
      wrap.style.flex = "1 1 auto";
      const one = h("div", "dz-ctl");
      const g = h("div", "dz-grid2");
      const CORN = [["TopLeft", "top-left", "┌"], ["TopRight", "top-right", "┐"], ["BottomRight", "bottom-right", "┘"], ["BottomLeft", "bottom-left", "└"]];
      one.appendChild(numCtl({
        unit: "px", min: 0, placeholder: "Per corner",
        get: function () { return corners ? "" : /%/.test(cs(selEl()).borderTopLeftRadius) ? cs(selEl()).borderTopLeftRadius : Math.round(pxv(cs(selEl()).borderTopLeftRadius, 0)); },
        set: function (v: any) { styleSel({ "border-radius": typeof v === "number" ? v + "px" : v }, "radius"); }, words: true,
      }));
      CORN.forEach(function (p) {
        const f = numCtl({
          unit: "", min: 0, title: p[1],
          get: function () { return Math.round(pxv(cs(selEl())["border" + p[0] + "Radius"], 0)); },
          set: function (v: number) {
            const ch: any = { "border-radius": null };
            CORN.forEach(function (q) { ch["border-" + q[1] + "-radius"] = (q === p ? v : Math.round(pxv(cs(selEl())["border" + q[0] + "Radius"], 0))) + "px"; });
            styleSel(ch, "radius");
          },
        });
        const lab = h("span", "dz-unit", p[2]);
        f.insertBefore(lab, f.firstChild);
        g.appendChild(f);
      });
      wrap.appendChild(one);
      wrap.appendChild(g);
      const paint = function (): void { g.style.display = corners ? "grid" : "none"; g.style.marginTop = "4px"; };
      paint();
      const tog = h("button", "dz-ib");
      tog.innerHTML = icon("corners", 14);
      tog.title = "Each corner on its own";
      tog.setAttribute("aria-pressed", corners ? "true" : "false");
      tog.addEventListener("click", function () { corners = !corners; tog.setAttribute("aria-pressed", corners ? "true" : "false"); paint(); refreshAll(); });
      row(sec, "Radius", wrap, tog);
    }
    // Border: none / solid / dashed / dotted, then its width and color.
    const table = el.tagName === "TABLE";
    const bTarget = function (): any { const e = selEl(); return table ? e.querySelector("td,th") || e : e; };
    const bStyle = function (): string {
      if (pathed) { const p = path(); if (!p || !p.getAttribute("stroke") || p.getAttribute("stroke") === "none") return "none"; const da = p.getAttribute("stroke-dasharray"); return !da ? "solid" : /^1(\s|,)/.test(da) || da === "1 4" ? "dotted" : "dashed"; }
      const c = cs(bTarget());
      const s = c.borderTopStyle;
      return s === "solid" || s === "dashed" || s === "dotted" ? (pxv(c.borderTopWidth, 0) ? s : "none") : "none";
    };
    const setBorder = function (ch: any, tag: string): void {
      if (table) styleCells(ch, tag); else styleSel(ch, tag);
    };
    row(sec, "Border", segCtl({
      options: [["none", "none", "No border"], ["solid", "solid", "Solid"], ["dashed", "dashed", "Dashed"], ["dotted", "dotted", "Dotted"]],
      get: bStyle,
      set: function (v: string) {
        if (pathed) {
          const p = path();
          const w = p && p.getAttribute("stroke-width") ? p.getAttribute("stroke-width") : "2";
          setPath(v === "none" ? { stroke: null, "stroke-width": null, "stroke-dasharray": null, "stroke-linecap": null }
            : { stroke: (p && p.getAttribute("stroke") && p.getAttribute("stroke") !== "none") ? p.getAttribute("stroke") : "#52525B", "stroke-width": w, "stroke-dasharray": v === "dashed" ? "8 5" : v === "dotted" ? "1 4" : null, "stroke-linecap": v === "dotted" ? "round" : null }, "stroke");
          renderPanel();
          return;
        }
        if (v === "none") setBorder({ border: null, "border-style": "none", "border-width": null, "border-color": null }, "border");
        else {
          const c = cs(bTarget());
          const w = pxv(c.borderTopWidth, 0) || (table ? 1 : 2);
          const col = c.borderTopColor && K.rgba(c.borderTopColor) && K.rgba(c.borderTopColor).a > 0 ? c.borderTopColor : "rgba(128,128,128,.6)";
          setBorder({ border: null, "border-style": v, "border-width": w + "px", "border-color": K.css(K.rgba(col)) }, "border");
        }
        renderPanel();
      },
    }));
    if (bStyle() !== "none") {
      row(sec, "Thickness", numCtl({
        unit: "px", min: 0, step: 1,
        get: function () { if (pathed) { const p = path(); return p ? K.num(p.getAttribute("stroke-width")) : 0; } return Math.round(pxv(cs(bTarget()).borderTopWidth, 0) * 10) / 10; },
        set: function (v: number) { if (pathed) setPath({ "stroke-width": String(v) }, "stroke-w"); else setBorder({ "border-width": v + "px" }, "border-w"); },
      }));
      row(sec, "Line color", colorCtl({
        none: "Default",
        get: function () {
          if (pathed) { const p = path(); return colorOf(p ? p.getAttribute("stroke") || "" : "", p ? cs(p).stroke : "", "None"); }
          return colorOf("x", cs(bTarget()).borderTopColor, "Default");
        },
        set: function (v: string | null, final: boolean) {
          if (pathed) { if (!final) { const p = path(); if (p) p.setAttribute("stroke", v || "none"); return; } setPath({ stroke: v || "none" }, "stroke-c"); return; }
          if (!final) { patchStyle(bTarget(), { "border-color": v }); return; }
          setBorder({ "border-color": v }, "border-c");
        },
      }));
    }
  }

  // Effects: shadows (box-shadow), a blur of the layer (filter), and a blur
  // of what is behind it (backdrop-filter).

  function effects(el: any): any[] {
    const out: any[] = [];
    K.shadows(cs(el).boxShadow).forEach(function (s: any, i: number) { out.push({ type: s.inset ? "inner" : "drop", s, i }); });
    const f = /blur\(([\d.]+)px\)/.exec(cs(el).filter || "");
    if (f) out.push({ type: "blur", r: parseFloat(f[1]) });
    const b = /blur\(([\d.]+)px\)/.exec(cs(el).backdropFilter || (cs(el) as any).webkitBackdropFilter || "");
    if (b) out.push({ type: "backdrop", r: parseFloat(b[1]) });
    return out;
  }

  function writeShadows(list: any[], tag: string, fold?: boolean): void {
    styleSel({ "box-shadow": list.length ? K.shadowCss(list) : null }, tag, fold);
  }

  function withBlur(css: string, r: number | null): string | null {
    const rest = (css && css !== "none" ? css : "").replace(/blur\([^)]*\)\s*/g, "").trim();
    const out = (r !== null ? "blur(" + r + "px) " : "") + rest;
    return out.trim() || null;
  }

  function renderEffects(el: any): void {
    const sec = section("Effects", {
      addTitle: "Add an effect",
      add: function (_e: any, b: any) {
        const r = b.getBoundingClientRect();
        const has = effects(selEl());
        openMenu([
          ["Drop shadow", "", function () { const l = K.shadows(cs(selEl()).boxShadow); l.push({ inset: false, x: 0, y: 2, blur: 8, spread: 0, color: "rgba(0,0,0,0.2)" }); writeShadows(l, "fx-add", false); openFx = l.length - 1; renderPanel(); }, false, "shadow"],
          ["Inner shadow", "", function () { const l = K.shadows(cs(selEl()).boxShadow); l.push({ inset: true, x: 0, y: 2, blur: 4, spread: 0, color: "rgba(0,0,0,0.25)" }); writeShadows(l, "fx-add", false); openFx = l.length - 1; renderPanel(); }, false, "shadow"],
          ["Layer blur", "", function () { styleSel({ filter: withBlur(cs(selEl()).filter, 4) }, "fx-blur", false); renderPanel(); }, has.some(function (x) { return x.type === "blur"; }), "blur"],
          ["Background blur", "", function () { styleSel({ "backdrop-filter": withBlur(cs(selEl()).backdropFilter, 10), "-webkit-backdrop-filter": null }, "fx-backdrop", false); renderPanel(); }, has.some(function (x) { return x.type === "backdrop"; }), "blur"],
        ], r.right - 220, r.bottom + 4);
      },
    });
    const list = effects(el);
    if (!list.length) return;
    list.forEach(function (fx: any) {
      const rowEl = h("div", "dz-fx");
      const ic = h("span");
      ic.innerHTML = icon(fx.type === "drop" || fx.type === "inner" ? "shadow" : "blur", 14);
      rowEl.appendChild(ic);
      const names: any = { drop: "Drop shadow", inner: "Inner shadow", blur: "Layer blur", backdrop: "Background blur" };
      rowEl.appendChild(h("span", "dz-fx__name", names[fx.type]));
      if (fx.s) {
        const c = K.rgba(fx.s.color);
        const sum = h("span", "dz-fx__sum", fx.s.x + ", " + fx.s.y + " · " + fx.s.blur + "px" + (fx.s.spread ? " +" + fx.s.spread : ""));
        rowEl.appendChild(sum);
        rowEl.appendChild(h("span", "dz-fx__alpha", c ? Math.round(c.a * 100) + "%" : ""));
      } else {
        rowEl.appendChild(h("span", "dz-fx__sum", fx.r + "px"));
      }
      const rm = h("button", "dz-ib");
      rm.innerHTML = icon("minus", 14);
      rm.title = "Remove";
      rm.addEventListener("click", function (e: any) {
        e.stopPropagation();
        if (fx.s) { const l = K.shadows(cs(selEl()).boxShadow); l.splice(fx.i, 1); writeShadows(l, "fx-rm", false); }
        else if (fx.type === "blur") styleSel({ filter: withBlur(cs(selEl()).filter, null) }, "fx-rm", false);
        else styleSel({ "backdrop-filter": withBlur(cs(selEl()).backdropFilter, null), "-webkit-backdrop-filter": null }, "fx-rm", false);
        openFx = -1;
        renderPanel();
      });
      rowEl.appendChild(rm);
      sec.appendChild(rowEl);
      const key = fx.s ? fx.i : fx.type === "blur" ? 100 : 101;
      rowEl.addEventListener("click", function () { openFx = openFx === key ? -1 : key; renderPanel(); });
      if (openFx !== key) return;
      const ed = h("div", "dz-fx-edit");
      if (fx.s) {
        const upd = function (patch: any): void {
          const l = K.shadows(cs(selEl()).boxShadow);
          if (!l[fx.i]) return;
          Object.keys(patch).forEach(function (k) { (l[fx.i] as any)[k] = patch[k]; });
          writeShadows(l, "fx-" + fx.i);
        };
        const cur = function (): any { return K.shadows(cs(selEl()).boxShadow)[fx.i] || fx.s; };
        const g = h("div", "dz-grid2");
        [["x", "X"], ["y", "Y"], ["blur", "Blur"], ["spread", "Spread"]].forEach(function (p) {
          const f = numCtl({ unit: "px", min: p[0] === "blur" ? 0 : undefined, title: p[1], get: function () { return cur()[p[0]]; }, set: function (v: number) { upd({ [p[0]]: v }); } });
          f.insertBefore(h("span", "dz-unit", p[1]), f.firstChild);
          g.appendChild(f);
        });
        ed.appendChild(g);
        const cr = h("div", "dz-row");
        cr.style.marginTop = "6px";
        cr.appendChild(h("label", "", "Color"));
        const cc = h("div", "dz-ctl");
        cc.appendChild(colorCtl({
          none: "Default",
          get: function () { const c = K.rgba(cur().color); return { value: cur().color, shown: cur().color, text: c ? K.hex(c) : cur().color }; },
          set: function (v: string | null) {
            if (!v) return;
            const a = (K.rgba(cur().color) || { a: 0.2 }).a;
            const c = K.rgba(v);
            upd({ color: c ? K.css({ r: c.r, g: c.g, b: c.b, a: c.a < 1 ? c.a : a }) : v });
          },
        }));
        cc.appendChild(numCtl({
          unit: "%", min: 0, max: 100,
          get: function () { const c = K.rgba(cur().color); return c ? Math.round(c.a * 100) : 100; },
          set: function (v: number) { const c = K.rgba(cur().color); if (c) upd({ color: K.css({ r: c.r, g: c.g, b: c.b, a: v / 100 }) }); },
        }));
        (cc.lastChild as any).classList.add("dz-small");
        cr.appendChild(cc);
        ed.appendChild(cr);
      } else {
        const prop = fx.type === "blur" ? "filter" : "backdrop-filter";
        const r2 = h("div", "dz-row");
        r2.appendChild(h("label", "", "Radius"));
        const cc = h("div", "dz-ctl");
        cc.appendChild(numCtl({
          unit: "px", min: 0,
          get: function () { const m = /blur\(([\d.]+)px\)/.exec(cs(selEl())[fx.type === "blur" ? "filter" : "backdropFilter"] || ""); return m ? parseFloat(m[1]) : 0; },
          set: function (v: number) { styleSel({ [prop]: withBlur(cs(selEl())[fx.type === "blur" ? "filter" : "backdropFilter"], v) }, "fx-" + fx.type); },
        }));
        r2.appendChild(cc);
        ed.appendChild(r2);
      }
      sec.appendChild(ed);
    });
  }

  function renderAdvanced(el: any, n: any): void {
    const sec = section("Advanced", { fold: true });
    const set = function (changes: any, tag: string, fold?: boolean): void { styleSel(changes, tag, fold); };
    const c = function (): any { return cs(selEl()); };
    const parent = el.parentElement;
    const pd = parent ? cs(parent).display : "";
    if (/flex|grid/.test(pd) && !isAbs(el)) {
      sec.appendChild(h("div", "dz-sec__sub", "Sizing"));
      row(sec, "Grow", numCtl({ min: 0, get: function () { return parseFloat(c().flexGrow) || 0; }, set: function (v: number) { set({ "flex-grow": String(v) }, "grow"); } }));
      row(sec, "Shrink", numCtl({ min: 0, get: function () { return parseFloat(c().flexShrink); }, set: function (v: number) { set({ "flex-shrink": String(v) }, "shrink"); } }));
      row(sec, "Basis", textCtl({ placeholder: "auto", get: function () { return inl()["flex-basis"] || ""; }, set: function (v: any) { set({ "flex-basis": v }, "basis"); } }));
    }
    row(sec, "Aspect", textCtl({ placeholder: "auto", get: function () { return inl()["aspect-ratio"] || ""; }, set: function (v: any) { set({ "aspect-ratio": v }, "aspect"); } }));
    if (isTexty(el)) {
      sec.appendChild(h("div", "dz-sec__sub", "Typography"));
      row(sec, "Line style", selectCtl({
        options: [["solid", "Default"], ["double", "Double"], ["dotted", "Dotted"], ["dashed", "Dashed"], ["wavy", "Wavy"]],
        get: function () { return c().textDecorationStyle || "solid"; },
        set: function (v: string) { set({ "text-decoration-style": v === "solid" ? null : v }, "deco-style", false); },
      }));
      row(sec, "Line color", colorCtl({
        none: "None",
        get: function () { return colorOf(inl()["text-decoration-color"], inl()["text-decoration-color"] ? c().textDecorationColor : "", "None"); },
        set: function (v: string | null, final: boolean) { if (final) set({ "text-decoration-color": v }, "deco-color"); },
      }));
      row(sec, "Numerals", selectCtl({
        options: [["normal", "Default"], ["tabular-nums", "Tabular"], ["proportional-nums", "Proportional"], ["oldstyle-nums", "Old style"], ["lining-nums", "Lining"], ["slashed-zero", "Slashed zero"]],
        get: function () { return c().fontVariantNumeric || "normal"; },
        set: function (v: string) { set({ "font-variant-numeric": v === "normal" ? null : v }, "num", false); },
      }));
      row(sec, "Stroke width", numCtl({
        unit: "px", min: 0, step: 0.5, placeholder: "default",
        get: function () { const v = inl()["-webkit-text-stroke-width"]; return v ? K.num(v) : ""; },
        set: function (v: any) { set({ "-webkit-text-stroke-width": v === null || v === 0 ? null : v + "px" }, "stroke-w"); },
      }));
      row(sec, "Stroke color", colorCtl({
        none: "None",
        get: function () { return colorOf(inl()["-webkit-text-stroke-color"], inl()["-webkit-text-stroke-color"] ? (c() as any).webkitTextStrokeColor : "", "None"); },
        set: function (v: string | null, final: boolean) { if (final) set({ "-webkit-text-stroke-color": v }, "stroke-c"); },
      }));
    }
    sec.appendChild(h("div", "dz-sec__sub", "Effects"));
    row(sec, "Filter", textCtl({ placeholder: "None · e.g. grayscale(1)", get: function () { return inl().filter || ""; }, set: function (v: any) { set({ filter: v }, "filter", false); } }));
    row(sec, "Backdrop", textCtl({ placeholder: "None · e.g. blur(8px)", get: function () { return inl()["backdrop-filter"] || ""; }, set: function (v: any) { set({ "backdrop-filter": v }, "backdrop", false); } }));
    row(sec, "Transform", textCtl({ placeholder: "None · e.g. skewX(-8deg)", get: function () { return inl().transform || ""; }, set: function (v: any) { set({ transform: v }, "transform", false); } }));
    row(sec, "Blend mode", selectCtl({
      options: [["normal", "Default"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"], ["color-dodge", "Color dodge"], ["color-burn", "Color burn"], ["difference", "Difference"], ["exclusion", "Exclusion"], ["luminosity", "Luminosity"]],
      get: function () { return c().mixBlendMode || "normal"; },
      set: function (v: string) { set({ "mix-blend-mode": v === "normal" ? null : v }, "blend", false); },
    }));
    sec.appendChild(h("div", "dz-sec__sub", "Layer"));
    row(sec, "Stacking", numCtl({ placeholder: "auto", words: true, get: function () { return inl()["z-index"] || ""; }, set: function (v: any) { set({ "z-index": v === null ? null : String(v) }, "z"); } }));
    row(sec, "Overflow", selectCtl({
      options: [["visible", "Visible"], ["hidden", "Hidden"], ["auto", "Scroll"]],
      get: function () { const o = c().overflow; return /hidden|clip/.test(o) ? "hidden" : /auto|scroll/.test(o) ? "auto" : "visible"; },
      set: function (v: string) { set({ overflow: v === "visible" ? null : v }, "overflow", false); },
    }));
    void n;
  }

  function renderLine(el: any, n: any): void {
    const g = function (): any { const nn = selNode(); return nn ? K.lineGeom(K.outer(src.value, nn)) : null; };
    const upd = function (patch: any, tag: string): void {
      const geom = g();
      if (!geom) return;
      Object.keys(patch).forEach(function (k) { geom[k] = patch[k]; });
      swap(selEl(), selNode(), K.line(geom), tag);
      renderPanel();
    };
    const sec = section(kindOf(el) === "connector" ? "Connector" : "Line");
    row(sec, "Color", colorCtl({
      none: "Default",
      get: function () { const geom = g(); const c = K.rgba(geom ? geom.color : ""); return { value: geom && geom.color, shown: geom ? geom.color : "", text: c ? K.css(c) : geom ? geom.color : "" }; },
      set: function (v: string | null, final: boolean) {
        if (!v) return;
        if (!final) { const e = selEl(); Array.prototype.slice.call(e.querySelectorAll("line")).forEach(function (l: any) { l.setAttribute("stroke", v); }); Array.prototype.slice.call(e.querySelectorAll("path")).forEach(function (p: any) { p.setAttribute("fill", v); }); return; }
        upd({ color: v }, "line-color");
      },
    }));
    row(sec, "Width", numCtl({ unit: "px", min: 0.5, step: 0.5, get: function () { const geom = g(); return geom ? geom.width : 3; }, set: function (v: number) { upd({ width: v }, "line-w"); } }));
    row(sec, "Style", segCtl({
      options: [["", "solid", "Solid"], ["10 7", "dashed", "Dashed"], ["1 6", "dotted", "Dotted"]],
      get: function () { const geom = g(); return geom ? (geom.dash ? (/^1\s/.test(geom.dash) ? "1 6" : "10 7") : "") : ""; },
      set: function (v: string) { upd({ dash: v }, "line-dash"); },
    }));
    row(sec, "Start", segCtl({
      options: [["none", "—", "Plain"], ["arrow", "←", "Arrow"]],
      get: function () { const geom = g(); return geom && geom.tail ? "arrow" : "none"; },
      set: function (v: string) { upd({ tail: v === "arrow" }, "line-tail"); },
    }));
    row(sec, "End", segCtl({
      options: [["none", "—", "Plain"], ["arrow", "→", "Arrow"]],
      get: function () { const geom = g(); return geom && geom.kind === "connector" && geom.head ? "arrow" : "none"; },
      set: function (v: string) {
        const geom = g();
        if (!geom) return;
        if (v === "arrow") upd({ kind: "connector", head: true }, "line-head");
        else upd({ kind: geom.from || geom.to ? "connector" : "line", head: false }, "line-head");
      },
    }));
    const geom0 = g();
    if (geom0 && (geom0.from || geom0.to)) {
      sec.appendChild(h("div", "dz-note", "Attached: its ends follow the boxes they touch. Drag an end away to let go."));
    }
    const ap = section("Appearance");
    const op = function (): number { return Math.round(parseFloat(cs(selEl()).opacity) * 100) / 100; };
    row(ap, "Opacity",
      numCtl({ min: 0, max: 1, step: 0.05, get: op, set: function (v: number) { styleSel({ opacity: v >= 1 ? null : String(v) }, "opacity"); } }),
      rangeCtl({ min: 0, max: 1, step: 0.01, get: op, preview: function (v: number) { patchStyle(selEl(), { opacity: String(v) }); }, set: function (v: number) { styleSel({ opacity: v >= 1 ? null : String(v) }, "opacity"); } }));
    void n;
  }

  // ── What the host calls ────────────────────────────────────────────────

  view.classList.toggle("props-on", propsOn);
  $("dz-panel").setAttribute("aria-pressed", propsOn ? "true" : "false");

  return {
    layout,
    /** The preview's document is up: hook it, learn the deck, and find the selection again. */
    ready: function (win: any): void {
      attach(win);
      learnDeck();
      measure();
      layout();
      if (pendingStart >= 0) {
        sel = { key: null, start: pendingStart, cell: null };
        pendingStart = -1;
      }
      resolve();
      if (sel) {
        const n = selNode();
        if (n) host.pick(n.start);
      }
      renderPanel();
      kick();
      if (editAfter && sel) {
        editAfter = false;
        setTimeout(function () { editSel(true); }, 30);
      }
      scheduleFit();
    },
    /** The source changed: follow the selection through it. */
    sourceChanged: function (opts: any): void {
      const now = src.value;
      if (now === lastSrc) return;
      if (sel && pendingStart < 0) {
        const at = mapPos(lastSrc, now, sel.start);
        if (at < 0) sel = null; else sel.start = at;
      }
      lastSrc = now;
      if (opts && opts.quiet) {
        resolve();
        refresh();
        kick();
      }
    },
    /** The slide panel shows slide k. */
    slideShown: function (k: number): void {
      if (sel) {
        const n = selNode();
        const m = map();
        if (!n || !m || m.slideAt(n.start) !== k) sel = null;
      }
      hoverEl = null;
      renderPanel();
      kick();
    },
    /** A different document was opened. */
    reset: function (): void {
      sel = null;
      pendingStart = -1;
      lastSrc = src.value;
      slideW = 1280;
      slideH = 720;
      setTool(null);
      closeAll();
      layout();
      renderPanel();
    },
    refresh: function (): void { layout(); renderPanel(); },
    /** The source pane was shown (true) or hidden: the panel takes that mode's setting. */
    codeMode: function (codeShown: boolean): void {
      mode = codeShown ? "code" : "design";
      setProps(host.get(KEY.props + mode + ".v1", codeShown ? "0" : "1") !== "0", true);
      layout();
    },
    selected: function (): any { const n = selNode(); return n ? { start: n.start, end: n.end } : null; },
    /** The slide's size in the deck's own pixels. */
    size: function (): any { return { w: slideW, h: slideH }; },
    deselect: function (): void { if (sel) select(null); },
    zoom: zoomBy,
  };
}

/** Defines `deckrunDesigner(DRSlides, DRDesign, host)` on the page. */
export const DESIGN_RUNTIME = `window.deckrunDesigner = ${designer.toString()};`;
