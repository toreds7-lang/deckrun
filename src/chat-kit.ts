/**
 * The chat panel's bookkeeping, apart from the page: what "this" means when
 * the person asks for a change, the slash commands, the choices Claude
 * offers when it asks back, and which slides a turn changed.
 *
 * "This" is the most specific thing the person has singled out: code
 * selected in the editor, text selected on the slide, or the element under
 * the caret (where an inspector pick leaves it), and failing those, the slide
 * the preview shows. It goes to Claude as a short description with line
 * numbers and the slide's own source, so Claude reads only that range rather
 * than counting its way through the whole file.
 *
 * Shipped to the editor through `toString()`, like html-slides: no imports,
 * no references outside the factory, and never a literal comment opener or
 * script tag.
 */

/** A slide's place in the source. `inner` is the slide element's content, for HTML. */
export interface ChatSpan {
  start: number;
  end: number;
  title?: string;
  hidden?: boolean;
  inner?: [number, number];
}

/** Something narrower than the slide that the person singled out. */
export interface ChatFocus {
  how: "code" | "text" | "element";
  /** Its source range; -1 when selected text could not be traced to the source. */
  start: number;
  end: number;
  /** An element label such as `h2.title`. */
  label?: string;
  /** The text selected on the slide. */
  text?: string;
}

export interface ChatTargetInput {
  file: string;
  text: string;
  scope: "slide" | "deck";
  slides: ChatSpan[];
  current: number;
  focus?: ChatFocus | null;
  /** A document that is not a deck: the words the preview is showing. */
  shown?: string;
  /** The message whose changes the person undid since Claude's last reply. */
  reverted?: string | null;
  /** A picture of the slide as it renders goes with the message (/look). */
  look?: boolean;
}

export interface ChatTarget {
  /** For Claude, inside `<deckrun-context>`. */
  context: string;
  /** For the person, under their message: `slide 5 · h2.title`. */
  tag: string;
}

export interface ChatCommand {
  name: string;
  args: string;
  help: string;
}

export interface ChatCommandCall {
  name: string;
  arg: string;
  /** Every command the typed name could be; one means it is known. */
  matches: string[];
}

export interface ChatModel {
  name: string;
  help: string;
}

/** One row of the slash menu: a command, or an argument for one. */
export interface ChatMenuItem {
  label: string;
  hint: string;
  help: string;
  /** What Enter (or a click) puts in the input. */
  value: string;
  /** Enter runs it at once, rather than waiting for more words. */
  run: boolean;
  /** What Tab puts in the input: the completion, ready for more words. */
  fill: string;
}

export interface ChatCompleteData {
  slides?: { title?: string; hidden?: boolean }[];
  /** The model chosen with /model, or "" for Claude Code's default. */
  model?: string;
}

export interface ChatChanges {
  /** Slides, by their index after the turn. */
  changed: number[];
  added: number[];
  removed: number;
  /** Something before the first slide or after the last changed: styles, scripts, the head. */
  outside: boolean;
}

export interface ChatKit {
  COMMANDS: ChatCommand[];
  MODELS: ChatModel[];
  lineOf(text: string, pos: number): number;
  shorten(src: string): string;
  latin(s: string): string;
  target(input: ChatTargetInput): ChatTarget;
  complete(input: string, data?: ChatCompleteData): ChatMenuItem[];
  hint(input: string): ChatCommand | null;
  command(input: string): ChatCommandCall | null;
  visible(raw: string): string;
  choices(raw: string): { text: string; choices: string[] };
  changes(before: string, beforeSpans: ChatSpan[], after: string, afterSpans: ChatSpan[]): ChatChanges;
}

export function chatKit(): ChatKit {
  // A slide's source goes along when it is no longer than this; past it,
  // only the line range, and Claude reads what it needs.
  const SLIDE_MAX = 5000;
  const FOCUS_MAX = 2000;

  const COMMANDS: ChatCommand[] = [
    { name: "slide", args: "<n> [request]", help: "Go to slide n; anything after the number is about that slide" },
    { name: "look", args: "[request]", help: "Send Claude a picture of this slide as it renders" },
    { name: "deck", args: "<request>", help: "Ask about the whole deck instead of this slide" },
    { name: "undo", args: "", help: "Undo Claude's last change to the file" },
    { name: "model", args: "[name] [request]", help: "Pick the model; with a request, for that message only" },
    { name: "context", args: "", help: "Show what Claude will take 'this' to mean" },
    { name: "clear", args: "", help: "Start a new chat" },
    { name: "stop", args: "", help: "Stop Claude mid-turn" },
    { name: "help", args: "", help: "List these commands" },
  ];

  // Claude Code's aliases, each for the latest model of its family.
  const MODELS: ChatModel[] = [
    { name: "default", help: "Whatever Claude Code is set to use" },
    { name: "fable", help: "Claude Fable" },
    { name: "opus", help: "Claude Opus" },
    { name: "sonnet", help: "Claude Sonnet: quicker" },
    { name: "haiku", help: "Claude Haiku: quickest, for small fixes" },
  ];

  // The keys of the standard Korean (2-beolsik) layout, so a command typed
  // with the Korean input method still on (/ㅡㅐㅇ디) reads as /model.
  const JAMO_KEYS: Record<string, string> = {
    "ㄱ": "r", "ㄲ": "r", "ㄳ": "rt", "ㄴ": "s", "ㄵ": "sw", "ㄶ": "sg", "ㄷ": "e", "ㄸ": "e", "ㄹ": "f",
    "ㄺ": "fr", "ㄻ": "fa", "ㄼ": "fq", "ㄽ": "ft", "ㄾ": "fx", "ㄿ": "fv", "ㅀ": "fg", "ㅁ": "a", "ㅂ": "q",
    "ㅃ": "q", "ㅄ": "qt", "ㅅ": "t", "ㅆ": "t", "ㅇ": "d", "ㅈ": "w", "ㅉ": "w", "ㅊ": "c", "ㅋ": "z",
    "ㅌ": "x", "ㅍ": "v", "ㅎ": "g", "ㅏ": "k", "ㅐ": "o", "ㅑ": "i", "ㅒ": "o", "ㅓ": "j", "ㅔ": "p",
    "ㅕ": "u", "ㅖ": "p", "ㅗ": "h", "ㅘ": "hk", "ㅙ": "ho", "ㅚ": "hl", "ㅛ": "y", "ㅜ": "n", "ㅝ": "nj",
    "ㅞ": "np", "ㅟ": "nl", "ㅠ": "b", "ㅡ": "m", "ㅢ": "ml", "ㅣ": "l",
  };
  const LEADS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const TAILS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  const HANGUL = /[ㄱ-ㆎ가-힣]/;

  /** Hangul back to the Latin keys that typed it; anything else as it was. */
  function latin(s: string): string {
    let out = "";
    for (const ch of s) {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code >= 0 && code < 11172) {
        const tail = TAILS.charAt(code % 28);
        out += JAMO_KEYS[LEADS.charAt(Math.floor(code / 588))] + JAMO_KEYS[VOWELS.charAt(Math.floor((code % 588) / 28))] +
          (tail === " " ? "" : JAMO_KEYS[tail]);
      } else {
        out += JAMO_KEYS[ch] || ch;
      }
    }
    return out;
  }

  /** 1-based. */
  function lineOf(text: string, pos: number): number {
    let n = 1;
    const end = Math.min(pos, text.length);
    for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  }

  function lines(text: string, a: number, b: number): string {
    const x = lineOf(text, a), y = lineOf(text, Math.max(a, b - 1));
    return x === y ? "line " + x : "lines " + x + "-" + y;
  }

  function clip(s: string, max: number): string {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /** An embedded image is kilobytes of base64 that says nothing; its length stays as a hint. */
  function shorten(src: string): string {
    return src.replace(/data:([\w.+\/-]*)((?:;[\w=.-]+)*),[^"'\s)<>]{200,}/g, function (m: string, mime: string, params: string) {
      return "data:" + (mime || "") + (params || "") + ",…(" + Math.max(1, Math.round(m.length / 1024)) + " KB, shortened here)";
    });
  }

  function target(o: ChatTargetInput): ChatTarget {
    const out: string[] = [];
    const n = o.slides.length;
    const k = o.current;
    const s = k >= 0 && k < n ? o.slides[k] : null;
    const f = o.focus || null;

    if (o.reverted) {
      out.push("Since your last reply they undid the changes from their message '" + clip(o.reverted, 80) +
        "', so the file is back to how it was before it. Re-read before editing.");
    }

    if (o.scope === "deck") {
      out.push("Target: the whole deck" + (n ? ", all " + n + " slides" : "") + " (they asked with /deck)." +
        (s ? " The preview is on slide " + (k + 1) + "." : ""));
      return { context: out.join("\n"), tag: "whole deck" };
    }

    let tag = "";
    if (s) {
      out.push("Target: slide " + (k + 1) + " of " + n + (s.title ? " ('" + clip(s.title, 60) + "')" : "") +
        ", " + lines(o.text, s.start, s.end) + " of " + o.file + "." +
        (s.hidden ? " It is a hidden slide, wrapped in <template data-deckrun-hidden>." : ""));
      tag = "slide " + (k + 1);
    } else if (o.shown) {
      out.push("The preview is showing the part of " + o.file + " that reads: '" + clip(o.shown, 300) + "'.");
    }

    if (o.look && s) {
      out.push("Attached: a picture of slide " + (k + 1) + " as it renders at 1280x720. Judge the layout from it, not from the source alone.");
      tag += " · picture";
    }

    const traced = !!f && f.start >= 0 && f.end > f.start;
    if (f) {
      const where = traced ? lines(o.text, f.start, f.end) : "";
      if (f.how === "code") {
        out.push("Narrower: they selected " + where + " in the code editor.");
        tag += (tag ? " · " : "") + where;
      } else if (f.how === "text") {
        out.push("Narrower: they selected the text '" + clip(f.text || "", 200) + "' on the slide" +
          (traced ? ", inside <" + f.label + "> at " + where : "") + ".");
        tag += (tag ? " · " : "") + "'" + clip(f.text || "", 24) + "'";
      } else {
        out.push("Narrower: the <" + f.label + "> element at " + where + ", where they put the cursor or picked with the inspector.");
        tag += (tag ? " · " : "") + f.label;
      }
    }

    if (s) {
      const body = shorten(o.text.slice(s.start, s.end));
      if (body.length <= SLIDE_MAX) {
        out.push("", "Slide " + (k + 1) + " source (" + lines(o.text, s.start, s.end) + "):", body);
      }
      const inside = traced && f!.start >= s.start && f!.end <= s.end;
      if (traced && (!inside || body.length > SLIDE_MAX)) {
        const part = shorten(o.text.slice(f!.start, f!.end));
        if (part.length <= FOCUS_MAX) out.push("", "Narrower target source (" + lines(o.text, f!.start, f!.end) + "):", part);
      }
    } else if (traced) {
      const part = shorten(o.text.slice(f!.start, f!.end));
      if (part.length <= FOCUS_MAX) out.push("", "Narrower target source (" + lines(o.text, f!.start, f!.end) + "):", part);
    }

    return { context: out.join("\n"), tag };
  }

  // A command name as typed: Latin letters, or Hangul from the Korean input method.
  const NAME = "([a-z\\u3131-\\u318e\\uac00-\\ud7a3]*)";

  function matching(typed: string): ChatCommand[] {
    const p = latin(typed).toLowerCase();
    const exact = COMMANDS.filter(function (c) { return c.name === p; });
    return exact.length ? exact : COMMANDS.filter(function (c) { return c.name.indexOf(p) === 0; });
  }

  /**
   * The slash menu for what is in the input: commands while the name is
   * being typed, then the choices for its first word, where it has them —
   * the models for /model, the slides for /slide.
   *
   * As in Claude Code, Enter runs a command whose words are optional and
   * waits for the words a command needs; Tab only completes.
   */
  function complete(input: string, data?: ChatCompleteData): ChatMenuItem[] {
    const d = data || {};
    let m = new RegExp("^/" + NAME + "$", "i").exec(input);
    if (m) {
      return matching(m[1]).map(function (c) {
        const run = !c.args || c.args.charAt(0) === "[";
        const name = "/" + c.name;
        return { label: name, hint: c.args, help: c.help, value: run ? name : name + " ", run, fill: name + (c.args ? " " : "") };
      });
    }
    m = new RegExp("^/" + NAME + "\\s+(\\S*)$", "i").exec(input);
    const hits = m ? matching(m[1]) : [];
    if (!m || hits.length !== 1) return [];
    const arg = m[2];
    if (hits[0].name === "model") {
      const p = latin(arg).toLowerCase();
      const now = d.model || "default";
      return MODELS.filter(function (x) { return x.name.indexOf(p) === 0; }).map(function (x) {
        return { label: x.name, hint: x.name === now ? "current" : "", help: x.help, value: "/model " + x.name, run: true, fill: "/model " + x.name + " " };
      });
    }
    if (hits[0].name === "slide" && /^\d*$/.test(arg)) {
      const out: ChatMenuItem[] = [];
      (d.slides || []).forEach(function (s, i) {
        if (String(i + 1).indexOf(arg) !== 0) return;
        out.push({
          label: String(i + 1), hint: s.hidden ? "hidden" : "", help: s.title || "",
          value: "/slide " + (i + 1), run: true, fill: "/slide " + (i + 1) + " ",
        });
      });
      return out;
    }
    return [];
  }

  /** The command whose words are being typed, for a reminder of what it takes. */
  function hint(input: string): ChatCommand | null {
    const m = new RegExp("^/" + NAME + "\\s", "i").exec(input);
    const hits = m ? matching(m[1]) : [];
    return hits.length === 1 && hits[0].args ? hits[0] : null;
  }

  /** `/slide 3 tighten this` → slide, "3 tighten this". Null for a message that is not one. */
  function command(input: string): ChatCommandCall | null {
    const m = new RegExp("^/" + NAME.replace("*", "+") + "(?:\\s+([\\s\\S]*))?$", "i").exec(input.trim());
    if (!m) return null;
    const hits = matching(m[1]);
    // "/" and then Korean words is a message, not a command nobody has heard of.
    if (!hits.length && HANGUL.test(m[1])) return null;
    return {
      name: hits.length === 1 ? hits[0].name : latin(m[1]).toLowerCase(),
      arg: (m[2] || "").trim(),
      matches: hits.map(function (c) { return c.name; }),
    };
  }

  const OPEN = "<choices>";

  /** A reply as it streams: everything before the choices block, which becomes buttons at the end. */
  function visible(raw: string): string {
    let at = raw.toLowerCase().indexOf(OPEN);
    if (at < 0) {
      // The tag may be arriving a few characters at a time.
      const lt = raw.lastIndexOf("<");
      if (lt >= 0 && OPEN.indexOf(raw.slice(lt).toLowerCase()) === 0) at = lt;
    }
    return (at < 0 ? raw : raw.slice(0, at)).replace(/\s+$/, "");
  }

  /** The finished reply, and its choices: one per line inside <choices></choices>. */
  function choices(raw: string): { text: string; choices: string[] } {
    const m = /<choices>([\s\S]*?)(?:<\/choices>|$)/i.exec(raw);
    if (!m) return { text: raw.trim(), choices: [] };
    const list = m[1].split("\n")
      .map(function (l) { return l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim(); })
      .filter(Boolean)
      .slice(0, 6)
      .map(function (c) { return c.slice(0, 300); });
    return { text: (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim(), choices: list };
  }

  /**
   * Which slides a turn touched. Slides whose source is unchanged are
   * matched up in order (a longest common subsequence), so a slide added at
   * the front does not make every later one look changed; what is left
   * between two matches pairs up as changed, and the surplus is added or
   * removed.
   */
  function changes(before: string, bs: ChatSpan[], after: string, as: ChatSpan[]): ChatChanges {
    const A = bs.map(function (s) { return before.slice(s.start, s.end); });
    const B = as.map(function (s) { return after.slice(s.start, s.end); });
    const n = A.length, m = B.length;
    const L: number[][] = [];
    for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }

    const changed: number[] = [], added: number[] = [];
    let removed = 0, gapA = 0, gapB: number[] = [];
    function settle(): void {
      const pairs = Math.min(gapA, gapB.length);
      for (let x = 0; x < gapB.length; x++) (x < pairs ? changed : added).push(gapB[x]);
      removed += Math.max(0, gapA - gapB.length);
      gapA = 0;
      gapB = [];
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { settle(); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { gapB.push(j); j++; }
      else { gapA++; i++; }
    }
    settle();

    let outside: boolean;
    if (!n || !m) outside = !n && !m ? before !== after : false;
    else {
      outside = before.slice(0, bs[0].start) !== after.slice(0, as[0].start) ||
        before.slice(bs[n - 1].end) !== after.slice(as[m - 1].end);
    }
    return { changed, added, removed, outside };
  }

  return { COMMANDS, MODELS, lineOf, shorten, latin, target, complete, hint, command, visible, choices, changes };
}

/** Pasted into the editor, where it defines `DRChat`. */
export const CHAT_KIT_RUNTIME = `var DRChat = (${chatKit.toString()})();`;
