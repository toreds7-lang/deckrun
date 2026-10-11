/**
 * PowerPoint's slide handling for an HTML deck open in the editor: a rail of
 * live thumbnails beside the preview and a slide sorter for bulk moves, with
 * new (blank, from one of the deck's own layouts, or written by Claude),
 * duplicate, delete, hide, cut/copy/paste, drag to reorder, speaker notes
 * under the slide, text edited in place on the slide, and present from here.
 *
 * Every change is a rewrite of the source text done by `html-slides.ts`, so
 * the source pane, autosave, the file on disk, and Claude all see one truth.
 * One undo history covers it all — typing in the source, slide operations,
 * notes, and text edited on the slide — with the textarea's own undo turned
 * off, since a programmatic rewrite would otherwise strand it.
 *
 * The runtime is one self-contained function, shipped to the page with
 * `toString()` like the slide model it drives. Comments in it ship too, so
 * none of them may spell out a comment opener or a script tag.
 */

export const SLIDE_PANEL_CSS = `
/* ── HTML slide panel ─────────────────────────────────────────────────── */
#doc-view { display: none; flex: 1 1 auto; min-height: 0; flex-direction: column; }
[data-doc-kind="html"] #doc-view { display: flex; }

/* Wraps to a second row rather than clipping a control off a narrow pane. */
#doc-head {
  display: none;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 34px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--surface0);
  font-size: 11px;
  color: var(--overlay1);
  white-space: nowrap;
}
#doc-view.has-slides #doc-head { display: flex; }
#doc-head > * { flex: none; }
#doc-head .seg button { padding: 3px 9px; }
.dh-btn {
  flex: none;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--subtext0);
  border: 1px solid var(--surface0);
  border-radius: 6px;
}
.dh-btn:hover { color: var(--text); border-color: var(--surface2); }
.dh-btn[aria-pressed="true"] { color: var(--text); background: var(--surface-soft); border-color: var(--surface1); }
.dh-btn:disabled { opacity: 0.4; cursor: default; }
.dh-btn kbd { margin-left: 4px; font: inherit; font-size: 9.5px; color: var(--overlay0); }
.dh-split { display: inline-flex; flex: none; }
.dh-split > .dh-btn:first-child { border-radius: 6px 0 0 6px; }
.dh-split > .dh-btn--chev { padding: 3px 6px; border-left: 0; border-radius: 0 6px 6px 0; }
#dh-count { min-width: 70px; text-align: center; color: var(--subtext0); font-variant-numeric: tabular-nums; }
#dh-hidden {
  display: none;
  padding: 1px 7px;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--yellow);
  border: 1px solid var(--yellow);
  border-radius: 999px;
}
#dh-hidden.is-on { display: inline-block; }
#dh-hint { flex: 1 1 0 !important; min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: right; color: var(--overlay0); }
#doc-view.is-editing #dh-hint { color: var(--accent); }

#doc-body { flex: 1 1 auto; min-height: 0; display: flex; }
#doc-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }

#rail {
  --ts: 0.12;
  display: none;
  position: relative;
  flex: 0 0 186px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 10px 48px 4px;
  background: var(--mantle);
  border-right: 1px solid var(--surface0);
  outline: none;
}
#doc-view.has-slides #rail { display: block; }
#doc-view.rail-off:not(.is-sorter) #rail { display: none; }
#rail:focus-visible { box-shadow: inset 0 0 0 1px var(--accent-line, var(--accent)); }
#rail-list { display: flex; flex-direction: column; gap: 10px; }

.rs { display: flex; align-items: flex-start; gap: 6px; cursor: default; user-select: none; -webkit-user-select: none; }
.rs__num {
  flex: 0 0 18px;
  padding-top: 1px;
  text-align: right;
  font-size: 10.5px;
  color: var(--overlay1);
  font-variant-numeric: tabular-nums;
}
.rs__thumb {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 4px;
  background: var(--base);
  border: 1px solid var(--surface0);
  outline: 2px solid transparent;
  outline-offset: 1px;
}
.rs:hover .rs__thumb { border-color: var(--surface2); }
.rs.is-sel .rs__thumb { outline-color: var(--accent-line, var(--accent)); }
.rs.is-cur .rs__thumb { outline-color: var(--accent); }
.rs.is-sel .rs__num, .rs.is-cur .rs__num { color: var(--accent); }
.rs.is-flash .rs__thumb { animation: rs-flash 0.85s ease-in-out 3; }
@keyframes rs-flash {
  50% { outline-color: var(--green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--green) 30%, transparent); }
}
.rs.is-hidden .rs__thumb > iframe { opacity: 0.38; }
.rs.is-hidden .rs__num { text-decoration: line-through; }
.rs.is-hidden .rs__thumb::after {
  content: 'hidden';
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 0 5px;
  font-size: 8.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--crust);
  background: var(--yellow);
  border-radius: 3px;
}
.rs.is-dragging { opacity: 0.4; }
/* Slide names are prose, often Korean, which a monospace face spaces out. */
.rs__label, .nl-name { font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
.rs__label { display: none; min-width: 0; font-size: 11.5px; color: var(--overlay1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dr-frame {
  position: absolute;
  top: 0;
  left: 0;
  width: 1280px;
  height: 720px;
  border: 0;
  transform: scale(var(--ts));
  transform-origin: 0 0;
  pointer-events: none;
  background: #fff;
}
.dr-frame.is-loading { visibility: hidden; }

#rail-drop { display: none; position: absolute; z-index: 3; background: var(--accent); border-radius: 2px; pointer-events: none; }
#rail-drop.is-on { display: block; }

#doc-view.is-sorter #doc-main { display: none; }
#doc-view.is-sorter #rail { flex: 1 1 auto; padding: 18px 18px 64px; background: var(--crust); border-right: 0; }
#doc-view.is-sorter #rail-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 20px 18px; }
#doc-view.is-sorter .rs { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "thumb thumb" "num label"; gap: 5px 6px; }
#doc-view.is-sorter .rs__thumb { grid-area: thumb; }
#doc-view.is-sorter .rs__num { grid-area: num; flex: none; text-align: left; padding: 0; }
#doc-view.is-sorter .rs__label { grid-area: label; display: block; }

#doc-notes {
  display: none;
  flex: 0 0 22%;
  min-height: 72px;
  max-height: 40%;
  flex-direction: column;
  border-top: 1px solid var(--surface0);
  background: var(--mantle);
}
#doc-view.has-slides.notes-on #doc-notes { display: flex; }
#doc-notes-label {
  flex: none;
  padding: 7px 12px 0;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--overlay0);
}
#doc-notes-input {
  flex: 1 1 auto;
  min-height: 0;
  padding: 4px 12px 10px;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--subtext1);
  font: 13px/1.6 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
}
#doc-notes-input::placeholder { color: var(--overlay0); }

.dr-pop {
  position: fixed;
  z-index: 70;
  display: none;
  background: var(--mantle);
  border: 1px solid var(--surface1);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  outline: none;
}
.dr-pop.is-on { display: block; }
#dr-menu { min-width: 250px; padding: 5px; }
.dr-mi {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  text-align: left;
  color: var(--text);
}
.dr-mi:hover:not(:disabled), .dr-mi.is-sel { background: var(--surface-soft); }
.dr-mi:disabled { opacity: 0.38; cursor: default; }
.dr-mi kbd { margin-left: auto; font: inherit; font-size: 10px; color: var(--overlay0); }
.dr-sep { height: 1px; margin: 4px 6px; background: var(--surface0); }

#dr-newmenu { width: min(600px, 92vw); max-height: 74vh; overflow: auto; padding: 10px 12px 12px; }
.nl-title { margin: 2px 2px 8px; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--overlay0); }
.nl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.nl-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 5px;
  text-align: left;
  border: 1px solid var(--surface0);
  border-radius: 8px;
}
.nl-item:hover, .nl-item:focus-visible { border-color: var(--accent); background: var(--accent-soft); outline: none; }
.nl-thumb { --ts: 0.11; position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 4px; background: var(--base); }
.nl-name { font-size: 11px; color: var(--subtext0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nl-claude { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--surface0); }
.nl-claude textarea {
  display: block;
  width: 100%;
  min-height: 54px;
  padding: 7px 9px;
  resize: vertical;
  color: var(--text);
  background: var(--crust);
  border: 1px solid var(--surface1);
  border-radius: 7px;
  outline: none;
  font: 12.5px/1.5 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
}
.nl-claude textarea:focus { border-color: var(--accent); }
.nl-row { display: flex; align-items: center; gap: 10px; margin-top: 7px; font-size: 10.5px; color: var(--overlay0); }
.nl-row span { flex: 1 1 auto; }

#dr-ghost {
  position: fixed;
  z-index: 80;
  display: none;
  padding: 3px 9px;
  font-size: 11px;
  color: var(--crust);
  background: var(--accent);
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  pointer-events: none;
}
#dr-ghost.is-on { display: block; }
#doc-view.is-busy #rail, #doc-view.is-busy #doc-head .dh-btn { opacity: 0.55; }
`;

export const SLIDE_PANEL_MARKUP = `<div id="doc-view">
        <div id="doc-head">
          <button class="dh-btn" id="dh-rail" aria-pressed="true" title="Show or hide the slide panel">slides</button>
          <button class="step" id="dh-prev" title="Previous slide">&#8592;</button>
          <span id="dh-count">slide 1 / 1</span>
          <button class="step" id="dh-next" title="Next slide">&#8594;</button>
          <span id="dh-hidden" title="Skipped when presenting. Right-click the slide to show it again.">hidden</span>
          <span class="dh-split">
            <button class="dh-btn" id="dh-new" title="New slide after this one (Ctrl M)">+ slide</button><button class="dh-btn dh-btn--chev" id="dh-more" aria-haspopup="true" aria-expanded="false" title="A blank slide, one of this deck's layouts, or one written by Claude">&#9662;</button>
          </span>
          <span id="dh-hint">double-click text on the slide to edit it</span>
          <div class="seg">
            <button id="dh-normal" class="is-on" title="Slide panel beside the preview">normal</button>
            <button id="dh-sorter" title="Every slide at once, for moving many">sorter</button>
          </div>
          <button class="dh-btn" id="dh-notes" aria-pressed="true" title="Speaker notes under the slide">notes</button>
          <button class="dh-btn" id="dh-from" title="Present from this slide (Ctrl Shift Enter)">&#9654; from here</button>
        </div>
        <div id="doc-body">
          <div id="rail" tabindex="0" role="listbox" aria-label="Slides" aria-multiselectable="true">
            <div id="rail-list"></div>
            <div id="rail-drop" aria-hidden="true"></div>
          </div>
          <div id="doc-main">
            <iframe id="frame-html" title="HTML doc preview"></iframe>
            <div id="doc-notes">
              <label id="doc-notes-label" for="doc-notes-input">speaker notes</label>
              <textarea id="doc-notes-input" spellcheck="false" placeholder="Click to add speaker notes"></textarea>
            </div>
          </div>
        </div>
        <div id="dr-menu" class="dr-pop" role="menu" tabindex="-1"></div>
        <div id="dr-newmenu" class="dr-pop" tabindex="-1"></div>
        <div id="dr-ghost" aria-hidden="true"></div>
      </div>`;

/**
 * host.src       the HTML source textarea
 * host.frame     the preview iframe
 * host.srcdoc    wraps a document for an about:srcdoc frame (history shim)
 * host.onSource  the panel changed the source: { quiet, nosave }
 * host.reload    rebuild the preview from the source now
 * host.busy      true while Claude is editing the file
 * host.present   present starting at a slide index
 * host.ready     the preview's document is up (optional): its tags match inspectMap()
 * host.chat      send a message to Claude, or null when chat is off
 * host.toast     host.get / host.set (localStorage)   host.cmd ("Cmd" or "Ctrl")
 */
export function slidePanel(S: any, host: any): any {
  const doc: any = document;
  const $ = function (id: string): any { return doc.getElementById(id); };
  const SCRIPT_OPEN = "<scr" + "ipt>";
  const SCRIPT_CLOSE = "</scr" + "ipt>";
  const THUMB_W = 1280;
  const KEY = { rail: "deckrun.slides.rail.v1", notes: "deckrun.slides.notes.v1", view: "deckrun.slides.view.v1" };
  // Thumbnails run the deck's own script, so a video in one must not start talking.
  const MUTE = SCRIPT_OPEN + "document.addEventListener('play',function(e){try{e.target.muted=true;e.target.pause()}catch(x){}},true)" + SCRIPT_CLOSE;
  const EDIT_CSS =
    "[data-dr-t]:hover{outline:1px dashed rgba(120,150,255,.75);outline-offset:3px}" +
    "[data-dr-editing]{outline:2px solid #5b8cff!important;outline-offset:3px;cursor:text}";

  const src: any = host.src;
  const frame: any = host.frame;
  const root = $("doc-view"), rail = $("rail"), list = $("rail-list"), dropLine = $("rail-drop");
  const notesInput = $("doc-notes-input"), notesLabel = $("doc-notes-label");
  const menu = $("dr-menu"), newMenu = $("dr-newmenu"), ghost = $("dr-ghost");
  const cmd = function (s: string): string { return s.replace(/Ctrl/g, host.cmd || "Ctrl"); };

  let model: any = S.model("");
  let modelSrc: string | null = "";
  const sel: any = { cur: 0, set: { 0: true }, anchor: 0 };
  let items: any[] = [];
  let boxes: any[] = [];
  let boxesSrc: string | null = null;
  // What the preview's `data-dr-n` tags index, for the inspector: { src, model, nodes }.
  let tagged: any = null;
  let previewStale = false;
  let clip = "";
  let sorter = host.get(KEY.view, "normal") === "sorter";
  let railOn = host.get(KEY.rail, "1") !== "0";
  let notesOn = host.get(KEY.notes, "1") !== "0";
  let notesFor = -1;
  let noteTimer: any = null;
  let editing: any = null;
  let editTimer: any = null;
  let live: any = null;
  let driving = false;
  let followTimers: any[] = [];
  let drivenAt = 0;
  let previewPending = false;
  let editedTimer: any = null;
  let expectNewAt = -1;
  let busyNow = false;

  // ── Model and selection ────────────────────────────────────────────────

  function sync(): any {
    if (modelSrc !== src.value) {
      modelSrc = src.value;
      model = S.model(modelSrc);
      clampSel();
    }
    return model;
  }

  function count(): number { return sync().slides.length; }

  function clampSel(): void {
    const n = model.slides.length;
    if (!n) { sel.cur = 0; sel.anchor = 0; sel.set = {}; return; }
    const set: any = {};
    let any = false;
    Object.keys(sel.set).forEach(function (k) { if (+k < n) { set[k] = true; any = true; } });
    sel.cur = Math.max(0, Math.min(sel.cur, n - 1));
    sel.anchor = Math.max(0, Math.min(sel.anchor, n - 1));
    if (!any || !set[sel.cur]) set[sel.cur] = true;
    sel.set = set;
  }

  function selected(): number[] {
    const n = count();
    return Object.keys(sel.set).map(Number).filter(function (k) { return k < n; }).sort(function (a, b) { return a - b; });
  }

  function selectOnly(k: number): void { sel.cur = sel.anchor = k; sel.set = {}; sel.set[k] = true; }

  function selectList(ks: number[]): void {
    if (!ks.length) return;
    sel.set = {};
    ks.forEach(function (k) { sel.set[k] = true; });
    sel.cur = sel.anchor = ks[0];
  }

  function selectRange(k: number): void {
    const a = Math.min(sel.anchor, k), b = Math.max(sel.anchor, k);
    sel.set = {};
    for (let i = a; i <= b; i++) sel.set[i] = true;
    sel.cur = k;
  }

  function toggleSel(k: number): void {
    if (sel.set[k] && selected().length > 1) {
      delete sel.set[k];
      if (sel.cur === k) sel.cur = selected()[0];
    } else {
      sel.set[k] = true;
      sel.cur = k;
    }
    sel.anchor = k;
  }

  // ── One undo history for the source ────────────────────────────────────
  // Typing, slide operations, notes, and text edited on the slide all land
  // here. A run of one kind (typing, one slide's notes, one text box) within
  // a pause folds into a single step, the way an editor's undo usually does.

  const hist: any = { undo: [], redo: [], kind: "", at: 0 };

  function snap(): any {
    return { v: src.value, a: src.selectionStart, b: src.selectionEnd, sel: selected(), cur: sel.cur };
  }

  function remember(kind: string, fold: boolean): void {
    const now = Date.now();
    if (fold && kind === hist.kind && now - hist.at < 1500) { hist.at = now; return; }
    hist.undo.push(snap());
    if (hist.undo.length > 200) hist.undo.shift();
    hist.redo.length = 0;
    hist.kind = fold ? kind : "";
    hist.at = now;
  }

  function restore(s: any): void {
    finishEdit(false);
    src.value = s.v;
    try { src.setSelectionRange(s.a, s.b); } catch (e) {}
    hist.kind = "";
    sync();
    if (s.sel && s.sel.length) { selectList(s.sel); sel.cur = s.cur; clampSel(); }
    sourceChanged({});
    render();
    reveal(sel.cur, false);
  }

  function undo(): void {
    if (busyNow) return;
    if (!hist.undo.length) { host.toast("Nothing to undo.", "warn"); return; }
    hist.redo.push(snap());
    restore(hist.undo.pop());
  }

  function redo(): void {
    if (busyNow || !hist.redo.length) return;
    hist.undo.push(snap());
    restore(hist.redo.pop());
  }

  src.addEventListener("beforeinput", function (e: any) {
    const t = e.inputType || "";
    if (t === "historyUndo") { e.preventDefault(); undo(); return; }
    if (t === "historyRedo") { e.preventDefault(); redo(); return; }
    if (/^insert(Text|CompositionText|ReplacementText)$/.test(t)) remember("type", true);
    else if (/^delete(Content|Word|Soft|Hard)?(Backward|Forward)?$/.test(t)) remember("delete", true);
    else remember(t || "edit", false);
  });

  src.addEventListener("keydown", function (e: any) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
    const k = (e.key || "").toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  /** Writes the source, keeping the caret and scroll where they were. */
  function write(next: string): void {
    const cur = src.value, n1 = cur.length, n2 = next.length;
    const top = src.scrollTop, left = src.scrollLeft;
    let a = 0;
    while (a < n1 && a < n2 && cur.charCodeAt(a) === next.charCodeAt(a)) a++;
    let b = 0;
    while (b < n1 - a && b < n2 - a && cur.charCodeAt(n1 - 1 - b) === next.charCodeAt(n2 - 1 - b)) b++;
    const map = function (p: number): number { return p <= a ? p : p >= n1 - b ? p + n2 - n1 : a; };
    const s = map(src.selectionStart), e = map(src.selectionEnd);
    src.value = next;
    try { src.setSelectionRange(s, e); } catch (err) {}
    src.scrollTop = top;
    src.scrollLeft = left;
  }

  function setSource(next: string, opts: any): boolean {
    opts = opts || {};
    if (busyNow || src.readOnly) {
      host.toast("Claude is editing this file. Wait for it to finish, or press stop.", "warn");
      return false;
    }
    if (next === src.value) return false;
    remember(opts.kind || "op", !!opts.fold);
    write(next);
    sync();
    if (opts.sel) { selectList(opts.sel); clampSel(); }
    if (opts.quiet && boxesSrc !== null) {
      // The preview is not redrawn for a quiet change, so its text-box tags
      // stay valid only while the boxes line up one for one.
      const fresh = S.textBoxes(model);
      if (fresh.length === boxes.length) { boxes = fresh; boxesSrc = src.value; } else previewStale = true;
    }
    if (opts.quiet && tagged) {
      // Likewise the element tags, while the elements line up one for one.
      const nodes = S.previewNodes(model);
      tagged = nodes.length === tagged.nodes.length ? { src: src.value, model, nodes } : null;
    }
    sourceChanged({ quiet: !!opts.quiet });
    render();
    return true;
  }

  // ── Slide operations ───────────────────────────────────────────────────

  function apply(r: any, said?: string): boolean {
    if (!r) return false;
    if (!setSource(r.src, { sel: r.sel })) return false;
    reveal(sel.cur, false);
    scrollRailTo(sel.cur);
    if (said) host.toast(said);
    return true;
  }

  function after(): number {
    const s = selected();
    return (s.length ? s[s.length - 1] : sel.cur) + 1;
  }

  function newSlide(text?: string): void {
    if (!count()) return;
    apply(S.insert(model, after(), [text !== undefined ? text : S.blank(model, sel.cur)]));
  }

  function duplicate(): void {
    if (!count()) return;
    apply(S.duplicate(model, selected()));
  }

  function remove(): void {
    if (!count()) return;
    const r = S.remove(model, selected());
    if (!r) { host.toast("A deck keeps at least one slide.", "warn"); return; }
    apply(r);
  }

  function moveBy(d: number): void {
    const s = selected();
    if (!s.length) return;
    if (d < 0 && s[0] > 0) apply(S.move(model, s, s[0] - 1));
    else if (d > 0 && s[s.length - 1] < count() - 1) apply(S.move(model, s, s[s.length - 1] + 2));
  }

  function moveTo(edge: number): void {
    apply(S.move(model, selected(), edge < 0 ? 0 : count()));
  }

  function toggleHidden(): void {
    const s = selected();
    const allHidden = s.every(function (k) { return model.slides[k].hidden; });
    apply(S.hide(model, s, !allHidden), allHidden
      ? "Shown again."
      : (s.length > 1 ? s.length + " slides" : "Slide " + (s[0] + 1)) + " hidden: skipped when presenting, kept in the file.");
  }

  function copy(cut: boolean): void {
    const s = selected();
    if (!s.length) return;
    if (cut && s.length >= count()) { host.toast("A deck keeps at least one slide.", "warn"); return; }
    clip = S.copy(model, s);
    try { navigator.clipboard.writeText(clip).catch(function () {}); } catch (e) {}
    if (cut) remove();
    else host.toast(s.length > 1 ? "Copied " + s.length + " slides." : "Copied slide " + (s[0] + 1) + ".");
  }

  function paste(text: string): void {
    if (!count()) return;
    // The Windows clipboard hands text back with CRLF line ends.
    text = (text || "").replace(/\r\n?/g, "\n");
    let blocks = S.blocksIn(text);
    if (!blocks.length && !text) blocks = S.blocksIn(clip);
    if (!blocks.length) { host.toast("The clipboard holds no slides.", "warn"); return; }
    apply(S.insert(model, after(), blocks));
  }

  function pasteFromMenu(): void {
    try {
      navigator.clipboard.readText().then(paste, function () { paste(""); });
    } catch (e) { paste(""); }
  }

  function presentFrom(): void {
    if (count()) host.present(sel.cur);
  }

  function writeWithClaude(text: string): void {
    const k = sel.cur;
    const s = model.slides[k];
    const name = s ? (s.comment && s.comment.label) || s.title : "";
    expectNewAt = k + 1;
    host.chat(
      "Add one new slide right after slide " + (k + 1) + (name ? ' ("' + name + '")' : "") + ": " + text.trim() +
      "\n\nBuild it from the same markup, classes, and styles the other slides use, give it speaker notes in the" +
      " same voice and language as the other slides' notes, and keep any numbered slide comments in order."
    );
  }

  // ── Showing a slide ────────────────────────────────────────────────────

  function show(k: number): void {
    const n = count();
    if (!n) return;
    k = Math.max(0, Math.min(n - 1, k));
    paintItems();
    paintHead();
    loadNotes(false);
    scrollRailTo(k);
    reveal(k, false);
    drive();
  }

  function step(d: number, extend: boolean): void {
    const n = count();
    if (!n) return;
    const k = Math.max(0, Math.min(n - 1, sel.cur + d));
    if (extend) selectRange(k); else selectOnly(k);
    show(k);
  }

  /** Puts the source caret at the slide, scrolled near the top, without taking focus. */
  function reveal(k: number, focus: boolean): void {
    const s = model.slides[k];
    if (!s) return;
    const before = src.value.slice(0, s.start);
    const line = before.split("\n").length - 1;
    const lh = parseFloat(getComputedStyle(src).lineHeight) || 22;
    if (focus) src.focus();
    try { src.setSelectionRange(s.start, s.start); } catch (e) {}
    src.scrollTop = Math.max(0, line * lh - 2 * lh);
  }

  function scrollRailTo(k: number): void {
    const it = items[k];
    if (!it) return;
    const r = it.el.getBoundingClientRect(), box = rail.getBoundingClientRect();
    if (r.top < box.top) rail.scrollTop -= box.top - r.top + 8;
    else if (r.bottom > box.bottom) rail.scrollTop += r.bottom - box.bottom + 8;
  }

  // ── The rail ───────────────────────────────────────────────────────────

  const io = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(function (entries: any[]) {
      entries.forEach(function (en: any) {
        const it = en.target.__drItem;
        if (!it) return;
        it.visible = en.isIntersecting;
        if (it.visible) loadThumb(it);
      });
    }, { root: rail, rootMargin: "400px 0px" })
    : null;

  function thumbDoc(html: string): string {
    const head = /<head(\s[^>]*)?>/i.exec(html);
    const at = head ? head.index + head[0].length : 0;
    return host.srcdoc(html.slice(0, at) + MUTE + html.slice(at));
  }

  function frameFor(html: string, onReady: (f: any) => void): any {
    const f = doc.createElement("iframe");
    f.className = "dr-frame is-loading";
    f.setAttribute("sandbox", "allow-scripts allow-same-origin");
    f.setAttribute("tabindex", "-1");
    f.setAttribute("aria-hidden", "true");
    f.setAttribute("scrolling", "no");
    f.addEventListener("load", function () { onReady(f); });
    f.srcdoc = thumbDoc(html);
    return f;
  }

  function makeItem(): any {
    const el = doc.createElement("div");
    el.className = "rs";
    el.setAttribute("role", "option");
    const num = doc.createElement("span");
    num.className = "rs__num";
    const thumb = doc.createElement("span");
    thumb.className = "rs__thumb";
    const label = doc.createElement("span");
    label.className = "rs__label";
    el.appendChild(num);
    el.appendChild(thumb);
    el.appendChild(label);
    list.appendChild(el);
    const it = { el, num, thumb, label, key: null as any, wanted: null as any, loaded: null as any, frame: null as any, k: -1, visible: !io };
    el.__drItem = it;
    if (io) io.observe(el);
    return it;
  }

  function loadThumb(it: any): void {
    if (it.wanted === null || it.loaded === it.wanted) return;
    const html = it.wanted;
    it.loaded = html;
    // The old picture stays up until the new one has drawn, so a redraw never flashes.
    const f = frameFor(html, function (fr: any) {
      if (it.loaded !== html) { fr.remove(); return; }
      fr.classList.remove("is-loading");
      if (it.frame && it.frame !== fr) it.frame.remove();
      it.frame = fr;
    });
    it.thumb.appendChild(f);
  }

  /** Reuses each thumbnail whose slide did not change, wherever it moved to. */
  function reconcile(): void {
    const m = model, n = m.slides.length;
    const keys: string[] = [];
    for (let k = 0; k < n; k++) keys.push(S.isolate(m, k));
    const free = items.slice();
    const next: any[] = new Array(n);
    const take = function (pred: (it: any) => boolean): any {
      for (let i = 0; i < free.length; i++) if (pred(free[i])) return free.splice(i, 1)[0];
      return null;
    };
    for (let k = 0; k < n; k++) {
      next[k] = take(function (it) { return it.key === keys[k] && it.k === k; }) ||
        take(function (it) { return it.key === keys[k]; });
    }
    for (let k = 0; k < n; k++) {
      if (!next[k]) next[k] = take(function (it) { return it.k === k; }) || (free.length ? free.shift() : makeItem());
    }
    free.forEach(function (it) { if (io) io.unobserve(it.el); it.el.remove(); });
    items = next;
    items.forEach(function (it, k) {
      it.k = k;
      it.el.style.order = String(k);
      if (it.key !== keys[k]) {
        it.key = keys[k];
        it.wanted = keys[k];
        if (it.visible) loadThumb(it);
      }
    });
  }

  function paintItems(): void {
    const m = model;
    items.forEach(function (it, k) {
      const s = m.slides[k];
      if (!s) return;
      const name = (s.comment && s.comment.label) || s.title || "";
      it.num.textContent = String(k + 1);
      it.label.textContent = name;
      it.el.title = (k + 1) + (name ? " · " + name : "") + (s.hidden ? " (hidden)" : "");
      it.el.classList.toggle("is-sel", !!sel.set[k]);
      it.el.classList.toggle("is-cur", k === sel.cur);
      it.el.classList.toggle("is-hidden", !!s.hidden);
      it.el.setAttribute("aria-selected", sel.set[k] ? "true" : "false");
    });
  }

  function paintHead(): void {
    const n = model.slides.length;
    const s = model.slides[sel.cur];
    $("dh-count").textContent = "slide " + (n ? sel.cur + 1 : 0) + " / " + n;
    $("dh-prev").disabled = sel.cur <= 0;
    $("dh-next").disabled = sel.cur >= n - 1;
    $("dh-hidden").classList.toggle("is-on", !!(s && s.hidden));
  }

  function layoutThumbs(): void {
    const first = items[0];
    if (!first) return;
    const w = first.thumb.clientWidth;
    if (w > 0) rail.style.setProperty("--ts", String(w / THUMB_W));
  }

  function render(): void {
    const n = count();
    root.classList.toggle("has-slides", n > 0);
    if (!n) {
      items.forEach(function (it) { if (io) io.unobserve(it.el); it.el.remove(); });
      items = [];
      return;
    }
    reconcile();
    paintItems();
    paintHead();
    layoutThumbs();
    loadNotes(false);
  }

  // ── Speaker notes ──────────────────────────────────────────────────────

  function loadNotes(force: boolean): void {
    const s = model.slides[sel.cur];
    if (!s) return;
    notesLabel.textContent = "speaker notes · slide " + (sel.cur + 1);
    notesInput.readOnly = busyNow;
    if (!force && doc.activeElement === notesInput && notesFor === sel.cur) return;
    const text = s.note ? s.note.text : "";
    if (notesInput.value !== text) notesInput.value = text;
    notesFor = sel.cur;
  }

  function commitNote(): void {
    clearTimeout(noteTimer);
    noteTimer = null;
    sync();
    const s = model.slides[notesFor];
    if (!s) return;
    const text = notesInput.value;
    if ((s.note ? s.note.text : "") === text) return;
    const had = !!s.note;
    // A note the deck already had changes in place in the preview; a new
    // attribute is easier to get right by redrawing it.
    if (setSource(S.setNote(model, notesFor, text), { kind: "note:" + notesFor, fold: true, quiet: had }) && had) {
      patchLiveNote(notesFor, text);
    }
  }

  function patchLiveNote(k: number, text: string): void {
    try {
      const unit = frame.contentDocument.querySelector('[data-dr-slide="' + k + '"]');
      const s = model.slides[k];
      if (!unit || !s || !s.note) return;
      if (s.note.attr) {
        const name = s.note.attr.name;
        const el = unit.hasAttribute(name) ? unit : unit.querySelector("[" + name + "]");
        if (el) el.setAttribute(name, text);
      } else {
        const aside = unit.querySelector("aside.notes, aside.speaker-notes");
        if (aside) aside.textContent = text;
      }
    } catch (e) {}
  }

  notesInput.addEventListener("input", function () {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(commitNote, 250);
  });
  notesInput.addEventListener("blur", commitNote);

  // ── Preview: tagging, driving, following ───────────────────────────────

  function afterHeadOpen(html: string, ins: string): string {
    const m = /<head(\s[^>]*)?>/i.exec(html) || /<html(\s[^>]*)?>/i.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + ins + html.slice(m.index + m[0].length);
    const dt = /^\s*<!doctype[^>]*>/i.exec(html);
    const at = dt ? dt[0].length : 0;
    return html.slice(0, at) + ins + html.slice(at);
  }

  function beforeBodyClose(html: string, ins: string): string {
    const at = html.toLowerCase().lastIndexOf("</body");
    return at < 0 ? html + ins : html.slice(0, at) + ins + html.slice(at);
  }

  /**
   * The preview's copy of the source: slides, text boxes, and every element
   * tagged, the selected slide asked for by hash before the deck's script
   * reads it (so a deck that honours `#3` opens there with no flash of
   * slide 1), and a call back here once the deck's own script has run.
   */
  function previewHtml(text: string): string {
    finishEdit(true);
    const m = text === modelSrc ? model : S.model(text);
    const d = S.decoratePreview(m);
    tagged = { src: text, model: m, nodes: d.nodes };
    previewPending = true;
    if (!m.slides.length) { boxes = []; boxesSrc = null; return d.html; }
    boxes = d.boxes;
    boxesSrc = text;
    previewStale = false;
    const k = Math.min(sel.cur, m.slides.length - 1);
    let html = afterHeadOpen(d.html, SCRIPT_OPEN + 'try{location.hash="#' + (k + 1) + '"}catch(e){}' + SCRIPT_CLOSE);
    html = beforeBodyClose(html, SCRIPT_OPEN + "try{parent.deckrunSlideReady&&parent.deckrunSlideReady(window)}catch(e){}" + SCRIPT_CLOSE);
    return html;
  }

  (window as any).deckrunSlideReady = function (win: any) {
    if (win !== frame.contentWindow) return;
    previewPending = false;
    attach(win);
    drive();
    if (host.ready) host.ready(win);
  };
  frame.addEventListener("load", function () {
    previewPending = false;
    attach(frame.contentWindow);
    drive();
    if (host.ready) host.ready(frame.contentWindow);
  });

  /**
   * Drops any pending "follow the deck" check. Driving the deck fires its
   * own hashchange and key events a moment later, and a preview about to be
   * replaced still shows the old order; neither is the person navigating.
   */
  function stopFollowing(): void {
    followTimers.forEach(clearTimeout);
    followTimers = [];
    drivenAt = Date.now();
  }

  function sourceChanged(opts: any): void {
    if (!opts.quiet) previewPending = true;
    stopFollowing();
    host.onSource(opts);
  }

  function attach(win: any): void {
    if (!win) return;
    try {
      if (win.__drPanel) return;
      win.__drPanel = true;
    } catch (e) { return; }
    live = win;
    const d = win.document;
    const style = d.createElement("style");
    style.textContent = EDIT_CSS;
    (d.head || d.documentElement).appendChild(style);
    ["keydown", "keyup", "keypress"].forEach(function (t) { win.addEventListener(t, guardKeys, true); });
    ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend"].forEach(function (t) {
      win.addEventListener(t, guardPointer, true);
    });
    d.addEventListener("dblclick", onDblClick, true);
    d.addEventListener("paste", onEditPaste, true);
    ["keydown", "click", "hashchange", "touchend"].forEach(function (t) { win.addEventListener(t, followSoon); });
    win.addEventListener("wheel", followSoon, { passive: true });
  }

  function drive(): void {
    stopFollowing();
    if (!live || !count() || sorter) return;
    driving = true;
    try { S.goto(live, sel.cur); } catch (e) {}
    driving = false;
    drivenAt = Date.now();
  }

  /** The deck's own arrows, buttons, or swipes moved it: follow along in the rail. */
  function followSoon(): void {
    if (driving || editing || previewPending || Date.now() - drivenAt < 450) return;
    followTimers.forEach(clearTimeout);
    followTimers = [setTimeout(follow, 120), setTimeout(follow, 650)];
  }

  function follow(): void {
    if (!live || live !== frame.contentWindow || previewPending || driving || editing || !count()) return;
    let k = -1;
    try { k = S.current(live); } catch (e) { return; }
    if (k < 0 || k >= count() || k === sel.cur) return;
    selectOnly(k);
    paintItems();
    paintHead();
    loadNotes(false);
    scrollRailTo(k);
    reveal(k, false);
  }

  // ── Editing text on the slide ──────────────────────────────────────────

  function clean(el: any): string {
    const c = el.cloneNode(true);
    Array.prototype.slice.call(c.querySelectorAll("mark.dr-hl")).forEach(function (mk: any) {
      while (mk.firstChild) mk.parentNode.insertBefore(mk.firstChild, mk);
      mk.remove();
    });
    Array.prototype.slice.call(c.querySelectorAll("[data-dr-t],[data-dr-n],[contenteditable],[data-dr-editing]")).forEach(function (n: any) {
      n.removeAttribute("data-dr-t");
      n.removeAttribute("data-dr-n");
      n.removeAttribute("contenteditable");
      n.removeAttribute("data-dr-editing");
    });
    return c.innerHTML;
  }

  function onDblClick(e: any): void {
    const t = e.target && e.target.closest ? e.target.closest("[data-dr-t]") : null;
    if (!t || (editing && editing.el === t)) return;
    if (busyNow) { host.toast("Claude is editing this file. Wait for it to finish, or press stop.", "warn"); return; }
    if (boxesSrc !== src.value) return;
    startEdit(t, e);
  }

  function startEdit(el: any, e: any): void {
    finishEdit(false);
    const win = el.ownerDocument.defaultView;
    editing = { el, win, j: parseInt(el.getAttribute("data-dr-t"), 10), last: clean(el) };
    const s = win.getSelection();
    const keep = s && s.rangeCount && el.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-dr-editing", "");
    el.setAttribute("spellcheck", "false");
    el.focus({ preventScroll: true });
    try {
      let r = keep;
      if (!r && e && el.ownerDocument.caretRangeFromPoint) r = el.ownerDocument.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) { s.removeAllRanges(); s.addRange(r); }
    } catch (err) {}
    el.addEventListener("input", onEditInput);
    el.addEventListener("blur", onEditBlur);
    root.classList.add("is-editing");
    $("dh-hint").textContent = "editing text · Esc or a click elsewhere finishes";
  }

  function onEditInput(): void {
    clearTimeout(editTimer);
    editTimer = setTimeout(commitEdit, 300);
  }

  function onEditBlur(): void {
    setTimeout(function () {
      if (editing && editing.el.ownerDocument.activeElement !== editing.el) finishEdit(false);
    }, 0);
  }

  function commitEdit(): void {
    clearTimeout(editTimer);
    if (!editing) return;
    const html = clean(editing.el);
    if (html === editing.last || boxesSrc !== src.value) return;
    const box = boxes[editing.j];
    if (!box) return;
    const cur = src.value;
    editing.last = html;
    setSource(cur.slice(0, box.start) + html + cur.slice(box.end), { kind: "text:" + editing.j, fold: true, quiet: true });
  }

  /** Commits and leaves the text box. `dropping` means the preview is being replaced anyway. */
  function finishEdit(dropping: boolean): void {
    if (!editing) return;
    if (!dropping) commitEdit();
    const el = editing.el;
    editing = null;
    try {
      el.removeEventListener("input", onEditInput);
      el.removeEventListener("blur", onEditBlur);
      el.removeAttribute("contenteditable");
      el.removeAttribute("data-dr-editing");
      el.removeAttribute("spellcheck");
    } catch (e) {}
    root.classList.remove("is-editing");
    $("dh-hint").textContent = "double-click text on the slide to edit it";
    if (previewStale && !dropping) host.reload();
  }

  // While a text box is being edited, the deck never hears what is typed or
  // clicked in it, so Space types a space instead of turning the slide.
  function guardKeys(e: any): void {
    if (!editing || !editing.el.contains(e.target)) return;
    e.stopPropagation();
    if (e.type !== "keydown" || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape" || e.key === "Tab" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      const el = editing.el;
      finishEdit(false);
      try { el.blur(); } catch (err) {}
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      try { editing.el.ownerDocument.execCommand("insertLineBreak"); } catch (err) {}
    }
  }

  function guardPointer(e: any): void {
    if (!editing) return;
    if (editing.el.contains(e.target)) { e.stopPropagation(); return; }
    if (e.type === "pointerdown" || e.type === "mousedown" || e.type === "touchstart") finishEdit(false);
  }

  function onEditPaste(e: any): void {
    if (!editing || !editing.el.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const text = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    try { editing.el.ownerDocument.execCommand("insertText", false, text); } catch (err) {}
  }

  // ── Pointer: select, drag to reorder ───────────────────────────────────

  let drag: any = null;

  function itemAt(e: any): any {
    const el = e.target && e.target.closest ? e.target.closest(".rs") : null;
    return el && el.__drItem ? el.__drItem : null;
  }

  function dropIndex(x: number, y: number): number {
    for (let k = 0; k < items.length; k++) {
      const r = items[k].el.getBoundingClientRect();
      if (sorter) {
        if (y < r.top) return k;
        if (y <= r.bottom && x < r.left + r.width / 2) return k;
      } else if (y < r.top + r.height / 2) {
        return k;
      }
    }
    return items.length;
  }

  function showDrop(d: number): void {
    if (!items.length) return;
    const box = rail.getBoundingClientRect();
    const r = items[Math.min(d, items.length - 1)].el.getBoundingClientRect();
    const end = d >= items.length;
    dropLine.classList.add("is-on");
    if (sorter) {
      const x = (end ? r.right + 9 : r.left - 9) - box.left + rail.scrollLeft;
      dropLine.style.cssText = "left:" + (x - 1.5) + "px;top:" + (r.top - box.top + rail.scrollTop) + "px;width:3px;height:" + r.height + "px";
    } else {
      const y = (end ? r.bottom + 5 : r.top - 5) - box.top + rail.scrollTop;
      dropLine.style.cssText = "left:" + (r.left - box.left + 20) + "px;top:" + (y - 1.5) + "px;height:3px;width:" + (r.width - 20) + "px";
    }
  }

  function autoScroll(): void {
    if (!drag || !drag.started) return;
    const box = rail.getBoundingClientRect();
    const edge = 36;
    let v = 0;
    if (drag.y < box.top + edge) v = -Math.ceil((box.top + edge - drag.y) / 3);
    else if (drag.y > box.bottom - edge) v = Math.ceil((drag.y - (box.bottom - edge)) / 3);
    if (v) {
      rail.scrollTop += v;
      drag.to = dropIndex(drag.x, drag.y);
      showDrop(drag.to);
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(commit: boolean): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    try { rail.releasePointerCapture(d.id); } catch (e) {}
    dropLine.classList.remove("is-on");
    ghost.classList.remove("is-on");
    items.forEach(function (it) { it.el.classList.remove("is-dragging"); });
    if (!d.started) {
      if (d.then === "toggle") toggleSel(d.k);
      else if (d.then === "only") selectOnly(d.k);
      show(sel.cur);
      return;
    }
    if (commit && d.to >= 0) apply(S.move(model, selected(), d.to));
  }

  rail.addEventListener("pointerdown", function (e: any) {
    if (e.button !== 0) return;
    closeMenus();
    rail.focus({ preventScroll: true });
    const it = itemAt(e);
    if (!it || !count()) return;
    const k = it.k;
    let then = "";
    if (e.shiftKey) selectRange(k);
    else if (e.ctrlKey || e.metaKey) then = "toggle";
    else if (!sel.set[k]) selectOnly(k);
    else then = "only";
    paintItems();
    drag = { id: e.pointerId, k, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, started: false, to: -1, then, raf: 0 };
    try { rail.setPointerCapture(e.pointerId); } catch (err) {}
  });

  rail.addEventListener("pointermove", function (e: any) {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.started) {
      if (Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) < 6) return;
      drag.started = true;
      if (!sel.set[drag.k]) selectOnly(drag.k);
      paintItems();
      const s = selected();
      s.forEach(function (k) { if (items[k]) items[k].el.classList.add("is-dragging"); });
      ghost.textContent = s.length > 1 ? s.length + " slides" : "slide " + (s[0] + 1);
      ghost.classList.add("is-on");
      drag.raf = requestAnimationFrame(autoScroll);
    }
    ghost.style.left = drag.x + 14 + "px";
    ghost.style.top = drag.y + 12 + "px";
    drag.to = dropIndex(drag.x, drag.y);
    showDrop(drag.to);
  });

  rail.addEventListener("pointerup", function () { endDrag(true); });
  rail.addEventListener("pointercancel", function () { endDrag(false); });
  rail.addEventListener("lostpointercapture", function () { if (drag && drag.started) endDrag(true); });

  rail.addEventListener("dblclick", function (e: any) {
    // Pointer capture retargets the click to the rail itself, so look under the pointer.
    const it = itemAt({ target: doc.elementFromPoint(e.clientX, e.clientY) });
    if (it && sorter) { selectOnly(it.k); setView("normal"); }
  });

  rail.addEventListener("contextmenu", function (e: any) {
    e.preventDefault();
    if (!count()) return;
    const it = itemAt(e);
    if (it && !sel.set[it.k]) { selectOnly(it.k); show(it.k); }
    rail.focus({ preventScroll: true });
    openContext(e.clientX, e.clientY, !!it);
  });

  // ── Keyboard ───────────────────────────────────────────────────────────

  function columns(): number {
    if (!sorter || items.length < 2) return 1;
    const top = items[0].el.getBoundingClientRect().top;
    let c = 0;
    while (c < items.length && Math.abs(items[c].el.getBoundingClientRect().top - top) < 4) c++;
    return Math.max(1, c);
  }

  rail.addEventListener("keydown", function (e: any) {
    if (e.isComposing || !count()) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const lower = (k || "").toLowerCase();
    const cols = columns();
    let done = true;
    if (mod && !e.altKey && (k === "ArrowUp" || k === "ArrowDown")) {
      if (e.shiftKey) moveTo(k === "ArrowUp" ? -1 : 1); else moveBy(k === "ArrowUp" ? -1 : 1);
    } else if (sorter && mod && (k === "ArrowLeft" || k === "ArrowRight")) {
      moveBy(k === "ArrowLeft" ? -1 : 1);
    } else if (!mod && (k === "ArrowDown" || k === "ArrowUp" || k === "ArrowLeft" || k === "ArrowRight")) {
      const d = k === "ArrowDown" ? cols : k === "ArrowUp" ? -cols : k === "ArrowRight" ? 1 : -1;
      step(d, e.shiftKey);
    } else if (!mod && (k === "PageDown" || k === "PageUp")) {
      step(k === "PageDown" ? 1 : -1, e.shiftKey);
    } else if (!mod && (k === "Home" || k === "End")) {
      const to = k === "Home" ? 0 : count() - 1;
      if (e.shiftKey) selectRange(to); else selectOnly(to);
      show(to);
    } else if (!mod && (k === "Delete" || k === "Backspace")) {
      remove();
    } else if (!mod && k === "Enter") {
      if (sorter) setView("normal"); else newSlide();
    } else if (mod && lower === "a") {
      sel.set = {};
      for (let i = 0; i < count(); i++) sel.set[i] = true;
      paintItems();
    } else if (mod && lower === "d" && !e.shiftKey) {
      duplicate();
    } else if (mod && (lower === "c" || lower === "x") && !e.shiftKey) {
      copy(lower === "x");
    } else if (mod && lower === "z" && !e.shiftKey) {
      undo();
    } else if (mod && (lower === "y" || (lower === "z" && e.shiftKey))) {
      redo();
    } else if (k === "F5" && e.shiftKey) {
      presentFrom();
    } else if (k === "ContextMenu" || (k === "F10" && e.shiftKey)) {
      const r = items[sel.cur] ? items[sel.cur].el.getBoundingClientRect() : rail.getBoundingClientRect();
      openContext(r.left + 30, r.top + 20, true);
    } else if (k === "Escape" && sorter) {
      setView("normal");
    } else {
      done = false;
    }
    if (done) { e.preventDefault(); e.stopPropagation(); }
  });

  rail.addEventListener("paste", function (e: any) {
    e.preventDefault();
    paste((e.clipboardData && e.clipboardData.getData("text/plain")) || "");
  });

  // Shortcuts that work wherever the person is in an HTML deck.
  doc.addEventListener("keydown", function (e: any) {
    if (!host.isHtml() || !count() || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key || "").toLowerCase() === "m") {
      e.preventDefault();
      e.stopPropagation();
      newSlide();
    } else if (mod && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      presentFrom();
    }
  }, true);

  // ── Menus ──────────────────────────────────────────────────────────────

  let menuItems: any[] = [];
  let menuSel = -1;

  function closeMenus(): void {
    menu.classList.remove("is-on");
    newMenu.classList.remove("is-on");
    newMenu.textContent = "";
    $("dh-more").setAttribute("aria-expanded", "false");
  }

  function place(el: any, x: number, y: number): void {
    el.style.left = "0px";
    el.style.top = "0px";
    el.classList.add("is-on");
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + "px";
    el.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + "px";
  }

  function openContext(x: number, y: number, onSlide: boolean): void {
    closeMenus();
    const n = count(), s = selected();
    const many = s.length > 1;
    const first = s[0], last = s[s.length - 1];
    const allHidden = s.every(function (k) { return model.slides[k] && model.slides[k].hidden; });
    const rows: any[] = onSlide ? [
      ["New slide", "Ctrl M", function () { newSlide(); }],
      [many ? "Duplicate slides" : "Duplicate slide", "Ctrl D", duplicate],
      [many ? "Delete slides" : "Delete slide", "Del", remove, s.length >= n],
      null,
      ["Cut", "Ctrl X", function () { copy(true); }, s.length >= n],
      ["Copy", "Ctrl C", function () { copy(false); }],
      ["Paste", "Ctrl V", pasteFromMenu],
      null,
      [allHidden ? (many ? "Show slides" : "Show slide") : (many ? "Hide slides" : "Hide slide"), "", toggleHidden],
      null,
      ["Move up", "Ctrl ↑", function () { moveBy(-1); }, first <= 0],
      ["Move down", "Ctrl ↓", function () { moveBy(1); }, last >= n - 1],
      ["Move to beginning", "Ctrl Shift ↑", function () { moveTo(-1); }, last === s.length - 1],
      ["Move to end", "Ctrl Shift ↓", function () { moveTo(1); }, first === n - s.length],
      null,
      ["Present from this slide", "Ctrl Shift Enter", presentFrom],
      ["Show in source", "", function () { reveal(sel.cur, true); }],
    ] : [
      ["New slide", "Ctrl M", function () { newSlide(); }],
      ["Paste", "Ctrl V", pasteFromMenu],
    ];
    if (onSlide && host.chat) rows.push(["Write a new slide with Claude…", "", function () { openNewMenu(true); }]);
    menu.textContent = "";
    menuItems = [];
    menuSel = -1;
    rows.forEach(function (row) {
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
      const label = doc.createElement("span");
      label.textContent = row[0];
      b.appendChild(label);
      if (row[1]) {
        const kbd = doc.createElement("kbd");
        kbd.textContent = cmd(row[1]);
        b.appendChild(kbd);
      }
      b.addEventListener("click", function () {
        closeMenus();
        rail.focus({ preventScroll: true });
        row[2]();
      });
      menu.appendChild(b);
      if (!b.disabled) menuItems.push(b);
    });
    place(menu, x, y);
    menu.focus({ preventScroll: true });
  }

  menu.addEventListener("keydown", function (e: any) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!menuItems.length) return;
      menuSel = (menuSel + (e.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems.forEach(function (b, i) { b.classList.toggle("is-sel", i === menuSel); });
      menuItems[menuSel].focus({ preventScroll: true });
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenus();
      rail.focus({ preventScroll: true });
    }
    e.stopPropagation();
  });

  /** PowerPoint's New Slide gallery: blank, then every design the deck has. */
  function openNewMenu(withClaude: boolean): void {
    closeMenus();
    if (!count()) return;
    const m = sync();
    const k = sel.cur;
    const title = doc.createElement("div");
    title.className = "nl-title";
    title.textContent = "new slide after slide " + (after());
    newMenu.appendChild(title);
    const grid = doc.createElement("div");
    grid.className = "nl-grid";
    newMenu.appendChild(grid);
    const options = [{ name: "Blank", text: S.blank(m, k), ref: k }].concat(
      S.layouts(m).map(function (l: any) { return { name: (l.from + 1) + " · " + l.name, text: l.text, ref: l.from }; })
    );
    options.forEach(function (o: any) {
      const b = doc.createElement("button");
      b.className = "nl-item";
      b.title = o.name === "Blank" ? "The deck's slide wrapper with an empty title and body" : "The design of slide " + o.name;
      const thumb = doc.createElement("span");
      thumb.className = "nl-thumb";
      const name = doc.createElement("span");
      name.className = "nl-name";
      name.textContent = o.name;
      b.appendChild(thumb);
      b.appendChild(name);
      b.addEventListener("click", function () {
        closeMenus();
        rail.focus({ preventScroll: true });
        newSlide(o.text);
      });
      grid.appendChild(b);
      thumb.appendChild(frameFor(S.isolate(m, o.ref, o.text), function (f: any) { f.classList.remove("is-loading"); }));
    });
    if (host.chat) {
      const box = doc.createElement("div");
      box.className = "nl-claude";
      box.innerHTML = '<div class="nl-title">or describe it, and Claude writes it in this deck\'s style</div>' +
        '<textarea placeholder="e.g. a comparison of the three approaches, with a short takeaway"></textarea>' +
        '<div class="nl-row"><span>Goes in after slide ' + (k + 1) + ". The chat panel shows the work.</span>" +
        '<button class="btn btn--primary">write</button></div>';
      newMenu.appendChild(box);
      const ta = box.querySelector("textarea");
      const go = function () {
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        closeMenus();
        writeWithClaude(text);
      };
      box.querySelector("button").addEventListener("click", go);
      ta.addEventListener("keydown", function (e: any) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); }
      });
    }
    const btn = $("dh-more").getBoundingClientRect();
    place(newMenu, btn.left - 160, btn.bottom + 6);
    $("dh-more").setAttribute("aria-expanded", "true");
    const w = (newMenu.querySelector(".nl-thumb") || { clientWidth: 0 }).clientWidth;
    Array.prototype.slice.call(newMenu.querySelectorAll(".nl-thumb")).forEach(function (t: any) {
      if (w) t.style.setProperty("--ts", String(w / THUMB_W));
    });
    if (withClaude && host.chat) {
      const ta = newMenu.querySelector(".nl-claude textarea");
      ta.focus();
      ta.scrollIntoView({ block: "nearest" });
    } else {
      const firstBtn = newMenu.querySelector(".nl-item");
      if (firstBtn) firstBtn.focus({ preventScroll: true });
    }
  }

  newMenu.addEventListener("keydown", function (e: any) {
    if (e.key === "Escape") { e.preventDefault(); closeMenus(); rail.focus({ preventScroll: true }); }
    e.stopPropagation();
  });

  doc.addEventListener("pointerdown", function (e: any) {
    if (menu.contains(e.target) || newMenu.contains(e.target) || e.target === $("dh-more")) return;
    if (menu.classList.contains("is-on") || newMenu.classList.contains("is-on")) closeMenus();
  }, true);
  window.addEventListener("blur", function () { if (menu.classList.contains("is-on")) closeMenus(); });
  window.addEventListener("resize", function () { closeMenus(); layoutThumbs(); });

  // ── Header and views ───────────────────────────────────────────────────

  function setView(next: string): void {
    sorter = next === "sorter";
    host.set(KEY.view, sorter ? "sorter" : "normal");
    root.classList.toggle("is-sorter", sorter);
    $("dh-normal").classList.toggle("is-on", !sorter);
    $("dh-sorter").classList.toggle("is-on", sorter);
    host.layout();
    layoutThumbs();
    scrollRailTo(sel.cur);
    if (!sorter) { paintItems(); drive(); }
    rail.focus({ preventScroll: true });
  }

  function setRail(on: boolean): void {
    railOn = on;
    host.set(KEY.rail, on ? "1" : "0");
    root.classList.toggle("rail-off", !on);
    $("dh-rail").setAttribute("aria-pressed", on ? "true" : "false");
    layoutThumbs();
  }

  function setNotes(on: boolean): void {
    notesOn = on;
    host.set(KEY.notes, on ? "1" : "0");
    root.classList.toggle("notes-on", on);
    $("dh-notes").setAttribute("aria-pressed", on ? "true" : "false");
    if (on) loadNotes(true);
  }

  Array.prototype.slice.call(root.querySelectorAll("#doc-head [title]")).forEach(function (el: any) { el.title = cmd(el.title); });
  $("dh-rail").addEventListener("click", function () { setRail(!railOn); });
  $("dh-notes").addEventListener("click", function () { setNotes(!notesOn); });
  $("dh-normal").addEventListener("click", function () { setView("normal"); });
  $("dh-sorter").addEventListener("click", function () { setView("sorter"); });
  $("dh-prev").addEventListener("click", function () { step(-1, false); });
  $("dh-next").addEventListener("click", function () { step(1, false); });
  $("dh-new").addEventListener("click", function () { newSlide(); });
  $("dh-more").addEventListener("click", function () {
    if (newMenu.classList.contains("is-on")) closeMenus(); else openNewMenu(false);
  });
  $("dh-from").addEventListener("click", presentFrom);
  root.classList.toggle("is-sorter", sorter);
  $("dh-normal").classList.toggle("is-on", !sorter);
  $("dh-sorter").classList.toggle("is-on", sorter);
  setRail(railOn);
  setNotes(notesOn);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(layoutThumbs).observe(rail);

  // ── What the editor calls ──────────────────────────────────────────────

  return {
    previewHtml,
    count,
    current: function (): number { return sel.cur; },
    /** Each slide's place in `text` (the source, by default), for the chat. */
    spans: function (text?: string): any[] {
      const m = text === undefined || text === src.value ? sync() : S.model(text);
      return m.slides.map(function (s: any) {
        return {
          start: s.start, end: s.end, hidden: s.hidden,
          title: (s.comment && s.comment.label) || s.title || "",
          inner: [s.core.openEnd, s.core.closeStart],
        };
      });
    },
    /** Shows slide k, as a click on its thumbnail would. */
    go: function (k: number): void {
      if (k < 0 || k >= count()) return;
      selectOnly(k);
      show(k);
    },
    /** Pulses these slides' thumbnails: what Claude just changed. */
    flash: function (ks: number[]): void {
      ks.forEach(function (k) {
        const it = items[k];
        if (!it) return;
        it.el.classList.remove("is-flash");
        void it.el.offsetWidth;
        it.el.classList.add("is-flash");
        setTimeout(function () { it.el.classList.remove("is-flash"); }, 2600);
      });
    },
    /** The preview's element tags, or null while the preview is behind the source. */
    inspectMap: function (): any {
      if (previewPending || !tagged || tagged.src !== src.value) return null;
      if (!tagged.view) {
        const m = tagged.model;
        tagged.view = { root: m.root, nodes: tagged.nodes, slideAt: function (pos: number): number { return S.slideAt(m, pos); } };
      }
      return tagged.view;
    },
    layout: layoutThumbs,
    step: function (d: number): void { if (count()) step(d, false); },
    /** The person typed in the source. */
    edited: function (): void {
      clearTimeout(editedTimer);
      previewPending = true;
      stopFollowing();
      editedTimer = setTimeout(function () { sync(); render(); }, 180);
    },
    /** The source caret moved: follow it to its slide. */
    caretMoved: function (): void {
      if (doc.activeElement !== src || !count()) return;
      const k = S.slideAt(model, src.selectionStart);
      if (k < 0 || k === sel.cur) return;
      selectOnly(k);
      paintItems();
      paintHead();
      loadNotes(false);
      scrollRailTo(k);
      drive();
    },
    /** New content from disk — Claude's edit, or another editor's — kept undoable. */
    external: function (content: string): void {
      finishEdit(true);
      const before = count();
      if (src.value) remember("external", false);
      write(content);
      sync();
      if (expectNewAt >= 0 && count() > before) selectOnly(Math.min(expectNewAt, count() - 1));
      expectNewAt = -1;
      sourceChanged({ nosave: true });
      render();
    },
    /** A different document was opened. */
    reset: function (): void {
      finishEdit(true);
      hist.undo.length = 0;
      hist.redo.length = 0;
      hist.kind = "";
      selectOnly(0);
      modelSrc = null;
      sync();
      notesFor = -1;
      render();
    },
    busy: function (on: boolean): void {
      if (on) finishEdit(false);
      busyNow = on;
      root.classList.toggle("is-busy", on);
      notesInput.readOnly = on;
    },
    /** Writes notes or slide text still waiting on their debounce, since Claude reads the disk. */
    flush: function (): void {
      if (noteTimer) commitNote();
      if (editing) commitEdit();
    },
    /** "This slide", for Claude. */
    context: function (): string {
      const n = count();
      if (!n) return "";
      const s = model.slides[sel.cur];
      const name = (s.comment && s.comment.label) || s.title;
      const many = selected();
      return "Slide " + (sel.cur + 1) + " of " + n + " is selected in the slide panel" +
        (name ? ' ("' + name + '")' : "") + "." +
        (many.length > 1 ? " Slides " + many.map(function (k) { return k + 1; }).join(", ") + " are selected." : "") +
        (s.hidden ? " It is a hidden slide, wrapped in <template " + S.HIDDEN_ATTR + ">." : "");
    },
  };
}

/** Defines `deckrunSlidePanel(DRSlides, host)` on the page. */
export const SLIDE_PANEL_RUNTIME = `window.deckrunSlidePanel = ${slidePanel.toString()};`;
